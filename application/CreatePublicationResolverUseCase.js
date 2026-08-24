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
// 0.7.1 proved the claim this file's own header made: application/
// CreateIpfsPublicationResolverUseCase.js wires content/
// IpfsContentStore.js into the identical shape, and application/
// PublicationResolver.js, every kindPlugin, and every caller of either
// use case stay completely untouched — none of them ever import a
// concrete ContentStore themselves.
export class CreatePublicationResolverUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();
        const publicationResolver = new PublicationResolver(contentStore, verifier);

        return { publicationResolver, contentStore, verifier };
    }
}
