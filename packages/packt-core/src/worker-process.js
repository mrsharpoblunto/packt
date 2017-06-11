/**
 * @flow
 * @format
 */
import type {
  MessageType,
  ProcessConfigMessage,
  ProcessModuleMessage,
  ProcessBundleMessage,
} from './message-types';
import path from 'path';
import { getOrCreate } from './helpers';
import BuiltInResolver from './built-in-resolver';
import OutputPathHelpers from './output-path-helpers';
import ContentCache from './content-cache';

class HandlerCacheHelper {
  entries: {
    [variant: string]: {|
      entry: HandlerCacheEntry,
      isCacheable: boolean,
    |},
  };

  constructor() {
    this.entries = {};
  }

  get(
    variant: string,
  ): {|
    entry: HandlerCacheEntry,
    isCacheable: boolean,
  |} {
    return getOrCreate(this.entries, variant, () => ({
      entry: {
        content: '',
        contentType: '',
        contentHash: '',
        exportDeclarations: [],
        importDeclarations: [],
      },
      isCacheable: true,
    }));
  }
}

class WorkerProcess {
  _contentCache: ContentCache;
  _allVariants: Array<string>;
  _handlers: Array<{|
    pattern: RegExp,
    invariantOptions: HandlerOptions,
    options: { [key: string]: HandlerOptions },
    handler: Handler,
    delegateFactory: (
      resolvedModule: string,
      cacheHelper?: HandlerCacheHelper,
    ) => HandlerDelegate,
  |}>;
  _bundles: {
    [key: string]: {
      bundler: string,
      bundlerOptions: { [key: string]: Object },
    },
  };
  _bundlers: {
    [key: string]: {|
      invariantOptions: BundlerOptions,
      options: { [key: string]: BundlerOptions },
      bundler: Bundler,
      delegateFactory: (bundleName: string, variant: string) => BundlerDelegate,
    |},
  };

  constructor() {
    this._handlers = [];
    this._bundlers = {};
    this._allVariants = [];
  }

  start() {
    process.on('uncaughtException', (err: Error) => {
      this._sendMessage({
        type: 'raw_worker_error',
        error: err.stack,
      });
      process.exit(0);
    });

    process.on('message', (msg: MessageType) => {
      switch (msg.type) {
        case 'process_config':
          this._processConfig(msg);
          break;

        case 'close':
          process.exit(0);
          break;

        case 'process_module':
          this._processModule(msg);
          break;

        case 'process_bundle':
          this._processBundle(msg);
          break;

        default:
          throw new Error('Unknown message type ' + msg.type);
      }
    });
  }

  _processConfig(msg: ProcessConfigMessage) {
    const pathUtils = new OutputPathHelpers(msg.config);
    const resolver = new BuiltInResolver(
      BuiltInResolver.defaultOptions(msg.config.workingDirectory),
    );

    this._contentCache = new ContentCache(msg.config);
    this._allVariants = Object.keys(msg.config.options);

    for (let handlerConfig of msg.config.handlers) {
      const handler = {
        pattern: new RegExp(handlerConfig.pattern),
        handler: new (require(handlerConfig.require))(),
        delegateFactory: this._handlerDelegateFactory(
          pathUtils,
          resolver,
          msg.config.configFile,
        ),
        invariantOptions: {
          global: msg.config.invariantOptions,
          handler: handlerConfig.invariantOptions,
        },
        options: {},
      };
      for (let v in msg.config.options) {
        handler.options[v] = {
          global: msg.config.options[v],
          handler: handlerConfig.options[v],
        };
      }
      this._handlers.push(handler);
    }

    const initializing = this._handlers.map(
      h =>
        new Promise((resolve, reject) => {
          try {
            h.handler.init(
              h.invariantOptions,
              h.delegateFactory(''),
              err => (err ? reject(err) : resolve()),
            );
          } catch (ex) {
            reject(ex);
          }
        }),
    );

    for (let b in msg.config.bundlers) {
      const bundlerConfig = msg.config.bundlers[b];
      const bundler = {
        bundler: new (require(bundlerConfig.require))(),
        delegateFactory: this._bundlerDelegateFactory(
          resolver,
          msg.config.configFile,
        ),
        invariantOptions: {
          global: msg.config.invariantOptions,
          bundler: bundlerConfig.invariantOptions,
        },
        options: {},
      };
      for (let v in msg.config.options) {
        bundler.options[v] = {
          global: msg.config.options[v],
          bundler: bundlerConfig.options[v],
        };
      }
      this._bundlers[b] = bundler;
    }

    this._bundles = Object.keys(msg.config.bundles).reduce((prev, next) => {
      const bundle = msg.config.bundles[next];
      prev[next] = {
        bundler: bundle.bundler,
        bundlerOptions: bundle.bundlerOptions,
      };
      return prev;
    }, {});

    initializing.push.apply(
      initializing,
      Object.keys(this._bundlers).map(
        b =>
          new Promise((resolve, reject) => {
            try {
              const bundler = this._bundlers[b];
              bundler.bundler.init(
                bundler.invariantOptions,
                bundler.delegateFactory('', ''),
                err => (err ? reject(err) : resolve()),
              );
            } catch (ex) {
              reject(ex);
            }
          }),
      ),
    );

    Promise.all(initializing).then(
      () => {
        this._sendMessage({ type: 'task_complete' });
      },
      (err: Error) => {
        this._sendMessage({
          type: 'raw_worker_error',
          error: err.stack,
        });
        process.exit(0);
      },
    );
  }

