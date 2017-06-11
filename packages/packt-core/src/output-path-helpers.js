/**
 * @flow
 * @format
 */
import path from 'path';
import crypto from 'crypto';
import { hashConfig } from './config-hasher';

const TEMPLATE_REGEX = /\$\{(.*?)\}/g;

export default class OutputPathHelpers {
  _config: PacktConfig;
  _configHash: string;

  constructor(config: PacktConfig) {
    this._configHash = hashConfig(config);
    this._config = config;
  }

  getBundlerStaticOutputPaths(
    name: string,
    hash: string,
    bundler: string,
    variant: string
  ): OutputPaths {
    const b = this._config.bundlers[bundler];
    if (!b) {
      throw new Error('No bundler named ' + bundler + ' has been configured');
    }
    return this._getOutputPaths(
      name,
      hash,
      variant,
      b,
      invariantOptions => invariantOptions.staticOutputPathFormat,
      invariantOptions => invariantOptions.assetNameFormat
    );
  }

  getBundlerDynamicOutputPaths(
    name: string,
    hash: string,
    bundler: string,
    variant: string
  ): OutputPaths {
    const b = this._config.bundlers[bundler];
    if (!b) {
      throw new Error('No bundler named ' + bundler + ' has been configured');
    }
    return this._getOutputPaths(
      name,
      hash,
      variant,
      b,
      invariantOptions => invariantOptions.dynamicOutputPathFormat,
      invariantOptions => invariantOptions.assetNameFormat
    );
  }

  getAssetMapOutputPaths(): OutputPaths {
    return this._getOutputPaths(
      'assets.json',
      '',
      '',
      this._config,
      invariantOptions => invariantOptions.assetMapOutputPathFormat,
      invariantOptions => 'assets.json'
    );
  }

  _getOutputPaths(
    name: string,
    hash: string,
    variant: string,
    configRoot: Object,
    pathFormatter: Object => string,
    nameFormatter: Object => string
  ): OutputPaths {
    let v;
    if (variant) {
      v = configRoot.options[variant];
      if (!v) {
        throw new Error(
          'No config variant ' + variant + ' has been configured'
        );
      }
    }

    return this.getOutputPaths(
      name,
      hash,
      {
        invariantOptions: configRoot.invariantOptions,
        options: v || {},
        variant
      },
      pathFormatter(configRoot.invariantOptions),
      nameFormatter(configRoot.invariantOptions)
    );
  }

  getOutputPaths(
    name: string,
    hash: string,
    params: Object,
    outputPathTemplate: string,
    assetNameTemplate: string
  ): OutputPaths {
    const ext = path.extname(name);
    name = name.substr(0, name.length - ext.length);
    const templateReplacer = (match, arg) => {
      switch (arg) {
        case 'name':
          return name;
        case 'ext':
          return ext;
        case 'hash':
          return hash;
        default:
          return this._getObjectProp(arg, params);
      }
    };

    const outputSuffix = outputPathTemplate.replace(
      TEMPLATE_REGEX,
      templateReplacer
    );

    const outputPath = path.join(
      this._config.invariantOptions.outputPath,
      outputSuffix
    );

    return {
      outputPublicPath: path.join(
        this._config.invariantOptions.outputPublicPath,
        outputSuffix
      ),
      outputPath,
      outputParentPath: path.dirname(outputPath),
      assetName: assetNameTemplate.replace(TEMPLATE_REGEX, templateReplacer)
    };
  }

  _getObjectProp(expression: string, object: Object): string {
    try {
      const components = expression.split('.');
      let context = object;
      for (let component of components) {
        context = context[component];
      }
      if (typeof context !== 'string') {
        throw new Error(
          expression + ' must resolve to a string on template params object'
        );
      }
      return context;
    } catch (ex) {
      throw new Error(
        'No matching property ' +
          expression +
          ' exists on template params object'
      );
    }
  }

  generateHash(content: string): string {
    const hasher = crypto.createHash(this._config.invariantOptions.outputHash);
    hasher.update(content);
    if (this._configHash) {
      hasher.update(this._configHash);
    }
    return hasher
      .digest('hex')
      .substr(0, this._config.invariantOptions.outputHashLength);
  }
}
