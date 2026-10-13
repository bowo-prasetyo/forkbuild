import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute } from 'vue-router';
import LoginModal from './LoginModal.js';
import { t } from '../i18n/i18n.js';

// 0.2.46: reads the same AuthenticationSession every other subsystem
// can now ask about, rather than inferring "logged in" from currentUser()
// alone — see application/identity/IdentityUseCase.js.
//
// 0.2.47: "logged in" and "unlocked" can now disagree — a protected
// identity's vault can idle-lock while its AuthenticationSession is
// still AUTHENTICATED (see identity/VaultLock.js). This widget shows
// that as a distinct third state (🔒 name, an Unlock button, no
// Logout-only view) rather than collapsing it into either "logged in"
// or "logged out" — signing genuinely won't work again until the
// passphrase is re-entered, so pretending otherwise would be a UI lying
// about what the app can currently do. A periodic timer calls
// checkVaultTimeouts() so a vault that idles out is noticed here even
// if nothing happens to attempt a sign in the meantime.
//
// The player's words (docs/Pillars.md, "Words"): there is no account, so
// the header never says Login or Logout. With no name it offers **Choose a
// name**, the short name-only dialog Publish uses; with one it shows the
// name, and its menu holds My Avatar, My Identities, Your Data and **Switch
// name**, which picks another name this device holds, makes a new one, or
// goes on with none (docs/reviews/CreativeDirection-2026-10-12c.md).
const VAULT_TIMEOUT_CHECK_INTERVAL_MS = 15000;

export default {
    name: 'UserWidget',
    components: { LoginModal },
    setup() {
        const identityUseCase = inject('identityUseCase');
        const route = useRoute();
        const user = ref(identityUseCase.currentUser());
        const lockedIdentityId = ref(null);
        const showModal = ref(false);
        // Why the dialog is open: 'name' (Choose a name), 'switch' (Switch
        // name) or null (Unlock).
        const modalPurpose = ref(null);
        const menuOpen = ref(false);
        const widget = ref(null);
        const initial = computed(() => (user.value && user.value.displayName ? Array.from(user.value.displayName.trim())[0] || '?' : '?').toUpperCase());
        let unsubscribeUser = null;
        let unsubscribeLock = null;
        let timeoutTimer = null;

        function refreshLockState() {
            const session = identityUseCase.currentSession();
            lockedIdentityId.value = session.isAuthenticated && !identityUseCase.isUnlocked(session.identityId)
                ? session.identityId
                : null;
        }

        function logout() {
            identityUseCase.endSession();
        }

        function openLoginOrUnlock() {
            modalPurpose.value = lockedIdentityId.value ? null : 'name';
            menuOpen.value = false;
            showModal.value = true;
        }

        function switchName() {
            modalPurpose.value = 'switch';
            menuOpen.value = false;
            showModal.value = true;
        }

        function closeMenuOnOutsideClick(event) {
            if (menuOpen.value && widget.value && !widget.value.contains(event.target)) menuOpen.value = false;
        }

        function closeMenuOnEscape(event) {
            if (event.key === 'Escape') menuOpen.value = false;
        }

        watch(() => route.fullPath, () => { menuOpen.value = false; });

        onMounted(() => {
            unsubscribeUser = identityUseCase.onUserChanged((u) => {
                user.value = u;
                refreshLockState();
            });
            unsubscribeLock = identityUseCase.onVaultLockChanged(() => {
                refreshLockState();
            });
            refreshLockState();
            document.addEventListener('click', closeMenuOnOutsideClick);
            document.addEventListener('keydown', closeMenuOnEscape);
            timeoutTimer = setInterval(() => {
                identityUseCase.checkVaultTimeouts();
            }, VAULT_TIMEOUT_CHECK_INTERVAL_MS);
        });

        onBeforeUnmount(() => {
            if (unsubscribeUser) {
                unsubscribeUser();
            }
            if (unsubscribeLock) {
                unsubscribeLock();
            }
            if (timeoutTimer) {
                clearInterval(timeoutTimer);
            }
            document.removeEventListener('click', closeMenuOnOutsideClick);
            document.removeEventListener('keydown', closeMenuOnEscape);
        });

        return {
            t, user, initial, logout, showModal, modalPurpose, menuOpen, widget,
            lockedIdentityId, openLoginOrUnlock, switchName
        };
    },
    template: `
        <div ref="widget" class="user-widget">
            <template v-if="user">
                <div :class="['user-menu', { 'user-menu--open': menuOpen }]">
                    <button
                        type="button"
                        :class="['user-chip', { 'user-chip--locked': lockedIdentityId }]"
                        aria-haspopup="true"
                        :aria-expanded="menuOpen ? 'true' : 'false'"
                        :title="lockedIdentityId ? t('userWidget.thisIdentitySVaultIs') : null"
                        @click="menuOpen = !menuOpen"
                    >
                        <span class="user-chip-initial" aria-hidden="true">{{ lockedIdentityId ? '🔒' : initial }}</span>
                        <span class="user-name">{{ user.displayName }}</span>
                        <span class="user-chip-caret" aria-hidden="true">▾</span>
                    </button>
                    <div class="user-menu-panel" role="menu">
                        <button v-if="lockedIdentityId" type="button" role="menuitem" class="user-menu-item user-menu-unlock" @click="openLoginOrUnlock">{{ t('userWidget.unlock') }}</button>
                        <router-link to="/avatar" role="menuitem" class="user-menu-item">{{ t('app.nav.myAvatar') }}</router-link>
                        <router-link to="/identity" role="menuitem" class="user-menu-item">{{ t('app.nav.myIdentities') }}</router-link>
                        <router-link to="/settings/data" role="menuitem" class="user-menu-item">{{ t('app.nav.yourData') }}</router-link>
                        <button type="button" role="menuitem" class="user-menu-item user-menu-switch" @click="switchName">{{ t('userWidget.switchName') }}</button>
                    </div>
                </div>
            </template>
            <template v-else>
                <button type="button" class="user-btn user-choose-name" @click="openLoginOrUnlock">{{ t('userWidget.chooseName') }}</button>
            </template>
            <LoginModal
                v-if="showModal"
                :purpose="modalPurpose"
                :unlock-identity-id="modalPurpose ? null : lockedIdentityId"
                @close="showModal = false"
                @no-name="logout"
            />
        </div>
    `
};
