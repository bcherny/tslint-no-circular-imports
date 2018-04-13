import { exec } from 'child_process'
import * as assert from 'assert'
import { join } from 'path'

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
