/**
 * @flow
 */
import mkdirp from 'mkdirp';
import fs from 'fs';
import uglify from 'uglify-js';
import path from 'path';
import debugJSRuntime from './debug-js-runtime';
import * as jsRuntime from './js-runtime';

const PACKT_PLACEHOLDER_PATTERN = /__packt_(\w*?)__\((.*?)\)/g;
const JS_INDEX = 0;
const CSS_INDEX = 1;

export default class JsBundler implements Bundler {

  init(
    invariantOptions: BundlerOptions,
    delegate: BundlerDelegate,
    callback: BundlerInitCallback,
  ) {
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

      if (!options.bundler.omitRuntime) {
        wstream.write(jsRuntime.impl(
          !!options.bundler.minify
        ));
      }

      if (!options.bundler.minify) {
        wstream.write(debugJSRuntime(data, jsModules));
      }

      if (cssModules.length > 0) {
        wstream.write(jsRuntime.styleLoader(
          cssModules
        ));
      }

      if (jsModules.length > 0) {
        for (let module of jsModules) {
          if (options.bundler.minify) {
            wstream.write(this._minifyJSModule(
              data,
              options.bundler.uglifyOptions || {},
              module, 
              delegate));
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
    options: Object,
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
                'No import alias "' + args[1] + '" found in module "' + 
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

            if (args.length !== 3 || (
              args[2] === 'default' && !importedModule.exportsESModule
            )) {
              return importedModule.exportsIdentifier;
            } else {
              return `${importedModule.exportsIdentifier}.${args[2]}`;
            }
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
    ), { ...options, fromString: true }).code;
  }
}
