import { readFile } from 'node:fs/promises';
import { vehicleIdFor } from '../core/VehicleIdentity.js';
import { vehiclePresenceInRegion, BICYCLE_LATTICE_SPACING } from '../core/VehiclePlacement.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';

// 0.9.74 — Deterministic Vehicle Identity, core/VehicleIdentity.js.
//
//   Section A: determinism
//   Section B: spatial distinction — different cells, different ids
//   Section C: seed distinction — different seeds, different ids
//   Section D: type independence — vehicleIdFor() takes no type at all
//   Section E: position independence — a later position change never
//              changes an already-minted id
//   Section F: VehiclePresence integration — every procedurally
//              generated bicycle carries a valid, deterministic id
//   Section G: serialization — toJSON()/fromJSON() preserves id exactly
//   Section H: architectural regression — no avatar/proximity/mounting/
//              input/movement/rendering/physics/randomness/clock/
//              persistence in core/VehicleIdentity.js
//
// Central architectural claim under test throughout: vehicleIdFor(seed,
// cellX, cellZ) is a PURE function of exactly its own three arguments —
// see docs/Roadmap.md, 0.9.74.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (err) {
        threw = true;
    }
    assert(threw, message);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — determinism
    // -------------------------------------------------------------
    {
        const a = vehicleIdFor(DEFAULT_WORLD_SEED, 3, -7);
        const b = vehicleIdFor(DEFAULT_WORLD_SEED, 3, -7);
        assert(a === b, '1. Same seed and same cell always produce the exact same id');
        assert(typeof a === 'string' && a.length > 0, '2. The id is a non-empty string');

        // Calling it many times, in any order, never drifts — no hidden
        // counter, no dependency on call history.
        for (let i = 0; i < 20; i++) {
            assert(vehicleIdFor(DEFAULT_WORLD_SEED, 3, -7) === a, `3.${i} Repeated calls with identical arguments never drift`);
        }
    }

    // -------------------------------------------------------------
    // Section B — spatial distinction
    // -------------------------------------------------------------
    {
        const origin = vehicleIdFor(DEFAULT_WORLD_SEED, 0, 0);
        const east = vehicleIdFor(DEFAULT_WORLD_SEED, 1, 0);
        const north = vehicleIdFor(DEFAULT_WORLD_SEED, 0, 1);
        const far = vehicleIdFor(DEFAULT_WORLD_SEED, 500, -500);
        const ids = new Set([origin, east, north, far]);
        assert(ids.size === 4, '4. Different cells under the same seed always produce different ids');

        // A broad sweep never collides.
        const seen = new Set();
        for (let cellX = -25; cellX <= 25; cellX++) {
            for (let cellZ = -25; cellZ <= 25; cellZ++) {
                const id = vehicleIdFor(DEFAULT_WORLD_SEED, cellX, cellZ);
                assert(!seen.has(id), `5. No two distinct cells in a 51x51 sweep ever collide on the same id (collision at ${cellX},${cellZ})`);
                seen.add(id);
            }
        }
    }

    // -------------------------------------------------------------
    // Section C — seed distinction
    // -------------------------------------------------------------
    {
        const seedA = vehicleIdFor(DEFAULT_WORLD_SEED, 12, 34);
        const seedB = vehicleIdFor(DEFAULT_WORLD_SEED ^ 0x5bd1e995, 12, 34);
        assert(seedA !== seedB, '6. The same cell under two different seeds produces two different ids');
    }

    // -------------------------------------------------------------
    // Section D — type independence
    // -------------------------------------------------------------
    {
        // vehicleIdFor() has no type parameter at all — identity names
        // the vehicle INSTANCE (a placement slot), never what kind of
        // vehicle occupies it. Enforced structurally: the function's own
        // arity is exactly 3 (seed, cellX, cellZ), with no room for a
        // fourth "type" argument to quietly slip in.
        assert(vehicleIdFor.length === 3, '7. vehicleIdFor() takes exactly three arguments — seed, cellX, cellZ — never a vehicle type');

        // Two VehiclePresence instances minted from the identical id but
        // different types remain that same id — the id says nothing
        // about, and is unaffected by, which VehicleType occupies it.
        const id = vehicleIdFor(DEFAULT_WORLD_SEED, 8, 8);
        const bicycle = new VehiclePresence({ id, type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 } });
        const car = new VehiclePresence({ id, type: VehicleType.CAR, position: { x: 0, y: 0, z: 0 } });
        assert(bicycle.id === car.id && bicycle.type !== car.type, '8. The same id can be carried by descriptors of different VehicleType — identity is independent of type');
    }

    // -------------------------------------------------------------
    // Section E — position independence
    // -------------------------------------------------------------
    {
        // vehicleIdFor() takes the pre-jitter lattice cell, never a
        // position — so it cannot possibly change if a vehicle's
        // position later does. Demonstrated concretely: minting a
        // VehiclePresence with the same id at two wildly different
        // positions (standing in for "this vehicle moved") leaves the id
        // untouched.
        const id = vehicleIdFor(DEFAULT_WORLD_SEED, -4, 15);
        const here = new VehiclePresence({ id, type: VehicleType.BICYCLE, position: { x: 0, y: 0, z: 0 } });
        const thereLater = new VehiclePresence({ id, type: VehicleType.BICYCLE, position: { x: 9999, y: 500, z: -9999 } });
        assert(here.id === thereLater.id, '9. The same id survives an arbitrary position change — identity is derived from the cell, never the runtime position');

        // vehicleIdFor() itself simply never accepts a position argument
        // that could vary independently of the cell — reconfirmed by
        // arity (Section D, test 7) rather than repeated here.
    }

    // -------------------------------------------------------------
    // Section F — VehiclePresence integration
    // -------------------------------------------------------------
    {
        const presences = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -2000, -2000, 2000, 2000);
        assert(presences.length > 0, '10. Setup: a wide scan finds bicycles to check');

        const seenIds = new Set();
        for (const p of presences) {
            assert(typeof p.id === 'string' && p.id.length > 0, '11. Every procedurally generated bicycle carries a non-empty string id');
            assert(p.id.startsWith('vehicle:'), '12. Every generated id follows core/VehicleIdentity.js\'s own `vehicle:<seed>:<cellX>,<cellZ>` shape');
            assert(!seenIds.has(p.id), `13. No two bicycles in the same region share an id (duplicate: ${p.id})`);
            seenIds.add(p.id);
        }

        // Determinism carries through the whole placement pipeline, not
        // just vehicleIdFor() in isolation: the same region query twice
        // reproduces byte-identical ids, element for element.
        const again = vehiclePresenceInRegion(DEFAULT_WORLD_SEED, -2000, -2000, 2000, 2000);
        assert(presences.length === again.length && presences.every((p, i) => p.id === again[i].id),
            '14. Re-querying the same region reproduces the exact same ids, in the exact same order');

        assert(typeof BICYCLE_LATTICE_SPACING === 'number' && BICYCLE_LATTICE_SPACING > 0, '15. Setup sanity: BICYCLE_LATTICE_SPACING is a positive number');
    }

    // -------------------------------------------------------------
    // Section G — serialization
    // -------------------------------------------------------------
    {
        const id = vehicleIdFor(DEFAULT_WORLD_SEED, 2, -9);
        const presence = new VehiclePresence({ id, type: VehicleType.BICYCLE, position: { x: 1, y: 2, z: 3 } });
        const json = presence.toJSON();
        assert(json.id === id, '16. toJSON() carries the id through exactly');

        const roundTripped = VehiclePresence.fromJSON(json);
        assert(roundTripped.id === id, '17. fromJSON(toJSON()) preserves the id exactly');
        assert(roundTripped.id === presence.id, '18. A round-tripped descriptor\'s id matches the original\'s id');
    }

    // -------------------------------------------------------------
    // Section H — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehicleIdentity.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'Avatar', 'proximity', 'Proximity', 'withinRadius',
            'mount', 'dismount', 'ride', 'rider', 'occupant',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent',
            'velocity', 'acceleration', 'heading',
            'THREE', 'from \'three\'', 'Renderer', 'canvas', 'WebGL',
            'Math.random', 'crypto.randomUUID',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'localStorage', 'StorageProvider', 'fetch(', 'WebSocket'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `19. core/VehicleIdentity.js's own code never references "${term}" — a pure, standalone identity primitive`);
        }
    }
    {
        const exportsModule = await import('../core/VehicleIdentity.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['vehicleIdFor']),
            '20. core/VehicleIdentity.js exports exactly vehicleIdFor(), nothing else');
    }

    // -------------------------------------------------------------
    // Defensive validation
    // -------------------------------------------------------------
    {
        assertThrows(() => vehicleIdFor('not-a-number', 0, 0), '21. a non-numeric seed throws');
        assertThrows(() => vehicleIdFor(DEFAULT_WORLD_SEED, 1.5, 0), '22. a non-integer cellX throws');
        assertThrows(() => vehicleIdFor(DEFAULT_WORLD_SEED, 0, NaN), '23. a NaN cellZ throws');
        assertThrows(() => vehicleIdFor(DEFAULT_WORLD_SEED, Infinity, 0), '24. a non-finite cellX throws');
        assertThrows(() => vehicleIdFor(), '25. missing arguments throw');
    }

    console.log('✅ All Deterministic Vehicle Identity (VehicleIdentity) tests passed.');
}

await runTests();
