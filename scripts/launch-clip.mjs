// Records the launch clip (docs/launch/press/launch-clip.mp4) from this
// checkout, in a real browser: Home's Try it now, the roof put on the house,
// Publish it, and Walk inside it, with a caption for each step and a
// pointer you can see, ending on a card with where to play. About 30
// seconds, 1280 × 720, no sound. itch.io's and YouTube's gameplay video.
//
//   node scripts/launch-clip.mjs
//
// Needs Chromium as the tests do (`npx playwright-core install chromium`, or
// set CHROMIUM_PATH) and ffmpeg on the PATH. Run it again after a visible
// change to these screens, and commit the clip it writes.
import { createServer } from 'node:http';
import { readFile, rm, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/launch/press/launch-clip.mp4');
const SIZE = { width: 1280, height: 720 };
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

// A pointer drawn in the page (a screen recording has none) and a caption
// band, both above everything and never in the way of a click. Styled
// through the DOM: the app's Content Security Policy refuses a <style>.
function overlay() {
    if (document.getElementById('clip-pointer')) return;
    const pointer = document.createElement('div');
    pointer.id = 'clip-pointer';
    Object.assign(pointer.style, {
        position: 'fixed', zIndex: '2147483647', width: '26px', height: '26px', left: '-40px', top: '-40px',
        margin: '-3px 0 0 -3px', pointerEvents: 'none', transition: 'transform 120ms',
        background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 22 22\'%3E%3Cpath d=\'M3 2l15 9-7 1.5L7.5 19z\' fill=\'%23fff\' stroke=\'%232e261c\' stroke-width=\'1.6\' stroke-linejoin=\'round\'/%3E%3C/svg%3E") no-repeat'
    });
    const caption = document.createElement('div');
    caption.id = 'clip-caption';
    Object.assign(caption.style, {
        position: 'fixed', zIndex: '2147483646', left: '50%', bottom: '64px', transform: 'translateX(-50%)', pointerEvents: 'none',
        padding: '12px 26px', borderRadius: '999px', background: 'rgb(33 26 18 / 0.88)', color: '#fff',
        font: '600 28px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif', whiteSpace: 'nowrap', display: 'none'
    });
    document.body.append(pointer, caption);
    addEventListener('mousemove', (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; }, true);
    addEventListener('mousedown', () => { pointer.style.transform = 'scale(0.82)'; }, true);
    addEventListener('mouseup', () => { pointer.style.transform = ''; }, true);
}

const only = (selector) => (page) => page.waitForSelector(selector, { state: 'visible', timeout: 60_000 });

async function caption(page, text) {
    await page.evaluate((words) => {
        const band = document.getElementById('clip-caption');
        if (!band) return;
        band.style.display = words ? 'block' : 'none';
        if (words) band.textContent = words;
    }, text);
    // The recording lags the page by a frame or two: shown before it is kept.
    await page.waitForTimeout(600);
}

// Moves the pointer to the middle of `selector` the way a hand would, then clicks.
let at = { x: SIZE.width / 2, y: SIZE.height / 2 };
async function glideTo(page, x, y, steps = 24) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.move(x, y, { steps });
    at = { x, y };
}
async function press(page, selector, { pause = 350 } = {}) {
    await only(selector)(page);
    const box = await page.locator(selector).first().boundingBox();
    await glideTo(page, box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(pause);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
}

const server = await serve(root);
const base = `http://127.0.0.1:${server.address().port}/`;
const videoDir = await mkdtemp(join(tmpdir(), 'forkbuild-clip-'));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// The stretches of the recording the clip keeps, in seconds: what happens on
// screen, without the waits for a page or a dialog to come up. A stretch
// given a length is sped up to it, so the pointer moves at a person's pace
// however slowly this machine draws the 3D view.
const kept = [];
try {
    const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videoDir, size: SIZE } });
    const page = await context.newPage();
    const started = Date.now();
    const now = () => (Date.now() - started) / 1000;
    async function keep(action, seconds = null) {
        const from = now();
        await action();
        kept.push({ from, to: now(), seconds });
    }
    const hold = (ms) => keep(() => page.waitForTimeout(ms));

    await page.goto(`${base}#/`);
    await only('.home-showcase canvas, .home-showcase .build-turntable-fallback')(page);
    await page.evaluate(overlay);
    await page.waitForTimeout(2500);
    await caption(page, 'Build in 3D, right in your browser');
    await hold(2200);
    await keep(() => press(page, '.home-cta-primary'), 1.2);

    await page.waitForFunction(() => document.querySelector('.document-info-compact-title')?.textContent.trim() === 'House', null, { timeout: 60_000 });
    await page.evaluate(overlay);
    const hide = page.locator('.first-build-link-btn');
    if (await hide.count()) await hide.first().click();
    await page.waitForTimeout(1500);
    await caption(page, 'Here\'s a house with no roof');
    await hold(1800);
    await caption(page, 'Give it a roof');
    await keep(() => press(page, '.starter-job-pick'), 1.2);
    const viewport = await page.locator('.viewport').boundingBox();
    const middle = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
    await keep(async () => {
        await glideTo(page, middle.x - 70, middle.y - 50, 30);
        await glideTo(page, middle.x, middle.y, 16);
        await page.waitForTimeout(400);
        await page.mouse.down();
        await page.mouse.up();
    }, 1.8);
    // Then the job's other steps, briskly: a click on the house puts the
    // chimney and each path stone in its place, and the garden goes where it's put.
    const placeAt = async (x, y, glide = 10) => {
        await glideTo(page, x, y, glide);
        await page.waitForTimeout(150);
        await page.mouse.down();
        await page.mouse.up();
    };
    await only('.starter-job-progress[data-step="chimney"]')(page);
    await caption(page, 'A chimney');
    await keep(() => press(page, '.starter-job-pick'), 0.8);
    await keep(() => placeAt(middle.x + 30, middle.y - 30), 1);
    await only('.starter-job-progress[data-step="path"]')(page);
    await caption(page, 'A path to the door');
    await keep(() => press(page, '.starter-job-pick'), 0.8);
    await keep(async () => { for (let stone = 0; stone < 4; stone += 1) await placeAt(middle.x, middle.y + 20, 6); }, 1.6);
    await only('.starter-job-progress[data-step="garden"]')(page);
    await caption(page, 'And a garden');
    await keep(() => press(page, '.starter-job-pick'), 0.8);
    await keep(async () => {
        for (const [dx, dy] of [[-260, 150], [-200, 200], [240, 160], [190, 210]]) await placeAt(middle.x + dx, middle.y + dy, 8);
    }, 2);
    await only('.starter-job[data-stage="publish"]')(page);
    // Back to Select, so no roof's ghost follows the pointer to Publish.
    await page.keyboard.press('1');
    await caption(page, 'It\'s yours now');
    await hold(1800);

    await caption(page, 'Publish it');
    await keep(() => press(page, '.starter-job-publish'), 1.2);
    // One sheet: remixing and Everyone already on; only the name is typed.
    await only('.publish-sheet-name')(page);
    await keep(async () => {
        await press(page, '.publish-sheet-name', { pause: 200 });
        await page.keyboard.press('Control+A');
        await page.keyboard.type('Robin', { delay: 110 });
        await press(page, '.publish-sheet-publish');
    }, 2.4);
    await only('.editor-post-publish-walk')(page);
    await page.waitForTimeout(800);
    await caption(page, 'Share its link: anyone can remix it');
    await hold(2400);

    await caption(page, 'Then walk inside it');
    await keep(() => press(page, '.editor-post-publish-walk'), 1.2);
    await page.waitForSelector('.world-viewport canvas', { timeout: 60_000 });
    await page.evaluate(overlay);
    await caption(page, 'Then walk inside it');
    await page.waitForTimeout(3000);
    // A sunny day for the walk, whatever time the sky has reached.
    await page.locator('.world-view-advanced-toggle input[type="checkbox"]').first().check();
    // The pointer rests in the sky, where no brick's details pop up.
    const world = await page.locator('.world-viewport canvas').boundingBox();
    await page.mouse.click(world.x + world.width * 0.6, world.y + 12);
    at = { x: world.x + world.width * 0.6, y: world.y + 12 };
    await hold(1200);
    await keep(async () => {
        await page.keyboard.down('w');
        await page.waitForTimeout(4500);
        await page.keyboard.up('w');
        await page.waitForTimeout(1500);
    }, 5);

    await page.goto(`${base}docs/launch/clip/end-card.html`);
    await page.waitForSelector('.end img');
    await page.waitForTimeout(500);
    await hold(3500);
    await context.close();
} finally {
    await browser.close();
    server.close();
}

// The kept stretches, end to end, each at its length, as an H.264 MP4 any
// site takes, at a steady 30 frames a second.
const [webm] = (await readdir(videoDir)).filter((name) => name.endsWith('.webm'));
const parts = kept.map(({ from, to, seconds }, index) => {
    const speed = seconds && to - from > seconds ? seconds / (to - from) : 1;
    return `[0:v]trim=start=${from.toFixed(3)}:end=${to.toFixed(3)},setpts=(PTS-STARTPTS)*${speed.toFixed(4)},fps=30[p${index}]`;
});
const graph = `${parts.join(';')};${kept.map((_, index) => `[p${index}]`).join('')}concat=n=${kept.length}:v=1:a=0[out]`;
execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', join(videoDir, webm), '-filter_complex', graph, '-map', '[out]',
    '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an',
    output
]);
await rm(videoDir, { recursive: true, force: true });
const length = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]).toString());
console.log(`✓ ${output} (${length.toFixed(1)} s)`);
