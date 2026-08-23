// 0.5.7 — World View UX & Progressive Exploration.
//
// A generic, dumb "title + count, collapse/expand" wrapper — the visual
// half of application/WorldViewNavigationState.js's per-section
// collapsed/expanded bookkeeping. Deliberately owns NO state of its
// own: `collapsed` is a prop, toggling emits `toggle` for the host to
// act on (exactly the same controlled-component shape every other
// dumb panel in this codebase already follows — see
// ui/components/LocationsPanel.js's own header, "dumb panel, smart
// host"). This is what lets the SAME collapsed/expanded choice survive
// a primary-mode switch: the state lives in WorldViewNavigationState,
// not in this component's own local data, so unmounting and
// remounting this component (which happens every time its parent
// section toggles visibility) never forgets it.
//
// Used for World View's "Nearby ___" groups (Places / Landmarks /
// People) — see ui/views/WorldView.js's own Explore-mode content —
// but intentionally generic: nothing here mentions places, landmarks,
// or people.
export default {
    name: 'CollapsibleSection',
    props: {
        title: {
            type: String,
            required: true
        },
        // Shown next to the title when non-null, e.g. "Nearby Places  3"
        // — omit (null) for a section with no natural count.
        count: {
            type: Number,
            default: null
        },
        collapsed: {
            type: Boolean,
            default: true
        }
    },
    emits: ['toggle'],
    methods: {
        onToggleClick() {
            this.$emit('toggle', !this.collapsed);
        }
    },
    template: `
        <div class="collapsible-section" :class="{ 'collapsible-section--collapsed': collapsed }">
            <button
                type="button"
                class="collapsible-section-header"
                :aria-expanded="!collapsed"
                @click="onToggleClick"
            >
                <span class="collapsible-section-caret">{{ collapsed ? '▸' : '▾' }}</span>
                <span class="collapsible-section-title">{{ title }}</span>
                <span v-if="count !== null" class="collapsible-section-count">{{ count }}</span>
            </button>
            <div v-if="!collapsed" class="collapsible-section-body">
                <slot></slot>
            </div>
        </div>
    `
};
