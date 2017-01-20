/* @flow */

import fs from 'fs';
import mkdirp from 'mkdirp';
import path from 'path';
import pathObjToAST from './pathObjToAST';
import * as t from 'babel-types';
import * as babel from 'babel-core';
import { default as generate } from 'babel-generator';
import es2015 from 'babel-preset-es2015';
import stage0 from 'babel-preset-stage-0';
import react from 'babel-preset-react';
import flatten from 'array-flatten';
import { Set as ImmutableSet } from 'immutable';
import { List as ImmutableList } from 'immutable';


import flow from 'babel-plugin-transform-flow-strip-types';
import swaggerTypeToFlowType from './swaggerTypeToFlowType';
import { uniq } from 'lodash';
import chalk from 'chalk';

import type { CliOptions } from './index';
import type { OpenAPI } from 'openapi-flowtype-definition';

const writeHelperFile = (
  filename: string,
  options: CliOptions,
  sourceExt: string,
  transformExt: string,
): void => {

  // Read the helper file included in this project.
  const code = fs.readFileSync(
    path.join(__dirname, './helpers/', filename),
    'utf-8',
  );

  // Write it out into generated project, potentially changing the ext.
  fs.writeFileSync(
    path.join(options.output, 'helpers/', filename.replace(/\.js$/, `.${sourceExt}`)),
    code,
  );

  // If we want to transform the generated code, transform the helper too.
  if (options.transform) {
    fs.writeFileSync(
      path.join(options.output, 'helpers/', filename.replace(/\.js$/, `.${transformExt}`)),
      babel.transform(code, { presets: [react, es2015, stage0], plugins: [flow] }).code,
    );
  }
};

