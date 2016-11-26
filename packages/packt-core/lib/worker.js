'use strict';

const cp = require('child_process');
const path = require('path');
const EventEmitter = require('events').EventEmitter;

const messageTypes = require('./message-types');
const workerStatus = require('./worker-status');

class Worker extends EventEmitter {
  constructor(config) {
    super();
    this._config = config;
    this._status = {};
    this._setStatus(workerStatus.INITIALIZING);
  }

  start() {
    this._process = cp.fork(path.join(__dirname,'worker-process.js'));
    this._process.on('message',this._onMessage.bind(this));
    this._process.on('close',this._onClose.bind(this));
    this._process.send({
      type: messageTypes.CONFIG,
      config: this._config.config,
      configFile: this._config.configFile,
      workingDirectory: this._config.workingDirectory,
    });
  }

  _onMessage(m) {
    switch (m.type) {
      case messageTypes.TASK_COMPLETE:
        this._setStatus(workerStatus.IDLE);
        break;

      case messageTypes.CONTENT:
        if (m.error) {
          this.emit(messageTypes.CONTENT_ERROR,{
            handler: m.handler,
            variants: m.variants,
            error: m.error,
            resolved: m.resolved,
            context: m.context,
          });
        } else {
          this.emit(messageTypes.CONTENT,{
            handler: m.handler,
            variants: m.variants,
            content: m.content,
            perfStats: m.perfStats,
            resolved: m.resolved,
            context: m.context,
          });
        }
        break;

      case messageTypes.DEPENDENCY:
        this.emit(messageTypes.DEPENDENCY,{
          moduleName: m.moduleName,
          variants: m.variants,
          resolvedParentModule: m.resolvedParentModule,
          context: m.context,
        });
        break;

      case messageTypes.ERROR:
        this._setStatus(
          workerStatus.ERROR,
          m.message
        );
        break;

      default:
        throw new Error('Unknown message type ' + m.type);
    }
  }

  _onClose(code) {
    this._process = null;
    if (code) {
      this._setStatus(
        workerStatus.ERROR,
        'Exited with code ' + code
      );
    }
  }

  _setStatus(status,description) {
    this._status.status = workerStatus.ERROR;
    this._status.description = description || '';
    this.emit(messageTypes.STATUS_CHANGE, this._status);
  }

  send(message) {
    if (this._status.status !== workerStatus.IDLE) {
      throw new Error('Cannot send messages to a busy worker');
    }
    switch (message.type) {
      case messageTypes.PROCESS:
        this._setStatus(
          workerStatus.PROCESSING,
          message.moduleName
        );
        break;
      case messageTypes.BUNDLING:
        this._setStatus(
          workerStatus.BUNDLING,
          message.bundle
        );
        break;
      default:
        throw new Error('Unknown message type ' + m.type);
    }
    this._process.send(message);
    return true;
  }

  status() {
    return Object.assign({},this._status);
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
          this._setStatus(workerStatus.STOPPED);
          resolve();
        }
      }
      awaitClose();
    });
  }
}

module.exports = Worker;