  _matchHandler(resolvedModule: string) {
    for (let i = 0; i < this._handlers.length; ++i) {
      if (this._handlers[i].pattern.test(resolvedModule)) {
        return this._handlers[i];
      }
    }
  }

  _sendMessage(msg: MessageType) {
    if (process.send) {
      process.send(msg);
    }
  }

  _handlerDelegateFactory(
    outputPathHelpers: OutputPathHelpers,
    resolver: BuiltInResolver,
    configFile: string,
  ): (resolvedModule: string, cache?: HandlerCacheHelper) => HandlerDelegate {
    return (resolvedModule: string, cache?: HandlerCacheHelper) => ({
      importsModule: (
        variants: Array<string>,
        importDeclaration: ImportDeclaration,
      ) => {
        if (cache) {
          for (let v of variants) {
            cache.get(v).entry.importDeclarations.push(importDeclaration);
          }
        }
        this._sendMessage({
          type: 'module_import',
          variants,
          resolvedModule,
          importDeclaration,
        });
      },
      exportsSymbols: (
        variants: Array<string>,
        exportDeclaration: ExportDeclaration,
      ) => {
        if (cache) {
          for (let v of variants) {
            cache.get(v).entry.exportDeclarations.push(exportDeclaration);
          }
        }
        this._sendMessage({
          type: 'module_export',
          variants,
          resolvedModule,
          exportDeclaration,
        });
      },
      emitWarning: (variants: Array<string>, warning: string) => {
        if (cache) {
          for (let v of variants) {
            cache.get(v).isCacheable = false;
          }
        }
        this._sendMessage({
          type: 'module_warning',
          variants,
          resolvedModule,
          warning,
        });
      },
      generatedAsset: (
        variants: Array<string>,
        assetName: string,
        outputPath: string,
      ) => {
        if (cache) {
          for (let v of variants) {
            cache.get(v).isCacheable = false;
          }
        }
        this._sendMessage({
          type: 'module_generated_asset',
          variants,
          resolvedModule,
          assetName,
          outputPath,
        });
      },
      resolve: (
        path: string,
        callback: (err: ?Error, resolved: ?string) => void,
      ) => {
        resolver.resolve(path, configFile, false, callback);
      },
      getOutputPaths: outputPathHelpers.getOutputPaths.bind(outputPathHelpers),
      generateHash: outputPathHelpers.generateHash.bind(outputPathHelpers),
      cacheGet: (variant: string, hash: string) => {
        return this._contentCache.get(variant, hash);
      },
    });
  }

  _bundlerDelegateFactory(
    resolver: BuiltInResolver,
    configFile: string,
  ): (bundleName: string, variant: string) => BundlerDelegate {
    return (bundleName: string, variant: string) => ({
      emitWarning: (warning: string) => {
        this._sendMessage({
          type: 'bundle_warning',
          warning: warning,
          bundleName,
          variant,
        });
      },
      resolve: (
        path: string,
        callback: (err: ?Error, resolved: ?string) => void,
      ) => {
        resolver.resolve(path, configFile, false, callback);
      },
    });
  }

