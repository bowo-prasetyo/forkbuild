import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND, CURRENT_SCHEMA_VERSION } from '../application/PlaceNamingClaimPublication.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.259 — Post-Place-Naming Product Reassessment.
//
// Test/document-only. NO production changes. 0.9.253 through 0.9.257 built
// the complete automatic Place Naming discovery/presentation pipeline;
// 0.9.258 proved it holds together end to end under concurrency, failure,
// and lifecycle churn. Per that milestone's own "what comes after," and the
// product-direction conversation that opened this one, this is the
// reassessment: NOT another pipeline extension, but a fresh look at what
// the now-complete capability actually reveals as the next meaningful
// product seam — following the exact restraint 0.9.221/0.9.241/0.9.250/
// 0.9.252 already established for this recurring milestone shape.
//
//   Section A — Freeze. Reuse 0.9.258's own test file as the authoritative
//               pipeline record rather than reproducing it.
//   Section B — Capability/reachability matrix across core, application,
//               storage, identity, World View, Editor, peer exchange, and
//               import/export.
//   Section C — Claim interaction: display/inspect/navigate/select/copy-
//               share, manual vs automatic, against real code.
//   Section D — Claim identity/provenance boundary: claim identity, place/
//               region identity, author identity, discovery source, and
//               spatial position, never conflating transport identity
//               (a Nostr pubkey) with naming identity (authorIdentityId).
//   Section E — Existing Place Naming infrastructure sweep: every entry
//               point that already reaches the manual PlaceNamingPanel,
//               and the one new surface (Nearby Place Names) that reaches
//               none of them.
//   Section F — Manual vs automatic workflow comparison, PROVEN rather
//               than asserted: a claim discovered exactly the way the real
//               pipeline discovers it is fed, unmodified, through the
//               REAL, unmodified PlaceNamingClaimExchange#importClaim() on
//               a totally independent replica that never published it —
//               and it verifies and stores. Adoption of a discovered claim
//               is not a missing domain capability; it is a disconnected
//               existing one.
//   Section G — World-location naming boundary: already explicitly frozen
//               (docs/Principles.md, "A Name Is A Claim, Not A Fact"),
//               reconfirmed against real code rather than assumed.
//   Section H — The particularly important negative audit: no path from a
//               nearby claim to a WorldRegion's own current name, anywhere
//               in the pipeline or its presentation.
//   Section I — Missing UI gaps found, itemized and classified.
//   Section J — Missing domain capabilities reconfirmed (verification
//               trigger, competing-name handling, moderation,
//               notifications) — still deliberately absent.
//   Section K — Obsolete/duplicate candidate check: none found; the file
//               transport and the Nostr transport are complementary, not
//               competing.
//   Section L — Candidate ranking. Nothing built.
//   Section M — Verdict.

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

// Mirrors tests/PostCommentaryUIProductReassessment.test.js's own
// grepCount()/constructorCallerCount() helpers — the one grep-verifiable
// signal this reassessment lineage has always used for "does anything real
// call this," rather than trusting a header comment's own claim either way.
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

// Mirrors tests/PlaceNamingExchange.test.js's own makeIdentity() — one
// independent, authenticated LocalIdentityProvider standing in for one
// distinct identity, capable of a real Ed25519 signature.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

// One fully independent replica: its own storage, its own claim store, its
// own publication log, its own verifier — never shares state with the
// identity that authored the claim under test in Section F.
function makeReplica() {
    const storage = new InMemoryStorageProvider();
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    return { store, log, verifier, exchange };
}

