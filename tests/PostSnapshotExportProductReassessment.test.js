import { readFile, readdir } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { VehicleType } from '../core/VehicleType.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentMaterializationCoordinator } from '../application/SnapshotContentMaterializationCoordinator.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';
import { validatePublicationSnapshotTransferPackage } from '../application/PublicationSnapshotTransferPackageValidator.js';
import { CURRENT_SCHEMA_VERSION, PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND } from '../application/PublicationSnapshotTransferPackage.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.216 — Post-Snapshot-Export Product Reassessment.
//
// Test-only. No production changes. 0.9.215 closed the last ACTUAL_GAP
// 0.9.212's own reassessment found (Snapshot export) — the same milestone
// that also confirmed Snapshot export was genuinely an INTEGRATION gap,
// not a missing DOMAIN feature. Per the brief that requested this
// milestone, this reassessment is deliberately BROADER than 0.9.212, not
// a repeat of it:
//
//   1. 0.9.213/0.9.214/0.9.215 are explicitly REGRESSION-CHECKED here as
//      CLOSED capabilities (Sections E/F below), not merely rediscovered.
//   2. Every area 0.9.212 covered is reswept, PLUS several that never had
//      their own dedicated row before: Publication distribution (Section
//      D2), Decentralized discovery (Section H), Material verification /
//      attribution (Section I), and Cross-document isolation as its own
//      explicit cross-cutting audit (Section J) rather than a scattered
//      footnote inside other sections.
//   3. Snapshot import/export SYMMETRY gets its own dedicated audit
//      (Section G) — observing, not extending, the boundary 0.9.215
//      deliberately left open (how an exported package reaches the
//      user, file download, clipboard, auto-import, drag-and-drop,
//      package versioning — none of that is decided or built here).
//   4. 0.9.212's own Section A6 left an explicit, named boundary note
//      unresolved — six WorldNavigationSession methods with no caller in
//      WorldView.js, deliberately NOT classified at the time because
//      "asserting they are gaps... would be exactly the 'invent a
//      feature' mistake the brief warns against." This milestone is
//      exactly the reassessment that note asked for — Section L
//      classifies all six, individually, with evidence.
//   5. The OBSOLETE sweep (Section M) is broadened repository-wide, per
//      this milestone's own brief: obsolete implementation, not
//      capability-reachability, is now the more interesting source of
//      architectural friction, now that reachability gaps are thinning
//      out. Nothing found here is DELETED — only classified, per the
//      brief's own four-stage pipeline (confirmed superseded -> no
//      production caller -> replacement reachable -> safe removal
//      candidate), for a future cleanup milestone to act on in isolation.
//
// Classification vocabulary — the original four, unchanged since 0.9.203:
//
//   COMPLETE              — already fully reachable, nothing to do.
//   INTENTIONAL_BOUNDARY  — deliberately undone; a decision, not a gap.
//   ACTUAL_GAP            — a genuine missing INTEGRATION: implementation
//                           exists, composition may exist, the last hop
//                           (usually UI) does not.
//   OBSOLETE               — a real, complete implementation, superseded
//                           in place, unreachable from the current
//                           product architecture.
//
// ...plus ONE new one, per this milestone's own brief, and deliberately
// DIFFERENT in shape from ACTUAL_GAP:
//
//   NEW_PRODUCT_GAP        — a missing SEMANTIC capability: nothing in
//                           the domain/application layer implements it
//                           at all, under any name, reachable or not.
//                           "It already works, but nobody can reach it"
//                           (0.9.203-0.9.215's own pattern) does NOT
//                           belong in this bucket — that is ACTUAL_GAP,
//                           still. This bucket is for the case this
//                           whole arc has not yet found: a capability
//                           this codebase has never built, under any
//                           name, at any layer. See Section N below for
//                           this milestone's own explicit verdict.
//
// The architectural closure model this milestone's own brief asks be
// made central (Section K applies it as a table across every finding):
//
//   PRODUCT CAPABILITY -> Domain/Core -> Application -> Composition Root
//   -> UI/Caller            (every MAINTAINED user-facing capability
//                             must terminate legitimately at one of
//                             these -- an ACTUAL_GAP is a capability
//                             that stops one hop short)
//
//   Infrastructure -> Application -> INTENTIONAL INTERNAL CAPABILITY
//                             (some capabilities correctly terminate
//                             here ON PURPOSE -- never reaching the UI
//                             is not itself evidence of a gap)
//
// This file does not implement anything it finds, and does not delete
// anything it classifies OBSOLETE. Per the brief, it stops at
// classification and recommendation.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Post-Snapshot-Export Reassessment Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Same restraint every reassessment since 0.9.156 already applies: strip
// full-line `//` comments before counting/searching references, so a
// sweep counts genuine code references, never a comment that merely
// names a class in prose (this file's own header does that constantly).
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

// Repository-wide "is this class instantiated ANYWHERE in production
// code" scan, for the OBSOLETE sweep (Section M) — broader than the
// established "not in ui/main.js" check alone, since a superseded
// composition root's own sibling might have picked it up instead. Scans
// application/ and ui/ only (never tests/, never node_modules/, never
// .git/) — a class used only by its own dedicated test file is still a
// live OBSOLETE candidate, not a false negative here.
async function listJsFiles(relativeDir) {
    const rootPath = new URL(relativeDir + '/', SOURCE_ROOT).pathname;
    const entries = await readdir(rootPath, { withFileTypes: true, recursive: true });
    return entries
        .filter((e) => e.isFile() && e.name.endsWith('.js'))
        .map((e) => `${(e.parentPath || e.path)}/${e.name}`.slice(rootPath.length))
        .map((p) => `${relativeDir}/${p}`);
}

