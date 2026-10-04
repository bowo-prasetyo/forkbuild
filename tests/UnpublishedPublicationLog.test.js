// Unpublishing a Publication that was already distributed: the copy on the
// networks can't be deleted, so the Repository's search of the networks
// would list it again as a new creation. publisher/UnpublishedPublicationLog.js
// remembers what this device unpublished, and the Repository counts those
// ids as known, as ui/main.js composes its isKnown.
import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { UnpublishedPublicationLog, UNPUBLISHED_PUBLICATIONS_KEY } from '../publisher/UnpublishedPublicationLog.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { RepositoryNetworkDiscovery } from '../application/publication/RepositoryNetworkDiscovery.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { backupEntryGroupOf } from '../application/backup/BackupEntryGroups.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const TAG = 'forkbuild-publication';
const AR_URI = `ar://${'a'.repeat(43)}`;

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'A Traditional German House', author: 'alice' }) });
}

// Section A — the log itself.
{
    const storage = new InMemoryStorageProvider();
    const log = new UnpublishedPublicationLog(storage);
    assert(log.list().length === 0 && !log.has('pub-1'), 'A1. an empty log names nothing');
    log.add('pub-1');
    log.add('pub-1');
    log.add('');
    log.add(null);
    assert(JSON.stringify(log.list()) === '["pub-1"]', `A2. an id is kept once, and nothing else is kept — got ${JSON.stringify(log.list())}`);
    assert(new UnpublishedPublicationLog(storage).has('pub-1'), 'A3. it survives a new instance on the same storage');
    assert(!log.has('pub-2') && !log.has(undefined), 'A4. other ids are not named');
    storage.save(UNPUBLISHED_PUBLICATIONS_KEY, ['pub-3', 7, null, '']);
    assert(JSON.stringify(log.list()) === '["pub-3"]', 'A5. malformed stored entries are ignored');
    storage.save(UNPUBLISHED_PUBLICATIONS_KEY, { not: 'a list' });
    assert(log.list().length === 0, 'A6. a stored value that is not a list reads as empty');
    console.log('✓ A. the log keeps each unpublished id once');
}

// Section B — unpublishing records the id; publishing again does not inherit it.
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const log = new UnpublishedPublicationLog(storage);
    const document = createTestDocument();
    const first = publisher.publish(document, null);
    assert(!log.has(first.id), 'B1. publishing records nothing');
    assert(publisher.unpublish('no-such-publication') === false && log.list().length === 0,
        'B2. unpublishing an id this device never published records nothing');
    assert(publisher.unpublish(first.id) === true && log.has(first.id), 'B3. unpublishing records the id');
    const second = publisher.publish(document, null);
    assert(second.id !== first.id && !log.has(second.id), 'B4. publishing again makes a new id the log does not name');
    assert(new LocalDiscoveryProvider(storage).findById(second.id), 'B5. the new Publication is listed');
    console.log('✓ B. unpublish remembers the Publication it removed');
}

// Section C — the Repository's search of the networks no longer brings it back.
{
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
    identity.login('alice');
    const publisher = new LocalPublisherProvider(storage);
    const publication = publisher.publish(createTestDocument(), identity);
    assert(publication.signature, 'C0. the Publication is signed, as a distributed one would be');
    publisher.unpublish(publication.id);

    // The distributed copy: still announced, still validly signed.
    const fetched = [];
    const services = [{
        searchEnvelopes: async (tag) => (tag === TAG
            ? [{ origin: 'dweb:steem:https://api.example', kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, uri: AR_URI }]
            : [])
    }];
    const materialSources = {
        decentralized: {
            load: async (selection, lead) => {
                fetched.push(lead.uri);
                return JSON.parse(JSON.stringify(publication.toJSON()));
            }
        }
    };
    const { verifier } = composeWorldEncounterMaterialVerifier();
    const run = (isKnown) => {
        const admitted = [];
        return new RepositoryNetworkDiscovery({
            services, discoveryTag: TAG, materialSources, verifier, isKnown,
            admit: (found) => admitted.push(found)
        }).run().then((result) => ({ result, admitted }));
    };

    // Without the log, as before: the copy comes back as a new creation.
    const before = await run((id) => Boolean(new LocalDiscoveryProvider(storage).findById(id)));
    assert(before.result.admitted.length === 1 && before.admitted[0].id === publication.id,
        'C1. without the log, the distributed copy is admitted again');

    // As ui/main.js composes isKnown.
    fetched.length = 0;
    const after = await run((id) => Boolean(new LocalDiscoveryProvider(storage).findById(id)
        || new UnpublishedPublicationLog(storage).has(id)));
    assert(after.result.admitted.length === 0 && after.admitted.length === 0, 'C2. with the log, it is not admitted');
    assert(fetched.length === 0, 'C3. its signed record is not even fetched');
    console.log('✓ C. an unpublished Publication is not listed again from the networks');
}

// Section D — the log is backed up and restored with your publications.
{
    assert(backupEntryGroupOf(UNPUBLISHED_PUBLICATIONS_KEY) === 'publications', 'D1. the log is backed up with your publications');
    console.log('✓ D. the log is part of a device backup');
}
