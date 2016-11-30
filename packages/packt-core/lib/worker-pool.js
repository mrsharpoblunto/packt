'use strict';

const EventEmitter = require('events').EventEmitter;
const Worker = require('./worker');
const messageTypes = require('./message-types');
const workerStatus = require('./worker-status');
const errors = require('./packt-errors');

class WorkerPool extends EventEmitter {
  constructor(config) {
    super();

    this._queue = [];
    this._workers = [];
    this._idle = true;

    for (let i = 0; i < config.config.invariantOptions.workers; ++i) {
      this._workers.push(new Worker(config));
    }
  }

  start() {
    this._workers.forEach((w, index) => {
      w.on(messageTypes.CONTENT,(m) => {
        this.emit(messageTypes.CONTENT,m);
      });
      w.on(messageTypes.CONTENT_ERROR,(m) => {
        this.emit(messageTypes.CONTENT_ERROR,{
          error: new errors.PacktContentError(
            m.handler,
            m.variants,
            m.error,
            m.resolved
          )
        });
      });
      w.on(messageTypes.DEPENDENCY,(m) => {
        this.emit(messageTypes.DEPENDENCY,m);
      });
      w.on(messageTypes.STATUS_CHANGE,(s) => {
        switch (s.status) {
          case workerStatus.IDLE:
            this._dequeue();
            if (this._idle) {
              this.emit(messageTypes.IDLE);
            }
            break;
          case workerStatus.ERROR:
            this.emit(messageTypes.ERROR,{
              error: new errors.PacktWorkerError(index, s.description),
            });
            break;
        }
      });
      w.start()
    });
  }

  process(resolved, context) {
    this._queue.push({
      type: messageTypes.PROCESS,
      resolved: resolved,
      context: context,
    });
    this._dequeue();
  }

  _dequeue() {
    if (this._queue.length) {
      this._idle = false;
      let i = 0;
      for (let w of this._workers) {
        ++i;
        if (w.status().status === workerStatus.IDLE) {
          const queued = this._queue.shift();
          w.send(queued);
          break;
        }
      }
    } else {
      this._idle = this._workers.reduce((prev,next) => {
        return prev && next.status().status === workerStatus.IDLE;
      },true);
    }
  }

  stop() {
    return Promise.all(this._workers.map((w) => {
      w.removeAllListeners();
      w.stop()
    }));
  }

  idle() {
    return this._idle;
  }

  status() {
    return this._workers.map((w) => w.status());
  }
}

module.exports = WorkerPool;
