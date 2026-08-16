// 0.2.23: WHERE a published world sits in shared space — deliberately
// a separate panel from DocumentInfoPanel (WHAT the document is:
// title/description/license), not a section bolted onto it. See
// docs/Principles.md, "A Publication Is What; A Placement Is Where."
// Pure presentation, same as DocumentInfoPanel: renders whatever
// WorldNavigationSession.getPlacementInfo() produced and emits
// 'focus'/'move' for the host view to act on.
//
// 0.2.25: `info.overlapCount` — a passive "other documents are here
// too" notice, shown regardless of whether this placement got here
// automatically or by an explicit move. Not a warning to act on (that
// only happens in PlacementEditorDialog, at the moment of actually
// choosing a position) — just visibility, matching "the World View
// should make overlaps visible" (docs/Principles.md, "Overlap Is A
// Fact; Collision Is A Policy Decision").
export default {
    name: 'PlacementInfoPanel',
    props: {
        info: {
            type: Object,
            default: null
        }
    },
    emits: ['focus', 'move'],
    template: `
        <div v-if="info" class="placement-info-panel">
            <h4>Placement</h4>
            <div class="info-row">
                <span class="info-label">Position (World Units)</span>
                <span class="info-value">
                    {{ info.position.x.toFixed(1) }}, {{ info.position.y.toFixed(1) }}, {{ info.position.z.toFixed(1) }}
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Revision</span>
                <span class="info-value">{{ info.revision }}</span>
            </div>
            <div class="info-row" v-if="info.owner">
                <span class="info-label">Owner</span>
                <span class="info-value">{{ info.owner }}</span>
            </div>
            <p v-if="!info.movable" class="editability-notice editability-notice--blocked">
                🔒 Placed by {{ info.owner }} — you can view this placement but not move it.
            </p>
            <p v-if="info.overlapCount > 0" class="placement-overlap-notice">
                ⚠ {{ info.overlapCount }} other {{ info.overlapCount === 1 ? 'document shares' : 'documents share' }} this location.
            </p>
            <div class="info-actions">
                <button class="action-btn" @click="$emit('focus')">Focus</button>
                <button class="action-btn" :disabled="!info.movable" @click="$emit('move')">Move</button>
            </div>
        </div>
    `
};
