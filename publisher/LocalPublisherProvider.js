import { PublisherProvider } from './PublisherProvider.js';
import { Publication } from './Publication.js';
import { createId } from '../core/createId.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';

const PUBLICATIONS_KEY = 'forkbuild-publications';
const SNAPSHOT_KEY_PREFIX = 'snapshot:';

// The V0.1 concrete publisher, updated for 0.2.3.
//
// Publishing stores the snapshot at `snapshot:{publicationId}`, NOT at
// the document's own storage key. This is the mutation-isolation
// guarantee: editing and saving the source document afterwards cannot
// overwrite the published snapshot. The editable document lives at
// `{documentId}`; the published snapshot lives at
// `snapshot:{publicationId}`.
//
// Before storing, the document is serialized, migrated to the current
// schema, validated, and hashed. If validation fails, publishing is
// refused — a corrupt document cannot enter the published corpus.
//
// Unpublishing removes the publication record and its snapshot. The
// editable document at `{documentId}` is never touched.
export class LocalPublisherProvider extends PublisherProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    publish(document, identityProvider) {
	    const license = document.metadata.license; // Already a License instance
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

        // 3. Compute content hash over the canonical JSON.
        const canonicalString = JSON.stringify(migratedJson);
        const contentHash = computeContentHash(canonicalString);

        // 4. Create the publication identity.
        const publicationId = createId();

        // 5. Store the snapshot immutably at its own key.
        this._storageProvider.save(SNAPSHOT_KEY_PREFIX + publicationId, migratedJson);

        // 6. Also store at the document key for backward compatibility
        //    with existing loading paths (LoadPublicationDocumentUseCase).
        this._storageProvider.save(document.world.id, migratedJson);

        // 7. Attestation.
        const signature = (identityProvider && user)
            ? identityProvider.sign(migratedJson)
            : null;

        // 8. Create the publication record.
        const publication = new Publication({
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
		    license // Bound to the publication record
        });

        // 9. Persist the publication record.
        const record = { ...publication.toJSON(), signature };
        const existing = this._storageProvider.load(PUBLICATIONS_KEY) || [];
        existing.push(record);
        this._storageProvider.save(PUBLICATIONS_KEY, existing);

        return publication;
    }

    // Removes a publication and its snapshot. The editable document
    // at {documentId} is NOT touched.
    unpublish(publicationId) {
        const existing = this._storageProvider.load(PUBLICATIONS_KEY) || [];
        const index = existing.findIndex((record) => record.id === publicationId);
        if (index === -1) {
            return false;
        }

        // Remove the publication record.
        existing.splice(index, 1);
        this._storageProvider.save(PUBLICATIONS_KEY, existing);

        // Remove the snapshot.
        this._storageProvider.remove(SNAPSHOT_KEY_PREFIX + publicationId);

        return true;
    }

    // Load a published snapshot by its publicationId.
    loadSnapshot(publicationId) {
        const json = this._storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId);
        if (json === null) {
            throw new Error(
                `LocalPublisherProvider: no snapshot found for publication "${publicationId}"`
            );
        }
        return json;
    }

    // Verify the integrity of a stored snapshot against its recorded hash.
    verifySnapshot(publicationId, expectedHash) {
        const json = this._storageProvider.load(SNAPSHOT_KEY_PREFIX + publicationId);
        if (json === null) {
            return false;
        }
        const actualHash = computeContentHash(JSON.stringify(json));
        return actualHash === expectedHash;
    }
}
