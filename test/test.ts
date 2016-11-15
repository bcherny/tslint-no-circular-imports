import { exec } from 'child_process'
import * as assert from 'assert'

console.log(__dirname)

exec('../node_modules/.bin/tslint -c ./tslint.json -r ../ ./*.ts', { cwd: __dirname }, (error, stdout, stderr) => {
  assert.equal(stdout, `case1.ts[1, 1]: Circular import detected: case1.ts -> case1.1.ts -> case1.ts
case1.ts[2, 1]: Circular import detected: case1.ts -> case1.2.ts -> case1.ts
`)
})
