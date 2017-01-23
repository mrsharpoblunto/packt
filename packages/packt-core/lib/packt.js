'use strict';

const path = require('path');
const messageTypes = require('./message-types');
const WorkerPool = require('./worker-pool');
const PacktConfig = require('./packt-config');
const ResolverChain = require('./resolver-chain');
const Timer = require('./timer');
const ContentMap = require('./content-map');
const DependencyGraph = require('./dependency-graph');
const sortBundles = require('./dependency-graph-sort');
const errors = require('./packt-errors');
const bundleTypes = require('./bundle-types');
const ScopeIdGenerator = require('./scope-id-generator');

class Packt {
  constructor(workingDirectory,options,reporter) {
    this._timer = new Timer();
    this._handlerTimer = new Timer();
    this._reporter = reporter;

    this._options = Object.assign({},options);
    this._options.config = path.resolve(workingDirectory, options.config);
    this._buildStats = {};

    const version = require('../package.json').version;
    this._reporter.onInit(version, this._options);
  }

  start() {
    return this._loadConfig()
      .then((config) => {
        this._reporter.onLoadConfig(config);
        this._resolvers = new ResolverChain(
          this._config.config.resolvers
        );
        this._workers = new WorkerPool(this._config);
        this._workers.start();
        return this._loadBuildData()
      }).then(() => {
        return this;
      })
      .catch((err) => this._fatalError(err));
  }

  stop() {
    return this._workers.stop()
      .then(() => {
        return this;
      });
  }

  build() {
    return this._determineWorkingSet()
      .then(set => {
        this._reporter.onStartBuild();
        return this._buildModules(set)
          .then(() => this._bundleModules(set))
          .then(() => {
            this._reporter.onFinishBuild({
              global: this._timer,
              handlers: this._handlerTimer,
            },
            this._buildStats,
            this._dependencyGraph);
          });
      })
      .catch((err) => this._fatalError(err));
  }

  _fatalError(err) {
    if (this._workers) {
      this._workers.stop();
    }
    this._reporter.onError(err);
    return Promise.reject(err);
  }

  _loadConfig() {
    this._config = new PacktConfig();

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
    return this._config.load(this._options.config,json);
  }

  _loadBuildData() {
    try {
      this._scopeGenerator = new ScopeIdGenerator(this._options.moduleScopes);
    } catch (ex) {
      return Promise.reject(new errors.PacktError(
        'Failed to load module scopes map at ' + this._options.moduleScopes,
        ex
      ));
    }

    // TODO load from cache configured in config
    // TODO need the dependency map here too
    // TODO should have one content map per dependency tree - lazy load
    // if the tree requires changes
    this._contentMap = new ContentMap();
    this._dependencyGraph = new DependencyGraph();
    return Promise.resolve(this._contentMap);
  }

