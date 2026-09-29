// 0.2.26 — "Documents at this location," the actionable follow-through
// on 0.2.25's passive overlap count. Opened from PlacementInfoPanel's
// "View" link once info.overlapCount > 0. Pure presentation: renders
// whatever WorldNavigationSession.getDocumentsAtPosition() produced
// and emits 'focus'/'cancel' for the host to act on — same convention
// as PlacementEditorDialog/MetadataEditorDialog.
//
// Every entry here is a PUBLISHED placement — an editing fork never
// appears (it has no PlacementRecord of its own; see
// WorldNavigationSession.getDocumentsAtPosition). That's a deliberate
// scope boundary, not an oversight: this dialog answers "which
// published works occupy this coordinate," not "everything currently
// rendered near this coordinate."
//
// 0.9.201 — `occupants` also never contains a placement whose own
// Publication can no longer be resolved (e.g. unpublished; 0.9.200's
// documented, intentional orphan). getDocumentsAtPosition() omits
// those before this component ever renders — this dialog stays exactly
// as ignorant of WHY an occupant might be missing as it always was; it
// simply never receives one it can't meaningfully present. The
// `:disabled="!doc.documentId"` guard below is kept regardless, as
// defense in depth for any future caller of this same component.
import { formatNumber, t } from '../i18n/i18n.js';
export default {
    name: 'LocationDocumentsDialog',
    props: {
        position: {
            type: Object,
            default: null
        },
        occupants: {
            type: Array,
            default: () => []
        }
    },
    emits: ['focus', 'cancel'],
    methods: {
        t,
        formatNumber,
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
            :aria-label="t('locationDocumentsDialog.documentsAtThisLocation')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel location-documents">
                <h3>{{ t('locationDocumentsDialog.documentsHere') }}</h3>
                <p v-if="position" class="form-hint form-hint--neutral">
                    {{ t('units.position', { x: formatNumber(position.x, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }), y: formatNumber(position.y, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }), z: formatNumber(position.z, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }) }) }}
                </p>

                <ul class="location-documents-list">
                    <li v-for="doc in occupants" :key="doc.publicationId" class="location-documents-item">
                        <div class="location-documents-item-info">
                            <span class="location-documents-item-title">{{ doc.title }}</span>
                            <span v-if="doc.owner" class="location-documents-item-owner">{{ doc.owner }}</span>
                        </div>
                        <button
                            class="action-btn"
                            :disabled="!doc.documentId"
                            @click="$emit('focus', doc.documentId)"
                        >{{ t('locationDocumentsDialog.focus') }}</button>
                    </li>
                    <li v-if="occupants.length === 0" class="location-documents-empty">
                        {{ t('locationDocumentsDialog.nothingElseIsRecordedAt') }}
                    </li>
                </ul>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('locationDocumentsDialog.close') }}</button>
                </div>
            </div>
        </div>
    `
};
