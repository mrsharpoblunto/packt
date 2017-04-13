/**
 * @flow
 */
import fs from 'fs';
import mime from 'node-mime';

mime.default_type = 'text/plain';

export default class RawToJSHandler implements Handler {
  _handlerInvariants: Object;

  init(
    invariants: HandlerOptions, 
    delegate: HandlerDelegate, 
    callback: HandlerInitCallback
  ) {
    this._handlerInvariants = invariants.handler;
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
    fs.readFile(resolvedModule, (err,data) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        return callback(err);
      }

      try {
        start = Date.now();
        let contentType = mime.lookup(resolvedModule);
        let encoding = (
          contentType.indexOf('text/')===0 ? 'utf8' : 'base64'
        );

        let source = new Buffer(data).toString(encoding);
        if (encoding === 'utf8') {
          source = JSON.stringify(source);
        } else {
          source = '"' + contentType + ';base64,' + source + '"';
        }

        const transformed = 'var ' + scopeId + '=' + source + ';';
        stats.transform = Date.now() - start;

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
