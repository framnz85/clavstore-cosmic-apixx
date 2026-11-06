'use strict';
const path = require('node:path');
module.exports = () => {
  const root = path.join(__dirname, '../../multi-scan-runtime/node_modules');
  return { multer: require(path.join(root, 'multer')), sharp: require(path.join(root, 'sharp')) };
};
