import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';

// 0.9.213 — Editor Undo/Redo Label Mirrors.
//
// 0.9.212 found a narrow, specific gap: EditorActionContext.capture()
// already computes ctx.undoLabel/ctx.redoLabel correctly (a straight
// mirror of CommandHistory's own getUndoLabel()/getRedoLabel(), via its
// own historyCall() helper) but EditorActionRegistry's history.undo/
// history.redo actions never read them — the Command Palette showed
// static "Undo"/"Redo" and generic "Nothing to undo"/"Nothing to redo"
// where WorldView.js already shows the specific command name for the
// identical capability (its own undoLabel/redoLabel tooltip).
//
// This milestone closes exactly that seam: EditorActionRegistry's two
// history actions gain a `contextualLabel(ctx)` field — a straight
// passthrough of ctx.undoLabel/ctx.redoLabel, nothing reconstructed —
// and ui/components/CommandPalette.js's displayLabel() reads it instead
// of the static label when present. No new label generator, no second
// history stack, no Editor-specific command metadata, no new history
// events, no new persistence, no new undo/redo semantics: CommandHistory
// remains the sole authority, EditorSession's own getUndoLabel()/
// getRedoLabel() (unchanged since before this milestone) remain its only
// mirror, and EditorActionContext.capture() (unchanged by this
// milestone) remains the only place that reads them into a UI-facing
// shape.
//
// ui/components/CommandPalette.js imports no Vue-external runtime and is
// exercised directly here (unlike ui/views/WorldView.js/EditorView.js,
// which import 'vue' and stay out of this repo's plain `node
// tests/*.test.js` sweep) — Section A instantiates the real component
// class and calls its own methods, not just a regex proxy for it.
//
//   Section A: Domain-to-Editor label convergence — a real EditorSession/
//              CommandHistory pair produces a label; CommandPalette's own
//              displayLabel() renders exactly that string, verbatim.
//   Section B: Undo transition — create, then undo, label flips to Redo.
//   Section C: Redo transition — redo, then the undo label returns to
//              the next real command underneath.
//   Section D: Branch invalidation — undo, then a fresh command wipes
//              the redo branch; the mirrored label disappears with it.
//   Section E: Empty history — both mirrors neutral, no exceptions.
//   Section F: Document-switch isolation — swapping the active
//              CommandHistory (what loadDocument() does under the hood)
//              replaces the mirrored labels; nothing leaks across it.
//   Section G: Scope note — EditorSession has no history preview/
//              restore surface (that arc, 0.9.207/0.9.208, is WorldView-
//              only); recorded explicitly rather than invented.
//   Section H: Structural audit — no CommandHistory duplication, no
//              independently generated labels, no second history state,
//              no new persistence/autosave/publication coupling.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider {
    constructor() { this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createWorldWithBricks(specs) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = [];
    for (const spec of specs) {
        const brick = new Brick({
            definitionId: spec.definitionId || 'core:cube',
            position: spec.position,
            rotation: spec.rotation || 0
        });
        building.addBrick(brick);
        ids.push(brick.id);
    }
    world.addBuilding(building);
    return { world, building, ids };
}

// Mirrors tests/EditorUX.test.js's own buildSession() — a REAL
// EditorSession with a REAL CommandHistory, not a mock. session._commandHistory
// is set directly (as that file's own header explains, normally wired by
// EditorSession#start()/loadDocument(), unavailable headless here).
function buildSession({ world, building }) {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'LabelMirrors', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'label-mirrors-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });
    session._editorCommandHistories.set(world.id, session._commandHistory);

    return { session, editorContext, documentManager, document, brickRegistry, building };
}

