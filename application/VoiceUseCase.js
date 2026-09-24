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
import { findLiveConnectedPeers } from './ConnectedIdentityPeers.js';

const CALL_STATE_EVENT = 'VoiceCallStateChanged';
const INCOMING_CALL_EVENT = 'VoiceIncomingCall';
const MICROPHONE_UNAVAILABLE_EVENT = 'VoiceMicrophoneUnavailable';

// How long CALLING/RINGING may go unanswered before this device gives up.
const DEFAULT_RINGING_TIMEOUT_MS = 45000;

// Voice calls over an already-authenticated peer session: `forkbuild:voice-call`
// for lifecycle signals and `forkbuild:voice-media` for SDP, on the shared
// PeerMessageBus, like ChatUseCase.
//
// Eligibility is the same as chat (authenticated, not blocked, FRIEND),
// re-checked on every operation.
//
// One RTCPeerConnection: calls add an audio track to the connection already
// carrying the DataChannel and renegotiate it in place, with SDP sent in-band.
// There is no glare: only the side whose connection role is 'offerer' ever
// creates a renegotiation offer, whoever placed the call.
//
// One call at a time per device; an INVITE during a call gets BUSY.
//
// Voice never closes the peer connection, and a dropped connection ends the
// call only because audio has nowhere to go. Blocking or unfriending ends an
// active call immediately.
//
// The microphone is requested only when a call actually starts or is accepted.
// Mute state and the chosen input device are local, never sent on the wire
// (docs/Principles.md, "Audio Device State Is Never Presence, Never A Wire
// Fact"). Switching devices mid-call uses replaceTrack(), never
// renegotiation. If the device disappears mid-call, one fallback to the default
// input is tried; if that fails the call continues silently and
// onMicrophoneUnavailable() fires. A lost device never ends a call. Output device
// selection belongs to the UI (setSinkId on the remote stream).
//
// Ringing is bounded by a local timer on each side, and the side whose timer
// fires first tells the other as a courtesy. End reasons are local judgments:
// an incoming END is always REMOTE_HANGUP. Every locally decided teardown (hang
// up, timeout, media or negotiation failure) notifies the peer, so nobody is
// left waiting in CONNECTING.
//
// Multi-device: eligibility and `peerIdentityId` use the resolved social
// identity, while wire fields use the raw identity of the one connection a
// call is bound to (`remoteConnectionIdentityId`). startCallToIdentity() rings
// every live, voice-capable device of an identity under one callId. The first
// ACCEPT wins and the record collapses to a single connection; later accepts
// are cancelled. BUSY from any device ends the call; REJECT only removes that
// device. A revoked device stops resolving to the identity, so its replies are
// ignored. The callee side is unchanged and cannot tell it is part of a
// fan-out.
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
        this._call = null;
        // Preferred input device (null = platform default). Outlives calls and is read
        // the next time a track is acquired.
        this._preferredInputDeviceId = null;
        // Timer functions are injectable so tests can use short delays.
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

        // attach() is a no-op for an already-attached connection, so each protocol
        // attaches independently.
        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
    }

    canCall(identityId) {
        return Boolean(identityId) && !this._isBlocked(identityId) && this._friends.getState(identityId) === FriendshipState.FRIEND;
    }

    // Only a real WebRTC connection can carry audio; lets the UI disable "Call"
    // with a reason.
    supportsVoice(connectedPeer) {
        return Boolean(connectedPeer && connectedPeer.connection
            && typeof connectedPeer.connection.addAudioTrack === 'function'
            && typeof connectedPeer.connection.onRemoteTrack === 'function');
    }

    // Never exposes raw connections or tracks.
    getActiveCall() {
        if (!this._call) {
            return null;
        }
        return { callId: this._call.callId, peerIdentityId: this._call.peerIdentityId, state: this._call.state };
    }

    getRemoteStream(callId) {
        return (this._call && this._call.callId === callId) ? this._call.remoteStream : null;
    }

    isMuted() {
        return Boolean(this._call && this._call.localTrack && !this._call.localTrack.enabled);
    }

    // A no-op before a local track exists.
    setMuted(muted) {
        if (this._call && this._call.localTrack) {
            this._call.localTrack.enabled = !muted;
        }
    }

    listInputDevices() {
        return this._audio.listInputDevices ? this._audio.listInputDevices() : Promise.resolve([]);
    }

    getInputDevice() {
        return this._preferredInputDeviceId;
    }

    // Outside a call (or before the track is acquired) this only records the
    // preference. Mid-call it switches live; on failure the call stays exactly as
    // it was.
    async setInputDevice(deviceId) {
        const normalized = deviceId || null;
        if (this._call && this._call.localTrack) {
            // Saved only after the switch succeeds, so a refused device never becomes the
            // standing preference.
            await this._switchInputDevice(this._call, normalized);
            this._preferredInputDeviceId = normalized;
        } else {
            this._preferredInputDeviceId = normalized;
        }
    }

    // Fires when the local track ended and the fallback failed. Purely
    // informational: the call's state is unchanged.
    onMicrophoneUnavailable(callback) {
        const subscription = this._eventBus.subscribe(MICROPHONE_UNAVAILABLE_EVENT, ({ callId, peerIdentityId }) => callback(callId, peerIdentityId));
        return () => subscription.unsubscribe();
    }

    // `connectedPeer` must be authenticated over a media-capable connection.
    // Resolves once the INVITE is sent; ACTIVE comes after acceptance and
    // negotiation.
    startCall(connectedPeer) {
        const peerIdentity = this._requireAuthenticatedPeer(connectedPeer);
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

    // Rings every live, authorized, voice-capable device of `identityId` with one
    // callId and one call record. Throws if no device is reachable.
    startCallToIdentity(identityId) {
        this._requireEligible(identityId);
        this._requireIdle();
        const candidates = this._liveVoiceCandidates(identityId);
        if (candidates.length === 0) {
            throw new Error('VoiceUseCase: no reachable device for this identity');
        }

        const callId = createId();
        const myIdentityId = this._identityProvider.getSigningIdentity().id;
        this._call = this._createCallRecord({
            callId,
            peerIdentityId: identityId,
            candidateConnectedPeers: candidates,
            state: VoiceSessionState.CALLING,
            isCaller: true
        });
        for (const candidate of candidates) {
            this._bus.send(candidate, this._callProtocol, toVoiceCallSignal({
                callId, type: VoiceCallSignalType.INVITE, callerIdentity: myIdentityId, calleeIdentity: candidate.remoteIdentity.identityId
            }));
        }
        return callId;
    }

    canCallIdentity(identityId) {
        return this.canCall(identityId) && this._liveVoiceCandidates(identityId).length > 0;
    }

    async acceptCall(callId) {
        if (!this._call || this._call.callId !== callId || this._call.state !== VoiceSessionState.RINGING) {
            throw new Error('VoiceUseCase: no incoming call with that id is waiting to be accepted');
        }
        // Eligibility at INVITE time does not guarantee it at ACCEPT time.
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
            this._notifyPeerCallEnded(call);
            this._teardownCall(call, e && e.voiceReason ? e.voiceReason : VoiceCallEndReason.NEGOTIATION_FAILED);
            throw e;
        }
    }

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

    // Valid in CALLING/CONNECTING/ACTIVE. Never touches the peer connection.
    endCall(callId) {
        if (!this._call || this._call.callId !== callId) {
            return;
        }
        const call = this._call;
        this._notifyPeerCallEnded(call);
        this._teardownCall(call, VoiceCallEndReason.LOCAL_HANGUP);
    }

    onIncomingCall(callback) {
        const subscription = this._eventBus.subscribe(INCOMING_CALL_EVENT, ({ peerIdentityId, callId }) => callback(peerIdentityId, callId));
        return () => subscription.unsubscribe();
    }

    // `info` is `{ peerIdentityId, reason }`; reason is set only for ENDED.
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
        // Shared collaborators are not disposed, and an in-progress call is not ended:
        // callers should call endCall() first.
        if (this._call) {
            this._unwireCall(this._call);
        }
    }

    // ---- incoming wire handling -------------------------------------

    // Every call signal must name this device's identity and the sending
    // connection's proven identity, never just what the payload claims. This
    // blocks forged senders for every signal type.
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
                return this._handleAccept(payload, remoteIdentity, meta);
            case VoiceCallSignalType.REJECT:
                return this._handleRejectOrBusy(payload, remoteIdentity, VoiceCallEndReason.REJECTED, meta);
            case VoiceCallSignalType.BUSY:
                return this._handleRejectOrBusy(payload, remoteIdentity, VoiceCallEndReason.BUSY, meta);
            case VoiceCallSignalType.END:
                return this._handleEnd(payload, remoteIdentity);
            default:
                return;
        }
    }

    _handleInvite(payload, meta, remoteIdentity, myIdentityId) {
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (this._isBlocked(social.identityId) || this._friends.getState(social.identityId) !== FriendshipState.FRIEND) {
            // Silently ignored, so the reason is not revealed.
            return;
        }
        if (this._call) {
            // A retransmitted INVITE for the current call is ignored.
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

    _handleAccept(payload, remoteIdentity, meta) {
        // Resolved fresh on every message, so a device revoked mid-ring no longer
        // matches and its ACCEPT is ignored.
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || !this._call.isCaller || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        const call = this._call;
        if (call.connectedPeer) {
            // A losing candidate in the first-accept race gets an explicit cancellation
            // so it does not keep ringing.
            if (call.remoteConnectionIdentityId !== remoteIdentity.identityId) {
                this._sendEndTo(call, meta.connectedPeer, remoteIdentity.identityId);
                return;
            }
            if (call.state !== VoiceSessionState.CALLING) {
                return;
            }
        } else {
            if (call.state !== VoiceSessionState.CALLING || !call.candidates || !call.candidates.has(meta.connectedPeer.connectionId)) {
                return;
            }
            this._lockCallToCandidate(call, meta.connectedPeer, remoteIdentity.identityId);
        }
        this._setCallState(call, VoiceSessionState.CONNECTING);
        // `call` is captured: by the time this settles, `this._call` may be a different
        // call.
        this._beginMediaNegotiation(call).catch((e) => {
            this._notifyPeerCallEnded(call);
            this._teardownCall(call, e && e.voiceReason ? e.voiceReason : VoiceCallEndReason.NEGOTIATION_FAILED);
        });
    }

    _handleRejectOrBusy(payload, remoteIdentity, reason, meta) {
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        const call = this._call;
        if (call.state !== VoiceSessionState.CALLING) {
            return;
        }
        if (call.connectedPeer) {
            this._teardownCall(call, reason);
            return;
        }
        // While fanning out, one device's reply does not speak for the others, except
        // BUSY.
        if (!call.candidates || !call.candidates.has(meta.connectedPeer.connectionId)) {
            return;
        }
        this._removeCandidate(call, meta.connectedPeer);
        if (reason === VoiceCallEndReason.BUSY) {
            this._cancelRemainingCandidates(call);
            this._teardownCall(call, VoiceCallEndReason.BUSY);
            return;
        }
        if (call.candidates.size === 0) {
            this._teardownCall(call, VoiceCallEndReason.REJECTED);
        }
    }

    _handleEnd(payload, remoteIdentity) {
        const social = this._resolveSocialIdentityForRemote(remoteIdentity);
        if (!this._call || this._call.callId !== payload.callId || this._call.peerIdentityId !== social.identityId) {
            return;
        }
        this._teardownCall(this._call, VoiceCallEndReason.REMOTE_HANGUP);
    }

    // A smaller boundary: the callId must match the current call on this same
    // connection; anything else is dropped.
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

    // Runs on both sides after ACCEPT. The local track is attached first, so the
    // answerer's track is ready before the offer arrives and one offer/answer
    // round trip gives two-way audio. Failures are tagged `.voiceReason`:
    // MEDIA_FAILED if the local track never came, NEGOTIATION_FAILED after that.
    async _beginMediaNegotiation(call) {
        let track;
        try {
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

    // ---- device switching -----------------------------------------------

    // Acquires the new track before touching the call; if that fails the old
    // track stays attached.
    async _switchInputDevice(call, deviceId) {
        const newTrack = await this._audio.getLocalAudioTrack(deviceId);
        // Keeps the current mute state: a device switch is never an unmute.
        newTrack.enabled = call.localTrack ? call.localTrack.enabled : true;
        try {
            await call.connectedPeer.connection.replaceAudioTrack(newTrack);
        } catch (e) {
            // Release the unused new track rather than leaking it.
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

    // Catches the platform's "track died" signal. Deliberate releases unwire this
    // first.
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

    // Compared against call.localTrack, so a late `ended` from an already replaced
    // track never triggers a second fallback.
    async _handleLocalTrackEnded(call, endedTrack) {
        if (this._call !== call || call.localTrack !== endedTrack) {
            return;
        }
        try {
            await this._switchInputDevice(call, null);
        } catch {
            this._eventBus.publish(MICROPHONE_UNAVAILABLE_EVENT, { callId: call.callId, peerIdentityId: call.peerIdentityId });
        }
    }

    // ---- social-authorization reconciliation ---------------------------

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

    // Best-effort END to every connection the call touched (the locked one, or all
    // still-ringing candidates). Skipped for connections no longer authenticated.
    _notifyPeerCallEnded(call) {
        if (call.connectedPeer) {
            this._sendEndTo(call, call.connectedPeer, call.remoteConnectionIdentityId);
        }
        if (call.candidates) {
            for (const entry of call.candidates.values()) {
                this._sendEndTo(call, entry.connectedPeer, entry.connectedPeer.remoteIdentity.identityId);
            }
        }
    }

    _sendEndTo(call, connectedPeer, remoteRawIdentityId) {
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            return;
        }
        try {
            const myIdentityId = this._identityProvider.getSigningIdentity().id;
            const callerIdentity = call.isCaller ? myIdentityId : remoteRawIdentityId;
            const calleeIdentity = call.isCaller ? remoteRawIdentityId : myIdentityId;
            this._bus.send(connectedPeer, this._callProtocol, toVoiceCallSignal({
                callId: call.callId, type: VoiceCallSignalType.END, callerIdentity, calleeIdentity
            }));
        } catch {
        }
    }

    // ---- ringing timeout ------------------------------------------------

    // Armed on entering CALLING or RINGING, cleared on leaving them.
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
        this._notifyPeerCallEnded(call);
        this._teardownCall(call, VoiceCallEndReason.TIMEOUT);
    }

    // ---- call record lifecycle ----------------------------------------

    // A call is either locked to one `connectedPeer` from the start, or fanning out
    // over `candidateConnectedPeers`; never both.
    _createCallRecord({ callId, peerIdentityId, remoteConnectionIdentityId = null, connectedPeer = null, candidateConnectedPeers = null, state, isCaller }) {
        const call = {
            callId, peerIdentityId, remoteConnectionIdentityId, connectedPeer, state, isCaller,
            localTrack: null, remoteTrack: null, remoteStream: null,
            unsubscribePeerState: null, unsubscribeRemoteTrack: null,
            candidates: null,
            ringingTimer: null,
            inputDeviceId: null, localTrackEndedTrack: null, localTrackEndedHandler: null
        };
        if (state === VoiceSessionState.CALLING || state === VoiceSessionState.RINGING) {
            this._armRingingTimeout(call);
        }
        if (connectedPeer) {
            this._wireLockedConnection(call, connectedPeer);
        } else if (candidateConnectedPeers) {
            call.candidates = new Map();
            for (const candidate of candidateConnectedPeers) {
                this._addCandidate(call, candidate);
            }
        }
        this._publishCallState(call);
        return call;
    }

    _wireLockedConnection(call, connectedPeer) {
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
    }

    // ---- identity-targeted fan-out -------------------------------------

    _liveVoiceCandidates(identityId) {
        return findLiveConnectedPeers(this._registry, this._resolveSocialIdentity, identityId)
            .filter((peer) => this.supportsVoice(peer));
    }

    // A candidate that disconnects before answering is removed; the call ends only
    // when no candidates remain.
    _addCandidate(call, connectedPeer) {
        const unsubscribeStateChange = connectedPeer.onStateChange((lifecycleState) => {
            if (lifecycleState !== PeerLifecycleState.AUTHENTICATED) {
                this._handleCandidateDisconnected(call, connectedPeer);
            }
        });
        call.candidates.set(connectedPeer.connectionId, { connectedPeer, unsubscribeStateChange });
    }

    _removeCandidate(call, connectedPeer) {
        const entry = call.candidates.get(connectedPeer.connectionId);
        if (!entry) {
            return;
        }
        if (entry.unsubscribeStateChange) {
            entry.unsubscribeStateChange();
        }
        call.candidates.delete(connectedPeer.connectionId);
    }

    _cancelRemainingCandidates(call, exceptConnectionId = null) {
        for (const entry of Array.from(call.candidates.values())) {
            if (entry.connectedPeer.connectionId === exceptConnectionId) {
                continue;
            }
            this._sendEndTo(call, entry.connectedPeer, entry.connectedPeer.remoteIdentity.identityId);
            this._removeCandidate(call, entry.connectedPeer);
        }
    }

    _handleCandidateDisconnected(call, connectedPeer) {
        if (this._call !== call || call.connectedPeer || !call.candidates || !call.candidates.has(connectedPeer.connectionId)) {
            return;
        }
        this._removeCandidate(call, connectedPeer);
        if (call.candidates.size === 0) {
            this._teardownCall(call, VoiceCallEndReason.PEER_DISCONNECTED);
        }
    }

    _lockCallToCandidate(call, connectedPeer, remoteConnectionIdentityId) {
        this._cancelRemainingCandidates(call, connectedPeer.connectionId);
        this._removeCandidate(call, connectedPeer);
        call.connectedPeer = connectedPeer;
        call.remoteConnectionIdentityId = remoteConnectionIdentityId;
        this._wireLockedConnection(call, connectedPeer);
    }

    _setCallState(call, state) {
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
        // Unwire before releasing: this track's `ended` must not look like device loss.
        this._unwireLocalTrackEnded(call);
        if (call.unsubscribePeerState) call.unsubscribePeerState();
        if (call.unsubscribeRemoteTrack) call.unsubscribeRemoteTrack();
        if (call.candidates) {
            for (const entry of call.candidates.values()) {
                if (entry.unsubscribeStateChange) entry.unsubscribeStateChange();
            }
            call.candidates.clear();
        }
        if (call.connectedPeer && typeof call.connectedPeer.connection.removeAudioTrack === 'function') {
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

    // The resolver only reads `.remoteIdentity`, so wrapping a bare identity is
    // valid input.
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

VoiceUseCase.CALL_PROTOCOL = 'forkbuild:voice-call';
VoiceUseCase.MEDIA_PROTOCOL = 'forkbuild:voice-media';
