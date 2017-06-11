if (process.env.NODE_ENV === 'packtdev') {
  require('babel-register');
}
if (process.env.NODE_ENV === 'packtdev' || process.env.NODE_ENV === 'test') {
  module.exports = require('./src/cli').default;
} else {
  module.exports = require('./lib/cli').default;
}
