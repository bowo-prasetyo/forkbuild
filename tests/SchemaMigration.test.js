import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Group } from '../core/Group.js';
import { DOCUMENT_SCHEMA_VERSION } from '../core/documentSchema.js';
import { PROTOCOL_VERSION } from '../core/protocolVersion.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { DocumentSchemaMigrator } from '../serializer/DocumentSchemaMigrator.js';
import {
    PRE_GROUPS_DOCUMENT,
    GROUPS_DOCUMENT,
    CURRENT_DOCUMENT,
    MALFORMED_NO_WORLD,
    MALFORMED_NO_METADATA,
    MALFORMED_BAD_BRICK,
    MALFORMED_BAD_SCHEMA_VERSION,
    MALFORMED_WRONG_PROTOCOL
} from './fixtures/historicalDocuments.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessage, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        assert(e.message.includes(expectedMessage), `${message}: ${e.message}`);
    }
}

// ---------------------------------------------------------------------
// 1. DocumentValidator: valid documents pass
// ---------------------------------------------------------------------
{
    const result = DocumentValidator.validate(CURRENT_DOCUMENT);
    assert(result.valid === true, 'current document passes validation');
    assert(result.errors.length === 0, 'no errors');

    const preGroupsResult = DocumentValidator.validate(PRE_GROUPS_DOCUMENT);
    assert(preGroupsResult.valid === true, 'pre-groups document passes validation');
    assert(preGroupsResult.warnings.some(w => w.includes('schemaVersion')),
        'pre-groups document warns about missing schemaVersion');

    const groupsResult = DocumentValidator.validate(GROUPS_DOCUMENT);
    assert(groupsResult.valid === true, 'groups document passes validation');

    console.log('✓ DocumentValidator accepts valid documents');
}

// ---------------------------------------------------------------------
// 2. DocumentValidator: malformed documents fail cleanly
// ---------------------------------------------------------------------
{
    assert(DocumentValidator.validate(null).valid === false, 'null rejected');
    assert(DocumentValidator.validate(42).valid === false, 'number rejected');
    assert(DocumentValidator.validate([]).valid === false, 'array rejected');
    assert(DocumentValidator.validate({}).valid === false, 'empty object rejected');

    const noWorld = DocumentValidator.validate(MALFORMED_NO_WORLD);
    assert(noWorld.valid === false, 'missing world rejected');
    assert(noWorld.errors.some(e => e.includes('world')), 'error mentions world');

    const noMetadata = DocumentValidator.validate(MALFORMED_NO_METADATA);
    assert(noMetadata.valid === false, 'missing metadata rejected');

    const badBrick = DocumentValidator.validate(MALFORMED_BAD_BRICK);
    assert(badBrick.valid === false, 'brick with non-numeric position rejected');

    const badSchema = DocumentValidator.validate(MALFORMED_BAD_SCHEMA_VERSION);
    assert(badSchema.valid === false, 'future schema version rejected');
    assert(badSchema.errors.some(e => e.includes('newer than supported')),
        'error explains the version mismatch');

    const wrongProtocol = DocumentValidator.validate(MALFORMED_WRONG_PROTOCOL);
    assert(wrongProtocol.valid === false, 'wrong protocol version rejected');

    console.log('✓ DocumentValidator rejects malformed documents');
}

// ---------------------------------------------------------------------
// 3. DocumentSchemaMigrator: pre-0.2.0 → current
// ---------------------------------------------------------------------
{
    // Pre-groups document (no schemaVersion, no groups).
    const migratedPreGroups = DocumentSchemaMigrator.migrate(PRE_GROUPS_DOCUMENT);
    assert(migratedPreGroups.schemaVersion === DOCUMENT_SCHEMA_VERSION,
        'pre-groups document gets schemaVersion');
    assert(migratedPreGroups.world !== undefined, 'world preserved');
    assert(migratedPreGroups.metadata !== undefined, 'metadata preserved');
    assert(migratedPreGroups.world.buildings.length === 1, 'buildings preserved');
    assert(migratedPreGroups.world.buildings[0].bricks.length === 2, 'bricks preserved');

    // Groups document (no schemaVersion, has groups).
    const migratedGroups = DocumentSchemaMigrator.migrate(GROUPS_DOCUMENT);
    assert(migratedGroups.schemaVersion === DOCUMENT_SCHEMA_VERSION,
        'groups document gets schemaVersion');
    assert(migratedGroups.world.groups.length === 1, 'groups preserved');
    assert(migratedGroups.world.groups[0].name === 'Walls', 'group name preserved');

    // Current document (already has schemaVersion).
    const migratedCurrent = DocumentSchemaMigrator.migrate(CURRENT_DOCUMENT);
    assert(migratedCurrent.schemaVersion === DOCUMENT_SCHEMA_VERSION,
        'current document stays at current version');
    assert(JSON.stringify(migratedCurrent) === JSON.stringify(CURRENT_DOCUMENT),
        'current document is unchanged by migration');

    console.log('✓ DocumentSchemaMigrator: pre-0.2.0 → current');
}

