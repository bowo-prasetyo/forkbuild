import { readFile } from 'node:fs/promises';
import { World } from '../core/World.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { Position } from '../core/Position.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION } from '../application/PlaceNamingClaimPublication.js';
import { buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';

// 0.9.269 — Nearby Place Naming Claim Adoption Status Indicator.
//
// The 0.9.265/0.9.268 reassessments both converged on the same one
// remaining, evidence-backed friction: a Wanderer looking at a Nearby
// Place Names row has no way to tell "I already have this" from
// "genuinely new" before clicking Adopt — the only way to find out was
// to click it and read the resulting feedback message. Both
// reassessments also identified the exact fix already sitting one layer
// down: `LocalPlaceNamingClaimStore#has(worldId, claimId)` already
// answers the right boolean, correctly, today — the only missing piece
// was a thin session-level door to reach it from presentation. This
// milestone builds exactly that door and nothing else:
//
//   nearby claim (worldId, claimId) -> session.hasPlaceNamingClaim()
//        -> PlaceNamingClaimUseCase#hasClaim()
//        -> the EXISTING, UNMODIFIED LocalPlaceNamingClaimStore#has()
//        -> `alreadySaved` on the Nearby row -> "Already saved" / [Adopt]
//
// Deliberately labeled "Already saved," never "Already adopted": the
// store this reads also holds claims THIS identity itself published —
// has() only ever means "on file," not "reached here via Adopt" — see
// Section A below, the first test this milestone's own brief asked for.
//
//   Section A — semantic check: has()/hasPlaceNamingClaim() means "on
//               file," not "adopted" — a self-published claim also
//               reports true, so the UI term must not overstate it
//   Section B — unknown claim -> Adopt available (alreadySaved is false)
//   Section C — persisted claim -> Already Saved (alreadySaved is true)
//   Section D — exact claim-id matching
//   Section E — same text/different claim ids remain independent
//   Section F — different authors remain independent
//   Section G — different World/region identities remain independent
//   Section H — successful adoption changes status only after persistence
//   Section I — failed adoption leaves status unchanged
//   Section J — duplicate/idempotent adoption
//   Section K — discovery refresh recomputes status atomically
//   Section L — World switching isolation
//   Section M — navigation independence
//   Section N — no ranking/preference, no WorldRegion mutation
//   Section O — manual PlaceNamingPanel import remains unchanged
//   Section P — real persistence path is exercised, not mocked
//   Section Q — FLAGSHIP: Nostr -> discovery -> proximity -> status
//               presentation -> adoption, end to end
//   Section R — source-level regression: no second source of truth

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

function region({ id, worldId, authorIdentityId, name = 'Unnamed Region', kind = RegionKind.VILLAGE, x, z, radius = 10 }) {
    return new WorldRegion({ id, worldId, authorIdentityId, name, kind, position: new Position(x, 0, z), radius });
}

// A full, real WorldNavigationSession — mirrors
// tests/PlaceNamingNearbyAdoption.test.js#makeReplica() exactly, so
// session.getRegions()/hasPlaceNamingClaim()/importPlaceNamingClaim()
// are all the real, unmodified implementations, never stubs.
function makeReplica(identityProvider, documents = []) {
    const storage = new InMemoryStorageProvider();
    const claimStore = new LocalPlaceNamingClaimStore(storage);
    const publicationLog = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const placeNamingClaimUseCase = new PlaceNamingClaimUseCase(claimStore, identityProvider, verifier);
    const placeNamingClaimExchange = new PlaceNamingClaimExchange(claimStore, verifier, publicationLog);
    const localNamePreferenceStore = new LocalNamePreferenceStore(storage, identityProvider);
    const discoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
    const worldLayoutProvider = new LocalWorldLayoutProvider(null, discoveryProvider);
    const session = new WorldNavigationSession({
        registry: null,
        placeNamingClaimUseCase,
        localNamePreferenceStore,
        placeNamingClaimExchange,
        worldLayoutProvider,
        discoveryProvider
    });
    for (const document of documents) {
        session._loadedDocuments.set(document.world.id, document);
    }
    return { session, claimStore, verifier, placeNamingClaimUseCase, placeNamingClaimExchange, localNamePreferenceStore };
}

function signedClaim(identity, { worldId, regionId, name }) {
    let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId: identity.identityId });
    claim = claim.withSignature(identity.signCanonical(claim.getSigningDescriptor()));
    return claim;
}

