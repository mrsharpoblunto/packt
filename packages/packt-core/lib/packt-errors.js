'use strict';
const chalk = require('chalk');

class PacktError extends Error {
  constructor(message, originalError) {
    super(message);
    this.originalError = originalError;
  }
}

class PacktResolverError extends Error {
  constructor(module, context, attempts) {
    super('Unable to resolve "' + module + '"' + (context ? (' (via ' + context + ')') : ''));
    this.module = module;
    this.context = context;
    this.attempts = attempts;
  }
}

class PacktConfigError extends Error {
  constructor(error) {
    super(error.details[0].path + ': ' + error.details[0].message);
    this.details = error.details;
  }
}

class PacktWorkerError extends Error {
  constructor(index,message) {
    super('Worker ' + index + ' error: ' + message);
    this.details = message;
    this.index = index;
  }
}

class PacktContentError extends Error {
  constructor(
    handler,
    variants,
    error,
    resolved
  ) {
    super('Error processing ' + resolved + ': ' + error);
    this.handler = handler;
    this.variants = variants;
    this.error = error;
    this.resolved = resolved;
  }
}

class PacktBundleError extends Error {
  constructor(
    bundler,
    error,
    bundle
  ) {
    super('Error bundling: ' + bundle + ': ' + error);
    this.bundler = bundler;
    this.error = error;
    this.bundle = bundle;
  }
}

module.exports = {
  PacktError: PacktError,
  PacktConfigError: PacktConfigError,
  PacktResolverError: PacktResolverError,
  PacktWorkerError: PacktWorkerError,
  PacktContentError: PacktContentError,
  PacktBundleError: PacktBundleError,
};
