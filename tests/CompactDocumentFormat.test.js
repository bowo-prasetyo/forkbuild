import { encodeBrickTable, decodeBrickTable, brickTableErrors } from '../core/BrickTable.js';
import { createBrickId, createId } from '../core/createId.js';
import { DOCUMENT_SCHEMA_VERSION } from '../core/documentSchema.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Group } from '../core/Group.js';
import { Position } from '../core/Position.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { AutosaveDocumentUseCase } from '../application/document/AutosaveDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Document schema 2 stores each building's bricks as a table
// (core/BrickTable.js), and new bricks get 12-character ids
// (createBrickId()). Checks the codec, the canonical round trip content
// hashes rely on, migration of schema 0 and 1 documents, validation, the
// size gained, and that autosave and Save read a checkpoint's revision
// without parsing the checkpoint.

function pyramidDocument(base, { ids = null } = {}) {
    const world = new World();
    const building = new Building();
    world.addBuilding(building);
    for (let layer = 0; layer * 2 < base; layer++) {
        const lo = layer;
        const hi = base - 1 - layer;
        for (let x = lo; x <= hi; x++) {
            for (let z = lo; z <= hi; z++) {
                if (x !== lo && x !== hi && z !== lo && z !== hi) continue;
                building.addBrick(new Brick({ id: ids ? ids() : undefined, definitionId: 'core:cube', position: new Position(x, layer + 0.5, z), color: layer % 2 ? 0xd8c08a : null }));
            }
        }
    }
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Pyramid' }) });
}

// The table codec keeps every field of every brick, in order.
{
    const bricks = [
        { id: 'a', definitionId: 'core:cube', position: { x: 1, y: 0.5, z: -2.25 }, rotation: 90, color: null },
        { id: 'b', definitionId: 'core:stair', position: { x: 0, y: 1.5, z: 3 }, rotation: 270, color: 0xff0000 },
        { id: 'c', definitionId: 'core:cube', position: { x: 1e-7, y: 100000, z: 0 }, rotation: 0, color: 0xff0000 },
        { id: 'd', definitionId: 'core:cube', position: { x: 2, y: 0.5, z: 0 }, rotation: 180, color: 0x00ff00 }
    ];
    const table = encodeBrickTable(bricks);
    assert(JSON.stringify(table.definitions) === '["core:cube","core:stair"]' && JSON.stringify(table.colors) === '[16711680,65280]',
        'definitions and colors are palettes in first-use order');
    assert(table.values.length === 24 && table.values[5] === 0 && table.values[11] === 1 && table.values[23] === 2, 'no color is 0; colors index from 1');
    assert(JSON.stringify(decodeBrickTable(table)) === JSON.stringify(bricks), 'decoding gives back exactly the bricks');
    assert(JSON.stringify(encodeBrickTable(decodeBrickTable(table))) === JSON.stringify(table), 're-encoding gives back exactly the table');
    const instances = bricks.map((b) => Brick.fromJSON(b));
    assert(JSON.stringify(encodeBrickTable(instances)) === JSON.stringify(table), 'Brick instances encode like their JSON');
    assert(JSON.stringify(encodeBrickTable([])) === '{"definitions":[],"colors":[],"ids":[],"values":[]}', 'an empty building is an empty table');
    console.log('✓ the brick table round-trips every brick');
}

// Validation of a table catches what decoding would trip on.
{
    const good = encodeBrickTable([{ id: 'a', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 }, rotation: 0, color: 5 }]);
    assert(brickTableErrors(good).length === 0, 'a table from the encoder is valid');
    const broken = [
        [{ ...good, values: good.values.slice(0, 5) }, '6 numbers per id'],
        [{ ...good, values: [3, 0, 0, 0, 0, 0] }, 'index definitions'],
        [{ ...good, values: [0, 0, 'x', 0, 0, 0] }, 'finite number'],
        [{ ...good, values: [0, 0, 0, 0, 0, 2] }, 'index colors'],
        [{ ...good, ids: [''] }, 'ids'],
        [{ ...good, definitions: [7] }, 'definitions'],
        [{ ...good, colors: [null] }, 'colors'],
        [null, 'must be an object']
    ];
    for (const [table, fragment] of broken) {
        const errors = brickTableErrors(table);
        assert(errors.length === 1 && errors[0].includes(fragment), `a broken table is reported: ${fragment}`);
    }
    console.log('✓ broken tables are rejected');
}

