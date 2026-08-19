// 0.2.73 — Authenticated Voice / Audio.
//
// The SDP-carrying wire vocabulary — a message here is one leg of the
// renegotiation round trip peer/WebRtcPeerConnection.js's own
// renegotiate()/applyRemoteOffer()/applyRemoteAnswer() perform, carried
// over application/VoiceUseCase.MEDIA_PROTOCOL (`forkbuild:voice-media`)
// on the SAME already-authenticated peer/PeerMessageBus.js this device
// already used to exchange the call's own core/VoiceCallSignal.js.
// Deliberately its own, separate protocol — see that file's own header.
//
// This is deliberately NOT peer/PeerConnectionOffer.js/
// peer/PeerConnectionAnswer.js reused: those carry the INITIAL signaling
// handshake — no connection exists yet, so they need a TTL/expiry and
// travel out-of-band (an invitation's endpoint, copy/paste, a QR code —
// see peer/WebRtcPeerConnection.js's own header). A voice renegotiation
// SDP travels IN-BAND, over a connection that is already CONNECTED and
// already AUTHENTICATED — there is no "out of band" left to route it
// through, and no expiry question: a stale renegotiation offer for a
// call that no longer exists is simply ignored by
// application/VoiceUseCase.js because it no longer recognizes the
// callId, never because a timer says so.
//
//   callId — which call (core/VoiceCallSignal.js#callId) this SDP
//            belongs to. A media signal for a callId this device is not
//            currently tracking is dropped — see
//            application/VoiceUseCase.js#_handleIncomingMedia()'s own
//            header on why this is the ONE new trust question this
//            vocabulary adds beyond "sender matches the proven
//            connection."
//   kind   — 'offer' or 'answer', mirroring RTCSessionDescription's own
//            vocabulary exactly (never re-derived from context — an
//            'answer' arriving when this side never sent an 'offer' is
//            simply rejected by peer/WebRtcPeerConnection.js's own
//            underlying RTCPeerConnection#setRemoteDescription()).
//   sdp    — the raw SDP text. Opaque to every trust check in this file
//            and in application/VoiceUseCase.js — nobody here parses or
//            validates SDP content; that is entirely
//            RTCPeerConnection's own job, exactly like
//            peer/PeerConnectionOffer.js's own `sdp` field is opaque to
//            everything except the RTCPeerConnection it is eventually
//            handed to.
export const VoiceMediaSignalKind = Object.freeze({
    OFFER: 'offer',
    ANSWER: 'answer'
});

export const MAX_VOICE_SDP_LENGTH = 32768;

export function toVoiceMediaSignal({ callId, kind, sdp, senderIdentity }) {
    if (!callId || typeof callId !== 'string') {
        throw new Error('toVoiceMediaSignal: callId is required');
    }
    if (kind !== VoiceMediaSignalKind.OFFER && kind !== VoiceMediaSignalKind.ANSWER) {
        throw new Error('toVoiceMediaSignal: kind must be "offer" or "answer"');
    }
    if (!sdp || typeof sdp !== 'string') {
        throw new Error('toVoiceMediaSignal: sdp is required');
    }
    if (!senderIdentity || typeof senderIdentity !== 'string') {
        throw new Error('toVoiceMediaSignal: senderIdentity is required');
    }
    return { callId, kind, sdp, senderIdentity };
}

export function isValidVoiceMediaSignal(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.callId === 'string' && value.callId.length > 0
        && (value.kind === VoiceMediaSignalKind.OFFER || value.kind === VoiceMediaSignalKind.ANSWER)
        && typeof value.sdp === 'string' && value.sdp.length > 0 && value.sdp.length <= MAX_VOICE_SDP_LENGTH
        && typeof value.senderIdentity === 'string' && value.senderIdentity.length > 0;
}
