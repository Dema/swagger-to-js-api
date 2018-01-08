'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.default = function (swaggerObj, options) {
  var basePath = (swaggerObj.basePath || '').replace(/\/$/, '');
  var operations = (0, _arrayFlatten2.default)(Object.keys(swaggerObj.paths).filter(function (p) {
    return !['parameters', '$ref'].includes(p);
  }).map(function (p) {
    // We know this is an object because we filter out the keys to
    var pathData = swaggerObj.paths[p];
    var pathParams = pathData.parameters || [];
    delete pathData.parameters;
    return Object.keys(pathData).filter(function (q) {
      return !['parameters', '$ref'].includes(q);
    }).map(function (method) {
      // We know this is an object because we filter out the keys to
      var methodData = pathData[method];
      return _extends({}, methodData, {
        path: basePath + p,
        method: method,
        operationId: methodData.operationId.replace(/[. ]/g, '_'),
        parameters: (methodData.parameters || []).concat(pathParams)
      });
    });
  }));

  var operationIdList = new _immutable.List(operations.map(function (op) {
    return op.operationId;
  }));
  var operationIdSet = new _immutable.Set(operationIdList);
  if (operationIdList.count() > operationIdSet.count()) {
    throw new Error('The Swagger JSON contains duplicate operationIds for different endpoints: ' + JSON.stringify(operationIdList.toArray()));
  }

  operations.forEach(function (pathObj) {
    if (!pathObj.summary && !pathObj.description) {
      console.warn('Summary and discription missing for ' + pathObj.operationId);
    }
  });

  _mkdirp2.default.sync(_path2.default.join(options.output, 'src/'));
  _mkdirp2.default.sync(_path2.default.join(options.output, 'helpers/'));
  _mkdirp2.default.sync(_path2.default.join(options.output, 'types/'));
  _mkdirp2.default.sync(_path2.default.join(options.output, 'dist/'));

  var sourceExt = options.transform ? 'js.flow' : 'js';
  var transformExt = 'js';

  writeHelperFile('AjaxPipe', options, sourceExt, transformExt);
  writeHelperFile('AjaxObject', options, sourceExt, transformExt);
  writeHelperFile('makeQuery', options, sourceExt, transformExt);
  writeHelperFile('makeFormData', options, sourceExt, transformExt);

  var typePaths = [];

  if (swaggerObj.definitions) {
    (function () {
      var definitions = swaggerObj.definitions;
      var toFindDuplicates = {};
      Object.keys(swaggerObj.definitions).map(function (defName) {
        if (toFindDuplicates[defName.toLowerCase()]) {
          /* eslint-disable */
          console.error('\n  ' + _chalk2.default.red('ERROR:') + '\n  There are two different types with the name ' + defName + ', that only differ in case.\n  This will cause the files to overwrite each other on case-insensitve file systems\n  like the one on macOS.\n  ');
          /* eslint-enable */
        }
        toFindDuplicates[defName.toLowerCase()] = true;
        return _extends({}, definitions[defName], { name: defName });
      }).map(function (typeDef) {
        var name = typeDef.name;
        var imports = [];
        return [name, (0, _swaggerTypeToFlowType2.default)(typeDef, imports, swaggerObj.definitions), imports];
      }).map(function (tuple) {
        var name = tuple[0];
        var typeAst = tuple[1];
        var imports = (0, _lodash.uniq)(tuple[2]);
        var mainExport = t.exportNamedDeclaration({
          type: 'TypeAlias',
          id: t.identifier(name),
          typeParameters: null,
          right: typeAst
        }, []);
        var program = t.program(imports.map(function (importName) {
          var importStatement = t.importDeclaration([t.importSpecifier(t.identifier(importName), t.identifier(importName))], t.stringLiteral('./' + importName));
          importStatement.importKind = 'type';

          return importStatement;
        }).concat([mainExport]));
        return [name, program];
      }).map(function (tuple, i) {
        var name = tuple[0];
        var ast = tuple[1];
        return [name, (0, _babelGenerator2.default)(ast, { quotes: 'single' }).code];
      }).forEach(function (tuple) {
        var name = tuple[0];
        console.log(':: ', name);
        var code = tuple[1];
        var location = _path2.default.join('types/', name + '.js');
        typePaths.push({ name: name, location: location });
        _fs2.default.writeFileSync(_path2.default.join(options.output, location), '/* @flow */\n\n' + code, 'utf-8');
      });
    })();
  }

  var paths = operations.map(function (p) {
    return (0, _pathObjToAST2.default)(p, swaggerObj);
  }).map(function (arr) {
    var name = arr[0];
    var ast = arr[1];
    return [name, (0, _babelGenerator2.default)(ast, { quotes: 'single' }).code];
  });

  paths.forEach(function (arr) {
    var name = arr[0];
    var code = arr[1];
    _fs2.default.writeFileSync(_path2.default.join(options.output, 'src/', name + '.' + sourceExt), '/* @flow */\n\nimport type { AjaxObject } from \'../helpers/AjaxObject\';\n' + code + '\n', 'utf-8');
  });

  if (options.transform) {
    paths.map(function (_ref) {
      var _ref2 = _slicedToArray(_ref, 2),
          name = _ref2[0],
          code = _ref2[1];

      return [name, babel.transform(code, { presets: [_babelPresetFlow2.default, _babelPresetEs2.default, _babelPresetStage2.default] }).code];
    }).forEach(function (arr) {
      var name = arr[0];
      var code = arr[1];
      _fs2.default.writeFileSync(_path2.default.join(options.output, 'src/', name + '.' + transformExt), code + '\n', 'utf-8');
    });
  }

  // Write the overall index file at the root of the generated output.
  // Import and export all types.
  var indexFile = typePaths.map(function (info) {
    return 'import type ' + info.name + ' from \'./' + info.location + '\';';
  }).join('\n');
  indexFile += '\n';
  indexFile += 'export type {\n';
  indexFile += typePaths.map(function (info) {
    return '  ' + info.name + ',';
  }).join('\n');
  indexFile += '\n}\n';
  indexFile += '\n';
  indexFile += (0, _lodash.uniq)(paths.map(function (arr) {
    return arr[0];
  })).map(function (name) {
    return 'export { default as ' + name + ' } from \'./src/' + name + '\';';
  }).join('\n');
  indexFile = '/* @flow */\n\n' + indexFile + '\n';

  // Import and export all path functions.
  _fs2.default.writeFileSync(_path2.default.join(options.output, 'index.' + sourceExt), indexFile, 'utf-8');
  if (options.transform) {
    var transformedIndex = babel.transform(indexFile, {
      presets: [_babelPresetFlow2.default, _babelPresetEs2.default, _babelPresetStage2.default]
    }).code;
    _fs2.default.writeFileSync(_path2.default.join(options.output, 'index.' + transformExt), transformedIndex, 'utf-8');
  }

  // Write a flow configuration file into the generated output.
  _fs2.default.writeFileSync(_path2.default.join(options.output, '.flowconfig'), _fs2.default.readFileSync(_path2.default.join(__dirname, '..', '.flowconfig'), 'utf-8'), 'utf-8');

  // Write the package.json file at the root of the generated output.
  _fs2.default.writeFileSync(_path2.default.join(options.output, 'package.json'), JSON.stringify({
    name: options.name,
    description: 'Auto-generated api from Swagger.json',
    version: options.version,
    main: 'index.js',
    license: 'MIT',
    dependencies: {}
  }, null, 2), 'utf-8');

  // Write the bower.json file at the root of the generated output.
  _fs2.default.writeFileSync(_path2.default.join(options.output, 'bower.json'), JSON.stringify({
    name: options.name,
    description: 'Auto-generated api from Swagger.json',
    version: options.version,
    main: ['dist/index.js'],
    license: 'MIT',
    ignore: ['node_modules', 'src', 'helpers', 'types']
  }, null, 2), 'utf-8');
};

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _pathObjToAST = require('./pathObjToAST');

