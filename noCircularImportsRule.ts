import { relative, sep } from 'path'
import * as Lint from 'tslint'
import * as ts from 'typescript'

interface Options {
  /** @internal */
  compilerOptions: ts.CompilerOptions

   /** @internal */
  rootDir: string

  /**
   * Maximum search depth to check for in generating a list of all cycles.
   */
  searchDepthLimit: number
}

const OPTION_SEARCH_DEPTH_LIMIT = 'search-depth-limit'
const OPTION_SEARCH_DEPTH_LIMIT_DEFAULT = 50

export class Rule extends Lint.Rules.TypedRule {
  static FAILURE_STRING = 'circular import detected'

  static metadata: Lint.IRuleMetadata = {
    ruleName: 'no-circular-imports',
    description: 'Disallows circular imports.',
    rationale: Lint.Utils.dedent`
        Circular dependencies cause hard-to-catch runtime exceptions.`,
    optionsDescription: Lint.Utils.dedent`
      A single argument, ${OPTION_SEARCH_DEPTH_LIMIT}, may be provided, and defaults to ${OPTION_SEARCH_DEPTH_LIMIT_DEFAULT}.
      It limits the depth of cycle reporting to a fixed size limit for a list of files.
      This helps improve performance, as most cycles do not surpass a few related files.
    `,
    options: {
      properties: {
        [OPTION_SEARCH_DEPTH_LIMIT]: {
          type: 'number'
        }
      },
      type: 'object'
    },
    optionExamples: [
      ['true'],
      ['true', { [OPTION_SEARCH_DEPTH_LIMIT]: 50 }]
    ],
    type: 'functionality',
    typescriptOnly: false
  }

  applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
    const resolvedFile = sourceFile.fileName
    imports.delete(resolvedFile)

    const compilerOptions = program.getCompilerOptions()
    const ruleArguments = this.ruleArguments[0] || {}

    return this.applyWithFunction(
      sourceFile,
      walk,
      {
        compilerOptions,
        rootDir: compilerOptions.rootDir || process.cwd(),
        searchDepthLimit: ruleArguments['search-depth-limit'] || OPTION_SEARCH_DEPTH_LIMIT
      },
      program.getTypeChecker())
  }
}

// Graph of imports.
const imports = new Map<string, Map<string, ts.Node>>()
// Keep a list of found circular dependencies to avoid showing them twice.
const found = new Set<string>()
const nodeModulesRe = new RegExp(`\\${sep}node_modules\\${sep}`)

function walk(context: Lint.WalkContext<Options>) {
  // Instead of visiting all children, this is faster. We know imports are statements anyway.
  context.sourceFile.statements.forEach(statement => {
    // export declarations seem to be missing from the current SyntaxWalker
    if (ts.isExportDeclaration(statement)) {
        visitImportOrExportDeclaration(statement)
    } else if (ts.isImportDeclaration(statement)) {
        visitImportOrExportDeclaration(statement)
    }
  })

  const fileName = context.sourceFile.fileName

  // Check for cycles, remove any cycles that have been found already (otherwise we'll report
  // false positive on every files that import from the real cycles, and users will be driven
  // mad).
  // The checkCycle is many order of magnitude faster than getCycle, but does not keep a history
  // of the cycle itself. Only get the full cycle if we found one.
  if (checkCycle(fileName)) {
    const allCycles = getAllCycles(fileName)

    for (const maybeCycle of allCycles) {
      // Slice the array so we don't match this file twice.
      if (maybeCycle.slice(1, -1).some(fileName => found.has(fileName))) {
          continue
      }
      maybeCycle.forEach(x => found.add(x))
      const node = imports.get(fileName) !.get(maybeCycle[1]) !

      context.addFailureAt(node.getStart(), node.getWidth(), Rule.FAILURE_STRING + ': ' + maybeCycle
          .concat(fileName)
          .map(x => relative(context.options.rootDir, x))
          .join(' -> '))
    }
  }

  function visitImportOrExportDeclaration(node: ts.ImportDeclaration | ts.ExportDeclaration) {
    if (!node.parent || !ts.isSourceFile(node.parent)) {
      return
    }
    if (!node.moduleSpecifier) {
      return
    }
    if (!ts.isSourceFile(node.parent)) {
      return
    }
    const fileName = node.parent.fileName

    if (!ts.isStringLiteral(node.moduleSpecifier)) {
      return
    }
    const importFileName = node.moduleSpecifier.text

    const resolved = ts.resolveModuleName(importFileName, fileName, context.options.compilerOptions, ts.sys)
    if (!resolved || !resolved.resolvedModule) {
      return
    }
    const resolvedImportFileName = resolved.resolvedModule.resolvedFileName

    // Skip node modules entirely. We use this after resolution to support path mapping in the
    // tsconfig.json (which could override imports from/to node_modules).
    if (nodeModulesRe.test(resolvedImportFileName)) {
      return
    }

    addToGraph(fileName, resolvedImportFileName, node)
  }

  function getAllCycles(moduleName: string, accumulator: string[] = [], iterationDepth = 0): string[][] {
    const moduleImport = imports.get(moduleName)
    if (!moduleImport) return []
    if (accumulator.indexOf(moduleName) !== -1)
      return [accumulator]

    if (iterationDepth >= context.options.searchDepthLimit)
      return []

    const all: string[][] = []
    for (const imp of Array.from(moduleImport.keys())) {
      const c = getAllCycles(imp, accumulator.concat(moduleName), iterationDepth + 1)

      if (c.length)
        all.push(...c)
    }

    return all
  }
}

function addToGraph(thisFileName: string, importCanonicalName: string, node: ts.Node) {
  let i = imports.get(thisFileName)
  if (!i) {
    imports.set(thisFileName, i = new Map)
  }
  i.set(importCanonicalName, node)
}

function checkCycle(moduleName: string): boolean {
  const accumulator = new Set<string>()

  const moduleImport = imports.get(moduleName)
  if (!moduleImport)
    return false

  const toCheck = Array.from(moduleImport.keys())
  for (let i = 0; i < toCheck.length; i++) {
    const current = toCheck[i]
    if (current === moduleName) {
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
