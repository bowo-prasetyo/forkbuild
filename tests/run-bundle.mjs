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
// A file of this origin that isn't there is not ignored: the published site
// leaves most of the repository out (scripts/build.mjs, PUBLISHED), so every
// file a page asks for must be one it kept.
//
// Chromium comes from `npx playwright-core install chromium`, or from the
// executable named by the CHROMIUM_PATH environment variable.
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from '../scripts/build.mjs';
import { assert } from './support/Assert.js';
import { challengeAt, isRemixChallenge } from '../core/challenge/BuildChallenge.js';
import { prepareLinkOnlyShare } from '../application/publication/PublicationShareLink.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { License, LicenseId } from '../core/document/License.js';
import { embedCode, payloadFromLinkPreviewUrl } from '../core/app/ForkBuildAppLinks.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const MIME_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// Console errors from the network features failing offline, not from the page.
const NETWORK_NOISE = /net::|WebSocket|Failed to load resource|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError/i;

// Every path a page asked for that the published site doesn't have.
const missingFiles = new Set();

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
            missingFiles.add(path);
            response.writeHead(404).end();
        }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Every route the router defines, with each parameter filled in. A route
// that only redirects (`/walk`) is left out: the page it opens has a route
// of its own.
function routePaths() {
    const source = readFileSync(join(root, 'ui/router/index.js'), 'utf8');
    return [...new Set([...source.matchAll(/\{\s*path:\s*'([^']+)'([^\n]*)/g)]
        .filter((m) => !/\bredirect:/.test(m[2]))
        .map((m) => m[1].replace(/:[A-Za-z]+/g, 'bundle-test')))];
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
        // The village's look (css/main/theme.css): warm paper and dark ink,
        // and a green main button with white words.
        const look = await page.evaluate(() => {
            const rgb = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
            const button = getComputedStyle(document.querySelector('.home-cta-primary'));
            return { page: rgb(getComputedStyle(document.body).backgroundColor), ink: rgb(getComputedStyle(document.body).color), button: rgb(button.backgroundColor), words: rgb(button.color) };
        });
        assert(Math.min(...look.page) > 225 && look.page[0] > look.page[2], `the page is light and warm (${look.page})`);
        assert(Math.max(...look.ink) < 70, `its words are dark (${look.ink})`);
        assert(look.button[1] > look.button[0] && look.button[1] > look.button[2] && look.words.every((c) => c === 255), `Try it now is green with white words (${look.button} / ${look.words})`);
        await page.click('.home-cta-primary');
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'House', null, { timeout: 60_000 });
        await page.waitForFunction(() => location.hash === '#/editor', null, { timeout: 10_000 });
        const editorText = await page.evaluate(() => document.body.innerText);
        assert(editorText.includes('Remixed from House') && !editorText.includes('village:house'),
            'the Editor says the copy came from the built-in House, by its name rather than its id');
        // With a job left to do: no roof yet. Pick the roof, and one real
        // click on the middle of the house puts it on the walls.
        await page.waitForSelector('.starter-job:not(.starter-job--done)', { timeout: 10_000 });
        assert((await page.textContent('.starter-job-title')).includes('give it a roof'), 'the House arrives with its roof to do');
        await page.click('.starter-job-pick');
        assert(await page.$eval('.tool-switcher--editor .tool-btn:nth-child(2)', (button) => button.classList.contains('tool-btn--active')), 'Pick the roof turns Place on');
        const viewport = await page.$eval('.viewport', (element) => { const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await page.mouse.move(viewport.x - 20, viewport.y - 20);
        await page.mouse.move(viewport.x, viewport.y, { steps: 4 });
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForSelector('.starter-job--done', { timeout: 10_000 });
        assert((await page.textContent('.starter-job-title')).includes('yours now'), 'a roof on, the House is the builder\'s');
        // Its card's Publish it starts the toolbar's Publish, with its questions.
        await page.click('.starter-job-publish');
        await page.waitForSelector('.modal-overlay[role="dialog"], [role="dialog"][aria-modal="true"]', { timeout: 10_000 });
        await page.keyboard.press('Escape');
        // See inside cuts it away above the ground floor, and back.
        await page.click('.editor-see-inside');
        assert(await page.getAttribute('.editor-see-inside', 'aria-pressed') === 'true', 'See inside is on');
        await page.click('.editor-see-inside');
        assert(await page.getAttribute('.editor-see-inside', 'aria-pressed') === 'false', 'and off again');

        // New offers the same builds: the castle opens as the visitor's own copy.
        await page.click('.toolbar-new');
        await page.waitForSelector('.new-document-build[data-structure-id="showcase:castle"]', { timeout: 30_000 });
        await page.click('.new-document-build[data-structure-id="showcase:castle"]');
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'Castle', null, { timeout: 30_000 });
        assert(!(await page.$('.new-document-dialog')), 'New closes once a build is chosen');
        // With no job, its card asks for a first brick of the builder's own.
        await page.waitForSelector('.starter-job[data-stage="first-edit"]', { timeout: 10_000 });
        await page.click('.starter-job-pick');
        assert(await page.$eval('.tool-switcher--editor .tool-btn:nth-child(2)', (button) => button.classList.contains('tool-btn--active')), 'Pick a tree turns Place on');

        // Download as a 3D model: a glTF binary named after the build.
        // Under the toolbar's File menu, with Export and Import.
        await page.click('.toolbar-file-toggle');
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

// The weekly challenge, in the published build: Home's Join opens the week's
// starting build as the visitor's own copy, tagged for the week; the Editor's
// New offers the challenge first; its page explains how to enter.
// A browser context whose clock is in a themed challenge week: this week, or,
// in a remix week (whose Join goes to last week's entries rather than an
// empty plot), the next, with time still running.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
async function themedWeekContext(browser, options = {}) {
    const context = await browser.newContext(options);
    if (process.env.FORKBUILD_TEST_REMIX_WEEK || isRemixChallenge(challengeAt(Date.now()))) {
        await context.clock.install({ time: Date.now() + WEEK_MS });
        await context.clock.resume();
    }
    return context;
}

async function joinChallenge(browser, base) {
    const context = await themedWeekContext(browser);
    const page = await context.newPage();
    try {
        await page.goto(`${base}/#/`);
        await page.waitForSelector('.challenge-card .challenge-join', { timeout: 60_000 });
        const tag = (await page.textContent('.challenge-card .challenge-card-tag')).trim();
        assert(/^#[a-z-]+-\d{8}$/.test(tag), `Home shows the week's tag (${tag})`);
        await page.click('.challenge-card .challenge-join');
        await page.waitForFunction(() => location.hash === '#/editor', null, { timeout: 60_000 });
        await page.waitForFunction((tag) => document.body.innerText.includes(tag), tag, { timeout: 30_000 });
        // An empty plot, with the week's structures pinned at the top of the Build Library.
        await page.waitForSelector('.pinned-structures-group .structure-item, .pinned-structures-group li', { timeout: 30_000 });

        await page.click('.toolbar-new');
        await page.waitForSelector('.new-document-challenge', { timeout: 30_000 });
        assert(await page.evaluate(() => document.querySelector('.new-document-option')?.classList.contains('new-document-challenge')), 'New offers the challenge first');
        await page.keyboard.press('Escape');

        await page.evaluate(() => { location.hash = '#/challenge'; });
        await page.waitForSelector('.challenge-steps li', { timeout: 60_000 });
        assert((await page.textContent('.challenge-view .challenge-card-tag')).trim() === tag, 'the challenge page names the same week');
        await page.waitForSelector('.challenge-view .featured-build-card', { timeout: 60_000 });
    } finally {
        await context.close();
    }
}

// The challenge plaza, in the published build: an entry published unsigned
// for the week stands there, reached from the challenge page's Walk the
// plaza, in World View, which stays on the plaza; an unknown week says so.
async function walkThePlaza(browser, base) {
    const context = await themedWeekContext(browser, { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    try {
        await page.goto(`${base}/#/`);
        await page.waitForSelector('.challenge-card .challenge-join', { timeout: 60_000 });
        const join = await page.getAttribute('.challenge-card .challenge-join', 'href');
        await page.goto(`${base}/${join}`);
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim(), null, { timeout: 60_000 });
        await page.click('.toolbar-publish');
        await page.waitForSelector('.remix-permission-dialog', { timeout: 10_000 });
        await page.click('.remix-permission-allow');
        // Who can find it? is asked once per device; an unsigned build can only travel by link.
        await page.waitForSelector('.findability-dialog', { timeout: 10_000 });
        await page.click('.findability-link');
        await page.waitForSelector('.login-modal-purpose', { timeout: 10_000 });
        await page.click('.login-modal-skip');
        await page.waitForSelector('.editor-post-publish-share', { timeout: 60_000 });

        await page.evaluate(() => { location.hash = '#/challenge'; });
        await page.waitForSelector('.challenge-plaza-link', { timeout: 60_000 });
        await page.click('.challenge-plaza-link');
        await page.waitForSelector('.world-view-plaza-exhibit', { timeout: 60_000 });
        assert(await page.locator('.world-view-plaza-exhibit:not(.world-view-plaza-ready-made)').count() === 1, 'the entry stands in the plaza');
        await page.waitForSelector('.world-view-plaza-ready-made', { timeout: 60_000 });
        assert(await page.locator('.world-view-plaza-ready-made').count() === 6, 'and, with so few entries, the ready-made builds round the square');
        // Published unsigned, so still with no name: walking as a guest.
        assert(await page.$('.world-view-guest-hint'), 'someone with no name walks the plaza as a guest');
        await page.click('.world-view-plaza-focus');
        await page.waitForTimeout(4000);
        assert(/^#\/plaza\/\d{4}-\d{2}-\d{2}$/.test(await page.evaluate(() => location.hash)), 'World View stays on the plaza');
        // Open leaves the plaza for the entry's own World.
        await page.click('.world-view-plaza-open');
        await page.waitForFunction(() => location.hash.startsWith('#/world/'), null, { timeout: 60_000 });
        await page.waitForFunction(() => !document.querySelector('.world-view-plaza'), null, { timeout: 60_000 });

        await page.evaluate(() => { location.hash = '#/challenge'; });
        await page.waitForSelector('.challenge-view', { timeout: 60_000 });
        await page.evaluate(() => { location.hash = '#/plaza/not-a-week'; });
        await page.waitForSelector('.world-view-plaza .world-view-plaza-challenge', { timeout: 60_000 });
        assert(!(await page.$('.world-view-plaza-exhibit')), 'an unknown week stands nothing');
        assert(problems.length === 0, `no page errors on the plaza:\n  ${problems.join('\n  ')}`);
    } finally {
        await context.close();
    }
}

// Steem's and Blurt's posting switches (core/publication/NetworkWriters.js), in the
// published build: off for a new visitor, so their settings page offers the
// switch without the account form and the preferred network lists neither;
// switched on, both appear. A device that already had an account saved to
// post as starts with its switch on.
async function postingSwitches(browser, base) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const preferredNetworks = () => page.$$eval('.announcement-discovery-provider-option input[type="radio"]', (inputs) => inputs.map((input) => input.value));
    try {
        await page.goto(`${base}/#/settings/steem`);
        await page.waitForSelector('.network-writer-toggle--steem', { timeout: 60_000 });
        assert(!(await page.isChecked('.network-writer-toggle--steem')) && !(await page.$('#steem-account')) && await page.$('.steem-posting-off'),
            'a new visitor posts to Steem only after switching it on, and sees no account form until then');
        await page.evaluate(() => { location.hash = '#/settings/announcement-discovery-provider'; });
        await page.waitForSelector('.announcement-discovery-provider-option', { timeout: 60_000 });
        let networks = await preferredNetworks();
        assert(!networks.includes('steem') && !networks.includes('blurt') && networks.includes('nostr'), `the preferred network offers neither while off (${networks})`);

        await page.evaluate(() => { location.hash = '#/settings/steem'; });
        await page.waitForSelector('.network-writer-toggle--steem', { timeout: 60_000 });
        await page.check('.network-writer-toggle--steem');
        await page.waitForSelector('#steem-account', { timeout: 10_000 });
        await page.evaluate(() => { location.hash = '#/settings/announcement-discovery-provider'; });
        await page.waitForSelector('.announcement-discovery-provider-option', { timeout: 60_000 });
        networks = await preferredNetworks();
        assert(networks.includes('steem') && !networks.includes('blurt'), `switched on, Steem is offered (${networks})`);
    } finally {
        await context.close();
    }

    const existing = await browser.newContext();
    await existing.addInitScript(() => {
        try { localStorage.setItem('forkbuild:blurt-announcing-configuration', JSON.stringify({ account: 'alice' })); } catch { /* no storage */ }
    });
    const poster = await existing.newPage();
    try {
        await poster.goto(`${base}/#/settings/blurt`);
        await poster.waitForSelector('.network-writer-toggle--blurt', { timeout: 60_000 });
        assert(await poster.isChecked('.network-writer-toggle--blurt') && await poster.$('#blurt-account'), 'a device that already posts to Blurt keeps posting');
    } finally {
        await existing.close();
    }
}

// A launch post's link (`?ref=<channel>`, docs/launch/README.md) opens Home,
// and the parameter leaves the address, keeping the route.
async function openLaunchLink(browser, base) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto(`${base}/?ref=hn#/challenge`);
        await page.waitForSelector('.challenge-view', { timeout: 60_000 });
        const address = await page.evaluate(() => ({ search: location.search, hash: location.hash }));
        assert(address.search === '' && address.hash === '#/challenge', `the ref parameter leaves the address, the route stays (${JSON.stringify(address)})`);

        // An old link to a retired page says so, instead of an empty page.
        await page.evaluate(() => { location.hash = '#/leaderboards'; });
        await page.waitForSelector('.not-found-view a[href="#/"]', { timeout: 60_000 });
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
    const { url, payload } = await prepareLinkOnlyShare({ publication, contentStore, appUrl: `${base}/`, previewUrl: null });
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
        await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'Remix of Linked castle', null, { timeout: 60_000 });
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

    await openEmbed(browser, base, payload);
}

// The same castle embedded in another site's page, as Embed's code puts it
// there: the published embed.html shows it turning, a drag turns it, and Remix
// on ForkBuild opens its shared link's screen in a new tab. It fits a phone's
// column too.
async function openEmbed(browser, base, payload) {
    const code = embedCode({ payload, frameTitle: 'Linked castle on ForkBuild', appUrl: `${base}/` });
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error' && !NETWORK_NOISE.test(message.text())) problems.push(message.text());
    });
    // Another origin's page: a server of its own, on another port.
    const blog = createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(`<!doctype html><title>A blog</title><h1>My castle</h1>${code}`);
    });
    await new Promise((resolve) => blog.listen(0, '127.0.0.1', resolve));
    try {
        await page.goto(`http://127.0.0.1:${blog.address().port}/post`);
        const frame = await (await page.waitForSelector('iframe')).contentFrame();
        await frame.waitForSelector('.embed-open', { timeout: 60_000 });
        assert((await frame.textContent('.embed-title')).trim() === 'Linked castle', 'the embed shows the castle');
        await frame.waitForSelector('canvas.build-turntable-canvas--draggable', { timeout: 60_000 });
        const box = await (await frame.$('canvas')).boundingBox();
        assert(Math.round(box.width) === 640, `filling its frame (${box.width}px wide)`);
        await page.mouse.move(box.x + 200, box.y + 150);
        await page.mouse.down();
        await page.mouse.move(box.x + 320, box.y + 150, { steps: 4 });
        await page.mouse.up();
        await frame.waitForSelector('.embed-hint', { state: 'detached', timeout: 10_000 });
        const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 30_000 }), frame.click('.embed-open')]);
        await tab.waitForSelector('.shared-build-edit-copy', { timeout: 60_000 });
        assert(tab.url() === `${base}/#/s/${payload}`, 'Remix on ForkBuild opens the castle\'s shared link in a new tab');
        assert((await tab.textContent('.shared-build-title')).trim() === 'Linked castle', 'on its own screen, ready to copy');
        assert(problems.length === 0, `the embed runs without errors (${problems.join('; ')})`);
    } finally {
        await context.close();
        blog.close();
    }

    const phone = await browser.newContext({ viewport: { width: 320, height: 240 } });
    const small = await phone.newPage();
    try {
        await small.goto(`${base}/embed.html#${payload}`);
        await small.waitForSelector('.embed-open', { timeout: 60_000 });
        const fits = await small.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
            && document.querySelector('.embed-open').getBoundingClientRect().right <= window.innerWidth);
        assert(fits, 'a phone-sized frame fits the embed and its button');
    } finally {
        await phone.close();
    }
}