function discoverAsEnvelope(claim) {
    const built = buildPlaceNamingDiscoveryEnvelope(claim);
    return parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
}

// Reproduces EXACTLY ui/views/WorldView.js's own (0.9.269-widened)
// `nearbyPlaceNamingClaimRows` computed — a pure mapping over the
// discovered entries plus one read of session.hasPlaceNamingClaim() per
// row, never a second, UI-maintained "known ids" set.
function deriveRows(entries, session, resolveDisplayName = (id) => id) {
    return entries.map((entry) => ({
        claimId: entry.claim.id,
        name: entry.claim.name,
        authorDisplayName: resolveDisplayName(entry.claim.authorIdentityId),
        position: entry.position,
        regionId: entry.claim.regionId,
        worldId: entry.claim.worldId,
        authorIdentityId: entry.claim.authorIdentityId,
        createdAt: entry.claim.createdAt,
        signature: entry.claim.signature,
        alreadySaved: session.hasPlaceNamingClaim(entry.claim.worldId, entry.claim.id)
    }));
}

function makeFeedback() {
    const messages = [];
    return { messages, show: (message) => messages.push(message) };
}

function guardedCall(fn, feedback) {
    try {
        return fn();
    } catch (err) {
        feedback.show(err.message);
        return undefined;
    }
}

function tamperSignatureHex(hex) {
    return hex.split('').reverse().join('');
}

// Reproduces EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim()
// as widened at 0.9.269 — same reshaping, same call order, same
// duplicate-vs-new feedback split, and the same "reassign, never mutate
// in place" refresh trigger.
function adoptNearbyPlaceNamingClaim(session, row, feedback) {
    const pkg = {
        kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        claim: {
            id: row.claimId,
            worldId: row.worldId,
            regionId: row.regionId,
            name: row.name,
            authorIdentityId: row.authorIdentityId,
            createdAt: row.createdAt,
            signature: row.signature
        }
    };
    const result = guardedCall(() => session.importPlaceNamingClaim(pkg), feedback);
    if (!result) return null;
    const { claim, isNew } = result;
    if (!isNew) {
        feedback.show(`"${claim.name}" was already known — nothing changed`);
        return result;
    }
    feedback.show(`Adopted "${claim.name}"`);
    return result;
}

function navigateToNearbyPlaceNamingClaim(session, row, feedback, refreshSpatialUI = () => {}) {
    const regionStillExists = session.getRegions()
        .some((candidate) => candidate.id === row.regionId && candidate.worldId === row.worldId);
    if (!regionStillExists) {
        feedback.show('That place no longer exists in this World');
        return false;
    }
    session.focusLocation(row.regionId);
    refreshSpatialUI();
    return true;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function extractBetween(code, startMarker, endMarker) {
    const startIdx = code.indexOf(startMarker);
    if (startIdx === -1) {
        throw new Error(`extractBetween: start marker not found: ${startMarker}`);
    }
    const endIdx = code.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) {
        throw new Error(`extractBetween: end marker not found: ${endMarker}`);
    }
    return code.slice(startIdx, endIdx + endMarker.length);
}

