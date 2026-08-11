// Transient transform-gesture feedback overlay (0.1.47).
//
// Shows, while a transform gesture is in flight, exactly what the
// gesture transaction has decided: the mode and axis, the EFFECTIVE snap
// increment (including precision mode), and the snapped delta that will
// be committed:
//
//     Move X • Grid 1              Rotate Y • 15° (precision)
//     Δ +3                         Δ +13.5°
//
// Purely presentational and deliberately lightweight — one small panel,
// inline styles, no persistent HUD system, no state of its own. The
// `feedback` prop is the opaque blob SpatialEditingService builds
// ({ mode, axis, translation, rotation, translationSnap, rotationSnap,
// precise }) and the views pass through untouched; null hides the panel.
// This is the read-only foundation a future numeric-entry milestone
// could build on — numeric INPUT is explicitly not part of 0.1.47.
export default {
    name: 'TransformFeedback',
    props: {
        feedback: {
            type: Object,
            default: null
        }
    },
    computed: {
        visible() {
            return !!this.feedback;
        },
        precise() {
            return !!(this.feedback && this.feedback.precise);
        },
        title() {
            const fb = this.feedback;
            if (!fb) {
                return '';
            }
            const precisionTag = this.precise ? ' (precision)' : '';
            if (fb.mode === 'rotate') {
                const increment = fb.rotationSnap !== null && fb.rotationSnap !== undefined
                    ? `${this.formatNumber(fb.rotationSnap)}°`
                    : 'free';
                return `Rotate Y • ${increment}${precisionTag}`;
            }
            const axisLabel = fb.axis ? fb.axis.toUpperCase() : 'Free';
            const increment = fb.translationSnap !== null && fb.translationSnap !== undefined
                ? `Grid ${this.formatNumber(fb.translationSnap)}`
                : 'Snap off';
            return `Move ${axisLabel} • ${increment}${precisionTag}`;
        },
        lines() {
            const fb = this.feedback;
            if (!fb) {
                return [];
            }
            if (fb.mode === 'rotate') {
                return [`Δ ${this.formatSigned(fb.rotation)}°`];
            }
            if (fb.axis && fb.translation) {
                return [`Δ ${this.formatSigned(fb.translation[fb.axis])}`];
            }
            const translation = fb.translation || { x: 0, y: 0, z: 0 };
            return [
                `ΔX ${this.formatSigned(translation.x)}`,
                `ΔY ${this.formatSigned(translation.y)}`,
                `ΔZ ${this.formatSigned(translation.z)}`
            ];
        }
    },
    methods: {
        formatNumber(value) {
            if (value === null || value === undefined || !Number.isFinite(Number(value))) {
                return '—';
            }
            return String(Number(Number(value).toFixed(4)));
        },
        formatSigned(value) {
            const num = Number(Number(value || 0).toFixed(4));
            return `${num >= 0 ? '+' : ''}${num}`;
        }
    },
    template: `
        <div
            v-if="visible"
            :style="{
                position: 'absolute',
                left: '12px',
                bottom: '12px',
                zIndex: 30,
                pointerEvents: 'none',
                background: 'rgba(18, 18, 18, 0.88)',
                border: '1px solid #3a3a3a',
                borderLeft: '3px solid #4caf7d',
                borderRadius: '4px',
                padding: '8px 12px',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.6',
                color: '#e0e0e0',
                minWidth: '150px'
            }"
        >
            <div :style="{ color: '#4caf7d', fontWeight: '600', marginBottom: '2px' }">{{ title }}</div>
            <div v-for="(line, index) in lines" :key="index" :style="{ color: '#d0d0d0' }">{{ line }}</div>
        </div>
    `
};
