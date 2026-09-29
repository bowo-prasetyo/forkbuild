import { getAvatarVehicleSigningDescriptor } from '../../core/AvatarVehicleAdvertisement.js';

// Signs what an avatar rides when the identity provider can sign, as
// presence and profiles are; otherwise sends it unsigned rather than not at
// all.
export function signAvatarVehicleAdvertisement(advertisement, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return advertisement;
    }
    try {
        const signature = identityProvider.signCanonical(getAvatarVehicleSigningDescriptor(advertisement));
        return { ...advertisement, signature: signature.toJSON() };
    } catch {
        return advertisement;
    }
}
