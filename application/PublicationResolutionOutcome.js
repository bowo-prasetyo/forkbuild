// 0.7.1 — IPFS Content Publication & Resolution.
//
// 0.7.0's own application/PublicationResolver.js#resolve() only ever had
// one way to fail: throw, with a message. That was sufficient as long as
// the only ContentStore behind it was content/LocalContentStore.js — a
// local read either finds bytes or it doesn't, instantly and forever.
// A network-backed ContentStore (content/IpfsContentStore.js) introduces
// a genuinely NEW kind of failure this codebase has never had to name
// before: content that is completely valid — correctly signed, correctly
// hashed, correctly addressed — but simply not reachable RIGHT NOW. That
// is never the same fact as "this publication is bad," and collapsing
// both into one generic thrown Error would force every caller to
// string-match a message to tell them apart.
//
// This enum names every way resolve() can end, in the same order its own
// ten-step pipeline checks them (see application/PublicationResolver.js's
// own header):
//
//   RESOLVED                       — every check passed
//   INVALID_ENVELOPE               — the DecentralizedPublication itself
//                                     is malformed, or names a different
//                                     contentKind than the caller asked
//                                     for
//   INVALID_PUBLICATION_SIGNATURE  — the envelope's own signature does
//                                     not verify
//   CONTENT_UNAVAILABLE            — the referenced bytes could not be
//                                     retrieved right now — a network
//                                     failure, a timeout, a node that
//                                     doesn't have (or hasn't yet
//                                     replicated) this content. NEVER a
//                                     verdict about the publication's
//                                     own validity — see this file's own
//                                     header.
//   CONTENT_HASH_MISMATCH          — bytes WERE retrieved, but they do
//                                     not hash to what the envelope's own
//                                     ContentReference claims
//   INVALID_CONTENT                — the retrieved bytes are not valid
//                                     JSON, or fail the wrapped content's
//                                     own structural validator
//   INVALID_CONTENT_SIGNATURE      — the wrapped content's OWN signature
//                                     (never the envelope's) does not
//                                     verify
//   DOMAIN_CROSS_CHECK_FAILED      — every prior check passed, but the
//                                     caller's own optional domain check
//                                     (e.g. "does this fingerprint match
//                                     what's already local?") rejected it
//
// A caller that only cares about success/failure can still treat
// anything but RESOLVED as "didn't work." A caller that wants to retry
// later, rather than discard the publication outright, checks for
// exactly CONTENT_UNAVAILABLE — the one outcome in this list that says
// nothing whatsoever about whether the publication itself is trustworthy.
export const PublicationResolutionOutcome = Object.freeze({
    RESOLVED: 'resolved',
    INVALID_ENVELOPE: 'invalid-envelope',
    INVALID_PUBLICATION_SIGNATURE: 'invalid-publication-signature',
    CONTENT_UNAVAILABLE: 'content-unavailable',
    CONTENT_HASH_MISMATCH: 'content-hash-mismatch',
    INVALID_CONTENT: 'invalid-content',
    INVALID_CONTENT_SIGNATURE: 'invalid-content-signature',
    DOMAIN_CROSS_CHECK_FAILED: 'domain-cross-check-failed'
});
