// 0.8.160 — Explicit Reconciliation Plan Identity Projection.
//
// 0.8.157 through 0.8.159 all pass an explicitly supplied `plan` (0.8.143's
// own result) through, unchanged, as one argument among several, and every
// one of their own headers repeats the identical caveat: "possibly the
// very same plan, possibly a different one entirely." A caller who wants
// to know WHICH plan produced a given `candidateMatchesPlan` fact has had
// no durable, comparable way to say so — only the plan OBJECT itself,
// which is neither small nor stable enough to log, store, or hand to a
// peer as a fact on its own. This file answers exactly that one missing
// question, and nothing else:
//
//   plan
//   (0.8.143's own result, EXPLICITLY SUPPLIED)
//        │
//        ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity()
//        │
//        ▼
//   { algorithm: 'SHA-256', planFingerprint: <64-char lowercase hex>,
//     candidateCount }
//
// "WHICH PLAN" IS NEVER "WHICH PLAN IS RIGHT" — THE ONE ARCHITECTURAL LINE
// THIS MILESTONE EXISTS TO HOLD. This file computes a structural identity
// for the plan it is handed. It does not compare that plan against any
// other, does not say whether the plan is complete, current, or correct,
// and does not rank, prefer, or validate anything about it. Two calls with
// two different plans producing two different `planFingerprint` values
// says only "these are two different plan artifacts" — never "one is
// better," "one is newer," or "one supersedes the other." That reading —
// history against explicit plan, revalidation fact — already belongs to
// 0.8.157/0.8.158/0.8.159; this file adds a fourth, independent identity,
// never a verdict about the other three.
//
// IDENTITY IS SCOPED TO EXACTLY THE THREE CANDIDATE LISTS 0.8.144 ITSELF
// ALREADY READS — NEVER THE PLAN'S OWN SUMMARY STATISTICS. 0.8.143's own
// result carries `claimCount`, `distinctClaimIdCount`, `snapshotCount`,
// and `correspondenceCount` alongside `divergentCorrespondences`,
// `claimsWithoutCorrespondence`, and `snapshotsWithoutCorrespondence` — but
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidate()`
// (0.8.144, UNCHANGED, NOT IMPORTED HERE — see "Architectural boundary,"
// below) never reads the four summary counts when it decides whether a
// selection names a genuine candidate; it reads only the three lists. This
// file reuses that exact surface, unchanged, as "the existing plan
// semantics" this milestone was asked to defer to: `planFingerprint`
// identifies a plan by precisely the content that can make a candidate
// present or absent, and by nothing else. Two plans that name the
// identical candidates, reached from claim histories or snapshot sequences
// of different sizes, fingerprint identically — because from a candidate's
// point of view, they ARE the identical plan.
//
// ORDER IS PRESERVED, NEVER CANONICALIZED — 0.8.143'S OWN ORDERING IS
// ALREADY MEANINGFUL, NOT AN ARBITRARY INGESTION ARTIFACT. 0.8.143's own
// header states its ordering plainly: `divergentCorrespondences` preserves
// first-appearance-in-`claimHistory`-then-supplied-`snapshots`-position;
// `claimsWithoutCorrespondence` is ordered by first appearance in
// `claimHistory`; `snapshotsWithoutCorrespondence` is ordered by ascending
// `snapshotIndex`. None of that is incidental — it is a deterministic
// function of POSITION within the caller's own supplied claim history and
// snapshot sequence, carried through by 0.8.142's own single pass. Sorting
// it away before fingerprinting (the way 0.8.116's own multi-replica
// evidence fingerprint deliberately DOES sort, for a genuinely
// order-independent multiset — see that file's own header) would erase
// exactly the positional information 0.8.143 went out of its way to keep.
// This file therefore does the opposite of 0.8.116 on purpose: `plan`'s
// three lists are fingerprinted in the order they arrive, unchanged — a
// plan whose candidates are identical but differently ordered is treated
// as a genuinely different plan artifact, because 0.8.143's own ordering
// already carries meaning this file has no license to discard.
//
// DUPLICATE CANDIDATES ARE NEVER COLLAPSED — A DIRECT CONSEQUENCE OF
// FINGERPRINTING THE SUPPLIED LISTS AS-IS, NOT A SEPARATE RULE THIS FILE
// ADDS. This file performs no deduplication pass of its own: a
// `claimsWithoutCorrespondence` array holding the same `claimId` twice
// fingerprints differently than one holding it once, purely because the
// two arrays are not the same bytes. Whether such a plan is itself
// well-formed is a question for whatever produced it (0.8.143 itself never
// produces one, per its own "first-received record" restraint) — this
// file does not decide that; it reports whatever structural content it was
// actually handed, exactly once, as one fingerprint.
//
// EVERY LIST ENTRY IS EMBEDDED EXACTLY AS SUPPLIED — NEVER REBUILT, NEVER
// FIELD-FILTERED, NEVER RE-ORDERED FIELD BY FIELD. This file does not
// inspect `claimId`, `snapshotIndex`, `divergence.*`, `association.*`, or
// `verification.*` on any entry — it does not know, and does not need to
// know, which fields make one candidate distinct from another; that
// question belongs to 0.8.144 alone (see "Architectural boundary," below).
// Each entry is handed to `JSON.stringify()` exactly as it stands. A
// genuine 0.8.143 plan already builds every entry in one fixed field order
// (0.8.142's/0.8.143's own construction, unchanged by this file), so this
// needs no field-order normalization of its own for genuine plans; a
// hand-built or malformed entry serializes in whatever key order it
// happens to carry — this file interprets none of it, either way.
//
// A MALFORMED OR ABSENT `plan`, OR A MALFORMED LIST WITHIN ONE, DEGRADES
// EXACTLY LIKE 0.8.144'S OWN TOLERANCE — NEVER A SECOND VALIDATION LAYER.
// 0.8.144's own header states it plainly: "a `plan` that does not carry a
// genuine array in the relevant list position... degrades to zero
// candidates for that type, exactly like an empty list — never a thrown
// error." This file applies the identical rule, independently, to each of
// the three lists: a non-object `plan`, or a `plan` whose
// `divergentCorrespondences`/`claimsWithoutCorrespondence`/
// `snapshotsWithoutCorrespondence` is missing or not a genuine array,
// treats that list as `[]` — never a fabricated entry, never a thrown
// error. A completely malformed `plan` therefore produces the exact same
// `planFingerprint` as a genuine, empty 0.8.143 plan: both name zero
// candidates, and this file's own identity depends on candidates alone.
//
// `candidateCount` IS THE SUM OF THE THREE NORMALIZED LISTS' OWN LENGTHS —
// NEVER A COUNT READ OFF THE SUPPLIED `plan` ITSELF. 0.8.143's own
// `divergentCorrespondenceCount`/`claimsWithoutCorrespondenceCount`/
// `snapshotsWithoutCorrespondenceCount` are trusted nowhere in this file;
// `candidateCount` is always recomputed from the identical normalized
// lists `planFingerprint` is itself computed from, so the two fields can
// never disagree about how many candidates the fingerprint actually
// covers, even when a hand-built or malformed `plan` carries count fields
// that do not match its own list lengths.
//
// THE FINGERPRINT PRIMITIVE IS THE ONE THIS CODEBASE ALREADY ESTABLISHED —
// NEVER A COMPETING SCHEME. `{ algorithm: 'SHA-256', fingerprint: <64-char
// lowercase hex> }` is application/PublicationObservationArchiveFingerprint.js's
// (0.8.84), application/AchievementEvidenceFingerprint.js's (0.8.116), and
// application/PublisherLeaderboardSnapshotFingerprint.js's (0.8.121) own
// established shape, reused here a fourth time under a name this file's
// own result carries as `planFingerprint`. SHA-256 is implemented from
// first principles and DELIBERATELY DUPLICATED, not imported, for the
// identical reason every one of those three files' own headers already
// state: `crypto.subtle.digest()` is Promise-only and has no honest use
// alongside every other synchronous `describeXxx()` in this codebase. The
// canonicalization step — `JSON.stringify()` over a normalized shape built
// in one fixed field order — mirrors 0.8.121's own choice for a snapshot,
// which likewise has exactly one well-defined shape: this file builds that
// one normalized shape itself (see `normalizePlanForIdentity()` below),
// rather than trusting the supplied `plan` object's own key insertion
// order at the top level.
//
// NO PLAN CLASS, NO PERSISTENCE, NO RECONSTRUCTXXX() ENTRY POINT — THE
// PLAN REMAINS EXACTLY WHAT 0.8.143 ALREADY MADE IT. This file adds no new
// type for `plan`, changes nothing about how 0.8.143 produces one, and
// introduces no durable store of plan identities. 0.8.143's own header
// already establishes that a plan is a derived, in-memory artifact the
// archive never persists — this file's own identity is computed fresh
// every time, exactly like the fingerprint files it reuses the shape of,
// and ships with no `reconstructXxx()` for the identical reason 0.8.157's
// own header already gives one layer over: there is no archive-stored plan
// to reconstruct an identity from.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. Reads no clock, touches
// no network, no storage, no verifier, and mutates neither `plan` nor
// anything inside it. Calling this function twice with equivalent
// arguments — even reached by two entirely independent code paths —
// returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL. This file imports nothing
// from `application/PublisherLeaderboardClaimSnapshotReconciliation.js`
// (0.8.144's own candidate-selection boundary), `application/
// PublisherLeaderboardClaimSnapshotReconciliationPlanView.js` (0.8.143
// itself), `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// any decision-history module, any revalidation module, any verification
// or correspondence module, or any archive module — it performs no
// candidate SELECTION of its own (it never asks "does this ONE candidate
// exist," only "what does the WHOLE plan structurally contain"), no
// verification, and reads no archive. It trusts nothing about how `plan`
// was produced beyond the three list fields its own name already
// documents.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Comparing two plan identities.** A caller already has everything
//   needed with `===` over two `planFingerprint` values; a dedicated
//   comparison entry point, if one earns its keep, is separately sized
//   later work, mirroring 0.8.116's own identical restraint.
// - **Any candidate-level selection or matching.** This file never asks
//   whether one particular candidate exists in `plan` — that is 0.8.144's
//   own, already-built question. It fingerprints the plan's candidate
//   surface as a whole.
// - **Combining this identity with a decision or a revalidation fact.**
//   Producing `{ decision, planFingerprint, candidateMatchesPlan, ... }`
//   together is 0.8.161's own, separately sized, later question, per this
//   milestone's own request.
// - **A plan class, a persistence layer, or a `reconstructXxx()` entry
//   point.** See "No plan class," above.
// - **Trust/reputation judgments, staleness, correctness, severity, or
//   confidence about the plan.** See "'Which plan' is never 'which plan is
//   right,'" above.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export const PublisherLeaderboardClaimSnapshotReconciliationPlanIdentityAlgorithm = 'SHA-256';

export function describePublisherLeaderboardClaimSnapshotReconciliationPlanIdentity(plan) {
    const normalized = normalizePlanForIdentity(plan);

    return Object.freeze({
        algorithm: PublisherLeaderboardClaimSnapshotReconciliationPlanIdentityAlgorithm,
        planFingerprint: sha256Hex(JSON.stringify(normalized)),
        candidateCount: (
            normalized.divergentCorrespondences.length
            + normalized.claimsWithoutCorrespondence.length
            + normalized.snapshotsWithoutCorrespondence.length
        )
    });
}

// The one normalized shape this file ever fingerprints — a fixed field
// order (`divergentCorrespondences`, `claimsWithoutCorrespondence`,
// `snapshotsWithoutCorrespondence`, 0.8.143's own field order, unchanged),
// each list defaulted to `[]` exactly like 0.8.144's own tolerance when the
// supplied `plan` does not carry a genuine array in that position. See this
// file's own header, "A malformed or absent plan... degrades exactly like
// 0.8.144's own tolerance."
function normalizePlanForIdentity(plan) {
    const source = (plan !== null && typeof plan === 'object') ? plan : {};
    return {
        divergentCorrespondences: Array.isArray(source.divergentCorrespondences) ? source.divergentCorrespondences : [],
        claimsWithoutCorrespondence: Array.isArray(source.claimsWithoutCorrespondence) ? source.claimsWithoutCorrespondence : [],
        snapshotsWithoutCorrespondence: Array.isArray(source.snapshotsWithoutCorrespondence) ? source.snapshotsWithoutCorrespondence : []
    };
}

function sha256Hex(text) {
    return bytesToHex(sha256(new TextEncoder().encode(text)));
}

// ---------------------------------------------------------------------
// SHA-256, implemented from first principles — deliberately duplicated
// from, not imported from, application/PublicationObservationArchiveFingerprint.js,
// application/AchievementEvidenceFingerprint.js, and application/
// PublisherLeaderboardSnapshotFingerprint.js. See this file's own header
// for why.
// ---------------------------------------------------------------------

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(bytes) {
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const msgLen = bytes.length;
    let totalLen = msgLen + 1;
    while (totalLen % 64 !== 56) totalLen++;
    totalLen += 8;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    new DataView(padded.buffer).setBigUint64(totalLen - 8, BigInt(msgLen) * 8n, false);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = ((padded[offset + i * 4] << 24) | (padded[offset + i * 4 + 1] << 16) | (padded[offset + i * 4 + 2] << 8) | padded[offset + i * 4 + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const view = new DataView(out.buffer);
    view.setUint32(0, h0, false); view.setUint32(4, h1, false); view.setUint32(8, h2, false); view.setUint32(12, h3, false);
    view.setUint32(16, h4, false); view.setUint32(20, h5, false); view.setUint32(24, h6, false); view.setUint32(28, h7, false);
    return out;
}

function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}
