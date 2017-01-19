/* @flow */

import { includes } from 'lodash';
import t from 'babel-types';

export default swaggerTypeToFlowType = (sType, imports) => {
  imports = imports || [];
  if (sType.$ref && sType.$ref.match(/^#\/definitions/)) {
    imports.push(sType.$ref.replace('#/definitions/', ''));
    return t.GenericTypeAnnotation(
      t.Identifier(sType.$ref.replace('#/definitions/', '')),
      null,
    );
  }
  if (sType.type === 'object') {
    return objectTypeToFlow(sType, imports);
  } else if (sType.type === 'array') {
    return arrayTypeToFlow(sType, imports);
  } else if (sType.type === 'string') {
    return t.StringTypeAnnotation();
  } else if (
    sType.type === 'integer' || sType.type === 'float' || sType.type === 'int64'
  ) {
    return t.NumberTypeAnnotation();
  } else if (sType.type === 'boolean') {
    return t.BooleanTypeAnnotation();
  } else {
    return t.AnyTypeAnnotation();
  }
};

function objectTypeToFlow(objectType, imports) {
  if (!objectType.properties) {
    return t.GenericTypeAnnotation(t.Identifier('Object'), null);
  }

  let properties = Object
    .keys(objectType.properties)
    .map(
      propName =>
        Object.assign(objectType.properties[propName], { name: propName }),
    );

  let required = objectType.required || [];

  let retVal = t.ObjectTypeAnnotation(
    properties.map(prop => {
      let propertyDef = t.ObjectTypeProperty(
        t.Identifier(prop.name),
        swaggerTypeToFlowType(prop, imports),
      );
      if (!includes(required, prop.name)) {
        propertyDef.optional = true;
      }
      return propertyDef;
    }),
  );

  retVal.exact = true;

  return retVal;
}

function arrayTypeToFlow(arrayType, imports) {
  return t.GenericTypeAnnotation(
    t.Identifier('Array'),
    arrayType.items
      ? t.TypeParameterInstantiation([
        swaggerTypeToFlowType(arrayType.items, imports),
      ])
      : t.TypeParameterInstantiation([ t.AnyTypeAnnotation() ]),
  );
}
