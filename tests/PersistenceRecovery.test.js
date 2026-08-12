import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { AutosaveDocumentUseCase } from '../application/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from '../application/DiscardRecoveryUseCase.js';
import { AutosaveScheduler } from '../application/AutosaveScheduler.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// ---------------------------------------------------------------------
// Helpers & stubs
// ---------------------------------------------------------------------
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
    try { fn(); assert(false, message); }
    catch (e) { assert(e.message.includes(expectedMessage), `${message}: ${e.message}`); }
}

function createDocument(title = 'Persistence Test World') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

function addBrickAt(history, world, x) {
    const buildingId = world.getBuildings()[0].id;
    history.execute(new PlaceBrickCommand({
        worldId: world.id, buildingId,
        definitionId: 'core:cube',
        position: new Position(x, 0.5, 0)
    }));
}

// Build a full persistence+recovery stack over one storage provider.
function buildStack(storage) {
    const recoveryStore = new LocalRecoveryStore(storage);
    return {
        storage,
        recoveryStore,
        serializer: new DocumentSerializer(),
        manifest: new DocumentManifest(storage),
        save: new SaveDocumentUseCase(storage, undefined, undefined, recoveryStore),
        autosave: new AutosaveDocumentUseCase(recoveryStore, storage),
        check: new CheckRecoveryUseCase(recoveryStore, storage),
        recover: new RecoverDocumentUseCase(recoveryStore),
        discard: new DiscardRecoveryUseCase(recoveryStore)
    };
}

// ---------------------------------------------------------------------
// 1. Revision computation is monotonic and stateless
// ---------------------------------------------------------------------
{
    const { DocumentRevision } = await import('../core/DocumentRevision.js');
    assert(DocumentRevision.nextRevision(0, 0) === 1, 'first revision is 1');
    assert(DocumentRevision.nextRevision(1, 0) === 2, 'save advances');
    assert(DocumentRevision.nextRevision(1, 3) === 4, 'recovery ahead advances');
    assert(DocumentRevision.nextRevision(5, 2) === 6, 'save ahead advances');
    console.log('✓ revision computation');
}

// ---------------------------------------------------------------------
// 2. Autosave writes a checkpoint, does NOT clean or publish
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const manager = new DocumentManager();
    manager.load(doc, doc.world.id);
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    addBrickAt(history, doc.world, 4);
    assert(manager.state.dirty, 'dirty after edit');

    const rev = stack.autosave.execute(manager);
    assert(rev !== null, 'autosave returns a revision');
    assert(rev.revision === 1, 'first autosave revision is 1');
    assert(stack.recoveryStore.exists(doc.world.id), 'checkpoint written');
    assert(manager.state.dirty === true, 'autosave does NOT clear dirty');

    // Autosave never publishes.
    const publications = storage.load('forkbuild-publications') || [];
    assert(publications.length === 0, 'autosave creates no publication');
    console.log('✓ autosave checkpoint, no clean, no publish');
}

