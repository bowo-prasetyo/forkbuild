import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { ReplayGuard } from '../replication/ReplayGuard.js';
import { WorldAuthorizationService } from './WorldAuthorizationService.js';
import { WorldAccessLevel } from '../core/WorldAccessLevel.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';
import {
    toDocumentOperationEnvelope,
    isValidDocumentOperationEnvelope
} from '../core/DocumentOperationEnvelope.js';

const OPERATION_RECEIVED_EVENT = 'DocumentOperationReceived';
const OPERATION_REJECTED_EVENT = 'DocumentOperationRejected';

export const DocumentOperationRejectionReason = Object.freeze({
    INVALID_ENVELOPE: 'INVALID_ENVELOPE',
    IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
    UNKNOWN_DOCUMENT: 'UNKNOWN_DOCUMENT',
    BLOCKED: 'BLOCKED',
    NOT_AUTHORIZED: 'NOT_AUTHORIZED',
    DOCUMENT_MISMATCH: 'DOCUMENT_MISMATCH',
    UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
    DUPLICATE: 'DUPLICATE'
});

// 0.9.222 — Shared Document Edit Operation Boundary.
//
// docs/Roadmap.md, 0.9.221 Section C named "live multi-editor co-editing
// of one Document" as an evidenced-absent product seam — but re-auditing
// that claim against the actual codebase (rather than against its own
// text) found it only half true. `application/WorldCommandPropagationUseCase.js`
// (0.2.96-0.2.97), `application/WorldMembershipUseCase.js` (0.2.98), and
// their own UI (0.2.99/0.3.5) already give World View's own Documents
// full live propagation, ordering, conflict resolution, membership, and
// presence — real, shipped, wired into `application/CreateWorldViewUseCase.js`
// today. What is genuinely, verifiably absent — the thing 0.9.221's own
// citation of `application/SaveDocumentUseCase.js` was actually pointing
// at — is that the OTHER surface this codebase edits live, the Editor's
// own Structure/blueprint Documents (`ui/views/EditorView.js`,
// `application/EditorSession.js`), has NO propagation protocol at all:
// zero peer/collaboration imports anywhere in EditorView.js, and its only
// multi-party path is `application/ForkStructureUseCase.js` — fork, then
// diverge into a new Document lineage. This class closes THAT gap, never
// a re-implementation of the World-side answer, which already exists and
// is left completely untouched.
//
// Deliberately scoped to mirror 0.2.96's OWN original scope — the
// boundary, not the convergence — the same phased shape this codebase
// already took for World once:
//
//   0.2.96  Shared World Command Propagation   (boundary, no ordering)
//   0.2.97  Shared World Ordering & Conflict Resolution (added later)
//   0.2.98  Shared World Membership             (added later still)
//
//   0.9.222 Shared Document Edit Operation Boundary   <- THIS class
//   (a future milestone may add ordering/conflict resolution and/or a
//   membership-grant model for non-World documents the exact same way,
//   additively, never by reshaping this class's own contract)
//
// The security chain below is the SAME five-step gate
// WorldCommandPropagationUseCase already established, steps 1-5 (its own
// step 6 — order, then apply DIRECTLY against `document.world`, bypassing
// the receiver's own CommandHistory — is 0.2.97 territory, deliberately
// NOT ported here yet):
//
//   1. authenticated connection      — peer/PeerMessageBus.js itself
//   2. the claimed authorIdentityId  — compared against
//                                      meta.connectedPeer.remoteIdentity,
//                                      never merely what the payload claims
//   3. resolve SOCIAL identity       — application/
//                                      DeviceAuthorizationPropagationUseCase.js
//                                      #resolveConnectionIdentity(), the
//                                      SAME multi-device resolution World
//                                      already consumes
//   4. resolve Document EDIT access — application/WorldAuthorizationService.js,
//                                      reused UNMODIFIED — that class was
//                                      already Document-generic (see its
//                                      own header: "given who is looking
//                                      right now, what WorldAccessLevel do
//                                      they hold" for "exactly one
//                                      Document," never World-specific).
//                                      Called here with NO
//                                      `resolveWorldEditGrant` and no
//                                      scoping id — Editor documents have
//                                      no membership-grant model yet, so
//                                      this degrades to exactly what it
//                                      already means for a bare Document:
//                                      ownership (cryptographic, or
//                                      legacy-label) only. "Multiple
//                                      authorized editors" in THIS
//                                      milestone's own flagship therefore
//                                      means one owner identity's own
//                                      several AUTHORIZED DEVICES — the
//                                      identical "genuine multi-party"
//                                      case 0.2.96 itself proved before
//                                      0.2.98 later added a second,
//                                      independent identity via signed
//                                      membership grants.
//   5. verify the operation          — the SERIALIZED command's own
//                                      `worldId` (every Command in this
//                                      codebase's `application/commands/`
//                                      carries one, whether the Document
//                                      it targets is a World or a
//                                      Structure — see core/Document.js's
//                                      own header, a Document IS a World
//                                      plus metadata), when present, must
//                                      agree with the envelope's own
//                                      `documentId` + CommandRegistry
//                                      deserialization + ReplayGuard
//                                      idempotency (operationId, scoped
//                                      per documentId)
//
// What happens after acceptance is this milestone's own deliberate,
// named restraint, not an oversight: `onOperationReceived()` fires with
// the deserialized Command, and NOTHING here ever calls
// `command.execute()`. Receiving an authorized operation is observation,
// never automatic application — the receiving surface (a future
// milestone, or an interactive caller) decides whether/how to apply it.
// This is the opposite default from WorldCommandPropagationUseCase's own
// step 6, deliberately: that class earned the right to apply directly
// against `document.world` only after 0.2.97 built real ordering/conflict
// resolution to make concurrent application safe. Nothing here has that
// yet, so nothing here applies anything — see this file's own "Deliberately
// excluded" list in docs/Roadmap.md, 0.9.222.
//
// Outgoing broadcasts, like World's own, carry no authorization decision
// of their own — broadcastCommand() is only ever called for a command
// THIS replica just executed through its own already-authorized local
// mutation chokepoint; what a connected peer accepts is entirely its own
// decision, made fresh by the SAME chain above, symmetric on every
// replica.
//
// 0.9.227 — Document Operation Identity & Causal Predecessor Boundary.
// `broadcastCommand()` now accepts an optional `causalPredecessors` list
// (see `core/DocumentOperationEnvelope.js`'s own header for the field's
// exact semantics) and `attachCommandHistory()` derives it automatically
// for every LOCALLY-authored command: whatever was on top of this
// replica's own `commandHistory` immediately before the new command —
// this replica's own single most-recent known operation in this
// document, or `[]` for the very first command it ever executes here.
// This is the one production behavior this milestone adds; everything
// else about this class — the trust chain, ReplayGuard, "never applies
// what it receives" — is unchanged. `_handleIncoming()` forwards a
// received envelope's own `causalPredecessors` (defaulting to `[]` for a
// pre-0.9.227 sender) through `onOperationReceived()` UNCHANGED — never
// interpreted, reordered, or used to decide acceptance — so a caller
// that wants to reason about causal relationships (via
// `core/DocumentOperationCausality.js#DocumentOperationCausalGraph`) has
// the real data to do it with. Nothing in this class ever constructs or
// consults a causal graph itself; see that file's own header for why.
export class DocumentCommandPropagationUseCase {
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        deviceAuthorization,
        identityProvider,
        commandRegistry,
        resolveDocument,
        isBlocked = null,
        replayGuard = new ReplayGuard(),
        protocol = DocumentCommandPropagationUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('DocumentCommandPropagationUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('DocumentCommandPropagationUseCase: a ConnectedPeerRegistry is required');
        }
        if (!deviceAuthorization || typeof deviceAuthorization.resolveConnectionIdentity !== 'function') {
            throw new Error('DocumentCommandPropagationUseCase: a DeviceAuthorizationPropagationUseCase is required');
        }
        if (!identityProvider) {
            throw new Error('DocumentCommandPropagationUseCase: an IdentityProvider is required');
        }
        if (!commandRegistry || typeof commandRegistry.fromJSON !== 'function') {
            throw new Error('DocumentCommandPropagationUseCase: a CommandRegistry is required');
        }
        if (typeof resolveDocument !== 'function') {
            throw new Error('DocumentCommandPropagationUseCase: resolveDocument(documentId) is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._deviceAuth = deviceAuthorization;
        this._identityProvider = identityProvider;
        this._commandRegistry = commandRegistry;
        this._resolveDocument = resolveDocument;
        this._isBlocked = typeof isBlocked === 'function' ? isBlocked : null;
        this._replayGuard = replayGuard;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        // Attaching is idempotent (peer/PeerMessageBus.js#attach()'s own
        // contract) — safe even though every OTHER protocol use case
        // sharing this same bus already attaches the identical peer
        // independently.
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
    // `causalPredecessors` (0.9.227) is optional and defaults to `[]` —
    // see `core/DocumentOperationEnvelope.js`'s own header. Returns the
    // operationId (== command.id) it sent.
    broadcastCommand({ documentId, command, causalPredecessors = [] }) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentCommandPropagationUseCase.broadcastCommand(): documentId is required');
        }
        if (!command || typeof command.toJSON !== 'function' || !command.id) {
            throw new Error('DocumentCommandPropagationUseCase.broadcastCommand(): a real Command instance is required');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('DocumentCommandPropagationUseCase.broadcastCommand(): no signing identity to author this operation');
        }
        const envelope = toDocumentOperationEnvelope({
            operationId: command.id,
            documentId,
            authorIdentityId,
            command: command.toJSON(),
            causalPredecessors
        });
        for (const peer of this._authenticatedPeers()) {
            this._bus.send(peer, this._protocol, envelope);
        }
        return envelope.operationId;
    }

