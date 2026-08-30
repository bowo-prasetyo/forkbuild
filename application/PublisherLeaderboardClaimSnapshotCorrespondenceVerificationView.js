import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondence } from './PublisherLeaderboardClaimSnapshotCorrespondenceView.js';
import { describePublisherLeaderboardHistoricalClaimVerification } from './PublisherLeaderboardHistoricalClaimVerification.js';

// 0.8.140 — Historical Claim-to-Snapshot Correspondence Verification Projection.
//
// 0.8.139 answered "given a whole claim history and an explicitly supplied
// snapshot sequence, WHICH snapshots correspond to WHICH claims?" — purely
// structurally, by complete `snapshotFingerprint` agreement, never touching
// a signature. 0.8.135 answered a genuinely different question — "does
// THIS stored claim's signature check out, and does it semantically agree
// with THIS ONE explicitly supplied historical snapshot?" — but only ever
// for a single, caller-named pair; it has no opinion about which pairs are
// worth asking that question of in the first place. Both files' own
// "Deliberately excluded" lists name the gap between them: 0.8.135 calls it
// "automatic historical matching... genuinely separate, later work,
// composing this file's own comparison with whatever historical snapshots
// a caller happens to hold"; 0.8.139 calls it "trust/reputation judgments...
// a claim can correspond to a snapshot structurally while its signature is
// invalid, and this file has no vocabulary for that at all." This file is
// that composition, finally built — not a third comparison mechanism, but
// 0.8.135 called once for every pair 0.8.139 already discovered:
//
//   claimHistory                      snapshots
//   (LeaderboardClaimRecord[],        (PublisherLeaderboardSnapshot[],
//    0.8.123, UNCHANGED)               EXPLICITLY SUPPLIED, 0.8.119,
//        │                             UNCHANGED)
//        │                                    │
//        └──────────────┬─────────────────────┘
//                        ▼
//   describePublisherLeaderboardClaimSnapshotCorrespondence()
//          (0.8.139, UNCHANGED — discovers WHICH pairs exist,
//           by complete snapshotFingerprint agreement, no signature)
//                        │
//                        │  one eligible (claim, snapshot) pair
//                        │  per kept `snapshotMatches[]` entry
//                        ▼
//   describePublisherLeaderboardHistoricalClaimVerification()
//          (0.8.135, UNCHANGED — signatureValid + the three
//           semantic facts + matches, for that ONE eligible pair)
//                        │
//                        ▼
//   describePublisherLeaderboardClaimSnapshotCorrespondenceVerification()
//                        │
//                        ▼
//   { claimCount, distinctClaimIdCount, snapshotCount, correspondenceCount,
//     correspondences: [{ claimId, signerIdentityId, claimCreatedAt,
//       matchingSnapshotCount, snapshotMatches: [{ snapshotIndex,
//       association: { evidenceFingerprintMatches, policyVersionMatches,
//         snapshotFingerprintMatches },
//       verification: { signatureValid, evidenceFingerprintMatches,
//         policyVersionMatches, snapshotFingerprintMatches, matches }
//     }, ...] }, ...] }
//
// CORRESPONDENCE DETERMINES WHICH PAIRS ARE ELIGIBLE FOR VERIFICATION; IT
// DOES NOT IMPLY VERIFICATION SUCCESS — THE ONE ARCHITECTURAL RULE THIS
// MILESTONE EXISTS TO MAKE EXPLICIT. 0.8.139's own keep/discard decision
// (kept exactly when `snapshotFingerprintMatches` reads `true`) answers a
// purely structural question — "does this claim's own asserted identity
// name this snapshot?" — and never touches a signature to answer it. A
// pair 0.8.139 kept can still fail 0.8.135's own verification in exactly
// the way a claim's own asserted fields can be self-inconsistent (0.8.137's/
// 0.8.138's/0.8.139's own "Claim C"): a genuinely corresponding pair whose
// signature is forged or corrupted. This file never collapses that
// distinction — every kept `snapshotMatches[]` entry below carries BOTH
// layers, side by side, never merged: `association` is 0.8.139's own three
// structural facts for that pair, carried through byte for byte;
// `verification` is 0.8.135's own five facts — `signatureValid` among them
// — for that SAME pair, computed fresh. See this file's own FLAGSHIP test
// for the concrete proof: a claim can structurally correspond to a
// snapshot (`association.snapshotFingerprintMatches: true`) while its
// signature is tampered (`verification.signatureValid: false`), and the
// two layers report exactly that, independently, on the identical entry.
//
// A PAIR 0.8.139 NEVER DISCOVERED NEVER GETS A VERIFICATION RESULT —
// ABSENCE OF CORRESPONDENCE IS NEVER SILENTLY TURNED INTO A VERIFICATION
// FAILURE. This file never invents a `snapshotMatches` entry for a
// (claim, snapshot) combination 0.8.139 itself declined to keep. "These
// two artifacts don't correspond" and "this pair's verification failed"
// are different facts, and confusing them would silently narrow 0.8.139's
// own honestly reported absence (`matchingSnapshotCount: 0`) into a
// fabricated verdict about a pair nobody asked to compare. A claim with no
// corresponding supplied snapshot is still kept as its own correspondence
// entry, with an empty `snapshotMatches`, exactly as 0.8.139 already
// reports it — this file adds no verification result where there is no
// eligible pair to verify. See this file's own FLAGSHIP test's fourth
// case for the concrete proof.
//
// REUSES 0.8.139 UNCHANGED — NO SECOND CORRESPONDENCE ALGORITHM. Every
// `claimId`/`signerIdentityId`/`claimCreatedAt`/`matchingSnapshotCount`/
// `snapshotIndex` field below, and every `association.*` fact, is
// `describePublisherLeaderboardClaimSnapshotCorrespondence()`'s (0.8.139,
// UNCHANGED) own result, carried through byte for byte. This file performs
// no independent fingerprint comparison, no second keep/discard decision,
// and no second double loop over claims and snapshots — 0.8.139's own
// single call already IS that loop.
//
// REUSES 0.8.135 UNCHANGED — NO SECOND CRYPTOGRAPHIC VERIFICATION
// IMPLEMENTATION. Every `signatureValid`/`evidenceFingerprintMatches`/
// `policyVersionMatches`/`snapshotFingerprintMatches`/`matches` fact inside
// a `verification` object below is
// `describePublisherLeaderboardHistoricalClaimVerification()`'s (0.8.135,
// UNCHANGED) own result for that one eligible pair, embedded whole and
// unmodified. This file calls no verifier method itself, checks no
// signature itself, and computes no fingerprint itself — it only decides
// WHICH pairs 0.8.135 gets called for, by deferring entirely to 0.8.139's
// own answer to that question.
//
// BRIDGING CLAIM IDENTITY BACK TO A RECORD IS WIRING, NOT A SECOND
// DISCOVERY ALGORITHM. 0.8.139's own correspondence result deliberately
// reports `claimId`, never the `LeaderboardClaimRecord` itself (its own
// restraint, keeping claim identity separate from receipt identity). But
// 0.8.135 needs the genuine record, not merely its id, to verify against.
// This file's only original work — besides assembling the two layers side
// by side — is a single pass over `claimHistory` building `claimId →
// first-received record`, the identical "first receipt of each distinct
// claim id supplies that claim's fields" restraint 0.8.132's/0.8.139's own
// headers already hold. This pass performs no snapshot comparison, no
// fingerprinting, and no keep/discard decision of any kind — it never
// touches `snapshots` at all — so it is bookkeeping to reach 0.8.135, never
// a competing correspondence engine.
//
// EVERY DISCOVERED CORRESPONDENCE IS STILL KEPT, AMBIGUITY STILL
// PRESERVED — THE IDENTICAL RESTRAINT 0.8.139's OWN HEADER ALREADY HOLDS,
// HELD HERE ONCE MORE. If one claim corresponds to several supplied
// snapshots (including the identical snapshot supplied more than once —
// 0.8.139's own duplicate-snapshot flagship, unchanged), every one of
// those `snapshotMatches[]` entries independently receives its own
// `verification` result. This file never selects a "best" snapshot, never
// collapses multiple matches into one, and never deduplicates snapshot
// positions that happen to share a fingerprint — it verifies every pair
// 0.8.139 kept, exactly once each, in the identical order 0.8.139 already
// reports them.
//
// NO COLLAPSED TRUST JUDGMENT — THE IDENTICAL VOCABULARY BOUNDARY EVERY
// FILE IN THIS FAMILY ALREADY HOLDS. This file adds no `trusted`,
// `validClaim`, `trustedSnapshot`, `confidence`, `reputation`, `score`, or
// `rank` field anywhere, on top of 0.8.139's own three structural facts and
// 0.8.135's own five verification facts — those eight facts, kept visibly
// separate as `association`/`verification`, are already sufficient. A
// caller who wants a single collapsed verdict already has 0.8.135's own
// `matches`, reachable per pair inside `verification.matches`; this file
// invents no ninth, "more collapsed than `matches`" field on top of it.
//
// A VERIFIER IS REQUIRED EXACTLY WHEN A PAIR ACTUALLY NEEDS VERIFYING —
// NEVER EAGERLY, NEVER SILENTLY TOLERATED. This file never validates
// `verifier` up front; it is handed straight to 0.8.135 for each eligible
// pair, and 0.8.135's own requirement (throws when no genuine verifier is
// supplied and a pair actually needs checking — 0.8.135's own tolerance,
// UNCHANGED) applies exactly as it already would to a direct 0.8.135 call.
// A claim history and snapshot sequence with zero eligible pairs — e.g.
// empty input, or every claim corresponding to nothing supplied — never
// touches `verifier` at all and never throws, exactly like 0.8.139's own
// tolerance for malformed input already holds.
//
// NO ARCHIVE RECONSTRUCTION, NO AUTOMATIC SNAPSHOT SELECTION — THE
// IDENTICAL RESTRAINT 0.8.135's/0.8.139's OWN HEADERS ALREADY HOLD, HELD
// HERE ONCE MORE FOR THEIR COMPOSITION. This file operates entirely on
// `claimHistory` + `snapshots` + `verifier`, exactly as supplied — no
// archive import anywhere, and no logic anywhere that reaches past what
// 0.8.139 already discovered to go looking for "the" matching snapshot.
//
// ARCHITECTURAL BOUNDARY — IMPORTS 0.8.139, 0.8.135, AND 0.8.123'S OWN
// RECORD CLASS ONLY. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotAssociationView.js`,
// `application/PublisherLeaderboardSnapshotClaimVerification.js`, any
// signing or identity module, any archive module, any ranking module, or
// `application/PublisherLeaderboardSnapshotTimelineView.js` — grep it and
// none of that vocabulary appears. The dependency direction stays two
// lines converging: 0.8.139 → 0.8.140 ← 0.8.135, never a third, parallel
// engine duplicating either.
//
// MALFORMED INPUT TOLERANCE MATCHES 0.8.139's OWN, UNCHANGED. A non-array
// `claimHistory`, or elements inside it that are not genuine
// `LeaderboardClaimRecord` instances, are silently excluded — 0.8.139's
// own tolerance, reused. A non-array `snapshots` degrades to an empty
// sequence. Neither ever throws.
//
// CORRESPONDENCES AND SNAPSHOT MATCHES ARE ORDERED EXACTLY AS 0.8.139
// ALREADY ORDERS THEM — NEVER RESORTED. `correspondences` is ordered by
// first appearance in `claimHistory`; `snapshotMatches` within one entry
// is ordered by supplied `snapshots` position — the identical discipline
// 0.8.139's own header already holds, unchanged by this file's own
// verification layer.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED (GIVEN A DETERMINISTIC
// VERIFIER): NO CLOCK, NO STORAGE, NO NETWORK, NO MUTATION. Reads no
// clock, mutates neither `claimHistory` nor `snapshots` nor any element
// inside either — the identical restraint 0.8.139's/0.8.135's own headers
// already hold. Calling this function twice with equivalent arguments —
// even reached by two entirely independent code paths — returns a
// byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic snapshot reconstruction, archive access.** `snapshots` is
//   always an explicitly supplied array; this file reconstructs nothing
//   from an archive and imports no archive module.
// - **Automatic snapshot selection, "best matching" snapshot selection.**
//   See "Every discovered correspondence is still kept," above — ambiguity
//   is reported, never resolved.
// - **Trust/reputation judgments, confidence scores, claim ranking, a
//   collapsed verdict beyond 0.8.135's own `matches`.** See "No collapsed
//   trust judgment," above.
// - **A second correspondence algorithm or a second cryptographic
//   verification implementation.** See "Reuses 0.8.139 unchanged" and
//   "Reuses 0.8.135 unchanged," above — both are called, neither is
//   re-implemented.
// - **Historical snapshot persistence, synchronization of any kind.**
//   Neither argument is ever mutated, and this file introduces no durable
//   store of its own.
// - **New cryptographic primitives.** `verifier` is handed to 0.8.135
//   exactly as supplied; this file calls no verifier method itself.
// - **A temporal projection across a sequence of claim histories or
//   snapshot timelines.** This file answers the question for exactly one
//   caller-supplied claim history and one caller-supplied snapshot
//   sequence; a later "how did a signer's claims verify against their
//   corresponding historical snapshots over time" projection is genuinely
//   separate, later work composing this one rather than duplicating it.
export function describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(claimHistory, snapshots, verifier) {
    const correspondence = describePublisherLeaderboardClaimSnapshotCorrespondence(claimHistory, snapshots);
    const rawSnapshots = Array.isArray(snapshots) ? snapshots : [];

    // claimId → first-received record — see this file's own header,
    // "Bridging claim identity back to a record is wiring, not a second
    // discovery algorithm."
    const recordsByClaimId = new Map();
    for (const record of (Array.isArray(claimHistory) ? claimHistory : [])) {
        if (!(record instanceof LeaderboardClaimRecord)) continue;
        const claimId = record.claim.id;
        if (recordsByClaimId.has(claimId)) continue;
        recordsByClaimId.set(claimId, record);
    }

    const correspondences = correspondence.correspondences.map((entry) => {
        const record = recordsByClaimId.get(entry.claimId);

        const snapshotMatches = entry.snapshotMatches.map((match) => {
            const snapshot = rawSnapshots[match.snapshotIndex];
            const verification = describePublisherLeaderboardHistoricalClaimVerification(record, snapshot, verifier);

            return Object.freeze({
                snapshotIndex: match.snapshotIndex,

                association: Object.freeze({
                    evidenceFingerprintMatches: match.evidenceFingerprintMatches,
                    policyVersionMatches: match.policyVersionMatches,
                    snapshotFingerprintMatches: match.snapshotFingerprintMatches
                }),

                verification: Object.freeze({
                    signatureValid: verification.signatureValid,
                    evidenceFingerprintMatches: verification.evidenceFingerprintMatches,
                    policyVersionMatches: verification.policyVersionMatches,
                    snapshotFingerprintMatches: verification.snapshotFingerprintMatches,
                    matches: verification.matches
                })
            });
        });

        return Object.freeze({
            claimId: entry.claimId,
            signerIdentityId: entry.signerIdentityId,
            claimCreatedAt: entry.claimCreatedAt,
            matchingSnapshotCount: entry.matchingSnapshotCount,
            snapshotMatches: Object.freeze(snapshotMatches)
        });
    });

    return Object.freeze({
        claimCount: correspondence.claimCount,
        distinctClaimIdCount: correspondence.distinctClaimIdCount,
        snapshotCount: correspondence.snapshotCount,
        correspondenceCount: correspondence.correspondenceCount,
        correspondences: Object.freeze(correspondences)
    });
}
