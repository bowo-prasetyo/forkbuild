import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { RotateBrickCommand } from '../application/commands/RotateBrickCommand.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';
import { CreateGroupCommand } from '../application/commands/CreateGroupCommand.js';
import { DocumentAuthority } from '../collaboration/DocumentAuthority.js';
import { AuthorityCollaborationTransport } from '../collaboration/AuthorityCollaborationTransport.js';
import { CollaborationSession } from '../collaboration/CollaborationSession.js';
import { CreateCollaborationUseCase } from '../application/CreateCollaborationUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CollaborationEnvelope } from '../core/CollaborationEnvelope.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createWorld() {
    const world = new World();
// FIX: Use a deterministic building ID so that independently created
// client worlds can collaborate on the same building without throwing
// "Unknown building" when applying remote commands.
const building = new Building({ id: 'shared-building', creator: 'tester' });
    building.addBrick(new Brick({
        definitionId: 'core:cube',
        position: new Position(0, 0.5, 0)
    }));
    world.addBuilding(building);
    return world;
}

// ---------------------------------------------------------------------
// 1. DocumentAuthority: basic operation processing
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    assert(authority.revision === 0, 'initial revision is 0');

    // Place a brick — should succeed.
    const buildingId = world.getBuildings()[0].id;
    const command = new PlaceBrickCommand({
        worldId: world.id,
        buildingId,
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    });

    const envelope = CollaborationEnvelope.operation({
        documentId: world.id,
        author: 'alice',
        operationId: 'op-1',
        sequenceNumber: 1,
        baseRevision: 0,
        command: command.toJSON()
    });

    const response = authority.receiveOperation(envelope);
    assert(response.type === 'acknowledge', 'non-conflicting operation acknowledged');
    assert(authority.revision === 1, 'revision advanced');
    assert(world.getBuildings()[0].getBricks().length === 2, 'brick placed in authoritative world');

    console.log('✓ DocumentAuthority: basic operation processing');
}

// ---------------------------------------------------------------------
// 2. Position conflict detection
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;

    // Alice places at (5, 0.5, 0).
    authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-1', sequenceNumber: 1, baseRevision: 0,
        command: new PlaceBrickCommand({
            worldId: world.id, buildingId,
            definitionId: 'core:cube',
            position: new Position(5, 0.5, 0)
        }).toJSON()
    }));

    // Carol tries to place at the SAME position — should be rejected.
    const conflictResponse = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'carol',
        operationId: 'op-2', sequenceNumber: 1, baseRevision: 0,
        command: new PlaceBrickCommand({
            worldId: world.id, buildingId,
            definitionId: 'core:cube',
            position: new Position(5, 0.5, 0)
        }).toJSON()
    }));

    assert(conflictResponse.type === 'reject', 'position conflict rejected');
    assert(conflictResponse.payload.reason.includes('occupied'), 'rejection reason mentions occupancy');
    assert(authority.revision === 1, 'revision unchanged after rejection');
    assert(world.getBuildings()[0].getBricks().length === 2, 'no extra brick placed');

    console.log('✓ Position conflict detection');
}

// ---------------------------------------------------------------------
// 3. Brick existence conflict detection
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;
    const brickId = world.getBuildings()[0].getBricks()[0].id;

    // Alice deletes the brick.
    authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-1', sequenceNumber: 1, baseRevision: 0,
        command: new DeleteBrickCommand({
            worldId: world.id, buildingId, brickId
        }).toJSON()
    }));

    assert(authority.revision === 1, 'delete applied');
    assert(world.getBuildings()[0].getBricks().length === 0, 'brick deleted');

    // Bob tries to move the deleted brick — should be rejected.
    const conflictResponse = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'bob',
        operationId: 'op-2', sequenceNumber: 1, baseRevision: 0,
        command: new MoveBrickCommand({
            worldId: world.id, buildingId, brickId,
            delta: { x: 5, y: 0, z: 0 }
        }).toJSON()
    }));

    assert(conflictResponse.type === 'reject', 'move of deleted brick rejected');
    assert(conflictResponse.payload.reason.includes('not found'), 'rejection mentions missing brick');

    console.log('✓ Brick existence conflict detection');
}

