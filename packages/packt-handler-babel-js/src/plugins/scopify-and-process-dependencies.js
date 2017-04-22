import * as t from 'babel-types';
import constants from '../constants';
import * as helpers from './helpers';
import evaluateExpression from './evaluate-expression-visitor';

export default function transform(babel) {
  return {
    pre() {
      this.exportedSymbols = [];
      this.exportedSymbols.esModule = false;
      this.exportedByValue = {};
      this.hoisted = {};
      this.importAliases = {};
      this.symbolAliases = {};
      this.moduleScope = '_' + this.opts.scope + '_';
    },
    post() {
      // inform the dependency graph what exported symbols
      // this module provides, & under what identifier they are
      // associated in the global scope
      this.opts.delegate.exportsSymbols(
        this.opts.variants,
        {
            identifier: this.moduleExport,
            symbols: this.exportedSymbols.slice(0),
            esModule: this.exportedSymbols.esModule,
        }
      );
    },
    visitor: {
      Program: {
        enter: function(path) {
          this.exportAlias = path.scope.generateUidIdentifier(
            this.moduleScope + 
            (this.opts.preserveIdentifiers ? 'exports' : '')
          );
          this.moduleExport = this.exportAlias.name;
        },
        exit: function(path) {
          const aliases = [];
          for (let alias in this.symbolAliases) {
            aliases.push(this.symbolAliases[alias].declaration);
          }
          if (aliases.length) {
            path.unshiftContainer('body', aliases);
          }

          if (this.exportedSymbols.length) {
            // create top level export object
            path.unshiftContainer('body', 
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.identifier('window'),
                    this.exportAlias
                  ),
                  t.objectExpression([])
                )
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
              this.hoisted.hasOwnProperty(decl.id.name) ||
              this.exportedByValue.hasOwnProperty(decl.id.name)
            ) {
              continue;
            }
            const alias = path.scope.generateUidIdentifier(
              this.moduleScope + 
              (this.opts.preserveIdentifiers ? decl.id.name : '')
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
          !this.hoisted.hasOwnProperty(path.node.id.name)
        ) {
          const alias = path.scope.generateUidIdentifier(
            this.moduleScope + 
            (this.opts.preserveIdentifiers ? path.node.id.name : '')
          );
          path.scope.rename(path.node.id.name,alias.name);
        }
      },
      ClassDeclaration: function(path) {
        // hoist top level class declarations to the global scope by
        // inserting the unique scope id for this module
        if (!path.scope.parent.parent) {
          const alias = path.scope.generateUidIdentifier(
            this.moduleScope + 
            (this.opts.preserveIdentifiers ? path.node.id.name : '')
          );
          path.scope.rename(path.node.id.name,alias.name);
          this.hoisted[alias.name] = true;
        }
      },
      ObjectProperty: function(path) {
        if (
          path.node.shorthand &&
          this.importAliases.hasOwnProperty(path.node.key.name) &&
          !path.scope.hasBinding(path.node.key.name)
        ) {
          const localImport = getImportPlaceholder(
            path.node.key.name,
            path.scope,
            this.exportAlias,
            this.importAliases,
            this.symbolAliases
          );
          path.replaceWith(t.objectProperty(
            path.node.key,
            localImport
          ));
          path.skip();
        }
      },
      Identifier: function(path) {
        const parentNodeType = path.parentPath.node.type;
        if (
          (
            parentNodeType === 'MemberExpression' &&
            path.node === path.parentPath.node.property
          ) ||
          parentNodeType === 'FunctionDeclaration' ||
          parentNodeType === 'ClassMethod' ||
          (
            parentNodeType === 'ObjectProperty' &&
            path.node === path.parentPath.node.key
          )
        ) {
          return;
        }

        // if this is a program level identifier that was defined as an export
        // then rewrite this to a member expression on the export container value
        if (
          this.exportedByValue.hasOwnProperty(path.node.name) &&
          hasProgramLevelBindingOnly(path, path.node.name)
        ) {
          path.replaceWith(
            t.memberExpression(
              this.exportAlias,
              path.node
            )
          );
          path.skip();
        } else if (
          this.importAliases.hasOwnProperty(path.node.name) &&
          !path.scope.hasBinding(path.node.name)
        ) {
          const localImport = getImportPlaceholder(
            path.node.name,
            path.scope,
            this.exportAlias,
            this.importAliases,
            this.symbolAliases
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
          exportSymbol(this.exportedSymbols, '*', false);
        } else if (
          path.node.object.name === 'module' &&
          path.node.property.name === 'exports' &&
          !path.scope.hasBinding('module')
        ) {
          path.replaceWith(this.exportAlias);
          exportSymbol(this.exportedSymbols, '*', false);
        }
      },
      ExportAllDeclaration: function(path) {
        this.opts.delegate.importsModule(
          this.opts.variants,
          {
            source: path.node.source.value,
            symbols: ['*'],
            type: 'static',
          }
        );
        exportSymbol(this.exportedSymbols, '*', true);
        path.replaceWith(t.callExpression(
          t.memberExpression(
            t.identifier('Object'),
            t.identifier('assign')
          ),
          [
            this.exportAlias,
            t.callExpression(
              t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
              [
                t.stringLiteral(this.exportAlias.name),
                path.node.source,
              ]
            ),
          ]
        ));
        path.skip();
      },
      ExportDefaultDeclaration: function(path) {
        if (path.node.declaration) {
          exportSymbol(this.exportedSymbols, 'default', true);
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
              this.hoisted[decl.id.name] = true;
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
            exportSymbol(this.exportedSymbols, path.node.declaration.id.name, true);
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
              exportSymbol(this.exportedSymbols, decl.id.name, true);
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
              this.importAliases.hasOwnProperty(spec.local.name) &&
              !path.scope.hasBinding(spec.local.name)
            ) {
              local = getImportPlaceholder(
                spec.local.name,
                path.scope,
                this.exportAlias,
                this.importAliases,
                this.symbolAliases
              );
            }
            if (path.node.source) {
              objectProps.push(
                t.objectProperty(
                  spec.exported,
                  t.memberExpression(
                    t.callExpression(
                      t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
                      [
                        t.stringLiteral(this.exportAlias.name),
                        path.node.source,
                      ]
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
            exportSymbol(this.exportedSymbols, spec.exported.name, true);
          }

          if (symbols.length) {
            this.opts.delegate.importsModule(
              this.opts.variants,
              {
                source: path.node.source.value,
                symbols: symbols,
                type: 'static',
              }
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
          this.importAliases[spec.local.name] = {
            moduleName: moduleName,
            symbol: symbol,
          };
          path.scope.removeBinding(spec.local.name);
        }

        this.opts.delegate.importsModule(
          this.opts.variants,
          {
            source: path.node.source.value,
            symbols: symbols,
            type: 'static',
          }
        );

        path.remove();
      },
      CallExpression: {
        exit: function(path) {
          if (path.node.callee.type === 'import') {
            this.opts.delegate.importsModule(
              this.opts.variants,
              {
                source: required,
                symbols: ['*'],
                type: 'dynamic',
              }
            );
          } else if (
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
            path.node.arguments.unshift(t.stringLiteral(this.exportAlias.name));
            this.opts.delegate.importsModule(
              this.opts.variants,
              {
                source: required,
                symbols: ['*'],
                type: 'static',
              }
            );
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

function getImportPlaceholder(
  name,
  scope,
  exportAlias,
  importAliases,
  symbolAliases
) {
  const localImport = importAliases[name];
  const args = [
    t.stringLiteral(exportAlias.name),
    t.stringLiteral(localImport.moduleName),
  ];

  if (localImport.symbol === '*') {
    // for wildcard imports we just inline the import placeholder directly
    return t.callExpression(
      t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
      args
    );
  } else {
    // but for specific symbol imports, we want to create a local alias
    // variable that we can refer to, so we can save both the space of
    // re-referring to the exportIdentifer + symbolName and save an
    // extra property access.
    let symbolAlias = symbolAliases[localImport.moduleName+':'+localImport.symbol];
    if (!symbolAlias) {
      args.push(t.stringLiteral(localImport.symbol));
      const identifier = scope.generateUidIdentifier(
        exportAlias.name
      );
      symbolAlias = symbolAliases[localImport.moduleName+':'+localImport.symbol] = {
        identifier,
        declaration: t.variableDeclaration(
          'var',
          [
            t.variableDeclarator(
              identifier, 
              t.callExpression(
                t.identifier(constants.PACKT_IMPORT_PLACEHOLDER),
                args
              )
            ),
          ]
        ),
      };
    }
    return symbolAlias.identifier;
  }
}

function exportSymbol(exportedSymbols, symbol, esModule) {
  exportedSymbols.esModule = esModule;
  if (symbol === '*') {
    exportedSymbols.length = 0;
    exportedSymbols.push('*');
  }
  if (!exportedSymbols.length || exportedSymbols[0]!=='*') {
    exportedSymbols.push(symbol);
  }
}

function hasProgramLevelBindingOnly(path, name) {
  let scope = path.scope;
  while (!scope.path.isProgram()) {
    if (scope.hasOwnBinding(name)) {
      return false;
    }
    scope = scope.parent;
  }
  return true;
}
