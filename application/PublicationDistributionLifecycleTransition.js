import { PublicationDistributionState } from './PublicationDistributionLifecycle.js';

const INVALID_FACT = Symbol('PublicationDistributionLifecycleTransition.INVALID_FACT');

// 0.9.51 — Publication Distribution Lifecycle Transition Boundary.
//
// 0.9.50 answered "what facts are present?" — `describePublicationDistributionLifecycle()`
// converts a `PublicationDistributionResult` (0.9.48) into an explicit,
// independently-`ABSENT`/`PRESENT` `{ material, discovery }` description, and
// its own header drew one more line this file exists to cross: "A
// `transition()` function, or any mutable state machine. 0.9.50 describes
// lifecycle facts; a later, unscheduled milestone may introduce how
// lifecycle state changes — this file only names what independently exists
// right now, from one `result`, once." This file is that later milestone.
// It answers a narrower question than "what should happen next?": given a
// lifecycle description a caller already has, and one explicit new fact a
// caller already obtained, what is the next lifecycle description?
//
//   application/PublicationDistributionLifecycle.js   (0.9.50, unmodified)
//        { material:  { state: 'PRESENT' | 'ABSENT', uri?, storage? },
//          discovery: { state: 'PRESENT' | 'ABSENT', origin?, discoveryTag?, id? } }
//                    │
//                    ▼
//   application/PublicationDistributionLifecycleTransition.js   ★ (THIS)
//        transitionPublicationDistributionLifecycle(current, transition)
//        transition = { material: { uri, storage? } }
//                    | { discovery: { origin, discoveryTag, id } }
//                    │
//                    ▼
//        { material, discovery }   (same shape as 0.9.50's own output)
//
// A PURE TRANSITION BOUNDARY, NEVER A LIFECYCLE MANAGER. Given a lifecycle
// description a caller already has (ordinarily 0.9.50's own output, though
// this file never calls `describePublicationDistributionLifecycle()` itself
// and never imports `PublicationDistributionResult.js`, any uploader, or
// any publisher — it has no idea any of them exist) and exactly one
// explicit new fact a caller already obtained, this file produces the next
// lifecycle description. It performs no I/O, no persistence, no retry, no
// clock read, no scheduling, and causes no mutation of any kind — the
// identical restraint every boundary in this family has held since
// `core/DecentralizedDiscoveryEnvelope.js` (0.9.30).
//
// EXACTLY ONE EXPLICIT FACT PER CALL — NEVER BOTH DIMENSIONS AT ONCE, NEVER
// NEITHER. A `transition` names a new fact for `material` XOR `discovery`,
// never both in the same call and never an empty transition with nothing to
// apply — either shape degrades the whole call to `null`, exactly this
// family's "malformed input degrades to null" discipline. A caller wanting
// to transition both dimensions calls this function twice, once per fact,
// exactly as the milestone that requested this file described: "one
// dimension changes without implicitly changing the other."
//
// THE UNTOUCHED DIMENSION IS COPIED THROUGH UNCHANGED, NEVER RECOMPUTED.
// Transitioning `material` returns `current.discovery` exactly as supplied
// — the same frozen object, not a recomputed equivalent — and transitioning
// `discovery` returns `current.material` exactly as supplied. This is the
// one design decision this whole milestone exists to protect, carried
// forward from 0.9.48's and 0.9.50's own founding decision one layer later:
// **a transition of one distribution dimension cannot silently mutate the
// other dimension.**
//
// PROVENANCE IS PRESERVED, NEVER RECONSTRUCTED. This file reads exactly the
// fact a caller supplies — `material: { uri, storage? }` or
// `discovery: { origin, discoveryTag, id }`, the identical vocabulary
// 0.9.50's own output already established (`origin`, not `relayUrl` — this
// file operates entirely at the lifecycle layer, never the
// `PublicationDistributionResult` layer, so there is no `relayUrl` to
// rename here; a caller who obtained a new discovery fact from a fresh
// `PublicationDistributionResult` renames it the same way 0.9.50 already
// does, before calling this file). A material transition never infers
// `material.storage` from `discovery.origin`, and a discovery transition
// never infers `discovery.origin` from `material.uri` — material uri,
// discovery tag, and discovery origin remain three independently supplied
// facts this file never derives from one another, the same restraint every
// file in this family already holds.
//
// REPLACEMENT IS NOT REJECTED, NEVER JUDGED. Transitioning a `PRESENT`
// section replaces its facts with the newly supplied ones — this file
// applies no rule that a `PRESENT` section is final or that a new fact must
// match the old one. Whether a given replacement is operationally
// legitimate (a genuine re-publish to a different relay, versus a mistaken
// overwrite) is a policy question this file does not answer — the same
// "the pure boundary describes the supplied operation; policy decides
// whether the operation should happen" line this codebase's registry
// semantics already draw.
//
// ONLY `ABSENT` AND `PRESENT` — NO REMOVAL, NO WITHDRAWAL. This file offers
// no way to transition a `PRESENT` section back to `ABSENT`. `ABSENT`
// means, and has only ever meant since 0.9.50, "no fact is present in this
// `PublicationDistributionResult`" — it does not mean "withdrawn," and
// turning `PRESENT` into `ABSENT` here would quietly redefine it to mean
// exactly that, introducing the semantic ambiguity 0.9.50's restraint was
// built to avoid. A future, unscheduled withdrawal/removal milestone may
// establish that vocabulary properly; this file does not anticipate it.
//
// SYNCHRONOUS, PURE, FROZEN, DUCK-TYPED. `current` and `transition` are
// read structurally, never checked against any class or `instanceof`, and
// never mutated — neither the sections copied through unchanged nor the
// facts supplied in `transition` are altered in any way. Every value this
// file returns is `Object.freeze()`'d, at every level. Calling
// `transitionPublicationDistributionLifecycle()` twice with byte-identical
// input returns byte-identical (deep-equal) output. This file imports
// nothing from 0.9.44 through 0.9.49, and nothing from any uploader,
// publisher, or storage module.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`PENDING`, `FAILED`, `RETRYING`, `CONFIRMED`, `WITHDRAWN`, or any
//   other operational-interpretation vocabulary.** See 0.9.50's own header
//   — a `PublicationDistributionResult` never records the distinction that
//   vocabulary would require, and neither does a transition applied to its
//   description.
// - **Removal or withdrawal — `PRESENT` transitioning back to `ABSENT`.**
//   See "Only ABSENT and PRESENT," above.
// - **A single overall `status`/`success`/`distributed` field.** See
//   0.9.48's and 0.9.50's own headers — an explicit, deliberate omission
//   carried forward unchanged.
// - **Automatic transitions, or a transition sequenced from executing
//   anything.** This file is a pure function called once per `(current,
//   transition)` pair; it never calls `executePublicationDistribution()`
//   (0.9.49) or any uploader/publisher to obtain the fact it applies — a
//   caller always supplies that fact explicitly, already obtained.
// - **Persistence, storage, or indexing of a lifecycle anywhere, before or
//   after a transition.** Calling this function has no side effect.
// - **Timestamps, retry scheduling, recovery, or compensation of any
//   kind.** This file applies one already-obtained fact; it never decides
//   what should happen next, and never records when a transition occurred.
// - **A transition history, undo, or diff against a previous lifecycle.**
//   This file computes exactly one next description from exactly one
//   current description and one fact, once; it retains no reference to
//   either afterward.
// - **A consistency rule requiring `material` and `discovery` to agree, or
//   forbidding either from existing without the other.** See "The
//   untouched dimension is copied through unchanged," above.
// - **Judging whether a replacement is legitimate.** See "Replacement is
//   not rejected, never judged," above.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Pure. `true` when `section` is a well-formed lifecycle section exactly as
// 0.9.50's own `describeMaterialState()` produces — `{ state: 'ABSENT' }`
// or `{ state: 'PRESENT', uri, storage }` — never re-derived from anywhere
// but `section` itself.
function isValidMaterialSection(section) {
    if (!isPlainObject(section)) {
        return false;
    }
    if (section.state === PublicationDistributionState.ABSENT) {
        return true;
    }
    return section.state === PublicationDistributionState.PRESENT && isNonEmptyString(section.uri);
}

