
// The Editor Action layer (0.1.50): one registry of user-facing
// operations, consumed by the command palette, the consolidated
// sidebar, keyboard shortcut dispatch, and the controls documentation.
//
// ACTIONS ARE NOT COMMANDS. This is the load-bearing distinction of the
// milestone (see docs/Principles.md):
//
//   - Some actions produce history: delete -> DeleteBrickCommand,
//     move -> TransformSelectionCommand, ...
//   - Most don't: selectAll/clearSelection are session state, opening
//     the palette is UI state, feedback is transient.
//
// CommandHistory records only document/world mutations. This registry
// never touches CommandHistory itself, never serializes anything, and
// never becomes a second history or mutation system — actions merely
// invoke the existing sessions, which remain the single gateway to the
// 0.1.42–0.1.49 kernel.
//
// Parity invariant: both editing surfaces build their registry from
// createStandardActions() with their own session bound in. If an
// operation exists in one surface, its id/label/shortcut/enabled rules
// are shared by both — there is no second shortcut table and no
// Editor-only behavior. Where a concrete surface predates a capability
// (a session without the group/clipboard API), the action degrades to
// transient feedback instead of throwing.
//
// Action shape:
//   {
//       id: 'transform.alignLeft',        // unique, dotted, stable
//       label: message,                   // palette/sidebar display
//       category: 'transform',            // grouping id, palette sections
//       tier: 'primary'|'common'|'advanced', // 0.6.2 — contextual action
//                                          // hierarchy (see this field's
//                                          // own note below); never
//                                          // consulted by enabled()/
//                                          // execute() — display-only
//       description: message,             // help text / docs
//       shortcut: 'Ctrl/Cmd+K' | null,    // display string
//       keys: [{ key, ctrl, shift, alt }] | null,  // machine matching
//       enabled: (context) => boolean,
//       disabledReason: (context) => message | null,
//       execute: (invocation) => void     // invocation: { context }
//   }
//
// 0.6.2 — Editor UX Consolidation adds `tier` as pure display metadata,
// the same "read by the UI, never by the registry itself" posture every
// other cosmetic field here already has (shortcut/description). Three
// values only, matching the design conversation's own bucket names:
// PRIMARY (always visible — Rotate, Move), COMMON (Duplicate, Delete,
// Copy/Paste, the always-reachable entry points), ADVANCED (Align,
// Distribute, Repeat, Group management — real operations, just not
// worth permanent screen space). ui/components/EditingSidebar.js reads
// it to decide what stays always-visible vs. what collapses into an
// "Advanced" ui/components/CollapsibleSection.js; the command palette
// and keyboard dispatch stay tier-blind, exactly as before — EVERY
// action is still reachable by search or shortcut regardless of tier,
// per docs/Principles.md's own "no second, poorer surface" posture.
// Unset defaults to 'common' via define()'s own spread below.
import { message } from '../../core/Message.js';
import { isUserFacingError } from '../../core/UserFacingError.js';

// Text is never written here: every label, description, reason and bit of
// feedback is a message named after the action's id (core/Message.js), which
// the UI shows in the chosen language. See docs/Translating.md, "Editor
// actions", for the key names.
export function actionLabel(id) {
    return message(`editorAction.${id}`);
}

export function actionCategoryLabel(category) {
    return message(`editorActionCategory.${category}`);
}

export class EditorActionRegistry {
    constructor(actions = []) {
        this._actions = new Map();
        this._executeListeners = new Set();
        for (const action of actions) {
            this.register(action);
        }
    }

    register(action) {
        if (!action || !action.id || typeof action.id !== 'string') {
            throw new Error('EditorActionRegistry.register(): action needs a string id');
        }
        if (this._actions.has(action.id)) {
            throw new Error(`EditorActionRegistry.register(): duplicate action id "${action.id}"`);
        }
        this._actions.set(action.id, action);
    }

    get(id) {
        return this._actions.get(id) || null;
    }

    getAll() {
        return [...this._actions.values()];
    }

    // Normalized substring matching across label, category, and id —
    // deliberately simple for 0.1.50 (no fuzzy engine). `toText` turns a
    // label into the text the person sees (the UI passes t()), so searching
    // works in their language; without it the message keys are searched.
    findMatching(query, toText = (label) => String(label)) {
        const normalized = EditorActionRegistry.normalizeQuery(query);
        if (!normalized) {
            return this.getAll();
        }
        return this.getAll().filter((action) => {
            const haystack = `${toText(action.label)} ${toText(actionCategoryLabel(action.category))} ${action.id}`.toLowerCase();
            return haystack.includes(normalized);
        });
    }

