import { ref, watch, inject, onBeforeUnmount } from 'vue';
import { t } from '../i18n/i18n.js';

// Follow / Following for one identity (application/identity/FollowUseCase.js).
// Hidden when nobody is signed in, for the signed-in identity itself, and for
// anything but a did:key. Following is private to this device.
export default {
    name: 'FollowButton',
    props: {
        identityId: { type: String, default: null },
        // Shown for the follow until their work has been seen here; a label only.
        name: { type: String, default: null },
        // World View already has a camera "Follow", so it says which follow this is.
        // Default to "Follow" and "Following ✓" in the chosen language.
        followLabel: { type: String, default: null },
        followingLabel: { type: String, default: null }
    },
    setup(props) {
        const followUseCase = inject('followUseCase', null);
        const error = ref('');
        const available = ref(false);
        const following = ref(false);
        function refresh() {
            available.value = Boolean(followUseCase && followUseCase.canFollow(props.identityId));
            following.value = available.value && followUseCase.isFollowing(props.identityId);
        }
        refresh();
        watch(() => props.identityId, refresh);
        const unsubscribe = followUseCase ? followUseCase.onFollowingChanged(refresh) : null;
        onBeforeUnmount(() => { if (unsubscribe) unsubscribe(); });

        function toggle() {
            error.value = '';
            try {
                if (following.value) {
                    followUseCase.unfollow(props.identityId);
                } else {
                    followUseCase.follow(props.identityId, { name: props.name });
                }
            } catch (e) {
                error.value = String(e.message || e).replace(/^FollowUseCase:\s*/, '');
            }
        }

        return { t, available, following, error, toggle };
    },
    template: `
        <span v-if="available" class="follow-button">
            <button type="button"
                    :class="['action-btn', following ? 'action-btn--secondary follow-button--following' : 'action-btn--primary']"
                    :aria-pressed="following ? 'true' : 'false'"
                    :title="following ? t('followButton.stopFollowingOnlyThisDevice') : t('followButton.seeTheirNewWorkUnder')"
                    @click="toggle">{{ following ? (followingLabel || t('followButton.following')) : (followLabel || t('followButton.follow')) }}</button>
            <span v-if="error" class="identity-unlock-error">{{ error }}</span>
        </span>
    `
};
