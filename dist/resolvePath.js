'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (folderPath) {
  if (folderPath[0] === '/' || folderPath[0] === '~') {
    return folderPath;
  }
  return _path2.default.join(process.cwd(), folderPath);
};

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }