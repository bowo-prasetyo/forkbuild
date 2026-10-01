// Brazilian Portuguese (ui/i18n/messages/pt-BR.js): complete, chosen from any
// Portuguese browser, and read with Brazilian number formats, its one/other
// plurals and its own word order.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('pt-BR');
assert(locale && locale.name === 'Português (Brasil)' && locale.dir === 'ltr', '1. Brazilian Portuguese is shipped, named in Portuguese');
const pt = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in pt));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(['pt-BR', 'pt-PT', 'pt'].every((language) => negotiateLocale(null, [language]) === 'pt-BR'), '3. Any Portuguese browser gets Brazilian Portuguese');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('pt-BR'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'pt-BR', messages: pt, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === 'Início', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === 'Colocar bloco' && say('history.placeBricks', { count: 3 }) === 'Colocar 3 blocos',
    '6. One form for one, another for every other count');
assert(say('resident.buildBy', { title: 'Castelo do Morro', author: 'ana', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === 'Tem uma construção chamada “Castelo do Morro”, de ana, a uns 3,2 km ao norte.',
    '7. A resident speaks Portuguese, with a decimal comma');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12000 }) }) === 'Desfazer: Mover 12.000 blocos', '8. Undo labels, with Brazilian digit grouping');
assert(say('document.forkOf', { title: 'Vila dos Salgueiros' }) === 'Bifurcação de Vila dos Salgueiros', '9. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'jonas' }) === 'Conectando a jonas', '10. A name in a sentence');
assert(say('compass.e') === 'L' && say('compass.sw') === 'SO' && say('compass.w') === 'O', '11. Compass points');

console.log('✅ All Brazilian Portuguese locale tests passed.');
