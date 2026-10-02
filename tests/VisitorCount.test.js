import {
    DEFAULT_VISITOR_COUNT_SETTINGS, VISITOR_COUNT_ENDPOINT, VISITOR_COUNT_SITE_ORIGIN,
    asksNotToBeTracked, localDayOf, normalizeVisitorCountSettings, shouldCountVisit, visitorCountHitUrl
} from '../core/VisitorCount.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { countDailyVisit } from '../application/settings/CountDailyVisit.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The daily visitor count (docs/Privacy.md, "Visitor count"): at most one
// anonymous hit a day, from the official site only, never from a browser
// that asks not to be tracked or has turned it off.

const SITE = VISITOR_COUNT_SITE_ORIGIN;
const MORNING = new Date(2026, 9, 2, 8, 0);
const EVENING = new Date(2026, 9, 2, 23, 30);
const NEXT_DAY = new Date(2026, 9, 3, 0, 5);

function visit(store, { now = MORNING, origin = SITE, privacySignals = {} } = {}) {
    const hits = [];
    const sent = countDailyVisit({ settingsStore: store, origin, privacySignals, now, random: () => 0.123456, sendHit: (url) => hits.push(url) });
    assert(sent === (hits.length === 1), 'countDailyVisit says whether it sent a hit');
    return hits;
}

// Settings: on unless turned off, read leniently.
{
    assert(DEFAULT_VISITOR_COUNT_SETTINGS.enabled === true && DEFAULT_VISITOR_COUNT_SETTINGS.lastCountedDay === null, 'on by default, never counted');
    for (const bad of [null, undefined, 'off', 7, [], { enabled: 'no', lastCountedDay: 'yesterday' }]) {
        const settings = normalizeVisitorCountSettings(bad);
        assert(settings.enabled === true && settings.lastCountedDay === null, `${JSON.stringify(bad)} reads as the default`);
    }
    assert(normalizeVisitorCountSettings({ enabled: false }).enabled === false, 'turning it off is kept');
    assert(normalizeVisitorCountSettings({ lastCountedDay: '2026-10-02' }).lastCountedDay === '2026-10-02', 'the last day is kept');
    assert(Object.isFrozen(normalizeVisitorCountSettings({})), 'settings are immutable');
    assert(localDayOf(new Date(2026, 0, 5, 23, 59)) === '2026-01-05', 'the day is this device\'s calendar day');
    console.log('✓ settings and days');
}

// Global Privacy Control and Do Not Track both mean "don't count me".
{
    assert(asksNotToBeTracked({ globalPrivacyControl: true }), 'Global Privacy Control');
    assert(asksNotToBeTracked({ doNotTrack: '1' }) && asksNotToBeTracked({ doNotTrack: 'yes' }), 'Do Not Track, in both spellings browsers use');
    for (const signals of [{}, undefined, { globalPrivacyControl: false, doNotTrack: '0' }, { doNotTrack: 'unspecified' }, { doNotTrack: null }]) {
        assert(!asksNotToBeTracked(signals), `${JSON.stringify(signals)} does not ask`);
    }
    console.log('✓ privacy signals');
}

// The hit names nothing: a fixed path and a cache-buster only.
{
    const url = new URL(visitorCountHitUrl('42'));
    assert(`${url.origin}${url.pathname}` === VISITOR_COUNT_ENDPOINT, 'it goes to the counter endpoint');
    assert(url.searchParams.get('p') === '/' && url.searchParams.get('rnd') === '42', 'path / and the cache-buster');
    assert([...url.searchParams.keys()].sort().join() === 'p,rnd', `nothing else is sent (found ${[...url.searchParams.keys()]})`);
    console.log('✓ the hit carries a fixed path only');
}

// Once a day: the first visit of a day counts, later ones that day don't,
// and the next day counts again.
{
    const storage = new InMemoryStorageProvider();
    const store = new VisitorCountSettingsStore({ storageProvider: storage });
    const first = visit(store);
    assert(first.length === 1 && first[0] === visitorCountHitUrl('123456'), 'the first visit sends one hit');
    assert(store.get().lastCountedDay === '2026-10-02', 'the day is remembered');
    assert(visit(store, { now: EVENING }).length === 0, 'a later visit the same day sends nothing');
    assert(visit(new VisitorCountSettingsStore({ storageProvider: storage }), { now: EVENING }).length === 0, 'even after a reload');
    assert(visit(store, { now: NEXT_DAY }).length === 1, 'the next day counts again');
    console.log('✓ once a day');
}

// Never from another origin, never when turned off, never when the browser
// asks not to be tracked; and none of those uses up the day.
{
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    for (const origin of ['http://localhost:8000', 'http://127.0.0.1:8000', 'https://someone.github.io', 'http://bowo-prasetyo.github.io', 'null']) {
        assert(visit(store, { origin }).length === 0, `${origin} is not counted`);
    }
    assert(visit(store, { privacySignals: { globalPrivacyControl: true } }).length === 0, 'Global Privacy Control is honored');
    assert(visit(store, { privacySignals: { doNotTrack: '1' } }).length === 0, 'Do Not Track is honored');
    assert(store.get().lastCountedDay === null, 'a visit that was not counted does not use up the day');

    store.setEnabled(false);
    assert(visit(store).length === 0, 'turned off, nothing is sent');
    assert(store.get().enabled === false && store.get().lastCountedDay === null, 'and nothing is recorded');
    store.setEnabled(true);
    assert(visit(store).length === 1, 'turned back on, the visit counts');
    assert(shouldCountVisit({ settings: { enabled: true }, day: '2026-10-02', origin: SITE, privacySignals: {} }), 'shouldCountVisit agrees');
    console.log('✓ only the official site, only when allowed');
}

// A counter must never stop the app opening.
{
    class BrokenStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
        save() { throw new Error('full'); }
    }
    const store = new VisitorCountSettingsStore({ storageProvider: new BrokenStorage() });
    assert(store.get().enabled === true, 'a storage error reads as the default');
    assert(visit(store).length === 0, 'a storage that cannot save sends nothing, and does not throw');

    const healthy = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const sent = countDailyVisit({ settingsStore: healthy, origin: SITE, privacySignals: {}, now: MORNING, sendHit: () => { throw new Error('no Image'); } });
    assert(sent === false, 'a failing send is swallowed');

    let threw = false;
    try {
        new VisitorCountSettingsStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'a StorageProvider is required');
    console.log('✓ failures never escape');
}

console.log('\n✅ All VisitorCount tests passed.');
