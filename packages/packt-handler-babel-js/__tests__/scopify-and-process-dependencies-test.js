const scopifyAndProcess = require('../scopify-and-process-dependencies');
const babel = require('babel-core');

function transform(src, options) {
  const opts = Object.assign(
    {
      scope: '$',
      emitter: {
        emit: jest.fn(),
      },
      variants: ['default'],
    },
    options || {}
  );
  return {
    code: babel.transform(
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
`let _$_exports = {};
var _$_foo = "bar";
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
`let _$_exports = {};
Object.assign(_$_exports, {
  foo: foo,
  bar: bar
});`
    );
  });

  it('Rewrites named aliased exports', () => {
    const result = transform(
      'export { foo as bar }',
    );

    expect(result.code).toEqual(
`let _$_exports = {};
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
`let _$_exports = {};

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
`let _$_exports = {};
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
`let _$_exports = {};
var _$_foo = "baz";
_$_exports.default = _$_foo;`
    );
  });

  it('Rewrites default function exports', () => {
    const result = transform(
'export default function() {}'
    );

    expect(result.code).toEqual(
`let _$_exports = {};
function _$_() {}
_$_exports.default = _$_`
    );
  });

  it('Rewrites default named function exports', () => {
    const result = transform(
'export default function foo() {}'
    );

    expect(result.code).toEqual(
`let _$_exports = {};
function _$_foo() {}
_$_exports.default = _$_foo`
    );
  });

  it('Rewrites default named class exports', () => {
    const result = transform(
'export default class foo {}'
    );

    expect(result.code).toEqual(
`let _$_exports = {};
class _$_foo {}
_$_exports.default = _$_foo`
    );
  });

  it('Rewrites wildcard exports imported from another module', () => {
    const result = transform(
'export * from "module";'
    );

    expect(result.code).toEqual(
`let _$_exports = {};
Object.assign(_$_exports, __packt_import__("module"));`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(2);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'module',
      variants: ['default'],
      symbols: ['*'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('exports');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      exportIdentifier: "_$_exports",
      variants: ['default'],
      symbols: ['*'],
    });
  });

  it('Rewrites named exports imported from another module', () => {
    const result = transform(
'export {foo, bar as baz} from "module";',
    );

    expect(result.code).toEqual(
`let _$_exports = {};
Object.assign(_$_exports, {
  foo: __packt_import__("module").foo,
  baz: __packt_import__("module").bar
});`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(2);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'module',
      variants: ['default'],
      symbols: ['foo','baz'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('exports');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      exportIdentifier: "_$_exports",
      variants: ['default'],
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
`let _$_exports = {};
_$_exports = "foo";
function _$_x() {
  const module = {};
  module.exports = "bar";
}`
    );
  });
  it('Records all named default imports',() => {
    const result = transform(
'import foo from "bar";\nfoo();',
    );

    expect(result.code).toEqual(
`let _$_exports = {};

const _$_foo = __packt_import__("bar").default;

_$_foo();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['default'],
    });
  });

  it('Records all named imports',() => {
    const result = transform(
`import {foo,baz} from "bar";
foo();
baz();`
    );

    expect(result.code).toEqual(
`let _$_exports = {};

const _$_foo = __packt_import__("bar").foo,
      _$_baz = __packt_import__("bar").baz;

_$_foo();
_$_baz();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['foo','baz'],
    });
  });
  
  it('Records all aliased named imports',() => {
    const result = transform(
`import {foo as _,baz as bar} from "bar";
_();
bar();`,
    );

    expect(result.code).toEqual(
`let _$_exports = {};

const _$__ = __packt_import__("bar").foo,
      _$_bar = __packt_import__("bar").baz;

_$__();
_$_bar();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['foo','baz'],
    });
  });

  it('Records all namespace imports',() => {
    const result = transform(
`import * as foobar from "bar";
foobar.baz();`,
    );

    expect(result.code).toEqual(
`let _$_exports = {};

const _$_foobar = __packt_import__("bar");

_$_foobar.baz();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'bar',
      variants: ['default'],
      symbols: ['*'],
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
`let _$_exports = {};
const _$_x = __packt_import__("foo");
function _$_bar() {
  const y = __packt_import__("baz");
  _$_x();
}`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(2);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      moduleName: 'foo',
      variants: ['default'],
      symbols: ['*'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      moduleName: 'baz',
      variants: ['default'],
      symbols: ['*'],
    });
  });

  /**
   * TODO
   * import default, { } from 'module';
   * import default, * as name from 'module';
   * import 'module';
   */
});
