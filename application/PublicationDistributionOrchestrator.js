import { composePublicationDistributionRuntime } from './PublicationDistributionRuntimeComposition.js';
import { executePublicationDistribution } from './PublicationDistributionExecutor.js';

// 0.9.58 — Publication Decentralized Distribution Orchestrator.
//
// 0.9.44 through 0.9.49 built the entire publication-side distribution
// story as independently callable pieces, and 0.9.50 through 0.9.57 then
// built a whole local lifecycle line — state, transition, memory, +
// observation, persistence, a bridge, restoration, hydration — on top of
// results those pieces produce. Through all of that, one seam stayed
// open: nothing in this codebase turns "a signed Publication plus a set
// of distribution inputs" into a running distribution in one call. A
// caller who wants to distribute a Publication today has to already know
// to import BOTH `PublicationDistributionRuntimeComposition.js` (0.9.47)
// AND `PublicationDistributionExecutor.js` (0.9.49), call the first to
// build a runtime, then call the second with that runtime's three
// collaborators renamed onto the executor's own parameter names. This
// file is that missing call — the Publication-facing composition boundary
// 0.9.47's own header already pointed at ("a runtime composition wiring
// this class together with the other two") and 0.9.49's own header
// already left to a caller ("a caller most naturally supplies the object
// 0.9.47's own composePublicationDistributionRuntime() already returns").
//
//   Signed Publication
//        │
//        ├── serializedMaterial
//        ├── materialStorage                (optional)
//        ├── arweaveUploaderOptions         (signer, gatewayUrl, ...)
//        └── nostrPublisherOptions          (relayUrl, discoveryTag, ...)
//                    │
//                    ▼
//   application/PublicationDistributionOrchestrator.js   ★ (THIS)
//        orchestratePublicationDistribution({ ... })
//                    │
//                    ├──► composePublicationDistributionRuntime(...)   (0.9.47, unmodified)
//                    │        │
//                    │        ▼   { uploader, describeDistribution, publisher }
//                    │
//                    └──► executePublicationDistribution({ ...,        (0.9.49, unmodified)
//                             materialUploader: uploader,
//                             distributionDescriptor: describeDistribution,
//                             discoveryPublisher: publisher
//                         })
//                    │
//                    ▼
//        PublicationDistributionResult   (0.9.48, produced by 0.9.49, unmodified)
//
// AN ASSEMBLY BOUNDARY, NEVER A SECOND EXECUTION ENGINE — THE ONE
// DISTINCTION THIS WHOLE MILESTONE EXISTS TO PROTECT. This file contains
// no upload logic, no envelope construction, no publish logic, and no
// stop-on-failure sequencing of its own — it has no `try`/`catch`, no
// `if (materialUri === null)`, and no knowledge of what `material`/
// `discovery` being `null` means. Every one of those questions already has
// exactly one owner: `executePublicationDistribution()` (0.9.49). This
// file's only job is translating Publication-domain call inputs (an
// options shape a caller already has in hand) into the two collaborator-
// construction calls 0.9.47 already owns, and the one collaborator-
// sequencing call 0.9.49 already owns — then returning exactly what that
// call returns, unmodified, unwrapped, un-re-described.
//
// NEITHER 0.9.47 NOR 0.9.49 IS DUPLICATED, REIMPLEMENTED, OR EVEN PARTLY
// INLINED. `composePublicationDistributionRuntime()` is called exactly
// once per call to this file's own function, with `arweaveUploaderOptions`
// and `nostrPublisherOptions` forwarded verbatim — this file reads neither
// object, adds no default either constructor doesn't already own, and
// never constructs an `ArweavePublicationMaterialUploader` or a
// `NostrPublicationDiscoveryPublisher` directly (no `new` of either
// anywhere in this file). `executePublicationDistribution()` is called
// exactly once per call, with `publication`, `serializedMaterial`, and
// `materialStorage` forwarded verbatim and the composed runtime's own
// three collaborators renamed onto the executor's own parameter names —
// `uploader` -> `materialUploader`, `describeDistribution` ->
// `distributionDescriptor`, `publisher` -> `discoveryPublisher`. That
// renaming is this file's entire distribution-specific contribution;
// nothing about what a "distribution" IS, what counts as success, or what
// happens when one step declines is decided here — see 0.9.49's own
// header for all of that, unrevisited by this file.
//
// THE RESULT IS 0.9.49's OWN RESULT, PASSED THROUGH, NEVER RE-DESCRIBED.
// `orchestratePublicationDistribution()` returns exactly the `Promise`
// `executePublicationDistribution()` itself returns — same resolution
// value (a `PublicationDistributionResult` or `null`, per 0.9.48's own
// contract), same rejection behavior. This file adds no `.then()` of its
// own, wraps the result in no additional shape, and invents no
// `{ orchestrated: true }` or similar envelope around it.
//
// FRESH COLLABORATORS EVERY CALL — NO CACHED RUNTIME, NO SINGLETON, THE
// SAME RESTRAINT 0.9.47's OWN HEADER ALREADY HOLDS FOR ITS OWN COMPOSED
// PAIR, INHERITED HERE UNCHANGED. Calling this file's own function twice
// builds two entirely independent `ArweavePublicationMaterialUploader` and
// `NostrPublicationDiscoveryPublisher` instances via two entirely
// independent `composePublicationDistributionRuntime()` calls; nothing is
// memoized across calls, and no module-level state exists anywhere in
// this file. A caller distributing many publications in sequence pays the
// same per-call construction cost 0.9.47 already documents as
// deliberately cheap (synchronous, no I/O).
//
// A CONSTRUCTION OR CONTRACT FAILURE PROPAGATES, NEVER SWALLOWED — THE
// SAME RESTRAINT EVERY FILE IN THIS FAMILY ALREADY HOLDS. This file wraps
// neither `composePublicationDistributionRuntime()` nor
// `executePublicationDistribution()` in a `try`/`catch`. A missing
// `signer`, an empty `gatewayUrl`, a missing `discoveryTag`, or any other
// malformed `arweaveUploaderOptions`/`nostrPublisherOptions` throws exactly
// where 0.9.47's own composed constructors already throw — synchronously,
// before this file's own second call is ever reached. A genuine
// `materialUploader.upload()` or `discoveryPublisher.publish()` rejection
// propagates exactly where 0.9.49's own header already documents it
// propagating. This file adds no validation of its own ahead of either —
// duplicating a check 0.9.47 or 0.9.49 already performs would only give
// this codebase two places that could quietly disagree about the same
// rule.
//
// THREE IDENTITIES, STILL NEVER CONFLATED. This file introduces no new
// identifier of its own, and derives none from another: `publication.id`,
// the eventual `material.uri`, `nostrPublisherOptions.discoveryTag`, and
// `nostrPublisherOptions.relayUrl` all remain exactly what a caller
// supplied or 0.9.45/0.9.46 independently produced — see 0.9.47's own
// header, "the discovery tag is never inferred," and 0.9.48's own header,
// "three identities, never conflated," both unrevisited and unweakened
// here.
//
// NO LIFECYCLE, NO PERSISTENCE, NO STORE — THIS FILE NEVER IMPORTS ANY OF
// 0.9.50 THROUGH 0.9.57. `PublicationDistributionLifecycle.js`,
// `...LifecycleTransition.js`, `...LifecycleMemoryStore.js` (0.9.52/0.9.53),
// `...LifecyclePersistence.js`, `...LifecyclePersistenceBridge.js`,
// `...LifecycleRestorer.js`, and `...LifecycleHydration.js` are all
// unimported and unreferenced. This file produces a
// `PublicationDistributionResult`; what a caller does with that result —
// recording it into a lifecycle, persisting it, restoring it later — stays
// exactly the separate, already-built, separately-composed concern each of
// those eight files already is. Composing this file's own output into a
// lifecycle call is a caller's job, one call site over, never this file's.
//
// EXACTLY ONE ARWEAVE UPLOADER, ONE NOSTR PUBLISHER, PER CALL — NO
// MULTI-RELAY FAN-OUT, NO RELAY SELECTION. `nostrPublisherOptions` composes
// exactly the one `NostrPublicationDiscoveryPublisher` 0.9.46's own header
// already scopes to one relay, one discovery tag, per instance — the same
// restraint 0.9.47's and 0.9.49's own headers already hold, inherited here
// unchanged. A caller wanting a second relay calls this file's own
// function a second time, with a second `nostrPublisherOptions`.
//
// NEITHER SIGNS NOR SERIALIZES A PUBLICATION. `serializedMaterial` is
// forwarded to `executePublicationDistribution()` exactly as supplied —
// this file never calls `JSON.stringify()`, never reads
// `publication.toJSON()`, and never touches `publication.signature` for
// any purpose of its own. See 0.9.45's and 0.9.49's own headers, "neither
// signs nor serializes," unrevisited here.
//
// THE EXISTING IPFS/BITCOIN/BASE DISTRIBUTION MECHANISMS ARE UNTOUCHED AND
// UNREFERENCED. This file imports nothing from the `contentReference`/
// snapshot-placement/anchor family, reads no `publication.contentReference`
// field, and calls none of `CreateSnapshotPlacementOrchestratorUseCase.js`,
// `CreatePublicationAnchorCreationCoordinatorUseCase.js`, or any similar
// existing orchestrator. Arweave + Nostr distribution, orchestrated here,
// is additional distribution capability alongside those mechanisms, never
// a replacement for them — see 0.9.44's own header, "deliberately
// excluded... replacing... the existing IPFS/Bitcoin/Base
// `contentReference` distribution model," unrevisited by this milestone
// either.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reimplementing any part of 0.9.47's construction or 0.9.49's
//   sequencing.** See "An assembly boundary," above — this file calls
//   both, unmodified, exactly once each, per call.
// - **A distribution state machine, a lifecycle record, or any
//   persistence of a distribution result.** See "No lifecycle, no
//   persistence, no store," above — entirely 0.9.50 through 0.9.57's own,
//   already-built, separately-composed concern.
// - **Multi-relay publishing, relay selection, quorum, or fallback
//   policy.** See "Exactly one Arweave uploader, one Nostr publisher, per
//   call," above.
// - **Retries of any kind**, for either 0.9.47's own construction or
//   0.9.49's own upload/publish sequence. Neither collaborator this file
//   calls retries on its own; this file adds none.
// - **Verification of a distributed result** — confirming a `material.uri`
//   resolves, or a `discovery.id` genuinely persists on a relay. Untouched;
//   entirely a later, unscheduled, already-flagged concern (see 0.9.45's
//   and 0.9.46's own headers, "broadcast acceptance is not confirmation").
// - **Discovery lead resolution, retrieval, or signature re-verification
//   on the consuming side.** This file is the publish side only; the
//   reverse discovery/retrieval/verification pipeline (0.9.24 through
//   0.9.43) is unmodified and unreferenced.
// - **Replacing, deprecating, or migrating the existing IPFS/Bitcoin/Base
//   distribution mechanisms.** See "The existing IPFS/Bitcoin/Base
//   distribution mechanisms are untouched," above.
// - **Wallet or key management of any kind.** Neither this file nor either
//   collaborator it composes generates, stores, or handles key material —
//   `arweaveUploaderOptions.signer` and `nostrPublisherOptions.publishImpl`
//   remain entirely a caller's own concern, exactly as 0.9.45's and
//   0.9.46's own headers already leave them.
// - **A class, singleton, or any construction step of its own.** A plain
//   function taking one options object fresh on every call — see "Fresh
//   collaborators every call," above.
// - **A caller that actually invokes this orchestrator against a real
//   signed Publication inside a running application.** This file builds
//   the call boundary; wiring it into a real composition root (UI, CLI,
//   or service) remains a separate, later, unscheduled step, the same
//   restraint 0.9.36's, 0.9.43's, and 0.9.47's own headers already hold
//   for their own composed results.

