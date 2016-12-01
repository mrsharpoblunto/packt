'use strict';
const escapes = require('ansi-escapes');
const workerStatus = require('packt-core/lib/worker-status');
const S = require('string');
const chalk = require('chalk');

const LEFT_COL_WIDTH = 15;
const MIN_RIGHT_COL_WIDTH = 5;

class ConsoleReporter {
  constructor() {
    this._isTTY = process.stdout.isTTY;
    this._cursorPosition = null;
  }

  startBuild() {
    // TODO put build preamble in here
    if (this._isTTY) {
      process.stdout.write(escapes.clearScreen + escapes.cursorSavePosition);
    }
  }

  updateBuild(status) {
    if (this._isTTY) {
      const windowSize = process.stdout.getWindowSize();

      const rightColWidth = Math.max(MIN_RIGHT_COL_WIDTH, windowSize[0] - LEFT_COL_WIDTH - 3);

      console.log(escapes.cursorRestorePosition);
      console.log('+' + S('-').repeat(LEFT_COL_WIDTH + rightColWidth + 1) + '+');
      console.log('|' + chalk.bold(S(' Building').padRight(LEFT_COL_WIDTH + 1 + rightColWidth)) + '|');
      console.log('+' + S('-').repeat(LEFT_COL_WIDTH) + '+' + S('-').repeat(rightColWidth) + '+');
      for (let worker of status) {
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

    }
  }

  // TODO pass timing info...
  finishBuild() {
    // TODO record correct number of lines to erase here
    process.stdout.write(escapes.eraseLines(8));
  }

  // TODO error handler function here
}

module.exports = ConsoleReporter;
