'use strict'
const EventEmitter = require('events').EventEmitter;
const mkdirp = require('mkdirp');
const fs = require('fs');

const PACKT_PLACEHOLDER_PATTERN = /__packt_(\w*?)__\((.*?)\)/g;

const JS_INDEX = 0;
const CSS_INDEX = 1;
class JsBundler extends EventEmitter {
  init(invariants, utils, cb) {
    this._minify = invariants.minify;
    cb();
  }

  process(options, data, cb) {
    const perfStats = {};
    let start = Date.now();

    const content = [];
    content[JS_INDEX] = '';
    content[CSS_INDEX] = '';

    const aliasMap = {};
    const identifierMap = {};

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

        if (!this._minify) {
          // to avoid having to regex replace packt placeholders
          // we can add some lookup tables into the bundle and have the
          // placeholder functions look these values up
          const mapEntry = data.moduleMap[module.resolvedModule];
          const exportsIdentifier = mapEntry.exportsIdentifier;
          identifierMap[module.resolvedModule] = {
            identifier: mapEntry.exportsIdentifier,
            esModule: mapEntry.exportsEsModule,
          };
          aliasMap[exportsIdentifier] = module.importAliases;
          content[index] += module.content +';\n';
        } else {
          // TODO custom parser for packt placeholders
          // regex replace out the packt placeholder functions
          content[index] += module.content.replace(
            PACKT_PLACEHOLDER_PATTERN,
            (match, type, args) => {
              args = JSON.parse('[' + args.replace(/\'/g,'"') + ']');
              switch (type) {
                case 'import': {
                  // replace imports with the imported modules 
                  // exported identifier
                  const resolvedAlias = module.importAliases[args[0]];
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
                  console.log(match);
                  console.log(importedModule.exportsIdentifier);
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
          ) + ';\n';
        }
      } catch (ex) {
        return cb(ex);
      }
    }

    let runtime = '';
    if (!this._minify) {
      runtime = this._bundleRuntime(aliasMap, identifierMap);
    }

    if (content[CSS_INDEX]) {
      content[CSS_INDEX] = '(' + this._styleLoader() + ')(\'' + 
        data.assetName + '\',\'' + 
        JSON.stringify(content[CSS_INDEX])
      + '\');';
    }

    const bundleContent = runtime + content[CSS_INDEX] + content[JS_INDEX];

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
      if (this._minify) {
        this._styleLoaderContent = this._minifyJS(this._styleLoaderContent);
      }
    }
    return this._styleLoaderContent;
  }

  _bundleRuntime(aliasMap, identifierMap) {
    return (
      'window.module=window.module||{};' +
      'window.__packt_alias_map__=' +
      'Object.assign(window.__packt_alias_map__||{},' + 
      JSON.stringify(aliasMap)+');' +
      'window.__packt_identifier_map__=' + 
      'Object.assign(window.__packt_identifier_map__||{},' + 
      JSON.stringify(identifierMap)+');' +
      'window.__packt_import__=function(exportsIdentifier,alias,useDefault){' +
      'var e=window.__packt_identifier_map__[' +
      'window.__packt_alias_map__[exportsIdentifier][alias]' +
      '];' +
      'var identifier=window[e.identifier];' +
      'return (!e.esModule&&useDefault)?{default:identifier}:identifier;' +
      '};'
    );
  }

  _minifyJS(content) {
    return content;
  }
}

module.exports = JsBundler;
