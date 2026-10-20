// core/BuildSimilarity.js: two whole builds compared brick by brick, lined up
// however one was moved or turned, for the "looks a lot like someone else's
// build" hint at publish.
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import {
    MIN_COMPARED_BRICKS, MIN_READY_MADE_POINTS, SIMILAR_BUILD_THRESHOLD, buildShape, compareBuildShapes, isSimilarBuild, similarityUpperBound, withoutReadyMade
} from '../core/BuildSimilarity.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { assert } from './support/Assert.js';

function brick(definitionId, x, y, z, { rotation = 0, color = null } = {}) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation, color });
}

// A cottage of 46 bricks: two courses of cubes round a 6 x 5 floor, a door,
// two windows and a row of beams for a roof ridge.
function cottage() {
    const bricks = [];
    for (let x = 0; x < 6; x += 1) {
        for (let z = 0; z < 5; z += 1) {
            if (x !== 0 && x !== 5 && z !== 0 && z !== 4) continue;
            for (const y of [0.5, 1.5]) {
                if (x === 2 && z === 0) continue;
                if ((x === 4 && z === 0 && y === 1.5) || (x === 0 && z === 2 && y === 1.5)) continue;
                bricks.push(brick('core:cube', x, y, z, { color: 0xffffff }));
            }
        }
    }
    bricks.push(brick('core:door', 2, 1, 0));
    bricks.push(brick('core:window_small', 4, 1.5, 0));
    bricks.push(brick('core:window_small', 0, 1.5, 2, { rotation: 90 }));
    for (let x = 0; x < 6; x += 1) bricks.push(brick('core:beam', x, 2.5, 2));
    return bricks;
}

// The Editor's own quarter turn about a pivot (application/editor/TransformMath.js),
// then a move.
function turnedAndMoved(bricks, degrees, offset) {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.round(Math.cos(radians));
    const sin = Math.round(Math.sin(radians));
    return bricks.map((b) => brick(
        b.definitionId,
        (cos * b.position.x) - (sin * b.position.z) + offset.x,
        b.position.y + offset.y,
        (sin * b.position.x) + (cos * b.position.z) + offset.z,
        { rotation: b.rotation + degrees, color: b.color }
    ));
}

// A round tower: nothing like the cottage but the kinds of brick it uses.
function tower() {
    const bricks = [];
    for (let y = 0; y < 8; y += 1) {
        for (const [x, z] of [[0, 1], [1, 0], [2, 1], [1, 2]]) bricks.push(brick('core:cube', x + 20, y + 0.5, z));
    }
    bricks.push(brick('core:door', 21, 1, 0));
    return bricks;
}

const original = cottage();
assert(original.length >= MIN_COMPARED_BRICKS, 'the cottage is large enough to compare');

{
    const evidence = compareBuildShapes(buildShape(original), buildShape(cottage()));
    assert(evidence.similarity === 1 && evidence.shared === buildShape(original).size, '1. the same build is entirely alike');
    assert(evidence.onlyMine === 0 && evidence.onlyTheirs === 0 && evidence.turn === 0, '2. nothing is only in one of them');
    assert(isSimilarBuild(evidence), '3. it is pointed out');
}
console.log('✓ the same build');

{
    for (const degrees of [90, 180, 270]) {
        const copy = turnedAndMoved(original, degrees, { x: 37, y: 2, z: -11 });
        const evidence = compareBuildShapes(buildShape(original), buildShape(copy));
        assert(evidence.similarity === 1, `4. a copy turned ${degrees}° and moved is lined up and entirely alike (got ${evidence.similarity})`);
        assert(evidence.turn === (360 - degrees) % 360, `5. the turn that lines it up is reported (${degrees}°: got ${evidence.turn})`);
    }
    const moved = turnedAndMoved(original, 0, { x: 2.5, y: 0, z: 0 });
    assert(compareBuildShapes(buildShape(original), buildShape(moved)).similarity === 1, '6. a copy moved half a stud lines up too');
}
console.log('✓ a copy moved or turned');

{
    const recoloured = original.map((b) => brick(b.definitionId, b.position.x, b.position.y, b.position.z, { rotation: b.rotation + 180, color: 0x123456 }));
    assert(compareBuildShapes(buildShape(original), buildShape(recoloured)).similarity === 1, '7. colour and the turn of each brick are left out');
}
console.log('✓ colour and brick turns left out');

{
    // Rebuilt by eye: a few bricks missed, a few added, one swapped.
    const rebuilt = original.slice(0, original.length - 4);
    rebuilt.push(brick('core:cube', 6, 0.5, 2), brick('core:cube', 7, 0.5, 2));
    rebuilt[3] = brick('core:block_2x2', rebuilt[3].position.x, rebuilt[3].position.y, rebuilt[3].position.z);
    const evidence = compareBuildShapes(buildShape(original), buildShape(turnedAndMoved(rebuilt, 90, { x: -5, y: 0, z: 9 })));
    assert(evidence.similarity >= 0.8 && evidence.similarity < 1, `8. a rebuild with a few changes is still very alike (got ${evidence.similarity})`);
    assert(isSimilarBuild(evidence), '9. and is pointed out');
    assert(evidence.onlyMine === 5 && evidence.onlyTheirs === 3, `10. what is only in each is counted (got ${evidence.onlyMine}, ${evidence.onlyTheirs})`);
}
console.log('✓ a rebuild with changes');

