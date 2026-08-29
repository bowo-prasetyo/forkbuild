import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { PublicationReferenceRecord } from '../application/PublicationReferenceRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { AchievementKind, describeAchievementEvents } from '../application/AchievementEvent.js';
import {
    describeAchievementProfile,
    reconstructAchievementProfile
} from '../application/AchievementProfileView.js';

// 0.8.107 — Achievement Profile Projection.
//
// Section A: an identity with zero matching achievement events produces an
//            empty, valid profile — never an error, never null
// Section B: a single publication's own achievements are all attributed to
//            its profile, verbatim (same frozen event instances) and in
//            chronological order
// Section C: achievements belonging to a DIFFERENT publication identity are
//            excluded — a profile is scoped to exactly one identity
// Section D: publicationIdentity on the result is the exact instance the
//            caller supplied, never reconstructed from an event's own copy
// Section E: malformed/absent inputs never throw
// Section F: FLAGSHIP — two publications sharing one contentHash across two
//            chains, each with its own distinct achievements; profiling
//            each identity returns only that identity's own achievements,
//            never the other's, despite the shared contentHash
// Section G: reconstructAchievementProfile() composes the archive's own
//            existing reconstructAchievementEvents() — reload equivalence,
//            zero network access, no parallel achievement engine
// Section H: no verdict/score/points/rank vocabulary anywhere, and the
//            achievements array is frozen, never mutated

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
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — an achievement profile describes an attributable fact, not a person's worth`);
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

function identity({ blockchain, contentHash, chainReference, createdAt }) {
    return new BlockchainPublicationIdentity({ blockchain, contentHash, chainReference, createdAt });
}

function referenceRecord({ source, referenced, createdAt }) {
    return new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });
}

