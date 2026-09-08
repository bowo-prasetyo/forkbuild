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

// 0.9.270 — Place Naming Adoption Status Lifecycle Audit.
//
// This milestone adds NO new capability. It is a **test-only lifecycle
// audit** of the ONE new, purely read-only field 0.9.269 (Nearby Place
// Naming Claim Adoption Status Indicator) added: `alreadySaved`, derived
// per row from `session.hasPlaceNamingClaim(worldId, claimId)`.
// tests/PlaceNamingNearbyAdoptionStatus.test.js already proved this
// field's semantics in isolation, one call at a time, against statically
// constructed rows: the self-published/imported semantic identity, exact
// claim-id matching, World scoping, failed-adoption non-transition, and a
// single FLAGSHIP pass. This file does not re-derive any of that — it is
// cited, not repeated. What it proves instead is what only shows up under
// a running, repeatedly-observing pipeline and across a replica's own
// lifetime — the exact lifecycle questions
// tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js (0.9.264) and
// tests/PlaceNamingNearbyMetadataPresentationLifecycleAudit.test.js
// (0.9.267) each asked of *their* own milestone, asked here of *adoption
// status* instead.
//
// THE INVARIANT THIS FILE EXISTS TO FREEZE (this milestone's own brief,
// verbatim):
//
//   "Already saved" is a read-only observation of the current local claim
//   store; it is not an adoption state, ownership state, preference, or
//   authority signal.
//
// THE REAL PRODUCTION CHAIN, WITH ONLY THE RELAY CONTROLLED — the same
// restraint 0.9.258/0.9.261/0.9.264/0.9.267 already hold: every
// live-pipeline section below drives a REAL `NostrPlaceNamingDiscoverySource`,
// a REAL `composePlaceNamingDiscoveryRuntime()`, the REAL
// `executeDiscoverPlaceNamingClaimsCommand()`, a REAL
// `PlaceNamingDiscoveryMonitor`, and a REAL, full `WorldNavigationSession`
// — because Adopt itself needs the real `importPlaceNamingClaim()` boundary
// several sections below are testing. `makeRows()`/`adoptNearbyPlaceNamingClaim()`/
// `navigateToNearbyPlaceNamingClaim()` below are the SAME reproductions
// tests/PlaceNamingNearbyAdoptionStatus.test.js and
// tests/PlaceNamingNearbyMetadataPresentationLifecycleAudit.test.js already
// established and whose own regression sections already proved match
// `ui/views/WorldView.js`'s real wiring byte-for-byte — this file reuses
// that proof rather than re-deriving it (Section O's own lightweight
// tripwire re-confirms only what THIS milestone's own brief names).
//
//   Section A — semantic check, live: self-published AND adopted claims
//               both report alreadySaved === true across repeated
//               observation cycles — never distinguished by provenance
//   Section B — the three cases named by this milestone's own brief,
//               live: not in store -> Adopt; adopted -> Already saved;
//               self-published -> Already saved
//   Section C — exact identity matching, live and repeated: different
//               claim ids, authors, regions, Worlds, and a colliding id
//               across Worlds all stay independent, tick after tick
//   Section D — the full adoption lifecycle: discovered -> not saved ->
//               Adopt -> persist -> Already saved -> reconstructed from
//               persistence (a brand-new session/monitor over the SAME
//               storage), never remembered by the UI layer
//   Section E — failed adoption, live: a rejected import (tampered
//               signature) and a persistence-layer failure both leave the
//               status at [Adopt], across repeated subsequent ticks —
//               never an optimistic transition
//   Section F — self-published claim discovered via Nearby: publish ->
//               local store -> the SAME claim echoed back through live
//               Nostr discovery -> Already saved, indistinguishable from
//               an imported claim
//   Section G — competing claims ("Riverside"/Alice, "Old River"/Bob),
//               live: one persisted -> mixed statuses; both persisted ->
//               both independently "Already saved," never ranked
//   Section H — discovery refresh recomputes status atomically, live: old
//               rows never survive a row-list replacement stale
//   Section I — World switching (A -> B -> A), live, including a
//               colliding claimId reused under a second World
//   Section J — navigation independence: alreadySaved never affects
//               focusLocation(); a saved claim navigates identically to
//               an unsaved one
//   Section K — persistence independence, both directions: removing a
//               claim from the discovery result never touches its
//               persisted state; changing persistence then refreshing
//               discovery reflects the new store state
//   Section L — manual PlaceNamingPanel import converges: a claim
//               imported through the existing manual file path
//               immediately reports Already saved when subsequently
//               encountered through Nearby discovery — no second
//               adoption bookkeeping mechanism
//   Section M — session isolation: two independent replicas observe the
//               identical claim with independently correct, differing
//               statuses
//   Section N — FLAGSHIP: Nostr -> discovery -> proximity -> WorldView
//               rows -> hasPlaceNamingClaim() -> Already saved/Adopt ->
//               importPlaceNamingClaim() -> verification -> persistence
//               -> fresh row recomputation, end to end, with self-
//               publishing, competing claims, a failed adoption, and a
//               World switch all woven through
//   Section O — the architectural freeze: WorldView infers alreadySaved
//               from nothing but hasPlaceNamingClaim(worldId, claimId) —
//               never authorIdentityId, the current viewer's own
//               identity, discovery source, claim text, signature
//               presence, navigation state, or previous button clicks —
//               and no second source of truth exists anywhere in the
//               chain

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

// A storage provider whose save() can be told to throw on demand — used
// ONLY by Section E to construct a genuine PERSISTENCE-layer failure
// (as opposed to a verification failure), so that "failed adoption leaves
// status unchanged" is proved for both distinct failure modes named by
// this milestone's own brief.
class FailableStorageProvider extends InMemoryStorageProvider {
    constructor() { super(); this._failNextSave = false; }
    failNextSave() { this._failNextSave = true; }
    save(name, data) {
        if (this._failNextSave) {
            this._failNextSave = false;
            throw new Error('simulated storage failure');
        }
        super.save(name, data);
    }
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

// A full, real WorldNavigationSession and its complete Place Naming
// collaborator graph — identical in shape to
// tests/PlaceNamingNearbyMetadataPresentationLifecycleAudit.test.js#makeReplica(),
// widened only to accept an explicit `storage` so Section D can rebuild a
// brand-new session over the SAME underlying storage.
function makeReplica(identityProvider, { documents = [], storage = new InMemoryStorageProvider() } = {}) {
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
    return { session, claimStore, verifier, placeNamingClaimUseCase, placeNamingClaimExchange, localNamePreferenceStore, storage };
}

function signedClaim(identity, { worldId, regionId, name, createdAt }) {
    let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId: identity.identityId, createdAt });
    claim = claim.withSignature(identity.signCanonical(claim.getSigningDescriptor()));
    return claim;
}

function discoverAsEnvelope(claim) {
    const built = buildPlaceNamingDiscoveryEnvelope(claim);
    return parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
}

// EXACTLY ui/views/WorldView.js#formatNearbyPlaceNamingCreatedAt().
function formatNearbyPlaceNamingCreatedAt(createdAt) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

