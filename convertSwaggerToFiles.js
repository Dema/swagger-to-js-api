import fs from 'fs';
import path from 'path';
import pathObjToAST from './pathObjToAST';
import t from 'babel-types';
import babel from 'babel-core';
import { default as generate } from 'babel-generator';
import es2015 from 'babel-preset-es2015';
import flow from 'babel-plugin-transform-flow-strip-types';
import swaggerTypeToFlowType from './swaggerTypeToFlowType';
import { groupBy, uniq } from 'lodash';
import chalk from 'chalk';

export default function(swaggerObj, options) {
  const basePath = swaggerObj.basePath.replace(/\/$/, '');
  const operations = Object
    .keys(swaggerObj.paths)
    .filter(path => path !== 'parameters')
    .map(path => {
      // flatten the path objects into an array of pathObjects
      return Object
        .keys(swaggerObj.paths[path])
        .filter(path => path !== 'parameters')
        .map(method => {
          let config = swaggerObj.paths[path][method];
          config.method = method;
          config.path = basePath + path;

          // OperationId is used as a method name, so we need to sanitize it.
          config.operationId = config.operationId
            .replace(/ /g, '_')
            .replace(/\./g, '_');

          // Merge global and method-local parameters.
          config.parameters = Object.values(
            Object.assign(
              config.parameters || {},
              swaggerObj.paths[path].parameters || {},
            ),
          );

          return config;
        });
    })
    .reduce((soFar, current) => soFar.concat(current), []);

  const operationIds = groupBy(operations, 'operationId');
  const duplicatedOps = Object
    .keys(operationIds)
    .filter(key => operationIds[key].length > 1);

  if (duplicatedOps.length) {
    throw new Error(
      `
${chalk.red(
        `The Swagger JSON contains duplicate operationIds for different endpoints.
The following are duplicated:`,
      )}
${JSON.stringify(duplicatedOps, null, 2)}
    `,
    );
  }

  operations.forEach(pathObj => {
    if (!pathObj.summary && !pathObj.description) {
      console.warn(
        `${chalk.yellow(
          'WARNING:',
        )} Summary and discription missing for ${chalk.bold(
          pathObj.operationId,
        )}`,
      );
    }
  });

  fs.mkdirSync(path.join(options.output, 'src/'));
  fs.mkdirSync(path.join(options.output, 'helpers/'));
  fs.mkdirSync(path.join(options.output, 'types/'));
  fs.mkdirSync(path.join(options.output, 'dist/'));
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
      return Object.assign(swaggerObj.definitions[defName], { name: defName });
    })
    .map(typeDef => {
      let name = typeDef.name;
      let imports = [];
      return [ name, swaggerTypeToFlowType(typeDef, imports), imports ];
    })
    .map(tuple => {
      let name = tuple[0];
      let typeAst = tuple[1];
      let imports = uniq(tuple[2]);
      let mainExport = t.ExportNamedDeclaration(
        {
          type: 'TypeAlias',
          id: t.Identifier(name),
          typeParameters: null,
          right: typeAst,
        },
        [],
      );
      let program = t.Program(
        imports.map(name => {
          let importStatement = t.ImportDeclaration(
            [ t.ImportSpecifier(t.Identifier(name), t.Identifier(name)) ],
            t.StringLiteral(`./${name}`),
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
        `// @flow\n\n${code}`,
        'utf-8',
      );
    });

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
      `// @flow\n\nimport type {AjaxObject} from '../types/AjaxObject';\n${code}\n`,
      'utf-8',
    );
  });

  paths
    .map(([ name, code ]) => [
      name,
      babel.transform(code, { presets: [ es2015 ], plugins: [ flow ] }).code,
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
