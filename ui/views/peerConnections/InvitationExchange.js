import { ref, reactive } from 'vue';
import { stripPrefix } from './presentation.js';

// The two halves of a manual invitation exchange: create an invitation to
// send, or paste one you were sent and get a reply to send back. The host
// supplies `create` and `accept`, so a first connection and a Reconnect
// (which also checks the answering identity) share this one flow.
//
// Completing an invitation you created (pasting their reply) happens on
// the pending connection's own row, since that connection already exists.
export default {
    name: 'InvitationExchange',
    props: {
        // Which halves to show: 'invite', 'paste', or both.
        modes: { type: Array, default: () => ['invite', 'paste'] },
        // async () => PeerInvitation
        create: { type: Function, required: true },
        // async (invitationText) => reply string
        accept: { type: Function, required: true },
        // Who the invitation is for, when known (e.g. a Reconnect target).
        recipient: { type: String, default: null },
        disabled: { type: Boolean, default: false }
    },
    setup(props) {
        const invitePending = ref(false);
        const inviteError = ref('');
        const invitation = reactive({ json: '', expiresAt: null });
        const importText = ref('');
        const acceptPending = ref(false);
        const acceptError = ref('');
        const reply = ref('');
        const copiedKey = ref(null);

        async function createInvitation() {
            inviteError.value = '';
            invitePending.value = true;
            try {
                const created = await props.create();
                invitation.json = JSON.stringify(created.toJSON(), null, 2);
                invitation.expiresAt = created.expiresAt;
            } catch (e) {
                inviteError.value = stripPrefix(e.message);
            } finally {
                invitePending.value = false;
            }
        }

        function discardInvitation() {
            invitation.json = '';
            invitation.expiresAt = null;
        }

        async function submitInvitation() {
            acceptError.value = '';
            const text = importText.value.trim();
            if (!text) {
                return;
            }
            acceptPending.value = true;
            try {
                reply.value = await props.accept(text);
                importText.value = '';
            } catch (e) {
                acceptError.value = stripPrefix(e.message);
            } finally {
                acceptPending.value = false;
            }
        }

        async function copy(text, key) {
            try {
                await navigator.clipboard.writeText(text);
                copiedKey.value = key;
                setTimeout(() => { if (copiedKey.value === key) copiedKey.value = null; }, 1500);
            } catch {
                // The text is in a readonly textarea, selectable by hand.
            }
        }

        function expiryTime() {
            return invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleTimeString() : '';
        }

        return {
            invitePending, inviteError, invitation, importText, acceptPending, acceptError, reply, copiedKey,
            createInvitation, discardInvitation, submitInvitation, copy, expiryTime
        };
    },
    template: `
        <div class="invitation-exchange">
            <div v-if="modes.includes('invite')" class="invitation-exchange-part">
                <h4 v-if="modes.length > 1" class="invitation-exchange-heading">Send {{ recipient || 'them' }} an invitation</h4>
                <template v-if="!invitation.json">
                    <p class="form-hint form-hint--neutral">
                        Create an invitation and send it to {{ recipient || 'the person you want to connect with' }}
                        over a channel you already trust, like a message or email.
                    </p>
                    <p v-if="inviteError" class="identity-unlock-error">{{ inviteError }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="invitePending || disabled" @click="createInvitation">
                            {{ invitePending ? 'Creating…' : 'Create Invitation' }}
                        </button>
                    </div>
                </template>
                <template v-else>
                    <textarea class="form-input peer-signal-json" rows="5" readonly :value="invitation.json"
                              aria-label="Invitation to send"></textarea>
                    <p class="form-hint form-hint--neutral">
                        Expires at {{ expiryTime() }}. When {{ recipient || 'they' }} send a reply, paste it under
                        <strong>Needs your attention</strong> at the top of this page.
                    </p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="discardInvitation">Discard</button>
                        <button class="modal-btn modal-btn--primary" @click="copy(invitation.json, 'invitation')">
                            {{ copiedKey === 'invitation' ? 'Copied!' : 'Copy Invitation' }}
                        </button>
                    </div>
                </template>
            </div>

            <div v-if="modes.includes('paste')" class="invitation-exchange-part">
                <h4 v-if="modes.length > 1" class="invitation-exchange-heading">Or paste one {{ recipient || 'they' }} sent you</h4>
                <template v-if="!reply">
                    <p v-if="modes.length === 1" class="form-hint form-hint--neutral">
                        Paste an invitation someone sent you. You'll get a reply to send back to them.
                    </p>
                    <textarea v-model="importText" class="form-input peer-signal-json" rows="4"
                              placeholder="Paste the invitation here" aria-label="Invitation you received"></textarea>
                    <p v-if="acceptError" class="identity-unlock-error">{{ acceptError }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="acceptPending || disabled || !importText.trim()" @click="submitInvitation">
                            {{ acceptPending ? 'Connecting…' : 'Connect' }}
                        </button>
                    </div>
                </template>
                <template v-else>
                    <p class="form-hint form-hint--neutral">
                        Send this reply back to {{ recipient || 'them' }}. The connection finishes once they paste it in.
                    </p>
                    <textarea class="form-input peer-signal-json" rows="5" readonly :value="reply" aria-label="Reply to send back"></textarea>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="reply = ''">Done</button>
                        <button class="modal-btn modal-btn--primary" @click="copy(reply, 'reply')">
                            {{ copiedKey === 'reply' ? 'Copied!' : 'Copy Reply' }}
                        </button>
                    </div>
                </template>
            </div>
        </div>
    `
};
