/**
 * @flow
 * @format
 */
import fs from 'fs';
import postcss from 'postcss';

type PostCssOptionsTransformFunction = (
  context: {
    resolvedModule: string,
    scopeId: string,
    variant: string,
    options: HandlerOptions,
    invariantOptions: HandlerOptions,
  },
  options: Object,
  plugins: Array<string>,
) => void;

export default class PostCssHandler implements Handler {
  _invariantOptions: HandlerOptions;
  _handlerInvariants: {
    optsProcessor?: PostCssOptionsTransformFunction,
  };
  _pluginCache: { [key: string]: mixed };

  init(
    invariantOptions: HandlerOptions,
    delegate: HandlerDelegate,
    callback: HandlerInitCallback,
  ) {
    this._invariantOptions = invariantOptions;
    this._handlerInvariants = {};
    this._pluginCache = {};
    if (invariantOptions.handler.optsProcessor) {
      delegate.resolve(
        invariantOptions.handler.optsProcessor,
        (err, resolved) => {
          if (err) {
            return callback(err);
          }

          try {
            this._handlerInvariants.optsProcessor = require(resolved);
          } catch (ex) {
            return callback(ex);
          }
          callback();
        },
      );
    } else {
      callback();
    }
  }

  process(
    resolvedModule: string,
    scopeId: string,
    options: { [key: string]: HandlerOptions },
    delegate: HandlerDelegate,
    callback: HandlerProcessCallback,
  ) {
    let start = Date.now();
    fs.readFile(resolvedModule, 'utf8', (err, source) => {
      let variantKeys = Object.keys(options);
      const stats = {
        diskIO: (Date.now() - start) / variantKeys.length,
        preSize: source.length,
        transform: 0,
        postSize: 0,
      };

      if (err) {
        callback(err);
        return;
      }

      const sourceContentHash = delegate.generateHash(source);

      // use cached responses for all variants that have
      // a cached resonse already
      variantKeys = variantKeys.filter(variant => {
        const cacheEntry = delegate.cacheGet(variant, sourceContentHash);
        if (cacheEntry) {
          stats.postSize = cacheEntry.content.length;
          callback(null, [variant], {
            cacheEntry,
            perfStats: stats,
          });
          return false;
        }
        return true;
      });

      // if all variants were cached, no point
      // in continuing
      if (!variantKeys.length) {
        return;
      }

      start = Date.now();

      let ast;
      try {
        ast = postcss.parse(source);
      } catch (ex) {
        if (ex.name === 'CssSyntaxError') {
          ex = 'CssSyntaxError: ' + ex.message + '\n' + ex.showSourceCode(true);
        }
        return callback(ex);
      }

      // divide the parse time up evenly amongst each variant transform
      const parseTime = (Date.now() - start) / variantKeys.length;
      const needsDeepCopy = variantKeys.length > 1;

      variantKeys.forEach(key => {
        const vStart = Date.now();
        const variant = options[key];
        const variantAst = needsDeepCopy ? ast.clone() : ast;

        this._getConfigOpts(resolvedModule, scopeId, key, variant, delegate)
          .then(configOpts => {
            postcss(configOpts.plugins)
              .process(variantAst, configOpts.opts)
              .then(result => {
                stats.transform = Date.now() - vStart + parseTime;
                stats.preSize = source.length;
                stats.postSize = result.css.length;

                start = Date.now();
                for (let warning of result.warnings()) {
                  delegate.emitWarning([key], warning.toString());
                }
                callback(null, [key], {
                  content: result.css,
                  contentType: 'text/css',
                  sourceContentHash,
                  contentHash: delegate.generateHash(result.css),
                  cache: true,
                  perfStats: stats,
                });
              })
              .catch(err => {
                if (err.name === 'CssSyntaxError') {
                  err =
                    'CssSyntaxError: ' +
                    err.message +
                    '\n' +
                    err.showSourceCode(true);
                }
                callback(err, [key]);
              });
          })
          .catch(err => {
            callback(err, [key]);
          });
      });
    });
  }

  _getConfigOpts(
    resolvedModule: string,
    scopeId: string,
    variant: string,
    options: HandlerOptions,
    delegate: HandlerDelegate,
  ) {
    const opts = Object.assign(
      {
        from: resolvedModule,
      },
      options.handler.opts || {},
    );
    const plugins: Array<string> = (options.handler.plugins || []).slice(0);

    // allow custom logic & transforms to be instantiated via a provided
    // module
    if (this._handlerInvariants.optsProcessor) {
      this._handlerInvariants.optsProcessor(
        {
          resolvedModule: resolvedModule,
          scopeId: scopeId,
          variant: variant,
          options: options,
          invariantOptions: this._invariantOptions,
        },
        opts,
        plugins,
      );
    }

    // resolve any plugins defined as strings to the actual
    // require'd implementation of that module
    return Promise.all(
      plugins.map(p => {
        return new Promise((resolve, reject) => {
          if (typeof p !== 'string') {
            resolve(p);
          } else if (this._pluginCache[variant + '-' + p]) {
            resolve(this._pluginCache[variant + '-' + p]);
          } else {
            delegate.resolve(p, (err, resolved) => {
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
      }),
    ).then(plugins => {
      return {
        opts: opts,
        plugins: plugins,
      };
    });
  }
}
