/**
 * Types usable by external plugins and reporters
 *
 * @flow
 */

export type OutputPaths = {|
  assetName: string,
  outputPath: string,
  outputPublicPath: string,
  outputParentPath: string,
|};

export type PacktOptions = {|
  config: string,
  moduleScopes: string,
|};

export type BuiltInResolverOptions = {|
  rootPath: string,
  searchPaths: Array<string>,
  extensions: Array<string>,
|};

export type PacktConfig = {|
  configFile: string,
  workingDirectory: string,
  invariantOptions: {|
    workers: number,
    outputPath: string,
    cachePath: string,
    outputPublicPath: string,
    outputHash: string,
    outputHashLength: number,
  |},
  hasVariants: boolean,
  options: { [key: string]: Object },
  bundles: { 
    [key: string]: {|
      type: 'library' | 'entrypoint' | 'common',
      requires: Array<{
        name: string,
        folder: boolean,
      } | string>,
      depends: { [key: string]: boolean },
      dynamicChildren: {
        preserveDuplicates: boolean,
      },
      contentTypes: { [key: string]: boolean },
      threshold: number,
      dependedBy: { [key: string]: boolean },
      commons: { [key: string]: boolean },
      bundler: string,
      bundlerOptions: { [key: string]: Object },
    |}
  },
  bundlers: { [key: string]: {|
    require: string,
    invariantOptions: {
      dynamicOutputPathFormat: string,
      staticOutputPathFormat: string,
      assetNameFormat: string,
    },
    options: { [key: string]: Object },
  |}},
  resolvers: {
    custom: Array<{|
      require: string,
      invariantOptions: Object,
      options: { [key: string]: Object },
    |}>,
    builtIn: {|
      invariantOptions: BuiltInResolverOptions,
    |},
  },
  handlers: Array<{|
    pattern: string,
    require: string,
    invariantOptions: Object,
    options: { [key: string]: Object },
  |}>,
|};

export interface Resolver {
  +clearCache: () => void,
  +resolve: (
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

export type PerfStats = {|
  diskIO: number,
  transform: number,
|};

export type PerfStatsDict = { [key: string]: PerfStats };

export type WorkerStatus =
  'configuring' |
  'idle' |
  'error' |
  'processing' |
  'bundling' |
  'stopped';

export type WorkerStatusDescription = {|
  status: WorkerStatus,
  description: string,
|};

export interface Reporter {
  onInit(version: string, options: PacktOptions): void,
  onLoadConfig(config: PacktConfig): void,
  onStartBuild(): void,
  onUpdateBuildStatus(workerStatus: Array<WorkerStatusDescription>): void,
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
    timers: {|
      global: Timer, 
      handlers: Timer,
      bundlers: Timer,
    |},
    buildStats: PerfStatsDict,
    bundleStats: PerfStatsDict,
  ): void,
  onError(error: Error): void,
};


export type ExportDeclaration = {|
  identifier: string,
  esModule: boolean,
  symbols: Array<string>,
|};

export type ImportDeclaration = {|
  source: string,
  symbols: Array<string>,
  type: 'static' | 'dynamic',
|};

export type HandlerDelegate = {|
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
|};

export type HandlerOptions = {|
  global: Object,
  handler: Object,
|};

export type HandlerInitCallback = (
  err: ?(Error | string)
) => void;

export type HandlerProcessCallback =  (
  err: ?(Error | string),
  variants: ?Array<string>,
  response: ?{|
    content: string,
    contentType: string, 
    contentHash: string,
    perfStats: PerfStats,
  |}
) => void;

export interface Handler {
  +init: ( 
    invariantOptions: HandlerOptions,
    delegate: HandlerDelegate,
    callback: HandlerInitCallback,
  ) => void,

  +process: (
    resolvedModule: string,
    scopeId: string,
    options: { [key: string]: HandlerOptions },
    delegate: HandlerDelegate,
    callback: HandlerProcessCallback,
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

export type SerializedModule = {
  importAliases: { [key: string]: string },
  resolvedModule: string,
  content: string,
  contentHash: string,
  contentType: string,
};

export type BundlerData = {
  assetMap: { [key: string]: string },
  dynamicBundleMap: { [key: string]: string },
  moduleMap: { [key: string]: {
    exportsIdentifier: string,
    exportsESModule: boolean,
  }},
  modules: Array<SerializedModule>,
  paths: OutputPaths,
  hasDependencies: boolean,
};

export type BundlerOptions = {|
  global: Object,
  bundler: Object,
|};

export type BundlerProcessCallback = (
  err: ?(Error | string),
  response: ?{
    perfStats: PerfStats,
  }
) => void;

export type BundlerInitCallback = (
  err: ?(Error | string)
) => void;

export interface Bundler {
  +init: ( 
    invariantOptions: BundlerOptions,
    delegate: BundlerDelegate,
    callback: BundlerInitCallback,
  ) => void,

  +process: (
    bundleName: string,
    options: BundlerOptions,
    data: BundlerData, 
    delegate: BundlerDelegate,
    callback: BundlerProcessCallback,
  ) => void,
};
