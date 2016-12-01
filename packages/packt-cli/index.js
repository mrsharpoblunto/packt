'use strict';

const yargs = require('yargs');
const path = require('path');
const Packt = require('packt-core');
const errors = require('packt-core/lib/packt-errors');
const chalk = require('chalk');
const escapes = require('ansi-escapes');
const ConsoleReporter = require('./console-reporter');

function printGeneralError(err) {
  console.log(chalk.red(err));
  console.log(chalk.dim(err.originalError.stack));
}

function printConfigError(err) {
  console.log(chalk.red('Failed due to configuration errors:'));
  for (let d of err.details) {
    let message = d.message;
    for (let c in d.context) {
      message = message.replace(d.context[c],chalk.bold(d.context[c]));
    }
    console.log('  ' + chalk.bold(d.path) + ': ' + message);
  }
}

function printResolverError(err) {
  console.log(chalk.red('Failed to resolve module "' + err.module + '"'));
  if (err.context) {
    console.log(chalk.dim('(required by ' + err.context + ')'));
  }
  console.log('Resolution attempts:');
  for (let attempt of err.attempts) {
    console.log('  ' + attempt);
  }
}

function printWorkerError(err) {
  console.log(chalk.red('Failed due to an unexpected error in worker ' + err.index));
  console.log(err.details);
}

function printContentError(err) {
  console.log(chalk.red('Failed to process module "' + err.resolved + '"'));
  console.log(chalk.bold('Handler: ') + err.handler);
  console.log(chalk.bold('Variants: ') + '[' + err.variants.join(',') + ']');
  const index = err.error.indexOf(':');
  if (index < 0) {
    err.error = chalk.bold('Error: ') + err.error;
  } else {
    err.error = chalk.bold(err.error.substr(0,index + 1)) + err.error.substr(index + 1);
  }
  console.log(err.error);
}

function repeat(chr,repeat) {
  let str = '';
  for (let i = 0;i < repeat; ++i) {
    str += chr;
  }
  return str;
}

function rightPad(str,pad,repeat) {
  while (str.length < repeat) {
    str += pad;
  }
  return str;
}

const argv = yargs
  .usage('Usage: $0 [options]')
  .default('config','packt.config.js')
  .help('h')
  .alias('h','help')
  .argv;

if (!argv.help) {
  const packt = new Packt(
    path.resolve(process.cwd(),argv.config),
    new ConsoleReporter()
  );

  console.log(chalk.bold('Packt ' + require('./package.json').version));
  console.log(chalk.bold('Using config: ') + packt.configFile);



  packt.build().then(() => {
    console.log();
    console.log(chalk.green('Packt like sardines in a crushd tin box'));
  }).catch((err) => {
    console.log();
    if (err instanceof errors.PacktConfigError) {
      printConfigError(err);
    } else if (err instanceof errors.PacktWorkerError) {
      printWorkerError(err);
    } else if (err instanceof errors.PacktResolverError) {
      printResolverError(err);
    } else if (err instanceof errors.PacktContentError) {
      printContentError(err);
    } else if (err instanceof errors.PacktError) {
      printGeneralError(err);
    } else {
      console.log(chalk.red(err.stack));
    }

    console.log();
    console.log(chalk.bold.red('Build failed'));
  });
}

