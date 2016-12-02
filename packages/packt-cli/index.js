'use strict';

const yargs = require('yargs');
const Packt = require('packt-core');
const errors = require('packt-core/lib/packt-errors');
const ConsoleReporter = require('./console-reporter');

const argv = yargs
  .usage('Usage: $0 [options]')
  .default('config','packt.config.js')
  .help('h')
  .alias('h','help')
  .argv;

if (!argv.help) {
  const packt = new Packt(
    process.cwd(),
    argv,
    new ConsoleReporter()
  );

  packt.build().then(() => {
    return 0;
  }).catch((err) => {
    return 1;
  });
}

