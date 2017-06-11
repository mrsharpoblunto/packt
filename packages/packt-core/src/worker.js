/**
 * @flow
 * @format
 */
import child_process from 'child_process';
import path from 'path';
import events from 'events';
import type { MessageType } from './message-types';

const { EventEmitter } = events;

const WORKER_PROCESS = process.env.NODE_ENV === 'packtdev'
  ? 'worker-process-dev.js'
  : 'worker-process.js';

export default class Worker extends EventEmitter {
  _config: PacktConfig;
  _status: WorkerStatusDescription;
  _process: ?child_process$ChildProcess;

  constructor(config: PacktConfig) {
    super();
    this._config = config;
    this._status = {
      status: 'idle',
      description: '',
    };
  }

  start() {
    const process = child_process.fork(path.join(__dirname, WORKER_PROCESS), {
      cwd: this._config.workingDirectory,
    });
    process.on('message', this._onMessage.bind(this));
    process.on('close', this._onClose.bind(this));
    this._process = process;

    this.sendMessage({
      type: 'process_config',
      config: this._config,
    });
  }

  _onMessage(message: MessageType) {
    switch (message.type) {
      case 'bundle_content':
      case 'bundle_content_error':
      case 'bundle_warning':
      case 'module_content':
      case 'module_import':
      case 'module_export':
      case 'module_generated_asset':
      case 'module_warning':
      case 'module_content_error':
        this._emitMessage(message);
        break;
      case 'task_complete':
        this._setStatus('idle');
        break;
      case 'raw_worker_error':
        this._setStatus('error', message.error);
        break;
      default:
        throw new Error('Unknown message type ' + message.type);
    }
  }

  _onClose(code: number) {
    this._process = null;
    if (code) {
      this._setStatus('error', 'Exited with code ' + code);
    }
  }

  _setStatus(status: WorkerStatus, description: ?string) {
    this._status.status = status;
    this._status.description = description || '';
    this._emitMessage({
      type: 'status_change',
      status: this._status,
    });
  }

  sendMessage(message: MessageType) {
    if (this._status.status !== 'idle') {
      throw new Error('Cannot send messages to a busy worker');
    }
    switch (message.type) {
      case 'process_config':
        this._setStatus(
          'configuring',
          'loading config from ' + message.config.configFile,
        );
        break;
      case 'process_module':
        this._setStatus('processing', message.resolvedModule);
        break;
      case 'process_bundle':
        this._setStatus('bundling', message.bundleName);
        break;
      default:
        throw new Error('Unknown message type ' + message.type);
    }
    this._sendMessage(message);
  }

  _sendMessage(message: MessageType) {
    const process = this._process;
    if (process) {
      process.send(message);
    }
  }

  _emitMessage(message: MessageType) {
    this.emit('worker_message', message);
  }

  status(): WorkerStatusDescription {
    return ({ ...this._status }: any);
  }

  stop(): Promise<any> {
    if (!this._process) {
      return Promise.resolve();
    }

    this._sendMessage({ type: 'close' });
    return new Promise(resolve => {
      const awaitClose = () => {
        if (this._process) {
          setTimeout(awaitClose, 100);
        } else {
          this._setStatus('stopped');
          resolve();
        }
      };
      awaitClose();
    });
  }
}
