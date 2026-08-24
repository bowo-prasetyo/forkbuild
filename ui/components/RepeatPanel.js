// 0.6.2 — Editor UX Consolidation.
//
// EditorSession#repeatSelection() (application/RepeatSelectionUseCase.js)
// has existed, fully wired and fully tested, since 0.4.9 — this is the
// UI entry point 0.4.9 never built for it. Deliberately styled and
// shaped like ui/components/AlignmentPanel.js right next to it (inline
// styles, dumb about geometry, a `repeat` prop the host view supplies):
// this panel knows count/offset/axis and nothing about collision or
// history — the application layer decides what those mean, exactly
// like every other panel in this family.
//
// count = how many ADDITIONAL copies (the original is never touched);
// offset = the per-copy translation distance along whichever axis
// button is pressed. A blocked batch (RepeatSelectionUseCase's own
// atomic collision check) or an invalid field is reported by the host
// view's feedback toast, never by this panel — it only ever calls
// `repeat()` with parsed, valid numbers.
export default {
    name: 'RepeatPanel',
    props: {
        selectionCount: {
            type: Number,
            default: 0
        },
        repeat: {
            type: Function,
            required: true
        }
    },
    data() {
        return {
            countText: '3',
            offsetText: '2',
            invalid: false
        };
    },
    computed: {
        enabled() {
            return this.selectionCount >= 1;
        }
    },
    methods: {
        onRepeat(axis) {
            if (!this.enabled) {
                return;
            }
            const count = Number.parseInt(this.countText, 10);
            const offsetValue = Number(this.offsetText);
            if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(offsetValue) || offsetValue === 0) {
                this.invalid = true;
                return;
            }
            this.invalid = false;
            const offset = { x: 0, y: 0, z: 0, [axis]: offsetValue };
            this.repeat({ count, offset });
        },
        inputStyle() {
            return {
                width: '48px',
                padding: '3px 6px',
                background: this.enabled ? '#121212' : '#181818',
                border: '1px solid ' + (this.invalid ? '#e74c3c' : '#2a2a2a'),
                borderRadius: '3px',
                color: this.enabled ? '#e0e0e0' : '#606060',
                fontFamily: 'monospace',
                fontSize: '12px'
            };
        },
        labelStyle() {
            return {
                color: '#909090',
                fontFamily: 'monospace',
                fontSize: '11px'
            };
        },
        buttonStyle() {
            return {
                flex: 1,
                padding: '4px 6px',
                background: this.enabled ? '#1f1f1f' : '#181818',
                border: '1px solid ' + (this.enabled ? '#3a3a3a' : '#262626'),
                borderRadius: '3px',
                color: this.enabled ? '#d0d0d0' : '#606060',
                fontSize: '11px',
                fontFamily: 'monospace',
                cursor: this.enabled ? 'pointer' : 'not-allowed'
            };
        }
    },
    template: `
        <div :style="{ display: 'flex', flexDirection: 'column', gap: '6px', opacity: enabled ? 1 : 0.55 }">
            <div :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
                <span :style="labelStyle()">Copies</span>
                <input
                    type="text" class="repeat-panel-count"
                    :disabled="!enabled"
                    :style="inputStyle()"
                    title="How many additional copies to create"
                    v-model="countText"
                />
                <span :style="labelStyle()">Offset</span>
                <input
                    type="text"
                    :disabled="!enabled"
                    :style="inputStyle()"
                    title="Distance between each copy, along whichever axis you click below"
                    v-model="offsetText"
                />
            </div>
            <div :style="{ display: 'flex', gap: '4px' }">
                <button type="button" :disabled="!enabled" :style="buttonStyle()" title="Repeat along world X" @click="onRepeat('x')">Repeat X</button>
                <button type="button" :disabled="!enabled" :style="buttonStyle()" title="Repeat along world Y" @click="onRepeat('y')">Repeat Y</button>
                <button type="button" :disabled="!enabled" :style="buttonStyle()" title="Repeat along world Z" @click="onRepeat('z')">Repeat Z</button>
            </div>
        </div>
    `
};