// Brick ids: 12 characters from [0-9A-Za-z], distinct.
{
    const ids = new Set();
    for (let i = 0; i < 100000; i++) ids.add(createBrickId());
    assert(ids.size === 100000, '100,000 brick ids are distinct');
    assert([...ids].every((id) => /^[0-9A-Za-z]{12}$/.test(id)), 'each is 12 characters from [0-9A-Za-z]');
    assert(/^[0-9A-Za-z]{12}$/.test(new Brick({ definitionId: 'core:cube' }).id), 'a new Brick gets one by default');
    assert(createId().length === 36, 'other identities keep UUIDs');
    console.log('✓ new bricks get short ids');
}

// A document serializes to schema 2 with brick tables, and the round trip
// is canonical (byte-identical), as content hashes require.
{
    const document = pyramidDocument(21);
    const building = document.world.getBuildings()[0];
    const [first, second] = building.getBricks();
    document.world.addGroup(new Group({ name: 'corner', brickIds: [first.id, second.id] }));
    const serializer = new DocumentSerializer();
    const json = serializer.serialize(document);
    assert(json.schemaVersion === 2 && DOCUMENT_SCHEMA_VERSION === 2, 'documents are schema 2');
    assert(json.world.buildings[0].brickTable && json.world.buildings[0].bricks === undefined, 'buildings carry a brickTable, not a bricks array');
    const text = JSON.stringify(json);
    const reloaded = serializer.deserialize(JSON.parse(text));
    assert(JSON.stringify(serializer.serialize(reloaded)) === text, 'serialize → deserialize → serialize is byte-identical');
    const reloadedBricks = reloaded.world.getBuildings()[0].getBricks();
    assert(reloadedBricks.length === building.getBricks().length
        && reloadedBricks.every((b, i) => b.id === building.getBricks()[i].id && b.position.equals(building.getBricks()[i].position) && b.color === building.getBricks()[i].color),
        'every brick comes back with its id, position and color');
    assert(reloaded.world.getGroups()[0].brickIds.join() === `${first.id},${second.id}`, 'groups still name their bricks');
    assert(DocumentValidator.validate(json).valid, 'the schema 2 envelope is valid');
    assert(!DocumentValidator.validate({ ...json, schemaVersion: 3 }).valid, 'a newer schema is refused, as before');
    const corrupt = JSON.parse(text);
    corrupt.world.buildings[0].brickTable.values.pop();
    let thrown = null;
    try { serializer.deserialize(corrupt); } catch (error) { thrown = error; }
    assert(thrown && /brickTable\.values/.test(thrown.message), 'a corrupt table is refused on load');
    assert(document.world.toJSON().buildings[0].bricks.length === building.getBricks().length, 'World#toJSON() without options still gives brick objects (in-memory uses)');
    console.log('✓ schema 2 documents round-trip canonically');
}

// Schema 1 and schema 0 documents (brick objects, UUID ids) migrate and
// load unchanged.
{
    const legacyDocument = pyramidDocument(11, { ids: createId });
    const v1 = {
        schemaVersion: 1,
        world: legacyDocument.world.toJSON(),
        metadata: legacyDocument.metadata.toJSON()
    };
    const [a, b] = v1.world.buildings[0].bricks;
    v1.world.groups = [{ id: 'g', name: null, brickIds: [a.id, b.id] }];
    const v1Text = JSON.stringify(v1);
    const serializer = new DocumentSerializer();
    for (const [label, json] of [['schema 1', JSON.parse(v1Text)], ['schema 0', (() => { const j = JSON.parse(v1Text); delete j.schemaVersion; return j; })()]]) {
        const loaded = serializer.deserialize(json);
        const bricks = loaded.world.getBuildings()[0].getBricks();
        assert(bricks.length === v1.world.buildings[0].bricks.length && bricks.every((brick, i) => JSON.stringify(brick.toJSON()) === JSON.stringify(v1.world.buildings[0].bricks[i])),
            `a ${label} document loads with every brick unchanged, UUID ids included`);
        assert(loaded.world.getGroups()[0].brickIds.join() === `${a.id},${b.id}`, `...and its groups (${label})`);
    }
    assert(JSON.stringify(JSON.parse(v1Text)) === v1Text, 'migration never mutates its input');
    const migrated = DocumentSchemaMigrator.migrate(JSON.parse(v1Text));
    assert(migrated.schemaVersion === 2 && migrated.world.buildings[0].brickTable.ids[0] === a.id, 'migration writes the brick table');
    assert(DocumentValidator.validate(JSON.parse(v1Text)).valid, 'an unmigrated schema 1 envelope still validates');
    console.log('✓ schema 0 and 1 documents migrate and load');
}

