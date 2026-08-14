import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CollaborationEnvelope } from '../core/CollaborationEnvelope.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { CollaborationSession } from '../collaboration/CollaborationSession.js';
import { LocalCollaborationTransport } from '../collaboration/LocalCollaborationTransport.js';
import { CreateCollaborationUseCase } from '../application/CreateCollaborationUseCase.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createWorld() {
    const world = new World();
const building = new Building({ id: 'shared-building', creator: 'tester' }); // <-- ADD id
    building.addBrick(new Brick({
        definitionId: 'core:cube',
        position: new Position(0, 0.5, 0)
    }));
    world.addBuilding(building);
    return world;
}

function createCollaborationFixture() {
    const transport = new LocalCollaborationTransport();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    function createParticipant(author) {
        const world = createWorld();
        const history = new CommandHistory({ world });
        const session = new CollaborationSession({
            documentId: world.id,
            author,
            commandHistory: history,
            commandRegistry,
            transport
        });
        return { world, history, session };
    }

    return { transport, commandRegistry, createParticipant };
}

// ---------------------------------------------------------------------
// 1. CollaborationEnvelope serialization round-trip
// ---------------------------------------------------------------------
{
    const envelope = CollaborationEnvelope.operation({
        documentId: 'doc-1',
        author: 'alice',
        operationId: 'op-1',
        sequenceNumber: 1,
        baseRevision: 0,
        command: { type: 'place-brick', definitionId: 'core:cube' }
    });

    const json = envelope.toJSON();
    const restored = CollaborationEnvelope.fromJSON(json);

    assert(restored.envelopeId === envelope.envelopeId, 'envelopeId round-trips');
    assert(restored.type === 'operation', 'type round-trips');
    assert(restored.documentId === 'doc-1', 'documentId round-trips');
    assert(restored.author === 'alice', 'author round-trips');
    assert(restored.payload.operationId === 'op-1', 'operationId round-trips');
    assert(restored.payload.sequenceNumber === 1, 'sequenceNumber round-trips');
    assert(restored.payload.command.type === 'place-brick', 'command round-trips');

    // All factory helpers produce valid envelopes.
    const ack = CollaborationEnvelope.acknowledge({
        documentId: 'doc-1', author: 'bob',
        operationId: 'op-1', appliedRevision: 1
    });
    assert(ack.type === 'acknowledge', 'acknowledge factory');

    const rej = CollaborationEnvelope.reject({
        documentId: 'doc-1', author: 'bob',
        operationId: 'op-1', reason: 'invalid command'
    });
    assert(rej.type === 'reject', 'reject factory');

    const join = CollaborationEnvelope.join({ documentId: 'doc-1', author: 'alice' });
    assert(join.type === 'join', 'join factory');

    const leave = CollaborationEnvelope.leave({ documentId: 'doc-1', author: 'alice' });
    assert(leave.type === 'leave', 'leave factory');

    const syncReq = CollaborationEnvelope.syncRequest({
        documentId: 'doc-1', author: 'alice', sinceRevision: 0
    });
    assert(syncReq.type === 'sync-request', 'syncRequest factory');

    const syncRes = CollaborationEnvelope.syncResponse({
        documentId: 'doc-1', author: 'alice',
        revision: 5, commands: []
    });
    assert(syncRes.type === 'sync-response', 'syncResponse factory');

    console.log('✓ CollaborationEnvelope serialization round-trip');
}

// ---------------------------------------------------------------------
// 2. Transport: connect, broadcast, echo prevention
// ---------------------------------------------------------------------
{
    const transport = new LocalCollaborationTransport();
    const received = { alice: [], bob: [], carol: [] };

    transport.connect('doc-1', 'alice');
    transport.connect('doc-1', 'bob');
    transport.connect('doc-1', 'carol');
    transport.connect('doc-2', 'dave'); // different document

    transport.subscribe('alice', (env) => received.alice.push(env));
    transport.subscribe('bob', (env) => received.bob.push(env));
    transport.subscribe('carol', (env) => received.carol.push(env));

    const envelope = CollaborationEnvelope.operation({
        documentId: 'doc-1', author: 'alice',
        operationId: 'op-1', sequenceNumber: 1,
        baseRevision: 0, command: { type: 'place-brick' }
    });

    transport.send('alice', envelope);

    // Alice should NOT receive her own envelope (echo prevention).
    assert(received.alice.length === 0, 'sender does not receive own envelope');
    // Bob and Carol should receive it.
    assert(received.bob.length === 1, 'bob receives the envelope');
    assert(received.carol.length === 1, 'carol receives the envelope');
    // Dave is in a different document room.
    assert(transport.getParticipantCount('doc-2') === 1, 'dave is in doc-2');

    assert(transport.getParticipantCount('doc-1') === 3, 'three participants in doc-1');

    transport.disconnect('carol');
    assert(transport.getParticipantCount('doc-1') === 2, 'carol disconnected');

    console.log('✓ Transport: connect, broadcast, echo prevention');
}

