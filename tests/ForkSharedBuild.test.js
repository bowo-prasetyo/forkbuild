// Edit a Copy of someone else's published build (application/document/
// ForkDocumentUseCase.js): a build opened from a shared link, or found in the
// World, is kept by its content hash, not as a document of this device, so
// the copy is made from those bytes, and only when they match the hash its
// Publication signed. Before this, such a copy failed as "material
// unavailable". Also the turning view's read of the same bytes
// (application/publication/sharing/ReadSharedBuild.js).
import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { License, LicenseId } from '../core/License.js';
import { ContentReference } from '../core/ContentReference.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { ForkDocumentUseCase } from '../application/document/ForkDocumentUseCase.js';
import { ForkFailureReason } from '../application/document/ForkFailureReason.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { readSharedBuildBricks } from '../application/publication/sharing/ReadSharedBuild.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageEntryNotLoadedError } from '../storage/StorageEntryNotLoadedError.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Alice publishes a three-brick build on her device.
function publishOnAlicesDevice(licenseId = LicenseId.CC_BY_4_0) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('fork-shared-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (let i = 0; i < 3; i++) building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i * 2, 0.5, 0) }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title: 'Watchtower', author: 'alice', license: new License({ id: licenseId }) }) }), `doc-watchtower-${licenseId}`);
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, bytes: contentStore.getSync(publication.contentReference) };
}

// Bob's device, holding only the build's bytes by hash, as opening a link leaves it.
function bobsDevice(bytes) {
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    if (bytes !== null) contentStore.put(bytes);
    return { storage, contentStore };
}

const bob = { currentUser: () => ({ username: 'bob' }) };

function failureReason(fn) {
    try {
        fn();
    } catch (error) {
        return error.reason ?? error.message;
    }
    return null;
}

// The copy is made from the bytes kept by hash.
{
    const { publication, bytes } = publishOnAlicesDevice();
    const { storage, contentStore } = bobsDevice(bytes);
    assert(storage.load(publication.documentId) === null, 'Bob\'s device has no document of Alice\'s build');
    const before = new ForkDocumentUseCase(storage);
    assert(failureReason(() => before.execute(publication.documentId, bob, publication)) === ForkFailureReason.MATERIAL_UNAVAILABLE,
        'without the content store, as before, the copy can\'t be made');
    const copy = new ForkDocumentUseCase(storage, undefined, undefined, contentStore).execute(publication.documentId, bob, publication);
    assert(copy.metadata.parentDocumentId === publication.documentId, 'the copy records the build it came from');
    assert(copy.world.id !== publication.documentId, 'as a new document of its own');
    assert(copy.metadata.author === 'bob', 'Bob\'s');
    assert(copy.metadata.license.id === LicenseId.CC_BY_4_0 && copy.metadata.license.attribution.title === 'Watchtower'
        && copy.metadata.license.attribution.sourceDocumentId === publication.documentId,
        'carrying the license and the credit to Alice\'s build');
    const bricks = copy.world.getBuildings().flatMap((building) => building.getBricks());
    assert(bricks.length === 3, `with the build's bricks (${bricks.length})`);
    console.log('✓ a copy of a build kept by hash is made from its bytes, with credit');
}

// Only bytes that match the signed hash, only for that Publication's build,
// and never past its license.
{
    const { publication, bytes } = publishOnAlicesDevice();
    const changed = bytes.replace('Watchtower', 'Watchtowe!');
    const { storage, contentStore } = bobsDevice(null);
    // Changed bytes kept under the original hash, as a damaged store might.
    storage.save(`content:${publication.contentReference.hash}`, changed);
    assert(contentStore.has(new ContentReference({ hash: publication.contentReference.hash })), 'the changed bytes are there');
    const fork = new ForkDocumentUseCase(storage, undefined, undefined, contentStore);
    assert(failureReason(() => fork.execute(publication.documentId, bob, publication)) === ForkFailureReason.MATERIAL_UNAVAILABLE,
        'bytes that don\'t match the signed hash are not used');

    const kept = bobsDevice(bytes);
    const keptFork = new ForkDocumentUseCase(kept.storage, undefined, undefined, kept.contentStore);
    assert(failureReason(() => keptFork.execute(publication.documentId, bob, null)) === ForkFailureReason.MATERIAL_UNAVAILABLE,
        'with no Publication named, nothing is read by hash');
    assert(failureReason(() => keptFork.execute('another-document', bob, publication)) === ForkFailureReason.MATERIAL_UNAVAILABLE,
        'nor for a document the Publication isn\'t of');

    const reserved = publishOnAlicesDevice(LicenseId.ALL_RIGHTS_RESERVED);
    const device = bobsDevice(reserved.bytes);
    assert(failureReason(() => new ForkDocumentUseCase(device.storage, undefined, undefined, device.contentStore).execute(reserved.publication.documentId, bob, reserved.publication))
        === ForkFailureReason.LICENSE_DENIED, 'a license that allows no copies still refuses');
    console.log('✓ only matching bytes of that Publication\'s build are copied, as its license allows');
}

// A build still on disk only is waited for.
{
    const { publication, bytes } = publishOnAlicesDevice();
    const { storage, contentStore } = bobsDevice(bytes);
    let waits = 0;
    const onDisk = {
        has: (reference) => contentStore.has(reference),
        getSync(reference) {
            if (waits === 0) {
                waits++;
                throw new StorageEntryNotLoadedError(`content:${reference.hash}`, Promise.resolve(bytes));
            }
            return contentStore.getSync(reference);
        }
    };
    const fork = new ForkDocumentUseCase(storage, undefined, undefined, onDisk);
    let threw = null;
    try {
        fork.execute(publication.documentId, bob, publication);
    } catch (error) {
        threw = error;
    }
    assert(threw && threw.name === 'StorageEntryNotLoadedError' && fork.isWaitingForStorage(threw), 'execute() says the build is still on disk');
    assert(!fork.isWaitingForStorage(new Error('no')) && !fork.isWaitingForStorage(new StorageEntryNotLoadedError('x')), 'and only that, with something to wait for');
    waits = 0;
    const copy = await fork.executeWhenLoaded(publication.documentId, bob, publication);
    assert(waits === 1 && copy.metadata.parentDocumentId === publication.documentId, 'executeWhenLoaded() waits for it, then copies it');
    console.log('✓ a build still on disk is waited for');
}

// The turning view reads the same bytes, the same way.
{
    const { publication, bytes } = publishOnAlicesDevice();
    const { contentStore } = bobsDevice(bytes);
    const bricks = await readSharedBuildBricks({ publication, contentStore });
    assert(Array.isArray(bricks) && bricks.length === 3 && bricks.every((brick) => brick instanceof Brick), 'the build\'s bricks');
    const claimOnly = Publication.fromJSON(publication.toJSON());
    assert((await readSharedBuildBricks({ publication: claimOnly, contentStore }))?.length === 3, 'from a claim read back from JSON too');
    const tampered = bobsDevice(null);
    tampered.storage.save(`content:${publication.contentReference.hash}`, bytes.replace('core:cube', 'core:slab'));
    assert(await readSharedBuildBricks({ publication, contentStore: tampered.contentStore }) === null, 'bytes that don\'t match give nothing');
    assert(await readSharedBuildBricks({ publication, contentStore: bobsDevice(null).contentStore }) === null, 'nor does a build not on this device');
    assert(await readSharedBuildBricks({ publication: null, contentStore }) === null && await readSharedBuildBricks({ publication, contentStore: null }) === null,
        'nor nothing to read');
    console.log('✓ the turning view reads the build\'s bricks only when they match');
}