// An existing published snapshot (schema 1 bytes) still verifies and loads.
{
    const storage = new InMemoryStorageProvider();
    const legacy = pyramidDocument(7, { ids: createId });
    const v1 = { schemaVersion: 1, world: legacy.world.toJSON(), metadata: legacy.metadata.toJSON() };
    storage.save('snapshot:old', v1);
    const publisher = new LocalPublisherProvider(storage);
    assert(publisher.verifySnapshot('old', computeContentHash(JSON.stringify(v1))), 'a schema 1 snapshot verifies against the hash it was published with');
    const reloaded = new DocumentSerializer().deserialize(storage.load('snapshot:old'));
    assert(reloaded.world.getBuildings()[0].getBricks().length === v1.world.buildings[0].bricks.length, '...and loads');
    console.log('✓ previously published snapshots stay valid');
}

// Forking gives the copy short ids and keeps its groups pointing at them.
{
    const source = pyramidDocument(7, { ids: createId });
    const [first] = source.world.getBuildings()[0].getBricks();
    source.world.addGroup(new Group({ name: 'g', brickIds: [first.id] }));
    const fork = new DocumentCloneService().execute(source);
    const forkBricks = fork.world.getBuildings()[0].getBricks();
    assert(forkBricks.every((brick) => /^[0-9A-Za-z]{12}$/.test(brick.id)), 'a fork\'s bricks get short ids');
    assert(fork.world.getGroups()[0].brickIds[0] === forkBricks[0].id, '...and its groups follow them');
    console.log('✓ forks get short ids');
}

// The size gained, on the hollow 233-base Great Pyramid.
{
    const fresh = pyramidDocument(233);
    const legacy = pyramidDocument(233, { ids: createId });
    const objectForm = (document) => JSON.stringify({ schemaVersion: 1, world: document.world.toJSON(), metadata: document.metadata.toJSON() }).length;
    const tableForm = (document) => JSON.stringify(document.toJSON()).length;
    const legacyBefore = objectForm(legacy);
    const legacyAfter = tableForm(legacy);
    const freshAfter = tableForm(fresh);
    assert(legacyBefore / legacyAfter > 2.2, `an existing pyramid (UUID ids): ${(legacyBefore / 1e6).toFixed(2)} MB → ${(legacyAfter / 1e6).toFixed(2)} MB`);
    assert(legacyBefore / freshAfter > 4, `a new pyramid (short ids): ${(freshAfter / 1e6).toFixed(2)} MB, ${(legacyBefore / freshAfter).toFixed(1)}× smaller than before`);
    console.log(`✓ hollow pyramid: ${(legacyBefore / 1e6).toFixed(2)} MB before; ${(legacyAfter / 1e6).toFixed(2)} MB with its UUID ids kept; ${(freshAfter / 1e6).toFixed(2)} MB built new`);
}

// Autosave and Save read the checkpoint's revision from a small record,
// never by parsing the whole checkpoint.
{
    const storage = new InMemoryStorageProvider();
    const reads = [];
    const originalLoad = storage.load.bind(storage);
    storage.load = (name) => { reads.push(name); return originalLoad(name); };
    const recoveryStore = new LocalRecoveryStore(storage);
    const autosave = new AutosaveDocumentUseCase(recoveryStore, storage);
    const manager = new DocumentManager(pyramidDocument(21));
    const id = manager.document.world.id;
    manager.markDirty();
    assert(autosave.execute(manager).revision === 1, 'the first checkpoint is revision 1');
    reads.length = 0;
    assert(autosave.execute(manager).revision === 2, 'the next is revision 2');
    assert(!reads.includes(`recovery:${id}`), 'autosave did not read the previous checkpoint');
    assert(recoveryStore.exists(id) && recoveryStore.load(id).revision === 2, 'the checkpoint itself is stored');

    reads.length = 0;
    new SaveDocumentUseCase(storage, undefined, undefined, recoveryStore).execute(manager);
    assert(!reads.includes(`recovery:${id}`), 'Save did not read the checkpoint either');
    assert(!recoveryStore.exists(id) && storage.load(`recovery-info:${id}`) === null, 'Save removes the checkpoint and its record');

    // A checkpoint written before the record existed is still read.
    storage.save(`recovery:${id}`, { documentId: id, revision: 7, document: {} });
    assert(recoveryStore.exists(id) && recoveryStore.loadRevision(id) === 7, 'an older checkpoint without a record still counts');
    console.log('✓ autosave and Save read revisions without parsing checkpoints');
}