// A newcomer's first visit to the published build: six pages in the nav and
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
        assert(topLinks.join() === '#/,#/editor,#/repository,#/challenge,#/walk,#/worlds/recent', `the nav shows six pages before More (${topLinks})`);
        const navNames = await page.$$eval('.app-nav > .app-nav-link', (links) => links.map((link) => link.textContent.trim()));
        assert(navNames.join() === 'Home,Build,Explore,Challenge,Walk,My Worlds', `in the player's words (${navNames})`);
        // No account: the header offers a name, never Login.
        assert((await page.textContent('.user-widget .user-choose-name')).trim() === 'Choose a name' && !/log ?in/i.test(await page.textContent('.user-widget')),
            'the header offers Choose a name, not Login');
        // Walk opens this week's plaza, with the ready-made builds round it.
        await page.click('.app-nav > a[href="#/walk"]');
        await page.waitForFunction(() => location.hash.startsWith('#/plaza/'), null, { timeout: 30_000 });
        await page.waitForSelector('.world-view-plaza-ready-made', { timeout: 60_000 });
        assert(await page.$$eval('.world-view-plaza-ready-made', (rows) => rows.length) === 6, 'the six ready-made builds stand round the plaza');
        assert(await page.$eval('.app-nav > a[href="#/walk"]', (link) => link.classList.contains('router-link-active')), 'Walk is marked on the plaza');
        await page.evaluate(() => { location.hash = '#/'; });
        await page.waitForSelector('.home-view', { timeout: 60_000 });
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
        // Place, with no brick picked, and a real mouse: the first click
        // places a cube, and a second on top of it stacks another.
        await page.click('.tool-switcher--editor .tool-btn:nth-child(2)');
        const middle = await page.$eval('.viewport', (element) => { const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.6 }; });
        await page.mouse.move(middle.x - 30, middle.y);
        await page.mouse.move(middle.x, middle.y, { steps: 4 });
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForSelector('.first-build-step--done[data-step="place-brick"]', { timeout: 10_000 });
        assert(await page.$eval('.palette-item--active', (item) => item.textContent.includes('Cube')), 'the Build Library shows the Cube chosen');
        // The cube stands on the ground point that was clicked
        // (renderer/EditorFloor.js), so its top is just above the pointer:
        // a click a few pixels higher lands on it. (When the ground was
        // picked below the build's floor, the cube was drawn about 120
        // pixels above the pointer, and these clicks all missed it.)
        let stacked = false;
        for (let up = 4; up <= 40 && !stacked; up += 4) {
            await page.mouse.move(middle.x, middle.y - up, { steps: 2 });
            await page.mouse.down();
            await page.mouse.up();
            stacked = await page.waitForSelector('.first-build-step--done[data-step="stack"]', { timeout: 1500 }).then(() => true, () => false);
        }
        assert(stacked, 'a click on the cube\'s top stacks another on it');
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
        await page.waitForSelector('.findability-dialog', { timeout: 10_000 });
        await page.click('.findability-link');
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
        // Published untouched, the ready-made House is asked about once.
        await editor.click('.toolbar-publish');
        await editor.waitForSelector('.nothing-added-dialog', { timeout: 10_000 });
        await editor.click('.nothing-added-keep');
        assert(!(await editor.$('.nothing-added-dialog')) && !(await editor.$('.remix-permission-dialog')), 'Keep building publishes nothing');
        await editor.click('.toolbar-publish');
        await editor.waitForSelector('.remix-permission-dialog', { timeout: 10_000 });
        await editor.click('.remix-permission-allow');
        // Who can find it? Everyone: the build is also sent to everyone as a build note.
        await editor.waitForSelector('.findability-dialog', { timeout: 10_000 });
        await editor.click('.findability-everyone');
        // A first publish on a new device asks only for a name.
        await editor.waitForSelector('.login-modal-quick', { timeout: 10_000 });
        assert(!(await editor.$('.login-modal-quick input[type="password"]')), 'a first publish asks for no passphrase');
        await editor.fill('.login-modal-quick-name', 'Bundle builder');
        await editor.click('.login-modal-quick-go');
        // One celebration: Copy link up front, the link itself and the rest under More ways to share.
        await editor.waitForSelector('.editor-post-publish-share .publication-share-link-actions button:has-text("Copy link")', { timeout: 60_000 });
        assert(!(await editor.isVisible('.editor-post-publish-share .publication-share-link-url')), 'the long link waits under More ways to share');
        await editor.click('.editor-post-publish-share .publication-share-more summary');
        await editor.waitForSelector('.editor-post-publish-share .publication-share-link-url', { timeout: 10_000 });
        const link = await editor.$eval('.editor-post-publish-share .publication-share-link-url', (input) => input.value);
        assert(link.includes('/b/1'), `a name is enough to publish it signed, with a link ready (${link.slice(0, 60)})`);
        assert((await editor.textContent('.user-widget .user-chip')).includes('Bundle builder'), 'and the header shows the name it was published under');
        // Sent to everyone, or (with no relay reachable from the test) said not to have reached them yet.
        await editor.waitForFunction(() => /Anyone can find it now|couldn't reach everyone yet/.test(document.querySelector('.editor-post-publish-message')?.textContent || ''), null, { timeout: 60_000 });
        // One celebration: a passphrase for the identity just made waits for the next publish.
        assert(!(await editor.$('.editor-post-publish-protect .protect-identity-note-link')), 'the first publish of a new identity asks for no passphrase yet');
        // Publishing keeps the build too: nothing reads Draft or Unsaved once it is out.
        await editor.waitForFunction(() => !document.querySelector('.document-info-compact-draft'), null, { timeout: 30_000 });
        await editor.click('.editor-post-publish-share .publication-share-link-actions button:has-text("Copy link")');
        await editor.waitForSelector('.first-build-step--done[data-step="share"]', { timeout: 10_000 });
        await editor.click('.editor-post-publish-share .publication-share-link-embed');
        const embed = await editor.$eval('.editor-post-publish-share .publication-share-embed-code', (area) => area.value);
        assert(embed.startsWith('<iframe ') && embed.includes(`embed.html#${payloadFromLinkPreviewUrl(link)}"`), `Embed offers the same build as an <iframe> (${embed.slice(0, 60)})`);

        // Published again, the Editor offers to add a passphrase.
        await editor.click('.toolbar-publish');
        await editor.waitForSelector('.editor-post-publish-protect .protect-identity-note-link', { timeout: 60_000 });

        // Walk inside it: World View at the house's door; walking ahead goes
        // in, which ticks off the guided first build's last step.
        assert((await editor.textContent('.editor-post-publish-walk')).trim() === 'Walk inside it', 'Publish offers to walk inside the house');
        // World View's messages last a few seconds, which a slow machine can
        // spend on one frame: every message is noted as it appears instead.
        await editor.evaluate(() => {
            window.__messages = [];
            new MutationObserver(() => {
                for (const node of document.querySelectorAll('[aria-live="polite"]')) {
                    const text = node.textContent.trim();
                    if (text && !window.__messages.includes(text)) window.__messages.push(text);
                }
            }).observe(document.body, { childList: true, subtree: true, characterData: true });
        });
        const said = (words) => editor.waitForFunction((w) => window.__messages.some((m) => m.includes(w)), words, { timeout: 90_000, polling: 100 });
        await editor.click('.editor-post-publish-walk');
        await editor.waitForSelector('.world-viewport canvas', { timeout: 60_000 });
        await said('Here\'s the door.');
        // What a visitor came to do is on the bar over the view, not in the panel.
        assert(await editor.isVisible('.world-view-hud .world-view-walk-together') && await editor.isVisible('.world-view-hud .world-view-build-here'), 'Walk here with me and Build here sit over the view');
        assert(!(await editor.$('.world-view-overlay .world-view-walk-together')), 'and not in the side panel');
        assert(!editor.url().includes('arrive='), `the arrival leaves the address clean (${editor.url()})`);
        await editor.click('.world-viewport canvas', { position: { x: 640, y: 120 } });
        await editor.keyboard.down('w');
        await said('You\'re inside!');
        await editor.keyboard.up('w');
        await editor.goBack();
        await editor.waitForSelector('.first-build-step--done[data-step="walk-inside"]', { timeout: 60_000 });

        const friend = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
            const visit = await friend.newPage();
            await visit.goto(`${base}/#/s/${payloadFromLinkPreviewUrl(link)}`);
            await visit.waitForSelector('.shared-build-edit-copy', { timeout: 60_000 });
            assert((await visit.textContent('.shared-build-title')).trim() === 'House', 'the link opens on the house');
            assert((await visit.textContent('.shared-build-license')).includes('CC BY 4.0'), 'which allows remixes, as chosen');
            await visit.click('.shared-build-edit-copy');
            await visit.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'Remix of House', null, { timeout: 60_000 });
        } finally {
            await friend.close();
        }
    } finally {
        await signing.close();
    }

    // Make a video, Walk-through: from a build just published, World View
    // films the avatar walking into it, with its sound, and saves the video.
    const filming = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const film = await filming.newPage();
    try {
        await film.goto(`${base}/#/editor?start=village:house`);
        await film.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'House', null, { timeout: 60_000 });
        await film.click('.toolbar-publish');
        await film.waitForSelector('.nothing-added-dialog', { timeout: 10_000 });
        await film.click('.nothing-added-dialog button:has-text("Publish anyway")');
        await film.waitForSelector('.remix-permission-dialog', { timeout: 10_000 });
        await film.click('.remix-permission-allow');
        await film.waitForSelector('.findability-dialog', { timeout: 10_000 });
        await film.click('.findability-link');
        await film.waitForSelector('.login-modal-quick', { timeout: 10_000 });
        await film.fill('.login-modal-quick-name', 'Film maker');
        await film.click('.login-modal-quick-go');
        await film.waitForSelector('.editor-post-publish-share .publication-share-more summary', { timeout: 60_000 });
        await film.click('.editor-post-publish-share .publication-share-more summary');
        await film.click('.editor-post-publish-share .publication-share-link-video');
        await film.click('.build-video-dialog [data-kind="walkthrough"] input');
        await film.click('.build-video-dialog [data-shape="tall"] input');
        // Saved when waitForFilmSaved() says so; its own checks decide how long that may take.
        const filmed = film.waitForEvent('download', { timeout: 0 });
        filmed.catch(() => {});
        await film.click('.build-video-record');
        // World View opens and loads the house first, slowly where WebGL is
        // slow (waitForFilmSaved()); the app itself gives up waiting to film
        // after 30 s of not being able to.
        await film.waitForSelector('.walk-through-film-panel', { timeout: 180_000 });
        // A tall video is drawn at its own shape, fitted into the view, not cropped from it.
        await film.waitForSelector('.walk-through-film-panel[data-stage="filming"]', { timeout: 180_000 });
        const framed = await film.evaluate(() => {
            const canvas = document.querySelector('.world-viewport canvas');
            return { width: canvas.width, height: canvas.height, framed: Boolean(document.querySelector('.world-viewport--framed')), shown: canvas.getBoundingClientRect().height };
        });
        assert(framed.width === 720 && framed.height === 1280 && framed.framed && framed.shown > 0, `World View draws the tall video at 720 × 1280 while it films (${JSON.stringify(framed)})`);
        assert(film.url().includes('#/world/') && !film.url().includes('film='), `World View films it, leaving the address clean (${film.url()})`);
        await waitForFilmSaved(film);
        const video = await filmed;
        assert(/^forkbuild-house-walkthrough\.(webm|mp4)$/.test(video.suggestedFilename()), `the walk-through is saved, named after the house (${video.suggestedFilename()})`);
        await film.waitForSelector('.walk-through-film-panel[data-stage="saved"] .build-video-description', { timeout: 30_000 });
        assert(!(await film.$('.world-viewport--framed')), 'and fills the view again once the video is saved');
        await film.click('.walk-through-film-close');
        await film.waitForFunction(() => !document.querySelector('.walk-through-film-panel'), null, { timeout: 10_000 });
        const unframed = await film.evaluate(() => {
            const viewport = document.querySelector('.world-viewport');
            const canvas = viewport.querySelector('canvas');
            return { canvas: canvas.getBoundingClientRect().width, viewport: viewport.clientWidth, margin: canvas.style.marginLeft };
        });
        assert(Math.abs(unframed.canvas - unframed.viewport) < 2 && unframed.margin === '', `the canvas fills World View again (${JSON.stringify(unframed)})`);
    } finally {
        await filming.close();
    }

    const phone = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const small = await phone.newPage();
    try {
        // Walk on a phone: the plaza in full view, its panel folded into one
        // line over it that opens the panel.
        await small.goto(`${base}/#/walk`);
        await small.waitForSelector('.world-view-hud-plaza', { timeout: 60_000 });
        assert(!(await small.isVisible('.world-view-overlay-scroll')), 'a phone opens the plaza with the panel closed');
        assert(/Plaza: .+ · \d+ builds?/.test(await small.textContent('.world-view-hud-plaza')), `one line says where you are (${await small.textContent('.world-view-hud-plaza')})`);
        await small.click('.world-view-hud-plaza');
        await small.waitForSelector('.world-view-plaza-ready-made', { timeout: 30_000 });
        assert(!(await small.$('.world-view-hud-plaza')), 'it opens the panel, and goes');

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

        // An embed opened on this site is kept as itself, never as the app's
        // page: offline straight after, the app still opens.
        await page.goto(`${base}/embed.html#1AAAAAAAA`);
        await page.waitForSelector('.embed-status [role="alert"]', { timeout: 60_000 });

        await context.setOffline(true);
        await page.goto(`${base}/`);
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

// Home draws without the network runtime (ui/main/composeNetwork.js: peers,
// publications, World discovery, Steem and Blurt), which then starts on its
// own: a visitor who only reads Home still gets their peers and notifications.
async function homeStartsNetwork(browser, base) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error' && !NETWORK_NOISE.test(message.text())) problems.push(message.text());
    });
    try {
        const network = page.waitForRequest((request) => /\/bundle\/chunks\/composeNetwork-[A-Z0-9]+\.js$/.test(request.url()), { timeout: 30_000 });
        await page.goto(`${base}/#/`);
        await page.waitForSelector('.home-view', { timeout: 60_000 });
        await network;
        await page.waitForTimeout(1500);
    } finally {
        await context.close();
    }
    assert(problems.length === 0, `Home starts the network runtime without errors:\n  ${problems.slice(0, 20).join('\n  ')}`);
}

