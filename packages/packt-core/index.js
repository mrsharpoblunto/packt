if (process.env.NODE_ENV!=='production) {
  require('babel-register');
}
module.exports = require('lib/packt').default;
