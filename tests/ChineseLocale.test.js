// Simplified Chinese (ui/i18n/messages/zh.js): complete, chosen from any
// Chinese browser, and read with Chinese number formats, its single plural
// form (with an exact form for one where English drops the number), its own
// word order and full-width punctuation.
import { LOCALES, findLocale, negotiateLocale } from '../ui/i18n/locales.js';
import SOURCE_MESSAGES from '../ui/i18n/messages/en.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/app/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('zh');
assert(locale && locale.name === '中文（简体）' && locale.dir === 'ltr', '1. Chinese is shipped, named in Chinese');
const zh = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in zh));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(['zh', 'zh-CN', 'zh-Hans', 'zh-SG', 'zh-TW', 'zh-HK'].every((language) => negotiateLocale(null, [language]) === 'zh'),
    '3. Any Chinese browser gets Simplified Chinese, the only Chinese shipped');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('zh'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'zh', messages: zh, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === '首页', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === '放置积木' && say('history.placeBricks', { count: 3 }) === '放置 3 块积木',
    '6. One brick drops the number, as in English; other counts take a measure word');
assert(say('createBlueprint.selected', { count: 0 }) === '已选择 0 块积木' && say('createBlueprint.selected', { count: 1 }) === '已选择 1 块积木',
    '7. Chinese has one plural form');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12000 }) }) === '撤销移动 12,000 块积木',
    '8. Undo labels, with Chinese digit grouping');
assert(say('resident.buildBy', { title: '柳树城堡', author: 'ana', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === '北边约 3.2 公里处有一个 ana 搭的作品，叫“柳树城堡”。',
    '9. A resident speaks Chinese, the place first');
assert(say('document.forkOf', { title: '柳树村' }) === '柳树村的改编', '10. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'jonas' }) === '正在与 jonas 连接', '11. A name in a sentence');
assert(say('compass.n') === '北' && say('compass.se') === '东南' && say('units.metersToward', { distance: 40, direction: say('compass.w') }) === '西 40 米',
    '12. Compass points');

// Sentences use full-width punctuation and Chinese quotation marks; the word
// lists that are split on commas (*.words, *.keywords, the plain command's
// parts and colours, Help's examples) keep ASCII commas between their words.
const LISTS = /words|keywords|examples|ignoredWords|IgnoredWords|plainCommand\.(part|colour)\./;
const sentences = Object.entries(zh).filter(([key]) => !LISTS.test(key))
    .flatMap(([, value]) => (typeof value === 'string' ? [value] : Object.values(value)));
const halfWidth = sentences.filter((text) => /\p{Script=Han}[,.:;?!'"]|[,.:;?!'"](?=\p{Script=Han})/u.test(text) || /\p{Script=Han}\.\.\./u.test(text));
assert(halfWidth.length === 0, `13. Punctuation next to Chinese is full-width (found: ${halfWidth.slice(0, 3).join(' | ')})`);

console.log('✅ All Chinese locale tests passed.');
