import * as ts from 'typescript'
import * as Lint from 'tslint/lib/lint'
import { readFile } from 'fs-promise'
import { basename, resolve } from 'path'

export class Rule extends Lint.Rules.AbstractRule {
  static FAILURE_STRING = 'Circular import detected'

  static metadata: Lint.IRuleMetadata = {
    ruleName: 'no-circular-imports',
    description: 'Disallows circular imports.',
    rationale: Lint.Utils.dedent`
        Circular dependencies cause hard-to-catch runtime exceptions.`,
    optionsDescription: 'Not configurable.',
    options: null,
    optionExamples: ['true'],
    type: 'functionality'
  }

  apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(new NoCircularImportsWalker(sourceFile, this.getOptions()))
  }
}

class NoCircularImportsWalker extends Lint.RuleWalker {

  async visitImportDeclaration(node: ts.ImportDeclaration) {

    const parent = node.parent as ts.SourceFile
    const importPath = (node.moduleSpecifier as any).text as string
    const importModule = (parent as any).resolvedModules[importPath]
    const importCanonicalName = importModule.resolvedFileName as string

    const thisModuleFileName = parent.fileName
    const importedFileName = (node.moduleSpecifier as any).text as string
    const fullImportedFileName = resolve(thisModuleFileName, importedFileName)
    const importedFileNode = await this.getImports(fullImportedFileName)

    console.log('imports', importedFileNode.importedFiles)


    debugger


    // add to import graph
    // this.addToGraph(thisModuleFileName, importCanonicalName)

    // check for cycles
    // if (this.hasCycle(thisModuleName)) {
    //   this.addFailure(
    //     this.createFailure(node.getStart(), node.getWidth(), `${Rule.FAILURE_STRING}: ${
    //       this.getCycle(thisModuleName).concat(thisModuleName).map(_ => basename(_)).join(' -> ')
    //     }`)
    //   )
    // }

    super.visitImportDeclaration(node)
  }

  private async getImports(fileName: string): Promise<string[]> {
    const importedFileContents = await readFile(fileName, 'utf-8')
    const importedFileNode = ts.preProcessFile(importedFileContents, true, true)
    console.log('importedFileNode', importedFileNode)
    return []
  }

  /**
   * TODO: don't rely on import name
   */
  // private addToGraph(thisModuleName: string, importCanonicalName: string) {
  //   if (!imports.get(thisModuleName)) {
  //     imports.set(thisModuleName, new Set)
  //   }
  //   imports.get(thisModuleName)!.add(importCanonicalName)
  // }

  // private hasCycle(moduleName: string): boolean {
  //   return this.getCycle(moduleName).length > 0
  // }

  // private getCycle(moduleName: string, accumulator: string[] = []): string[] {
  //   if (!imports.get(moduleName)) return []
  //   if (accumulator.includes(moduleName)) return accumulator
  //   return Array.from(imports.get(moduleName) !.values()).reduce((_prev, _) => {
  //     const c = this.getCycle(_, accumulator.concat(moduleName))
  //     return c.length ? c : []
  //   }, [] as string[])
  // }

}