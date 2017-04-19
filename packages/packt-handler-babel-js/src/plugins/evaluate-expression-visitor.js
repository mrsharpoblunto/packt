import * as t from 'babel-types';
import * as helpers from './helpers';

export default {
  Block: function(path) {
    path.skip();
  },
  Identifier: function(path) {
    if (this.skipIdentifier && path.node.name === this.skipIdentifier) {
      return;
    }
    const value = helpers.getLiteralOrConst(path.node,path.scope);
    if (value) {
      path.replaceWith(helpers.createLiteral(value.value));
    } else {
      path.stop();
    }
  },
  LogicalExpression: {
    exit: function(path) {
      const left = helpers.getLiteralOrConst(path.node.left,path.scope);
      if (!left) {
        path.stop();
        return;
      }
      const right = helpers.getLiteralOrConst(path.node.right,path.scope);
      if (!right) {
        path.stop();
        return;
      }

      switch (path.node.operator) {
        case '||':
          path.replaceWith(t.booleanLiteral(!!(left.value || right.value)));
          break;
        case '&&':
          path.replaceWith(t.booleanLiteral(!!(left.value && right.value)));
          break;
        default:
          path.stop();
          break;
      }
    },
  },
  BinaryExpression: {
    exit: function(path) {
      const left = helpers.getLiteralOrConst(path.node.left,path.scope);
      if (!left) {
        path.stop();
        return;
      }
      const right = helpers.getLiteralOrConst(path.node.right,path.scope);
      if (!right) {
        path.stop();
        return;
      }

      switch (path.node.operator) {
        case '+':
          path.replaceWith(helpers.createLiteral(left.value + right.value));
          break;
        case '==':
        case '===':
          // we know were dealing with value types here, so == and ===
          // can be treated the same
          path.replaceWith(t.booleanLiteral(left.value == right.value));
          break;
        case '!=':
        case '!==':
          // we know were dealing with value types here, so != and !==
          // can be treated the same
          path.replaceWith(t.booleanLiteral(left.value != right.value));
          break;
        default:
          path.stop();
          break;
      }
    },
  },
  UnaryExpression: {
    exit: function(path) {
      if (path.node.operator === '!') {
        const argument = helpers.getLiteralOrConst(path.node.argument,path.scope);
        if (argument) {
          path.replaceWith(helpers.createLiteral(!argument.value));
        } else {
          path.stop();
        }
      }
    },
  },
  ConditionalExpression: {
    exit: function(path) {
      const testValue = helpers.getLiteralOrConst(path.node.test, path.scope);
      if (testValue) {
        path.replaceWith(
          testValue.value ? path.node.consequent : path.node.alternate
        );
      } else {
        path.stop();
      }
    },
  },
};
