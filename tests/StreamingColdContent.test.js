import { worldStreamingMethods } from '../application/worldNavigation/worldStreamingMethods.js';
import { StorageEntryNotLoadedError } from '../storage/StorageEntryNotLoadedError.js';
import { World } from '../core/World.js';
import { assert } from './support/Assert.js';

// World View streaming and published content kept on disk: a world whose
// content is still being read is neither loaded nor counted as a failure,
// and a later refresh loads it. Streaming itself stays synchronous.

// The real _loadWorld() over a stubbed _resolveWorldDocument().
function streamingSession(resolve) {
    const session = Object.assign(Object.create(worldStreamingMethods), {
        _spatialCameraController: { getSpatialCameraState: () => ({ position: { x: 0, y: 0, z: 0 } }) },
        _worldLayoutProvider: { findVisibleDocuments: () => ['doc-1'], getPosition: () => ({ x: 0, y: 0, z: 0 }) },
        _loadedDocuments: new Map(),
        _localOnlyDocumentIds: new Set(),
        _failedLoads: new Map(),
        isDocumentDirty: () => false,
        _unloadWorld: (id) => session._loadedDocuments.delete(id),
        _refreshGizmo: () => {},
        _getFailedIds: () => [...session._failedLoads.keys()],
        _publishedDocumentIds: new Set(),
        _isKnownPublication: () => true,
        _commandHistories: new Map(),
        _registerCommandHistory: (id, history) => session._commandHistories.set(id, history)
    });
    session._session = { addWorld: () => {} };
    session._resolveWorldDocument = (id) => resolve(session, id);
    return session;
}

{
    let loaded = false;
    let calls = 0;
    const session = streamingSession(() => {
        calls++;
        if (!loaded) {
            throw new StorageEntryNotLoadedError('content:x', Promise.resolve('content'));
        }
        return { document: { world: new World() }, isMaterializedPublication: true };
    });
    const first = session.updateSpatialView();
    assert(first.loaded.length === 0 && first.failed.length === 0, 'a world whose content is on disk is neither loaded nor failed');
    session.updateSpatialView();
    assert(calls === 2 && session._failedLoads.size === 0, 'the next refresh simply tries again, still without a failure');
    loaded = true;
    const later = session.updateSpatialView();
    assert(later.loaded.includes('doc-1') && session._publishedDocumentIds.has('doc-1'), 'once the content is in memory, a refresh loads the world');
    console.log('✓ streaming skips worlds whose content is still on disk, and loads them later');
}

{
    const session = streamingSession(() => { throw new Error('corrupt'); });
    const originalWarn = console.warn;
    console.warn = () => {};
    const result = session.updateSpatialView();
    console.warn = originalWarn;
    assert(result.failed.includes('doc-1'), 'any other error is still a failed load, as before');
    console.log('✓ other load errors are unchanged');
}