async function runTests() {
    console.log('Running Nearby Place Naming Claim Adoption Status Indicator tests...\n');

    // -------------------------------------------------------------
    // Section A — semantic check: has()/hasPlaceNamingClaim() means
    // "on file," not "adopted."
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { session, placeNamingClaimUseCase } = makeReplica(alice);

        // Alice PUBLISHES her own claim (never adopts anything) — the
        // ordinary manual PlaceNamingPanel path, completely unrelated to
        // Nearby/Adopt.
        const published = placeNamingClaimUseCase.publish('world-1', 'region-1', 'Sunspire');

        assert(session.hasPlaceNamingClaim('world-1', published.id) === true,
            '1. hasPlaceNamingClaim() reports true for a claim this identity itself PUBLISHED, never adopted via the Nearby Adopt button.');

        console.log('✓ Section A: hasPlaceNamingClaim() genuinely means "on file" — it reports true for a self-published claim exactly as readily as an adopted one, confirming "Already saved" (never "Already adopted") is the semantically honest label for this milestone\'s own indicator');
    }

    // -------------------------------------------------------------
    // Section B — unknown claim -> Adopt available.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Old Oak Crossing' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 5, z: 5 } }];

        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob);
        const rows = deriveRows(entries, session);

        assert(rows[0].alreadySaved === false, '2. a genuinely unknown claim reports alreadySaved === false, so Adopt renders.');

        console.log('✓ Section B: an unknown claim\'s row reports alreadySaved === false, so the Adopt button is what actually renders');
    }

    // -------------------------------------------------------------
    // Section C — persisted claim -> Already Saved.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 5, z: 5 } }];

        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob);
        claimStore.save(claim);

        const rows = deriveRows(entries, session);
        assert(rows[0].alreadySaved === true, '3. a claim already on file reports alreadySaved === true, so "Already saved" renders instead of Adopt.');

        console.log('✓ Section C: a claim already persisted in this replica\'s own store reports alreadySaved === true');
    }

    // -------------------------------------------------------------
    // Section D — exact claim-id matching.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claimOne = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        const claimTwo = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        assert(claimOne.id !== claimTwo.id, 'sanity: two independently-created claims never share an id.');

        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob);
        claimStore.save(claimOne);

        const entries = [
            { claim: discoverAsEnvelope(claimOne).claim, position: { x: 1, z: 1 } },
            { claim: discoverAsEnvelope(claimTwo).claim, position: { x: 1, z: 1 } }
        ];
        const rows = deriveRows(entries, session);

        assert(rows[0].alreadySaved === true, '4. the exact stored claim (claimOne) reports alreadySaved === true.');
        assert(rows[1].alreadySaved === false, '5. an otherwise-identical claim under a DIFFERENT id (claimTwo, same author/region/name) reports alreadySaved === false — matching is by claim id alone, never by content.');

        console.log('✓ Section D: status is classified strictly by the claim\'s own id — two content-identical claims with different ids are never conflated');
    }

    // -------------------------------------------------------------
    // Section E — same text/different claim ids remain independent
    // (Riverside by Alice, Riverside by Bob).
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceClaim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        const bobClaim = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });

        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol);
        claimStore.save(aliceClaim);

        const entries = [
            { claim: discoverAsEnvelope(aliceClaim).claim, position: { x: 1, z: 1 } },
            { claim: discoverAsEnvelope(bobClaim).claim, position: { x: 1, z: 1 } }
        ];
        const rows = deriveRows(entries, session);

        assert(rows[0].alreadySaved === true && rows[0].authorIdentityId === alice.identityId,
            '6. "Riverside" by Alice — already saved — reports alreadySaved === true.');
        assert(rows[1].alreadySaved === false && rows[1].authorIdentityId === bob.identityId,
            '7. "Riverside" by Bob — never saved — reports alreadySaved === false, completely independent of Alice\'s identically-named claim.');

        console.log('✓ Section E: two claims naming the exact same place are classified completely independently — one author\'s claim being saved never marks another\'s as saved');
    }

    // -------------------------------------------------------------
    // Section F — different authors remain independent (reconfirms
    // Section E from the authorship angle with a shared-name control).
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const aliceClaim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Same Name' });
        const bobClaim = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Same Name' });

        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol);
        claimStore.save(bobClaim);

        const entries = [
            { claim: discoverAsEnvelope(aliceClaim).claim, position: { x: 1, z: 1 } },
            { claim: discoverAsEnvelope(bobClaim).claim, position: { x: 1, z: 1 } }
        ];
        const rows = deriveRows(entries, session);

        assert(rows[0].alreadySaved === false, '8. Alice\'s claim (never saved) reports alreadySaved === false even though Bob\'s identically-named claim is saved.');
        assert(rows[1].alreadySaved === true, '9. Bob\'s claim (saved) reports alreadySaved === true.');

        console.log('✓ Section F: authorship, not the claimed name, is what distinguishes two rows — saving one author\'s claim never marks a different author\'s identically-named claim as saved');
    }

    // -------------------------------------------------------------
    // Section G — different World/region identities remain
    // independent, even under a deliberately colliding claim id.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const { claimStore: claimStoreA } = makeReplica(alice);
        const { session: sessionForA, claimStore } = makeReplica(alice);

        const claimWorldA = signedClaim(alice, { worldId: 'world-a', regionId: 'region-x', name: 'Riverside' });
        // A second, structurally distinct claim that is deliberately
        // FORCED to reuse the exact same id string as claimWorldA — the
        // same "colliding identifier across two Worlds" stress this
        // milestone's own brief named by name (Riverside-Alice-World A/
        // Region X vs Riverside-Alice-World B/Region Y "must not
        // collide"). Proves the isolation is a genuine property of
        // LocalPlaceNamingClaimStore's own per-worldId storage key, not
        // merely an accident of claim ids never colliding in practice.
        const claimWorldB = PlaceNamingClaim.fromJSON({
            ...claimWorldA.toJSON(),
            worldId: 'world-b',
            regionId: 'region-y'
        });

        claimStore.save(claimWorldA);

        assert(sessionForA.hasPlaceNamingClaim('world-a', claimWorldA.id) === true,
            '10. the claim is reported as saved under its own World ("world-a").');
        assert(sessionForA.hasPlaceNamingClaim('world-b', claimWorldB.id) === false,
            '11. THE NEGATIVE CHECK: the SAME id string under a DIFFERENT worldId ("world-b") is reported as NOT saved — World identity is part of the key, never inferred from the id alone.');
        void claimStoreA;

        console.log('✓ Section G: adoption status is scoped per World, not merely per claim id — a colliding id under a different World/region never inherits another World\'s saved status');
    }

    // -------------------------------------------------------------
    // Section H — successful adoption changes status only after
    // persistence.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Fern Hollow' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }];

        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob);

        const rowsBefore = deriveRows(entries, session);
        assert(rowsBefore[0].alreadySaved === false, '12. before adoption, alreadySaved is false.');

        const result = adoptNearbyPlaceNamingClaim(session, rowsBefore[0], makeFeedback());
        assert(result && result.isNew === true, 'sanity: adoption succeeded and was genuinely new.');

        const rowsAfter = deriveRows(entries, session);
        assert(rowsAfter[0].alreadySaved === true, '13. after a successful adoption, re-deriving the row reports alreadySaved === true — the status genuinely followed persistence, not a locally-flipped boolean.');

        console.log('✓ Section H: adoption status flips to "already saved" only once importPlaceNamingClaim() has genuinely persisted the claim');
    }

    // -------------------------------------------------------------
    // Section I — failed adoption leaves status unchanged.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Forged Name' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }];

        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob);

        const rows = deriveRows(entries, session);
        // Tamper the row's own signature — importClaim()'s own real
        // verification step must refuse it.
        const tamperedRow = { ...rows[0], signature: { ...rows[0].signature, signature: tamperSignatureHex(rows[0].signature.signature) } };

        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, tamperedRow, feedback);
        assert(result === null, '14. sanity: the forged claim is refused.');

        const rowsAfter = deriveRows(entries, session);
        assert(rowsAfter[0].alreadySaved === false, '15. after a FAILED adoption attempt, alreadySaved remains false — a rejected import never flips the indicator, exactly per this milestone\'s own brief ("persistence fails -> still [Adopt]").');
        assert(claimStore.listForRegion('world-1', 'region-1').length === 0, '16. nothing was actually persisted either.');

        console.log('✓ Section I: a failed adoption attempt (refused by real signature verification) leaves the status indicator exactly as it was — still [Adopt], never "Already saved"');
    }

    // -------------------------------------------------------------
    // Section J — duplicate/idempotent adoption.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Echo Point' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }];

        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob);

        const firstRows = deriveRows(entries, session);
        const firstResult = adoptNearbyPlaceNamingClaim(session, firstRows[0], makeFeedback());
        assert(firstResult.isNew === true, '17. the first Adopt click genuinely stores the claim.');

        // Re-derive and click Adopt again on the exact same (now
        // already-saved) row — mirrors a Wanderer who clicks Adopt a
        // second time, or a discovery re-tick surfacing the same claim
        // again.
        const secondRows = deriveRows(entries, session);
        assert(secondRows[0].alreadySaved === true, '18. before the second click, the row already reports alreadySaved === true.');
        const feedback = makeFeedback();
        const secondResult = adoptNearbyPlaceNamingClaim(session, secondRows[0], feedback);
        assert(secondResult && secondResult.isNew === false, '19. re-adopting an already-saved claim is a genuine no-op (isNew === false), never an error.');
        assert(/already known/i.test(feedback.messages[0]), '20. the duplicate click surfaces the existing "already known" feedback, unchanged.');
        assert(claimStore.listForRegion('world-1', 'region-1').length === 1, '21. exactly one copy is stored — re-adopting never duplicates the entry.');

        const thirdRows = deriveRows(entries, session);
        assert(thirdRows[0].alreadySaved === true, '22. the row still reports alreadySaved === true after the idempotent re-adoption.');

        console.log('✓ Section J: re-adopting an already-saved claim is a genuine, harmless no-op — the status indicator stays "already saved" throughout, and storage never duplicates the entry');
    }

    // -------------------------------------------------------------
    // Section K — discovery refresh recomputes status atomically.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claimA = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Alpha' });
        const claimB = signedClaim(alice, { worldId: 'world-1', regionId: 'region-2', name: 'Beta' });

        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob);

        let discoveredEntries = [
            { claim: discoverAsEnvelope(claimA).claim, position: { x: 1, z: 1 } }
        ];
        let rows = deriveRows(discoveredEntries, session);
        assert(rows.length === 1 && rows[0].alreadySaved === false, '23. sanity: only "Alpha" is discovered initially, unsaved.');

        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        // Simulate the NEXT discovery tick surfacing a second claim
        // ALONGSIDE the first — mirrors placeNamingDiscoveryMonitor's own
        // lastResult being replaced wholesale, never incrementally
        // patched (see nearbyPlaceNamingClaims.value's own assignment in
        // ui/views/WorldView.js).
        discoveredEntries = [
            { claim: discoverAsEnvelope(claimA).claim, position: { x: 1, z: 1 } },
            { claim: discoverAsEnvelope(claimB).claim, position: { x: 2, z: 2 } }
        ];
        rows = deriveRows(discoveredEntries, session);

        assert(rows.length === 2, '24. the refreshed row list reflects the new discovery result in full.');
        assert(rows[0].alreadySaved === true, '25. "Alpha" (adopted before this refresh) is correctly recomputed as alreadySaved === true on the new pass — not stale, not dropped.');
        assert(rows[1].alreadySaved === false, '26. "Beta" (newly discovered this tick, never adopted) is correctly recomputed as alreadySaved === false.');

        console.log('✓ Section K: a discovery refresh recomputes alreadySaved fresh for the WHOLE row list every time — a claim adopted before the refresh keeps its correct status, and a genuinely new claim gets its own, independently correct status');
    }

    // -------------------------------------------------------------
    // Section L — World switching isolation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const staleClaim = signedClaim(alice, { worldId: 'world-old', regionId: 'region-1', name: 'Old World Claim' });
        const staleEntry = [{ claim: discoverAsEnvelope(staleClaim).claim, position: { x: 1, z: 1 } }];

        const worldNew = new World({ id: 'world-new' });
        worldNew.addWorldRegion(region({ id: 'region-1', worldId: 'world-new', authorIdentityId: bob.identityId, name: 'New World Region', x: 999, z: 999 }));
        const { session, claimStore } = makeReplica(bob, [{ world: worldNew }]);

        const rowsBefore = deriveRows(staleEntry, session);
        assert(rowsBefore[0].alreadySaved === false, '27. sanity: the stale claim (for an unloaded World) is not yet saved.');

        const result = adoptNearbyPlaceNamingClaim(session, rowsBefore[0], makeFeedback());
        assert(result && result.isNew === true && result.claim.worldId === 'world-old',
            '28. the stale claim adopts under its OWN worldId ("world-old"), never reassigned to the currently-active "world-new."');

        const rowsAfter = deriveRows(staleEntry, session);
        assert(rowsAfter[0].alreadySaved === true, '29. the stale claim\'s own row now reports alreadySaved === true, scoped to "world-old."');

        // THE NEGATIVE CHECK this section is named for: switching to
        // (or already being on) a DIFFERENT, currently-active World must
        // never make a same-regionId claim IN THAT World appear saved.
        assert(claimStore.listForRegion('world-new', 'region-1').length === 0,
            '30. "world-new"\'s own claim list remains completely empty — adopting a stale claim from another World never leaks into the currently-active World\'s own naming/status.');
        assert(session.hasPlaceNamingClaim('world-new', staleClaim.id) === false,
            '31. THE NEGATIVE CHECK: even reusing the stale claim\'s exact id against "world-new" reports false — World switching can never inherit another World\'s saved status.');

        console.log('✓ Section L: adopting a claim from a World that is not currently active leaves the currently-active World\'s own status completely untouched — no cross-World leakage in either direction');
    }

    // -------------------------------------------------------------
    // Section M — navigation independence.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Thistledown' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }];

        const bob = makeIdentity('Bob');
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-1', authorIdentityId: bob.identityId, name: 'Willow Village', x: 10, z: 20 }));
        const { session } = makeReplica(bob, [{ world }]);

        const rows = deriveRows(entries, session);
        navigateToNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        const rowsAfterNavigate = deriveRows(entries, session);
        assert(rowsAfterNavigate[0].alreadySaved === false, '32. Navigate never affects alreadySaved — it never imports/stores anything.');

        console.log('✓ Section M: navigating to a nearby claim\'s region never changes its adoption status — Navigate and the status indicator remain fully independent');
    }

    // -------------------------------------------------------------
    // Section N — no ranking/preference, no WorldRegion mutation.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Kestrel Point' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }];

        const bob = makeIdentity('Bob');
        const worldRegion = region({ id: 'region-1', worldId: 'world-1', authorIdentityId: bob.identityId, name: 'Willow Village', x: 0, z: 0 });
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(worldRegion);
        const { session, localNamePreferenceStore } = makeReplica(bob, [{ world }]);

        const rows = deriveRows(entries, session);
        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        assert(localNamePreferenceStore.getPreferredName('world-1', 'region-1') === null,
            '33. computing/displaying adoption status, and adopting itself, never sets a local preferred name.');
        assert(worldRegion.name === 'Willow Village',
            '34. the WorldRegion\'s own authoritative name is byte-identical after adoption and status computation — a claim, and its status, never become World content.');

        console.log('✓ Section N: neither the status indicator nor the adoption it reflects ever ranks, prefers, or mutates WorldRegion naming');
    }

    // -------------------------------------------------------------
    // Section O — manual PlaceNamingPanel import remains unchanged.
    // -------------------------------------------------------------
    {
        const panelSource = codeOnlyLines(await rawSource('ui/components/PlaceNamingPanel.js'));
        assert(!/alreadySaved|hasPlaceNamingClaim/.test(panelSource),
            '35. ui/components/PlaceNamingPanel.js — the manual naming surface — was not touched by this milestone; it references neither alreadySaved nor hasPlaceNamingClaim.');
        assert(panelSource.includes('triggerImportClaim') && panelSource.includes("$emit('import-claim'"),
            '36. the manual panel\'s own existing import (adopt) capability is untouched.');

        console.log('✓ Section O: the manual PlaceNamingPanel and its existing import wiring are completely unaffected by this milestone');
    }

    // -------------------------------------------------------------
    // Section P — real persistence path is exercised, not mocked.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Genuinely Verified' });
        const entries = [{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }];

        const bob = makeIdentity('Bob');
        const { session, verifier, claimStore } = makeReplica(bob);

        assert(verifier instanceof LocalAuthorizationVerifier, '37. the replica\'s own verifier is a REAL, unmocked LocalAuthorizationVerifier instance.');
        assert(claimStore instanceof LocalPlaceNamingClaimStore, '38. the replica\'s own claim store is a REAL, unmocked LocalPlaceNamingClaimStore instance.');

        const rows = deriveRows(entries, session);
        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        assert(session.hasPlaceNamingClaim('world-1', claim.id) === true,
            '39. hasPlaceNamingClaim() reads the genuinely real, persisted store state back — not an in-memory illusion.');

        console.log('✓ Section P: the status indicator is backed by a genuinely real, unmocked verifier and claim store — never a stub standing in for either');
    }

    // -------------------------------------------------------------
    // Section Q — FLAGSHIP: Nostr -> discovery -> proximity -> status
    // presentation -> adoption, end to end.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob, [{ world }]);

        const carol = makeIdentity('Carol');
        const nearClaim = signedClaim(carol, { worldId, regionId: 'region-near', name: 'Riverbend' });

        const tagNear = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const nearEvent = {
            id: 'event-near', pubkey: 'pk-carol', kind: 1,
            tags: [['t', tagNear]],
            content: JSON.stringify(buildPlaceNamingDiscoveryEnvelope(nearClaim)),
            sig: 'sig-near'
        };
        async function queryImpl(relayUrl, filter) {
            const tag = filter['#t'][0];
            if (tag === tagNear) return [nearEvent];
            return [];
        }
        const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource] });

        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                const regions = session.getRegions();
                return Promise.all(regions.map((r) => executeDiscoverPlaceNamingClaimsCommand({
                    discoveryTag: derivePlaceNamingDiscoveryTag(r.worldId, r.id),
                    discoveryQueryService: queryService
                }))).then((perRegionResults) => perRegionResults.flat());
            },
            resolveClaimPosition: (envelope) => {
                const r = session.getRegions().find((candidate) => candidate.worldId === envelope.worldId && candidate.id === envelope.regionId);
                return r ? r.position : null;
            }
        });

        await monitor.observe({ x: 0, z: 0 });
        assert(monitor.lastResult && monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === nearClaim.id,
            '40. FLAGSHIP — real Nostr discovery + real proximity selection surfaces exactly one nearby claim.');

        let rows = deriveRows(monitor.lastResult, session, (id) => `display:${id}`);
        assert(rows[0].alreadySaved === false, '41. FLAGSHIP — before adoption, the real discovered row reports alreadySaved === false.');

        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], feedback);
        assert(result && result.isNew === true && result.claim.name === 'Riverbend', '42. FLAGSHIP — Adopt succeeds end to end.');

        rows = deriveRows(monitor.lastResult, session, (id) => `display:${id}`);
        assert(rows[0].alreadySaved === true,
            '43. FLAGSHIP — re-deriving the row after adoption, from the SAME real Nostr-sourced discovery result, now reports alreadySaved === true — the entire pipeline (Nostr event -> discovery envelope -> proximity selection -> presentation row -> Adopt -> real importClaim() -> status re-derivation) is genuinely connected end to end.');

        console.log('✓ Section Q (FLAGSHIP): a claim discovered over a real Nostr source, filtered by real proximity selection, and adopted via the real importPlaceNamingClaim() boundary correctly flips its own status indicator from [Adopt] to "Already saved" — end to end, with zero shortcuts');
    }

    // -------------------------------------------------------------
    // Section R — source-level regression: no second source of truth.
    // -------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));

        assert(!/adoptedClaimIds/.test(worldViewCode),
            '44. ui/views/WorldView.js defines no "adoptedClaimIds"-shaped second store of its own — every findable reference to a claim being known comes from session.hasPlaceNamingClaim(), never a UI-maintained list.');

        const rowsBlock = extractBetween(worldViewCode, 'const nearbyPlaceNamingClaimRows = computed(() => (', '));');
        assert(/alreadySaved:\s*session\.hasPlaceNamingClaim\(entry\.claim\.worldId,\s*entry\.claim\.id\)/.test(rowsBlock),
            '45. nearbyPlaceNamingClaimRows computes alreadySaved by calling session.hasPlaceNamingClaim() directly, inline, per row — never precomputed into a separate structure first.');

        assert(worldViewCode.includes('function hasPlaceNamingClaim') === false,
            '46. WorldView.js defines no LOCAL hasPlaceNamingClaim()-shaped function of its own — it only ever calls the session\'s.');

        const sessionCode = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(sessionCode.includes('hasPlaceNamingClaim(worldId, claimId) {'),
            '47. WorldNavigationSession exposes a real hasPlaceNamingClaim(worldId, claimId) method.');
        const sessionMethodBlock = extractBetween(sessionCode, 'hasPlaceNamingClaim(worldId, claimId) {', '\n\t}');
        assert(sessionMethodBlock.includes('this._placeNamingClaimUseCase.hasClaim(worldId, claimId)'),
            '48. the session method is a thin pass-through to PlaceNamingClaimUseCase#hasClaim() — no independent lookup logic of its own.');

        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        const useCaseMethodBlock = extractBetween(useCaseCode, 'hasClaim(worldId, claimId) {', '\n    }');
        assert(useCaseMethodBlock.includes('this._store.has(worldId, claimId)'),
            '49. PlaceNamingClaimUseCase#hasClaim() is itself a thin pass-through to the EXISTING, UNMODIFIED LocalPlaceNamingClaimStore#has() — no new storage-layer capability was invented for this milestone.');

        const storeSource = await rawSource('application/LocalPlaceNamingClaimStore.js');
        assert(!/getById|findById|getClaim\(/.test(storeSource),
            '50. LocalPlaceNamingClaimStore.js still exposes no getById()/findById()/getClaim() — this milestone added no new storage-layer lookup capability, exactly as its own brief required ("reuse the existing has() capability").');

        console.log('✓ Section R: "Already saved" is derived, end to end, through one unbroken chain of thin pass-throughs onto the EXISTING LocalPlaceNamingClaimStore#has() — no second, UI-maintained source of truth exists anywhere in this milestone\'s own code');
    }

    console.log('\n✅ All Nearby Place Naming Claim Adoption Status Indicator tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
