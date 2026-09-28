// Test-support only: finds top-level calls to a test file's own async
// functions that the file doesn't await.
//
// tests/run.mjs and tests/run-browser.mjs treat a file as finished when
// importing it resolves. A top-level `run();` or `run().catch(...)` lets the
// import resolve while run() is still working, so the file can end (Node's
// runner exits once nothing is left to wait on) with a pass before its later
// checks ever run. Both runners refuse such a file with this message instead.
//
// Only lines at column 0 are looked at: that is where a file's top-level code
// is in this repository, and where an indented call inside a function is
// never mistaken for one. Async functions are recognized as
// `async function name(` or `const name = async`.
const ASYNC_FUNCTION = /^(?:async function ([A-Za-z_$][\w$]*)\s*\(|(?:const|let) ([A-Za-z_$][\w$]*)\s*=\s*async\b)/gm;

// [{ line, name }] for each unawaited top-level call, in file order.
export function unawaitedTopLevelCalls(source) {
    const names = new Set();
    for (const match of source.matchAll(ASYNC_FUNCTION)) names.add(match[1] || match[2]);
    if (names.size === 0) return [];
    const calls = [];
    source.split('\n').forEach((text, index) => {
        const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(text);
        if (call && names.has(call[1])) calls.push({ line: index + 1, name: call[1] });
    });
    return calls;
}

// The runners' failure text for a file with such calls, or null.
export function describeUnawaitedTopLevelCalls(source) {
    const calls = unawaitedTopLevelCalls(source);
    if (calls.length === 0) return null;
    const where = calls.map(({ line, name }) => `line ${line}: ${name}()`).join(', ');
    return `starts async work at top level without awaiting it (${where}). The runner could end this file `
        + 'with a pass before that work finishes; write `await` in front of the call.';
}
