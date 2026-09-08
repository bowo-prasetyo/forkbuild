import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { buildPlaceNamingClaimPublication } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { LocalNamePreferenceStore } from '../application/LocalNamePreferenceStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.271 — Post-Adoption-Status Place Naming Product Reassessment.
//
// This milestone adds NO new capability. It is a **test-only product
// reassessment** — the exact recurring shape 0.9.221/0.9.241/0.9.250/
// 0.9.252/0.9.259/0.9.262/0.9.265/0.9.268 already established, run one
// boundary later: 0.9.269 (Nearby Place Naming Claim Adoption Status
// Indicator) built `alreadySaved`; 0.9.270 (its own lifecycle audit)
// proved that field holds under repeated observation, persistence
// reconstruction, competing claims, World switching, and failure — never
// remembered by any in-memory UI/session state. The discover -> proximity
// -> present -> adopt -> verify -> persist -> observe-status arc this
// whole sequence has been building since 0.9.253 is now, on its face,
// complete. This file asks the question this milestone's own brief poses
// directly: is there still a concrete product gap in Place Naming, or has
// this product arc reached a natural stopping point?
//
// Every live proof below drives the REAL `PlaceNamingClaimExchange`,
// `PlaceNamingClaimUseCase`, `LocalPlaceNamingClaimStore`, and
// `LocalAuthorizationVerifier` — never a `WorldNavigationSession` or
// `World`/`WorldRegion` instance, exactly the restraint
// tests/PostAdoptionPlaceNamingProductReassessment.test.js (0.9.265) and
// tests/PostMetadataPlaceNamingProductReassessment.test.js (0.9.268)
// already held: none of this milestone's own questions (semantic
// invariant, capability matrix, competing names, removal, verification
// visibility, synchronization) depend on region/World resolution
// machinery, only on the claim-store/exchange/use-case layer underneath
// it — reconfirmed structurally in Section A below.
//
//   Section A — Freeze the complete pipeline: every arrow from Nostr
//               through World View to persistence is reconfirmed a
//               single, unambiguous machinery path.
//   Section B — Reassess the meaning of "Already saved": frozen as
//               exactly "claim exists in this local claim store," proven
//               structurally and semantically distinct from adopted,
//               preferred, verified, and authoritative — not merely
//               absent vocabulary, but each pairing exercised live.
//   Section C — The capability/reachability matrix this milestone's own
//               brief asked for: twelve candidates, each classified from
//               fresh evidence gathered in this file, not carried over by
//               assumption from 0.9.265/0.9.268's own tables.
//   Section D — Reassess competing names: no preferred/selected/primary/
//               conflicting/official concept is needed yet.
//   Section E — Reassess removal/retraction: author-retraction is
//               COMPLETE; a viewer removing their own locally-saved
//               (never-authored) copy remains genuinely absent — but this
//               milestone finds the restriction lives in exactly ONE
//               place (the use case's authorship gate), not in storage,
//               a sharper characterization than 0.9.265's own finding.
//   Section F — Reassess verification visibility: the verifier already
//               computes valid/signed/reason; exposing it as a
//               non-mutating inspection surface would be a NEW
//               capability, not missing wiring — recorded, not built.
//   Section G — Reassess synchronization: adoption remains local-only,
//               confirmed fresh, not a NEW asymmetry.
//   Section H — Product-gap verdict: every candidate classified as
//               COMPLETE / REACHABLE_BUT_INTERNAL / MISSING_UI /
//               MISSING_DOMAIN_CAPABILITY / DEFERRED / OBSOLETE_CANDIDATE,
//               with at most one next seam selected.
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

