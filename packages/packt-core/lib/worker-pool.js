'use strict';

const EventEmitter = require('events').EventEmitter;
const Worker = require('./worker');
const messageTypes = require('./message-types');

class WorkerPool extends EventEmitter {
  constructor(config) {
    super();

    this._workers = [];
    for (let i = 0; i < config.options.workers; ++i) {
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
      worker.on(messageTypes.ERROR,(m) => {
        this.emit(messageTypes.ERROR,{
          error: new Error('Worker process closed unexpectedly with code ' + m.code),
        });
      });
      this._workers.push(worker);
    }
  }

  start() {
    this._workers.forEach((w) => w.start());
  }

  process(resolved) {
    this._enqueue({
      type: messageTypes.PROCESS,
      resolved: resolved,
    });
  }

  _enqueue(message) {
    // give tasks to the least busy worker
    this._workers.sort((a,b) => a.queueLength() - b.queueLength());
    this._workers[0].enqueue(message);
  }

  stop() {
    return Promise.all(this._workers.map((w) => w.stop()));
  }

  idle() {
    return this._workers.reduce((prev,current) => prev && current.idle(),true);
  }
}

module.exports = WorkerPool;
