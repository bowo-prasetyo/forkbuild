import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../core/Hydrology.js';
import {
    AvatarSwimMode, AVATAR_SWIM_DEPTH, SURFACE_SWIM_FEET_DEPTH, AVATAR_BREATH_HEIGHT, BREATH_CAPACITY_SECONDS,
    SWIM_VERTICAL_SPEED, FORCED_ASCENT_SPEED, BUOYANCY_SPEED,
    deriveAvatarSwimMode, isSwimmableDepth, surfaceSwimFeetHeight, isHeadUnderwater, stepSwimFeetHeight,
    createAvatarBreathState, stepAvatarBreath
} from '../core/AvatarSwimming.js';
import { getAvatarPoseOffsets } from '../core/AvatarPoseOffsets.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { advanceAvatarSound, createAvatarSoundState, AVATAR_SOUND_CUE, FOOTSTEP_SURFACE } from '../core/AvatarSoundCues.js';
import { AvatarVerticalState } from '../core/AvatarVerticalState.js';
import { VEHICLE_MAX_WATER_DEPTH, isVehicleWaterStepAllowed, droneFloorHeight } from '../core/VehicleWaterline.js';
import { VehicleType } from '../core/VehicleType.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { underwaterViewAt, UNDERWATER_VIEW } from '../core/UnderwaterView.js';
import {
    seaweedInRegion, fishSchoolsInRegion, fishPoseAt, waterDepthAt, UNDERWATER_LIFE_TYPE
} from '../core/UnderwaterLifeField.js';
import { AvatarWaterConstraint } from '../application/avatar/AvatarWaterConstraint.js';
import { VehicleWaterConstraint } from '../application/avatar/VehicleWaterConstraint.js';
import { AvatarMovementController } from '../application/avatar/AvatarMovementController.js';
import { AvatarVehicleMovementController } from '../application/avatar/AvatarVehicleMovementController.js';
import { VehicleRuntimeInstances } from '../application/world/VehicleRuntimeInstances.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';

const SEED = DEFAULT_WORLD_SEED;
// Open sea under the default seed, about 6.5 units deep.
const SEA_POINT = { x: 5000, z: 5000 };
const DT = 0.05;

function buildProfile(username) {
    class InMemoryStorageProvider extends StorageProvider {
        constructor() { super(); this._data = new Map(); }
        save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
        load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
        remove(name) { this._data.delete(name); }
        list() { return Array.from(this._data.keys()); }
    }
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(username);
    return new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
}

// A synthetic lake: dry for x < 0, then water `depth` deep (or `depthAt(x)`).
function lake({ depth = 6, depthAt = null } = {}) {
    const depthFor = depthAt || (() => depth);
    return new AvatarWaterConstraint({
        heightAt: (x) => LAKE_SURFACE_HEIGHT - depthFor(x),
        isWaterAt: (x) => x >= 0
    });
}

function swimmer(username, position, waterConstraint, rotationY = 90) {
    const session = new AvatarPresenceSession(buildProfile(username), { position, rotation: { x: 0, y: rotationY, z: 0 } });
    const controller = new AvatarMovementController(session, null, null, null, null, waterConstraint);
    return { session, controller };
}

function ticks(controller, count) {
    for (let i = 0; i < count; i++) controller.tick(DT);
}

