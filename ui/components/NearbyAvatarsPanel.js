import { describeLifecycleState, describeTrustStatus } from '../../application/AvatarPresenceLabels.js';

// 0.2.43 — the design doc's own mockup, verbatim:
//
//   Nearby Avatars
//   -------------------------
//   ● Alice
//     3.8 units
//     Walking
//
//   ● Bob
//     12.4 units
//     Idle
//
// Pure presentation, exactly like AvatarInfoPanel — renders whatever
// `entries` (WorldNavigationSession.getNearbyAvatars(), enriched with
// a resolved displayName by the host — see ui/views/WorldView.js) was
// handed, and emits 'select' for the host to act on. Reuses the SAME
// `.avatar-info-status-dot` visual language AvatarInfoPanel already
// established for lifecycle/trust — one status dot means one thing
// everywhere in this UI, not a second, differently-colored vocabulary
// invented here.
//
// Clicking a row targets that avatar exactly the way clicking it in
// the 3D viewport already does (WorldNavigationSession.targetAvatar())
// — the SAME Avatar Info panel opens, with the SAME Follow button
// already wired to followAvatarId(). No new camera mechanism, no new
// interaction surface: this list is just another way to REACH an
// avatarId, never a second inspection or follow implementation.
export default {
    name: 'NearbyAvatarsPanel',
    props: {
        entries: {
            type: Array,
            default: () => []
        }
    },
    emits: ['select'],
    methods: {
        lifecycleLabel(state) {
            return describeLifecycleState(state);
        },
        trustLabel(status) {
            return describeTrustStatus(status);
        },
        statusDotClass(entry) {
            if (entry.trustStatus === 'EQUIVOCATING' || entry.trustStatus === 'UNAUTHORIZED') {
                return 'avatar-info-status-dot--conflicting';
            }
            if (entry.lifecycleState === 'stale') {
                return 'avatar-info-status-dot--stale';
            }
            return 'avatar-info-status-dot--present';
        }
    },
    template: `
        <div v-if="entries.length > 0" class="nearby-avatars-panel">
            <h4>Nearby Avatars</h4>
            <ul class="nearby-avatars-list">
                <li
                    v-for="entry in entries"
                    :key="entry.avatarId"
                    class="nearby-avatars-item"
                    @click="$emit('select', entry.avatarId)"
                >
                    <div class="nearby-avatars-item-info">
                        <span class="nearby-avatars-item-name">
                            <span :class="['avatar-info-status-dot', statusDotClass(entry)]"></span>
                            {{ entry.displayName }}
                        </span>
                        <span class="nearby-avatars-item-distance">{{ entry.distance.toFixed(1) }} World Units</span>
                        <span class="nearby-avatars-item-detail">{{ entry.animation }} · {{ lifecycleLabel(entry.lifecycleState) }} · {{ trustLabel(entry.trustStatus) }}</span>
                    </div>
                </li>
            </ul>
        </div>
    `
};
