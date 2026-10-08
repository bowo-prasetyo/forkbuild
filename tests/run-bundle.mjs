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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from '../scripts/build.mjs';
import { assert } from './support/Assert.js';
import { prepareLinkOnlyShare } from '../application/publication/PublicationShareLink.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { License, LicenseId } from '../core/License.js';
import { payloadFromLinkPreviewUrl } from '../core/ForkBuildAppLinks.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

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

        // Download as a 3D model: a glTF binary named after the build.
        await page.click('.toolbar-export-model');
        await page.waitForSelector('.model-export-dialog', { timeout: 10_000 });
        const [glb] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.click('.model-export-option[data-format="glb"]')]);
        assert(glb.suggestedFilename() === 'forkbuild-castle.glb', `the Editor downloads the castle as a glTF binary (${glb.suggestedFilename()})`);
        const glbBytes = readFileSync(await glb.path());
        assert(glbBytes.readUInt32LE(0) === 0x46546c67 && glbBytes.readUInt32LE(8) === glbBytes.length, 'a glTF 2.0 binary of the length it says');
        assert(!(await page.$('.model-export-dialog')), 'the dialog closes once the file is made');

        // The Repository offers them before anything is published or found.
        await page.evaluate(() => { location.hash = '#/repository'; });
        await page.waitForSelector('.featured-builds-shelf .featured-build-card', { timeout: 60_000 });
        assert(await page.locator('.featured-builds-shelf .featured-build-card').count() === 6, 'the Repository shows the six ready-made builds');
    } finally {
        await context.close();
    }
}

// A link that carries its build, made as Copy link makes one from a castle
// just published, opens in the published build on the castle, though no
// network answers: its own screen, with Edit a Copy, which opens the visitor's
// own copy in the Editor, and the walk into World View. It fits a phone.
async function openLinkOnlyShare(browser, base) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('bundle-link-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of ShowcaseLibrary.structures.find((structure) => structure.id === 'showcase:castle').bricks) building.addBrick(brick);
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title: 'Linked castle', author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }) }) }), 'doc-linked-castle');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    const { url } = await prepareLinkOnlyShare({ publication, contentStore, appUrl: `${base}/`, previewUrl: null });
    assert(url, 'the castle gets a link-only share');

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto(url);
        await page.waitForSelector('.shared-build-edit-copy', { timeout: 60_000 });
        assert(!(await page.$('.publication-link-message')), 'the link opened without a complaint');
        assert((await page.textContent('.shared-build-title')).trim() === 'Linked castle', 'on the castle\'s own screen');
        await page.waitForSelector('.shared-build-stage canvas', { timeout: 60_000 });
        await page.click('.shared-build-walk');
        await page.waitForFunction((hash) => location.hash === hash, `#/world/${publication.documentId}`, { timeout: 60_000 });
        await page.goBack();
        await page.waitForSelector('.shared-build-edit-copy', { timeout: 60_000 });
        await page.click('.shared-build-edit-copy');
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'Fork of Linked castle', null, { timeout: 60_000 });
        assert(!(await page.$('.fork-failure-dialog')), 'Edit a Copy opens the visitor\'s own copy, with no failure');
        await page.goBack();
        await page.waitForSelector('.shared-build-model-link[data-format="stl"]', { timeout: 60_000 });
        const [stl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.click('.shared-build-model-link[data-format="stl"]')]);
        assert(stl.suggestedFilename() === 'forkbuild-linked-castle.stl', `a shared build downloads as an STL for printing (${stl.suggestedFilename()})`);
        const stlBytes = readFileSync(await stl.path());
        assert(stlBytes.toString('latin1', 0, 30).startsWith('ForkBuild model: Linked castle') && stlBytes.length === 84 + stlBytes.readUInt32LE(80) * 50,
            'naming the build, with every triangle');
    } finally {
        await context.close();
    }

    const phone = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const small = await phone.newPage();
    try {
        await small.goto(url);
        await small.waitForSelector('.shared-build-edit-copy', { timeout: 60_000 });
        const stage = await small.$eval('.shared-build-stage', (element) => element.getBoundingClientRect().bottom);
        const info = await small.$eval('.shared-build-info', (element) => element.getBoundingClientRect().top);
        assert(stage <= info + 1, 'on a phone the build comes first');
        const width = await small.evaluate(() => document.documentElement.scrollWidth);
        assert(width <= 390, `and the screen fits it (${width}px)`);
        const button = await small.$eval('.shared-build-edit-copy', (element) => element.getBoundingClientRect().width);
        assert(button >= 300, `with Edit a Copy across it (${button}px)`);
    } finally {
        await phone.close();
    }
}

