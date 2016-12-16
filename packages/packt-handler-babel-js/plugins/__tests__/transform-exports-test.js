const transformExports = require('../transform-exports');
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
          transformExports,
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
          transformExports,
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
          transformExports,
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

  it('Rewrites named uninitialized exports', () => {
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
          transformExports,
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

  it('Rewrites named initialized exports', () => {
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
          transformExports,
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

  it('Rewrites uninitialized default exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'var foo = "baz";\n' +
      'export default foo;',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'var _foo$ = "baz";\n' +
      '_exports$.default = _foo$;'
    );
  });

  it('Rewrites default function exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export default function() {}',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n\n' +
      '_exports$.default = function () {};'
    );
  });

  it('Rewrites default named function exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export default function foo() {}',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'function _foo$() {}\n' +
      '_exports$.default = _foo$'
    );
  });

  it('Rewrites default named class exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'export default class foo {}',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'class _foo$ {}\n' +
      '_exports$.default = _foo$'
    );
  });

  it('Rewrites wildcard exports imported from another module', () => {
    const pluginOpts = {
      scope: '$',
      emitter: {
        emit: jest.fn(),
      },
      variants: ['default'],
    };

    const result = babel.transform(
      'export * from "module";',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'Object.assign(_exports$, __packt_import__("module"));'
    );
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(1);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'module',
      variants: ['default'],
      symbols: ['*'],
    });
  });

  it('Rewrites named exports imported from another module', () => {
    const pluginOpts = {
      scope: '$',
      emitter: {
        emit: jest.fn(),
      },
      variants: ['default'],
    };

    const result = babel.transform(
      'export {foo, bar as baz} from "module";',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      'Object.assign(_exports$, {\n' +
      '  foo: __packt_import__("module").foo,\n' +
      '  baz: __packt_import__("module").bar\n' +
      '});'
    );
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(1);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'module',
      variants: ['default'],
      symbols: ['foo','baz'],
    });
  });

  it('Rewrites default module.exports', () => {
    const pluginOpts = {
      scope: '$',
    };

    const result = babel.transform(
      'module.exports = "foo";\n' +
      'function x() {\n' +
      '  const module = {};\n' +
      '  module.exports = "bar";\n' +
      '}',
    {
      plugins: [
        [
          transformExports,
          pluginOpts,
        ]
      ]
    });

    expect(result.code).toEqual(
      'var _exports$ = {};\n' +
      '_exports$ = "foo";\n' +
      'function _x$() {\n' +
      '  const module = {};\n' +
      '  module.exports = "bar";\n' +
      '}',
    );
  });
});