  _determineWorkingSet() {
    // TODO determine files which changed from last build using filesystem
    // search or watchman if available. if empty, use config entrypoints as inputs
    //  also determine all the chunks where a changed input occurred, so once
    //  we've rebuilt the inputs, we can regenerate the output chunks

    const set = {
      bundles: {},
      commonBundles: {},
    };

    try {
      for (let key in this._config.config.bundles) {
        const bundle = this._config.config.bundles[key];
        if (bundle.type === bundleTypes.COMMON) {
          continue;
        }
        if (bundle.commons) {
          for (let common in bundle.commons) {
            // if a changing bundle has a common module, then all the bundles
            // that common module depends on might also have to change
            const commonBundle = this._config.config.bundles[common];
            Object.keys(commonBundle.dependedBy).forEach(dep => {
              set.bundles[dep] = set.bundles[dep] || [];
            });
            set.commonBundles[common] = true;
          }
        }
        if (bundle.requires) {
          set.bundles[key] = bundle.requires;
        }
      }
      return Promise.resolve(set);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  _buildModules(workingSet) {
    const start = Date.now();
    return new Promise((resolve,reject) => {
      const updateReporter = this._reporter ? setInterval(() => {
        this._reporter.onUpdateBuildStatus(this._workers.status());
      },100) : null;
      this._buildStats = {};

      const cleanup = (err,result) => {
        this._timer.accumulate('build',{ 'modules': Date.now() - start });
        if (updateReporter) {
          clearInterval(updateReporter);
        }
        this._workers.removeAllListeners();
        this._resolvers.removeAllListeners();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      this._resolvers.on(messageTypes.RESOLVED,(m) => {
        this._timer.accumulate('resolvers',m.perfStats);

        if (!m.context.imported) {
          this._dependencyGraph.entrypoint(
            m.resolvedModule,
            m.context.variants,
            m.context.bundle
          );
        } else {
          this._dependencyGraph.imports(
            m.resolvedParentModule,
            m.resolvedModule,
            m.context.variants,
            m.context.imported
          );
        }

        this._contentMap.addIfNotPresent(
          m.resolvedModule,
          () => {
            const scopeId = this._scopeGenerator.getId(m.resolvedModule);
            this._workers.process(m.resolvedModule, scopeId)
          }
        );
      });
      this._resolvers.on(messageTypes.RESOLVED_ERROR,(m) => {
        cleanup(m.error);
      });
      this._resolvers.on(messageTypes.IDLE,() => {
        if (this._workers.idle()) {
          cleanup();
        }
      });

      this._workers.on(messageTypes.ERROR,(m) => {
        cleanup(m.error);
      });
      this._workers.on(messageTypes.CONTENT,(m) => {
        this._buildStats[m.resolved] = m.perfStats;
        this._handlerTimer.accumulate(m.handler,m.perfStats);
        this._handlerTimer.accumulate(m.handler,{ modules: m.variants.length });

        this._dependencyGraph.setContentType(
          m.resolvedModule,
          m.variants,
          m.contentType
        );
        this._contentMap.setContent(
          m.resolvedModule,
          m.variants,
          m.content
        );
      });
      this._workers.on(messageTypes.CONTENT_ERROR,(m) => {
        cleanup(m.error);
      });
      this._workers.on(messageTypes.EXPORT,(m) => {
        this._dependencyGraph.exports(
          m.resolvedModule,
          m.variants,
          m.exported
        );
      });
      this._workers.on(messageTypes.IMPORT,(m) => {
        this._resolvers.resolve(
          m.imported.source,
          m.resolvedModule,
          {
            variants: m.variants,
            imported: m.imported,
          }
        );
      });
      this._workers.on(messageTypes.IDLE,() => {
        if (this._resolvers.idle()) {
          cleanup();
        }
      });

      for (let bundle in workingSet.bundles) {
        const modules = workingSet.bundles[bundle];
        modules.forEach((m) => {
          this._resolvers.resolve(
            m,
            this._config.configFile,
            {
              variants: Object.keys(this._config.config.options),
              bundle: bundle,
            }
          );
        });
      }
    });
  }

  _bundleModules(workingSet) {

    const start = Date.now();

    // TODO compute bundle belonging & symbol usage
    // update working set bundles with symbol usage related changes
    // THEN do bundle sort
    const bundles = sortBundles(
      this._dependencyGraph,
      this._config,
      workingSet
    );

    this._timer.accumulate('build',{ 'bundle-sort': Date.now() - start });

    for (let v in bundles) {
      console.log(v);
      console.log(
        Object
          .keys(this._dependencyGraph.variants[v].lookups)
          //.filter(f => f.indexOf('.js') >=0)
          .length
      );


      for (let b in bundles[v]) {
        const bundle = bundles[v][b];


        for (let module of bundle) {
          //console.log(module.module);
          //console.log(module.exportsSymbols);
          //console.log(module.exportsEsModule);
          //console.log(module.exportsSymbols);
          //console.log(module.importedBy);
          //console.log(this._contentMap.get(module.module,v));
        }
      }
    }

    return Promise.resolve(bundles);
  }

  _prepareBundle(rawBundle) {
    const bundle = [];

    // TODO get the list of bundles & match up with content.
    // any modules in this bundle which belong
  }
}

module.exports = Packt;
