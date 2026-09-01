import { ArweaveWorldEncounterMaterialResolver } from './ArweaveWorldEncounterMaterialResolver.js';
import { DecentralizedWorldEncounterMaterialSource } from './DecentralizedWorldEncounterMaterialSource.js';

// 0.9.36 — Decentralized World Encounter Material Runtime Composition.
//
// 0.9.33 built a real `WorldEncounterMaterialSource` for the decentralized
// path, constructed around one injected `retrieveByUri`. 0.9.35 built a
// real `retrieveByUri` — `ArweaveWorldEncounterMaterialResolver`, an
// `ar://` gateway retriever. Neither file would import the other: 0.9.33's
// own header called that "explicitly unscheduled... real runtime
// composition wired into `materialSources.decentralized` (0.9.36)," and
// 0.9.35's own header repeated it verbatim. This file is that composition
// — the first place in this codebase that imports both files together and
// actually constructs one from the other. It contains no new algorithm:
// every behavior a caller sees through the object this file returns is
// entirely 0.9.33's and 0.9.35's own, unmodified.
//
//   new ArweaveWorldEncounterMaterialResolver(resolverOptions)   (0.9.35,
//        unmodified)
//                    │
//                    │   resolver.retrieveByUri  (bound, one function)
//                    ▼
//   application/DecentralizedWorldEncounterMaterialRuntimeComposition.js   ★ (THIS)
//        composeArweaveDecentralizedWorldEncounterMaterialSource()
//                    │
//                    ▼
//   new DecentralizedWorldEncounterMaterialSource(resolver.retrieveByUri)   (0.9.33,
//        unmodified)
//                    │
//                    ▼
//        composeWorldEncounterMaterialSources({ local, peer, ... })
//                    │
//                    ▼
//        { local, peer, decentralized }
//                    │
//              ┌─────┴─────────────────────────┐
//              ▼                                ▼
//   application/WorldEncounterMaterialLoading.js   application/
//        loadWorldEncounterMaterial()             DecentralizedWorldEncounterLeadAwareMaterialLoading.js
//        (0.9.21, unmodified — still routes           loadWorldEncounterMaterialFromResolvedLead()
//         only `local`/`peer:...`)                    (0.9.34, unmodified — reads `.decentralized`
//                                                       once a caller already holds a resolvedLead)
//
// COMPOSITION, NEVER A FOURTH ALGORITHM. This file performs no retrieval,
// no resolution, and no loading of its own — it has no `load()`, no
// `retrieveByUri()`, and no `async` function anywhere in it. Its only job
// is object construction: build a resolver, build a source around it,
// hand back the result. Every retrieval behavior a caller ever observes —
// the `ar://` prefix check, the size ceiling, the timeout, the
// `null`-on-miss/reject-on-failure contract — is 0.9.33's and 0.9.35's own,
// entirely unmodified by this file.
//
// THIS FILE NEVER IMPORTS DISCOVERY, LEADS, OR RESOLUTION — WIRING THE
// RETRIEVAL SLOT IS NOT THE SAME AS WIRING DISCOVERY INTO IT. This file
// never imports `application/DecentralizedWorldEncounterLeadResolution.js`,
// `application/DecentralizedWorldDiscoveryLeadRegistry.js`, `application/
// DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js`,
// `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`,
// `application/DecentralizedWorldDiscoveryQuery.js`, `application/
// NostrDiscoveryQueryService.js`, or any UI. The recommendation that
// requested this milestone drew an explicit line: a discovery lead is not
// automatically a World encounter, and this milestone does not blur that
// line by reaching upstream to "help." The object this file returns
// answers only "how does a decentralized `uri`, once a caller already
// holds one, become material" — never "which leads exist" or "which lead
// corresponds to which encounter." A caller still supplies its own
// already-resolved `resolvedLead` (0.9.28's own `RESOLVED` output) to
// `loadWorldEncounterMaterialFromResolvedLead()`; this file changes
// nothing about how that lead was resolved, or whether it should have
// been.
//
// `local` AND `peer` ARE FORWARDED VERBATIM, NEVER CONSTRUCTED HERE. This
// file never imports `application/LocalWorldEncounterMaterialSource.js` or
// `application/PeerWorldEncounterMaterialSource.js` — a caller who already
// has a local and/or peer source constructs each independently (0.9.22,
// 0.9.23, unmodified) and hands both to
// `composeWorldEncounterMaterialSources()` exactly as it would hand them
// directly to `loadWorldEncounterMaterial()`'s own `materialSources`
// argument today. This file only ever fills in the one slot 0.9.33 and
// 0.9.35 left for it — `decentralized` — and passes `local`/`peer` through
// completely unread and unmodified.
//
// `application/WorldEncounterMaterialLoading.js` (0.9.21) IS STILL NEVER
// MODIFIED, AND STILL NEVER ROUTES TO `decentralized` ON ITS OWN. This
// file's own `{ local, peer, decentralized }` result is exactly the shape
// `loadWorldEncounterMaterial()` already accepts as its `materialSources`
// argument — but that function's own `materialSourceFor()` still
// recognizes only `origin === 'local'` and `origin.startsWith('peer:')`;
// it has no decentralized origin family to route through, exactly as
// 0.9.21's, 0.9.33's, and 0.9.34's own headers each already established,
// and this milestone invents no such convention either. Reaching the
// decentralized slot this file fills in still requires a caller to hold
// an already-resolved `resolvedLead` and call 0.9.34's own
// `loadWorldEncounterMaterialFromResolvedLead()` directly — this file
// changes nothing about that boundary.
//
// RESOLVER CONSTRUCTOR OPTIONS ARE FORWARDED VERBATIM, NEVER
// REINTERPRETED. `composeArweaveDecentralizedWorldEncounterMaterialSource(resolverOptions)`
// hands `resolverOptions` straight to `new ArweaveWorldEncounterMaterialResolver(resolverOptions)`
// — the exact same `{ gatewayUrl, fetchImpl, timeoutMs, maxResponseBytes }`
// shape that constructor already accepts and already defaults and
// validates entirely on its own. This file adds no second default for any
// of those fields, and no new option of its own — a caller who wants a
// non-default gateway, a test double for `fetchImpl`, or a different size
// ceiling passes it here exactly as they would to the resolver's own
// constructor directly.
//
// A CONSTRUCTION FAILURE PROPAGATES, NEVER SWALLOWED. `new
// ArweaveWorldEncounterMaterialResolver(...)` already throws for a missing
// `fetchImpl` with no global `fetch` available, or an empty `gatewayUrl` —
// this file never wraps that construction in a `try`/`catch`, so a
// misconfigured caller fails loudly at composition time rather than
// silently receiving a source that would only fail later, on its first
// retrieval.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT PAIR — NO MODULE-LEVEL STATE, NO
// SINGLETON, NO CACHING OF A PREVIOUSLY-CONSTRUCTED SOURCE. Calling either
// exported function twice constructs two entirely independent resolvers
// and two entirely independent sources; neither call reads or writes
// anything outside its own arguments and return value. A caller that
// wants exactly one long-lived decentralized material source for its own
// running session calls this file once, at its own composition root, and
// keeps the result — exactly the same "a caller owns exactly one instance
// for as long as it cares to" restraint `application/
// DecentralizedWorldDiscoveryLeadRegistry.js`'s own header already holds
// for a lead registry.
//
// `material` IS STILL NEVER INTERPRETED, VERIFIED, OR EVEN INSPECTED —
// INHERITED UNCHANGED FROM EVERY FILE IN THIS FAMILY. This file does not
// add a verification step between the resolver and the source, and does
// not add one after either. Retrieved-but-unverified material stays
// exactly that, all the way through this milestone.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any caller that actually invokes this composition against a
//   selected World encounter, a UI action, or a running application.**
//   This file builds the object; nothing here decides when to call it,
//   and `ui/components/WorldEncounterCanvas.js` remains completely
//   untouched.
// - **Turning a discovery lead into a World encounter automatically, or
//   wiring `application/DecentralizedWorldEncounterLeadResolution.js`,
//   `application/DecentralizedWorldDiscoveryLeadRegistry.js`, or any
//   association-evidence producer into this file.** See "This file never
//   imports discovery, leads, or resolution," above — a resolved lead
//   still names material a caller already decided is worth loading, never
//   material this file goes looking for on its own.
// - **A second concrete `retrieveByUri` implementation — IPFS, Hive/Steem,
//   AT Protocol, or any other substrate — or any policy for choosing
//   between several once more than one exists.** This file composes
//   exactly one decentralized backend, Arweave, because exactly one
//   exists (0.9.35). A second backend, and how `materialSources.decentralized`
//   would ever compose more than one `retrieveByUri` behind it, is its
//   own, later, unscheduled milestone.
// - **Signature verification, hash verification, content authentication,
//   or any trust/ranking decision about retrieved material.** A future
//   "Retrieved Material Integrity Boundary" (0.9.37), unscheduled here.
// - **Caching, retrying, or falling back between gateways or sources.**
//   Inherited unchanged from 0.9.21, 0.9.33, and 0.9.35 — this file adds
//   no policy of its own on top of theirs.
// - **Modifying `application/WorldEncounterMaterialLoading.js` or
//   `application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js`
//   in any way, or inventing a decentralized `origin` naming convention
//   that would let the former route to `.decentralized` on its own.** See
//   "0.9.21 is still never modified," above.

