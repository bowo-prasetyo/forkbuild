import { readFile } from 'node:fs/promises';
import { VehicleRuntimeInstances } from '../application/VehicleRuntimeInstances.js';
import { nearbyVehicleInstances, VEHICLE_RENDER_RADIUS } from '../application/NearbyVehicleInstances.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { isValidVehicleInstance } from '../core/VehicleInstance.js';

// 0.9.116 — Mounted Vehicle Movement, application/VehicleRuntimeInstances.js.
//
//   Section A: sync() discovers exactly what nearbyVehicleInstances()
//              itself would, on an empty store — position === spawnPosition
//   Section B: an already-tracked vehicle is returned by REFERENCE on a
//              later sync() — never re-derived from the deterministic
//              bridge a second time
//   Section C: the central architectural claim — a moved vehicle is
//              never lost even once its OWN deterministic spawn point
//              falls outside the queried region around its new position
//   Section D: a stationary, never-moved vehicle still drops out of the
//              store once genuinely out of range — no behavior change
//              for the case 0.9.115 alone ever exercised
//   Section E: setPosition() never fabricates an entry for an id this
//              store has not itself discovered
//   Section F: get() returns null for an unknown id
//   Section G: clear() empties the store
//   Section H: architectural regression — no second placement algorithm,
//              no direct VehicleInstance mutation, no vehicle-movement
//              math of its own
//
// Central architectural claim under test throughout: once a vehicle is
// tracked, its CURRENT runtime position — never core/VehiclePlacement.js's
// own deterministic spawn point — is the one thing that decides whether
// it is still visible. See docs/Roadmap.md, 0.9.116, "One subtle issue
// to resolve."

const REAL_VEHICLE_ID = 'vehicle:1179337264:-8,-1';

