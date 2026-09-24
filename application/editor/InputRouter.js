// Minimal input routing (0.1.50). Pure helpers for the Editor's keyboard handling: shortcut matching
// (matchShortcut(event, registry) normalizes a raw DOM keyboard event
// and resolves it against the EditorActionRegistry — the single source
// of truth for shortcuts, the same registry that feeds the palette, the
// sidebar, and docs/user/ControlsReference.md) and text-input detection,
// so no view re-derives either. The Escape priority chain itself lives
// in EditorView's keydown handler.
export const InputRouter = Object.freeze({
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
