import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { fingerprintPublicationObservationArchive } from './PublicationObservationArchiveFingerprint.js';

// 0.8.85 — Explicit Publication Archive Fingerprint Comparison.
//
// 0.8.84 gave a `PublicationObservationArchive` a deterministic identity —
// a 64-character SHA-256 digest a person can copy. It answered "what is
// this archive's own fingerprint?" but not the next, narrower question a
// person actually has once TWO replicas each hold one: "does a
// fingerprint I obtained elsewhere match the archive in front of me right
// now?" This file answers exactly that question, and nothing more.
//
//   this archive                a fingerprint obtained elsewhere
//        │                      (copied, pasted, read off another
//        │ fingerprint          replica's own "Archive Fingerprint" card)
//        │ (0.8.84, reused,            │
//        │  never reimplemented)       │ normalize (see below)
//        ▼                             ▼
//   local digest    ════════?════════   supplied digest
//                          │
//                          ▼
//        MATCH · DIFFERENT · INVALID_FINGERPRINT · INVALID_ARCHIVE
//
// MATCH MEANS "BYTE-IDENTICAL CANONICAL CONTENT," DIFFERENT MEANS "NOT
// THAT" — NEITHER MEANS "TRUSTED," "AUTHENTIC," "CORRECT," "NEWER," OR
// "SHOULD REPLACE THE OTHER." This restates docs/Principles.md, "An
// Archive Fingerprint Identifies Durable Contents; It Does Not Establish
// Their Truth Or Origin (0.8.84)," one layer over a COMPARISON of two
// digests rather than the display of one — see docs/Principles.md, "A
// Fingerprint Comparison Establishes Equality Of Digests, Not Which
// Archive Is Correct (0.8.85)," for that restatement in full. See this
// file's own flagship test for the demonstration that carries 0.8.84's
// own provenance invariant through to comparison unchanged.
//
// REUSES `fingerprintPublicationObservationArchive()` UNCHANGED — NO
// SECOND FINGERPRINTING ALGORITHM. This file computes nothing of its own
// over the archive's own facts; it calls 0.8.84's own function and
// compares its result to a normalized input string. No second hash, no
// second notion of "the archive's own digest."
//
// THE INPUT-NORMALIZATION CONTRACT IS EXPLICIT AND NARROW. The supplied
// fingerprint must be a `string`; it is trimmed of leading/trailing
// whitespace and lowercased (a fingerprint copied from another tool's
// clipboard may carry uppercase hex digits or incidental whitespace —
// this codebase itself only ever PRODUCES lowercase digests, see 0.8.84's
// own `PublicationObservationArchiveFingerprintAlgorithm`); the
// normalized value must then match `/^[0-9a-f]{64}$/` exactly. Nothing
// else is normalized — no partial-match, no prefix-match, no
// whitespace-collapsing beyond a single trim. A non-string input (a
// number, an object, an array, `null`, `undefined`) is never coerced to a
// string and compared — it is `INVALID_FINGERPRINT`, exactly as a
// malformed string is.
//
// `INVALID_ARCHIVE` MIRRORS `fingerprintPublicationObservationArchive()`'S
// OWN STRICT CONTRACT — AS A RESULT, NOT A THROW. application/
// PublicationObservationArchiveFingerprint.js's own algorithm throws for
// a non-`PublicationObservationArchive` input; application/
// PublicationObservationArchiveFingerprintView.js instead silently
// degrades a non-archive input to `PublicationObservationArchive.empty()`'s
// own fingerprint, for DISPLAY purposes. Neither restraint fits a
// COMPARISON: throwing would make this function behave differently from
// every other small, mechanical result it can return, and silently
// degrading to the empty archive could make a bogus `archive` argument
// compare as `MATCH` against a stray copy of the empty archive's own
// fingerprint — a misleading answer for something that exists
// specifically to be trusted at face value. So this function never
// throws and never silently degrades: a non-instance `archive` is its own
// explicit, factual result, checked BEFORE the supplied fingerprint is
// even normalized.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO NETWORK, NO CAPABILITY ACCESS.
// `comparePublicationObservationArchiveFingerprint()` reads no clock,
// touches no storage, wallet, signer, IPFS provider, pinning provider, or
// Bitcoin RPC, and never mutates the archive it reads. Calling it twice
// with byte-identical arguments returns the byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No archive loading,
// replacement, or merging from a supplied fingerprint or a second
// archive — a fingerprint alone carries no facts to load. No automatic
// comparison after import, and no automatic comparison at all: this
// function performs exactly one comparison, on demand, when called, and
// nothing calls it on a person's behalf. No signing, no public/private
// keys, no confidence score, no "archive health," no conflict
// resolution, no record-level diffing, no network fingerprint lookup, no
// automatic peer discovery. See docs/Roadmap.md, 0.8.85, "Deliberately
// excluded," for the complete list.
export const PublicationObservationArchiveFingerprintComparisonResult = Object.freeze({
    MATCH: 'MATCH',
    DIFFERENT: 'DIFFERENT',
    INVALID_FINGERPRINT: 'INVALID_FINGERPRINT',
    INVALID_ARCHIVE: 'INVALID_ARCHIVE'
});

const HEX64_PATTERN = /^[0-9a-f]{64}$/;

// `archive` must be a real `PublicationObservationArchive` instance —
// anything else returns `INVALID_ARCHIVE`, never a throw (see this file's
// own header). `suppliedFingerprint` is normalized per the contract above
// before comparison; anything that fails to normalize to a well-formed
// 64-character lowercase hex digest returns `INVALID_FINGERPRINT`. Never
// throws. Never mutates `archive`. Performs zero network operations and
// requires no capability of any kind.
export function comparePublicationObservationArchiveFingerprint(archive, suppliedFingerprint) {
    if (!(archive instanceof PublicationObservationArchive)) {
        return PublicationObservationArchiveFingerprintComparisonResult.INVALID_ARCHIVE;
    }

    const normalizedFingerprint = normalizeSuppliedFingerprint(suppliedFingerprint);
    if (normalizedFingerprint === null) {
        return PublicationObservationArchiveFingerprintComparisonResult.INVALID_FINGERPRINT;
    }

    const localFingerprint = fingerprintPublicationObservationArchive(archive);
    return normalizedFingerprint === localFingerprint
        ? PublicationObservationArchiveFingerprintComparisonResult.MATCH
        : PublicationObservationArchiveFingerprintComparisonResult.DIFFERENT;
}

// The exact normalization this module performs on a supplied fingerprint
// before comparison — see this file's own "input-normalization contract"
// header. Returns the normalized 64-character lowercase hex string, or
// `null` if `suppliedFingerprint` does not conform.
function normalizeSuppliedFingerprint(suppliedFingerprint) {
    if (typeof suppliedFingerprint !== 'string') return null;
    const normalized = suppliedFingerprint.trim().toLowerCase();
    return HEX64_PATTERN.test(normalized) ? normalized : null;
}
