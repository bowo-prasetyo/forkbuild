// 0.9.626 — Publication Commentary Asynchronous Delivery Contract.
//
// 0.9.625's own audit answered the standing question precisely: no
// concrete product requirement for Nostr/Arweave Commentary distribution
// existed AT THAT TIME (Section H), and the two existing discovery-envelope
// families cannot carry a signed
// core/PublicationCommentaryDistributionEnvelope.js (0.9.618) unmodified —
// they are an unsigned LOCATOR shape built to announce where large material
// already stored elsewhere can be found, while a Commentary envelope is a
// small, REQUIRED-signature, self-contained payload that already travels
// WHOLE, today, over WebRTC (0.9.625 Section D/F). That audit's own
// classification for the envelope was explicit: "ARCHITECTURAL_MISMATCH for
// direct reuse of either existing discovery-envelope family; the reusable
// PART is the PATTERN (a small JSON shape, a discoveryTag, an injected
// publish/upload function), never the class or the envelope type."
//
// A follow-up product argument reopened the question on NEW grounds this
// codebase had not yet named: WebRTC gives Commentary LIVE dissemination
// only — a comment aimed at someone with no open peer connection to the
// commenter today can be signed successfully and still never arrive, with
// no path for the recipient to ever discover it later. That is a genuine
// reachability gap 0.9.625 itself never measured (it asked only whether a
// requirement existed, not whether one was hiding behind WebRTC's own
// liveness assumption). THIS FILE is deliberately the smallest possible
// answer to that gap: a substrate-neutral VOCABULARY for asynchronous
// delivery, and a substrate-neutral CONTRACT a future substrate adapter
// would need to satisfy — never a Nostr or Arweave implementation of
// either.
//
//                    PublicationCommentary                (0.9.242,
//                           │                               unmodified)
//                           │  wrapped, unmodified
//                           ▼
//         PublicationCommentaryDistributionEnvelope        (0.9.618,
//                           │                               unmodified —
//                           │                               ALREADY the
//                           │                               canonical,
//                           │                               substrate-
//                           │                               neutral wire
//                           │                               shape; this
//                           │                               milestone adds
//                           │                               no second one)
//              ┌────────────┴────────────┐
//              ▼                         ▼
//     WebRTC peer announce      a hypothetical future
//     (0.9.618-0.9.620,          asynchronous substrate
//      unmodified — LIVE         (Nostr/Arweave/anything
//      dissemination only)       satisfying THIS FILE's own
//                                 contract — PERSISTENT
//                                 reachability; UNBUILT here)
//
// THE CENTRAL DESIGN CLAIM THIS FILE MAKES, restated from 0.9.625's own
// Section F: because a Commentary envelope is already "small enough to
// travel whole," it needs no locator-plus-separate-content-store pattern
// the way Publication material does. So the contract a future substrate
// must satisfy is a ROUND TRIP over the envelope's own JSON directly —
// publish it, retrieve it back, byte for byte — never a locator pointing
// at content stored elsewhere. This is why
// describesConformingPublicationCommentaryAsynchronousDeliverySubstrate()
// below requires BOTH `publish` and `retrieve`; the existing
// application/NostrPublicationDiscoveryPublisher.js and
// application/ArweaveAnnouncementPublisher.js classes, unmodified, each
// expose only `publish` (they announce a locator to content stored
// elsewhere; there is nothing of their own to retrieve) and so, correctly,
// never conform to this contract — see this file's own tests for a live
// confirmation of exactly that, against the real, unmodified classes.
//
// SEVEN NAMED STAGES, MONOTONIC, NEVER PERSISTED, NEVER OWNED BY THIS FILE:
//
//   CREATED
//      -> a local, unsigned core/PublicationCommentary.js exists
//   SIGNED
//      -> wrapped and signed as a PublicationCommentaryDistributionEnvelope
//         (application/PublicationCommentaryDistributionExchange.js#
//         exportCommentary(), unmodified)
//   PERSISTENTLY_PUBLISHED
//      -> a conforming substrate's own publish() accepted the envelope
//   DISCOVERABLE
//      -> the substrate can be asked for it later, by whatever locator its
//         own publish() returned
//   RETRIEVED
//      -> a consumer's later retrieve() call returned the envelope's own
//         wire JSON
//   VERIFIED
//      -> identity/LocalAuthorizationVerifier.js#
//         verifyPublicationCommentaryDistributionEnvelope() (unmodified)
//         accepted it
//   ADMITTED
//      -> storage/PublicationCommentaryStore.js#save() (unmodified) has it
//
// PUBLISHING IS NOT DELIVERY — the one product distinction this whole
// milestone exists to name. PERSISTENTLY_PUBLISHED and DISCOVERABLE
// describe the SUBSTRATE's own state, reachable the instant publish()
// resolves; RETRIEVED, VERIFIED, and ADMITTED describe the RECIPIENT's own
// state, which may not happen for hours, days, or ever. This file tracks
// no wall-clock time, no per-commentary status record, and no substrate at
// all — it is seven named values, one ordering, and one pure transition
// predicate, nothing more.
//
// EVERY SECURITY PROPERTY THIS FILE DEPENDS ON ALREADY EXISTS AND IS NEVER
// RE-IMPLEMENTED HERE. VERIFIED means exactly what
// identity/LocalAuthorizationVerifier.js#
// verifyPublicationCommentaryDistributionEnvelope() has always meant: "the
// identity named by this envelope's own authorIdentityId really did sign
// exactly this commentaryId/publicationId/content/createdAt tuple" — see
// core/PublicationCommentaryDistributionEnvelope.js's own header, "A
// narrow, structural claim, never Publication ownership." A Commentary
// that arrives over some future asynchronous substrate is NO more, and no
// less, trustworthy than one that arrives over WebRTC today: VERIFIED
// never implies the signer authored or owns the named publicationId, and
// ADMITTED never happens for an envelope that fails VERIFIED — see this
// file's own tests, Sections E/F, for a live, adversarial demonstration of
// both facts using the real, unmodified verifier and store.
//
// DELIBERATELY EXCLUDED FROM 0.9.626 — deliberately absent, not merely
// unimplemented, exactly as this milestone's own requesting brief named:
// Nostr relay publishing, Arweave uploading, historical Commentary
// synchronization, automatic relay/substrate selection, relay or substrate
// fallback or ranking, global Commentary indexing, subscriptions,
// automatic fan-out to every substrate (see application/
// PublicationDistributionRuntimeComposition.js's own "SELECTION, NEVER
// FAN-OUT" — the precedent any future multi-substrate Commentary wiring
// must extend, never a new policy), delivery guarantees, read receipts,
// delivery-status UI, retry queues, background workers, any new Commentary
// persistence, any new Commentary identity (no `nostrEventId`, no
// `arweaveTransactionId` — see core/PublicationCommentaryDistributionEnvelope.js's
// own header, unmodified by this milestone), any new deduplication
// service, any Publication authorization change, and any change whatsoever
// to the existing WebRTC path
// (application/PublicationCommentaryDistributionPeerExchange.js, untouched
// by this milestone). This file adds no field to, and imports nothing
// mutable from, any of those.
//
// PURE VALUES AND PURE FUNCTIONS ONLY. No I/O, no async, no construction of
// any substrate, no reference to Nostr or Arweave by name anywhere in this
// file's own executable code — the whole point of a substrate-neutral
// contract is that this file could describe a Nostr adapter, an Arweave
// adapter, or a substrate nobody has thought of yet, equally, without ever
// importing any of them.

