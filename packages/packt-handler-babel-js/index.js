'use strict';
const babel = require('babel-core');
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

  process(resolved, variants, callback) {
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
            ? { sourceType: 'module' }
            : this._handlerInvariants.parserOpts
        );
      }
      catch (ex) {
        return callback(err);
      }

      const needsDeepCopy = !ignore && Object.keys(variants).length > 1;
      for (let key in variants) {
        const variant = variants[key];
        const variantAst = needsDeepCopy ? this._cloneAst(ast) : ast;

        try {
          const result = babel.transformFromAst(
            variantAst,
            source,
            ignore
              ? this._injectHandlerOptions(variant.options)
              : this._injectHandlerOptions({})
          );
          stats.transform = Date.now() - start;
          start = Date.now();
          callback(
            null,
            [key],
            {
              content: result.code,
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

  _injectHandlerOptions(options) {
    const opts = Object.assign(
      {
        plugins: [],
      },
      options
    );
    opts.plugins.unshift([
      require('./plugins/find-dependencies'),
      {
        emitter: this,
      },
    ]);

  }
}

module.exports = JsHandler;
