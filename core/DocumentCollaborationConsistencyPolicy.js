// 0.9.226 — Document Collaboration Consistency Policy Boundary.
//
// 0.9.222 built the trust boundary, 0.9.223 built the explicit
// application seam, 0.9.224 wired both into the real EditorSession
// runtime, and 0.9.225 audited the resulting chain under concurrent and
// out-of-order delivery — against the real, unmodified `broadcastCommand()`/
// `onOperationReceived()`/`apply()`/`attachToPropagation()` chain, never a
// hand-rolled substitute. That audit produced real evidence, not a
// hypothesis: `application/CommandHistory.js` orders strictly by arrival,
// never by causal or send-time order; whether two operations converge is a
// property of the COMMAND's own semantics (delta vs. absolute-set), never
// merely of whether they touch the same object; a replica that never
// receives an operation another replica has diverges permanently with zero
// indication anything is wrong; `replication/ReplayGuard.js` already
// suffices for duplicate/replay idempotency; and undo is local-only and
// origin-blind.
//
// Every one of those findings was, until now, evidence sitting in a test
// file and a Roadmap section — true of the running code, but never named
// as the code's own ARCHITECTURE. This file is that naming, and nothing
// else. It is a pure descriptor: a closed, frozen vocabulary for what
// this codebase's Editor-document collaboration currently guarantees,
// consulted by nothing in `application/`, `peer/`, or `replication/` today
// and required by nothing there either. Nothing here decides anything,
// synchronizes anything, or changes what a single byte of production code
// does. Its only job is to make five previously-implicit properties
// explicit and checkable in one place:
//
//   delivery     — did the operation arrive, and in what order?
//   application  — once arrived and authorized, when is it executed?
//   ordering     — what determines a replica's own CommandHistory order?
//   conflict     — what happens when two operations don't commute?
//   convergence  — do independent replicas end up in the same state?
//
// Two of those — missing-operation detection and duplicate suppression —
// are named as their own fields below because 0.9.225 showed they are NOT
// the same guarantee, even though both sound like "have I already seen
// this": ReplayGuard answers "have I already ACCEPTED this exact
// operationId" (ARCHITECTURE.md-adjacent: replication/ReplayGuard.js's own
// header, "a DIFFERENT question from is this object still eligible to
// affect current state"), and answers it perfectly. Nothing anywhere
// answers "is there an operation another replica has that I never
// received at all" — 0.9.225 Section F proved that gap directly, not by
// inference.
//
// Every value below is graded against 0.9.225's own evidence table,
// referenced by section letter in each enum's own comment. Where 0.9.225
// tested only specific pairs (relative-delta commands commute; an
// absolute-set rename does not), this file does NOT generalize beyond
// that evidence — CONFLICT_RESOLUTION.UNDEFINED names the absence of any
// designed resolution rule, never a claim that every concurrent pair
// necessarily diverges.
//
// Deliberately excluded from this milestone, on purpose — this file
// declares only what already exists; it introduces no new mechanism:
// Lamport/vector clocks, sequence numbers, CRDTs, OT, operation queues,
// buffering, retry, offline replay, missing-operation requests, automatic
// conflict resolution, last-writer-wins as a DESIGNED rule (as opposed to
// the emergent, undesigned side effect of arrival order 0.9.225 observed),
// synchronized undo, locking, operation transformation, or operation
// rebasing. Choosing any of those is explicitly the NEXT decision, made
// once this policy's own current values are the ones a future milestone
// deliberately changes — see docs/Roadmap.md, 0.9.226, "Recommendation."
//
// Every enum below is a closed, single-current-value vocabulary in the
// same shape `core/DocumentOperationEnvelope.js#DocumentOperationKind`
// already uses for its own (currently single-valued) `kind` field —
// modeled as a vocabulary, not a boolean or a bare string, so a future
// milestone that actually builds causal delivery, deterministic
// convergence, or a designed conflict rule adds a new member to the
// relevant enum and reassigns one field in the policy object below,
// rather than reshaping this file's own contract.

export const DeliveryOrderGuarantee = Object.freeze({
    // 0.9.225's own "Transport observation": two operations sent
    // back-to-back happened to arrive in send order only because
    // `peer/LocalPeerConnectionProvider.js#send()` queues each message via
    // its own `queueMicrotask()` call, and microtasks run FIFO — an
    // accident of ONE in-memory transport, never a property
    // `core/DocumentOperationEnvelope.js` declares (it carries no
    // `logicalClock`/sequence number) or `DocumentCommandPropagationUseCase`
    // enforces.
    NOT_GUARANTEED: 'not_guaranteed'
});

export const RemoteApplicationTiming = Object.freeze({
    // `RemoteDocumentOperationApplicationUseCase#apply()` calls
    // `target.commandHistory.execute(command)` synchronously, the instant
    // an authorized, non-replayed operation is observed — no queue, no
    // buffering, no deferred-application window (0.9.223's own header;
    // reaffirmed by 0.9.225 Sections A/G/I, every one of which observes
    // the effect immediately after delivery).
    IMMEDIATE: 'immediate'
});

export const HistoryOrderingBasis = Object.freeze({
    // 0.9.225 Section B: reversed delivery of the identical operation pair
    // lands in the reverse `CommandHistory` position from forward
    // delivery. `CommandHistory#execute()` (application/CommandHistory.js)
    // has no concept of causal time, send time, or logical clock — it
    // only ever knows "what was executed on THIS replica, and in what
    // sequence."
    ARRIVAL_ORDER: 'arrival_order'
});

