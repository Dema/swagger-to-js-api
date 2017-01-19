

let t = require('babel-types');
import { get, assign, isEqual, uniq } from 'lodash';
let swaggerTypeToFlowType = require('./swaggerTypeToFlowType');

module.exports = function (pathObj) {
  let typeImports = [];
  let imports = [];
  pathObj.parameters = pathObj.parameters || [];
  let hasQuery = !!(pathObj.parameters || []).filter(param => param.in === 'query').length;
  let bodyParamJson = (pathObj.parameters || []).filter(param => param.in === 'body' && param.name === 'body')[0];
  let hasFormData = !!(pathObj.parameters || []).filter(param => param.in === 'formData').length;
  let hasBody = !!(pathObj.parameters || []).filter(param => param.in === 'formData' || param.in === 'body').length;

  let responseType = {
    type: 'TypeAlias',
    id: t.Identifier('Response'),
    typeParameters: null,
    right: t.AnyTypeAnnotation(),
  };

  if (get(pathObj, 'responses.200.schema')) {
    responseType.right = swaggerTypeToFlowType(get(pathObj, 'responses.200.schema'), typeImports);
  }

  // prepare a template string for the URL that may contain 0 or more url params
  let urlParams = [];
  let urlParts = pathObj.path.split(/(\}|\{)/)
    .reduce((compiled, current) => {
      if (current === '{') {
        return assign({}, compiled, { mode: 'variable' });
      }
      if (current === '}') {
        return assign({}, compiled, { mode: 'string' });
      }
      if (compiled.mode === 'string') {
        compiled.quasis.push(t.TemplateElement({ raw: current, cooked: current }));
        return compiled;
      }
      if (compiled.mode === 'variable') {
        urlParams.push(current);
        compiled.expressions.push(t.Identifier(current));
        return compiled;
      }
    }, { quasis: [], expressions: [], mode: 'string' });

  let pathParams = pathObj.parameters
    .filter(param => param.in === 'path' && param.required)
    .map(param => param.name);

  let paramsUsed = urlParams.sort();
  let paramsProvided = pathParams.sort();

  if (!isEqual(paramsUsed, paramsProvided)) {
    throw new Error(`
      There is a problem in the operation ${pathObj.operationId}.

      The URL of the operation is: ${pathObj.path} which has the following params:
      ${JSON.stringify(paramsUsed)}

      But the params actually specified are:
      ${JSON.stringify(paramsProvided)}
    `);
  }
  // If the endpoint accepts query params, + a queryString at the end of the pathname
  let pathExpression = hasQuery
    ? t.BinaryExpression('+',
      t.TemplateLiteral(urlParts.quasis, urlParts.expressions),
      t.CallExpression(
        t.Identifier('makeQuery'),
        [t.Identifier('query')]
      )
    )
    : t.TemplateLiteral(urlParts.quasis, urlParts.expressions);

  // Create the properties that will put on the returned object
  let objectProperties = [
    t.objectProperty(t.Identifier('method'), t.StringLiteral(pathObj.method.toUpperCase())),
    t.objectProperty(
      t.Identifier('url'),
      t.BinaryExpression(
        '+',
        t.Identifier('hostname'),
        pathExpression
      )
    ),
  ];

  // if the endpoint takes a post-body, add that as a key to the object
  if (hasBody) {
    let dataValue = hasFormData
      ? t.CallExpression(t.Identifier('makeFormData'), [t.Identifier('data')])
      : t.Identifier('data');

    objectProperties.push(t.objectProperty(t.Identifier('data'), dataValue));
  }

  // the body of the function.
  // Take the object prepared so far and use it to initialize a AjaxPipe.
  // AjaxPipe will be used to maintain the types for response objects.
  // Soon.
  let body = t.BlockStatement([
    t.ReturnStatement(
      t.NewExpression(
        t.Identifier('AjaxPipe'),
        [
          t.ObjectExpression(objectProperties),
        ]
      )
    ),
  ]);

  let hostnameParam = t.Identifier('hostname');
  hostnameParam.typeAnnotation = t.TypeAnnotation(
    t.StringTypeAnnotation()
  );
  let queryParam = hasQuery ? t.Identifier('query') : [];
  let bodyParam = hasBody ? t.Identifier('data') : [];

  if (hasQuery) {
    const typeDef = {
      type: 'object',
      properties: pathObj.parameters
        .filter(param => param.in === 'query')
        .map(param => ({ [param.name]: param }))
        .reduce((obj, current) => Object.assign(obj, current), {}),
    };
    queryParam.typeAnnotation = t.TypeAnnotation(
      swaggerTypeToFlowType(typeDef, typeImports)
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
      bodyParam.typeAnnotation = t.TypeAnnotation(
        swaggerTypeToFlowType(typeDef, typeImports)
      );
    } else if (bodyParamJson.schema) {
      bodyParam.typeAnnotation = t.TypeAnnotation(
        swaggerTypeToFlowType(bodyParamJson.schema, typeImports)
      );
    } else if (bodyParamJson.type) {
      bodyParam.typeAnnotation = t.TypeAnnotation(
        swaggerTypeToFlowType(bodyParamJson, typeImports)
      );
    }
  }

  // make the actual function.
  // always accept a hostname.
  // accept all path params as individual arguments
  // also accept `query` and `data` as the last two arguments if API accepts
  let fnStatement = t.FunctionDeclaration(
    t.Identifier(pathObj.operationId),
    [hostnameParam]
      .concat(
        pathObj.parameters
        .filter(param => param.in === 'path' && param.required)
        .map(paramToName)
      )
      .concat(queryParam)
      .concat(bodyParam),
    body
  );

  fnStatement.returnType = t.TypeAnnotation(
    t.GenericTypeAnnotation(
      t.Identifier('AjaxPipe'),
      t.TypeParameterInstantiation([
        t.GenericTypeAnnotation(t.Identifier('AjaxObject'), null),
        t.GenericTypeAnnotation(t.Identifier('Response'), null),
      ])
    )
  );

  let fn = t.ExportDefaultDeclaration(fnStatement);

  // declare imports for the helpers that are used in the function.
  if (hasQuery) {
    imports.push(t.ImportDeclaration([t.ImportDefaultSpecifier(t.Identifier('makeQuery'))], t.StringLiteral('../helpers/makeQuery')));
  }
  if (hasFormData) {
    imports.push(t.ImportDeclaration([t.ImportDefaultSpecifier(t.Identifier('makeFormData'))], t.StringLiteral('../helpers/makeFormData')));
  }
  imports.push(t.ImportDeclaration([t.ImportDefaultSpecifier(t.Identifier('AjaxPipe'))], t.StringLiteral('../helpers/AjaxPipe')));

  // Create a AST object for `Program` that includes the imports and function
  // and returns it along with the name of the function so it can be written to
  // a file.
  typeImports = uniq(typeImports).map(name => {
    let importStatement = t.ImportDeclaration(
      [t.ImportSpecifier(t.Identifier(name), t.Identifier(name))],
      t.StringLiteral(`../types/${name}`)
    );
    importStatement.importKind = 'type';

    return importStatement;
  });
  return [
    pathObj.operationId,
    t.Program(
      imports
      .concat(typeImports)
      .concat([responseType])
      .concat([fn])
    ),
  ];
};

function paramToName (param) {
  let paramName = t.Identifier(param.name);
  if (param.schema) {
    paramName.typeAnnotation = t.TypeAnnotation(
      swaggerTypeToFlowType(param.schema)
    );
  } else if (param.type) {
    paramName.typeAnnotation = t.TypeAnnotation(
      swaggerTypeToFlowType(param)
    );
  }
  return paramName;
}
