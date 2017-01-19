/* eslint-disable spaced-comment */

module.exports = function(obj: Object): string {
  if (!obj) {
    return '';
  }

  let keys = Object.keys(obj);
  if (!keys.length) {
    return '';
  }

  return '?' + keys.map(function(key) {
      let value = obj[key];
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      return encodeURIComponent(key) + '=' + encodeURIComponent(value);
    }).join('&');
};
