import { describeIpfsPublicationContentVerification } from './IpfsPublicationContentVerificationView.js';

// 0.8.72 — IPFS Publication Verification History & Inspection UI.
//
// application/IpfsPublicationContentVerificationHistory.js turns repeated
// "Verify"/"Verify Again" clicks against one publication record into an
// accumulated SEQUENCE of raw coordinator outcomes. This file turns that
// sequence into the plain, chronological narration a "Verification
// History" disclosure shows — composing the UNCHANGED, existing
// application/IpfsPublicationContentVerificationView.js#
// describeIpfsPublicationContentVerification() (0.8.70) over every entry,
// exactly once each, never re-deriving a `state`/`stateLabel`/`reason` of
// its own:
//
//   describeIpfsPublicationContentVerificationHistory(history)
//     → { count, verifications: [...] }, in the SAME order `history`
//       itself holds them — oldest first, exactly the order application/
//       IpfsPublicationContentVerificationHistory.js#
//       appendIpfsPublicationContentVerificationHistoryEntry() already
//       appends in. Never sorted, grouped, or reordered by state.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: these are observations made
// AT DIFFERENT TIMES, never a running status. Narrating the sequence
// never implies the latest observation retroactively changes an earlier
// one's own recorded state —
//
//   11:03 — Retrieved content matches the recorded content hash
//   11:17 — Content retrieval unavailable
//   11:31 — Retrieved content matches the recorded content hash
//
// is not collapsed, averaged, or resolved into one current answer
// anywhere in this file's output — all three entries stand, unchanged,
// side by side. See docs/Principles.md, "The UI Displays Observations; It
// Does Not Turn Them Into A Verdict (0.8.57)," held here once more for a
// SEQUENCE of observations rather than a single one.
//
// Every field this function returns for one entry is exactly what
// describeIpfsPublicationContentVerification() itself already returns for
// that entry, unchanged — this file adds no new field, computes nothing,
// and re-verifies nothing. `null`/`undefined` entries (never produced by
// application/IpfsPublicationContentVerificationHistory.js's own
// append(), which is a no-op for a missing observation) are skipped
// rather than narrated as a false IDLE placeholder.
//
// Pure and stateless: no constructor, no network access, no history of
// its own. Calling this function twice with byte-identical input returns
// a byte-identical result.
export function describeIpfsPublicationContentVerificationHistory(history) {
    const verifications = (Array.isArray(history) ? history : [])
        .filter((observation) => observation !== null && observation !== undefined)
        .map((observation) => describeIpfsPublicationContentVerification(observation));
    return Object.freeze({ count: verifications.length, verifications: Object.freeze(verifications) });
}