export const PublicationCommentaryDeliveryStatus = Object.freeze({
    CREATED: 'CREATED',
    SIGNED: 'SIGNED',
    PERSISTENTLY_PUBLISHED: 'PERSISTENTLY_PUBLISHED',
    DISCOVERABLE: 'DISCOVERABLE',
    RETRIEVED: 'RETRIEVED',
    VERIFIED: 'VERIFIED',
    ADMITTED: 'ADMITTED'
});

// The canonical ordering referenced throughout this file's own header —
// index position IS the ordering; nothing else in this file encodes it a
// second time.
export const PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE = Object.freeze([
    PublicationCommentaryDeliveryStatus.CREATED,
    PublicationCommentaryDeliveryStatus.SIGNED,
    PublicationCommentaryDeliveryStatus.PERSISTENTLY_PUBLISHED,
    PublicationCommentaryDeliveryStatus.DISCOVERABLE,
    PublicationCommentaryDeliveryStatus.RETRIEVED,
    PublicationCommentaryDeliveryStatus.VERIFIED,
    PublicationCommentaryDeliveryStatus.ADMITTED
]);

// True iff `status` is one of the seven named values above — never throws,
// never matches anything else, including a lowercase or otherwise
// differently-cased spelling.
export function isPublicationCommentaryDeliveryStatus(status) {
    return typeof status === 'string' && PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE.includes(status);
}

