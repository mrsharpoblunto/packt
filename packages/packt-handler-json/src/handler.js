/**
 * @flow
 */
import fs from 'fs';

export default class JsonHandler implements Handler {
  init(
    invariantOptions: HandlerOptions,
    delegate: HandlerDelegate,
    callback: HandlerInitCallback
  ) {
    callback();
  }

  process(
    resolvedModule: string, 
    scopeId: string, 
    options: { [key: string]: HandlerOptions },
    delegate: HandlerDelegate,
    callback: HandlerProcessCallback
  ) {
    const stats = {};
    let start = Date.now();
    fs.readFile(resolvedModule,'utf8',(err,source) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        callback(err);
        return;
      }

      try {
        start = Date.now();
        const result = JSON.parse(source);
        stats.transform = Date.now() - start;
        stats.preSize = source.length;
        const transformed = 'var ' + scopeId + '=' + source + ';';
        stats.postSize = transformed.length;

        delegate.exportsSymbols(
          Object.keys(options),
          {
            identifier: scopeId,
            symbols: ['*'],
            esModule: false,
          }
        );

        callback(
          null,
          Object.keys(options),
          {
            content: transformed,
            contentType: 'text/javascript',
            contentHash: delegate.generateHash(transformed),
            perfStats: stats,
          }
        );
      }
      catch (err) {
        callback(
          err,
          Object.keys(options)
        );
      }
    });
  }
}
