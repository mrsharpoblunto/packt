/*
 * @flow
 */
import fs from 'fs';
import path from 'path';
import {PacktResolverError} from './packt-errors';
import type {
  BuiltInResolverOptions,
} from '../types';

export default class BuiltInResolver {

  static defaultOptions = (
    workingDirectory: string
  ): BuiltInResolverOptions => {
    return {
      rootPath: workingDirectory,
      searchPaths: [
        workingDirectory,
        'node_modules',
      ],
      extensions: ['.js'],
    };
  };

  _packageCache: { [key: string]: {
    err: ?Error,
    main: ?string,
  }};
  _cache: { [key: string]: {
    err: ?Error,
    isFile: ?boolean,
  }};
  _waiting: { [key: string]: Array<(err: ?Error, isFile: ?boolean) => void> };
  _options: BuiltInResolverOptions;

  constructor(options: BuiltInResolverOptions) {
    this._options = options;
    this._cache = {};
    this._waiting = {};
    this._packageCache = {};
  }

  clearCache() {
    this._cache = {};
    this._packageCache = {};
  }

  resolve(
    moduleName: string, 
    resolvedParentModule: string, 
    expectFolder: boolean, 
    cb: (err: ?Error, resolved: ?string) => void
  ) {
    const context = {
      attempts: [],
      expectFolder: expectFolder,
    };

    const callback = (err,resolved) => {
      if (err) {
        return cb(new PacktResolverError(moduleName, resolvedParentModule, context.attempts));
      }
      cb(null,resolved);
    };

    if (path.isAbsolute(moduleName)) {
      this._checkFileIndexOrPackage(moduleName,context,callback);
      return;
    }

    if (moduleName.startsWith('.')) {
      const modulePath = path.resolve(path.dirname(resolvedParentModule),moduleName);
      this._checkFileIndexOrPackage(modulePath,context,callback);
      return;
    }

    this._searchPaths(
      moduleName,
      path.dirname(resolvedParentModule),
      0,
      context,
      callback
    );
  }

  _searchPaths(
    moduleName: string,
    moduleDir: string,
    searchIndex: number,
    context: any,
    callback: (err: ?Error, resolved: ?string) => void
  ) {
    if (searchIndex === this._options.searchPaths.length) {
      callback(new Error('unable to resolve ' + moduleName));
      return;
    }

    const searchPath = this._options.searchPaths[searchIndex];

    if (path.isAbsolute(searchPath)) {
      const checkResult = (err,result) => {
        if (err) {
          this._searchPaths(
            moduleName,
            moduleDir,
            ++searchIndex,
            context,
            callback
          );
        } else {
          callback(null,result);
        }
      };

      const modulePath = path.resolve(searchPath, moduleName);
      this._checkFileIndexOrPackage(modulePath,context,checkResult);
    } else {
      this._recursiveSearchPaths(
        moduleName,
        moduleDir,
        moduleDir,
        searchIndex,
        context,
        callback
      );
    }
  }

  _recursiveSearchPaths(
    moduleName: string,
    moduleDir: string,
    currentDir: string,
    searchIndex: number,
    context: any,
    callback: (err: ?Error, resolved: ?string) => void
  ) {
    if (currentDir.length < this._options.rootPath.length) {
      // we've reached the root, stop searching up and try the
      // next searchPath
      this._searchPaths(
        moduleName,
        moduleDir,
        ++searchIndex,
        context,
        callback
      );
    } else {
      const searchPath = path.join(
        currentDir,
        this._options.searchPaths[searchIndex]
      );
      const checkResult = (err,result) => {
        if (err) {
          this._recursiveSearchPaths(
            moduleName,
            moduleDir,
            path.resolve(currentDir,'..'),
            searchIndex,
            context,
            callback
          );
        } else {
          callback(null,result);
        }
      };

      const modulePath = path.resolve(searchPath, moduleName);
      this._checkFileIndexOrPackage(modulePath,context,checkResult);
    }
  }

