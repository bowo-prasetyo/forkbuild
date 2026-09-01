import { WorldEncounterKind } from './WorldEncounter.js';

// 0.9.28 — Decentralized Lead → Encounter Resolution Boundary.
//
// 0.9.19 named a World encounter's own selection identity —
// `{ kind, objectId, origin }`. 0.9.24 named a decentralized discovery
// lead's own identity — `{ origin, discoveryTag, uri, storage? }`. Nothing
// in either file's own header pretends these two identities line up on
// their own, and for good reason: a lead's `origin` names the DISCOVERY
// SERVICE that reported it, never a World encounter's own `origin`; its
// `discoveryTag` answers "can I find ForkBuild-related material at all,"
// never "which specific object"; and its `uri` is, at best, an unverified
// claim about where SOME bytes live — 0.9.24's own header: "a lead is
// deliberately not yet a `ContentReference`." None of the three fields a
// lead already carries can honestly answer "does this lead correspond to
// publication P123, or avatar A7, or neither." This file names the one
// thing that CAN answer that question: an explicit, separately-supplied
// piece of evidence, never derived by guessing from a lead's own fields.
//
//   (future, unscheduled — a signed publication's own
//    contentReference, or some other real evidence source
//    that has actually inspected a lead's own material)
//                    │
//                    │   "I have evidence that THIS lead
//                    │    (origin, discoveryTag, uri) is
//                    │    THIS material (kind, objectId)."
//                    ▼
//   core/DecentralizedWorldEncounterLeadAssociation.js   ★ (THIS)
//        describeDecentralizedWorldEncounterLeadAssociation()
//        decentralizedWorldEncounterLeadAssociationMatchesLead()
//                    │
//                    ▼
//   application/DecentralizedWorldEncounterLeadResolution.js   (THIS
//        milestone — matches a requested { kind, objectId } against
//        currently-known leads via this evidence; see that file's own
//        header)
//
// AN ASSOCIATION NAMES TWO IDENTITIES TOGETHER — A LEAD'S OWN TRIPLE, AND
// A MATERIAL'S OWN PAIR. `{ origin, discoveryTag, uri }` is exactly the
// composite key `application/DecentralizedWorldDiscoveryLeadRegistry.js`
// (0.9.26) already uses to identify one lead's own slot, reused verbatim
// rather than reinvented. `{ kind, objectId }` is exactly
// `core/WorldEncounter.js`'s own (0.9.0) two-field material identity,
// also reused verbatim. This file invents no new identifier for either
// side — an association is the join row between two already-named keys,
// nothing more.
//
// THE ONE RULE THIS FILE EXISTS TO HOLD: A DISCOVERY TAG, A URI, OR ANY
// OTHER FIELD A LEAD ALREADY CARRIES IS NEVER, BY ITSELF, EVIDENCE OF
// ASSOCIATION. `discoveryTag` tells a caller "this might be ForkBuild-
// related" — it says nothing about which object. `uri` tells a caller
// where bytes might be retrieved from — it says nothing about what those
// bytes, once fetched, would turn out to be. Neither this file nor
// `application/DecentralizedWorldEncounterLeadResolution.js` ever reads a
// lead's own `discoveryTag` or `uri` to INFER a `kind`/`objectId` — an
// association is always a separate, explicit fact a caller supplies, not
// a computation this file performs over a lead's own fields. This is the
// single most important restraint in this whole milestone; see this
// codebase's own 0.9.24 header for why the temptation to skip this step
// was named and refused two milestones early.
//
// NO PRODUCER OF REAL ASSOCIATION EVIDENCE EXISTS YET, AND THIS FILE DOES
// NOT INVENT ONE. Nothing in this codebase today can honestly say "lead
// X is publication P123" — that requires either a signed publication
// envelope naming its own material's location (a future, unscheduled
// extension to `core/DecentralizedPublication.js`'s own family) or some
// other real evidence source that has actually inspected a lead's own
// material. Until one exists, every caller of this file supplies its own
// `associations` array — today, in practice, an empty one — and every
// resolution over a real, currently-known lead set honestly reports
// UNAVAILABLE. That is not a bug this milestone works around; it is
// exactly the conservative posture the task that requested this milestone
// asked for: "do not invent an association rule merely because we have a
// discovery tag and a URI."
//
// AN ASSOCIATION IS NOT A LEAD, AND NOT A `ContentReference`. This file
// never imports `core/DecentralizedWorldDiscoveryLead.js`,
// `core/ContentReference.js`, or `core/DecentralizedPublication.js`. It
// describes a claim ABOUT a lead's own identity, never the lead itself —
// `decentralizedWorldEncounterLeadAssociationMatchesLead()` compares an
// association's own `origin`/`discoveryTag`/`uri` fields against a lead
// object's own same-named fields structurally, without ever requiring
// that the lead argument was itself produced by
// `describeDecentralizedWorldDiscoveryLead()`.
//
// TWO KINDS, NEVER A THIRD — inherited unchanged from 0.9.0 and 0.9.19.
// `kind` is validated against `WorldEncounterKind.PUBLICATION`/
// `WorldEncounterKind.AVATAR`, the same enum reused rather than retyped.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain. An
// association is evidence that a relationship exists, never a judgment
// about how credible that evidence is.
//
// MALFORMED INPUT DEGRADES TO `null`/`false`, NEVER THROWS.
// `describeDecentralizedWorldEncounterLeadAssociation()` returns `null`
// for a missing/empty `origin`, `discoveryTag`, or `uri`; a `kind` outside
// `WorldEncounterKind`; or a missing/empty `objectId`.
// `decentralizedWorldEncounterLeadAssociationMatchesLead()` returns
// `false`, never throws, for a missing or malformed `association` or
// `lead`.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Every
// value this file returns is `Object.freeze()`'d; nothing passed in is
// ever mutated.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Producing real association evidence from an actual signed
//   publication, or from retrieving and inspecting a lead's own `uri`.**
//   Unscheduled, later work — see "No producer of real association
//   evidence exists yet," above.
// - **Persisting, registering, or subscribing to a collection of
//   associations.** This file describes and matches exactly one
//   association at a time; a stateful "association registry" is
//   unscheduled, later work, only worth building once something real
//   produces evidence to store in it.
// - **Choosing between two or more matching associations, or between two
//   or more leads a resolution matches.** See
//   `application/DecentralizedWorldEncounterLeadResolution.js`'s own
//   header — that file's own `AMBIGUOUS` status exists precisely so this
//   file never has to.
// - **Signature verification or any trust decision about a lead, a
//   service, or a piece of evidence.** See "No score, rank, trust..."
//   above.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// Pure. Describes ONE explicit piece of evidence associating a
// decentralized discovery lead's own identity triple
// (`origin`/`discoveryTag`/`uri`) with a requested material's own
// identity pair (`kind`/`objectId`) — see this file's own header, "An
// association names two identities together." Returns `null`, never
// throws, when any of `origin`, `discoveryTag`, or `uri` is missing,
// empty, or not a string; when `kind` is outside `WorldEncounterKind`; or
// when `objectId` is missing, empty, or not a string.
export function describeDecentralizedWorldEncounterLeadAssociation(candidate) {
    const { origin, discoveryTag, uri, kind, objectId } = candidate && typeof candidate === 'object' ? candidate : {};
    if (!isNonEmptyString(origin)) {
        return null;
    }
    if (!isNonEmptyString(discoveryTag)) {
        return null;
    }
    if (!isNonEmptyString(uri)) {
        return null;
    }
    if (kind !== WorldEncounterKind.PUBLICATION && kind !== WorldEncounterKind.AVATAR) {
        return null;
    }
    if (!isNonEmptyString(objectId)) {
        return null;
    }
    return Object.freeze({ origin, discoveryTag, uri, kind, objectId });
}

// Pure. `true` only when `association`'s own `origin`/`discoveryTag`/`uri`
// fields structurally match `lead`'s own same-named fields exactly — the
// one comparison `application/DecentralizedWorldEncounterLeadResolution.js`
// needs to tell whether a piece of evidence names a lead that is currently
// known at all. Never throws — a missing or malformed `association` or
// `lead` simply returns `false`.
export function decentralizedWorldEncounterLeadAssociationMatchesLead(association, lead) {
    if (!association || typeof association !== 'object' || !lead || typeof lead !== 'object') {
        return false;
    }
    return association.origin === lead.origin
        && association.discoveryTag === lead.discoveryTag
        && association.uri === lead.uri;
}
