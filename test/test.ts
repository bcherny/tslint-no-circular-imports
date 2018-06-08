import * as assert from 'assert'
import { exec } from 'child_process'
import { join } from 'path'
import * as Lint from 'tslint';

const tslintBin = join('..', 'node_modules', '.bin', 'tslint')
const tslintConfig = join('.', 'tslint.json')
const tslintFormat = 'json'
const tsFiles = `${join('.', '*.ts')} ${join('.', '*/*.ts')}`;
const tsconfig = join('.', 'tsconfig.json');

exec(`${tslintBin} -p ${tsconfig} -c ${tslintConfig} -r .. -t ${tslintFormat} ${tsFiles}`, { cwd: __dirname }, (error, stdout, stderr) => {
  // Only validate failures and names.
  const actual = (JSON.parse(stdout) as Lint.IRuleFailureJson[])
      .map(x => ({ failure: x.failure, name: x.name }))

  assert.deepEqual(actual, [
    // case1
    {
      failure: 'circular import detected: case1.ts -> case1.2.ts -> case1.ts',
      name: join(__dirname, 'case1.ts')
    },
    {
      failure: 'circular import detected: case1.1.ts -> case1.ts -> case1.1.ts',
      name: join(__dirname, 'case1.1.ts')
    },

    // case2
    {
      failure: 'circular import detected: case2/a.ts -> case2/b.ts -> case2/a.ts',
      name: join(__dirname, 'case2/a.ts')
    },

    // case3
    {
      failure: 'circular import detected: case3/a.ts -> case3/b.ts -> case3/a.ts',
      name: join(__dirname, 'case3/a.ts')
    },

    // case4
    {
      failure: 'circular import detected: case4/a.ts -> case4/index.ts -> case4/a.ts',
      name: join(__dirname, 'case4/a.ts')
    }
  ])
})
