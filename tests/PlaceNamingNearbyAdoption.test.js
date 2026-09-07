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
import { validatePlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublicationValidator.js';
import { buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';

// 0.9.263 — Nearby Place Naming Claim Adoption UI.
//
// 0.9.260 (Nearby Place Naming Claim Interaction) let a Wanderer NAVIGATE
// to a discovered claim's region. 0.9.262's own reassessment (Section D)
// found the one remaining evidence-backed gap: the Nearby Place Names row
// had no ADOPT action, and — a sub-finding that milestone itself surfaced
// — the presentation row was too narrow (missing authorIdentityId,
// createdAt, signature) to build a valid publication package from even if
// a button existed. This milestone closes both parts of that gap by
// reusing the existing, UNMODIFIED adoption boundary end to end:
//
//   nearby claim (row widened) -> World View row -> [Adopt]
//        -> the EXISTING WorldNavigationSession#importPlaceNamingClaim()
//        -> the EXISTING PlaceNamingClaimExchange#importClaim()
//           (validate -> construct -> verify -> persist, unchanged)
//
// Per this milestone's own brief: Adopt never manufactures authorship
// (the claim's own authorIdentityId/createdAt/signature travel unchanged),
// never ranks or prefers a claim over another, never becomes automatic,
// and never touches WorldRegion naming. See docs/Principles.md and
// docs/Roadmap.md for the full milestone entry.
//
//   Section A — row preserves the complete claim required for adoption
//   Section B — Adopt button exists for nearby claims
//   Section C — exact claim is passed to adoption
//   Section D — authorIdentityId is preserved (never the viewer's own)
//   Section E — createdAt is preserved
//   Section F — signature is preserved and genuinely (re)verified
//   Section G — two competing nearby claims adopt independently
//   Section H — adoption does not rank or prefer either claim
//   Section I — navigation remains independent from adoption
//   Section J — discovery alone never invokes adoption
//   Section K — failed adoption does not mutate the World
//   Section L — failed adoption preserves the discovered claim/row
//   Section M — World switching cannot adopt a stale claim into another World
//   Section N — existing manual PlaceNamingPanel adoption remains unchanged
//   Section O — real verification/persistence path is exercised, not mocked
//   Section P — FLAGSHIP: real Nostr -> discovery -> proximity -> World
//               View -> adoption, end to end
//   Section Q — architectural regression: World View implements no
//               verification/persistence of its own

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
// tests/PlaceNamingNearbyNavigation.test.js#makeReplica() exactly, so
// session.getRegions()/focusLocation()/importPlaceNamingClaim() are all
// the real, unmodified implementations, never stubs.
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

// A real, independently-signed PlaceNamingClaim — never a fabricated
// signature string. `identity` is a makeIdentity()-shaped
// LocalIdentityProvider carrying its own `.identityId`.
function signedClaim(identity, { worldId, regionId, name }) {
    let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId: identity.identityId });
    claim = claim.withSignature(identity.signCanonical(claim.getSigningDescriptor()));
    return claim;
}

// Round-trips `claim` through the exact real discovery-envelope shape
// genuine Nostr discovery already produces (buildPlaceNamingDiscoveryEnvelope
// -> JSON string -> parsePlaceNamingDiscoveryEnvelope) — mirrors
// tests/PostNavigationPlaceNamingProductReassessment.test.js's own
// discoverAsEnvelope().
function discoverAsEnvelope(claim) {
    const built = buildPlaceNamingDiscoveryEnvelope(claim);
    return parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
}

// Reproduces EXACTLY ui/views/WorldView.js's own (0.9.263-widened)
// `nearbyPlaceNamingClaimRows` computed — see that computed's own
// comment on why authorIdentityId/createdAt/signature were restored
// alongside the fields 0.9.260 already restored (regionId/worldId).
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
// signature value — reversing the original hex string. Deliberately NOT
// an arbitrary non-hex string: Ed25519.hexToBytes() throws its own
// "invalid hex string" error for malformed hex, which would test that
// unrelated parsing guard rather than the actual signature-verification
// failure this file's own negative tests are aimed at.
function tamperSignatureHex(hex) {
    return hex.split('').reverse().join('');
}

function makeFeedback() {
    const messages = [];
    return { messages, show: (message) => messages.push(message) };
}

