// 0.9.24 — Decentralized World Discovery Source Boundary.
//
// 0.9.5 through 0.9.12 built an entire family around exactly two places
// World data can come from: this replica's own local storage, and an
// already-connected peer over `peer/PeerMessageBus.js`. Both share one
// property neither file's own header ever had to defend: the data
// arrives already IN HAND, from a source this device chose to trust
// enough to even ask. A decentralized network — a free search or index
// service reporting "I found something referencing your tag" — shares
// none of that. Nobody connected to it, nobody vetted it, and what it
// hands back is, at best, a rumor about where material MIGHT live. This
// file names the shape of that rumor. It does not chase it, verify it,
// or turn it into anything `core/WorldEncounter.js` can place.
//
//   Free/public search or index service
//   (which service, and how it's queried, is
//    0.9.25, unscheduled — this file is handed
//    whatever such a service already reported)
//                    │
//                    │   "I found something referencing
//                    │    the tag you asked me to watch for."
//                    ▼
//   core/DecentralizedWorldDiscoveryLead.js   ★ (THIS milestone)
//        describeDecentralizedWorldDiscoveryLead()
//                    │
//                    ▼
//        (future, unscheduled: 0.9.26 — Wire Decentralized Discovery
//         Into The Source Registry, which decides whether/how an
//         ACCEPTED lead is actually retrieved, hash-verified into a
//         real core/ContentReference.js, and turned into a
//         core/WorldDiscoverySource.js contribution)
//                    │
//                    ▼
//        core/WorldDiscoverySource.js   (0.9.5, unmodified)
//                    │
//                    ▼
//        core/WorldEncounter.js
//             deriveWorldEncounters()
//
// THIS IS THE SAME GAP `docs/Roadmap.md`'S OWN 0.7.2 ENTRY ALREADY NAMED
// AND NEVER FILLED — APPROACHED FROM THE WORLD SIDE INSTEAD OF THE
// PUBLICATION SIDE. 0.7.0 built `core/ContentReference.js` and `core/
// DecentralizedPublication.js` — a real, protocol-neutral, signed
// envelope around "here is where a copy of this content's bytes can be
// found," already shipped, not a hypothetical this file is inventing.
// But every one of 0.7.2 through 0.7.6's own "deliberately excluded"
// sections names the one piece that subsystem never built: "a
// decentralized discovery index... letting a caller find a publication
// without already knowing its locator" — `application/
// PublicationResolver.js#resolve()` only ever resolves an envelope it is
// HANDED; it never searches for one. This file is the first step back
// toward that same unfilled gap, six 0.7.x milestones and seventeen
// 0.9.x milestones later, from the World-encounter side rather than the
// publication-resolution side.
//
// A LEAD IS DELIBERATELY NOT YET A `ContentReference`, AND NOT YET A
// `DecentralizedPublication` — THIS FILE NEVER IMPORTS EITHER ONE. A
// `ContentReference` carries a `hash` its own constructor treats as
// near-required (`DecentralizedPublication`'s own constructor throws
// without one) — proof that specific bytes were actually retrieved and
// measured. A search or index service reporting a lead has done no such
// thing; it is reporting "try looking here," never "I fetched this and
// it hashes to X." Constructing a real `ContentReference` (or wrapping
// one in a `DecentralizedPublication`) out of an accepted lead, once
// something downstream has actually retrieved and hash-verified its
// bytes, is exactly the retrieval work 0.9.27+ (unscheduled) does — not
// this boundary.
//
// `uri`/`storage` — THE SAME TWO FIELD NAMES `core/ContentReference.js`
// ALREADY USES FOR THIS EXACT PURPOSE, DELIBERATELY REUSED RATHER THAN
// RENAMED. `ContentReference`'s own header already draws the picture
// this file needs one layer earlier: `uri` describes ONE retrieval
// mechanism for some content (`ipfs://CID`, `ar://transaction-id`,
// `https://mirror.example/...`), and `storage` names which backend that
// URI belongs to — both already open, free-form strings there, never a
// closed enum. A lead names a candidate `uri`/`storage` pair the exact
// same way, before anything has verified there is real, hash-matching
// content behind it. Reusing these two names now, instead of inventing
// `locator`/`locatorScheme` or similar, is what lets a future milestone
// build `new ContentReference({ uri: lead.uri, storage: lead.storage,
// hash: <verified after retrieval> })` without a field-renaming step in
// between.
//
// TWO IDENTIFIERS, DELIBERATELY KEPT SEPARATE — A DISCOVERY TAG IS NOT A
// URI. `discoveryTag` answers "can I find ForkBuild-related publications
// at all" — a protocol marker a query matched against, never proof of
// anything and never assumed unique (nothing stops a second, unrelated
// publisher from using the same tag). `uri` answers a completely
// different question — "where, exactly, would this specific content be
// retrieved from." Collapsing these two into one field would let a
// caller mistake "the query that matched" for "the address of the
// content," which are never the same fact and are validated here as two
// entirely independent, both-required strings.
//
// `origin` NAMES THE DISCOVERY SERVICE, NEVER THE URI — PROVENANCE STAYS
// AT THE SERVICE THAT REPORTED THE LEAD, EXACTLY AS 0.9.5's OWN `origin`
// NAMES THE SOURCE CONTAINER, NEVER A RECORD INSIDE IT. Three independent
// search services reporting the very same `uri` are three independent
// leads here — this file never treats a shared `uri` as evidence the
// three reports corroborate each other, and never lets a `uri` stand in
// for `origin` as if the content's own address were itself a trustworthy
// identity. That judgment — whether three leads sharing a `uri` mean
// anything at all — belongs to a future, unscheduled provenance-aware
// step over AN ARRAY of leads, the same one-layer-up relationship 0.9.7
// already holds to 0.9.5.
//
// `storage` STAYS AN OPEN, FREE-FORM LABEL HERE TOO — DELIBERATELY NOT A
// CLOSED ENUM, AND OPTIONAL. This file validates `storage` only for
// being a non-empty string when supplied at all, exactly mirroring
// `ContentReference`'s own openness; a lead that omits it is still a
// perfectly describable lead, with `storage: null`. This file never
// names IPFS, Arweave, or any specific blockchain in code, and never
// validates `storage` against a list of known values — see `content/
// ContentStore.js`'s own 0.2.14 header, which already named concrete
// backends as future work earned one at a time, never all at once.
//
// NO PUBLICATION ENVELOPE FIELDS OF ITS OWN — NO `kind`, NO `objectId`,
// NO `hash`, NO SIGNATURE. Until something downstream actually retrieves
// a lead's own bytes, this file has no honest way to tell a publication
// lead from an avatar lead, or to know which already-encounterable
// object (if any) a lead even refers to — so it does not pretend to. A
// lead this file describes says only "this discovery service, using this
// tag, points at this uri" — nothing about what kind of thing lives
// there, and nothing about whether it is what it claims to be.
//
// ONE LEAD PER CALL — NEVER COMBINED, DEDUPLICATED, OR RANKED HERE.
// `describeDecentralizedWorldDiscoveryLead()` describes exactly one
// reported lead. It has no plural counterpart in this file: no
// `combineDecentralizedWorldDiscoveryLeads()`, nothing that groups leads
// by `uri`, and nothing that decides one lead is more credible than
// another — exactly 0.9.5's own "one source per call" rule, held here one
// layer earlier, before a lead has even been accepted as a source at all.
//
// NO NETWORK, NO STORAGE, NO VERIFICATION, NO MUTATION, NO TRUST
// VOCABULARY OF ANY KIND — inherited unchanged from 0.9.5 through 0.9.12.
// This file never imports a `StorageProvider`, `peer/PeerMessageBus.js`,
// `core/ContentReference.js`, `core/DecentralizedPublication.js`, or
// anything that queries a search/index service, verifies a signature, or
// fetches bytes from anywhere. It is handed a lead already reported by
// something else; it never goes and gets one. No `trusted`, `verified`,
// `authority`, `priority`, `weight`, or `confidence` field exists here or
// ever will at this layer — a search hit is an untrusted discovery lead,
// never proof of anything. Every value this file returns is
// `Object.freeze()`'d, and nothing passed in is ever mutated.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS — inherited from
// 0.9.5's own contract exactly. `origin`, `discoveryTag`, and `uri` are
// each independently required, non-empty strings; any one of them
// missing, empty, or not a string means there is nothing describable to
// return. `storage` is the only optional field, degrading to `null`
// rather than invalidating an otherwise well-formed lead.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Querying, polling, or subscribing to any actual search or index
//   service.** This file is handed a lead already reported; 0.9.25,
//   unscheduled, decides which service(s) and how.
// - **Deciding whether an accepted lead becomes a real
//   `core/WorldDiscoverySource.js` contribution, or wiring it into
//   `application/WorldDiscoverySourceRegistry.js`.** 0.9.26, unscheduled.
// - **Retrieving content from IPFS, Arweave, a blockchain, or anywhere
//   else a `uri` might point, and constructing a real, hash-verified
//   `core/ContentReference.js`/`core/DecentralizedPublication.js` from an
//   accepted lead.** 0.9.27+, unscheduled, and deliberately not
//   pre-named as one step — see "A lead is deliberately not yet a
//   ContentReference," above.
// - **A structured decentralized-publication envelope, `kind`,
//   `objectId`, or a signature field.** See "No publication envelope
//   fields of its own," above — `core/DecentralizedPublication.js`
//   already exists for the VERIFIED case; this file is for the case
//   before that.
// - **Combining, deduplicating, ranking, or reconciling two or more
//   leads — including two leads that share a `uri`.** See "One lead per
//   call," above.
// - **Signature verification, or any trust/authority judgment about a
//   lead.** See "No trust vocabulary," above.
// - **A closed list of valid `storage` values.** See "storage stays an
//   open, free-form label," above.
// - **Persisting a lead to a `StorageProvider`.** A lead is a transient,
//   in-memory bundle — nothing here is ever written down.

function toOptionalNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

// Pure. Describes ONE lead a decentralized discovery mechanism reported —
// nothing about whether that lead should be believed, combined with any
// other lead, or acted on. Returns `null`, never throws, when `origin`,
// `discoveryTag`, or `uri` is missing, empty, or not a string; `storage`
// alone degrades to `null` rather than invalidating the lead.
export function describeDecentralizedWorldDiscoveryLead({
    origin,
    discoveryTag,
    uri,
    storage
} = {}) {
    if (typeof origin !== 'string' || origin.length === 0) {
        return null;
    }
    if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
        return null;
    }
    if (typeof uri !== 'string' || uri.length === 0) {
        return null;
    }
    return Object.freeze({
        origin,
        discoveryTag,
        uri,
        storage: toOptionalNonEmptyString(storage)
    });
}
