'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class IgnoreHandler extends EventEmitter {

  init(invariants, resolver, callback) {
    callback();
  }

  process(resolved, scopeId, variants, callback) {
    callback(
      null,
      Object.keys(variants),
      {
        content: '',
        perfStats: {
          diskIO: 0,
          transform: 0,
        },
      }
    );
  }
}

module.exports = IgnoreHandler;
