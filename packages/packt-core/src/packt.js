/**
 * @flow
 */
import path from 'path';
import type {
  MessageType,
} from './message-types';
import type {
  PacktOptions,
  PacktConfig,
  PerfStats,
  PerfStatsDict,
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
import {parseConfig} from './packt-config';
import {determineInitialWorkingSet} from './working-set';

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

    return determineInitialWorkingSet(config)
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
      resolvers: new ResolverChain(config),
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

      const cleanup = (err: ?Error) => {
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

      utils.resolvers.on('resolver_chain_message',(m: MessageType) => {
        switch (m.type) {
          case 'module_resolved': {
            timer.accumulate('resolvers',m.perfStats);
            const resolvedModule = m.resolvedModule;

            if (!m.importedByDeclaration) {
              state.dependencyGraph.bundleEntrypoint(
                resolvedModule,
                m.variants,
                m.resolvedParentModuleOrBundle
              );
            } else {
              state.dependencyGraph.imports(
                resolvedModule,
                m.resolvedParentModuleOrBundle,
                m.variants,
                m.importedByDeclaration
              );
            }

            state.contentMap.addIfNotPresent(
              resolvedModule,
              () => {
                const scopeId = state.scopeGenerator.getId(resolvedModule);
                utils.pool.processModule(resolvedModule, scopeId)
              }
            );
          }
          break;

          case 'module_resolver_error':
            cleanup(m.error);
            break;

          case 'idle':
            if (utils.pool.idle()) {
              cleanup();
            }
            break;
        }
      });

      utils.pool.on('worker_pool_message', (m: MessageType) => {
        switch (m.type) {
          case 'worker_error':
            cleanup(m.error);
            break;

          case 'module_content':
            buildStats[m.resolvedModule] = m.perfStats;
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
            break;

          case 'module_content_warning':
            cleanup(new errors.PacktContentError(
              m.handler,
              m.variants,
              m.error,
              m.resolvedModule
            ));
            break;

          case 'module_warning':
            this._reporter.onBuildWarning(
              m.resolvedModule,
              m.variants,
              m.warning
            );
            break;

          case 'module_export':
            state.dependencyGraph.exports(
              m.resolvedModule,
              m.variants,
              m.exportDeclaration
            );
            break;

          case 'module_import':
            utils.resolvers.resolve(
              m.importDeclaration.source,
              m.variants,
              {
                importDeclaration: m.importDeclaration,
              },
              {
                resolvedParentModule: m.resolvedModule,
              },
            );
            break;

          case 'module_generated_asset':
            state.dependencyGraph.addGenerated(
              m.resolvedModule,
              m.variants,
              m.assetName,
              m.outputPath
            );
            break;
            
          case 'idle':
            if (utils.resolvers.idle()) {
              cleanup();
            }
            break;
        }
      });

      for (let bundleName in workingSet.bundles) {
        const modules = workingSet.bundles[bundleName];
        modules.forEach((m) => {
          utils.resolvers.resolve(
            m.name,
            Object.keys(config.options),
            {
              bundleName,
            },
            {
              expectFolder: m.folder
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

      utils.pool.on('worker_pool_message', (m: MessageType) => {
        switch (m.type) {
          case 'bundle_content':
            bundlerTimer.accumulate(m.bundler,m.perfStats);
            bundleStats[m.bundleName] = m.perfStats;
            break;

          case 'bundle_content_error':
            cleanup(new errors.PacktBundleError(
              m.bundler,
              m.error,
              m.bundleName
            ));
            break;

          case 'bundle_warning':
            this._reporter.onBundleWarning(
              m.bundleName,
              m.variant,
              m.warning
            );
            break;

          case 'worker_error':
            cleanup(m.error);
            break;

          case 'idle':
            cleanup();
            break;
        }
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
        utils.pool.processBundle(
          pd.bundleName,
          pd.variant,
          { ...pd.data, assetMap },
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
