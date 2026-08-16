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
            aria-label="Documents at this location"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel location-documents">
                <h3>Documents Here</h3>
                <p v-if="position" class="form-hint form-hint--neutral">
                    {{ position.x.toFixed(1) }}, {{ position.y.toFixed(1) }}, {{ position.z.toFixed(1) }} (World Units)
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
                        >Focus</button>
                    </li>
                    <li v-if="occupants.length === 0" class="location-documents-empty">
                        Nothing else is recorded at this exact position.
                    </li>
                </ul>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