var _pathObjToAST2 = _interopRequireDefault(_pathObjToAST);

var _babelTypes = require('babel-types');

var t = _interopRequireWildcard(_babelTypes);

var _babelCore = require('babel-core');

var babel = _interopRequireWildcard(_babelCore);

var _babelGenerator = require('babel-generator');

var _babelGenerator2 = _interopRequireDefault(_babelGenerator);

var _babelPresetEs = require('babel-preset-es2015');

var _babelPresetEs2 = _interopRequireDefault(_babelPresetEs);

var _babelPresetStage = require('babel-preset-stage-0');

var _babelPresetStage2 = _interopRequireDefault(_babelPresetStage);

var _babelPresetFlow = require('babel-preset-flow');

var _babelPresetFlow2 = _interopRequireDefault(_babelPresetFlow);

var _arrayFlatten = require('array-flatten');

var _arrayFlatten2 = _interopRequireDefault(_arrayFlatten);

var _immutable = require('immutable');

var _swaggerTypeToFlowType = require('./swaggerTypeToFlowType');

var _swaggerTypeToFlowType2 = _interopRequireDefault(_swaggerTypeToFlowType);

var _lodash = require('lodash');

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var writeHelperFile = function writeHelperFile(filename, options, sourceExt, transformExt) {
  // Copy helpers, both compiled and original
  ['.js', '.js.flow'].forEach(function (ext) {
    _fs2.default.copyFileSync(_path2.default.join(__dirname, './helpers/', filename + ext), _path2.default.join(options.output, 'helpers/', filename + ext));
  });
};