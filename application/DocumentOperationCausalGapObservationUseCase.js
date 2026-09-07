import { EventBus } from '../core/events/EventBus.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';

const GAP_OBSERVED_EVENT = 'DocumentOperationCausalGapObserved';

// 0.9.229 — Causal Gap Observation at the Propagation Boundary.
//
// 0.9.228 (`core/DocumentOperationCausalGapDetector.js`) made causal
// completeness QUERYABLE — `detect()` answers, for one operation's own
// predecessor list, whether this replica currently knows every predecessor
// it names. But it is only ever exercised directly, by a caller that
// already has both the operation and a detector to hand. Nothing yet sits
// where operations actually arrive. This class is that seam, and only
// that seam:
//
//   network -> envelope -> identity/auth -> ReplayGuard -> accepted
//   operation -> `DocumentCommandPropagationUseCase#onOperationReceived()`
//                    |
//                    +--> THIS class: detect, then record, then notify
//                    |
//                    +--> `RemoteDocumentOperationApplicationUseCase`
//                         (0.9.223/0.9.224, completely unmodified)
//
// Wired the SAME way `RemoteDocumentOperationApplicationUseCase#
// attachToPropagation()` already attaches to that identical feed — a
// second, independent subscriber, never a change to
// `DocumentCommandPropagationUseCase` itself. Every accepted operation
// (one that survived ReplayGuard and reached `onOperationReceived()`) now
// also produces one observable causal-gap result; nothing about whether
// or how it gets applied changes, because this class never touches
// `application/CommandHistory.js` or `RemoteDocumentOperationApplicationUseCase`
// and never gates the OTHER subscriber's own call to `apply()`.
//
// A causal gap is an observation, not an application decision — the same
// restraint `core/DocumentOperationCausalGapDetector.js`'s own header
// already names. This class adds no new vocabulary on top of
// `CausalGapStatus` (`NO_GAP`/`GAP`) and no lifecycle: no `WAITING`, no
// `BLOCKED`, no `PENDING`, no `RECOVERING`. It only makes the existing
// detector's answer observable at the one place an operation becomes
// real: the moment this replica accepts it.
//
// Detect BEFORE record, every time. For an incoming operation B, this
// class always calls `causalGapDetector.detect()` first, against
// whatever the detector already knew BEFORE B arrived, and only then
// calls `causalGapDetector.record()` for B itself. Recording B before
// detecting its own gap would risk B's own identity accidentally
// satisfying its own predecessor reference in some future, more exotic
// causal shape — `detect()`'s own contract already forbids an operation
// naming itself (`core/DocumentOperationEnvelope.js#isValidCausalPredecessorList()`),
// but this ordering is what keeps that guarantee meaningful for the
// actual receive sequence, not merely for the pure, single-call unit
// tests `core/DocumentOperationCausalGapDetector.js`'s own suite already
// covers.
//
// The result descriptor is deliberately small and flat:
//
//   { operationId, documentId, causalPredecessors, causalGap }
//
// where `causalGap` is exactly `DocumentOperationCausalGapDetector#detect()`'s
// own return value (`{ status, missingCausalPredecessorIds }`) — never
// reshaped, never wrapped in a second status enum. A caller that wants to
// know "does this replica have everything B needs" reads `causalGap.status`;
// a caller that wants to know exactly what's missing reads
// `causalGap.missingCausalPredecessorIds`. Nothing here decides what, if
// anything, to do about either answer.
//
// Failure isolation. `causalGapDetector.record()` throws for a genuine
// contract violation (the SAME operationId recorded twice with a
// DIFFERENT predecessor set — see `core/DocumentOperationCausality.js#record()`'s
// own header). That should never happen for a well-behaved sender once
// ReplayGuard has already deduplicated `operationId`, but this class does
// not get to assume a well-behaved sender, a bug-free detector, or a
// caller-supplied detector it does not control. `observe()` itself throws
// for a genuine contract violation, exactly like `detect()`/`record()`
// do — a direct caller gets the same "throw on malformed input" discipline
// every sibling file in this milestone's own lineage already applies.
// `attachToPropagation()` is different: it sits ON the real receive path,
// where a caller cannot un-receive an operation just because observing it
// went wrong, so it isolates every call to `observe()` in its own
// try/catch and never rethrows. A broken detector must never turn into a
// network failure, an operation rejection (that decision was already made,
// upstream, before this class ever sees the operation), or an application
// failure (`RemoteDocumentOperationApplicationUseCase`'s own subscription
// to the identical feed is completely independent and keeps running
// whether or not this class's own callback throws).
//
// Deliberately excluded from this milestone, same as 0.9.228's own list,
// now with one more entry: no operation queue, no buffering, no delayed
// application, no retransmission requests, no automatic predecessor
// retrieval, no retry, no synchronization protocol, no rollback, no
// reordering, no CRDT, no OT, no vector clocks, no conflict resolution, no
// convergence guarantee, no synchronized undo, and — new to this milestone
// — no reaction to a GAP result. Observing and acting are two different
// milestones; see docs/Roadmap.md, 0.9.229's own "Recommendation" for why
// 0.9.230 stays deliberately undecided.
export class DocumentOperationCausalGapObservationUseCase {
    constructor({ causalGapDetector = new DocumentOperationCausalGapDetector() } = {}) {
        if (!causalGapDetector || typeof causalGapDetector.detect !== 'function' || typeof causalGapDetector.record !== 'function') {
            throw new Error('DocumentOperationCausalGapObservationUseCase: a DocumentOperationCausalGapDetector is required');
        }
        this._detector = causalGapDetector;
        this._eventBus = new EventBus();
    }

