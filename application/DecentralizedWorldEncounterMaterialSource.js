import { WorldEncounterMaterialSource } from './WorldEncounterMaterialLoading.js';
import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';

// 0.9.33 — Decentralized World Encounter Material Source.
//
// 0.9.21 named the seam and left `materialSources.decentralized` unplugged.
// 0.9.22 plugged in the local half; 0.9.23 plugged in the peer half. This
// milestone plugs in the third — but a decentralized lead reaches this
// point differently than a local record or a live peer ever did. Local
// storage and a connected peer are both already IN HAND: `origin` alone
// (`'local'`, `'peer:<identityId>'`) is enough to route a resolved
// selection all the way to its material. A decentralized lead is, at best,
// an unverified rumor about a `uri` — 0.9.28's own header already refused
// to let a resolved selection's own `origin` stand in for a lead's
// identity: "None of the three fields a lead already carries can honestly
// answer 'does this lead correspond to publication P123.'" That work is
// already done, one layer up, by 0.9.28's own
// `resolveDecentralizedWorldEncounterLead()`. This file is the next step
// after that resolution has already happened — never before it.
//
//   selected World encounter
//        resolvedSelection = { kind, objectId, origin }        (0.9.19/20)
//                       │
//                       │        application/DecentralizedWorldEncounterLeadResolution.js
//                       │             resolveDecentralizedWorldEncounterLead()   (0.9.28,
//                       │             unmodified) — already resolved, elsewhere,
//                       │             from a requestedMaterial = { kind, objectId }
//                       │             the caller derives from the very same selection
//                       │                       │
//                       ▼                       ▼
//                resolvedSelection          resolvedLead = { origin, discoveryTag,
//                       │                     uri, storage? }   (0.9.24)
//                       └───────────┬───────────┘
//                                   ▼
//   application/DecentralizedWorldEncounterMaterialSource.js   ★ (THIS)
//        DecentralizedWorldEncounterMaterialSource#load(resolvedSelection, resolvedLead)
//                                   │
//                                   ▼
//                     injected retrieveByUri(resolvedLead.uri)
//                                   │
//                   ┌───────────────┼───────────────┐
//                   ▼               ▼               ▼
//                ar://           ipfs://         https://
//           (no concrete resolver of any kind ships in this
//            milestone — see "Deliberately excluded," below)
//                                   │
//                                   ▼
//                    material, or null — not currently available
//
// A RETRIEVER, NEVER A SECOND RESOLVER. This file never imports
// `application/DecentralizedWorldEncounterLeadResolution.js`,
// `application/DecentralizedWorldDiscoveryLeadRegistry.js`,
// `core/DecentralizedWorldEncounterLeadAssociation.js`, or
// `application/DecentralizedWorldDiscoveryQuery.js`. It is handed a
// `resolvedLead` a caller already resolved, exactly the way 0.9.22's own
// `LocalWorldEncounterMaterialSource` is handed an already-connected
// `storageProvider` rather than discovering one, and 0.9.23's own
// `PeerWorldEncounterMaterialSource` is handed an already-connected peer's
// own identity rather than re-running peer discovery. Material loading
// must not rediscover what selection resolution has already resolved —
// reaching into a lead registry from inside this file to "find the
// matching lead" itself would build a second, hidden resolution mechanism
// alongside 0.9.28's own, and this file refuses to.
//
// THE `WorldEncounterMaterialSource` CONTRACT IS EXTENDED, NOT REPLACED —
// A SECOND, OPTIONAL ARGUMENT, NEVER A NEW BASE METHOD. 0.9.21's own
// `WorldEncounterMaterialSource#load(resolvedSelection)` is the contract
// `LocalWorldEncounterMaterialSource` and `PeerWorldEncounterMaterialSource`
// already implement with exactly one argument, because both of those
// sources can answer "what material?" from `resolvedSelection` alone. A
// decentralized source cannot — the retrieval `uri` lives on the
// resolved lead, not on the selection — so this class's own `load()`
// accepts a second, additional argument, `resolvedLead`, that neither
// existing source needs or reads. Nothing about this widens
// `WorldEncounterMaterialSource` itself: the base class's own
// `load(resolvedSelection)` signature (and its own "always throws"
// contract for the unimplemented case) is untouched, and JavaScript
// already tolerates a subclass accepting more arguments than a caller
// happens to supply. `application/WorldEncounterMaterialLoading.js`
// (0.9.21) itself is not modified — see "Deliberately excluded," below,
// for exactly why wiring this class into its own `materialSources.decentralized`
// slot is not this milestone's job either.
//
// `resolvedLead` IS OPAQUE BEYOND ITS OWN `uri` — EXACTLY THE RESTRAINT
// 0.9.26's OWN LEAD REGISTRY ALREADY HOLDS, CONTINUED HERE ONE LAYER
// LATER. This file never reads `resolvedLead.origin`, `resolvedLead.discoveryTag`,
// or `resolvedLead.storage` — a lead's own identity triple was already
// spent by `resolveDecentralizedWorldEncounterLead()` to decide THAT this
// is the right lead; this file only needs WHERE it points. It never
// re-derives, re-validates, or re-describes a lead's own shape via
// `core/DecentralizedWorldDiscoveryLead.js`'s own
// `describeDecentralizedWorldDiscoveryLead()` — a caller is expected to
// hand this source an already-resolved lead, the same "already described,
// never re-validated" posture `LocalWorldEncounterMaterialSource` already
// holds for a `StorageProvider` and `PeerWorldEncounterMaterialSource`
// already holds for a `ConnectedPeer`.
//
// RETRIEVAL ITSELF IS SUBSTRATE-AGNOSTIC — THIS CLASS DOES NOT KNOW ABOUT
// ARWEAVE, IPFS, NOSTR, OR ANY OTHER BACKEND. `retrieveByUri`, injected
// through the constructor exactly the way `LocalWorldEncounterMaterialSource`
// is constructed around an injected `storageProvider`, is the ONLY thing
// this file ever calls to turn a `uri` into bytes/material. This file
// never imports `fetch`, `WebSocket`, `content/ContentStore.js`, or
// anything naming a specific decentralized backend — deciding what
// `ar://`, `ipfs://`, or `https://` actually mean, and whether one `uri`
// scheme routes to one resolver or another, is explicitly later,
// unscheduled work (a future "material resolvers" seam; see
// "Deliberately excluded," below). This mirrors the exact distinction the
// task that requested this milestone drew: discovery adapters answer
// "where might material be," material resolvers answer "give me the bytes
// at this uri" — this file is the boundary that calls the second kind,
// never the first.
//
// `material` IS NEVER INTERPRETED, VERIFIED, OR EVEN INSPECTED — INHERITED
// UNCHANGED FROM 0.9.21, 0.9.22, AND 0.9.23. Whatever `retrieveByUri()`
// resolves to is returned exactly as supplied — no `Publication.fromJSON()`,
// no `AvatarProfile.fromJSON()`, no hash check, no signature read. Unlike
// `PeerWorldEncounterMaterialSource#load()`, this file does not even
// attempt to deserialize a raw wire payload into a domain object — a
// decentralized retriever may already hand back a fully-formed object, a
// raw byte buffer, or a JSON blob, and this milestone does not yet decide
// which; that decision belongs to whatever "Retrieved Material Integrity
// Boundary" the task that requested this milestone described as future,
// unscheduled work.
//
// `null`/`undefined` ON A MISS, NEVER A THROW FOR "NOT FOUND" — THE SAME
// CONTRACT EVERY SIBLING SOURCE IN THIS FAMILY ALREADY HOLDS. `load()`
// resolves `null` when `resolvedSelection` is malformed, when
// `resolvedLead` carries no non-empty string `uri`, or when
// `retrieveByUri()` itself resolves to `null`/`undefined` — all three
// collapse to the same "not currently available" outcome, exactly
// `application/WorldEncounterMaterialLoading.js`'s own header's "zero/
// nothing means unavailable, never a distinguished special case." A
// rejection from `retrieveByUri()` itself — a genuine network failure, a
// malformed resolver, a bug — is never caught here; it propagates to this
// class's own caller unchanged, the same "a thrown rejection is never
// swallowed" restraint 0.9.21's own header already holds for a source's
// `load()` rejecting, held here one layer earlier for the injected
// resolver's own rejection.
//
// NO CACHING, NO RETRY, NO FALLBACK BETWEEN URIS, NO RANKING. Every call
// to `load()` calls `retrieveByUri()` exactly once, fresh, for exactly the
// one `uri` `resolvedLead` carries. A resolved lead names exactly one
// retrieval location — this file never falls back to a second `uri`,
// because a `resolvedLead` never carries more than one, and it is never
// this file's job to go collect alternatives.
//
// TWO STATUSES, NEVER A THIRD — INHERITED FROM 0.9.21. This file has no
// status vocabulary of its own; it returns material or `null`, exactly
// like every sibling `WorldEncounterMaterialSource`, and lets 0.9.21's own
// `loadWorldEncounterMaterial()` (when a future caller wires this in)
// translate that into `AVAILABLE`/`UNAVAILABLE`.
//
// NO SIGNATURE VERIFICATION, NO HASH CHECK, NO TRUST DECISION OF ANY KIND.
// See "material is never interpreted," above — inherited unchanged from
// every file in this family.
//
// SYNCHRONOUS VALIDATION, ASYNCHRONOUS RESULT — INHERITED FROM 0.9.21.
// `load()` performs no I/O of its own; every byte of actual retrieval work
// happens inside the injected `retrieveByUri`, exactly the way 0.9.21's
// own header already anticipated for "a future peer fetch" and, now, a
// decentralized one.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any concrete `retrieveByUri` implementation — Arweave, IPFS, Nostr,
//   or an HTTP mirror of any kind.** This file ships with no resolver of
//   its own; a caller injects one. Separate, later, unscheduled work
//   (probably Arweave first, since Nostr/Arweave discovery already
//   exists).
// - **Re-resolving, re-discovering, or re-validating which lead
//   corresponds to `resolvedSelection`.** See "A retriever, never a
//   second resolver," above — that is
//   `application/DecentralizedWorldEncounterLeadResolution.js`'s (0.9.28)
//   own job, already finished before this file is ever called.
// - **Wiring this class into `application/WorldEncounterMaterialLoading.js`'s
//   own `materialSources.decentralized` slot, or modifying that file in
//   any way.** 0.9.21's own `loadWorldEncounterMaterial()` routes purely
//   by a resolved selection's own `origin` family (`'local'` vs.
//   `'peer:...'`) and has no third family, and no `resolvedLead` parameter
//   of its own, for a decentralized origin — inventing one now would mean
//   inventing the very origin-naming convention 0.9.24's, 0.9.26's, and
//   0.9.28's own headers already, deliberately, left unscheduled ("a lead
//   is deliberately not yet a `ContentReference`"; "deciding whether an
//   accepted lead becomes a real `WorldDiscoverySource` contribution...
//   unscheduled, later work"). Until a future milestone decides how a
//   decentralized lead ever becomes a selectable World encounter with its
//   own `origin` in the first place, this class is called directly by a
//   caller already holding both a `resolvedSelection` and a
//   `resolvedLead` — exactly this milestone's own two-argument contract.
// - **Signature verification, hash verification, content authentication,
//   caching, retries, ranking, fallback, automatic discovery, or
//   multi-uri selection.** See this file's own header throughout — all
//   explicitly later, unscheduled work (a future "Retrieved Material
//   Integrity Boundary" / "Publication Signature Verification" pair).
// - **A `PENDING`, `ERROR`, or `UNVERIFIED` status.** See "Two statuses,
//   never a third," above.
// - **Interpreting, deserializing, or reshaping the `material`
//   `retrieveByUri()` returns.** See "material is never interpreted,"
//   above.

