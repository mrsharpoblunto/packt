import * as t from 'babel-types';

export function getLiteralOrConst(node, scope) {
  if (node.type === 'Identifier') {
    const name = node.name;
    while (scope) {
      const bound = scope.bindings[name];
      if (bound) {
        if (bound.kind === 'const') {
          const boundNode = bound.path.node;
          if (!boundNode.init) {
            return { value: undefined };
          } else if (
            boundNode.init.type === 'StringLiteral' ||
            boundNode.init.type === 'NumericLiteral' ||
            boundNode.init.type === 'BooleanLiteral'
          ) {
            return { value: boundNode.init.value };
          } else if (boundNode.init.type === 'NullLiteral') {
            return { value: null };
          }
        }
        break;
      }
      scope = scope.parent;
    }
  } else if (
    node.type === 'StringLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'BooleanLiteral'
  ) {
    return { value: node.value };
  } else if (node.type === 'NullLiteral') {
    return { value: null };
  }
  return null;
}

export function createLiteral(value) {
  switch (typeof value) {
    case 'string':
      return t.stringLiteral(value);
    case 'boolean':
      return t.booleanLiteral(value);
    case 'number':
      return t.numericLiteral(value);
    default:
      if (!value) {
        return t.nullLiteral();
      }
  }
  return null;
}
