import { compareWorldOperations, worldOperationSortKey } from '../core/WorldOperationOrder.js';

export const WorldOperationOutcome = Object.freeze({
    // Executed cleanly, and its effect is currently present in the World.
    APPLIED: 'APPLIED',
    // Ordered in (it passed every authorization/idempotency check
    // application/WorldCommandPropagationUseCase.js already runs) but,
    // at its canonical position in the log, its own execute()
    // precondition was not satisfied — see this file's own header,
    // "Delete vs. modify." NOT a rejection: the operation was
    // legitimately accepted, it simply lost the ordering race.
    SUPERSEDED: 'SUPERSEDED'
});

// 0.2.97 — Shared World Ordering & Conflict Resolution.
//
// The ConflictResolver stage of the pipeline this milestone's own
// design conversation asked for:
//
//   WorldCommandPropagationUseCase -> OperationOrdering -> ConflictResolver -> Command.execute()
//
// Answers the question 0.2.96 explicitly deferred (see application/
// WorldCommandPropagationUseCase.js's own header, "never 'how do two
// replicas converge on a concurrently-edited World' — that is 0.2.97's
// question"):
//
//   Every authorized replica that receives the SAME set of valid World
//   operations eventually derives the SAME World state, regardless of
//   arrival order or retransmission order.
//
// The mechanism, stated once here:
//
//   Every operation this resolver has ever accepted for a given World
//   is kept, forever, in ONE canonical, TOTALLY ORDERED log (core/
//   WorldOperationOrder.js) — never merely "the order things arrived
//   in." When a newly-accepted operation's canonical position is not
//   at the very end of that log — an OUT-OF-ORDER arrival, canonically
//   earlier than something already applied — this resolver REBASES: it
//   undoes every already-applied entry that canonically comes after
//   the new one, in reverse (the same LIFO order application/
//   CommandHistory.js's own undo() already uses), applies the new
//   operation, then re-applies the undone tail, in canonical order.
//
// This is deliberately NEITHER a CRDT NOR an OT transform function —
// every Command keeps meaning exactly what it already means
// (application/commands/Command.js's own contract: execute()/undo() are
// the ONLY operations this resolver ever calls, unchanged, on
// UNCHANGED Command classes — see docs/Roadmap.md, 0.2.97, "keep the
// solution deliberately modest" and "operation-based, not snapshot-
// based"). The convergence guarantee comes entirely from WHEN and in
// WHAT SEQUENCE those two already-existing methods get invoked, which
// is exactly why every Command in this codebase already being safely
// re-executable after undo() (application/CommandHistory.js's own
// redo() already depends on this) is what makes this resolver correct,
// not a new requirement it imposes.
//
// Conflict semantics fall out of this mechanism rather than being
// hand-coded per command type — see docs/Roadmap.md, 0.2.97:
//
//   independent edits (different targets) — commute freely; the log
//     never needs to reorder them relative to each other at all.
//   same-object edits (two moves of the same placement) — both apply,
//     in canonical order; whichever is canonically LATER determines
//     the field's final value — ordinary last-writer-wins, but by
//     CANONICAL order, never by arrival order.
//   same-property edits (two rotations) — identical reasoning.
//   delete vs. modify — a delete's undo is a full restore (see
//     application/commands/RemoveStructurePlacementCommand.js's own
//     header); a modify command REQUIRES its target to exist — every
//     Move/RotateStructurePlacementCommand's own execute() already
//     throws otherwise, a precondition this milestone never relaxes.
//     When canonical replay reaches a modify whose target a
//     canonically-EARLIER delete already removed, execute() throws
//     exactly as it always has; _tryApply() below catches that one
//     failure mode and records the operation SUPERSEDED instead of
//     applied, then keeps going — never aborts a reconciliation over
//     one operation that lost the ordering race. The delete itself,
//     once ordered in, is never superseded by anything (no command in
//     this codebase resurrects a removed target except its OWN undo),
//     so the net result, in EITHER canonical order, is always
//     "deleted." DELETE IS TERMINAL — the explicit, stated policy
//     0.2.97's own design conversation asked for, not an accident of
//     arrival order.
//
// One World, one independent log — `worldDocumentId` scopes every
// method below exactly like replication/ReplayGuard.js's own `scope`
// already does for a completely different object type. Idempotent per
// operationId: recording or applying the same operationId twice is a
// no-op the second time, the same defense-in-depth
// application/WorldCommandPropagationUseCase.js's own ReplayGuard check
// already provides one layer up — this class never assumes it is the
// only thing standing between a retransmit and a double-apply.
export class WorldConflictResolver {
    constructor() {
        this._logs = new Map(); // worldDocumentId -> Entry[]
    }

