'use strict'
const EventEmitter = require('events').EventEmitter;
const mkdirp = require('mkdirp');
const fs = require('fs');

const PACKT_PLACEHOLDER_PATTERN = /__packt_(\w*?)__\((.*?)\)/g;

class JsBundler extends EventEmitter {
  init(invariants, utils, cb) {
    cb();
  }
  process(options, data, cb) {
    const perfStats = {};
    let start = Date.now();

    let bundleContent = '';
    for (let module of data.modules) {
      // TODO need to handle text/css differently. 
      // need to also handle non text/javascript differently
      bundleContent += module.content.replace(
        PACKT_PLACEHOLDER_PATTERN,
        (match, type, args) => {
          args = JSON.parse('[' + args.replace(/\'/g,'"') + ']');
          switch (type) {
            case 'import': {
              // replace imports with the imported modules exported identifier
              // TODO handle errors where the lookups aren't found.
              const aliases = data.moduleMap[module.resolvedModule].importAliases;
              const lookup = aliases[args[0]];
              const entry = data.moduleMap[lookup];
              return entry.exportsIdentifier;
              break;
            }
            case 'asset':
              // replace asset paths with thier hashed public paths
              break;
            default:
              this.emit('warning', {
                warning: 'Unknown packt placeholder type "' + 
                  type + '" found in module',
              });
              return match;
          }

          return type;
        }
      );
    }

    // TODO do some treeshake preprocessing if needed
    // TODO if minify set, run uglify over bundleContent

    perfStats.transform = Date.now() - start;
    start = Date.now();

    mkdirp(data.outputParentPath,(err) => {
      if (err) {
        return cb(err);
      }

      fs.writeFile(data.outputPath, bundleContent, (err) => {
        if (err) {
          return cb(err);
        }

        perfStats.diskIO = Date.now() - start;
        cb(null,
        {
          perfStats: perfStats,
        });
      });
    });
  }
}

module.exports = JsBundler;
