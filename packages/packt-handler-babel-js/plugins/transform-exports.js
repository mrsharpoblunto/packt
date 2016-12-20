'use strict';

const babel = require('babel-core');
const constants = require('./constants');

function findExports(babel) {
  var t = babel.types;
  return {
    pre() {
      this.exportedSymbols = [];
      this.exportedByValue = {};
    },
    visitor: {
      Program: {
        enter: function(path) {
          const moduleScope = this.opts.scope;
          this.exportAlias = path.scope.generateUidIdentifier(
            'exports' + moduleScope
          );
        },
        exit: function(path) {
          // create top level export object
          path.unshiftContainer(
            'body',
            t.variableDeclaration(
              'var',
              [
                t.variableDeclarator(
                  this.exportAlias,
                  t.objectExpression([])
                )
              ]
            )
          );
          if (this.exportedSymbols.length) {
            this.emitter.emit('exports', {
              moduleName: path.node.source.value,
              variants: this.opts.variants,
              symbols: this.exportedSymbols,
            });
          }
        },
      },
      VariableDeclaration: function(path) {
        if (!path.scope.parent) {
          const moduleScope = this.opts.scope;
          for (let decl of path.node.declarations) {
            if (this.exportedByValue[decl.id.name]) {
              continue;
            }
            const alias = path.scope.generateUidIdentifier(
              decl.id.name + moduleScope
            );
            path.scope.rename(decl.id.name,alias.name);
          }
        }
      },
      FunctionDeclaration: function(path) {
        if (!path.scope.parent.parent) {
          const moduleScope = this.opts.scope;
          const alias = path.scope.generateUidIdentifier(
            path.node.id.name + moduleScope
          );
          path.scope.rename(path.node.id.name,alias.name);
          path.node.id = alias;
        }
      },
      ClassDeclaration: function(path) {
        if (!path.scope.parent.parent) {
          const moduleScope = this.opts.scope;
          const alias = path.scope.generateUidIdentifier(
            path.node.id.name + moduleScope
          );
          path.scope.rename(path.node.id.name,alias.name);
          path.node.id = alias;
        }
      },
      Identifier: function(path) {
        if (
          this.exportedByValue.hasOwnProperty(path.node.name) && 
          (!path.scope.parent || !path.scope.hasOwnBinding(path.node.name)) &&
          (!path.parentPath || path.parentPath.node.type !== 'MemberExpression')
        ) {
          path.replaceWith(
            t.memberExpression(
              this.exportAlias,
              path.node
            )
          );
        }
      },
      MemberExpression: function(path) {
        if (
          path.node.object.name === 'module' &&
          path.node.property.name === 'exports' &&
            !path.scope.hasBinding(path.node.object.name)
        ) {
          path.replaceWith(this.exportAlias);
        }
      },
      ExportAllDeclaration: function(path) {
        this.opts.emitter.emit('import',{
          moduleName: path.node.source.value,
          variants: this.opts.variants,
          symbols: ['*'],
        });
        path.replaceWith(t.callExpression(
          t.memberExpression(
            t.identifier('Object'),
            t.identifier('assign')
          ),
          [
            this.exportAlias,
            t.callExpression(
              t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
              [path.node.source]
            ),
          ]
        ));
      },
      ExportDefaultDeclaration: function(path) {
        if (path.node.declaration &&
          (
            path.node.declaration.type === 'FunctionDeclaration' ||
            path.node.declaration.type === 'ClassDeclaration' ||
            path.node.declaration.type === 'VariableDeclaration'
          )
        ) {
          const decl = path.node.declaration;
          if (
            decl.id &&
            (
              decl.type === 'FunctionDeclaration' ||
              decl.type === 'ClassDeclaration'
            )
          ) {
            path.replaceWithMultiple([
              decl,
              t.assignmentExpression(
                '=',
                t.memberExpression(
                  this.exportAlias,
                  t.identifier('default')
                ),
                decl.id
              )
            ]);
          } else {
            if (decl.type === 'FunctionDeclaration') {
              decl.type = 'FunctionExpression';
            }
            path.replaceWith(
              t.assignmentExpression(
                '=',
                t.memberExpression(
                  this.exportAlias,
                  t.identifier('default')
                ),
                decl
              )
            );
          }
        }
      },
      ExportNamedDeclaration: function(path) {
        if (path.node.declaration &&
          (
            path.node.declaration.type === 'FunctionDeclaration' ||
            path.node.declaration.type === 'ClassDeclaration' ||
            path.node.declaration.type === 'VariableDeclaration'
          )
        ) {
          const assignments = [];
          const declarations = 
            path.node.declaration.declarations || 
            [path.node.declaration];
          for (let decl of declarations) {
            this.exportedByValue[decl.id.name] = true;
            if (decl.init) {
              assignments.push(
                t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(
                      this.exportAlias,
                      decl.id
                    ),
                    decl.init
                  )
                )
              );
            }
          }
          if (!assignments.length) {
            path.remove();
          } else {
            path.replaceWithMultiple(assignments);
          }
        } else if (path.node.source) {
          const objectProps = [];
          const symbols = [];
          for (let spec of path.node.specifiers) {
            objectProps.push(
              t.objectProperty(
                spec.exported,
                t.memberExpression(
                  t.callExpression(
                    t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
                    [path.node.source]
                  ),
                  spec.local || spec.exported
                )
              )
            );
            symbols.push(spec.exported.name);
          }

          this.opts.emitter.emit('import',{
            moduleName: path.node.source.value,
            variants: this.opts.variants,
            symbols: symbols,
          });

          path.replaceWith(
            t.callExpression(
              t.memberExpression(
                t.identifier('Object'),
                t.identifier('assign')
              ),
              [
                this.exportAlias,
                t.objectExpression(objectProps)
              ]
            )
          );
        } else {
          const objectProps = [];
          for (let spec of path.node.specifiers) {
            objectProps.push(
              t.objectProperty(spec.exported,spec.local)
            );
          }
          path.replaceWith(
            t.callExpression(
              t.memberExpression(
                t.identifier('Object'),
                t.identifier('assign')
              ),
              [
                this.exportAlias,
                t.objectExpression(objectProps)
              ]
            )
          );
        }
      },
    },
  };
}

module.exports = findExports;
