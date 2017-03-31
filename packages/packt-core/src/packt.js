/**
 * @flow
 */
'use strict';

import path from 'path';
import type {
  MessageType,
} from './message-types';
import type {
  PacktOptions,
  PacktConfig,
} from '../types';
import type {
  PerfStats,
  Reporter,
} from '../types';
import type {
  WorkingSet,
} from './working-set';
import {DependencyGraph} from './dependency-graph';
import WorkerPool from './worker-pool';
import ResolverChain from './resolver-chain';
import Timer from './timer';
import ContentMap from './content-map';
import {sortBundles} from './dependency-graph-sort';
import * as errors from './packt-errors';
import ScopeIdGenerator from './scope-id-generator';
import OutputPathUtils from './output-path-utils';
import {loadConfig} from './packt-config';

type BuildState = {
  contentMap: ContentMap,
  dependencyGraph: DependencyGraph,
  scopeGenerator: ScopeIdGenerator,
};

type BuildUtils = {
  pathUtils: OutputPathUtils,
  resolvers: ResolverChain,
  pool: WorkerPool,
};

type BuildParams = {
  workingSet: WorkingSet, 
  timer: Timer,
  config: PacktConfig,
  utils: BuildUtils,
  state: BuildState,
};

export default class Packt {
  _timer: Timer;
  _handlerTimer: Timer;
  _bundlerTimer: Timer;
  _reporter: Reporter;
  _options: PacktOptions;
  _config: ?PacktConfig;
  _utils: ?BuildUtils;
  _state: ?BuildState;

  constructor(
    workingDirectory: string,
    options: PacktOptions,
    reporter: Reporter
  ) {
    this._timer = new Timer();
    this._handlerTimer = new Timer();
    this._bundlerTimer = new Timer();
    this._reporter = reporter;

    this._options = Object.assign({},options);
    this._options.config = path.resolve(workingDirectory, options.config);

    const version = require('../package.json').version;
    this._reporter.onInit(version, this._options);
  }

  start(): Promise<Packt> {
    return this._loadConfig()
      .then((config) => {
        this._reporter.onLoadConfig(config);
        return this._createBuildUtils(config);
      })
      .then((utils) => {
        utils.pool.start();
        return this._loadBuildState(utils)
      }).then((state) => {
        return this;
      })
      .catch((err) => this._fatalError(err));
  }

  stop(): Promise<Packt> {
    return this._utils
      ? this._utils.pool.stop().then(() => this)
      : Promise.resolve(this);
  }

  build(): Promise<Packt> {
    const utils = this._utils;
    const state = this._state;
    const config = this._config;
    if (!utils || !state || !config) {
      return Promise.reject(new Error(
        'Packt build has not been initialized. Make sure to call Start before calling Build'
      ));
    }

    return this._determineWorkingSet(config)
      .then(workingSet => {
        this._reporter.onStartBuild();
        const params = {
          workingSet, 
          timer: new Timer(),
          config,
          utils,
          state
        };
        return this._buildModules(params).then(({
          buildStats, 
          handlerTimer
        }) => {
          return this._bundleModules(params).then(({
            bundleStats, 
            bundlerTimer
          }) => {
            this._reporter.onFinishBuild(
              {
                global: params.timer,
                handlers: handlerTimer,
                bundlers: bundlerTimer,
              },
              buildStats,
              bundleStats,
              state.dependencyGraph
            );
          });
        });
      })
      .then(() => this)
      .catch((err) => this._fatalError(err));
  }

  _fatalError(err: Error): Promise<Packt> {
    if (this._utils) {
      this._utils.pool.stop();
    }
    this._reporter.onError(err);
    return Promise.reject(err);
  }

  _loadConfig(): Promise<PacktConfig> {
    let json;
    try {
      json = require(this._options.config);
    } catch (ex) {
      if (ex.message === 'missing path') {
        return Promise.reject(new errors.PacktError(
          'No config file found at ' + this._options.config,
          ex
        ));
      } else {
        return Promise.reject(new errors.PacktError(
          'Unable to parse config file ' + this._options.config,
          ex
        ));
      }
    }
    return loadConfig(this._options.config, json);
  }

  _createBuildUtils(config: PacktConfig): Promise<BuildUtils> {
    return Promise.resolve({
      pathUtils: new OutputPathUtils(config),
      resolvers: new ResolverChain(
        config.workingDirectory,
        config.config.resolvers
      ),
      pool: new WorkerPool(config),
    });
  }

  _loadBuildState(utils: BuildUtils): Promise<BuildState> {
    let scopeGenerator;
    try {
      scopeGenerator = new ScopeIdGenerator(this._options.moduleScopes);
    } catch (ex) {
      return Promise.reject(new errors.PacktError(
        'Failed to load module scopes map at ' + this._options.moduleScopes,
        ex
      ));
    }

    // TODO load from cache configured in config
    // TODO need the dependency map here too
    // TODO should have one content map per dependency tree - lazy load
    // reset contentMap if config has changed as the hashes will need
    // to be recomputed.
    // if the tree requires changes
    return Promise.resolve({
      scopeGenerator,
      contentMap: new ContentMap(
        (c) => utils.pathUtils.generateHash(c)
      ),
      dependencyGraph: new DependencyGraph(),
    });
  }