// ---------------------------------------------------------------------
// 4. Non-conflicting concurrent operations
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;

    // Alice places at (5, 0.5, 0), Bob places at (10, 0.5, 0),
    // Carol places at (15, 0.5, 0). All different positions — no conflict.
    const r1 = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-1', sequenceNumber: 1, baseRevision: 0,
        command: new PlaceBrickCommand({
            worldId: world.id, buildingId,
            definitionId: 'core:cube',
            position: new Position(5, 0.5, 0)
        }).toJSON()
    }));

    const r2 = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'bob',
        operationId: 'op-2', sequenceNumber: 1, baseRevision: 0,
        command: new PlaceBrickCommand({
            worldId: world.id, buildingId,
            definitionId: 'core:cube',
            position: new Position(10, 0.5, 0)
        }).toJSON()
    }));

    const r3 = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'carol',
        operationId: 'op-3', sequenceNumber: 1, baseRevision: 0,
        command: new PlaceBrickCommand({
            worldId: world.id, buildingId,
            definitionId: 'core:cube',
            position: new Position(15, 0.5, 0)
        }).toJSON()
    }));

    assert(r1.type === 'acknowledge', 'alice acknowledged');
    assert(r2.type === 'acknowledge', 'bob acknowledged');
    assert(r3.type === 'acknowledge', 'carol acknowledged');
    assert(authority.revision === 3, 'three revisions');
    assert(world.getBuildings()[0].getBricks().length === 4, 'four bricks (1 original + 3 placed)');

    console.log('✓ Non-conflicting concurrent operations');
}

// ---------------------------------------------------------------------
// 5. Composite command conflict detection
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;
    const brickId = world.getBuildings()[0].getBricks()[0].id;

    // Delete the brick first.
    authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-1', sequenceNumber: 1, baseRevision: 0,
        command: new DeleteBrickCommand({
            worldId: world.id, buildingId, brickId
        }).toJSON()
    }));

    // Bob tries a composite that includes moving the deleted brick.
    const composite = new CompositeCommand({ description: 'Move and Rotate' });
    composite.add(new MoveBrickCommand({
        worldId: world.id, buildingId, brickId,
        delta: { x: 5, y: 0, z: 0 }
    }));
    composite.add(new RotateBrickCommand({
        worldId: world.id, buildingId, brickId,
        deltaRotation: 90
    }));

    const conflictResponse = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'bob',
        operationId: 'op-2', sequenceNumber: 1, baseRevision: 0,
        command: composite.toJSON()
    }));

    assert(conflictResponse.type === 'reject', 'composite with deleted brick rejected');
    assert(conflictResponse.payload.reason.includes('Composite child conflict'), 'rejection mentions composite');

    console.log('✓ Composite command conflict detection');
}

// ---------------------------------------------------------------------
// 6. Idempotency: duplicate operations are ignored
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;

    const envelope = CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-duplicate', sequenceNumber: 1, baseRevision: 0,
        command: new PlaceBrickCommand({
            worldId: world.id, buildingId,
            definitionId: 'core:cube',
            position: new Position(5, 0.5, 0)
        }).toJSON()
    });

    const r1 = authority.receiveOperation(envelope);
    const r2 = authority.receiveOperation(envelope);

    assert(r1.type === 'acknowledge', 'first operation acknowledged');
    assert(r2.type === 'acknowledge', 'duplicate acknowledged (idempotent)');
    assert(authority.revision === 1, 'revision only advanced once');
    assert(world.getBuildings()[0].getBricks().length === 2, 'only one brick placed');

    console.log('✓ Idempotency: duplicate operations ignored');
}

// ---------------------------------------------------------------------
// 7. AuthorityCollaborationTransport: end-to-end with sessions
// ---------------------------------------------------------------------
{
    const { createSession, authority } = new CreateCollaborationUseCase()
        .executeAuthority('shared-doc', createWorld());

    // Create three clients with their own worlds and histories.
    const worldA = createWorld(); worldA._id = 'shared-doc';
    const worldB = createWorld(); worldB._id = 'shared-doc';
    const worldC = createWorld(); worldC._id = 'shared-doc';

    const historyA = new CommandHistory({ world: worldA });
    const historyB = new CommandHistory({ world: worldB });
    const historyC = new CommandHistory({ world: worldC });

    const sessionA = createSession({ author: 'alice', commandHistory: historyA });
    const sessionB = createSession({ author: 'bob', commandHistory: historyB });
    const sessionC = createSession({ author: 'carol', commandHistory: historyC });

    const remoteOpsB = [];
    const remoteOpsC = [];
    sessionB.onRemoteOperation = (op) => remoteOpsB.push(op);
    sessionC.onRemoteOperation = (op) => remoteOpsC.push(op);

    sessionA.start();
    sessionB.start();
    sessionC.start();

    // Alice places a brick locally.
    const buildingIdA = worldA.getBuildings()[0].id;
    historyA.execute(new PlaceBrickCommand({
        worldId: 'shared-doc', buildingId: buildingIdA,
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    }));

    // Bob and Carol should have received the operation.
    assert(remoteOpsB.length === 1, 'bob received the operation');
    assert(remoteOpsC.length === 1, 'carol received the operation');
    assert(authority.revision === 1, 'authority revision is 1');

    // Bob places a brick at a different position.
    const buildingIdB = worldB.getBuildings()[0].id;
    historyB.execute(new PlaceBrickCommand({
        worldId: 'shared-doc', buildingId: buildingIdB,
        definitionId: 'core:cube',
        position: new Position(10, 0.5, 0)
    }));

    assert(authority.revision === 2, 'authority revision is 2');
    assert(remoteOpsC.length === 2, 'carol received both operations');

    sessionA.stop();
    sessionB.stop();
    sessionC.stop();

    console.log('✓ AuthorityCollaborationTransport: end-to-end with sessions');
}