export const ConcurrentConflictResolution = Object.freeze({
    // 0.9.225 Section D1: two ABSOLUTE-SET operations on the same target
    // (`RenameGroupCommand`), delivered in opposite order to two
    // replicas, resolve to two permanently different final values —
    // "last-applied-wins" here is an emergent side effect of
    // `CommandHistory#execute()` always executing whatever arrives, never
    // a resolution rule anything in this codebase was designed to
    // provide. No conflict is ever detected, surfaced, or reconciled.
    UNDEFINED: 'undefined'
});

export const MissingOperationDetection = Object.freeze({
    // 0.9.225 Section F: two replicas that receive genuinely different
    // SETS of operations (not merely the same set in different order)
    // diverge with zero indication anything is wrong — no error, no gap
    // counter, no retry, nothing recorded that would let either replica
    // learn it is missing something the other has.
    NONE: 'none'
});

export const DuplicateOperationSuppression = Object.freeze({
    // 0.9.225 Section J: the EXISTING `replication/ReplayGuard.js`
    // (consumed inside `DocumentCommandPropagationUseCase`, unmodified
    // since 0.9.222) already makes a retransmitted `operationId` — or an
    // "O1, O2, O1" sequence — collapse to exactly one application, every
    // time. Deliberately named as its OWN field, separate from
    // `missingOperations` above: "have I already accepted this exact
    // operation" and "am I missing an operation someone else has" sound
    // adjacent but are answered by entirely different mechanisms today —
    // one exists, the other does not.
    GUARANTEED: 'guaranteed'
});

export const LocalUndoScope = Object.freeze({
    // 0.9.225 Section H: `CommandHistory#undo()`/`redo()` act on the
    // undoing replica's OWN stack only — local and remote commands sit on
    // one stack with no origin tag (0.9.225 Section G), and undo reverts
    // whatever is on top of THAT replica's own history, never anything
    // about another replica's state.
    LOCAL_ONLY: 'local_only'
});

export const LocalUndoPropagation = Object.freeze({
    // `CommandHistory#undo()` publishes `COMMAND_UNDONE`
    // (application/events/CommandHistoryEvent.js), which
    // `DocumentCommandPropagationUseCase#attachCommandHistory()` never
    // subscribes to (see that method's own header) — an undo is never
    // broadcast. 0.9.225 Section H proved this directly: Charlie, who
    // received the identical operation Bob later undid locally, is
    // completely unaffected.
    NEVER: 'never'
});

export const DocumentIsolationGuarantee = Object.freeze({
    // 0.9.223/0.9.224 established this at the sequential switch-away/
    // switch-back level; 0.9.225 Section I re-proved it under genuinely
    // INTERLEAVED concurrent delivery across two open documents — an
    // operation addressed at a document the receiver is not currently
    // looking at is refused `UNKNOWN_DOCUMENT` and permanently forgotten,
    // never queued for replay on switch-back, regardless of interleaving
    // pattern.
    GUARANTEED: 'guaranteed'
});

export const ReplicaConvergenceGuarantee = Object.freeze({
    // The composite of every field above: because ordering is
    // arrival-order-only, conflict resolution for non-commuting
    // operations is undefined, and missing operations are never
    // detected, two authorized, honest replicas that both correctly
    // apply everything they are told can still end up in permanently
    // different states (0.9.225 Sections D1 and F, independently).
    // "Convergence" here means exactly this codebase's own documented
    // sense: two replicas that received the SAME set of operations,
    // regardless of order, reach the SAME World state. That is a
    // narrower and more precise claim than any statement about undo-stack
    // shape or about replicas that were never told the same things in the
    // first place — see this file's own header, and 0.9.225 Section B, for
    // why "value converged" and "undo-stack converged" are two different
    // claims this codebase only ever guarantees the first of, and even
    // that one only for commuting command pairs.
    NOT_GUARANTEED: 'not_guaranteed'
});

// The policy itself: one frozen, nested descriptor, never mutated,
// constructed, or parameterized — there is exactly one instance, because
// there is exactly one current answer to each of these questions across
// this entire codebase today. A future milestone that actually changes
// one of these guarantees edits the relevant field's OWN value (and,
// where the new behavior needs a vocabulary member that doesn't exist
// yet, adds one to that field's own enum above) — it does not add a
// constructor, a second instance, or a per-document override, none of
// which anything in this codebase's Editor-collaboration chain has any
// concept of today.
export const DOCUMENT_COLLABORATION_CONSISTENCY_POLICY = Object.freeze({
    delivery: Object.freeze({
        order: DeliveryOrderGuarantee.NOT_GUARANTEED
    }),
    application: Object.freeze({
        remote: RemoteApplicationTiming.IMMEDIATE
    }),
    history: Object.freeze({
        orderingBasis: HistoryOrderingBasis.ARRIVAL_ORDER
    }),
    conflict: Object.freeze({
        nonCommutingOperations: ConcurrentConflictResolution.UNDEFINED
    }),
    missingOperations: Object.freeze({
        detection: MissingOperationDetection.NONE
    }),
    duplicateOperations: Object.freeze({
        suppression: DuplicateOperationSuppression.GUARANTEED
    }),
    undo: Object.freeze({
        scope: LocalUndoScope.LOCAL_ONLY,
        propagation: LocalUndoPropagation.NEVER
    }),
    isolation: Object.freeze({
        acrossDocuments: DocumentIsolationGuarantee.GUARANTEED
    }),
    convergence: Object.freeze({
        guaranteed: ReplicaConvergenceGuarantee.NOT_GUARANTEED
    })
});
