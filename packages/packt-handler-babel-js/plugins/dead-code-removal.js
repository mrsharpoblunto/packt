'use strict';

const babel = require('babel-core');
const evaluateExpression = require('./evaluate-expression-visitor');
const helpers = require('./helpers');

function transform(babel) {
  return {
    visitor: {
      // try to collapse and eliminate dead conditional branches
      IfStatement: {
        exit: collapseConditional,
      },
      ConditionalExpression: {
        exit: collapseConditional,
      },
    },
  };
}

function collapseConditional(path) {
  path.traverse(evaluateExpression);
  const value = helpers.getLiteralOrConst(path.node.test, path.scope);
  if (value) {
    if (!value.value && !path.node.alternate) {
      path.remove();
    } else {
      path.replaceWith(value.value ? path.node.consequent : path.node.alternate);
    }
  }
}

module.exports = transform;
