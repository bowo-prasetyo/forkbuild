// 0.2.91 — World Instance Editing & Placement Management. The panel the
// design conversation asked for explicitly:
//
//   Selected House Instance
//     Move
//     Rotate
//     Duplicate
//     Delete
//
// "Move" has no button here — dragging the instance in the viewport (or
// the existing arrow-key/PgUp/PgDn nudge actions, which already work for
// a placement selection via application/EditorSession.js#moveSelection())
// IS the move gesture; a button that nudges by a fixed amount would just
// duplicate what the sidebar's Transform section already offers. Rotate/
// Duplicate/Delete are real one-shot actions, so they get buttons.
//
// Deliberately does NOT offer "Edit Bricks" as an instance mutation —
// only "Edit Source Document," which opens the referenced Document
// through the ordinary Load path
// (application/EditorSession.js#editStructurePlacementSource()). This is
// the one UX distinction the design conversation called out by name:
// editing a placed structure's content always happens by editing its
// Document, never by touching the instance.
export default {
    name: 'StructureInstancePanel',
    props: {
        info: { type: Object, required: true }
    },
    emits: ['rotate', 'duplicate', 'delete', 'edit-source'],
    template: `
        <div class="structure-instance-panel">
            <h4 class="structure-instance-heading">Selected: {{ info.title }}</h4>
            <p class="structure-instance-hint">
                Drag in the viewport to move. Arrow keys / PgUp / PgDn nudge.
            </p>
            <div class="structure-instance-actions">
                <button type="button" class="structure-instance-btn" title="Rotate +90°" @click="$emit('rotate', 90)">Rotate ↻</button>
                <button type="button" class="structure-instance-btn" title="Rotate −90°" @click="$emit('rotate', -90)">Rotate ↺</button>
                <button type="button" class="structure-instance-btn" title="Place another instance of the same structure" @click="$emit('duplicate')">Duplicate</button>
                <button type="button" class="structure-instance-btn structure-instance-btn--danger" title="Remove this instance from the World" @click="$emit('delete')">Delete</button>
            </div>
            <button type="button" class="structure-instance-edit-source" title="Open the referenced Document to edit its bricks" @click="$emit('edit-source')">
                Edit Source Document
            </button>
        </div>
    `
};
