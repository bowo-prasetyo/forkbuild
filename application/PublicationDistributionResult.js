import { WorldEncounterKind } from '../core/WorldEncounter.js';

const INVALID = Symbol('PublicationDistributionResult.INVALID');

// 0.9.48 — Publication Distribution Result Boundary.
//
// 0.9.44 through 0.9.47 built the entire publication-side distribution
// story as three independently callable collaborators — describe, upload,
// publish — deliberately left uncomposed into any automatic sequence.
// 0.9.47's own header named exactly why: "a caller still sequences upload
// → describe → publish itself." That leaves a caller who actually performs
// that sequence with three separate return values in hand — a materialUri
// string, a discoveryEnvelope object, a publish() result — and nothing in
// this codebase that names what recording all three together even looks
// like. This file is that name: a pure boundary for describing WHAT
// HAPPENED during one publication's distribution, built from facts a
// caller already has, never facts this file goes and gets itself.
//
//   application/ArweavePublicationMaterialUploader.js   (0.9.45)
//        uploader.upload(material) -> materialUri | null
//                    │
//                    ▼   { uri: materialUri, storage: uploader.storage }
//
//   application/NostrPublicationDiscoveryPublisher.js   (0.9.46)
//        publisher.publish(envelope) -> { published: true, relayUrl, id } | null
//                    │
//                    ▼   { relayUrl, discoveryTag: publisher.discoveryTag, id }
//
//                    │              │
//                    ▼              ▼
//   application/PublicationDistributionResult.js   ★ (THIS)
//        describePublicationDistributionResult({ publication, material, discovery })
//                    │
//                    ▼
//        { publication: { kind, objectId },
//          material: { uri, storage } | null,
//          discovery: { relayUrl, discoveryTag, id } | null }
//
// A PURE RESULT BOUNDARY, NEVER AN EXECUTION SERVICE — THE SAME RESTRAINT
// `core/DecentralizedDiscoveryEnvelope.js` (0.9.30) AND `application/
// PublicationDistributionDescriptor.js` (0.9.44) ALREADY HOLD, HELD HERE
// ONE LAYER LATER IN THE PIPELINE. `describePublicationDistributionResult()`
// accepts already-produced facts, validates their structural shape,
// normalizes nothing, performs no I/O, performs no retries, performs no
// persistence, performs no verification, and returns a frozen result. It
// never calls `uploader.upload()`, never calls `publisher.publish()`,
// never calls `describePublicationDistribution()`, and never imports any
// of the three 0.9.44/0.9.45/0.9.46 files at all — it has no idea any of
// them exist. A caller who already ran that sequence hands this file the
// leftovers; this file's only job is to say, structurally, what those
// leftovers actually are.
//
// MATERIAL DISTRIBUTION AND DISCOVERY PUBLICATION STAY TWO INDEPENDENT,
// INDEPENDENTLY-ABSENT FACTS — NEVER COLLAPSED INTO ONE BOOLEAN. This is
// the one design decision this whole milestone exists to protect. A
// caller who has only uploaded material and not yet published discovery
// (or whose publish attempt returned `null`) is not "half-failed" or
// "50% successful" — this file has no `status`, `success`, `distributed`,
// or any similar field of any kind. `material` and `discovery` are each
// independently `null` (not yet supplied — a caller genuinely has no fact
// to report for that half) or a validated, frozen fact object. Both being
// `null` is itself a valid result — nothing distributed yet is still
// something this file can honestly describe. This file forms no opinion
// on whether a result with one section present and the other `null`
// counts as "done"; that policy question belongs entirely to a later,
// unscheduled execution/state milestone — see "Deliberately excluded,"
// below.
//
// NO SECOND ENVELOPE, NO SECOND PROTOCOL SHAPE. This file never imports
// `core/DecentralizedDiscoveryEnvelope.js` and never reads or repeats a
// `discoveryEnvelope`'s own `protocol`/`version`/`kind`/`uri` fields —
// `PublicationDistributionDescriptor.js`'s own `discoveryEnvelope` remains
// entirely that file's concern, already published, already gone once
// 0.9.46's own `publish()` accepted it. This file's own `discovery` fact
// is deliberately smaller and different in shape: it names what the
// PUBLISH call reported — `relayUrl` and `id`, exactly
// `NostrPublicationDiscoveryPublisher#publish()`'s own return shape — plus
// `discoveryTag`, the one fact that publisher instance carries but its own
// `publish()` result never repeats (see that file's own header, "a
// discovery tag, never an envelope field"). Duplicating the envelope here
// would give this codebase two competing descriptions of the same
// announcement; referencing only the publish OUTCOME avoids that entirely.
//
// THREE IDENTITIES, NEVER CONFLATED: `material.uri` (where the bytes
// live), `discovery.discoveryTag` (the free-form search accelerator a
// campaign publishes under), and `discovery.relayUrl` (which relay
// accepted the announcement) are three independently supplied facts this
// file never derives from one another and never merges into a single
// field — the identical "material uri, discovery tag, and relay origin
// remain three independently supplied facts" restraint `application/
// PublicationDistributionRuntimeComposition.js`'s own header (0.9.47)
// already holds one layer earlier, protected here at the result layer
// too.
//
// `publication` IS DUCK-TYPED, NEVER A CLASS IMPORT, NEVER RE-VERIFIED —
// THE SAME RESTRAINT `PublicationDistributionDescriptor.js`'s OWN HEADER
// ALREADY HOLDS. This file never imports `Publication` from
// `publisher/Publication.js`, and reads exactly one field off whatever
// `publication` a caller hands it: `id`. Unlike 0.9.44's own descriptor,
// this file never checks for a `signature` — by the time a distribution
// RESULT exists to describe, 0.9.44 has already required and checked one
// to produce the `materialUri`/`discoveryEnvelope` this result's own
// `material`/`discovery` facts trace back to; re-checking it here would be
// this file re-verifying a decision an earlier boundary already made,
// exactly the restraint this whole family holds against redundant
// verification at every layer.
//
// `kind` IS ALWAYS `WorldEncounterKind.PUBLICATION` — NEVER A PARAMETER,
// THE SAME RESTRAINT `PublicationDistributionDescriptor.js`'s OWN HEADER
// ALREADY HOLDS FOR THE IDENTICAL REASON: `publisher/Publication.js`
// remains the only signed structure this codebase can distribute today.
//
// A SUPPLIED BUT MALFORMED SECTION INVALIDATES THE WHOLE RESULT — NEVER
// SILENTLY DROPPED. `material: undefined` or `material: null` means "no
// material fact to report yet," and describes to a `null` section, same
// for `discovery`. But `material: {}`, `material: { uri: '' }`, or any
// other object PRESENT but missing a required field is a caller handing
// this file a fact it cannot honestly describe — the whole call returns
// `null`, exactly the "malformed input degrades to null" discipline this
// entire family already holds, never a partial result with the bad
// section quietly zeroed out.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Every
// value this file returns is `Object.freeze()`'d, at every level; nothing
// passed in is ever mutated. Calling `describePublicationDistributionResult()`
// twice with byte-identical input returns byte-identical (deep-equal)
// output.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any `status`, `success`, `failed`, or `distributed` field, or any
//   policy for computing one from `material`/`discovery`'s own
//   presence.** See "Material distribution and discovery publication stay
//   two independent facts," above — this is an explicit, deliberate
//   omission, not an oversight. A later, unscheduled execution/state
//   milestone may introduce such a policy; this file never does.
// - **Actually calling `uploader.upload()`, `describePublicationDistribution()`,
//   or `publisher.publish()`.** This file only describes results a caller
//   already obtained by calling those itself — see "A pure result
//   boundary, never an execution service," above.
// - **Persisting, storing, or indexing a described result anywhere.**
//   Calling this function has no side effect; nothing it returns is ever
//   written to a `StorageProvider` or any other durable store by this
//   file.
// - **Retrying a failed upload or publish, or deciding whether to.** This
//   file has no opinion on why `material` or `discovery` might be `null`
//   — a caller who never attempted the step, and a caller whose attempt
//   returned `null`, are indistinguishable to this file, and deliberately
//   so; distinguishing "not attempted" from "attempted and declined" is a
//   distribution-EXECUTION concern this milestone does not take on.
// - **Reconciling or comparing two results for the same publication.**
//   This file describes exactly one result, once, from exactly one set of
//   supplied facts — a caller wanting to compare a later result against an
//   earlier one does so with its own equality check; this file offers no
//   `merge()`, `combine()`, or `supersedes()` of any kind.
// - **Verifying that a `material.uri` or `discovery.id` genuinely
//   resolves, confirms, or persists anywhere.** This file records what a
//   caller reports, never what is independently true — the identical
//   "broadcast acceptance is not confirmation" line
//   `ArweavePublicationMaterialUploader.js` and
//   `NostrPublicationDiscoveryPublisher.js` already draw for their own
//   substrates, held here for whatever consumes this file's own output.
// - **Deduplication, aggregation, or multi-relay/multi-substrate rollup of
//   more than one material or discovery fact.** This file describes
//   exactly one material fact and exactly one discovery fact per result —
//   a caller distributing to more than one relay produces more than one
//   `discovery` fact and more than one result, by calling this function
//   more than once; this file never merges them.
// - **A runtime composition wiring this file together with 0.9.47's own
//   `composePublicationDistributionRuntime()`.** Unscheduled — this file
//   has no constructor, no options object, and nothing stateful to
//   compose; it is a single pure function, usable on its own wherever a
//   caller already has the facts.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Pure. Describes ONE material distribution fact — see this file's own
// header, "material distribution and discovery publication stay two
// independent facts." Returns `null` when `material` is missing entirely
// (a caller has no fact to report yet); returns the sentinel `INVALID`
// when `material` is present but malformed (missing/empty `uri`, or a
// present-but-non-string `storage`) — the caller-facing
// `describePublicationDistributionResult()` treats `INVALID` as a reason
// to reject the WHOLE result, never as a reason to drop just this
// section; see "A supplied but malformed section invalidates the whole
// result," above. `storage` is optional and degrades to `null` when
// omitted — this file never infers it from `uri`'s own scheme the way
// `PublicationDistributionDescriptor.js` already does; that inference
// already happened, once, upstream, before this file was ever called.
function describeMaterialFact(material) {
    if (material === undefined || material === null) {
        return null;
    }
    if (!isPlainObject(material) || !isNonEmptyString(material.uri)) {
        return INVALID;
    }
    if (material.storage !== undefined && material.storage !== null && !isNonEmptyString(material.storage)) {
        return INVALID;
    }
    const storage = isNonEmptyString(material.storage) ? material.storage : null;
    return Object.freeze({ uri: material.uri, storage });
}

