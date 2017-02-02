'use strict'
const EventEmitter = require('events').EventEmitter;
const mkdirp = require('mkdirp');
const fs = require('fs');

const PACKT_PLACEHOLDER_PATTERN = /__packt_(\w*?)__\((.*?)\)/g;

const JS_INDEX = 0;
const CSS_INDEX = 1;
class JsBundler extends EventEmitter {
  init(invariants, utils, cb) {
    cb();
  }

  process(options, data, cb) {
    const perfStats = {};
    let start = Date.now();

    const content = [];
    content[JS_INDEX] = '';
    content[CSS_INDEX] = '';

    for (let module of data.modules) {
      try {
        let index;
        if (module.contentType === 'text/javascript') {
          index = JS_INDEX;
        } else if (module.contentType === 'text/css') {
          index = CSS_INDEX;
        } else {
          throw new Error(
            'This bundler can only handle "text/javascript" and "text/css" ' +
            'content types. Module "' + module.resolvedModule + '" has "' +
            module.contentType + '"'
          );
        }

        content[index] += module.content.replace(
          PACKT_PLACEHOLDER_PATTERN,
          (match, type, args) => {
            args = JSON.parse('[' + args.replace(/\'/g,'"') + ']');
            switch (type) {
              case 'import': {
                // replace imports with the imported modules 
                // exported identifier
                const resoledAlias = module.importAliases[args[0]];
                if (!resolvedAlias) {
                  throw new Error(
                    'No import alias "' + args[0] + '" found in module "' + 
                    module.resolvedModule
                  );
                }
                const importedModule = data.moduleMap[resolvedAlias];
                if (!importedModule) {
                  throw new Error(
                    'No module "' + resolvedAlias + 
                    '" found in this bundle'
                  );
                }
                return importedModule.exportsIdentifier;
                break;
              }
              case 'asset': {
                // replace asset paths with their hashed public paths
                const asset = data.assetMap[args[0]];
                if (!asset) {
                  throw new Error(
                    'No asset named "' + asset + ' found'
                  );
                }
                return asset;
                break;
              }
              default:
                this.emit('warning', {
                  warning: 'Unknown packt placeholder type "' + 
                    type + '" found in module',
                });
                return match;
            }

            return type;
          }
        ) + '\n';
      } catch (ex) {
        return cb(ex);
      }
    }

    if (content[CSS_INDEX]) {
      content[CSS_INDEX] = '(' + this._styleLoader() + ')(\'' + 
        data.assetName + '\',\'' + 
        JSON.stringify(content[CSS_INDEX])
      + '\');';
    }

    if (content[JS_INDEX]) {
      // TODO do some treeshake preprocessing if needed
      // TODO if minify set, run uglify over js content
    }

    const bundleContent = content[CSS_INDEX] + content[JS_INDEX];

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

  _styleLoader(minify) {
    if (!this._styleLoaderContent) {
      this._styleLoaderContent = fs.readFileSync(path.join(__dirname, 'style-loader.js'),'utf8');
      // TODO minify this loader if required.
    }
    return _styleLoaderContent;
  }
}

module.exports = JsBundler;
