// Test-support only: how tests/run.mjs starts one test file (after
// NodePreload.mjs). It imports the file, then makes sure the process ends
// when the test does.
//
// libdatachannel's native threads can keep a process alive after every
// connection has closed and the test has finished; its own cleanup can
// deadlock. So once nothing can run again (no JavaScript handles or timers
// left and no open peer connection), this exits the way Node itself would
// have: with the test's own exit status, or 13 if the file's top-level
// await never settled.
import { pathToFileURL } from 'node:url';

const connections = globalThis[Symbol.for('forkbuild.tests.peerConnections')] || new Set();
let settled = false;

// What is open before the test starts (stdout/stderr pipes when run by
// tests/run.mjs) never counts as the test still working.
const baseline = process.getActiveResourcesInfo();
function testResources() {
    const remaining = [...baseline];
    return process.getActiveResourcesInfo().filter((resource) => {
        const i = remaining.indexOf(resource);
        if (i === -1) return true;
        remaining.splice(i, 1);
        return false;
    });
}

const idleCheck = setInterval(() => {
    if (testResources().length > 0) return;
    for (const ref of connections) {
        const connection = ref.deref();
        if (connection && connection.connectionState !== 'closed') return;
    }
    process.exit(settled ? (process.exitCode ?? 0) : 13);
}, 1000);
idleCheck.unref();

// tests/run.mjs sends SIGUSR2 before killing a timed-out test: report
// what is still keeping it alive.
process.on('SIGUSR2', () => {
    const states = [...connections].map((ref) => ref.deref()).filter(Boolean).map((c) => c.connectionState);
    process.stderr.write(`[RunTestFile] still running: settled=${settled} resources=${JSON.stringify(testResources())} peerConnections=${JSON.stringify(states)}\n`);
});

await import(pathToFileURL(process.argv[2]).href);
settled = true;
