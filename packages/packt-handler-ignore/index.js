'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class IgnoreHandler extends EventEmitter {

  process(resolved,callback) {
    callback(null,{
      content: '',
      perfStats: {
        diskIO: 0,
        transform: 0,
      },
    });
  }
}

module.exports = IgnoreHandler;
