import { WorldSpatialActivity } from '../../core/WorldSpatialActivity.js';

// 0.3.0 — Collaborative Spatial Presence.
//
// World View's understated 2D counterpart to
// renderer/RemoteSpatialPresenceRenderer.js's in-scene markers — the
// same "compact, non-intrusive" instinct ui/components/WorldPresenceIndicator.js
// (0.2.99) already established for coarse presence, applied one rung
// further: not just "N online," but "N online, here's roughly what
// they're doing." Deliberately small in scope compared to 0.2.99's own
// WorldCollaborationRoster.js/WorldMembersPanel.js split — there is no
// grant/revoke affordance here, nothing to manage, so the pure
// composition step and the presentation component stay in this one
// file rather than two.
//
// buildSpatialCollaboratorRows() joins
// application/WorldNavigationSession.js#getWorldSpatialPresenceRoster()'s
// own device-level roster (unmodified) into ONE row per identity — the
// same device-aggregation-is-per-ROW rule WorldMembersPanel's own
// header already establishes for the coarser 0.2.98 roster. A row's
// `activity` is the single MOST NOTEWORTHY activity across that
// identity's own live devices (BUILDING beats merely WALKING, exactly
// "Bob is editing on his Desktop even though his Tablet is merely
// watching" — the identical precedent
// application/WorldPresenceUseCase.js#getRoster() already set for its
// own EXPLORING/EDITING pair, applied to this richer vocabulary). A
// pure function: no Vue, no DOM, no network — testable on its own,
// exactly like buildWorldCollaborationRoster() itself.
const ACTIVITY_PRIORITY = [
    WorldSpatialActivity.MOVING_STRUCTURE,
    WorldSpatialActivity.ROTATING_STRUCTURE,
    WorldSpatialActivity.BUILDING,
    WorldSpatialActivity.INSPECTING,
    WorldSpatialActivity.WALKING,
    WorldSpatialActivity.IDLE
];

function mostNoteworthyActivity(devices) {
    let best = WorldSpatialActivity.IDLE;
    let bestRank = ACTIVITY_PRIORITY.length - 1;
    for (const device of devices) {
        const rank = ACTIVITY_PRIORITY.indexOf(device.activity);
        if (rank !== -1 && rank < bestRank) {
            bestRank = rank;
            best = device.activity;
        }
    }
    return best;
}

export function buildSpatialCollaboratorRows(spatialRoster, { resolveDisplayName = null } = {}) {
    if (!Array.isArray(spatialRoster)) {
        return [];
    }
    return spatialRoster
        .filter((group) => group && Array.isArray(group.devices) && group.devices.length > 0)
        .map((group) => ({
            identityId: group.identityId,
            displayName: typeof resolveDisplayName === 'function' ? resolveDisplayName(group.identityId) : group.identityId,
            deviceCount: group.devices.length,
            activity: mostNoteworthyActivity(group.devices)
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const ACTIVITY_LABELS = Object.freeze({
    [WorldSpatialActivity.IDLE]: 'Here',
    [WorldSpatialActivity.WALKING]: 'Walking',
    [WorldSpatialActivity.INSPECTING]: 'Inspecting',
    [WorldSpatialActivity.BUILDING]: 'Building',
    [WorldSpatialActivity.MOVING_STRUCTURE]: 'Moving a structure',
    [WorldSpatialActivity.ROTATING_STRUCTURE]: 'Rotating a structure'
});

export default {
    name: 'WorldCollaboratorIndicator',
    props: {
        // Array<{ identityId, displayName, deviceCount, activity }> —
        // buildSpatialCollaboratorRows()'s own output. The host view
        // computes this (see ui/views/WorldView.js) so this component
        // stays purely presentational, exactly WorldMembersPanel's own
        // `roster` prop convention.
        rows: {
            type: Array,
            default: () => []
        }
    },
    methods: {
        activityLabel(activity) {
            return ACTIVITY_LABELS[activity] || ACTIVITY_LABELS[WorldSpatialActivity.IDLE];
        },
        // A stable, deterministic identityId -> color, the SAME hue
        // formula renderer/RemoteSpatialPresenceRenderer.js's own
        // hashHue() uses, so a row's dot and that identity's in-scene
        // marker read as the same color. Deliberately a separate, small
        // copy rather than a shared import — presentation-only, exactly
        // the precedent renderer/AvatarRenderer.js's own SKIN_TONE_COLORS
        // header already sets ("a separate, smaller copy... The two are
        // not shared on purpose").
        dotColor(identityId) {
            let hash = 0;
            const id = identityId || '';
            for (let i = 0; i < id.length; i++) {
                hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
            }
            return `hsl(${hash % 360}, 70%, 55%)`;
        }
    },
    template: `
        <ul v-if="rows.length" class="world-collaborator-indicator" aria-label="Who else is here">
            <li
                v-for="row in rows"
                :key="row.identityId"
                class="world-collaborator-indicator-row"
            >
                <span class="world-collaborator-indicator-dot" :style="{ background: dotColor(row.identityId) }" aria-hidden="true"></span>
                <span class="world-collaborator-indicator-name">{{ row.displayName }}</span>
                <span class="world-collaborator-indicator-activity">{{ activityLabel(row.activity) }}</span>
                <span v-if="row.deviceCount > 1" class="world-collaborator-indicator-devices">· {{ row.deviceCount }} devices</span>
            </li>
        </ul>
    `
};
