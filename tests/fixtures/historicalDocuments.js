// Real historical document fixtures representing documents as they were
// serialized at various points in the project's history. Each fixture
// exercises a different migration path through DocumentSchemaMigrator.
//
// These are not synthetic test data — they represent the actual JSON
// shapes that World.fromJSON(), Document.fromJSON(), and
// DocumentSerializer have produced at each stage of the project.

// Fixture 1: Pre-groups era (0.1.19–0.1.42).
// No schemaVersion field. No groups field in world.
// This is the oldest format the engine must still be able to load.
export const PRE_GROUPS_DOCUMENT = {
    world: {
        id: 'fixture-pre-groups-world',
        metadata: {},
        buildings: [
            {
                id: 'fixture-building-1',
                creator: 'alice',
                library: 'core',
                bricks: [
                    {
                        id: 'fixture-brick-1',
                        definitionId: 'core:cube',
                        position: { x: 0, y: 0.5, z: 0 },
                        rotation: 0
                    },
                    {
                        id: 'fixture-brick-2',
                        definitionId: 'core:plate_2x4',
                        position: { x: 2, y: 0.125, z: 0 },
                        rotation: 90
                    }
                ]
            }
        ]
        // No "groups" field — pre-0.1.43 worlds have none.
    },
    metadata: {
        title: 'Pre-Groups Fixture',
        author: 'alice',
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        protocolVersion: '0.1',
        engineVersion: '0.1.19',
        parentDocumentId: null
    }
    // No "schemaVersion" field — pre-0.2.0 documents have none.
};

// Fixture 2: Groups era (0.1.43–0.1.49).
// No schemaVersion field. Has groups field in world.
export const GROUPS_DOCUMENT = {
    world: {
        id: 'fixture-groups-world',
        metadata: {},
        buildings: [
            {
                id: 'fixture-building-2',
                creator: 'bob',
                library: 'core',
                bricks: [
                    {
                        id: 'fixture-brick-3',
                        definitionId: 'core:cube',
                        position: { x: 0, y: 0.5, z: 0 },
                        rotation: 0
                    },
                    {
                        id: 'fixture-brick-4',
                        definitionId: 'core:cube',
                        position: { x: 2, y: 0.5, z: 0 },
                        rotation: 0
                    },
                    {
                        id: 'fixture-brick-5',
                        definitionId: 'core:cube',
                        position: { x: 4, y: 0.5, z: 0 },
                        rotation: 45
                    }
                ]
            }
        ],
        groups: [
            {
                id: 'fixture-group-1',
                name: 'Walls',
                brickIds: ['fixture-brick-3', 'fixture-brick-4']
            }
        ]
    },
    metadata: {
        title: 'Groups Fixture',
        author: 'bob',
        created: '2025-06-01T00:00:00.000Z',
        modified: '2025-06-01T00:00:00.000Z',
        protocolVersion: '0.1',
        engineVersion: '0.1.43',
        parentDocumentId: null
    }
    // No "schemaVersion" field — pre-0.2.0 documents have none.
};

// Fixture 3: Current era (0.2.x).
// Has schemaVersion: 1. Has groups field in world.
export const CURRENT_DOCUMENT = {
    schemaVersion: 1,
    world: {
        id: 'fixture-current-world',
        metadata: {},
        buildings: [
            {
                id: 'fixture-building-3',
                creator: 'carol',
                library: 'core',
                bricks: [
                    {
                        id: 'fixture-brick-6',
                        definitionId: 'core:cube',
                        position: { x: 0, y: 0.5, z: 0 },
                        rotation: 0
                    }
                ]
            }
        ],
        groups: []
    },
    metadata: {
        title: 'Current Fixture',
        author: 'carol',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
        protocolVersion: '0.1',
        engineVersion: '0.2.0',
        parentDocumentId: null
    }
};

// Fixture 4: Malformed documents for validation testing.
export const MALFORMED_NO_WORLD = {
    schemaVersion: 1,
    metadata: {
        title: 'No World',
        protocolVersion: '0.1',
        engineVersion: '0.2.0'
    }
};

export const MALFORMED_NO_METADATA = {
    schemaVersion: 1,
    world: {
        id: 'some-world',
        buildings: []
    }
};

export const MALFORMED_BAD_BRICK = {
    schemaVersion: 1,
    world: {
        id: 'some-world',
        buildings: [
            {
                id: 'some-building',
                bricks: [
                    {
                        id: 'some-brick',
                        definitionId: 'core:cube',
                        position: { x: 'not-a-number', y: 0, z: 0 }
                    }
                ]
            }
        ]
    },
    metadata: {
        title: 'Bad Brick',
        protocolVersion: '0.1',
        engineVersion: '0.2.0'
    }
};

export const MALFORMED_BAD_SCHEMA_VERSION = {
    schemaVersion: 999,
    world: {
        id: 'some-world',
        buildings: []
    },
    metadata: {
        title: 'Future Schema',
        protocolVersion: '0.1',
        engineVersion: '99.0.0'
    }
};

export const MALFORMED_WRONG_PROTOCOL = {
    schemaVersion: 1,
    world: {
        id: 'some-world',
        buildings: []
    },
    metadata: {
        title: 'Wrong Protocol',
        protocolVersion: '99.0',
        engineVersion: '0.2.0'
    }
};
