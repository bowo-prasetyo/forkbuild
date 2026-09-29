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
//
// 0.2.26: that passive notice is now actionable — "View" emits
// 'view-here' so the host can open LocationDocumentsDialog
// (WorldNavigationSession.getDocumentsAtPosition), turning "3
// documents overlap at this location" into an actual list a person can
// pick from and focus.
//
// 0.9.197 — World Placement Removal UI Action. "Remove from World"
// emits 'remove' for the host to call
// WorldNavigationSession.removePlacement() — the mirror of 'move',
// gated the same way on `info.removable`. Deliberately NOT
// "Unpublish"/"Delete": this panel describes WHERE a Publication sits
// (see this file's own 0.2.23 header), and removing a placement never
// touches the Publication, the Document, or its material — it just
// takes this specific location back. See docs/Principles.md, "A
// Publication Is What; A Placement Is Where."
import { t } from '../i18n/i18n.js';
export default {
    name: 'PlacementInfoPanel',
    props: {
        info: {
            type: Object,
            default: null
        }
    },
    emits: ['focus', 'move', 'remove', 'view-here'],
    methods: { t },
    template: `
        <div v-if="info" class="placement-info-panel">
            <h4>{{ t('placementInfoPanel.placement') }}</h4>
            <div class="info-row">
                <span class="info-label">{{ t('placementInfoPanel.positionWorldUnits') }}</span>
                <span class="info-value">
                    {{ info.position.x.toFixed(1) }}, {{ info.position.y.toFixed(1) }}, {{ info.position.z.toFixed(1) }}
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('placementInfoPanel.revision') }}</span>
                <span class="info-value">{{ info.revision }}</span>
            </div>
            <div class="info-row" v-if="info.owner">
                <span class="info-label">{{ t('placementInfoPanel.owner') }}</span>
                <span class="info-value">{{ info.owner }}</span>
            </div>
            <p v-if="!info.movable" class="editability-notice editability-notice--blocked">
                {{ t('placementInfoPanel.notYours', { owner: info.owner }) }}
            </p>
            <p v-if="info.overlapCount > 0" class="placement-overlap-notice">
                {{ t('placementInfoPanel.overlap', { count: info.overlapCount }) }}
                <button type="button" class="inline-link-btn" @click="$emit('view-here')">{{ t('placementInfoPanel.view') }}</button>
            </p>
            <div class="info-actions">
                <button class="action-btn" @click="$emit('focus')">{{ t('placementInfoPanel.focus') }}</button>
                <button class="action-btn" :disabled="!info.movable" @click="$emit('move')">{{ t('placementInfoPanel.move') }}</button>
                <button class="action-btn action-btn--danger" :disabled="!info.removable" @click="$emit('remove')">{{ t('placementInfoPanel.removeFromWorld') }}</button>
            </div>
        </div>
    `
};
