'use strict'
const EventEmitter = require('events').EventEmitter;

class JsBundler {
  constructor() {
  }
  init(invariants, utils, cb) {
    cb();
  }
  process(options, cb) {
    cb(null,
    {
      perfStats: {
        transform: 0,
        diskIO: 0,
      }
    });
  }
}

module.exports = JsBundler;
