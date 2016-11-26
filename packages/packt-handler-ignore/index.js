'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class IgnoreHandler extends EventEmitter {

  init(invariants, resolver, callback) {
    callback();
  }

  process(resolved, variants, callback) {
    callback(null,{
      content: '',
      variants: Object.keys(variants),
      perfStats: {
        diskIO: 0,
        transform: 0,
      },
    });
  }
}

module.exports = IgnoreHandler;
