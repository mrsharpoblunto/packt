if (process.env.NODE_ENV!=='packtdev') {
  require('babel-register');
}
module.exports = require('lib/packt').default;