function findRealVehicle() {
    const vehicles = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -500, -500, 500, 500);
    const vehicle = vehicles.find((v) => v.id === REAL_VEHICLE_ID);
    if (!vehicle) {
        throw new Error(`Test fixture vehicle ${REAL_VEHICLE_ID} not found under DEFAULT_WORLD_SEED — has core/VehiclePlacement.js changed?`);
    }
    return vehicle;
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const realVehicle = findRealVehicle();

    // -------------------------------------------------------------
    // Section A — sync() discovers exactly what nearbyVehicleInstances()
    // itself would, on an empty store.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const center = { x: realVehicle.position.x, z: realVehicle.position.z };
        const expected = nearbyVehicleInstances(DEFAULT_WORLD_SEED, center);
        const actual = store.sync(DEFAULT_WORLD_SEED, center);

        assert(actual.length === expected.length, '1. sync() on an empty store returns exactly what nearbyVehicleInstances() itself would');
        const found = actual.find((v) => v.id === REAL_VEHICLE_ID);
        assert(found !== undefined, '2. the known fixture vehicle is present');
        assert(isValidVehicleInstance(found), '3. a real VehicleInstance, never a raw coordinate');
        assert(found.position.x === found.spawnPosition.x && found.position.z === found.spawnPosition.z,
            '4. a freshly-discovered vehicle starts with position === spawnPosition');
        assert(store.get(REAL_VEHICLE_ID) === found, '5. get() returns the exact same object sync() just returned');
    }

    // -------------------------------------------------------------
    // Section B — an already-tracked vehicle is returned by REFERENCE
    // on a later sync() — never re-derived a second time.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const center = { x: realVehicle.position.x, z: realVehicle.position.z };
        const first = store.sync(DEFAULT_WORLD_SEED, center).find((v) => v.id === REAL_VEHICLE_ID);
        const second = store.sync(DEFAULT_WORLD_SEED, center).find((v) => v.id === REAL_VEHICLE_ID);
        assert(first === second, '6. a second sync() at the same center returns the SAME tracked VehicleInstance object, never a freshly re-derived one');
    }

    // -------------------------------------------------------------
    // Section C — the central architectural claim: a moved vehicle is
    // never lost, even once its own deterministic spawn point falls
    // outside the region a query centered on its NEW position would
    // scan.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const spawnCenter = { x: realVehicle.position.x, z: realVehicle.position.z };
        store.sync(DEFAULT_WORLD_SEED, spawnCenter);
        assert(store.get(REAL_VEHICLE_ID) !== null, '7. sanity: the fixture vehicle is tracked after the first sync()');

        // Ride it far enough away that a bare nearbyVehicleInstances()
        // query centered on the NEW position would never mention this
        // vehicle's own (unchanged) deterministic spawn point again.
        const farAway = {
            x: realVehicle.position.x + VEHICLE_RENDER_RADIUS * 3,
            y: realVehicle.position.y,
            z: realVehicle.position.z + VEHICLE_RENDER_RADIUS * 3
        };
        const rawQueryFromFarAway = nearbyVehicleInstances(DEFAULT_WORLD_SEED, { x: farAway.x, z: farAway.z });
        assert(rawQueryFromFarAway.find((v) => v.id === REAL_VEHICLE_ID) === undefined,
            '8. sanity: a bare deterministic requery centered on the new position no longer mentions this vehicle at all');

        store.setPosition(REAL_VEHICLE_ID, farAway);
        const afterMove = store.get(REAL_VEHICLE_ID);
        assert(afterMove.position.x === farAway.x && afterMove.position.z === farAway.z,
            '9. setPosition() actually updated the tracked runtime position');
        assert(afterMove.spawnPosition.x === realVehicle.position.x && afterMove.spawnPosition.z === realVehicle.position.z,
            '10. ...and spawnPosition is untouched — VehicleInstance#withPosition()\'s own invariant, reused, not reimplemented');

        // The vehicle just rode 150 units away — sync() centered on ITS
        // OWN new position must still find it, purely because it is
        // ALREADY tracked and still within radius of the new center,
        // never because the deterministic query mentions it (Section 8
        // already proved it does not).
        const resynced = store.sync(DEFAULT_WORLD_SEED, { x: farAway.x, z: farAway.z });
        const stillTracked = resynced.find((v) => v.id === REAL_VEHICLE_ID);
        assert(stillTracked !== undefined,
            '11. THE CENTRAL CLAIM: a moved, already-tracked vehicle survives sync() even though the deterministic bridge alone would have dropped it — see this file\'s own header, "One subtle issue to resolve"');
        assert(stillTracked.position.x === farAway.x && stillTracked.position.z === farAway.z,
            '12. ...and its runtime position was never reset back to spawnPosition by the resync');
    }

    // -------------------------------------------------------------
    // Section D — a stationary, never-moved vehicle still drops out of
    // the store once genuinely out of range — no regression for the
    // 0.9.115 case.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const spawnCenter = { x: realVehicle.position.x, z: realVehicle.position.z };
        store.sync(DEFAULT_WORLD_SEED, spawnCenter);
        assert(store.get(REAL_VEHICLE_ID) !== null, '13. sanity: tracked after the first sync()');

        const wayOutOfRange = { x: realVehicle.position.x + 100000, z: realVehicle.position.z + 100000 };
        store.sync(DEFAULT_WORLD_SEED, wayOutOfRange);
        assert(store.get(REAL_VEHICLE_ID) === null,
            '14. a vehicle that never moved, once far enough from the new center, is dropped exactly like a bare deterministic requery would omit it');
    }

    // -------------------------------------------------------------
    // Section E — setPosition() never fabricates an entry for an id
    // this store has not itself discovered.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const result = store.setPosition('vehicle:nobody:0,0', { x: 1, y: 0, z: 1 });
        assert(result === null, '15. setPosition() on an untracked id returns null, never inventing a vehicle');
        assert(store.get('vehicle:nobody:0,0') === null, '16. ...and never adds one either');
    }

    // -------------------------------------------------------------
    // Section F — get() returns null for an unknown id.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        assert(store.get('anything') === null, '17. get() on a brand-new store returns null, never throws');
    }

    // -------------------------------------------------------------
    // Section G — clear() empties the store.
    // -------------------------------------------------------------
    {
        const store = new VehicleRuntimeInstances();
        const spawnCenter = { x: realVehicle.position.x, z: realVehicle.position.z };
        store.sync(DEFAULT_WORLD_SEED, spawnCenter);
        assert(store.get(REAL_VEHICLE_ID) !== null, '18. sanity: tracked');
        store.clear();
        assert(store.get(REAL_VEHICLE_ID) === null, '19. clear() actually empties the store');
        assert(store.sync(DEFAULT_WORLD_SEED, spawnCenter).length > 0, '20. ...and a subsequent sync() rediscovers vehicles normally, exactly like a brand-new store');
    }

    // -------------------------------------------------------------
    // Section H — architectural regression.
    // -------------------------------------------------------------
    {
        const source = await readFile(new URL('../application/VehicleRuntimeInstances.js', import.meta.url), 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        for (const term of ['vehicleIdFor', 'VehicleIdentity', '.position =', '.position=', 'THREE']) {
            assert(!codeOnly.includes(term),
                `21. application/VehicleRuntimeInstances.js's own CODE (comments aside) never references "${term}" — identity, direct mutation, and rendering all stay entirely someone else's job`);
        }
        assert(!codeOnly.includes('vehiclePresenceInRegion'),
            '21b. application/VehicleRuntimeInstances.js\'s own code never calls core/VehiclePlacement.js directly — discovery is exclusively through application/NearbyVehicleInstances.js\'s own bridge, never a second placement query');
        assert(codeOnly.includes('withinRadiusXZ'), '22. removal reuses core/AvatarVehicleProximity.js\'s own withinRadiusXZ(), never a second distance primitive');
        assert(codeOnly.includes('withPosition'), '23. position replacement reuses VehicleInstance#withPosition(), never a direct field assignment');
    }

    console.log('✅ All Vehicle Runtime Instances tests passed.');
}

await runTests();
