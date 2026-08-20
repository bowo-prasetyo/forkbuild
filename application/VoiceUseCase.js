import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { VoiceSessionState } from '../core/VoiceSessionState.js';
import { VoiceCallEndReason } from '../core/VoiceCallEndReason.js';
import { VoiceCallSignalType, toVoiceCallSignal, isValidVoiceCallSignal } from '../core/VoiceCallSignal.js';
import { VoiceMediaSignalKind, toVoiceMediaSignal, isValidVoiceMediaSignal } from '../core/VoiceMediaSignal.js';
import { LocalAudioTrackProvider } from './LocalAudioTrackProvider.js';
import { createId } from '../core/createId.js';
import { resolveDirectSocialIdentity } from './SocialIdentityResolver.js';

const CALL_STATE_EVENT = 'VoiceCallStateChanged';
const INCOMING_CALL_EVENT = 'VoiceIncomingCall';
// 0.2.75 — see this class's own header, "A Local Media Problem Never
// Ends A Call By Itself."
const MICROPHONE_UNAVAILABLE_EVENT = 'VoiceMicrophoneUnavailable';

// How long CALLING/RINGING is allowed to sit unanswered before this
// device gives up on its own — see this class's own header, "Ringing Is
// Bounded By Local Policy, Never By The Network" (0.2.74).
const DEFAULT_RINGING_TIMEOUT_MS = 45000;

