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
import type {GeneratedBundleData} from './generated-bundle-set';
import {
  generateBundleLookups,
  serializeBundle,
} from './bundle-utils';
import type {GeneratedBundleLookupVariant} from './bundle-utils';
import * as errors from 'packt-types';
import ScopeIdGenerator from './scope-id-generator';
import OutputPathHelpers from './output-path-helpers';
import {parseConfig} from './packt-config';
import {determineInitialWorkingSet} from './working-set';

type BuildState = {|
  contentMap: ContentMap,
  assetMap: AssetMap,
  dependencyGraph: DependencyGraph,
  scopeGenerator: ScopeIdGenerator,
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
|};

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
      return this._fatalError(new Error(
        'Packt build has not been initialized. Make sure to call Start before calling Build'
      ));
    }

    try {
      rimraf.sync(config.invariantOptions.outputPath);
    } catch (ex) {
      return this._fatalError(new Error(
        `Unable to clean build directory ${config.invariantOptions.outputPath}: ${ex.toString()}`
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

    // TODO load from cache configured in config
    // TODO need the dependency map here too
    // TODO should have one content map per dependency tree - lazy load
    // reset contentMap if config has changed as the hashes will need
    // to be recomputed.
    // if the tree requires changes
    return Promise.resolve({
      scopeGenerator,
      assetMap: new AssetMap(utils.pathHelpers),
      contentMap: new ContentMap(),
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

    const generatedBundleSets = generateBundleSets(
      state.dependencyGraph,
      workingSet,
      config,
      utils.pathHelpers
    );

    const generatedBundleLookups = generateBundleLookups(
      state.dependencyGraph,
      generatedBundleSets
    );

    timer.accumulate('build',{ 'bundle-sort': Date.now() - start });

    start = Date.now();
    return state.assetMap.update(
      state.dependencyGraph,
      generatedBundleSets,
    ).then(() => new Promise((resolve,reject) => {
      timer.accumulate('build',{ 'asset-map': Date.now() - start });

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

      const duplicateBundles: Set<string> = new Set();
      for (let variant in generatedBundleSets) {
        const generatedVariant = generatedBundleSets[variant];
        const bundleLookups = generatedBundleLookups[variant];
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
                bundleLookups,
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
