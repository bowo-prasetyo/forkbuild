import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalBlueprintAttributionStore } from './LocalBlueprintAttributionStore.js';
import { BlueprintAttributionUseCase } from './BlueprintAttributionUseCase.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.6.5 — Blueprint Identity & Attribution.
//
// Wires the concrete local attribution backend and returns it, so ui/
// never imports application/LocalBlueprintAttributionStore.js or
// identity/LocalAuthorizationVerifier.js directly — the exact same
// composition-root shape application/CreateWorldPlaceNamingUseCase.js
// already established for PlaceNamingClaims.
export class CreateBlueprintAttributionUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const attributionStore = new LocalBlueprintAttributionStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const blueprintAttributionUseCase = new BlueprintAttributionUseCase(attributionStore, identityProvider, verifier);

        return { blueprintAttributionUseCase };
    }
}
