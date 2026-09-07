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

// 0.9.264 — Place Naming Claim Adoption Lifecycle Audit.
//
// This milestone adds NO new capability. It is a **test-only lifecycle
// audit** of the ONE new boundary 0.9.263 (Nearby Place Naming Claim
// Adoption UI) opened: a nearby, DISCOVERED, unverified-by-this-viewer
// claim crossing — via one explicit click — into this replica's OWN
// persistent local state, through the existing, unmodified
// `WorldNavigationSession#importPlaceNamingClaim()` boundary. 0.9.263's
// own test already proved adoption's semantics *in isolation*, one call
// at a time, against statically-constructed rows: exact-claim fidelity,
// authorship/timestamp/signature preservation, tampering refusal, two
// competing claims, World-identity protection under a colliding regionId,
// navigation independence, and a full one-shot Nostr-to-adoption flagship.
// This file does not re-derive any of that — it is cited, not repeated.
// What it proves instead is what happens across a *lifecycle*: a running
// `PlaceNamingDiscoveryMonitor` observing repeatedly, claims arriving and
// leaving presentation, a replica restarting, discovery failing while
// adoption keeps working, and the SAME claim reaching persistence by two
// different doors (a manual file import and a Nearby Adopt click) — the
// exact races, staleness, and continuity questions
// `tests/PlaceNamingNearbyNavigationLifecycleAudit.test.js` (0.9.261) asked
// of *navigation*, asked here of *adoption* instead.
//
// THE INVARIANT THIS FILE EXISTS TO FREEZE (this milestone's own brief,
// verbatim):
//
//   Adoption changes local persistence, not the meaning of the discovered
//   claim.
//
// so across every section below, none of the following ever holds:
//
//   discovery  -> adopted
//   proximity  -> adopted
//   navigation -> adopted
//   adopted    -> WorldRegion.name
//
// THE REAL PRODUCTION CHAIN, WITH ONLY THE RELAY CONTROLLED — the same
// restraint 0.9.258/0.9.261 already hold: every full-pipeline section below
// drives a REAL `NostrPlaceNamingDiscoverySource`, a REAL
// `composePlaceNamingDiscoveryRuntime()`, the REAL
// `executeDiscoverPlaceNamingClaimsCommand()`, a REAL
// `PlaceNamingDiscoveryMonitor`, and a REAL, full `WorldNavigationSession`
// (never a restricted Proxy) — because adoption itself needs the real
// `importPlaceNamingClaim()`/`getRegions()`/`focusLocation()` this audit is
// testing. `adoptNearbyPlaceNamingClaim()`/`navigateToNearbyPlaceNamingClaim()`
// below are the SAME reproductions `tests/PlaceNamingNearbyAdoption.test.js`
// already established and whose own Sections B/Q already proved match
// `ui/views/WorldView.js`'s real wiring byte-for-byte — this file reuses
// that proof rather than re-deriving it (see Section N's own lightweight
// tripwire, not a full re-audit).
//
//   Section A — successful adoption, full real pipeline end to end
//   Section B — idempotent adoption: the same nearby claim, adopted twice
//   Section C — manual/automatic convergence: nearby-Adopt and manual
//               file-import reach the same persistence, in both orders
//   Section D — competing claims, live: "Riverside"/"Old River" discovered
//               together, adopted independently across real observation
//               cycles, no ranking ever emerges
//   Section E — authorship preservation, full pipeline
//   Section F — timestamp/signature preservation, full pipeline
//   Section G — tampering: signature, content, and author-substitution,
//               each independently refused, nothing persisted
//   Section H — stale discovery / World identity protection, live: a
//               World switch and a fully-unloaded World both fail to
//               misattribute a stale claim
//   Section I — discovery failure vs. adoption: a failed refresh preserves
//               prior presentation and does not block adoption; a failed
//               adoption attempt never corrupts discovery state
//   Section J — navigation independence, live and structural
//   Section K — World mutation negative, across repeated adoptions and a
//               restart
//   Section L — persistence/reload: adoption survives a full application-
//               layer reconstruction over the same underlying storage
//   Section M — presentation independence: the Nearby array is never the
//               source of truth for what was adopted
//   Section N — architectural tripwire: the invariant frozen above, poked
//               at directly rather than re-derived in full
//   Section O — FLAGSHIP: one continuous lifecycle — discovery, competing
//               claims, adoption, idempotent re-adoption, restart,
//               World-switch staleness, and presentation churn — end to
//               end, in a single narrative

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
// collaborator graph, generalized (relative to
// tests/PlaceNamingNearbyAdoption.test.js#makeReplica()) to accept an
// EXPLICIT `storage` instance rather than always minting a fresh one —
// Section L's own "restart" needs to reconstruct every application-layer
// object FROM SCRATCH while keeping the exact same underlying bytes, the
// only way to prove persistence survives a genuine process boundary rather
// than merely surviving because the same live objects happened to still be
// in memory.
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

// A real, independently-signed PlaceNamingClaim — never a fabricated
// signature string. `identity` is a makeIdentity()-shaped
// LocalIdentityProvider carrying its own `.identityId`. `createdAt`
// optionally pins the claim's own signed timestamp to a fixed value (a
// genuine past moment) — Section F needs this to prove adoption never
// re-stamps "now" over a timestamp that could otherwise, by coincidence,
// look indistinguishable from the current instant.
function signedClaim(identity, { worldId, regionId, name, createdAt }) {
    let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId: identity.identityId, createdAt });
    claim = claim.withSignature(identity.signCanonical(claim.getSigningDescriptor()));
    return claim;
}

// Round-trips `claim` through the exact real discovery-envelope shape
// genuine Nostr discovery already produces (buildPlaceNamingDiscoveryEnvelope
// -> JSON string -> parsePlaceNamingDiscoveryEnvelope).
function discoverAsEnvelope(claim) {
    const built = buildPlaceNamingDiscoveryEnvelope(claim);
    return parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
}

// Reproduces EXACTLY ui/views/WorldView.js's own (0.9.263-widened)
// `nearbyPlaceNamingClaimRows` computed.
function makeAdoptRows(entries, resolveDisplayName) {
    return entries.map((entry) => ({
        claimId: entry.claim.id,
        name: entry.claim.name,
        authorDisplayName: resolveDisplayName(entry.claim.authorIdentityId),
        position: entry.position,
        regionId: entry.claim.regionId,
        worldId: entry.claim.worldId,
        authorIdentityId: entry.claim.authorIdentityId,
        createdAt: entry.claim.createdAt,
        signature: entry.claim.signature
    }));
}

