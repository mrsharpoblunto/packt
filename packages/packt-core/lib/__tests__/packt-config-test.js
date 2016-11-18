const PacktConfig = require('../packt-config');
const path = require('path');

describe('Config',() => {
  it('loads a simple config',()=> {
    const config = new PacktConfig();
    return config.load(path.join(__dirname,'packt.config.js'),{
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
          require: './default-resolver-test',
        },
      },
      handlers: [
        {
          pattern: '^\\.js$',
          require: './default-resolver-test',
        }
      ]
    });
  });
});
