import { createId } from '../core/createId.js';
import { CollaborationEnvelope } from '../core/CollaborationEnvelope.js';
import { CommandHistoryEvent } from '../application/events/CommandHistoryEvent.js';

// The local collaboration participant (0.2.7).
//
// CollaborationSession sits BESIDE CommandHistory — it never replaces
// it, never creates a second history, and never becomes a second
// mutation system. It observes executed commands and applies remote
// ones through the SAME CommandHistory that tools use.
//
// Responsibilities:
//   1. When the local user executes a command (COMMAND_EXECUTED),
//      wrap it in a CollaborationEnvelope and broadcast it.
//   2. When a remote operation arrives, deserialize the command via
//      CommandRegistry, execute it on the local CommandHistory, and
//      send an acknowledgement.
//   3. Enforce idempotency: duplicate operation IDs are ignored.
//   4. Track per-author sequence numbers for ordering.
//   5. Prevent echo: never re-broadcast operations this session
//      originated or applied.
//
// Undo/redo are deliberately NOT propagated in 0.2.7. They are
// local-only operations. Propagating undo requires inverse-command
// design, which is 0.2.8 territory. The protocol envelope supports
// it (the type vocabulary is open), but the session does not emit
// undo/redo operations in this milestone.
//
// Lifecycle:
//   const session = new CollaborationSession({
//       documentId, author, commandHistory, commandRegistry, transport
//   });
//   session.start();   // subscribe to history + transport
//   ... user edits ...
//   session.stop();    // unsubscribe, send 'leave'
export class CollaborationSession {
    constructor({
        documentId,
        author,
        commandHistory,
        commandRegistry,
        transport
    }) {
        if (!documentId) throw new Error('CollaborationSession: documentId is required');
        if (!author) throw new Error('CollaborationSession: author is required');
        if (!commandHistory) throw new Error('CollaborationSession: commandHistory is required');
        if (!commandRegistry) throw new Error('CollaborationSession: commandRegistry is required');
        if (!transport) throw new Error('CollaborationSession: transport is required');

        this._documentId = documentId;
        this._author = author;
        this._commandHistory = commandHistory;
        this._commandRegistry = commandRegistry;
        this._transport = transport;

        // Per-author sequence counter (this author's outgoing operations).
        this._sequenceNumber = 0;

        // Idempotency: set of operation IDs we have already seen.
        this._seenOperationIds = new Set();

        // Echo prevention: set of operation IDs this session originated.
        this._localOperationIds = new Set();

        // Flag to suppress re-broadcast when applying a remote command.
        this._isApplyingRemote = false;

        // Subscription handles for cleanup.
        this._historySubscription = null;
        this._started = false;

        // Callbacks for observability (UI, tests).
        this._onRemoteOperation = null;
        this._onAcknowledge = null;
        this._onReject = null;
        this._onPeerJoined = null;
        this._onPeerLeft = null;
    }

    get documentId() { return this._documentId; }
    get author() { return this._author; }
    get isStarted() { return this._started; }

    // ---------------------------------------------------------
    // Observability hooks (optional callbacks for UI / tests)
    // ---------------------------------------------------------

    set onRemoteOperation(fn) { this._onRemoteOperation = fn; }
    set onAcknowledge(fn) { this._onAcknowledge = fn; }
    set onReject(fn) { this._onReject = fn; }
    set onPeerJoined(fn) { this._onPeerJoined = fn; }
    set onPeerLeft(fn) { this._onPeerLeft = fn; }

    // ---------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------

    start() {
        if (this._started) {
            return;
        }
        this._started = true;

        // Connect to the transport room for this document.
        this._transport.connect(this._documentId, this._author);

        // Subscribe to incoming envelopes from the transport.
        this._transport.subscribe(this._author, (envelope) => {
            this._onEnvelopeReceived(envelope);
        });

        // Subscribe to local command executions.
        this._historySubscription = this._commandHistory.eventBus.subscribe(
            CommandHistoryEvent.COMMAND_EXECUTED,
            ({ command }) => this._onLocalCommandExecuted(command)
        );

        // Announce our presence.
        this._send(CollaborationEnvelope.join({
            documentId: this._documentId,
            author: this._author
        }));
    }

    stop() {
        if (!this._started) {
            return;
        }
        this._started = false;

        // Announce departure.
        this._send(CollaborationEnvelope.leave({
            documentId: this._documentId,
            author: this._author
        }));

        // Unsubscribe from history events.
        if (this._historySubscription) {
            this._historySubscription.unsubscribe();
            this._historySubscription = null;
        }

        // Disconnect from the transport.
        this._transport.unsubscribe(this._author);
        this._transport.disconnect(this._author);
    }

