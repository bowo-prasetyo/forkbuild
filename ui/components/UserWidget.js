import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import LoginModal from './LoginModal.js';

// 0.2.46: reads the same AuthenticationSession every other subsystem
// can now ask about, rather than inferring "logged in" from currentUser()
// alone — see application/IdentityUseCase.js.
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
const VAULT_TIMEOUT_CHECK_INTERVAL_MS = 15000;

export default {
    name: 'UserWidget',
    components: { LoginModal },
    setup() {
        const identityUseCase = inject('identityUseCase');
        const user = ref(identityUseCase.currentUser());
        const lockedIdentityId = ref(null);
        const showModal = ref(false);
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
            showModal.value = true;
        }

        onMounted(() => {
            unsubscribeUser = identityUseCase.onUserChanged((u) => {
                user.value = u;
                refreshLockState();
            });
            unsubscribeLock = identityUseCase.onVaultLockChanged(() => {
                refreshLockState();
            });
            refreshLockState();
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
        });

        return { user, logout, showModal, lockedIdentityId, openLoginOrUnlock };
    },
    template: `
        <div class="user-widget">
            <template v-if="user && lockedIdentityId">
                <span class="user-name user-name--locked" title="This identity's vault is locked — sign-in works, but signing requires the passphrase again">
                    🔒 {{ user.displayName }}
                </span>
                <button class="user-btn user-btn--login" @click="openLoginOrUnlock">Unlock</button>
                <button class="user-btn user-btn--logout" @click="logout">Logout</button>
            </template>
            <template v-else-if="user">
                <span class="user-name">{{ user.displayName }}</span>
                <button class="user-btn user-btn--logout" @click="logout">Logout</button>
            </template>
            <template v-else>
                <button class="user-btn user-btn--login" @click="openLoginOrUnlock">Login</button>
            </template>
            <LoginModal v-if="showModal" :unlock-identity-id="lockedIdentityId" @close="showModal = false" />
        </div>
    `
};
