'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (pathObj, swaggerObj) {
  var overrideBaseURL = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : undefined;

  var hostname = swaggerObj.schemes != null && swaggerObj.host != null ? swaggerObj.schemes[0] + '://' + swaggerObj.host : null;
  if (swaggerObj.schemes != null && swaggerObj.schemes.length > 1) {
    console.warn('Multiple schemes detected but not yet supported. Using: ' + swaggerObj.schemes[0]);
  }
  var typeImports = [];
  var imports = [];
  pathObj.parameters = pathObj.parameters || [];
  var hasQuery = !!(pathObj.parameters || []).filter(function (param) {
    return param.in === 'query';
  }).length;
  var bodyParamJson = (pathObj.parameters || []).filter(function (param) {
    return param.in === 'body';
  })[0];
  var hasFormData = !!(pathObj.parameters || []).filter(function (param) {
    return param.in === 'formData';
  }).length;
  var hasBody = !!(pathObj.parameters || []).filter(function (param) {
    return param.in === 'formData' || param.in === 'body';
  }).length;

  var responseType = {
    type: 'TypeAlias',
    id: t.identifier('AjaxResponse'),
    typeParameters: null,
    right: t.anyTypeAnnotation()
  };

  var responseSchema = (0, _lodash.get)(pathObj, 'responses.200.schema') || (0, _lodash.get)(pathObj, 'responses.default.schema');
  if (responseSchema) {
    responseType.right = (0, _swaggerTypeToFlowType2.default)(responseSchema, typeImports);
  }

  // prepare a template string for the URL that may contain 0 or more url params
  var urlParams = [];
  var urlParts = pathObj.path.split(/(\}|\{)/).reduce(function (compiled, current) {
    if (current === '{') {
      return (0, _lodash.assign)({}, compiled, { mode: 'variable' });
    }
    if (current === '}') {
      return (0, _lodash.assign)({}, compiled, { mode: 'string' });
    }
    if (compiled.mode === 'string') {
      compiled.quasis.push(t.templateElement({ raw: current, cooked: current }));
      return compiled;
    }
    if (compiled.mode === 'variable') {
      urlParams.push(current);
      compiled.expressions.push(t.identifier(current));
      return compiled;
    }
    throw new Error('Could not generate url params.');
  }, { quasis: [], expressions: [], mode: 'string' });

  var pathParams = pathObj.parameters.filter(function (param) {
    return param.in === 'path' && param.required;
  }).map(function (param) {
    return param.name;
  });

  var paramsUsed = urlParams.sort();
  var paramsProvided = pathParams.sort();

  if (!(0, _lodash.isEqual)(paramsUsed, paramsProvided)) {
    throw new Error('\n      There is a problem in the operation ' + pathObj.operationId + '.\n\n      The URL of the operation is: ' + pathObj.path + ' which has the following params:\n      ' + JSON.stringify(paramsUsed) + '\n\n      But the params actually specified are:\n      ' + JSON.stringify(paramsProvided) + '\n    ');
  }
  // If the endpoint accepts query params, + a queryString at the end of the pathname
  var pathExpression = hasQuery ? t.binaryExpression('+', t.templateLiteral(urlParts.quasis, urlParts.expressions), t.callExpression(t.identifier('makeQuery'), [t.identifier('query')])) : t.templateLiteral(urlParts.quasis, urlParts.expressions);

  // Create the properties that will put on the returned object
  var objectProperties = [t.objectProperty(t.identifier('method'), t.stringLiteral(pathObj.method.toUpperCase())), t.objectProperty(t.identifier('url'), hostname != null ? t.binaryExpression('+', t.stringLiteral(hostname), pathExpression) : pathExpression)];

  // if the endpoint takes a post-body, add that as a key to the object
  if (hasBody) {
    var dataValue = hasFormData ? t.callExpression(t.identifier('makeFormData'), [t.identifier('data')]) : t.identifier('data');

    objectProperties.push(t.objectProperty(t.identifier('data'), dataValue, false,
    // Only use shorthand if we pass body data through.
    hasBody && !hasFormData));
  }

  // the body of the function.
  // Take the object prepared so far and use it to initialize a AjaxPipe.
  // AjaxPipe will be used to maintain the types for response objects.
  // Soon.
  var body = t.blockStatement([t.returnStatement(t.newExpression(t.identifier('AjaxPipe'), [t.objectExpression(objectProperties)]))]);

  var queryParams = [];
  var bodyParams = [];

  if (hasQuery) {
    var typeDef = {
      type: 'object',
      properties: pathObj.parameters.filter(function (param) {
        return param.in === 'query';
      }).map(function (param) {
        return _defineProperty({}, param.name, param);
      }).reduce(function (obj, current) {
        return Object.assign(obj, current);
      }, {})
    };
    var queryParam = t.identifier('query');
    queryParam.typeAnnotation = t.typeAnnotation((0, _swaggerTypeToFlowType2.default)(typeDef, typeImports));
    queryParams.push(queryParam);
  }

  if (hasBody) {
    var bodyParam = t.identifier('data');
    if (hasFormData) {
      var _typeDef = {
        type: 'object',
        properties: pathObj.parameters.filter(function (param) {
          return param.in === 'formData';
        }).map(function (param) {
          return _defineProperty({}, param.name, param);
        }).reduce(function (obj, current) {
          return Object.assign(obj, current);
        }, {})
      };
      bodyParam.typeAnnotation = t.typeAnnotation((0, _swaggerTypeToFlowType2.default)(_typeDef, typeImports));
    } else if (bodyParamJson.schema) {
      bodyParam.typeAnnotation = t.typeAnnotation((0, _swaggerTypeToFlowType2.default)(bodyParamJson.schema, typeImports));
    } else if (bodyParamJson.type) {
      bodyParam.typeAnnotation = t.typeAnnotation((0, _swaggerTypeToFlowType2.default)(bodyParamJson, typeImports));
    }
    bodyParams.push(bodyParam);
  }

  // make the actual function.
  // accept all path params as individual arguments
  // also accept `query` and `data` as the last two arguments if API accepts
  var keywords = ['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'enum', 'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static', 'await', 'abstract', 'boolean', 'byte', 'char', 'double', 'final', 'float', 'goto', 'int', 'long', 'native', 'short', 'synchronized', 'throws', 'transient', 'volatile', 'null', 'true', 'false'];
  var maybeKeyword = function maybeKeyword(name) {
    return keywords.includes(name) ? name + '_' : name;
  };
  var fnStatement = t.functionDeclaration(t.identifier(maybeKeyword(pathObj.operationId)), [].concat(pathObj.parameters.filter(function (param) {
    return param.in === 'path' && param.required;
  }).map(paramToName)).concat(queryParams).concat(bodyParams), body);

  fnStatement.returnType = t.typeAnnotation(t.genericTypeAnnotation(t.identifier('AjaxPipe'), t.typeParameterInstantiation([t.genericTypeAnnotation(t.identifier('AjaxObject'), null), t.genericTypeAnnotation(t.identifier('AjaxResponse'), null)])));

  var fn = t.exportDefaultDeclaration(fnStatement);

  // declare imports for the helpers that are used in the function.
  if (hasQuery) {
    imports.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier('makeQuery'))], t.stringLiteral('../helpers/makeQuery')));
  }
  if (hasFormData) {
    imports.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier('makeFormData'))], t.stringLiteral('../helpers/makeFormData')));
  }
  imports.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier('AjaxPipe'))], t.stringLiteral('../helpers/AjaxPipe')));

  // Create a AST object for `Program` that includes the imports and function
  // and returns it along with the name of the function so it can be written to
  // a file.
  typeImports = (0, _lodash.uniq)(typeImports).map(function (name) {
    var importStatement = t.importDeclaration([t.importSpecifier(t.identifier(name), t.identifier(name))], t.stringLiteral('../types/' + name));
    importStatement.importKind = 'type';

    return importStatement;
  });
  return [pathObj.operationId, t.program(imports.concat(typeImports).concat([responseType]).concat([fn]))];
};

var _babelTypes = require('babel-types');

var t = _interopRequireWildcard(_babelTypes);

var _lodash = require('lodash');

var _swaggerTypeToFlowType = require('./swaggerTypeToFlowType');

var _swaggerTypeToFlowType2 = _interopRequireDefault(_swaggerTypeToFlowType);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function paramToName(param) {
  var paramName = t.identifier(param.name);
  if (param.schema) {
    paramName.typeAnnotation = t.typeAnnotation((0, _swaggerTypeToFlowType2.default)(param.schema));
  } else if (param.type) {
    paramName.typeAnnotation = t.typeAnnotation((0, _swaggerTypeToFlowType2.default)(param));
  }
  return paramName;
}