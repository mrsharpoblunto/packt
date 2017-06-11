/**
 * @flow
 */
import mkdirp from 'mkdirp';
import path from 'path';
import fs from 'fs';

export default class RawBundler implements Bundler {
  init(
    invariantOptions: BundlerOptions,
    delegate: BundlerDelegate,
    callback: BundlerInitCallback
  ) {
    callback();
  }
  process(
    bundleName: string,
    options: BundlerOptions,
    data: BundlerData,
    delegate: BundlerDelegate,
    callback: BundlerProcessCallback
  ): void {
    mkdirp(data.paths.outputParentPath, (err: ?Error) => {
      if (err) {
        return callback(err);
      }

      const perfStats = {
        transform: 0,
        diskIO: 0,
        preSize: 0,
        postSize: 0
      };

      const start = Date.now();
      var wstream = fs.createWriteStream(data.paths.outputPath);
      wstream.on('finish', () => {
        perfStats.diskIO = Date.now() - start;
        callback(null, {
          perfStats: perfStats
        });
      });
      wstream.on('error', err => {
        callback(err);
      });
      for (let module of data.modules) {
        perfStats.preSize += module.content.length;
        perfStats.postSize += module.content.length;
        wstream.write(
          module.content,
          module.contentType.indexOf('text/') === 0 ? 'utf8' : 'base64'
        );
      }
      wstream.end();
    });
  }
}
