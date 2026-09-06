import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { VehicleType } from '../core/VehicleType.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';

// 0.9.212 — Post-Undo/Redo Product Reassessment.
//
// Test-only. No production changes. 0.9.211's own closing recommendation
// asked for exactly this, in the shape 0.9.196/0.9.203/0.9.206/0.9.209
// already established: a fresh sweep of the same broad product areas, now
// that the entire World View Undo/Redo arc (0.9.209 candidate, 0.9.210 UI,
// 0.9.211 lifecycle audit) is closed. Two areas are added this time, per
// this milestone's own brief: Snapshot gets its own row (previously only
// touched inside "cross-cutting lifecycle integrity"), and a repository-
// wide sweep is run explicitly for OTHER "composed but UI-unreachable"
// application-level capabilities and for OTHER superseded-but-undeleted
// UI/application files beyond the already-known ui/components/GroupsPanel.js
// — the brief's own worked example was WorldNavigationSession's
// undo()/redo()/canUndo()/canRedo()/getUndoLabel()/getRedoLabel(), now that
// all six have real UI callers in WorldView.js.
//
// Classification vocabulary, unchanged since 0.9.203:
//
//   COMPLETE              — already fully reachable, nothing to do.
//   INTENTIONAL_BOUNDARY  — deliberately undone; a decision, not a gap.
//   ACTUAL_GAP            — a genuine missing product capability.
//   OBSOLETE              — a real, complete implementation, superseded
//                           in place, and not reachable from the current
//                           product architecture.
//
// This file does not implement anything it finds. Per the brief, it stops
// at classification and recommendation — 0.9.212 does not prescribe
// 0.9.213.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Post-Undo/Redo Reassessment Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Same restraint 0.9.156 through 0.9.209 already apply: strip full-line
// `//` comments before counting references, so a sweep counts genuine
// code references, never a comment that merely names a class in prose.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

