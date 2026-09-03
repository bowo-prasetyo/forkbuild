import { orchestratePublicationDistribution } from './PublicationDistributionOrchestrator.js';
import { describePublicationDistributionLifecycle, PublicationDistributionState } from './PublicationDistributionLifecycle.js';
import { transitionPublicationDistributionLifecycle } from './PublicationDistributionLifecycleTransition.js';

// 0.9.103 — Publication Distribution Command Boundary.
//
// 0.9.58's own orchestrator turned "a signed Publication plus a set of
// distribution inputs" into one clean call, and closed its own header with
// the one thing it deliberately left for later: "a caller that actually
// invokes this orchestrator against a real signed Publication inside a
// running application... remains a separate, later, unscheduled step."
// 0.9.100 wired the lifecycle line's OBSERVATION half into World View —
// `WorldEncounterCanvas` can watch a `PublicationDistributionLifecycleMemoryStore`
// live — but its own header was equally explicit about what it refused to
// build: "Neither an Arweave uploader nor a Nostr publisher is ever
// constructed here... actually EXECUTING a distribution needs real
// signer/relay configuration this file has nowhere else established." The
// 0.9.102 audit re-confirmed both refusals still held, and named the gap
// they leave behind precisely: a fully built, fully tested
// Orchestrator/Executor pair, sitting completely unreachable from anywhere
// outside its own test suite, "behind a missing command seam." This file is
// that seam, and nothing more.
//
//   Application caller (a future UI action, a script, a test)
//        │
//        │  { publication, serializedMaterial, materialStorage,
//        │    arweaveUploaderOptions, nostrPublisherOptions, lifecycleStore }
//        ▼
//   application/PublicationDistributionCommand.js   ★ (THIS)
//        executePublicationDistributionCommand({ ... })
//        │
//        ├──► orchestratePublicationDistribution({ ... })   (0.9.58, unmodified)
//        │        │
//        │        ▼   PublicationDistributionResult | null
//        │
//        ├──► describePublicationDistributionLifecycle(result)   (0.9.50, unmodified)
//        │        │
//        │        ▼   { material: { state, uri?, storage? },
//        │              discovery: { state, origin?, discoveryTag?, id? } }
//        │
//        ├──► transitionPublicationDistributionLifecycle(current, fact)   (0.9.51, unmodified)
//        │        │        applied once per dimension the fresh result
//        │        │        actually reports PRESENT — never for ABSENT
//        │        ▼
//        └──► lifecycleStore.set(publicationId, nextLifecycle)   (0.9.52, unmodified)
//        │
//        ▼
//   PublicationDistributionResult | null   (exactly 0.9.58's own return value)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND EXECUTION ENGINE OR A SECOND
// LIFECYCLE MANAGER — THE SAME DISTINCTION 0.9.58's OWN HEADER ALREADY
// PROTECTED ONE LAYER EARLIER. This file contains no upload logic, no
// envelope construction, no publish logic, no upload/publish sequencing of
// its own, and no lifecycle-description or lifecycle-transition logic of
// its own. It calls `orchestratePublicationDistribution()` exactly once,
// `describePublicationDistributionLifecycle()` exactly once (only when a
// result exists to describe), and `transitionPublicationDistributionLifecycle()`
// at most twice (once per dimension a fresh result actually reports
// PRESENT). Every behavior a caller observes through this file is entirely
// 0.9.50's, 0.9.51's, and 0.9.58's own.
//
// THE RETURNED RESULT IS 0.9.58's OWN RESULT, PASSED THROUGH, NEVER
// RE-DESCRIBED. `executePublicationDistributionCommand()` resolves to
// exactly what `orchestratePublicationDistribution()` itself resolved to —
// same `PublicationDistributionResult` reference, same `null` for a
// malformed `publication`. This file wraps the result in no additional
// envelope, invents no `{ commanded: true }` shape, and adds no status
// field of its own — see "Deliberately excluded," below.
//
// RECORDING INTO THE STORE USES A TRANSITION, NEVER A BLIND OVERWRITE — THE
// ONE DESIGN DECISION THIS FILE ITSELF ADDS ON TOP OF WHAT 0.9.50/0.9.51
// ALREADY OFFER SEPARATELY. `orchestratePublicationDistribution()` always
// runs upload-then-publish as one sequence (0.9.49's own stop-on-failure
// ordering), so a single call's own result can under-report a dimension
// that a PREVIOUS call already established — e.g. a second distribution
// attempt whose upload itself declines reports `material: null,
// discovery: null` even though an earlier attempt already got material
// onto Arweave. Calling `lifecycleStore.set(publicationId,
// describePublicationDistributionLifecycle(result))` directly would
// silently regress that publication's own material fact back to `ABSENT`,
// discarding real, previously-obtained provenance. This file avoids that by
// reading whatever lifecycle the store already holds for this publication
// (or the well-known `{ material: ABSENT, discovery: ABSENT }` baseline,
// when nothing is stored yet — the same baseline 0.9.50's own
// `describePublicationDistributionLifecycle()` already produces for a
// result with both sections `null`), and applying `transitionPublicationDistributionLifecycle()`
// only for the dimension(s) the FRESH result actually reports `PRESENT` —
// never for a dimension it reports `ABSENT`. A dimension this call's own
// result did not (re-)establish is left exactly as the store already had
// it; only a dimension this call genuinely obtained a new fact for ever
// changes.
//
// A CALL THAT LEARNS NOTHING NEW WRITES NOTHING TO THE STORE. When
// `orchestratePublicationDistribution()` resolves `null` (a malformed
// `publication`), or resolves a result whose `material` and `discovery` are
// both `null` (nothing was obtained this attempt), this file calls neither
// `describePublicationDistributionLifecycle()` in the first case, nor
// `lifecycleStore.set()` in either — the identical "a caller who never
// attempted the step, and a caller whose attempt returned null, are
// indistinguishable, and deliberately so" restraint 0.9.48's own header
// already holds, extended here to whether an attempt is worth recording at
// all. This file invents no `ATTEMPTED`/`NO_CHANGE` fact to report that
// nothing changed.
//
// SYNCHRONOUS VALIDATION, SYNCHRONOUS THROW — THE SAME OBSERVABLE SHAPE
// 0.9.58's OWN CALL ALREADY HAS. `executePublicationDistributionCommand()`
// is a plain (non-`async`) function. It validates `lifecycleStore` and
// calls `orchestratePublicationDistribution()` synchronously, on the
// caller's own call stack, before ever returning a `Promise` — a missing
// `lifecycleStore`, or a malformed `arweaveUploaderOptions`/
// `nostrPublisherOptions` that 0.9.47's own composed constructors already
// reject, throws synchronously, exactly where it already would calling
// `orchestratePublicationDistribution()` directly. Only once construction
// has already succeeded does this file's own `.then()` take over, to record
// whatever the resulting promise resolves to. Writing this file as an
// `async` function would have silently turned every one of those
// synchronous throws into an asynchronous rejection instead — a change of
// observable behavior this file exists to avoid, not introduce.
//
// A GENUINE COLLABORATOR REJECTION PROPAGATES UNCHANGED. This file's own
// `.then(onFulfilled)` supplies no rejection handler, so a `materialUploader.upload()`
// or `discoveryPublisher.publish()` rejection (0.9.49's own "genuine failure
// propagates" line) passes straight through the returned promise, exactly
// as it already would calling `orchestratePublicationDistribution()`
// directly. This file never wraps the orchestrator call, or its own
// store-recording step, in a `try`/`catch`.
//
// `lifecycleStore` IS THE ONE NEW COLLABORATOR THIS FILE ITSELF INTRODUCES,
// AND THE ONLY ONE IT VALIDATES ITSELF. `publication`, `serializedMaterial`,
// `materialStorage`, `arweaveUploaderOptions`, and `nostrPublisherOptions`
// are forwarded to `orchestratePublicationDistribution()` verbatim, unread
// by this file — validating any of them here would duplicate a check
// 0.9.47/0.9.49 already own, exactly the redundant-verification this whole
// family already refuses at every layer. `lifecycleStore` is the one
// argument no earlier boundary in this call chain already validates, so
// this file checks it, once, before doing anything else: a non-null value
// exposing `get`/`set` functions, duck-typed exactly like every other
// collaborator in this family — never an `instanceof
// PublicationDistributionLifecycleMemoryStore` check.
//
// NO SECOND LIFECYCLE VOCABULARY, NO NEW STATE. This file introduces no
// `COMMANDED`/`INITIATED`/`DISPATCHED` value, and reads or writes nothing
// through `lifecycleStore` beyond exactly the `get`/`set` calls 0.9.52
// itself already defines. The lifecycle a caller observes through
// `lifecycleStore.subscribe()` (0.9.53) or through the persistence bridge
// (0.9.55, already wired to this same store instance in `ui/main.js`) after
// calling this file is built entirely out of 0.9.50's and 0.9.51's own,
// unmodified, output shapes.
//
// NEITHER AN ARWEAVE UPLOADER NOR A NOSTR PUBLISHER IS EVER CONSTRUCTED
// HERE, AND NEITHER IS `PublicationDistributionRuntimeComposition.js`
// IMPORTED. Exactly like 0.9.58 itself, this file never imports
// `ArweavePublicationMaterialUploader`, `NostrPublicationDiscoveryPublisher`,
// or `PublicationDistributionRuntimeComposition.js` — construction of both
// collaborators stays entirely inside `orchestratePublicationDistribution()`'s
// own call, fresh per call, from whatever `arweaveUploaderOptions`/
// `nostrPublisherOptions` a caller supplies. This file makes no signer/relay
// configuration decision of any kind — that remains entirely a caller's own
// concern, exactly as 0.9.45's, 0.9.46's, 0.9.47's, and 0.9.58's own headers
// already leave it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI trigger of any kind.** No `[E] Distribute` action, no World View
//   control, no loading/progress/error presentation. This file has no idea
//   `ui/` exists — see 0.9.102's own recommendation, naming the UI action as
//   a separate, later milestone.
// - **Composition-root signer/relay configuration, or any concrete Arweave
//   gateway/Nostr relay choice.** See "Neither an Arweave uploader nor a
//   Nostr publisher is ever constructed here," above — supplying
//   `arweaveUploaderOptions`/`nostrPublisherOptions` remains entirely this
//   file's own caller's job, per call, exactly as it already was calling
//   `orchestratePublicationDistribution()` directly.
// - **Wallet or key management of any kind.** Neither this file nor any
//   collaborator it calls generates, stores, or handles key material.
// - **A second lifecycle state, status, or vocabulary.** See "No second
//   lifecycle vocabulary, no new state," above.
// - **Retries of any kind**, for the orchestration call or the store write.
// - **Persistence of any kind performed directly by this file.** Recording
//   into `lifecycleStore` may, depending on how the store instance a caller
//   supplied is wired elsewhere (0.9.55's own bridge), end up persisted —
//   this file neither knows nor cares; it calls `lifecycleStore.set()`,
//   nothing else, and never imports `PublicationDistributionLifecyclePersistence.js`
//   or `PublicationDistributionLifecyclePersistenceBridge.js`.
// - **A registration with `application/commands/`'s own `Command`/
//   `CommandRegistry` pair.** That family is specialized to undoable
//   spatial edits against a live `World` context — distribution is neither
//   undoable nor `World`-scoped, so it is a shape this file's own plain
//   function/options-object convention imitates (matching 0.9.58's own),
//   never a registry this file joins.
// - **Automatic distribution, background distribution, or polling of any
//   kind.** This file is called once per invocation, by a caller who
//   decides entirely for itself when to call it.
// - **Undoing a distribution, or any withdrawal semantics.** Neither
//   0.9.50 nor 0.9.51 offers a `PRESENT` -> `ABSENT` transition; this file
//   invents none either.

