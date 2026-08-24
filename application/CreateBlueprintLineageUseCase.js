import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalBlueprintLineageClaimStore } from './LocalBlueprintLineageClaimStore.js';
import { BlueprintLineageUseCase } from './BlueprintLineageUseCase.js';
import { BlueprintLineageExchange } from './BlueprintLineageExchange.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// Wires the concrete local lineage backend and returns it, so ui/ never
// imports application/LocalBlueprintLineageClaimStore.js or identity/
// LocalAuthorizationVerifier.js directly — the exact composition-root
// shape application/CreateBlueprintAttributionUseCase.js already
// established one concept over.
export class CreateBlueprintLineageUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const lineageStore = new LocalBlueprintLineageClaimStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const blueprintLineageUseCase = new BlueprintLineageUseCase(lineageStore, identityProvider, verifier);
        const blueprintLineageExchange = new BlueprintLineageExchange(lineageStore, verifier);

        return { blueprintLineageUseCase, blueprintLineageExchange };
    }
}
