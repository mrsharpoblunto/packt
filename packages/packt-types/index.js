if (process.env.NODE_ENV!=='packtdev') {
  require('babel-register');
  module.exports = require('src/errors');
} else {
  module.exports = require('lib/errors');
}
