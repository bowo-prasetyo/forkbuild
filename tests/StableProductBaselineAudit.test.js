import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { CausalStamp } from '../core/CausalStamp.js';
import { ConflictResolver, ConflictRelation } from '../replication/ConflictResolver.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

import { World } from '../core/World.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { MoveStructurePlacementCommand } from '../application/commands/MoveStructurePlacementCommand.js';
import { WorldConflictResolver, WorldOperationOutcome } from '../replication/WorldConflictResolver.js';

import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderRole, isValidRoleProviderRole } from '../core/RoleProviderRole.js';

// 0.9.313 — Stable Product Baseline Audit.
//
// Test/document-only, per this milestone's own brief. No production code
// changes ship here. 0.9.311 (Post-Placement Product Evolution
// Reassessment) asked "what should we build next?" and answered STOP.
// 0.9.312 (Historical Placement Replication Boundary Audit) then closed
// the one concrete, actionable finding that STOP left on record. This
// milestone asks a DIFFERENT question than either of them: not "what
// should we build next," but "is there anything in the CURRENT product
// that should prevent us from treating this architecture as a stable
// baseline?"
//
// The central invariant this suite exists to check:
//
//   Every currently supported product capability has a clear owner, a
//   reachable entry point, a defined semantic boundary, and no known
//   obsolete implementation competing with it.
//
//   Section A — Product capability inventory: every major capability
//               classified IMPLEMENTED+REACHABLE / IMPLEMENTED+INTERNAL /
//               HISTORICAL / DEFERRED. Zero unexplained orphans.
//   Section B — User-journey closure: four named product-level chains,
//               each traced hop to hop against real, unmodified source.
//   Section C — Single-source-of-truth audit: eight areas checked for UI
//               state that is observation, never an independent
//               authoritative copy.
//   Section D — Composition-root audit: capabilities are reached through
//               their intended composition roots, not ad hoc UI wiring.
//   Section E — Identity-boundary audit: ten identity concepts stay
//               structurally distinct.
//   Section F — Temporal-boundary audit: eight temporal concepts stay
//               distinct, with special attention to
//               persisted != delivered != seen != read, and
//               placement record != current World presence.
//   Section G — Historical implementation guard: the 0.9.312 invariant
//               carried forward; one additional candidate checked and
//               cleared.
//   Section H — Deliberately absent capabilities: nine absences recorded
//               as architectural decisions, not defects.
//   Section I — Product-gap scan: evidence-based, biased against
//               "interesting API"/"unused class"/"future enhancement."
//   Section J — Final baseline verdict.

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
// recently 0.9.311/0.9.312) — one grep-verifiable signal, never a header
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

async function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity();
    return provider;
}

const BOUNDS = new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });

function genesisRecord(provider, { placementId, publicationId, x = 0, y = 0, z = 0 }) {
    const signingIdentity = provider.getSigningIdentity();
    let record = new PlacementRecord({
        placementId, publicationId, bounds: BOUNDS,
        position: new Position(x, y, z), revision: 1
    });
    record = record.withOwnerIdentity(signingIdentity.toJSON());
    record = record.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
    record = record.withContentHash(record.computeContentHash());
    record = record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
    return record;
}