// EXACTLY ui/views/WorldView.js's own (0.9.269-widened) `nearbyPlaceNamingClaimRows`
// computed — a pure mapping over the discovered entries plus one read of
// session.hasPlaceNamingClaim() per row, never a second, UI-maintained
// "known ids" set.
function makeRows(entries, session, resolveDisplayName = (id) => id) {
    return entries.map((entry) => ({
        claimId: entry.claim.id,
        name: entry.claim.name,
        authorDisplayName: resolveDisplayName(entry.claim.authorIdentityId),
        createdAtLabel: formatNearbyPlaceNamingCreatedAt(entry.claim.createdAt),
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

// EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim() as widened
// at 0.9.269 — same reshaping, same call order, same duplicate-vs-new
// feedback split, and the same "reassign, never mutate in place" refresh
// trigger.
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

// EXACTLY ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim().
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

// A simplified but faithful reproduction of
// ui/views/WorldView.js#importNamingClaim() — the manual PlaceNamingPanel
// "Import Claim" file path: parse the raw text, hand it to the exact same
// session.importPlaceNamingClaim() boundary Adopt itself calls, and give
// the same non-alarming "already known" feedback on a genuine duplicate.
function manualImportNamingClaim(session, rawText, feedback) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (e) {
        feedback.show('That is not valid JSON — choose a file exported with "Export Claim."');
        return null;
    }
    const result = guardedCall(() => session.importPlaceNamingClaim(parsed), feedback);
    if (!result) return null;
    const { claim, isNew } = result;
    if (!isNew) {
        feedback.show(`"${claim.name}" was already known — nothing changed`);
        return result;
    }
    feedback.show(`Imported "${claim.name}"`);
    return result;
}

function tamperSignatureHex(hex) {
    return hex.split('').reverse().join('');
}

// ---------------------------------------------------------------------
// Full real-pipeline harness — mirrors
// tests/PlaceNamingNearbyMetadataPresentationLifecycleAudit.test.js#createHarness()
// exactly, widened only to carry alreadySaved through `rows()`.
// ---------------------------------------------------------------------
let nextEventId = 0;
function nostrEventFor(envelope, { tag, pubkey = 'pk-relay-transport' } = {}) {
    nextEventId += 1;
    return { id: `event-${nextEventId}`, pubkey, kind: 1, tags: [['t', tag]], content: JSON.stringify(envelope), sig: `sig-${nextEventId}` };
}

function makeRelay(initialHandler = () => []) {
    let handler = initialHandler;
    const calls = [];
    async function queryImpl(relayUrl, filter) {
        const tag = filter['#t'][0];
        calls.push(tag);
        return handler(tag, relayUrl);
    }
    return { queryImpl, calls, setHandler(fn) { handler = fn; } };
}

const LARGE_PROXIMITY_RADIUS = 1_000_000;

function createHarness({ session, relay, proximityRadius = LARGE_PROXIMITY_RADIUS }) {
    const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
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
            const r = session.getRegions().find((c) => c.worldId === envelope.worldId && c.id === envelope.regionId);
            return r ? r.position : null;
        },
        proximityRadius
    });
    const refs = { nearbyPlaceNamingClaims: [], placeNamingDiscoveryError: null };
    let active = true;

    function tick(position) {
        return monitor.observe(position).then(() => {
            if (!active) return;
            refs.nearbyPlaceNamingClaims = monitor.lastResult || [];
            refs.placeNamingDiscoveryError = monitor.lastError;
        });
    }

    function rows(resolveDisplayName = (id) => id) {
        return makeRows(refs.nearbyPlaceNamingClaims, session, resolveDisplayName);
    }

    function unmount() {
        active = false;
        monitor.dispose();
    }

    return { session, monitor, refs, tick, rows, unmount };
}

