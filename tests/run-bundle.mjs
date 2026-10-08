// Builds the site GitHub Pages publishes (scripts/build.mjs) and opens it in
// headless Chromium, so a bundling problem fails here rather than on the live
// site. The other tests run the unbundled source; this is the one check of
// what is actually published.
//
//   npm run test:bundle
//
// Two builds: the one published, whose every page must open and render with
// no page error (and no Vue warning, which production Vue never prints: one
// means a second copy of Vue got in), and one with Vue's development build,
// whose every page must open with no Vue warning (an injection bundling lost
// shows up as one).
// Every page the router defines is opened, straight from its URL. Only this
// origin is reachable: every other host fails to resolve, so the app's
// network features fail as they do offline, and those failures are ignored.
//
// Chromium comes from `npx playwright-core install chromium`, or from the
// executable named by the CHROMIUM_PATH environment variable.
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from '../scripts/build.mjs';
import { assert } from './support/Assert.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const MIME_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// Console errors from the network features failing offline, not from the page.
const NETWORK_NOISE = /net::|WebSocket|Failed to load resource|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError/i;

function serve(dir) {
    const server = createServer(async (request, response) => {
        let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = normalize(join(dir, path));
        if (!file.startsWith(dir)) return response.writeHead(403).end();
        try {
            const body = await readFile(file);
            response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file)] || 'application/octet-stream' });
            response.end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Every route the router defines, with each parameter filled in.
function routePaths() {
    const source = readFileSync(join(root, 'ui/router/index.js'), 'utf8');
    return [...new Set([...source.matchAll(/\{\s*path:\s*'([^']+)'/g)].map((m) => m[1].replace(/:[A-Za-z]+/g, 'bundle-test')))];
}

async function openEveryPage(browser, base, paths) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = [];
    const warnings = [];
    const requested = [];
    let current = '/';
    page.on('pageerror', (error) => problems.push(`${current}: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error' && !NETWORK_NOISE.test(message.text())) problems.push(`${current}: ${message.text()}`);
        if (message.type() === 'warning' && message.text().includes('[Vue warn]')) warnings.push(`${current}: ${message.text().split('\n')[0]}`);
    });
    page.on('request', (request) => requested.push(request.url()));

    await page.goto(`${base}/#/`);
    await page.waitForSelector('.home-view', { timeout: 60_000 });
    const homeRequests = [...requested];
    for (const path of paths) {
        current = path;
        await page.evaluate((hash) => { location.hash = hash; }, `#${path}`);
        await page.waitForFunction((hash) => location.hash === hash && document.querySelector('#app main > *'), `#${path}`, { timeout: 60_000 });
        await page.waitForTimeout(300);
    }
    await context.close();
    return { problems, warnings, homeRequests };
}

// The ready-made builds, in the published build: Home's main button opens
// the house as a document of the visitor's own (and the address goes back to
// plain /editor), the Editor's New opens the castle, and the Repository lists
// all six.
async function startFromHome(browser, base) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto(`${base}/#/`);
        await page.waitForSelector('.featured-build-card', { timeout: 60_000 });
        assert(await page.locator('.featured-build-card').count() === 6, 'Home shows its six ready-made builds');
        await page.click('.home-cta-primary');
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'House', null, { timeout: 60_000 });
        await page.waitForFunction(() => location.hash === '#/editor', null, { timeout: 10_000 });
        const editorText = await page.evaluate(() => document.body.innerText);
        assert(editorText.includes('village:house'), 'the Editor says the copy came from the built-in House');

        // New offers the same builds: the castle opens as the visitor's own copy.
        await page.click('.toolbar-new');
        await page.waitForSelector('.new-document-build[data-structure-id="showcase:castle"]', { timeout: 30_000 });
        await page.click('.new-document-build[data-structure-id="showcase:castle"]');
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'Castle', null, { timeout: 30_000 });
        assert(!(await page.$('.new-document-dialog')), 'New closes once a build is chosen');

        // The Repository offers them before anything is published or found.
        await page.evaluate(() => { location.hash = '#/repository'; });
        await page.waitForSelector('.featured-builds-shelf .featured-build-card', { timeout: 60_000 });
        assert(await page.locator('.featured-builds-shelf .featured-build-card').count() === 6, 'the Repository shows the six ready-made builds');
    } finally {
        await context.close();
    }
}

