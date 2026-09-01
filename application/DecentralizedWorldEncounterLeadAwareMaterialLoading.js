import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';
import { WorldEncounterMaterialLoadStatus } from './WorldEncounterMaterialLoading.js';

// 0.9.34 — Lead-Aware Decentralized Material Loading Boundary.
//
// 0.9.33 built a real `WorldEncounterMaterialSource` for the decentralized
// path — `DecentralizedWorldEncounterMaterialSource#load(resolvedSelection,
// resolvedLead)` — and deliberately refused to wire it into 0.9.21's own
// `loadWorldEncounterMaterial()`, because that boundary routes purely by a
// resolved selection's own `origin` FAMILY (`'local'` vs. `'peer:...'`) and
// has no third family, and no `resolvedLead` parameter, for a decentralized
// lead. Squeezing a lead into that one-argument contract would require
// inventing the very "decentralized origin" convention 0.9.24, 0.9.26, and
// 0.9.28 each deliberately left unscheduled. This file is the missing
// two-input path instead: the application-level bridge between an
// already-resolved selection, an already-resolved decentralized lead, and
// a material source — proving that discovery provenance (`origin`) and
// material provenance (`uri`) stay separate all the way through loading,
// rather than collapsing into one field.
//
//   selected World encounter
//        resolvedSelection = { kind, objectId, origin }          (0.9.19/20)
//                       │
//                       │      application/DecentralizedWorldEncounterLeadResolution.js
//                       │           resolveDecentralizedWorldEncounterLead()   (0.9.28,
//                       │           unmodified) — already resolved, elsewhere, from a
//                       │           requestedMaterial = { kind, objectId } the caller
//                       │           derives from the very same selection
//                       ▼                       ▼
//                resolvedSelection         resolvedLead = { origin, discoveryTag,
//                       │                    uri, storage? }              (0.9.24)
//                       └───────────┬───────────┘
//                                   ▼
//   application/DecentralizedWorldEncounterLeadAwareMaterialLoading.js   ★ (THIS)
//        loadWorldEncounterMaterialFromResolvedLead()
//                                   │
//                                   ▼
//                    materialSources.decentralized
//                    (a DecentralizedWorldEncounterMaterialSource-shaped
//                     WorldEncounterMaterialSource, 0.9.33, injected by the
//                     caller — never constructed here)
//                                   │
//                                   ▼
//                 source.load(resolvedSelection, resolvedLead)
//                                   │
//                        ┌──────────┴──────────┐
//                        ▼                     ▼
//                  UNAVAILABLE             AVAILABLE
//             (no selection, no lead,     (the injected source
//              no source, or no            actually had it)
//              material)
//                                   │
//                                   ▼
//   future, unscheduled: 0.9.35 (a real Arweave retrieveByUri()), 0.9.36
//   (wiring it into materialSources.decentralized at runtime), a
//   decentralized-origin naming convention that would let 0.9.21's own
//   loadWorldEncounterMaterial() route here directly.
//
// AN APPLICATION BOUNDARY, NEVER A THIRD RESOLVER AND NEVER A RETRIEVER OF
// ITS OWN. This file never imports `application/
// DecentralizedWorldEncounterLeadResolution.js`, `application/
// DecentralizedWorldDiscoveryLeadRegistry.js`, `core/
// DecentralizedWorldEncounterLeadAssociation.js`, or `application/
// DecentralizedWorldDiscoveryQuery.js` — it is handed a `resolvedLead` a
// caller already resolved, exactly the restraint 0.9.33 already holds one
// layer below. It also never imports `application/
// DecentralizedWorldEncounterMaterialSource.js` itself, or any concrete
// `retrieveByUri` implementation — a `materialSources.decentralized` slot
// is injected by the caller and used purely by its own `load()` shape
// (duck-typed, exactly the way 0.9.21 already treats `materialSources.local`
// and `materialSources.peer`), never constructed or required to be an
// `instanceof` anything this file names.
//
// SELECTING THE DECENTRALIZED SOURCE NEVER READS `origin` — CALLING THIS
// FUNCTION AT ALL IS THE ROUTING DECISION. 0.9.21's own `materialSourceFor()`
// dispatches `materialSources.local` vs. `materialSources.peer` by reading
// `resolvedSelection.origin`, because for those two families `origin` IS
// the retrieval address (this replica's own disk, or a specific connected
// peer). A decentralized lead's `origin` names something else entirely —
// 0.9.24's own header: "`origin` names the discovery service, never the
// URI... provenance stays at the service that reported the lead." Reading
// `resolvedSelection.origin` here, to decide whether this IS a
// decentralized load, would silently repurpose a discovery-service field
// as a material-routing field — exactly the collapse this milestone exists
// to prevent. So this file never reads `resolvedSelection.origin` for
// routing at all: a caller who already holds a `RESOLVED`
// `resolvedLead` (0.9.28's own output) has already made the routing
// decision by choosing to call THIS function instead of 0.9.21's own
// `loadWorldEncounterMaterial()`. `materialSources` here always names
// exactly one slot this file ever reads — `.decentralized` — so the very
// same `materialSources` object a caller already assembles for 0.9.21's
// own loader (`{ local, peer, decentralized }`) works here unchanged;
// `.local` and `.peer` are never read.
//
// `resolvedSelection` AND `resolvedLead` ARE EACH FORWARDED VERBATIM,
// NEVER MUTATED, NEVER RESHAPED, NEVER MERGED INTO ONE OBJECT. The exact
// object references a caller passes in come back unchanged on every
// result this file returns — `null` only when the corresponding input was
// never well-formed to begin with, the same "nothing to name" restraint
// 0.9.20's own `UNAVAILABLE` already holds for zero candidates.
// `describeWorldEncounterSelectionIdentity()` (0.9.19, unmodified) is used
// only to VALIDATE `resolvedSelection`'s own shape — its freshly-derived
// return value is discarded, never substituted for the caller's own
// reference — exactly 0.9.21's own restraint, continued here. This file
// never introduces a single collapsed identifier (no
// `"<origin>|<uri>"` composite key, no spreading both objects into one) —
// keeping them as two separate fields on the result, exactly as they
// arrived, is the whole architectural point: origin (who discovered it)
// and uri (where it is) are never allowed to blur into one fact, all the
// way through to the caller.
//
// `resolvedLead` IS VALIDATED ONLY FOR HAVING A USABLE `uri` — NEVER
// RE-DESCRIBED, NEVER RE-VALIDATED AGAINST ITS FULL SHAPE. Exactly the
// restraint 0.9.33's own header already holds ("this file never
// re-derives, re-validates, or re-describes a lead's own shape via
// `describeDecentralizedWorldDiscoveryLead()` — a caller is expected to
// hand this source an already-resolved lead"), continued here one layer
// up: this file checks only that `resolvedLead` is an object carrying a
// non-empty string `uri`, and never reads `resolvedLead.origin`,
// `.discoveryTag`, or `.storage` for any purpose — including routing. See
// "Selecting the decentralized source never reads origin," above, for
// why `storage` is not used to pick among multiple decentralized sources
// either: 0.9.33's own source is already substrate-agnostic behind one
// injected `retrieveByUri`, and this milestone introduces no second one to
// choose between. A future milestone deciding how multiple concrete
// backends (Arweave, IPFS, ...) compose behind `materialSources.decentralized`
// is explicitly unscheduled — see "Deliberately excluded," below.
//
// `material` IS NEVER INTERPRETED, VERIFIED, OR EVEN INSPECTED — INHERITED
// UNCHANGED FROM 0.9.21 AND 0.9.33. Whatever `materialSources.decentralized`'s
// own `load()` resolves to is returned exactly as supplied. No parsing, no
// schema check, no signature read, no hash check. This file does not even
// know that Arweave, IPFS, or any other substrate exists.
//
// TWO STATUSES, NEVER A THIRD — THE SAME `WorldEncounterMaterialLoadStatus`
// 0.9.21 ALREADY DEFINED, IMPORTED RATHER THAN RETYPED. A missing/malformed
// `resolvedSelection`, a `resolvedLead` with no usable `uri`, a missing
// `materialSources.decentralized` slot, and a registered source that
// itself resolves to `null`/`undefined` are all exactly the same
// `UNAVAILABLE` outcome — the same "zero/nothing means unavailable, never
// a distinguished special case" posture this whole chain already holds.
//
// NO CACHING, NO RETRY, NO FALLBACK OF ANY KIND. Every call to
// `loadWorldEncounterMaterialFromResolvedLead()` calls
// `materialSources.decentralized`'s own `load()` exactly once, fresh, for
// exactly the one `resolvedSelection`/`resolvedLead` pair supplied — never
// memoized, never retried, and never falling back to trying
// `materialSources.local` or `materialSources.peer` if the decentralized
// source comes back empty. A resolved lead named exactly one retrieval
// path; this file never goes looking for another.
//
// A THROWN REJECTION IS NEVER SWALLOWED — inherited unchanged from 0.9.21
// and 0.9.33. A rejected `load()` promise from `materialSources.decentralized`
// propagates to this function's own caller unchanged.
//
// NO SIGNATURE VERIFICATION, NO HASH CHECK, NO TRUST/RANKING/DISCOVERY
// VOCABULARY OF ANY KIND. This file does no discovery of its own (it is
// never handed anything to discover — both `resolvedSelection` and
// `resolvedLead` already arrive resolved), no verification, and no
// judgment about whether one lead was better than another — that judgment,
// if it is ever built at all, belongs to 0.9.28's own resolution boundary,
// never to this loading boundary sitting after it.
//
// SYNCHRONOUS VALIDATION, ASYNCHRONOUS RESULT — inherited unchanged from
// 0.9.21. This file performs no I/O of its own; every byte of actual
// retrieval work happens inside whatever `materialSources.decentralized`'s
// own `load()` does.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any concrete `retrieveByUri` implementation, or constructing a
//   `DecentralizedWorldEncounterMaterialSource` of its own.** A caller
//   injects an already-constructed `materialSources.decentralized`.
//   Separate, later, unscheduled work (0.9.35 — an Arweave resolver;
//   0.9.36 — wiring it into runtime composition).
// - **Re-resolving, re-discovering, or re-validating which lead
//   corresponds to `resolvedSelection`.** That is `application/
//   DecentralizedWorldEncounterLeadResolution.js`'s (0.9.28) own job,
//   already finished before this file is ever called.
// - **Modifying `application/WorldEncounterMaterialLoading.js`, or
//   inventing a decentralized `origin` naming convention that would let
//   its own `loadWorldEncounterMaterial()` route here automatically.**
//   That file's own `materialSourceFor()` still recognizes only `'local'`
//   and `'peer:...'` today; this file is a deliberately separate entry
//   point a caller uses once it already holds a resolved lead, not a
//   patch to the existing one-argument boundary. Whether the two loading
//   paths should ever converge is an explicit, later, unscheduled
//   decision.
// - **Choosing among multiple decentralized backends by `resolvedLead.storage`,
//   or any closed enum of storage substrates.** See "resolvedLead is
//   validated only for having a usable uri," above — `storage` stays open,
//   free-form, unread metadata at this layer, exactly as 0.9.24 already
//   established for it.
// - **Signature verification, hash verification, content authentication,
//   caching, retries, ranking, or automatic discovery of any kind.**
// - **A `PENDING`, `ERROR`, or `UNVERIFIED` status.** See "Two statuses,
//   never a third," above.
// - **Interpreting, parsing, or rendering the `material` a successful
//   result carries.** See "material is never interpreted," above.
// - **Mutating, merging, or collapsing `resolvedSelection` and
//   `resolvedLead` into one object.** See "resolvedSelection and
//   resolvedLead are each forwarded verbatim," above.

