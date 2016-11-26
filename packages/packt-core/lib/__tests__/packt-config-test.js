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
      expect(config.hasVariants).toBe(false);

      const invariant = config.invariantOptions;
      expect(invariant).toBeTruthy();
      expect(invariant.workers).toBeGreaterThan(0);
      expect(invariant.outputPath).toContain('build');
      expect(invariant.outputFormat).toBe('${filename}_${hash}.${ext}');
      expect(invariant.outputHash).toBe('md5');
      expect(invariant.outputHashLength).toBe(12);

      expect(config.resolvers).toBeTruthy();
      expect(config.resolvers.custom.length).toBe(0);

      const defaultResolver = config.resolvers.default;
      expect(defaultResolver).toBeTruthy();
      expect(defaultResolver.invariantOptions).toBeTruthy();
      expect(defaultResolver.invariantOptions.searchPaths).toEqual([
             __dirname,
             'node_modules'
      ]);
      expect(defaultResolver.invariantOptions.extensions).toEqual(['.js','.json']);

      expect(config.handlers.length).toBe(1);
      expect(config.handlers[0].options).toBeTruthy();
      expect(config.handlers[0].invariantOptions).toBeTruthy();
      expect(config.handlers[0].require).toBe('/path/to/handler.js');

      expect(Object.keys(config.bundlers).length).toBe(1);
      expect(config.bundlers['js'].invariantOptions).toBeTruthy();
      expect(config.bundlers['js'].require).toBe('/path/to/bundler.js');
      
      expect(Object.keys(config.bundles).length).toBe(5);
      expect(config.bundles['entry2.js'].requires.length).toBe(1);
      expect(config.bundles['entry2.js'].depends.length).toBe(1);
      expect(config.bundles['entry2.js'].requires[0]).toBe('./index.js');
      expect(config.bundles['entry3.js'].depends.length).toBe(0);
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

  it('generates config variants',()=> {
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
      options: {
        base: {
          lang: 'es_ES',
        },
        variants: {
          'en_US': {
            lang: 'en_US',
          },
          'en_GB': {
            lang: 'en_GB',
          },
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
          invariantOptions: {
              strict: false,
          },
          options: {
            base: {
              sourceMaps: true,
            },
            variants: {
              'prod': {
                sourceMaps: false,
                minify: true,
              },
              'dev': {
                minify: false,
              }
            }
          }
        }
      ]
    }).then((config) => {
      expect(config).toBeTruthy();
      expect(config.hasVariants).toBe(true);
      expect(Object.keys(config.options)).toEqual(
        ['en_US','en_GB','prod','dev']);

      expect(config.options['en_US'].lang).toBe('en_US');
      expect(config.options['en_GB'].lang).toBe('en_GB');
      expect(config.options['dev'].lang).toBe('es_ES');
      expect(config.options['prod'].lang).toBe('es_ES');

      expect(config.handlers[0].invariantOptions).toBeTruthy();
      expect(config.handlers[0].invariantOptions.strict).toBe(false);

      expect(Object.keys(config.handlers[0].options)).toEqual(
        ['en_US','en_GB','prod','dev']);

      expect(config.handlers[0].options['dev']).toEqual({
        sourceMaps: true,
        minify: false,
      });
      expect(config.handlers[0].options['prod']).toEqual({
        sourceMaps: false,
        minify: true,
      });
    });
  });
});