  _processModule(msg: ProcessModuleMessage) {
    const handler = this._matchHandler(msg.resolvedModule);
    if (!handler) {
      this._sendMessage({
        type: 'module_content_error',
        variants: this._allVariants,
        error: 'No handler matched resolved resource ' + msg.resolvedModule,
        resolvedModule: msg.resolvedModule,
        handler: '',
      });
      this._sendMessage({ type: 'task_complete' });
      return;
    }

    const cacheHelper = new HandlerCacheHelper();
    const delegate = handler.delegateFactory(msg.resolvedModule, cacheHelper);

    let remaining = this._allVariants.slice(0);
    handler.handler.process(
      msg.resolvedModule,
      msg.scopeId,
      handler.options,
      delegate,
      (err, variants, response) => {
        if (err) {
          this._sendMessage({
            type: 'module_content_error',
            handler: handler.pattern.toString(),
            variants: variants || this._allVariants,
            error: typeof err === 'string' ? err : err.stack,
            resolvedModule: msg.resolvedModule,
          });
        } else if (variants && response) {
          if (response.cacheEntry) {
            // simulate a normal worker process response, but
            // source the data from the cache entry provided
            for (let e of response.cacheEntry.exportDeclarations) {
              delegate.exportsSymbols(variants, e);
            }
            for (let i of response.cacheEntry.importDeclarations) {
              delegate.importsModule(variants, i);
            }
            this._sendMessage({
              type: 'module_content',
              handler: handler.pattern.toString(),
              variants: variants || this._allVariants,
              content: response.cacheEntry.content,
              contentType: response.cacheEntry.contentType,
              contentHash: response.cacheEntry.contentHash,
              perfStats: response.perfStats,
              cacheHit: true,
              resolvedModule: msg.resolvedModule,
            });
          } else {
            const {
              content,
              contentType,
              contentHash,
              sourceContentHash,
            } = response;
            const perfStats = { ...response.perfStats };

            // cache all the responses that we're able to
            let promises = [];
            if (response.cache && sourceContentHash) {
              for (let v of variants) {
                if (cacheHelper.get(v).isCacheable) {
                  const entry = cacheHelper.get(v).entry;
                  entry.contentType = contentType;
                  entry.content = content;
                  entry.contentHash = contentHash;
                  promises.push(
                    this._contentCache.put(v, sourceContentHash, entry),
                  );
                }
              }
              Promise.all(promises).catch(err => {
                this._sendMessage({
                  type: 'raw_worker_error',
                  error: err.stack,
                });
                process.exit(0);
              });
            }

            // then tell the main loop that we're done
            this._sendMessage({
              type: 'module_content',
              handler: handler.pattern.toString(),
              variants: variants || this._allVariants,
              content,
              contentType,
              contentHash,
              perfStats,
              cacheHit: false,
              resolvedModule: msg.resolvedModule,
            });
          }
        }

        // once all the expected variants are processed, go onto the next task
        remaining = remaining.filter(
          r => !(variants || this._allVariants).find(v => v === r),
        );
        if (!remaining.length) {
          this._sendMessage({ type: 'task_complete' });
        }
      },
    );
  }

  _processBundle(msg: ProcessBundleMessage) {
    const dynamicBundleIndex = msg.bundleName.indexOf(':');
    const bundleName = dynamicBundleIndex > 0
      ? msg.bundleName.substr(0, dynamicBundleIndex)
      : msg.bundleName;
    const bundle = this._bundles[bundleName];
    const bundler = this._bundlers[bundle.bundler];
    if (!bundler) {
      this._sendMessage({
        type: 'bundle_content_error',
        bundleName: msg.bundleName,
        variant: msg.variant,
        bundler: '',
        error: 'No bundler matched the name ' + bundleName,
      });
      this._sendMessage({ type: 'task_complete' });
      return;
    }

    const delegate = bundler.delegateFactory(bundleName, msg.variant);

    const bundlerOptions = { ...bundler.options[msg.variant] };
    bundlerOptions.bundler = {
      ...bundlerOptions.bundler,
      ...bundle.bundlerOptions[msg.variant],
    };

    bundler.bundler.process(
      bundleName,
      bundlerOptions,
      msg.data,
      delegate,
      (err: ?(Error | string), response) => {
        if (err) {
          this._sendMessage({
            type: 'bundle_content_error',
            bundleName: msg.bundleName,
            variant: msg.variant,
            bundler: bundle.bundler,
            error: typeof err === 'string' ? err : err.stack,
          });
        } else if (response) {
          this._sendMessage({
            type: 'bundle_content',
            bundleName: msg.bundleName,
            variant: msg.variant,
            bundler: bundle.bundler,
            perfStats: response.perfStats,
          });
        }
        this._sendMessage({ type: 'task_complete' });
      },
    );
  }
}

new WorkerProcess().start();