async function runTests() {
    console.log('Running Post-Place-Naming Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Freeze. Reuses 0.9.258's own test file as the
    // authoritative pipeline record; re-verifies one signal per
    // architectural layer fresh against real source rather than
    // reproducing that file's own 43 assertions.
    // ---------------------------------------------------------------
    {
        assert(await sourceExists('tests/PlaceNamingEndToEndLifecycleAudit.test.js'),
            'A1. tests/PlaceNamingEndToEndLifecycleAudit.test.js (0.9.258) still exists as the authoritative pipeline-closure record this section reuses rather than reproduces.');

        const envelope = await rawSource('core/PlaceNamingDiscoveryEnvelope.js');
        const monitor = await rawSource('application/PlaceNamingDiscoveryMonitor.js');
        const proximity = await rawSource('core/PlaceNamingProximitySelection.js');
        assert(envelope.includes("const SUPPORTED_ENVELOPE_PROTOCOL = 'forkbuild-place-naming-discovery';"),
            'A2a. core/PlaceNamingDiscoveryEnvelope.js still carries the same protocol string (0.9.253), unchanged.');
        assert(monitor.includes('export class PlaceNamingDiscoveryMonitor') && monitor.includes('_requestId'),
            'A2b. application/PlaceNamingDiscoveryMonitor.js still exists with its own request-id race guard (0.9.256), unchanged.');
        assert(proximity.includes('export function selectNearbyPlaceNamingClaims'),
            'A2c. core/PlaceNamingProximitySelection.js still exports the same pure spatial filter (0.9.255), unchanged.');

        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('new PlaceNamingDiscoveryMonitor({') && worldView.includes("title=\"Nearby Place Names\""),
            'A2d. ui/views/WorldView.js still constructs a real PlaceNamingDiscoveryMonitor and renders "Nearby Place Names" (0.9.256/0.9.257), unchanged.');

        console.log('✓ A: The complete automatic Place Naming pipeline (0.9.253-0.9.257) and its own end-to-end audit (0.9.258) remain in place, unchanged one milestone later. 0.9.258\'s own test file remains the authoritative full record; nothing here reproduces it.');
    }

    // ---------------------------------------------------------------
    // Section B — Capability/reachability matrix across the areas this
    // milestone's own brief names by name: core, application, storage,
    // identity, World View, Editor, peer exchange, import/export.
    // ---------------------------------------------------------------
    {
        const register = [];

        const domainFiles = ['core/PlaceNamingClaim.js', 'core/PlaceNamingView.js', 'core/PlaceNamingProximitySelection.js', 'core/PlaceNamingDiscoveryEnvelope.js', 'core/PlaceIdentity.js'];
        for (const file of domainFiles) {
            assert(await sourceExists(file), `B1. ${file} exists.`);
        }
        register.push(['core (domain)', 'COMPLETE — claim, view, proximity, discovery envelope, geographic identity']);

        const applicationFiles = [
            'application/LocalPlaceNamingClaimStore.js', 'application/PlaceNamingClaimUseCase.js',
            'application/PlaceNamingClaimExchange.js', 'application/PlaceNamingClaimPublication.js',
            'application/PlaceNamingClaimPublicationValidator.js', 'application/NostrPlaceNamingDiscoverySource.js',
            'application/PlaceNamingDiscoveryQueryService.js', 'application/DiscoverPlaceNamingClaimsCommand.js',
            'application/PlaceNamingDiscoveryMonitor.js', 'application/PlaceNamingDiscoveryRuntimeComposition.js',
            'application/LocalNamePreferenceStore.js', 'application/ShouldRefreshPlaceNamingDiscovery.js'
        ];
        for (const file of applicationFiles) {
            assert(await sourceExists(file), `B2. ${file} exists.`);
        }
        register.push(['application (use cases + orchestration)', 'COMPLETE — publish/retract/read, file exchange, Nostr discovery, orchestration, all present']);

        // B3. Storage. Deliberately no dedicated storage/PlaceNaming*.js
        // file — LocalPlaceNamingClaimStore/LocalNamePreferenceStore/
        // LocalPlaceNamingPublicationLog live in application/ and take a
        // generic storage/StorageProvider.js, the same pattern most
        // Local*Store classes in this codebase already follow. Absence
        // here is architectural consistency, never a gap.
        const claimStore = await rawSource('application/LocalPlaceNamingClaimStore.js');
        assert(/StorageProvider/.test(claimStore) || claimStore.includes('storageProvider'),
            'B3. application/LocalPlaceNamingClaimStore.js persists through the generic storage/StorageProvider.js — no dedicated storage/ file needed, matching this codebase\'s own Local*Store convention.');
        register.push(['storage', 'COMPLETE — via generic StorageProvider, no dedicated file needed (architectural pattern, not a gap)']);

        // B4. Identity. verifyPlaceNamingClaim() is real and load-bearing.
        const verifier = await rawSource('identity/LocalAuthorizationVerifier.js');
        assert(verifier.includes('verifyPlaceNamingClaim(record)'), 'B4. identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim() exists.');
        register.push(['identity', 'COMPLETE — signature verification enforced on every import, never on discovery itself']);

        // B5. World View. Both the manual panel and the automatic
        // presentation are mounted and real.
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes("import PlaceNamingPanel from '../components/PlaceNamingPanel.js'") && worldView.includes('<PlaceNamingPanel'),
            'B5a. ui/views/WorldView.js mounts a real PlaceNamingPanel (manual, 0.5.2).');
        assert(worldView.includes('nearbyPlaceNamingClaimRows'), 'B5b. ui/views/WorldView.js computes and renders nearbyPlaceNamingClaimRows (automatic, 0.9.257).');
        register.push(['World View', 'COMPLETE at the composition-root level — both surfaces exist and render (sub-finding: disconnected from each other, Sections C/E/F)']);

        // B6. Editor. Deliberately ZERO Place Naming vocabulary — the
        // manual claim workflow is available to ANYONE regardless of
        // canEdit (see ui/components/PlaceNamingPanel.js's own header),
        // so it never needed an Editor-side surface; RegionFormModal
        // (Editor-reachable) governs WorldRegion.name, a completely
        // separate concept (Section G).
        const editorHits = await grepCount('PlaceNaming', ['ui/views/EditorView.js']);
        assert(editorHits === 0, 'B6. ui/views/EditorView.js carries zero Place Naming vocabulary — deliberate, per PlaceNamingClaim\'s own "no EDIT access required" design, not a missing surface.');
        register.push(['Editor', 'COMPLETE (deliberately absent) — Place Naming claims need no EDIT authority, so no Editor surface is missing']);

        // B7. Peer exchange. One real transport exists (file-based
        // PlaceNamingClaimExchange, 0.5.3) plus one real read-only
        // discovery transport (Nostr, 0.9.254). No WebRTC/live-peer
        // transport exists specifically for Place Naming — but 0.5.3's
        // own header already named this as future, additive work
        // ("every future transport... plugs into THIS class's
        // importClaim()/exportClaim()"), never a gap this milestone's
        // brief asks to close.
        const exchangeCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimExchange.js'));
        const nostrCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/RTCPeerConnection|new\s*WebRTC/i.test(exchangeCode) && !/RTCPeerConnection|new\s*WebRTC/i.test(nostrCode),
            'B7b. Neither Place Naming transport file actually CONSTRUCTS a WebRTC/peer connection in real code — both files only mention "WebRTC peer exchange" in prose, as named future work, never as a live transport. File exchange and Nostr discovery remain the only two ACTUAL transports.');
        register.push(['peer exchange', 'DEFERRED — file-exchange (0.5.3) and Nostr discovery (0.9.254) are the only transports; a live peer transport was named as future work at 0.5.3, never scheduled since']);

        // B8. Import/export. Wired for the MANUAL path only — Section F
        // proves the missing half is pure UI wiring, not missing
        // capability.
        const panel = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panel.includes("$emit('export-claim'") && panel.includes("$emit('import-claim'"),
            'B8. ui/components/PlaceNamingPanel.js wires both export-claim and import-claim for the manual path.');
        register.push(['import/export', 'COMPLETE for the manual path; NOT wired for a discovered claim (Section F: proven to be a UI-only gap, not a missing domain capability)']);

        assert(register.length === 8, 'B9. All eight areas this milestone\'s own brief names were swept.');
        console.log('✓ B: Repository-wide reachability sweep across core/application/storage/identity/World View/Editor/peer exchange/import-export — seven of eight areas COMPLETE outright, one (peer exchange beyond file+Nostr) DEFERRED as previously-named future work, never a newly discovered gap. The one interesting sub-finding — World View\'s two surfaces are individually complete but mutually disconnected — is examined in full in Sections C, E, and F.');

        console.log('\nCapability register (macro, composition-root level):');
        for (const [name, status] of register) {
            console.log(`    ${name.padEnd(32)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section C — Claim interaction: display / inspect / navigate /
    // select / copy-share, manual vs automatic, against real code.
    // ---------------------------------------------------------------
    {
        const panel = await rawSource('ui/components/PlaceNamingPanel.js');
        const worldView = await rawSource('ui/views/WorldView.js');

        const manualRow = [
            ['display', true, 'Community Names list + All Claims list'],
            ['inspect (author/date)', panel.includes('formatAuthor(claim.authorIdentityId)') && panel.includes('formatWhen(claim.createdAt)'), 'formatAuthor()/formatWhen() per claim'],
            ['navigate', false, 'N/A — opened already scoped to the region in view; no separate navigation needed'],
            ['select (prefer)', panel.includes("onPreferEntry(entry.name)") && panel.includes("$emit('set-preferred-name'"), 'Prefer this / Clear my preference'],
            ['copy/share (export)', panel.includes('onExportClaim(claimId)') && panel.includes("$emit('export-claim'"), 'Export button per claim'],
            ['import (adopt someone else\'s)', panel.includes('triggerImportClaim') && panel.includes("$emit('import-claim'"), 'Import Claim button']
        ];
        for (const [capability, present] of manualRow) {
            assert(present !== false || capability === 'navigate', `C1. manual PlaceNamingPanel capability "${capability}" reflects real source.`);
        }

        // C2. The automatic "Nearby Place Names" row — extracted verbatim
        // from ui/views/WorldView.js's own template block. UPDATED BY
        // 0.9.260 — Nearby Place Naming Claim Interaction: a "Navigate"
        // button now exists on this row, closing exactly the one verb
        // (navigate) this section originally found missing. select
        // (prefer) and copy/share (export) remain deliberately unbuilt —
        // this milestone's own brief drew the line at navigation alone.
        const nearbyBlock = worldView.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(nearbyBlock.includes('world-view-place-naming-row'), 'C2a. the discovered-claim row block was located.');

        const automaticRow = [
            ['display (name)', /\{\{\s*claim\.name\s*\}\}/.test(nearbyBlock)],
            ['display (author)', /claim\.authorDisplayName/.test(nearbyBlock)],
            ['display (position)', /claim\.position/.test(nearbyBlock)],
            ['navigate (button, matching every sibling Nearby section)', /<button/.test(nearbyBlock) && /navigateToNearbyPlaceNamingClaim/.test(nearbyBlock)],
            ['select (prefer)', /prefer/i.test(nearbyBlock)],
            ['copy/share (export)', /export/i.test(nearbyBlock)]
        ];
        assert(automaticRow[0][1] && automaticRow[1][1] && automaticRow[2][1],
            'C2b. the discovered-claim row DOES display name, author, and position — display is real.');
        assert(automaticRow[3][1], 'C2c. UPDATED BY 0.9.260 — the discovered-claim row now carries a real Navigate button, calling navigateToNearbyPlaceNamingClaim(), matching every OTHER Nearby section\'s (Places, Landmarks, People) own at-least-one-<button>-per-row pattern.');
        assert(!automaticRow[4][1] && !automaticRow[5][1],
            'C2d. select (prefer) and copy/share (export) remain absent from the automatic row — 0.9.260 deliberately scoped itself to navigation only; see this milestone\'s own docs/Roadmap.md entry.');

        // C3. Confirm the sibling sections' own buttons, so C2c's claim
        // ("every OTHER section has one") is proven, not merely asserted.
        const placesBlock = worldView.match(/<CollapsibleSection\s+title="Nearby Places"[\s\S]*?<\/CollapsibleSection>/)[0];
        const landmarksBlock = worldView.match(/<CollapsibleSection\s+title="Nearby Landmarks"[\s\S]*?<\/CollapsibleSection>/)[0];
        const peopleBlock = worldView.match(/<CollapsibleSection\s+title="Nearby People"[\s\S]*?<\/CollapsibleSection>/)[0];
        for (const [name, block] of [['Places', placesBlock], ['Landmarks', landmarksBlock], ['People', peopleBlock]]) {
            const buttonCount = (block.match(/<button/g) || []).length;
            assert(buttonCount >= 1, `C3. "Nearby ${name}" renders at least one <button> per row (found ${buttonCount} in its own block) — Place Naming\'s own row (C2c) now matches this pattern too, as of 0.9.260.`);
        }

        console.log('✓ C: Manual PlaceNamingPanel supports display, inspect, select (prefer), and copy/share (export/import) — five of six interaction verbs, missing only "navigate" because it is opened already scoped to its region. The automatic Nearby Place Names row now supports display AND navigate (0.9.260) — select (prefer) and copy/share (export) remain deliberately unbuilt, confirmed against real source, not merely against a header comment.');
    }

    // ---------------------------------------------------------------
    // Section D — Claim identity/provenance boundary: claim identity,
    // place/region identity, author identity, discovery source, and
    // spatial position, never conflating transport identity with naming
    // identity.
    // ---------------------------------------------------------------
    {
        // D1. The envelope's OWN validated shape carries claim identity
        // (claim.id), place identity (worldId/regionId, at BOTH the
        // envelope's own top level AND cross-validated against the
        // embedded claim), and author identity (claim.authorIdentityId)
        // — three genuinely distinct fields, never merged into one.
        const envelopeSource = await rawSource('core/PlaceNamingDiscoveryEnvelope.js');
        assert(envelopeSource.includes('claim.worldId !== worldId || claim.regionId !== regionId'),
            'D1a. core/PlaceNamingDiscoveryEnvelope.js cross-validates envelope-level worldId/regionId against the embedded claim\'s own copies — place identity is never taken on faith from either side alone.');
        assert(!/pubkey/.test(codeOnlyLines(envelopeSource)),
            'D1b. core/PlaceNamingDiscoveryEnvelope.js\'s own described/validated shape never mentions a transport-level "pubkey" field at all — only claim.authorIdentityId (a did:key) represents authorship.');

        // D2. Proof, not assertion: the real NostrPlaceNamingDiscoverySource
        // reads ONLY event.content (the payload string) off a Nostr event
        // — event.pubkey/event.sig/event.id (Nostr's own transport-level
        // identity/signature) are never read anywhere in this file.
        const nostrSource = await rawSource('application/NostrPlaceNamingDiscoverySource.js');
        assert(nostrSource.includes('event.content'), 'D2a. application/NostrPlaceNamingDiscoverySource.js reads event.content.');
        assert(!codeOnlyLines(nostrSource).includes('event.pubkey') && !codeOnlyLines(nostrSource).includes('event.sig'),
            'D2b. application/NostrPlaceNamingDiscoverySource.js never reads event.pubkey or event.sig — Nostr\'s own transport identity/signature never enters this pipeline at all, structurally preventing "who relayed this" from ever being confused with "who claims this."');

        // D3. Discovery source itself is not part of the claim's own
        // identity — a claim carries no field naming which source (Nostr,
        // a future peer, a future Arweave source) it was discovered
        // through, matching docs/Principles.md's own "a wider reach is
        // not a stronger claim."
        const claimSource = await rawSource('core/PlaceNamingClaim.js');
        assert(!/\bsourceId\b|\brelayUrl\b|\btransport\b/i.test(codeOnlyLines(claimSource)),
            'D3. core/PlaceNamingClaim.js carries no sourceId/relayUrl/transport field — discovery-source provenance is never folded into claim identity.');

        // D4. Spatial position is resolved and attached SEPARATELY from
        // the claim/envelope itself (PlaceNamingDiscoveryMonitor's own
        // _attachPositions()), never stored as part of a PlaceNamingClaim
        // or a discovery envelope — position is a presentation-time fact
        // about where a viewer currently is, not a property of the claim.
        assert(!/\bposition\b/.test(codeOnlyLines(claimSource)) && !/position/.test(codeOnlyLines(envelopeSource).replace(/positions?\b/gi, m => m)),
            'D4. Neither core/PlaceNamingClaim.js nor core/PlaceNamingDiscoveryEnvelope.js carries a position field — spatial position is attached downstream, by the monitor, never part of the claim\'s own signed identity.');

        // D5. The WorldView presentation layer itself keeps all five
        // facts (claim id, region/place id, author id, position) as
        // separate row fields — never a single collapsed "identity"
        // string a reader could mistake for one fact.
        const worldView = await rawSource('ui/views/WorldView.js');
        const rowMapping = worldView.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        assert(rowMapping.includes('claimId:') && rowMapping.includes('authorDisplayName:') && rowMapping.includes('position:'),
            'D5. nearbyPlaceNamingClaimRows keeps claimId, authorDisplayName, and position as distinct fields — presented identity is never collapsed into a single opaque string.');

        console.log('✓ D: Claim identity, place/region identity, author identity, discovery-source identity, and spatial position are five genuinely distinct concepts, enforced structurally (cross-validation, field-by-field checks) rather than merely documented, and transport identity (a Nostr event\'s own pubkey/sig) never enters the pipeline at all — proven by reading the real NostrPlaceNamingDiscoverySource.js source, not assumed from its own header.');
    }

    // ---------------------------------------------------------------
    // Section E — Existing Place Naming infrastructure sweep: every
    // entry point that already reaches the manual PlaceNamingPanel, and
    // the one new surface that reaches none of them.
    // ---------------------------------------------------------------
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const locationsPanel = await rawSource('ui/components/LocationsPanel.js');
        const geoPlacePanel = await rawSource('ui/components/GeographicPlacePanel.js');

        // E1. Three real, independent entry points into openNamingPanel(),
        // each already wired and each reusing the SAME panel — never a
        // second naming surface.
        assert(locationsPanel.includes("$emit('manage-names'"), 'E1a. ui/components/LocationsPanel.js exposes a real "Names" button emitting manage-names.');
        assert(geoPlacePanel.includes("$emit('open-names'"), 'E1b. ui/components/GeographicPlacePanel.js exposes a real "Names" button emitting open-names.');
        assert(worldView.includes('function openNamesFromFocusPanel') && worldView.includes('function openNamesFromPlace'),
            'E1c. ui/views/WorldView.js wires both a Focus-panel "Names" action and a Places-directory "Names" action, both ultimately calling the same openNamingPanel().');
        const openNamingPanelCallers = await grepCount('openNamingPanel(', ['ui/views/WorldView.js']);
        assert(openNamingPanelCallers === 1, `E1d. openNamingPanel() is defined/called within exactly one file (ui/views/WorldView.js, found in ${openNamingPanelCallers} file) — every entry point funnels into the SAME function, never a duplicate.`);

        // E2. UPDATED BY 0.9.260 — Nearby Place Naming Claim Interaction.
        // At the time this reassessment was written, zero entry points and
        // zero new code connected a discovered claim's own regionId to
        // ANY navigation or naming-panel action; regionId/worldId were
        // dropped by nearbyPlaceNamingClaimRows before ever reaching the
        // template (see the original finding preserved in Section I's own
        // history). 0.9.260 closed exactly that gap — restoring
        // regionId/worldId to the row and wiring a Navigate action through
        // the existing session.focusLocation() — while leaving
        // openNamingPanel() itself untouched: Navigate still never opens
        // the manual naming surface, and still never adopts/verifies/
        // prefers a name, so E2a's own boundary continues to hold exactly
        // as written.
        const nearbyBlock = worldView.match(/<!-- 0\.9\.257 — World View Place Naming Presentation\.[\s\S]*?<\/CollapsibleSection>/)[0];
        assert(!nearbyBlock.includes('openNamingPanel') && !nearbyBlock.includes('openNames'),
            'E2a. The Nearby Place Names block still never calls openNamingPanel()/openNames* — Navigate (0.9.260) reuses session.focusLocation(), never the manual naming surface.');
        const rowMapping = worldView.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        assert(rowMapping.includes('regionId') && rowMapping.includes('worldId'),
            'E2b. UPDATED BY 0.9.260 — nearbyPlaceNamingClaimRows now carries regionId/worldId through from the monitor\'s own entries, closing the gap this section originally found: the one piece of data a "go to this claim\'s region" action needed is no longer discarded before it reaches the template.');

        // E3. Confirm the data genuinely originates one layer down — the
        // real monitor's own envelope shape carries regionId/worldId at
        // the point nearbyPlaceNamingClaimRows reads from
        // (nearbyPlaceNamingClaims.value) — the same source 0.9.260's own
        // row mapping now forwards rather than discards.
        const parsed = parsePlaceNamingDiscoveryEnvelope(JSON.stringify({
            protocol: 'forkbuild-place-naming-discovery', version: 1, worldId: 'w1', regionId: 'r1',
            claim: {
                id: 'c1', worldId: 'w1', regionId: 'r1', name: 'Test', authorIdentityId: 'did:key:zTest', createdAt: '2026-01-01T00:00:00.000Z',
                signature: { algorithm: 'ed25519', signer: 'did:key:zTest', signature: 'sig', signedHash: 'hash', domain: 'forkbuild.place-naming-claim' }
            }
        }));
        assert(parsed && parsed.regionId === 'r1' && parsed.worldId === 'w1',
            'E3. A real, freshly-parsed discovery envelope genuinely carries regionId/worldId at its own top level — the exact fields E2b originally found missing from the presentation row, and which 0.9.260 now forwards through.');

        console.log('✓ E: Three independent, already-wired entry points (Locations panel, Geographic Place panel, Focus panel) all reach the SAME openNamingPanel() function, never a duplicate. The Nearby Place Names row still never wires into that manual surface — but as of 0.9.260 it no longer discards regionId/worldId, and now reuses session.focusLocation() directly for Navigate instead.');
    }

    // ---------------------------------------------------------------
    // Section F — Manual vs automatic workflow comparison, PROVEN rather
    // than asserted. The key question this milestone's own brief asks:
    // does automatic discovery merely expose claims, or is there already
    // a disconnected existing capability for acting on them?
    // ---------------------------------------------------------------
    {
        // F1. Build a claim exactly the way a real author would, signed
        // under a real identity — completely independent of the replica
        // that will attempt to import it below.
        const alice = makeIdentity('alice');
        let claim = new PlaceNamingClaim({ worldId: 'world-1', regionId: 'region-1', name: 'Riverside Landing', authorIdentityId: alice.identityId });
        claim = claim.withSignature(alice.signCanonical(claim.getSigningDescriptor()));

        // F2. Turn it into a discovery envelope EXACTLY the way a real
        // publishing source would (buildPlaceNamingDiscoveryEnvelope(),
        // 0.9.253, unmodified), then round-trip it through
        // parsePlaceNamingDiscoveryEnvelope() on a JSON string — EXACTLY
        // what application/NostrPlaceNamingDiscoverySource.js does with a
        // real relay event's own `.content` (see that file's own D2a
        // above). This is not a hand-built fixture; it is the identical
        // shape genuine discovery already produces.
        const built = buildPlaceNamingDiscoveryEnvelope(claim);
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        assert(tag === derivePlaceNamingDiscoveryTag(built.worldId, built.regionId), 'sanity: the envelope\'s own worldId/regionId round-trip through the real tag derivation.');
        const discovered = parsePlaceNamingDiscoveryEnvelope(JSON.stringify(built));
        assert(discovered !== null, 'F2. The real discovery envelope round-trips through the real parse function exactly as a genuine relay-delivered payload would.');

        // F3. THE PROOF. A totally independent replica — one that never
        // published this claim, never saw Alice's identity provider, and
        // has an empty store — reshapes ONLY the already-discovered
        // envelope's own `.claim` (never re-signed, never re-constructed,
        // never touched) into the EXACT publication-package shape
        // application/PlaceNamingClaimPublication.js#buildPlaceNamingClaimPublication()
        // already defines, and hands it to the REAL, UNMODIFIED
        // PlaceNamingClaimExchange#importClaim() — the exact same method
        // ui/components/PlaceNamingPanel.js's own "Import Claim" button
        // already calls today for a hand-exported file.
        const bob = makeReplica();
        const reshapedPackage = {
            kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            claim: discovered.claim
        };
        const { claim: importedClaim, isNew } = bob.exchange.importClaim(reshapedPackage);

        assert(isNew === true, 'F3a. The reshaped discovered claim is accepted as new by the real, unmodified importClaim() — no code in that method needed to change, and none did.');
        assert(importedClaim.name === 'Riverside Landing' && importedClaim.authorIdentityId === alice.identityId,
            'F3b. The imported claim carries the exact name and author identity Alice originally signed — nothing was lost or altered by having passed through the discovery envelope shape first.');
        assert(bob.store.has('world-1', claim.id), 'F3c. Bob\'s own, completely independent LocalPlaceNamingClaimStore now genuinely holds the claim — real persistence, not a simulated one.');

        // F4. And the SAME verifier that already guards manual import
        // guards this path too — a forged discovered claim is rejected
        // exactly as a forged manual import already is (0.9.253's own
        // "discovery answers what exists, never what is true" — this
        // proves the reverse holds too: adoption still answers "is this
        // authentic," regardless of which door the bytes came through).
        const forger = makeIdentity('forger');
        let forgedClaim = new PlaceNamingClaim({ worldId: 'world-1', regionId: 'region-1', name: 'Fake Name', authorIdentityId: alice.identityId });
        forgedClaim = forgedClaim.withSignature(forger.signCanonical(forgedClaim.getSigningDescriptor()));
        const forgedEnvelope = buildPlaceNamingDiscoveryEnvelope(forgedClaim);
        const discoveredForgery = parsePlaceNamingDiscoveryEnvelope(JSON.stringify(forgedEnvelope));
        assert(discoveredForgery !== null, 'sanity: the forged envelope is still well-formed enough to discover (shape-only validation, per 0.9.253).');
        let threw = false;
        try {
            bob.exchange.importClaim({ kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, schemaVersion: CURRENT_SCHEMA_VERSION, claim: discoveredForgery.claim });
        } catch { threw = true; }
        assert(threw, 'F4. The identical adoption path REJECTS a forged discovered claim (signer !== authorIdentityId) exactly as it already rejects a forged manual import — adoption is not a new trust decision, it is the SAME one, reachable from a new starting point.');

        // F5. Confirm this reuse-path requires ZERO new production code —
        // every symbol Section F called is either already exported by an
        // existing, unmodified module, or a plain object literal built
        // from that module's own already-exported constants.
        assert(typeof buildPlaceNamingDiscoveryEnvelope === 'function' && typeof parsePlaceNamingDiscoveryEnvelope === 'function'
            && typeof PLACE_NAMING_CLAIM_PUBLICATION_KIND === 'string' && typeof CURRENT_SCHEMA_VERSION === 'number',
            'F5. Every collaborator this proof used already exists, exported, unmodified — connecting them is the entire missing piece.');

        console.log('✓ F: PROVEN, not asserted — a claim discovered through the exact real envelope shape genuine Nostr discovery produces can be adopted by a totally independent replica through the exact real, unmodified PlaceNamingClaimExchange#importClaim() already wired to the manual "Import Claim" button, with zero new production code (F5), preserving name/author fidelity (F3b), genuinely persisting (F3c), and still rejecting a forgery through the SAME verifier a manual import already uses (F4). "Adoption" is not a MISSING_DOMAIN_CAPABILITY — it is a REACHABLE_BUT_INTERNAL capability, one small, additive, reuse-only UI action away from being wired to a discovered claim, exactly the shape of gap this reassessment lineage has repeatedly found before (0.9.250 Section D "detail surface," 0.9.252 Section D "inspection surface").');
    }

    // ---------------------------------------------------------------
    // Section G — World-location naming boundary: already explicitly
    // frozen. Reconfirmed against real code, not merely restated from
    // docs/Principles.md's own header.
    // ---------------------------------------------------------------
    {
        const worldRegionSource = await rawSource('core/WorldRegion.js');
        assert(/\bname\b/.test(worldRegionSource), 'G1. core/WorldRegion.js still carries its own name field — World content, exactly as 0.5.0 left it.');

        const claimSource = await rawSource('core/PlaceNamingClaim.js');
        assert(claimSource.includes('never stored inside `World#toJSON()`') || claimSource.includes('never travels through a Command'),
            'G2. core/PlaceNamingClaim.js\'s own header still states the frozen boundary: a claim carries a regionId it refers to, but is never World content.');

        // G3. Structural proof: PlaceNamingClaim never imports World.js/
        // WorldRegion.js at all — it cannot mutate what it has no
        // reference to.
        assert(!codeOnlyLines(claimSource).includes("from './World.js'") && !codeOnlyLines(claimSource).includes("from './WorldRegion.js'"),
            'G3. core/PlaceNamingClaim.js imports neither World.js nor WorldRegion.js — structurally incapable of mutating either.');

        // G4. The command propagation path that DOES mutate a
        // WorldRegion's own name (RegionFormModal -> a World Command)
        // never imports anything Place-Naming-shaped.
        const commandPropagation = await rawSource('application/WorldCommandPropagationUseCase.js');
        assert(!/PlaceNaming/.test(commandPropagation), 'G4. application/WorldCommandPropagationUseCase.js — the real path that DOES propagate a WorldRegion rename — carries zero Place Naming vocabulary.');

        console.log('✓ G: The World-location-naming vs. decentralized-naming-claim boundary docs/Principles.md already names ("A Name Is A Claim, Not A Fact," 0.5.2) is frozen — reconfirmed structurally (no import path exists in either direction) rather than merely quoted. Per this milestone\'s own brief: this boundary already exists, so nothing about it is created here.');
    }

    // ---------------------------------------------------------------
    // Section H — The particularly important negative audit: no path
    // from a nearby claim to a WorldRegion's own current name, anywhere
    // in the pipeline or its presentation.
    // ---------------------------------------------------------------
    {
        const pipelineFiles = [
            'application/PlaceNamingDiscoveryMonitor.js',
            'application/PlaceNamingDiscoveryQueryService.js',
            'application/DiscoverPlaceNamingClaimsCommand.js',
            'application/NostrPlaceNamingDiscoverySource.js',
            'application/PlaceNamingDiscoveryRuntimeComposition.js',
            'core/PlaceNamingProximitySelection.js',
            'core/PlaceNamingDiscoveryEnvelope.js'
        ];
        const renameVocabulary = ['updateRegion(', 'renameRegion(', 'setWorldRegion(', 'region.name =', '.name = claim', 'WorldCommandPropagationUseCase'];
        for (const file of pipelineFiles) {
            const code = await codeOnlyLines(await rawSource(file));
            for (const term of renameVocabulary) {
                assert(!code.includes(term), `H1. ${file} never contains '${term}' — no path from discovery/proximity to a WorldRegion rename.`);
            }
        }

        // H2. The presentation layer itself: nearbyPlaceNamingClaimRows'
        // own computed never reads or writes worldLocations/session state
        // that could feed a region's own name — it is a pure, one-way
        // map FROM the monitor's own lastResult, nothing else.
        //
        // UPDATED at 0.9.269 — Nearby Place Naming Claim Adoption Status
        // Indicator: this computed now ALSO reads
        // session.hasPlaceNamingClaim(worldId, claimId) per row, a
        // deliberate, read-only existence query (see that method's own
        // header) with no path to a WorldRegion rename whatsoever — it
        // never touches worldLocations, never calls any WorldRegion
        // mutator, and returns only a boolean. The regex below is
        // narrowed to still forbid worldLocations and any OTHER session
        // access, so the real invariant this section is named for ("no
        // path from a nearby claim to a WorldRegion's own current name")
        // remains exactly as strictly enforced as before — only the one
        // specific, audited, read-only call this milestone added is
        // exempted by name, never session access in general.
        const worldView = await rawSource('ui/views/WorldView.js');
        const rowMapping = worldView.match(/const nearbyPlaceNamingClaimRows = computed\(\(\) => \([\s\S]*?\)\);/)[0];
        const rowMappingWithoutStatusCheck = rowMapping.replace(/session\.hasPlaceNamingClaim\(entry\.claim\.worldId,\s*entry\.claim\.id\)/, '');
        assert(!/worldLocations|session\./.test(rowMappingWithoutStatusCheck),
            'H2. UPDATED at 0.9.269 — nearbyPlaceNamingClaimRows reads only nearbyPlaceNamingClaims.value, plus the one audited, read-only session.hasPlaceNamingClaim() existence query this milestone added — never worldLocations, and no OTHER session access of any kind.');
        assert(rowMapping.includes('session.hasPlaceNamingClaim(entry.claim.worldId, entry.claim.id)'),
            'H2b. sanity: the exempted call is genuinely present, exactly as named — this is not a vacuously-passing regex.');

        // H3. Live, behavioral proof (not merely static grep): running
        // the real monitor against a real region whose OWN `.name`
        // getter is observed, then asserting that discovering and
        // presenting a claim for that region never touches it — mirrors
        // 0.9.258's own Section N assertion 38, re-verified fresh here as
        // this milestone's own explicitly-requested negative audit.
        const region = { id: 'region-1', worldId: 'world-1', position: { x: 0, z: 0 }, _name: 'Willow Village', get name() { return this._name; }, set name(v) { this._name = v; } };
        const nostrSourceStub = new (class {
            search() {
                return Promise.resolve([{
                    protocol: 'forkbuild-place-naming-discovery', version: 1, worldId: 'world-1', regionId: 'region-1',
                    claim: {
                        id: 'claim-1', worldId: 'world-1', regionId: 'region-1', name: 'Riverbend', authorIdentityId: 'did:key:zBob', createdAt: '2026-01-01T00:00:00.000Z',
                        signature: { algorithm: 'ed25519', signer: 'did:key:zBob', signature: 'sig', signedHash: 'hash', domain: 'forkbuild.place-naming-claim' }
                    }
                }]);
            }
        })();
        const { PlaceNamingDiscoveryMonitor } = await import('../application/PlaceNamingDiscoveryMonitor.js');
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => nostrSourceStub.search(),
            resolveClaimPosition: () => region.position
        });
        await monitor.observe({ x: 0, z: 0 });
        assert(monitor.lastResult && monitor.lastResult.length === 1 && monitor.lastResult[0].claim.name === 'Riverbend',
            'H3a. sanity: the claim was genuinely discovered and selected as nearby.');
        assert(region.name === 'Willow Village', 'H3b. THE NEGATIVE AUDIT: region.name — the WorldRegion\'s own authoritative name — was never touched by discovering, selecting, or (per Section H2) presenting a nearby claim naming that exact region something else entirely.');

        console.log('✓ H: No path exists — statically (H1, across every pipeline file) or behaviorally (H3, running the real monitor against an observed region.name setter) — from a nearby claim to a WorldRegion\'s own current name. "Riverbend" is discovered, selected as nearby, and would be presented; "Willow Village" remains region.name throughout. The one relationship this milestone\'s brief explicitly asked never to exist does not exist.');
    }

    // ---------------------------------------------------------------
    // Section I — Missing UI gaps found, itemized and classified.
    //
    // UPDATED BY 0.9.260 — Nearby Place Naming Claim Interaction: the
    // "navigate" gap this section originally itemized here (restoring
    // regionId/worldId to nearbyPlaceNamingClaimRows plus a Go/Info
    // button) has since been built — see Sections C/E, above. It is
    // removed from this register rather than left asserting a gap that
    // no longer exists; the three remaining findings are unchanged.
    // ---------------------------------------------------------------
    {
        const gaps = [];
        gaps.push({
            name: 'adopt (import) a discovered claim',
            classification: 'MISSING_UI',
            evidence: 'Section F. Proven end to end: reshaping entry.claim into a publication package and calling the existing session.importPlaceNamingClaim() already works, verifies, and persists, with zero production code changes. Requires one button plus the package-reshaping call.'
        });
        gaps.push({
            name: 'set a local preference for a discovered claim\'s name',
            classification: 'MISSING_UI',
            evidence: 'application/LocalNamePreferenceStore.js#setPreferredName(worldId, regionId, name) (existing, unmodified) takes a plain name string and needs no prior adoption — it already works today for any regionId this replica knows a WorldRegion for. regionId is no longer dropped from the row as of 0.9.260 (the same fix that closed the navigate gap); only a "Prefer" button and its click handler remain unbuilt.'
        });
        gaps.push({
            name: 'export/share a discovered claim before adopting it',
            classification: 'MISSING_UI (smaller, optional)',
            evidence: 'application/PlaceNamingClaimPublication.js#buildPlaceNamingClaimPublication() requires a real PlaceNamingClaim instance (Section F1), so exporting a merely-discovered plain envelope needs either PlaceNamingClaim.fromJSON(entry.claim) first (already exported, unmodified) or exporting the raw envelope.claim object directly, matching the exact shape Section F already proved importable elsewhere. Lower priority than the two above — a claim worth sharing is presumably worth adopting first.'
        });

        for (const gap of gaps) {
            assert(gap.classification.startsWith('MISSING_UI'), `I1. "${gap.name}" is classified MISSING_UI, never MISSING_DOMAIN_CAPABILITY — every collaborator it would need already exists, exported, unmodified.`);
        }
        assert(gaps.length === 3, 'I2. Three concrete MISSING_UI gaps remain itemized, each independently evidenced above — navigate (originally a fourth) was closed by 0.9.260.');

        console.log('✓ I: Three MISSING_UI gaps remain, each independently evidenced against real code, each requiring zero new domain capability — adopt, set-preference, and (lower priority) export-before-adopt. (navigate, originally itemized here, was closed by 0.9.260.)');
        console.log('\nMissing-UI register:');
        for (const gap of gaps) {
            console.log(`    ${gap.name.padEnd(46)} ${gap.classification}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section J — Missing domain capabilities reconfirmed: still
    // deliberately absent, unchanged.
    // ---------------------------------------------------------------
    {
        const candidates = [];

        // J1. Verification-trigger UI — a button that calls
        // verifyPlaceNamingClaim() directly from World View, surfacing a
        // valid/invalid indicator per claim WITHOUT also committing it.
        // Genuinely absent: every real call site (excluding comments) is
        // itself part of a MUTATING operation — publish() verifying its
        // own freshly-signed claim before storing it
        // (PlaceNamingClaimUseCase.js), the generic publication-kind
        // registry's own verify hook (PlaceNamingClaimPublicationKind.js),
        // and importClaim()'s own all-or-nothing gate
        // (PlaceNamingClaimExchange.js) — never a standalone,
        // inspectable "just check, don't commit" use case, and never
        // called from ui/ directly (the session always mediates).
        const verifierCallSitesByFile = new Map();
        for (const file of [
            'application/PlaceNamingClaimUseCase.js',
            'application/PlaceNamingClaimPublicationKind.js',
            'application/PlaceNamingClaimExchange.js'
        ]) {
            const code = codeOnlyLines(await rawSource(file));
            const matches = code.match(/verifyPlaceNamingClaim\(/g) || [];
            verifierCallSitesByFile.set(file, matches.length);
        }
        assert(Array.from(verifierCallSitesByFile.values()).every((count) => count === 1),
            'J1a. Each of the three real (non-comment) call sites invokes verifyPlaceNamingClaim() exactly once, each as part of a mutating operation (publish/kind-registry-verify/import), never twice (once to check, once to commit).');
        const uiVerifyHits = await grepCount('verifyPlaceNamingClaim(', ['ui']);
        assert(uiVerifyHits === 0, 'J1b. No ui/ file calls verifyPlaceNamingClaim() directly — a check-only UI action would need a new use case, not merely new wiring, since every existing caller also mutates state.');
        candidates.push(['verification-trigger UI (check without adopting)', 'MISSING_DOMAIN_CAPABILITY']);

        // J2. Competing-name handling. core/PlaceNamingView.js already
        // RANKS competing names (rankClaimsByName) but nothing lets a
        // viewer flag, merge, or otherwise resolve two competing claims
        // beyond independently preferring one locally.
        const viewSource = await rawSource('core/PlaceNamingView.js');
        assert(!/merge|resolveConflict|flagCompeting/i.test(codeOnlyLines(viewSource)),
            'J2. core/PlaceNamingView.js carries no merge/resolveConflict/flagCompeting vocabulary — competing names are only ever ranked, never resolved.');
        candidates.push(['competing-name handling (beyond ranking + local preference)', 'MISSING_DOMAIN_CAPABILITY (deliberate — see docs/Principles.md, "Proximity Filtering Is Not Ranking, Is Not Conflict Resolution")']);

        // J3. Moderation. No removal/tombstone/report vocabulary anywhere
        // in the Place Naming domain or storage layer.
        const claimSource = await rawSource('core/PlaceNamingClaim.js');
        const storeSource = await rawSource('application/LocalPlaceNamingClaimStore.js');
        assert(!/moderat|tombstone|report(?:ed)?\(|flag(?:ged)?\(/i.test(codeOnlyLines(claimSource) + codeOnlyLines(storeSource)),
            'J3. Neither the domain nor the store carries moderation/tombstone/report/flag vocabulary — still genuinely absent.');
        candidates.push(['moderation/reporting', 'MISSING_DOMAIN_CAPABILITY']);

        // J4. Notifications — the standing gap this reassessment lineage
        // has named at 0.9.221, 0.9.241, 0.9.250, and 0.9.252, still
        // genuinely absent codebase-wide.
        const notificationHits = await grepCount('class .*Notification\\|NotificationUseCase\\|NotificationService', ['application', 'core', 'ui'], { ignoreCase: true });
        assert(notificationHits === 0, 'J4. No Notification class/use case/service exists anywhere — still genuinely absent.');
        candidates.push(['notifications (e.g. "a new claim appeared for a place you\'ve preferred")', 'MISSING_DOMAIN_CAPABILITY (standing gap, unchanged since 0.9.221)']);

        assert(candidates.length === 4, 'J5. All four domain-level candidates this milestone\'s own brief names by name were reassessed individually.');

        console.log('✓ J: Verification-trigger UI, competing-name handling beyond ranking, moderation, and notifications all remain MISSING_DOMAIN_CAPABILITY, reconfirmed against real code. None of these — unlike Section I\'s four findings — can be built from already-exported, unmodified collaborators alone; each would need genuinely new domain logic.');

        console.log('\nDomain-level candidate register:');
        for (const [name, status] of candidates) {
            console.log(`    ${name.padEnd(56)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section K — Obsolete/duplicate candidate check: none found.
    // ---------------------------------------------------------------
    {
        // K1. The file-exchange transport (0.5.3) and the Nostr discovery
        // transport (0.9.254) are complementary, not competing: file
        // exchange is bidirectional (export AND import) and requires a
        // deliberate hand-off; Nostr discovery is read-only (this
        // codebase never publishes TO Nostr, only queries) and automatic.
        const nostrSource = await rawSource('application/NostrPlaceNamingDiscoverySource.js');
        assert(!/publish|announce/i.test(codeOnlyLines(nostrSource).replace(/\/\/.*$/gm, '')) || nostrSource.includes('Publishing, tagging, or signing a Nostr event'),
            'K1. application/NostrPlaceNamingDiscoverySource.js is explicitly read-only (its own header excludes publishing) — it does not duplicate PlaceNamingClaimExchange\'s own export half, it only duplicates (deliberately) the DISCOVERY half exchange never had.');

        // K2. PlaceNamingDiscoveryMonitor (0.9.256) vs
        // WorldSnapshotDiscoveryMonitor (0.9.186) — already explicitly
        // NOT a shared abstraction, per that file's own header, and still
        // true: neither imports the other.
        const monitorSource = await rawSource('application/PlaceNamingDiscoveryMonitor.js');
        assert(!monitorSource.includes("from './WorldSnapshotDiscoveryMonitor.js'"),
            'K2. application/PlaceNamingDiscoveryMonitor.js still does not import WorldSnapshotDiscoveryMonitor.js — the deliberate non-reuse this file\'s own header argues for still holds one milestone later.');

        // K3. No second naming-claims store, naming-preference store, or
        // naming panel exists anywhere in the repository.
        const duplicateStoreHits = await grepCount('class.*PlaceNaming.*Store\\|class.*NamePreference', ['application'], { ignoreCase: true });
        assert(duplicateStoreHits <= 2, `K3. At most the two expected store classes (LocalPlaceNamingClaimStore, LocalNamePreferenceStore) exist (found in ${duplicateStoreHits} files) — no duplicate.`);
        const duplicatePanelHits = await grepCount("name: 'PlaceNamingPanel'\\|name: 'NamingPanel'", ['ui/components'], { ignoreCase: true });
        assert(duplicatePanelHits === 1, `K3b. Exactly one component DEFINES itself as a naming panel (found ${duplicatePanelHits}) — the several other files that merely IMPORT or REFERENCE PlaceNamingPanel (LocationsPanel.js, GeographicPlacePanel.js, StructureInfoPanel.js) are not duplicates.`);

        console.log('✓ K: No obsolete or duplicate implementation found. The two transports are complementary by design (bidirectional/deliberate vs. read-only/automatic); the two discovery monitors remain deliberately separate, non-reusing abstractions; exactly one store/preference pair and one naming panel exist.');
    }

    // ---------------------------------------------------------------
    // Section L — Candidate ranking, as reassessed at 0.9.259.
    //
    // UPDATED BY 0.9.260: candidate 1 (navigate) named here has since
    // been BUILT — see Sections C/E/I, above. The register below is kept
    // as the historical ranking this milestone actually produced (nothing
    // else was selected or built at 0.9.259); only the length assertion
    // is relaxed to acknowledge candidate 1's resolution rather than
    // asserting a stale "nothing built yet" over it.
    // ---------------------------------------------------------------
    {
        const ranked = [
            '1. Navigate to a discovered claim\'s region — restore regionId to nearbyPlaceNamingClaimRows and add Info/Go buttons, matching the exact pattern every sibling Nearby section already uses. Zero new domain capability (Section I). BUILT at 0.9.260.',
            '2. Adopt a discovered claim — an "Adopt" button reshaping entry.claim into a publication package and calling the existing session.importPlaceNamingClaim(). PROVEN end to end with zero production changes (Section F). The most evidence-backed candidate this milestone found.',
            '3. Set a local preference for a discovered claim\'s name — reuses setPreferredPlaceName(regionId, name) once regionId is restored (candidate 1\'s own prerequisite, satisfied as of 0.9.260).',
            '4. Export/share a discovered claim before adopting — smaller, lower-priority; needs one extra construction step (PlaceNamingClaim.fromJSON) that candidates 1-3 do not.',
            '5. Verification-trigger UI (check without adopting) — MISSING_DOMAIN_CAPABILITY, would need a new, narrower entry point into verifyPlaceNamingClaim() that does not also import.',
            '6. Notifications — the standing gap named at 0.9.221/0.9.241/0.9.250/0.9.252, unchanged, genuinely absent codebase-wide.',
            '7. Competing-name handling beyond ranking, and moderation/reporting — both MISSING_DOMAIN_CAPABILITY, both deliberately deferred per existing docs/Principles.md entries.'
        ];
        assert(ranked.length === 7, 'L1. Seven candidates were ranked at 0.9.259, spanning both this milestone\'s own MISSING_UI findings and its reconfirmed MISSING_DOMAIN_CAPABILITY findings — candidate 1 has since been built (0.9.260), the other six stand exactly as ranked.');
        assert(ranked[0].includes('BUILT at 0.9.260'), 'L2. The ranking record itself is annotated, not silently rewritten, to reflect candidate 1\'s resolution.');
        console.log('✓ L: Seven candidates were ranked by evidence strength and implementation size at 0.9.259; candidate 1 (navigate) has since been built at 0.9.260 — per the exact restraint 0.9.221/0.9.241/0.9.250/0.9.252 already established for this recurring milestone shape, nothing else was selected or built here.');
    }

    // ---------------------------------------------------------------
    // Section M — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.259 — Post-Place-Naming Product Reassessment — Verdict\n' +
'\n' +
'PLACE NAMING PIPELINE (0.9.253-0.9.258)\n' +
'    COMPLETE, unchanged (Section A)\n' +
'\n' +
'REPOSITORY-WIDE REACHABILITY (core/application/storage/identity/World\n' +
'View/Editor/peer exchange/import-export)\n' +
'    Seven of eight areas COMPLETE outright; peer exchange DEFERRED as\n' +
'    previously-named future work (file + Nostr transports only, never a\n' +
'    newly discovered gap) (Section B)\n' +
'\n' +
'CLAIM INTERACTION (display/inspect/navigate/select/copy-share)\n' +
'    Manual PlaceNamingPanel: five of six verbs present (all but\n' +
'    navigate, which its own entry pattern makes unnecessary).\n' +
'    Automatic Nearby Place Names row: DISPLAY + NAVIGATE as of 0.9.260 —\n' +
'    select (prefer) and copy/share (export) remain unbuilt (Section C)\n' +
'\n' +
'CLAIM IDENTITY/PROVENANCE BOUNDARY\n' +
'    Claim identity, place identity, author identity, discovery-source\n' +
'    identity, and spatial position remain five distinct, structurally\n' +
'    enforced concepts. Transport identity (a Nostr event\'s own pubkey)\n' +
'    never enters the pipeline (Section D)\n' +
'\n' +
'MANUAL vs. AUTOMATIC WORKFLOW — THE CENTRAL FINDING\n' +
'    Automatic discovery does not merely expose claims with nothing to\n' +
'    do with them — a genuinely disconnected capability for ACTING on\n' +
'    them already exists and was PROVEN reachable with zero production\n' +
'    changes: a discovered claim, reshaped into the existing publication-\n' +
'    package format, is accepted by the real, unmodified\n' +
'    PlaceNamingClaimExchange#importClaim() already wired to the manual\n' +
'    "Import Claim" button (Section F)\n' +
'\n' +
'WORLD-LOCATION NAMING BOUNDARY\n' +
'    Already frozen (docs/Principles.md, 0.5.2); reconfirmed structurally\n' +
'    rather than assumed (Section G)\n' +
'\n' +
'NEGATIVE AUDIT: nearby claim -> current World location name\n' +
'    NO SUCH PATH EXISTS — statically (every pipeline file) and\n' +
'    behaviorally (a live region.name observed across a full discover-\n' +
'    select-present cycle) (Section H)\n' +
'\n' +
'MISSING_UI (three remain, each requiring zero new domain capability;\n' +
'a fourth — navigate — was closed by 0.9.260)\n' +
'    1. adopt (import) a discovered claim — PROVEN end to end\n' +
'    2. set a local preference for a discovered claim\'s name\n' +
'    3. export/share a discovered claim before adopting (smaller)\n' +
'\n' +
'MISSING_DOMAIN_CAPABILITY (four, reconfirmed, unchanged)\n' +
'    verification-trigger UI (check without adopting)\n' +
'    competing-name handling beyond ranking (deliberate)\n' +
'    moderation/reporting\n' +
'    notifications (standing gap since 0.9.221)\n' +
'\n' +
'OBSOLETE/DUPLICATE CANDIDATES\n' +
'    None found (Section K)\n' +
'\n' +
'RANKED CANDIDATES (as ranked at 0.9.259; candidate 1 built at 0.9.260)\n' +
'    1. Navigate to a discovered claim\'s region — BUILT (0.9.260)\n' +
'    2. Adopt a discovered claim — most evidence-backed, proven viable\n' +
'    3. Set a local preference for a discovered claim\'s name\n' +
'    4. Export/share a discovered claim before adopting\n' +
'    5. Verification-trigger UI\n' +
'    6. Notifications\n' +
'    7. Competing-name handling / moderation\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected here. Per this milestone\'s own brief: the evidence is\n' +
'    gathered and classified; choosing and building one candidate is a\n' +
'    separate, later, evidence-driven decision. The important negative\n' +
'    result mirrors 0.9.250/0.9.252\'s own: every genuine gap this\n' +
'    milestone found is about REACHING or CONNECTING already-built\n' +
'    capability (Sections I, F), never about extending the Place Naming\n' +
'    domain itself (Section J\'s four candidates are real, but none of\n' +
'    them is where the strongest evidence points).\n');

        console.log('✓ Section M: Verdict recorded. The Place Naming pipeline remains COMPLETE and unchanged (Section A); repository-wide reachability holds across seven of eight named areas, with peer exchange deliberately deferred (Section B); claim interaction was asymmetric at 0.9.259 — five of six verbs on the manual surface, display-only on the automatic one — and, as of 0.9.260, the automatic row also carries Navigate (Section C); the identity/provenance boundary remains structurally enforced (Section D); the manual/automatic comparison this milestone\'s own brief asked for produced a PROVEN, not merely asserted, central finding — adoption of a discovered claim already works end to end through existing, unmodified code (Section F); the World-location-naming boundary is confirmed frozen (Section G); the explicitly-requested negative audit found no path from a nearby claim to a WorldRegion\'s own name, anywhere (Section H). Four MISSING_UI and four MISSING_DOMAIN_CAPABILITY findings were itemized and ranked at 0.9.259 (Sections I, J, L); one MISSING_UI finding (navigate) has since been built at 0.9.260, leaving three, with no obsolete/duplicate implementation found (Section K). No implementation happened in this milestone (0.9.259) itself.');
    }

    console.log('\n✅ All PostPlaceNamingProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostPlaceNamingProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlaceNamingProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
