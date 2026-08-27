// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
//
// The vocabulary application/IpfsRemotePublicationCoordinator.js reports
// its own explicit "Publish to Remote IPFS" attempt through, and the UI
// drives its own publish button and result from — the identical
// six-value shape application/BitcoinAnchorBroadcastState.js (0.8.64)
// already established for an unrelated external boundary, applied here
// for the first time to content/IpfsRemotePinningContentStore.js's own
// 0.8.67 capability, which has never had a UI-facing state vocabulary
// before now.
//
//   IDLE        — no publish attempt has been made yet for the current
//                 configuration. The starting state, and the state a
//                 fresh "Configure Remote Publishing" submission always
//                 returns to — a newly (re)configured capability always
//                 starts unpublished again, never inheriting a previous
//                 configuration's own PUBLISHED outcome.
//   PUBLISHING  — a publish attempt is in flight: content/
//                 IpfsRemotePinningContentStore.js#put() (0.8.67,
//                 unchanged) has been asked and has not yet answered.
//   PUBLISHED   — the pinning provider accepted the bytes and returned a
//                 CID. This is an OBSERVATION of what the provider just
//                 said, not a guarantee about IPFS, the provider, or the
//                 content — see application/IpfsRemotePublicationView.js's
//                 own header on the vocabulary this state is
//                 deliberately never described with.
//   REJECTED    — the provider reached a definite no: content/
//                 HttpPinningProvider.js's own PinningRejectedError (an
//                 invalid/expired credential, a malformed request, a
//                 quota or size limit). Retrying the identical request
//                 is not expected to succeed; the configuration has to
//                 change first.
//   UNAVAILABLE — the provider could not presently be reached: the SAME
//                 ContentUnavailableError content/IpfsContentStore.js and
//                 content/IpfsGatewayContentStore.js already throw —
//                 unreachable host, a timeout, a 5xx. Retrying later,
//                 with an explicit "Publish Again" click, may succeed.
//   FAILED      — the publish attempt could not be completed for a
//                 reason other than the provider's own definite
//                 rejection or unavailability — an unacceptable or
//                 unverifiable result this coordinator refuses to accept
//                 as a real provider answer (e.g. a "successful" response
//                 that names no CID at all).
//
// A 401/403/QUOTA RESPONSE IS NEVER DISPLAYED AS "NETWORK UNAVAILABLE,"
// AND A TIMEOUT IS NEVER DISPLAYED AS "PROVIDER REJECTED." REJECTED and
// UNAVAILABLE are carried through from content/HttpPinningProvider.js's
// own 0.8.67 classification completely unchanged — this vocabulary adds
// no reclassification of its own, and application/
// IpfsRemotePublicationCoordinator.js never merges the two.
//
// NEVER READY, SAFE, VALID, VERIFIED, TRUSTED, PERMANENT, OR GUARANTEED.
// This vocabulary names only what the last explicit publish attempt
// produced — never a broader judgment about the content, the provider,
// or IPFS itself. See docs/Principles.md, "The UI Displays Observations;
// It Does Not Turn Them Into A Verdict (0.8.57)," extended here exactly
// as application/BitcoinAnchorBroadcastState.js's own header already
// extends it for a different external boundary.
export const IpfsRemotePublicationState = Object.freeze({
    IDLE: 'idle',
    PUBLISHING: 'publishing',
    PUBLISHED: 'published',
    REJECTED: 'rejected',
    UNAVAILABLE: 'unavailable',
    FAILED: 'failed'
});

export function isValidIpfsRemotePublicationState(value) {
    return Object.values(IpfsRemotePublicationState).includes(value);
}
