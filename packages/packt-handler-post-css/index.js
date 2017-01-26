'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;
const postcss = require('postcss');

class PostCssHandler extends EventEmitter {

  init(invariants, utils, callback) {
    this._invariants = invariants;
    this._resolve = utils.resolve;
    this._handlerInvariants = {
    };
    this._pluginCache = {};
    if (invariants.handler.optsProcessor) {
      utils.resolve(invariants.handler.optsProcessor, (err, resolved) => {
        if (err) {
          return callback(err);
        }

        try {
          this._handlerInvariants.optsProcessor = require(resolved);
        } catch (ex) {
          return callback(ex);
        }
        callback();
      });
    } else {
      callback();
    }
  }

  process(resolvedModule, scopeId, variants, callback) {
    const stats = {};
    let start = Date.now();
    fs.readFile(resolvedModule,'utf8',(err,source) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        callback(err);
        return;
      }

      start = Date.now();

      let ast;
      try {
        ast = postcss.parse(source);
      } catch (ex) {
        if (ex.name === 'CssSyntaxError') {
          ex = 'CssSyntaxError: ' + ex.message + '\n' +
            ex.showSourceCode(true);
        }
        return callback(ex);
      }

      const variantKeys = Object.keys(variants);
      // divide the parse time up evenly amongst each variant transform
      const parseTime = (Date.now() - start) / variantKeys.length
      const needsDeepCopy = variantKeys.length > 1;

      variantKeys.forEach((key) => {
        const vStart = Date.now();
        const variant = variants[key];
        const variantAst = needsDeepCopy ? ast.clone() : ast;

        this._getConfigOpts(
          resolvedModule,
          scopeId,
          key,
          variant
        ).then((configOpts) => {
          postcss(configOpts.plugins)
          .process(variantAst, configOpts.opts)
          .then((result) => {
            stats.transform = Date.now() - vStart + parseTime;
            start = Date.now();
            for (let warning of result.warnings()) {
              this.emit(messageTypes.WARNING, {
                warning: warning.toString(),
                variants: [key],
              });
            }
            callback(
              null,
              [key],
              {
                content: result.css,
                contentType: 'text/css',
                metadata: {
                  sourceLength: source.length,
                  transformedLength: result.css.length,
                },
                perfStats: stats,
              }
            );
          })
          .catch((err) => {
            if (err.name === 'CssSyntaxError') {
              err = 'CssSyntaxError: ' + err.message + '\n' +
                err.showSourceCode(true);
            }
            callback(
              err,
              [key]
            );
          });
        }).catch((err) => {
          callback(
            err,
            [key]
          );
        });
      });
    });
  }

  _getConfigOpts(resolvedModule, scopeId, variant, options) {
    const opts = Object.assign({
      from: resolvedModule,
    },
    options.handler.opts || {}
    );
    const plugins = options.handler.plugins.slice(0) || [];

    // allow custom logic & transforms to be instantiated via a provided
    // module
    if (this._handlerInvariants.optsProcessor) {
      this._handlerInvariants.optsProcessor(
        {
          resolvedModule: resolvedModule,
          scopeId: scopeId,
          variant: variant,
          options: options,
          invariantOptions: this._invariants,
        },
        opts,
        plugins
      );
    }

    // resolve any plugins defined as strings to the actual
    // require'd implementation of that module
    return Promise.all(plugins.map((p) => {
      return new Promise((resolve, reject) => {
        if (typeof(p) !== 'string') {
          resolve(p);
        } else if (this._pluginCache[variant + '-' + p]) {
          resolve(this._pluginCache[variant + '-' + p]);
        } else {
          this._resolve(p, (err, resolved) => {
            if (err) {
              return reject(err);
            }

            try {
              const plugin = require(resolved);
              this._pluginCache[variant + '-' + p] = plugin;
              resolve(plugin);
            } catch (ex) {
              reject(ex);
            }
          });
        }
      });
    })).then((plugins) => {
      return {
        opts: opts,
        plugins: plugins,
      };
    });
  }
}

module.exports = PostCssHandler;
