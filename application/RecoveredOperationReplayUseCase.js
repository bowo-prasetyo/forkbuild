import { DocumentOperationProvenance } from '../core/DocumentOperationProvenance.js';

// 0.9.236 — Recovered Operation Replay Boundary.
//
// 0.9.235's own audit (`tests/CausalReadinessEnforcementDecisionAudit.test.js`,
// Section H) produced the evidence this milestone exists to act on: a
// dependent operation applied while NOT_READY, followed later by its
// missing causal predecessor actually executing, can SILENTLY AND
// PERMANENTLY diverge two replicas for an absolute-write command class —
// not a theoretical consistency concern, a demonstrated correctness bug.
// Section D of that same audit also demonstrated the one mechanical fact
// any fix must route around: once `DocumentOperationRecoveryUseCase` has
// verified a recovered operation's envelope, `ReplayGuard` has permanently
// marked its operationId seen (`application/DocumentCommandPropagationUseCase.js
// #_verify()`, "a retransmit of the SAME operationId, over EITHER this
// class's own protocol or a recovery response naming it, is recognized as
// a duplicate"). A recovered operation can therefore NEVER be made to
// execute by asking the network to redeliver it — the only way it can ever
// reach `CommandHistory#execute()` is for a caller to apply the
// ALREADY-RECOVERED `Command` instance directly.
//
// This class is that explicit seam, and only that seam:
//
//   DocumentOperationRecoveryUseCase
//                 |
//                 v
//          verified RECOVERED   (onOperationReceived, provenance = RECOVERED)
//                 |
//                 v
//     RecoveredOperationReplayUseCase   (THIS class — records, then replay())
//                 |
//                 v
//          CommandHistory#execute()
//                 |
//                 v
//              EXECUTED
//
// THE CENTRAL INVARIANT. A recovered operation never changes document
// state merely because it was recovered; it changes state only through an
// explicit call to `replay()`. Recording a recovered operation
// (`attachToRecovery()`) and applying it (`replay()`) are two separate
// acts, on purpose — mirroring the separation `DocumentOperationProvenance`
// already named between KNOWN and EXECUTED. `attachToRecovery()` never
// calls `replay()` itself, and nothing in this codebase calls `replay()`
// automatically as of this milestone. See docs/Roadmap.md, 0.9.236's own
// "Deliberately excluded" for the full list of what this class refuses to
// become.
//
// Composition, not a new trust path. This class performs NO independent
// verification of its own — it trusts exactly what
// `DocumentOperationRecoveryUseCase#onOperationReceived()` already handed
// it, which itself only ever fires for an envelope that survived
// `DocumentCommandPropagationUseCase#verifyEnvelope()`, the identical
// five-step chain an ordinarily-arrived operation goes through (see that
// class's own header). `attachToRecovery()` additionally only ever records
// an entry whose `provenance` is exactly `DocumentOperationProvenance.RECOVERED`
// — defensive, not load-bearing today (recovery's own feed never fires any
// other value), but it keeps this class from ever silently accepting a
// differently-provenanced operation should it one day be attached to a
// different feed by mistake.
//
// Exact command, never reconstruction. `replay()` calls
// `target.commandHistory.execute(command)` against the SAME `Command`
// instance `DocumentOperationRecoveryUseCase` itself deserialized via its
// own `verifyEnvelope()` call — never a re-parse, a re-fetch, or a
// substitute built from the operationId alone. There is no path through
// this class that re-derives a command from anything other than the
// verified object recovery already produced.
//
// Idempotency without a second source of truth. A caller invoking
// `replay()` twice for the same operation must not execute it twice — but
// this class deliberately does NOT add its own "already replayed" flag,
// the same restraint `core/DocumentOperationProvenance.js`'s own header
// already applied for exactly this reason: a second piece of tracked state
// that could itself drift out of sync with the one real source of truth.
// `application/CommandHistory.js#getExecutedCommands()` already answers
// "did this operationId actually execute" — `replay()` checks THAT, on
// every call, before ever calling `execute()`. This is deliberately a
// different mechanism from `ReplayGuard` (which protects transport
// reception, keyed by envelope delivery) — see this file's own
// `replay()` comment for why reusing ReplayGuard here would be actively
// wrong, not merely redundant.
//
// Document isolation, the same guard `RemoteDocumentOperationApplicationUseCase
// #apply()` already applies: a recovered operation is stored keyed by the
// document it was recovered FOR, and `replay()` additionally requires the
// caller's own `target.documentId` to equal the `documentId` being
// replayed. A recovered operation for Document A can never be replayed
// into a `target` for Document B, even if a caller mistakenly asks for it
// by operationId alone.
//
// No provenance change. This milestone deliberately does NOT introduce a
// third `DocumentOperationProvenance` value (no `REPLAYED`). The semantic
// fact after a successful `replay()` is simply that the operation is now
// EXECUTED — indistinguishable, in `CommandHistory#getExecutedCommands()`,
// from any other executed operation. That it originally arrived through
// recovery is provenance this class remembers privately (so a second
// `replay()` call can still find it), never a new public vocabulary value.
// If a real product need for "executed, but originally recovered" ever
// emerges, that deserves its own future seam — see docs/Roadmap.md,
// 0.9.231's own header for the identical restraint applied to KNOWN vs
// EXECUTED.
//
// Deliberately excluded from this milestone, same lineage as every prior
// one: no pending/deferred-application queue, no automatic replay, no
// causal reordering, no conflict resolution, no CRDT, no OT, no
// convergence guarantee, no command commutativity classification, no
// change to `ARRIVAL_ORDER`, no change to `ReplayGuard`, no change to
// `DocumentOperationRecoveryUseCase` or its own "never automatically
// apply" boundary, no change to `CommandHistory` itself. The user/
// application must explicitly invoke `replay()` — nothing in this class,
// or wired around it, ever calls it on its own.
export const DocumentOperationReplayOutcome = Object.freeze({
    REPLAYED: 'REPLAYED',
    NOT_REPLAYED: 'NOT_REPLAYED'
});

