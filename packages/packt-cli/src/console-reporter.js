/**
 * @flow
 */
import escapes from 'ansi-escapes';
import errors from 'packt-types';
import S from 'string';
import chalk from 'chalk';

const LEFT_COL_WIDTH = 15;
const MIN_RIGHT_COL_WIDTH = 5;

class ConsoleReporter implements Reporter {
  _isTTY: boolean;
  _hasUpdated: boolean;
  _eraseCount: number;
  _showProgress: boolean;
  _warnings: { [key: string]: Array<{
    warning: string,
    variant: string,
  }>};

  constructor(showProgress: boolean) {
    this._isTTY = ((process.stdout): any).isTTY;
    this._hasUpdated = false;
    this._eraseCount = 0;
    this._showProgress = showProgress;
    this._warnings = {};
  }

  onInit(
    version: string, 
    options: PacktOptions
  ) {
    console.log(chalk.bold('Packt ' + version));
    console.log(chalk.bold('Using config: ') + options.config);
  }

  onLoadConfig(config: PacktConfig) {
    console.log(
      chalk.bold('Building variants: ') +
      '[' + Object.keys(config.options).join(',') + ']'
    );
    console.log();
  }

  onStartBuild() {
  }

  // TODO need summary info about bundles built, module count etc.
  onUpdateBuildStatus(workers: Array<WorkerStatusDescription>) {
    if (this._isTTY && this._showProgress) {
      if (this._eraseCount) {
        process.stdout.write(escapes.cursorUp(this._eraseCount));
      } else {
        this._eraseCount = workers.length + 5;
      }

      const windowSize = ((process.stdout): any).getWindowSize();
      const rightColWidth = Math.max(MIN_RIGHT_COL_WIDTH, windowSize[0] - LEFT_COL_WIDTH - 3);

      console.log('+' + S('-').repeat(LEFT_COL_WIDTH + rightColWidth + 1) + '+');
      console.log('|' + chalk.bold(S(' Building').padRight(LEFT_COL_WIDTH + 1 + rightColWidth)) + '|');
      console.log('+' + S('-').repeat(LEFT_COL_WIDTH) + '+' + S('-').repeat(rightColWidth) + '+');
      for (let worker of workers) {
        let message = '|';
        switch (worker.status) {
          case 'idle':
            message += chalk.dim(S(' Idle').padRight(LEFT_COL_WIDTH));
            break;
          case 'configuring':
            message += chalk.bgWhite(S(' Configuring').padRight(LEFT_COL_WIDTH));
            break;
          case 'error':
            message += chalk.bgRed.bold(S(' Error').padRight(LEFT_COL_WIDTH));
            break;
          case 'processing':
            message += chalk.bold.bgGreen(S(' Processing').padRight(LEFT_COL_WIDTH));
            break;
          case 'bundling':
            message += chalk.bgCyan.bold(S(' Bundling').padRight(LEFT_COL_WIDTH));
            break;
          case 'stopped':
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

  onBuildWarning(
    resolvedModule: string, 
    variants: Array<string>, 
    warning: string
  ) {
    let moduleWarnings = this._warnings[resolvedModule];
    if (!moduleWarnings) {
      moduleWarnings = this._warnings[resolvedModule] = [];
    }
    for (let v of variants) {
      moduleWarnings.push({
        variant: v,
        warning,
      });
    }
  }

  onBundleWarning(
    bundleName: string, 
    variant: string, 
    warning: string
  ) {
    let bundleWarnings = this._warnings[bundleName];
    if (!bundleWarnings) {
      bundleWarnings = this._warnings[bundleName] = [];
    }
    bundleWarnings.push({
      variant,
      warning,
    });
  }

  // TODO need summary data around modules built etc.
  // need to pass through stats on each compiled module as well
  onFinishBuild(
    timers: {
      global: Timer,
      handlers: Timer,
      bundlers: Timer,
    }, 
    buildStats: PerfStatsDict,
    bundleStats: PerfStatsDict
  ) {
    if (this._eraseCount) {
      process.stdout.write(escapes.eraseLines(this._eraseCount + 1));
    }

    if (Object.keys(this._warnings).length) {
      console.log(chalk.bold('Build Warnings:'));
      console.log();
      for (let source in this._warnings) {
        console.log(chalk.yellow(source) + ':');
        const warningList = this._warnings[source];
        for (let w of warningList) {
          console.log(chalk.bold(w.variant) + ': ' + w.warning);
        }
        console.log();
      }
      console.log();
    }

    console.log(chalk.bold('Timing information:'));

    console.log('  Bundle Sort: ' + (timers.global.get('build','bundle-sort')/1000).toFixed(2) + 's');
    const resolvers = timers.global.getSubcategories('resolvers');
    for (let i = 0;i < resolvers.length - 1; ++i) {
      const r = resolvers[i];
      console.log('  Resolver ' + chalk.bold('custom' + r) + ': ' + (timers.global.get('resolvers',r)/1000).toFixed(2) + 's');
    }
    console.log('  Resolver ' + chalk.bold('default') + ': ' + (
      timers.global.get('resolvers',resolvers[resolvers.length - 1])/1000).toFixed(2) + 's');
    const handlers = timers.handlers.getCategories();
    for (let h of handlers) {
      const io = timers.handlers.get(h,'diskIO') / 1000;
      const transform = timers.handlers.get(h,'transform') / 1000;
      const total = io + transform;

      console.log('  Handler ' + chalk.bold(h) + ': ' + total.toFixed(2) + 's ' +
        chalk.dim('(' + transform.toFixed(2) + 's Transform, ' + io.toFixed(2) + 's I/O)'));
    }
    const bundlers = timers.bundlers.getCategories();
    for (let b of bundlers) {
      const io = timers.bundlers.get(b,'diskIO') / 1000;
      const transform = timers.bundlers.get(b,'transform') / 1000;
      const total = io + transform;

      console.log('  Bundler ' + chalk.bold(b) + ': ' + total.toFixed(2) + 's ' +
        chalk.dim('(' + transform.toFixed(2) + 's Transform, ' + io.toFixed(2) + 's I/O)'));
    }

    console.log();
    console.log(
      chalk.green('Build completed in ') + 
      chalk.bold(
        ((
          timers.global.get('build','modules') +
          timers.global.get('build','bundle-sort') +
          timers.global.get('build','bundles')
        ) /1000).toFixed(2) + 's'
      )
    );
  }


  onError(err: Error) {
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