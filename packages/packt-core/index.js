#!/usr/local/bin/node
'use strict';

const yargs = require('yargs');
const path = require('path');
const Packt = require('./lib/packt');
const chalk = require('chalk');

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

  packt.build().then(() => {
    console.log('packt like sardines in a crushd tin box');
  }).catch((err) => {
    console.log(err.toString());
  });
}
