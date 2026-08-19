// 0.2.73 — Authenticated Voice / Audio.
//
// The CALL-LIFECYCLE wire vocabulary — a small, closed set of control
// messages exchanged over application/VoiceUseCase.CALL_PROTOCOL
// (`forkbuild:voice-call`), deliberately separate from
// core/VoiceMediaSignal.js's own SDP-carrying vocabulary, the identical
// "control is not content" split core/ChatDeliveryAck.js's own header
// already established for chat (0.2.63): a call's INVITE/ACCEPT/REJECT/
// END/BUSY never rides the same protocol string as the audio
// renegotiation SDP itself, so a receiver's lifecycle trust boundary
// never needs to distinguish the two by inspecting a payload's shape.
//
//   callId          — mints once, at INVITE, by the caller
//                      (core/createId.js) — never re-derived the way
//                      core/ChatMessage.js#conversationId is, because a
//                      call (unlike a conversation) is not a durable,
//                      symmetric fact both sides could independently
//                      compute the same identifier for; it is a single,
//                      ephemeral event the caller names and the callee
//                      simply echoes back on every subsequent signal.
//   type            — VoiceCallSignalType: INVITE/ACCEPT/REJECT/END/BUSY
//   callerIdentity  — who is placing (or placed) the call. Never trusted
//                      on its own — application/VoiceUseCase.js requires
//                      this to match the sending connection's own
//                      already-proven remoteIdentity, the identical
//                      "claimed sender must match the proven connection"
//                      rule application/ChatUseCase.js#_handleIncoming()
//                      already applies to core/ChatMessage.js#senderIdentity.
//   calleeIdentity  — who the call is FOR. Re-derived and compared by
//                      the receiver against its own signing identity —
//                      never merely "any INVITE that arrives," the same
//                      discipline core/ChatMessage.js#conversationId
//                      already established one layer over.
//   sentAt          — the sender's own clock; display metadata only,
//                      never a freshness or ordering mechanism, matching
//                      core/ChatMessage.js#timestamp's own non-
//                      authoritative role.
export const VoiceCallSignalType = Object.freeze({
    // Caller -> callee: "will you take a call?"
    INVITE: 'INVITE',
    // Callee -> caller: "yes" — the callee is now expected to add its own
    // local audio track and wait for the caller's renegotiation offer;
    // see application/VoiceUseCase.js's own header on why the caller,
    // never the callee, always drives renegotiation.
    ACCEPT: 'ACCEPT',
    // Callee -> caller: "no."
    REJECT: 'REJECT',
    // Either party, at any later point: "hang up." The one signal this
    // vocabulary re-uses for both "the callee declined an active second
    // call" (BUSY is a distinct, narrower signal — see below) and a
    // normal hangup — see application/VoiceUseCase.js#_handleIncomingCall().
    END: 'END',
    // Callee -> caller: "I already have a call in progress." A distinct
    // value from REJECT — REJECT is a deliberate "no"; BUSY is "I
    // structurally cannot accept a second one right now" — see
    // application/VoiceUseCase.js's own header, "One Call At A Time, Per
    // Peer."
    BUSY: 'BUSY'
});

export const MAX_VOICE_CALL_ID_LENGTH = 128;

export function toVoiceCallSignal({ callId, type, callerIdentity, calleeIdentity, sentAt = Date.now() }) {
    if (!callId || typeof callId !== 'string') {
        throw new Error('toVoiceCallSignal: callId is required');
    }
    if (!Object.values(VoiceCallSignalType).includes(type)) {
        throw new Error('toVoiceCallSignal: type must be a VoiceCallSignalType');
    }
    if (!callerIdentity || typeof callerIdentity !== 'string') {
        throw new Error('toVoiceCallSignal: callerIdentity is required');
    }
    if (!calleeIdentity || typeof calleeIdentity !== 'string') {
        throw new Error('toVoiceCallSignal: calleeIdentity is required');
    }
    return { callId, type, callerIdentity, calleeIdentity, sentAt };
}

export function isValidVoiceCallSignal(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.callId === 'string' && value.callId.length > 0 && value.callId.length <= MAX_VOICE_CALL_ID_LENGTH
        && Object.values(VoiceCallSignalType).includes(value.type)
        && typeof value.callerIdentity === 'string' && value.callerIdentity.length > 0
        && typeof value.calleeIdentity === 'string' && value.calleeIdentity.length > 0
        && Number.isFinite(value.sentAt);
}