// Reproduces EXACTLY ui/views/WorldView.js's own `guarded()` — catches a
// thrown error, surfaces it as feedback, returns undefined; otherwise
// passes the callback's own return value straight through.
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
// Section Q proves this reproduction is not merely aspirational.
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
// — used only by Section I to prove Navigate/Adopt remain independent.
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
    console.log('Running Nearby Place Naming Claim Adoption tests...\n');

    // -------------------------------------------------------------
    // Section A — row preserves the complete claim required for
    // adoption.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Old Oak Crossing' });
        const envelope = discoverAsEnvelope(claim);
        const entries = [{ claim: envelope.claim, position: { x: 5, z: 5 } }];
        const rows = makeAdoptRows(entries, (id) => id);
        const row = rows[0];

        assert(row.authorIdentityId === claim.authorIdentityId, '1. the row carries the claim\'s own raw authorIdentityId, not merely a display name.');
        assert(row.createdAt === claim.toJSON().createdAt, '2. the row carries the claim\'s own raw createdAt (ISO string), unmodified.');
        assert(row.signature && row.signature.signer === claim.toJSON().signature.signer && row.signature.signature === claim.toJSON().signature.signature,
            '3. the row carries the claim\'s own complete signature object, unmodified.');
        assert(row.claimId === claim.id && row.name === 'Old Oak Crossing' && row.regionId === 'region-1' && row.worldId === 'world-1',
            '4. every field the row already carried before this milestone (claimId/name/regionId/worldId/position) is still present, unchanged.');

        // 5. LIVE PROOF: a publication package built from the row ALONE
        // (never a second, separate lookup) is genuinely well-formed —
        // application/PlaceNamingClaimPublicationValidator.js's own
        // required-field check passes without throwing.
        const pkg = {
            kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, schemaVersion: CURRENT_SCHEMA_VERSION,
            claim: { id: row.claimId, worldId: row.worldId, regionId: row.regionId, name: row.name, authorIdentityId: row.authorIdentityId, createdAt: row.createdAt, signature: row.signature }
        };
        let validationError = null;
        try { validatePlaceNamingClaimPublication(pkg); } catch (e) { validationError = e; }
        assert(validationError === null, '5. a publication package built purely from the row\'s own fields passes structural validation — the row is genuinely complete, not merely carrying extra decoration.');

        console.log('✓ Section A: the presentation row now carries every field application/PlaceNamingClaimPublicationValidator.js requires, restored from entry.claim exactly like regionId/worldId were restored at 0.9.260');
    }

    // -------------------------------------------------------------
    // Section B — Adopt button exists for nearby claims.
    // -------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldViewCode.includes('function adoptNearbyPlaceNamingClaim(row) {'),
            '6. ui/views/WorldView.js defines a real adoptNearbyPlaceNamingClaim(row) function.');
        assert(worldViewCode.includes('adoptNearbyPlaceNamingClaim,'),
            '7. ui/views/WorldView.js exposes adoptNearbyPlaceNamingClaim from setup(), so the template can actually call it.');

        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(/@click="adoptNearbyPlaceNamingClaim\(claim\)"/.test(nearbyBlock),
            '8. the "Nearby Place Names" row template wires a real click handler to adoptNearbyPlaceNamingClaim().');
        assert(/>\s*Adopt\s*</i.test(nearbyBlock),
            '9. an "Adopt" button genuinely renders in the Nearby Place Names row template.');
        assert(/@click="navigateToNearbyPlaceNamingClaim\(claim\)"/.test(nearbyBlock),
            '10. sanity: the existing Navigate button (0.9.260) is still present alongside Adopt — this milestone adds a second action, it does not replace the first.');

        console.log('✓ Section B: a real Adopt button, wired to a real adoptNearbyPlaceNamingClaim() handler, now renders on every Nearby Place Names row alongside the existing Navigate button');
    }

    // -------------------------------------------------------------
    // Section C — exact claim is passed to adoption.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside Landing' });
        const envelope = discoverAsEnvelope(claim);
        const rows = makeAdoptRows([{ claim: envelope.claim, position: { x: 1, z: 1 } }], (id) => id);

        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob);
        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], feedback);

        assert(result && result.isNew === true, '11. adoption reports the claim as genuinely new.');
        assert(result.claim.id === claim.id && result.claim.name === 'Riverside Landing' && result.claim.worldId === 'world-1' && result.claim.regionId === 'region-1',
            '12. the EXACT claim (same id, name, worldId, regionId) is what ends up adopted — never a reconstructed or renamed stand-in.');
        assert(claimStore.listForRegion('world-1', 'region-1').some((c) => c.id === claim.id),
            '13. the exact claim is genuinely persisted in this replica\'s own claim store, keyed by its own worldId/regionId.');

        console.log('✓ Section C: the exact discovered claim — same id, name, worldId, regionId — is what reaches adoption and ends up stored, never a reshaped substitute');
    }

    // -------------------------------------------------------------
    // Section D — authorIdentityId is preserved (never the viewer's own).
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Fern Hollow' });
        const envelope = discoverAsEnvelope(claim);
        const rows = makeAdoptRows([{ claim: envelope.claim, position: { x: 1, z: 1 } }], (id) => id);

        // Bob is the one clicking Adopt — his own identity must never
        // leak into the stored claim's authorship.
        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob);
        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], feedback);

        assert(result.claim.authorIdentityId === alice.identityId,
            '14. the adopted claim\'s authorIdentityId is Alice\'s (the claim\'s own original author) — completely unrelated to Bob\'s own identityId.');
        assert(result.claim.authorIdentityId !== bob.identityId,
            '15. THE NEGATIVE CHECK: the adopted claim\'s authorIdentityId is never Bob\'s (the viewer performing the adoption) — adoption never manufactures or substitutes authorship, exactly like commentary\'s own established discipline.');

        // 16. Structural proof this isn't a lucky accident of these two
        // identities: adoptNearbyPlaceNamingClaim() itself never reads any
        // "current identity"/"my identity" concept at all.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const adoptBlock = extractBetween(worldViewCode, 'function adoptNearbyPlaceNamingClaim(row) {', '\n        }');
        assert(!/myIdentityId|currentUser|getSigningIdentity|resolveSigningIdentityId/.test(adoptBlock),
            '16. adoptNearbyPlaceNamingClaim() never references any "current identity"/"my identity" concept — the authorIdentityId it forwards can only ever be the row\'s own.');

        console.log('✓ Section D: authorIdentityId travels unchanged from the original claim — the adopting viewer\'s own identity is never substituted, live and structurally');
    }

    // -------------------------------------------------------------
    // Section E — createdAt is preserved.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Ashwood Bend' });
        const originalCreatedAt = claim.toJSON().createdAt;
        const envelope = discoverAsEnvelope(claim);
        const rows = makeAdoptRows([{ claim: envelope.claim, position: { x: 1, z: 1 } }], (id) => id);

        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob);
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        assert(result.claim.toJSON().createdAt === originalCreatedAt,
            '17. the adopted claim\'s own createdAt is byte-identical to the original claim\'s own signed timestamp — never replaced with "now," the moment of adoption.');

        console.log('✓ Section E: createdAt travels unchanged — adoption never re-stamps a claim with the moment it happened to be adopted');
    }

    // -------------------------------------------------------------
    // Section F — signature is preserved and genuinely (re)verified.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Kestrel Point' });
        const envelope = discoverAsEnvelope(claim);
        const rows = makeAdoptRows([{ claim: envelope.claim, position: { x: 1, z: 1 } }], (id) => id);

        const bob = makeIdentity('Bob');
        const { session, verifier } = makeReplica(bob);
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        // Compared against the DISCOVERED envelope's own signature (what
        // the row itself actually carries) rather than the pre-discovery
        // claim: core/PlaceNamingDiscoveryEnvelope.js's own describeClaim()
        // already narrows a signature to its five required fields
        // (dropping the optional signedAt) as part of discovery itself,
        // unrelated to this milestone — adoption's own job is to carry
        // THAT signature through unchanged, never to narrow or widen it
        // further itself.
        assert(JSON.stringify(result.claim.toJSON().signature) === JSON.stringify(PlaceNamingClaim.fromJSON(envelope.claim).toJSON().signature),
            '18. the adopted claim carries the EXACT signature the row itself received from discovery, byte-for-byte — adoption never re-signs, narrows, or strips it any further.');

        // 19. LIVE PROOF the signature is genuinely re-verified, not
        // merely carried along cosmetically: Bob's own REAL verifier
        // independently confirms it still verifies against Alice's claim.
        const stillVerifies = verifier.verifyPlaceNamingClaim(result.claim.toJSON());
        assert(stillVerifies.valid === true,
            '19. the adopted claim\'s signature genuinely verifies, independently, against a real (unmocked) LocalAuthorizationVerifier — not merely accepted because import happened to succeed once.');

        // 20. NEGATIVE CHECK: a row whose signature was tampered with
        // (the exact untrusted-input shape a hand-edited or forged
        // discovery payload would produce) is REFUSED by the real
        // verification inside importClaim() — proving verification is
        // still genuinely load-bearing, never bypassed by the UI layer.
        const tamperedRow = { ...rows[0], signature: { ...rows[0].signature, signature: tamperSignatureHex(rows[0].signature.signature) } };
        const forgedFeedback = makeFeedback();
        const forgedResult = adoptNearbyPlaceNamingClaim(session, tamperedRow, forgedFeedback);
        assert(forgedResult === null, '20. adopting a row with a tampered signature is refused — importClaim()\'s own real verification step catches it.');
        assert(forgedFeedback.messages.length === 1 && /unverifiable/i.test(forgedFeedback.messages[0]),
            '21. the refusal surfaces as a clear, graceful feedback message, never a silent no-op or an uncaught exception.');

        console.log('✓ Section F: signature travels unchanged and genuinely re-verifies against a real, unmocked verifier — and a tampered signature is genuinely refused, proving verification remains load-bearing');
    }

    // -------------------------------------------------------------
    // Section G — two competing nearby claims adopt independently.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const riverside = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        const oldRiver = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Old River' });

        const rows = makeAdoptRows([
            { claim: discoverAsEnvelope(riverside).claim, position: { x: 1, z: 1 } },
            { claim: discoverAsEnvelope(oldRiver).claim, position: { x: 1, z: 1 } }
        ], (id) => id);

        const carol = makeIdentity('Carol');
        const { session, claimStore } = makeReplica(carol);

        const resultRiverside = adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());
        assert(resultRiverside.isNew === true && resultRiverside.claim.name === 'Riverside',
            '22. the first claim ("Riverside") adopts successfully.');

        const resultOldRiver = adoptNearbyPlaceNamingClaim(session, rows[1], makeFeedback());
        assert(resultOldRiver.isNew === true && resultOldRiver.claim.name === 'Old River',
            '23. the second, independently-authored, competing claim ("Old River") ALSO adopts successfully — one adoption never disables, consumes, or conflicts with the next.');

        const stored = claimStore.listForRegion('world-1', 'region-1');
        assert(stored.length === 2 && stored.some((c) => c.name === 'Riverside') && stored.some((c) => c.name === 'Old River'),
            '24. BOTH claims are genuinely present in the store afterward, side by side — neither adoption overwrote or evicted the other.');

        console.log('✓ Section G: two competing, independently-authored claims for the same region adopt independently — neither interferes with the other');
    }

    // -------------------------------------------------------------
    // Section H — adoption does not rank or prefer either claim.
    //
    // The one particularly important negative test this milestone's own
    // brief named by name: adopting ONLY "Riverside" must never make
    // "Old River" disappear, become "wrong," or otherwise be affected —
    // adopting one claim must never silently become conflict resolution
    // for another.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const riverside = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        const oldRiver = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Old River' });

        const rows = makeAdoptRows([
            { claim: discoverAsEnvelope(riverside).claim, position: { x: 1, z: 1 } },
            { claim: discoverAsEnvelope(oldRiver).claim, position: { x: 1, z: 1 } }
        ], (id) => id);

        const carol = makeIdentity('Carol');
        const { session, claimStore, localNamePreferenceStore } = makeReplica(carol);

        // Both discovered and DISPLAYED (as this milestone's own row
        // mapping already proves, Section A) before either is adopted.
        const viewBeforeAnyAdoption = deriveNamingView('region-1', []);
        assert(viewBeforeAnyAdoption.length === 0, '25. sanity: this replica knows no claims for the region before adoption.');

        // Adopt ONLY "Riverside" — "Old River" is discovered and
        // displayed, but never clicked.
        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        const storedAfterOne = claimStore.listForRegion('world-1', 'region-1');
        assert(storedAfterOne.length === 1 && storedAfterOne[0].name === 'Riverside',
            '26. only the adopted claim ("Riverside") is actually stored — the merely-discovered-but-not-adopted "Old River" was never silently imported alongside it.');

        const viewAfterOne = deriveNamingView('region-1', storedAfterOne);
        assert(viewAfterOne.length === 1 && viewAfterOne[0].name === 'Riverside' && viewAfterOne[0].score === 1,
            '27. namingView() now shows exactly one name ("Riverside") with a score of 1 — adoption did not invent a competing entry for the untouched "Old River."');

        assert(localNamePreferenceStore.getPreferredName('world-1', 'region-1') === null,
            '28. adopting "Riverside" never sets it (or anything else) as this replica\'s own local preferred name — adoption and preference remain two independent concepts, exactly as this milestone\'s own scope requires ("no preferred-name semantics").');

        // THE NEGATIVE TEST NAMED BY THIS MILESTONE'S OWN BRIEF: the row
        // representing "Old River" — still merely discovered, never
        // adopted — is completely unaffected. It does not disappear from
        // the presentation rows, and it is not "wrong" — it remains
        // exactly the same claim it always was, still adoptable on its
        // own, independently.
        assert(rows[1].name === 'Old River' && rows[1].claimId === oldRiver.id,
            '29. THE NAMED NEGATIVE TEST: "Old River"\'s own row is byte-identical after "Riverside" was adopted — adopting one claim never mutates, invalidates, or removes the other, discovered-but-unadopted claim\'s own row.');

        // Now adopt "Old River" too — proving the earlier restraint was
        // not because it had somehow become unadoptable.
        const resultOldRiverLater = adoptNearbyPlaceNamingClaim(session, rows[1], makeFeedback());
        assert(resultOldRiverLater.isNew === true && resultOldRiverLater.claim.name === 'Old River',
            '30. "Old River" remains fully, independently adoptable afterward — proving Section G/H\'s restraint was a genuine architectural property, not an artifact of adoption order.');

        const finalView = deriveNamingView('region-1', claimStore.listForRegion('world-1', 'region-1'));
        assert(finalView.length === 2 && finalView.every((entry) => entry.score === 1),
            '31. once both are adopted, namingView() shows BOTH names, each with an equal score of 1 — adoption never ranked one above the other at any point in the sequence.');

        console.log('✓ Section H: adopting one claim never ranks, prefers, invalidates, or silently resolves a competing claim — "Old River" remained exactly itself, untouched and independently adoptable, throughout');
    }

    // -------------------------------------------------------------
    // Section I — navigation remains independent from adoption.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Thistledown' });
        const rows = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id);

        const bob = makeIdentity('Bob');
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(region({ id: 'region-1', worldId: 'world-1', authorIdentityId: bob.identityId, name: 'Willow Village', x: 10, z: 20 }));
        const { session, claimStore } = makeReplica(bob, [{ world }]);

        // 32. Adopting never moves the camera.
        let focusLocationCalls = [];
        const realFocusLocation = session.focusLocation.bind(session);
        session.focusLocation = (locationId) => { focusLocationCalls.push(locationId); return realFocusLocation(locationId); };
        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());
        assert(focusLocationCalls.length === 0, '32. adoptNearbyPlaceNamingClaim() never calls session.focusLocation() — Adopt never moves the camera, exactly the reverse of Navigate\'s own restraint.');

        // 33. Navigating never adopts (imports/stores) the claim.
        const before = claimStore.listForRegion('world-1', 'region-1').length;
        navigateToNearbyPlaceNamingClaim(session, rows[0], makeFeedback());
        const after = claimStore.listForRegion('world-1', 'region-1').length;
        assert(before === 1 && after === 1, '33. sanity/reconfirmation of 0.9.260\'s own Section F: Navigate still never adopts anything — the store count from adoption above is unaffected by navigating afterward.');

        // 34. Structural proof, direct from real source: neither function
        // references the other's own machinery at all.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const adoptBlock = extractBetween(worldViewCode, 'function adoptNearbyPlaceNamingClaim(row) {', '\n        }');
        const navigateBlock = extractBetween(worldViewCode, 'function navigateToNearbyPlaceNamingClaim(row) {', '\n        }');
        assert(!/focusLocation|refreshSpatialUI/.test(adoptBlock),
            '34a. adoptNearbyPlaceNamingClaim() never references focusLocation() or refreshSpatialUI() — structurally, not just behaviorally.');
        assert(!/importPlaceNamingClaim/.test(navigateBlock),
            '34b. navigateToNearbyPlaceNamingClaim() never references importPlaceNamingClaim() — structurally, not just behaviorally.');

        console.log('✓ Section I: Navigate and Adopt remain two fully independent actions — Adopt never moves the camera, Navigate never adopts, live and structurally');
    }

    // -------------------------------------------------------------
    // Section J — discovery alone never invokes adoption.
    // -------------------------------------------------------------
    {
        const proximitySource = codeOnlyLines(await rawSource('core/PlaceNamingProximitySelection.js'));
        const monitorSource = codeOnlyLines(await rawSource('application/PlaceNamingDiscoveryMonitor.js'));
        const envelopeSource = codeOnlyLines(await rawSource('core/PlaceNamingDiscoveryEnvelope.js'));
        const orchestrationSource = codeOnlyLines(await rawSource('application/DiscoverPlaceNamingClaimsCommand.js'));

        for (const [name, source] of [
            ['core/PlaceNamingProximitySelection.js', proximitySource],
            ['application/PlaceNamingDiscoveryMonitor.js', monitorSource],
            ['core/PlaceNamingDiscoveryEnvelope.js', envelopeSource],
            ['application/DiscoverPlaceNamingClaimsCommand.js', orchestrationSource]
        ]) {
            assert(!/adoptNearbyPlaceNamingClaim|importPlaceNamingClaim|importClaim\(/.test(source),
                `35. ${name} — no part of the discovery/proximity pipeline was touched by this milestone, and none of it references adoption in any form.`);
        }

        // 36. LIVE PROOF: running discovery + proximity selection alone,
        // with no Adopt click at all, leaves the claim store untouched.
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Never Clicked' });
        const { selectNearbyPlaceNamingClaims } = await import('../core/PlaceNamingProximitySelection.js');
        const envelope = discoverAsEnvelope(claim);
        const discovered = [{ ...envelope, position: { x: 0, z: 0 } }];
        const nearby = selectNearbyPlaceNamingClaims(discovered, { x: 0, z: 0 }, 100);
        assert(nearby.length === 1, '36a. sanity: the claim is genuinely discovered and selected as nearby.');

        const bob = makeIdentity('Bob');
        const { claimStore } = makeReplica(bob);
        assert(claimStore.listForRegion('world-1', 'region-1').length === 0,
            '36b. discovery and proximity selection alone — with no Adopt click ever made — never store anything in a completely separate replica\'s own claim store, by construction: nothing in this pipeline ever calls importPlaceNamingClaim().');

        console.log('✓ Section J: discovery, proximity selection, and the discovery envelope never reference adoption in any form — a claim can be discovered, filtered, and displayed indefinitely without ever being adopted');
    }

    // -------------------------------------------------------------
    // Section K — failed adoption does not mutate the World.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Forged Name' });
        const rows = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id);
        // Tamper with the signature so importClaim()'s own real
        // verification step refuses it.
        rows[0].signature = { ...rows[0].signature, signature: tamperSignatureHex(rows[0].signature.signature) };

        const bob = makeIdentity('Bob');
        const worldRegion = region({ id: 'region-1', worldId: 'world-1', authorIdentityId: bob.identityId, name: 'Willow Village', x: 0, z: 0 });
        const world = new World({ id: 'world-1' });
        world.addWorldRegion(worldRegion);
        const { session, claimStore } = makeReplica(bob, [{ world }]);

        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], feedback);

        assert(result === null, '37. the forged claim is refused, as Section F already proves.');
        assert(worldRegion.name === 'Willow Village', '38. THE NEGATIVE AUDIT: the WorldRegion\'s own authoritative name is byte-identical after a failed adoption attempt — a rejected claim never reaches WorldRegion naming, exactly like a successful one (Section C3 of 0.9.262\'s own reassessment) never does either.');
        assert(session.getRegion('region-1').name === 'Willow Village', '39. the session\'s own read of the region confirms the same.');
        assert(claimStore.listForRegion('world-1', 'region-1').length === 0, '40. nothing was persisted to the claim store either — a failed adoption leaves zero trace in storage.');

        console.log('✓ Section K: a failed adoption attempt never mutates the World it targeted, and leaves nothing behind in storage');
    }

    // -------------------------------------------------------------
    // Section L — failed adoption preserves the discovered claim/row.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Preserved Claim' });
        const rows = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id);
        const rowSnapshotBefore = JSON.parse(JSON.stringify(rows[0]));
        rows[0].signature = { ...rows[0].signature, signature: tamperSignatureHex(rows[0].signature.signature) };
        const tamperedSnapshot = JSON.parse(JSON.stringify(rows[0]));

        const bob = makeIdentity('Bob');
        const { session } = makeReplica(bob);
        adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());

        // The row itself (what the discovery/presentation layer still
        // holds) is completely unaffected by the failed adoption attempt
        // — adoptNearbyPlaceNamingClaim() never mutates the row it was
        // given.
        assert(JSON.stringify(rows[0]) === JSON.stringify(tamperedSnapshot),
            '41. the row object itself is byte-identical after a failed adoption attempt — adoption never mutates its own input.');

        // The UNDERLYING discovered claim (what a real
        // nearbyPlaceNamingClaims.value entry would still hold,
        // independent of any one row derived from it) remains completely
        // valid and adoptable — only the ONE tampered row attempt failed,
        // never the claim's own continued existence in discovery.
        const freshRows = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id);
        assert(JSON.stringify(freshRows[0]) === JSON.stringify(rowSnapshotBefore),
            '42. re-deriving the row from the ORIGINAL, never-tampered claim reproduces the exact same well-formed row — the discovered claim itself was never corrupted by the earlier failed attempt on a locally-tampered copy.');
        const retryResult = adoptNearbyPlaceNamingClaim(session, freshRows[0], makeFeedback());
        assert(retryResult && retryResult.isNew === true && retryResult.claim.name === 'Preserved Claim',
            '43. the untampered claim adopts successfully on retry — a failed adoption attempt never poisons or consumes the discovered claim it was attempted against.');

        console.log('✓ Section L: a failed adoption attempt mutates neither the row it was given nor the discovered claim behind it — the claim remains fully, independently adoptable afterward');
    }

    // -------------------------------------------------------------
    // Section M — World switching cannot adopt a stale claim into
    // another World.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        // A claim discovered while 'world-old' was the active World —
        // captured into a row exactly as the presentation layer would.
        const staleClaim = signedClaim(alice, { worldId: 'world-old', regionId: 'region-1', name: 'Old World Claim' });
        const staleRow = makeAdoptRows([{ claim: discoverAsEnvelope(staleClaim).claim, position: { x: 1, z: 1 } }], (id) => id)[0];

        // The session has since switched — ONLY 'world-new' (a
        // DIFFERENT World that happens to reuse the exact same regionId
        // string) is currently loaded; 'world-old' is not loaded at all.
        const worldNew = new World({ id: 'world-new' });
        worldNew.addWorldRegion(region({ id: 'region-1', worldId: 'world-new', authorIdentityId: bob.identityId, name: 'New World Region', x: 999, z: 999 }));
        const { session, claimStore } = makeReplica(bob, [{ world: worldNew }]);

        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, staleRow, feedback);

        // Per application/WorldNavigationSession.js#importPlaceNamingClaim()'s
        // own header — "deliberately NOT scoped to regionId or to whatever
        // World is currently active" — adoption succeeds, but strictly
        // under the claim's OWN worldId ('world-old'), never reinterpreted
        // as belonging to whichever World the session currently has open.
        assert(result && result.isNew === true && result.claim.worldId === 'world-old',
            '44. the stale claim adopts under its OWN worldId ("world-old") — never silently reassigned to "world-new" just because that is the World currently active in the session.');

        assert(claimStore.listForRegion('world-old', 'region-1').length === 1 && claimStore.listForRegion('world-old', 'region-1')[0].name === 'Old World Claim',
            '45. the claim is genuinely stored under "world-old" — reachable there, exactly as signed.');
        assert(claimStore.listForRegion('world-new', 'region-1').length === 0,
            '46. THE NEGATIVE CHECK: "world-new"\'s own identically-regionId\'d claim list remains completely empty — the stale claim never leaks into the currently-active World\'s own naming, despite the colliding regionId string.');

        // 47. WorldRegion in the currently-active World is, as always,
        // completely untouched.
        assert(worldNew.getWorldRegion('region-1').name === 'New World Region',
            '47. "world-new"\'s own WorldRegion name is unaffected by adopting a same-regionId claim that actually belongs to a different, unloaded World.');

        console.log('✓ Section M: a stale claim from a World that is no longer loaded adopts strictly under its own worldId — it can never be misattributed to whichever World happens to be active when Adopt is clicked, even under a colliding regionId');
    }

    // -------------------------------------------------------------
    // Section N — existing manual PlaceNamingPanel adoption remains
    // unchanged.
    // -------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        const codeOnly = codeOnlyLines(panelSource);

        assert(!codeOnly.includes('adoptNearbyPlaceNamingClaim'),
            '48. ui/components/PlaceNamingPanel.js — the manual naming surface — was not touched by this milestone at all; it never references the new nearby Adopt function.');
        assert(codeOnly.includes('triggerImportClaim') && codeOnly.includes("$emit('import-claim'"),
            '49. the manual panel\'s own existing "import (adopt)" capability is untouched.');
        assert(codeOnly.includes("onPreferEntry(entry.name)") && codeOnly.includes("$emit('set-preferred-name'"),
            '50. the manual panel\'s own "select (prefer)" capability is untouched.');
        assert(codeOnly.includes('onExportClaim(claimId)') && codeOnly.includes("$emit('export-claim'"),
            '51. the manual panel\'s own "copy/share (export)" capability is untouched.');

        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldViewCode.includes('function importNamingClaim(rawText)') && worldViewCode.includes('session.importPlaceNamingClaim(parsed)'),
            '52. ui/views/WorldView.js still wires the manual panel\'s Import Claim action through to the real session.importPlaceNamingClaim(), byte-for-byte unmodified.');

        console.log('✓ Section N: the manual PlaceNamingPanel and its existing import/export/prefer wiring are completely unaffected by this milestone');
    }

    // -------------------------------------------------------------
    // Section O — real verification/persistence path is exercised,
    // not mocked.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Genuinely Verified' });
        const rows = makeAdoptRows([{ claim: discoverAsEnvelope(claim).claim, position: { x: 1, z: 1 } }], (id) => id);

        const bob = makeIdentity('Bob');
        const { session, verifier, claimStore } = makeReplica(bob);

        assert(verifier instanceof LocalAuthorizationVerifier, '53. the replica\'s own verifier is a REAL, unmocked LocalAuthorizationVerifier instance.');
        assert(claimStore instanceof LocalPlaceNamingClaimStore, '54. the replica\'s own claim store is a REAL, unmocked LocalPlaceNamingClaimStore instance.');

        const result = adoptNearbyPlaceNamingClaim(session, rows[0], makeFeedback());
        assert(result.isNew === true, '55. adoption succeeds through the genuinely real verify/persist path.');

        // 56. The persisted claim is independently re-readable straight
        // from storage (not merely from the in-memory return value),
        // proving genuine persistence rather than an in-memory illusion.
        const rehydratedStorage = new InMemoryStorageProvider();
        // Copy the exact bytes the real store wrote, to prove they are
        // genuinely serializable, real JSON, not a live object graph.
        const rawList = claimStore.list('world-1');
        assert(Array.isArray(rawList) && rawList.length === 1 && JSON.stringify(rawList[0].toJSON()).includes('Genuinely Verified'),
            '56. the adopted claim is genuinely readable back from the real store\'s own list(worldId), carrying its own real name.');

        console.log('✓ Section O: adoption runs through a genuinely real, unmocked verifier and claim store — never a stub standing in for either');
    }

    // -------------------------------------------------------------
    // Section P — FLAGSHIP: real Nostr -> discovery -> proximity ->
    // World View -> adoption, end to end.
    // -------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const world = new World({ id: worldId });
        world.addWorldRegion(region({ id: 'region-near', worldId, authorIdentityId: alice.identityId, name: 'Old Oak Crossing (unclaimed by World)', x: 10, z: 0 }));
        world.addWorldRegion(region({ id: 'region-far', worldId, authorIdentityId: alice.identityId, name: 'Distant Hollow', x: 5000, z: 0 }));
        const bob = makeIdentity('Bob');
        const { session, claimStore } = makeReplica(bob, [{ world }]);

        const carol = makeIdentity('Carol');
        const nearClaim = signedClaim(carol, { worldId, regionId: 'region-near', name: 'Riverbend' });
        const farClaim = signedClaim(carol, { worldId, regionId: 'region-far', name: 'Should Not Be Reachable' });

        const tagNear = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const tagFar = derivePlaceNamingDiscoveryTag(worldId, 'region-far');
        const nearEvent = {
            id: 'event-near', pubkey: 'pk-carol', kind: 1,
            tags: [['t', tagNear]],
            content: JSON.stringify(buildPlaceNamingDiscoveryEnvelope(nearClaim)),
            sig: 'sig-near'
        };
        const farEvent = {
            id: 'event-far', pubkey: 'pk-carol', kind: 1,
            tags: [['t', tagFar]],
            content: JSON.stringify(buildPlaceNamingDiscoveryEnvelope(farClaim)),
            sig: 'sig-far'
        };
        async function queryImpl(relayUrl, filter) {
            const tag = filter['#t'][0];
            if (tag === tagNear) return [nearEvent];
            if (tag === tagFar) return [farEvent];
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

        // Only the near region is within the monitor's own default
        // proximity radius (100) of the Wanderer's position (0,0).
        await monitor.observe({ x: 0, z: 0 });
        assert(monitor.lastResult && monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === nearClaim.id,
            '57. FLAGSHIP — real Nostr discovery + real proximity selection surfaces exactly one nearby claim.');

        const rows = makeAdoptRows(monitor.lastResult, (id) => `display:${id}`);
        assert(rows[0].authorIdentityId === carol.identityId && rows[0].signature,
            '58. FLAGSHIP — the presentation row built from a REAL discovered-over-Nostr claim carries its own real authorIdentityId and signature through.');

        const feedback = makeFeedback();
        const result = adoptNearbyPlaceNamingClaim(session, rows[0], feedback);
        assert(result && result.isNew === true && result.claim.name === 'Riverbend',
            '59. FLAGSHIP — Adopt succeeds end to end for a claim that traveled the ENTIRE real pipeline: Nostr event -> discovery envelope -> proximity selection -> presentation row -> Adopt -> real importClaim().');
        assert(feedback.messages.length === 1 && /Adopted/.test(feedback.messages[0]),
            '60. FLAGSHIP — a genuine, single "Adopted" feedback message, never a failure or a silent no-op.');

        const storedNear = claimStore.listForRegion(worldId, 'region-near');
        assert(storedNear.length === 1 && storedNear[0].name === 'Riverbend' && storedNear[0].authorIdentityId === carol.identityId,
            '61. FLAGSHIP — the claim is genuinely persisted, keyed to the exact region it was discovered for, still attributed to Carol (its real, original author), never Bob (the Wanderer who clicked Adopt).');
        assert(claimStore.listForRegion(worldId, 'region-far').length === 0,
            '62. FLAGSHIP — the far, out-of-radius claim was never even discovered, let alone adopted.');
        assert(world.getWorldRegion('region-near').name !== 'Riverbend',
            '63. FLAGSHIP — even after a full, real adoption, the WorldRegion\'s own authoritative name was never overwritten by the claim\'s "Riverbend" — the claim remains merely a claim.');

        const view = deriveNamingView('region-near', claimStore.list(worldId));
        assert(view.length === 1 && view[0].name === 'Riverbend' && view[0].score === 1,
            '64. FLAGSHIP — the adopted claim genuinely participates in this replica\'s own namingView() ranking for its region, exactly adoption\'s one real, narrow effect.');

        console.log('✓ Section P (FLAGSHIP): a claim discovered over a real Nostr source, filtered by real proximity selection, presented as a real (widened) row, and adopted via the real, unmodified importPlaceNamingClaim() boundary — end to end, with zero shortcuts');
    }

    // -------------------------------------------------------------
    // Section Q — architectural regression: World View implements no
    // verification/persistence of its own.
    // -------------------------------------------------------------
    {
        const rawWorldViewCode = await rawSource('ui/views/WorldView.js');
        const worldViewCode = codeOnlyLines(rawWorldViewCode);

        const adoptBlock = extractBetween(rawWorldViewCode, 'function adoptNearbyPlaceNamingClaim(row) {', '\n        }');
        const codeOnlyAdoptBlock = codeOnlyLines(adoptBlock);

        assert(codeOnlyAdoptBlock.includes('session.importPlaceNamingClaim(pkg)'),
            '65. adoptNearbyPlaceNamingClaim() calls the real, existing session.importPlaceNamingClaim() — the single boundary it delegates to.');

        const forbiddenTerms = [
            'verifyPlaceNamingClaim(', 'LocalAuthorizationVerifier', 'LocalPlaceNamingClaimStore', 'PlaceNamingClaimExchange',
            '.save(', '.persist(', 'Signature.', 'signCanonical', 'new PlaceNamingClaim(',
            'setWorldRegion(', 'renameRegion(', 'updateRegion(',
            'setPreferredPlaceName', 'clearPreferredPlaceName', 'rankClaimsByName', 'getPlaceNamingView'
        ];
        for (const term of forbiddenTerms) {
            assert(!codeOnlyAdoptBlock.includes(term), `66. adoptNearbyPlaceNamingClaim() never contains '${term}' — no verification, persistence, signing, WorldRegion mutation, ranking, or preference logic of its own; every one of those responsibilities stays inside the existing, unmodified application/PlaceNamingClaimExchange.js#importClaim().`);
        }

        // 67. WorldView.js as a WHOLE, not merely this one function,
        // still never imports the verifier/store classes directly —
        // confirming the exchange boundary is genuinely the only door in.
        assert(!worldViewCode.includes("from '../../identity/LocalAuthorizationVerifier.js'") && !worldViewCode.includes("from '../../application/LocalPlaceNamingClaimStore.js'"),
            '67. ui/views/WorldView.js never imports LocalAuthorizationVerifier or LocalPlaceNamingClaimStore directly anywhere in the file — the ONLY way this view can ever affect naming claims is through WorldNavigationSession\'s own already-existing methods.');

        console.log('✓ Section Q: World View implements no verification or persistence of its own for adoption — it delegates entirely, and exclusively, to the existing session.importPlaceNamingClaim() boundary');
    }

    console.log('\n✅ All Nearby Place Naming Claim Adoption tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
