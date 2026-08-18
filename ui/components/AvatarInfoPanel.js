import { describeLifecycleState, describeTrustStatus } from '../../application/AvatarPresenceLabels.js';

// 0.2.39 — the World Entity Interaction & Selection design doc's own
// mockup, verbatim in what it shows AND in what it deliberately never
// shows:
//
//   Alice
//   ────────────────
//   Avatar
//   Humanoid 01
//
//   Status
//   ● Present · Trusted
//
//   Position
//   X 124.2
//   Y   0.0
//   Z -52.7
//
//   Distance
//   18.4 World Units
//
//   Animation
//   Walking
//
// No "Edit". No "Move". No "Delete". No "Save". A remote avatar is
// not a document — see docs/Principles.md, "Avatars Are Never
// Document Selection." Pure presentation, exactly like
// DocumentInfoPanel/PlacementInfoPanel: renders whatever
// WorldNavigationSession.getAvatarInfo() produced and emits
// 'follow'/'stop-follow' for the host to act on. "Follow" only ever
// appears for a REMOTE avatar — following yourself is meaningless,
// and the existing "Follow Avatar" checkbox already covers your own
// avatar (0.2.36).
//
// 0.2.44 — three more buttons join Follow, also REMOTE-avatar-only:
// Greet/Wave/Point, emitting a single 'interact' event carrying the
// core/AvatarInteractionKind.js value. This panel has no opinion about
// cooldowns or whether the click actually took effect — it just asks;
// WorldNavigationSession.performAvatarInteraction() is the one place
// that decides yes/no (see docs/Principles.md, "An Interaction
// Request Is Not Authority Over Another Avatar"). No "Inspect
// Profile" button: this panel being open already IS the inspection —
// see docs/Principles.md, "Looking At Something Is Never The Same As
// Acting On It" — reusing that existing surface rather than adding a
// second, redundant one.
export default {
    name: 'AvatarInfoPanel',
    props: {
        info: {
            type: Object,
            default: null
        },
        following: {
            type: Boolean,
            default: false
        }
    },
    emits: ['follow', 'stop-follow', 'interact'],
    methods: {
        lifecycleLabel(state) {
            return describeLifecycleState(state);
        },
        trustLabel(status) {
            return describeTrustStatus(status);
        },
        statusDotClass(info) {
            if (info.trustStatus === 'EQUIVOCATING' || info.trustStatus === 'UNAUTHORIZED') {
                return 'avatar-info-status-dot--conflicting';
            }
            if (info.lifecycleState === 'stale') {
                return 'avatar-info-status-dot--stale';
            }
            return 'avatar-info-status-dot--present';
        }
    },
    template: `
        <div v-if="info" class="avatar-info-panel">
            <h4>{{ info.displayName }}</h4>

            <div class="info-row">
                <span class="info-label">Avatar</span>
                <span class="info-value">
                    {{ info.templateLabel || 'Unknown' }}
                    <span v-if="info.templatePlaceholder" class="avatar-info-placeholder-note">(placeholder — appearance not yet synchronized)</span>
                </span>
            </div>

            <div class="info-row" v-if="info.isLocal">
                <span class="info-label">Status</span>
                <span class="info-value">This is you</span>
            </div>
            <div class="info-row" v-else>
                <span class="info-label">Status</span>
                <span class="info-value">
                    <span :class="['avatar-info-status-dot', statusDotClass(info)]"></span>
                    {{ lifecycleLabel(info.lifecycleState) }} · {{ trustLabel(info.trustStatus) }}
                </span>
            </div>

            <div class="info-row">
                <span class="info-label">Position</span>
                <span class="info-value">
                    X {{ info.position.x.toFixed(1) }}<br>
                    Y {{ info.position.y.toFixed(1) }}<br>
                    Z {{ info.position.z.toFixed(1) }}
                </span>
            </div>

            <div class="info-row" v-if="info.distance !== null">
                <span class="info-label">Distance</span>
                <span class="info-value">{{ info.distance.toFixed(1) }} World Units</span>
            </div>

            <div class="info-row">
                <span class="info-label">Animation</span>
                <span class="info-value">{{ info.animation }}</span>
            </div>

            <div class="info-actions" v-if="!info.isLocal">
                <button v-if="!following" class="action-btn" @click="$emit('follow')">Follow</button>
                <button v-else class="action-btn action-btn--primary" @click="$emit('stop-follow')">Stop Following</button>
                <button class="action-btn" @click="$emit('interact', 'greet')">Greet</button>
                <button class="action-btn" @click="$emit('interact', 'wave')">Wave</button>
                <button class="action-btn" @click="$emit('interact', 'point')">Point</button>
            </div>
        </div>
    `
};