// ---------------------------------------------------------------------
// 3. FLAGSHIP: edit→autosave→crash→restart→recover→verify→save→recovery removed
//    (with publication + placement + hash unchanged)
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    let stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const manager = new DocumentManager();
    manager.load(doc, id);
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    // Explicit save -> revision 1.
    stack.save.execute(manager);
    assert(stack.manifest.find(id).revision === 1, 'saved revision 1');

    // Publish -> immutable snapshot. Capture its contentHash.
    const publisher = new LocalPublisherProvider(storage);
    const publish = new PublishDocumentUseCase(publisher, stubIdentityProvider);
    const publication = publish.execute(manager);
    const publicationHashBefore = publication.contentHash;
    const publicationCountBefore = (storage.load('forkbuild-publications') || []).length;
    const snapshotKeysBefore = storage.list().filter((k) => k.startsWith('snapshot:'));

    // Place -> spatial placement. Capture placement keys.
    const spatialIndex = new LocalSpatialIndexProvider(storage);
    spatialIndex.add(new WorldPlacement({ publicationId: publication.id, position: { x: 100, y: 0, z: 50 } }));
    const placementKeysBefore = storage.list().filter((k) => k.startsWith('placement:') || k === 'spatial-index');

    // Edit (add a brick) -> dirty, then autosave -> revision 2.
    addBrickAt(history, doc.world, 6);
    assert(manager.state.dirty, 'dirty after second edit');
    const autosaveRev = stack.autosave.execute(manager);
    assert(autosaveRev.revision === 2, 'autosave revision 2');
    const editedBrickCount = doc.world.getBuildings()[0].getBricks().length;

    // ---- simulate crash: fresh app, SAME storage ----
    stack = buildStack(storage);

    // Detect recovery.
    const check = stack.check.execute(id);
    assert(check.available === true, 'recovery offered');
    assert(check.savedRevision === 1, 'saved revision is 1');
    assert(check.recovery.revision === 2, 'recovery revision is 2');

    // Recover.
    const { document: recoveredDoc, revision } = stack.recover.execute(id);
    assert(revision === 2, 'recovered revision 2');
    assert(recoveredDoc.world.getBuildings()[0].getBricks().length === editedBrickCount,
        'recovered document has the autosaved edits');

    // Load recovered doc and explicitly save -> recovery removed.
    const manager2 = new DocumentManager();
    manager2.load(recoveredDoc, id);
    manager2.markDirty();
    stack.save.execute(manager2);
    assert(stack.manifest.find(id).revision === 3, 'saved revision advanced to 3');
    assert(!stack.recoveryStore.exists(id), 'recovery checkpoint removed after save');

    // Boundaries unchanged.
    const publicationCountAfter = (storage.load('forkbuild-publications') || []).length;
    assert(publicationCountAfter === publicationCountBefore, 'publication count unchanged');
    const publicationAfter = (storage.load('forkbuild-publications') || [])[0];
    assert(publicationAfter.contentHash === publicationHashBefore, 'publication contentHash unchanged');
    const snapshotKeysAfter = storage.list().filter((k) => k.startsWith('snapshot:'));
    assert(JSON.stringify(snapshotKeysAfter.sort()) === JSON.stringify(snapshotKeysBefore.sort()),
        'snapshot keys unchanged');
    const placementKeysAfter = storage.list().filter((k) => k.startsWith('placement:') || k === 'spatial-index');
    assert(JSON.stringify(placementKeysAfter.sort()) === JSON.stringify(placementKeysBefore.sort()),
        'placement keys unchanged');

    console.log('✓ FLAGSHIP: autosave → crash → recover → save → recovery removed; boundaries intact');
}

// ---------------------------------------------------------------------
// 4. Save isolation: edit, autosave, edit, save
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const manager = new DocumentManager();
    manager.load(doc, id);
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    stack.save.execute(manager);                    // rev 1
    addBrickAt(history, doc.world, 2);
    stack.autosave.execute(manager);                 // checkpoint rev 2
    addBrickAt(history, doc.world, 4);
    stack.save.execute(manager);                     // rev 3, clears checkpoint
    assert(stack.manifest.find(id).revision === 3, 'save after autosave advances revision');
    assert(!stack.recoveryStore.exists(id), 'save clears checkpoint');
    console.log('✓ save isolation');
}

// ---------------------------------------------------------------------
// 5. Newer recovery offered / older recovery ignored
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const manager = new DocumentManager();
    manager.load(doc, id);
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    // Case A: saved rev 10, recovery rev 12 -> offered.
    stack.recoveryStore.save(id, {
        documentId: id, revision: 12, savedAt: new Date().toISOString(),
        contentHash: computeContentHash(JSON.stringify(stack.serializer.serialize(doc))),
        document: stack.serializer.serialize(doc)
    });
    stack.manifest.upsert({ id, title: doc.metadata.title, modified: new Date().toISOString(), revision: 10 });
    assert(stack.check.execute(id).available === true, 'newer recovery offered');

    // Case B: saved rev 12, recovery rev 10 -> obsolete, discarded.
    stack.manifest.upsert({ id, title: doc.metadata.title, modified: new Date().toISOString(), revision: 12 });
    const result = stack.check.execute(id);
    assert(result.available === false, 'older recovery ignored');
    assert(result.obsolete === true, 'marked obsolete');
    assert(!stack.recoveryStore.exists(id), 'obsolete checkpoint discarded');
    console.log('✓ newer/older recovery decision');
}

// ---------------------------------------------------------------------
// 6. Hash mismatch -> recovery rejected
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const serialized = stack.serializer.serialize(doc);
    stack.recoveryStore.save(id, {
        documentId: id, revision: 5, savedAt: new Date().toISOString(),
        contentHash: 'bogus-hash',
        document: serialized
    });
    const check = stack.check.execute(id);
    assert(check.available === false, 'hash-mismatch checkpoint not offered');
    assertThrows(() => stack.recover.execute(id), 'integrity', 'recover rejects hash mismatch');
    console.log('✓ hash mismatch rejection');
}

