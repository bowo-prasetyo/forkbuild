import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { VehicleType } from '../core/VehicleType.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { RecoveryObserver } from '../application/RecoveryObserver.js';

// 0.9.206 — Post-Recovery Product Reassessment.
//
// Test-only. No production changes. 0.9.205's own closing recommendation
// asked for exactly this, in the shape 0.9.196/0.9.203 already
// established: a fresh sweep of the same five broad product areas, now
// that the entire autosave/recovery arc (0.9.203-0.9.205) is closed,
// plus a new sixth area (E) this milestone's own brief calls out —
// Editor/document workflow — now that the Editor has grown a second
// composition root (CreatePersistenceUseCase's recovery stack) worth
// checking for siblings. Every finding is classified into exactly one
// of four buckets, unchanged from 0.9.203:
//
//   COMPLETE              — already fully reachable, nothing to do.
//   INTENTIONAL_BOUNDARY  — deliberately undone; a decision, not a gap.
//   ACTUAL_GAP            — a genuine missing product capability.
//   ROUGH_EDGE            — a harmless surface wrinkle, optional to fix.
//
// This file does not implement anything it finds. Per the brief, it
// stops at classification and recommendation — 0.9.206 does not
// prescribe 0.9.207.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Post-Recovery Reassessment Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments — the same restraint 0.9.156 through
// 0.9.203 already apply to their own structural sweeps, so a sweep
// counts genuine code references, never a comment that merely names a
// class in prose.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation. COMPLETE, reconfirmed.
    //
    // Reconfirms 0.9.203's own Section A finding: nothing 0.9.204/0.9.205
    // touched (EditorView.js, application/RecoveryObserver.js) is part of
    // this surface, so this is a pure regression check that the same
    // composition, and the same two lifecycle actions 0.9.197/0.9.198
    // added, remain wired.
    // ---------------------------------------------------------------
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const componentTags = new Set((worldView.match(/<[A-Z][A-Za-z]+/g) || []).map((tag) => tag.slice(1)));
        const expectedFamilies = [
            'AvatarInfoPanel', 'NearbyAvatarsPanel', 'CompassIndicator',
            'WorldMembersPanel', 'WorldPresenceIndicator', 'WorldCollaboratorIndicator',
            'LocationsPanel', 'GeographicPlaceDirectoryPanel', 'GeographicPlacePanel',
            'PlaceNamingPanel', 'WorldSearchPanel', 'WorldMapPanel',
            'PlacementInfoPanel', 'PlacementEditorDialog', 'VehicleInteractionPrompt',
            'OwnPublicationPanel', 'WorldEncounterCanvas'
        ];
        for (const name of expectedFamilies) {
            assert(componentTags.has(name), `A1. WorldView.js still composes ${name}`);
        }
        assert(componentTags.size >= 20, `A2. WorldView.js still composes at least 20 distinct component families (found ${componentTags.size})`);

        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        const emitsMatch = placementInfoPanelSource.match(/emits:\s*\[([^\]]*)\]/);
        assert(emitsMatch && /\bremove\b/i.test(emitsMatch[1]), 'A3. PlacementInfoPanel.js still emits \'remove\' — 0.9.197\'s removal action remains reachable');

        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/unpublishCommand/.test(ownPublicationPanelSource), 'A4. OwnPublicationPanel.js still wires an unpublishCommand — 0.9.198\'s retract action remains reachable');

        // A5 — the one thing 0.5.9's own design record (docs/Principles.md,
        // "World View Observes and Navigates; Editor Mutates and Builds")
        // says stayed in WorldNavigationSession specifically so a viewer's
        // landmark-naming edit remains undoable: undo()/redo() and the
        // history-preview/replay machinery. Confirmed present here (not a
        // regression to re-litigate — the finding, filed under Section C
        // below, is that 0.5.9's own stated REASON for keeping it never
        // got a caller in WorldView.js).
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        for (const method of ['undo(', 'redo(', 'beginHistoryPreview(', 'previewHistoryAt(', 'cancelHistoryPreview(', 'restoreHistoryAt(', 'getTimeline(']) {
            assert(navigationSessionSource.includes(method), `A5. WorldNavigationSession.js still declares ${method} — 0.5.9's own two kept exceptions and their history/timeline machinery are all still present`);
        }

        console.log(`✓ Section A: World interaction/navigation — COMPLETE. ${componentTags.size} component families, including the removal/unpublish actions the 0.9.196 arc added, all still reachable. No new gap exposed by the autosave/recovery work — that subsystem never touches this surface.`);
    }

    // ---------------------------------------------------------------
    // Section B — Vehicle system. INTENTIONAL_BOUNDARY, unchanged.
    //
    // Nothing in 0.9.204/0.9.205's autosave/recovery work created any
    // requirement for passengers/capacity/fuel/range/multi-seat — this
    // is a pure regression check, per this milestone's own restraint
    // against turning a theoretical future feature into a milestone.
    // ---------------------------------------------------------------
    {
        assert(typeof VehicleType.NONE === 'string' && typeof VehicleType.BICYCLE === 'string'
            && typeof VehicleType.MOTORCYCLE === 'string' && typeof VehicleType.CAR === 'string'
            && typeof VehicleType.DRONE === 'string', 'B1. VehicleType still carries exactly its five original values');
        const vehicleTypeSource = await rawSource('core/VehicleType.js');
        const vehicleTypeCode = codeOnlyLines(vehicleTypeSource).join('\n');
        assert(!/passenger|capacity|multi-?rider|\bfuel\b|\brange\b/i.test(vehicleTypeCode), 'B2. VehicleType.js\'s own CODE still declares no capacity/passenger/fuel vocabulary');
        const repoWideVehicleFiles = [
            'application/AvatarVehicleInteractionController.js',
            'application/AvatarVehicleMovementController.js',
            'core/VehicleInstance.js',
            'core/VehiclePresence.js'
        ];
        for (const file of repoWideVehicleFiles) {
            const source = await rawSource(file);
            assert(!/passenger|multi-?rider/i.test(source), `B3. ${file} still carries no passenger/multi-rider vocabulary`);
        }
        console.log('✓ Section B: Vehicle system — INTENTIONAL_BOUNDARY, unchanged since 0.9.196/0.9.203. Multi-passenger capacity, fuel/range, and rental/ownership remain undocumented requirements, not missing implementations.');
    }

    // ---------------------------------------------------------------
    // Section C — World material/document lifecycle. ACTUAL GAP, this
    // milestone's one finding: a Document's full edit-history timeline
    // (view any past state, restore to it) is fully built, composed,
    // and tested — but has no UI entry point anywhere.
    //
    // 0.9.203's own Section C ACTUAL_GAP (autosave/recovery composed
    // but never taken by EditorView.js) is now closed by 0.9.204/0.9.205
    // — reconfirmed first, then the search for "existing correct
    // capability + missing user reachability" continues elsewhere in
    // this same area, per this milestone's own brief.
    // ---------------------------------------------------------------
    {
        // C1 — 0.9.203's own finding stays closed: EditorView.js now
        // destructures and calls the recovery stack, and RecoveryBanner
        // is wired into its template. A straight regression check.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const destructureMatch = editorViewSource.match(/const \{([^}]*)\}\s*=\s*new CreatePersistenceUseCase\(\)\.execute\(\)/);
        assert(destructureMatch, 'C1a. EditorView.js still destructures CreatePersistenceUseCase().execute()');
        for (const field of ['autosaveDocumentUseCase', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase']) {
            assert(destructureMatch[1].includes(field), `C1b. EditorView.js still takes ${field} — 0.9.204's closure of 0.9.203's gap holds`);
        }
        assert(/autosaveScheduler\.start\(\)/.test(editorViewSource) && /recoveryObserver\.start\(\)/.test(editorViewSource), 'C1c. AutosaveScheduler/RecoveryObserver are still started on mount');
        assert(/<RecoveryBanner/.test(editorViewSource), 'C1d. RecoveryBanner is still in the template');

        // C2 — the NEW finding. ReplayDocumentUseCase/RestoreHistoryStateUseCase
        // and WorldNavigationSession's own getTimeline()/beginHistoryPreview()/
        // previewHistoryAt()/cancelHistoryPreview()/restoreHistoryAt() are a
        // real, correct, tested "view any past state of this Document, and
        // optionally rebase onto it" subsystem — proven directly here
        // against the same real (not mocked) collaborators
        // tests/HistoryRestore.test.js already uses.
        {
            const commandRegistry = new CreateCommandRegistryUseCase().execute();
            const replay = new ReplayDocumentUseCase(commandRegistry);
            const restore = new RestoreHistoryStateUseCase(replay);

            const doc = createTestDocument();
            const manager = new DocumentManager();
            manager.load(doc, doc.world.id);
            const history = new CommandHistory({ world: doc.world });
            manager.trackCommandHistory(history);

            const buildingId = doc.world.getBuildings()[0].id;
            const firstBrickId = doc.world.getBuildings()[0].getBricks()[0].id;
            history.execute(new PlaceBrickCommand({
                worldId: doc.world.id, buildingId, definitionId: 'core:cube', position: new Position(4, 0.5, 0)
            }));
            history.execute(new MoveBrickCommand({
                worldId: doc.world.id, buildingId, brickId: firstBrickId, delta: { x: 2, y: 0, z: 0 }
            }));
            assert(history.getTimeline().length === 2, 'C2a. CommandHistory.getTimeline() reports both commands');

            const pastWorld = replay.execute(history, { endCursor: 1 });
            assert(pastWorld.getBuildings()[0].getBricks().length === 2, 'C2b. ReplayDocumentUseCase reconstructs the world as it existed after only the first command (baseline brick + the newly placed one) — a real "preview a past state" read');
            assert(pastWorld !== doc.world, 'C2c. ...as a STANDALONE World, never mutating the live one');

            const result = restore.execute(manager, history, 1);
            assert(result.document.world.getBuildings()[0].getBricks().length === 2, 'C2d. RestoreHistoryStateUseCase rebases the live document onto that past state');
            assert(result.history.isDirty(), 'C2e. ...leaving the restored document dirty, since storage still holds the pre-restore document');
        }

        // C3 — the stack is exposed from exactly one composition root
        // (CreateWorldViewUseCase.js), which hands it to WorldNavigationSession
        // — the SAME "correctly composed, never taken" shape 0.9.203 found
        // for the recovery stack before 0.9.204 gave it a caller.
        const createWorldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(/new ReplayDocumentUseCase\(/.test(createWorldViewSource), 'C3a. CreateWorldViewUseCase.js still composes ReplayDocumentUseCase');
        assert(/new RestoreHistoryStateUseCase\(/.test(createWorldViewSource), 'C3b. CreateWorldViewUseCase.js still composes RestoreHistoryStateUseCase');
        assert(/replayDocumentUseCase,\s*\n?\s*restoreHistoryStateUseCase,/.test(createWorldViewSource) || (/replayDocumentUseCase/.test(createWorldViewSource) && /restoreHistoryStateUseCase/.test(createWorldViewSource)), 'C3c. both are handed onward into the session it constructs');

        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        for (const method of ['getTimeline(documentId)', 'restoreHistoryAt(cursor, documentId)', 'beginHistoryPreview()', 'previewHistoryAt(cursor)', 'cancelHistoryPreview()', 'getHistoryPreview()']) {
            assert(navigationSessionSource.includes(method), `C3d. WorldNavigationSession.js still declares ${method}`);
        }

        // C4 — UPDATE (0.9.207): at the time THIS milestone (0.9.206) ran,
        // no UI anywhere called any of this stack. 0.9.207 ("World View
        // History Timeline UI Integration") gave it exactly one caller —
        // ui/views/WorldView.js, the same single composition root C3
        // above already named — through a new dumb presentation
        // component, ui/components/HistoryTimelinePanel.js. Every OTHER
        // UI file this section originally swept remains untouched, so
        // the "zero references" proof stays valid everywhere except the
        // one file 0.9.207 changed.
        const uiFiles = [
            'ui/views/EditorView.js', 'ui/views/LiveWorldView.js',
            'ui/views/HomeView.js', 'ui/views/RecentWorldsView.js', 'ui/views/RepositoryView.js', 'ui/main.js'
        ];
        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview', 'getHistoryPreview']) {
            for (const file of uiFiles) {
                const source = await rawSource(file);
                assert(countReferences(source, identifier) === 0, `C4. ${file} still never references ${identifier}`);
            }
        }
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview']) {
            assert(countReferences(worldViewSource, identifier) > 0, `C4a. (post-0.9.207) WorldView.js now references ${identifier}`);
        }
        // getHistoryPreview() specifically stays uncalled: WorldView.js
        // mirrors the previewed cursor in its own local ref the instant
        // previewHistoryAt() returns, rather than re-querying the
        // session for it — session._historyPreview remains the single
        // source of truth either way (see WorldView.js's own
        // historyPreviewCursor comment), so this is not a gap 0.9.207
        // left half-closed.
        assert(countReferences(worldViewSource, 'getHistoryPreview') === 0, 'C4b. (post-0.9.207) WorldView.js still never calls getHistoryPreview() — it mirrors the cursor locally instead');

        // C5 — UPDATE (0.9.207): the design rationale (C5a) held, and the
        // literal absence of session.undo()/session.redo() calls (C5b, at
        // the time) held too — 0.9.207 deliberately did not wire plain
        // undo/redo, only the timeline/preview/restore surface (see
        // docs/Roadmap.md, 0.9.207).
        //
        // UPDATE (0.9.210): C5b itself is now closed. "World View Undo/
        // Redo UI Integration" gave WorldView.js an Undo/Redo button pair
        // plus a Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z shortcut, both calling
        // session.undo()/session.redo() directly — see
        // tests/WorldViewUndoRedoIntegration.test.js and
        // tests/PostHistoryProductReassessment.test.js's own Section A6
        // for the full closure record. The two paths (History's
        // preview/restore, and plain Undo/Redo) remain two separate
        // authorities, exactly as C5a's rationale and 0.9.209's own
        // classification both anticipated — neither was folded into the
        // other.
        assert(/a viewer's landmark edit needs to be undoable too/.test(await rawSource('docs/Principles.md')), 'C5a. 0.5.9\'s own documented rationale for keeping undo/redo + history/replay is still on record');
        for (const identifier of ['undo', 'redo']) {
            assert(new RegExp(`session\\.${identifier}\\(\\)`).test(worldViewSource), `C5b. (post-0.9.210) WorldView.js now calls session.${identifier}() — 0.9.210 wired plain Undo/Redo UI Integration`);
        }

        console.log('✓ Section C: World material/document lifecycle — ACTUAL GAP AT THE TIME, CLOSED BY 0.9.207 (timeline/preview/restore) AND 0.9.210 (plain undo/redo). CommandHistory\'s timeline plus ReplayDocumentUseCase/RestoreHistoryStateUseCase, exposed as WorldNavigationSession#getTimeline()/beginHistoryPreview()/previewHistoryAt()/cancelHistoryPreview()/restoreHistoryAt(), were all correct (proven directly above) and composed by CreateWorldViewUseCase, but nothing in the UI tree called any of it at the time this milestone ran. 0.9.207 (\'World View History Timeline UI Integration\') gave WorldView.js a History panel wired straight to that existing machinery — no new history semantics, no new document lifecycle states. Plain session.undo()/redo() had no caller at the time (C5b) either, until 0.9.210 gave it a button and keyboard shortcut of its own — a viewer can now undo a landmark/region edit either directly, or by restoring to the entry before it through History, which is the concrete need 0.5.9\'s own design record named.');
    }

    // ---------------------------------------------------------------
    // Section D — Publication workflow. COMPLETE, reconfirmed.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 9, `D1. OwnPublicationPanel.js still wires at least 9 distinct actions (found ${clickHandlers.size})`);
        const unpublishHandlers = [...clickHandlers].filter((h) => /^unpublish|^retract/i.test(h));
        assert(unpublishHandlers.length === 1, 'D2. exactly one unpublish/retract-shaped handler remains wired');

        const walletSignerSource = await rawSource('application/CreateBitcoinAnchorWalletSignerUseCase.js');
        assert(/execute\(\{\s*wallet\s*\}/.test(walletSignerSource), 'D3. CreateBitcoinAnchorWalletSignerUseCase still requires the caller to supply the wallet — no wallet capability of its own');

        // D4 — the survival chain Document -> Publication -> Placement ->
        // Material -> Distribution -> Recovery. Recovery is the newest link
        // (0.9.204); confirming it never touches Publication/Placement code
        // at all — autosave/recovery is scoped to the OPEN, UNPUBLISHED
        // editing session only, exactly as 0.9.203/0.9.204/0.9.205 all
        // documented, never a publication-side concern.
        for (const file of ['application/PublishDocumentUseCase.js', 'application/UnpublishDocumentUseCase.js', 'application/RemoveWorldPlacementUseCase.js']) {
            const source = await rawSource(file);
            assert(!/RecoveryStore|AutosaveScheduler|RecoveryObserver|CheckRecoveryUseCase/.test(source), `D4. ${file} still carries no recovery-subsystem coupling`);
        }

        console.log(`✓ Section D: Publication workflow — COMPLETE. ${clickHandlers.size} wired actions cover the full publish/unpublish/anchor/distribute/Snapshot surface. Bitcoin anchor wallet signing remains an INTENTIONAL_BOUNDARY. The Document/Publication/Placement/Material/Distribution/Recovery survival chain holds: Recovery stays scoped to the open editing session, never reaching into Publication/Placement code.`);
    }

    // ---------------------------------------------------------------
    // Section E — Editor/document workflow. COMPLETE, with one noted
    // OBSOLETE (not a gap) leftover component.
    //
    // The newly important area per this milestone's brief: now that
    // autosave/recovery is reachable, is there another existing Editor
    // capability with no UI entry point? Inventoried every use case
    // EditorView.js's own composition touches — fork/save/load/recover/
    // discard/autosave, blueprint export/import, attribution, lineage,
    // structure creation/composition, groups, transform, clipboard — all
    // reachable (see EditorView.js's own template + setup(), audited
    // directly here rather than merely by name).
    // ---------------------------------------------------------------
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');

        // E1 — every editor-scoped use case EditorView.js imports is
        // actually called somewhere in the same file, not merely
        // constructed and dropped. (ExportBlueprintUseCase/
        // ImportBlueprintUseCase are reached indirectly through
        // EditorSession — see E2 — so they're checked separately.)
        const directlyCalledUseCases = [
            ['ForkStructureUseCase', 'forkStructureUseCase'],
            ['CopyStructureIntoDocumentUseCase', 'copyStructureIntoDocumentUseCase'],
            ['CopySelectionUseCase', 'copySelectionUseCase'],
            ['RepeatSelectionUseCase', 'repeatSelectionUseCase'],
            ['PasteClipboardUseCase', 'pasteClipboardUseCase'],
            ['UpdateDocumentMetadataUseCase', 'updateDocumentMetadataUseCase'],
            ['StructurePreviewUseCase', 'structurePreviewUseCase'],
            ['CompositionPreviewUseCase', 'compositionPreviewUseCase']
        ];
        for (const [className, varName] of directlyCalledUseCases) {
            assert(editorViewSource.includes(`new ${className}(`), `E1a. EditorView.js still constructs ${className}`);
            assert(countReferences(editorViewSource, varName) >= 2, `E1b. ${varName} is referenced beyond its own construction (constructed once, then actually used)`);
        }

        // E2 — ExportBlueprintUseCase/ImportBlueprintUseCase are composed
        // one level down (EditorSession.js), not directly by EditorView.js
        // — confirmed reachable through editorSession.exportBlueprint()/
        // importBlueprint(), both of which EditorView.js's own
        // exportStructure()/importBlueprint() handlers call, wired to
        // BuildLibraryPanel's 'export-personal-structure'/'import-blueprint'
        // events in the template.
        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(/new ExportBlueprintUseCase\(/.test(editorSessionSource), 'E2a. EditorSession.js still composes ExportBlueprintUseCase');
        assert(/new ImportBlueprintUseCase\(/.test(editorSessionSource), 'E2b. EditorSession.js still composes ImportBlueprintUseCase');
        assert(/editorSession\.exportBlueprint\(/.test(editorViewSource), 'E2c. EditorView.js still calls editorSession.exportBlueprint()');
        assert(/editorSession\.importBlueprint\(/.test(editorViewSource), 'E2d. EditorView.js still calls editorSession.importBlueprint()');
        assert(/@export-personal-structure="exportStructure"/.test(editorViewSource), 'E2e. BuildLibraryPanel\'s export event is still wired');
        assert(/@import-blueprint="importBlueprint"/.test(editorViewSource), 'E2f. BuildLibraryPanel\'s import event is still wired');

        // E3 — the one leftover found: ui/components/GroupsPanel.js is a
        // fully implemented, correctly-written Groups panel (create/
        // select/rename/duplicate/delete/+Sel/-Sel, subscribed to
        // documentManager.onStateChanged() for live refresh after undo/
        // redo) that predates EditingSidebar's own consolidated Groups
        // section (0.6.2) — which now covers the identical six
        // operations through the SAME EditorActionRegistry group.* actions
        // (see ui/components/EditingSidebar.js). GroupsPanel.js is
        // imported by nothing, registered as a component nowhere, and its
        // own renameGroup() is explicitly called out as "(unused)" in
        // EditorView.js's own comments (see actionUi.promptRenameGroup()).
        // This is the OTHER leaf of the reachability matrix this
        // milestone's own brief draws — "implemented + unreachable" that
        // is OBSOLETE, not a candidate gap: the capability it offers is
        // fully covered elsewhere, under a different, newer surface.
        assert(!/GroupsPanel/.test(await rawSource('ui/main.js')), 'E3a. GroupsPanel is not registered in ui/main.js');
        for (const file of ['ui/views/WorldView.js', 'ui/views/LiveWorldView.js']) {
            const source = await rawSource(file);
            assert(!/import .*GroupsPanel/.test(source), `E3b. ${file} does not import GroupsPanel`);
        }
        assert(!/components:\s*\{[^}]*GroupsPanel/.test(editorViewSource), 'E3c. EditorView.js\'s own components: {} does not register GroupsPanel');
        const editingSidebarSource = await rawSource('ui/components/EditingSidebar.js');
        for (const groupAction of ['group.create', 'group.rename', 'group.duplicate', 'group.delete', 'group.addSelection', 'group.removeSelection']) {
            assert(editingSidebarSource.includes(groupAction), `E3d. EditingSidebar.js's own Groups section still covers ${groupAction} — GroupsPanel.js's six operations are all superseded, not missing`);
        }

        console.log('✓ Section E: Editor/document workflow — COMPLETE. Every editor-scoped use case EditorView.js/EditorSession.js compose (fork, copy/paste/repeat selection, metadata, structure preview/composition, blueprint export/import) is both composed AND called, not merely constructed and dropped. One dead file was found — ui/components/GroupsPanel.js — but it classifies as OBSOLETE/superseded, not a gap: EditingSidebar.js\'s own Groups section (0.6.2) already covers all six of its operations through the same action registry every other Editor mutation goes through.');
    }

    // ---------------------------------------------------------------
    // Section F — the 0.9.205 recovery boundary itself: architectural
    // closure and a REGRESSION assertion, not a new production change.
    //
    // Per this milestone's own brief: confirm the failure-isolation fix
    // remains local — a failed recovery probe must not become a failure
    // of an unrelated document operation.
    // ---------------------------------------------------------------
    {
        // F1 — RecoveryObserver's probe is still wrapped, and the fix is
        // still exactly as narrow as 0.9.205 made it: one try/catch around
        // the CheckRecoveryUseCase.execute() call, nothing else touched.
        const observerSource = await rawSource('application/RecoveryObserver.js');
        assert(/try\s*\{[^}]*this\._checkRecoveryUseCase\.execute\(documentId\)/s.test(observerSource), 'F1a. RecoveryObserver._checkCurrentDocument() still wraps CheckRecoveryUseCase.execute() in try/catch');
        assert(/catch\s*\(e\)\s*\{\s*this\._setStatus\(null\);/.test(observerSource), 'F1b. ...and still fails safe (offers nothing) on catch, exactly like "no checkpoint exists"');

        // F2 — the matching EditorView.js gap 0.9.205 also closed
        // (discardRecovery() lacked the try/catch recoverDocument() had)
        // stays closed.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const recoverBody = editorViewSource.match(/function recoverDocument\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        const discardBody = editorViewSource.match(/function discardRecovery\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(recoverBody && /try\s*\{/.test(recoverBody[0]) && /catch\s*\(e\)/.test(recoverBody[0]), 'F2a. recoverDocument() still wraps RecoverDocumentUseCase.execute() in try/catch');
        assert(discardBody && /try\s*\{/.test(discardBody[0]) && /catch\s*\(e\)/.test(discardBody[0]), 'F2b. discardRecovery() still wraps DiscardRecoveryUseCase.execute() in try/catch, matching recoverDocument()');

        // F3 — REGRESSION: a throwing CheckRecoveryUseCase must not
        // propagate out of RecoveryObserver, and must not corrupt
        // DocumentManager or block a following, unrelated document
        // operation — reproducing 0.9.205's own audit finding directly,
        // against the real (not mocked) RecoveryObserver/DocumentManager
        // pair, exactly like tests/EditorAutosaveRecoveryLifecycleAudit.test.js's
        // own F1 does.
        {
            const throwingCheckUseCase = { execute() { throw new Error('checkpoint unreadable'); } };
            const manager = new DocumentManager();
            let onChangeCalls = 0;
            const observer = new RecoveryObserver(throwingCheckUseCase, manager, { onChange: () => { onChangeCalls += 1; } });
            observer.start();

            const docA = createTestDocument();
            let threw = false;
            try {
                manager.load(docA, docA.world.id);
            } catch (e) {
                threw = true;
            }
            assert(!threw, 'F3a. a throwing CheckRecoveryUseCase does not propagate out of DocumentManager.load()\'s own onStateChanged publish');
            assert(observer.status === null, 'F3b. the observer fails safe — offers nothing, exactly like no checkpoint exists');
            assert(manager.document === docA, 'F3c. DocumentManager itself is completely unaffected — the open document is still docA');

            // The critical regression: an UNRELATED operation right after
            // the failed probe (an ordinary edit, or opening a second
            // document) must still succeed — this is the exact scenario
            // 0.9.205's own audit reproduced.
            let secondThrew = false;
            const docB = createTestDocument();
            try {
                manager.load(docB, docB.world.id);
                manager.markDirty();
            } catch (e) {
                secondThrew = true;
            }
            assert(!secondThrew, 'F3d. a later, unrelated document operation (opening docB, marking it dirty) still succeeds after the earlier failed probe');
            assert(manager.document === docB && manager.state.dirty === true, 'F3e. ...and DocumentManager correctly reflects it, uncorrupted by the earlier failure');

            observer.stop();
        }

        console.log('✓ Section F: the 0.9.205 recovery boundary — CONFIRMED CLOSED, as a regression, not a new fix. RecoveryObserver still fails safe on a throwing CheckRecoveryUseCase; EditorView.js\'s recoverDocument()/discardRecovery() stay symmetric; and a throwing probe still cannot block or corrupt an unrelated document operation that follows it.');
    }

    console.log('\n✅ All Post-Recovery Product Reassessment tests passed.');
    console.log(`
Classification summary:
  A. World interaction/navigation ....... COMPLETE
  B. Vehicle system ...................... INTENTIONAL_BOUNDARY
  C. World material/document lifecycle ... ACTUAL_GAP AT THE TIME -> CLOSED BY 0.9.207 (Document history timeline/replay/restore: existing capability + missing UI -> small integration)
  D. Publication workflow ................ COMPLETE
  E. Editor/document workflow ............ COMPLETE (one obsolete, fully-superseded file: ui/components/GroupsPanel.js)
  F. 0.9.205 recovery boundary ............ CONFIRMED CLOSED (regression only)

Candidate gaps (as they stood when THIS milestone, 0.9.206, ran):
  1. Document History Timeline — View & Restore
     - existing capability?         yes (CommandHistory.getTimeline/replay(), unchanged since 0.1.40/0.1.41)
     - existing use case?           yes (ReplayDocumentUseCase, RestoreHistoryStateUseCase)
     - composition-root reachable?  yes (CreateWorldViewUseCase.js -> WorldNavigationSession)
     - UI reachable?                no (no panel, no button, not even a plain undo/redo keyboard shortcut in World View)
     - new domain logic required?   no — every method needed already exists and is tested
     - intentional boundary?        no — 0.5.9's own design record states the OPPOSITE intent: this
                                     machinery was deliberately KEPT so a viewer's landmark edit stays
                                     undoable, but nothing was ever built to call it
     - UPDATE (0.9.207): closed. ui/views/WorldView.js now composes a
       History panel (ui/components/HistoryTimelinePanel.js) wired
       straight to getTimeline()/beginHistoryPreview()/previewHistoryAt()/
       cancelHistoryPreview()/restoreHistoryAt() — see Section C above.
       Plain session.undo()/redo() still has no caller; that was never
       what this candidate gap named.

At the time this milestone (0.9.206) ran, its own brief said no next
milestone was prescribed — this reassessment stopped at classification.
0.9.207 subsequently took up the candidate gap above; see
docs/Roadmap.md's own 0.9.207 entry for that milestone's record.
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
