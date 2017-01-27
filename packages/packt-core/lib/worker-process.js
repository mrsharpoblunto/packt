'use strict';

const path = require('path');
const messageTypes = require('./message-types');
const DefaultResolver = require('./default-resolver');
const OutputPathUtils = require('./output-path-utils');

class WorkerProcess {
  constructor() {
    this._handlers = [];
    this._bundlers = {};
    this._allVariants = [];
  }

  start() {
    process.on('uncaughtException',(err) => {
      process.send({
        type: messageTypes.ERROR,
        message: err.stack,
      });
      process.exit(0);
    });

    process.on('message',(msg) => {
      switch (msg.type) {
        case messageTypes.CONFIG:
          this._processConfig(msg);
          break;

        case messageTypes.CLOSE:
          process.exit(0);
          break;

        case messageTypes.PROCESS:
          this._processContent(
            msg.resolvedModule,
            msg.scopeId,
            msg.context
          );
          break;

        case messageTypes.BUNDLE:
          this._bundleContent(
            msg.bundle,
            msg.variant,
            msg.data,
            msg.context
          );
          break;

        default:
          throw new Error('Unknown message type ' + msg.type);
      }
    });
  }

  _createHandlerUtils(msg) {
    const pathUtils = new OutputPathUtils(
      msg.config
    );
    const resolver = new DefaultResolver(
      DefaultResolver.defaultOptions(msg.workingDirectory)
    );
    pathUtils.resolve = (path, cb) => resolver.resolve(
      path,
      msg.configFile,
      false,
      cb
    );
    return pathUtils;
  }

  _processConfig(msg) {
    const config = msg.config;
    const configFile = msg.configFile;
    const utils = this._createHandlerUtils(msg);

    this._allVariants = Object.keys(config.options);

    for (let handlerConfig of config.handlers) {
      const handler = {
        pattern: new RegExp(handlerConfig.pattern),
        handler: new (require(handlerConfig.require))(),
        invariantOptions: {
          global: config.invariantOptions,
          handler: handlerConfig.invariantOptions,
        },
        options: {},
      };
      for (let v in config.options) {
        handler.options[v] = {
          global: config.options[v],
          handler: handlerConfig.options[v],
        };
      }
      this._handlers.push(handler);
    }

    const initializing = this._handlers
      .map((h) => new Promise((resolve, reject) => {
        try {
          h.handler.init(
            h.invariantOptions,
            utils,
            (err) => err ? reject(err) : resolve()
          );
        } catch (ex) {
          reject(ex);
        }
      }));

    for (let b in config.bundlers) {
      const bundlerConfig = config.bundlers[b];
      const bundler = {
        bundler: new (require(bundlerConfig.require))(),
        invariantOptions: {
          global: config.invariantOptions,
          handler: bundlerConfig.invariantOptions,
        },
        options: {},
      }
      for (let v in config.options) {
        bundler.options[v] = {
          global: config.options[v],
          handler: bundlerConfig.options[v],
        };
      }
      this._bundlers[b] = bundler;
    }

    initializing.push.apply(initializing, Object.keys(this._bundlers)
      .map((b) => new Promise((resolve, reject) => {
        try {
          this._bundlers[b].bundler.init(
            b.invariantOptions,
            utils,
            (err) => err ? reject(err) : resolve()
          );
        } catch (ex) {
          reject(ex);
        }
      }))
    );

    Promise.all(initializing).then(() => {
      process.send({ type: messageTypes.TASK_COMPLETE });
    },(err) => {
      process.send({
        type: messageTypes.ERROR,
        message: err.stack,
      });
      process.exit(0);
    });
  }

  _matchHandler(resolvedModule) {
    for (let i = 0;i < this._handlers.length; ++i) {
      if (this._handlers[i].pattern.test(resolvedModule)) {
        return this._handlers[i];
      }
    }
  }

  _processContent(resolvedModule, scopeId, context) {
    const handler = this._matchHandler(resolvedModule);
    if (!handler) {
      process.send({
        type: messageTypes.CONTENT,
        variants: this._allVariants,
        error: 'No handler matched resolved resource '+ resolvedModule,
        source: resolvedModule,
        context: context,
      });
      process.send({ type: messageTypes.TASK_COMPLETE });
      return;
    }

    handler.handler.on(messageTypes.IMPORT,(d) => {
      process.send(Object.assign({
        type: messageTypes.IMPORT,
        resolvedModule: resolvedModule,
        context: context,
      }, d));
    });

    handler.handler.on(messageTypes.EXPORT,(d) => {
      process.send(Object.assign({
        type: messageTypes.EXPORT,
        resolvedModule: resolvedModule,
        context: context,
      }, d));
    });

    handler.handler.on(messageTypes.WARNING,(d) => {
      process.send(Object.assign({
        type: messageTypes.WARNING,
        resolvedModule: resolvedModule,
        context: context,
      }, d));
    });

    handler.handler.on(messageTypes.GENERATED,(d) => {
      process.send(Object.assign({
        type: messageTypes.GENERATED,
        resolvedModule: resolvedModule,
        context: context,
      }, d));
    });

    let remaining = this._allVariants.slice(0);
    handler.handler.process(
      resolvedModule,
      scopeId,
      handler.options,
      (err, variants, response) => {
        if (err) {
          process.send({
            handler: handler.pattern.toString(),
            variants: variants || this._allVariants,
            type: messageTypes.CONTENT,
            error: typeof err === 'string' ? err : err.stack,
            resolvedModule: resolvedModule,
            context: context,
          });
        } else {
          process.send({
            handler: handler.pattern.toString(),
            variants: variants || this._allVariants,
            type: messageTypes.CONTENT,
            content: response.content,
            contentType: response.contentType,
            perfStats: response.perfStats,
            resolvedModule: resolvedModule,
            context: context,
          });
        }

        // once all the expected variants are processed, go onto the next task
        remaining = remaining.filter((r) => !(variants || this._allVariants).find((v) => v === r));
        if (!remaining.length) {
          handler.handler.removeAllListeners();
          process.send({ type: messageTypes.TASK_COMPLETE });
        }
      }
    );
  }

  _bundleContent(bundleName, variant, data, context) {
    const bundler = this._bundlers[data.bundler];
    if (!bundler) {
      process.send({
        type: messageTypes.BUNDLE,
        error: 'No bundler matched the name '+ bundleName,
        context: context,
      });
      process.send({ type: messageTypes.TASK_COMPLETE });
      return;
    }

    bundler.bundler.process(
      bundler.options[variant],
      (err, response) => {
        if (err) {
          process.send({
            bundle: bundleName,
            bundler: data.bundler,
            type: messageTypes.BUNDLE,
            error: typeof err === 'string' ? err : err.stack,
            context: context,
          });
        } else {
          process.send({
            bundle: bundleName,
            bundler: data.bundler,
            type: messageTypes.BUNDLE,
            perfStats: response.perfStats,
            context: context,
          });
        }
        process.send({ type: messageTypes.TASK_COMPLETE });
      }
    );
  }
}

new WorkerProcess().start();
