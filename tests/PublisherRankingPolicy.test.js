import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructPublisherAchievementStatistics } from '../application/PublisherAchievementStatisticsView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import {
    describePublisherRankingPolicy,
    describePublisherRanking,
    reconstructPublisherRanking
} from '../application/PublisherRankingPolicy.js';

// 0.8.112 — Explicit Publisher Ranking Policy.
//
// Section A: describePublisherRankingPolicy() returns the fixed, versioned
//            policy definition — three descending criteria plus one
//            exact-string tie-break — as plain, frozen data
// Section B: an empty statistics list produces an empty, valid ranking,
//            never an error
// Section C: a single genuine publisher ranks #1
// Section D: FLAGSHIP — Alice and Bob tie on achievementCount,
//            distinctAchievementKindCount, AND publicationIdentityCount;
//            Carol has fewer achievements but MORE distinct achievement
//            kinds than Alice/Bob, and still ranks below them, proving the
//            ranking follows the declared field order rather than any
//            other intuitive notion of "better"; Alice ranks above Bob by
//            the deterministic exact-identity tie-break alone
// Section E: case-sensitive identity tie-break — Alice/alice/ALICE remain
//            three distinct entries with a fixed, non-locale-sensitive
//            total order
// Section F: policy isolation — ranking never mutates the input statistics,
//            embeds the exact same frozen statistics objects verbatim, and
//            repeated calls to describePublisherRankingPolicy() never
//            share a single mutable instance across callers
// Section G: deterministic total ordering with unique, gapless ranks —
//            never competition ranking, even when every count ties
// Section H: malformed/absent inputs never throw
// Section I: reconstructPublisherRanking() over a real, persisted archive
//            — publisher population from explicit association alone,
//            zero network access, no archive mutation, reload equivalence,
//            reordering-independence
// Section J: no score/points/level/tier/xp/reputation/weight/rating/
//            percentile vocabulary anywhere — "rank" itself is the one,
//            deliberately introduced ordinal concept

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength',
    'included', 'confirmed', 'safe', 'healthy', 'points', 'level', 'tier',
    'owner', 'ownerProven', 'verified', 'official', 'authentic', 'worth',
    'xp', 'reputation', 'rating', 'percentile'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a ranking POLICY orders facts, it never scores, weighs, or rates them`);
        assert(!lower.includes('score'), `${path}.${key} must never contain "score" — no achievementScore/publisherScore/reputationScore, even an "obvious" one`);
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

function rankOf(ranking, publisherId) {
    const entry = ranking.entries.find((e) => e.publisherIdentity && e.publisherIdentity.publisherId === publisherId);
    return entry ? entry.rank : null;
}

function serializeRanking(ranking) {
    return {
        policy: ranking.policy,
        entries: ranking.entries.map((e) => ({
            rank: e.rank,
            publisherId: e.publisherIdentity ? e.publisherIdentity.publisherId : null,
            achievementCount: e.achievementCount,
            distinctAchievementKindCount: e.distinctAchievementKindCount,
            publicationIdentityCount: e.publicationIdentityCount
        }))
    };
}

// A minimal, fabricated "statistics-shaped" object — never a genuine
// PublisherAchievementStatisticsView.js result — used only to exercise the
// pure describePublisherRanking() function directly, at exact,
// hand-chosen counts, without needing a real archive for every scenario.
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

const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — the policy definition itself.
    // ---------------------------------------------------------------
    {
        const policy = describePublisherRankingPolicy();
        assert(policy.version === 1, '1. policy is explicitly version 1');
        assert(Array.isArray(policy.criteria) && policy.criteria.length === 3, '2. exactly three ranking criteria');
        assert(policy.criteria[0].field === 'achievementCount' && policy.criteria[0].order === 'DESCENDING', '3. primary criterion is achievementCount, descending');
        assert(policy.criteria[1].field === 'distinctAchievementKindCount' && policy.criteria[1].order === 'DESCENDING', '4. secondary criterion is distinctAchievementKindCount, descending');
        assert(policy.criteria[2].field === 'publicationIdentityCount' && policy.criteria[2].order === 'DESCENDING', '5. tertiary criterion is publicationIdentityCount, descending');
        assert(policy.tieBreak.comparison === 'EXACT_CASE_SENSITIVE_STRING', '6. tie-break is exact, case-sensitive string comparison — never locale-sensitive');
        assert(Object.isFrozen(policy) && Object.isFrozen(policy.criteria) && Object.isFrozen(policy.tieBreak), '7. the policy and its nested objects are frozen');
        for (const criterion of policy.criteria) assert(Object.isFrozen(criterion), '8. every criterion entry is frozen');

        // No blockchain vocabulary anywhere in the policy — no intrinsic
        // multiplier for any chain.
        assert(JSON.stringify(policy).toLowerCase().includes('bitcoin') === false, '9. the policy never names Bitcoin');
        assert(JSON.stringify(policy).toLowerCase().includes('base') === false, '10. the policy never names Base');
    }
    console.log('✓ Section A: describePublisherRankingPolicy() returns a fixed, versioned, frozen policy definition');

    // ---------------------------------------------------------------
    // Section B — an empty statistics list produces an empty ranking.
    // ---------------------------------------------------------------
    {
        const ranking = describePublisherRanking([]);
        assert(ranking.entries.length === 0, '11. zero statistics produces zero entries, never an error');
        assert(ranking.policy.version === 1, '12. the policy is still described even with nothing to rank');
        assert(Object.isFrozen(ranking) && Object.isFrozen(ranking.entries), '13. the result and its entries array are frozen');

        const rankingFromNoArgs = describePublisherRanking();
        assert(rankingFromNoArgs.entries.length === 0, '14. calling with no arguments at all never throws');
        const rankingFromGarbage = describePublisherRanking('not-an-array');
        assert(rankingFromGarbage.entries.length === 0, '15. a non-array argument never throws');
    }
    console.log('✓ Section B: an empty statistics list produces a valid, empty ranking');

    // ---------------------------------------------------------------
    // Section C — a single genuine publisher ranks #1.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 3, distinctAchievementKindCount: 2, publicationIdentityCount: 1 });
        const ranking = describePublisherRanking([alice]);
        assert(ranking.entries.length === 1, '16. exactly one entry');
        assert(ranking.entries[0].rank === 1, '17. the sole publisher ranks #1');
        assert(ranking.entries[0].publisherIdentity === alice.publisherIdentity, '18. publisherIdentity is echoed back, the exact same instance');
        assert(ranking.entries[0].statistics === alice, '19. statistics is the exact input object, echoed verbatim, never copied');
        assert(ranking.entries[0].achievementCount === 3, '20. achievementCount echoed onto the entry directly');
    }
    console.log('✓ Section C: a single genuine publisher ranks #1');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP. Alice and Bob tie on all three criteria;
    // Carol has fewer achievements but more distinct kinds, and still
    // loses, because the policy compares achievementCount first.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 5, distinctAchievementKindCount: 3, publicationIdentityCount: 4 });
        const bob = fabricatedStatistics('Bob', { achievementCount: 5, distinctAchievementKindCount: 3, publicationIdentityCount: 4 });
        const carol = fabricatedStatistics('Carol', { achievementCount: 4, distinctAchievementKindCount: 4, publicationIdentityCount: 2 });

        // Order of input never matters — pass them in scrambled order.
        const ranking = describePublisherRanking([carol, bob, alice]);

        assert(ranking.entries.length === 3, '21. three distinct publishers ranked');
        assert(rankOf(ranking, 'Alice') === 1, '22. Alice ranks #1');
        assert(rankOf(ranking, 'Bob') === 2, '23. Bob ranks #2 — tied with Alice on every counted field, but ordered after by the exact-identity tie-break ("Alice" < "Bob")');
        assert(rankOf(ranking, 'Carol') === 3, '24. Carol ranks #3, DESPITE having MORE distinct achievement kinds (4) than Alice/Bob (3) — the policy compares achievementCount first, and Carol has fewer (4 < 5)');

        // Reordering the input array never changes the outcome.
        const reordered = describePublisherRanking([alice, carol, bob]);
        assert(JSON.stringify(serializeRanking(reordered)) === JSON.stringify(serializeRanking(ranking)), '25. reordering the input statistics array never changes the ranking result');

        assertNeverScored(ranking, 'flagshipRanking');
    }
    console.log('✓ Section D: FLAGSHIP — ties resolved by declared field order, then by deterministic identity, never by intuition');

    // ---------------------------------------------------------------
    // Section E — case-sensitive identity tie-break.
    // ---------------------------------------------------------------
    {
        const upper = fabricatedStatistics('ALICE', { achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const mixed = fabricatedStatistics('Alice', { achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const lower = fabricatedStatistics('alice', { achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });

        const ranking = describePublisherRanking([lower, upper, mixed]);
        assert(ranking.entries.length === 3, '26. "Alice", "alice", and "ALICE" are three distinct publishers, never merged');
        // Plain code-unit ordering: 'A' (65) < 'a' (97), and within "ALICE"
        // vs "Alice" the second character 'L' (76) < 'l' (108) decides it.
        assert(rankOf(ranking, 'ALICE') === 1, '27. "ALICE" sorts first under exact code-unit comparison');
        assert(rankOf(ranking, 'Alice') === 2, '28. "Alice" sorts second');
        assert(rankOf(ranking, 'alice') === 3, '29. "alice" sorts third');

        // The identical order matches plain JavaScript `<` comparison,
        // never a locale-aware comparison that could treat these as equal
        // or order them differently (e.g. case-insensitive collation).
        const plainSorted = ['alice', 'ALICE', 'Alice'].sort();
        assert(plainSorted[0] === 'ALICE' && plainSorted[1] === 'Alice' && plainSorted[2] === 'alice', '30. sanity check — plain string sort matches this file\'s own tie-break order');
    }
    console.log('✓ Section E: case-sensitive identity tie-break — Alice/alice/ALICE remain distinct with a fixed, non-locale-sensitive order');

    // ---------------------------------------------------------------
    // Section F — policy isolation: ranking never mutates its inputs.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 5, distinctAchievementKindCount: 3, publicationIdentityCount: 2 });
        const snapshotBefore = JSON.stringify({
            achievementCount: alice.achievementCount,
            distinctAchievementKindCount: alice.distinctAchievementKindCount,
            publicationIdentityCount: alice.publicationIdentityCount
        });

        const ranking = describePublisherRanking([alice]);
        void ranking;

        const snapshotAfter = JSON.stringify({
            achievementCount: alice.achievementCount,
            distinctAchievementKindCount: alice.distinctAchievementKindCount,
            publicationIdentityCount: alice.publicationIdentityCount
        });
        assert(snapshotBefore === snapshotAfter, '31. computing a ranking never mutates a single field on the statistics it was computed from');
        assert(Object.isFrozen(alice), '32. the input statistics object remains frozen and untouched');

        // Two independent calls to describePublisherRankingPolicy() never
        // share a single mutable instance a caller could corrupt for
        // another caller.
        const policyOne = describePublisherRankingPolicy();
        const policyTwo = describePublisherRankingPolicy();
        assert(policyOne !== policyTwo, '33. each call returns its own frozen instance');
        assert(JSON.stringify(policyOne) === JSON.stringify(policyTwo), '34. both instances carry byte-identical content');

        // Changing which field the policy compares first (a hypothetical
        // future policy) changes the RANKING, never the underlying
        // statistics — proven by ranking the identical three publishers
        // from Section D under the actual policy again, confirming Carol's
        // own statistics object is the untouched, exact instance either
        // way.
        const carol = fabricatedStatistics('Carol', { achievementCount: 4, distinctAchievementKindCount: 4, publicationIdentityCount: 2 });
        const rankingWithCarol = describePublisherRanking([alice, carol]);
        const carolEntry = rankingWithCarol.entries.find((e) => e.publisherIdentity.publisherId === 'Carol');
        assert(carolEntry.statistics === carol, '35. Carol\'s own statistics object is echoed verbatim regardless of where the policy ranks her');
        assert(carolEntry.statistics.distinctAchievementKindCount === 4, '36. Carol\'s own distinctAchievementKindCount fact is untouched by ranking below Alice');
    }
    console.log('✓ Section F: ranking never mutates its inputs — a rank is disposable policy output over immutable statistics');

    // ---------------------------------------------------------------
    // Section G — deterministic total ordering with unique, gapless ranks.
    // ---------------------------------------------------------------
    {
        const a = fabricatedStatistics('A', { achievementCount: 2, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const b = fabricatedStatistics('B', { achievementCount: 2, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const c = fabricatedStatistics('C', { achievementCount: 2, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });

        const ranking = describePublisherRanking([c, a, b]);
        const ranks = ranking.entries.map((e) => e.rank);
        assert(JSON.stringify(ranks) === JSON.stringify([1, 2, 3]), '37. three publishers with byte-identical statistics still receive three unique, gapless ranks — never competition ranking (1, 1, 3)');
        assert(rankOf(ranking, 'A') === 1 && rankOf(ranking, 'B') === 2 && rankOf(ranking, 'C') === 3, '38. deterministic order follows the exact-identity tie-break alone when every counted field ties');

        // Their statistics remain visibly identical — only rank differs.
        assert(ranking.entries[0].achievementCount === ranking.entries[1].achievementCount, '39. tied publishers still show identical, honest statistics on the result');
    }
    console.log('✓ Section G: deterministic total ordering with unique, gapless ranks — never competition ranking');

    // ---------------------------------------------------------------
    // Section H — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        assert(describePublisherRanking([null, undefined, 'garbage', 42, {}]).entries.length === 0, '40. an array of entirely malformed entries produces zero entries, never throws');
        assert(describePublisherRanking([{ publisherIdentity: 'not-a-record' }]).entries.length === 0, '41. an entry whose publisherIdentity is not a genuine PublisherIdentityRecord is excluded');

        const alice = fabricatedStatistics('Alice', { achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const duplicateAlice = fabricatedStatistics('Alice', { achievementCount: 99, distinctAchievementKindCount: 99, publicationIdentityCount: 99 });
        const withDuplicate = describePublisherRanking([alice, duplicateAlice, null, 'garbage']);
        assert(withDuplicate.entries.length === 1, '42. two statistics entries naming the identical publisherId are deduplicated to one');
        assert(withDuplicate.entries[0].statistics === alice, '43. the FIRST occurrence is kept, mirroring this codebase\'s existing "first time seen, kept" convention');

        assert(reconstructPublisherRanking(null).entries.length === 0, '44. a null archive reconstructs to an empty ranking, never throws');
        assert(reconstructPublisherRanking({}).entries.length === 0, '45. a plain object masquerading as an archive reconstructs to an empty ranking');
        assert(reconstructPublisherRanking(undefined).entries.length === 0, '46. an undefined archive never throws');
    }
    console.log('✓ Section H: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section I — reconstructPublisherRanking() over a real, persisted
    // archive: publisher population from explicit association alone, zero
    // network access, no archive mutation, reload equivalence.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'i-anchor-a', contentHash: 'i-content-a', txid: 'a'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        archive = btcUseCase.execute(archive, { anchorId: 'i-anchor-b', contentHash: 'i-content-b', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-02T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'i-content-c', txid: '0x' + 'c'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-03T00:00:00Z') });

        const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'i-anchor-a').toBlockchainPublicationIdentity();
        const identityB = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'i-anchor-b').toBlockchainPublicationIdentity();
        const identityC = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        // Alice claims A and C (two publications); Bob claims only B (one
        // publication) — nobody ever associates a fourth, real publication
        // this replica also knows about, so it must never appear ranked.
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-08-04T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityC, createdAt: new Date('2026-08-05T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityB, createdAt: new Date('2026-08-06T00:00:00Z') });

        const preCallAssociationCount = archive.publisherPublicationAssociationRecordCount;
        const preCallBitcoinCount = archive.bitcoinAnchorPublicationRecords.length;

        const { result: ranking, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherRanking(archive));
        assert(networkCallOccurred === false, '47. reconstructPublisherRanking() performs zero network access');
        assert(ranking.entries.length === 2, '48. exactly the two publishers who explicitly associated anything are ranked — never a third inferred from the archive\'s own unassociated publications');
        assert(rankOf(ranking, 'Alice') === 1, '49. Alice, with two associated publications and more achievements, ranks above Bob');
        assert(rankOf(ranking, 'Bob') === 2, '50. Bob ranks second');

        const aliceEntry = ranking.entries.find((e) => e.publisherIdentity.publisherId === 'Alice');
        const expectedAliceStats = reconstructPublisherAchievementStatistics(archive, aliceEntry.publisherIdentity);
        assert(JSON.stringify(aliceEntry.statistics) === JSON.stringify(expectedAliceStats), '51. Alice\'s embedded statistics match reconstructPublisherAchievementStatistics() composed directly — no parallel statistics engine');

        // No archive mutation.
        assert(archive.publisherPublicationAssociationRecordCount === preCallAssociationCount, '52. computing a ranking never mutates the archive\'s own association record count');
        assert(archive.bitcoinAnchorPublicationRecords.length === preCallBitcoinCount, '53. computing a ranking never mutates the archive\'s own Bitcoin records');

        // Reload equivalence.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        const restored = persistence.load();
        const reconstructedRanking = reconstructPublisherRanking(restored);
        assert(JSON.stringify(serializeRanking(reconstructedRanking)) === JSON.stringify(serializeRanking(ranking)), '54. reload equivalence: a restored archive reconstructs a byte-identical ranking to the live one it was saved from');

        // Repeated reconstruction is byte-identical.
        const rankingAgain = reconstructPublisherRanking(archive);
        assert(JSON.stringify(serializeRanking(rankingAgain)) === JSON.stringify(serializeRanking(ranking)), '55. repeated calls on identical input produce byte-identical output');

        assert(blockchainNeverAppearsInPolicy(), '56. sanity — the policy carries no blockchain vocabulary (re-checked after a real multi-chain archive)');
        function blockchainNeverAppearsInPolicy() {
            const serialized = JSON.stringify(describePublisherRankingPolicy()).toLowerCase();
            return !serialized.includes(BlockchainKind.BITCOIN.toLowerCase()) && !serialized.includes(BlockchainKind.BASE.toLowerCase());
        }

        assertNeverScored(ranking, 'liveRanking');
    }
    console.log('✓ Section I: reconstructPublisherRanking() composes explicit association + existing statistics reconstruction, with zero network access, no archive mutation, and reload equivalence');

    // ---------------------------------------------------------------
    // Section J — no score/points/level/tier/xp/reputation/weight/
    // rating/percentile vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const alice = fabricatedStatistics('Alice', { achievementCount: 2, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
        const ranking = describePublisherRanking([alice]);
        assertNeverScored(ranking, 'noVerdictRanking');

        const entryKeys = Object.keys(ranking.entries[0]);
        assert(entryKeys.includes('rank'), '57. "rank" itself is the one, deliberately introduced ordinal field this milestone adds');
        for (const key of ['score', 'points', 'level', 'tier', 'xp', 'reputation', 'weight', 'rating', 'percentile']) {
            assert(!entryKeys.map((k) => k.toLowerCase()).includes(key), `58. ${key} must never exist on a ranking entry`);
        }

        assert(Object.isFrozen(ranking.entries[0]), '59. every ranking entry is frozen');
    }
    console.log('✓ Section J: no score/points/level/tier/xp/reputation/weight/rating/percentile vocabulary anywhere — "rank" is the one ordinal concept this milestone introduces');

    console.log('\nAll PublisherRankingPolicy tests passed.');
}

run().catch((error) => {
    console.error('PublisherRankingPolicy.test.js FAILED:', error);
    process.exitCode = 1;
});
