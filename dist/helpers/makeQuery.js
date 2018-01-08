'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = function (obj) {
  if (!obj) {
    return '';
  }

  var keys = Object.keys(obj);
  if (!keys.length) {
    return '';
  }

  return '?' + keys.map(function (key) {
    var value = obj[key];
    if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) === 'object') {
      value = JSON.stringify(value);
    }
    return encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }).join('&');
};