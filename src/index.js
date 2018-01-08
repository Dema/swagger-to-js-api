/* @flow */
import 'babel-polyfill';
import { camelCase } from 'lodash';
import browserify from 'browserify';
import es2015 from 'babel-preset-es2015';
import umdModules from 'transform-es2015-modules-umd'
import fs from 'fs';
import parseArgs from 'command-line-args';
import path from 'path';
import printUsage from 'command-line-usage';
import flow from 'babel-preset-flow';
import rimraf from 'rimraf';
import stage0 from 'babel-preset-stage-0';
import type { OpenAPI } from 'openapi-flowtype-definition';
import yaml from 'js-yaml';

import convertSwaggerToFiles from './convertSwaggerToFiles';
import resolvePath from './resolvePath';

export type CliOptions = {
  input: string,
  output: string,
  force: boolean,
  name: string,
  version: string,
  transform: boolean,
  help?: boolean,
};

const optionDefs = [
  {
    name: 'input',
    alias: 'i',
    description: 'Path to Swagger JSON file to convert',
    type: String,
  },
  {
    name: 'output',
    alias: 'o',
    description: 'Folder path To Output generator package to',
    type: String,
  },
  {
    name: 'basePath',
    alias: 'b',
    description: 'Override basePath from swagger definition',
    type: String,
  },
  {
    name: 'ajax-library',
    description: 'Use given ajax library to make requests instead of generic AjaxPipe. Possible values: axios',
  },
  {
    name: 'force',
    alias: 'f',
    description: 'Overwrites output if it already exists.',
    type: Boolean,
  },
  {
    name: 'name',
    alias: 'n',
    description: 'Name for the generated package',
    type: String,
  },
  {
    name: 'version',
    alias: 'v',
    description: 'Version number for the generator NPM/Bower modules',
    type: String,
  },
  {
    name: 'transform',
    alias: 't',
    description: 'Transform output to vanilla javascript.',
    type: Boolean,
    default: false,
  },
  {
    name: 'help',
    alias: 'h',
    description: 'Prints this usage guide',
    type: Boolean,
    defaultOption: false,
  },
];

const usageGuide = [
  {
    header: 'Swagger to Javascript API generator',
    content: 'Takes a Swagger JSON file and generates UMD NPM and bower package to be used in Javascript applications.',
  },
  { header: 'Options', optionList: optionDefs },
];

const options: CliOptions = parseArgs(optionDefs);

options.version = options.version ||
  `1.0.${process.env.BUILD_NUMBER || Math.floor(Math.random() * 1000)}`;

if (options.help) {
  console.log(`swagger-to-js-api`);
  console.log(printUsage(usageGuide));
  process.exit(1);
}
if (!options.input) {
  console.error(
    'Error: Path to JSON file as input is required. Please use the `-i` flag to pass it in.',
  );
  process.exit(1);
}
if (!options.output) {
  console.error(
    'Error: Path to destination folder is required. Please use the `-o` flag to pass it in.',
  );
  process.exit(1);
}
if (!options.name) {
  console.error(
    'Error: The name for the generated package is required. Please use the `-n` flag to pass it in.',
  );
  process.exit(1);
}

options.input = resolvePath(options.input);
options.output = resolvePath(options.output);
if (options.force) {
  rimraf.sync(options.output);
} else {
  if (fs.existsSync(options.output)) {
    console.error(`Error: Output path already exists: ${options.output}`);
    process.exit(1);
  }
}
const loadSwaggerDef = (filename: string): OpenAPI => {
  const contents = fs.readFileSync(options.input, 'utf-8');
  if (filename.endsWith('.json')) {
    return JSON.parse(contents);
  } else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
    return yaml.safeLoad(contents);
  } else {
    throw new Error('Unrecognized extension, try .json, .yaml, .yml');
  }
};

const swaggerSpec: OpenAPI = loadSwaggerDef(options.input);
if (options.basePath) {
  swaggerSpec.basePath = options.basePath;
}

convertSwaggerToFiles(swaggerSpec, options);

browserify({ standalone: camelCase(options.name) })
  .transform('babelify', { presets: [ es2015, flow, stage0 ], plugins:[umdModules], babelrc: false })
  .add(path.join(options.output, './index.js'))
  .bundle()
  .pipe(fs.createWriteStream(path.join(options.output, './dist/index.js')));
