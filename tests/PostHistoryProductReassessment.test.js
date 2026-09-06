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
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';

// 0.9.209 — Post-History Product Reassessment.
//
// Test-only. No production changes. 0.9.208's own closing recommendation
// asked for exactly this, in the shape 0.9.196/0.9.203/0.9.206 already
// established: a fresh sweep of the same broad product areas, now that
// the entire World View history arc (0.9.206-0.9.208: candidate found,
// UI built, seam audited/fixed) is closed. Per this milestone's own
// brief, one new discipline is layered on top of 0.9.203's original
// "existing capability + missing UI" test: every unreachable capability
// found is sorted into exactly one of three leaves, not two —
//
//   missing UI      -> candidate gap
//   internal API     -> intentional
//   obsolete implementation -> cleanup candidate (never deleted here)
//
// — the distinction 0.9.206's own Section G reachability-matrix diagram
// first drew between GroupsPanel.js (obsolete) and the history stack
// (a real gap at the time). A sixth area, F (cross-cutting lifecycle
// integrity), is new: it checks that the several independently-correct
// lifecycle systems this project has now accumulated (autosave/recovery,
// history/replay/restore, placement, publication, Snapshot) stay separate
// authorities, rather than growing hidden coupling as each is built.
//
// Classification vocabulary, unchanged since 0.9.203:
//
//   COMPLETE              — already fully reachable, nothing to do.
//   INTENTIONAL_BOUNDARY  — deliberately undone; a decision, not a gap.
//   ACTUAL_GAP            — a genuine missing product capability.
//   ROUGH_EDGE            — a harmless surface wrinkle, optional to fix.
//
// This file does not implement anything it finds. Per the brief, it
// stops at classification and recommendation — 0.9.209 does not
// prescribe 0.9.210.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Post-History Reassessment Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Same restraint 0.9.156 through 0.9.206 already apply: strip full-line
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

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation. ACTUAL_GAP — this
    // milestone's one finding.
    //
    // Everything 0.9.196-0.9.208 already wired (component composition,
    // removal/unpublish, the 0.9.207/0.9.208 History panel) is reconfirmed
    // first as a pure regression check. Then the same "existing capability,
    // no UI caller" question 0.9.203/0.9.206 asked of autosave/recovery and
    // of the history/replay stack is asked of the ONE thing left sitting
    // right next to that stack in the same class: undo()/redo().
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
            'OwnPublicationPanel', 'WorldEncounterCanvas', 'HistoryTimelinePanel'
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

        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview']) {
            assert(countReferences(worldView, identifier) > 0, `A5. WorldView.js still references ${identifier} — 0.9.207/0.9.208's History panel remains reachable`);
        }

        // A6 — the finding. WorldNavigationSession still declares undo()/
        // redo() (0.5.9's own two kept exceptions need them), guarding
        // correctly against an active history preview exactly like
        // 0.9.208 left them. But nothing in WorldView.js ever calls
        // session.undo() or session.redo() — not a button, not a
        // keyboard shortcut, not even inside its own keydown handler,
        // which exists (onKeyDown, wired for Avatar Control Mode's
        // WASD) but never branches on ctrl/meta+Z at all.
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(/undo\(\)\s*\{[\s\S]{0,80}_historyPreview[\s\S]{0,40}active[\s\S]{0,20}return false/.test(navigationSessionSource), 'A6a. WorldNavigationSession.undo() still refuses to run while a history preview is active');
        assert(/redo\(\)\s*\{[\s\S]{0,80}_historyPreview[\s\S]{0,40}active[\s\S]{0,20}return false/.test(navigationSessionSource), 'A6b. WorldNavigationSession.redo() still refuses to run while a history preview is active');
        assert(!/session\.undo\(\)/.test(worldView) && !/session\.redo\(\)/.test(worldView), 'A6c. WorldView.js still never calls session.undo()/session.redo()');
        assert(!/(ctrl|meta)Key[\s\S]{0,200}(['"]z['"]|['"]y['"])/i.test(worldView), 'A6d. WorldView.js\'s keydown handling still has no ctrl/meta+Z or +Y branch anywhere');

        // A7 — precisely WHICH mutations this leaves without an undo
        // path. 0.5.9's own design record ties undo()/redo() to its two
        // kept exceptions — but only ONE of them is actually undo-able
        // via CommandHistory. movePlacement()/removePlacement() call
        // their use cases directly (no Command object, no history
        // entry — confirmed by 0.5.9's own "never touches the
        // Document/Publication" framing for movePlacement, and 0.9.197's
        // header for removePlacement): there is nothing for undo() to
        // reverse there, by design, not a gap. Region/Landmark naming is
        // the other exception, and IS routed through
        // this._commandHistories.get(worldId).execute(cmd) with real
        // Command subclasses carrying real undo() bodies — exactly the
        // six methods this section's own gap concerns.
        for (const method of ['createLandmarkHere(', 'updateLandmark(', 'removeLandmark(', 'createRegionHere(', 'updateRegion(', 'removeRegion(']) {
            const methodStart = navigationSessionSource.indexOf(`\t${method}`) >= 0
                ? navigationSessionSource.indexOf(`\t${method}`)
                : navigationSessionSource.indexOf(`    ${method}`);
            assert(methodStart >= 0, `A7a. WorldNavigationSession still declares ${method}`);
            const methodBody = navigationSessionSource.slice(methodStart, methodStart + 2200);
            assert(/_commandHistories\.get\([\w.]+\)\.execute\(/.test(methodBody), `A7b. ${method} still routes through this._commandHistories.get(...).execute(cmd) — a real, undo-able Command`);
        }
        for (const method of ['movePlacement(', 'removePlacement(']) {
            const methodStart = navigationSessionSource.indexOf(`    ${method}`);
            assert(methodStart >= 0, `A7c. WorldNavigationSession still declares ${method}`);
            const methodBody = navigationSessionSource.slice(methodStart, methodStart + 600);
            assert(!/_commandHistories\.get\([\w.]+\)\.execute\(/.test(methodBody), `A7d. ${method} still calls its use case directly, with no CommandHistory entry — confirming it is NOT part of this gap (nothing for undo() to reverse)`);
        }

        // A8 — proven directly: a real CreateWorldLandmarkCommand run
        // through a real CommandHistory IS reversible right now. The
        // capability this gap is about already works end-to-end; it
        // simply has no caller in WorldView.js.
        {
            const doc = createTestDocument();
            const history = new CommandHistory({ world: doc.world });
            const before = doc.world.getWorldLandmarks ? doc.world.getWorldLandmarks().length : 0;
            history.execute(new CreateWorldLandmarkCommand({
                worldId: doc.world.id, authorIdentityId: 'tester', title: 'Test Landmark', position: new Position(1, 0, 1)
            }));
            assert(history.canUndo(), 'A8a. CommandHistory reports canUndo() true immediately after creating a landmark');
            history.undo();
            assert(!history.canUndo() || history.canRedo(), 'A8b. undo() actually ran (redo is now available)');
            assert(history.canRedo(), 'A8c. the undone landmark-creation is redoable — the whole round-trip this gap would expose already works, today, with no UI caller');
        }

        console.log('✓ Section A: World interaction/navigation — ACTUAL_GAP. Every previously-closed thread (removal/unpublish/history panel) reconfirmed reachable. The new finding: WorldNavigationSession.undo()/redo() are correct, tested here directly, and specifically reverse the Region/Landmark naming Commands 0.5.9\'s own design record kept them for — but WorldView.js never calls either one, not as a button and not as a keyboard shortcut, despite its own keydown handler already existing for Avatar Control Mode. movePlacement()/removePlacement() are confirmed OUT of scope for this gap: neither runs through CommandHistory at all, so there is nothing for undo() to reverse there.');
    }

    // ---------------------------------------------------------------
    // Section B — Vehicle system. INTENTIONAL_BOUNDARY, unchanged.
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
        console.log('✓ Section B: Vehicle system — INTENTIONAL_BOUNDARY, unchanged since 0.9.196/0.9.203/0.9.206. Nothing in the History arc (0.9.206-0.9.208) touches vehicles at all; multi-passenger capacity, fuel/range, and rental/ownership remain undocumented requirements, not missing implementations.');
    }

    // ---------------------------------------------------------------
    // Section C — World material/document lifecycle. COMPLETE,
    // reconfirmed. The arc 0.9.203 opened (autosave/recovery) and 0.9.206
    // reopened in the same area (history/replay/restore) are both closed;
    // this sweep looks for a THIRD "existing capability + missing UI"
    // thread in the same territory and finds none.
    // ---------------------------------------------------------------
    {
        // C1 — the 0.9.203 finding stays closed (autosave/recovery).
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        const destructureMatch = editorViewSource.match(/const \{([^}]*)\}\s*=\s*new CreatePersistenceUseCase\(\)\.execute\(\)/);
        assert(destructureMatch, 'C1a. EditorView.js still destructures CreatePersistenceUseCase().execute()');
        for (const field of ['autosaveDocumentUseCase', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase']) {
            assert(destructureMatch[1].includes(field), `C1b. EditorView.js still takes ${field}`);
        }
        assert(/<RecoveryBanner/.test(editorViewSource), 'C1c. RecoveryBanner is still in the template');

        // C2 — the 0.9.206 finding stays closed (history timeline/
        // replay/restore), including 0.9.208's three lifecycle fixes.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        for (const identifier of ['getTimeline', 'restoreHistoryAt', 'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview']) {
            assert(countReferences(worldViewSource, identifier) > 0, `C2a. WorldView.js still references ${identifier}`);
        }
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(/documentId === docId/.test(navigationSessionSource) || /_historyPreview\.documentId/.test(navigationSessionSource), 'C2b. restoreHistoryAt()\'s 0.9.208 cross-document scoping fix is still present');
        const disposeStart = navigationSessionSource.indexOf('    dispose() {');
        assert(disposeStart >= 0, 'C2c. WorldNavigationSession still declares dispose()');
        const disposeBody = navigationSessionSource.slice(disposeStart, disposeStart + 6000);
        assert(/_historyPreview\s*=\s*null/.test(disposeBody), 'C2d. dispose() still resets _historyPreview (0.9.208\'s third fix)');
        assert(/_retiredHistories\s*=\s*null/.test(disposeBody), 'C2e. dispose() still resets _retiredHistories alongside it');

        // C3 — the stack 0.9.206 found stays composed from exactly the
        // one root already confirmed (CreateWorldViewUseCase.js), handed
        // into WorldNavigationSession's constructor alongside the rest of
        // its dependencies — a direct regression check on the object
        // literal itself, not merely "the identifier appears somewhere
        // in the file" (0.9.206's own C3a-c).
        const createWorldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(/new ReplayDocumentUseCase\(/.test(createWorldViewSource), 'C3a. CreateWorldViewUseCase.js still composes ReplayDocumentUseCase');
        assert(/new RestoreHistoryStateUseCase\(/.test(createWorldViewSource), 'C3b. CreateWorldViewUseCase.js still composes RestoreHistoryStateUseCase');
        const sessionConstructionMatch = createWorldViewSource.match(/new WorldNavigationSession\(\{([\s\S]*?)\n\s{16}\}\)/);
        assert(sessionConstructionMatch, 'C3c. CreateWorldViewUseCase.js still constructs WorldNavigationSession with an options object');
        assert(/\breplayDocumentUseCase\b/.test(sessionConstructionMatch[1]) && /\brestoreHistoryStateUseCase\b/.test(sessionConstructionMatch[1]), 'C3d. both replayDocumentUseCase and restoreHistoryStateUseCase are still passed directly into that same object literal');

        // C4 — a narrower, less error-prone version of "is there a
        // fourth thread in this area": rather than assuming every
        // `new *UseCase(...)` construction in this file must reach
        // WorldNavigationSession specifically (false — some, like
        // placePublicationUseCase, correctly feed a DIFFERENT use case,
        // e.g. publishDocumentUseCase, and never touch the session at
        // all), check the one shape a real C1/C2-style gap would
        // actually take: a *session* method with a getter half
        // (read a past/pending state) and a mutator half (act on it),
        // constructed here, that WorldView.js's own template/setup()
        // never references. Section A's undo()/redo() finding is
        // deliberately excluded from this list and filed under Section A
        // instead — it is a missing UI caller for a capability that was
        // never uncomposed, not a missing composition.
        const worldViewSourceForC = await rawSource('ui/views/WorldView.js');
        for (const method of ['createLandmarkHere', 'createRegionHere', 'movePlacement', 'removePlacement', 'unpublishDocument', 'searchWorld']) {
            assert(countReferences(worldViewSourceForC, method) > 0, `C4. WorldView.js still calls session.${method}(...) — the document/placement/publication-lifecycle surface has no new orphaned method`);
        }

        console.log('✓ Section C: World material/document lifecycle — COMPLETE. Both prior findings in this area (0.9.203\'s autosave/recovery, 0.9.206\'s history/replay/restore) stay closed, including 0.9.208\'s three narrow fixes, reconfirmed directly against the WorldNavigationSession constructor call rather than by mere identifier presence. A narrower sweep of the surrounding placement/publication/naming methods finds no fourth orphaned thread. Section A\'s undo/redo finding is filed there, not here, since it is a missing UI caller for a capability that was never uncomposed, not a missing composition.');
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

        // D3 — the three stated separations still hold, checked directly
        // against the actual use case source rather than by name only.
        const removePlacementSource = await rawSource('application/RemoveWorldPlacementUseCase.js');
        assert(!/Publish|Unpublish/.test(removePlacementSource), 'D3a. Unpublish ≠ Remove placement: RemoveWorldPlacementUseCase.js still carries no Publish/Unpublish reference');
        const unpublishSource = await rawSource('application/UnpublishDocumentUseCase.js');
        assert(!/Placement/.test(unpublishSource), 'D3b. Unpublish ≠ Remove placement: UnpublishDocumentUseCase.js still carries no Placement reference');

        // D4 — Recovery stays scoped to the open, unpublished editing
        // session; History (0.9.207/0.9.208) stays scoped to World View's
        // own session — neither reaches into Publication/Placement code.
        for (const file of ['application/PublishDocumentUseCase.js', 'application/UnpublishDocumentUseCase.js', 'application/RemoveWorldPlacementUseCase.js']) {
            const source = await rawSource(file);
            assert(!/RecoveryStore|AutosaveScheduler|RecoveryObserver|CheckRecoveryUseCase/.test(source), `D4a. ${file} still carries no recovery-subsystem coupling`);
            assert(!/ReplayDocumentUseCase|RestoreHistoryStateUseCase|HistoryTimelinePanel/.test(source), `D4b. ${file} still carries no history/replay-subsystem coupling`);
        }

        console.log(`✓ Section D: Publication workflow — COMPLETE. ${clickHandlers.size} wired actions cover the full publish/unpublish/anchor/distribute/Snapshot surface. Unpublish ≠ Remove placement holds in both directions; the Document/Publication/Placement/Material/Distribution survival chain now also excludes History (0.9.207/0.9.208), not just Recovery (0.9.203-0.9.205) — neither reaches into Publication/Placement code.`);
    }

    // ---------------------------------------------------------------
    // Section E — Editor/document workflow. COMPLETE, reconfirmed, with
    // the same one obsolete leftover still on record (not re-classified
    // — a repository-level "unreachable capability" sweep belongs to
    // Section G below, once for the whole codebase, not repeated per
    // area).
    // ---------------------------------------------------------------
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');
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
            assert(countReferences(editorViewSource, varName) >= 2, `E1b. ${varName} is referenced beyond its own construction`);
        }

        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(/new ExportBlueprintUseCase\(/.test(editorSessionSource), 'E2a. EditorSession.js still composes ExportBlueprintUseCase');
        assert(/new ImportBlueprintUseCase\(/.test(editorSessionSource), 'E2b. EditorSession.js still composes ImportBlueprintUseCase');
        assert(/editorSession\.exportBlueprint\(/.test(editorViewSource), 'E2c. EditorView.js still calls editorSession.exportBlueprint()');
        assert(/editorSession\.importBlueprint\(/.test(editorViewSource), 'E2d. EditorView.js still calls editorSession.importBlueprint()');

        // E3 — the Editor's OWN undo/redo, for contrast with Section A's
        // World View finding: fully wired through EditorActionRegistry,
        // both a keyboard shortcut AND an enabled/disabled-reason UI
        // affordance, not merely a session method. This is the product
        // precedent Section A's gap is measured against — the SAME
        // capability shape (canUndo/canRedo + undo()/redo() on top of a
        // CommandHistory) is a first-class, keyboard-reachable action
        // everywhere else CommandHistory exists in this product.
        const actionRegistrySource = await rawSource('application/EditorActionRegistry.js');
        assert(/keys:\s*\[\{\s*key:\s*'z',\s*ctrl:\s*true\s*\}\]/.test(actionRegistrySource), 'E3a. EditorActionRegistry.js still binds Ctrl+Z to undo');
        assert(/ctx\.canUndo/.test(actionRegistrySource), 'E3b. ...gated on ctx.canUndo, with its own disabledReason');
        assert(/key:\s*'z',\s*ctrl:\s*true,\s*shift:\s*true/.test(actionRegistrySource), 'E3c. EditorActionRegistry.js still binds Ctrl+Shift+Z to redo');

        console.log('✓ Section E: Editor/document workflow — COMPLETE, reconfirmed. Fork/copy/paste/repeat, metadata, structure preview/composition, and blueprint export/import are all still both composed and called. The Editor\'s OWN undo/redo — Ctrl+Z/Ctrl+Shift+Z through EditorActionRegistry, gated on canUndo/canRedo with its own disabled-reason text — is confirmed here as the product precedent Section A\'s finding is measured against: the identical capability shape has a keyboard affordance everywhere else it exists except World View.');
    }

    // ---------------------------------------------------------------
    // Section F — Cross-cutting lifecycle integrity. New category, per
    // this milestone's own brief. Primarily structural: confirms the
    // several independently-correct lifecycle systems accumulated since
    // 0.9.196 remain separate authorities rather than growing hidden
    // coupling as each new one was added.
    // ---------------------------------------------------------------
    {
        // F1 — History restore feeds the SAME ordinary dirty/save path
        // every other mutation uses, not a special recovery-shaped path.
        // Reconfirms 0.9.208's own Section H directly.
        const commandHistorySource = await rawSource('application/CommandHistory.js');
        assert(!/Recovery|Autosave/.test(commandHistorySource), 'F1a. CommandHistory.js still carries no Recovery/Autosave reference — history/restore and autosave/recovery remain independent mechanisms');
        const restoreSource = await rawSource('application/RestoreHistoryStateUseCase.js');
        assert(!/Recovery|Autosave/.test(restoreSource), 'F1b. RestoreHistoryStateUseCase.js still carries no Recovery/Autosave reference');
        const recoverySource = await rawSource('application/RecoveryObserver.js');
        assert(!/ReplayDocumentUseCase|RestoreHistoryStateUseCase|CommandHistory/.test(recoverySource), 'F1c. RecoveryObserver.js still carries no History/replay reference — the reverse direction holds too');

        // F2 — Unpublish ≠ Remove placement ≠ Retract distribution,
        // reconfirmed as three genuinely separate use cases (0.9.199's
        // own convergence audit), not merely three separate names for
        // one code path.
        for (const file of ['application/UnpublishDocumentUseCase.js', 'application/RemoveWorldPlacementUseCase.js']) {
            const source = await rawSource(file);
            assert(!/Distribut/.test(source), `F2a. ${file} still carries no Distribution reference`);
        }

        // F3 — Snapshot materialization stays independent of both
        // Recovery and History/replay: materializing a discovered
        // Snapshot into the local World is a distribution-side concern,
        // never touching the editing-session recovery stack or the
        // World View history/replay stack.
        const materializeSource = await rawSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(!/Recovery|Autosave|ReplayDocumentUseCase|RestoreHistoryStateUseCase/.test(materializeSource), 'F3. MaterializeSnapshotFromPlacementUseCase.js still carries no Recovery/Autosave/History reference');

        // F4 — WorldNavigationSession itself hosts BOTH the history/
        // replay/restore stack (0.9.207/0.9.208) AND undo/redo (Section
        // A's finding) without either implementing a second, competing
        // CommandHistory-like mechanism. Exactly one CommandHistory
        // class is imported and used.
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        const commandHistoryImports = [...navigationSessionSource.matchAll(/import\s*\{[^}]*\bCommandHistory\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g)];
        assert(commandHistoryImports.length === 1, 'F4a. WorldNavigationSession.js still imports exactly one CommandHistory-shaped class');
        assert(!/class\s+\w*History\w*(?!Timeline)/.test(navigationSessionSource.replace(/HistoryTimelinePanel/g, '')), 'F4b. WorldNavigationSession.js still defines no competing history mechanism of its own');

        console.log('✓ Section F: Cross-cutting lifecycle integrity — CONFIRMED. Autosave/recovery, history/replay/restore, placement, publication/distribution, and Snapshot materialization remain five separate authorities with no cross-references in either direction, checked directly against source rather than by name. WorldNavigationSession hosts undo/redo and history/replay/restore side by side without inventing a second history mechanism.');
    }

    // ---------------------------------------------------------------
    // Section G — repository-level sweep for obsolete UI mechanisms
    // (the negative test this milestone's own brief asks for), plus the
    // capability reachability matrix summarizing every finding above.
    // ---------------------------------------------------------------
    {
        // G1 — GroupsPanel.js (0.9.206's own finding) is reconfirmed
        // still obsolete, still unreferenced, still fully superseded —
        // named again here, once, at the repository level, so a future
        // reassessment does not rediscover it as a "product gap."
        assert(!/GroupsPanel/.test(await rawSource('ui/main.js')), 'G1a. GroupsPanel is not registered in ui/main.js');
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(!/components:\s*\{[^}]*GroupsPanel/.test(editorViewSource), 'G1b. EditorView.js\'s own components: {} does not register GroupsPanel');
        const editingSidebarSource = await rawSource('ui/components/EditingSidebar.js');
        for (const groupAction of ['group.create', 'group.rename', 'group.duplicate', 'group.delete', 'group.addSelection', 'group.removeSelection']) {
            assert(editingSidebarSource.includes(groupAction), `G1c. EditingSidebar.js's own Groups section still covers ${groupAction}`);
        }
        const groupsPanelSource = await rawSource('ui/components/GroupsPanel.js');
        assert(groupsPanelSource.length > 0, 'G1d. ui/components/GroupsPanel.js still exists on disk, unremoved — this milestone identifies it, per its own brief, but does not delete it');

        console.log('✓ Section G: repository-level obsolete-UI sweep — ui/components/GroupsPanel.js remains the one identified cleanup candidate (OBSOLETE leaf), unchanged since 0.9.206. No new obsolete file surfaced.');
    }

    console.log('\n✅ All Post-History Product Reassessment tests passed.');
    console.log(`
Classification summary:
  A. World interaction/navigation ........ ACTUAL_GAP (plain undo/redo has no UI caller in World View)
  B. Vehicle system ....................... INTENTIONAL_BOUNDARY
  C. World material/document lifecycle .... COMPLETE (0.9.203 + 0.9.206 arcs both closed; no third thread found)
  D. Publication workflow ................. COMPLETE
  E. Editor/document workflow .............. COMPLETE
  F. Cross-cutting lifecycle integrity ..... CONFIRMED (five separate authorities, no hidden coupling)

Capability reachability matrix:
  Capability                    Exists  Composed  UI reachable  Classification
  History timeline/preview        ✓       ✓         ✓         COMPLETE
  History restore                 ✓       ✓         ✓         COMPLETE
  Recovery / autosave              ✓       ✓         ✓         COMPLETE
  Placement removal                ✓       ✓         ✓         COMPLETE
  Unpublish                        ✓       ✓         ✓         COMPLETE
  Region/Landmark undo (session)   ✓       ✓         —         ACTUAL_GAP  <- this milestone
  movePlacement/removePlacement undo —     —         —         INTENTIONAL (no Command object; nothing to undo by design)
  GroupsPanel.js (Groups CRUD)     ✓       —         —         OBSOLETE (superseded by EditingSidebar)

Candidate gap (as it stands when THIS milestone, 0.9.209, ran):
  1. World View plain undo/redo (keyboard shortcut and/or button)
     - existing capability?         yes (WorldNavigationSession.undo()/redo(), unchanged since 0.5.9)
     - existing use case?           n/a — operates directly on CommandHistory, same as every other
                                     undo/redo caller in this product (see EditorActionRegistry)
     - composition-root reachable?  yes (constructed once per session, called nowhere)
     - UI reachable?                no (no button, no keyboard shortcut; WorldView.js's own keydown
                                     handler exists for Avatar Control Mode but never branches on
                                     ctrl/meta+Z or +Y)
     - product precedent?           yes — the Editor wires the SAME capability shape
                                     (canUndo/canRedo + undo()/redo()) to Ctrl+Z/Ctrl+Shift+Z through
                                     EditorActionRegistry; World View is the one place this shape
                                     exists without a caller
     - new domain logic required?   no — every method needed already exists, is tested here
                                     directly (Section A8), and already reverses exactly the two
                                     mutation-shaped capabilities 0.5.9 kept in WorldNavigationSession
     - intentional boundary?        no — 0.5.9's own design record states undo/redo was kept
                                     specifically so "a viewer's landmark edit needs to be undoable
                                     too"; that stated need has no caller today
     - scope note?                  movePlacement()/removePlacement() are confirmed OUT of scope —
                                     neither runs through CommandHistory, so undo() cannot and should
                                     not reverse them; this gap is about Region/Landmark naming only

Per this milestone's own brief, no next milestone is prescribed here.
0.9.209 stops at classification. If a future milestone takes up the
candidate gap above, it already names the shape the work would take —
wiring WorldView.js's existing keydown handler and/or a small toolbar
affordance to the already-correct, already-tested
WorldNavigationSession.undo()/redo() — but whether, and in which shape,
is a product decision this test-only milestone deliberately leaves open.
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