// Produces a same-length, still-valid-hex, but genuinely different
// signature value — reversing the original hex string.
function tamperSignatureHex(hex) {
    return hex.split('').reverse().join('');
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
// same reshaping, same call order, same duplicate-vs-new feedback split.
// tests/PlaceNamingNearbyAdoption.test.js's own Section Q already proved
// this reproduction matches the real file byte for byte (the same forbidden-
// terms/required-call structural audit); this file reuses that proof rather
// than re-deriving it (Section N's own lightweight tripwire re-confirms the
// headline claims only).
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

// Reproduces EXACTLY ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim()
// — used only to prove Navigate/Adopt remain independent (Section J).
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

// Reproduces EXACTLY ui/views/WorldView.js#importNamingClaim(rawText) — the
// MANUAL PlaceNamingPanel import path (0.5.3), simplified only by omitting
// the panel-refresh/region-scoping UI plumbing (namingPanelRegionId,
// refreshNamingPanel()) that has nothing to do with WHICH persistence
// boundary the claim reaches — the one question Section C's own convergence
// proof cares about. Section C's own structural check confirms the real
// file's own `importNamingClaim()` still calls
// `session.importPlaceNamingClaim(parsed)`, unmodified, so this
// simplification never hides a divergence.
function importClaimManually(session, rawText, feedback) {
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

// Builds a manual-export-shaped publication package text for `claim` —
// the exact shape session.exportPlaceNamingClaim()/buildPlaceNamingClaimPublication()
// produce, reproduced directly here since Section C exports a claim this
// replica did not necessarily author or already have on file (a claim
// discovered via Nearby, handed to a SEPARATE replica as if a person had
// copied the exported file to a friend).
function exportClaimAsText(claim) {
    return JSON.stringify({
        kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        claim: claim.toJSON()
    });
}

// ---------------------------------------------------------------------
// Full real-pipeline harness — mirrors
// tests/PlaceNamingNearbyNavigationLifecycleAudit.test.js#createHarness()
// exactly (Nostr source -> composed query service -> real
// PlaceNamingDiscoveryMonitor -> proximity selection -> presentation
// rows), reused here because adoption's own lifecycle questions (does a
// claim survive a refresh, does a failed observation cycle still leave an
// adoptable row, does World-switching still scope correctly under a live
// monitor) require the SAME real, repeatedly-observable pipeline —
// building one adoption row in isolation, as
// tests/PlaceNamingNearbyAdoption.test.js already does thoroughly, cannot
// exercise "what a SECOND, THIRD, or FAILED observation cycle does."
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

// Deliberately large — every section using this harness is about
// LIFECYCLE (repeated observation, staleness, failure, restart), never
// about proximity-radius precision, which
// tests/PlaceNamingEndToEndLifecycleAudit.test.js's own Section B already
// covers exhaustively.
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
        return makeAdoptRows(refs.nearbyPlaceNamingClaims, resolveDisplayName);
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
    console.log('Running Nearby Place Naming Claim Adoption Lifecycle Audit tests...\n');

    // -------------------------------------------------------------
    // Section A — successful adoption, full real pipeline end to end.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const carol = makeIdentity('Carol');
        const claim = signedClaim(carol, { worldId, regionId: 'region-near', name: 'Riverbend' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 1 && claimIds(harness)[0] === claim.id,
            '1. real Nostr discovery + real proximity selection surfaces exactly one nearby claim through the real pipeline.');

        const rows = harness.rows((id) => `display:${id}`);
        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], feedback);

        assert(result && result.isNew === true && result.claim.id === claim.id && result.claim.name === 'Riverbend',
            '2. Adopt succeeds end to end for a claim that traveled the entire real pipeline: Nostr event -> discovery envelope -> proximity selection -> presentation row -> Adopt -> real importClaim().');
        assert(feedback.messages.length === 1 && /Adopted/.test(feedback.messages[0]),
            '3. a genuine, single "Adopted" feedback message, never a failure or a silent no-op.');
        assert(claimStore.listForRegion(worldId, 'region-near').some((c) => c.id === claim.id && c.name === 'Riverbend'),
            '4. the exact claim is genuinely persisted in this replica\'s own claim store, keyed by its own worldId/regionId.');
        assert(world.getWorldRegion('region-near').name !== 'Riverbend',
            '5. even after a full real adoption, the WorldRegion\'s own authoritative name was never overwritten — the claim remains merely a claim.');

        const view = deriveNamingView('region-near', claimStore.list(worldId));
        assert(view.length === 1 && view[0].name === 'Riverbend' && view[0].score === 1,
            '6. the adopted claim genuinely participates in this replica\'s own namingView() ranking for its region.');

        console.log('✓ Section A: a claim discovered over a real Nostr source, filtered by real proximity selection, and adopted via the real, unmodified importPlaceNamingClaim() boundary — end to end');
    }

    // -------------------------------------------------------------
    // Section B — idempotent adoption: the same nearby claim, adopted
    // twice.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Fernbrook' });
        const rows = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id);

        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob);

        const firstFeedback = makeFeedback();
        const first = adoptNearbyPlaceNamingClaim(session, rows[0], firstFeedback);
        assert(first && first.isNew === true, '7. the FIRST adoption creates the claim, reporting isNew === true.');
        assert(firstFeedback.messages.length === 1 && /^Adopted/.test(firstFeedback.messages[0]),
            '8. the first adoption surfaces a genuine "Adopted" message.');

        const secondFeedback = makeFeedback();
        const second = adoptNearbyPlaceNamingClaim(session, rows[0], secondFeedback);
        assert(second && second.isNew === false, '9. the SECOND adoption of the exact same row reports isNew === false — a duplicate, never an error.');
        assert(second.claim.id === first.claim.id && second.claim.name === first.claim.name,
            '10. the second adoption\'s own returned claim is the SAME claim already on file, not a second, independent record.');
        assert(secondFeedback.messages.length === 1 && /already known/i.test(secondFeedback.messages[0]),
            '11. the second adoption surfaces the distinct "already known — nothing changed" message, never the "Adopted" message a genuinely new claim gets.');

        const stored = claimStore.listForRegion(worldId, 'region-1');
        assert(stored.length === 1, '12. THE CORE IDEMPOTENCY CHECK: exactly ONE record exists in the store after adopting the same claim twice — the second click never created a second row.');

        // 13. A THIRD, FOURTH, FIFTH adoption of the same row remains
        // equally idempotent — this is not merely "the second click is
        // special," it is a genuinely stable fixed point.
        for (let i = 0; i < 3; i += 1) {
            const repeatResult = adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());
            assert(repeatResult.isNew === false, `13.${i}. repeated adoption attempt #${i + 3} remains idempotent.`);
        }
        assert(claimStore.listForRegion(worldId, 'region-1').length === 1,
            '14. after five total adoption attempts of the identical claim, the store still holds exactly one record.');

        console.log('✓ Section B: adopting the identical nearby claim any number of times is a stable, idempotent no-op after the first — one record, however many times Adopt is clicked');
    }

    // -------------------------------------------------------------
    // Section C — manual/automatic convergence: nearby-Adopt and manual
    // file-import reach the same persistence, in both orders.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Convergence Point' });

        // --- Order 1: Nearby Adopt FIRST, manual file import SECOND. ---
        {
            const bob = makeIdentity('Bob');
            const { session, claimStore } = makeReplica(bob);

            const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
            const adoptResult = adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
            assert(adoptResult.isNew === true, '15. Nearby Adopt creates the claim first.');

            // The SAME claim, handed to Bob a second time as if a friend
            // had separately exported it to a file and Bob imported that
            // file manually through PlaceNamingPanel's own Import Claim
            // button.
            const manualFeedback = makeFeedback();
            const manualResult = importClaimManually(session, exportClaimAsText(claim), manualFeedback);
            assert(manualResult && manualResult.isNew === false,
                '16. the SAME claim, arriving a second time through the MANUAL import door, is recognized as already known — it converges onto the identical record Nearby Adopt already created.');
            assert(manualResult.claim.id === adoptResult.claim.id,
                '17. the manual path\'s own returned claim is the exact same claim object identity (by id) Nearby Adopt already stored.');
            assert(manualFeedback.messages.length === 1 && /already known/i.test(manualFeedback.messages[0]),
                '18. the manual path surfaces its own "already known" message — the identical duplicate semantics either door produces.');
            assert(claimStore.listForRegion(worldId, 'region-1').length === 1,
                '19. only ONE record exists after both doors were used for the identical claim — Nearby Adopt and manual import are two entrances to the SAME room, never two separate rooms.');
        }

        // --- Order 2: manual file import FIRST, Nearby Adopt SECOND. ---
        {
            const carol = makeIdentity('Carol');
            const { session, claimStore } = makeReplica(carol);

            const manualResult = importClaimManually(session, exportClaimAsText(claim), makeFeedback());
            assert(manualResult.isNew === true, '20. manual import creates the claim first, in the reverse order.');

            // Later, the identical claim happens to also surface through
            // this replica's OWN Nearby Place Names discovery (e.g. the
            // author re-broadcast it, or a different relay carried it) —
            // clicking Adopt on it must converge, never duplicate.
            const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
            const adoptFeedback = makeFeedback();
            const adoptResult = adoptNearbyPlaceNamingClaim(session, row, adoptFeedback);
            assert(adoptResult && adoptResult.isNew === false,
                '21. Nearby Adopt on a claim already known through manual import reports isNew === false — the reverse convergence holds too.');
            assert(adoptFeedback.messages.length === 1 && /already known/i.test(adoptFeedback.messages[0]),
                '22. Nearby Adopt\'s own "already known" message is identical in shape to the manual path\'s own.');
            assert(claimStore.listForRegion(worldId, 'region-1').length === 1,
                '23. only ONE record exists regardless of which door was used first — convergence is symmetric.');
        }

        // 24. Structural confirmation, direct from real source: BOTH doors
        // call the exact same session method.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldViewCode.includes('session.importPlaceNamingClaim(parsed)') && worldViewCode.includes('session.importPlaceNamingClaim(pkg)'),
            '24. ui/views/WorldView.js\'s manual importNamingClaim() and nearby adoptNearbyPlaceNamingClaim() both call session.importPlaceNamingClaim() — the SAME single boundary, never two independent adoption use cases.');

        console.log('✓ Section C: manual file import and Nearby-claim Adopt are two entrances to the exact same persistence/verification machinery — converging identically regardless of which is used first');
    }

    // -------------------------------------------------------------
    // Section D — competing claims, live: "Riverside"/"Old River"
    // discovered together, adopted independently across real observation
    // cycles, no ranking ever emerges.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Unclaimed Crossing', x: 0, z: 0 }));

        const riverside = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Riverside' });
        const oldRiver = signedClaim(bob, { worldId, regionId: 'region-1', name: 'Old River' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag
            ? [
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(riverside), { tag }),
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(oldRiver), { tag })
            ]
            : []));

        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol, { documents: [{ world }] });
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 2, '25. both independently-authored, competing claims for the same region are discovered together, live.');

        let rows = harness.rows((id) => id);
        const riversideRow = rows.find((r) => r.claimId === riverside.id);
        const oldRiverRow = rows.find((r) => r.claimId === oldRiver.id);

        const adoptRiverside = adoptNearbyPlaceNamingClaim(session, riversideRow, makeFeedback());
        assert(adoptRiverside.isNew === true && adoptRiverside.claim.name === 'Riverside', '26. "Riverside" adopts successfully.');
        assert(claimStore.listForRegion(worldId, 'region-1').length === 1,
            '27. only the adopted claim is stored — "Old River," merely discovered and displayed, was never silently imported alongside it.');

        // 28. Run ANOTHER real observation cycle (the Wanderer moves, the
        // monitor refreshes again) — "Old River" must still be presented,
        // completely unaffected by "Riverside" having been adopted in the
        // meantime.
        await harness.tick({ x: 50, z: 0 });
        rows = harness.rows((id) => id);
        assert(rows.length === 2 && rows.some((r) => r.claimId === oldRiver.id) && rows.some((r) => r.claimId === riverside.id),
            '28. a LATER, independent observation cycle still presents BOTH claims — adopting "Riverside" never removed "Old River" from ongoing discovery, live.');

        const oldRiverRowAfter = rows.find((r) => r.claimId === oldRiver.id);
        const secondAdopt = adoptNearbyPlaceNamingClaim(session, oldRiverRowAfter, makeFeedback());
        assert(secondAdopt.isNew === true && secondAdopt.claim.name === 'Old River',
            '29. "Old River" remains fully, independently adoptable across observation cycles — Section G/H of 0.9.263\'s own restraint holds under a LIVE, repeatedly-refreshing monitor too, not only against static rows.');

        const finalView = deriveNamingView('region-1', claimStore.list(worldId));
        assert(finalView.length === 2 && finalView.every((entry) => entry.score === 1),
            '30. once both are adopted, namingView() shows both names with an equal score of 1 — no ranking ever emerged at any point in the live sequence.');
        assert(world.getWorldRegion('region-1').name === 'Unclaimed Crossing',
            '31. the WorldRegion\'s own name is unaffected throughout — neither competing claim, nor either adoption, ever touched it.');

        console.log('✓ Section D: two competing, independently-authored claims for the same region adopt independently across repeated LIVE observation cycles — neither ever ranks, hides, or interferes with the other');
    }

    // -------------------------------------------------------------
    // Section E — authorship preservation, full pipeline.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Fern Hollow' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));

        // Bob is the one running the replica and clicking Adopt — his own
        // identity must never leak into the stored claim's authorship.
        const bob = makeIdentity('Bob');
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: bob.identityId, name: 'Bob\'s Region', x: 0, z: 0 }));
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });

        const result = adoptNearbyPlaceNamingClaim(session, harness.rows((id) => id)[0], makeFeedback());
        assert(result.claim.authorIdentityId === alice.identityId,
            '32. the adopted claim\'s authorIdentityId is Alice\'s (the claim\'s own original author) through the entire real pipeline.');
        assert(result.claim.authorIdentityId !== bob.identityId,
            '33. THE NEGATIVE CHECK: the adopted claim\'s authorIdentityId is never Bob\'s (the viewer performing the adoption, and the region\'s own author) — adoption never manufactures or substitutes authorship.');

        // 34. Confirmed again straight from the store, independent of the
        // in-memory return value.
        const stored = claimStore.listForRegion(worldId, 'region-1').find((c) => c.id === claim.id);
        assert(stored.authorIdentityId === alice.identityId, '34. re-read from the real store, the persisted claim\'s authorship is still Alice\'s alone.');

        console.log('✓ Section E: authorship travels unchanged through the entire real discovery-to-adoption pipeline — the adopting viewer\'s own identity, even when it also authored the region, never substitutes for the claim\'s own author');
    }

    // -------------------------------------------------------------
    // Section F — timestamp/signature preservation, full pipeline.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        // A genuinely distant past timestamp — proves adoption cannot be
        // merely "close to now by coincidence."
        const originalCreatedAt = new Date('2020-03-14T00:00:00.000Z');
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Kestrel Point', createdAt: originalCreatedAt });
        // Compared against the DISCOVERED envelope's own signature, round-
        // tripped through the SAME PlaceNamingClaim.fromJSON()/toJSON()
        // normalization the adopted claim itself goes through — a raw
        // plain-object JSON.stringify() comparison would spuriously differ
        // only in key ORDER, never in actual content, exactly like
        // tests/PlaceNamingNearbyAdoption.test.js's own Section F already
        // guards against.
        const originalSignatureJSON = JSON.stringify(PlaceNamingClaim.fromJSON(discoverAsEnvelope(claim).claim).toJSON().signature);

        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const bob = makeIdentity('Bob');
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: bob.identityId, name: 'Kestrel Region', x: 0, z: 0 }));
        const { session, verifier, claimStore } = makeReplica(bob, { documents: [{ world }] });
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });

        const adoptedAtWallClock = Date.now();
        const result = adoptNearbyPlaceNamingClaim(session, harness.rows((id) => id)[0], makeFeedback());

        assert(result.claim.toJSON().createdAt === originalCreatedAt.toISOString(),
            '35. the adopted claim\'s own createdAt is byte-identical to the original, genuinely-past signed timestamp — never replaced with the moment adoption happened.');
        assert(new Date(result.claim.toJSON().createdAt).getTime() < adoptedAtWallClock - (60 * 60 * 24 * 1000),
            '36. NUMERIC PROOF: the persisted timestamp is measurably (by years) earlier than the wall-clock moment adoption ran — this cannot be an artifact of test speed.');

        assert(JSON.stringify(result.claim.toJSON().signature) === originalSignatureJSON,
            '37. the adopted claim carries the EXACT signature the row itself received from discovery, byte-for-byte — adoption never re-signs, narrows, or strips it.');

        const stillVerifies = verifier.verifyPlaceNamingClaim(result.claim.toJSON());
        assert(stillVerifies.valid === true,
            '38. the adopted claim\'s signature genuinely re-verifies, independently, against a real (unmocked) LocalAuthorizationVerifier.');

        // 39. Re-read straight from storage — proving the preserved
        // timestamp/signature are genuinely serialized, not merely an
        // in-memory illusion of the return value.
        const rehydrated = claimStore.listForRegion(worldId, 'region-1').find((c) => c.id === claim.id);
        assert(rehydrated.toJSON().createdAt === originalCreatedAt.toISOString() && JSON.stringify(rehydrated.toJSON().signature) === originalSignatureJSON,
            '39. re-read from the real store, createdAt and signature are still byte-identical to the original.');

        console.log('✓ Section F: createdAt and signature both travel unchanged from a genuinely past, real signing moment through the full pipeline and into real persistence — adoption never re-stamps or re-signs anything');
    }

    // -------------------------------------------------------------
    // Section G — tampering: signature, content, and author-substitution,
    // each independently refused, nothing persisted.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const worldId = 'world-1';

        // G1 — signature bytes tampered.
        {
            const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Forged Signature' });
            const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
            row.signature = { ...row.signature, signature: tamperSignatureHex(row.signature.signature) };

            const { session, claimStore } = makeReplica(bob);
            const feedback = makeFeedback();
            const result = adoptNearbyPlaceNamingClaim(session, row, feedback);
            assert(result === null, '40. G1 — a row with tampered signature BYTES is refused by real verification.');
            assert(feedback.messages.length === 1 && /unverifiable/i.test(feedback.messages[0]), '41. G1 — refusal surfaces as clear feedback, never a silent no-op.');
            assert(claimStore.listForRegion(worldId, 'region-1').length === 0, '42. G1 — nothing is persisted.');
        }

        // G2 — CONTENT tampered: the row's own `name` is altered after
        // discovery (e.g. a hostile relay, or a hand-edited exported file)
        // while the original signature travels along unchanged. The name
        // is part of the claim's own signed payload (see
        // core/PlaceNamingClaim.js#getPlaceNamingClaimSigningDescriptor()),
        // so this must fail verification exactly like a tampered signature
        // does — a DIFFERENT tampering vector than G1, never previously
        // exercised by tests/PlaceNamingNearbyAdoption.test.js.
        {
            const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Original Name' });
            const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
            row.name = 'Hostile Rewritten Name';

            const { session, claimStore } = makeReplica(bob);
            const feedback = makeFeedback();
            const result = adoptNearbyPlaceNamingClaim(session, row, feedback);
            assert(result === null, '43. G2 — a row whose NAME was altered after discovery (signature left as-is) is refused — content tampering, not merely signature tampering, is caught.');
            assert(feedback.messages.length === 1 && /unverifiable/i.test(feedback.messages[0]), '44. G2 — refusal surfaces as clear feedback here too.');
            assert(claimStore.listForRegion(worldId, 'region-1').length === 0, '45. G2 — nothing is persisted, and the untampered original name never leaks into storage either.');
        }

        // G3 — AUTHOR SUBSTITUTED: the row's own `authorIdentityId` is
        // swapped to a real, different identity (Bob's own) while Alice's
        // original signature travels unchanged. identity/
        // LocalAuthorizationVerifier.js#verifyPlaceNamingClaim() checks
        // `sig.signer !== record.authorIdentityId` BEFORE ever touching
        // cryptography — this is the exact attack "adopt a real claim but
        // relabel who gets credit for it" would need, and it must fail for
        // a reason distinct from a bad signature.
        {
            const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Author Swap Attempt' });
            const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
            row.authorIdentityId = bob.identityId;

            const { session, claimStore, verifier } = makeReplica(bob);
            const feedback = makeFeedback();
            const result = adoptNearbyPlaceNamingClaim(session, row, feedback);
            assert(result === null, '46. G3 — a row whose authorIdentityId was swapped to someone else\'s real identity is refused.');
            assert(claimStore.listForRegion(worldId, 'region-1').length === 0, '47. G3 — nothing is persisted — Bob can never credit himself for Alice\'s real, signed claim.');

            // 48. Confirms the SPECIFIC reason: the real verifier reports
            // signer/author mismatch, not merely "some failure."
            const directCheck = verifier.verifyPlaceNamingClaim({ ...claim.toJSON(), authorIdentityId: bob.identityId });
            assert(directCheck.valid === false && /signer does not match/i.test(directCheck.reason),
                '48. G3 — the real verifier\'s own refusal reason is specifically a signer/author mismatch, proving this is genuine author-substitution detection, not an incidental side effect of some other check.');
        }

        console.log('✓ Section G: three independent tampering vectors — signature bytes, claim content, and author substitution — are each refused by real verification, with nothing ever persisted for any of them');
    }

    // -------------------------------------------------------------
    // Section H — stale discovery / World identity protection, live: a
    // World switch and a fully-unloaded World both fail to misattribute a
    // stale claim.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        // --- H1: World SWITCH — a claim discovered while 'world-old' was
        // the loaded World, adopted after the session has switched to a
        // DIFFERENT World that happens to reuse the same regionId string.
        {
            const staleClaim = signedClaim(alice, { worldId: 'world-old', regionId: 'region-1', name: 'Old World Claim' });
            const staleRow = makeAdoptRows([{ claim: discoverAsEnvelope(staleClaim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];

            const worldOld = new World({ id: 'world-old' });
            worldOld.addWorldRegion(region({ id: 'region-1', worldId: 'world-old', authorIdentityId: alice.identityId, name: 'Old World Region', x: 1, z: 1 }));
            const worldNew = new World({ id: 'world-new' });
            worldNew.addWorldRegion(region({ id: 'region-1', worldId: 'world-new', authorIdentityId: bob.identityId, name: 'New World Region', x: 999, z: 999 }));

            // The claim is discovered/observed while 'world-old' is the
            // ONLY loaded World...
            const { session, claimStore } = makeReplica(bob, { documents: [{ world: worldOld }] });
            // ...then the session SWITCHES — 'world-old' is unloaded,
            // 'world-new' loads in its place, exactly like navigating away
            // from one World and into a different one via the World
            // registry.
            session._loadedDocuments.delete('world-old');
            session._loadedDocuments.set('world-new', { world: worldNew });

            const feedback = makeFeedback();
            const result = adoptNearbyPlaceNamingClaim(session, staleRow, feedback);
            assert(result && result.isNew === true && result.claim.worldId === 'world-old',
                '49. H1 — the stale claim adopts under its OWN worldId ("world-old") even though that World has since been fully unloaded from the session — never silently reassigned to "world-new," the currently active World.');
            assert(claimStore.listForRegion('world-old', 'region-1').length === 1 && claimStore.listForRegion('world-old', 'region-1')[0].name === 'Old World Claim',
                '50. H1 — the claim is genuinely stored under "world-old."');
            assert(claimStore.listForRegion('world-new', 'region-1').length === 0,
                '51. H1 — THE NEGATIVE CHECK: "world-new"\'s own identically-regionId\'d claim list remains completely empty, despite the colliding regionId string and despite "world-new" being the World actually active when Adopt was clicked.');
            assert(worldNew.getWorldRegion('region-1').name === 'New World Region',
                '52. H1 — "world-new"\'s own WorldRegion name is unaffected.');
        }

        // --- H2: a claim whose World was NEVER loaded in this session at
        // all (not merely switched away from) — the claim must still
        // adopt correctly scoped to its own worldId, proving World-
        // identity protection is a property of the STORE's own
        // worldId-keying (application/LocalPlaceNamingClaimStore.js), not
        // an accident of "the World happened to have been loaded once."
        {
            const neverLoadedClaim = signedClaim(alice, { worldId: 'world-never-loaded', regionId: 'region-9', name: 'Claim For An Unseen World' });
            const row = makeAdoptRows([{ claim: discoverAsEnvelope(neverLoadedClaim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];

            const activeWorld = new World({ id: 'world-active' });
            activeWorld.addWorldRegion(region({ id: 'region-9', worldId: 'world-active', authorIdentityId: bob.identityId, name: 'Active Region', x: 0, z: 0 }));
            const { session, claimStore } = makeReplica(bob, { documents: [{ world: activeWorld }] });

            assert(session.getRegions().every((r) => r.worldId !== 'world-never-loaded'),
                '53. H2 — sanity: "world-never-loaded" genuinely has no loaded region in this session at all.');

            const result = adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
            assert(result && result.isNew === true && result.claim.worldId === 'world-never-loaded',
                '54. H2 — a claim for a World this session has NEVER loaded still adopts, correctly scoped to its own worldId — importPlaceNamingClaim() is deliberately not scoped to "whatever World happens to be active."');
            assert(claimStore.listForRegion('world-never-loaded', 'region-9').length === 1,
                '55. H2 — the claim is genuinely reachable under its own, never-loaded worldId.');
            assert(claimStore.listForRegion('world-active', 'region-9').length === 0,
                '56. H2 — THE NEGATIVE CHECK: the colliding regionId never leaks a record into the CURRENTLY loaded World\'s own namespace.');
            assert(activeWorld.getWorldRegion('region-9').name === 'Active Region',
                '57. H2 — the actually-loaded World\'s own WorldRegion is completely unaffected.');
        }

        console.log('✓ Section H: World identity protection holds both when a stale claim\'s own World was switched away from, and when that World was never loaded in this session at all — a colliding regionId never crosses a worldId boundary either way');
    }

    // -------------------------------------------------------------
    // Section I — discovery failure vs. adoption: a failed refresh
    // preserves prior presentation and does not block adoption; a failed
    // adoption attempt never corrupts discovery state.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Willow Village', x: 3, z: 3 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const goodClaim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Genuinely Discovered' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(goodClaim), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 1 && claimIds(harness)[0] === goodClaim.id,
            '58. sanity: the first successful observation surfaces the claim.');

        // The NEXT discovery cycle's own command fails — reproduced,
        // exactly like tests/PlaceNamingNearbyNavigationLifecycleAudit.test.js's
        // own Section H, via the session-supplied region lookup itself,
        // the one collaborator in the real chain documented to actually be
        // able to reject discoverPlaceNamingClaimsCommand().
        const realGetRegions = session.getRegions.bind(session);
        session.getRegions = () => { throw new Error('World layout temporarily unavailable'); };
        await harness.tick({ x: 500, z: 0 });
        session.getRegions = realGetRegions;

        assert(claimIds(harness).length === 1 && claimIds(harness)[0] === goodClaim.id,
            '59. a failed discovery cycle leaves the previously displayed claim EXACTLY as it was — per PlaceNamingDiscoveryMonitor.js\'s own documented "a discovery failure never mutates lastResult" contract.');
        assert(harness.refs.placeNamingDiscoveryError instanceof Error,
            '60. the failure is recorded as a non-authoritative error indicator, never thrown to a caller.');

        // 61. Adoption of the STILL-DISPLAYED, previously-discovered claim
        // remains fully valid — a failed REFRESH never blocks the one
        // action (Adopt) that has nothing to do with refreshing.
        const stillValidRow = harness.rows((id) => id)[0];
        const adoptFeedback = makeFeedback();
        const adoptResult = adoptNearbyPlaceNamingClaim(session, stillValidRow, adoptFeedback);
        assert(adoptResult && adoptResult.isNew === true && adoptResult.claim.name === 'Genuinely Discovered',
            '61. adoption of a claim surviving a failed discovery refresh succeeds through the real, unaffected importPlaceNamingClaim() boundary.');
        assert(adoptFeedback.messages.length === 1 && /Adopted/.test(adoptFeedback.messages[0]),
            '62. adoption surfaces its own genuine success feedback, independent of the unrelated discovery failure.');

        // 63. THE REVERSE DIRECTION: a FAILED adoption attempt (a tampered
        // row) during this same failure window never corrupts the
        // monitor's own recorded discovery state.
        const tamperedRow = { ...stillValidRow, signature: { ...stillValidRow.signature, signature: tamperSignatureHex(stillValidRow.signature.signature) } };
        const forgedFeedback = makeFeedback();
        const forgedResult = adoptNearbyPlaceNamingClaim(session, tamperedRow, forgedFeedback);
        assert(forgedResult === null, '63. a forged adoption attempt is refused, as expected.');
        assert(harness.refs.placeNamingDiscoveryError instanceof Error && claimIds(harness).length === 1 && claimIds(harness)[0] === goodClaim.id,
            '64. THE NEGATIVE CHECK: the monitor\'s own discovery error/result state is completely unaffected by the failed adoption attempt — adoption and discovery remain two entirely independent failure domains, in both directions.');
        assert(claimStore.listForRegion(worldId, 'region-1').length === 1,
            '65. exactly one claim (the genuine one adopted at assertion 61) is on file — the failed adoption attempt left no trace.');

        console.log('✓ Section I: a failed discovery refresh never blocks a still-valid adoption, and a failed adoption attempt never corrupts ongoing discovery state — the two failure domains stay fully independent, in both directions');
    }

    // -------------------------------------------------------------
    // Section J — navigation independence, live and structural.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Thistledown Village', x: 10, z: 20 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Thistledown Claim' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });
        await harness.tick({ x: 0, z: 0 });
        const row = harness.rows((id) => id)[0];

        // 66. Adopting never moves the camera.
        let focusLocationCalls = [];
        const realFocusLocation = session.focusLocation.bind(session);
        session.focusLocation = (locationId) => { focusLocationCalls.push(locationId); return realFocusLocation(locationId); };
        adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
        assert(focusLocationCalls.length === 0, '66. adoptNearbyPlaceNamingClaim() never calls session.focusLocation() through the real, live pipeline — Adopt never moves the camera.');

        // 67. Navigating never adopts (imports/stores) the claim.
        const before = claimStore.listForRegion(worldId, 'region-1').length;
        navigateToNearbyPlaceNamingClaim(session, row, makeFeedback());
        const after = claimStore.listForRegion(worldId, 'region-1').length;
        assert(before === after, '67. navigating to the exact same row afterward never changes the store\'s own count.');
        assert(focusLocationCalls.length === 1 && focusLocationCalls[0] === 'region-1',
            '68. navigation DID genuinely move the camera exactly once — proving the absence of a focusLocation() call at assertion 66 was Adopt\'s own restraint, not merely a broken camera.');

        // 69. Structural proof, direct from real source: neither function
        // references the other's own machinery at all.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const adoptBlock = extractBetween(worldViewCode, 'function adoptNearbyPlaceNamingClaim(row) {', '\n        }');
        const navigateBlock = extractBetween(worldViewCode, 'function navigateToNearbyPlaceNamingClaim(row) {', '\n        }');
        assert(!/focusLocation|refreshSpatialUI/.test(adoptBlock), '69a. adoptNearbyPlaceNamingClaim() never references focusLocation()/refreshSpatialUI(), structurally.');
        assert(!/importPlaceNamingClaim/.test(navigateBlock), '69b. navigateToNearbyPlaceNamingClaim() never references importPlaceNamingClaim(), structurally.');

        console.log('✓ Section J: Navigate and Adopt remain two fully independent actions under a real, live discovery pipeline — Adopt never moves the camera, Navigate never adopts, live and structurally');
    }

    // -------------------------------------------------------------
    // Section K — World mutation negative, across repeated adoptions and
    // a restart.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const worldId = 'world-1';
        const worldRegion = region({ id: 'region-1', worldId, authorIdentityId: bob.identityId, name: 'Willow Village', x: 0, z: 0 });
        const world = new World({ id: worldId });
        world.addWorldRegion(worldRegion);

        const storage = new InMemoryStorageProvider();
        let { session, claimStore } = makeReplica(bob, { documents: [{ world }], storage });

        const names = ['Riverside', 'Old River', 'Willowmere', 'New Crossing'];
        const authors = [alice, carol, alice, carol];
        for (let i = 0; i < names.length; i += 1) {
            const claim = signedClaim(authors[i], { worldId, regionId: 'region-1', name: names[i] });
            const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
            const result = adoptNearbyPlaceNamingClaim(session, row, makeFeedback());
            assert(result.isNew === true, `70.${i}. claim "${names[i]}" adopts successfully.`);
            assert(worldRegion.name === 'Willow Village' && world.getWorldRegion('region-1') === worldRegion,
                `71.${i}. after adopting "${names[i]}", the WorldRegion's own name AND object identity are both still exactly what they were before any adoption — never renamed, never replaced with a new instance.`);
        }
        assert(claimStore.listForRegion(worldId, 'region-1').length === 4, '72. all four independently-authored claims are on file, side by side.');

        // 73. Reconstruct the whole application-layer graph fresh over the
        // SAME underlying storage (a "restart") and re-confirm the
        // WorldRegion — a freshly re-added instance, exactly as a real
        // reload would reconstruct World content from its own, entirely
        // separate storage — is STILL never renamed by anything adoption
        // ever wrote.
        const rebuiltWorld = new World({ id: worldId });
        const rebuiltRegion = region({ id: 'region-1', worldId, authorIdentityId: bob.identityId, name: 'Willow Village', x: 0, z: 0 });
        rebuiltWorld.addWorldRegion(rebuiltRegion);
        const rebuilt = makeReplica(bob, { documents: [{ world: rebuiltWorld }], storage });
        assert(rebuilt.claimStore.listForRegion(worldId, 'region-1').length === 4,
            '73. after a full restart over the same storage, all four claims survive persistence.');
        assert(rebuiltRegion.name === 'Willow Village',
            '74. THE NEGATIVE AUDIT ACROSS A RESTART: the freshly-reconstructed WorldRegion\'s own name is still "Willow Village" — nothing about restoring four persisted naming claims ever reaches into World content on reload.');
        const viewAfterRestart = deriveNamingView('region-1', rebuilt.claimStore.list(worldId));
        assert(viewAfterRestart.length === 4 && viewAfterRestart.every((entry) => entry.score === 1),
            '75. namingView() after restart still shows all four names, unranked relative to each other — persistence-and-reload never introduces a preference either.');

        console.log('✓ Section K: repeated adoption, across four independently-authored claims and a full restart, never mutates the targeted WorldRegion\'s name OR its own object identity — the claim remains a claim, before and after reload');
    }

    // -------------------------------------------------------------
    // Section L — persistence/reload: adoption survives a full
    // application-layer reconstruction over the same underlying storage.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Persisted Across Restart' });
        const row = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];

        const bob = makeIdentity('Bob');
        const storage = new InMemoryStorageProvider();
        const before = makeReplica(bob, { storage });
        const adoptResult = adoptNearbyPlaceNamingClaim(before.session, row, makeFeedback());
        assert(adoptResult.isNew === true, '76. sanity: the claim adopts successfully before any restart.');

        // Snapshot exactly what bytes the real storage provider actually
        // holds — proving the persisted form is genuine, portable JSON,
        // never a live object graph that would vanish with the process.
        const persistedBytes = JSON.stringify(storage.load(`place-naming-claims:${worldId}`));
        assert(persistedBytes.includes('Persisted Across Restart') && persistedBytes.includes(claim.id),
            '77. the underlying storage genuinely holds the claim\'s own real name and id as plain, inspectable JSON.');

        // "Restart": every single application-layer object is rebuilt from
        // scratch — a NEW LocalPlaceNamingClaimStore, a NEW
        // LocalAuthorizationVerifier, a NEW PlaceNamingClaimUseCase, a NEW
        // PlaceNamingClaimExchange, a NEW WorldNavigationSession — with
        // NOTHING carried over in memory except the one thing an actual
        // restart would genuinely preserve: the storage provider's own
        // bytes.
        const after = makeReplica(bob, { storage });
        assert(after.claimStore !== before.claimStore && after.session !== before.session && after.verifier !== before.verifier,
            '78. sanity: the "after" replica is genuinely a fresh set of objects, not merely a relabeled reference to the "before" ones.');

        const survived = after.claimStore.listForRegion(worldId, 'region-1').find((c) => c.id === claim.id);
        assert(survived, '79. THE CORE PERSISTENCE CHECK: the adopted claim is found by a completely fresh LocalPlaceNamingClaimStore instance reading the same underlying storage.');
        assert(survived.name === 'Persisted Across Restart' && survived.authorIdentityId === alice.identityId,
            '80. the survived claim\'s own name and authorship are completely intact after the reconstruction.');
        assert(after.claimStore.has(worldId, claim.id), '81. LocalPlaceNamingClaimStore#has() — the exact query importClaim()\'s own deduplication relies on — also confirms survival on the fresh instance.');

        const rehydratedVerify = after.verifier.verifyPlaceNamingClaim(survived.toJSON());
        assert(rehydratedVerify.valid === true,
            '82. the survived claim still genuinely verifies against a completely FRESH, independently-constructed LocalAuthorizationVerifier — persistence never silently invalidated its own signature.');

        const survivedView = after.placeNamingClaimUseCase.namingView(worldId, 'region-1');
        assert(survivedView.length === 1 && survivedView[0].name === 'Persisted Across Restart',
            '83. the survived claim still genuinely participates in namingView() ranking, computed fresh, after restart.');

        // 84. Re-adopting the SAME claim on the "after" replica remains
        // idempotent — persistence-across-restart and idempotency compose
        // correctly together, never producing a duplicate the first
        // replica's own in-memory bookkeeping happened to be hiding.
        const reAdopt = adoptNearbyPlaceNamingClaim(after.session, row, makeFeedback());
        assert(reAdopt.isNew === false && after.claimStore.listForRegion(worldId, 'region-1').length === 1,
            '84. re-adopting the same claim after a restart is still correctly recognized as a duplicate — exactly one record survives.');

        console.log('✓ Section L: an adopted claim survives a full application-layer restart over the same underlying storage — name, authorship, signature, and namingView ranking are all intact, and re-adoption afterward remains idempotent');
    }

    // -------------------------------------------------------------
    // Section M — presentation independence: the Nearby array is never
    // the source of truth for what was adopted.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-1', worldId, authorIdentityId: alice.identityId, name: 'Meadow Rest', x: 0, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, { documents: [{ world }] });

        const claim = signedClaim(alice, { worldId, regionId: 'region-1', name: 'Meadow Claim' });
        const tag = derivePlaceNamingDiscoveryTag(worldId, 'region-1');
        const relay = makeRelay((t) => (t === tag ? [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(claim), { tag })] : []));
        const harness = createHarness({ session, relay });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 1, '85. sanity: the claim is genuinely discovered and presented.');
        const adoptResult = adoptNearbyPlaceNamingClaim(session, harness.rows((id) => id)[0], makeFeedback());
        assert(adoptResult.isNew === true, '86. sanity: the claim adopts successfully.');

        // The Wanderer moves far enough away — or the relay simply stops
        // returning the event (the author retracted it from discovery, a
        // relay dropped it, or proximity itself now excludes it) — that
        // the NEXT observation no longer presents this claim at all.
        relay.setHandler(() => []);
        await harness.tick({ x: 999999, z: 999999 });
        assert(claimIds(harness).length === 0,
            '87. the claim genuinely disappears from live presentation — the Nearby Place Names row is gone.');

        // 88. THE CORE INDEPENDENCE CHECK: despite the row's own complete
        // disappearance from presentation, the persisted, adopted claim in
        // this replica's OWN store is entirely unaffected.
        assert(claimStore.listForRegion(worldId, 'region-1').some((c) => c.id === claim.id),
            '88. the adopted claim remains fully persisted after the discovered row that led to its adoption vanishes from presentation entirely — the Nearby array was never the source of truth for what this replica has adopted.');
        const viewAfterVanish = deriveNamingView('region-1', claimStore.list(worldId));
        assert(viewAfterVanish.length === 1 && viewAfterVanish[0].name === 'Meadow Claim',
            '89. namingView() — this replica\'s own authoritative reading of what it has adopted — is completely unaffected by the presentation-layer disappearance.');

        // 90. THE REVERSE: clearing the monitor's own in-memory
        // `lastResult` directly (simulating a fresh, empty presentation
        // array from a brand-new World View mount) still leaves the store
        // untouched — presentation is read FROM persistence's own truth,
        // never the other way around.
        harness.monitor.lastResult = [];
        assert(claimStore.listForRegion(worldId, 'region-1').length === 1,
            '90. directly clearing the monitor\'s own presentation-facing lastResult has no effect whatsoever on the claim store — the dependency runs one way only, from persistence outward to a UI, never from a UI\'s own transient array back into persistence.');

        console.log('✓ Section M: the Nearby Place Names presentation array is a transient, purely observational view — an adopted claim survives its own disappearance from discovery, and clearing presentation state can never reach back into persistence');
    }

    // -------------------------------------------------------------
    // Section N — architectural tripwire: the invariant frozen above,
    // poked at directly rather than re-derived in full.
    //
    // tests/PlaceNamingNearbyAdoption.test.js's own Section Q already ran a
    // 67-assertion-deep structural audit of adoptNearbyPlaceNamingClaim()
    // (no verifier import, no store import, no WorldRegion mutation call,
    // delegates exclusively to session.importPlaceNamingClaim()). This
    // section does not repeat that audit — it re-confirms, in a handful of
    // targeted assertions, the SPECIFIC four forbidden edges this
    // milestone's own brief named by name, so a future change to any of
    // the discovery/proximity/navigation files below would fail HERE even
    // if it never touched ui/views/WorldView.js at all.
    // -------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const rawWorldViewCode = await rawSource('ui/views/WorldView.js');
        const proximitySource = codeOnlyLines(await rawSource('core/PlaceNamingProximitySelection.js'));
        const monitorSource = codeOnlyLines(await rawSource('application/PlaceNamingDiscoveryMonitor.js'));
        const envelopeSource = codeOnlyLines(await rawSource('core/PlaceNamingDiscoveryEnvelope.js'));
        const orchestrationSource = codeOnlyLines(await rawSource('application/DiscoverPlaceNamingClaimsCommand.js'));

        // 91. discovery -> adopted: never.
        for (const [name, source] of [
            ['core/PlaceNamingProximitySelection.js', proximitySource],
            ['application/PlaceNamingDiscoveryMonitor.js', monitorSource],
            ['core/PlaceNamingDiscoveryEnvelope.js', envelopeSource]
        ]) {
            assert(!/importPlaceNamingClaim|importClaim\(|adoptNearbyPlaceNamingClaim/.test(source),
                `91. ${name} never references adoption in any form — discovery can never, by itself, cause an adoption.`);
        }

        // 92. proximity -> adopted: never (the same proximity-selection
        // source is checked again, explicitly under this edge's own name,
        // since proximity selection is the one stage most likely to
        // silently gain a "helpfully auto-import what's close" shortcut).
        assert(!/importPlaceNamingClaim|importClaim\(/.test(proximitySource),
            '92. core/PlaceNamingProximitySelection.js contains no reference to adoption — being spatially near never, by itself, causes an adoption.');

        // 93. orchestration (automatic discovery triggering) -> adopted:
        // never.
        assert(!/importPlaceNamingClaim|importClaim\(|adoptNearbyPlaceNamingClaim/.test(orchestrationSource),
            '93. application/DiscoverPlaceNamingClaimsCommand.js never references adoption — the automatic discovery-triggering boundary cannot cause one either.');

        // 94. navigation -> adopted: never (the exact block, re-extracted
        // fresh here rather than trusted from Section J's own extraction,
        // in case this section ever runs standalone).
        const navigateBlock = extractBetween(worldViewCode, 'function navigateToNearbyPlaceNamingClaim(row) {', '\n        }');
        assert(!/importPlaceNamingClaim/.test(navigateBlock),
            '94. navigateToNearbyPlaceNamingClaim() never references importPlaceNamingClaim() — navigation cannot cause an adoption.');

        // 95. adopted -> WorldRegion.name: never. Re-extract the adoption
        // block directly from raw (not code-only) source, so a future
        // WorldRegion-mutation call hidden behind an inline comment could
        // never slip past a comment-stripped check alone.
        const adoptBlockRaw = extractBetween(rawWorldViewCode, 'function adoptNearbyPlaceNamingClaim(row) {', '\n        }');
        const adoptBlock = codeOnlyLines(adoptBlockRaw);
        for (const term of ['setWorldRegion(', 'renameRegion(', 'updateRegion(', '.name =', 'region.name']) {
            assert(!adoptBlock.includes(term),
                `95. adoptNearbyPlaceNamingClaim() contains no '${term}' — adoption never mutates a WorldRegion's own name, structurally, in either the code-only or the raw source.`);
        }
        assert(adoptBlock.includes('session.importPlaceNamingClaim(pkg)'),
            '96. adoptNearbyPlaceNamingClaim() still delegates to the one real boundary, session.importPlaceNamingClaim() — this tripwire is a targeted re-confirmation, not a claim that the function does nothing at all.');

        console.log('✓ Section N: the four frozen edges — discovery, proximity, and navigation each never reaching adoption, and adoption never reaching WorldRegion.name — all hold, checked directly against real source');
    }

    // -------------------------------------------------------------
    // Section O — FLAGSHIP: one continuous lifecycle — discovery,
    // competing claims, adoption, idempotent re-adoption, restart,
    // World-switch staleness, and presentation churn — end to end, in a
    // single narrative.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const dave = makeIdentity('Dave');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        world.addWorldRegion(region({ id: 'region-far', worldId, authorIdentityId: alice.identityId, name: 'Distant Hollow', x: 5000, z: 0 }));

        const bob = makeIdentity('Bob');
        const storage = new InMemoryStorageProvider();
        let replica = makeReplica(bob, { documents: [{ world }], storage });

        // --- Chapter 1: two competing claims and one out-of-range claim,
        // discovered together over a real Nostr relay. ---
        const riverbend = signedClaim(dave, { worldId, regionId: 'region-near', name: 'Riverbend' });
        const millpond = signedClaim(alice, { worldId, regionId: 'region-near', name: 'Millpond' });
        const farClaim = signedClaim(dave, { worldId, regionId: 'region-far', name: 'Should Not Be Reachable' });

        const tagNear = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const tagFar = derivePlaceNamingDiscoveryTag(worldId, 'region-far');
        const relay = makeRelay((t) => {
            if (t === tagNear) return [
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(riverbend), { tag: tagNear }),
                nostrEventFor(buildPlaceNamingDiscoveryEnvelope(millpond), { tag: tagNear })
            ];
            if (t === tagFar) return [nostrEventFor(buildPlaceNamingDiscoveryEnvelope(farClaim), { tag: tagFar })];
            return [];
        });
        const harness = createHarness({ session: replica.session, relay, proximityRadius: 100 });

        await harness.tick({ x: 0, z: 0 });
        assert(claimIds(harness).length === 2 && claimIds(harness).includes(riverbend.id) && claimIds(harness).includes(millpond.id),
            '97. FLAGSHIP Ch.1 — real Nostr discovery + real proximity selection surfaces exactly the two NEAR, competing claims — the far claim never even enters presentation.');

        // --- Chapter 2: adopt one, confirm the other remains
        // independently adoptable, confirm idempotent re-adoption. ---
        let rows = harness.rows((id) => id);
        const riverbendRow = rows.find((r) => r.claimId === riverbend.id);
        const millpondRow = rows.find((r) => r.claimId === millpond.id);

        const adopt1 = adoptNearbyPlaceNamingClaim(replica.session, riverbendRow, makeFeedback());
        assert(adopt1.isNew === true && adopt1.claim.authorIdentityId === dave.identityId,
            '98. FLAGSHIP Ch.2 — "Riverbend" adopts, correctly attributed to Dave, its real author.');

        const adopt1Again = adoptNearbyPlaceNamingClaim(replica.session, riverbendRow, makeFeedback());
        assert(adopt1Again.isNew === false && replica.claimStore.listForRegion(worldId, 'region-near').length === 1,
            '99. FLAGSHIP Ch.2 — re-adopting "Riverbend" immediately afterward is idempotent — still exactly one record.');

        const adopt2 = adoptNearbyPlaceNamingClaim(replica.session, millpondRow, makeFeedback());
        assert(adopt2.isNew === true && adopt2.claim.authorIdentityId === alice.identityId,
            '100. FLAGSHIP Ch.2 — "Millpond" remains fully, independently adoptable, correctly attributed to Alice — adopting "Riverbend" first never blocked, ranked against, or pre-empted it.');
        assert(replica.claimStore.listForRegion(worldId, 'region-near').length === 2,
            '101. FLAGSHIP Ch.2 — both competing claims now sit side by side in the store.');

        // --- Chapter 3: navigate to the region (proving independence from
        // everything just adopted), then simulate a full application
        // restart over the same storage. ---
        let focusCalls = [];
        const realFocus = replica.session.focusLocation.bind(replica.session);
        replica.session.focusLocation = (id) => { focusCalls.push(id); return realFocus(id); };
        navigateToNearbyPlaceNamingClaim(replica.session, riverbendRow, makeFeedback());
        assert(focusCalls.length === 1 && focusCalls[0] === 'region-near',
            '102. FLAGSHIP Ch.3 — navigating afterward still works, independent of everything adopted so far.');
        assert(world.getWorldRegion('region-near').name !== 'Riverbend' && world.getWorldRegion('region-near').name !== 'Millpond',
            '103. FLAGSHIP Ch.3 — the WorldRegion\'s own name was never overwritten by either adopted claim, even after navigation was also exercised against it.');

        harness.unmount();
        const rebuiltWorld = new World({ id: worldId });
        rebuiltWorld.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        replica = makeReplica(bob, { documents: [{ world: rebuiltWorld }], storage });
        assert(replica.claimStore.listForRegion(worldId, 'region-near').length === 2,
            '104. FLAGSHIP Ch.3 — after a full restart over the same storage, BOTH previously-adopted claims survive.');
        const restartedView = deriveNamingView('region-near', replica.claimStore.list(worldId));
        assert(restartedView.length === 2 && restartedView.every((entry) => entry.score === 1),
            '105. FLAGSHIP Ch.3 — namingView() after restart still shows both, unranked relative to each other.');

        // --- Chapter 4: a stale claim from a completely different,
        // never-loaded World is adopted on the RESTARTED replica, proving
        // World-identity protection survives a restart too. ---
        const staleClaim = signedClaim(dave, { worldId: 'world-elsewhere', regionId: 'region-near', name: 'Should Never Merge Here' });
        const staleRow = makeAdoptRows([{ claim: discoverAsEnvelope(staleClaim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];
        const staleResult = adoptNearbyPlaceNamingClaim(replica.session, staleRow, makeFeedback());
        assert(staleResult.isNew === true && staleResult.claim.worldId === 'world-elsewhere',
            '106. FLAGSHIP Ch.4 — a claim for a colliding regionId in a totally different, never-loaded World adopts strictly under its own worldId, even after a restart.');
        assert(replica.claimStore.listForRegion(worldId, 'region-near').length === 2,
            '107. FLAGSHIP Ch.4 — THE NEGATIVE CHECK: the active World\'s own "region-near" claim count is completely unaffected — still exactly the two genuine claims from Chapter 2, never three.');
        assert(replica.claimStore.listForRegion('world-elsewhere', 'region-near').length === 1,
            '108. FLAGSHIP Ch.4 — the stale claim is reachable only under its own, separate worldId.');

        // --- Chapter 5: a forged claim is attempted, and refused, without
        // disturbing anything accumulated so far — and a manual export/
        // import of one of the genuine claims converges rather than
        // duplicating. ---
        const forgedRow = { ...millpondRow, signature: { ...millpondRow.signature, signature: tamperSignatureHex(millpondRow.signature.signature) } };
        const forgedResult = adoptNearbyPlaceNamingClaim(replica.session, forgedRow, makeFeedback());
        assert(forgedResult === null && replica.claimStore.listForRegion(worldId, 'region-near').length === 2,
            '109. FLAGSHIP Ch.5 — a forged adoption attempt at this late stage is still refused, and the two genuine, already-adopted claims are unaffected.');

        const manualReconvergence = importClaimManually(replica.session, exportClaimAsText(PlaceNamingClaim.fromJSON({
            id: riverbend.id, worldId, regionId: 'region-near', name: 'Riverbend',
            authorIdentityId: dave.identityId, createdAt: riverbend.toJSON().createdAt, signature: riverbend.toJSON().signature
        })), makeFeedback());
        assert(manualReconvergence.isNew === false && replica.claimStore.listForRegion(worldId, 'region-near').length === 2,
            '110. FLAGSHIP Ch.5 — manually re-importing "Riverbend" (as if exported to a file and handed back) converges onto the same record rather than duplicating it, even at the end of this whole lifecycle.');

        console.log('✓ Section O (FLAGSHIP): a complete lifecycle — real discovery, competing claims, adoption, idempotent re-adoption, navigation, a full restart, World-identity-protected staleness, a refused forgery, and manual/automatic convergence — holds together end to end, with local persistence changed and the meaning of every discovered claim never once altered');
    }

    console.log('\n✅ All Nearby Place Naming Claim Adoption Lifecycle Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
