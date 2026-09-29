import AlignmentPanel from './AlignmentPanel.js';
import NumericTransformPanel from './NumericTransformPanel.js';
import RepeatPanel from './RepeatPanel.js';
import CollapsibleSection from './CollapsibleSection.js';
import SelectionInspector from './SelectionInspector.js';
import { displayText, t } from '../i18n/i18n.js';

// The Editor's contextual Selection panel. It only shows controls that can
// act right now: with nothing selected, a hint plus Select All / Paste and
// the group list (clicking a group selects its bricks); with bricks
// selected, SelectionInspector's actions and three collapsed sections for
// the occasional operations. A StructurePlacement selection renders
// nothing here, because StructureInstancePanel is that selection's card.
//
// Every button runs through the EditorActionRegistry, so disabled states
// carry the same reasons and the operations stay reachable from the
// Command Palette and keyboard.
export default {
    name: 'EditingSidebar',
    components: { AlignmentPanel, NumericTransformPanel, RepeatPanel, CollapsibleSection, SelectionInspector },
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        ui: { type: Object, default: () => ({}) },
        selectionCount: { type: Number, default: 0 },
        isStructurePlacementSelection: { type: Boolean, default: false },
        // EditorSession#getSelectionSummary() for a brick selection, else null.
        selectionSummary: { type: Object, default: null },
        recolor: { type: Function, default: null },
        applyNumeric: { type: Function, required: true },
        align: { type: Function, required: true },
        distribute: { type: Function, required: true },
        repeat: { type: Function, required: true },
        // The only way to set "the selected group" that Rename/Duplicate/
        // Delete/Add/Remove act on. A plain session state change, not a
        // registry action: it makes no history entry.
        selectGroup: { type: Function, required: true }
    },
    data() {
        return {
            numericCollapsed: true,
            arrangeCollapsed: true,
            groupsCollapsed: true
        };
    },
    computed: {
        context() {
            return this.getContext();
        },
        hasBrickSelection() {
            return !!this.selectionSummary && !this.isStructurePlacementSelection;
        },
        isEmpty() {
            return this.selectionCount === 0;
        }
    },
    mounted() {
        if (!this.ui) {
            return;
        }
        // transform.numeric / transform.repeat focus a field that lives in a
        // collapsed section, so expand it before focusing.
        this.ui.focusNumeric = () => this.expandAndFocus('numericCollapsed', '.numeric-transform-panel input');
        this.ui.focusRepeat = () => this.expandAndFocus('arrangeCollapsed', '.repeat-panel-count');
    },
    methods: {
        t,
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
        },
        expandAndFocus(collapsedKey, selector) {
            this[collapsedKey] = false;
            this.$nextTick(() => {
                const input = this.$el && this.$el.querySelector && this.$el.querySelector(selector);
                if (input) {
                    input.focus();
                }
            });
        },
        onSelectGroup(groupId) {
            this.selectGroup(groupId);
            // Selecting a group selects its bricks; open the section whose
            // buttons act on that group so the next step is visible.
            this.groupsCollapsed = false;
        }
    },
    template: `
        <div v-if="!isStructurePlacementSelection" class="editing-sidebar">
            <section v-if="isEmpty" class="editor-panel editing-sidebar-empty">
                <h4 class="editor-panel-heading">{{ t('editingSidebar.selection') }}</h4>
                <p class="editor-panel-hint">{{ t('editingSidebar.emptyHint') }}</p>
                <div class="editor-panel-actions">
                    <button
                        type="button" class="editor-panel-btn"
                        :disabled="isDisabled('selection.selectAll')"
                        :title="titleFor('selection.selectAll', t('editingSidebar.selectAllHint'))"
                        @click="run('selection.selectAll')"
                    >{{ t('editingSidebar.selectAll') }}</button>
                    <button
                        v-if="!context.clipboardEmpty"
                        type="button" class="editor-panel-btn"
                        :disabled="isDisabled('clipboard.paste')"
                        :title="titleFor('clipboard.paste', t('editingSidebar.pasteHint'))"
                        @click="run('clipboard.paste')"
                    >{{ t('editingSidebar.paste') }}</button>
                </div>
                <template v-if="context.hasGroups">
                    <h5 class="editor-panel-subheading">{{ t('editingSidebar.groups') }}</h5>
                    <ul class="editing-sidebar-group-list">
                        <li v-for="group in context.groups" :key="group.id">
                            <button
                                type="button" class="editing-sidebar-group"
                                :title="t('editingSidebar.selectGroupHint')"
                                @click="onSelectGroup(group.id)"
                            >{{ group.name || t('editingSidebar.unnamedGroup') }} <span class="editing-sidebar-group-count">{{ group.memberCount }}</span></button>
                        </li>
                    </ul>
                </template>
            </section>

            <SelectionInspector
                v-else-if="hasBrickSelection"
                :registry="registry"
                :get-context="getContext"
                :summary="selectionSummary"
                :recolor="recolor"
            >
                <CollapsibleSection
                    :title="t('editingSidebar.numeric')"
                    :collapsed="numericCollapsed"
                    @toggle="numericCollapsed = $event"
                >
                    <NumericTransformPanel
                        :selection-count="selectionCount"
                        :apply="applyNumeric"
                    />
                </CollapsibleSection>
                <CollapsibleSection
                    :title="t('editingSidebar.arrange')"
                    :collapsed="arrangeCollapsed"
                    @toggle="arrangeCollapsed = $event"
                >
                    <AlignmentPanel
                        :selection-count="selectionCount"
                        :align="align"
                        :distribute="distribute"
                    />
                    <RepeatPanel
                        :selection-count="selectionCount"
                        :repeat="repeat"
                    />
                </CollapsibleSection>
                <CollapsibleSection
                    :title="t('editingSidebar.groupsAndBlueprint')"
                    :collapsed="groupsCollapsed"
                    @toggle="groupsCollapsed = $event"
                >
                    <ul v-if="context.hasGroups" class="editing-sidebar-group-list">
                        <li v-for="group in context.groups" :key="group.id">
                            <button
                                type="button"
                                :class="['editing-sidebar-group', { 'editing-sidebar-group--selected': group.id === context.selectedGroupId }]"
                                :aria-pressed="group.id === context.selectedGroupId ? 'true' : 'false'"
                                :title="t('editingSidebar.chooseGroupHint')"
                                @click="onSelectGroup(group.id)"
                            >{{ group.name || t('editingSidebar.unnamedGroup') }} <span class="editing-sidebar-group-count">{{ group.memberCount }}</span></button>
                        </li>
                    </ul>
                    <div class="editor-panel-actions">
                        <button type="button" class="editor-panel-btn" :disabled="isDisabled('group.create')"
                            :title="titleFor('group.create', t('editingSidebar.newGroupHint'))"
                            @click="run('group.create')">{{ t('editingSidebar.newGroup') }}</button>
                        <template v-if="context.hasGroups">
                            <button type="button" class="editor-panel-btn" :disabled="isDisabled('group.addSelection')"
                                :title="titleFor('group.addSelection', t('editingSidebar.addToGroupHint'))"
                                @click="run('group.addSelection')">{{ t('editingSidebar.addToGroup') }}</button>
                            <button type="button" class="editor-panel-btn" :disabled="isDisabled('group.removeSelection')"
                                :title="titleFor('group.removeSelection', t('editingSidebar.removeFromGroupHint'))"
                                @click="run('group.removeSelection')">{{ t('editingSidebar.removeFromGroup') }}</button>
                            <button type="button" class="editor-panel-btn" :disabled="isDisabled('group.rename')"
                                :title="titleFor('group.rename', t('editingSidebar.renameGroupHint'))"
                                @click="run('group.rename')">{{ t('editingSidebar.renameGroup') }}</button>
                            <button type="button" class="editor-panel-btn" :disabled="isDisabled('group.duplicate')"
                                :title="titleFor('group.duplicate', t('editingSidebar.duplicateGroupHint'))"
                                @click="run('group.duplicate')">{{ t('editingSidebar.duplicateGroup') }}</button>
                            <button type="button" class="editor-panel-btn editor-panel-btn--danger" :disabled="isDisabled('group.delete')"
                                :title="titleFor('group.delete', t('editingSidebar.deleteGroupHint'))"
                                @click="run('group.delete')">{{ t('editingSidebar.deleteGroup') }}</button>
                        </template>
                    </div>
                    <div class="editor-panel-actions">
                        <button type="button" class="editor-panel-btn"
                            :disabled="isDisabled('structure.createFromSelection')"
                            :title="titleFor('structure.createFromSelection', t('editingSidebar.createBlueprintHint'))"
                            @click="run('structure.createFromSelection')">{{ t('editingSidebar.createBlueprint') }}</button>
                    </div>
                </CollapsibleSection>
            </SelectionInspector>
        </div>
    `
};
