import { RegionKind } from '../../core/RegionKind.js';
import { t } from '../i18n/i18n.js';
import { regionKindText } from '../i18n/worldText.js';

// 0.5.0 — World Regions & Decentralized Place Naming.
//
// The "Name This Area"/"Edit Region" form — the region counterpart to
// ui/components/LandmarkFormModal.js, extended with the two fields a
// named AREA needs beyond a landmark's single point: Kind (a semantic
// label only, never a behavior — see core/RegionKind.js's own header)
// and Radius. One component serves both modes exactly like
// LandmarkFormModal: `region: null` is Add (centered on the avatar's
// own current position, which this component never sees or computes);
// `region: {...}` is Edit (fields prefilled; center/radius-at-creation
// are shown as read-only context, never editable here — see
// core/World.js#updateWorldRegion()'s own comment on why relocating a
// region is remove + recreate, not an in-place edit... except radius
// itself, which — unlike a landmark's position — IS editable in place:
// "make my region bigger" doesn't require moving anything).
//
// Emits save({ name, description, kind, radius }) — never a position;
// the host (ui/views/WorldView.js) decides whether that means
// session.createRegionHere(...) or session.updateRegion(id, ...)
// depending on which mode opened this dialog. Emits cancel with nothing
// applied.
//
// Deliberately excluded: a parentRegionId picker. core/WorldRegion.js
// and the command/session layer beneath this form already support it
// (informational grouping only, never required — see that class's own
// header), but a UI to browse/pick an existing region as a parent is
// future work, not attempted here.

export default {
    name: 'RegionFormModal',
    props: {
        // null = Add mode. { id, name, description, kind, radius } = Edit mode.
        region: {
            type: Object,
            default: null
        }
    },
    emits: ['save', 'cancel'],
    data() {
        return {
            name: this.region ? this.region.name : '',
            description: this.region ? this.region.description : '',
            kind: this.region ? this.region.kind : RegionKind.PLACE,
            radius: this.region ? this.region.radius : 30
        };
    },
    computed: {
        isEditing() {
            return !!this.region;
        },
        kindOptions() {
            return Object.values(RegionKind).map((kind) => ({ value: kind, label: regionKindText(kind) }));
        },
        radiusIsValid() {
            return Number.isFinite(Number(this.radius)) && Number(this.radius) > 0;
        }
    },
    methods: {
        t,
        onSave() {
            const trimmedName = this.name.trim();
            if (!trimmedName || !this.radiusIsValid) {
                return;
            }
            this.$emit('save', {
                name: trimmedName,
                description: this.description,
                kind: this.kind,
                radius: Number(this.radius)
            });
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
            :aria-label="isEditing ? t('regionFormModal.editRegion2') : t('regionFormModal.nameThisArea2')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel region-form">
                <h3>{{ isEditing ? t('regionFormModal.editRegion') : t('regionFormModal.nameThisArea') }}</h3>
                <p v-if="!isEditing" class="form-hint form-hint--neutral">
                    {{ t('regionFormModal.centeredOnYourAvatarS') }}
                </p>

                <label class="form-field">
                    <span class="form-label">{{ t('regionFormModal.name') }}</span>
                    <input
                        v-model="name"
                        type="text"
                        class="form-input"
                        :placeholder="t('regionFormModal.willowVillage')"
                        maxlength="200"
                        autofocus
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">{{ t('regionFormModal.kind') }}</span>
                    <select v-model="kind" class="form-input">
                        <option v-for="option in kindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>

                <label class="form-field">
                    <span class="form-label">{{ t('regionFormModal.radiusMeters') }}</span>
                    <input
                        v-model.number="radius"
                        type="number"
                        min="1"
                        step="1"
                        class="form-input"
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">{{ t('regionFormModal.description') }}</span>
                    <textarea
                        v-model="description"
                        class="form-textarea"
                        rows="3"
                        :placeholder="t('regionFormModal.aQuietFarmingSettlementBy')"
                    ></textarea>
                </label>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('regionFormModal.cancel') }}</button>
                    <button
                        class="action-btn action-btn--primary"
                        :disabled="!name.trim() || !radiusIsValid"
                        @click="onSave"
                    >{{ isEditing ? t('regionFormModal.save') : t('regionFormModal.nameThisArea') }}</button>
                </div>
            </div>
        </div>
    `
};