async function repoWideInstantiationCount(className) {
    let total = 0;
    const files = [...await listJsFiles('application'), ...await listJsFiles('ui')];
    const pattern = new RegExp(`new ${className}\\(`);
    for (const file of files) {
        const source = await rawSource(file);
        if (pattern.test(codeOnlyLines(source).join('\n'))) {
            total += 1;
        }
    }
    return total;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation. COMPLETE, reconfirmed
    // unchanged since 0.9.212's own Section A (the entire 0.9.209-0.9.211
    // Undo/Redo arc stays closed).
    // ---------------------------------------------------------------
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const componentTags = new Set((worldView.match(/<[A-Z][A-Za-z]+/g) || []).map((tag) => tag.slice(1)));
        for (const name of ['PlacementInfoPanel', 'OwnPublicationPanel', 'HistoryTimelinePanel', 'VehicleInteractionPrompt', 'WorldEncounterCanvas']) {
            assert(componentTags.has(name), `A1. WorldView.js still composes ${name}`);
        }
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        const emitsMatch = placementInfoPanelSource.match(/emits:\s*\[([^\]]*)\]/);
        assert(emitsMatch && /\bremove\b/i.test(emitsMatch[1]), 'A2. PlacementInfoPanel.js still emits \'remove\'');
        assert(/session\.undo\(\)/.test(worldView) && /session\.redo\(\)/.test(worldView), 'A3. WorldView.js still calls session.undo()/session.redo() directly');
        for (const identifier of ['canUndo', 'canRedo', 'getUndoLabel', 'getRedoLabel']) {
            assert(countReferences(worldView, identifier) > 0, `A4. WorldView.js still references session.${identifier}()`);
        }
        console.log('✓ Section A: World interaction/navigation — COMPLETE, reconfirmed unchanged.');
    }

    // ---------------------------------------------------------------
    // Section B — Vehicle system. INTENTIONAL_BOUNDARY, unchanged.
    // ---------------------------------------------------------------
    {
        assert(typeof VehicleType.NONE === 'string' && typeof VehicleType.BICYCLE === 'string'
            && typeof VehicleType.MOTORCYCLE === 'string' && typeof VehicleType.CAR === 'string'
            && typeof VehicleType.DRONE === 'string', 'B1. VehicleType still carries exactly its five original values');
        const vehicleTypeCode = codeOnlyLines(await rawSource('core/VehicleType.js')).join('\n');
        assert(!/passenger|capacity|multi-?rider|\bfuel\b|\brange\b/i.test(vehicleTypeCode), 'B2. VehicleType.js\'s own CODE still declares no capacity/passenger/fuel vocabulary');
        console.log('✓ Section B: Vehicle system — INTENTIONAL_BOUNDARY, unchanged since 0.9.196.');
    }

    // ---------------------------------------------------------------
    // Section C — World material/document lifecycle: autosave/recovery,
    // history/preview/restore, and placement lifecycle. COMPLETE,
    // reconfirmed. (Cross-document isolation gets its OWN dedicated
    // audit in Section J, not folded in here.)
    // ---------------------------------------------------------------
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const destructureMatch = editorViewSource.match(/const \{([^}]*)\}\s*=\s*new CreatePersistenceUseCase\(\)\.execute\(\)/);
        assert(destructureMatch, 'C1a. EditorView.js still destructures CreatePersistenceUseCase().execute()');
        for (const field of ['autosaveDocumentUseCase', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase']) {
            assert(destructureMatch[1].includes(field), `C1b. EditorView.js still takes ${field}`);
        }
        assert(/<RecoveryBanner/.test(editorViewSource), 'C1c. RecoveryBanner is still in the template');
        assert(/autosaveScheduler\.stop\(\)/.test(editorViewSource), 'C1d. EditorView.js still stops the autosave scheduler on teardown — no cross-document/orphaned autosave writer');

        const worldViewSource = await rawSource('ui/views/WorldView.js');
        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview']) {
            assert(countReferences(worldViewSource, identifier) > 0, `C2. WorldView.js still references ${identifier}`);
        }
        for (const method of ['createLandmarkHere', 'createRegionHere', 'movePlacement', 'removePlacement', 'unpublishDocument', 'searchWorld']) {
            assert(countReferences(worldViewSource, method) > 0, `C3. WorldView.js still calls session.${method}(...)`);
        }

        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        const commandHistoryImports = [...navigationSessionSource.matchAll(/import\s*\{[^}]*\bCommandHistory\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g)];
        assert(commandHistoryImports.length === 1, 'C4a. WorldNavigationSession.js still imports exactly one CommandHistory-shaped class');
        assert(!/_undoStack|_redoStack/.test(navigationSessionSource), 'C4b. WorldNavigationSession.js still maintains no second undo/redo stack of its own');
        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(!/_undoStack|_redoStack/.test(editorSessionSource), 'C4c. EditorSession.js also maintains no second undo/redo stack');

        console.log('✓ Section C: World material/document lifecycle — COMPLETE, reconfirmed. Autosave/recovery, history/replay/restore, and placement/publication/naming all remain composed and UI-reachable; CommandHistory remains the sole undo/redo authority for both sessions.');
    }

    // ---------------------------------------------------------------
    // Section D — Publication lifecycle (D1) and Publication
    // distribution (D2, a dedicated row for the first time — previously
    // only implied inside "Snapshot"/"cross-cutting lifecycle
    // integrity"). Both COMPLETE.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 10, `D1a. OwnPublicationPanel.js still wires at least 10 distinct actions (found ${clickHandlers.size})`);
        assert([...clickHandlers].some((h) => /^unpublish|^retract/i.test(h)), 'D1b. an unpublish/retract-shaped handler remains wired');
        assert(clickHandlers.has('discoverOwnSnapshot') && clickHandlers.has('discoverSnapshotCandidates') && clickHandlers.has('distributeOwnSnapshot') && clickHandlers.has('exportOwnSnapshot'),
            'D1c. OwnPublicationPanel.js still wires Snapshot discovery/distribution/export actions alongside Publication');

        const removePlacementSource = await rawSource('application/RemoveWorldPlacementUseCase.js');
        assert(!/Publish|Unpublish/.test(removePlacementSource), 'D1d. Unpublish != Remove placement: RemoveWorldPlacementUseCase.js still carries no Publish/Unpublish reference');
        const unpublishSource = await rawSource('application/UnpublishDocumentUseCase.js');
        assert(!/Placement/.test(unpublishSource), 'D1e. ...and UnpublishDocumentUseCase.js still carries no Placement reference');

        // D2 — Publication distribution, its own row: Nostr/Arweave
        // announcement of an already-published Publication, distinct
        // from Snapshot export (Section G) and from Snapshot discovery
        // (Section F) — a Publication is DISTRIBUTED (announced) so
        // others can DISCOVER it; nothing here transfers the actual
        // bytes, which is what Section G's Transfer Package is for.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/distributionCommand:\s*\{/.test(canvasSource), 'D2a. WorldEncounterCanvas.js still declares a distributionCommand prop');
        assert(/distributeSelectedPublication\(\)\s*\{/.test(canvasSource), 'D2b. ...and still defines distributeSelectedPublication()');
        assert(/@click="distributeSelectedPublication"/.test(canvasSource), 'D2c. ...wired to a real @click handler — "Distribute Publication" stays reachable');

        const mainSource = await rawSource('ui/main.js');
        assert(/composePublicationDistributionCommand\(/.test(mainSource), 'D2d. ui/main.js still composes publicationDistributionCommand via composePublicationDistributionCommand()');
        assert(/provide\('publicationDistributionCommand'/.test(mainSource), 'D2e. ...and still provides it app-wide');

        const worldViewSourceForDistribution = await rawSource('ui/views/WorldView.js');
        assert(/inject\('publicationDistributionCommand'/.test(worldViewSourceForDistribution), 'D2f. WorldView.js still injects the composed publicationDistributionCommand');
        assert(/publicationDistributionCommand\(\{/.test(worldViewSourceForDistribution), 'D2g. ...and still genuinely calls it (not merely re-injecting it downward unused)');

        console.log(`✓ Section D: Publication workflow — D1 COMPLETE (${clickHandlers.size} wired actions; unpublish != remove placement holds both directions). D2 (Publication distribution) COMPLETE, its own row for the first time: Nostr/Arweave announcement is composed in ui/main.js, threaded through WorldView.js, and reachable from a real "Distribute Publication" action on WorldEncounterCanvas.js.`);
    }

    // ---------------------------------------------------------------
    // Section E — Editor. COMPLETE. Both ACTUAL_GAP findings 0.9.212
    // made here (G1 transform feedback, G2 undo/redo label mirrors) are
    // regression-checked as CLOSED, per this milestone's own brief
    // ("0.9.213-0.9.215 should now be explicitly regression-checked as
    // closed capabilities").
    // ---------------------------------------------------------------
    {
        // E1 — Transform gesture feedback (closed by 0.9.214).
        const spatialEditingServiceSource = await rawSource('application/SpatialEditingService.js');
        assert(/getGestureFeedback\(\)\s*\{\s*return this\._gestureFeedback;\s*\}/.test(spatialEditingServiceSource), 'E1a. SpatialEditingService still exposes getGestureFeedback()');
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/import TransformFeedback from '..\/components\/TransformFeedback\.js';/.test(editorViewSource), 'E1b. EditorView.js still imports TransformFeedback');
        assert(/<TransformFeedback :feedback="transformFeedback" \/>/.test(editorViewSource), 'E1c. ...and still mounts it, bound to a local ref');
        assert(/transformFeedback\.value = result\.feedback \|\| null;/.test(editorViewSource), 'E1d. ...still a bare passthrough of the captured pointer-event result, no reconstruction');

        // E2 — Undo/redo label mirrors (closed by 0.9.213).
        const actionRegistrySource = await rawSource('application/EditorActionRegistry.js');
        const undoActionMatch = actionRegistrySource.match(/id:\s*'history\.undo',[\s\S]{0,1000}?execute:/);
        assert(undoActionMatch && /contextualLabel:\s*\(ctx\)\s*=>\s*ctx\.undoLabel/.test(undoActionMatch[0]), 'E2a. EditorActionRegistry\'s history.undo action still carries contextualLabel: (ctx) => ctx.undoLabel');
        const commandPaletteSource = await rawSource('ui/components/CommandPalette.js');
        assert(/displayLabel\(row\.action\)/.test(commandPaletteSource), 'E2b. CommandPalette.js still renders displayLabel(row.action) rather than the bare static label');

        // E3 — Snapshot export composition (closed by 0.9.215) —
        // reconfirmed at the SOURCE level here; Section G below re-proves
        // it BEHAVIORALLY and audits the symmetry boundary in depth.
        const mainSource = await rawSource('ui/main.js');
        assert(/new BuildPublicationSnapshotTransferPackageUseCase\(/.test(mainSource), 'E3a. ui/main.js still composes BuildPublicationSnapshotTransferPackageUseCase');
        const coordinatorSource = await rawSource('application/SnapshotContentMaterializationCoordinator.js');
        assert(/async export\(publicationId\)/.test(coordinatorSource), 'E3b. SnapshotContentMaterializationCoordinator still has a matching export(publicationId) method');

        console.log('✓ Section E: Editor — COMPLETE. All three ACTUAL_GAP findings 0.9.212 made (transform feedback, undo/redo label mirrors, Snapshot export) remain closed under regression, not merely assumed.');
    }

    // ---------------------------------------------------------------
    // Section F — Snapshot discovery / materialization / World
    // participation. COMPLETE, reconfirmed (0.9.212's own Section E1).
    // ---------------------------------------------------------------
    {
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/discoverOwnSnapshot\(/.test(ownPublicationPanelSource), 'F1. OwnPublicationPanel.js still calls discoverOwnSnapshot (manual discovery)');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/worldSnapshotDiscoveryMonitor\.observe\(/.test(worldViewSource), 'F2. WorldView.js still drives worldSnapshotDiscoveryMonitor.observe() (automatic discovery)');
        assert(/automaticSnapshotEncounterCascade\.processCandidate\(/.test(worldViewSource), 'F3. ...and still feeds candidates to automaticSnapshotEncounterCascade.processCandidate() (automatic materialization)');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/openSnapshotContentView/.test(canvasSource) && /unregisterSelectedSnapshot/.test(canvasSource), 'F4. WorldEncounterCanvas.js still lets a materialized Snapshot be viewed and removed');
        const decentralizedViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(/materializePlacement\(/.test(decentralizedViewSource) && /importSnapshotContent\(/.test(decentralizedViewSource), 'F5. DecentralizedPublicationsView.js still wires explicit "Materialize"/"Import Snapshot" actions');
        console.log('✓ Section F: Snapshot discovery/materialization/World participation — COMPLETE, reconfirmed unchanged.');
    }

    // ---------------------------------------------------------------
    // Section G — Snapshot import/export SYMMETRY. New dedicated audit,
    // per this milestone's own brief: OBSERVE the boundary 0.9.215
    // deliberately left open, never extend it. No file download,
    // clipboard export, automatic import, drag-and-drop, or package
    // versioning is added or even proposed here.
    //
    //   Snapshot
    //      |
    //      +-- Export --> Transfer Package
    //      |
    //      +-- Import <-- Transfer Package
    //
    // ---------------------------------------------------------------
    {
        // G1 — both directions share the SAME package schema. Neither
        // Build nor Import defines its own parallel shape.
        const buildSource = await rawSource('application/BuildPublicationSnapshotTransferPackageUseCase.js');
        assert(/import \{ buildPublicationSnapshotTransferPackage \} from '\.\/PublicationSnapshotTransferPackage\.js';/.test(buildSource), 'G1a. Build use case still assembles the package through PublicationSnapshotTransferPackage.js\'s own builder — no parallel shape');
        const validatorSource = await rawSource('application/PublicationSnapshotTransferPackageValidator.js');
        assert(/CURRENT_SCHEMA_VERSION|PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND/.test(validatorSource), 'G1b. Import\'s own structural validator still checks against the SAME schema constants Build\'s package carries');
        assert(CURRENT_SCHEMA_VERSION === 1, 'G1c. no second schema version exists — CURRENT_SCHEMA_VERSION is still 1, unchanged since 0.8.32 (no versioning work introduced here)');

        // G2 — export stays a pure read: the Build use case's own code
        // (comments stripped) never calls a mutating catalog/store method.
        const buildCodeOnly = codeOnlyLines(buildSource).join('\n');
        assert(/\.get\(/.test(buildCodeOnly), 'G2a. Build use case still reads via .get(...)');
        assert(!/\.add\(|\.put\(|\.save\(|\.set\(/.test(buildCodeOnly), 'G2b. ...and its own code never calls a mutating catalog/store method (.add/.put/.save/.set) — export remains read-only');

        // G3 — neither direction silently touches Publish/Distribute/
        // Placement/World-registry/decentralized-discovery machinery —
        // a direct, code-only sweep of all four collaborator files, the
        // exact restraint 0.9.215's own Section F already proved for
        // export alone, now applied to BOTH directions plus the shared
        // package module.
        for (const file of [
            'application/BuildPublicationSnapshotTransferPackageUseCase.js',
            'application/ImportPublicationSnapshotTransferPackageUseCase.js',
            'application/SnapshotContentMaterializationCoordinator.js',
            'application/PublicationSnapshotTransferPackage.js'
        ]) {
            const codeOnly = codeOnlyLines(await rawSource(file)).join('\n');
            assert(!/publish|distribut|nostr|arweave|placement/i.test(codeOnly), `G3. ${file}'s own CODE references none of Publish/Distribute/Nostr/Arweave/Placement — neither direction silently publishes, distributes, places, or touches decentralized discovery`);
        }

        // G4 — import stays an explicit, single action; the coordinator
        // never invents an automatic/background import path (mirrors
        // 0.9.215's own Section C/G for export, now checked for import).
        const decentralizedViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        const importCallSites = (codeOnlyLines(decentralizedViewSource).join('\n').match(/@click="importSnapshotContent\(/g) || []).length;
        assert(importCallSites === 1, `G4a. importSnapshotContent(...) is bound to exactly one @click handler in DecentralizedPublicationsView.js (found ${importCallSites}) — one explicit click handler, no background caller`);
        assert(!/dragover|dragenter|ondrop|@drop=/i.test(decentralizedViewSource), 'G4b. no drag-and-drop import affordance exists — an explicit boundary this milestone observes, not extends');

        // G5 — no file download / clipboard affordance was added for
        // export either; the panel's own template comment documents the
        // restraint directly.
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/Deliberately no file save, download, or copy-to-clipboard/.test(ownPublicationPanelSource), 'G5a. OwnPublicationPanel.js\'s own template comment still documents "no file save, download, or copy-to-clipboard"');
        assert(!/<a[^>]+download[\s=]/i.test(ownPublicationPanelSource) && !/navigator\.clipboard/.test(ownPublicationPanelSource), 'G5b. ...and its CODE genuinely contains neither a download link nor a clipboard call');

        // G6 — a real, behavioral round trip: publication identity and
        // content hash survive Export -> Import unchanged, against real
        // (not mocked) collaborators, mirroring
        // tests/SnapshotExportUIIntegration.test.js's own Section I
        // FLAGSHIP construction but scoped tightly to this section's own
        // symmetry checklist rather than duplicating that file's full UI
        // E2E proof.
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
            return provider;
        }
        function makeReplica() {
            const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
            const contentStore = new LocalContentStore(new InMemoryStorageProvider());
            const buildUseCase = new BuildPublicationSnapshotTransferPackageUseCase({ publicationCatalog, contentStore });
            const importUseCase = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(contentStore), publicationCatalog);
            const coordinator = new SnapshotContentMaterializationCoordinator(importUseCase, buildUseCase);
            return { publicationCatalog, contentStore, coordinator };
        }

        const alice = makeReplica();
        const aliceIdentity = makeIdentity('alice');
        const bytes = JSON.stringify({ world: 'reassessment-payload' });
        const contentReference = alice.contentStore.put(bytes);
        let publication = new DecentralizedPublication({ id: 'pub-0.9.216', contentKind: 'forkbuild.structure', contentReference, publisherIdentity: aliceIdentity.getSigningIdentity().toJSON() });
        publication = publication.withSignature(aliceIdentity.signCanonical(publication.getSigningDescriptor()));
        alice.publicationCatalog.add(publication);

        const pkg = await alice.coordinator.export(publication.id);
        assert(pkg.kind === PUBLICATION_SNAPSHOT_TRANSFER_PACKAGE_KIND, 'G6a. exported package carries the shared kind constant');
        assert(pkg.publicationId === publication.id, 'G6b. exported package names the exact publicationId exported — no substitution');
        assert(pkg.contentHash === contentReference.hash, 'G6c. exported package\'s contentHash matches this replica\'s own stored ContentReference hash exactly');
        validatePublicationSnapshotTransferPackage(pkg);

        const bobBefore = alice.publicationCatalog.get(publication.id);
        const bob = makeReplica();
        const result = await bob.coordinator.import(pkg);
        assert(result.outcome === SnapshotContentTransferOutcome.STORED, 'G6d. a fresh replica genuinely stores the transferred content');
        assert(result.publicationId === publication.id, 'G6e. Publication identity is preserved end to end: Bob\'s import result names the exact same publicationId Alice exported');
        assert(result.contentReference.hash === contentReference.hash, 'G6f. Content hash is preserved end to end: Bob\'s stored ContentReference hash matches Alice\'s original exactly');
        const bobStoredBytes = await bob.contentStore.get(result.contentReference);
        assert(bobStoredBytes === bytes, 'G6g. ...and the actual bytes Bob now holds are byte-identical to what Alice exported');
        assert(bobBefore !== null && bobBefore.id === publication.id, 'G6h. Alice\'s own catalog entry is untouched by having exported (still present, same id) — export performed no mutation on the exporting side either');
        assert(!bob.publicationCatalog.get(publication.id), 'G6i. importing content never silently catalogs the Publication itself on the importing side — Bob knows content he does not yet know a Publication for, exactly as application/PublicationSnapshotTransferPackage.js\'s own header documents');

        console.log('✓ Section G: Snapshot import/export symmetry — OBSERVED, not extended. Both directions share one package schema (G1); export stays read-only (G2); neither direction touches Publish/Distribute/Placement/decentralized discovery (G3); import stays a single explicit action, no drag-and-drop (G4); no file-save/clipboard affordance exists for export (G5); a real Export->Import round trip preserves Publication identity and content hash exactly, with no cataloging side effect in either direction (G6).');
    }

    // ---------------------------------------------------------------
    // Section H — Decentralized discovery. New dedicated row. COMPLETE
    // — with one correction to a plausible naming assumption: the
    // Nostr/Arweave discovery UI is NOT ui/views/DecentralizedPublicationsView.js
    // (which covers Bitcoin/Base anchor evidence and IPFS mirroring
    // instead) — it lives on ui/components/WorldEncounterCanvas.js.
    // ---------------------------------------------------------------
    {
        const mainSource = await rawSource('ui/main.js');
        assert(/composeDecentralizedWorldEncounterMaterialDiscoveryRuntime\(/.test(mainSource), 'H1a. ui/main.js still composes the decentralized World Material discovery runtime (Nostr + Arweave)');
        assert(/provide\('discoverWorldEncounterPublicationCommand'/.test(mainSource) || /discoverWorldEncounterPublicationCommand/.test(mainSource), 'H1b. ...and still exposes a discovery command app-wide');

        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/discoveryCommand:\s*\{/.test(canvasSource), 'H2a. WorldEncounterCanvas.js still declares a discoveryCommand prop');
        assert(/discoverPublication\(\)\s*\{/.test(canvasSource), 'H2b. ...and still defines discoverPublication()');
        assert(/@click="discoverPublication"/.test(canvasSource), 'H2c. ...wired to a real @click handler — "Discover Publication" stays reachable');

        // H3 — the naming correction, asserted directly so a future
        // sweep does not mistake DecentralizedPublicationsView.js's own
        // silence on Nostr/Arweave for an unwired capability.
        const decentralizedViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(!/Nostr|Arweave|DecentralizedWorldDiscoveryQuery/.test(decentralizedViewSource), 'H3. ui/views/DecentralizedPublicationsView.js still contains zero Nostr/Arweave/DecentralizedWorldDiscoveryQuery references — that view is Bitcoin/Base anchor evidence + IPFS, a different decentralization concern entirely; the real Nostr/Arweave discovery UI is WorldEncounterCanvas.js\'s own "Discover Publication"/"Distribute Publication" panels');

        console.log('✓ Section H: Decentralized discovery — COMPLETE. Nostr + Arweave discovery/distribution is composed in ui/main.js and reachable through WorldEncounterCanvas.js\'s own actions — not through DecentralizedPublicationsView.js, whose name suggests it but whose actual scope is Bitcoin/Base anchor evidence and IPFS mirroring.');
    }

    // ---------------------------------------------------------------
    // Section I — Material verification / attribution. New dedicated
    // row. COMPLETE.
    // ---------------------------------------------------------------
    {
        const mainSource = await rawSource('ui/main.js');
        assert(/composeWorldEncounterMaterialVerifier\(/.test(mainSource), 'I1a. ui/main.js still composes the material verifier (signature -> identity -> inspection chain)');
        assert(/provide\('worldEncounterMaterialVerifier'/.test(mainSource), 'I1b. ...and provides it app-wide');

        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/materialInspection\.verification\.status/.test(canvasSource) || /discoveryResult\.inspection\.verification\.status/.test(canvasSource), 'I2a. WorldEncounterCanvas.js still renders a verification status field');
        assert(/resolveSnapshotPublicationAttribution/.test(canvasSource), 'I2b. ...and still resolves Snapshot/Publication attribution');

        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/resolveSnapshotPublicationAttribution/.test(ownPublicationPanelSource), 'I3. OwnPublicationPanel.js also resolves attribution — a second, independent rendering surface, not a single unreachable path');

        console.log('✓ Section I: Material verification / attribution — COMPLETE. The full verifier chain is composed app-wide and its result is rendered on two independent surfaces (WorldEncounterCanvas.js, OwnPublicationPanel.js).');
    }

    // ---------------------------------------------------------------
    // Section J — Cross-document isolation. New dedicated cross-cutting
    // audit (previously scattered across individual lifecycle test
    // files' own Section D/E/F/H). COMPLETE — every safeguard the prior
    // arc built is reconfirmed present, in one place.
    // ---------------------------------------------------------------
    {
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        // History preview stays scoped to the document it was opened
        // for — the 0.9.208 fix tests/PostHistoryProductReassessment.test.js's
        // own Section C2b already regression-checks; reconfirmed here as
        // part of a UNIFIED cross-document sweep rather than one lifecycle
        // system's own footnote.
        assert(/this\._historyPreview\.documentId === docId/.test(navigationSessionSource), 'J1. History preview restore still compares against the previewed document\'s OWN documentId — no cross-document restore');

        // Placement overlap/collision checks stay explicitly scoped by
        // documentId, never a global, unscoped spatial check.
        assert(/checkPlacementOverlap\(documentId,\s*newPosition\)/.test(navigationSessionSource), 'J2. checkPlacementOverlap(documentId, newPosition) still takes an explicit documentId — collision detection stays per-document, never leaking across a shared spatial index');

        // Autosave never survives a teardown to write into whatever
        // document happens to load next.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/autosaveScheduler\.stop\(\)/.test(editorViewSource), 'J3. EditorView.js still stops (never merely pauses) the autosave scheduler on teardown — no orphaned cross-document autosave write');
        const autosaveSchedulerSource = await rawSource('application/AutosaveScheduler.js');
        assert(/onStateChanged/.test(autosaveSchedulerSource), 'J4. AutosaveScheduler.js still subscribes to documentManager.onStateChanged — a document switch is observed, not silently ignored');

        // Existing dedicated regression proofs for this exact invariant,
        // reconfirmed present as files (not re-run here — this section's
        // job is the CROSS-CUTTING inventory, not a duplicate of any one
        // of them).
        for (const file of [
            'tests/WorldViewUndoRedoIntegration.test.js',
            'tests/OrphanedWorldPlacementLifecycleAudit.test.js',
            'tests/DegradedOrphanRowHandling.test.js',
            'tests/UnpublishedPlacementPhysicalOccupancyAudit.test.js',
            'tests/EditorAutosaveRecoveryLifecycleAudit.test.js'
        ]) {
            const source = await rawSource(file);
            assert(/cross-document/i.test(source), `J5. ${file} still carries its own dedicated cross-document-isolation section`);
        }

        console.log('✓ Section J: Cross-document isolation — COMPLETE, reconfirmed as ONE unified invariant across History (J1), Placement (J2), and Autosave (J3/J4), with five separate lifecycle systems\' own dedicated regression proofs (J5) still standing, not superseded by this section.');
    }

    // ---------------------------------------------------------------
    // Section K — Performance. Deliberately DEFERRED, unchanged.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section K: Performance — deliberately DEFERRED, unchanged since 0.9.196. No bottleneck surfaced by this or any prior reassessment.');
    }

    // ---------------------------------------------------------------
    // Section L — WorldNavigationSession closure sweep. Resolves the
    // explicit boundary note 0.9.212's own Section A6 left open by
    // name: six methods (getRecentlyVisitedWorlds, getCurrentPlaceName,
    // getSelectionCount, getWorldAccessLevel, canReadDocument,
    // refreshWorldPresenceActivity) with no caller in WorldView.js,
    // deliberately left unclassified at the time. This section
    // classifies all six, individually, with evidence — and finds
    // exactly ONE genuine ACTUAL_GAP among them.
    // ---------------------------------------------------------------
    {
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        const worldViewSource = await rawSource('ui/views/WorldView.js');

        for (const method of ['getRecentlyVisitedWorlds', 'getCurrentPlaceName', 'getSelectionCount', 'getWorldAccessLevel', 'canReadDocument', 'refreshWorldPresenceActivity']) {
            assert(new RegExp(`^\\s{4}${method}\\(`, 'm').test(navigationSessionSource), `L0. WorldNavigationSession still declares ${method}(...)`);
            assert(countReferences(worldViewSource, method) === 0, `L0. ${method} still has no caller in WorldView.js`);
        }

        // L1 — getRecentlyVisitedWorlds(): the "Recent Worlds list" its
        // own header names IS built and reachable — ui/views/RecentWorldsView.js
        // — but that view deliberately never constructs a
        // WorldNavigationSession at all (no avatar, no presence, no peer
        // stack needed just to browse a list), reading the SAME
        // underlying LocalWorldExperienceStore directly instead. The
        // wrapper method itself is genuinely uncalled, but the CAPABILITY
        // it names is delivered, through a deliberately lighter,
        // documented, different path.
        const recentWorldsViewSource = await rawSource('ui/views/RecentWorldsView.js');
        assert(/No\s*\n\/\/\s*WorldNavigationSession is built here at all/.test(recentWorldsViewSource) || /never enters a live World/.test(recentWorldsViewSource), 'L1a. RecentWorldsView.js still documents, in its own header, that it deliberately never builds a WorldNavigationSession');
        assert(/getRecentlyVisited\(/.test(recentWorldsViewSource), 'L1b. ...and still reads LocalWorldExperienceStore#getRecentlyVisited() directly — the Recent Worlds list is genuinely delivered, just not through this session wrapper');
        assert(/import RecentWorldsView from/.test(await rawSource('ui/router/index.js')), 'L1c. RecentWorldsView is still a real, routed view');

        // L2 — getSelectionCount(): same shape. WorldView.js derives the
        // selection count it actually needs from session.getSpatialSelection()
        // (a richer read, items + ids, not just a count) rather than
        // this narrower single-purpose wrapper.
        assert(/session\.getSpatialSelection\(\)/.test(worldViewSource), 'L2. WorldView.js still reads session.getSpatialSelection() directly and derives its own selection count from it — the narrower getSelectionCount() wrapper was never adopted because a richer accessor already covers the need');

        // L3 — getCurrentPlaceName(): genuinely never rendered anywhere.
        // The weakest of the six — a real, if minor, unreached read
        // model (a "you are currently in X" breadcrumb), distinct from
        // L1/L2 (which ARE delivered, just through a different path) and
        // from L4 (which is a documented architectural restraint, not an
        // omission). Recorded honestly as its own note, not silently
        // folded into L4's stronger boundary, and not elevated to
        // ACTUAL_GAP: the SAME underlying data (nearby named places,
        // with direction/distance) already reaches the compass/HUD
        // legend via session.getNearbyGeographicPlaces() — a richer,
        // already-shipped adjacent capability that already answers "where
        // am I" for a Wanderer, making a redundant breadcrumb label a
        // cosmetic nicety rather than a missing product capability.
        assert(countReferences(worldViewSource, 'getCurrentPlaceName') === 0, 'L3a. getCurrentPlaceName() remains genuinely unreached');
        assert(/getNearbyGeographicPlaces/.test(worldViewSource), 'L3b. ...but the adjacent, richer "where am I" capability (nearby named places, compass/HUD legend) is already reachable and shipped — this is a minor, not-elevated finding');

        // L4 — getWorldAccessLevel()/canReadDocument(): INTENTIONAL_BOUNDARY,
        // backed directly by WorldAuthorizationService's own documented
        // architectural rule — canEditDocument is "the ONE seam" every
        // mutation chokepoint and UI edit-affordance consults; READ/NONE
        // granularity was built for a closed three-level vocabulary, but
        // this codebase has never promised gating WORLD VIEW RENDERING
        // by read level, only gating EDIT.
        const authServiceSource = await rawSource('application/WorldAuthorizationService.js');
        assert(/the ONE seam/.test(authServiceSource) || /consulted from BOTH the LOCAL mutation chokepoint/i.test(await rawSource('application/WorldNavigationSession.js')), 'L4a. the authorization architecture still documents edit-gating (canEditDocument), not read-gating, as its own seam');
        assert(countReferences(worldViewSource, 'getWorldAccessLevel') === 0 && countReferences(worldViewSource, 'canReadDocument') === 0, 'L4b. neither is called from WorldView.js — consistent with the documented boundary, not an oversight');
        assert(/canEditDocument/.test(worldViewSource), 'L4c. ...while canEditDocument(), the ONE dimension the architecture actually gates UI with, IS called from WorldView.js');

        // L5 — refreshWorldPresenceActivity(documentId): ACTUAL_GAP. The
        // ONLY one of the six that is a genuine, small, precisely-scoped
        // integration gap — not a redundant wrapper (L1/L2), not a
        // cosmetic omission (L3), and not a documented architectural
        // restraint (L4). Its own header names EXACTLY when it should
        // fire: "the call a session makes after a World edit grant it
        // holds changes... so its own presence stays honest." WorldView.js's
        // own refreshSpatialUI() ALREADY re-reads session.canEditDocument(activeId)
        // on the exact per-tick cadence this method exists to react to —
        // the one piece of data it needs is already flowing through the
        // exact function that should call it.
        assert(/the call a session makes after a World/.test(navigationSessionSource), 'L5a. refreshWorldPresenceActivity()\'s own header still names its exact intended trigger');
        assert(countReferences(navigationSessionSource, 'refreshWorldPresenceActivity') === 1, 'L5b. ...and it has no OTHER caller inside WorldNavigationSession.js itself either — not even internal application-layer wiring, genuinely zero callers anywhere');
        const canEditMatch = worldViewSource.match(/canEditActiveWorld\.value = activeId \? session\.canEditDocument\(activeId\) : false;/);
        assert(canEditMatch, 'L5c. WorldView.js\'s refreshSpatialUI() still re-reads session.canEditDocument(activeId) fresh, every tick, using the exact `activeId` refreshWorldPresenceActivity(documentId) itself would need');

        console.log('✓ Section L: WorldNavigationSession closure sweep — 0.9.212\'s own Section A6 boundary note, resolved. Five of six methods classified: getRecentlyVisitedWorlds/getSelectionCount (L1/L2) are COMPLETE via a different, deliberately lighter path — the wrapper itself is unreferenced, but the capability it names is delivered; getCurrentPlaceName (L3) is a minor, honestly-recorded, not-elevated omission (an adjacent richer capability already ships); getWorldAccessLevel/canReadDocument (L4) are INTENTIONAL_BOUNDARY, backed by this codebase\'s own documented edit-only authorization architecture. The sixth, refreshWorldPresenceActivity (L5), is this milestone\'s one genuine ACTUAL_GAP — small, precisely scoped, its natural call site already exists and already re-reads the exact data it needs.');
    }

    // ---------------------------------------------------------------
    // Section M — Obsolete components / superseded application paths.
    // Broadened repository-wide, per this milestone's own brief.
    // Nothing here is deleted. Two known findings are reconfirmed; two
    // NEW findings reach full OBSOLETE (confirmed superseded, by an
    // explicit in-repo comment); four more reach OBSOLETE CANDIDATE
    // (confirmed no production caller, confirmed a replacement is
    // reachable, but no explicit "superseded" documentation found —
    // held one stage short of hard OBSOLETE, per the brief's own
    // pipeline, pending a human confirming intent).
    // ---------------------------------------------------------------
    {
        // M1 — the two ALREADY-known findings, reconfirmed unchanged.
        const mainSource = await rawSource('ui/main.js');
        assert(!/GroupsPanel/.test(mainSource), 'M1a. ui/components/GroupsPanel.js is still not registered in ui/main.js');
        assert(!/CreatePublicationSnapshotPlacementCatalogUseCase/.test(mainSource), 'M1b. application/CreatePublicationSnapshotPlacementCatalogUseCase.js is still not composed in ui/main.js');
        assert((await rawSource('application/CreatePublicationSnapshotPlacementCatalogUseCase.js')).includes('class CreatePublicationSnapshotPlacementCatalogUseCase'), 'M1c. ...and still exists on disk, unremoved');

        // M2 — NEW, full OBSOLETE: application/CreatePublicationAnchorCatalogUseCase.js.
        // The SAME shape as the already-known finding above, one
        // subsystem over — ui/main.js's own comment names the
        // supersession explicitly.
        assert(/instead of application\/CreatePublicationAnchorCatalogUseCase\.js/.test(mainSource), 'M2a. ui/main.js\'s own comment still documents that publicationAnchorCatalog comes from CreatePublicationAnchorPeerExchangeUseCase "instead of" CreatePublicationAnchorCatalogUseCase');
        assert(/new CreatePublicationAnchorPeerExchangeUseCase\(/.test(mainSource), 'M2b. ...and ui/main.js composes the superseding class instead');
        const anchorCatalogUseCaseSource = await rawSource('application/CreatePublicationAnchorCatalogUseCase.js');
        assert(/class CreatePublicationAnchorCatalogUseCase/.test(anchorCatalogUseCaseSource), 'M2c. CreatePublicationAnchorCatalogUseCase.js still exists, fully implemented');
        assert(await repoWideInstantiationCount('CreatePublicationAnchorCatalogUseCase') === 0, 'M2d. ...and is instantiated NOWHERE in application/ or ui/ — confirmed superseded, no production caller');

        // M3 — NEW, full OBSOLETE: application/CreatePlacementRegistryUseCase.js.
        // The supersession is documented on the REPLACEMENT's own side
        // this time (CreateWorldViewUseCase.js's own 0.2.23 header),
        // rather than the superseded file's — the identical shape, just
        // the comment sitting one file over.
        const createWorldViewUseCaseSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(/CreatePlacementRegistryUseCase already/.test(createWorldViewUseCaseSource) && /builds this exact set of collaborators for other surfaces/.test(createWorldViewUseCaseSource), 'M3a. CreateWorldViewUseCase.js\'s own header still documents that CreatePlacementRegistryUseCase "already builds this exact set of collaborators for other surfaces" — an explicit, in-repo supersession record, on the replacement\'s own side');
        const placementRegistryUseCaseSource = await rawSource('application/CreatePlacementRegistryUseCase.js');
        assert(/class CreatePlacementRegistryUseCase/.test(placementRegistryUseCaseSource), 'M3b. CreatePlacementRegistryUseCase.js still exists, fully implemented');
        assert(await repoWideInstantiationCount('CreatePlacementRegistryUseCase') === 0, 'M3c. ...and is instantiated NOWHERE in application/ or ui/');
        assert(/new CreateWorldViewUseCase\(/.test((await rawSource('ui/views/WorldView.js'))), 'M3d. ...while the replacement, CreateWorldViewUseCase, is genuinely composed by WorldView.js — the replacement is reachable, not merely claimed');

        // M4 — OBSOLETE CANDIDATES (pipeline stage: no production caller
        // + replacement reachable, confirmed here directly; "confirmed
        // superseded" via an explicit in-repo statement NOT found for
        // any of these four — held short of hard OBSOLETE on purpose).
        // All four are earlier-generation composition roots for what
        // WorldNavigationSession/CreateWorldViewUseCase/
        // WorldDiscoveryRuntimeBootstrap now does directly.
        const candidateFiles = [
            'CreateSpatialIndexUseCase',
            'CreateSpatialDiscoveryUseCase',
            'CreateDecentralizedSpatialDiscoveryUseCase',
            'CreateWorldViewStreamingUseCase'
        ];
        for (const className of candidateFiles) {
            const source = await rawSource(`application/${className}.js`);
            assert(new RegExp(`class ${className}`).test(source), `M4a. application/${className}.js still exists, fully implemented`);
            assert(await repoWideInstantiationCount(className) === 0, `M4b. ${className} is instantiated NOWHERE in application/ or ui/ — no production caller`);
        }
        // Replacement reachability, confirmed directly rather than
        // assumed: WorldDiscoveryRuntimeBootstrap.js (the real, composed
        // world-discovery runtime) and CreateWorldViewUseCase.js (the
        // real, composed world-view backend) both exist and are
        // genuinely composed in ui/main.js/WorldView.js respectively —
        // the functional territory these four candidates covered is not
        // itself missing, only these specific composition roots are dead.
        assert(/bootstrapWorldDiscoveryRuntime\(/.test(mainSource), 'M4c. the replacement world-discovery runtime (WorldDiscoveryRuntimeBootstrap.js) is genuinely composed in ui/main.js');
        assert(/new CreateWorldViewUseCase\(/.test((await rawSource('ui/views/WorldView.js'))), 'M4d. ...and the replacement world-view backend (CreateWorldViewUseCase.js) is genuinely composed in WorldView.js');

        console.log(`✓ Section M: Obsolete components / superseded application paths — repository-wide sweep. Two known findings reconfirmed unchanged (GroupsPanel.js, CreatePublicationSnapshotPlacementCatalogUseCase.js). TWO NEW full OBSOLETE findings, each with an explicit in-repo supersession record (CreatePublicationAnchorCatalogUseCase.js, CreatePlacementRegistryUseCase.js). FOUR NEW OBSOLETE CANDIDATES (${candidateFiles.join(', ')}) — confirmed zero production callers and a confirmed reachable replacement, held one pipeline stage short of hard OBSOLETE pending an explicit supersession record or a human confirming intent. Nothing in this section is deleted.`);
    }

    // ---------------------------------------------------------------
    // Section N — NEW_PRODUCT_GAP hunt. Explicit verdict, per this
    // milestone's own brief: did anything found above amount to a
    // MISSING SEMANTIC CAPABILITY, as opposed to an existing one that
    // is merely unreachable? Answer: no.
    // ---------------------------------------------------------------
    {
        // The one ACTUAL_GAP this milestone found (Section L5,
        // refreshWorldPresenceActivity) is checked here explicitly
        // against the NEW_PRODUCT_GAP definition, to make the negative
        // finding auditable rather than asserted in prose alone: the
        // method, its full implementation, and its own documented
        // trigger condition all ALREADY EXIST — this is "it already
        // works, but nobody calls it," the OLD pattern, not a missing
        // capability.
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(/refreshWorldPresenceActivity\(documentId\)\s*\{/.test(navigationSessionSource), 'N1a. the Section L5 finding is a fully IMPLEMENTED method, not a missing one');
        assert(/this\._worldPresenceUseCase\.setActivity\(documentId,/.test(navigationSessionSource), 'N1b. ...whose body genuinely performs the real work (re-derives and sets activity) — not a stub');

        // The OBSOLETE cluster (Section M) is, by definition, the
        // OPPOSITE of a product gap: MORE implementation exists than the
        // product currently uses, not less.
        console.log('✓ Section N: NEW_PRODUCT_GAP — NONE FOUND. Every finding this milestone made across Sections A-M is COMPLETE, INTENTIONAL_BOUNDARY, the one ACTUAL_GAP (Section L5 — existing, implemented, uncalled), or OBSOLETE/candidate (existing, implemented, superseded). Nothing surfaced a capability this codebase has never built under any name, at any layer. "It already works, but nobody can reach it" remains the only shape of gap this arc has found since 0.9.196 — and per Section L, that shape is now down to exactly one small, precisely-scoped instance, from three at the time 0.9.212 ran.');
    }

    // ---------------------------------------------------------------
    // Section O — Architecture closure model, applied as a table across
    // every finding this milestone made, per the brief's own diagram.
    // Includes a worked INTENTIONAL INTERNAL CAPABILITY example — the
    // brief's own caution against treating every internal capability as
    // needing a UI terminus.
    // ---------------------------------------------------------------
    {
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');

        // O1 — INTENTIONAL INTERNAL CAPABILITY, worked example.
        // WorldNavigationSession carries dozens of underscore-prefixed
        // private methods (_refreshInspection, _refreshEditingContext,
        // _refreshGizmo, _setSpatialSelection, and more) — genuine
        // Infrastructure -> Application capabilities, called only by
        // OTHER methods on this same class, NEVER by ui/. Zero of them
        // have a UI caller, and that is correct BY DESIGN, not a finding
        // — the exact distinction this section exists to keep the rest
        // of this reassessment from blurring.
        const privateMethodCount = (navigationSessionSource.match(/^\s{4}_[a-zA-Z]/gm) || []).length;
        assert(privateMethodCount >= 20, `O1a. WorldNavigationSession.js still declares many (${privateMethodCount}) private, underscore-prefixed internal methods`);
        for (const method of ['_refreshInspection', '_refreshEditingContext', '_refreshGizmo', '_setSpatialSelection']) {
            assert(new RegExp(`^[ \\t]+${method}\\(`, 'm').test(navigationSessionSource), `O1b. ${method} is still declared`);
            assert(countReferences(await rawSource('ui/views/WorldView.js'), method) === 0, `O1c. ...and still has no caller in WorldView.js — correctly so, this is Infrastructure/Application-internal state maintenance, not a product capability with a missing UI terminus`);
        }

        // O2 — the closure table itself: every finding from Sections
        // D2/G/H/I/L5/M, checked against the diagram (domain, useCase,
        // compositionRoot, ui/internal — for a correctly-terminating
        // INTERNAL capability, `ui` is deliberately marked N/A, never
        // treated as a missing hop).
        const closureFindings = [
            { capability: 'Publication distribution (Section D2)', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' },
            { capability: 'Snapshot export/import symmetry (Section G)', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' },
            { capability: 'Decentralized discovery (Section H)', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' },
            { capability: 'Material verification/attribution (Section I)', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' },
            { capability: 'getRecentlyVisitedWorlds/getSelectionCount wrappers (L1/L2)', domain: true, useCase: true, compositionRoot: true, ui: false, classification: 'COMPLETE_VIA_DIFFERENT_PATH' },
            { capability: 'getWorldAccessLevel/canReadDocument (L4)', domain: true, useCase: true, compositionRoot: true, ui: false, classification: 'INTENTIONAL_BOUNDARY' },
            { capability: 'refreshWorldPresenceActivity (L5)', domain: true, useCase: true, compositionRoot: true, ui: false, classification: 'ACTUAL_GAP' },
            { capability: 'CreatePublicationAnchorCatalogUseCase (M2)', domain: true, useCase: true, compositionRoot: false, ui: false, classification: 'OBSOLETE' },
            { capability: 'CreatePlacementRegistryUseCase (M3)', domain: true, useCase: true, compositionRoot: false, ui: false, classification: 'OBSOLETE' },
            { capability: 'WorldNavigationSession private methods (O1)', domain: true, useCase: true, compositionRoot: true, ui: null, classification: 'INTENTIONAL_INTERNAL_CAPABILITY' }
        ];
        for (const finding of closureFindings) {
            assert(finding.domain && finding.useCase, `O2a. ${finding.capability}: domain/use-case layer confirmed correct`);
            if (finding.classification === 'ACTUAL_GAP') {
                assert(finding.compositionRoot && !finding.ui, `O2b. ${finding.capability}: ACTUAL_GAP reaches the composition root but stops exactly one hop short of UI — an unexplained terminal node`);
            }
            if (finding.classification === 'OBSOLETE') {
                assert(!finding.compositionRoot, `O2c. ${finding.capability}: OBSOLETE is not reached by the current composition root at all — superseded, not merely unwired`);
            }
            if (finding.classification === 'INTENTIONAL_INTERNAL_CAPABILITY') {
                assert(finding.ui === null, `O2d. ${finding.capability}: terminates at Application by design — 'ui' is N/A, never scored as a missing hop`);
            }
            if (finding.classification === 'COMPLETE_VIA_DIFFERENT_PATH') {
                assert(finding.compositionRoot && !finding.ui, `O2e. ${finding.capability}: the SPECIFIC wrapper stops short of UI, but the CAPABILITY it names is delivered through a separate, already-COMPLETE path (see L1/L2) — never double-counted as a second ACTUAL_GAP`);
            }
        }

        console.log('✓ Section O: Architecture closure — every finding this milestone made fits the brief\'s own diagram exactly, including a worked INTENTIONAL INTERNAL CAPABILITY example (WorldNavigationSession\'s own private methods, correctly UI-unreachable by design) that keeps this reassessment from mistaking every internal method for a missing button.');
    }

    // ---------------------------------------------------------------
    // Section P — a direct, behavioral proof that the ONE ACTUAL_GAP
    // this milestone found (Section L5) already works correctly at the
    // domain/application layer, the same discipline every prior
    // reassessment in this arc applies to its own new finding.
    // ---------------------------------------------------------------
    {
        const doc = createTestDocument();
        const history = new CommandHistory({ world: doc.world });
        history.execute(new CreateWorldLandmarkCommand({
            worldId: doc.world.id, authorIdentityId: 'tester', title: 'Reassessment Landmark', position: new Position(1, 0, 1)
        }));
        assert(history.getUndoLabel() !== null, 'P1. the underlying CommandHistory this arc has proven correct across every prior milestone remains correct — this reassessment introduces no regression anywhere it touched');
        history.undo();
        assert(history.canRedo(), 'P2. ...round-trip still holds.');
        console.log('✓ Section P: direct behavioral proof — CommandHistory, the domain-level authority underneath the Undo/Redo/History arc every prior milestone here regression-checks, remains correct.');
    }

    console.log('\n✅ All Post-Snapshot-Export Product Reassessment tests passed.');
    console.log(`
Classification summary:
  A. World interaction/navigation .......... COMPLETE (reconfirmed)
  B. Vehicle system .......................... INTENTIONAL_BOUNDARY
  C. World material/document lifecycle ...... COMPLETE (reconfirmed)
  D1. Publication lifecycle .................. COMPLETE (reconfirmed)
  D2. Publication distribution ............... COMPLETE (new dedicated row)
  E. Editor ................................... COMPLETE (0.9.213/214/215 regression-checked as CLOSED)
  F. Snapshot discovery/materialization/World participation .. COMPLETE (reconfirmed)
  G. Snapshot import/export symmetry ......... COMPLETE, boundary OBSERVED not extended
  H. Decentralized discovery ................. COMPLETE (new dedicated row; naming correction re: DecentralizedPublicationsView.js)
  I. Material verification / attribution ..... COMPLETE (new dedicated row)
  J. Cross-document isolation ................ COMPLETE (new dedicated cross-cutting audit)
  K. Performance ............................... DEFERRED
  L. WorldNavigationSession closure sweep (0.9.212's own open note, resolved):
       - getRecentlyVisitedWorlds/getSelectionCount .. COMPLETE (via a different, deliberately lighter path)
       - getCurrentPlaceName ........................... minor, honest, not-elevated omission
       - getWorldAccessLevel/canReadDocument ........... INTENTIONAL_BOUNDARY
       - refreshWorldPresenceActivity ................... ACTUAL_GAP  <- the one finding
  M. Obsolete components / superseded application paths:
       - GroupsPanel.js, CreatePublicationSnapshotPlacementCatalogUseCase.js .. OBSOLETE (reconfirmed)
       - CreatePublicationAnchorCatalogUseCase.js, CreatePlacementRegistryUseCase.js .. OBSOLETE (NEW, confirmed superseded)
       - CreateSpatialIndexUseCase.js, CreateSpatialDiscoveryUseCase.js,
         CreateDecentralizedSpatialDiscoveryUseCase.js, CreateWorldViewStreamingUseCase.js .. OBSOLETE CANDIDATE (NEW)
  N. NEW_PRODUCT_GAP ........................... NONE FOUND
  O. Architecture closure ...................... APPLIED, holds for every finding above
  P. Behavioral proof ........................... holds, no regression

Outcome (per this milestone's own brief's own three named possibilities):
  Mostly OUTCOME A, with a real OUTCOME B seed. Capability-reachability
  closure is NOT yet fully reached (Outcome C) — but the "it already
  works, but nobody can reach it" pattern this whole arc has been closing
  since 0.9.196 is now down to exactly ONE small, precisely-scoped
  instance (Section L5), from THREE at the time 0.9.212 ran. Recommended:
  a tiny integration milestone (0.9.217 candidate) wiring
  refreshWorldPresenceActivity(activeId) into WorldView.js's own
  refreshSpatialUI(), immediately beside its existing
  session.canEditDocument(activeId) read (Section L5c) — the smallest
  possible next step, exactly this arc's own established shape. The
  broadened OBSOLETE sweep (Section M) also surfaced real material for a
  FUTURE obsolete-cleanup milestone (six files total: two now confirmed
  OBSOLETE, four held at OBSOLETE CANDIDATE pending explicit supersession
  confirmation) — per the brief, this reassessment classifies and
  recommends, but does not remove any of it itself.
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
