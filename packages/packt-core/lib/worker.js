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
    this._status = {
      status: workerStatus.IDLE,
      description: '',
    };
  }

  start() {
    this._process = cp.fork(path.join(__dirname,'worker-process.js'), {
      cwd: this._config.workingDirectory,
    });
    this._process.on('message',this._onMessage.bind(this));
    this._process.on('close',this._onClose.bind(this));
    this.send({
      type: messageTypes.CONFIG,
      config: this._config.config,
      configFile: this._config.configFile,
      workingDirectory: this._config.workingDirectory,
    });
  }

  _onMessage(m) {
    const messageType = m.type;
    delete m.type;

    switch (messageType) {
      case messageTypes.CONTENT:
      case messageTypes.BUNDLE:
      case messageTypes.IMPORT:
      case messageTypes.EXPORT:
      case messageTypes.WARNING:
      case messageTypes.GENERATED:
        this.emit(messageType,m);
        break;

      case messageTypes.TASK_COMPLETE:
        this._setStatus(workerStatus.IDLE);
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
    this._status.status = status;
    this._status.description = description || '';
    this.emit(messageTypes.STATUS_CHANGE, this._status);
  }

  send(message) {
    if (this._status.status !== workerStatus.IDLE) {
      throw new Error('Cannot send messages to a busy worker');
    }
    switch (message.type) {
      case messageTypes.CONFIG:
        this._setStatus(
          workerStatus.CONFIGURING,
          'loading config from ' + message.configFile
        );
        break;
      case messageTypes.PROCESS:
        this._setStatus(
          workerStatus.PROCESSING,
          message.resolvedModule
        );
        break;
      case messageTypes.BUNDLE:
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
