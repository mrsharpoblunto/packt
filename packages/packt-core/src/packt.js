/**
 * @flow
 */
import path from 'path';
import rimraf from 'rimraf';
import mkdirp from 'mkdirp';
import type {
  MessageType,
} from './message-types';
import type {
  WorkingSet,
} from './working-set';
import {
  DependencyNode,
  DependencyGraph,
} from './dependency-graph';
import WorkerPool from './worker-pool';
import ResolverChain from './resolver-chain';
import Timer from './timer';
import ContentMap from './content-map';
import AssetMap from './asset-map';
import type {ReadOnlyContentMapVariant} from './content-map';
import {generateBundleSets} from './generated-bundle-set';
import type {
  GeneratedBundleSet,
  GeneratedBundleData,
} from './generated-bundle-set';
import {
  generateBundleLookups,
  serializeBundle,
} from './bundle-utils';
import type {
  GeneratedBundleLookups,
  GeneratedBundleLookupVariant,
} from './bundle-utils';
import * as errors from 'packt-types';
import ScopeIdGenerator from './scope-id-generator';
import OutputPathHelpers from './output-path-helpers';
import {parseConfig} from './packt-config';
import {
  determineIncrementalWorkingSet,
  determineInitialWorkingSet,
} from './working-set';
import {getOrCreate} from './helpers';
import events from 'events';
import {
  type ChangeDetails,
}from './change-watcher';
import ChangeWatcher from './change-watcher';

type BuildState = {|
  contentMap: ContentMap,
  assetMap: AssetMap,
  dependencyGraph: DependencyGraph,
  scopeGenerator: ScopeIdGenerator,
  bundleSets: ?{ [variant: string]: GeneratedBundleSet },
  bundleLookups: ?GeneratedBundleLookups,
|};

type BuildUtils = {|
  pathHelpers: OutputPathHelpers,
  resolvers: ResolverChain,
  pool: WorkerPool,
|};

type BuildParams = {|
  workingSet: WorkingSet, 
  timer: Timer,
  config: PacktConfig,
  utils: BuildUtils,
  state: BuildState,
  bail: boolean,
|};

export default class Packt extends events.EventEmitter {
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
    super();
    this._timer = new Timer();
    this._handlerTimer = new Timer();
    this._bundlerTimer = new Timer();
    this._reporter = reporter;

    this._options = (({...options}): any);
    this._options.config = path.resolve(workingDirectory, options.config);

