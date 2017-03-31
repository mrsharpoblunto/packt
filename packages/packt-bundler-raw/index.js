'use strict'
const mkdirp = require('mkdirp');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class RawBundler extends EventEmitter {
  init(invariants, utils, cb) {
    cb();
  }
  process(options, data, cb) {
    mkdirp(data.outputParentPath,(err) => {
      if (err) {
        return cb(err);
      }

      const perfStats = {
        transform: 0,
        diskIO: 0,
      };

      const start = Date.now();
      var wstream = fs.createWriteStream(data.outputPath);
      wstream.on('finish',() => {
        perfStats.diskIO = Date.now() - start;
        cb(null,{
          perfStats: perfStats,
        });
      });
      wstream.on('error',(err) => {
        cb(err);
      });
      for (let module of data.modules) {
        wstream.write(
          module.content, 
          module.contentType.indexOf('text/')===0?'utf8':'base64'
        );
      }
      wstream.end();
    });
  }
}

module.exports = RawBundler;
