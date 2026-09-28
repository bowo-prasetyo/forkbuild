// The test runners refuse a file that starts its own async work at top level
// without awaiting it: such a file can end with a pass before its later
// checks run. This drives the detector on sample sources, then runs
// tests/run.mjs on a scratch file to show the refusal end to end.
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unawaitedTopLevelCalls, describeUnawaitedTopLevelCalls } from './support/UnawaitedTopLevelWork.mjs';
import { assert } from './support/Assert.js';

const found = (source) => unawaitedTopLevelCalls(source).map(({ line, name }) => `${line}:${name}`).join();

// Found: a top-level call to the file's own async function, however it ends.
assert(found('async function run() {}\nrun();') === '2:run', 'a bare call is found');
assert(found('async function runTests() {}\nrunTests().catch((error) => {\n    process.exitCode = 1;\n});') === '2:runTests', '.catch() does not wait for it');
assert(found('async function main() {}\nmain().then(() => {});') === '2:main', '.then() does not either');
assert(found('const run = async () => {};\nrun();') === '2:run', 'an async arrow function counts');

// Not found: awaited calls, synchronous functions, calls inside functions,
// and calls to functions the file didn't declare async.
assert(found('async function run() {}\nawait run();') === '', 'an awaited call is fine');
assert(found('async function run() {}\nawait run().catch(() => {});') === '', 'an awaited .catch() is fine');
assert(found('function run() {}\nrun();') === '', 'a synchronous function finishes before the import does');
assert(found('async function run() {}\nasync function outer() {\n    run();\n}\nawait outer();') === '', 'an indented call inside a function is not top level');
assert(found('import { go } from "./x.js";\ngo();') === '', 'a call to something not declared async here is left alone');
assert(describeUnawaitedTopLevelCalls('async function run() {}\nawait run();') === null, 'nothing to say about a clean file');
const message = describeUnawaitedTopLevelCalls('async function run() {}\nrun();');
assert(message.includes('line 2: run()') && message.includes('await'), 'the message names the line and the fix');
console.log('✓ unawaited top-level async calls are found, and only those');

// End to end: run.mjs fails such a file without running it, even though
// the file itself would pass.
const testsDir = dirname(fileURLToPath(import.meta.url));
const scratch = `ZzUnawaitedScratch${process.pid}.test.js`;
writeFileSync(join(testsDir, scratch), 'async function run() {}\nrun();\n');
try {
    const result = spawnSync(process.execPath, [join(testsDir, 'run.mjs'), scratch], { encoding: 'utf8', timeout: 60_000 });
    assert(result.status === 1, `run.mjs exits 1 for the file (got ${result.status})`);
    assert(result.stdout.includes(`--- FAILED ${scratch}`) && result.stdout.includes('line 2: run()'), 'and says which call to await');
} finally {
    rmSync(join(testsDir, scratch), { force: true });
}
console.log('✓ run.mjs refuses a file that does not await its own tests');
