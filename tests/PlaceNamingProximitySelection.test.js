import {
    selectNearbyPlaceNamingClaims,
    isValidPlaceNamingProximityRadius
} from '../core/PlaceNamingProximitySelection.js';

// 0.9.255 — Place Naming Proximity Selection.
// See docs/Roadmap.md, "0.9.255 — Place Naming Proximity Selection."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function claimAt(id, x, z, overrides = {}) {
    return { id, name: `Claim ${id}`, position: { x, z }, ...overrides };
}

// ---------------------------------------------------------------------
// A. Basic selection — a nearby claim is returned.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('a', 1, 1)];
    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 10);
    assert(result.length === 1 && result[0].id === 'a', 'a claim well within the radius is selected');

    console.log('✓ A claim within the radius is returned');
}

// ---------------------------------------------------------------------
// B. Outside radius — claims beyond the radius are excluded.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('far', 100, 100)];
    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 10);
    assert(result.length === 0, 'a claim well beyond the radius is excluded');

    console.log('✓ A claim beyond the radius is excluded');
}

// ---------------------------------------------------------------------
// C. Inclusive boundary — a claim exactly at the radius is retained.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('boundary', 10, 0)];
    const atBoundary = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 10);
    assert(atBoundary.length === 1, 'a claim exactly at the radius is relevant (inclusive boundary)');

    const justBeyond = selectNearbyPlaceNamingClaims([claimAt('beyond', 10.0001, 0)], { x: 0, z: 0 }, 10);
    assert(justBeyond.length === 0, 'a claim a fraction beyond the radius is irrelevant');

    console.log('✓ The radius boundary is inclusive: distance === radius is relevant, distance > radius is not');
}

// ---------------------------------------------------------------------
// D. Multiple nearby claims — all survive, no winner is selected.
// ---------------------------------------------------------------------
{
    const claims = [
        claimAt('alice', 1, 0, { name: 'Old Oak' }),
        claimAt('bob', 0, 1, { name: 'Ancient Tree' }),
        claimAt('charlie', 1, 1, { name: 'Oak Crossing' })
    ];
    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 5);
    assert(result.length === 3, 'every claim within the radius survives — no ranking, no winner picked');
    assert(result.map((c) => c.id).join(',') === 'alice,bob,charlie', 'all three distinct names for the same vicinity are returned together');

    console.log('✓ Multiple nearby claims for the same vicinity all survive — proximity filtering never ranks');
}

// ---------------------------------------------------------------------
// E. Discovery-order preservation — input order is never reordered.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('c', 1, 0), claimAt('a', 0, 1), claimAt('b', 1, 1)];
    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 5);
    assert(result.map((c) => c.id).join(',') === 'c,a,b', 'survivors keep the exact relative order discovery handed in, never sorted by distance');

    console.log('✓ Discovery order is preserved — never sorted by distance');
}

// ---------------------------------------------------------------------
// F. Empty / no-match — both produce [].
// ---------------------------------------------------------------------
{
    assert(selectNearbyPlaceNamingClaims([], { x: 0, z: 0 }, 10).length === 0, 'an empty claims array selects nothing');

    const allFar = [claimAt('a', 1000, 0), claimAt('b', 0, 1000)];
    assert(selectNearbyPlaceNamingClaims(allFar, { x: 0, z: 0 }, 10).length === 0, 'no matches when every claim is out of range');

    console.log('✓ Empty input and no-match input both produce []');
}

