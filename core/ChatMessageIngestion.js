// 0.2.61 — mirrors core/AvatarInteractionIngestion.js's own
// resolveIncomingInteraction exactly, one layer over: is INCOMING's
// sequence newer than the highest one already accepted from this
// (conversationId, senderIdentity) key?
//
// Deliberately compares against a bare highwater NUMBER
// (core/ChatReplayWindow.js's own bookkeeping), never a reconstructed
// "expected next sequence" — see this file's own callers' header
// (application/ChatUseCase.js) on why chat deliberately does NOT
// assume sequence numbers form one contiguous stream: a gap is simply
// never filled in, only ever tolerated. What IS enforced: a message
// whose sequence is not strictly greater than the highest one already
// accepted from this sender is rejected as stale — the exact property
// that stops a captured, genuinely-signed OLD message from being
// replayed after a newer one from the same sender has already landed.
export function resolveIncomingChatMessage(highestAcceptedSequence, incomingMessage) {
    if (!incomingMessage || !Number.isFinite(incomingMessage.sequence)) {
        return { accepted: false, reason: 'invalid' };
    }
    if (!Number.isFinite(highestAcceptedSequence)) {
        return { accepted: true, reason: 'first-seen' };
    }
    if (incomingMessage.sequence > highestAcceptedSequence) {
        return { accepted: true, reason: 'newer-sequence' };
    }
    return { accepted: false, reason: 'stale-or-duplicate' };
}