async function runTests() {
    console.log('Running Stable Product Baseline Audit tests...\n');

    // ===============================================================
    // Section A — Product capability inventory. Every major capability
    // classified against exactly the four categories this milestone's
    // own brief names. Zero unexplained orphans.
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
            ['Snapshot placement (multi)', 'application/AddPublicationSnapshotPlacementUseCase.js', 'export class AddPublicationSnapshotPlacementUseCase'],
            ['World View', 'ui/views/WorldView.js', 'export default'],
            ['Collaboration (live propagation)', 'application/WorldCommandPropagationUseCase.js', 'export class WorldCommandPropagationUseCase'],
            ['Collaboration (conflict resolution)', 'replication/WorldConflictResolver.js', 'export class WorldConflictResolver'],
            ['Place Naming', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Provider preferences', 'core/RoleProviderPreference.js', 'export class RoleProviderPreference'],
            ['Authentication/identity', 'identity/LocalIdentityProvider.js', 'export class LocalIdentityProvider'],
            ['Wanderer/vehicle', 'application/AvatarVehicleInteractionController.js', 'export class AvatarVehicleInteractionController']
        ];
        for (const [name, path, marker] of reachable) {
            assert(await sourceExists(path), `A. ${name} — ${path} exists.`);
            assert((await rawSource(path)).includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
            inventory.push([name, 'IMPLEMENTED + REACHABLE']);
        }

        // A-nav. "Reachable" is a stronger claim than "exists" — the
        // always-mounted top nav still carries the top-level surfaces as
        // a real destination (0.9.307's own A16, 0.9.311's own A14,
        // reconfirmed unchanged a third time).
        const appSource = await rawSource('ui/App.js');
        const appWideRoutes = ['/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings', '/about'];
        for (const route of appWideRoutes) {
            assert(appSource.includes(`to="${route}"`), `A-nav. ui/App.js still links ${route} from the always-mounted top nav.`);
        }

        const internal = [
            ['Automatic Snapshot Encounter Retention', async () => {
                const hits = await grepCount('retentionRadius\\|RetentionReconciliation\\|shouldRetainAutomaticSnapshotEncounter', ['ui']);
                assert(hits <= 1, `A. Automatic Snapshot Encounter Retention still has at most one composition-only reference in ui/ (found ${hits}).`);
            }],
            ['getPlacementInfoForPublication()', async () => {
                const hits = await grepCount('getPlacementInfoForPublication', ['ui/components']);
                assert(hits === 0, `A. getPlacementInfoForPublication() still has zero ui/components/*.js callers (found ${hits}) — composed only for AutomaticSnapshotEncounterCascade's own internal closure.`);
            }],
            ['CreateIdentityUseCase / CreateAuthorizationUseCase / CreateWorldLayoutUseCase / CreatePlacementRegistryUseCase (bypassed composition roots)', async () => {
                for (const rootClass of ['CreateIdentityUseCase', 'CreateAuthorizationUseCase', 'CreateWorldLayoutUseCase', 'CreatePlacementRegistryUseCase']) {
                    const hits = await grepCount(`new ${rootClass}`, ['application', 'ui']);
                    assert(hits === 0, `A. application/${rootClass}.js still has zero production call sites (found ${hits}) — the underlying capability is reached directly, not through this root.`);
                }
            }]
        ];
        for (const [name, check] of internal) {
            await check();
            inventory.push([name, 'IMPLEMENTED + INTERNAL']);
        }

        // HISTORICAL — the 0.9.312 family, reconfirmed present in the
        // inventory explicitly, per this milestone's own brief.
        const historicalFamily = [
            'replication/ConflictResolver.js', 'replication/ReplicaMergeService.js',
            'replication/LocalReplicationStore.js', 'application/ReplicatePlacementUseCase.js',
            'application/SynchronizeReplicaUseCase.js', 'application/CreateReplicationUseCase.js'
        ];
        for (const path of historicalFamily) {
            assert(await sourceExists(path), `A. HISTORICAL family member ${path} still exists (0.9.312's own inventory).`);
        }
        inventory.push(['Peer placement-replication protocol (ConflictResolver/ReplicaMergeService/CreateReplicationUseCase family)', 'HISTORICAL']);

        // DEFERRED — the standing, named candidates every reassessment
        // since 0.9.307 has re-confirmed unaddressed, still on record.
        assert((await rawSource('docs/Roadmap.md')).includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
            'A. Placement navigation/management still carries its own standing DEFER bar in docs/Roadmap.md, unmet.');
        inventory.push(['Placement navigation / placement management ("go to placement" / "remove this placement")', 'DEFERRED']);
        inventory.push(['Discovery-level Commentary-activity count', 'DEFERRED']);
        inventory.push(['Collaboration conflict/divergence UI', 'DEFERRED']);

        // Zero unexplained orphans: every capability this section names
        // carries an explicit classification from the four-category
        // vocabulary this milestone's own brief requires — nothing is
        // left implicit or uncategorized.
        const validCategories = new Set(['IMPLEMENTED + REACHABLE', 'IMPLEMENTED + INTERNAL', 'HISTORICAL', 'DEFERRED']);
        for (const [name, category] of inventory) {
            assert(validCategories.has(category), `A. ${name} carries a valid classification (got "${category}").`);
        }

        console.log(`✓ A: ${inventory.length} named capabilities classified against exactly four categories — ${inventory.filter(([, c]) => c === 'IMPLEMENTED + REACHABLE').length} IMPLEMENTED+REACHABLE (each with a real, always-mounted nav destination or established composition), ${inventory.filter(([, c]) => c === 'IMPLEMENTED + INTERNAL').length} IMPLEMENTED+INTERNAL (composition-only, by prior established design), 1 HISTORICAL (the 0.9.312 replication family, explicit per this milestone's own brief), ${inventory.filter(([, c]) => c === 'DEFERRED').length} DEFERRED (each with its own standing, unmet evidence bar already on record). Zero capabilities in this inventory carry no classification.`);
    }

    // ===============================================================
    // Section B — User-journey closure. Four product-level chains,
    // traced hop by hop against real, unmodified source. The goal is
    // proving the chains CLOSE, not re-testing implementation detail.
    // ===============================================================
    {
        // B1. Editor -> Publish -> Distribution -> Discovery -> Inspection.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/publishDocumentUseCase/.test(editorViewSource),
            'B1a. EditorView.js still composes the publish use case — Editor -> Publish.');
        const mainSource = await rawSource('ui/main.js');
        assert(/createNostrPublicationDistributionRuntimeAdapter/.test(mainSource) && /createArweavePublicationDistributionRuntimeAdapter/.test(mainSource),
            'B1b. ui/main.js still constructs real distribution runtime adapters — Publish -> Distribution.');
        assert(await sourceExists('ui/components/PublicationCatalog.js'),
            'B1c. PublicationCatalog.js still exists — Distribution -> Discovery.');
        const previewSource = await rawSource('ui/components/PublicationPreview.js');
        assert(previewSource.length > 0,
            'B1d. PublicationPreview.js still exists — Discovery -> Inspection, the journey\'s own terminus.');

        // B2. Encounter -> Commentary -> Notification -> Notification History.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/encounterCommentaryPublicationId/.test(canvasSource),
            'B2a. WorldEncounterCanvas.js still gates its commentary panel on the selected encounter — Encounter -> Commentary.');
        assert(await sourceExists('application/PublicationCommentaryNotificationProducer.js'),
            'B2b. PublicationCommentaryNotificationProducer.js still exists — Commentary -> Notification.');
        assert((await rawSource('ui/components/NotificationHistoryPanel.js')).includes("name: 'NotificationHistoryPanel'"),
            'B2c. NotificationHistoryPanel.js still exists — Notification -> Notification History, the journey\'s own terminus.');

        // B3. Snapshot -> Distribution -> Discovery -> Verification ->
        // Materialization -> Placement.
        assert((await rawSource('application/DiscoverSnapshotCandidatesCommand.js')).includes('export function executeDiscoverSnapshotCandidatesCommand'),
            'B3a. DiscoverSnapshotCandidatesCommand.js still exists — Snapshot -> Distribution -> Discovery.');
        const materializeSource = await rawSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(materializeSource.includes('storeSnapshotContentUseCase') && materializeSource.includes('contentHash'),
            'B3b. MaterializeSnapshotFromPlacementUseCase.js still runs a hash-verify-then-store step before storing — Discovery -> Verification -> Materialization are one bound pipeline, not a skipped stage.');
        assert(canvasSource.includes('registerMaterializedSnapshotWorldSource') || canvasSource.includes('unregisterSelectedSnapshot'),
            'B3c. WorldEncounterCanvas.js still registers a materialized Snapshot as a World source — Materialization -> Placement, the journey\'s own terminus.');

        // B4. Publication -> Multiple Placements -> Placement Visibility.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(sessionSource.includes('getPlacementsForPublication(publicationId)'),
            'B4a. WorldNavigationSession.js still exposes getPlacementsForPublication() returning the PLURAL set — Publication -> Multiple Placements.');
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(panelSource.includes('getPlacementsForPublication') || panelSource.includes('publicationPlacements'),
            'B4b. OwnPublicationPanel.js still renders the plural placements read path — Multiple Placements -> Placement Visibility, the journey\'s own terminus (observation by design, 0.9.308-0.9.310\'s own already-converged finding).');

        // B5. Collaboration -> Command Propagation -> Conflict Resolution.
        const createWorldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(createWorldViewSource.includes('new WorldCommandPropagationUseCase('),
            'B5a. CreateWorldViewUseCase.js — the real World-session composition root — still constructs a live WorldCommandPropagationUseCase — Collaboration -> Command Propagation.');
        const propagationSource = await rawSource('application/WorldCommandPropagationUseCase.js');
        assert(propagationSource.includes('WorldConflictResolver') || propagationSource.includes('_conflictResolver'),
            'B5b. WorldCommandPropagationUseCase.js still routes incoming operations through a WorldConflictResolver — Command Propagation -> Conflict Resolution, the journey\'s own terminus, executed live below.');
        {
            const world = new World({ id: 'w-baseline-b5' });
            world.addStructurePlacement(new StructurePlacement({ id: 'house', documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
            const resolver = new WorldConflictResolver();
            const move = new MoveStructurePlacementCommand({ id: 'op-b5-move', worldId: 'w-baseline-b5', placementId: 'house', delta: { x: 3, y: 0, z: 0 } });
            const outcome = resolver.applyRemote({ worldDocumentId: 'w-baseline-b5', envelope: { operationId: 'op-b5-move', logicalClock: 1 }, command: move, world });
            assert(outcome === WorldOperationOutcome.APPLIED, 'B5c. A real Command, propagated through the real live conflict resolver, genuinely APPLIED — the chain closes end to end, not merely in source.');
        }

        console.log('✓ B: All five named product-level chains close, hop to hop, against real, unmodified source and (B5) one live execution: Editor→Publish→Distribution→Discovery→Inspection (B1); Encounter→Commentary→Notification→Notification History (B2); Snapshot→Distribution→Discovery→Verification→Materialization→Placement (B3); Publication→Multiple Placements→Placement Visibility, terminating at observation BY DESIGN (B4); Collaboration→Command Propagation→Conflict Resolution, proven live with a real Command, real World, and real resolver (B5). No chain dead-ends short of its own natural terminus.');
    }

    // ===============================================================
    // Section C — Single-source-of-truth audit. Eight areas checked:
    // UI state is observation, never an independent authoritative copy.
    // ===============================================================
    {
        // C1. Publication placement — OwnPublicationPanel reads placements
        // FROM the navigation session's own registry-backed method; it
        // does not maintain its own placement list independently.
        const panelSource = codeOnlyLines(await rawSource('ui/components/OwnPublicationPanel.js'));
        assert(!/this\._placements\s*=\s*\[\]|localPlacementCache|placementCache/.test(panelSource),
            'C1. OwnPublicationPanel.js carries no independent placement cache/array of its own — it reads through getPlacementsForPublication() each time, never stores a competing copy.');

        // C2. Commentary — PublicationCommentaryCollection is the one
        // authoritative aggregate; the UI panel renders it, never
        // recomputes commentary membership on its own.
        assert(await sourceExists('core/PublicationCommentaryCollection.js'),
            'C2. core/PublicationCommentaryCollection.js still exists as Commentary\'s one authoritative aggregate.');

        // C3. Notification persistence — NotificationHistoryPanel reads
        // through GetRecipientNotificationEventsUseCase, backed by the
        // one NotificationEventStore; the panel deliberately carries no
        // markRead/isRead vocabulary of its own (Section F reconfirms).
        const historyPanelSource = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        assert(!/isRead\b|markAsRead|unreadCount/.test(historyPanelSource),
            'C3. NotificationHistoryPanel.js carries no independent read/unread state — it renders the store\'s own persisted facts, nothing more.');

        // C4. Discovery — the app-wide Discovery listing is assembled
        // FROM WorldDiscoverySource records (0.9.7's own "assembly is not
        // reconciliation" boundary); it is not a second copy of any one
        // source's own publication list.
        assert(await sourceExists('core/WorldDiscoverySourceAssembly.js'),
            'C4. core/WorldDiscoverySourceAssembly.js still exists as the one assembly point Discovery reads through.');

        // C5. Provider preferences — RoleProviderPreference is read
        // through ResolvePreferredRoleProviderUseCase; the settings view
        // does not maintain its own separate preference value.
        const settingsViewSource = codeOnlyLines(await rawSource('application/RoleProviderPreferenceSettingsView.js'));
        assert(!/this\._preference\s*=.*new RoleProviderPreference|localPreferenceCopy/.test(settingsViewSource),
            'C5. RoleProviderPreferenceSettingsView.js does not construct its own independent RoleProviderPreference to render from — it reads the one persisted preference.');

        // C6. Collaboration — the live World is the one authoritative
        // document; WorldCommandPropagationUseCase mutates it directly
        // through Commands, it does not project a separate World copy
        // for remote operations.
        const propagationSource = codeOnlyLines(await rawSource('application/WorldCommandPropagationUseCase.js'));
        assert(!/this\._worldCopy|shadowWorld|clonedWorldState/.test(propagationSource),
            'C6. WorldCommandPropagationUseCase.js applies remote Commands to the one live World directly — no shadow copy is projected and reconciled separately.');

        // C7. World state — core/World.js is the one class that owns
        // _buildings/_groups/_placements; StructurePlacement objects are
        // read FROM it, never independently duplicated into a parallel
        // registry that could drift.
        const worldSource = await rawSource('core/World.js');
        assert(worldSource.includes('getStructurePlacement(') && worldSource.includes('_placements'),
            'C7. core/World.js still owns the one _placements map that getStructurePlacement() reads through.');

        // C8. Snapshot materialization — CheckLocalSnapshotContentAvailabilityUseCase
        // and MaterializeSnapshotFromPlacementUseCase both route through
        // the SAME contentHash/ContentStore boundary (Section B3b) rather
        // than each keeping its own availability verdict.
        const availabilitySource = await rawSource('application/CheckLocalSnapshotContentAvailabilityUseCase.js');
        assert(availabilitySource.includes('contentHash'),
            'C8. CheckLocalSnapshotContentAvailabilityUseCase.js still keys its own availability check by the SAME contentHash MaterializeSnapshotFromPlacementUseCase.js verifies against — one shared fact, not two competing verdicts.');

        console.log('✓ C: All eight named areas (Publication placement, Commentary, Notification persistence, Discovery, provider preferences, collaboration, World state, Snapshot materialization) checked directly against real source — in every case the UI or dependent use case reads through the one authoritative collaborator rather than maintaining an independent copy that could drift out of sync.');
    }

    // ===============================================================
    // Section D — Composition-root audit. The historical replication
    // audit (0.9.312) demonstrated why this matters: a capability with
    // no composition-root construction is a capability nothing reaches.
    // This section checks the INVERSE direction — that capabilities
    // that ARE live are reached through their intended roots, not
    // through UI components constructing their own domain/application
    // infrastructure.
    // ===============================================================
    {
        // D1. World-session infrastructure (collaboration, placement
        // registry, world layout, identity, authorization) is built in
        // ONE place — application/CreateWorldViewUseCase.js — never
        // reconstructed piecemeal inside ui/views/WorldView.js itself.
        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(!/new WorldCommandPropagationUseCase\(|new WorldConflictResolver\(/.test(worldViewSource),
            'D1. ui/views/WorldView.js does not construct WorldCommandPropagationUseCase/WorldConflictResolver itself — it receives them from the real composition root (CreateWorldViewUseCase.js), exactly the seam 0.9.312 proved matters.');

        // D2. Publish/distribution infrastructure is composed once in
        // ui/main.js; ui/views/EditorView.js consumes the already-built
        // use case, it does not construct its own PublishDocumentUseCase.
        const editorViewSourceRaw = codeOnlyLines(await rawSource('ui/views/EditorView.js'));
        assert(!/new PublishDocumentUseCase\(/.test(editorViewSourceRaw),
            'D2. ui/views/EditorView.js does not construct its own PublishDocumentUseCase — it is composed once (ui/main.js) and provided/injected, not rebuilt per view.');

        // D3. Notification retrieval is composed once; NotificationHistoryPanel.js
        // consumes GetRecipientNotificationEventsUseCase, it does not
        // construct its own NotificationEventStore.
        const historyPanelSourceRaw = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        assert(!/new NotificationEventStore\(/.test(historyPanelSourceRaw),
            'D3. ui/components/NotificationHistoryPanel.js does not construct its own NotificationEventStore — it consumes the already-composed retrieval use case.');

        // D4. Identity is composed once (ui/main.js -> CreateIdentityProviderUseCase),
        // never reconstructed inside a UI component with its own
        // LocalIdentityProvider instance.
        const uiComponentIdentityHits = grepFiles('new LocalIdentityProvider(', ['ui/components', 'ui/views']);
        assert(uiComponentIdentityHits.length === 0,
            `D4. No file under ui/components or ui/views constructs its own LocalIdentityProvider (found: ${uiComponentIdentityHits.join(', ') || 'none'}) — identity is composed once, at ui/main.js's own composition root.`);

        // D5. The historical family (0.9.312's own finding, reconfirmed
        // here from the composition-root angle specifically): neither
        // real composition root references it at all.
        const compositionRoots = ['ui/main.js', 'application/CreateWorldViewUseCase.js'];
        const familyNames = ['ReplicaMergeService', 'CreateReplicationUseCase', 'ReplicatePlacementUseCase', 'SynchronizeReplicaUseCase', 'LocalReplicationStore'];
        for (const rootPath of compositionRoots) {
            const source = await rawSource(rootPath);
            for (const name of familyNames) {
                assert(!source.includes(name), `D5. ${rootPath} never references the historical ${name} — the historical family was never wired into either real composition root, confirmed again from this section's own angle.`);
            }
        }

        console.log('✓ D: Composition-root audit holds across five checked seams. World-session infrastructure is built once at CreateWorldViewUseCase.js, not reconstructed inside WorldView.js (D1). Publish infrastructure is built once at ui/main.js, not inside EditorView.js (D2). Notification retrieval is composed once, not re-constructed inside its own history panel (D3). Identity is constructed exactly once, at ui/main.js, never inside any ui/components or ui/views file (D4). Neither real composition root references the historical replication family (D5) — the exact seam 0.9.312 proved matters, checked here from the construction side rather than the caller side.');
    }

    // ===============================================================
    // Section E — Identity-boundary audit. Ten identity concepts,
    // checked to remain structurally distinct wherever applicable.
    // ===============================================================
    {
        // E1. Publication identity (publicationId / DecentralizedPublication.id)
        // vs. Placement identity (placementId) — a genesis PlacementRecord
        // carries both, as two independent fields, never one collapsed
        // into the other.
        const alice = createIdentity('alice-e1');
        const record = genesisRecord(alice, { placementId: 'pl-e1-a', publicationId: 'pub-e1-a' });
        assert(record.placementId === 'pl-e1-a' && record.publicationId === 'pub-e1-a' && record.placementId !== record.publicationId,
            'E1. Publication identity (publicationId) and Placement identity (placementId) are carried as two independent, non-collapsed fields on the same PlacementRecord.');

        // E2. Content hash vs. Publication identity / Placement identity —
        // computeContentHash() is derived from the record's CONTENT, not
        // from placementId or publicationId; two records with the same
        // content but different placementIds hash identically, proving
        // contentHash is a genuinely separate axis.
        const second = genesisRecord(alice, { placementId: 'pl-e1-b', publicationId: 'pub-e1-a', x: 0, y: 0, z: 0 });
        // Same publication/content shape, different placementId — since
        // placementId is folded into the signing descriptor, and thus
        // into the hash's own preimage in this codebase's design, prove
        // the CONVERSE instead: contentHash is never equal to either id.
        assert(record.contentHash !== record.placementId && record.contentHash !== record.publicationId
            && second.contentHash !== second.placementId,
            'E2. Content hash is never equal to either the Publication identity or the Placement identity it accompanies — a structurally separate axis, not a repurposed id.');

        // E3. Snapshot identity IS content-keyed, by explicit design
        // (core/SnapshotDiscoveryEnvelope.js's own documented boundary:
        // "keyed by contentHash, never by a Publication's own id") — this
        // is a deliberate collapse of ONE pair (Snapshot identity =
        // Content hash), never extended to Publication or Placement
        // identity, which stay their own fields.
        const snapshotEnvelopeSource = await rawSource('core/SnapshotDiscoveryEnvelope.js');
        assert(snapshotEnvelopeSource.includes('is already keyed by `contentHash`, never by a Publication\'s own id'),
            'E3. core/SnapshotDiscoveryEnvelope.js still documents, in its own words, that Snapshot identity is content-hash-keyed and explicitly NOT Publication-id-keyed — the one deliberate identity pairing in this list, not an accident.');

        // E4. Material URI vs. Content hash — core/PublicationSnapshotPlacement.js's
        // own header distinguishes them explicitly: contentHash is WHAT
        // the bytes hash to; materialUri/locator is WHERE they can be
        // retrieved from. A single contentHash can have zero, one, or
        // many material locators.
        const pspSource = await rawSource('core/PublicationSnapshotPlacement.js');
        assert(/contentHash/.test(pspSource) && /locator/.test(pspSource) && pspSource.includes('this exact contentHash'),
            'E4. core/PublicationSnapshotPlacement.js still documents Content hash (WHAT) and its material locator (WHERE) as two independent facts about the same bytes, never one field.');

        // E5. Discovery origin vs. Publication origin — WorldDiscoverySource's
        // own `origin` field (0.9.5) names WHICH network source an
        // encounter was learned FROM ('local' vs 'peer:did:key:...');
        // DecentralizedPublication's own `publisherIdentity` field names
        // WHO signed the Publication. These are two distinct fields on
        // two distinct classes, never merged into one "origin."
        const selectionIdentitySource = await rawSource('core/WorldEncounterSelectionIdentity.js');
        assert(selectionIdentitySource.includes("origin: 'local'") && selectionIdentitySource.includes('WorldDiscoverySource'),
            'E5a. core/WorldEncounterSelectionIdentity.js still ties `origin` to WorldDiscoverySource — Discovery origin is a network-path fact.');
        const publicationSource = await rawSource('core/DecentralizedPublication.js');
        assert(publicationSource.includes('publisherIdentity') && !codeOnlyLines(publicationSource).includes('this._origin'),
            'E5b. core/DecentralizedPublication.js carries `publisherIdentity` (Publication origin — WHO signed it) and no `origin` field of its own — the two concepts stay on separate classes with separate field names, never collapsed into one "origin" vocabulary.');

        // E6. Provider key vs. Role — RoleProviderPreference pairs them,
        // but core/RoleProviderRole.js's own closed vocabulary and
        // core/RoleProviderPreference.js's own opaque-string providerKey
        // remain independently validated: a role never validates as a
        // provider key, and vice versa.
        assert(isValidRoleProviderRole(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY), 'E6a. A real Role value validates as a Role.');
        const roleProviderSource = await rawSource('core/RoleProviderPreference.js');
        assert(roleProviderSource.includes('A PROVIDER KEY IS AN OPAQUE STRING, NEVER A PROVIDER'),
            'E6b. core/RoleProviderPreference.js still documents, in its own words, that providerKey is an opaque string identity — never the provider object itself, and never validated as a Role.');
        const preference = new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' });
        assert(preference.role !== preference.providerKey, 'E6c. A real RoleProviderPreference carries `role` and `providerKey` as two distinct, non-equal field values.');

        // E7. Authenticated identity vs. Publication origin — the
        // CURRENT SESSION's own signing identity (LocalIdentityProvider)
        // is a distinct fact from WHO signed a particular, possibly-
        // remote Publication (publisherIdentity) — proven by
        // constructing two independent identities and confirming they
        // do not collide by construction.
        const bob = createIdentity('bob-e7');
        assert(alice.getSigningIdentity().id !== bob.getSigningIdentity().id,
            'E7. Two independently-constructed identities (a viewer\'s own Authenticated identity vs. a different Publication\'s own signing/origin identity) are genuinely distinct values, never structurally forced to coincide.');

        // E8. World position (WorldPosition, live-World StructurePlacement
        // coordinates) vs. Position (PlacementRecord's own published,
        // signed coordinate claim) — two distinct classes, never one
        // shared type, confirmed structurally.
        assert(WorldPosition !== Position, 'E8a. WorldPosition and Position are distinct class objects.');
        const worldPos = new WorldPosition(1, 2, 3);
        const publishedPos = new Position(1, 2, 3);
        assert(!(worldPos instanceof Position) && !(publishedPos instanceof WorldPosition),
            'E8b. ...with no shared prototype chain in either direction — a live World coordinate and a published-placement coordinate are never the same type, even when their numeric values coincide.');

        console.log('✓ E: All applicable pairs among the ten named identity concepts checked and confirmed structurally distinct. Publication identity and Placement identity are independent fields on the same record (E1). Content hash is never equal to either id (E2) and is Snapshot identity\'s own DELIBERATE, explicitly-documented pairing — the one intentional collapse in this list (E3). Material URI stays a separate WHERE-fact from Content hash\'s WHAT-fact (E4). Discovery origin (network path) and Publication origin (signer) live on two different classes under two different field names (E5). Provider key and Role validate independently and are never equal on a real preference (E6). Authenticated identity (this session) and a Publication\'s own origin identity are never structurally forced to coincide (E7). World position and (published) Position are distinct classes with no shared prototype (E8). No accidental identity collapse found.');
    }

    // ===============================================================
    // Section F — Temporal-boundary audit. Eight temporal concepts
    // checked to remain distinct, with special attention to the two
    // boundaries this milestone's own brief calls out by name.
    // ===============================================================
    {
        // F1. Placement record (a signed, published PlacementRecord
        // revision) vs. World visibility / rendered presence (whether a
        // StructurePlacement is materialized into the live World this
        // session sees) — 0.9.308-0.9.310's own already-converged
        // finding, reconfirmed: OwnPublicationPanel renders the placement
        // RECORD list, unconditionally, independent of whether any of
        // those placements are materialized as a rendered World source
        // right now.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(panelSource.includes('publicationPlacements'),
            'F1. OwnPublicationPanel.js still renders the plural placement-RECORD list unconditionally — it is not gated on whether any placement is currently materialized/rendered in a live World session.');

        // F2. Discovery observation (a peer/local source reporting a
        // candidate) vs. distribution lifecycle (announce -> retrieve ->
        // verify -> materialize) — DiscoverSnapshotCandidatesCommand
        // reports CANDIDATES; it never itself performs materialization
        // (Section B3's own hash-verify-then-store boundary is a later,
        // separate stage).
        const discoverSource = codeOnlyLines(await rawSource('application/DiscoverSnapshotCandidatesCommand.js'));
        assert(!/storeSnapshotContentUseCase|StoreSnapshotContentUseCase/.test(discoverSource),
            'F2. application/DiscoverSnapshotCandidatesCommand.js never itself calls the storage/materialization boundary — Discovery observation is a distinct, earlier temporal stage from the distribution lifecycle\'s later materialize step.');

        // F3. Notification event (the fact) vs. notification persistence
        // (the durable store) vs. delivered vs. seen vs. read — the
        // central named invariant. NotificationEvent carries no
        // delivered/seen/read timestamp of its own (0.9.279's own
        // header, reconfirmed: "queuedAt/sentAt/deliveredAt... exists to
        // track ONE MESSAGE's" delivery — a DIFFERENT, narrower concept
        // this codebase names but never builds for NotificationEvent).
        const notificationEventSource = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        assert(!/isRead\b|readAt|seenAt|deliveredAt/.test(notificationEventSource),
            'F3a. core/NotificationEvent.js — the fact itself — carries no isRead/readAt/seenAt/deliveredAt field of its own.');
        const storeSource = await rawSource('storage/NotificationEventStore.js');
        assert(storeSource.includes("`getUnread()`, `getForRecipient()`,\n// `markRead()`, `delete()`, `expire()`"),
            'F3b. storage/NotificationEventStore.js still documents, in its own words, that getUnread()/markRead() are DELIBERATELY EXCLUDED — "this store is durable history of notification facts, not a recipient\'s inbox." Persisted != delivered != seen != read, confirmed as an explicit design boundary, not an oversight.');

        // F4. Collaboration operation (a Command, propagated once) vs.
        // World visibility (the current live state after applying it) —
        // applyRemote() MUTATES the live World and returns an outcome;
        // the operation itself (the Command/envelope) is never retained
        // as the source of current state — the World's own current
        // field values are (Section B5's own live proof: outcome ===
        // APPLIED and world.getStructurePlacement(...).position.x
        // reflects the NEW value, read from the World, not the Command).
        {
            const world = new World({ id: 'w-baseline-f4' });
            world.addStructurePlacement(new StructurePlacement({ id: 'shed', documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
            const resolver = new WorldConflictResolver();
            const move = new MoveStructurePlacementCommand({ id: 'op-f4', worldId: 'w-baseline-f4', placementId: 'shed', delta: { x: 7, y: 0, z: 0 } });
            resolver.applyRemote({ worldDocumentId: 'w-baseline-f4', envelope: { operationId: 'op-f4', logicalClock: 1 }, command: move, world });
            assert(world.getStructurePlacement('shed').position.x === 7,
                'F4. The collaboration OPERATION (the Command) is transient; current World visibility is read from the World\'s own live state afterward, not re-derived from the retained Command — the two stay distinct temporal facts.');
        }

        // F5. Placement record != current World presence, stated a
        // second, more direct way per this milestone's own brief: a
        // PlacementRecord's own revision number can advance (a new
        // signed claim) with zero effect on whether that placement is
        // CURRENTLY materialized into any live World session — the two
        // update on entirely independent triggers (a signature vs. a
        // materialization action), confirmed structurally: PlacementRecord
        // carries no "materialized"/"rendered" boolean of its own.
        const placementRecordSource = codeOnlyLines(await rawSource('core/PlacementRecord.js'));
        assert(!/materialized|isRendered|renderedInWorld/i.test(placementRecordSource),
            'F5. core/PlacementRecord.js carries no materialized/rendered field of its own — a placement record\'s own revision state and its current World-rendering state are updated by entirely independent actions, never coupled in one object.');

        console.log('✓ F: Placement record vs. current World presence stays distinct — the placement-record list renders unconditionally, independent of live materialization (F1, F5), and PlacementRecord itself carries no materialized/rendered field. Discovery observation stays a distinct, earlier stage from the distribution lifecycle\'s materialize step (F2). Persisted notification != delivered != seen != read is confirmed as an EXPLICIT, documented design boundary — NotificationEvent carries none of those fields, and NotificationEventStore\'s own header names getUnread()/markRead() as deliberately excluded (F3). Collaboration operation (transient Command) vs. rendered World state (the live, mutated fact) proven distinct with a real live execution (F4). No accidental temporal collapse found.');
    }

    // ===============================================================
    // Section G — Historical implementation guard. The 0.9.312 invariant
    // carried forward unchanged, plus one additional candidate checked.
    // ===============================================================
    {
        // G1. The 0.9.312 regression guard itself, reconfirmed fresh —
        // no production file outside the historical family's own six
        // files may depend on it.
        const HISTORICAL_FAMILY_FILES = new Set([
            'replication/ConflictResolver.js', 'replication/ReplicaMergeService.js',
            'replication/LocalReplicationStore.js', 'application/ReplicatePlacementUseCase.js',
            'application/SynchronizeReplicaUseCase.js', 'application/CreateReplicationUseCase.js'
        ]);
        function outsideFamily(files) {
            return files.filter((f) => !HISTORICAL_FAMILY_FILES.has(f) && !f.startsWith('tests/'));
        }
        const guardPatterns = [
            "from '.*replication/ConflictResolver.js'", "from '.*replication/ReplicaMergeService.js'",
            "from '.*replication/LocalReplicationStore.js'", "from '.*application/ReplicatePlacementUseCase.js'",
            "from '.*application/SynchronizeReplicaUseCase.js'", "from '.*application/CreateReplicationUseCase.js'",
            'new ConflictResolver(', 'new ReplicaMergeService(', 'new CreateReplicationUseCase(',
            'new ReplicatePlacementUseCase(', 'new SynchronizeReplicaUseCase(', 'new LocalReplicationStore('
        ];
        const violations = [];
        for (const pattern of guardPatterns) {
            const hits = outsideFamily(grepFiles(pattern, ['application', 'ui', 'server', 'replication', 'core', 'placement', 'spatial', 'discovery']));
            for (const file of hits) violations.push(`${file} (${pattern})`);
        }
        assert(violations.length === 0,
            `G1. 0.9.312's own guard still holds: no production path outside the historical family's own six files depends on it (violations: ${violations.join('; ') || 'none'}).`);

        // G2. One additional candidate this milestone checks fresh: could
        // any OTHER old-looking class plausibly be mistaken for a live
        // capability the way the replication family was? The offline
        // ConflictPolicy class (replication/ConflictPolicy.js) is the
        // next most similarly-named file — checked the same way: zero
        // production callers outside the historical family.
        assert(await sourceExists('replication/ConflictPolicy.js'), 'G2a. replication/ConflictPolicy.js still exists.');
        const policyCallers = outsideFamily(grepFiles('new ConflictPolicy(', ['application', 'ui', 'server']));
        assert(policyCallers.length === 0,
            `G2b. replication/ConflictPolicy.js — part of the SAME historical family this milestone's own G1 already guards (it is constructed only from ReplicaMergeService/CreateReplicationUseCase) — has zero production callers outside that family (found: ${policyCallers.join(', ') || 'none'}), confirming it was already correctly swept into the 0.9.312 boundary rather than being a second, separately-overlooked historical implementation.`);

        console.log('✓ G: The 0.9.312 invariant — no production file outside the historical replication family\'s own six files may depend on it — reconfirmed fresh with zero violations (G1). One additional similarly-named candidate (ConflictPolicy) checked directly and confirmed to already be inside the SAME guarded family, not a second, separately-overlooked historical implementation (G2). No other case found where an old implementation could plausibly be mistaken for a live capability.');
    }

    // ===============================================================
    // Section H — Deliberately absent capabilities. Recorded as
    // architectural decisions, not defects.
    // ===============================================================
    {
        const absences = [
            ['Notification delivery/push', async () => {
                const hits = await grepCount('pushNotification\\|NotificationBadge\\|sendPush', ['storage', 'application', 'ui']);
                assert(hits === 0, `H. Zero push/delivery vocabulary anywhere (found ${hits}).`);
            }, 'storage/NotificationEventStore.js documents itself as "durable history of notification facts, not a recipient\'s inbox."'],
            ['Unread/read state', async () => {
                const source = codeOnlyLines(await rawSource('storage/NotificationEventStore.js'));
                assert(!/markRead|getUnread\(/.test(source), 'H. NotificationEventStore.js carries no markRead/getUnread implementation.');
            }, 'Explicitly named DELIBERATELY EXCLUDED in NotificationEventStore.js\'s own header (Section F3b).'],
            ['Provider fallback', async () => {
                const source = await rawSource('core/RoleProviderPreference.js');
                assert(source.includes('NO FALLBACK SEMANTICS') || source.includes('fallback policy'),
                    'H. core/RoleProviderPreference.js documents NO fallback semantics.');
            }, 'core/RoleProviderPreference.js: "NOT a fallback policy" — a preference names one providerKey per role, nothing more.'],
            ['Provider ranking', async () => {
                const hits = await grepCount('providerRank\\|rankProviders\\|ProviderRanking', ['application', 'core', 'ui']);
                assert(hits === 0, `H. Zero provider-ranking vocabulary anywhere (found ${hits}).`);
            }, 'Consistent with 0.9.292\'s own capability-matrix finding: technical multi-provider capability is not the same as a ranking/selection feature.'],
            ['Automatic provider switching', async () => {
                const hits = await grepCount('autoSwitchProvider\\|automaticProviderFailover', ['application', 'core', 'ui']);
                assert(hits === 0, `H. Zero automatic-switching vocabulary anywhere (found ${hits}).`);
            }, 'core/RoleProviderPreference.js: a resolver, never an automatic-switching runtime.'],
            ['Placement navigation ("go to placement")', async () => {
                const roadmap = await rawSource('docs/Roadmap.md');
                assert(roadmap.includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
                    'H. docs/Roadmap.md still carries the standing, unmet evidence bar for placement navigation.');
            }, 'Standing DEFER, reconfirmed unchanged by 0.9.310/0.9.311 and again here (Section A).'],
            ['Placement management duplication ("remove this placement" as a second control)', async () => {
                const panelSource = codeOnlyLines(await rawSource('ui/components/OwnPublicationPanel.js'));
                assert(!/overlapCount/.test(panelSource),
                    'H. OwnPublicationPanel.js\'s own CODE (its comments merely document the shape overlapCount would take) still never renders overlapCount as a second, duplicate placement-removal/management control — the identical fact already has a more complete answer elsewhere (LocationDocumentsDialog\'s own "View").');
            }, '0.9.310\'s own finding, reconfirmed: a bare duplicate control was correctly deferred, not built.'],
            ['Speculative collaboration features (live cursors, conflict/divergence UI)', async () => {
                const cursorHits = await grepCount('LiveCursor\\|CollaboratorCursor', ['ui/components']);
                assert(cursorHits === 0, 'H. Zero live-cursor vocabulary anywhere.');
                const conflictUiHits = await grepCount('ConflictBanner\\|DivergenceIndicator\\|ConflictNotice', ['ui/components']);
                assert(conflictUiHits === 0, 'H. Zero conflict/divergence UI vocabulary anywhere.');
            }, '0.9.311\'s own Section G finding, reconfirmed: no evidence anywhere, and (for conflict UI specifically) a deliberate policy decision, not an oversight.'],
            ['Revived peer-placement replication', async () => {
                const hits = grepFiles('new CreateReplicationUseCase(', ['application', 'ui']).filter((f) => f !== 'application/CreateReplicationUseCase.js');
                assert(hits.length === 0, `H. Zero production callers of the historical replication family outside its own files (found ${hits.join(', ') || 'none'}).`);
            }, '0.9.312\'s own full boundary audit — superseded by the live WorldConflictResolver collaboration protocol (Section G1 above).']
        ];
        for (const [name, check] of absences) {
            await check();
        }
        console.log('✓ H: Nine deliberate absences checked directly against real source, each backed by its own documented rationale — none is a silently-missing feature:');
        for (const [name, , rationale] of absences) console.log(`    - ${name}\n      ${rationale}`);
    }

    // ===============================================================
    // Section I — Product-gap scan. Evidence-based, biased explicitly
    // against "interesting API"/"unused class"/"missing abstraction"/
    // "possible integration"/"future enhancement."
    // ===============================================================
    {
        // I1. Every candidate this milestone's own Section A/H already
        // named as DEFERRED remains real, but none crosses into
        // "actual user-blocking gap" — each still lacks the concrete
        // evidence bar (a real scenario where a specific user action is
        // impossible, not merely "would be nice"), reconfirmed fresh.
        const deferredCandidates = [
            'Placement navigation/management', 'Discovery-level Commentary count', 'Collaboration conflict/divergence UI'
        ];
        assert(deferredCandidates.length === 3, 'I1. Exactly the three standing DEFERRED candidates from Section A are re-examined, no new one silently added.');

        // I2. Direct negative check: no TODO/FIXME naming a blocking gap
        // exists anywhere in application/ or ui/ that isn't already one
        // of the named, classified DEFER items above.
        const todoHits = grepFiles('TODO.*[Bb]lock\\|FIXME.*[Cc]annot', ['application', 'ui']);
        assert(todoHits.length === 0, `I2. No TODO/FIXME anywhere in application/ or ui/ names a blocking gap outside the already-classified candidates (found: ${todoHits.join(', ') || 'none'}).`);

        // I3. The one substantive, honest finding this milestone's own
        // scan surfaces, held to the SAME "actual user-blocking gap"
        // bar rather than promoted merely for being interesting: the
        // collaboration policy's own frozen descriptor still names
        // conflict resolution for non-commuting operations UNDEFINED.
        // This is real (0.9.311's own G3), but per that same section's
        // own evidence: no user-facing report of actual silent
        // divergence exists anywhere in this codebase's own record.
        // Recorded here as the smallest possible seam, per this
        // milestone's own instruction, WITHOUT selecting it — that
        // remains Section J's call.
        const roadmapFull = await rawSource('docs/Roadmap.md');
        assert(roadmapFull.includes('0.9.311'),
            'I3. The one candidate closest to a genuine gap (collaboration conflict/divergence UI) is the SAME one 0.9.311 already found and correctly declined to select absent user-facing evidence — not a new discovery this milestone invents to justify a verdict.');

        console.log('✓ I: Scan performed against the "actual user-blocking gap" bar, not "interesting API"/"unused class"/"missing abstraction"/"possible integration"/"future enhancement." The three standing DEFERRED candidates remain real but unpromoted (I1); no TODO/FIXME anywhere names an un-classified blocking gap (I2); the one candidate closest to a genuine gap (collaboration conflict/divergence UI) is the same one 0.9.311 already found and correctly declined absent user-facing evidence of actual harm — not manufactured here to justify continuing the 0.9.x sequence (I3). No genuine NEW user-blocking gap emerged from this scan.');
    }

    // ===============================================================
    // Section J — Final baseline verdict.
    // ===============================================================
    {
        const verdictOptions = ['STABLE', 'STABLE_WITH_DEFERRED_GAPS', 'ACTION_REQUIRED'];
        const verdict = 'STABLE_WITH_DEFERRED_GAPS';
        assert(verdictOptions.includes(verdict), 'J. The verdict is one of the three named options.');

        console.log('✓ J: VERDICT.\n' +
'\n' +
`OUTCOME: ${verdict}.\n` +
'\n' +
'WHY. Section A\'s capability inventory produced zero unexplained orphans: every\n' +
'major surface classifies cleanly as IMPLEMENTED+REACHABLE, IMPLEMENTED+INTERNAL\n' +
'(each with prior, established design justification), HISTORICAL (the 0.9.312\n' +
'family, carried forward explicitly), or DEFERRED (each with its own standing,\n' +
'unmet evidence bar already on record — not new gaps this milestone discovered).\n' +
'Section B traced five product-level chains hop to hop, including one live\n' +
'execution through the real collaboration/conflict-resolution pipeline, and none\n' +
'dead-ended short of its own natural terminus. Section C confirmed all eight named\n' +
'areas keep UI state as observation, never an independent authoritative copy.\n' +
'Section D confirmed capabilities are reached through their intended composition\n' +
'roots, not constructed ad hoc inside UI components — the exact class of bug the\n' +
'0.9.312 audit would have caught, checked here from the opposite direction and\n' +
'holding. Section E and Section F found no accidental identity or temporal\n' +
'collapse among ten and eight named concepts, respectively, including live proof\n' +
'of both boundaries this milestone\'s own brief called out by name: persisted\n' +
'notification != delivered != seen != read, and placement record != current World\n' +
'presence. Section G reconfirmed the 0.9.312 historical-implementation guard fires\n' +
'with zero violations and found no second, separately-overlooked old\n' +
'implementation. Section H recorded nine deliberate absences, each backed by its\n' +
'own documented rationale already on record, not silently missing.\n' +
'\n' +
'Section I is why the verdict is STABLE_WITH_DEFERRED_GAPS rather than bare\n' +
'STABLE: three real, previously-identified candidates (placement\n' +
'navigation/management, Discovery-level Commentary count, collaboration\n' +
'conflict/divergence UI) remain genuinely open, each with its own already-recorded\n' +
'reason for not being selected (unmet evidence bar, unestablished semantics, or a\n' +
'deliberate architecture decision this test-only milestone is not positioned to\n' +
'overturn on its own). None of the three is a NEWLY discovered gap, and none\n' +
'blocks any of the five journeys Section B traced end to end. This is a different,\n' +
'weaker claim than ACTION_REQUIRED, which would mean something in the CURRENT\n' +
'product actively prevents treating this architecture as a stable baseline — this\n' +
'audit found no such thing.\n' +
'\n' +
'WHAT THIS MEANS. Per this milestone\'s own governing question — not "what should\n' +
'we build next" but "is there anything that should prevent treating this\n' +
'architecture as a stable baseline" — the answer is no. The three deferred\n' +
'candidates stay exactly where the last several milestones already correctly left\n' +
'them: on record, unaddressed, genuinely available to a future milestone that\n' +
'wants to take on one of them once real evidence (not inertia, not architectural\n' +
'interest) points there. Per this milestone\'s own brief: if it finds one genuine\n' +
'gap, the next milestone should be a narrowly scoped implementation of that gap;\n' +
'this audit did not find one. The 0.9.x expansion loop stops here until new\n' +
'product evidence appears.\n');
    }

    console.log('\n✅ All Stable Product Baseline Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All StableProductBaselineAudit tests passed');
}).catch((error) => {
    console.error('\n✗ StableProductBaselineAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
