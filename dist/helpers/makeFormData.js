'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
/* flow */

var isObject = function isObject(value) {
  return value === Object(value);
};

var isArray = function isArray(value) {
  return Array.isArray(value);
};

var isFile = function isFile(value) {
  return value instanceof File;
};

var objectToFormData = function objectToFormData(obj, formData, preKey) {
  formData = formData || new FormData();

  Object.keys(obj).forEach(function (prop) {
    var key = preKey ? preKey + '[' + prop + ']' : prop;

    if (isObject(obj[prop]) && !isArray(obj[prop]) && !isFile(obj[prop])) {
      objectToFormData(obj[prop], formData, key);
    } else if (isArray(obj[prop])) {
      obj[prop].forEach(function (value) {
        var arrayKey = key + '[]';

        if (isObject(value) && !isFile(value)) {
          objectToFormData(value, formData, arrayKey);
        } else {
          formData.append(arrayKey, value);
        }
      });
    } else {
      formData.append(key, obj[prop]);
    }
  });

  return formData;
};

exports.default = objectToFormData;