import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { PublicationReferenceRecord } from '../application/PublicationReferenceRecord.js';
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
//            AchievementKind is a closed, eleven-value vocabulary
//
// 0.8.106 — Reference-Derived Achievement Events.
//
// Section J: backward compatibility — an omitted/empty third argument
//            leaves the six 0.8.102 achievements byte-for-byte unchanged
// Section K: FIRST_REFERENCE_CREATED / FIRST_REFERENCE_RECEIVED fire once
//            each, attributed to the source/referenced identity
//            respectively, carrying the triggering reference
// Section L: reference record count and distinct referencing publication
//            count are different facts — repeated A -> B references never
//            re-fire FIRST_REFERENCE_CREATED/RECEIVED and never advance a
//            distinct-source threshold
// Section M: REFERENCED_BY_10_PUBLICATIONS fires exactly once, at the 10th
//            DISTINCT referencing publication, never the 10th reference
//            record; REFERENCED_BY_100_PUBLICATIONS never fires early
// Section N: FIRST_CROSS_CHAIN_REFERENCE fires strictly on
//            source.blockchain !== referenced.blockchain, once per distinct
//            source; the reverse direction is a separate occurrence; a
//            same-chain reference never fires it
// Section O: FLAGSHIP — ten distinct referencing publications (one of them
//            referencing twice), a shared contentHash across two otherwise
//            distinct identities, a cross-chain reference among them,
//            deliberately out-of-order createdAt timestamps and interleaved
//            array positions; correct chronological attribution, no
//            identity conflation, determinism, and zero network/storage
//            mutation
// Section P: reconstructAchievementEvents() composes publication AND
//            reference achievements over a real, persisted archive — reload
//            equivalence
// Section Q: no verdict/score/points/rank vocabulary anywhere in this
//            milestone's own new surface, including `triggeringReference`

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

// 0.8.106 — a lightweight identity helper, mirroring
// tests/PublicationReferenceRecord.test.js's own `identity()` exactly, used
// where a scenario needs many distinct publication identities (Section O's
// own ten-distinct-referencer flagship) without constructing a full
// Bitcoin/BaseAnchorPublicationRecord for each one.
function identity({ blockchain, contentHash, chainReference, createdAt }) {
    return new BlockchainPublicationIdentity({ blockchain, contentHash, chainReference, createdAt });
}

