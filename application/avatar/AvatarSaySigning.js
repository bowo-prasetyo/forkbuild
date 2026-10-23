import { getAvatarSaySigningDescriptor } from '../../core/avatar/AvatarSay.js';

// The one place a line said aloud gains its signature before it reaches a
// transport, as application/avatar/AvatarInteractionSigning.js does for a
// gesture: a new plain object, and the advertisement unchanged when nobody
// able to sign is signed in.
export function signAvatarSayAdvertisement(advertisement, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return advertisement;
    }
    try {
        const signature = identityProvider.signCanonical(getAvatarSaySigningDescriptor(advertisement));
        return { ...advertisement, signature: signature.toJSON() };
    } catch {
        return advertisement;
    }
}
