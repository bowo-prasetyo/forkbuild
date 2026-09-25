import * as THREE from 'three';
import { ThreeBrickFactory, DEFAULT_COLOR } from './ThreeBrickFactory.js';

// Edge length of the cube of space one batch covers.
export const CHUNK_SIZE = 16;
const INITIAL_CAPACITY = 64;

// Draws a World's bricks as instances rather than one mesh each. Bricks of
// the same definition within the same CHUNK_SIZE cube of space share one
// THREE.InstancedMesh (a "chunk"), so a scene costs one draw call per
// chunk instead of one per brick, and all chunks share one material and,
// per definition, one geometry shape. Chunks are spatial so that the
// renderer's frustum culling and the raycaster's bounding-sphere test can
// skip whole regions at once: a large build stays cheap to draw and to
// pick.
//
// Per-instance state: the transform (instanceMatrix), the brick's color
// (instanceColor, multiplied into a white material) and a highlight
// (the `instanceEmissive` attribute, added to the material's emissive
// light by onBeforeCompile), so selection glows exactly as a mesh's
// material.emissive did.
//
// Also keeps brick id -> { documentId, buildingId } and answers the
// questions picking, selection and presence rendering ask about a brick,
// since a brick no longer has an Object3D of its own.
export class BrickInstanceRegistry {
    // scene: { add(object), remove(object) }, e.g. renderer/Renderer.js.
    constructor(scene, brickFactory = new ThreeBrickFactory()) {
        this._scene = scene;
        this._brickFactory = brickFactory;
        this._material = createInstancedBrickMaterial();
        // definitionId -> geometry every chunk of that definition clones.
        this._baseGeometries = new Map();
        // chunk key -> BrickChunk, and chunk mesh -> BrickChunk for picking.
        this._chunks = new Map();
        this._chunksByMesh = new Map();
        // brickId -> { documentId, buildingId, visual, chunk, index, highlight }
        this._entries = new Map();
        this._matrix = new THREE.Matrix4();
        this._color = new THREE.Color();
    }

    get size() {
        return this._entries.size;
    }

    has(brickId) {
        return this._entries.has(brickId);
    }

    // visual: { definitionId, x, y, z, rotationY (radians), color } in
    // world coordinates (see renderer/BrickRenderer.js#describe()). Adding
    // an id that is already here replaces it.
    add(brickId, documentId, buildingId, visual) {
        const previous = this._entries.get(brickId);
        const highlight = previous ? previous.highlight : 0;
        if (previous) {
            this.remove(brickId);
        }
        const entry = { documentId, buildingId, visual: { ...visual }, chunk: null, index: -1, highlight };
        this._entries.set(brickId, entry);
        this._place(brickId, entry);
    }

