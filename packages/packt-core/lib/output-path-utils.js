'use strict';
const path = require('path');
const crypto = require('crypto');

const TEMPLATE_REGEX = /\$\{(.*?)\}/g;

class OutputPathHelpers {
  constructor(config) {
    this._config = config;
    this._configHash = this.generateHash(JSON.stringify(config));
  }

  getBundlerOutputPaths(name, hash, bundler, variant) {
    const b = this._config.bundlers[bundler];
    if (!b) {
      throw new Error('No bundler named '+bundler+' has been configured');
    }
    let v;
    if (variant) {
      v = b.options[variant];
      if (!v) {
        throw new Error(
          'No config variant ' + variant +
          ' has been configured'
        );
      }
    }

    return this.getOutputPaths(
      name,
      hash,
      {
        invariantOptions: b.invariantOptions,
        options: v || {},
      },
      b.invariantOptions.outputPathFormat,
      b.invariantOptions.assetNameFormat
    );
  }

  getOutputPaths(name, hash, params, outputPathTemplate, assetNameTemplate) {
    const ext = path.extname(name);
    name = name.substr(0,name.length - ext.length);
    const templateReplacer = (match, arg) => {
      switch (arg) {
        case 'name':
          return name;
        case 'ext':
          return ext;
        case 'hash':
          return hash;
        default:
          return this._getObjectProp(arg);
      }
    };

    const outputSuffix = outputPathTemplate.replace(TEMPLATE_REGEX, templateReplacer);

    const result = {
      outputPublicPath: path.join(
        this._config.invariantOptions.outputPublicPath,
        outputSuffix
      ),
      outputPath: path.join(
        this._config.invariantOptions.outputPath,
        outputSuffix
      ),
      assetName: assetNameTemplate.replace(TEMPLATE_REGEX, templateReplacer),
    };
    result.outputParentPath = path.dirname(result.outputPath);
    return result;
  }

  _getObjectProp(expression, object) {
    try {
      const components = expression.split('.');
      let context = object;
      for (let component of components) {
        context = context[component];
      }
      return context;
    } catch (ex) {
      throw new Error('No matching property ' + expression + ' exists on template params object');
    }
  }


  generateHash(content) {
    const hasher = crypto.createHash(this._config.invariantOptions.outputHash);
    hasher.update(content);
    if (this._configHash) {
      hasher.update(this._configHash);
    }
    return hasher.digest('hex').substr(
      0,
      this._config.invariantOptions.outputHashLength
    );
  }
}

module.exports = OutputPathHelpers;
