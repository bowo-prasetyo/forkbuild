import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationCatalog } from './LocalPublicationCatalog.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationExchange } from './PublicationExchange.js';

// 0.7.2 — Decentralized Publication Discovery & Catalog.
//
// Wires the concrete local catalog storage and returns a
// PublicationExchange over it, so ui/ never imports application/
// LocalPublicationCatalog.js or identity/LocalAuthorizationVerifier.js
// directly — the exact composition-root shape application/
// CreatePublicationResolverUseCase.js already established for the
// resolver side of this same milestone pair. A caller that also needs
// to resolve a cataloged entry's content still composes this use case's
// own `catalog` alongside a separately constructed application/
// PublicationResolver.js (via application/
// CreatePublicationResolverUseCase.js or application/
// CreateIpfsPublicationResolverUseCase.js) — this class deliberately
// wires discovery only, never resolution, mirroring the same restraint
// application/LocalPublicationCatalog.js's own header draws between the
// two.
export class CreatePublicationCatalogUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationCatalog(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const exchange = new PublicationExchange(catalog, verifier);

        return { catalog, exchange, verifier };
    }
}
