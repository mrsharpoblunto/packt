jest.mock('../default-resolver');
const PacktConfig = require('../packt-config');
const path = require('path');
const MockDefaultResolver = require('../default-resolver');

describe('Config',() => {
  it('loads a simple config and generates defaults',()=> {
    const config = new PacktConfig();

    MockDefaultResolver.__resolvableDirectories = {
      './handler-js': '/path/to/handler.js',
      './bundler-js': '/path/to/bundler.js',
    };

    return config.load(path.join(__dirname,'packt.config.js'),{
      bundles: {
        'entry.js': {
          type: 'entrypoint',
          requires: ['./index.js'],
          depends: ['library.js','common.js'],
          bundler: 'js',
        },
        'entry2.js': {
          type: 'entrypoint',
          requires: './index.js',
          depends: 'library.js',
          bundler: 'js',
        },
        'entry3.js': {
          type: 'entrypoint',
          requires: './index.js',
          bundler: 'js',
        },
        'library.js': {
          type: 'library',
          requires: ['react.js'],
          bundler: 'js',
        },
        'common.js': {
          type: 'common',
          bundler: 'js',
          contentTypes: [
            'text/javascript',
          ],
          threshold: 0.5,
        },
      },
      bundlers: {
        'js': {
          require: './bundler-js',
        },
      },
      handlers: [
        {
          pattern: '^\\.js$',
          require: './handler-js',
        }
      ]
    }).then((config) => {
      expect(config).toBeTruthy();
      expect(Object.keys(config.variants).length).toBe(1);

      const variant = config.variants['default'];
      expect(variant).toBeTruthy();
      expect(variant.options).toBeTruthy();
      expect(variant.options.workers).toBeGreaterThan(0);
      expect(variant.options.outputPath).toContain('build');
      expect(variant.options.outputFormat).toBe('${filename}_${hash}.${ext}');
      expect(variant.options.outputHash).toBe('md5');
      expect(variant.options.outputHashLength).toBe(12);

      expect(variant.resolvers).toBeTruthy();
      expect(variant.resolvers.custom.length).toBe(0);

      const defaultResolver = variant.resolvers.default;
      expect(defaultResolver).toBeTruthy();
      expect(defaultResolver.options).toBeTruthy();
      expect(defaultResolver.options.searchPaths).toEqual([
             __dirname,
             'node_modules'
      ]);
      expect(defaultResolver.options.extensions).toEqual(['.js','.json']);

      expect(variant.handlers.length).toBe(1);
      expect(variant.handlers[0].options).toBeTruthy();
      expect(variant.handlers[0].require).toBe('/path/to/handler.js');

      expect(Object.keys(variant.bundlers).length).toBe(1);
      expect(variant.bundlers['js'].options).toBeTruthy();
      expect(variant.bundlers['js'].require).toBe('/path/to/bundler.js');
      
      expect(Object.keys(variant.bundles).length).toBe(5);
      expect(variant.bundles['entry2.js'].requires.length).toBe(1);
      expect(variant.bundles['entry2.js'].depends.length).toBe(1);
      expect(variant.bundles['entry2.js'].requires[0]).toBe('./index.js');
      expect(variant.bundles['entry3.js'].depends.length).toBe(0);
    });
  });

  it('fails with unresolved handlers',()=> {
    const config = new PacktConfig();

    MockDefaultResolver.__resolvableDirectories = {
      './bundler-js': '/path/to/bundler.js',
    };

    return config.load(path.join(__dirname,'packt.config.js'),{
      bundles: {
        'entry.js': {
          type: 'entrypoint',
          requires: ['./index.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        'js': {
          require: './bundler-js',
        },
      },
      handlers: [
        {
          pattern: '^\\.js$',
          require: './handler-js',
        }
      ]
    }).then((config) => {
      return Promise.reject();
    },() => {
      return Promise.resolve();
    });
  });

  it('fails with unresolved bundlers',()=> {
    const config = new PacktConfig();

    MockDefaultResolver.__resolvableDirectories = {
      './handler-js': '/path/to/handler.js',
    };

    return config.load(path.join(__dirname,'packt.config.js'),{
      bundles: {
        'entry.js': {
          type: 'entrypoint',
          requires: ['./index.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        'js': {
          require: './bundler-js',
        },
      },
      handlers: [
        {
          pattern: '^\\.js$',
          require: './handler-js',
        }
      ]
    }).then((config) => {
      return Promise.reject();
    },() => {
      return Promise.resolve();
    });
  });


  ([
    {
      // invalid bundle type
      'index.js': {
        type: 'unknown',
      },
    },
    {
      // no requires
      'index.js': {
        type: 'entrypoint',
      },
    },
    {
      // undefined dependency
      'index.js': {
        type: 'entrypoint',
        requires: ['./foo'],
        depends: ['bar.js'],
      },
    },
    {
      // common can't require
      'common.js': {
        type: 'common',
        requires: ['./foo'],
      },
    },
    {
      // common can't depend either
      'common.js': {
        type: 'common',
        depends: ['./foo'],
      },
    },
    {
      // libs can't depend
      'lib.js': {
        type: 'library',
        depends: ['./foo'],
      },
    },
  ]).forEach((bundles) => {
    it('fails with invalid bundle options',()=> {
      const config = new PacktConfig();

      MockDefaultResolver.__resolvableDirectories = {
        './bundler-js': '/path/to/bundler.js',
        './handler-js': '/path/to/handler.js',
      };

      return config.load(path.join(__dirname,'packt.config.js'),{
        bundles: bundles,
        bundlers: {
          'js': {
            require: './bundler-js',
          },
        },
        handlers: [
          {
            pattern: '^\\.js$',
            require: './handler-js',
          }
        ]
      }).then((config) => {
        return Promise.reject();
      },() => {
        return Promise.resolve();
      });
    });
  });
});
