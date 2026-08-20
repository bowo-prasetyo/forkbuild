import { tilesWithinRadius, tileKey, TERRAIN_TILE_SIZE, DEFAULT_STREAMING_RADIUS } from '../core/TerrainTiling.js';

// Keeps a ring of terrain tiles loaded around wherever the camera
// currently is, so the ground is never missing beneath it no matter how
// far World View has been navigated — see docs/Roadmap.md, 0.2.76: "the
// active camera always has a deterministic, visible ground
// representation beneath the world." Owns ONLY the load/unload DECISION
// and bookkeeping; building the actual Three.js geometry for one tile is
// renderer/TerrainTileMesh.js's job, injected here as `tileFactory` —
// the same core-decides/renderer-glue split renderer/WorldRenderer.js
// already uses for bricks (see its own header), which is what makes
// this class fully unit-testable with a fake sink/factory instead of a
// real Three.js scene (see tests/WorldGroundTerrain.test.js).
export class TerrainStreamingController {
    constructor(sink, tileFactory, {
        tileSize = TERRAIN_TILE_SIZE,
        streamingRadius = DEFAULT_STREAMING_RADIUS,
        // A camera drifting by a fraction of a tile every frame (hand
        // jitter, OrbitControls damping/inertia) would otherwise re-run
        // the full tile diff every single frame for no visible change —
        // recompute only once the camera has actually moved far enough
        // to plausibly change which tiles belong in the ring.
        updateThreshold = tileSize / 4
    } = {}) {
        this._sink = sink;
        this._tileFactory = tileFactory;
        this._tileSize = tileSize;
        this._streamingRadius = streamingRadius;
        this._updateThreshold = updateThreshold;
        this._loadedTiles = new Map(); // tileKey -> { tx, tz, object }
        this._lastUpdateX = null;
        this._lastUpdateZ = null;
    }

    get loadedTileCount() {
        return this._loadedTiles.size;
    }

    isTileLoaded(tx, tz) {
        return this._loadedTiles.has(tileKey(tx, tz));
    }

    // Recomputes the desired tile ring around (cameraX, cameraZ) and
    // loads/unloads exactly the difference against what's currently
    // loaded — never a full rebuild. `force` bypasses the movement
    // threshold: used for the very first call (there is nothing to diff
    // against yet) and by tests that want a deterministic tile set
    // regardless of how far a synthetic "previous" camera position was.
    update(cameraX, cameraZ, force = false) {
        if (!force && this._lastUpdateX !== null) {
            const dx = cameraX - this._lastUpdateX;
            const dz = cameraZ - this._lastUpdateZ;
            if (dx * dx + dz * dz < this._updateThreshold * this._updateThreshold) {
                return;
            }
        }
        this._lastUpdateX = cameraX;
        this._lastUpdateZ = cameraZ;

        const desired = tilesWithinRadius(cameraX, cameraZ, this._streamingRadius, this._tileSize);
        const desiredKeys = new Set(desired.map(({ tx, tz }) => tileKey(tx, tz)));

        for (const [key, entry] of this._loadedTiles) {
            if (!desiredKeys.has(key)) {
                this._sink.remove(entry.object);
                this._loadedTiles.delete(key);
            }
        }
        for (const { tx, tz } of desired) {
            const key = tileKey(tx, tz);
            if (this._loadedTiles.has(key)) {
                continue;
            }
            const object = this._tileFactory(tx, tz);
            this._sink.add(object);
            this._loadedTiles.set(key, { tx, tz, object });
        }
    }

    dispose() {
        for (const entry of this._loadedTiles.values()) {
            this._sink.remove(entry.object);
        }
        this._loadedTiles.clear();
        this._lastUpdateX = null;
        this._lastUpdateZ = null;
    }
}
