// 0.6.2 — Editor UX Consolidation.
//
// "Selection is the central Editor state" (see docs/Roadmap.md, 0.6.2):
// this is the compact card that makes that true for an ordinary BRICK
// selection, the same job ui/components/StructureInstancePanel.js has
// done for a StructurePlacement selection since 0.2.91. The two stay
// deliberately separate components (see application/EditorSession.js#
// getSelectionSummary()'s own header on why their data shapes don't
// merge) — EditorView renders whichever one applies, never both.
//
// Replaces the old EditingSidebar "Selection" section's bare "N
// brick(s) selected" paragraph plus its own Duplicate/Delete/Clear
// buttons — moved here so the actions live next to the live position
// readout that explains what they'd act on, instead of a separate
// section a scroll away. Select All stays behind (EditingSidebar still
// offers it) — it's about growing the selection, not acting on it, so
// it belongs with "nothing is selected yet" rather than with an
// inspector for one that already exists.
//
// Runs its own tiny run()/isDisabled()/reasonFor() against the SAME
// registry + context every other action surface in this file family
// uses (EditingSidebar, CommandPalette) — no second enablement rule,
// just a second, smaller place buttons are drawn.
export default {
    name: 'SelectionInspector',
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        selectionCount: { type: Number, default: 0 },
        // application/EditorSession.js#getSelectionSummary()'s return
        // value — { count, bounds } — or null (empty selection, or a
        // StructurePlacement selection, which this component never
        // renders for; EditorView gates that case out already).
        summary: { type: Object, default: null }
    },
    computed: {
        context() {
            return this.getContext();
        },
        center() {
            return this.summary ? this.summary.bounds.center : null;
        },
        // "What happens next" — the same contextual-hint posture the
        // placement/collision feedback toasts already established
        // elsewhere; this one is live (no auto-hide) since the
        // selection itself is live.
        hint() {
            if (!this.summary) return '';
            return this.summary.count > 1
                ? 'R to rotate · Ctrl/Cmd+D to duplicate · Delete to remove'
                : 'R to rotate · Ctrl/Cmd+D to duplicate · Delete to remove · drag to move';
        }
    },
    methods: {
        round1(value) {
            return Math.round((Number(value) || 0) * 10) / 10;
        },
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
        }
    },
    template: `
        <div v-if="summary" class="structure-instance-panel selection-inspector">
            <h4 class="structure-instance-heading">
                {{ summary.count }} {{ summary.count === 1 ? 'brick' : 'bricks' }} selected
            </h4>
            <p class="structure-instance-hint">
                Position (center) X {{ round1(center.x) }} · Y {{ round1(center.y) }} · Z {{ round1(center.z) }}
            </p>
            <p class="structure-instance-hint selection-inspector-next">{{ hint }}</p>
            <div class="structure-instance-actions">
                <button
                    type="button" class="structure-instance-btn"
                    :disabled="isDisabled('selection.duplicate')"
                    :title="isDisabled('selection.duplicate') ? reasonFor('selection.duplicate') : 'Duplicate the selection'"
                    @click="run('selection.duplicate')"
                >Duplicate</button>
                <button
                    type="button" class="structure-instance-btn structure-instance-btn--danger"
                    :disabled="isDisabled('selection.delete')"
                    :title="isDisabled('selection.delete') ? reasonFor('selection.delete') : 'Delete the selection'"
                    @click="run('selection.delete')"
                >Delete</button>
                <button
                    type="button" class="structure-instance-btn"
                    :disabled="isDisabled('selection.clear')"
                    :title="isDisabled('selection.clear') ? reasonFor('selection.clear') : 'Clear the selection'"
                    @click="run('selection.clear')"
                >Clear</button>
            </div>
        </div>
    `
};
