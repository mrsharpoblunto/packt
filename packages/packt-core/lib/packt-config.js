'use strict';

const path = require('path');
const DefaultResolver = require('./default-resolver');
const PacktError = require('./packt-error');

class PacktConfig {
  load(configFile) {
    this.configFile = configFile;
    this.workingDirectory = path.dirname(configFile);

    try {
      const json = require(configFile);
      return this._validate(json)
        .then(() => this._resolveResolvers(json))
        .then(() => this._resolveHandlers(json))
        .then(() => this._resolveBundlers(json))
        .then(() => this.buildVariants(json));
    } catch (ex) {
      return Promise.reject(new PacktError('Error parsing config file',ex));
    }
  }

  _validate(json) {

  }

  _resolveResolvers(json) {
    return Promise.all((json.resolvers.custom || []).map(
      c => this._resolveRequire(c,resolver)
    )).catch((err) =>
      return Promise.reject(new PacktError('Failed to resolve custom resolver',err))
    );
  }

  _resolveHandlers(json) {
    return Promise.all((json.handlers || []).map(
      h => this._resolveRequire(h,resolver)
    )).catch((err) =>
      Promise.reject(new PacktError('Failed to resolve handler',err))
    );
  }

  _resolveBundlers(json) {
    return Promise.all((json.bundlers || []).map(
      b => this._resolveRequire(b,resolver)
    )).catch((err) =>
      Promise.reject(new PacktError('Failed to resolve bundler',err))
    );
  }

  _resolveRequire(entry,resolver) {
    return new Promise((resolve,reject) => {
      resolver.resolve(
        entry.require,
        this.configFile,
        (err,resolved) => {
          if (err) {
            reject(err);
          } else {
            resolve(Object.assign(entry,{
              require: resolved,
            }));
          }
        }
      );
    });
  }

  toJson() {
    return {
      inputs: this.inputs,
      options: this.options,
      resolvers: this.resolvers,
      handlers: this.handlers,
    };
  }
}

module.exports = PacktConfig;
