import { NostrDiscoveryQueryService } from './NostrDiscoveryQueryService.js';
import { ArweaveGraphqlDiscoveryQueryService } from './ArweaveGraphqlDiscoveryQueryService.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from './DecentralizedWorldDiscoveryLeadRegistry.js';
import { queryDecentralizedWorldDiscoveryIntoRegistry } from './DecentralizedWorldDiscoveryQueryRegistryBridge.js';
import { deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry } from './DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js';
import {
    resolveDecentralizedWorldEncounterLeadFromRegistry,
    DecentralizedWorldEncounterLeadResolutionStatus
} from './DecentralizedWorldEncounterLeadResolution.js';
import { inspectWorldEncounterMaterial } from './WorldEncounterMaterialInspection.js';
import { composeWorldEncounterMaterialSources } from './DecentralizedWorldEncounterMaterialRuntimeComposition.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.110 — Decentralized Material Retrieval Runtime Composition.
//
// 0.9.24 through 0.9.43 built a complete decentralized discovery/material
// chain — query a service, register a lead, resolve it against evidence,
// load a resolved lead's own material, verify it — and every one of those
// files' own header named the same gap one layer up: nothing in this
// codebase ever calls all of them together against a running application.
// 0.9.99/0.9.100/0.9.103/0.9.104 already did exactly this kind of
// composition-root wiring for local material verification and publication
// distribution; this file is the missing counterpart for the OTHER half of
// the loop 0.9.102's own audit named — decentralized discovery.
//
//   host Nostr query capability?        host fetch (Arweave GraphQL
//        │                               already works with none)
//        ▼                                        │
//   composeDecentralizedWorldEncounterMaterialDiscoveryServices()   ★ (THIS)
//        │                                        │
//        ▼                                        ▼
//   NostrDiscoveryQueryService | null   ArweaveGraphqlDiscoveryQueryService
//        (0.9.31, unmodified)                (0.9.25, unmodified)
//                    │                                │
//                    └────────────────┬───────────────┘
//                                     ▼
//   composeDecentralizedWorldEncounterMaterialDiscoveryRuntime()   ★ (THIS)
//        discoverWorldEncounterPublication({ objectId, discoveryTag, publications })
//                                     │
//        queryDecentralizedWorldDiscoveryIntoRegistry()   (0.9.27, unmodified)
//        — once per configured service, independently, never combined
//                                     │
//                                     ▼
//        DecentralizedWorldDiscoveryLeadRegistry   (0.9.26, unmodified)
//                                     │
//        deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry()
//        (0.9.29, unmodified — evidence from already-known local Publications)
//                                     │
//        resolveDecentralizedWorldEncounterLeadFromRegistry()   (0.9.28,
//             unmodified — UNAVAILABLE / RESOLVED / AMBIGUOUS, unranked)
//                                     │
//                          only when RESOLVED
//                                     ▼
//        inspectWorldEncounterMaterial()   (0.9.39, unmodified — the SAME
//             loading → identity-verification → signature-verification
//             chain 0.9.99 already wired for local material)
//                                     │
//                                     ▼
//        { discovery, resolution, inspection }
//
// A COMPOSITION ROOT, NEVER A FOURTH ALGORITHM. This file performs no
// discovery, no resolution, no ranking, no retrieval, and no verification
// of its own — it has no `search()`, no `resolveIdentity()`, no
// `verifyIdentity()`, and no comparison between candidates anywhere in it.
// Its two exported functions do exactly two jobs: build the concrete
// discovery-service pair (or gracefully omit the one with no real host
// capability), and wire the already-existing pipeline's own functions
// together in the order the 0.9.24-through-0.9.43 chain already
// established. Every behavior a caller observes through either function's
// result is entirely those already-existing files' own, unmodified.
//
// TWO SUBSTRATES, TWO DIFFERENT REACHABILITY STORIES — NEITHER FORCED TO
// MATCH THE OTHER. Arweave's own discovery query (a GraphQL `fetch`,
// read-only) already works with no host capability at all, exactly the way
// `ArweaveWorldEncounterMaterialResolver` (0.9.35) and
// `ArweaveGraphqlDiscoveryQueryService` (0.9.25) already default to the
// browser's own global `fetch`. Nostr's own discovery query needs a real
// relay connection (`queryImpl`) this codebase has never had a host
// capability for — `NostrDiscoveryQueryService`'s own constructor already
// throws without one, on purpose (0.9.31, unmodified). So
// `composeDecentralizedWorldEncounterMaterialDiscoveryServices()` only ever
// constructs the Nostr service when a real `nostrQueryImpl` is supplied;
// with none supplied it resolves `nostr: null`, and
// `discoverWorldEncounterPublication()` simply skips a `null` service
// rather than querying it — never a throw, never a fabricated empty
// service. This is the discovery-side mirror of 0.9.108's and 0.9.109's own
// restraint for distribution: a real seam, wired today with whatever
// capability genuinely exists, ready for a real host Nostr capability to
// plug into later without touching anything below it.
//
// EACH CONFIGURED SERVICE IS QUERIED INDEPENDENTLY, NEVER COMBINED OR
// RANKED. `discoverWorldEncounterPublication()` calls 0.9.27's own
// `queryDecentralizedWorldDiscoveryIntoRegistry()` once per configured
// service — never a `Promise.all()` that merges results, never a
// preference for one service's leads over another's. Every lead either
// service reports lands in the SAME shared registry, side by side, exactly
// the way `DecentralizedWorldDiscoveryLeadRegistry`'s own header already
// requires ("no deduplication, ranking, or trust judgment across leads").
// The `discovery` field of this file's own result names which services
// were actually queried and what each one reported — visibility, never a
// judgment.
//
// RESOLUTION NEVER PICKS A CANDIDATE — AMBIGUOUS STAYS AMBIGUOUS.
// `discoverWorldEncounterPublication()` calls 0.9.28's own
// `resolveDecentralizedWorldEncounterLeadFromRegistry()` unchanged and
// returns its `{ status, candidates, resolvedLead }` verbatim as this
// file's own `resolution` field. Material is only ever loaded and verified
// (via `inspectWorldEncounterMaterial()`) when `status` is exactly
// `RESOLVED` — an `AMBIGUOUS` or `UNAVAILABLE` result carries a `null`
// `inspection`, never a guess at which candidate to try, exactly the
// restraint every file in this chain already holds.
//
// `publications` IS THE CALLER'S OWN EVIDENCE SOURCE, NEVER FETCHED HERE.
// Association evidence (0.9.29) can only ever connect a currently-known
// lead to a Publication this replica has ALREADY signed and stored
// locally — a decentralized lead corroborating a Publication this replica
// published itself, discovered back through Nostr/Arweave, is exactly the
// scenario this whole family was built to make verifiable end to end (see
// 0.9.99's own "a local-origin selection... exercises the full chain end
// to end"). This file never constructs a `LocalDiscoveryProvider`,  never
// reads `StorageProvider`, and never invents a second evidence producer —
// a caller (typically `ui/main.js`, from the SAME local publication
// listing `LocalWorldEncounterMaterialSource` itself reads from) supplies
// `publications` fresh on every call, exactly the "handed already-fetched
// records" restraint 0.9.29's own header already holds.
//
// `resolvedSelection.origin` NAMES THE DISCOVERY SERVICE, NEVER A
// `WorldDiscoverySource`. A decentralized-discovered publication was never
// selected through a local/peer `WorldDiscoverySource` — there is no
// existing origin vocabulary for it to reuse. `describeWorldEncounterSelectionIdentity()`
// (0.9.19, unmodified, called one layer down by every loading/verification
// boundary this file calls) validates `origin` only for being a non-empty
// string; it is never read for routing anywhere in the chain below this
// file (see 0.9.34's own header, "calling this function at all is the
// routing decision"). So this file uses the resolved lead's own `origin`
// (the discovery service's own identity, e.g.
// `dweb:arweave-graphql:https://arweave.net/graphql`) — a real, honest fact
// about where the lead came from, never an invented placeholder, and never
// confused with a `WorldDiscoverySource`'s own `origin` vocabulary.
//
// ENDS IN THE SAME `inspectWorldEncounterMaterial()` SHAPE 0.9.99'S OWN
// PANEL ALREADY RENDERS — NO SECOND INSPECTION REPRESENTATION. This file's
// own `inspection` field, when present, is exactly
// `{ selection, lead, loading, verification }` — 0.9.39's own unmodified
// return shape, carrying 0.9.21's own `WorldEncounterMaterialLoadStatus`
// and 0.9.37's own `WorldEncounterMaterialVerificationStatus`. No new
// status enum, no new trust vocabulary, and no second call to any loading
// or verification boundary — `inspectWorldEncounterMaterial()` is called
// exactly once per `discoverWorldEncounterPublication()` call, only when a
// lead actually resolved.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT PAIR OF SERVICES — NO MODULE-LEVEL
// STATE, NO SINGLETON. `composeDecentralizedWorldEncounterMaterialDiscoveryServices()`
// mirrors 0.9.36's and 0.9.43's own "every call builds a fresh, independent
// set" restraint. `composeDecentralizedWorldEncounterMaterialDiscoveryRuntime()`
// reuses an already-constructed `leadRegistry` when one is supplied (so a
// caller can share ONE registry between this runtime and
// `ui/components/WorldEncounterCanvas.js`'s own already-existing
// `worldDiscoveryLeadRegistry` prop) and constructs a fresh one otherwise.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Ranking discovered publications, or picking a "best" source.** See
//   "each configured service is queried independently," above.
// - **Wallet integration, private-key handling, or automatic signer
//   acquisition.** This file only ever reads (discovery query, material
//   retrieval); it imports nothing from the distribution/signing family
//   (`ArweavePublicationMaterialUploader.js`, `NostrPublicationDiscoveryPublisher.js`,
//   `PublicationDistributionOrchestrator.js`).
// - **Nostr relay management UI, distribution retries, or distribution
//   progress UI.** This file has no UI of any kind, and never imports
//   `ui/`.
// - **New lifecycle states or new verification semantics.** This file
//   invents no status vocabulary of its own — see "Ends in the same
//   inspectWorldEncounterMaterial() shape," above.
// - **Decentralized caching, peer reputation, or automatic background
//   discovery.** `discoverWorldEncounterPublication()` runs to completion
//   once per call and returns; there is no timer, no cache, and no
//   `trust`/`reputation` field anywhere in this file.
// - **Replacing local material loading.** `materialSources.local` is
//   forwarded through unchanged (via 0.9.36's own
//   `composeWorldEncounterMaterialSources()`); this file adds
//   `.decentralized` alongside it, never in place of it.

