'use strict';

require('babel-polyfill');

var _lodash = require('lodash');

var _browserify = require('browserify');

var _browserify2 = _interopRequireDefault(_browserify);

var _babelPresetEs = require('babel-preset-es2015');

var _babelPresetEs2 = _interopRequireDefault(_babelPresetEs);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _commandLineArgs = require('command-line-args');

var _commandLineArgs2 = _interopRequireDefault(_commandLineArgs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _commandLineUsage = require('command-line-usage');

var _commandLineUsage2 = _interopRequireDefault(_commandLineUsage);

var _babelPresetFlow = require('babel-preset-flow');

var _babelPresetFlow2 = _interopRequireDefault(_babelPresetFlow);

var _rimraf = require('rimraf');

var _rimraf2 = _interopRequireDefault(_rimraf);

var _babelPresetStage = require('babel-preset-stage-0');

var _babelPresetStage2 = _interopRequireDefault(_babelPresetStage);

var _jsYaml = require('js-yaml');

var _jsYaml2 = _interopRequireDefault(_jsYaml);

var _convertSwaggerToFiles = require('./convertSwaggerToFiles');

var _convertSwaggerToFiles2 = _interopRequireDefault(_convertSwaggerToFiles);

var _resolvePath = require('./resolvePath');

var _resolvePath2 = _interopRequireDefault(_resolvePath);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var optionDefs = [{
  name: 'input',
  alias: 'i',
  description: 'Path to Swagger JSON file to convert',
  type: String
}, {
  name: 'output',
  alias: 'o',
  description: 'Folder path To Output generator package to',
  type: String
}, {
  name: 'basePath',
  alias: 'b',
  description: 'Override basePath from swagger definition',
  type: String
}, {
  name: 'ajax-library',
  description: 'Use given ajax library to make requests instead of generic AjaxPipe. Possible values: axios'
}, {
  name: 'force',
  alias: 'f',
  description: 'Overwrites output if it already exists.',
  type: Boolean
}, {
  name: 'name',
  alias: 'n',
  description: 'Name for the generated package',
  type: String
}, {
  name: 'version',
  alias: 'v',
  description: 'Version number for the generator NPM/Bower modules',
  type: String
}, {
  name: 'transform',
  alias: 't',
  description: 'Transform output to vanilla javascript.',
  type: Boolean,
  default: false
}, {
  name: 'help',
  alias: 'h',
  description: 'Prints this usage guide',
  type: Boolean,
  defaultOption: false
}];

var usageGuide = [{
  header: 'Swagger to Javascript API generator',
  content: 'Takes a Swagger JSON file and generates UMD NPM and bower package to be used in Javascript applications.'
}, { header: 'Options', optionList: optionDefs }];

var options = (0, _commandLineArgs2.default)(optionDefs);

options.version = options.version || '1.0.' + (process.env.BUILD_NUMBER || Math.floor(Math.random() * 1000));

if (options.help) {
  console.log('swagger-to-js-api');
  console.log((0, _commandLineUsage2.default)(usageGuide));
  process.exit(1);
}
if (!options.input) {
  console.error('Error: Path to JSON file as input is required. Please use the `-i` flag to pass it in.');
  process.exit(1);
}
if (!options.output) {
  console.error('Error: Path to destination folder is required. Please use the `-o` flag to pass it in.');
  process.exit(1);
}
if (!options.name) {
  console.error('Error: The name for the generated package is required. Please use the `-n` flag to pass it in.');
  process.exit(1);
}

options.input = (0, _resolvePath2.default)(options.input);
options.output = (0, _resolvePath2.default)(options.output);
if (options.force) {
  _rimraf2.default.sync(options.output);
} else {
  if (_fs2.default.existsSync(options.output)) {
    console.error('Error: Output path already exists: ' + options.output);
    process.exit(1);
  }
}
var loadSwaggerDef = function loadSwaggerDef(filename) {
  var contents = _fs2.default.readFileSync(options.input, 'utf-8');
  if (filename.endsWith('.json')) {
    return JSON.parse(contents);
  } else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
    return _jsYaml2.default.safeLoad(contents);
  } else {
    throw new Error('Unrecognized extension, try .json, .yaml, .yml');
  }
};

var swaggerSpec = loadSwaggerDef(options.input);
if (options.basePath) {
  swaggerSpec.basePath = options.basePath;
}

(0, _convertSwaggerToFiles2.default)(swaggerSpec, options);

(0, _browserify2.default)({ standalone: (0, _lodash.camelCase)(options.name) }).transform('babelify', { presets: [_babelPresetEs2.default, _babelPresetFlow2.default, _babelPresetStage2.default], babelrc: false }).add(_path2.default.join(options.output, './index.js')).bundle().pipe(_fs2.default.createWriteStream(_path2.default.join(options.output, './dist/index.js')));