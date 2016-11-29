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
            msg.resolved,
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

  _processContent(resolved, context) {
    const handler = this._matchHandler(resolved);
    if (!handler) {
      process.send({
        type: messageTypes.CONTENT,
        variants: this._allVariants,
        error: 'No handler matched resolved resource '+ resolved,
        resolved: resolved,
        context: context,
      });
      process.send({ type: messageTypes.TASK_COMPLETE });
      return;
    }

    handler.handler.on(messageTypes.DEPENDENCY,(d) => {
      process.send({
        type: messageTypes.DEPENDENCY,
        moduleName: d.moduleName,
        variants: d.variants,
        resolvedParentModule: resolved,
        context: context,
      });
    });

    let remaining = this._allVariants.slice(0);
    handler.handler.process(
      resolved,
      handler.options,
      (err, variants, response) => {
        if (err) {
          process.send({
            handler: handler.pattern.toString(),
            variants: variants || this._allVariants,
            type: messageTypes.CONTENT,
            error: err.stack,
            resolved: resolved,
            context: context,
          });
        } else {
          // TODO content requires a bunch of metadata such as
          // exports & string offsets for doing tree shaking + top level
          // declarations for doing scope hoisting
          process.send({
            handler: handler.pattern.toString(),
            variants: variants || this._allVariants,
            type: messageTypes.CONTENT,
            content: response.content,
            perfStats: response.perfStats,
            resolved: resolved,
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
