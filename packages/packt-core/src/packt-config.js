/*
 * @flow
 */
import path from 'path';
import BuiltInResolver from './built-in-resolver';
import {PacktConfigError} from 'packt-types';
import joi from 'joi';
import os from 'os';
import chalk from 'chalk';


export function parseConfig(
  filename: string, 
  json: Object
): Promise<PacktConfig> {
  const workingDirectory = path.dirname(filename);

  return validate(filename, workingDirectory, json)
    .then((validated) => buildVariants(validated))
}

function validate(
  configFile: string,
  workingDirectory: string, 
  json: Object
): Promise<PacktConfig> {
  const resolver = new BuiltInResolver(
    BuiltInResolver.defaultOptions(workingDirectory)
  );

  const resolvers = Array.isArray(json.resolvers && json.resolvers.custom) ?
    json.resolvers.custom : [];
  const handlers = Array.isArray(json.handlers) ? json.handlers : [];
  const bundlers = (json.bundlers && typeof(json.bundlers) === 'object') ?
    Object.keys(json.bundlers) : [];

  return Promise.all(
    resolvers.map(c => resolveRequire(c, configFile, resolver))
      .concat(handlers.map(h => resolveRequire(h, configFile, resolver)))
      .concat(bundlers.map(b => resolveRequire(json.bundlers[b], configFile, resolver)))
      ).then((resolved) => new Promise((resolve,reject) => {
    const libraries = (json.bundles && typeof(json.bundles) === 'object') ?
      Object.keys(json.bundles).filter(
        (b) => json.bundles[b].type === 'library' ||
               json.bundles[b].type === 'common'
      ) : []

    const schema = generateSchema(
      workingDirectory,
      resolved.filter(r => !r.err).map(r => r.resolved || ''),
      libraries,
      bundlers
    );

    joi.validate(json, schema, {
      abortEarly: false,
    }, (err, value: PacktConfig) => {
      if (err) {
        return reject(new PacktConfigError(err));
      }

      // ensure all default values are in place to match
      // the config flowtype definition
      value.configFile = configFile;
      value.workingDirectory = workingDirectory;
      for (let b in value.bundles) {
        value.bundles[b] = {
          dependedBy: {},
          commons: {},
          requires: [],
          depends: {},
          contentTypes: {},
          threshold: 0,
          ...value.bundles[b]
        };
      }

      for (let b in value.bundles) {
        const currentBundle = value.bundles[b];
        if (currentBundle.type === 'entrypoint') {
          const commonTypes: Set<string> = new Set();
          let dependencies = [];
          if (typeof(currentBundle.depends) === 'string') {
            dependencies = [currentBundle.depends];
          } else if (Array.isArray(currentBundle.depends)) {
            dependencies = currentBundle.depends;
          }

          for (let dep of dependencies) {
            const depBundle = value.bundles[dep];
            if (depBundle.type !==  'entrypoint') {
              depBundle.dependedBy[b] = true;
            }
            if (depBundle.type === 'common') {
              depBundle.contentTypes = Array.isArray(depBundle.contentTypes) ? depBundle.contentTypes.reduce((prev, next) => {
                prev[next] = true;
                return prev;
              },{}) : depBundle.contentTypes;
              for (let contentType in depBundle.contentTypes) {
                if (commonTypes.has(contentType)) {
                  return reject(new PacktConfigError(
                  {
                    details: [{
                      path: 'bundles.' + dep + '.depends',
                      message: 'An entrypoint bundle can\'t have dependencies on multiple common bundles that have the extract the same content types. Multiple common bundles are configured to extract "' + contentType  + '" resources.',
                    }],
                  }
                  ));
                }
                commonTypes.add(contentType);
              }
              currentBundle.commons[dep] = true;
            }
          }
        }
        if (typeof(value.bundles[b].requires) === 'string') {
          value.bundles[b].requires = [value.bundles[b].requires];
        }
        if (typeof(value.bundles[b].depends) === 'string') {
          value.bundles[b].depends = { [value.bundles[b].depends]: true };
        } else if (Array.isArray(value.bundles[b].depends)) {
          value.bundles[b].depends = (value.bundles[b].depends: any).reduce((prev, next) => {
            prev[next] = true;
            return prev;
          },{});
        }
      }
      resolve(value);
    });
  }));
}