export default function(swaggerObj: OpenAPI, options: CliOptions) {
  const basePath = (swaggerObj.basePath || '').replace(/\/$/, '');
  const operations = flatten(Object.keys(swaggerObj.paths)
    .filter(p => !['parameters', '$ref'].includes(p))
    .map(p => {
      // We know this is an object because we filter out the keys to
      // non-objects above. Teach flow.
      const pathData: Object = swaggerObj.paths[p];
      const pathParams = pathData.parameters || [];
      delete pathData.parameters;
      return Object.keys(pathData)
      .filter(q => !['parameters', '$ref'].includes(q))
      .map(method => {
        // We know this is an object because we filter out the keys to
        // non-objects above. Teach flow.
        const methodData: Object = pathData[method];
        return {
          ...methodData,
          path: basePath + p,
          method,
          operationId: methodData.operationId.replace(/[. ]/g, '_'),
          parameters: (methodData.parameters || []).concat(pathParams),
        };
      });
    }));

  const operationIdList = new ImmutableList(operations.map(op => op.operationId));
  const operationIdSet = new ImmutableSet(operationIdList);
  if (operationIdList.count() > operationIdSet.count()) {
    throw new Error(
      'The Swagger JSON contains duplicate operationIds for different endpoints: ' +
      JSON.stringify(operationIdList.toArray()),
    );
  }

  operations.forEach(pathObj => {
    if (!pathObj.summary && !pathObj.description) {
      console.warn(
        `Summary and discription missing for ${pathObj.operationId}`,
      );
    }
  });

  mkdirp.sync(path.join(options.output, 'src/'));
  mkdirp.sync(path.join(options.output, 'helpers/'));
  mkdirp.sync(path.join(options.output, 'types/'));
  mkdirp.sync(path.join(options.output, 'dist/'));

  const sourceExt = (options.transform) ? 'js.flow' : 'js';
  const transformExt = 'js';

  writeHelperFile('AjaxPipe.js', options, sourceExt, transformExt);
  writeHelperFile('AjaxObject.js', options, sourceExt, transformExt);
  writeHelperFile('makeQuery.js', options, sourceExt, transformExt);
  writeHelperFile('makeFormData.js', options, sourceExt, transformExt);

  const typePaths = [];

  if (swaggerObj.definitions) {
    const definitions = swaggerObj.definitions;
    const toFindDuplicates = {};
    Object
      .keys(swaggerObj.definitions)
      .map(defName => {
        if (toFindDuplicates[defName.toLowerCase()]) {
          /* eslint-disable */
          console.error(
            `
  ${chalk.red('ERROR:')}
  There are two different types with the name ${defName}, that only differ in case.
  This will cause the files to overwrite each other on case-insensitve file systems
  like the one on macOS.
  `,
          );
          /* eslint-enable */
        }
        toFindDuplicates[defName.toLowerCase()] = true;
        return {
          ...definitions[defName],
          name: defName,
        };
      })
      .map(typeDef => {
        const name = typeDef.name;
        const imports = [];
        return [name, swaggerTypeToFlowType(typeDef, imports), imports];
      })
      .map(tuple => {
        let name = tuple[0];
        let typeAst = tuple[1];
        let imports = uniq(tuple[2]);
        let mainExport = t.exportNamedDeclaration(
          {
            type: 'TypeAlias',
            id: t.identifier(name),
            typeParameters: null,
            right: typeAst,
          },
          [],
        );
        let program = t.program(
          imports.map(importName => {
            let importStatement = t.importDeclaration(
              [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
              t.stringLiteral(`./${importName}`),
            );
            importStatement.importKind = 'type';

            return importStatement;
          }).concat([mainExport]),
        );
        return [name, program];
      })
      .map((tuple, i) => {
        let name = tuple[0];
        let ast = tuple[1];
        return [name, generate(ast, { quotes: 'single' }).code];
      })
      .forEach(tuple => {
        let name = tuple[0];
        console.log(':: ', name);
        let code = tuple[1];
        const location = path.join('types/', `${name}.js`);
        typePaths.push({
          name,
          location,
        });
        fs.writeFileSync(
          path.join(options.output, location),
          `/* @flow */\n\n${code}`,
          'utf-8',
        );
      });
  }

  let paths = operations.map(p => pathObjToAST(p, swaggerObj)).map(arr => {
    let name = arr[0];
    let ast = arr[1];
    return [name, generate(ast, { quotes: 'single' }).code];
  });

  paths.forEach(arr => {
    let name = arr[0];
    let code = arr[1];
    fs.writeFileSync(
      path.join(options.output, 'src/', `${name}.${sourceExt}`),
      `/* @flow */\n\nimport type { AjaxObject } from '../helpers/AjaxObject';\n${code}\n`,
      'utf-8',
    );
  });

  if (options.transform) {
    paths
      .map(([name, code]) => [
        name,
        babel.transform(code, { presets: [react, es2015, stage0], plugins: [flow] }).code,
      ])
      .forEach(arr => {
        let name = arr[0];
        let code = arr[1];
        fs.writeFileSync(
          path.join(options.output, 'src/', `${name}.${transformExt}`),
          `${code}\n`,
          'utf-8',
        );
      });
  }

  // Write the overall index file at the root of the generated output.
  // Import and export all types.
  let indexFile = typePaths
    .map(info => `import type ${info.name} from './${info.location}';`)
    .join('\n');
  indexFile += '\n';
  indexFile += 'export type {\n';
  indexFile += typePaths
    .map(info => `  ${info.name},`)
    .join('\n');
  indexFile += '\n}\n';
  indexFile += '\n';
  indexFile += uniq(paths.map(arr => arr[0]))
    .map(name => `export * from './src/${name}';`)
    .join('\n');
  indexFile = `/* @flow */\n\n${indexFile}\n`;

  // Import and export all path functions.
  fs.writeFileSync(path.join(options.output, `index.${sourceExt}`), indexFile, 'utf-8');
  if (options.transform) {
    const transformedIndex = babel.transform(
      indexFile,
      { presets: [react, es2015, stage0], plugins: [flow] },
    ).code;
    fs.writeFileSync(path.join(options.output, `index.${transformExt}`), transformedIndex, 'utf-8');
  }

  // Write a flow configuration file into the generated output.
  fs.writeFileSync(
    path.join(options.output, `.flowconfig`),
    fs.readFileSync(path.join(__dirname, '.flowconfig'), 'utf-8'),
    'utf-8',
  );

  // Write the package.json file at the root of the generated output.
  fs.writeFileSync(
    path.join(options.output, 'package.json'),
    JSON.stringify(
      {
        name: options.name,
        description: 'Auto-generated api from Swagger.json',
        version: options.version,
        main: 'index.js',
        license: 'MIT',
        dependencies: {},
      },
      null,
      2,
    ),
    'utf-8',
  );

  // Write the bower.json file at the root of the generated output.
  fs.writeFileSync(
    path.join(options.output, 'bower.json'),
    JSON.stringify(
      {
        name: options.name,
        description: 'Auto-generated api from Swagger.json',
        version: options.version,
        main: ['dist/index.js'],
        license: 'MIT',
        ignore: ['node_modules', 'src', 'helpers', 'types'],
      },
      null,
      2,
    ),
    'utf-8',
  );
};
