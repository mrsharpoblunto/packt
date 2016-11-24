'use strict';

const path = require('path');
const messageTypes = require('./message-types');
const DefaultResolver = require('./default-resolver');

class WorkerProcess {
  constructor() {
    this._queue = [];
    this._handlers = [];
    this._busy = false;
    this._variantKeys = [];
  }

  start() {
    process.on('uncaughtException',(err) => {
      process.send({
        type: messageTypes.ERROR,
        message: err.toString(),
      });
      process.exit(0);
    });

    process.on('message',(msg) => {
      switch (msg.type) {
        case messageTypes.CONFIG:
          this._variantKeys = Object.keys(msg.variants);
          this._processConfig(msg);
          break;

        case messageTypes.CLOSE:
          process.exit(0);
          break;

        case messageTypes.PROCESS:
          this._queue.push(msg.resolved);
          this._processInput();
          break;

        default:
          throw new Error('Unknown message type ' + msg.type);
      }
    });
  }

  _processConfig(msg) {
    const variants = msg.variants;
    const configFile = msg.configFile;
    const resolver = new DefaultResolver(
      DefaultResolver.defaultOptions(msg.workingDirectory)
    );

    // pick any variant, doesn't matter which as the list of 
    // handlers are invariant
    const config = variants[this._variantKeys[0]];

    for (let i = 0;i < config.handlers.length; ++i) {
      const handler = config.handlers[i];
      const options = this._variantKeys.reduce((prev, k) => {
        prev[key] = variants[k].handlers[i].options;
        return prev;
      },{});
      this._handlers.push({
        pattern: new RegExp(handler.pattern),
        handler: new (require(handler.require))(),
        options: options,
      });
    }

    const wrappedResolver = (path, cb) => {
      resolver.resolve(path, configFile, cb); 
    };

    const handlerInits = this._handlers.map((h) => {
      return new Promise((resolve,reject) => {
        h.handler.init(
          h.options, 
          variants, 
          wrappedResolver, 
          (err) => err ? reject(err) : resolve()
        );
      });
    });

    Promise.all(handlerInits).then(() => {
      process.send({
        type: messageTypes.INITIALIZED,
        message: err.toString(),
      });
    },(err) => {
      process.send({
        type: messageTypes.ERROR,
        message: err.toString(),
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

  _processInput() {
    if (this._busy || !this._queue.length) {
      return;
    }

    this._busy = true;
    const resolved = this._queue.shift();
    const handler = this._matchHandler(resolved);
    if (!handler) {
      return process.send({
        type: messageTypes.CONTENT,
        variants: this._variantKeys,
        error: 'No handler matched resolved resource '+ resolved,
        resolved: resolved,
      });
    }

    // TODO hook up all additional events that could be fired by the handler
    const foundDependency = (moduleName) => {
      process.send({
        type: messageTypes.DEPENDENCY,
        moduleName: moduleName,
        resolvedParentModule: resolved,
      });
    };
    handler.handler.on(messageTypes.DEPENDENCY,foundDependency);

    // resource types are real or virtual. Real resources are checked for
    // changes on incremental builds using file last modified. virtual resources
    // need to be checked by invoking the handlers getCacheKey() function
    // and checking the value in the cache
    handler.handler.process(
      resolved,
      (err, variants, response) => {
        // clean up all handler listeners
        handler.handler.removeListener(messageTypes.DEPENDENCY,foundDependency);

        if (err) {
          process.send({
            handler: handler.pattern.toString(),
            variants: variants,
            type: messageTypes.CONTENT,
            error: err.toString(),
            resolved: resolved,
          });
        } else {
          process.send({
            handler: handler.pattern.toString(),
            variants: variants,
            type: messageTypes.CONTENT,
            content: response.content,
            perfStats: response.perfStats,
            resolved: resolved,
          });
        }
        this._busy = false;
        this._processInput();
      }
    );


  }
}

new WorkerProcess().start();
