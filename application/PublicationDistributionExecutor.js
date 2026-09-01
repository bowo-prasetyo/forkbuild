import { describePublicationDistributionResult } from './PublicationDistributionResult.js';

// 0.9.49 — Publication Distribution Execution Boundary.
//
// 0.9.44 through 0.9.48 built every piece of the publication-side
// distribution story except one: something that actually runs the
// sequence. `PublicationDistributionDescriptor.js` (0.9.44) turns a signed
// Publication plus a `materialUri` into a discovery envelope, no I/O.
// `ArweavePublicationMaterialUploader.js` (0.9.45) turns serialized
// material into that `materialUri`, real I/O. `NostrPublicationDiscoveryPublisher.js`
// (0.9.46) turns a discovery envelope into a Nostr event, real I/O.
// `PublicationDistributionRuntimeComposition.js` (0.9.47) builds the three
// collaborators together but explicitly refused to sequence them — its own
// header names why: "what happens when the upload succeeds but the publish
// fails... every one of those is a distribution-EXECUTION... question, not
// a composition question." `PublicationDistributionResult.js` (0.9.48)
// names what a completed (or partially completed) sequence produced, but
// never runs one — its own header: "a pure result boundary, never an
// execution service." This file is the piece every one of those four
// headers pointed at and declined to be: the thinnest possible sequencing
// of already-existing collaborators, still with no policy of its own.
//
//   Signed Publication + serialized material   (a caller already has both —
//        │                                       this file never signs or
//        │                                       serializes anything, see
//        │                                       "Deliberately excluded," below)
//        ▼
//   application/PublicationDistributionExecutor.js   ★ (THIS)
//        executePublicationDistribution({
//            publication, serializedMaterial, materialStorage,
//            materialUploader, distributionDescriptor, discoveryPublisher
//        })
//        │
//        ├──► materialUploader.upload(serializedMaterial)   (0.9.45's own upload(), unmodified)
//        │        │
//        │        ▼   materialUri | null
//        │
//        ├──► distributionDescriptor({ publication, materialUri, materialStorage })   (0.9.44's own describePublicationDistribution, unmodified)
//        │        │
//        │        ▼   { material, discoveryEnvelope } | null
//        │
//        ├──► discoveryPublisher.publish(discoveryEnvelope)   (0.9.46's own publish(), unmodified)
//        │        │
//        │        ▼   { published: true, relayUrl, id } | null
//        │
//        └──► describePublicationDistributionResult({ publication, material, discovery })   (0.9.48, unmodified)
//                 │
//                 ▼
//        PublicationDistributionResult
//
// COLLABORATORS ARE INJECTED, NEVER IMPORTED CONCRETE — THE ONE DEPARTURE
// FROM 0.9.47's OWN APPROACH, DELIBERATE. `PublicationDistributionRuntimeComposition.js`
// imports `ArweavePublicationMaterialUploader` and `NostrPublicationDiscoveryPublisher`
// directly, because building them together is that file's entire job. This
// file's job is different — sequencing calls, not choosing implementations
// — so `materialUploader`, `distributionDescriptor`, and `discoveryPublisher`
// arrive as parameters, duck-typed exactly like every other collaborator in
// this whole family. A caller most naturally supplies the object 0.9.47's
// own `composePublicationDistributionRuntime()` already returns —
// `runtime.uploader`, `runtime.describeDistribution`, `runtime.publisher` —
// but this file never imports 0.9.47 either, and never checks an
// `instanceof` against any of 0.9.45/0.9.46's own classes. Only
// `describePublicationDistributionResult()` (0.9.48) is imported directly,
// because it — like `distributionDescriptor` itself — is a plain, pure,
// dependency-free function with no constructor to inject around; the same
// reasoning 0.9.47's own header already gives for forwarding
// `describePublicationDistribution` unwrapped rather than requiring a
// caller to inject it too. This keeps the dependency direction 0.9.44
// through 0.9.48 already established — a caller depends on this file, this
// file depends on 0.9.48's own pure function, and nothing here depends on
// which Arweave gateway or which Nostr relay a caller actually chose.
//
// SEQUENCING, NEVER A TRANSACTION. If material upload succeeds and
// discovery publish fails, this file does not delete the uploaded
// material, does not retry the publish, and does not roll anything back.
// It has no `try`/`catch` around either collaborator call for that
// purpose, and issues no compensating call of any kind. See "Genuine
// failure propagates, ordinary decline composes," below, for the one place
// this file DOES branch on an outcome — and even there, branching means
// "stop calling the next collaborator," never "undo the previous one."
//
// PARTIAL COMPLETION IS A FACT TO REPORT, NEVER A STATUS TO COMPUTE. This
// file never introduces `PENDING`/`PARTIAL_SUCCESS`/`FAILED`/`DISTRIBUTED`
// or any other execution-state vocabulary — the exact restraint 0.9.48's
// own header already holds one layer earlier, extended here to the act of
// actually running the sequence. Whatever material/discovery facts this
// file actually has in hand at the point a sequence stops — both, one, or
// neither — are handed to `describePublicationDistributionResult()`
// exactly as documented there: `material` and `discovery` each
// independently `null` or a validated fact, never collapsed into a
// boolean. This file forms no opinion on whether the result it returns
// "counts as done"; that policy remains exactly where 0.9.48 left it, for
// an unscheduled later milestone.
//
// STOP-ON-FAILURE ORDERING: UPLOAD, THEN DESCRIBE, THEN PUBLISH — EACH
// STEP ONLY RUNS IF THE ONE BEFORE IT PRODUCED SOMETHING TO BUILD ON.
// - `materialUploader.upload()` resolves `null` (0.9.45's own "not
//   currently uploadable," never a distinguished status) → this file never
//   calls `distributionDescriptor` — there is no `materialUri` to build a
//   descriptor from — and returns whatever `describePublicationDistributionResult({
//   publication, material: null, discovery: null })` reports.
// - `distributionDescriptor()` returns `null` (0.9.44's own "malformed
//   input degrades to null" — normally a malformed/unsigned `publication`,
//   since `materialUri` itself is already known-good at this point) → this
//   file never calls `discoveryPublisher.publish()` — there is no
//   `discoveryEnvelope` to publish — but the material fact already
//   obtained IS still reported: `describePublicationDistributionResult({
//   publication, material: { uri: materialUri, storage }, discovery: null
//   })`. The upload genuinely happened; this file never pretends it did
//   not just because a later step could not proceed.
// - `discoveryPublisher.publish()` resolves `null` (0.9.46's own "the
//   relay declined," collapsed identically to malformed input on that
//   file's own terms) → the material fact is still reported, `discovery`
//   is `null`: `describePublicationDistributionResult({ publication,
//   material, discovery: null })`.
//
// THE DESCRIPTOR'S OWN ENVELOPE IS FORWARDED, NEVER RECONSTRUCTED — ONE
// AUTHORITATIVE CONSTRUCTION POINT. `distribution.discoveryEnvelope` — the
// exact value `describePublicationDistribution()` (0.9.44) already built —
// is what gets handed to `discoveryPublisher.publish()`, unmodified, un-
// re-derived. This file contains no `protocol`/`version`/`kind`/`objectId`/
// `uri` literal of its own and never imports `core/DecentralizedDiscoveryEnvelope.js`
// — 0.9.44 remains the only file in this codebase that ever builds one.
// Likewise, this file never re-infers `material.storage` from
// `materialUri`'s own scheme once a descriptor call has succeeded — it
// reads `distribution.material.uri`/`distribution.material.storage`
// straight off 0.9.44's own already-computed result. `materialStorage` is
// consulted directly by this file only in the one case 0.9.44 never ran at
// all (the descriptor itself failed) — see "Stop-on-failure ordering,"
// above — where it degrades to whatever self-identifying `storage` the
// `materialUploader` itself exposes (mirroring `ArweavePublicationMaterialUploader`'s
// own `storage` getter), or `null` if neither is available.
//
// GENUINE FAILURE PROPAGATES, ORDINARY DECLINE COMPOSES — THE SAME LINE
// EVERY COLLABORATOR IN THIS FAMILY ALREADY DRAWS FOR ITSELF, NEVER
// FLATTENED HERE. This file wraps neither `materialUploader.upload()` nor
// `discoveryPublisher.publish()` in a `try`/`catch`. A `materialUploader`
// resolving `null`, or a `discoveryPublisher` resolving `null`, is an
// ordinary, expected outcome this file composes into its own result,
// exactly as documented above. A `materialUploader` or `discoveryPublisher`
// call REJECTING — no wallet, no connectivity, a relay or gateway timeout,
// or either collaborator throwing because it received input violating its
// own contract — is not caught, not converted to a `null` section, and not
// retried; it propagates to this file's own caller unchanged, exactly
// `ArweavePublicationMaterialUploader`'s and `NostrPublicationDiscoveryPublisher`'s
// own headers already draw this same distinction for themselves.
//
// COLLABORATOR CONTRACT VIOLATIONS ARE CAUGHT AT THE START, NOT DISCOVERED
// MID-SEQUENCE. Before any collaborator is ever called, this file checks
// that `materialUploader` exposes an `upload` function, `distributionDescriptor`
// is itself a function, and `discoveryPublisher` exposes both a `publish`
// function and a non-empty `discoveryTag` — and throws immediately if any
// is missing. This is a wiring/configuration failure, not a distribution
// outcome, the same "a misconfigured caller fails loudly at composition
// time" restraint `PublicationDistributionRuntimeComposition.js`'s own
// header already holds for its own constructor calls, held here for this
// file's own collaborator parameters instead.
//
// NEITHER SIGNS NOR SERIALIZES A PUBLICATION — `serializedMaterial` IS
// SUPPLIED, NEVER PRODUCED. `ArweavePublicationMaterialUploader`'s own
// header already draws this line for itself — "serialized material is
// supplied, never produced... this file never imports Publication." This
// file forwards `serializedMaterial` to `materialUploader.upload()`
// exactly as received; it never calls `JSON.stringify()`, never reads
// `publication.toJSON()`, and never touches `publication.signature` for
// any purpose of its own — `publication` is passed through to
// `distributionDescriptor()` and `describePublicationDistributionResult()`
// untouched, each of which already owns whatever validation it performs.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Retries of any kind, for either the upload or the publish step.**
//   Neither 0.9.45 nor 0.9.46 retries on its own; this file adds none.
// - **Rollback or compensation** — un-uploading material after a later
//   publish failure, un-publishing a Nostr event after some later concern,
//   or deciding an already-uploaded `materialUri` should be reused or
//   discarded. See "Sequencing, never a transaction," above.
// - **Persistence of any kind.** This file returns a
//   `PublicationDistributionResult`; it never writes one to a
//   `StorageProvider` or anywhere else.
// - **A distribution state machine, or any `PENDING`/`DISTRIBUTED`/
//   `PARTIALLY_DISTRIBUTED`/`FAILED`/`WITHDRAWN` vocabulary.** See "Partial
//   completion is a fact to report, never a status to compute," above —
//   explicitly deferred to a later, unscheduled milestone.
// - **A job queue or any scheduling of when `executePublicationDistribution()`
//   runs.** This file is one function, called once per invocation, by a
//   caller who decides entirely for itself when and how often to call it.
// - **Multi-relay fan-out, relay selection, or relay preference/fallback
//   policy.** Exactly one `discoveryPublisher` is consulted per call — the
//   same "one relay per instance" restraint 0.9.46's own header already
//   holds; a caller wanting a second relay calls this function again with a
//   second `discoveryPublisher`.
// - **Arweave transaction confirmation tracking, or Nostr event
//   confirmation/retention tracking.** A successful `upload()` or
//   `publish()` already means only "the substrate accepted this for
//   broadcast," never confirmed truth — the identical "broadcast
//   acceptance is not confirmation" line both 0.9.45's and 0.9.46's own
//   headers already draw; this file adds no verification on top.
// - **Deduplication or caching of any kind** — of uploads, of publishes, or
//   of results. Every call to `executePublicationDistribution()` runs the
//   full sequence fresh.
// - **Automatically serializing or signing a Publication.** See "Neither
//   signs nor serializes a Publication," above — `serializedMaterial`
//   remains entirely a caller's own, prior concern.
// - **Wallet or key management of any kind.** Neither this file nor either
//   collaborator it calls generates, stores, or handles key material — see
//   0.9.45's and 0.9.46's own headers, unchanged here.
// - **Trust, ranking, or success-policy calculation of any kind** — this
//   file computes no score, weight, or preference from whatever `material`/
//   `discovery` facts a call happens to produce.
// - **A runtime composition wiring a caller's own `materialUploader`/
//   `distributionDescriptor`/`discoveryPublisher` together for it.** 0.9.47
//   already fills that role for the three concrete collaborators most
//   callers will actually use; this file only accepts whatever a caller
//   already assembled.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// executePublicationDistribution({ publication, serializedMaterial,
//   materialStorage, materialUploader, distributionDescriptor,
//   discoveryPublisher }) -> Promise<PublicationDistributionResult | null>.
//
// Sequences `materialUploader.upload()`, `distributionDescriptor()`, and
// `discoveryPublisher.publish()` — see this file's own header, "Stop-on-
// failure ordering," for exactly which steps run and which are skipped
// depending on what the previous step produced — and composes whatever
// `material`/`discovery` facts were actually obtained into one
// `describePublicationDistributionResult()` call (0.9.48, unmodified). The
// promise resolves to `null` only when 0.9.48's own validation rejects the
// assembled facts (most commonly a malformed/missing `publication`); it
// never resolves to `null` merely because `material` or `discovery`
// individually ended up `null` — see "Partial completion is a fact to
// report," above. Throws synchronously, before any collaborator is called
// or any I/O occurs, when `materialUploader`, `distributionDescriptor`, or
// `discoveryPublisher` fails the minimal duck-typed contract check
// documented above; a promise returned by this function rejects only when
// `materialUploader.upload()` or `discoveryPublisher.publish()` itself
// rejects or throws — see "Genuine failure propagates, ordinary decline
// composes," above.
export function executePublicationDistribution({
    publication,
    serializedMaterial,
    materialStorage,
    materialUploader,
    distributionDescriptor,
    discoveryPublisher
} = {}) {
    if (!materialUploader || typeof materialUploader.upload !== 'function') {
        throw new Error('executePublicationDistribution: a materialUploader with an upload() method is required');
    }
    if (typeof distributionDescriptor !== 'function') {
        throw new Error('executePublicationDistribution: a distributionDescriptor function is required');
    }
    if (!discoveryPublisher || typeof discoveryPublisher.publish !== 'function') {
        throw new Error('executePublicationDistribution: a discoveryPublisher with a publish() method is required');
    }
    if (!isNonEmptyString(discoveryPublisher.discoveryTag)) {
        throw new Error('executePublicationDistribution: discoveryPublisher must expose a non-empty discoveryTag');
    }

    return runPublicationDistribution({ publication, serializedMaterial, materialStorage, materialUploader, distributionDescriptor, discoveryPublisher });
}

