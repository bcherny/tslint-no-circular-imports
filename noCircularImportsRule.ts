import * as ts from 'typescript'
import * as Lint from 'tslint'
import { readFileSync } from 'fs'
import { basename, dirname, extname, resolve } from 'path'
import { IRuleMetadata } from 'tslint/lib/language/rule/rule'
import { TypedRule } from 'tslint/lib/language/rule/typedRule'

export class Rule extends TypedRule {
  static FAILURE_STRING = 'Circular import detected'

  static metadata: IRuleMetadata = {
    ruleName: 'no-circular-imports',
    description: 'Disallows circular imports.',
    rationale: Lint.Utils.dedent`
        Circular dependencies cause hard-to-catch runtime exceptions.`,
    optionsDescription: 'Not configurable.',
    options: null,
    optionExamples: ['true'],
    type: 'functionality',
    requiresTypeInfo: true,
    typescriptOnly: true
  }

  applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
    return this.applyWithWalker(new NoCircularImportsWalker(sourceFile, this.getOptions(), program))
  }
}

Rule.prototype.constructor = TypedRule

class NoCircularImportsWalker extends Lint.ProgramAwareRuleWalker {

  protected _program: ts.Program

  constructor(sourceFile: ts.SourceFile, options: Lint.IOptions, program: ts.Program) {
    super(sourceFile, options, program)
    this._program = program
  }

  async visitImportDeclaration(node: ts.ImportDeclaration) {

    const parent = node.parent as ts.SourceFile

    const thisModuleFileName = parent.fileName
    const fullThisModuleFileName = stripExt(resolve(thisModuleFileName))
    const importedFileName = (node.moduleSpecifier as any).text as string

    // this->A
    const dependencyGraph = new Map<string, Set<string>>()
    this.addToGraph(dependencyGraph, fullThisModuleFileName, importedFileName)

    // A->B, A->C, ..., A->n
    if (await this.hasCircularImport(importedFileName, dirname(thisModuleFileName), dependencyGraph)) {
      console.log('fail!', this.prettyCycle(fullThisModuleFileName, dependencyGraph))
      this.addFailure(
        this.createFailure(node.getStart(), node.getWidth(), `${Rule.FAILURE_STRING}: ${
          this.prettyCycle(fullThisModuleFileName, dependencyGraph)
        }`)
      )
    }

    super.visitImportDeclaration(node)
  }

  private prettyCycle(fullThisModuleFileName: string, dependencyGraph: Map<string, Set<string>>) {
    return this
      .getCycle(fullThisModuleFileName, dependencyGraph)
      .concat(fullThisModuleFileName)
      .map(_ => basename(_))
      .join(' -> ')
  }

  private async hasCircularImport(
    fileName: string,
    baseDir: string,
    dependencyGraph: Map<string, Set<string>>
  ): Promise<boolean> {
    const fullFileName = resolve(baseDir, fileName)
    const importedFileImports = await this.getImports(fullFileName)
    console.log('hasCircularImport', fileName, baseDir, fullFileName, importedFileImports)
    importedFileImports.forEach(_ =>
      this.addToGraph(dependencyGraph, fullFileName, resolve(baseDir, _))
    )

    if (this.hasCycle(dependencyGraph)) {
      return true
    }

    return importedFileImports.reduce((_p, _) =>
      this.hasCircularImport(_, baseDir, dependencyGraph)
    , Promise.resolve(false))
  }

  private async getImports(fileName: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      try {
        const options = this._program.getCompilerOptions()
        ts.resolveModuleName(fileName, fileName, options, TODO)
        const importedFileContents = readFileSync(fileName + '.ts', 'utf-8')

        console.log('getImports', fileName)
        const importedFileNode = ts.preProcessFile(importedFileContents, true, true)
        resolve(importedFileNode.importedFiles.map(_ => _.fileName))
      } catch (err) {
        console.log('err', err)
          reject(err)
      } // TODO: handle .tsx
    })
  }

  /**
   * TODO: don't rely on import name
   */
  private addToGraph(dependencyGraph: Map<string, Set<string>>, thisModuleName: string, importCanonicalName: string) {
    if (!dependencyGraph.get(thisModuleName)) {
      dependencyGraph.set(thisModuleName, new Set)
    }
    dependencyGraph.get(thisModuleName)!.add(importCanonicalName)
  }

  private hasCycle(dependencyGraph: Map<string, Set<string>>): boolean {
    return Array.from(dependencyGraph.keys()).some(_ =>
      this.getCycle(_, dependencyGraph).length > 0
    )
  }

  private getCycle(moduleName: string, dependencyGraph: Map<string, Set<string>>, accumulator: string[] = []): string[] {
    if (!dependencyGraph.get(moduleName)) return []
    if (accumulator.includes(moduleName)) return accumulator
    return Array.from(dependencyGraph.get(moduleName)!.values()).reduce((_prev, _) => {
      const c = this.getCycle(_, dependencyGraph, accumulator.concat(moduleName))
      return c.length ? c : []
    }, [] as string[])
  }

}

function stripExt(fileName: string): string {
  return fileName.replace(extname(fileName), '')
}