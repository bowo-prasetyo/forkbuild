// Runs the test files that need a real browser (Web Audio, media tracks
// over WebRTC) in headless Chromium. A file opts in by starting with the
// line `// @environment browser`; tests/run.mjs runs every other file
// under Node. Each browser test must finish its work before its module
// finishes evaluating (a top-level `await runTests()`), so the file
// passes exactly when `await import(file)` resolves in the page.
//
//   npm run test:browser                  run every browser test
//   npm run test:browser -- Voice         run files whose name contains a filter
//
// Chromium comes from `npx playwright-core install chromium`, or from the
// executable named by the CHROMIUM_PATH environment variable.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const testsDir = join(root, 'tests');
const TIMEOUT_MS = 180_000;
const BROWSER_MARKER = '// @environment browser';

function isBrowserTest(fileName) {
    return readFileSync(join(testsDir, fileName), 'utf8').startsWith(BROWSER_MARKER);
}

const MIME_TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };

const RUNNER_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script type="importmap">
{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }
</script>
</head><body></body></html>`;

function startServer() {
    const server = createServer(async (request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path === '/__runner.html') {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(RUNNER_PAGE);
            return;
        }
        const filePath = normalize(join(root, path));
        if (!filePath.startsWith(root)) {
            response.writeHead(403).end();
            return;
        }
        try {
            const body = await readFile(filePath);
            response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function runFile(browser, baseUrl, name) {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    const output = [];
    page.on('console', (message) => output.push(message.text()));
    page.on('pageerror', (error) => output.push(`pageerror: ${error.stack || error.message}`));
    const started = Date.now();
    try {
        await page.goto(`${baseUrl}/__runner.html`);
        const error = await page.evaluate(async ({ file, timeoutMs }) => {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs));
            try {
                await Promise.race([import(file), timeout]);
                return null;
            } catch (e) {
                return String((e && e.stack) || e);
            }
        }, { file: `/tests/${name}`, timeoutMs: TIMEOUT_MS });
        if (error) output.push(error);
        return { name, ok: error === null, ms: Date.now() - started, output: output.join('\n') };
    } finally {
        await context.close();
    }
}

const filters = process.argv.slice(2);
const files = readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.js') && isBrowserTest(name))
    .filter((name) => filters.length === 0 || filters.some((f) => name.includes(f)))
    .sort();

const server = await startServer();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const results = [];
const started = Date.now();
try {
    // One file at a time: several of these open real peer connections and
    // audio devices, and running them side by side makes timing flaky.
    for (const name of files) {
        const result = await runFile(browser, baseUrl, name);
        results.push(result);
        process.stdout.write(result.ok ? '.' : 'F');
    }
} finally {
    await browser.close();
    server.close();
}
process.stdout.write('\n');

const failed = results.filter((r) => !r.ok);
for (const r of failed) {
    console.log(`\n--- FAILED ${r.name} (browser)\n${r.output.trimEnd().split('\n').slice(-30).join('\n')}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} browser files in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exitCode = failed.length > 0 ? 1 : 0;
