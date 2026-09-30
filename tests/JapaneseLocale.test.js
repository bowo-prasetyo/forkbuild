// Japanese (ui/i18n/messages/ja.js): complete, chosen from the browser, and
// read with its single plural form and its own word order.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('ja');
assert(locale && locale.name === '日本語' && locale.dir === 'ltr', '1. Japanese is shipped, named in Japanese');
const ja = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in ja));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(negotiateLocale(null, ['ja-JP']) === 'ja' && negotiateLocale(null, ['ja']) === 'ja', '3. A Japanese browser gets Japanese');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('ja'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'ja', messages: ja, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === 'ホーム', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === 'ブロックを配置' && say('history.placeBricks', { count: 3 }) === '3個のブロックを配置',
    '6. One form for every count, with an exact form for one');
assert(say('resident.buildBy', { title: '丘の砦', author: 'taro', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === '北へ約3.2 km行ったところにtaroさんの「丘の砦」という作品があります。',
    '7. A resident speaks Japanese, with the place before the thing');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12 }) }) === '元に戻す: 12個のブロックを移動', '8. Undo labels');
assert(say('document.forkOf', { title: '柳の村' }) === '柳の村のフォーク', '9. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'hanako' }) === 'hanakoさんに接続中', '10. A name goes before the verb');
assert(say('compass.ne') === '北東', '11. Compass points');

console.log('✅ All Japanese locale tests passed.');
