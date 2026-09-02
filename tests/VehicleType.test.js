import { readFile } from 'node:fs/promises';
import { VehicleType, isValidVehicleType } from '../core/VehicleType.js';

// 0.9.70 — Vehicle Type Vocabulary, core/VehicleType.js.
//
//   Section A: the vocabulary itself — NONE/BICYCLE/MOTORCYCLE/CAR/DRONE
//   Section B: isValidVehicleType() accepts every member, rejects everything else
//   Section C: architectural regression — no movement, no mounting, no
//              speed/capability vocabulary, no controller, no rendering
//
// Central architectural claim under test throughout: this milestone
// introduces a name for what a vehicle IS and nothing about what a
// vehicle DOES — see docs/Roadmap.md, 0.9.70.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const { NONE, BICYCLE, MOTORCYCLE, CAR, DRONE } = VehicleType;

    // -------------------------------------------------------------
    // Section A — the vocabulary itself
    // -------------------------------------------------------------
    {
        assert(NONE === 'none', '1. VehicleType.NONE is "none"');
        assert(BICYCLE === 'bicycle', '2. VehicleType.BICYCLE is "bicycle"');
        assert(MOTORCYCLE === 'motorcycle', '3. VehicleType.MOTORCYCLE is "motorcycle"');
        assert(CAR === 'car', '4. VehicleType.CAR is "car"');
        assert(DRONE === 'drone', '5. VehicleType.DRONE is "drone"');
        assert(Object.isFrozen(VehicleType), '6. VehicleType is frozen, like every other closed vocabulary in this codebase');
        assert(Object.keys(VehicleType).length === 5, '7. VehicleType has exactly five values, no sixth');
    }

    // -------------------------------------------------------------
    // Section B — isValidVehicleType()
    // -------------------------------------------------------------
    {
        assert(isValidVehicleType(NONE), '8. NONE is valid');
        assert(isValidVehicleType(BICYCLE), '9. BICYCLE is valid');
        assert(isValidVehicleType(MOTORCYCLE), '10. MOTORCYCLE is valid');
        assert(isValidVehicleType(CAR), '11. CAR is valid');
        assert(isValidVehicleType(DRONE), '12. DRONE is valid');
        assert(!isValidVehicleType('scooter'), '13. an unrelated string is not valid');
        assert(!isValidVehicleType('BICYCLE'), '14. the vocabulary is case-sensitive — the enum key is not itself a valid value');
        assert(!isValidVehicleType(undefined), '15. undefined is not valid');
        assert(!isValidVehicleType(null), '16. null is not valid');
        assert(!isValidVehicleType(0), '17. a number is not valid');
        assert(!isValidVehicleType({}), '18. an object is not valid');
    }

    // -------------------------------------------------------------
    // Section C — architectural regression
    // -------------------------------------------------------------
    {
        const sourceUrl = new URL('../core/VehicleType.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');

        const forbidden = [
            'AvatarMovementController', 'AvatarMovementState', 'simulateAvatarMovement',
            'AvatarMovementConstraint', 'AvatarTerrainConstraint', 'AvatarTreeConstraint',
            'AvatarContinuousMovementIntent', 'AvatarContinuousMovementMode',
            'mount', 'dismount', 'ride', 'GROUND', 'AERIAL',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now',
            'addEventListener', 'keydown', 'keyup', 'KeyboardEvent',
            'THREE', 'from \'three\'', 'Renderer', 'WorldNavigationSession',
            'Math.random', 'localStorage', 'StorageProvider', 'fetch(', 'WebSocket',
            'velocity', 'acceleration', 'speed', 'position', 'rotation', 'collision'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `19. core/VehicleType.js's own code never references "${term}" — a pure identity vocabulary only, never movement, mounting, or capability`);
        }
    }
    {
        const exportsModule = await import('../core/VehicleType.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify(['VehicleType', 'isValidVehicleType']),
            '20. core/VehicleType.js exports exactly the vocabulary and its validator — no transition function, nothing else');
    }

    console.log('✅ All Vehicle Type tests passed.');
}

await runTests();
