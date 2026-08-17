// 0.2.37 — the pure decision at the heart of "pull-based
// synchronization": given whatever advertisement a replica currently
// has stored for an avatarId (or nothing yet) and a newly-received
// one, should the new one REPLACE what's stored? Monotonic-sequence
// acceptance only — the same rule AvatarPresence.sequence was built
// for (see core/AvatarPresence.js's own header). Deliberately
// tolerant of exactly the disorder a real, untrusted network
// produces: out-of-order delivery, duplicates, and gaps are all
// handled correctly by this one rule, with no special-casing:
//
//   sequence 50  -> accepted (nothing stored yet)
//   sequence 52  -> accepted (52 > 50)
//   sequence 51  -> rejected (51 <= 52 already stored — stale/reordered)
//   sequence 52  -> rejected (duplicate)
//   sequence 53  -> (never arrives — no special handling needed; the
//                    next one that DOES arrive is judged the same way)
//
// This is transport/lifecycle tolerance, not trust — see
// docs/Principles.md, "0.2.37 Establishes Transport Semantics; 0.2.38
// Establishes Trust Semantics." Nothing here asks "is this replica
// ALLOWED to claim this avatarId" or "is this movement even
// plausible" — a higher sequence number from ANYONE currently wins.
// That is exactly the gap 0.2.38 exists to close.
export function resolveIncomingPresence(currentAdvertisement, incomingAdvertisement) {
    if (!incomingAdvertisement || !Number.isFinite(incomingAdvertisement.sequence)) {
        return { accepted: false, reason: 'invalid' };
    }
    if (!currentAdvertisement) {
        return { accepted: true, reason: 'first-seen' };
    }
    if (incomingAdvertisement.sequence > currentAdvertisement.sequence) {
        return { accepted: true, reason: 'newer-sequence' };
    }
    return { accepted: false, reason: 'stale-or-duplicate' };
}
