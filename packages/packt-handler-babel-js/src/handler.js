/**
 * @flow
 */
import {transformFromAst} from 'babel-core';
import OptionsManager from 'babel-core/lib/transformation/file/options/option-manager';
import codeFrame from 'babel-code-frame';
import {parse} from 'babylon';
import fs from 'fs';

type TransformBabelOptionsFunction = (
  context: {
    resolvedModule: string,
    scopeId: string,
    variant: string,
    options: Object,
    invariantOptions: Object,
  },
  babelOptions: Object
) => void;

export default class BabelJsHandler implements Handler {
  _invariantOptions: HandlerOptions;
  _handlerInvariants: {
    babelOptionsProcessor?: TransformBabelOptionsFunction,
    parserOptions: Object,
    loadedParserOptions: boolean,
  };
  _parserOptions: ?Object;

  init(
    invariantOptions: HandlerOptions,
    delegate: HandlerDelegate,
    callback: HandlerInitCallback
  ): void {
    this._invariantOptions = invariantOptions;
    this._handlerInvariants = {
      parserOptions: { 
        sourceType: 'module',
        plugins: [],
      },
      loadedParserOptions: false,
    };

    if (invariantOptions.handler.transformOptsProcessor) {
      delegate.resolve(invariantOptions.handler.transformOptsProcessor, 
      (err: ?Error, resolved: ?string) => {
        if (err) {
          return callback(err);
        }

        try {
          this._handlerInvariants.babelOptionsProcessor = require(resolved);
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

  _ensureParserOptions(
    options: { [key: string]: HandlerOptions }, 
    delegate: HandlerDelegate
  ) {
    if (this._handlerInvariants.loadedParserOptions) {
      return;
    }

    // parser plugins are invariant as we only want to parser a given
    // file once to generate the ast. however because babel options are
    // variant, we need to create a parser options object which contains
    // all plugins used across any variant to ensure that all the plugins
    // in each variant work correctly
    const pluginSet: Set<string> = new Set();
    for (let key in options) {
      try {
        let opts = options[key].handler.babelOptions;
        if (!opts) {
          opts = options[key].handler.babelOptions = {};
        }
        const optsManager = new OptionsManager();
        const loadedOptions = optsManager.init(opts);

        const parserOpts = { plugins: [] };
        for (let plugin of loadedOptions.plugins) {
          if (plugin[0].manipulateOptions) {
            plugin[0].manipulateOptions(opts, parserOpts);
          }
        }

        for (let parserPlugin of parserOpts.plugins) {
          pluginSet.add(parserPlugin);
        }
      } catch (ex) {
        delegate.emitWarning([key],'Unable to load babelOptions object ' + ex.toString());
      }

    }

    for (let parserPlugin of pluginSet) {
      this._handlerInvariants.parserOptions.plugins.push(parserPlugin);
    }
    this._handlerInvariants.loadedParserOptions = true;
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

    this._ensureParserOptions(options, delegate);
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
        ast = parse(
          source,
          Object.assign(
            {
              sourceFileName: resolvedModule,
            },
            this._handlerInvariants.parserOptions
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
          const result = transformFromAst(
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
    const babelOptions = options.handler.babelOptions || {};

    const opts = Object.assign(
      {},
      babelOptions,
      {
        filename: resolvedModule,
        plugins: babelOptions.plugins ? babelOptions.plugins.slice(0) : []
      }
    );

    // allow custom logic & transforms to be instantiated via a provided
    // module
    if (this._handlerInvariants.babelOptionsProcessor) {
      this._handlerInvariants.babelOptionsProcessor(
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
