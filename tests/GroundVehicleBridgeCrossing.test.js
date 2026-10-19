import { readFile } from 'node:fs/promises';
import { AvatarVehicleMovementController } from '../application/avatar/AvatarVehicleMovementController.js';
import { AvatarVehicleInteractionController } from '../application/avatar/AvatarVehicleInteractionController.js';
import { AvatarMovementConstraint } from '../application/avatar/AvatarMovementConstraint.js';
import { AvatarStepConstraint } from '../application/avatar/AvatarStepConstraint.js';
import { VehicleWaterConstraint } from '../application/avatar/VehicleWaterConstraint.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { AvatarInventoryStore } from '../application/avatar/AvatarInventoryStore.js';
import { VehicleRuntimeInstances } from '../application/world/VehicleRuntimeInstances.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { resolveAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { createAvatarInventoryEntry, emptyAvatarInventory, withEntryAdded, InventoryEntryKind } from '../core/AvatarInventory.js';
import { BICYCLE_DISMOUNT_OFFSET_X } from '../core/AvatarVehicleDismountPosition.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { LAKE_SURFACE_HEIGHT } from '../core/Hydrology.js';
import { VehicleInstance } from '../core/VehicleInstance.js';
import { VehicleType } from '../core/VehicleType.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { assert } from './support/Assert.js';

// Ground vehicles drive up ramps and across bridges, as an avatar on foot
// walks them: application/avatar/AvatarVehicleMovementController.js with a
// stepConstraint, driven over the Hay Wain Bridge example build
// (forkbuild-document-hay-wain-bridge.json) and, in Section F, the Packhorse
// Arch (forkbuild-document-packhorse-arch.json).
//
//   Section A: the wagon, bicycle and motorcycle each cross the bridge, deck
//              over the river, back on the ground on the far bank
//   Section B: without a stepConstraint nothing changes: the wagon stays on
//              the ground and the abutment stops it
//   Section C: without the bridge, the river still stops them
//   Section D: off the open end of the deck, a vehicle falls to the ground;
//              over the river the truss keeps it on the deck
//   Section E: getting off on the deck leaves the avatar on the deck, and a
//              vehicle put down on the deck stands on it
//   Section F: every ground vehicle drives over the Packhorse Arch's hump,
//              and its fences keep the wagon on the crown
//   Section G: on low ground (terrain well below zero) a wall still stops
//              the wagon: bricks are measured from the ground, and so is
//              the height it collides at
//
// The bridge's river is a few blue slabs, not world water, so the water
// constraint is told the river is there: a bed a full unit below the lake
// surface, under the slabs, nowhere else.

const SEED = DEFAULT_WORLD_SEED;
const ORIGIN = { x: 40, y: 0, z: -25 };
const DECK_TOP = 1.25;
const DT = 0.05;
const FORWARD = Object.freeze({ direction: 1, turnAxis: 0, running: false, brakingRequested: false });
const GROUND_TYPES = [VehicleType.CAR, VehicleType.BICYCLE, VehicleType.MOTORCYCLE];

// `halfWidth`: half the river's width along the road (x); it is 8 long (z).
function inRiver(x, z, halfWidth = 4) {
    return Math.abs(x - ORIGIN.x) < halfWidth && Math.abs(z - ORIGIN.z) < 4;
}

function riverWater(halfWidth = 4) {
    const wet = (x, z) => inRiver(x, z, halfWidth);
    return new VehicleWaterConstraint({
        seed: SEED,
        isWaterAt: wet,
        heightAt: (x, z) => (wet(x, z) ? LAKE_SURFACE_HEIGHT - 1 : terrainHeightAt(SEED, x, z))
    });
}

function store(instances) {
    const map = new Map(instances.map((instance) => [instance.id, instance]));
    return {
        get: (id) => map.get(id) || null,
        setPosition(id, position) { const next = map.get(id).withPosition(position); map.set(id, next); return next; },
        setHeading(id, heading) { const next = map.get(id).withHeading(heading); map.set(id, next); return next; }
    };
}

