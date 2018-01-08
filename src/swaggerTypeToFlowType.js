/* @flow */

import { includes } from 'lodash';
import * as t from 'babel-types';
import { forInStatement } from 'babel-types';

const swaggerTypeToFlowType = (
  sType: Object,
  imports: Array<string> = [],
  definitions,
) =>
  {
    if (sType.$ref && sType.$ref.match(/^#\/definitions/)) {
      imports.push(sType.$ref.replace('#/definitions/', ''));
      return t.genericTypeAnnotation(
        t.identifier(sType.$ref.replace('#/definitions/', '')),
        null,
      );
    }
    if (sType.allOf || sType.type === 'object') {
      return objectTypeToFlow(sType, imports, definitions);
    } else if (sType.type === 'array') {
      return arrayTypeToFlow(sType, imports, definitions);
    } else if (sType.type === 'string') {
      if (sType.enum) {
        return t.unionTypeAnnotation(sType.enum.map(s => t.stringLiteral(s)));
      }
      return t.stringTypeAnnotation();
    } else if (
      sType.type === 'number' ||
        sType.type === 'integer' ||
        sType.type === 'float' ||
        sType.type === 'int64'
    ) {
      return t.numberTypeAnnotation();
    } else if (sType.type === 'boolean') {
      return t.booleanTypeAnnotation();
    } else {
      return t.anyTypeAnnotation();
    }
  };

const objectTypeToFlow = (objectType, imports, definitions) => {
  let mergedProperties = {};
  let mergedRequired = [];
  if (objectType.allOf) {
    objectType.allOf.forEach(type => {
      if (type.$ref && type.$ref.match(/^#\/definitions/)) {
        const innerType = definitions[type.$ref.replace('#/definitions/', '')];
        if (innerType.type == 'object') {
          if (innerType.properties) {
            Object.keys(innerType.properties).forEach(propName => {
              mergedProperties[propName] = Object.assign(
                innerType.properties[propName],
                { name: propName },
              );
            });
          }
          mergedRequired = mergedRequired.concat(innerType.required || []);
        }
      } else {
        if (type.properties) {
          Object.keys(type.properties).forEach(propName => {
            mergedProperties[propName] = Object.assign(
              type.properties[propName],
              { name: propName },
            );
          });
        }
        mergedRequired = mergedRequired.concat(type.required || []);
      }
    });
  } else if (!objectType.properties) {
    return t.genericTypeAnnotation(t.identifier('Object'), null);
  } else {
    Object
      .keys(objectType.properties)
      .forEach(
        propName =>
          mergedProperties[propName] = Object.assign(
            objectType.properties[propName],
            { name: propName },
          ),
      );
  }

  let properties = Object.values(mergedProperties);

  let required = mergedRequired.concat(objectType.required || []);

  let retVal = t.objectTypeAnnotation(
    properties.map(prop => {
      let propertyDef = t.objectTypeProperty(
        t.identifier(prop.name),
        swaggerTypeToFlowType(prop, imports, definitions),
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

const arrayTypeToFlow = (arrayType, imports, definitions) => {
  return t.genericTypeAnnotation(
    t.identifier('Array'),
    arrayType.items
      ? t.typeParameterInstantiation([
        swaggerTypeToFlowType(arrayType.items, imports, definitions),
      ])
      : t.typeParameterInstantiation([ t.anyTypeAnnotation() ]),
  );
};

export default swaggerTypeToFlowType;
