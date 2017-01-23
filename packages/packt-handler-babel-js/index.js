'use strict';
const babel = require('babel-core');
const codeFrame = require('babel-code-frame');
const babylon = require('babylon');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class JsHandler extends EventEmitter {

  init(invariants, resolver, cb) {
    this._invariants = invariants;
    this._handlerInvariants = {
      noParse: (invariants.handler.noParse || []).map((i) => new RegExp(i)),
      parserOpts: Object.assign(
        {},
        invariants.handler.parserOpts || { plugins: [] },
        { sourceType: 'module' }
      ),
    };
    if (invariants.handler.transformOptsProcessor) {
      resolver(invariants.handler.transformOptsProcessor, (err, resolved) => {
        if (err) {
          return cb(err);
        }

        try {
          this._handlerInvariants.transformOptsProcessor = require(resolved);
        } catch (ex) {
          cb(ex);
          return;
        }
        cb();
      });
    } else {
      cb();
    }
  }

  _cloneAst(ast) {
    // crazily enough this is faster at deep cloning than any of
    // the libraries on npm
    return JSON.parse(JSON.stringify(ast));
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
      try
      {
        ast = babylon.parse(
          source,
          Object.assign(
            {
              sourceFileName: resolvedModule,
            },
            this._handlerInvariants.parserOpts
          )
        );
      }
      catch (ex) {
        if (ex.pos && ex.loc) {
          ex = 'SyntaxError:\n' + codeFrame(source,ex.loc.line,ex.loc.column, {
            highlightCode: true,
            linesAbove: 2,
            linesBelow: 3,
          });
        }
        return callback(ex);
      }

      const needsDeepCopy = Object.keys(variants).length > 1;
      for (let key in variants) {
        const variant = variants[key];
        const variantAst = needsDeepCopy ? this._cloneAst(ast) : ast;

        // suppress babel warnings about large files being compacted from
        // the console and send to our warning logger instead
        const oldLog = console.error;
        console.error = (message) => {
          this.emit('warning', {
            warning: message,
            variants: [key],
          });
        };
        try {
          const result = babel.transformFromAst(
            variantAst,
            source,
            this._injectHandlerOptions(
              resolvedModule,
              scopeId,
              key,
              variant
            )
          );
          stats.transform = Date.now() - start;
          start = Date.now();
          callback(
            null,
            [key],
            {
              content: result.code,
              contentType: 'text/javascript',
              metadata: {
                sourceLength: source.length,
                transformedLength: result.code.length,
              },
              perfStats: stats,
            }
          );
        } catch (ex) {
          callback(
            ex,
            [key]
          );
        }
        console.error = oldLog;
      }
    });
  }

  _injectHandlerOptions(resolvedModule, scopeId, variant, options) {
    const transformOpts = options.handler.transformOpts || {};

    const opts = Object.assign(
      {},
      transformOpts,
      {
        filename: resolvedModule,
        plugins: transformOpts.plugins ? transformOpts.plugins.slice(0) : []
      }
    );

    // allow custom logic & transforms to be instantiated via a provided
    // module
    if (this._handlerInvariants.transformOptsProcessor) {
      this._handlerInvariants.transformOptsProcessor(
        {
          resolvedModule: resolvedModule,
          scopeId: scopeId,
          variant: variant,
          options: options,
          invariantOptions: this._invariants,
        },
        opts
      );
    }

    if (options.handler.defines) {
      opts.plugins.unshift([
        require('./plugins/replace-defines'),
        {
          defines: options.handler.defines,
        }
      ]);
    }
    opts.plugins.unshift(require('./plugins/dead-code-removal'));
    opts.plugins.unshift([
      require('./plugins/scopify-and-process-dependencies'),
      {
        emitter: this,
        scope: scopeId,
        variants: [variant],
      },
    ]);
    return opts;
  }
}

module.exports = JsHandler;
