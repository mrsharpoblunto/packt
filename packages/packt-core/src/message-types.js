/**
 * @flow
 * @format
 */
export type IdleMessage = {|
  type: 'idle',
|};

export type RawWorkerErrorMessage = {|
  type: 'raw_worker_error',
  error: string,
|};

export type WorkerErrorMessage = {|
  type: 'worker_error',
  error: Error,
|};

export type CloseMessage = {|
  type: 'close',
|};

export type StatusChangeMessage = {|
  type: 'status_change',
  status: WorkerStatusDescription,
|};

export type TaskCompleteMessage = {|
  type: 'task_complete',
|};

export type ModuleContentMessage = {|
  type: 'module_content',
  handler: string,
  content: string,
  contentType: string,
  contentHash: string,
  perfStats: PerfStats,
  variants: Array<string>,
  resolvedModule: string,
  cacheHit: boolean,
|};

export type ModuleContentErrorMessage = {|
  type: 'module_content_error',
  variants: Array<string>,
  resolvedModule: string,
  handler: string,
  error: string,
|};

export type ModuleImportMessage = {|
  type: 'module_import',
  variants: Array<string>,
  resolvedModule: string,
  importDeclaration: ImportDeclaration,
|};

export type ModuleExportMessage = {|
  type: 'module_export',
  variants: Array<string>,
  resolvedModule: string,
  exportDeclaration: ExportDeclaration,
|};

export type ModuleGeneratedAssetMessage = {|
  type: 'module_generated_asset',
  variants: Array<string>,
  resolvedModule: string,
  assetName: string,
  outputPath: string,
|};

export type ModuleWarningMessage = {|
  type: 'module_warning',
  variants: Array<string>,
  resolvedModule: string,
  warning: string,
|};

export type ModuleResolvedMessage = {|
  type: 'module_resolved',
  variants: Array<string>,
  resolvedModule: string,
  perfStats: { [key: string]: number },
  resolvedParentModuleOrBundle: string,
  importedByDeclaration: ?ImportDeclaration,
|};

export type ModuleResolveErrorMessage = {|
  type: 'module_resolve_error',
  error: Error,
|};

export type BundleWarningMessage = {|
  type: 'bundle_warning',
  bundleName: string,
  variant: string,
  warning: string,
|};

export type ProcessModuleMessage = {|
  type: 'process_module',
  resolvedModule: string,
  scopeId: string,
|};

export type ProcessBundleMessage = {|
  type: 'process_bundle',
  bundleName: string,
  variant: string,
  data: BundlerData,
|};

export type BundleContentMessage = {|
  type: 'bundle_content',
  bundleName: string,
  variant: string,
  bundler: string,
  perfStats: PerfStats,
|};

export type BundleContentErrorMessage = {|
  type: 'bundle_content_error',
  bundleName: string,
  variant: string,
  bundler: string,
  error: string,
|};

export type ProcessConfigMessage = {|
  type: 'process_config',
  config: PacktConfig,
|};

export type MessageType =
  | IdleMessage
  | RawWorkerErrorMessage
  | WorkerErrorMessage
  | StatusChangeMessage
  | CloseMessage
  | TaskCompleteMessage
  | ModuleContentMessage
  | ModuleContentErrorMessage
  | ModuleImportMessage
  | ModuleExportMessage
  | ModuleGeneratedAssetMessage
  | ModuleWarningMessage
  | ModuleResolvedMessage
  | ModuleResolveErrorMessage
  | BundleWarningMessage
  | BundleContentMessage
  | BundleContentErrorMessage
  | ProcessModuleMessage
  | ProcessBundleMessage
  | ProcessConfigMessage;
