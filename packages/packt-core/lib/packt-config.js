'use strict';

const path = require('path');
const DefaultResolver = require('./default-resolver');
const PacktConfigError = require('./packt-errors').PacktConfigError;
const joi = require('joi');
const os = require('os');
const chalk = require('chalk');

class PacktConfig {
  load(filename, json) {
    this.configFile = filename;
    this.workingDirectory = path.dirname(filename);

    return this._validate(json);
      /*.then(() => this._resolveResolvers(json))
        .then(() => this._resolveHandlers(json))
        .then(() => this._resolveBundlers(json))
        .then(() => this.buildVariants(json));*/
  }

  _validate(json) {
    const CONFIG_SCHEMA = joi.object({
      invariantOptions: joi.object({
        workers: joi.number().integer().min(1).default(os.cpus().length - 1),
        outputPath: joi.string().default(path.join(this.workingDirectory,'build')),
        outputFormat: joi.string().default('${filename}_{hash}.${ext}'),
        outputHash: joi.any().valid('md5','sha1','sha2').default('md5'),
        outputHashLength: joi.number().min(1).max(16).default(12),
      }).default(),
      options: joi.object({
        base: joi.object({}).default().unknown(),
        variants: joi.object({}).default().unknown(),
      }).default(),
      bundles: joi.object({}).pattern(/.*/,joi.object({
        type: joi.any().valid('entrypoint','library','common').required(),
        requires: joi.when('type', { 
          is: 'common', 
          then: joi.forbidden(),
          otherwise: joi.array().items(joi.string()).required(),
        }),
        depends: joi.when('type', { 
          is: 'entrypoint', 
          then: joi.array().items(joi.string()).default(),
          otherwise: joi.forbidden(),
        }),
        contentTypes: joi.when('type', { 
          is: 'common', 
          then: joi.array().items(joi.string().regex(/[a-z]+\/[a-z]+/)).required(),
          otherwise: joi.forbidden(),
        }),
        threshold: joi.when('type', { 
          is: 'common', 
          then: joi.number().min(0).max(1).required(),
          otherwise: joi.forbidden(),
        }),
        bundler: joi.string().required(),
      })).min(1).required(),
      bundlers: joi.object({}).pattern(/.*/,joi.object({
        require: joi.string().required(),
        invariantOptions: joi.object({}).default().unknown(),
      })).min(1).required(),
      resolvers: joi.object({
        custom: joi.array().items(joi.object({
          require: joi.string().required(),
          invariantOptions: joi.object({}).default().unknown(),
        })),
        default: joi.object({
          invariantOptions: joi.object({
            searchPaths: joi.array().items(joi.string()).default(
              [
                this.workingDirectory,
                'node_modules',
              ]
            ),
            extensions: joi.array().items(joi.string().regex(/^\\..+$/)).default(
              ['.js','.json']
            ),
          }).default(),
        }).default(),
      }).default(),
      handlers: joi.array().items(joi.object({
        pattern: joi.string().required(),
        require: joi.string().required(),
        invariantOptions: joi.object({}).default().unknown(),
        options: joi.object({
          base: joi.object({}).default().unknown(),
          variants: joi.object({}).default().unknown(),
        }).default(),
      })).min(1).required(),
    });

    return new Promise((resolve,reject) => {
      // check the overall structure of the config
      joi.validate(json, CONFIG_SCHEMA,  (err, value) => { 
        if (err) {
          return reject(new PacktConfigError(err));
        }
        // check the handler patterns are all valid regexes
        for (let handler of json.handlers) {
          try {
            const regex = new RegExp(handler.pattern);
          } catch (err) {
            return reject(new PacktConfigError({
              details: [{
                message: '"pattern" must be a valid regular expression',
                path: 'handlers.pattern',
              }],
              annotate: () => chalk.red(err.toString()),
            }));
          }
        }

        for (let b in json.bundles) {
          if (!json.bundlers[json.bundles[b].bundler]) {
            return reject(new PacktConfigError({
              details: [{
                message: '"bundler" refers to a bundler "' + json.bundles[b].bundler + '" which is not defined',
                path: 'bundles.' + b,
              }],
              annotate: () => 'Either add a new bundler, or choose one of the existing bundlers [' + chalk.red(Object.keys(json.bundlers).join(','))+']'
            }));  
          }
        }

        resolve();
      });
    });
  }

  /*_resolveResolvers(json) {
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
    }*/

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
