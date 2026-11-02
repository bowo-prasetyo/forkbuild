// Takes itch.io's village cover (docs/launch/itch/cover-village.html) from
// this checkout, in a real browser, with no network: a still,
// docs/launch/press/itch-cover-village.png, and a looping GIF of the village
// turning once, itch-cover-village.gif, both 630 × 500, itch's cover size;
// and the same village with no words, 1200 × 750, as the launcher's
// backdrop (docs/launch/itch/index.html), itch-launcher-village.png.
//
//   node scripts/itch-cover.mjs
//
// Needs Chromium as the tests do (`npx playwright-core install chromium`, or
// set CHROMIUM_PATH) and ffmpeg on the PATH for the GIF. Run it again after
// a visible change to the bricks or the cover page, and commit what it writes.
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'docs/launch/press');
const MIME_TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

// The still's angle: the lighthouse in front, the mill behind, every roof in view.
const STILL_TURN = 1.2;
// One full turn, at 12 frames a second: a five-second loop.
const FRAMES = 60;
const FPS = 12;

function serve(dir) {
    const server = createServer(async (request, response) => {
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
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

const server = await serve(root);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const frames = await mkdtemp(join(tmpdir(), 'forkbuild-cover-'));
try {
    const page = await browser.newPage({ viewport: { width: 630, height: 500 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/docs/launch/itch/cover-village.html`);
    await page.waitForFunction(() => window.cover?.ready, null, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate((radians) => window.cover.turn(radians), STILL_TURN);
    await page.screenshot({ path: join(outdir, 'itch-cover-village.png') });
    console.log('✓ itch-cover-village.png');

    for (let frame = 0; frame < FRAMES; frame++) {
        if (frame > 0) await page.evaluate((radians) => window.cover.turn(radians), (2 * Math.PI) / FRAMES);
        await page.screenshot({ path: join(frames, `frame-${String(frame).padStart(3, '0')}.png`) });
    }
    // One palette for the whole loop, so colours don't flicker from frame to frame.
    const gif = join(outdir, 'itch-cover-village.gif');
    execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, 'frame-%03d.png'),
        '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
        '-loop', '0', gif
    ]);
    console.log(`✓ itch-cover-village.gif (${Math.round((await stat(gif)).size / 1024)} KB)`);

    const backdrop = await browser.newPage({ viewport: { width: 1200, height: 750 } });
    await backdrop.goto(`http://127.0.0.1:${server.address().port}/docs/launch/itch/cover-village.html?background`);
    await backdrop.waitForFunction(() => window.cover?.ready, null, { timeout: 60_000 });
    await backdrop.evaluate((radians) => window.cover.turn(radians), STILL_TURN);
    await backdrop.screenshot({ path: join(outdir, 'itch-launcher-village.png') });
    console.log('✓ itch-launcher-village.png');
} finally {
    await rm(frames, { recursive: true, force: true });
    await browser.close();
    server.close();
}
