import {
    PublisherLeaderboardSnapshotClaim,
    PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND,
    CURRENT_SCHEMA_VERSION
} from '../core/PublisherLeaderboardSnapshotClaim.js';

// 0.8.122 — Portable Signed Leaderboard Claim Exchange.
//
// 0.8.121 answered "can a signing identity make a durable, cryptographically
// attributable statement about a reproducible leaderboard conclusion?" —
// entirely LOCALLY: `CreatePublisherLeaderboardSnapshotClaimUseCase` signs a
// claim, `application/PublisherLeaderboardSnapshotClaimVerification.js`
// checks one. Neither ever moved a claim anywhere. This file is the missing
// step in between — the same "explicit, portable transport" question 0.8.118
// already answered for raw evidence, asked here one layer up, over a SIGNED
// CONCLUSION instead of a durable fact:
//
//   Alice's replica                              Bob's replica
//
//   claim (signed, 0.8.121, UNCHANGED)
//      │  exportPublisherLeaderboardSnapshotClaim()
//      ▼
//   a JSON payload  ──────────────────────────────►  importPublisherLeaderboardSnapshotClaim()
//                                                            │
//                                                            ▼
//                                                     a hydrated claim,
//                                                     structurally verified
//                                                            │
//                                                            ▼  (a caller's own,
//                                                     verifyPublisherLeaderboardSnapshotClaim()  separate, explicit
//                                                     (0.8.121, UNCHANGED)                        next step — see below)
//                                                            │
//                                                            ▼
//                                                     { matches, signatureValid,
//                                                       evidenceFingerprintMatches,
//                                                       policyVersionMatches,
//                                                       snapshotFingerprintMatches }
//
// TRANSPORT INTRODUCES NO NEW TRUST SEMANTICS — THE ONE RULE THIS FILE
// EXISTS TO ENFORCE. This module does not re-decide what a valid signature
// means, does not re-decide what "matches" means, and does not compare a
// claim against any archive. It has exactly two jobs: turn a claim this
// replica already holds into portable JSON, and turn portable JSON back
// into a claim instance this replica can hand to the UNCHANGED 0.8.121
// verifier — never a second, competing verification path. See "Import Never
// Performs Semantic Verification," below, for why `importPublisherLeaderboardSnapshotClaim()`
// deliberately stops one step short of `verifyPublisherLeaderboardSnapshotClaim()`.
//
// THE TRANSPORTED PAYLOAD CARRIES ONLY THE CLAIM — NEVER EVIDENCE,
// ACHIEVEMENT EVENTS, BADGES, STATISTICS, THE LEADERBOARD ITSELF, PUBLISHER
// ASSOCIATIONS, THE RANKING POLICY OBJECT, OR ANY PRIVATE SIGNING MATERIAL.
// The payload is EXACTLY `PublisherLeaderboardSnapshotClaim#toJSON()`'s own
// wire shape (see `core/PublisherLeaderboardSnapshotClaim.js`) — a closed,
// nine-field envelope:
//
//   { kind, schemaVersion, id, evidenceFingerprint, policyVersion,
//     snapshotFingerprint, signerIdentityId, createdAt, signature }
//
// A caller who reads this milestone's own design conversation may expect a
// five-field payload (`evidenceFingerprint`, `policyVersion`,
// `snapshotFingerprint`, `signerIdentityId`, `signature`, with `id` and
// `createdAt` dropped as "mere bookkeeping"). That five-field shape is NOT
// what travels, and this is a deliberate correctness choice, not an
// oversight: `id` and `createdAt` are not decoration on top of the
// signature — `core/PublisherLeaderboardSnapshotClaim.js#getSigningDescriptor()`
// binds BOTH of them into the exact canonical envelope
// (`{ type, id, revision, payload }`) that gets hashed and signed. Strip
// `id`/`createdAt` from the transported payload and the recipient can no
// longer reconstruct the descriptor the signature was actually computed
// over — `identity/LocalAuthorizationVerifier.js#verifyPublisherLeaderboardSnapshotClaim()`
// would then reject every genuinely signed claim as forged. `kind`/
// `schemaVersion` are carried for the identical, already-established reason
// `core/BlueprintLineageClaim.js`'s own header calls "free to include now" —
// a self-describing envelope this file's own strict import validation
// checks before ever constructing anything. What the five-field
// characterization gets exactly right, and what this file's own strict,
// closed field list guarantees by construction (see `TOP_LEVEL_FIELDS`,
// below), is the SPIRIT of the constraint: no evidence collection, no
// achievement/badge/statistic/leaderboard vocabulary, no publisher
// association, no ranking policy object, and no private key material ever
// appears anywhere in this payload — only the same nine fields
// `core/PublisherLeaderboardSnapshotClaim.js` already names as a claim's own
// complete, immutable content.
//
// EXPORT IS A THIN, TRUSTING PASSTHROUGH OVER A CLAIM THE CALLER ALREADY
// OWNS — THE IDENTICAL POSTURE `application/BlueprintLineageExchange.js#exportClaim()`
// ALREADY HOLDS. `exportPublisherLeaderboardSnapshotClaim()` requires a
// genuine `PublisherLeaderboardSnapshotClaim` instance, requires it to
// already be signed (refusing to publish an unsigned claim, the identical
// refusal `BlueprintLineageExchange` already makes), and otherwise performs
// zero validation of its own — the instance already went through
// `core/PublisherLeaderboardSnapshotClaim.js`'s own constructor validation
// and `CreatePublisherLeaderboardSnapshotClaimUseCase`'s own
// verify-before-return discipline (0.8.121) the moment it came into being.
// There is nothing left here to re-check.
//
// IMPORT NEVER PERFORMS SEMANTIC VERIFICATION, AND NEVER TOUCHES AN
// ARCHIVE — THAT REMAINS AN EXPLICIT, SEPARATE, LATER STEP. `importPublisherLeaderboardSnapshotClaim()`
// takes no archive parameter at all — grep this file for `PublicationObservationArchive`
// and it does not appear. It validates the payload's own SHAPE (the closed
// nine-field envelope), constructs a real claim instance, and checks the
// signature STRUCTURALLY (does `signerIdentityId` genuinely sign exactly
// this fingerprint triple?) via the UNCHANGED `identity/LocalAuthorizationVerifier.js#verifyPublisherLeaderboardSnapshotClaim()`
// — the identical structural check `application/PublisherLeaderboardSnapshotClaimVerification.js`'s
// own `signatureValid` field already reuses one layer up. It never asks
// whether the claim's `evidenceFingerprint`/`policyVersion`/
// `snapshotFingerprint` agree with ANY replica's own reconstructed
// snapshot — that is exactly, and only, `verifyPublisherLeaderboardSnapshotClaim(archive, claim, verifier)`'s
// own job (0.8.121, UNCHANGED), which a caller runs as its own, separate,
// explicit next step, exactly as `docs/Roadmap.md`'s own 0.8.121 entry
// named this split as "What's left." Receiving a signed claim through this
// file NEVER causes ForkBuild to alter its own leaderboard, persist
// anything, or treat the claim as more than an unopened envelope until that
// separate call runs.
//
// A STRUCTURALLY UNVERIFIABLE CLAIM IS AN EXPLICIT, NON-THROWING OUTCOME —
// THE SAME DISCIPLINE `application/AchievementEvidenceExchange.js` AND
// `application/PublisherLeaderboardSnapshotClaimVerification.js` (0.8.121)
// ALREADY HOLD, REUSED HERE RATHER THAN REINVENTED. Neither a malformed
// payload nor a well-formed-but-forged one ever throws out of
// `importPublisherLeaderboardSnapshotClaim()` — both are ordinary,
// well-defined outcomes (`INVALID_CLAIM`/`UNVERIFIABLE_CLAIM`) a caller
// checks for, exactly like a network request that comes back 404 rather
// than crashing the caller's process. Only a missing/malformed `verifier`
// argument throws — a programmer error, never untrusted external input,
// the identical distinction `describePublisherLeaderboardSnapshotClaimVerification()`
// already draws in `application/PublisherLeaderboardSnapshotClaimVerification.js`.
//
// A VALID IMPORT DOES NOT MEAN THE CLAIM IS TRUE — ONLY THAT IT IS GENUINE.
// `IMPORTED` means exactly what `signatureValid: true` means one layer up in
// 0.8.121's own verification module: `signerIdentityId` really did sign
// exactly this evidenceFingerprint/policyVersion/snapshotFingerprint triple.
// It says nothing about whether that triple describes any particular
// replica's own reality — see this file's own flagship test, the negative
// half, for the concrete proof that a structurally IMPORTED claim can still
// fail every one of `verifyPublisherLeaderboardSnapshotClaim()`'s own
// semantic checks.
//
// NO STORE, NO ARCHIVE COLLECTION, NO CLAIM HISTORY — DELIBERATELY OUT OF
// SCOPE, NOT MERELY OMITTED. Unlike `application/PlaceNamingClaimExchange.js`
// and `application/BlueprintLineageExchange.js`, this file's two functions
// take no `store` at construction and persist nothing — there is no class
// here at all, only two pure/near-pure functions, mirroring
// `application/AchievementEvidenceExchange.js`'s own free-function shape one
// layer up. A received claim is never written into
// `application/PublicationObservationArchive.js` (no new collection, no
// `SCHEMA_VERSION` bump) and is never remembered across two calls to
// `importPublisherLeaderboardSnapshotClaim()` — receiving the identical
// claim twice imports it twice, each time independently, with no
// deduplication of any kind. A durable "received claims" registry able to
// retain MULTIPLE claims about the same snapshot — including several
// different signers' own claims about it, side by side, without collapsing
// them into a count or an endorsement — is real, separately sized, later
// work (see `docs/Roadmap.md`'s own 0.8.121 entry, "Portable Signed-Claim
// Export/Import... and a durable claim archive, remain genuinely separate,
// later questions").
//
// SYNCHRONOUS, DETERMINISTIC, NETWORK-INDEPENDENT. Neither function reads a
// clock, touches storage, or performs any I/O. Calling either twice with
// byte-identical arguments returns a byte-identical result.
export const PublisherLeaderboardSnapshotClaimImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_CLAIM: 'invalid-claim',
    UNVERIFIABLE_CLAIM: 'unverifiable-claim'
});

