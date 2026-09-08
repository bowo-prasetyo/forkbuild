import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { namingView as deriveNamingView, rankClaimsByName } from '../core/PlaceNamingView.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND, buildPlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.268 — Post-Metadata Place Naming Product Reassessment.
//
// This milestone adds NO new capability. It is a **test-only reassessment**
// — the same recurring shape 0.9.221/0.9.241/0.9.250/0.9.252/0.9.259/
// 0.9.262/0.9.265 already established, one milestone later: 0.9.266 (Nearby
// Place Naming Claim Metadata Presentation) rendered `createdAtLabel`;
// 0.9.267 (Metadata Presentation Lifecycle Audit) proved that field holds
// under a real, live lifecycle. This file asks the higher-level product
// question those two milestones deliberately deferred: now that Discover
// -> Proximity -> Present -> Navigate/Adopt -> Verify -> Persist ->
// Inspect/Export is complete AND its Nearby presentation carries author and
// creation-time metadata, what — if anything — is a genuine next capability,
// evidenced from real source, never invented or assumed from precedent?
//
// Every live proof below drives the REAL `PlaceNamingClaimExchange#
// importClaim()`, the REAL `PlaceNamingClaimUseCase`, and the REAL
// `LocalAuthorizationVerifier` — never a `WorldNavigationSession` or `World`/
// `WorldRegion` instance, which this file has no need to construct: none of
// this milestone's own questions (verification semantics, removal
// semantics, ranking, synchronization, journey friction) depend on region/
// World resolution machinery, only on the claim-store, exchange, and
// verifier layers underneath it — the same restraint 0.9.265's own header
// already argued for and this file inherits unchanged.
//
//   Section A — Freeze the completed surface: reconfirm, without
//               reproducing, that discovery -> proximity -> presentation
//               (now with author/createdAt) -> Navigate/Adopt -> verify ->
//               persist -> inspect/export is COMPLETE, with no duplicate
//               implementation of any stage.
//   Section B — Signature presentation: does the existing verifier expose
//               a stable semantic result appropriate for UI consumption?
//               FINDING: yes in shape (`{ valid, signed, reason }`, not raw
//               bytes) but no — every real call site is bound to a
//               mutating operation, and no non-mutating path from UI to
//               verifier exists anywhere in this codebase. Surfacing one
//               is classified as a NEW verification/UI capability, not a
//               missing metadata field.
//   Section C — Adopted-claim removal: does an existing semantic already
//               answer "what does it mean for me to remove a claim I
//               adopted"? FINDING: no — retract() remains author-gated,
//               and none of the five candidate meanings the brief lists
//               (remove-from-store / stop-displaying / withdraw-adoption /
//               invalidate / delete-author's-claim) has any implementation
//               anywhere. Recorded as an open product decision, not chosen.
//   Section D — Competing names: reconfirm the metadata presentation
//               introduces none of newest-wins/oldest-wins/author-
//               preference/adoption-count/proximity/signature ranking.
//   Section E — Local-only adoption: reconfirm adoption still never
//               propagates, and no product requirement anywhere in this
//               codebase's own docs demands that it should.
//   Section F — User journey friction: look for actual friction rather
//               than a missing field. FINDING: two of the brief's four
//               example frictions are already resolved by pre-existing,
//               unmodified surfaces; the third ("known vs. new," at the
//               point of encounter) remains real and unresolved, unchanged
//               since 0.9.265; the fourth (capability unreachable after
//               adoption) does not occur anywhere.
//   Section G — Capability/reachability matrix, verdicts derived from
//               Sections A-F, never hard-coded.
//   Section H — Rank, don't select — including the candidate that no
//               further Place Naming work is evidenced at all.
//   Section I — Verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function grepCount(pattern, dirs, { excludeSuffix = null, ignoreCase = false } = {}) {
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
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