async function run() {
    // -------------------------------------------------------------
    // Pure rules.
    // -------------------------------------------------------------
    {
        assert(deriveAvatarSwimMode({ feetHeight: 0, waterSurfaceHeight: null }) === AvatarSwimMode.NONE, 'P1. no water, no swimming');
        assert(deriveAvatarSwimMode({ feetHeight: 0, waterSurfaceHeight: AVATAR_SWIM_DEPTH }) === AvatarSwimMode.NONE,
            'P2. water exactly at swim depth is still wading');
        assert(deriveAvatarSwimMode({ feetHeight: 0, waterSurfaceHeight: AVATAR_SWIM_DEPTH + 0.01 }) === AvatarSwimMode.SURFACE,
            'P3. deeper than half the avatar\'s height, it swims');
        const surface = 6;
        assert(deriveAvatarSwimMode({ feetHeight: surfaceSwimFeetHeight(surface), waterSurfaceHeight: surface }) === AvatarSwimMode.SURFACE,
            'P4. floating, the head is above water');
        assert(!isHeadUnderwater(surfaceSwimFeetHeight(surface), surface), 'P5. ...so it breathes');
        assert(deriveAvatarSwimMode({ feetHeight: 1, waterSurfaceHeight: surface }) === AvatarSwimMode.DIVING, 'P6. deeper down it is diving');
        assert(deriveAvatarSwimMode({ feetHeight: surface + 1, waterSurfaceHeight: surface }) === AvatarSwimMode.NONE,
            'P7. standing above the water (a pier) is not swimming');
        assert(isSwimmableDepth(surface, 0) && !isSwimmableDepth(surface, surface - 0.5), 'P8. swimmable depth is measured from what the avatar would stand on');
        assert(SURFACE_SWIM_FEET_DEPTH < AVATAR_BREATH_HEIGHT, 'P9. the floating height keeps the mouth above the surface');

        const floating = surfaceSwimFeetHeight(surface);
        const dived = stepSwimFeetHeight({ feetHeight: floating, floorHeight: 0, waterSurfaceHeight: surface, verticalInput: -1, deltaSeconds: 0.2 });
        assert(Math.abs(dived - (floating - SWIM_VERTICAL_SPEED * 0.2)) < 1e-9, 'P10. holding dive sinks at swim speed');
        const drifted = stepSwimFeetHeight({ feetHeight: 1, floorHeight: 0, waterSurfaceHeight: surface, verticalInput: 0, deltaSeconds: 0.2 });
        assert(Math.abs(drifted - (1 + BUOYANCY_SPEED * 0.2)) < 1e-9, 'P11. with no input it drifts slowly up');
        const forced = stepSwimFeetHeight({ feetHeight: 1, floorHeight: 0, waterSurfaceHeight: surface, verticalInput: -1, forcedAscent: true, deltaSeconds: 0.2 });
        assert(Math.abs(forced - (1 + FORCED_ASCENT_SPEED * 0.2)) < 1e-9, 'P12. out of air it rises whatever is held');
        assert(stepSwimFeetHeight({ feetHeight: 0.1, floorHeight: 0, waterSurfaceHeight: surface, verticalInput: -1, deltaSeconds: 0.2 }) === 0,
            'P13. it never sinks below the bottom');
        assert(stepSwimFeetHeight({ feetHeight: floating, floorHeight: 0, waterSurfaceHeight: surface, verticalInput: 1, deltaSeconds: 0.2 }) === floating,
            'P14. it never rises above the floating height');

        let breath = createAvatarBreathState();
        assert(breath.breathSeconds === BREATH_CAPACITY_SECONDS && BREATH_CAPACITY_SECONDS >= 120 && BREATH_CAPACITY_SECONDS <= 180,
            'P15. a full breath lasts between two and three minutes');
        breath = stepAvatarBreath(breath, { submerged: true, deltaSeconds: 0.2 });
        assert(Math.abs(breath.breathSeconds - (BREATH_CAPACITY_SECONDS - 0.2)) < 1e-9 && !breath.forcedAscent, 'P16. air runs down under water');
        for (let i = 0; i < BREATH_CAPACITY_SECONDS * 5; i++) breath = stepAvatarBreath(breath, { submerged: true, deltaSeconds: 0.2 });
        assert(breath.breathSeconds === 0 && breath.forcedAscent, 'P17. when it runs out, the avatar is pushed up');
        breath = stepAvatarBreath(breath, { submerged: true, deltaSeconds: 0.2 });
        assert(breath.forcedAscent, 'P18. ...and keeps being pushed until its head is out');
        breath = stepAvatarBreath(breath, { submerged: false, deltaSeconds: 1 });
        assert(breath.forcedAscent && breath.breathSeconds > 0, 'P19. at the surface it breathes again, held there while it catches its breath');
        for (let i = 0; i < 40; i++) breath = stepAvatarBreath(breath, { submerged: false, deltaSeconds: 0.25 });
        assert(breath.breathSeconds === BREATH_CAPACITY_SECONDS && !breath.forcedAscent, 'P20. a few seconds at the surface fill the breath and free it to dive');
    }

    // -------------------------------------------------------------
    // Swimming through the real movement controller.
    // -------------------------------------------------------------
    {
        const depth = 6;
        const { session, controller } = swimmer('swim-walk-in', { x: -2, y: 0, z: 0 }, lake({ depth }));
        controller.keyDown('w');
        ticks(controller, 200);
        controller.keyUp('w');
        ticks(controller, 20);
        const p = session.current.position;
        assert(p.x > 5, `C1. walking into deep water is never blocked (x = ${p.x.toFixed(2)})`);
        assert(Math.abs(p.y - surfaceSwimFeetHeight(depth)) < 1e-9, 'C2. the avatar floats with its feet below the surface and head above it');
        assert(controller.swimState().mode === AvatarSwimMode.SURFACE, 'C3. swimState() reports surface swimming');
        assert(session.current.animation === AvatarAnimationState.IDLE, 'C4. presence keeps its usual animation vocabulary (no new wire value)');

        controller.keyDown(' ');
        ticks(controller, 20);
        controller.keyUp(' ');
        assert(Math.abs(session.current.position.y - surfaceSwimFeetHeight(depth)) < 1e-9, 'C5. Space at the surface cannot lift it out of the water');

        controller.keyDown('c');
        ticks(controller, 20);
        assert(session.current.position.y < surfaceSwimFeetHeight(depth) - 1, 'C6. holding C dives');
        assert(controller.swimState().mode === AvatarSwimMode.DIVING, 'C7. swimState() reports diving');
        ticks(controller, 200);
        assert(session.current.position.y === 0, 'C8. it reaches the bottom and stops there');
        const breathAtBottom = controller.swimState().breathSeconds;
        assert(breathAtBottom < BREATH_CAPACITY_SECONDS, 'C9. air runs down while diving');

        // Stay down until the air runs out; C stays held the whole time.
        let guard = 0;
        while (!controller.swimState().forcedAscent && guard++ < BREATH_CAPACITY_SECONDS / DT + 20) controller.tick(DT);
        assert(controller.swimState().forcedAscent, 'C10. running out of air pushes the avatar up');
        ticks(controller, 80);
        assert(Math.abs(session.current.position.y - surfaceSwimFeetHeight(depth)) < 1e-9, 'C11. ...all the way to the surface, even with C held');
        assert(controller.swimState().forcedAscent, 'C12. ...and holds it there while it catches its breath');
        controller.keyUp('c');
        ticks(controller, 100);
        assert(controller.swimState().mode === AvatarSwimMode.SURFACE && !controller.swimState().forcedAscent
            && controller.swimState().breathSeconds === BREATH_CAPACITY_SECONDS, 'C13. with a full breath it is free again');

        // Let go mid-dive: it drifts back up.
        controller.keyDown('c');
        ticks(controller, 30);
        controller.keyUp('c');
        const released = session.current.position.y;
        ticks(controller, 10);
        assert(session.current.position.y > released, 'C14. released under water, it drifts up');
    }

    // Jumping in from above lands on the water, not on the bottom.
    {
        const depth = 6;
        const { session, controller } = swimmer('swim-jump-in', { x: 3, y: depth + 1, z: 0 }, lake({ depth }));
        ticks(controller, 60);
        assert(Math.abs(session.current.position.y - surfaceSwimFeetHeight(depth)) < 1e-9, 'C15. falling into deep water ends floating at the surface');
    }

    // Walking off a shelf into deep water keeps the avatar's world height rather
    // than dropping it onto the deep bed.
    {
        const shelf = 0.8;
        const deep = 6;
        const { session, controller } = swimmer('swim-drop-off', { x: 9.98, y: 0, z: 0 }, lake({ depthAt: (x) => (x < 10 ? shelf : deep) }));
        controller.keyDown('w');
        ticks(controller, 1);
        controller.keyUp('w');
        const p = session.current.position;
        assert(p.x > 10, 'C19. setup: it stepped over the edge');
        assert(Math.abs(p.y - (deep - shelf)) < 1e-9,
            `C20. its feet stay at the shelf's world height, ${(deep - shelf).toFixed(2)} above the deep bed (got ${p.y.toFixed(3)})`);
        ticks(controller, 20);
        assert(Math.abs(session.current.position.y - surfaceSwimFeetHeight(deep)) < 1e-9 && controller.swimState().mode === AvatarSwimMode.SURFACE,
            'C21. ...then settles to floating at the surface, head above water');
    }

    // A swimmer keeps its world height over a sloping bed: its terrain-relative Y
    // changes as the bed falls away beneath it.
    {
        const depthAt = (x) => 3 + x * 0.2;
        const { session, controller } = swimmer('swim-slope', { x: 2, y: 1, z: 0 }, lake({ depthAt }));
        const before = session.current.position;
        const worldBefore = before.y + (LAKE_SURFACE_HEIGHT - depthAt(before.x));
        controller.keyDown('w');
        ticks(controller, 1);
        controller.keyUp('w');
        const after = session.current.position;
        const worldAfter = after.y + (LAKE_SURFACE_HEIGHT - depthAt(after.x));
        assert(after.x > before.x, 'C16. it swam forward');
        assert(after.y > before.y + BUOYANCY_SPEED * DT, 'C17. its height above the deepening bed grew');
        assert(Math.abs(worldAfter - (worldBefore + BUOYANCY_SPEED * DT)) < 1e-9,
            'C18. ...while its world height changed only by its own drift');
    }

    // -------------------------------------------------------------
    // Swimming poses, worked out from the position, and sounds.
    // -------------------------------------------------------------
    {
        const land = getAvatarPoseOffsets(AvatarAnimationState.WALKING, 0.3);
        const landAgain = getAvatarPoseOffsets(AvatarAnimationState.WALKING, 0.3, AvatarSwimMode.NONE);
        assert(JSON.stringify(land) === JSON.stringify(landAgain), 'S1. on land the pose is unchanged');
        assert(!('bodyPitchDegrees' in land), 'S2. land poses carry no body pitch');
        const surfaceMoving = getAvatarPoseOffsets(AvatarAnimationState.WALKING, 0.3, AvatarSwimMode.SURFACE);
        const divingMoving = getAvatarPoseOffsets(AvatarAnimationState.WALKING, 0.3, AvatarSwimMode.DIVING);
        assert(divingMoving.bodyPitchDegrees > surfaceMoving.bodyPitchDegrees && divingMoving.bodyPitchDegrees >= 60,
            'S3. a diver swims nearly flat, a surface swimmer more upright');

        const observation = (swimMode, z) => ({
            position: { x: SEA_POINT.x, y: 4, z: SEA_POINT.z + z },
            animation: AvatarAnimationState.WALKING,
            verticalState: AvatarVerticalState.SUPPORTED,
            vehicleType: null,
            swimMode
        });
        let state = createAvatarSoundState();
        const surfaceCues = [];
        const diveCues = [];
        for (let i = 0; i < 40; i++) {
            const step = advanceAvatarSound(state, observation(AvatarSwimMode.SURFACE, i * 0.1), 0.1, SEED);
            state = step.state;
            surfaceCues.push(...step.cues);
        }
        for (let i = 40; i < 80; i++) {
            const step = advanceAvatarSound(state, observation(AvatarSwimMode.DIVING, i * 0.1), 0.1, SEED);
            state = step.state;
            diveCues.push(...step.cues);
        }
        assert(surfaceCues.length > 0 && surfaceCues.every((cue) => cue.kind === AVATAR_SOUND_CUE.FOOTSTEP && cue.surface === FOOTSTEP_SURFACE.WATER),
            'S4. strokes at the surface splash like steps in water');
        assert(diveCues.length === 0, 'S5. under water the avatar is silent');
    }

    // -------------------------------------------------------------
    // Vehicles stop at the waterline; a drone flies over water.
    // -------------------------------------------------------------
    {
        assert(isVehicleWaterStepAllowed(0, VEHICLE_MAX_WATER_DEPTH) && !isVehicleWaterStepAllowed(0, VEHICLE_MAX_WATER_DEPTH + 0.01),
            'V1. wheels may touch the water\'s edge, never go deeper');
        assert(isVehicleWaterStepAllowed(2, 1.5), 'V2. a vehicle standing in water can always drive toward shallower water');
        assert(droneFloorHeight(-10, -4.2) === -4.2 && droneFloorHeight(1, null) === 1, 'V3. over water a drone\'s ground is the surface');

        // Ride from the origin straight toward the open sea; start 15 units short of
        // the first water on that line.
        const length = Math.hypot(SEA_POINT.x, SEA_POINT.z);
        const dir = { x: SEA_POINT.x / length, z: SEA_POINT.z / length };
        let firstWater = null;
        for (let t = 0; t < length && !firstWater; t += 0.5) {
            if (surfaceCategoryAt(SEED, dir.x * t, dir.z * t) === SURFACE_CATEGORY.WATER) firstWater = t;
        }
        assert(firstWater !== null, 'setup: water lies between the origin and the open sea');
        const vehicles = new VehicleRuntimeInstances();
        const startX = dir.x * (firstWater - 15);
        const startZ = dir.z * (firstWater - 15);
        const start = { x: startX, y: terrainHeightAt(SEED, startX, startZ), z: startZ };
        vehicles.add(new VehicleInstance({ id: 'bike', type: VehicleType.BICYCLE, spawnPosition: start, position: start, heading: 0 }));
        const waterConstraint = new VehicleWaterConstraint({ seed: SEED });
        const vehicleController = new AvatarVehicleMovementController(vehicles, null, null, waterConstraint);
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.BICYCLE);
        const heading = Math.atan2(dir.x, dir.z) * (180 / Math.PI);
        let blocked = false;
        let deepest = 0;
        for (let i = 0; i < 400; i++) {
            vehicleController.tick({
                seed: SEED, vehicleId: 'bike', capability,
                movementIntent: { direction: 1, turnAxis: 0, running: false, brakingRequested: false },
                currentRotationY: heading, deltaSeconds: DT
            });
            if (vehicleController.isBlockedByWater()) blocked = true;
            const p = vehicles.get('bike').position;
            deepest = Math.max(deepest, waterConstraint.depthAt(p.x, p.z));
        }
        assert(blocked, 'V4. riding a bicycle at a real lake stops at the waterline');
        assert(deepest <= VEHICLE_MAX_WATER_DEPTH, `V5. ...never deeper than the tyres (${deepest.toFixed(3)})`);

        const droneStart = { x: SEA_POINT.x, y: LAKE_SURFACE_HEIGHT + 3, z: SEA_POINT.z };
        vehicles.add(new VehicleInstance({ id: 'drone', type: VehicleType.DRONE, spawnPosition: droneStart, position: droneStart, heading: 0 }));
        const droneCapability = resolveAvatarVehicleMovementCapability(VehicleType.DRONE);
        for (let i = 0; i < 100; i++) {
            vehicleController.tick({
                seed: SEED, vehicleId: 'drone', capability: droneCapability,
                movementIntent: { direction: i < 50 ? 1 : 0, turnAxis: 0, running: false, brakingRequested: false },
                currentRotationY: 0, deltaSeconds: DT
            });
        }
        const drone = vehicles.get('drone').position;
        assert(drone.z > SEA_POINT.z, 'V6. a drone flies out over the sea');
        assert(Math.abs(drone.y - LAKE_SURFACE_HEIGHT) < 1e-9, 'V7. ...and settles on the water surface, not the sea floor');
    }

    // -------------------------------------------------------------
    // The underwater view.
    // -------------------------------------------------------------
    {
        assert(underwaterViewAt(SEED, { x: SEA_POINT.x, y: LAKE_SURFACE_HEIGHT - 1, z: SEA_POINT.z }) === UNDERWATER_VIEW.SEA,
            'U1. a camera below the surface at sea looks out into the sea');
        assert(underwaterViewAt(SEED, { x: SEA_POINT.x, y: LAKE_SURFACE_HEIGHT + 0.2, z: SEA_POINT.z }) === UNDERWATER_VIEW.NONE,
            'U2. just above the surface it sees the world above the water');
        assert(underwaterViewAt(SEED, { x: 0, y: LAKE_SURFACE_HEIGHT - 1, z: 0 }) === UNDERWATER_VIEW.NONE,
            'U3. below the water line under dry land is not under water');
        assert(underwaterViewAt(SEED, null) === UNDERWATER_VIEW.NONE, 'U4. no camera, no underwater view');
    }

    // -------------------------------------------------------------
    // Underwater life.
    // -------------------------------------------------------------
    {
        const minX = SEA_POINT.x - 40;
        const minZ = SEA_POINT.z - 40;
        const seaweed = seaweedInRegion(SEED, minX, minZ, minX + 80, minZ + 80);
        const schools = fishSchoolsInRegion(SEED, minX, minZ, minX + 80, minZ + 80);
        assert(seaweed.length > 0 && schools.length > 0, 'L1. the open sea has seaweed and fish');
        assert(JSON.stringify(seaweed) === JSON.stringify(seaweedInRegion(SEED, minX, minZ, minX + 80, minZ + 80)),
            'L2. the same region always holds the same seaweed');
        for (const weed of seaweed) {
            assert(weed.type === UNDERWATER_LIFE_TYPE.SEAWEED, 'L3. seaweed is labeled as such');
            const depth = waterDepthAt(SEED, weed.x, weed.z);
            assert(depth > 0 && Math.abs(weed.y - (LAKE_SURFACE_HEIGHT - depth)) < 1e-9, 'L4. seaweed is rooted on the bed');
            assert(weed.y + weed.height < LAKE_SURFACE_HEIGHT, 'L5. ...and stays below the surface');
        }
        const halves = [
            ...fishSchoolsInRegion(SEED, minX, minZ, minX + 40, minZ + 80),
            ...fishSchoolsInRegion(SEED, minX + 40, minZ, minX + 80, minZ + 80)
        ];
        assert(halves.length === schools.length, 'L6. splitting a region into tiles neither loses nor duplicates a school');
        for (const school of schools) {
            for (const fish of school.fish) {
                for (const t of [0, 7.3, 41, 300.5]) {
                    const pose = fishPoseAt(school, fish, t);
                    const depth = waterDepthAt(SEED, pose.x, pose.z);
                    assert(depth > 0, `L7. a fish is always over water (t = ${t})`);
                    assert(pose.y < LAKE_SURFACE_HEIGHT && pose.y > LAKE_SURFACE_HEIGHT - depth,
                        `L8. a fish swims between the bed and the surface (t = ${t})`);
                }
            }
        }
        assert(seaweedInRegion(SEED, -40, -40, 40, 40).every((weed) => waterDepthAt(SEED, weed.x, weed.z) > 0),
            'L9. no seaweed grows on dry land');
    }

    console.log('✅ All Avatar Swimming tests passed.');
}

await run();
