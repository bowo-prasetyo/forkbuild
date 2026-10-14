// Draws the app's PNG icons (assets/icons/) and the link-preview card
// (assets/social/forkbuild-card.png) from the logo, in a real browser, with
// no network. The logo is assets/icons/logo-mark.svg, a little house and a
// remix of it behind; favicon.svg is its small version, one brick, and is
// drawn by hand rather than here. The card's picture is Home's own turning
// village, taken from this checkout.
//
//   node scripts/brand-icons.mjs
//
// Needs Chromium as the tests do (`npx playwright-core install chromium`, or
// set CHROMIUM_PATH). Run it again after changing the logo or Home's
// showcase, and commit the pictures it writes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// --paper, --ink and --accent-ink in css/main/theme.css.
const PAPER = '#f6efe2';
const INK = '#2e261c';
const ACCENT_INK = '#2b6e45';

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

const dataUrl = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const mark = dataUrl('image/svg+xml', readFileSync(join(root, 'assets/icons/logo-mark.svg')));

// The logo on paper, square to the edge: the device rounds or masks it.
// `width` is the logo's share of the side. A maskable icon keeps it inside
// the middle circle every mask leaves (80% across), so it is smaller.
const ICONS = [
    { file: 'assets/icons/icon-192.png', size: 192, width: 0.78 },
    { file: 'assets/icons/icon-512.png', size: 512, width: 0.78 },
    { file: 'assets/icons/apple-touch-icon.png', size: 180, width: 0.74 },
    { file: 'assets/icons/icon-maskable-512.png', size: 512, width: 0.6 }
];

function iconPage({ width }) {
    return `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${PAPER}">
        <img src="${mark}" style="width:${width * 100}vw"></body></html>`;
}

// The same words as Home's top and the page's description, beside its village.
function cardPage(showcase) {
    return `<!doctype html><html><head><style>
        body { margin: 0; width: 1200px; height: 630px; display: flex; align-items: center; gap: 56px;
               padding: 0 64px; box-sizing: border-box; background: ${PAPER}; color: ${INK};
               font-family: Inter, system-ui, sans-serif; }
        .words { flex: 1; }
        .brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 700; letter-spacing: 0.01em; }
        .brand img { height: 52px; }
        h1 { margin: 34px 0 18px; font-size: 54px; line-height: 1.08; letter-spacing: -0.01em; }
        p { margin: 0; font-size: 23px; line-height: 1.4; color: #5f5040; }
        .line { margin-top: 26px; font-size: 22px; font-weight: 700; color: ${ACCENT_INK}; }
        .village { width: 540px; height: 405px; border-radius: 16px; object-fit: cover;
                   box-shadow: 0 12px 40px rgba(74, 52, 24, 0.2); }
    </style></head><body>
        <div class="words">
            <div class="brand"><img src="${mark}" alt="">ForkBuild</div>
            <h1>Build in 3D, right in your browser</h1>
            <p>Snap bricks into houses and villages, remix other people's builds, and walk through them with friends. No account needed.</p>
            <div class="line">Remix anything. Own your work.</div>
        </div>
        <img class="village" src="${showcase}" alt="">
    </body></html>`;
}

const server = await serve(root);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
    for (const icon of ICONS) {
        const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
        await page.setContent(iconPage(icon));
        await page.screenshot({ path: join(root, icon.file) });
        console.log(`✓ ${icon.file}`);
        await page.close();
    }

    // Home's village at twice the size, so it stays sharp on the card. A
    // fresh context: no saved documents, the village a first visit sees.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const home = await context.newPage();
    await home.goto(base + '#/');
    await home.waitForSelector('.home-showcase canvas', { timeout: 60_000 });
    await home.waitForTimeout(2500);
    const showcase = dataUrl('image/png', await home.locator('.home-showcase').screenshot());
    await context.close();

    const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await card.setContent(cardPage(showcase));
    await card.evaluate(() => document.fonts.ready);
    await card.screenshot({ path: join(root, 'assets/social/forkbuild-card.png') });
    console.log('✓ assets/social/forkbuild-card.png');
} finally {
    await browser.close();
    server.close();
}
