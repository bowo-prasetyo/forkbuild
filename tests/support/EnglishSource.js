// Test-support only. Older tests check a component's wording by reading its
// source ("the button says Diagnostic Tools"). Since the UI moved to t()
// (docs/Translating.md), that wording lives in ui/i18n/messages/en.js; this
// puts the English back where each parameterless t('key') stands, so such a
// check still reads the words a person sees:
//   {{ t('a.b') }}      → the English
//   :title="t('a.b')"   → title="the English"
//   t('a.b') elsewhere  → 'the English' (a string literal)
// A t() call with parameters is left as it is.
import en from '../../ui/i18n/messages/en.js';

function english(key) {
    const value = en[key];
    if (typeof value !== 'string') {
        throw new Error(`EnglishSource: no plain English message for ${key}`);
    }
    return value;
}

export function withEnglish(source) {
    return source
        .replace(/\{\{\s*t\('([\w.]+)'\)\s*\}\}/g, (match, key) => english(key))
        .replace(/:([\w-]+)="t\('([\w.]+)'\)"/g, (match, attribute, key) => `${attribute}="${english(key)}"`)
        .replace(/\bt\('([\w.]+)'\)/g, (match, key) => `'${english(key).replace(/'/g, "\\'")}'`);
}
