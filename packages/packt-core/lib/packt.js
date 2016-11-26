'use strict';

const messageTypes = require('./message-types');
const WorkerPool = require('./worker-pool');
const PacktConfig = require('./packt-config');
const ResolverChain = require('./resolver-chain');
const Timer = require('./timer');
const ContentMap = require('./content-map');
const errors = require('./packt-errors');
const bundleTypes = require('./bundle-types');

class Packt {
  constructor(configFile,reporter) {
    this._timer = new Timer();
    this._handlerTimer = new Timer();
    this._reporter = reporter;
    this.configFile = configFile;
  }

  build() {
    return this._loadConfig()
      .then(() => {
        this._resolvers = new ResolverChain(
          this._config.config.resolvers
        );
        this._workers = new WorkerPool(this._config);
        this._loadBuildData()
      })
      .then(() => this._determineBuildable())
      .then((modules) => this._buildModules(modules))
      .then(() => this._bundleModules())
      .then(() => this._workers.stop())
      .catch((err) => {
        if (this._workers) {
          this._workers.stop();
        }
        return Promise.reject(err);
      });
  }

  _loadConfig() {
    this._config = new PacktConfig();

    let json;
    try {
      json = require(this.configFile);
    } catch (ex) {
      if (ex.message === 'missing path') {
        return Promise.reject(new errors.PacktError(
          'No config file found at ' + this.configFile,
          ex
        ));
      } else {
        return Promise.reject(new errors.PacktError(
          'Unable to parse config file ' + this.configFile,
          ex
        ));
      }
    }
    return this._config.load(this.configFile,json);
  }

  _loadBuildData() {
    // TODO load from cache configured in config
    // TODO need the dependency map here too
    // TODO should have one content map per dependency tree - lazy load
    // if the tree requires changes
    this._contentMap = new ContentMap();
    return Promise.resolve(this._contentMap);
  }

  _determineBuildable() {
    // TODO determine files which changed from last build using filesystem
    // search or watchman if available. if empty, use config entrypoints as inputs
    //  also determine all the chunks where a changed input occurred, so once
    //  we've rebuilt the inputs, we can regenerate the output chunks

    const modules = [];
    for (let key in this._config.config.bundles) {
      const bundle = this._config.config.bundles[key];
      if (bundle.type !== bundleTypes.COMMON) {
        modules.push.apply(
          modules,
          bundle.requires.map((r) => ({
            module: r,
            bundle: key,
          }))
        );
      }
    }
    return Promise.resolve(modules);
  }

  _buildModules(modules) {
    if (this._reporter) {
      this._reporter.startBuild();
    }
    const start = Date.now();
    return new Promise((resolve,reject) => {
      const updateReporter = this._reporter ? setInterval(() => {
        this._reporter.updateBuild(this._workers.status());
      },100) : null;

      const cleanup = (err,result) => {
        this._timer.accumulate('build',{ 'modules': Date.now() - start });
        if (updateReporter) {
          this._reporter.finishBuild();
          clearInterval(updateReporter);
        }
        this._workers.removeAllListeners();
        this._resolvers.removeAllListeners();
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      };

      this._resolvers.on(messageTypes.RESOLVED,(m) => {
        this._timer.accumulate('resolvers',m.perfStats);
        // TODO record dependency as well
        this._contentMap.addIfNotPresent(
          m.resolved,
          () => this._workers.process(m.resolved,m.context)
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
        this._handlerTimer.accumulate(m.handler,m.perfStats);
        this._handlerTimer.accumulate(m.handler,{ modules: m.variants.length });
        this._contentMap.setContent(
          m.resolved,
          m.variants,
          m.content
        );
      });
      this._workers.on(messageTypes.CONTENT_ERROR,(m) => {
        cleanup(m.error);
      });
      this._workers.on(messageTypes.DEPENDENCY,(m) => {
        this._resolvers.resolve(
          m.moduleName,
          m.resolvedParentModule,
          m.context
        );
      });
      this._workers.on(messageTypes.IDLE,() => {
        if (this._resolvers.idle()) {
          cleanup(null);
        }
      });
      this._workers.start();

      modules.forEach((module) => {
        this._resolvers.resolve(module.module,this._config.configFile,{
          bundle: module.bundle,
        });
      });
    });
  }

  _bundleModules() {
    // TODO
    return Promise.resolve();
  }
}

module.exports = Packt;
