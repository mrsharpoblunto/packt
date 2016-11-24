'use strict';

const messageTypes = require('./message-types');
const WorkerPool = require('./worker-pool');
const PacktConfig = require('./packt-config');
const ResolverChain = require('./resolver-chain');
const Timer = require('./timer');
const ContentMap = require('./content-map');
const errors = require('./packt-errors');

class Packt {
  constructor(configFile) {
    this._timer = new Timer();
    this._handlerTimer = new Timer();
    this.configFile = configFile;
  }

  build() {
    return this._loadConfig()
      .then(() => {
        this._resolvers = new ResolverChain(this._config.resolvers);
        this._workers = new WorkerPool(this._config);
        this._loadBuildData()
      })
      .then(() => this._determineInputs())
      .then((inputs) => this._buildInputs(inputs))
      .then(() => this._emitOutputs())
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
      console.log(ex);
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
    this._contentMap = new ContentMap();
    return Promise.resolve(this._contentMap);
  }

  _determineInputs() {
    // TODO determine files which changed from last build using filesystem
    // search or watchman if available. if empty, use config entrypoints as inputs
    //  also determine all the chunks where a changed input occurred, so once
    //  we've rebuilt the inputs, we can regenerate the output chunks

    const modules = [];
    const chunks = [];
    for (let key in this._config.inputs) {
      modules.push.apply(modules,this._config.inputs[key]);
      chunks.push(key);
    }
    return Promise.resolve({
      modules: modules,
      chunks: chunks,
    });
  }

  _buildInputs(inputs) {
    const start = Date.now();
    return new Promise((resolve,reject) => {
      const updateUIInterval = setInterval(() => {
        // TODO diff previous UI state & re-render status table
      },100);

      const cleanup = (err,result) => {
        this._timer.accumulate('build',{ 'inputs': Date.now() - start });
        clearInterval(updateUIInterval);
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
        this._
        // TODO record dependency in content map as well
        if (!this._contentMap.contains(m.resolved)) {
          this._contentMap.addPending(m.resolved);
          // TODO add resolved to content map
          this._workers.process(m.resolved);
        }
      });
      this._resolvers.on(messageTypes.RESOLVED_ERROR,(m) => {
        cleanup(m.error);
      });

      this._workers.on(messageTypes.ERROR,(m) => {
        cleanup(m.error);
      });
      this._workers.on(messageTypes.CONTENT,(m) => {
        this._handlerTimer.accumulate(m.handler,m.perfStats);
        this._handlerTimer.accumulate(m.handler,{ modules: 1 });
        this._contentMap.setContent(m.resolved,m.content);
        if (this._workers.idle() && this._resolvers.idle()) {
          cleanup(null,inputs.chunks);
        }
      });
      this._workers.on(messageTypes.CONTENT_ERROR,(m) => {
        cleanup(m.error);
      });
      this._workers.on(messageTypes.DEPENDENCY,(m) => {
        this._resolvers.resolve(m.moduleName,m.resolvedParentModule);
      });
      this._workers.start();

      inputs.modules.forEach((module) => {
        this._resolvers.resolve(module,this._config.configFile);
      });
    });
  }

  _emitOutputs() {
    // TODO
    return Promise.resolve();
  }
}

module.exports = Packt;
