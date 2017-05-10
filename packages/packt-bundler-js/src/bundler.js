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
    bundleName: string,
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

      try {
        if (!options.bundler.minify) {
          wstream.write('(function(__packt_bundle_context__){');
          wstream.write(debugJSRuntime(data, jsModules));
        }

        if (!data.hasDependencies && !options.bundler.omitRuntime) {
          wstream.write(jsRuntime.impl(
            !!options.bundler.minify
          ));
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
                bundleName,
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

        if (!options.bundler.minify) {
          wstream.write('})("' + bundleName + '")');
        }
      } catch (ex) {
        callback(ex);
        return;
      }

      wstream.end();

      perfStats.transform = Date.now() - start;
      start = Date.now();
    });
  }

  _splitArgs(args: string): Array<string> {
    const result = [];
    let current = '';
    let inString = false;
    for (let i = 0;i < args.length;++i) {
      if (args[i]==='\'' || args[i]==='"') {
        if (!inString) {
          inString = true;
        } else {
          if (args[i-1]!=='\\') {
            inString = false;
          } else {
            current += args[i];
          }
        }
      } else if (inString) {
        current += args[i];
      } else if (args[i] === ',') {
        result.push(current);
        current = '';
      } else if (args[i] !== ' ') {
        current += args[i];
      }
    }
    if (current) {
      result.push(current);
    }
    return result;
  }

  _minifyJSModule(
    bundleName: string,
    data: BundlerData, 
    options: Object,
    module: SerializedModule,
    delegate: BundlerDelegate
  ): string {
    return uglify.minify(module.content.replace(
      PACKT_PLACEHOLDER_PATTERN,
      (match: string, type: string, rawArgs: string) => {
        const args = this._splitArgs(rawArgs);
        switch (type) {
          case 'dynamic_import': {
            if (args[0] !== '__packt_bundle_context__') {
              throw new Error(
                'Unexpected bundle context argument in module "' +
                module.resolvedModule + '". Expected __packt_bundle_context__' +
                ' but got ' + args[0]
              );
            }
            const resolvedAlias = module.importAliases[args[2]];
            if (!resolvedAlias) {
              throw new Error(
                'No import alias "' + args[2] + '" found in module "' + 
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

            return `__packt_dynamic_import_impl__(
              '${data.dynamicBundleMap[bundleName + ':' + resolvedAlias]}',
              '${importedModule.exportsIdentifier}'
            )`;
          }
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
