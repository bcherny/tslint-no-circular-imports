import { exec } from 'child_process'
import * as assert from 'assert'
import { join } from 'path'

import { Linter, Configuration } from 'tslint'

console.log(__dirname)

const tslintBin = join('..', 'node_modules', '.bin', 'tslint')
const tslintConfig = join('.', 'tslint.json')
const tsFiles = join('.', '*.ts');

exec(`${tslintBin} -c ${tslintConfig} -r .. ${tsFiles}`, { cwd: __dirname }, (error, stdout, stderr) => {
  assert.equal(stdout, `
ERROR: case1.ts[1, 1]: circular import detected: case1.ts -> case1.1.ts -> case1.ts
ERROR: case1.ts[2, 1]: circular import detected: case1.ts -> case1.2.ts -> case1.ts

`)
})

const config = Configuration.findConfiguration(join(__dirname, tslintConfig)).results
function lintFile(fileName: string, content: string) {
  const linter = new Linter({ fix: false })
  linter.lint(fileName, content, config)
  return linter.getResult()
}

assert.equal(lintFile('./a.ts', 'import "./b"\nimport "./c"').errorCount, 0)
assert.equal(lintFile('./b.ts', 'import "./a"').errorCount, 1)
assert.equal(lintFile('./b.ts', '').errorCount, 0)
assert.equal(lintFile('./a.ts', 'import "./b"').errorCount, 0)