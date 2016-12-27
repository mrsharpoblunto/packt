'use strict';

const babel = require('babel-core');
const constants = require('./constants');
const t = babel.types;

function transform(babel) {
  return {
    pre() {
      this.exportedSymbols = [];
      this.exportedByValue = {};
      this.hoistedIdentifier = {};
      this.moduleScope = '_' + this.opts.scope + '_';
    },
    post() {
      if (this.exportedSymbols.length) {
        // inform the dependency graph what exported symbols
        // this module provides, & under what identifier they are
        // associated in the global scope
        this.opts.emitter.emit('exports', {
          symbols: this.exportedSymbols,
          exportIdentifier: this.moduleExport,
          variants: this.opts.variants,
        });
      }
    },
    visitor: {
      Program: function(path) {
        this.exportAlias = path.scope.generateUidIdentifier(
          this.moduleScope + 'exports'
        );
        this.moduleExport = this.exportAlias.name;

        // create top level export object
        path.unshiftContainer(
          'body',
          t.variableDeclaration(
            'let',
            [
              t.variableDeclarator(
                this.exportAlias,
                t.objectExpression([])
              )
            ]
          )
        );
      },
      VariableDeclaration: function(path) {
        // hoist top level variable declarations to the global scope
        // by inserting the unique scope id for this module
        if (!path.scope.parent) {
          for (let decl of path.node.declarations) {
            if (
              this.hoistedIdentifier[decl.id.name] ||
              this.exportedByValue[decl.id.name]
            ) {
              continue;
            }
            const alias = path.scope.generateUidIdentifier(
              this.moduleScope + decl.id.name
            );
            path.scope.rename(decl.id.name,alias.name);
          }
        }
      },
      FunctionDeclaration: function(path) {
        // hoist top level function declarations to the global scope by
        // inserting the unique scope id for this module - an exception to
        // this is if the function used to be a class that was already
        // hoisted prior to being transformed into a function declaration
        if (!path.scope.parent.parent && !this.hoistedIdentifier[path.node.id.name]) {
          const alias = path.scope.generateUidIdentifier(
            this.moduleScope + path.node.id.name
          );
          path.scope.rename(path.node.id.name,alias.name);
          path.node.id = alias;
        }
      },
      ClassDeclaration: function(path) {
        // hoist top level class declarations to the global scope by
        // inserting the unique scope id for this module
        if (!path.scope.parent.parent) {
          const alias = path.scope.generateUidIdentifier(
            this.moduleScope + path.node.id.name
          );
          path.scope.rename(path.node.id.name,alias.name);
          path.node.id = alias;
          this.hoistedIdentifier[alias.name] = true;
        }
      },
      Identifier: function(path) {
        // if this is a top level identifier that was defined as an export
        // then rewrite this to a member expression on the export container value
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
        // convert usages of exports. or module.exports. to a member expression
        // on the export container value
        if (
          path.node.object.name === 'exports' &&
          !path.scope.hasBinding(path.node.object.name)
        ) {
          path.node.object = this.exportAlias;
        } else if (
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
        this.exportedSymbols.push('*');
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
        if (path.node.declaration) {
          this.exportedSymbols.push('default');
          const decl = path.node.declaration;
          const defaultMember = t.memberExpression(
            this.exportAlias,
            t.identifier('default')
          );
          if (
            decl.type === 'FunctionDeclaration' ||
            decl.type === 'ClassDeclaration' ||
            decl.type === 'VariableDeclaration'
          ) {
            if (!decl.id) {
              decl.id = path.scope.generateUidIdentifier(
                this.moduleScope
              );
              this.hoistedIdentifier[decl.id.name] = true;
            }
            path.replaceWithMultiple([
              decl,
              t.assignmentExpression(
                '=',
                defaultMember,
                decl.id
              )
            ]);
          } else {
            path.replaceWith(
              t.assignmentExpression(
                '=',
                defaultMember,
                decl
              )
            );
          }
        }
      },
      ExportNamedDeclaration: function(path) {
        if (path.node.exportKind === 'type') {
          return;
        }

        if (path.node.declaration) {
          if (
            path.node.declaration.type === 'FunctionDeclaration' ||
            path.node.declaration.type === 'ClassDeclaration'
          ) {
            this.exportedSymbols.push(path.node.declaration.id.name);
            path.remove();
          } else if (path.node.declaration.type === 'VariableDeclaration') {
            const assignments = [];
            const declarations = path.node.declaration.declarations;
            for (let decl of declarations) {
              this.exportedByValue[decl.id.name] = true;
              this.exportedSymbols.push(decl.id.name);
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
          }
        } else {
          const objectProps = [];
          const symbols = [];

          for (let spec of path.node.specifiers) {
            if (path.node.source) {
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
            } else {
              objectProps.push(
                t.objectProperty(spec.exported,spec.local)
              );
            }
            this.exportedSymbols.push(spec.exported.name);
          }

          if (symbols.length) {
            this.opts.emitter.emit('import',{
              moduleName: path.node.source.value,
              variants: this.opts.variants,
              symbols: symbols,
            });
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

      ImportDeclaration: function(path) {
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

          const importCall = t.callExpression(
            t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
            [t.stringLiteral(moduleName)]
          );

          if (symbol !== '*') {
            declarators.push(t.variableDeclarator(
                spec.local,
                t.memberExpression(
                  importCall,
                  t.identifier(symbol)
                )
              )
            );
          } else {
            declarators.push(t.variableDeclarator(
              spec.local,
              importCall
            ));
          }
        }

        this.opts.emitter.emit('import',{
          moduleName: path.node.source.value,
          variants: this.opts.variants,
          symbols: symbols,
        });

        path.replaceWith(t.variableDeclaration(
          'const',
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
            path.node.callee.name = constants.PACKT_IMPORT_PLACEHOLDER;
            this.opts.emitter.emit('import',{
              moduleName: path.node.arguments[0].value,
              variants: this.opts.variants,
              symbols: ['*'],
            });
          }
        }
      },
    },
  };
}

module.exports = transform;
