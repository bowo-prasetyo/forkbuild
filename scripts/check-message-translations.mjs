// Keeps the app's translated messages (ui/i18n/messages/<code>.js) in step
// with their English (ui/i18n/messages/en.js). See "Keeping translations in
// step" in docs/Translating.md.
//
//   node scripts/check-message-translations.mjs            check, exit 1 on a problem
//   node scripts/check-message-translations.mjs --update   record changed English
//   node scripts/check-message-translations.mjs --stamp de [key ...]
//                                                          mark German's translation
//                                                          of those keys (or of every
//                                                          out-of-date key) as up to date
//
// ui/i18n/translation-status.json holds a short hash of every English
// message, and for each language the keys whose English has changed since
// it was translated. When an English message changes, its hash no longer
// matches and the check fails until --update records the new English. That
// marks the message out of date in every language whose translation of it
// hasn't changed since the status file was last committed, so changing the
// English and its translations together leaves nothing out of date. A
// translator brings an out-of-date message up to date and runs --stamp.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STATUS_FILE = 'ui/i18n/translation-status.json';
const MESSAGES_DIR = 'ui/i18n/messages';
const SOURCE = 'en';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A plural message's forms are hashed in a fixed order, so reordering them
// doesn't count as a change.
export function messageHash(message) {
    const text = typeof message === 'string'
        ? message
        : JSON.stringify(Object.keys(message).sort().map((form) => [form, message[form]]));
    return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

// Message files are plain modules with no imports, so one can be loaded from
// any text, including an older version from git.
export async function loadMessages(source) {
    return (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
}

export function messageFile(code) {
    return `${MESSAGES_DIR}/${code}.js`;
}

// Every language with a message file, other than English. The pseudo-locale
// has none: it is made from English.
export async function translatedLanguages() {
    const { LOCALES } = await import(pathToFileURL(join(repoRoot, 'ui/i18n/locales.js')).href);
    return LOCALES.filter((locale) => !locale.pseudo && locale.code !== SOURCE).map((locale) => locale.code);
}

export function readStatus(root = repoRoot) {
    try {
        return JSON.parse(readFileSync(join(root, STATUS_FILE), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return { outOfDate: {}, sourceHashes: {} };
        throw error;
    }
}

export function formatStatus(status) {
    const lines = ['{', '    "outOfDate": {'];
    const codes = Object.keys(status.outOfDate);
    codes.forEach((code, index) => {
        const keys = status.outOfDate[code].map((key) => JSON.stringify(key)).join(', ');
        lines.push(`        ${JSON.stringify(code)}: [${keys}]${index < codes.length - 1 ? ',' : ''}`);
    });
    lines.push('    },', '    "sourceHashes": {');
    const entries = Object.entries(status.sourceHashes);
    entries.forEach(([key, hash], index) => {
        lines.push(`        ${JSON.stringify(key)}: ${JSON.stringify(hash)}${index < entries.length - 1 ? ',' : ''}`);
    });
    lines.push('    }', '}', '');
    return lines.join('\n');
}

// The English keys whose text differs from what the status file recorded:
// changed, added or removed.
export function changedKeys(english, status) {
    const changed = [];
    for (const [key, message] of Object.entries(english)) {
        if (status.sourceHashes[key] !== messageHash(message)) changed.push(key);
    }
    for (const key of Object.keys(status.sourceHashes)) {
        if (!(key in english)) changed.push(key);
    }
    return changed;
}

export function checkStatus(english, status, languages) {
    const errors = [];
    const changed = changedKeys(english, status);
    if (changed.length > 0) {
        const shown = changed.slice(0, 10).join(', ') + (changed.length > 10 ? `, and ${changed.length - 10} more` : '');
        errors.push(`${changed.length} English message(s) changed since ${STATUS_FILE} was updated (${shown}); run node scripts/check-message-translations.mjs --update`);
    }
    for (const code of languages) {
        if (!Array.isArray(status.outOfDate[code])) {
            errors.push(`${STATUS_FILE} has no out-of-date list for ${code}; run node scripts/check-message-translations.mjs --update`);
        }
    }
    for (const [code, keys] of Object.entries(status.outOfDate)) {
        if (!languages.includes(code)) errors.push(`${STATUS_FILE} lists ${code}, which the app doesn't ship`);
        for (const key of keys) {
            if (!(key in english)) errors.push(`${STATUS_FILE} lists ${code}: ${key}, which English no longer has`);
        }
    }
    const outOfDate = languages.flatMap((code) => (status.outOfDate[code] || []).map((key) => ({ code, key })));
    return { errors, outOfDate };
}

// Records the English as it is now. A changed message goes out of date in
// every language whose translation of it is the same as `before[code]` (the
// translations when the status was last recorded); with no `before` for a
// language, every changed message goes out of date in it. A new message is
// out of date where it isn't translated; a removed one leaves every list.
export function updateStatus(english, translations, status, before = {}) {
    const changed = new Set(changedKeys(english, status));
    const outOfDate = {};
    for (const code of Object.keys(translations)) {
        const marked = new Set((status.outOfDate[code] || []).filter((key) => key in english));
        const old = before[code];
        for (const key of changed) {
            if (!(key in english)) continue;
            const translated = translations[code][key];
            const isNew = !(key in status.sourceHashes);
            const retranslated = isNew
                ? translated !== undefined
                : old !== undefined && translated !== undefined && old[key] !== undefined
                    && messageHash(translated) !== messageHash(old[key]);
            if (retranslated) marked.delete(key);
            else marked.add(key);
        }
        outOfDate[code] = Object.keys(english).filter((key) => marked.has(key));
    }
    const sourceHashes = {};
    for (const [key, message] of Object.entries(english)) sourceHashes[key] = messageHash(message);
    return { outOfDate, sourceHashes };
}

// Marks a language's translation of `keys` (or of everything out of date)
// as up to date.
export function stampStatus(status, code, keys = []) {
    const list = status.outOfDate[code];
    if (!list) throw new Error(`${STATUS_FILE} has no language ${code}`);
    const unknown = keys.filter((key) => !list.includes(key));
    if (unknown.length > 0) throw new Error(`not out of date in ${code}: ${unknown.join(', ')}`);
    const stamped = keys.length === 0 ? list : keys;
    return {
        status: { ...status, outOfDate: { ...status.outOfDate, [code]: list.filter((key) => !stamped.includes(key)) } },
        stamped
    };
}

async function readMessages(code) {
    return loadMessages(readFileSync(join(repoRoot, messageFile(code)), 'utf8'));
}

// The translations as they were in the commit that last changed the status
// file. Nothing for a language when there is no such commit or no git.
async function translationsAtLastStatus(languages) {
    const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const before = {};
    let commit = '';
    try {
        commit = git('log', '-1', '--format=%H', '--', STATUS_FILE).trim();
    } catch {
        return before;
    }
    if (!commit) return before;
    for (const code of languages) {
        try {
            before[code] = await loadMessages(git('show', `${commit}:${messageFile(code)}`));
        } catch {
            // The language was added after that commit.
        }
    }
    return before;
}

async function main(args) {
    const languages = await translatedLanguages();
    const english = await readMessages(SOURCE);
    let status = readStatus();

    if (args.includes('--update')) {
        const translations = {};
        for (const code of languages) translations[code] = await readMessages(code);
        const changed = changedKeys(english, status).length;
        status = updateStatus(english, translations, status, await translationsAtLastStatus(languages));
        writeFileSync(join(repoRoot, STATUS_FILE), formatStatus(status));
        console.log(`Recorded ${changed} changed English message(s) in ${STATUS_FILE}.`);
    }

    const stampAt = args.indexOf('--stamp');
    if (stampAt !== -1) {
        const [code, ...keys] = args.slice(stampAt + 1).filter((arg) => !arg.startsWith('--'));
        if (!code) {
            console.error('--stamp needs a language code, then optionally the keys to mark as up to date');
            return 1;
        }
        try {
            const result = stampStatus(status, code, keys);
            status = result.status;
            console.log(`Marked ${result.stamped.length} ${code} message(s) as up to date.`);
        } catch (error) {
            console.error(`✗ ${error.message}`);
            return 1;
        }
        writeFileSync(join(repoRoot, STATUS_FILE), formatStatus(status));
    }

    const { errors, outOfDate } = checkStatus(english, status, languages);
    for (const { code, key } of outOfDate) {
        console.log(`Out of date: ${code} ${key} (English: ${JSON.stringify(english[key])})`);
    }
    if (outOfDate.length > 0) {
        console.log(`To see how an English message changed: git log -p -G"'<key>':" -- ${messageFile(SOURCE)}`);
    }
    for (const error of errors) console.error(`✗ ${error}`);
    if (errors.length > 0) return 1;
    console.log(`✓ ${Object.keys(english).length} message(s) in ${languages.length} language(s) checked, ${outOfDate.length} translation(s) out of date.`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    process.exitCode = await main(process.argv.slice(2));
}
