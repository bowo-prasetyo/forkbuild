import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPublicationAnchorCatalog } from './LocalPublicationAnchorCatalog.js';
import { AddPublicationAnchorUseCase } from './AddPublicationAnchorUseCase.js';

// 0.8.2 — Anchor Catalog & Evidence Discovery.
//
// Wires the concrete local catalog storage and returns an
// AddPublicationAnchorUseCase over it, so ui/ never imports application/
// LocalPublicationAnchorCatalog.js directly — the same composition-root
// shape application/CreatePublicationCatalogUseCase.js already
// established for application/LocalPublicationCatalog.js in 0.7.2. A
// caller that also wants to independently verify a cataloged anchor
// still composes this use case's own `catalog` alongside a separately
// constructed application/ExternalAnchorVerifier.js (via application/
// CreateExternalAnchorVerifierUseCase.js) — this class deliberately
// wires cataloging only, never verification, mirroring the restraint
// application/LocalPublicationAnchorCatalog.js's own header draws
// between the two.
export class CreatePublicationAnchorCatalogUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const catalog = new LocalPublicationAnchorCatalog(storageProvider);
        const addAnchor = new AddPublicationAnchorUseCase(catalog);

        return { catalog, addAnchor };
    }
}
