import { relative, sep } from 'path';
import * as Lint from 'tslint';
import { IOptions } from 'tslint/lib/language/rule/rule';
import * as ts from 'typescript';

export class Rule extends Lint.Rules.TypedRule {
  static FAILURE_STRING = 'circular import detected'

  static metadata: Lint.IRuleMetadata = {
    ruleName: 'no-circular-imports',
    description: 'Disallows circular imports.',
    rationale: Lint.Utils.dedent`
        Circular dependencies cause hard-to-catch runtime exceptions.`,
    optionsDescription: 'Not configurable.',
    options: null,
    optionExamples: ['true'],
    type: 'functionality',
    typescriptOnly: false
  }

  applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
    const resolvedFile = sourceFile.fileName
    imports.delete(resolvedFile)

    const walker = new NoCircularImportsWalker(sourceFile, this.getOptions(), program)

    return this.applyWithWalker(walker)
  }
}

// Graph of imports.
const imports = new Map<string, Set<string>>()
// Keep a list of found circular dependencies to avoid showing them twice.
const found = new Set<string>()
const nodeModulesRe = new RegExp(`\\${sep}node_modules\\${sep}`)

class NoCircularImportsWalker extends Lint.RuleWalker {
  constructor(sourceFile: ts.SourceFile, options: IOptions, private program: ts.Program) {
    super(sourceFile, options)
  }

  visitNode(node: ts.Node) {
    // export declarations seem to be missing from the current SyntaxWalker
    if (ts.isExportDeclaration(node)) {
      this.visitExportDeclaration(node)
      this.walkChildren(node)
    }
    else {
      super.visitNode(node)
    }

  }

  visitExportDeclaration(node: ts.ExportDeclaration) {
    this.visitImportOrExportDeclaration(node)
  }

  visitImportDeclaration(node: ts.ImportDeclaration) {
    this.visitImportOrExportDeclaration(node)
    super.visitImportDeclaration(node)
  }

  visitImportOrExportDeclaration(node: ts.ImportDeclaration | ts.ExportDeclaration) {
    if (!node.parent || !ts.isSourceFile(node.parent)) {
      return
    }
    if(!node.moduleSpecifier) {
      return
    }
    const fileName = node.parent.fileName

    if (!ts.isStringLiteral(node.moduleSpecifier)) {
      return
    }
    const importFileName = node.moduleSpecifier.text
    const compilerOptions = this.program.getCompilerOptions()

    const resolved = ts.resolveModuleName(importFileName, fileName, compilerOptions, ts.sys)
    if (!resolved || !resolved.resolvedModule) {
      return
    }
    const resolvedImportFileName = resolved.resolvedModule.resolvedFileName

    // Skip node modules entirely. We use this after resolution to support path mapping in the
    // tsconfig.json (which could override imports from/to node_modules).
    if (nodeModulesRe.test(resolvedImportFileName)) {
      return
    }

    this.addToGraph(fileName, resolvedImportFileName)

    // Check for cycles, remove any cycles that have been found already (otherwise we'll report
    // false positive on every files that import from the real cycles, and users will be driven
    // mad).
    const maybeCycle = this.getCycle(fileName, resolvedImportFileName)
    if (maybeCycle.length > 0) {
      // Slice the array so we don't match this file twice.
      if (maybeCycle.slice(1).some(fn => found.has(fn))) {
        return
      }

      maybeCycle.forEach(x => found.add(x))

      this.addFailureAt(
        node.getStart(),
        node.getWidth(),
        `${Rule.FAILURE_STRING}: ${
          maybeCycle
            .concat(fileName)
            // Show relative to baseUrl (or the tsconfig path itself).
            .map(x => relative(compilerOptions.rootDir || process.cwd(), x))
            .join(' -> ')
        }`)
    }
  }

  private addToGraph(thisFileName: string, importCanonicalName: string) {
    let i = imports.get(thisFileName)
    if (!i) {
      imports.set(thisFileName, i = new Set)
    }
    i.add(importCanonicalName)
  }

  private getCycle(moduleName: string, startFromImportName?: string | undefined, accumulator: string[] = []): string[] {
    const moduleImport = imports.get(moduleName)
    if (!moduleImport) return []
    if (accumulator.indexOf(moduleName) !== -1) return accumulator

    if(startFromImportName !== undefined && imports.has(startFromImportName)) {
      const c = this.getCycle(startFromImportName, undefined, accumulator.concat(moduleName))
      if(c.length) return c
    }
    else {
      for (const imp of Array.from(moduleImport.values())) {
        const c = this.getCycle(imp, undefined, accumulator.concat(moduleName))
        if(c.length) return c
      }
    }

    return []
  }
}
