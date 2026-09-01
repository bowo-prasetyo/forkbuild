export const PublicationDistributionState = Object.freeze({
    ABSENT: 'ABSENT',
    PRESENT: 'PRESENT'
});

// 0.9.50 — Publication Distribution Lifecycle State Boundary.
//
// 0.9.48 named what a distribution produced — a `PublicationDistributionResult`
// with independently-nullable `material`/`discovery` sections — and deliberately
// refused to answer one further question, naming the refusal explicitly in its
// own header: "This file forms no opinion on whether a result with one section
// present and the other `null` counts as 'done'; that policy question belongs
// entirely to a later, unscheduled execution/state milestone." 0.9.49 sequenced
// the collaborators that PRODUCE a `PublicationDistributionResult` and held the
// identical restraint one layer later: "This file forms no opinion on whether
// the result it returns 'counts as done'." This file is that later milestone,
// answering only the question both of those headers left open — nothing more.
//
//   application/PublicationDistributionResult.js   (0.9.48, unmodified)
//        { publication, material: { uri, storage } | null,
//                       discovery: { relayUrl, discoveryTag, id } | null }
//                    │
//                    ▼
//   application/PublicationDistributionLifecycle.js   ★ (THIS)
//        describePublicationDistributionLifecycle(result)
//                    │
//                    ▼
//        { material:  { state: 'PRESENT' | 'ABSENT', uri?, storage? },
//          discovery: { state: 'PRESENT' | 'ABSENT', origin?, id? } }
//
// A PURE LIFECYCLE-DESCRIPTION BOUNDARY, NEVER A LIFECYCLE MANAGER. Given a
// `PublicationDistributionResult` a caller already has in hand,
// `describePublicationDistributionLifecycle()` converts the facts already
// present in it into an explicit lifecycle description. It never calls
// `describePublicationDistributionResult()` (0.9.48), never calls
// `executePublicationDistribution()` (0.9.49), never imports either file,
// and never re-derives a fact from anything other than the `result` it is
// handed. It performs no I/O, no persistence, no retry, no clock read, and
// causes no mutation of any kind — the identical restraint every boundary in
// this family has held since `core/DecentralizedDiscoveryEnvelope.js` (0.9.30).
//
// MATERIAL AND DISCOVERY STATE STAY INDEPENDENT — NEVER COLLAPSED INTO ONE
// GLOBAL LIFECYCLE VALUE. This is the one design decision this whole milestone
// exists to protect, carried forward unchanged from 0.9.48's own founding
// decision one layer later. There is no single `"DISTRIBUTED"` /
// `"PARTIALLY_DISTRIBUTED"` / `"NOT_DISTRIBUTED"` value anywhere in this
// file's output — `material.state` and `discovery.state` are each computed
// independently, from that section's own presence in `result` alone, and nothing
// combines them into an overall verdict. All four combinations of
// `ABSENT`/`PRESENT` across the two dimensions are valid, equally well-formed
// output, including `{ material: PRESENT, discovery: ABSENT }` (0.9.49's
// "ordinary Nostr decline after a successful Arweave upload" scenario, the
// scenario this milestone was explicitly asked to preserve) and the
// deliberately-tested-anyway `{ material: ABSENT, discovery: PRESENT }` —
// this file imposes no rule that discovery cannot exist without material;
// it only reports what `result` itself already states.
//
// ONLY TWO STATES, ON PURPOSE: `ABSENT` AND `PRESENT`. No `PENDING`,
// `FAILED`, `RETRYING`, `CONFIRMED`, or `WITHDRAWN` value is introduced —
// see "Deliberately excluded," below, for the full reasoning already laid
// out in this milestone's own request. `result.material === null` (or
// `result.discovery === null`) describes to `{ state: 'ABSENT' }`, full
// stop; this file forms no opinion on WHY that section is `null` — not
// attempted, declined, failed, or anything else — because a
// `PublicationDistributionResult` itself never records that distinction
// (0.9.48's own header: "a caller who never attempted the step, and a
// caller whose attempt returned `null`, are indistinguishable... and
// deliberately so"). This file cannot answer a question its own input
// never carries an answer to, and does not pretend otherwise.
//
// PROVENANCE IS PRESERVED, NEVER RECONSTRUCTED. When a section's state is
// `PRESENT`, this file copies that section's own already-validated facts
// through unchanged: `material.uri`/`material.storage` and
// `discovery.origin`/`discovery.id` (`origin` is `result.discovery.relayUrl`,
// renamed for readability at this layer only — the value itself is never
// altered) come straight from `result.material`/`result.discovery`. This
// file never regenerates a `uri` from a `discoveryTag`, never regenerates an
// `origin` from a `uri`, and never reads or repeats `result.discovery.discoveryTag`
// under a different name than the one already established — `discoveryTag`
// is forwarded as `discoveryTag`, exactly as `result` already names it,
// alongside `origin` and `id`. Material uri, discovery tag, and relay
// origin remain three independently supplied facts this file never derives
// from one another — the same restraint `PublicationDistributionRuntimeComposition.js`
// (0.9.47) and `PublicationDistributionResult.js` (0.9.48) already hold,
// carried forward one layer later.
//
// INVALID INPUT DEGRADES TO `null` — NEVER THROWS, NEVER GUESSES A DEFAULT.
// A `result` that is missing, not an object, or whose `material`/`discovery`
// section is present-but-not-`null` yet fails 0.9.48's own already-established
// shape (missing/empty `uri`, or a `discovery` missing `relayUrl`/`discoveryTag`/`id`)
// is not a lifecycle this file can honestly describe — the whole call
// returns `null`, the identical "malformed input degrades to null"
// discipline this entire family already holds. This file does not repeat
// 0.9.48's own structural validation out of paranoia; it re-checks the
// minimal shape it itself reads (`uri` a non-empty string when `material`
// is non-null; `relayUrl`/`discoveryTag`/`id` each non-empty strings when
// `discovery` is non-null) purely so a `result` object assembled by hand
// (rather than actually produced by `describePublicationDistributionResult()`)
// cannot silently produce a lifecycle describing facts that were never
// really there.
//
// SYNCHRONOUS, PURE, FROZEN, DUCK-TYPED. `result` is read structurally —
// `result.material`, `result.discovery` — never checked against any class
// or `instanceof`, and never mutated. Every value this file returns is
// `Object.freeze()`'d, at every level. Calling
// `describePublicationDistributionLifecycle()` twice with byte-identical
// input returns byte-identical (deep-equal) output. This file imports
// nothing from 0.9.44 through 0.9.49, and nothing from any uploader,
// publisher, or storage module — it has no idea any of them exist, and
// needs none of them to do its own job.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`PENDING`, `FAILED`, `RETRYING`, `CONFIRMED`, `WITHDRAWN`, or any other
//   operational-interpretation vocabulary.** An `ABSENT` discovery state
//   does not mean "failed permanently," "temporarily unavailable," "not
//   attempted," "intentionally unpublished," or "relay rejected it" — this
//   file has no way to know which, because `PublicationDistributionResult`
//   itself never records that distinction, and this milestone does not
//   invent a way to record it either.
// - **A single overall `status`/`success`/`distributed` field collapsing
//   `material`/`discovery` into one value.** See "Material and discovery
//   state stay independent," above — an explicit, deliberate omission.
// - **Automatic transitions of any kind.** This file is a pure function
//   called once per `result`; it holds no reference to a previous lifecycle
//   description and computes no diff or transition against one.
// - **Persistence, storage, or indexing of a described lifecycle anywhere.**
//   Calling this function has no side effect.
// - **Timestamps, retry scheduling, recovery, rollback, or compensation of
//   any kind.** This file describes facts that already exist in `result`;
//   it never decides what should happen next.
// - **Multi-relay aggregation, Arweave confirmation checks, or Nostr relay
//   health.** `result.discovery` already names at most one relay's outcome
//   (0.9.46's own "one relay per instance" restraint); this file adds no
//   verification, aggregation, or health assessment on top of that single
//   fact.
// - **Distributed consistency, or any rule that discovery cannot exist
//   without material (or vice versa).** See "Material and discovery state
//   stay independent," above — a future, unscheduled consistency validator
//   may establish such a relationship; this file preserves the facts
//   supplied to it instead.
// - **A `transition()` function, or any mutable state machine.** 0.9.50
//   describes lifecycle facts; a later, unscheduled milestone may introduce
//   how lifecycle state changes — this file only names what independently
//   exists right now, from one `result`, once.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Pure. Describes ONE material distribution state — see this file's own
// header, "material and discovery state stay independent." Returns
// `{ state: 'ABSENT' }` when `material` is `null`/`undefined`, the sentinel
// `INVALID_SECTION` when `material` is present but fails the minimal shape
// this file itself reads, or the frozen `PRESENT` description otherwise.
const INVALID_SECTION = Symbol('PublicationDistributionLifecycle.INVALID_SECTION');

