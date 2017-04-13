if (process.env.NODE_ENV!=='packtdev') {
  require('babel-register');
  module.exports = require('src/handler').default;
} else {
  module.exports = require('lib/handler').default;
}
