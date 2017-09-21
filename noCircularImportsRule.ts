import { basename, resolve, dirname } from 'path'
import * as ts from 'typescript'
import * as Lint from 'tslint'

export class Rule extends Lint.Rules.AbstractRule {
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

  apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(new NoCircularImportsWalker(sourceFile, this.getOptions()))
  }
}

const imports = new Map<string, Set<string>>()

class NoCircularImportsWalker extends Lint.RuleWalker {

  visitImportDeclaration(node: ts.ImportDeclaration) {

    if (!node.parent || !ts.isSourceFile(node.parent)) {
      return
    }
    const thisFileName = node.parent.fileName
    const resolvedThisFileName = resolve(thisFileName)

    if (!ts.isStringLiteral(node.moduleSpecifier)) {
      return
    }
    const importFileName = node.moduleSpecifier.text

    // TODO: does TSLint expose an API for this? it would be nice to use TSC's
    // resolveModuleNames to avoid doing this ourselves, and get support for
    // roots defined in tsconfig.json.
    const resolvedImportFileName = isImportFromNPMPackage(importFileName)
      ? importFileName
      : resolve(dirname(thisFileName), importFileName + '.ts')

    // add to import graph
    this.addToGraph(resolvedThisFileName, resolvedImportFileName)

    // check for cycles
    if (this.hasCycle(resolvedThisFileName)) {
      this.addFailure(
        this.createFailure(node.getStart(), node.getWidth(), `${Rule.FAILURE_STRING}: ${
          this.getCycle(resolvedThisFileName).concat(resolvedThisFileName).map(_ => basename(_)).join(' -> ')
        }`)
      )
    }

    super.visitImportDeclaration(node)
  }

  /**
   * TODO: don't rely on import name
   */
  private addToGraph(thisFileName: string, importCanonicalName: string) {
    if (!imports.get(thisFileName)) {
      imports.set(thisFileName, new Set)
    }
    imports.get(thisFileName)!.add(importCanonicalName)
  }

  private hasCycle(moduleName: string): boolean {
    return this.getCycle(moduleName).length > 0
  }

  private getCycle(moduleName: string, accumulator: string[] = []): string[] {
    if (!imports.get(moduleName)) return []
    if (accumulator.includes(moduleName)) return accumulator
    return Array.from(imports.get(moduleName) !.values()).reduce((_prev, _) => {
      const c = this.getCycle(_, accumulator.concat(moduleName))
      return c.length ? c : []
    }, [] as string[])
  }

}

function isImportFromNPMPackage(filename: string) {
  return !(filename.startsWith('.') || filename.startsWith('/') || filename.startsWith('~'))
}
