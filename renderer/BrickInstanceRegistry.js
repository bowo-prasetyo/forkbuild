import * as THREE from 'three';
import { ThreeBrickFactory, DEFAULT_COLOR } from './ThreeBrickFactory.js';
import { doorSwingOffset } from '../core/building/DoorSwing.js';
import { castShadows } from './ShadowRoles.js';
import { applyBrickSurface, withBrickBounds } from './BrickSurfaceMaterial.js';
import { BRICK_WET, createWetSurfaces, makeWet, setSnowCover, setWetShelter, setWetness } from './WetSurfaces.js';
import { brickSurfaceOf } from '../core/building/BrickSurface.js';

// Edge length of the cube of space one batch covers.
export const CHUNK_SIZE = 16;
const INITIAL_CAPACITY = 64;

// Draws a World's bricks as instances rather than one mesh each. Bricks of
// the same definition within the same CHUNK_SIZE cube of space share one
// THREE.InstancedMesh (a "chunk"), so a scene costs one draw call per
// chunk instead of one per brick, and all chunks of one surface (masonry,
// wood, tiles…; core/building/BrickSurface.js, renderer/BrickSurfaceMaterial.js)
// share one material and, per definition, one geometry shape. Chunks are spatial so that the
// renderer's frustum culling and the raycaster's bounding-sphere test can
// skip whole regions at once: a large build stays cheap to draw and to
// pick.
//
// Per-instance state: the transform (instanceMatrix), the brick's color
// (instanceColor, multiplied into a white material) and a highlight
// (the `instanceEmissive` attribute, added to the material's emissive
// light by onBeforeCompile), so selection glows exactly as a mesh's
// material.emissive did. Bricks that shine after dark (core/nature/NightGlow.js)
// carry their light in `instanceGlow`, scaled by one strength the whole
// registry shares (setNightGlow()), so night falls with one uniform.
//
// Also keeps brick id -> { documentId, buildingId } and answers the
// questions picking, selection and presence rendering ask about a brick,
// since a brick no longer has an Object3D of its own.
export class BrickInstanceRegistry {
    // scene: { add(object), remove(object) }, e.g. renderer/Renderer.js.
    constructor(scene, brickFactory = new ThreeBrickFactory()) {
        this._scene = scene;
        this._brickFactory = brickFactory;
        this._nightGlow = { value: 0 };
        // How wet the bricks are in the rain (renderer/WetSurfaces.js).
        this._wetSurfaces = createWetSurfaces();
        // surface -> material, made the first time a brick of it is drawn.
        this._materials = new Map();
        this._cutaway = null;
        // definitionId -> geometry every chunk of that definition clones.
        this._baseGeometries = new Map();
        // chunk key -> BrickChunk, and chunk mesh -> BrickChunk for picking.
        this._chunks = new Map();
        this._chunksByMesh = new Map();
        // brickId -> { documentId, buildingId, visual, chunk, index, highlight, swing }
        this._entries = new Map();
        // definitionId -> Set of brickIds, so the few bricks of one kind
        // (World View's doors, renderer/DoorSwingAnimator.js) are found
        // without walking every brick each frame.
        this._idsByDefinition = new Map();
        this._matrix = new THREE.Matrix4();
        this._color = new THREE.Color();
    }

    get size() {
        return this._entries.size;
    }

    // Lets every brick drawn here be cut away (renderer/CutawayClipping.js).
    useCutaway(cutawayClipping) {
        if (!cutawayClipping) return;
        this._cutaway = cutawayClipping;
        for (const material of this._materials.values()) cutawayClipping.apply(material);
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
        const entry = { documentId, buildingId, visual: { ...visual }, chunk: null, index: -1, highlight, swing: 0 };
        this._entries.set(brickId, entry);
        this._indexDefinition(brickId, entry.visual.definitionId);
        this._place(brickId, entry);
    }

