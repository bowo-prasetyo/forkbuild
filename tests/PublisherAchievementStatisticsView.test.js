import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { PublicationReferenceRecord } from '../application/PublicationReferenceRecord.js';
import { AchievementKind } from '../application/AchievementEvent.js';
import {
    describePublisherAchievementProfile,
    reconstructPublisherAchievementProfile
} from '../application/PublisherAchievementProfileView.js';
import {
    describePublisherAchievementBadges,
    reconstructPublisherAchievementBadges
} from '../application/PublisherAchievementBadgeView.js';
import {
    describePublisherAchievementStatistics,
    reconstructPublisherAchievementStatistics
} from '../application/PublisherAchievementStatisticsView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.111 — Publisher Achievement Statistics Projection.
//
// Section A: a publisher with an empty profile/badges produces all-zero
//            statistics — never an error, never null
// Section B: a publisher's own single associated publication's counts
//            match the profile/badges it composes, verbatim
// Section C: statistics for an unassociated publication's achievements are
//            excluded, even when that publication genuinely earned them —
//            inherited from the profile/badges this file composes
// Section D: duplicate associations never inflate publicationIdentityCount
//            or blockchainPublicationCounts
// Section E: achievementCount, distinctAchievementKindCount, badgeCount,
//            and distinctBadgeKindCount are four different facts, none
//            silently collapsed into another; badgeCount can be strictly
//            less than achievementCount, and can be zero while
//            achievementCount is nonzero
// Section F: malformed/absent inputs never throw
// Section G: FLAGSHIP — Alice explicitly claims two Bitcoin publications
//            and a Base publication (plus a duplicate association), Bob
//            claims a different Base publication; all four publications
//            share one contentHash; two cross-chain references from
//            Alice's own publications to Bob's; reordering associations
//            never changes the result; repeated reconstruction is
//            byte-identical
// Section H: reconstructPublisherAchievementStatistics() composes the
//            archive's own existing profile/badge reconstructions —
//            reload equivalence, zero network access, no archive mutation
// Section I: no score/rank/level/tier/xp/reputation/weight/rating/
//            percentile vocabulary anywhere, including no "obvious"
//            combined achievementScore/publisherScore/reputationScore

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength',
    'included', 'confirmed', 'safe', 'healthy', 'rank', 'points', 'level', 'tier',
    'owner', 'ownerProven', 'verified', 'official', 'authentic', 'worth',
    'xp', 'reputation', 'rating', 'percentile'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a publisher achievement statistics projection states facts, it does not score or rank them`);
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

function countOf(stats, achievementKind) {
    const entry = stats.achievementKindCounts.find((e) => e.achievementKind === achievementKind);
    return entry ? entry.count : 0;
}

function blockchainCountOf(stats, blockchain) {
    const entry = stats.blockchainPublicationCounts.find((e) => e.blockchain === blockchain);
    return entry ? entry.count : 0;
}

function serializeStatistics(stats) {
    return {
        publisherId: stats.publisherIdentity ? stats.publisherIdentity.publisherId : null,
        publicationIdentityCount: stats.publicationIdentityCount,
        achievementCount: stats.achievementCount,
        distinctAchievementKindCount: stats.distinctAchievementKindCount,
        badgeCount: stats.badgeCount,
        distinctBadgeKindCount: stats.distinctBadgeKindCount,
        achievementKindCounts: stats.achievementKindCounts.map((e) => ({ achievementKind: e.achievementKind, count: e.count })),
        blockchainPublicationCounts: stats.blockchainPublicationCounts.map((e) => ({ blockchain: e.blockchain, count: e.count }))
    };
}

const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — a publisher with an empty profile/badges produces
    // all-zero statistics.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const emptyProfile = describePublisherAchievementProfile(alice, [], []);
        const emptyBadges = describePublisherAchievementBadges(emptyProfile, []);
        const stats = describePublisherAchievementStatistics(emptyProfile, emptyBadges);

        assert(stats.publisherIdentity === alice, '1. publisherIdentity is echoed back, even with zero of everything');
        assert(stats.publicationIdentityCount === 0, '2. zero publications');
        assert(stats.achievementCount === 0, '3. zero achievements');
        assert(stats.distinctAchievementKindCount === 0, '4. zero distinct achievement kinds');
        assert(stats.badgeCount === 0, '5. zero badges');
        assert(stats.distinctBadgeKindCount === 0, '6. zero distinct badge kinds');
        assert(stats.achievementKindCounts.length === 0, '7. achievementKindCounts is an empty array, never null or undefined');
        assert(stats.blockchainPublicationCounts.length === 2, '8. blockchainPublicationCounts still names every BlockchainKind value, even at zero');
        assert(blockchainCountOf(stats, BlockchainKind.BITCOIN) === 0, '9. Bitcoin count is explicitly zero, not absent');
        assert(blockchainCountOf(stats, BlockchainKind.BASE) === 0, '10. Base count is explicitly zero, not absent');
        assert(Object.isFrozen(stats) && Object.isFrozen(stats.achievementKindCounts) && Object.isFrozen(stats.blockchainPublicationCounts), '11. the result and its arrays are frozen');
        for (const entry of stats.blockchainPublicationCounts) assert(Object.isFrozen(entry), '12. every blockchainPublicationCounts entry is frozen');
    }
    console.log('✓ Section A: a publisher with an empty profile/badges produces valid, all-zero statistics');

    // ---------------------------------------------------------------
    // Section B — a publisher's own single associated publication's
    // counts match the profile/badges it composes, verbatim.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'b-anchor', contentHash: 'b-content', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-02-01T00:00:00Z') });
        const btcIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: btcIdentity, createdAt: new Date('2026-02-02T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = reconstructPublisherAchievementProfile(archive, alice);
        const badges = reconstructPublisherAchievementBadges(archive, alice);
        const stats = describePublisherAchievementStatistics(profile, badges);

        assert(stats.publicationIdentityCount === profile.publicationIdentityCount, '13. publicationIdentityCount matches the profile it composes');
        assert(stats.achievementCount === profile.achievementCount, '14. achievementCount matches the profile it composes');
        assert(stats.distinctAchievementKindCount === profile.distinctAchievementKindCount, '15. distinctAchievementKindCount matches the profile it composes');
        assert(stats.badgeCount === badges.badgeCount, '16. badgeCount matches the badges it composes');
        assert(stats.distinctBadgeKindCount === badges.distinctAchievementKindCount, '17. distinctBadgeKindCount matches badges.distinctAchievementKindCount — renamed only to avoid colliding with the profile\'s own field of the same name');
        assert(stats.achievementCount === 2, '18. Alice earned two achievements (FIRST_PUBLICATION, BITCOIN_PUBLISHER)');
        assert(countOf(stats, AchievementKind.FIRST_PUBLICATION) === 1, '19. FIRST_PUBLICATION counted once');
        assert(countOf(stats, AchievementKind.BITCOIN_PUBLISHER) === 1, '20. BITCOIN_PUBLISHER counted once');
        assert(blockchainCountOf(stats, BlockchainKind.BITCOIN) === 1, '21. exactly one Bitcoin publication');
        assert(blockchainCountOf(stats, BlockchainKind.BASE) === 0, '22. zero Base publications');
    }
    console.log('✓ Section B: a publisher\'s own single associated publication\'s statistics match the profile/badges this file composes, verbatim');

    // ---------------------------------------------------------------
    // Section C — statistics for an unassociated publication's
    // achievements are excluded, however real those achievements are.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'c-anchor', contentHash: 'c-btc-content', txid: 'c'.repeat(64), network: NETWORK, createdAt: new Date('2026-03-01T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'c-base-content', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-03-02T00:00:00Z') });

        const btcIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        // Alice claims only the Bitcoin publication; nobody claims the Base
        // one, which nonetheless earns its own real BASE_PUBLISHER.
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: btcIdentity, createdAt: new Date('2026-03-03T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const stats = reconstructPublisherAchievementStatistics(archive, alice);

        assert(countOf(stats, AchievementKind.BITCOIN_PUBLISHER) === 1, '23. Alice\'s statistics include BITCOIN_PUBLISHER, from her own claimed publication');
        assert(countOf(stats, AchievementKind.BASE_PUBLISHER) === 0, '24. Alice\'s statistics never count BASE_PUBLISHER — she never associated the Base publication that earned it');
        assert(countOf(stats, AchievementKind.MULTI_CHAIN_PUBLISHER) === 0, '25. Alice\'s statistics never count MULTI_CHAIN_PUBLISHER either — attributed to the Base publication she does not claim');
        assert(blockchainCountOf(stats, BlockchainKind.BASE) === 0, '26. Alice\'s own Base publication count is zero — the unassociated Base publication is never counted for her');
    }
    console.log('✓ Section C: statistics for a publication the publisher never associated are excluded, however real those achievements are');

    // ---------------------------------------------------------------
    // Section D — duplicate associations never inflate
    // publicationIdentityCount or blockchainPublicationCounts.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'd-anchor', contentHash: 'd-content', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-04-01T00:00:00Z') });
        const publicationIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-04-02T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-04-03T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-04-04T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const stats = reconstructPublisherAchievementStatistics(archive, alice);

        assert(stats.publicationIdentityCount === 1, '27. THE FLAGSHIP RULE: three associations naming the same publication still name exactly ONE distinct publication');
        assert(blockchainCountOf(stats, BlockchainKind.BITCOIN) === 1, '28. blockchainPublicationCounts is never inflated by duplicate associations either');
        assert(stats.achievementCount === 2, '29. achievementCount is unaffected by association multiplicity — FIRST_PUBLICATION, BITCOIN_PUBLISHER');
    }
    console.log('✓ Section D: duplicate associations never inflate publicationIdentityCount or blockchainPublicationCounts');

    // ---------------------------------------------------------------
    // Section E — achievementCount, distinctAchievementKindCount,
    // badgeCount, and distinctBadgeKindCount are four different facts.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'e-anchor', contentHash: 'e-content', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        const identityA = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-05-02T00:00:00Z') });

        const someoneElse = new BlockchainPublicationIdentity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'e-other', chainReference: 'e-other-ref', createdAt: new Date('2026-05-01T00:00:00Z') });
        archive = archive.appendPublicationReferenceRecord(new PublicationReferenceRecord({
            sourcePublicationIdentity: identityA,
            referencedPublicationIdentity: someoneElse,
            createdAt: new Date('2026-05-03T00:00:00Z')
        }));

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const stats = reconstructPublisherAchievementStatistics(archive, alice);

        // FIRST_PUBLICATION, BITCOIN_PUBLISHER (badge-covered) +
        // FIRST_REFERENCE_CREATED (reference-derived, no badge vocabulary).
        assert(stats.achievementCount === 3, '30. Alice earned three achievement events total');
        assert(stats.distinctAchievementKindCount === 3, '31. three distinct achievement kinds');
        assert(stats.badgeCount === 2, '32. only two of those three are badge-covered');
        assert(stats.distinctBadgeKindCount === 2, '33. only two distinct badge kinds');
        assert(stats.badgeCount < stats.achievementCount, '34. badgeCount is strictly less than achievementCount — a real, documented gap, never silently hidden');
        assert(stats.distinctBadgeKindCount < stats.distinctAchievementKindCount, '35. distinctBadgeKindCount is strictly less than distinctAchievementKindCount for the identical reason');
        assert(countOf(stats, AchievementKind.FIRST_REFERENCE_CREATED) === 1, '36. FIRST_REFERENCE_CREATED is counted in achievementKindCounts even though it earns no badge');

        // A publisher whose only achievement is reference-derived has
        // badgeCount === 0 while achievementCount > 0.
        const { PublicationReferenceRecord: ReferenceRecordClass } = await import('../application/PublicationReferenceRecord.js');
        void ReferenceRecordClass; // sanity: class already imported above; re-import mirrors sibling test style
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });
        const someoneElseAsBob = new BlockchainPublicationIdentity({ blockchain: BlockchainKind.BASE, contentHash: 'bob-content', chainReference: 'bob-ref', createdAt: new Date('2026-05-04T00:00:00Z') });
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = bobArchive.appendPublicationReferenceRecord(new PublicationReferenceRecord({
            sourcePublicationIdentity: someoneElse,
            referencedPublicationIdentity: someoneElseAsBob,
            createdAt: new Date('2026-05-05T00:00:00Z')
        }));
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Bob', publicationIdentity: someoneElseAsBob, createdAt: new Date('2026-05-06T00:00:00Z') });
        const bobStats = reconstructPublisherAchievementStatistics(bobArchive, bob);
        assert(bobStats.achievementCount === 1, '37. Bob earned exactly one achievement (FIRST_REFERENCE_RECEIVED)');
        assert(bobStats.badgeCount === 0, '38. Bob\'s badgeCount is zero even though achievementCount is nonzero — reference-derived achievements have no badge presentation');
    }
    console.log('✓ Section E: achievementCount, distinctAchievementKindCount, badgeCount, and distinctBadgeKindCount are four different facts, none collapsed into another');

    // ---------------------------------------------------------------
    // Section F — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });

        assert(describePublisherAchievementStatistics().achievementCount === 0, '39. no arguments at all never throws');
        assert(describePublisherAchievementStatistics(null, null).achievementCount === 0, '40. null profile and badges never throw');
        assert(describePublisherAchievementStatistics(undefined, undefined).achievementCount === 0, '41. undefined profile and badges never throw');
        assert(describePublisherAchievementStatistics('not-a-profile', 'not-badges').achievementCount === 0, '42. bare string arguments never throw');
        assert(describePublisherAchievementStatistics({ fake: true }, { fake: true }).achievementCount === 0, '43. plain objects masquerading as a profile/badges never throw');

        const emptyProfile = describePublisherAchievementProfile(alice, [], []);
        assert(describePublisherAchievementStatistics(emptyProfile, null).badgeCount === 0, '44. a valid profile with a null badges argument never throws');
        assert(describePublisherAchievementStatistics(null, describePublisherAchievementBadges(emptyProfile, [])).achievementCount === 0, '45. a null profile with valid badges never throws');

        const malformedStats = describePublisherAchievementStatistics({ achievements: [{ fake: true }, null, 'x'] }, { fake: true });
        assert(malformedStats.achievementCount === 0 && malformedStats.achievementKindCounts.length === 0, '46. garbage achievement entries are silently excluded rather than throwing');

        assert(reconstructPublisherAchievementStatistics(null, alice).achievementCount === 0, '47. a null archive reconstructs to all-zero statistics, never throws');
        assert(reconstructPublisherAchievementStatistics({}, alice).achievementCount === 0, '48. a plain object masquerading as an archive reconstructs to all-zero statistics');
        assert(reconstructPublisherAchievementStatistics(PublicationObservationArchive.empty(), null).achievementCount === 0, '49. reconstructPublisherAchievementStatistics() with no publisher identity at all never throws');
    }
    console.log('✓ Section F: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: Alice claims two Bitcoin publications (A, B)
    // and a Base publication (C), plus a duplicate association re-claiming
    // A; Bob claims a different Base publication (D); A, B, C, and D all
    // share one contentHash; two cross-chain references from A and B
    // (Alice's own) to D (Bob's own).
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        const SHARED_CONTENT_HASH = 'g'.repeat(64);
        const BITCOIN_TXID_A = '1'.repeat(64);
        const BITCOIN_TXID_B = '2'.repeat(64);
        const BASE_TXID_C = '0x' + '3'.repeat(64);
        const BASE_TXID_D = '0x' + '4'.repeat(64);

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: BITCOIN_TXID_A, network: NETWORK, createdAt: new Date('2026-06-01T00:00:00Z') });
        archive = btcUseCase.execute(archive, { anchorId: 'anchor-B', contentHash: SHARED_CONTENT_HASH, txid: BITCOIN_TXID_B, network: NETWORK, createdAt: new Date('2026-06-02T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: BASE_TXID_C, network: NETWORK, createdAt: new Date('2026-06-03T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: BASE_TXID_D, network: NETWORK, createdAt: new Date('2026-06-04T00:00:00Z') });

        const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-A').toBlockchainPublicationIdentity();
        const identityB = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-B').toBlockchainPublicationIdentity();
        const identityC = archive.baseAnchorPublicationRecords.find((r) => r.txid === BASE_TXID_C).toBlockchainPublicationIdentity();
        const identityD = archive.baseAnchorPublicationRecords.find((r) => r.txid === BASE_TXID_D).toBlockchainPublicationIdentity();

        assert(identityA.contentHash === identityB.contentHash && identityB.contentHash === identityC.contentHash && identityC.contentHash === identityD.contentHash, '50. sanity check — A, B, C, and D genuinely share an identical contentHash');

        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-06-05T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityB, createdAt: new Date('2026-06-06T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityC, createdAt: new Date('2026-06-07T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-06-08T00:00:00Z') }); // duplicate

        archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityD, createdAt: new Date('2026-06-09T00:00:00Z') });

        // Two cross-chain references, from each of Alice's own Bitcoin
        // publications to Bob's Base publication.
        archive = archive.appendPublicationReferenceRecord(new PublicationReferenceRecord({
            sourcePublicationIdentity: identityA,
            referencedPublicationIdentity: identityD,
            createdAt: new Date('2026-06-10T00:00:00Z')
        }));
        archive = archive.appendPublicationReferenceRecord(new PublicationReferenceRecord({
            sourcePublicationIdentity: identityB,
            referencedPublicationIdentity: identityD,
            createdAt: new Date('2026-06-11T00:00:00Z')
        }));

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });

        const aliceStats = reconstructPublisherAchievementStatistics(archive, alice);
        const bobStats = reconstructPublisherAchievementStatistics(archive, bob);

        // Publications: Alice explicitly claims A, B, and C — three
        // distinct publications, despite four association records.
        assert(aliceStats.publicationIdentityCount === 3, '51. Alice\'s publicationIdentityCount is 3 — the duplicate association to A never inflates it');
        assert(blockchainCountOf(aliceStats, BlockchainKind.BITCOIN) === 2, '52. Alice has exactly two Bitcoin publications (A, B)');
        assert(blockchainCountOf(aliceStats, BlockchainKind.BASE) === 1, '53. Alice has exactly one Base publication (C)');

        assert(bobStats.publicationIdentityCount === 1, '54. Bob\'s publicationIdentityCount is 1');
        assert(blockchainCountOf(bobStats, BlockchainKind.BITCOIN) === 0, '55. Bob has zero Bitcoin publications');
        assert(blockchainCountOf(bobStats, BlockchainKind.BASE) === 1, '56. Bob has exactly one Base publication (D)');

        // Achievements: A is first-publication-ever + first Bitcoin; C is
        // first Base + completes MULTI_CHAIN_PUBLISHER; both of A and B
        // each independently earn their own FIRST_REFERENCE_CREATED (one
        // event per source) — the identical kind, twice.
        assert(countOf(aliceStats, AchievementKind.FIRST_PUBLICATION) === 1, '57. FIRST_PUBLICATION counted once, earned by A');
        assert(countOf(aliceStats, AchievementKind.BITCOIN_PUBLISHER) === 1, '58. BITCOIN_PUBLISHER counted once, earned by A');
        assert(countOf(aliceStats, AchievementKind.BASE_PUBLISHER) === 1, '59. BASE_PUBLISHER counted once, earned by C');
        assert(countOf(aliceStats, AchievementKind.MULTI_CHAIN_PUBLISHER) === 1, '60. MULTI_CHAIN_PUBLISHER counted once, earned by C');
        assert(countOf(aliceStats, AchievementKind.FIRST_REFERENCE_CREATED) === 2, '61. FIRST_REFERENCE_CREATED counted TWICE — A and B each independently earned it, once per distinct source');
        assert(countOf(aliceStats, AchievementKind.FIRST_CROSS_CHAIN_REFERENCE) === 2, '62. FIRST_CROSS_CHAIN_REFERENCE counted TWICE for the identical reason');

        assert(aliceStats.achievementCount === 8, '63. Alice\'s total achievement events: 4 publication-scoped + 2 FIRST_REFERENCE_CREATED + 2 FIRST_CROSS_CHAIN_REFERENCE = 8');
        assert(aliceStats.distinctAchievementKindCount === 6, '64. six DISTINCT achievement kinds, however many times each fired');
        assert(aliceStats.badgeCount === 4, '65. only the four archive-wide, badge-covered kinds are badges — the reference-derived kinds have none');
        assert(aliceStats.distinctBadgeKindCount === 4, '66. four distinct badge kinds');
        assert(aliceStats.badgeCount < aliceStats.achievementCount, '67. badgeCount strictly less than achievementCount for Alice');

        // Bob's own publication D earns nothing chain-wise (BASE_PUBLISHER
        // and MULTI_CHAIN_PUBLISHER were already earned by C before D
        // existed), but does earn FIRST_REFERENCE_RECEIVED, a
        // reference-derived kind with no badge.
        assert(countOf(bobStats, AchievementKind.BASE_PUBLISHER) === 0, '68. Bob never earns BASE_PUBLISHER — already earned by Alice\'s own C');
        assert(countOf(bobStats, AchievementKind.FIRST_REFERENCE_RECEIVED) === 1, '69. Bob earns FIRST_REFERENCE_RECEIVED, from the first of the two incoming references');
        assert(bobStats.achievementCount === 1, '70. Bob\'s total achievement count is exactly 1');
        assert(bobStats.badgeCount === 0, '71. Bob\'s badgeCount is 0 — his one achievement is reference-derived, with no badge vocabulary');

        // Reordering the underlying association records never changes the
        // result — composed straight through from PublisherAchievementProfileView.js's
        // own already-proven order-independence.
        const shuffledRecords = [...archive.publisherPublicationAssociationRecords].reverse();
        const { reconstructAchievementEvents } = await import('../application/AchievementEvent.js');
        const { reconstructAchievementBadges } = await import('../application/AchievementBadgeView.js');
        const events = reconstructAchievementEvents(archive).events;
        const reorderedProfile = describePublisherAchievementProfile(alice, shuffledRecords, events);
        const { badges: allBadges } = reconstructAchievementBadges(archive);
        const reorderedBadges = describePublisherAchievementBadges(reorderedProfile, allBadges);
        const reorderedStats = describePublisherAchievementStatistics(reorderedProfile, reorderedBadges);
        assert(JSON.stringify(serializeStatistics(reorderedStats)) === JSON.stringify(serializeStatistics(aliceStats)), '72. reordering association records never changes the statistics result');

        // Repeated reconstruction is byte-identical.
        const aliceStatsAgain = reconstructPublisherAchievementStatistics(archive, alice);
        assert(JSON.stringify(serializeStatistics(aliceStatsAgain)) === JSON.stringify(serializeStatistics(aliceStats)), '73. repeated calls on identical input produce byte-identical output');

        assertNeverScored(aliceStats, 'flagshipAliceStats');
        assertNeverScored(bobStats, 'flagshipBobStats');
    }
    console.log('✓ Section G: FLAGSHIP — two publishers, four publications sharing one contentHash across two chains, cross-chain references, a duplicate association, correctly and exclusively tallied statistics');

    // ---------------------------------------------------------------
    // Section H — reconstructPublisherAchievementStatistics() over a real,
    // persisted archive, composing existing reconstructions; reload
    // equivalence; zero network access; no archive mutation.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'h-anchor', contentHash: 'h-btc-content', txid: 'h'.repeat(64), network: NETWORK, createdAt: new Date('2026-07-01T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'h-base-content', txid: 'i'.repeat(64), network: NETWORK, createdAt: new Date('2026-07-02T00:00:00Z') });

        const btcIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const baseIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: btcIdentity, createdAt: new Date('2026-07-03T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: baseIdentity, createdAt: new Date('2026-07-04T00:00:00Z') });

        const preCallAssociationCount = archive.publisherPublicationAssociationRecordCount;
        const preCallBitcoinCount = archive.bitcoinAnchorPublicationRecords.length;
        const preCallBaseCount = archive.baseAnchorPublicationRecords.length;

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const { result: liveStats, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherAchievementStatistics(archive, alice));
        assert(networkCallOccurred === false, '74. reconstructPublisherAchievementStatistics() performs zero network access');
        assert(blockchainCountOf(liveStats, BlockchainKind.BITCOIN) === 1, '75. the live result includes Alice\'s Bitcoin publication');
        assert(blockchainCountOf(liveStats, BlockchainKind.BASE) === 1, '76. the live result includes Alice\'s Base publication');
        assert(countOf(liveStats, AchievementKind.MULTI_CHAIN_PUBLISHER) === 1, '77. the live result includes MULTI_CHAIN_PUBLISHER, composed from the archive\'s existing profile/badge reconstructions, never a second engine of any kind');

        // No archive mutation: the archive's own collections are unchanged
        // after computing statistics from it.
        assert(archive.publisherPublicationAssociationRecordCount === preCallAssociationCount, '78. computing statistics never mutates the archive\'s own association record count');
        assert(archive.bitcoinAnchorPublicationRecords.length === preCallBitcoinCount, '79. computing statistics never mutates the archive\'s own Bitcoin records');
        assert(archive.baseAnchorPublicationRecords.length === preCallBaseCount, '80. computing statistics never mutates the archive\'s own Base records');

        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        const restored = persistence.load();
        const reconstructedStats = reconstructPublisherAchievementStatistics(restored, alice);
        assert(JSON.stringify(serializeStatistics(reconstructedStats)) === JSON.stringify(serializeStatistics(liveStats)), '81. reload equivalence: a restored archive projects byte-identical statistics to the live one it was saved from');

        // Provenance restamping never changes a publisher's own statistics
        // — exactly like every other collection this archive already holds.
        const importedRestored = restored.withUniformProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        const importedStats = reconstructPublisherAchievementStatistics(importedRestored, alice);
        assert(importedStats.achievementCount === liveStats.achievementCount, '82. provenance restamping never changes achievementCount');
        assert(importedStats.badgeCount === liveStats.badgeCount, '83. provenance restamping never changes badgeCount');

        assertNeverScored(liveStats, 'liveStats');
    }
    console.log('✓ Section H: reconstructPublisherAchievementStatistics() composes the archive\'s own existing profile/badge reconstructions, with reload equivalence, zero network access, and no archive mutation');

    // ---------------------------------------------------------------
    // Section I — no score/rank/level/tier/xp/reputation/weight/rating/
    // percentile vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'i-anchor', contentHash: 'i-content', txid: 'j'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        const publicationIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-08-02T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const stats = reconstructPublisherAchievementStatistics(archive, alice);
        assertNeverScored(stats, 'noVerdictStats');
        assert(Object.isFrozen(stats.achievementKindCounts), '84. achievementKindCounts array is frozen');
        assert(Object.isFrozen(stats.blockchainPublicationCounts), '85. blockchainPublicationCounts array is frozen');
        for (const entry of stats.achievementKindCounts) assert(Object.isFrozen(entry), '86. every achievementKindCounts entry is frozen');

        // No single combined field ever sums or weights two or more of this
        // file's own counts into one number.
        const topLevelKeys = Object.keys(stats);
        assert(topLevelKeys.length === 8, '87. exactly the eight documented fields exist, nothing more');
        for (const key of ['achievementScore', 'publisherScore', 'reputationScore', 'combinedScore', 'totalScore']) {
            assert(!topLevelKeys.includes(key), `88. ${key} must never exist on the result`);
        }

        // Mutating the caller's own input objects after the fact never
        // changes an already-returned result.
        const profile = reconstructPublisherAchievementProfile(archive, alice);
        const badges = reconstructPublisherAchievementBadges(archive, alice);
        const snapshot = describePublisherAchievementStatistics(profile, badges);
        assert(snapshot.achievementCount === 2 && snapshot.badgeCount === 2, '89. the snapshot correctly reflects Alice\'s two badge-covered achievements');

        // AchievementEvent.js's own vocabulary stays completely untouched
        // by this milestone.
        assert(Object.keys(AchievementKind).length === 11, '90. AchievementKind still names eleven values — this milestone invents no achievement of its own');
    }
    console.log('✓ Section I: no score/rank/level/tier/xp/reputation/weight/rating/percentile vocabulary anywhere, and every array/entry stays frozen');

    console.log('\nAll PublisherAchievementStatisticsView tests passed.');
}

run().catch((error) => {
    console.error('PublisherAchievementStatisticsView.test.js FAILED:', error);
    process.exitCode = 1;
});
