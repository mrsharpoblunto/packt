if (process.env.NODE_ENV === 'packtdev') {
  require('babel-register');
}
if (process.env.NODE_ENV === 'packtdev' || process.env.NODE_ENV === 'test') {
  require('babel-register');
  module.exports = require('./src/errors');
} else {
  module.exports = require('./lib/errors');
}
