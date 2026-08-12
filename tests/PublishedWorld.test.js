import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublishedWorldSessionUseCase } from '../application/LoadPublishedWorldSessionUseCase.js';
import { PublishedWorldSession } from '../application/PublishedWorldSession.js';
import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

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

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Published World Test', author: 'tester' })
    });
}

// ---------------------------------------------------------------------
// 1. LoadPublishedWorldSessionUseCase: happy path
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher);
    
    const doc = createTestDocument();
    const manager = { document: doc }; 
    const publication = publishUseCase.execute(manager);
    
    const session = loadUseCase.execute(publication);
    
    assert(session instanceof PublishedWorldSession, 'returns a PublishedWorldSession');
    assert(session.getDocument().world.id === doc.world.id, 'document loaded correctly');
    assert(session.getPublication().id === publication.id, 'publication attached');
    assert(session.capabilities.canEdit === false, 'canEdit is false');
    assert(session.capabilities.canNavigate === true, 'canNavigate is true');
    
    console.log('✓ LoadPublishedWorldSessionUseCase: happy path');
}

// ---------------------------------------------------------------------
// 2. Snapshot integrity: hash mismatch rejects load
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher);
    
    const doc = createTestDocument();
    const manager = { document: doc };
    const publication = publishUseCase.execute(manager);
    
    // Tamper with the snapshot
    const snapshotKey = `snapshot:${publication.id}`;
    const tamperedJson = storage.load(snapshotKey);
    tamperedJson.metadata.title = 'Tampered Title';
    storage.save(snapshotKey, tamperedJson);
    
    assertThrows(
        () => loadUseCase.execute(publication),
        'snapshot integrity check failed',
        'tampered snapshot rejected'
    );
    
    console.log('✓ Snapshot integrity: hash mismatch rejects load');
}

// ---------------------------------------------------------------------
// 3. FLAGSHIP: No mutation pathway exists on PublishedWorldSession
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher);
    
    const doc = createTestDocument();
    const manager = { document: doc };
    const publication = publishUseCase.execute(manager);
    const session = loadUseCase.execute(publication);
    
    // Explicitly verify the absence of mutation methods
    const mutationMethods = [
        'moveSelection', 'rotateSelection', 'deleteSelection',
        'alignSelection', 'distributeSelection', 'applyNumericTransform',
        'createGroupFromSelection', 'renameSelectedGroup', 'duplicateSelectedGroup',
        'deleteSelectedGroup', 'addSelectionToSelectedGroup', 'removeSelectionFromSelectedGroup',
        'copySelection', 'paste', 'undo', 'redo',
        'saveDocument', 'publishDocument'
    ];
    
    for (const method of mutationMethods) {
        assert(typeof session[method] !== 'function', `PublishedWorldSession lacks ${method}`);
    }
    
    // Selection (inspection) MUST exist and work
    assert(typeof session.selectBrick === 'function', 'selectBrick exists');
    assert(typeof session.clearSelection === 'function', 'clearSelection exists');
    assert(typeof session.getSelectionCount === 'function', 'getSelectionCount exists');
    
    const buildingId = doc.world.getBuildings()[0].id;
    const brickId = doc.world.getBuildings()[0].getBricks()[0].id;
    
    session.selectBrick(brickId, buildingId);
    assert(session.getSelectionCount() === 1, 'selection works');
    assert(session.getSpatialSelection().brickId === brickId, 'spatial selection updated');
    
    session.clearSelection();
    assert(session.getSelectionCount() === 0, 'clear selection works');
    
    console.log('✓ FLAGSHIP: No mutation pathway exists on PublishedWorldSession');
}

// ---------------------------------------------------------------------
// 4. Action Registry integration: editing actions disabled automatically
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const publisher = new LocalPublisherProvider(storage);
    const publishUseCase = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher);
    
    const doc = createTestDocument();
    const manager = { document: doc };
    const publication = publishUseCase.execute(manager);
    const session = loadUseCase.execute(publication);
    
    session.selectBrick(
        doc.world.getBuildings()[0].getBricks()[0].id,
        doc.world.getBuildings()[0].id
    );
    
    const feedback = { show: () => {} };
    const registry = new EditorActionRegistry(
        createStandardActions({ session, feedback, ui: {} })
    );
    
    const context = EditorActionContext.capture({
        session,
        selectionCount: session.getSelectionCount()
    });
    
    // Selection actions should be enabled
    assert(registry.get('selection.clear').enabled(context) === true, 'clear selection enabled');
    
    // Mutation actions must be disabled via the capability boundary
    const disabledActions = [
        'selection.delete',
        'transform.nudgeRight',
        'transform.rotateClockwise',
        'transform.alignLeft',
        'transform.distributeX',
        'group.create',
        'clipboard.copy',
        'clipboard.paste',
        'history.undo',
        'history.redo'
    ];
    
    for (const actionId of disabledActions) {
        const action = registry.get(actionId);
        assert(action !== null, `${actionId} exists in registry`);
        assert(action.enabled(context) === false, `${actionId} is disabled by capability boundary`);
    }
    
    // Attempting to execute a disabled action does nothing
    const executed = registry.execute('selection.delete', context);
    assert(executed === false, 'disabled action does not execute');
    
    console.log('✓ Action Registry integration: editing actions disabled automatically');
}

console.log('\nAll published world tests passed.');