// 0.2.73 — Authenticated Voice / Audio.
//
// "Voice is a media capability attached to an already-authenticated peer
// session, never a second, independent communication architecture." This
// class is the ONE new protocol pair this milestone adds — `forkbuild:
// voice-call` (core/VoiceCallSignal.js, lifecycle control) and
// `forkbuild:voice-media` (core/VoiceMediaSignal.js, SDP renegotiation) —
// built the exact same shape application/ChatUseCase.js (0.2.61) already
// established: its own namespaced channels on the shared
// peer/PeerMessageBus.js, its own wire vocabularies, its own ingestion
// boundary, never folded into chat/presence/profile/interaction, and
// never given any special knowledge inside peer/PeerMessageBus.js itself.
//
// Authorization Is Reused, Never Reinvented. This class asks the exact
// same question application/ChatUseCase.js#canChat() already asks —
// authenticated + not blocked + FriendshipState.FRIEND — see canCall()
// below, which is deliberately byte-for-byte the same predicate. Per the
// design doc: "The permission must be evaluated when the voice session is
// requested, rather than inferred merely because a PeerConnection
// exists." Every call-lifecycle operation re-checks it fresh, exactly
// like every chat operation already does — see `_requireEligible()`.
//
// One Logical PeerConnection, Never A Second One For Voice. There is no
// VoicePeerConnection class and no second signaling/rendezvous flow
// anywhere in this file. `startCall()`/`acceptCall()` below add an audio
// track to the SAME peer/WebRtcPeerConnection.js already carrying
// peer/PeerMessageBus.js's DataChannel, and renegotiate that ONE
// RTCPeerConnection in place — see peer/WebRtcPeerConnection.js's own
// header, "0.2.73 — Authenticated Voice / Audio adds a SECOND ...
// widening." The renegotiation SDP itself travels IN-BAND, over
// MEDIA_PROTOCOL on the SAME already-authenticated bus, never through
// any out-of-band rendezvous mechanism — there is nothing left to
// bootstrap once a connection already exists.
//
// No Glare, By Construction. Real WebRTC renegotiation between two
// peers who might BOTH try to renegotiate at once needs an explicit
// "polite peer" protocol to resolve simultaneous offers. This class
// never needs one: exactly ONE side of a voice call ever creates a
// renegotiation offer — whichever side's underlying
// peer/WebRtcPeerConnection.js#role is `'offerer'` (a fact fixed forever
// at the moment the DATA channel connection itself was established, in
// 0.2.51, completely independent of who happened to place THIS call) —
// see `_beginMediaNegotiation()` below. The other side only ever adds
// its own local track and waits, then answers whatever offer arrives.
// One RTCPeerConnection's original offerer/answerer roles deterministically
// decide who drives every later renegotiation too, so there is never a
// question of who goes first.
//
// One Call At A Time, Per Device. A deliberately narrow scope for
// 0.2.73, per the design doc's own "one authenticated peer, one live
// audio session, ephemeral only": this class tracks at most one
// `_call` at all, globally, for the whole local device — matching an
// ordinary phone, not a conferencing system. An INVITE that arrives
// while a call is already in progress (with anyone) is answered with
// `VoiceCallSignalType.BUSY`, never silently dropped and never allowed
// to replace the call already in progress.
//
// Voice Lifecycle Is Independent Of Peer Lifecycle. Nothing in this
// class ever calls `connectedPeer.close()`, and ending a call never
// touches the underlying connection — see core/VoiceSessionState.js's
// own header. The reverse is handled too: if the underlying connection
// itself drops mid-call (closes, fails, or otherwise leaves
// AUTHENTICATED), `_call` is torn down locally, because there is no
// channel left to carry audio over — but this is a CONSEQUENCE of the
// connection dying, never voice choosing to end it.
//
// Blocking/Unfriending Terminates An Active Call, Never Merely A Future
// One. Mirrors application/ChatUseCase.js's own 0.2.72 proactive
// cancellation exactly: this class subscribes to the same
// `peerBlockUseCase.onBlockedChanged()`/`friendRelationshipUseCase
// .onRelationshipsChanged()` events, and the instant a peer with an
// in-progress `_call` becomes ineligible, that call is torn down
// immediately — see `_reconcileForBlocked()`/`_reconcileForFriends()`.
//
// Local Media Is Requested Only Once A Call Is Actually Happening.
// Neither `startCall()` nor receiving an INVITE requests a microphone —
// only `startCall()`'s own caller-side negotiation and `acceptCall()`'s
// callee-side acceptance do, exactly at the moment a track is actually
// about to be transmitted. See application/LocalAudioTrackProvider.js's
// own header.
//
// Audio Device State Stays Local. `setMuted()` below only ever flips
// `MediaStreamTrack#enabled` on this device's own local track — it is
// never transmitted, never part of core/VoiceCallSignal.js or
// core/VoiceMediaSignal.js, and never visible to the peer except as the
// ordinary silence a disabled outgoing track already produces. See
// docs/Principles.md, "Audio Device State Is Never Presence, Never A
// Wire Fact" (0.2.73).
//
// ---- 0.2.74 — Voice Call Reliability & Lifecycle -----------------------
//
// Ringing Is Bounded By Local Policy, Never By The Network.
// CALLING and RINGING are no longer states a device can sit in forever —
// `_armRingingTimeout()` starts a plain local timer (DEFAULT_RINGING_TIMEOUT_MS)
// the instant either state is entered, and `_onRingingTimeout()` tears the
// call down locally with `VoiceCallEndReason.TIMEOUT` if nothing else
// resolves it first. Per the design doc: the timeout is each device's OWN
// decision, never an authority the network hands down — Alice's timer
// firing and Bob's timer firing are two completely independent local
// events; whichever fires first best-effort notifies the other side (see
// `_notifyPeerCallEnded()` below) purely as a courtesy, not because either
// side needed permission to give up.
//
// Reasons Are Local Judgments, Never Transmitted Facts. core/
// VoiceCallEndReason.js replaces 0.2.73's free-text `reason` strings with a
// closed, documented vocabulary — but it is deliberately NOT added to
// core/VoiceCallSignal.js's own wire shape. An incoming END always means
// exactly one thing on the wire — "this call is over" — and this class
// always maps it to `VoiceCallEndReason.REMOTE_HANGUP` regardless of
// whether the sender's own local reason was a deliberate hangup, their own
// ringing timeout, or their own media/negotiation failure. This is a
// deliberate choice, not a missing feature: REJECTED and BUSY already have
// their own explicit, honest signal types precisely because those ARE
// facts the sender chooses to disclose; a reason is never inferred or
// guessed at from an ordinary END.
//
// A Call Failure Always Tells The Other Side — Never Leaves Them Hanging In
// CONNECTING. 0.2.73 had a real gap here: if `_beginMediaNegotiation()`
// failed AFTER `acceptCall()` had already sent ACCEPT (or symmetrically,
// after `_handleIncomingMedia()` had already started applying a remote
// offer/answer), the failing side tore its own call down locally but never
// told the other side — which would sit in CONNECTING indefinitely, mic
// potentially already attached, waiting for a renegotiation SDP that would
// never arrive. Every MEDIA_FAILED/NEGOTIATION_FAILED teardown below now
// calls `_notifyPeerCallEnded()` first, exactly like `endCall()`'s own
// existing hangup notification — the SAME END signal, reused, never a new
// wire type.
//
// Local Microphone Failure Is Never Confused With Peer Rejection Or A Dead
// Connection. `_beginMediaNegotiation()` tags whatever it throws with
// `VoiceCallEndReason.MEDIA_FAILED` if the failure happened acquiring the
// LOCAL track (application/LocalAudioTrackProvider.js — no microphone, a
// permission prompt denied) and `NEGOTIATION_FAILED` if it happened after,
// applying/creating SDP over `peer/WebRtcPeerConnection.js`. Neither one
// ever closes, nor even touches, the underlying peer/PeerConnection.js —
// see this class's own existing header, "Voice Lifecycle Is Independent
// Of Peer Lifecycle" — 0.2.74 only sharpens WHICH failure is being
// reported, never widens what a voice failure is allowed to do to the
// connection carrying it.
//
// BUSY Was Already Real; 0.2.74 Only Gives It A Dedicated Test.
// `_requireIdle()` (refusing a SECOND call this device places while
// already in one) and `_handleInvite()`'s own `VoiceCallSignalType.BUSY`
// reply (refusing a call this device RECEIVES while already in one) both
// already existed in 0.2.73 — see tests/VoiceCallReliability.test.js for
// the concurrency proof the design doc asked for. Nothing in this file
// changed to make BUSY "real"; it already was.
//
// ---- 0.2.75 — Voice UX & Device Controls -------------------------------
//
// Device Selection Is Local State, Not Peer Protocol State. Exactly like
// `setMuted()`'s own 0.2.73 precedent, `setInputDevice()` below never
// produces a wire message — core/VoiceCallSignal.js and
// core/VoiceMediaSignal.js gain nothing from this milestone. The peer
// simply hears whichever microphone this device happens to be using; it
// has no more business knowing WHICH one than it does knowing whether
// this side is muted by flipping `enabled` versus by physically covering
// the mic.
//
// A Live Device Switch Reuses RTCRtpSender#replaceTrack(), Never A
// Second Renegotiation. `setInputDevice()` mid-call goes through
// `_switchInputDevice()`, which calls the SAME
// peer/WebRtcPeerConnection.js#replaceAudioTrack() a caller would use to
// swap in a different track — see that method's own header. No SDP
// offer/answer round trip happens, no `role === 'offerer'` question is
// ever asked, and VoiceSessionState never leaves ACTIVE (or CONNECTING)
// for the duration of a switch — a device change is invisible to
// core/VoiceSessionState.js by construction, exactly as
// docs/Roadmap.md's own 0.2.75 design doc asked: "same PeerConnection,
// same authenticated identity, same VoiceSession."
//
// A Local Media Problem Never Ends A Call By Itself. If the currently
// attached local track ends on its own — the OS/browser's own signal
// that a device disappeared (unplugged, revoked permission, the app lost
// exclusive access) — `_handleLocalTrackEnded()` below does NOT tear the
// call down. It attempts exactly one automatic fallback to the
// platform's own default input device (mirroring an ordinary phone
// quietly falling back to its built-in mic when a Bluetooth headset
// drops); if THAT also fails, the call stays exactly as it was
// (ACTIVE/CONNECTING, peer/PeerConnection.js untouched) and this device
// simply transmits no audio until the owner picks a working device —
// `onMicrophoneUnavailable()` is a purely informational signal for a UI
// to show, never a VoiceCallEndReason, because nothing here decided the
// call was over. See core/VoiceCallEndReason.js's own header on why
// MEDIA_FAILED stays reserved for a failure at CALL-START/ACCEPT time —
// a mid-call device loss is a genuinely different situation with a
// genuinely different, non-fatal response.
//
// Output Device Selection Never Enters This Class. Choosing which
// SPEAKER plays the remote party's audio is a fact about this device's
// own audio hardware, never about the call — `getRemoteStream()`'s
// existing `MediaStream` is already everything a UI needs to bind an
// `<audio>` element's `setSinkId()` to a chosen output device directly.
// Adding an `setOutputDevice()` here would be the same mistake as
// letting core/VoiceCallSignal.js carry mute state: media routing, once
// the stream itself has left this class's hands, is a UI/platform
// concern, never VoiceSession's.
//
// ---- 0.2.79 — Multi-Device Social State Semantics ----------------------
//
// canCall()/`_requireEligible()` above already reused application/
// ChatUseCase.js#canChat()'s own predicate byte-for-byte — 0.2.79 extends
// that reuse one step further: both now consult the RESOLVED SOCIAL
// identity of a connected peer, via the same optional `resolveSocialIdentity`
// collaborator (default: application/SocialIdentityResolver.js#resolveDirectSocialIdentity)
// application/FriendRelationshipUseCase.js/application/ChatUseCase.js
// already carry, so Bob's authorization check sees "Alice Identity ->
// FRIEND -> voice permitted," never "AlicePhone = friend? AliceLaptop =
// friend?" — see docs/Principles.md, "Device Authorization Changes Peer
// Authority, Never Social Identity."
//
// A `_call` record's own `peerIdentityId` — exposed through
// `getActiveCall()`, `onIncomingCall()`, `onCallStateChanged()`, and
// consulted by `_reconcileForBlocked()`/`_reconcileForFriends()` against
// the SAME resolved-identity block/friend lists — is now that RESOLVED
// identity too, matching application/ChatUseCase.js's own "peerIdentityId
// means the parent, not the raw device key" convention exactly.
//
// The VoiceSession itself stays exactly as device-local and ephemeral as
// this class's own header already establishes ("One Call At A Time, Per
// Device"; "One Logical PeerConnection, Never A Second One For Voice") —
// 0.2.79 does not change that even slightly. A call record's SEPARATE
// `remoteConnectionIdentityId` field is the RAW, literally-authenticated
// key of the one fixed connection this call is bound to for its entire
// lifetime — used ONLY where a core/VoiceCallSignal.js wire field must
// match what the OTHER side's own raw connection independently verifies
// (`acceptCall()`, `rejectCall()`, `_notifyPeerCallEnded()`) — never
// confused with the resolved `peerIdentityId` used everywhere else. Since
// a call is always bound to one single, unchanging connection for its
// whole lifetime, mid-call signal validation (`_handleAccept()`/
// `_handleRejectOrBusy()`/`_handleEnd()`/`_handleIncomingMedia()`) is free
// to compare resolved-to-resolved instead — both stay 1:1 correlated for
// as long as that one connection lives, so either comparison is
// equally correct; this file consistently picks resolved, matching
// `peerIdentityId`'s own meaning everywhere else in this class.
//
// Ringing every authorized device of a callee at once ("does a call ring
// AlicePhone AND AliceLaptop simultaneously?") is explicitly NOT this
// milestone's — see docs/Roadmap.md, 0.2.79, "Deliberately not in 0.2.79."
// `startCall()` still targets exactly one, explicitly chosen
// `connectedPeer`, unchanged.
export class VoiceUseCase {
    constructor(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        friendRelationshipUseCase,
        peerBlockUseCase = null,
        localAudioTrackProvider = new LocalAudioTrackProvider(),
        callProtocol = VoiceUseCase.CALL_PROTOCOL,
        mediaProtocol = VoiceUseCase.MEDIA_PROTOCOL,
        ringingTimeoutMs = DEFAULT_RINGING_TIMEOUT_MS,
        setTimeoutFn = null,
        clearTimeoutFn = null,
        resolveSocialIdentity = resolveDirectSocialIdentity
    } = {}) {
        if (!identityProvider) {
            throw new Error('VoiceUseCase: identityProvider is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function') {
            throw new Error('VoiceUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('VoiceUseCase: a ConnectedPeerRegistry is required');
        }
        if (!friendRelationshipUseCase || typeof friendRelationshipUseCase.getState !== 'function') {
            throw new Error('VoiceUseCase: a FriendRelationshipUseCase is required');
        }
        this._identityProvider = identityProvider;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._friends = friendRelationshipUseCase;
        this._isBlocked = peerBlockUseCase ? (identityId) => peerBlockUseCase.isBlocked(identityId) : () => false;
        this._resolveSocialIdentity = resolveSocialIdentity;
        this._audio = localAudioTrackProvider;
        this._callProtocol = callProtocol;
        this._mediaProtocol = mediaProtocol;
        this._eventBus = new EventBus();
        this._call = null; // see this class's own header, "One Call At A Time, Per Device."
        // 0.2.75 — this device's own chosen input device, null meaning
        // "the platform's default." Deliberately OUTLIVES any one call —
        // set via setInputDevice() at any time, even with no call in
        // progress — and is simply the deviceId _beginMediaNegotiation()
        // reads the NEXT time a track is acquired, exactly like an
        // ordinary phone's own "preferred microphone" setting.
        this._preferredInputDeviceId = null;
        // 0.2.74 — see this class's own header, "Ringing Is Bounded By
        // Local Policy, Never By The Network." Timer functions are
        // injectable purely so a test can use a short real delay without
        // touching global timer semantics — mirrors
        // application/AutosaveScheduler.js's own identical precedent.
        this._ringingTimeoutMs = ringingTimeoutMs;
        this._setTimeout = setTimeoutFn || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = clearTimeoutFn || ((id) => clearTimeout(id));

        this._blockedIds = peerBlockUseCase ? new Set(peerBlockUseCase.getBlocked().map((b) => b.identityId)) : new Set();
        this._friendIds = new Set(friendRelationshipUseCase.getRelationships()
            .filter((r) => r.status === FriendshipState.FRIEND)
            .map((r) => r.identityId));
        this._unsubscribeBlocks = peerBlockUseCase
            ? peerBlockUseCase.onBlockedChanged((blocked) => this._reconcileForBlocked(blocked))
            : null;
        this._unsubscribeFriends = friendRelationshipUseCase.onRelationshipsChanged
            ? friendRelationshipUseCase.onRelationshipsChanged((relationships) => this._reconcileForFriends(relationships))
            : null;

        this._unsubscribeCallBus = this._bus.subscribe(this._callProtocol, (payload, meta) => this._handleIncomingCall(payload, meta));
        this._unsubscribeMediaBus = this._bus.subscribe(this._mediaProtocol, (payload, meta) => this._handleIncomingMedia(payload, meta));

        // peer/PeerMessageBus.js#attach() routes EVERY protocol for a
        // given connectionId, not merely the caller's own — but it is
        // never assumed some OTHER use case (application/ChatUseCase.js,
        // say) already called it first. Every protocol built on the bus
        // independently guarantees its own messages are routed, exactly
        // like application/ChatUseCase.js's own constructor does —
        // attach() is an explicit no-op for an already-attached
        // connectionId (see that file's own header), so calling it a
        // second time here is always safe.
        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
    }

    // "Can Alice place/receive a call with this identity, independent of
    // whether a connection or device capability exists right now?" —
    // deliberately the SAME predicate application/ChatUseCase.js#canChat()
    // already applies, per this class's own header.
    canCall(identityId) {
        return Boolean(identityId) && !this._isBlocked(identityId) && this._friends.getState(identityId) === FriendshipState.FRIEND;
    }

    // Whether `connectedPeer`'s own underlying connection is capable of
    // carrying audio at all — true only for a real
    // peer/WebRtcPeerConnection.js, never peer/LocalPeerConnectionProvider.js's
    // in-process fake, which has no media stack. A UI reads this to grey
    // out a "Call" button with an honest reason rather than letting
    // startCall() throw.
    supportsVoice(connectedPeer) {
        return Boolean(connectedPeer && connectedPeer.connection
            && typeof connectedPeer.connection.addAudioTrack === 'function'
            && typeof connectedPeer.connection.onRemoteTrack === 'function');
    }

    // The current call, or null if none — `{ callId, peerIdentityId,
    // state }`, deliberately never exposing the raw connection or
    // MediaStreamTrack objects themselves (see getRemoteStream() below
    // for the one UI-facing exception, a MediaStream for an <audio>
    // element to bind to).
    getActiveCall() {
        if (!this._call) {
            return null;
        }
        return { callId: this._call.callId, peerIdentityId: this._call.peerIdentityId, state: this._call.state };
    }

    // The remote participant's MediaStream once one has arrived (state
    // ACTIVE or later), or null before then / for a mismatched callId —
    // a UI binds this straight to an <audio autoplay> element's
    // srcObject.
    getRemoteStream(callId) {
        return (this._call && this._call.callId === callId) ? this._call.remoteStream : null;
    }

    // Whether THIS device's own outgoing audio is currently muted —
    // purely local, see this class's own header.
    isMuted() {
        return Boolean(this._call && this._call.localTrack && !this._call.localTrack.enabled);
    }

    // Flips this device's own outgoing track's `enabled` flag. A no-op
    // if no local track has been attached yet (e.g. still CALLING/RINGING).
    // Never transmitted — see this class's own header.
    setMuted(muted) {
        if (this._call && this._call.localTrack) {
            this._call.localTrack.enabled = !muted;
        }
    }

    // 0.2.75 — "what input devices could setInputDevice() below choose
    // among?" A plain pass-through to
    // application/LocalAudioTrackProvider.js#listInputDevices() — this
    // class adds no vocabulary of its own, exactly like supportsVoice()
    // adds no vocabulary beyond what peer/WebRtcPeerConnection.js already
    // answers.
    listInputDevices() {
        return this._audio.listInputDevices ? this._audio.listInputDevices() : Promise.resolve([]);
    }

    // This device's own currently PREFERRED input device — null means
    // "platform default." Reflects the preference regardless of whether
    // a call is in progress; see this class's own header, "Device
    // Selection Is Local State, Not Peer Protocol State."
    getInputDevice() {
        return this._preferredInputDeviceId;
    }

    // Alice's "change my microphone" gesture — safe to call at ANY time,
    // in or out of a call. Outside a call, or before this call's own
    // local track has been acquired yet (still CALLING/RINGING), this
    // only ever records the preference for `_beginMediaNegotiation()` to
    // read later. Mid-call (CONNECTING/ACTIVE, a local track already
    // attached), it performs a LIVE switch via `_switchInputDevice()` —
    // see this class's own header on why that never renegotiates and
    // never ends the call on failure. Resolves once the switch (if any)
    // completes; rejects with whatever `application/
    // LocalAudioTrackProvider.js#getLocalAudioTrack()` itself threw for
    // the NEW device, leaving the call exactly as it was before this call
    // — never partially switched, never torn down.
    async setInputDevice(deviceId) {
        const normalized = deviceId || null;
        if (this._call && this._call.localTrack) {
            // Committed to `_preferredInputDeviceId` only AFTER the live
            // switch actually succeeds — a device this platform just
            // refused must never silently become the STANDING preference
            // a future call would try (and fail) again; see this
            // method's own header, "leaving the call exactly as it was
            // before this call."
            await this._switchInputDevice(this._call, normalized);
            this._preferredInputDeviceId = normalized;
        } else {
            // No live track to probe against yet — this is genuinely
            // just bookkeeping for whenever _beginMediaNegotiation() next
            // runs, exactly like choosing a device before a call exists
            // at all. Whether it actually works is answered honestly at
            // THAT moment (MEDIA_FAILED), never guessed at here.
            this._preferredInputDeviceId = normalized;
        }
    }

    // Returns an unsubscribe function. Fires `(callId, peerIdentityId)`
    // when this device's own local track ended on its own AND the
    // automatic fallback to the platform default also failed — see this
    // class's own header, "A Local Media Problem Never Ends A Call By
    // Itself." Purely informational; the call this callId names is still
    // exactly whatever VoiceSessionState it already was.
    onMicrophoneUnavailable(callback) {
        const subscription = this._eventBus.subscribe(MICROPHONE_UNAVAILABLE_EVENT, ({ callId, peerIdentityId }) => callback(callId, peerIdentityId));
        return () => subscription.unsubscribe();
    }

    // Alice's "Call" gesture. `connectedPeer` MUST be a real, currently
    // AUTHENTICATED application/ConnectedPeer.js over a media-capable
    // (real WebRTC) connection — refused outright otherwise, exactly like
    // application/ChatUseCase.js#sendMessage()'s own header explains for
    // chat. Resolves with the new callId once the INVITE has been sent;
    // the call only reaches ACTIVE once the callee accepts AND media
    // negotiation completes — see `onCallStateChanged()`.
    startCall(connectedPeer) {
        const peerIdentity = this._requireAuthenticatedPeer(connectedPeer);
        // 0.2.79 — eligibility and the call record's own `peerIdentityId`
        // use the RESOLVED social identity; the wire INVITE's `calleeIdentity`
        // below deliberately stays keyed by the RAW, literally-authenticated
        // `peerIdentity` — see this class's own header.
        const social = this._resolveSocialIdentityForRemote(peerIdentity);
        this._requireEligible(social.identityId);
        this._requireIdle();
        this._requireMediaCapable(connectedPeer.connection);

        const callId = createId();
        const myIdentityId = this._identityProvider.getSigningIdentity().id;
        this._call = this._createCallRecord({
            callId,
            peerIdentityId: social.identityId,
            remoteConnectionIdentityId: peerIdentity.identityId,
            connectedPeer,
            state: VoiceSessionState.CALLING,
            isCaller: true
        });
        this._bus.send(connectedPeer, this._callProtocol, toVoiceCallSignal({
            callId, type: VoiceCallSignalType.INVITE, callerIdentity: myIdentityId, calleeIdentity: peerIdentity.identityId
        }));
        return callId;
    }

    // Bob's "Accept" gesture, in response to an onIncomingCall() event.
    // Acquires this device's own local audio track (the FIRST moment
    // 0.2.73 ever touches a microphone on the callee's side — see this
    // class's own header), attaches it to the connection, sends ACCEPT,
    // and begins media negotiation — see `_beginMediaNegotiation()`.
    async acceptCall(callId) {
        if (!this._call || this._call.callId !== callId || this._call.state !== VoiceSessionState.RINGING) {
            throw new Error('VoiceUseCase: no incoming call with that id is waiting to be accepted');
        }
        // Re-checked fresh — see this class's own header, and
        // application/ChatUseCase.js#_requireEligible()'s identical
        // precedent: eligibility at INVITE time does not guarantee
        // eligibility at ACCEPT time.
        this._requireEligible(this._call.peerIdentityId);
        const call = this._call;
        const myIdentityId = this._identityProvider.getSigningIdentity().id;
        this._bus.send(call.connectedPeer, this._callProtocol, toVoiceCallSignal({
            callId, type: VoiceCallSignalType.ACCEPT, callerIdentity: call.remoteConnectionIdentityId, calleeIdentity: myIdentityId
        }));
        this._setCallState(call, VoiceSessionState.CONNECTING);
        try {
            await this._beginMediaNegotiation(call);
        } catch (e) {
            // 0.2.74 — Alice already received our ACCEPT and is sitting in
            // CONNECTING expecting a renegotiation SDP that will now never
            // arrive; tell her the call is over rather than leaving her
            // hanging — see this class's own header.
            this._notifyPeerCallEnded(call);
            this._teardownCall(call, e && e.voiceReason ? e.voiceReason : VoiceCallEndReason.NEGOTIATION_FAILED);
            throw e;
        }
    }

    // Bob's "Decline" gesture. No media was ever requested for a
    // rejected call — nothing to tear down beyond the call record
    // itself.
    rejectCall(callId) {
        if (!this._call || this._call.callId !== callId || this._call.state !== VoiceSessionState.RINGING) {
            throw new Error('VoiceUseCase: no incoming call with that id is waiting to be rejected');
        }
        const call = this._call;
        const myIdentityId = this._identityProvider.getSigningIdentity().id;
        this._bus.send(call.connectedPeer, this._callProtocol, toVoiceCallSignal({
            callId, type: VoiceCallSignalType.REJECT, callerIdentity: call.remoteConnectionIdentityId, calleeIdentity: myIdentityId
        }));
        this._teardownCall(call, VoiceCallEndReason.REJECTED);
    }

    // Either party's "Hang Up" gesture, valid in any non-terminal call
    // state (CALLING/CONNECTING/ACTIVE). Best-effort notifies the peer
    // (silently skipped if the connection is no longer AUTHENTICATED —
    // there is nobody left to tell) and always tears down local media
    // regardless. Never touches the underlying peer/PeerConnection.js —
    // see this class's own header, "Voice Lifecycle Is Independent Of
    // Peer Lifecycle."
    endCall(callId) {
        if (!this._call || this._call.callId !== callId) {
            return;
        }
        const call = this._call;
        this._notifyPeerCallEnded(call);
        this._teardownCall(call, VoiceCallEndReason.LOCAL_HANGUP);
    }

    // Returns an unsubscribe function. Fires `(peerIdentityId, callId)`
    // the instant an INVITE this device did not initiate is accepted for
    // ringing — a UI shows an incoming-call banner from this alone.
    onIncomingCall(callback) {
        const subscription = this._eventBus.subscribe(INCOMING_CALL_EVENT, ({ peerIdentityId, callId }) => callback(peerIdentityId, callId));
        return () => subscription.unsubscribe();
    }

    // Returns an unsubscribe function. Fires `(callId, state, info)` on
    // every VoiceSessionState transition of the currently tracked call —
    // `info` is `{ peerIdentityId, reason }`, `reason` a
    // core/VoiceCallEndReason.js value, populated only for ENDED (0.2.74 —
    // see that file's own header for the full, closed vocabulary).
    onCallStateChanged(callback) {
        const subscription = this._eventBus.subscribe(CALL_STATE_EVENT, ({ callId, state, info }) => callback(callId, state, info));
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeCallBus) { this._unsubscribeCallBus(); this._unsubscribeCallBus = null; }
        if (this._unsubscribeMediaBus) { this._unsubscribeMediaBus(); this._unsubscribeMediaBus = null; }
        if (this._unsubscribeBlocks) { this._unsubscribeBlocks(); this._unsubscribeBlocks = null; }
        if (this._unsubscribeFriends) { this._unsubscribeFriends(); this._unsubscribeFriends = null; }
        if (this._unsubscribeRegistry) { this._unsubscribeRegistry(); this._unsubscribeRegistry = null; }
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, or friendRelationshipUseCase — shared
        // collaborators that outlive this one protocol's use case,
        // mirroring application/ChatUseCase.js#dispose()'s identical
        // precedent. Does NOT auto-end an in-progress call either —
        // callers that want a clean hangup on shutdown call endCall()
        // explicitly first.
        if (this._call) {
            this._unwireCall(this._call);
        }
    }

    // ---- incoming wire handling -------------------------------------

    // Every core/VoiceCallSignal.js is checked against ONE uniform rule,
    // regardless of type: the message must name exactly two identities
    // (callerIdentity/calleeIdentity), one of which is THIS device's own
    // signing identity and the OTHER of which is the SENDING connection's
    // own already-proven remoteIdentity — never merely whatever the
    // payload itself claims. This defeats a forged-sender attack for
    // every signal type at once (Charlie's authenticated connection
    // cannot claim to be inviting, accepting, rejecting, or ending a call
    // as/to Alice), the same "claimed identity must match the proven
    // connection" discipline application/ChatUseCase.js#_handleIncoming()
    // already established for chat content.
    _handleIncomingCall(payload, meta) {
        if (!isValidVoiceCallSignal(payload)) {
            return;
        }
        const remoteIdentity = meta.connectedPeer && meta.connectedPeer.remoteIdentity;
        if (!remoteIdentity) {
            return;
        }
        let myIdentityId;
        try {
            myIdentityId = this._identityProvider.getSigningIdentity().id;
        } catch {
            return;
        }
        const remoteIsCaller = payload.callerIdentity === remoteIdentity.identityId && payload.calleeIdentity === myIdentityId;
        const remoteIsCallee = payload.calleeIdentity === remoteIdentity.identityId && payload.callerIdentity === myIdentityId;
        if (!remoteIsCaller && !remoteIsCallee) {
            return;
        }

        switch (payload.type) {
            case VoiceCallSignalType.INVITE:
                return this._handleInvite(payload, meta, remoteIdentity, myIdentityId);
            case VoiceCallSignalType.ACCEPT:
                return this._handleAccept(payload, remoteIdentity);
            case VoiceCallSignalType.REJECT:
                return this._handleRejectOrBusy(payload, remoteIdentity, VoiceCallEndReason.REJECTED);
            case VoiceCallSignalType.BUSY:
                return this._handleRejectOrBusy(payload, remoteIdentity, VoiceCallEndReason.BUSY);
            case VoiceCallSignalType.END:
                return this._handleEnd(payload, remoteIdentity);
            default:
                return;
        }
    }

    _handleInvite(payload, meta, remoteIdentity, myIdentityId) {
        // 0.2.79 — eligibility resolves the SOCIAL identity; the wire
        // BUSY reply below (if this device is already in a call) deliberately
        // stays keyed by the RAW `remoteIdentity` — see this class's own
        // header.
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (this._isBlocked(social.identityId) || this._friends.getState(social.identityId) !== FriendshipState.FRIEND) {
            // Silently ignored, mirroring application/ChatUseCase.js
            // #_handleIncoming()'s own precedent — there is no
            // distinguishable rejection an attacker could use to learn
            // which reason applied.
            return;
        }
        if (this._call) {
            // Busy with ANY call — see this class's own header, "One
            // Call At A Time, Per Device." A retransmitted INVITE for the
            // call already in progress is simply ignored, never re-answered.
            if (this._call.callId !== payload.callId) {
                this._bus.send(meta.connectedPeer, this._callProtocol, toVoiceCallSignal({
                    callId: payload.callId, type: VoiceCallSignalType.BUSY, callerIdentity: remoteIdentity.identityId, calleeIdentity: myIdentityId
                }));
            }
            return;
        }
        this._call = this._createCallRecord({
            callId: payload.callId,
            peerIdentityId: social.identityId,
            remoteConnectionIdentityId: remoteIdentity.identityId,
            connectedPeer: meta.connectedPeer,
            state: VoiceSessionState.RINGING,
            isCaller: false
        });
        this._eventBus.publish(INCOMING_CALL_EVENT, { peerIdentityId: social.identityId, callId: payload.callId });
    }

    _handleAccept(payload, remoteIdentity) {
        // 0.2.79 — resolved-to-resolved comparison; safe and equivalent to
        // a raw comparison here since a call is bound to one unchanging
        // connection for its whole lifetime — see this class's own header.
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || !this._call.isCaller || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        if (this._call.state !== VoiceSessionState.CALLING) {
            return;
        }
        const call = this._call;
        this._setCallState(call, VoiceSessionState.CONNECTING);
        // `call` is captured here, deliberately never re-read off
        // `this._call` inside the async continuation below — by the time
        // this promise settles, `this._call` may already point to a
        // DIFFERENT call (this one having ended and a new one started),
        // and tearing down whatever `this._call` currently is would tear
        // down the WRONG call. `_teardownCall()`'s own `this._call ===
        // call` guard is what makes tearing down an already-superseded
        // `call` object here safe no matter what.
        this._beginMediaNegotiation(call).catch((e) => {
            // 0.2.74 — Alice (the caller/offerer) is the one who will
            // create the actual renegotiation offer; if OUR OWN track
            // acquisition or addAudioTrack() failed here on the answerer
            // side before an offer even arrived, Alice has no other way to
            // learn the call is over — see this class's own header.
            this._notifyPeerCallEnded(call);
            this._teardownCall(call, e && e.voiceReason ? e.voiceReason : VoiceCallEndReason.NEGOTIATION_FAILED);
        });
    }

    _handleRejectOrBusy(payload, remoteIdentity, reason) {
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        if (this._call.state !== VoiceSessionState.CALLING) {
            return;
        }
        this._teardownCall(this._call, reason);
    }

    _handleEnd(payload, remoteIdentity) {
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        // Deliberately always REMOTE_HANGUP, never inferring the SENDER's
        // own reason — see this class's own header, "Reasons Are Local
        // Judgments, Never Transmitted Facts" (0.2.74).
        this._teardownCall(this._call, VoiceCallEndReason.REMOTE_HANGUP);
    }

    // core/VoiceMediaSignal.js's own trust boundary — deliberately
    // smaller than the call-signal one above, because a media signal
    // carries no content, only SDP for a renegotiation this device is
    // already expecting. The one question genuinely specific to this
    // vocabulary: does `callId` match the call THIS device is currently
    // tracking, over THIS SAME connection? A media signal for an unknown
    // or foreign callId is silently dropped — see
    // core/VoiceMediaSignal.js's own header.
    _handleIncomingMedia(payload, meta) {
        if (!isValidVoiceMediaSignal(payload)) {
            return;
        }
        const remoteIdentity = meta.connectedPeer && meta.connectedPeer.remoteIdentity;
        if (!remoteIdentity) {
            return;
        }
        if (payload.senderIdentity !== remoteIdentity.identityId) {
            return;
        }
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        const call = this._call;
        const connection = call.connectedPeer.connection;
        if (payload.kind === VoiceMediaSignalKind.OFFER) {
            connection.applyRemoteOffer(payload.sdp).then((answerSdp) => {
                const myIdentityId = this._identityProvider.getSigningIdentity().id;
                this._bus.send(call.connectedPeer, this._mediaProtocol, toVoiceMediaSignal({
                    callId: call.callId, kind: VoiceMediaSignalKind.ANSWER, sdp: answerSdp, senderIdentity: myIdentityId
                }));
            }).catch(() => {
                // 0.2.74 — the offerer is waiting for an ANSWER that will
                // now never come; see this class's own header.
                this._notifyPeerCallEnded(call);
                this._teardownCall(call, VoiceCallEndReason.NEGOTIATION_FAILED);
            });
        } else {
            connection.applyRemoteAnswer(payload.sdp).catch(() => {
                this._notifyPeerCallEnded(call);
                this._teardownCall(call, VoiceCallEndReason.NEGOTIATION_FAILED);
            });
        }
    }

    // ---- media negotiation --------------------------------------------

    // Runs on BOTH sides once ACCEPT has been sent or received — see this
    // class's own header, "No Glare, By Construction." Acquires and
    // attaches this device's own local track first, regardless of role,
    // so a `role === 'answerer'` side already has its track attached
    // BEFORE the offerer's offer even arrives, producing bidirectional
    // audio in a single offer/answer round trip.
    //
    // 0.2.74 — whatever this rejects with is tagged `.voiceReason`, either
    // MEDIA_FAILED (the LOCAL track itself never came) or
    // NEGOTIATION_FAILED (the track came, but attaching/renegotiating it
    // over the connection failed) — see this class's own header, "Local
    // Microphone Failure Is Never Confused With Peer Rejection Or A Dead
    // Connection."
    async _beginMediaNegotiation(call) {
        let track;
        try {
            // 0.2.75 — reads this device's own current PREFERENCE, set at
            // any point (before or during this call) via setInputDevice()
            // — see that method's own header.
            track = await this._audio.getLocalAudioTrack(this._preferredInputDeviceId);
        } catch (e) {
            throw this._taggedVoiceError(e, VoiceCallEndReason.MEDIA_FAILED);
        }
        call.localTrack = track;
        call.inputDeviceId = this._preferredInputDeviceId;
        this._wireLocalTrackEnded(call, track);
        try {
            call.connectedPeer.connection.addAudioTrack(track);
            if (call.connectedPeer.connection.role === 'offerer') {
                const offerSdp = await call.connectedPeer.connection.renegotiate();
                const myIdentityId = this._identityProvider.getSigningIdentity().id;
                this._bus.send(call.connectedPeer, this._mediaProtocol, toVoiceMediaSignal({
                    callId: call.callId, kind: VoiceMediaSignalKind.OFFER, sdp: offerSdp, senderIdentity: myIdentityId
                }));
            }
            // `role === 'answerer'` does nothing further here — it waits
            // for _handleIncomingMedia() to deliver the offerer's OFFER.
        } catch (e) {
            throw this._taggedVoiceError(e, VoiceCallEndReason.NEGOTIATION_FAILED);
        }
    }

    _taggedVoiceError(e, reason) {
        if (e && typeof e === 'object') {
            e.voiceReason = reason;
        }
        return e;
    }

    // ---- device switching (0.2.75) -------------------------------------

    // The one place a local track is actually swapped out from under an
    // in-progress call — used by both the deliberate `setInputDevice()`
    // gesture and the automatic fallback `_handleLocalTrackEnded()`
    // attempts below. Acquires the NEW track first, before touching
    // anything about the call — if acquisition itself fails, `call` is
    // left completely as it was (old track still attached, still
    // transmitting) and the rejection simply propagates to the caller.
    // See this class's own header, "A Live Device Switch Reuses
    // RTCRtpSender#replaceTrack(), Never A Second Renegotiation."
    async _switchInputDevice(call, deviceId) {
        const newTrack = await this._audio.getLocalAudioTrack(deviceId);
        // Preserves whatever mute state THIS call was already in — a
        // device switch is never itself an unmute, exactly like
        // application/VoiceUseCase.js#setMuted()'s own local-only
        // contract would otherwise be silently bypassed by switching to
        // a fresh, always-enabled track.
        newTrack.enabled = call.localTrack ? call.localTrack.enabled : true;
        try {
            await call.connectedPeer.connection.replaceAudioTrack(newTrack);
        } catch (e) {
            // The NEW track was already acquired but never actually put
            // to use — release it here rather than leaking it (and the
            // device's own "in use" indicator) while `call` stays exactly
            // as it was on its OLD track.
            this._audio.releaseTrack(newTrack);
            throw e;
        }
        const oldTrack = call.localTrack;
        this._unwireLocalTrackEnded(call);
        call.localTrack = newTrack;
        call.inputDeviceId = deviceId;
        this._wireLocalTrackEnded(call, newTrack);
        if (oldTrack) {
            this._audio.releaseTrack(oldTrack);
        }
    }

    // Wires this device's own OS/browser-level "this track just died"
    // signal — a real `MediaStreamTrack` fires `ended` when its
    // underlying device disappears (unplugged, permission revoked,
    // exclusive access lost to another app), completely independent of
    // anything application/LocalAudioTrackProvider.js#releaseTrack()
    // itself does when THIS class is the one stopping the track
    // deliberately (see `_unwireLocalTrackEnded()` below, always called
    // first in every path that retires a track on purpose).
    _wireLocalTrackEnded(call, track) {
        const handler = () => this._handleLocalTrackEnded(call, track);
        track.addEventListener('ended', handler);
        call.localTrackEndedTrack = track;
        call.localTrackEndedHandler = handler;
    }

    _unwireLocalTrackEnded(call) {
        if (call.localTrackEndedTrack && call.localTrackEndedHandler) {
            call.localTrackEndedTrack.removeEventListener('ended', call.localTrackEndedHandler);
        }
        call.localTrackEndedTrack = null;
        call.localTrackEndedHandler = null;
    }

    // See this class's own header, "A Local Media Problem Never Ends A
    // Call By Itself." `endedTrack` is compared against `call.localTrack`
    // (not merely `this._call === call`) because a track this method's
    // own earlier fallback already SUPERSEDED can still fire its own late
    // `ended` event — that stale event must never re-trigger a SECOND
    // fallback attempt on a track nobody is using anymore.
    async _handleLocalTrackEnded(call, endedTrack) {
        if (this._call !== call || call.localTrack !== endedTrack) {
            return;
        }
        try {
            await this._switchInputDevice(call, null);
        } catch {
            // No replacement device is available at all — the call is
            // deliberately left exactly as it is (see this class's own
            // header); only a local, informational signal fires so a UI
            // can tell the owner their microphone disappeared.
            this._eventBus.publish(MICROPHONE_UNAVAILABLE_EVENT, { callId: call.callId, peerIdentityId: call.peerIdentityId });
        }
    }

    // ---- social-authorization reconciliation (mirrors 0.2.72) --------

    _reconcileForBlocked(blocked) {
        const now = new Set(blocked.map((b) => b.identityId));
        for (const identityId of now) {
            if (!this._blockedIds.has(identityId)) {
                this._terminateIfInCallWith(identityId, VoiceCallEndReason.BLOCKED);
            }
        }
        this._blockedIds = now;
    }

    _reconcileForFriends(relationships) {
        const now = new Set(relationships.filter((r) => r.status === FriendshipState.FRIEND).map((r) => r.identityId));
        for (const identityId of this._friendIds) {
            if (!now.has(identityId)) {
                this._terminateIfInCallWith(identityId, VoiceCallEndReason.UNFRIENDED);
            }
        }
        this._friendIds = now;
    }

    _terminateIfInCallWith(peerIdentityId, reason) {
        if (this._call && this._call.peerIdentityId === peerIdentityId) {
            const call = this._call;
            this._notifyPeerCallEnded(call);
            this._teardownCall(call, reason);
        }
    }

    // 0.2.74 — best-effort "this call is over" notification, factored out
    // of endCall()'s own original 0.2.73 body: every path that decides
    // LOCALLY that a call is ending (an explicit hang up, a block/unfriend,
    // a ringing timeout, a media/negotiation failure) uses this SAME
    // helper to tell the peer, rather than each duplicating the identical
    // "only if still AUTHENTICATED, swallow a race on the send itself"
    // try/catch. Silently skipped if the connection is no longer
    // AUTHENTICATED — there is nobody left to tell, and local teardown
    // happens regardless either way.
    _notifyPeerCallEnded(call) {
        if (call.connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            return;
        }
        try {
            const myIdentityId = this._identityProvider.getSigningIdentity().id;
            // 0.2.79 — wire fields use the RAW, literally-authenticated
            // connection identity (`remoteConnectionIdentityId`), never the
            // resolved `peerIdentityId` — see this class's own header.
            const callerIdentity = call.isCaller ? myIdentityId : call.remoteConnectionIdentityId;
            const calleeIdentity = call.isCaller ? call.remoteConnectionIdentityId : myIdentityId;
            this._bus.send(call.connectedPeer, this._callProtocol, toVoiceCallSignal({
                callId: call.callId, type: VoiceCallSignalType.END, callerIdentity, calleeIdentity
            }));
        } catch {
            // The connection dropped between the check above and this
            // send — nothing left to notify; local teardown happens
            // regardless.
        }
    }

    // ---- ringing timeout ------------------------------------------------

    // See this class's own header, "Ringing Is Bounded By Local Policy,
    // Never By The Network." Armed the instant a call enters CALLING or
    // RINGING (from _createCallRecord() below) and disarmed the instant it
    // leaves either state — see _setCallState()/_unwireCall() below.
    _armRingingTimeout(call) {
        call.ringingTimer = this._setTimeout(() => this._onRingingTimeout(call), this._ringingTimeoutMs);
    }

    _clearRingingTimeout(call) {
        if (call.ringingTimer) {
            this._clearTimeout(call.ringingTimer);
            call.ringingTimer = null;
        }
    }

    _onRingingTimeout(call) {
        if (this._call !== call) {
            return;
        }
        // A courtesy, not an authority — see this class's own header.
        // Whichever side's timer fires first tells the other; the other
        // side's own timer would have fired independently regardless.
        this._notifyPeerCallEnded(call);
        this._teardownCall(call, VoiceCallEndReason.TIMEOUT);
    }

    // ---- call record lifecycle ----------------------------------------

    _createCallRecord({ callId, peerIdentityId, remoteConnectionIdentityId, connectedPeer, state, isCaller }) {
        const call = {
            callId, peerIdentityId, remoteConnectionIdentityId, connectedPeer, state, isCaller,
            localTrack: null, remoteTrack: null, remoteStream: null,
            unsubscribePeerState: null, unsubscribeRemoteTrack: null,
            ringingTimer: null,
            // 0.2.75 — see this class's own header on device controls.
            // `inputDeviceId` mirrors `this._preferredInputDeviceId` at
            // the moment this call's own track was last (re)acquired —
            // `null` until _beginMediaNegotiation() runs at all.
            inputDeviceId: null, localTrackEndedTrack: null, localTrackEndedHandler: null
        };
        if (state === VoiceSessionState.CALLING || state === VoiceSessionState.RINGING) {
            this._armRingingTimeout(call);
        }
        call.unsubscribePeerState = connectedPeer.onStateChange((lifecycleState) => {
            if (lifecycleState !== PeerLifecycleState.AUTHENTICATED && this._call === call) {
                this._teardownCall(call, VoiceCallEndReason.PEER_DISCONNECTED);
            }
        });
        call.unsubscribeRemoteTrack = connectedPeer.connection.onRemoteTrack((track, stream) => {
            if (this._call !== call) {
                return;
            }
            call.remoteTrack = track;
            call.remoteStream = stream;
            this._setCallState(call, VoiceSessionState.ACTIVE);
        });
        this._publishCallState(call);
        return call;
    }

    _setCallState(call, state) {
        // 0.2.74 — any state transition means this call is no longer
        // sitting in CALLING/RINGING, so whatever ringing timer was armed
        // for it is no longer relevant, regardless of which state it's
        // transitioning TO — see _createCallRecord()'s own comment on why
        // only CALLING/RINGING ever arm one in the first place.
        this._clearRingingTimeout(call);
        call.state = state;
        this._publishCallState(call);
    }

    _publishCallState(call, reason = null) {
        this._eventBus.publish(CALL_STATE_EVENT, {
            callId: call.callId,
            state: call.state,
            info: { peerIdentityId: call.peerIdentityId, reason }
        });
    }

    _unwireCall(call) {
        this._clearRingingTimeout(call);
        // 0.2.75 — deliberately BEFORE releasing/stopping the track
        // below: this call is ending on PURPOSE, so the track's own
        // `ended` event (which `releaseTrack()`/`removeAudioTrack()` are
        // about to trigger) must never be mistaken for the unexpected
        // device loss `_handleLocalTrackEnded()` exists to catch.
        this._unwireLocalTrackEnded(call);
        if (call.unsubscribePeerState) call.unsubscribePeerState();
        if (call.unsubscribeRemoteTrack) call.unsubscribeRemoteTrack();
        if (typeof call.connectedPeer.connection.removeAudioTrack === 'function') {
            call.connectedPeer.connection.removeAudioTrack();
        }
        if (call.localTrack) {
            this._audio.releaseTrack(call.localTrack);
        }
    }

    _teardownCall(call, reason) {
        this._unwireCall(call);
        if (this._call === call) {
            this._call = null;
        }
        call.state = VoiceSessionState.ENDED;
        this._publishCallState(call, reason);
    }

    // ---- guards ---------------------------------------------------------

    _requireAuthenticatedPeer(connectedPeer) {
        if (!connectedPeer || typeof connectedPeer.getLifecycleState !== 'function') {
            throw new Error('VoiceUseCase: a ConnectedPeer is required');
        }
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            throw new Error('VoiceUseCase: the peer must be an authenticated connection');
        }
        return connectedPeer.remoteIdentity;
    }

    _requireEligible(identityId) {
        if (this._isBlocked(identityId)) {
            throw new Error('VoiceUseCase: this identity is blocked');
        }
        if (this._friends.getState(identityId) !== FriendshipState.FRIEND) {
            throw new Error('VoiceUseCase: voice requires a mutual friendship');
        }
    }

    // 0.2.79 — resolves a bare `peer/PeerIdentity.js`-shaped remoteIdentity
    // (never a full application/ConnectedPeer.js — see this class's own
    // header) to its SOCIAL identity via the injected `resolveSocialIdentity`
    // collaborator. The collaborator's contract only ever reads a
    // `.remoteIdentity` property, so wrapping a bare remoteIdentity in
    // `{ remoteIdentity }` here is exactly as valid an input as passing a
    // real ConnectedPeer — see application/SocialIdentityResolver.js.
    _resolveSocialIdentityForRemote(remoteIdentity) {
        const wrapped = { remoteIdentity };
        return this._resolveSocialIdentity(wrapped) || resolveDirectSocialIdentity(wrapped);
    }

    _requireIdle() {
        if (this._call) {
            throw new Error('VoiceUseCase: this device is already in a call');
        }
    }

    _requireMediaCapable(connection) {
        if (!connection || typeof connection.addAudioTrack !== 'function' || typeof connection.onRemoteTrack !== 'function') {
            throw new Error('VoiceUseCase: voice requires a direct WebRTC peer connection');
        }
    }
}

// Deliberately its own protocol strings, separate from every chat
// protocol — see this class's own header and core/VoiceCallSignal.js's/
// core/VoiceMediaSignal.js's own headers.
VoiceUseCase.CALL_PROTOCOL = 'forkbuild:voice-call';
VoiceUseCase.MEDIA_PROTOCOL = 'forkbuild:voice-media';
