if (process.env.NODE_ENV!=='packtdev') {
  require('babel-register');
  module.exports = require('src/cli').default;
} else {
  module.exports = require('lib/cli').default;
}
