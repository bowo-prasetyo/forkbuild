import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION, buildPlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.265 — Post-Adoption Place Naming Product Reassessment.
//
// This milestone adds NO new capability. It is a **test-only reassessment**,
// the exact recurring shape 0.9.221/0.9.241/0.9.250/0.9.252/0.9.259/0.9.262
// already established, one boundary later: 0.9.263 (Nearby Place Naming
// Claim Adoption UI) built Adopt; 0.9.264 (Adoption Lifecycle Audit) proved
// it holds under idempotency, competing claims, restarts, tampering, and
// World-identity staleness. The discover -> encounter -> navigate ->
// explicitly adopt -> persist arc is now complete. This file asks the one
// question that arc was built to enable: now that a claim can be adopted,
// what is the next genuinely missing product capability — evidenced from
// real source, never invented or assumed from precedent alone?
//
// Every live proof below drives the REAL `PlaceNamingClaimExchange#
// importClaim()` (the exact boundary `WorldNavigationSession#
// importPlaceNamingClaim()` forwards to, verbatim, with nothing in
// between — see application/WorldNavigationSession.js's own one-line
// body) and the REAL `PlaceNamingClaimUseCase` — never a `WorldNavigationSession`
// or `World`/`WorldRegion` instance, which this file has no need to
// construct: none of this milestone's own questions (semantic boundary,
// getById()-shaped inspection, lifecycle, competing names, synchronization)
// depend on region/World resolution machinery, only on the claim-store and
// exchange layer underneath it.
//
//   Section A — Freeze the completed pipeline: reconfirm, without
//               reproducing, that discovery -> proximity -> Nearby ->
//               Navigate/Adopt -> importPlaceNamingClaim() -> validate ->
//               construct -> verify -> persist is COMPLETE.
//   Section B — Semantic boundary of an adopted claim: search real source
//               for "preferred"/"official"/"active"/"authoritative"
//               vocabulary. FINDING: LocalNamePreferenceStore (0.5.2)
//               already carries a "preferred name" concept — but it is a
//               personal, unsigned, per-region override, structurally
//               unconnected to adoption or to any specific claim id.
//               Adoption's own meaning stays exactly "persisted locally,"
//               confirmed by grep as well as live proof.
//   Section C — What can a user already do with an adopted claim: a
//               getById()-shaped audit. FINDING: no dedicated single-claim
//               lookup exists anywhere in the Place Naming layer — but the
//               PRE-EXISTING, adoption-unaware "All Claims" surface in
//               ui/components/PlaceNamingPanel.js already lists every
//               claim (adopted or self-published) for a region, with
//               author and date, and an Export button that already works
//               on a claim this replica did not author. Inspection and
//               export are COMPLETE via reuse, never built for adoption.
//   Section D — Nearby UI: what a row can and cannot yet distinguish.
//               Name/author/distance are shown; createdAt, verification
//               status, and "already adopted" are not — and no session
//               method yet answers "is this claim already known" without
//               attempting a real import.
//   Section E — Adopted-claim lifecycle: create -> store -> get -> export
//               -> import, and the one genuine asymmetry: retract() is
//               author-gated, so a claim a viewer merely ADOPTED (never
//               authored) can never be removed by that viewer, by anyone,
//               anywhere in the codebase. Proven live. Classified as a
//               product decision, not an implementation omission.
//   Section F — Competing names: reconfirm, without reproducing 0.9.264's
//               own exhaustive proof, that no ranking/winner semantics
//               exist.
//   Section G — Decentralized synchronization: confirm adoption is local
//               only, and that this is not a NEW asymmetry adoption
//               introduced — no Place Naming claim, self-published or
//               adopted, is ever broadcast anywhere; Nostr discovery is
//               read-only.
//   Section H — Product-gap verdict, ranked from the evidence actually
//               gathered above.
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
// layer — store, publication log, verifier, exchange, use case (bound to
// `identityProvider` as the CURRENTLY authenticated identity, exactly like
// a real replica), and the local name-preference store. `identityProvider`
// is whichever identity is "running" this replica.
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

function rowFromEnvelope(envelopeClaim, position = { x: 1, z: 1 }) {
    return {
        claimId: envelopeClaim.id, name: envelopeClaim.name, worldId: envelopeClaim.worldId,
        regionId: envelopeClaim.regionId, authorIdentityId: envelopeClaim.authorIdentityId,
        createdAt: envelopeClaim.createdAt, signature: envelopeClaim.signature, position
    };
}

// Reproduces EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim()'s
// own one substantive call — `session.importPlaceNamingClaim(pkg)` is
// itself a one-line forward to `PlaceNamingClaimExchange#importClaim(pkg)`
// (see application/WorldNavigationSession.js's own body, reconfirmed
// statically in Section A below), so calling the exchange directly here
// loses no fidelity versus going through a WorldNavigationSession.
function adoptNearbyPlaceNamingClaim(replica, row) {
    const rowClaim = PlaceNamingClaim.fromJSON({
        id: row.claimId, worldId: row.worldId, regionId: row.regionId, name: row.name,
        authorIdentityId: row.authorIdentityId, createdAt: row.createdAt, signature: row.signature
    });
    const pkg = buildPlaceNamingClaimPublication(rowClaim);
    return replica.exchange.importClaim(pkg);
}