function kindsOf(profile) {
    return profile.achievements.map((e) => e.achievementKind);
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — an identity with zero matching achievements.
    // ---------------------------------------------------------------
    {
        const alice = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'a-alice', chainReference: 'a-alice-txid', createdAt: new Date('2026-01-01T00:00:00Z') });
        const profile = describeAchievementProfile(alice, []);
        assert(profile.achievementCount === 0, '1. no achievement events at all produces a zero-count profile');
        assert(profile.achievements.length === 0, '2. achievements is an empty array, never null or undefined');
        assert(profile.publicationIdentity === alice, '3. publicationIdentity is echoed back, even with zero achievements');
        assert(Object.isFrozen(profile) && Object.isFrozen(profile.achievements), '4. the profile and its achievements array are frozen');

        // An identity genuinely present in the achievement events, but for
        // a DIFFERENT publication, still yields zero for this one.
        const btc = bitcoinRecord({ anchorId: 'a-anchor', contentHash: 'a-content', txid: 'a'.repeat(64), createdAt: new Date('2026-01-02T00:00:00Z') });
        const events = describeAchievementEvents([btc], []);
        const unrelatedProfile = describeAchievementProfile(alice, events.events);
        assert(unrelatedProfile.achievementCount === 0, '5. an identity that earned nothing produces an empty profile even when other achievements exist');
    }
    console.log('✓ Section A: an identity with zero matching achievements produces a valid, empty profile');

    // ---------------------------------------------------------------
    // Section B — a single publication's own achievements, verbatim and
    // chronologically ordered.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'b-anchor', contentHash: 'b-content', txid: 'b'.repeat(64), createdAt: new Date('2026-02-01T00:00:00Z') });
        const events = describeAchievementEvents([btc], []);
        const btcIdentity = btc.toBlockchainPublicationIdentity();

        const profile = describeAchievementProfile(btcIdentity, events.events);
        assert(profile.achievementCount === 2, '6. the profile carries exactly the two achievements this one publication earned');
        assert(kindsOf(profile).includes(AchievementKind.FIRST_PUBLICATION), '7. FIRST_PUBLICATION is included');
        assert(kindsOf(profile).includes(AchievementKind.BITCOIN_PUBLISHER), '8. BITCOIN_PUBLISHER is included');
        for (let i = 0; i < profile.achievements.length; i++) {
            assert(profile.achievements[i] === events.events.find((e) => e.achievementKind === profile.achievements[i].achievementKind), '9. every surviving achievement is the EXACT frozen event instance, never a copy');
        }
        // Chronological order: observedAt is non-decreasing across the
        // profile's own achievements.
        for (let i = 1; i < profile.achievements.length; i++) {
            assert(profile.achievements[i].observedAt.getTime() >= profile.achievements[i - 1].observedAt.getTime(), '10. achievements remain in chronological order');
        }
    }
    console.log('✓ Section B: a single publication\'s own achievements are attributed verbatim, in chronological order');

    // ---------------------------------------------------------------
    // Section C — achievements belonging to a different identity are
    // excluded.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'c-anchor', contentHash: 'c-btc-content', txid: 'c'.repeat(64), createdAt: new Date('2026-03-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'c-base-content', txid: 'd'.repeat(64), createdAt: new Date('2026-03-02T00:00:00Z') });
        const events = describeAchievementEvents([btc], [base]);

        const btcProfile = describeAchievementProfile(btc.toBlockchainPublicationIdentity(), events.events);
        const baseProfile = describeAchievementProfile(base.toBlockchainPublicationIdentity(), events.events);

        assert(!kindsOf(btcProfile).includes(AchievementKind.BASE_PUBLISHER), '11. the Bitcoin publication\'s own profile never includes an achievement attributed to the Base publication');
        assert(!kindsOf(baseProfile).includes(AchievementKind.BITCOIN_PUBLISHER), '12. the Base publication\'s own profile never includes an achievement attributed to the Bitcoin publication');

        // MULTI_CHAIN_PUBLISHER is attributed to whichever record
        // chronologically completed the pair (base, here) — it must appear
        // in exactly one of the two profiles, never both, never neither.
        const btcHasMultiChain = kindsOf(btcProfile).includes(AchievementKind.MULTI_CHAIN_PUBLISHER);
        const baseHasMultiChain = kindsOf(baseProfile).includes(AchievementKind.MULTI_CHAIN_PUBLISHER);
        assert(btcHasMultiChain !== baseHasMultiChain, '13. MULTI_CHAIN_PUBLISHER is attributed to exactly one of the two profiles, never both, never neither');
        assert(baseHasMultiChain, '14. it is attributed to base, the record that chronologically completed the pair');
    }
    console.log('✓ Section C: a profile excludes achievements belonging to a different publication identity');

    // ---------------------------------------------------------------
    // Section D — publicationIdentity is the exact instance supplied.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'd-anchor', contentHash: 'd-content', txid: 'd'.repeat(64), createdAt: new Date('2026-04-01T00:00:00Z') });
        const events = describeAchievementEvents([btc], []);
        // A freshly minted identity, from a SEPARATE call to
        // toBlockchainPublicationIdentity() than the one
        // describeAchievementEvents() itself made internally — a genuinely
        // different object, equal only by sameAs().
        const freshlyMintedIdentity = btc.toBlockchainPublicationIdentity();

        const profile = describeAchievementProfile(freshlyMintedIdentity, events.events);
        assert(profile.publicationIdentity === freshlyMintedIdentity, '15. publicationIdentity is the exact object reference passed in, never reconstructed from an achievement event\'s own copy');
        assert(profile.achievements[0].sourcePublicationIdentity !== freshlyMintedIdentity, '16. the achievement event\'s own sourcePublicationIdentity remains its own, separately constructed instance (sameAs(), never object identity, is the equality this codebase recognizes)');
        assert(profile.achievements[0].sourcePublicationIdentity.sameAs(freshlyMintedIdentity), '17. despite being a different instance, it is still the same publication by sameAs()');
    }
    console.log('✓ Section D: publicationIdentity on the result is the exact instance the caller supplied');

    // ---------------------------------------------------------------
    // Section E — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        const alice = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'e-alice', chainReference: 'e-alice-txid', createdAt: new Date('2026-05-01T00:00:00Z') });

        assert(describeAchievementProfile(alice).achievementCount === 0, '18. an omitted achievementEvents argument never throws, produces zero achievements');
        assert(describeAchievementProfile(alice, null).achievementCount === 0, '19. a null achievementEvents argument never throws');
        assert(describeAchievementProfile(alice, 'not-an-array').achievementCount === 0, '20. a non-array achievementEvents argument never throws');
        assert(describeAchievementProfile(alice, [{ fake: true }, null, 'x']).achievementCount === 0, '21. an achievementEvents array holding non-event garbage silently excludes the garbage rather than throwing');
        assert(describeAchievementProfile(null, []).achievementCount === 0, '22. a null publicationIdentity never throws, matches nothing');
        assert(describeAchievementProfile(undefined, []).achievementCount === 0, '23. an undefined publicationIdentity never throws, matches nothing');
        assert(describeAchievementProfile({ fake: true }, []).achievementCount === 0, '24. a plain object masquerading as an identity never throws, matches nothing');
        assert(describeAchievementProfile('not-an-identity', []).achievementCount === 0, '25. a bare string never throws, matches nothing');

        assert(reconstructAchievementProfile(null, alice).achievementCount === 0, '26. a null archive reconstructs to an empty profile, never throws');
        assert(reconstructAchievementProfile({}, alice).achievementCount === 0, '27. a plain object masquerading as an archive reconstructs to an empty profile');
        assert(reconstructAchievementProfile(PublicationObservationArchive.empty(), null).achievementCount === 0, '28. reconstructAchievementProfile() with no identity at all never throws');
    }
    console.log('✓ Section E: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: two publications sharing one contentHash
    // across two chains, each with its own distinct achievements.
    // ---------------------------------------------------------------
    {
        const SHARED_CONTENT_HASH = 'f-shared-content-hash';
        const SHARED_CHAIN_REFERENCE = 'f'.repeat(64);

        const btc = bitcoinRecord({ anchorId: 'f-btc-anchor', contentHash: SHARED_CONTENT_HASH, txid: SHARED_CHAIN_REFERENCE, createdAt: new Date('2026-06-01T00:00:00Z') });
        const base = baseRecord({ contentHash: SHARED_CONTENT_HASH, txid: SHARED_CHAIN_REFERENCE, createdAt: new Date('2026-06-02T00:00:00Z') });
        const btcIdentity = btc.toBlockchainPublicationIdentity();
        const baseIdentity = base.toBlockchainPublicationIdentity();

        // Give each its own, genuinely distinct reference-derived
        // achievement too, on top of the publication-derived ones both
        // already earn (FIRST_PUBLICATION/BITCOIN_PUBLISHER/BASE_PUBLISHER/
        // MULTI_CHAIN_PUBLISHER).
        const someoneElse = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'f-other', chainReference: 'f-other-txid', createdAt: new Date('2026-06-01T00:00:00Z') });
        const btcReferencesSomeoneElse = referenceRecord({ source: btcIdentity, referenced: someoneElse, createdAt: new Date('2026-06-03T00:00:00Z') });
        const someoneElseReferencesBase = referenceRecord({ source: someoneElse, referenced: baseIdentity, createdAt: new Date('2026-06-04T00:00:00Z') });

        const events = describeAchievementEvents([btc], [base], [btcReferencesSomeoneElse, someoneElseReferencesBase]);

        const btcProfile = describeAchievementProfile(btcIdentity, events.events);
        const baseProfile = describeAchievementProfile(baseIdentity, events.events);

        assert(kindsOf(btcProfile).includes(AchievementKind.BITCOIN_PUBLISHER), '29. the Bitcoin identity\'s own profile includes BITCOIN_PUBLISHER');
        assert(!kindsOf(btcProfile).includes(AchievementKind.BASE_PUBLISHER), '30. the Bitcoin identity\'s own profile never includes BASE_PUBLISHER, despite an identical contentHash AND an identical raw chainReference string on both chains');
        assert(kindsOf(btcProfile).includes(AchievementKind.FIRST_REFERENCE_CREATED), '31. the Bitcoin identity\'s own profile includes its own FIRST_REFERENCE_CREATED');
        assert(!kindsOf(btcProfile).includes(AchievementKind.FIRST_REFERENCE_RECEIVED), '32. the Bitcoin identity\'s own profile never includes the Base identity\'s own FIRST_REFERENCE_RECEIVED');

        assert(kindsOf(baseProfile).includes(AchievementKind.BASE_PUBLISHER), '33. the Base identity\'s own profile includes BASE_PUBLISHER');
        assert(!kindsOf(baseProfile).includes(AchievementKind.BITCOIN_PUBLISHER), '34. the Base identity\'s own profile never includes BITCOIN_PUBLISHER');
        assert(kindsOf(baseProfile).includes(AchievementKind.FIRST_REFERENCE_RECEIVED), '35. the Base identity\'s own profile includes its own FIRST_REFERENCE_RECEIVED');
        assert(!kindsOf(baseProfile).includes(AchievementKind.FIRST_REFERENCE_CREATED), '36. the Base identity\'s own profile never includes the Bitcoin identity\'s own FIRST_REFERENCE_CREATED');

        // Every achievement in each profile genuinely names that exact
        // identity, by sameAs() — never merely "some achievement or other."
        for (const achievement of btcProfile.achievements) {
            assert(achievement.sourcePublicationIdentity.sameAs(btcIdentity), '37. every achievement in the Bitcoin profile is attributed to the Bitcoin identity by sameAs()');
        }
        for (const achievement of baseProfile.achievements) {
            assert(achievement.sourcePublicationIdentity.sameAs(baseIdentity), '38. every achievement in the Base profile is attributed to the Base identity by sameAs()');
        }

        // Determinism: repeated calls on byte-identical input are
        // byte-identical.
        const btcProfile2 = describeAchievementProfile(btcIdentity, events.events);
        assert(JSON.stringify(btcProfile.achievements.map(serializeAchievement)) === JSON.stringify(btcProfile2.achievements.map(serializeAchievement)), '39. repeated calls on identical input produce byte-identical output');

        assertNeverScored(btcProfile, 'flagshipBtcProfile');
        assertNeverScored(baseProfile, 'flagshipBaseProfile');
    }
    console.log('✓ Section F: FLAGSHIP — a shared contentHash across two chains never conflates two publications\' own achievement profiles');

    // ---------------------------------------------------------------
    // Section G — reconstructAchievementProfile() over a real, persisted
    // archive, composing the archive's own existing achievement
    // reconstruction.
    // ---------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(provider);

        const btc = bitcoinRecord({ anchorId: 'g-anchor', contentHash: 'g-btc-content', txid: 'g'.repeat(64), createdAt: new Date('2026-07-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'g-base-content', txid: 'h'.repeat(64), createdAt: new Date('2026-07-02T00:00:00Z') });

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinAnchorPublicationRecord(btc);
        archive = archive.appendBaseAnchorPublicationRecord(base);

        const reference = new PublicationReferenceRecord({
            sourcePublicationIdentity: btc.toBlockchainPublicationIdentity(),
            referencedPublicationIdentity: base.toBlockchainPublicationIdentity(),
            createdAt: new Date('2026-07-03T00:00:00Z')
        });
        archive = archive.appendPublicationReferenceRecord(reference);

        const btcIdentity = btc.toBlockchainPublicationIdentity();
        const { result: liveProfile, networkCallOccurred } = await withoutNetworkAccess(() => reconstructAchievementProfile(archive, btcIdentity));
        assert(networkCallOccurred === false, '40. reconstructAchievementProfile() performs zero network access');
        assert(kindsOf(liveProfile).includes(AchievementKind.FIRST_PUBLICATION), '41. the live profile includes the Bitcoin publication\'s own publication-derived achievements');
        assert(kindsOf(liveProfile).includes(AchievementKind.FIRST_CROSS_CHAIN_REFERENCE), '42. the live profile includes the Bitcoin publication\'s own reference-derived achievements — composed from the archive\'s existing reconstruction, never a second achievement engine');
        assert(!kindsOf(liveProfile).includes(AchievementKind.FIRST_REFERENCE_RECEIVED), "43. the live profile never includes an achievement attributed to the OTHER side of the reference (base)");

        persistence.save(archive);
        const restored = persistence.load();
        const reconstructedProfile = reconstructAchievementProfile(restored, btcIdentity);
        assert(JSON.stringify(reconstructedProfile.achievements.map(serializeAchievement)) === JSON.stringify(liveProfile.achievements.map(serializeAchievement)), '44. reload equivalence: a restored archive projects a byte-identical profile to the live one it was saved from');

        // A second save/reload cycle stays equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        const rereadProfile = reconstructAchievementProfile(reloadedAgain, btcIdentity);
        assert(JSON.stringify(rereadProfile.achievements.map(serializeAchievement)) === JSON.stringify(liveProfile.achievements.map(serializeAchievement)), '45. a second save/load cycle remains equivalent');

        assertNeverScored(liveProfile, 'liveProfile');
    }
    console.log('✓ Section G: reconstructAchievementProfile() composes the archive\'s own existing achievement reconstruction, with reload equivalence and zero network access');

    // ---------------------------------------------------------------
    // Section H — no verdict/score/points/rank vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'h-anchor', contentHash: 'h-content', txid: 'i'.repeat(64), createdAt: new Date('2026-08-01T00:00:00Z') });
        const events = describeAchievementEvents([btc], []);
        const profile = describeAchievementProfile(btc.toBlockchainPublicationIdentity(), events.events);
        assertNeverScored(profile, 'noVerdictProfile');
        assert(Object.isFrozen(profile.achievements), '46. the achievements array is frozen');
        for (const achievement of profile.achievements) {
            assert(Object.isFrozen(achievement), '47. every achievement in the profile remains frozen — the exact same frozen object describeAchievementEvents() produced');
        }
        // Mutating the input array after the fact never changes an
        // already-returned profile — the profile is a snapshot, never a
        // live view over a mutable array.
        const mutableEvents = [...events.events];
        const snapshot = describeAchievementProfile(btc.toBlockchainPublicationIdentity(), mutableEvents);
        mutableEvents.length = 0;
        assert(snapshot.achievementCount === 2, '48. clearing the caller\'s own array after the call never changes the already-returned profile');
    }
    console.log('✓ Section H: no verdict/score/points/rank vocabulary anywhere, and every achievement stays frozen');

    console.log('\nAll AchievementProfileView tests passed.');
}

run().catch((error) => {
    console.error('AchievementProfileView.test.js FAILED:', error);
    process.exitCode = 1;
});
