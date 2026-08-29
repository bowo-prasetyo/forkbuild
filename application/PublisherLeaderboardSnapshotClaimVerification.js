import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublisherLeaderboardSnapshot, reconstructPublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from './PublisherLeaderboardSnapshotFingerprint.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';

// 0.8.121 — Signed Reproducible Leaderboard Snapshot Claim Verification.
//
// This is the file the flagship scenario actually runs through:
//
//   Alice                                    Bob
//   -----                                    ---
//   evidence -> snapshot (0.8.119)           (never sees Alice's evidence,
//   -> sign a claim about it                  her snapshot, or her
//      (core/PublisherLeaderboardSnapshotClaim.js,                 archive)
//       application/CreatePublisherLeaderboardSnapshotClaimUseCase.js)
//        │
//        │  claim travels as plain, serialized JSON — the ONLY thing
//        │  that crosses from Alice to Bob
//        ▼
//   Bob: verifyPublisherLeaderboardSnapshotClaim(bobArchive, claim, verifier)
//        │
//        ├── cryptographic check: did signerIdentityId really sign
//        │   exactly this claim?           (identity/LocalAuthorizationVerifier.js)
//        │
//        └── independent reconstruction: does MY OWN evidence, under
//            the SAME policy, produce a snapshot whose evidence
//            fingerprint / policy version / snapshot fingerprint match
//            what the claim asserts?         (0.8.119, UNCHANGED, one more
//                                              time — Bob never re-derives
//                                              from Alice's claim, he
//                                              recomputes from his OWN
//                                              archive)
//
// No server. No trusted leaderboard. No trusted achievement result. Bob
// independently reconstructs the conclusion and checks a signature —
// nothing here is EVER taken on the claim's own word.
//
// FOUR INDEPENDENT FACTS, EACH COMPUTED SEPARATELY — NEVER DERIVED FROM
// ONE ANOTHER — THE IDENTICAL DISCIPLINE application/
// PublisherLeaderboardSnapshotVerification.js's own header already holds
// (0.8.120), reused here rather than reinvented:
//
//   { matches, signatureValid, evidenceFingerprintMatches,
//     policyVersionMatches, snapshotFingerprintMatches }
//
// `signatureValid` answers ONE question and ONLY that question: did
// `claim.signerIdentityId` genuinely sign exactly this
// evidenceFingerprint/policyVersion/snapshotFingerprint triple? It is
// computed by `identity/LocalAuthorizationVerifier.js#verifyPublisherLeaderboardSnapshotClaim()`
// and NEVER consults this replica's own archive at all. The other three
// facts answer a completely different question — does MY OWN independent
// reconstruction agree with what the claim asserts? — and are computed
// straight from `reconstructPublisherLeaderboardSnapshot()` (0.8.119,
// UNCHANGED), NEVER consulting the signature at all. A CLAIM CAN BE
// VALIDLY SIGNED AND STILL DISAGREE WITH THIS REPLICA'S OWN EVIDENCE —
// `signatureValid: true` alongside `evidenceFingerprintMatches: false` is
// not a contradiction this file resolves or hides; it is the single most
// important distinction this milestone exists to make explicit. See this
// file's own flagship test, Section D, for the concrete proof: a
// perfectly genuine signature over a claim about evidence Bob simply does
// not hold.
//
// A VALID SIGNATURE MEANS "THE SIGNER GENUINELY SIGNED THIS" — NEVER
// "THIS CLAIM IS TRUE." `signatureValid` says the signing identity really
// did produce this exact claim, byte for byte — the identical, narrow
// statement `core/PublicationAnchor.js`'s own header already makes about
// what ITS signature proves ("nothing about whether the anchored content
// is true"), held here once more, one layer up, over a derived
// conclusion instead of a raw fact. Whether the claim's assertion agrees
// with THIS replica's own reality is answered exclusively by the other
// three fields — never inferred from `signatureValid` alone, and never
// short-circuited: all four fields are always computed, even when one
// already reads false.
//
// TAMPER-EVIDENT BY CONSTRUCTION, NEVER BY A DEDICATED TAMPER CHECK. This
// file adds no "was this claim tampered with" boolean of its own — a
// forged `evidenceFingerprint`, `policyVersion`, `snapshotFingerprint`, or
// `signerIdentityId` on an otherwise-genuine claim changes what the
// signature was computed OVER (see core/PublisherLeaderboardSnapshotClaim.js's
// own canonical signing descriptor), so `signatureValid` alone already
// catches every one of those four mutations without this file inventing
// a parallel check. A forged `signature` field with every other field
// left alone is caught by the identical mechanism, one layer down —
// `identity/LocalAuthorizationVerifier.js#verifyDescriptor()`'s own
// Ed25519 check. See this file's own flagship test, Section E, for each
// of the five fields (four claim fields plus the signature itself) tried
// in turn.
//
// NEVER TRUSTS THE CLAIM FOR THE LOCAL SIDE — THE IDENTICAL RESTRAINT
// 0.8.120's OWN `verifyPublisherLeaderboardSnapshot()` ALREADY HOLDS,
// APPLIED HERE TO A SIGNED CLAIM INSTEAD OF A BARE SNAPSHOT.
// `verifyPublisherLeaderboardSnapshotClaim()` below reconstructs THIS
// replica's own current snapshot from ITS OWN archive exactly once, and
// never reads a leaderboard, a policy, or an evidence collection off the
// claim — a claim carries no such fields to read in the first place (see
// core/PublisherLeaderboardSnapshotClaim.js's own header, "The claim
// names the snapshot; it does not carry it").
//
// NORMALIZATION REUSES 0.8.119's OWN TOLERANCE FOR THE LOCAL SIDE — THE
// IDENTICAL RESTRAINT 0.8.120's OWN `normalizeSnapshot()` ALREADY HOLDS.
// The local snapshot handed to `describePublisherLeaderboardSnapshotClaimVerification()`
// is routed through `describePublisherLeaderboardSnapshot()` (0.8.119,
// UNCHANGED) before its own fingerprint is computed — the exact same
// function, and therefore the exact same fallback, 0.8.120's own
// `normalizeSnapshot()` already uses. A malformed/absent `claim` is
// tolerated separately (see below) — never thrown on, never silently
// treated as a match.
//
// A MALFORMED/ABSENT CLAIM NEVER MATCHES, AND NEVER THROWS. Unlike a
// malformed snapshot (which 0.8.119/0.8.120 both degrade to a
// well-defined EMPTY value that CAN legitimately match an empty archive),
// a malformed claim has no well-defined "empty claim" to degrade to — a
// claim's entire purpose is to name a signer and a signature, and there
// is no meaningful signer to fall back to. `null`, `undefined`, a number,
// a string, or an object missing `signerIdentityId`/`signature` therefore
// always produces `matches: false` (every one of the other four fields
// also false), rather than one file's tolerance quietly turning "nobody
// signed anything" into a passing verification.
export function describePublisherLeaderboardSnapshotClaimVerification(localSnapshot, claim, verifier) {
    if (!verifier || typeof verifier.verifyPublisherLeaderboardSnapshotClaim !== 'function') {
        throw new Error('describePublisherLeaderboardSnapshotClaimVerification: an authorization verifier capable of verifyPublisherLeaderboardSnapshotClaim is required');
    }

    const normalizedLocalSource = (localSnapshot && typeof localSnapshot === 'object') ? localSnapshot : {};
    const normalizedLocal = describePublisherLeaderboardSnapshot(normalizedLocalSource.evidenceFingerprint, normalizedLocalSource.leaderboard);
    const localSnapshotFingerprint = describePublisherLeaderboardSnapshotFingerprint(normalizedLocal).fingerprint;

    const claimRecord = normalizeClaimRecord(claim);
    const structuralResult = claimRecord
        ? verifier.verifyPublisherLeaderboardSnapshotClaim(claimRecord)
        : { valid: false, signed: false, reason: 'no claim' };

    const evidenceFingerprintMatches = Boolean(claimRecord) && claimRecord.evidenceFingerprint === normalizedLocal.evidenceFingerprint;
    const policyVersionMatches = Boolean(claimRecord) && claimRecord.policyVersion === normalizedLocal.policy.version;
    const snapshotFingerprintMatches = Boolean(claimRecord) && claimRecord.snapshotFingerprint === localSnapshotFingerprint;

    return Object.freeze({
        matches: structuralResult.valid && evidenceFingerprintMatches && policyVersionMatches && snapshotFingerprintMatches,
        signatureValid: structuralResult.valid,
        evidenceFingerprintMatches,
        policyVersionMatches,
        snapshotFingerprintMatches
    });
}

