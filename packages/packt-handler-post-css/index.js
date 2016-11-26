'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;
const postcss = require('postcss');

class CssHandler extends EventEmitter {

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

      start = Date.now();
      postcss([
      ])
      .process(source)
      .then((result) => {
        stats.transform = Date.now() - start;
        callback(null,{
          content: result.css,
          variants: Object.keys(variants),
          perfStats: stats,
        });
      })
      .catch((err) => {
        callback(err);
      });
    });
  }
}

module.exports = CssHandler;
