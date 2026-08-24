import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationResolver } from './PublicationResolver.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
//
// Wires the concrete local content-addressed backend and returns a
// PublicationResolver, so ui/ never imports content/LocalContentStore.js
// or identity/LocalAuthorizationVerifier.js directly — the same
// composition-root shape application/CreatePublisherUseCase.js and
// application/CreateBlueprintAttributionUseCase.js already established.
// Swapping content/LocalContentStore.js for an IPFS- or Arweave-backed
// ContentStore later (content/ContentStore.js's own header already names
// them) means changing exactly this one file — application/
// PublicationResolver.js, every kindPlugin, and every caller stay
// untouched, because none of them ever import a concrete ContentStore
// themselves.
export class CreatePublicationResolverUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const publicationResolver = new PublicationResolver(contentStore, verifier);

        return { publicationResolver, contentStore, verifier };
    }
}
