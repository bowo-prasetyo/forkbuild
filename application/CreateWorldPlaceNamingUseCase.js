import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPlaceNamingClaimStore } from './LocalPlaceNamingClaimStore.js';
import { LocalNamePreferenceStore } from './LocalNamePreferenceStore.js';
import { PlaceNamingClaimUseCase } from './PlaceNamingClaimUseCase.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.5.2 — Place Naming & Naming Claims.
//
// Wires the concrete local naming-claim backend and returns it, so ui/
// never imports application/LocalPlaceNamingClaimStore.js or
// identity/LocalAuthorizationVerifier.js directly — the exact same
// composition-root shape application/CreatePublisherUseCase.js already
// established for Publications. Swapping in a real decentralized
// exchange transport later (0.5.3, deliberately not this milestone —
// see docs/Roadmap.md) means changing exactly this one file.
export class CreateWorldPlaceNamingUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const claimStore = new LocalPlaceNamingClaimStore(storageProvider);
        const preferenceStore = new LocalNamePreferenceStore(storageProvider, identityProvider);
        const verifier = new LocalAuthorizationVerifier();
        const placeNamingClaimUseCase = new PlaceNamingClaimUseCase(claimStore, identityProvider, verifier);

        return { placeNamingClaimUseCase, localNamePreferenceStore: preferenceStore };
    }
}
