/**
 * @flow
 * @format
 */
export class PacktError extends Error {
  originalError: Error;
  constructor(message: string, originalError: Error) {
    super(message);
    this.originalError = originalError;
  }
}

export class PacktResolverError extends Error {
  module: string;
  parentModule: string;
  attempts: Array<string>;
  constructor(module: string, parentModule: string, attempts: Array<string>) {
    super(
      'Unable to resolve "' +
        module +
        '"' +
        (parentModule ? ' (via ' + parentModule + ')' : ''),
    );
    this.module = module;
    this.parentModule = parentModule;
    this.attempts = attempts;
  }
}

export class PacktConfigError extends Error {
  details: Array<{
    path: string,
    message: string,
  }>;
  constructor(error: {
    details: Array<{
      path: string,
      message: string,
    }>,
  }) {
    super(error.details[0].path + ': ' + error.details[0].message);
    this.details = error.details;
  }
}

export class PacktWorkerError extends Error {
  details: string;
  index: number;
  constructor(index: number, message: string) {
    super('Worker ' + index + ' error: ' + message);
    this.details = message;
    this.index = index;
  }
}

export class PacktContentError extends Error {
  handler: string;
  variants: Array<string>;
  error: string;
  resolved: string;

  constructor(
    handler: string,
    variants: Array<string>,
    error: string,
    resolved: string,
  ) {
    super('Error processing ' + resolved + ': ' + error);
    this.handler = handler;
    this.variants = variants;
    this.error = error;
    this.resolved = resolved;
  }
}

export class PacktBundleError extends Error {
  bundler: string;
  error: string;
  bundleName: string;

  constructor(bundler: string, error: string, bundleName: string) {
    super('Error bundling: ' + bundleName + ': ' + error);
    this.bundler = bundler;
    this.error = error;
    this.bundleName = bundleName;
  }
}
