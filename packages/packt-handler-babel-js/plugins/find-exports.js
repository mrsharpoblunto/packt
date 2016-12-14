'use strict';

const babel = require('babel-core');

/*
 
 ex 1.

 function foo() {
 }

 module.exports = foo;
 module.exports.bar = 1;

 =>

 function $1foo() {
 }

 const $1exports = $1foo;
 $1exports.bar = 1;

 ex 2.

 export function bar() {
 }

 export function baz() {
 }

 =>

 function $2bar() {
 }

// record offsets
 function $2baz() {
 }

 const $2exports = {
   bar: $2bar
   baz: $2baz
 }

 ex. 3
 const x = require('foo').default;

 =>

 const $5x = { default: __packt_import__('foo') }.default;

 ex. 4

 import {bar as baz} from 'bar';

 =>

 const $3baz = __packt_import__('bar').bar;

 ex. 5 

 import * as bar from 'bar';

 =>

 const $4bar = __packt_import('bar');
 
 
 */

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
          this.exportedByValue[path.node.name] && 
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
        // TODO replace module.exports with exportAlias
      },
      ExportDefaultDeclaration: function(path) {

        // TODO assign to exportAlias.default
        // TODO record exported symbol name & local alias
      },
      ExportNamedDeclaration: function(path) {
        if (path.node.declaration) {
          const assignments = [];
          for (let decl of path.node.declaration.declarations) {
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
        } else {
          const objectProps = [];
          for (let spec of path.node.specifiers) {
            objectProps.push(
              t.objectProperty(spec.exported,spec.local)
            );
          }
          return path.replaceWith(
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
        // TODO assign to exportAlias.namedProp
        // TODO record exported symbol name & local alias
      },
    },
  };
}

module.exports = findExports;