  _checkFileIndexOrPackage(
    modulePath: string,
    context: any,
    callback: (err: ?Error, resolved: ?string) => void
  ) {
    this._stat(modulePath,(err,isFile) => {
      context.attempts.push(modulePath);
      if (err) {
        // modulePath doesn't exist - try adding on known file extensions
        // if it doesn't have an extension already or its extension is not
        // in our list of configured extensions
        const ext = path.extname(modulePath);
        if (!this._options.extensions.find((e) => e === ext)) {
          this._searchExtensions(modulePath,0,context,callback);
        } else {
          callback(new Error('Unable to resolve ' + modulePath));
        }
      } else if (!isFile) {
        if (context.expectFolder) {
          context.attempts.pop();
          callback(null, modulePath);
        } else {
          // modulePath is a folder, check for package.json
          // then index[+extensions]
          this._readPackageMain(modulePath,(err,packageMain) => {
            if (err) {
              // no package.json present - see if an index file is
              this._searchExtensions(path.join(modulePath,'index'),0,context,callback);
            } else if (packageMain) {
              const main = packageMain;
              this._stat(main, (err,isFile) => {
                if (err || !isFile) {
                  context.attempts.push(main);
                  this._searchExtensions(main, 0, context, callback);
                } else {
                  context.attempts.pop();
                  callback(null, main);
                }
              });
            }
          });
        }
      } else {
        // modulePath is a file, but it has to have an extension matching one of
        // our configured extensions for it to count as a resolution
        const ext = path.extname(modulePath);
        if (!this._options.extensions.find((e) => e === ext)) {
          context.attempts[context.attempts.length - 1] += ' (ignored due to file extension "' + ext + '". To include this file, add the extension to the resolvers.default.extensions configuration property)';
          callback(new Error('Unable to resolve ' + modulePath));
        } else {
          context.attempts.pop();
          callback(null,modulePath);
        }
      }
    });
  }

  _searchExtensions(
    modulePath: string,
    extIndex: number,
    context: any,
    callback: (err: ?Error, resolved: ?string) => void
  ) {
    if (extIndex === this._options.extensions.length) {
      callback(new Error('Unable to resolve ' + modulePath));
      return;
    }

    const resolvedModulePath = modulePath + this._options.extensions[extIndex];
    this._stat(
      resolvedModulePath,
      (err,isFile) => {
        if (err || !isFile) {
          context.attempts.push(resolvedModulePath);
          this._searchExtensions(modulePath,++extIndex,context,callback);
        } else {
          callback(null,resolvedModulePath);
        }
    });
  }

  _stat(
    path: string,
    callback: (err: ?Error, isFile: ?boolean) => void
  ) {
    const cached = this._cache[path];
    if (cached) {
      callback(cached.err,cached.isFile);
    } else {
      let waiting = this._waiting[path];
      if (waiting) {
        waiting.push(callback);
        return;
      } else {
        waiting = this._waiting[path] = [];
      }
      fs.stat(path,(err,stats) => {
        const entry = {
          err: err,
          isFile: stats ? stats.isFile() : false,
        };
        this._cache[path] = entry;
        callback(entry.err,entry.isFile);
        if (waiting) {
          for (let w of waiting) {
            w(entry.err, entry.isFile);
          }
          delete this._waiting[path];
        }

      });
    }
  }

  _readPackageMain(
    packagePath: string,
    callback: (err: ?Error, main: ?string) => void
  ) {
    const cached = this._packageCache[packagePath];
    if (cached) {
      callback(cached.err,cached.main);
    } else {
      fs.readFile(path.join(packagePath,'package.json'),'utf8',(err,data) => {
        if (err) {
          this._packageCache[packagePath] = { err: err, main: null };
          callback(err);
          return;
        }

        try {
          const packageJson = JSON.parse(data);
          let entry;
          // prefer browser to main. TODO make this configurable for
          // node based packt builds... do we need to distinguish between
          // core & node_modules based modules somehow
          if (!packageJson.browser) {
            if (!packageJson.main) {
              entry = {
                err: new Error('No browser or main property found in package.json'),
                main: null,
              };
            } else {
              entry = {
                err: null,
                main: path.join(packagePath,packageJson.main),
              };
            }
          } else {
            entry = {
              err: null,
              main: path.join(packagePath,packageJson.browser),
            };
          }
          this._packageCache[packagePath] = entry;
          callback(entry.err,entry.main);
        } catch (ex) {
          this._packageCache[packagePath] = { err: ex, main: null };
          callback(ex);
        }
      });
    }
  }

}
