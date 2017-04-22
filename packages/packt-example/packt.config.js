'use strict';

const os = require('os');
const path = require('path');

/**
 * NOTE: this entire object must be serializable as it gets
 * passed around to worker processes - no stateful objects 
 * allowed!
 */
module.exports = {

  /**
   * option which for performance or logical reasons cannot vary
   * between build variants
   */
  invariantOptions: {
    workers: os.cpus().length - 1,
    outputPath: path.join(__dirname,'_build'),
    outputHash: 'md5',
    outputHashLength: 12,
  }, 

  resolvers: {
    builtIn: {
      invariantOptions: {
        searchPaths: [
          __dirname,
          path.join(__dirname,'src'),
          path.join(__dirname,'node_modules'),
          path.join(__dirname,'shaders'),
        ],
        extensions: ['.html','.js','.glsl'],
      },
    },
  },

  bundles: {
    'bundle.js': {
      type: 'entrypoint',
      requires: ['src/main.js'],
      depends: ['vendor.js'],
      bundler: 'js',
    },
    'vendor.js': {
      type: 'library',
      requires: ['node_modules/twgl.js', 'node_modules/gl-matrix'],
      bundler: 'js',
    },
    'index.html': {
      type: 'entrypoint',
      requires: ['src/index.html'],
      bundler: 'raw',
    },
  },

  /**
   * configures how resources get bundled together
   */
  bundlers: {
    'js': {
      require: 'packt-bundler-js',
      invariantOptions: {
        outputPathFormat: '/bundles/${name}${ext}',
      },
      options: {
        base: {
          minify: true,
        },
      },
    },
    'raw': {
      require: 'packt-bundler-raw',
      invariantOptions: {
        outputPathFormat: '/${name}${ext}',
      },
    }
  },

  /**
   * Handlers are used to process a module once it has been resolved by a
   * resolver. While processing, the handler should also notify when it
   * locates any dependencies the current module has to other modules
   */
  handlers: [
    {
      pattern: '/node_modules/.*\\.js$',
      require: 'packt-handler-babel-js',
      options: {
        base: {
          babelOptions: {
            babelrc: false,
          },
        },
      },
    },
    {
      pattern: '\\.js$',
      require: 'packt-handler-babel-js',
      options: {
        base: {
          babelOptions: {
            plugins: [
              "transform-flow-strip-types",
            ],
            presets: [
              ["es2015", { "modules": false }],
              "stage-0",
            ],
            compact: false,
          },
          defines: {
            "foo": "bar",
            "__DEV__": false,
            "baz": 1,
          },
          preserveIdentifiers: false,
        },
      },
    },
    {
      pattern: '\\.glsl$',
      require: 'packt-handler-raw-to-js',
    },
    {
      pattern: '\\.html$',
      require: 'packt-handler-raw',
    },
  ],
};