    // Moves, rotates or recolors a brick already here; keeps its highlight
    // and how far it is swung open.
    update(brickId, visual) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return;
        }
        const next = { ...visual };
        if (next.definitionId !== entry.visual.definitionId) {
            this._unindexDefinition(brickId, entry.visual.definitionId);
            this._indexDefinition(brickId, next.definitionId);
        }
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
        this._unindexDefinition(brickId, entry.visual.definitionId);
        this._entries.delete(brickId);
    }

    clear() {
        for (const chunk of this._chunks.values()) {
            this._disposeChunk(chunk);
        }
        this._chunks.clear();
        this._chunksByMesh.clear();
        this._entries.clear();
        this._idsByDefinition.clear();
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
        return target.copy(geometry.boundingBox).applyMatrix4(matrixOfEntry(entry, this._matrix));
    }

    // The ids of the bricks of `definitionId` here (a live set: copy it
    // before adding or removing bricks while going through it).
    brickIdsOf(definitionId) {
        return this._idsByDefinition.get(definitionId) || EMPTY_IDS;
    }

    // The brick's middle, turn (radians) and definition, in world
    // coordinates, or null.
    getVisual(brickId) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return null;
        }
        const { definitionId, x, y, z, rotationX, rotationY } = entry.visual;
        return { definitionId, x, y, z, rotationX: rotationX || 0, rotationY: rotationY || 0 };
    }

    // Swings a door open `angle` radians about its hinge
    // (core/building/DoorSwing.js), 0 to close it; `width` is the door's. Only how it
    // is drawn and picked changes, never where the brick is.
    setSwing(brickId, angle, width) {
        const entry = this._entries.get(brickId);
        if (!entry) {
            return;
        }
        const next = Number.isFinite(angle) ? angle : 0;
        if (next === entry.swing && width === entry.swingWidth) {
            return;
        }
        entry.swing = next;
        entry.swingWidth = width;
        this._write(entry);
    }

    getSwing(brickId) {
        return this._entries.get(brickId)?.swing ?? null;
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

    // How strongly bricks that shine after dark shine, from 0 (by day) to 1
    // (at night).
    setNightGlow(strength) {
        this._nightGlow.value = Number.isFinite(strength) ? Math.min(Math.max(strength, 0), 1) : 0;
    }

    get nightGlow() {
        return this._nightGlow.value;
    }

    // How wet the bricks are, 0 (dry) to 1 (soaked), and the build the
    // avatar stands in, whose room stays dry (renderer/WetSurfaces.js).
    setWetness(wetness) {
        setWetness(this._wetSurfaces, wetness);
    }

    setWetShelter(shelter) {
        setWetShelter(this._wetSurfaces, shelter);
    }

    get wetness() {
        return this._wetSurfaces.wetness.value;
    }

    // How much snow lies on the bricks' tops, 0 to 1 (renderer/WetSurfaces.js).
    setSnowCover(cover) {
        setSnowCover(this._wetSurfaces, cover);
    }

    get snowCover() {
        return this._wetSurfaces.snowCover.value;
    }

    // The light the brick gives off at full night (0xRRGGBB), 0 for none, or
    // null when it isn't here.
    getGlow(brickId) {
        const entry = this._entries.get(brickId);
        return entry ? (entry.visual.glow || 0) : null;
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
            chunk = new BrickChunk(key, this._baseGeometry(entry.visual.definitionId), this._materialFor(entry.visual));
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
        entry.chunk.writeInstance(entry.index, matrixOfEntry(entry, this._matrix), this._color.setHex(colorOf(entry.visual)));
        entry.chunk.writeGlow(entry.index, entry.visual.glow || 0, this._color);
    }

    _indexDefinition(brickId, definitionId) {
        let ids = this._idsByDefinition.get(definitionId);
        if (!ids) {
            ids = new Set();
            this._idsByDefinition.set(definitionId, ids);
        }
        ids.add(brickId);
    }

    _unindexDefinition(brickId, definitionId) {
        const ids = this._idsByDefinition.get(definitionId);
        if (!ids) {
            return;
        }
        ids.delete(brickId);
        if (ids.size === 0) {
            this._idsByDefinition.delete(definitionId);
        }
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

    // The material every chunk of this brick's surface shares.
    _materialFor(visual) {
        const surface = surfaceOfVisual(visual);
        let material = this._materials.get(surface);
        if (!material) {
            material = makeWet(applyBrickSurface(createInstancedBrickMaterial(this._nightGlow), surface), this._wetSurfaces, BRICK_WET);
            if (this._cutaway) this._cutaway.apply(material);
            this._materials.set(surface, material);
        }
        return material;
    }

    _baseGeometry(definitionId) {
        let geometry = this._baseGeometries.get(definitionId);
        if (!geometry) {
            geometry = withBrickBounds(this._brickFactory.createGeometry(definitionId));
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
            copyItem(this._glow, last, index);
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

    writeGlow(index, hex, scratchColor) {
        scratchColor.setHex(hex);
        this._glow.setXYZ(index, scratchColor.r, scratchColor.g, scratchColor.b);
        this._glow.needsUpdate = true;
    }

    // Replaces the mesh with one of twice the capacity, keeping every
    // instance. The caller swaps it into the scene and disposes the old one.
    grow() {
        const old = this.mesh;
        const oldEmissive = this._emissive;
        const oldGlow = this._glow;
        this.mesh = this._createMesh(old.instanceMatrix.count * 2);
        this.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
        this.mesh.instanceColor.array.set(old.instanceColor.array);
        this._emissive.array.set(oldEmissive.array);
        this._glow.array.set(oldGlow.array);
        this.mesh.count = this.brickIds.length;
    }

    _createMesh(capacity) {
        // Each chunk owns its geometry: the per-instance highlight lives on
        // it, and disposing a chunk must not free buffers other chunks use.
        const geometry = this._baseGeometry.clone();
        this._emissive = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        geometry.setAttribute('instanceEmissive', this._emissive);
        this._glow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        geometry.setAttribute('instanceGlow', this._glow);
        const mesh = new THREE.InstancedMesh(geometry, this._material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.count = 0;
        castShadows(mesh, { receive: true });
        return mesh;
    }

    _boundsChanged() {
        // Recomputed on demand by frustum culling and raycasting.
        this.mesh.boundingSphere = null;
        this.mesh.boundingBox = null;
    }
}

// nightGlow: { value }, the uniform setNightGlow() changes.
function createInstancedBrickMaterial(nightGlow) {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uNightGlow = nightGlow;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec3 instanceEmissive;\nattribute vec3 instanceGlow;\nvarying vec3 vInstanceEmissive;\nvarying vec3 vInstanceGlow;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvInstanceEmissive = instanceEmissive;\n\tvInstanceGlow = instanceGlow;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uNightGlow;\nvarying vec3 vInstanceEmissive;\nvarying vec3 vInstanceGlow;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vInstanceEmissive + vInstanceGlow * uNightGlow;');
    };
    material.customProgramCacheKey = () => 'forkbuild-instanced-brick';
    return material;
}

// A chunk holds one definition drawn with one surface (a cube's depends on its colour).
function chunkKeyOf(visual) {
    return `${visual.definitionId}|${surfaceOfVisual(visual)}|${Math.floor(visual.x / CHUNK_SIZE)},${Math.floor(visual.y / CHUNK_SIZE)},${Math.floor(visual.z / CHUNK_SIZE)}`;
}

function surfaceOfVisual(visual) {
    return brickSurfaceOf(visual.definitionId, colorOf(visual));
}

function colorOf(visual) {
    return visual.color !== null && visual.color !== undefined ? visual.color : DEFAULT_COLOR;
}

// The brick's turn and tilt (Euler 'YXZ', core/building/BrickOrientation.js), then its position.
const _orientation = new THREE.Euler(0, 0, 0, 'YXZ');
function matrixOf(visual, target) {
    _orientation.set(visual.rotationX || 0, visual.rotationY || 0, 0, 'YXZ');
    return target.makeRotationFromEuler(_orientation).setPosition(visual.x, visual.y, visual.z);
}

// matrixOf(), with a door swung about its hinge (setSwing()).
function matrixOfEntry(entry, target) {
    const { visual, swing } = entry;
    if (!swing) {
        return matrixOf(visual, target);
    }
    const offset = doorSwingOffset(entry.swingWidth || 0, visual.rotationY || 0, swing);
    _orientation.set(visual.rotationX || 0, (visual.rotationY || 0) + swing, 0, 'YXZ');
    return target.makeRotationFromEuler(_orientation).setPosition(visual.x + offset.x, visual.y, visual.z + offset.z);
}

const EMPTY_IDS = Object.freeze(new Set());

function copyItem(attribute, from, to) {
    const size = attribute.itemSize;
    attribute.array.copyWithin(to * size, from * size, from * size + size);
    attribute.needsUpdate = true;
}

function disposeMesh(mesh) {
    mesh.geometry.dispose();
    mesh.dispose();
}
