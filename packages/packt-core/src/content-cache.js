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

  getHandler(variant: string, hash: string): ?HandlerCacheEntry {
    return this._get('handlers', variant, hash);
  }

  putHandler(
    variant: string,
    hash: string,
    cacheEntry: HandlerCacheEntry,
  ): Promise<any> {
    return this._put('handlers', variant, hash, cacheEntry);
  }

  getBundler(variant: string, hash: string): ?BundlerCacheEntry {
    return this._get('bundlers', variant, hash);
  }

  putBundler(
    variant: string,
    hash: string,
    cacheEntry: BundlerCacheEntry,
  ): Promise<any> {
    return this._put('bundlers', variant, hash, cacheEntry);
  }

  _get<T>(pathKey: string, variant: string, hash: string): ?T {
    try {
      const data = fs.readFileSync(
        path.join(this._cachePath, `${pathKey}/${variant}/${hash}.json`),
        'utf8',
      );
      return (JSON.parse(data): T);
    } catch (ex) {
      return null;
    }
  }

  _put(
    pathKey: string,
    variant: string,
    hash: string,
    cacheEntry: T,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      mkdirp(path.join(this._cachePath, `${pathKey}/${variant}`), err => {
        if (err) {
          reject(err);
        } else {
          fs.writeFile(
            path.join(this._cachePath, `${pathKey}/${variant}/${hash}.json`),
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
