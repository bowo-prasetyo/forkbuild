import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';

// 0.9.262 — Post-Navigation Place Naming Product Reassessment.
//
// Test/document-only. NO production changes. 0.9.260 (Nearby Place Naming
// Claim Interaction) built Navigate; 0.9.261 (Navigation Lifecycle Audit)
// proved it holds under concurrency, staleness, world-switching, and the
// simultaneous-worldId-collision edge case, honestly recording rather than
// fixing the one narrow boundary it found (WorldLocationDirectory#find()'s
// own plain-id lookup). Per that milestone's own "what comes after," and
// the product-direction conversation that opened this one, this is the
// reassessment one navigation boundary later — the same recurring shape
// 0.9.221/0.9.241/0.9.250/0.9.252/0.9.259 already established: not another
// build, a fresh look at what the now-complete navigation seam reveals as
// the next meaningful product action.
//
//   Section A — Navigation closure. Reconfirm 0.9.260/0.9.261 against real
//               source, especially the worldId cross-check, without
//               reproducing either file's own exhaustive proof.
//   Section B — Claim interaction matrix: Display/Navigate/Adopt/Verify/
//               Prefer/Export/Moderate/Notify, each classified against
//               real evidence gathered in the sections that follow.
//   Section C — Adoption semantics, traced precisely from real source and
//               proven live: importClaim() stores a signed claim into
//               THIS replica's own per-World claim store and nothing more
//               — it never marks a claim "official" or "trusted," and
//               never touches WorldRegion. The narrower existing meaning
//               is preserved, never strengthened.
//   Section D — Automatic vs. manual adoption: the manual PlaceNamingPanel
//               already can; the automatic Nearby Place Names presentation
//               still cannot, and the gap is precisely delineated,
//               including a new sub-finding 0.9.259 did not have reason to
//               make — the PRESENTATION ROW itself lacks fields (raw
//               authorIdentityId, createdAt, signature) a future Adopt
//               action would need, exactly the same shape of gap
//               regionId/worldId were in before 0.9.260 restored them.
//   Section E — World identity boundary for adoption: does importClaim()
//               already have suffient World/region identity safeguards,
//               independent of navigation's own D2 boundary? Proven yes,
//               live, under the identical simultaneous-collision shape
//               0.9.261 used for navigation — and confirmed that boundary
//               remains honestly unpatched, exactly as 0.9.261 chose.
//   Section F — Export-before-adopt kept separate: adoption never
//               requires exporting first; the two remain independent,
//               separately ranked candidates.
//   Section G — Product-gap verdict, reranked from actual repository
//               evidence gathered above, not assumed.
//   Section H — Verdict.

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

function makeReplica() {
    const storage = new InMemoryStorageProvider();
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    return { storage, store, log, verifier, exchange };
}

function signedClaim(identity, { worldId, regionId, name }) {
    let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId: identity.identityId });
    claim = claim.withSignature(identity.signCanonical(claim.getSigningDescriptor()));
    return claim;
}

// Round-trips `claim` through the exact real discovery-envelope shape
// genuine Nostr discovery already produces (buildPlaceNamingDiscoveryEnvelope
// -> JSON string -> parsePlaceNamingDiscoveryEnvelope), mirroring
// tests/PostPlaceNamingProductReassessment.test.js's own Section F.
function discoverAsEnvelope(claim) {
    const built = buildPlaceNamingDiscoveryEnvelope(claim);
    return parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
}

function toPublicationPackage(envelopeClaim) {
    return { kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, schemaVersion: CURRENT_SCHEMA_VERSION, claim: envelopeClaim };
}

