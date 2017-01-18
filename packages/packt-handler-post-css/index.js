'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;
const postcss = require('postcss');

class CssHandler extends EventEmitter {

  init(invariants, resolver, callback) {
    callback();
  }

  process(resolved, scopeId, variants, callback) {
    const stats = {};
    let start = Date.now();
    fs.readFile(resolved,'utf8',(err,source) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        callback(
          err,
          Object.keys(variants),
        );
        return;
      }

      start = Date.now();
      postcss([
      ])
      .process(source)
      .then((result) => {
        stats.transform = Date.now() - start;
        callback(
          null,
          Object.keys(variants),
          {
            content: result.css,
            contentType: 'text/css',
            metadata: {
              sourceLength: source.length,
              transformedLength: result.css.length,
            }
            perfStats: stats,
          }
        );
      })
      .catch((err) => {
        callback(
          err,
          Object.keys(variants)
        );
      });
    });
  }
}

module.exports = CssHandler;