// ---------------------------------------------------------------------
// 3. Two sessions: local operation propagates to remote
// ---------------------------------------------------------------------
{
    const { createParticipant } = createCollaborationFixture();
    const alice = createParticipant('alice');
    const bob = createParticipant('bob');

    // Override bob's world to share alice's document ID for this test.
    // In a real scenario, both would load the same document.
    const sharedWorldId = alice.world.id;
    bob.session._documentId = sharedWorldId;

    const remoteOps = [];
    bob.session.onRemoteOperation = (op) => remoteOps.push(op);

    alice.session.start();
    bob.session.start();

    // Alice places a brick locally.
    const buildingId = alice.world.getBuildings()[0].id;
    alice.history.execute(new PlaceBrickCommand({
        worldId: sharedWorldId,
        buildingId,
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    }));

    // Bob should have received and applied the operation.
    assert(remoteOps.length === 1, 'bob received one remote operation');
    assert(remoteOps[0].author === 'alice', 'operation from alice');

    // Bob's world should now have 2 bricks (original + alice's).
    // Note: bob's world is a separate World instance, but the command
    // was applied to bob's history.
    assert(bob.history.getCursor() === 1, 'bob history has one command');

    alice.session.stop();
    bob.session.stop();

    console.log('✓ Two sessions: local operation propagates to remote');
}

// ---------------------------------------------------------------------
// 4. Idempotency: duplicate operations are ignored
// ---------------------------------------------------------------------
{
    const transport = new LocalCollaborationTransport();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    const world = createWorld();
    const history = new CommandHistory({ world });
    const session = new CollaborationSession({
        documentId: world.id,
        author: 'bob',
        commandHistory: history,
        commandRegistry,
        transport
    });

    transport.connect(world.id, 'bob');
    transport.subscribe('bob', (env) => session._onEnvelopeReceived(env));

    const commandJson = new PlaceBrickCommand({
        worldId: world.id,
        buildingId: world.getBuildings()[0].id,
        definitionId: 'core:cube',
        position: new Position(3, 0.5, 0)
    }).toJSON();

    // Send the same operation twice.
    const op1 = CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-duplicate', sequenceNumber: 1,
        baseRevision: 0, command: commandJson
    });
    const op2 = CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-duplicate', sequenceNumber: 1,
        baseRevision: 0, command: commandJson
    });

    session._onEnvelopeReceived(op1);
    session._onEnvelopeReceived(op2);

    // Only one command should have been applied.
    assert(history.getCursor() === 1, 'duplicate operation applied only once');
    assert(session.hasSeenOperation('op-duplicate'), 'operation marked as seen');

    console.log('✓ Idempotency: duplicate operations are ignored');
}

// ---------------------------------------------------------------------
// 5. Sequence number tracking
// ---------------------------------------------------------------------
{
    const { createParticipant } = createCollaborationFixture();
    const alice = createParticipant('alice');
    const bob = createParticipant('bob');
    bob.session._documentId = alice.world.id;

    alice.session.start();
    bob.session.start();

    const buildingId = alice.world.getBuildings()[0].id;

    // Alice executes three commands.
    for (let i = 0; i < 3; i++) {
        alice.history.execute(new PlaceBrickCommand({
            worldId: alice.world.id,
            buildingId,
            definitionId: 'core:cube',
            position: new Position(i * 2, 0.5, 0)
        }));
    }

    assert(alice.session.sequenceNumber === 3, 'alice sequence is 3');

    alice.session.stop();
    bob.session.stop();

    console.log('✓ Sequence number tracking');
}

