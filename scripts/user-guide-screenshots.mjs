// Takes the user guide's pictures of the main screens (docs/user/img/<code>/)
// from this checkout, in a real browser, with no network, once for each
// language the app ships: Home, the Editor with Home's "Try it now" house,
// and World View at the challenge plaza. Each language's guide shows its own
// (docs/Translating.md, "Translating the user guide").
//
//   node scripts/user-guide-screenshots.mjs           every language
//   node scripts/user-guide-screenshots.mjs ja de     only these
//
// Needs Chromium as the tests do (`npx playwright-core install chromium`, or
// set CHROMIUM_PATH). Run it again after a visible change to one of these
// screens, and commit the pictures it writes. They are JPEGs, so the eight
// languages' pictures stay small.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../ui/i18n/locales.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// The folder a language's pictures live in: its code, as its guide's folder.
export function screenshotFolder(code) {
    return join(root, 'docs/user/img', code);
}

// The screens the guide shows. `ready` is what has to be on screen before
// the picture is taken.
export const SHOTS = Object.freeze([
    { file: 'home.jpg', hash: '#/', ready: '.home-showcase canvas, .home-showcase .build-turntable-fallback', settle: 2500 },
    { file: 'editor.jpg', hash: '#/editor?start=village:house&job=roof', ready: '.document-info-compact-title', settle: 3000 },
    { file: 'world-view.jpg', hash: '#/walk', ready: '.world-view canvas', settle: 6000 }
]);

const SIZE = { width: 1280, height: 800 };

// Every run shows the same moment: a Tuesday (so the same weekly challenge),
// mid-morning in World View's 40-minute day (core/nature/DayCycle.js), when the sun
// is up and casts shadows.
const DAY_CYCLE_SECONDS = 40 * 60;
const MOMENT_SECONDS = (() => {
    const tuesday = Date.UTC(2026, 9, 13, 10, 0, 0) / 1000;
    return tuesday - (tuesday % DAY_CYCLE_SECONDS) + 0.3 * DAY_CYCLE_SECONDS;
})();

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const wanted = process.argv.slice(2);
    const locales = LOCALES.filter((locale) => !locale.pseudo && (wanted.length === 0 || wanted.includes(locale.code)));
    const server = await serve(root);
    const base = `http://127.0.0.1:${server.address().port}/`;
    // Loaded only when taking pictures, so tests can read SHOTS without a browser.
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        for (const locale of locales) {
            const outdir = screenshotFolder(locale.code);
            mkdirSync(outdir, { recursive: true });
            for (const shot of SHOTS) {
                // A fresh context each time: no saved builds, so every picture
                // is a first visit, in the language the browser asks for.
                const context = await browser.newContext({
                    viewport: SIZE,
                    locale: locale.code,
                    colorScheme: 'light',
                    reducedMotion: 'reduce'
                });
                // Nothing leaves this machine: relays, gateways and the
                // rendezvous server stay out of the picture.
                await context.route((url) => !url.href.startsWith(base), (route) => route.abort());
                const page = await context.newPage();
                // Time starts at that moment and then runs on as usual, so
                // the camera's flight and the animals still move.
                await page.clock.install({ time: MOMENT_SECONDS * 1000 });
                await page.clock.resume();
                await page.goto(base + shot.hash);
                await page.waitForSelector(shot.ready, { timeout: 60_000 });
                await page.waitForTimeout(shot.settle);
                // A passing message (ActionFeedback, "opened as your copy")
                // would cover the bottom of the view: wait for it to go.
                await page.waitForFunction(() => !document.querySelector('[aria-live="polite"][style*="translateX(-50%)"]'), null, { timeout: 30_000 });
                await page.screenshot({ path: join(outdir, shot.file), type: 'jpeg', quality: 80 });
                console.log(`✓ ${locale.code}/${shot.file}`);
                await context.close();
            }
        }
    } finally {
        await browser.close();
        server.close();
    }
}
