jest.mock('fs');

const fs = require('fs');
const DefaultResolver = require('../default-resolver.js');

describe('default resolver',() => {
  let resolver;

  beforeEach(() => {
    resolver = new DefaultResolver({
      searchPaths: [
        'node_modules',
      ],
      extensions: [
        '.js','.jsx',
      ],
      verbose: false,
    });
  });

  it('resolves an absolute path with a file extension',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementationOnce((path,callback) => {
        try {
          expect(path).toEqual('/my-project/modules/foobar.js');
          callback(null,{
            isFile: () => true,
          });
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('/my-project/modules/foobar.js','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/modules/foobar.js');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });
  });

  it('resolves an absolute path without a file extension',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        try {
          expect(path).toEqual('/my-project/modules/foobar.jsx');
          callback(null,{
            isFile: () => true,
          });
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('/my-project/modules/foobar','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/modules/foobar.jsx');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });
  });

  it('resolves a context relative path with a file extension',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementationOnce((path,callback) => {
        try {
          expect(path).toEqual('/my-project/modules/foobar.js');
          callback(null,{
            isFile: () => true,
          });
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('./foobar.js','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/modules/foobar.js');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });

  it('resolves a context relative path without a file extension',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        try {
          expect(path).toEqual('/my-project/modules/foobar.jsx');
          callback(null,{
            isFile: () => true,
          });
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('./foobar','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/modules/foobar.jsx');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });

  it('resolves a relative path without a file extension',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        try {
          if (path.indexOf('.js')>=0) {
            expect(path).toEqual('/my-project/node_modules/foobar/lib/index.js');
            callback(null,{
              isFile: () => true,
            });
          } else {
            callback(null,{
              isFile: () => false,
            });
          }
        } catch (err) {
          callback(err);
        }
      });

      fs.readFile.mockImplementation((path,encoding,callback) => {
        try {
          expect(path).toEqual('/my-project/node_modules/foobar/package.json');
          callback(null, JSON.stringify({
            main: './lib/index.js',
          }));
        } catch (err) {
          callback(err);
        }

      });

      resolver.resolve('foobar','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/node_modules/foobar/lib/index.js');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });

  it('resolves a relative path that uses a folder index',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        try {
          if (path.indexOf('.js')>=0) {
            expect(path).toEqual('/my-project/modules/foobar/index.js');
            callback(null,{
              isFile: () => true,
            });
          } else {
            callback(null,{
              isFile: () => false,
            });
          }
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('./foobar','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/modules/foobar/index.js');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });

  it('resolves a relative path with a file extension',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        try {
          if (path.indexOf('.js')>=0) {
            expect(path).toEqual('/my-project/node_modules/foobar.js');
            callback(null,{
              isFile: () => true,
            });
          } else {
            callback(null,{
              isFile: () => false,
            });
          }
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('foobar.js','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeFalsy();
          expect(resolved).toEqual('/my-project/node_modules/foobar.js');
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });

  it('cannot resolve a relative path that resolves to a directory',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        try {
          expect(path).toEqual('/my-project/node_modules/foobar.js');
          callback(null,{
            isFile: () => false,
          });
        } catch (err) {
          callback(err);
        }
      });

      resolver.resolve('foobar.js','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeTruthy();
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });

  it('cannot resolve a relative path that does not exist',() => {
    return new Promise((resolve,reject) => {

      fs.stat.mockImplementation((path,callback) => {
        callback(new Error('not found'));
      });

      resolver.resolve('foobar.js','/my-project/modules/foo.js',(err,resolved) => {
        try {
          expect(err).toBeTruthy();
          resolve();
        } catch (ex) {
          reject(ex);
        }
      });

    });

  });
});