    // Moves, rotates or recolors a brick already here; keeps its highlight.
    update(brickId, visual) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return;
        }
        const next = { ...visual };
        if (chunkKeyOf(next) !== entry.chunk.key) {
            this._unplace(entry);
            entry.visual = next;
            this._place(brickId, entry);
            return;
        }
        entry.visual = next;
        this._write(entry);
    }

    remove(brickId) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return;
        }
        this._unplace(entry);
        this._entries.delete(brickId);
    }

    clear() {
        for (const chunk of this._chunks.values()) {
            this._disposeChunk(chunk);
        }
        this._chunks.clear();
        this._chunksByMesh.clear();
        this._entries.clear();
    }

    getDocumentId(brickId) {
        return this._entries.get(brickId)?.documentId || null;
    }

    getBuildingId(brickId) {
        return this._entries.get(brickId)?.buildingId || null;
    }

    // { x, y, z } in world coordinates, or null.
    getPosition(brickId) {
        const entry = this._entries.get(brickId);
        return entry ? { x: entry.visual.x, y: entry.visual.y, z: entry.visual.z } : null;
    }

    getRotationY(brickId) {
        const entry = this._entries.get(brickId);
        return entry ? entry.visual.rotationY : null;
    }

    getColor(brickId) {
        const entry = this._entries.get(brickId);
        return entry ? colorOf(entry.visual) : null;
    }

    // The brick's world-space bounding box, or null.
    getBounds(brickId, target = new THREE.Box3()) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return null;
        }
        const geometry = this._baseGeometry(entry.visual.definitionId);
        if (geometry.boundingBox === null) {
            geometry.computeBoundingBox();
        }
        return target.copy(geometry.boundingBox).applyMatrix4(matrixOf(entry.visual, this._matrix));
    }

    // Emissive highlight color (0xRRGGBB); 0 means none.
    setHighlight(brickId, hex) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return;
        }
        entry.highlight = hex || 0;
        entry.chunk.writeHighlight(entry.index, entry.highlight, this._color);
    }

    getHighlight(brickId) {
        return this._entries.get(brickId)?.highlight ?? null;
    }

    // Calls callback(brickId, x, y, z) for every brick, in world coordinates.
    forEachPosition(callback) {
        for (const [brickId, entry] of this._entries) {
            callback(brickId, entry.visual.x, entry.visual.y, entry.visual.z);
        }
    }

    // The objects to raycast against: one InstancedMesh per chunk.
    pickableObjects() {
        return Array.from(this._chunksByMesh.keys());
    }

    // The brick a raycaster intersection with one of pickableObjects() hit.
    brickIdForIntersection(intersection) {
        const chunk = intersection ? this._chunksByMesh.get(intersection.object) : null;
        if (!chunk || !Number.isInteger(intersection.instanceId)) {
            return null;
        }
        return chunk.brickIds[intersection.instanceId] ?? null;
    }

    // Number of chunks (draw calls) currently in the scene.
    get chunkCount() {
        return this._chunks.size;
    }

    _place(brickId, entry) {
        const key = chunkKeyOf(entry.visual);
        let chunk = this._chunks.get(key);
        if (!chunk) {
            chunk = new BrickChunk(key, this._baseGeometry(entry.visual.definitionId), this._material);
            this._chunks.set(key, chunk);
            this._chunksByMesh.set(chunk.mesh, chunk);
            this._scene.add(chunk.mesh);
        } else if (chunk.isFull) {
            this._growChunk(chunk);
        }
        entry.chunk = chunk;
        entry.index = chunk.append(brickId);
        this._write(entry);
        chunk.writeHighlight(entry.index, entry.highlight, this._color);
    }

    _unplace(entry) {
        const { chunk, index } = entry;
        const movedBrickId = chunk.removeAt(index);
        if (movedBrickId !== null) {
            this._entries.get(movedBrickId).index = index;
        }
        entry.chunk = null;
        entry.index = -1;
        if (chunk.count === 0) {
            this._chunks.delete(chunk.key);
            this._disposeChunk(chunk);
        }
    }

    _write(entry) {
        entry.chunk.writeInstance(entry.index, matrixOf(entry.visual, this._matrix), this._color.setHex(colorOf(entry.visual)));
    }

    _growChunk(chunk) {
        const oldMesh = chunk.mesh;
        chunk.grow();
        this._chunksByMesh.delete(oldMesh);
        this._chunksByMesh.set(chunk.mesh, chunk);
        this._scene.remove(oldMesh);
        this._scene.add(chunk.mesh);
        disposeMesh(oldMesh);
    }

    _disposeChunk(chunk) {
        this._chunksByMesh.delete(chunk.mesh);
        this._scene.remove(chunk.mesh);
        disposeMesh(chunk.mesh);
    }

    _baseGeometry(definitionId) {
        let geometry = this._baseGeometries.get(definitionId);
        if (!geometry) {
            geometry = this._brickFactory.createGeometry(definitionId);
            this._baseGeometries.set(definitionId, geometry);
        }
        return geometry;
    }
}

