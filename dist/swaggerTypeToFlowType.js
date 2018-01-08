'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _babelTypes = require('babel-types');

var t = _interopRequireWildcard(_babelTypes);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var swaggerTypeToFlowType = function swaggerTypeToFlowType(sType) {
  var imports = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  var definitions = arguments[2];

  if (sType.$ref && sType.$ref.match(/^#\/definitions/)) {
    imports.push(sType.$ref.replace('#/definitions/', ''));
    return t.genericTypeAnnotation(t.identifier(sType.$ref.replace('#/definitions/', '')), null);
  }
  if (sType.allOf || sType.type === 'object') {
    return objectTypeToFlow(sType, imports, definitions);
  } else if (sType.type === 'array') {
    return arrayTypeToFlow(sType, imports, definitions);
  } else if (sType.type === 'string') {
    if (sType.enum) {
      return t.unionTypeAnnotation(sType.enum.map(function (s) {
        return t.stringLiteral(s);
      }));
    }
    return t.stringTypeAnnotation();
  } else if (sType.type === 'number' || sType.type === 'integer' || sType.type === 'float' || sType.type === 'int64') {
    return t.numberTypeAnnotation();
  } else if (sType.type === 'boolean') {
    return t.booleanTypeAnnotation();
  } else {
    return t.anyTypeAnnotation();
  }
};

var objectTypeToFlow = function objectTypeToFlow(objectType, imports, definitions) {
  var mergedProperties = {};
  var mergedRequired = [];
  if (objectType.allOf) {
    objectType.allOf.forEach(function (type) {
      if (type.$ref && type.$ref.match(/^#\/definitions/)) {
        (function () {
          var innerType = definitions[type.$ref.replace('#/definitions/', '')];
          if (innerType.type == 'object') {
            if (innerType.properties) {
              Object.keys(innerType.properties).forEach(function (propName) {
                mergedProperties[propName] = Object.assign(innerType.properties[propName], { name: propName });
              });
            }
            mergedRequired = mergedRequired.concat(innerType.required || []);
          }
        })();
      } else {
        if (type.properties) {
          Object.keys(type.properties).forEach(function (propName) {
            mergedProperties[propName] = Object.assign(type.properties[propName], { name: propName });
          });
        }
        mergedRequired = mergedRequired.concat(type.required || []);
      }
    });
  } else if (!objectType.properties) {
    return t.genericTypeAnnotation(t.identifier('Object'), null);
  } else {
    Object.keys(objectType.properties).forEach(function (propName) {
      return mergedProperties[propName] = Object.assign(objectType.properties[propName], { name: propName });
    });
  }

  var properties = Object.values(mergedProperties);

  var required = mergedRequired.concat(objectType.required || []);

  var retVal = t.objectTypeAnnotation(properties.map(function (prop) {
    var propertyDef = t.objectTypeProperty(t.identifier(prop.name), swaggerTypeToFlowType(prop, imports, definitions));
    if (!(0, _lodash.includes)(required, prop.name)) {
      propertyDef.optional = true;
    }
    return propertyDef;
  }));

  retVal.exact = true;

  return retVal;
};

var arrayTypeToFlow = function arrayTypeToFlow(arrayType, imports, definitions) {
  return t.genericTypeAnnotation(t.identifier('Array'), arrayType.items ? t.typeParameterInstantiation([swaggerTypeToFlowType(arrayType.items, imports, definitions)]) : t.typeParameterInstantiation([t.anyTypeAnnotation()]));
};

exports.default = swaggerTypeToFlowType;