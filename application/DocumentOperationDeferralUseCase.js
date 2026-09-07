import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';
import {
    RemoteDocumentOperationApplicationUseCase,
    DocumentOperationApplicationOutcome
} from './RemoteDocumentOperationApplicationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import {
    DocumentOperationApplicationReadiness,
    evaluateApplicationReadiness
} from '../core/DocumentOperationApplicationReadiness.js';

// 0.9.237 — Causal Application Deferral Boundary.
//
// 0.9.234 named Q4 ("have this operation's causal predecessors actually
// been EXECUTED, not merely KNOWN") and 0.9.235's own audit — against the
// REAL recovery + propagation + application chain — produced the evidence
// this milestone exists to act on: applying a `NOT_READY` operation
// immediately (today's unconditional `ARRIVAL_ORDER` policy) can SILENTLY
// AND PERMANENTLY diverge two replicas the moment a missing causal
// predecessor later executes out of order (that audit's own Section H, an
// absolute-write `RenameGroupCommand`). 0.9.236 then built the one seam
// any fix has to route around: `RecoveredOperationReplayUseCase#replay()`,
// the ONLY way a recovered-but-unexecuted operation can ever become
// EXECUTED (`ReplayGuard` permanently refuses to accept an operationId a
// second time, so waiting for redelivery is never an option).
//
// This class is the fix, and only the fix: the smallest change that turns
// Q4's answer into actual behavior.
//
//   receive verified operation
//              |
//              v
//        evaluate readiness (0.9.234, unchanged)
//         /                \
//     READY               NOT_READY
//       |                      |
//       v                      v
//   existing apply()      retain the EXACT Command instance
//   path (unchanged)           |
//                              | (later) a predecessor executes
//                              v
//                    onOperationExecuted(documentId, operationId)
//                              |
//                              v
//                     re-evaluate retained operations
//                              |
//                              v
//                     newly-READY ones apply, through the
//                     SAME existing apply() path
//
// Deferral is storage of an operation awaiting a readiness condition, not
// a new operation lifecycle state. On purpose, this file introduces
// exactly ONE new vocabulary value beyond what 0.9.234 already named —
// `DocumentOperationDeferralOutcome.DEFERRED` — never `PENDING`,
// `BLOCKED`, or `WAITING`. Those words describe a queue's own lifecycle;
// this class has no lifecycle, only a small map of exact, verified
// `Command` instances a caller has not yet been told are ready.
//
// Composition, not a new mutation path. `receive()` never calls
// `command.execute()` or `target.commandHistory.execute()` itself — every
// application, READY or newly-released, is delegated to an injected
// `RemoteDocumentOperationApplicationUseCase#apply()`
// (`application/RemoteDocumentOperationApplicationUseCase.js`, completely
// UNMODIFIED by this milestone), which is what actually reaches
// `CommandHistory#execute()`. This class adds no second chokepoint.
//
// The retained item is the actual verified `Command` instance, never
// reconstructed data. `receive()`'s own `command` argument — the SAME
// object `DocumentCommandPropagationUseCase#onOperationReceived()` handed
// the caller, already deserialized and verified — is what gets stored,
// and what later gets executed. There is no re-parse, no re-fetch, no
// JSON round-trip anywhere in this class.
//
// The release trigger is narrow and explicit, tied to one real event —
// never a timer, a poll, a retry loop, or a global event bus. A caller
// that KNOWS an operation just executed (a normal remote apply, a local
// edit, or an explicit `RecoveredOperationReplayUseCase#replay()` call)
// tells this class so via `onOperationExecuted(documentId, operationId)`.
// In practice this class wires that call itself: `attachCommandHistory()`
// subscribes to the SAME `CommandHistoryEvent.COMMAND_EXECUTED` event
// every other consumer in this codebase already reads
// (`application/CommandHistory.js`'s own header — the ONE chokepoint) —
// never a second recording mechanism, and never a reason to add a new
// method to `CommandHistory` itself.
//
// Release cascades through the existing event, not a new one. Applying a
// newly-released operation calls `target.commandHistory.execute()`, which
// synchronously fires `COMMAND_EXECUTED` again — and this class's own
// `attachCommandHistory()` subscription is listening for exactly that, so
// a chain `A -> B -> C` releases in one call when `A` executes: applying
// `B` re-enters `onOperationExecuted()` for `B`, which finds `C` now
// READY and applies it too. No second pass, no polling, no scheduled
// re-check — the cascade is the SAME mechanism that released `B` in the
// first place, applied recursively.
//
// Ordering among newly-ready operations is deliberately NOT solved here.
// When several retained operations become READY together, this class
// applies each of them, in whatever order it happens to iterate its own
// retained set — it does not invent a total order for operations the
// causal graph itself never ordered relative to each other (concurrent
// operations, 0.9.235's own Section E/F). The causal graph already
// enforces every dependency that actually exists; this class enforces
// those dependencies, never a stronger ordering nobody asked for.
//
// Concurrent, conflicting absolute writes remain exactly as undecided as
// 0.9.226 left them (`ConcurrentConflictResolution = UNDEFINED`). Two
// READY operations that both depend on the same predecessor but conflict
// with each other (0.9.235's own Section F) both apply, in ARRIVAL_ORDER,
// same as today — this class answers "did a required predecessor
// execute," never "which of two ready writes should win."
//
// Recovery sits beside this boundary, never inside it. This class is
// wired ONLY to `DocumentCommandPropagationUseCase`'s own
// `onOperationReceived()` feed (ordinary arrival) — never to
// `DocumentOperationRecoveryUseCase`'s. A merely RECOVERED predecessor
// stays NOT_READY-causing for every dependent that names it, for as long
// as it remains unexecuted (0.9.234's own invariant, untouched) — and
// this class never calls `RecoveredOperationReplayUseCase#replay()`
// itself, the same restraint that class's own header already demands of
// every other caller. Recovery obtaining `A` (`RECOVERED`) does not
// release a dependent `B`; only an explicit `replay(A)` call, turning `A`
// into `EXECUTED`, fires the `COMMAND_EXECUTED` event this class actually
// listens for.
//
// Duplicate delivery. `receive()` retains the FIRST verified `Command`
// instance it sees for a given (documentId, operationId) while NOT_READY;
// a second delivery of the identical operationId while still deferred is
// a no-op — mirrors `DocumentOperationCausalGraph#record()`'s own
// "recording the same thing twice" idempotency posture. In production
// `ReplayGuard` already prevents an identical operationId from reaching
// `onOperationReceived()` twice in the first place; this class's own
// idempotency is defensive, for a direct caller that bypasses that guard.
//
// Failure isolation. A retained operation whose `Command#execute()`
// throws when finally applied is dropped — never retried, never allowed
// to prevent release of any OTHER retained operation, in this document or
// any other. No retry/backoff mechanism is introduced for it, the same
// restraint every prior milestone in this lineage already applies to
// itself.
//
// Deliberately excluded from this milestone, same lineage as every prior
// one: no PENDING/BLOCKED/WAITING lifecycle, no operation queue beyond
// this class's own small per-document retained map, no timer, no polling,
// no retry/backoff, no automatic recovery, no automatic replay, no causal
// total ordering, no conflict resolution, no CRDT, no OT, no
// vector/logical clocks, no offline synchronization, no synchronized
// undo, no convergence guarantee, no commutativity classification, no
// change to `CommandHistory`, no change to `ReplayGuard`, no change to
// `RemoteDocumentOperationApplicationUseCase`, no change to
// `RecoveredOperationReplayUseCase`'s own "never automatically apply"
// boundary.
export const DocumentOperationDeferralOutcome = Object.freeze({
    APPLIED: 'APPLIED',
    DEFERRED: 'DEFERRED',
    NOT_APPLIED: 'NOT_APPLIED'
});