function selectBricks(editorContext, building, brickIds) {
    editorContext.setSelection(new SelectionState({
        items: brickIds.map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));
}

function registryFor(session) {
    const feedback = { messages: [], show(message) { this.messages.push(message); } };
    return new EditorActionRegistry(createStandardActions({ session, feedback, ui: {} }));
}

function ctxFor(session) {
    return EditorActionContext.capture({ session });
}

async function run() {
    // -------------------------------------------------------------
    // A. Domain-to-Editor label convergence — a real command, a real
    //    CommandHistory label, rendered verbatim by the real
    //    CommandPalette component.
    // -------------------------------------------------------------
    {
        const CommandPalette = (await import('../ui/components/CommandPalette.js')).default;

        const { world, building, ids } = createWorldWithBricks([
            { position: new Position(0, 0.5, 0) }
        ]);
        const { session, editorContext } = buildSession({ world, building });
        const registry = registryFor(session);

        selectBricks(editorContext, building, [ids[0]]);
        assert(session.deleteSelection() !== false, '1. deleteSelection() succeeds');

        const history = session._commandHistory;
        const expectedLabel = history.getUndoLabel();
        assert(expectedLabel === 'Undo Delete Brick', '2. sanity: CommandHistory produces the expected authoritative label');
        assert(session.getUndoLabel() === expectedLabel, '3. EditorSession.getUndoLabel() mirrors CommandHistory exactly');

        const ctx = ctxFor(session);
        assert(ctx.undoLabel === expectedLabel, '4. EditorActionContext.capture() mirrors it into ctx.undoLabel, unchanged by this milestone');

        const undoAction = registry.get('history.undo');
        assert(undoAction.contextualLabel(ctx) === expectedLabel, '5. history.undo\'s contextualLabel(ctx) is exactly the authoritative label — no reconstruction');

        // The real component, not a regex proxy: mount its own class and
        // call its own displayLabel() the same way its template does.
        const paletteInstance = { context: ctx, ...CommandPalette.methods };
        assert(paletteInstance.displayLabel(undoAction) === expectedLabel,
            '6. CommandPalette.displayLabel() renders the authoritative label VERBATIM — the exact string CommandHistory produced, not a re-derived one');
        assert(undoAction.label === 'Undo', '7. the static action.label is untouched — search/KeyboardShortcutsOverlay still see a stable, context-free "Undo"');

        console.log('✓ A. Domain-to-Editor label convergence: CommandHistory -> EditorSession -> EditorActionContext -> EditorActionRegistry -> CommandPalette, the identical string at every hop');
    }

    // -------------------------------------------------------------
    // B. Undo transition — create, undo, the Redo mirror picks up
    //    exactly what was just undone.
    // -------------------------------------------------------------
    {
        const { world, building, ids } = createWorldWithBricks([
            { position: new Position(0, 0.5, 0) }
        ]);
        const { session, editorContext } = buildSession({ world, building });
        const registry = registryFor(session);

        let ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === null, '1. no undo label before any operation');

        selectBricks(editorContext, building, [ids[0]]);
        session.deleteSelection();
        ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === 'Undo Delete Brick', '2. after Delete, the mirror reads "Undo Delete Brick"');
        assert(registry.get('history.redo').contextualLabel(ctx) === null, '3. nothing to redo yet');

        session.undo();
        ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === null, '4. after Undo, the undo mirror goes neutral');
        assert(registry.get('history.redo').contextualLabel(ctx) === 'Redo Delete Brick', '5. ...and the redo mirror now names exactly the operation just undone');

        console.log('✓ B. Undo transition: "Undo Delete Brick" -> Undo -> "Redo Delete Brick"');
    }

    // -------------------------------------------------------------
    // C. Redo transition — redo, then the undo mirror returns to
    //    naming the next real command underneath (not a stale or
    //    reconstructed value).
    // -------------------------------------------------------------
    {
        const { world, building, ids } = createWorldWithBricks([
            { position: new Position(0, 0.5, 0) },
            { position: new Position(4, 0.5, 0) }
        ]);
        const { session, editorContext } = buildSession({ world, building });
        const registry = registryFor(session);

        selectBricks(editorContext, building, [ids[0]]);
        session.deleteSelection(); // "Delete Brick" #1
        selectBricks(editorContext, building, [ids[1]]);
        session.deleteSelection(); // "Delete Brick" #2

        session.undo(); // undoes #2
        let ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === 'Undo Delete Brick', '1. undo label names the REMAINING command (#1), not the undone one');
        assert(registry.get('history.redo').contextualLabel(ctx) === 'Redo Delete Brick', '2. redo label names the just-undone command (#2)');

        session.redo();
        ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === 'Undo Delete Brick', '3. after Redo, the undo mirror again names the top of the stack (#2 again)');
        assert(registry.get('history.redo').contextualLabel(ctx) === null, '4. nothing left to redo');

        console.log('✓ C. Redo transition: the undo mirror always tracks the true top of CommandHistory\'s own stack');
    }

    // -------------------------------------------------------------
    // D. Branch invalidation — undo, then a NEW command wipes the
    //    redo branch (CommandHistory's own linear-history invariant);
    //    the mirrored redo label disappears with it, permanently.
    // -------------------------------------------------------------
    {
        const { world, building, ids } = createWorldWithBricks([
            { position: new Position(0, 0.5, 0) },
            { position: new Position(4, 0.5, 0) },
            { position: new Position(8, 0.5, 0) }
        ]);
        const { session, editorContext } = buildSession({ world, building });
        const registry = registryFor(session);

        selectBricks(editorContext, building, [ids[0]]);
        session.deleteSelection(); // A
        selectBricks(editorContext, building, [ids[1]]);
        session.deleteSelection(); // B
        session.undo(); // undo B

        let ctx = ctxFor(session);
        assert(registry.get('history.redo').contextualLabel(ctx) === 'Redo Delete Brick', '1. sanity: B is redoable before C runs');

        selectBricks(editorContext, building, [ids[2]]);
        session.deleteSelection(); // C — a fresh command after an undo

        ctx = ctxFor(session);
        assert(registry.get('history.redo').contextualLabel(ctx) === null, '2. the old B redo branch is gone — the mirror reflects it correctly, not a stale label');
        assert(registry.get('history.redo').disabledReason(ctx) === 'Nothing to redo', '3. disabledReason still carries the generic text once nothing is there to name');
        assert(registry.get('history.undo').contextualLabel(ctx) === 'Undo Delete Brick', '4. undo mirror correctly names C, the real top of the stack');

        console.log('✓ D. Branch invalidation: an invalidated redo branch takes its mirrored label down with it');
    }

    // -------------------------------------------------------------
    // E. Empty history — both mirrors neutral, both actions disabled,
    //    no exception from either contextualLabel() or disabledReason().
    // -------------------------------------------------------------
    {
        const { world, building } = createWorldWithBricks([]);
        const { session } = buildSession({ world, building });
        const registry = registryFor(session);
        const ctx = ctxFor(session);

        let threw = false;
        let undoAction; let redoAction;
        try {
            undoAction = registry.get('history.undo');
            redoAction = registry.get('history.redo');
            assert(undoAction.contextualLabel(ctx) === null, '1. undo mirror is null on empty history');
            assert(redoAction.contextualLabel(ctx) === null, '2. redo mirror is null on empty history');
        } catch (e) {
            threw = true;
        }
        assert(!threw, '3. contextualLabel() never throws on empty history');

        assert(undoAction.enabled(ctx) === false && redoAction.enabled(ctx) === false, '4. both actions report disabled');
        assert(undoAction.disabledReason(ctx) === 'Nothing to undo', '5. undo disabledReason is the generic neutral text');
        assert(redoAction.disabledReason(ctx) === 'Nothing to redo', '6. redo disabledReason is the generic neutral text');

        console.log('✓ E. Empty history: both mirrors correctly neutral, no exceptions');
    }

    // -------------------------------------------------------------
    // F. Document-switch isolation — the active CommandHistory is
    //    swapped (exactly what EditorSession#loadDocument()'s own
    //    _rebuild() does when opening a different document); the
    //    mirrored labels must reflect only the NEW document's history,
    //    never the old one's.
    // -------------------------------------------------------------
    {
        const docA = createWorldWithBricks([{ position: new Position(0, 0.5, 0) }]);
        const { session, editorContext } = buildSession({ world: docA.world, building: docA.building });
        selectBricks(editorContext, docA.building, [docA.ids[0]]);
        session.deleteSelection();

        const registry = registryFor(session);
        let ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === 'Undo Delete Brick', '1. Document A shows its own real undo label');

        // Switch to Document B — a brand-new World/CommandHistory, the
        // same swap _rebuild() performs internally.
        const docB = createWorldWithBricks([{ position: new Position(0, 0.5, 0) }]);
        session._commandHistory = new CommandHistory({ world: docB.world });
        session._editorCommandHistories.set(docB.world.id, session._commandHistory);
        session._documentManager.load(
            new Document({ world: docB.world, metadata: new DocumentMetadata({ title: 'Doc B', author: 'tester' }) }),
            'label-mirrors-doc-b'
        );
        session._editorContext.clearSelection();

        ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === null, '2. Document B\'s own (empty) history shows no undo label — Document A\'s label did not leak across the switch');
        assert(registry.get('history.redo').contextualLabel(ctx) === null, '3. same for redo');

        selectBricks(editorContext, docB.building, [docB.ids[0]]);
        session.deleteSelection();
        ctx = ctxFor(session);
        assert(registry.get('history.undo').contextualLabel(ctx) === 'Undo Delete Brick', '4. Document B now shows ITS OWN real label, produced by ITS OWN CommandHistory');

        console.log('✓ F. Document-switch isolation: the mirrors always reflect whichever CommandHistory is currently active, never a stale one');
    }

    // -------------------------------------------------------------
    // G. Scope note — Preview/Restore (0.9.207/0.9.208) is a
    //    WorldNavigationSession/WorldView-only capability. EditorSession
    //    exposes no history-preview surface at all, so there is nothing
    //    for the Editor's label mirrors to stay isolated FROM here.
    //    Recorded explicitly, per this arc's own discipline of not
    //    inventing a feature scope was never asked to check.
    // -------------------------------------------------------------
    {
        const { world, building } = createWorldWithBricks([]);
        const { session } = buildSession({ world, building });

        assert(typeof session.beginHistoryPreview !== 'function', '1. EditorSession has no beginHistoryPreview() — Preview/Restore is not part of this surface');
        assert(typeof session.previewHistoryAt !== 'function', '2. ...nor previewHistoryAt()');
        assert(typeof session.getTimeline !== 'function' || typeof session.getHistoryPreview === 'undefined', '3. no Editor-level history-preview projection exists to check isolation against');

        console.log('✓ G. Scope note: EditorSession has no history preview/restore surface — this milestone introduces none, and checks isolation against nothing that does not exist');
    }

    // -------------------------------------------------------------
    // H. Structural audit.
    // -------------------------------------------------------------
    {
        const SOURCE_ROOT = new URL('../', import.meta.url);
        async function rawSource(relativePath) {
            return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        }
        function codeOnlyLines(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }

        const registrySource = codeOnlyLines(await rawSource('application/EditorActionRegistry.js'));
        const paletteSource = codeOnlyLines(await rawSource('ui/components/CommandPalette.js'));
        const contextSource = codeOnlyLines(await rawSource('application/EditorActionContext.js'));

        // No CommandHistory duplication in the Editor action layer.
        assert(!/from ['"].*\/CommandHistory\.js['"]/.test(registrySource), '1. EditorActionRegistry.js still does not import CommandHistory');
        assert(!/from ['"].*\/CommandHistory\.js['"]/.test(paletteSource), '2. CommandPalette.js does not import CommandHistory either');

        // No independently generated label — contextualLabel is a bare
        // passthrough of ctx.undoLabel/ctx.redoLabel, never a template
        // string or concatenation built from a command/describe() value.
        const undoContextualMatch = registrySource.match(/id:\s*'history\.undo',[\s\S]{0,700}?execute:/);
        const redoContextualMatch = registrySource.match(/id:\s*'history\.redo',[\s\S]{0,700}?execute:/);
        assert(undoContextualMatch && /contextualLabel:\s*\(ctx\)\s*=>\s*ctx\.undoLabel/.test(undoContextualMatch[0]),
            '3. history.undo\'s contextualLabel is the bare expression `(ctx) => ctx.undoLabel` — no reconstruction');
        assert(redoContextualMatch && /contextualLabel:\s*\(ctx\)\s*=>\s*ctx\.redoLabel/.test(redoContextualMatch[0]),
            '4. history.redo\'s contextualLabel is the bare expression `(ctx) => ctx.redoLabel`');
        assert(!/describe\(\)/.test(registrySource), '5. EditorActionRegistry.js never calls describe() itself — it has no access to a Command to reconstruct a label from');

        // EditorActionContext.js is unchanged by this milestone — still
        // the ONLY place ctx.undoLabel/ctx.redoLabel are computed, via
        // the same historyCall() helper as before.
        assert(/undoLabel:\s*historyCall\('getUndoLabel',\s*null\)/.test(contextSource), '6. EditorActionContext.capture() still computes ctx.undoLabel exactly as before this milestone');
        assert(/redoLabel:\s*historyCall\('getRedoLabel',\s*null\)/.test(contextSource), '7. ...and ctx.redoLabel');

        // No second history state: every action still gets the SAME
        // inert default via define()'s own spread, and only the two
        // history actions override it.
        const contextualLabelDefaults = registrySource.match(/contextualLabel:\s*\(\)\s*=>\s*null/g) || [];
        assert(contextualLabelDefaults.length === 1, '8. exactly one inert `contextualLabel: () => null` default in define() — every other action inherits it unchanged');
        const contextualLabelOverrides = registrySource.match(/contextualLabel:\s*\(ctx\)\s*=>/g) || [];
        assert(contextualLabelOverrides.length === 2, '9. exactly two actions (history.undo, history.redo) override the default — no other action grew a contextual label');

        // No autosave/recovery/publication/snapshot coupling introduced.
        assert(!/Recovery|Autosave|Publication|Snapshot/.test(registrySource), '10. EditorActionRegistry.js carries no Recovery/Autosave/Publication/Snapshot reference');
        assert(!/Recovery|Autosave|Publication|Snapshot/.test(paletteSource), '11. CommandPalette.js carries none either');

        // EditorSession.js itself needed no change — getUndoLabel()/
        // getRedoLabel() are still the exact pre-existing one-line
        // delegations to this._commandHistory.
        const sessionSource = codeOnlyLines(await rawSource('application/EditorSession.js'));
        assert(/getUndoLabel\(\)\s*\{\s*return this\._commandHistory \? this\._commandHistory\.getUndoLabel\(\) : null;\s*\}/.test(sessionSource),
            '12. EditorSession.getUndoLabel() is still the unchanged one-line CommandHistory delegation');
        assert(/getRedoLabel\(\)\s*\{\s*return this\._commandHistory \? this\._commandHistory\.getRedoLabel\(\) : null;\s*\}/.test(sessionSource),
            '13. EditorSession.getRedoLabel() is still the unchanged one-line CommandHistory delegation');

        // The static label stays a plain string — KeyboardShortcutsOverlay.js
        // (no context available there) keeps working unchanged, still
        // reading action.label directly.
        const shortcutsOverlaySource = codeOnlyLines(await rawSource('ui/components/KeyboardShortcutsOverlay.js'));
        assert(/action\.label/.test(shortcutsOverlaySource), '14. KeyboardShortcutsOverlay.js still reads the static action.label — untouched by this milestone, no context-dependent rendering added there');

        console.log('✓ H. Structural audit: no CommandHistory duplication, no independently generated labels, no second history state, no autosave/publication/snapshot coupling — CommandHistory remains the sole history authority');
    }

    console.log('\nAll Editor Undo/Redo Label Mirrors tests passed.');
}

await run();
