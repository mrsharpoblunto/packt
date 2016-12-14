const findExports = require('../find-exports');
const babel = require('babel-core');

describe('Finds all exports & hoists scopes',() => {
  it('Rewrites top level declarations',() => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'var foo = "bar";\n' +
      'function baz() {\n' + 
      '  var foobar = "foobar";\n' +
      '}\n' +
      'class foobar {\n' +
      '}\n' + 
      'baz();\n' +
      'new foobar()',
    {
      plugins: [
        [
          findExports,
          pluginOpts,
        ],
      ],
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' + 
      'var _foo$ = "bar";\n' +
      'function _baz$() {\n' + 
      '  var foobar = "foobar";\n' +
      '}\n' +
      'class _foobar$ {}\n' + 
      '_baz$();\n' +
      'new _foobar$();',
    ); 
  });

  it('Rewrites named exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export { foo, bar }',
    {
      plugins: [
        [
          findExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'Object.assign(_exports$, {\n' +
      '  foo: foo,\n' +
      '  bar: bar\n' +
      '});'
    );
  });

  it('Rewrites named aliased exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export { foo as bar }',
    {
      plugins: [
        [
          findExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'Object.assign(_exports$, {\n' +
      '  bar: foo\n' +
      '});'
    );
  });

  it('Rewrites named aliased exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export let foo;\n' +
      'foo = "bar";\n' +
      'function x() {\n' +
      '  const foo = "baz";\n' +
      '}\n' + 
      'function y() {\n' +
      '  foo = "baz";\n' +
      '}',
    {
      plugins: [
        [
          findExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n\n' +
      '_exports$.foo = "bar";\n' +
      'function _x$() {\n' +
      '  const foo = "baz";\n' +
      '}\n' +
      'function _y$() {\n' +
      '  _exports$.foo = "baz";\n' +
      '}',
    );
  });

  it('Rewrites named aliased exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export let foo = "bar";\n' +
      'function x() {\n' +
      '  const foo = "baz";\n' +
      '}\n' + 
      'function y() {\n' +
      '  foo = "baz";\n' +
      '}',
    {
      plugins: [
        [
          findExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      '_exports$.foo = "bar";\n\n' +
      'function _x$() {\n' +
      '  const foo = "baz";\n' +
      '}\n' +
      'function _y$() {\n' +
      '  _exports$.foo = "baz";\n' +
      '}',
    );
  });

  /*
   * export default foo;
   * _exports = {};
   * _exports.default = _foo;
   */

  /*
   * export default function () {}
   * function _() {}
   * _exports = {};
   * _exports.default = _;
   */

  /*
   * export default function foo() {}
   * function _foo() {}
   * _exports = {};
   * _exports.default = _foo;
   */

  /*
   * export * from 'module';
   * _exports = {};
   * Object.assign(_exports,__packt_import('module'));
   * // adds dep on module.
   */

  /*
   * export { foo, bar } fom 'module';
   * _exports = {};
   * Object.assign(_exports,{
   *  foo: __packt_import('module').foo,
   *  bar: __packt_import('module').bar,
   * });
   * // adds dep on module
   */

  /*
   * export { foo as baz } fom 'module';
   * _exports = {};
   * Object.assign(_exports,{
   *  baz: __packt_import('module').foo,
   * });
   * // adds dep on module
   */



});
