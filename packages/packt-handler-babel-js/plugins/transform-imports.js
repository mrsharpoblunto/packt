'use strict';
const babel = require('babel-core');

const constants = require('./constants');

function findDependencies(babel) {
  var t = babel.types;
  return {
    visitor: {
      ImportDeclaration: function(path) {
        const emitter = this.opts.emitter;

        const moduleScope = this.opts.scope
        const moduleName = path.node.source.value;
        const symbols = [];

        const declarators = [];
        for (let spec of path.node.specifiers) {
          let symbol;
          switch (spec.type) {
            case 'ImportNamespaceSpecifier':
              symbol = '*';
              break;
            case 'ImportDefaultSpecifier':
              symbol = 'default';
              break;
            default: 
              symbol = spec.imported ? spec.imported.name : spec.local.name;
              break;
          }
          symbols.push(symbol);

          const newAlias = path.scope.generateUidIdentifier(
            spec.local.name + moduleScope
          );

          if (symbol !== '*') {
            declarators.push(t.variableDeclarator(
                newAlias,
                t.memberExpression(
                  t.callExpression(
                    t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
                    [t.stringLiteral(moduleName)]
                  ),
                  t.identifier(symbol)
                )
              )
            );
          } else {
            declarators.push(t.variableDeclarator(
                newAlias,
                t.callExpression(
                  t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
                  [t.stringLiteral(moduleName)]
                )
              )
            );
          }
          path.scope.rename(spec.local.name, newAlias.name);
        }
        emitter.emit('import',{
          moduleName: path.node.source.value,
          variants: this.opts.variants,
          symbols: symbols,
        });

        path.replaceWith(t.variableDeclaration(
          'var',
          declarators
        ));
      },
      CallExpression: function(path) {
        if (path.node.callee.name === 'require') {
          if (path.node.arguments.length !== 1 ||
              path.node.arguments[0].type !== 'StringLiteral') {
            // TODO need to evaluate constant expressions of string concatinations
            console.log("Expected string literal as argument to require");
          } else {
            const emitter = this.opts.emitter;
            path.node.callee.name = constants.PACKT_IMPORT_PLACEHOLDER;
            emitter.emit('import',{
              moduleName: path.node.arguments[0].value,
              variants: this.opts.variants,
              symbols: ['*'],
            });
          }
        }
      }
    }
  };
}

module.exports = findDependencies;