function describeMaterialState(material) {
    if (material === undefined || material === null) {
        return Object.freeze({ state: PublicationDistributionState.ABSENT });
    }
    if (!isPlainObject(material) || !isNonEmptyString(material.uri)) {
        return INVALID_SECTION;
    }
    const storage = isNonEmptyString(material.storage) ? material.storage : null;
    return Object.freeze({ state: PublicationDistributionState.PRESENT, uri: material.uri, storage });
}

// Pure. Describes ONE discovery publication state — mirrors
// `describeMaterialState()` above, exactly. `relayUrl` is exposed as
// `origin` at this layer for readability only; the underlying value is
// never altered. `discoveryTag` and `id` are forwarded unchanged, under
// their own already-established names — see this file's own header,
// "Provenance is preserved, never reconstructed."
function describeDiscoveryState(discovery) {
    if (discovery === undefined || discovery === null) {
        return Object.freeze({ state: PublicationDistributionState.ABSENT });
    }
    if (!isPlainObject(discovery) || !isNonEmptyString(discovery.relayUrl) || !isNonEmptyString(discovery.discoveryTag) || !isNonEmptyString(discovery.id)) {
        return INVALID_SECTION;
    }
    return Object.freeze({
        state: PublicationDistributionState.PRESENT,
        origin: discovery.relayUrl,
        discoveryTag: discovery.discoveryTag,
        id: discovery.id
    });
}

// describePublicationDistributionLifecycle(result) ->
//   { material: { state, uri?, storage? }, discovery: { state, origin?, discoveryTag?, id? } }
//   | null.
//
// Converts the facts already present in a `PublicationDistributionResult`
// (0.9.48) into an explicit lifecycle description — see this file's own
// header for the full contract. Returns `null`, never throws, when `result`
// is missing/not an object, or when a present `material`/`discovery`
// section fails the minimal shape this file itself reads. `material` and
// `discovery` are each independently `null`-safe on `result` — a `result`
// with either or both sections `null` describes successfully, with that
// dimension's `state` set to `'ABSENT'`; see "Material and discovery state
// stay independent," above.
export function describePublicationDistributionLifecycle(result) {
    if (!isPlainObject(result)) {
        return null;
    }

    const material = describeMaterialState(result.material);
    if (material === INVALID_SECTION) {
        return null;
    }

    const discovery = describeDiscoveryState(result.discovery);
    if (discovery === INVALID_SECTION) {
        return null;
    }

    return Object.freeze({ material, discovery });
}
