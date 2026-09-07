// 0.9.231 — Recovered Operation Provenance Boundary.
//
// 0.9.230 (`application/DocumentOperationRecoveryUseCase.js`) closed the
// recovery-request seam: a replica that detects a causal gap can now ask
// a peer for the specific missing operation, verify the response through
// the SAME trust chain an ordinarily-received operation survives, and make
// it KNOWN to its own causal graph — all without ever handing it to
// `application/CommandHistory.js`. That restraint was correct, but it left
// an implicit distinction that this file makes explicit:
//
//   EXECUTED  — this operation has gone through `CommandHistory#execute()`
//               (`application/CommandHistory.js`, the ONE chokepoint every
//               local edit and every `RemoteDocumentOperationApplicationUseCase
//               #apply()` call already goes through — see that file's own
//               header, "Tools call commandHistory.execute() ... instead of
//               command.execute(context) directly"). It has actually
//               changed this replica's own document state.
//
//   RECOVERED — this operation arrived through
//               `application/DocumentOperationRecoveryUseCase.js`'s own
//               `onOperationReceived()` feed: verified, authentic causal
//               EVIDENCE that the operation exists and precedes whatever
//               named it as a predecessor — but never applied. It has NOT
//               changed this replica's own document state.
//
// Why this file exists, and why now. `core/DocumentOperationCausality.js`'s
// own `DocumentOperationCausalGraph#isKnown()` answers "has this replica
// recorded this operation's causal identity" — true for BOTH an executed
// operation and a merely-recovered one, because
// `DocumentOperationCausalGapObservationUseCase#attachToPropagation()` is
// wired, unmodified, to both
// `DocumentCommandPropagationUseCase#onOperationReceived()` (0.9.229) and
// `DocumentOperationRecoveryUseCase#onOperationReceived()` (0.9.230) —
// see that class's own header, "the SAME identical shape, on purpose."
// `isKnown()` was never meant to answer "did this change my document," and
// 0.9.230 never gave that second question a name of its own. Left
// unnamed, a future component reaching for "has this replica already dealt
// with operation X" has exactly one boolean to reach for —
// `isKnown()` — and using it to gate application would be silently,
// severely wrong: a recovered-but-never-applied operation would appear
// indistinguishable from one that already changed local state. This file
// is the vocabulary that keeps those two questions separate.
//
//   KNOWN     = `DocumentOperationCausalGraph#isKnown()` — this replica
//               has recorded the operation's causal identity. True for
//               EXECUTED and RECOVERED operations alike.
//   EXECUTED  = the operation is present in
//               `CommandHistory#getExecutedCommands()` — it changed this
//               replica's own document state.
//   RECOVERED = the operation arrived via
//               `DocumentOperationRecoveryUseCase#onOperationReceived()`
//               — verified causal evidence, never applied.
//
//   KNOWN does not imply EXECUTED. EXECUTED implies KNOWN (an executed
//   operation is always observed by `DocumentOperationCausalGapObservationUseCase`
//   too, via `DocumentCommandPropagationUseCase#onOperationReceived()`) —
//   but the reverse never holds, and this file's whole job is to keep it
//   from ever being assumed to.
//
// Pure vocabulary, nothing else. This file adds no state, no tracker, no
// map, no new query method on `CommandHistory` or `DocumentOperationCausalGraph`
// — see docs/Roadmap.md, 0.9.231's own "Deliberately excluded" for why: a
// `containsApplied()`-style method is deliberately NOT added here unless an
// actual product requirement demands it; the separation this milestone
// protects is proven through OBSERVABLE document behavior instead
// (`tests/DocumentOperationProvenance.test.js`), never through a new piece
// of tracked state that could itself drift out of sync with the two real
// sources of truth (`CommandHistory` and
// `DocumentOperationRecoveryUseCase#onOperationReceived()`).
//
// `application/DocumentOperationRecoveryUseCase.js` is the ONE place this
// vocabulary is actually threaded onto a real, running event: its own
// `onOperationReceived()` callback now carries `DocumentOperationProvenance.RECOVERED`
// as an explicit fifth argument, so a caller reading that feed never has
// to infer provenance merely from "which feed am I subscribed to" — see
// that file's own header for the exact wiring. There is no equivalent
// runtime tag for EXECUTED: `application/CommandHistory.js` stays
// UNTOUCHED by this milestone (see "Deliberately excluded" above) — its
// own `getExecutedCommands()`/`getCommands()` already ARE the unambiguous,
// pre-existing record of every EXECUTED operation; this file names what
// that record already means rather than duplicating it.
export const DocumentOperationProvenance = Object.freeze({
    EXECUTED: 'EXECUTED',
    RECOVERED: 'RECOVERED'
});

// True for exactly the two closed values above — the same "closed
// vocabulary" discipline `core/DocumentOperationCausalGapDetector.js#CausalGapStatus`
// and `core/DocumentOperationRecoveryProtocol.js#DocumentOperationRecoveryMessageKind`
// already apply to their own small enums.
export function isDocumentOperationProvenance(value) {
    return value === DocumentOperationProvenance.EXECUTED || value === DocumentOperationProvenance.RECOVERED;
}