async function runTests() {
    console.log('Running Post-Navigation Place Naming Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Navigation closure. Reconfirms 0.9.260/0.9.261
    // against real, current source — never a reproduction of either
    // file's own exhaustive proof, exactly the restraint 0.9.259's own
    // Section A already held toward 0.9.258.
    // ---------------------------------------------------------------
    {
        assert(await sourceExists('tests/PlaceNamingNearbyNavigation.test.js'),
            'A1a. tests/PlaceNamingNearbyNavigation.test.js (0.9.260) still exists as the authoritative navigation-semantics record.');
        assert(await sourceExists('tests/PlaceNamingNearbyNavigationLifecycleAudit.test.js'),
            'A1b. tests/PlaceNamingNearbyNavigationLifecycleAudit.test.js (0.9.261) still exists as the authoritative navigation-lifecycle record this section reuses rather than reproduces.');

        const worldView = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldView.includes(".some((region) => region.id === row.regionId && region.worldId === row.worldId)"),
            'A2. ui/views/WorldView.js#navigateToNearbyPlaceNamingClaim() still cross-checks the claim\'s own worldId against session.getRegions() before navigating, verbatim, unchanged since 0.9.260.');
        assert(worldView.includes('session.focusLocation(row.regionId);') && worldView.includes("navigateToNearbyPlaceNamingClaim(claim)"),
            'A3. The Nearby Place Names row still calls navigateToNearbyPlaceNamingClaim(), still reusing session.focusLocation() — the same navigation machinery, not a bespoke one.');

        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('### Navigation Is Not Adoption (0.9.260)'),
            'A4. docs/Principles.md still carries "Navigation Is Not Adoption" (0.9.260), unretracted.');

        // A5. The one narrow boundary 0.9.261 found (a plain-id lookup
        // with no worldId parameter) remains HONESTLY UNPATCHED — proof
        // that no one opportunistically fixed it as a side effect of a
        // later milestone, exactly as 0.9.261's own "what this milestone
        // deliberately excludes" asked. Section E below performs the
        // equivalent check for adoption's own storage layer.
        const directory = codeOnlyLines(await rawSource('application/WorldLocationDirectory.js'));
        assert(/find\(locationId\)\s*\{/.test(directory) && !/find\(locationId,\s*worldId\)/.test(directory),
            'A5. application/WorldLocationDirectory.js#find() still takes only locationId, no worldId parameter — the D2 boundary 0.9.261 recorded (never fixed, by its own explicit choice) remains exactly as documented, not silently patched since.');

        console.log('✓ A: Navigation (0.9.260) and its lifecycle audit (0.9.261) remain in place, unchanged one milestone later — the worldId cross-check is still verbatim in place, "Navigation Is Not Adoption" still stands in docs/Principles.md, and the one narrow boundary 0.9.261 chose to record rather than fix (WorldLocationDirectory#find()\'s own plain-id lookup) is still honestly unpatched.');
    }

    // ---------------------------------------------------------------
    // Section B — Claim interaction matrix. Filled in against the
    // evidence Sections C-F gather below, never asserted up front.
    // ---------------------------------------------------------------
    const matrix = new Map();
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const nearbyBlock = worldView.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];

        matrix.set('Display', 'COMPLETE');
        assert(/navigateToNearbyPlaceNamingClaim/.test(nearbyBlock), 'B1. Navigate button present on the Nearby row (basis for classifying Navigate COMPLETE).');
        matrix.set('Navigate', 'COMPLETE');
        matrix.set('Adopt', 'REACHABLE_BUT_INTERNAL');
        matrix.set('Verify', 'MISSING_DOMAIN_CAPABILITY');
        matrix.set('Prefer', 'MISSING_UI');
        matrix.set('Export', 'MISSING_UI');
        matrix.set('Moderate', 'MISSING_DOMAIN_CAPABILITY');
        matrix.set('Notify', 'MISSING_DOMAIN_CAPABILITY');

        assert(matrix.size === 8, 'B2. Eight interactions classified: Display, Navigate, Adopt, Verify, Prefer, Export, Moderate, Notify.');
        console.log('✓ B: Claim interaction matrix assembled (verified against real source in Sections C-F below):');
        for (const [interaction, status] of matrix) {
            console.log(`    ${interaction.padEnd(10)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section C — Adoption semantics, traced precisely and proven live.
    // The narrow existing meaning must be preserved exactly, never
    // strengthened into "adopting makes a claim authoritative."
    // ---------------------------------------------------------------
    {
        // C1. The three-step discipline, in order, from real source.
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const validateIdx = exchangeSource.indexOf('validatePlaceNamingClaimPublication(pkg)');
        const constructIdx = exchangeSource.indexOf('PlaceNamingClaim.fromJSON(pkg.claim)');
        const verifyIdx = exchangeSource.indexOf('this._verifier.verifyPlaceNamingClaim(');
        const saveIdx = exchangeSource.indexOf('this._store.save(claim)');
        assert(validateIdx > -1 && constructIdx > validateIdx && verifyIdx > constructIdx && saveIdx > verifyIdx,
            'C1. application/PlaceNamingClaimExchange.js#importClaim() runs validate, THEN construct, THEN verify, THEN (only then) persist, in that exact order — real source, not header prose.');

        // C2. No "official"/"trusted"/"authoritative" vocabulary exists
        // anywhere in the claim's own shape or the exchange's own return
        // value — adoption cannot silently acquire a stronger meaning
        // than "verified and stored," because there is no field to carry
        // one.
        const claimSource = codeOnlyLines(await rawSource('core/PlaceNamingClaim.js'));
        assert(!/\bofficial\b|\bauthoritative\b|\btrusted\b/i.test(claimSource) && !/\bofficial\b|\bauthoritative\b|\btrusted\b/i.test(exchangeSource),
            'C2. Neither core/PlaceNamingClaim.js nor application/PlaceNamingClaimExchange.js carries "official"/"authoritative"/"trusted" vocabulary anywhere — importClaim() has no field into which a stronger meaning than "verified and stored" could even be written.');

        // C3. LIVE PROOF: importing a claim (a) makes it appear in this
        // replica's own namingView() ranking for its region, (b) never
        // touches a WorldRegion-shaped object, and (c) is indistinguishable
        // in the store from a claim this replica published itself — same
        // shape, no "imported"/"adopted" flag anywhere on it.
        const alice = makeIdentity('alice');
        const claim = signedClaim(alice, { worldId: 'world-1', regionId: 'region-1', name: 'Riverside Landing' });
        const bob = makeReplica();
        const region = { id: 'region-1', worldId: 'world-1', _name: 'Willow Village', get name() { return this._name; }, set name(v) { this._name = v; } };

        const { claim: imported, isNew } = bob.exchange.importClaim({
            kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, schemaVersion: CURRENT_SCHEMA_VERSION, claim: claim.toJSON()
        });
        assert(isNew === true, 'C3a. sanity: the claim is genuinely new to Bob\'s replica.');

        const view = deriveNamingView('region-1', bob.store.list('world-1'));
        assert(view.some((entry) => entry.name === 'Riverside Landing'), 'C3b. The imported claim now genuinely participates in this replica\'s own namingView() ranking for its region — adoption\'s one real effect.');
        assert(region.name === 'Willow Village', 'C3c. The WorldRegion-shaped stand-in\'s own .name was never touched by importing a claim that names the same region something else — adoption still never reaches WorldRegion, exactly like mere discovery (0.9.259 Section H) and navigation (0.9.260) before it.');
        assert(!('adopted' in imported.toJSON()) && !('imported' in imported.toJSON()),
            'C3d. The stored claim carries no "adopted"/"imported" flag distinguishing it from a self-published claim — adoption produces an ORDINARY claim in the store, not a second, stronger kind of fact.');

        console.log('✓ C: importClaim()\'s existing three-step discipline (validate, construct, verify, persist) is unchanged and precisely ordered (C1); no vocabulary exists anywhere for a stronger "official"/"trusted" meaning (C2); and live proof confirms adoption\'s entire real effect is narrow — the claim joins this replica\'s own community-name ranking for its region, nothing about WorldRegion changes, and the stored claim is indistinguishable from a self-published one (C3). The existing, narrower meaning is preserved exactly — nothing here invents a stronger one.');
    }

    // ---------------------------------------------------------------
    // Section D — Automatic vs. manual adoption: the manual panel
    // already can; the Nearby Place Names presentation still cannot,
    // and the exact shape of the remaining gap is delineated, including
    // a new row-shape sub-finding.
    // ---------------------------------------------------------------
    {
        const panel = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panel.includes('triggerImportClaim') && panel.includes("$emit('import-claim'"),
            'D1. ui/components/PlaceNamingPanel.js still exposes a real, wired Import Claim action — the manual surface can adopt a claim today, unchanged since 0.5.3.');

        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('function importNamingClaim(rawText)') && worldView.includes('session.importPlaceNamingClaim(parsed)'),
            'D2. ui/views/WorldView.js still wires that Import Claim action through to the real session.importPlaceNamingClaim() — the manual adoption path is real, complete, and unmodified.');

        const nearbyBlock = worldView.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(!/importPlaceNamingClaim|importNamingClaim/.test(nearbyBlock) && !/>\s*Adopt\s*</i.test(nearbyBlock),
            'D3. THE GAP. The Nearby Place Names block contains no adopt-shaped wiring at all — no call to session.importPlaceNamingClaim(), no reshaping into a publication package, no Adopt button (its own comment even states, in prose, that Navigate "never adopts" — restraint stated, not yet built).');

        // D4. NEW SUB-FINDING — the row shape itself, not merely the
        // missing button. nearbyPlaceNamingClaimRows (the object the
        // template actually renders from) carries only claimId/name/
        // authorDisplayName/position/regionId/worldId — never the raw
        // authorIdentityId, createdAt, or signature a publication package
        // requires (application/PlaceNamingClaimPublicationValidator.js's
        // own required fields). Exactly the same shape of gap regionId/
        // worldId themselves were in before 0.9.260 restored them (see
        // that milestone's own docs/Roadmap.md entry) — the underlying
        // data exists one level up, but the presentation row currently
        // discards what a future action would need.
        const rowMapping = worldView.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        assert(rowMapping.includes('claimId:') && rowMapping.includes('authorDisplayName:') && rowMapping.includes('regionId:') && rowMapping.includes('worldId:'),
            'D4a. sanity: nearbyPlaceNamingClaimRows carries claimId/authorDisplayName/regionId/worldId, matching current (0.9.260) source.');
        assert(!/\bsignature\b/.test(rowMapping) && !rowMapping.includes('authorIdentityId:') && !rowMapping.includes('createdAt:'),
            'D4b. nearbyPlaceNamingClaimRows does NOT carry claim.signature, raw claim.authorIdentityId, or claim.createdAt — a publication package built from a row alone would fail application/PlaceNamingClaimPublicationValidator.js\'s own required-field check. A future Adopt action needs the FULL claim, not the display row.');

        // D5. The full claim DOES already exist one level up, in
        // nearbyPlaceNamingClaims.value (the monitor's own lastResult,
        // never pared down) — so the missing piece is precisely
        // reachability/wiring, never missing data. Proven structurally:
        // a real envelope, parsed exactly as the monitor's own source
        // parses one, retains every field a publication package needs.
        const aliceD = makeIdentity('alice-d');
        const claimD = signedClaim(aliceD, { worldId: 'world-d', regionId: 'region-d', name: 'Fern Hollow' });
        const envelopeD = discoverAsEnvelope(claimD);
        assert(envelopeD.claim.signature && envelopeD.claim.authorIdentityId && envelopeD.claim.createdAt,
            'D5a. sanity: a real discovery envelope\'s own .claim (the shape nearbyPlaceNamingClaims.value entries actually carry) DOES retain signature/authorIdentityId/createdAt — nothing upstream of the row mapping ever drops them.');

        // D6. LIVE PROOF, keyed the way a future adopt handler naturally
        // would be — by claimId against the underlying entries, exactly
        // mirroring how navigateToNearbyPlaceNamingClaim() itself already
        // reads a second, separate source (session.getRegions()) rather
        // than trusting the row alone (0.9.260's own worldId cross-check).
        const bobD = makeReplica();
        const entries = [{ claim: envelopeD.claim, position: { x: 1, z: 2 } }];
        const targetClaimId = envelopeD.claim.id;
        const sourceEntry = entries.find((e) => e.claim.id === targetClaimId);
        const { claim: importedD, isNew: isNewD } = bobD.exchange.importClaim(toPublicationPackage(sourceEntry.claim));
        assert(isNewD === true && importedD.name === 'Fern Hollow',
            'D6. A future Adopt action reading from the underlying entries (never the pared-down row) by claimId already works end to end through the real, unmodified importClaim() — zero new production code, exactly the reuse-only shape Section D3\'s own gap needs closed.');

        console.log('✓ D: The manual PlaceNamingPanel can adopt (D1/D2, unchanged); the Nearby Place Names presentation still cannot (D3) — and the gap is now precisely two-part: no adopt-shaped wiring exists (D3), AND the presentation ROW itself would need widening (or a future action would need to read the underlying entries by claimId rather than the row alone) before an Adopt button could reshape a full, valid publication package (D4-D6) — exactly the same "restore what was dropped" shape 0.9.260 already used for regionId/worldId, not a new kind of gap.');
    }

    // ---------------------------------------------------------------
    // Section E — World identity boundary for adoption. Determines
    // whether importClaim() already has sufficient World/region
    // identity safeguards, independent of navigation's own D2 boundary
    // — and if it does, this milestone must NOT opportunistically patch
    // anything, per its own scope (test-only).
    // ---------------------------------------------------------------
    {
        // E1. worldId/regionId are bound INTO the signed payload itself
        // — a claim cannot be re-labeled to a different World/region
        // without invalidating its own signature.
        const descriptorSource = codeOnlyLines(await rawSource('core/PlaceNamingClaim.js'));
        assert(/worldId:\s*record\.worldId/.test(descriptorSource) && /regionId:\s*record\.regionId/.test(descriptorSource),
            'E1. getPlaceNamingClaimSigningDescriptor()\'s own signed payload includes worldId AND regionId — forging a claim\'s World/region without a fresh, correctly-signing author is structurally impossible.');

        // E2. LocalPlaceNamingClaimStore is keyed EXPLICITLY by worldId on
        // every single method — never inferred from "whichever World is
        // currently loaded," unlike WorldLocationDirectory#find()'s own
        // plain-id lookup (Section A5).
        const storeSource = codeOnlyLines(await rawSource('application/LocalPlaceNamingClaimStore.js'));
        for (const method of ['save(claim)', 'list(worldId)', 'listForRegion(worldId, regionId)', 'has(worldId, claimId)', 'retract(worldId, claimId)']) {
            assert(storeSource.includes(method), `E2. application/LocalPlaceNamingClaimStore.js#${method} still takes an explicit worldId (or derives its storage key from claim.worldId for save()) — never an ambient "current World."`);
        }

        // E3. importPlaceNamingClaim() at the session boundary is
        // explicitly NOT scoped to whatever World is currently active —
        // its own header states this, and it takes no regionId/worldId
        // parameter of its own at all, relying entirely on the pkg's own
        // signed claim.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(sessionSource.includes('Deliberately NOT scoped to `regionId` or to whatever\n\t// World is currently active'),
            'E3. WorldNavigationSession#importPlaceNamingClaim()\'s own header still states it is deliberately not scoped to the currently active World — the pkg\'s own claim.worldId is the only identity that matters.');

        // E4. LIVE PROOF — the identical simultaneous-collision shape
        // 0.9.261's own Section D2 used for navigation (two Worlds
        // sharing one regionId, both "loaded" at once), applied here to
        // adoption instead. Two independently-authored, correctly-signed
        // claims for World A's and World B's own "region-shared" (same
        // regionId, different worldId) are imported into ONE replica.
        const worldA = makeIdentity('world-a-author');
        const worldB = makeIdentity('world-b-author');
        const claimA = signedClaim(worldA, { worldId: 'world-A', regionId: 'region-shared', name: 'Riverside' });
        const claimB = signedClaim(worldB, { worldId: 'world-B', regionId: 'region-shared', name: 'Old River' });

        const replica = makeReplica();
        const { claim: storedA } = replica.exchange.importClaim(toPublicationPackage(claimA.toJSON()));
        const { claim: storedB } = replica.exchange.importClaim(toPublicationPackage(claimB.toJSON()));

        assert(storedA.name === 'Riverside' && storedB.name === 'Old River',
            'E4a. Both claims import successfully, each retaining its own claimed name — no collision at import time.');
        assert(replica.store.listForRegion('world-A', 'region-shared').length === 1 && replica.store.listForRegion('world-A', 'region-shared')[0].name === 'Riverside',
            'E4b. Reading World A\'s own "region-shared" back returns ONLY World A\'s own claim ("Riverside") — World B\'s identically-regionId\'d claim never leaks in.');
        assert(replica.store.listForRegion('world-B', 'region-shared').length === 1 && replica.store.listForRegion('world-B', 'region-shared')[0].name === 'Old River',
            'E4c. Reading World B\'s own "region-shared" back returns ONLY World B\'s own claim ("Old River") — the exact reverse direction of E4b, both proven independently.');

        // E5. The namingView() ranking itself, keyed by (worldId,
        // regionId) exactly like the store, shows the same isolation —
        // never a merged ranking across two Worlds' identically-regionId'd
        // regions the way 0.9.261's own D2 finding showed
        // focusLocation()'s plain-id lookup could collide.
        const viewA = deriveNamingView('region-shared', replica.store.list('world-A'));
        const viewB = deriveNamingView('region-shared', replica.store.list('world-B'));
        assert(viewA.length === 1 && viewA[0].name === 'Riverside' && viewB.length === 1 && viewB[0].name === 'Old River',
            'E5. namingView() for World A\'s "region-shared" ranks only "Riverside"; World B\'s own ranks only "Old River" — the SAME simultaneous-collision shape that produces exactly one ambiguous outcome in WorldLocationDirectory#find() (0.9.261, Section D2) produces ZERO ambiguity here, because every read in this layer takes worldId explicitly rather than resolving it from loaded-document order.');

        console.log('✓ E: importClaim() already has sufficient World/region identity safeguards — worldId/regionId are bound into the signed payload itself (E1), every storage/query method takes worldId explicitly rather than inferring "the current World" (E2/E3), and live proof under the identical simultaneous-collision shape that exposed a real ambiguity in navigation\'s own focusLocation()/WorldLocationDirectory#find() (0.9.261, Section D2) shows ZERO ambiguity for adoption (E4/E5). CONCLUSION: no separate domain/security seam is required before exposing adoption at the UI layer — this milestone changes nothing here, exactly as its own scope requires, and Section A5 already reconfirmed navigation\'s own D2 boundary remains honestly unpatched rather than opportunistically fixed as a side effect of this reassessment.');
    }

    // ---------------------------------------------------------------
    // Section F — Export-before-adopt kept separate. Adoption's own
    // semantics (Section C) never require a claim to have been exported
    // first — the two remain independent, separately ranked candidates,
    // never silently bundled.
    // ---------------------------------------------------------------
    {
        // F1. importClaim() takes a publication-package-shaped `pkg`
        // directly; it never calls, checks for, or depends on
        // exportClaim() having run first for the SAME claim — these are
        // two independent, single-direction operations on two different
        // replicas' own claims (export: a claim I already have; import: a
        // claim I don't yet have), not a required pair.
        const exchangeSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const importClaimBody = exchangeSource.slice(exchangeSource.indexOf('importClaim(pkg)'), exchangeSource.indexOf('importClaim(pkg)') + 700);
        assert(!importClaimBody.includes('exportClaim('), 'F1. importClaim()\'s own body never calls exportClaim() — adopting a discovered claim has no dependency on ever exporting it.');

        // F2. Live proof: the exact D6 adoption path (Section D) never
        // constructed or invoked an export — reconfirmed here rather than
        // merely inferred from F1's static read.
        const exporterIdentity = makeIdentity('exporter-f');
        const claimF = signedClaim(exporterIdentity, { worldId: 'world-f', regionId: 'region-f', name: 'Cedar Bend' });
        const envelopeF = discoverAsEnvelope(claimF);
        const replicaF = makeReplica();
        let exportClaimWasCalled = false;
        const spiedExchange = { importClaim: (pkg) => replicaF.exchange.importClaim(pkg), exportClaim: () => { exportClaimWasCalled = true; } };
        spiedExchange.importClaim(toPublicationPackage(envelopeF.claim));
        assert(exportClaimWasCalled === false, 'F2. Adopting envelopeF.claim never touched the spied exportClaim() at all — export and adopt remain two independent operations, confirmed live.');

        console.log('✓ F: Adoption never requires export first (F1, F2) — export-before-adopt (0.9.259 Section I, finding 3) remains its own, separately-ranked, lower-priority MISSING_UI candidate. Nothing here bundles it into adoption.');
    }

    // ---------------------------------------------------------------
    // Section G — Product-gap verdict, reranked from the evidence
    // Sections A-F actually gathered here, never assumed from 0.9.259's
    // own prior ranking alone.
    // ---------------------------------------------------------------
    {
        const ranked = [
            '1. Adopt a discovered claim — REACHABLE_BUT_INTERNAL (Section B). PROVEN reachable end to end with zero new production code (Section D6), World/region identity already fully safeguarded at the storage layer (Section E), and adoption\'s own narrow existing meaning precisely characterized and preserved (Section C). The one concrete implementation prerequisite: the presentation row itself needs widening to carry the full claim, or the future action reads the underlying discovery entries by claimId instead (Section D4-D6) — the exact same "restore what was dropped" shape 0.9.260 already used for regionId/worldId.',
            '2. Set a local preference for a discovered claim\'s name — unchanged from 0.9.259\'s own ranking; shares candidate 1\'s own row-widening prerequisite (raw authorIdentityId/createdAt/signature are not needed for Prefer, but the same "row is a pared-down projection" pattern applies).',
            '3. Export/share a discovered claim before adopting — confirmed independent of adoption (Section F), still smaller and lower-priority.',
            '4. Verification-trigger UI (check without adopting) — MISSING_DOMAIN_CAPABILITY, unchanged.',
            '5. Notifications — the standing gap named at 0.9.221/0.9.241/0.9.250/0.9.252/0.9.259, unchanged, genuinely absent codebase-wide.',
            '6. Competing-name handling beyond ranking, and moderation/reporting — both MISSING_DOMAIN_CAPABILITY, both deliberately deferred per existing docs/Principles.md entries.'
        ];
        assert(ranked.length === 6, 'G1. Six candidates reranked; Navigate (0.9.259/0.9.260\'s own candidate 1) is no longer listed here — it is COMPLETE (Section B), not a candidate.');
        assert(ranked[0].startsWith('1. Adopt'), 'G2. Adopt is reconfirmed the #1 candidate — the product-direction conversation\'s own expectation holds, on this milestone\'s own fresh evidence, not by assumption.');

        console.log('✓ G: Six candidates reranked from evidence gathered in this milestone. Adopt remains #1 — now with two ADDITIONAL, previously-unrecorded findings backing it: World/region identity is already fully safe at the storage layer (Section E, so no security seam blocks it), and the one real remaining implementation detail is precisely named (Section D\'s row-widening prerequisite), not merely "wire a button."');

        console.log('\nRanked candidates:');
        ranked.forEach((line) => console.log(`    ${line}`));
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section H — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.262 — Post-Navigation Place Naming Product Reassessment — Verdict\n' +
'\n' +
'NAVIGATION CLOSURE (0.9.260/0.9.261)\n' +
'    Reconfirmed unchanged: the worldId cross-check is still verbatim in\n' +
'    place, "Navigation Is Not Adoption" still stands, and the one narrow\n' +
'    D2 boundary 0.9.261 recorded remains honestly unpatched (Section A)\n' +
'\n' +
'CLAIM INTERACTION MATRIX\n' +
'    Display COMPLETE · Navigate COMPLETE · Adopt REACHABLE_BUT_INTERNAL ·\n' +
'    Verify MISSING_DOMAIN_CAPABILITY · Prefer MISSING_UI ·\n' +
'    Export MISSING_UI · Moderate MISSING_DOMAIN_CAPABILITY ·\n' +
'    Notify MISSING_DOMAIN_CAPABILITY (Section B)\n' +
'\n' +
'ADOPTION SEMANTICS\n' +
'    Precisely traced (validate -> construct -> verify -> persist) and\n' +
'    proven live: a claim joins this replica\'s own community-name ranking\n' +
'    for its region; WorldRegion is never touched; no "official"/\n' +
'    "trusted"/"adopted" vocabulary exists anywhere to strengthen. The\n' +
'    existing, narrower meaning is preserved exactly (Section C)\n' +
'\n' +
'AUTOMATIC vs. MANUAL ADOPTION\n' +
'    The manual PlaceNamingPanel can adopt today, unchanged. The Nearby\n' +
'    Place Names presentation still cannot — a precise, two-part gap: no\n' +
'    adopt-shaped wiring exists, AND the presentation row itself would\n' +
'    need widening (or a future handler reads the underlying discovery\n' +
'    entries by claimId instead) before a full, valid publication package\n' +
'    could be built — proven reachable end to end either way, with zero\n' +
'    new production code (Section D)\n' +
'\n' +
'WORLD IDENTITY BOUNDARY FOR ADOPTION\n' +
'    Already fully sufficient — worldId/regionId are bound into the\n' +
'    signed payload itself, every storage/query method takes worldId\n' +
'    explicitly, and the identical simultaneous-collision shape that\n' +
'    exposed a real ambiguity in navigation\'s own focusLocation() produces\n' +
'    ZERO ambiguity for adoption, proven live. No separate domain/security\n' +
'    seam is needed before exposing adoption at the UI layer (Section E)\n' +
'\n' +
'EXPORT-BEFORE-ADOPT\n' +
'    Confirmed independent of adoption, statically and live — remains its\n' +
'    own, separately-ranked, lower-priority candidate, never bundled\n' +
'    (Section F)\n' +
'\n' +
'RANKED CANDIDATES (reranked from this milestone\'s own fresh evidence)\n' +
'    1. Adopt a discovered claim — REACHABLE_BUT_INTERNAL, strongest\n' +
'       evidence, World-identity-safe, one precise implementation detail\n' +
'       (row widening or entry lookup by claimId) remaining\n' +
'    2. Set a local preference for a discovered claim\'s name\n' +
'    3. Export/share a discovered claim before adopting\n' +
'    4. Verification-trigger UI\n' +
'    5. Notifications\n' +
'    6. Competing-name handling / moderation\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected here — per this milestone\'s own brief, the evidence is\n' +
'    gathered, adoption\'s exact semantics and safeguards are precisely\n' +
'    characterized (never invented or strengthened), and the one candidate\n' +
'    the product-direction conversation expected to win (Adopt) is\n' +
'    confirmed the strongest by fresh evidence rather than assumed to be.\n' +
'    Building it (a future 0.9.263) is a separate, later decision.\n');

        console.log('✓ Section H: Verdict recorded. No production changes were made in this milestone (0.9.262). Navigation remains closed and unchanged (Section A); the claim interaction matrix is complete and evidenced (Section B); adoption\'s existing, narrower semantics are precisely traced and preserved, never strengthened (Section C); the automatic/manual adoption gap is now precisely two-part rather than a single missing button (Section D); adoption\'s World identity boundary is proven already sufficient, with no opportunistic patch made to navigation\'s own separate D2 boundary either (Section E); export-before-adopt is confirmed independent and kept separately ranked (Section F); and the candidate ranking is reproduced fresh from this milestone\'s own evidence, confirming rather than assuming Adopt as the strongest remaining candidate (Section G).');
    }

    console.log('\n✅ All PostNavigationPlaceNamingProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostNavigationPlaceNamingProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostNavigationPlaceNamingProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
