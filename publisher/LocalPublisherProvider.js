import { PublisherProvider } from './PublisherProvider.js';
import { Publication } from './Publication.js';
import { createId } from '../core/createId.js';

const PUBLICATIONS_KEY = 'forkbuild-publications';

// The V0.1 concrete publisher: no blockchain, but exercises the exact
// same interface a future SteemPublisherProvider will use.
// Stores a Publication record (plus an optional local attestation) via
// an injected StorageProvider, so the publish flow is real and testable
// even before a blockchain backend exists.
export class LocalPublisherProvider extends PublisherProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    publish(document, identityProvider) {
        const user = identityProvider ? identityProvider.currentUser() : null;
        const payload = document.toJSON();

        // Attestation: proves the provider invoked identityProvider.sign()
        // as part of the publish flow. For LocalIdentityProvider this is
        // { signedBy, providerId, data }; for a future wallet provider it
        // would be a cryptographic signature. The publisher doesn't care
        // which — it just passes the payload through.
        const signature = (identityProvider && user)
            ? identityProvider.sign(payload)
            : null;

        const publication = new Publication({
            id: createId(),
            documentId: document.world.id,
            title: document.metadata.title,
            author: user ? user.username : null,
            providerId: 'local',
            publishedAt: new Date(),
            url: null,
            parentDocumentId: document.metadata.parentDocumentId
        });

        // Persist so a future Discovery layer can list publications.
        const record = { ...publication.toJSON(), signature };
        const existing = this._storageProvider.load(PUBLICATIONS_KEY) || [];
        existing.push(record);
        this._storageProvider.save(PUBLICATIONS_KEY, existing);

        return publication;
    }
}
