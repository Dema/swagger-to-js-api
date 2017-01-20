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

/* eslint-disable babel/new-cap */

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
  fs.writeFileSync(
    path.join(options.output, 'helpers/', 'AjaxPipe.js'),
    fs.readFileSync(path.join(__dirname, './helpers/', 'AjaxPipe.js'), 'utf-8'),
  );
  fs.writeFileSync(
    path.join(options.output, 'helpers/', 'AjaxPipe.js.flow'),
    fs.readFileSync(
      path.join(__dirname, './helpers/', 'AjaxPipe.js.flow'),
      'utf-8',
    ),
  );
  fs.writeFileSync(
    path.join(options.output, 'helpers/', 'makeQuery.js'),
    fs.readFileSync(
      path.join(__dirname, './helpers/', 'makeQuery.js'),
      'utf-8',
    ),
  );
  fs.writeFileSync(
    path.join(options.output, 'helpers/', 'makeFormData.js'),
    fs.readFileSync(
      path.join(__dirname, './helpers/', 'makeFormData.js'),
      'utf-8',
    ),
  );
  fs.writeFileSync(
    path.join(options.output, 'types/', 'AjaxObject.js.flow'),
    fs.readFileSync(
      path.join(__dirname, './helpers/', 'AjaxObject.js'),
      'utf-8',
    ),
  );

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
        return [ name, swaggerTypeToFlowType(typeDef, imports), imports ];
      })
      .map(tuple => {
        let name = tuple[0];
        let typeAst = tuple[1];
        let imports = uniq(tuple[2]);
        let mainExport = t.exportNamedDeclaration(
          {
            type: 'TypeAlias',
            id: t.Identifier(name),
            typeParameters: null,
            right: typeAst,
          },
          [],
        );
        let program = t.Program(
          imports.map(importName => {
            let importStatement = t.ImportDeclaration(
              [ t.ImportSpecifier(t.Identifier(importName), t.Identifier(importName)) ],
              t.StringLiteral(`./${importName}`),
            );
            importStatement.importKind = 'type';

            return importStatement;
          }).concat([ mainExport ]),
        );
        return [ name, program ];
      })
      .map((tuple, i) => {
        let name = tuple[0];
        let ast = tuple[1];
        return [ name, generate(ast, { quotes: 'single' }).code ];
      })
      .forEach(tuple => {
        let name = tuple[0];
        console.log(':: ', name);
        let code = tuple[1];
        fs.writeFileSync(
          path.join(options.output, 'types/', `${name}.js`),
          `/* @flow */\n\n${code}`,
          'utf-8',
        );
      });
  }

  let paths = operations.map(pathObjToAST).map(arr => {
    let name = arr[0];
    let ast = arr[1];
    return [ name, generate(ast, { quotes: 'single' }).code ];
  });

  paths.forEach(arr => {
    let name = arr[0];
    let code = arr[1];
    fs.writeFileSync(
      path.join(options.output, 'src/', `${name}.js.flow`),
      `/* @flow */\n\nimport type { AjaxObject } from '../types/AjaxObject';\n${code}\n`,
      'utf-8',
    );
  });

  paths
    .map(([ name, code ]) => [
      name,
      babel.transform(code, { presets: [ react, es2015, stage0 ], plugins: [ flow ] }).code,
    ])
    .forEach(arr => {
      let name = arr[0];
      let code = arr[1];
      fs.writeFileSync(
        path.join(options.output, 'src/', `${name}.js`),
        `${code}\n`,
        'utf-8',
      );
    });

  let indexFile = uniq(paths.map(arr => arr[0]))
    .map(name => `${name}: require('./src/${name}.js').default`)
    .join(',\n  ');

  indexFile = `// @flow\n\nmodule.exports = {\n  ${indexFile}\n}\n`;

  fs.writeFileSync(path.join(options.output, 'index.js'), indexFile, 'utf-8');

  fs.writeFileSync(
    path.join(options.output, 'package.json'),
    JSON.stringify(
      {
        name: options.name,
        description: 'auto-generater api from Swagger.json',
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

  fs.writeFileSync(
    path.join(options.output, 'bower.json'),
    JSON.stringify(
      {
        name: options.name,
        description: 'auto-generater api from Swagger.json',
        version: options.version,
        main: [ 'dist/index.js' ],
        license: 'MIT',
        ignore: [ 'node_modules', 'src', 'helpers', 'types' ],
      },
      null,
      2,
    ),
    'utf-8',
  );
};
