import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../ui/i18n/locales.js';
import { SHOTS, screenshotFolder } from '../scripts/user-guide-screenshots.mjs';
import { assert } from './support/Assert.js';

// The user guide shows pictures of the main screens in each language the app
// ships (scripts/user-guide-screenshots.mjs takes them), and every picture a
// guide page names is there.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

{
    const missing = [];
    for (const locale of LOCALES.filter((l) => !l.pseudo)) {
        for (const shot of SHOTS) {
            if (!existsSync(join(screenshotFolder(locale.code), shot.file))) missing.push(`${locale.code}/${shot.file}`);
        }
    }
    assert(missing.length === 0, `every shipped language has the guide's pictures (missing: ${missing.join(', ')}); run node scripts/user-guide-screenshots.mjs`);
    console.log('✓ every shipped language has the guide\'s pictures of the main screens');
}

{
    const guide = join(root, 'docs/user');
    const pages = readdirSync(guide).filter((f) => f.endsWith('.md')).map((f) => join(guide, f));
    for (const dir of readdirSync(guide, { withFileTypes: true })) {
        if (dir.isDirectory() && dir.name !== 'img') {
            pages.push(...readdirSync(join(guide, dir.name)).filter((f) => f.endsWith('.md')).map((f) => join(guide, dir.name, f)));
        }
    }
    const broken = [];
    let count = 0;
    for (const page of pages) {
        for (const match of readFileSync(page, 'utf8').matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
            count++;
            if (!existsSync(join(dirname(page), match[1]))) broken.push(`${page.slice(root.length + 1)} → ${match[1]}`);
        }
    }
    assert(count > 0, 'the guide shows pictures');
    assert(broken.length === 0, `every picture a guide page names exists:\n  ${broken.join('\n  ')}`);
    console.log(`✓ the guide's ${count} pictures all exist`);
}

{
    // A translated page shows its own language's pictures, never another's.
    const wrong = [];
    for (const locale of LOCALES.filter((l) => !l.pseudo && l.code !== 'en')) {
        const dir = join(root, 'docs/user', locale.code);
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
            for (const match of readFileSync(join(dir, file), 'utf8').matchAll(/!\[[^\]]*\]\(\.\.\/img\/([^/)]+)\//g)) {
                if (match[1] !== locale.code) wrong.push(`${locale.code}/${file} shows img/${match[1]}`);
            }
        }
    }
    assert(wrong.length === 0, `each translation shows its own language's pictures:\n  ${wrong.join('\n  ')}`);
    console.log('✓ each translation shows its own language\'s pictures');
}
