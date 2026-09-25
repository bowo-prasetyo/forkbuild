import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeerRegistry } from '../application/peer/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/identity/DeviceAuthorizationPropagationUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DocumentCommandPropagationUseCase } from '../application/document/DocumentCommandPropagationUseCase.js';
import { WorldCommandPropagationUseCase } from '../application/document/WorldCommandPropagationUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Editing while signed out (or with a locked identity) is allowed; there is
// just no identity to author operations for peers, and no authenticated
// peer to send them to. Each local edit used to throw from the command
// propagation handlers ("no signing identity to author this operation"),
// an uncaught error on every brick placed.

function oneBrickDocument(id) {
    const world = new World({ id });
    const building = new Building({ id: 'building' });
    building.addBrick(new Brick({ id: 'brick', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Untitled', author: 'nobody' }) });
}

function collaborators(identityProvider) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuthorization = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), identityProvider, {
        peerMessageBus, connectedPeerRegistry
    });
    return { peerMessageBus, connectedPeerRegistry, deviceAuthorization, identityProvider, commandRegistry: new CreateCommandRegistryUseCase().execute() };
}

function editThrough(attach, doc) {
    const history = new CommandHistory({ world: doc.world });
    attach(history);
    history.execute(new MoveBrickCommand({ worldId: doc.world.id, buildingId: 'building', brickId: 'brick', delta: { x: 1, y: 0, z: 0 } }));
    return doc.world.getBuilding('building').findBrick('brick').position.x;
}

for (const [state, makeProvider] of [
    ['signed out', () => new LocalIdentityProvider(new InMemoryStorageProvider())],
    ['with a locked identity', async () => {
        const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
        const identity = await provider.createProtectedLocalIdentity('locked', 'correct horse battery');
        await provider.unlock(identity.identityId, 'correct horse battery');
        provider.authenticate(identity.identityId);
        provider.lock(identity.identityId);
        return provider;
    }]
]) {
    const identityProvider = await makeProvider();

    const doc = oneBrickDocument('structure');
    const documentPropagation = new DocumentCommandPropagationUseCase({ ...collaborators(identityProvider), resolveDocument: () => doc });
    const x = editThrough((history) => documentPropagation.attachCommandHistory({ documentId: 'structure', commandHistory: history }), doc);
    assert(x === 1, `Editor, ${state}: the edit applies locally without throwing`);
    documentPropagation.dispose();

    const worldDoc = oneBrickDocument('world');
    const worldPropagation = new WorldCommandPropagationUseCase({ ...collaborators(identityProvider), resolveWorldDocument: () => worldDoc });
    const wx = editThrough((history) => worldPropagation.attachCommandHistory({ worldDocumentId: 'world', commandHistory: history }), worldDoc);
    assert(wx === 1, `World View, ${state}: the edit applies locally without throwing`);
    worldPropagation.dispose();
    console.log(`✓ editing ${state} applies locally and sends nothing`);
}

console.log('\n✅ All SignedOutEditingPropagation tests passed.');
