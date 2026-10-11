import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { t } from '../i18n/i18n.js';

// A reminder, beside what was just published, that the identity it was
// signed with has no passphrase yet (as a quick start in LoginModal.js makes
// one), with the way to add one on My Identities. Shows nothing for a
// protected identity, or when nobody is logged in.
export default {
    name: 'ProtectIdentityNote',
    setup() {
        const identityUseCase = inject('identityUseCase', null);
        const unprotected = ref(false);
        let unsubscribe = null;

        function refresh() {
            if (!identityUseCase) {
                unprotected.value = false;
                return;
            }
            const session = identityUseCase.currentSession();
            const current = session && session.isAuthenticated
                ? identityUseCase.listIdentities().find((identity) => identity.identityId === session.identityId)
                : null;
            unprotected.value = Boolean(current && !current.isProtected);
        }

        onMounted(() => {
            refresh();
            if (identityUseCase && typeof identityUseCase.onUserChanged === 'function') {
                unsubscribe = identityUseCase.onUserChanged(refresh);
            }
        });
        onBeforeUnmount(() => { if (unsubscribe) unsubscribe(); });

        return { t, unprotected };
    },
    template: `
        <p v-if="unprotected" class="protect-identity-note">
            {{ t('protectIdentityNote.text') }}
            <router-link to="/identity" class="protect-identity-note-link">{{ t('protectIdentityNote.action') }}</router-link>
        </p>
    `
};
