/**
 * @flow
 */
import fs from 'fs';

export default class IgnoreHandler implements Handler {

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
    callback(
      null,
      Object.keys(options),
      {
        content: '',
        contentType: 'text/javascript',
        contentHash: '',
        perfStats: {
          diskIO: 0,
          transform: 0,
        },
      }
    );
  }
}