function extractArrowBody(source, name) {
    // Extracts the body of `name = (event) => { ... };` — the exact shape
    // EditorView.js's own onPointerDown/onPointerMove/onPointerUp handlers
    // take (assigned to a let declared above, not a bare function).
    const match = source.match(new RegExp(`${name}\\s*=\\s*\\(event\\)\\s*=>\\s*\\{([\\s\\S]*?)\\n\\s{12}\\};`));
    return match ? match[1] : null;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation. COMPLETE, reconfirmed.
    // Everything 0.9.196-0.9.211 already wired stays wired; the whole
    // Undo/Redo arc this milestone reassesses is now closed end to end.
    // ---------------------------------------------------------------
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const componentTags = new Set((worldView.match(/<[A-Z][A-Za-z]+/g) || []).map((tag) => tag.slice(1)));
        for (const name of ['PlacementInfoPanel', 'OwnPublicationPanel', 'HistoryTimelinePanel', 'VehicleInteractionPrompt', 'WorldEncounterCanvas']) {
            assert(componentTags.has(name), `A1. WorldView.js still composes ${name}`);
        }

        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        const emitsMatch = placementInfoPanelSource.match(/emits:\s*\[([^\]]*)\]/);
        assert(emitsMatch && /\bremove\b/i.test(emitsMatch[1]), 'A2. PlacementInfoPanel.js still emits \'remove\' — removal stays reachable');

        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/unpublishCommand/.test(ownPublicationPanelSource), 'A3. OwnPublicationPanel.js still wires an unpublishCommand — retract stays reachable');

        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview']) {
            assert(countReferences(worldView, identifier) > 0, `A4. WorldView.js still references ${identifier} — the History panel stays reachable`);
        }

        // A5 — the 0.9.209 finding, closed by 0.9.210 and audited by
        // 0.9.211, stays closed: WorldView.js calls session.undo()/
        // session.redo() directly, has a ctrl/meta+Z (and +Y/+Shift+Z)
        // keydown branch, and canUndo()/canRedo()/getUndoLabel()/
        // getRedoLabel() are all consumed by refreshSpatialUI().
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(/session\.undo\(\)/.test(worldView) && /session\.redo\(\)/.test(worldView), 'A5a. WorldView.js still calls session.undo()/session.redo()');
        assert(/(ctrl|meta)Key[\s\S]{0,200}(['"]z['"]|['"]y['"])/i.test(worldView), 'A5b. WorldView.js\'s keydown handling still branches on ctrl/meta+Z (and +Y/+Shift+Z for redo)');
        for (const identifier of ['canUndo', 'canRedo', 'getUndoLabel', 'getRedoLabel']) {
            assert(countReferences(worldView, identifier) > 0, `A5c. WorldView.js still references session.${identifier}()`);
        }
        assert(/canUndo\(\)/.test(navigationSessionSource) && /canRedo\(\)/.test(navigationSessionSource), 'A5d. WorldNavigationSession still exposes canUndo()/canRedo()');

        // A6 — a repository-wide "exposed-but-unused API" sweep of
        // WorldNavigationSession's OWN full public surface, per this
        // milestone's own brief ("do the same repository-wide for other
        // application-level capabilities"). Six representative methods
        // outside the Undo/Redo/History/Recovery territory this arc has
        // been closing — spanning avatar-presence, geographic search, and
        // permission-checking — have no caller in WorldView.js at all.
        // These are NOT classified as a new ACTUAL_GAP here: they predate
        // this arc, belong to subsystems this milestone's brief does not
        // name (avatar presence, geographic search, access control), and
        // asserting they are gaps (rather than, say, a getter meant for a
        // different caller, or scaffolding for a feature not yet
        // scoped) would be exactly the "invent a feature" mistake the
        // brief warns against. Recorded here as an explicit boundary
        // note for whichever future reassessment DOES scope that
        // territory in, not silently absorbed into this one's count.
        for (const method of ['getRecentlyVisitedWorlds', 'getCurrentPlaceName', 'getSelectionCount', 'getWorldAccessLevel', 'canReadDocument', 'refreshWorldPresenceActivity']) {
            assert(new RegExp(`^\\s{4}${method}\\(`, 'm').test(navigationSessionSource), `A6a. WorldNavigationSession still declares ${method}(...)`);
            assert(countReferences(worldView, method) === 0, `A6b. ${method} still has no caller in WorldView.js (out-of-scope boundary note, not a new finding)`);
        }

        console.log('✓ Section A: World interaction/navigation — COMPLETE. The entire 0.9.209/0.9.210/0.9.211 Undo/Redo arc is closed and reconfirmed. Six WorldNavigationSession methods outside this arc\'s own territory (avatar presence, geographic search, access control) remain uncalled by WorldView.js — noted as an explicit scope boundary for a future reassessment, not adopted as this milestone\'s own finding.');
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
        for (const file of ['application/AvatarVehicleInteractionController.js', 'application/AvatarVehicleMovementController.js', 'core/VehicleInstance.js', 'core/VehiclePresence.js']) {
            const source = await rawSource(file);
            assert(!/passenger|multi-?rider/i.test(codeOnlyLines(source).join('\n')), `B3. ${file} still carries no passenger/multi-rider vocabulary in code`);
        }
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(/VehicleInteractionPrompt/.test(worldView), 'B4. Vehicle mount/dismount/movement stays UI-reachable via VehicleInteractionPrompt — the narrowness is scope, not dead code');
        console.log('✓ Section B: Vehicle system — INTENTIONAL_BOUNDARY, unchanged since 0.9.196. Multi-passenger capacity, fuel/range, and rental/ownership remain undocumented requirements, not missing implementations; existing interaction/movement remains fully wired.');
    }

    // ---------------------------------------------------------------
    // Section C — World material/document lifecycle. COMPLETE,
    // reconfirmed (autosave/recovery, history/replay/restore, placement
    // lifecycle all remain reachable).
    // ---------------------------------------------------------------
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const destructureMatch = editorViewSource.match(/const \{([^}]*)\}\s*=\s*new CreatePersistenceUseCase\(\)\.execute\(\)/);
        assert(destructureMatch, 'C1a. EditorView.js still destructures CreatePersistenceUseCase().execute()');
        for (const field of ['autosaveDocumentUseCase', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase']) {
            assert(destructureMatch[1].includes(field), `C1b. EditorView.js still takes ${field}`);
        }
        assert(/<RecoveryBanner/.test(editorViewSource), 'C1c. RecoveryBanner is still in the template');

        const worldViewSource = await rawSource('ui/views/WorldView.js');
        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview']) {
            assert(countReferences(worldViewSource, identifier) > 0, `C2a. WorldView.js still references ${identifier}`);
        }
        for (const method of ['createLandmarkHere', 'createRegionHere', 'movePlacement', 'removePlacement', 'unpublishDocument', 'searchWorld']) {
            assert(countReferences(worldViewSource, method) > 0, `C3. WorldView.js still calls session.${method}(...)`);
        }

        console.log('✓ Section C: World material/document lifecycle — COMPLETE, reconfirmed. Autosave/recovery, history/replay/restore, and placement/publication/naming all remain composed and UI-reachable.');
    }

    // ---------------------------------------------------------------
    // Section D — Publication workflow. COMPLETE, reconfirmed.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 9, `D1. OwnPublicationPanel.js still wires at least 9 distinct actions (found ${clickHandlers.size})`);
        assert([...clickHandlers].some((h) => /^unpublish|^retract/i.test(h)), 'D2. an unpublish/retract-shaped handler remains wired');
        assert(clickHandlers.has('discoverOwnSnapshot') && clickHandlers.has('discoverSnapshotCandidates') && clickHandlers.has('distributeOwnSnapshot'), 'D3. OwnPublicationPanel.js still wires Snapshot discovery/distribution actions alongside Publication');

        const removePlacementSource = await rawSource('application/RemoveWorldPlacementUseCase.js');
        assert(!/Publish|Unpublish/.test(removePlacementSource), 'D4a. Unpublish ≠ Remove placement: RemoveWorldPlacementUseCase.js still carries no Publish/Unpublish reference');
        const unpublishSource = await rawSource('application/UnpublishDocumentUseCase.js');
        assert(!/Placement/.test(unpublishSource), 'D4b. Unpublish ≠ Remove placement: UnpublishDocumentUseCase.js still carries no Placement reference');

        console.log(`✓ Section D: Publication workflow — COMPLETE, reconfirmed. ${clickHandlers.size} wired actions cover publish/unpublish/anchor/distribute/Snapshot. Unpublish ≠ Remove placement holds in both directions.`);
    }

    // ---------------------------------------------------------------
    // Section E — Snapshot. This milestone's own dedicated row (per the
    // brief's table), previously only touched inside "cross-cutting
    // lifecycle integrity." Manual/automatic discovery, resolution, and
    // materialization (placement/peer/selected-candidate) into World
    // participation are all COMPLETE. Two findings, both new to this
    // milestone.
    // ---------------------------------------------------------------
    {
        // E1 — manual discovery, automatic discovery, materialization,
        // and World participation are all real, composed, UI-reachable
        // paths — regression-checked directly against source.
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/discoverOwnSnapshot\s*\(\)\s*\{/.test(ownPublicationPanelSource) || /discoverOwnSnapshot\(/.test(ownPublicationPanelSource), 'E1a. OwnPublicationPanel.js still defines/calls discoverOwnSnapshot (manual discovery)');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/worldSnapshotDiscoveryMonitor\.observe\(/.test(worldViewSource), 'E1b. WorldView.js still drives worldSnapshotDiscoveryMonitor.observe() on its own refresh tick (automatic discovery)');
        assert(/automaticSnapshotEncounterCascade\.processCandidate\(/.test(worldViewSource), 'E1c. WorldView.js still feeds discovered candidates to automaticSnapshotEncounterCascade.processCandidate() (automatic materialization)');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/openSnapshotContentView/.test(canvasSource) && /unregisterSelectedSnapshot/.test(canvasSource), 'E1d. WorldEncounterCanvas.js still lets a materialized Snapshot be viewed and removed — real World participation, not a dead end');
        const decentralizedViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(/materializePlacement\(/.test(decentralizedViewSource), 'E1e. DecentralizedPublicationsView.js still wires an explicit "Materialize Snapshot" action');
        assert(/importSnapshotContent\(/.test(decentralizedViewSource), 'E1f. DecentralizedPublicationsView.js still wires an explicit "Import Snapshot" action');
        console.log('✓ Section E1: Snapshot discovery/resolution/materialization/World-participation — COMPLETE. Manual (button) and automatic (timer-driven) discovery both feed real materialization, and a materialized Snapshot is visible, viewable, and removable in World View — not a dead end.');

        // E2 — ACTUAL_GAP. application/BuildPublicationSnapshotTransferPackageUseCase.js
        // is the export-side counterpart of application/
        // ImportPublicationSnapshotTransferPackageUseCase.js — by its own
        // header's own words — fully implemented, throws the correct
        // errors for an uncataloged or unpossessed publication, and is
        // exercised directly by SEVEN test files. Import is composed in
        // ui/main.js and has a real "Import Snapshot" button
        // (E1f above). Export has neither: no composition in ui/main.js,
        // no coordinator method (SnapshotContentMaterializationCoordinator
        // only ever grew an import(), never an export()), and no
        // "Export Snapshot" text anywhere in the UI.
        const buildUseCaseSource = await rawSource('application/BuildPublicationSnapshotTransferPackageUseCase.js');
        assert(/export-side counterpart/i.test(buildUseCaseSource), 'E2a. BuildPublicationSnapshotTransferPackageUseCase.js still documents itself as the export-side counterpart of the Import use case');
        assert(/class BuildPublicationSnapshotTransferPackageUseCase/.test(buildUseCaseSource), 'E2b. BuildPublicationSnapshotTransferPackageUseCase still exists, fully implemented');
        const mainSource = await rawSource('ui/main.js');
        assert(/new ImportPublicationSnapshotTransferPackageUseCase\(/.test(mainSource), 'E2c. ui/main.js still composes ImportPublicationSnapshotTransferPackageUseCase (the wired half)');
        assert(!/BuildPublicationSnapshotTransferPackageUseCase/.test(mainSource), 'E2d. ui/main.js still never imports/composes BuildPublicationSnapshotTransferPackageUseCase — the ACTUAL_GAP, confirmed unchanged');
        const coordinatorSource = await rawSource('application/SnapshotContentMaterializationCoordinator.js');
        assert(/async import\(pkg\)/.test(coordinatorSource), 'E2e. SnapshotContentMaterializationCoordinator still has an import(pkg) method');
        assert(!/BuildPublicationSnapshotTransferPackageUseCase/.test(coordinatorSource), 'E2f. ...but still no export()-shaped counterpart or reference to the Build use case');
        assert(!/[Ee]xport [Ss]napshot/.test(decentralizedViewSource), 'E2g. DecentralizedPublicationsView.js still has no "Export Snapshot" UI text — the asymmetry is confirmed at the UI layer too');
        console.log('✓ Section E2: ACTUAL_GAP — application/BuildPublicationSnapshotTransferPackageUseCase.js is a correct, fully tested, explicitly-documented export-side counterpart of the wired Import Snapshot flow, but is composed nowhere and has no UI action. Import and Export are not symmetric today.');

        // E3 — OBSOLETE. application/CreatePublicationSnapshotPlacementCatalogUseCase.js
        // (0.8.18) is a real, complete composition-root class — but its own
        // sibling, application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js
        // (0.8.19), explicitly documents (in its own header) that it builds
        // an equivalent catalog itself rather than reusing this one, and
        // that use case's `catalog` is the one ui/main.js actually threads
        // everywhere. This is the first OBSOLETE finding this arc has found
        // in the application layer rather than the UI layer — the same
        // "superseded in place, never deleted" shape ui/components/
        // GroupsPanel.js already has, one layer down.
        const catalogUseCaseSource = await rawSource('application/CreatePublicationSnapshotPlacementCatalogUseCase.js');
        assert(/class CreatePublicationSnapshotPlacementCatalogUseCase/.test(catalogUseCaseSource), 'E3a. CreatePublicationSnapshotPlacementCatalogUseCase.js still exists, fully implemented');
        assert(!/CreatePublicationSnapshotPlacementCatalogUseCase/.test(mainSource), 'E3b. ui/main.js still never composes CreatePublicationSnapshotPlacementCatalogUseCase');
        const peerExchangeUseCaseSource = await rawSource('application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js');
        assert(/rather than reusing application\/[\s\S]{0,40}CreatePublicationSnapshotPlacementCatalogUseCase/.test(peerExchangeUseCaseSource), 'E3c. CreatePublicationSnapshotPlacementPeerExchangeUseCase.js still documents, in its own header, that it deliberately does not reuse the catalog use case');
        assert(/new CreatePublicationSnapshotPlacementPeerExchangeUseCase\(/.test(mainSource), 'E3d. ui/main.js composes the superseding use case instead');
        console.log('✓ Section E3: OBSOLETE — application/CreatePublicationSnapshotPlacementCatalogUseCase.js is a real, complete, but superseded-in-place composition root, unused by ui/main.js and explicitly bypassed by its own sibling\'s design record. Identified here, not deleted.');
    }

    // ---------------------------------------------------------------
    // Section F — History. COMPLETE, reconfirmed as a single authority
    // with several genuinely separate projections over it (per the
    // brief's own diagram: Undo/Redo, Timeline, Preview, Restore).
    // ---------------------------------------------------------------
    {
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        const commandHistoryImports = [...navigationSessionSource.matchAll(/import\s*\{[^}]*\bCommandHistory\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g)];
        assert(commandHistoryImports.length === 1, 'F1a. WorldNavigationSession.js still imports exactly one CommandHistory-shaped class');
        assert(/avoids maintaining a second/.test(navigationSessionSource) || !/_undoStack|_redoStack/.test(navigationSessionSource), 'F1b. WorldNavigationSession.js still maintains no second undo/redo stack of its own');

        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(!/_undoStack|_redoStack/.test(editorSessionSource), 'F2. EditorSession.js also maintains no second undo/redo stack — CommandHistory stays the sole authority for the Editor too');

        const commandHistorySource = await rawSource('application/CommandHistory.js');
        assert(/undo\(/.test(commandHistorySource) && /redo\(/.test(commandHistorySource), 'F3a. CommandHistory.js still defines undo()/redo()');

        // F4 — HistoryTimelinePanel (browse/preview/restore) and the
        // Undo/Redo buttons/shortcut are genuinely separate UI surfaces
        // over the SAME CommandHistory, neither superseding the other.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/undoAction|session\.undo\(\)/.test(worldViewSource), 'F4a. WorldView.js still has its own Undo affordance');
        assert(countReferences(worldViewSource, 'HistoryTimelinePanel') > 0, 'F4b. WorldView.js still composes HistoryTimelinePanel separately');
        const timelinePanelSource = await rawSource('ui/components/HistoryTimelinePanel.js');
        assert(!/undo\(\)|redo\(\)/.test(timelinePanelSource), 'F4c. HistoryTimelinePanel.js still has no undo()/redo() affordance of its own — Preview/Restore stay a distinct projection');

        console.log('✓ Section F: History — COMPLETE. CommandHistory remains the sole history authority for both WorldNavigationSession and EditorSession; Undo/Redo and the HistoryTimelinePanel (browse/Preview/Restore) remain two genuinely separate, non-overlapping projections over it, exactly as the brief\'s own diagram describes.');
    }

    // ---------------------------------------------------------------
    // Section G — Editor. Two ACTUAL_GAPs, both new to this milestone —
    // the same "existing capability, correct, no UI caller" shape the
    // whole 0.9.203-0.9.211 arc has been finding, now inside the Editor
    // rather than World View.
    // ---------------------------------------------------------------
    {
        // G1 — ACTUAL_GAP. Live transform-gesture feedback. The chain is
        // correct end to end: SpatialEditingService.getGestureFeedback()
        // is rebuilt every gesture frame; TransformGizmoController reads
        // it via _readGestureFeedback() and returns it as `.feedback` on
        // its onPointerDown/onPointerMove/onPointerUp results;
        // EditorSession.onPointerMove()/onPointerUp() forward that whole
        // result object when the gizmo consumed the event. A dedicated,
        // complete, purpose-built presentational component
        // (ui/components/TransformFeedback.js) already exists for exactly
        // this blob shape. But EditorView.js's own pointer handlers call
        // editorSession.onPointerDown()/onPointerMove()/onPointerUp() and
        // discard the return value outright — never captured into
        // reactive state, never rendered.
        const spatialEditingServiceSource = await rawSource('application/SpatialEditingService.js');
        assert(/getGestureFeedback\(\)\s*\{\s*return this\._gestureFeedback;\s*\}/.test(spatialEditingServiceSource), 'G1a. SpatialEditingService still exposes getGestureFeedback(), correctly maintained');

        const gizmoControllerSource = await rawSource('renderer/TransformGizmoController.js');
        assert(/_readGestureFeedback\(\)\s*\{/.test(gizmoControllerSource), 'G1b. TransformGizmoController still reads gesture feedback from the service');
        assert(/feedback:\s*this\._readGestureFeedback\(\)/.test(gizmoControllerSource), 'G1c. ...and still returns it as `feedback` on its pointer-event results');

        const editorSessionSource = await rawSource('application/EditorSession.js');
        const onPointerMoveMethod = editorSessionSource.slice(editorSessionSource.indexOf('    onPointerMove(event) {'), editorSessionSource.indexOf('    onPointerUp(event) {'));
        assert(/const result = this\._session\.gizmoPointerMove\(/.test(onPointerMoveMethod), 'G1d. EditorSession.onPointerMove() still reads the gizmo\'s result...');
        assert(/if \(result && result\.consumed\) {\s*return result;/.test(onPointerMoveMethod), 'G1e. ...and still forwards the WHOLE result (including feedback) to its own caller when the gizmo consumed the event');

        const transformFeedbackSource = await rawSource('ui/components/TransformFeedback.js');
        assert(/name:\s*'TransformFeedback'/.test(transformFeedbackSource), 'G1f. ui/components/TransformFeedback.js still exists, fully implemented, purpose-built for this exact feedback blob');

        // UPDATE (0.9.214): closed. "Editor Transform Gesture Feedback"
        // captures the return value EditorSession.onPointerMove()/
        // onPointerUp() already forwarded into a `transformFeedback` ref
        // and mounts the already-built TransformFeedback.js — no new
        // transform math, no second feedback shape, no change to
        // SpatialEditingService/TransformGizmoController/EditorSession at
        // all (G1a-G1e above stay true, unchanged). See
        // tests/EditorTransformGestureFeedback.test.js for the full
        // lifecycle proof and docs/Roadmap.md's own 0.9.214 entry.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/import TransformFeedback from '..\/components\/TransformFeedback\.js';/.test(editorViewSource), 'G1g. (post-0.9.214) EditorView.js now imports TransformFeedback');
        assert(/<TransformFeedback :feedback="transformFeedback" \/>/.test(editorViewSource), '...and mounts it, bound to a local transformFeedback ref');
        const onPointerMoveBody = extractArrowBody(editorViewSource, 'onPointerMove');
        assert(onPointerMoveBody !== null, 'G1h. EditorView.js still defines its onPointerMove handler in the expected shape');
        assert(/const result = editorSession\.onPointerMove\(event\);/.test(onPointerMoveBody), 'G1i. (post-0.9.214) ...which now captures editorSession.onPointerMove(event)\'s return value...');
        assert(/transformFeedback\.value = result\.feedback \|\| null;/.test(onPointerMoveBody), '...and assigns its feedback (or null) into the reactive ref — no reconstruction, a bare passthrough');
        const onPointerUpBody = extractArrowBody(editorViewSource, 'onPointerUp');
        assert(onPointerUpBody !== null
            && /const result = editorSession\.onPointerUp\(event\);/.test(onPointerUpBody)
            && /transformFeedback\.value = result\.feedback \|\| null;/.test(onPointerUpBody), 'G1j. onPointerUp shows the identical capture — clearing the overlay once the gesture forwards feedback: null');
        assert(!/=\s*editorSession\.onPointerDown\(event\)/.test(extractArrowBody(editorViewSource, 'onPointerDown') || ''), 'G1k. onPointerDown is untouched — it never carried feedback (no preview exists yet at grab time) and still does not capture a return value');
        console.log('✓ Section G1: ACTUAL GAP AT THE TIME, CLOSED BY 0.9.214 — live transform-gesture feedback (snap increment, axis, delta, precision, collision) is built correctly every frame and forwarded correctly up through EditorSession; EditorView.js now captures it into reactive state and mounts the ready-made TransformFeedback.js component built for exactly this purpose.');

        // G2 — ACTUAL_GAP AT THE TIME this milestone (0.9.212) ran. The
        // read-only undo/redo LABEL mirrors — this milestone's own brief
        // named getUndoLabel()/getRedoLabel() specifically. WorldView.js's
        // OWN pair (Section A5c) is wired to a real tooltip. The Editor's
        // own EditorSession.getUndoLabel()/getRedoLabel() ARE called — via
        // EditorActionContext's own historyCall() helper — but the
        // resulting ctx.undoLabel/ctx.redoLabel were read by NOTHING:
        // EditorActionRegistry's own history.undo/history.redo actions
        // used static 'Undo'/'Redo' labels and generic 'Nothing to
        // undo'/'Nothing to redo' disabledReason text, both of which
        // CommandPalette.js genuinely renders on screen (action.label /
        // action.disabledReason(ctx)) — a real, visible product gap, not
        // unread plumbing.
        //
        // UPDATE (0.9.213): closed. "Editor Undo/Redo Label Mirrors" gave
        // EditorActionRegistry's history.undo/history.redo actions a
        // contextualLabel(ctx) field — a bare passthrough of
        // ctx.undoLabel/ctx.redoLabel, never a reconstruction — and
        // ui/components/CommandPalette.js's new displayLabel() reads it in
        // place of the static label whenever it is non-null. The static
        // label itself is untouched (search, and
        // ui/components/KeyboardShortcutsOverlay.js's context-free
        // listing, still see a stable 'Undo'/'Redo'), and disabledReason
        // stays exactly the generic text it always was — ctx.undoLabel is
        // already null whenever ctx.canUndo is false, so there was never
        // anything more specific to say there. See
        // tests/EditorUndoRedoLabelMirrors.test.js for the full
        // integration proof and docs/Roadmap.md's own 0.9.213 entry.
        const editorSessionMethods = editorSessionSource;
        assert(/getUndoLabel\(\)\s*\{/.test(editorSessionMethods) && /getRedoLabel\(\)\s*\{/.test(editorSessionMethods), 'G2a. EditorSession still declares getUndoLabel()/getRedoLabel()');

        const actionContextSource = await rawSource('application/EditorActionContext.js');
        assert(/historyCall\(/.test(actionContextSource), 'G2b. EditorActionContext.capture() still uses its own historyCall() helper');
        assert(/undoLabel:\s*historyCall\('getUndoLabel',\s*null\)/.test(actionContextSource), 'G2c. ...and still calls getUndoLabel() through it, assigning ctx.undoLabel');
        assert(/redoLabel:\s*historyCall\('getRedoLabel',\s*null\)/.test(actionContextSource), 'G2d. ...same for ctx.redoLabel');

        const actionRegistrySource = await rawSource('application/EditorActionRegistry.js');
        const undoActionMatch = actionRegistrySource.match(/id:\s*'history\.undo',[\s\S]{0,1000}?execute:/);
        assert(undoActionMatch, 'G2e. EditorActionRegistry still declares the history.undo action in the expected shape');
        assert(/label:\s*'Undo'/.test(undoActionMatch[0]), 'G2f. ...with the static label: \'Undo\' still present (unchanged — search/KeyboardShortcutsOverlay still need it)...');
        assert(/contextualLabel:\s*\(ctx\)\s*=>\s*ctx\.undoLabel/.test(undoActionMatch[0]), 'G2g. (post-0.9.213) ...and now ALSO carries contextualLabel: (ctx) => ctx.undoLabel — a bare passthrough, not a reconstruction');
        assert(/disabledReason:\s*\(ctx\)\s*=>\s*\(ctx\.canUndo \? null : 'Nothing to undo'\)/.test(undoActionMatch[0]), 'G2h. disabledReason is still the generic, static string — ctx.undoLabel is already null whenever disabled, so there is nothing more specific to say here');

        assert(/\.undoLabel\b/.test(codeOnlyLines(actionRegistrySource).join('\n')) && /\.redoLabel\b/.test(codeOnlyLines(actionRegistrySource).join('\n')), 'G2i. (post-0.9.213) EditorActionRegistry.js now reads ctx.undoLabel/ctx.redoLabel');

        const commandPaletteSource = await rawSource('ui/components/CommandPalette.js');
        assert(!/row\.action\.label/.test(commandPaletteSource), 'G2j. (post-0.9.213) CommandPalette.js no longer renders the static row.action.label directly...');
        assert(/displayLabel\(row\.action\)/.test(commandPaletteSource), '...it renders displayLabel(row.action) instead, which falls back to the static label when contextualLabel is absent/null');
        assert(/action\.disabledReason\(this\.context\)/.test(commandPaletteSource), 'G2k. ...and still genuinely renders action.disabledReason(ctx) unchanged');

        console.log('✓ Section G2: ACTUAL GAP AT THE TIME, CLOSED BY 0.9.213 — EditorActionContext computed real undoLabel/redoLabel (mirroring WorldView.js\'s own, which IS shown in a tooltip), but EditorActionRegistry\'s history.undo/history.redo actions never read them. 0.9.213 gave both actions a contextualLabel(ctx) passthrough and CommandPalette.js a displayLabel() that renders it — the Command Palette now shows the same specific command name WorldView.js already showed for the identical capability.');
    }

    // ---------------------------------------------------------------
    // Section H — Cross-cutting capability reachability closure. New
    // framing this milestone's own brief asks for explicitly: Domain ->
    // Application/use-case -> Composition root -> UI/intentional internal
    // caller, with no unexplained terminal node. Applied directly to
    // every finding above.
    // ---------------------------------------------------------------
    {
        // H1 — the five independent lifecycle systems (autosave/recovery,
        // history/replay/restore, placement, publication/distribution,
        // Snapshot) remain separate authorities, reconfirmed unchanged
        // since 0.9.209's own Section F.
        const commandHistorySource = await rawSource('application/CommandHistory.js');
        assert(!/Recovery|Autosave/.test(commandHistorySource), 'H1a. CommandHistory.js still carries no Recovery/Autosave reference');
        const materializeSource = await rawSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(!/RecoveryStore|AutosaveScheduler|RestoreHistoryStateUseCase/.test(materializeSource), 'H1b. Snapshot materialization still carries no Recovery/History reference');

        // H2 — every finding in Sections E/G above fits the SAME shape:
        // domain-correct, composed at SOME level, but the chain snaps
        // before the last hop. Recorded here as a table so the closure
        // model is explicit, not just implied by prose.
        const closureFindings = [
            { capability: 'Snapshot export (Build...UseCase)', domain: true, useCase: true, compositionRoot: false, ui: false, classification: 'ACTUAL_GAP' },
            { capability: 'Snapshot placement catalog (Create...CatalogUseCase)', domain: true, useCase: true, compositionRoot: false, ui: false, classification: 'OBSOLETE' },
            // Transform gesture feedback overlay: ACTUAL_GAP when THIS
            // milestone (0.9.212) ran — CLOSED by 0.9.214 ("Editor
            // Transform Gesture Feedback"), which gave the last hop (ui)
            // its terminal node. Recorded here as COMPLETE, not rewritten
            // out of the table, for the same historical-record reason
            // the Editor undo/redo label mirrors row below already is.
            { capability: 'Transform gesture feedback overlay', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' },
            // Editor undo/redo label mirrors: ACTUAL_GAP when THIS
            // milestone (0.9.212) ran — CLOSED by 0.9.213 ("Editor
            // Undo/Redo Label Mirrors"), which gave the last hop (ui)
            // its terminal node. Recorded here as COMPLETE, not rewritten
            // out of the table, so this closure model stays a true
            // historical record of every finding this arc has made.
            { capability: 'Editor undo/redo label mirrors', domain: true, useCase: true, compositionRoot: true, ui: true, classification: 'COMPLETE' }
        ];
        for (const finding of closureFindings) {
            assert(finding.domain && finding.useCase, `H2a. ${finding.capability}: domain/use-case layer confirmed correct`);
            if (finding.classification === 'ACTUAL_GAP') {
                assert(!finding.ui, `H2b. ${finding.capability}: classified ACTUAL_GAP has no UI/internal-caller terminal — an unexplained terminal node, per the brief's own diagram`);
            }
            if (finding.classification === 'OBSOLETE') {
                assert(!finding.compositionRoot, `H2c. ${finding.capability}: classified OBSOLETE is not reached by the current composition root at all (superseded, not merely unwired)`);
            }
        }

        console.log('✓ Section H: Cross-cutting capability reachability closure — the five lifecycle systems remain separate authorities; every finding above fits the brief\'s own closure model exactly (an unexplained terminal node for the remaining Snapshot-export ACTUAL_GAP reaching a composition root, no composition-root path at all for the OBSOLETE finding, and completed terminal nodes for both the transform gesture feedback overlay (0.9.214) and Editor undo/redo label mirrors (0.9.213), closed since this milestone ran), with none of it mistaken for an intentional boundary.');
    }

    // ---------------------------------------------------------------
    // Section I — repository-wide obsolete-UI sweep.
    // ---------------------------------------------------------------
    {
        // I1 — ui/components/GroupsPanel.js (0.9.206's own finding),
        // reconfirmed unchanged.
        assert(!/GroupsPanel/.test(await rawSource('ui/main.js')), 'I1a. GroupsPanel is not registered in ui/main.js');
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(!/components:\s*\{[^}]*GroupsPanel/.test(editorViewSource), 'I1b. EditorView.js\'s own components: {} does not register GroupsPanel');
        const groupsPanelSource = await rawSource('ui/components/GroupsPanel.js');
        assert(groupsPanelSource.length > 0, 'I1c. ui/components/GroupsPanel.js still exists on disk, unremoved');

        // I2 — the repository-wide sweep this milestone's own brief asks
        // for turned up no THIRD obsolete UI file. ui/components/
        // TransformFeedback.js LOOKS like the same shape (a real,
        // unregistered component) but is classified under Section G1
        // instead — the brief's own worked distinction: it is not
        // superseded by anything (ui/components/NumericTransformPanel.js
        // is a distinct, non-live, "one Apply = one intent" surface, never
        // a live in-flight drag overlay), it is a missing UI caller for a
        // capability that is still actively maintained every gesture
        // frame. Recorded here only as a cross-reference, not double
        // counted as OBSOLETE.
        const numericTransformPanelSource = await rawSource('ui/components/NumericTransformPanel.js');
        assert(/not a live property editor/.test(numericTransformPanelSource), 'I2a. NumericTransformPanel.js still documents itself as NOT a live property editor — confirming it does not supersede TransformFeedback\'s live in-flight overlay role');

        console.log('✓ Section I: repository-wide obsolete-UI sweep — ui/components/GroupsPanel.js remains the one OBSOLETE-UI-layer finding, unchanged since 0.9.206. ui/components/TransformFeedback.js is a look-alike shape but is correctly filed under Section G1 as a missing UI caller, not a superseded component — it has nothing superseding it.');
    }

    // ---------------------------------------------------------------
    // Section J — Performance. Deliberately DEFERRED, unchanged.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section J: Performance — deliberately DEFERRED, unchanged since 0.9.196. No bottleneck surfaced by this or any prior reassessment; nothing to assess without one.');
    }

    // ---------------------------------------------------------------
    // Section K — a direct, behavioral proof (not just structural) that
    // the domain/application layer underlying BOTH new Editor findings
    // already works correctly end to end, exactly as 0.9.209's own
    // Section A8 did for the World View Undo/Redo finding it made.
    // ---------------------------------------------------------------
    {
        const doc = createTestDocument();
        const history = new CommandHistory({ world: doc.world });
        history.execute(new CreateWorldLandmarkCommand({
            worldId: doc.world.id, authorIdentityId: 'tester', title: 'Reassessment Landmark', position: new Position(1, 0, 1)
        }));
        assert(typeof history.getUndoLabel === 'function' && history.getUndoLabel() !== null, 'K1. CommandHistory produces a real, non-null undo label right now — the exact value the Editor\'s own EditorSession.getUndoLabel() would surface, and which EditorActionRegistry now reads (Section G2, closed by 0.9.213)');
        history.undo();
        assert(history.canRedo(), 'K2. ...and the round-trip this gap was about already worked end-to-end even at the time this milestone ran, before 0.9.213 gave it a UI caller for its label');

        console.log('✓ Section K: direct behavioral proof — the underlying CommandHistory capability behind Section G2\'s finding is proven correct here directly, the same discipline 0.9.209\'s own Section A8 applied to its own World View finding. 0.9.213 subsequently closed Section G2 itself; see tests/EditorUndoRedoLabelMirrors.test.js for that closure\'s own full proof.');
    }

    console.log('\n✅ All Post-Undo/Redo Product Reassessment tests passed.');
    console.log(`
Classification summary:
  A. World interaction/navigation ......... COMPLETE (entire 0.9.209-0.9.211 Undo/Redo arc closed)
  B. Vehicle system ........................ INTENTIONAL_BOUNDARY
  C. World material/document lifecycle ..... COMPLETE
  D. Publication workflow .................. COMPLETE
  E. Snapshot ............................... COMPLETE, except:
       - Snapshot export (Build...UseCase) ... ACTUAL_GAP
       - Snapshot placement catalog wrapper ... OBSOLETE
  F. History ................................ COMPLETE (one authority, two separate projections)
  G. Editor .................................. COMPLETE, except:
       - Transform gesture feedback overlay .. ACTUAL GAP AT THE TIME -> CLOSED BY 0.9.214
       - Undo/redo label mirrors (Command Palette) . ACTUAL GAP AT THE TIME -> CLOSED BY 0.9.213
  H. Cross-cutting lifecycle integrity ...... CONFIRMED (five separate authorities; closure model applied)
  I. Repository-wide obsolete-UI sweep ...... GroupsPanel.js unchanged; no third file found
  J. Performance ............................. DEFERRED

Capability reachability matrix (new findings only — see 0.9.209's own
matrix for everything this arc already closed):
  Capability                              Domain  UseCase  Composed  UI reachable  Classification
  Snapshot export (transfer package)        ✓       ✓         —          —        ACTUAL_GAP
  Snapshot placement catalog (Create...)    ✓       ✓         —          —        OBSOLETE (superseded)
  Transform gesture feedback overlay        ✓       ✓         ✓          ✓        COMPLETE  <- closed by 0.9.214
  Editor undo/redo label mirrors            ✓       ✓         ✓          ✓        COMPLETE  <- closed by 0.9.213

Candidate gaps (as they stood when THIS milestone, 0.9.212, ran), ranked
by scope, smallest first:

  1. Editor undo/redo label mirrors (Section G2).
     - existing capability?         yes — EditorSession.getUndoLabel()/getRedoLabel(), unchanged
     - already called?              yes — via EditorActionContext's own historyCall(), every capture()
     - composition-root reachable?  yes — ctx.undoLabel/ctx.redoLabel exist on every action context
     - UI reachable?                no — EditorActionRegistry's history.undo/history.redo actions
                                     never read them; CommandPalette.js genuinely renders whatever
                                     label/disabledReason they DO provide
     - product precedent?           yes — WorldView.js's own undoLabel/redoLabel already back a real
                                     tooltip for the identical capability
     - scope?                       smallest of the three — a label/disabledReason edit inside two
                                     existing action definitions, no new template, no new component
     - UPDATE (0.9.213): closed. EditorActionRegistry's history.undo/
       history.redo actions gained a contextualLabel(ctx) field — a bare
       passthrough of ctx.undoLabel/ctx.redoLabel — and
       ui/components/CommandPalette.js's new displayLabel() reads it in
       place of the static label whenever present. No new label
       generator, no second history stack. See
       tests/EditorUndoRedoLabelMirrors.test.js and docs/Roadmap.md's
       own 0.9.213 entry.

  2. Transform gesture feedback overlay (Section G1).
     - existing capability?         yes — SpatialEditingService.getGestureFeedback(), rebuilt every frame
     - already composed?            yes — the whole chain (service -> gizmo controller -> EditorSession
                                     -> onPointerMove/onPointerUp) already forwards it correctly
     - UI reachable?                no — EditorView.js discards the return value and never mounts
                                     the already-built, purpose-made ui/components/TransformFeedback.js
     - product precedent?           yes — the component was built (0.1.47) specifically for this data
     - scope?                       small — capture the return value into reactive state, mount one
                                     existing component; touches EditorView.js's onPointerMove/onPointerUp
     - UPDATE (0.9.214): closed. EditorView.js now captures the return
       value of onPointerMove()/onPointerUp() into a local
       transformFeedback ref (result.feedback, a bare passthrough) and
       mounts ui/components/TransformFeedback.js, bound to that ref. The
       ref is also cleared on Escape-cancel and on SELECTION_CHANGED
       (which every document rebuild fires via clearSelection(), the one
       existing signal broad enough to keep a document switch from
       leaving stale feedback on screen). No new transform math, no
       second feedback shape, SpatialEditingService/
       TransformGizmoController/EditorSession all byte-for-byte
       unchanged. See tests/EditorTransformGestureFeedback.test.js and
       docs/Roadmap.md's own 0.9.214 entry.

  3. Snapshot export (Section E2) — a separate, larger candidate in a
     different area (Publication/Snapshot, not Editor):
     - existing capability?         yes — application/BuildPublicationSnapshotTransferPackageUseCase.js,
                                     tested by seven separate test files
     - composed?                    no — absent from ui/main.js entirely
     - UI reachable?                no — no "Export Snapshot" action anywhere, unlike its "Import
                                     Snapshot" counterpart
     - scope?                       larger — needs composition in ui/main.js, a coordinator method
                                     (or direct wiring), and a new UI action plus a way to hand the
                                     user the resulting package (a file save, a copyable blob, etc.) —
                                     a real design decision, not just a wire-up

At the time this milestone (0.9.212) ran, its own brief said no next
milestone was prescribed here — three ACTUAL_GAP candidates existed (the
first time this arc had found more than one at once), plus one new
OBSOLETE application-layer finding
(CreatePublicationSnapshotPlacementCatalogUseCase.js, left unremoved).

0.9.213 ("Editor Undo/Redo Label Mirrors") subsequently took up candidate
1 above and closed it — see this file's own Section G2/H updates and
tests/EditorUndoRedoLabelMirrors.test.js for that milestone's full record.
0.9.214 ("Editor Transform Gesture Feedback") then took up candidate 2 and
closed it — see this file's own Section G1/H updates and
tests/EditorTransformGestureFeedback.test.js for that milestone's full
record. Candidate 3 (Snapshot export) remains open, unchanged, along with
the one OBSOLETE finding. Whichever is taken up next stays the same
narrowly-scoped "wire an existing, correct capability to its own already-
built UI" shape this whole arc has followed
since 0.9.203 — not a new feature invented for the milestone.
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
