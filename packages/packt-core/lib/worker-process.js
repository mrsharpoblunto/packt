'use strict';

const path = require('path');
const messageTypes = require('./message-types');

class WorkerProcess {
  constructor() {
    this._queue = [];
    this._handlers = [];
    this._busy = false;
  }

  start() {
    // keep the child process alive
    //const heartbeat = setInterval(() => {},100);
    process.on('message',(msg) => {
      switch (msg.type) {
        case messageTypes.CONFIG:
          this._processConfig(msg.config);
          break;

        case messageTypes.CLOSE:
          //clearInterval(heartbeat);
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

  _processConfig(config) {
    for (let pattern in config.handlers) {
      const handler = config.handlers[pattern];
      this._handlers.push({
        pattern: new RegExp(pattern),
        handler: new (require(handler.require))(handler.options),
      });
    }
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
        error: 'No handler matched resolved resource '+ resolved,
        resolved: resolved,
      });
    }

    // hook up all additional events that could be fired by the handler
    // TODO rename Processor maybe?
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
    // TODO send perfStats back load,parse,transform...
    handler.handler.process(
      resolved,
      (err, response) => {
        // clean up all handler listeners
        handler.handler.removeListener(messageTypes.DEPENDENCY,foundDependency);

        if (err) {
          process.send({
            handler: handler.pattern.toString(),
            type: messageTypes.CONTENT,
            error: err.toString(),
            resolved: resolved,
          });
        } else {
          process.send({
            handler: handler.pattern.toString(),
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