export function isDocumentOperationReplayOutcome(value) {
    return value === DocumentOperationReplayOutcome.REPLAYED || value === DocumentOperationReplayOutcome.NOT_REPLAYED;
}

export class RecoveredOperationReplayUseCase {
    constructor() {
        // Keyed `${documentId}::${operationId}` — mirrors
        // `DocumentOperationRecoveryUseCase`'s own `_known` map shape.
        // Entries are never deleted after a successful replay: they stay
        // available so a repeat `replay()` call can still find the exact
        // recovered Command and answer NOT_REPLAYED via the
        // already-executed check below, rather than "unknown operation."
        this._recovered = new Map();
    }

    // Subscribes to a `DocumentOperationRecoveryUseCase`'s own
    // `onOperationReceived()` feed and records every RECOVERED operation
    // it fires — never anything else, and never a call to `replay()`
    // itself. Returns an unsubscribe function, mirroring every other
    // subscription method in this codebase.
    attachToRecovery(recovery) {
        if (!recovery || typeof recovery.onOperationReceived !== 'function') {
            throw new Error('RecoveredOperationReplayUseCase.attachToRecovery(): a DocumentOperationRecoveryUseCase is required');
        }
        return recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => {
            if (provenance !== DocumentOperationProvenance.RECOVERED) {
                return;
            }
            this._recovered.set(`${documentId}::${command.id}`, {
                documentId,
                command,
                authorIdentityId,
                causalPredecessors
            });
        });
    }

    // Explicitly applies a previously recovered, verified operation
    // against `target`, the CALLER's own currently-open document/session
    // — the one and only way a recovered operation can ever change
    // document state. `operation` is `{ documentId, operationId }`,
    // identifying WHICH recovered operation to replay; `target` is
    // `{ documentId, commandHistory }`, the identical shape
    // `RemoteDocumentOperationApplicationUseCase#apply()` already
    // requires.
    //
    // Returns a `DocumentOperationReplayOutcome` and never throws for an
    // unknown operation, a mismatched/missing target, or an
    // already-executed operation — refusing to replay is this method's
    // ordinary, expected outcome in all three cases, not an error
    // condition. It DOES throw for a malformed `operation` (missing
    // `documentId` or `operationId`), the same "caller's own contract
    // violation" posture `RemoteDocumentOperationApplicationUseCase#apply()`
    // already takes toward its own required arguments.
    //
    // Deliberately does NOT consult `ReplayGuard`: that guard protects
    // TRANSPORT reception (has this envelope already been accepted off
    // the wire), a question already answered, once, by
    // `DocumentOperationRecoveryUseCase` itself when it first verified
    // this operation. Reusing it here would conflate two different
    // questions — "was this envelope ever accepted" (ReplayGuard's job,
    // already satisfied) and "has this replica's document already
    // executed this operation" (this method's own job) — and would leave
    // no way to tell them apart if they ever disagreed. Idempotency here
    // is instead answered by `commandHistory.getExecutedCommands()`
    // itself, the one real source of truth for what this replica has
    // actually applied.
    replay({ documentId, operationId } = {}, target = null) {
        if (!documentId || typeof documentId !== 'string') {
            throw new Error('RecoveredOperationReplayUseCase.replay(): operation.documentId is required');
        }
        if (!operationId || typeof operationId !== 'string') {
            throw new Error('RecoveredOperationReplayUseCase.replay(): operation.operationId is required');
        }
        const recovered = this._recovered.get(`${documentId}::${operationId}`);
        if (!recovered) {
            return DocumentOperationReplayOutcome.NOT_REPLAYED;
        }
        if (!target || !target.commandHistory
            || typeof target.commandHistory.execute !== 'function'
            || typeof target.commandHistory.getExecutedCommands !== 'function'
            || target.documentId !== documentId) {
            return DocumentOperationReplayOutcome.NOT_REPLAYED;
        }
        const alreadyExecuted = target.commandHistory.getExecutedCommands()
            .some((command) => command.id === operationId);
        if (alreadyExecuted) {
            return DocumentOperationReplayOutcome.NOT_REPLAYED;
        }
        target.commandHistory.execute(recovered.command);
        return DocumentOperationReplayOutcome.REPLAYED;
    }
}
