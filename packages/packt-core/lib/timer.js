'use strict';

class Timer {
  constructor() {
    this._categories = {};
  }

  clear() {
    this._categories = {};
  }

  accumulate(category,values) {
    if (typeof values === 'object') {
      const c = this._categories[category];
      if (!c) {
        this._categories[category] = Object.assign({},values);
      } else {
        for (let sub in values) {
          if (sub in c) {
            c[sub] += values[sub];
          } else {
            c[sub] = values[sub];
          }
        }
      }
    } else {
      this._categories[category] += values;
    }
  }

  get(category,sub) {
    let c = this._categories[category];
    if (arguments.length === 1) {
      return c;
    } else {
      return c[sub];
    }
  }
}

module.exports = Timer;
