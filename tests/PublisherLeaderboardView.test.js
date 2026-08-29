import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { describePublisherRankingPolicy, describePublisherRanking, reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import {
    describePublisherLeaderboard,
    reconstructPublisherLeaderboard
} from '../application/PublisherLeaderboardView.js';

// 0.8.113 — Explicit Publisher Leaderboard Projection.
//
// Section A: an absent/malformed ranking produces an empty, valid
//            leaderboard, still carrying a policy (falling back to
//            describePublisherRankingPolicy()), never an error
// Section B: FLAGSHIP — a real 0.8.112 ranking, projected: the leaderboard
//            echoes rank, publisherIdentity, and the three counts VERBATIM
//            and in the EXACT order the ranking already held them, never
//            re-sorting or re-numbering, and the entry's own `statistics`
//            field never survives onto the leaderboard entry
// Section C: the leaderboard never invents its own ranking — feeding it a
//            deliberately out-of-order, non-monotonic set of ranks proves
//            this file performs no sort of its own
// Section D: the policy is echoed verbatim from the input ranking — never
//            recomputed, never summarized to a bare version number
// Section E: malformed/absent inputs never throw, including a malformed
//            entry inside an otherwise genuine entries array
// Section F: reconstructPublisherLeaderboard() over a real, persisted
//            archive — composes reconstructPublisherRanking() unchanged,
//            zero network access, no archive mutation, reload equivalence
// Section G: no score/points/level/tier/xp/reputation/weight/rating/
//            percentile vocabulary anywhere; publisher identity is never
//            renamed to imply a person; entry keys are exactly the five
//            documented leaderboard columns

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength',
    'included', 'confirmed', 'safe', 'healthy', 'points', 'level', 'tier',
    'owner', 'ownerProven', 'verified', 'official', 'authentic', 'worth',
    'xp', 'reputation', 'rating', 'percentile', 'person', 'human'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a leaderboard PRESENTS a ranking, it never scores, weighs, rates, or personifies it`);
        assert(!lower.includes('score'), `${path}.${key} must never contain "score"`);
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

function entryAt(leaderboard, publisherId) {
    return leaderboard.entries.find((e) => e.publisherIdentity && e.publisherIdentity.publisherId === publisherId);
}

function serializeLeaderboard(leaderboard) {
    return {
        policy: leaderboard.policy,
        entryCount: leaderboard.entryCount,
        entries: leaderboard.entries.map((e) => ({
            rank: e.rank,
            publisherId: e.publisherIdentity ? e.publisherIdentity.publisherId : null,
            achievementCount: e.achievementCount,
            distinctAchievementKindCount: e.distinctAchievementKindCount,
            publicationIdentityCount: e.publicationIdentityCount
        }))
    };
}

function fabricatedStatistics(publisherId, { achievementCount, distinctAchievementKindCount, publicationIdentityCount }) {
    return Object.freeze({
        publisherIdentity: new PublisherIdentityRecord({ publisherId }),
        achievementCount,
        distinctAchievementKindCount,
        publicationIdentityCount,
        badgeCount: 0,
        distinctBadgeKindCount: 0,
        achievementKindCounts: Object.freeze([]),
        blockchainPublicationCounts: Object.freeze([])
    });
}

// A hand-fabricated ranking-SHAPED entry — never a genuine 0.8.112 output
// — used only to prove this file echoes `rank` verbatim rather than
// re-deriving it, at an exact, hand-chosen (and deliberately
// non-monotonic) value.
function fabricatedRankingEntry(publisherId, rank) {
    return Object.freeze({
        rank,
        publisherIdentity: new PublisherIdentityRecord({ publisherId }),
        achievementCount: 1,
        distinctAchievementKindCount: 1,
        publicationIdentityCount: 1,
        statistics: fabricatedStatistics(publisherId, { achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 })
    });
}

const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — absent/malformed ranking produces an empty leaderboard.
    // ---------------------------------------------------------------
    {
        const leaderboard = describePublisherLeaderboard(undefined);
        assert(leaderboard.entries.length === 0, '1. an undefined ranking produces zero entries, never an error');
        assert(leaderboard.entryCount === 0, '2. entryCount is zero alongside an empty entries array');
        assert(leaderboard.policy && leaderboard.policy.version === 1, '3. a policy is still present, falling back to describePublisherRankingPolicy()');
        assert(Object.isFrozen(leaderboard) && Object.isFrozen(leaderboard.entries), '4. the result and its entries array are frozen');

        assert(describePublisherLeaderboard(null).entries.length === 0, '5. a null ranking never throws');
        assert(describePublisherLeaderboard('garbage').entries.length === 0, '6. a non-object ranking never throws');
        assert(describePublisherLeaderboard({}).entries.length === 0, '7. a ranking-shaped object with no entries field produces zero entries');
        assert(describePublisherLeaderboard({ entries: 'not-an-array' }).entries.length === 0, '8. a non-array entries field never throws');

        const emptyRanking = describePublisherRanking([]);
        const leaderboardFromEmptyRanking = describePublisherLeaderboard(emptyRanking);
        assert(leaderboardFromEmptyRanking.entries.length === 0, '9. a genuine, empty 0.8.112 ranking projects to an empty leaderboard');
        assert(leaderboardFromEmptyRanking.policy === emptyRanking.policy, '10. even an empty ranking\'s own policy is echoed verbatim, by reference');
    }
    console.log('✓ Section A: an absent or malformed ranking produces a valid, empty leaderboard, still carrying a policy');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP. A real 0.8.112 ranking, projected verbatim.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 5, distinctAchievementKindCount: 3, publicationIdentityCount: 4 });
        const bob = fabricatedStatistics('Bob', { achievementCount: 5, distinctAchievementKindCount: 3, publicationIdentityCount: 4 });
        const carol = fabricatedStatistics('Carol', { achievementCount: 4, distinctAchievementKindCount: 4, publicationIdentityCount: 2 });
        const ranking = describePublisherRanking([carol, bob, alice]);

        const leaderboard = describePublisherLeaderboard(ranking);
        assert(leaderboard.entryCount === 3, '11. three ranked publishers project to three leaderboard entries');
        assert(leaderboard.entries.length === leaderboard.entryCount, '12. entryCount always matches entries.length');

        // Same order, same ranks, as the input ranking — never re-sorted.
        assert(leaderboard.entries.map((e) => e.publisherIdentity.publisherId).join(',') === ranking.entries.map((e) => e.publisherIdentity.publisherId).join(','), '13. the leaderboard preserves the ranking\'s own exact entry order');
        assert(entryAt(leaderboard, 'Alice').rank === 1 && entryAt(leaderboard, 'Bob').rank === 2 && entryAt(leaderboard, 'Carol').rank === 3, '14. rank values are echoed verbatim from the ranking');

        // Counts echoed verbatim.
        const aliceEntry = entryAt(leaderboard, 'Alice');
        assert(aliceEntry.achievementCount === 5 && aliceEntry.distinctAchievementKindCount === 3 && aliceEntry.publicationIdentityCount === 4, '15. counts are echoed verbatim from the ranking entry');
        assert(aliceEntry.publisherIdentity === ranking.entries.find((e) => e.publisherIdentity.publisherId === 'Alice').publisherIdentity, '16. publisherIdentity is echoed as the exact same instance, never copied');

        // The deeper `statistics` substrate does NOT survive onto the
        // leaderboard entry — this file presents a narrower, five-field
        // view, never a superset.
        assert(!('statistics' in aliceEntry), '17. the leaderboard entry never carries the ranking entry\'s own statistics field');
        assert(Object.keys(aliceEntry).sort().join(',') === ['achievementCount', 'distinctAchievementKindCount', 'publicationIdentityCount', 'publisherIdentity', 'rank'].sort().join(','), '18. a leaderboard entry has EXACTLY the five documented columns, nothing more');

        assert(Object.isFrozen(aliceEntry), '19. every leaderboard entry is frozen');
        assertNeverScored(leaderboard, 'flagshipLeaderboard');
    }
    console.log('✓ Section B: FLAGSHIP — a real ranking projects to a leaderboard verbatim, in order, with a deliberately narrower per-entry shape');

    // ---------------------------------------------------------------
    // Section C — the leaderboard never invents its own ranking: a
    // deliberately out-of-order, non-monotonic set of fabricated ranking
    // entries is projected in the EXACT order it was given, never sorted
    // by rank or by any other field.
    // ---------------------------------------------------------------
    {
        const fabricatedRanking = Object.freeze({
            policy: describePublisherRankingPolicy(),
            entries: Object.freeze([
                fabricatedRankingEntry('Zed', 3),
                fabricatedRankingEntry('Amy', 1),
                fabricatedRankingEntry('Mid', 99)
            ])
        });

        const leaderboard = describePublisherLeaderboard(fabricatedRanking);
        assert(leaderboard.entries.map((e) => e.publisherIdentity.publisherId).join(',') === 'Zed,Amy,Mid', '20. leaderboard entries preserve the EXACT input array order — "Zed" first despite rank 3, never reordered to rank order');
        assert(leaderboard.entries.map((e) => e.rank).join(',') === '3,1,99', '21. rank values are echoed verbatim, including a non-monotonic, gapped sequence this file never corrects');
    }
    console.log('✓ Section C: the leaderboard never re-sorts or re-numbers — it performs no ranking decision of its own');

    // ---------------------------------------------------------------
    // Section D — the policy is echoed verbatim, never recomputed.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const ranking = describePublisherRanking([alice]);
        const leaderboard = describePublisherLeaderboard(ranking);
        assert(leaderboard.policy === ranking.policy, '22. the leaderboard\'s own policy is the ranking\'s own policy object, by reference — never a re-described copy');

        // A ranking-shaped object with a malformed/absent policy falls back
        // to describePublisherRankingPolicy() — never throws, never leaves
        // `policy` undefined.
        const noPolicyRanking = Object.freeze({ entries: ranking.entries });
        const leaderboardWithoutPolicy = describePublisherLeaderboard(noPolicyRanking);
        assert(leaderboardWithoutPolicy.policy && leaderboardWithoutPolicy.policy.version === 1, '23. a ranking missing its own policy falls back to the current describePublisherRankingPolicy()');
    }
    console.log('✓ Section D: the policy is preserved with the result, echoed verbatim, never recomputed or summarized away');

    // ---------------------------------------------------------------
    // Section E — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        const genuine = fabricatedRankingEntry('Alice', 1);
        const malformedRanking = Object.freeze({
            policy: describePublisherRankingPolicy(),
            entries: Object.freeze([genuine, null, undefined, 'garbage', 42, {}, { rank: 0, publisherIdentity: genuine.publisherIdentity }, { rank: 2, publisherIdentity: 'not-a-record' }])
        });
        const leaderboard = describePublisherLeaderboard(malformedRanking);
        assert(leaderboard.entries.length === 1, '24. only the one genuine entry survives — every malformed entry is silently excluded, never thrown on');
        assert(leaderboard.entries[0].publisherIdentity.publisherId === 'Alice', '25. the surviving entry is the genuine one');
    }
    console.log('✓ Section E: malformed or absent inputs never throw, and malformed entries are silently excluded');

    // ---------------------------------------------------------------
    // Section F — reconstructPublisherLeaderboard() over a real, persisted
    // archive.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'l-anchor-a', contentHash: 'l-content-a', txid: 'a'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        archive = btcUseCase.execute(archive, { anchorId: 'l-anchor-b', contentHash: 'l-content-b', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-02T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'l-content-c', txid: '0x' + 'c'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-03T00:00:00Z') });

        const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'l-anchor-a').toBlockchainPublicationIdentity();
        const identityB = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'l-anchor-b').toBlockchainPublicationIdentity();
        const identityC = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-08-04T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityC, createdAt: new Date('2026-08-05T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityB, createdAt: new Date('2026-08-06T00:00:00Z') });

        const preCallAssociationCount = archive.publisherPublicationAssociationRecordCount;
        const preCallBitcoinCount = archive.bitcoinAnchorPublicationRecords.length;

        const { result: leaderboard, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherLeaderboard(archive));
        assert(networkCallOccurred === false, '26. reconstructPublisherLeaderboard() performs zero network access');
        assert(leaderboard.entryCount === 2, '27. exactly the two publishers who explicitly associated anything appear');
        assert(entryAt(leaderboard, 'Alice').rank === 1, '28. Alice, with two associated publications and more achievements, ranks above Bob');
        assert(entryAt(leaderboard, 'Bob').rank === 2, '29. Bob ranks second');

        // Composes reconstructPublisherRanking() unchanged — never a
        // parallel computation.
        const directRanking = reconstructPublisherRanking(archive);
        assert(JSON.stringify(serializeLeaderboard(leaderboard)) === JSON.stringify(serializeLeaderboard(describePublisherLeaderboard(directRanking))), '30. reconstructPublisherLeaderboard() matches describePublisherLeaderboard(reconstructPublisherRanking(archive)) exactly — no parallel ranking engine');

        // No archive mutation.
        assert(archive.publisherPublicationAssociationRecordCount === preCallAssociationCount, '31. computing a leaderboard never mutates the archive\'s own association record count');
        assert(archive.bitcoinAnchorPublicationRecords.length === preCallBitcoinCount, '32. computing a leaderboard never mutates the archive\'s own Bitcoin records');

        // Reload equivalence.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        const restored = persistence.load();
        const reconstructed = reconstructPublisherLeaderboard(restored);
        assert(JSON.stringify(serializeLeaderboard(reconstructed)) === JSON.stringify(serializeLeaderboard(leaderboard)), '33. reload equivalence: a restored archive reconstructs a byte-identical leaderboard to the live one it was saved from');

        // Repeated reconstruction is byte-identical.
        const leaderboardAgain = reconstructPublisherLeaderboard(archive);
        assert(JSON.stringify(serializeLeaderboard(leaderboardAgain)) === JSON.stringify(serializeLeaderboard(leaderboard)), '34. repeated calls on identical input produce byte-identical output');

        // An unassociated real publication on this same archive never
        // appears — the leaderboard, like the ranking beneath it, never
        // infers a publisher population.
        assert(entryAt(leaderboard, undefined) === undefined, '35. sanity — no entry resolves to an undefined publisher identity');

        assert(reconstructPublisherLeaderboard(null).entries.length === 0, '36. a null archive reconstructs to an empty leaderboard, never throws');
        assert(reconstructPublisherLeaderboard(undefined).entries.length === 0, '37. an undefined archive never throws');
        assert(reconstructPublisherLeaderboard({}).entries.length === 0, '38. a plain object masquerading as an archive reconstructs to an empty leaderboard');

        assertNeverScored(leaderboard, 'liveLeaderboard');

        assert(blockchainNeverAppearsInLeaderboardPolicy(), '39. sanity — the leaderboard\'s own echoed policy carries no blockchain vocabulary');
        function blockchainNeverAppearsInLeaderboardPolicy() {
            const serialized = JSON.stringify(leaderboard.policy).toLowerCase();
            return !serialized.includes(BlockchainKind.BITCOIN.toLowerCase()) && !serialized.includes(BlockchainKind.BASE.toLowerCase());
        }
    }
    console.log('✓ Section F: reconstructPublisherLeaderboard() composes reconstructPublisherRanking() unchanged, with zero network access, no archive mutation, and reload equivalence');

    // ---------------------------------------------------------------
    // Section G — no score/points/level/tier/xp/reputation/weight/rating/
    // percentile vocabulary anywhere; publisher identity is never renamed
    // to imply a person.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 2, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const ranking = describePublisherRanking([alice]);
        const leaderboard = describePublisherLeaderboard(ranking);
        assertNeverScored(leaderboard, 'noVerdictLeaderboard');

        const entryKeys = Object.keys(leaderboard.entries[0]).map((k) => k.toLowerCase());
        assert(entryKeys.includes('rank'), '40. "rank" itself — carried forward from 0.8.112, never reinvented here');
        assert(entryKeys.includes('publisheridentity'), '41. the field is publisherIdentity, never bare "publisher" — identity, not a person');
        for (const key of ['score', 'points', 'level', 'tier', 'xp', 'reputation', 'weight', 'rating', 'percentile', 'person', 'human']) {
            assert(!entryKeys.includes(key), `42. ${key} must never exist on a leaderboard entry`);
        }

        const topLevelKeys = Object.keys(leaderboard).sort();
        assert(topLevelKeys.join(',') === ['entries', 'entryCount', 'policy'].sort().join(','), '43. the leaderboard result has exactly three top-level fields: policy, entryCount, entries');
    }
    console.log('✓ Section G: no score/points/level/tier/xp/reputation/weight/rating/percentile vocabulary anywhere, and publisher identity is never renamed to imply a person');

    console.log('\nAll PublisherLeaderboardView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardView.test.js FAILED:', error);
    process.exitCode = 1;
});
