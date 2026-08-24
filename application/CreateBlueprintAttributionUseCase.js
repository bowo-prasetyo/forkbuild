import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalBlueprintAttributionStore } from './LocalBlueprintAttributionStore.js';
import { LocalBlueprintAttributionPublicationLog } from './LocalBlueprintAttributionPublicationLog.js';
import { BlueprintAttributionUseCase } from './BlueprintAttributionUseCase.js';
import { BlueprintAttributionExchange } from './BlueprintAttributionExchange.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.6.5 — Blueprint Identity & Attribution.
//
// Wires the concrete local attribution backend and returns it, so ui/
// never imports application/LocalBlueprintAttributionStore.js or
// identity/LocalAuthorizationVerifier.js directly — the exact same
// composition-root shape application/CreateWorldPlaceNamingUseCase.js
// already established for PlaceNamingClaims.
//
// 0.6.6 — Decentralized Blueprint Exchange. This is exactly the "one
// file" 0.6.5's own header predicted would need to change: the same
// `attributionStore`/`verifier` this method already builds are now also
// handed to a new `BlueprintAttributionExchange`, alongside a new
// `LocalBlueprintAttributionPublicationLog` for the receivedAt
// bookkeeping that class's own header describes — the identical shape
// application/CreateWorldPlaceNamingUseCase.js's own 0.5.3 update already
// took one domain over. Nothing about `blueprintAttributionUseCase`
// changes at all.
//
// 0.6.7 — Blueprint Attribution Resolution & Community Identity. The
// SAME `publicationLog` instance built here now also goes to
// `blueprintAttributionUseCase`, so its new `communityView()` method can
// attach the `receivedAt` this log already tracks — never a second,
// independent log instance, since both read/write through the same
// `storageProvider` key anyway.
export class CreateBlueprintAttributionUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const attributionStore = new LocalBlueprintAttributionStore(storageProvider);
        const publicationLog = new LocalBlueprintAttributionPublicationLog(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const blueprintAttributionUseCase = new BlueprintAttributionUseCase(attributionStore, identityProvider, verifier, publicationLog);
        const blueprintAttributionExchange = new BlueprintAttributionExchange(attributionStore, verifier, publicationLog);

        return { blueprintAttributionUseCase, blueprintAttributionExchange };
    }
}
