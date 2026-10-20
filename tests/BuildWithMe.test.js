import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/peer/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/peer/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/identity/DeviceAuthorizationPropagationUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SelectionUseCase } from '../application/editor/SelectionUseCase.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DeleteBrickCommand } from '../application/commands/DeleteBrickCommand.js';
import { UndoOperationCommand } from '../application/commands/SharedUndoCommands.js';
import { DocumentCommandPropagationUseCase, DocumentOperationRejectionReason } from '../application/document/DocumentCommandPropagationUseCase.js';
import { EditorSession } from '../application/editor/EditorSession.js';
import { BuildTogetherSession, BuildTogetherOutcome, BuildTogetherRole, coBuilderColor } from '../application/buildTogether/BuildTogetherSession.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Build with me in the Editor (application/buildTogether/BuildTogetherSession.js):
// a host and two guests, each a real EditorSession on a real peer stack
// (in-memory connections, real authentication), composed as
// ui/views/EditorView.js composes them. The host's build reaches each guest
// once their Editor asks, every edit either way reaches everyone, nobody
// else may edit it, and Stop ends it. The link that connects them is tested
// in WalkTogether.

const wait = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

async function connect(network, a, b) {
    const transportA = new LocalPeerConnectionProvider(`${a.label}->${b.label}`, network);
    const transportB = new LocalPeerConnectionProvider(`${b.label}<-${a.label}`, network);
    let incoming = null;
    const unsubscribe = transportB.onIncomingConnection((connection) => { incoming = connection; });
    const outgoing = transportA.connect(`${b.label}<-${a.label}`);
    await wait();
    unsubscribe();
    const sessionA = new PeerAuthenticationSession({ connection: outgoing, identityProvider: a.device.provider });
    const sessionB = new PeerAuthenticationSession({ connection: incoming, identityProvider: b.device.provider });
    sessionA.start();
    sessionB.start();
    await wait(20);
    const peerA = new ConnectedPeer({ connection: outgoing, authenticationSession: sessionA });
    const peerB = new ConnectedPeer({ connection: incoming, authenticationSession: sessionB });
    a.registry.add(peerA);
    b.registry.add(peerB);
    return { peerA, peerB };
}

// One person's Editor: the composition ui/views/EditorView.js makes, with the
// renderer left out (opening a build only swaps the document and its history).
function makeEditor(label) {
    const device = makeDevice(label);
    const bus = new PeerMessageBus();
    const registry = new ConnectedPeerRegistry();
    const deviceAuthorization = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus: bus, connectedPeerRegistry: registry });
    const documentManager = new DocumentManager();
    const editorContext = new CreateEditorContextUseCase().execute();
    let together = null;
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus: bus,
        connectedPeerRegistry: registry,
        deviceAuthorization,
        identityProvider: device.provider,
        commandRegistry: new CreateCommandRegistryUseCase().execute(),
        resolveDocument: (id) => (documentManager.document && documentManager.document.world.id === id ? documentManager.document : null),
        resolveWorldEditGrant: (documentId, identityId) => together.allows(documentId, identityId),
        shouldRelay: (documentId, command, authorIdentityId) => together.isHosting(documentId) && session.acceptsSharedStep(command, authorIdentityId)
    });
    const rejected = [];
    propagation.onOperationRejected((reason) => rejected.push(reason));
    // As ui/views/EditorView.js wires it: each friend whose edit is accepted is credited.
    propagation.onOperationReceived((documentId, command, authorIdentityId) => together.noteEdit(documentId, authorIdentityId));
    const session = new EditorSession({
        registry: new CreateBrickRegistryUseCase().execute(), editorContext, toolRegistry: null, documentManager,
        selectionUseCase: new SelectionUseCase(editorContext), previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null, identityProvider: device.provider, documentCommandPropagation: propagation
    });
    session.openDocument = (document) => {
        session._teardown();
        const copy = new Document({ world: World.fromJSON(document.world.toJSON()), metadata: document.metadata });
        documentManager.newDocument(copy);
        session._attachCommandHistory(copy.world);
    };
    together = new BuildTogetherSession({
        peerMessageBus: bus,
        connectedPeerRegistry: registry,
        resolveConnectionIdentity: (peer) => deviceAuthorization.resolveConnectionIdentity(peer),
        ownIdentityIds: () => [resolveSigningIdentityId(device.provider)],
        requestTimeoutMs: 500,
        editor: {
            openDocument: () => documentManager.document,
            appliedOperationIds: () => session.appliedOperationIds(),
            openShared: (document, operationIds) => session.openSharedDocument(document, operationIds),
            creditBuilder: (builder) => Boolean(documentManager.document && documentManager.document.metadata.creditBuilder(builder)),
            adoptCredits: (builtWith) => Boolean(documentManager.document && documentManager.document.metadata.adoptBuiltWith(builtWith)),
            notedHelped: (entry) => helped.push(entry),
            resetUndo: () => { resets.push(session.resetSharedUndo()); }
        }
    });
    const helped = [];
    const resets = [];
    return {
        label, device, bus, registry, documentManager, session, together, rejected, helped, resets,
        id: device.identity.identityId,
        get document() { return documentManager.document; },
        execute(command) { session.commandHistory.execute(command); return command; },
        bricks() { return documentManager.document.world.getBuildings().reduce((count, building) => count + building.getBricks().length, 0); }
    };
}