    // Subscribes to a CommandHistory's OWN `application/events/
    // CommandHistoryEvent.js#COMMAND_EXECUTED` event — the SAME event
    // every other consumer already reads, never a second recording
    // mechanism — and broadcasts every forward, newly-authored command it
    // fires for. Mirrors `WorldCommandPropagationUseCase#attachCommandHistory()`
    // exactly: undo()/redo() publish COMMAND_UNDONE/COMMAND_REDONE,
    // neither of which this method ever listens to. Returns an
    // unsubscribe function.
    attachCommandHistory({ documentId, commandHistory }) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentCommandPropagationUseCase.attachCommandHistory(): documentId is required');
        }
        if (!commandHistory || !commandHistory.eventBus || typeof commandHistory.eventBus.subscribe !== 'function') {
            throw new Error('DocumentCommandPropagationUseCase.attachCommandHistory(): a real CommandHistory is required');
        }
        const subscription = commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
            // 0.9.227 — this replica's own single most-recent known
            // operation in this document becomes the new command's
            // causal predecessor. `commandHistory.execute()` has already
            // pushed `command` onto the undo stack by the time this
            // event fires (see `application/CommandHistory.js#execute()`),
            // so the entry immediately before it — if any — is exactly
            // "what this replica had already applied when it authored
            // this one." The very first command in a fresh history has
            // none: `[]`, a genesis operation.
            const executed = commandHistory.getExecutedCommands();
            const precedingCommand = executed.length >= 2 ? executed[executed.length - 2] : null;
            const causalPredecessors = precedingCommand ? [precedingCommand.id] : [];
            this.broadcastCommand({ documentId, command, causalPredecessors });
        });
        return () => subscription.unsubscribe();
    }

    // Returns an unsubscribe function. Fires `(documentId, command,
    // authorIdentityId, causalPredecessors)` — the RESOLVED social
    // identityId, never the raw device key — for every remote operation
    // this replica accepted. Never fires for a duplicate or a rejected
    // operation. Deliberately never applies `command` itself — see this
    // file's own header. `causalPredecessors` (0.9.227) is the sending
    // replica's own operationId list, UNCHANGED from the envelope that
    // arrived — this class never interprets it, only relays it (see this
    // file's own header for why).
    onOperationReceived(callback) {
        const subscription = this._eventBus.subscribe(OPERATION_RECEIVED_EVENT, ({ documentId, command, authorIdentityId, causalPredecessors }) => callback(documentId, command, authorIdentityId, causalPredecessors));
        return () => subscription.unsubscribe();
    }

    // Returns an unsubscribe function. Fires `(reason, envelope)` for
    // every incoming envelope this replica refused — malformed, spoofed,
    // unauthorized, targeting an unknown Document, or a recognized
    // duplicate. See DocumentOperationRejectionReason above.
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
        if (!isValidDocumentOperationEnvelope(payload)) {
            this._reject(DocumentOperationRejectionReason.INVALID_ENVELOPE, payload);
            return;
        }
        const connectedPeer = meta && meta.connectedPeer;
        if (!connectedPeer || connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !connectedPeer.remoteIdentity) {
            this._reject(DocumentOperationRejectionReason.IDENTITY_MISMATCH, payload);
            return;
        }
        // Step 2 — the claimed authorIdentityId must be exactly the raw
        // key THIS connection proved during authentication.
        if (payload.authorIdentityId !== connectedPeer.remoteIdentity.identityId) {
            this._reject(DocumentOperationRejectionReason.IDENTITY_MISMATCH, payload);
            return;
        }
        // Step 3 — social identity, device-aware.
        const social = this._deviceAuth.resolveConnectionIdentity(connectedPeer);
        if (!social || !social.identityId) {
            this._reject(DocumentOperationRejectionReason.IDENTITY_MISMATCH, payload);
            return;
        }
        // Step 4 — Document EDIT access. No `resolveWorldEditGrant` — see
        // this file's own header on why that degrades to ownership only.
        const document = this._resolveDocument(payload.documentId);
        if (!document) {
            this._reject(DocumentOperationRejectionReason.UNKNOWN_DOCUMENT, payload);
            return;
        }
        const authorization = new WorldAuthorizationService({
            resolveSocialIdentity: () => social,
            isBlocked: this._isBlocked
        });
        const access = authorization.resolveAccess(document);
        if (access !== WorldAccessLevel.EDIT) {
            this._reject(
                access === WorldAccessLevel.NONE ? DocumentOperationRejectionReason.BLOCKED : DocumentOperationRejectionReason.NOT_AUTHORIZED,
                payload
            );
            return;
        }
        // Step 5 — verify the operation itself.
        if (typeof payload.command.worldId === 'string' && payload.command.worldId !== payload.documentId) {
            this._reject(DocumentOperationRejectionReason.DOCUMENT_MISMATCH, payload);
            return;
        }
        if (this._replayGuard.hasAccepted(payload.operationId, payload.documentId)) {
            this._reject(DocumentOperationRejectionReason.DUPLICATE, payload);
            return;
        }
        let command;
        try {
            command = this._commandRegistry.fromJSON(payload.command);
        } catch {
            this._reject(DocumentOperationRejectionReason.UNKNOWN_COMMAND, payload);
            return;
        }
        // Recorded so a retransmit of the SAME operationId is recognized
        // even though nothing here ever executes it.
        this._replayGuard.recordAccepted(payload.operationId, payload.documentId);
        // Deliberately NEVER applied — see this file's own header. The
        // receiver is only ever told an authorized operation arrived.
        // `causalPredecessors` (0.9.227) is relayed exactly as validated
        // by `isValidDocumentOperationEnvelope()` — `[]` for a pre-0.9.227
        // sender that never set it, otherwise the sender's own list,
        // untouched.
        this._eventBus.publish(OPERATION_RECEIVED_EVENT, {
            documentId: payload.documentId,
            command,
            authorIdentityId: social.identityId,
            causalPredecessors: payload.causalPredecessors || []
        });
    }
}

DocumentCommandPropagationUseCase.DEFAULT_PROTOCOL = 'forkbuild:document-sync';
