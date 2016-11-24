'use strict';

const EventEmitter = require('events').EventEmitter;
const Worker = require('./worker');
const messageTypes = require('./message-types');
const workerStatus = require('./worker-status');

class WorkerPool extends EventEmitter {
  constructor(config) {
    super();

    this._queue = [];
    this._workers = [];

    for (let i = 0; i < config.options.workers; ++i) {
      this._createWorker(config);
    }
  }

  _createWorker(config) {
    const worker = new Worker(config);

    worker.on(messageTypes.CONTENT,(m) => {
      this.emit(messageTypes.CONTENT,m);
    });
    worker.on(messageTypes.CONTENT_ERROR,(m) => {
      this.emit(messageTypes.CONTENT_ERROR,m);
    });
    worker.on(messageTypes.DEPENDENCY,(m) => {
      this.emit(messageTypes.DEPENDENCY,m);
    });
    worker.on(messageTypes.STATUS_CHANGE,(s) => {
      switch (status) {
        case workerStatus.IDLE:
          this._dequeue();
          break;
        case workerStatus.ERROR:
          this.emit(messageTypes.ERROR,{
            error: new Error('Worker process error: ' + m.message),
          });
          break;
      }
    });
    this._workers.push(worker);
  }

  start() {
    this._workers.forEach((w) => w.worker.start());
  }

  process(resolved) {
    this._queue.push({
      type: messageTypes.PROCESS,
      resolved: resolved,
    });
    this._dequeue();
  }

  _dequeue() {
    if (this._queue.length) {
      for (let w of this._workers) {
        if (w.worker.status().status === workerStatus.IDLE) {
          const queued = this._queue.shift();
          w.worker.send(queued);
          break;
        }
      }
    }
  }

  stop() {
    return Promise.all(this._workers.map((w) => w.worker.stop()));
  }

  idle() {
    return this._workers.reduce((prev,current) => {
      return prev && current.worker.status() === workerStatus.IDLE;
    },true);
  }

  status() {
    return this._workers.map((w) => w.status());
  }
}

module.exports = WorkerPool;
