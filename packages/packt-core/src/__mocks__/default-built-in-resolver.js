export default class MockBuiltIntResolver {
  static __resolvableDirectories = {};
  static defaultOptions = function(workingDirectory) {
    return {
      rootPath: workingDirectory,
      searchPaths: [
        workingDirectory,
        'node_modules',
      ],
      extensions: ['.js'],
    }
  };

  resolve(module,resolvedParentModule,expectFolder,cb) {
    const resolved = MockDefaultResolver.__resolvableDirectories[module];
    if (resolved) {
      cb(null,resolved);
    } else {
      cb(new Error());
    }
  }
}