    // Registers an operation THIS replica already executed locally
    // (through its own authorized mutation chokepoint — application/
    // SpatialEditingService.js et al) into the SAME canonical log a
    // remote operation is reconciled against. Does NOT call execute()
    // — the command already ran; recording its position is what lets a
    // LATER-arriving, canonically-EARLIER remote operation correctly
    // rebase around it. A local operation's own logicalClock is always
    // the freshest tick this replica has ever produced (replication/
    // WorldOperationOrdering.js#stampLocal()), so at the moment this is
    // called it always sorts at the tail of whatever this replica has
    // seen so far — recording it is always a plain append here, never a
    // rebase trigger; a LATER out-of-order remote operation is what
    // rebases AROUND it, in applyRemote() below.
    recordLocal({ worldDocumentId, envelope, command }) {
        const log = this._logForWorld(worldDocumentId);
        if (log.some((entry) => entry.operationId === envelope.operationId)) {
            return;
        }
        log.push({ sortKey: worldOperationSortKey(envelope), operationId: envelope.operationId, command, applied: true });
    }

    // Reconciles a newly-accepted REMOTE operation into the canonical
    // log for `worldDocumentId`, executing/undoing `command` (and any
    // already-applied entries that must be rebased around it) against
    // the live `world`. Returns one of WorldOperationOutcome.
    applyRemote({ worldDocumentId, envelope, command, world }) {
        const log = this._logForWorld(worldDocumentId);
        const existing = log.find((entry) => entry.operationId === envelope.operationId);
        if (existing) {
            return existing.applied ? WorldOperationOutcome.APPLIED : WorldOperationOutcome.SUPERSEDED;
        }

        const sortKey = worldOperationSortKey(envelope);
        const entry = { sortKey, operationId: envelope.operationId, command, applied: false };

        // Insertion point: the first existing entry that canonically
        // comes AFTER the new one. Everything from there to the end of
        // the log is the "tail" that must be undone, then replayed.
        let index = log.length;
        for (let i = 0; i < log.length; i++) {
            if (compareWorldOperations(sortKey, log[i].sortKey) < 0) {
                index = i;
                break;
            }
        }

        const tail = log.slice(index);
        // Undo the tail, LIFO (most-recently-applied first) — exactly
        // application/CommandHistory.js's own undo() ordering, applied
        // here across possibly more than one command. Entries already
        // SUPERSEDED (applied === false) have no effect currently
        // present in the World and are skipped, never undone.
        for (let i = tail.length - 1; i >= 0; i--) {
            if (tail[i].applied) {
                tail[i].command.undo({ world });
                tail[i].applied = false;
            }
        }

        log.splice(index, 0, entry);
        const outcome = this._tryApply(entry, world);

        // Replay the tail, in canonical (forward) order, now AFTER the
        // newly-inserted operation. A previously-SUPERSEDED entry gets
        // a fresh attempt here too — the reordering that just happened
        // (e.g. undoing a delete that used to precede it) may make it
        // valid again; see this file's own header, "cascading reorder."
        for (const undone of tail) {
            this._tryApply(undone, world);
        }

        return outcome;
    }

    // Read-only projection, chiefly for tests — the operationIds this
    // resolver currently considers APPLIED (not superseded) for a
    // World, in canonical order.
    getAppliedOperationIds(worldDocumentId) {
        return this._logForWorld(worldDocumentId)
            .filter((entry) => entry.applied)
            .map((entry) => entry.operationId);
    }

    reset(worldDocumentId) {
        this._logs.delete(worldDocumentId);
    }

    _logForWorld(worldDocumentId) {
        let log = this._logs.get(worldDocumentId);
        if (!log) {
            log = [];
            this._logs.set(worldDocumentId, log);
        }
        return log;
    }

    // Never throws — a command whose precondition the canonical
    // ordering no longer satisfies (its target already removed by an
    // earlier-in-order delete) is exactly the SUPERSEDED case this
    // file's own header describes, not a failure this resolver
    // propagates further.
    _tryApply(entry, world) {
        try {
            entry.command.execute({ world });
            entry.applied = true;
            return WorldOperationOutcome.APPLIED;
        } catch {
            entry.applied = false;
            return WorldOperationOutcome.SUPERSEDED;
        }
    }
}
