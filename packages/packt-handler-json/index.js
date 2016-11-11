'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class JsonHandler extends EventEmitter {

  process(resolved,callback) {
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
