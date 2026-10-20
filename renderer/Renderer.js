import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { CameraController } from './CameraController.js';
import { Lights } from './Lights.js';
import { GridHelper } from './GridHelper.js';
import { AnimationLoop } from './AnimationLoop.js';
import { TerrainStreamingController } from './TerrainStreamingController.js';
import { buildTerrainTileMesh } from './TerrainTileMesh.js';
import { TreeForest, TREE_DETAIL } from './TreeForest.js';
import { buildWaterTile } from './WaterTileMesh.js';
import { createLakeIce, setLakeIce } from './WaterWaveMaterial.js';
import { buildWildlifeTileMesh, updateWildlifeTileMesh } from './WildlifeTileMesh.js';
import { disposeOwnedTile, disposeInstancedTile } from './TileDisposal.js';
import { terrainHeightAt as computeTerrainHeightAt, DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/nature/TerrainTiling.js';
import { underwaterViewAt, UNDERWATER_VIEW } from '../core/nature/UnderwaterView.js';
import { seaShareAt } from '../core/nature/Hydrology.js';
import { waterWaveAt } from '../core/nature/WaterWaves.js';
import { buildUnderwaterLifeTileMesh, updateUnderwaterLifeTileMesh } from './UnderwaterLifeTileMesh.js';
import { DAY } from '../core/nature/DayCycle.js';
import { makeNightGlowing } from './NightGlowMaterial.js';
import { SkyBodies } from './SkyBodies.js';
import { StarSky } from './StarSky.js';
import { CloudSky } from './CloudSky.js';
import { RainFall } from './RainFall.js';
import { BRICK_WET, createWetSurfaces, makeWet, setSnowCover, setWetShelter, setWetness } from './WetSurfaces.js';
import { createSeasonSurfaces, setSeason } from './SeasonalSurfaces.js';
import { Drift, DRIFT } from './SeasonDrift.js';
import { FootprintTrail } from './FootprintTrail.js';
import { SunShadows } from './SunShadows.js';

// Under water the view closes in to a blue-green haze: murkier and greener in a
// lake, deeper blue at sea.
const UNDERWATER_LOOK = Object.freeze({
    [UNDERWATER_VIEW.LAKE]: Object.freeze({ color: 0x2f6f6a, near: 0.5, far: 18 }),
    [UNDERWATER_VIEW.SEA]: Object.freeze({ color: 0x135a8c, near: 1, far: 30 })
});

// Phones and tablets, whose GPUs feel leaves drawn over each other most, start
// with plainer trees.
function defaultTreeDetail() {
    const touchFirst = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
    return touchFirst ? TREE_DETAIL.LOW : TREE_DETAIL.HIGH;
}

// A breeze in fair weather, stronger as the clouds gather and the rain or
// snow comes.
function windStrengthOf(weather) {
    const cover = Number.isFinite(weather.cloudCover) ? weather.cloudCover : 0;
    const rain = Number.isFinite(weather.rain) ? weather.rain : 0;
    const snow = Number.isFinite(weather.snow) ? weather.snow : 0;
    return Math.min(1, 0.25 + 0.3 * cover + 0.45 * rain + 0.3 * snow);
}

// Renderer owns the visualization pipeline only: scene, camera, lights, grid,
// and the render loop. It never owns game state (bricks, buildings, worlds).
// Callers hand it THREE.Object3D instances via add()/remove() — everything
// about what those objects represent lives in core/ and world/, not here.
export class Renderer {
    // `cameraResetKey` is passed to CameraController; null turns its reset
    // shortcut off. `wildlifeClock` returns wildlife time in seconds, the
    // moment at which wandering animals are drawn (core/nature/WildlifeMotion.js);
    // World View passes its session's clock so animals are drawn where
    // collision and catching find them. `treeDetail` (renderer/TreeForest.js)
    // starts LOW where the main pointer is a finger, until setTreeDetail().
    constructor(container, { cameraResetKey, wildlifeClock = () => Date.now() / 1000, treeDetail = defaultTreeDetail() } = {}) {
        this._container = container;
        this._wildlifeClock = wildlifeClock;
        // Who animals turn to watch; see setWildlifeObserver().
        this._wildlifeObserver = () => null;

        this._webglRenderer = new THREE.WebGLRenderer({ antialias: true });
        // Per-material clipping, which World View's cutaway uses
        // (renderer/CutawayClipping.js); a material with no planes is unaffected.
        this._webglRenderer.localClippingEnabled = true;
        this._webglRenderer.setPixelRatio(window.devicePixelRatio || 1);
        this._webglRenderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this._webglRenderer.domElement);

        this._sceneManager = new SceneManager();
        // The sky and its light: always day, unless World View's day and night
        // changes it (setSkyLook()).
        this._skyLook = DAY;
        // How strongly standalone bricks that shine after dark shine
        // (renderer/NightGlowMaterial.js), shared by every one this adds.
        this._nightGlow = { value: 0 };
        // The sun, the moon and the stars, made the first time setSkyBodies()
        // is called.
        this._skyBodies = null;
        this._starSky = null;
        this._skyBodiesState = null;
        // The clouds and the rain, made the first time setWeather() is called.
        this._cloudSky = null;
        this._rainFall = null;
        this._weather = null;
        this._rainShelter = null;
        // How wet the ground and the bricks are, and how much snow lies on
        // them (renderer/WetSurfaces.js), shared by the terrain, the trees
        // and every brick this adds.
        this._wetSurfaces = createWetSurfaces();
        // The season on the ground (renderer/SeasonalSurfaces.js), shared by
        // every terrain tile; the trees colour themselves
        // (renderer/TreeForest.js#setSeason()). Plain until setSeason() is
        // called. What drifts down with it (snow, leaves, petals;
        // renderer/SeasonDrift.js) is made the first time there is any.
        this._seasonSurfaces = createSeasonSurfaces();
        this._seasonLook = null;
        this._drifts = { [DRIFT.SNOW]: null, [DRIFT.LEAVES]: null, [DRIFT.PETALS]: null };
        // The local avatar's footprints in the snow (renderer/FootprintTrail.js),
        // made the first time one is pressed in.
        this._footprints = null;
        // The ice on the lakes (renderer/WaterWaveMaterial.js), shared by every
        // water tile, with the snow lying on it.
        this._lakeIce = createLakeIce(this._wetSurfaces.snowCover);
        // How hard it rains, 0 to 1: every water tile's rain rings read it
        // (renderer/RainRings.js).
        this._rainLevel = { value: 0 };
        this._sceneManager.scene.background = new THREE.Color(DAY.sky);

        this._cameraController = new CameraController(
            this._webglRenderer.domElement,
            container.clientWidth / container.clientHeight,
            cameraResetKey === undefined ? {} : { resetKey: cameraResetKey }
        );

        this._lights = new Lights(this._sceneManager);
        // Off until World View turns them on (setShadowsEnabled()).
        this._sunShadows = new SunShadows(this._webglRenderer, this._lights);
        this._grid = new GridHelper(this._sceneManager);

        // 0.2.76 — World Ground & Terrain Foundation. Lives alongside
        // GridHelper rather than replacing it: GridHelper stays the
        // Editor's precise, origin-relative snapping reference,
        // completely unchanged; terrain is the new, camera-following
        // SOLID ground underneath both Editor and World View — see
        // docs/Roadmap.md, 0.2.76, and core/nature/TerrainHeightField.js's own
        // header. terrainHeightAt() below is the ONE shared query point
        // every ground-placement site in this codebase reads from
        // (renderer/WorldRenderer.js for buildings,
        // application/world/RenderWorldViewUseCase.js for avatars) — never a
        // second, independently-computed terrain function anywhere else.
        this._terrainStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildTerrainTileMesh(tx, tz, DEFAULT_WORLD_SEED, TERRAIN_TILE_SIZE, this._wetSurfaces, this._seasonSurfaces),
            { disposeTile: disposeOwnedTile }
        );
        this._terrainStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

        // Trees stream on the ground's own tile grid, but each tile only
        // hands its trees to one shared pool (renderer/TreeForest.js), which
        // draws them all and is the one thing in the scene.
        this._trees = new TreeForest(this._sceneManager, { seed: DEFAULT_WORLD_SEED, detail: treeDetail, wetSurfaces: this._wetSurfaces });
        this._vegetationStreaming = new TerrainStreamingController(
            { add() {}, remove() {} },
            (tx, tz) => this._trees.loadTile(tx, tz),
            { disposeTile: (token) => this._trees.unloadTile(token) }
        );
        this._vegetationStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

        // 0.2.89 — World Water & Hydrology Foundation. A THIRD instance
        // of the exact same TerrainStreamingController class, following
        // the identical precedent 0.2.88 set for vegetation just above —
        // never a new streaming system, never a WaterStreamingController.
        // Water shares the ground's tile grid and load/unload
        // orchestration by construction, differing only in what its
        // tileFactory builds: a flat lake plane (renderer/WaterTileMesh.js)
        // instead of colored ground or trees. A river's water
        // (renderer/RiverTileMesh.js) rides in the same tile, over the
        // tint core/nature/Hydrology.js#hydrologyGroundColorAt() lays on its bed.
        // Lakes ripple, the sea swells (core/nature/WaterWaves.js) and rivers run
        // (core/nature/RiverFlow.js): every water tile's material reads this one
        // time, which _renderFrame() advances.
        this._waterWaveTime = { value: 0 };
        this._waterStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildWaterTile(tx, tz, DEFAULT_WORLD_SEED, TERRAIN_TILE_SIZE, this._waterWaveTime, this._rainLevel, this._lakeIce),
            { disposeTile: disposeOwnedTile }
        );
        this._waterStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

        // 0.9.667 — Deterministic World Wildlife. A FOURTH instance of
        // the exact same TerrainStreamingController class, following the
        // identical precedent 0.2.88 set for vegetation and 0.2.89 set
        // for water — never a new streaming system, never a
        // WildlifeStreamingController. Wildlife shares the ground's tile
        // grid and load/unload orchestration by construction, differing
        // only in what its tileFactory builds: deer/rabbit
        // decorations (renderer/WildlifeTileMesh.js) instead of colored
        // ground, trees, or water. See core/nature/WildlifeField.js's own header
        // for why animals are recomputed per tile, never persisted, the
        // identical "sampled, never stored" discipline vegetation already
        // established.
        // 0.9.700 — Animal Catching. `_caughtAnimalIds` is the live Set
        // buildWildlifeTileMesh() reads through this closure on every
        // (re)build of every wildlife tile, forever after — see
        // markAnimalCaught() below for the only place anything is ever
        // added to it.
        // Animals wander (core/nature/WildlifeMotion.js): a tile is built already
        // posed at the current wildlife time, and _renderFrame() moves every
        // loaded tile's animals on from there.
        // Fish and seaweed (core/nature/UnderwaterLifeField.js); fish swim every frame.
        this._underwaterLifeStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildUnderwaterLifeTileMesh(tx, tz, DEFAULT_WORLD_SEED, TERRAIN_TILE_SIZE, this._wildlifeClock()),
            { disposeTile: disposeInstancedTile }
        );
        this._underwaterLifeStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );
        this._underwaterView = UNDERWATER_VIEW.NONE;

        this._caughtAnimalIds = new Set();
        this._wildlifeStreaming = new TerrainStreamingController(
            this._sceneManager,
            (tx, tz) => buildWildlifeTileMesh(tx, tz, DEFAULT_WORLD_SEED, TERRAIN_TILE_SIZE, this._caughtAnimalIds, this._wildlifeClock()),
            { disposeTile: disposeInstancedTile }
        );
        this._wildlifeStreaming.update(
            this._cameraController.camera.position.x,
            this._cameraController.camera.position.z,
            true
        );

        // 0.2.36 — a generic per-frame hook, deliberately NOT
        // avatar-specific (Renderer "owns the visualization pipeline
        // only" per this file's own header): any collaborator that
        // needs real elapsed time each frame (today: AvatarVisual's
        // gait clock, AvatarMovementController's simulation tick)
        // registers here instead of Renderer knowing anything about
        // avatars, movement, or presence.
        this._frameListeners = new Set();
        // A fixed size to draw at, or null for the view's own; see setFrameSize().
        this._frameSize = null;
        this._renderedFrameListeners = new Set();
        this._animationLoop = new AnimationLoop((deltaSeconds) => this._renderFrame(deltaSeconds));

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    get scene() {
        return this._sceneManager.scene;
    }

    get camera() {
        return this._cameraController.camera;
    }

    get cameraController() {
        return this._cameraController;
    }

    get domElement() {
        return this._webglRenderer.domElement;
    }

    add(object) {
        // Bricks get wet in the rain (renderer/WetSurfaces.js).
        if (object && typeof object.traverse === 'function') {
            object.traverse((child) => {
                for (const material of [].concat(child.material || [])) {
                    if (material.userData && material.userData.brickSurface) makeWet(material, this._wetSurfaces, BRICK_WET);
                }
            });
        }
        if (object && object.userData && object.userData.nightGlow) {
            makeNightGlowing(object.material, object.userData.nightGlow, this._nightGlow);
        }
        this._sceneManager.add(object);
    }

    remove(object) {
        this._sceneManager.remove(object);
    }

    // Colors the sky and lights the scene as `look` (shaped like
    // core/nature/DayCycle.js's DAY) says. Under water, the haze stays until the
    // camera surfaces into this sky.
    setSkyLook(look) {
        if (!look || look === this._skyLook) {
            return;
        }
        this._skyLook = look;
        this._lights.applyLook(look);
        this._nightGlow.value = look.glow;
        if (!UNDERWATER_LOOK[this._underwaterView]) {
            this._sceneManager.scene.background.setHex(look.sky);
        }
    }

    get skyLook() {
        return this._skyLook;
    }

    // Shows World View's sun and moon where `bodies` (core/nature/DayCycle.js's
    // skyBodiesAt()) puts them, the moon in its phase, and aims the light
    // from them; at night the stars and the Milky Way come out, turned by
    // bodies.skyTurn and paler the more of the moon is lit
    // (renderer/StarSky.js). A renderer never given any (the Editor,
    // thumbnails) draws none of them and keeps the daytime light.
    setSkyBodies(bodies) {
        if (!bodies || bodies === this._skyBodiesState) {
            return;
        }
        this._skyBodiesState = bodies;
        if (!this._skyBodies) {
            this._skyBodies = new SkyBodies(this._sceneManager);
            this._starSky = new StarSky(this._sceneManager, { pixelRatio: this._webglRenderer.getPixelRatio() });
        }
        this._skyBodies.set(bodies);
        this._lights.setDirection(bodies.light, bodies.lightStrength);
    }

    // Draws World View's clouds and rain as `weather`
    // (core/nature/Weather.js#weatherAt()) says: the clouds drifting by the world's
    // clock (renderer/CloudSky.js), the rain falling round the camera
    // (renderer/RainFall.js) and ringing the water (renderer/RainRings.js).
    // A renderer never given any (the Editor, thumbnails) draws none.
    setWeather(weather) {
        if (!weather || weather === this._weather) {
            return;
        }
        this._weather = weather;
        if (!this._cloudSky) {
            this._cloudSky = new CloudSky(this._sceneManager);
            this._rainFall = new RainFall(this._sceneManager);
            this._rainFall.setShelter(this._rainShelter);
        }
        this._cloudSky.set(weather);
        const rain = Number.isFinite(weather.rain) ? weather.rain : 0;
        this._rainFall.set(rain);
        this._rainLevel.value = rain;
        setWetness(this._wetSurfaces, weather.wetness);
        setSnowCover(this._wetSurfaces, weather.snowCover);
        const snow = Number.isFinite(weather.snow) ? weather.snow : 0;
        if (snow > 0 || this._drifts[DRIFT.SNOW]) this._drift(DRIFT.SNOW).set(snow);
        this._trees.setWind(windStrengthOf(weather));
    }

    // Dresses the land for the season `look` says (core/nature/Season.js's
    // seasonLookAt()): the grass, the fields and the trees
    // (renderer/SeasonalSurfaces.js), and leaves or petals drifting down
    // among the trees that shed them (renderer/SeasonDrift.js). A renderer
    // never given one (the Editor, thumbnails) keeps high summer's look.
    setSeason(look) {
        if (!look || look === this._seasonLook) {
            return;
        }
        this._seasonLook = look;
        setSeason(this._seasonSurfaces, look);
        this._trees.setSeason(look);
    }

    get seasonLook() {
        return this._seasonLook;
    }

    // Freezes the lakes as far as `ice` says (core/nature/Season.js#lakeIceAt()), 0
    // (open water) to 1 (frozen hard).
    setLakeIce(ice) {
        setLakeIce(this._lakeIce, ice);
    }

    get lakeIce() {
        return this._lakeIce.ice.value;
    }

    // Presses footprints (core/avatar/Footprints.js) into the snow, made at `now`
    // on the world's clock.
    addFootprints(prints) {
        if (!Array.isArray(prints) || prints.length === 0) return;
        if (!this._footprints) {
            this._footprints = new FootprintTrail(this._sceneManager, { heightAt: (x, z) => this.terrainHeightAt(x, z) });
        }
        for (const print of prints) this._footprints.add(print);
    }

    // Fades the footprints for `now` on the world's clock.
    updateFootprints(now) {
        if (this._footprints) this._footprints.update(now, this._wetSurfaces.snowCover.value);
    }

    get footprintCount() {
        return this._footprints ? this._footprints.count : 0;
    }

    // How much snow lies here, 0 to 1, as last set by setWeather().
    get snowCover() {
        return this._wetSurfaces.snowCover.value;
    }

    // How much snow, leaves (DRIFT.LEAVES) or petals are falling round the
    // camera right now, 0 to 1.
    driftAmount(kind) {
        return this._drifts[kind] ? this._drifts[kind].amount : 0;
    }

    _drift(kind) {
        if (!this._drifts[kind]) {
            this._drifts[kind] = new Drift(this._sceneManager, kind);
            this._drifts[kind].setShelter(this._rainShelter);
        }
        return this._drifts[kind];
    }

    // Leaves and petals drift down only among the trees that shed them.
    _updateDrifts(underwater) {
        const look = this._seasonLook;
        if (look) {
            const nearby = this._trees.deciduousNearby;
            const leaves = (look.leafDrift || 0) * nearby;
            const petals = (look.petalDrift || 0) * nearby;
            if (leaves > 0 || this._drifts[DRIFT.LEAVES]) this._drift(DRIFT.LEAVES).set(leaves);
            if (petals > 0 || this._drifts[DRIFT.PETALS]) this._drift(DRIFT.PETALS).set(petals);
        }
        const camera = this._cameraController.camera;
        const options = { wind: this._trees.windDirection, pixelHeight: this._webglRenderer.domElement.height };
        for (const drift of Object.values(this._drifts)) {
            if (drift) drift.update(camera, this._waterWaveTime.value, this._skyLook, underwater, options);
        }
    }

    // Keeps the rain off `shelter` (`{ minX, maxX, minZ, maxZ, top }` in world
    // coordinates: the build the avatar stands in), or lets it fall
    // everywhere again with null (renderer/RainFall.js).
    setRainShelter(shelter) {
        this._rainShelter = shelter || null;
        if (this._rainFall) {
            this._rainFall.setShelter(this._rainShelter);
        }
        for (const drift of Object.values(this._drifts)) {
            if (drift) drift.setShelter(this._rainShelter);
        }
        setWetShelter(this._wetSurfaces, this._rainShelter);
    }

    // How wet the ground and bricks are here, 0 to 1, as last set by
    // setWeather().
    get wetness() {
        return this._wetSurfaces.wetness.value;
    }

    // How hard it is raining here, 0 to 1, as last set by setWeather().
    get rainLevel() {
        return this._rainLevel.value;
    }

    // Turns the sun's and the moon's shadows on or off
    // (renderer/SunShadows.js). Only World View turns them on.
    setShadowsEnabled(enabled) {
        this._sunShadows.setEnabled(enabled);
    }

    get shadowsEnabled() {
        return this._sunShadows.enabled;
    }

    // How much detail trees are drawn with close by (renderer/TreeForest.js's
    // TREE_DETAIL).
    setTreeDetail(detail) {
        this._trees.setDetail(detail);
    }

    get treeDetail() {
        return this._trees.detail;
    }

    resetCameraView() {
        this._cameraController.resetView();
    }

    // 0.9.700 — Animal Catching. Marks `animalId` permanently excluded
    // from every FUTURE wildlife tile this renderer ever builds (via
    // `this._caughtAnimalIds`, read by the wildlife streaming
    // controller's own tileFactory closure above), then immediately
    // rebuilds whichever ALREADY-LOADED tile `position` falls in — see
    // TerrainStreamingController#invalidateTile()'s own header for why
    // this is a single, targeted rebuild, never a full restream. A
    // caller (application/world/WorldNavigationSession.js, once per catch
    // event) hands this the exact position the animal stood at; this
    // method has no opinion on WHERE an animal came from or WHY it was
    // caught, only on making it stop rendering.
    markAnimalCaught(animalId, position) {
        this._caughtAnimalIds.add(animalId);
        const tx = Math.floor(position.x / TERRAIN_TILE_SIZE);
        const tz = Math.floor(position.z / TERRAIN_TILE_SIZE);
        this._wildlifeStreaming.invalidateTile(tx, tz);
    }

    // 0.2.76 — deterministic ground elevation at world (x, z). A thin
    // pass-through to core/nature/TerrainHeightField.js's own pure function
    // with this renderer's fixed DEFAULT_WORLD_SEED — see that file's
    // header for why one shared seed, and docs/Principles.md, "Terrain
    // Elevation Is A Rendering-Time Offset, Never A Presence Or
    // Placement Fact," for how callers are expected to use the result.
    // How far the swell lifts the lake or sea at (x, z) right now: the very
    // waves the water tiles draw (core/nature/WaterWaves.js, the same time), for
    // whatever floats there to ride them.
    waterSwellAt(x, z) {
        return waterWaveAt(seaShareAt(DEFAULT_WORLD_SEED, x, z), x, z, this._waterWaveTime.value).height;
    }

    terrainHeightAt(x, z) {
        return computeTerrainHeightAt(DEFAULT_WORLD_SEED, x, z);
    }

    // The wildlife time right now, in seconds: the moment wandering
    // animals are drawn at (see the constructor's `wildlifeClock`). For
    // animals drawn outside the wildlife tiles — released ones and
    // decorations — so they share the tiles' clock.
    wildlifeTime() {
        return this._wildlifeClock();
    }

    // `observer()` returns where the viewer's own avatar is drawn ({ x, z },
    // or null when there is none): the one avatar animals turn to watch
    // (renderer/AnimalReaction.js). Purely visual; nothing about where an
    // animal is depends on it.
    setWildlifeObserver(observer) {
        this._wildlifeObserver = typeof observer === 'function' ? observer : () => null;
    }

    wildlifeObserver() {
        return this._wildlifeObserver() || null;
    }

    // Registers `callback(deltaSeconds)` to run once per render frame,
    // real elapsed seconds since the previous frame. Returns an
    // unsubscribe function, the same shape every EventBus subscription
    // in this codebase already returns.
    addFrameListener(callback) {
        this._frameListeners.add(callback);
        return () => this._frameListeners.delete(callback);
    }

    // Registers `callback(canvas)` to run right after each frame is drawn,
    // while the canvas still holds it (it is cleared once the page shows it),
    // for copying frames into a video (renderer/WorldFilmRecorder.js).
    // Returns an unsubscribe function.
    addRenderedFrameListener(callback) {
        this._renderedFrameListeners.add(callback);
        return () => this._renderedFrameListeners.delete(callback);
    }

    start() {
        this._animationLoop.start();
    }

    stop() {
        this._animationLoop.stop();
    }

    dispose() {
        this.stop();
        this._frameListeners.clear();
        this._renderedFrameListeners.clear();
        this._terrainStreaming.dispose();
        this._vegetationStreaming.dispose();
        this._trees.dispose();
        this._waterStreaming.dispose();
        this._underwaterLifeStreaming.dispose();
        this._wildlifeStreaming.dispose();
        if (this._skyBodies) {
            this._skyBodies.dispose();
            this._starSky.dispose();
        }
        if (this._cloudSky) {
            this._cloudSky.dispose();
            this._rainFall.dispose();
        }
        for (const drift of Object.values(this._drifts)) {
            if (drift) drift.dispose();
        }
        if (this._footprints) this._footprints.dispose();
        window.removeEventListener('resize', this._onResize);
        this._cameraController.dispose();
        this._container.removeChild(this._webglRenderer.domElement);
        this._webglRenderer.dispose();
    }

    _renderFrame(deltaSeconds) {
        this._cameraController.update();
        this._terrainStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        this._vegetationStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        this._waterStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        // Seconds since the page opened, not the wall clock: small enough to
        // keep full float precision in the shader for days.
        this._waterWaveTime.value = performance.now() / 1000;
        this._trees.setTime(this._waterWaveTime.value);
        this._trees.update(this._cameraController.camera);
        this._wildlifeStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        const wildlifeTime = this._wildlifeClock();
        const observer = this.wildlifeObserver();
        this._wildlifeStreaming.forEachLoadedTile((tile) => updateWildlifeTileMesh(tile, wildlifeTime, observer));
        this._underwaterLifeStreaming.update(this._cameraController.camera.position.x, this._cameraController.camera.position.z);
        this._underwaterLifeStreaming.forEachLoadedTile((tile) => updateUnderwaterLifeTileMesh(tile, wildlifeTime));
        this._applyUnderwaterView(underwaterViewAt(DEFAULT_WORLD_SEED, this._cameraController.camera.position));
        if (this._skyBodies) {
            const underwater = Boolean(UNDERWATER_LOOK[this._underwaterView]);
            this._skyBodies.update(this._cameraController.camera, underwater, this._skyLook.sky);
            const bodies = this._skyBodiesState;
            this._starSky.set(this._skyLook.glow, bodies.skyTurn, bodies.moon && bodies.moonPhase ? bodies.moonPhase.illumination : 0);
            this._starSky.update(this._cameraController.camera, performance.now() / 1000, underwater);
        }
        if (this._cloudSky) {
            const underwater = Boolean(UNDERWATER_LOOK[this._underwaterView]);
            this._cloudSky.update(this._cameraController.camera, this._wildlifeClock(), this._skyLook, underwater);
            this._rainFall.update(this._cameraController.camera, this._waterWaveTime.value, this._skyLook, underwater);
        }
        this._updateDrifts(Boolean(UNDERWATER_LOOK[this._underwaterView]));
        for (const listener of this._frameListeners) {
            listener(deltaSeconds);
        }
        this._sunShadows.follow(this._cameraController.target);
        this._webglRenderer.render(this._sceneManager.scene, this._cameraController.camera);
        for (const listener of this._renderedFrameListeners) {
            listener(this._webglRenderer.domElement);
        }
    }

    _applyUnderwaterView(view) {
        if (view === this._underwaterView) {
            return;
        }
        this._underwaterView = view;
        const look = UNDERWATER_LOOK[view];
        const scene = this._sceneManager.scene;
        if (look) {
            scene.background = new THREE.Color(look.color);
            scene.fog = new THREE.Fog(look.color, look.near, look.far);
        } else {
            scene.background = new THREE.Color(this._skyLook.sky);
            scene.fog = null;
        }
    }

    // Draws every frame at exactly `size` (`{ width, height }` pixels), as a
    // walk-through video is (renderer/WorldFilmRecorder.js), shown fitted into
    // the view with bars beside it, so what is seen is what is filmed; null
    // draws at the view's own size again.
    setFrameSize(size) {
        const width = Math.round(Number(size?.width));
        const height = Math.round(Number(size?.height));
        const canvas = this._webglRenderer.domElement;
        if (!(width > 0 && height > 0)) {
            if (!this._frameSize) return;
            this._frameSize = null;
            canvas.style.width = '';
            canvas.style.height = '';
            canvas.style.marginLeft = '';
            canvas.style.marginTop = '';
            this._container.classList.remove('world-viewport--framed');
            this._webglRenderer.setPixelRatio(window.devicePixelRatio || 1);
            this._onResize();
            return;
        }
        this._frameSize = { width, height };
        this._container.classList.add('world-viewport--framed');
        this._webglRenderer.setPixelRatio(1);
        this._webglRenderer.setSize(width, height, false);
        this._cameraController.setAspect(width / height);
        this._fitFrame();
    }

    // The fixed-size frame (setFrameSize()) scaled to fit the view, centred.
    _fitFrame() {
        const { width, height } = this._frameSize;
        const viewWidth = this._container.clientWidth;
        const viewHeight = this._container.clientHeight;
        const scale = Math.min(viewWidth / width, viewHeight / height);
        const canvas = this._webglRenderer.domElement;
        canvas.style.width = `${width * scale}px`;
        canvas.style.height = `${height * scale}px`;
        canvas.style.marginLeft = `${(viewWidth - width * scale) / 2}px`;
        canvas.style.marginTop = `${(viewHeight - height * scale) / 2}px`;
    }

    _onResize() {
        if (this._frameSize) {
            this._fitFrame();
            return;
        }
        const width = this._container.clientWidth;
        const height = this._container.clientHeight;
        this._cameraController.setAspect(width / height);
        this._webglRenderer.setSize(width, height);
    }
}
