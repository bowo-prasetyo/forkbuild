import { readFile } from 'node:fs/promises';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { buildPlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublication.js';
import { PlaceNamingDiscoveryMonitor } from '../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.266 — Nearby Place Naming Claim Metadata Presentation.
//
// 0.9.265's own reassessment (Section D, D1) found the Nearby Place Names
// row already carries `createdAt`/`signature` — restored at 0.9.263 purely
// so Adopt could build a valid publication package — but the TEMPLATE never
// renders either one: "the data reaching the row and what the row displays
// are two different questions, and only the second is still a gap." This
// milestone closes exactly the `createdAt` half of that display gap: a new
// `createdAtLabel` presentation field, added ALONGSIDE the row's existing
// raw `createdAt` (never replacing it — Adopt keeps reading the exact same
// unformatted value it always has), rendered as "Created: <date>" beside
// the existing author line.
//
// Per 0.9.265's own Section C5 and this milestone's own brief, `signature`
// deliberately gets NO display counterpart: this codebase's only real
// verification (identity/LocalAuthorizationVerifier.js#
// verifyPlaceNamingClaim()) runs strictly inside a MUTATING boundary
// (import/publish/kind-registry-verify) and exposes no semantic,
// non-mutating result a NOT-YET-adopted Nearby row could read and display
// truthfully — so this milestone builds no new "Verified"/"Unverified" UI
// state, and renders no raw signature bytes.
//
//   Section A — author and timestamp are both rendered
//   Section B — every other existing claim field survives unchanged
//   Section C — multiple authors are each formatted independently
//   Section D — competing claims ("Riverside"/"Old River") remain equally
//               presented despite different authors/timestamps
//   Section E — malformed/missing createdAt degrades gracefully, never
//               throws, and never blanks out the rest of the row
//   Section F — World switching never leaks a previous World's metadata
//   Section G — discovery refresh: a newer observation's metadata replaces
//               the previous one; a stale, late-arriving one never does
//   Section H — Navigate remains fully independent of the new metadata
//   Section I — Adopt remains fully independent of the new metadata —
//               it rehydrates from the row's own raw createdAt, never
//               createdAtLabel
//   Section J — rendering metadata implies no ranking or preference
//   Section K — rendering metadata never mutates the World
//   Section L — the existing verification boundary is preserved: no
//               signature is rendered, no new verification vocabulary
//               exists in the new code
//   Section M — FLAGSHIP: real Nostr -> discovery -> proximity ->
//               presentation, metadata derived end to end from a real,
//               signed claim
//   Section N — architectural regression: the reproduction above genuinely
//               matches what ui/views/WorldView.js contains

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

function makeReplica(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    return { store, verifier, exchange };
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

function pos(x, z) {
    return { x, z };
}

// EXACTLY ui/views/WorldView.js#formatNearbyPlaceNamingCreatedAt() — see
// that function's own 0.9.266 comment. Section N proves this reproduction
// genuinely matches the real file.
function formatNearbyPlaceNamingCreatedAt(createdAt) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

// EXACTLY ui/views/WorldView.js#nearbyPlaceNamingClaimRows — see that
// computed's own 0.9.263/0.9.266 comments.
function makeRows(claims, resolveDisplayName) {
    return claims.map((entry) => ({
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

// EXACTLY ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim() — same
// cross-check, same call order, same graceful-failure shape.
function navigateToNearbyPlaceNamingClaim(session, row, feedback) {
    const regionStillExists = session.getRegions()
        .some((region) => region.id === row.regionId && region.worldId === row.worldId);
    if (!regionStillExists) {
        feedback.show('That place no longer exists in this World');
        return false;
    }
    session.focusLocation(row.regionId);
    return true;
}

// EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim() — rehydrates
// a PlaceNamingClaim from the row's own RAW fields and hands it to the
// real exchange boundary, unmodified.
function adoptNearbyPlaceNamingClaim(replica, row) {
    const rowClaim = PlaceNamingClaim.fromJSON({
        id: row.claimId, worldId: row.worldId, regionId: row.regionId, name: row.name,
        authorIdentityId: row.authorIdentityId, createdAt: row.createdAt, signature: row.signature
    });
    const pkg = buildPlaceNamingClaimPublication(rowClaim);
    return replica.exchange.importClaim(pkg);
}

function makeGetRegionsSession(regions, { onFocusLocation } = {}) {
    return new Proxy({ getRegions: () => regions, focusLocation: (id) => onFocusLocation && onFocusLocation(id) }, {
        get(target, prop) {
            if (prop === 'getRegions' || prop === 'focusLocation') return target[prop];
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            throw new Error(`fake session: unexpected access to session.${String(prop)}`);
        }
    });
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
    if (startIdx === -1) throw new Error(`extractBetween: start marker not found: ${startMarker}`);
    const endIdx = code.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) throw new Error(`extractBetween: end marker not found: ${endMarker}`);
    return code.slice(startIdx, endIdx + endMarker.length);
}

async function runTests() {
    console.log('Running Nearby Place Naming Metadata Presentation tests...\n');

    // ---------------------------------------------------------------
    // Section A — author and timestamp are both rendered.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside', createdAt: new Date('2026-09-07T12:00:00.000Z') });
        const entry = { claim: discoverAsEnvelope(claim).claim, position: pos(10, 5) };
        const [row] = makeRows([entry], (id) => `display:${id}`);

        assert(row.authorDisplayName === 'display:' + alice.identityId, '1a. author rendering: authorDisplayName is resolved from claim.authorIdentityId');
        assert(row.createdAtLabel === new Date('2026-09-07T12:00:00.000Z').toLocaleDateString(),
            '1b. timestamp rendering: createdAtLabel formats the claim\'s own createdAt');
        assert(row.createdAtLabel.length > 0, '1c. a well-formed createdAt never produces an empty label');

        console.log('✓ Section A: author and timestamp are both rendered on the row');
    }

    // ---------------------------------------------------------------
    // Section B — every other existing claim field survives unchanged.
    // ---------------------------------------------------------------
    {
        const bob = makeIdentity('Bob');
        const claim = signedClaim(bob, { worldId: 'world-2', regionId: 'region-2', name: 'Old Market' });
        const entry = { claim: discoverAsEnvelope(claim).claim, position: pos(1, 2) };
        const [row] = makeRows([entry], (id) => id);

        assert(row.claimId === claim.id, '2a. claimId unchanged');
        assert(row.name === 'Old Market', '2b. name unchanged');
        assert(row.position.x === 1 && row.position.z === 2, '2c. position unchanged');
        assert(row.worldId === 'world-2' && row.regionId === 'region-2', '2d. worldId/regionId unchanged (0.9.260)');
        assert(row.authorIdentityId === bob.identityId, '2e. raw authorIdentityId still present (0.9.263), alongside the new authorDisplayName');
        assert(row.createdAt === claim.toJSON().createdAt, '2f. raw createdAt still present and untouched (0.9.263) — adoption keeps reading this value, never createdAtLabel');
        assert(row.signature && row.signature.signer === bob.identityId, '2g. raw signature still present and untouched (0.9.263)');

        console.log('✓ Section B: every pre-existing row field is preserved unchanged; createdAtLabel is purely additive');
    }

    // ---------------------------------------------------------------
    // Section C — multiple authors are each formatted independently.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const claimA = signedClaim(alice, { worldId: 'world-1', regionId: 'region-a', name: 'Central Park', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const claimB = signedClaim(bob, { worldId: 'world-1', regionId: 'region-b', name: 'Old Market', createdAt: new Date('2026-06-15T00:00:00.000Z') });
        const entries = [claimA, claimB].map((c) => ({ claim: discoverAsEnvelope(c).claim, position: pos(0, 0) }));
        const rows = makeRows(entries, (id) => `resolved:${id}`);

        assert(rows[0].authorDisplayName === `resolved:${alice.identityId}` && rows[1].authorDisplayName === `resolved:${bob.identityId}`,
            '3a. each row resolves its OWN author, never the other\'s');
        assert(rows[0].createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(), '3b. row A carries row A\'s own createdAt label');
        assert(rows[1].createdAtLabel === new Date('2026-06-15T00:00:00.000Z').toLocaleDateString(), '3c. row B carries row B\'s own createdAt label, independent of A');
        assert(rows[0].createdAtLabel !== rows[1].createdAtLabel, '3d. sanity: the two labels genuinely differ');

        console.log('✓ Section C: multiple authors are each formatted independently, with no cross-contamination between rows');
    }

    // ---------------------------------------------------------------
    // Section D — the negative test named directly by this milestone's
    // own brief: competing claims remain equally presented despite
    // different authors/timestamps.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const riverside = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const oldRiver = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Old River', createdAt: new Date('2026-03-15T00:00:00.000Z') });
        const entries = [riverside, oldRiver].map((c) => ({ claim: discoverAsEnvelope(c).claim, position: pos(0, 0) }));
        const rows = makeRows(entries, (id) => (id === alice.identityId ? 'Alice' : 'Bob'));

        assert(rows.length === 2, '4a. both competing claims are presented, neither dropped');
        assert(rows[0].name === 'Riverside' && rows[0].authorDisplayName === 'Alice' && rows[0].createdAtLabel.length > 0,
            '4b. "Riverside — Alice — <date>" renders in full');
        assert(rows[1].name === 'Old River' && rows[1].authorDisplayName === 'Bob' && rows[1].createdAtLabel.length > 0,
            '4c. "Old River — Bob — <date>" renders in full, alongside Riverside, never in place of it');
        const structuralKeys = ['claimId', 'name', 'authorDisplayName', 'createdAtLabel', 'position', 'regionId', 'worldId', 'authorIdentityId', 'createdAt', 'signature'];
        for (const row of rows) {
            for (const key of structuralKeys) {
                assert(key in row, `4d. row for "${row.name}" carries every field the other row carries ("${key}")`);
            }
        }
        assert(!('score' in rows[0]) && !('score' in rows[1]) && !('rank' in rows[0]) && !('rank' in rows[1]),
            '4e. neither row carries a score/rank field — displaying metadata never introduces a preference between competing claims');

        console.log('✓ Section D: "Riverside"/"Old River" remain equally, fully presented despite different authors and timestamps');
    }

    // ---------------------------------------------------------------
    // Section E — malformed/missing createdAt degrades gracefully.
    // ---------------------------------------------------------------
    {
        // E1. A discovered envelope with a syntactically well-formed (a
        // required non-empty string, per core/PlaceNamingDiscoveryEnvelope.js's
        // own shape validation) but semantically unparseable createdAt —
        // the one shape that genuinely reaches presentation, since a
        // truly missing/empty createdAt is already rejected at the
        // discovery boundary itself (never this milestone's problem).
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Mystery Cove' });
        const claimJSON = { ...claim.toJSON(), createdAt: 'not-a-real-timestamp' };
        const envelope = parsePlaceNamingDiscoveryEnvelope({
            protocol: 'forkbuild-place-naming-discovery', version: 1,
            worldId: 'world-1', regionId: 'region-1', claim: claimJSON
        });
        assert(envelope !== null, 'sanity: shape validation accepts a non-empty-but-unparseable createdAt string');
        const [row] = makeRows([{ claim: envelope.claim, position: pos(0, 0) }], (id) => id);

        assert(row.createdAtLabel === '', '5a. an unparseable createdAt degrades to an empty label, never "Invalid Date" or a thrown error');
        assert(row.name === 'Mystery Cove' && row.authorDisplayName === alice.identityId,
            '5b. the rest of the row stays completely intact — one malformed field never blanks out the others');

        // E2. Defense in depth at the formatter itself: undefined/an
        // empty string/a non-Date object/NaN/an unparseable string never
        // throw, regardless of what reaches it — the identical
        // `new Date(x).getTime()` contract ui/components/PlaceNamingPanel.js's
        // own pre-existing formatWhen() already relies on (null and small
        // numbers coerce to a REAL, if nonsensical, epoch-relative date in
        // native JS Date semantics, so they are deliberately not asserted
        // here as "malformed" — that pre-existing quirk is untouched by
        // this milestone).
        for (const bad of [undefined, '', {}, NaN, 'not-a-date']) {
            let label;
            let threw = false;
            try { label = formatNearbyPlaceNamingCreatedAt(bad); } catch { threw = true; }
            assert(!threw, `5c. formatNearbyPlaceNamingCreatedAt(${JSON.stringify(bad)}) never throws`);
            assert(label === '', `5d. formatNearbyPlaceNamingCreatedAt(${JSON.stringify(bad)}) degrades to an empty label`);
        }

        console.log('✓ Section E: malformed or missing createdAt degrades gracefully to an empty label, never throwing and never corrupting the rest of the row');
    }

    // ---------------------------------------------------------------
    // Section F — World switching never leaks a previous World's
    // metadata into the next.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const oldClaim = signedClaim(alice, { worldId: 'world-old', regionId: 'region-old', name: 'Old World Place', createdAt: new Date('2025-01-01T00:00:00.000Z') });
        const newClaim = signedClaim(bob, { worldId: 'world-new', regionId: 'region-new', name: 'New World Place', createdAt: new Date('2026-01-01T00:00:00.000Z') });

        let rows = makeRows([{ claim: discoverAsEnvelope(oldClaim).claim, position: pos(0, 0) }], (id) => id);
        assert(rows[0].authorDisplayName === alice.identityId && rows[0].createdAtLabel === new Date('2025-01-01T00:00:00.000Z').toLocaleDateString(),
            'sanity: the old World\'s own claim is shown before any switch');

        // Simulate a World switch: presentation is recomputed fresh from
        // the newly discovered set, exactly as
        // nearbyPlaceNamingClaimRows recomputes from nearbyPlaceNamingClaims.
        rows = makeRows([{ claim: discoverAsEnvelope(newClaim).claim, position: pos(0, 0) }], (id) => id);

        assert(rows.length === 1 && rows[0].name === 'New World Place', '6a. after switching Worlds, only the new World\'s own claim is displayed');
        assert(rows[0].authorDisplayName === bob.identityId, '6b. the new row\'s author is the new World\'s own claimant, never the old World\'s');
        assert(rows[0].createdAtLabel === new Date('2026-01-01T00:00:00.000Z').toLocaleDateString(),
            '6c. the new row\'s createdAt label reflects the new World\'s own claim, never the old World\'s date');

        console.log('✓ Section F: World switching never leaks a previous World\'s author/createdAt metadata into the current presentation');
    }

    // ---------------------------------------------------------------
    // Section G — discovery refresh: a newer observation's metadata
    // replaces the previous one; a stale, late-arriving one never does.
    // ---------------------------------------------------------------
    {
        function makeSession(regions) {
            return new Proxy({ getRegions: () => regions }, {
                get(target, prop) {
                    if (prop === 'getRegions') return target.getRegions;
                    if (prop === 'then' || typeof prop === 'symbol') return undefined;
                    throw new Error(`fake session: unexpected access to session.${String(prop)}`);
                }
            });
        }
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const session = makeSession([{ id: 'region-1', worldId: 'world-1', position: pos(0, 0) }]);
        let mode = 'first';
        const firstClaim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'First Name', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const secondClaim = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Second Name', createdAt: new Date('2026-06-01T00:00:00.000Z') });
        const queryService = {
            search: () => Promise.resolve([discoverAsEnvelope(mode === 'first' ? firstClaim : secondClaim)])
        };
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                const regions = session.getRegions();
                return Promise.all(regions.map((region) => executeDiscoverPlaceNamingClaimsCommand({
                    discoveryTag: derivePlaceNamingDiscoveryTag(region.worldId, region.id),
                    discoveryQueryService: queryService
                }))).then((perRegionResults) => perRegionResults.flat());
            },
            resolveClaimPosition: (envelope) => {
                const region = session.getRegions().find((r) => r.worldId === envelope.worldId && r.id === envelope.regionId);
                return region ? region.position : null;
            }
        });

        await monitor.observe(pos(0, 0));
        let rows = makeRows(monitor.lastResult, (id) => id);
        assert(rows[0].name === 'First Name' && rows[0].authorDisplayName === alice.identityId,
            '7a. the first observation\'s own metadata is displayed');

        mode = 'second';
        await monitor.observe(pos(100, 0));
        rows = makeRows(monitor.lastResult, (id) => id);
        assert(rows[0].name === 'Second Name' && rows[0].authorDisplayName === bob.identityId,
            '7b. a later successful observation fully replaces the previous metadata — author, name, and createdAt all update together');
        assert(rows[0].createdAtLabel === new Date('2026-06-01T00:00:00.000Z').toLocaleDateString(),
            '7c. the createdAt label reflects the newer claim, never a stale mix of old and new fields');

        console.log('✓ Section G: a refreshed discovery observation replaces all of a row\'s metadata together — never a stale mix of old and new fields');
    }

    // ---------------------------------------------------------------
    // Section H — Navigate remains fully independent of the new
    // metadata.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Kestrel Point' });
        const [row] = makeRows([{ claim: discoverAsEnvelope(claim).claim, position: pos(0, 0) }], (id) => id);

        let focusedRegionId = null;
        const session = makeGetRegionsSession(
            [{ id: 'region-1', worldId: 'world-1' }],
            { onFocusLocation: (id) => { focusedRegionId = id; } }
        );
        const feedback = { show: () => { throw new Error('feedback.show must not be called on a successful navigation'); } };

        const result = navigateToNearbyPlaceNamingClaim(session, row, feedback);

        assert(result === true && focusedRegionId === 'region-1', '8a. Navigate still targets the exact claimed region, unaffected by the row also carrying createdAtLabel');

        // 8b. A row missing/blank createdAtLabel (the malformed case from
        // Section E) navigates identically — Navigate never reads
        // createdAtLabel at all.
        const malformedRow = { ...row, createdAtLabel: '' };
        focusedRegionId = null;
        const result2 = navigateToNearbyPlaceNamingClaim(session, malformedRow, feedback);
        assert(result2 === true && focusedRegionId === 'region-1', '8b. Navigate is identical for a row whose createdAtLabel is empty — the field is display-only and never consulted');

        console.log('✓ Section H: Navigate remains entirely unaffected by the new createdAtLabel field, well-formed or not');
    }

    // ---------------------------------------------------------------
    // Section I — Adopt remains fully independent of the new metadata:
    // it rehydrates from the row's own RAW createdAt, never
    // createdAtLabel.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Willowmere', createdAt: new Date('2026-02-02T00:00:00.000Z') });
        const [row] = makeRows([{ claim: discoverAsEnvelope(claim).claim, position: pos(0, 0) }], (id) => id);

        const result = adoptNearbyPlaceNamingClaim(bobReplica, row);
        assert(result.isNew === true, '9a. adoption still succeeds exactly as before this milestone');
        assert(result.claim.createdAt.toISOString() === claim.toJSON().createdAt,
            '9b. the adopted claim\'s createdAt is the row\'s own RAW createdAt, byte-for-byte — never anything derived from createdAtLabel');
        assert(result.claim.authorIdentityId === alice.identityId, '9c. authorship is preserved exactly as before (0.9.263)');

        // 9d. LIVE PROOF: the adopted claim still genuinely re-verifies —
        // rendering createdAtLabel never touches signature verification.
        const stillVerifies = bobReplica.verifier.verifyPlaceNamingClaim(result.claim.toJSON());
        assert(stillVerifies.valid === true, '9d. the adopted claim still independently verifies against the real, unmodified verifier');

        // 9e. Adopt still succeeds identically even when createdAtLabel is
        // empty (the Section E malformed case) — PlaceNamingClaim.fromJSON()
        // never reads createdAtLabel, only createdAt.
        const carolReplica = makeReplica(makeIdentity('Carol'));
        const malformedRow = { ...row, claimId: 'claim-malformed-label', createdAtLabel: '' };
        const claim2 = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Second Place' });
        const [row2] = makeRows([{ claim: discoverAsEnvelope(claim2).claim, position: pos(0, 0) }], (id) => id);
        const result2 = adoptNearbyPlaceNamingClaim(carolReplica, { ...row2, createdAtLabel: '' });
        assert(result2.isNew === true, '9f. adoption succeeds identically whether or not createdAtLabel happens to be blank');

        console.log('✓ Section I: Adopt continues to rehydrate strictly from the row\'s own raw createdAt/signature/authorIdentityId — createdAtLabel is never read by the adoption path');
    }

    // ---------------------------------------------------------------
    // Section J — rendering metadata implies no ranking or preference.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const older = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Older Claim', createdAt: new Date('2020-01-01T00:00:00.000Z') });
        const newer = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Newer Claim', createdAt: new Date('2026-01-01T00:00:00.000Z') });
        const entries = [newer, older].map((c) => ({ claim: discoverAsEnvelope(c).claim, position: pos(0, 0) }));
        const rows = makeRows(entries, (id) => id);

        assert(rows[0].name === 'Newer Claim' && rows[1].name === 'Older Claim',
            '10a. discovery order is preserved exactly — the newer claim was discovered first here and stays first, never resorted by createdAt');

        // 10b. namingView() itself — the one real ranking authority in
        // this domain — carries no createdAt-driven ordering; it still
        // ranks purely by distinct-author score, unaffected by this
        // milestone.
        const view = deriveNamingView('region-1', [older, newer]);
        assert(view.length === 2 && view.every((e) => e.score === 1), '10c. namingView() still ranks both claims with equal, un-tiebroken score');

        // 10d. core/PlaceNamingView.js does read createdAt — but only to
        // order the claims WITHIN one already-formed name entry ("most
        // recent first," so a UI can show "who said this" without a
        // second lookup, per that file's own header) — never to rank
        // ENTRIES against each other. The entry-level sort itself is
        // still strictly score, then name.
        const viewSource = codeOnlyLines(await rawSource('core/PlaceNamingView.js'));
        assert(viewSource.includes('.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));'),
            '10d. core/PlaceNamingView.js still ranks entries by score then name only — createdAt never enters entry-level ranking');

        console.log('✓ Section J: rendering createdAt/author metadata implies no ranking, ordering, or preference — discovery order and namingView()\'s own equal-score model are both untouched');
    }

    // ---------------------------------------------------------------
    // Section K — rendering metadata never mutates the World.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Suspiciously Convenient Name' });
        let regionName = 'Original Region Name';
        const regionRecord = { id: 'region-1', worldId: 'world-1', position: pos(0, 0), get name() { return regionName; } };

        makeRows([{ claim: discoverAsEnvelope(claim).claim, position: pos(0, 0) }], (id) => id);

        assert(regionRecord.name === 'Original Region Name', '11a. computing rows never renames the WorldRegion the claim describes');

        const computedRowsBlock = extractBetween(
            codeOnlyLines(await rawSource('ui/views/WorldView.js')),
            'const nearbyPlaceNamingClaimRows = computed(() => (',
            'function goToNearbyCollaborator(deviceId) {'
        );
        const forbiddenTerms = ['updateRegion(', 'renameRegion(', 'setWorldRegion(', 'createRegionHere(', '.sort(', 'rankClaimsByName'];
        for (const term of forbiddenTerms) {
            assert(!computedRowsBlock.includes(term), `11b. the real nearbyPlaceNamingClaimRows computed contains no '${term}' — no World mutation, no re-ranking`);
        }

        console.log('✓ Section K: rendering the row\'s metadata never mutates WorldRegion naming or anything else in the World');
    }

    // ---------------------------------------------------------------
    // Section L — the existing verification boundary is preserved: no
    // signature is rendered, no new verification vocabulary exists in
    // the new code.
    // ---------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        const formatterBlock = extractBetween(worldViewCode, 'function formatNearbyPlaceNamingCreatedAt(createdAt) {', 'const nearbyPlaceNamingClaimRows = computed(() => (');

        assert(!nearbyBlock.includes('claim.signature'), '12a. the Nearby Place Names template still never renders claim.signature');
        assert(!/verified|unverified|isVerified|verification-status/i.test(nearbyBlock),
            '12b. no verification vocabulary of any kind appears in the Nearby Place Names template');
        assert(!/verifyPlaceNamingClaim|LocalAuthorizationVerifier/.test(formatterBlock),
            '12c. formatNearbyPlaceNamingCreatedAt() calls no verification machinery — it is a pure date formatter, nothing else');
        assert(nearbyBlock.includes('claim.createdAtLabel'), 'sanity: createdAt IS now rendered, confirming this is a deliberate boundary choice, not an oversight');

        console.log('✓ Section L: the existing verification boundary is fully preserved — createdAt is rendered, signature/verification status is not, and no new verification vocabulary was introduced');
    }

    // ---------------------------------------------------------------
    // Section M — FLAGSHIP: real Nostr -> discovery -> proximity ->
    // presentation, metadata derived end to end from a real, signed
    // claim.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const worldId = 'world-1';
        const regionId = 'region-near';
        const tag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const claim = signedClaim(alice, { worldId, regionId, name: 'Old Oak Crossing', createdAt: new Date('2026-04-01T00:00:00.000Z') });
        const envelope = buildPlaceNamingDiscoveryEnvelope(claim);
        const event = {
            id: 'event-flagship', pubkey: 'nostr-transport-pubkey-should-never-surface', kind: 1,
            tags: [['t', tag]], content: JSON.stringify(envelope), sig: 'sig-flagship'
        };
        async function queryImpl(relayUrl, filter) {
            return filter['#t'][0] === tag ? [event] : [];
        }
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [source] });
        const session = new Proxy({ getRegions: () => [{ id: regionId, worldId, position: pos(0, 0) }] }, {
            get(target, prop) { return prop === 'getRegions' ? target.getRegions : undefined; }
        });
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                const regions = session.getRegions();
                return Promise.all(regions.map((region) => executeDiscoverPlaceNamingClaimsCommand({
                    discoveryTag: derivePlaceNamingDiscoveryTag(region.worldId, region.id),
                    discoveryQueryService: queryService
                }))).then((perRegionResults) => perRegionResults.flat());
            },
            resolveClaimPosition: (env) => {
                const region = session.getRegions().find((r) => r.worldId === env.worldId && r.id === env.regionId);
                return region ? region.position : null;
            }
        });

        await monitor.observe(pos(0, 0));
        assert(monitor.lastResult.length === 1, 'sanity: the real Nostr event was discovered and resolved as nearby');

        const rows = makeRows(monitor.lastResult, (id) => `display:${id}`);
        assert(rows[0].authorDisplayName === `display:${alice.identityId}`,
            '13a. FLAGSHIP — the displayed author is resolved from the real claim\'s real authorIdentityId, never the transport pubkey');
        assert(rows[0].createdAtLabel === new Date('2026-04-01T00:00:00.000Z').toLocaleDateString(),
            '13b. FLAGSHIP — the displayed createdAt label is derived from the real, signed claim\'s real createdAt, discovered end to end over a real Nostr query path');
        assert(!JSON.stringify(rows).includes('nostr-transport-pubkey-should-never-surface'),
            '13c. FLAGSHIP — the raw Nostr transport pubkey never reaches the presented row');

        console.log('✓ Section M (FLAGSHIP): metadata presentation works end to end through the real Nostr discovery source, the real discovery command, and the real proximity monitor');
    }

    // ---------------------------------------------------------------
    // Section N — architectural regression: the reproduction above
    // genuinely matches what ui/views/WorldView.js contains.
    // ---------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));

        assert(worldViewCode.includes('function formatNearbyPlaceNamingCreatedAt(createdAt) {'),
            '14a. WorldView.js defines the real formatNearbyPlaceNamingCreatedAt() formatter');
        const rowMapping = worldViewCode.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        assert(rowMapping.includes('createdAtLabel: formatNearbyPlaceNamingCreatedAt(entry.claim.createdAt)'),
            '14b. the real nearbyPlaceNamingClaimRows computed carries createdAtLabel, built via the real formatter');
        assert(rowMapping.includes('createdAt: entry.claim.createdAt') && rowMapping.includes('signature: entry.claim.signature'),
            '14c. the raw createdAt/signature fields (0.9.263) are still carried, unremoved, alongside the new createdAtLabel');

        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(nearbyBlock.includes('claim.createdAtLabel'), '14d. the real template renders claim.createdAtLabel');
        assert(nearbyBlock.includes('Created:'), '14e. the real template labels the rendered date "Created:"');
        assert(!nearbyBlock.includes('claim.createdAt }}') && !nearbyBlock.includes('claim.createdAt.'),
            '14f. the real template never renders the RAW claim.createdAt directly — only the formatted createdAtLabel');

        assert((await rawSource('css/main.css')).includes('.world-view-place-naming-created'),
            '14g. css/main.css styles the new metadata line');

        console.log('✓ Section N: ui/views/WorldView.js genuinely contains the createdAtLabel wiring every section above assumes');
    }

    console.log('\n✅ All Nearby Place Naming Metadata Presentation tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