// One InstancedMesh holding the bricks of one definition in one chunk of
// space. Instances 0..count-1 are live; removing one moves the last into
// its slot, so the live ones stay contiguous.
class BrickChunk {
    constructor(key, baseGeometry, material, capacity = INITIAL_CAPACITY) {
        this.key = key;
        this._baseGeometry = baseGeometry;
        this._material = material;
        this.brickIds = [];
        this.mesh = this._createMesh(capacity);
    }

    get count() {
        return this.brickIds.length;
    }

    get isFull() {
        return this.brickIds.length >= this.mesh.instanceMatrix.count;
    }

    append(brickId) {
        this.brickIds.push(brickId);
        this.mesh.count = this.brickIds.length;
        this._boundsChanged();
        return this.brickIds.length - 1;
    }

    // Returns the id of the brick moved into `index`, or null.
    removeAt(index) {
        const last = this.brickIds.length - 1;
        let moved = null;
        if (index !== last) {
            moved = this.brickIds[last];
            this.brickIds[index] = moved;
            copyItem(this.mesh.instanceMatrix, last, index);
            copyItem(this.mesh.instanceColor, last, index);
            copyItem(this._emissive, last, index);
        }
        this.brickIds.pop();
        this.mesh.count = this.brickIds.length;
        this._boundsChanged();
        return moved;
    }

    writeInstance(index, matrix, color) {
        this.mesh.setMatrixAt(index, matrix);
        this.mesh.setColorAt(index, color);
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor.needsUpdate = true;
        this._boundsChanged();
    }

    writeHighlight(index, hex, scratchColor) {
        scratchColor.setHex(hex);
        this._emissive.setXYZ(index, scratchColor.r, scratchColor.g, scratchColor.b);
        this._emissive.needsUpdate = true;
    }

    // Replaces the mesh with one of twice the capacity, keeping every
    // instance. The caller swaps it into the scene and disposes the old one.
    grow() {
        const old = this.mesh;
        const oldEmissive = this._emissive;
        this.mesh = this._createMesh(old.instanceMatrix.count * 2);
        this.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
        this.mesh.instanceColor.array.set(old.instanceColor.array);
        this._emissive.array.set(oldEmissive.array);
        this.mesh.count = this.brickIds.length;
    }

    _createMesh(capacity) {
        // Each chunk owns its geometry: the per-instance highlight lives on
        // it, and disposing a chunk must not free buffers other chunks use.
        const geometry = this._baseGeometry.clone();
        this._emissive = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        geometry.setAttribute('instanceEmissive', this._emissive);
        const mesh = new THREE.InstancedMesh(geometry, this._material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.count = 0;
        return mesh;
    }

    _boundsChanged() {
        // Recomputed on demand by frustum culling and raycasting.
        this.mesh.boundingSphere = null;
        this.mesh.boundingBox = null;
    }
}

function createInstancedBrickMaterial() {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec3 instanceEmissive;\nvarying vec3 vInstanceEmissive;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvInstanceEmissive = instanceEmissive;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vInstanceEmissive;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vInstanceEmissive;');
    };
    material.customProgramCacheKey = () => 'forkbuild-instanced-brick';
    return material;
}

function chunkKeyOf(visual) {
    return `${visual.definitionId}|${Math.floor(visual.x / CHUNK_SIZE)},${Math.floor(visual.y / CHUNK_SIZE)},${Math.floor(visual.z / CHUNK_SIZE)}`;
}

function colorOf(visual) {
    return visual.color !== null && visual.color !== undefined ? visual.color : DEFAULT_COLOR;
}

function matrixOf(visual, target) {
    return target.makeRotationY(visual.rotationY || 0).setPosition(visual.x, visual.y, visual.z);
}

function copyItem(attribute, from, to) {
    const size = attribute.itemSize;
    attribute.array.copyWithin(to * size, from * size, from * size + size);
    attribute.needsUpdate = true;
}

function disposeMesh(mesh) {
    mesh.geometry.dispose();
    mesh.dispose();
}
