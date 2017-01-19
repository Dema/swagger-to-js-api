function AjaxPipe(obj) {
  let that = this;
  Object.keys(obj).forEach(function(key) {
    that[key] = obj[key];
  });
}

AjaxPipe.prototype.pipeThrough = fn => fn(this);

export default AjaxPipe;