const outdir = mkdtempSync(join(tmpdir(), 'forkbuild-bundle-'));
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // Only this machine resolves: the app's network features fail as offline.
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']
});
const servers = [];
try {
    const paths = routePaths();
    assert(paths.length > 30 && paths.includes('/editor'), `the router's pages are found (${paths.length})`);

    const published = await build(join(outdir, 'published'));
    const html = readFileSync(join(published.outdir, 'index.html'), 'utf8');
    assert(html.includes(`<script type="module" src="${published.entry}">`) && published.entry.startsWith('bundle/'), 'index.html loads the bundle');
    assert(!html.includes('importmap') && !/'sha256-/.test(html), 'the published index.html has no import map, and no hash for one');
    assert(html.includes(`href="${published.stylesheet}"`), 'index.html loads the bundled stylesheet');
    assert(published.firstLoadFiles < 150, `the first load is a few dozen files, not hundreds (${published.firstLoadFiles})`);
    console.log(`✓ built: ${published.files} script files, ${published.firstLoadFiles} in the first load`);

    const server = await serve(published.outdir);
    servers.push(server);
    const result = await openEveryPage(browser, `http://127.0.0.1:${server.address().port}`, paths);
    assert(result.problems.length === 0, `the published build opens every page without errors:\n  ${result.problems.slice(0, 20).join('\n  ')}`);
    // Production Vue prints no warnings, so one here means a second copy of Vue got into the bundle.
    assert(result.warnings.length === 0, `the published build has one copy of Vue, the production one:\n  ${result.warnings.slice(0, 20).join('\n  ')}`);
    const pagesAtHome = result.homeRequests.filter((url) => /\/bundle\/chunks\/(EditorView|WorldView|DecentralizedPublicationsView|composeAnchoring)-/.test(url));
    assert(pagesAtHome.length === 0, `Home does not load other pages or service groups:\n  ${pagesAtHome.join('\n  ')}`);
    console.log(`✓ the published build opens all ${paths.length} pages with no page error, and Home loads only what it needs`);

    for (const tag of ['<meta name="description"', '<meta property="og:image" content="https://', '<meta name="twitter:card"', '<link rel="manifest" href="manifest.webmanifest">']) {
        assert(html.includes(tag), `the published index.html keeps ${tag}`);
    }
    const manifest = JSON.parse(readFileSync(join(published.outdir, 'manifest.webmanifest'), 'utf8'));
    assert(manifest.icons.every((icon) => readFileSync(join(published.outdir, icon.src)).length > 0), 'the manifest and its icons are published');
    await startFromHome(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ the published site carries its link-preview tags and manifest, and Home opens the ready-made house in the Editor, New the castle, and the Repository lists them');

    const development = await build(join(outdir, 'development-vue'), { developmentVue: true });
    const devServer = await serve(development.outdir);
    servers.push(devServer);
    const dev = await openEveryPage(browser, `http://127.0.0.1:${devServer.address().port}`, paths);
    assert(dev.problems.length === 0, `the development-Vue build opens every page without errors:\n  ${dev.problems.slice(0, 20).join('\n  ')}`);
    assert(dev.warnings.length === 0, `no Vue warnings, so every page's services are there:\n  ${dev.warnings.slice(0, 20).join('\n  ')}`);
    console.log('✓ with Vue\'s development build, every page opens with no Vue warning');

    console.log('\n✅ The bundled site works.');
} finally {
    for (const server of servers) server.close();
    await browser.close();
    rmSync(outdir, { recursive: true, force: true });
}
