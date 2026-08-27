// 0.8.69 — IPFS Publication Record & Content-Identity Binding.
//
// The vocabulary `application/IpfsPublicationContentVerifier.js` reports
// its own single retrieval-and-verify attempt through — deliberately the
// same three values `application/BitcoinAnchorContentProofState.js`
// (0.8.55) already established one domain over, for the identical
// reason: an IPFS retrieval and a Bitcoin OP_RETURN proof both answer
// the exact same question — "does the content this locator claims to
// serve actually hash to the identity it was published under?" — and
// this codebase names that question identically everywhere it is asked:
//
//   Bitcoin:  HASH_MATCH / HASH_MISMATCH / UNAVAILABLE
//   IPFS:     HASH_MATCH / HASH_MISMATCH / UNAVAILABLE
//
//   HASH_MATCH    — `content/IpfsGatewayContentStore.js` or `content/
//                   IpfsContentStore.js` returned bytes, and those bytes
//                   hash to the record's own `contentHash` (checked by
//                   `core/ContentReference.js#verify()`, unmodified).
//   HASH_MISMATCH — bytes were retrieved, but they do NOT hash to the
//                   claimed `contentHash`. A REAL, definite fact about
//                   what is presently being served at that locator —
//                   never conflated with UNAVAILABLE below.
//   UNAVAILABLE   — no bytes could be retrieved right now: the gateway
//                   or node was unreachable, timed out, or does not
//                   presently have this CID (`content/IpfsContentStore
//                   .js`'s own `ContentUnavailableError`, thrown by
//                   every IPFS-backed ContentStore this codebase has).
//                   Retrying later may reach a different, more
//                   informative answer.
//
// NEVER A SCORE, A CONFIDENCE PERCENTAGE, OR A "TRUSTED"/"VERIFIED"
// LABEL. This vocabulary names only what one retrieval attempt just
// found — never a broader judgment about the content, the gateway, or
// IPFS itself. See `docs/Principles.md`, "The UI Displays Observations;
// It Does Not Turn Them Into A Verdict (0.8.57)," and "Reconciliation
// Composes Independent Observations; It Does Not Score Them (0.8.55)" —
// this is that same restraint's Bitcoin-side name, reused verbatim
// rather than reinvented, because it is the same fact one layer over.
export const IpfsPublicationContentVerificationState = Object.freeze({
    HASH_MATCH: 'hash-match',
    HASH_MISMATCH: 'hash-mismatch',
    UNAVAILABLE: 'unavailable'
});

export function isValidIpfsPublicationContentVerificationState(value) {
    return Object.values(IpfsPublicationContentVerificationState).includes(value);
}
