import { computed, inject, ref } from 'vue';
import { errorText } from '../i18n/i18n.js';

// Call, on the avatar of a friend you're walking with: offered when the Chat
// page would offer it (application/chat/VoiceUseCase.js#canCallIdentity()) and
// no call is on. The call then goes on while you walk, its bar under the
// header (ui/components/CallBar.js) and its voice app-wide
// (ui/voice/callAudio.js). Before the network runtime is built, nothing.
export function useAvatarCall({ avatarInfo, feedback, funnel = null }) {
    const callServices = inject('callServices', ref(null));

    // Read again whenever the panel's info is, which World View refreshes as you walk.
    const canCallAvatar = computed(() => {
        const voice = callServices.value?.voiceUseCase;
        const info = avatarInfo.value;
        if (!voice || !info || info.isLocal || !info.signerIdentityId || voice.getActiveCall()) return false;
        try {
            return voice.canCallIdentity(info.signerIdentityId);
        } catch {
            return false;
        }
    });

    function callAvatar() {
        const voice = callServices.value?.voiceUseCase;
        const identityId = avatarInfo.value?.signerIdentityId;
        if (!voice || !identityId) return;
        try {
            voice.startCallToIdentity(identityId);
            funnel?.madeVoiceCall();
        } catch (error) {
            feedback.show(errorText(error).replace(/^VoiceUseCase:\s*/, ''));
        }
    }

    return { canCallAvatar, callAvatar };
}
