// Keeps the translated user guides (docs/user/<language>/) in step with
// their English originals. See "Translating the user guide" in
// docs/Translating.md.
//
//   node scripts/check-doc-translations.mjs            check, exit 1 on a problem
//   node scripts/check-doc-translations.mjs --update   fix what can be fixed
//   node scripts/check-doc-translations.mjs --stamp docs/user/ja/FAQ.md
//                                                      mark a translation as up
//                                                      to date with its English
//
// Every translation starts with a line naming its English original and a
// hash of the English text it was translated from:
//
//   <!-- translation-of: docs/user/FAQ.md source-hash: 0123456789abcdef -->
//
// When the English changes, the hash no longer matches and the translation
// is out of date. It then has to carry a banner (between `<!-- stale -->`
// and `<!-- /stale -->`) telling readers so and pointing to the English;
// --update adds or removes it. After bringing a translation up to date,
// --stamp records the English it now matches and takes the banner away.
//
// Every page that has a translation, English or not, carries a line of
// links to its other languages (between `<!-- languages -->` and
// `<!-- /languages -->`), which --update writes. That line is left out of
// the hash, so adding a translation doesn't put the others out of date.
//
// It also checks every relative link in a translation, including the
// heading it points to: a translated heading has its own anchor.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SOURCE_LANGUAGE = Object.freeze({ code: 'en', name: 'English' });

// The languages the user guide is translated into, each in its own folder
// under docs/user/, with the banner an out-of-date page carries. `{source}`
// is the link to the English page.
export const LANGUAGES = Object.freeze([
    Object.freeze({
        code: 'id',
        name: 'Bahasa Indonesia',
        staleBanner: '> **Catatan:** Halaman berbahasa Inggris ini telah diubah sejak diterjemahkan, jadi terjemahan ini mungkin sudah tidak sesuai. Lihat [versi bahasa Inggris]({source}).'
    }),
    Object.freeze({
        code: 'ja',
        name: '日本語',
        staleBanner: '> **注意:** このページの英語版は翻訳後に更新されているため、この翻訳は古くなっている可能性があります。[英語版]({source})も参照してください。'
    })
]);

const USER_GUIDE = 'docs/user';
const HEADER = /^<!-- translation-of: (\S+) source-hash: ([0-9a-f]{16}) -->\n/;
const LANGUAGES_BLOCK = /\n<!-- languages -->\n[^\n]*\n<!-- \/languages -->\n/;
const STALE_BLOCK = /\n<!-- stale -->\n[^\n]*\n<!-- \/stale -->\n/;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(root, path) {
    return readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
}

// The hash of an English page as a translation sees it: its text without
// the line of language links.
export function sourceHash(markdown) {
    const text = markdown.replace(/\r\n/g, '\n').replace(LANGUAGES_BLOCK, '');
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function parseHeader(markdown) {
    const match = HEADER.exec(markdown);
    return match ? { source: match[1], hash: match[2] } : null;
}

// Code spans and fenced blocks, blanked out so their contents are never
// read as links or headings.
function withoutCode(markdown) {
    return markdown
        .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
        .replace(/`[^`\n]*`/g, (span) => span.replace(/[^`]/g, ' '));
}

// Text with its HTML tags left out, as GitHub shows it. A '<' never
// survives, even in a malformed tag.
function withoutTags(text) {
    let result = '';
    let inTag = false;
    for (const character of text) {
        if (character === '<') inTag = true;
        else if (character === '>' && inTag) inTag = false;
        else if (!inTag) result += character;
    }
    return result;
}

