import scopifyAndProcess from '../scopify-and-process-dependencies';
import {transform as babelTransform} from 'babel-core';

function transform(src, options) {
  const opts = Object.assign(
    {
      scope: '$',
      delegate: {
        importsModule: jest.fn(),
        exportsSymbols: jest.fn(),
        emitWarning: jest.fn(),
        generatedAsset: jest.fn(),
        resolve: jest.fn(),
        getOutputPaths: jest.fn(),
        generateHash: jest.fn(),
      },
      variants: ['default'],
    },
    options || {}
  );
  return {
    code: babelTransform(
      src,
      {
        plugins: [
          [
            scopifyAndProcess,
            opts,
          ],
        ],
      }
    ).code,
    opts,
  };
}

describe('Finds all dependencies and metadata',() => {
  it('Rewrites top level declarations',() => {
    const result = transform(
`var foo = "bar";
function baz() {
  var foobar = "foobar";
}
class foobar {
}
baz();
new foobar()`
    );

    expect(result.code).toEqual(
`var _$_foo = "bar";
function _$_baz() {
  var foobar = "foobar";
}
class _$_foobar {}
_$_baz();
new _$_foobar();`
    ); 
  });

  it('Rewrites named exports', () => {
    const result = transform(
      'export { foo, bar }',
    );

    expect(result.code).toEqual(
`var _$_exports = {};
Object.assign(_$_exports, {
  foo: foo,
  bar: bar
});`
    );
  });

  it('Rewrites named class & function exports', () => {
    const result = transform(
`export class foo {}
export function bar() {}`
    );

    expect(result.code).toEqual(
`var _$_exports = {};
class _$_foo {}
_$_exports.foo = _$_foo
function _$_bar() {}
_$_exports.bar = _$_bar`
    );
  });

  it('Rewrites named aliased exports', () => {
    const result = transform(
      'export { foo as bar }',
    );

    expect(result.code).toEqual(
`var _$_exports = {};
Object.assign(_$_exports, {
  bar: foo
});`
    );
  });

  it('Rewrites named uninitialized exports', () => {
    const result = transform(
`export let foo;
foo = "bar";
function x() {
  const foo = "baz";
}
function y() {
  foo = "baz";
}`
    );

    expect(result.code).toEqual(
`var _$_exports = {};

_$_exports.foo = "bar";
function _$_x() {
  const foo = "baz";
}
function _$_y() {
  _$_exports.foo = "baz";
}`
    );
  });

  it('Rewrites named initialized exports', () => {
    const result = transform(
`export let foo = "bar";
function x() {
  const foo = "baz";
}
function y() {
  foo = "baz";
}`
    );

    expect(result.code).toEqual(
`var _$_exports = {};
_$_exports.foo = "bar";

function _$_x() {
  const foo = "baz";
}
function _$_y() {
  _$_exports.foo = "baz";
}`,
    );
  });

  it('Rewrites uninitialized default exports', () => {
    const result = transform(
`var foo = "baz";
export default foo;`
    );

    expect(result.code).toEqual(
`var _$_exports = {};
var _$_foo = "baz";
_$_exports.default = _$_foo;`
    );
  });

  it('Rewrites default function exports', () => {
    const result = transform(
'export default function() {}'
    );

    expect(result.code).toEqual(
`var _$_exports = {};
function _$_() {}
_$_exports.default = _$_`
    );
  });

  it('Rewrites default named function exports', () => {
    const result = transform(
'export default function foo() {}'
    );

    expect(result.code).toEqual(
`var _$_exports = {};
function _$_foo() {}
_$_exports.default = _$_foo`
    );
  });

  it('Rewrites default named class exports', () => {
    const result = transform(
'export default class foo {}'
    );

    expect(result.code).toEqual(
`var _$_exports = {};
class _$_foo {}
_$_exports.default = _$_foo`
    );
  });

  it('Rewrites wildcard exports imported from another module', () => {
    const result = transform(
'export * from "module";'
    );

    expect(result.code).toEqual(
`var _$_exports = {};
Object.assign(_$_exports, __packt_import__("_$_exports", "module"));`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(1);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'module',
      symbols: ['*'],
      type: 'static',
    });
    expect(result.opts.delegate.exportsSymbols.mock.calls.length).toBe(1);
    expect(result.opts.delegate.exportsSymbols.mock.calls[0][0]).toEqual(
      ['default']
    )
    expect(result.opts.delegate.exportsSymbols.mock.calls[0][1]).toEqual({
      identifier: "_$_exports",
      esModule: true,
      symbols: ['*'],
    });
  });

  it('Rewrites named exports imported from another module', () => {
    const result = transform(
'export {foo, bar as baz} from "module";',
    );

    expect(result.code).toEqual(
`var _$_exports = {};
Object.assign(_$_exports, {
  foo: __packt_import__("_$_exports", "module").foo,
  baz: __packt_import__("_$_exports", "module").bar
});`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(1);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'module',
      symbols: ['foo','baz'],
      type: 'static',
    });
    expect(result.opts.delegate.exportsSymbols.mock.calls.length).toBe(1);
    expect(result.opts.delegate.exportsSymbols.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.exportsSymbols.mock.calls[0][1]).toEqual({
      identifier: "_$_exports",
      esModule: true,
      symbols: ['foo','baz'],
    });
  });

  it('Rewrites default module.exports', () => {
    const result = transform(
`module.exports = "foo";
function x() {
  const module = {};
  module.exports = "bar";
}`
    );

    expect(result.code).toEqual(
`var _$_exports = {};
_$_exports = "foo";
function _$_x() {
  const module = {};
  module.exports = "bar";
}`
    );
  });

  it('Records all named default imports',() => {
    const result = transform(
`import foo from "bar";
foo();`,
    );

    expect(result.code).toEqual(
`
__packt_import__("_$_exports", "bar", true).default();`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(1);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'bar',
      symbols: ['default'],
      type: 'static',
    });
  });

  it('Imports can be assigned as shorthand object properties',() => {
    const result = transform(
`import foo from "bar";
export {
  foo,
};`,
    );

    expect(result.code).toEqual(
`var _$_exports = {};
Object.assign(_$_exports, {
  foo: __packt_import__("_$_exports", "bar", true).default
});`
    );
  });

  it('Records all named imports',() => {
    const result = transform(
`import {foo,baz} from "bar";
foo();
baz();`
    );

    expect(result.code).toEqual(
`
__packt_import__("_$_exports", "bar", false).foo();
__packt_import__("_$_exports", "bar", false).baz();`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(1);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'bar',
      symbols: ['foo','baz'],
      type: 'static',
    });
  });
  
  it('Records all aliased named imports',() => {
    const result = transform(
`import {foo as _,baz as bar} from "bar";
_();
bar();`,
    );

    expect(result.code).toEqual(
`
__packt_import__("_$_exports", "bar", false).foo();
__packt_import__("_$_exports", "bar", false).baz();`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(1);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'bar',
      symbols: ['foo','baz'],
      type: 'static',
    });
  });

  it('Records all namespace imports',() => {
    const result = transform(
`import * as foobar from "bar";
foobar.baz();`,
    );

    expect(result.code).toEqual(
`
__packt_import__("_$_exports", "bar", false).baz();`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(1);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'bar',
      symbols: ['*'],
      type: 'static',
    });
  });

  it('Records all requires',() => {
    const result = transform(
`const x = require("foo");
function bar() {
  const y = require("baz");
  x();
}`,
    );

    expect(result.code).toEqual(
`const _$_x = __packt_import__("_$_exports", "foo");
function _$_bar() {
  const y = __packt_import__("_$_exports", "baz");
  _$_x();
}`
    );
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(2);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'foo',
      symbols: ['*'],
      type: 'static',
    });
    expect(result.opts.delegate.importsModule.mock.calls[1][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[1][1]).toEqual({
      source: 'baz',
      symbols: ['*'],
      type: 'static',
    });
  });

  it('Records requires with resolvable expressions',() => {
    const result = transform(
`const x = require((!false ? "foo" : 0) + "bar");
function bar() {
  const az = "az";
  const y = require(true ? ("b"+az) : "goo");
  if (false) {
    require('unneeded');
  }
  x();
}`,
    );

    expect(result.code).toEqual(
`const _$_x = __packt_import__("_$_exports", "foobar");
function _$_bar() {
  const az = "az";
  const y = __packt_import__("_$_exports", "baz");
  if (false) {
    require('unneeded');
  }
  _$_x();
}`
    );
    // Note the unneeded import is not transformed, or registered due 
    // to it being unreachable
    expect(result.opts.delegate.importsModule.mock.calls.length).toBe(2);
    expect(result.opts.delegate.importsModule.mock.calls[0][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[0][1]).toEqual({
      source: 'foobar',
      symbols: ['*'],
      type: 'static',
    });
    expect(result.opts.delegate.importsModule.mock.calls[1][0]).toEqual(['default']);
    expect(result.opts.delegate.importsModule.mock.calls[1][1]).toEqual({
      source: 'baz',
      symbols: ['*'],
      type: 'static',
    });
  });

  it('allows default and named imports in a single statement',() => {
    const result = transform(
`import foo, {bar} from 'module'
foo();
bar();`
    );

    expect(result.code).toBe(
`
__packt_import__('_$_exports', 'module', true).default();
__packt_import__('_$_exports', 'module', false).bar();`
    );
  });

  it('allows default and wildcard imports in a single statement',() => {
    const result = transform(
`import foo, * as bar from 'module'
foo();
bar.baz();`
    );

    expect(result.code).toBe(
`
__packt_import__('_$_exports', 'module', true).default();
__packt_import__('_$_exports', 'module', false).baz();`
    );
  });

  it('rewrites usages of imported identifiers',() => {
    const result = transform(
`import * as bar from 'module'
import * as baz from 'module'

class foo {
  constructor() {
    const baz = "baz";
    this.func(baz.length);
    this.func(bar.someMember);
  }
  func() {}
}`
    );

    expect(result.code).toBe(
`

class _$_foo {
  constructor() {
    const baz = "baz";
    this.func(baz.length);
    this.func(__packt_import__('_$_exports', 'module', false).someMember);
  }
  func() {}
}`
    );
  });

  it('anonymous import is a noop',() => {
    const result = transform(
`import 'module'`
    );

    expect(result.code).toBe('');
  });
});
