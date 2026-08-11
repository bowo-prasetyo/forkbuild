import AlignmentPanel from './AlignmentPanel.js';
import NumericTransformPanel from './NumericTransformPanel.js';

// The consolidated editing sidebar (0.1.50): Selection / Transform /
// Groups / Clipboard in one place, organized — not a new UI framework.
// Composes the existing AlignmentPanel and NumericTransformPanel
// unchanged, and drives every button through the EditorActionRegistry,
// so disabled states come with reasons ("Select at least 2 bricks",
// "Clipboard is empty", ...) and the same operations stay reachable
// from the palette and keyboard.
//
// Empty-state copy matters as much as the buttons: with nothing
// selected, the sidebar says what the surface is for instead of
// rendering a wall of dead controls.
export default {
    name: 'EditingSidebar',
    components: { AlignmentPanel, NumericTransformPanel },
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        ui: { type: Object, default: () => ({}) },
        selectionCount: { type: Number, default: 0 },
        applyNumeric: { type: Function, required: true },
        align: { type: Function, required: true },
        distribute: { type: Function, required: true }
    },
    computed: {
        context() {
            return this.getContext();
        }
    },
    mounted() {
        // transform.numeric focuses the first numeric field in this
        // sidebar; the action layer reaches it through ui.focusNumeric.
        if (this.ui) {
            this.ui.focusNumeric = () => {
                const input = this.$el && this.$el.querySelector('input');
                if (input) {
                    input.focus();
                }
            };
        }
    },
    methods: {
        run(id) {
            this.registry.execute(id, this.context);
        },
        isDisabled(id) {
            const action = this.registry.get(id);
            return !action || !action.enabled(this.context);
        },
        reasonFor(id) {
            const action = this.registry.get(id);
            if (!action || !action.disabledReason) {
                return null;
            }
            return action.disabledReason(this.context);
        },
        buttonStyle() {
            return {
                padding: '3px 8px',
                background: '#1f1f1f',
                border: '1px solid #2a2a2a',
                borderRadius: '3px',
                color: '#c0c0c0',
                fontSize: '11px',
                fontFamily: 'monospace',
                cursor: 'pointer'
            };
        },
        sectionStyle() {
            return {
                marginTop: '12px',
                padding: '10px',
                background: '#161616',
                border: '1px solid #242424',
                borderRadius: '4px'
            };
        },
        headingStyle() {
            return {
                margin: '0 0 6px',
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#707070'
            };
        },
        rowStyle() {
            return { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' };
        },
        emptyStyle() {
            return { margin: '0', color: '#707070', fontSize: '11px', lineHeight: '1.5' };
        }
    },
    template: `
        <div>
            <div :style="sectionStyle()">
                <h4 :style="headingStyle()">Selection</h4>
                <p v-if="context.selectionCount === 0" :style="emptyStyle()">
                    No bricks selected.<br />
                    Select bricks to transform, align, distribute, or edit numerically.
                </p>
                <p v-else :style="{ margin: '0', color: '#b0b0b0', fontSize: '12px' }">
                    {{ context.selectionCount }} brick(s) selected
                </p>
                <div :style="rowStyle()">
                    <button
                        type="button"
                        :style="buttonStyle()"
                        :disabled="isDisabled('selection.selectAll')"
                        :title="isDisabled('selection.selectAll') ? reasonFor('selection.selectAll') : 'Select every brick'"
                        @click="run('selection.selectAll')"
                    >Select All</button>
                    <button
                        type="button"
                        :style="buttonStyle()"
                        :disabled="isDisabled('selection.clear')"
                        :title="isDisabled('selection.clear') ? reasonFor('selection.clear') : 'Clear the selection'"
                        @click="run('selection.clear')"
                    >Clear</button>
                </div>
            </div>

            <div :style="sectionStyle()">
                <h4 :style="headingStyle()">Transform</h4>
                <NumericTransformPanel
                    :selection-count="selectionCount"
                    :apply="applyNumeric"
                />
                <div :style="{ marginTop: '10px' }">
                    <AlignmentPanel
                        :selection-count="selectionCount"
                        :align="align"
                        :distribute="distribute"
                    />
                </div>
            </div>

            <div :style="sectionStyle()">
                <h4 :style="headingStyle()">Groups</h4>
                <p v-if="!context.hasGroups" :style="emptyStyle()">
                    No groups yet — select bricks and create one.
                </p>
                <ul v-else :style="{ margin: '0 0 6px', padding: '0 0 0 16px', color: '#b0b0b0', fontSize: '12px' }">
                    <li v-for="group in context.groups" :key="group.id">
                        {{ group.name }} <span :style="{ color: '#707070' }">({{ group.memberCount }})</span>
                    </li>
                </ul>
                <div :style="rowStyle()">
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('group.create')"
                        :title="isDisabled('group.create') ? reasonFor('group.create') : 'Group the selected bricks'"
                        @click="run('group.create')">Create</button>
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('group.rename')"
                        :title="isDisabled('group.rename') ? reasonFor('group.rename') : 'Rename the selected group'"
                        @click="run('group.rename')">Rename</button>
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('group.duplicate')"
                        :title="isDisabled('group.duplicate') ? reasonFor('group.duplicate') : 'Duplicate the selected group'"
                        @click="run('group.duplicate')">Duplicate</button>
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('group.delete')"
                        :title="isDisabled('group.delete') ? reasonFor('group.delete') : 'Delete the selected group'"
                        @click="run('group.delete')">Delete</button>
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('group.addSelection')"
                        :title="isDisabled('group.addSelection') ? reasonFor('group.addSelection') : 'Add the selected bricks to the group'"
                        @click="run('group.addSelection')">+Sel</button>
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('group.removeSelection')"
                        :title="isDisabled('group.removeSelection') ? reasonFor('group.removeSelection') : 'Remove the selected bricks from the group'"
                        @click="run('group.removeSelection')">−Sel</button>
                </div>
            </div>

            <div :style="sectionStyle()">
                <h4 :style="headingStyle()">Clipboard</h4>
                <div :style="rowStyle()">
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('clipboard.copy')"
                        :title="isDisabled('clipboard.copy') ? reasonFor('clipboard.copy') : 'Copy the selected bricks'"
                        @click="run('clipboard.copy')">Copy</button>
                    <button type="button" :style="buttonStyle()" :disabled="isDisabled('clipboard.paste')"
                        :title="isDisabled('clipboard.paste') ? reasonFor('clipboard.paste') : 'Paste the clipboard contents'"
                        @click="run('clipboard.paste')">Paste</button>
                </div>
            </div>
        </div>
    `
};
