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
    this._resolver = new DefaultResolver({
      searchPaths: [
        this.workingDirectory,
        'node_modules',
      ],
      extensions: ['.js'],
    });

    return this
      ._validate(json)
      .then((validated) => this._buildVariants(validated))
      .then((variants) => this.variants = variants);
  }

  _validate(json) {
    return Promise.all(
      ((json.resolvers && json.resolvers.custom) || []).map(
        c => this._resolveRequire(c)
      ).concat((json.handlers || []).map(
        h => this._resolveRequire(h)
      )).concat(Object.keys(json.bundlers || {}).map(
        b => this._resolveRequire(json.bundlers[b])
      ))
    ).then((resolved) => new Promise((resolve,reject) => {
      const schema = this._generateSchema(
        resolved.filter(r => !r.err).map(r => r.resolved),
        Object.keys(json.bundlers || {})
      );
      joi.validate(json, schema,  (err, value) => { 
        if (err) {
          return reject(new PacktConfigError(err));
        }
        resolve(value);
      });
    }));
  }

  _generateSchema(resolved, bundlers) {
    const customJoi = joi.extend({
      base: joi.string(),
      name: 'string',
      language: {
        bundler: '{{value}} needs to be one of {{bundlers}}',
        resolvable: 'unable to resolve required module "{{value}}"',
        regex: '"{{value}}" is not a valid RegExp',
      },
      rules: [
        {
          name: 'bundler',
          params: {
            bundlers: joi.array().items(joi.string()).required()
          },
          validate(params, value, state, options) {
            if (!params.bundlers.find((b) => value === b)) {
              return this.createError('string.bundler',{ 
                value: value, 
                bundlers: params.bundlers 
              }, state, options);
            }
            return value;
          }
        },
        {
          name: 'regex',
          validate(params, value, state, options) {
            try {
              const regex = new RegExp(value);
              return value;
            } catch (err) {
              return this.createError('string.regex',{ 
                value: value, 
              }, state, options);
            }
          }
        },
        {
          name: 'resolvable',
          params: {
            resolved: joi.array().items(joi.string()).required()
          },
          validate(params, value, state, options) {
            if (!params.resolved.find((r) => r === value)) {
              return this.createError('string.resolvable',{ 
                value: value 
              }, state, options);
            }
            return value;
          }
        }
      ],
    });

    const configSchema = joi.object({
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
        bundler: customJoi.string().bundler(bundlers).required(),
      })).min(1).required(),
      bundlers: joi.object({}).pattern(/.*/,joi.object({
        require: customJoi.string().resolvable(resolved).required(),
        invariantOptions: joi.object({}).default().unknown(),
      })).min(1).required(),
      resolvers: joi.object({
        custom: joi.array().items(joi.object({
          require: customJoi.string().resolvable(resolved).required(),
          invariantOptions: joi.object({}).default().unknown(),
        })).default([]),
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
        pattern: customJoi.string().regex().required(),
        require: customJoi.string().resolvable(resolved).required(),
        invariantOptions: joi.object({}).default().unknown(),
        options: joi.object({
          base: joi.object({}).default().unknown(),
          variants: joi.object({}).default().unknown(),
        }).default(),
      })).min(1).required(),
    });

    return configSchema;
  }

  _resolveRequire(entry) {
    return new Promise((resolve,reject) => {
      this._resolver.resolve(
        entry.require,
        this.configFile,
        (err,resolved) => {
          if (err) {
            resolve({
              require: entry.require,
              err: err,
            });
          } else {
            entry.require = resolved;
            resolve({
              require: entry.require,
              resolved: resolved,
            });
          }
        }
      );
    });
  }

  _buildVariants(json) {
    const variants = {};
    Object.keys(json.options.variants).reduce((prev,next) => {
      prev[next] = this._mergeOptions(
        JSON.parse(JSON.stringify(json)),
        next
      );
      return prev;
    },variants);
    json.handlers.forEach((h) => {
      Object.keys(h.options.variants).reduce((prev,next) => {
        if (!prev[next]) {
          prev[next] = this._mergeOptions(
            JSON.parse(JSON.stringify(json)),
            next
          );
        }
        return prev;
      },variants);
    });
    if (Object.keys(variants).length === 0) {
      variants['default'] = this._mergeOptions(json); 
    }
    return Promise.resolve(variants);
  }

  /**
   * merge all options of a single variant over the top of the 
   * base options. Invariant options then override both of these
   * to give the final merged options object
   */
  _mergeOptions(json,variant) {
    json.options = Object.assign(
      json.options.base,
      variant ? json.options.variants[variant] : {},
      json.invariantOptions
    );
    delete json.invariantOptions;
    json.handlers.forEach(h => {
      h.options = Object.assign(
        h.options.base,
        variant ? h.options.variants[variant]: {},
        h.invariantOptions
      );
      delete h.invariantOptions;
    });
    json.resolvers.custom.forEach(r => {
      r.options = r.invariantOptions;
      delete r.invariantOptions;
    });
    json.resolvers.default.options = json.resolvers.default.invariantOptions;
    delete json.resolvers.default.invariantOptions;
    for (let b in json.bundlers) {
      json.bundlers[b].options = json.bundlers[b].invariantOptions;
      delete json.bundlers[b].invariantOptions;
    }

    return json;
  }
}

module.exports = PacktConfig;