// Pure. Mirrors `isValidMaterialSection()` exactly, for a discovery section
// — `{ state: 'ABSENT' }` or `{ state: 'PRESENT', origin, discoveryTag, id }`.
function isValidDiscoverySection(section) {
    if (!isPlainObject(section)) {
        return false;
    }
    if (section.state === PublicationDistributionState.ABSENT) {
        return true;
    }
    return (
        section.state === PublicationDistributionState.PRESENT &&
        isNonEmptyString(section.origin) &&
        isNonEmptyString(section.discoveryTag) &&
        isNonEmptyString(section.id)
    );
}

// Pure. Builds a `PRESENT` material section from an explicit `{ uri,
// storage? }` fact — see this file's own header, "Provenance is preserved,
// never reconstructed." Returns the sentinel `INVALID_FACT` when `fact` is
// not an object, when `uri` is missing/empty, or when a present `storage`
// is not a non-empty string.
function buildMaterialSection(fact) {
    if (!isPlainObject(fact) || !isNonEmptyString(fact.uri)) {
        return INVALID_FACT;
    }
    if (fact.storage !== undefined && fact.storage !== null && !isNonEmptyString(fact.storage)) {
        return INVALID_FACT;
    }
    const storage = isNonEmptyString(fact.storage) ? fact.storage : null;
    return Object.freeze({ state: PublicationDistributionState.PRESENT, uri: fact.uri, storage });
}

