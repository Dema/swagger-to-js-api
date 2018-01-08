/* @flow */

import * as t from 'babel-types';
import { get, assign, isEqual, uniq } from 'lodash';
import swaggerTypeToFlowType from './swaggerTypeToFlowType';

import type { OpenAPI } from 'openapi-flowtype-definition';

export default function(
  pathObj: Object,
  swaggerObj: OpenAPI,
  overrideBaseURL: ?string = undefined,
) {
  const hostname = swaggerObj.schemes != null && swaggerObj.host != null
    ? `${swaggerObj.schemes[0]}://${swaggerObj.host}`
    : null;
  if (swaggerObj.schemes != null && swaggerObj.schemes.length > 1) {
    console.warn(
      `Multiple schemes detected but not yet supported. Using: ${swaggerObj.schemes[0]}`,
    );
  }
  let typeImports = [];
  const imports = [];
  pathObj.parameters = pathObj.parameters || [];
  const hasQuery = !!(pathObj.parameters || []).filter(
    param => param.in === 'query',
  ).length;
  const bodyParamJson = (pathObj.parameters || []).filter(
    param => param.in === 'body',
  )[0];
  const hasFormData = !!(pathObj.parameters || []).filter(
    param => param.in === 'formData',
  ).length;
  const hasBody = !!(pathObj.parameters || []).filter(
    param => param.in === 'formData' || param.in === 'body',
  ).length;

  let responseType = {
    type: 'TypeAlias',
    id: t.identifier('Response'),
    typeParameters: null,
    right: t.anyTypeAnnotation(),
  };

  const responseSchema = get(pathObj, 'responses.200.schema') ||
    get(pathObj, 'responses.default.schema');
  if (responseSchema) {
    responseType.right = swaggerTypeToFlowType(responseSchema, typeImports);
  }

  // prepare a template string for the URL that may contain 0 or more url params
  const urlParams = [];
  const urlParts = pathObj.path.split(/(\}|\{)/).reduce((compiled, current) => {
    if (current === '{') {
      return assign({}, compiled, { mode: 'variable' });
    }
    if (current === '}') {
      return assign({}, compiled, { mode: 'string' });
    }
    if (compiled.mode === 'string') {
      compiled.quasis.push(
        t.templateElement({ raw: current, cooked: current }),
      );
      return compiled;
    }
    if (compiled.mode === 'variable') {
      urlParams.push(current);
      compiled.expressions.push(t.identifier(current));
      return compiled;
    }
    throw new Error('Could not generate url params.');
  }, { quasis: [], expressions: [], mode: 'string' });

  let pathParams = pathObj.parameters
    .filter(param => param.in === 'path' && param.required)
    .map(param => param.name);

  let paramsUsed = urlParams.sort();
  let paramsProvided = pathParams.sort();

  if (!isEqual(paramsUsed, paramsProvided)) {
    throw new Error(
      `
      There is a problem in the operation ${pathObj.operationId}.

      The URL of the operation is: ${pathObj.path} which has the following params:
      ${JSON.stringify(paramsUsed)}

      But the params actually specified are:
      ${JSON.stringify(paramsProvided)}
    `,
    );
  }
  // If the endpoint accepts query params, + a queryString at the end of the pathname
  let pathExpression = hasQuery
    ? t.binaryExpression(
      '+',
      t.templateLiteral(urlParts.quasis, urlParts.expressions),
      t.callExpression(t.identifier('makeQuery'), [t.identifier('query')]),
    )
    : t.templateLiteral(urlParts.quasis, urlParts.expressions);

  // Create the properties that will put on the returned object
  let objectProperties = [
    t.objectProperty(
      t.identifier('method'),
      t.stringLiteral(pathObj.method.toUpperCase()),
    ),
    t.objectProperty(
      t.identifier('url'),
      hostname != null
        ? t.binaryExpression('+', t.stringLiteral(hostname), pathExpression)
        : pathExpression,
    ),
  ];

  // if the endpoint takes a post-body, add that as a key to the object
  if (hasBody) {
    let dataValue = hasFormData
      ? t.callExpression(t.identifier('makeFormData'), [t.identifier('data')])
      : t.identifier('data');

    objectProperties.push(
      t.objectProperty(
        t.identifier('data'),
        dataValue,
        false,
        // Only use shorthand if we pass body data through.
        hasBody && !hasFormData,
      ),
    );
  }

  // the body of the function.
  // Take the object prepared so far and use it to initialize a AjaxPipe.
  // AjaxPipe will be used to maintain the types for response objects.
  // Soon.
  let body = t.blockStatement([
    t.returnStatement(
      t.newExpression(t.identifier('AjaxPipe'), [
        t.objectExpression(objectProperties),
      ]),
    ),
  ]);

  let queryParams = [];
  let bodyParams = [];

  if (hasQuery) {
    const typeDef = {
      type: 'object',
      properties: pathObj.parameters
        .filter(param => param.in === 'query')
        .map(param => ({ [param.name]: param }))
        .reduce((obj, current) => Object.assign(obj, current), {}),
    };
    const queryParam = t.identifier('query');
    queryParam.typeAnnotation = t.typeAnnotation(
      swaggerTypeToFlowType(typeDef, typeImports),
    );
    queryParams.push(queryParam);
  }

  if (hasBody) {
    const bodyParam = t.identifier('data');
    if (hasFormData) {
      const typeDef = {
        type: 'object',
        properties: pathObj.parameters
          .filter(param => param.in === 'formData')
          .map(param => ({ [param.name]: param }))
          .reduce((obj, current) => Object.assign(obj, current), {}),
      };
      bodyParam.typeAnnotation = t.typeAnnotation(
        swaggerTypeToFlowType(typeDef, typeImports),
      );
    } else if (bodyParamJson.schema) {
      bodyParam.typeAnnotation = t.typeAnnotation(
        swaggerTypeToFlowType(bodyParamJson.schema, typeImports),
      );
    } else if (bodyParamJson.type) {
      bodyParam.typeAnnotation = t.typeAnnotation(
        swaggerTypeToFlowType(bodyParamJson, typeImports),
      );
    }
    bodyParams.push(bodyParam);
  }

  // make the actual function.
  // accept all path params as individual arguments
  // also accept `query` and `data` as the last two arguments if API accepts
  const keywords = [
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    'enum',
    'implements',
    'interface',
    'let',
    'package',
    'private',
    'protected',
    'public',
    'static',
    'await',
    'abstract',
    'boolean',
    'byte',
    'char',
    'double',
    'final',
    'float',
    'goto',
    'int',
    'long',
    'native',
    'short',
    'synchronized',
    'throws',
    'transient',
    'volatile',
    'null',
    'true',
    'false',
  ];
  const maybeKeyword = name => keywords.includes(name) ? name + '_' : name;
  let fnStatement = t.functionDeclaration(
    t.identifier(maybeKeyword(pathObj.operationId)),
    []
      .concat(
        pathObj.parameters
          .filter(param => param.in === 'path' && param.required)
          .map(paramToName),
      )
      .concat(queryParams)
      .concat(bodyParams),
    body,
  );

  fnStatement.returnType = t.typeAnnotation(
    t.genericTypeAnnotation(
      t.identifier('AjaxPipe'),
      t.typeParameterInstantiation([
        t.genericTypeAnnotation(t.identifier('AjaxObject'), null),
        t.genericTypeAnnotation(t.identifier('Response'), null),
      ]),
    ),
  );

  let fn = t.exportDefaultDeclaration(fnStatement);

  // declare imports for the helpers that are used in the function.
  if (hasQuery) {
    imports.push(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier('makeQuery'))],
        t.stringLiteral('../helpers/makeQuery'),
      ),
    );
  }
  if (hasFormData) {
    imports.push(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier('makeFormData'))],
        t.stringLiteral('../helpers/makeFormData'),
      ),
    );
  }
  imports.push(
    t.importDeclaration(
      [t.importDefaultSpecifier(t.identifier('AjaxPipe'))],
      t.stringLiteral('../helpers/AjaxPipe'),
    ),
  );

  // Create a AST object for `Program` that includes the imports and function
  // and returns it along with the name of the function so it can be written to
  // a file.
  typeImports = uniq(typeImports).map(name => {
    let importStatement = t.importDeclaration(
      [t.importSpecifier(t.identifier(name), t.identifier(name))],
      t.stringLiteral(`../types/${name}`),
    );
    importStatement.importKind = 'type';

    return importStatement;
  });
  return [
    pathObj.operationId,
    t.program(
      imports.concat(typeImports).concat([responseType]).concat([fn]),
    ),
  ];
}

function paramToName(param) {
  let paramName = t.identifier(param.name);
  if (param.schema) {
    paramName.typeAnnotation = t.typeAnnotation(
      swaggerTypeToFlowType(param.schema),
    );
  } else if (param.type) {
    paramName.typeAnnotation = t.typeAnnotation(swaggerTypeToFlowType(param));
  }
  return paramName;
}
