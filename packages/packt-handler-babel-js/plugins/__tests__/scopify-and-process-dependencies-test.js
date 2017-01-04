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
`let _$_exports = {};
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
`let _$_exports = {};
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
      imported: {
        source: 'module',
        symbols: ['*'],
      },
      variants: ['default'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('export');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      exported: {
        identifier: "_$_exports",
        symbols: ['*'],
      },
      variants: ['default'],
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
      imported: {
        source: 'module',
        symbols: ['foo','baz'],
      },
      variants: ['default'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('export');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      exported: {
        identifier: "_$_exports",
        symbols: ['foo','baz'],
      },
      variants: ['default'],
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
`import foo from "bar";
foo();`,
    );

    expect(result.code).toEqual(
`
__packt_import__("bar").default();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      imported: {
        source: 'bar',
        symbols: ['default'],
      },
      variants: ['default'],
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
`let _$_exports = {};
Object.assign(_$_exports, {
  foo: __packt_import__("bar").default
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
__packt_import__("bar").foo();
__packt_import__("bar").baz();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      imported: {
        source: 'bar',
        symbols: ['foo','baz'],
      },
      variants: ['default'],
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
__packt_import__("bar").foo();
__packt_import__("bar").baz();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      imported: {
        source: 'bar',
        symbols: ['foo','baz'],
      },
      variants: ['default'],
    });
  });

  it('Records all namespace imports',() => {
    const result = transform(
`import * as foobar from "bar";
foobar.baz();`,
    );

    expect(result.code).toEqual(
`
__packt_import__("bar").baz();`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(1);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      imported: {
        source: 'bar',
        symbols: ['*'],
      },
      variants: ['default'],
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
`const _$_x = __packt_import__("foo");
function _$_bar() {
  const y = __packt_import__("baz");
  _$_x();
}`
    );
    expect(result.opts.emitter.emit.mock.calls.length).toBe(2);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      imported: {
        source: 'foo',
        symbols: ['*'],
      },
      variants: ['default'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      imported: {
        source: 'baz',
        symbols: ['*'],
      },
      variants: ['default'],
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
`const _$_x = __packt_import__("foobar");
function _$_bar() {
  const az = "az";
  const y = __packt_import__("baz");
  if (false) {
    require('unneeded');
  }
  _$_x();
}`
    );
    // Note the unneeded import is not transformed, or registered due 
    // to it being unreachable
    expect(result.opts.emitter.emit.mock.calls.length).toBe(2);
    expect(result.opts.emitter.emit.mock.calls[0][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[0][1]).toEqual({
      imported: {
        source: 'foobar',
        symbols: ['*'],
      },
      variants: ['default'],
    });
    expect(result.opts.emitter.emit.mock.calls[1][0]).toEqual('import');
    expect(result.opts.emitter.emit.mock.calls[1][1]).toEqual({
      imported: {
        source: 'baz',
        symbols: ['*'],
      },
      variants: ['default'],
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
__packt_import__('module').default();
__packt_import__('module').bar();`
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
__packt_import__('module').default();
__packt_import__('module').baz();`
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
    this.func(__packt_import__('module').someMember);
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
