import { ArweavePublicationMaterialUploader } from './ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from './NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from './ArweaveAnnouncementPublisher.js';
import { describePublicationDistribution } from './PublicationDistributionDescriptor.js';

// 0.9.47 — Publication Distribution Runtime Composition.
// Amended by 0.9.428 — Arweave Announcement Publisher Implementation. See
// "THE ONE CONSTRUCTION SITE 0.9.428 PARAMETERIZED," below, for exactly
// what changed; every other section of this header describes behavior
// 0.9.428 left untouched.
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
// already plays for verification. 0.9.427's own audit later found that the
// distribution-execution layer's own `discoveryPublisher` slot already
// accepts an Arweave-flavored collaborator with zero change to that layer —
// the ONE fixed thing standing in the way of Arweave becoming a SELECTABLE
// discovery substrate through the real, UI-reachable command chain was
// exactly the literal, unparameterized `new
// NostrPublicationDiscoveryPublisher(nostrPublisherOptions)` call this file
// used to make unconditionally. 0.9.428 is the class that closes the
// PROVIDER_GAP that audit named (`application/ArweaveAnnouncementPublisher.js`)
// and, in this file alone, the MECHANISM_GAP: the one construction site is
// now parameterized so a caller can select which discovery-substrate
// collaborator gets built.
//
//   Signed Publication
//        │
//        ▼
//   application/PublicationDistributionRuntimeComposition.js   ★ (THIS)
//        composePublicationDistributionRuntime({
//            arweaveUploaderOptions,
//            discoveryProvider,              // 'nostr' (default) | 'arweave' — 0.9.428
//            nostrPublisherOptions,
//            arweaveAnnouncementPublisherOptions   // 0.9.428
//        })
//        │
//        ├──► new ArweavePublicationMaterialUploader(arweaveUploaderOptions)   (0.9.45, unmodified)
//        ├──► describePublicationDistribution                                  (0.9.44, unmodified — forwarded, not wrapped)
//        └──► EXACTLY ONE OF:                                                  (0.9.428 — selection, never fan-out)
//                 new NostrPublicationDiscoveryPublisher(nostrPublisherOptions)              (0.9.46, unmodified)
//                 new ArweaveAnnouncementPublisher(arweaveAnnouncementPublisherOptions)       (0.9.428)
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
// COMPOSITION, NEVER A FOURTH (OR FIFTH) DISTRIBUTION ALGORITHM. This file
// performs no upload, no envelope construction, and no publish of its own —
// it has no `upload()`, no `describePublicationDistribution()`, and no
// `publish()` method or function defined anywhere in it. Its only job is
// object construction: build the stateful collaborators (the uploader, and
// exactly one discovery publisher — see "Selection, never fan-out," below),
// expose the one stateless one alongside them, hand back all three together.
// Every behavior a caller ever observes through the object this file returns
// is entirely 0.9.44's, 0.9.45's, 0.9.46's, or 0.9.428's own, unmodified —
// this file still contains no envelope-shape knowledge, no Nostr event
// construction, and no Arweave transaction/tag construction of its own; see
// "This file never re-implements any semantic," below, extended to
// `ArweaveAnnouncementPublisher` exactly as it already covered the other two.
//
// THIS IS THE ONE FILE IN THIS CODEBASE THAT NAMES ALL FOUR PUBLICATION-SIDE
// DISTRIBUTION COLLABORATORS TOGETHER. Each of 0.9.44, 0.9.45, 0.9.46, and
// 0.9.428 explicitly refused to import any of the others — see each file's
// own header, "Deliberately excluded... a runtime composition..." This file
// is where that refusal is deliberately allowed to end, exactly the seam
// 0.9.36 already opened for the decentralized retrieval side and 0.9.43
// already opened for verification.
//
// SELECTION, NEVER FAN-OUT — THE ONE INVARIANT 0.9.428 ADDS TO THIS FILE.
// `discoveryProvider` chooses EXACTLY ONE discovery-substrate collaborator
// to construct; this file never builds both and never calls one from the
// other. Selecting `'arweave'` means `runtime.publisher` is a real
// `ArweaveAnnouncementPublisher` and no `NostrPublicationDiscoveryPublisher`
// is ever constructed for that call, and vice versa for `'nostr'` — there is
// no `runtime.publishers` array, no automatic "announce to every configured
// substrate," and no failover from one to the other. A caller wanting to
// announce on both substrates calls `composePublicationDistributionRuntime()`
// twice, once per `discoveryProvider`, and sequences both resulting
// `publisher`s itself — the identical "a caller wanting a second relay calls
// this function twice" restraint this file already held for Nostr alone,
// extended, never loosened, now that a second substrate genuinely exists.
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
// `arweaveUploaderOptions`, `nostrPublisherOptions`, AND
// `arweaveAnnouncementPublisherOptions` ARE EACH FORWARDED VERBATIM, NEVER
// REINTERPRETED, NEVER PARTIALLY RECONSTRUCTED — THE SAME RESTRAINT 0.9.36's
// OWN `resolverOptions` FORWARDING ALREADY HOLDS. `arweaveUploaderOptions`
// (`{ signer, gatewayUrl, fetchImpl, timeoutMs, maxMaterialBytes,
// maxResponseBytes }`) goes straight to `new
// ArweavePublicationMaterialUploader(arweaveUploaderOptions)`, unread by
// this file; `nostrPublisherOptions` (`{ relayUrl, tagName, kind,
// discoveryTag, publishImpl, timeoutMs }`) goes straight to `new
// NostrPublicationDiscoveryPublisher(nostrPublisherOptions)` whenever
// `discoveryProvider` is `'nostr'`; `arweaveAnnouncementPublisherOptions`
// (`{ discoveryTag, gatewayUrl, tagName, uploadTaggedTransaction,
// timeoutMs }`, 0.9.428) goes straight to `new
// ArweaveAnnouncementPublisher(arweaveAnnouncementPublisherOptions)`
// whenever `discoveryProvider` is `'arweave'` — the option object for
// whichever provider was NOT selected is simply never read. This file
// inspects none of the three objects, defaults no field any constructor
// already defaults on its own, and adds no new option of its own to any of
// the three shapes.
//
// `discoveryProvider` ITSELF IS THE ONE NEW OPTION THIS FILE ADDS, AND IT
// NAMES A CHOICE, NEVER A CAPABILITY THIS FILE COMPUTES. `discoveryProvider`
// defaults to `'nostr'` — the identical behavior every existing caller of
// this file already gets today, unchanged — and accepts `'arweave'` as its
// only other value. This file never inspects `arweaveUploaderOptions`,
// `nostrPublisherOptions`, or `arweaveAnnouncementPublisherOptions` to GUESS
// which provider a caller "must have meant"; a caller states its choice
// explicitly, exactly as `application/RoleAwareProviderResolver.js`'s own
// still-unrelated `providerKey` pattern already requires elsewhere in this
// codebase for a different role. An unrecognized `discoveryProvider` throws
// synchronously, before either the uploader or any discovery publisher is
// constructed — a misconfigured caller fails loudly, at composition time,
// the identical restraint held for a malformed constructor option below.
//
// THE DISCOVERY TAG IS NEVER INFERRED FROM THE MATERIAL URI, THE
// PUBLICATION ID, OR ANYTHING ELSE THIS FILE COULD COMPUTE — THE SAME
// EXPLICIT-CONFIGURATION LINE 0.9.46's OWN HEADER ALREADY DREW FOR ITSELF,
// HELD HERE ONE LAYER OVER, FOR EITHER SUBSTRATE. `nostrPublisherOptions.discoveryTag`
// and `arweaveAnnouncementPublisherOptions.discoveryTag` are each forwarded
// exactly as supplied — required, with no default — to their own
// constructor, both of which already throw for a missing one. This file
// never derives a discovery tag from `arweaveUploaderOptions`, from a
// material uri, or from any Publication — material uri, discovery tag, and
// discovery origin remain independently supplied facts, never collapsed
// into one inferred from another.
//
// NO I/O OF ANY KIND — CONSTRUCTION ONLY. Calling
// `composePublicationDistributionRuntime()` never contacts an Arweave
// gateway, never opens a connection to a Nostr relay, never signs
// anything, never generates a key, and never uploads or publishes
// anything. `new ArweavePublicationMaterialUploader(...)`, `new
// NostrPublicationDiscoveryPublisher(...)`, and `new
// ArweaveAnnouncementPublisher(...)` are all themselves synchronous
// constructors that perform no network activity on construction — this
// file adds no I/O of its own on top of that, and calls neither
// `uploader.upload()` nor `publisher.publish()` itself, ever.
//
// A CONSTRUCTION FAILURE PROPAGATES, NEVER SWALLOWED — THE SAME RESTRAINT
// 0.9.36's OWN HEADER ALREADY HOLDS. `new ArweavePublicationMaterialUploader(...)`
// already throws for a missing `signer` or an empty `gatewayUrl` with no
// usable `fetchImpl`; `new NostrPublicationDiscoveryPublisher(...)` already
// throws for a missing `discoveryTag`, an empty `relayUrl`, or a missing
// `publishImpl`; `new ArweaveAnnouncementPublisher(...)` already throws for
// a missing `discoveryTag` or a missing `uploadTaggedTransaction` (0.9.428).
// This file never wraps any construction in a `try`/`catch` — a
// misconfigured caller fails loudly at composition time, not later,
// silently, on the first real `upload()` or `publish()` call.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT SET OF STATEFUL COLLABORATORS — NO
// MODULE-LEVEL STATE, NO SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED
// RUNTIME. Calling `composePublicationDistributionRuntime()` twice
// constructs two entirely independent `uploader` instances and two
// entirely independent `publisher` instances (of whichever one
// `discoveryProvider` names each time — see "Selection, never fan-out,"
// above); neither call reads or writes anything outside its own arguments
// and return value — the identical restraint 0.9.36's and 0.9.43's own
// headers already hold for their own composed pairs, held here for a
// composed triple. (`describeDistribution` is the one exception, and is not
// an exception at all — see "describeDistribution is forwarded, never
// wrapped," above.)
//
// THIS FILE NEVER RE-IMPLEMENTS ANY SEMANTIC ALREADY OWNED BY ONE OF ITS
// COLLABORATORS. It contains no envelope-shape knowledge (no
// `protocol`/`version`/`kind`/`objectId`/`uri` literal of its own, no
// `describeDecentralizedDiscoveryEnvelope` import), no Publication
// validation of its own (no `.signature`/`.id` check — that stays entirely
// `describePublicationDistribution()`'s own), no Nostr event construction
// (no `tags`/`content`/`kind` template, no `JSON.stringify` of an envelope
// — that stays entirely `NostrPublicationDiscoveryPublisher`'s own), no
// Arweave transaction, tag, or uri construction of any kind (no `ar://`
// prefix, no transaction-id pattern, no Arweave Tag literal — that stays
// entirely `ArweavePublicationMaterialUploader`'s or
// `ArweaveAnnouncementPublisher`'s own, respectively), and no retry,
// caching, deduplication, or trust/ranking vocabulary of any kind.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`publishPublication()`, or any other single call that performs
//   serialize → upload → describe → publish automatically.** See "No new
//   orchestration," above — that is publication distribution EXECUTION/
//   STATE semantics, an explicitly separate, later, unscheduled milestone.
// - **Retry policy, for the uploader or either discovery publisher.**
//   Neither 0.9.45, 0.9.46, nor 0.9.428 retries on its own; this file adds
//   no retry on top.
// - **Compensating actions when one substrate succeeds and the other
//   fails** (e.g. un-publishing an announcement after a later failure, or
//   deciding whether an already-uploaded `materialUri` should be reused).
//   This file never observes the outcome of one collaborator's call in
//   order to react to it with another — it never calls any of them at all.
// - **Publishing to more than one relay/gateway, or any relay-or-gateway
//   selection, preference, or fallback policy WITHIN one substrate.**
//   `nostrPublisherOptions` and `arweaveAnnouncementPublisherOptions` each
//   compose exactly one instance of their own publisher, scoped to one
//   relay/gateway, one discovery tag, per instance; a caller wanting a
//   second relay or gateway calls this function twice.
// - **Publishing to MORE THAN ONE discovery substrate from a single call, or
//   any fallback between Arweave and Nostr.** See "Selection, never
//   fan-out," above — `discoveryProvider` picks exactly one; a caller
//   wanting both calls this function twice and sequences both `publisher`s
//   itself.
// - **Any UI, panel, or preference control surfacing `discoveryProvider` to
//   a person.** This file accepts the choice as a parameter; where that
//   parameter's value comes from in a real, running application — a
//   preference, a registry, a hardcoded default — remains entirely a
//   caller's own concern, unscheduled here.
// - **A discovery-role keyed registry, or any change to `application/
//   RoleAwareProviderResolver.js`.** `discoveryProvider` is a plain string
//   parameter this file itself branches on; it is not, and does not
//   require, a registry lookup.
// - **Publication distribution state tracking or persistence of any kind.**
//   This file returns collaborators; it holds no record of any call ever
//   made through them.
// - **Deduplicating repeated uploads or publishes.** Inherited unchanged
//   from 0.9.45's, 0.9.46's, and 0.9.428's own "no caching, no retry, no
//   deduplication" restraints — this file adds no policy of its own on top
//   of theirs.
// - **Publication withdrawal, announcement replacement, or any mutation of
//   an already-published announcement.** No collaborator this file composes
//   exposes such an operation; this file invents none either.
// - **A concrete `signer`, `publishImpl`, or `uploadTaggedTransaction`
//   implementation.** All three remain entirely a caller's own concern,
//   exactly as 0.9.45's, 0.9.46's, and 0.9.428's own headers already leave
//   them.
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
// exactly one fresh discovery publisher — `NostrPublicationDiscoveryPublisher`
// (0.9.46) when `discoveryProvider` is `'nostr'` (the default, preserving
// every existing caller's behavior unchanged), or `ArweaveAnnouncementPublisher`
// (0.9.428) when it is `'arweave'` — and returns both alongside
// `PublicationDistributionDescriptor.js`'s own `describePublicationDistribution`
// (0.9.44, forwarded unmodified — see this file's own header,
// "describeDistribution is forwarded, never wrapped"). `arweaveUploaderOptions`,
// `nostrPublisherOptions`, and `arweaveAnnouncementPublisherOptions` are each
// forwarded verbatim to their own collaborator's constructor; see this
// file's own header, "arweaveUploaderOptions, nostrPublisherOptions, and
// arweaveAnnouncementPublisherOptions are forwarded verbatim." A malformed
// option for any constructed collaborator throws exactly as that
// collaborator's own constructor already throws on its own; see "A
// construction failure propagates." An unrecognized `discoveryProvider`
// throws before either collaborator is constructed; see "discoveryProvider
// itself is the one new option," above.
export function composePublicationDistributionRuntime({
    arweaveUploaderOptions = {},
    discoveryProvider = 'nostr',
    nostrPublisherOptions = {},
    arweaveAnnouncementPublisherOptions = {}
} = {}) {
    const uploader = new ArweavePublicationMaterialUploader(arweaveUploaderOptions);

    let publisher;
    if (discoveryProvider === 'nostr') {
        publisher = new NostrPublicationDiscoveryPublisher(nostrPublisherOptions);
    } else if (discoveryProvider === 'arweave') {
        publisher = new ArweaveAnnouncementPublisher(arweaveAnnouncementPublisherOptions);
    } else {
        throw new Error(`PublicationDistributionRuntimeComposition: unrecognized discoveryProvider "${discoveryProvider}" — expected "nostr" or "arweave"`);
    }

    return Object.freeze({
        uploader,
        describeDistribution: describePublicationDistribution,
        publisher
    });
}
