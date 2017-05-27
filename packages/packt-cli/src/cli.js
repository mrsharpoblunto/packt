/**
 * @flow
 */
import yargs from 'yargs';
import Packt from 'packt-core';
import ConsoleReporter from './console-reporter';

const argv = yargs
  .usage('Usage: $0 [options]')
  .default('config','packt.config.js')
  .default('module-scopes','')
  .boolean('progress')
  .default('progress', true)
  .boolean('verbose')
  .default('verbose', true)
  .help('h')
  .alias('h','help')
  .argv;

if (!argv.help) {
  const packt = new Packt(
    process.cwd(),
    argv,
    new ConsoleReporter(argv.progress, argv.verbose)
  );

  packt.start()
    .then(() => packt.build())
    .then(() => packt.stop())
    .then(() => {
      return 0;
    }).catch((err) => {
      return 1;
    });
}

