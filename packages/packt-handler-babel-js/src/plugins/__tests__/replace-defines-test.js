import replaceDefines from '../replace-defines';
import {transform as babelTransform} from 'babel-core';

function transform(src, defines) {
  return babelTransform(
    src,
    {
      plugins: [
        [
          replaceDefines,
          {
            defines: defines,
          },
        ],
      ],
    }
  ).code;
}

describe('Replaces all compile time defines',() => {
  it('replaces process.env settings',() => {
    process.env.FOO = "test";
    const output = transform(
`var foo = process.env.FOO;`
    ,{
    });

    expect(output).toBe(
`var foo = "test";`
    );
  });

  it('replaces identifiers',() => {
    const output = transform(
`var foo = __FOO__;
var bar = __BAR__; 
var baz = __BAZ__;`
    ,{
      __FOO__: "foo",
      __BAR__: true,
      __BAZ__: 2.5,
    });

    expect(output).toBe(
`var foo = "foo";
var bar = true;
var baz = 2.5;`
    );
  });

  it('doesnt replace identifiers declared in scope',() => {
    const output = transform(
`function x() {
  var __FOO__ = "bar";
  __FOO__;
}
__FOO__;`
    ,{
      __FOO__: "foo",
    });

    expect(output).toBe(
`function x() {
  var __FOO__ = "bar";
  __FOO__;
}
"foo";`
    );

  });
});