// True iff moving from `from` to `to` is a legal forward step in the
// sequence above — strictly forward (`to` must sit at a LATER index than
// `from`; equal or earlier is false), but not required to be adjacent: a
// substrate that never distinguishes PERSISTENTLY_PUBLISHED from
// DISCOVERABLE may still jump straight from SIGNED to RETRIEVED, exactly
// as a caller who never modeled every intermediate stage still needs a
// true answer here. Unknown, missing, or malformed values are always
// false, never thrown — the same "pure predicate, never an exception for
// bad input" discipline this codebase's own boundary functions already
// hold (see core/PublicationCommentary.js#fromJSON()'s own "never throws"
// precedent, held here for a predicate rather than a parser).
export function isValidPublicationCommentaryDeliveryStatusTransition(from, to) {
    if (!isPublicationCommentaryDeliveryStatus(from) || !isPublicationCommentaryDeliveryStatus(to)) {
        return false;
    }
    return PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE.indexOf(to)
        > PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE.indexOf(from);
}

// A plain, frozen, DESCRIPTIVE record of the shape a future asynchronous
// delivery substrate adapter (Nostr, Arweave, or anything else) would need
// to expose to carry a PublicationCommentaryDistributionEnvelope — never
// executable, never a base class, never something a real adapter extends.
// This mirrors the same "shape documented in a header comment, enforced by
// a caller's own duck-typed usage, never a formal interface class" style
// application/NostrPublicationDiscoveryPublisher.js's own header already
// uses for its own `publishImpl` contract, generalized here one layer up
// so it names no substrate.
export function describePublicationCommentaryAsynchronousDeliverySubstrateContract() {
    return Object.freeze({
        publish: '(envelopeJson: PublicationCommentaryDistributionEnvelope#toJSON()) => Promise<{ published: true, locator } | null>',
        retrieve: '(locator) => Promise<PublicationCommentaryDistributionEnvelope#toJSON() | null>'
    });
}

// True iff `candidate` is a plain, non-null object exposing both `publish`
// and `retrieve` as functions — the minimum a caller needs to attempt the
// round trip this contract describes. Duck-typed, deliberately: this
// checks SHAPE only, never behavior, never that publish() and retrieve()
// actually agree with one another, and never that either is safe to call —
// the identical restraint every existing `publishImpl`/`queryImpl`
// consumer in this codebase already holds for its own injected
// collaborator. Never throws for any input, including `null`, `undefined`,
// a primitive, or a real class instance that simply lacks one of the two
// methods (see this file's own tests for a live check against the real,
// unmodified NostrPublicationDiscoveryPublisher and
// ArweaveAnnouncementPublisher classes, both of which correctly fail this
// check today).
export function describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    return typeof candidate.publish === 'function' && typeof candidate.retrieve === 'function';
}
