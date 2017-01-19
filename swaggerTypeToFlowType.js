/* @flow */

import { includes } from 'lodash';
import * as t from 'babel-types';

/* eslint-disable babel/new-cap */

const swaggerTypeToFlowType = (
  sType: Object,
  imports: Array<string> = [],
) => {

  if (sType.$ref && sType.$ref.match(/^#\/definitions/)) {
    imports.push(sType.$ref.replace('#/definitions/', ''));
    return t.GenericTypeAnnotation(
      t.Identifier(sType.$ref.replace('#/definitions/', '')),
      null,
    );
  }
  if (sType.type === 'object' || sType.title) {
    return objectTypeToFlow(sType, imports);
  } else if (sType.type === 'array') {
    return arrayTypeToFlow(sType, imports);
  } else if (sType.type === 'string') {
    return t.stringTypeAnnotation();
  } else if (
    sType.type === 'number' || sType.type === 'integer' || sType.type === 'float' || sType.type === 'int64'
  ) {
    return t.numberTypeAnnotation();
  } else if (sType.type === 'boolean') {
    return t.booleanTypeAnnotation();
  } else {
    return t.anyTypeAnnotation();
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

export default swaggerTypeToFlowType;
