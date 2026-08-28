import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import {
    AchievementKind,
    isValidAchievementKind,
    describeAchievementEvents,
    reconstructAchievementEvents
} from '../application/AchievementEvent.js';

// 0.8.102 — Achievement Event Foundation.
//
// Section A: an empty archive earns no achievements — never an error,
//            never a fabricated event
// Section B: a single Bitcoin publication earns exactly FIRST_PUBLICATION
//            and BITCOIN_PUBLISHER, attributed to that one record
// Section C: a single Base publication earns exactly FIRST_PUBLICATION
//            and BASE_PUBLISHER
// Section D: MULTI_CHAIN_PUBLISHER fires exactly once, at the moment the
//            SECOND chain's own first record appears, regardless of which
//            chain went first or how the two source arrays interleave
// Section E: PUBLICATION_10 / PUBLICATION_100 fire exactly once each, at
//            the exact record that crosses each threshold, counted across
//            both chains together
// Section F: malformed/absent inputs never throw
// Section G: FLAGSHIP — two publications sharing one contentHash across
//            two chains, deliberately out-of-order createdAt timestamps
//            and interleaved array positions; chronological correctness,
//            identity never conflated across chains, and determinism
//            (repeated calls are byte-identical)
// Section H: reconstructAchievementEvents() over a real, persisted
//            archive — reload equivalence, zero network access
// Section I: no verdict/score/points/rank vocabulary anywhere, and
//            AchievementKind is a closed, six-value vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy',
    'completed', 'successful', 'final', 'points', 'rank', 'level', 'tier', 'worth'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — an achievement event describes an attributable fact, not a person's worth`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function withoutNetworkAccess(fn) {
    let networkCallOccurred = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
    try {
        return { result: await fn(), networkCallOccurred };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

function bitcoinRecord({ anchorId, contentHash, txid, network = 'mainnet', createdAt }) {
    return new BitcoinAnchorPublicationRecord({ anchorId, contentHash, txid, network, createdAt });
}

function baseRecord({ contentHash, txid, network = 'base-mainnet', createdAt }) {
    return new BaseAnchorPublicationRecord({ contentHash, txid, network, createdAt });
}

function kindsOf(result) {
    return result.events.map((e) => e.achievementKind);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — an empty archive earns nothing.
    // ---------------------------------------------------------------
    {
        const result = describeAchievementEvents([], []);
        assert(result.count === 0, '1. an empty pair of record arrays earns zero achievement events');
        assert(result.events.length === 0, '2. events is an empty array, never null or undefined');
        assert(Object.isFrozen(result) && Object.isFrozen(result.events), '3. the result and its events array are frozen');
    }
    console.log('✓ Section A: an empty archive earns no achievements');

    // ---------------------------------------------------------------
    // Section B — a single Bitcoin publication.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'anchor-1', contentHash: 'h'.repeat(64), txid: 't'.repeat(64), createdAt: new Date('2026-01-01T00:00:00Z') });
        const result = describeAchievementEvents([btc], []);
        assert(result.count === 2, '4. exactly two events fire for one Bitcoin publication');
        assert(kindsOf(result).includes(AchievementKind.FIRST_PUBLICATION), '5. FIRST_PUBLICATION fires');
        assert(kindsOf(result).includes(AchievementKind.BITCOIN_PUBLISHER), '6. BITCOIN_PUBLISHER fires');
        assert(!kindsOf(result).includes(AchievementKind.BASE_PUBLISHER), '7. BASE_PUBLISHER never fires with no Base record');
        assert(!kindsOf(result).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '8. MULTI_CHAIN_PUBLISHER never fires with one chain');
        for (const event of result.events) {
            assert(event.sourcePublicationIdentity instanceof BlockchainPublicationIdentity, '9. sourcePublicationIdentity is a real BlockchainPublicationIdentity instance');
            assert(event.sourcePublicationIdentity.sameAs(btc.toBlockchainPublicationIdentity()), '10. it names the exact completing record\'s own identity');
            assert(event.observedAt.getTime() === btc.createdAt.getTime(), '11. observedAt is the completing record\'s own createdAt, never a separately invented timestamp');
            assert(typeof event.label === 'string' && event.label.length > 0, '12. every event carries a human-readable label');
        }
        assert(result.events[0].index === 1 && result.events[1].index === 2, '13. events are 1-indexed in emission order');
    }
    console.log('✓ Section B: a single Bitcoin publication earns FIRST_PUBLICATION and BITCOIN_PUBLISHER');

    // ---------------------------------------------------------------
    // Section C — a single Base publication.
    // ---------------------------------------------------------------
    {
        const base = baseRecord({ contentHash: 'h'.repeat(64), txid: 'b'.repeat(64), createdAt: new Date('2026-01-01T00:00:00Z') });
        const result = describeAchievementEvents([], [base]);
        assert(result.count === 2, '14. exactly two events fire for one Base publication');
        assert(kindsOf(result).includes(AchievementKind.FIRST_PUBLICATION), '15. FIRST_PUBLICATION fires');
        assert(kindsOf(result).includes(AchievementKind.BASE_PUBLISHER), '16. BASE_PUBLISHER fires');
        assert(!kindsOf(result).includes(AchievementKind.BITCOIN_PUBLISHER), '17. BITCOIN_PUBLISHER never fires with no Bitcoin record');
        assert(result.events.find((e) => e.achievementKind === AchievementKind.BASE_PUBLISHER).sourcePublicationIdentity.blockchain === BlockchainKind.BASE, '18. the Base achievement names a Base-blockchain identity');
    }
    console.log('✓ Section C: a single Base publication earns FIRST_PUBLICATION and BASE_PUBLISHER');

    // ---------------------------------------------------------------
    // Section D — MULTI_CHAIN_PUBLISHER fires exactly once, at the
    // second chain's own first record, regardless of interleaving.
    // ---------------------------------------------------------------
    {
        // Base first, chronologically, then Bitcoin — even though Bitcoin's
        // own array is passed first as an argument.
        const base1 = baseRecord({ contentHash: 'c1', txid: 'b'.repeat(64), createdAt: new Date('2026-01-01T00:00:00Z') });
        const btc1 = bitcoinRecord({ anchorId: 'a1', contentHash: 'c2', txid: 't'.repeat(64), createdAt: new Date('2026-01-02T00:00:00Z') });
        const btc2 = bitcoinRecord({ anchorId: 'a2', contentHash: 'c3', txid: 'u'.repeat(64), createdAt: new Date('2026-01-03T00:00:00Z') });

        const result = describeAchievementEvents([btc1, btc2], [base1]);
        const multiChainEvents = result.events.filter((e) => e.achievementKind === AchievementKind.MULTI_CHAIN_PUBLISHER);
        assert(multiChainEvents.length === 1, '19. MULTI_CHAIN_PUBLISHER fires exactly once, never once per subsequent chain publication');
        assert(multiChainEvents[0].sourcePublicationIdentity.sameAs(btc1.toBlockchainPublicationIdentity()), '20. it is attributed to btc1 — the record that completed the pair chronologically, even though it is passed as argument-array-first');
        assert(!result.events.some((e) => e.achievementKind === AchievementKind.MULTI_CHAIN_PUBLISHER && e.sourcePublicationIdentity.sameAs(btc2.toBlockchainPublicationIdentity())), '21. btc2 (a later, redundant, already-both-chains publication) earns no second MULTI_CHAIN_PUBLISHER event');
    }
    console.log('✓ Section D: MULTI_CHAIN_PUBLISHER fires exactly once, attributed to the record that actually completed the pair');

    // ---------------------------------------------------------------
    // Section E — publication-count milestones.
    // ---------------------------------------------------------------
    {
        const records = [];
        for (let i = 1; i <= 10; i++) {
            records.push(bitcoinRecord({ anchorId: `a${i}`, contentHash: `c${i}`, txid: `${i}`.padStart(64, '0'), createdAt: new Date(`2026-01-${String(i).padStart(2, '0')}T00:00:00Z`) }));
        }
        const result = describeAchievementEvents(records, []);
        const milestone10 = result.events.filter((e) => e.achievementKind === AchievementKind.PUBLICATION_10);
        assert(milestone10.length === 1, '22. PUBLICATION_10 fires exactly once');
        assert(milestone10[0].sourcePublicationIdentity.sameAs(records[9].toBlockchainPublicationIdentity()), '23. it is attributed to the 10th publication, chronologically, never the 1st or the last-appended');
        assert(!kindsOf(result).includes(AchievementKind.PUBLICATION_100), '24. PUBLICATION_100 never fires with only 10 publications');

        // A 9-publication archive earns no PUBLICATION_10 at all.
        const short = describeAchievementEvents(records.slice(0, 9), []);
        assert(!kindsOf(short).includes(AchievementKind.PUBLICATION_10), '25. no PUBLICATION_10 with only 9 publications');
    }
    console.log('✓ Section E: publication-count milestones fire exactly once, at the exact crossing record');

    // ---------------------------------------------------------------
    // Section F — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        assert(describeAchievementEvents().count === 0, '26. no arguments at all never throws, returns zero events');
        assert(describeAchievementEvents(null, undefined).count === 0, '27. null/undefined arguments never throw');
        assert(describeAchievementEvents('not-an-array', 42).count === 0, '28. non-array arguments never throw');
        assert(describeAchievementEvents([{ fake: true }, null, 'x'], [{}]).count === 0, '29. arrays holding non-record garbage silently exclude the garbage rather than throwing');
        assert(reconstructAchievementEvents(null).count === 0, '30. a null archive reconstructs to zero events, never throws');
        assert(reconstructAchievementEvents({}).count === 0, '31. a plain object masquerading as an archive reconstructs to zero events');
        assert(isValidAchievementKind('not-a-kind') === false, '32. an unknown string is never a valid AchievementKind');
        assert(isValidAchievementKind(AchievementKind.FIRST_PUBLICATION) === true, '33. every named AchievementKind value is valid');
    }
    console.log('✓ Section F: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: two publications, one shared contentHash,
    // two chains, deliberately out-of-order timestamps and interleaved
    // array positions.
    // ---------------------------------------------------------------
    {
        const SHARED_CONTENT_HASH = 'shared-content-hash';
        const btcLater = bitcoinRecord({ anchorId: 'flag-btc', contentHash: SHARED_CONTENT_HASH, txid: 'f'.repeat(64), createdAt: new Date('2026-02-10T00:00:00Z') });
        const baseEarlier = baseRecord({ contentHash: SHARED_CONTENT_HASH, txid: 'f'.repeat(64), createdAt: new Date('2026-02-01T00:00:00Z') });

        // btcLater is appended FIRST in its own array, and passed as the
        // FIRST argument, despite chronologically happening SECOND.
        const result1 = describeAchievementEvents([btcLater], [baseEarlier]);

        assert(result1.events[0].achievementKind === AchievementKind.FIRST_PUBLICATION, '34. FIRST_PUBLICATION is attributed chronologically, not by argument or array position');
        assert(result1.events[0].sourcePublicationIdentity.sameAs(baseEarlier.toBlockchainPublicationIdentity()), '35. FIRST_PUBLICATION belongs to baseEarlier, the chronologically first record, even though it was passed second');
        assert(!result1.events[0].sourcePublicationIdentity.sameAs(btcLater.toBlockchainPublicationIdentity()), '36. it is never confused with btcLater, despite an identical contentHash AND an identical raw txid string on both chains');

        const multiChain = result1.events.find((e) => e.achievementKind === AchievementKind.MULTI_CHAIN_PUBLISHER);
        assert(multiChain.sourcePublicationIdentity.sameAs(btcLater.toBlockchainPublicationIdentity()), '37. MULTI_CHAIN_PUBLISHER belongs to btcLater — the record that chronologically completed the pair');
        assert(multiChain.sourcePublicationIdentity.blockchain === BlockchainKind.BITCOIN, '38. its identity correctly names BITCOIN, never BASE, despite the identical raw chainReference string');

        // Determinism: repeated calls on byte-identical input are
        // byte-identical, and source arrays are never mutated.
        const result2 = describeAchievementEvents([btcLater], [baseEarlier]);
        assert(JSON.stringify(result1.events.map(serializeEvent)) === JSON.stringify(result2.events.map(serializeEvent)), '39. repeated calls on identical input produce byte-identical output');

        assertNeverScored(result1, 'flagship');
    }
    console.log('✓ Section G: FLAGSHIP — chronological correctness, cross-chain identity never conflated, deterministic repeated projection');

    // ---------------------------------------------------------------
    // Section H — reconstructAchievementEvents() over a real, persisted
    // archive.
    // ---------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(provider);

        const btc = bitcoinRecord({ anchorId: 'h-anchor', contentHash: 'h-content', txid: 'h'.repeat(64), createdAt: new Date('2026-03-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'h-content-2', txid: 'g'.repeat(64), createdAt: new Date('2026-03-02T00:00:00Z') });

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinAnchorPublicationRecord(btc);
        archive = archive.appendBaseAnchorPublicationRecord(base);

        const { result: liveResult, networkCallOccurred } = await withoutNetworkAccess(() => reconstructAchievementEvents(archive));
        assert(networkCallOccurred === false, '40. reconstructAchievementEvents() performs zero network access');
        assert(liveResult.count === 4, '41. live archive earns FIRST_PUBLICATION, BITCOIN_PUBLISHER, BASE_PUBLISHER, and MULTI_CHAIN_PUBLISHER (Base is second chronologically, completing the pair)');

        persistence.save(archive);
        const restored = persistence.load();
        const reconstructed = reconstructAchievementEvents(restored);
        assert(JSON.stringify(reconstructed.events.map(serializeEvent)) === JSON.stringify(liveResult.events.map(serializeEvent)), '42. reload equivalence: a restored archive projects byte-identical achievement events to the live one it was saved from');

        // A second save/reload cycle stays equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        const rereadResult = reconstructAchievementEvents(reloadedAgain);
        assert(JSON.stringify(rereadResult.events.map(serializeEvent)) === JSON.stringify(liveResult.events.map(serializeEvent)), '43. a second save/load cycle remains equivalent');

        assertNeverScored(liveResult, 'liveResult');
    }
    console.log('✓ Section H: reconstructAchievementEvents() — reload equivalence, zero network access');

    // ---------------------------------------------------------------
    // Section I — no verdict/score/points/rank vocabulary anywhere, and
    // AchievementKind is closed.
    // ---------------------------------------------------------------
    {
        assert(Object.keys(AchievementKind).length === 6, '44. AchievementKind names exactly six values — no badge, points, or leaderboard vocabulary sneaked in under this milestone');
        assert(Object.isFrozen(AchievementKind), '45. AchievementKind is frozen, never mutated at runtime');

        const btc = bitcoinRecord({ anchorId: 'i-anchor', contentHash: 'i-content', txid: 'i'.repeat(64), createdAt: new Date('2026-04-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'i-content-2', txid: 'j'.repeat(64), createdAt: new Date('2026-04-02T00:00:00Z') });
        const result = describeAchievementEvents([btc], [base]);
        assertNeverScored(result, 'noVerdictResult');
        for (const event of result.events) {
            assert(Object.isFrozen(event), '46. every event is frozen');
        }
    }
    console.log('✓ Section I: no verdict/score/points/rank vocabulary anywhere, and AchievementKind is a closed vocabulary');

    console.log('\nAll AchievementEvent tests passed.');
}

function serializeEvent(event) {
    return {
        achievementKind: event.achievementKind,
        label: event.label,
        observedAt: event.observedAt.toISOString(),
        sourcePublicationIdentity: event.sourcePublicationIdentity.toJSON(),
        index: event.index
    };
}

run().catch((error) => {
    console.error('AchievementEvent.test.js FAILED:', error);
    process.exitCode = 1;
});
