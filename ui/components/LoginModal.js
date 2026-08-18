import { ref, computed, inject } from 'vue';

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
export default {
    name: 'LoginModal',
    emits: ['close'],
    setup(props, { emit }) {
        const identityUseCase = inject('identityUseCase');
        const identities = ref(identityUseCase.listIdentities());
        const newLabel = ref('');

        const sortedIdentities = computed(() =>
            [...identities.value].sort((a, b) => b.createdAt - a.createdAt)
        );

        function shortId(identityId) {
            return identityId.slice(-10);
        }

        function logInAs(identityId) {
            identityUseCase.authenticate(identityId);
            emit('close');
        }

        function createAndLogIn() {
            const label = newLabel.value.trim();
            if (!label) {
                return;
            }
            const identity = identityUseCase.createIdentity(label);
            identityUseCase.authenticate(identity.identityId);
            emit('close');
        }

        return { sortedIdentities, newLabel, shortId, logInAs, createAndLogIn };
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
                    <button
                        v-for="identity in sortedIdentities"
                        :key="identity.identityId"
                        class="identity-list-item"
                        @click="logInAs(identity.identityId)"
                    >
                        <span class="identity-list-item-label">{{ identity.label }}</span>
                        <span class="identity-list-item-id">…{{ shortId(identity.identityId) }}</span>
                    </button>
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
                <div class="modal-actions">
                    <button class="modal-btn modal-btn--secondary" @click="$emit('close')">Cancel</button>
                    <button class="modal-btn modal-btn--primary" @click="createAndLogIn">Create &amp; Log In</button>
                </div>
            </div>
        </div>
    `
};