{
    const evidence = compareBuildShapes(buildShape(original), buildShape(tower()));
    assert(evidence.similarity < SIMILAR_BUILD_THRESHOLD, `11. a different build made of the same bricks is not alike (got ${evidence.similarity})`);
    assert(!isSimilarBuild(evidence), '12. and is not pointed out');
}
console.log('✓ a different build');

{
    const pairs = [[original, tower()], [original, original.slice(0, 20)], [tower(), cottage()], [original, turnedAndMoved(original, 90, { x: 1, y: 0, z: 1 })]];
    for (const [a, b] of pairs) {
        const mine = buildShape(a);
        const theirs = buildShape(b);
        assert(similarityUpperBound(mine, theirs) >= compareBuildShapes(mine, theirs).similarity - 0.005, '13. the upper bound is never below the similarity found');
    }
    const roof = buildShape([brick('core:roof_cone', 0, 0, 0), brick('core:roof_cone', 1, 0, 0)]);
    assert(similarityUpperBound(buildShape(original), roof) === 0, '14. builds with no kind of brick in common can\'t match');
}
console.log('✓ the upper bound');

{
    const nothing = compareBuildShapes(buildShape([]), buildShape(original));
    assert(nothing.similarity === 0 && nothing.shared === 0 && nothing.onlyTheirs === buildShape(original).size, '15. an empty build is alike to nothing');
    assert(compareBuildShapes(null, null).similarity === 0, '16. no shapes compare as nothing alike');
    const doubled = buildShape([...original, ...original, { definitionId: null }, null]);
    assert(doubled.size === buildShape(original).size, '17. bricks standing in the same place as the same kind count once; malformed ones not at all');
}
console.log('✓ edge cases');

// Ready-made structures from the Build Library are taken out before comparing.
{
    const readyMade = VillageLibrary.structures.map((structure) => buildShape(structure.bricks));
    const house = VillageLibrary.structures.find((structure) => structure.id === 'village:house').bricks;
    const ownA = Array.from({ length: 30 }, (_, i) => brick('core:cube', 40 + (i % 6), 0.5 + Math.floor(i / 6), 40));
    const ownB = Array.from({ length: 30 }, (_, i) => brick('core:plate_2x4', -40, 0.5 + i, -40 + (i % 3)));
    const a = buildShape([...turnedAndMoved(house, 90, { x: 5, y: 0, z: 7 }), ...ownA]);
    const b = buildShape([...turnedAndMoved(house, 0, { x: -20, y: 0, z: 0 }), ...ownB]);
    const strippedA = withoutReadyMade(a, readyMade);
    const strippedB = withoutReadyMade(b, readyMade);
    assert(strippedA.size === buildShape(ownA).size && strippedB.size === buildShape(ownB).size,
        `18. a ready-made house is taken out however it was moved or turned, leaving the builder's own bricks (${strippedA.size}, ${strippedB.size})`);
    assert(compareBuildShapes(strippedA, strippedB).similarity === 0, '19. two builds that share only a ready-made house don\'t look alike');

    const both = buildShape([...ownA, ...turnedAndMoved(house, 0, { x: 100, y: 0, z: 0 }), ...turnedAndMoved(house, 180, { x: -100, y: 0, z: 9 })]);
    assert(withoutReadyMade(both, readyMade).size === buildShape(ownA).size, '20. every copy of it is taken out');

    const almost = buildShape([...ownA, ...house.slice(0, Math.ceil(house.length * 0.95))]);
    assert(withoutReadyMade(almost, readyMade).size === buildShape(ownA).size, '21. a copy missing a brick or two still counts as the structure');
    const half = buildShape([...ownA, ...house.slice(0, Math.floor(house.length / 2))]);
    assert(withoutReadyMade(half, readyMade).size === half.size, '22. half of one doesn\'t: those bricks were placed, not dropped in');

    assert(withoutReadyMade(buildShape(original), readyMade).size === buildShape(original).size, '23. a build made by hand keeps every brick');
    const fence = VillageLibrary.structures.find((structure) => buildShape(structure.bricks).size < MIN_READY_MADE_POINTS);
    assert(fence && withoutReadyMade(buildShape([...ownA, ...fence.bricks]), readyMade).size === buildShape([...ownA, ...fence.bricks]).size,
        '24. a structure too small to tell from hand-placed bricks is left in');
    assert(withoutReadyMade(a, []) === a && withoutReadyMade(a, null) === a, '25. with no structures, nothing is taken out');
}
console.log('✓ ready-made structures taken out');

console.log('✅ All build similarity tests passed.');
