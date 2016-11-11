'use strict';

const cp = require('child_process');
const path = require('path');
const EventEmitter = require('events').EventEmitter;

const messageTypes = require('./message-types');

class Worker extends EventEmitter {
  constructor(config) {
    super();

    this._queueLength = 0;
    this._config = config;
  }

  start() {
    this._process = cp.fork(path.join(__dirname,'worker-process.js'));
    this._process.on('message',this._onMessage.bind(this));
    this._process.on('close',this._onClose.bind(this));
    this._process.send({
      type: messageTypes.CONFIG,
      config: this._config.toJson(),
    });
  }

  _onMessage(m) {
    switch (m.type) {
      case messageTypes.CONTENT:
        // TODO if this is virtual content, it shouldn't affect the queuelength
        --this._queueLength;
        if (m.error) {
          this.emit(messageTypes.CONTENT_ERROR,{
            handler: m.handler,
            error: m.error,
            resolved: m.resolved,
          });
        } else {
          this.emit(messageTypes.CONTENT,{
            handler: m.handler,
            content: m.content,
            perfStats: m.perfStats,
            resolved: m.resolved,
          });
        }
        break;

      case messageTypes.DEPENDENCY:
        this.emit(messageTypes.DEPENDENCY,{
          moduleName: m.moduleName,
          resolvedParentModule: m.resolvedParentModule,
        });
        break;

      default:
        throw new Error('Unknown message type ' + m.type);
    }
  }

  _onClose(code) {
    this._process = null;
    if (code) {
      this.emit(messageTypes.ERROR,{
        code: code,
      });
    }
  }

  // queue up a message that we expect the
  // worker to notify us on upon completion
  enqueue(message) {
    ++this._queueLength;
    this._process.send(message);
  }

  queueLength() {
    return this._queueLength;
  }

  idle() {
    return !this._process || this._queueLength === 0;
  }

  stop() {
    if (!this._process) {
      return Promise.resolve();
    }

    this._process.send({
      type: messageTypes.CLOSE,
    });
    return new Promise((resolve) => {
      const awaitClose = () => {
        if (this._process) {
          setTimeout(awaitClose,100);
        } else {
          resolve();
        }
      }
      awaitClose();
    });
  }
}

module.exports = Worker;
