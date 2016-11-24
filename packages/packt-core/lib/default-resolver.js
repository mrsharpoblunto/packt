'use strict';

const fs = require('fs');
const path = require('path');
const PacktResolverError = require('./packt-errors').PacktResolverError;

class DefaultResolver {
  constructor(options) {
    this._options = options;
    this._cache = {};
    this._packageCache = {};
  }

  clearCache() {
    this._cache = {};
    this._packageCache = {};
  }

  resolve(moduleName,resolvedParentModule,cb) {
    const context = {
      attempts: [],
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

  _searchPaths(moduleName,moduleDir,searchIndex,context,callback) {
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

  _recursiveSearchPaths(moduleName,moduleDir,currentDir,searchIndex,context,callback) {
    if (currentDir.length === 1) {
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

  _checkFileIndexOrPackage(modulePath,context,callback) {
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
        // modulePath is a folder, check for package.json then index[+extensions]
        this._readPackageMain(modulePath,(err,packageMain) => {
          if (err) {
            // no package.json present - see if an index file is
            this._searchExtensions(path.join(modulePath,'index'),0,context,callback);
            return;
          }

          this._stat(packageMain,(err,isFile) => {
            if (err || !isFile) {
              context.attempts.push(packageMain);
              this._searchExtensions(packageMain,0,context,callback);
            } else {
              context.attempts.pop();
              callback(null,packageMain);
            }
          });
        });
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

  _searchExtensions(modulePath,extIndex,context,callback) {
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

  _stat(path,callback) {
    const cached = this._cache[path];
    if (cached) {
      callback(cached.err,cached.isFile);
    } else {
      fs.stat(path,(err,stats) => {
        const entry = {
          err: err,
          isFile: stats ? stats.isFile() : false,
        };
        this._cache[path] = entry;
        callback(entry.err,entry.isFile);
      });
    }
  }

  _readPackageMain(packagePath,callback) {
    const cached = this._packageCache[packagePath];
    if (cached) {
      callback(cached.err,cached.main);
    } else {
      fs.readFile(path.join(packagePath,'package.json'),'utf8',(err,data) => {
        if (err) {
          this._packageCache[packagePath] = { err: err };
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
                err: new Error('No browser or main property found in package.json')
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
          this._packageCache[packagePath] = { err: ex };
          callback(ex);
        }
      });
    }
  }

}

DefaultResolver.defaultOptions = function(workingDirectory) {
  return {
    searchPaths: [
      workingDirectory,
      'node_modules',
    ],
    extensions: ['.js'],
  };
};

module.exports = DefaultResolver;
