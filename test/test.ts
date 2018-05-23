import 'mocha';
import * as assert from 'assert'
import { exec } from 'child_process'
import { join } from 'path'
import * as Lint from 'tslint';

const tslintBin = join('..', 'node_modules', '.bin', 'tslint')
const tslintConfig = join('.', 'tslint.json')
const tslintFormat = 'json'
const tsconfig = join('.', 'tsconfig.json');

/**
 * exec tslint and return errors as json
 */
function run(filename: string, cb: (result: { failure: string, name: string }[]) => void) {
  return (done: MochaDone) => {
    exec(`${tslintBin} -p ${tsconfig} -c ${tslintConfig} -r .. -t ${tslintFormat} ${filename}`, { cwd: __dirname }, (_error, stdout, _stderr) => {
      try {
        const result = (JSON.parse(stdout) as Lint.IRuleFailureJson[])
          .map(x => ({ failure: x.failure, name: x.name }));
        cb(result);
        done();
      } catch (err) {
        done(err);
      }
    });
  }
}

describe('test.ts', () => {
  it('case1', run('*.ts', value => {
    assert.deepEqual(value, [
      {
        failure: 'circular import detected: case1.ts -> case1.2.ts -> case1.ts',
        name: join(__dirname, 'case1.ts')
      },
      {
        failure: 'circular import detected: case1.1.ts -> case1.ts -> case1.1.ts',
        name: join(__dirname, 'case1.1.ts')
      },
    ]);
  }));

  it('case2', run('case2/*.ts', value => {
    assert.deepEqual(value, [
      {
        failure: 'circular import detected: case2/a.ts -> case2/b.ts -> case2/a.ts',
        name: join(__dirname, 'case2/a.ts')
      },
    ]);
  }));

  it('case3', run('case3/*.ts', value => {
    assert.deepEqual(value, [
      {
        failure: 'circular import detected: case3/a.ts -> case3/b.ts -> case3/a.ts',
        name: join(__dirname, 'case3/a.ts')
      },
    ]);
  }));

  it('case4', run('case4/*.ts', value => {
    assert.deepEqual(value, [
      {
        failure: 'circular import detected: case4/a.ts -> case4/index.ts -> case4/a.ts',
        name: join(__dirname, 'case4/a.ts')
      }
    ]);
  }));
});