function referenceRecord({ source, referenced, createdAt }) {
    return new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });
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
        assert(Object.keys(AchievementKind).length === 11, '44. AchievementKind names exactly eleven values (six from 0.8.102, five reference-derived from 0.8.106) — no badge, points, or leaderboard vocabulary sneaked in under either milestone');
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

    // =================================================================
    // 0.8.106 — Reference-Derived Achievement Events.
    // =================================================================

    // ---------------------------------------------------------------
    // Section J — backward compatibility: an omitted/empty third
    // argument leaves the 0.8.102 achievements byte-for-byte unchanged.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'j-anchor', contentHash: 'j-content', txid: 'j'.repeat(64), createdAt: new Date('2026-05-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'j-content-2', txid: 'k'.repeat(64), createdAt: new Date('2026-05-02T00:00:00Z') });

        const withoutThirdArg = describeAchievementEvents([btc], [base]);
        const withEmptyThirdArg = describeAchievementEvents([btc], [base], []);
        assert(withoutThirdArg.count === 4, '47. omitting the third argument still earns exactly the four 0.8.102 achievements (FIRST_PUBLICATION, BITCOIN_PUBLISHER, BASE_PUBLISHER, MULTI_CHAIN_PUBLISHER)');
        assert(JSON.stringify(withoutThirdArg.events.map(serializeEvent)) === JSON.stringify(withEmptyThirdArg.events.map(serializeEvent)), '48. an omitted third argument and an explicit empty array produce byte-identical results');
        assert(!withoutThirdArg.events.some((event) => 'triggeringReference' in event), '49. no publication-derived event ever carries a triggeringReference field');
    }
    console.log('✓ Section J: an omitted/empty third argument leaves the 0.8.102 achievements byte-for-byte unchanged');

    // ---------------------------------------------------------------
    // Section K — FIRST_REFERENCE_CREATED / FIRST_REFERENCE_RECEIVED.
    // ---------------------------------------------------------------
    {
        const alice = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'k-alice', chainReference: 'k-alice-txid', createdAt: new Date('2026-06-01T00:00:00Z') });
        const bob = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'k-bob', chainReference: 'k-bob-txid', createdAt: new Date('2026-06-01T00:00:00Z') });
        const createdAt = new Date('2026-06-02T00:00:00Z');
        const aliceReferencesBob = referenceRecord({ source: alice, referenced: bob, createdAt });

        const result = describeAchievementEvents([], [], [aliceReferencesBob]);
        assert(result.count === 2, '50. a single reference earns exactly FIRST_REFERENCE_CREATED and FIRST_REFERENCE_RECEIVED');
        const created = result.events.find((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_CREATED);
        const received = result.events.find((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_RECEIVED);
        assert(created.sourcePublicationIdentity.sameAs(alice), "51. FIRST_REFERENCE_CREATED is attributed to the reference's own source (Alice)");
        assert(received.sourcePublicationIdentity.sameAs(bob), "52. FIRST_REFERENCE_RECEIVED is attributed to the reference's own referenced identity (Bob)");
        assert(created.observedAt.getTime() === createdAt.getTime(), "53. observedAt is the triggering reference's own createdAt");
        assert(created.triggeringReference.sourcePublicationIdentity.sameAs(alice) && created.triggeringReference.referencedPublicationIdentity.sameAs(bob), '54. triggeringReference names the exact reference that earned the achievement');
        assert(created.triggeringReference.createdAt.getTime() === createdAt.getTime(), '55. triggeringReference.createdAt matches the record it was reached from');
        assert(Object.isFrozen(created.triggeringReference), '56. triggeringReference is itself frozen');
    }
    console.log('✓ Section K: FIRST_REFERENCE_CREATED / FIRST_REFERENCE_RECEIVED fire once each, attributed correctly, carrying triggeringReference');

    // ---------------------------------------------------------------
    // Section L — reference record count and distinct referencing
    // publication count are different facts.
    // ---------------------------------------------------------------
    {
        const alice = identity({ blockchain: BlockchainKind.BASE, contentHash: 'l-alice', chainReference: 'l-alice-txid', createdAt: new Date('2026-07-01T00:00:00Z') });
        const bob = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'l-bob', chainReference: 'l-bob-txid', createdAt: new Date('2026-07-01T00:00:00Z') });
        const carol = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'l-carol', chainReference: 'l-carol-txid', createdAt: new Date('2026-07-01T00:00:00Z') });

        const records = [
            referenceRecord({ source: alice, referenced: bob, createdAt: new Date('2026-07-02T00:00:00Z') }),
            referenceRecord({ source: alice, referenced: bob, createdAt: new Date('2026-07-03T00:00:00Z') }),
            referenceRecord({ source: alice, referenced: bob, createdAt: new Date('2026-07-04T00:00:00Z') }),
            referenceRecord({ source: carol, referenced: bob, createdAt: new Date('2026-07-05T00:00:00Z') })
        ];

        const result = describeAchievementEvents([], [], records);
        const createdEvents = result.events.filter((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_CREATED);
        const receivedEvents = result.events.filter((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_RECEIVED);
        assert(receivedEvents.length === 1, '57. four reference records naming the same referenced publication still earn exactly ONE FIRST_REFERENCE_RECEIVED — never one per record');
        assert(createdEvents.length === 2, "58. FIRST_REFERENCE_CREATED fires once per distinct SOURCE — Alice once (her first of three), Carol once — never once per record");
        assert(createdEvents.some((e) => e.sourcePublicationIdentity.sameAs(alice)) && createdEvents.some((e) => e.sourcePublicationIdentity.sameAs(carol)), '59. both Alice and Carol individually earn their own FIRST_REFERENCE_CREATED');
        assert(!result.events.some((e) => e.achievementKind === AchievementKind.REFERENCED_BY_10_PUBLICATIONS), '60. two distinct referencing publications never cross the 10-distinct-source threshold');
    }
    console.log('✓ Section L: reference record count and distinct referencing publication count are kept separate');

    // ---------------------------------------------------------------
    // Section M — REFERENCED_BY_10_PUBLICATIONS / _100_PUBLICATIONS.
    // ---------------------------------------------------------------
    {
        const zed = identity({ blockchain: BlockchainKind.BASE, contentHash: 'm-zed', chainReference: 'm-zed-txid', createdAt: new Date('2026-08-01T00:00:00Z') });
        const sources = [];
        for (let i = 1; i <= 10; i++) {
            sources.push(identity({ blockchain: BlockchainKind.BITCOIN, contentHash: `m-source-${i}`, chainReference: `m-source-${i}-txid`, createdAt: new Date('2026-08-01T00:00:00Z') }));
        }
        function mDay(n) { return new Date(`2026-08-${String(n).padStart(2, '0')}T00:00:00Z`); }

        const records = [
            referenceRecord({ source: sources[0], referenced: zed, createdAt: mDay(2) }),
            referenceRecord({ source: sources[0], referenced: zed, createdAt: mDay(3) }) // s1's duplicate — never advances the distinct-source count
        ];
        for (let i = 1; i < 10; i++) {
            records.push(referenceRecord({ source: sources[i], referenced: zed, createdAt: mDay(3 + i) }));
        }

        const result = describeAchievementEvents([], [], records);
        const milestone10 = result.events.filter((e) => e.achievementKind === AchievementKind.REFERENCED_BY_10_PUBLICATIONS);
        assert(milestone10.length === 1, '61. REFERENCED_BY_10_PUBLICATIONS fires exactly once despite 11 raw reference records');
        assert(milestone10[0].sourcePublicationIdentity.sameAs(zed), '62. it is attributed to Zed, the referenced publication, never a source');
        assert(milestone10[0].triggeringReference.sourcePublicationIdentity.sameAs(sources[9]), "63. it is attributed to the 10th DISTINCT source's own record, never the 11th raw record's own duplicate source");
        assert(!result.events.some((e) => e.achievementKind === AchievementKind.REFERENCED_BY_100_PUBLICATIONS), '64. REFERENCED_BY_100_PUBLICATIONS never fires with only 10 distinct referencing publications');

        // Nine distinct sources (s1 twice + s2..s9) never cross the
        // 10-distinct-source threshold.
        const nineDistinctRecords = records.slice(0, 10);
        const shortResult = describeAchievementEvents([], [], nineDistinctRecords);
        assert(!shortResult.events.some((e) => e.achievementKind === AchievementKind.REFERENCED_BY_10_PUBLICATIONS), '65. nine distinct referencing publications never cross the 10-distinct-source threshold');
    }
    console.log('✓ Section M: REFERENCED_BY_10_PUBLICATIONS fires exactly once, at the 10th DISTINCT referencing publication');

    // ---------------------------------------------------------------
    // Section N — FIRST_CROSS_CHAIN_REFERENCE.
    // ---------------------------------------------------------------
    {
        const a = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'n-a', chainReference: 'n-a-txid', createdAt: new Date('2026-09-01T00:00:00Z') });
        const b = identity({ blockchain: BlockchainKind.BASE, contentHash: 'n-b', chainReference: 'n-b-txid', createdAt: new Date('2026-09-01T00:00:00Z') });
        const c = identity({ blockchain: BlockchainKind.BASE, contentHash: 'n-c', chainReference: 'n-c-txid', createdAt: new Date('2026-09-01T00:00:00Z') });
        const d = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'n-d', chainReference: 'n-d-txid', createdAt: new Date('2026-09-01T00:00:00Z') });

        // A (Bitcoin) -> B (Base): cross-chain.
        const aToB = referenceRecord({ source: a, referenced: b, createdAt: new Date('2026-09-02T00:00:00Z') });
        // A (Bitcoin) -> C (Base): a SECOND cross-chain reference from the
        // SAME source — never re-fires FIRST_CROSS_CHAIN_REFERENCE.
        const aToC = referenceRecord({ source: a, referenced: c, createdAt: new Date('2026-09-03T00:00:00Z') });
        // B (Base) -> D (Bitcoin): the REVERSE direction, a genuinely
        // different source — fires again, attributed to B this time.
        const bToD = referenceRecord({ source: b, referenced: d, createdAt: new Date('2026-09-04T00:00:00Z') });
        // D (Bitcoin) -> A (Bitcoin): same-chain — never fires at all.
        const dToA = referenceRecord({ source: d, referenced: a, createdAt: new Date('2026-09-05T00:00:00Z') });

        const result = describeAchievementEvents([], [], [aToB, aToC, bToD, dToA]);
        const crossChainEvents = result.events.filter((e) => e.achievementKind === AchievementKind.FIRST_CROSS_CHAIN_REFERENCE);
        assert(crossChainEvents.length === 2, "66. FIRST_CROSS_CHAIN_REFERENCE fires exactly twice — once for A, once for B's own reverse-direction reference — never for the same-chain D -> A reference, and never a second time for A's own second cross-chain reference");
        assert(crossChainEvents[0].sourcePublicationIdentity.sameAs(a), '67. the first cross-chain achievement is attributed to A, the first source to cross chains');
        assert(crossChainEvents[0].triggeringReference.referencedPublicationIdentity.sameAs(b), "68. it is attributed to the record that actually completed it (A -> B), not A's later, redundant A -> C reference");
        assert(crossChainEvents[1].sourcePublicationIdentity.sameAs(b), '69. the reverse direction (B referencing something back) is attributed to B — a separate, independent occurrence, never assumed already earned');
        assert(!result.events.some((e) => e.achievementKind === AchievementKind.FIRST_CROSS_CHAIN_REFERENCE && e.triggeringReference.sourcePublicationIdentity.sameAs(d)), '70. D -> A never earns FIRST_CROSS_CHAIN_REFERENCE — both identities are on Bitcoin');
    }
    console.log("✓ Section N: FIRST_CROSS_CHAIN_REFERENCE fires strictly on source.blockchain !== referenced.blockchain, once per distinct source");

    // ---------------------------------------------------------------
    // Section O — FLAGSHIP: ten distinct referencing publications (one
    // referencing twice), a shared contentHash across two otherwise
    // distinct sources, a cross-chain reference among them, deliberately
    // out-of-order createdAt timestamps and interleaved array positions.
    // ---------------------------------------------------------------
    {
        const wendy = identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-wendy', chainReference: 'o-wendy-txid', createdAt: new Date('2026-10-01T00:00:00Z') });
        const SHARED_CONTENT_HASH = 'o-shared-content-hash';
        function oDay(n) { return new Date(`2026-10-${String(n).padStart(2, '0')}T00:00:00Z`); }

        const s = [
            identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'o-s1', chainReference: 'o-s1-txid', createdAt: oDay(1) }), // cross-chain relative to Wendy
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s2', chainReference: 'o-s2-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: SHARED_CONTENT_HASH, chainReference: 'o-s3-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s4', chainReference: 'o-s4-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s5', chainReference: 'o-s5-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s6', chainReference: 'o-s6-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: SHARED_CONTENT_HASH, chainReference: 'o-s7-txid', createdAt: oDay(1) }), // shares s3's contentHash, different chainReference — never merged
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s8', chainReference: 'o-s8-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s9', chainReference: 'o-s9-txid', createdAt: oDay(1) }),
            identity({ blockchain: BlockchainKind.BASE, contentHash: 'o-s10', chainReference: 'o-s10-txid', createdAt: oDay(1) })
        ];

        // Chronological truth (by createdAt, ascending): s1@2, s2@3, s3@4,
        // s4@5, s1-dup@6, s5@7, s6@8, s7@9, s8@10, s9@11, s10@12 — s10's
        // own record is the one that chronologically completes the 10th
        // DISTINCT referencing publication.
        const s1First = referenceRecord({ source: s[0], referenced: wendy, createdAt: oDay(2) });
        const s2 = referenceRecord({ source: s[1], referenced: wendy, createdAt: oDay(3) });
        const s3 = referenceRecord({ source: s[2], referenced: wendy, createdAt: oDay(4) });
        const s4 = referenceRecord({ source: s[3], referenced: wendy, createdAt: oDay(5) });
        const s1Dup = referenceRecord({ source: s[0], referenced: wendy, createdAt: oDay(6) });
        const s5 = referenceRecord({ source: s[4], referenced: wendy, createdAt: oDay(7) });
        const s6 = referenceRecord({ source: s[5], referenced: wendy, createdAt: oDay(8) });
        const s7 = referenceRecord({ source: s[6], referenced: wendy, createdAt: oDay(9) });
        const s8 = referenceRecord({ source: s[7], referenced: wendy, createdAt: oDay(10) });
        const s9 = referenceRecord({ source: s[8], referenced: wendy, createdAt: oDay(11) });
        const s10 = referenceRecord({ source: s[9], referenced: wendy, createdAt: oDay(12) });

        // Deliberately scrambled ARRAY order — NOT chronological order —
        // to prove the computation sorts by createdAt itself, rather than
        // trusting array/insertion position.
        const records = [s10, s1Dup, s3, s7, s1First, s5, s9, s2, s6, s4, s8];
        const recordsSnapshot = [...records];

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describeAchievementEvents([], [], records));
        assert(networkCallOccurred === false, '71. computing reference-derived achievements performs zero network access');
        assert(records.length === recordsSnapshot.length && records.every((r, i) => r === recordsSnapshot[i]), '72. the input array itself is never reordered or mutated');

        const milestone10 = result.events.filter((e) => e.achievementKind === AchievementKind.REFERENCED_BY_10_PUBLICATIONS);
        assert(milestone10.length === 1, '73. REFERENCED_BY_10_PUBLICATIONS fires exactly once — a shared contentHash across s3/s7 never collapses them into one distinct source, and s1s duplicate never inflates the count early');
        assert(milestone10[0].triggeringReference.sourcePublicationIdentity.sameAs(s[9]), "74. it is attributed to s10's own record — the chronologically 10th distinct source — never the record that merely happens to sit first in the scrambled array");
        assert(milestone10[0].observedAt.getTime() === oDay(12).getTime(), '75. observedAt is the true chronological completion time, despite the scrambled array order');

        const crossChain = result.events.find((e) => e.achievementKind === AchievementKind.FIRST_CROSS_CHAIN_REFERENCE);
        assert(crossChain.sourcePublicationIdentity.sameAs(s[0]), '76. FIRST_CROSS_CHAIN_REFERENCE is attributed to s1, the one Bitcoin source referencing a Base publication');
        assert(crossChain.triggeringReference.createdAt.getTime() === oDay(2).getTime(), "77. it is attributed to s1's own FIRST reference (day 2), never its later, redundant duplicate (day 6)");

        const firstReceived = result.events.find((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_RECEIVED);
        assert(firstReceived.triggeringReference.createdAt.getTime() === oDay(2).getTime(), "78. FIRST_REFERENCE_RECEIVED is attributed to Wendy's own true first reference, chronologically, never array position");

        const createdEvents = result.events.filter((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_CREATED);
        assert(createdEvents.length === 10, "79. exactly ten distinct sources each earn their own FIRST_REFERENCE_CREATED — s1's duplicate reference earns no second one");

        // Determinism: repeated calls on byte-identical input are byte-identical.
        const result2 = describeAchievementEvents([], [], records);
        assert(JSON.stringify(result.events.map(serializeEvent)) === JSON.stringify(result2.events.map(serializeEvent)), '80. repeated calls on identical input produce byte-identical output');

        assertNeverScored(result, 'flagshipReferenceResult');
    }
    console.log('✓ Section O: FLAGSHIP — ten distinct referencing publications, shared contentHash never conflated, cross-chain detection, chronological attribution despite scrambled array order, determinism, zero network/storage mutation');

    // ---------------------------------------------------------------
    // Section P — reconstructAchievementEvents() composes publication AND
    // reference achievements over a real, persisted archive.
    // ---------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(provider);

        const btc = bitcoinRecord({ anchorId: 'p-anchor', contentHash: 'p-btc-content', txid: 'p'.repeat(64), createdAt: new Date('2026-11-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'p-base-content', txid: 'q'.repeat(64), createdAt: new Date('2026-11-02T00:00:00Z') });

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinAnchorPublicationRecord(btc);
        archive = archive.appendBaseAnchorPublicationRecord(base);

        const reference = new PublicationReferenceRecord({
            sourcePublicationIdentity: btc.toBlockchainPublicationIdentity(),
            referencedPublicationIdentity: base.toBlockchainPublicationIdentity(),
            createdAt: new Date('2026-11-03T00:00:00Z')
        });
        archive = archive.appendPublicationReferenceRecord(reference);

        const { result: liveResult, networkCallOccurred } = await withoutNetworkAccess(() => reconstructAchievementEvents(archive));
        assert(networkCallOccurred === false, '81. reconstructAchievementEvents() with reference records present still performs zero network access');
        assert(liveResult.events.some((e) => e.achievementKind === AchievementKind.FIRST_REFERENCE_CREATED), '82. the composed result includes reference-derived achievements alongside the existing publication-derived ones');
        assert(liveResult.events.some((e) => e.achievementKind === AchievementKind.FIRST_CROSS_CHAIN_REFERENCE), "83. it correctly detects the cross-chain reference between the archive's own Bitcoin and Base publications");
        assert(liveResult.events.some((e) => e.achievementKind === AchievementKind.FIRST_PUBLICATION), '84. the existing 0.8.102 publication achievements are still present, unchanged, alongside the new ones');

        persistence.save(archive);
        const restored = persistence.load();
        const reconstructed = reconstructAchievementEvents(restored);
        assert(JSON.stringify(reconstructed.events.map(serializeEvent)) === JSON.stringify(liveResult.events.map(serializeEvent)), '85. reload equivalence holds for the composed publication + reference achievement result');
    }
    console.log('✓ Section P: reconstructAchievementEvents() composes publication and reference achievements, with reload equivalence');

    // ---------------------------------------------------------------
    // Section Q — no verdict vocabulary anywhere in the reference-derived
    // surface, including triggeringReference.
    // ---------------------------------------------------------------
    {
        const alice = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'q-alice', chainReference: 'q-alice-txid', createdAt: new Date('2026-12-01T00:00:00Z') });
        const bob = identity({ blockchain: BlockchainKind.BASE, contentHash: 'q-bob', chainReference: 'q-bob-txid', createdAt: new Date('2026-12-01T00:00:00Z') });
        const record = referenceRecord({ source: alice, referenced: bob, createdAt: new Date('2026-12-02T00:00:00Z') });
        const result = describeAchievementEvents([], [], [record]);
        assertNeverScored(result, 'referenceNoVerdictResult');
        for (const event of result.events) {
            assert(Object.isFrozen(event), '86. every reference-derived event is frozen');
            if (event.triggeringReference) assert(Object.isFrozen(event.triggeringReference), '87. triggeringReference is itself frozen');
        }
        assert(Object.keys(AchievementKind).length === 11, '88. AchievementKind still names exactly eleven values — this section adds no new vocabulary of its own');
    }
    console.log('✓ Section Q: no verdict/score/points/rank vocabulary anywhere in the reference-derived surface, including triggeringReference');

    console.log('\nAll AchievementEvent tests passed.');
}

function serializeEvent(event) {
    return {
        achievementKind: event.achievementKind,
        label: event.label,
        observedAt: event.observedAt.toISOString(),
        sourcePublicationIdentity: event.sourcePublicationIdentity.toJSON(),
        // 0.8.106 — present only on reference-derived events; `undefined`
        // is dropped by JSON.stringify(), so a publication-derived event's
        // own serialization is byte-for-byte unchanged from 0.8.102.
        triggeringReference: event.triggeringReference ? {
            sourcePublicationIdentity: event.triggeringReference.sourcePublicationIdentity.toJSON(),
            referencedPublicationIdentity: event.triggeringReference.referencedPublicationIdentity.toJSON(),
            createdAt: event.triggeringReference.createdAt.toISOString()
        } : undefined,
        index: event.index
    };
}

run().catch((error) => {
    console.error('AchievementEvent.test.js FAILED:', error);
    process.exitCode = 1;
});
