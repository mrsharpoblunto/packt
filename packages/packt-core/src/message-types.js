/**
 * @flow
 */

import type {
  PerfStats,
  PacktConfig,
  ExportDeclaration,
  ImportDeclaration,
} from '../types';

export type IdleMessage = {
  type: 'idle',
};

export type RawWorkerErrorMessage = {
  type: 'raw_worker_error',
  error: string,
};

export type WorkerErrorMessage = {
  type: 'worker_error',
  error: Error,
};

export type CloseMessage = {
  type: 'close',
};

export type StatusChangeMessage = {
  type: 'status_change',
};

export type TaskCompleteMessage = {
  type: 'task_complete',
};

type ModuleMessage = {
  variants: Array<string>,
  resolvedModule: string,
}

type BundleMessage = {
  bundleName: string,
  variant: string,
};

export type ModuleContentMessage = {
  type: 'module_content',
  handler: string,
  content: string,
  contentType: string,
  contentHash: string,
  perfStats: { [key: string]: number },
} & ModuleMessage;

export type ModuleContentErrorMessage = {
  type: 'module_content_error',
  handler: string,
  error: string,
} & ModuleMessage;

export type ModuleImportMessage = {
  type: 'module_import',
  importDeclaration: ImportDeclaration,
} & ModuleMessage;

export type ModuleExportMessage = {
  type: 'module_export',
  exportDeclaration: ExportDeclaration,
} & ModuleMessage;

export type ModuleGeneratedAssetMessage = {
  type: 'module_generated_asset',
  assetName: string,
  outputPath: string,
} & ModuleMessage;

export type ModuleWarningMessage = {
  type: 'module_warning',
  warning: string,
} & ModuleMessage;

export type ModuleResolvedMessage = {
  type: 'module_resolved',
  perfStats: PerfStats,
  resolvedParentModuleOrBundle: string,
  importedByDeclaration: ?ImportDeclaration,
} & ModuleMessage;

export type ModuleResolveErrorMessage = {
  type: 'module_resolve_error',
  error: Error,
};

export type BundleWarningMessage = {
  type: 'bundle_warning',
  warning: string,
} & BundleMessage;

export type ProcessModuleMessage = {
  type: 'process_module',
  resolvedModule: string,
  scopeId: string,
};

export type ProcessBundleMessage = {
  type: 'process_bundle',
  data: any, // TODO type bundle params
} & BundleMessage;

export type BundleContentMessage = {
  type: 'bundle_content',
  bundler: string,
  perfStats: PerfStats,
} & BundleMessage

export type BundleContentErrorMessage = {
  type: 'bundle_content_error',
  bundler: string,
  error: string,
} & BundleMessage;

export type ProcessConfigMessage = {
  type: 'process_config',
  config: PacktConfig,
};

export type MessageType =
  IdleMessage |
  RawWorkerErrorMessage |
  WorkerErrorMessage |
  StatusChangeMessage |
  CloseMessage |
  TaskCompleteMessage |
  ModuleContentMessage |
  ModuleContentErrorMessage |
  ModuleImportMessage | 
  ModuleExportMessage |
  ModuleGeneratedAssetMessage |
  ModuleWarningMessage |
  ModuleResolvedMessage |
  ModuleResolveErrorMessage |
  BundleWarningMessage |
  BundleContentMessage |
  BundleContentErrorMessage |
  ProcessModuleMessage |
  ProcessBundleMessage |
  ProcessConfigMessage;
