/**
 * @flow
 */
import fs from 'fs';

const DIGITS = 
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$_'.split('');
const DIGITS_MAP = {};
for (let i = 0; i < DIGITS.length; ++i) {
  DIGITS_MAP[DIGITS[i]] = i;
}

export default class ScopeIdGenerator {
  _idPool: Array<string>;
  _map: { [key: string]: string };
  _nextId: number;

  constructor(filename: ?string) {
    if (filename) {
      const data = require(filename);
      this._idPool = data.idPool;
      this._map = data.map;
      this._nextId = data.nextId;
    } else {
      this._idPool = [];
      this._map = {};
      this._nextId = 0;
    }
  }

  getId(resolvedModuleName: string): string {
    let result = this._map[resolvedModuleName];
    if (result) {
      return result;
    }

    if (this._idPool.length) {
      return this._idPool.shift();
    }

    result = '';
    let id = this._nextId++;
    while (true) {
      result = DIGITS[id & 0x3f] + result;
      id >>>= 6;
      if (id === 0) {
        break;
      }
    }
    this._map[resolvedModuleName] = result;
    return result;
  }

  save(
    filename: string, 
    filter: (id: string) => boolean
  ): Promise<any> {
    for (let key in this._map) {
      if (!filter(this._map[key])) {
        delete this._map[key];
      }
    }

    return new Promise((resolve,reject) => {
      fs.writeFile(filename,JSON.stringify({
        idPool: this._idPool,
        map: this._map,
        nextId: this._nextId,
      }),(err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
