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
const imports = new Map<string, Map<string, ts.Node>>()
// Keep a list of found circular dependencies to avoid showing them twice.
const found = new Set<string>()
const nodeModulesRe = new RegExp(`\\${sep}node_modules\\${sep}`)

class NoCircularImportsWalker extends Lint.RuleWalker {
  constructor(sourceFile: ts.SourceFile, options: IOptions, private program: ts.Program) {
    super(sourceFile, options)
  }

  visitSourceFile(sourceFile: ts.SourceFile) {
    // Instead of visiting all children, this is faster. We know imports are statements anyway.
    sourceFile.statements.forEach(statement => {
      // export declarations seem to be missing from the current SyntaxWalker
      if (ts.isExportDeclaration(statement)) {
          this.visitImportOrExportDeclaration(statement)
      }
      else if (ts.isImportDeclaration(statement)) {
          this.visitImportOrExportDeclaration(statement)
      }
    })

    const fileName = sourceFile.fileName

    // Check for cycles, remove any cycles that have been found already (otherwise we'll report
    // false positive on every files that import from the real cycles, and users will be driven
    // mad).
    // The checkCycle is many order of magnitude faster than getCycle, but does not keep a history
    // of the cycle itself. Only get the full cycle if we found one.
    if (this.checkCycle(fileName)) {
      const allCycles = this.getAllCycles(fileName)

      for (const maybeCycle of allCycles) {
        // Slice the array so we don't match this file twice.
        if (maybeCycle.slice(1, -1).some(fileName => found.has(fileName))) {
            continue
        }
        maybeCycle.forEach(x => found.add(x))
        const node = imports.get(fileName) !.get(maybeCycle[1]) !

        const compilerOptions = this.program.getCompilerOptions()
        this.addFailureAt(node.getStart(), node.getWidth(), Rule.FAILURE_STRING + ": " + maybeCycle
            .concat(fileName)
            .map(x => relative(compilerOptions.rootDir || process.cwd(), x))
            .join(' -> '))
      }
    }
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

    this.addToGraph(fileName, resolvedImportFileName, node)
  }

  private addToGraph(thisFileName: string, importCanonicalName: string, node: ts.Node) {
    let i = imports.get(thisFileName)
    if (!i) {
      imports.set(thisFileName, i = new Map)
    }
    i.set(importCanonicalName, node)
  }

  private checkCycle(moduleName: string): boolean {
    const accumulator = new Set<string>()

    const moduleImport = imports.get(moduleName)
    if (!moduleImport)
      return false

    const toCheck = Array.from(moduleImport.keys())
    for (let i = 0; i < toCheck.length; i++) {
      const current = toCheck[i]
      if (current == moduleName) {
        return true
      }
      accumulator.add(current)

      toCheck.push(
        ...Array.from((imports.get(current) || new Map).keys())
                .filter(i => !accumulator.has(i))
      )
    }

    return false
  }

  private getAllCycles(moduleName: string, accumulator: string[] = []): string[][] {
    const moduleImport = imports.get(moduleName)
    if (!moduleImport) return []
    if (accumulator.indexOf(moduleName) !== -1)
      return [accumulator]

    const all: string[][] = []
    for (const imp of Array.from(moduleImport.keys())) {
      const c = this.getAllCycles(imp, accumulator.concat(moduleName))

      if (c.length)
        all.push(...c)
    }

    return all
  }
}
