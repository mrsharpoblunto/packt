'use strict';

class MockDefaultResolver {
  resolve(module,resolvedParentModule,cb) {
    const resolved = MockDefaultResolver.__resolvableDirectories[module];
    if (resolved) {
      cb(null,resolved);
    } else {
      cb(new Error());
    }
  }
}

MockDefaultResolver.defaultOptions = function(workingDirectory) {
  return {
    rootPath: workingDirectory,
    searchPaths: [
      workingDirectory,
      'node_modules',
    ],
    extensions: ['.js'],
  }
};
MockDefaultResolver.__resolvableDirectories = {};

module.exports = MockDefaultResolver;