// Constructs one fresh `ArweaveWorldEncounterMaterialResolver` (0.9.35)
// and one fresh `DecentralizedWorldEncounterMaterialSource` (0.9.33) wired
// around its own `retrieveByUri`, and returns both. `resolverOptions` is
// forwarded verbatim to the resolver's own constructor — see this file's
// own header, "Resolver constructor options are forwarded verbatim." A
// malformed `resolverOptions` (an empty `gatewayUrl`, no usable `fetchImpl`
// and no global `fetch`) throws exactly as `new
// ArweaveWorldEncounterMaterialResolver(...)` already throws on its own;
// see "A construction failure propagates."
export function composeArweaveDecentralizedWorldEncounterMaterialSource(resolverOptions = {}) {
    const resolver = new ArweaveWorldEncounterMaterialResolver(resolverOptions);
    const decentralized = new DecentralizedWorldEncounterMaterialSource(resolver.retrieveByUri);
    return Object.freeze({ resolver, decentralized });
}

// The one entry point a real composition root actually uses. Returns
// `{ local, peer, decentralized }` — exactly the `materialSources` shape
// `application/WorldEncounterMaterialLoading.js`'s own
// `loadWorldEncounterMaterial()` (0.9.21) and `application/
// DecentralizedWorldEncounterLeadAwareMaterialLoading.js`'s own
// `loadWorldEncounterMaterialFromResolvedLead()` (0.9.34) each already
// accept as their own `materialSources` argument, so the very same result
// this function returns can be handed to both, unmodified. `local` and
// `peer` are forwarded exactly as supplied — see this file's own header,
// "local and peer are forwarded verbatim, never constructed here";
// `arweaveResolverOptions` is forwarded to
// `composeArweaveDecentralizedWorldEncounterMaterialSource()` unchanged to
// build the `decentralized` slot.
export function composeWorldEncounterMaterialSources({ local, peer, arweaveResolverOptions } = {}) {
    const { decentralized } = composeArweaveDecentralizedWorldEncounterMaterialSource(arweaveResolverOptions);
    return Object.freeze({ local, peer, decentralized });
}
