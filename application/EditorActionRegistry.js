import { EditorActionContext } from './EditorActionContext.js';

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
//       label: 'Align Left',              // palette/sidebar display
//       category: 'Transform',            // grouping, palette sections
//       tier: 'primary'|'common'|'advanced', // 0.6.2 — contextual action
//                                          // hierarchy (see this field's
//                                          // own note below); never
//                                          // consulted by enabled()/
//                                          // execute() — display-only
//       description: '...',               // help text / docs
//       shortcut: 'Ctrl/Cmd+K' | null,    // display string
//       keys: [{ key, ctrl, shift, alt }] | null,  // machine matching
//       enabled: (context) => boolean,
//       disabledReason: (context) => string | null,
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
export class EditorActionRegistry {
    constructor(actions = []) {
        this._actions = new Map();
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

    get categories() {
        const seen = [];
        for (const action of this._actions.values()) {
            if (!seen.includes(action.category)) {
                seen.push(action.category);
            }
        }
        return seen;
    }

    getByCategory(category) {
        return this.getAll().filter((action) => action.category === category);
    }

    // Normalized substring matching across label, category, and id —
    // deliberately simple for 0.1.50 (no fuzzy engine).
    findMatching(query) {
        const normalized = EditorActionRegistry.normalizeQuery(query);
        if (!normalized) {
            return this.getAll();
        }
        return this.getAll().filter((action) => {
            const haystack = `${action.label} ${action.category} ${action.id}`.toLowerCase();
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
        return true;
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
    const define = (partial) => ({
        shortcut: null,
        keys: null,
        description: '',
        tier: 'common', // 0.6.2 — see this file's own header
        enabled: () => true,
        disabledReason: () => null,
        ...partial
    });

    // Editing shortcuts make no sense while placing bricks, mid-gesture,
    // or when the session explicitly declared canEdit: false (e.g.
    // PublishedWorldSession in 0.2.4).
    const editingAllowed = (ctx) => {
        if (ctx.capabilities && ctx.capabilities.canEdit === false) return false;
        return !ctx.placementMode && !ctx.gestureActive;
    };
    const selectionRequired = (ctx) => (ctx.hasSelection ? null : 'No bricks selected');

    const surfaceCall = (methodName, unavailableMessage, run) => {
        if (typeof session[methodName] !== 'function') {
            feedback.show(unavailableMessage);
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
            feedback.show(err.message);
        }
    };

    const nudge = (suffix, label, shortcut, keyName, delta, axis) => define({
        id: `transform.nudge${suffix}`,
        label: `Move ${label}`,
        category: 'Transform',
        tier: 'primary', // 0.6.2 — "Move" is a Primary bucket action
        shortcut,
        keys: [{ key: keyName }],
        description: `Nudge the selection ${label.toLowerCase()} by one grid step`,
        enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
        disabledReason: selectionRequired,
        execute: () => surfaceCall('moveSelection', 'Move is not available on this surface', (moveSelection) => {
            moveSelection(delta);
            const amount = delta[axis];
            feedback.show(`Moved ${axis.toUpperCase()} ${amount > 0 ? '+' : ''}${amount}`);
        })
    });

    const ALIGN_OPERATIONS = [
        ['Left', 'x-min'], ['Center X', 'x-center'], ['Right', 'x-max'],
        ['Bottom', 'y-min'], ['Center Y', 'y-center'], ['Top', 'y-max'],
        ['Front', 'z-min'], ['Center Z', 'z-center'], ['Back', 'z-max']
    ];
    const alignActions = ALIGN_OPERATIONS.map(([label, mode]) => define({
        id: `transform.align${label.replace(/\s+/g, '')}`,
        label: `Align ${label}`,
        category: 'Transform',
        tier: 'advanced', // 0.6.2
        description: `Align the selection to its ${label.toLowerCase()} reference on the world ${mode[0].toUpperCase()} axis`,
        enabled: (ctx) => editingAllowed(ctx) && ctx.selectionCount >= 2,
        disabledReason: (ctx) => (ctx.selectionCount >= 2 ? null : 'Select at least 2 bricks'),
        execute: () => surfaceCall('alignSelection', 'Alignment is not available on this surface', (alignSelection) => {
            alignSelection(mode);
            feedback.show(`Aligned ${label}`);
        })
    }));

    const distributeActions = ['x', 'y', 'z'].map((axis) => define({
        id: `transform.distribute${axis.toUpperCase()}`,
        label: `Distribute ${axis.toUpperCase()}`,
        category: 'Transform',
        tier: 'advanced', // 0.6.2
        description: `Distribute the selection's centers evenly along world ${axis.toUpperCase()}`,
        enabled: (ctx) => editingAllowed(ctx) && ctx.selectionCount >= 3,
        disabledReason: (ctx) => (ctx.selectionCount >= 3 ? null : 'Select at least 3 bricks'),
        execute: () => surfaceCall('distributeSelection', 'Distribution is not available on this surface', (distributeSelection) => {
            distributeSelection(axis);
            feedback.show(`Distributed ${axis.toUpperCase()}`);
        })
    }));

    const groupAction = (suffix, label, methodName, unavailable, requirement, reason, done, tier = 'advanced') => define({
        id: `group.${suffix}`,
        label,
        category: 'Groups',
        tier, // 0.6.2 — every group operation is Advanced except the
              // entry point itself (group.create, called with 'common')
        description: `${label} — operates on the resolved selection or the selected group`,
        enabled: (ctx) => editingAllowed(ctx) && requirement(ctx),
        disabledReason: (ctx) => (requirement(ctx) ? null : reason(ctx)),
        execute: () => surfaceCall(methodName, unavailable, (method) => {
            method();
            feedback.show(done);
        })
    });

    return [
        // ----------------------------------------------------- Selection
        define({
            id: 'selection.selectAll',
            label: 'Select All',
            category: 'Selection',
            shortcut: 'Ctrl/Cmd+A',
            keys: [{ key: 'a', ctrl: true }],
            description: 'Select every brick in the active document',
            enabled: (ctx) => !ctx.gestureActive,
            execute: () => surfaceCall('selectAll', 'Select All is not available on this surface', (selectAll) => {
                selectAll();
                feedback.show('Selected all bricks');
            })
        }),
        define({
            id: 'selection.clear',
            label: 'Clear Selection',
            category: 'Selection',
            shortcut: 'Esc',
            keys: [{ key: 'escape' }],
            description: 'Clear the current selection',
            enabled: (ctx) => ctx.hasSelection && !ctx.gestureActive,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('clearSelection', 'Clear Selection is not available on this surface', (clearSelection) => {
                clearSelection();
                feedback.show('Selection cleared');
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
            label: 'Duplicate',
            category: 'Selection',
            shortcut: 'Ctrl/Cmd+D',
            keys: [{ key: 'd', ctrl: true }],
            description: 'Duplicate the selected bricks or structure placement (one undo step)',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('duplicateSelection', 'Duplicate is not available on this surface', (duplicateSelection) => {
                const newId = duplicateSelection();
                // 0.6.2 — "what happens next": name the next likely
                // action instead of only confirming the last one, the
                // same contextual-hint posture the placement/collision
                // feedback strings already used before this milestone.
                feedback.show(newId ? 'Copy created — R to rotate, drag to move' : 'Nothing to duplicate');
            })
        }),
        define({
            id: 'selection.delete',
            label: 'Delete Selection',
            category: 'Selection',
            shortcut: 'Del',
            keys: [{ key: 'delete' }, { key: 'backspace' }],
            description: 'Delete the selected bricks, or the selected structure placement (one undo step)',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('deleteSelection', 'Delete is not available on this surface', (deleteSelection) => {
                const deleted = deleteSelection();
                feedback.show(deleted !== false ? 'Deleted selection' : 'Nothing to delete');
            })
        }),

        // -------------------------------------------------------- Groups
        groupAction('create', 'Create Group', 'createGroupFromSelection',
            'Groups are not available on this surface',
            (ctx) => ctx.hasSelection, selectionRequired, 'Created group', 'common'),
        define({
            id: 'group.rename',
            label: 'Rename Group',
            category: 'Groups',
            tier: 'advanced', // 0.6.2
            description: 'Rename the selected group',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelectedGroup,
            disabledReason: (ctx) => (ctx.hasSelectedGroup ? null : 'Select a group'),
            execute: () => surfaceCall('renameSelectedGroup', 'Groups are not available on this surface', (rename) => {
                rename();
                feedback.show('Renamed group');
            })
        }),
        groupAction('duplicate', 'Duplicate Group', 'duplicateSelectedGroup',
            'Groups are not available on this surface',
            (ctx) => ctx.hasSelectedGroup, (ctx) => (ctx.hasSelectedGroup ? null : 'Select a group'), 'Duplicated group'),
        groupAction('delete', 'Delete Group', 'deleteSelectedGroup',
            'Groups are not available on this surface',
            (ctx) => ctx.hasSelectedGroup, (ctx) => (ctx.hasSelectedGroup ? null : 'Select a group'), 'Deleted group'),
        groupAction('addSelection', 'Add Selection to Group', 'addSelectionToSelectedGroup',
            'Groups are not available on this surface',
            (ctx) => ctx.hasSelection && ctx.hasSelectedGroup,
            (ctx) => (!ctx.hasSelection ? 'No bricks selected' : 'Select a group'),
            'Added selection to group'),
        groupAction('removeSelection', 'Remove Selection from Group', 'removeSelectionFromSelectedGroup',
            'Groups are not available on this surface',
            (ctx) => ctx.hasSelection && ctx.hasSelectedGroup,
            (ctx) => (!ctx.hasSelection ? 'No bricks selected' : 'Select a group'),
            'Removed selection from group'),

        // ----------------------------------------------------- Clipboard
        define({
            id: 'clipboard.copy',
            label: 'Copy',
            category: 'Clipboard',
            shortcut: 'Ctrl/Cmd+C',
            keys: [{ key: 'c', ctrl: true }],
            description: 'Copy the selected bricks to the clipboard',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('copySelection', 'Clipboard is not available on this surface', (copySelection) => {
                copySelection();
                feedback.show('Copied selection');
            })
        }),
        define({
            id: 'clipboard.paste',
            label: 'Paste',
            category: 'Clipboard',
            shortcut: 'Ctrl/Cmd+V',
            keys: [{ key: 'v', ctrl: true }],
            description: 'Paste the clipboard contents into the document',
            enabled: (ctx) => editingAllowed(ctx) && !ctx.clipboardEmpty,
            disabledReason: (ctx) => (ctx.clipboardEmpty ? 'Clipboard is empty' : null),
            execute: () => surfaceCall('paste', 'Clipboard is not available on this surface', (paste) => {
                paste();
                feedback.show('Pasted');
            })
        }),

        // --------------------------------------------------- Structure
        // 0.4.2 — Structure Extraction & Blueprint Creation. Gated
        // exactly like clipboard.copy (any brick selection will do)
        // EXCEPT a StructurePlacement selection, which is never eligible
        // — see application/CreateStructureFromSelectionUseCase.js's own
        // header on why that stays a distinct, larger operation. `ui`
        // supplies the metadata prompt (name/category/description);
        // a surface without one degrades to feedback, same as every
        // other ui.* hook here.
        //
        // 0.4.3 — Personal Blueprint Library. Extraction itself stays
        // exactly what 0.4.2 made it — a pure, unpersisted observation —
        // this action just chains ONE more step after it returns a valid
        // Structure: session.saveStructureToPersonalLibrary(structure).
        // A surface built without that method (or without the optional
        // ui.onPersonalLibraryChanged() refresh hook) degrades to
        // 0.4.2's original "Created" feedback, never throwing.
        define({
            id: 'structure.createFromSelection',
            label: 'Create Structure',
            category: 'Structure',
            description: 'Create a reusable Structure from the selected bricks, normalized to its own local origin',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection && !ctx.selectionIsStructurePlacement,
            disabledReason: (ctx) => {
                if (!ctx.hasSelection) return 'No bricks selected';
                if (ctx.selectionIsStructurePlacement) return 'Create Structure requires brick selections only';
                return null;
            },
            execute: () => surfaceCall('createStructureFromSelection', 'Create Structure is not available on this surface', (createStructureFromSelection) => {
                if (typeof ui.promptCreateStructure !== 'function') {
                    feedback.show('Create Structure is not available on this surface');
                    return;
                }
                const metadata = ui.promptCreateStructure();
                if (!metadata) {
                    return;
                }
                const structure = createStructureFromSelection(metadata);
                if (!structure) {
                    feedback.show('Nothing to create — select bricks first');
                    return;
                }
                const saved = typeof session.saveStructureToPersonalLibrary === 'function'
                    && session.saveStructureToPersonalLibrary(structure);
                if (saved && typeof ui.onPersonalLibraryChanged === 'function') {
                    ui.onPersonalLibraryChanged();
                }
                feedback.show(saved ? `Saved "${structure.name}" to My Structures` : `Created "${structure.name}"`);
            })
        }),

        // ----------------------------------------------------- Transform
        nudge('Right', 'Right', '→', 'arrowright', { x: 1, y: 0, z: 0 }, 'x'),
        nudge('Left', 'Left', '←', 'arrowleft', { x: -1, y: 0, z: 0 }, 'x'),
        nudge('Forward', 'Forward', '↑', 'arrowup', { x: 0, y: 0, z: -1 }, 'z'),
        nudge('Back', 'Back', '↓', 'arrowdown', { x: 0, y: 0, z: 1 }, 'z'),
        nudge('Up', 'Up', 'PgUp', 'pageup', { x: 0, y: 1, z: 0 }, 'y'),
        nudge('Down', 'Down', 'PgDn', 'pagedown', { x: 0, y: -1, z: 0 }, 'y'),
        define({
            id: 'transform.rotateClockwise',
            label: 'Rotate Clockwise',
            category: 'Transform',
            tier: 'primary', // 0.6.2
            shortcut: 'R',
            keys: [{ key: 'r' }],
            description: 'Rotate the selection +90° around its pivot',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('rotateSelection', 'Rotate is not available on this surface', (rotateSelection) => {
                rotateSelection(90);
                feedback.show('Rotated +90°');
            })
        }),
        define({
            id: 'transform.rotateCounterClockwise',
            label: 'Rotate Counter-Clockwise',
            category: 'Transform',
            tier: 'primary', // 0.6.2
            shortcut: 'Shift+R',
            keys: [{ key: 'r', shift: true }],
            description: 'Rotate the selection −90° around its pivot',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => surfaceCall('rotateSelection', 'Rotate is not available on this surface', (rotateSelection) => {
                rotateSelection(-90);
                feedback.show('Rotated −90°');
            })
        }),
        ...alignActions,
        ...distributeActions,
        define({
            id: 'transform.numeric',
            label: 'Numeric Transform Panel',
            category: 'Transform',
            tier: 'advanced', // 0.6.2
            description: 'Focus the numeric transform input in the sidebar',
            enabled: (ctx) => editingAllowed(ctx),
            execute: () => {
                if (typeof ui.focusNumeric === 'function') {
                    ui.focusNumeric();
                    feedback.show('Numeric transform ready');
                } else {
                    feedback.show('Numeric panel is not available on this surface');
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
            label: 'Repeat Selection',
            category: 'Transform',
            tier: 'advanced',
            description: 'Focus the Repeat panel in the sidebar',
            enabled: (ctx) => editingAllowed(ctx) && ctx.hasSelection,
            disabledReason: selectionRequired,
            execute: () => {
                if (typeof ui.focusRepeat === 'function') {
                    ui.focusRepeat();
                    feedback.show('Repeat panel ready');
                } else {
                    feedback.show('Repeat panel is not available on this surface');
                }
            }
        }),

        // ------------------------------------------------------- History
        define({
            id: 'history.undo',
            label: 'Undo',
            category: 'History',
            shortcut: 'Ctrl/Cmd+Z',
            keys: [{ key: 'z', ctrl: true }],
            description: 'Undo the last operation',
            enabled: (ctx) => ctx.canUndo && !ctx.gestureActive,
            disabledReason: (ctx) => (ctx.canUndo ? null : 'Nothing to undo'),
            execute: () => surfaceCall('undo', 'Undo is not available on this surface', (undo) => {
                undo();
                feedback.show('Undone');
            })
        }),
        define({
            id: 'history.redo',
            label: 'Redo',
            category: 'History',
            shortcut: 'Ctrl/Cmd+Shift+Z',
            keys: [{ key: 'z', ctrl: true, shift: true }, { key: 'y', ctrl: true }],
            description: 'Redo the last undone operation',
            enabled: (ctx) => ctx.canRedo && !ctx.gestureActive,
            disabledReason: (ctx) => (ctx.canRedo ? null : 'Nothing to redo'),
            execute: () => surfaceCall('redo', 'Redo is not available on this surface', (redo) => {
                redo();
                feedback.show('Redone');
            })
        }),

        // ------------------------------------------------------------ UI
        define({
            id: 'ui.commandPalette',
            label: 'Command Palette',
            category: 'Interface',
            shortcut: 'Ctrl/Cmd+K',
            keys: [{ key: 'k', ctrl: true }],
            description: 'Open the command palette',
            execute: () => {
                if (typeof ui.togglePalette === 'function') {
                    ui.togglePalette();
                }
            }
        })
    ];
}
