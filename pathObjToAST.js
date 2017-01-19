import * as t from 'babel-types';
import { get, assign, isEqual, uniq } from 'lodash';
import swaggerTypeToFlowType from './swaggerTypeToFlowType';

/* eslint-disable babel/new-cap */

export default function(pathObj) {
  let typeImports = [];
  let imports = [];
  pathObj.parameters = pathObj.parameters || [];
  let hasQuery = !!(pathObj.parameters || []).filter(
    param => param.in === 'query',
  ).length;
  let bodyParamJson = (pathObj.parameters || []).filter(
    param => param.in === 'body' && param.name === 'body',
  )[0];
  let hasFormData = !!(pathObj.parameters || []).filter(
    param => param.in === 'formData',
  ).length;
  let hasBody = !!(pathObj.parameters || []).filter(
    param => param.in === 'formData' || param.in === 'body',
  ).length;

  let responseType = {
    type: 'TypeAlias',
    id: t.identifier('Response'),
    typeParameters: null,
    right: t.anyTypeAnnotation(),
  };

  if (get(pathObj, 'responses.200.schema')) {
    responseType.right = swaggerTypeToFlowType(
      get(pathObj, 'responses.200.schema'),
      typeImports,
    );
  }

  // prepare a template string for the URL that may contain 0 or more url params
  let urlParams = [];
  let urlParts = pathObj.path.split(/(\}|\{)/).reduce((compiled, current) => {
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
      t.callExpression(t.identifier('makeQuery'), [ t.identifier('query') ]),
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
      t.binaryExpression('+', t.identifier('hostname'), pathExpression),
    ),
  ];

  // if the endpoint takes a post-body, add that as a key to the object
  if (hasBody) {
    let dataValue = hasFormData
      ? t.callExpression(t.identifier('makeFormData'), [ t.identifier('data') ])
      : t.identifier('data');

    objectProperties.push(t.objectProperty(t.identifier('data'), dataValue));
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

  let hostnameParam = t.identifier('hostname');
  hostnameParam.typeAnnotation = t.typeAnnotation(t.stringTypeAnnotation());
  let queryParam = hasQuery ? t.identifier('query') : [];
  let bodyParam = hasBody ? t.identifier('data') : [];

  if (hasQuery) {
    const typeDef = {
      type: 'object',
      properties: pathObj.parameters
        .filter(param => param.in === 'query')
        .map(param => ({ [param.name]: param }))
        .reduce((obj, current) => Object.assign(obj, current), {}),
    };
    queryParam.typeAnnotation = t.typeAnnotation(
      swaggerTypeToFlowType(typeDef, typeImports),
    );
  }

  if (hasBody) {
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
  }

  // make the actual function.
  // always accept a hostname.
  // accept all path params as individual arguments
  // also accept `query` and `data` as the last two arguments if API accepts
  let fnStatement = t.functionDeclaration(
    t.identifier(pathObj.operationId),
    [ hostnameParam ]
      .concat(
        pathObj.parameters
          .filter(param => param.in === 'path' && param.required)
          .map(paramToName),
      )
      .concat(queryParam)
      .concat(bodyParam),
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
        [ t.importDefaultSpecifier(t.identifier('makeQuery')) ],
        t.stringLiteral('../helpers/makeQuery'),
      ),
    );
  }
  if (hasFormData) {
    imports.push(
      t.importDeclaration(
        [ t.importDefaultSpecifier(t.identifier('makeFormData')) ],
        t.stringLiteral('../helpers/makeFormData'),
      ),
    );
  }
  imports.push(
    t.importDeclaration(
      [ t.importDefaultSpecifier(t.identifier('AjaxPipe')) ],
      t.stringLiteral('../helpers/AjaxPipe'),
    ),
  );

  // Create a AST object for `Program` that includes the imports and function
  // and returns it along with the name of the function so it can be written to
  // a file.
  typeImports = uniq(typeImports).map(name => {
    let importStatement = t.importDeclaration(
      [ t.importSpecifier(t.identifier(name), t.identifier(name)) ],
      t.stringLiteral(`../types/${name}`),
    );
    importStatement.importKind = 'type';

    return importStatement;
  });
  return [
    pathObj.operationId,
    t.program(
      imports.concat(typeImports).concat([ responseType ]).concat([ fn ]),
    ),
  ];
};

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