    // Machine shortcut resolution against a normalized key event
    // ({ key, ctrl, shift, alt } — see InputRouter.toNormalizedKeyEvent).
    resolveShortcut(normalizedKeyEvent) {
        if (!normalizedKeyEvent || !normalizedKeyEvent.key) {
            return null;
        }
        for (const action of this._actions.values()) {
            if (!action.keys) {
                continue;
            }
            for (const combination of action.keys) {
                if (combination.key !== normalizedKeyEvent.key) {
                    continue;
                }
                if (!!combination.ctrl !== !!normalizedKeyEvent.ctrl) {
                    continue;
                }
                if (!!combination.shift !== !!normalizedKeyEvent.shift) {
                    continue;
                }
                if (!!combination.alt !== !!normalizedKeyEvent.alt) {
                    continue;
                }
                return action;
            }
        }
        return null;
    }

    // Executes only when enabled; returns whether anything ran.
    execute(id, context) {
        const action = this.get(id);
        if (!action || !action.enabled(context)) {
            return false;
        }
        action.execute({ context });
        for (const listener of this._executeListeners) {
            listener(id);
        }
        return true;
    }

    // Lets a view refresh state an action changed outside the document,
    // such as the clipboard, which no document event reports.
    onExecute(listener) {
        this._executeListeners.add(listener);
        return () => this._executeListeners.delete(listener);
    }

    static normalizeQuery(query) {
        return (query || '').trim().toLowerCase();
    }

    // Ordered [{ category, actions }] for palette rendering.
    static groupByCategory(actions) {
        const groups = [];
        const indexByCategory = new Map();
        for (const action of actions) {
            if (!indexByCategory.has(action.category)) {
                indexByCategory.set(action.category, groups.length);
                groups.push({ category: action.category, actions: [] });
            }
            groups[indexByCategory.get(action.category)].actions.push(action);
        }
        return groups;
    }
}

