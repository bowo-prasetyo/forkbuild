import { SignatureType } from './Signature.js';
import { FriendshipAction, isValidFriendshipAction, FRIENDSHIP_ACTION_SEQUENCE } from './FriendshipAction.js';

// 0.2.57 — Decentralized Friend Relationships & Mutual Consent. The
// WIRE shape of ONE signed friendship action, exchanged directly
// between two already-AUTHENTICATED peers over `peer/PeerMessageBus.js`
// — never a state advertisement the way presence/profile are (compare
// `core/AvatarPresenceAdvertisement.js`), and never merely OPTIONALLY
// signed the way presence/profile/interaction all are. See docs/
// Principles.md, "A Friend Request Is Signed Evidence, Never A Server
// Record" (0.2.57): there is no server anywhere in this architecture
// that could tell Alice "Bob accepted your request" — the ONLY thing
// that can ever tell her that is Bob's own signature over exactly this
// claim, which is why `identity/LocalAuthorizationVerifier.js#verifyFriendshipAdvertisement()`
// refuses an unsigned advertisement outright, unlike every verify*
// method that came before it.
//
// Fields, and why each one is here:
//
//   actorIdentity   — the did:key of whoever PERFORMED this action
//                      (sent the REQUEST, or sent the ACCEPT). Always
//                      required to equal the signature's own `signer`
//                      — see getFriendshipSigningDescriptor()'s own
//                      note below — and, one layer up, required to
//                      equal the identity the SENDING connection
//                      already proved during 0.2.49 authentication
//                      (application/FriendRelationshipUseCase.js's own
//                      ingestion boundary), so a signature this valid
//                      can never arrive from a connection authenticated
//                      as someone else.
//   subjectIdentity — the did:key this action is ADDRESSED to. A
//                      REQUEST's subject is who Alice wants to befriend;
//                      an ACCEPT's subject is whoever originally sent
//                      the REQUEST being accepted. A receiver whose own
//                      current identityId doesn't match `subjectIdentity`
//                      discards the advertisement — it was never meant
//                      for them (see application/
//                      FriendRelationshipUseCase.js's own ingestion
//                      check), the same "addressed, not merely
//                      overheard" discipline `targetAvatarId` gives
//                      `core/AvatarInteractionAdvertisement.js`, applied
//                      here to something that actually IS an
//                      instruction-shaped claim rather than a gesture.
//   action          — REQUEST or ACCEPT only — see
//                      core/FriendshipAction.js's own header for why
//                      REJECT/CANCEL/BLOCK/UNFRIEND are deliberately
//                      absent this milestone.
//   sequence        — `FRIENDSHIP_ACTION_SEQUENCE[action]`, never a
//                      counter this replica hands out itself. Playing
//                      the same "differs between any two honestly
//                      produced advertisements for this actor" role
//                      `AvatarProfile.revision`/`interactionId` play
//                      elsewhere, at the fixed granularity this
//                      vocabulary actually needs — see core/
//                      FriendshipAction.js's own header on why it is
//                      never asked to be monotonic across a
//                      relationship's whole lifetime.
//   inResponseTo    — 0.2.60. `null` for REQUEST (the opening move of
//                      a cycle, answering nothing); for ACCEPT/REJECT/
//                      CANCEL/UNFRIEND, the exact `signature.signature`
//                      string of the specific REQUEST advertisement
//                      this action answers or ends. REQUIRED for those
//                      four, never optional — see
//                      application/FriendRelationshipUseCase.js's own
//                      ingestion boundary, which refuses to apply any
//                      of them unless `inResponseTo` matches the
//                      REQUEST this replica actually has on file for
//                      that direction RIGHT NOW.
//
//                      Why this exists: 0.2.57's REQUEST/ACCEPT was a
//                      ONE-SHOT vocabulary — a relationship could only
//                      ever be asked and answered once, so a captured
//                      ACCEPT could never be replayed against anything
//                      but the exact REQUEST it already answered.
//                      0.2.60 makes the vocabulary CYCLIC (unfriend,
//                      then request again) — without a reference back
//                      to a specific REQUEST instance, a captured,
//                      genuinely-once-valid ACCEPT from cycle 1 would
//                      still cryptographically verify if replayed
//                      against cycle 2's brand-new REQUEST (same actor,
//                      same subject, same fixed sequence, only the
//                      untrusted `timestamp` differs), silently
//                      manufacturing consent that was never actually
//                      re-given. Binding every answer to the specific
//                      REQUEST signature it responds to closes that —
//                      the same "never let a captured claim outlive the
//                      specific thing it was actually evidence of"
//                      discipline this file's own header already
//                      applies to actor/subject/action itself.
//   timestamp       — the actor's own clock, carried as display
//                      metadata only, exactly as untrusted as
//                      `core/AvatarInteractionAdvertisement.js`'s own
//                      `timestamp` — never an authority or freshness
//                      mechanism.
//   signature       — REQUIRED, never optional. See this file's own
//                      header above.
export function toFriendshipAdvertisement({ actorIdentity, subjectIdentity, action, inResponseTo = null, timestamp = Date.now() }) {
    return {
        actorIdentity,
        subjectIdentity,
        action,
        sequence: FRIENDSHIP_ACTION_SEQUENCE[action],
        inResponseTo,
        timestamp
    };
}

