import { getLobbyLeaveSigningDescriptor } from '../core/LobbyCard.js';
import { signingIdentityId } from './RendezvousPublicationSigning.js';

// Signs `card` as the signed-in identity. Returns the signed card, or null
// when this device cannot sign for the identity the card names (signed
// out, locked, or someone else's card): a lobby card is never sent
// unsigned.
export function signLobbyCard(card, identityProvider) {
    if (signingIdentityId(identityProvider) !== card.identityId) {
        return null;
    }
    try {
        return card.withSignature(identityProvider.signCanonical(card.getSigningDescriptor()).toJSON());
    } catch {
        return null;
    }
}

// Signs the withdrawal of `card` from its lobby. Returns the signature's
// JSON, or null when this device cannot sign for the card's identity.
export function signLobbyLeave(card, identityProvider) {
    if (signingIdentityId(identityProvider) !== card.identityId) {
        return null;
    }
    try {
        return identityProvider.signCanonical(getLobbyLeaveSigningDescriptor(card)).toJSON();
    } catch {
        return null;
    }
}