function isRetrievableLead(resolvedLead) {
    return Boolean(resolvedLead)
        && typeof resolvedLead === 'object'
        && typeof resolvedLead.uri === 'string'
        && resolvedLead.uri.length > 0;
}

export class DecentralizedWorldEncounterMaterialSource extends WorldEncounterMaterialSource {
    // retrieveByUri: (uri: string) => Promise<material | null | undefined>
    //   — the injected, substrate-agnostic retrieval function this source
    //   calls with exactly one argument, `resolvedLead.uri`. See this
    //   file's own header, "Retrieval itself is substrate-agnostic."
    constructor(retrieveByUri) {
        super();
        if (typeof retrieveByUri !== 'function') {
            throw new Error('DecentralizedWorldEncounterMaterialSource: a retrieveByUri function is required');
        }
        this._retrieveByUri = retrieveByUri;
    }

    // Returns a Promise resolving to whatever the injected `retrieveByUri`
    // resolves to for `resolvedLead.uri`, or to `null` when
    // `resolvedSelection` is malformed, when `resolvedLead` carries no
    // non-empty string `uri`, or when `retrieveByUri` itself resolves to
    // `null`/`undefined`. A rejection from `retrieveByUri` propagates
    // unchanged — see this file's own header, "A thrown rejection is
    // never swallowed." `resolvedSelection` is validated only for
    // well-formedness (via 0.9.19's own
    // `describeWorldEncounterSelectionIdentity()`) and is otherwise never
    // read — this class matches `resolvedLead` and `resolvedSelection`
    // together exactly as far as trusting that its caller already
    // resolved them correctly; see "A retriever, never a second
    // resolver," above.
    async load(resolvedSelection, resolvedLead) {
        if (!describeWorldEncounterSelectionIdentity(resolvedSelection)) {
            return null;
        }
        if (!isRetrievableLead(resolvedLead)) {
            return null;
        }
        const material = await this._retrieveByUri(resolvedLead.uri);
        if (material === null || typeof material === 'undefined') {
            return null;
        }
        return material;
    }
}
