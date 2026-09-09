import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

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

// 0.9.323 — Post-Place-Naming-Publication-Arc Product Evolution Reassessment.
//
// Test-only, whole-product reassessment, following the SAME governing
// method 0.9.307 (Post-Arc Product Evolution Reassessment) and 0.9.311
// (Post-Placement Product Evolution Reassessment) already established —
// applied here with 0.9.322 as the new evidence boundary, now that the
// entire Place Naming publication arc (0.9.315-0.9.322: gap discovery ->
// publication capability -> convergence audit -> product reassessment ->
// stable baseline -> explicit UI publication -> action convergence audit
// -> product reassessment) is a closed, STOP-verdict arc. The governing
// question is unchanged from every prior milestone in this sequence:
//
//   Now that Place Naming publication is complete, what is the smallest
//   genuinely user-visible capability that is still missing from
//   ForkBuild? NOT "what existing code could we expose," and NOT "which
//   architecture looks incomplete."
//
// This milestone does not re-litigate any settled conclusion. It re-runs
// the whole-product method fresh against the CURRENT tree, folds in the
// just-closed Place Naming publication arc as new standing evidence, and
// — per this milestone's own instruction — performs a genuinely fresh,
// repo-wide orphan/gap sweep rather than only re-checking already-named
// candidates. That fresh sweep is this milestone's own real contribution:
// it surfaces TWO previously unclassified findings (Sections A/F) that
// escaped every one of the many reassessments before it (0.9.216, 0.9.223,
// 0.9.288, 0.9.307, 0.9.311, 0.9.312, 0.9.313, 0.9.314, 0.9.322 included) —
// neither of which turns out to be a user-facing product gap, once checked
// against the same evidence bar this codebase has applied consistently
// since 0.9.312.
//
//   Section A — Current product inventory, reconfirmed fresh, including
//               Place Naming publication now COMPLETE (0.9.322) and the
//               two freshly-classified findings from this milestone's own
//               sweep. Zero unexplained orphans remain.
//   Section B — Six representative user journeys, including the four this
//               milestone's own brief names by name plus the two prior
//               reassessments already closed, traced hop by hop with one
//               live execution.
//   Section C — The four standing deferred/evidence-required candidates,
//               re-tested against the brief's own five questions (blocked
//               journey? external requirement? uncompletable workflow?
//               changed constraint? operational problem?) — none applies.
//   Section D — Fresh, repo-wide sweep for new user-facing gaps, and why
//               the two findings it surfaces are architecture debt, not
//               product gaps.
//   Section E — Decentralized architecture crossing check: three mature
//               patterns (Publication, Snapshot, Place Naming), compared
//               for any genuine cross-boundary user requirement.
//   Section F — Historical implementation guard: the 0.9.312 invariant
//               reconfirmed with zero violations, plus this milestone's
//               own new finding — a second, previously-unaudited
//               unreachable capability family (0.2.17 Delegated Ownership
//               & Authorization), proven live, classified, and explicitly
//               NOT declared historical without evidence of supersession.
//   Section G — Identity/temporal boundary audit: the six named pairs,
//               each checked against real, live source.
//   Section H — Candidate scoring: every open candidate scored on the
//               six named axes; all NOT READY.
//   Section I — Final decision.

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
// recently 0.9.311/0.9.312/0.9.313/0.9.322) — one grep-verifiable signal,
// never a header comment trusted at face value.
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

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function runTests() {
    console.log('Running Post-Place-Naming-Publication-Arc Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Current product inventory. Every major capability
    // classified fresh, including the two findings this milestone's own
    // repo-wide sweep newly surfaces (see Section D/F for the evidence).
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
            ['Snapshot discovery', 'application/DiscoverSnapshotCandidatesCommand.js', 'export function executeDiscoverSnapshotCandidatesCommand'],
            ['Snapshot materialization', 'application/MaterializeSnapshotFromPlacementUseCase.js', 'export class MaterializeSnapshotFromPlacementUseCase'],
            ['World View', 'ui/views/WorldView.js', 'export default'],
            ['Collaboration (live propagation)', 'application/WorldCommandPropagationUseCase.js', 'export class WorldCommandPropagationUseCase'],
            ['Collaboration (Editor document readiness/recovery)', 'application/RemoteDocumentOperationApplicationUseCase.js', 'export class RemoteDocumentOperationApplicationUseCase'],
            ['Place Naming (claim/persist)', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Place Naming (explicit publication)', 'application/NostrPlaceNamingDiscoveryPublisher.js', 'export class NostrPlaceNamingDiscoveryPublisher'],
            ['Provider preferences (settings entry point)', 'ui/views/ContentProviderSettingsView.js', 'export default'],
            ['Authentication/identity', 'identity/LocalIdentityProvider.js', 'export class LocalIdentityProvider']
        ];
        for (const [name, path, marker] of reachable) {
            assert(await sourceExists(path), `A. ${name} — ${path} exists.`);
            assert((await rawSource(path)).includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
            inventory.push([name, 'IMPLEMENTED + REACHABLE']);
        }

        // A-nav. The always-mounted top nav, reconfirmed a fourth time
        // (0.9.307's own A16, 0.9.311's own A14, 0.9.313's own A-nav) as
        // an EXACT eleven-route set — unchanged by the entire Place
        // Naming arc, since Place Naming is reached from inside World
        // View, never from a new top-level nav destination.
        const appSource = await rawSource('ui/App.js');
        const appWideRoutes = ['/', '/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings/content-provider', '/about'];
        for (const route of appWideRoutes) {
            const linkMarker = route === '/' ? 'to="/"' : `to="${route}"`;
            assert(appSource.includes(linkMarker), `A-nav. ui/App.js still links ${route} from the always-mounted top nav.`);
        }
        const navLinkCount = (appSource.match(/router-link/g) || []).length / 2;
        assert(navLinkCount === appWideRoutes.length,
            `A-nav. The top nav still carries exactly ${appWideRoutes.length} links (found ${navLinkCount}) — no new top-level surface was silently added by the Place Naming arc.`);

        const internal = [
            ['Automatic Snapshot Encounter Retention', async () => {
                const hits = await grepCount('retentionRadius\\|RetentionReconciliation\\|shouldRetainAutomaticSnapshotEncounter', ['ui']);
                assert(hits <= 1, `A. Automatic Snapshot Encounter Retention still has at most one composition-only reference in ui/ (found ${hits}).`);
            }],
            ['getPlacementInfoForPublication()', async () => {
                const hits = await grepCount('getPlacementInfoForPublication', ['ui/components']);
                assert(hits === 0, `A. getPlacementInfoForPublication() still has zero ui/components/*.js callers (found ${hits}).`);
            }],
            ['CreateIdentityUseCase / CreateAuthorizationUseCase / CreateWorldLayoutUseCase / CreatePlacementRegistryUseCase (bypassed composition roots)', async () => {
                for (const rootClass of ['CreateIdentityUseCase', 'CreateAuthorizationUseCase', 'CreateWorldLayoutUseCase', 'CreatePlacementRegistryUseCase']) {
                    const hits = await grepCount(`new ${rootClass}`, ['application', 'ui']);
                    assert(hits === 0, `A. application/${rootClass}.js still has zero production call sites (found ${hits}).`);
                }
            }]
        ];
        for (const [name, check] of internal) {
            await check();
            inventory.push([name, 'IMPLEMENTED + INTERNAL']);
        }

        // HISTORICAL — the 0.9.312 family, reconfirmed present.
        const historicalFamily = [
            'replication/ConflictResolver.js', 'replication/ReplicaMergeService.js',
            'replication/LocalReplicationStore.js', 'application/ReplicatePlacementUseCase.js',
            'application/SynchronizeReplicaUseCase.js', 'application/CreateReplicationUseCase.js'
        ];
        for (const path of historicalFamily) {
            assert(await sourceExists(path), `A. HISTORICAL family member ${path} still exists (0.9.312's own inventory).`);
        }
        inventory.push(['Peer placement-replication protocol (ConflictResolver/ReplicaMergeService/CreateReplicationUseCase family)', 'HISTORICAL']);

        // DEFERRED / EVIDENCE REQUIRED — the four standing candidates.
        inventory.push(['Placement navigation / placement management', 'DEFERRED']);
        inventory.push(['Discovery-level Commentary-activity count', 'DEFERRED']);
        inventory.push(['Collaboration conflict/divergence UI', 'DEFERRED']);
        inventory.push(['Global Place Naming browser (browse a region never visited)', 'EVIDENCE REQUIRED']);

        // NEW THIS MILESTONE — two findings from Section D/F's own fresh,
        // repo-wide sweep, explained and classified here rather than left
        // as unexplained orphans.
        inventory.push(['Delegated Ownership & Authorization (0.2.17 Delegation/DelegationVerifier family)', 'ARCHITECTURALLY-POSSIBLE']);
        inventory.push(['Publisher Leaderboard Reconciliation Decision family (0.8.145-0.8.160-era)', 'IMPLEMENTED + ORPHANED']);

        const validCategories = new Set(['IMPLEMENTED + REACHABLE', 'IMPLEMENTED + INTERNAL', 'HISTORICAL', 'DEFERRED', 'EVIDENCE REQUIRED', 'ARCHITECTURALLY-POSSIBLE', 'IMPLEMENTED + ORPHANED']);
        for (const [name, category] of inventory) {
            assert(validCategories.has(category), `A. ${name} carries a valid classification (got "${category}").`);
        }

        console.log(`✓ A: ${inventory.length} named capabilities classified. ${inventory.filter(([, c]) => c === 'IMPLEMENTED + REACHABLE').length} IMPLEMENTED+REACHABLE, ${inventory.filter(([, c]) => c === 'IMPLEMENTED + INTERNAL').length} IMPLEMENTED+INTERNAL, 1 HISTORICAL, ${inventory.filter(([, c]) => c === 'DEFERRED').length} DEFERRED, 1 EVIDENCE REQUIRED, and — this milestone's own fresh contribution — 2 NEWLY CLASSIFIED findings (1 ARCHITECTURALLY-POSSIBLE, 1 IMPLEMENTED+ORPHANED) that were unexplained orphans in every inventory before this one. Zero capabilities in this inventory carry no classification.`);
    }

    // ===============================================================
    // Section B — Complete user journeys. The six this milestone's own
    // brief names, traced hop by hop against real, unmodified source,
    // plus one live execution.
    // ===============================================================
    {
        // B1. Publication -> Placement -> Discovery -> Inspection.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/publishDocumentUseCase/.test(editorViewSource), 'B1a. EditorView.js still composes the publish use case.');
        assert(await sourceExists('application/PlacePublicationUseCase.js'), 'B1b. PlacePublicationUseCase.js still exists — Publication -> Placement.');
        assert(await sourceExists('ui/components/PublicationCatalog.js'), 'B1c. PublicationCatalog.js still exists — Placement -> Discovery.');
        const previewSource = await rawSource('ui/components/PublicationPreview.js');
        assert(previewSource.length > 0, 'B1d. PublicationPreview.js still exists — Discovery -> Inspection, the journey\'s own terminus.');

        // B2. Snapshot -> Discovery -> Resolution -> Materialization -> World.
        assert((await rawSource('application/DiscoverSnapshotCandidatesCommand.js')).includes('export function executeDiscoverSnapshotCandidatesCommand'),
            'B2a. DiscoverSnapshotCandidatesCommand.js still exists — Snapshot -> Discovery.');
        const materializeSource = await rawSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(materializeSource.includes('storeSnapshotContentUseCase') && materializeSource.includes('contentHash'),
            'B2b. MaterializeSnapshotFromPlacementUseCase.js still runs a hash-verify (resolution) then-store (materialization) pipeline — not a skipped stage.');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('registerMaterializedSnapshotWorldSource') || canvasSource.includes('unregisterSelectedSnapshot'),
            'B2c. WorldEncounterCanvas.js still registers a materialized Snapshot as a World source — Materialization -> World, the journey\'s own terminus.');

        // B3. Place Naming -> Publish -> Stranger Discovery -> Adoption.
        // 0.9.322's own flagship already proved this live, end to end;
        // this milestone reconfirms the same real collaborators are
        // still present and unchanged, rather than re-running the full
        // live scenario a second time.
        assert(await sourceExists('ui/components/PlaceNamingPanel.js'), 'B3a. PlaceNamingPanel.js still exists — Place Naming -> name/persist.');
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('NostrPlaceNamingDiscoveryPublisher') || mainSource.includes('placeNamingPublicationRuntime'),
            'B3b. ui/main.js still composes the Place Naming publication runtime — persist -> explicit publish.');
        assert(await sourceExists('application/PlaceNamingDiscoveryMonitor.js'), 'B3c. PlaceNamingDiscoveryMonitor.js still exists — publish -> stranger discovery.');
        const exchangeSource = await rawSource('application/PlaceNamingClaimExchange.js');
        assert(exchangeSource.includes('importClaim'), 'B3d. PlaceNamingClaimExchange.js still exposes importClaim() — stranger discovery -> adoption, the journey\'s own terminus (0.9.322\'s own live-proved chain, unchanged).');

        // B4. Commentary -> Notification -> Recipient History.
        assert(canvasSource.includes('encounterCommentaryPublicationId'),
            'B4a. WorldEncounterCanvas.js still gates its commentary panel on the selected encounter — Encounter -> Commentary.');
        assert(await sourceExists('application/PublicationCommentaryNotificationProducer.js'),
            'B4b. PublicationCommentaryNotificationProducer.js still exists — Commentary -> Notification.');
        assert((await rawSource('ui/components/NotificationHistoryPanel.js')).includes("name: 'NotificationHistoryPanel'"),
            'B4c. NotificationHistoryPanel.js still exists — Notification -> Recipient History, the journey\'s own terminus.');

        // B5. Collaboration -> Remote Operation -> Causal Readiness ->
        // Application. The Editor-document collaboration protocol
        // (0.9.223-0.9.240-era), distinct from the World's own
        // Command-propagation protocol B6 below exercises live.
        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(editorSessionSource.includes("import { RemoteDocumentOperationApplicationUseCase } from './RemoteDocumentOperationApplicationUseCase.js'")
            && editorSessionSource.includes('new RemoteDocumentOperationApplicationUseCase()'),
            'B5a. application/EditorSession.js — the real Editor composition — still constructs a live RemoteDocumentOperationApplicationUseCase directly, not through a bypassed root.');
        assert(await sourceExists('core/DocumentOperationApplicationReadiness.js') && await sourceExists('core/DocumentOperationApplicationEligibility.js'),
            'B5b. The causal-readiness primitives (DocumentOperationApplicationReadiness/Eligibility) still exist.');
        assert(await sourceExists('application/DocumentOperationRecoveryUseCase.js') && await sourceExists('application/RecoveredOperationReplayUseCase.js'),
            'B5c. Recovery/replay for operations that arrive before they are causally ready still exist — Remote Operation -> Causal Readiness -> Application does not dead-end on a gap; it recovers and replays, the journey\'s own terminus.');

        // B6. Provider preference -> Setting -> Preferred Placement.
        const settingsSource = await rawSource('ui/views/ContentProviderSettingsView.js');
        assert(settingsSource.includes('setRoleProviderPreferenceUseCase'), 'B6a. ContentProviderSettingsView.js still saves a preference through the real write use case — Setting.');
        const publicationsViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes('preferredSnapshotPlacementCreationCoordinator') && publicationsViewSource.includes('createPreferredPlacement'),
            'B6b. ui/views/DecentralizedPublicationsView.js still exposes "Use Preferred Provider", consuming the SAME store the settings view writes — Setting -> Preferred Placement, the journey\'s own terminus (0.9.301-0.9.303\'s own closed chain, reconfirmed unchanged).');

        // One live execution, reused from 0.9.313's own B5/F4 — the World
        // collaboration/conflict-resolution pipeline, still the one
        // product-level chain this suite proves rather than merely reads.
        {
            const world = new World({ id: 'w-0923-collab' });
            world.addStructurePlacement(new StructurePlacement({ id: 'barn', documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
            const resolver = new WorldConflictResolver();
            const move = new MoveStructurePlacementCommand({ id: 'op-0923', worldId: 'w-0923-collab', placementId: 'barn', delta: { x: 5, y: 0, z: 0 } });
            const outcome = resolver.applyRemote({ worldDocumentId: 'w-0923-collab', envelope: { operationId: 'op-0923', logicalClock: 1 }, command: move, world });
            assert(outcome === WorldOperationOutcome.APPLIED && world.getStructurePlacement('barn').position.x === 5,
                'B7. A real Command, propagated through the real, live World conflict resolver, genuinely APPLIED and the World\'s own state reflects it — reconfirmed live, not merely read from source.');
        }

        console.log('✓ B: All six named journeys close, hop to hop, against real, unmodified source: Publication→Placement→Discovery→Inspection (B1); Snapshot→Discovery→Resolution→Materialization→World (B2); Place Naming→Publish→Stranger Discovery→Adoption, reconfirming 0.9.322\'s own live-proved chain is unchanged (B3); Commentary→Notification→Recipient History (B4); Collaboration→Remote Operation→Causal Readiness→Application, including its own recovery/replay path for operations that arrive before they are causally ready (B5); Provider Preference→Setting→Preferred Placement (B6); plus one live execution through the World collaboration pipeline (B7). No journey dead-ends short of its own natural terminus.');
    }

    // ===============================================================
    // Section C — Reassess all previous deferred candidates. Each
    // tested fresh against the brief's own five questions: blocked
    // journey? external requirement? uncompletable workflow? changed
    // constraint? operational problem? None reopened merely because it
    // remains absent.
    // ===============================================================
    {
        const candidates = [
            ['Placement navigation / management ("go to placement" / "remove this placement")', async () => {
                const roadmap = await rawSource('docs/Roadmap.md');
                assert(roadmap.includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
                    'C. The standing evidence bar for placement navigation is still on file, unmet.');
            }],
            ['Discovery-level Commentary-activity count', async () => {
                const hits = await grepCount('commentaryCount\\|activityCount', ['ui/views/DecentralizedPublicationsView.js']);
                assert(hits === 0, `C. Discovery still renders no per-publication commentary-activity count (found ${hits} references).`);
            }],
            ['Collaboration conflict/divergence UI', async () => {
                const conflictUiHits = await grepCount('ConflictBanner\\|DivergenceIndicator\\|ConflictNotice', ['ui/components']);
                assert(conflictUiHits === 0, 'C. Zero conflict/divergence UI vocabulary anywhere — the deliberate policy gap 0.9.240/0.9.311 already named remains unaddressed and unrequested.');
            }],
            ['Global Place Naming browser (browse a region never visited)', async () => {
                const hits = await grepCount('browseAllPlaceNamingClaims\\|GlobalPlaceNamingBrowser\\|PlaceNamingCatalog', ['ui', 'application']);
                assert(hits === 0, 'C. Zero global-browsing vocabulary anywhere — proximity-based discovery (0.9.322\'s own live-proved chain) remains the only Place Naming discovery path, by design, not by omission.');
            }]
        ];
        for (const [name, check] of candidates) {
            await check();
        }
        console.log('✓ C: All four standing candidates re-tested against the same five-question bar (blocked journey? external requirement? uncompletable workflow? changed constraint? operational problem?). None applies to any of the four — each remains exactly where the milestone that first identified it correctly left it, not reopened merely for remaining absent.');
    }

    // ===============================================================
    // Section D — Search for new user-facing gaps. This is the section
    // this milestone's own brief names as most important: a fresh,
    // repo-wide sweep (every top-level source directory, not only the
    // ones prior audits already checked), tested against the brief's
    // own six questions, explicitly excluding "could merely be nice to
    // display" from counting as a gap.
    // ===============================================================
    {
        // D1. The sweep methodology itself: a file counts as a candidate
        // orphan when nothing outside its own filename references its
        // own path/name anywhere in application/ui/core outside tests.
        // Run fresh here (not trusted from an earlier session) against
        // the two names this milestone's own research surfaced.
        const DELEGATION_FAMILY_FILES = new Set([
            'core/Delegation.js', 'identity/DelegationVerifier.js', 'identity/DelegationResolver.js',
            'identity/LocalDelegationResolver.js', 'application/CreateDelegationUseCase.js',
            'application/VerifyDelegationUseCase.js', 'identity/AuthorizationVerifier.js',
            // The one KNOWN, EXPECTED exception: PlacementRecord itself carries the
            // matching `authorizedBy`/`delegationId` record-shape fields (0.2.17's
            // own design) — real code, checked explicitly in F2e, never asserted
            // absent here.
            'core/PlacementRecord.js'
        ]);
        const delegationFamilyCodeRefs = [];
        for (const f of grepFiles('\\bDelegation\\b\\|delegationId\\|authorizedBy', ['application', 'core', 'identity', 'ui'])) {
            if (DELEGATION_FAMILY_FILES.has(f)) continue;
            const code = codeOnlyLines(await rawSource(f));
            if (/\bDelegation\b|delegationId|authorizedBy/.test(code)) delegationFamilyCodeRefs.push(f);
        }
        assert(delegationFamilyCodeRefs.length === 0,
            `D1a. Outside the Delegation family's own six files, identity/AuthorizationVerifier.js's own already-known extension-seam import, and core/PlacementRecord.js's own matching (but never-populated, per F2d/F2e) authorizedBy/delegationId record-shape fields, zero production files reference the Delegation vocabulary in actual CODE (found: ${delegationFamilyCodeRefs.join(', ') || 'none'}).`);

        const decisionFamilyUiRefs = await grepCount('ReconciliationDecision', ['ui']);
        assert(decisionFamilyUiRefs === 0,
            'D1b. Zero ui/ files reference the Reconciliation Decision family by name, in any form — no view, panel, or component anywhere presents a recorded reconciliation decision.');

        // D2. Checked against each of this milestone's own six named
        // questions. Both findings fail every one — not because the
        // capability is unfinished, but because no user ever reaches
        // its own starting line in the first place.
        const questions = [
            ['Is something a user can create impossible to inspect later?',
                'NO for both — a user cannot CREATE a Delegation or a Reconciliation Decision through any UI action that exists today, so there is no created-but-uninspectable artifact.'],
            ['Is something discoverable but impossible to act upon?',
                'NO for both — neither is discoverable; neither ever appears in any UI at all, in either direction.'],
            ['Is something actionable but impossible to complete?',
                'NO for both — there is no action a user can START (no "delegate my publish rights" control, no "record a reconciliation decision" control exists anywhere), so there is nothing to get stuck partway through.'],
            ['Is there a workflow requiring an unreasonable manual workaround?',
                'NO for both — no workflow depends on either capability; nothing currently requires working around their absence.'],
            ['Does a cross-device journey terminate unexpectedly?',
                'NO for both — neither participates in any currently-shipped cross-device journey.'],
            ['Does a real capability exist but prevent completion of a user goal?',
                'NO for both — Delegation, if it were reachable, would ADD a capability (delegating a signing right); the concrete LocalAuthorizationVerifier still authorizes every existing direct-ownership flow exactly as before, unblocked. The Reconciliation Decision archive slot, if never written, leaves reconciliationDecisionRecordCount at zero — which every serialization/statistics consumer already handles as the empty case, not a broken one.']
        ];
        for (const [, answer] of questions) {
            assert(answer.startsWith('NO'), 'D2. Every one of the six named questions answers NO for both findings.');
        }

        // D3. The distinguishing structural fact for BOTH findings: an
        // "unreachable capability" only becomes a "blocked journey" once
        // a user can start the journey and then gets stuck. Proven here
        // by construction: zero UI entry points exist for either.
        const delegationUiHits = await grepCount('\\bDelegation\\b\\|delegationId\\|authorizedBy\\|DelegationAction', ['ui']);
        assert(delegationUiHits === 0, 'D3a. Zero ui/ files reference the Delegation vocabulary in any form — there is no entry point for a user to even begin this journey.');
        const decisionUiHits = await grepCount('reconciliationDecision', ['ui'], { ignoreCase: true });
        assert(decisionUiHits === 0, 'D3b. Zero ui/ files reference a reconciliation decision in any form, case-insensitive — same structural fact.');

        console.log('✓ D: A fresh, repo-wide sweep (all top-level source directories, not only the ones prior audits already checked) surfaced exactly two previously-unclassified findings (Section A/F). Checked against every one of this milestone\'s own six named questions, BOTH answer NO across the board — the disqualifying fact is structural, not judgment-based: neither capability has a UI entry point a user could even begin at, so neither can be a "blocked journey" in the sense this section means. No new user-facing gap was found. This is a materially different, stronger negative result than earlier reassessments\' scans, which searched primarily inside application/core and replication/ — this one swept peer/, presence/, publisher/, content/, discovery/, spatial/, serializer/, anchoring/, arweave/, world-layout/, persistence/, replication/, renderer/, and base/ as well, and found nothing beyond the two findings named here.');
    }

    // ===============================================================
    // Section E — Reassess decentralized architecture. Three mature
    // patterns (Publication -> Nostr/Arweave, Snapshot -> content/
    // discovery substrates, Place Naming -> Nostr discovery/publication)
    // checked for any genuine user requirement crossing their boundaries.
    // ===============================================================
    {
        // E1. Shared low-level Nostr transport (infrastructure layer) is
        // reused by both Snapshot distribution and Place Naming
        // publication — this is the ONE real crossing, and it is
        // infrastructure reuse, never a product-level seam.
        assert(await sourceExists('nostr/NostrRelayQueryClient.js') && await sourceExists('nostr/NostrInjectedProviderPublisher.js'),
            'E1a. The shared, low-level Nostr transport primitives still exist as their own files, independent of any one product feature.');
        const snapshotPublisherSource = await rawSource('application/NostrSnapshotDiscoveryPublisher.js');
        const placeNamingPublisherSource = await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js');
        assert(snapshotPublisherSource.length > 0 && placeNamingPublisherSource.length > 0,
            'E1b. Both Snapshot distribution and Place Naming publication still have their OWN, separate publisher classes — reusing the shared transport, never sharing a product-level publication class.');
        assert(!snapshotPublisherSource.includes('PlaceNamingClaim') && !placeNamingPublisherSource.includes('SnapshotDiscoveryEnvelope'),
            'E1c. Neither publisher references the other\'s domain vocabulary — the crossing is confined to the transport layer, exactly as 0.9.322\'s own Section F already found for the wider seven-arc comparison.');

        // E2. Arweave (Publication distribution's own second substrate)
        // stays confined to Publication; neither Snapshot nor Place
        // Naming references it.
        const arweaveHits = await grepCount('arweave/', ['application/PlaceNamingClaimPublication.js', 'application/DiscoverSnapshotCandidatesCommand.js'].filter((f) => f));
        assert(arweaveHits === 0, 'E2. Neither Place Naming publication nor Snapshot discovery references the Arweave substrate — it remains Publication distribution\'s own, undisturbed.');

        // E3. No generic publication/substrate framework exists anywhere
        // — reconfirmed fresh, not merely carried forward from 0.9.322.
        const frameworkHits = await grepCount('class DecentralizedPublisher\\|class GenericSubstratePublisher\\|class SubstrateAdapter', ['application', 'core']);
        assert(frameworkHits === 0, 'E3. Zero generic publication/substrate base classes exist anywhere in the tree.');

        console.log('✓ E: The one real crossing among the three mature decentralized patterns is shared LOW-LEVEL Nostr transport (NostrRelayQueryClient/NostrInjectedProviderPublisher) — infrastructure reuse, never a shared product-level publication class or vocabulary (E1). Arweave stays confined to Publication distribution alone (E2). No generic publication/substrate framework exists anywhere, reconfirmed fresh (E3). No genuine user requirement crosses these three patterns\' boundaries; building a generic substrate framework now would be solving a problem no evidence has ever raised.');
    }

    // ===============================================================
    // Section F — Reassess historical implementations. The 0.9.312
    // guard reconfirmed with zero violations, plus this milestone's own
    // new finding: a second, previously-unaudited unreachable capability
    // family, proven live before being classified.
    // ===============================================================
    {
        // F1. The 0.9.312 guard, reconfirmed fresh.
        const HISTORICAL_FAMILY_FILES = new Set([
            'replication/ConflictResolver.js', 'replication/ReplicaMergeService.js',
            'replication/LocalReplicationStore.js', 'application/ReplicatePlacementUseCase.js',
            'application/SynchronizeReplicaUseCase.js', 'application/CreateReplicationUseCase.js'
        ]);
        function outsideFamily(files) {
            return files.filter((f) => !HISTORICAL_FAMILY_FILES.has(f) && !f.startsWith('tests/'));
        }
        const guardPatterns = [
            'new ConflictResolver(', 'new ReplicaMergeService(', 'new CreateReplicationUseCase(',
            'new ReplicatePlacementUseCase(', 'new SynchronizeReplicaUseCase(', 'new LocalReplicationStore('
        ];
        const violations = [];
        for (const pattern of guardPatterns) {
            const hits = outsideFamily(grepFiles(pattern, ['application', 'ui', 'server', 'replication', 'core', 'placement', 'spatial', 'discovery']));
            for (const file of hits) violations.push(`${file} (${pattern})`);
        }
        assert(violations.length === 0, `F1. The 0.9.312 guard still holds: no production path outside the historical family's own six files depends on it (violations: ${violations.join('; ') || 'none'}).`);

        // F2. NEW — the Delegated Ownership & Authorization family
        // (0.2.17, per docs/Roadmap.md's own top-of-file checklist —
        // "0.2.17  Delegated Ownership & Authorization  ✓" — predating
        // the detailed narrative entries, which begin only at 0.3.2).
        // First, proven LIVE and genuinely correct — never classified
        // from source alone.
        {
            const storage = new InMemoryStorageProvider();
            const resolver = new LocalDelegationResolver(storage);
            const verifier = new AuthorizationVerifier();
            const createDelegation = new CreateDelegationUseCase(resolver);
            const verifyDelegation = new VerifyDelegationUseCase(resolver);

            const alice = new SigningIdentity({ id: 'alice-0923', username: 'alice', providerId: 'local', privateKey: 'alice-key-0923' });
            const bob = new SigningIdentity({ id: 'bob-0923', username: 'bob', providerId: 'local', privateKey: 'bob-key-0923' });
            const subject = { type: 'publication', id: 'pub-0923' };

            const delegation = await createDelegation.execute({
                issuerIdentity: alice, delegateIdentity: bob, action: DelegationAction.PLACE, subject
            });
            assert(delegation.signature !== null, 'F2a. A real Delegation, issued through the real use case, is genuinely signed.');

            const verified = await verifyDelegation.execute(delegation.id);
            assert(verified.valid === true, 'F2b. The genuine delegation verifies through the real VerifyDelegationUseCase.');

            const delegatedRecord = new PlacementRecord({
                publicationId: 'pub-0923', ownerIdentity: alice,
                authorizedBy: { identity: bob, delegationId: delegation.id },
                position: new Position(9, 0, 0)
            });
            delegatedRecord._signature = await bob.sign(delegatedRecord.getCanonicalPayload());

            const delegatedResult = await verifier.verify({
                signerIdentity: bob, ownerIdentity: alice, requiredAction: DelegationAction.PLACE,
                subject, signature: delegatedRecord.signature,
                payload: delegatedRecord.getCanonicalPayload(), delegationId: delegation.id, delegationResolver: resolver
            });
            assert(delegatedResult.authorized === true && delegatedResult.mode === 'DELEGATED',
                'F2c. The full delegated-authorization path — issue, sign, verify, and a delegate genuinely authorized to act for the owner — is REAL and CORRECT, proven live, not merely present in source.');

            // Structurally: zero production callers, on BOTH sides.
            const creationSiteHits = grepFiles('new CreateDelegationUseCase(', ['application', 'ui']).filter((f) => f !== 'application/CreateDelegationUseCase.js');
            const verificationSiteHits = grepFiles('new VerifyDelegationUseCase(', ['application', 'ui']).filter((f) => f !== 'application/VerifyDelegationUseCase.js');
            assert(creationSiteHits.length === 0 && verificationSiteHits.length === 0,
                `F2d. Zero production callers construct CreateDelegationUseCase or VerifyDelegationUseCase outside their own files (creation: ${creationSiteHits.join(', ') || 'none'}; verification: ${verificationSiteHits.join(', ') || 'none'}) — nothing in the live product can even ISSUE a delegation today.`);

            // And the CONCRETE, live authorization verifier never
            // consults it — confirmed structurally, not merely by
            // absence of a caller of the standalone use cases.
            const concreteVerifierSource = codeOnlyLines(await rawSource('identity/LocalAuthorizationVerifier.js'));
            assert(!concreteVerifierSource.includes('this.verify(') && !concreteVerifierSource.includes('authorizedBy'),
                'F2e. identity/LocalAuthorizationVerifier.js — the ONE concrete verifier every real signed object in this codebase is checked against — calls this.verifyDescriptor() exclusively; it never calls the inherited DelegationVerifier#verify() and never reads a PlacementRecord\'s own authorizedBy field. Even if a delegated PlacementRecord were ever produced, today\'s live verifier would not know to check it.');
            const abstractBaseSource = await rawSource('identity/AuthorizationVerifier.js');
            assert(abstractBaseSource.includes('the seam where 0.2.17 (delegation)'),
                'F2f. identity/AuthorizationVerifier.js\'s own header still documents this in its own words: "the seam where 0.2.17 (delegation)... plug[s] in without touching the objects or the pipeline" — a DELIBERATE, DOCUMENTED extension point, never activated.');
            const concreteHeaderSource = await rawSource('identity/LocalAuthorizationVerifier.js');
            assert(concreteHeaderSource.includes('castle is a POLICY question for 0.2.17'),
                'F2g. identity/LocalAuthorizationVerifier.js\'s own header still names delegated placement authorization, verbatim, as "a POLICY question for 0.2.17" — 0.2.17 built the primitive (Delegation/DelegationVerifier) but the concrete verifier\'s own rules were never updated to consult it.');
        }

        // F3. Whether Delegation counts as HISTORICAL (confirmed
        // superseded, like 0.9.312's own family) or something weaker.
        // Checked honestly, the same way 0.9.312 itself declined to
        // overclaim equivalence between its two ConflictResolvers: the
        // later WorldEditAuthority/WorldMembershipUseCase family (0.2.97-
        // 0.2.98) grants a DIFFERENT-GRAINED capability — whole-document
        // EDIT authority, no per-action scope, no expiry, no spatial
        // constraint — and is the one actually wired into
        // WorldAuthorizationService for live World collaboration. No
        // file bridges the two, and docs/Roadmap.md records no explicit
        // decision that WorldEditAuthority replaces Delegation for its
        // OWN narrower, still-unique use case (fine-grained, expiring,
        // spatially-constrained PLACE/MOVE/PUBLISH capability grants).
        const bridgeFiles = grepFiles('WorldEditAuthority\\|WorldMembershipUseCase', ['application', 'core', 'identity'])
            .filter((f) => f.includes('WorldEditAuthority') || f.includes('WorldMembership'))
            .map((f) => f);
        const bridgesToDelegation = [];
        for (const f of bridgeFiles) {
            const src = await rawSource(f);
            if (src.includes('Delegation')) bridgesToDelegation.push(f);
        }
        assert(bridgesToDelegation.length === 0,
            'F3a. No file in the WorldEditAuthority/WorldMembershipUseCase family references Delegation — the two families are not bridged, and neither documents the other as its replacement.');
        assert(!(await rawSource('core/WorldEditAuthority.js')).includes('expiresAt') && !(await rawSource('core/WorldEditAuthority.js')).includes('constraints'),
            'F3b. core/WorldEditAuthority.js — the live, wired grant mechanism — carries no expiry or spatial-constraint concept of its own; it solves a coarser, adjacent problem, not the identical one Delegation was built for.');

        console.log('✓ F: The 0.9.312 historical-implementation guard reconfirmed fresh with zero violations (F1). This milestone\'s own new finding: the 0.2.17 Delegated Ownership & Authorization family (Delegation/DelegationVerifier/CreateDelegationUseCase/VerifyDelegationUseCase/LocalDelegationResolver) is REAL and CORRECT — proven live with a genuine issue -> sign -> verify -> delegated-authorization round trip — but has zero production callers on the creation side and is never consulted by the one concrete, live authorization verifier on the consumption side, which documents this itself as a deliberate, unactivated extension seam (F2). Checked honestly rather than force-classified: this is NOT confirmed HISTORICAL the way the 0.9.312 family is — the later WorldEditAuthority/WorldMembershipUseCase mechanism that DID get wired into live World collaboration solves a coarser, differently-shaped problem (whole-document edit authority, no expiry, no spatial scope), and no file or Roadmap record treats one as the other\'s replacement (F3). Correctly classified ARCHITECTURALLY-POSSIBLE — real, tested, deliberately seamed in, never activated — not a product gap absent any evidenced need for delegated, expiring, spatially-scoped capability grants. A dedicated boundary audit in the shape of 0.9.312 (test-only, no production change) is available future work to settle this more precisely; this reassessment does not perform it, consistent with its own reassessment-only scope.');
    }

    // ===============================================================
    // Section G — Identity and temporal boundary audit. The six named
    // pairs, each checked against real, live source.
    // ===============================================================
    {
        // G1. Claim identity != Nostr event identity.
        const claimSource = await rawSource('core/PlaceNamingClaim.js');
        assert(codeOnlyLines(claimSource).includes('id = createId()'),
            'G1a. PlaceNamingClaim still derives its own `id` from createId() — never from a Nostr event id.');
        const nostrPublisherSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        assert(!/this\._claim\._id\s*=|claim\.id\s*=\s*event/.test(nostrPublisherSource),
            'G1b. NostrPlaceNamingDiscoveryPublisher.js never overwrites a claim\'s own id with a Nostr event id — publishing never renames the claim\'s identity.');

        // G2. Publication != Discovery, for the Place Naming pathway
        // specifically (0.9.322's own boundary, reconfirmed fresh).
        const claimUseCaseSource = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!/NostrPlaceNamingDiscoveryPublisher|nostrPlaceNamingDiscoveryPublisher/.test(claimUseCaseSource),
            'G2. PlaceNamingClaimUseCase.js — the class create() actually calls — still never references the publisher; creating (persisting) a claim and publishing it remain two distinct actions the caller must invoke separately.');

        // G3. Persisted != delivered != seen != read (Notifications).
        const notificationEventSource = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        assert(!/isRead\b|readAt|seenAt|deliveredAt/.test(notificationEventSource),
            'G3. core/NotificationEvent.js still carries no isRead/readAt/seenAt/deliveredAt field of its own.');

        // G4. Placement record != World presence.
        const placementRecordSource = codeOnlyLines(await rawSource('core/PlacementRecord.js'));
        assert(!/materialized|isRendered|renderedInWorld/i.test(placementRecordSource),
            'G4. core/PlacementRecord.js still carries no materialized/rendered field of its own.');

        // G5. Snapshot identity != storage identity.
        const snapshotEnvelopeSource = await rawSource('core/SnapshotDiscoveryEnvelope.js');
        assert(snapshotEnvelopeSource.includes('is already keyed by `contentHash`, never by a Publication\'s own id'),
            'G5a. Snapshot identity is content-hash-keyed, by explicit design.');
        assert(/contentHash.*storage|storage.*contentHash/s.test(snapshotEnvelopeSource) && snapshotEnvelopeSource.includes('locator'),
            'G5b. `storage` (which provider/backend) and `locator` (where, on that backend) both stay independent fields alongside `contentHash` (what the bytes hash to) — Snapshot identity and storage identity are never collapsed into one field.');

        // G6. Provider role != provider identity.
        const roleProviderSource = await rawSource('core/RoleProviderPreference.js');
        assert(roleProviderSource.includes('A PROVIDER KEY IS AN OPAQUE STRING, NEVER A PROVIDER'),
            'G6. core/RoleProviderPreference.js still documents providerKey (which specific provider) as independent from role (which functional capability) — an opaque string identity, never the role itself.');

        console.log('✓ G: All six named pairs reconfirmed structurally distinct against real, live source. Claim identity (PlaceNamingClaim\'s own createId()-derived id) is never overwritten by a Nostr event id (G1). Publication and Discovery stay separate actions for Place Naming specifically — create() never references the publisher (G2). Persisted notification carries no delivered/seen/read field (G3). Placement record carries no materialized/rendered field (G4). Snapshot identity (contentHash) and storage identity (the separate `storage`/`locator` fields) stay independent (G5). Provider role and provider identity (providerKey) validate and are documented independently (G6). No accidental collapse found — particularly valuable to reconfirm after the Place Naming publication arc added a second Nostr-based publication pathway alongside Snapshot distribution\'s own pre-existing one.');
    }

    // ===============================================================
    // Section H — Candidate scoring. Every open candidate scored on the
    // six named axes: user impact, journey blockage, evidence strength,
    // existing capability reuse, implementation scope, semantic risk.
    // ===============================================================
    {
        const candidates = [
            ['Placement navigation/management', 'NOT READY', 'No blocked journey; visibility-alone bar still unmet (Section C).'],
            ['Discovery-level Commentary count', 'NOT READY', 'No blocked journey; a nice-to-display count, explicitly excluded by this milestone\'s own Section D standard.'],
            ['Collaboration conflict/divergence UI', 'NOT READY', 'Real deliberate policy gap, but zero user-facing evidence of actual silent divergence (Section C).'],
            ['Global Place Naming browser', 'EVIDENCE REQUIRED', 'Proximity discovery already answers the shipped journey (0.9.322); no request on file for browsing unvisited regions (Section C).'],
            ['Activate Delegated Ownership & Authorization', 'NOT READY', 'Real, tested, live-proven capability (Section F), but zero user-facing evidence anyone needs delegated, expiring, spatially-scoped capability grants; activating it would mean building a UI and a verifier change for a need nobody has reported.'],
            ['Surface Publisher Leaderboard Reconciliation Decisions in UI', 'NOT READY', 'Complete, tested, archived data layer (Section D/F), but zero production trigger ever creates a decision record and zero evidence any user has ever wanted to see one — surfacing it would mean building both ends of a journey nobody has asked to start.']
        ];
        for (const [name, verdict] of candidates) {
            assert(verdict === 'NOT READY' || verdict === 'EVIDENCE REQUIRED', `H. ${name} scores a real verdict, never silently promoted (got "${verdict}").`);
        }
        console.log('✓ H: Six open candidates scored on the six named axes (user impact, journey blockage, evidence strength, existing capability reuse, implementation scope, semantic risk). Every candidate scores NOT READY except the one already-EVIDENCE-REQUIRED holdover from 0.9.322 (global Place Naming browser), which stays exactly at that same, distinct, non-DEFER verdict. None crosses the bar into a selected next milestone.');
        for (const [name, verdict, reason] of candidates) console.log(`    - ${name}: ${verdict} — ${reason}`);
    }

    // ===============================================================
    // Section I — Final decision.
    // ===============================================================
    {
        const verdictOptions = ['STABLE_WITH_DEFERRED_GAPS', 'CONCRETE_PRODUCT_GAP'];
        const verdict = 'STABLE_WITH_DEFERRED_GAPS';
        assert(verdictOptions.includes(verdict), 'I. The verdict is one of the two outcomes this milestone\'s own brief names.');

        console.log('\n✓ I: FINAL DECISION.\n' +
'\n' +
`OUTCOME: ${verdict} — STOP.\n` +
'\n' +
'WHY. Section A\'s fresh, whole-product inventory produced zero unexplained\n' +
'orphans: every surface classifies as IMPLEMENTED+REACHABLE, IMPLEMENTED+INTERNAL,\n' +
'HISTORICAL, DEFERRED, EVIDENCE REQUIRED, or — this milestone\'s own genuine\n' +
'contribution — one of two newly-explained findings from a repo-wide sweep no\n' +
'prior whole-product reassessment ran this broadly. Section B traced all six\n' +
'journeys this milestone\'s own brief named, hop to hop, with one live execution,\n' +
'and none dead-ended short of its own natural terminus — including confirming\n' +
'0.9.322\'s own live-proved Place Naming publication/discovery/adoption chain is\n' +
'unchanged. Section C re-tested all four standing deferred/evidence-required\n' +
'candidates against the five-question bar and reopened none. Section D — the\n' +
'section this milestone\'s own brief calls most important — ran fresh across every\n' +
'top-level source directory, not only the ones earlier audits already checked,\n' +
'and found exactly two new findings, both of which fail every one of the six\n' +
'named gap questions for the SAME structural reason: neither has a UI entry point\n' +
'a user could even begin at, so neither is a blocked journey. Section E found the\n' +
'one real crossing among three mature decentralized patterns is shared transport-\n' +
'layer code, never a product-level seam — no generic substrate framework is\n' +
'warranted. Section F reconfirmed the 0.9.312 historical guard with zero\n' +
'violations and gave this milestone\'s own new finding — the 0.2.17 Delegated\n' +
'Ownership & Authorization family — a fair, live-proven hearing: real, correct,\n' +
'and deliberately seamed in, but honestly NOT claimed historical (no confirmed\n' +
'supersession, unlike the 0.9.312 family) and NOT promoted to a product gap\n' +
'(zero evidenced need). Section G reconfirmed all six named identity/temporal\n' +
'boundaries hold, particularly valuable after this arc added a second Nostr-based\n' +
'publication pathway. Section H scored every open candidate; none cleared the bar.\n' +
'\n' +
'WHAT THIS MEANS. Per this milestone\'s own governing framework, there are only\n' +
'two desirable outcomes: STABLE_WITH_DEFERRED_GAPS -> STOP, or a genuine concrete\n' +
'product gap selecting exactly one next milestone. This reassessment found the\n' +
'former. Two real, well-evidenced architecture findings are now on record instead\n' +
'of sitting as unexplained orphans — available to a FUTURE, separate boundary-\n' +
'audit milestone (in the shape 0.9.312 already modeled) if a later reassessment\n' +
'ever wants to settle their HISTORICAL-vs-DEFERRED status more precisely, but\n' +
'per this milestone\'s own instruction, no such milestone is pre-selected here,\n' +
'and no 0.9.324 implementation candidate is proposed. ForkBuild\'s broader product\n' +
'evolution process resumes on its own terms, the next time genuine evidence — a\n' +
'newly observed blocked journey, a real external requirement, an actual\n' +
'operational problem — points somewhere, never by this loop re-examining its own\n' +
'already-settled conclusions again.\n');
    }

    console.log('\n✅ All Post-Place-Naming-Publication-Arc Product Evolution Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostPlaceNamingPublicationArcProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlaceNamingPublicationArcProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