// Pure. Builds a `PRESENT` discovery section from an explicit `{ origin,
// discoveryTag, id }` fact — mirrors `buildMaterialSection()` exactly.
// Returns `INVALID_FACT` when `fact` is not an object or any of the three
// required fields is missing/empty.
function buildDiscoverySection(fact) {
    if (!isPlainObject(fact) || !isNonEmptyString(fact.origin) || !isNonEmptyString(fact.discoveryTag) || !isNonEmptyString(fact.id)) {
        return INVALID_FACT;
    }
    return Object.freeze({
        state: PublicationDistributionState.PRESENT,
        origin: fact.origin,
        discoveryTag: fact.discoveryTag,
        id: fact.id
    });
}

// transitionPublicationDistributionLifecycle(current, transition) ->
//   { material, discovery } | null.
//
// Applies exactly one explicit new fact — `transition.material` or
// `transition.discovery`, never both, never neither — to `current`, a
// lifecycle description in 0.9.50's own `{ material, discovery }` shape.
// The transitioned dimension becomes a fresh `PRESENT` section built from
// the supplied fact; the other dimension is copied through from `current`
// exactly unchanged — see this file's own header, "The untouched dimension
// is copied through unchanged, never recomputed." Returns `null`, never
// throws, when `current` is not a well-formed lifecycle description, when
// `transition` is not an object, when `transition` names both dimensions or
// neither, or when the named fact fails the minimal shape this file itself
// reads.
export function transitionPublicationDistributionLifecycle(current, transition) {
    if (!isPlainObject(current) || !isValidMaterialSection(current.material) || !isValidDiscoverySection(current.discovery)) {
        return null;
    }
    if (!isPlainObject(transition)) {
        return null;
    }

    const hasMaterial = Object.prototype.hasOwnProperty.call(transition, 'material') && transition.material !== undefined;
    const hasDiscovery = Object.prototype.hasOwnProperty.call(transition, 'discovery') && transition.discovery !== undefined;

    if (hasMaterial === hasDiscovery) {
        return null;
    }

    if (hasMaterial) {
        const material = buildMaterialSection(transition.material);
        if (material === INVALID_FACT) {
            return null;
        }
        return Object.freeze({ material, discovery: current.discovery });
    }

    const discovery = buildDiscoverySection(transition.discovery);
    if (discovery === INVALID_FACT) {
        return null;
    }
    return Object.freeze({ material: current.material, discovery });
}
