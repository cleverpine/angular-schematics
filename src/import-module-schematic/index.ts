import {
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
  chain
} from '@angular-devkit/schematics';
import * as ts from 'typescript';

/**
 * Function to import a module and add it to the imports of the NgModule
 * @param options Options containing the module name and path
 */
export function importAndAddModule(options: { module: string, import: string, from: string }): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    
    const locationPath = options.module;
    const text = tree.read(locationPath);
    if (text === null) {
      throw new SchematicsException(`File ${locationPath} does not exist.`);
    }
    const sourceText = text.toString('utf-8');
    const sourceFile = ts.createSourceFile(locationPath, sourceText, ts.ScriptTarget.Latest, true);

    // Check if import statement already exists
    const alreadyImported = sourceFile.statements.some(st => 
      ts.isImportDeclaration(st) &&
      st.moduleSpecifier.getText(sourceFile) === `'${options.from}'` &&
      st.importClause?.namedBindings?.getText(sourceFile) === `{ ${options.import} }`
    );

    const importRecorder = tree.beginUpdate(locationPath);
    if (!alreadyImported) {
      // Find the last import statement and get its end position
      const lastImport = sourceFile.statements.filter(ts.isImportDeclaration).pop();
      const insertPosition = lastImport ? lastImport.getEnd() : 0;

      // Add the import statement at the correct position
      const importStatement = `\nimport { ${options.import} } from '${options.from}';\n`;
      importRecorder.insertLeft(insertPosition, importStatement);
    }

    // Find the NgModule decorator and update the imports array
    const ngModuleDecorator = findNgModuleDecorator(sourceFile);
    if (ngModuleDecorator) {
      const importsArray = findImportsArray(ngModuleDecorator);
      if (importsArray && ts.isArrayLiteralExpression(importsArray)) {
        if (!importsArray.elements.some(el => el.getText(sourceFile) === options.import)) {
          const lastImport = importsArray.elements[importsArray.elements.length - 1];
          const insertPosition = lastImport.getEnd();
          // Add the module import on a new line within the imports array
          importRecorder.insertRight(insertPosition, `,\n    ${options.import}`);
        }
      }
    }

    tree.commitUpdate(importRecorder);

    return tree;
  };
}



/**
 * Find the NgModule decorator from a source file
 * @param sourceFile TypeScript source file
 */
function findNgModuleDecorator(sourceFile: ts.SourceFile): ts.Decorator | undefined {
  let ngModuleDecorator: ts.Decorator | undefined;

  const visitNode = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const decorators = ts.getDecorators(node);
      for (const decorator of decorators || []) {
        const callExpression = decorator.expression;
        if (ts.isCallExpression(callExpression) &&
            ts.isIdentifier(callExpression.expression) &&
            callExpression.expression.text === 'NgModule') {
          ngModuleDecorator = decorator;
          return; // Stop searching further
        }
      }
    }

    ts.forEachChild(node, visitNode); // Continue searching in child nodes
  };

  visitNode(sourceFile);

  return ngModuleDecorator;
}

/**
 * Find the imports array within the NgModule decorator
 * @param decorator NgModule decorator
 */
function findImportsArray(decorator: ts.Decorator): ts.Node | undefined {
  if (!ts.isCallExpression(decorator.expression)) {
    return undefined;
  }
  const argument = decorator.expression.arguments[0];
  if (!ts.isObjectLiteralExpression(argument)) {
    return undefined;
  }
  const importsProperty = argument.properties
    .filter(ts.isPropertyAssignment)
    .find(p => ts.isIdentifier(p.name) && p.name.text === 'imports');
  return importsProperty ? importsProperty.initializer : undefined;
}

/**
 * Main function for the schematic
 */
export function main(options: { module : string, import: string, from: string }): Rule {
  console.log('Adding module to core module');
  return chain([
    importAndAddModule(options)
  ]);
}
