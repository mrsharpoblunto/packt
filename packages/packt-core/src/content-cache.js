/**
 * @flow
 * @format
 */
import path from 'path';
import mkdirp from 'mkdirp';
import fs from 'fs';

export default class ContentCache {
  _cachePath: string;

  constructor(config: PacktConfig) {
    this._cachePath = config.invariantOptions.cachePath;
  }

  get(variant: string, hash: string): ?HandlerCacheEntry {
    try {
      const data = fs.readFileSync(
        path.join(this._cachePath, `handlers/${variant}/${hash}.json`),
        'utf8',
      );
      return JSON.parse(data);
    } catch (ex) {
      return null;
    }
  }

  put(
    variant: string,
    hash: string,
    cacheEntry: HandlerCacheEntry,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      mkdirp(path.join(this._cachePath, `handlers/${variant}`), err => {
        if (err) {
          reject(err);
        } else {
          fs.writeFile(
            path.join(this._cachePath, `handlers/${variant}/${hash}.json`),
            JSON.stringify(cacheEntry),
            err => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            },
          );
        }
      });
    });
  }
}
