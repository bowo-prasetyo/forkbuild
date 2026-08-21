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
//
// 0.2.92 — World Instance Transform UX adds the numeric inspector the
// milestone asked for: exact X/Z/rotation TARGETS, applied via
// EditorSession#applyPlacementTransform() — the same delta-shaped
// Move/RotateStructurePlacementCommand pair the interactive gizmo and
// keyboard nudges already use, never a fourth mutation path. Y is
// deliberately NOT an editable field here — it is read-only "Ground Y",
// the terrain elevation at the placement's current (X, Z), because this
// engine's placement model is ground-anchored (see
// docs/Principles.md, "A Placement's Elevation Is Never A Gizmo Or
// Numeric Target"). The fields track `info` live (this is a property
// inspector, not a "next operation" scratch pad like
// ui/components/NumericTransformPanel.js) so dragging the gizmo, nudging
// with the keyboard, or clicking Rotate all show up here immediately.
export default {
    name: 'StructureInstancePanel',
    props: {
        info: { type: Object, required: true }
    },
    emits: ['rotate', 'duplicate', 'delete', 'edit-source', 'apply-transform'],
    data() {
        return {
            x: 0,
            z: 0,
            rotation: 0
        };
    },
    computed: {
        groundYDisplay() {
            return Number.isFinite(this.info.groundY) ? this.info.groundY.toFixed(1) : '—';
        }
    },
    watch: {
        info: {
            immediate: true,
            handler(info) {
                if (!info) return;
                this.x = round1(info.position.x);
                this.z = round1(info.position.z);
                this.rotation = round1(info.rotation);
            }
        }
    },
    methods: {
        applyTransform() {
            const x = Number(this.x);
            const z = Number(this.z);
            const rotation = Number(this.rotation);
            if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation)) {
                return;
            }
            this.$emit('apply-transform', { x, z, rotation });
        },
        onFieldKeydown(event) {
            if (event.key === 'Enter') {
                event.stopPropagation();
                this.applyTransform();
            }
        }
    },
    template: `
        <div class="structure-instance-panel">
            <h4 class="structure-instance-heading">Selected: {{ info.title }}</h4>
            <p class="structure-instance-hint">
                Drag in the viewport — or the arrows/ring on the gizmo — to move
                and rotate. Arrow keys / PgUp / PgDn nudge.
            </p>

            <div class="structure-instance-transform">
                <div class="structure-instance-transform-row">
                    <label class="form-field structure-instance-field">
                        <span class="form-label">X</span>
                        <input
                            type="number" step="1" class="form-input"
                            v-model.number="x" @keydown="onFieldKeydown"
                        />
                    </label>
                    <label class="form-field structure-instance-field">
                        <span class="form-label">Z</span>
                        <input
                            type="number" step="1" class="form-input"
                            v-model.number="z" @keydown="onFieldKeydown"
                        />
                    </label>
                </div>
                <p class="structure-instance-ground-y" title="Elevation is terrain-derived — never a manual target">
                    Ground Y: {{ groundYDisplay }}
                </p>
                <label class="form-field structure-instance-field">
                    <span class="form-label">Rotation °</span>
                    <input
                        type="number" step="15" class="form-input"
                        v-model.number="rotation" @keydown="onFieldKeydown"
                    />
                </label>
                <button type="button" class="structure-instance-btn structure-instance-apply" @click="applyTransform">
                    Apply
                </button>
            </div>

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

function round1(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
}