const BASELINE_LIFECYCLE = Object.freeze({
    material: Object.freeze({ state: PublicationDistributionState.ABSENT }),
    discovery: Object.freeze({ state: PublicationDistributionState.ABSENT })
});

// Applies at most two single-dimension transitions on top of whatever
// lifecycle `lifecycleStore` already holds for `publicationId` — see this
// file's own header, "Recording into the store uses a transition, never a
// blind overwrite." Calls `lifecycleStore.set()` only when at least one
// transition actually applied — see "A call that learns nothing new writes
// nothing to the store."
function recordPublicationDistributionResult(lifecycleStore, result) {
    if (!result) {
        return;
    }

    const freshLifecycle = describePublicationDistributionLifecycle(result);
    if (!freshLifecycle) {
        return;
    }

    const current = lifecycleStore.get(result.publication.objectId) || BASELINE_LIFECYCLE;
    let next = current;
    let changed = false;

    if (freshLifecycle.material.state === PublicationDistributionState.PRESENT) {
        const transitioned = transitionPublicationDistributionLifecycle(next, {
            material: { uri: freshLifecycle.material.uri, storage: freshLifecycle.material.storage }
        });
        if (transitioned) {
            next = transitioned;
            changed = true;
        }
    }

    if (freshLifecycle.discovery.state === PublicationDistributionState.PRESENT) {
        const transitioned = transitionPublicationDistributionLifecycle(next, {
            discovery: {
                origin: freshLifecycle.discovery.origin,
                discoveryTag: freshLifecycle.discovery.discoveryTag,
                id: freshLifecycle.discovery.id
            }
        });
        if (transitioned) {
            next = transitioned;
            changed = true;
        }
    }

    if (changed) {
        lifecycleStore.set(result.publication.objectId, next);
    }
}

