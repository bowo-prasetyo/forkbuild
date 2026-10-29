import { fromCssHex, toCssHex } from '../../core/building/ColorHex.js';
import { displayText, t } from '../i18n/i18n.js';
import VillagePaletteSwatches from './VillagePaletteSwatches.js';

// The card for an ordinary BRICK selection: count, live position, its colour
// and the everyday actions. StructureInstancePanel is the card for a
// StructurePlacement selection; their data shapes differ (see
// EditorSession#getSelectionSummary()), so EditorView never shows both.
// EditingSidebar fills the default slot with its collapsed sections.
// The registry's nudges, in the Move row: one step each way.
const MOVE_STEPS = Object.freeze(['Left', 'Right', 'Forward', 'Back', 'Up', 'Down']
    .map((name) => ({ name, id: `transform.nudge${name}` })));

export default {
    name: 'SelectionInspector',
    components: { VillagePaletteSwatches },
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        // EditorSession#getSelectionSummary(): { count, bounds }, or null.
        summary: { type: Object, default: null },
        // A live color picker, not a no-argument command, so it is bound
        // directly rather than going through the action registry.
        recolor: { type: Function, default: null },
        // A touch screen: a finger dragging a brick turns the camera, so the
        // hint names the gizmo's arrows and the touch bar's Rotate instead.
        touch: { type: Boolean, default: false }
    },
    computed: {
        context() {
            return this.getContext();
        },
        center() {
            return this.summary ? this.summary.bounds.center : null;
        },
        // The colour every selected brick has, or null when they differ.
        color() {
            const color = this.summary ? this.summary.color : null;
            return typeof color === 'number' ? color : null;
        },
        // A colour input can't be empty; bricks of several colours open it on white.
        colorCss() {
            return this.color === null ? '#ffffff' : toCssHex(this.color);
        }
    },
    data() {
        return { MOVE_STEPS };
    },
    methods: {
        t,
        // "Move Left (←)", or why it can't.
        moveTitle(id) {
            const action = this.registry.get(id);
            if (!action) return null;
            return this.titleFor(id, `${displayText(action.label)} (${action.shortcut})`);
        },
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
            <p class="editor-panel-hint selection-inspector-next">{{ touch ? t('selectionInspector.touchNext') : t('selectionInspector.next') }}</p>
            <!-- Move a step, as the arrow keys and Page Up/Down do, for whoever
                 doesn't know them (docs/reviews/EditorUsability-2026-10-29.md, P2-8). -->
            <div class="selection-inspector-move" role="group" :aria-label="t('selectionInspector.move')">
                <span class="selection-inspector-move-label" aria-hidden="true">{{ t('selectionInspector.move') }}</span>
                <button
                    v-for="step in MOVE_STEPS"
                    :key="step.id"
                    type="button"
                    :class="['editor-panel-btn', 'selection-inspector-move-btn', 'selection-inspector-move-btn--' + step.name]"
                    :disabled="isDisabled(step.id)"
                    :title="moveTitle(step.id)"
                    @click="run(step.id)"
                >{{ t('selectionInspector.move' + step.name) }}</button>
            </div>
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
                    :disabled="isDisabled('transform.tilt')"
                    :title="titleFor('transform.tilt', t('selectionInspector.tiltHint'))"
                    @click="run('transform.tilt')"
                >{{ t('selectionInspector.tilt') }}</button>
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
                    <input type="color" class="selection-inspector-color-input" :value="colorCss" @input="onColorInput" />
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
            <VillagePaletteSwatches v-if="recolor" :selected="color" @choose="recolor" />
            <slot></slot>
        </section>
    `
};
