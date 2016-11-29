'use strict';

const babel = require('babel-core');

function findDependencies(babel) {
  var t = babel.types;
  return {
    visitor: {
      ImportDeclaration: function(path) {
        const emitter = this.opts.emitter;
        emitter.emit('dependency',path.node.source.value);
      },
      CallExpression: function(path) {
        if (path.node.callee.name === 'require') {
          if (path.node.arguments.length !== 1 ||
              path.node.arguments[0].type !== 'StringLiteral') {
            // TODO need to evaluate constant expressions of string concatinations
            console.log("Expected string literal as argument to require");
          } else {
            const emitter = this.opts.emitter;
            emitter.emit('dependency',path.node.arguments[0].value);
          }
        }
      }
    }
  };
}

module.exports = findDependencies;
