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
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';

// 0.9.267 — Nearby Place Naming Metadata Presentation Lifecycle Audit.
//
// This milestone adds NO new capability. It is a **test-only lifecycle
// audit** of the ONE new, purely presentational field 0.9.266 (Nearby
// Place Naming Claim Metadata Presentation) added: `createdAtLabel`, a
// pure display string derived from an already-carried `createdAt`.
// tests/PlaceNamingNearbyMetadataPresentation.test.js already proved this
// field's semantics in isolation, one call at a time, against statically
// constructed rows: rendering, degradation, no ranking, no World
// mutation, Navigate/Adopt independence, and the preserved verification
// boundary. This file does not re-derive any of that — it is cited, not
// repeated. What it proves instead is what happens across a *lifecycle*:
// a running `PlaceNamingDiscoveryMonitor` observing repeatedly, movement
// across a proximity boundary, discovery refreshing and failing, a
// replica adopting under a live pipeline, a World switching away and
// back, and delayed/out-of-order discovery responses racing an unmount —
// the exact lifecycle questions
// `tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js` (0.9.264) asked
// of *adoption*, asked here of *metadata presentation* instead.
//
// THE INVARIANT THIS FILE EXISTS TO FREEZE (this milestone's own brief,
// verbatim):
//
//   `createdAtLabel` is presentation derived from `createdAt`; it is
//   never an authority, input, or alternate source of truth.
//
// THE REAL PRODUCTION CHAIN, WITH ONLY THE RELAY CONTROLLED — the same
// restraint 0.9.258/0.9.261/0.9.264 already hold: every live-pipeline
// section below drives a REAL `NostrPlaceNamingDiscoverySource`, a REAL
// `composePlaceNamingDiscoveryRuntime()`, the REAL
// `executeDiscoverPlaceNamingClaimsCommand()`, a REAL
// `PlaceNamingDiscoveryMonitor`, and a REAL, full `WorldNavigationSession`
// — because Adopt itself needs the real `importPlaceNamingClaim()` this
// audit's Section I is testing. `formatNearbyPlaceNamingCreatedAt()`/
// `makeRows()`/`adoptNearbyPlaceNamingClaim()`/
// `navigateToNearbyPlaceNamingClaim()` below are the SAME reproductions
// tests/PlaceNamingNearbyMetadataPresentation.test.js and
// tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js already
// established and whose own Section N/Q already proved match
// `ui/views/WorldView.js`'s real wiring byte-for-byte — this file reuses
// that proof rather than re-deriving it (Section N's own lightweight
// tripwire re-confirms only what THIS milestone's own brief names).
//
//   Section A — initial presentation, live: valid timestamps produce the
//               expected label while raw createdAt stays byte-for-byte
//               unchanged, across repeated observation cycles
//   Section B — invalid/unusual timestamp degradation, live: a
//               post-signing-tampered createdAt degrades gracefully
//               through the real pipeline; a genuinely missing createdAt
//               never even reaches presentation; unusual-but-valid dates
//               (epoch, far future) round-trip and adopt correctly
//   Section C — discovery refresh atomicity, live: a newer observation
//               fully replaces a row's metadata — never a mixture of a
//               new claim with a stale label
//   Section D — movement across a proximity boundary (inside -> outside
//               -> inside): metadata follows the current discovery
//               result, never accumulating
//   Section E — multiple claims, live: discovery order is preserved
//               exactly, never resorted by createdAt/author, across
//               repeated and reordered observation cycles
//   Section F — competing claims ("Riverside"/Alice, "Old River"/Bob),
//               live: both remain equally, independently presented and
//               independently adoptable
//   Section G — World switching (A -> B -> A), live: no metadata survives
//               from the wrong World, and nothing is cached across the
//               switch
//   Section H — Navigate remains fully independent of createdAtLabel,
//               live and structural
//   Section I — Adopt remains fully independent of createdAtLabel, live:
//               a corrupted label never influences the persisted claim's
//               real createdAt
//   Section J — the verification boundary: rendering metadata calls the
//               real verifier zero times across repeated live
//               observation cycles — it is only ever called by Adopt
//   Section K — persistence independence: an adopted claim's own
//               createdAt survives its row's disappearance from live
//               discovery; a persisted claim never carries a
//               createdAtLabel of its own
//   Section L — unmount/race: a slow, superseded discovery response, an
//               unmounted view, and a World switch mid-flight can never
//               resurrect stale metadata
//   Section M — FLAGSHIP: real Nostr -> discovery -> proximity ->
//               WorldView-shaped presentation -> createdAt formatting ->
//               Adopt -> real verification -> real persistence, with
//               movement, competing claims, and a World switch woven in
//   Section N — structural regression: the formatter stays pure, and no
//               new domain state, verification call, ranking call, or
//               World mutation was introduced

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

// A full, real WorldNavigationSession and its complete Place Naming
// collaborator graph — identical to
// tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js#makeReplica().
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

// A real, independently-signed PlaceNamingClaim.
function signedClaim(identity, { worldId, regionId, name, createdAt }) {
    let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId: identity.identityId, createdAt });
    claim = claim.withSignature(identity.signCanonical(claim.getSigningDescriptor()));
    return claim;
}

// Round-trips `claim` through the exact real discovery-envelope shape
// genuine Nostr discovery already produces.
function discoverAsEnvelope(claim) {
    const built = buildPlaceNamingDiscoveryEnvelope(claim);
    return parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
}

// EXACTLY ui/views/WorldView.js#formatNearbyPlaceNamingCreatedAt() — see
// tests/PlaceNamingNearbyMetadataPresentation.test.js's own Section N
// proof that this reproduction matches the real file, reused here rather
// than re-derived.
function formatNearbyPlaceNamingCreatedAt(createdAt) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

// EXACTLY ui/views/WorldView.js's own (0.9.263/0.9.266-widened)
// `nearbyPlaceNamingClaimRows` computed.
function makeRows(entries, resolveDisplayName) {
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
        signature: entry.claim.signature
    }));
}

function makeFeedback() {
    const messages = [];
    return { messages, show: (message) => messages.push(message) };
}

// Reproduces EXACTLY ui/views/WorldView.js's own `guarded()`.
function guardedCall(fn, feedback) {
    try {
        return fn();
    } catch (err) {
        feedback.show(err.message);
        return undefined;
    }
}

// Reproduces EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim() —
// same reshaping (row.createdAt/row.signature/row.authorIdentityId, NEVER
// row.createdAtLabel), same call order, same duplicate-vs-new feedback
// split.
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

// Reproduces EXACTLY ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim().
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

// Produces a same-length, still-valid-hex, but genuinely different
// signature value — reversing the original hex string.
function tamperSignatureHex(hex) {
    return hex.split('').reverse().join('');
}

// ---------------------------------------------------------------------
// Full real-pipeline harness — mirrors
// tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js#createHarness()
// exactly, widened only to carry createdAtLabel through `rows()`.
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

