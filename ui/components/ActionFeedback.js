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
                background: 'rgba(18, 18, 18, 0.92)',
                border: '1px solid #3a3a3a',
                borderLeft: '3px solid #4caf7d',
                borderRadius: '4px',
                padding: '6px 14px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#e0e0e0',
                whiteSpace: 'nowrap'
            }"
        >{{ message }}</div>
    `
};
