'use strict'
const EventEmitter = require('events').EventEmitter;

class RawBundler {
  constructor() {
  }
  init(invariants, utils, cb) {
    cb();
  }
  process(options, data, cb) {
    cb(null,{
      perfStats: {
        transform: 0,
        diskIO: 0,
      },
    });

  }
}

module.exports = RawBundler;
