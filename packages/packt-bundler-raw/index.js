'use strict'
const mkdirp = require('mkdirp');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class RawBundler extends EventEmitter {
  init(invariants, utils, cb) {
    this._utils = utils;
    this._bundlerInvariants = invariants.bundler;
    cb();
  }
  process(options, data, cb) {
    mkdirp(data.outputParentPath,(err) => {
      if (err) {
        return cb(err);
      }

      const perfStats = {
        transform: 0,
        diskIO: 0,
      };

      Promise.all(
        data.modules.map((m) => this._writeRaw(m, data.assetMap, perfStats))
      ).then(() => {
        cb(null,{
          perfStats: perfStats,
        });
      }).catch((err) => {
        cb(err);
      });
    });
  }

  _writeRaw(module, assetMap, perfStats) {
    const modulePath = this._bundlerInvariants.relativePathRoot
      ? path.relative(this._bundlerInvariants.relativePathRoot, module.resolvedModule)
      : path.basename(module.resolvedModule);

    const outputPaths = this._utils.getOutputPaths(
      modulePath,
      module.contentHash,
      {},
      this._bundlerInvariants.outputPathFormat,
      this._bundlerInvariants.assetNameFormat
    );

    return new Promise((resolve,reject) => {
      const start = Date.now();
      fs.writeFile(outputPaths.outputPath, module.content, {
        encoding: module.contentType.indexOf('text/') === 0 ? 'utf8' : 'base64'
      },
      (err) => {
        if (err) {
          return reject(err);
        }
        perfStats.diskIO += (Date.now() - start);
        resolve();
      });
    });
  }
}

module.exports = RawBundler;
