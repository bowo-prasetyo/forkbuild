import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { WalkTogetherFailure, WalkTogetherStatus } from '../../application/walkTogether/WalkTogether.js';
import { OpenPublicationLinkOutcome } from '../../application/publication/OpenPublicationLink.js';
import { parseWalkTogetherCode } from '../../core/WalkTogetherCode.js';
import LoginModal from '../components/LoginModal.js';
import { walkTogetherFailureText } from '../components/walkTogether/walkTogetherText.js';
import { t } from '../i18n/i18n.js';

// A "Walk here with me" link (`#/walk/<code>`, core/WalkTogetherCode.js),
// opened by a friend: once logged in (a guest walks as their own avatar,
// under their name) and after saying Join, it meets the host
// (application/walkTogether/WalkTogether.js), checks and keeps the World the
// host sends as a shared link's build is checked (openPublicationLink), and
// opens it in World View, where the two see each other.
//
// Join is a click rather than automatic: joining connects this device
// directly to the host's, which shows each of them the other's IP address,
// so the page says so first.
export default {
    name: 'WalkTogetherJoinView',
    components: { LoginModal },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const walkTogether = inject('walkTogether', null);
        const identityUseCase = inject('identityUseCase', null);
        const openLink = inject('openPublicationLink', null);
        const funnel = inject('funnelEventCounter', null);
        // Another walk link opened from this page reuses it: everything
        // follows the link's code.
        const code = computed(() => (typeof route.params.code === 'string' ? route.params.code : ''));
        const validCode = computed(() => parseWalkTogetherCode(code.value) !== null);
        const available = Boolean(walkTogether && walkTogether.available && openLink);

        const user = ref(identityUseCase ? identityUseCase.currentUser() : null);
        const canWalk = ref(Boolean(walkTogether && walkTogether.canWalk()));
        const signingIn = ref(false);
        const guest = shallowRef(null);
        const state = ref(null);
        let unsubscribeGuest = null;
        let unsubscribeUser = null;

        function refreshUser() {
            user.value = identityUseCase ? identityUseCase.currentUser() : null;
            canWalk.value = Boolean(walkTogether && walkTogether.canWalk());
        }

        async function openWorld(linkOnly) {
            const result = await openLink({ linkOnly });
            return { opened: result.outcome === OpenPublicationLinkOutcome.OPENED, documentId: result.documentId || null };
        }

        function stop() {
            if (unsubscribeGuest) unsubscribeGuest();
            unsubscribeGuest = null;
            if (guest.value) guest.value.close();
            guest.value = null;
        }

        async function join() {
            refreshUser();
            if (!canWalk.value) {
                signingIn.value = true;
                return;
            }
            stop();
            const next = walkTogether.createGuest(code.value, { openWorld, guestName: user.value ? user.value.displayName : null });
            guest.value = next;
            state.value = next.state;
            unsubscribeGuest = next.onChange((changed) => {
                state.value = changed;
                if (changed.status === WalkTogetherStatus.JOINED) {
                    if (funnel) funnel.joinedWalk();
                    router.replace({ path: `/world/${changed.documentId}` });
                }
            });
            await next.start();
        }

        // Back to Join, which says what joining shares before anything connects.
        function signedIn() {
            signingIn.value = false;
            refreshUser();
        }

        watch(code, () => {
            stop();
            state.value = null;
            signingIn.value = false;
        });

        onMounted(() => {
            if (identityUseCase && typeof identityUseCase.onUserChanged === 'function') {
                unsubscribeUser = identityUseCase.onUserChanged(refreshUser);
            }
        });
        // Leaving before the World opens ends the meeting; a connection already
        // made stays, like any peer connection.
        onBeforeUnmount(() => {
            if (unsubscribeUser) unsubscribeUser();
            if (unsubscribeGuest) unsubscribeGuest();
            unsubscribeGuest = null;
            if (guest.value && guest.value.state.status !== WalkTogetherStatus.JOINED) guest.value.close();
        });

        const busy = computed(() => Boolean(state.value) && [WalkTogetherStatus.STARTING, WalkTogetherStatus.CONNECTING, WalkTogetherStatus.JOINING, WalkTogetherStatus.JOINED].includes(state.value.status));
        // A World that didn't check out won't check out on a second try.
        const failed = computed(() => Boolean(state.value) && state.value.status === WalkTogetherStatus.FAILED);
        const canRetry = computed(() => failed.value && state.value.failure !== WalkTogetherFailure.WORLD_NOT_VERIFIED);
        const progressText = computed(() => {
            if (!state.value) return '';
            switch (state.value.status) {
            case WalkTogetherStatus.JOINING:
                return state.value.hostName ? t('walkTogether.join.joining', { name: state.value.hostName }) : t('walkTogether.join.joiningSomeone');
            case WalkTogetherStatus.JOINED:
                return t('walkTogether.join.joined');
            default:
                return t('walkTogether.join.connecting');
            }
        });

        return {
            t, validCode, available, user, canWalk, signingIn, state, busy, failed, canRetry, progressText, join, signedIn,
            failureText: () => walkTogetherFailureText(state.value && state.value.failure)
        };
    },
    template: `
        <section class="walk-together-join-view">
            <h1>{{ t('walkTogether.join.title') }}</h1>
            <p class="walk-together-lead">{{ t('walkTogether.join.lead') }}</p>
            <p v-if="!validCode" class="walk-together-note walk-together-failure" role="alert">{{ t('walkTogether.failure.invalidCode') }}</p>
            <p v-else-if="!available" class="walk-together-note">{{ t('walkTogether.unavailable') }}</p>
            <template v-else>
                <template v-if="!canWalk">
                    <p class="walk-together-note">{{ t('walkTogether.join.signInWhy') }}</p>
                    <button type="button" class="cta-button walk-together-sign-in" @click="signingIn = true">{{ t('walkTogether.join.signIn') }}</button>
                </template>
                <template v-else-if="!busy">
                    <p v-if="user && user.displayName" class="walk-together-as">{{ t('walkTogether.join.as', { name: user.displayName }) }}</p>
                    <p class="walk-together-privacy">{{ t('walkTogether.join.privacy') }}</p>
                    <p v-if="failed" class="walk-together-note walk-together-failure" role="alert">{{ failureText() }}</p>
                    <button v-if="!failed || canRetry" type="button" class="cta-button walk-together-join" @click="join">
                        {{ failed ? t('walkTogether.tryAgain') : t('walkTogether.join.join') }}
                    </button>
                </template>
                <p v-else class="walk-together-progress" role="status">{{ progressText }}</p>
            </template>
            <p class="walk-together-home"><router-link to="/">{{ t('walkTogether.join.home') }}</router-link></p>
            <LoginModal v-if="signingIn" purpose="walk" @signed-in="signedIn" @close="signingIn = false" />
        </section>
    `
};
