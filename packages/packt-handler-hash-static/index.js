'use strict';
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const mkdirp = require('mkdirp');
const EventEmitter = require('events').EventEmitter;

const ASSET_PATH_REGEX = /assetPath\((.+?)(\??#[A-z0-9]+)?\)/g;

class HashStaticHandler extends EventEmitter {

  init(invariants, utils, callback) {
    this._handlerInvariants = invariants.handler;
    this._utils = utils;

    try {
      if (this._handlerInvariants.whitelist) {
        this._whitelist = this._handlerInvariants.whitelist.map(
          (w) => new RegExp(w)
        );
      }
    } catch (err) {
      return callback(err);
    }
    callback();
  }

  _inWhitelist(filePath) {
    if (!this._whitelist) {
      return true;
    }
    for (let w of this._whitelist) {
      if (w.test(filePath)) {
        return true;
      }
    }
    return false;
  }

  process(resolvedModule, scopeId, variants, callback) {
    const allVariants = Object.keys(variants);
    const stats = {};
    let start = Date.now();

    try {
      // find all static assets
      const staticAssets = {};
      const files = glob.sync(resolvedModule + '/**');
      for (const filePath of files) {
        if (!this._inWhitelist(filePath)) {
          continue;
        }
        const isDirectory = fs.lstatSync(filePath).isDirectory();
        if (!isDirectory) {
          const relativePath = path.relative(resolvedModule, filePath);
          staticAssets[relativePath] = {
            relativePath: relativePath,
            path: filePath,
            ext: path.extname(relativePath),
            content: fs.readFileSync(filePath),
          };
        }
      }
      stats.diskIO = Date.now() - start;
      stats.transform = 0;

      // generate hashes for all static assets
      for (const key in staticAssets) {
        const asset = staticAssets[key];
        const hashStart = Date.now();
        this._recursiveHash(
          asset,
          {
            staticAssets: staticAssets,
            allVariants: allVariants,
            dependencyMap: {},
          }
        );
        stats.transform += (Date.now() - hashStart);
      }

      // Write all the hashed files to the output directory
      start = Date.now();
      for (const key in staticAssets) {
        const asset = staticAssets[key];
        const outputPaths = this._utils.getOutputPaths(
          asset.relativePath,
          asset.hash,
          {},
          this._handlerInvariants.outputPathFormat,
          this._handlerInvariants.assetNameFormat
        );
        mkdirp.sync(outputPaths.outputParentPath);
        fs.writeFileSync(outputPaths.outputPath, asset.content);
        this.emit('generated',{
          outputPath: outputPaths.outputPath,
          assetName: outputPaths.assetName,
          variants: allVariants,
        });
      }
    } catch (ex) {
      return callback(ex);
    }

    stats.diskIO += (Date.now() - start);
    callback(
      null,
      allVariants,
      {
        content: '',
        contentType: 'meta/no-content',
        metadata: {
          sourceLength: 0,
          transformedLength: 0,
        },
        perfStats: stats,
      }
    );
  }

  _recursiveHash(asset, context) {
    if (asset.hash) {
      return asset;
    }

    if (context.dependencyMap[asset.relativePath]) {
      throw new Error('Circular dependencies between static assets');
    }

    context.dependencyMap[asset.relativePath] = true;

    if (
      (
        this._handlerInvariants.parseFileExtensions || []
      ).indexOf(asset.ext) >=0
    ) {
      const source = asset.content.toString();
      asset.content = new Buffer(
        source.replace(ASSET_PATH_REGEX, (match, relativePath) => {
          if (context.staticAssets[relativePath]) {
            const paths = this._utils.getOutputPaths(
              relativePath,
              this._recursiveHash(
                context.staticAssets[relativePath],
                context
              ).hash,
              {},
              this._handlerInvariants.outputPathFormat,
              this._handlerInvariants.assetNameFormat
            );
            return paths.outputPublicPath;
          } else {
            this.emit('warning',{
              variants: context.allVariants,
              warning: 'No asset found at ' + relativePath +
                ', referenced in ' + asset.path,
            });
            return match;
          }
        })
      );
    }

    asset.hash = this._utils.generateHash(asset.content);
    delete context.dependencyMap[asset.relativePath];
    return asset;
  }
}

module.exports = HashStaticHandler;
