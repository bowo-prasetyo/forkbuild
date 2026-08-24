import AlignmentPanel from './AlignmentPanel.js';
import NumericTransformPanel from './NumericTransformPanel.js';
import RepeatPanel from './RepeatPanel.js';
import CollapsibleSection from './CollapsibleSection.js';

// The consolidated editing sidebar (0.1.50): Selection / Transform /
// Groups / Clipboard in one place, organized — not a new UI framework.
// Composes the existing AlignmentPanel and NumericTransformPanel
// unchanged, and drives every button through the EditorActionRegistry,
// so disabled states come with reasons ("Select at least 2 bricks",
// "Clipboard is empty", ...) and the same operations stay reachable
// from the palette and keyboard.
//
// 0.6.2 — Editor UX Consolidation reworks this file around a Primary /
// Common / Advanced action hierarchy (application/EditorActionRegistry.js's
// own `tier` field — see that file's 0.6.2 header) instead of exposing
// every operation at once:
//   - The old "Selection" section (a bare "N brick(s) selected" line
//     plus Duplicate/Delete/Clear) moved OUT of this file entirely, to
//     ui/components/SelectionInspector.js — selection info now lives
//     next to the live position readout that explains what those
//     buttons would act on, not a scroll away in a separate section.
//     Select All stays here: it grows the selection rather than acting
//     on one that already exists, so it belongs with "nothing selected
//     yet."
//   - Transform keeps Rotate (Primary) and the numeric panel (Move)
//     always visible; Align/Distribute/Repeat (Advanced) collapse into
//     one CollapsibleSection, collapsed by default.
//   - Groups keeps Create always visible (the entry point); every other
//     group operation (Advanced) collapses the same way.
//   - Clipboard is small enough already (two buttons) to stay always
//     visible — collapsing it would hide more chrome than it saves.
//
// Empty-state copy matters as much as the buttons: with nothing
// selected, the sidebar says what the surface is for instead of
// rendering a wall of dead controls.
export default {
    name: 'EditingSidebar',
    components: { AlignmentPanel, NumericTransformPanel, RepeatPanel, CollapsibleSection },
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        ui: { type: Object, default: () => ({}) },
        selectionCount: { type: Number, default: 0 },
        // 0.2.91 — World Instance Editing & Placement Management: true
        // when the selection is exactly one StructurePlacement, so the
        // Selection section's copy and Duplicate button reflect "an
        // instance" rather than always assuming bricks.
        isStructurePlacementSelection: { type: Boolean, default: false },
        applyNumeric: { type: Function, required: true },
        align: { type: Function, required: true },
        distribute: { type: Function, required: true },
        // 0.6.2 — the Repeat panel's own host callback, same shape as
        // align/distribute above: this component stays dumb about what
        // "repeat" means, the host view routes it to
        // EditorSession#repeatSelection().
        repeat: { type: Function, required: true }
    },
    data() {
        return {
            // 0.6.2 — local, not a shared navigation-state store like
            // WorldViewNavigationState: this sidebar never unmounts
            // while the Editor is open, so there is nothing for a
            // remount to forget. Both start collapsed — "progressive
            // disclosure," not "advanced controls hidden forever."
            transformAdvancedCollapsed: true,
            groupsAdvancedCollapsed: true
        };
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
            // 0.6.2 — transform.repeat's own focus hook, mirroring
            // focusNumeric immediately above but scoped to the Repeat
            // panel's own count field (a generic "first input" selector
            // would hit NumericTransformPanel's X field instead) — and,
            // since Repeat lives inside the collapsed-by-default
            // Advanced section, expanding it first so focus() lands on
            // something actually visible.
            this.ui.focusRepeat = () => {
                this.transformAdvancedCollapsed = false;
                this.$nextTick(() => {
                    const input = this.$el && this.$el.querySelector('.repeat-panel-count');
                    if (input) {
                        input.focus();
                    }
                });
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
                    Nothing selected — place a brick or structure, or click one to select it.
                </p>
                <div :style="rowStyle()">
                    <button
                        type="button"
                        :style="buttonStyle()"
                        :disabled="isDisabled('selection.selectAll')"
                        :title="isDisabled('selection.selectAll') ? reasonFor('selection.selectAll') : 'Select every brick'"
                        @click="run('selection.selectAll')"
                    >Select All</button>
                </div>
            </div>

            <div :style="sectionStyle()">
                <h4 :style="headingStyle()">Transform</h4>
                <!-- 0.6.2 — hidden for a StructurePlacement selection:
                     StructureInstancePanel (above, in EditorView's own
                     sidebar) already renders its OWN Rotate ↻/↺ pair for
                     exactly that case — same underlying
                     EditorSession#rotateSelection() either way, so
                     showing both here would be the redundant-UI problem
                     this milestone exists to remove, not add to. -->
                <div v-if="!isStructurePlacementSelection" :style="rowStyle()">
                    <button
                        type="button" :style="buttonStyle()"
                        :disabled="isDisabled('transform.rotateClockwise')"
                        :title="isDisabled('transform.rotateClockwise') ? reasonFor('transform.rotateClockwise') : 'Rotate +90°'"
                        @click="run('transform.rotateClockwise')"
                    >Rotate ↻</button>
                    <button
                        type="button" :style="buttonStyle()"
                        :disabled="isDisabled('transform.rotateCounterClockwise')"
                        :title="isDisabled('transform.rotateCounterClockwise') ? reasonFor('transform.rotateCounterClockwise') : 'Rotate −90°'"
                        @click="run('transform.rotateCounterClockwise')"
                    >Rotate ↺</button>
                </div>
                <div :style="{ marginTop: '10px' }">
                    <NumericTransformPanel
                        :selection-count="selectionCount"
                        :apply="applyNumeric"
                    />
                </div>
                <div :style="{ marginTop: '10px' }">
                    <CollapsibleSection
                        title="Advanced"
                        :collapsed="transformAdvancedCollapsed"
                        @toggle="transformAdvancedCollapsed = $event"
                    >
                        <AlignmentPanel
                            :selection-count="selectionCount"
                            :align="align"
                            :distribute="distribute"
                        />
                        <div :style="{ marginTop: '8px' }">
                            <RepeatPanel
                                :selection-count="selectionCount"
                                :repeat="repeat"
                            />
                        </div>
                    </CollapsibleSection>
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
                </div>
                <div :style="{ marginTop: '10px' }">
                    <CollapsibleSection
                        title="Advanced"
                        :collapsed="groupsAdvancedCollapsed"
                        @toggle="groupsAdvancedCollapsed = $event"
                    >
                        <div :style="rowStyle()">
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
                    </CollapsibleSection>
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
