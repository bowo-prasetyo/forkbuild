// Runs every tests/*.test.js file in its own Node process, in parallel,
// and exits non-zero if any file fails. Each test file is a standalone
// script that throws on its first failed assertion, so a file passes
// exactly when its process exits 0. Files that start with
// `// @environment browser` need a real browser and are run by
// tests/run-browser.mjs instead.
//
//   npm run test:node                   run every Node test
//   npm run test:node -- Avatar Peer    run files whose name contains a filter
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const testsDir = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 180_000;
const BROWSER_MARKER = '// @environment browser';
// Gives every file Vue and WebRTC, and ends each process when its test
// does (see those files' headers).
const PRELOAD = join(testsDir, 'support', 'NodePreload.mjs');
const RUN_TEST_FILE = join(testsDir, 'support', 'RunTestFile.mjs');
const OUTPUT_TAIL_LINES = 30;

const filters = process.argv.slice(2);
const files = readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.js'))
    .filter((name) => !readFileSync(join(testsDir, name), 'utf8').startsWith(BROWSER_MARKER))
    .filter((name) => filters.length === 0 || filters.some((f) => name.includes(f)))
    .sort();

function runFile(name) {
    return new Promise((resolve) => {
        const started = Date.now();
        const child = spawn(process.execPath, ['--import', PRELOAD, RUN_TEST_FILE, join(testsDir, name)], { cwd: join(testsDir, '..') });
        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk; });
        child.stderr.on('data', (chunk) => { output += chunk; });
        const timer = setTimeout(() => {
            output += `\n[run.mjs] timed out after ${TIMEOUT_MS / 1000}s`;
            child.kill('SIGUSR2');
            setTimeout(() => child.kill('SIGKILL'), 1000);
        }, TIMEOUT_MS);
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ name, ok: code === 0, ms: Date.now() - started, output });
        });
    });
}

// Files that open real WebRTC connections run one at a time after the
// rest: ICE negotiation has timeouts, and under a full parallel load
// libdatachannel's handshakes can miss them.
const REAL_PEER_CONNECTION = /WebRtcPeerConnectionProvider|new PeerSessionManager|RTCPeerConnectionImpl|new WebRtcPeerConnection\b/;
const opensPeerConnections = (name) => REAL_PEER_CONNECTION.test(readFileSync(join(testsDir, name), 'utf8'));

const results = [];
async function runPool(names, concurrency) {
    const queue = [...names];
    async function worker() {
        while (queue.length > 0) {
            const result = await runFile(queue.shift());
            results.push(result);
            process.stdout.write(result.ok ? '.' : 'F');
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
}
const started = Date.now();
await runPool(files.filter((name) => !opensPeerConnections(name)), availableParallelism());
await runPool(files.filter(opensPeerConnections), 1);
process.stdout.write('\n');

const failed = results.filter((r) => !r.ok).sort((a, b) => a.name.localeCompare(b.name));
for (const r of failed) {
    const tail = r.output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');
    console.log(`\n--- FAILED ${r.name}\n${tail}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} files in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exitCode = failed.length > 0 ? 1 : 0;
