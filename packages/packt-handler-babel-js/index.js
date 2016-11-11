'use strict';
const babel = require('babel-core');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

function fbTransform(name) {
  return require('../webpack/babel/fb-transforms/babel-plugin-' + name);
}

function igTransform(name) {
  return require('../webpack/babel/ig-transforms/babel-plugin-' + name);
}


function findDependencies(babel) {
  var t = babel.types;
  return {
    visitor: {
      ImportDeclaration: function(path) {
        const emitter = this.opts.emitter;
        emitter.emit('dependency',path.node.source.value);
      },
      CallExpression: function(path) {
        if (path.node.callee.name === 'require') {
          if (path.node.arguments.length !== 1 ||
              path.node.arguments[0].type !== 'StringLiteral') {
            // TODO need to evaluate constant expressions of string concatinations
            console.log("Expected string literal as argument to require");
          } else {
            const emitter = this.opts.emitter;
            emitter.emit('dependency',path.node.arguments[0].value);
          }
        }
      }
    }
  };
}

class JsHandler extends EventEmitter {
  constructor(options) {
    super();
    this.options = Object.assign({
      ignore: [],
    },options);
    for (let i = 0;i < this.options.ignore.length;++i) {
      this.options.ignore[i] = new RegExp(this.options.ignore[i]);
    }
  }

  process(resolved,callback) {
    const stats = {};
    let start = Date.now();


    fs.readFile(resolved,'utf8',(err,source) => {
      stats.diskIO = Date.now() - start;
      if (err) {
        callback(err);
        return;
      }

      start = Date.now();

      for (let ignore of this.options.ignore) {
        if (ignore.test(resolved)) {
          // TODO still need to modify the ast by replacing requires etc..
          const ast = babylon.parse(source,{sourceType: 'module'});
          traverse(ast,{
            enter: (path) => {
              if (path.node.type === 'CallExpression') {
                if (path.node.callee.name === 'require') {
                  if (path.node.arguments.length !== 1) {
                    if (path.node.arguments[0].type !== 'StringLiteral') {
                    console.log("Expected string literal as argument to require");
                  } else {
                    this.emit('dependency',path.node.arguments[0].value);
                  }
                }
              }
            }
          });
          stats.transform = Date.now() - start;
          callback(null,{
            content: source,
            perfStats: stats,
          });
          return;
        }
      }

      try
      {
        // should parse AST once, and pass deep copy to transform
        // for each variant
        const result = this._transform(source, resolved, {
          pretty: false,
          testMode: false,
          translations: null,
          lang: null,
          assetMap: {
            getHashedUrl(url) { return url; },
          }
        }).code;
        stats.transform = Date.now() - start;
        callback(null,{
          content: result,
          perfStats: stats,
        });
      } catch (ex) {
        callback(ex);
      }
    });
  }

  _transform(source, filename, options) {

    const plugins = [
      // TODO need compile time constants transform
      // TODO need dead code elimination transform to prevent unneeded requires
      [
        findDependencies,
        {
          emitter: this
        }
      ],
      // non-standardized transforms
      'syntax-trailing-function-commas',
      'transform-flow-strip-types',
      'transform-class-properties',
      'transform-object-rest-spread',
      'transform-react-jsx',
      'transform-react-display-name',
      // es2015 transformations
      'transform-es2015-template-literals',
      'transform-es2015-for-of',
      'transform-es2015-destructuring',
      'transform-es2015-parameters',
      'transform-es2015-block-scoping',
      'transform-es2015-constants',
      'transform-es2015-computed-properties',
      'transform-es2015-shorthand-properties',
      'transform-es2015-arrow-functions',
      'transform-es2015-spread',
      // facebook specific transforms
      [
        fbTransform('class-private-props'),
        {
          minify: !options.pretty,
        },
      ],
      fbTransform('fb-classes'),
      fbTransform('inline-invariant'),
      fbTransform('fbt'),
      fbTransform('fb-cxsets'),
      // instagram specific transforms
      [
        igTransform('ig-i18n'),
        {
          translations: options.translations,
        },
      ],
      [
        igTransform('ig-cx'),
        {
          cxWithoutRequire: options.testMode,
        },
      ],
    ];

    if (options.testMode) {
      // only need to transform modules in test, as in web builds this is done for
      // us by webpack
      plugins.push('transform-es2015-modules-commonjs');
      plugins.push('jest-hoist');
    } else {
      // we don't want to do any asset map replacement stuff in tests
      // as its A) unecessary, and B) the asset map may not be present
      // if the frontend build hasn't been run
      plugins.push([
        igTransform('ig-badge'),
        {
          lang: options.lang,
          assetMap: options.assetMap,
        },
      ]);
      plugins.push([
        igTransform('ig-require-static'),
        {
          assetMap: options.assetMap,
        },
      ]);
    }

    var mainDocBlockHandled = false;

    var result = babel.transform(source, {
      retainLines: !options.pretty,
      compact: !options.pretty,
      minified: !options.pretty,
      comments: true,
      shouldPrintComment: options.pretty ? false : function(_comment) {
        // Main docblock is always a first commment;
        if (mainDocBlockHandled) {
          return false;
        }
        return (mainDocBlockHandled = true); //eslint-disable-line no-return-assign
      },
      filename: filename,
      plugins: plugins,
      sourceFileName: filename,
      sourceMaps: false,
    });

    return {code: result.code};
  }
}

module.exports = JsHandler;
