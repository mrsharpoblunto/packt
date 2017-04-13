if (process.env.NODE_ENV!=='packtdev') {
  require('babel-register');
  module.exports = require('src/bundler').default;
} else {
  module.exports = require('lib/bundler').default;
}