function liftOf(position) {
    return position.y - terrainHeightAt(SEED, position.x, position.z);
}

// A vehicle at (x, z) relative to the bridge, `lift` above the ground there.
function vehicleAt(id, type, x, z, heading, lift = 0) {
    const wx = ORIGIN.x + x;
    const wz = ORIGIN.z + z;
    const position = { x: wx, y: terrainHeightAt(SEED, wx, wz) + lift, z: wz };
    return new VehicleInstance({ id, type, spawnPosition: position, position, heading });
}

function constraints(loadedDocuments, brickRegistry) {
    const getWorldPosition = () => ORIGIN;
    return {
        movement: new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: 0.6 }),
        step: new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry })
    };
}

// Drives `vehicle` forward and records what happened along the way.
function drive(vehicle, { movement, step, water, riverHalfWidth = 4 }, ticks) {
    const vehicles = store([vehicle]);
    const controller = new AvatarVehicleMovementController(vehicles, movement, null, water, step);
    const capability = resolveAvatarVehicleMovementCapability(vehicle.type);
    const trace = { liftsOverRiver: [], blockedByWater: false, collided: false, maxLift: 0 };
    for (let i = 0; i < ticks; i++) {
        controller.tick({ seed: SEED, vehicleId: vehicle.id, capability, movementIntent: FORWARD, currentRotationY: vehicle.heading, deltaSeconds: DT });
        const p = vehicles.get(vehicle.id).position;
        if (inRiver(p.x, p.z, riverHalfWidth)) trace.liftsOverRiver.push(liftOf(p));
        trace.maxLift = Math.max(trace.maxLift, liftOf(p));
        trace.blockedByWater ||= controller.isBlockedByWater();
        trace.collided ||= controller.isCollided();
    }
    const end = vehicles.get(vehicle.id).position;
    return { ...trace, end, x: end.x - ORIGIN.x, z: end.z - ORIGIN.z, lift: liftOf(end) };
}

