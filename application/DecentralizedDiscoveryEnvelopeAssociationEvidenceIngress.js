import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeDecentralizedWorldEncounterLeadAssociation } from '../core/DecentralizedWorldEncounterLeadAssociation.js';

// 0.9.32 — Decentralized Discovery Envelope Association Evidence.
//
// 0.9.30's own header left a piece of itself explicitly for later: "wiring
// a described envelope into `core/DecentralizedWorldEncounterLeadAssociation.js`
// or `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`
// as a second evidence producer... is unscheduled, later work — a
// deliberate, explicit decision this milestone declines to make by
// default." 0.9.29's own header named the same gap from the other side:
// "a second producer, if one is ever needed, is unscheduled, later work
// with its own milestone." This file is that milestone — the second
// producer, built as its own file rather than folded into 0.9.29's own,
// because an unsigned envelope and a signed Publication's own location
// claim are meaningfully different kinds of evidence, and this whole
// family has drawn that distinction carefully at every layer so far. See
// "A second producer, never a merge into the first," below, for why they
// stay two files even though they emit the exact same shape.
//
//   application/NostrDiscoveryQueryService.js  (0.9.31)
//   / any future substrate adapter's own search()
//        — reports { uri, storage } candidates AND, when it
//          chooses to keep one, the already-described envelope
//          that produced each candidate (this milestone adds no
//          adapter that does this yet — see "Deliberately
//          excluded," below)
//                    │                              │
//                    ▼                              │
//   application/DecentralizedWorldDiscoveryQuery.js │
//        queryDecentralizedWorldDiscovery()          │
//                    │                              │
//                    ▼                              ▼
//        DecentralizedWorldDiscoveryLead[]    DecentralizedDiscoveryEnvelope[]
//        (origin, discoveryTag, uri, storage)  (protocol, version, kind,
//                    │                          objectId, uri)
//                    └───────────────┬──────────────┘
//                                    ▼
//   application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js  ★ (THIS)
//        deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes()
//        deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry()
//                                    │
//                                    ▼
//                            associations[]
//                                    │
//                                    ▼
//   application/DecentralizedWorldEncounterLeadResolution.js   (0.9.28,
//        resolveDecentralizedWorldEncounterLead()                unmodified)
//        resolveDecentralizedWorldEncounterLeadFromRegistry()
//
// A DECLARATION, NEVER, BY ITSELF, EVIDENCE — THE ONE DISTINCTION THIS
// WHOLE FILE EXISTS TO PRESERVE. A `DecentralizedDiscoveryEnvelope` that
// `describeDecentralizedDiscoveryEnvelope()`/`parseDecentralizedDiscoveryEnvelope()`
// (0.9.30) successfully describes has proven only that it is well-formed —
// "someone declared that object `kind`/`objectId` lives at `uri`." That is
// a structured claim, never proof, and 0.9.30's own header already said
// so in as many words: "validates an envelope's own SHAPE... and nothing
// about whether that claim is true." Merely parsing successfully is NOT
// what turns a declaration into association evidence in this file — a
// caller must separately, explicitly hand this file's own functions an
// `envelopes` array alongside a `leads` array for anything to be produced
// at all. Nothing in this codebase calls these functions automatically
// today; see "Deliberately excluded," below. The distinction the task that
// requested this milestone drew stands exactly as drawn:
//
//     discovery tag  ≠  evidence
//     uri            ≠  evidence
//     envelope       ≠  verified material
//
// A DECLARATION BECOMES AN ASSOCIATION ONLY BY MATCHING A CURRENTLY-KNOWN
// LEAD'S OWN `uri` — EXACT STRING EQUALITY, NOTHING ELSE. THE SAME MATCHING
// RULE `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`
// (0.9.29) ALREADY HOLDS FOR A PUBLICATION'S OWN LOCATION CLAIM, REUSED
// RATHER THAN REINVENTED. An envelope on its own names a `kind`, an
// `objectId`, and a `uri`, but — exactly like a 0.9.29 claim — says
// nothing about `origin` or `discoveryTag`, the other two fields a lead's
// own identity triple requires. This file supplies those two fields FROM
// THE MATCHING LEAD, never invents them, and matches on nothing but an
// exact `envelope.uri === lead.uri` comparison — no substring match, no
// scheme normalization, no trailing-slash tolerance. An envelope whose
// `uri` matches no currently-known lead contributes no association at
// all; that is not an error, and it is not held onto for a later lead
// that might report the same `uri` — a fresh call is required once one
// does.
//
// THE LEAD ITSELF IS NEVER MODIFIED, AND NEVER GAINS `kind`/`objectId` OF
// ITS OWN — THE EXACT RESTRAINT `core/DecentralizedWorldDiscoveryLead.js`'s
// OWN HEADER ALREADY NAMED: "NO PUBLICATION ENVELOPE FIELDS OF ITS OWN —
// NO `kind`, NO `objectId`." A lead and the envelope(s) that might describe
// what lives at its `uri` are kept as two separate objects for as long as
// they exist — a lead answers "where," an envelope answers "what, self-
// declared." This file never imports `core/DecentralizedWorldDiscoveryLead.js`,
// never constructs one, and never mutates one; it only ever reads a
// caller-supplied lead's own `origin`/`discoveryTag`/`uri` fields
// structurally, exactly as 0.9.29's own ingress already does for the
// identical reason.
//
// EVERY MATCHING LEAD, NOT JUST ONE — INDEPENDENT LEADS SHARING A `uri`
// STAY INDEPENDENT, EXACTLY AS 0.9.24's OWN HEADER ALREADY REFUSED TO
// TREAT A SHARED `uri` AS CORROBORATION, AND EXACTLY AS 0.9.29's OWN
// INGRESS ALREADY HOLDS FOR A CLAIM. If two different discovery services
// independently reported leads for the very same `uri` an envelope names,
// this file produces one association per matching lead — both real,
// neither preferred. Whether that later resolves `RESOLVED` (one
// currently-known lead) or `AMBIGUOUS` (more than one) is entirely
// `application/DecentralizedWorldEncounterLeadResolution.js`'s own job;
// this file makes no such judgment and holds no such vocabulary.
//
// EVERY CANDIDATE ENVELOPE IS RE-VALIDATED THROUGH 0.9.30's OWN
// `describeDecentralizedDiscoveryEnvelope()`, AND EVERY CANDIDATE
// ASSOCIATION IS RE-VALIDATED THROUGH 0.9.28's OWN
// `describeDecentralizedWorldEncounterLeadAssociation()` — NO SECOND
// VALIDATION ALGORITHM FOR EITHER SHAPE. A caller may hand this file
// already-described envelopes (typically 0.9.30's own
// `parseDecentralizedDiscoveryEnvelope()` result) or plain candidate
// objects shaped the same way; either is re-validated identically, the
// same "duck-typed, re-validated, never re-implemented" discipline 0.9.29's
// own header already held for a claim, continued here for an envelope.
// Once a matching lead is found, the candidate association this file
// assembles is handed, unconditionally, to the exact function
// `application/DecentralizedWorldEncounterLeadResolution.js` already
// trusts to decide whether an association is well-formed.
//
// BOTH `PUBLICATION` AND `AVATAR` FLOW THROUGH UNCHANGED — UNLIKE 0.9.29's
// OWN INGRESS, WHICH CAN ONLY EVER PRODUCE `PUBLICATION`. 0.9.29's own
// header explained why it stops at `PUBLICATION`: `publisher/Publication.js`
// is the only signed structure this codebase has, and it structurally
// cannot represent anything else. An envelope carries no such structural
// limit — 0.9.30's own header already made the deliberate choice to
// validate `kind` against the FULL `WorldEncounterKind` enum precisely
// because an envelope is self-declared rather than derived from an
// existing class's own shape. This file does not add a second, narrower
// restriction on top of that one; whatever `kind` an already-described
// envelope carries is exactly the `kind` its resulting association
// carries. This produces the first `AVATAR` association evidence this
// codebase has ever been able to construct — still exactly as unsigned,
// and exactly as self-declared, as every other field an envelope carries.
//
// A SECOND PRODUCER, NEVER A MERGE INTO THE FIRST. This file never imports
// `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`,
// `core/DecentralizedPublicationLocationClaim.js`, or `publisher/
// Publication.js`, and that file is left completely unmodified by this
// milestone. Both files produce the identical `associations[]` shape
// `application/DecentralizedWorldEncounterLeadResolution.js` already
// consumes, and a caller is free to concatenate the results of both
// before resolving — `resolveDecentralizedWorldEncounterLead()` never
// asks which producer supplied which entry, exactly because an
// association names only a relationship, never a source's own
// credibility. Keeping the two files separate, rather than adding an
// `envelopes` parameter to the existing one, keeps each producer's own
// header honest about exactly what kind of evidence it is producing: one
// already-signed, one still entirely unsigned. A caller that wants to
// distinguish an unsigned envelope's association from a signed
// publication's own claim can still do so, today, by keeping the two
// result arrays separate rather than concatenating them — this file makes
// that choice possible without making it necessary.
//
// STILL NO SIGNATURE, NO AUTHENTICITY, NO TRUST JUDGMENT OF ANY KIND —
// EXACTLY THE LINE 0.9.30's OWN HEADER ALREADY DREW AND THIS MILESTONE
// DELIBERATELY DOES NOT CROSS. An envelope carries no signature field for
// this file to check, and this file never imports `identity/
// LocalAuthorizationVerifier.js` or anything that would. "This item
// declares object X lives at this uri" and "object X actually lives at
// this uri, declared by someone entitled to say so" remain two different
// questions; this file only ever answers the first, turning a declaration
// into association evidence in the same conservative, unranked sense
// 0.9.28's own resolution already treats ALL evidence — an association is
// never weighted, scored, or preferred over another because of which
// producer made it, or because 0.9.29's producer happens to require a
// signature and this one does not. Whether a Nostr event's own signature,
// or any other substrate's own authenticity mechanism, should ever gate
// this file's own output is exactly the question 0.9.30's and 0.9.31's own
// headers already left for a future, unscheduled milestone — this file
// does not answer it early.
//
// `associations` IS ORDERED BY `envelopes` FIRST, THEN BY MATCHING `leads`
// WITHIN EACH ENVELOPE, IN THE ORDER SUPPLIED — THE SAME DETERMINISM
// 0.9.29's OWN INGRESS ALREADY GUARANTEES. Calling either function twice
// with byte-identical arguments returns a byte-identical result.
//
// `...FromEnvelopesFromRegistry()` MIRRORS 0.9.29's OWN REGISTRY WRAPPER,
// EXACTLY. `deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry()`
// already established the shape for "read `registry.listLeads()`, hand the
// result to the plain-array-taking function, return its result verbatim."
// This file's own registry wrapper does nothing else and holds no second
// algorithm of its own.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT, NEVER THROWS. A missing or
// non-array `envelopes`, and a missing or non-array `leads`, are both
// treated as contributing nothing. A malformed entry within `envelopes`
// (one `describeDecentralizedDiscoveryEnvelope()` itself rejects) or
// within `leads` (missing/not-an-object, or missing its own `uri`) is
// silently skipped, never allowed to block the well-formed evidence
// around it.
//
// NO DEDUPLICATION OF ITS OWN — 0.9.28's OWN RESOLUTION ALREADY COLLAPSES
// DUPLICATE EVIDENCE FOR ONE LEAD. Two envelopes that happen to declare
// the identical `uri` (an unusual but possible situation — perhaps two
// different discovery services each surfaced their own copy of the same
// declaration) each produce their own association against a matching
// lead; `resolveDecentralizedWorldEncounterLead()`'s own "duplicate
// evidence for the same lead counts once" rule already handles the case
// where two evidence entries end up identical. This file performs no
// de-duplication pass of its own.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. This
// file performs no I/O of its own — it is handed already-described
// envelopes and already-known leads, exactly as 0.9.29's own ingress
// already holds one layer up for the identical reason. Every value this
// file returns is `Object.freeze()`'d; nothing passed in is ever mutated.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain. This
// file produces candidate evidence; it never judges how credible that
// evidence is, and it never judges one producer's evidence as more or less
// credible than another's.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any substrate-specific adapter that keeps an already-described
//   envelope alongside the `{ uri, storage }` candidate it already reports
//   today.** `application/NostrDiscoveryQueryService.js` (0.9.31) still
//   discards its own parsed envelope once it has read `uri`/`storage` off
//   it — see that file's own header, "A lead, never association evidence."
//   Teaching an adapter to also report the envelopes it parsed, so a
//   caller can feed them into this file, is unscheduled, later work, one
//   adapter at a time.
// - **Verifying a Nostr event's own `sig`, or any other substrate's own
//   authenticity mechanism, and using it to gate or weight this file's own
//   output.** See "Still no signature," above — unscheduled, later work,
//   named but not answered by 0.9.30's and 0.9.31's own headers.
// - **Merging this file's own producer into 0.9.29's own
//   `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`,
//   or adding an `envelopes` parameter to that file.** See "A second
//   producer, never a merge into the first," above — a deliberate,
//   permanent choice, not a temporary one.
// - **Ranking, preferring, or otherwise distinguishing an envelope-derived
//   association from a Publication-derived one once both reach
//   `application/DecentralizedWorldEncounterLeadResolution.js`.** See
//   "Still no signature," above — resolution already treats every
//   well-formed association identically, and this milestone gives it no
//   reason to start doing otherwise.
// - **Wiring the produced `associations` automatically into
//   `application/DecentralizedWorldEncounterLeadResolution.js`, or into
//   any UI.** A caller reads this file's own result and decides what, if
//   anything, to resolve next — this file's own job stops at
//   `associations[]`.
// - **Persisting, caching, or subscribing to evidence across calls.** Every
//   call is handed a fresh `envelopes` and `leads` snapshot by its caller;
//   nothing here accumulates between calls.

