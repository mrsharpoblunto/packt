'use strict';

const yargs = require('yargs');
const path = require('path');
const Packt = require('packt-core');
const errors = require('packt-core/lib/packt-errors');
const chalk = require('chalk');

function printGeneralError(err) {
  console.log(chalk.red(err.toString()));
  console.log(chalk.dim(err.originalError.toString()));
}

function printConfigError(err) {
  console.log(chalk.red('Build failed due to configuration errors:'));
  for (let d of err.details) {
    let message = d.message;
    for (let c in d.context) {
      message = message.replace(d.context[c],chalk.bold(d.context[c]));
    }
    console.log('  ' + chalk.bold(d.path) + ': ' + message);
  }
}

const argv = yargs
  .usage('Usage: $0 [options]')
  .default('config','packt.config.js')
  .help('h')
  .alias('h','help')
  .argv;

if (!argv.help) {
  const packt = new Packt(
    path.resolve(process.cwd(),argv.config)
  );

  console.log(chalk.bold('Packt ' + require('./package.json').version));
  console.log(chalk.bold('Using config: ') + packt.configFile);

  packt.build().then(() => {
    console.log(chalk.bold.green('Packt like sardines in a crushd tin box'));
  }).catch((err) => {
    console.log();
    if (err instanceof errors.PacktConfigError) {
      printConfigError(err);
    } else if (err instanceof errors.PacktError) {
      printGeneralError(err);
    } else {
      console.log(chalk.red(err.toString()));
    }

    console.log();
    console.log(chalk.bold.red('Build failed'));
  });
}