// ---------------------------------------------------------------------
// 6. Acknowledgement and rejection
// ---------------------------------------------------------------------
{
    const transport = new LocalCollaborationTransport();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    const world = createWorld();
    const history = new CommandHistory({ world });
    const session = new CollaborationSession({
        documentId: world.id,
        author: 'bob',
        commandHistory: history,
        commandRegistry,
        transport
    });

    transport.connect(world.id, 'bob');
    transport.subscribe('bob', (env) => session._onEnvelopeReceived(env));

    const acks = [];
    const rejects = [];
    session.onAcknowledge = (info) => acks.push(info);
    session.onReject = (info) => rejects.push(info);

    // Valid command → should acknowledge.
    const validCommand = new PlaceBrickCommand({
        worldId: world.id,
        buildingId: world.getBuildings()[0].id,
        definitionId: 'core:cube',
        position: new Position(7, 0.5, 0)
    }).toJSON();

    session._onEnvelopeReceived(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-valid', sequenceNumber: 1,
        baseRevision: 0, command: validCommand
    }));

    assert(acks.length === 1, 'valid operation acknowledged');
    assert(acks[0].operationId === 'op-valid', 'correct operation acknowledged');

    // Invalid command → should reject.
    session._onEnvelopeReceived(CollaborationEnvelope.operation({
        documentId: world.id, author: 'alice',
        operationId: 'op-invalid', sequenceNumber: 2,
        baseRevision: 0, command: { type: 'nonexistent-command-type' }
    }));

    assert(rejects.length === 1, 'invalid operation rejected');
    assert(rejects[0].operationId === 'op-invalid', 'correct operation rejected');

    console.log('✓ Acknowledgement and rejection');
}

// ---------------------------------------------------------------------
// 7. Echo prevention: session does not re-broadcast remote operations
// ---------------------------------------------------------------------
{
    const { createParticipant } = createCollaborationFixture();
    const alice = createParticipant('alice');
    const bob = createParticipant('bob');
    const carol = createParticipant('carol');

    const sharedWorldId = alice.world.id;
    bob.session._documentId = sharedWorldId;
    carol.session._documentId = sharedWorldId;

    const carolOps = [];
    carol.session.onRemoteOperation = (op) => carolOps.push(op);

    alice.session.start();
    bob.session.start();
    carol.session.start();

    const buildingId = alice.world.getBuildings()[0].id;
    alice.history.execute(new PlaceBrickCommand({
        worldId: sharedWorldId,
        buildingId,
        definitionId: 'core:cube',
        position: new Position(10, 0.5, 0)
    }));

    // Carol should receive exactly ONE operation (from alice).
    // Bob's re-application of alice's command should NOT echo to carol.
    assert(carolOps.length === 1, 'carol receives exactly one operation');
    assert(carolOps[0].author === 'alice', 'operation is from alice, not bob');

    alice.session.stop();
    bob.session.stop();
    carol.session.stop();

    console.log('✓ Echo prevention: no re-broadcast of remote operations');
}

// ---------------------------------------------------------------------
// 8. Join / Leave notifications
// ---------------------------------------------------------------------
{
    const { createParticipant } = createCollaborationFixture();
    const alice = createParticipant('alice');
    const bob = createParticipant('bob');
    bob.session._documentId = alice.world.id;

    const joins = [];
    const leaves = [];
    alice.session.onPeerJoined = (info) => joins.push(info);
    alice.session.onPeerLeft = (info) => leaves.push(info);

    alice.session.start();
    bob.session.start();

    assert(joins.length === 1, 'alice sees bob join');
    assert(joins[0].author === 'bob', 'join from bob');

    bob.session.stop();

    assert(leaves.length === 1, 'alice sees bob leave');
    assert(leaves[0].author === 'bob', 'leave from bob');

    alice.session.stop();

    console.log('✓ Join / Leave notifications');
}

// ---------------------------------------------------------------------
// 9. Document ID mismatch: operations for wrong document are ignored
// ---------------------------------------------------------------------
{
    const transport = new LocalCollaborationTransport();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    const world = createWorld();
    const history = new CommandHistory({ world });
    const session = new CollaborationSession({
        documentId: world.id,
        author: 'bob',
        commandHistory: history,
        commandRegistry,
        transport
    });

    transport.connect(world.id, 'bob');
    transport.subscribe('bob', (env) => session._onEnvelopeReceived(env));

    const commandJson = new PlaceBrickCommand({
        worldId: 'other-document',
        buildingId: 'some-building',
        definitionId: 'core:cube',
        position: new Position(0, 0.5, 0)
    }).toJSON();

    session._onEnvelopeReceived(CollaborationEnvelope.operation({
        documentId: 'other-document', // wrong document
        author: 'alice',
        operationId: 'op-wrong-doc',
        sequenceNumber: 1,
        baseRevision: 0,
        command: commandJson
    }));

    assert(history.getCursor() === 0, 'wrong-document operation not applied');

    console.log('✓ Document ID mismatch: operations for wrong document ignored');
}

