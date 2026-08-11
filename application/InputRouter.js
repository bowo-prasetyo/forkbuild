// Minimal input routing, introduced 0.1.50 where the accumulation of
// Escape consumers (numeric fields, command palette, gizmo gestures,
// marquee, selection) and the move to registry-driven shortcuts made
// the fragmentation real enough to justify it — and not before.
//
// Two jobs, both pure:
//
// 1. Escape priority. Escape is context-sensitive and the priority is
//    explicit, in this order:
//        input (active text field) > palette > gizmo gesture >
//        marquee > selection
//    resolveEscapeTarget(state) answers WHICH layer owns a given
//    Escape; views implement the consequence. No scattered
//    if (key === 'Escape') chains.
//
// 2. Shortcut matching. matchShortcut(event, registry) normalizes a raw
//    DOM keyboard event and resolves it against the EditorActionRegistry
//    — the single source of truth for shortcuts (same registry feeds the
//    palette, the sidebar, and docs/user/ControlsReference.md). Text
//    input detection lives here so no view re-derives it.
export const InputRouter = Object.freeze({
    ESCAPE_PRIORITY: Object.freeze(['input', 'palette', 'gesture', 'marquee', 'selection']),

    resolveEscapeTarget({
        textInputFocused = false,
        paletteOpen = false,
        gestureActive = false,
        marqueeActive = false
    } = {}) {
        if (textInputFocused) return 'input';
        if (paletteOpen) return 'palette';
        if (gestureActive) return 'gesture';
        if (marqueeActive) return 'marquee';
        return 'selection';
    },

    isTextInputTarget(target) {
        if (!target) {
            return false;
        }
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
    },

    // Ctrl and Cmd are treated as the same modifier (macOS parity);
    // keys are lowercased so 'R' with Shift still resolves by its
    // shift flag, not by case.
    toNormalizedKeyEvent(rawEvent) {
        if (!rawEvent) {
            return null;
        }
        return {
            key: (rawEvent.key || '').toLowerCase(),
            ctrl: !!(rawEvent.ctrlKey || rawEvent.metaKey),
            shift: !!rawEvent.shiftKey,
            alt: !!rawEvent.altKey
        };
    },

    // Key-repeat never re-triggers an action.
    matchShortcut(rawEvent, registry) {
        if (!rawEvent || rawEvent.repeat || !registry) {
            return null;
        }
        return registry.resolveShortcut(InputRouter.toNormalizedKeyEvent(rawEvent));
    }
});
