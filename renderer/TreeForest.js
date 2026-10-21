import * as THREE from 'three';
import { naturalFeaturesInRegion, FEATURE_TYPE, TREE_SPECIES } from '../core/nature/NaturalFeatureField.js';
import { treeCollisionCircleFor } from '../core/nature/TreeCollisionGeometry.js';
import { TERRAIN_TILE_SIZE } from '../core/nature/TerrainTiling.js';
import { treeForm, treeShapeOf, TREE_FORMS_PER_SPECIES } from '../core/nature/TreeForm.js';
import { buildTreeGeometries } from './TreeGeometry.js';
import { createTreeMaterials, createTreeWind, disposeTreeMaterials } from './TreeMaterials.js';
import { makeWet } from './WetSurfaces.js';
import {
    DECIDUOUS, TREE_PART, makeSeasonalTree, seasonedTreeColour, setTreeSeasonFlags, treeNumbers, treeSeasonFlags, treeSeasonOf
} from './SeasonalSurfaces.js';

// Every tree World View draws. Trees are streamed by terrain tile
// (renderer/TerrainStreamingController.js calls loadTile()/unloadTile()), but
// drawn from one pool: each form of each species (core/nature/TreeForm.js) has one
// InstancedMesh per part per level of detail, shared by every tile, so the
// draw calls stay at a few dozen however many trees are in view.
//
// Which level each tree is drawn at is decided on the CPU, by its distance
// from the camera (treeLodAt()), and re-decided only once the camera has
// moved or turned enough to matter (REBUCKET_METRES, REBUCKET_DEGREES).
// Only trees inside a slightly widened view get their level. Of the rest,
// the ones close enough to shade what is in view are drawn as the solid mid
// shapes, which still cast shadows; farther ones are skipped. So every leaf
// drawn is one that can be seen, and the shadow pass, which draws every
// caster, only meets full detail where it shows.
//
// The detail is this device's choice (application/settings/WorldViewTreeDetailStore.js):
// HIGH draws near trees with every branch and leaf, which costs a phone the
// most in leaf cards drawn over each other; LOW never does, drawing the solid
// mid-distance shapes close by instead.

export const TREE_DETAIL = Object.freeze({ HIGH: 'HIGH', LOW: 'LOW' });
export const TREE_LOD = Object.freeze({ NEAR: 'NEAR', MID: 'MID', FAR: 'FAR' });

// Up to how far, in metres from the camera, each level is drawn; FAR beyond.
// HIGH's near range matches the sun's shadows (renderer/SunShadows.js), so
// the trees that cast detailed shadows are the detailed ones.
export const TREE_LOD_DISTANCES = Object.freeze({
    [TREE_DETAIL.HIGH]: Object.freeze({ near: 45, mid: 100 }),
    [TREE_DETAIL.LOW]: Object.freeze({ near: 0, mid: 40 })
});

const REBUCKET_METRES = 2;
const REBUCKET_DEGREES = 8;
const MIN_CAPACITY = 64;

export function treeLodAt(distance, detail = TREE_DETAIL.HIGH) {
    const limits = TREE_LOD_DISTANCES[detail] ?? TREE_LOD_DISTANCES[TREE_DETAIL.HIGH];
    if (distance < limits.near) return TREE_LOD.NEAR;
    if (distance < limits.mid) return TREE_LOD.MID;
    return TREE_LOD.FAR;
}