// verifyPublisherLeaderboardSnapshotClaim() — the ONE, thin,
// archive-reading entry point, mirroring 0.8.120's own
// `verifyPublisherLeaderboardSnapshot()` exactly. It pulls THIS replica's
// own current snapshot straight out of `reconstructPublisherLeaderboardSnapshot()`
// (0.8.119, UNCHANGED) and hands it, together with the externally
// supplied `claim` and the caller-supplied `verifier`, to the pure
// function above. An invalid/missing `archive` degrades to
// `PublicationObservationArchive.empty()` — the identical tolerance every
// other `reconstructXxx()`/`verifyXxx()` entry point in this family
// already holds.
export function verifyPublisherLeaderboardSnapshotClaim(archive, claim, verifier) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    const localSnapshot = reconstructPublisherLeaderboardSnapshot(safeArchive);
    return describePublisherLeaderboardSnapshotClaimVerification(localSnapshot, claim, verifier);
}

// A claim may arrive as a hydrated PublisherLeaderboardSnapshotClaim
// instance or as plain JSON (the ONLY shape a claim actually travels in —
// see this file's own header). Anything else is not a genuine candidate
// claim at all and normalizes to `null`, handled by the "malformed/absent
// claim never matches" tolerance above.
function normalizeClaimRecord(claim) {
    if (claim instanceof PublisherLeaderboardSnapshotClaim) {
        return claim.toJSON();
    }
    return (claim && typeof claim === 'object') ? claim : null;
}