// Composes `composePublicationDistributionRuntime()` (0.9.47) with
// `executePublicationDistribution()` (0.9.49) into one Publication-facing
// call — see this file's own header for the full contract. `publication`,
// `serializedMaterial`, and `materialStorage` are forwarded verbatim to
// `executePublicationDistribution()`; `arweaveUploaderOptions` and
// `nostrPublisherOptions` are forwarded verbatim to
// `composePublicationDistributionRuntime()`. Returns exactly the `Promise`
// `executePublicationDistribution()` itself returns — resolving to a
// `PublicationDistributionResult` or `null` per 0.9.48's own contract,
// rejecting exactly when that call's own collaborators reject. Throws
// synchronously, before any collaborator is constructed or called, when
// `arweaveUploaderOptions` or `nostrPublisherOptions` is malformed in a way
// 0.9.47's own composed constructors already reject (e.g. a missing
// `signer` or `discoveryTag`) — see "A construction or contract failure
// propagates," above.
export function orchestratePublicationDistribution({
    publication,
    serializedMaterial,
    materialStorage,
    arweaveUploaderOptions,
    nostrPublisherOptions
} = {}) {
    const runtime = composePublicationDistributionRuntime({
        arweaveUploaderOptions,
        nostrPublisherOptions
    });

    return executePublicationDistribution({
        publication,
        serializedMaterial,
        materialStorage,
        materialUploader: runtime.uploader,
        distributionDescriptor: runtime.describeDistribution,
        discoveryPublisher: runtime.publisher
    });
}
