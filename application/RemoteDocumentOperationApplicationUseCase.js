// 0.9.223 — Explicit Remote Document Operation Application Boundary.
//
// 0.9.222 (`application/DocumentCommandPropagationUseCase.js`) built the
// trust boundary — authenticated connection, claimed-vs-proven identity,
// device-aware social resolution, Document EDIT access, operation
// verification, ReplayGuard idempotency — and stopped deliberately short
// of applying anything. `onOperationReceived()` fires with a real,
// deserialized `Command`, and nothing in that class ever calls
// `command.execute()`. That was named, in its own header, as observation
// rather than automatic application: "the receiving surface (a future
// milestone, or an interactive caller) decides whether/how to apply it."
//
// This class is that receiving surface — and only that. It does NOT
// reopen `DocumentCommandPropagationUseCase` to add `command.execute()`
// back in; that would collapse the exact boundary 0.9.222 established.
// Instead it sits one layer downstream, on the OBSERVED, already-trusted
// triple that use case's own `onOperationReceived(documentId, command,
// authorIdentityId)` already hands a caller, and gives an Editor an
// explicit, document-scoped way to apply it:
//
//   peer message -> DocumentCommandPropagationUseCase (0.9.222)
//                    trust boundary: auth, identity, authorization,
//                    verification, ReplayGuard
//                        |
//                        v
//                 onOperationReceived(documentId, command, authorIdentityId)
//                        |
//                        v
//                 RemoteDocumentOperationApplicationUseCase (THIS class)
//                    apply(operation, target)
//                        |
//                        v
//                 target.commandHistory.execute(command)
//
// The semantics here are deliberately weaker than "the system guarantees
// convergence." What this class actually promises:
//
//   An authorized, verified, non-replayed remote operation may be
//   explicitly handed to the receiving Editor for application.
//
// Nothing here claims ordering, causal ordering, conflict resolution,
// CRDT/OT, deterministic convergence, or synchronized undo/redo. See
// docs/Roadmap.md, 0.9.223's own "Deliberately excluded" list.
//
// Document identity stays authoritative, always re-checked here, never
// assumed from the fact that an operation merely arrived: `apply()`
// requires the operation's own `documentId` to equal `target.documentId`
// — the document the CALLER says it is currently looking at, resolved
// fresh by the caller for every single call, never cached or inferred by
// this class. A remote operation for Document A must never mutate
// Document B; this is the guard that makes that true even while the
// receiving Editor is mid-switch between two open documents.
//
// Applying means calling `target.commandHistory.execute(command)` — the
// SAME chokepoint (`application/CommandHistory.js#execute()`) every local
// edit already goes through, never a second mutation path invented for
// remote operations. This is a deliberate, named characterization, not a
// silent default: it means a remote operation DOES enter the receiving
// replica's own local undo/redo stack exactly like a local edit would,
// and pressing Undo afterward undoes whatever is now on top of that
// stack — which may be the remote operation, or may not be, depending on
// what the local user did in between. This class takes no position on
// whether that is the right long-term collaborative undo model; it only
// guarantees this is what applying a remote operation on top of this
// codebase's EXISTING execution mechanism actually does today.
//
// No queue. An operation that cannot be applied right now (wrong
// document, or no target at all — nothing currently open) is reported
// NOT_APPLIED and then forgotten by this class; it is never buffered for
// a later document switch. A queue would immediately raise its own
// questions — ordering, lifetime, replay, persistence, conflict
// resolution — that belong to a later milestone, not this one.
export const DocumentOperationApplicationOutcome = Object.freeze({
    APPLIED: 'APPLIED',
    NOT_APPLIED: 'NOT_APPLIED'
});

export class RemoteDocumentOperationApplicationUseCase {
    // Explicitly applies one already-authorized, already-verified,
    // non-replayed remote operation against `target`, the RECEIVING
    // Editor's own currently-open document/session.
    //
    // `operation` is exactly the triple `DocumentCommandPropagationUseCase
    // #onOperationReceived()` fires: `{ documentId, command,
    // authorIdentityId }` — a real, already-deserialized `Command`
    // instance, never pre-serialized JSON.
    //
    // `target` is `{ documentId, commandHistory }` — the document
    // identity the caller is CURRENTLY editing and the real
    // `CommandHistory` (`application/CommandHistory.js`) backing it. Pass
    // `null` (or omit it) when nothing is currently open; this method
    // treats that identically to "wrong document" — NOT_APPLIED, nothing
    // touched.
    //
    // Returns a `DocumentOperationApplicationOutcome` and never throws
    // for a mismatched/missing target — refusing to apply is this
    // method's ordinary, expected outcome, not an error condition. It
    // DOES throw for a malformed `operation` (missing `documentId` or
    // `command`), the same "caller's own contract violation" posture
    // `DocumentCommandPropagationUseCase.broadcastCommand()` already
    // takes toward its own required arguments.
    apply({ documentId, command, authorIdentityId } = {}, target = null) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('RemoteDocumentOperationApplicationUseCase.apply(): operation.documentId is required');
        }
        if (!command || typeof command.execute !== 'function') {
            throw new Error('RemoteDocumentOperationApplicationUseCase.apply(): operation.command must be a real Command instance');
        }
        if (!target || !target.commandHistory || typeof target.commandHistory.execute !== 'function' || target.documentId !== documentId) {
            return DocumentOperationApplicationOutcome.NOT_APPLIED;
        }
        target.commandHistory.execute(command);
        return DocumentOperationApplicationOutcome.APPLIED;
    }

    // Wires this boundary directly to a DocumentCommandPropagationUseCase's
    // own `onOperationReceived()` feed, so a caller doesn't have to hand-
    // wire the callback itself. `resolveTarget` is called with NO
    // arguments and re-invoked FRESH for every single observed operation
    // — never cached across calls — so it always answers "what is the
    // receiving Editor looking at RIGHT NOW," including mid-session
    // document switches; `apply()` itself is what actually compares that
    // answer's `documentId` against the incoming operation's own. Returns
    // an unsubscribe function, mirroring every other subscription method
    // in this codebase.
    attachToPropagation(propagation, resolveTarget) {
        if (!propagation || typeof propagation.onOperationReceived !== 'function') {
            throw new Error('RemoteDocumentOperationApplicationUseCase.attachToPropagation(): a DocumentCommandPropagationUseCase is required');
        }
        if (typeof resolveTarget !== 'function') {
            throw new Error('RemoteDocumentOperationApplicationUseCase.attachToPropagation(): resolveTarget() is required');
        }
        return propagation.onOperationReceived((documentId, command, authorIdentityId) => {
            this.apply({ documentId, command, authorIdentityId }, resolveTarget());
        });
    }
}