// Waits for the walk-through being filmed on `page` to be saved. The film
// runs on World View's own clock, which counts at most a quarter of a second
// a frame (renderer/AnimationLoop.js), so where WebGL draws only a frame or
// two a second, as on a CI runner without a GPU, a twenty-second film takes
// minutes. A fixed deadline would fail a slow machine as surely as a hang;
// this one fails when the film stops getting further (its progress bar, or
// saving, unchanged for STALL_MS), when it says it failed, or after LIMIT_MS
// in all.
async function waitForFilmSaved(page) {
    const STALL_MS = 60_000;
    const LIMIT_MS = 6 * 60_000;
    const started = Date.now();
    let last = null;
    let lastChange = started;
    for (;;) {
        const now = await page.evaluate(() => {
            const panel = document.querySelector('.walk-through-film-panel');
            const bar = panel?.querySelector('.build-video-progress');
            return { stage: panel?.dataset.stage ?? null, progress: bar ? Number(bar.value) : null };
        });
        if (now.stage === 'saved') return;
        assert(now.stage !== 'failed', 'World View films the walk-through without failing');
        const time = Date.now();
        if (!last || now.stage !== last.stage || now.progress !== last.progress) {
            last = now;
            lastChange = time;
        }
        assert(time - lastChange < STALL_MS, `the walk-through keeps getting further while it films (stuck at ${JSON.stringify(now)} for ${STALL_MS / 1000} s)`);
        assert(time - started < LIMIT_MS, `the walk-through is saved within ${LIMIT_MS / 60_000} minutes (at ${JSON.stringify(now)})`);
        await page.waitForTimeout(1000);
    }
}

