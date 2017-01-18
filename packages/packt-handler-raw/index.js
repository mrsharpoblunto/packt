'use strict';
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class RawHandler extends EventEmitter {

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
          Object.keys(variants)
        );
        return;
      }

      try {
        start = Date.now();
        const transformed = 'var ' + scopeId + '="' + JSON.stringify(source) + '";';
        stats.transform = Date.now() - start;

        this.emit('export', {
          exported: {
            identifier: scopeId,
            symbols: ['*'],
            esModule: false,
          },
          variants: Object.keys(variants),
        });

        callback(
          null,
          Object.keys(variants),
          {
            content: transformed,
            contentType: 'text/javascript',
            metadata: {
              sourceLength: source.length,
              transformedLength: transformed.length,
            },
            perfStats: stats,
          }
        );
      }
      catch (err) {
        callback(
          err,
          Object.keys(variants)
        );
      }
    });
  }
}

module.exports = RawHandler;