// Pure. Describes ONE discovery publication fact — see this file's own
// header, "no second envelope, no second protocol shape." Returns `null`
// when `discovery` is missing entirely; returns `INVALID` when `discovery`
// is present but malformed (missing/empty `relayUrl`, `discoveryTag`, or
// `id`) — treated identically to `describeMaterialFact()`'s own `INVALID`
// by the caller-facing function, below.
function describeDiscoveryFact(discovery) {
    if (discovery === undefined || discovery === null) {
        return null;
    }
    if (!isPlainObject(discovery)) {
        return INVALID;
    }
    if (!isNonEmptyString(discovery.relayUrl)) {
        return INVALID;
    }
    if (!isNonEmptyString(discovery.discoveryTag)) {
        return INVALID;
    }
    if (!isNonEmptyString(discovery.id)) {
        return INVALID;
    }
    return Object.freeze({ relayUrl: discovery.relayUrl, discoveryTag: discovery.discoveryTag, id: discovery.id });
}

// Pure. Describes ONE publication distribution result out of
// already-supplied facts — see this file's own header for the full
// contract. Returns `null`, never throws, when `publication` is
// missing/not an object; when `publication.id` is missing, empty, or not
// a string; when `material` is supplied but malformed; or when
// `discovery` is supplied but malformed. `material` and `discovery` are
// each independently optional — omitting either (or passing `null`)
// describes a result whose corresponding section is `null`, never a
// reason to reject the call; see "Material distribution and discovery
// publication stay two independent, independently-absent facts," above.
export function describePublicationDistributionResult({ publication, material, discovery } = {}) {
    if (!publication || typeof publication !== 'object') {
        return null;
    }
    if (!isNonEmptyString(publication.id)) {
        return null;
    }

    const materialFact = describeMaterialFact(material);
    if (materialFact === INVALID) {
        return null;
    }

    const discoveryFact = describeDiscoveryFact(discovery);
    if (discoveryFact === INVALID) {
        return null;
    }

    return Object.freeze({
        publication: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id }),
        material: materialFact,
        discovery: discoveryFact
    });
}