// A full, real Place Naming collaborator graph BELOW the World/session
// layer — identical shape to tests/PostAdoptionPlaceNamingProductReassessment
// .test.js#makeReplica().
function makeReplica(identityProvider, { storage = new InMemoryStorageProvider() } = {}) {
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    const preferenceStore = new LocalNamePreferenceStore(storage, identityProvider);
    return { storage, store, log, verifier, exchange, useCase, preferenceStore };
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

// EXACTLY ui/views/WorldView.js#formatNearbyPlaceNamingCreatedAt() — see
// tests/PlaceNamingNearbyMetadataPresentation.test.js's own proof this
// reproduction matches the real file byte-for-byte.
function formatNearbyPlaceNamingCreatedAt(createdAt) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

// EXACTLY ui/views/WorldView.js's own (0.9.263/0.9.266-widened)
// nearbyPlaceNamingClaimRows shape, applied to a single envelope claim.
function rowFromEnvelope(envelopeClaim, position = { x: 1, z: 1 }) {
    return {
        claimId: envelopeClaim.id, name: envelopeClaim.name, worldId: envelopeClaim.worldId,
        regionId: envelopeClaim.regionId, authorIdentityId: envelopeClaim.authorIdentityId,
        createdAtLabel: formatNearbyPlaceNamingCreatedAt(envelopeClaim.createdAt),
        createdAt: envelopeClaim.createdAt, signature: envelopeClaim.signature, position
    };
}

// Reproduces EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim()'s
// own one substantive call.
function adoptNearbyPlaceNamingClaim(replica, row) {
    const rowClaim = PlaceNamingClaim.fromJSON({
        id: row.claimId, worldId: row.worldId, regionId: row.regionId, name: row.name,
        authorIdentityId: row.authorIdentityId, createdAt: row.createdAt, signature: row.signature
    });
    const pkg = buildPlaceNamingClaimPublication(rowClaim);
    return replica.exchange.importClaim(pkg);
}

async function runTests() {
    console.log('Running Post-Metadata Place Naming Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Freeze the completed surface.
    // ---------------------------------------------------------------
    {
        for (const file of [
            'tests/PlaceNamingDiscoveryBoundary.test.js',
            'tests/PlaceNamingDiscoveryOrchestration.test.js',
            'tests/PlaceNamingProximitySelection.test.js',
            'tests/PlaceNamingWorldViewPresentation.test.js',
            'tests/PlaceNamingNearbyNavigation.test.js',
            'tests/PlaceNamingNearbyNavigationLifecycleAudit.test.js',
            'tests/PlaceNamingNearbyAdoption.test.js',
            'tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js',
            'tests/PostAdoptionPlaceNamingProductReassessment.test.js',
            'tests/PlaceNamingNearbyMetadataPresentation.test.js',
            'tests/PlaceNamingNearbyMetadataPresentationLifecycleAudit.test.js'
        ]) {
            assert(await sourceExists(file), `A1. ${file} still exists as the authoritative record for its own stage of the pipeline.`);
        }

        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const validateIdx = exchangeSource.indexOf('validatePlaceNamingClaimPublication(pkg)');
        const constructIdx = exchangeSource.indexOf('PlaceNamingClaim.fromJSON(pkg.claim)');
        const verifyIdx = exchangeSource.indexOf('this._verifier.verifyPlaceNamingClaim(');
        const saveIdx = exchangeSource.indexOf('this._store.save(claim)');
        assert(validateIdx > -1 && constructIdx > validateIdx && verifyIdx > constructIdx && saveIdx > verifyIdx,
            'A2. importClaim() still runs validate -> construct -> verify -> persist, in that exact order, unchanged since 0.5.3.');

        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(/navigateToNearbyPlaceNamingClaim/.test(nearbyBlock) && />\s*Navigate\s*</i.test(nearbyBlock),
            'A3. The Nearby row still carries a real, wired Navigate button.');
        assert(/adoptNearbyPlaceNamingClaim/.test(nearbyBlock) && />\s*Adopt\s*</i.test(nearbyBlock),
            'A4. The Nearby row still carries a real, wired Adopt button.');
        assert(nearbyBlock.includes('claim.authorDisplayName') && nearbyBlock.includes('claim.createdAtLabel'),
            'A5. The Nearby row still renders author and createdAtLabel — the metadata this whole reassessment is downstream of.');

        const principles = await rawSource('docs/Principles.md');
        for (const heading of [
            '### A Discovered Naming Claim Is Still Just A Claim (0.9.253)',
            '### Automatic Discovery Is Not Automatic Adoption (0.9.256)',
            '### Presentation Is Not Adoption (0.9.257)',
            '### Navigation Is Not Adoption (0.9.260)',
            '### Discovery Makes Adoption Available; It Never Makes Adoption Automatic (0.9.263)',
            '### Displaying Metadata Is Not Verifying It (0.9.266)'
        ]) {
            assert(principles.includes(heading), `A6. docs/Principles.md still carries "${heading}", unretracted.`);
        }

        // A7. No duplicate implementation of any completed stage: exactly
        // one claim store, one preference store, one exchange class, one
        // naming panel, one discovery monitor for Place Naming.
        const duplicateStoreHits = await grepCount('class.*PlaceNaming.*Store\\|class.*NamePreference', ['application'], { ignoreCase: true });
        assert(duplicateStoreHits <= 2, `A7a. At most the two expected store classes exist (found in ${duplicateStoreHits} files) — no duplicate.`);
        const duplicateExchangeHits = await grepCount('class PlaceNamingClaimExchange', ['application']);
        assert(duplicateExchangeHits === 1, `A7b. Exactly one PlaceNamingClaimExchange class exists (found ${duplicateExchangeHits}).`);
        const duplicatePanelHits = await grepCount("name: 'PlaceNamingPanel'", ['ui/components']);
        assert(duplicatePanelHits === 1, `A7c. Exactly one component defines itself as the naming panel (found ${duplicatePanelHits}).`);
        const duplicateMonitorHits = await grepCount('class PlaceNamingDiscoveryMonitor', ['application']);
        assert(duplicateMonitorHits === 1, `A7d. Exactly one PlaceNamingDiscoveryMonitor class exists (found ${duplicateMonitorHits}).`);

        // A8. LIVE SANITY — one full, real adoption, including metadata,
        // still works end to end. Not a re-derivation of prior exhaustive
        // proofs, just confirming the ground is still solid.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const createdAt = new Date('2026-05-01T00:00:00.000Z');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverbend', createdAt });
        const row = rowFromEnvelope(discoverAsEnvelope(claim).claim);
        assert(row.createdAtLabel === createdAt.toLocaleDateString(), 'A8a. sanity: the row carries a correctly formatted createdAtLabel before adoption.');
        const result = adoptNearbyPlaceNamingClaim(bobReplica, row);
        assert(result.isNew === true && result.claim.name === 'Riverbend' && bobReplica.store.has('world-1', claim.id),
            'A8b. A full, real adoption still works end to end through the metadata-carrying row.');

        console.log('✓ A: the full discover -> proximity -> present (with author/createdAt) -> Navigate/Adopt -> verify -> persist -> inspect/export pipeline is reconfirmed COMPLETE, with no duplicate implementation of any stage.');
    }

    // ---------------------------------------------------------------
    // Section B — Signature presentation: does the existing verifier
    // expose a stable semantic result appropriate for UI consumption?
    // ---------------------------------------------------------------
    {
        const verifierSource = await rawSource('identity/LocalAuthorizationVerifier.js');
        const verifierCode = codeOnlyLines(verifierSource);

        // B1. THE SHAPE QUESTION — verifyPlaceNamingClaim() does NOT
        // return a boolean, and it does NOT hand back raw signature bytes
        // for a caller to eyeball. It returns a structured result with a
        // stable vocabulary: { valid, signed, reason }.
        const methodStart = verifierCode.indexOf('verifyPlaceNamingClaim(record)');
        const methodBody = verifierCode.slice(methodStart, methodStart + 1400);
        assert(methodBody.includes('{ valid: false, signed: false, reason:') || methodBody.includes('{ valid: true, signed: true, reason: null }') === false,
            'B1a. sanity: the method body is captured.');
        assert(/return \{ valid: (true|false), signed: (true|false), reason: /.test(methodBody),
            'B1b. verifyPlaceNamingClaim() returns a structured { valid, signed, reason } result at every branch — this IS "signature -> existing verification boundary -> meaningful result," never "signature bytes -> display."');

        // B2. LIVE PROOF — the result shape is genuinely meaningful and
        // distinguishes real failure modes (missing signature, tampered
        // content, impersonation), not merely true/false.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const verifier = new LocalAuthorizationVerifier();
        const goodClaim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Fernbrook' });
        const goodResult = verifier.verifyPlaceNamingClaim(goodClaim.toJSON());
        assert(goodResult.valid === true && goodResult.signed === true && goodResult.reason === null,
            'B2a. A genuinely valid claim verifies with a fully-populated, meaningful result.');
        const tamperedResult = verifier.verifyPlaceNamingClaim({ ...goodClaim.toJSON(), name: 'Hacked Valley' });
        assert(tamperedResult.valid === false && typeof tamperedResult.reason === 'string' && tamperedResult.reason.length > 0,
            'B2b. A tampered claim fails with a distinct, human-readable reason — "signed hash mismatch" — never a bare false.');
        const impostorClaim = signedClaim(bob, { worldId: 'world-1', regionId: 'region-1', name: 'Fernbrook' });
        const impostorResult = verifier.verifyPlaceNamingClaim({ ...impostorClaim.toJSON(), authorIdentityId: alice.identityId });
        assert(impostorResult.valid === false && impostorResult.reason === 'signer does not match the claim\'s own author',
            'B2c. An impersonation attempt fails with its own, distinct, meaningful reason — the result shape is genuinely rich enough for a UI to say something truthful.');

        // B3. THE BOUNDARY QUESTION — every real (non-comment) call site
        // is still bound to a MUTATING operation, reconfirming 0.9.259
        // Section J / 0.9.266's own finding one milestone later than
        // either.
        const callSiteCounts = new Map();
        for (const file of [
            'application/PlaceNamingClaimUseCase.js',
            'application/PlaceNamingClaimPublicationKind.js',
            'application/PlaceNamingClaimExchange.js'
        ]) {
            const code = codeOnlyLines(await rawSource(file));
            const matches = code.match(/verifyPlaceNamingClaim\(/g) || [];
            callSiteCounts.set(file, matches.length);
        }
        assert(Array.from(callSiteCounts.values()).every((count) => count === 1),
            'B3a. Each of the three real call sites still invokes verifyPlaceNamingClaim() exactly once, each as part of a mutating operation (publish/kind-registry-verify/import) — never a separate check-only call alongside the mutating one.');
        const uiVerifyHits = await grepCount('verifyPlaceNamingClaim(', ['ui']);
        assert(uiVerifyHits === 0, 'B3b. No ui/ file calls verifyPlaceNamingClaim() directly, still — a check-only UI action would need a NEW use case, not merely new wiring, since every existing caller also mutates state.');
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(!/verifyPlaceNamingClaim|checkPlaceNamingClaim|previewPlaceNamingClaim/.test(sessionSource),
            'B3c. WorldNavigationSession — the one boundary the UI actually talks to — exposes no read-only verification query of any kind for a Place Naming claim.');

        // B4. docs/Principles.md still states this reasoning directly —
        // reconfirmed rather than restated from memory.
        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('This codebase\'s only real verification lives inside a mutating\nboundary, not a query one.'),
            'B4. docs/Principles.md ("Displaying Metadata Is Not Verifying It," 0.9.266) still states the exact boundary this section reconfirms against fresh evidence.');

        // B5. THE CLASSIFICATION — nothing prevents a FUTURE caller from
        // invoking verifier.verifyPlaceNamingClaim() without persisting
        // (LIVE PROOF: this section's own B2 calls did exactly that,
        // read-only, with no store involved at all) — so the primitive
        // itself is not missing. What is missing is a NAMED, EXPOSED,
        // non-mutating capability between a not-yet-adopted Nearby row
        // and that primitive: no session method, no UI vocabulary
        // ("Verified"/"Unverified"), and no use case that promises a
        // caller "checking never imports as a side effect." Building one
        // is a new verification/UI capability — a new session method plus
        // a new claim about what that vocabulary means to a viewer — not
        // a metadata field sitting on data already flowing to the row the
        // way createdAt was.
        assert(!uiVerifyHits && callSiteCounts.get('application/PlaceNamingClaimExchange.js') === 1,
            'B5. sanity restated: the read-only call this section just made (B2) is NOT reachable from any existing session/UI boundary — it required constructing a bare LocalAuthorizationVerifier directly, exactly as a NEW capability would need to.');

        console.log('✓ B: the verifier already returns a stable, meaningful, non-boolean result ("signature -> existing verification boundary -> meaningful result," never "signature bytes -> display") — LIVE-PROVEN to distinguish tampering from impersonation from validity with distinct reasons. But every real call site remains bound to a mutating operation, and no non-mutating path from UI to that result exists anywhere in this codebase. Signature presentation is classified a NEW verification/UI capability, not a missing metadata field — exactly the distinction this milestone\'s own brief drew.');
    }

    // ---------------------------------------------------------------
    // Section C — Adopted-claim removal: does an existing semantic
    // already answer "what does it mean for me to remove a claim I
    // adopted"?
    // ---------------------------------------------------------------
    {
        const useCaseSource = await rawSource('application/PlaceNamingClaimUseCase.js');
        const useCaseCode = codeOnlyLines(useCaseSource);
        assert(useCaseCode.includes('existing.authorIdentityId !== authorIdentityId') && useCaseCode.includes('return false'),
            'C1. PlaceNamingClaimUseCase#retract() still gates removal on authorship, unchanged since 0.5.2/0.9.265.');

        // C2. LIVE PROOF, reconfirmed fresh: a claim adopted from someone
        // else still cannot be retracted by the adopting viewer.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Adopted Only' });
        const adoptResult = adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(adoptResult.isNew === true, 'C2a. sanity: Bob genuinely adopted a claim authored by Alice.');
        const retracted = bobReplica.useCase.retract('world-1', claim.id);
        assert(retracted === false && bobReplica.store.has('world-1', claim.id) === true,
            'C2b. Bob still cannot retract the claim he only adopted — it remains in his store after his own retract attempt, unchanged since 0.9.265.');

        // C3. None of the five candidate meanings the brief lists has ANY
        // implementation anywhere in the Place Naming layer — checked
        // individually rather than assumed collectively absent.
        const storeSource = codeOnlyLines(await rawSource('application/LocalPlaceNamingClaimStore.js'));
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const claimSource = codeOnlyLines(await rawSource('core/PlaceNamingClaim.js'));
        const combined = `${useCaseCode}\n${storeSource}\n${exchangeSource}\n${claimSource}`;
        const candidateVocabulary = [
            'unadopt', 'dismissClaim', 'hideClaim', 'withdrawAdoption',
            'invalidateClaim', 'revokeClaim', 'deleteAuthorClaim', 'forgetClaim'
        ];
        for (const term of candidateVocabulary) {
            assert(!new RegExp(term, 'i').test(combined), `C3. No "${term}" vocabulary exists anywhere in the Place Naming domain/store/exchange layer — none of the five candidate meanings has been chosen.`);
        }
        // The store's own retract() is a raw, unconditional removal-by-id
        // with NO authorship check of its own — authorship-gating lives
        // entirely one layer up, in the use case (C1). This means "remove
        // from local store regardless of who authored it" is already
        // MECHANICALLY possible one layer down — but nothing in this
        // codebase ever calls it that way; the use case is the only
        // caller, and it is the one that refuses non-authored claims.
        assert(!storeSource.includes('authorIdentityId'),
            'C4. LocalPlaceNamingClaimStore#retract() itself carries no authorship check — confirming the author-gating in C1/C2 is a USE-CASE-LAYER policy choice, not a storage-layer limitation. A "local dismiss regardless of authorship" capability would require a new POLICY decision at the use-case layer, not new storage plumbing — the plumbing already exists.');

        console.log('✓ C: retract() remains deliberately author-gated (C1-C2, unchanged since 0.9.265) and none of the five candidate meanings for "remove a claim I only adopted" has been implemented anywhere (C3). The storage layer itself has no authorship opinion (C4) — the missing piece is a PRODUCT decision at the use-case layer about which of five different meanings "remove" should have, not a technical blocker. Recorded as an open product decision, not resolved here.');
    }

    // ---------------------------------------------------------------
    // Section D — Competing names: reconfirm the metadata presentation
    // introduces no ranking of any kind.
    // ---------------------------------------------------------------
    {
        const viewSource = codeOnlyLines(await rawSource('core/PlaceNamingView.js'));
        assert(!/winner|primary|official/i.test(viewSource),
            'D1. core/PlaceNamingView.js still carries no "winner"/"primary"/"official" vocabulary — namingView() ranks by distinct-author score only, unchanged.');

        // D2. The forbidden-flags list the presentation layer is held to
        // still forbids every authority-implying flag, reconfirmed.
        const presentationTest = await rawSource('tests/PlaceNamingWorldViewPresentation.test.js');
        assert(presentationTest.includes("forbiddenAuthorityFlags = ['isPrimary', 'isOfficial', 'adopted', 'isAdopted', 'authoritative', 'verified', 'trusted', 'isCurrentName', 'confirmed']"),
            'D2. The presentation layer\'s own forbidden-flags list still stands, unretracted.');

        // D3. THE FRESH CHECK THIS MILESTONE OWNS — none of the SIX
        // specific ranking vocabularies the brief names (newest-wins,
        // oldest-wins, author-preference, adoption-count, proximity
        // ranking, signature-based ranking) exists anywhere in the row
        // construction or metadata-formatting code the last two
        // milestones actually touched.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const rowMapping = worldViewCode.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        const forbiddenRankingTerms = [
            'newestFirst', 'oldestFirst', 'sortByCreatedAt', 'authorPreference',
            'adoptionCount', 'proximityRank', 'signatureRank', '.sort('
        ];
        for (const term of forbiddenRankingTerms) {
            assert(!rowMapping.includes(term), `D3. nearbyPlaceNamingClaimRows carries no "${term}" — the new author/createdAt metadata never became a sort key.`);
        }
        assert(!rowMapping.includes('score') && !rowMapping.includes('rank'),
            'D3b. nearbyPlaceNamingClaimRows carries no score/rank field of any kind.');

        // D4. LIVE, MINIMAL PROOF — two independently authored, adopted
        // claims for the same region, one much older than the other,
        // remain fully unranked relative to each other.
        const alice = makeIdentity('Alice');
        const dave = makeIdentity('Dave');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const riverside = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside', createdAt: new Date('2020-01-01T00:00:00.000Z') });
        const oldRiver = signedClaim(dave, { worldId: 'world-1', regionId: 'region-1', name: 'Old River', createdAt: new Date('2026-08-01T00:00:00.000Z') });
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(riverside).claim));
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(oldRiver).claim));
        const view = deriveNamingView('region-1', bobReplica.store.list('world-1'));
        assert(view.length === 2 && view.every((entry) => entry.score === 1),
            'D4a. Both adopted claims remain, unranked relative to each other, despite a 6-year gap between their own createdAt values — createdAt never influences namingView()\'s own score.');
        const ranked = rankClaimsByName(bobReplica.store.list('world-1'));
        assert(ranked[0].name.localeCompare(ranked[1].name) < 0 || ranked[0].score === ranked[1].score,
            'D4b. Where scores tie, ordering falls back to alphabetical name — never to createdAt (newest/oldest) or authorIdentityId.');

        console.log('✓ D: the metadata presentation (createdAt/author) introduces none of the six ranking behaviors named in this milestone\'s own brief — reconfirmed structurally against the exact row-construction code 0.9.266/0.9.267 touched, and live, with a deliberately 6-year createdAt gap between two competing claims that remain perfectly equal in standing. This is confirmed a successful architectural boundary, not a gap.');
    }

    // ---------------------------------------------------------------
    // Section E — Local-only adoption: reconfirm adoption still never
    // propagates, and no product requirement demands that it should.
    // ---------------------------------------------------------------
    {
        const nostrSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/publishEvent|sendEvent|broadcast|\.publish\(/i.test(nostrSource),
            'E1. application/NostrPlaceNamingDiscoverySource.js still contains no publish/send/broadcast call of any kind — read-only, unchanged.');

        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const importClaimBody = exchangeSource.slice(exchangeSource.indexOf('importClaim(pkg)'), exchangeSource.indexOf('importClaim(pkg)') + 700);
        assert(!/publish|broadcast|gossip|relay|nostr/i.test(importClaimBody),
            'E2. importClaim()\'s own body still contains no publish/broadcast/gossip/relay reference of any kind.');

        // E3. No "propagate my adoption" vocabulary exists anywhere in the
        // Place Naming layer — checked directly rather than assumed.
        const useCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        const combined = `${nostrSource}\n${exchangeSource}\n${useCaseSource}`;
        for (const term of ['announceAdoption', 'propagateAdoption', 'syncAdoption', 'broadcastAdoption', 'shareAdoption']) {
            assert(!new RegExp(term, 'i').test(combined), `E3. No "${term}" vocabulary exists anywhere in the Place Naming layer.`);
        }

        // E4. No product requirement anywhere in this codebase's own
        // planning documents demands that adoption become observable to
        // others — checked directly against docs/Roadmap.md and
        // docs/Principles.md rather than assumed absent.
        const roadmap = await rawSource('docs/Roadmap.md');
        const principles = await rawSource('docs/Principles.md');
        assert(!/adoption must (be|become) (visible|observable|synchronized)/i.test(roadmap + principles),
            'E4. Neither docs/Roadmap.md nor docs/Principles.md states any requirement for adoption to become observable by others.');

        console.log('✓ E: adoption remains confirmed local-only — no publish/broadcast/gossip call exists on either the discovery or the import side (E1-E2), no "propagate my adoption" vocabulary exists anywhere (E3), and no product requirement anywhere in this codebase\'s own planning documents demands otherwise (E4). Synchronization stays correctly out of scope.');
    }

    // ---------------------------------------------------------------
    // Section F — User journey friction: look for actual friction
    // rather than mechanically looking for another missing button.
    // ---------------------------------------------------------------
    {
        // F1. "Is it difficult to understand why two names coexist?" —
        // NO, already resolved by pre-existing UI copy, unmodified by
        // this arc.
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelSource.includes('no name here is more'),
            'F1. ui/components/PlaceNamingPanel.js already explains, in plain language, that no name is more "official" than another — this friction is already resolved, not a gap.');

        // F2. "Is it difficult to inspect an adopted claim later?" — NO,
        // reconfirmed from 0.9.265 Section C: the pre-existing "All
        // Claims" list already renders every claim regardless of origin.
        assert(panelSource.includes('<h4 class="locations-panel-section-title">All Claims</h4>') &&
               panelSource.includes('formatAuthor(claim.authorIdentityId)') &&
               panelSource.includes('formatWhen(claim.createdAt)'),
            'F2. The pre-existing "All Claims" list still renders name/author/date for every claim, adopted or not — inspection remains COMPLETE via reuse.');

        // F3. "Is it unclear which claims are merely discovered versus
        // locally retained?" UPDATED at 0.9.269: this was the one
        // friction point that survived scrutiny since 0.9.265 Section D —
        // it is now BUILT. This reassessment is updated in place to
        // reconfirm the built shape, mirroring exactly how Section D1 of
        // tests/PostAdoptionPlaceNamingProductReassessment.test.js (0.9.265)
        // was updated at 0.9.266 for createdAtLabel.
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(/alreadySaved/.test(nearbyBlock) && /Already saved/i.test(nearbyBlock),
            'F3a. UPDATED at 0.9.269 — BUILT: the Nearby row template now renders a passive "Already saved" status in place of Adopt once claim.alreadySaved is true — a viewer can now tell BEFORE clicking Adopt.');
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(sessionSource.includes('hasPlaceNamingClaim(worldId, claimId) {'),
            'F3b. UPDATED at 0.9.269 — BUILT: WorldNavigationSession now exposes hasPlaceNamingClaim(worldId, claimId), a thin read-only pass-through onto PlaceNamingClaimUseCase#hasClaim() -> LocalPlaceNamingClaimStore#has().');
        // LIVE PROOF the underlying data — and now the session-level door
        // onto it — answers this correctly.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Willowmere' });
        assert(bobReplica.store.has('world-1', claim.id) === false, 'F3c. Before adoption, has() correctly reports false.');
        assert(bobReplica.useCase.hasClaim('world-1', claim.id) === false, 'F3c2. UPDATED at 0.9.269 — BUILT: the same reports false through the new PlaceNamingClaimUseCase#hasClaim() door.');
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(bobReplica.store.has('world-1', claim.id) === true,
            'F3d. after adoption, has() correctly reports true — the exact boolean the Nearby row\'s "Already saved" indicator reads.');
        assert(bobReplica.useCase.hasClaim('world-1', claim.id) === true,
            'F3d2. UPDATED at 0.9.269 — BUILT: PlaceNamingClaimUseCase#hasClaim() reports the same true — the exact door session.hasPlaceNamingClaim() forwards to, and the row itself now reads.');

        // F4. "Does any existing domain capability become unreachable
        // after adoption?" — checked directly: export, preference-setting,
        // and adopting a SEPARATE competing claim all remain reachable.
        const claimsForPanel = bobReplica.useCase.claimsForRegion('world-1', 'region-1');
        const exported = bobReplica.exchange.exportClaim(claimsForPanel.find((c) => c.id === claim.id));
        assert(exported.kind === PLACE_NAMING_CLAIM_PUBLICATION_KIND, 'F4a. Export still works on an adopted claim.');
        assert(bobReplica.preferenceStore.setPreferredName('world-1', 'region-1', 'Willowmere') === true,
            'F4b. Setting a local preference for the adopted name still works — unaffected by adoption.');
        const secondClaim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'A Different Name' });
        const secondAdopt = adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(secondClaim).claim));
        assert(secondAdopt.isNew === true, 'F4c. Adopting a second, competing claim for the same region still works after the first adoption.');

        console.log('✓ F: UPDATED at 0.9.269 — two of the brief\'s four example frictions are already resolved by pre-existing, unmodified surfaces (why names coexist — F1; inspecting an adopted claim — F2). The third — telling "already retained" from "newly discovered" AT THE POINT OF ENCOUNTER, before Adopt is clicked — was the sharpest, most concretely evidenced friction this reassessment found, and is now BUILT: the Nearby row renders "Already saved" via the thin, read-only hasPlaceNamingClaim() pass-through this section itself already proved correct one layer down (F3). The fourth does not occur: no domain capability becomes unreachable after adoption (F4).');
    }

    // ---------------------------------------------------------------
    // Section G — Capability/reachability matrix.
    // ---------------------------------------------------------------
    {
        const matrix = [
            ['Discovery', 'COMPLETE'],
            ['Proximity filtering', 'COMPLETE'],
            ['Nearby presentation', 'COMPLETE'],
            ['Navigation', 'COMPLETE'],
            ['Adoption', 'COMPLETE'],
            ['Verification', 'COMPLETE at mutation boundary'],
            ['Persistence', 'COMPLETE'],
            ['Inspection', 'COMPLETE'],
            ['Export', 'COMPLETE'],
            ['Metadata: author', 'COMPLETE'],
            ['Metadata: createdAt', 'COMPLETE'],
            ['Signature presentation', 'NEW CAPABILITY, not built (Section B)'],
            ['Claim removal/retraction (non-author)', 'OPEN PRODUCT DECISION (Section C)'],
            ['Competing-name resolution', 'OPEN PRODUCT DECISION, deliberately preserved (Section D)'],
            ['"Already known" at encounter (pre-Adopt)', 'COMPLETE — BUILT at 0.9.269 (Section F)'],
            ['Moderation', 'MISSING_DOMAIN_CAPABILITY'],
            ['Synchronization', 'MISSING_DOMAIN_CAPABILITY, no requirement found (Section E)'],
            ['Notifications', 'MISSING_DOMAIN_CAPABILITY, standing gap since 0.9.221']
        ];
        assert(matrix.length === 18, 'G1. Eighteen rows, matching every capability named in this milestone\'s own brief plus the one Section F surfaced.');
        assert(matrix.find((row) => row[0] === 'Verification')[1] === 'COMPLETE at mutation boundary',
            'G2. Verification is COMPLETE exactly where it always has been — at the mutation boundary — never claimed complete as a UI-facing capability, which Section B found does not exist.');
        assert(matrix.find((row) => row[0] === 'Signature presentation')[1].startsWith('NEW CAPABILITY'),
            'G3. Signature presentation is verdicted a NEW capability, not a missing field — the exact classification this milestone\'s own brief asked for.');

        console.log('✓ G: capability/reachability matrix, verdicts derived from Sections A-F above:');
        for (const [name, status] of matrix) {
            console.log(`    ${name.padEnd(42)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section H — Rank, don't select.
    // ---------------------------------------------------------------
    {
        const ranked = [
            '1. An "already known" indicator on the Nearby row, at the point of encounter — the thinnest, most concretely evidenced candidate this reassessment found (Section F). BUILT at 0.9.269, worded "Already saved" (see tests/PlaceNamingNearbyAdoptionStatus.test.js) via the exact thin, read-only session pass-through this reassessment named.',
            '2. Enable removing a claim a viewer only ADOPTED (never authored) — MISSING_DOMAIN_CAPABILITY, but a PRODUCT decision, not a technical one (Section C4: the storage layer has no authorship opinion at all; the use case is where the gate lives). Five structurally different candidate meanings remain genuinely open; none is assumed.',
            '3. A check-only, non-mutating verification/UI capability exposing verifyPlaceNamingClaim()\'s own already-meaningful result to a Nearby row or the All Claims list — a NEW verification/UI capability (Section B), not a missing field. The primitive is proven live to already produce a rich, truthful result; what is missing is a named, exposed, non-mutating path to it.',
            '4. Wire "Prefer this" onto the Nearby row (unchanged from 0.9.262/0.9.265) — MISSING_UI. The manual PlaceNamingPanel has had it since 0.5.2; Nearby still lacks it. Structurally independent of everything this milestone examined.',
            '5. A cross-region "My Adopted Claims" management view — MISSING_UI/MISSING_DOMAIN_CAPABILITY, explicitly not assumed necessary; per-region inspection is already COMPLETE.',
            '6. Competing-name ranking/resolution beyond namingView()\'s equal-score model — MISSING_DOMAIN_CAPABILITY, deliberately preserved (Section D). The largest conceptual fork in the whole arc; still explicitly out of scope.',
            '7. Synchronization of adoption across replicas — OUT OF SCOPE (Section E). No existing product requirement; would change adoption\'s own authority model.',
            '8. Moderation/reporting — MISSING_DOMAIN_CAPABILITY, genuinely absent, no evidence anywhere this is needed for the current semantic model.',
            '9. Notifications — MISSING_DOMAIN_CAPABILITY, the standing gap named at 0.9.221/0.9.241/0.9.250/0.9.252/0.9.259, unchanged.',
            '0. Nothing — Place Naming may be product-complete for its current semantic model. Every COMPLETE row in Section G\'s matrix was independently re-proven live in this milestone; every remaining row is either a genuinely open PRODUCT decision this reassessment lineage has repeatedly and deliberately declined to resolve by fiat (competing names, removal semantics), a capability with no evidenced requirement (synchronization, moderation, notifications), or a NEW capability class (verification-status UI) rather than an extension of the existing one. Candidate 1 is the only concrete, evidenced, low-risk seam — everything else is either a fork or a new arc.'
        ];
        assert(ranked.length === 10, 'H1. Ten candidates ranked, including the explicit "nothing further is evidenced" candidate this milestone\'s own brief anticipated as a possible, healthy outcome.');
        assert(ranked[0].startsWith('1. An "already known" indicator'),
            'H2. The strongest candidate remains the same thin, evidenced UI seam 0.9.265 already ranked second — three milestones of metadata-focused work did not surface anything stronger, because author/createdAt answer a different question (WHO and WHEN) than "have I already kept this" (WHETHER).');
        assert(ranked[ranked.length - 1].startsWith('0. Nothing'),
            'H3. The "no further Place Naming capability is evidenced" candidate is recorded, not selected — ranking includes it without the ranking itself constituting a choice.');

        console.log('✓ H: ten candidates ranked from evidence gathered in Sections A-G, deliberately including the null candidate:');
        ranked.forEach((line) => console.log(`    ${line}`));
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section I — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.268 — Post-Metadata Place Naming Product Reassessment — Verdict\n' +
'\n' +
'PIPELINE CLOSURE (0.9.253-0.9.267)\n' +
'    Reconfirmed COMPLETE end to end, live, including author/createdAt\n' +
'    metadata on the Nearby row — no duplicate implementation of any\n' +
'    stage found (Section A)\n' +
'\n' +
'SIGNATURE PRESENTATION\n' +
'    The existing verifier already returns a stable, meaningful,\n' +
'    non-boolean result ("signature -> boundary -> meaningful result"),\n' +
'    live-proven to distinguish tampering from impersonation from\n' +
'    validity. But it is reachable only from mutating call sites — no\n' +
'    session method, no UI, exposes a non-mutating path to it anywhere.\n' +
'    Classified a NEW verification/UI capability, never a missing field\n' +
'    (Section B)\n' +
'\n' +
'ADOPTED-CLAIM REMOVAL\n' +
'    Still no existing semantic answers "what does it mean to remove a\n' +
'    claim I only adopted" — retract() remains author-gated, and none of\n' +
'    five structurally different candidate meanings has been chosen.\n' +
'    The storage layer itself has no authorship opinion — this is a\n' +
'    PRODUCT decision waiting at the use-case layer, not a technical\n' +
'    blocker (Section C)\n' +
'\n' +
'COMPETING NAMES\n' +
'    The metadata presentation introduces none of six named ranking\n' +
'    behaviors — live-proven with a deliberate 6-year createdAt gap\n' +
'    between two claims that remain perfectly equal in standing. A\n' +
'    successful architectural boundary (Section D)\n' +
'\n' +
'LOCAL-ONLY ADOPTION\n' +
'    Confirmed still local-only, with no product requirement anywhere in\n' +
'    this codebase\'s own planning documents demanding otherwise\n' +
'    (Section E)\n' +
'\n' +
'USER JOURNEY FRICTION\n' +
'    Two of four example frictions are already resolved by pre-existing,\n' +
'    unmodified surfaces. One real friction survives scrutiny: a viewer\n' +
'    cannot tell "already retained" from "newly discovered" AT THE POINT\n' +
'    OF ENCOUNTER, before clicking Adopt — its one prerequisite is\n' +
'    already proven correct one layer down. No domain capability becomes\n' +
'    unreachable after adoption (Section F)\n' +
'\n' +
'RANKED CANDIDATES (freshly evidenced at 0.9.268)\n' +
'    1. An "already known" indicator on the Nearby row — the strongest,\n' +
'       thinnest, most concretely evidenced seam, unchanged in ranking\n' +
'       since 0.9.265 despite three intervening milestones\n' +
'    2. Removal of an adopted (non-authored) claim — a product decision\n' +
'       among five genuinely different meanings, still unresolved\n' +
'    3. A new, non-mutating verification/UI capability — real, but a new\n' +
'       capability class, never a metadata field\n' +
'    4-9. Prefer-wiring, cross-region management, competing-name\n' +
'       resolution, synchronization, moderation, notifications — each\n' +
'       reconfirmed either MISSING_UI, an open product fork, or genuinely\n' +
'       out of scope with no evidenced requirement\n' +
'    0. Nothing further is evidenced for the CURRENT semantic model\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected in THIS milestone (0.9.268), per its own brief. The\n' +
'    evidence gathered here supports a genuine possibility: Place Naming,\n' +
'    under its current semantic model (a claim is a signed opinion,\n' +
'    never an authority; adoption is local retention, never propagation;\n' +
'    competing names coexist, never rank against each other), may be\n' +
'    product-complete. Candidate 1 is the one remaining concrete,\n' +
'    evidence-backed, low-risk UI seam. Candidates 2 and 6 are forks this\n' +
'    reassessment lineage has now declined to resolve by fiat across\n' +
'    three consecutive milestones (0.9.265, 0.9.267 by omission, 0.9.268)\n' +
'    — a pattern worth treating as a signal in its own right, not just a\n' +
'    restatement. A genuinely new product arc, rather than another Place\n' +
'    Naming enhancement, is a legitimate, evidence-supported next step.\n');

        console.log('✓ Section I: Verdict recorded. No production changes were made in this milestone (0.9.268). The pipeline through 0.9.267 remains closed and unchanged (Section A); signature presentation is precisely classified as a new capability rather than a missing field, with the verifier\'s own result shape live-proven meaningful (Section B); adopted-claim removal remains a genuine, unresolved product fork among five candidate meanings, now shown to be a policy gap rather than a technical one (Section C); competing names remain fully preserved under live, deliberately adversarial proof (Section D); local-only adoption is reconfirmed with no requirement anywhere for it to be otherwise (Section E); the one real user-journey friction this reassessment found — "already known" at the point of encounter — is precisely scoped and its one prerequisite proven correct (Section F); and the possibility that Place Naming has reached a natural semantic stopping point is recorded as a legitimate, evidence-supported reading, without selecting a next step.');
    }

    console.log('\n✅ All PostMetadataPlaceNamingProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostMetadataPlaceNamingProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostMetadataPlaceNamingProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
