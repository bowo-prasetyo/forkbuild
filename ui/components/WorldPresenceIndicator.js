// 0.2.99 — World Collaboration UX.
//
// The "compact, non-intrusive" presence indicator the design
// conversation asked for — deliberately as small as ui/components/
// CompassIndicator.js (0.2.94): a single glanceable fact
// ("👥 N online"), never a roster of its own. Clicking it is the one
// interaction it offers; ui/views/WorldView.js wires that click to
// opening ui/components/WorldMembersPanel.js, the same panel a
// "Members" button elsewhere in the toolbar also opens — one
// collaboration surface, two entry points, never two implementations.
//
// `onlineCount` is handed down already computed (see WorldView.js's
// own worldOnlineCount) — this component never counts anything itself,
// exactly the same "purely presentational, never its own polling"
// discipline CompassIndicator's own header documents.
export default {
    name: 'WorldPresenceIndicator',
    props: {
        onlineCount: {
            type: Number,
            default: 0
        }
    },
    emits: ['open'],
    template: `
        <button
            type="button"
            class="world-presence-indicator"
            aria-label="World presence — open Members panel"
            @click="$emit('open')"
        >
            👥 <span class="world-presence-indicator-count">{{ onlineCount }}</span> online
        </button>
    `
};
