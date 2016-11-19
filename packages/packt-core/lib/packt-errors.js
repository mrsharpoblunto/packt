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
    super('Unable to resolve "' + module + '"' + chalk.dim(context ? (' (via ' + context + ')') : ''));
    this.attempts = attempts;
  }
}

class PacktConfigError extends Error {
  constructor(error) {
    super(error.details[0].path + ': ' + error.details[0].message);
    this.details = error.details;
  }
}

module.exports = {
  PacktError: PacktError,
  PacktConfigError: PacktConfigError,
  PacktResolverError: PacktResolverError,
};
