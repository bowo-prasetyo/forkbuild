// French (ui/i18n/messages/fr.js): complete, chosen from any French browser,
// and read with French number formats and typography, its one/many/other
// plurals (0 and 1 are "one"; a million takes "de") and its own word order.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const NBSP = ' ';
const NNBSP = ' ';

const locale = findLocale('fr');
assert(locale && locale.name === 'Français' && locale.dir === 'ltr', '1. French is shipped, named in French');
const fr = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in fr));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(['fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH'].every((language) => negotiateLocale(null, [language]) === 'fr'), '3. Any French browser gets French');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('fr'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'fr', messages: fr, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === 'Accueil', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === 'Placer la brique' && say('history.placeBricks', { count: 3 }) === 'Placer 3 briques',
    '6. One form for one, another for other counts');
assert(say('createBlueprint.selected', { count: 0 }) === '0 brique sélectionnée', '7. Zero takes the singular in French');
assert(say('history.moveBricks', { count: 1000000 }) === `Déplacer 1${NNBSP}000${NNBSP}000 de briques`, '8. A million takes "de" (the "many" form)');
assert(say('resident.buildBy', { title: 'Château du Lac', author: 'ana', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === `Il y a une construction appelée «${NBSP}Château du Lac${NBSP}», de ana, à environ 3,2 km au nord.`,
    '9. A resident speaks French, with a decimal comma and guillemets');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12000 }) }) === `Annuler${NBSP}: Déplacer 12${NNBSP}000 briques`,
    '10. Undo labels, with French digit grouping and a space before the colon');
assert(say('document.forkOf', { title: 'Village des Saules' }) === 'Fork de Village des Saules', '11. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'jonas' }) === 'Connexion à jonas', '12. A name in a sentence');
assert(say('compass.e') === 'E' && say('compass.sw') === 'SO' && say('compass.w') === 'O', '13. Compass points');
assert(say('worldView.whatSHere') === `Qu’y a-t-il ici${NNBSP}?`, '14. A narrow space before a question mark');

const strings = Object.values(fr).flatMap((value) => (typeof value === 'string' ? [value] : Object.values(value)));
const asciiApostrophe = strings.filter((text) => /[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/.test(text));
assert(asciiApostrophe.length === 0, `15. Apostrophes are typographic (’), not ' (found: ${asciiApostrophe.slice(0, 3).join(' | ')})`);
const looseSpace = strings.filter((text) => / [:;!?»]|« /.test(text));
assert(looseSpace.length === 0, `16. Punctuation that takes a space in French has a non-breaking one (found: ${looseSpace.slice(0, 3).join(' | ')})`);

console.log('✅ All French locale tests passed.');
