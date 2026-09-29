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
import { t } from '../i18n/i18n.js';
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
        t,
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
            :aria-label="isEditing ? t('landmarkFormModal.editLandmark2') : t('landmarkFormModal.addLandmark2')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel landmark-form">
                <h3>{{ isEditing ? t('landmarkFormModal.editLandmark') : t('landmarkFormModal.addLandmark') }}</h3>
                <p v-if="!isEditing" class="form-hint form-hint--neutral">
                    {{ t('landmarkFormModal.placedAtYourAvatarS') }}
                </p>

                <label class="form-field">
                    <span class="form-label">{{ t('landmarkFormModal.title') }}</span>
                    <input
                        v-model="title"
                        type="text"
                        class="form-input"
                        :placeholder="t('landmarkFormModal.oldBridge')"
                        maxlength="200"
                        autofocus
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">{{ t('landmarkFormModal.description') }}</span>
                    <textarea
                        v-model="description"
                        class="form-textarea"
                        rows="3"
                        :placeholder="t('landmarkFormModal.niceViewOfTheRiver')"
                    ></textarea>
                </label>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('landmarkFormModal.cancel') }}</button>
                    <button
                        class="action-btn action-btn--primary"
                        :disabled="!title.trim()"
                        @click="onSave"
                    >{{ isEditing ? t('landmarkFormModal.save') : t('landmarkFormModal.placeHere') }}</button>
                </div>
            </div>
        </div>
    `
};
