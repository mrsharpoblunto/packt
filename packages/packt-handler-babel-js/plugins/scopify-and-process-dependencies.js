'use strict';

const babel = require('babel-core');
const constants = require('../constants');
const helpers = require('./helpers');
const evaluateExpression = require('./evaluate-expression-visitor');
const t = babel.types;

function transform(babel) {
  return {
    pre() {
      this.exportedSymbols = [];
      this.exportedByValue = {};
      this.hoistedIdentifier = {};
      this.localImports = {};
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
      Program: {
        enter: function(path) {
          this.exportAlias = path.scope.generateUidIdentifier(
            this.moduleScope + 'exports'
          );
          this.moduleExport = this.exportAlias.name;
        },
        exit: function(path) {
          if (this.exportedSymbols.length) {
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
          }
        },
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
        if (
          !path.scope.parent.parent && 
          !this.hoistedIdentifier[path.node.id.name]
        ) {
          const alias = path.scope.generateUidIdentifier(
            this.moduleScope + path.node.id.name
          );
          path.scope.rename(path.node.id.name,alias.name);
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
          this.hoistedIdentifier[alias.name] = true;
        }
      },
      ObjectProperty: function(path) {
        if (
          path.node.shorthand &&
          this.localImports.hasOwnProperty(path.node.key.name) &&
          // TODO change this to check for no binding, or root only
          (!path.scope.parent || !path.scope.hasBinding(path.node.key.name))
        ) {
          const localImport = getImportPlaceholder(
            path.node.key.name,
            this.localImports
          );
          path.replaceWith(t.objectProperty(
            path.node.key,
            localImport
          ));
          path.skip();
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
        } else if (
          this.localImports.hasOwnProperty(path.node.name)
          // TODO change this to check for no binding, or root only
        ) {
          const localImport = getImportPlaceholder(
            path.node.name,
            this.localImports
          );
          path.replaceWith(localImport);
          path.skip();
        }
      },
      MemberExpression: function(path) {
        // convert usages of exports. or module.exports. to a member expression
        // on the export container value
        if (
          path.node.object.name === 'exports' &&
          !path.scope.hasBinding('exports')
        ) {
          path.node.object = this.exportAlias;
          exportSymbol(this.exportedSymbols, '*');
        } else if (
          path.node.object.name === 'module' &&
          path.node.property.name === 'exports' &&
          !path.scope.hasBinding('module')
        ) {
          path.replaceWith(this.exportAlias);
          exportSymbol(this.exportedSymbols, '*');
        }
      },
      ExportAllDeclaration: function(path) {
        this.opts.emitter.emit('import',{
          moduleName: path.node.source.value,
          variants: this.opts.variants,
          symbols: ['*'],
        });
        exportSymbol(this.exportedSymbols, '*');
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
        path.skip();
      },
      ExportDefaultDeclaration: function(path) {
        if (path.node.declaration) {
          exportSymbol(this.exportedSymbols, 'default');
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
            exportSymbol(this.exportedSymbols, path.node.declaration.id.name);
            const namedMember = t.memberExpression(
              this.exportAlias,
              t.identifier(path.node.declaration.id.name)
            );
            path.replaceWithMultiple([
              path.node.declaration,
              t.assignmentExpression(
                '=',
                namedMember,
                path.node.declaration.id
              )
            ]);
          } else if (path.node.declaration.type === 'VariableDeclaration') {
            const assignments = [];
            const declarations = path.node.declaration.declarations;
            for (let decl of declarations) {
              this.exportedByValue[decl.id.name] = true;
              exportSymbol(this.exportedSymbols, decl.id.name);
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
            let local = spec.local;
            if (
              spec.local &&
              this.localImports.hasOwnProperty(spec.local.name) &&
              // TODO change this to check for no binding, or root only
              (!path.scope.parent || !path.scope.hasBinding(spec.local.name))
            ) {
              local = getImportPlaceholder(
                spec.local.name,
                this.localImports
              );
            }
            if (path.node.source) {
              objectProps.push(
                t.objectProperty(
                  spec.exported,
                  t.memberExpression(
                    t.callExpression(
                      t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
                      [path.node.source]
                    ),
                    local || spec.exported
                  )
                )
              );
              symbols.push(spec.exported.name);
            } else {
              objectProps.push(
                t.objectProperty(spec.exported,local)
              );
            }
            exportSymbol(this.exportedSymbols, spec.exported.name);
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
          path.skip();
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
          this.localImports[spec.local.name] = {
            moduleName: moduleName,
            symbol: symbol,
          };
        }

        this.opts.emitter.emit('import',{
          moduleName: path.node.source.value,
          variants: this.opts.variants,
          symbols: symbols,
        });

        path.remove();
      },
      CallExpression: {
        exit: function(path) {
          if (
            path.node.callee.name === 'require' && 
            !path.scope.hasBinding('require') && 
            !isUnreachable(path)
          ) {
            if (path.node.arguments.length !== 1) {
              throw path.buildCodeFrameError("Expected a single argument to require");
            } else if (path.node.arguments[0].type !== 'StringLiteral') {
              path.traverse(evaluateExpression,{
                skipIdentifier: 'require',
              });
              if (path.node.arguments[0].type !== 'StringLiteral') {
                throw path.buildCodeFrameError(
                  "Argument to require must be a string literal, or expression that can be evaluated statically at build time"
                );
              }
            }
            const required = path.node.arguments[0].value;

            path.node.callee.name = constants.PACKT_IMPORT_PLACEHOLDER;
            this.opts.emitter.emit('import',{
              moduleName: required,
              variants: this.opts.variants,
              symbols: ['*'],
            });
          }
        },
      },
    },
  };
}

function isUnreachable(path) {
  // if any if statement/conditional statically evaluates to false 
  // anywhere from the path in question to the root scope, then the
  // code is unreachable
  while (path) {
    path = path.findParent((path) => 
      path.isConditionalExpression() ||
      path.isIfStatement()
    );
    if (path) {
      path.traverse(evaluateExpression);
      const result = helpers.getLiteralOrConst(path.node.test, path.scope);
      if (result && !result.value) {
        return true;
      }
      // if the result is true, or inconclusive, we need to go up the tree
      // to see if theres any definitive false conditionals
    }
  }
  return false;
}

function getImportPlaceholder(name,localImports) {
  const localImport = localImports[name];
  const importCall = t.callExpression(
    t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
    [t.stringLiteral(localImport.moduleName)]
  );

  if (localImport.symbol !== '*') {
    return t.memberExpression(
      importCall,
      t.identifier(localImport.symbol)
    );
  } else {
    return importCall;
  }
}

function exportSymbol(exportedSymbols, symbol) {
  if (symbol === '*') {
    exportedSymbols.length = 0;
    exportedSymbols.push('*');
  }
  if (!exportedSymbols.length || exportedSymbols[0]!=='*') {
    exportedSymbols.push(symbol);
  }
}

module.exports = transform;
