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
MockDefaultResolver.__resolvableDirectories = {};

module.exports = MockDefaultResolver;