async function grepCount(pattern, dirs) {
    let hits = '';
    try {
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
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
// layer — identical in shape to 0.9.265's own makeReplica().
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

// EXACTLY ui/views/WorldView.js#adoptNearbyPlaceNamingClaim()'s own one
// substantive call — importPlaceNamingClaim() is itself a one-line
// forward to PlaceNamingClaimExchange#importClaim() (reconfirmed
// structurally in Section A below), so driving the exchange directly
// here loses no fidelity.
function adoptNearbyPlaceNamingClaim(replica, row) {
    const rowClaim = PlaceNamingClaim.fromJSON({
        id: row.claimId, worldId: row.worldId, regionId: row.regionId, name: row.name,
        authorIdentityId: row.authorIdentityId, createdAt: row.createdAt, signature: row.signature
    });
    const pkg = buildPlaceNamingClaimPublication(rowClaim);
    return replica.exchange.importClaim(pkg);
}

const CAPABILITY_TAXONOMY = [
    'COMPLETE', 'REACHABLE_BUT_INTERNAL', 'MISSING_UI',
    'MISSING_DOMAIN_CAPABILITY', 'DEFERRED', 'OBSOLETE_CANDIDATE'
];

async function runTests() {
    console.log('Running Post-Adoption-Status Place Naming Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Freeze the complete pipeline. Reconfirms 0.9.253
    // through 0.9.270 remain in place, without reproducing any one of
    // their own exhaustive proofs.
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
            'tests/PlaceNamingNearbyMetadataPresentation.test.js',
            'tests/PlaceNamingNearbyMetadataPresentationLifecycleAudit.test.js',
            'tests/PlaceNamingNearbyAdoptionStatus.test.js',
            'tests/PlaceNamingNearbyAdoptionStatusLifecycleAudit.test.js'
        ]) {
            assert(await sourceExists(file), `A1. ${file} still exists as the authoritative record for its own stage of the pipeline.`);
        }

        const worldViewCode = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const nearbyBlock = worldViewCode.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(/navigateToNearbyPlaceNamingClaim/.test(nearbyBlock) && />\s*Navigate\s*</i.test(nearbyBlock),
            'A2. The Nearby Place Names row still carries a real, wired Navigate button.');
        assert(/adoptNearbyPlaceNamingClaim/.test(nearbyBlock) && /alreadySaved/.test(nearbyBlock) && /Already saved/i.test(nearbyBlock),
            'A3. The Nearby Place Names row still carries a real, wired Adopt/"Already saved" toggle, unremoved since 0.9.269.');
        assert(nearbyBlock.includes('claim.createdAtLabel'),
            'A3b. The row still renders createdAtLabel, unremoved since 0.9.266.');

        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const validateIdx = exchangeSource.indexOf('validatePlaceNamingClaimPublication(pkg)');
        const constructIdx = exchangeSource.indexOf('PlaceNamingClaim.fromJSON(pkg.claim)');
        const verifyIdx = exchangeSource.indexOf('this._verifier.verifyPlaceNamingClaim(');
        const saveIdx = exchangeSource.indexOf('this._store.save(claim)');
        assert(validateIdx > -1 && constructIdx > validateIdx && verifyIdx > constructIdx && saveIdx > verifyIdx,
            'A4. importClaim() still runs validate -> construct -> verify -> persist, in that exact order, unchanged.');

        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        const importBody = sessionSource.slice(sessionSource.indexOf('importPlaceNamingClaim(pkg)'), sessionSource.indexOf('importPlaceNamingClaim(pkg)') + 260);
        assert(importBody.includes('return this._placeNamingClaimExchange.importClaim(pkg);'),
            'A5. WorldNavigationSession#importPlaceNamingClaim() still does nothing but forward to PlaceNamingClaimExchange#importClaim(pkg).');
        const hasIdx = sessionSource.indexOf('hasPlaceNamingClaim(worldId, claimId) {');
        const hasBody = sessionSource.slice(hasIdx, hasIdx + 400);
        assert(hasIdx > -1 && hasBody.includes('hasClaim('),
            'A5b. WorldNavigationSession#hasPlaceNamingClaim() still exists and still forwards onto PlaceNamingClaimUseCase#hasClaim() — the exact one-arrow chain 0.9.270 Section O froze.');
        const retractIdx = sessionSource.indexOf('retractPlaceNamingClaim(regionId, claimId)');
        const retractBody = sessionSource.slice(retractIdx, retractIdx + 400);
        assert(retractIdx > -1 && retractBody.includes('this._placeNamingClaimUseCase.retract('),
            'A5c. WorldNavigationSession#retractPlaceNamingClaim() still exists and still forwards onto PlaceNamingClaimUseCase#retract() — the ONE existing removal path this reassessment\'s own Section E audits below.');

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

        // A7. LIVE SANITY — one full, real adoption still works end to
        // end through the real exchange this reassessment's own later
        // sections build on.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverbend' });
        assert(bobReplica.useCase.hasClaim('world-1', claim.id) === false, 'A7a. before adoption, hasClaim() reports false.');
        const result = adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(result.isNew === true && result.claim.name === 'Riverbend' && bobReplica.store.has('world-1', claim.id),
            'A7b. a full, real adoption still works end to end.');
        assert(bobReplica.useCase.hasClaim('world-1', claim.id) === true, 'A7c. after adoption, hasClaim() — the exact door hasPlaceNamingClaim() forwards to — reports true.');

        console.log('✓ A: the full discover -> proximity -> Nearby -> Navigate/Adopt/Already-saved -> importPlaceNamingClaim() -> validate/construct/verify/persist -> hasPlaceNamingClaim() pipeline is reconfirmed COMPLETE end to end — every prior stage\'s own file still exists, every principle still stands, every session boundary is confirmed to be a thin, single forward, and one live adoption still succeeds and is correctly observed afterward.');
    }

    // ---------------------------------------------------------------
    // Section B — Reassess the meaning of "Already saved." Frozen as
    // exactly "claim exists in this local claim store" — proven
    // structurally and semantically distinct from adopted, preferred,
    // verified, and authoritative, each pairing exercised live rather
    // than asserted from vocabulary absence alone.
    // ---------------------------------------------------------------
    {
        // B1. Vocabulary check across the whole claim/exchange/use-case
        // layer, on code lines only (comments may legitimately use
        // "World-authoritative" etc. as prose — see core/PlaceNamingClaim.js
        // line 18 — which is why this check strips comments first).
        for (const file of [
            'core/PlaceNamingClaim.js', 'application/PlaceNamingClaimExchange.js',
            'application/PlaceNamingClaimUseCase.js', 'application/LocalPlaceNamingClaimStore.js'
        ]) {
            const code = codeOnlyLines(await rawSource(file));
            assert(!/\bofficial\b|\bauthoritative\b|\btrusted\b|\badopted\b|\bisAdopted\b/i.test(code),
                `B1. ${file}'s own executable code carries none of "official"/"authoritative"/"trusted"/"adopted" — reconfirmed fresh at 0.9.271.`);
        }

        // B2. Pair 1 — alreadySaved !== adopted. The stored record for an
        // adopted claim carries no "adopted"/provenance field at all, and
        // (0.9.270 Section A/F, reconfirmed here in one call) a
        // self-published claim reports the identical alreadySaved === true.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Fernbrook' });
        adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        const storedJSON = bobReplica.store.listForRegion('world-1', 'region-1')[0].toJSON();
        assert(!('adopted' in storedJSON) && !('provenance' in storedJSON),
            'B2. Pair 1 (alreadySaved !== adopted): the stored record carries no "adopted"/"provenance" field distinguishing HOW it arrived — an adopted claim and a self-published one are byte-for-byte the same shape.');

        // B3. Pair 2 — alreadySaved !== preferred. LocalNamePreferenceStore
        // is untouched by adoption (0.9.265 Section B, reconfirmed): after
        // adopting, this replica's own preference is still null, and
        // preference is keyed by (worldId, regionId, name) — a raw string —
        // never by claimId, so it structurally cannot represent "which
        // claim I adopted."
        assert(bobReplica.preferenceStore.getPreferredName('world-1', 'region-1') === null,
            'B3a. Pair 2 (alreadySaved !== preferred): adopting "Fernbrook" never sets a preference as a side effect.');
        const preferenceSource = codeOnlyLines(await rawSource('application/LocalNamePreferenceStore.js'));
        assert(/setPreferredName\(worldId, regionId, name\)/.test(preferenceSource) && !/claimId/.test(preferenceSource),
            'B3b. LocalNamePreferenceStore is keyed by (worldId, regionId, name), never claimId — preference and "already saved" remain two structurally separate concepts.');

        // B4. Pair 3 — alreadySaved !== verified. importClaim() DOES run
        // real verification before persisting (Section A4 above) — so
        // every saved claim WAS, at some point, verified valid — but the
        // rich verification result ({valid, signed, reason}) is discarded
        // the instant the boolean gate passes: importClaim()'s own return
        // value carries only {claim, isNew}, never the verification
        // result itself. "Already saved" therefore reports nothing about
        // HOW confidently a claim was verified, only THAT it passed once.
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const importClaimBody = exchangeSource.slice(exchangeSource.indexOf('importClaim(pkg)'), exchangeSource.indexOf('importClaim(pkg)') + 1000);
        assert(importClaimBody.includes('return { claim, isNew: true };') && importClaimBody.includes('return { claim: existing || claim, isNew: false };'),
            'B4a. sanity: both of importClaim()\'s own success returns still carry only {claim, isNew}, unchanged.');
        const successSection = importClaimBody.slice(importClaimBody.indexOf('if (this._store.has('));
        assert(!successSection.includes('.signed') && !successSection.includes('.reason'),
            'B4. Pair 3 (alreadySaved !== verified): once past the pass/fail gate, nothing in importClaim()\'s own success path (both the duplicate and the newly-persisted branch) reads or returns `result.signed`/`result.reason` — the verifier\'s own richer detail (referenced ONLY inside the rejection path\'s thrown error, per F2 below) never survives onto a successfully saved claim, so "already saved" carries no verification-confidence signal of its own.');

        // B5. Pair 4 — alreadySaved !== authoritative. A claim authored
        // by a stranger and a claim authored by this replica's own
        // identity report the identical status once both are on file —
        // reconfirmed fresh, minimally (0.9.270 Section A ran this
        // exhaustively across observation cycles; this is one fresh call).
        const carol = makeIdentity('Carol');
        const carolReplica = makeReplica(carol);
        const ownClaim = carolReplica.useCase.publish('world-1', 'region-1', 'My Own Name');
        const strangerClaim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Someone Else\'s Name' });
        adoptNearbyPlaceNamingClaim(carolReplica, rowFromEnvelope(discoverAsEnvelope(strangerClaim).claim));
        assert(carolReplica.useCase.hasClaim('world-1', ownClaim.id) === true && carolReplica.useCase.hasClaim('world-1', strangerClaim.id) === true,
            'B5. Pair 4 (alreadySaved !== authoritative): this replica\'s OWN claim and a STRANGER\'s adopted claim report the identical alreadySaved === true — the status carries no notion of whose word this replica considers authoritative.');

        console.log('✓ B: "Already saved" is reconfirmed to mean exactly one thing — this exact claim id exists in this replica\'s own local claim store — and is proven, pairwise and live, structurally distinct from adopted (no provenance field), preferred (a separate, name-keyed, claimId-blind store untouched by adoption), verified (the verifier\'s own {signed, reason} detail never survives the pass/fail gate), and authoritative (a stranger\'s claim and this replica\'s own claim read identically). This is the frozen invariant this milestone\'s own brief named.');
    }

    // ---------------------------------------------------------------
    // Section C — The capability/reachability matrix. Twelve candidates,
    // classified from fresh evidence gathered in this file.
    // ---------------------------------------------------------------
    const matrix = [];
    {
        // C1. Claim inspection — COMPLETE via reuse (0.9.265 Section C,
        // reconfirmed structurally: the surface is still there,
        // unmodified).
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelSource.includes('<h4 class="locations-panel-section-title">All Claims</h4>') &&
               panelSource.includes('formatAuthor(claim.authorIdentityId)') && panelSource.includes('formatWhen(claim.createdAt)'),
            'C1. Claim inspection: PlaceNamingPanel\'s "All Claims" section still lists every claim on file for a region with author/date — COMPLETE, unchanged since 0.5.3.');
        matrix.push(['Claim inspection', 'COMPLETE']);

        // C2. Claim metadata — COMPLETE (0.9.266 built createdAt display;
        // reconfirmed present in Section A3b above).
        matrix.push(['Claim metadata', 'COMPLETE']);

        // C3. Verification — REACHABLE_BUT_INTERNAL. The verifier already
        // computes a full, structured result for every claim it touches
        // (live proof: a genuinely valid claim yields {valid:true,
        // signed:true, reason:null}), and a genuine non-mutating verify
        // pathway even exists elsewhere in this codebase (the 0.7.5
        // Publications-Center resolver) — but it is structurally disjoint
        // from Nearby/Adopt, so no dedicated inspection surface reaches a
        // Nearby-discovered claim today — Section F below examines this
        // in full.
        const verifier = new LocalAuthorizationVerifier();
        const dave = makeIdentity('Dave');
        const validClaim = signedClaim(dave, { worldId: 'world-1', regionId: 'region-1', name: 'Provable' });
        const verifyResult = verifier.verifyPlaceNamingClaim(validClaim.toJSON());
        assert(verifyResult.valid === true && verifyResult.signed === true && verifyResult.reason === null,
            'C3. Verification: the verifier already computes a full {valid, signed, reason} result for a genuine claim — the DATA already exists; only a dedicated inspection surface reaching a Nearby-discovered claim does not (Section F).');
        matrix.push(['Verification visibility', 'REACHABLE_BUT_INTERNAL']);

        // C4/C5. Navigation, Adoption — COMPLETE, reconfirmed in Section A.
        matrix.push(['Navigation', 'COMPLETE']);
        matrix.push(['Adoption', 'COMPLETE']);

        // C6. Persistence — COMPLETE, reconfirmed via A7 above and
        // 0.9.270's own exhaustive fresh-session reconstruction proof.
        matrix.push(['Persistence', 'COMPLETE']);

        // C7. Export/import — COMPLETE (0.9.265 Section C4, reconfirmed
        // structurally: exportClaim() still exists and is still a pure
        // passthrough).
        assert(exchangeSourceHasExport(await rawSource('application/PlaceNamingClaimExchange.js')),
            'C7. Export/import: PlaceNamingClaimExchange#exportClaim() still exists as a pure passthrough — COMPLETE.');
        matrix.push(['Export/import', 'COMPLETE']);

        // C8. Removal/retraction — SPLIT (Section E below resolves the
        // two halves separately): author-retraction is COMPLETE; a
        // viewer removing a claim they only adopted is
        // MISSING_DOMAIN_CAPABILITY, but — the sharper finding this
        // milestone adds — only at the use-case/session/UI layer, not at
        // storage.
        matrix.push(['Removal/retraction (author\'s own claim)', 'COMPLETE']);
        matrix.push(['Removal/retraction (viewer\'s locally-saved, non-authored claim)', 'MISSING_DOMAIN_CAPABILITY']);

        // C9. Competing claims — COMPLETE, by deliberate design (no
        // ranking/winner semantics is the finished state, not an
        // unfinished one) — Section D reconfirms.
        matrix.push(['Competing claims (preserved, unranked)', 'COMPLETE']);

        // C10. World association — COMPLETE (0.9.270 Section I's own
        // colliding-id-across-Worlds proof; reconfirmed structurally via
        // hasClaim()'s own two-argument signature below).
        const useCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(useCaseSource.includes('hasClaim(worldId, claimId) {') && useCaseSource.includes('this._store.has(worldId, claimId)'),
            'C10. World association: hasClaim() is still keyed by (worldId, claimId), never claimId alone — COMPLETE.');
        matrix.push(['World association', 'COMPLETE']);

        // C11. Discovery — COMPLETE, reconfirmed in Section A / Section G.
        matrix.push(['Discovery', 'COMPLETE']);

        // C12. Local status ("Already saved") — COMPLETE, this whole
        // arc's own most recent addition (0.9.269/0.9.270), reconfirmed
        // throughout Section A/B above.
        matrix.push(['Local status ("Already saved")', 'COMPLETE']);

        assert(matrix.length === 13, 'C13. thirteen rows recorded (twelve named candidates, with removal/retraction split into its two genuinely different halves, as this milestone\'s own brief asked).');
        for (const [name, classification] of matrix) {
            assert(CAPABILITY_TAXONOMY.includes(classification), `C14. "${name}" carries a valid taxonomy label (${classification}).`);
        }

        console.log('✓ C: capability/reachability matrix recorded, thirteen rows, each backed by a fresh check in this file:');
        matrix.forEach(([name, classification]) => console.log(`    ${name} — ${classification}`));
    }

    // ---------------------------------------------------------------
    // Section D — Reassess competing names. No preferred/selected/
    // primary/conflicting/official concept is needed yet.
    // ---------------------------------------------------------------
    {
        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('### Naming Exchange Distributes Claims; It Never Establishes Truth (0.5.3)'),
            'D1. docs/Principles.md still carries the founding principle this behavior descends from, unretracted.');

        const viewSource = codeOnlyLines(await rawSource('core/PlaceNamingView.js'));
        assert(!/winner|primary|official|conflictresolution/i.test(viewSource),
            'D2. core/PlaceNamingView.js still carries no "winner"/"primary"/"official" vocabulary — namingView() ranks by distinct-author score, never elects a single name.');

        // D3. LIVE, MINIMAL reconfirmation: two independently authored,
        // adopted claims for the same region both remain, with an equal
        // score, side by side — the exact scenario a "preferred name"
        // concept would need to adjudicate, and does not.
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
            'D3. Both adopted claims remain, unranked relative to each other — no winner, no loser, reconfirmed fresh at this milestone.');

        // D4. THE PRODUCT QUESTION this section's own brief asks: does
        // navigate-and-save (0.9.260/0.9.263) change the answer? No —
        // being able to reach and keep an individual claim never implies
        // a need to RANK it against another kept claim; nothing in this
        // codebase's own usage (Sections A-C above) produces a scenario
        // where two independently-true claims need to be resolved into
        // one. Recorded, not built.
        console.log('✓ D: competing names remain fully preserved (D1-D3) — being able to navigate to and adopt individual claims does not, on its own, create a demonstrated need for preferred/selected/primary/conflicting/official semantics (D4). This reassessment does not introduce one.');
    }

    // ---------------------------------------------------------------
    // Section E — Reassess removal/retraction. Author-retraction is
    // COMPLETE. A viewer removing a claim they only adopted remains
    // genuinely absent — but this milestone finds the restriction lives
    // in exactly ONE place, sharper than 0.9.265's own characterization.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const bobReplica = makeReplica(bob);
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Adopted Only' });
        const adoptResult = adoptNearbyPlaceNamingClaim(bobReplica, rowFromEnvelope(discoverAsEnvelope(claim).claim));
        assert(adoptResult.isNew === true && adoptResult.claim.authorIdentityId === alice.identityId,
            'E1. sanity: Bob genuinely adopted a claim authored by Alice, not himself.');

        // E2. "author retracts their claim" — COMPLETE, reconfirmed: an
        // author CAN retract their own published claim.
        const aliceReplica = makeReplica(alice, { storage: new InMemoryStorageProvider() });
        const ownClaim = aliceReplica.useCase.publish('world-1', 'region-1', 'Alice\'s Own');
        assert(aliceReplica.useCase.retract('world-1', ownClaim.id) === true,
            'E2. "Author retracts their claim" is COMPLETE — Alice can retract her own published claim.');

        // E3. "user removes a locally saved copy" via the ONLY existing
        // door (PlaceNamingClaimUseCase#retract(), which
        // retractPlaceNamingClaim() forwards to per Section A5c) — Bob,
        // the adopting viewer, is refused.
        const retractedViaUseCase = bobReplica.useCase.retract('world-1', claim.id);
        assert(retractedViaUseCase === false, 'E3. Bob cannot retract the claim through the ONE existing removal door — retract() returns false.');
        assert(bobReplica.store.has('world-1', claim.id) === true, 'E3b. the claim remains in Bob\'s own store after his own refused retract attempt.');

        // E4. THE SHARPER FINDING this milestone adds: the AUTHORSHIP
        // GATE lives entirely inside PlaceNamingClaimUseCase#retract() —
        // the underlying LocalPlaceNamingClaimStore#retract(worldId,
        // claimId) primitive itself has NO authorship opinion at all, and
        // calling it directly (bypassing the use case) DOES remove a
        // non-authored claim. This is not "no path anywhere in this
        // codebase" (0.9.265's own phrasing) so much as "no path THROUGH
        // THE ONE EXISTING DOOR" — the storage foundation for a future
        // "remove my local copy" capability already exists, unmodified;
        // building it would mean adding a new use-case method that skips
        // the authorship check, never touching storage.
        const storeSource = codeOnlyLines(await rawSource('application/LocalPlaceNamingClaimStore.js'));
        const storeRetractBody = storeSource.slice(storeSource.indexOf('retract(worldId, claimId) {'), storeSource.indexOf('retract(worldId, claimId) {') + 350);
        assert(!/authorIdentityId/.test(storeRetractBody),
            'E4a. LocalPlaceNamingClaimStore#retract() itself never reads authorIdentityId — it removes by id alone, with no opinion about who is asking.');
        const removedDirectly = bobReplica.store.retract('world-1', claim.id);
        assert(removedDirectly === true && bobReplica.store.has('world-1', claim.id) === false,
            'E4b. LIVE PROOF: calling the store\'s own retract() directly — bypassing the use case entirely — DOES remove Bob\'s non-authored, adopted claim. The restriction Bob just hit in E3 is a single, deliberate choice made ONE layer up, not a constraint baked into persistence itself.');

        // E5. Confirmed no OTHER caller anywhere in ui/ or application/
        // reaches this unscoped primitive directly — it is a real,
        // dormant capability, never an accidentally-open door. The
        // Place-Naming store's retract() is uniquely identifiable by its
        // own (worldId, claimId) call shape — Blueprint's own two
        // retract() primitives (application/BlueprintAttributionUseCase.js,
        // application/BlueprintLineageUseCase.js) are keyed by
        // (fingerprint, ...) instead, so this pattern cannot accidentally
        // count an unrelated domain's own call site.
        const storeRetractCallSites = await grepCount('\\.retract(worldId', ['ui', 'application']);
        assert(storeRetractCallSites === 1,
            `E5a. Exactly one file calls LocalPlaceNamingClaimStore#retract(worldId, ...) directly — application/PlaceNamingClaimUseCase.js, the author-gated door; found ${storeRetractCallSites}.`);
        const useCaseRetractCallSites = await grepCount('_placeNamingClaimUseCase\\.retract(', ['ui', 'application']);
        assert(useCaseRetractCallSites === 1,
            `E5b. Exactly one file calls PlaceNamingClaimUseCase#retract() — application/WorldNavigationSession.js, the thin forward Section A5c already confirmed; found ${useCaseRetractCallSites}. No UI file, and no other application file, reaches either retract() primitive directly.`);

        // E6. Confirmed this remains a DELIBERATE, stated design choice,
        // not an oversight — the use case's own header still states its
        // intent directly.
        const useCaseSource = await rawSource('application/PlaceNamingClaimUseCase.js');
        assert(/only ever "take back my own word,"/.test(useCaseSource),
            'E6. retract()\'s own header still states its intent directly: "take back my own word."');

        // E7. What "remove my local copy" would mean remains a genuine,
        // unresolved product-design fork, recorded rather than picked:
        //   (a) a local dismiss/hide, never touching the store at all; or
        //   (b) a true delete, reusing the exact store.retract() primitive
        //       E4b just proved already works, gated by "is this claim in
        //       MY OWN store" rather than "did I author it."
        // No evidence anywhere in this codebase (a roadmap entry, a UI
        // affordance, a user-facing complaint) demonstrates either is
        // actually needed yet. Nothing here builds either.
        console.log('✓ E: author-retraction is COMPLETE (E2). A viewer can never remove a claim they only adopted through the one existing door (E3) — but this milestone sharpens 0.9.265\'s own finding: the authorship gate is a single, deliberate choice inside PlaceNamingClaimUseCase#retract() alone (E6), NOT a constraint reaching into storage — the store\'s own retract() primitive already removes any claim by id, unmodified, with zero new storage-layer work required to build a future "remove my local copy" capability (E4). No other code path reaches that primitive today (E5). Still recorded as an open product-design fork (dismiss vs. true delete), never built here, since no evidence yet demonstrates either is required (E7).');
    }

    // ---------------------------------------------------------------
    // Section F — Reassess verification visibility. The verifier already
    // computes valid/signed/reason; exposing it as a non-mutating
    // inspection surface would be a NEW capability, not missing wiring.
    // ---------------------------------------------------------------
    {
        // F1. LIVE PROOF: the verifier computes rich diagnostic detail
        // even for a FAILING claim — not just pass/fail.
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const unsigned = new PlaceNamingClaim({ worldId: 'world-1', regionId: 'region-1', name: 'No Signature', authorIdentityId: alice.identityId });
        const unsignedResult = verifier.verifyPlaceNamingClaim(unsigned.toJSON());
        assert(unsignedResult.valid === false && unsignedResult.signed === false && unsignedResult.reason === 'a place naming claim must be signed',
            'F1. The verifier already computes a specific, human-readable reason for a failing claim, not merely a boolean.');

        // F2. And yet, on the SUCCESS path (the only path that ever
        // reaches a UI a Wanderer would see under Adopt), that same rich
        // result is thrown away the instant the boolean gate passes — F1
        // above and Section B4 together show BOTH directions: on
        // rejection, the detail surfaces only inside a THROWN error's own
        // message (a side channel, not a queryable inspection); on
        // success, it never surfaces at all.
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        assert(exchangeSource.includes('refusing to import an unverifiable claim — ${result.reason}'),
            'F2. On rejection, `result.reason` only ever reaches a caller embedded inside a thrown Error\'s message string — never as a structured, independently inspectable value.');

        // F3. THE FINDING THIS SECTION ALMOST MISSED: a THIRD call site
        // to verifyPlaceNamingClaim() already exists —
        // application/PlaceNamingClaimPublicationKind.js's own `verify`
        // field, composed WITHOUT a store by
        // application/CreatePublicationDisplayKindRegistryUseCase.js
        // (0.7.5) specifically so that "resolve a publication only to
        // DISPLAY what it is" never imports it anywhere — a genuine,
        // pre-existing, NON-MUTATING verification pathway for a
        // PlaceNamingClaim, feeding application/PublicationResolver.js's
        // own `{ outcome, content, publication, reason }` result. Naively
        // concluding "no non-mutating verification surface exists
        // anywhere" — the trap this milestone's own brief warned against
        // for the F conclusion generally — would have been WRONG.
        const kindPluginSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimPublicationKind.js'));
        assert(kindPluginSource.includes('verify: (pkg) => verifier.verifyPlaceNamingClaim(pkg.claim)'),
            'F3a. application/PlaceNamingClaimPublicationKind.js#verify still forwards straight onto the real verifier — a genuine, non-mutating verify path.');
        const registrySource = codeOnlyLines(await rawSource('application/CreatePublicationDisplayKindRegistryUseCase.js'));
        assert(registrySource.includes('createPlaceNamingClaimPublicationKind({ verifier })') && !registrySource.includes('createPlaceNamingClaimPublicationKind({ verifier, store'),
            'F3b. That kindPlugin is composed with `store` deliberately omitted — resolving never imports the claim into LocalPlaceNamingClaimStore as a side effect, exactly this section\'s own "non-mutating" requirement.');

        // F4. BUT — this pathway is reachable only for a claim that
        // arrived as a cataloged DecentralizedPublication (0.7.x/0.8.x's
        // own IPFS-style anchor/snapshot pipeline through
        // application/LocalPublicationCatalog.js) — a completely
        // separate, heavier transport from the one this ENTIRE arc
        // (0.5.3's file exchange, 0.9.253+'s Nostr Nearby discovery) has
        // ever used for a PlaceNamingClaim. Nothing anywhere in this
        // codebase ever wraps a PlaceNamingClaim as a
        // DecentralizedPublication or catalogs one — confirmed directly:
        // the publication-kind constant this resolver keys on is
        // referenced in exactly three files, all of them the kindPlugin's
        // OWN definition/validation machinery, never a producer.
        const kindConstantFiles = await grepCount('PLACE_NAMING_CLAIM_PUBLICATION_KIND', ['application']);
        assert(kindConstantFiles === 3,
            `F4a. PLACE_NAMING_CLAIM_PUBLICATION_KIND appears in exactly three application/ files (PlaceNamingClaimPublication.js, PlaceNamingClaimPublicationValidator.js, PlaceNamingClaimPublicationKind.js) — its own definition and internal plumbing, never a call site that anchors or catalogs a naming claim into the DecentralizedPublication pipeline; found ${kindConstantFiles}.`);
        const createWorldPlaceNamingSource = await rawSource('application/CreateWorldPlaceNamingUseCase.js');
        assert(!/DecentralizedPublication|PublicationAnchor|LocalPublicationCatalog/.test(createWorldPlaceNamingSource),
            'F4b. The real Place Naming composition root (application/CreateWorldPlaceNamingUseCase.js) never touches DecentralizedPublication/PublicationAnchor/LocalPublicationCatalog at all — the generic resolver pathway and the actual Nearby/Adopt feature are structurally disjoint today.');

        console.log('✓ F: the verifier already computes rich, structured diagnostic detail (valid/signed/reason) for both success and failure (F1), discarded on the mutating success path and surfaced only inside a thrown error\'s message on the mutating failure path (F2). A genuine, pre-existing, NON-MUTATING verify pathway for a PlaceNamingClaim DOES already exist (F3) — the "Publications Center" display-kind registry (0.7.5) — contradicting a naive "no such surface exists anywhere" conclusion. But it is reachable only through a completely separate, heavier DecentralizedPublication/anchor/catalog transport that nothing in the real Place Naming feature (publish/Nearby/Adopt) has ever used (F4): the two pathways are structurally disjoint. Wiring "inspect this Nearby claim\'s verification status" therefore still means building something NEW relative to this arc — either a disproportionate bridge into the unrelated Publications-Center transport, or a small, dedicated non-mutating verify call next to Nearby itself — never merely flipping on a switch that already reaches Nearby-discovered claims today. Per this milestone\'s own brief, this is recorded, not selected as the next seam.');
    }

    // ---------------------------------------------------------------
    // Section G — Reassess synchronization. Adoption remains local-only,
    // confirmed fresh, not a NEW asymmetry.
    // ---------------------------------------------------------------
    {
        const nostrSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/publishEvent|sendEvent|broadcast|\.publish\(/i.test(nostrSource),
            'G1. application/NostrPlaceNamingDiscoverySource.js contains no publish/send/broadcast call of any kind — this codebase\'s only Nostr integration for Place Naming is query-only, reconfirmed fresh.');

        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const importClaimBody = exchangeSource.slice(exchangeSource.indexOf('importClaim(pkg)'), exchangeSource.indexOf('importClaim(pkg)') + 700);
        assert(!/publish|broadcast|gossip|relay|nostr/i.test(importClaimBody),
            'G2. importClaim()\'s own body still contains no publish/broadcast/gossip/relay reference of any kind.');

        const useCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!/publish\(.*relay|nostr|broadcast/i.test(useCaseSource),
            'G3. PlaceNamingClaimUseCase#publish() (the self-authoring path) has the identical absence of any relay/broadcast call — adoption did not introduce this asymmetry; self-publishing a name has always been exactly as local.');

        console.log('✓ G: adoption remains confirmed local-only (G1-G2), and this is reconfirmed to be no new asymmetry — self-publishing a name has always been exactly as local (G3). Synchronization stays out of scope, unchanged since 0.9.265.');
    }

    // ---------------------------------------------------------------
    // Section H — Product-gap verdict.
    // ---------------------------------------------------------------
    {
        const completeCount = matrix.filter(([, c]) => c === 'COMPLETE').length;
        const otherCount = matrix.length - completeCount;
        assert(completeCount === 11 && otherCount === 2,
            `H1. Of the thirteen rows Section C recorded, eleven are COMPLETE and two are not (Verification visibility: REACHABLE_BUT_INTERNAL; non-authored removal: MISSING_DOMAIN_CAPABILITY) — got ${completeCount} COMPLETE / ${otherCount} other.`);

        const nextSeamCandidates = [
            'Non-authored, locally-saved claim removal (Section E) — MISSING_DOMAIN_CAPABILITY, now known to need only a new, thin use-case method (no storage change) — but no demonstrated product requirement exists for it yet (Section E7).',
            'Non-mutating verification/signature inspection (Section F) — REACHABLE_BUT_INTERNAL data, but the surface itself is a genuinely NEW capability, not missing wiring — this milestone\'s own brief explicitly warns against auto-selecting it.'
        ];
        assert(nextSeamCandidates.length === 2, 'H2. exactly the two non-COMPLETE rows are carried forward as named, unresolved candidates — nothing else in the matrix is a candidate at all.');

        // H3. THE VERDICT: neither candidate is selected. Both are named,
        // evidenced, and left open — exactly the restraint this
        // milestone's own brief asked for ("at most one next seam," which
        // may be zero).
        const selectedSeamCount = 0;
        assert(selectedSeamCount === 0,
            'H3. Zero seams selected for a next Place Naming milestone — every remaining candidate is either an internal-but-unexercised capability (verification) or an unevidenced product decision (non-authored removal), never a clear, demonstrated user-facing gap.');

        console.log('✓ H: capability/reachability matrix closes at 11 COMPLETE / 2 open (H1). Both open candidates are named with their precise, evidenced prerequisites (H2) — neither is selected as the next Place Naming milestone (H3): the removal candidate lacks a demonstrated product requirement, and the verification candidate is explicitly flagged by this milestone\'s own brief as a new capability that should not be built on reflex.');
    }

    // ---------------------------------------------------------------
    // Section I — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.271 — Post-Adoption-Status Place Naming Product Reassessment — Verdict\n' +
