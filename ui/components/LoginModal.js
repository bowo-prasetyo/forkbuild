import { ref, computed, inject } from 'vue';
import NewPassphraseFields from './NewPassphraseFields.js';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';
import { errorText, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';

// 0.2.46: identity-first login. Previously this modal took a typed
// username and silently derived a signing key from it — "logging back
// in" meant retyping the same string and hoping it mapped to the same
// key. It now shows every LocalIdentity this device actually holds
// (identity/LocalIdentity.js, via IdentityUseCase.listIdentities()) so
// logging back in means picking the identity you already have, and
// creating a new one is an explicit, separate action
// (createIdentity() + authenticate(), never a side effect of typing a
// name). See docs/Principles.md, "Login Unlocks An Identity; It Does
// Not Derive One From A Typed Name."
//
// 0.2.47: a protected identity (identity.isProtected) can't be logged
// into with a single click any more — clicking one opens an inline
// passphrase prompt (`unlockingId`) instead of calling authenticate()
// directly, and a wrong passphrase shows the provider's own
// remaining-attempts/lockout message rather than a generic failure.
// Creating a new identity asks for a passphrase by default (see
// NewPassphraseFields.js); an unprotected identity takes an explicit
// opt-out.
export default {
    name: 'LoginModal',
    props: {
        // 0.2.47: lets a caller (UserWidget, when the current identity's
        // vault has idle-locked) open the modal straight into the unlock
        // prompt for one specific identity, instead of always landing on
        // the plain list.
        unlockIdentityId: { type: String, default: null },
        // 'publish' when opened by Publish: it says why, and offers to
        // publish unsigned instead. 'walk' when opened to walk together
        // (ui/views/WalkTogetherJoinView.js, World View's Walk here with
        // me): it says why.
        purpose: { type: String, default: null }
    },
    // `signed-in` follows `close` after a sign-in; `skip` asks to go on without one.
    emits: ['close', 'signed-in', 'skip'],
    components: { I18nText, NewPassphraseFields },
    setup(props, { emit }) {
        const identityUseCase = inject('identityUseCase');
        const identities = ref(identityUseCase.listIdentities());
        const newLabel = ref('');
        const newPassphrase = ref('');
        const newPassphraseConfirmation = ref('');
        const allowUnprotected = ref(false);
        const createAttempted = ref(false);
        const creating = ref(false);
        const createError = ref('');

        const unlockingId = ref(props.unlockIdentityId);
        const unlockPassphrase = ref('');
        const unlockError = ref('');
        const unlocking = ref(false);

        const sortedIdentities = computed(() =>
            [...identities.value].sort((a, b) => b.createdAt - a.createdAt)
        );

        function signedIn() {
            emit('close');
            emit('signed-in');
        }

        function shortId(identityId) {
            return identityId.slice(-10);
        }

        async function logInAs(identity) {
            if (identity.isProtected) {
                unlockingId.value = identity.identityId;
                unlockPassphrase.value = '';
                unlockError.value = '';
                return;
            }
            await identityUseCase.authenticate(identity.identityId);
            signedIn();
        }

        function cancelUnlock() {
            unlockingId.value = null;
            unlockPassphrase.value = '';
            unlockError.value = '';
        }

        async function confirmUnlock() {
            if (!unlockPassphrase.value) {
                return;
            }
            unlocking.value = true;
            unlockError.value = '';
            try {
                await identityUseCase.authenticate(unlockingId.value, unlockPassphrase.value);
                signedIn();
            } catch (e) {
                unlockError.value = errorText(e).replace(/^LocalIdentityProvider:\s*/, '');
            } finally {
                unlocking.value = false;
            }
        }

        async function createAndLogIn() {
            const label = newLabel.value.trim();
            createAttempted.value = true;
            createError.value = '';
            const evaluation = evaluateNewPassphrase({
                passphrase: newPassphrase.value,
                confirmation: newPassphraseConfirmation.value,
                allowUnprotected: allowUnprotected.value
            });
            if (!label || !evaluation.ok || creating.value) {
                return;
            }
            const passphrase = evaluation.protect ? newPassphrase.value : null;
            creating.value = true;
            try {
                const identity = await identityUseCase.createIdentity(label, passphrase);
                await identityUseCase.authenticate(identity.identityId, passphrase);
                signedIn();
            } catch (e) {
                createError.value = errorText(e).replace(/^LocalIdentityProvider:\s*/, '');
            } finally {
                creating.value = false;
            }
        }

        return {
            t,
            sortedIdentities, newLabel, newPassphrase, newPassphraseConfirmation, allowUnprotected,
            createAttempted, creating, createError, shortId, logInAs, createAndLogIn,
            unlockingId, unlockPassphrase, unlockError, unlocking, cancelUnlock, confirmUnlock
        };
    },
    template: `
        <div class="modal-overlay" @click.self="$emit('close')">
            <div class="modal-content">
                <h3>{{ purpose === 'publish' ? t('loginModal.signInToPublish') : purpose === 'walk' ? t('loginModal.signInToWalk') : t('loginModal.logIn') }}</h3>
                <p v-if="purpose === 'publish'" class="modal-subtitle login-modal-purpose">
                    {{ t('loginModal.publishWhy') }}
                </p>
                <p v-else-if="purpose === 'walk'" class="modal-subtitle login-modal-purpose">
                    {{ t('loginModal.walkWhy') }}
                </p>
                <p class="modal-subtitle">
                    {{ t('loginModal.unlockAnIdentityThisDevice') }}
                </p>

                <div v-if="sortedIdentities.length" class="identity-list">
                    <template v-for="identity in sortedIdentities" :key="identity.identityId">
                        <button
                            v-if="unlockingId !== identity.identityId"
                            class="identity-list-item"
                            @click="logInAs(identity)"
                        >
                            <span class="identity-list-item-label">
                                <span v-if="identity.isProtected" class="identity-lock-icon" :title="t('loginModal.protectedWithAPassphrase')">🔒</span>
                                {{ identity.label }}
                            </span>
                            <span class="identity-list-item-id">…{{ shortId(identity.identityId) }}</span>
                        </button>
                        <div v-else class="identity-unlock-form">
                            <p class="identity-unlock-label">
                                <I18nText keypath="loginModal.enterThePassphraseFor"><template #name><strong>{{ identity.label }}</strong></template></I18nText></p>
                            <input
                                v-model="unlockPassphrase"
                                type="password"
                                :placeholder="t('loginModal.passphrase')"
                                class="modal-input"
                                autofocus
                                @keydown.enter="confirmUnlock"
                                @keydown.escape="cancelUnlock"
                            />
                            <p v-if="unlockError" class="identity-unlock-error">{{ unlockError }}</p>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="cancelUnlock">{{ t('loginModal.cancel') }}</button>
                                <button class="modal-btn modal-btn--primary" :disabled="unlocking" @click="confirmUnlock">
                                    {{ unlocking ? t('loginModal.unlocking') : t('loginModal.unlockLogIn') }}
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
                <p v-else class="modal-subtitle">{{ t('loginModal.noIdentitiesOnThisDevice') }}</p>

                <div class="identity-divider">
                    <span>{{ t('loginModal.createNewIdentity') }}</span>
                </div>

                <input
                    v-model="newLabel"
                    type="text"
                    :placeholder="t('loginModal.displayNameForTheNew')"
                    class="modal-input"
                    @keydown.enter="createAndLogIn"
                />
                <NewPassphraseFields
                    v-model:passphrase="newPassphrase"
                    v-model:confirmation="newPassphraseConfirmation"
                    v-model:allow-unprotected="allowUnprotected"
                    :show-hint="createAttempted"
                    @submit="createAndLogIn"
                />
                <p v-if="createError" class="identity-unlock-error">{{ createError }}</p>
                <div class="modal-actions">
                    <button class="modal-btn modal-btn--secondary" @click="$emit('close')">{{ t('loginModal.cancel') }}</button>
                    <button v-if="purpose === 'publish'" class="modal-btn modal-btn--secondary login-modal-skip" @click="$emit('close'); $emit('skip')">{{ t('loginModal.publishUnsigned') }}</button>
                    <button class="modal-btn modal-btn--primary" :disabled="creating" @click="createAndLogIn">
                        {{ creating ? t('loginModal.creating') : t('loginModal.createLogIn') }}
                    </button>
                </div>
            </div>
        </div>
    `
};