// ---------------------------------------------------------------------
// 10. CreateCollaborationUseCase: DI wiring
// ---------------------------------------------------------------------
{
    const { createSession, transport, commandRegistry } = new CreateCollaborationUseCase().execute();

    const world = createWorld();
    const history = new CommandHistory({ world });

    const session = createSession({
        documentId: world.id,
        author: 'alice',
        commandHistory: history
    });

    assert(session instanceof CollaborationSession, 'createSession returns CollaborationSession');
    assert(session.documentId === world.id, 'documentId wired');
    assert(session.author === 'alice', 'author wired');

    console.log('✓ CreateCollaborationUseCase: DI wiring');
}

// ---------------------------------------------------------------------
// 11. FLAGSHIP: three participants, concurrent operations, full
//     protocol lifecycle
// ---------------------------------------------------------------------
{
    const transport = new LocalCollaborationTransport();
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    // All three participants share the same document ID.
    const sharedWorldId = 'shared-document';

    function makeParticipant(author) {
        const world = new World({ id: sharedWorldId });
        const building = new Building({ id: 'shared-building', creator: author });
        world.addBuilding(building);
        const history = new CommandHistory({ world });
        const session = new CollaborationSession({
            documentId: sharedWorldId,
            author,
            commandHistory: history,
            commandRegistry,
            transport
        });
        return { world, history, session };
    }

    const alice = makeParticipant('alice');
    const bob = makeParticipant('bob');
    const carol = makeParticipant('carol');

    const remoteOpsAlice = [];
    const remoteOpsBob = [];
    const remoteOpsCarol = [];
    alice.session.onRemoteOperation = (op) => remoteOpsAlice.push(op);
    bob.session.onRemoteOperation = (op) => remoteOpsBob.push(op);
    carol.session.onRemoteOperation = (op) => remoteOpsCarol.push(op);

    alice.session.start();
    bob.session.start();
    carol.session.start();

    // Alice places a brick.
    alice.history.execute(new PlaceBrickCommand({
        worldId: sharedWorldId,
        buildingId: 'shared-building',
        definitionId: 'core:cube',
        position: new Position(0, 0.5, 0)
    }));

    // Bob places a brick.
    bob.history.execute(new PlaceBrickCommand({
        worldId: sharedWorldId,
        buildingId: 'shared-building',
        definitionId: 'core:cube',
        position: new Position(5, 0.5, 0)
    }));

    // Carol places a brick.
    carol.history.execute(new PlaceBrickCommand({
        worldId: sharedWorldId,
        buildingId: 'shared-building',
        definitionId: 'core:cube',
        position: new Position(10, 0.5, 0)
    }));

    // Each participant should have received 2 remote operations
    // (from the other two).
    assert(remoteOpsAlice.length === 2, 'alice received 2 remote ops');
    assert(remoteOpsBob.length === 2, 'bob received 2 remote ops');
    assert(remoteOpsCarol.length === 2, 'carol received 2 remote ops');

    // Each participant's history should have 3 commands total
    // (1 local + 2 remote).
    assert(alice.history.getCursor() === 3, 'alice history has 3 commands');
    assert(bob.history.getCursor() === 3, 'bob history has 3 commands');
    assert(carol.history.getCursor() === 3, 'carol history has 3 commands');

    // Sequence numbers: each author has their own counter.
    assert(alice.session.sequenceNumber === 1, 'alice sequence is 1');
    assert(bob.session.sequenceNumber === 1, 'bob sequence is 1');
    assert(carol.session.sequenceNumber === 1, 'carol sequence is 1');

    // Idempotency: all operations seen.
    assert(alice.session.seenOperationCount >= 3, 'alice has seen at least 3 operations');

    // Stop all sessions.
    alice.session.stop();
    bob.session.stop();
    carol.session.stop();

    assert(transport.getParticipantCount(sharedWorldId) === 0, 'all participants disconnected');

    console.log('✓ FLAGSHIP: three participants, concurrent operations, full lifecycle');
}

// ---------------------------------------------------------------------
// 12. Protocol envelope type coverage
// ---------------------------------------------------------------------
{
    // Verify all envelope types serialize and deserialize correctly.
    const types = ['operation', 'acknowledge', 'reject', 'join', 'leave', 'sync-request', 'sync-response'];
    for (const type of types) {
        const envelope = new CollaborationEnvelope({
            type,
            documentId: 'doc-test',
            author: 'tester',
            payload: { test: true }
        });
        const json = envelope.toJSON();
        const restored = CollaborationEnvelope.fromJSON(json);
        assert(restored.type === type, `type ${type} round-trips`);
        assert(restored.payload.test === true, `type ${type} payload preserved`);
    }

    console.log('✓ Protocol envelope type coverage');
}

console.log('\nAll collaboration protocol tests passed.');
