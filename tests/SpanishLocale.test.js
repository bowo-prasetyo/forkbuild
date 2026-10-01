// Spanish (ui/i18n/messages/es.js): neutral Latin American Spanish, complete,
// chosen from any Spanish browser, and read with Spanish number formats, its
// one/other plurals and its own word order.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('es');
assert(locale && locale.name === 'Español' && locale.dir === 'ltr', '1. Spanish is shipped, named in Spanish');
const es = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in es));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(['es-MX', 'es-419', 'es-AR', 'es-ES', 'es'].every((language) => negotiateLocale(null, [language]) === 'es'), '3. Any Spanish browser gets Spanish');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('es'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'es', messages: es, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === 'Inicio', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === 'Colocar bloque' && say('history.placeBricks', { count: 3 }) === 'Colocar 3 bloques',
    '6. One form for one, another for every other count');
assert(say('resident.buildBy', { title: 'Castillo del Cerro', author: 'ana', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === 'Hay una construcción llamada “Castillo del Cerro”, de ana, a unos 3,2 km al norte.',
    '7. A resident speaks Spanish, with a decimal comma');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12000 }) }) === 'Deshacer: Mover 12.000 bloques', '8. Undo labels, with Spanish digit grouping');
assert(say('document.forkOf', { title: 'Aldea de los Sauces' }) === 'Bifurcación de Aldea de los Sauces', '9. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'jonas' }) === 'Conectando con jonas', '10. A name in a sentence');
assert(say('compass.sw') === 'SO' && say('compass.w') === 'O' && say('compass.nw') === 'NO', '11. Compass points');

console.log('✅ All Spanish locale tests passed.');
