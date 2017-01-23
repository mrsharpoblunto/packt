'use strict';

const path = require('path');
const messageTypes = require('./message-types');
const DefaultResolver = require('./default-resolver');

class WorkerProcess {
  constructor() {
    this._handlers = [];
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

        default:
          throw new Error('Unknown message type ' + msg.type);
      }
    });
  }

  _processConfig(msg) {
    const config = msg.config;
    const configFile = msg.configFile;
    const resolver = new DefaultResolver(
      DefaultResolver.defaultOptions(msg.workingDirectory)
    );

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
            (path, cb) => resolver.resolve(path, configFile, cb),
            (err) => err ? reject(err) : resolve()
          );
        } catch (ex) {
          reject(ex);
        }
      }));

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

  _matchHandler(resolved) {
    for (let i = 0;i < this._handlers.length; ++i) {
      if (this._handlers[i].pattern.test(resolved)) {
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
        error: 'No handler matched resolved resource '+ resolved,
        source: resolved,
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
}

new WorkerProcess().start();
