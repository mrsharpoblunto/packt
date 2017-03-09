'use strict';

const path = require('path');
const express = require('express');
const app = express();

app.use(express.static(path.join(__dirname,'_build')));
app.listen(8080,() => {
  console.log('server listening');
});
