import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { CommandHistoryEvent } from '../application/events/CommandHistoryEvent.js';
import { MoveStructurePlacementCommand } from '../application/commands/MoveStructurePlacementCommand.js';
import { RemoveStructurePlacementCommand } from '../application/commands/RemoveStructurePlacementCommand.js';
import { SetStructurePlacementTransformCommand } from '../application/commands/SetStructurePlacementTransformCommand.js';
import { WorldCommandPropagationUseCase } from '../application/WorldCommandPropagationUseCase.js';
import { LogicalClock } from '../core/LogicalClock.js';
import { compareWorldOperations, worldOperationSortKey } from '../core/WorldOperationOrder.js';
import { WorldConflictResolver, WorldOperationOutcome } from '../replication/WorldConflictResolver.js';

// 0.2.97 — Shared World Ordering & Conflict Resolution.
//
// 0.2.95 proved WHO may edit a World. 0.2.96 proved that an authorized
// edit made on ONE replica becomes the SAME durable mutation on another,
// for a single, already-agreed operation. This file proves the question
// both of those milestones left explicitly open — the dangerous one:
//
//   Every authorized replica that receives the SAME set of valid World
//   operations eventually derives the SAME World state, regardless of
//   arrival order or retransmission order.
//
//   Section A: core/LogicalClock.js + core/WorldOperationOrder.js — the
//              ordering primitives, in isolation.
//   Section B: replication/WorldConflictResolver.js — the reordering/
//              rebase mechanism, in isolation: independent edits
//              coexist; a same-object ABSOLUTE conflict has ONE
//              deterministic winner regardless of arrival order;
//              delete is terminal over modify in EITHER canonical
//              order; duplicates are idempotent; a three-op cascade
//              reorders correctly.
//   Section C: FLAGSHIP — the shuffle stress test: a fixed set of six
//              operations against a three-placement World, replayed in
//              hundreds of random arrival orders, every single one
//              converging on the byte-identical serialized World.
//   Section D: real authenticated peer network — Alice and Bob (and a
//              third replica, Carol) concurrently editing the SAME
//              World and converging, over the real 0.2.96 propagation
//              pipeline, unmodified in its first five steps.
//   Section E: the composition gap 0.2.96 left open — a real
//              WorldNavigationSession, wired with a worldCommandPropagation
//              collaborator, broadcasts a LOCAL mutation automatically,
//              with zero manual broadcastCommand() call anywhere in the
//              test.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fisher-Yates — deterministic given a seeded RNG isn't required here;
// the point of Section C is that EVERY order converges, not any one
// specific order.
function shuffled(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function buildThreePlacementWorld({ worldId, houseId, barnId, siloId }) {
    const world = new World({ id: worldId });
    world.addStructurePlacement(new StructurePlacement({ id: houseId, documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
    world.addStructurePlacement(new StructurePlacement({ id: barnId, documentId: 'doc:structure', position: new Position(10, 0, 0), rotation: 0 }));
    world.addStructurePlacement(new StructurePlacement({ id: siloId, documentId: 'doc:structure', position: new Position(20, 0, 0), rotation: 0 }));
    return world;
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — core/LogicalClock.js + core/WorldOperationOrder.js
// ---------------------------------------------------------------------
{
    const clock = new LogicalClock();
    assert(clock.value === 0, '1. a fresh LogicalClock starts at 0');
    assert(clock.tick() === 1, '2. the first tick() is 1');
    assert(clock.tick() === 2, '3. tick() strictly increments');
    clock.observe(2);
    assert(clock.value === 2, '4. observe() at or below the current value is a no-op');
    clock.observe(10);
    assert(clock.value === 10, '5. observe() raises the floor to a higher remote value');
    assert(clock.tick() === 11, '6. the NEXT local tick reflects everything observed so far');
    clock.observe(3);
    assert(clock.value === 11, '7. observe() never lowers the clock');
    clock.observe('not-a-number');
    assert(clock.value === 11, '8. a malformed observed value is ignored, never corrupts the clock');

    const a = { logicalClock: 1, operationId: 'op-b' };
    const b = { logicalClock: 1, operationId: 'op-a' };
    const c = { logicalClock: 2, operationId: 'op-a' };
    assert(compareWorldOperations(a, a) === 0, '9. an operation compares equal to itself');
    assert(compareWorldOperations(a, b) > 0, '10. same logicalClock: tie-broken by operationId, lexicographically');
    assert(compareWorldOperations(b, a) < 0, '11. ...symmetric the other way');
    assert(compareWorldOperations(a, c) < 0, '12. a lower logicalClock always sorts first, regardless of operationId');
    assert(worldOperationSortKey({ operationId: 'x' }).logicalClock === 0, '13. a missing logicalClock degrades to 0');
    assert(worldOperationSortKey({ operationId: 'x', logicalClock: 'nope' }).logicalClock === 0, '14. a non-integer logicalClock degrades to 0');
    assert(worldOperationSortKey({ operationId: 'x', logicalClock: 7 }).logicalClock === 7, '15. a real logicalClock passes through unchanged');

    console.log('✓ Section A: core/LogicalClock.js + core/WorldOperationOrder.js — the ordering primitives');
}

// ---------------------------------------------------------------------
// Section B — replication/WorldConflictResolver.js in isolation
// ---------------------------------------------------------------------
{
    // --- independent edits: different targets, any order ------------
    {
        const world = buildThreePlacementWorld({ worldId: 'w-b1', houseId: 'house', barnId: 'barn', siloId: 'silo' });
        const resolver = new WorldConflictResolver();
        const moveHouse = new MoveStructurePlacementCommand({ id: 'op-house', worldId: 'w-b1', placementId: 'house', delta: { x: 5, y: 0, z: 0 } });
        const moveBarn = new MoveStructurePlacementCommand({ id: 'op-barn', worldId: 'w-b1', placementId: 'barn', delta: { x: 0, y: 0, z: 7 } });
        // Barn's operation arrives and is reconciled FIRST, even though
        // it was authored with a HIGHER logicalClock — an out-of-order
        // arrival of an unrelated target must never block or reorder
        // anything.
        const r1 = resolver.applyRemote({ worldDocumentId: 'w-b1', envelope: { operationId: 'op-barn', logicalClock: 2 }, command: moveBarn, world });
        const r2 = resolver.applyRemote({ worldDocumentId: 'w-b1', envelope: { operationId: 'op-house', logicalClock: 1 }, command: moveHouse, world });
        assert(r1 === WorldOperationOutcome.APPLIED && r2 === WorldOperationOutcome.APPLIED, '16. independent edits both apply cleanly');
        assert(world.getStructurePlacement('house').position.x === 5, '17. house moved by its own delta');
        assert(world.getStructurePlacement('barn').position.z === 7, '18. barn moved by its own delta, untouched by house\'s operation');
    }

    // --- same-object ABSOLUTE conflict: ONE deterministic winner,
    //     regardless of arrival order ----------------------------------
    {
        function run(order) {
            const world = buildThreePlacementWorld({ worldId: 'w-b2', houseId: 'house', barnId: 'barn', siloId: 'silo' });
            const resolver = new WorldConflictResolver();
            const early = new SetStructurePlacementTransformCommand({ id: 'op-early', worldId: 'w-b2', placementId: 'house', position: new Position(10, 0, 20), rotation: 90 });
            const late = new SetStructurePlacementTransformCommand({ id: 'op-late', worldId: 'w-b2', placementId: 'house', position: new Position(30, 0, 40), rotation: 180 });
            const ops = order === 'early-first'
                ? [{ envelope: { operationId: 'op-early', logicalClock: 1 }, command: early }, { envelope: { operationId: 'op-late', logicalClock: 2 }, command: late }]
                : [{ envelope: { operationId: 'op-late', logicalClock: 2 }, command: late }, { envelope: { operationId: 'op-early', logicalClock: 1 }, command: early }];
            for (const op of ops) {
                resolver.applyRemote({ worldDocumentId: 'w-b2', envelope: op.envelope, command: op.command, world });
            }
            return world.getStructurePlacement('house');
        }
        const forward = run('early-first');
        const reversed = run('late-first');
        assert(forward.position.x === 30 && forward.position.z === 40 && forward.rotation === 180,
            '19. the CANONICALLY later operation (op-late, logicalClock=2) wins when it arrives in order');
        assert(reversed.position.x === 30 && reversed.position.z === 40 && reversed.rotation === 180,
            '20. ...and STILL wins when it arrives FIRST — out-of-order arrival never changes the winner');
    }

    // --- delete vs. modify: DELETE IS TERMINAL, in EITHER canonical
    //     order -------------------------------------------------------
    {
        function run(order) {
            const world = buildThreePlacementWorld({ worldId: 'w-b3', houseId: 'house', barnId: 'barn', siloId: 'silo' });
            const resolver = new WorldConflictResolver();
            const del = new RemoveStructurePlacementCommand({ id: 'op-del', worldId: 'w-b3', placementId: 'silo' });
            const move = new MoveStructurePlacementCommand({ id: 'op-move', worldId: 'w-b3', placementId: 'silo', delta: { x: 1, y: 0, z: 0 } });
            let deleteOutcome, moveOutcome;
            if (order === 'delete-canonically-first') {
                // delete (clock=1) precedes modify (clock=2): delete
                // arrives, then modify — no rebase needed, modify simply
                // finds nothing there.
                deleteOutcome = resolver.applyRemote({ worldDocumentId: 'w-b3', envelope: { operationId: 'op-del', logicalClock: 1 }, command: del, world });
                moveOutcome = resolver.applyRemote({ worldDocumentId: 'w-b3', envelope: { operationId: 'op-move', logicalClock: 2 }, command: move, world });
            } else {
                // modify (clock=1) precedes delete (clock=2), but
                // arrives SECOND on the wire: the modify rebases in
                // BEFORE the already-applied delete, succeeds, then the
                // delete is redone on top of it.
                deleteOutcome = resolver.applyRemote({ worldDocumentId: 'w-b3', envelope: { operationId: 'op-del', logicalClock: 2 }, command: del, world });
                moveOutcome = resolver.applyRemote({ worldDocumentId: 'w-b3', envelope: { operationId: 'op-move', logicalClock: 1 }, command: move, world });
            }
            return { world, deleteOutcome, moveOutcome };
        }
        const a = run('delete-canonically-first');
        assert(a.deleteOutcome === WorldOperationOutcome.APPLIED, '21. the delete itself always applies');
        assert(a.moveOutcome === WorldOperationOutcome.SUPERSEDED, '22. a modify canonically AFTER a delete is superseded, never throws out of this class');
        assert(a.world.getStructurePlacement('silo') === null, '23. silo is deleted');

        const b = run('modify-canonically-first-arrives-second');
        assert(b.deleteOutcome === WorldOperationOutcome.APPLIED, '24. the delete still applies');
        assert(b.moveOutcome === WorldOperationOutcome.APPLIED, '25. the modify, canonically BEFORE the delete, genuinely applied (moved the silo) before being deleted out from under it');
        assert(b.world.getStructurePlacement('silo') === null, '26. ...but the FINAL result is still deleted — delete is terminal regardless of arrival order');

        console.log('✓ delete vs. modify — DELETE IS TERMINAL in both canonical orders (silo deleted either way)');
    }

    // --- idempotency: the same operationId applied twice is a no-op -
    {
        const world = buildThreePlacementWorld({ worldId: 'w-b4', houseId: 'house', barnId: 'barn', siloId: 'silo' });
        const resolver = new WorldConflictResolver();
        const move = new MoveStructurePlacementCommand({ id: 'op-dup', worldId: 'w-b4', placementId: 'house', delta: { x: 1, y: 0, z: 0 } });
        const first = resolver.applyRemote({ worldDocumentId: 'w-b4', envelope: { operationId: 'op-dup', logicalClock: 1 }, command: move, world });
        const second = resolver.applyRemote({ worldDocumentId: 'w-b4', envelope: { operationId: 'op-dup', logicalClock: 1 }, command: move, world });
        assert(first === WorldOperationOutcome.APPLIED && second === WorldOperationOutcome.APPLIED, '27. a retransmit reports the same outcome');
        assert(world.getStructurePlacement('house').position.x === 1, '28. ...and produces NO second mutation');
    }

    // --- cascading three-op reorder -----------------------------------
    {
        function run(order) {
            const world = buildThreePlacementWorld({ worldId: 'w-b5', houseId: 'house', barnId: 'barn', siloId: 'silo' });
            const resolver = new WorldConflictResolver();
            const del = { envelope: { operationId: 'op-c-del', logicalClock: 10 }, command: new RemoveStructurePlacementCommand({ id: 'op-c-del', worldId: 'w-b5', placementId: 'silo' }) };
            const mid = { envelope: { operationId: 'op-c-mid', logicalClock: 5 }, command: new MoveStructurePlacementCommand({ id: 'op-c-mid', worldId: 'w-b5', placementId: 'silo', delta: { x: 2, y: 0, z: 0 } }) };
            const early = { envelope: { operationId: 'op-c-early', logicalClock: 1 }, command: new SetStructurePlacementTransformCommand({ id: 'op-c-early', worldId: 'w-b5', placementId: 'silo', position: new Position(99, 0, 99) }) };
            const ops = order.map((key) => ({ del, mid, early }[key]));
            for (const op of ops) resolver.applyRemote({ worldDocumentId: 'w-b5', envelope: op.envelope, command: op.command, world });
            return world.getStructurePlacement('silo');
        }
        // Canonical order is early(1) -> mid(5) -> del(10): early sets
        // the silo's position, mid nudges it further, del removes it —
        // final result is always "deleted," regardless of which of the
        // six arrival permutations below is used.
        assert(run(['del', 'mid', 'early']) === null, '29. arrival order [del, mid, early] converges to deleted');
        assert(run(['early', 'del', 'mid']) === null, '30. arrival order [early, del, mid] converges to deleted');
        assert(run(['mid', 'early', 'del']) === null, '31. arrival order [mid, early, del] converges to deleted');
        assert(run(['del', 'early', 'mid']) === null, '32. arrival order [del, early, mid] converges to deleted');
        assert(run(['early', 'mid', 'del']) === null, '33. arrival order [early, mid, del] converges to deleted');
        assert(run(['mid', 'del', 'early']) === null, '34. arrival order [mid, del, early] converges to deleted');
    }

    console.log('✓ Section B: replication/WorldConflictResolver.js — independent edits, deterministic same-object winner, delete-is-terminal, idempotency, cascading reorder');
}

// ---------------------------------------------------------------------
// Section C — FLAGSHIP: shuffle stress test
// ---------------------------------------------------------------------
{
    const worldId = 'w-flagship';
    const houseId = 'house', barnId = 'barn', siloId = 'silo';
    const commandRegistry = new CreateCommandRegistryUseCase().execute();

    // Six operations, ALL constructed once, with FIXED ids and FIXED
    // logicalClock values — this is "the same set of valid World
    // operations" the milestone's own central invariant is about. Their
    // canonical order (by logicalClock) is: moveBarn(1) < deleteSilo(2)
    // < moveHouse(3) < moveSilo(4) < setHouseV1(5) < setHouseV2(6).
    const specs = [
        { id: 'op-move-barn', logicalClock: 1, build: () => new MoveStructurePlacementCommand({ id: 'op-move-barn', worldId, placementId: barnId, delta: { x: 0, y: 0, z: 3 } }) },
        { id: 'op-delete-silo', logicalClock: 2, build: () => new RemoveStructurePlacementCommand({ id: 'op-delete-silo', worldId, placementId: siloId }) },
        { id: 'op-move-house', logicalClock: 3, build: () => new MoveStructurePlacementCommand({ id: 'op-move-house', worldId, placementId: houseId, delta: { x: 5, y: 0, z: 0 } }) },
        // Canonically AFTER the silo's own delete — this one MUST end
        // up superseded on every single replica, in every order.
        { id: 'op-move-silo-too-late', logicalClock: 4, build: () => new MoveStructurePlacementCommand({ id: 'op-move-silo-too-late', worldId, placementId: siloId, delta: { x: 1, y: 1, z: 1 } }) },
        { id: 'op-set-house-v1', logicalClock: 5, build: () => new SetStructurePlacementTransformCommand({ id: 'op-set-house-v1', worldId, placementId: houseId, position: new Position(100, 0, 0), rotation: 90 }) },
        // The LAST word on the house, canonically — this is the ONLY
        // one of the two competing SetStructurePlacementTransformCommands
        // whose target value should survive.
        { id: 'op-set-house-v2', logicalClock: 6, build: () => new SetStructurePlacementTransformCommand({ id: 'op-set-house-v2', worldId, placementId: houseId, position: new Position(200, 0, 0), rotation: 180 }) }
    ];
    const operationJson = specs.map((spec) => ({ operationId: spec.id, logicalClock: spec.logicalClock, json: spec.build().toJSON() }));

    function freshWorld() {
        return buildThreePlacementWorld({ worldId, houseId, barnId, siloId });
    }

    // The reference result: apply every operation once, in CANONICAL
    // order, against a fresh World.
    const referenceWorld = freshWorld();
    {
        const resolver = new WorldConflictResolver();
        const canonical = [...operationJson].sort((a, b) => a.logicalClock - b.logicalClock);
        for (const op of canonical) {
            const command = commandRegistry.fromJSON(op.json);
            resolver.applyRemote({ worldDocumentId: worldId, envelope: { operationId: op.operationId, logicalClock: op.logicalClock }, command, world: referenceWorld });
        }
    }
    assert(referenceWorld.getStructurePlacement(siloId) === null, '35. reference: silo is deleted');
    assert(referenceWorld.getStructurePlacement(houseId).position.x === 200 && referenceWorld.getStructurePlacement(houseId).rotation === 180,
        '36. reference: house holds op-set-house-v2\'s exact target — the canonically later SET wins');
    assert(referenceWorld.getStructurePlacement(barnId).position.z === 3, '37. reference: barn holds its own independent move');
    const referenceJson = JSON.stringify(referenceWorld.toJSON());

    const ITERATIONS = 300;
    for (let i = 0; i < ITERATIONS; i++) {
        const world = freshWorld();
        const resolver = new WorldConflictResolver();
        for (const op of shuffled(operationJson)) {
            const command = commandRegistry.fromJSON(op.json);
            resolver.applyRemote({ worldDocumentId: worldId, envelope: { operationId: op.operationId, logicalClock: op.logicalClock }, command, world });
        }
        const actualJson = JSON.stringify(world.toJSON());
        assert(actualJson === referenceJson, `38. shuffle iteration ${i}: World converged to the byte-identical reference state regardless of arrival order`);
        assert(resolver.getAppliedOperationIds(worldId).includes('op-move-silo-too-late') === false,
            `39. shuffle iteration ${i}: the too-late silo move is superseded, never counted as applied`);
    }

    console.log(`✓ Section C FLAGSHIP: ${ITERATIONS} random arrival orders of the same six-operation set — every single one converged to the byte-identical serialized World`);
}

// ---------------------------------------------------------------------
// Section D — real authenticated peer network
// ---------------------------------------------------------------------
{
    function makeDevice(label) {
        const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
        const identity = provider.createLocalIdentity(label);
        provider.authenticate(identity.identityId);
        return { provider, identity };
    }

    async function connectAndAuthenticate(network, addressA, deviceA, addressB, deviceB) {
        const transportA = new LocalPeerConnectionProvider(addressA, network);
        const transportB = new LocalPeerConnectionProvider(addressB, network);
        let incomingB = null;
        const unsubscribe = transportB.onIncomingConnection((connection) => { incomingB = connection; });
        const connectionA = transportA.connect(addressB);
        await wait();
        unsubscribe();
        assert(incomingB, `connectAndAuthenticate: ${addressB} never saw an incoming connection from ${addressA}`);

        const sessionA = new PeerAuthenticationSession({ connection: connectionA, identityProvider: deviceA.provider });
        const sessionB = new PeerAuthenticationSession({ connection: incomingB, identityProvider: deviceB.provider });
        sessionA.start();
        sessionB.start();
        await wait(10);
        assert(sessionA.isAuthenticated && sessionB.isAuthenticated, `connectAndAuthenticate: ${addressA} <-> ${addressB} did not reach AUTHENTICATED`);

        return {
            peerA: new ConnectedPeer({ connection: connectionA, authenticationSession: sessionA }),
            peerB: new ConnectedPeer({ connection: incomingB, authenticationSession: sessionB })
        };
    }

    function makeStack(device) {
        const peerMessageBus = new PeerMessageBus();
        const connectedPeerRegistry = new ConnectedPeerRegistry();
        const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry });
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const documents = new Map();
        const propagation = new WorldCommandPropagationUseCase({
            peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
            identityProvider: device.provider, commandRegistry,
            resolveWorldDocument: (id) => documents.get(id) || null
        });
        return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, commandRegistry, documents, propagation };
    }

    function buildPlacementDoc({ worldId, houseId, barnId, siloId, authorIdentityId, title }) {
        const world = buildThreePlacementWorld({ worldId, houseId, barnId, siloId });
        return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
    }

    function connectPair(stackA, addressA, stackB, addressB, network) {
        return connectAndAuthenticate(network, addressA, stackA.device, addressB, stackB.device).then(({ peerA, peerB }) => {
            stackA.connectedPeerRegistry.add(peerA);
            stackB.connectedPeerRegistry.add(peerB);
        });
    }

    // Every replica below EDITS as one of Alice's own AUTHORIZED
    // DEVICES (application/DeviceAuthorizationPropagationUseCase.js,
    // 0.2.79/0.2.95's own model) — never as a second, independent
    // OWNER. application/WorldAuthorizationService.js grants EDIT to
    // exactly one cryptographic owner (plus that owner's authorized
    // devices, 0.2.95); it deliberately does not yet support two
    // DIFFERENT people co-owning a World (a genuinely different,
    // unbuilt feature). "Alice's Laptop and Alice's Phone both edit the
    // same World while apart, then reconnect" is the realistic scenario
    // THIS milestone's architecture actually supports today — and per
    // docs/Roadmap.md, 0.2.97's own test list, "offline replica
    // reconnecting later" is exactly one of the scenarios this flagship
    // is asked to prove.
    async function authorizeDevice(ownerStack, owner, deviceIdentity, label) {
        const grant = owner.provider.authorizeDevice(owner.identity.identityId, deviceIdentity.identityId, deviceIdentity.publicKey, { deviceLabel: label });
        ownerStack.deviceAuth.broadcastAuthorization(grant);
        await wait(20);
        return grant;
    }

    // --- two-replica convergence: independent edits + a genuine
    //     concurrent delete-vs-modify race ----------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice');
        const phone = makeDevice('Alice-Phone');
        const aliceStack = makeStack(alice);
        const phoneStack = makeStack(phone);

        const worldId = 'w-net-1', houseId = 'house', barnId = 'barn', siloId = 'silo';
        aliceStack.documents.set(worldId, buildPlacementDoc({ worldId, houseId, barnId, siloId, authorIdentityId: alice.identity.identityId, title: 'Shared World' }));
        phoneStack.documents.set(worldId, buildPlacementDoc({ worldId, houseId, barnId, siloId, authorIdentityId: alice.identity.identityId, title: 'Shared World' }));

        await connectPair(aliceStack, 'alice-net1', phoneStack, 'phone-net1', network);
        await authorizeDevice(aliceStack, alice, phone.identity, 'Phone');

        // Concurrent, independent edits: the Laptop moves the house,
        // the Phone moves the barn — neither has seen the other's edit
        // yet.
        const aliceWorld = aliceStack.documents.get(worldId).world;
        const phoneWorld = phoneStack.documents.get(worldId).world;
        const moveHouse = new MoveStructurePlacementCommand({ worldId, placementId: houseId, delta: { x: 4, y: 0, z: 0 } });
        moveHouse.execute({ world: aliceWorld });
        const moveBarn = new MoveStructurePlacementCommand({ worldId, placementId: barnId, delta: { x: 0, y: 0, z: 9 } });
        moveBarn.execute({ world: phoneWorld });
        aliceStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: moveHouse });
        phoneStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: moveBarn });
        await wait(20);

        assert(JSON.stringify(aliceWorld.toJSON()) === JSON.stringify(phoneWorld.toJSON()),
            '40. independent concurrent edits: Laptop and Phone converge to the byte-identical World');
        assert(aliceWorld.getStructurePlacement(houseId).position.x === 4 && aliceWorld.getStructurePlacement(barnId).position.z === 9,
            '41. ...and both edits are genuinely present');

        // Concurrent conflict: the Laptop deletes the silo; the Phone,
        // not yet aware, moves it at the same time.
        const deleteSilo = new RemoveStructurePlacementCommand({ worldId, placementId: siloId });
        deleteSilo.execute({ world: aliceWorld });
        const moveSilo = new MoveStructurePlacementCommand({ worldId, placementId: siloId, delta: { x: 1, y: 0, z: 0 } });
        moveSilo.execute({ world: phoneWorld });
        aliceStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: deleteSilo });
        phoneStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: moveSilo });
        await wait(20);

        assert(aliceWorld.getStructurePlacement(siloId) === null && phoneWorld.getStructurePlacement(siloId) === null,
            '42. delete vs. modify, genuinely concurrent: BOTH replicas converge to "deleted"');
        assert(JSON.stringify(aliceWorld.toJSON()) === JSON.stringify(phoneWorld.toJSON()),
            '43. ...and the two replicas remain byte-identical after the conflict resolves');

        aliceStack.propagation.dispose();
        phoneStack.propagation.dispose();
    }

    // --- three-replica convergence -----------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice3');
        const phone = makeDevice('Alice3-Phone');
        const tablet = makeDevice('Alice3-Tablet');
        const aliceStack = makeStack(alice);
        const phoneStack = makeStack(phone);
        const tabletStack = makeStack(tablet);

        const worldId = 'w-net-3', houseId = 'house', barnId = 'barn', siloId = 'silo';
        for (const stack of [aliceStack, phoneStack, tabletStack]) {
            stack.documents.set(worldId, buildPlacementDoc({ worldId, houseId, barnId, siloId, authorIdentityId: alice.identity.identityId, title: 'Three-Way World' }));
        }

        // A full mesh: application/WorldCommandPropagationUseCase.js
        // never relays — an operation only ever reaches a DIRECTLY
        // connected, AUTHENTICATED peer (see that file's own header),
        // so three-way convergence requires three direct connections,
        // not a hub-and-spoke.
        await connectPair(aliceStack, 'a3', phoneStack, 'p3-a', network);
        await connectPair(aliceStack, 'a3-t', tabletStack, 't3-a', network);
        await connectPair(phoneStack, 'p3-t', tabletStack, 't3-p', network);

        // The Laptop authorizes BOTH other devices and gossips both
        // grants over EVERY connection it currently holds — reaching
        // the Phone and the Tablet directly, so each one learns not
        // only "I am authorized" but "the OTHER device is too," which
        // is exactly what the Phone<->Tablet connection (never touching
        // the Laptop) needs to accept each other's operations. See
        // replication/ReplayGuard.js's own neighbor, application/
        // DeviceAuthorizationPropagationUseCase.js's header: "a
        // gossiped record is trusted by its OWN signature alone, never
        // by who relayed it."
        await authorizeDevice(aliceStack, alice, phone.identity, 'Phone');
        await authorizeDevice(aliceStack, alice, tablet.identity, 'Tablet');

        const aliceWorld = aliceStack.documents.get(worldId).world;
        const phoneWorld = phoneStack.documents.get(worldId).world;
        const tabletWorld = tabletStack.documents.get(worldId).world;

        // Three concurrent edits to the SAME placement (the house),
        // from three different replicas, all before any has seen
        // another's operation.
        const setA = new SetStructurePlacementTransformCommand({ worldId, placementId: houseId, position: new Position(1, 0, 0), rotation: 10 });
        setA.execute({ world: aliceWorld });
        const setB = new SetStructurePlacementTransformCommand({ worldId, placementId: houseId, position: new Position(2, 0, 0), rotation: 20 });
        setB.execute({ world: phoneWorld });
        const setC = new SetStructurePlacementTransformCommand({ worldId, placementId: houseId, position: new Position(3, 0, 0), rotation: 30 });
        setC.execute({ world: tabletWorld });
        aliceStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: setA });
        phoneStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: setB });
        tabletStack.propagation.broadcastCommand({ worldDocumentId: worldId, command: setC });
        await wait(30);

        const aliceJson = JSON.stringify(aliceWorld.toJSON());
        const phoneJson = JSON.stringify(phoneWorld.toJSON());
        const tabletJson = JSON.stringify(tabletWorld.toJSON());
        assert(aliceJson === phoneJson && phoneJson === tabletJson,
            '44. three concurrent edits to the SAME placement, from three different (fully meshed) replicas: all three converge to the byte-identical World');

        aliceStack.propagation.dispose();
        phoneStack.propagation.dispose();
        tabletStack.propagation.dispose();
    }

    console.log('✓ Section D: real authenticated peer network — independent edits, a genuine delete-vs-modify race, and a three-replica same-object conflict all converge across Alice\'s own authorized devices');
}

