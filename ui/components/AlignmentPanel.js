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
import { t } from '../i18n/i18n.js';
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
                    { mode: 'x-min', label: t('alignmentPanel.xMin'), title: t('alignmentPanel.xMin.hint') },
                    { mode: 'x-center', label: t('alignmentPanel.xCenter'), title: t('alignmentPanel.xCenter.hint') },
                    { mode: 'x-max', label: t('alignmentPanel.xMax'), title: t('alignmentPanel.xMax.hint') }
                ],
                [
                    { mode: 'y-min', label: t('alignmentPanel.yMin'), title: t('alignmentPanel.yMin.hint') },
                    { mode: 'y-center', label: t('alignmentPanel.yCenter'), title: t('alignmentPanel.yCenter.hint') },
                    { mode: 'y-max', label: t('alignmentPanel.yMax'), title: t('alignmentPanel.yMax.hint') }
                ],
                [
                    { mode: 'z-min', label: t('alignmentPanel.zMin'), title: t('alignmentPanel.zMin.hint') },
                    { mode: 'z-center', label: t('alignmentPanel.zCenter'), title: t('alignmentPanel.zCenter.hint') },
                    { mode: 'z-max', label: t('alignmentPanel.zMax'), title: t('alignmentPanel.zMax.hint') }
                ]
            ];
        },
        distributeAxes() {
            return [
                { axis: 'x', label: t('alignmentPanel.distributeX'), title: t('alignmentPanel.distributeX.hint') },
                { axis: 'y', label: t('alignmentPanel.distributeY'), title: t('alignmentPanel.distributeY.hint') },
                { axis: 'z', label: t('alignmentPanel.distributeZ'), title: t('alignmentPanel.distributeZ.hint') }
            ];
        }
    },
    methods: {
        t,
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
                :style="{ display: 'flex', gap: '4px', flexWrap: 'wrap' }"
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
            <div :style="{ display: 'flex', gap: '4px', flexWrap: 'wrap' }">
                <button
                    v-for="distributeAxis in distributeAxes"
                    :key="distributeAxis.axis"
                    :disabled="!canDistribute"
                    :title="canDistribute ? distributeAxis.title : t('alignmentPanel.needsThree', { hint: distributeAxis.title })"
                    :style="buttonStyle(canDistribute)"
                    @click="onDistribute(distributeAxis.axis)"
                >{{ distributeAxis.label }}</button>
            </div>
        </div>
    `
};