// The anchor GitHub gives a heading: its text, lowercased, without
// punctuation or symbols, with spaces turned into hyphens.
export function githubSlug(heading) {
    const text = withoutTags(heading.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'))
        .replace(/[`*]/g, '')
        .replace(/(^|\s)_+|_+(\s|$)/g, '$1$2');
    return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

export function headingAnchors(markdown) {
    const anchors = new Set();
    const counts = new Map();
    const source = markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
    for (const match of source.matchAll(/^#{1,6}[ \t]+(.+?)[ \t#]*$/gm)) {
        const slug = githubSlug(match[1]);
        const seen = counts.get(slug) || 0;
        counts.set(slug, seen + 1);
        anchors.add(seen === 0 ? slug : `${slug}-${seen}`);
    }
    return anchors;
}

export function relativeLinks(markdown) {
    const links = [];
    for (const match of withoutCode(markdown).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = match[1].replace(/^<|>$/g, '');
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        links.push(target);
    }
    return links;
}

// Every translation, as { path, code } with a repository-relative path.
export function listTranslations(root = repoRoot) {
    const translations = [];
    for (const language of LANGUAGES) {
        const folder = posix.join(USER_GUIDE, language.code);
        if (!existsSync(join(root, folder))) continue;
        for (const name of readdirSync(join(root, folder)).sort()) {
            if (name.endsWith('.md')) translations.push({ path: posix.join(folder, name), code: language.code });
        }
    }
    return translations;
}

function linkFrom(fromPath, toPath) {
    return posix.relative(posix.dirname(fromPath), toPath);
}

// The line of language links for one page, `current` being the page's own
// language. `pages` maps a language code to that language's page.
export function languagesLine(current, pages) {
    const all = [SOURCE_LANGUAGE, ...LANGUAGES].filter((language) => pages[language.code]);
    return all.map((language) => (language.code === current
        ? `**${language.name}**`
        : `[${language.name}](${linkFrom(pages[current], pages[language.code])})`)).join(' · ');
}

// Puts `block` (null to remove it) after the page's first heading and
// its line of language links, or replaces the one already there.
function placeBlock(markdown, pattern, block) {
    const text = block ? `\n${block}\n` : '';
    if (pattern.test(markdown)) return markdown.replace(pattern, text);
    if (!block) return markdown;
    const heading = /^# [^\n]*\n/m.exec(markdown);
    let at = heading ? heading.index + heading[0].length : 0;
    const languages = LANGUAGES_BLOCK.exec(markdown.slice(at));
    if (languages && languages.index === 0) at += languages[0].length;
    return `${markdown.slice(0, at)}${text}${markdown.slice(at)}`;
}

function languagesBlock(current, pages) {
    return `<!-- languages -->\n${languagesLine(current, pages)}\n<!-- /languages -->`;
}

function staleBlock(language, translationPath, sourcePath) {
    const banner = language.staleBanner.replace('{source}', linkFrom(translationPath, sourcePath));
    return `<!-- stale -->\n${banner}\n<!-- /stale -->`;
}

// What every page should look like: for each English page with a
// translation and each translation, its expected text. Also returns the
// problems that need a person (a missing or unreadable header, a missing
// original) and which translations are out of date.
function plan(root) {
    const problems = [];
    const stale = [];
    const expected = new Map();
    const pagesBySource = new Map();
    const translations = [];
    for (const { path, code } of listTranslations(root)) {
        const markdown = read(root, path);
        const header = parseHeader(markdown);
        if (!header) {
            problems.push(`${path}: the first line must be <!-- translation-of: <English page> source-hash: <hash> --> (see docs/Translating.md)`);
            continue;
        }
        if (!existsSync(join(root, header.source))) {
            problems.push(`${path}: its English page ${header.source} doesn't exist`);
            continue;
        }
        const pages = pagesBySource.get(header.source) || { en: header.source };
        if (pages[code]) {
            problems.push(`${path}: ${pages[code]} already translates ${header.source} into ${code}`);
            continue;
        }
        pages[code] = path;
        pagesBySource.set(header.source, pages);
        translations.push({ path, code, header, markdown });
    }
    for (const { path, code, header, markdown } of translations) {
        const language = LANGUAGES.find((candidate) => candidate.code === code);
        const isStale = sourceHash(read(root, header.source)) !== header.hash;
        if (isStale) stale.push({ path, source: header.source });
        let text = placeBlock(markdown, LANGUAGES_BLOCK, languagesBlock(code, pagesBySource.get(header.source)));
        text = placeBlock(text, STALE_BLOCK, isStale ? staleBlock(language, path, header.source) : null);
        expected.set(path, text);
    }
    for (const [source, pages] of pagesBySource) {
        expected.set(source, placeBlock(read(root, source), LANGUAGES_BLOCK, languagesBlock('en', pages)));
    }
    return { problems, stale, expected };
}

// The broken relative links in one page, as messages.
function brokenLinks(root, path, markdown) {
    const broken = [];
    for (const link of relativeLinks(markdown)) {
        const [target, anchor] = link.split('#');
        const targetPath = target ? posix.normalize(posix.join(posix.dirname(path), target)) : path;
        if (!existsSync(join(root, targetPath))) {
            broken.push(`${path}: link to ${link}: ${targetPath} doesn't exist`);
            continue;
        }
        if (anchor === undefined || !targetPath.endsWith('.md') || statSync(join(root, targetPath)).isDirectory()) continue;
        const targetText = targetPath === path ? markdown : read(root, targetPath);
        if (!headingAnchors(targetText).has(decodeURIComponent(anchor))) {
            broken.push(`${path}: link to ${link}: ${targetPath} has no heading with that anchor`);
        }
    }
    return broken;
}

// Checks every translation. `errors` lists everything that fails the check;
// `stale` lists the out-of-date translations (with their banner, they pass).
export function checkTranslations(root = repoRoot) {
    const { problems, stale, expected } = plan(root);
    const errors = [...problems];
    const translations = listTranslations(root).map((translation) => translation.path);
    for (const [path, text] of expected) {
        if (read(root, path) === text) continue;
        const what = translations.includes(path) ? 'its line of language links or its out-of-date banner' : 'its line of language links';
        errors.push(`${path}: ${what} isn't right; run node scripts/check-doc-translations.mjs --update`);
    }
    for (const path of translations) errors.push(...brokenLinks(root, path, read(root, path)));
    return { errors, stale };
}

// Writes the language links and out-of-date banners. Returns the paths it
// changed.
export function updatePages(root = repoRoot) {
    const changed = [];
    for (const [path, text] of plan(root).expected) {
        if (read(root, path) !== text) {
            writeFileSync(join(root, path), text);
            changed.push(path);
        }
    }
    return changed;
}

// Records that a translation matches its English page as it is now.
export function stampTranslation(path, root = repoRoot) {
    const markdown = read(root, path);
    const header = parseHeader(markdown);
    if (!header) throw new Error(`${path} has no translation-of header`);
    const hash = sourceHash(read(root, header.source));
    writeFileSync(join(root, path), markdown.replace(HEADER, `<!-- translation-of: ${header.source} source-hash: ${hash} -->\n`));
}

function main(args) {
    const stampAt = args.indexOf('--stamp');
    if (stampAt !== -1) {
        const paths = args.slice(stampAt + 1).filter((arg) => !arg.startsWith('--'));
        if (paths.length === 0) {
            console.error('--stamp needs the translations to mark as up to date');
            return 1;
        }
        for (const path of paths) stampTranslation(relative(repoRoot, resolve(path)).split('\\').join('/'));
        console.log(`Marked ${paths.length} translation(s) as up to date.`);
    }
    if (args.includes('--update') || stampAt !== -1) {
        for (const path of updatePages()) console.log(`Updated ${path}`);
    }
    const { errors, stale } = checkTranslations();
    for (const { path, source } of stale) {
        console.log(`Out of date: ${path} (its English, ${source}, has changed). To see what changed:`);
        console.log(`  git diff $(git log -1 --format=%H -G'source-hash' -- ${path}) HEAD -- ${source}`);
    }
    for (const error of errors) console.error(`✗ ${error}`);
    if (errors.length > 0) return 1;
    console.log(`✓ ${listTranslations().length} translated page(s) checked, ${stale.length} out of date.`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    process.exitCode = main(process.argv.slice(2));
}