// ---------------------------------------------------------------------
// 4. Full pipeline: old fixture → migrate → validate → domain
// ---------------------------------------------------------------------
{
    const serializer = new DocumentSerializer();

    // Pre-groups document.
    const preGroupsDoc = serializer.deserialize(PRE_GROUPS_DOCUMENT);
    assert(preGroupsDoc.world.id === 'fixture-pre-groups-world', 'pre-groups world id');
    assert(preGroupsDoc.world.getBuildings().length === 1, 'pre-groups building count');
    assert(preGroupsDoc.world.getBuildings()[0].getBricks().length === 2, 'pre-groups brick count');
    assert(preGroupsDoc.world.getGroups().length === 0, 'pre-groups has no groups');
    assert(preGroupsDoc.metadata.title === 'Pre-Groups Fixture', 'pre-groups title');
    assert(preGroupsDoc.metadata.author === 'alice', 'pre-groups author');

    // Groups document.
    const groupsDoc = serializer.deserialize(GROUPS_DOCUMENT);
    assert(groupsDoc.world.id === 'fixture-groups-world', 'groups world id');
    assert(groupsDoc.world.getGroups().length === 1, 'groups count');
    assert(groupsDoc.world.getGroups()[0].name === 'Walls', 'group name');
    assert(groupsDoc.world.getGroups()[0].memberCount === 2, 'group member count');

    // Current document.
    const currentDoc = serializer.deserialize(CURRENT_DOCUMENT);
    assert(currentDoc.world.id === 'fixture-current-world', 'current world id');
    assert(currentDoc.metadata.title === 'Current Fixture', 'current title');

    console.log('✓ full pipeline: old fixture → migrate → validate → domain');
}

// ---------------------------------------------------------------------
// 5. Canonical serialization: byte-identical round-trip
// ---------------------------------------------------------------------
{
    const serializer = new DocumentSerializer();

    // Build a document programmatically.
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({
        definitionId: 'core:cube',
        position: new Position(0, 0.5, 0)
    }));
    building.addBrick(new Brick({
        definitionId: 'core:plate_2x4',
        position: new Position(2, 0.125, 0),
        rotation: 90
    }));
    world.addBuilding(building);
    world.addGroup(new Group({ name: 'TestGroup', brickIds: [] }));
    const doc = new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Canonical Test', author: 'tester' })
    });

    const serialized1 = JSON.stringify(serializer.serialize(doc));
    const restored = serializer.deserialize(JSON.parse(serialized1));
    const serialized2 = JSON.stringify(serializer.serialize(restored));
    assert(serialized1 === serialized2, 'canonical serialization is byte-identical');

    console.log('✓ canonical serialization round-trip');
}

// ---------------------------------------------------------------------
// 6. Historical fixture round-trip: deserialize → serialize → deserialize
// ---------------------------------------------------------------------
{
    const serializer = new DocumentSerializer();

    // Pre-groups fixture.
    const preGroupsDoc = serializer.deserialize(PRE_GROUPS_DOCUMENT);
    const preGroupsReserialized = serializer.serialize(preGroupsDoc);
    assert(preGroupsReserialized.schemaVersion === DOCUMENT_SCHEMA_VERSION,
        'reserialized pre-groups has schemaVersion');
    const preGroupsRedeserialized = serializer.deserialize(preGroupsReserialized);
    assert(preGroupsRedeserialized.world.id === 'fixture-pre-groups-world',
        'pre-groups round-trip preserves world id');

    // Groups fixture.
    const groupsDoc = serializer.deserialize(GROUPS_DOCUMENT);
    const groupsReserialized = serializer.serialize(groupsDoc);
    assert(groupsReserialized.schemaVersion === DOCUMENT_SCHEMA_VERSION,
        'reserialized groups has schemaVersion');
    const groupsRedeserialized = serializer.deserialize(groupsReserialized);
    assert(groupsRedeserialized.world.getGroups().length === 1,
        'groups round-trip preserves groups');

    console.log('✓ historical fixture round-trip');
}

