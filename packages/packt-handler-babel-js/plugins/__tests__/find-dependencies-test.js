const findDeps = require('../find-dependencies');
const babel = require('babel-core');

describe('Finds all dependencies and metadata',() => {
  it('Records all named default imports',() => {
    const pluginOpts = {
      emitter: {
        emit: jest.fn(),
      },
      scope: '$',
      variants: ['default'],
    };

    const result = babel.transform(
      'import foo from "bar";\nfoo();',
    {
      plugins: [
        [
          findDeps,
          pluginOpts,
        ],
      ],
    });

    expect(result.code).toEqual('var _foo$ = __packt_import__("bar").default;\n\n_foo$();');
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(1);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('dependency');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['default'],
    });
  });

  it('Records all named imports',() => {
    const pluginOpts = {
      emitter: {
        emit: jest.fn(),
      },
      scope: '$',
      variants: ['default'],
    };

    const result = babel.transform(
      'import {foo,baz} from "bar";\nfoo();\nbaz();',
    {
      plugins: [
        [
          findDeps,
          pluginOpts,
        ],
      ],
    });

    expect(result.code).toEqual(
      'var _foo$ = __packt_import__("bar").foo,\n' +
      '    _baz$ = __packt_import__("bar").baz;\n\n' +
      '_foo$();\n_baz$();');
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(1);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('dependency');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['foo','baz'],
    });
  });
  
  it('Records all aliased named imports',() => {
    const pluginOpts = {
      emitter: {
        emit: jest.fn(),
      },
      scope: '$',
      variants: ['default'],
    };

    const result = babel.transform(
      'import {foo as _,baz as bar} from "bar";\n_();\nbar();',
    {
      plugins: [
        [
          findDeps,
          pluginOpts,
        ],
      ],
    });

    expect(result.code).toEqual(
      'var _$ = __packt_import__("bar").foo,\n' +
      '    _bar$ = __packt_import__("bar").baz;\n\n' +
      '_$();\n_bar$();');
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(1);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('dependency');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['foo','baz'],
    });
  });

  it('Records all namespace imports',() => {
    const pluginOpts = {
      emitter: {
        emit: jest.fn(),
      },
      scope: '$',
      variants: ['default'],
    };

    const result = babel.transform(
      'import * as foobar from "bar";\nfoobar.baz();',
    {
      plugins: [
        [
          findDeps,
          pluginOpts,
        ],
      ],
    });

    expect(result.code).toEqual(
      'var _foobar$ = __packt_import__("bar");\n\n_foobar$.baz();');
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(1);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('dependency');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['*'],
    });
  });

  it('Records all requires',() => {
    const pluginOpts = {
      emitter: {
        emit: jest.fn(),
      },
      scope: '$',
      variants: ['default'],
    };

    const result = babel.transform(
      'const x = require("foo");\nfunction bar() {\n' +
      '  const y = require("baz");\nx();\n}',
    {
      plugins: [
        [
          findDeps,
          pluginOpts,
        ],
      ],
    });

    expect(result.code).toEqual(
      'const x = __packt_import__("foo");\nfunction bar() {\n' +
      '  const y = __packt_import__("baz");\n  x();\n' +
      '}');
    expect(pluginOpts.emitter.emit.mock.calls.length).toBe(2);
    expect(pluginOpts.emitter.emit.mock.calls[0][0]).toEqual('dependency');
    expect(pluginOpts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'foo',
      variants: ['default'],
      symbols: ['*'],
    });
    expect(pluginOpts.emitter.emit.mock.calls[1][0]).toEqual('dependency');
    expect(pluginOpts.emitter.emit.mock.calls[1][1]).toEqual({
      moduleName: 'baz',
      variants: ['default'],
      symbols: ['*'],
    });
  });

  /**
   * import default, { } from 'module';
   * import default, * as name from 'module';
   * import 'module';
   */
});