// executePublicationDistributionCommand({ publication, serializedMaterial,
//   materialStorage, arweaveUploaderOptions, nostrPublisherOptions,
//   lifecycleStore }) -> Promise<PublicationDistributionResult | null>.
//
// The application-level command boundary for initiating Publication
// Distribution — see this file's own header for the full contract. Calls
// `orchestratePublicationDistribution()` (0.9.58, unmodified) with
// `publication`/`serializedMaterial`/`materialStorage`/
// `arweaveUploaderOptions`/`nostrPublisherOptions` forwarded verbatim, then
// records whatever new material/discovery facts the resulting
// `PublicationDistributionResult` actually reports into `lifecycleStore`,
// via `describePublicationDistributionLifecycle()` (0.9.50) and
// `transitionPublicationDistributionLifecycle()` (0.9.51), both unmodified.
// Resolves to exactly the `PublicationDistributionResult` (or `null`)
// `orchestratePublicationDistribution()` itself resolved to — never
// re-described, never re-wrapped. Throws synchronously, before any
// collaborator is constructed or called, when `lifecycleStore` is missing
// or does not expose `get()`/`set()` functions, or when
// `arweaveUploaderOptions`/`nostrPublisherOptions` is malformed in a way
// 0.9.47's own composed constructors already reject — see "Synchronous
// validation, synchronous throw," above. The returned promise rejects
// exactly when `orchestratePublicationDistribution()`'s own promise itself
// rejects — see "A genuine collaborator rejection propagates unchanged."
export function executePublicationDistributionCommand({
    publication,
    serializedMaterial,
    materialStorage,
    arweaveUploaderOptions,
    nostrPublisherOptions,
    lifecycleStore
} = {}) {
    if (!lifecycleStore || typeof lifecycleStore.get !== 'function' || typeof lifecycleStore.set !== 'function') {
        throw new Error('executePublicationDistributionCommand: a lifecycleStore with get()/set() methods is required');
    }

    const distribution = orchestratePublicationDistribution({
        publication,
        serializedMaterial,
        materialStorage,
        arweaveUploaderOptions,
        nostrPublisherOptions
    });

    return distribution.then((result) => {
        recordPublicationDistributionResult(lifecycleStore, result);
        return result;
    });
}