const TOP_LEVEL_FIELDS = Object.freeze([
    'kind', 'schemaVersion', 'id', 'evidenceFingerprint', 'policyVersion',
    'snapshotFingerprint', 'signerIdentityId', 'createdAt', 'signature'
]);

// exportPublisherLeaderboardSnapshotClaim() — the ONE, thin export entry
// point. Requires a genuine, already-signed `PublisherLeaderboardSnapshotClaim`
// instance and returns the exact, closed, nine-field payload
// `claim.toJSON()` already produces — never a new shape invented here. See
// this file's own header, "Export Is A Thin, Trusting Passthrough."
export function exportPublisherLeaderboardSnapshotClaim(claim) {
    if (!(claim instanceof PublisherLeaderboardSnapshotClaim)) {
        throw new Error('exportPublisherLeaderboardSnapshotClaim: a PublisherLeaderboardSnapshotClaim instance is required');
    }
    if (!claim.signature) {
        throw new Error('exportPublisherLeaderboardSnapshotClaim: refusing to export an unsigned leaderboard snapshot claim');
    }
    return Object.freeze(claim.toJSON());
}

// importPublisherLeaderboardSnapshotClaim() — the untrusted-input side.
// `payload` may be either the parsed JSON value itself, or the raw text of
// a file/clipboard paste a caller has not yet parsed. `verifier` is
// REQUIRED (an `identity/LocalAuthorizationVerifier.js`-shaped object
// capable of `verifyPublisherLeaderboardSnapshotClaim()`) and its absence
// throws — a programmer error, never tolerated as "no claim was signed,"
// the identical distinction `application/PublisherLeaderboardSnapshotClaimVerification.js`'s
// own `describePublisherLeaderboardSnapshotClaimVerification()` already
// draws.
//
// Returns a frozen `{ outcome, claim, reason }`:
//
//   IMPORTED             — `claim` is a genuine, freshly constructed
//                           `PublisherLeaderboardSnapshotClaim`, its
//                           signature structurally verified: `signerIdentityId`
//                           genuinely signed exactly this
//                           evidenceFingerprint/policyVersion/snapshotFingerprint
//                           triple. `reason` is `null`. This is NOT a
//                           statement that the claim is true relative to
//                           any replica's own evidence — see this file's
//                           own header.
//   INVALID_CLAIM         — `claim` is `null`. The payload was not valid
//                           JSON, did not satisfy this file's own strict,
//                           closed nine-field contract (wrong/missing
//                           `kind`, wrong/missing `schemaVersion`, a
//                           missing or extra top-level field), or failed
//                           `core/PublisherLeaderboardSnapshotClaim.js`'s
//                           own constructor validation (a malformed
//                           `evidenceFingerprint`/`policyVersion`/
//                           `snapshotFingerprint`/`signerIdentityId`).
//                           `reason` names which.
//   UNVERIFIABLE_CLAIM     — `claim` is `null`. The payload was a
//                           well-formed CANDIDATE claim, but its signature
//                           did not structurally verify (forged, tampered,
//                           unsigned, or signed by a key other than its own
//                           claimed `signerIdentityId`). `reason` is
//                           `identity/LocalAuthorizationVerifier.js`'s own
//                           explanation.
//
// Never throws for malformed or unverifiable input — see this file's own
// header, "A Structurally Unverifiable Claim Is An Explicit, Non-Throwing
// Outcome." Never touches any archive, store, or network of any kind.
export function importPublisherLeaderboardSnapshotClaim(payload, verifier) {
    if (!verifier || typeof verifier.verifyPublisherLeaderboardSnapshotClaim !== 'function') {
        throw new Error('importPublisherLeaderboardSnapshotClaim: an authorization verifier capable of verifyPublisherLeaderboardSnapshotClaim is required');
    }

    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    if (!isValidClaimPayloadShape(json)) {
        return Object.freeze({ outcome: PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, claim: null, reason: 'malformed leaderboard snapshot claim payload' });
    }

    let claim;
    try {
        claim = PublisherLeaderboardSnapshotClaim.fromJSON(json);
    } catch (error) {
        return Object.freeze({ outcome: PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, claim: null, reason: error.message });
    }
    if (!claim) {
        return Object.freeze({ outcome: PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, claim: null, reason: 'malformed leaderboard snapshot claim payload' });
    }

    const result = verifier.verifyPublisherLeaderboardSnapshotClaim(claim.toJSON());
    if (!result.valid) {
        return Object.freeze({ outcome: PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, claim: null, reason: result.reason });
    }

    return Object.freeze({ outcome: PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, claim, reason: null });
}

function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
}

// A candidate payload is shape-valid only when it is EXACTLY the nine
// fields `core/PublisherLeaderboardSnapshotClaim.js#toJSON()` produces —
// the identical "closed field list, reject the whole payload the moment
// any part fails" discipline `application/AchievementEvidenceExport.js`'s
// own `validateAchievementEvidenceJSON()` already holds, reused here
// rather than reinvented. `signature` itself is deliberately NOT
// deep-validated here — its own shape is `core/Signature.js`'s own
// concern, and whether it is genuine is `identity/LocalAuthorizationVerifier.js`'s
// own concern, checked immediately after construction, above.
function isValidClaimPayloadShape(json) {
    if (!isPlainObject(json)) return false;
    if (!hasOnlyKeys(json, TOP_LEVEL_FIELDS)) return false;
    if (!TOP_LEVEL_FIELDS.every((key) => key in json)) return false;
    if (json.kind !== PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND) return false;
    if (json.schemaVersion !== CURRENT_SCHEMA_VERSION) return false;
    return true;
}