function generateSchema(
  workingDirectory: string,
  resolved: Array<string>, 
  libraries: Array<string>, 
  bundlers: Array<string>
): Object {
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
      outputPath: joi.string().default(path.join(workingDirectory,'build')),
      cachePath: joi.string().default(path.join(workingDirectory,'.packt-cache')),
      outputPublicPath: joi.string().default('/'),
      outputHash: joi.any().valid('md5','sha1','sha2').default('md5'),
      outputHashLength: joi.number().min(1).max(16).default(12),
    }).default(),
    options: joi.object({
      base: joi.object({}).default().unknown(),
      variants: joi.object({}).default().unknown(),
    }).default(),
    bundles: joi.object({}).pattern(/.*/,joi.object({
      type: joi.any().valid(
        'entrypoint',
        'library',
        'common'
      ).required(),
      requires: joi.when('type', {
        is: 'common',
        then: joi.forbidden(),
        otherwise: joi.alternatives().try(
          joi.array().items(joi.alternatives().try(
            joi.string(),
            joi.object({
              name: joi.string().required(),
              folder: joi.boolean().required()
            })
          )),
          joi.object({
            name: joi.string().required(),
            folder: joi.boolean().required()
          }),
          joi.string()
        ).required()
      }),
      depends: joi.when('type', {
        is: 'entrypoint',
        then: joi.alternatives().try(
          joi.array().items(customJoi.string().library(libraries)),
          customJoi.string().library(libraries)
        ).default([]),
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
      bundler: customJoi.string().bundler(bundlers).allow(null),
    })).min(1).required(),
    bundlers: joi.object({}).pattern(/.*/,joi.object({
      require: customJoi.string().resolvable(resolved).required(),
      invariantOptions: joi.object({
        outputPathFormat: joi.string().default('/bundles/${name}_${hash}${ext}'),
        assetNameFormat: joi.string().default('${name}${ext}'),
      }).default().unknown(),
      options: joi.object({
        base: joi.object({}).default().unknown(),
        variants: joi.object({}).default().unknown(),
      }).default(),
    })).min(1).required(),
    resolvers: joi.object({
      custom: joi.array().items(joi.object({
        require: customJoi.string().resolvable(resolved).required(),
        invariantOptions: joi.object({}).default().unknown(),
      })).default([]),
      builtIn: joi.object({
        invariantOptions: joi.object({
          rootPath: joi.string().default(workingDirectory),
          searchPaths: joi.array().items(joi.string()).default(
            [
              workingDirectory,
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

function resolveRequire(
  entry: {|
    require: string,
  |},
  configFile: string,
  resolver: BuiltInResolver,
): Promise<{|
  require: string,
  resolved?: string,
  err?: Error
|}> {
  return new Promise((resolve,reject) => {
    resolver.resolve(
      entry.require,
      configFile,
      false,
      (err,resolved) => {
        if (err || !resolved) {
          resolve({
            require: entry.require,
            err: err || new Error('Unable to resolve ' + entry.require),
          });
        } else {
          entry.require = resolved;
          resolve({
            require: entry.require,
            resolved,
          });
        }
      }
    );
  });
}

function buildVariants(config: PacktConfig): Promise<PacktConfig> {
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
  for (let b in config.bundlers) {
    const bundler = config.bundlers[b];
    const extraVariants =
      Object.keys(bundler.options.variants);
    for (let extra of extraVariants) {
      if (!variants.find((v) => v === extra)) {
        variants.push(extra);
      }
    }
  }

  config.hasVariants = !!variants.length;
  config.options = varyOptions(variants, config.options);
  for (let handler of config.handlers) {
    handler.options = varyOptions(variants, handler.options);
  }
  for (let b in config.bundlers) {
    const bundler = config.bundlers[b];
    bundler.options = varyOptions(variants, bundler.options);
  }
  return Promise.resolve(config);
}

function varyOptions(
  variants: Array<string>, 
  options: {
    base: Object,
    variants: { [key: string]: Object },
  }
): { [key: string]: Object } {
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
