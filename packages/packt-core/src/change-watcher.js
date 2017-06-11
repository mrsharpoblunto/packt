/**
 * @flow
 * @format
 */
import path from 'path';
import events from 'events';
import watchman from 'fb-watchman';
import type { DependencyGraph, DependencyNode } from './dependency-graph';

export type ChangeDetails = {|
  name: string,
  exists: boolean,
  type: string,
|};

export type ChangeCallback = (
  err: ?Error,
  files?: Array<ChangeDetails>,
) => mixed;

const PACKT_BUILD_WATCH = 'packt_build_watch';

export default class ChangeWatcher extends events.EventEmitter {
  _config: PacktConfig;
  _client: any;
  _paused: boolean;
  _callback: ?ChangeCallback;
  _fileBuffer: Array<ChangeDetails>;
  _start: number;

  constructor(config: PacktConfig) {
    super();
    this._config = config;
    this._client = new watchman.Client();
    this._paused = false;
    this._callback = null;
    this._fileBuffer = [];
    this._start = Date.now() / 1000;
  }

  onChange(callback: ChangeCallback) {
    this._callback = callback;
    this._client.capabilityCheck(
      { optional: [], required: ['relative_root'] },
      (err, resp) => {
        if (err) {
          return this._callback && this._callback(err);
        }

        this._client.command(
          ['watch-project', this._config.invariantOptions.rootPath],
          (err, resp) => {
            if (err) {
              return this._callback && this._callback(err);
            }
            if (resp.warning) {
              this.emit('warning', resp.warning);
            }

            this._client.command(['clock', resp.watch], (err, clockResp) => {
              if (err) {
                return this._callback && this._callback(err);
              }
              if (clockResp.warning) {
                this.emit('warning', clockResp.warning);
              }

              const sub: Object = {
                expression: [
                  'allof',
                  ['anyof', ['match', '**/*.*', 'wholename'], ['dirname', '']],
                  [
                    'not',
                    [
                      'match',
                      path.relative(
                        this._config.invariantOptions.rootPath,
                        this._config.invariantOptions.cachePath,
                      ) + '/**',
                      'wholename',
                    ],
                  ],
                  [
                    'not',
                    [
                      'match',
                      path.relative(
                        this._config.invariantOptions.rootPath,
                        this._config.invariantOptions.outputPath,
                      ) + '/**',
                      'wholename',
                    ],
                  ],
                ],
                since: clockResp.clock,
                fields: ['name', 'exists', 'type'],
              };
              if (resp.relative_path) {
                sub.relative_root = resp.relative_path;
              }

              this._client.command(
                ['subscribe', resp.watch, PACKT_BUILD_WATCH, sub],
                (err, resp) => {
                  if (err) {
                    return this._callback && this._callback(err);
                  }
                },
              );
              this._client.on('subscription', resp => {
                if (resp.subscription !== PACKT_BUILD_WATCH) {
                  return;
                }
                if (this._paused) {
                  for (let f of resp.files) {
                    this._fileBuffer.push(f);
                  }
                } else {
                  this._paused = true;
                  this._filterChanges(resp.files);
                }
              });
            });
          },
        );
      },
    );
  }

  resume() {
    if (this._paused) {
      if (this._fileBuffer.length) {
        const buffer = this._fileBuffer;
        this._fileBuffer = [];
        this._filterChanges(buffer);
      } else {
        this._paused = false;
      }
    }
  }

  _filterChanges(files: Array<ChangeDetails>) {
    files.forEach(
      f =>
        (f.name = path.resolve(this._config.invariantOptions.rootPath, f.name)),
    );
    this._callback && this._callback(null, files);
  }
}
