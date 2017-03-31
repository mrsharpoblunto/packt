/**
 * @flow
 */
import events from 'events';
import Worker from './worker';
import type {
  PacktConfig,
} from '../types';
import type {
  MessageType,
} from './message-types';
import type {
  WorkerStatusDescription,
} from './worker';
import * as errors from './packt-errors';

const {EventEmitter} = events;

export default class WorkerPool extends EventEmitter {
  _messageQueue: Array<MessageType>;
  _workers: Array<Worker>;
  _idle: boolean;

  constructor(config: PacktConfig) {
    super();

    this._messageQueue = [];
    this._workers = [];
    this._idle = true;

    for (let i = 0; i < config.invariantOptions.workers; ++i) {
      this._workers.push(new Worker(config));
    }
  }

  _emitMessage(message: MessageType) {
    this.emit('worker_pool_message', message);
  }

  _handleWorkerMessage(
    worker: Worker, 
    workerIndex: number,
    message: MessageType
  ) {
    switch (message.type) {
      case 'module_content':
      case 'bundle_content':
      case 'module_import':
      case 'module_export':
      case 'module_generated_asset':
      case 'module_warning':
      case 'module_content_error':
      case 'bundle_content_error':
        this._emitMessage(message);
        break;
      case 'status_change':
        const s = worker.status();
        switch (s.status) {
          case 'idle':
            this._dequeueMessage();
            if (this._idle) {
              this._emitMessage({ type: 'idle' });
            }
            break;
          case 'error':
            this._emitMessage({
              type: 'worker_error',
              error: new errors.PacktWorkerError(workerIndex, s.description),
            });
            break;
        }
    }
  }

  start() {
    this._workers.forEach((w, index) => {
      w.on(
        'worker_message',
        this._handleWorkerMessage.bind(this, w, index)
      );
      w.start()
    });
  }

  processModule(
    resolvedModule: string, 
    scopeId: string,
    context: any
  ) {
    this._messageQueue.push({
      type: 'process_module',
      resolvedModule: resolvedModule,
      scopeId: scopeId,
      context: context,
    });
    this._dequeueMessage();
  }

  processBundle(
    bundle: string, 
    variant: string,
    data: any, // TODO type this
    context: any
  ) {
    this._messageQueue.push({
      type: 'process_bundle',
      bundleName: bundle,
      variant: variant,
      data: data,
      //context: context,
    });
    this._dequeueMessage();
  }

  _dequeueMessage() {
    if (this._messageQueue.length) {
      this._idle = false;
      let i = 0;
      for (let w of this._workers) {
        ++i;
        if (w.status().status === 'idle') {
          const queued = this._messageQueue.shift();
          w.sendMessage(queued);
          break;
        }
      }
    } else {
      this._idle = this._workers.reduce((prev,next) => {
        return prev && next.status().status === 'idle';
      },true);
    }
  }

  stop(): Promise<any> {
    return Promise.all(this._workers.map((w) => {
      w.removeAllListeners();
      w.stop()
    }));
  }

  idle(): boolean {
    return this._idle;
  }

  status(): Array<WorkerStatusDescription> {
    return this._workers.map((w) => w.status());
  }
}
