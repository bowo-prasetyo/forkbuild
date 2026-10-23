import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { VoiceSessionState } from '../../core/social/VoiceSessionState.js';
import { VoiceCallEndReason } from '../../core/social/VoiceCallEndReason.js';
import { errorText, t } from '../i18n/i18n.js';

// Why a call ended, when the person on this end didn't end it themselves:
// the same words the Chat page says (ui/views/ChatView.js).
const END_REASON_KEYS = Object.freeze({
    [VoiceCallEndReason.REJECTED]: 'chatView.callDeclined',
    [VoiceCallEndReason.BUSY]: 'chatView.theyReAlreadyOnAnother',
    [VoiceCallEndReason.TIMEOUT]: 'chatView.noAnswer',
    [VoiceCallEndReason.MEDIA_FAILED]: 'chatView.couldnTAccessYourMicrophone',
    [VoiceCallEndReason.NEGOTIATION_FAILED]: 'chatView.callFailedToConnect'
});
// How long the bar stays to say why a call ended.
const ENDED_NOTE_MS = 5000;

const STATUS_KEYS = Object.freeze({
    [VoiceSessionState.CALLING]: 'chatView.calling',
    [VoiceSessionState.RINGING]: 'chatView.incomingCall',
    [VoiceSessionState.CONNECTING]: 'chatView.connecting',
    [VoiceSessionState.ACTIVE]: 'chatView.onCall'
});

// A call, on every page (ui/App.js): who it is with, how it stands, and
// Accept and Decline, Mute, and Hang up, so a call with a friend goes on
// while you walk together in World View. That friend's own Chat page keeps
// its fuller bar (with the microphone and speaker choices) and this one
// steps aside there. Reads application/chat/VoiceUseCase.js's one call for
// the device, as the Chat page does; its voice plays through
// ui/voice/callAudio.js. Nothing shows before the network runtime is built
// (ui/main.js's `callServices`).
export default {
    name: 'CallBar',
    setup() {
        const route = useRoute();
        const services = inject('callServices', ref(null));
        const call = ref(null);
        const muted = ref(false);
        const note = ref('');
        // Whose call the note is about, once the call itself is gone.
        const notePeer = ref(null);
        let noteTimer = null;
        let unsubscribers = [];

        function refresh() {
            const voice = services.value?.voiceUseCase;
            call.value = voice ? voice.getActiveCall() : null;
            muted.value = voice ? voice.isMuted() : false;
        }

        function showNote(text) {
            clearTimeout(noteTimer);
            note.value = text;
            noteTimer = text ? setTimeout(() => { note.value = ''; }, ENDED_NOTE_MS) : null;
        }

        function subscribe(current) {
            for (const unsubscribe of unsubscribers) unsubscribe();
            unsubscribers = [];
            const voice = current?.voiceUseCase;
            if (!voice) return;
            unsubscribers.push(voice.onCallStateChanged((callId, state, info) => {
                if (state === VoiceSessionState.ENDED) {
                    notePeer.value = info?.peerIdentityId || null;
                    showNote(END_REASON_KEYS[info?.reason] ? t(END_REASON_KEYS[info.reason]) : '');
                }
                else if (state === VoiceSessionState.CALLING || state === VoiceSessionState.RINGING) showNote('');
                refresh();
            }));
            unsubscribers.push(voice.onIncomingCall(() => refresh()));
            unsubscribers.push(voice.onMicrophoneUnavailable(() => showNote(t('chatView.microphoneDisappeared'))));
            refresh();
        }
        watch(services, subscribe, { immediate: true });
        onBeforeUnmount(() => {
            for (const unsubscribe of unsubscribers) unsubscribe();
            clearTimeout(noteTimer);
        });

        // That friend's own Chat page shows the call itself, and why it ended.
        const onTheirChat = computed(() => {
            const peerIdentityId = call.value ? call.value.peerIdentityId : notePeer.value;
            return route.name === 'chat' && Boolean(peerIdentityId) && route.params.identityId === peerIdentityId;
        });
        const shown = computed(() => Boolean(call.value || note.value) && !onTheirChat.value);
        const name = computed(() => {
            const peerIdentityId = call.value?.peerIdentityId;
            if (!peerIdentityId) return '';
            const relationship = services.value?.peerRelationshipUseCase?.getRelationship(peerIdentityId);
            return (relationship && relationship.alias) || peerIdentityId.slice(-14);
        });
        const status = computed(() => (call.value && STATUS_KEYS[call.value.state] ? t(STATUS_KEYS[call.value.state]) : ''));
        const ringing = computed(() => call.value?.state === VoiceSessionState.RINGING);
        const calling = computed(() => call.value?.state === VoiceSessionState.CALLING);
        const talking = computed(() => [VoiceSessionState.CONNECTING, VoiceSessionState.ACTIVE].includes(call.value?.state));

        function act(action) {
            const voice = services.value?.voiceUseCase;
            const current = call.value;
            if (!voice || !current) return;
            Promise.resolve()
                .then(() => action(voice, current.callId))
                .catch((error) => showNote(errorText(error).replace(/^(VoiceUseCase|LocalAudioTrackProvider):\s*/, '')))
                .finally(refresh);
        }
        const accept = () => act((voice, callId) => voice.acceptCall(callId));
        const decline = () => act((voice, callId) => voice.rejectCall(callId));
        const hangUp = () => act((voice, callId) => voice.endCall(callId));
        const toggleMute = () => act((voice) => voice.setMuted(!voice.isMuted()));

        return { t, call, muted, note, shown, name, status, ringing, calling, talking, accept, decline, hangUp, toggleMute };
    },
    template: `
        <div v-if="shown" class="call-bar call-bar--app" role="region" :aria-label="t('callBar.label')">
            <template v-if="call">
                <span class="call-bar-who">{{ name }}</span>
                <span class="call-bar-status" aria-live="polite">{{ status }}</span>
                <template v-if="ringing">
                    <button type="button" class="action-btn action-btn--primary call-bar-accept" @click="accept">{{ t('chatView.accept') }}</button>
                    <button type="button" class="action-btn call-bar-decline" @click="decline">{{ t('chatView.decline') }}</button>
                </template>
                <template v-else>
                    <button v-if="talking" type="button" class="action-btn call-bar-mute" :aria-pressed="muted ? 'true' : 'false'" @click="toggleMute">{{ muted ? t('chatView.unmute') : t('chatView.mute') }}</button>
                    <button type="button" class="action-btn call-btn--end call-bar-hang-up" @click="hangUp">{{ calling ? t('chatView.cancel') : t('chatView.hangUp') }}</button>
                </template>
                <router-link class="call-bar-chat" :to="'/chat/' + call.peerIdentityId">{{ t('conversationsView.openChat') }}</router-link>
            </template>
            <span v-if="note" class="call-bar-note" role="status">{{ note }}</span>
        </div>
    `
};