    // Detects, then records, then publishes — in that order, always, for
    // every call. Returns the descriptor it publishes. Throws exactly
    // when `detect()`/`record()` would throw for the same arguments — see
    // this file's own header on why that's the right posture for a direct
    // caller, and `attachToPropagation()` below for the production path,
    // which never lets such a throw escape.
    observe({ documentId, operationId, causalPredecessors = [] } = {}) {
        const causalGap = this._detector.detect(documentId, { operationId, causalPredecessors });
        this._detector.record(documentId, operationId, causalPredecessors);
        const descriptor = {
            operationId,
            documentId,
            causalPredecessors: [...causalPredecessors],
            causalGap
        };
        this._eventBus.publish(GAP_OBSERVED_EVENT, descriptor);
        return descriptor;
    }

    // Returns an unsubscribe function. Fires the descriptor documented
    // above for every operation this class successfully observed —
    // including a GAP result. Never fires for an operation this replica
    // never accepted in the first place (ReplayGuard already filtered
    // those out upstream, before `onOperationReceived()` ever fires — see
    // `attachToPropagation()` below) and never fires twice for the same
    // delivery.
    onGapObserved(callback) {
        const subscription = this._eventBus.subscribe(GAP_OBSERVED_EVENT, (descriptor) => callback(descriptor));
        return () => subscription.unsubscribe();
    }

    // Wires this boundary directly to a DocumentCommandPropagationUseCase's
    // own `onOperationReceived()` feed — the SAME already-authorized,
    // already-verified, non-replayed operation stream
    // `RemoteDocumentOperationApplicationUseCase#attachToPropagation()`
    // already subscribes to, completely independently. Returns an
    // unsubscribe function, mirroring every other subscription method in
    // this codebase.
    //
    // Deliberately swallows any error `observe()` raises — see this
    // file's own header, "Failure isolation." A caller that wants to know
    // about a failed observation should wrap its OWN `causalGapDetector`
    // rather than rely on this method to surface the failure; this method
    // itself remains silent on error, on purpose, so it can never become
    // a second, unexpected way for `_handleIncoming()`'s shared event bus
    // to break a sibling subscriber.
    attachToPropagation(propagation) {
        if (!propagation || typeof propagation.onOperationReceived !== 'function') {
            throw new Error('DocumentOperationCausalGapObservationUseCase.attachToPropagation(): a DocumentCommandPropagationUseCase is required');
        }
        return propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => {
            try {
                this.observe({ documentId, operationId: command.id, causalPredecessors });
            } catch {
                // See this file's own header, "Failure isolation" — a
                // broken detector must never become a network failure, an
                // operation rejection, or an application failure.
            }
        });
    }
}
