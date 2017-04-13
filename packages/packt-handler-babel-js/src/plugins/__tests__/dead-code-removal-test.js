const deadCodeRemoval = require('../dead-code-removal');
const babel = require('babel-core');

function transform(src) {
  return babel.transform(
    src,
    {
      plugins: [
        deadCodeRemoval,
      ],
    }
  ).code;
}

describe('Removes blocks of dead code',() => {
  it('Cuts out unreachable code',() => {
    const output = transform(
`const foo = false;
if (foo) {
  console.log('foo');
}`
    );

    expect(output).toBe(
`const foo = false;`
    );
  });

  it('Cuts out false alternates',() => {
    const output = transform(
`const foo = false;
const baz = 1;
if (foo) {
  console.log('foo');
} else {
  console.log((foo || baz) ? 'bar' : 'baz');
}`
    );

    expect(output).toBe(
`const foo = false;
const baz = 1;
{
  console.log('bar');
}`
    );
  });
});
