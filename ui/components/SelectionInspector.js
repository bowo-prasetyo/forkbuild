import { fromCssHex } from '../../core/ColorHex.js';
import { displayText, t } from '../i18n/i18n.js';

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
        t,
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
                {{ t('selectionInspector.selected', { count: summary.count }) }}
            </h4>
            <p class="editor-panel-hint">
                X {{ round1(center.x) }} · Y {{ round1(center.y) }} · Z {{ round1(center.z) }}
            </p>
            <p class="editor-panel-hint selection-inspector-next">{{ t('selectionInspector.next') }}</p>
            <div class="editor-panel-actions">
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('transform.rotateClockwise')"
                    :title="titleFor('transform.rotateClockwise', t('selectionInspector.rotateCwHint'))"
                    @click="run('transform.rotateClockwise')"
                >{{ t('selectionInspector.rotateCw') }}</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('transform.rotateCounterClockwise')"
                    :title="titleFor('transform.rotateCounterClockwise', t('selectionInspector.rotateCcwHint'))"
                    @click="run('transform.rotateCounterClockwise')"
                >{{ t('selectionInspector.rotateCcw') }}</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('selection.duplicate')"
                    :title="titleFor('selection.duplicate', t('selectionInspector.duplicateHint'))"
                    @click="run('selection.duplicate')"
                >{{ t('selectionInspector.duplicate') }}</button>
                <button
                    type="button" class="editor-panel-btn editor-panel-btn--danger"
                    :disabled="isDisabled('selection.delete')"
                    :title="titleFor('selection.delete', t('selectionInspector.deleteHint'))"
                    @click="run('selection.delete')"
                >{{ t('selectionInspector.delete') }}</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('clipboard.copy')"
                    :title="titleFor('clipboard.copy', t('selectionInspector.copyHint'))"
                    @click="run('clipboard.copy')"
                >{{ t('selectionInspector.copy') }}</button>
                <button
                    v-if="!context.clipboardEmpty"
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('clipboard.paste')"
                    :title="titleFor('clipboard.paste', t('selectionInspector.pasteHint'))"
                    @click="run('clipboard.paste')"
                >{{ t('selectionInspector.paste') }}</button>
                <label v-if="recolor" class="editor-panel-btn selection-inspector-color" :title="t('selectionInspector.recolorHint')">
                    {{ t('selectionInspector.color') }}
                    <input type="color" class="selection-inspector-color-input" @input="onColorInput" />
                </label>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('selection.focus')"
                    :title="titleFor('selection.focus', t('selectionInspector.focusHint'))"
                    @click="run('selection.focus')"
                >{{ t('selectionInspector.focus') }}</button>
                <button
                    type="button" class="editor-panel-btn"
                    :disabled="isDisabled('selection.clear')"
                    :title="titleFor('selection.clear', t('selectionInspector.deselectHint'))"
                    @click="run('selection.clear')"
                >{{ t('selectionInspector.deselect') }}</button>
            </div>
            <slot></slot>
        </section>
    `
};