// ---------------------------------------------------------------------
// 8. FLAGSHIP: 3 clients, concurrent edits, conflict resolution
// ---------------------------------------------------------------------
{
    const { createSession, authority } = new CreateCollaborationUseCase()
        .executeAuthority('flagship-doc', createWorld());

    const worldA = createWorld(); worldA._id = 'flagship-doc';
    const worldB = createWorld(); worldB._id = 'flagship-doc';
    const worldC = createWorld(); worldC._id = 'flagship-doc';

    const historyA = new CommandHistory({ world: worldA });
    const historyB = new CommandHistory({ world: worldB });
    const historyC = new CommandHistory({ world: worldC });

    const sessionA = createSession({ author: 'alice', commandHistory: historyA });
    const sessionB = createSession({ author: 'bob', commandHistory: historyB });
    const sessionC = createSession({ author: 'carol', commandHistory: historyC });

    const acks = { alice: [], bob: [], carol: [] };
    const rejects = { alice: [], bob: [], carol: [] };
    const remoteOps = { alice: [], bob: [], carol: [] };

    sessionA.onAcknowledge = (info) => acks.alice.push(info);
    sessionB.onAcknowledge = (info) => acks.bob.push(info);
    sessionC.onAcknowledge = (info) => acks.carol.push(info);
    sessionA.onReject = (info) => rejects.alice.push(info);
    sessionB.onReject = (info) => rejects.bob.push(info);
    sessionC.onReject = (info) => rejects.carol.push(info);
    sessionA.onRemoteOperation = (op) => remoteOps.alice.push(op);
    sessionB.onRemoteOperation = (op) => remoteOps.bob.push(op);
    sessionC.onRemoteOperation = (op) => remoteOps.carol.push(op);

    sessionA.start();
    sessionB.start();
    sessionC.start();

    const buildingId = worldA.getBuildings()[0].id;

    // 1. Alice places a brick at (5, 0.5, 0) → applied.
    historyA.execute(new PlaceBrickCommand({
        worldId: 'flagship-doc', buildingId,
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    }));
    assert(authority.revision === 1, 'step 1: revision 1');

    // 2. Bob places a brick at (10, 0.5, 0) → applied (no conflict).
    historyB.execute(new PlaceBrickCommand({
        worldId: 'flagship-doc', buildingId,
        definitionId: 'core:cube',
        position: new Position(10, 0.5, 0)
    }));
    assert(authority.revision === 2, 'step 2: revision 2');

    // 3. Carol tries to place at (5, 0.5, 0) → REJECTED (position occupied).
    historyC.execute(new PlaceBrickCommand({
        worldId: 'flagship-doc', buildingId,
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    }));
    assert(rejects.carol.length === 1, 'step 3: carol rejected');
    assert(rejects.carol[0].reason.includes('occupied'), 'step 3: position conflict');

    // 4. Alice places another brick at (15, 0.5, 0) → applied.
    historyA.execute(new PlaceBrickCommand({
        worldId: 'flagship-doc', buildingId,
        definitionId: 'core:cube',
        position: new Position(15, 0.5, 0)
    }));
    assert(authority.revision === 3, 'step 4: revision 3');

    // 5. Bob deletes the brick at (10, 0.5, 0).
    const brickToDelete = worldB.getBuildings()[0].getBricks().find(
        b => b.position.x === 10
    );
    historyB.execute(new DeleteBrickCommand({
        worldId: 'flagship-doc', buildingId,
        brickId: brickToDelete.id
    }));
    assert(authority.revision === 4, 'step 5: revision 4');

    // 6. Carol tries to move the deleted brick → REJECTED.
    historyC.execute(new MoveBrickCommand({
        worldId: 'flagship-doc', buildingId,
        brickId: brickToDelete.id,
        delta: { x: 5, y: 0, z: 0 }
    }));
    assert(rejects.carol.length === 2, 'step 6: carol rejected again');
    assert(rejects.carol[1].reason.includes('not found'), 'step 6: brick not found');

    // 7. Verify broadcast: Bob and Carol received Alice's operations.
    // Alice sent 2 operations (steps 1 and 4). Bob sent 2 (steps 2 and 5).
    // Carol's operations were rejected.
    // Bob should have received: step 1 (alice), step 4 (alice) = 2 remote ops
    // Carol should have received: step 1 (alice), step 2 (bob), step 4 (alice), step 5 (bob) = 4 remote ops
    assert(remoteOps.bob.length === 2, 'step 7: bob received 2 remote ops');
    assert(remoteOps.carol.length === 4, 'step 7: carol received 4 remote ops');

    // 8. Verify acknowledgements.
    assert(acks.alice.length === 2, 'step 8: alice acknowledged twice');
    assert(acks.bob.length === 2, 'step 8: bob acknowledged twice');

    // 9. Verify authoritative world state.
    const authorityBricks = authority.world.getBuildings()[0].getBricks();
    // Original brick + Alice's 2 + Bob's 1 - Bob's delete = 3 bricks
    assert(authorityBricks.length === 3, 'step 9: authoritative world has 3 bricks');

    sessionA.stop();
    sessionB.stop();
    sessionC.stop();

    console.log('✓ FLAGSHIP: 3 clients, concurrent edits, conflict resolution');
}