async function runTests() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const json = JSON.parse(await readFile(new URL('../forkbuild-document-hay-wain-bridge.json', import.meta.url), 'utf8'));
    const bridge = new DocumentSerializer().deserialize(json);
    const withBridge = constraints(new Map([['bridge', bridge]]), brickRegistry);
    const withoutBridge = constraints(new Map(), brickRegistry);

    // -------------------------------------------------------------
    // Section A — every ground vehicle crosses
    // -------------------------------------------------------------
    for (const type of GROUND_TYPES) {
        const run = drive(vehicleAt(`a:${type}`, type, -12, 0, 90), { ...withBridge, water: riverWater() }, 400);
        assert(run.x > 12, `A1. a ${type} drives up the west ramp, over the river and down the east ramp (ended at x ${run.x.toFixed(2)})`);
        assert(run.liftsOverRiver.length > 0 && run.liftsOverRiver.every((lift) => Math.abs(lift - DECK_TOP) < 1e-6),
            `A2. a ${type} is on the deck the whole way over the river, never in it`);
        assert(!run.blockedByWater, `A3. the river under the deck never stops a ${type}`);
        assert(Math.abs(run.maxLift - DECK_TOP) < 1e-6, `A4. a ${type} never climbs higher than the deck (the curbs and truss keep it in the road)`);
        assert(Math.abs(run.lift) < 1e-9, `A5. a ${type} is back on the ground on the far bank`);
        assert(Math.abs(run.z) < 1e-9, `A6. a ${type} drives straight across, never pushed aside`);
    }

    // -------------------------------------------------------------
    // Section B — no stepConstraint: unchanged, the abutment is a wall
    // -------------------------------------------------------------
    {
        const run = drive(vehicleAt('b', VehicleType.CAR, -12, 0, 90), { movement: withBridge.movement, step: null, water: riverWater() }, 400);
        assert(run.collided && run.x < -6, `B1. without a stepConstraint the wagon stops at the west abutment (x ${run.x.toFixed(2)})`);
        assert(run.maxLift < 0.05, `B2. ...and never leaves the ground (it follows the terrain a tick behind, as it always has: ${run.maxLift.toFixed(3)})`);
    }

    // -------------------------------------------------------------
    // Section C — no bridge, the river stops them
    // -------------------------------------------------------------
    for (const type of GROUND_TYPES) {
        const run = drive(vehicleAt(`c:${type}`, type, -12, 0, 90), { ...withoutBridge, water: riverWater() }, 400);
        assert(run.blockedByWater && run.x < -3.9, `C1. with no bridge a ${type} stops at the river bank (x ${run.x.toFixed(2)})`);
    }

    // -------------------------------------------------------------
    // Section D — falling off the open end, held in over the river
    // -------------------------------------------------------------
    {
        // East end of the deck, past the truss, driving off its north edge.
        const run = drive(vehicleAt('d1', VehicleType.CAR, 5, 0, 0, DECK_TOP), { ...withBridge, water: riverWater() }, 200);
        assert(run.z > 4 && Math.abs(run.lift) < 1e-9, `D1. driven off the open end of the deck, the wagon drops to the ground and carries on (z ${run.z.toFixed(2)})`);

        // Mid-span, steering at the truss.
        const held = drive(vehicleAt('d2', VehicleType.CAR, 0, 0, 0, DECK_TOP), { ...withBridge, water: riverWater() }, 200);
        assert(held.collided && held.z < 1.5, `D2. over the river the truss stops the wagon (z ${held.z.toFixed(2)})`);
        assert(Math.abs(held.lift - DECK_TOP) < 1e-6, 'D3. ...and it is still on the deck');
    }

    // -------------------------------------------------------------
    // Section E — getting off and putting down on the deck
    // -------------------------------------------------------------
    {
        const vehicleRuntimeInstances = new VehicleRuntimeInstances();
        const wagon = vehicleAt('e:wagon', VehicleType.CAR, 0, 0, 90, DECK_TOP);
        vehicleRuntimeInstances.add(wagon);
        const avatarPresenceSession = new AvatarPresenceSession(
            { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
            { position: new Position(wagon.position.x - 0.5, DECK_TOP, wagon.position.z) }
        );
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances });
        const press = (key) => { controller.keyDown(key); controller.tick(); controller.keyUp(key); };
        press('e');
        assert(controller.mount() !== null, 'E1. setup: mounted the wagon on the deck');
        press('e');
        assert(controller.mount() === null, 'E2. setup: got off');
        const avatar = avatarPresenceSession.current.position;
        assert(Math.abs(avatar.x - (wagon.position.x + BICYCLE_DISMOUNT_OFFSET_X)) < 1e-9 && Math.abs(avatar.y - DECK_TOP) < 1e-9,
            `E3. getting off on the deck leaves the avatar standing on the deck (y ${avatar.y}), not under it`);
    }
    {
        const vehicleRuntimeInstances = new VehicleRuntimeInstances();
        const avatarInventoryStore = new AvatarInventoryStore();
        avatarInventoryStore.set(withEntryAdded(emptyAvatarInventory(), createAvatarInventoryEntry({ id: 'carried-wagon', kind: InventoryEntryKind.VEHICLE, type: VehicleType.CAR })));
        const at = { x: ORIGIN.x + 2, z: ORIGIN.z };
        const avatarPresenceSession = new AvatarPresenceSession(
            { avatarId: 'tester-avatar', ownerIdentity: 'tester-owner' },
            { position: new Position(at.x, DECK_TOP, at.z) }
        );
        const controller = new AvatarVehicleInteractionController(avatarPresenceSession, { seed: SEED, vehicleRuntimeInstances, avatarInventoryStore });
        controller.keyDown('q');
        controller.tick();
        controller.keyUp('q');
        const mount = controller.mount();
        assert(mount !== null, 'E4. setup: put the wagon down on the deck');
        const deployed = vehicleRuntimeInstances.get(mount.vehicleId);
        assert(Math.abs(liftOf(deployed.position) - DECK_TOP) < 1e-9, `E5. a wagon put down on the deck stands on the deck (lift ${liftOf(deployed.position)})`);
    }

    // -------------------------------------------------------------
    // Section F — over the Packhorse Arch's hump
    // -------------------------------------------------------------
    {
        const archJson = JSON.parse(await readFile(new URL('../forkbuild-document-packhorse-arch.json', import.meta.url), 'utf8'));
        const withArch = constraints(new Map([['arch', new DocumentSerializer().deserialize(archJson)]]), brickRegistry);
        const CROWN_TOP = 2.5;
        const river = { water: riverWater(2), riverHalfWidth: 2 };
        for (const type of GROUND_TYPES) {
            const run = drive(vehicleAt(`f:${type}`, type, -9, 0, 90), { ...withArch, ...river }, 400);
            assert(run.x > 8, `F1. a ${type} drives up one side of the Packhorse Arch and down the other (ended at x ${run.x.toFixed(2)})`);
            assert(run.liftsOverRiver.length > 0 && run.liftsOverRiver.every((lift) => Math.abs(lift - CROWN_TOP) < 1e-6),
                `F2. a ${type} is on the crown the whole way over the river`);
            assert(!run.blockedByWater && Math.abs(run.maxLift - CROWN_TOP) < 1e-6, `F3. a ${type} never meets the water and never climbs above the crown`);
            assert(Math.abs(run.lift) < 1e-9 && Math.abs(run.z) < 1e-9, `F4. a ${type} comes down straight onto the far bank`);
        }
        const held = drive(vehicleAt('f:held', VehicleType.CAR, 0, 0, 0, CROWN_TOP), { ...withArch, ...river }, 200);
        assert(held.collided && held.z < 1.8 && Math.abs(held.lift - CROWN_TOP) < 1e-6,
            `F5. the fences keep the wagon on the crown (z ${held.z.toFixed(2)}, lift ${held.lift.toFixed(2)})`);
    }

    // -------------------------------------------------------------
    // Section G — low ground, same walls
    // -------------------------------------------------------------
    {
        const LOW = { x: -3000, y: 0, z: -2550 };
        assert(terrainHeightAt(SEED, LOW.x, LOW.z) < -3, 'G setup: the ground here is more than 3 below zero');
        const world = new World();
        const building = new Building({ creator: 'test' });
        building.addBrick(new Brick({ definitionId: 'core:block_2x2', position: new Position(0, 1, 0) }));
        world.addBuilding(building);
        const loadedDocuments = new Map([['h', { world }]]);
        const getWorldPosition = () => LOW;
        const movement = new AvatarMovementConstraint({ loadedDocuments, getWorldPosition, brickRegistry, maxStepHeight: 0.6 });
        const step = new AvatarStepConstraint({ loadedDocuments, getWorldPosition, brickRegistry });
        const start = { x: LOW.x - 6, y: terrainHeightAt(SEED, LOW.x - 6, LOW.z), z: LOW.z };
        const wagon = new VehicleInstance({ id: 'h', type: VehicleType.CAR, spawnPosition: start, position: start, heading: 90 });
        const vehicles = store([wagon]);
        const controller = new AvatarVehicleMovementController(vehicles, movement, null, null, step);
        const capability = resolveAvatarVehicleMovementCapability(VehicleType.CAR);
        let collided = false;
        for (let i = 0; i < 200; i++) {
            controller.tick({ seed: SEED, vehicleId: 'h', capability, movementIntent: FORWARD, currentRotationY: 90, deltaSeconds: DT });
            collided ||= controller.isCollided();
        }
        const x = vehicles.get('h').position.x - LOW.x;
        assert(collided && x < -1.7, `G1. the wagon stops at a block 2 high instead of driving through it (x ${x.toFixed(2)})`);
    }

    console.log('✅ All Ground Vehicle Bridge Crossing tests passed.');
}

await runTests();
