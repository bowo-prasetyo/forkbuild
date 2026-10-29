// The toolbar's Undo and Redo (docs/reviews/EditorUsability-2026-10-29.md,
// P1-3): the registry's history.undo and history.redo, the same actions as
// Ctrl/Cmd+Z and the palette's, each titled with what it will undo ("Undo
// Recolor 5 Bricks (Ctrl/Cmd+Z)") or why it can't ("Nothing to undo").
import { displayText, t } from '../../i18n/i18n.js';

export function historyButton(registry, id, ctx) {
    const action = registry.get(id);
    if (!action) return { enabled: false, title: '' };
    if (!action.enabled(ctx)) {
        return { enabled: false, title: action.disabledReason ? displayText(action.disabledReason(ctx)) : '' };
    }
    const label = action.contextualLabel ? action.contextualLabel(ctx) : null;
    return {
        enabled: true,
        title: t('toolbar.historyTitle', { label: label ? displayText(label) : t(action.label), shortcut: action.shortcut })
    };
}

export function historyButtons(registry, ctx) {
    return { undo: historyButton(registry, 'history.undo', ctx), redo: historyButton(registry, 'history.redo', ctx) };
}
