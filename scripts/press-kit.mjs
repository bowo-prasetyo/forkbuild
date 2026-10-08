// Takes the press kit's screenshots (docs/launch/press/) from this checkout,
// in a real browser, with no network: Home on a desktop and a phone, a
// ready-made castle and harbor island in the Editor, and the weekly
// challenge. Also at Product Hunt's gallery size (1270 × 760).
//
//   node scripts/press-kit.mjs
//
// Needs Chromium as the tests do (`npx playwright-core install chromium`, or
// set CHROMIUM_PATH). Run it again after a visible change, and commit the
// pictures it writes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'docs/launch/press');
const MIME_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

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

const SHOTS = [
    { file: 'home-desktop.png', size: [1280, 800], hash: '#/', ready: '.home-showcase canvas, .home-showcase .build-turntable-fallback', settle: 2500 },
    { file: 'home-phone.png', size: [390, 844], hash: '#/', ready: '.home-showcase canvas, .home-showcase .build-turntable-fallback', settle: 2500, scale: 2 },
    { file: 'editor-castle.png', size: [1280, 800], hash: '#/editor?start=showcase:castle', ready: '.document-info-compact-title', settle: 2500, hideGuide: true },
    { file: 'editor-harbor-island.png', size: [1280, 800], hash: '#/editor?start=showcase:harbor_island', ready: '.document-info-compact-title', settle: 2500, hideGuide: true },
    { file: 'challenge.png', size: [1280, 800], hash: '#/challenge', ready: '.challenge-view .featured-build-card', settle: 2500 },
    { file: 'producthunt-home.png', size: [1270, 760], hash: '#/', ready: '.home-showcase canvas, .home-showcase .build-turntable-fallback', settle: 2500 },
    { file: 'producthunt-editor.png', size: [1270, 760], hash: '#/editor?start=showcase:village_square', ready: '.document-info-compact-title', settle: 2500, hideGuide: true }
];

mkdirSync(outdir, { recursive: true });
const server = await serve(root);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
    for (const shot of SHOTS) {
        // A fresh context each time: no saved documents, so every shot is a first visit.
        const context = await browser.newContext({
            viewport: { width: shot.size[0], height: shot.size[1] },
            deviceScaleFactor: shot.scale || 1,
            reducedMotion: 'reduce'
        });
        const page = await context.newPage();
        await page.goto(base + shot.hash);
        await page.waitForSelector(shot.ready, { timeout: 60_000 });
        if (shot.hideGuide) {
            const hide = page.locator('.first-build-link-btn');
            if (await hide.count()) await hide.first().click();
        }
        // Let the thumbnails and the transient "opened as your copy" message settle.
        await page.waitForTimeout(shot.settle);
        await page.screenshot({ path: join(outdir, shot.file) });
        console.log(`✓ ${shot.file}`);
        await context.close();
    }
} finally {
    await browser.close();
    server.close();
}
