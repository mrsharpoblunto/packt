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
    outputFormat: '${options.lang}_${filename}.${ext}/${hash}.${ext}',
    outputHash: 'md5',
    outputHashLength: 12,
  }, 

  bundles: {
    'index.js': {
      type: 'entrypoint',
      requires: ['index.js'],
      bundler: 'js',
    },
  },

  /**
   * configures how resources get bundled together
   */
  bundlers: {
    'js': {
      require: 'packt-bundler-js',
      invariantOptions: {
        minify: true,
      },
    },
  },

  /**
   * Handlers are used to process a module once it has been resolved by a
   * resolver. While processing, the handler should also notify when it
   * locates any dependencies the current module has to other modules
   */
  handlers: [
    {
      pattern: '\\.js$',
      require: 'packt-handler-babel-js',
      options: {
        base: {
            ignore: [
              '/node_modules/',
            ],
        },
        variants: {
        },
      },
      invariantOptions: {
      },
    },
  ],
};
