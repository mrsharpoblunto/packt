'use strict';

const babel = require('babel-core');
const constants = require('../constants');
const evaluateExpression = require('./evaluate-expression-visitor');
const helpers = require('./helpers');
const t = babel.types;

function transform(babel) {
  return {
    visitor: {
      MemberExpression: function(path) {
        // replace process.env.* values with literals
        if (
          path.node.object.type === 'MemberExpression' &&
          path.node.object.object.type === 'Identifier' &&
          path.node.object.property.type === 'Identifier' &&
          path.node.object.object.name === 'process' &&
          path.node.object.property.name === 'env' &&
          path.node.property.type === 'Identifier'
        ) {
          const value = process.env[path.node.property.name];
          const literalValue = helpers.createLiteral(value);
          if (literalValue) {
            path.replaceWith(literalValue);
          }
        }
      },
      Identifier: function(path) {
        if (
          this.opts.defines.hasOwnProperty(path.node.name) && 
          !path.scope.hasBinding(path.node.name)
        ) {
          const d = this.opts.defines[path.node.name];
          path.replaceWith(helpers.createLiteral(d));
        }
      },
    },
  };
}

module.exports = transform;