// A controllable, manually-resolved response — used only by Section L to
// construct a "slow" observation cycle whose completion this file decides
// explicitly, rather than the microtask queue.
function makeDeferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
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
        return makeRows(refs.nearbyPlaceNamingClaims, resolveDisplayName);
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
    console.log('Running Nearby Place Naming Metadata Presentation Lifecycle Audit tests...\n');

    // -------------------------------------------------------------
    // Section A — initial presentation, live: valid timestamps produce
    // the expected label while raw createdAt stays byte-for-byte
    // unchanged, across repeated observation cycles.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing', x: 10, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob, { documents: [{ world }] });

        const createdAt = new Date('2026-03-14T00:00:00.000Z');
        const claim = signedClaim(alice, { worldId, regionId: 'region-near', name: 'Riverbend', createdAt });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        let row = harness.rows((id) => `display:${id}`)[0];
        assert(row.createdAtLabel === createdAt.toLocaleDateString(),
            '1a. a real, live-discovered claim\'s createdAtLabel matches its own real createdAt, formatted.');
        assert(row.createdAt === claim.toJSON().createdAt,
            '1b. the row\'s raw createdAt is byte-for-byte identical to the signed claim\'s own ISO timestamp.');
        assert(row.authorDisplayName === `display:${alice.identityId}`, '1c. sanity: authorship also resolves correctly on the same row.');

        // 2. A SECOND observation cycle, same position (no genuine
        // movement) — createdAtLabel remains identical, never drifting or
        // being recomputed to a different value tick over tick.
        await harness.tick({ x: 0, z: 0 });
        row = harness.rows((id) => `display:${id}`)[0];
        assert(row.createdAtLabel === createdAt.toLocaleDateString() && row.createdAt === claim.toJSON().createdAt,
            '2. a second, identical observation cycle reproduces the exact same label and raw createdAt — presentation is a pure recomputation, not a first-tick-only snapshot.');

        console.log('✓ Section A: a live-discovered claim\'s createdAtLabel/createdAt are correct on first observation and stable across a repeated one');
    }

    // -------------------------------------------------------------
    // Section B — invalid/unusual timestamp degradation, live.
    // -------------------------------------------------------------
    {
        // B1 — a discovery envelope whose createdAt was tampered with
        // AFTER signing (a hostile relay, exactly like
        // tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js's own
        // Section G2 content-tampering vector, applied to createdAt
        // instead of name) reaches a REAL, live monitor tick. A claim can
        // never be legitimately SIGNED with a genuinely unparseable
        // createdAt — core/PlaceNamingClaim.js#toJSON() calls
        // `this._createdAt.toISOString()`, which throws on an invalid
        // Date — so the only way an unparseable value reaches
        // presentation at all is exactly this: tampering the envelope
        // after the fact.
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Mystery Cove Region', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Mystery Cove' });
        const builtEnvelope = buildPlaceNamingDiscoveryEnvelope(claim);
        const tamperedEnvelope = { ...builtEnvelope, claim: { ...builtEnvelope.claim, createdAt: 'not-a-real-timestamp' } };
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(tamperedEnvelope, { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 1, '3. sanity: shape validation accepts a non-empty-but-unparseable createdAt string through the real, live pipeline.');
        const row = harness.rows((id) => id)[0];
        assert(row.createdAtLabel === '', '4. B1 — through a REAL, live discovery cycle, an unparseable createdAt degrades to an empty label, never throwing and never removing the row.');
        assert(row.name === 'Mystery Cove' && row.authorDisplayName === alice.identityId,
            '5. B1 — the rest of the row remains completely usable: name and author still render correctly.');

        // 6. B1 continued — Adopt on this SAME row is correctly refused,
        // but for the REAL reason (signature no longer matches tampered
        // content), never because of the empty label — proving the
        // degraded label and adoption's own real refusal are two entirely
        // independent facts about the same row.
        const adoptResult = adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(adoptResult === null && claimStore.listForRegion(worldId, 'region-1').length === 0,
            '6. B1 — Adopt on the tampered row is refused by real verification (the tampered createdAt invalidates the original signature) — nothing is persisted, exactly like any other content tampering.');

        // B2 — unusual, but genuinely VALID, dates: the Unix epoch and a
        // far-future date. Both are legitimately signable (a real,
        // non-throwing toISOString()) and must round-trip through the
        // live pipeline AND adopt successfully, with the correct,
        // non-empty label.
        for (const [label, createdAt] of [['epoch', new Date(0)], ['far future', new Date('2999-01-01T00:00:00.000Z')]]) {
            const carol = makeIdentity('Carol');
            const worldB = new World({ id: 'world-unusual' });
            worldB.addWorldRegion(region({ id: 'region-1', worldId: 'world-unusual', authorIdentityId: carol.identityId, name: 'Unusual Region', x: 0, z: 0 }));
            const dave = makeIdentity('Dave');
            const { session: sessionB, claimStore: storeB } = makeReplica(dave, { documents: [{ world: worldB }] });
            const unusualClaim = signedClaim(carol, { worldId: 'world-unusual', regionId: 'region-1', name: `Claim (${label})`, createdAt });
            const tagB = derivePlaceNamingDiscoveryTag('world-unusual', 'region-1');
            const relayB = makeRelay((t) => (t === tagB ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(unusualClaim), { tag: tagB })] : []));
            const harnessB = createHarness({ session: sessionB, relay: relayB });

            await harnessB.tick({ x: 0, z: 0 });
            const rowB = harnessB.rows((id) => id)[0];
            assert(rowB.createdAtLabel === createdAt.toLocaleDateString() && rowB.createdAtLabel.length > 0,
                `7. B2 (${label}) — an unusual-but-valid createdAt formats to a genuine, non-empty label through the real, live pipeline.`);

            const adoptB = adoptNearbyPlaceNamingClaim(sessionB, rowB, makeFeedback());
            assert(adoptB && adoptB.isNew === true && adoptB.claim.toJSON().createdAt === createdAt.toISOString(),
                `8. B2 (${label}) — Adopt succeeds, and the persisted claim's createdAt is byte-identical to the original unusual (but valid) date.`);
            assert(storeB.listForRegion('world-unusual', 'region-1').length === 1,
                `9. B2 (${label}) — exactly one claim is genuinely persisted.`);
        }

        // B3 — a genuinely MISSING createdAt never reaches presentation
        // at all: core/PlaceNamingDiscoveryEnvelope.js's own required-
        // string-field shape validation rejects it at the discovery
        // boundary itself, before any monitor, proximity selection, or
        // row ever sees it.
        const missingCreatedAtJSON = { ...claim.toJSON() };
        delete missingCreatedAtJSON.createdAt;
        const rejectedEnvelope = parsePlaceNamingDiscoveryEnvelope({
            protocol: 'forkbuild-place-naming-discovery', version: 1,
            worldId, regionId: 'region-1', claim: missingCreatedAtJSON
        });
        assert(rejectedEnvelope === null, '10. B3 — a discovery envelope missing createdAt entirely is rejected by shape validation, never reaching a monitor or a presented row.');

        console.log('✓ Section B: a tampered createdAt degrades gracefully through a real, live pipeline without corrupting the row or being confused with adoption\'s own separate refusal; unusual-but-valid dates round-trip and adopt correctly; a genuinely missing createdAt never reaches presentation at all');
    }

    // -------------------------------------------------------------
    // Section C — discovery refresh atomicity, live: a newer observation
    // fully replaces a row's metadata — never a mixture of a new claim
    // with a stale label.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Refresh Region', x: 0, z: 0 }));
        const carol = makeIdentity('Carol');
        const { session } = makeReplica(carol, { documents: [{ world }] });

        const firstClaim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'First Name', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const secondClaim = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Second Name', createdAt: new Date('2026-06-01T00:00:00.000Z') });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        let mode = 'first';
        const relay = makeRelay((t) => {
            if (t !== tag) return [];
            if (mode === 'first') return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(firstClaim), { tag })];
            if (mode === 'second') return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(secondClaim), { tag })];
            return [];
        });
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        let row = harness.rows((id) => id)[0];
        assert(row.name === 'First Name' && row.authorDisplayName === alice.identityId && row.createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(),
            '11. the first observation\'s own metadata is fully presented.');

        mode = 'second';
        await harness.tick({ x: 500, z: 0 });
        row = harness.rows((id) => id)[0];
        assert(row.name === 'Second Name' && row.authorDisplayName === bob.identityId && row.createdAtLabel === new Date('2026-06-01T00:00:00.000Z').toLocaleDateString(),
            '12. THE CORE ATOMICITY CHECK — a refreshed observation replaces name, author, AND createdAtLabel together, never a mixture: the row never carries "Second Name" alongside the FIRST claim\'s own label or author.');
        assert(row.createdAt === secondClaim.toJSON().createdAt, '13. the raw createdAt also fully switched to the second claim\'s own value.');

        mode = 'gone';
        await harness.tick({ x: 1000, z: 0 });
        assert(claimIds(harness).length === 0, '14. the claim disappearing from discovery entirely removes the row atomically — no stale metadata lingers as an empty-but-present row.');

        mode = 'first';
        await harness.tick({ x: 1500, z: 0 });
        row = harness.rows((id) => id)[0];
        assert(row.name === 'First Name' && row.createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString() && row.authorDisplayName === alice.identityId,
            '15. a claim reappearing after having vanished presents its OWN fresh metadata, never anything retained from the second claim that had displaced it in between.');

        console.log('✓ Section C: a refreshed live discovery observation replaces a row\'s entire metadata set atomically — never a mixture of a new claim with a stale label from a previous observation');
    }

    // -------------------------------------------------------------
    // Section D — movement across a proximity boundary (inside -> outside
    // -> inside): metadata follows the current discovery result, never
    // accumulating.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Boundary Region', x: 100, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob, { documents: [{ world }] });

        const createdAt = new Date('2026-04-01T00:00:00.000Z');
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Boundary Claim', createdAt });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const PROXIMITY_RADIUS = 50;
        const harness = createHarness({ session, relay, proximityRadius: PROXIMITY_RADIUS });

        // OUTSIDE — far from the region (distance >> 50).
        await harness.tick({ x: 100, z: 5000 });
        assert(claimIds(harness).length === 0, '16. starting OUTSIDE the proximity boundary, the claim is not presented at all.');

        // INSIDE — well within the region's own proximity radius.
        await harness.tick({ x: 100, z: 10 });
        assert(claimIds(harness).length === 1, '17. moving INSIDE the boundary, the claim now presents.');
        let row = harness.rows((id) => id)[0];
        assert(row.createdAtLabel === createdAt.toLocaleDateString() && row.createdAt === claim.toJSON().createdAt,
            '18. the newly-presented row\'s metadata matches the claim\'s own real createdAt.');

        // OUTSIDE again.
        await harness.tick({ x: 100, z: 5000 });
        assert(claimIds(harness).length === 0, '19. moving back OUTSIDE, the row disappears again — metadata is not retained for an out-of-range claim.');

        // INSIDE again — the row must reappear with the SAME metadata,
        // never duplicated (array length exactly 1, not 2) and never
        // showing any drift from having been observed, lost, and
        // re-observed.
        await harness.tick({ x: 100, z: 10 });
        assert(claimIds(harness).length === 1, '20. moving back INSIDE a second time, the row reappears — exactly one entry, never accumulated from the earlier inside/outside cycle.');
        row = harness.rows((id) => id)[0];
        assert(row.createdAtLabel === createdAt.toLocaleDateString() && row.createdAt === claim.toJSON().createdAt,
            '21. the reappeared row\'s metadata is identical to the first time it was inside the boundary — crossing the boundary twice never mutates or duplicates the underlying claim\'s own createdAt.');

        console.log('✓ Section D: metadata strictly follows the current inside/outside proximity state across repeated boundary crossings — it is never retained, accumulated, or duplicated');
    }

    // -------------------------------------------------------------
    // Section E — multiple claims, live: discovery order is preserved
    // exactly, never resorted by createdAt/author, across repeated and
    // reordered observation cycles.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Multi-Claim Region', x: 0, z: 0 }));
        const dave = makeIdentity('Dave');
        const { session } = makeReplica(dave, { documents: [{ world }] });

        // Deliberately NOT chronological: the NEWEST claim is discovered
        // FIRST, the OLDEST discovered LAST — if ordering were ever
        // secretly driven by createdAt, this arrangement would expose it
        // immediately.
        const newest = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Newest', createdAt: new Date('2026-06-01T00:00:00.000Z') });
        const middle = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Middle', createdAt: new Date('2026-03-01T00:00:00.000Z') });
        const oldest = signedClaim(carol, { worldId, regionId: 'region-1', name: 'Oldest', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        let order = [newest, middle, oldest];
        const relay = makeRelay((t) => (t === tag ? order.map((c) => nostrEventFor(buildPlaceNamingDiscoveryEnvelope(c), { tag })) : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows((id) => id);
        assert(rows.length === 3 && rows[0].name === 'Newest' && rows[1].name === 'Middle' && rows[2].name === 'Oldest',
            '22. discovery order (newest-first, oldest-last) is preserved exactly — never resorted chronologically by createdAt.');

        // 23. A SECOND, identical observation cycle reproduces the exact
        // same order — stability, not merely a first-tick accident.
        await harness.tick({ x: 500, z: 0 });
        rows = harness.rows((id) => id);
        assert(rows[0].name === 'Newest' && rows[1].name === 'Middle' && rows[2].name === 'Oldest',
            '23. a second, repeated observation cycle preserves the identical order.');

        // 24. Reordering the RELAY's own returned events (as a real relay
        // legitimately could, tick to tick) changes the presented order
        // to match the NEW discovery order exactly — proving order tracks
        // live discovery, not some independently memoized, createdAt- or
        // name-driven sort.
        order = [oldest, newest, middle];
        await harness.tick({ x: 1000, z: 0 });
        rows = harness.rows((id) => id);
        assert(rows[0].name === 'Oldest' && rows[1].name === 'Newest' && rows[2].name === 'Middle',
            '24. reordering the relay\'s own returned events changes the presented order to match, exactly — presentation order is discovery order, live, never an independent sort by createdAt or name.');

        // 25. Each row's own createdAtLabel still corresponds to ITS OWN
        // claim, regardless of position — no cross-contamination between
        // rows introduced by the reordering.
        const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
        assert(byName['Oldest'].createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(), '25a. "Oldest" carries its own label regardless of position.');
        assert(byName['Newest'].createdAtLabel === new Date('2026-06-01T00:00:00.000Z').toLocaleDateString(), '25b. "Newest" carries its own label regardless of position.');
        assert(byName['Middle'].createdAtLabel === new Date('2026-03-01T00:00:00.000Z').toLocaleDateString(), '25c. "Middle" carries its own label regardless of position.');

        console.log('✓ Section E: discovery order is preserved exactly, tick after tick, and still tracks a genuinely reordered relay response — createdAt/author metadata never drives or influences ordering');
    }

    // -------------------------------------------------------------
    // Section F — competing claims ("Riverside"/Alice, "Old River"/Bob),
    // live: both remain equally, independently presented and
    // independently adoptable.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Unclaimed Crossing', x: 0, z: 0 }));
        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol, { documents: [{ world }] });

        const riverside = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Riverside', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const oldRiver = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Old River', createdAt: new Date('2026-03-15T00:00:00.000Z') });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(riverside), { tag }), nostrEventFor(buildPlaceNamingDiscoveryEnvelope(oldRiver), { tag })]
            : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows((id) => (id === alice.identityId ? 'Alice' : 'Bob'));
        assert(rows.length === 2, '26. both competing, live-discovered claims are presented, neither dropped.');
        const riversideRow = rows.find((r) => r.name === 'Riverside');
        const oldRiverRow = rows.find((r) => r.name === 'Old River');
        assert(riversideRow.authorDisplayName === 'Alice' && riversideRow.createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(),
            '27. "Riverside — Alice — <date>" renders in full through the live pipeline.');
        assert(oldRiverRow.authorDisplayName === 'Bob' && oldRiverRow.createdAtLabel === new Date('2026-03-15T00:00:00.000Z').toLocaleDateString(),
            '28. "Old River — Bob — <date>" renders in full, alongside Riverside, never in place of it.');
        assert(!('score' in riversideRow) && !('rank' in riversideRow) && !('score' in oldRiverRow) && !('rank' in oldRiverRow),
            '29. neither row carries a score/rank field — live presentation never introduces a preference between competing claims.');

        // 30. Adopting one leaves the other's own live metadata completely
        // unaffected on a SUBSEQUENT observation cycle.
        const adoptRiverside = adoptNearbyPlaceNamingClaim(session, riversideRow, makeFeedback());
        assert(adoptRiverside.isNew === true, '30. "Riverside" adopts successfully.');
        await harness.tick({ x: 50, z: 0 });
        rows = harness.rows((id) => (id === alice.identityId ? 'Alice' : 'Bob'));
        const oldRiverRowAfter = rows.find((r) => r.name === 'Old River');
        assert(oldRiverRowAfter.createdAtLabel === new Date('2026-03-15T00:00:00.000Z').toLocaleDateString() && oldRiverRowAfter.authorDisplayName === 'Bob',
            '31. "Old River"\'s own metadata is completely unaffected by "Riverside" having been adopted in the meantime — a LATER observation cycle still presents it, fully and correctly, independent of the other claim\'s own fate.');
        const secondAdopt = adoptNearbyPlaceNamingClaim(session, oldRiverRowAfter, makeFeedback());
        assert(secondAdopt.isNew === true && claimStore.listForRegion(worldId, 'region-1').length === 2,
            '32. "Old River" remains fully, independently adoptable, with both claims now persisted side by side.');

        console.log('✓ Section F: "Riverside"/"Old River" remain equally, independently presented and independently adoptable across live observation cycles, with no ranking or cross-influence ever emerging');
    }

    // -------------------------------------------------------------
    // Section G — World switching (A -> B -> A), live: no metadata
    // survives from the wrong World, and nothing is cached across the
    // switch.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldOld = new World({ id: 'world-old' });
        worldOld.addWorldRegion(region({ id: 'region-1', worldId: 'world-old', authorIdentityId: alice.identityId, name: 'Old World Region', x: 0, z: 0 }));
        const worldNew = new World({ id: 'world-new' });
        worldNew.addWorldRegion(region({ id: 'region-1', worldId: 'world-new', authorIdentityId: bob.identityId, name: 'New World Region', x: 0, z: 0 }));

        const carol = makeIdentity('Carol');
        const { session } = makeReplica(carol, { documents: [{ world: worldOld }] });

        const oldClaim = signedClaim(alice, { worldId: 'world-old', regionId: 'region-1', name: 'Old World Place', createdAt: new Date('2025-01-01T00:00:00.000Z') });
        const newClaim = signedClaim(bob, { worldId: 'world-new', regionId: 'region-1', name: 'New World Place', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const tagOld = derivePlaceNamingDiscoveryTag('world-old', 'region-1');
        const tagNew = derivePlaceNamingDiscoveryTag('world-new', 'region-1');
        const relay = makeRelay((t) => {
            if (t === tagOld) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(oldClaim), { tag: tagOld })];
            if (t === tagNew) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(newClaim), { tag: tagNew })];
            return [];
        });
        const harness = createHarness({ session, relay });

        // World A ("world-old") is loaded.
        await harness.tick({ x: 0, z: 0 });
        let row = harness.rows((id) => id)[0];
        assert(row.worldId === 'world-old' && row.createdAtLabel === new Date('2025-01-01T00:00:00.000Z').toLocaleDateString() && row.authorDisplayName === alice.identityId,
            '33. while "world-old" is the loaded World, its own claim\'s metadata is presented correctly.');

        // Switch to World B ("world-new").
        session._loadedDocuments.delete('world-old');
        session._loadedDocuments.set('world-new', { world: worldNew });
        await harness.tick({ x: 500, z: 0 });
        row = harness.rows((id) => id)[0];
        assert(row.worldId === 'world-new' && row.createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString() && row.authorDisplayName === bob.identityId,
            '34. after switching to "world-new," ONLY its own claim\'s metadata is presented — "world-old"\'s own date/author are nowhere in it.');
        assert(row.createdAtLabel !== new Date('2025-01-01T00:00:00.000Z').toLocaleDateString(),
            '35. THE NEGATIVE CHECK — the new row\'s label is genuinely not the old World\'s own date.');

        // Switch BACK to World A.
        session._loadedDocuments.delete('world-new');
        session._loadedDocuments.set('world-old', { world: worldOld });
        await harness.tick({ x: 1000, z: 0 });
        row = harness.rows((id) => id)[0];
        assert(row.worldId === 'world-old' && row.createdAtLabel === new Date('2025-01-01T00:00:00.000Z').toLocaleDateString() && row.authorDisplayName === alice.identityId,
            '36. switching BACK to "world-old" presents its own metadata again, freshly recomputed — never a stale value cached from before the round trip, and never anything leaked from "world-new."');

        console.log('✓ Section G: switching World A -> World B -> World A never leaks the wrong World\'s author/createdAt metadata at any point, and nothing about the presentation is cached across a switch');
    }

    // -------------------------------------------------------------
    // Section H — Navigate remains fully independent of createdAtLabel,
    // live and structural.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Kestrel Point Region', x: 20, z: 30 }));
        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob, { documents: [{ world }] });

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Kestrel Point' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows((id) => id)[0];

        let focusCalls = [];
        const realFocus = session.focusLocation.bind(session);
        session.focusLocation = (id) => { focusCalls.push(id); return realFocus(id); };

        const result = navigateToNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(result === true && focusCalls.length === 1 && focusCalls[0] === 'region-1',
            '37. Navigate targets the exact claimed region through the real, live pipeline, unaffected by the row also carrying createdAtLabel.');

        // 38. A row whose createdAtLabel was corrupted (the Section B
        // degraded case) navigates identically — Navigate never reads
        // createdAtLabel at all.
        focusCalls = [];
        const corruptedRow = { ...row, createdAtLabel: 'TOTALLY WRONG DATE' };
        const result2 = navigateToNearbyPlaceNamingClaim(session, corruptedRow, makeFeedback());
        assert(result2 === true && focusCalls.length === 1 && focusCalls[0] === 'region-1',
            '38. Navigate behaves identically for a row whose createdAtLabel is corrupted or nonsensical — the field is display-only and never consulted.');

        // 39. Structural proof, direct from real source.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const navigateBlock = extractBetween(worldViewCode, 'function navigateToNearbyPlaceNamingClaim(row) {', '\n        }');
        assert(!/createdAtLabel/.test(navigateBlock), '39. navigateToNearbyPlaceNamingClaim() contains no reference to createdAtLabel whatsoever, structurally.');

        console.log('✓ Section H: Navigate remains entirely unaffected by createdAtLabel, live and structurally, however corrupted or nonsensical its value');
    }

    // -------------------------------------------------------------
    // Section I — Adopt remains fully independent of createdAtLabel,
    // live: a corrupted label never influences the persisted claim's real
    // createdAt.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Willowmere Region', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore, verifier } = makeReplica(bob, { documents: [{ world }] });

        const originalCreatedAt = new Date('2026-02-02T00:00:00.000Z');
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Willowmere', createdAt: originalCreatedAt });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows((id) => id)[0];

        // 40. THE CORE CHECK — the row's own createdAtLabel is corrupted
        // to a deliberately wrong, nonsensical string BEFORE Adopt is
        // called. Only createdAtLabel is touched; createdAt/signature are
        // left exactly as discovery produced them.
        const tamperedLabelRow = { ...row, createdAtLabel: 'THIS LABEL IS DELIBERATELY WRONG' };
        const result = adoptNearbyPlaceNamingClaim(session, tamperedLabelRow, makeFeedback());
        assert(result && result.isNew === true, '40. Adopt succeeds through the real, live pipeline even when the row\'s own displayed label was corrupted.');
        assert(result.claim.toJSON().createdAt === originalCreatedAt.toISOString(),
            '41. THE CORE CHECK — the persisted claim\'s own createdAt is the row\'s RAW createdAt, byte-for-byte, completely unaffected by the corrupted createdAtLabel sitting right next to it.');

        // 42. Re-read straight from the real store, independent of the
        // in-memory return value.
        const stored = claimStore.listForRegion(worldId, 'region-1').find((c) => c.id === claim.id);
        assert(stored.toJSON().createdAt === originalCreatedAt.toISOString(),
            '42. re-read from the real store, the persisted createdAt is still the original, correct value — never anything derived from the tampered label.');

        // 43. The persisted claim still genuinely re-verifies — corrupting
        // a display-only field never touches signature verification.
        const stillVerifies = verifier.verifyPlaceNamingClaim(stored.toJSON());
        assert(stillVerifies.valid === true, '43. the adopted claim still independently verifies against the real, unmodified verifier.');

        console.log('✓ Section I: Adopt continues to rehydrate strictly from the row\'s own raw createdAt through the real, live pipeline — a deliberately corrupted createdAtLabel can never influence the persisted claim');
    }

    // -------------------------------------------------------------
    // Section J — the verification boundary: rendering metadata calls the
    // real verifier zero times across repeated live observation cycles —
    // it is only ever called by Adopt.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Verification Boundary Region', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, verifier } = makeReplica(bob, { documents: [{ world }] });

        let verifyCalls = 0;
        const realVerify = verifier.verifyPlaceNamingClaim.bind(verifier);
        verifier.verifyPlaceNamingClaim = (record) => { verifyCalls += 1; return realVerify(record); };

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Verification Boundary Claim' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });

        for (let i = 0; i < 4; i += 1) {
            await harness.tick({ x: i * 500, z: 0 });
            harness.rows((id) => id); // force-computes createdAtLabel for every presented row
        }
        assert(verifyCalls === 0,
            '44. THE CORE VERIFICATION-BOUNDARY CHECK — across four independent, real, live discovery/proximity/presentation cycles, the real verifier was called ZERO times: displaying createdAt (or any other row field) never invokes verification.');

        // 45. Adopt is the ONLY thing that calls it — and calls it exactly
        // once for the one row actually adopted.
        const row = harness.rows((id) => id)[0];
        const adoptResult = adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(adoptResult && adoptResult.isNew === true && verifyCalls === 1,
            '45. Adopt calls the real verifier exactly once — confirming the zero count above was a genuine absence, not an instrumentation error.');

        console.log('✓ Section J: the real verifier is called zero times by live discovery/proximity/presentation, and exactly once by Adopt — displaying createdAt never crosses into verification');
    }

    // -------------------------------------------------------------
    // Section K — persistence independence: an adopted claim's own
    // createdAt survives its row's disappearance from live discovery; a
    // persisted claim never carries a createdAtLabel of its own.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Meadow Rest Region', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore, storage } = makeReplica(bob, { documents: [{ world }] });

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Meadow Claim', createdAt: new Date('2026-05-05T00:00:00.000Z') });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        const adoptResult = adoptNearbyPlaceNamingClaim(session, harness.rows((id) => id)[0], makeFeedback());
        assert(adoptResult.isNew === true, '46. sanity: the claim adopts successfully.');

        // 47. The persisted, on-disk (in-memory-storage-provider) record
        // itself is genuinely inspected: it carries createdAt as real
        // JSON, and it never carries a createdAtLabel field — that field
        // exists only in a transient, in-memory presentation row, never
        // in what LocalPlaceNamingClaimStore actually serializes.
        const persistedRaw = storage.load(`place-naming-claims:${worldId}`);
        const persistedRecord = Object.values(persistedRaw).find((c) => c.id === claim.id);
        assert(persistedRecord.createdAt === claim.toJSON().createdAt, '47a. the persisted record\'s own createdAt is correct, genuine JSON.');
        assert(!('createdAtLabel' in persistedRecord), '47b. THE CORE CHECK — the persisted record carries NO createdAtLabel field at all: presentation formatting never leaks into storage.');

        // The claim then disappears from live discovery entirely (the
        // author retracted it from the relay, or the Wanderer moved out
        // of range) — a later observation no longer presents it.
        relay.setHandler(() => []);
        await harness.tick({ x: 999999, z: 999999 });
        assert(claimIds(harness).length === 0, '48. the claim genuinely vanishes from live presentation.');

        // 49. THE CORE INDEPENDENCE CHECK — the persisted, adopted claim
        // is entirely unaffected: its own createdAt survives, still
        // correct, in this replica's own store, independent of the row
        // that led to its adoption having disappeared from view.
        const survived = claimStore.listForRegion(worldId, 'region-1').find((c) => c.id === claim.id);
        assert(survived && survived.toJSON().createdAt === claim.toJSON().createdAt,
            '49. the adopted claim\'s own createdAt remains fully intact in this replica\'s own persistence after the discovered row that led to its adoption vanishes from presentation entirely.');
        const view = deriveNamingView('region-1', claimStore.list(worldId));
        assert(view.length === 1 && view[0].name === 'Meadow Claim',
            '50. namingView() — this replica\'s own authoritative reading — is completely unaffected by the presentation-layer disappearance.');

        // 51. If the SAME claim is re-discovered later (the relay resumes
        // broadcasting it), a freshly recomputed row's own createdAtLabel
        // is derived fresh from the claim's real createdAt — never from
        // anything the store itself remembered about a PREVIOUS row's
        // label (the store never held one).
        relay.setHandler((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        await harness.tick({ x: 0, z: 0 });
        const rediscoveredRow = harness.rows((id) => id)[0];
        assert(rediscoveredRow.createdAtLabel === new Date('2026-05-05T00:00:00.000Z').toLocaleDateString(),
            '51. a re-discovered claim\'s row presents a freshly recomputed, correct createdAtLabel — presentation is regenerated from the claim, never persisted or cached anywhere by adoption.');

        console.log('✓ Section K: an adopted claim\'s own createdAt is governed entirely by storage, independent of its row\'s presence in live discovery — and a persisted record never carries a createdAtLabel of its own');
    }

    // -------------------------------------------------------------
    // Section L — unmount/race: a slow, superseded discovery response, an
    // unmounted view, and a World switch mid-flight can never resurrect
    // stale metadata.
    // -------------------------------------------------------------
    {
        // L1 — a SLOW, in-flight observation is superseded by a FASTER,
        // later one before the slow one ever resolves. The monitor's own
        // requestId race guard (application/PlaceNamingDiscoveryMonitor.js)
        // already protects lastResult/lastError generically — this proves
        // it holds specifically for createdAtLabel too: the stale
        // response's own (older) metadata must never overwrite the
        // fresher one once both eventually settle.
        {
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const worldId = 'world-1';
            const world = new World({ id: worldId });
            world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Race Region', x: 0, z: 0 }));
            const carol = makeIdentity('Carol');
            const { session } = makeReplica(carol, { documents: [{ world }] });

            const staleClaim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Stale Claim', createdAt: new Date('2020-01-01T00:00:00.000Z') });
            const freshClaim = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Fresh Claim', createdAt: new Date('2026-01-01T00:00:00.000Z') });
            const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');

            const slow = makeDeferred();
            const relay = makeRelay((t) => (t === tag ? slow.promise : Promise.resolve([])));
            const harness = createHarness({ session, relay });

            const p1 = harness.tick({ x: 0, z: 0 }); // in-flight, will resolve only once `slow.resolve()` is called below

            relay.setHandler((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(freshClaim), { tag })] : []));
            await harness.tick({ x: 500, z: 0 }); // a second, LATER call — completes fully before the first ever does

            let rows = harness.rows((id) => id);
            assert(rows.length === 1 && rows[0].name === 'Fresh Claim' && rows[0].createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(),
                '52. the second, faster observation\'s own metadata is presented immediately, without waiting for the slower first one.');

            slow.resolve([nostrEventFor(buildPlaceNamingDiscoveryEnvelope(staleClaim), { tag })]);
            await p1;

            rows = harness.rows((id) => id);
            assert(rows.length === 1 && rows[0].name === 'Fresh Claim' && rows[0].createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(),
                '53. THE CORE RACE CHECK — once the slow, now-superseded response finally arrives, it is discarded: the presented row is STILL "Fresh Claim," never overwritten by the stale response\'s own older createdAtLabel/author.');

            console.log('✓ Section L1: a slow, superseded discovery response can never overwrite a faster, later one\'s metadata once both eventually resolve');
        }

        // L2 — an unmounted view discards a still-resolving response
        // entirely: no stale metadata is ever written to a torn-down
        // view's own refs.
        {
            const alice = makeIdentity('Alice');
            const worldId = 'world-1';
            const world = new World({ id: worldId });
            world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Unmount Region', x: 0, z: 0 }));
            const bob = makeIdentity('Bob');
            const { session } = makeReplica(bob, { documents: [{ world }] });

            const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Should Never Appear', createdAt: new Date('2026-07-07T00:00:00.000Z') });
            const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
            const slow = makeDeferred();
            const relay = makeRelay((t) => (t === tag ? slow.promise : Promise.resolve([])));
            const harness = createHarness({ session, relay });

            assert(harness.refs.nearbyPlaceNamingClaims.length === 0, 'sanity: nothing presented before the view mounts any observation at all.');
            const pendingTick = harness.tick({ x: 0, z: 0 }); // in-flight when unmount happens

            harness.unmount(); // the WorldView.js equivalent of onBeforeUnmount() flipping placeNamingDiscoveryPresentationActive to false
            slow.resolve([nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })]);
            await pendingTick;

            assert(harness.refs.nearbyPlaceNamingClaims.length === 0,
                '54. THE CORE UNMOUNT CHECK — a discovery response that finally resolves AFTER unmount never writes its own claim\'s metadata into the (torn-down) view\'s refs, exactly mirroring ui/views/WorldView.js\'s own placeNamingDiscoveryPresentationActive guard.');

            console.log('✓ Section L2: a discovery response resolving after unmount can never resurrect a claim\'s metadata into a torn-down view');
        }

        // L3 — a slow response for World A arrives only AFTER the session
        // has already switched to, and fully observed, World B. The stale
        // World-A response must never resurface World A's own metadata
        // once World B is current.
        {
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const worldA = new World({ id: 'world-a' });
            worldA.addWorldRegion(region({ id: 'region-1', worldId: 'world-a', authorIdentityId: alice.identityId, name: 'World A Region', x: 0, z: 0 }));
            const worldB = new World({ id: 'world-b' });
            worldB.addWorldRegion(region({ id: 'region-1', worldId: 'world-b', authorIdentityId: bob.identityId, name: 'World B Region', x: 0, z: 0 }));

            const carol = makeIdentity('Carol');
            const { session } = makeReplica(carol, { documents: [{ world: worldA }] });

            const claimA = signedClaim(alice, { worldId: 'world-a', regionId: 'region-1', name: 'World A Claim', createdAt: new Date('2024-01-01T00:00:00.000Z') });
            const claimB = signedClaim(bob, { worldId: 'world-b', regionId: 'region-1', name: 'World B Claim', createdAt: new Date('2026-01-01T00:00:00.000Z') });
            const tagA = derivePlaceNamingDiscoveryTag('world-a', 'region-1');
            const tagB = derivePlaceNamingDiscoveryTag('world-b', 'region-1');

            const slowA = makeDeferred();
            const relay = makeRelay((t) => {
                if (t === tagA) return slowA.promise;
                if (t === tagB) return Promise.resolve([nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimB), { tag: tagB })]);
                return Promise.resolve([]);
            });
            const harness = createHarness({ session, relay });

            const slowTickA = harness.tick({ x: 0, z: 0 }); // in-flight against World A, still pending

            // The session switches to World B WHILE the World A request is
            // still outstanding — a real Wanderer navigating away before a
            // slow relay ever answered.
            session._loadedDocuments.delete('world-a');
            session._loadedDocuments.set('world-b', { world: worldB });
            await harness.tick({ x: 500, z: 0 }); // observes World B's own regions — completes fully first

            let rows = harness.rows((id) => id);
            assert(rows.length === 1 && rows[0].worldId === 'world-b' && rows[0].name === 'World B Claim',
                '55. World B\'s own claim is presented as soon as its (faster) observation completes, even though World A\'s own request is still outstanding.');

            slowA.resolve([nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claimA), { tag: tagA })]);
            await slowTickA;

            rows = harness.rows((id) => id);
            assert(rows.length === 1 && rows[0].worldId === 'world-b' && rows[0].name === 'World B Claim' && rows[0].createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(),
                '56. THE CORE CHECK — World A\'s own stale response, arriving only after the switch to World B, never resurfaces World A\'s own claim or metadata: presentation remains exactly World B\'s, unaffected.');
            assert(!rows.some((r) => r.worldId === 'world-a'), '57. THE NEGATIVE CHECK — no row for "world-a" exists anywhere in the final presented set.');

            console.log('✓ Section L3: a slow discovery response for a World the session has since switched away from can never resurrect that World\'s own metadata once a newer World\'s observation has already completed');
        }
    }

    // -------------------------------------------------------------
    // Section M — FLAGSHIP: real Nostr -> discovery -> proximity ->
    // WorldView-shaped presentation -> createdAt formatting -> Adopt ->
    // real verification -> real persistence, with movement, competing
    // claims, and a World switch woven in. No mocks around any of these
    // application boundaries — only the relay's own transport is
    // constructed by hand, exactly like every other flagship section in
    // this Place Naming arc.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const dave = makeIdentity('Dave');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing', x: 10, z: 0 }));
        world.addWorldRegion(region({ id: 'region-far', worldId, authorIdentityId: alice.identityId, name: 'Distant Hollow', x: 5000, z: 0 }));

        const bob = makeIdentity('Bob');
        const { session, claimStore, verifier } = makeReplica(bob, { documents: [{ world }] });

        // Chapter 1 — two competing, real, independently-signed claims for
        // the SAME near region, plus one genuinely out-of-range claim,
        // discovered together over a real Nostr relay.
        const riverbend = signedClaim(dave, { worldId, regionId: 'region-near', name: 'Riverbend', createdAt: new Date('2026-02-10T00:00:00.000Z') });
        const millpond = signedClaim(alice, { worldId, regionId: 'region-near', name: 'Millpond', createdAt: new Date('2026-05-20T00:00:00.000Z') });
        const farClaim = signedClaim(dave, { worldId, regionId: 'region-far', name: 'Should Not Be Reachable', createdAt: new Date('2026-03-01T00:00:00.000Z') });
        const tagNear = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const tagFar = derivePlaceNamingDiscoveryTag(worldId, 'region-far');
        const relay = makeRelay((t) => {
            if (t === tagNear) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(riverbend), { tag: tagNear }), nostrEventFor(buildPlaceNamingDiscoveryEnvelope(millpond), { tag: tagNear })];
            if (t === tagFar) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(farClaim), { tag: tagFar })];
            return [];
        });
        const harness = createHarness({ session, relay, proximityRadius: 100 });

        await harness.tick({ x: 0, z: 0 });
        let rows = harness.rows((id) => id);
        assert(rows.length === 2 && rows.some((r) => r.name === 'Riverbend') && rows.some((r) => r.name === 'Millpond'),
            '58. FLAGSHIP Ch.1 — real Nostr discovery + real proximity selection surfaces exactly the two NEAR, competing claims, each with its own createdAtLabel; the far claim never enters presentation at all.');
        const riverbendRow = rows.find((r) => r.name === 'Riverbend');
        assert(riverbendRow.createdAtLabel === new Date('2026-02-10T00:00:00.000Z').toLocaleDateString() && riverbendRow.createdAt === riverbend.toJSON().createdAt,
            '59. FLAGSHIP Ch.1 — "Riverbend"\'s own label and raw createdAt are both correctly derived, end to end, from the real signed claim.');

        // Chapter 2 — movement: the Wanderer walks toward "region-far,"
        // moving "region-near" out of range, then walks back.
        await harness.tick({ x: 5000, z: 0 });
        assert(claimIds(harness).length === 1 && harness.rows((id) => id)[0].name === 'Should Not Be Reachable',
            '60. FLAGSHIP Ch.2 — moving near "region-far," only its own claim now presents; the two near claims genuinely disappear from live presentation.');
        await harness.tick({ x: 0, z: 0 });
        rows = harness.rows((id) => id);
        assert(rows.length === 2 && rows.every((r) => r.createdAtLabel.length > 0),
            '61. FLAGSHIP Ch.2 — moving back, both near claims reappear with fully-formed, non-empty labels — metadata was never lost by the round trip.');

        // Chapter 3 — Adopt "Riverbend" through the REAL importPlaceNamingClaim()
        // boundary, then confirm it genuinely, independently re-verifies.
        const adoptRow = rows.find((r) => r.name === 'Riverbend');
        const adoptResult = adoptNearbyPlaceNamingClaim(session, adoptRow, makeFeedback());
        assert(adoptResult && adoptResult.isNew === true && adoptResult.claim.authorIdentityId === dave.identityId,
            '62. FLAGSHIP Ch.3 — "Riverbend" adopts end to end through the real pipeline, correctly attributed to Dave, its real author.');
        assert(adoptResult.claim.toJSON().createdAt === riverbend.toJSON().createdAt,
            '63. FLAGSHIP Ch.3 — the persisted claim\'s own createdAt is byte-identical to the real signed claim\'s own value, never anything derived from its own displayed label.');
        const rehydratedVerify = verifier.verifyPlaceNamingClaim(claimStore.listForRegion(worldId, 'region-near').find((c) => c.id === riverbend.id).toJSON());
        assert(rehydratedVerify.valid === true, '64. FLAGSHIP Ch.3 — the adopted claim genuinely, independently re-verifies against the real, unmocked verifier.');
        assert(world.getWorldRegion('region-near').name !== 'Riverbend' && world.getWorldRegion('region-near').name !== 'Millpond',
            '65. FLAGSHIP Ch.3 — the WorldRegion\'s own authoritative name is never overwritten by either claim, adopted or not.');

        // Chapter 4 — a World switch, then a return: "Millpond" remains
        // adoptable, with its own metadata intact, after the round trip.
        const worldElsewhere = new World({ id: 'world-elsewhere' });
        worldElsewhere.addWorldRegion(region({ id: 'region-elsewhere', worldId: 'world-elsewhere', authorIdentityId: alice.identityId, name: 'Elsewhere Region', x: 0, z: 0 }));
        session._loadedDocuments.set('world-elsewhere', { world: worldElsewhere });
        session._loadedDocuments.delete(worldId);
        // A genuinely different position than the previous tick's own
        // (0,0) — otherwise shouldRefreshPlaceNamingDiscovery() would
        // decide no real movement occurred and skip refreshing entirely,
        // leaving lastResult stale rather than genuinely re-querying the
        // now-switched World's own (empty) region set.
        await harness.tick({ x: 12345, z: 0 });
        assert(claimIds(harness).length === 0, '66. FLAGSHIP Ch.4 — with the original World fully unloaded, live presentation shows nothing from it at all.');

        session._loadedDocuments.set(worldId, { world });
        session._loadedDocuments.delete('world-elsewhere');
        await harness.tick({ x: 0, z: 0 });
        rows = harness.rows((id) => id);
        const millpondRow = rows.find((r) => r.name === 'Millpond');
        assert(millpondRow && millpondRow.createdAtLabel === new Date('2026-05-20T00:00:00.000Z').toLocaleDateString(),
            '67. FLAGSHIP Ch.4 — after returning to the original World, "Millpond" is presented again with its own, correct, freshly-recomputed metadata.');
        const adoptMillpond = adoptNearbyPlaceNamingClaim(session, millpondRow, makeFeedback());
        assert(adoptMillpond && adoptMillpond.isNew === true && adoptMillpond.claim.toJSON().createdAt === millpond.toJSON().createdAt,
            '68. FLAGSHIP Ch.4 — "Millpond" adopts successfully after the World round trip, its persisted createdAt still byte-identical to the original signed claim.');
        assert(claimStore.listForRegion(worldId, 'region-near').length === 2,
            '69. FLAGSHIP — both competing claims now sit persisted side by side, each with its own independently-verified createdAt, none of it ever influenced by the other\'s or its own displayed label.');

        console.log('✓ Section M (FLAGSHIP): a real Nostr -> discovery -> proximity -> presentation -> Adopt -> verification -> persistence lifecycle holds end to end, threading movement, competing claims, and a World switch through createdAt formatting without a single mock at any of the real boundaries');
    }

    // -------------------------------------------------------------
    // Section N — structural regression: the formatter stays pure, and no
    // new domain state, verification call, ranking call, or World
    // mutation was introduced.
    // -------------------------------------------------------------
    {
        const rawWorldViewCode = await rawSource('ui/views/WorldView.js');
        const worldViewCode = codeOnlyLines(rawWorldViewCode);

        // 70. The formatter itself remains a pure function: no verifier,
        // no store, no session, no ref/computed/reactive machinery of any
        // kind inside its own body.
        const formatterBlock = extractBetween(worldViewCode, 'function formatNearbyPlaceNamingCreatedAt(createdAt) {', '\n        }');
        for (const forbidden of ['verifyPlaceNamingClaim', 'LocalAuthorizationVerifier', 'importPlaceNamingClaim', 'session.', 'ref(', 'computed(', '.sort(']) {
            assert(!formatterBlock.includes(forbidden), `70. formatNearbyPlaceNamingCreatedAt() contains no '${forbidden}' — it remains a pure, side-effect-free date formatter.`);
        }

        // 71. No NEW reactive domain state was introduced for metadata
        // presentation beyond what 0.9.266 already established — the row
        // computed itself declares no new ref()/reactive() of its own.
        const rowMapping = worldViewCode.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        assert(!/\bref\(|\breactive\(/.test(rowMapping), '71. nearbyPlaceNamingClaimRows introduces no new ref()/reactive() domain state of its own — it remains a pure derivation over nearbyPlaceNamingClaims.value.');
        assert(rowMapping.includes('createdAtLabel: formatNearbyPlaceNamingCreatedAt(entry.claim.createdAt)'),
            '72. the real computed still derives createdAtLabel via the real, pure formatter.');

        // 73. No verification call and no ranking/sort call was added
        // anywhere in the row-computation or template block.
        for (const forbidden of ['verifyPlaceNamingClaim', 'LocalAuthorizationVerifier', '.sort(', 'rankClaimsByName', 'score:', 'rank:']) {
            assert(!rowMapping.includes(forbidden), `73. nearbyPlaceNamingClaimRows contains no '${forbidden}'.`);
        }

        // 74. No World mutation call was introduced in either the row
        // computation or the adoption/navigation functions.
        const adoptBlockRaw = codeOnlyLines(extractBetween(rawWorldViewCode, 'function adoptNearbyPlaceNamingClaim(row) {', '\n        }'));
        const navigateBlockRaw = codeOnlyLines(extractBetween(rawWorldViewCode, 'function navigateToNearbyPlaceNamingClaim(row) {', '\n        }'));
        for (const term of ['setWorldRegion(', 'renameRegion(', 'updateRegion(', 'region.name =', '.name =']) {
            assert(!rowMapping.includes(term) && !adoptBlockRaw.includes(term) && !navigateBlockRaw.includes(term),
                `74. no '${term}' appears in the row computation, adoption, or navigation code — createdAtLabel introduced no World mutation anywhere.`);
        }

        // 75. The template still never renders raw signature bytes or any
        // verification vocabulary, and still renders createdAtLabel
        // (never raw createdAt) — the same boundary 0.9.266 drew, still
        // holding one milestone later.
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(!nearbyBlock.includes('claim.signature'), '75a. the template still never renders claim.signature.');
        assert(!/verified|unverified|isVerified|verification-status/i.test(nearbyBlock), '75b. no verification vocabulary of any kind appears in the template.');
        assert(nearbyBlock.includes('claim.createdAtLabel') && !nearbyBlock.includes('claim.createdAt.') && !nearbyBlock.includes('claim.createdAt }}'),
            '75c. the template still renders only the formatted createdAtLabel, never the raw createdAt.');

        console.log('✓ Section N: the formatter remains pure, no new domain state/verification call/ranking call/World mutation was introduced anywhere in the metadata presentation path, and the template still draws the identical rendering boundary 0.9.266 established');
    }

    console.log('\n✅ All Nearby Place Naming Metadata Presentation Lifecycle Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
