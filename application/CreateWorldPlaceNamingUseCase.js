import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPlaceNamingClaimStore } from './LocalPlaceNamingClaimStore.js';
import { LocalNamePreferenceStore } from './LocalNamePreferenceStore.js';
import { LocalPlaceNamingPublicationLog } from './LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimUseCase } from './PlaceNamingClaimUseCase.js';
import { PlaceNamingClaimExchange } from './PlaceNamingClaimExchange.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.5.2 — Place Naming & Naming Claims.
//
// Wires the concrete local naming-claim backend and returns it, so ui/
// never imports application/LocalPlaceNamingClaimStore.js or
// identity/LocalAuthorizationVerifier.js directly — the exact same
// composition-root shape application/CreatePublisherUseCase.js already
// established for Publications.
//
// 0.5.3 — Decentralized Place Name Exchange. This is exactly the "one
// file" 0.5.2's own header predicted would need to change: the same
// `claimStore`/`verifier` this method already builds are now also handed
// to a new `PlaceNamingClaimExchange`, alongside a new
// `LocalPlaceNamingPublicationLog` for the receivedAt bookkeeping that
// class's own header describes. Nothing about `placeNamingClaimUseCase`/
// `localNamePreferenceStore` changes at all.
export class CreateWorldPlaceNamingUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const claimStore = new LocalPlaceNamingClaimStore(storageProvider);
        const preferenceStore = new LocalNamePreferenceStore(storageProvider, identityProvider);
        const publicationLog = new LocalPlaceNamingPublicationLog(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const placeNamingClaimUseCase = new PlaceNamingClaimUseCase(claimStore, identityProvider, verifier);
        const placeNamingClaimExchange = new PlaceNamingClaimExchange(claimStore, verifier, publicationLog);

        return { placeNamingClaimUseCase, localNamePreferenceStore: preferenceStore, placeNamingClaimExchange };
    }
}