function isUsableLead(resolvedLead) {
    return Boolean(resolvedLead)
        && typeof resolvedLead === 'object'
        && typeof resolvedLead.uri === 'string'
        && resolvedLead.uri.length > 0;
}

function unavailable(resolvedSelection, resolvedLead) {
    return Object.freeze({
        status: WorldEncounterMaterialLoadStatus.UNAVAILABLE,
        resolvedSelection: resolvedSelection || null,
        resolvedLead: resolvedLead || null,
        material: null
    });
}

// The one entry point a caller actually uses. Validates `resolvedSelection`
// (via 0.9.19's own `describeWorldEncounterSelectionIdentity()`, used only
// to check well-formedness) and `resolvedLead` (only for a usable, non-empty
// string `uri`), then forwards both, verbatim, to `materialSources.decentralized`'s
// own `load(resolvedSelection, resolvedLead)` — see this file's own header
// for exactly what `UNAVAILABLE`/`AVAILABLE` each mean and what is
// deliberately excluded. Never throws for a missing/malformed selection, a
// lead with no usable uri, or a missing source; a genuine rejection from a
// source's own `load()` propagates to the caller unchanged.
export async function loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources } = {}) {
    if (!describeWorldEncounterSelectionIdentity(resolvedSelection)) {
        return unavailable(null, null);
    }

    if (!isUsableLead(resolvedLead)) {
        return unavailable(resolvedSelection, null);
    }

    const source = materialSources && typeof materialSources === 'object' ? materialSources.decentralized : null;
    if (!source || typeof source.load !== 'function') {
        return unavailable(resolvedSelection, resolvedLead);
    }

    const material = await source.load(resolvedSelection, resolvedLead);
    if (material === null || typeof material === 'undefined') {
        return unavailable(resolvedSelection, resolvedLead);
    }

    return Object.freeze({
        status: WorldEncounterMaterialLoadStatus.AVAILABLE,
        resolvedSelection,
        resolvedLead,
        material
    });
}
