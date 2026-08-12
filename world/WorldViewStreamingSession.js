import { WorldLoadState } from './WorldLoadState.js';
import { LoadedWorld } from './LoadedWorld.js';

// The runtime coordinator for the World View.
//
// Translates camera movement into spatial discovery, deduplication,
// content resolution, and placement lifecycle management. The UI
// never touches persistence, networking, or validation — it simply
// asks this session what worlds are currently loaded, discovered, or
// failed, and where they are.
//
// Hysteresis: Uses separate loadRadius and unloadRadius to prevent
// worlds from flickering in and out of existence when the camera
// hovers near a boundary.
export class WorldViewStreamingSession {
    constructor({
        discoverWorldAreaUseCase,
        resolvePublicationUseCase,
        loadRadius = 500,
        unloadRadius = 700
    }) {
        if (unloadRadius <= loadRadius) {
            throw new Error('WorldViewStreamingSession: unloadRadius must be greater than loadRadius for hysteresis');
        }
        this._discover = discoverWorldAreaUseCase;
        this._resolve = resolvePublicationUseCase;
        this._loadRadius = loadRadius;
        this._unloadRadius = unloadRadius;
        
        // placementId -> LoadedWorld
        this._runtimeWorlds = new Map();
    }

    updateView(cameraPosition) {
        // 1. Discover all placements within the UNLOAD radius.
        // We query the larger radius to manage hysteresis correctly.
        const discovered = this._discover.execute(cameraPosition, this._unloadRadius);
        const discoveredMap = new Map(discovered.map(p => [p.placementId, p]));

        // 2. Unload worlds that have crossed outside the unload radius.
        for (const [id, loaded] of this._runtimeWorlds.entries()) {
            if (!discoveredMap.has(id)) {
                loaded.state = WorldLoadState.UNLOADED;
                this._runtimeWorlds.delete(id);
            }
        }

        // 3. Process discovered placements.
        for (const [id, placement] of discoveredMap.entries()) {
            const dist2 = this._distanceSq(cameraPosition, placement.position);
            const inLoadRadius = dist2 <= this._loadRadius * this._loadRadius;
            
            let existing = this._runtimeWorlds.get(id);
            
            if (!existing) {
                // New placement discovered
                existing = new LoadedWorld({
                    placementId: placement.placementId,
                    publicationId: placement.publicationId,
                    placementRevision: placement.revision,
                    position: placement.position,
                    state: inLoadRadius ? WorldLoadState.LOADING : WorldLoadState.DISCOVERED
                });
                this._runtimeWorlds.set(id, existing);
            } else {
                // Existing placement: check for spatial revision
                if (placement.revision > existing.placementRevision) {
                    existing.placementRevision = placement.revision;
                    existing.position = placement.position;
                    // Note: In a full integration, this would emit an event
                    // to update the renderer's layout offset for this instance.
                }
            }

            // 4. State transitions
            if (inLoadRadius && (existing.state === WorldLoadState.DISCOVERED || existing.state === WorldLoadState.FAILED)) {
                this._loadWorld(placement, existing);
            } else if (!inLoadRadius && existing.state === WorldLoadState.LOADED) {
                // Moved out of load radius, but still in unload radius.
                // Drop the heavy session to save memory, keep as metadata.
                existing.session = null;
                existing.state = WorldLoadState.DISCOVERED;
            }
        }
    }

    _loadWorld(placement, loadedWorld) {
        loadedWorld.state = WorldLoadState.LOADING;
        try {
            const session = this._resolve.executeFromPlacement(placement);
            loadedWorld.session = session;
            loadedWorld.state = WorldLoadState.LOADED;
            loadedWorld.loadedAt = new Date();
            loadedWorld.error = null;
        } catch (err) {
            loadedWorld.state = WorldLoadState.FAILED;
            loadedWorld.error = err;
            loadedWorld.session = null;
        }
    }

    _distanceSq(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return dx * dx + dy * dy + dz * dz;
    }

    getRuntimeWorlds() { return Array.from(this._runtimeWorlds.values()); }
    getLoadedWorlds() { return this.getRuntimeWorlds().filter(w => w.state === WorldLoadState.LOADED); }
    getFailedWorlds() { return this.getRuntimeWorlds().filter(w => w.state === WorldLoadState.FAILED); }
    getDiscoveredWorlds() { return this.getRuntimeWorlds().filter(w => w.state === WorldLoadState.DISCOVERED); }
    
    getWorld(placementId) { return this._runtimeWorlds.get(placementId) || null; }
}