// Muted, low-saturation colours (core/nature/TerrainSurface.js's palette keeps the
// same restraint), three leaf shades per species chosen by feature.variant.
// The textures are grey, so these are the colours trees show.
// `crown` darkens the solid mid and far crowns to match how much darker a
// spray of needles looks than a cluster of broad leaves.
const SPECIES_LOOK = Object.freeze({
    [TREE_SPECIES.CONIFER]: {
        crown: 0.72,
        bark: [0.42, 0.33, 0.25],
        leaves: [[0.35, 0.49, 0.33], [0.29, 0.43, 0.30], [0.44, 0.53, 0.34]]
    },
    [TREE_SPECIES.BROADLEAF]: {
        crown: 1,
        bark: [0.44, 0.38, 0.31],
        leaves: [[0.47, 0.56, 0.30], [0.41, 0.50, 0.26], [0.54, 0.60, 0.34]]
    },
    [TREE_SPECIES.SCRUB]: {
        crown: 1,
        bark: [0.47, 0.40, 0.30],
        leaves: [[0.56, 0.57, 0.39], [0.49, 0.51, 0.33], [0.61, 0.60, 0.42]]
    }
});
// The textures and the solid crowns are a little dark on their own; this
// brings the trees back to the palette's brightness.
const LEAF_GAIN = 1.45;
const BARK_GAIN = 1.5;
// Wet trees darken less than bare ground: leaves shed the rain. Snow lies on
// the tops of crowns and boughs.
const TREE_WET = Object.freeze({ darken: 0.22, roughness: 0.5, snow: 0.9 });
// How much each species sheds its leaves (renderer/SeasonalSurfaces.js).
const SPECIES_DECIDUOUS = Object.freeze({
    [TREE_SPECIES.CONIFER]: DECIDUOUS.NEVER,
    [TREE_SPECIES.BROADLEAF]: DECIDUOUS.FULLY,
    [TREE_SPECIES.SCRUB]: DECIDUOUS.PARTLY
});
// Leaves blow about where trees that shed them stand: within this many
// metres of the camera, and as many as this make it a wood
// (deciduousNearby).
const NEARBY_METRES = 22;
const NEARBY_WOOD = 14;

const SPECIES_ORDER = Object.values(TREE_SPECIES);
// How the pool draws a tree: a level, or SHADE, the mid shape for a tree
// close by that casts a shadow (out of view, or close by under LOW). Only
// NEAR and SHADE cast: mid trees under HIGH stand beyond the shadows' reach.
const KINDS = Object.freeze(['NEAR', 'MID', 'FAR', 'SHADE']);
const CASTS = Object.freeze({ NEAR: true, MID: false, FAR: false, SHADE: true });
const FORM_COUNT = SPECIES_ORDER.length * TREE_FORMS_PER_SPECIES;