    const version = require('../package.json').version;
    this._reporter.onInit(version, this._options);
  }

  start(): Promise<Packt> {
    return this._loadConfig()
      .then((config) => {
        this._config = config;
        this._reporter.onLoadConfig(config);
        return this._createBuildUtils(config);
      })
      .then((utils) => {
        this._utils = utils;
        utils.pool.start();
        return this._loadBuildState(utils)
      }).then((state) => {
        this._state = state;
        this.emit('start');
        return this;
      })
      .catch((err) => this._fatalError(err));
  }

  stop(): Promise<Packt> {
    if (this._utils) {
      return this._utils.pool.stop().then(() => {
        this.emit('stop');
        return this;
      });
    } else {
      this.emit('stop');
      return Promise.resolve(this);
    }
  }

  build(): Promise<Packt> {
    return this._build(true);
  }

  watch() {
    const utils = this._utils;
    const state = this._state;
    const config = this._config;
    if (!utils || !state || !config) {
      return this._fatalError(new Error(
        'Packt build has not been initialized. Make sure to call start() before calling build()'
      ));
    }

    this._build(this._options.bail).then(() => {
      return new Promise((resolve, reject) => {
        const watcher = new ChangeWatcher(config);
        watcher.onChange((err: ?Error, changes?: Array<ChangeDetails>) => {
          if (err) {
            return reject(err);
          } else if (changes) {
            determineIncrementalWorkingSet(config, state.dependencyGraph, changes)
            .then((workingSet: ?WorkingSet) => {
              if (workingSet) {
                this.emit('buildStart');
                return this._doBuild(workingSet, this._options.bail);
              }
            })
            .then(() => {
              watcher.resume();
            })
            .catch((err) => reject(err));
          }
        });
      });
    })
    .catch((err) => this._fatalError(err));
  }

  _build(bail: boolean): Promise<Packt> {
    const utils = this._utils;
    const state = this._state;
    const config = this._config;
    if (!utils || !state || !config) {
      return this._fatalError(new Error(
        'Packt build has not been initialized. Make sure to call start() before calling watch() or build()'
      ));
    }

    this.emit('buildStart');

    try {
      rimraf.sync(config.invariantOptions.outputPath);
    } catch (ex) {
      return this._fatalError(new Error(
        `Unable to clean build directory ${config.invariantOptions.outputPath}: ${ex.toString()}`
      ));
    }

    return determineInitialWorkingSet(config)
      .then(workingSet => {
        return this._doBuild(workingSet, bail);
      })
      .catch((err) => this._fatalError(err));
  }

  _doBuild(workingSet: WorkingSet, bail: boolean): Promise<Packt> {
    const utils = this._utils;
    const state = this._state;
    const config = this._config;
    if (!utils || !state || !config) {
      return this._fatalError(new Error(
        'Packt build has not been initialized. Make sure to call start() before calling watch() or build()'
      ));
    }

    this._reporter.onStartBuild();
    const params = {
      workingSet, 
      timer: new Timer(),
      config,
      utils,
      state,
      bail,
    };
    return this._buildModules(params).then((buildResult) => {
      if (!buildResult) {
        return Promise.resolve();
      } else {
        const br = buildResult;
        return this._bundleModules(params).then((bundleResult) => {
          if (bundleResult) {
            this._reporter.onFinishBuild(
              {
                global: params.timer,
                handlers: br.handlerTimer,
                bundlers: bundleResult.bundlerTimer,
              },
              br.buildStats,
              bundleResult.bundleStats
            );
            this.emit('buildFinish');
          }
          return Promise.resolve();
        });
      }
    }).then(() => this);
  }

  _fatalError(err: Error): Promise<Packt> {
    if (this._utils) {
      this._utils.pool.stop();
    }
    this._reporter.onError(err);
    this.emit('error',err);
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
    return parseConfig(this._options.config, json);
  }

  _createBuildUtils(config: PacktConfig): Promise<BuildUtils> {
    return Promise.resolve({
      pathHelpers: new OutputPathHelpers(config),
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

    return Promise.resolve({
      scopeGenerator,
      assetMap: new AssetMap(utils.pathHelpers),
      contentMap: new ContentMap(),
      dependencyGraph: new DependencyGraph(),
      bundleSets: null,
      bundleLookups: null,
    });
  }


  _buildModules({
    workingSet,
    timer,
    config,
    utils,
    state,
    bail,
  }: BuildParams): Promise<?{
    buildStats: { [variant: string]: PerfStatsDict },
    handlerTimer: Timer
  }> {
    const bundles = Object.keys(workingSet.bundles);
    if (!bundles.length) {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const updateReporter = setInterval(() => {
        this._reporter.onUpdateBuildStatus(utils.pool.status(), buildStats, null);
      },100);

      const start = Date.now();
      const buildStats: { [variant: string]: PerfStatsDict } = {};
      const handlerTimer = new Timer();

      const cleanup = (forceBail: boolean, err: ?Error) => {
        timer.accumulate('build',{ 'modules': Date.now() - start });
        clearInterval(updateReporter);
        utils.pool.removeAllListeners();
        utils.resolvers.removeAllListeners();
        if (err) {
          if (bail || forceBail) {
            reject(err);
          } else {
            this._reporter.onBuildError(err);
            resolve(null);
          }
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
                m.resolvedParentModuleOrBundle,
                resolvedModule,
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

          case 'module_resolve_error':
            cleanup(false, m.error);
            break;

          case 'idle':
            if (utils.pool.idle()) {
              cleanup(false);
            }
            break;
        }
      });

      utils.pool.on('worker_pool_message', (m: MessageType) => {
        switch (m.type) {
          case 'worker_error':
            cleanup(true, m.error);
            break;

          case 'module_content':
            for (let variant of m.variants) {
              getOrCreate(buildStats, variant,()=> ({}))[m.resolvedModule] = {
                transform: m.perfStats.transform / m.variants.length,
                diskIO: m.perfStats.diskIO / m.variants.length,
                preSize: m.perfStats.preSize,
                postSize: m.perfStats.postSize,
              };
            }
            handlerTimer.accumulate(m.handler,m.perfStats);
            handlerTimer.accumulate(m.handler,{ modules: m.variants.length });

            state.dependencyGraph.setContentMetadata(
              m.resolvedModule,
              m.variants,
              m.contentType,
              m.contentHash
            );
            state.contentMap.setContent(
              m.resolvedModule,
              m.variants,
              m.content
            );
            break;

          case 'module_content_error':
            cleanup(false, new errors.PacktContentError(
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
                importedByDeclaration: m.importDeclaration,
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
              cleanup(false);
            }
            break;
        }
      });

      for (let bundleName of bundles) {
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

  _prepareBundles({
    workingSet,
    timer,
    config,
    utils,
    state,
    bail,
  }: BuildParams): {|
    bundleSets: { [variant: string]: GeneratedBundleSet },
    bundleLookups: GeneratedBundleLookups,
  |} {
    // we can avoid rebuilding the structure of the bundles if we know
    // that no dependency changes occurred since the last build i.e. no
    // files added or removed & no imports/exports changed.
    let bundleSets = state.bundleSets;
    let bundleLookups = state.bundleLookups;
    if (
      !bundleSets || 
      !bundleLookups ||
      state.dependencyGraph.hasChanges(workingSet)
    ) {
      // remove any pieces of the graph that have
      // become disconnected due to import changes etc.
      state.dependencyGraph.trim();

      bundleSets = generateBundleSets(
        state.dependencyGraph,
        workingSet,
        config,
        utils.pathHelpers
      );

      bundleLookups = generateBundleLookups(
        state.dependencyGraph,
        bundleSets
      );

      Object.assign(state, {
        bundleSets,
        bundleLookups,
      });
    }
    return {
      bundleSets,
      bundleLookups,
    };
  }

  _bundleModules({
    workingSet,
    timer,
    config,
    utils,
    state,
    bail,
  }: BuildParams): Promise<?{
    bundleStats: { [variant: string]: PerfStatsDict },
    bundlerTimer: Timer,
  }> {
    let start = Date.now();
    const {bundleSets, bundleLookups} = this._prepareBundles({
      workingSet,
      timer,
      config,
      utils,
      state,
      bail
    });
    timer.accumulate('build',{ 'bundle-sort': Date.now() - start });

    start = Date.now();
    return state.assetMap.update(
      state.dependencyGraph,
      bundleSets,
    ).then(() => new Promise((resolve,reject) => {
      timer.accumulate('build',{ 'asset-map': Date.now() - start });

      start = Date.now();
      const bundleStats: { [variant: string]: PerfStatsDict } = {};
      const bundlerTimer = new Timer();

      const updateReporter = setInterval(() => {
        this._reporter.onUpdateBuildStatus(utils.pool.status(), null, bundleStats);
      },100);

      const cleanup = (forceBail: boolean, err: ?Error) => {
        timer.accumulate('build',{ 'bundles': Date.now() - start });
        clearInterval(updateReporter);
        utils.pool.removeAllListeners();
        if (err) {
          if (bail || forceBail) {
            reject(err);
          } else {
            this._reporter.onBundleError(err);
            resolve(null);
          }
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
            getOrCreate(bundleStats, m.variant,() => ({}))[m.bundleName] = m.perfStats;
            break;

          case 'bundle_content_error':
            cleanup(false, new errors.PacktBundleError(
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
            cleanup(true, m.error);
            break;

          case 'idle':
            cleanup(false);
            break;
        }
      });

      const duplicateBundles: Set<string> = new Set();
      for (let variant in bundleSets) {
        const generatedVariant = bundleSets[variant];
        const bundleLookupVariant = bundleLookups[variant];
        const contentMap = state.contentMap.readOnlyVariant(variant);
        const bundles = generatedVariant.getBundles();
        for (let bundleName in bundles) {
          const bundle = bundles[bundleName];
          // certain bundles, especially dynamic bundles may be 
          // indepdendently generated via different static parents - 
          // but since the output is the same, theres no point
          // generating these over and over
          if (!duplicateBundles.has(bundle.paths.outputPath)) {
            duplicateBundles.add(bundle.paths.outputPath);
            utils.pool.processBundle(
              bundleName,
              variant,
              serializeBundle({
                bundleName,
                bundle,
                bundleLookups: bundleLookupVariant,
                contentMap,
                config
              })
            );
          }
        }
      }
    }));
  }
}