// The Steem operator pages (scripts/steem-threads/), bundled on their own,
// open and draw their page with no error.
async function openOperatorPages(browser, base) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    try {
        // Each page's script fills in the thread account when it runs.
        for (const [file, account] of [['index.html', '#account'], ['content-check.html', '#threadAccount']]) {
            await page.goto(`${base}/scripts/steem-threads/${file}`);
            await page.waitForFunction((selector) => document.querySelector(selector)?.value, account, { timeout: 30_000 });
        }
    } finally {
        await context.close();
    }
    assert(problems.length === 0, `the Steem operator pages open without errors:\n  ${problems.slice(0, 20).join('\n  ')}`);
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
    const embedHtml = readFileSync(join(published.outdir, 'embed.html'), 'utf8');
    for (const [name, page] of [['index.html', html], ['embed.html', embedHtml]]) {
        const scriptSrc = page.match(/script-src ([^;"]*)/);
        assert(scriptSrc && scriptSrc[1].trim() === "'self'", `the published ${name} runs only this site's scripts, with no 'unsafe-eval' (${scriptSrc && scriptSrc[1]})`);
    }
    for (const left of ['ui', 'application', 'core', 'tests', 'css', 'vendor/vue/dist']) {
        assert(!existsSync(join(published.outdir, left)), `the published site leaves out ${left}/`);
    }
    // Of docs/, only the user guide's text, which Help reads: no pictures, no
    // other documents.
    const docs = readdirSync(join(published.outdir, 'docs'), { recursive: true }).map(String).filter((file) => statSync(join(published.outdir, 'docs', file)).isFile());
    assert(docs.length > 0 && docs.every((file) => /^user\/(?:[A-Za-z-]+\/)?[A-Za-z0-9_-]+\.md$/.test(file.split('\\').join('/'))), `the published site's docs/ holds only the user guide's text (${docs.filter((file) => !file.endsWith('.md')).slice(0, 3).join(', ')})`);
    for (const guide of ['docs/user/README.md', 'docs/user/02-TheEditor.md', 'docs/user/ja/README.md']) {
        assert(existsSync(join(published.outdir, guide)), `Help can read ${guide}`);
    }
    assert(!readdirSync(join(published.outdir, 'bundle'), { recursive: true }).some((file) => String(file).endsWith('.map')), 'the published site has no source maps');
    assert(html.includes(`href="${published.stylesheet}"`), 'index.html loads the bundled stylesheet');
    assert(published.firstLoadFiles < 150, `the first load is a few dozen files, not hundreds (${published.firstLoadFiles})`);
    // A budget, so the first load only grows when someone decides it should:
    // 518 KiB when it was set, with Vue's runtime-only build, no translation
    // (each visitor downloads only their own, English included) and no network
    // runtime (ui/main/composeNetwork.js, loaded once Home is on screen).
    const FIRST_LOAD_BUDGET_KIB = 560;
    assert(published.firstLoadBytes <= FIRST_LOAD_BUDGET_KIB * 1024,
        `the first load stays within ${FIRST_LOAD_BUDGET_KIB} KiB, minified (${(published.firstLoadBytes / 1024).toFixed(0)} KiB): load what Home doesn't need with import(), or raise the budget on purpose`);
    assert(!/bundle\/chunks\/(en|de|es|fr|id|ja|ko|pt-BR)-[A-Z0-9]+\.js/.test(html), 'no translation is preloaded: each visitor downloads only their own');
    assert(!html.includes('chunks/composeNetwork-'), 'the network runtime is not preloaded: it loads once Home is on screen');
    console.log(`✓ built: ${published.files} script files, ${published.firstLoadFiles} in the first load; no 'unsafe-eval', no source or source maps, and of docs/ only the user guide's text`);

    const server = await serve(published.outdir);
    servers.push(server);
    const result = await openEveryPage(browser, `http://127.0.0.1:${server.address().port}`, paths);
    assert(result.problems.length === 0, `the published build opens every page without errors:\n  ${result.problems.slice(0, 20).join('\n  ')}`);
    // Production Vue prints no warnings, so one here means a second copy of Vue got into the bundle.
    assert(result.warnings.length === 0, `the published build has one copy of Vue, the production one:\n  ${result.warnings.slice(0, 20).join('\n  ')}`);
    const pagesAtHome = result.homeRequests.filter((url) => /\/bundle\/chunks\/(EditorView|WorldView|DecentralizedPublicationsView|composeAnchoring)-/.test(url));
    assert(pagesAtHome.length === 0, `Home does not load other pages or service groups:\n  ${pagesAtHome.join('\n  ')}`);
    console.log(`✓ the published build opens all ${paths.length} pages with no page error, and Home loads only what it needs`);
    await homeStartsNetwork(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ Home draws before the network runtime, which then starts on its own');

    for (const tag of ['<meta name="description"', '<meta property="og:image" content="https://', '<meta name="twitter:card"', '<link rel="manifest" href="manifest.webmanifest">']) {
        assert(html.includes(tag), `the published index.html keeps ${tag}`);
    }
    const manifest = JSON.parse(readFileSync(join(published.outdir, 'manifest.webmanifest'), 'utf8'));
    assert(manifest.icons.every((icon) => readFileSync(join(published.outdir, icon.src)).length > 0), 'the manifest and its icons are published');
    await startFromHome(browser, `http://127.0.0.1:${server.address().port}`);
    await joinChallenge(browser, `http://127.0.0.1:${server.address().port}`);
    await openLaunchLink(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ the published site carries its link-preview tags and manifest, and Home opens the House in the Editor with its roof to do, which Pick the roof and one real click put on, New the castle (which downloads as a 3D model), and the Repository lists them; Home\'s Join opens the week\'s challenge tagged, New offers it first, and its page explains how to enter; a launch post\'s ?ref= leaves the address, and a retired page\'s link says it is gone');
    await openLinkOnlyShare(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ a link that carries its build opens on it in the published build, with no network, and Edit a Copy makes the visitor a copy, or it downloads as a 3D model; it fits a phone');
    assert(html.includes('<meta name="forkbuild-service-worker" content="sw.js">') && readFileSync(join(published.outdir, 'sw.js'), 'utf8').includes('forkbuild-'),
        'the published site has its service worker, and index.html names it');
    await offlineAndNotifications(browser, `http://127.0.0.1:${server.address().port}`, published.precacheFiles, published.outdir);
    console.log(`✓ the published site keeps its ${published.precacheFiles} files on the first visit and opens offline, Home and the Editor; a new version is offered and starts on Reload; notifications on this device turn on and off (or say the browser blocks them)`);
    await firstVisit(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ a first visit: six pages and More in the nav, Walk opening the plaza with the ready-made builds, Publish asking who can find it, the guided first build in the Editor, where Place with no brick picked places a cube on the first real click and stacks a second, Publish asking about remixes and to log in, an untouched ready-made house asked about once, the published link copied on another device, Walk inside it arriving at the house door and walking in, and a walk-through of a published house filmed in World View');
    await walkThePlaza(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ an entry published for the week stands in its plaza, reached from the challenge page, and World View stays there until Open takes you to the entry\'s World; an unknown week says so');
    await postingSwitches(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ posting to Steem and Blurt is off for a new visitor and offered once switched on; a device that already posted keeps it on');
    await openOperatorPages(browser, `http://127.0.0.1:${server.address().port}`);
    console.log('✓ the Steem operator pages open, bundled');
    assert(missingFiles.size === 0, `every file the published site's pages ask for is published:\n  ${[...missingFiles].slice(0, 20).join('\n  ')}`);
    console.log('✓ no page asked for a file the published site left out');

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
