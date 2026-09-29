// Test-support only. Older tests check a component's wording by reading its
// source ("the button says Diagnostic Tools"). Since the UI moved to t()
// (docs/Translating.md), that wording lives in ui/i18n/messages/en.js; this
// puts the English back where each parameterless t('key') stands, so such a
// check still reads the words a person sees:
//   {{ t('a.b') }}      → the English
//   :title="t('a.b')"   → title="the English"
//   t('a.b') elsewhere  → 'the English' (a string literal)
//   message('a.b')      → 'the English' (core/ and application/ code)
// A call with parameters is left as it is.
import en from '../../ui/i18n/messages/en.js';

function english(key) {
    const value = en[key];
    if (typeof value !== 'string') {
        throw new Error(`EnglishSource: no plain English message for ${key}`);
    }
    return value;
}

// The English as the inside of a single-quoted literal: backslashes first,
// then quotes, so the literal reads back as the same text.
function quoted(key) {
    return english(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function withEnglish(source) {
    return source
        .replace(/\{\{\s*t\('([\w.]+)'\)\s*\}\}/g, (match, key) => english(key))
        .replace(/:([\w-]+)="t\('([\w.]+)'\)"/g, (match, attribute, key) => `${attribute}="${english(key)}"`)
        .replace(/\b(?:t|message)\('([\w.]+)'\)/g, (match, key) => `'${quoted(key)}'`);
}
