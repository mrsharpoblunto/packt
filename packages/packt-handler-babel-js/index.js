'use strict';
const babel = require('babel-core');
const codeFrame = require('babel-code-frame');
const babylon = require('babylon');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class JsHandler extends EventEmitter {

  init(invariants, resolver, cb) {
    this._globalInvariants = invariants.global;
    this._handlerInvariants = {
      ignore: (invariants.handler.ignore || []).map((i) => new RegExp(i)),
      parserOpts: Object.assign(
        {},
        invariants.handler.parserOpts || { plugins: [] },
        { sourceType: 'module' }
      ),
    };
    cb();
  }

  _cloneAst(ast) {
    // crazily enough this is faster at deep cloning than any of
    // the libraries on npm
    return JSON.parse(JSON.stringify(ast));
  }

  process(resolved, scopeId, variants, callback) {
    const stats = {};
    let start = Date.now();

    fs.readFile(resolved,'utf8',(err,source) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        callback(err);
        return;
      }

      start = Date.now();

      let ignore = false;
      for (let ignore of this._handlerInvariants.ignore) {
        if (ignore.test(resolved)) {
          ignore = true;
          break;
        }
      }

      let ast;
      try
      {
        ast = babylon.parse(
          source, 
          ignore
            ? { sourceType: 'module', sourceFileName: resolved }
            : Object.assign(
                { 
                  sourceFileName: resolved,
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

      const needsDeepCopy = !ignore && Object.keys(variants).length > 1;
      for (let key in variants) {
        const variant = variants[key];
        const variantAst = needsDeepCopy ? this._cloneAst(ast) : ast;

        try {
          const result = babel.transformFromAst(
            variantAst,
            source,
            this._injectHandlerOptions(
              resolved,
              scopeId,
              key,
              ignore ? {} : variant.handler
            )
          );
          stats.transform = Date.now() - start;
          start = Date.now();
          callback(
            null,
            [key],
            {
              content: result.code,
              metadata: {
                exports: {},
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
      }
    });
  }

  _injectHandlerOptions(resolved, scopeId, variant, options) {
    const transformOpts = options.transformOpts || {};
    const opts = Object.assign(
      {},
      transformOpts,
      {
        filename: resolved,
        plugins: transformOpts.plugins ? transformOpts.plugins.slice(0) : []
      }
    );

    opts.plugins.unshift([
      require('./plugins/replace-defines'),
      {
        defines: options.defines,
      }
    ]);
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
