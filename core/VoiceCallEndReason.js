// 0.2.74 — Voice Call Reliability & Lifecycle.
//
// 0.2.73 already tore every call down through exactly one terminal
// `VoiceSessionState.ENDED`, carrying a free-text `reason` string
// (`'rejected'`, `'busy'`, `'ended'`, `'ended by peer'`,
// `'peer disconnected'`, `'blocked'`, `'unfriended'`, `'media error'`) —
// real information, but never a closed vocabulary anything could rely on,
// and 'media error' collapsed two structurally different failures (a local
// microphone problem vs. a failed SDP renegotiation) into one string. This
// file promotes that reason to a first-class, validated wire-adjacent
// vocabulary — a fourth in the growing family alongside
// core/VoiceCallSignal.js#VoiceCallSignalType and
// core/VoiceMediaSignal.js#VoiceMediaSignalKind — WITHOUT adding a single
// new VoiceSessionState. See core/VoiceSessionState.js's own header on why
// ENDED stays the sole terminal value: a call either reached ACTIVE or it
// didn't, but the STORY of how it stopped keeps growing, and that story
// belongs in the qualifier, not in a proliferating set of terminal states
// every consumer would need to handle identically anyway.
//
// This vocabulary is deliberately LOCAL-ONLY — it is never serialized onto
// core/VoiceCallSignal.js or any other wire message, and a receiver never
// learns the SENDER's own reason for an incoming END (see
// application/VoiceUseCase.js's own header, "Reasons Are Local Judgments,
// Never Transmitted Facts" (0.2.74)). Each device decides, independently
// and from its own evidence, why ITS OWN call just ended.
//
//   REJECTED            — the peer sent an explicit VoiceCallSignalType.REJECT.
//                          A deliberate "no," never confused with a TIMEOUT.
//   BUSY                — the peer sent VoiceCallSignalType.BUSY: they
//                          structurally could not accept a second call, not
//                          that they declined this one.
//   TIMEOUT             — THIS device's own ringing timer
//                          (application/VoiceUseCase.js#_armRingingTimeout())
//                          expired before an ACCEPT/REJECT/BUSY ever
//                          arrived. Never learned from the network — see
//                          this file's own header above.
//   MEDIA_FAILED         — application/LocalAudioTrackProvider.js#getLocalAudioTrack()
//                          itself threw (no microphone, permission denied,
//                          no track returned) — BEFORE any SDP was
//                          exchanged. The peer, if any, did nothing wrong.
//   NEGOTIATION_FAILED   — the SDP renegotiation itself failed
//                          (peer/WebRtcPeerConnection.js#renegotiate()/
//                          applyRemoteOffer()/applyRemoteAnswer() rejected)
//                          AFTER a local track was already acquired. See
//                          this class's own header on why this is
//                          deliberately never confused with a peer
//                          connection failure.
//   PEER_DISCONNECTED    — the underlying peer/PeerConnection.js left
//                          PeerLifecycleState.AUTHENTICATED mid-call — a
//                          CONSEQUENCE of the connection dying, never
//                          something voice itself decided.
//   BLOCKED               — application/PeerBlockUseCase.js reported this
//                          peer newly blocked while a call with them was
//                          in progress.
//   UNFRIENDED             — application/FriendRelationshipUseCase.js
//                          reported the friendship with this peer ended
//                          while a call with them was in progress.
//   LOCAL_HANGUP          — THIS device's own endCall() gesture.
//   REMOTE_HANGUP          — the peer sent VoiceCallSignalType.END — the
//                          peer's OWN reason for sending it (a deliberate
//                          hangup, their own ringing timeout, or their own
//                          media/negotiation failure) is never disclosed
//                          over the wire, so this side only ever learns
//                          "the call ended," never why.
export const VoiceCallEndReason = Object.freeze({
    REJECTED: 'REJECTED',
    BUSY: 'BUSY',
    TIMEOUT: 'TIMEOUT',
    MEDIA_FAILED: 'MEDIA_FAILED',
    NEGOTIATION_FAILED: 'NEGOTIATION_FAILED',
    PEER_DISCONNECTED: 'PEER_DISCONNECTED',
    BLOCKED: 'BLOCKED',
    UNFRIENDED: 'UNFRIENDED',
    LOCAL_HANGUP: 'LOCAL_HANGUP',
    REMOTE_HANGUP: 'REMOTE_HANGUP'
});