// A newcomer's first visit to the published build: five pages in the nav and
// the rest under More (laid out open in a phone's Menu); the guided first build
// in the Editor, which folds, hides for good and comes back from the command
// palette; and Publish asking to log in first, then publishing signed with a
// link ready (or unsigned, if asked).
async function firstVisit(browser, base) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    try {
        await page.goto(`${base}/#/`);
        await page.waitForSelector('.home-view', { timeout: 60_000 });
        const topLinks = await page.$$eval('.app-nav > .app-nav-link', (links) => links.map((link) => link.getAttribute('href')));
        assert(topLinks.join() === '#/,#/editor,#/repository,#/worlds/recent', `the nav shows four pages before More (${topLinks})`);
        assert(!(await page.isVisible('.app-nav-more-panel')), 'More starts closed');
        await page.click('.app-nav-more-toggle');
        assert(await page.isVisible('.app-nav-more-panel a[href="#/peers"]'), 'More holds the rest');
        await page.click('.app-nav-more-panel a[href="#/peers"]');
        await page.waitForFunction(() => location.hash === '#/peers', null, { timeout: 30_000 });
        assert(!(await page.isVisible('.app-nav-more-panel')), 'choosing a page closes More');
        assert(await page.$eval('.app-nav-more-toggle', (toggle) => toggle.classList.contains('app-nav-more-toggle--active')), 'More is marked while one of its pages is open');

        await page.evaluate(() => { location.hash = '#/editor'; });
        await page.waitForSelector('.first-build-guide', { timeout: 60_000 });
        const current = await page.$eval('.first-build-step--current', (step) => step.dataset.step);
        assert(current === 'place-brick', `the guide starts at placing a brick (${current})`);
        await page.click('.first-build-icon-btn');
        await page.waitForSelector('.first-build-guide-pill');
        await page.click('.first-build-guide-pill');
        await page.waitForSelector('.first-build-guide');

        // Publish asks first whether others may remix a build with no license
        // (Not now publishes nothing), then, logged out, to log in; publishing
        // unsigned still works, and stays possible.
        await page.click('.toolbar-publish');
        await page.waitForSelector('.remix-permission-dialog', { timeout: 10_000 });
        await page.click('.remix-permission-dialog .action-btn--secondary');
        assert(!(await page.$('.login-modal-purpose')), 'Not now publishes nothing');
        await page.click('.toolbar-publish');
        await page.waitForSelector('.remix-permission-dialog', { timeout: 10_000 });
        await page.click('.remix-permission-look');
        await page.waitForSelector('.login-modal-purpose', { timeout: 10_000 });
        await page.click('.login-modal-skip');
        await page.waitForFunction(() => !document.querySelector('.login-modal-purpose'), null, { timeout: 10_000 });

        await page.click('.first-build-link-btn');
        await page.waitForFunction(() => !document.querySelector('.first-build-guide'), null, { timeout: 10_000 });
        await page.reload();
        await page.waitForSelector('.toolbar-publish', { timeout: 60_000 });
        await page.waitForTimeout(500);
        assert(!(await page.$('.first-build-guide')), 'hidden, the guide stays hidden after a reload');
        await page.keyboard.press('Control+k');
        await page.waitForSelector('[role="dialog"] input', { timeout: 10_000 });
        await page.keyboard.type('First-Build');
        await page.keyboard.press('Enter');
        await page.waitForSelector('.first-build-guide', { timeout: 10_000 });
    } finally {
        await context.close();
    }

    // Logging in from Publish: a new identity is made, the build is published
    // signed, allowing remixes, its link is ready to copy, and copying it
    // ticks off sharing. Then the link, opened on another device, makes a
    // copy there.
    const signing = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const editor = await signing.newPage();
    try {
        await editor.goto(`${base}/#/editor?start=village:house`);
        await editor.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'House', null, { timeout: 60_000 });
        await editor.click('.toolbar-publish');
        await editor.waitForSelector('.remix-permission-dialog', { timeout: 10_000 });
        await editor.click('.remix-permission-allow');
        await editor.waitForSelector('.login-modal-purpose', { timeout: 10_000 });
        await editor.fill('.modal-content input[type="text"].modal-input', 'Bundle builder');
        await editor.fill('.new-passphrase-fields input[type="password"] >> nth=0', 'a long bundle passphrase 4821');
        await editor.fill('.new-passphrase-fields input[type="password"] >> nth=1', 'a long bundle passphrase 4821');
        await editor.click('.modal-content .modal-actions .modal-btn--primary');
        await editor.waitForSelector('.editor-post-publish-share .publication-share-link-url', { timeout: 60_000 });
        const link = await editor.$eval('.editor-post-publish-share .publication-share-link-url', (input) => input.value);
        assert(link.includes('/b/1'), `logging in from Publish publishes it signed, with a link ready (${link.slice(0, 60)})`);
        assert((await editor.textContent('.user-widget')).includes('Bundle builder'), 'and leaves the new identity logged in');
        await editor.click('.editor-post-publish-share .publication-share-link-actions button:has-text("Copy link")');
        await editor.waitForSelector('.first-build-step--done[data-step="share"]', { timeout: 10_000 });

        const friend = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
            const visit = await friend.newPage();
            await visit.goto(`${base}/#/s/${payloadFromLinkPreviewUrl(link)}`);
            await visit.waitForSelector('.shared-build-edit-copy', { timeout: 60_000 });
            assert((await visit.textContent('.shared-build-title')).trim() === 'House', 'the link opens on the house');
            assert((await visit.textContent('.shared-build-license')).includes('CC BY 4.0'), 'which allows remixes, as chosen');
            await visit.click('.shared-build-edit-copy');
            await visit.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'Fork of House', null, { timeout: 60_000 });
        } finally {
            await friend.close();
        }
    } finally {
        await signing.close();
    }

    const phone = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const small = await phone.newPage();
    try {
        await small.goto(`${base}/#/`);
        await small.waitForSelector('.home-view', { timeout: 60_000 });
        await small.click('.app-menu-toggle');
        assert(await small.isVisible('.app-nav-more-panel a[href="#/settings/data"]') && !(await small.isVisible('.app-nav-more-toggle')), 'a phone\'s Menu shows More\'s pages open');
        const width = await small.evaluate(() => document.documentElement.scrollWidth);
        assert(width <= 390, `the open Menu fits the phone (${width}px)`);
    } finally {
        await phone.close();
    }
}