const DOC = 'build-doc';
const BUILDING = 'building-1';
const place = (x) => new PlaceBrickCommand({ worldId: DOC, buildingId: BUILDING, definitionId: 'core:cube', position: new Position(x, 0.5, 0) });

async function runTests() {
    const network = new LocalPeerNetwork();
    const host = makeEditor('host');
    const ana = makeEditor('ana');
    const ben = makeEditor('ben');

    const world = new World({ id: DOC });
    const building = new Building({ id: BUILDING });
    building.addBrick(new Brick({ id: 'first', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    host.session.openDocument(new Document({ world, metadata: new DocumentMetadata({ title: 'Harbor', author: 'host', authorIdentityId: host.id }) }));
    host.execute(place(1));
    host.execute(place(2));

    await connect(network, host, ana);
    await connect(network, host, ben);

    // Ana joined through the link: the host allows her, and her Editor asks.
    {
        assert(await ana.together.join({ documentId: DOC, hostIdentityId: host.id, hostName: 'Host' }) === BuildTogetherOutcome.REFUSED,
            'before the host invites anyone, asking is refused');
        assert(host.together.host(DOC) && host.together.role === BuildTogetherRole.HOST, 'the host hosts the open build');
        assert(host.together.allow(ana.id, 'Ana'), 'and allows Ana, who joined through the link');
        assert(host.together.allows(DOC, ana.id) && !host.together.allows('other', ana.id) && !host.together.allows(DOC, ben.id),
            'Ana may edit this build, not another, and nobody else may');
        const outcome = await ana.together.join({ documentId: DOC, hostIdentityId: host.id, hostName: 'Host' });
        assert(outcome === BuildTogetherOutcome.OPENED, `Ana's Editor opens the host's build (${outcome})`);
        assert(ana.document.world.id === DOC && ana.bricks() === 3 && ana.document.metadata.authorIdentityId === host.id,
            'with all three bricks, still the host\'s own build');
        assert(ana.together.isSharing() && host.together.isSharing(), 'both are building together');
        console.log('✓ a guest\'s Editor opens the host\'s build, once the host allows them');
    }

    // Edits travel both ways, each applied once, the host's following Ana's.
    {
        host.execute(place(3));
        await wait();
        assert(ana.bricks() === 4 && ana.session.getDeferredOperationIds(DOC).length === 0,
            `the host's next brick reaches Ana, though it follows edits made before she came (${ana.bricks()})`);
        const anas = ana.execute(place(4));
        await wait();
        assert(host.bricks() === 5, `Ana's brick reaches the host, who allowed her (${host.bricks()})`);
        host.execute(new MoveBrickCommand({ worldId: DOC, buildingId: BUILDING, brickId: 'first', delta: { x: 0, y: 0, z: 5 } }));
        await wait();
        assert(ana.document.world.getBuilding(BUILDING).findBrick('first').position.z === 5 && ana.session.getDeferredOperationIds(DOC).length === 0,
            'the host\'s move, which follows Ana\'s brick, applies on hers');
        await wait(30);
        assert(host.bricks() === 5 && ana.bricks() === 5, `nothing comes back twice (${host.bricks()}, ${ana.bricks()})`);
        assert(host.session.commandHistory.getExecutedCommands().some((command) => command.id === anas.id), 'Ana\'s edit is in the host\'s build');
        const credits = host.document.metadata.builtWith;
        assert(credits.length === 1 && credits[0].name === 'Ana' && credits[0].identityId === ana.id, `Ana's edit credits her on the host's build (${JSON.stringify(credits)})`);
        await wait();
        assert(ana.document.metadata.builtWith.map((entry) => entry.name).join() === 'Ana', 'Ana\'s copy follows the host\'s credits, her own included');
        assert(!ana.document.metadata.builtWith.some((entry) => entry.identityId === host.id), 'the host is the author, never credited as a co-builder');
        assert(ana.helped.length === 1 && ana.helped[0].documentId === DOC && ana.helped[0].title === 'Harbor' && ana.helped[0].authorName === 'Host' && ana.helped[0].authorIdentityId === host.id,
            `and her device notes a build she helped make (${JSON.stringify(ana.helped)})`);
        console.log('✓ edits travel both ways, each applied once, and credit who made them');
    }

    // Someone connected but not invited can't edit or get the build.
    {
        const before = host.bricks();
        ben.session.openDocument(new Document({ world: World.fromJSON(host.document.world.toJSON()), metadata: host.document.metadata }));
        ben.execute(place(9));
        await wait();
        assert(host.bricks() === before && host.rejected.includes(DocumentOperationRejectionReason.NOT_AUTHORIZED), 'an uninvited edit is refused');
        assert(await ben.together.join({ documentId: DOC, hostIdentityId: host.id }) === BuildTogetherOutcome.REFUSED, 'and so is asking for the build');
        assert(!host.document.metadata.builtWith.some((entry) => entry.identityId === ben.id), 'nor is credited');
        console.log('✓ nobody the host hasn\'t allowed can edit or fetch the build');
    }

    // A second guest: each sees the other's edits through the host.
    {
        host.together.allow(ben.id, 'Ben');
        assert(await ben.together.join({ documentId: DOC, hostIdentityId: host.id, hostName: 'Host' }) === BuildTogetherOutcome.OPENED, 'Ben joins too');
        const count = host.bricks();
        assert(ben.bricks() === count, 'with the build as it stands now');
        ana.execute(place(5));
        await wait(30);
        assert(host.bricks() === count + 1 && ben.bricks() === count + 1, `Ana's brick reaches Ben through the host (${ben.bricks()})`);
        ben.execute(place(6));
        await wait(30);
        assert(ana.bricks() === count + 2 && host.bricks() === count + 2, `and Ben's reaches Ana (${ana.bricks()})`);
        assert(host.document.metadata.builtWith.map((entry) => entry.name).join() === 'Ana,Ben', 'each friend who built is credited, in the order they did');
        assert(ana.document.metadata.builtWith.map((entry) => entry.name).join() === 'Ana,Ben' && ben.document.metadata.builtWith.map((entry) => entry.name).join() === 'Ana,Ben',
            'every copy credits everyone, though each guest\'s edits reach the other under the host\'s name');
        assert(ben.helped.some((entry) => entry.documentId === DOC), 'Ben\'s device notes it too');
        console.log('✓ co-builders see each other\'s edits through the host');
    }

    // Presence: where each points and what each has selected.
    {
        ana.together.sharePresence({ pointer: { x: 1, y: 0, z: 2 }, selection: ['first'] });
        await wait();
        const seenByHost = host.together.coBuilders().find((person) => person.identityId === ana.id);
        assert(seenByHost && seenByHost.name === 'Ana' && seenByHost.pointer.x === 1 && seenByHost.selection[0] === 'first' && seenByHost.online,
            'the host sees where Ana points and what she selected');
        assert(seenByHost.color === coBuilderColor(ana.id), 'in her own colour');
        const seenByBen = ben.together.coBuilders().find((person) => person.identityId === ana.id);
        assert(seenByBen && seenByBen.name === 'Ana' && seenByBen.pointer.z === 2, 'Ben sees her too, through the host');
        assert(!ana.together.coBuilders().some((person) => person.identityId === ana.id), 'nobody sees themselves');
        host.together.sharePresence({ pointer: { x: 'no' }, selection: [7, 'b'] });
        await wait();
        const hostSeen = ana.together.coBuilders().find((person) => person.identityId === host.id);
        assert(hostSeen.name === 'Host' && hostSeen.pointer === null && hostSeen.selection.join() === 'b', 'nonsense is dropped');
        console.log('✓ co-builders see where each other points and what each has selected');
    }

    // Undo while building together: each takes back only their own steps,
    // and every copy changes the same way.
    {
        const everyone = [host, ana, ben];
        for (const person of everyone) person.session.setSharedEditing(true);
        const brickAt = (person, x) => person.document.world.getBuilding(BUILDING).getBricks().some((brick) => brick.position.x === x);
        const same = (what) => assert(everyone.every((person) => person.bricks() === host.bricks()) && host.bricks() === what,
            `every copy has ${what} bricks (${everyone.map((person) => person.bricks())})`);
        assert(ana.resets.at(-1) === true, 'when Ben joined, Ana\'s Undo started again');
        assert(!host.session.canUndo(), 'so the host\'s steps from before Ben joined are no longer Undo\'s');
        const count = host.bricks();
        ana.execute(place(10));
        await wait(30);
        same(count + 1);
        assert(ana.session.canUndo() && ana.session.getUndoLabel(), 'Ana can take back the brick she just placed');
        assert(ana.session.undo() === true, 'and does');
        await wait(30);
        same(count);
        assert(!everyone.some((person) => brickAt(person, 10)), 'it is gone from every copy');
        assert(ana.session.canRedo() && ana.session.getRedoLabel(), 'Redo can put it back');
        assert(ana.session.redo() === true, 'and does');
        await wait(30);
        same(count + 1);
        assert(everyone.every((person) => brickAt(person, 10)), 'back on every copy');

        ben.execute(place(11));
        await wait(30);
        same(count + 2);
        assert(ben.session.undo() === true, 'Ben takes back his brick, made after Ana\'s');
        await wait(30);
        same(count + 1);
        assert(everyone.every((person) => brickAt(person, 10) && !brickAt(person, 11)), 'his, not Ana\'s');
        assert(ana.session.canUndo(), 'Ana\'s step is still hers to take back');
        console.log('✓ Undo and Redo take back your own steps on every copy');

        // Ben's copy forges an undo of Ana's brick: every copy refuses it.
        const anasBrick = ana.session.commandHistory.getExecutedCommands().find((command) => command.type === 'place-brick' && command.position.x === 10);
        const forged = ben.execute(new UndoOperationCommand({ worldId: DOC, targetId: anasBrick.id }));
        await wait(30);
        assert(!forged.applied && brickAt(ben, 10), 'Ben\'s own copy won\'t take back Ana\'s step');
        same(count + 1);
        assert(!ana.session.commandHistory.getExecutedCommands().some((command) => command.id === forged.id), 'nor does the host pass it on');
        console.log('✓ nobody\'s Undo takes back someone else\'s step');

        // Ana's step that someone changed since can't be undone: skipped everywhere.
        ana.execute(place(12));
        await wait(30);
        const twelve = host.document.world.getBuilding(BUILDING).getBricks().find((brick) => brick.position.x === 12);
        host.execute(new DeleteBrickCommand({ worldId: DOC, buildingId: BUILDING, brickId: twelve.id }));
        await wait(30);
        same(count + 1);
        assert(ana.session.undo() === false && ana.session.lastSharedStep.applied === false, 'Ana\'s Undo says it couldn\'t');
        await wait(30);
        same(count + 1);
        assert(everyone.every((person) => brickAt(person, 10) && !brickAt(person, 12)), 'and changes no copy');
        console.log('✓ a step someone changed since is skipped the same way everywhere');

        // Someone else joins: everyone's Undo starts again.
        host.execute(place(13));
        host.together.allow('did:key:z6MkSomeoneNew', 'Cy');
        await wait();
        assert(!host.session.canUndo() && !ana.session.canUndo() && !ben.session.canUndo(), 'nobody can take back a step the newcomer never had');
        assert(ana.resets.at(-1) === true, 'Ana, who lost steps by it, is told');
        for (const person of everyone) person.session.setSharedEditing(false);
        assert(ana.session.canUndo(), 'and alone again, her own Undo is back');
        console.log('✓ when someone joins, Undo starts again for everyone');
    }

    // Stop: guests are told, and may edit no more.
    {
        host.together.stopHosting();
        await wait();
        assert(ana.together.joined.ended && !ana.together.isSharing() && !host.together.allows(DOC, ana.id), 'Stop ends it for everyone');
        const before = host.bricks();
        ana.execute(place(7));
        await wait();
        assert(host.bricks() === before, 'an edit after Stop stays on Ana\'s copy');
        console.log('✓ Stop ends building together at once');
    }

    // A build that isn't the host's own is never opened as theirs.
    {
        const mallory = makeEditor('mallory');
        const victim = makeEditor('victim');
        await connect(network, mallory, victim);
        const foreign = new World({ id: 'foreign' });
        foreign.addBuilding(new Building({ id: 'b' }));
        mallory.session.openDocument(new Document({ world: foreign, metadata: new DocumentMetadata({ title: 'Not mine', authorIdentityId: victim.id }) }));
        mallory.together.host('foreign');
        mallory.together.allow(victim.id, 'Victim');
        const outcome = await victim.together.join({ documentId: 'foreign', hostIdentityId: mallory.id });
        assert(outcome === BuildTogetherOutcome.NOT_VERIFIED && victim.document?.world.id !== 'foreign', `a build claiming someone else as its owner is refused (${outcome})`);
        assert(await victim.together.join({ documentId: 'x', hostIdentityId: 'did:key:nobody' }) === BuildTogetherOutcome.NOT_CONNECTED, 'and a host who isn\'t connected is said so');
        console.log('✓ a guest only opens a build that is the host\'s own');
    }

    // A build begun before logging in has no owner; the first to share it claims it.
    {
        const unowned = new DocumentMetadata({ title: 'Mine' });
        assert(unowned.claimOwner({ author: 'ana', authorIdentityId: ana.id }) && unowned.authorIdentityId === ana.id && unowned.author === 'ana', 'an unowned build is claimed');
        assert(!unowned.claimOwner({ authorIdentityId: ben.id }) && unowned.authorIdentityId === ana.id, 'never twice');
        assert(!new DocumentMetadata({ author: 'someone' }).claimOwner({ authorIdentityId: ben.id }), 'nor one with an author named');
        console.log('✓ only a build with no owner at all can be claimed');
    }

    for (const person of [host, ana, ben]) person.together.dispose();
}

await runTests().catch((error) => {
    console.error(error);
    process.exit(1);
});