// ---------------------------------------------------------------------
// 9. Group command conflict detection
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;
    const brickId = world.getBuildings()[0].getBricks()[0].id;

    // Create a group.
    const r1 = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-1', sequenceNumber: 1, baseRevision: 0,
        command: new CreateGroupCommand({
            worldId: world.id,
            brickIds: [brickId],
            name: 'TestGroup'
        }).toJSON()
    }));
    assert(r1.type === 'acknowledge', 'group created');

    const groupId = world.getGroups()[0].id;

    // Delete the group.
    const { DeleteGroupCommand } = await import('../application/commands/DeleteGroupCommand.js');
    authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-2', sequenceNumber: 2, baseRevision: 1,
        command: new DeleteGroupCommand({
            worldId: world.id, groupId
        }).toJSON()
    }));

    // Try to rename the deleted group.
    const { RenameGroupCommand } = await import('../application/commands/RenameGroupCommand.js');
    const conflictResponse = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'bob',
        operationId: 'op-3', sequenceNumber: 1, baseRevision: 1,
        command: new RenameGroupCommand({
            worldId: world.id, groupId, name: 'NewName'
        }).toJSON()
    }));

    assert(conflictResponse.type === 'reject', 'rename of deleted group rejected');
    assert(conflictResponse.payload.reason.includes('not found'), 'rejection mentions missing group');

    console.log('✓ Group command conflict detection');
}

// ---------------------------------------------------------------------
// 10. TransformSelectionCommand conflict detection
// ---------------------------------------------------------------------
{
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const world = createWorld();
    const authority = new DocumentAuthority({
        documentId: world.id,
        world,
        commandRegistry
    });

    const buildingId = world.getBuildings()[0].id;
    const brickId = world.getBuildings()[0].getBricks()[0].id;

    // Delete the brick.
    authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-1', sequenceNumber: 1, baseRevision: 0,
        command: new DeleteBrickCommand({
            worldId: world.id, buildingId, brickId
        }).toJSON()
    }));

    // Try to transform the deleted brick.
    const { TransformSelectionCommand } = await import('../application/commands/TransformSelectionCommand.js');
    const conflictResponse = authority.receiveOperation(CollaborationEnvelope.operation({
        documentId: world.id, author: 'bob',
        operationId: 'op-2', sequenceNumber: 1, baseRevision: 0,
        command: new TransformSelectionCommand({
            worldId: world.id,
            transforms: [{
                buildingId, brickId,
                position: { x: 10, y: 0, z: 0 },
                rotation: 0
            }]
        }).toJSON()
    }));

    assert(conflictResponse.type === 'reject', 'transform of deleted brick rejected');

    console.log('✓ TransformSelectionCommand conflict detection');
}

console.log('\nAll multi-client synchronization tests passed.');
