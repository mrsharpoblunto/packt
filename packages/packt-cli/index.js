'use strict';

const yargs = require('yargs');
const Packt = require('packt-core');
const errors = require('packt-core/lib/packt-errors');
const ConsoleReporter = require('./console-reporter');

const argv = yargs
  .usage('Usage: $0 [options]')
  .default('config','packt.config.js')
  .default('module-scopes','')
  .boolean('progress',true)
  .help('h')
  .alias('h','help')
  .argv;

if (!argv.help) {
  const packt = new Packt(
    process.cwd(),
    argv,
    new ConsoleReporter(argv.progress)
  );

  packt.build().then(() => {
    return 0;
  }).catch((err) => {
    return 1;
  });
}

