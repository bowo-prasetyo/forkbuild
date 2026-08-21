import { LogicalClock } from '../core/LogicalClock.js';

// 0.2.97 — Shared World Ordering & Conflict Resolution.
//
// The OperationOrdering stage of the pipeline this milestone's own
// design conversation asked for:
//
//   WorldCommandPropagationUseCase -> OperationOrdering -> ConflictResolver -> Command.execute()
//
// Owns exactly ONE core/LogicalClock.js per replica PROCESS — never per
// World. A replica's sense of "how much have I seen" is global, the
// same way a Lamport clock in any other system is a property of the
// process, not of any one object it timestamps; every World this
// replica ever broadcasts an operation for shares the SAME clock,
// exactly like a single wall clock would if this milestone used one
// (it deliberately does not — see core/LogicalClock.js's own header).
//
// Reduced to the only two questions application/
// WorldCommandPropagationUseCase.js actually needs answered — this
// class never touches a World, a Command, or the per-World operation
// log itself; that is replication/WorldConflictResolver.js's job, the
// very next stage.
export class WorldOperationOrdering {
    constructor(clock = new LogicalClock()) {
        this._clock = clock;
    }

    // "What logicalClock do I stamp MY OWN next outgoing operation
    // with" — called exactly once per LOCALLY-authored broadcast (see
    // application/WorldCommandPropagationUseCase.js#broadcastCommand()).
    // Always strictly greater than any value this replica has produced
    // or observed so far.
    stampLocal() {
        return this._clock.tick();
    }

    // "I just accepted a remote operation stamped `logicalClock`; fold
    // that into what I've seen" — called exactly once per ACCEPTED
    // incoming operation (see application/WorldCommandPropagationUseCase.js#
    // _handleIncoming()), BEFORE that operation is handed to
    // replication/WorldConflictResolver.js. Never mints a new value by
    // itself — see core/LogicalClock.js#observe()'s own header.
    observeRemote(logicalClock) {
        this._clock.observe(logicalClock);
    }

    get currentValue() {
        return this._clock.value;
    }
}
