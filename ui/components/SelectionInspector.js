import { fromCssHex } from '../../core/ColorHex.js';
import { displayText } from '../i18n/i18n.js';

// The card for an ordinary BRICK selection: count, live position and the
// everyday actions. StructureInstancePanel is the card for a
// StructurePlacement selection; their data shapes differ (see
// EditorSession#getSelectionSummary()), so EditorView never shows both.
// EditingSidebar fills the default slot with its collapsed sections.
export default {
    name: 'SelectionInspector',
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        // EditorSession#getSelectionSummary(): { count, bounds }, or null.
        summary: { type: Object, default: null },
        // A live color picker, not a no-argument command, so it is bound
        // directly rather than going through the action registry.
        recolor: { type: Function, default: null }
    },
    computed: {
        context() {
            return this.getContext();
        },
        center() {
            return this.summary ? this.summary.bounds.center : null;
        }
    },
    methods: {
        round1(value) {
            return Math.round((Number(value) || 0) * 10) / 10;
        },
        onColorInput(event) {
            if (typeof this.recolor === 'function') {
                this.recolor(fromCssHex(event.target.value));
            }
        },
        run(id) {
            this.registry.execute(id, this.context);
        },
        isDisabled(id) {
            const action = this.registry.get(id);
            return !action || !action.enabled(this.context);
        },
        titleFor(id, enabledTitle) {
            if (!this.isDisabled(id)) {
                return enabledTitle;
            }
            const action = this.registry.get(id);
            return action && action.disabledReason ? displayText(action.disabledReason(this.context)) : null;
        }
    },
    template: `
        <section v-if="summary" class="editor-panel selection-inspector">
            <h4 class="editor-panel-title">
                {{ summary.count }} {{ summary.count === 1 ? 'brick' : 'bricks' }} selected
            </h4>
            <p class="editor-panel-hint">
                X {{ round1(center.x) }} · Y {{ round1(center.y) }} · Z {{ round1(center.z) }}
            </p>
            <p class="editor-panel-hint selection-inspector-next">Drag the gizmo to move · R rotates</p>
            <div class="editor-panel-actions">
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('transform.rotateClockwise')"
                    :title="titleFor('transform.rotateClockwise', 'Rotate +90° (R)')"
                    @click="run('transform.rotateClockwise')"
                >Rotate ↻</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('transform.rotateCounterClockwise')"
                    :title="titleFor('transform.rotateCounterClockwise', 'Rotate −90° (Shift+R)')"
                    @click="run('transform.rotateCounterClockwise')"
                >Rotate ↺</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('selection.duplicate')"
                    :title="titleFor('selection.duplicate', 'Duplicate the selection (Ctrl/Cmd+D)')"
                    @click="run('selection.duplicate')"
                >Duplicate</button>
                <button
                    type="button" class="editor-panel-btn editor-panel-btn--danger"
                    :disabled="isDisabled('selection.delete')"
                    :title="titleFor('selection.delete', 'Delete the selection (Del)')"
                    @click="run('selection.delete')"
                >Delete</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('clipboard.copy')"
                    :title="titleFor('clipboard.copy', 'Copy the selected bricks (Ctrl/Cmd+C)')"
                    @click="run('clipboard.copy')"
                >Copy</button>
                <button
                    v-if="!context.clipboardEmpty"
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('clipboard.paste')"
                    :title="titleFor('clipboard.paste', 'Paste the clipboard contents (Ctrl/Cmd+V)')"
                    @click="run('clipboard.paste')"
                >Paste</button>
                <label v-if="recolor" class="editor-panel-btn selection-inspector-color" title="Recolor the selected bricks">
                    Color
                    <input type="color" class="selection-inspector-color-input" @input="onColorInput" />
                </label>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('selection.focus')"
                    :title="titleFor('selection.focus', 'Frame the camera on the selection')"
                    @click="run('selection.focus')"
                >Focus</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('selection.clear')"
                    :title="titleFor('selection.clear', 'Deselect everything (Esc)')"
                    @click="run('selection.clear')"
                >Deselect</button>
            </div>
            <slot></slot>
        </section>
    `
};