    // ---------------------------------------------------------
    // Local command execution → broadcast
    // ---------------------------------------------------------

    _onLocalCommandExecuted(command) {
        // Suppress re-broadcast when we are applying a remote command.
        if (this._isApplyingRemote) {
            return;
        }

        this._sequenceNumber += 1;
        const operationId = createId();

        // Remember this operation ID so we can detect echoes.
        this._localOperationIds.add(operationId);
        this._seenOperationIds.add(operationId);

        const envelope = CollaborationEnvelope.operation({
            documentId: this._documentId,
            author: this._author,
            operationId,
            sequenceNumber: this._sequenceNumber,
            baseRevision: this._commandHistory.getCursor(),
            command: command.toJSON()
        });

        this._send(envelope);
        
    }

    // ---------------------------------------------------------
    // Incoming envelope handling
    // ---------------------------------------------------------

    _onEnvelopeReceived(envelope) {
        // Ignore envelopes from ourselves (belt-and-suspenders echo
        // prevention — the transport already filters, but defense in
        // depth is cheap).
        if (envelope.author === this._author) {
            return;
        }

        // Ignore envelopes for a different document.
        if (envelope.documentId !== this._documentId) {
            return;
        }

        switch (envelope.type) {
            case 'operation':
                this._handleOperation(envelope);
                break;
            case 'acknowledge':
                this._handleAcknowledge(envelope);
                break;
            case 'reject':
                this._handleReject(envelope);
                break;
            case 'join':
                this._handleJoin(envelope);
                break;
            case 'leave':
                this._handleLeave(envelope);
                break;
            // sync-request / sync-response are defined in the protocol
            // but handled in 0.2.8.
            default:
                break;
        }
    }

    _handleOperation(envelope) {
        const { operationId, sequenceNumber, baseRevision, command: commandJson } = envelope.payload;

        // Idempotency: ignore operations we have already seen.
        if (this._seenOperationIds.has(operationId)) {
            return;
        }
        this._seenOperationIds.add(operationId);

        // Attempt to deserialize and apply the command.
        try {
            const command = this._commandRegistry.fromJSON(commandJson);

            // Apply the command through the SAME CommandHistory.
            this._isApplyingRemote = true;
            try {
                this._commandHistory.execute(command);
            } finally {
                this._isApplyingRemote = false;
            }

            // Acknowledge successful application.
            this._send(CollaborationEnvelope.acknowledge({
                documentId: this._documentId,
                author: this._author,
                operationId,
                appliedRevision: this._commandHistory.getCursor()
            }));

            if (this._onRemoteOperation) {
                this._onRemoteOperation({
                    operationId,
                    author: envelope.author,
                    sequenceNumber,
                    command
                });
            }
        } catch (error) {
            // Reject: the command could not be deserialized or applied.
            this._send(CollaborationEnvelope.reject({
                documentId: this._documentId,
                author: this._author,
                operationId,
                reason: error.message
            }));
        }
    }

    _handleAcknowledge(envelope) {
        if (this._onAcknowledge) {
            this._onAcknowledge({
                operationId: envelope.payload.operationId,
                acknowledgedBy: envelope.author,
                appliedRevision: envelope.payload.appliedRevision
            });
        }
    }

    _handleReject(envelope) {
        if (this._onReject) {
            this._onReject({
                operationId: envelope.payload.operationId,
                rejectedBy: envelope.author,
                reason: envelope.payload.reason
            });
        }
    }

    _handleJoin(envelope) {
        if (this._onPeerJoined) {
            this._onPeerJoined({ author: envelope.author });
        }
    }

    _handleLeave(envelope) {
        if (this._onPeerLeft) {
            this._onPeerLeft({ author: envelope.author });
        }
    }

    // ---------------------------------------------------------
    // Transport send
    // ---------------------------------------------------------

    _send(envelope) {
        this._transport.send(this._author, envelope);
    }

    // ---------------------------------------------------------
    // Introspection (for tests and UI)
    // ---------------------------------------------------------

    get sequenceNumber() {
        return this._sequenceNumber;
    }

    get seenOperationCount() {
        return this._seenOperationIds.size;
    }

    hasSeenOperation(operationId) {
        return this._seenOperationIds.has(operationId);
    }
}
