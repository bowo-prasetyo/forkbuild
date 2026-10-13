import { readFileSync, readdirSync } from 'node:fs';
import { assert } from './support/Assert.js';

// The look around the 3D view (css/main/theme.css; docs/Pillars.md, "Look"):
// a light, warm village rather than a dark tool. The colours are named once
// in theme.css; this checks that its words stay readable on its grounds, and
// that the dark grounds and light-grey words the shell used to have don't
// come back; and the same village after dark: its own colours for every
// name, as readable, and every stylesheet drawing through the names so the
// dark look reaches it. The bundled-site test checks the page as a browser
// draws it, tests/DarkLookBrowser.test.js the dark look.

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

// After dark: the two dark blocks (the device's dark mode, and Dark chosen)
// are the same, and give every colour name its own dark value.
const lightBlock = theme.slice(0, theme.indexOf('@media (prefers-color-scheme: dark)'));
const darkBlock = theme.slice(theme.indexOf(':root[data-look="dark"] {'));
const mediaBlock = theme.slice(theme.indexOf(':root:not([data-look="light"]) {'), theme.indexOf(':root[data-look="dark"] {'));
const declarations = (block) => [...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => `${name}: ${value.trim()}`);
{
    assert(mediaBlock && darkBlock && JSON.stringify(declarations(mediaBlock)) === JSON.stringify(declarations(darkBlock)),
        'the device\'s dark mode and a chosen Dark give the same colours');
    assert(/color-scheme:\s*dark/.test(darkBlock), 'the browser\'s own controls go dark too');
    const darkNames = new Set(declarations(darkBlock).map((line) => line.split(':')[0]));
    const colourNames = declarations(lightBlock).map((line) => line.split(':')[0]).filter((name) => name !== '--font-ui' && name !== '--overlay');
    const missing = colourNames.filter((name) => !darkNames.has(name));
    assert(missing.length === 0, `every colour has a dark value (missing: ${missing.join(', ')})`);
    console.log('✓ the dark look names every colour, the same for the device\'s dark mode and a chosen Dark');
}

{
    const darkToken = (name) => {
        const match = darkBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i'));
        return match ? match[1] : token(name);
    };
    const inks = ['ink-strong', 'ink', 'ink-soft', 'ink-muted', 'ink-subtle', 'ink-faint', 'accent-ink',
        'ink-amber', 'ink-red', 'ink-green', 'ink-blue', 'ink-purple', 'ink-indigo', 'ink-teal', 'ink-rose'];
    for (const [look, colour] of [['by day', token], ['after dark', darkToken]]) {
        for (const ink of inks) {
            for (const ground of ['paper', 'surface-low', 'surface']) {
                const value = contrast(colour(ink), colour(ground));
                assert(value >= 4.5, `${look}: --${ink} on --${ground} is ${value.toFixed(2)}:1, under 4.5:1`);
            }
        }
        for (const hue of ['amber', 'red', 'green', 'blue', 'purple']) {
            const value = contrast(colour(`ink-${hue}`), colour(`tint-${hue}`));
            assert(value >= 4.5, `${look}: --ink-${hue} on --tint-${hue} is ${value.toFixed(2)}:1, under 4.5:1`);
        }
        for (const button of ['accent', 'accent-hover']) {
            assert(contrast('#ffffff', colour(button)) >= 4.5, `${look}: white on --${button} reads`);
        }
    }
    for (const ground of ['paper', 'surface-low', 'surface', 'surface-raised']) {
        const hex = darkToken(ground);
        const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        assert(luminance(hex) < 0.03 && r > b, `after dark, --${ground} (${hex}) is dark and warm`);
    }
    console.log('✓ after dark too, every ink reads at 4.5:1 or more, on the page, its panels and its tints');
}

// The stylesheets draw through the names, so the dark look reaches them: no
// dark coloured words, pale grounds or paper-coloured glass of their own,
// and no name used that theme.css doesn't give.
{
    const dir = new URL('css/main/', root);
    const sheets = readdirSync(dir).filter((name) => name.endsWith('.css') && name !== 'theme.css')
        .map((name) => [`css/main/${name}`, readFileSync(new URL(name, dir), 'utf8')]);
    sheets.push(['css/embed.css', readFileSync(new URL('css/embed.css', root), 'utf8')]);
    const defined = new Set([...theme.matchAll(/(--[a-z-]+):/g)].map(([, name]) => name));
    const hsl = (hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        return { lightness: (max + min) / 2, chroma: max - min };
    };
    for (const [name, raw] of sheets) {
        const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [, hex] of css.matchAll(/(?:^|[;{\s])(?:color|fill|stroke)\s*:\s*(#[0-9a-f]{6})\b/gi)) {
            const { lightness, chroma } = hsl(hex);
            assert(!(chroma > 0.12 && lightness < 0.45), `${name} writes in a dark colour of its own (${hex}); use an --ink- name`);
        }
        for (const [, hex] of css.matchAll(/background(?:-color)?\s*:\s*[^;]*?(#[0-9a-f]{6})\b/gi)) {
            assert(hsl(hex).lightness <= 0.8, `${name} paints a pale ground of its own (${hex}); use a --tint- or --surface name`);
        }
        assert(!/rgba\(\s*(253, 248, 238|96, 72, 40|74, 52, 24)\s*,/.test(css), `${name} uses the paper, line or shadow colour by number; use --overlay-rgb, --edge-rgb or --shade-rgb`);
        for (const [, used] of css.matchAll(/var\((--[a-z-]+)/g)) {
            const local = new RegExp(`${used}\\s*:`).test(css);
            assert(defined.has(used) || local, `${name} uses ${used}, which theme.css doesn't name`);
        }
    }
    console.log('✓ every stylesheet draws through theme.css\'s names, so the dark look reaches it');
}
