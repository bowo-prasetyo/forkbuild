import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { AchievementKind } from '../application/AchievementEvent.js';
import { describeAchievementBadges, reconstructAchievementBadges } from '../application/AchievementBadgeView.js';
import {
    describePublisherAchievementProfile,
    reconstructPublisherAchievementProfile
} from '../application/PublisherAchievementProfileView.js';
import {
    describePublisherAchievementBadges,
    reconstructPublisherAchievementBadges
} from '../application/PublisherAchievementBadgeView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.110 — Publisher Achievement Badge Projection.
//
// Section A: a publisher with an empty profile earns no badges — never an
//            error, never null
// Section B: a publisher's own associated publication's badges are
//            preserved verbatim — the exact frozen badge object
//            AchievementBadgeView.js already produced, never copied or
//            reshaped
// Section C: badges belonging to a publication the publisher never
//            associated are excluded, even when that publication genuinely
//            earned a badge
// Section D: duplicate associations never duplicate badges
// Section E: reference-derived achievement kinds appear in the publisher's
//            own profile but never as a badge here — badgeCount can be
//            strictly less than achievementCount, and this file's own
//            achievementKinds/distinctAchievementKindCount describe only
//            the surviving badges, never the profile's wider field
// Section F: malformed/absent inputs never throw
// Section G: FLAGSHIP — two publishers, three publications sharing one
//            contentHash across two chains, a duplicate association;
//            sourceAnchorId and every other badge field survive the
//            publisher-scoped filter unchanged
// Section H: reconstructPublisherAchievementBadges() composes the
//            archive's own existing profile and badge reconstructions —
//            reload equivalence, zero network access
// Section I: no verdict/score/points/rank vocabulary anywhere

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength',
    'included', 'confirmed', 'safe', 'healthy', 'rank', 'points', 'level', 'tier',
    'owner', 'ownerProven', 'verified', 'official', 'authentic', 'worth'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a publisher achievement badge presents an achievement already earned, it does not score or rank it`);
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

function kindsOf(result) {
    return result.badges.map((b) => b.achievementKind);
}

function serializeBadge(badge) {
    return {
        achievementKind: badge.achievementKind,
        title: badge.title,
        description: badge.description,
        icon: badge.icon,
        earnedAt: badge.earnedAt.toISOString(),
        sourcePublicationIdentity: badge.sourcePublicationIdentity.toJSON(),
        sourceAnchorId: badge.sourceAnchorId,
        index: badge.index
    };
}

const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — a publisher with an empty profile earns no badges.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const emptyProfile = describePublisherAchievementProfile(alice, [], []);
        const result = describePublisherAchievementBadges(emptyProfile, []);

        assert(result.publisherIdentity === alice, '1. publisherIdentity is echoed back from the profile, even with zero badges');
        assert(result.publicationIdentityCount === 0, '2. publicationIdentityCount is echoed back from the profile');
        assert(result.badgeCount === 0, '3. zero achievements means zero badges');
        assert(result.badges.length === 0, '4. badges is an empty array, never null or undefined');
        assert(result.distinctAchievementKindCount === 0, '5. zero badges means zero distinct kinds');
        assert(result.achievementKinds.length === 0, '6. achievementKinds is an empty array');
        assert(Object.isFrozen(result) && Object.isFrozen(result.badges) && Object.isFrozen(result.achievementKinds), '7. the result and its arrays are frozen');
    }
    console.log('✓ Section A: a publisher with an empty profile earns no badges');

    // ---------------------------------------------------------------
    // Section B — a publisher's own associated publication's badges are
    // preserved verbatim.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'b-anchor', contentHash: 'b-content', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-02-01T00:00:00Z') });
        const btcIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: btcIdentity, createdAt: new Date('2026-02-02T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = reconstructPublisherAchievementProfile(archive, alice);
        const { badges: allBadges } = reconstructAchievementBadges(archive);
        const result = describePublisherAchievementBadges(profile, allBadges);

        assert(result.badgeCount === profile.achievementCount, '8. Alice earned two achievements (FIRST_PUBLICATION, BITCOIN_PUBLISHER), both badge-covered, so badgeCount equals achievementCount here');
        assert(kindsOf(result).includes(AchievementKind.FIRST_PUBLICATION), '9. FIRST_PUBLICATION is present');
        assert(kindsOf(result).includes(AchievementKind.BITCOIN_PUBLISHER), '10. BITCOIN_PUBLISHER is present');

        for (const badge of result.badges) {
            const original = allBadges.find((b) => b.achievementKind === badge.achievementKind);
            assert(badge === original, '11. every surviving badge is the EXACT frozen badge object AchievementBadgeView.js already produced, never copied or reshaped');
            assert(typeof badge.description === 'string' && badge.description.length > 0, '12. description survives unchanged');
            assert(typeof badge.icon === 'string' && badge.icon.length > 0, '13. icon survives unchanged');
            assert(badge.sourcePublicationIdentity.sameAs(btcIdentity), '14. sourcePublicationIdentity survives unchanged');
        }
    }
    console.log('✓ Section B: a publisher\'s own associated publication\'s badges are preserved verbatim, the exact frozen badge instances AchievementBadgeView.js already produced');

    // ---------------------------------------------------------------
    // Section C — badges belonging to an unassociated publication are
    // excluded, even when that publication genuinely earned a badge.
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
        // one, which nonetheless earns its own real BASE_PUBLISHER badge.
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: btcIdentity, createdAt: new Date('2026-03-03T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const result = reconstructPublisherAchievementBadges(archive, alice);

        assert(kindsOf(result).includes(AchievementKind.BITCOIN_PUBLISHER), '15. Alice\'s badges include BITCOIN_PUBLISHER, from her own claimed publication');
        assert(!kindsOf(result).includes(AchievementKind.BASE_PUBLISHER), '16. Alice\'s badges never include BASE_PUBLISHER — she never associated the Base publication that earned it');
        assert(!kindsOf(result).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '17. Alice\'s badges never include MULTI_CHAIN_PUBLISHER either — that achievement is attributed to the Base publication she does not claim');

        const { badges: allBadges } = reconstructAchievementBadges(archive);
        assert(allBadges.some((b) => b.achievementKind === AchievementKind.BASE_PUBLISHER), '18. sanity check — BASE_PUBLISHER genuinely exists as a badge in this replica as a whole, it is only excluded from Alice\'s own view');
    }
    console.log('✓ Section C: badges belonging to a publication the publisher never associated are excluded, however real those badges are');

    // ---------------------------------------------------------------
    // Section D — duplicate associations never duplicate badges.
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
        const result = reconstructPublisherAchievementBadges(archive, alice);

        assert(result.badgeCount === 2, '19. THE FLAGSHIP RULE: three associations naming the same publication still yield exactly the two badges that one publication earned — FIRST_PUBLICATION, BITCOIN_PUBLISHER');
        const kinds = kindsOf(result);
        assert(new Set(kinds).size === kinds.length, '20. no achievementKind repeats among the badges — duplicate associations never duplicate a badge');
    }
    console.log('✓ Section D: duplicate associations never duplicate badges');

    // ---------------------------------------------------------------
    // Section E — reference-derived achievement kinds appear in the
    // profile but never as a badge here.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'e-anchor', contentHash: 'e-content', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        const identityA = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-05-02T00:00:00Z') });

        const { PublicationReferenceRecord } = await import('../application/PublicationReferenceRecord.js');
        const { BlockchainPublicationIdentity } = await import('../application/BlockchainPublicationIdentity.js');
        const someoneElse = new BlockchainPublicationIdentity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'e-other', chainReference: 'e-other-ref', createdAt: new Date('2026-05-01T00:00:00Z') });
        archive = archive.appendPublicationReferenceRecord(new PublicationReferenceRecord({
            sourcePublicationIdentity: identityA,
            referencedPublicationIdentity: someoneElse,
            createdAt: new Date('2026-05-03T00:00:00Z')
        }));

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = reconstructPublisherAchievementProfile(archive, alice);
        const result = reconstructPublisherAchievementBadges(archive, alice);

        assert(profile.achievementKinds.includes(AchievementKind.FIRST_REFERENCE_CREATED), '21. sanity check — Alice\'s own profile genuinely names FIRST_REFERENCE_CREATED among her achievements');
        assert(!kindsOf(result).includes(AchievementKind.FIRST_REFERENCE_CREATED), '22. FIRST_REFERENCE_CREATED never appears as a badge here — AchievementBadgeView.js itself has no badge vocabulary for reference-derived kinds, and this file invents none');
        assert(result.badgeCount < profile.achievementCount, '23. badgeCount is strictly less than the profile\'s own achievementCount — a real, documented gap, never silently hidden');
        assert(result.distinctAchievementKindCount < profile.distinctAchievementKindCount, '24. this file\'s own distinctAchievementKindCount describes only the surviving badges, never the profile\'s wider field of the same name');
        assert(!result.achievementKinds.includes(AchievementKind.FIRST_REFERENCE_CREATED), '25. this file\'s own achievementKinds never names a kind it produced no badge for');

        // The badge-covered achievements (FIRST_PUBLICATION, BITCOIN_PUBLISHER)
        // still survive normally alongside the reference-derived gap.
        assert(kindsOf(result).includes(AchievementKind.FIRST_PUBLICATION), '26. badge-covered achievements still survive normally');
        assert(kindsOf(result).includes(AchievementKind.BITCOIN_PUBLISHER), '27. badge-covered achievements still survive normally');
    }
    console.log('✓ Section E: reference-derived achievement kinds appear in the publisher\'s own profile but are never fabricated into a badge here — a real, documented gap inherited unchanged from AchievementBadgeView.js\'s own scope');

    // ---------------------------------------------------------------
    // Section F — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });

        assert(describePublisherAchievementBadges().badgeCount === 0, '28. no arguments at all never throws');
        assert(describePublisherAchievementBadges(null).badgeCount === 0, '29. a null profile never throws');
        assert(describePublisherAchievementBadges(undefined).badgeCount === 0, '30. an undefined profile never throws');
        assert(describePublisherAchievementBadges('not-a-profile').badgeCount === 0, '31. a bare string profile never throws');
        assert(describePublisherAchievementBadges({ fake: true }).badgeCount === 0, '32. a plain object masquerading as a profile never throws');
        assert(describePublisherAchievementBadges(null, null).badgeCount === 0, '33. a null achievementBadges argument never throws');
        assert(describePublisherAchievementBadges(null, 'not-an-array').badgeCount === 0, '34. a non-array achievementBadges argument never throws');
        assert(describePublisherAchievementBadges(null, [{ fake: true }, null, 'x']).badgeCount === 0, '35. garbage badge entries are silently excluded rather than throwing');

        const emptyProfile = describePublisherAchievementProfile(alice, [], []);
        assert(describePublisherAchievementBadges(emptyProfile, [{ fake: true }]).badgeCount === 0, '36. a valid profile with garbage badge entries never throws');

        assert(reconstructPublisherAchievementBadges(null, alice).badgeCount === 0, '37. a null archive reconstructs to zero badges, never throws');
        assert(reconstructPublisherAchievementBadges({}, alice).badgeCount === 0, '38. a plain object masquerading as an archive reconstructs to zero badges');
        assert(reconstructPublisherAchievementBadges(PublicationObservationArchive.empty(), null).badgeCount === 0, '39. reconstructPublisherAchievementBadges() with no publisher identity at all never throws');
    }
    console.log('✓ Section F: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: Alice claims a Bitcoin publication (A) and a
    // Base publication (B), plus a duplicate association to A; Bob claims a
    // different Base publication (C); A, B, and C all share one
    // contentHash.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        const SHARED_CONTENT_HASH = 'g'.repeat(64);
        const BITCOIN_TXID_A = '1'.repeat(64);
        const BASE_TXID_B = '0x' + '2'.repeat(64);
        const BASE_TXID_C = '0x' + '3'.repeat(64);

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: BITCOIN_TXID_A, network: NETWORK, createdAt: new Date('2026-06-01T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: BASE_TXID_B, network: NETWORK, createdAt: new Date('2026-06-02T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: BASE_TXID_C, network: NETWORK, createdAt: new Date('2026-06-03T00:00:00Z') });

        const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-A').toBlockchainPublicationIdentity();
        const identityB = archive.baseAnchorPublicationRecords.find((r) => r.txid === BASE_TXID_B).toBlockchainPublicationIdentity();
        const identityC = archive.baseAnchorPublicationRecords.find((r) => r.txid === BASE_TXID_C).toBlockchainPublicationIdentity();

        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-06-04T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityB, createdAt: new Date('2026-06-05T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-06-06T00:00:00Z') }); // duplicate

        archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityC, createdAt: new Date('2026-06-07T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });

        const aliceResult = reconstructPublisherAchievementBadges(archive, alice);
        const bobResult = reconstructPublisherAchievementBadges(archive, bob);

        // Alice's own publications: A is first-publication-ever (Bitcoin),
        // B is the archive-wide second (Base) — completing
        // MULTI_CHAIN_PUBLISHER — so both belong to Alice.
        assert(kindsOf(aliceResult).includes(AchievementKind.FIRST_PUBLICATION), '40. Alice\'s badges include FIRST_PUBLICATION, earned by A');
        assert(kindsOf(aliceResult).includes(AchievementKind.BITCOIN_PUBLISHER), '41. Alice\'s badges include BITCOIN_PUBLISHER, earned by A');
        assert(kindsOf(aliceResult).includes(AchievementKind.BASE_PUBLISHER), '42. Alice\'s badges include BASE_PUBLISHER, earned by B');
        assert(kindsOf(aliceResult).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '43. Alice\'s badges include MULTI_CHAIN_PUBLISHER, earned by B which she explicitly claims');

        const bitcoinPublisherBadge = aliceResult.badges.find((b) => b.achievementKind === AchievementKind.BITCOIN_PUBLISHER);
        assert(bitcoinPublisherBadge.sourceAnchorId === 'anchor-A', '44. sourceAnchorId survives the publisher-scoped filter unchanged, naming A\'s own real anchorId');

        // Bob claims only C — a Base publication which, chronologically
        // third, earns nothing of its own (MULTI_CHAIN_PUBLISHER was
        // already completed by B).
        assert(bobResult.badgeCount === 0, '45. Bob\'s own claimed publication (C) earned no achievement of its own, so Bob has zero badges');
        assert(!kindsOf(bobResult).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '46. Bob\'s badges never include MULTI_CHAIN_PUBLISHER — that badge belongs to publication B, which he never claimed, despite C sharing an identical contentHash');

        // Every badge in Alice's result genuinely traces back to A or B,
        // never C.
        for (const badge of aliceResult.badges) {
            assert(badge.sourcePublicationIdentity.sameAs(identityA) || badge.sourcePublicationIdentity.sameAs(identityB), '47. every badge in Alice\'s result is attributed to A or B, never C');
        }

        // Repeated reconstruction is byte-identical.
        const aliceResultAgain = reconstructPublisherAchievementBadges(archive, alice);
        assert(JSON.stringify(aliceResultAgain.badges.map(serializeBadge)) === JSON.stringify(aliceResult.badges.map(serializeBadge)), '48. repeated calls on identical input produce byte-identical output');

        assertNeverScored(aliceResult, 'flagshipAliceResult');
        assertNeverScored(bobResult, 'flagshipBobResult');
    }
    console.log('✓ Section G: FLAGSHIP — two publishers, three publications sharing one contentHash across two chains, a duplicate association, correctly and exclusively scoped badges with sourceAnchorId preserved');

    // ---------------------------------------------------------------
    // Section H — reconstructPublisherAchievementBadges() over a real,
    // persisted archive, composing existing reconstructions; reload
    // equivalence; zero network access.
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

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const { result: liveResult, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherAchievementBadges(archive, alice));
        assert(networkCallOccurred === false, '49. reconstructPublisherAchievementBadges() performs zero network access');
        assert(kindsOf(liveResult).includes(AchievementKind.BITCOIN_PUBLISHER), '50. the live result includes Alice\'s Bitcoin publication\'s own badge');
        assert(kindsOf(liveResult).includes(AchievementKind.BASE_PUBLISHER), '51. the live result includes Alice\'s Base publication\'s own badge');
        assert(kindsOf(liveResult).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '52. the live result includes MULTI_CHAIN_PUBLISHER, composed from the archive\'s existing profile and badge reconstructions, never a second engine of either kind');

        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        const restored = persistence.load();
        const reconstructedResult = reconstructPublisherAchievementBadges(restored, alice);
        assert(JSON.stringify(reconstructedResult.badges.map(serializeBadge)) === JSON.stringify(liveResult.badges.map(serializeBadge)), '53. reload equivalence: a restored archive projects byte-identical badges to the live one it was saved from');
        assert(reconstructedResult.publicationIdentityCount === liveResult.publicationIdentityCount, '54. publicationIdentityCount survives reload equivalence too');

        // Provenance restamping never changes which badges a publisher's
        // view names — exactly like every other collection this archive
        // already holds.
        const importedRestored = restored.withUniformProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        const importedResult = reconstructPublisherAchievementBadges(importedRestored, alice);
        assert(importedResult.badgeCount === liveResult.badgeCount, '55. provenance restamping never changes badgeCount');

        assertNeverScored(liveResult, 'liveResult');
    }
    console.log('✓ Section H: reconstructPublisherAchievementBadges() composes the archive\'s own existing profile and badge reconstructions, with reload equivalence and zero network access');

    // ---------------------------------------------------------------
    // Section I — no verdict/score/points/rank vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'i-anchor', contentHash: 'i-content', txid: 'j'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        const publicationIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-08-02T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const result = reconstructPublisherAchievementBadges(archive, alice);
        assertNeverScored(result, 'noVerdictResult');
        assert(Object.isFrozen(result.badges), '56. the badges array is frozen');
        assert(Object.isFrozen(result.achievementKinds), '57. the achievementKinds array is frozen');
        for (const badge of result.badges) {
            assert(Object.isFrozen(badge), '58. every badge in the result remains frozen — the exact same frozen object AchievementBadgeView.js produced');
        }

        // Mutating the caller's own input arrays after the fact never
        // changes an already-returned result.
        const profile = reconstructPublisherAchievementProfile(archive, alice);
        const mutableBadges = [...reconstructAchievementBadges(archive).badges];
        const snapshot = describePublisherAchievementBadges(profile, mutableBadges);
        mutableBadges.length = 0;
        assert(snapshot.badgeCount === 2, '59. clearing the caller\'s own array after the call never changes the already-returned result');

        // describeAchievementBadges() itself stays completely untouched by
        // this milestone — the same six achievement kinds, same vocabulary.
        assert(Object.keys(AchievementKind).length === 11, '60. AchievementKind still names eleven values — this milestone invents no achievement of its own');
        assert(describeAchievementBadges([], []).count === 0, '61. AchievementBadgeView.js\'s own describeAchievementBadges() is untouched and still behaves exactly as before');
    }
    console.log('✓ Section I: no verdict/score/points/rank vocabulary anywhere, and every array/badge stays frozen');

    console.log('\nAll PublisherAchievementBadgeView tests passed.');
}

run().catch((error) => {
    console.error('PublisherAchievementBadgeView.test.js FAILED:', error);
    process.exitCode = 1;
});
