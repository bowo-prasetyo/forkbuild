import {
    AvatarDroneVerticalStateKind,
    isValidAvatarDroneVerticalStateKind,
    DRONE_HOVER_ALTITUDE,
    deriveAvatarDroneVerticalState
} from '../core/AvatarDroneVerticalState.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // Section A — vocabulary
    {
        assert(isValidAvatarDroneVerticalStateKind(AvatarDroneVerticalStateKind.GROUNDED), '1. GROUNDED is a valid kind');
        assert(isValidAvatarDroneVerticalStateKind(AvatarDroneVerticalStateKind.RISING), '2. RISING is a valid kind');
        assert(isValidAvatarDroneVerticalStateKind(AvatarDroneVerticalStateKind.HOVERING), '3. HOVERING is a valid kind');
        assert(isValidAvatarDroneVerticalStateKind(AvatarDroneVerticalStateKind.DESCENDING), '4. DESCENDING is a valid kind');
        assert(isValidAvatarDroneVerticalStateKind('flying') === false, '5. an unrecognized string is not a valid kind');
        assert(isValidAvatarDroneVerticalStateKind(null) === false, '6. null is not a valid kind');
        assert(DRONE_HOVER_ALTITUDE > 0, '7. DRONE_HOVER_ALTITUDE is a positive number of world units');
    }

    // Section B — deriveAvatarDroneVerticalState()
    {
        assert(deriveAvatarDroneVerticalState() === AvatarDroneVerticalStateKind.GROUNDED, '8. no arguments defaults to GROUNDED (altitude 0)');
        assert(deriveAvatarDroneVerticalState({ altitude: 0 }) === AvatarDroneVerticalStateKind.GROUNDED, '9. altitude 0 is GROUNDED');
        assert(deriveAvatarDroneVerticalState({ altitude: -1 }) === AvatarDroneVerticalStateKind.GROUNDED, '10. a negative altitude is clamped to GROUNDED');
        assert(deriveAvatarDroneVerticalState({ altitude: 1, ascending: true }) === AvatarDroneVerticalStateKind.RISING, '11. below hover altitude, ascending -> RISING');
        assert(deriveAvatarDroneVerticalState({ altitude: 1, ascending: false }) === AvatarDroneVerticalStateKind.DESCENDING, '12. below hover altitude, not ascending -> DESCENDING');
        assert(deriveAvatarDroneVerticalState({ altitude: DRONE_HOVER_ALTITUDE, ascending: true }) === AvatarDroneVerticalStateKind.HOVERING, '13. reaching DRONE_HOVER_ALTITUDE is HOVERING regardless of ascending');
        assert(deriveAvatarDroneVerticalState({ altitude: DRONE_HOVER_ALTITUDE + 5, ascending: false }) === AvatarDroneVerticalStateKind.HOVERING, '14. above DRONE_HOVER_ALTITUDE is still HOVERING (clamped)');
        assert(deriveAvatarDroneVerticalState({ altitude: NaN }) === AvatarDroneVerticalStateKind.GROUNDED, '15. a non-finite altitude degrades gracefully to GROUNDED, never throwing');
        assert(deriveAvatarDroneVerticalState({ altitude: undefined }) === AvatarDroneVerticalStateKind.GROUNDED, '16. an explicit undefined altitude also degrades to GROUNDED');
    }

    // Section C — determinism
    {
        const args = { altitude: 2, ascending: true };
        assert(deriveAvatarDroneVerticalState(args) === deriveAvatarDroneVerticalState(args), '17. same input -> same output, called twice');
    }

    // Section D — export surface
    {
        const exportsModule = await import('../core/AvatarDroneVerticalState.js');
        const exportedNames = Object.keys(exportsModule).sort();
        assert(JSON.stringify(exportedNames) === JSON.stringify([
            'AvatarDroneVerticalStateKind',
            'DRONE_HOVER_ALTITUDE',
            'deriveAvatarDroneVerticalState',
            'isValidAvatarDroneVerticalStateKind'
        ]), '18. this module exports exactly the kind vocabulary, its validator, the hover altitude constant, and the derive function — nothing else');
    }

    console.log('✅ All Avatar Drone Vertical State tests passed.');
}

await runTests();