// ---------------------------------------------------------------------
// 7. Malformed documents rejected at the serializer level
// ---------------------------------------------------------------------
{
    const serializer = new DocumentSerializer();

    assertThrows(
        () => serializer.deserialize(MALFORMED_NO_WORLD),
        'world',
        'missing world rejected at serializer'
    );

    assertThrows(
        () => serializer.deserialize(MALFORMED_NO_METADATA),
        'metadata',
        'missing metadata rejected at serializer'
    );

    assertThrows(
        () => serializer.deserialize(MALFORMED_BAD_BRICK),
        'position',
        'bad brick position rejected at serializer'
    );

    assertThrows(
        () => serializer.deserialize(MALFORMED_BAD_SCHEMA_VERSION),
        'newer than supported',
        'future schema rejected at serializer'
    );

    assertThrows(
        () => serializer.deserialize(MALFORMED_WRONG_PROTOCOL),
        'protocol version',
        'wrong protocol rejected at serializer'
    );

    console.log('✓ malformed documents rejected at serializer level');
}

// ---------------------------------------------------------------------
// 8. Migration is idempotent
// ---------------------------------------------------------------------
{
    const migrated1 = DocumentSchemaMigrator.migrate(PRE_GROUPS_DOCUMENT);
    const migrated2 = DocumentSchemaMigrator.migrate(migrated1);
    assert(JSON.stringify(migrated1) === JSON.stringify(migrated2),
        'migrating an already-migrated document is a no-op');

    console.log('✓ migration is idempotent');
}

// ---------------------------------------------------------------------
// 9. Migration never mutates the input
// ---------------------------------------------------------------------
{
    const originalJson = JSON.stringify(PRE_GROUPS_DOCUMENT);
    DocumentSchemaMigrator.migrate(PRE_GROUPS_DOCUMENT);
    assert(JSON.stringify(PRE_GROUPS_DOCUMENT) === originalJson,
        'migration does not mutate the input');

    console.log('✓ migration never mutates the input');
}

// ---------------------------------------------------------------------
// 10. World.fromJSON handles missing groups field (backward compat)
// ---------------------------------------------------------------------
{
    const worldJson = {
        id: 'test-world',
        metadata: {},
        buildings: []
        // No groups field.
    };
    const world = World.fromJSON(worldJson);
    assert(world.getGroups().length === 0, 'missing groups field defaults to empty');

    console.log('✓ World.fromJSON handles missing groups field');
}

// ---------------------------------------------------------------------
// 11. Document.toJSON always includes schemaVersion
// ---------------------------------------------------------------------
{
    const world = new World();
    world.addBuilding(new Building({ creator: 'tester' }));
    const doc = new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Schema Test' })
    });
    const json = doc.toJSON();
    assert(json.schemaVersion === DOCUMENT_SCHEMA_VERSION, 'toJSON includes schemaVersion');
    assert(json.schemaVersion === 1, 'schemaVersion is 1');

    console.log('✓ Document.toJSON always includes schemaVersion');
}

// ---------------------------------------------------------------------
// 12. Flagship: old fixture → migrate → validate → domain → serialize
//     → byte-identical → deserialize → identical domain
// ---------------------------------------------------------------------
{
    const serializer = new DocumentSerializer();

    // Start with the groups fixture (no schemaVersion).
    const doc = serializer.deserialize(GROUPS_DOCUMENT);

    // Serialize it (now has schemaVersion).
    const serialized = serializer.serialize(doc);
    assert(serialized.schemaVersion === DOCUMENT_SCHEMA_VERSION,
        'flagship: serialized has schemaVersion');

    // Deserialize the serialized form.
    const doc2 = serializer.deserialize(serialized);

    // Serialize again.
    const serialized2 = serializer.serialize(doc2);

    // Byte-identical.
    assert(JSON.stringify(serialized) === JSON.stringify(serialized2),
        'flagship: serialize → deserialize → serialize is byte-identical');

    // Domain objects are equivalent.
    assert(doc2.world.id === doc.world.id, 'flagship: world id preserved');
    assert(doc2.world.getGroups().length === doc.world.getGroups().length,
        'flagship: groups preserved');
    assert(doc2.metadata.title === doc.metadata.title, 'flagship: title preserved');

    console.log('✓ flagship: old fixture → migrate → validate → domain → byte-identical round-trip');
}

console.log('\nAll schema migration tests passed.');
