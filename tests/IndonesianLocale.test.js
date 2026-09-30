// Bahasa Indonesia (ui/i18n/messages/id.js): complete, chosen from the
// browser, and read with Indonesian number formats and its single plural form.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('id');
assert(locale && locale.name === 'Bahasa Indonesia' && locale.dir === 'ltr', '1. Indonesian is shipped, named in Indonesian');
const id = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in id));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(negotiateLocale(null, ['id-ID']) === 'id' && negotiateLocale(null, ['in', 'id']) === 'id', '3. An Indonesian browser gets Indonesian');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('id'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'id', messages: id, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === 'Beranda', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === 'Tempatkan Balok' && say('history.placeBricks', { count: 3 }) === 'Tempatkan 3 Balok',
    '6. One form for every count, with an exact form for one');
assert(say('resident.buildBy', { title: 'Benteng Bukit', author: 'budi', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === 'Ada bangunan bernama “Benteng Bukit” karya budi, sekitar 3,2 km ke arah utara.',
    '7. A resident speaks Indonesian, with the decimal comma');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12 }) }) === 'Urungkan Pindahkan 12 Balok', '8. Undo labels');
assert(say('document.forkOf', { title: 'Desa Dedalu' }) === 'Fork dari Desa Dedalu', '9. A fork\'s title');

console.log('✅ All Indonesian locale tests passed.');
