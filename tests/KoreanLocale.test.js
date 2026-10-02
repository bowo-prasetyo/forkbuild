// Korean (ui/i18n/messages/ko.js): complete, chosen from any Korean browser,
// and read with Korean number formats, its single plural form (with an exact
// form for one where English drops the number) and its own word order.
import { LOCALES, findLocale, negotiateLocale, SOURCE_MESSAGES } from '../ui/i18n/locales.js';
import { Translator } from '../ui/i18n/Translator.js';
import { message } from '../core/Message.js';
import { assert } from './support/Assert.js';

const locale = findLocale('ko');
assert(locale && locale.name === '한국어' && locale.dir === 'ltr', '1. Korean is shipped, named in Korean');
const ko = await locale.loadMessages();
const missing = Object.keys(SOURCE_MESSAGES).filter((key) => !(key in ko));
assert(missing.length === 0, `2. Every English key is translated (missing: ${missing.slice(0, 5).join(', ')})`);
assert(['ko', 'ko-KR', 'ko-KP'].every((language) => negotiateLocale(null, [language]) === 'ko'), '3. Any Korean browser gets Korean');
assert(LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code).includes('ko'), '4. It is offered on the Language page');

const translator = new Translator({ locale: 'ko', messages: ko, fallbackMessages: SOURCE_MESSAGES });
const say = (key, params) => translator.translate(key, params);
assert(say('app.nav.home') === '홈', '5. Plain text');
assert(say('history.placeBricks', { count: 1 }) === '블록 배치' && say('history.placeBricks', { count: 3 }) === '블록 3개 배치',
    '6. One brick drops the number, as in English; other counts take a counter');
assert(say('createBlueprint.selected', { count: 0 }) === '블록 0개 선택됨' && say('createBlueprint.selected', { count: 1 }) === '블록 1개 선택됨',
    '7. Korean has one plural form');
assert(say('history.undo', { action: message('history.moveBricks', { count: 12000 }) }) === '블록 12,000개 이동 실행 취소',
    '8. Undo labels, with Korean digit grouping and the verb last');
assert(say('resident.buildBy', { title: '버드나무 성', author: 'ana', where: message('resident.where.north', { distance: message('resident.distance.kilometers', { kilometers: 3.2 }) }) })
    === '북쪽으로 약 3.2km 떨어진 곳에 ana 님이 만든 “버드나무 성”이라는 작품이 있어요.',
    '9. A resident speaks Korean, the place first and politely');
assert(say('document.forkOf', { title: '버드나무 마을' }) === '버드나무 마을의 포크', '10. A fork\'s title');
assert(say('peerConnections.connectingTo', { name: 'jonas' }) === 'jonas 님과 연결 중', '11. A name in a sentence takes 님');
assert(say('compass.n') === '북' && say('compass.se') === '남동' && say('units.metersToward', { distance: 40, direction: say('compass.w') }) === '서쪽 40m',
    '12. Compass points');

const strings = Object.values(ko).flatMap((value) => (typeof value === 'string' ? [value] : Object.values(value)));
const asciiQuote = strings.filter((text) => /[가-힣A-Za-z]'|'[가-힣A-Za-z]/.test(text));
assert(asciiQuote.length === 0, `13. Quotes are typographic, not ' (found: ${asciiQuote.slice(0, 3).join(' | ')})`);

console.log('✅ All Korean locale tests passed.');