export function isDocumentOperationDeferralOutcome(value) {
    return value === DocumentOperationDeferralOutcome.APPLIED
        || value === DocumentOperationDeferralOutcome.DEFERRED
        || value === DocumentOperationDeferralOutcome.NOT_APPLIED;
}

export class DocumentOperationDeferralUseCase {
    // `applicationUseCase` defaults to a fresh, private
    // `RemoteDocumentOperationApplicationUseCase` — pass one explicitly to
    // share the exact instance a caller already applies through elsewhere
    // (not required for correctness, since that class holds no state of
    // its own, but keeps a single production wiring consistent).
    // `causalGapDetector` defaults to a fresh, private
    // `DocumentOperationCausalGapDetector` — pass one explicitly to share
    // real, already-accumulated causal knowledge with whatever
    // `DocumentOperationCausalGapObservationUseCase` is recording into,
    // the same seam every sibling in this lineage already exposes.
    constructor({
        applicationUseCase = new RemoteDocumentOperationApplicationUseCase(),
        causalGapDetector = new DocumentOperationCausalGapDetector()
    } = {}) {
        if (!applicationUseCase || typeof applicationUseCase.apply !== 'function') {
            throw new Error('DocumentOperationDeferralUseCase: a RemoteDocumentOperationApplicationUseCase is required');
        }
        if (!causalGapDetector || typeof causalGapDetector.detect !== 'function') {
            throw new Error('DocumentOperationDeferralUseCase: a DocumentOperationCausalGapDetector is required');
        }
        this._applicationUseCase = applicationUseCase;
        this._causalGapDetector = causalGapDetector;
        // documentId -> CommandHistory, registered by attachCommandHistory()
        // below. Answers Q4 (`executionHistory.isExecuted()`, 0.9.234) AND
        // resolves the apply target for a released operation — the SAME
        // CommandHistory serves both jobs, on purpose, never two separate
        // pieces of tracked state that could drift apart.
        this._commandHistoriesByDocumentId = new Map();
        // documentId -> Map(operationId -> { command, authorIdentityId,
        // causalPredecessors }) — the entire "pending mechanism" this
        // milestone's own header calls for. Nothing more.
        this._deferredByDocumentId = new Map();
        this._executionHistory = { isExecuted: (documentId, operationId) => this._isExecuted(documentId, operationId) };
    }

