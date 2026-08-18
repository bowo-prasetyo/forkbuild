// 0.2.45 — mirrors core/PresenceIngestion.js's resolveIncomingPresence
// exactly, one layer over: is INCOMING's sequence newer than the
// highest one THIS avatarId has ever had accepted?
//
// Deliberately compares against a bare highwater NUMBER
// (core/AvatarInteractionReplayWindow.js's own bookkeeping), never a
// full "currently stored claim" the way resolveIncomingPresence/
// resolveIncomingProfile do — an interaction EVENT has no "current"
// slot to hold: it is rendered once and discarded (see
// application/AvatarInteractionSyncService.js's own header). Monotonic
// acceptance alone is still worth enforcing even so — it is what
// stops a captured, genuinely-signed OLD event from being replayed
// with a fresh (but still old-sequence) claim after a newer one from
// the same avatarId has already been accepted.
export function resolveIncomingInteraction(highestAcceptedSequence, incomingAdvertisement) {
    if (!incomingAdvertisement || !Number.isFinite(incomingAdvertisement.sequence)) {
        return { accepted: false, reason: 'invalid' };
    }
    if (!Number.isFinite(highestAcceptedSequence)) {
        return { accepted: true, reason: 'first-seen' };
    }
    if (incomingAdvertisement.sequence > highestAcceptedSequence) {
        return { accepted: true, reason: 'newer-sequence' };
    }
    return { accepted: false, reason: 'stale-or-duplicate' };
}
