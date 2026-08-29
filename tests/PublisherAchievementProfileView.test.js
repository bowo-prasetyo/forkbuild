import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherPublicationAssociationRecord } from '../application/PublisherPublicationAssociationRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { AchievementKind, describeAchievementEvents, reconstructAchievementEvents } from '../application/AchievementEvent.js';
import {
    describePublisherAchievementProfile,
    reconstructPublisherAchievementProfile
} from '../application/PublisherAchievementProfileView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.109 — Publisher Achievement Profile Projection.
//
// Section A: a publisher with zero associations produces an empty, valid
//            profile — never an error, never null
// Section B: a publisher's own single associated publication's own
//            achievements are all attributed to the profile, verbatim
// Section C: achievements belonging to a publication this publisher never
//            associated are excluded, even when that publication genuinely
//            earned something
// Section D: duplicate associations (the same publisher/publication pair
//            recorded twice) never duplicate achievements — association
//            multiplicity is historical fact, achievement multiplicity
//            comes from achievement events alone
// Section E: achievementCount (event count) and distinctAchievementKindCount
//            (kind count) are two different facts, neither collapsed into
//            the other
// Section F: malformed/absent inputs never throw
// Section G: FLAGSHIP — Alice claims a Bitcoin publication and a Base
//            publication (plus a duplicate association to the Bitcoin one);
//            Bob claims a different Base publication; A and B share a
//            contentHash, B and C share a contentHash — Alice's profile
//            names only A and B's achievements, never Bob's, and the
//            duplicate association never duplicates anything, order of
//            association records never changes the result
// Section H: reconstructPublisherAchievementProfile() composes the
//            archive's own existing association and achievement
//            reconstructions — reload equivalence, zero network access, no
//            parallel engine of either kind
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
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a publisher achievement profile aggregates attributable facts, it does not score or rank them`);
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

function identity({ blockchain, contentHash, chainReference, createdAt }) {
    return new BlockchainPublicationIdentity({ blockchain, contentHash, chainReference, createdAt });
}

function association({ publisherId, publicationIdentity, createdAt }) {
    return new PublisherPublicationAssociationRecord({
        publisherIdentity: new PublisherIdentityRecord({ publisherId }),
        publicationIdentity,
        createdAt
    });
}

function kindsOf(profile) {
    return profile.achievements.map((a) => a.achievementKind);
}

function serializeAchievement(event) {
    return {
        achievementKind: event.achievementKind,
        label: event.label,
        observedAt: event.observedAt.toISOString(),
        sourcePublicationIdentity: event.sourcePublicationIdentity.toJSON(),
        index: event.index
    };
}

const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — a publisher with zero associations.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = describePublisherAchievementProfile(alice, [], []);

        assert(profile.publisherIdentity === alice, '1. publisherIdentity is echoed back, even with zero associations');
        assert(profile.publicationIdentityCount === 0, '2. zero associations means zero distinct publications');
        assert(profile.publicationIdentities.length === 0, '3. publicationIdentities is an empty array, never null or undefined');
        assert(profile.achievementCount === 0, '4. zero associations means zero achievements');
        assert(profile.achievements.length === 0, '5. achievements is an empty array');
        assert(profile.distinctAchievementKindCount === 0, '6. zero achievements means zero distinct kinds');
        assert(profile.achievementKinds.length === 0, '7. achievementKinds is an empty array');
        assert(Object.isFrozen(profile) && Object.isFrozen(profile.achievements) && Object.isFrozen(profile.publicationIdentities), '8. the profile and its arrays are frozen');

        // A publisher genuinely present in the archive's own associations,
        // but for a DIFFERENT publisher, still yields an empty profile.
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        let archive = bitcoinUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'a-anchor', contentHash: 'a-content', txid: 'a'.repeat(64), network: NETWORK, createdAt: new Date('2026-01-01T00:00:00Z') });
        const publicationIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'Someone Else', publicationIdentity, createdAt: new Date('2026-01-02T00:00:00Z') });

        const unrelatedProfile = reconstructPublisherAchievementProfile(archive, alice);
        assert(unrelatedProfile.achievementCount === 0, '9. a publisher with no recorded associations produces an empty profile even when other publishers\' associations and achievements exist');
        assert(unrelatedProfile.publicationIdentityCount === 0, '10. likewise for publicationIdentityCount');
    }
    console.log('✓ Section A: a publisher with zero associations produces a valid, empty profile');

    // ---------------------------------------------------------------
    // Section B — a publisher's own single associated publication's
    // achievements, verbatim.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'b-anchor', contentHash: 'b-content', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-02-01T00:00:00Z') });
        const btc = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const events = describeAchievementEvents(archive.bitcoinAnchorPublicationRecords, []);
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const records = [association({ publisherId: 'Alice', publicationIdentity: btc, createdAt: new Date('2026-02-02T00:00:00Z') })];

        const profile = describePublisherAchievementProfile(alice, records, events.events);
        assert(profile.publicationIdentityCount === 1, '11. exactly one distinct publication is attributed to Alice');
        assert(profile.publicationIdentities[0].sameAs(btc), '12. it is the Bitcoin publication Alice associated');
        assert(profile.achievementCount === 2, '13. Alice\'s profile carries exactly the two achievements her one publication earned');
        assert(kindsOf(profile).includes(AchievementKind.FIRST_PUBLICATION), '14. FIRST_PUBLICATION is included');
        assert(kindsOf(profile).includes(AchievementKind.BITCOIN_PUBLISHER), '15. BITCOIN_PUBLISHER is included');
        for (const achievement of profile.achievements) {
            assert(events.events.includes(achievement), '16. every surviving achievement is the EXACT frozen event instance, never a copy');
        }
    }
    console.log('✓ Section B: a publisher\'s own single associated publication\'s achievements are attributed verbatim');

    // ---------------------------------------------------------------
    // Section C — achievements belonging to an unassociated publication are
    // excluded, even when that publication genuinely earned something.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'c-anchor', contentHash: 'c-btc-content', txid: 'c'.repeat(64), network: NETWORK, createdAt: new Date('2026-03-01T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'c-base-content', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-03-02T00:00:00Z') });

        const btcIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const baseIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        // Alice claims only the Bitcoin publication; nobody claims the Base
        // one.
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: btcIdentity, createdAt: new Date('2026-03-03T00:00:00Z') });

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = reconstructPublisherAchievementProfile(archive, alice);

        assert(kindsOf(profile).includes(AchievementKind.BITCOIN_PUBLISHER), '17. Alice\'s profile includes BITCOIN_PUBLISHER, from her own claimed publication');
        assert(!kindsOf(profile).includes(AchievementKind.BASE_PUBLISHER), '18. Alice\'s profile never includes BASE_PUBLISHER — she never associated the Base publication that earned it');
        assert(!kindsOf(profile).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '19. Alice\'s profile never includes MULTI_CHAIN_PUBLISHER either — that achievement was attributed to the Base publication she does not claim');
    }
    console.log('✓ Section C: achievements belonging to a publication the publisher never associated are excluded, however real those achievements are');

    // ---------------------------------------------------------------
    // Section D — duplicate associations never duplicate achievements.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'd-anchor', contentHash: 'd-content', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-04-01T00:00:00Z') });
        const publicationIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        // Associate Alice with the SAME publication three times.
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-04-02T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-04-03T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity, createdAt: new Date('2026-04-04T00:00:00Z') });
        assert(archive.publisherPublicationAssociationRecordCount === 3, '20. sanity check — three independent association records genuinely exist');

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = reconstructPublisherAchievementProfile(archive, alice);

        assert(profile.publicationIdentityCount === 1, '21. THE FLAGSHIP RULE: three associations naming the same publication still name exactly ONE distinct publication');
        assert(profile.achievementCount === 2, '22. THE FLAGSHIP RULE: achievements are never multiplied by association multiplicity — still exactly the two this one publication earned (FIRST_PUBLICATION, BITCOIN_PUBLISHER)');

        // A single association produces the identical achievement result.
        let singleArchive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'd-anchor', contentHash: 'd-content', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-04-01T00:00:00Z') });
        singleArchive = associationUseCase.execute(singleArchive, { publisherId: 'Alice', publicationIdentity: singleArchive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity(), createdAt: new Date('2026-04-02T00:00:00Z') });
        const singleProfile = reconstructPublisherAchievementProfile(singleArchive, alice);
        assert(singleProfile.achievementCount === profile.achievementCount, '23. one association produces the identical achievementCount as three duplicate associations of the same pair');
    }
    console.log('✓ Section D: duplicate associations never duplicate achievements — association multiplicity is historical fact, achievement multiplicity comes from achievement events alone');

    // ---------------------------------------------------------------
    // Section E — achievementCount and distinctAchievementKindCount are two
    // different facts.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        // Two of Alice's OWN publications, each independently earning its
        // own FIRST_REFERENCE_CREATED — the identical achievement KIND,
        // twice, from two different publications.
        archive = btcUseCase.execute(archive, { anchorId: 'e-anchor-1', contentHash: 'e-content-1', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'e-content-2', txid: 'f'.repeat(64), network: NETWORK, createdAt: new Date('2026-05-02T00:00:00Z') });
        const identity1 = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const identity2 = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        const someoneElse = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'e-other', chainReference: 'e-other-ref', createdAt: new Date('2026-05-01T00:00:00Z') });

        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identity1, createdAt: new Date('2026-05-03T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identity2, createdAt: new Date('2026-05-04T00:00:00Z') });

        const record1ReferencesElsewhere = { sourcePublicationIdentity: identity1, referencedPublicationIdentity: someoneElse, createdAt: new Date('2026-05-05T00:00:00Z') };
        const record2ReferencesElsewhere = { sourcePublicationIdentity: identity2, referencedPublicationIdentity: someoneElse, createdAt: new Date('2026-05-06T00:00:00Z') };

        // Build reference records through the real class so
        // describeAchievementEvents() accepts them.
        const { PublicationReferenceRecord } = await import('../application/PublicationReferenceRecord.js');
        const referenceRecords = [
            new PublicationReferenceRecord(record1ReferencesElsewhere),
            new PublicationReferenceRecord(record2ReferencesElsewhere)
        ];

        const events = describeAchievementEvents(archive.bitcoinAnchorPublicationRecords, archive.baseAnchorPublicationRecords, referenceRecords);
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const profile = describePublisherAchievementProfile(alice, archive.publisherPublicationAssociationRecords, events.events);

        const firstReferenceCreatedCount = profile.achievements.filter((a) => a.achievementKind === AchievementKind.FIRST_REFERENCE_CREATED).length;
        assert(firstReferenceCreatedCount === 2, '24. Alice genuinely earned FIRST_REFERENCE_CREATED twice — once per publication');
        assert(profile.achievementKinds.filter((k) => k === AchievementKind.FIRST_REFERENCE_CREATED).length === 1, '25. FIRST_REFERENCE_CREATED appears exactly once in the distinct-kind list, however many times it was earned');
        assert(profile.achievementCount > profile.distinctAchievementKindCount, '26. achievementCount (event count) is strictly greater than distinctAchievementKindCount (kind count) here — the two are never collapsed into one number');
    }
    console.log('✓ Section E: achievementCount and distinctAchievementKindCount are two different facts, neither collapsed into the other');

    // ---------------------------------------------------------------
    // Section F — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });

        assert(describePublisherAchievementProfile(alice).achievementCount === 0, '27. omitted arguments never throw, produce zero achievements');
        assert(describePublisherAchievementProfile(alice, null, null).achievementCount === 0, '28. null arguments never throw');
        assert(describePublisherAchievementProfile(alice, 'not-an-array', 'not-an-array').achievementCount === 0, '29. non-array arguments never throw');
        assert(describePublisherAchievementProfile(alice, [{ fake: true }, null, 'x'], [{ fake: true }, null]).achievementCount === 0, '30. garbage entries are silently excluded rather than throwing');
        assert(describePublisherAchievementProfile(null, [], []).achievementCount === 0, '31. a null publisherIdentity never throws, matches nothing');
        assert(describePublisherAchievementProfile(undefined, [], []).achievementCount === 0, '32. an undefined publisherIdentity never throws');
        assert(describePublisherAchievementProfile({ fake: true }, [], []).achievementCount === 0, '33. a plain object masquerading as a publisher identity never throws');
        assert(describePublisherAchievementProfile('not-an-identity', [], []).achievementCount === 0, '34. a bare string never throws');

        assert(reconstructPublisherAchievementProfile(null, alice).achievementCount === 0, '35. a null archive reconstructs to an empty profile, never throws');
        assert(reconstructPublisherAchievementProfile({}, alice).achievementCount === 0, '36. a plain object masquerading as an archive reconstructs to an empty profile');
        assert(reconstructPublisherAchievementProfile(PublicationObservationArchive.empty(), null).achievementCount === 0, '37. reconstructPublisherAchievementProfile() with no identity at all never throws');
    }
    console.log('✓ Section F: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: Alice claims a Bitcoin publication (A) and a
    // Base publication (B), plus a duplicate association to A; Bob claims a
    // different Base publication (C); A and B share a contentHash, B and C
    // share a contentHash.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        const SHARED_CONTENT_HASH = 'g'.repeat(64); // A, B, and C all publish this identical content
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

        assert(identityA.contentHash === identityB.contentHash && identityB.contentHash === identityC.contentHash, '38. sanity check — A, B, and C genuinely share an identical contentHash');

        // Alice claims A and B — plus a duplicate association re-claiming A.
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-06-04T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityB, createdAt: new Date('2026-06-05T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-06-06T00:00:00Z') }); // duplicate

        // Bob claims a DIFFERENT publication, C — despite C sharing an
        // identical contentHash with both of Alice's own publications.
        archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityC, createdAt: new Date('2026-06-07T00:00:00Z') });

        assert(archive.publisherPublicationAssociationRecordCount === 4, '39. exactly four association records exist (Alice x3, Bob x1)');

        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });

        const aliceProfile = reconstructPublisherAchievementProfile(archive, alice);
        const bobProfile = reconstructPublisherAchievementProfile(archive, bob);

        assert(aliceProfile.publicationIdentityCount === 2, '40. Alice\'s profile names exactly two DISTINCT publications, despite three association records — the duplicate never inflates this count');
        assert(aliceProfile.publicationIdentities.some((p) => p.sameAs(identityA)), '41. Alice\'s profile contains publication A (Bitcoin)');
        assert(aliceProfile.publicationIdentities.some((p) => p.sameAs(identityB)), '42. Alice\'s profile contains publication B (Base)');
        assert(!aliceProfile.publicationIdentities.some((p) => p.sameAs(identityC)), '43. Alice\'s profile does NOT contain publication C, despite C sharing an identical contentHash with both of her own publications');

        assert(bobProfile.publicationIdentityCount === 1, '44. Bob\'s profile names exactly one publication');
        assert(bobProfile.publicationIdentities[0].sameAs(identityC), '45. Bob\'s profile contains publication C');
        assert(!bobProfile.publicationIdentities.some((p) => p.sameAs(identityA) || p.sameAs(identityB)), '46. Bob\'s profile does NOT contain A or B — a shared contentHash never merges two publishers\' work');

        // Every achievement in Alice's profile genuinely traces back to A or
        // B, never C, and vice versa for Bob.
        for (const achievement of aliceProfile.achievements) {
            assert(achievement.sourcePublicationIdentity.sameAs(identityA) || achievement.sourcePublicationIdentity.sameAs(identityB), '47. every achievement in Alice\'s profile is attributed to A or B, never C');
        }
        for (const achievement of bobProfile.achievements) {
            assert(achievement.sourcePublicationIdentity.sameAs(identityC), '48. every achievement in Bob\'s profile is attributed to C');
        }

        // MULTI_CHAIN_PUBLISHER: Alice's own publications span two chains
        // (Bitcoin A, Base B) — she should have earned it exactly once,
        // attributed to whichever of her own publications completed the
        // pair chronologically across the WHOLE archive (B, the second
        // blockchain publication ever, completes the archive-wide pair
        // before C, the third, does).
        assert(kindsOf(aliceProfile).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '49. Alice\'s profile includes MULTI_CHAIN_PUBLISHER, earned by publication B which she explicitly claims');
        assert(!kindsOf(bobProfile).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '50. Bob\'s profile never includes MULTI_CHAIN_PUBLISHER — that achievement belongs to publication B, which he never claimed');

        // Reordering the underlying association records never changes the
        // result.
        const shuffledRecords = [...archive.publisherPublicationAssociationRecords].reverse();
        const events = reconstructAchievementEvents(archive).events;
        const reorderedProfile = describePublisherAchievementProfile(alice, shuffledRecords, events);
        assert(reorderedProfile.publicationIdentityCount === aliceProfile.publicationIdentityCount, '51. reordering association records never changes publicationIdentityCount');
        assert(JSON.stringify(reorderedProfile.achievements.map(serializeAchievement)) === JSON.stringify(aliceProfile.achievements.map(serializeAchievement)), '52. reordering association records never changes which achievements survive, or their order');

        // Repeated reconstruction is byte-identical.
        const aliceProfileAgain = reconstructPublisherAchievementProfile(archive, alice);
        assert(JSON.stringify(aliceProfileAgain.achievements.map(serializeAchievement)) === JSON.stringify(aliceProfile.achievements.map(serializeAchievement)), '53. repeated calls on identical input produce byte-identical output');

        assertNeverScored(aliceProfile, 'flagshipAliceProfile');
        assertNeverScored(bobProfile, 'flagshipBobProfile');
    }
    console.log('✓ Section G: FLAGSHIP — two publishers, three publications sharing one contentHash across two chains, a duplicate association, correctly and exclusively attributed');

    // ---------------------------------------------------------------
    // Section H — reconstructPublisherAchievementProfile() over a real,
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
        const { result: liveProfile, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherAchievementProfile(archive, alice));
        assert(networkCallOccurred === false, '54. reconstructPublisherAchievementProfile() performs zero network access');
        assert(kindsOf(liveProfile).includes(AchievementKind.BITCOIN_PUBLISHER), '55. the live profile includes Alice\'s Bitcoin publication\'s own achievements');
        assert(kindsOf(liveProfile).includes(AchievementKind.BASE_PUBLISHER), '56. the live profile includes Alice\'s Base publication\'s own achievements');
        assert(kindsOf(liveProfile).includes(AchievementKind.MULTI_CHAIN_PUBLISHER), '57. the live profile includes MULTI_CHAIN_PUBLISHER, composed from the archive\'s existing achievement reconstruction, never a second achievement engine');

        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        const restored = persistence.load();
        const reconstructedProfile = reconstructPublisherAchievementProfile(restored, alice);
        assert(JSON.stringify(reconstructedProfile.achievements.map(serializeAchievement)) === JSON.stringify(liveProfile.achievements.map(serializeAchievement)), '58. reload equivalence: a restored archive projects a byte-identical profile to the live one it was saved from');
        assert(reconstructedProfile.publicationIdentityCount === liveProfile.publicationIdentityCount, '59. publicationIdentityCount survives reload equivalence too');

        // Provenance restamping never changes which achievements a
        // publisher's profile names — exactly like every other collection
        // this archive already holds.
        const importedRestored = restored.withUniformProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        const importedProfile = reconstructPublisherAchievementProfile(importedRestored, alice);
        assert(importedProfile.achievementCount === liveProfile.achievementCount, '60. provenance restamping never changes achievementCount');

        assertNeverScored(liveProfile, 'liveProfile');
    }
    console.log('✓ Section H: reconstructPublisherAchievementProfile() composes the archive\'s own existing association and achievement reconstructions, with reload equivalence and zero network access');

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
        const profile = reconstructPublisherAchievementProfile(archive, alice);
        assertNeverScored(profile, 'noVerdictProfile');
        assert(Object.isFrozen(profile.achievements), '61. the achievements array is frozen');
        assert(Object.isFrozen(profile.publicationIdentities), '62. the publicationIdentities array is frozen');
        assert(Object.isFrozen(profile.achievementKinds), '63. the achievementKinds array is frozen');
        for (const achievement of profile.achievements) {
            assert(Object.isFrozen(achievement), '64. every achievement in the profile remains frozen — the exact same frozen object describeAchievementEvents() produced');
        }

        // Mutating the caller's own input arrays after the fact never
        // changes an already-returned profile.
        const mutableRecords = [...archive.publisherPublicationAssociationRecords];
        const mutableEvents = [...reconstructAchievementEvents(archive).events];
        const snapshot = describePublisherAchievementProfile(alice, mutableRecords, mutableEvents);
        mutableRecords.length = 0;
        mutableEvents.length = 0;
        assert(snapshot.publicationIdentityCount === 1 && snapshot.achievementCount === 2, '65. clearing the caller\'s own arrays after the call never changes the already-returned profile');
    }
    console.log('✓ Section I: no verdict/score/points/rank vocabulary anywhere, and every array stays frozen');

    console.log('\nAll PublisherAchievementProfileView tests passed.');
}

run().catch((error) => {
    console.error('PublisherAchievementProfileView.test.js FAILED:', error);
    process.exitCode = 1;
});