// A defensive shape check applied at the ingestion boundary — see
// application/FriendRelationshipUseCase.js. Nothing arriving over a
// peer connection is trusted structurally, let alone authoritatively;
// a malformed message is simply discarded, the same failure-isolation
// posture every other `isValid*Advertisement()` in this codebase
// already applies.
//
// 0.2.60 — `inResponseTo`'s presence is REQUIRED/FORBIDDEN based on
// `action` alone (REQUEST never carries one; every terminal action
// always must) — this is still only a SHAPE check, exactly like
// `sequence === FRIENDSHIP_ACTION_SEQUENCE[action]` above it. Whether
// the referenced signature actually matches a REQUEST this replica
// holds is a STATEFUL question this function has no way to answer —
// that check lives in application/FriendRelationshipUseCase.js's own
// ingestion boundary, the same division of labor `sequence`'s own
// shape-only check already establishes here.
export function isValidFriendshipAdvertisement(value) {
    return Boolean(value)
        && typeof value.actorIdentity === 'string' && value.actorIdentity.length > 0
        && typeof value.subjectIdentity === 'string' && value.subjectIdentity.length > 0
        && value.actorIdentity !== value.subjectIdentity
        && isValidFriendshipAction(value.action)
        && value.sequence === FRIENDSHIP_ACTION_SEQUENCE[value.action]
        // REQUEST is the one action that opens a cycle rather than
        // answering/ending one — every other action (ACCEPT, or any
        // terminal action) MUST reference the REQUEST it answers/ends.
        && (value.action === FriendshipAction.REQUEST
            ? value.inResponseTo === null || value.inResponseTo === undefined
            : typeof value.inResponseTo === 'string' && value.inResponseTo.length > 0)
        && Number.isFinite(value.timestamp);
}

// The canonical signing envelope. Covers EVERY field of the
// advertisement — actor, subject, action, sequence, inResponseTo, AND
// timestamp, deliberately never a narrower subset such as just
// actorIdentity+sequence. Signing only those two would let a captured,
// genuine REQUEST signature be replayed with a swapped-in
// subjectIdentity or action, recreating 0.2.18's causal-history signing
// bug — and, one level worse than any prior advertisement type, would
// let it be replayed as fabricated evidence of an ACCEPT that was never
// actually granted. Signing `inResponseTo` specifically is what makes
// it trustworthy evidence at all (see its own header above) — an
// attacker who could tamper with it after signing would simply point a
// captured old ACCEPT at whichever REQUEST they liked. `id:
// advertisement.actorIdentity` matches every other SignatureType's own
// "id is who this claim is ABOUT" convention; a verifier separately
// requires `signature.signer === actorIdentity` (see
// identity/LocalAuthorizationVerifier.js#verifyFriendshipAdvertisement),
// so an advertisement can never claim to be Alice's action while
// actually being signed by anyone else's key.
export function getFriendshipSigningDescriptor(advertisement) {
    return {
        type: SignatureType.FRIENDSHIP,
        id: advertisement.actorIdentity,
        revision: advertisement.sequence,
        payload: {
            actorIdentity: advertisement.actorIdentity,
            subjectIdentity: advertisement.subjectIdentity,
            action: advertisement.action,
            sequence: advertisement.sequence,
            inResponseTo: advertisement.inResponseTo,
            timestamp: advertisement.timestamp
        }
    };
}

export { FriendshipAction };
