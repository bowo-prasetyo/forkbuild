import { EditorActionRegistry } from '../../application/EditorActionRegistry.js';

// The command palette (0.1.50): one searchable list over the
// EditorActionRegistry — the same definitions that drive keyboard
// shortcuts, the sidebar, and docs/user/ControlsReference.md. No
// second shortcut table, no second operation list.
//
// Behavior: substring search across label/category/id, category
// grouping, arrow-key navigation, Enter executes (only when enabled),
// Escape closes. Disabled actions stay visible with their
// disabledReason — discoverability includes knowing WHY something is
// unavailable. All search/grouping logic lives on EditorActionRegistry
// itself, which is what tests/CommandPalette.test.js exercises; this
// component is the thin visual layer.
export default {
    name: 'CommandPalette',
    props: {
        registry: {
            type: Object,
            required: true
        },
        getContext: {
            type: Function,
            required: true
        }
    },
    emits: ['close'],
    data() {
        return {
            query: '',
            activeIndex: 0
        };
    },
    computed: {
        context() {
            return this.getContext();
        },
        filtered() {
            return this.registry.findMatching(this.query);
        },
        rows() {
            const rows = [];
            let index = 0;
            for (const group of EditorActionRegistry.groupByCategory(this.filtered)) {
                rows.push({ header: true, category: group.category });
                for (const action of group.actions) {
                    rows.push({ header: false, action, index });
                    index += 1;
                }
            }
            return rows;
        }
    },
    watch: {
        query() {
            this.activeIndex = 0;
        }
    },
    mounted() {
        this.$nextTick(() => {
            if (this.$refs.search) {
                this.$refs.search.focus();
            }
        });
    },
    methods: {
        actionEnabled(action) {
            return action.enabled(this.context);
        },
        reasonFor(action) {
            if (!action.disabledReason) {
                return null;
            }
            return action.disabledReason(this.context);
        },
        rowStyle(row) {
            if (row.header) {
                return {
                    padding: '6px 10px 2px',
                    fontSize: '10px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#707070'
                };
            }
            const enabled = this.actionEnabled(row.action);
            const active = row.index === this.activeIndex;
            return {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
                padding: '6px 10px',
                border: 'none',
                borderRadius: '3px',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: '13px',
                cursor: enabled ? 'pointer' : 'not-allowed',
                background: active ? '#234433' : 'transparent',
                color: enabled ? (active ? '#ffffff' : '#d0d0d0') : '#606060'
            };
        },
        onKeydown(event) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                this.activeIndex = Math.max(this.activeIndex - 1, 0);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                this.executeAt(this.activeIndex);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.$emit('close');
            }
        },
        executeAt(index) {
            const action = this.filtered[index];
            if (!action || !this.actionEnabled(action)) {
                return;
            }
            this.registry.execute(action.id, this.context);
            this.$emit('close');
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="Command palette"
            :style="{
                position: 'fixed',
                inset: 0,
                zIndex: 60,
                background: 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '12vh'
            }"
            @click.self="$emit('close')"
        >
            <div
                :style="{
                    width: '460px',
                    maxWidth: '90vw',
                    maxHeight: '60vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '6px',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }"
            >
                <input
                    ref="search"
                    v-model="query"
                    type="text"
                    placeholder="Type a command..."
                    aria-label="Search commands"
                    @keydown="onKeydown"
                    :style="{
                        padding: '10px 12px',
                        background: '#121212',
                        border: 'none',
                        borderBottom: '1px solid #2a2a2a',
                        color: '#e0e0e0',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        outline: 'none'
                    }"
                />
                <div :style="{ overflowY: 'auto', padding: '6px' }">
                    <div v-if="rows.length === 0" :style="{ padding: '12px 10px', color: '#707070', fontSize: '12px' }">
                        No matching commands.
                    </div>
                    <template v-for="(row, rowIndex) in rows" :key="rowIndex">
                        <div v-if="row.header" :style="rowStyle(row)">{{ row.category }}</div>
                        <button
                            v-else
                            type="button"
                            :disabled="!actionEnabled(row.action)"
                            :aria-disabled="!actionEnabled(row.action)"
                            :title="actionEnabled(row.action) ? row.action.description : reasonFor(row.action)"
                            :style="rowStyle(row)"
                            @click="executeAt(row.index)"
                            @mouseenter="activeIndex = row.index"
                        >
                            <span>
                                {{ row.action.label }}
                                <span
                                    v-if="!actionEnabled(row.action) && reasonFor(row.action)"
                                    :style="{ marginLeft: '8px', fontSize: '11px', color: '#8a6d3b' }"
                                >— {{ reasonFor(row.action) }}</span>
                            </span>
                            <span
                                v-if="row.action.shortcut"
                                :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070', flexShrink: 0 }"
                            >{{ row.action.shortcut }}</span>
                        </button>
                    </template>
                </div>
            </div>
        </div>
    `
};
