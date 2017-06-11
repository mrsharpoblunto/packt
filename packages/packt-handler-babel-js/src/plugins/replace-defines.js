import constants from '../constants';
import evaluateExpression from './evaluate-expression-visitor';
import * as helpers from './helpers';

export default function transform(babel) {
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
          let value = this.opts.defines.hasOwnProperty(
            `process.env.${path.node.property.name}`,
          )
            ? this.opts.defines[`process.env.${path.node.property.name}`]
            : process.env[path.node.property.name];
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
