import { readFileSync } from 'node:fs';
import {
    STATUS_FILE, changedKeys, checkStatus, formatStatus, loadMessages, messageHash, readStatus, stampStatus, translatedLanguages, updateStatus
} from '../scripts/check-message-translations.mjs';
import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// ui/i18n/translation-status.json matches the English messages and names
// only messages and languages that exist. When this fails after editing
// ui/i18n/messages/en.js, run:
// node scripts/check-message-translations.mjs --update
{
    const { errors } = checkStatus(en, readStatus(), await translatedLanguages());
    assert(errors.length === 0, `${STATUS_FILE}:\n${errors.join('\n')}`);
    assert(readFileSync(new URL(`../${STATUS_FILE}`, import.meta.url), 'utf8') === formatStatus(readStatus()), `${STATUS_FILE} is written by --update`);
    console.log('✓ the translation status matches the English messages');
}

// A message's hash changes with its text, not with the order of its plural
// forms.
{
    assert(messageHash('Save') !== messageHash('Save all'), 'different text, different hash');
    assert(messageHash({ one: 'a', other: 'b' }) === messageHash({ other: 'b', one: 'a' }), 'plural forms in any order');
    assert(messageHash({ one: 'a', other: 'b' }) !== messageHash({ one: 'a', other: 'c' }), 'a changed plural form');
    const loaded = await loadMessages("export default Object.freeze({ 'a.b': 'It\\'s here' });");
    assert(loaded['a.b'] === "It's here", 'a message file loads from its text');
    console.log('✓ message hashes');
}

// Changed English goes out of date where its translation stayed the same,
// and a translator stamps it back.
{
    const oldEnglish = { save: 'Save', open: 'Open', close: 'Close' };
    const oldGerman = { save: 'Speichern', open: 'Öffnen', close: 'Schließen' };
    const oldJapanese = { save: '保存', open: '開く', close: '閉じる' };
    let status = updateStatus(oldEnglish, { de: oldGerman, ja: oldJapanese }, { outOfDate: {}, sourceHashes: {} });
    assert(status.outOfDate.de.length === 0 && status.outOfDate.ja.length === 0, 'nothing is out of date at first');
    assert(checkStatus(oldEnglish, status, ['de', 'ja']).errors.length === 0, 'in step at first');

    // English changes "save", drops "close" and adds "print"; German is
    // changed with it, Japanese isn't.
    const english = { save: 'Save all', open: 'Open', print: 'Print' };
    const german = { save: 'Alle speichern', open: 'Öffnen', print: 'Drucken' };
    const japanese = { save: '保存', open: '開く' };
    assert(changedKeys(english, status).sort().join() === 'close,print,save', 'changed, added and removed keys');
    const { errors } = checkStatus(english, status, ['de', 'ja']);
    assert(errors.length === 1 && errors[0].includes('--update'), 'changed English fails the check');

    status = updateStatus(english, { de: german, ja: japanese }, status, { de: oldGerman, ja: oldJapanese });
    assert(status.outOfDate.de.length === 0, 'a translation changed with its English stays up to date');
    assert(status.outOfDate.ja.join() === 'save,print', 'an unchanged or missing translation goes out of date');
    let result = checkStatus(english, status, ['de', 'ja']);
    assert(result.errors.length === 0 && result.outOfDate.length === 2, 'out of date passes the check and is listed');

    const unknown = updateStatus({ ...english, open: 'Open…' }, { de: german, ja: japanese }, status);
    assert(unknown.outOfDate.de.join() === 'open', 'without the earlier translations every changed message goes out of date');

    status = stampStatus(status, 'ja', ['save']).status;
    assert(status.outOfDate.ja.join() === 'print', 'stamping a key');
    let threw = false;
    try {
        stampStatus(status, 'ja', ['open']);
    } catch {
        threw = true;
    }
    assert(threw, 'only an out-of-date key can be stamped');
    status = stampStatus(status, 'ja').status;
    assert(status.outOfDate.ja.length === 0, 'stamping every key');

    status.outOfDate.ko = ['gone'];
    result = checkStatus(english, status, ['de', 'ja']);
    assert(result.errors.length === 2, 'an unshipped language and a removed key are reported');
    console.log('✓ English changes put unchanged translations out of date until stamped');
}

console.log('✅ All message translation tests passed.');
