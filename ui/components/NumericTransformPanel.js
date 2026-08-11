import { TransformInput } from '../../application/TransformInput.js';

// Numeric transform input surface (0.1.49).
//
// An input surface, not a transform system — and deliberately not a
// MODE. There is no "numeric mode" application state anywhere: the panel
// parses exact translation/rotation intent (TransformInput, pure, in
// application/) and hands one structured intent to the host view's
// apply() callback, which routes it to the session's
// applyNumericTransform — the same transform pipeline keyboard, gizmo,
// and alignment use. No numeric-specific command exists.
//
// Semantics implemented here:
//   - Absolute / Offset toggle. Absolute translation targets the
//     selection PIVOT; absolute rotation targets the PRIMARY brick's
//     orientation — both preserve internal geometry. Offset applies
//     plain deltas. (The application layer decides what these mean; the
//     panel only reports the choice.)
//   - Empty field = "unchanged", never silent zero.
//   - Any invalid field blocks the whole Apply (marked red); nothing
//     reaches the transform layer, so invalid input creates zero
//     history entries.
//   - One Apply = one intent = at most one TransformSelectionCommand.
//   - Enter applies, Escape clears (both stopped here so the global
//     Escape-clears-selection handler never fires from panel typing).
//   - Fields clear after a successful apply; the panel is a "next
//     operation" surface, not a live property editor.
export default {
    name: 'NumericTransformPanel',
    props: {
        selectionCount: {
            type: Number,
            default: 0
        },
        apply: {
            type: Function,
            required: true
        }
    },
    data() {
        return {
            xText: '',
            yText: '',
            zText: '',
            rotationText: '',
            absolute: true,
            invalidFields: []
        };
    },
    computed: {
        enabled() {
            return this.selectionCount >= 1;
        }
    },
    methods: {
        setMode(absolute) {
            this.absolute = absolute;
        },
        onApply() {
            if (!this.enabled) {
                return;
            }
            const parsed = TransformInput.parsePanelInput({
                x: this.xText,
                y: this.yText,
                z: this.zText,
                rotation: this.rotationText
            });
            if (!parsed.valid) {
                this.invalidFields = parsed.invalidFields;
                return;
            }
            this.invalidFields = [];
            if (!parsed.translation && parsed.rotation === null) {
                // Nothing entered: nothing to apply, nothing to clear.
                return;
            }
            this.apply(
                { translation: parsed.translation, rotation: parsed.rotation },
                { absolute: this.absolute }
            );
            this.xText = '';
            this.yText = '';
            this.zText = '';
            this.rotationText = '';
        },
        onClear() {
            this.xText = '';
            this.yText = '';
            this.zText = '';
            this.rotationText = '';
            this.invalidFields = [];
        },
        onFieldKeydown(event) {
            if (event.key === 'Enter') {
                event.stopPropagation();
                this.onApply();
            } else if (event.key === 'Escape') {
                event.stopPropagation();
                this.onClear();
            }
        },
        inputStyle(name) {
            const invalid = this.invalidFields.includes(name);
            return {
                width: '100%',
                padding: '3px 6px',
                background: this.enabled ? '#121212' : '#181818',
                border: '1px solid ' + (invalid ? '#e74c3c' : '#2a2a2a'),
                borderRadius: '3px',
                color: this.enabled ? '#e0e0e0' : '#606060',
                fontFamily: 'monospace',
                fontSize: '12px'
            };
        },
        labelStyle() {
            return {
                width: '16px',
                flexShrink: 0,
                color: '#909090',
                fontFamily: 'monospace',
                fontSize: '12px'
            };
        },
        rowStyle() {
            return { display: 'flex', alignItems: 'center', gap: '6px' };
        },
        modeButtonStyle(active) {
            return {
                flex: 1,
                padding: '3px 6px',
                background: active ? '#234433' : '#1f1f1f',
                border: '1px solid ' + (active ? '#4caf7d' : '#3a3a3a'),
                borderRadius: '3px',
                color: active ? '#ffffff' : '#b0b0b0',
                fontSize: '11px',
                fontFamily: 'monospace',
                cursor: this.enabled ? 'pointer' : 'not-allowed'
            };
        },
        actionButtonStyle(primary) {
            return {
                flex: 1,
                padding: '4px 6px',
                background: primary ? (this.enabled ? '#4caf7d' : '#2a3f33') : '#1f1f1f',
                border: '1px solid ' + (primary ? '#4caf7d' : '#3a3a3a'),
                borderRadius: '3px',
                color: primary ? '#121212' : '#b0b0b0',
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: primary ? '600' : '400',
                cursor: this.enabled ? 'pointer' : 'not-allowed'
            };
        }
    },
    template: `
        <div :style="{ display: 'flex', flexDirection: 'column', gap: '6px', opacity: enabled ? 1 : 0.55 }">
            <div :style="{ display: 'flex', gap: '4px' }">
                <button
                    :disabled="!enabled"
                    :style="modeButtonStyle(absolute)"
                    title="Values are targets: translation targets the selection pivot, rotation targets the primary brick's orientation"
                    @click="setMode(true)"
                >Absolute</button>
                <button
                    :disabled="!enabled"
                    :style="modeButtonStyle(!absolute)"
                    title="Values are deltas applied to every selected brick"
                    @click="setMode(false)"
                >Offset</button>
            </div>
            <div :style="rowStyle()">
                <span :style="labelStyle()">X</span>
                <input
                    type="text"
                    :disabled="!enabled"
                    :style="inputStyle('x')"
                    :title="absolute ? 'Target X for the selection pivot' : 'Move selection along X'"
                    placeholder=""
                    v-model="xText"
                    @keydown="onFieldKeydown"
                />
            </div>
            <div :style="rowStyle()">
                <span :style="labelStyle()">Y</span>
                <input
                    type="text"
                    :disabled="!enabled"
                    :style="inputStyle('y')"
                    :title="absolute ? 'Target Y for the selection pivot' : 'Move selection along Y'"
                    placeholder=""
                    v-model="yText"
                    @keydown="onFieldKeydown"
                />
            </div>
            <div :style="rowStyle()">
                <span :style="labelStyle()">Z</span>
                <input
                    type="text"
                    :disabled="!enabled"
                    :style="inputStyle('z')"
                    :title="absolute ? 'Target Z for the selection pivot' : 'Move selection along Z'"
                    placeholder=""
                    v-model="zText"
                    @keydown="onFieldKeydown"
                />
            </div>
            <div :style="rowStyle()">
                <span :style="labelStyle()">R</span>
                <input
                    type="text"
                    :disabled="!enabled"
                    :style="inputStyle('rotation')"
                    :title="absolute ? 'Target rotation for the primary brick (all members turn by the same delta)' : 'Rotate around the selection pivot (degrees)'"
                    placeholder=""
                    v-model="rotationText"
                    @keydown="onFieldKeydown"
                />
            </div>
            <div :style="{ display: 'flex', gap: '4px' }">
                <button
                    :disabled="!enabled"
                    :style="actionButtonStyle(true)"
                    title="Apply as one operation (one undo step)"
                    @click="onApply"
                >Apply</button>
                <button
                    :disabled="!enabled"
                    :style="actionButtonStyle(false)"
                    title="Clear the fields"
                    @click="onClear"
                >Clear</button>
            </div>
        </div>
    `
};
