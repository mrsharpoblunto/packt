'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class JsonHandler extends EventEmitter {
  init(invariants, resolver, callback) {
    callback();
  }

  process(resolved, variants, callback) {
    const stats = {};
    let start = Date.now();
    fs.readFile(resolved,'utf8',(err,source) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        callback(err);
        return;
      }

      try {
        start = Date.now();
        const result = JSON.parse(source);
        stats.transform = Date.now() - start;
        callback(null,{
          content: 'module.exports = ' + source,
          variants: Object.keys(variants),
          perfStats: stats,
        });
      }
      catch (err) {
        callback(err);
      }
    });
  }
}

module.exports = JsonHandler;
