import { readFile } from 'node:fs/promises';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';

// 0.9.123 — Vehicle Orientation, core/VehicleMovementHeading.js.
//
//   Section A: a cardinal-direction displacement produces the expected
//              heading, matching core/AvatarMovementSimulation.js's own
//              rotationY convention (0 = +Z, 90 = +X, 180 = -Z, 270 = -X)
//   Section B: zero/degenerate displacement never invents a heading —
//              previousHeading is returned unchanged
//   Section C: non-finite inputs degrade to previousHeading, never NaN
//   Section D: the result is always normalized to [0, 360)
//   Section E: architectural regression — pure, no dependencies

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — cardinal directions
    // -------------------------------------------------------------
    {
        assert(Math.abs(resolveVehicleHeadingFromMovement({ dx: 0, dz: 1 }) - 0) < 1e-9, '1. moving purely +Z resolves to heading 0');
        assert(Math.abs(resolveVehicleHeadingFromMovement({ dx: 1, dz: 0 }) - 90) < 1e-9, '2. moving purely +X resolves to heading 90');
        assert(Math.abs(resolveVehicleHeadingFromMovement({ dx: 0, dz: -1 }) - 180) < 1e-9, '3. moving purely -Z resolves to heading 180');
        assert(Math.abs(resolveVehicleHeadingFromMovement({ dx: -1, dz: 0 }) - 270) < 1e-9, '4. moving purely -X resolves to heading 270');
    }
    {
        // A diagonal displacement resolves to the expected 45-degree
        // heading, and scaling the same direction (a longer step) never
        // changes the resulting heading.
        const small = resolveVehicleHeadingFromMovement({ dx: 1, dz: 1 });
        const large = resolveVehicleHeadingFromMovement({ dx: 100, dz: 100 });
        assert(Math.abs(small - 45) < 1e-9, '5. an equal +X/+Z displacement resolves to heading 45');
        assert(Math.abs(small - large) < 1e-9, '6. heading depends only on direction, never on step distance');
    }

    // -------------------------------------------------------------
    // Section B — zero/degenerate displacement never invents a heading
    // -------------------------------------------------------------
    {
        assert(resolveVehicleHeadingFromMovement({ dx: 0, dz: 0, previousHeading: 123 }) === 123,
            '7. zero displacement returns previousHeading unchanged, never atan2(0,0) === 0');
        assert(resolveVehicleHeadingFromMovement({ dx: 0, dz: 0 }) === 0,
            '8. zero displacement with no previousHeading falls back to the same neutral 0 default VehicleInstance itself uses');
        assert(resolveVehicleHeadingFromMovement({ dx: -0, dz: 0, previousHeading: 88 }) === 88,
            '9. negative-zero displacement is still treated as zero displacement');
    }

    // -------------------------------------------------------------
    // Section C — non-finite inputs degrade to previousHeading
    // -------------------------------------------------------------
    {
        assert(resolveVehicleHeadingFromMovement({ dx: NaN, dz: 1, previousHeading: 50 }) === 50,
            '10. a NaN dx falls back to previousHeading, never NaN');
        assert(resolveVehicleHeadingFromMovement({ dx: 1, dz: Infinity, previousHeading: 50 }) === 50,
            '11. a non-finite dz falls back to previousHeading, never NaN/Infinity');
        assert(resolveVehicleHeadingFromMovement({ dx: 1, dz: 1, previousHeading: NaN }) !== undefined,
            '12. sanity: a real displacement with a NaN previousHeading still returns a number');
        assert(Number.isFinite(resolveVehicleHeadingFromMovement({ dx: 1, dz: 1, previousHeading: NaN })),
            '13. a real displacement with a non-finite previousHeading still resolves to a real, finite heading (from the displacement itself)');
        assert(resolveVehicleHeadingFromMovement({ dx: 0, dz: 0, previousHeading: NaN }) === 0,
            '14. zero displacement with a non-finite previousHeading falls back to the neutral 0 default, never NaN');
    }

    // -------------------------------------------------------------
    // Section D — the result is always normalized to [0, 360)
    // -------------------------------------------------------------
    {
        for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [-1, 1], [1, -1]]) {
            const heading = resolveVehicleHeadingFromMovement({ dx, dz });
            assert(heading >= 0 && heading < 360, `15.${dx},${dz} heading ${heading} stays within [0, 360)`);
        }
    }

    // -------------------------------------------------------------
    // Section E — architectural regression
    // -------------------------------------------------------------
    {
        const source = await readFile(new URL('../core/VehicleMovementHeading.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const forbidden = [
            'VehicleInstance', 'VehicleRuntimeInstances', 'AvatarVehicleMovementController',
            'THREE', 'from \'three\'', 'Renderer', 'collision', 'terrain', 'seed',
            'setTimeout', 'setInterval', 'requestAnimationFrame', 'Date.now', 'Math.random'
        ];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `16. core/VehicleMovementHeading.js's own code never references "${term}" — a pure geometry function, no domain or engine dependency`);
        }
        const exportsModule = await import('../core/VehicleMovementHeading.js');
        assert(JSON.stringify(Object.keys(exportsModule).sort()) === JSON.stringify(['resolveVehicleHeadingFromMovement']),
            '17. core/VehicleMovementHeading.js exports exactly the one pure function');
    }

    console.log('✅ All Vehicle Movement Heading tests passed.');
}

await runTests();
