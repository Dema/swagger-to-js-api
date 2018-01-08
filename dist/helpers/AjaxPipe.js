'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AjaxPipe = function AjaxPipe(obj) {
  var _this = this;

  _classCallCheck(this, AjaxPipe);

  this.pipeThrough = function (fn) {
    return fn(_this);
  };

  // $FlowIgnore.
  Object.assign(this, obj);
  return this;
};

exports.default = AjaxPipe;