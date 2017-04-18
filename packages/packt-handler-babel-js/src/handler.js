/**
 * @flow
 */
import babel from 'babel-core';
import codeFrame from 'babel-code-frame';
import babylon from 'babylon';
import fs from 'fs';

type TransformOptsFunction = (
  context: {
    resolvedModule: string,
    scopeId: string,
    variant: string,
    options: Object,
    invariantOptions: Object,
  },
  options: Object
) => void;

export default class BabelJsHandler implements Handler {
  _invariantOptions: HandlerOptions;
  _handlerInvariants: {
    noParse: Array<RegExp>,
    parserOpts: Object,
    transformOptsProcessor?: TransformOptsFunction,
  };

  init(
    invariantOptions: HandlerOptions,
    delegate: HandlerDelegate,
    callback: HandlerInitCallback
  ): void {
    this._invariantOptions = invariantOptions;
    this._handlerInvariants = {
      noParse: (invariantOptions.handler.noParse || []).map((i) => new RegExp(i)),
      parserOpts: Object.assign(
        {},
        invariantOptions.handler.parserOpts || { plugins: [] },
        { sourceType: 'module' }
      ),
    };
    if (invariantOptions.handler.transformOptsProcessor) {
      delegate.resolve(invariantOptions.handler.transformOptsProcessor, 
      (err: ?Error, resolved: ?string) => {
        if (err) {
          return callback(err);
        }

        try {
          this._handlerInvariants.transformOptsProcessor = require(resolved);
        } catch (ex) {
          callback(ex);
          return;
        }
        callback();
      });
    } else {
      callback();
    }
  }

  _cloneAst(ast: Object): Object {
    // crazily enough this is faster at deep cloning than any of
    // the libraries on npm
    return JSON.parse(JSON.stringify(ast));
  }

  process(
    resolvedModule: string, 
    scopeId: string, 
    options: { [key: string]: HandlerOptions },
    delegate: HandlerDelegate,
    callback: HandlerProcessCallback
  ): void {
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
        if (ex.pos && ex.loc && ex.loc.line && ex.loc.column) {
          ex = 'SyntaxError:\n' + codeFrame(source,ex.loc.line,ex.loc.column, {
            highlightCode: true,
            linesAbove: 2,
            linesBelow: 3,
          });
        }
        return callback(ex);
      }

      const needsDeepCopy = Object.keys(options).length > 1;
      for (let key in options) {
        const variant = options[key];
        const variantAst = needsDeepCopy ? this._cloneAst(ast) : ast;

        // suppress babel warnings about large files being compacted from
        // the console and send to our warning logger instead
        const oldLog: any = console.error;
        const oldConsole: any = console;
        oldConsole.error = ((message: any) => {
          delegate.emitWarning([key],message);
        });
        try {
          const result = babel.transformFromAst(
            variantAst,
            source,
            this._injectHandlerOptions(
              resolvedModule,
              scopeId,
              key,
              variant,
              delegate
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
              contentHash: delegate.generateHash(result.code),
              perfStats: stats,
            }
          );
        } catch (ex) {
          callback(
            ex,
            [key]
          );
        }
        oldConsole.error = oldLog;
      }
    });
  }

  _injectHandlerOptions(
    resolvedModule: string, 
    scopeId: string, 
    variant: string, 
    options: HandlerOptions,
    delegate: HandlerDelegate,
  ) {
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
          invariantOptions: this._invariantOptions,
        },
        opts
      );
    }

    if (options.handler.defines) {
      opts.plugins.unshift([
        require('./plugins/replace-defines').default,
        {
          defines: options.handler.defines,
        }
      ]);
    }
    opts.plugins.unshift(require('./plugins/dead-code-removal').default);
    opts.plugins.unshift([
      require('./plugins/scopify-and-process-dependencies').default,
      {
        delegate,
        scope: scopeId,
        variants: [variant],
      },
    ]);
    return opts;
  }
}
