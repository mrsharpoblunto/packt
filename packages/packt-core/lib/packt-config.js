'use strict';

const path = require('path');
const DefaultResolver = require('./default-resolver');

class PacktConfig {
  load(configFile) {
    this.configFile = configFile;
    this.workingDirectory = path.dirname(configFile);

    // TODO validate the JSON & structure of the config
    const resolver = new DefaultResolver(DefaultResolver.defaultOptions);
    const json = require(configFile);

    return Promise.all((json.resolvers.custom || []).map(
      c => this._resolveRequire(c,resolver)
    )).then((customResolvers) => {
      this.resolvers = {
        default: json.resolvers.default,
        custom: customResolvers,
      };
      return Promise.all((json.handlers || []).map(
        h => this._resolveRequire(h,resolver)
      ));
    }).then((customHandlers) => {
      this.handlers = {};
      for (let handler of customHandlers) {
        this.handlers[handler.pattern] = handler;
        delete handler.pattern;
      }
      this.options = json.options;
      this.inputs = json.inputs;
    });
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
            resolve(Object.assign({},entry,{
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
