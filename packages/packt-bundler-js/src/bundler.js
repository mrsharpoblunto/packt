/**
 * @flow
 */
import mkdirp from 'mkdirp';
import fs from 'fs';
import uglify from 'uglify-js';
import path from 'path';
//import debugRuntime from 'debug-runtime';
//import runtime from 'runtime';

const PACKT_PLACEHOLDER_PATTERN = /__packt_(\w*?)__\((.*?)\)/g;
const JS_INDEX = 0;
const CSS_INDEX = 1;

export default class JsBundler implements Bundler {
  _minify: boolean;
  _styleLoaderContent: ?string;

  init(
    invariantOptions: BundlerOptions,
    delegate: BundlerDelegate,
    callback: BundlerInitCallback,
  ) {
    this._minify = invariantOptions.bundler.minify;
    callback();
  }

  process(
    options: BundlerOptions,
    data: BundlerData,
    delegate: BundlerDelegate,
    callback: BundlerProcessCallback
  ) {
    mkdirp(data.paths.outputParentPath,(err) => {
      if (err) {
        return callback(err);
      }

      const perfStats = {};
      let start = Date.now();

      const cssModules = [];
      const jsModules = [];
      for (let module of data.modules) {
        if (module.contentType === 'text/javascript') {
          jsModules.push(module);
        } else if (module.contentType === 'text/css') {
          cssModules.push(module);
        } else {
          return callback(new Error(
            'This bundler can only handle "text/javascript" and "text/css" ' +
            'content types. Module "' + module.resolvedModule + '" has "' +
            module.contentType + '"'
          ));
        }
      }

      const wstream = fs.createWriteStream(data.paths.outputPath);
      wstream.on('finish',() => {
        perfStats.diskIO = Date.now() - start;
        callback(null,
        {
          perfStats: perfStats,
        });
      });
      wstream.on('error',(err) => {
        callback(err);
      });
      if (this._includeRuntime) {
        // write out packt runtime helpers 
      }
      if (!this._minify) {
        //write out debug runtime helpers
        // TODO factor this out into a separate module
        const aliasMap = {};
        const identifierMap = {};
        for (let module of jsModules) {
          const mapEntry = data.moduleMap[module.resolvedModule];
          const exportsIdentifier = mapEntry.exportsIdentifier;
          identifierMap[module.resolvedModule] = {
            identifier: mapEntry.exportsIdentifier,
            esModule: mapEntry.exportsESModule,
          };
          aliasMap[exportsIdentifier] = module.importAliases;
        }
        wstream.write(this._bundleRuntime(aliasMap, identifierMap));
      }
      if (cssModules.length > 0) {
        wstream.write(
          '(' + this._styleLoader(this._minify) + ')(\'' + 
          data.paths.assetName + '\',\''
        );
        wstream.write(JSON.stringify(
          cssModules.map((c) => c.content).join('')
        ));
        wstream.write('\');');
      }
      if (jsModules.length > 0) {
        for (let module of jsModules) {
          if (this._minify) {
            wstream.write(this._minifyJSModule(data, module, delegate));
          } else {
            wstream.write(module.content);
            wstream.write(';\n');
          }
        }
      }
      wstream.end();

      perfStats.transform = Date.now() - start;
      start = Date.now();
    });
  }

  _minifyJSModule(
    data: BundlerData, 
    module: SerializedModule,
    delegate: BundlerDelegate
  ): string {
    return uglify.minify(module.content.replace(
      PACKT_PLACEHOLDER_PATTERN,
      (match: string, type: string, args: string) => {
        args = JSON.parse('[' + args.replace(/\'/g,'"') + ']');
        switch (type) {
          case 'import': {
            // replace imports with the imported modules 
            // exported identifier
            const resolvedAlias = module.importAliases[args[1]];
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
          }
          /*case 'asset': {
            // replace asset paths with their hashed public paths
            const asset = data.assetMap[args[0]];
            if (!asset) {
              throw new Error(
                'No asset named "' + asset + ' found'
              );
            }
            return asset;
            break;
          }*/
          default:
            delegate.emitWarning(
              'Unknown packt placeholder type "' + 
              type + '" found in module',
            );
            return match;
        }
      }
    ), { fromString: true });
  }

  _styleLoader(minify: boolean): string {
    if (!this._styleLoaderContent) {
      this._styleLoaderContent = fs.readFileSync(path.join(__dirname, 'style-loader.js'),'utf8');
      if (this._minify) {
        this._styleLoaderContent = this._minifyJS(this._styleLoaderContent);
      }
    }
    return this._styleLoaderContent;
  }

  _bundleRuntime(
    aliasMap: { [key: string]: { [key: string]: string } },
    identifierMap: { [key: string]: {
      identifier: string,
      esModule: boolean,
    }}
  ) {
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

  _minifyJS(content: string): string {
    // TODO
    return content;
  }
}
