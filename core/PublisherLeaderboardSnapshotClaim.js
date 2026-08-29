import { createId } from './createId.js';
import { Signature, SignatureType, SIGNING_DOMAIN } from './Signature.js';

// 0.8.121 — Signed Reproducible Leaderboard Snapshot Claim.
//
// 0.8.119 proved a leaderboard CONCLUSION is reproducible: two replicas
// holding byte-identical evidence, under an identical policy, compute a
// byte-identical snapshot. 0.8.120 proved that reproducibility is
// independently CHECKABLE: a replica never has to trust a snapshot handed
// to it, because it can always recompute its own and compare. Neither
// ever answered a third, different question — a question about WHO, not
// about WHAT:
//
//   "A particular signing identity asserts this exact snapshot is the
//    one their evidence and policy produce."
//
// That is a genuinely different claim from either 0.8.119 or 0.8.120.
// 0.8.119 says a conclusion CAN be reproduced. 0.8.120 says a candidate
// DOES reproduce, relative to some replica's own local evidence. Neither
// says anyone stands behind a particular snapshot. This class is that
// third statement, made the same way every other signed assertion in
// this codebase is made — a small, immutable, REQUIRED-signature record,
// never a second ranking engine, never a trust decision, never a
// modification of the snapshot it is about:
//
//   Evidence            Reproducibility        Cryptographic
//   Fingerprint    +     Verification     +      Attribution
//    (0.8.116)             (0.8.120)            (THIS MILESTONE)
//        │                     │                       │
//        └──────────┬──────────┘                       │
//                    ▼                                  │
//         Publisher Leaderboard Snapshot                │
//              (0.8.119, UNCHANGED)                     │
//                    │                                  │
//                    └──────────────┬───────────────────┘
//                                   ▼
//                    PublisherLeaderboardSnapshotClaim
//
// DO NOT USE `application/PublisherIdentityRecord.js` AS THE SIGNER —
// THIS IS THE ONE RULE THIS FILE EXISTS TO ENFORCE. 0.8.108's own
// `PublisherIdentityRecord` is, by its own header, "a bare, explicit,
// case-sensitive label representing a publisher" — a human/application-
// level association, never a cryptographic one. Signing a claim with a
// bare label would silently turn "Alice" into "the person cryptographically
// controlling key X is Alice" — a completely different, unearned
// statement this milestone never makes. `signerIdentityId` below is
// ALWAYS a did:key `identity/SigningIdentity.js` id — the same
// cryptographic identity every other REQUIRED-signature claim in this
// codebase already signs with (`PlaceNamingClaim.authorIdentityId`,
// `BlueprintAttribution.authorIdentityId`,
// `BlueprintLineageClaim.authorIdentityId`) — never a publisher label, and
// this file imports nothing from `application/PublisherIdentityRecord.js`.
// A future milestone MAY explicitly associate a publisher label with a
// signing identity; this one deliberately does not infer that
// relationship, silently or otherwise.
//
// THE CLAIM NAMES THE SNAPSHOT; IT DOES NOT CARRY IT. A claim is
// deliberately small — `evidenceFingerprint`, `policyVersion`, and
// `snapshotFingerprint` alone, never the full leaderboard, never the full
// policy object, never a single achievement event. A verifier (see
// `application/PublisherLeaderboardSnapshotClaimVerification.js`) never
// reads a leaderboard OFF a claim — it independently reconstructs its own
// snapshot from its own archive and compares fingerprints, the identical
// "never trust a supplied conclusion" discipline 0.8.120 already
// established one layer down, applied here to a SIGNED conclusion instead
// of a bare one. See this file's own "Snapshot fingerprint," below, for
// why a claim needs a THIRD fingerprint beyond the two 0.8.119 already
// defined as a snapshot's own semantic identity.
//
// TWO KINDS OF "SNAPSHOT IDENTITY" — NEITHER REPLACES THE OTHER.
//
//   Semantic snapshot identity  = (evidenceFingerprint, policy.version)
//                                  — 0.8.119, UNCHANGED. Answers "would
//                                  two replicas compute the same
//                                  leaderboard?"
//
//   Cryptographic claim digest  = snapshotFingerprint below. A SHA-256
//                                  digest of the COMPLETE snapshot
//                                  (evidence fingerprint, full policy,
//                                  full leaderboard) — see
//                                  `application/PublisherLeaderboardSnapshotFingerprint.js`.
//                                  Answers "is this the exact byte-content
//                                  the signer's key attests to?"
//
// 0.8.119's own header declined a snapshot hash because the semantic pair
// already gives a caller everything needed to know two computations are
// identical — and that restraint stands, unchanged, for every purpose
// 0.8.119/0.8.120 ever served. A SIGNATURE needs something stronger: a
// signer's key authorizes exact bytes, not a semantic equivalence class,
// and if this class signed only `(evidenceFingerprint, policyVersion)` a
// tampered leaderboard sharing that same pair (impossible under correct
// computation, but never something a signature should have to assume)
// would carry a technically valid signature over a fabricated conclusion.
// `snapshotFingerprint` closes that gap without touching, reinterpreting,
// or duplicating 0.8.119's own notion of identity — both fields are
// carried on this claim, independently, side by side.
//
// THE SIGNATURE AUTHENTICATES THE CLAIM, NEVER THE EVIDENCE ITSELF. This
// is the same three-layer separation this file's own header diagram
// draws: evidence says "these durable facts exist" (0.8.114-0.8.118);
// reproducibility says "these facts, under this policy, produce this
// leaderboard" (0.8.119/0.8.120); a signature says only "this signing
// identity signed this exact reproducible result" — never anything about
// whether the underlying facts are true. A valid signature over a claim
// no more authenticates the achievement evidence beneath it than
// `core/PublicationAnchor.js`'s own signature authenticates the content
// it anchors (see that file's own header, "External Anchoring Provides
// Evidence; It Does Not Establish Authority (0.8.0)") — held here once
// more, one layer up, over a derived conclusion instead of a raw fact.
//
// DELIBERATELY NON-EVALUATIVE — NO SCORE, NO REPUTATION, NO TRUST, NO
// "VERIFIED PUBLISHER." A claim carries no `score`, `reputation`,
// `trust`, `confidence`, `quality`, `worthiness`, `authority`, or
// `verifiedPublisher` field, and never will — the identical vocabulary
// boundary every file in the achievement/leaderboard family already
// holds (see `application/PublisherLeaderboardSnapshotVerification.js`'s
// own header). A signature establishes WHO signed WHAT; it does not, and
// structurally cannot, establish that a ranking is objectively correct.
//
// IMMUTABLE — A CORRECTION IS A NEW CLAIM, NEVER A MUTATION OF AN OLD
// ONE'S SIGNATURE. Exactly like `core/PlaceNamingClaim.js`/
// `core/BlueprintLineageClaim.js`, there is no `withSignature()`-after-
// storage mutation path that changes what was signed — `withSignature()`
// only ever attaches a signature to a freshly constructed, not-yet-signed
// claim (see `application/CreatePublisherLeaderboardSnapshotClaimUseCase.js`,
// the ONE construction boundary). If a signer's understanding of their
// own snapshot changes, the old signed claim remains exactly as signed,
// forever, and a new claim is created alongside it — never in place of
// it.
export const PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND = 'forkbuild.publisher-leaderboard-snapshot-claim';
export const CURRENT_SCHEMA_VERSION = 1;