// Constructs the concrete discovery-service pair a real composition root
// actually uses — see this file's own header, "two substrates, two
// different reachability stories." `nostrQueryImpl` is a real host Nostr
// relay-query capability (none exists anywhere in this codebase yet); when
// omitted, `nostr` resolves `null` rather than constructing a service that
// would only throw on its own `search()`. Arweave's own service is always
// constructed — it already works against the browser's own global `fetch`
// with no host capability at all, exactly like the material resolver
// (0.9.35) and the concrete Arweave discovery service (0.9.25) themselves
// already do; a malformed `arweaveFetchImpl` (or no `fetch` available at
// all, e.g. in a bare Node test) throws exactly as
// `new ArweaveGraphqlDiscoveryQueryService(...)` already throws on its own.
export function composeDecentralizedWorldEncounterMaterialDiscoveryServices({
    nostrQueryImpl = null,
    nostrRelayUrl,
    nostrTagName,
    nostrKinds,
    arweaveFetchImpl,
    arweaveGraphqlUrl,
    arweaveTagName
} = {}) {
    const nostr = typeof nostrQueryImpl === 'function'
        ? new NostrDiscoveryQueryService({
            queryImpl: nostrQueryImpl,
            relayUrl: nostrRelayUrl,
            tagName: nostrTagName,
            kinds: nostrKinds
        })
        : null;

    const arweave = new ArweaveGraphqlDiscoveryQueryService({
        fetchImpl: arweaveFetchImpl,
        graphqlUrl: arweaveGraphqlUrl,
        tagName: arweaveTagName
    });

    return Object.freeze({ nostr, arweave });
}

