import { ArweavePublicationMaterialUploader } from './ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from './NostrPublicationDiscoveryPublisher.js';
import { describePublicationDistribution } from './PublicationDistributionDescriptor.js';

// 0.9.47 — Publication Distribution Runtime Composition.
//
// 0.9.44 through 0.9.46 built the entire publication-side distribution
// story one seam at a time, each file deliberately refusing to import
// either of the other two: `PublicationDistributionDescriptor.js` (0.9.44)
// turns a signed Publication plus an already-known `materialUri` into a
// canonical discovery envelope, and performs no I/O of any kind;
// `ArweavePublicationMaterialUploader.js` (0.9.45) turns serialized
// material into that `materialUri`, talking only to an Arweave gateway;
// `NostrPublicationDiscoveryPublisher.js` (0.9.46) turns a discovery
// envelope into a Nostr event, talking only to a Nostr relay. Each header
// named this file explicitly as the one still-missing piece: "a runtime
// composition wiring this class together with the other two — 0.9.47,
// unscheduled." This file is that composition, and nothing more — the
// same narrow role `DecentralizedWorldEncounterMaterialRuntimeComposition.js`
// (0.9.36) already plays for the consumption side's own resolver/source
// pair, and `WorldEncounterMaterialVerifierRuntimeComposition.js` (0.9.43)
// already plays for verification.
//
//   Signed Publication
//        │
//        ▼
//   application/PublicationDistributionRuntimeComposition.js   ★ (THIS)
//        composePublicationDistributionRuntime({
//            arweaveUploaderOptions,
//            nostrPublisherOptions
//        })
//        │
//        ├──► new ArweavePublicationMaterialUploader(arweaveUploaderOptions)   (0.9.45, unmodified)
//        ├──► describePublicationDistribution                                  (0.9.44, unmodified — forwarded, not wrapped)
//        └──► new NostrPublicationDiscoveryPublisher(nostrPublisherOptions)    (0.9.46, unmodified)
//        │
//        ▼
//   { uploader, describeDistribution, publisher }
//        │
//        │   a caller's own sequence — never this file's own:
//        │
//        ▼
//   uploader.upload(material) -> ar://TX
//        │
//        ▼
//   describeDistribution({ publication, materialUri: ar://TX }) -> discoveryEnvelope
//        │
//        ▼
//   publisher.publish(discoveryEnvelope) -> { published: true, relayUrl, id }
//
// COMPOSITION, NEVER A FOURTH DISTRIBUTION ALGORITHM. This file performs no
// upload, no envelope construction, and no publish of its own — it has no
// `upload()`, no `describePublicationDistribution()`, and no `publish()`
// method or function defined anywhere in it. Its only job is object
// construction: build the two stateful collaborators, expose the one
// stateless one alongside them, hand back all three together. Every
// behavior a caller ever observes through the object this file returns is
// entirely 0.9.44's, 0.9.45's, and 0.9.46's own, unmodified.
//
// THIS IS THE ONE FILE IN THIS CODEBASE THAT NAMES ALL THREE PUBLICATION-
// SIDE DISTRIBUTION COLLABORATORS TOGETHER. Each of 0.9.44, 0.9.45, and
// 0.9.46 explicitly refused to import either of the other two — see each
// file's own header, "Deliberately excluded... a runtime composition...
// 0.9.47." This file is where that refusal is deliberately allowed to end,
// exactly the seam 0.9.36 already opened for the decentralized retrieval
// side and 0.9.43 already opened for verification.
//
// NO NEW ORCHESTRATION — A CALLER STILL SEQUENCES THE THREE STEPS ITSELF.
// This file deliberately does NOT export a `publishPublication()` (or any
// similarly named) function that serializes material, uploads it,
// constructs a descriptor, and publishes the result in one call. Doing so
// would immediately raise questions this milestone has no answer for —
// what happens when the upload succeeds but the publish fails; whether
// either step should retry; whether a publication is "distributed" after
// only one of the two substrates accepted it; whether an existing
// `materialUri` should be reused; whether duplicate Nostr events should be
// suppressed; whether publication state should persist anywhere — every
// one of those is a distribution-EXECUTION or distribution-STATE question,
// not a composition question, and every one of them stays unscheduled here.
// `composePublicationDistributionRuntime()` returns three independently
// callable collaborators; nothing in this file ever calls one from another.
//
// `describeDistribution` IS FORWARDED, NEVER WRAPPED — IT HAS NO
// CONSTRUCTOR TO COMPOSE. `PublicationDistributionDescriptor.js`'s own
// `describePublicationDistribution()` is a synchronous, pure, dependency-
// free function; there is nothing for this file to construct around it, no
// options for it to accept, and no state for two composition calls to
// disagree about. It is exposed on the returned object under the same
// `describeDistribution` name purely so a caller holding one `runtime`
// object has all three collaborators available through one value, without
// this file inventing a second name, a thin wrapper, or a class where a
// plain function already does the entire job. Every `runtime.describeDistribution`
// obtained from any composition call is the exact same function reference —
// this is not a violation of "every call builds a fresh, independent set"
// below, because a pure function with no injected dependencies has no
// instance state to keep independent in the first place.
//
// `arweaveUploaderOptions` AND `nostrPublisherOptions` ARE FORWARDED
// VERBATIM, NEVER REINTERPRETED, NEVER PARTIALLY RECONSTRUCTED — THE SAME
// RESTRAINT 0.9.36's OWN `resolverOptions` FORWARDING ALREADY HOLDS.
// `arweaveUploaderOptions` (`{ signer, gatewayUrl, fetchImpl, timeoutMs,
// maxMaterialBytes, maxResponseBytes }`) goes straight to `new
// ArweavePublicationMaterialUploader(arweaveUploaderOptions)`, unread by
// this file; `nostrPublisherOptions` (`{ relayUrl, tagName, kind,
// discoveryTag, publishImpl, timeoutMs }`) goes straight to `new
// NostrPublicationDiscoveryPublisher(nostrPublisherOptions)`, unread by
// this file. This file inspects neither object, defaults no field either
// constructor already defaults on its own, and adds no new option of its
// own to either shape.
//
// THE DISCOVERY TAG IS NEVER INFERRED FROM THE MATERIAL URI, THE
// PUBLICATION ID, OR ANYTHING ELSE THIS FILE COULD COMPUTE — THE SAME
// EXPLICIT-CONFIGURATION LINE 0.9.46's OWN HEADER ALREADY DREW FOR ITSELF,
// HELD HERE ONE LAYER OVER. `nostrPublisherOptions.discoveryTag` is
// forwarded exactly as supplied — required, with no default — to
// `NostrPublicationDiscoveryPublisher`'s own constructor, which already
// throws for a missing one. This file never derives a discovery tag from
// `arweaveUploaderOptions`, from a material uri, or from any Publication —
// material uri, discovery tag, and relay origin remain three independently
// supplied facts, never collapsed into one inferred from another.
//
// NO I/O OF ANY KIND — CONSTRUCTION ONLY. Calling
// `composePublicationDistributionRuntime()` never contacts an Arweave
// gateway, never opens a connection to a Nostr relay, never signs
// anything, never generates a key, and never uploads or publishes
// anything. `new ArweavePublicationMaterialUploader(...)` and `new
// NostrPublicationDiscoveryPublisher(...)` are both themselves synchronous
// constructors that perform no network activity on construction — this
// file adds no I/O of its own on top of that, and calls neither
// `uploader.upload()` nor `publisher.publish()` itself, ever.
//
// A CONSTRUCTION FAILURE PROPAGATES, NEVER SWALLOWED — THE SAME RESTRAINT
// 0.9.36's OWN HEADER ALREADY HOLDS. `new ArweavePublicationMaterialUploader(...)`
// already throws for a missing `signer` or an empty `gatewayUrl` with no
// usable `fetchImpl`; `new NostrPublicationDiscoveryPublisher(...)` already
// throws for a missing `discoveryTag`, an empty `relayUrl`, or a missing
// `publishImpl`. This file never wraps either construction in a
// `try`/`catch` — a misconfigured caller fails loudly at composition time,
// not later, silently, on the first real `upload()` or `publish()` call.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT PAIR OF STATEFUL COLLABORATORS —
// NO MODULE-LEVEL STATE, NO SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED
// RUNTIME. Calling `composePublicationDistributionRuntime()` twice
// constructs two entirely independent `uploader` instances and two
// entirely independent `publisher` instances; neither call reads or writes
// anything outside its own arguments and return value — the identical
// restraint 0.9.36's and 0.9.43's own headers already hold for their own
// composed pairs, held here for a composed triple. (`describeDistribution`
// is the one exception, and is not an exception at all — see "describeDistribution
// is forwarded, never wrapped," above.)
//
// THIS FILE NEVER RE-IMPLEMENTS ANY SEMANTIC ALREADY OWNED BY ONE OF ITS
// THREE COLLABORATORS. It contains no envelope-shape knowledge (no
// `protocol`/`version`/`kind`/`objectId`/`uri` literal of its own, no
// `describeDecentralizedDiscoveryEnvelope` import), no Publication
// validation of its own (no `.signature`/`.id` check — that stays entirely
// `describePublicationDistribution()`'s own), no Nostr event construction
// (no `tags`/`content`/`kind` template, no `JSON.stringify` of an envelope
// — that stays entirely `NostrPublicationDiscoveryPublisher`'s own), no
// Arweave uri construction (no `ar://` prefix, no transaction-id pattern —
// that stays entirely `ArweavePublicationMaterialUploader`'s own), and no
// retry, caching, deduplication, or trust/ranking vocabulary of any kind.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`publishPublication()`, or any other single call that performs
//   serialize → upload → describe → publish automatically.** See "No new
//   orchestration," above — that is publication distribution EXECUTION/
//   STATE semantics, an explicitly separate, later, unscheduled milestone.
// - **Retry policy, for either the uploader or the publisher.** Neither
//   0.9.45 nor 0.9.46 retries on its own; this file adds no retry on top.
// - **Compensating actions when one substrate succeeds and the other
//   fails** (e.g. un-publishing a Nostr event after a later failure, or
//   deciding whether an already-uploaded `materialUri` should be reused).
//   This file never observes the outcome of one collaborator's call in
//   order to react to it with another — it never calls any of the three at
//   all.
// - **Publishing to more than one relay, or any relay-selection,
//   preference, or fallback policy.** `nostrPublisherOptions` composes
//   exactly the one `NostrPublicationDiscoveryPublisher` instance 0.9.46's
//   own header already scopes to one relay, one discovery tag, per
//   instance; a caller wanting a second relay calls this function twice.
// - **Publication distribution state tracking or persistence of any kind.**
//   This file returns three collaborators; it holds no record of any call
//   ever made through them.
// - **Deduplicating repeated uploads or publishes.** Inherited unchanged
//   from 0.9.45's and 0.9.46's own "no caching, no retry, no deduplication"
//   restraints — this file adds no policy of its own on top of theirs.
// - **Publication withdrawal, Nostr event replacement, or any mutation of
//   an already-published announcement.** Neither collaborator this file
//   composes exposes such an operation; this file invents none either.
// - **A concrete `signer` or `publishImpl` implementation.** Both remain
//   entirely a caller's own concern, exactly as 0.9.45's and 0.9.46's own
//   headers already leave them.
// - **Migrating, deprecating, or removing the existing IPFS/Bitcoin/Base
//   distribution mechanisms.** Untouched — see 0.9.44's own header,
//   "Deliberately excluded... replacing... the existing IPFS/Bitcoin/Base
//   `contentReference` distribution model," which this file does not
//   revisit either.
// - **Any caller that actually invokes this composition against a signed
//   Publication in a running application.** This file builds the object;
//   wiring it into a real composition root remains a separate, later,
//   unscheduled step — the same restraint 0.9.36's and 0.9.43's own
//   headers already hold for their own composed results.

// Constructs one fresh `ArweavePublicationMaterialUploader` (0.9.45) and
// one fresh `NostrPublicationDiscoveryPublisher` (0.9.46), and returns
// both alongside `PublicationDistributionDescriptor.js`'s own
// `describePublicationDistribution` (0.9.44, forwarded unmodified — see
// this file's own header, "describeDistribution is forwarded, never
// wrapped"). `arweaveUploaderOptions` and `nostrPublisherOptions` are each
// forwarded verbatim to their own collaborator's constructor; see this
// file's own header, "arweaveUploaderOptions and nostrPublisherOptions are
// forwarded verbatim." A malformed option for either collaborator throws
// exactly as that collaborator's own constructor already throws on its
// own; see "A construction failure propagates."
export function composePublicationDistributionRuntime({
    arweaveUploaderOptions = {},
    nostrPublisherOptions = {}
} = {}) {
    const uploader = new ArweavePublicationMaterialUploader(arweaveUploaderOptions);
    const publisher = new NostrPublicationDiscoveryPublisher(nostrPublisherOptions);

    return Object.freeze({
        uploader,
        describeDistribution: describePublicationDistribution,
        publisher
    });
}
