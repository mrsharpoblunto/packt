'use strict';
const escapes = require('ansi-escapes');
const workerStatus = require('packt-core/lib/worker-status');
const errors = require('packt-core/lib/packt-errors');
const S = require('string');
const chalk = require('chalk');

const LEFT_COL_WIDTH = 15;
const MIN_RIGHT_COL_WIDTH = 5;

class ConsoleReporter {
  constructor(showProgress) {
    this._isTTY = process.stdout.isTTY;
    this._hasUpdated = false;
    this._eraseCount = 0;
    this._showProgress = showProgress;
  }

  onInit(packtVersion, options) {
    console.log(chalk.bold('Packt ' + packtVersion));
    console.log(chalk.bold('Using config: ') + options.config);
  }

  onLoadConfig(config) {
    console.log(
      chalk.bold('Building variants: ') + 
      '[' + Object.keys(config.options).join(',') + ']'
    );
    console.log();
  }

  onStartBuild() {
  }

  // TODO need summary info about bundles built, module count etc.
  onUpdateBuildStatus(workers, buildStats) {
    if (this._isTTY && this._showProgress) {
      if (this._eraseCount) {
        process.stdout.write(escapes.cursorUp(this._eraseCount));
      } else {
        this._eraseCount = workers.length + 5;
      }

      const windowSize = process.stdout.getWindowSize();
      const rightColWidth = Math.max(MIN_RIGHT_COL_WIDTH, windowSize[0] - LEFT_COL_WIDTH - 3);

      console.log('+' + S('-').repeat(LEFT_COL_WIDTH + rightColWidth + 1) + '+');
      console.log('|' + chalk.bold(S(' Building').padRight(LEFT_COL_WIDTH + 1 + rightColWidth)) + '|');
      console.log('+' + S('-').repeat(LEFT_COL_WIDTH) + '+' + S('-').repeat(rightColWidth) + '+');
      for (let worker of workers) {
        let message = '|';
        switch (worker.status) {
          case workerStatus.IDLE:
            message += chalk.dim(S(' Idle').padRight(LEFT_COL_WIDTH));
            break;
          case workerStatus.CONFIGURING:
            message += chalk.bgWhite(S(' Configuring').padRight(LEFT_COL_WIDTH));
            break;
          case workerStatus.ERROR:
            message += chalk.bgRed.bold(S(' Error').padRight(LEFT_COL_WIDTH));
            break;
          case workerStatus.PROCESSING:
            message += chalk.bold.bgGreen(S(' Processing').padRight(LEFT_COL_WIDTH));
            break;
          case workerStatus.BUNDLING:
            message += chalk.bgCyan.bold(S(' Bundling').padRight(LEFT_COL_WIDTH));
            break;
          case workerStatus.STOPPED:
            message += chalk.bgYellow(S(' Stopped').padRight(LEFT_COL_WIDTH));
            break;
        }
        message += '| ';
        let description = S(worker.description.split("").reverse().join("")).truncate(rightColWidth - 5,'...');
        description = S(description.split("").reverse().join("")).padRight(rightColWidth - 2);
        message += description;
        message += ' |';
        console.log(message);
      }
      console.log('+' + S('-').repeat(LEFT_COL_WIDTH) + '+' + S('-').repeat(rightColWidth) + '+');
      console.log();
    }
  }

  // TODO need summary data around modules built etc.
  // need to pass through stats on each compiled module as well
  onFinishBuild(buildTimings, moduleTimings, dependencyGraph) {
    if (this._eraseCount) {
      process.stdout.write(escapes.eraseLines(this._eraseCount + 1));
    }

    console.log(chalk.green('Build completed in ') + chalk.bold((buildTimings.global.get('build','modules')/1000).toFixed(2) + 's'));
    console.log();

    console.log(chalk.bold('Timing information:'));

    console.log('  Bundle Sort: ' + (buildTimings.global.get('build','bundle-sort')/1000).toFixed(2) + 's');
    const resolvers = buildTimings.global.getSubcategories('resolvers');
    for (let i = 0;i < resolvers.length - 1; ++i) {
      const r = resolvers[i];
      console.log('  Resolver ' + chalk.bold('custom' + r) + ': ' + (buildTimings.global.get('resolvers',r)/1000).toFixed(2) + 's');
    }
    console.log('  Resolver ' + chalk.bold('default') + ': ' + (
      buildTimings.global.get('resolvers',resolvers[resolvers.length - 1])/1000).toFixed(2) + 's');
    const handlers = buildTimings.handlers.getCategories();
    for (let h of handlers) {
      const io = buildTimings.handlers.get(h,'diskIO') / 1000;
      const transform = buildTimings.handlers.get(h,'transform') / 1000;
      const total = io + transform;

      console.log('  Handler ' + chalk.bold(h) + ': ' + total.toFixed(2) + 's ' +
        chalk.dim('(' + transform.toFixed(2) + 's Transform, ' + io.toFixed(2) + 's I/O)'));
    }
  }


  onError(err) {
    let defaultError = false;
    try {
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
        defaultError = true;
      }
    } catch (ex) {
      defaultError = true;
    }

    if (defaultError) {
      console.log(chalk.red(err.stack));
    }
    console.log();
    console.log(chalk.bold.red('Build failed'));
  }
}

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


module.exports = ConsoleReporter;
