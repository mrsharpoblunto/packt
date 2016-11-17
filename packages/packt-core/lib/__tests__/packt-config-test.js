const PacktConfig = require('../packt-config');

describe('Config',() => {
  it('loads a simple config',()=> {
    const config = new PacktConfig();
    return config.load('packt.config.js',{
      bundles: {
        'foo.js': {
          type: 'entrypoint',
          requires: ['bar'],
          bundler: 'js',
        },
        'foo.js': {
          type: 'common',
          bundler: 'js',
          contentTypes: [
            'text/javascript'
          ],
          threshold: 0.5,
        },
      },
      bundlers: {
        'js': {
          require: 'bar',
        },
      },
      handlers: [
        {
          pattern: '^\\.js$',
          require: 'foobar',
        }
      ]
    });
  });
});