// Installing and offline: the published site registers its service worker,
// which keeps the app's files on the first visit, so the app opens again
// with no network, Home and a ready-made build in the Editor alike. The
// bell's panel turns notifications on this device on, once the browser
// allows them.
async function offlineAndNotifications(browser, base, precacheFiles, publishedDir) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    try {
        await page.goto(`${base}/`);
        await page.waitForSelector('.home-view', { timeout: 60_000 });
        const controlled = await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((resolve) => setTimeout(resolve, 100));
            return Boolean(navigator.serviceWorker.controller);
        });
        assert(controlled, 'the published site registers its service worker, which takes charge of the first visit');
        const kept = await page.evaluate(async () => {
            const names = (await caches.keys()).filter((name) => name.startsWith('forkbuild-'));
            return names.length === 1 ? (await (await caches.open(names[0])).keys()).length : -1;
        });
        assert(kept >= precacheFiles, `the app's files are kept on the first visit (${kept} of at least ${precacheFiles})`);

        await context.setOffline(true);
        await page.reload();
        await page.waitForSelector('.home-view', { timeout: 60_000 });
        await page.evaluate(() => { location.hash = '#/editor?start=village:house'; });
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'House', null, { timeout: 60_000 });
        await context.setOffline(false);

        // A new version: the page says so, and Reload starts it.
        const workerFile = join(publishedDir, 'sw.js');
        const current = readFileSync(workerFile, 'utf8');
        writeFileSync(workerFile, `${current}\n// a new version\n`);
        try {
            await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
            await page.waitForSelector('.app-update-banner', { timeout: 60_000 });
            await Promise.all([page.waitForEvent('load', { timeout: 60_000 }), page.click('.app-update-reload')]);
            await page.waitForSelector('.home-view, .editor-view, #app main > *', { timeout: 60_000 });
            assert(!(await page.$('.app-update-banner')), 'after Reload the new version runs, and the banner is gone');
            assert(await page.evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration();
                return Boolean(navigator.serviceWorker.controller) && !registration.waiting;
            }), 'the new version is in charge, with nothing left waiting');
        } finally {
            writeFileSync(workerFile, current);
        }
    } finally {
        await context.close();
    }

    const allowing = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await allowing.grantPermissions(['notifications'], { origin: base });
    const bell = await allowing.newPage();
    try {
        await bell.goto(`${base}/#/`);
        await bell.waitForSelector('.home-view', { timeout: 60_000 });
        await bell.click('.app-notifications-button');
        // Chromium's headless shell (what CI installs) reports every
        // notification permission as denied, whatever was granted: there the
        // panel must say the browser blocks them, and nothing more is tried.
        if (await bell.evaluate(() => Notification.permission) === 'denied') {
            await bell.waitForSelector('.device-notification-setting[data-state="blocked"]', { timeout: 10_000 });
            assert(!(await bell.$('.device-notification-on')), 'a browser that blocks notifications is told so, with nothing to turn on');
            return;
        }
        await bell.waitForSelector('.device-notification-setting[data-state="off"]', { timeout: 10_000 });
        await bell.click('.device-notification-on');
        await bell.waitForSelector('.device-notification-setting[data-state="on"]', { timeout: 10_000 });
        await bell.reload();
        await bell.waitForSelector('.home-view', { timeout: 60_000 });
        await bell.click('.app-notifications-button');
        await bell.waitForSelector('.device-notification-setting[data-state="on"]', { timeout: 10_000 });
        await bell.click('.device-notification-off');
        await bell.waitForSelector('.device-notification-setting[data-state="off"]', { timeout: 10_000 });
    } finally {
        await allowing.close();
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
    console.log('✓ the published site carries its link-preview tags and manifest, and Home opens the ready-made house in the Editor, New the castle (which downloads as a 3D model), and the Repository lists them');
    await openLinkOnlyShare(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ a link that carries its build opens on it in the published build, with no network, and Edit a Copy makes the visitor a copy, or it downloads as a 3D model; it fits a phone');
    assert(html.includes('<meta name="forkbuild-service-worker" content="sw.js">') && readFileSync(join(published.outdir, 'sw.js'), 'utf8').includes('forkbuild-'),
        'the published site has its service worker, and index.html names it');
    await offlineAndNotifications(browser, `http://127.0.0.1:${server.address().port}`, published.precacheFiles, published.outdir);
    console.log(`✓ the published site keeps its ${published.precacheFiles} files on the first visit and opens offline, Home and the Editor; a new version is offered and starts on Reload; notifications on this device turn on and off (or say the browser blocks them)`);
    await firstVisit(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ a first visit: four pages and More in the nav, the guided first build in the Editor, Publish asking about remixes and to log in, and the published link copied on another device');

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