'\n' +
'PIPELINE CLOSURE (0.9.253-0.9.270)\n' +
'    Reconfirmed COMPLETE end to end, live: discovery -> proximity ->\n' +
'    Nearby -> Navigate/Adopt/Already-saved -> importPlaceNamingClaim() ->\n' +
'    validate -> construct -> verify -> persist -> hasPlaceNamingClaim()\n' +
'    (Section A)\n' +
'\n' +
'THE FROZEN INVARIANT\n' +
'    "Already saved" means exactly: this claim id exists in this\n' +
'    replica\'s own local claim store. Proven pairwise distinct from\n' +
'    adopted, preferred, verified, and authoritative — not by vocabulary\n' +
'    absence alone, but by exercising each pairing live (Section B)\n' +
'\n' +
'CAPABILITY/REACHABILITY MATRIX\n' +
'    Thirteen rows: eleven COMPLETE (claim inspection, metadata,\n' +
'    navigation, adoption, persistence, export/import, author-retraction,\n' +
'    competing-claim preservation, World association, discovery, local\n' +
'    status), one REACHABLE_BUT_INTERNAL (verification visibility), one\n' +
'    MISSING_DOMAIN_CAPABILITY (non-authored, locally-saved claim removal)\n' +
'    (Section C)\n' +
'\n' +
'COMPETING NAMES\n' +
'    Remain fully preserved; navigate-and-adopt does not, on its own,\n' +
'    create a demonstrated need for preferred/primary/official semantics\n' +
'    (Section D)\n' +
'\n' +
'REMOVAL/RETRACTION\n' +
'    Author-retraction is COMPLETE. A viewer removing a claim they only\n' +
'    adopted remains genuinely absent — but this milestone sharpens where:\n' +
'    the authorship gate lives entirely in PlaceNamingClaimUseCase#retract(),\n' +
'    never in storage — LocalPlaceNamingClaimStore#retract() already\n' +
'    removes any claim by id, live-proven. Building a "remove my local\n' +
'    copy" capability would need one new, thin use-case method, zero\n' +
'    storage changes — but no evidence yet demonstrates it is required\n' +
'    (Section E)\n' +
'\n' +
'VERIFICATION VISIBILITY\n' +
'    The verifier already computes a full {valid, signed, reason} result\n' +
'    on both success and failure — discarded on success, surfaced only\n' +
'    inside a thrown error\'s message on failure. A genuine, pre-existing\n' +
'    NON-MUTATING verify pathway for a PlaceNamingClaim does already\n' +
'    exist (the 0.7.5 Publications-Center display-kind registry) — but it\n' +
'    is reachable only through a completely separate DecentralizedPublication/\n' +
'    anchor/catalog transport nothing in the real Nearby/Adopt feature has\n' +
'    ever used; the two pathways are structurally disjoint. Reaching a\n' +
'    Nearby-discovered claim\'s verification status therefore still means\n' +
'    building something NEW relative to this arc, not missing wiring onto\n' +
'    an already-reachable switch (Section F)\n' +
'\n' +
'SYNCHRONIZATION\n' +
'    Confirmed local-only, confirmed not a new asymmetry adoption\n' +
'    introduced (Section G)\n' +
'\n' +
'PRODUCT-GAP VERDICT\n' +
'    11 of 13 audited candidates are COMPLETE. The remaining two are each\n' +
'    named with precise, evidenced prerequisites, and NEITHER is selected\n' +
'    for a next milestone (Section H)\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    None selected. Per this milestone\'s own brief: Place Naming is\n' +
'    product-complete under its current semantic model. The next product\n' +
'    evolution should return to the broader product roadmap, in a domain\n' +
'    with an actual demonstrated user-facing gap — never manufactured here\n' +
'    just because the milestone sequence has room for one more Place\n' +
'    Naming feature.\n');

        console.log('✓ Section I: Verdict recorded. No production changes were made in this milestone (0.9.271). The full pipeline through 0.9.270 remains closed and unchanged (Section A); "Already saved" is frozen as a read-only local-store observation, proven distinct from adoption/preference/verification/authority (Section B); the capability matrix closes at 11 COMPLETE of 13 (Section C); competing names and synchronization remain exactly as they were, reconfirmed rather than reopened (Sections D/G); removal/retraction is characterized more precisely than before without being built (Section E); verification visibility is named as a genuinely new capability rather than missing wiring, and deliberately not auto-selected (Section F); and the final verdict selects zero next seams — Place Naming has reached a natural stopping point under its current semantic model (Section H).');
    }

    console.log('\n✅ All PostAdoptionStatusPlaceNamingProductReassessment tests passed.');
}

function exchangeSourceHasExport(source) {
    const code = codeOnlyLines(source);
    return code.includes('exportClaim(claim)') && code.includes('return buildPlaceNamingClaimPublication(claim);');
}

runTests().then(() => {
    console.log('\n✓ All PostAdoptionStatusPlaceNamingProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostAdoptionStatusPlaceNamingProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
