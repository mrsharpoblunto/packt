'use strict';
const fs = require('fs');
const mime = require('mime');
const EventEmitter = require('events').EventEmitter;

mime.default_type = 'text/plain';

class RawHandler extends EventEmitter {

  init(invariants, utils, callback) {
    this._handlerInvariants = invariants.handler;
    callback();
  }

  process(resolvedModule, scopeId, variants, callback) {
    const stats = {};
    let start = Date.now();
    fs.readFile(resolvedModule, (err,data) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        return callback(err);
      }

      try {
        start = Date.now();
        let contentType = mime.lookup(resolvedModule);
        let encoding = (
          contentType.indexOf('text/')===0 ? 'utf8' : 'base64'
        );

        let source = new Buffer(data).toString(encoding);

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
            content: source,
            contentType: contentType,
            metadata: {
              sourceLength: source.length,
              transformedLength: source.length,
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
