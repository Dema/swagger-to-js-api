/* @flow */

import { includes } from 'lodash';
import * as t from 'babel-types';

const swaggerTypeToFlowType = (
  sType: Object,
  imports: Array<string> = [],
) => {

  if (sType.$ref && sType.$ref.match(/^#\/definitions/)) {
    imports.push(sType.$ref.replace('#/definitions/', ''));
    return t.genericTypeAnnotation(
      t.identifier(sType.$ref.replace('#/definitions/', '')),
      null,
    );
  }
  if (sType.type === 'object') {
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

const objectTypeToFlow = (objectType, imports) => {
  if (!objectType.properties) {
    return t.genericTypeAnnotation(t.identifier('Object'), null);
  }

  let properties = Object
    .keys(objectType.properties)
    .map(
      propName =>
        Object.assign(objectType.properties[propName], { name: propName }),
    );

  let required = objectType.required || [];

  let retVal = t.objectTypeAnnotation(
    properties.map(prop => {
      let propertyDef = t.objectTypeProperty(
        t.identifier(prop.name),
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
};

const arrayTypeToFlow = (arrayType, imports) => {
  return t.genericTypeAnnotation(
    t.identifier('Array'),
    arrayType.items
      ? t.typeParameterInstantiation([
        swaggerTypeToFlowType(arrayType.items, imports),
      ])
      : t.typeParameterInstantiation([t.anyTypeAnnotation()]),
  );
};

export default swaggerTypeToFlowType;
