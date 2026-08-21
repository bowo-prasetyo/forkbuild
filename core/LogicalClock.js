// 0.2.97 — Shared World Ordering & Conflict Resolution.
//
// A Lamport logical clock — the "causal/logical sequence" this
// milestone's own design conversation asked for, deliberately NOT
// wall-clock time (see docs/Roadmap.md, 0.2.97, "ordering must not
// depend on wall-clock time"). A scalar, not a vector: 0.2.97 never
// needs to distinguish "happened before" from "concurrent" the way
// core/CausalStamp.js's own vector-clock semantics do for
// PlacementRecord (0.2.18) — it only ever needs "which of these two
// operations does every replica agree comes first," and a single
// growing integer per replica, folded with every other replica's own
// claims on receipt, is sufficient for that. See core/WorldOperationOrder.js
// for how a clock VALUE becomes a full total order once an operation's
// own id is added as a tie-breaker.
//
//   tick()       — mint the next value for an operation THIS replica is
//                  about to author. Always strictly greater than every
//                  value this replica has produced OR observed so far.
//   observe(n)   — fold a REMOTE operation's own logicalClock into this
//                  replica's notion of "how much has been seen" —
//                  raises the floor (`max(current, n)`) but never mints
//                  a new value by itself. This split matters: a replica
//                  that only ever RECEIVES operations and never
//                  authors any must never appear to have originated
//                  clock values nobody actually stamped — only tick()
//                  does that, and only for a LOCAL operation.
export class LogicalClock {
    constructor(initial = 0) {
        this._value = Number.isInteger(initial) && initial >= 0 ? initial : 0;
    }

    get value() {
        return this._value;
    }

    tick() {
        this._value += 1;
        return this._value;
    }

    observe(remoteValue) {
        if (Number.isInteger(remoteValue) && remoteValue > this._value) {
            this._value = remoteValue;
        }
        return this._value;
    }
}
