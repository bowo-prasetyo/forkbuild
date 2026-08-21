import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { ReplayGuard } from '../replication/ReplayGuard.js';
import { WorldAuthorizationService } from './WorldAuthorizationService.js';
import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import {
    toWorldOperationEnvelope,
    isValidWorldOperationEnvelope
} from '../core/WorldOperationEnvelope.js';

const OPERATION_APPLIED_EVENT = 'WorldOperationApplied';
const OPERATION_REJECTED_EVENT = 'WorldOperationRejected';

export const WorldOperationRejectionReason = Object.freeze({
    INVALID_ENVELOPE: 'INVALID_ENVELOPE',
    IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
    UNKNOWN_WORLD: 'UNKNOWN_WORLD',
    BLOCKED: 'BLOCKED',
    NOT_AUTHORIZED: 'NOT_AUTHORIZED',
    WORLD_MISMATCH: 'WORLD_MISMATCH',
    UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
    DUPLICATE: 'DUPLICATE',
    EXECUTION_FAILED: 'EXECUTION_FAILED'
});

// 0.2.96 — Shared World Command Propagation.
//
// 0.2.95 answered "who may edit this World." This class answers the next
// question the design conversation asked, deliberately narrower than it
// sounds: "how does an authorized edit made on ONE replica become the
// SAME durable World mutation on another AUTHORIZED replica" — never
// "how do two replicas converge on a concurrently-edited World" (that is
// 0.2.97's question, explicitly out of scope here — see this file's own
// header on single-authoritative-operation propagation).
//
// The unit of propagation is never a World/Document snapshot — it is one
// already-executed `application/commands/Command.js` instance, serialized
// exactly the way `application/CommandHistory.js` already persists it
// (`command.toJSON()`) and reconstructed on the far side through the SAME
// `application/commands/CommandRegistry.js` every local undo/redo/replay
// path already uses. See core/WorldOperationEnvelope.js's own header for
// the wire shape, and docs/Roadmap.md, 0.2.96, "do not synchronize the
// whole document" — the command architecture already IS the mutation
// kernel; this class only ever gives it a network boundary.
//
// The security chain, re-derived fresh on EVERY incoming envelope, never
// cached, mirrors application/ChatUseCase.js#_handleIncoming()'s own
// ordered gate exactly, one rung further:
//
//   1. authenticated connection      — peer/PeerMessageBus.js itself
//                                      (AUTHENTICATED before this class
//                                      is ever invoked)
//   2. the claimed authorIdentityId  — compared against
//      really is this connection      `meta.connectedPeer.remoteIdentity`,
//                                      the RAW proven key — never merely
//                                      what the payload claims (defeats a
//                                      forged-sender attack the identical
//                                      way ChatUseCase's own step 2 does)
//   3. resolve SOCIAL identity       — application/
//                                      DeviceAuthorizationPropagationUseCase.js
//                                      #resolveConnectionIdentity() — DIRECT
//                                      or DEVICE, the SAME multi-device
//                                      resolution 0.2.95 already consumes
//   4. resolve World EDIT authority  — application/WorldAuthorizationService.js,
//                                      reused UNMODIFIED: a throwaway
//                                      instance configured with
//                                      `resolveSocialIdentity` returning
//                                      step 3's answer, asked about THIS
//                                      SPECIFIC worldDocumentId's Document
//                                      — never "authorized somewhere,"
//                                      always "authorized for THIS World"
//                                      (see docs/Roadmap.md, 0.2.96,
//                                      "Alice can edit World A / Alice
//                                      cannot therefore edit World B")
//   5. verify the operation          — worldId cross-check (the SERIALIZED
//                                      command's own `worldId`, when it
//                                      declares one, must agree with the
//                                      envelope's `worldDocumentId` —
//                                      nothing here trusts either field
//                                      alone) + CommandRegistry
//                                      deserialization + ReplayGuard
//                                      idempotency (operationId, scoped
//                                      per worldDocumentId — a duplicate
//                                      is recognized and produces NO
//                                      second mutation)
//   6. apply the operation           — `command.execute({ world:
//                                      document.world })`, called
//                                      DIRECTLY — never through the
//                                      receiver's own `application/
//                                      CommandHistory.js`. A remote
//                                      operation is durable World state
//                                      the instant it is applied, but it
//                                      is deliberately NEVER pushed onto
//                                      this replica's own undo/redo stack
//                                      — see docs/Roadmap.md, 0.2.96,
//                                      "Bob receives Alice's edit and
//                                      presses Undo" — Bob's Undo must
//                                      only ever unwind Bob's OWN commands.
//
// Revocation isolation falls out for free, exactly the way 0.2.83's own
// sibling-eligibility check already established: nothing here ever asks
// "has this device been revoked" — resolveConnectionIdentity() itself
// stops resolving a revoked device to its former parent's identityId the
// instant the revocation is learned (through the completely unmodified
// 0.2.78/0.2.82 gossip path), so step 3 above simply starts returning a
// different, unauthorized identity — step 4 then denies it the ordinary
// way, with zero code in this class aware a revocation happened at all.
//
// Outgoing broadcasts carry no authorization decision of their own —
// see this file's own header, "the receiver decides, never the sender."
// broadcastCommand() is only ever called for a command THIS replica just
// executed through its own already-authorized local mutation chokepoint
// (application/SpatialEditingService.js, gated by 0.2.95's
// canEditDocument) — sending it onward is a courtesy to every
// AUTHENTICATED connected peer, not a claim of authority. What a
// connected peer accepts is entirely its own decision, made fresh by the
// SAME six-step chain above, symmetric on every replica.
export class WorldCommandPropagationUseCase {
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        deviceAuthorization,
        identityProvider,
        commandRegistry,
        resolveWorldDocument,
        persistWorldDocument = null,
        isBlocked = null,
        replayGuard = new ReplayGuard(),
        protocol = WorldCommandPropagationUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('WorldCommandPropagationUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('WorldCommandPropagationUseCase: a ConnectedPeerRegistry is required');
        }
        if (!deviceAuthorization || typeof deviceAuthorization.resolveConnectionIdentity !== 'function') {
            throw new Error('WorldCommandPropagationUseCase: a DeviceAuthorizationPropagationUseCase is required');
        }
        if (!identityProvider) {
            throw new Error('WorldCommandPropagationUseCase: an IdentityProvider is required');
        }
        if (!commandRegistry || typeof commandRegistry.fromJSON !== 'function') {
            throw new Error('WorldCommandPropagationUseCase: a CommandRegistry is required');
        }
        if (typeof resolveWorldDocument !== 'function') {
            throw new Error('WorldCommandPropagationUseCase: resolveWorldDocument(worldDocumentId) is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._deviceAuth = deviceAuthorization;
        this._identityProvider = identityProvider;
        this._commandRegistry = commandRegistry;
        this._resolveWorldDocument = resolveWorldDocument;
        this._persistWorldDocument = typeof persistWorldDocument === 'function' ? persistWorldDocument : null;
        this._isBlocked = typeof isBlocked === 'function' ? isBlocked : null;
        this._replayGuard = replayGuard;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        // Attaching is idempotent (peer/PeerMessageBus.js#attach()'s own
        // contract) — safe to call here even though every OTHER protocol
        // use case sharing this same bus (DeviceAuthorizationPropagationUseCase,
        // ChatUseCase, DeviceConversationSyncUseCase, …) already attaches
        // the identical peer independently. No single class owns "who
        // attaches peers to the bus."
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

    // Broadcasts one already-locally-executed command to every currently
    // AUTHENTICATED connected peer. `command` is a real `Command`
    // instance (never pre-serialized) — this method calls `toJSON()`
    // itself, exactly once, so every peer receives an identical envelope.
    // Deliberately does not gate on any RECIPIENT's authorization — see
    // this file's own header, "the receiver decides, never the sender."
    // Returns the operationId (== command.id) it sent.
    broadcastCommand({ worldDocumentId, command }) {
        if (!worldDocumentId || typeof worldDocumentId !== 'string') {
            throw new Error('WorldCommandPropagationUseCase.broadcastCommand(): worldDocumentId is required');
        }
        if (!command || typeof command.toJSON !== 'function' || !command.id) {
            throw new Error('WorldCommandPropagationUseCase.broadcastCommand(): a real Command instance is required');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('WorldCommandPropagationUseCase.broadcastCommand(): no signing identity to author this operation');
        }
        const envelope = toWorldOperationEnvelope({
            operationId: command.id,
            worldDocumentId,
            authorIdentityId,
            command: command.toJSON()
        });
        for (const peer of this._authenticatedPeers()) {
            this._bus.send(peer, this._protocol, envelope);
        }
        return envelope.operationId;
    }

    // Returns an unsubscribe function. Fires `(worldDocumentId, command,
    // authorIdentityId)` — the RESOLVED social identityId (step 3/4
    // above), never the raw device key — for every remote operation this
    // replica newly applied. Never fires for a duplicate.
    onOperationApplied(callback) {
        const subscription = this._eventBus.subscribe(OPERATION_APPLIED_EVENT, ({ worldDocumentId, command, authorIdentityId }) => callback(worldDocumentId, command, authorIdentityId));
        return () => subscription.unsubscribe();
    }

    // Returns an unsubscribe function. Fires `(reason, envelope)` for
    // every incoming envelope this replica refused to apply — malformed,
    // spoofed, unauthorized, targeting an unknown World, or a recognized
    // duplicate. See WorldOperationRejectionReason above.
    onOperationRejected(callback) {
        const subscription = this._eventBus.subscribe(OPERATION_REJECTED_EVENT, ({ reason, envelope }) => callback(reason, envelope));
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
        // connectedPeerRegistry, deviceAuthorization, identityProvider,
        // commandRegistry, or replayGuard — all shared, app-wide
        // collaborators this class never owns.
    }

    _authenticatedPeers() {
        return this._registry.list().filter((peer) => peer && typeof peer.getLifecycleState === 'function'
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
    }

    _reject(reason, envelope) {
        this._eventBus.publish(OPERATION_REJECTED_EVENT, { reason, envelope });
    }

    // The receiving-side trust boundary — see this file's own header for
    // the full ordered chain. Every step re-derived fresh; nothing about
    // a prior envelope from the same connection is ever remembered or
    // assumed here.
    _handleIncoming(payload, meta) {
        if (!isValidWorldOperationEnvelope(payload)) {
            this._reject(WorldOperationRejectionReason.INVALID_ENVELOPE, payload);
            return;
        }
        const connectedPeer = meta && meta.connectedPeer;
        if (!connectedPeer || connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            this._reject(WorldOperationRejectionReason.IDENTITY_MISMATCH, payload);
            return;
        }
        // Step 2 — the claimed authorIdentityId must be exactly the raw
        // key THIS connection proved during authentication. "I am Alice"
        // in the payload is never, on its own, sufficient — see this
        // file's own header.
        if (payload.authorIdentityId !== connectedPeer.remoteIdentity.identityId) {
            this._reject(WorldOperationRejectionReason.IDENTITY_MISMATCH, payload);
            return;
        }
        // Step 3 — social identity, device-aware.
        const social = this._deviceAuth.resolveConnectionIdentity(connectedPeer);
        if (!social || !social.identityId) {
            this._reject(WorldOperationRejectionReason.IDENTITY_MISMATCH, payload);
            return;
        }
        // Step 4 — World EDIT authority, for THIS specific worldDocumentId.
        const document = this._resolveWorldDocument(payload.worldDocumentId);
        if (!document) {
            this._reject(WorldOperationRejectionReason.UNKNOWN_WORLD, payload);
            return;
        }
        const authorization = new WorldAuthorizationService({
            resolveSocialIdentity: () => social,
            isBlocked: this._isBlocked
        });
        const access = authorization.resolveAccess(document);
        if (access !== WorldAccessLevel.EDIT) {
            this._reject(
                access === WorldAccessLevel.NONE ? WorldOperationRejectionReason.BLOCKED : WorldOperationRejectionReason.NOT_AUTHORIZED,
                payload
            );
            return;
        }
        // Step 5 — verify the operation itself.
        if (typeof payload.command.worldId === 'string' && payload.command.worldId !== payload.worldDocumentId) {
            this._reject(WorldOperationRejectionReason.WORLD_MISMATCH, payload);
            return;
        }
        if (this._replayGuard.hasAccepted(payload.operationId, payload.worldDocumentId)) {
            this._reject(WorldOperationRejectionReason.DUPLICATE, payload);
            return;
        }
        let command;
        try {
            command = this._commandRegistry.fromJSON(payload.command);
        } catch {
            this._reject(WorldOperationRejectionReason.UNKNOWN_COMMAND, payload);
            return;
        }
        // Recorded BEFORE execute() — a retransmit of the SAME
        // operationId must never re-apply, even if execute() itself is
        // about to throw (a malformed-but-well-typed operation is not
        // silently eligible for endless retry).
        this._replayGuard.recordAccepted(payload.operationId, payload.worldDocumentId);
        // Step 6 — apply. Deliberately `command.execute()` directly,
        // never `commandHistory.execute()` — see this file's own header,
        // "never pushed onto this replica's own undo/redo stack."
        try {
            command.execute({ world: document.world });
        } catch {
            this._reject(WorldOperationRejectionReason.EXECUTION_FAILED, payload);
            return;
        }
        if (this._persistWorldDocument) {
            this._persistWorldDocument(payload.worldDocumentId, document);
        }
        this._eventBus.publish(OPERATION_APPLIED_EVENT, {
            worldDocumentId: payload.worldDocumentId,
            command,
            authorIdentityId: social.identityId
        });
    }
}

WorldCommandPropagationUseCase.DEFAULT_PROTOCOL = 'forkbuild:world-sync';
