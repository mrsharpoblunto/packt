'use strict'
const EventEmitter = require('events').EventEmitter;

class JsBundler {
  constructor() {
  }
  init(invariants, utils, cb) {
    cb();
  }
  process(options, data, cb) {
    const minify = options.minify;
    // if minify, do replace of __packt_imports
    // otherwise add a shim function and lookup from module map
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
