import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';
import { toDocumentOperationEnvelope } from '../core/DocumentOperationEnvelope.js';
import { CausalGapStatus } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationProvenance } from '../core/DocumentOperationProvenance.js';
import {
    DocumentOperationRecoveryMessageKind,
    toDocumentOperationRecoveryRequestMessage,
    toDocumentOperationRecoveryResponseMessage,
    isValidDocumentOperationRecoveryMessage
} from '../core/DocumentOperationRecoveryProtocol.js';

const OPERATION_RECEIVED_EVENT = 'DocumentOperationRecoveryOperationReceived';

// 0.9.230 — Causal Gap Recovery Request Boundary.
//
// docs/Roadmap.md, 0.9.229's own "Recommendation" named the seam this
// class closes precisely: "a replica can know that it is missing an
// operation, but currently has no way to ask for it." 0.9.228's detector
// and 0.9.229's observation wiring made a causal gap a real, production-
// visible fact — `DocumentOperationCausalGapObservationUseCase#
// onGapObserved()` already fires `{ operationId, documentId,
// causalPredecessors, causalGap }` for every accepted operation, GAP or
// NO_GAP. Nothing before this milestone ever reacted to a GAP result.
// This class is that reaction, and ONLY that reaction:
//
//   onGapObserved() -> GAP -> REQUEST missing operationIds -> peer
//   peer -> RESPONSE (real envelopes) -> verifyEnvelope() -> "known now"
//
// It never buffers, reorders, retries, or automatically applies anything
// — see "Do not automatically apply" below, and this class's own
// "Deliberately excluded" list.
//
// SENDING a REQUEST. `attachToGapObservation()` subscribes to a
// `DocumentOperationCausalGapObservationUseCase`'s own `onGapObserved()`
// feed — never a change to that class, a second, independent subscriber
// on an already-published feed, the same discipline
// `RemoteDocumentOperationApplicationUseCase#attachToPropagation()` and
// `DocumentOperationCausalGapObservationUseCase#attachToPropagation()`
// themselves already apply to `DocumentCommandPropagationUseCase`'s own
// feed. For every GAP result, this class requests EXACTLY
// `causalGap.missingCausalPredecessorIds` — never "send me whatever I'm
// missing" — from every currently AUTHENTICATED connected peer. A
// specific peer cannot be targeted here: the gap-observation descriptor
// deliberately carries no source-connection information (see that
// class's own header, "the result descriptor is deliberately small and
// flat") — broadcasting is the correct, safe default, mirroring
// `DocumentCommandPropagationUseCase#broadcastCommand()`'s own "every
// currently AUTHENTICATED connected peer" behavior for outgoing
// operations. No retry, no backoff: one REQUEST per GAP observation,
// exactly once, because `onGapObserved()` itself only ever fires once per
// accepted delivery (ReplayGuard's own job, unchanged).
//
// ANSWERING a REQUEST. A REQUEST is answered only for operationIds THIS
// replica itself AUTHORED — see "Why only self-authored operations are
// ever served" below for why serving anything else would be pointless.
// `attachCommandHistory()` records every operation this replica executes
// locally (mirroring `DocumentCommandPropagationUseCase#
// attachCommandHistory()`'s own causal-predecessor computation exactly —
// see that method's own header — a second, independent subscriber to the
// SAME `CommandHistoryEvent.COMMAND_EXECUTED` event, never a change to
// that class) into a small in-memory map, keyed by (documentId,
// operationId). Before ever replying, the REQUESTING peer's own
// authorization is re-checked via `DocumentCommandPropagationUseCase#
// resolveEditAccessFor()` — the SAME Document EDIT access an operation
// FROM that peer would itself require — so a recovery request can never
// become a way to read operation contents out of a document the
// requester couldn't otherwise submit edits to. If nothing requested is
// known, or the requester isn't authorized, this replica sends no
// RESPONSE at all — see `core/DocumentOperationRecoveryProtocol.js`'s own
// header on why there is no NOT_FOUND kind.
//
// Why only self-authored operations are ever served. This codebase's
// operation trust model is CONNECTION-level, not message-level: an
// operation is authentic because the connection that carried it proved
// (during peer authentication) that it belongs to `authorIdentityId` —
// see `DocumentCommandPropagationUseCase#_verify()`'s own step 2. There
// is no independent, per-operation cryptographic signature that would let
// a THIRD peer safely relay someone else's already-authored operation.
// Concretely: if Bob relayed an operation Alice authored, Carol's own
// `verifyEnvelope()` call would compare the envelope's `authorIdentityId`
// (Alice) against Carol's OWN connection identity for Bob — a mismatch,
// correctly rejected as IDENTITY_MISMATCH. So this milestone scopes
// recovery to exactly what this trust model can make safe: recovering an
// operation directly from a still-connected peer authenticated AS that
// operation's own author. Multi-hop relay/gossip recovery would need this
// codebase to add real per-operation signatures first — a different,
// future milestone, not a silent weakening of the existing boundary.
//
// Do not automatically apply. The single most important thing this class
// does NOT do: a successfully recovered operation is never handed to
// `RemoteDocumentOperationApplicationUseCase`. `onOperationReceived()`
// below fires the IDENTICAL shape `DocumentCommandPropagationUseCase#
// onOperationReceived()` fires — `(documentId, command, authorIdentityId,
// causalPredecessors)` — specifically so a
// `DocumentOperationCausalGapObservationUseCase` can `attachToPropagation()`
// to THIS class exactly as it already does to real propagation, letting a
// recovered operation become KNOWN to the causal graph (so a future
// operation naming it as a predecessor sees NO_GAP) without ever being
// applied. `application/EditorSession.js` wires this class's own feed
// ONLY to gap-observation, never to
// `RemoteDocumentOperationApplicationUseCase#attachToPropagation()`. What
// happens to a recovered operation beyond "this replica now knows it
// exists" is exactly the open question 0.9.229's own "Recommendation"
// left for a later milestone — this one stops at making the evidence
// available.
//
// 0.9.231 — RECOVERED provenance, named explicitly. `onOperationReceived()`
// now fires a fifth argument, `provenance`, always
// `DocumentOperationProvenance.RECOVERED` (`core/DocumentOperationProvenance.js`)
// — additive only, every pre-0.9.231 subscriber (reading just the first
// four arguments) is unaffected. This exists to keep a subtle confusion
// from ever creeping in: `DocumentOperationCausalGraph#isKnown()` becomes
// true for a recovered operation the MOMENT `DocumentOperationCausalGapObservationUseCase`
// observes it (via its own `attachToPropagation()`, wired to THIS class's
// feed) — but that is causal KNOWLEDGE, never document EXECUTION.
// `application/CommandHistory.js#getExecutedCommands()` remains the only
// source of truth for what actually changed this replica's own document
// state, and this class never adds an entry to it. See
// `core/DocumentOperationProvenance.js`'s own header for the full
// KNOWN/EXECUTED/RECOVERED vocabulary, and
// `tests/DocumentOperationProvenance.test.js` for the observable-behavior
// proof that recovering an operation never mutates document state, never
// reorders already-applied history, and remains a fully distinct act from
// applying it.
//
// THE SECURITY BOUNDARY — recovery must never become an alternative trust
// path. A RESPONSE's envelopes are re-verified through
// `DocumentCommandPropagationUseCase#verifyEnvelope()` — the EXACT SAME
// five-step chain (identity, social resolution, Document EDIT access,
// operation/ReplayGuard verification) an ordinarily-arrived operation
// already goes through, reused rather than duplicated so this class can
// never quietly drift into a weaker check. A malformed envelope, one from
// an unauthenticated/unauthorized connection, or one whose claimed author
// doesn't match the connection it arrived over, is silently dropped —
// never trusted merely because it arrived labeled RESPONSE.
//
// FAILURE ISOLATION. `_handleIncoming()` and the gap-observation callback
// are both wrapped in try/catch and never rethrow — a broken/oversized/
// malicious recovery message, or a peer that disconnects mid-exchange,
// must never become an operation rejection, an Editor failure, a
// CommandHistory failure, or a failure of the unrelated
// `DocumentCommandPropagationUseCase` network channel it shares a peer
// connection with.
//
// Deliberately excluded from this milestone, same lineage as every prior
// one: no operation buffering, no delayed/automatic application, no
// causal reordering, no retry/backoff, no offline queue, no persistence
// of pending requests, no CRDT, no OT, no conflict resolution, no
// synchronized undo, no convergence guarantee, and no second
// deduplication mechanism layered next to ReplayGuard.
export class DocumentOperationRecoveryUseCase {
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        documentCommandPropagation,
        identityProvider,
        protocol = DocumentOperationRecoveryUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('DocumentOperationRecoveryUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('DocumentOperationRecoveryUseCase: a ConnectedPeerRegistry is required');
        }
        if (!documentCommandPropagation || typeof documentCommandPropagation.verifyEnvelope !== 'function' || typeof documentCommandPropagation.resolveEditAccessFor !== 'function') {
            throw new Error('DocumentOperationRecoveryUseCase: a DocumentCommandPropagationUseCase is required');
        }
        if (!identityProvider) {
            throw new Error('DocumentOperationRecoveryUseCase: an IdentityProvider is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._propagation = documentCommandPropagation;
        this._identityProvider = identityProvider;
        this._protocol = protocol;
        this._eventBus = new EventBus();
        // Self-authored operations only — keyed `${documentId}::${operationId}`.
        // See this file's own header, "Why only self-authored operations
        // are ever served."
        this._known = new Map();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Records this replica's own locally-authored operations so a later
    // recovery REQUEST for one of them can be answered. Mirrors
    // `DocumentCommandPropagationUseCase#attachCommandHistory()`'s own
    // causal-predecessor computation exactly (see that method's own
    // header for the algorithm) — a second, independent subscriber to the
    // SAME `CommandHistoryEvent.COMMAND_EXECUTED` event, never a change
    // to that method. Returns an unsubscribe function.
    attachCommandHistory({ documentId, commandHistory }) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationRecoveryUseCase.attachCommandHistory(): documentId is required');
        }
        if (!commandHistory || !commandHistory.eventBus || typeof commandHistory.eventBus.subscribe !== 'function') {
            throw new Error('DocumentOperationRecoveryUseCase.attachCommandHistory(): a real CommandHistory is required');
        }
        const subscription = commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
            const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
            if (!authorIdentityId) {
                return;
            }
            const executed = commandHistory.getExecutedCommands();
            const precedingCommand = executed.length >= 2 ? executed[executed.length - 2] : null;
            const causalPredecessors = precedingCommand ? [precedingCommand.id] : [];
            let envelope;
            try {
                envelope = toDocumentOperationEnvelope({
                    operationId: command.id,
                    documentId,
                    authorIdentityId,
                    command: command.toJSON(),
                    causalPredecessors
                });
            } catch {
                return;
            }
            this._known.set(`${documentId}::${command.id}`, envelope);
        });
        return () => subscription.unsubscribe();
    }

    // The trigger: subscribes to a
    // `DocumentOperationCausalGapObservationUseCase`'s own
    // `onGapObserved()` feed and, for every GAP result, requests exactly
    // its named missing predecessors — see this file's own header.
    // Deliberately swallows any error raised while requesting, the same
    // failure-isolation discipline every sibling `attachToPropagation()`
    // in this lineage already applies. Returns an unsubscribe function.
    attachToGapObservation(gapObservation) {
        if (!gapObservation || typeof gapObservation.onGapObserved !== 'function') {
            throw new Error('DocumentOperationRecoveryUseCase.attachToGapObservation(): a DocumentOperationCausalGapObservationUseCase is required');
        }
        return gapObservation.onGapObserved((descriptor) => {
            try {
                this._requestMissing(descriptor);
            } catch {
                // See this file's own header, "Failure isolation."
            }
        });
    }

    // Fires `(documentId, command, authorIdentityId, causalPredecessors,
    // provenance)` — the first four exactly the IDENTICAL shape
    // `DocumentCommandPropagationUseCase#onOperationReceived()` fires, on
    // purpose: see this file's own header, "Do not automatically apply,"
    // for why. `provenance` is the one addition, 0.9.231
    // (`core/DocumentOperationProvenance.js`) — always
    // `DocumentOperationProvenance.RECOVERED`, since every operation this
    // feed ever fires for arrived through recovery, never execution. A
    // caller that only reads the first four arguments (every subscriber
    // wired before 0.9.231) is unaffected — the fifth argument is purely
    // additive. Returns an unsubscribe function, mirroring every other
    // subscription method in this codebase.
    onOperationReceived(callback) {
        const subscription = this._eventBus.subscribe(OPERATION_RECEIVED_EVENT, ({ documentId, command, authorIdentityId, causalPredecessors, provenance }) => callback(documentId, command, authorIdentityId, causalPredecessors, provenance));
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, documentCommandPropagation, or
        // identityProvider — all shared, app-wide collaborators this
        // class never owns.
    }

    _authenticatedPeers() {
        return this._registry.list().filter((peer) => peer && typeof peer.getLifecycleState === 'function'
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
    }

    _requestMissing({ documentId, causalGap }) {
        if (!causalGap || causalGap.status !== CausalGapStatus.GAP || !causalGap.missingCausalPredecessorIds.length) {
            return;
        }
        const message = toDocumentOperationRecoveryRequestMessage({ documentId, operationIds: causalGap.missingCausalPredecessorIds });
        for (const peer of this._authenticatedPeers()) {
            try {
                this._bus.send(peer, this._protocol, message);
            } catch {
                // The peer may have disconnected between GAP observation
                // and this send — never let one peer's failure stop the
                // request from reaching the others.
            }
        }
    }

    _handleIncoming(payload, meta) {
        try {
            if (!isValidDocumentOperationRecoveryMessage(payload)) {
                return;
            }
            if (payload.kind === DocumentOperationRecoveryMessageKind.REQUEST) {
                this._handleRequest(payload, meta);
                return;
            }
            this._handleResponse(payload, meta);
        } catch {
            // See this file's own header, "Failure isolation."
        }
    }

    // Answers a REQUEST only for operationIds this replica itself
    // authored (`_known`) AND only when the requesting connection already
    // holds Document EDIT access — both this class's own authorization
    // boundary, independent of whatever the requester itself checked.
    // Silently sends nothing if the requester isn't authorized or if none
    // of the requested operationIds are known — see
    // `core/DocumentOperationRecoveryProtocol.js`'s own header on why
    // "not found" is never a message this protocol sends.
    _handleRequest({ documentId, operationIds }, meta) {
        const connectedPeer = meta && meta.connectedPeer;
        if (this._propagation.resolveEditAccessFor(connectedPeer, documentId) !== WorldAccessLevel.EDIT) {
            return;
        }
        const operations = [];
        for (const operationId of operationIds) {
            const envelope = this._known.get(`${documentId}::${operationId}`);
            if (envelope) {
                operations.push(envelope);
            }
        }
        if (!operations.length) {
            return;
        }
        let message;
        try {
            message = toDocumentOperationRecoveryResponseMessage({ documentId, operations });
        } catch {
            return;
        }
        try {
            this._bus.send(connectedPeer, this._protocol, message);
        } catch {
            // The requesting peer may have disconnected between REQUEST
            // and RESPONSE — never crash the bus over a race like that.
        }
    }

    // The ingestion boundary for a RESPONSE, and where this class's
    // central security rule is structurally enforced — see this file's
    // own header, "THE SECURITY BOUNDARY." Every envelope is verified
    // independently; one rejected envelope in a batch never affects the
    // others. Never applies, never buffers — only verifies, then
    // publishes `onOperationReceived()` for whichever caller (gap
    // observation) wants to know this replica now has it.
    _handleResponse({ documentId, operations }, meta) {
        const connectedPeer = meta && meta.connectedPeer;
        for (const envelope of operations) {
            if (envelope.documentId !== documentId) {
                continue;
            }
            const result = this._propagation.verifyEnvelope(envelope, connectedPeer);
            if (!result.accepted) {
                continue;
            }
            this._eventBus.publish(OPERATION_RECEIVED_EVENT, {
                documentId: result.documentId,
                command: result.command,
                authorIdentityId: result.authorIdentityId,
                causalPredecessors: result.causalPredecessors,
                provenance: DocumentOperationProvenance.RECOVERED
            });
        }
    }
}

DocumentOperationRecoveryUseCase.DEFAULT_PROTOCOL = 'forkbuild:document-operation-recovery';