function claimIds(harness) {
    return harness.refs.nearbyPlaceNamingClaims.map((c) => c.claim.id);
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
    console.log('Running Place Naming Adoption Status Lifecycle Audit tests...\n');

    // -------------------------------------------------------------
    // Section A — semantic check, live: self-published AND adopted claims
    // both report alreadySaved === true across repeated observation
    // cycles — never distinguished by provenance.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Sunspire Region', x: 0, z: 0 }));
        const { session, placeNamingClaimUseCase } = makeReplica(alice, { documents: [{ world }] });

        // Alice PUBLISHES her own claim manually — completely unrelated
        // to Nearby/Adopt.
        const published = placeNamingClaimUseCase.publish(worldId, 'region-1', 'Sunspire');

        const bob = makeIdentity('Bob');
        const adoptedClaim = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Other Name' });

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(published), { tag }), nostrEventFor(buildPlaceNamingDiscoveryEnvelope(adoptedClaim), { tag })]
            : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        const adoptResult = adoptNearbyPlaceNamingClaim(session, harness.rows().find((r) => r.claimId === adoptedClaim.id), makeFeedback());
        assert(adoptResult && adoptResult.isNew === true, 'sanity: the second claim genuinely adopts.');

        // Repeated observation cycles, several ticks later — both must
        // report alreadySaved === true, indistinguishably.
        for (let i = 0; i < 3; i += 1) {
            await harness.tick({ x: (i + 1) * 100, z: 0 });
            const rows = harness.rows();
            const publishedRow = rows.find((r) => r.claimId === published.id);
            const adoptedRow = rows.find((r) => r.claimId === adoptedClaim.id);
            assert(publishedRow.alreadySaved === true,
                `1.${i} the self-published claim reports alreadySaved === true on observation cycle ${i}.`);
            assert(adoptedRow.alreadySaved === true,
                `2.${i} the adopted claim reports alreadySaved === true on observation cycle ${i}.`);
        }

        console.log('✓ Section A: across repeated live observation cycles, a self-published claim and a genuinely adopted claim both report alreadySaved === true — the underlying store, and therefore "Already saved," never distinguishes the two by provenance');
    }

    // -------------------------------------------------------------
    // Section B — the three cases named by this milestone's own brief,
    // live: not in store -> Adopt; adopted -> Already saved; self-
    // published -> Already saved.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Triad Region', x: 0, z: 0 }));
        const { session, placeNamingClaimUseCase } = makeReplica(alice, { documents: [{ world }] });

        const selfPublished = placeNamingClaimUseCase.publish(worldId, 'region-1', 'Home Name');

        const bob = makeIdentity('Bob');
        const toBeAdopted = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Adopted Name' });
        const carol = makeIdentity('Carol');
        const untouched = signedClaim(carol, { worldId, regionId: 'region-1', name: 'Untouched Name' });

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(selfPublished), { tag }),
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(toBeAdopted), { tag }),
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(untouched), { tag })
            ]
            : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows();
        assert(rows.find((r) => r.claimId === selfPublished.id).alreadySaved === true,
            '3. case "self-published" -> Already saved.');
        assert(rows.find((r) => r.claimId === toBeAdopted.id).alreadySaved === false,
            '4. sanity: the claim yet to be adopted is not saved.');
        assert(rows.find((r) => r.claimId === untouched.id).alreadySaved === false,
            '5. case "claim not in store" -> Adopt.');

        const adoptResult = adoptNearbyPlaceNamingClaim(session, rows.find((r) => r.claimId === toBeAdopted.id), makeFeedback());
        assert(adoptResult && adoptResult.isNew === true, 'sanity: adoption succeeds.');

        await harness.tick({ x: 100, z: 0 });
        rows = harness.rows();
        assert(rows.find((r) => r.claimId === toBeAdopted.id).alreadySaved === true,
            '6. case "claim adopted" -> Already saved.');
        assert(rows.find((r) => r.claimId === untouched.id).alreadySaved === false,
            '7. the untouched, never-adopted claim remains at Adopt, unaffected by the other two.');
        assert(rows.find((r) => r.claimId === selfPublished.id).alreadySaved === true,
            '8. the self-published claim remains Already saved, unaffected.');

        console.log('✓ Section B: all three cases this milestone\'s brief named — not in store, adopted, self-published — are proved side by side in one live pipeline: "Adopt," "Already saved," and "Already saved" respectively, none affecting the others');
    }

    // -------------------------------------------------------------
    // Section C — exact identity matching, live and repeated.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Identity Region', x: 0, z: 0 }));
        const { session, claimStore } = makeReplica(alice, { documents: [{ world }] });

        const claimOne = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Riverside' });
        const claimTwo = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Riverside' }); // same author/region/name, different id
        const claimByBob = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Riverside' }); // different author, same name
        assert(claimOne.id !== claimTwo.id, 'sanity: two independently-created claims never share an id.');

        claimStore.save(claimOne);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimOne), { tag }),
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimTwo), { tag }),
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimByBob), { tag })
            ]
            : []));
        const harness = createHarness({ session, relay });

        for (let i = 0; i < 3; i += 1) {
            await harness.tick({ x: (i + 1) * 100, z: 0 });
            const rows = harness.rows();
            assert(rows.find((r) => r.claimId === claimOne.id).alreadySaved === true,
                `9.${i} the exact stored claim reports alreadySaved === true on tick ${i}.`);
            assert(rows.find((r) => r.claimId === claimTwo.id).alreadySaved === false,
                `10.${i} a content-identical claim under a DIFFERENT id reports alreadySaved === false on tick ${i} — matching is by id alone, never by content.`);
            assert(rows.find((r) => r.claimId === claimByBob.id).alreadySaved === false,
                `11.${i} an identically-named claim by a DIFFERENT author reports alreadySaved === false on tick ${i}.`);
        }

        // The colliding-id-across-Worlds negative check, live: a second,
        // structurally distinct claim forced to reuse claimOne's own id
        // string under a DIFFERENT worldId/regionId must never read as
        // saved for that other World.
        const claimOtherWorld = PlaceNamingClaim.fromJSON({ ...claimOne.toJSON(), worldId: 'world-other', regionId: 'region-other' });
        assert(session.hasPlaceNamingClaim('world-other', claimOtherWorld.id) === false,
            '12. THE NEGATIVE CHECK: the SAME id string under a DIFFERENT worldId is reported as NOT saved — World identity remains part of the key, never inferred from the id alone.');

        console.log('✓ Section C: across repeated live observation cycles, exact claim-id matching holds — different claim ids with identical names, different authors, and a colliding id reused under a different World all remain independently, correctly classified every single tick');
    }

    // -------------------------------------------------------------
    // Section D — the full adoption lifecycle: discovered -> not saved ->
    // Adopt -> persist -> Already saved -> reconstructed from persistence
    // (a brand-new session/monitor over the SAME storage), never
    // remembered by the UI layer.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Lifecycle Region', x: 0, z: 0 }));

        const bob = makeIdentity('Bob');
        const claim = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Fern Hollow' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));

        const carol = makeIdentity('Carol');
        const sharedStorage = new InMemoryStorageProvider();
        const { session: sessionFirst } = makeReplica(carol, { documents: [{ world }], storage: sharedStorage });
        const harnessFirst = createHarness({ session: sessionFirst, relay });

        await harnessFirst.tick({ x: 0, z: 0 });
        let row = harnessFirst.rows()[0];
        assert(row.alreadySaved === false, '13. discovered -> not saved.');

        const adoptResult = adoptNearbyPlaceNamingClaim(sessionFirst, row, makeFeedback());
        assert(adoptResult && adoptResult.isNew === true, '14. Adopt -> persist succeeds.');

        await harnessFirst.tick({ x: 100, z: 0 });
        row = harnessFirst.rows()[0];
        assert(row.alreadySaved === true, '15. after persistence, the SAME session/monitor reports Already saved.');

        // THE CORE CHECK — a genuinely NEW session, a genuinely NEW
        // WorldNavigationSession/PlaceNamingClaimUseCase/monitor instance
        // (nothing carried over in memory), built over the exact SAME
        // underlying storage. If "Already saved" were secretly remembered
        // by the UI/session layer rather than reconstructed fresh from
        // persistence, this fresh instance would report it wrong.
        const { session: sessionSecond } = makeReplica(carol, { documents: [{ world }], storage: sharedStorage });
        const harnessSecond = createHarness({ session: sessionSecond, relay });
        await harnessSecond.tick({ x: 0, z: 0 });
        const rowSecond = harnessSecond.rows()[0];
        assert(rowSecond.alreadySaved === true,
            '16. a BRAND-NEW session/monitor instance, sharing only the underlying storage, independently reconstructs alreadySaved === true from persistence — the status was never a fact remembered by any in-memory UI/session state.');

        console.log('✓ Section D: discovered -> not saved -> Adopt -> persist -> Already saved holds, and re-deriving the exact same status from a completely fresh session/monitor instance over the same storage proves the status is genuinely reconstructed from persistence, never remembered by the UI layer');
    }

    // -------------------------------------------------------------
    // Section E — failed adoption, live: a rejected import (tampered
    // signature) and a persistence-layer failure both leave the status at
    // [Adopt], across repeated subsequent ticks — never an optimistic
    // transition.
    // -------------------------------------------------------------
    {
        // E1 — verification failure (a tampered signature).
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Forged Region', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const claim = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Forged Name' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));

        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol, { documents: [{ world }] });
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows()[0];
        const tamperedRow = { ...row, signature: { ...row.signature, signature: tamperSignatureHex(row.signature.signature) } };
        const failedResult = adoptNearbyPlaceNamingClaim(session, tamperedRow, makeFeedback());
        assert(failedResult === null, '17. sanity: the forged claim is refused by real signature verification.');

        // Repeated subsequent ticks, never a one-shot check — the status
        // must never optimistically flip on its own after the refusal.
        for (let i = 0; i < 3; i += 1) {
            await harness.tick({ x: (i + 1) * 100, z: 0 });
            assert(harness.rows()[0].alreadySaved === false,
                `18.${i} after a refused (tampered-signature) adoption, alreadySaved remains false on subsequent tick ${i} — no optimistic transition ever appears.`);
        }
        assert(claimStore.listForRegion(worldId, 'region-1').length === 0, '19. nothing was actually persisted.');

        // E2 — a genuine PERSISTENCE-layer failure: the signature/claim
        // are entirely valid, but the underlying storage itself throws
        // when save() is attempted.
        const dave = makeIdentity('Dave');
        const validClaim = signedClaim(dave, { worldId, regionId: 'region-1', name: 'Valid But Unlucky' });
        const tagValid = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relayValid = makeRelay((t) => (t === tagValid ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(validClaim), { tag: tagValid })] : []));

        const erin = makeIdentity('Erin');
        const failableStorage = new FailableStorageProvider();
        const { session: sessionB } = makeReplica(erin, { documents: [{ world }], storage: failableStorage });
        const harnessB = createHarness({ session: sessionB, relay: relayValid });

        await harnessB.tick({ x: 0, z: 0 });
        const rowB = harnessB.rows()[0];
        assert(rowB.alreadySaved === false, '20. sanity: the claim starts unsaved.');

        failableStorage.failNextSave();
        const feedback = makeFeedback();
        const persistenceFailureResult = adoptNearbyPlaceNamingClaim(sessionB, rowB, feedback);
        assert(persistenceFailureResult === null, '21. a genuine persistence-layer failure is surfaced as a refused adoption, exactly like a verification failure — never a silent partial success.');
        assert(/simulated storage failure/.test(feedback.messages[0]), '22. the real underlying storage error reaches feedback, unmasked.');

        for (let i = 0; i < 3; i += 1) {
            await harnessB.tick({ x: (i + 1) * 100, z: 0 });
            assert(harnessB.rows()[0].alreadySaved === false,
                `23.${i} after a persistence-layer failure, alreadySaved remains false on subsequent tick ${i}.`);
        }

        // A retry with the SAME (now-recovered) storage succeeds normally
        // — the earlier failure left no residue that would prevent a
        // later, genuine success.
        const retryResult = adoptNearbyPlaceNamingClaim(sessionB, harnessB.rows()[0], makeFeedback());
        assert(retryResult && retryResult.isNew === true, '24. a retry after the storage recovers succeeds normally — the earlier failure left no lingering half-adopted state.');
        await harnessB.tick({ x: 1000, z: 0 });
        assert(harnessB.rows()[0].alreadySaved === true, '25. after the successful retry, the status genuinely flips to Already saved.');

        console.log('✓ Section E: both a verification failure (tampered signature) and a genuine persistence-layer failure leave the status indicator at [Adopt] across every subsequent observation cycle — never an optimistic transition — and a later, genuine success still adopts normally once the underlying failure has passed');
    }

    // -------------------------------------------------------------
    // Section F — self-published claim discovered via Nearby: publish ->
    // local store -> the SAME claim echoed back through live Nostr
    // discovery -> Already saved, indistinguishable from an imported
    // claim.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Riverbend Region', x: 0, z: 0 }));
        const { session, placeNamingClaimUseCase } = makeReplica(alice, { documents: [{ world }] });

        // Alice publishes her own claim manually — no Nearby, no Adopt,
        // no discovery involved yet.
        const published = placeNamingClaimUseCase.publish(worldId, 'region-1', 'Riverbend');
        assert(session.hasPlaceNamingClaim(worldId, published.id) === true, 'sanity: publish() alone already marks the claim as saved.');

        // The SAME identity's OWN claim is now echoed back through a real
        // relay — exactly the scenario a Wanderer would encounter if
        // their own earlier publication is rediscovered via Nostr, e.g.
        // after clearing a local discovery cache or from a second device
        // sharing the same identity's own claim store contents.
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(published), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows()[0];
        assert(row.claimId === published.id, '26. the self-published claim is genuinely discovered back through the live pipeline.');
        assert(row.alreadySaved === true,
            '27. the self-published, now-discovered claim reports alreadySaved === true — the UI never distinguishes "I discovered this" from "I already knew this because I wrote it," exactly per this milestone\'s own brief.');

        // Clicking Adopt on this row (a Wanderer who doesn't realize it's
        // their own claim) is a harmless, idempotent no-op — never a
        // duplicate entry, and the status stays exactly as it was.
        const feedback = makeFeedback();
        const adoptResult = adoptNearbyPlaceNamingClaim(session, row, feedback);
        assert(adoptResult && adoptResult.isNew === false, '28. re-"adopting" one\'s own self-published claim is a genuine no-op.');
        assert(/already known/i.test(feedback.messages[0]), '29. the duplicate-adopt feedback is the same ordinary "already known" message, never a special "this is your own claim" message.');

        console.log('✓ Section F: a self-published claim, subsequently rediscovered through a real, live Nostr pipeline, reports Already saved exactly like any imported claim would — provenance never leaks into the presented status');
    }

    // -------------------------------------------------------------
    // Section G — competing claims ("Riverside"/Alice, "Old River"/Bob),
    // live: one persisted -> mixed statuses; both persisted -> both
    // independently "Already saved," never ranked.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Contested Crossing', x: 0, z: 0 }));
        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol, { documents: [{ world }] });

        const riverside = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Riverside' });
        const oldRiver = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Old River' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(riverside), { tag }), nostrEventFor(buildPlaceNamingDiscoveryEnvelope(oldRiver), { tag })]
            : []));
        const harness = createHarness({ session, relay });

        // Only "Riverside" is persisted.
        claimStore.save(riverside);
        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows();
        const riversideRow = rows.find((r) => r.name === 'Riverside');
        const oldRiverRow = rows.find((r) => r.name === 'Old River');
        assert(riversideRow.alreadySaved === true, '30. "Riverside" (persisted) reports Already saved.');
        assert(oldRiverRow.alreadySaved === false, '31. "Old River" (not persisted) reports Adopt.');
        assert(!('score' in riversideRow) && !('rank' in riversideRow) && !('score' in oldRiverRow) && !('rank' in oldRiverRow),
            '32. neither row carries a score/rank field — one being saved never ranks it above the other.');

        // Repeated ticks reconfirm the split is stable, not a first-tick
        // accident.
        for (let i = 0; i < 2; i += 1) {
            await harness.tick({ x: (i + 1) * 200, z: 0 });
            rows = harness.rows();
            assert(rows.find((r) => r.name === 'Riverside').alreadySaved === true, `33.${i} "Riverside" stays Already saved on repeated tick ${i}.`);
            assert(rows.find((r) => r.name === 'Old River').alreadySaved === false, `34.${i} "Old River" stays Adopt on repeated tick ${i}.`);
        }

        // Now BOTH are persisted (adopting "Old River" too) — both
        // independently become Already saved.
        const adoptOldRiver = adoptNearbyPlaceNamingClaim(session, oldRiverRow, makeFeedback());
        assert(adoptOldRiver && adoptOldRiver.isNew === true, '35. "Old River" adopts successfully.');
        await harness.tick({ x: 1000, z: 0 });
        rows = harness.rows();
        assert(rows.find((r) => r.name === 'Riverside').alreadySaved === true && rows.find((r) => r.name === 'Old River').alreadySaved === true,
            '36. once both claims are persisted, both independently report Already saved — no preference or ordering emerges between them.');
        assert(claimStore.listForRegion(worldId, 'region-1').length === 2, '37. both competing claims are genuinely persisted side by side.');

        console.log('✓ Section G: with only "Riverside" persisted, statuses split exactly as expected and stay stable across repeated ticks; once both competing claims are persisted, both independently report Already saved with no ranking or preference ever emerging between them');
    }

    // -------------------------------------------------------------
    // Section H — discovery refresh recomputes status atomically, live:
    // old rows never survive a row-list replacement stale.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Alpha Region', x: 0, z: 0 }));
        world.addWorldRegion(region({ id: 'region-2', worldId, authorIdentityId: alice.identityId, name: 'Beta Region', x: 500, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob, { documents: [{ world }] });

        const claimA = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Alpha' });
        const claimB = signedClaim(alice, { worldId, regionId: 'region-2', name: 'Beta' });
        const tagA = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const tagB = derivePlaceNamingDiscoveryTag(worldId, 'region-2');
        let includeB = false;
        const relay = makeRelay((t) => {
            if (t === tagA) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimA), { tag: tagA })];
            if (t === tagB && includeB) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimB), { tag: tagB })];
            return [];
        });
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows();
        assert(rows.length === 1 && rows[0].alreadySaved === false, '38. sanity: only "Alpha" is discovered initially, unsaved.');

        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        // The next discovery tick surfaces "Beta" alongside "Alpha" — the
        // row list is REPLACED wholesale (the monitor's own lastResult
        // assignment), never incrementally patched.
        includeB = true;
        await harness.tick({ x: 200, z: 0 });
        rows = harness.rows();
        assert(rows.length === 2, '39. the refreshed row list reflects the new discovery result in full.');
        assert(rows.find((r) => r.name === 'Alpha').alreadySaved === true,
            '40. "Alpha" (adopted before this refresh) is correctly recomputed as alreadySaved === true on the new pass — not stale, not dropped.');
        assert(rows.find((r) => r.name === 'Beta').alreadySaved === false,
            '41. "Beta" (newly discovered this tick, never adopted) is correctly recomputed as alreadySaved === false.');

        // "Alpha" then drops out of range entirely, then reappears — its
        // status must never be stale/cached across the disappearance.
        // Simulate Alpha itself disappearing too (both gone), then Alpha
        // reappearing alone.
        includeB = false;
        const relayControlled = relay;
        relayControlled.setHandler((t) => []);
        await harness.tick({ x: 400, z: 0 });
        assert(claimIds(harness).length === 0, '42. both claims disappearing from discovery removes both rows atomically.');

        relayControlled.setHandler((t) => (t === tagA ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimA), { tag: tagA })] : []));
        await harness.tick({ x: 600, z: 0 });
        rows = harness.rows();
        assert(rows.length === 1 && rows[0].name === 'Alpha' && rows[0].alreadySaved === true,
            '43. "Alpha" reappearing after having vanished still correctly reports Already saved, fresh from persistence — never a stale in-memory row.');

        console.log('✓ Section H: a discovery refresh recomputes alreadySaved fresh for the WHOLE row list every time, including through a full disappear-and-reappear cycle — no stale value ever survives a row-list replacement');
    }

    // -------------------------------------------------------------
    // Section I — World switching (A -> B -> A), live, including a
    // colliding claimId reused under a second World.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldOld = new World({ id: 'world-old' });
        worldOld.addWorldRegion(region({ id: 'region-1', worldId: 'world-old', authorIdentityId: alice.identityId, name: 'Old World Region', x: 0, z: 0 }));
        const worldNew = new World({ id: 'world-new' });
        worldNew.addWorldRegion(region({ id: 'region-1', worldId: 'world-new', authorIdentityId: bob.identityId, name: 'New World Region', x: 0, z: 0 }));

        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol, { documents: [{ world: worldOld }] });

        const oldClaim = signedClaim(alice, { worldId: 'world-old', regionId: 'region-1', name: 'Old World Place' });
        // A colliding claimId forced onto a claim in the OTHER World —
        // the exact stress this milestone's own brief names by name.
        const newClaimColliding = PlaceNamingClaim.fromJSON({ ...oldClaim.toJSON(), worldId: 'world-new', regionId: 'region-1', name: 'New World Place' });
        const tagOld = derivePlaceNamingDiscoveryTag('world-old', 'region-1');
        const tagNew = derivePlaceNamingDiscoveryTag('world-new', 'region-1');
        const relay = makeRelay((t) => {
            if (t === tagOld) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(oldClaim), { tag: tagOld })];
            if (t === tagNew) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(newClaimColliding), { tag: tagNew })];
            return [];
        });
        const harness = createHarness({ session, relay });

        // World A ("world-old") is loaded; adopt its own claim.
        await harness.tick({ x: 0, z: 0 });
        let row = harness.rows()[0];
        assert(row.worldId === 'world-old' && row.alreadySaved === false, '44. sanity: "world-old"\'s own claim starts unsaved.');
        const adoptOld = adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(adoptOld && adoptOld.isNew === true, '45. "world-old"\'s own claim adopts successfully.');
        await harness.tick({ x: 200, z: 0 });
        assert(harness.rows()[0].alreadySaved === true, '46. after adoption, "world-old"\'s claim reports Already saved.');

        // Switch to World B ("world-new") — the colliding-id claim under
        // this OTHER World must NOT read as saved, even though it shares
        // the exact same claimId string as the just-adopted claim.
        session._loadedDocuments.delete('world-old');
        session._loadedDocuments.set('world-new', { world: worldNew });
        await harness.tick({ x: 500, z: 0 });
        row = harness.rows()[0];
        assert(row.worldId === 'world-new' && row.claimId === newClaimColliding.id,
            '47. after switching, "world-new"\'s own (colliding-id) claim is what is now discovered.');
        assert(row.alreadySaved === false,
            '48. THE NEGATIVE CHECK — even though this claim reuses the exact same id string as the one just adopted under "world-old," it reports alreadySaved === false under "world-new": World identity is genuinely part of the lookup key, never inferred from the id alone.');
        assert(claimStore.listForRegion('world-new', 'region-1').length === 0,
            '49. "world-new"\'s own claim list remains completely empty — adopting under "world-old" never leaked into it.');

        // Switch BACK to World A — its own claim's status must survive
        // the round trip, freshly recomputed, never cached across the
        // switch.
        session._loadedDocuments.delete('world-new');
        session._loadedDocuments.set('world-old', { world: worldOld });
        await harness.tick({ x: 1000, z: 0 });
        row = harness.rows()[0];
        assert(row.worldId === 'world-old' && row.alreadySaved === true,
            '50. switching BACK to "world-old" presents its own claim, still correctly Already saved — never a stale cached value, and never anything leaked from "world-new."');

        console.log('✓ Section I: switching World A -> World B -> World A never leaks the wrong World\'s adoption status at any point, even when a claimId is deliberately forced to collide across the two Worlds — worldId genuinely remains part of the status lookup key throughout');
    }

    // -------------------------------------------------------------
    // Section J — navigation independence: alreadySaved never affects
    // focusLocation(); a saved claim navigates identically to an unsaved
    // one.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Thistledown Region', x: 10, z: 20 }));
        world.addWorldRegion(region({ id: 'region-2', worldId, authorIdentityId: alice.identityId, name: 'Foxglove Region', x: 30, z: 40 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const savedClaim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Thistledown' });
        const unsavedClaim = signedClaim(alice, { worldId, regionId: 'region-2', name: 'Foxglove' });
        claimStore.save(savedClaim);

        const tag1 = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const tag2 = derivePlaceNamingDiscoveryTag(worldId, 'region-2');
        const relay = makeRelay((t) => {
            if (t === tag1) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(savedClaim), { tag: tag1 })];
            if (t === tag2) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(unsavedClaim), { tag: tag2 })];
            return [];
        });
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });
        const rows = harness.rows();
        const savedRow = rows.find((r) => r.name === 'Thistledown');
        const unsavedRow = rows.find((r) => r.name === 'Foxglove');
        assert(savedRow.alreadySaved === true && unsavedRow.alreadySaved === false, 'sanity: one row saved, one not.');

        let focusCalls = [];
        const realFocus = session.focusLocation.bind(session);
        session.focusLocation = (id) => { focusCalls.push(id); return realFocus(id); };

        const resultSaved = navigateToNearbyPlaceNamingClaim(session, savedRow, makeFeedback());
        assert(resultSaved === true && focusCalls.length === 1 && focusCalls[0] === 'region-1',
            '51. Navigate on the ALREADY-SAVED row targets its own region exactly like any other row would.');

        focusCalls = [];
        const resultUnsaved = navigateToNearbyPlaceNamingClaim(session, unsavedRow, makeFeedback());
        assert(resultUnsaved === true && focusCalls.length === 1 && focusCalls[0] === 'region-2',
            '52. Navigate on the UNSAVED row behaves identically — the same call, same outcome, same single focusLocation() invocation.');

        // Navigate never reads alreadySaved at all — a row whose
        // alreadySaved was deliberately corrupted navigates identically.
        focusCalls = [];
        const corruptedRow = { ...savedRow, alreadySaved: 'not-a-boolean' };
        const resultCorrupted = navigateToNearbyPlaceNamingClaim(session, corruptedRow, makeFeedback());
        assert(resultCorrupted === true && focusCalls.length === 1 && focusCalls[0] === 'region-1',
            '53. Navigate behaves identically even for a row whose alreadySaved value is corrupted or nonsensical — the field is never consulted.');

        // Structural proof, direct from real source.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const navigateBlock = extractBetween(worldViewCode, 'function navigateToNearbyPlaceNamingClaim(row) {', '\n        }');
        assert(!/alreadySaved/.test(navigateBlock), '54. navigateToNearbyPlaceNamingClaim() contains no reference to alreadySaved whatsoever, structurally.');

        console.log('✓ Section J: Already saved status never affects focusLocation() — a saved claim and an unsaved claim navigate through the exact same code path with the exact same outcome, live and structurally');
    }

    // -------------------------------------------------------------
    // Section K — persistence independence, both directions: removing a
    // claim from the discovery result never touches its persisted state;
    // changing persistence then refreshing discovery reflects the new
    // store state.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Persistence Region', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Kestrel Point' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        let discoveryOn = true;
        const relay = makeRelay((t) => (t === tag && discoveryOn ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows()[0];
        adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
        await harness.tick({ x: 200, z: 0 });
        assert(harness.rows()[0].alreadySaved === true, '55. sanity: the claim is adopted and reports Already saved.');

        // Direction 1 — remove the claim from the DISCOVERY result
        // entirely (it moves out of range / the relay stops returning
        // it). Its PERSISTED state must be completely unaffected.
        discoveryOn = false;
        await harness.tick({ x: 400, z: 0 });
        assert(claimIds(harness).length === 0, '56. the claim is no longer discovered at all.');
        assert(session.hasPlaceNamingClaim(worldId, claim.id) === true,
            '57. THE CORE CHECK — even though the claim vanished from the discovery result, its persisted status (queried directly, independent of any row) remains Already saved: discovery visibility and persisted status are two independent facts.');
        assert(claimStore.listForRegion(worldId, 'region-1').length === 1, '58. the claim genuinely remains in the store.');

        // Bring discovery back — the row reappears with the correct,
        // still-true status.
        discoveryOn = true;
        await harness.tick({ x: 600, z: 0 });
        assert(harness.rows()[0].alreadySaved === true, '59. once rediscovered, the row correctly reflects the still-persisted status.');

        // Direction 2 — change PERSISTENCE directly (retract the claim,
        // bypassing discovery entirely), then refresh discovery. The
        // status must reflect the NEW store state, proving the direction
        // is genuinely store -> status, never the reverse.
        const retracted = claimStore.retract(worldId, claim.id);
        assert(retracted === true, 'sanity: retraction succeeds.');
        await harness.tick({ x: 800, z: 0 });
        assert(harness.rows()[0].alreadySaved === false,
            '60. THE CORE CHECK — after retracting the claim directly from the store (never touching discovery), the NEXT discovery refresh correctly reports alreadySaved === false: a change in persistence is what drives the status, discovery merely re-presents it.');

        console.log('✓ Section K: a claim disappearing from the discovery result never touches its persisted status, and a direct change to persistence is correctly reflected the next time discovery refreshes — the direction is always store -> status, never discovery -> status');
    }

    // -------------------------------------------------------------
    // Section L — manual PlaceNamingPanel import converges: a claim
    // imported through the existing manual file path immediately reports
    // Already saved when subsequently encountered through Nearby
    // discovery — no second adoption bookkeeping mechanism.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Exported Region', x: 0, z: 0 }));

        // Alice publishes and exports her claim as a portable package —
        // exactly the "Export Claim" button's own real path.
        const { session: aliceSession } = makeReplica(alice, { documents: [{ world }] });
        const published = aliceSession._placeNamingClaimUseCase.publish(worldId, 'region-1', 'Willowmere');
        const exportedPkg = aliceSession.exportPlaceNamingClaim('region-1', published.id);
        const rawText = JSON.stringify(exportedPkg);

        // Bob — a completely separate replica/identity/storage — manually
        // imports the raw text through the exact real
        // session.importPlaceNamingClaim() boundary the PlaceNamingPanel's
        // own "Import Claim" file input reaches.
        const bob = makeIdentity('Bob');
        const { session: bobSession } = makeReplica(bob, { documents: [{ world }] });
        const feedback = makeFeedback();
        const importResult = manualImportNamingClaim(bobSession, rawText, feedback);
        assert(importResult && importResult.isNew === true, '61. the manual import succeeds through the real importPlaceNamingClaim() boundary.');
        assert(/Imported/.test(feedback.messages[0]), '62. the manual import path\'s own real feedback fires.');

        // Bob's OWN live Nearby discovery subsequently surfaces the SAME
        // claim (e.g. rebroadcast over Nostr by a third party) — it must
        // immediately, correctly report Already saved, with no separate
        // "was this imported manually" bookkeeping anywhere.
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(published), { tag })] : []));
        const harness = createHarness({ session: bobSession, relay });
        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows()[0];
        assert(row.claimId === published.id, 'sanity: the manually-imported claim is genuinely discovered back through Nearby.');
        assert(row.alreadySaved === true,
            '63. THE CORE CHECK — a claim imported through the existing manual PlaceNamingPanel file path immediately produces Already saved when subsequently encountered through Nearby discovery, proving 0.9.269 built no second, Nearby-specific adoption bookkeeping mechanism alongside the pre-existing manual one.');

        console.log('✓ Section L: a claim imported through the manual PlaceNamingPanel file path converges onto the exact same Already saved status the moment it is subsequently encountered via Nearby discovery — one unified store, never two independent adoption records');
    }

    // -------------------------------------------------------------
    // Section M — session isolation: two independent replicas observe the
    // identical claim with independently correct, differing statuses.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Shared Region', x: 0, z: 0 }));

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Shared Claim' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));

        const bob = makeIdentity('Bob');
        const { session: replicaA, claimStore: storeA } = makeReplica(bob, { documents: [{ world }] });
        const carol = makeIdentity('Carol');
        const { session: replicaB } = makeReplica(carol, { documents: [{ world }] });

        // Replica A persists the claim; Replica B, an entirely separate
        // storage, never does.
        storeA.save(claim);

        const harnessA = createHarness({ session: replicaA, relay });
        const harnessB = createHarness({ session: replicaB, relay });

        await Promise.all([harnessA.tick({ x: 0, z: 0 }), harnessB.tick({ x: 0, z: 0 })]);
        const rowA = harnessA.rows()[0];
        const rowB = harnessB.rows()[0];
        assert(rowA.claimId === claim.id && rowB.claimId === claim.id, 'sanity: both replicas discover the identical claim.');
        assert(rowA.alreadySaved === true, '64. Replica A (which persisted the claim) reports Already saved.');
        assert(rowB.alreadySaved === false, '65. Replica B (which never persisted it) reports Adopt for the EXACT SAME claim — correct, since the status is explicitly local.');

        // Repeated, interleaved ticks reconfirm the isolation never drifts
        // or leaks between the two replicas.
        for (let i = 0; i < 2; i += 1) {
            await Promise.all([harnessA.tick({ x: (i + 1) * 200, z: 0 }), harnessB.tick({ x: (i + 1) * 200, z: 0 })]);
            assert(harnessA.rows()[0].alreadySaved === true, `66.${i} Replica A stays Already saved on repeated tick ${i}.`);
            assert(harnessB.rows()[0].alreadySaved === false, `67.${i} Replica B stays Adopt on repeated tick ${i}.`);
        }

        console.log('✓ Section M: two independent replicas observing the exact identical claim correctly, stably report different statuses — Already saved for the one that persisted it, Adopt for the one that never did — because the status is explicitly local, never a shared or synchronized fact');
    }

    // -------------------------------------------------------------
    // Section N — FLAGSHIP: Nostr -> discovery -> proximity -> WorldView
    // rows -> hasPlaceNamingClaim() -> Already saved/Adopt ->
    // importPlaceNamingClaim() -> verification -> persistence -> fresh row
    // recomputation, end to end, with self-publishing, competing claims, a
    // failed adoption, and a World switch all woven through. No mocked
    // adoption/store boundary anywhere in this section.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const dave = makeIdentity('Dave');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing', x: 10, z: 0 }));
        world.addWorldRegion(region({ id: 'region-far', worldId, authorIdentityId: alice.identityId, name: 'Distant Hollow', x: 5000, z: 0 }));

        const bob = makeIdentity('Bob');
        const { session, claimStore, verifier, placeNamingClaimUseCase } = makeReplica(bob, { documents: [{ world }] });

        // Chapter 1 — Bob self-publishes his OWN opinion for "region-far"
        // (unrelated to anything discovered), then two competing, real,
        // independently-signed claims for "region-near" — one by Dave,
        // one by Alice — are discovered together over a real Nostr relay.
        const bobOwn = placeNamingClaimUseCase.publish(worldId, 'region-far', 'Bobs Own Name For Distant Hollow');

        const riverbend = signedClaim(dave, { worldId, regionId: 'region-near', name: 'Riverbend' });
        const millpond = signedClaim(alice, { worldId, regionId: 'region-near', name: 'Millpond' });
        const tagNear = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const tagFar = derivePlaceNamingDiscoveryTag(worldId, 'region-far');
        const relay = makeRelay((t) => {
            if (t === tagNear) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(riverbend), { tag: tagNear }), nostrEventFor(buildPlaceNamingDiscoveryEnvelope(millpond), { tag: tagNear })];
            if (t === tagFar) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(bobOwn), { tag: tagFar })];
            return [];
        });
        const harness = createHarness({ session, relay, proximityRadius: 100 });

        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows((id) => id);
        assert(rows.length === 2 && rows.every((r) => r.alreadySaved === false),
            '68. FLAGSHIP Ch.1 — real Nostr discovery + real proximity selection surfaces exactly the two NEAR, competing claims, neither yet saved; the far, self-published claim is out of proximity range and never enters this presentation at all.');

        // Chapter 2 — a FAILED adoption attempt on "Riverbend" (a
        // tampered signature) must leave it at Adopt, never an optimistic
        // transition, while "Millpond" remains completely unaffected.
        const riverbendRow = rows.find((r) => r.name === 'Riverbend');
        const tamperedRow = { ...riverbendRow, signature: { ...riverbendRow.signature, signature: tamperSignatureHex(riverbendRow.signature.signature) } };
        const failedAdopt = adoptNearbyPlaceNamingClaim(session, tamperedRow, makeFeedback());
        assert(failedAdopt === null, '69. FLAGSHIP Ch.2 — the tampered "Riverbend" package is refused by real verification.');
        // No new observation tick here — alreadySaved is recomputed fresh
        // on every rows() read regardless, exactly like the real
        // nearbyPlaceNamingClaimRows computed reruns without requiring a
        // brand-new discovery cycle.
        rows = harness.rows((id) => id);
        assert(rows.find((r) => r.name === 'Riverbend').alreadySaved === false, '70. FLAGSHIP Ch.2 — "Riverbend" remains at Adopt after the refused attempt.');
        assert(rows.find((r) => r.name === 'Millpond').alreadySaved === false, '71. FLAGSHIP Ch.2 — "Millpond" is untouched by the unrelated failed attempt on "Riverbend."');

        // Chapter 3 — Adopt "Riverbend" for real this time, through the
        // REAL importPlaceNamingClaim() boundary, then confirm it
        // genuinely, independently re-verifies and its own status flips.
        const adoptResult = adoptNearbyPlaceNamingClaim(session, rows.find((r) => r.name === 'Riverbend'), makeFeedback());
        assert(adoptResult && adoptResult.isNew === true && adoptResult.claim.authorIdentityId === dave.identityId,
            '72. FLAGSHIP Ch.3 — "Riverbend" adopts end to end through the real pipeline, correctly attributed to Dave, its real author.');
        const rehydratedVerify = verifier.verifyPlaceNamingClaim(claimStore.listForRegion(worldId, 'region-near').find((c) => c.id === riverbend.id).toJSON());
        assert(rehydratedVerify.valid === true, '73. FLAGSHIP Ch.3 — the adopted claim genuinely, independently re-verifies against the real, unmocked verifier.');
        // Again, a fresh rows() read (no new discovery tick) is what
        // proves recomputation-on-read — see Section D's own "reconstructed
        // from persistence, never remembered by the UI layer" proof.
        rows = harness.rows((id) => id);
        assert(rows.find((r) => r.name === 'Riverbend').alreadySaved === true, '74. FLAGSHIP Ch.3 — a fresh row recomputation now reports "Riverbend" as Already saved.');
        assert(rows.find((r) => r.name === 'Millpond').alreadySaved === false, '75. FLAGSHIP Ch.3 — "Millpond" remains independently, correctly at Adopt — no ranking emerged between the two competing claims.');

        // Chapter 4 — a World switch away, then back: both "Millpond"
        // (never adopted) and Bob's own self-published far claim must
        // present their correct, freshly-recomputed statuses after the
        // round trip.
        const worldElsewhere = new World({ id: 'world-elsewhere' });
        worldElsewhere.addWorldRegion(region({ id: 'region-elsewhere', worldId: 'world-elsewhere', authorIdentityId: alice.identityId, name: 'Elsewhere Region', x: 0, z: 0 }));
        session._loadedDocuments.set('world-elsewhere', { world: worldElsewhere });
        session._loadedDocuments.delete(worldId);
        await harness.tick({ x: 12345, z: 0 });
        assert(claimIds(harness).length === 0, '76. FLAGSHIP Ch.4 — with the original World fully unloaded, live presentation shows nothing from it at all.');

        session._loadedDocuments.set(worldId, { world });
        session._loadedDocuments.delete('world-elsewhere');
        await harness.tick({ x: 5000, z: 0 });
        rows = harness.rows((id) => id);
        const bobOwnRow = rows.find((r) => r.claimId === bobOwn.id);
        assert(bobOwnRow && bobOwnRow.alreadySaved === true,
            '77. FLAGSHIP Ch.4 — after returning to the original World and walking near "region-far," Bob\'s own self-published claim is discovered and correctly reports Already saved.');

        await harness.tick({ x: 0, z: 0 });
        rows = harness.rows((id) => id);
        const millpondRow = rows.find((r) => r.name === 'Millpond');
        assert(millpondRow && millpondRow.alreadySaved === false,
            '78. FLAGSHIP Ch.4 — "Millpond," never adopted throughout this entire chapter, still correctly reports Adopt after the World round trip.');
        const adoptMillpond = adoptNearbyPlaceNamingClaim(session, millpondRow, makeFeedback());
        assert(adoptMillpond && adoptMillpond.isNew === true, '79. FLAGSHIP Ch.4 — "Millpond" adopts successfully after the World round trip.');
        assert(claimStore.listForRegion(worldId, 'region-near').length === 2,
            '80. FLAGSHIP — both competing "region-near" claims now sit persisted side by side, each independently, correctly verified and never ranked against the other.');

        console.log('✓ Section N (FLAGSHIP): a real Nostr -> discovery -> proximity -> WorldView-shaped presentation -> hasPlaceNamingClaim() -> Already saved/Adopt -> importPlaceNamingClaim() -> real verification -> real persistence -> fresh row recomputation lifecycle holds end to end, correctly threading self-publishing, a failed adoption attempt, competing claims, and a World switch — with zero mocked adoption or store boundaries anywhere in the chain');
    }

    // -------------------------------------------------------------
    // Section O — the architectural freeze: WorldView infers alreadySaved
    // from nothing but hasPlaceNamingClaim(worldId, claimId) — never
    // authorIdentityId, the current viewer's own identity, discovery
    // source, claim text, signature presence, navigation state, or
    // previous button clicks — and no second source of truth exists
    // anywhere in the chain.
    // -------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));

        assert(!/adoptedClaimIds/.test(worldViewCode),
            '81. ui/views/WorldView.js defines no "adoptedClaimIds"-shaped second store of its own — every findable reference to a claim being known comes from session.hasPlaceNamingClaim(), never a UI-maintained list, still true one milestone later.');

        const rowsBlock = extractBetween(worldViewCode, 'const nearbyPlaceNamingClaimRows = computed(() => (', '));');
        assert(/alreadySaved:\s*session\.hasPlaceNamingClaim\(entry\.claim\.worldId,\s*entry\.claim\.id\)/.test(rowsBlock),
            '82. nearbyPlaceNamingClaimRows computes alreadySaved by calling session.hasPlaceNamingClaim(worldId, claimId) directly, inline, per row — the ONLY two arguments are the claim\'s own worldId and id.');

        // THE ARCHITECTURAL FREEZE — none of the following identity/
        // authority/UI-state signals this milestone's own brief named may
        // ever appear inside the row-computation block feeding
        // alreadySaved: not the current viewer's own identity, not
        // discovery-source vocabulary, not the claim's own text, not a
        // signature-presence check, not navigation state, not any memory
        // of a previous button click.
        for (const forbidden of [
            'currentIdentityId', 'viewerIdentityId', 'myIdentityId', '_identityProvider',
            'discoverySource', 'sourceType', 'fromNostr',
            'entry.claim.name ===', 'entry.claim.name.includes',
            'signature !=', 'signature ==', '!!entry.claim.signature', 'Boolean(entry.claim.signature)',
            'focusedRegionId', 'currentRegionId', 'navigationState',
            'clickedClaimIds', 'previouslyClicked', 'adoptClickCount'
        ]) {
            assert(!rowsBlock.includes(forbidden),
                `83. nearbyPlaceNamingClaimRows contains no '${forbidden}' — alreadySaved is never inferred from anything other than the store's own hasPlaceNamingClaim() answer.`);
        }

        assert(worldViewCode.includes('function hasPlaceNamingClaim') === false,
            '84. WorldView.js defines no LOCAL hasPlaceNamingClaim()-shaped function of its own — it only ever calls the session\'s.');

        const sessionCode = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(sessionCode.includes('hasPlaceNamingClaim(worldId, claimId) {'),
            '85. WorldNavigationSession exposes a real hasPlaceNamingClaim(worldId, claimId) method, still taking exactly those two arguments.');
        const sessionMethodBlock = extractBetween(sessionCode, 'hasPlaceNamingClaim(worldId, claimId) {', '\n\t}');
        assert(sessionMethodBlock.includes('this._placeNamingClaimUseCase.hasClaim(worldId, claimId)'),
            '86. the session method remains a thin pass-through to PlaceNamingClaimUseCase#hasClaim() — no independent lookup logic, no identity check, no discovery-source check of its own.');
        assert(!/_identityProvider|authorIdentityId|discoverySource/.test(sessionMethodBlock),
            '87. the session method\'s own body references none of the forbidden identity/discovery signals — it forwards exactly two arguments and returns exactly one boolean.');

        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        const useCaseMethodBlock = extractBetween(useCaseCode, 'hasClaim(worldId, claimId) {', '\n    }');
        assert(useCaseMethodBlock.includes('this._store.has(worldId, claimId)'),
            '88. PlaceNamingClaimUseCase#hasClaim() remains a thin pass-through to the EXISTING, UNMODIFIED LocalPlaceNamingClaimStore#has() — no new storage-layer capability was invented for this milestone or any since.');

        const storeSource = await rawSource('application/LocalPlaceNamingClaimStore.js');
        assert(!/getById|findById|getClaim\(/.test(storeSource),
            '89. LocalPlaceNamingClaimStore.js still exposes no getById()/findById()/getClaim() — no new storage-layer lookup capability has been added since 0.9.269.');

        // No ADOPTED domain state, no SELF_PUBLISHED/IMPORTED distinction,
        // and no preference/ranking vocabulary anywhere in the file —
        // exactly the exclusions this milestone's own brief named.
        for (const forbidden of ['ADOPTED', 'SELF_PUBLISHED', 'IMPORTED_CLAIM', 'adoptionRank', 'preferenceScore']) {
            assert(!worldViewCode.includes(forbidden), `90. ui/views/WorldView.js contains no '${forbidden}' — no new domain state or ranking vocabulary was introduced.`);
        }

        console.log('✓ Section O: alreadySaved is derived, end to end, from nothing but session.hasPlaceNamingClaim(worldId, claimId) — never authorIdentityId, the current viewer\'s own identity, discovery source, claim text, signature presence, navigation state, or previous button clicks — and one unbroken chain of thin pass-throughs onto the pre-existing LocalPlaceNamingClaimStore#has() remains the ONLY source of truth anywhere in this codebase');
    }

    console.log('\n✅ All Place Naming Adoption Status Lifecycle Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
