// 0.3.7 — World Landmarks & Personal Waypoints.
//
// The "Add Landmark"/"Edit Landmark" form — title + description, the
// same two-field shape MetadataEditorDialog.js already established for
// "name this content," reused here rather than inventing a second
// layout convention. One component serves both modes: `landmark: null`
// is Add (title/description start empty, "Place Here" — the landmark
// is created at the avatar's own current position, which this
// component never sees or computes); `landmark: {...}` is Edit
// (fields prefilled, position is never shown or editable here — see
// core/WorldLandmark.js's own header on why a landmark's position
// isn't a field anyone edits after the fact).
//
// Emits save({ title, description }) — never a position; the host
// (ui/views/WorldView.js) decides whether that means
// session.createLandmarkHere(...) or session.updateLandmark(id, ...)
// depending on which mode opened this dialog. Emits cancel with
// nothing applied.
export default {
    name: 'LandmarkFormModal',
    props: {
        // null = Add mode. { id, title, description } = Edit mode.
        landmark: {
            type: Object,
            default: null
        }
    },
    emits: ['save', 'cancel'],
    data() {
        return {
            title: this.landmark ? this.landmark.title : '',
            description: this.landmark ? this.landmark.description : ''
        };
    },
    computed: {
        isEditing() {
            return !!this.landmark;
        }
    },
    methods: {
        onSave() {
            const trimmedTitle = this.title.trim();
            if (!trimmedTitle) {
                return;
            }
            this.$emit('save', { title: trimmedTitle, description: this.description });
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            :aria-label="isEditing ? 'Edit landmark' : 'Add landmark'"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel landmark-form">
                <h3>{{ isEditing ? 'Edit Landmark' : 'Add Landmark' }}</h3>
                <p v-if="!isEditing" class="form-hint form-hint--neutral">
                    Placed at your avatar's current position — a named point
                    other collaborators will see too.
                </p>

                <label class="form-field">
                    <span class="form-label">Title</span>
                    <input
                        v-model="title"
                        type="text"
                        class="form-input"
                        placeholder="Old Bridge"
                        maxlength="200"
                        autofocus
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">Description</span>
                    <textarea
                        v-model="description"
                        class="form-textarea"
                        rows="3"
                        placeholder="Nice view of the river"
                    ></textarea>
                </label>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Cancel</button>
                    <button
                        class="action-btn action-btn--primary"
                        :disabled="!title.trim()"
                        @click="onSave"
                    >{{ isEditing ? 'Save' : 'Place Here' }}</button>
                </div>
            </div>
        </div>
    `
};