// Builds the one application-facing capability a real composition root
// injects into the application layer — see this file's own header for the
// complete diagram. `leadRegistry` is reused verbatim when supplied (so a
// caller can share the SAME registry `WorldEncounterCanvas`'s own
// `worldDiscoveryLeadRegistry` prop already observes), or constructed fresh
// otherwise. `discoveryServices` is the `{ nostr, arweave }` shape
// `composeDecentralizedWorldEncounterMaterialDiscoveryServices()` returns
// (a `null`/absent entry is simply never queried). `local`/`peer`/
// `arweaveResolverOptions` are forwarded verbatim to 0.9.36's own
// `composeWorldEncounterMaterialSources()`. `verifier` is forwarded verbatim
// to `inspectWorldEncounterMaterial()` — typically 0.9.43's own
// `composeWorldEncounterMaterialVerifier().verifier`, unmodified.
export function composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
    leadRegistry,
    discoveryServices,
    local,
    peer,
    arweaveResolverOptions,
    verifier
} = {}) {
    const registry = leadRegistry || new DecentralizedWorldDiscoveryLeadRegistry();
    const materialSources = composeWorldEncounterMaterialSources({ local, peer, arweaveResolverOptions });
    const services = discoveryServices && typeof discoveryServices === 'object' ? discoveryServices : {};

    // The one entry point a caller (a World View action, a test) actually
    // uses. Queries every configured, non-null service in `services` into
    // `registry` (independently — see this file's own header), derives
    // association evidence from `publications` against the registry's own
    // now-current leads, resolves `{ kind: PUBLICATION, objectId }` against
    // that evidence, and — only when resolution is exactly RESOLVED — loads
    // and verifies the resolved lead's own material via the unmodified
    // 0.9.39 orchestration boundary. Never throws for malformed input; every
    // collaborator this function calls already degrades gracefully on its
    // own (see each one's own header). A genuine rejection from a
    // configured discovery service's own query, or from loading/
    // verification, propagates to this function's own caller unchanged —
    // exactly the "a thrown rejection is never swallowed" restraint every
    // file in this chain already holds.
    async function discoverWorldEncounterPublication({ objectId, discoveryTag, publications } = {}) {
        const requestedMaterial = Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId });

        const discovery = {};
        for (const serviceName of Object.keys(services)) {
            const service = services[serviceName];
            if (!service) {
                continue;
            }
            discovery[serviceName] = await queryDecentralizedWorldDiscoveryIntoRegistry(registry, service, discoveryTag);
        }

        const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry({ publications, registry });
        const resolution = resolveDecentralizedWorldEncounterLeadFromRegistry({ requestedMaterial, registry, associations });

        let inspection = null;
        if (resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED) {
            const resolvedSelection = Object.freeze({
                kind: WorldEncounterKind.PUBLICATION,
                objectId,
                origin: resolution.resolvedLead.origin
            });
            inspection = await inspectWorldEncounterMaterial({
                resolvedSelection,
                resolvedLead: resolution.resolvedLead,
                materialSources,
                verifier
            });
        }

        return Object.freeze({ discovery: Object.freeze(discovery), resolution, inspection });
    }

    return Object.freeze({ registry, materialSources, discoverWorldEncounterPublication });
}
