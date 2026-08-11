import { PublisherProvider } from './PublisherProvider.js';
import { Publication } from './Publication.js';
import { createId } from '../core/createId.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';
const PUBLICATIONS_KEY = 'forkbuild-publications';
const SNAPSHOT_KEY_PREFIX = 'snapshot:';
// The V0.1 concrete publisher, updated for 0.2.0.
//
// Key change: published snapshots are stored at `snapshot:{snapshotId}`,
// NOT at the document's own storage key. This is the mutation-isolation
// guarantee: editing and saving the source document afterwards cannot
// overwrite the published snapshot. The editable document lives at
// `{documentId}`; the published snapshot lives at `snapshot:{snapshotId}`.
//
// Before storing, the document is serialized, migrated to the current
// schema, validated, and hashed. If validation fails, publishing is
// refused — a corrupt document cannot enter the published corpus.
export class LocalPublisherProvider extends PublisherProvider {
    constructor(storageProvider, documentSerializer = new DocumentSerializer()) {
        super();
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
    }
    publish(document, identityProvider) {
        const user = identityProvider ? identityProvider.currentUser() : null;
        // 1. Serialize and migrate to current schema.
        const rawJson = document.toJSON();
        const migratedJson = DocumentSchemaMigrator.migrate(rawJson);
        // 2. Validate before publishing. A corrupt document must not
        //    enter the published corpus.
        const validation = this._documentSerializer.validate(migratedJson);
        if (!validation.valid) {
            throw new Error(
                `LocalPublisherProvider: refusing to publish invalid document — `
                + `${validation.errors.join('; ')}`
            );
        }
        // 3. Compute content hash over the canonical JSON.
        const canonicalString = JSON.stringify(migratedJson);
        const contentHash = computeContentHash(canonicalString);
        // 4. Create the snapshot identity.
        const snapshotId = createId();
        // 5. Store the snapshot immutably at its own key.
        this._storageProvider.save(SNAPSHOT_KEY_PREFIX + snapshotId, migratedJson);
        // 6. Also store at the document key for backward compatibility
        //    with existing World View loading paths.
        this._storageProvider.save(document.world.id, migratedJson);
        // 7. Attestation.
        const signature = (identityProvider && user)
            ? identityProvider.sign(migratedJson)
            : null;
        // 8. Create the publication record.
        const publication = new Publication({
            id: snapshotId,
            documentId: document.world.id,
            title: document.metadata.title,
            author: user ? user.username : null,
            providerId: 'local',
            publishedAt: new Date(),
            url: null,
            parentDocumentId: document.metadata.parentDocumentId,
            snapshotId,
            contentHash,
            schemaVersion: migratedJson.schemaVersion
        });
        // 9. Persist the publication record.
        const record = { ...publication.toJSON(), signature };
        const existing = this._storageProvider.load(PUBLICATIONS_KEY) || [];
        existing.push(record);
        this._storageProvider.save(PUBLICATIONS_KEY, existing);
        return publication;
    }
    // Load a published snapshot by its snapshotId. Independent of the
    // editing session — no DocumentManager, no CommandHistory, no tools.
    loadSnapshot(snapshotId) {
        const json = this._storageProvider.load(SNAPSHOT_KEY_PREFIX + snapshotId);
        if (json === null) {
            throw new Error(
                `LocalPublisherProvider: no snapshot found with id "${snapshotId}"`
            );
        }
        return this._documentSerializer.deserialize(json);
    }
    // Verify the integrity of a stored snapshot against its recorded hash.
    verifySnapshot(snapshotId, expectedHash) {
        const json = this._storageProvider.load(SNAPSHOT_KEY_PREFIX + snapshotId);
        if (json === null) {
            return false;
        }
        const actualHash = computeContentHash(JSON.stringify(json));
        return actualHash === expectedHash;
    }
}
