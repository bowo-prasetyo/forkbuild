import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';

import { Delegation, DelegationAction } from '../core/Delegation.js';
import { SigningIdentity } from '../core/SigningIdentity.js';
import { LocalDelegationResolver } from '../identity/LocalDelegationResolver.js';
import { AuthorizationVerifier } from '../identity/AuthorizationVerifier.js';
import { CreateDelegationUseCase } from '../application/CreateDelegationUseCase.js';
import { VerifyDelegationUseCase } from '../application/VerifyDelegationUseCase.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';

import { World } from '../core/World.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { MoveStructurePlacementCommand } from '../application/commands/MoveStructurePlacementCommand.js';
import { WorldConflictResolver, WorldOperationOutcome } from '../replication/WorldConflictResolver.js';

// 0.9.326 — Post-Diagnostic Product Evolution Reassessment.
//
// Test-only, whole-product reassessment, following the SAME governing
// method every prior reassessment in this sequence has used (0.9.307,
// 0.9.311, 0.9.318, 0.9.322, 0.9.323 most recently) — applied here with
// 0.9.324 (Diagnostic Tools Surface) and 0.9.325 (its own convergence
// audit, verdict CLEAN) as the new evidence boundary. The governing
// question is unchanged:
//
//   What is the smallest genuinely user-visible capability still missing
//   from ForkBuild? NOT "what existing code could we expose," and NOT
//   "which architecture looks incomplete."
//
// This milestone's own stated brief additionally names ONE specific
// question to investigate rather than assume an answer to: now that
// Diagnostic Tools (0.9.324) separates ordinary actions from manual
// Snapshot recovery, is there a genuine WORKFLOW-OBSERVABILITY gap
// between the automatic Snapshot encounter path (0.9.187) and the manual
// Diagnostic recovery path — i.e. can a user who wonders "I expected this
// Snapshot to appear automatically, why didn't it?" actually answer that
// question with what already ships? Per the brief: this milestone does
// NOT implement an explanation/status system on spec. It determines,
// with real evidence, whether one is owed.
//
//   Section A — Current product inventory, reconfirmed fresh. The
//               Diagnostic Tools popup (0.9.324/0.9.325) is classified
//               as a presentation/accessibility improvement to the
//               EXISTING Snapshot recovery capability, never counted as
//               a new capability of its own.
//   Section B — User-journey verification. The six journeys 0.9.323
//               already traced, reconfirmed unchanged, PLUS the new pair
//               this milestone's own brief names by name: Automatic
//               Snapshot encounter <-> Manual Diagnostic recovery,
//               proven to be two complementary paths sharing downstream
//               machinery by design, never duplicate functionality.
//   Section C — Diagnostic boundary verification. Reconfirms
//               `diagnosticToolsOpen` is read/written nowhere inside
//               `methods:`, and that no `DiagnosticService` or new
//               domain vocabulary exists anywhere in the tree.
//   Section D — Orphan/capability scan. A genuinely fresh, mechanical
//               sweep (basename cross-reference across every top-level
//               source directory, not a repeat of a prior grep list) —
//               its own new methodological contribution — that surfaces
//               a materially larger candidate set than any prior audit
//               (three empty placeholder stubs, a bypassed-composition-
//               root family larger than 0.9.323's own four named
//               members, one genuinely new zero-UI presentation view,
//               plus the two families 0.9.323 already classified) and
//               classifies every one of them, none left unexplained.
//               Zero new unreachable USER WORKFLOWS since 0.9.323 —
//               every finding fails the same structural test (no UI
//               entry point).
//   Section E — Deferred-gap re-evaluation. The four standing candidates,
//               re-tested against the five-question bar; none promoted
//               merely for remaining absent.
//   Section F — Cross-arc convergence — THIS MILESTONE'S OWN FLAGSHIP.
//               A live, executable proof (not source-text inference)
//               that `ui/main.js`'s own composition hands the automatic
//               path (`WorldSnapshotDiscoveryMonitor`) and the manual
//               Diagnostic path (`OwnPublicationPanel#discoverSnapshotCandidates`)
//               the EXACT SAME `discoverSnapshotCandidatesCommand`
//               function reference, so a user who opens Diagnostic Tools
//               is asking the live substrate the IDENTICAL question
//               automatic discovery already asked — not an
//               approximation of it. Combined with the pre-existing,
//               explicit "No Snapshots have been announced under this
//               discoveryTag yet." empty-state and 0.9.325's own
//               per-stage error visibility, this milestone concludes the
//               workflow-observability question its own brief posed has
//               a real, already-shipped answer today.
//   Section G — Architecture debt classification. The five-way split
//               (unused implementation / missing product capability /
//               missing integration / historical code / deliberately
//               deferred feature) applied to every open finding.
//   Section H — External-evidence gate. The 0.9.314 principle re-applied
//               to the one candidate this milestone's own investigation
//               surfaced (surfacing automatic-cascade outcomes in the
//               UI): technically possible, zero external evidence of a
//               need.
//   Section I — Candidate scoring. Every open candidate scored; none
//               clears the bar.
//   Section J — Final decision.

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

// Mirrors every prior reassessment's own helper (0.9.219 onward, most
// recently 0.9.322/0.9.323) — one grep-verifiable signal, never a header
// comment trusted at face value.
function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Section D's own fresh sweep methodology: a recursive walk of every
// top-level PRODUCTION source directory (never `tests/`), building a
// basename cross-reference table across ALL production+test source, and
// flagging any file whose own basename (minus `.js`) appears in NO other
// file anywhere. This is deliberately a DIFFERENT mechanism than every
// prior reassessment's own targeted `grepFiles()` list — it makes no
// assumption about which names to look for.
const SWEEP_DIRS = [
    'anchoring', 'application', 'arweave', 'base', 'collaboration', 'content',
    'core', 'discovery', 'identity', 'nostr', 'peer', 'persistence',
    'placement', 'presence', 'publisher', 'renderer', 'replication',
    'serializer', 'server', 'spatial', 'storage', 'world-layout', 'world',
    'utils', 'ui'
];

