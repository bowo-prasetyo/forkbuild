import { ref, computed, inject } from 'vue';
import NewPassphraseFields from './NewPassphraseFields.js';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';

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
        unlockIdentityId: { type: String, default: null }
    },
    emits: ['close'],
    components: { NewPassphraseFields },
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
            emit('close');
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
                emit('close');
            } catch (e) {
                unlockError.value = e.message.replace(/^LocalIdentityProvider:\s*/, '');
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
                emit('close');
            } catch (e) {
                createError.value = e.message.replace(/^LocalIdentityProvider:\s*/, '');
            } finally {
                creating.value = false;
            }
        }

        return {
            sortedIdentities, newLabel, newPassphrase, newPassphraseConfirmation, allowUnprotected,
            createAttempted, creating, createError, shortId, logInAs, createAndLogIn,
            unlockingId, unlockPassphrase, unlockError, unlocking, cancelUnlock, confirmUnlock
        };
    },
    template: `
        <div class="modal-overlay" @click.self="$emit('close')">
            <div class="modal-content">
                <h3>Log In</h3>
                <p class="modal-subtitle">
                    Unlock an identity this device already holds, or create a new one.
                    There is no password and no central account — the private key
                    stored on this device IS the identity.
                </p>

                <div v-if="sortedIdentities.length" class="identity-list">
                    <template v-for="identity in sortedIdentities" :key="identity.identityId">
                        <button
                            v-if="unlockingId !== identity.identityId"
                            class="identity-list-item"
                            @click="logInAs(identity)"
                        >
                            <span class="identity-list-item-label">
                                <span v-if="identity.isProtected" class="identity-lock-icon" title="Protected with a passphrase">🔒</span>
                                {{ identity.label }}
                            </span>
                            <span class="identity-list-item-id">…{{ shortId(identity.identityId) }}</span>
                        </button>
                        <div v-else class="identity-unlock-form">
                            <p class="identity-unlock-label">
                                🔒 Enter the passphrase for <strong>{{ identity.label }}</strong>
                            </p>
                            <input
                                v-model="unlockPassphrase"
                                type="password"
                                placeholder="Passphrase"
                                class="modal-input"
                                autofocus
                                @keydown.enter="confirmUnlock"
                                @keydown.escape="cancelUnlock"
                            />
                            <p v-if="unlockError" class="identity-unlock-error">{{ unlockError }}</p>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="cancelUnlock">Cancel</button>
                                <button class="modal-btn modal-btn--primary" :disabled="unlocking" @click="confirmUnlock">
                                    {{ unlocking ? 'Unlocking…' : 'Unlock & Log In' }}
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
                <p v-else class="modal-subtitle">No identities on this device yet.</p>

                <div class="identity-divider">
                    <span>Create New Identity</span>
                </div>

                <input
                    v-model="newLabel"
                    type="text"
                    placeholder="Display name for the new identity"
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
                    <button class="modal-btn modal-btn--secondary" @click="$emit('close')">Cancel</button>
                    <button class="modal-btn modal-btn--primary" :disabled="creating" @click="createAndLogIn">
                        {{ creating ? 'Creating…' : 'Create & Log In' }}
                    </button>
                </div>
            </div>
        </div>
    `
};
