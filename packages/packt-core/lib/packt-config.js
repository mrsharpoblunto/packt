'use strict';

const path = require('path');
const DefaultResolver = require('./default-resolver');
const PacktConfigError = require('./packt-errors').PacktConfigError;
const bundleTypes = require('./bundle-types');
const joi = require('joi');
const os = require('os');
const chalk = require('chalk');

class PacktConfig {
  load(filename, json) {
    this.configFile = filename;
    this.workingDirectory = path.dirname(filename);
    this._resolver = new DefaultResolver(
      DefaultResolver.defaultOptions(this.workingDirectory)
    );

    return this
      ._validate(json)
      .then((validated) => this._buildVariants(validated))
      .then((config) => this.config = config);
  }

  _validate(json) {
    const resolvers = Array.isArray(json.resolvers && json.resolvers.custom) ? 
      json.resolvers.custom : [];
    const handlers = Array.isArray(json.handlers) ? json.handlers : [];
    const bundlers = (json.bundlers && typeof(json.bundlers) === 'object') ?
      Object.keys(json.bundlers) : [];
    
    return Promise.all(
      resolvers.map(c => this._resolveRequire(c))
        .concat(handlers.map(h => this._resolveRequire(h)))
        .concat(bundlers.map(b => this._resolveRequire(json.bundlers[b])))
    ).then((resolved) => new Promise((resolve,reject) => {
      const libraries = (json.bundles && typeof(json.bundles) === 'object') ?
        Object.keys(json.bundles).filter(
          (b) => json.bundles[b].type === bundleTypes.LIBRARY || 
                 json.bundles[b].type === bundleTypes.COMMON
        ) : []

      const schema = this._generateSchema(
        resolved.filter(r => !r.err).map(r => r.resolved),
        libraries,
        bundlers
      );

      joi.validate(json, schema, {
        abortEarly: false,
      }, (err, value) => { 
        if (err) {
          return reject(new PacktConfigError(err));
        }
        for (let b in value.bundles) {
          if (value.bundles[b].type === bundleTypes.ENTRYPOINT) {
            let commonCount = 0;
            const dependencies = typeof(value.bundles[b].depends) === 'string'
              ? [value.bundles[b].depends]
              : value.bundles[b].depends;

            for (let dep of dependencies) {
              if (value.bundles[dep].type !== bundleTypes.ENTRYPOINT) {
                if (!value.bundles[dep].dependedBy) {
                  value.bundles[dep].dependedBy = {};
                }
                value.bundles[dep].dependedBy[b] = true;
                value.bundles[dep].dependedByLength = Object.keys(
                  value.bundles[dep].dependedBy
                ).length;
              }
              if (value.bundles[dep].type === bundleTypes.COMMON) {
                value.bundles[b].common = dep;
                ++commonCount;
              }
              if (commonCount > 1) {
                return reject(new PacktConfigError(
                {
                  details: [{
                    path: 'bundles.' + dep + '.depends',
                    message: 'An entrypoint bundle can\'t have dependencies on multiple common bundles',
                  }],
                }
                ));
              }
            }
          }
          if (typeof(value.bundles[b].requires) === 'string') {
            value.bundles[b].requires = [value.bundles[b].requires];
          }
          if (typeof(value.bundles[b].depends) === 'string') {
            value.bundles[b].depends = [value.bundles[b].depends];
          }
        }
        resolve(value);
      });
    }));
  }

  _generateSchema(resolved, libraries, bundlers) {
    const customJoi = joi.extend({
      base: joi.string(),
      name: 'string',
      language: {
        bundler: '{{value}} needs to be one of {{bundlers}}',
        library: 'dependency {{value}} needs to be one of the following library or common bundles {{libraries}}',
        resolvable: 'unable to resolve required module "{{value}}"',
        regex: '"{{value}}" is not a valid RegExp',
      },
      rules: [
        {
          name: 'library',
          params: {
            libraries: joi.array().items(joi.string()).required()
          },
          validate(params, value, state, options) {
            if (!params.libraries.find((b) => value === b)) {
              return this.createError('string.library',{ 
                value: value, 
                libraries: params.libraries 
              }, state, options);
            }
            return value;
          }
        },
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
        outputFormat: joi.string().default('${filename}_${hash}.${ext}'),
        outputHash: joi.any().valid('md5','sha1','sha2').default('md5'),
        outputHashLength: joi.number().min(1).max(16).default(12),
      }).default(),
      options: joi.object({
        base: joi.object({}).default().unknown(),
        variants: joi.object({}).default().unknown(),
      }).default(),
      bundles: joi.object({}).pattern(/.*/,joi.object({
        type: joi.any().valid(
          bundleTypes.ENTRYPOINT,
          bundleTypes.LIBRARY,
          bundleTypes.COMMON
        ).required(),
        requires: joi.when('type', { 
          is: bundleTypes.COMMON, 
          then: joi.forbidden(),
          otherwise: joi.alternatives().try(
            joi.array().items(joi.string()),
            joi.string()
          ).required()
        }),
        depends: joi.when('type', { 
          is: bundleTypes.ENTRYPOINT, 
          then: joi.alternatives().try(
            joi.array().items(customJoi.string().library(libraries)),
            customJoi.string().library(libraries)
          ).default([]),
          otherwise: joi.forbidden(),
        }),
        contentTypes: joi.when('type', { 
          is: bundleTypes.COMMON, 
          then: joi.array().items(joi.string().regex(/[a-z]+\/[a-z]+/)).required(),
          otherwise: joi.forbidden(),
        }),
        threshold: joi.when('type', { 
          is: bundleTypes.COMMON, 
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
            rootPath: joi.string().default(this.workingDirectory),
            searchPaths: joi.array().items(joi.string()).default(
              [
                this.workingDirectory,
                'node_modules',
              ]
            ),
            extensions: joi.array().items(joi.string().regex(/^\..+$/)).default(
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

  _buildVariants(config) {
    const variants = Object.keys(config.options.variants);
    for (let handler of config.handlers) {
      const extraVariants = 
        Object.keys(handler.options.variants);
      for (let extra of extraVariants) {
        if (!variants.find((v) => v === extra)) {
          variants.push(extra);
        }
      }
    }

    config.hasVariants = !!variants.length;
    config.options = this._varyOptions(variants, config.options);
    for (let handler of config.handlers) {
      handler.options = this._varyOptions(variants, handler.options);
    }
    return Promise.resolve(config);
  }

  _varyOptions(variants, options) {
    if (!variants.length) {
      return {
        'default': options.base,
      };
    } else {
      return variants.reduce((prev,next) => {
        prev[next] = Object.assign(
          {},
          options.base,
          options.variants[next] || {}
        );
        return prev;
      },{});
    }
  }
}

module.exports = PacktConfig;
