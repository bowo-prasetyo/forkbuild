import { readFileSync, readdirSync } from 'node:fs';
import { assert } from './support/Assert.js';

// The look around the 3D view (css/main/theme.css; docs/Pillars.md, "Look"):
// a light, warm village rather than a dark tool. The colours are named once
// in theme.css; this checks that its words stay readable on its grounds, and
// that the dark grounds and light-grey words the shell used to have don't
// come back. The bundled-site test checks the page as a browser draws it.

const root = new URL('../', import.meta.url);
const theme = readFileSync(new URL('css/main/theme.css', root), 'utf8');

function token(name) {
    const match = theme.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i'));
    assert(match, `theme.css names --${name}`);
    return match[1];
}

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
}

// Words on the grounds they sit on: 4.5:1 for body text (WCAG AA), the
// faintest included, on the page and on a card.
{
    const grounds = ['paper', 'surface-low', 'surface'];
    for (const ink of ['ink-strong', 'ink', 'ink-soft', 'ink-muted', 'ink-subtle', 'ink-faint', 'accent-ink']) {
        for (const ground of grounds) {
            const ratio = contrast(token(ink), token(ground));
            assert(ratio >= 4.5, `--${ink} on --${ground} is ${ratio.toFixed(2)}:1, under 4.5:1`);
        }
    }
    for (const button of ['accent', 'accent-hover']) {
        const ratio = contrast('#ffffff', token(button));
        assert(ratio >= 4.5, `white on --${button} is ${ratio.toFixed(2)}:1, under 4.5:1`);
    }
    console.log('✓ every ink reads at 4.5:1 or more on the page and its panels, and white on the green buttons');
}

// Light and warm: the grounds are pale, with more red than blue in them.
{
    for (const ground of ['paper', 'surface-low', 'surface', 'surface-raised']) {
        const hex = token(ground);
        const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        assert(luminance(hex) > 0.75 && r > b, `--${ground} (${hex}) is light and warm`);
    }
    console.log('✓ the grounds are light and warm');
}

// The old dark shell stays gone: no stylesheet paints the page or a panel
// with its near-black greys, or writes with its light greys.
{
    const dir = new URL('css/main/', root);
    const sheets = readdirSync(dir).filter((name) => name.endsWith('.css')).map((name) => [`css/main/${name}`, readFileSync(new URL(name, dir), 'utf8')]);
    sheets.push(['css/embed.css', readFileSync(new URL('css/embed.css', root), 'utf8')]);
    const grey = (hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return Math.max(r, g, b) - Math.min(r, g, b) < 12 ? r : null;
    };
    for (const [name, css] of sheets) {
        for (const [, hex] of css.matchAll(/background(?:-color)?\s*:\s*[^;]*?(#[0-9a-f]{6})\b/gi)) {
            const level = grey(hex);
            assert(level === null || level > 0x60, `${name} paints a dark grey ground (${hex})`);
        }
        for (const [, hex] of css.matchAll(/(?:^|[;{\s])color\s*:\s*(#[0-9a-f]{6})\b/gi)) {
            const level = grey(hex);
            assert(level === null || level < 0x60 || level === 0xff, `${name} writes in a light grey (${hex})`);
        }
    }
    assert(sheets.some(([, css]) => css.includes("@import url('main/theme.css')")), 'the embed takes its colours from theme.css too');
    console.log('✓ no stylesheet paints the old dark grounds or writes in the old light greys');
}
