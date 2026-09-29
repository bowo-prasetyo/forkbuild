import { describeLifecycleState, describeTrustStatus, describeAnimationState } from '../../application/avatar/AvatarPresenceLabels.js';
import { formatNumber, t } from '../i18n/i18n.js';
import FollowButton from './FollowButton.js';

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
// that decides yes/no (see docs/Principles.md, "Observation
// Does Not Imply Authority, And Interaction Does Not Imply Control"). No "Inspect
// Profile" button: this panel being open already IS the inspection —
// see docs/Principles.md, "Looking At Something Is Never The Same As
// Acting On It" — reusing that existing surface rather than adding a
// second, redundant one.
export default {
    name: 'AvatarInfoPanel',
    components: { FollowButton },
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
        t,
        formatNumber,
        lifecycleLabel(state) {
            return t(describeLifecycleState(state));
        },
        trustLabel(status) {
            return t(describeTrustStatus(status));
        },
        animationLabel(state) {
            return t(describeAnimationState(state));
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
                <span class="info-label">{{ t('avatarInfoPanel.avatar') }}</span>
                <span class="info-value">
                    {{ info.templateLabel || t('avatarInfoPanel.unknown') }}
                    <span v-if="info.templatePlaceholder" class="avatar-info-placeholder-note">{{ t('avatarInfoPanel.placeholderAppearanceNotYetSynchronized') }}</span>
                </span>
            </div>

            <div class="info-row" v-if="info.isLocal">
                <span class="info-label">{{ t('avatarInfoPanel.status') }}</span>
                <span class="info-value">{{ t('avatarInfoPanel.thisIsYou') }}</span>
            </div>
            <div class="info-row" v-else>
                <span class="info-label">{{ t('avatarInfoPanel.status') }}</span>
                <span class="info-value">
                    <span :class="['avatar-info-status-dot', statusDotClass(info)]"></span>
                    {{ lifecycleLabel(info.lifecycleState) }} · {{ trustLabel(info.trustStatus) }}
                </span>
            </div>

            <div class="info-row">
                <span class="info-label">{{ t('avatarInfoPanel.position') }}</span>
                <span class="info-value">
                    X {{ info.position.x.toFixed(1) }}<br>
                    Y {{ info.position.y.toFixed(1) }}<br>
                    Z {{ info.position.z.toFixed(1) }}
                </span>
            </div>

            <div class="info-row" v-if="info.distance !== null">
                <span class="info-label">{{ t('avatarInfoPanel.distance') }}</span>
                <span class="info-value">{{ t('units.worldUnits', { value: formatNumber(info.distance, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }) }) }}</span>
            </div>

            <div class="info-row">
                <span class="info-label">{{ t('avatarInfoPanel.animation') }}</span>
                <span class="info-value">{{ animationLabel(info.animation) }}</span>
            </div>

            <div class="info-actions" v-if="!info.isLocal">
                <button v-if="!following" class="action-btn" @click="$emit('follow')">{{ t('avatarInfoPanel.followAvatar') }}</button>
                <button v-else class="action-btn action-btn--primary" @click="$emit('stop-follow')">{{ t('avatarInfoPanel.stopFollowingAvatar') }}</button>
                <button class="action-btn" @click="$emit('interact', 'greet')">{{ t('avatarInfoPanel.greet') }}</button>
                <button class="action-btn" @click="$emit('interact', 'wave')">{{ t('avatarInfoPanel.wave') }}</button>
                <button class="action-btn" @click="$emit('interact', 'point')">{{ t('avatarInfoPanel.point') }}</button>
                <FollowButton v-if="info.signerIdentityId" :identity-id="info.signerIdentityId" :name="info.displayName || null"
                              :follow-label="t('avatarInfoPanel.followWork')" :following-label="t('avatarInfoPanel.followingWork')" />
            </div>
        </div>
    `
};