// ---------------------------------------------------------------------
// The standard action set. Constructed once per surface with that
// surface's session bound in — definitions (ids, labels, shortcuts,
// enabled rules) are identical everywhere.
// ---------------------------------------------------------------------
export function createStandardActions({ session, feedback, ui = {} }) {
    // Every action's label and description are named after its id (see
    // actionLabel() below), so a definition only spells out its behavior.
    const define = (partial) => ({
        label: actionLabel(partial.id),
        description: message(`editorAction.${partial.id}.description`),
        shortcut: null,
        keys: null,
        tier: 'common', // 0.6.2 — see this file's own header
        enabled: () => true,
        disabledReason: () => null,
        // 0.9.213 — Editor Undo/Redo Label Mirrors. Display-only, exactly
        // like disabledReason: (ctx) => message|null above — a null means
        // "show the static label instead." Every action gets the inert
        // default; only history.undo/history.redo override it, and only
        // with a straight passthrough of ctx.undoLabel/ctx.redoLabel
        // (EditorActionContext.capture()'s own mirror of CommandHistory's
        // getUndoLabel()/getRedoLabel() — see that file). This is never a
        // second label generator: it reconstructs nothing from commands
        // itself, it only surfaces the string the history authority
        // already produced, the same value WorldView.js's own tooltip
        // already shows for the identical capability.
        contextualLabel: () => null,
        ...partial
    });

    // Editing shortcuts make no sense while placing bricks or mid-gesture.
    const editingAllowed = (ctx) => !ctx.placementMode && !ctx.gestureActive;
    const reason = (name, params) => message(`editorActionReason.${name}`, params);
    const selectionRequired = (ctx) => (ctx.hasSelection ? null : reason('noSelection'));
    const done = (id) => message(`editorAction.${id}.done`);
    const nothing = (id) => message(`editorAction.${id}.nothing`);

    // `capability` names the "… is not available on this surface" message.
    const surfaceCall = (methodName, capability, run) => {
        if (typeof session[methodName] !== 'function') {
            feedback.show(message(`editorActionUnavailable.${capability}`));
            return;
        }
        try {
            run(session[methodName].bind(session));
        } catch (err) {
            // A session method rejecting the mutation outright (e.g.
            // 0.2.20 fork-on-edit refusing to fork a published
            // snapshot whose license forbids it) is exactly the "the
            // action degrades to transient feedback instead of
            // throwing" contract this registry already promises for
            // an unavailable capability — extend it to a *refused*
            // one instead of letting the error reach the UI raw.
            feedback.show(isUserFacingError(err) ? err.userMessage : err.message);
        }
    };

    const nudge = (suffix, shortcut, keyName, delta) => define({
        id: `transform.nudge${suffix}`,
        category: 'transform',
        tier: 'primary', // 0.6.2 — "Move" is a Primary bucket action
        shortcut,
        keys: [{ key: keyName }],
        enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
        disabledReason: selectionRequired,
        execute: () => surfaceCall('moveSelection', 'move', (moveSelection) => {
            moveSelection(delta);
            feedback.show(done(`transform.nudge${suffix}`));
        })
    });

    const ALIGN_OPERATIONS = [
        ['Left', 'x-min'], ['Center X', 'x-center'], ['Right', 'x-max'],
        ['Bottom', 'y-min'], ['Center Y', 'y-center'], ['Top', 'y-max'],
        ['Front', 'z-min'], ['Center Z', 'z-center'], ['Back', 'z-max']
    ];
    const alignActions = ALIGN_OPERATIONS.map(([label, mode]) => {
        const id = `transform.align${label.replace(/\s+/g, '')}`;
        return define({
            id,
            category: 'transform',
            tier: 'advanced', // 0.6.2
            enabled: (ctx) => editingAllowed(ctx) && ctx.selectionCount >= 2,
            disabledReason: (ctx) => (ctx.selectionCount >= 2 ? null : reason('selectAtLeast', { count: 2 })),
            execute: () => surfaceCall('alignSelection', 'align', (alignSelection) => {
                alignSelection(mode);
                feedback.show(done(id));
            })
        });
    });

    const distributeActions = ['x', 'y', 'z'].map((axis) => {
        const id = `transform.distribute${axis.toUpperCase()}`;
        return define({
            id,
            category: 'transform',
            tier: 'advanced', // 0.6.2
            enabled: (ctx) => editingAllowed(ctx) && ctx.selectionCount >= 3,
            disabledReason: (ctx) => (ctx.selectionCount >= 3 ? null : reason('selectAtLeast', { count: 3 })),
            execute: () => surfaceCall('distributeSelection', 'distribute', (distributeSelection) => {
                distributeSelection(axis);
                feedback.show(done(id));
            })
        });
    });

    const groupRequired = (ctx) => (ctx.hasSelectedGroup ? null : reason('selectGroup'));
    const groupAction = (suffix, methodName, requirement, requirementReason, tier = 'advanced') => define({
        id: `group.${suffix}`,
        category: 'groups',
        tier, // 0.6.2 — every group operation is Advanced except the
              // entry point itself (group.create, called with 'common')
        enabled: (ctx) => editingAllowed(ctx) && requirement(ctx),
        disabledReason: (ctx) => (requirement(ctx) ? null : requirementReason(ctx)),
        execute: () => surfaceCall(methodName, 'groups', (method) => {
            method();
            feedback.show(done(`group.${suffix}`));
        })
    });

    return [
        // ----------------------------------------------------- Selection
        define({
            id: 'selection.selectAll',
            category: 'selection',
            shortcut: 'Ctrl/Cmd+A',
            keys: [{ key: 'a', ctrl: true }],
            enabled: (ctx) => !ctx.gestureActive,
            execute: () => surfaceCall('selectAll', 'selectAll', (selectAll) => {
                selectAll();
                feedback.show(done('selection.selectAll'));
            })
        }),
        define({
            id: 'selection.clear',
            category: 'selection',
            shortcut: 'Esc',
            keys: [{ key: 'escape' }],
            enabled: (ctx) => ctx.hasSelection && !ctx.gestureActive,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('clearSelection', 'clearSelection', (clearSelection) => {
                clearSelection();
                feedback.show(done('selection.clear'));
            })
        }),
        // 0.2.91 — World Instance Editing & Placement Management gated
        // this to a structure-placement selection only ("bricks already
        // have copy/paste"). 0.4.7 — Advanced Building & Structural
        // Editing closes that gap: a loose brick selection now duplicates
        // in ONE gesture too (EditorSession/WorldNavigationSession's own
        // duplicateSelection() branches on selection kind internally), so
        // this action needs no selectionIsStructurePlacement gate at all
        // — any non-empty selection is duplicable, exactly like delete.
        define({
            id: 'selection.duplicate',
            category: 'selection',
            shortcut: 'Ctrl/Cmd+D',
            keys: [{ key: 'd', ctrl: true }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('duplicateSelection', 'duplicate', (duplicateSelection) => {
                const newId = duplicateSelection();
                // 0.6.2 — "what happens next": name the next likely
                // action instead of only confirming the last one, the
                // same contextual-hint posture the placement/collision
                // feedback strings already used before this milestone.
                feedback.show(newId ? done('selection.duplicate') : nothing('selection.duplicate'));
            })
        }),
        define({
            id: 'selection.delete',
            category: 'selection',
            shortcut: 'Del',
            keys: [{ key: 'delete' }, { key: 'backspace' }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('deleteSelection', 'delete', (deleteSelection) => {
                const deleted = deleteSelection();
                feedback.show(deleted !== false ? done('selection.delete') : nothing('selection.delete'));
            })
        }),
        // 0.9.661 — Add Editor Selection Focus Action. Composed entirely
        // from two EXISTING, unmodified EditorSession methods —
        // getSelectionSummary() (application/editor/SelectionBoundsService.js's
        // own union-bounds center) and frameCameraOn() (0.6.0's fixed
        // (12,12,12)-offset instant framing) — exactly as
        // tests/EditorSelectedBrickCameraFocusBoundaryAudit.test.js
        // (0.9.660) proved composes with zero new geometry or camera
        // code. Brick selections only: gated off for a structure-
        // placement selection the same way structure.createFromSelection
        // already is, because getSelectionSummary() itself only ever
        // resolves brick items (by design — see that method's own
        // header) — structure-placement focusing is an explicit, separate
        // scope decision the 0.9.660 audit (Section I) left open, not
        // something this action silently attempts.
        define({
            id: 'selection.focus',
            category: 'selection',
            enabled: (ctx) => ctx.hasSelection && !ctx.selectionIsStructurePlacement,
            disabledReason: (ctx) => {
                if (ctx.selectionIsStructurePlacement) return reason('focusBricksOnly');
                return ctx.hasSelection ? null : reason('noSelection');
            },
            execute: () => {
                if (typeof session.getSelectionSummary !== 'function' || typeof session.frameCameraOn !== 'function') {
                    feedback.show(message('editorActionUnavailable.focus'));
                    return;
                }
                const summary = session.getSelectionSummary();
                if (!summary) {
                    feedback.show(nothing('selection.focus'));
                    return;
                }
                session.frameCameraOn(summary.bounds.center);
                feedback.show(done('selection.focus'));
            }
        }),

        // -------------------------------------------------------- Groups
        groupAction('create', 'createGroupFromSelection', (ctx) => ctx.hasSelection, selectionRequired, 'common'),
        define({
            id: 'group.rename',
            category: 'groups',
            tier: 'advanced', // 0.6.2
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelectedGroup,
            disabledReason: groupRequired,
            // renameSelectedGroup(name) has no default for `name` — this
            // has to actually collect one before calling it, through the
            // same "ui hook, degrade to feedback if absent" posture as
            // structure.createFromSelection's ui.openCreateBlueprintDialog.
            execute: () => surfaceCall('renameSelectedGroup', 'groups', (rename) => {
                if (typeof ui.promptRenameGroup !== 'function') {
                    feedback.show(message('editorActionUnavailable.groups'));
                    return;
                }
                const groups = typeof session.getGroups === 'function' ? session.getGroups() : [];
                const selectedId = typeof session.getSelectedGroupId === 'function' ? session.getSelectedGroupId() : null;
                const current = groups.find((g) => g.id === selectedId);
                const name = ui.promptRenameGroup(current ? current.name : '');
                if (name === null) {
                    return;
                }
                rename(name.trim() || null);
                feedback.show(done('group.rename'));
            })
        }),
        groupAction('duplicate', 'duplicateSelectedGroup', (ctx) => ctx.hasSelectedGroup, groupRequired),
        groupAction('delete', 'deleteSelectedGroup', (ctx) => ctx.hasSelectedGroup, groupRequired),
        groupAction('addSelection', 'addSelectionToSelectedGroup',
            (ctx) => ctx.hasSelection && ctx.hasSelectedGroup,
            (ctx) => (!ctx.hasSelection ? reason('noSelection') : reason('selectGroup'))),
        groupAction('removeSelection', 'removeSelectionFromSelectedGroup',
            (ctx) => ctx.hasSelection && ctx.hasSelectedGroup,
            (ctx) => (!ctx.hasSelection ? reason('noSelection') : reason('selectGroup'))),

        // ----------------------------------------------------- Clipboard
        define({
            id: 'clipboard.copy',
            category: 'clipboard',
            shortcut: 'Ctrl/Cmd+C',
            keys: [{ key: 'c', ctrl: true }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('copySelection', 'clipboard', (copySelection) => {
                copySelection();
                feedback.show(done('clipboard.copy'));
            })
        }),
        define({
            id: 'clipboard.paste',
            category: 'clipboard',
            shortcut: 'Ctrl/Cmd+V',
            keys: [{ key: 'v', ctrl: true }],
            enabled: (ctx) => editingAllowed(ctx) && !ctx.clipboardEmpty,
            disabledReason: (ctx) => (ctx.clipboardEmpty ? reason('clipboardEmpty') : null),
            execute: () => surfaceCall('paste', 'clipboard', (paste) => {
                paste();
                feedback.show(done('clipboard.paste'));
            })
        }),

        // --------------------------------------------------- Structure
        // Create Blueprint. Gated exactly like clipboard.copy (any brick
        // selection will do) EXCEPT a StructurePlacement selection, which
        // is never eligible — see
        // application/editor/CreateStructureFromSelectionUseCase.js's own header.
        // The id stays `structure.createFromSelection` per this file's own
        // "unique, dotted, stable" id rule. Executing only opens
        // ui/components/CreateBlueprintDialog.js via
        // `ui.openCreateBlueprintDialog`: a modal cannot hand back its
        // answer synchronously, so the host view runs
        // createStructureFromSelection()/saveStructureToPersonalLibrary()
        // itself once the user submits it (EditorView#onCreateBlueprint()).
        define({
            id: 'structure.createFromSelection',
            category: 'structure',
            tier: 'advanced', // 0.6.3 — a "what's next," not an always-visible button
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection && !ctx.selectionIsStructurePlacement,
            disabledReason: (ctx) => {
                if (!ctx.hasSelection) return reason('noSelection');
                if (ctx.selectionIsStructurePlacement) return reason('blueprintBricksOnly');
                return null;
            },
            execute: () => {
                if (typeof ui.openCreateBlueprintDialog !== 'function') {
                    feedback.show(message('editorActionUnavailable.createBlueprint'));
                    return;
                }
                ui.openCreateBlueprintDialog();
            }
        }),

        // ----------------------------------------------------- Transform
        nudge('Right', '→', 'arrowright', { x: 1, y: 0, z: 0 }),
        nudge('Left', '←', 'arrowleft', { x: -1, y: 0, z: 0 }),
        nudge('Forward', '↑', 'arrowup', { x: 0, y: 0, z: -1 }),
        nudge('Back', '↓', 'arrowdown', { x: 0, y: 0, z: 1 }),
        nudge('Up', 'PgUp', 'pageup', { x: 0, y: 1, z: 0 }),
        nudge('Down', 'PgDn', 'pagedown', { x: 0, y: -1, z: 0 }),
        define({
            id: 'transform.rotateClockwise',
            category: 'transform',
            tier: 'primary', // 0.6.2
            shortcut: 'R',
            keys: [{ key: 'r' }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('rotateSelection', 'rotate', (rotateSelection) => {
                rotateSelection(90);
                feedback.show(done('transform.rotateClockwise'));
            })
        }),
        define({
            id: 'transform.rotateCounterClockwise',
            category: 'transform',
            tier: 'primary', // 0.6.2
            shortcut: 'Shift+R',
            keys: [{ key: 'r', shift: true }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('rotateSelection', 'rotate', (rotateSelection) => {
                rotateSelection(-90);
                feedback.show(done('transform.rotateCounterClockwise'));
            })
        }),
        // Tilt (core/BrickOrientation.js): lays each selected brick on its next
        // side, where it stands. Bricks only; a placed structure turns but
        // never tilts.
        define({
            id: 'transform.tilt',
            category: 'transform',
            tier: 'primary',
            shortcut: 'T',
            keys: [{ key: 't' }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection && !ctx.selectionIsStructurePlacement,
            disabledReason: (ctx) => {
                if (!ctx.hasSelection) return reason('noSelection');
                if (ctx.selectionIsStructurePlacement) return reason('tiltBricksOnly');
                return null;
            },
            execute: () => surfaceCall('tiltSelection', 'tilt', (tiltSelection) => {
                if (tiltSelection(1)) feedback.show(done('transform.tilt'));
            })
        }),
        define({
            id: 'transform.tiltBack',
            category: 'transform',
            tier: 'primary',
            shortcut: 'Shift+T',
            keys: [{ key: 't', shift: true }],
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection && !ctx.selectionIsStructurePlacement,
            disabledReason: (ctx) => {
                if (!ctx.hasSelection) return reason('noSelection');
                if (ctx.selectionIsStructurePlacement) return reason('tiltBricksOnly');
                return null;
            },
            execute: () => surfaceCall('tiltSelection', 'tilt', (tiltSelection) => {
                if (tiltSelection(-1)) feedback.show(done('transform.tiltBack'));
            })
        }),
        ...alignActions,
        ...distributeActions,
        define({
            id: 'transform.numeric',
            category: 'transform',
            tier: 'advanced', // 0.6.2
            enabled: (ctx) => editingAllowed(ctx),
            execute: () => {
                if (typeof ui.focusNumeric === 'function') {
                    ui.focusNumeric();
                    feedback.show(done('transform.numeric'));
                } else {
                    feedback.show(message('editorActionUnavailable.numeric'));
                }
            }
        }),
        // 0.6.2 — Editor UX Consolidation. RepeatSelectionUseCase and
        // EditorSession#repeatSelection() have existed, fully wired and
        // fully tested, since 0.4.9 — but 0.4.9 never gave "Repeat" a
        // UI entry point of its own (no sidebar control, no palette
        // action). This is that entry point, on the SAME "focus the
        // panel, the panel itself calls the session directly" shape
        // transform.numeric already established just above — Repeat's
        // count/offset are user-tunable, not a fixed zero-arg trigger,
        // so (like Align/Distribute/Numeric before it) execute() never
        // repeats anything itself; ui/components/RepeatPanel.js does,
        // via the SAME repeatSelection() this milestone did not have to
        // touch.
        define({
            id: 'transform.repeat',
            category: 'transform',
            tier: 'advanced',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => {
                if (typeof ui.focusRepeat === 'function') {
                    ui.focusRepeat();
                    feedback.show(done('transform.repeat'));
                } else {
                    feedback.show(message('editorActionUnavailable.repeat'));
                }
            }
        }),

        // ------------------------------------------------------- History
        define({
            id: 'history.undo',
            category: 'history',
            shortcut: 'Ctrl/Cmd+Z',
            keys: [{ key: 'z', ctrl: true }],
            enabled: (ctx) => ctx.canUndo && !ctx.gestureActive,
            disabledReason: (ctx) => (ctx.canUndo ? null : reason('nothingToUndo')),
            // 0.9.213 — ctx.undoLabel IS CommandHistory's own
            // getUndoLabel() ("Undo Create Landmark", already prefixed),
            // mirrored through EditorActionContext.capture()'s historyCall()
            // helper. Null whenever ctx.canUndo is false, so this never
            // disagrees with disabledReason above.
            contextualLabel: (ctx) => ctx.undoLabel,
            execute: () => surfaceCall('undo', 'undo', (undo) => {
                undo();
                feedback.show(done('history.undo'));
            })
        }),
        define({
            id: 'history.redo',
            category: 'history',
            shortcut: 'Ctrl/Cmd+Shift+Z',
            keys: [{ key: 'z', ctrl: true, shift: true }, { key: 'y', ctrl: true }],
            enabled: (ctx) => ctx.canRedo && !ctx.gestureActive,
            disabledReason: (ctx) => (ctx.canRedo ? null : reason('nothingToRedo')),
            // 0.9.213 — see history.undo's own contextualLabel above;
            // ctx.redoLabel is CommandHistory's own getRedoLabel().
            contextualLabel: (ctx) => ctx.redoLabel,
            execute: () => surfaceCall('redo', 'redo', (redo) => {
                redo();
                feedback.show(done('history.redo'));
            })
        }),

        // ------------------------------------------------------------ UI
        define({
            id: 'ui.commandPalette',
            category: 'interface',
            shortcut: 'Ctrl/Cmd+K',
            keys: [{ key: 'k', ctrl: true }],
            execute: () => {
                if (typeof ui.togglePalette === 'function') {
                    ui.togglePalette();
                }
            }
        }),
        // Brings back the guided first build after it was hidden.
        define({
            id: 'ui.firstBuildGuide',
            category: 'interface',
            enabled: () => typeof ui.showFirstBuildGuide === 'function',
            execute: () => {
                if (typeof ui.showFirstBuildGuide === 'function') {
                    ui.showFirstBuildGuide();
                }
            }
        })
    ];
}