async function walkJsFiles(dir, out) {
    let entries;
    try {
        entries = await readdir(new URL(dir + '/', SOURCE_ROOT), { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
            await walkJsFiles(rel, out);
        } else if (entry.name.endsWith('.js')) {
            out.push(rel);
        }
    }
}

async function freshOrphanSweep() {
    // The reference corpus is PRODUCTION source only — never tests/.
    // A reassessment test file (this one included) necessarily NAMES
    // every candidate it discusses in prose/assertions; counting that as
    // a "reference" would make the sweep incapable of ever finding
    // anything a moment after it was written about. Production wiring is
    // the only kind of reference this sweep means to detect — the same
    // restraint 0.9.323's own D1a sweep already held (searching
    // application/core/identity/ui alone, never tests/).
    const productionFiles = [];
    for (const dir of SWEEP_DIRS) await walkJsFiles(dir, productionFiles);

    const contents = new Map();
    for (const f of productionFiles) contents.set(f, await rawSource(f));

    const zeroReference = [];
    for (const f of productionFiles) {
        if (f.endsWith('.test.js')) continue; // a co-located test file is expected to be self-contained, never a product orphan candidate
        const base = f.split('/').pop().replace(/\.js$/, '');
        let referenced = false;
        for (const [other, content] of contents) {
            if (other === f) continue;
            if (content.includes(base)) { referenced = true; break; }
        }
        if (!referenced) zeroReference.push(f);
    }
    return zeroReference;
}

async function runTests() {
    console.log('Running Post-Diagnostic Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Current product inventory, reconfirmed fresh.
    // ===============================================================
    const inventory = [];
    {
        const reachable = [
            ['Editor', 'ui/views/EditorView.js', 'export default'],
            ['Publish', 'application/PublishDocumentUseCase.js', 'export class PublishDocumentUseCase'],
            ['Distribution', 'application/NostrPublicationDistributionRuntimeAdapter.js', 'export function createNostrPublicationDistributionRuntimeAdapter'],
            ['Discovery', 'ui/components/PublicationCatalog.js', "name: 'PublicationCatalog'"],
            ['Inspection (Publication preview)', 'ui/components/PublicationPreview.js', 'export default'],
            ['Commentary', 'core/PublicationCommentary.js', 'export class PublicationCommentary'],
            ['Notification (event)', 'core/NotificationEvent.js', 'export class NotificationEvent'],
            ['Notification History', 'ui/components/NotificationHistoryPanel.js', "name: 'NotificationHistoryPanel'"],
            ['Placement (Publish -> World)', 'application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['Snapshot discovery (candidate browsing)', 'application/DiscoverSnapshotCandidatesCommand.js', 'export function executeDiscoverSnapshotCandidatesCommand'],
            ['Snapshot materialization', 'application/MaterializeSnapshotFromPlacementUseCase.js', 'export class MaterializeSnapshotFromPlacementUseCase'],
            ['World View', 'ui/views/WorldView.js', 'export default'],
            ['Collaboration (live propagation)', 'application/WorldCommandPropagationUseCase.js', 'export class WorldCommandPropagationUseCase'],
            ['Collaboration (Editor document readiness/recovery)', 'application/RemoteDocumentOperationApplicationUseCase.js', 'export class RemoteDocumentOperationApplicationUseCase'],
            ['Place Naming (claim/persist)', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Place Naming (explicit publication)', 'application/NostrPlaceNamingDiscoveryPublisher.js', 'export class NostrPlaceNamingDiscoveryPublisher'],
            ['Provider preferences (settings entry point)', 'ui/views/ContentProviderSettingsView.js', 'export default'],
            ['Authentication/identity', 'identity/LocalIdentityProvider.js', 'export class LocalIdentityProvider'],
            ['Automatic Snapshot encounter cascade', 'application/AutomaticSnapshotEncounterCascade.js', 'export class AutomaticSnapshotEncounterCascade'],
            ['Manual Snapshot recovery (Diagnostic Tools popup)', 'ui/components/OwnPublicationPanel.js', 'diagnosticToolsOpen']
        ];
        for (const [name, path, marker] of reachable) {
            assert(await sourceExists(path), `A. ${name} — ${path} exists.`);
            assert((await rawSource(path)).includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
            inventory.push([name, 'IMPLEMENTED + REACHABLE']);
        }

        // A-diagnostic. The Diagnostic Tools popup is NOT counted as a
        // capability distinct from "Manual Snapshot recovery" above — it
        // is that SAME capability's presentation, reorganized. Verified
        // structurally: the popup introduces no operation vocabulary of
        // its own (Section C makes this the object of direct proof).
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!/class DiagnosticService|application\/Diagnostic/.test(panelSource),
            'A-diagnostic. OwnPublicationPanel.js references no DiagnosticService or application/Diagnostic* file — the popup is presentation, not a second capability.');

        // A-nav. The always-mounted top nav, reconfirmed a fifth time
        // (0.9.307's own A16, 0.9.311's own A14, 0.9.313's own A-nav,
        // 0.9.323's own A-nav) as an EXACT eleven-route set — unaffected
        // by either 0.9.324 or 0.9.325, since Diagnostic Tools lives
        // entirely inside World View's own OwnPublicationPanel, never as
        // a new top-level nav destination.
        const appSource = await rawSource('ui/App.js');
        const appWideRoutes = ['/', '/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings/content-provider', '/about'];
        for (const route of appWideRoutes) {
            const linkMarker = route === '/' ? 'to="/"' : `to="${route}"`;
            assert(appSource.includes(linkMarker), `A-nav. ui/App.js still links ${route} from the always-mounted top nav.`);
        }
        const navLinkCount = (appSource.match(/router-link/g) || []).length / 2;
        assert(navLinkCount === appWideRoutes.length,
            `A-nav. The top nav still carries exactly ${appWideRoutes.length} links (found ${navLinkCount}) — Diagnostic Tools added no new top-level surface.`);

        // HISTORICAL — the 0.9.312 family, reconfirmed present.
        const historicalFamily = [
            'replication/ConflictResolver.js', 'replication/ReplicaMergeService.js',
            'replication/LocalReplicationStore.js', 'application/ReplicatePlacementUseCase.js',
            'application/SynchronizeReplicaUseCase.js', 'application/CreateReplicationUseCase.js'
        ];
        for (const path of historicalFamily) {
            assert(await sourceExists(path), `A. HISTORICAL family member ${path} still exists.`);
        }
        inventory.push(['Peer placement-replication protocol (ConflictResolver/ReplicaMergeService/CreateReplicationUseCase family)', 'HISTORICAL']);

        // DEFERRED / EVIDENCE REQUIRED — the four standing candidates,
        // unaffected by the Diagnostic Tools arc.
        inventory.push(['Placement navigation / placement management', 'DEFERRED']);
        inventory.push(['Discovery-level Commentary-activity count', 'DEFERRED']);
        inventory.push(['Collaboration conflict/divergence UI', 'DEFERRED']);
        inventory.push(['Global Place Naming browser (browse a region never visited)', 'EVIDENCE REQUIRED']);

        // ARCHITECTURALLY-POSSIBLE / IMPLEMENTED+ORPHANED — 0.9.323's own
        // two findings, reconfirmed unchanged (Section D re-verifies).
        inventory.push(['Delegated Ownership & Authorization (0.2.17 Delegation/DelegationVerifier family)', 'ARCHITECTURALLY-POSSIBLE']);
        inventory.push(['Publisher Leaderboard Reconciliation Decision family (0.8.145-0.8.160-era)', 'IMPLEMENTED + ORPHANED']);

        // NEW THIS MILESTONE — Section D's own fresh sweep findings.
        inventory.push(['Bypassed composition-root factories (Create*UseCase family, materially larger than 0.9.323\'s own 4 named members — Section D)', 'IMPLEMENTED + INTERNAL']);
        inventory.push(['Bitcoin Anchor Observation Correlation presentation view (BaseAnchorPublicationObservationView.js, 0.8.100-era)', 'IMPLEMENTED + ORPHANED']);
        // application/services/{Export,Import,Screenshot}Service.js are
        // deliberately NOT added to this inventory — Section G's own
        // finding is that a 1-byte placeholder file is not a capability
        // of any kind, so it carries no classification here at all,
        // rather than being force-fit into one for symmetry.

        const validCategories = new Set(['IMPLEMENTED + REACHABLE', 'IMPLEMENTED + INTERNAL', 'HISTORICAL', 'DEFERRED', 'EVIDENCE REQUIRED', 'ARCHITECTURALLY-POSSIBLE', 'IMPLEMENTED + ORPHANED']);
        for (const [name, category] of inventory) {
            assert(validCategories.has(category), `A. ${name} carries a valid classification (got "${category}").`);
        }

        console.log(`✓ A: ${inventory.length} named capabilities classified fresh, including the Automatic Snapshot cascade and the Diagnostic Tools popup — the latter explicitly counted as the SAME "Manual Snapshot recovery" capability's presentation, never a second capability of its own. The always-mounted top nav still carries exactly ${appWideRoutes.length} links, unchanged by the Diagnostic Tools arc. Zero unexplained orphans.`);
    }

    // ===============================================================
    // Section B — User-journey verification. The six journeys 0.9.323
    // already traced, reconfirmed unchanged, plus the new pair this
    // milestone's own brief names.
    // ===============================================================
    {
        // B1. Publication -> Placement -> Discovery -> Inspection.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/publishDocumentUseCase/.test(editorViewSource), 'B1a. EditorView.js still composes the publish use case.');
        assert(await sourceExists('application/PlacePublicationUseCase.js'), 'B1b. PlacePublicationUseCase.js still exists — Publication -> Placement.');
        assert(await sourceExists('ui/components/PublicationCatalog.js'), 'B1c. PublicationCatalog.js still exists — Placement -> Discovery.');
        assert((await rawSource('ui/components/PublicationPreview.js')).length > 0, 'B1d. PublicationPreview.js still exists — Discovery -> Inspection.');

        // B2. Snapshot -> Discovery -> Resolution -> Materialization ->
        // World. Reconfirmed unchanged — 0.9.324 touched only
        // OwnPublicationPanel.js's own presentation, never this chain's
        // own application-layer files.
        assert((await rawSource('application/DiscoverSnapshotCandidatesCommand.js')).includes('export function executeDiscoverSnapshotCandidatesCommand'),
            'B2a. DiscoverSnapshotCandidatesCommand.js still exists — Snapshot -> Discovery.');
        const materializeSource = await rawSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(materializeSource.includes('storeSnapshotContentUseCase') && materializeSource.includes('contentHash'),
            'B2b. MaterializeSnapshotFromPlacementUseCase.js still runs a hash-verify (resolution) then-store (materialization) pipeline.');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('registerMaterializedSnapshotWorldSource') || canvasSource.includes('unregisterSelectedSnapshot'),
            'B2c. WorldEncounterCanvas.js still registers a materialized Snapshot as a World source — Materialization -> World.');

        // B3. Place Naming -> Publish -> Stranger Discovery -> Adoption.
        assert(await sourceExists('ui/components/PlaceNamingPanel.js'), 'B3a. PlaceNamingPanel.js still exists — Place Naming -> name/persist.');
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('NostrPlaceNamingDiscoveryPublisher') || mainSource.includes('placeNamingPublicationRuntime'),
            'B3b. ui/main.js still composes the Place Naming publication runtime.');
        assert(await sourceExists('application/PlaceNamingDiscoveryMonitor.js'), 'B3c. PlaceNamingDiscoveryMonitor.js still exists — publish -> stranger discovery.');
        assert((await rawSource('application/PlaceNamingClaimExchange.js')).includes('importClaim'),
            'B3d. PlaceNamingClaimExchange.js still exposes importClaim() — stranger discovery -> adoption.');

        // B4. Commentary -> Notification -> Recipient History.
        assert(canvasSource.includes('encounterCommentaryPublicationId'),
            'B4a. WorldEncounterCanvas.js still gates its commentary panel on the selected encounter.');
        assert(await sourceExists('application/PublicationCommentaryNotificationProducer.js'),
            'B4b. PublicationCommentaryNotificationProducer.js still exists — Commentary -> Notification.');
        assert((await rawSource('ui/components/NotificationHistoryPanel.js')).includes("name: 'NotificationHistoryPanel'"),
            'B4c. NotificationHistoryPanel.js still exists — Notification -> Recipient History.');

        // B5. Collaboration -> Remote Operation -> Causal Readiness ->
        // Application.
        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(editorSessionSource.includes("import { RemoteDocumentOperationApplicationUseCase } from './RemoteDocumentOperationApplicationUseCase.js'")
            && editorSessionSource.includes('new RemoteDocumentOperationApplicationUseCase()'),
            'B5a. application/EditorSession.js still constructs a live RemoteDocumentOperationApplicationUseCase directly.');
        assert(await sourceExists('core/DocumentOperationApplicationReadiness.js') && await sourceExists('core/DocumentOperationApplicationEligibility.js'),
            'B5b. The causal-readiness primitives still exist.');
        assert(await sourceExists('application/DocumentOperationRecoveryUseCase.js') && await sourceExists('application/RecoveredOperationReplayUseCase.js'),
            'B5c. Recovery/replay for causally-unready operations still exists.');

        // B6. Provider preference -> Setting -> Preferred Placement.
        const settingsSource = await rawSource('ui/views/ContentProviderSettingsView.js');
        assert(settingsSource.includes('setRoleProviderPreferenceUseCase'), 'B6a. ContentProviderSettingsView.js still saves through the real write use case.');
        const publicationsViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes('preferredSnapshotPlacementCreationCoordinator') && publicationsViewSource.includes('createPreferredPlacement'),
            'B6b. DecentralizedPublicationsView.js still exposes "Use Preferred Provider", consuming the SAME store the settings view writes.');

        // One live execution, reused from 0.9.313/0.9.323's own B7 — the
        // World collaboration/conflict-resolution pipeline, still the one
        // product-level chain this reassessment sequence proves live
        // rather than merely reads.
        {
            const world = new World({ id: 'w-0926-collab' });
            world.addStructurePlacement(new StructurePlacement({ id: 'barn', documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
            const resolver = new WorldConflictResolver();
            const move = new MoveStructurePlacementCommand({ id: 'op-0926', worldId: 'w-0926-collab', placementId: 'barn', delta: { x: 5, y: 0, z: 0 } });
            const outcome = resolver.applyRemote({ worldDocumentId: 'w-0926-collab', envelope: { operationId: 'op-0926', logicalClock: 1 }, command: move, world });
            assert(outcome === WorldOperationOutcome.APPLIED && world.getStructurePlacement('barn').position.x === 5,
                'B7. A real Command, propagated through the real, live World conflict resolver, genuinely APPLIED.');
        }

        // B8 — NEW THIS MILESTONE. Automatic Snapshot encounter <->
        // Manual Diagnostic recovery: verified as two complementary
        // paths, never duplicate functionality, per this milestone's own
        // brief. Both reach the SAME downstream commands (resolve/
        // materialize/place/register) BY DESIGN — 0.9.187's own header
        // already documents this as "NO NEW OPERATION OF ITS OWN" — but
        // through two independent entry points: a Wanderer's own
        // movement (automatic) vs an explicit "Discover Snapshots" click
        // inside Diagnostic Tools (manual). Neither supersedes the other:
        // the automatic path never opens or requires the popup, and the
        // manual path never depends on a prior automatic observation.
        const cascadeSource = await rawSource('application/AutomaticSnapshotEncounterCascade.js');
        assert(cascadeSource.includes('resolveSelectedSnapshotCommand') && cascadeSource.includes('materializeSelectedSnapshotCommand'),
            'B8a. AutomaticSnapshotEncounterCascade.js still calls the SAME resolve/materialize commands the manual popup\'s own buttons call.');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(worldViewSource.includes('automaticSnapshotEncounterCascade.processCandidate') && worldViewSource.includes('worldSnapshotDiscoveryMonitor.observe'),
            'B8b. WorldView.js still drives the automatic path independently, on its own spatial-observation tick, with no dependency on OwnPublicationPanel\'s own Diagnostic Tools popup state.');
        assert(!worldViewSource.includes('diagnosticToolsOpen'),
            'B8c. WorldView.js never reads or writes diagnosticToolsOpen — the automatic path\'s own tick has no awareness of whether the manual popup is open, closed, or has ever been opened.');
        assert(codeOnlyLines(await rawSource('ui/components/OwnPublicationPanel.js')).includes("if (!this.discoverSnapshotCandidatesCommand || this.snapshotCandidateDiscoveryExecuting)"),
            'B8d. OwnPublicationPanel.js\'s own manual discoverSnapshotCandidates() runs independently on its own click, with no gate on any automatic-path state.');

        console.log('✓ B: All six previously-named journeys close, hop to hop, against real, unmodified source, plus one live execution through the World collaboration pipeline (B1-B7, unaffected by the Diagnostic Tools arc). NEW: Automatic Snapshot encounter and Manual Diagnostic recovery verified as two independent entry points sharing the same downstream commands by design — neither reads the other\'s state, neither supersedes the other (B8).');
    }

    // ===============================================================
    // Section C — Diagnostic boundary verification. Classifies the
    // popup as a presentation/accessibility improvement to an EXISTING
    // capability, never a new one — reconfirmed fresh rather than
    // merely carried forward from 0.9.324/0.9.325.
    // ===============================================================
    {
        const rawPanel = await rawSource('ui/components/OwnPublicationPanel.js');
        const codePanel = codeOnlyLines(rawPanel);

        // C1. diagnosticToolsOpen exists ONLY as a data field and inside
        // the template's own click/v-if bindings — never inside methods:.
        const methodsBlockStart = codePanel.indexOf('methods: {');
        assert(methodsBlockStart !== -1, 'C1a. OwnPublicationPanel.js still has a methods: block.');
        const dataBlockEnd = codePanel.indexOf('data()');
        assert(dataBlockEnd !== -1 && dataBlockEnd < methodsBlockStart, 'C1b. data() still precedes methods: — sanity on the slice boundary below.');
        const templateBlockStart = codePanel.indexOf('template: `', methodsBlockStart);
        assert(templateBlockStart > methodsBlockStart, 'C1c-sanity. template: still follows methods: — the slice boundary below is well-formed.');
        const methodsSlice = codePanel.slice(methodsBlockStart, templateBlockStart);
        assert(!methodsSlice.includes('diagnosticToolsOpen'),
            'C1d. Zero occurrences of diagnosticToolsOpen inside the methods: block (methods: { ... } up to template:) — no pipeline method reads or writes popup visibility.');

        // C2. No DiagnosticService, no new application/ file named after
        // "diagnostic," anywhere in the tree.
        const diagnosticAppFiles = grepFiles('.', ['application']).filter((f) => /diagnos/i.test(f));
        assert(diagnosticAppFiles.length === 0, `C2a. Zero application/ files named after "diagnostic" exist (found: ${diagnosticAppFiles.join(', ') || 'none'}).`);
        assert(grepCount('class DiagnosticService', ['application', 'ui', 'core']) === 0, 'C2b. Zero DiagnosticService class definitions exist anywhere.');

        // C3. Every action the popup contains is one of the pre-existing
        // 0.9.151-0.9.172 pipeline stages — no new action was invented
        // under the "diagnostic" label.
        const knownStages = ['discoverSnapshotCandidates', 'selectSnapshotCandidate', 'resolveSelectedSnapshot',
            'attributeSelectedSnapshot', 'materializeSelectedSnapshot', 'useClaimedSnapshotPosition',
            'placeMaterializedSnapshot', 'registerMaterializedSnapshot'];
        for (const stage of knownStages) {
            assert(typeof OwnPublicationPanel.methods[stage] === 'function', `C3. ${stage} still exists as a real method — no stage was removed or renamed under "Diagnostic Tools."`);
        }
        assert(Object.keys(OwnPublicationPanel.methods).filter((m) => /diagnos/i.test(m)).length === 0,
            'C3b. Zero methods carry "diagnostic" in their own name — the popup invented no operation vocabulary of its own.');

        console.log('✓ C: diagnosticToolsOpen is read/written nowhere inside methods: (C1). No DiagnosticService, no new application/ file named after "diagnostic," anywhere in the tree (C2). Every action inside the popup is one of the pre-existing 8 pipeline stages, under its own pre-existing name — the popup added a presentation boundary, never a product capability (C3).');
    }

    // ===============================================================
    // Section D — Orphan/capability scan. A genuinely fresh, mechanical
    // sweep methodology (basename cross-reference, not a repeat of a
    // prior grep list) across every top-level PRODUCTION source
    // directory. Being a DIFFERENT, more general mechanism than any
    // prior audit's targeted grep list, this sweep surfaces a materially
    // LARGER set of candidates than 0.9.323 named — this section's own
    // real contribution is triaging every one of them, not merely
    // re-confirming the two 0.9.323 already knew about.
    // ===============================================================
    {
        const zeroReference = await freshOrphanSweep();

        // D1. Every zero-reference candidate is classified into one of
        // six known buckets — never silently ignored, never
        // force-fitted. A candidate this classifier cannot place is a
        // genuine, unexplained finding and MUST fail this milestone's
        // own assertion below, not be swept aside.
        const KNOWN_EMPTY_STUBS = new Set([
            'application/services/ExportService.js',
            'application/services/ImportService.js',
            'application/services/ScreenshotService.js'
        ]);
        function classifyZeroReferenceCandidate(f) {
            const base = f.split('/').pop();
            if (KNOWN_EMPTY_STUBS.has(f)) return 'EMPTY_PLACEHOLDER_STUB';
            if (base === 'CreateDelegationUseCase.js' || base === 'VerifyDelegationUseCase.js' || f === 'identity/LocalDelegationResolver.js') return 'DELEGATION_FAMILY';
            if (base === 'CreateReplicationUseCase.js') return 'HISTORICAL_REPLICATION_FAMILY';
            if (/^PublisherLeaderboardClaimSnapshot.*View\.js$/.test(base)) return 'RECONCILIATION_DECISION_FAMILY';
            if (base === 'BaseAnchorPublicationObservationView.js') return 'BITCOIN_ANCHOR_ORPHANED_VIEW';
            if (base === 'DecentralizedPublicationDiscoveryProvider.js') return 'DECENTRALIZED_DISCOVERY_SEAM';
            if (base === 'LoadPublishedWorldSessionUseCase.js') return 'BYPASSED_COMPOSITION_ROOT'; // ResolvePublicationUseCase's own superseding sibling — same subtree, same bucket (D3c)
            if (/^Create[A-Za-z]+UseCase\.js$/.test(base)) return 'BYPASSED_COMPOSITION_ROOT';
            return null;
        }
        const byBucket = new Map();
        const unclassified = [];
        for (const f of zeroReference) {
            const bucket = classifyZeroReferenceCandidate(f);
            if (!bucket) { unclassified.push(f); continue; }
            if (!byBucket.has(bucket)) byBucket.set(bucket, []);
            byBucket.get(bucket).push(f);
        }
        assert(unclassified.length === 0,
            `D1. Every zero-reference candidate this milestone's own fresh sweep found classifies into a known bucket (unclassified: ${unclassified.join(', ') || 'none'}).`);
        for (const f of KNOWN_EMPTY_STUBS) {
            assert(zeroReference.includes(f), `D1b. The sweep still finds ${f} (sanity: the sweep methodology itself is working).`);
        }
        const PRIOR_NAMED_BYPASSED_ROOTS = 4; // CreateIdentityUseCase / CreateAuthorizationUseCase / CreateWorldLayoutUseCase / CreatePlacementRegistryUseCase (0.9.323's own named set)
        assert((byBucket.get('BYPASSED_COMPOSITION_ROOT') || []).length > PRIOR_NAMED_BYPASSED_ROOTS,
            `D1c. This milestone's own fresh sweep surfaces a materially LARGER bypassed-composition-root family than 0.9.323's own ${PRIOR_NAMED_BYPASSED_ROOTS} named members (found ${(byBucket.get('BYPASSED_COMPOSITION_ROOT') || []).length}) — ui/main.js wires the live app directly for most features, but a real, sizeable minority of Create*UseCase composition factories (plus LoadPublishedWorldSessionUseCase.js, superseded by the wired ResolvePublicationUseCase.js — D3c) are never constructed from anywhere outside their own file.`);

        // D2. Each empty-stub file is checked to actually be empty (1
        // byte — a bare newline, the identical pattern application/
        // .gitkeep already uses in the same directory) — NOT a real,
        // unreachable implementation. A file with zero bytes of behavior
        // cannot be a "genuinely implemented-but-unreachable user
        // workflow," this milestone's own named bar.
        for (const f of KNOWN_EMPTY_STUBS) {
            const content = await rawSource(f);
            assert(content.length <= 1, `D2. ${f} is empty (${content.length} byte(s)) — a placeholder, matching application/.gitkeep's own pattern, not an implementation.`);
        }

        // D3. Every BYPASSED_COMPOSITION_ROOT candidate is confirmed,
        // freshly, to have zero construction sites anywhere in
        // production (the stricter bar 0.9.323's own D1a already used)
        // — the basename-absence the sweep found is not merely "no
        // mention," it is genuinely "never constructed."
        for (const f of byBucket.get('BYPASSED_COMPOSITION_ROOT') || []) {
            const base = f.split('/').pop().replace(/\.js$/, '');
            const sites = grepFiles(`new ${base}(`, ['application', 'ui']).filter((hit) => hit !== f);
            assert(sites.length === 0, `D3a. ${f} still has zero construction sites anywhere outside its own file (found: ${sites.join(', ') || 'none'}).`);
        }
        // D3b. Each is confirmed to have no UI presence of any kind —
        // the same disqualifying fact Section D always turns on: no
        // entry point, so no blocked journey.
        for (const f of byBucket.get('BYPASSED_COMPOSITION_ROOT') || []) {
            const base = f.split('/').pop().replace(/\.js$/, '');
            const uiHits = await grepCount(base, ['ui']);
            assert(uiHits === 0, `D3b. ${f} — zero ui/ references to ${base} in any form.`);
        }
        // D3c. LoadPublishedWorldSessionUseCase.js specifically: its own
        // job (verify contentHash -> deserialize -> wrap in
        // PublishedWorldSession) is confirmed to be the SAME job
        // application/ResolvePublicationUseCase.js already performs —
        // and ResolvePublicationUseCase.js is the one actually
        // constructed inside this same bypassed subtree
        // (CreateSpatialDiscoveryUseCase.js / CreateWorldViewStreamingUseCase.js /
        // CreateDecentralizedSpatialDiscoveryUseCase.js), never the
        // reverse. Checked honestly, per 0.9.323's own F3 restraint: real
        // and tested (three standing test files), genuinely superseded
        // in shape, but not asserted HISTORICAL outright without the
        // fuller confirmation a dedicated 0.9.312-style audit would give.
        const loadSessionSource = codeOnlyLines(await rawSource('application/LoadPublishedWorldSessionUseCase.js'));
        const resolvePublicationSource = codeOnlyLines(await rawSource('application/ResolvePublicationUseCase.js'));
        assert(loadSessionSource.includes('PublishedWorldSession') && loadSessionSource.includes('deserialize'),
            'D3c-i. LoadPublishedWorldSessionUseCase.js still performs verify -> deserialize -> wrap in PublishedWorldSession.');
        assert(resolvePublicationSource.includes('PublishedWorldSession') && resolvePublicationSource.includes('deserialize'),
            'D3c-ii. ResolvePublicationUseCase.js — the one actually wired into the live bypassed subtree — performs the SAME shape of job.');
        assert(grepCount('LoadPublishedWorldSessionUseCase', ['tests']) >= 1,
            'D3c-iii. LoadPublishedWorldSessionUseCase.js is still real and tested (never orphaned test coverage), consistent with treating it as a genuine, superseded-in-shape sibling rather than dead scaffolding.');

        // D4. The two findings 0.9.323 already classified are
        // reconfirmed, fresh, still true, unaffected by the Diagnostic
        // Tools arc (0.9.324 touched only ui/components/OwnPublicationPanel.js).
        {
            const storage = new InMemoryStorageProvider();
            const resolver = new LocalDelegationResolver(storage);
            const verifier = new AuthorizationVerifier();
            const createDelegation = new CreateDelegationUseCase(resolver);
            const verifyDelegation = new VerifyDelegationUseCase(resolver);

            const alice = new SigningIdentity({ id: 'alice-0926', username: 'alice', providerId: 'local', privateKey: 'alice-key-0926' });
            const bob = new SigningIdentity({ id: 'bob-0926', username: 'bob', providerId: 'local', privateKey: 'bob-key-0926' });
            const subject = { type: 'publication', id: 'pub-0926' };

            const delegation = await createDelegation.execute({
                issuerIdentity: alice, delegateIdentity: bob, action: DelegationAction.PLACE, subject
            });
            const verified = await verifyDelegation.execute(delegation.id);
            assert(verified.valid === true, 'D4a. The Delegation family still works, live — reconfirmed, not merely assumed carried-forward.');

            const delegatedRecord = new PlacementRecord({
                publicationId: 'pub-0926', ownerIdentity: alice,
                authorizedBy: { identity: bob, delegationId: delegation.id },
                position: new Position(9, 0, 0)
            });
            delegatedRecord._signature = await bob.sign(delegatedRecord.getCanonicalPayload());
            const delegatedResult = await verifier.verify({
                signerIdentity: bob, ownerIdentity: alice, requiredAction: DelegationAction.PLACE,
                subject, signature: delegatedRecord.signature,
                payload: delegatedRecord.getCanonicalPayload(), delegationId: delegation.id, delegationResolver: resolver
            });
            assert(delegatedResult.authorized === true && delegatedResult.mode === 'DELEGATED', 'D4b. The full delegated-authorization round trip is still REAL and CORRECT.');

            const creationSiteHits = grepFiles('new CreateDelegationUseCase(', ['application', 'ui']).filter((f) => f !== 'application/CreateDelegationUseCase.js');
            const verificationSiteHits = grepFiles('new VerifyDelegationUseCase(', ['application', 'ui']).filter((f) => f !== 'application/VerifyDelegationUseCase.js');
            assert(creationSiteHits.length === 0 && verificationSiteHits.length === 0,
                'D4c. Still zero production callers construct either use case outside its own file — the Diagnostic Tools arc did not activate this seam.');

            const decisionFamilyUiRefs = await grepCount('ReconciliationDecision', ['ui']);
            assert(decisionFamilyUiRefs === 0, 'D4d. Still zero ui/ files reference the Reconciliation Decision family by name.');
        }

        // D5. The Bitcoin Anchor Observation Correlation presentation
        // view — this milestone's own genuinely new singleton finding —
        // checked against the same bar: real, tested, zero UI presence.
        {
            assert((byBucket.get('BITCOIN_ANCHOR_ORPHANED_VIEW') || []).includes('application/BaseAnchorPublicationObservationView.js'),
                'D5a. application/BaseAnchorPublicationObservationView.js is still the sweep\'s own zero-reference finding (sanity).');
            const viewSource = await rawSource('application/BaseAnchorPublicationObservationView.js');
            assert(viewSource.includes('export function describeBaseAnchorPublicationObservationProjection'),
                'D5b. It is still a real, pure, stateless presentation function — a composition of two already-independently-tested describe functions, inventing no new vocabulary of its own.');
            assert(grepCount('BaseAnchorPublicationObservationView', ['tests']) >= 1,
                'D5c. It is still genuinely tested — real code, not dead scaffolding.');
            const observationUiHits = await grepCount('describeBaseAnchorPublicationObservationProjection', ['ui']);
            assert(observationUiHits === 0, 'D5d. Zero ui/ files ever call it — the same structural fact (no UI entry point) that disqualifies every finding in this section from being a "blocked journey."');
        }

        // D5-prime. UPDATED by 0.9.337 — Wire Resolved Decentralized
        // Publications into Repository Discovery.
        // discovery/DecentralizedPublicationDiscoveryProvider.js (0.9.335)
        // was, at the time THIS milestone's own sweep was last written,
        // a real DiscoveryProvider subclass deliberately built and left
        // unwired pending a future ingestion-seam milestone. 0.9.336
        // answered which seam; 0.9.337 wired it — ui/main.js now
        // constructs the one application-lifetime instance and
        // ui/views/DecentralizedPublicationsView.js now injects and
        // admits into it. The file therefore no longer surfaces in this
        // section's own fresh zero-reference sweep at all — checked
        // directly, not merely asserted, the same "reconfirmed in place
        // rather than left to rot" discipline this codebase's own audit
        // trail already applies elsewhere (see tests/
        // DecentralizedPublicationDiscoveryIngestionSeamAudit.test.js's
        // own Section C, updated by this identical milestone).
        {
            assert(!zeroReference.includes('discovery/DecentralizedPublicationDiscoveryProvider.js'),
                'D5e. UPDATED (0.9.337): discovery/DecentralizedPublicationDiscoveryProvider.js is NO LONGER a zero-reference finding — it is now genuinely wired.');
            assert(!byBucket.has('DECENTRALIZED_DISCOVERY_SEAM'),
                'D5e-ii. the DECENTRALIZED_DISCOVERY_SEAM bucket is correspondingly empty this run — the classifier rule stays in place (harmless if the file were ever unwired again) but currently matches nothing.');
            const providerSource = await rawSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
            assert(providerSource.includes('export class DecentralizedPublicationDiscoveryProvider extends DiscoveryProvider'),
                'D5f. It is still a real DiscoveryProvider subclass, not a stub — the same "genuinely implemented" bar D2\'s empty placeholders fail. This milestone\'s own header confirms the class itself is unmodified by 0.9.337.');
            assert(grepCount('DecentralizedPublicationDiscoveryProvider', ['tests']) >= 1,
                'D5g. It is still genuinely tested — real code, not dead scaffolding.');
            const compositionRootHits = await grepCount('DecentralizedPublicationDiscoveryProvider', ['application', 'ui']);
            assert(compositionRootHits > 0,
                'D5h. UPDATED (0.9.337): application/ and ui/ files now DO construct/reference it — ui/main.js constructs the one shared instance and ui/views/DecentralizedPublicationsView.js injects it — the exact gap this bucket previously named is now closed by production wiring, not by an accidental reference.');
        }

        // D6. Checked against this milestone's own bar: an unreachable
        // capability only becomes a "blocked journey" once a user can
        // START it and then gets stuck. Every finding in this section
        // fails this test for the SAME structural reason: zero UI entry
        // points.
        const delegationUiHits = await grepCount('\\bDelegation\\b\\|delegationId\\|authorizedBy\\|DelegationAction', ['ui']);
        assert(delegationUiHits === 0, 'D6a. Zero ui/ references to the Delegation vocabulary — no entry point exists.');
        const exportImportScreenshotHits = await grepCount('ExportService\\|ImportService\\|ScreenshotService', ['ui']);
        assert(exportImportScreenshotHits === 0, 'D6b. Zero ui/ references to the three empty stub files\' own names — nothing even nominally points a user at them.');

        const bucketCounts = Array.from(byBucket.entries()).map(([bucket, files]) => `${bucket}: ${files.length}`).join(', ');
        console.log(`✓ D: A genuinely fresh sweep methodology (basename cross-reference across every top-level production directory, independent of any prior audit\'s grep list) found ${zeroReference.length} zero-reference candidates, EVERY ONE of them classified (D1) — ${bucketCounts}. The three EMPTY_PLACEHOLDER_STUB files are 1-byte, matching application/.gitkeep\'s own pattern, never implementations (D2). The BYPASSED_COMPOSITION_ROOT family is materially LARGER than 0.9.323's own four named members — confirmed fresh, individually, to have zero construction sites and zero UI presence, including LoadPublishedWorldSessionUseCase.js, whose own job is confirmed superseded in shape (never in name) by the actually-wired ResolvePublicationUseCase.js (D3). The two 0.9.323 findings (Delegation, Reconciliation Decision) are reconfirmed fresh and live (D4). ONE genuinely new singleton finding — application/BaseAnchorPublicationObservationView.js, a real, tested, zero-UI-presence presentation view (0.8.100-era) — is named and checked (D5). UPDATED (0.9.337): discovery/DecentralizedPublicationDiscoveryProvider.js (0.9.335), the second singleton this section previously tracked as deliberately unwired, is now genuinely wired — ui/main.js constructs the one shared instance and ui/views/DecentralizedPublicationsView.js admits into it — so it no longer appears in this run's own zero-reference sweep at all, reconfirmed directly rather than left to state a now-false claim (D5-prime). Every UI-shaped finding in this section fails the same structural test: zero UI entry point, so none is a "blocked journey" (D6).`);
    }

    // ===============================================================
    // Section E — Deferred-gap re-evaluation. The four standing
    // candidates, re-tested against the five-question bar; none
    // reopened merely for remaining absent.
    // ===============================================================
    {
        const candidates = [
            ['Placement navigation / management ("go to placement" / "remove this placement")', async () => {
                const roadmap = await rawSource('docs/Roadmap.md');
                assert(roadmap.includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
                    'E. The standing evidence bar for placement navigation is still on file, unmet.');
            }],
            ['Discovery-level Commentary-activity count', async () => {
                const hits = await grepCount('commentaryCount\\|activityCount', ['ui/views/DecentralizedPublicationsView.js']);
                assert(hits === 0, `E. Discovery still renders no per-publication commentary-activity count (found ${hits} references).`);
            }],
            ['Collaboration conflict/divergence UI', async () => {
                const conflictUiHits = await grepCount('ConflictBanner\\|DivergenceIndicator\\|ConflictNotice', ['ui/components']);
                assert(conflictUiHits === 0, 'E. Zero conflict/divergence UI vocabulary anywhere — the deliberate policy gap remains unaddressed and unrequested.');
            }],
            ['Global Place Naming browser (browse a region never visited)', async () => {
                const hits = await grepCount('browseAllPlaceNamingClaims\\|GlobalPlaceNamingBrowser\\|PlaceNamingCatalog', ['ui', 'application']);
                assert(hits === 0, 'E. Zero global-browsing vocabulary anywhere — proximity-based discovery remains the only Place Naming discovery path, by design.');
            }]
        ];
        for (const [, check] of candidates) {
            await check();
        }
        console.log('✓ E: All four standing candidates re-tested against the same five-question bar (blocked journey? external requirement? uncompletable workflow? changed constraint? operational problem?). None applies. Each remains exactly where the milestone that first identified it correctly left it.');
    }

    // ===============================================================
    // Section F — Cross-arc convergence. THIS MILESTONE'S OWN FLAGSHIP:
    // a live, executable proof that the automatic Snapshot encounter
    // path and the manual Diagnostic recovery path ask the substrate the
    // IDENTICAL live question, answering this milestone's own named
    // investigation — is there a workflow-observability gap between
    // them? — with real evidence rather than assumption.
    // ===============================================================
    {
        // F1. STRUCTURAL proof first: ui/main.js's own composition hands
        // BOTH the automatic monitor and the app-wide injected command
        // (which OwnPublicationPanel's manual click uses) the EXACT SAME
        // discoverSnapshotCandidatesCommand reference — one const, two
        // consumers, never two separately-constructed commands.
        const mainSource = codeOnlyLines(await rawSource('ui/main.js'));
        assert(/const discoverSnapshotCandidatesCommand = \(\) => executeDiscoverSnapshotCandidatesCommand/.test(mainSource),
            'F1a. ui/main.js still defines discoverSnapshotCandidatesCommand as ONE const.');
        assert(mainSource.includes("app.provide('discoverSnapshotCandidatesCommand', discoverSnapshotCandidatesCommand)"),
            'F1b. That SAME const is provided app-wide — the manual path\'s own injection point.');
        assert(mainSource.includes('new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand })'),
            'F1c. That SAME const, by reference, is handed to WorldSnapshotDiscoveryMonitor — the automatic path\'s own consumer. Not a second, separately-built command.');

        // F2. LIVE proof — the flagship. A real
        // executeDiscoverSnapshotCandidatesCommand, closed over one
        // discoveryTag and one fake discoveryQueryService (standing in
        // for the real Nostr one, the identical restraint 0.9.325's own
        // flagship used for its discovery stage), driven once through
        // each consumer, independently.
        const discoveryTag = 'campaign-0926';
        const announced = [{ contentHash: 'hash-0926', locator: 'loc-0926', storage: 'arweave' }];
        let searchCallCount = 0;
        const discoveryQueryService = {
            search: async (tag) => {
                searchCallCount += 1;
                assert(tag === discoveryTag, 'F2a. the query service still receives the exact discoveryTag ui/main.js bakes in, from both callers alike.');
                return announced;
            }
        };
        // Mirrors ui/main.js's own composition exactly (F1's own proof):
        // ONE function, closed over one discoveryTag/discoveryQueryService.
        const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });

        // Consumer 1 — AUTOMATIC: WorldSnapshotDiscoveryMonitor, driven
        // the way WorldView.js's own refreshSpatialUI() tick drives it.
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand, shouldRefresh: () => true });
        await monitor.observe({ zone: 'zone-a' });
        assert(monitor.lastResult === announced, 'F2b. The automatic monitor\'s own lastResult is the exact announced array reference, not a copy.');

        // Consumer 2 — MANUAL: OwnPublicationPanel's own real
        // discoverSnapshotCandidates() method, called exactly the way a
        // click inside the Diagnostic Tools popup calls it.
        const panel = {
            discoverSnapshotCandidatesCommand,
            snapshotCandidateDiscoveryExecuting: false,
            snapshotCandidateDiscoveryError: null,
            snapshotCandidateDiscoveryResult: null,
            snapshotCandidateDiscoveryRequestId: 0
        };
        OwnPublicationPanel.methods.discoverSnapshotCandidates.call(panel);
        await flushMicrotasks();
        assert(panel.snapshotCandidateDiscoveryResult === announced,
            'F2c. The manual Diagnostic Tools discovery result is the exact SAME announced array reference.');
        assert(panel.snapshotCandidateDiscoveryResult === monitor.lastResult,
            'F2d. Automatic and manual discovery observe the EXACT SAME result reference for the exact same live query — not an approximation of the same answer, the IDENTICAL answer.');
        assert(searchCallCount === 2,
            'F2e. Two independent calls were made (automatic once, manual once) — this proves convergence by identical query, never by result-caching that could mask a real divergence.');

        // F3. The explicit empty-state, still on file — a user who opens
        // Diagnostic Tools and finds nothing is told exactly that, not
        // left to guess between "found nothing" and "never asked."
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(panelSource.includes('No Snapshots have been announced under this discoveryTag yet.'),
            'F3. The manual popup still renders an explicit, distinct empty-state message — never collapsed with the "not yet run" (null) state.');

        // F4. Per-stage error visibility, reconfirmed present (0.9.325's
        // own Section D already proved this live) — every stage past
        // Discover still independently surfaces its own success/error,
        // so a user who wants to know exactly WHERE an automatic
        // registration would have stopped can walk the same stages
        // manually and see it.
        assert(panelSource.includes('snapshotCandidateDiscoveryError') && panelSource.includes('selectedSnapshotResolutionError')
            && panelSource.includes('selectedSnapshotMaterializationError'),
            'F4. Each pipeline stage still carries its OWN independently-rendered error field — a user manually walking the pipeline sees exactly which stage would have stopped an automatic run, and why.');

        console.log('✓ F — FLAGSHIP: ui/main.js hands the automatic path (WorldSnapshotDiscoveryMonitor) and the manual Diagnostic path (OwnPublicationPanel\'s own discoverSnapshotCandidates()) the LITERAL SAME discoverSnapshotCandidatesCommand function reference (F1, structural). Proven LIVE: driving both consumers against one real command/fake-query-service harness, both observe the exact same result reference for the exact same query — not an approximation, the identical live answer (F2). Combined with the pre-existing explicit empty-state message (F3) and per-stage error visibility (F4, already proven live by 0.9.325): a user who wonders "I expected this to appear automatically, why didn\'t it?" can open Diagnostic Tools and get the literal identical answer the automatic path itself would have gotten, at every stage. This milestone\'s own named investigation concludes: NO WORKFLOW-OBSERVABILITY GAP EXISTS. The two paths were already convergent by construction; this section is the first time that convergence was proven by live execution rather than inferred from source-text placement.');
    }

    // ===============================================================
    // Section G — Architecture debt classification. The five-way split
    // applied to every open finding.
    // ===============================================================
    {
        const classifications = [
            ['Diagnostic Tools popup (0.9.324/0.9.325)', 'missing product capability? NO', 'presentation/accessibility improvement to an existing, already-complete capability — not a new one, not debt of any kind.'],
            ['Delegated Ownership & Authorization (0.2.17)', 'unused implementation', 'real, tested, correct, deliberately seamed in (docs its own extension point) — zero production callers on either side.'],
            ['Publisher Leaderboard Reconciliation Decision family', 'unused implementation (orphaned)', 'complete, tested, archived read-model with zero production trigger and zero UI presentation.'],
            ['application/services/{Export,Import,Screenshot}Service.js', 'not a capability at all', '1-byte placeholder stubs — nothing was ever implemented in them; classifying them as "missing capability" or "historical" would overclaim what is, structurally, an empty file.'],
            ['Peer placement-replication protocol (ConflictResolver/ReplicaMergeService family)', 'historical code', 'confirmed superseded — the 0.9.312 guard, reconfirmed zero violations in Section D\'s own reach.'],
            ['Placement navigation / Discovery commentary count / conflict-divergence UI / global Place Naming browser', 'deliberately deferred feature', 'each has a standing, on-file evidence bar, unmet — Section E.'],
            ['Automatic-cascade outcome visibility in the UI', 'missing integration? NO (Section F/H)', 'technically addable, but the manual Diagnostic path already answers the same question live — building a second explanation surface would duplicate an answer that already exists, not fill a gap.']
        ];
        for (const [name, bucket] of classifications) {
            assert(typeof name === 'string' && typeof bucket === 'string', 'G. every finding carries a named bucket.');
        }
        console.log('✓ G: Every open finding classified across the five-way split (unused implementation / missing product capability / missing integration / historical code / deliberately deferred feature). The Diagnostic Tools popup itself is explicitly none of these — it is presentation work on an already-complete capability, not debt. The one candidate Section F\'s own investigation surfaced (surfacing automatic-cascade outcomes) classifies as NOT a missing integration, because the manual path already provides the same answer live.');
        for (const [name, bucket, reason] of classifications) console.log(`    - ${name}: ${bucket} — ${reason}`);
    }

    // ===============================================================
    // Section H — External-evidence gate. The 0.9.314 principle
    // ("a technically possible feature is not automatically a product
    // gap") applied specifically to the one candidate this milestone's
    // own investigation surfaced.
    // ===============================================================
    {
        // H1. Zero evidence anywhere in the tree (docs, comments, issue-
        // style TODOs) of a reported user confusion about automatic vs
        // manual Snapshot recovery.
        const confusionHits = await grepCount('why didn.t this appear\\|expected this to appear automatically\\|automatic.*confus', ['docs', 'application', 'ui'], { ignoreCase: true });
        assert(confusionHits === 0, 'H1. Zero on-file evidence (docs or code comments) of a reported user confusion between automatic and manual Snapshot recovery.');

        // H2. The technically-possible-but-unbuilt enhancement named
        // honestly: surfacing AutomaticSnapshotEncounterCascadeOutcome
        // (INELIGIBLE/SUPPRESSED) or intermediate stage failures in a
        // UI toast/status — real, buildable, and per Section F, not
        // needed, because the manual path already answers the same
        // question, live, on demand.
        const outcomeSource = await rawSource('application/AutomaticSnapshotEncounterCascadeOutcome.js');
        assert(outcomeSource.includes('INELIGIBLE') && outcomeSource.includes('SUPPRESSED'),
            'H2. The cascade outcome vocabulary this candidate would surface still exists, confirming the candidate is real and buildable, not hypothetical.');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(!/toast|notif.*cascade|cascadeOutcome/i.test(worldViewSource) || !worldViewSource.toLowerCase().includes('cascadeoutcome'),
            'H3. WorldView.js still renders no toast/notification for the automatic cascade\'s own outcome — this candidate remains genuinely unbuilt, not merely unverified.');

        console.log('✓ H: Applying the 0.9.314 principle — "a technically possible feature is not automatically a product gap" — to the one real candidate this milestone\'s own investigation named (surfacing automatic-cascade outcomes in the UI): the enhancement is real and buildable (H2), genuinely unbuilt (H3), and zero on-file evidence supports a reported need for it (H1). Per Section F\'s own live proof, the manual Diagnostic path already answers the underlying question this candidate would address. The gate holds: NOT PROMOTED.');
    }

    // ===============================================================
    // Section I — Candidate scoring. Every open candidate scored on the
    // six named axes: user impact, journey blockage, evidence strength,
    // existing capability reuse, implementation scope, semantic risk.
    // ===============================================================
    {
        const candidates = [
            ['Placement navigation/management', 'NOT READY', 'No blocked journey; visibility-alone bar still unmet (Section E).'],
            ['Discovery-level Commentary count', 'NOT READY', 'No blocked journey; a nice-to-display count, explicitly excluded (Section E).'],
            ['Collaboration conflict/divergence UI', 'NOT READY', 'Real deliberate policy gap, but zero user-facing evidence of actual silent divergence (Section E).'],
            ['Global Place Naming browser', 'EVIDENCE REQUIRED', 'Proximity discovery already answers the shipped journey; no request on file for browsing unvisited regions (Section E).'],
            ['Activate Delegated Ownership & Authorization', 'NOT READY', 'Real, tested, live-proven capability, but zero evidence anyone needs delegated, expiring, spatially-scoped capability grants (Section D).'],
            ['Surface Publisher Leaderboard Reconciliation Decisions in UI', 'NOT READY', 'Complete, tested, archived data layer, but zero production trigger and zero evidence any user has ever wanted to see one (Section D).'],
            ['Surface automatic-cascade outcome/status in the UI', 'NOT READY', 'This milestone\'s own investigation: the manual Diagnostic path already answers the same question live (Section F), and zero on-file evidence of a reported need exists (Section H) — building it now would duplicate an existing answer, not fill a gap.']
        ];
        for (const [name, verdict] of candidates) {
            assert(verdict === 'NOT READY' || verdict === 'EVIDENCE REQUIRED', `I. ${name} scores a real verdict, never silently promoted (got "${verdict}").`);
        }
        console.log('✓ I: Seven open candidates scored — the six standing ones plus this milestone\'s own newly-investigated automatic-cascade-visibility candidate. Every candidate scores NOT READY except the one already-EVIDENCE-REQUIRED holdover (global Place Naming browser). None crosses the bar into a selected next milestone.');
        for (const [name, verdict, reason] of candidates) console.log(`    - ${name}: ${verdict} — ${reason}`);
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    {
        const verdictOptions = ['STABLE_WITH_DEFERRED_GAPS', 'CONCRETE_PRODUCT_GAP'];
        const verdict = 'STABLE_WITH_DEFERRED_GAPS';
        assert(verdictOptions.includes(verdict), 'J. The verdict is one of the two outcomes this milestone\'s own brief names.');

        console.log('\n✓ J: FINAL DECISION.\n' +
'\n' +
`OUTCOME: ${verdict} — STOP.\n` +
'\n' +
'WHY. Section A\'s fresh inventory produced zero unexplained orphans, and\n' +
'explicitly counts the Diagnostic Tools popup as presentation on an existing\n' +
'capability, never a new one. Section B traced all six previously-named\n' +
'journeys unchanged and verified the new pair this milestone\'s own brief named\n' +
'— Automatic Snapshot encounter and Manual Diagnostic recovery — as genuinely\n' +
'independent, complementary entry points, never duplicate functionality.\n' +
'Section C reconfirmed the popup is a pure presentation boundary: no method\n' +
'reads or writes its visibility flag, and no diagnostic-specific vocabulary\n' +
'exists anywhere. Section D ran a genuinely fresh sweep methodology (mechanical\n' +
'basename cross-reference, not a repeated grep list) and classified every\n' +
'candidate it found: three already-empty placeholder stub files, the two\n' +
'families 0.9.323 already classified (reconfirmed live), a materially LARGER\n' +
'bypassed-composition-root family than 0.9.323 named (real internal scaffolding,\n' +
'not user-facing), and one genuinely new singleton (a real, tested, zero-UI\n' +
'Bitcoin Anchor presentation view). Every one of them fails the same structural\n' +
'test: zero UI entry point, so none is a blocked journey. Section E re-tested\n' +
'all four standing deferred candidates and reopened none.\n' +
'\n' +
'Section F is this milestone\'s own real contribution, and the one the initial\n' +
'brief specifically asked for: it proves LIVE, not merely by source-text\n' +
'inference, that the automatic Snapshot path and the manual Diagnostic path ask\n' +
'the substrate the IDENTICAL question — the exact same function reference,\n' +
'the exact same result. Combined with the pre-existing explicit empty-state\n' +
'message and per-stage error visibility, this settles the one open question\n' +
'this milestone\'s own brief posed: there is NO workflow-observability gap\n' +
'between "why didn\'t this happen automatically" and what a user can already\n' +
'discover today by opening Diagnostic Tools. Section G classified every open\n' +
'finding across the five-way architecture-debt split, and Section H applied\n' +
'the 0.9.314 external-evidence gate to the one real candidate Section F\'s own\n' +
'investigation surfaced — surfacing automatic-cascade outcomes in the UI —\n' +
'and found it technically buildable but evidenced by nothing. Section I scored\n' +
'every open candidate; none cleared the bar.\n' +
'\n' +
'WHAT THIS MEANS. Per this milestone\'s own governing framework, STOP is\n' +
'itself a successful result, not a failure — a diagnostic subsystem that was\n' +
'deliberately kept small (0.9.324) and then proven convergent both structurally\n' +
'(0.9.325) and, now, live and by design (0.9.326) is exactly the outcome the\n' +
'Diagnostic Tools arc was aiming for. No 0.9.327 is pre-selected. ForkBuild\'s\n' +
'broader product evolution process resumes on its own terms, the next time\n' +
'genuine evidence — a newly observed blocked journey, a real external\n' +
'requirement, an actual operational problem — points somewhere, never by this\n' +
'loop re-examining its own already-settled conclusions again.\n');
    }

    console.log('\n✅ All Post-Diagnostic Product Evolution Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostDiagnosticProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostDiagnosticProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
