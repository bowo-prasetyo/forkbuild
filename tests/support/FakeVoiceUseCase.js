import { VoiceSessionState } from '../../core/social/VoiceSessionState.js';

// A stand-in for application/chat/VoiceUseCase.js's surface the call bar,
// the call audio and the avatar panel read: one call for the device, its
// state events, and the gestures, each noted in `done`. `to(state, info)`
// moves the call as the real one would; ENDED clears it.
export function fakeVoiceUseCase({ callable = [] } = {}) {
    const listeners = { state: new Set(), incoming: new Set(), microphone: new Set() };
    const subscribe = (set, callback) => {
        set.add(callback);
        return () => set.delete(callback);
    };
    let call = null;
    let stream = null;
    let muted = false;
    const voice = {
        done: [],
        listeners,
        getActiveCall: () => (call ? { ...call } : null),
        getRemoteStream: (callId) => (call && call.callId === callId ? stream : null),
        isMuted: () => muted,
        setMuted(next) { muted = next; voice.done.push(['mute', next]); },
        canCallIdentity: (identityId) => callable.includes(identityId),
        startCallToIdentity(identityId) {
            voice.done.push(['call', identityId]);
            voice.ring(identityId, VoiceSessionState.CALLING);
        },
        async acceptCall(callId) {
            voice.done.push(['accept', callId]);
            voice.to(VoiceSessionState.CONNECTING);
        },
        rejectCall(callId) {
            voice.done.push(['decline', callId]);
            voice.to(VoiceSessionState.ENDED, { reason: 'LOCAL_REJECT' });
        },
        endCall(callId) {
            voice.done.push(['hang-up', callId]);
            voice.to(VoiceSessionState.ENDED, { reason: 'LOCAL_HANGUP' });
        },
        onCallStateChanged: (callback) => subscribe(listeners.state, callback),
        onIncomingCall: (callback) => subscribe(listeners.incoming, callback),
        onMicrophoneUnavailable: (callback) => subscribe(listeners.microphone, callback),
        // A call with `peerIdentityId` begins: CALLING (placed here) or
        // RINGING (an incoming one).
        ring(peerIdentityId, state = VoiceSessionState.RINGING) {
            call = { callId: `call-${voice.done.length}-${peerIdentityId}`, peerIdentityId, state };
            if (state === VoiceSessionState.RINGING) for (const callback of [...listeners.incoming]) callback(peerIdentityId, call.callId);
            for (const callback of [...listeners.state]) callback(call.callId, state, { peerIdentityId });
        },
        // ACTIVE attaches `remoteStream`, as the real one does once media flows.
        to(state, info = {}, remoteStream = null) {
            if (!call) return;
            const { callId, peerIdentityId } = call;
            if (state === VoiceSessionState.ACTIVE) stream = remoteStream;
            if (state === VoiceSessionState.ENDED) {
                call = null;
                stream = null;
                muted = false;
            } else {
                call = { ...call, state };
            }
            for (const callback of [...listeners.state]) callback(callId, state, { peerIdentityId, ...info });
        },
        microphoneGone() {
            for (const callback of [...listeners.microphone]) callback(call?.callId, call?.peerIdentityId);
        }
    };
    return voice;
}