// ---------------------------------------------------------------------
// Section E — closing the 0.2.96 composition gap
// ---------------------------------------------------------------------
{
    function makePropagationSpy() {
        const attachedWorldIds = [];
        const broadcasts = [];
        return {
            attachCommandHistory({ worldDocumentId, commandHistory }) {
                attachedWorldIds.push(worldDocumentId);
                const subscription = commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
                    broadcasts.push({ worldDocumentId, command });
                });
                return () => subscription.unsubscribe();
            },
            attachedWorldIds,
            broadcasts
        };
    }

    // Mirrors tests/WorldEditingAuthorization.test.js's own
    // buildOneBrickWorld()/stubRenderer() exactly — the smallest real
    // WorldNavigationSession this codebase already knows how to build.
    function buildOneBrickWorld(position = new Position(0, 0.5, 0)) {
        const world = new World({});
        const building = new Building({});
        building.addBrick(new Brick({ definitionId: 'core:cube', position }));
        world.addBuilding(building);
        return world;
    }

    function stubRenderer(extra = {}) {
        return {
            addWorld() {}, removeWorld() {}, dispose() {},
            clearSelection() {}, clearHover() {},
            selectBricks() {}, hoverBrick() {},
            pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
            pickRectangle() { return []; },
            setControlsEnabled() {},
            getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
            setCameraState() {},
            ...extra
        };
    }

    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const registry = new CreateBrickRegistryUseCase().execute();
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

    const gapWorld = buildOneBrickWorld();
    const building = gapWorld.getBuildings()[0];
    const brick = building.getBricks()[0];
    const gapDoc = new Document({ world: gapWorld, metadata: new DocumentMetadata({ title: "Alice's World", author: 'alice', authorIdentityId: 'did:key:alice' }) });
    storage.save(gapWorld.id, serializer.serialize(gapDoc));

    const propagationSpy = makePropagationSpy();
    const session = new WorldNavigationSession({
        registry, loadPublicationDocumentUseCase, worldLayoutProvider, discoveryProvider,
        // 0.2.97 — the ONE new constructor collaborator this milestone
        // adds. Nothing else about session construction changed.
        worldCommandPropagation: propagationSpy
    });
    session._session = stubRenderer();
    session._loadWorld(gapWorld.id);

    assert(propagationSpy.attachedWorldIds.includes(gapWorld.id),
        '45. loading a World with worldCommandPropagation wired attaches its CommandHistory automatically — no manual wiring at the call site');

    session._session.pick = () => ({ documentId: gapWorld.id, buildingId: building.id, brickId: brick.id, distance: 1 });
    session.pick(400, 300);
    const moved = session.moveSelection({ x: 3, y: 0, z: 0 });
    assert(moved === true, '46. the ordinary moveSelection() call path is completely unaffected');
    assert(propagationSpy.broadcasts.length === 1, '47. the local mutation was broadcast automatically — zero manual broadcastCommand() calls anywhere in this test');
    assert(propagationSpy.broadcasts[0].worldDocumentId === gapWorld.id, '48. ...addressed to the correct World');
    assert(typeof propagationSpy.broadcasts[0].command.toJSON === 'function', '49. ...carrying the real, already-executed Command instance');

    session.undo();
    assert(propagationSpy.broadcasts.length === 1, '50. undo() is NEVER broadcast — only forward COMMAND_EXECUTED, matching application/WorldCommandPropagationUseCase.js#attachCommandHistory()\'s own documented scope');

    session.dispose();
    console.log('✓ Section E: closing the 0.2.96 composition gap — a real WorldNavigationSession broadcasts local mutations automatically once worldCommandPropagation is wired, and never broadcasts undo/redo');
}

}

runTests().then(() => {
    console.log('\n✓ All SharedWorldConflictResolution tests passed');
}).catch((error) => {
    console.error('\n✗ SharedWorldConflictResolution tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
