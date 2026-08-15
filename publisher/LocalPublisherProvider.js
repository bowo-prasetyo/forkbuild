import { PublisherProvider } from './PublisherProvider.js';
import { Publication } from './Publication.js';
import { createId } from '../core/createId.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { LocalContentStore } from '../content/LocalContentStore.js';

const PUBLICATIONS_KEY = 'forkbuild-publications';
const SNAPSHOT_KEY_PREFIX = 'snapshot:';

// The V0.1 concrete publisher.
//
// As of 0.2.16, publishing a document also signs the publication when
// the IdentityProvider exposes the cryptographic surface
// (getSigningIdentity / signCanonical): the publisher identity and a
// real Ed25519 Signature become part of the Publication itself.
//
// Providers without the crypto surface (stubs, pre-0.2.16 providers)
// keep the legacy attribution-stamp path — nothing deployed breaks.
export class LocalPublisherProvider extends PublisherProvider {
    constructor(storageProvider, contentStore = null) {
        super();
        this._storageProvider = storageProvider;
        this._contentStore = contentStore || new LocalContentStore(storageProvider);
    }

    publish(document, identityProvider) {
        const user = identityProvider ? identityProvider.currentUser() : null;

        // 1. Serialize and migrate to current schema.
        const rawJson = document.toJSON();
        const migratedJson = DocumentSchemaMigrator.migrate(rawJson);

        // 2. Validate before publishing.
        const validation = DocumentValidator.validate(migratedJson);
        if (!validation.valid) {
            throw new Error(
                `LocalPublisherProvider: refusing to publish invalid document — `
                + `${validation.errors.join('; ')}`
            );
        }

        // 3. Store immutable content.
        const canonicalString = JSON.stringify(migratedJson);
        const contentReference = this._contentStore.put(canonicalString);
        const contentHash = contentReference.hash;

        // 4. Create the publication identity.
        const publicationId = createId();

        // 5. Store the snapshot immutably at its own key, and at the
        //    document key for existing loading paths.
        this._storageProvider.save(SNAPSHOT_KEY_PREFIX + publicationId, migratedJson);
        this._storageProvider.save(document.world.id, migratedJson);

        // 6. 0.2.16 — cryptographic publication signature.
        const canSign = !!(identityProvider && user
            && typeof identityProvider.signCanonical === 'function'
            && typeof identityProvider.getSigningIdentity === 'function');
        const publisherIdentity = canSign
            ? identityProvider.getSigningIdentity().toJSON()
            : null;
        let publication = new Publication({
            id: publicationId,
            documentId: document.world.id,
            title: document.metadata.title,
            author: user ? user.username : null,
            providerId: 'local',
            publishedAt: new Date(),
            url: null,
            parentDocumentId: document.metadata.parentDocumentId,
            contentHash,
            schemaVersion: migratedJson.schemaVersion,
            license: document.metadata.license,
            contentReference,
            publisherIdentity,
            signature: null
        });
        if (canSign) {
            publication = publication.withSignature(
                identityProvider.signCanonical(publication.getSigningDescriptor())
            );
        }

        // 7. Persist the publication record.
        const record = { ...publication.toJSON() };
        if (!canSign) {
            // Legacy attribution stamp for non-cryptographic providers.
            const legacySignature = (identityProvider && user)
                ? identityProvider.sign(migratedJson)
                : null;
            if (legacySignature) {
                record.signature = legacySignature;
            }
        }
        const existing = this._storageProvider.load(PUBLICATIONS_KEY) || [];
        existing.push(record);
        this._storageProvider.save(PUBLICATIONS_KEY, existing);
        return publication;
    }

    unpublish(publicationId) {
        const existing = this._storageProvider.load(PUBLICATIONS_KEY) || [];
        const index = existing.findIndex((record) => record.id === publicationId);
        if (index === -1) {
            return false;
        }
        existing.splice(index, 1);
        this._storageProvider.save(PUBLICATIONS_KEY, existing);
        this._storageProvider.remove(SNAPSHOT_KEY_PREFIX + publicationId);
        return true;
    }

    loadSnapshot(publicationId) {
        const json = this._storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId);
        if (json === null) {
            throw new Error(
                `LocalPublisherProvider: no snapshot found for publication "${publicationId}"`
            );
        }
        return json;
    }

    verifySnapshot(publicationId, expectedHash) {
        const json = this._storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId);
        if (json === null) {
            return false;
        }
        const actualHash = computeContentHash(JSON.stringify(json));
        return actualHash === expectedHash;
    }
}