// The actual async sequence — split out of executePublicationDistribution()
// itself so that collaborator-contract validation (above) throws
// synchronously, on the caller's own call stack, before this function's own
// first `await` ever suspends execution; see this file's own header,
// "Collaborator contract violations are caught at the start, not discovered
// mid-sequence."
async function runPublicationDistribution({
    publication,
    serializedMaterial,
    materialStorage,
    materialUploader,
    distributionDescriptor,
    discoveryPublisher
}) {
    const materialUri = await materialUploader.upload(serializedMaterial);
    if (materialUri === null) {
        return describePublicationDistributionResult({ publication, material: null, discovery: null });
    }

    const uploadedStorage = isNonEmptyString(materialStorage)
        ? materialStorage
        : (isNonEmptyString(materialUploader.storage) ? materialUploader.storage : null);

    const distribution = distributionDescriptor({ publication, materialUri, materialStorage });
    if (distribution === null) {
        return describePublicationDistributionResult({
            publication,
            material: { uri: materialUri, storage: uploadedStorage },
            discovery: null
        });
    }

    const material = { uri: distribution.material.uri, storage: distribution.material.storage };

    const published = await discoveryPublisher.publish(distribution.discoveryEnvelope);
    if (published === null) {
        return describePublicationDistributionResult({ publication, material, discovery: null });
    }

    return describePublicationDistributionResult({
        publication,
        material,
        discovery: {
            relayUrl: published.relayUrl,
            discoveryTag: discoveryPublisher.discoveryTag,
            id: published.id
        }
    });
}
