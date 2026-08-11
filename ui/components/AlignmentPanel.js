// Compact alignment & distribution surface (0.1.48).
//
// Purely presentational, deliberately dumb about geometry: it knows the
// operation identifiers ('x-min' … 'z-max' for alignment, 'x'/'y'/'z'
// for distribution) and nothing about what they mean — the application
// layer decides that. Nine alignment buttons (world-axis edges/centers,
// never camera directions) plus three center-distribution buttons.
//
// Enable/disable state mirrors the operation requirements:
//   1 selected  -> panel hidden by the host view
//   2 selected  -> alignment enabled, distribution disabled
//   3+ selected -> everything enabled
// The service still defensively no-ops if called programmatically with
// an insufficient selection. No keyboard shortcuts in 0.1.48 — by
// design; a scoped command palette is 0.1.50 territory.
//
// Inline styles (same self-contained precedent as TransformFeedback) so
// the component drops into both views without touching main.css.
export default {
    name: 'AlignmentPanel',
    props: {
        selectionCount: {
            type: Number,
            default: 0
        },
        align: {
            type: Function,
            required: true
        },
        distribute: {
            type: Function,
            required: true
        }
    },
    computed: {
        canAlign() {
            return this.selectionCount >= 2;
        },
        canDistribute() {
            return this.selectionCount >= 3;
        },
        alignRows() {
            return [
                [
                    { mode: 'x-min', label: '← Left', title: 'Align left edges (world X minimum)' },
                    { mode: 'x-center', label: 'Center X', title: 'Align centers on world X' },
                    { mode: 'x-max', label: 'Right →', title: 'Align right edges (world X maximum)' }
                ],
                [
                    { mode: 'y-min', label: '↓ Bottom', title: 'Align bottom edges (world Y minimum)' },
                    { mode: 'y-center', label: 'Center Y', title: 'Align centers on world Y' },
                    { mode: 'y-max', label: 'Top ↑', title: 'Align top edges (world Y maximum)' }
                ],
                [
                    { mode: 'z-min', label: 'Front', title: 'Align front edges (world Z minimum)' },
                    { mode: 'z-center', label: 'Center Z', title: 'Align centers on world Z' },
                    { mode: 'z-max', label: 'Back', title: 'Align back edges (world Z maximum)' }
                ]
            ];
        },
        distributeAxes() {
            return [
                { axis: 'x', label: 'Distribute X', title: 'Distribute centers evenly along world X' },
                { axis: 'y', label: 'Distribute Y', title: 'Distribute centers evenly along world Y' },
                { axis: 'z', label: 'Distribute Z', title: 'Distribute centers evenly along world Z' }
            ];
        }
    },
    methods: {
        onAlign(mode) {
            if (this.canAlign) {
                this.align(mode);
            }
        },
        onDistribute(axis) {
            if (this.canDistribute) {
                this.distribute(axis);
            }
        },
        buttonStyle(enabled) {
            return {
                flex: 1,
                padding: '4px 6px',
                background: enabled ? '#1f1f1f' : '#181818',
                border: '1px solid ' + (enabled ? '#3a3a3a' : '#262626'),
                borderRadius: '3px',
                color: enabled ? '#d0d0d0' : '#606060',
                fontSize: '11px',
                fontFamily: 'monospace',
                cursor: enabled ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap'
            };
        }
    },
    template: `
        <div :style="{ display: 'flex', flexDirection: 'column', gap: '6px' }">
            <div
                v-for="(row, rowIndex) in alignRows"
                :key="'align-' + rowIndex"
                :style="{ display: 'flex', gap: '4px' }"
            >
                <button
                    v-for="operation in row"
                    :key="operation.mode"
                    :disabled="!canAlign"
                    :title="operation.title"
                    :style="buttonStyle(canAlign)"
                    @click="onAlign(operation.mode)"
                >{{ operation.label }}</button>
            </div>
            <div :style="{ display: 'flex', gap: '4px' }">
                <button
                    v-for="distributeAxis in distributeAxes"
                    :key="distributeAxis.axis"
                    :disabled="!canDistribute"
                    :title="distributeAxis.title + (canDistribute ? '' : ' (select 3+ bricks)')"
                    :style="buttonStyle(canDistribute)"
                    @click="onDistribute(distributeAxis.axis)"
                >{{ distributeAxis.label }}</button>
            </div>
        </div>
    `
};