// ---------------------------------------------------------------------
// G. Malformed spatial data — invalid claims don't poison valid ones.
// ---------------------------------------------------------------------
{
    const validA = claimAt('validA', 1, 1);
    const validC = claimAt('validC', 2, 2);
    const malformedEntries = [
        validA,
        { id: 'noPosition', name: 'No Position' },
        { id: 'nullPosition', name: 'Null Position', position: null },
        claimAt('nanX', NaN, 0),
        claimAt('infZ', 0, Infinity),
        { id: 'stringCoords', name: 'String Coords', position: { x: '1', z: '1' } },
        null,
        undefined,
        validC
    ];

    const result = selectNearbyPlaceNamingClaims(malformedEntries, { x: 0, z: 0 }, 10);
    assert(result.length === 2, 'only the two well-formed, in-range claims survive');
    assert(result[0].id === 'validA' && result[1].id === 'validC', 'valid claims retain their own relative order around the excluded malformed ones');

    console.log('✓ Malformed claims are excluded individually; unrelated valid claims are unaffected');
}

// ---------------------------------------------------------------------
// H. Invalid current position / radius — explicit graceful behavior.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('a', 0, 0)];

    assert(selectNearbyPlaceNamingClaims(claims, null, 10).length === 0, 'a null currentPosition yields []');
    assert(selectNearbyPlaceNamingClaims(claims, { x: NaN, z: 0 }, 10).length === 0, 'a non-finite currentPosition.x yields []');
    assert(selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, -1).length === 0, 'a negative radius yields []');
    assert(selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, NaN).length === 0, 'a non-finite radius yields []');
    assert(selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, Infinity).length === 0, 'an infinite radius is not finite, and also yields []');
    assert(!Array.isArray(undefined) ? selectNearbyPlaceNamingClaims(undefined, { x: 0, z: 0 }, 10).length === 0 : true, 'a non-array claims argument yields []');

    assert(selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 0).length === 1, 'a radius of exactly 0 is valid, and matches a claim at the exact same position');
    assert(isValidPlaceNamingProximityRadius(0) === true, 'isValidPlaceNamingProximityRadius(0) is true');
    assert(isValidPlaceNamingProximityRadius(-1) === false, 'isValidPlaceNamingProximityRadius(-1) is false');
    assert(isValidPlaceNamingProximityRadius(NaN) === false, 'isValidPlaceNamingProximityRadius(NaN) is false');

    console.log('✓ Invalid currentPosition/radius degrade to [], with radius 0 explicitly valid');
}

// ---------------------------------------------------------------------
// I. Immutability — the input array and its claims are never mutated.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('a', 1, 1), claimAt('b', 100, 100)];
    const frozenSnapshot = claims.map((c) => ({ ...c, position: { ...c.position } }));

    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 10);

    assert(claims.length === 2, 'the original claims array length is unchanged');
    assert(JSON.stringify(claims) === JSON.stringify(frozenSnapshot), 'no claim in the original array was mutated');
    assert(result !== claims, 'the returned array is a fresh array, never the original reference');
    assert(result[0] === claims[0], 'surviving entries are the SAME object references, never copies');

    console.log('✓ Neither the input array nor any of its claims are mutated; survivors are the same references');
}

// ---------------------------------------------------------------------
// J. Duplicate claims — proximity selection does not deduplicate.
// ---------------------------------------------------------------------
{
    const claim = claimAt('dup', 1, 1);
    const claims = [claim, claim];
    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 10);
    assert(result.length === 2, 'deduplication is discovery\'s own job (PlaceNamingDiscoveryQueryService); proximity selection passes duplicates through unchanged');

    console.log('✓ Duplicate entries are not deduplicated by proximity selection');
}

// ---------------------------------------------------------------------
// K. Architectural boundary — a pure spatial filter needs nothing but
// plain data. No discovery service, no store, no identity/verification
// collaborator, no World/rendering object is ever constructed to
// exercise this module, demonstrating it depends on none of them.
// ---------------------------------------------------------------------
{
    const claims = [claimAt('solo', 3, 4)];
    const result = selectNearbyPlaceNamingClaims(claims, { x: 0, z: 0 }, 5);
    assert(result.length === 1, 'the module operates correctly using nothing but plain claim/position/radius data');

    console.log('✓ selectNearbyPlaceNamingClaims() requires no discovery, storage, identity, or World View collaborator');
}

console.log('\nAll PlaceNamingProximitySelection tests passed.');