function isDescribedLead(value) {
    return Boolean(value) && typeof value === 'object' && typeof value.uri === 'string' && value.uri.length > 0;
}

// Pure. Derives the `associations` evidence array `application/
// DecentralizedWorldEncounterLeadResolution.js`'s own `resolveDecentralizedWorldEncounterLead()`
// already knows how to consume, by matching each already-described
// `envelopes` entry's own location declaration against every
// currently-known `leads` entry sharing its exact `uri` — see this file's
// own header for the full matching rule, and for why this is a
// declaration turned into evidence only by this explicit call, never
// automatically. Never throws; a missing/non-array `envelopes` or `leads`
// contributes nothing, and a malformed entry within either is silently
// skipped.
export function deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({ envelopes, leads } = {}) {
    const knownEnvelopes = Array.isArray(envelopes) ? envelopes : [];
    const knownLeads = Array.isArray(leads) ? leads : [];

    const associations = [];
    for (const candidateEnvelope of knownEnvelopes) {
        const envelope = describeDecentralizedDiscoveryEnvelope(candidateEnvelope);
        if (!envelope) {
            continue;
        }
        for (const lead of knownLeads) {
            if (!isDescribedLead(lead) || lead.uri !== envelope.uri) {
                continue;
            }
            const association = describeDecentralizedWorldEncounterLeadAssociation({
                origin: lead.origin,
                discoveryTag: lead.discoveryTag,
                uri: lead.uri,
                kind: envelope.kind,
                objectId: envelope.objectId
            });
            if (association) {
                associations.push(association);
            }
        }
    }
    return Object.freeze(associations);
}

// Pure. Reads `registry.listLeads()` and returns exactly what
// `deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes()`
// returns for that snapshot — see this file's own header, "mirrors 0.9.29's
// own registry wrapper, exactly." A `registry` missing a `listLeads` method
// is treated as contributing no leads at all.
export function deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopesFromRegistry({ envelopes, registry } = {}) {
    const leads = registry && typeof registry.listLeads === 'function' ? registry.listLeads() : undefined;
    return deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({ envelopes, leads });
}