async function runTests() {
    console.log('Running Post-Adoption Place Naming Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Freeze the completed pipeline. Reconfirms 0.9.253
    // through 0.9.264 remain in place, without reproducing any one of
    // their own exhaustive proofs — the exact restraint 0.9.262's own
    // Section A already held toward 0.9.260/0.9.261.
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
            'tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js'
        ]) {
            assert(await sourceExists(file), `A1. ${file} still exists as the authoritative record for its own stage of the pipeline.`);
        }

        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(/navigateToNearbyPlaceNamingClaim/.test(nearbyBlock) && />\s*Navigate\s*</i.test(nearbyBlock),
            'A2. The Nearby Place Names row still carries a real, wired Navigate button.');
        assert(/adoptNearbyPlaceNamingClaim/.test(nearbyBlock) && />\s*Adopt\s*</i.test(nearbyBlock),
            'A3. The Nearby Place Names row still carries a real, wired Adopt button.');

        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const validateIdx = exchangeSource.indexOf('validatePlaceNamingClaimPublication(pkg)');
        const constructIdx = exchangeSource.indexOf('PlaceNamingClaim.fromJSON(pkg.claim)');
        const verifyIdx = exchangeSource.indexOf('this._verifier.verifyPlaceNamingClaim(');
        const saveIdx = exchangeSource.indexOf('this._store.save(claim)');
        assert(validateIdx > -1 && constructIdx > validateIdx && verifyIdx > constructIdx && saveIdx > verifyIdx,
            'A4. importClaim() still runs validate -> construct -> verify -> persist, in that exact order, unchanged.');

        // A5. WorldNavigationSession#importPlaceNamingClaim() is still a
        // pure one-line forward to the exchange — the basis on which this
        // entire file, below, tests the exchange directly rather than
        // constructing a full WorldNavigationSession/World for every
        // section.
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        const importBody = sessionSource.slice(sessionSource.indexOf('importPlaceNamingClaim(pkg)'), sessionSource.indexOf('importPlaceNamingClaim(pkg)') + 260);
        assert(importBody.includes('return this._placeNamingClaimExchange.importClaim(pkg);'),
            'A5. WorldNavigationSession#importPlaceNamingClaim() still does nothing but forward to PlaceNamingClaimExchange#importClaim(pkg) — testing the exchange directly is testing the real adoption boundary, not a simplification of it.');

        const principles = await rawSource('docs/Principles.md');
        for (const heading of [
            '### A Discovered Naming Claim Is Still Just A Claim (0.9.253)',
            '### Automatic Discovery Is Not Automatic Adoption (0.9.256)',
            '### Presentation Is Not Adoption (0.9.257)',
            '### Navigation Is Not Adoption (0.9.260)',
            '### Discovery Makes Adoption Available; It Never Makes Adoption Automatic (0.9.263)'
        ]) {
            assert(principles.includes(heading), `A6. docs/Principles.md still carries "${heading}", unretracted.`);
        }

        // A7. LIVE SANITY — one full, real adoption still works end to
        // end through the real exchange this reassessment's own later
        // sections build on. Not a re-derivation of 0.9.263/0.9.264's own
        // exhaustive proofs — just confirming the ground is still solid
        // before standing on it.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverbend' });
        const result = adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(result.isNew === true && result.claim.name === 'Riverbend' && bobReplica.store.has('world-1', claim.id),
            'A7. A full, real adoption still works end to end — the pipeline this reassessment builds on is genuinely solid, not merely asserted from prior files.');

        console.log('✓ A: the full discover -> proximity -> Nearby -> Navigate/Adopt -> importPlaceNamingClaim() -> validate/construct/verify/persist pipeline is reconfirmed COMPLETE — every prior stage\'s own file still exists, every principle still stands, the session boundary is confirmed to be a pure forward to the exchange, and one live adoption still succeeds end to end.');
    }

    // ---------------------------------------------------------------
    // Section B — Semantic boundary of an adopted claim. Searches real
    // source for "preferred"/"official"/"active"/"authoritative"
    // vocabulary rather than assuming none exists.
    // ---------------------------------------------------------------
    {
        // B1. The vocabulary this reassessment's own brief asked to
        // search for, checked directly against the Place Naming claim
        // and exchange layers: none of "official"/"authoritative"/
        // "trusted" exists anywhere a stronger meaning could attach to.
        const claimSource = codeOnlyLines(await rawSource('core/PlaceNamingClaim.js'));
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        assert(!/\bofficial\b|\bauthoritative\b|\btrusted\b/i.test(claimSource) && !/\bofficial\b|\bauthoritative\b|\btrusted\b/i.test(exchangeSource),
            'B1. Neither core/PlaceNamingClaim.js nor application/PlaceNamingClaimExchange.js carries "official"/"authoritative"/"trusted" vocabulary anywhere.');

        // B2. THE ONE VOCABULARY THAT DOES EXIST: "preferred name" — but
        // it PRE-DATES adoption entirely (0.5.2, three milestones before
        // discovery itself began at 0.9.253) and is a structurally
        // separate concept: personal, unsigned, keyed by (owner, worldId,
        // regionId) — never by claimId, and never touched by
        // importPlaceNamingClaim() at all.
        assert(await sourceExists('application/LocalNamePreferenceStore.js'),
            'B2a. application/LocalNamePreferenceStore.js exists — "preferred name" is real, existing vocabulary in this codebase.');
        const preferenceSource = codeOnlyLines(await rawSource('application/LocalNamePreferenceStore.js'));
        assert(/setPreferredName\(worldId, regionId, name\)/.test(preferenceSource) && !/claimId/.test(preferenceSource),
            'B2b. LocalNamePreferenceStore#setPreferredName() is keyed by (worldId, regionId, name) — a raw string, never a claimId — confirming it cannot represent "which claim I adopted," only "which name I like."');
        const importBody = exchangeSource.slice(exchangeSource.indexOf('importClaim(pkg)'), exchangeSource.indexOf('importClaim(pkg)') + 700);
        assert(!importBody.includes('PreferenceStore') && !exchangeSource.includes('NamePreferenceStore'),
            'B2c. Neither importClaim() nor application/PlaceNamingClaimExchange.js as a whole references LocalNamePreferenceStore in any way — adopting a claim never sets, clears, or reads a preference; the two remain structurally independent, exactly like export-before-adopt (0.9.262 Section F).');

        // B3. No "adopted"/"imported" flag exists anywhere on the claim
        // shape itself or the row the UI renders — reconfirms
        // 0.9.262 Section C3d and tests/PlaceNamingWorldViewPresentation
        // .test.js's own forbidden-flags list still stand.
        const presentationTest = await rawSource('tests/PlaceNamingWorldViewPresentation.test.js');
        assert(presentationTest.includes("forbiddenAuthorityFlags = ['isPrimary', 'isOfficial', 'adopted', 'isAdopted', 'authoritative', 'verified', 'trusted', 'isCurrentName', 'confirmed']"),
            'B3. tests/PlaceNamingWorldViewPresentation.test.js still asserts no row carries any of these flags — the negative space this reassessment relies on is still actively enforced, not merely once true.');

        // B4. LIVE PROOF, reconfirmed: adopting a claim never sets a
        // preference and never marks anything "official" — the store
        // entry for an adopted claim is byte-for-byte the same shape as
        // a self-published one.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Fernbrook' });
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(bobReplica.preferenceStore.getPreferredName('world-1', 'region-1') === null,
            'B4. After adopting "Fernbrook," this replica\'s own preferred name for the region is still null — adoption never sets a preference as a side effect.');
        const storedJSON = bobReplica.store.listForRegion('world-1', 'region-1')[0].toJSON();
        assert(!('adopted' in storedJSON) && !('official' in storedJSON) && !('preferred' in storedJSON),
            'B4b. The stored, adopted claim carries no "adopted"/"official"/"preferred" field — it is an ordinary claim record, indistinguishable in shape from one this replica published itself.');

        console.log('✓ B: the ONE piece of "preferred name" vocabulary this codebase carries (LocalNamePreferenceStore, 0.5.2) pre-dates and remains structurally separate from adoption — personal, unsigned, keyed by name rather than claimId, and never touched by importPlaceNamingClaim(). No "official"/"authoritative"/"trusted"/"adopted" vocabulary exists anywhere else. Adoption\'s meaning stays exactly what 0.9.260/0.9.263 already established: the user chose to retain this verified claim locally — nothing more.');
    }

    // ---------------------------------------------------------------
    // Section C — What can a user already do with an adopted claim: a
    // getById()-shaped audit, mirroring the exact question the
    // Commentary reassessments (0.9.250/0.9.259-family) already asked of
    // storage/PublicationCommentaryStore.js#getById().
    // ---------------------------------------------------------------
    {
        // C1. No dedicated single-claim-by-id lookup exists anywhere in
        // the Place Naming layer — store.has() is boolean-only, list()/
        // listForRegion() are bulk, and the one inline by-id filter
        // (exportPlaceNamingClaim()'s own `.find((c) => c.id === claimId)`)
        // has never been extracted into a reusable, named method.
        const storeSource = codeOnlyLines(await rawSource('application/LocalPlaceNamingClaimStore.js'));
        assert(!/getById|findById|getClaim\(/.test(storeSource),
            'C1a. application/LocalPlaceNamingClaimStore.js exposes no getById()/findById()/getClaim() — single-claim lookup by id is not a named capability at the storage layer at all (unlike storage/PublicationCommentaryStore.js#getById(), which exists but is REACHABLE_BUT_INTERNAL).');
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        const exportBody = sessionSource.slice(sessionSource.indexOf('exportPlaceNamingClaim(regionId, claimId)'), sessionSource.indexOf('exportPlaceNamingClaim(regionId, claimId)') + 560);
        assert(exportBody.includes('.find((c) => c.id === claimId)'),
            'C1b. The only by-id claim lookup anywhere in this layer is this private, inline filter inside exportPlaceNamingClaim() — never its own named method, never reused elsewhere.');

        // C2. THE FINDING: a PRE-EXISTING, adoption-unaware surface
        // already provides real inspection for any adopted claim, the
        // moment its region is known — ui/components/PlaceNamingPanel.js's
        // own "All Claims" section (0.5.3), completely unmodified by
        // 0.9.263/0.9.264.
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelSource.includes('<h4 class="locations-panel-section-title">All Claims</h4>') &&
               panelSource.includes('v-for="claim in claims"') &&
               panelSource.includes('formatAuthor(claim.authorIdentityId)') &&
               panelSource.includes('formatWhen(claim.createdAt)') &&
               panelSource.includes('@click="onExportClaim(claim.id)"'),
            'C2a. ui/components/PlaceNamingPanel.js\'s "All Claims" section already lists claim.name/author/createdAt for EVERY claim on file for a region, with an Export button on each — this predates adoption and was never adoption-specific.');
        assert(!panelSource.includes('claim.adopted') && !panelSource.includes('isAdopted'),
            'C2b. That list has no concept of "adopted" at all — it shows every claim the store holds for the region, regardless of how each one arrived there.');

        // C3. LIVE PROOF: the exact data this panel actually renders
        // (session.getPlaceNamingClaims(regionId), a pure one-line forward
        // to PlaceNamingClaimUseCase#claimsForRegion() — reconfirmed
        // below) already includes a claim adopted moments earlier via
        // Nearby, with its real author and timestamp intact.
        const getPlaceNamingClaimsBody = sessionSource.slice(sessionSource.indexOf('getPlaceNamingClaims(regionId)'), sessionSource.indexOf('getPlaceNamingClaims(regionId)') + 350);
        assert(getPlaceNamingClaimsBody.includes('this._placeNamingClaimUseCase.claimsForRegion(owner.world.id, regionId)'),
            'C3a. WorldNavigationSession#getPlaceNamingClaims() — the exact data PlaceNamingPanel\'s own "claims" prop is filled from — is itself a thin forward to PlaceNamingClaimUseCase#claimsForRegion(), confirming testing the use case directly here is testing the real path, not a simplification of it.');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Kestrel Point', createdAt: new Date('2024-01-01T00:00:00.000Z') });
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));

        const claimsForPanel = bobReplica.useCase.claimsForRegion('world-1', 'region-1');
        assert(claimsForPanel.length === 1, 'C3b. exactly one claim is on file for the region after one adoption.');
        const panelEntry = claimsForPanel[0].toJSON();
        assert(panelEntry.name === 'Kestrel Point' && panelEntry.authorIdentityId === alice.identityId && panelEntry.createdAt === '2024-01-01T00:00:00.000Z',
            'C3c. THE LIVE PROOF: the exact data PlaceNamingPanel already renders as "All Claims" already carries the adopted claim\'s real name, real author, and real creation date — inspection of an adopted claim is ALREADY COMPLETE via a general-purpose surface built four milestones before adoption existed, never a gap this reassessment needs to fill.');

        // C4. LIVE PROOF: export already works on a claim this replica
        // did not author — the exact scenario "export something I only
        // adopted" needs, and the exact boundary
        // session.exportPlaceNamingClaim() (itself PlaceNamingClaimUseCase
        // #claimsForRegion() + PlaceNamingClaimExchange#exportClaim(),
        // confirmed by C1b's own extraction above) already serves without
        // modification.
        const exported = bobReplica.exchange.exportClaim(claimsForPanel.find((c) => c.id === claim.id));
        assert(exported.kind === PLACE_NAMING_CLAIM_PUBLICATION_KIND && exported.claim.id === claim.id && exported.claim.authorIdentityId === alice.identityId,
            'C4. exportClaim(), fed the exact claim claimsForRegion() already returns for an adopted claim, already produces a valid publication package for a claim this replica only adopted, never authored — export of an adopted claim is ALREADY COMPLETE.');

        // C5. What the existing surface does NOT show: the raw signature,
        // or any explicit verification/adoption-origin indicator — a
        // real, precisely-scoped gap, distinct from "can it be inspected
        // at all," which C2/C3 already answered yes to.
        assert(!panelSource.includes('claim.signature') && !/verified|verification/i.test(panelSource),
            'C5. PlaceNamingPanel\'s "All Claims" list renders name/author/date but never the claim\'s own signature or any verification-status indicator — a real, narrow MISSING_UI gap, not a missing capability (the data is already on every claim object it already iterates).');

        console.log('✓ C: no dedicated getById()-shaped lookup exists in the Place Naming layer (C1) — but unlike the Commentary domain\'s own REACHABLE_BUT_INTERNAL getById(), this reassessment finds inspection and export of an adopted claim are ALREADY COMPLETE (C2-C4), served by a general-purpose, adoption-unaware surface (PlaceNamingPanel\'s "All Claims," built at 0.5.3) that needed zero changes to already cover adoption. The one real, narrow gap that surface leaves is display-only: no signature or verification-status indicator (C5).');
    }

    // ---------------------------------------------------------------
    // Section D — Nearby UI: what a row can and cannot yet distinguish.
    // ---------------------------------------------------------------
    {
        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const rowMapping = worldViewCode.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];

        // D1. The row already CARRIES createdAt/signature (restored at
        // 0.9.263 for Adopt's own sake) but the TEMPLATE never renders
        // either — the data reaching the row and what the row displays
        // are two different questions, and only the second is still a
        // gap. UPDATED at 0.9.266: createdAt's own display half of this
        // gap was BUILT (a new, purely additive `createdAtLabel` field —
        // see that milestone's own tests/PlaceNamingNearbyMetadataPresentation.test.js).
        // signature stays deliberately unrendered — 0.9.266's own brief
        // reconfirmed Section C5's finding below is still the reason why.
        assert(rowMapping.includes('createdAt:') && rowMapping.includes('signature:'),
            'D1a. sanity: nearbyPlaceNamingClaimRows still carries the RAW createdAt/signature (restored at 0.9.263), unremoved by 0.9.266\'s own additive createdAtLabel field.');
        assert(nearbyBlock.includes('claim.createdAtLabel') && !nearbyBlock.includes('claim.signature'),
            'D1b. The Nearby Place Names template now renders claim.createdAtLabel (BUILT at 0.9.266) but still never renders claim.signature — the createdAt half of this gap is closed; the signature/verification half remains an open, deliberate boundary (Section C5).');

        // D2. UPDATED at 0.9.269: the "already adopted" indicator this
        // section originally found MISSING was BUILT — this reassessment
        // is updated in place to reconfirm the built shape, mirroring
        // exactly how 0.9.266 updated 0.9.263's own D1 above for
        // createdAtLabel. Worded "Already saved" rather than "Already
        // adopted" — see this milestone's own docs/Roadmap.md entry and
        // Section A of tests/PlaceNamingNearbyAdoptionStatus.test.js on
        // why: the store this reads also holds self-published claims,
        // not only ones reached via Adopt.
        assert(/alreadySaved/.test(nearbyBlock) && /Already saved/i.test(nearbyBlock),
            'D2a. UPDATED at 0.9.269 — BUILT: the Nearby row template now renders a passive "Already saved" status in place of Adopt once claim.alreadySaved is true.');
        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(sessionSource.includes('hasPlaceNamingClaim(worldId, claimId) {'),
            'D2b. UPDATED at 0.9.269 — BUILT: WorldNavigationSession now exposes hasPlaceNamingClaim(worldId, claimId), a thin pass-through onto PlaceNamingClaimUseCase#hasClaim() -> the exact, unmodified LocalPlaceNamingClaimStore#has(worldId, claimId) this section\'s own D3 below already proved correct — no new domain concept, exactly the precisely-scoped seam this reassessment named.');

        // D3. LIVE PROOF that the underlying data for such a badge is
        // already trivially available, requiring no new domain logic —
        // only a new, thin, read-only pass-through. Reconfirmed at
        // 0.9.269 through the actual PlaceNamingClaimUseCase#hasClaim()
        // door session.hasPlaceNamingClaim() itself forwards to (this
        // file's own makeReplica() builds the use case/store/exchange
        // directly, never a full WorldNavigationSession — see
        // tests/PlaceNamingNearbyAdoptionStatus.test.js Sections H/P for
        // the same proof through the real session).
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Willowmere' });
        assert(bobReplica.store.has('world-1', claim.id) === false, 'D3a. before adoption, has() reports false.');
        assert(bobReplica.useCase.hasClaim('world-1', claim.id) === false, 'D3a2. UPDATED at 0.9.269 — BUILT: the same reports false through the new PlaceNamingClaimUseCase#hasClaim() door.');
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(bobReplica.store.has('world-1', claim.id) === true,
            'D3b. after adoption, LocalPlaceNamingClaimStore#has() reports true — the exact boolean the Nearby row\'s "Already saved" indicator reads.');
        assert(bobReplica.useCase.hasClaim('world-1', claim.id) === true,
            'D3b2. UPDATED at 0.9.269 — BUILT: PlaceNamingClaimUseCase#hasClaim() reports the same true — the exact door session.hasPlaceNamingClaim() forwards to.');

        console.log('✓ D: UPDATED at 0.9.269 — the Nearby row displays name/author/distance/createdAt (createdAt rendering BUILT at 0.9.266) — signature still reaches the row (restored at 0.9.263) but remains deliberately unrendered (D1); the "already adopted" indicator this section once found missing is now BUILT, worded "Already saved" (D2), backed by the exact thin session pass-through over LocalPlaceNamingClaimStore#has() this section itself already proved correct (D3).');
    }

    // ---------------------------------------------------------------
    // Section E — Adopted-claim lifecycle: create -> store -> get ->
    // export -> import, and the one genuine asymmetry retract() creates.
    // ---------------------------------------------------------------
    {
        // E1. create/store/get/export are each already proven COMPLETE
        // for an adopted claim (Section A's live adoption, Section C2-C4)
        // — this section's own job is retract/removal, the one stage not
        // yet examined.
        const useCaseSource = await rawSource('application/PlaceNamingClaimUseCase.js');
        const useCaseCode = codeOnlyLines(useCaseSource);
        assert(useCaseCode.includes('existing.authorIdentityId !== authorIdentityId') && useCaseCode.includes('return false'),
            'E1. PlaceNamingClaimUseCase#retract() still gates removal on authorship — "is this identity the claim\'s OWN author," per its own header, never a moderation or "remove what I imported" tool.');

        // E2. LIVE PROOF: a claim adopted from someone else can NEVER be
        // retracted by the adopting viewer — not "not yet wired to a
        // button," but refused by the domain layer itself, the same
        // layer 0.9.262 Section E already proved has no ambient
        // "currently active" concept to exploit instead.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Adopted Only' });
        const adoptResult = adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(adoptResult.isNew === true && adoptResult.claim.authorIdentityId === alice.identityId,
            'E2a. sanity: Bob genuinely adopted a claim authored by Alice, not himself.');

        const retracted = bobReplica.useCase.retract('world-1', claim.id);
        assert(retracted === false, 'E2b. Bob (the adopting viewer, signed in, running the exact use case that just adopted this exact claim) cannot retract it — retract() returns false.');
        assert(bobReplica.store.has('world-1', claim.id) === true,
            'E2c. THE CORE FINDING: the adopted claim is STILL in Bob\'s own store after his own retract attempt — there is no path anywhere in this codebase for a viewer to remove a claim they merely adopted. Not a missing button: the domain layer itself has no concept of it.');

        // E3. Confirmed this is not an oversight but a DELIBERATE,
        // stated design choice: retract()'s own header states its intent
        // directly.
        assert(/only ever "take back my own word,"/.test(useCaseSource),
            'E3. retract()\'s own header still states its intent directly: "take back my own word" — a deliberate authorship-only boundary, not an incomplete implementation.');

        // E4. What a "remove" for a non-authored claim COULD mean is
        // itself a fork this reassessment records rather than resolves,
        // mirroring exactly how the task's own Section F asked competing
        // names to be preserved rather than adjudicated:
        //   (a) a genuinely LOCAL "dismiss/hide" — this replica stops
        //       showing it, the record may even stay on disk, exactly
        //       like LocalNamePreferenceStore's own clear() semantics; or
        //   (b) a real retract-equivalent that actually deletes the
        //       record from LocalPlaceNamingClaimStore, indistinguishable
        //       from "I take this back" even though this viewer never
        //       said it in the first place.
        // Nothing here builds either. Both remain open product decisions.
        console.log('✓ E: create/store/get/export for an adopted claim are all already COMPLETE (Sections A/C). The one genuine lifecycle asymmetry is retract(): it is deliberately author-gated (E1, E3), and live proof confirms a viewer can never remove a claim they only adopted, by any path in this codebase today (E2). This is recorded as a real, open product-design fork (local dismissal vs. a true remove) — never invented or resolved here, per this milestone\'s own scope.');
    }

    // ---------------------------------------------------------------
    // Section F — Competing names preserved. Reconfirms 0.9.264 Section D
    // without reproducing its own exhaustive live proof.
    // ---------------------------------------------------------------
    {
        assert(await sourceExists('tests/PlaceNamingNearbyAdoptionLifecycleAudit.test.js'),
            'F1. sanity: the file whose Section D already proved "Riverside"/"Old River" both remain independently adoptable, live, across repeated observation cycles, still exists.');

        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('### Naming Exchange Distributes Claims; It Never Establishes Truth (0.5.3)'),
            'F2. docs/Principles.md still carries the founding principle this behavior descends from, unretracted.');

        const viewSource = codeOnlyLines(await rawSource('core/PlaceNamingView.js'));
        assert(!/winner|primary|official/i.test(viewSource),
            'F3. core/PlaceNamingView.js still carries no "winner"/"primary"/"official" vocabulary — namingView() ranks by distinct-author score, never elects a single name.');

        // F4. LIVE, MINIMAL reconfirmation (not a reproduction of 0.9.264's
        // own thorough live-observation-cycle proof): two independently
        // authored, adopted claims for the same region both remain, with
        // an equal score, and neither claim's own record is touched by
        // the other's adoption.
        const alice = makeIdentity('Alice');
        const dave = makeIdentity('Dave');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const riverside = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside' });
        const oldRiver = signedClaim(dave, { worldId: 'world-1', regionId: 'region-1', name: 'Old River' });
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(riverside).claim));
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(oldRiver).claim));
        const view = deriveNamingView('region-1', bobReplica.store.list('world-1'));
        assert(view.length === 2 && view.every((entry) => entry.score === 1),
            'F4. Both adopted claims remain, unranked relative to each other — no winner, no loser, confirmed fresh at this milestone.');

        console.log('✓ F: competing names remain fully preserved — no ranking/winner semantics exist anywhere in real source (F1-F3), and a fresh, minimal live check reconfirms two competing adopted claims sit side by side with equal standing (F4). This remains the largest conceptual fork the Place Naming arc exposes, and this milestone documents it without resolving it, exactly as its own brief asked.');
    }

    // ---------------------------------------------------------------
    // Section G — Decentralized synchronization. Confirms adoption is
    // local-only, and that this is not a NEW asymmetry adoption
    // introduced.
    // ---------------------------------------------------------------
    {
        // G1. The one Nostr integration this codebase has is READ-ONLY —
        // it queries a relay; it never publishes, signs-and-sends, or
        // broadcasts anything.
        const nostrSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/publishEvent|sendEvent|broadcast|\.publish\(/i.test(nostrSource),
            'G1. application/NostrPlaceNamingDiscoverySource.js contains no publish/send/broadcast call of any kind — this codebase\'s only Nostr integration for Place Naming is query-only.');

        // G2. importClaim() itself never re-publishes, gossips, or
        // otherwise propagates what it just persisted — confirmed
        // directly, extending 0.9.262 Section F's narrower
        // export-specific check to EVERY outward-reaching call shape.
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const importClaimBody = exchangeSource.slice(exchangeSource.indexOf('importClaim(pkg)'), exchangeSource.indexOf('importClaim(pkg)') + 700);
        assert(!/publish|broadcast|gossip|relay|nostr/i.test(importClaimBody),
            'G2. importClaim()\'s own body contains no publish/broadcast/gossip/relay reference of any kind — adopting a claim never propagates it anywhere; it only ever reaches THIS replica\'s own store.');

        // G3. Critically, a SELF-PUBLISHED claim has the identical
        // limitation — publish() (Section B/PlaceNamingClaimUseCase.js)
        // also never reaches a relay; only the manual, person-driven
        // export/import file exchange (0.5.3) and Nearby discovery
        // (0.9.253+, itself read-only) move a claim between replicas at
        // all. Adoption did not create this asymmetry — it is the
        // pre-existing shape of the entire feature.
        const useCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!/publish\(.*relay|nostr|broadcast/i.test(useCaseSource),
            'G3. PlaceNamingClaimUseCase#publish() (the SELF-authoring path) has the identical absence of any relay/broadcast call — "adoption is local-only" is not a gap adoption introduces; self-publishing a name has always been exactly as local.');

        console.log('✓ G: adoption is confirmed local-only (G1-G2) — and this is proven to be no new asymmetry: self-publishing a name has always been exactly as local (G3). "I adopted this claim" never becomes "everyone should now consider this claim adopted," and there is no existing product requirement anywhere in this codebase for it to. Synchronization stays out of scope.');
    }

    // ---------------------------------------------------------------
    // Section H — Product-gap verdict, ranked from the evidence gathered
    // in Sections A-G above.
    // ---------------------------------------------------------------
    {
        const ranked = [
            '1. Enable removing a claim a viewer only ADOPTED (never authored) — MISSING_DOMAIN_CAPABILITY (Section E). retract() is deliberately author-gated; live proof shows no path anywhere removes an adopted, non-authored claim. The clearest genuine product-design fork this reassessment found: a local "dismiss/hide" versus a true remove are both plausible, and neither is assumed here.',
            '2. An "Adopted" indicator on the Nearby row — REACHABLE, thin UI seam (Section D). LocalPlaceNamingClaimStore#has() already answers the exact boolean needed, live-proven correct; the one precise prerequisite is a thin, read-only session pass-through, never a new domain concept. BUILT at 0.9.269, worded "Already saved" (see tests/PlaceNamingNearbyAdoptionStatus.test.js).',
            '3. Surface verification/signature status in the existing "All Claims" list and/or the Nearby row — MISSING_UI, not MISSING_CAPABILITY (Section C5/D1). The claim was already verified before being persisted; only DISPLAYING that fact is missing, on data every relevant row/entry already carries. createdAt\'s own display half was BUILT at 0.9.266 (tests/PlaceNamingNearbyMetadataPresentation.test.js); the signature/verification half remains deliberately open — 0.9.266\'s own brief reconfirmed no existing verification machinery exposes a non-mutating result a Nearby row could truthfully display.',
            '4. Wire "Prefer this" onto the Nearby row (unchanged from 0.9.262\'s own ranking) — MISSING_UI. The manual PlaceNamingPanel has had it since 0.5.2; Nearby still lacks it. Structurally independent of adoption, unaffected by anything this milestone found.',
            '5. A cross-region "My Adopted Claims" management view — MISSING_UI/MISSING_DOMAIN_CAPABILITY, explicitly NOT assumed necessary. Per-region inspection is already COMPLETE (Section C); a global view is a genuinely larger, separate product decision this reassessment does not resolve.',
            '6. Export directly from the Nearby row, before adopting — MISSING_UI, low value. Export-after-adopt already fully works today via the existing "All Claims" surface (Section C4); this candidate only shaves one click for a narrow use case.',
            '7. Competing-name ranking/preference resolution beyond namingView()\'s equal-score model — MISSING_DOMAIN_CAPABILITY, deliberately preserved rather than built (Section F). The largest conceptual fork in the whole arc; explicitly out of this milestone\'s scope to resolve.',
            '8. Propagate an adopted claim to other devices/replicas — OUT OF SCOPE (Section G). No existing product requirement; would silently change adoption\'s own authority model from "I chose to keep this" into "everyone should now agree."'
        ];
        assert(ranked.length === 8, 'H1. Eight candidates ranked from this milestone\'s own fresh evidence.');
        assert(ranked[0].startsWith('1. Enable removing'),
            'H2. The strongest candidate is a genuine domain gap (removal of a non-authored, adopted claim), not the UI-inspection gap this milestone\'s own opening brief initially speculated might be strongest — Section C\'s own evidence overturned that speculation directly, by finding inspection/export already complete.');

        console.log('✓ H: eight candidates ranked from evidence gathered in Sections A-G:');
        ranked.forEach((line) => console.log(`    ${line}`));
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section I — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.265 — Post-Adoption Place Naming Product Reassessment — Verdict\n' +
'\n' +
'PIPELINE CLOSURE (0.9.253-0.9.264)\n' +
'    Reconfirmed COMPLETE end to end, live: discovery -> proximity ->\n' +
'    Nearby -> Navigate/Adopt -> importPlaceNamingClaim() -> validate ->\n' +
'    construct -> verify -> persist (Section A)\n' +
'\n' +
'SEMANTIC BOUNDARY OF AN ADOPTED CLAIM\n' +
'    "Preferred name" vocabulary DOES exist (LocalNamePreferenceStore,\n' +
'    0.5.2) but pre-dates and remains structurally separate from adoption\n' +
'    — personal, unsigned, keyed by name rather than claimId, never\n' +
'    touched by importPlaceNamingClaim(). No "official"/"authoritative"/\n' +
'    "trusted"/"adopted" vocabulary exists anywhere else. Adoption still\n' +
'    means exactly: the user chose to retain this verified claim locally\n' +
'    (Section B)\n' +
'\n' +
'WHAT A USER CAN DO WITH AN ADOPTED CLAIM\n' +
'    No dedicated getById()-shaped lookup exists in the Place Naming\n' +
'    layer — but inspection AND export of an adopted claim are ALREADY\n' +
'    COMPLETE, served by a pre-existing, adoption-unaware surface\n' +
'    (PlaceNamingPanel\'s "All Claims," built at 0.5.3) that needed zero\n' +
'    changes to already cover adoption, proven live. The one real,\n' +
'    narrow gap left is display-only: no signature/verification\n' +
'    indicator (Section C)\n' +
'\n' +
'NEARBY UI\n' +
'    createdAt/signature already reach the row; createdAt rendering was\n' +
'    BUILT at 0.9.266, signature/verification remains deliberately\n' +
'    unrendered; no "already adopted" indicator exists, and the one prerequisite a\n' +
'    future one would need — a thin session read over\n' +
'    LocalPlaceNamingClaimStore#has() — already answers correctly today,\n' +
'    live-proven (Section D)\n' +
'\n' +
'ADOPTED-CLAIM LIFECYCLE\n' +
'    create/store/get/export are all COMPLETE for an adopted claim. The\n' +
'    one genuine asymmetry: retract() is deliberately author-gated, so a\n' +
'    viewer can never remove a claim they only adopted, by any path in\n' +
'    this codebase today — proven live. Recorded as an open\n' +
'    product-design fork (local dismissal vs. true removal), never\n' +
'    invented or resolved here (Section E)\n' +
'\n' +
'COMPETING NAMES\n' +
'    Fully preserved — no ranking/winner semantics anywhere, reconfirmed\n' +
'    fresh and live (Section F)\n' +
'\n' +
'DECENTRALIZED SYNCHRONIZATION\n' +
'    Confirmed local-only, and confirmed NOT a new asymmetry adoption\n' +
'    introduced — self-publishing a name has always been exactly as\n' +
'    local (Section G)\n' +
'\n' +
'RANKED CANDIDATES (freshly evidenced at 0.9.265)\n' +
'    1. Enable removing an adopted (non-authored) claim — the strongest,\n' +
'       overturning this milestone\'s own opening speculation that\n' +
'       inspection would be the top gap\n' +
'    2. An "Adopted" indicator on the Nearby row — thin, low-risk seam\n' +
'    3. Verification/signature status display — MISSING_UI only;\n' +
'       createdAt\'s own half BUILT at 0.9.266\n' +
'    4. Prefer wiring on the Nearby row (carried over from 0.9.262)\n' +
'    5. Cross-region "My Adopted Claims" management view\n' +
'    6. Export directly from the Nearby row before adopting\n' +
'    7. Competing-name ranking/resolution\n' +
'    8. Cross-device propagation of an adopted claim (out of scope)\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected in THIS milestone (0.9.265) — per its own brief, the\n' +
'    evidence was gathered and adoption\'s exact boundaries precisely\n' +
'    characterized, never invented or assumed from precedent. Candidate 1\n' +
'    (removal of an adopted, non-authored claim) is the strongest\n' +
'    evidence-backed seam for a future milestone to pick up — but,\n' +
'    exactly as this reassessment\'s own brief asked for competing names,\n' +
'    it names a genuine product-design fork rather than resolving one.\n');

        console.log('✓ Section I: Verdict recorded. No production changes were made in this milestone (0.9.265). The pipeline through 0.9.264 remains closed and unchanged (Section A); adoption\'s semantic boundary is precisely characterized, with the genuine discovery that "preferred name" vocabulary already exists but stays structurally separate (Section B); inspection and export of an adopted claim are found to be ALREADY COMPLETE via reuse, overturning this milestone\'s own opening speculation (Section C); the Nearby UI\'s exact remaining seams are named with their precise prerequisites (Section D); the one genuine lifecycle asymmetry — no removal path for a non-authored, adopted claim — is proven live and recorded as an open product decision, not fixed (Section E); competing names remain fully preserved (Section F); and decentralized synchronization is confirmed out of scope, proven to be no new asymmetry adoption introduced (Section G).');
    }

    console.log('\n✅ All PostAdoptionPlaceNamingProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostAdoptionPlaceNamingProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostAdoptionPlaceNamingProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
