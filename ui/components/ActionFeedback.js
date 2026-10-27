// Transient single-line action feedback (0.1.50). The consistent
// messaging half of the consolidated UX: actions report what happened
// ("Aligned Left", "Rotated +90°", "Copied selection") through the
// feedback object bound in createStandardActions(); the host view sets
// this component's props and auto-hides after a moment.
//
// Deliberately tiny — one line, aria-live polite, no queue, no toast
// framework. If this ever needs more, that's evidence for a real
// notification subsystem; until then, less is the architecture.
export default {
    name: 'ActionFeedback',
    props: {
        message: {
            type: String,
            default: ''
        },
        visible: {
            type: Boolean,
            default: false
        }
    },
    template: `
        <div
            v-if="visible && message"
            aria-live="polite"
            :style="{
                position: 'absolute',
                left: '50%',
                bottom: '14px',
                transform: 'translateX(-50%)',
                zIndex: 35,
                pointerEvents: 'none',
                // The theme's own pair, so the text reads in light and dark
                // alike (a fixed dark background left --ink's dark text unreadable).
                background: 'var(--surface)',
                border: '1px solid var(--line-strong)',
                borderLeft: '3px solid var(--accent)',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.18)',
                padding: '6px 14px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: 'var(--ink)',
                // One line when it fits; wrapped inside the view on a phone.
                width: 'max-content',
                maxWidth: 'calc(100% - 32px)',
                boxSizing: 'border-box',
                textAlign: 'center'
            }"
        >{{ message }}</div>
    `
};
