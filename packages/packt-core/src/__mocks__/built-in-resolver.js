export default class MockBuiltInResolver {
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
    const resolved = MockBuiltInResolver.__resolvableDirectories[module];
    if (resolved) {
      cb(null,resolved);
    } else {
      cb(new Error());
    }
  }
}
