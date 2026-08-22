import { WorldSpatialActivity } from '../../core/WorldSpatialActivity.js';
import { describeSpatialActivity } from '../../core/WorldSpatialAnchor.js';

// 0.3.0 — Collaborative Spatial Presence. 0.3.1 — Collaborative Spatial
// Awareness adds the contextual activity text and the Follow action; see
// each function/prop's own comment below for exactly what changed.
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
// own EXPLORING/EDITING pair, applied to this richer vocabulary), and
// `primaryDeviceId` is that SAME device's own id — the one a "Follow"
// click focuses (see ui/views/WorldView.js). A pure function: no Vue,
// no DOM, no network — testable on its own, exactly like
// buildWorldCollaborationRoster() itself.
const ACTIVITY_PRIORITY = [
    WorldSpatialActivity.MOVING_STRUCTURE,
    WorldSpatialActivity.ROTATING_STRUCTURE,
    WorldSpatialActivity.BUILDING,
    WorldSpatialActivity.INSPECTING,
    WorldSpatialActivity.WALKING,
    WorldSpatialActivity.IDLE
];

// Returns the most-noteworthy DEVICE itself (0.3.0 only ever needed its
// activity string) — 0.3.1 also needs that device's own `deviceId` (for
// Follow) and `selection` (to resolve a contextual label), so the whole
// device wins rather than just the activity it contributed. Ties/no
// signal fall back to the group's first device, deterministically —
// exactly as arbitrary, and exactly as reproducible, as 0.3.0's own
// default of a bare WorldSpatialActivity.IDLE was.
function mostNoteworthyDevice(devices) {
    let best = devices[0] || null;
    let bestRank = ACTIVITY_PRIORITY.indexOf(WorldSpatialActivity.IDLE);
    for (const device of devices) {
        const rank = ACTIVITY_PRIORITY.indexOf(device.activity);
        if (rank !== -1 && rank < bestRank) {
            bestRank = rank;
            best = device;
        }
    }
    return best;
}

export function buildSpatialCollaboratorRows(spatialRoster, { resolveDisplayName = null, resolveSelectionLabel = null } = {}) {
    if (!Array.isArray(spatialRoster)) {
        return [];
    }
    return spatialRoster
        .filter((group) => group && Array.isArray(group.devices) && group.devices.length > 0)
        .map((group) => {
            const device = mostNoteworthyDevice(group.devices);
            // 0.3.1 — "what is this identity's most-noteworthy device
            // actually pointing at" (e.g. "House"), resolved entirely by
            // the caller (see application/WorldNavigationSession.js#
            // _resolveSpatialContextualLabel()) — this function stays as
            // pure as it always was, never reaching into a World itself.
            const contextualLabel = typeof resolveSelectionLabel === 'function' ? resolveSelectionLabel(device.selection) : null;
            return {
                identityId: group.identityId,
                displayName: typeof resolveDisplayName === 'function' ? resolveDisplayName(group.identityId) : group.identityId,
                deviceCount: group.devices.length,
                activity: device.activity,
                activityLabel: describeSpatialActivity(device.activity, contextualLabel),
                primaryDeviceId: device.deviceId
            };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export default {
    name: 'WorldCollaboratorIndicator',
    props: {
        // Array<{ identityId, displayName, deviceCount, activity,
        // activityLabel, primaryDeviceId }> — buildSpatialCollaboratorRows()'s
        // own output. The host view computes this (see
        // ui/views/WorldView.js) so this component stays purely
        // presentational, exactly WorldMembersPanel's own `roster` prop
        // convention.
        rows: {
            type: Array,
            default: () => []
        }
    },
    // 0.3.1 — "Follow" is a NAVIGATION request, never a shared camera or
    // a remote command: this component only ever emits which
    // `primaryDeviceId` was clicked. The host view (ui/views/WorldView.js)
    // is the one that actually calls `session.focusCollaborator()` — see
    // docs/Principles.md, "Follow Is Local Camera Navigation, Never A
    // Shared Camera (0.3.1)."
    emits: ['follow'],
    methods: {
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
                <span class="world-collaborator-indicator-activity">{{ row.activityLabel }}</span>
                <span v-if="row.deviceCount > 1" class="world-collaborator-indicator-devices">· {{ row.deviceCount }} devices</span>
                <button
                    v-if="row.primaryDeviceId"
                    type="button"
                    class="world-collaborator-indicator-follow"
                    :aria-label="'Follow ' + row.displayName"
                    @click="$emit('follow', row.primaryDeviceId)"
                >Follow</button>
            </li>
        </ul>
    `
};
