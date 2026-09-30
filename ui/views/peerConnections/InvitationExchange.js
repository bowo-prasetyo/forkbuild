import { ref, reactive } from 'vue';
import { stripPrefix } from './presentation.js';
import { errorText, t } from '../../i18n/i18n.js';
import I18nText from '../../i18n/I18nText.js';

// The two halves of a manual invitation exchange: create an invitation to
// send, or paste one you were sent and get a reply to send back. The host
// supplies `create` and `accept`, so a first connection and a Reconnect
// (which also checks the answering identity) share this one flow.
//
// Completing an invitation you created (pasting their reply) happens on
// the pending connection's own row, since that connection already exists.
export default {
    name: 'InvitationExchange',
    components: { I18nText },
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
                inviteError.value = stripPrefix(errorText(e));
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
                acceptError.value = stripPrefix(errorText(e));
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
            t,
            invitePending, inviteError, invitation, importText, acceptPending, acceptError, reply, copiedKey,
            createInvitation, discardInvitation, submitInvitation, copy, expiryTime
        };
    },
    template: `
        <div class="invitation-exchange">
            <div v-if="modes.includes('invite')" class="invitation-exchange-part">
                <h4 v-if="modes.length > 1" class="invitation-exchange-heading">{{ recipient ? t('peerConnections.sendNamedAnInvitation', { name: recipient }) : t('peerConnections.sendThemAnInvitation') }}</h4>
                <template v-if="!invitation.json">
                    <p class="form-hint form-hint--neutral">
                        {{ t('peerConnections.createAnInvitationFor', { name: recipient || t('peerConnections.thePersonYouWantTo') }) }}
                    </p>
                    <p v-if="inviteError" class="identity-unlock-error">{{ inviteError }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="invitePending || disabled" @click="createInvitation">
                            {{ invitePending ? t('peerConnections.creating') : t('peerConnections.createInvitation') }}
                        </button>
                    </div>
                </template>
                <template v-else>
                    <textarea class="form-input peer-signal-json" rows="5" readonly :value="invitation.json"
                              :aria-label="t('peerConnections.invitationToSend')"></textarea>
                    <p class="form-hint form-hint--neutral">
                        <I18nText :keypath="recipient ? 'peerConnections.expiresNamedReply' : 'peerConnections.expiresTheyReply'" :params="{ time: expiryTime(), name: recipient }">
                            <template #needsYourAttention><strong>{{ t('peerConnections.needsYourAttention') }}</strong></template>
                        </I18nText>
                    </p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="discardInvitation">{{ t('peerConnections.discard') }}</button>
                        <button class="modal-btn modal-btn--primary" @click="copy(invitation.json, 'invitation')">
                            {{ copiedKey === 'invitation' ? t('peerConnections.copied') : t('peerConnections.copyInvitation') }}
                        </button>
                    </div>
                </template>
            </div>

            <div v-if="modes.includes('paste')" class="invitation-exchange-part">
                <h4 v-if="modes.length > 1" class="invitation-exchange-heading">{{ recipient ? t('peerConnections.orPasteOneNamedSent', { name: recipient }) : t('peerConnections.orPasteOneTheySent') }}</h4>
                <template v-if="!reply">
                    <p v-if="modes.length === 1" class="form-hint form-hint--neutral">
                        {{ t('peerConnections.pasteAnInvitationSomeoneSent') }}
                    </p>
                    <textarea v-model="importText" class="form-input peer-signal-json" rows="4"
                              :placeholder="t('peerConnections.pasteTheInvitationHere')" :aria-label="t('peerConnections.invitationYouReceived')"></textarea>
                    <p v-if="acceptError" class="identity-unlock-error">{{ acceptError }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="acceptPending || disabled || !importText.trim()" @click="submitInvitation">
                            {{ acceptPending ? t('peerConnections.connecting') : t('peerConnections.connect') }}
                        </button>
                    </div>
                </template>
                <template v-else>
                    <p class="form-hint form-hint--neutral">
                        {{ recipient ? t('peerConnections.sendReplyBackNamed', { name: recipient }) : t('peerConnections.sendReplyBackThem') }}
                    </p>
                    <textarea class="form-input peer-signal-json" rows="5" readonly :value="reply" :aria-label="t('peerConnections.replyToSendBack')"></textarea>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="reply = ''">{{ t('peerConnections.done') }}</button>
                        <button class="modal-btn modal-btn--primary" @click="copy(reply, 'reply')">
                            {{ copiedKey === 'reply' ? t('peerConnections.copied') : t('peerConnections.copyReply') }}
                        </button>
                    </div>
                </template>
            </div>
        </div>
    `
};