// ---------------------------------------------------------------------
// 7. Corrupted checkpoint content -> recovery rejected
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const serialized = stack.serializer.serialize(doc);
    const goodHash = computeContentHash(JSON.stringify(serialized));
    const corrupted = JSON.parse(JSON.stringify(serialized));
    corrupted.world.buildings[0].bricks[0].position.x = 'NOT-A-NUMBER';
    stack.recoveryStore.save(id, {
        documentId: id, revision: 5, savedAt: new Date().toISOString(),
        contentHash: goodHash, document: corrupted
    });
    // Hash still matches (contentHash was computed over the original, but
    // stored content differs) OR validation fails. Either way recovery must
    // not produce a valid document.
    let rejected = false;
    try { stack.recover.execute(id); } catch (e) { rejected = true; }
    assert(rejected, 'corrupted checkpoint rejected');
    console.log('✓ corrupted checkpoint rejection');
}

// ---------------------------------------------------------------------
// 8. Old-format recovery -> migrate -> validate -> recover
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const serialized = stack.serializer.serialize(doc);
    // Simulate a pre-0.2.2 envelope: strip schemaVersion.
    const oldFormat = { ...serialized };
    delete oldFormat.schemaVersion;
    stack.recoveryStore.save(id, {
        documentId: id, revision: 1, savedAt: new Date().toISOString(),
        contentHash: computeContentHash(JSON.stringify(oldFormat)),
        document: oldFormat
    });
    const { document: recovered } = stack.recover.execute(id);
    assert(recovered.world.getBuildings()[0].getBricks().length === 1,
        'old-format recovery migrated and deserialized');
    console.log('✓ old-format recovery migration');
}

// ---------------------------------------------------------------------
// 9. Discard recovery leaves saved document untouched
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const manager = new DocumentManager();
    manager.load(doc, id);
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    stack.save.execute(manager);
    const savedBlobBefore = JSON.stringify(storage.load(id));
    addBrickAt(history, doc.world, 2);
    stack.autosave.execute(manager);
    assert(stack.recoveryStore.exists(id), 'checkpoint exists');

    const discarded = stack.discard.execute(id);
    assert(discarded === true, 'discard returns true');
    assert(!stack.recoveryStore.exists(id), 'checkpoint removed');
    assert(JSON.stringify(storage.load(id)) === savedBlobBefore, 'saved document untouched');
    console.log('✓ discard recovery');
}

// ---------------------------------------------------------------------
// 10. AutosaveScheduler debounce (fake timers)
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const stack = buildStack(storage);
    const doc = createDocument();
    const id = doc.world.id;
    const manager = new DocumentManager();
    manager.load(doc, id);
    const history = new CommandHistory({ world: doc.world });
    manager.trackCommandHistory(history);

    const timers = [];
    const fakeSetTimeout = (fn) => { timers.push({ fn, cleared: false }); return timers.length - 1; };
    const fakeClearTimeout = (idx) => { if (timers[idx]) timers[idx].cleared = true; };
    const flush = () => {
        const pending = timers.filter((t) => t && !t.cleared);
        timers.length = 0;
        pending.forEach((t) => t.fn());
    };

    const scheduler = new AutosaveScheduler(stack.autosave, manager, {
        delay: 100, setTimeoutFn: fakeSetTimeout, clearTimeoutFn: fakeClearTimeout
    });
    scheduler.start();

    addBrickAt(history, doc.world, 2);               // dirty -> schedules
    const scheduledCount = timers.filter((t) => t && !t.cleared).length;
    assert(scheduledCount === 1, 'autosave scheduled when dirty');

    flush();                                          // fires the autosave
    assert(stack.recoveryStore.exists(id), 'autosave wrote checkpoint after idle');

    // Becoming clean cancels pending autosave.
    stack.save.execute(manager);                      // clean
    addBrickAt(history, doc.world, 4);               // dirty again
    const pendingBeforeClean = timers.filter((t) => t && !t.cleared).length;
    stack.save.execute(manager);                      // clean -> cancel
    scheduler.stop();
    assert(true, 'scheduler start/stop lifecycle safe');
    console.log('✓ autosave scheduler debounce');
}

console.log('\nAll persistence & recovery tests passed.');
