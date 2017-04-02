/**
 * Types usable by external plugins and reporters
 *
 * @flow
 */
'use strict';

export type PacktOptions = {
  config: string,
  moduleScopes: string,
};

export type BuiltInResolverOptions = {
  rootPath: string,
  searchPaths: Array<string>,
  extensions: Array<string>,
};

export type PacktConfig = {
  configFile: string,
  workingDirectory: string,
  invariantOptions: {
    workers: number,
    outputPath: string,
    cachePath: string,
    outputPublicPath: string,
    outputHash: string,
    outputHashLength: number,
  },
  hasVariants: boolean,
  options: { [key: string]: Object },
  bundles: { 
    [key: string]: {
      type: 'library' | 'entrypoint' | 'common',
      requires: Array<{
        name: string,
        folder: boolean,
      } | string>,
      depends: Array<string>,
      contentTypes: Array<string>,
      threshold: number,
      dependedBy: Set<string>,
      commons: Set<string>,
    }
  },
  bundlers: { [key: string]: {
    require: string,
    invariantOptions: {
      outputPathFormat: string,
      assetNameFormat: string,
    },
    options: { [key: string]: Object },
  }},
  resolvers: {
    custom: Array<{
      require: string,
      invariantOptions: Object,
      options: { [key: string]: Object },
    }>,
    builtIn: {
      invariantOptions: BuiltInResolverOptions,
    },
  },
  handlers: Array<{
    pattern: string,
    require: string,
    invariantOptions: Object,
    options: { [key: string]: Object },
  }>,
};

export type Resolver = {
  clearCache: () => void,
  resolve: (
    moduleName: string, 
    resolvedParentModule: string, 
    expectFolder: boolean,
    callback: (err: ?Error, resolved: ?string) => void
  ) => void,
};

export type Timer = {
  clear(): void;
  accumulate(category: string, values: { [key: string]: number} | number): void;
  get(category: string, sub: ?string): number;
  getCategories(): Array<string>;
  getSubcategories(category: string): Array<string>;
};

export type PerfStats = {
  diskIO: number,
  transform: number,
};

export type PerfStatsDict = { [key: string]: PerfStats };

export type Reporter = {
  onInit(version: string, options: PacktOptions): void,
  onLoadConfig(config: PacktConfig): void,
  onStartBuild(): void,
  // TODO pool status
  onUpdateBuildStatus(): void,//this._utils.pool.status());
  onBuildWarning(
    resolvedModule: string,
    variants: Array<string>,
    warning: string
  ): void,
  onBundleWarning(
    bundleName: string,
    variant: string,
    warning: string
  ): void,
  onFinishBuild(
    timers: {
      global: Timer, 
      handlers: Timer,
      bundlers: Timer,
    },
    buildStats: PerfStatsDict,
    bundleStats: PerfStatsDict,
  ): void,
  onError(error: Error): void,
};


export type ExportDeclaration = {
  identifier: string,
  esModule: boolean,
  symbols: Array<string>,
};

export type ImportDeclaration = {
  source: string,
  symbols: Array<string>,
  type: 'static' | 'dynamic',
};

export type HandlerDelegate = {
  importsModule: (
    variants: Array<string>,
    importDeclaration: ImportDeclaration
  ) => void,
  exportsSymbols: (
    variants: Array<string>,
    exportDeclaration: ExportDeclaration
  ) => void,
  emitWarning: (
    variants: Array<string>,
    warning: string,
  ) => void,
  generatedAsset: (
    variants: Array<string>,
    assetName: string,
    outputPath: string,
  ) => void,
  resolve: (
    path: string, 
    callback: (err: ?Error, resolvedModule: ?string) => void,
  ) => void,
  getOutputPaths: (
    name: string, 
    hash: string, 
    params: Object,
    outputPathTemplate: string, 
    assetNameTemplate: string
  ) => {
    assetName: string,
    outputPath: string,
    outputParentPath: string,
  },
  generateHash: (content: string) => string,
};

export type Handler = {
  init: ( 
    invariantOptions: {
      global: Object,
      handler: Object,
    },
    delegate: HandlerDelegate,
    callback: (
      err: ?(Error | string)
    ) => void,
  ) => void,

  process: (
    resolvedModule: string,
    scopeId: string,
    options: {
      global: Object,
      handler: Object,
    },
    delegate: HandlerDelegate,
    callback: (
      err: ?(Error | string),
      variants: ?Array<string>,
      response: ?{
        content: string,
        contentType: string, 
        perfStats: PerfStats,
      }
    ) => void,
  ) => void,
};

export type BundlerDelegate = {
  emitWarning: (
    warning: string,
  ) => void,
  resolve: (
    path: string, 
    callback: (err: ?Error, resolvedModule: ?string) => void,
  ) => void,
};

export type Bundler = {
  init: ( 
    invariantOptions: {
      global: Object,
      bundler: Object,
    },
    delegate: BundlerDelegate,
    callback: (
      err: ?(Error | string)
    ) => void,
  ) => void,

  process: (
    options: {
      global: Object,
      bundler: Object,
    },
    data: any, // TODO define bundler data type
    delegate: BundlerDelegate,
    callback: (
      err: ?(Error | string),
      response: ?{
        perfStats: PerfStats,
      }
    ) => void,
  ) => void,
};