    // Registers/rewires the CommandHistory backing `documentId` — mirrors
    // `DocumentCommandPropagationUseCase#attachCommandHistory()` and
    // `DocumentOperationRecoveryUseCase#attachCommandHistory()`'s own
    // per-document rewiring shape exactly (same method name, same
    // constructor-args, same "torn down and re-wired on every
    // load/fork/new/document-switch" caller discipline — see
    // `application/EditorSession.js`). Two jobs, one registration: lets
    // `evaluateApplicationReadiness()` read this replica's REAL execution
    // history for `documentId` (Q4), and subscribes to this exact
    // CommandHistory's own `COMMAND_EXECUTED` event so a local edit, a
    // normal remote apply, or an explicit
    // `RecoveredOperationReplayUseCase#replay()` call — anything that
    // reaches `CommandHistory#execute()` for this document — triggers
    // `onOperationExecuted()` automatically. Returns an unsubscribe
    // function.
    attachCommandHistory({ documentId, commandHistory } = {}) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationDeferralUseCase.attachCommandHistory(): documentId is required');
        }
        if (!commandHistory || !commandHistory.eventBus || typeof commandHistory.eventBus.subscribe !== 'function' || typeof commandHistory.getExecutedCommands !== 'function') {
            throw new Error('DocumentOperationDeferralUseCase.attachCommandHistory(): a real CommandHistory is required');
        }
        this._commandHistoriesByDocumentId.set(documentId, commandHistory);
        const subscription = commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
            try {
                this.onOperationExecuted(documentId, command.id);
            } catch {
                // Failure isolation — a broken retained operation must
                // never break CommandHistory's own COMMAND_EXECUTED
                // fan-out for every OTHER subscriber (broadcast, dirty
                // tracking, gizmo refresh, ...).
            }
        });
        return () => {
            subscription.unsubscribe();
            if (this._commandHistoriesByDocumentId.get(documentId) === commandHistory) {
                this._commandHistoriesByDocumentId.delete(documentId);
            }
        };
    }

    // The receiving seam: an ALREADY-VERIFIED operation — exactly the
    // shape `DocumentCommandPropagationUseCase#onOperationReceived()`
    // fires: `{ documentId, command, authorIdentityId, causalPredecessors }`.
    // `target` is the identical `{ documentId, commandHistory }` shape
    // `RemoteDocumentOperationApplicationUseCase#apply()` already
    // requires — resolved fresh by the caller, never cached (see that
    // method's own header). Evaluates readiness (0.9.234); READY is
    // handed straight to the existing apply() path, NOT_READY retains the
    // exact `command` instance and returns `DEFERRED` — this replica's
    // document state is untouched either way.
    receive({ documentId, command, authorIdentityId, causalPredecessors = [] } = {}, target = null) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationDeferralUseCase.receive(): operation.documentId is required');
        }
        if (!command || typeof command.execute !== 'function' || !command.id) {
            throw new Error('DocumentOperationDeferralUseCase.receive(): operation.command must be a real Command instance');
        }
        const readiness = this._evaluateReadiness(documentId, command.id, causalPredecessors);
        if (readiness.readiness === DocumentOperationApplicationReadiness.NOT_READY) {
            this._retain(documentId, command, authorIdentityId, causalPredecessors);
            return DocumentOperationDeferralOutcome.DEFERRED;
        }
        return this._apply(documentId, command, authorIdentityId, target);
    }

    // The narrow release trigger this file's own header calls for: "tell
    // the deferral mechanism something changed in this document's
    // execution history." Re-evaluates every currently-retained operation
    // for `documentId` and applies (through the existing apply() path)
    // whichever are now READY — repeatedly, since applying one retained
    // operation can itself make another retained operation READY (a
    // chain `A -> B -> C`), via the SAME `COMMAND_EXECUTED` cascade
    // `attachCommandHistory()` above is already listening for. Returns
    // the operationIds this call itself released (cascaded releases are
    // reflected in document state immediately, not necessarily in this
    // particular return value). Never throws for a document with nothing
    // retained; throws only for a malformed `(documentId, operationId)`
    // pair, the same "caller's own contract violation" posture every
    // sibling class in this lineage already takes.
    onOperationExecuted(documentId, operationId) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('DocumentOperationDeferralUseCase.onOperationExecuted(): documentId is required');
        }
        if (!operationId || typeof operationId !== 'string') {
            throw new Error('DocumentOperationDeferralUseCase.onOperationExecuted(): operationId is required');
        }
        const retainedByOperationId = this._deferredByDocumentId.get(documentId);
        if (!retainedByOperationId || retainedByOperationId.size === 0) {
            return [];
        }
        const target = this._resolveTarget(documentId);
        if (!target) {
            // No resolvable CommandHistory for this document — nothing
            // could possibly apply right now. Leave every retained entry
            // exactly as it is for a later call, rather than risk losing
            // one to a target that doesn't exist yet.
            return [];
        }
        const released = [];
        for (const [id, retained] of [...retainedByOperationId]) {
            if (!retainedByOperationId.has(id)) {
                // Already released by a cascaded, reentrant call
                // triggered while applying an earlier entry in this same
                // pass — see this file's own header, "Release cascades
                // through the existing event."
                continue;
            }
            const readiness = this._evaluateReadiness(documentId, id, retained.causalPredecessors);
            if (readiness.readiness !== DocumentOperationApplicationReadiness.READY) {
                continue;
            }
            // Deleted BEFORE applying, deliberately: applying calls
            // target.commandHistory.execute(), which synchronously fires
            // COMMAND_EXECUTED again and re-enters this very method (the
            // cascade this file's own header describes). That reentrant
            // call must see this operation as already handled — deleting
            // afterwards would let it find `id` still retained and apply
            // it a second time.
            retainedByOperationId.delete(id);
            try {
                this._apply(documentId, retained.command, retained.authorIdentityId, target);
                released.push(id);
            } catch {
                // Failure isolation (see this file's own header) — the
                // operation is already removed above, so a broken
                // Command is dropped, never retried, and never prevents
                // release of any other retained operation.
            }
        }
        if (retainedByOperationId.size === 0) {
            this._deferredByDocumentId.delete(documentId);
        }
        return released;
    }

    // Introspection only — lets a caller (a test, or a future UI
    // affordance) see what this replica currently has retained for
    // `documentId`, without reaching into a private field. Never mutates.
    getDeferredOperationIds(documentId) {
        const retainedByOperationId = this._deferredByDocumentId.get(documentId);
        return retainedByOperationId ? [...retainedByOperationId.keys()] : [];
    }

    // Wires this boundary directly to a DocumentCommandPropagationUseCase's
    // own `onOperationReceived()` feed — the SAME feed
    // `RemoteDocumentOperationApplicationUseCase#attachToPropagation()`
    // itself attaches to, mirrored exactly (including re-resolving
    // `target` fresh for every observed operation). Deliberately never
    // attached to `DocumentOperationRecoveryUseCase`'s own feed — see this
    // file's own header, "Recovery sits beside this boundary." Returns an
    // unsubscribe function.
    attachToPropagation(propagation, resolveTarget) {
        if (!propagation || typeof propagation.onOperationReceived !== 'function') {
            throw new Error('DocumentOperationDeferralUseCase.attachToPropagation(): a DocumentCommandPropagationUseCase is required');
        }
        if (typeof resolveTarget !== 'function') {
            throw new Error('DocumentOperationDeferralUseCase.attachToPropagation(): resolveTarget() is required');
        }
        return propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => {
            this.receive({ documentId, command, authorIdentityId, causalPredecessors }, resolveTarget());
        });
    }

    _evaluateReadiness(documentId, operationId, causalPredecessors) {
        return evaluateApplicationReadiness(
            documentId,
            { operationId, causalPredecessors },
            { causalGapDetector: this._causalGapDetector, executionHistory: this._executionHistory }
        );
    }

    _isExecuted(documentId, operationId) {
        const history = this._commandHistoriesByDocumentId.get(documentId);
        return !!history && history.getExecutedCommands().some((command) => command.id === operationId);
    }

    _retain(documentId, command, authorIdentityId, causalPredecessors) {
        let retainedByOperationId = this._deferredByDocumentId.get(documentId);
        if (!retainedByOperationId) {
            retainedByOperationId = new Map();
            this._deferredByDocumentId.set(documentId, retainedByOperationId);
        }
        if (retainedByOperationId.has(command.id)) {
            // Duplicate delivery of the same still-NOT_READY operation —
            // see this file's own header, "Duplicate delivery." The
            // first verified Command instance already retained wins.
            return;
        }
        retainedByOperationId.set(command.id, { command, authorIdentityId, causalPredecessors });
    }

    _apply(documentId, command, authorIdentityId, target) {
        const outcome = this._applicationUseCase.apply({ documentId, command, authorIdentityId }, target);
        return outcome === DocumentOperationApplicationOutcome.APPLIED
            ? DocumentOperationDeferralOutcome.APPLIED
            : DocumentOperationDeferralOutcome.NOT_APPLIED;
    }

    _resolveTarget(documentId) {
        const commandHistory = this._commandHistoriesByDocumentId.get(documentId);
        return commandHistory ? { documentId, commandHistory } : null;
    }
}
