// German (ui/i18n/messages/de.js): complete, chosen from the browser, and
// read with German number formats, its one/other plurals and its own word order.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('de');
assert(locale && locale.name === 'Deutsch' && locale.dir === 'ltr', '1. German is shipped, named in German');
const de = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in de));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(negotiateLocale(null, ['de-DE']) === 'de' && negotiateLocale(null, ['de-AT']) === 'de' && negotiateLocale(null, ['de']) === 'de', '3. A German browser gets German');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('de'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'de', messages: de, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === 'Start', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === 'Stein platzieren' && say('history.placeBricks', { count: 3 }) === '3 Steine platzieren',
    '6. One form for one, another for every other count');
assert(say('resident.buildBy', { title: 'Hügelburg', author: 'anna', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === 'Das Bauwerk „Hügelburg“ von anna steht etwa 3,2 km nördlich von hier.',
    '7. A resident speaks German, with a decimal comma');
assert(say('history.undo', { action: message('history.moveBricks', { count: 1200 }) }) === 'Rückgängig: 1.200 Steine verschieben', '8. Undo labels, with German digit grouping');
assert(say('document.forkOf', { title: 'Weidendorf' }) === 'Fork von Weidendorf', '9. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'jonas' }) === 'Verbinde mit jonas', '10. A name in a sentence');
assert(say('compass.ne') === 'NO' && say('compass.e') === 'O', '11. Compass points');

console.log('✅ All German locale tests passed.');