export class PublisherLeaderboardSnapshotClaim {
    constructor({
        id = createId(),
        evidenceFingerprint,
        policyVersion,
        snapshotFingerprint,
        signerIdentityId,
        createdAt = new Date(),
        signature = null
    } = {}) {
        if (!evidenceFingerprint || typeof evidenceFingerprint !== 'string' || !evidenceFingerprint.trim()) {
            throw new Error('PublisherLeaderboardSnapshotClaim requires an evidenceFingerprint');
        }
        if (!Number.isInteger(policyVersion) || policyVersion < 1) {
            throw new Error('PublisherLeaderboardSnapshotClaim requires a positive integer policyVersion');
        }
        if (!snapshotFingerprint || typeof snapshotFingerprint !== 'string' || !snapshotFingerprint.trim()) {
            throw new Error('PublisherLeaderboardSnapshotClaim requires a snapshotFingerprint');
        }
        if (!signerIdentityId || typeof signerIdentityId !== 'string' || !signerIdentityId.trim()) {
            throw new Error('PublisherLeaderboardSnapshotClaim requires a signerIdentityId');
        }
        this._id = id;
        this._evidenceFingerprint = evidenceFingerprint;
        this._policyVersion = policyVersion;
        this._snapshotFingerprint = snapshotFingerprint;
        this._signerIdentityId = signerIdentityId;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get evidenceFingerprint() { return this._evidenceFingerprint; }
    get policyVersion() { return this._policyVersion; }
    get snapshotFingerprint() { return this._snapshotFingerprint; }
    get signerIdentityId() { return this._signerIdentityId; }
    get createdAt() { return this._createdAt; }
    get signature() { return this._signature; }

    withSignature(signature) {
        return new PublisherLeaderboardSnapshotClaim({
            id: this._id,
            evidenceFingerprint: this._evidenceFingerprint,
            policyVersion: this._policyVersion,
            snapshotFingerprint: this._snapshotFingerprint,
            signerIdentityId: this._signerIdentityId,
            createdAt: this._createdAt,
            signature
        });
    }

    // Delegates to the standalone getPublisherLeaderboardSnapshotClaimSigningDescriptor()
    // below so identity/LocalAuthorizationVerifier.js can reconstruct the
    // identical descriptor from plain gossiped/stored JSON — the same
    // split every other signed envelope in this codebase keeps.
    getSigningDescriptor() {
        return getPublisherLeaderboardSnapshotClaimSigningDescriptor(this.toJSON());
    }

    // Self-describing wire envelope — `kind`/`schemaVersion` — exactly
    // what a future exchange transport needs, the same "free to include
    // now" posture core/BlueprintLineageClaim.js's own header already
    // took.
    toJSON() {
        return {
            kind: PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            id: this._id,
            evidenceFingerprint: this._evidenceFingerprint,
            policyVersion: this._policyVersion,
            snapshotFingerprint: this._snapshotFingerprint,
            signerIdentityId: this._signerIdentityId,
            createdAt: this._createdAt.toISOString(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PublisherLeaderboardSnapshotClaim({
            id: json.id,
            evidenceFingerprint: json.evidenceFingerprint,
            policyVersion: json.policyVersion,
            snapshotFingerprint: json.snapshotFingerprint,
            signerIdentityId: json.signerIdentityId,
            createdAt: json.createdAt ? new Date(json.createdAt) : new Date(),
            signature: json.signature || null
        });
    }
}

// Standalone form of PublisherLeaderboardSnapshotClaim#getSigningDescriptor(),
// operating on a plain JSON `record` rather than a hydrated instance —
// mirroring core/BlueprintLineageClaim.js#getBlueprintLineageClaimSigningDescriptor()
// one concept over. `protocol` reuses core/Signature.js's own
// SIGNING_DOMAIN constant rather than inventing a second one — the
// canonical envelope this payload is embedded in already carries `domain`
// and `type` for domain separation (see core/Signature.js's own header);
// `protocol`/`claimKind` here are redundant with those by design, making
// the cryptographic boundary of THIS claim kind explicit and
// self-describing within the payload itself, never a second, competing
// domain-separation mechanism.
export function getPublisherLeaderboardSnapshotClaimSigningDescriptor(record) {
    return {
        type: SignatureType.PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM,
        id: record.id,
        revision: record.createdAt,
        payload: {
            protocol: SIGNING_DOMAIN,
            claimKind: PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND,
            evidenceFingerprint: record.evidenceFingerprint,
            policyVersion: record.policyVersion,
            snapshotFingerprint: record.snapshotFingerprint
        }
    };
}