  _determineWorkingSet(config: PacktConfig): Promise<WorkingSet> {
    // TODO determine files which changed from last build using filesystem
    // search or watchman if available. if empty, use config entrypoints as inputs
    //  also determine all the chunks where a changed input occurred, so once
    //  we've rebuilt the inputs, we can regenerate the output chunks

    const set: WorkingSet = {
      bundles: {},
      commonBundles: {},
    };

    try {
      for (let key in config.config.bundles) {
        const bundle = config.config.bundles[key];
        if (bundle.type === 'common') {
          continue;
        }
        if (bundle.commons) {
          for (let common in bundle.commons) {
            // if a changing bundle has a common module, then all the bundles
            // that also depend on that common module might also have to change
            const commonBundle = config.config.bundles[common];
            Object.keys(commonBundle.dependedBy).forEach(dep => {
              set.bundles[dep] = (set.bundles[dep] || []).map((m) =>
                typeof(m) === 'string' ? { name: m, folder: false } : m
              ) || [];
            });
            set.commonBundles[common] = true;
          }
        }
        if (bundle.requires) {
          set.bundles[key] = bundle.requires.map((m) =>
            typeof(m) === 'string' ? { name: m, folder: false } : m
          );
        }
      }
      return Promise.resolve(set);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  _buildModules({
    workingSet,
    timer,
    config,
    utils,
    state,
  }: BuildParams): Promise<{
    buildStats: PerfStatsDict,
    handlerTimer: Timer
  }> {
    return new Promise((resolve, reject) => {
      const updateReporter = setInterval(() => {
        this._reporter.onUpdateBuildStatus(utils.pool.status());
      },100);

      const start = Date.now();
      const buildStats: PerfStatsDict = {};
      const handlerTimer = new Timer();

      const cleanup = (err,result) => {
        timer.accumulate('build',{ 'modules': Date.now() - start });
        if (updateReporter) {
          clearInterval(updateReporter);
        }
        utils.pool.removeAllListeners();
        utils.resolvers.removeAllListeners();
        if (err) {
          reject(err);
        } else {
          resolve({
            buildStats,
            handlerTimer,
          });
        }
      };

      utils.resolvers.on(RESOLVED,(m) => {
        timer.accumulate('resolvers',m.perfStats);

        if (!m.context.imported) {
          state.dependencyGraph.entrypoint(
            m.resolvedModule,
            m.context.variants,
            m.context.bundle
          );
        } else {
          state.dependencyGraph.imports(
            m.resolvedParentModule,
            m.resolvedModule,
            m.context.variants,
            m.context.imported
          );
        }

        state.contentMap.addIfNotPresent(
          m.resolvedModule,
          () => {
            const scopeId = state.scopeGenerator.getId(m.resolvedModule);
            utils.pool.process(m.resolvedModule, scopeId)
          }
        );
      });
      utils.resolvers.on(RESOLVED_ERROR,(m) => {
        cleanup(m.error);
      });
      utils.resolvers.on(IDLE,() => {
        if (utils.pool.idle()) {
          cleanup();
        }
      });

      utils.pool.on(ERROR,(m) => {
        cleanup(m.error);
      });
      utils.pool.on(CONTENT,(m) => {
        buildStats[m.resolved] = m.perfStats;
        handlerTimer.accumulate(m.handler,m.perfStats);
        handlerTimer.accumulate(m.handler,{ modules: m.variants.length });

        state.dependencyGraph.setContentType(
          m.resolvedModule,
          m.variants,
          m.contentType
        );
        state.contentMap.setContent(
          m.resolvedModule,
          m.variants,
          m.content
        );
      });
      utils.pool.on(GENERATED,(m) => {
        state.dependencyGraph.addGenerated(
          m.resolvedModule,
          m.variants,
          m.assetName,
          m.outputPath
        );
      });
      utils.pool.on(WARNING,(m) => {
        this._reporter.onBuildWarning(
          m.resolvedModule,
          m.variants,
          m.warning
        );
      });
      utils.pool.on(CONTENT_ERROR,(m) => {
          error: new errors.PacktContentError(
            m.handler,
            m.variants,
            m.error,
            m.resolvedModule
          )
        cleanup(m.error);
      });
      utils.pool.on(EXPORT,(m) => {
        state.dependencyGraph.exportsSymbols(
          m.resolvedModule,
          m.variants,
          m.exported
        );
      });
      utils.pool.on(IMPORT,(m) => {
        utils.resolvers.resolve(
          m.imported.source,
          m.resolvedModule,
          false,
          {
            variants: m.variants,
            imported: m.imported,
          }
        );
      });
      utils.pool.on(IDLE,() => {
        if (utils.resolvers.idle()) {
          cleanup();
        }
      });

      for (let bundle in workingSet.bundles) {
        const modules = workingSet.bundles[bundle];
        modules.forEach((m) => {
          utils.resolvers.resolve(
            m.name,
            config.configFile,
            m.folder,
            {
              variants: Object.keys(config.config.options),
              bundle: bundle,
            }
          );
        });
      }
    });
  }

  _bundleModules({
    workingSet,
    timer,
    config,
    utils,
    state,
  }: BuildParams): Promise<{
    bundleStats: PerfStatsDict,
    bundlerTimer: Timer,
  }> {
    let start = Date.now();

    // TODO compute bundle belonging & symbol usage
    // update working set bundles with symbol usage related changes
    // THEN do bundle sort
    const bundles = sortBundles(
      state.dependencyGraph,
      config,
      workingSet
    );

    timer.accumulate('build',{ 'bundle-sort': Date.now() - start });

    return new Promise((resolve,reject) => {
      start = Date.now();
      const bundleStats: PerfStatsDict = {};
      const bundlerTimer = new Timer();

      const updateReporter = this._reporter ? setInterval(() => {
        this._reporter.onUpdateBuildStatus(utils.pool.status());
      },100) : null;

      const cleanup = (err,result) => {
        timer.accumulate('build',{ 'bundles': Date.now() - start });
        if (updateReporter) {
          clearInterval(updateReporter);
        }
        utils.pool.removeAllListeners();
        if (err) {
          reject(err);
        } else {
          resolve({
            bundleStats,
            bundlerTimer,
          });
        }
      };

      utils.pool.on(ERROR,(m) => {
        cleanup(m.error);
      });
      utils.pool.on(BUNDLE,(m) => {
        bundlerTimer.accumulate(m.bundler,m.perfStats);
        bundleStats[m.bundle] = m.perfStats;
      });
      utils.pool.on(WARNING,(m) => {
        this._reporter.onBundleWarning(
          m.bundleName,
          m.variant,
          m.warning
        );
      });
      utils.pool.on(BUNDLE_ERROR,(m) => {
          this.emit(messageTypes.BUNDLE_ERROR,{
            error: new errors.PacktBundleError(
              m.bundler,
              m.error,
              m.bundle
            )
          });
        cleanup(m.error);
      });
      utils.pool.on(IDLE,() => {
        cleanup();
      });

      const assetMap = {};
      const preparedData = [];
      for (let variant in bundles) {
        for (let bundleName in bundles[variant]) {
          const data = this._prepareBundleData(
            bundleName, 
            variant, 
            bundles[variant][bundleName],
            assetMap
          );
          // can't bundle yet because we need the complete
          // asset map in order to do replacements of asset paths
          // if required.
          if (data) {
            preparedData.push({
              data: data,
              bundleName: bundleName,
              variant, variant,
            });
          }
        }
      }

      for (let pd of preparedData) {
        utils.pool.bundle(
          pd.bundleName,
          pd.variant,
          Object.assign(pd.data, { assetMap: assetMap }),
          {}
        );
      }
    });
  }

  // TODO prepare bundle into a serializable object to pass
  // to the bundler
  // TODO get the list of bundles & match up with content.
  // any modules in this bundle which belong
  _prepareBundleData(bundleName, variant, bundleModules, assetMap) {

    for (let module of bundleModules) {
      for (let asset in module.generatedAssets) {
        assetMap[asset] = module.generatedAssets[asset].ouputPublicPath;
      }
    }
    // TODO need to deal with dynamically created bundles from
    // System.import etc.`
    const bundler = this._config.config.bundles[bundleName].bundler;
    if (!bundler) {
      return null;
    }

    const moduleMap = {};
    let dependentHashes = '';

    // TODO need to build moduleMap as part of dependency graph
    const modules = bundleModules.map(m => {
      moduleMap[m.module] = {
        exportsIdentifier: m.exportsIdentifier,
        exportsEsModule: m.exportsEsModule,
      };

      const entry =  this._contentMap.get(m.module, variant);
      dependentHashes += entry.hash;
      return {
        importAliases: Object.keys(m.importAliases).reduce((p,n) => {
          p[n] = m.importAliases[n].node.module;
          return p;
        },{}),
        resolvedModule: m.module,
        content: entry.content,
        contentHash: entry.hash,
        contentType: m.contentType,
      }
    });

    const paths = this._outputPathUtils.getBundlerOutputPaths(
      bundleName, 
      // the hash of a bundle must be deterministic based on the content
      // that makes up the module and the complete hash of the current
      // config. This allows us to determine all the output names of the 
      // bundles before computing the bundle content themselves
      this._outputPathUtils.generateHash(dependentHashes), 
      bundler, 
      variant
    );
    assetMap[paths.assetName] = paths.outputPublicPath;

    const result = {
      // TODO moduleMap needs to include *ALL modules - not just modules
      // in the current bundle
      moduleMap: moduleMap,
      modules: modules,
      bundler: bundler,
      outputPath: paths.outputPath,
      outputParentPath: paths.outputParentPath,
      outputPublicPath: paths.outputPublicPath,
      assetName: paths.assetName,
    };
    return result;
  }
}