function formSlot(species, form) {
    const s = Math.max(0, SPECIES_ORDER.indexOf(species));
    return s * TREE_FORMS_PER_SPECIES + form;
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _lean = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _viewProjection = new THREE.Matrix4();
const _direction = new THREE.Vector3();

// One tree as the pool draws it: where it stands, how big it is, its
// instance matrix and its two colours.
function treeRecord(feature) {
    const shape = treeShapeOf(feature);
    const form = treeForm(feature.species, shape.form);
    _position.set(feature.x, feature.y, feature.z);
    _quaternion.setFromEuler(_euler.set(0, feature.rotationY, 0));
    _lean.setFromEuler(_euler.set(shape.leanX, 0, shape.leanZ));
    _quaternion.premultiply(_lean);
    _scale.set(shape.widthScale, shape.heightScale, shape.widthScale);
    _matrix.compose(_position, _quaternion, _scale);

    const look = SPECIES_LOOK[form.species];
    const leaves = look.leaves[feature.variant] ?? look.leaves[0];
    const barkShade = 0.94 + (shape.shade - 0.9) * 0.5;
    const height = form.height * shape.heightScale;
    const reach = Math.max(form.crown.radius, 0.5) * shape.widthScale;
    return {
        slot: formSlot(form.species, shape.form),
        deciduous: SPECIES_DECIDUOUS[form.species] ?? 0,
        numbers: treeNumbers(feature.x, feature.z),
        x: feature.x,
        z: feature.z,
        // Its trunk, as collision meets it: what setHidden()'s question takes.
        trunk: treeCollisionCircleFor(feature),
        middleY: feature.y + height / 2,
        radius: Math.hypot(reach, height / 2),
        matrix: Float32Array.from(_matrix.elements),
        leafColor: leaves.map((c) => c * shape.shade * LEAF_GAIN),
        crownColor: leaves.map((c) => c * shape.shade * LEAF_GAIN * look.crown),
        barkColor: look.bark.map((c) => c * barkShade * BARK_GAIN),
        // As the season colours it (TreeForest#setSeason()), and what it
        // does to its leaves (renderer/SeasonalSurfaces.js's treeSeason).
        seasonLeafColor: null,
        seasonCrownColor: null,
        season: NO_SEASON
    };
}

// A tree's `treeSeason` with no season: in full leaf, no fruit.
const NO_SEASON = Object.freeze([1, 0, 0]);

// Colours `tree` for the season `look`, or takes the season off it.
function seasonTree(tree, look) {
    if (!look) {
        tree.seasonLeafColor = null;
        tree.seasonCrownColor = null;
        tree.season = NO_SEASON;
        return;
    }
    const season = treeSeasonOf(look, tree.numbers, tree.deciduous);
    tree.seasonLeafColor = seasonedTreeColour(tree.leafColor, season);
    tree.seasonCrownColor = seasonedTreeColour(tree.crownColor, season, { crown: true });
    tree.season = [season.leaf, season.fruit, season.fruitKind];
}

// The season's numbers that change what trees look like, rounded so a
// forest is recoloured only once the change would show.
function seasonKey(look) {
    if (!look) return '';
    return ['leaves', 'fresh', 'blossom', 'autumn', 'fruit'].map((key) => Math.round((look[key] || 0) * 100)).join();
}

export class TreeForest {
    // `sink` takes the forest's one group (add/remove, like
    // renderer/SceneManager.js). `wetSurfaces` (renderer/WetSurfaces.js), when
    // given, darkens trees in the rain with the rest of the world and lays
    // snow on them. setSeason() dresses them for the season.
    constructor(sink, { seed, detail = TREE_DETAIL.HIGH, tileSize = TERRAIN_TILE_SIZE, wetSurfaces = null } = {}) {
        this._sink = sink;
        this._seed = seed;
        this._tileSize = tileSize;
        this._detail = TREE_DETAIL[detail] ? detail : TREE_DETAIL.HIGH;
        this._wind = createTreeWind();
        this._materials = createTreeMaterials(this._wind);
        if (wetSurfaces) {
            for (const key of ['bark', 'broadLeaves', 'needles', 'crown']) {
                makeWet(this._materials[key].material, wetSurfaces, TREE_WET);
            }
        }
        // After the wet, so the snow lies on top of the fruit.
        this._seasonal = [];
        const parts = { broadLeaves: TREE_PART.LEAVES, needles: TREE_PART.LEAVES, crown: TREE_PART.CROWN };
        for (const [key, part] of Object.entries(parts)) {
            this._seasonal.push(makeSeasonalTree(this._materials[key].material, { part }));
            this._seasonal.push(makeSeasonalTree(this._materials[key].depth, { part, depth: true }));
        }
        this._look = null;
        this._seasonKey = '';
        this._deciduousNearby = 0;
        this._group = new THREE.Group();
        this._group.name = 'trees';
        this._sink.add(this._group);
        this._tiles = new Map();
        // Per form slot: its geometries, built the first time a tree of it is seen.
        this._geometries = new Array(FORM_COUNT).fill(null);
        // Per form slot and level: { parts: [{ mesh, colour }] }.
        this._meshes = new Map();
        this._buckets = Array.from({ length: FORM_COUNT * KINDS.length }, () => []);
        this._dirty = true;
        this._lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
        this._lastDirection = new THREE.Vector3();
        this._lodCounts = { [TREE_LOD.NEAR]: 0, [TREE_LOD.MID]: 0, [TREE_LOD.FAR]: 0 };
        this._wideCamera = new THREE.PerspectiveCamera();
        // Which trees not to draw, and the version of that answer last sorted
        // by; see setHidden().
        this._isHidden = null;
        this._hiddenVersion = null;
        this._sortedHiddenVersion = null;
    }

    get detail() {
        return this._detail;
    }

    get group() {
        return this._group;
    }

    get treeCount() {
        let count = 0;
        for (const records of this._tiles.values()) count += records.length;
        return count;
    }

    // How many trees were drawn at each level when update() last sorted them.
    get lodCounts() {
        return { ...this._lodCounts };
    }

    // How much of a wood of leaf-shedding trees stands round the camera, 0
    // (none) to 1, as of the last time update() sorted the trees: what
    // falling leaves and petals are scaled by.
    get deciduousNearby() {
        return this._deciduousNearby;
    }

    // The meshes drawing at least one tree: one draw call each.
    get drawnMeshCount() {
        let count = 0;
        this._group.traverse((node) => {
            if (node.isInstancedMesh && node.visible && node.count > 0) count++;
        });
        return count;
    }

    setDetail(detail) {
        const next = TREE_DETAIL[detail] ? detail : TREE_DETAIL.HIGH;
        if (next === this._detail) return;
        this._detail = next;
        this._dirty = true;
    }

    // Dresses every tree for the season `look` (core/nature/Season.js's
    // seasonLookAt()): fresh leaves, blossom, fruit, autumn colours, leaves
    // dropping (renderer/SeasonalSurfaces.js). The colours are worked out
    // here, once the change would show, and drawn at the next update().
    setSeason(look) {
        const key = seasonKey(look);
        if (key === this._seasonKey) return;
        this._seasonKey = key;
        this._look = look || null;
        for (const records of this._tiles.values()) {
            for (const tree of records) seasonTree(tree, this._look);
        }
        const flags = treeSeasonFlags(this._look);
        for (const material of this._seasonal) setTreeSeasonFlags(material, flags);
        this._dirty = true;
    }

    // How hard the wind blows, 0 (still) to 1 (a gale).
    setWind(strength) {
        this._wind.strength.value = Number.isFinite(strength) ? Math.min(Math.max(strength, 0), 1) : 0;
    }

    get windStrength() {
        return this._wind.strength.value;
    }

    // The way the wind blows on the ground, as long as it is strong: what
    // carries falling snow and leaves along (renderer/SeasonDrift.js).
    get windDirection() {
        const { x, y } = this._wind.direction.value;
        const strength = this._wind.strength.value;
        return { x: x * strength, y: y * strength };
    }

    // The clock the wind sways by, in seconds.
    setTime(seconds) {
        this._wind.time.value = seconds;
    }

    // `isHidden(trunk)` names the trees not to draw (those giving way to a
    // build, application/world/TreeDisplacement.js), asked when the trees are
    // sorted; `version()`, asked every update(), moves on when an answer
    // already given changes, and they are sorted again. null draws them all.
    setHidden(isHidden, version = null) {
        this._isHidden = typeof isHidden === 'function' ? isHidden : null;
        this._hiddenVersion = typeof version === 'function' ? version : null;
        this._dirty = true;
    }

    // The tile's trees join the pool. Returns what unloadTile() takes back.
    loadTile(tx, tz) {
        const minX = tx * this._tileSize;
        const minZ = tz * this._tileSize;
        const records = naturalFeaturesInRegion(this._seed, minX, minZ, minX + this._tileSize, minZ + this._tileSize)
            .filter((feature) => feature.type === FEATURE_TYPE.TREE)
            .map(treeRecord);
        if (this._look) for (const tree of records) seasonTree(tree, this._look);
        const token = { tx, tz };
        this._tiles.set(token, records);
        if (records.length > 0) this._dirty = true;
        return token;
    }

    unloadTile(token) {
        const records = this._tiles.get(token);
        if (!records) return;
        this._tiles.delete(token);
        if (records.length > 0) this._dirty = true;
    }

    // Re-sorts the trees into levels for `camera` if it has moved or turned
    // enough since the last time, or the trees or detail changed. Returns
    // whether it did.
    update(camera) {
        camera.updateMatrixWorld();
        camera.getWorldDirection(_direction);
        const moved = camera.position.distanceToSquared(this._lastPosition) > REBUCKET_METRES * REBUCKET_METRES;
        const turned = _direction.dot(this._lastDirection) < Math.cos(THREE.MathUtils.degToRad(REBUCKET_DEGREES));
        const hiddenVersion = this._hiddenVersion ? this._hiddenVersion() : null;
        if (hiddenVersion !== this._sortedHiddenVersion) {
            this._sortedHiddenVersion = hiddenVersion;
            this._dirty = true;
        }
        if (!this._dirty && !moved && !turned) return false;
        this._dirty = false;
        this._lastPosition.copy(camera.position);
        this._lastDirection.copy(_direction);

        const frustum = this._widenedFrustum(camera);
        const margin = REBUCKET_METRES;
        for (const bucket of this._buckets) bucket.length = 0;
        const counts = { [TREE_LOD.NEAR]: 0, [TREE_LOD.MID]: 0, [TREE_LOD.FAR]: 0 };
        const { x: cx, y: cy, z: cz } = camera.position;
        const low = TREE_LOD_DISTANCES[this._detail].near === 0;
        let nearby = 0;
        for (const records of this._tiles.values()) {
            for (const tree of records) {
                if (this._isHidden && this._isHidden(tree.trunk)) continue;
                const dx = tree.x - cx;
                const dy = tree.middleY - cy;
                const dz = tree.z - cz;
                if (tree.deciduous > 0 && dx * dx + dz * dz < NEARBY_METRES * NEARBY_METRES) nearby += tree.deciduous;
                const lod = treeLodAt(Math.sqrt(dx * dx + dy * dy + dz * dz), this._detail);
                // Close enough that its shadow may fall in view.
                const shading = lod === TREE_LOD.NEAR || (lod === TREE_LOD.MID && low);
                _sphere.center.set(tree.x, tree.middleY, tree.z);
                _sphere.radius = tree.radius + margin;
                let kind = lod;
                if (!frustum.intersectsSphere(_sphere)) {
                    if (!shading) continue;
                    kind = 'SHADE';
                } else if (shading && lod === TREE_LOD.MID) {
                    kind = 'SHADE';
                }
                this._buckets[tree.slot * KINDS.length + KINDS.indexOf(kind)].push(tree);
                counts[kind === 'SHADE' ? TREE_LOD.MID : lod]++;
            }
        }
        this._lodCounts = counts;
        this._deciduousNearby = Math.min(1, nearby / NEARBY_WOOD);

        for (let slot = 0; slot < FORM_COUNT; slot++) {
            for (let k = 0; k < KINDS.length; k++) {
                const key = slot * KINDS.length + k;
                const trees = this._buckets[key];
                if (trees.length === 0) {
                    const existing = this._meshes.get(key);
                    if (existing) for (const part of existing.parts) part.mesh.visible = false;
                    continue;
                }
                this._fill(this._partsFor(slot, KINDS[k], trees.length), trees);
            }
        }
        return true;
    }

    dispose() {
        this._sink.remove(this._group);
        for (const entry of this._meshes.values()) {
            for (const part of entry.parts) part.mesh.dispose();
        }
        this._meshes.clear();
        for (const geometries of this._geometries) {
            if (!geometries) continue;
            for (const level of Object.values(geometries)) {
                for (const geometry of Object.values(level)) geometry.dispose();
            }
        }
        this._geometries.fill(null);
        disposeTreeMaterials(this._materials);
        this._tiles.clear();
    }

    _widenedFrustum(camera) {
        let projection = camera.projectionMatrix;
        if (camera.isPerspectiveCamera) {
            const wide = this._wideCamera;
            wide.fov = Math.min(camera.fov + REBUCKET_DEGREES * 2.5, 170);
            wide.aspect = camera.aspect;
            wide.near = camera.near;
            wide.far = camera.far;
            wide.zoom = camera.zoom;
            wide.updateProjectionMatrix();
            projection = wide.projectionMatrix;
        }
        _viewProjection.multiplyMatrices(projection, camera.matrixWorldInverse);
        return _frustum.setFromProjectionMatrix(_viewProjection);
    }

    _formOf(slot) {
        const species = SPECIES_ORDER[Math.floor(slot / TREE_FORMS_PER_SPECIES)];
        return treeForm(species, slot % TREE_FORMS_PER_SPECIES);
    }

    // The meshes drawing one form as one KINDS entry, with room for `needed` trees.
    _partsFor(slot, kind, needed) {
        const key = slot * KINDS.length + KINDS.indexOf(kind);
        let entry = this._meshes.get(key);
        if (entry && entry.capacity >= needed) return entry.parts;

        const capacity = Math.max(MIN_CAPACITY, 2 ** Math.ceil(Math.log2(needed)));
        const form = this._formOf(slot);
        if (!this._geometries[slot]) this._geometries[slot] = buildTreeGeometries(form);
        const geometries = this._geometries[slot];
        const leaves = form.species === TREE_SPECIES.CONIFER ? this._materials.needles : this._materials.broadLeaves;
        const specs = kind === 'NEAR'
            ? [[geometries.near.bark, this._materials.bark, 'barkColor'], [geometries.near.leaves, leaves, 'leafColor']]
            : kind === 'MID' || kind === 'SHADE'
                ? [[geometries.mid.bark, this._materials.bark, 'barkColor'], [geometries.mid.crown, this._materials.crown, 'crownColor']]
                : [[geometries.far.bark, this._materials.bark, 'barkColor'], [geometries.far.crown, this._materials.crown, 'crownColor']];

        if (entry) {
            for (const part of entry.parts) {
                this._group.remove(part.mesh);
                part.mesh.dispose();
            }
        }
        const parts = specs.map(([shared, look, colour]) => {
            // Leaves and crowns carry each tree's `treeSeason`, an attribute of
            // their own on a geometry sharing the form's buffers.
            const seasonal = colour !== 'barkColor';
            const geometry = seasonal ? viewOf(shared) : shared;
            const season = seasonal ? new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3) : null;
            if (season) geometry.setAttribute('treeSeason', season);
            const mesh = new THREE.InstancedMesh(geometry, look.material, capacity);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
            mesh.customDepthMaterial = look.depth;
            // Instances span the whole streamed ring: update() culls them.
            mesh.frustumCulled = false;
            mesh.castShadow = CASTS[kind];
            // Far trees are beyond the reach of the sun's shadows.
            mesh.receiveShadow = kind !== 'FAR';
            mesh.name = `tree-${form.species.toLowerCase()}-${form.index}-${kind.toLowerCase()}`;
            this._group.add(mesh);
            return { mesh, colour, season, seasonColour: SEASON_COLOUR[colour] ?? null };
        });
        entry = { capacity, parts };
        this._meshes.set(key, entry);
        return parts;
    }

    _fill(parts, trees) {
        for (const { mesh, colour, season, seasonColour } of parts) {
            const matrices = mesh.instanceMatrix.array;
            const colours = mesh.instanceColor.array;
            for (let i = 0; i < trees.length; i++) {
                const tree = trees[i];
                matrices.set(tree.matrix, i * 16);
                colours.set((seasonColour && tree[seasonColour]) || tree[colour], i * 3);
                if (season) season.array.set(tree.season, i * 3);
            }
            mesh.count = trees.length;
            mesh.visible = true;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            if (season) season.needsUpdate = true;
        }
    }
}

// Which seasoned colour stands for each part's colour.
const SEASON_COLOUR = Object.freeze({ leafColor: 'seasonLeafColor', crownColor: 'seasonCrownColor' });

// A geometry drawing `geometry`'s very buffers, to which one mesh can add an
// attribute of its own.
function viewOf(geometry) {
    const view = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) view.setAttribute(name, attribute);
    view.setIndex(geometry.index);
    view.boundingSphere = geometry.boundingSphere;
    view.boundingBox = geometry.boundingBox;
    return view;
}
