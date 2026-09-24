import { isNonEmptyString } from '../../utils/typeGuards.js';

// Avatar Inventory Transfer — Peer Protocol.
//
// The WIRE shape carried over peer/PeerMessageBus.js under this file's own
// DEFAULT_PROTOCOL, once an avatar has decided to send a carried vehicle or
// animal (core/AvatarInventory.js's own AvatarInventoryEntry) to another
// avatar's inventory. Deliberately the same "smallest possible wrapper"
// discipline application/anchoring/PublicationAnchorPeerProtocol.js already
// established one domain over — a `kind` discriminator plus whatever that
// kind actually needs, nothing more.
//
//   OFFER    — "here is a carried entry I'm sending you"
//   ACCEPT   — "I took it — it's mine now"
//   DECLINE  — "I'm not taking it"
//
// `offerId` is the ONE piece of correlation state this protocol adds, on
// every message — never a sequence number, never causal-ordering, exactly
// the restraint peer/PeerMessage.js's own `messageId` already documents for
// the ENVELOPE layer beneath this one. It exists purely so a later
// ACCEPT/DECLINE can be matched back to the OFFER that started it; see
// application/avatar/AvatarInventoryTransferPeerExchange.js's own header for why
// that matching is this protocol's entire reason for existing (there is no
// server to hold a transfer's state — the two ends of one live connection
// are the only place it lives at all).
//
// Structural validity ONLY, exactly like application/
// PublicationAnchorPeerProtocol.js#isValidPublicationAnchorPeerMessage()'s
// own restraint: says nothing about whether an OFFER's `entry` is a real,
// constructible AvatarInventoryEntry — that is application/
// AvatarInventoryTransferPeerExchange.js's own ingestion-boundary question,
// asked one layer up. This module only ever describes the wrapper.
export const AvatarInventoryTransferPeerMessageKind = Object.freeze({
    OFFER: 'OFFER',
    ACCEPT: 'ACCEPT',
    DECLINE: 'DECLINE'
});

// `entry` is a plain `AvatarInventoryEntry.toJSON()` shape — `{ id, kind,
// type }` — never validated or hydrated here; see this file's own header.
export function toAvatarInventoryTransferOfferMessage(offerId, entry) {
    if (!isNonEmptyString(offerId)) {
        throw new Error('toAvatarInventoryTransferOfferMessage: offerId is required');
    }
    if (!entry || typeof entry !== 'object') {
        throw new Error('toAvatarInventoryTransferOfferMessage: entry is required');
    }
    return { kind: AvatarInventoryTransferPeerMessageKind.OFFER, offerId, entry };
}

// "I took the entry named by this offerId." Carries nothing else — no
// receiver identity, no timestamp — the identical bare-minimum ask
// application/anchoring/PublicationAnchorPeerProtocol.js#toPublicationAnchorRequestMessage()
// already makes for its own REQUEST.
export function toAvatarInventoryTransferAcceptMessage(offerId) {
    if (!isNonEmptyString(offerId)) {
        throw new Error('toAvatarInventoryTransferAcceptMessage: offerId is required');
    }
    return { kind: AvatarInventoryTransferPeerMessageKind.ACCEPT, offerId };
}

// The mirror image of ACCEPT — "I'm not taking the entry named by this
// offerId."
export function toAvatarInventoryTransferDeclineMessage(offerId) {
    if (!isNonEmptyString(offerId)) {
        throw new Error('toAvatarInventoryTransferDeclineMessage: offerId is required');
    }
    return { kind: AvatarInventoryTransferPeerMessageKind.DECLINE, offerId };
}

// Structural validity of the WRAPPER only — never anything about `entry`
// itself beyond "an object exists there." A malformed or hand-crafted
// entry is application/avatar/AvatarInventoryTransferPeerExchange.js's own
// ingestion boundary to reject, via AvatarInventoryEntry.fromJSON() inside
// a try/catch, the identical shape application/PublicationAnchorPeerExchange
// .js already uses for a forged/malformed anchor envelope.
export function isValidAvatarInventoryTransferPeerMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === AvatarInventoryTransferPeerMessageKind.OFFER) {
        return isNonEmptyString(value.offerId) && Boolean(value.entry) && typeof value.entry === 'object';
    }
    if (value.kind === AvatarInventoryTransferPeerMessageKind.ACCEPT
        || value.kind === AvatarInventoryTransferPeerMessageKind.DECLINE) {
        return isNonEmptyString(value.offerId);
    }
    return false;
}
