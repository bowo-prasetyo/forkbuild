// core/catalog/BuildSimilarity.js: two whole builds compared brick by brick, lined up
// however one was moved or turned, for the "looks a lot like someone else's
// build" hint at publish.
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import {
    CONTAINED_BUILD_THRESHOLD, MIN_COMPARED_BRICKS, MIN_READY_MADE_POINTS, MIN_SHARED_KINDS, SIMILAR_BUILD_THRESHOLD, buildShape, compareBuildShapes, couldBeSimilar,
    isSimilarBuild, lookAlikeShare, readyMadeCoverage, similarityUpperBound, withoutReadyMade
} from '../core/catalog/BuildSimilarity.js';
import { CollectionLibrary } from '../core/library/CollectionLibrary.js';
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

// Builds of one or two kinds of brick laid in rows, where pairs of bricks
// vote for every offset about as much: a copy is still lined up exactly.
{
    const rows = (width, depth, height, kinds) => {
        const bricks = [];
        for (let x = 0; x < width; x += 1) {
            for (let z = 0; z < depth; z += 1) {
                for (let y = 0; y < height; y += 1) bricks.push(brick(kinds[(x + y + z) % kinds.length], x, y + 0.5, z));
            }
        }
        return bricks;
    };
    const builds = [
        ['a 40 x 10 wall', rows(40, 1, 10, ['core:cube'])],
        ['a 20 x 20 floor', rows(20, 20, 1, ['core:cube'])],
        ['a 30 x 30 floor of two kinds', rows(30, 30, 1, ['core:cube', 'core:block_2x2'])]
    ];
    for (const [label, bricks] of builds) {
        const shape = buildShape(bricks);
        assert(compareBuildShapes(shape, shape).similarity === 1, `6a. ${label} is entirely alike to itself (got ${compareBuildShapes(shape, shape).similarity})`);
        const copy = turnedAndMoved(bricks, 90, { x: 13, y: 0, z: -4 });
        assert(compareBuildShapes(shape, buildShape(copy)).similarity === 1, `6b. a copy of ${label} turned and moved is entirely alike`);
        const reordered = [...copy].reverse();
        assert(compareBuildShapes(shape, buildShape(reordered)).similarity === 1, `6c. so is one whose bricks were placed in another order (${label})`);
    }
    const [, floor] = builds[1];
    const lessARow = turnedAndMoved(floor.filter((b) => b.position.x > 0), 0, { x: 3, y: 0, z: 3 });
    const evidence = compareBuildShapes(buildShape(floor), buildShape(lessARow));
    assert(evidence.shared === lessARow.length && evidence.onlyTheirs === 0, `6d. a copy of the floor less a row is lined up on the side it kept (shared ${evidence.shared} of ${lessARow.length})`);
}
console.log('✓ a copy of a build laid in rows');

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

// A mirrored copy, a copy with more of its own, and a part of a build.
{
    for (const degrees of [0, 90, 180, 270]) {
        const evidence = compareBuildShapes(buildShape(original), buildShape(turnedAndMoved(original, degrees, { x: 3, y: 0, z: 3 })));
        assert(!evidence.mirrored, `12a. a copy turned ${degrees}° is not called mirrored`);
    }
    const mirrored = turnedAndMoved(original.map((b) => brick(b.definitionId, -b.position.x, b.position.y, b.position.z)), 90, { x: 8, y: 0, z: -2 });
    const flipped = compareBuildShapes(buildShape(original), buildShape(mirrored));
    assert(flipped.similarity === 1 && flipped.mirrored, `12b. a mirrored copy is lined up, entirely alike, and said to be mirrored (got ${flipped.similarity})`);
    assert(compareBuildShapes(buildShape(original), buildShape(mirrored), { mirror: false }).similarity < 1, '12c. turned only, its door and windows would not line up');
    assert(isSimilarBuild(flipped), '12d. it is pointed out');

    const garden = Array.from({ length: 70 }, (_, i) => brick('core:plate_2x4', 40 + (i % 10), 0.5, Math.floor(i / 10)));
    const extended = compareBuildShapes(buildShape([...turnedAndMoved(original, 180, { x: -6, y: 0, z: 2 }), ...garden]), buildShape(original));
    assert(extended.similarity < SIMILAR_BUILD_THRESHOLD && extended.theirsInMine === 1 && extended.mineInTheirs < 0.5,
        `12e. a copy with as many bricks again of its own is less than ${SIMILAR_BUILD_THRESHOLD * 100}% the same, but all of what it copied stands in it (${extended.similarity}, ${extended.theirsInMine})`);
    assert(isSimilarBuild(extended), '12f. and it is pointed out');
    assert(Object.values(extended.sharedByKind).reduce((sum, n) => sum + n, 0) === extended.shared && extended.sharedKinds === 4, '12g. the shared bricks are counted by kind');

    const reversed = compareBuildShapes(buildShape(original), buildShape([...original, ...garden]));
    assert(reversed.mineInTheirs === 1 && isSimilarBuild(reversed), '12h. either way round');
    const most = compareBuildShapes(buildShape([...original.slice(0, Math.floor(original.length * 0.7)), ...garden]), buildShape(original));
    assert(most.theirsInMine < CONTAINED_BUILD_THRESHOLD && !isSimilarBuild(most), `12i. less than ${CONTAINED_BUILD_THRESHOLD * 100}% of it standing there isn't pointed out (${most.theirsInMine})`);
    assert(JSON.stringify(lookAlikeShare(flipped)) === '{"kind":"same","percent":100,"mirrored":true}', '12j. a mirrored copy is said to be all the same, mirrored');
    assert(JSON.stringify(lookAlikeShare(extended)) === '{"kind":"theirsInMine","percent":100,"mirrored":false}', '12k. one with more of its own, by how much of the other stands in it');
    assert(lookAlikeShare(reversed).kind === 'mineInTheirs' && lookAlikeShare(reversed).percent === 100, '12l. or how much of it stands in the other');
}
console.log('✓ mirrored, extended and partial copies');

// What two builds share must say something: walls of one kind, or a build of
// fewer than MIN_SHARED_KINDS kinds of brick, turn up by chance.
{
    const box = (w, d, h) => {
        const bricks = [];
        for (let x = 0; x < w; x += 1) for (let z = 0; z < d; z += 1) for (let y = 0; y < h; y += 1) {
            if (x === 0 || z === 0 || x === w - 1 || z === d - 1) bricks.push(brick('core:cube', x, y + 0.5, z));
        }
        return bricks;
    };
    const plain = compareBuildShapes(buildShape(box(10, 10, 4)), buildShape(box(10, 10, 3)));
    assert(plain.similarity >= SIMILAR_BUILD_THRESHOLD && plain.theirsInMine === 1 && plain.sharedKinds === 1,
        `13a. two walled boxes of cubes made apart are mostly the same, and one stands in the other (${plain.similarity})`);
    assert(!isSimilarBuild(plain), '13b. but walls of one kind are too plain to point out');
    assert(!isSimilarBuild(compareBuildShapes(buildShape(box(10, 10, 4)), buildShape(box(10, 10, 4)))), '13c. even when they are the same');

    const threeKinds = original.filter((b) => b.definitionId !== 'core:window_small');
    const evidence = compareBuildShapes(buildShape(threeKinds), buildShape(turnedAndMoved(threeKinds, 90, { x: 1, y: 0, z: 1 })));
    assert(evidence.similarity === 1 && evidence.sharedKinds === MIN_SHARED_KINDS - 1 && !isSimilarBuild(evidence),
        `13d. nor is a match of ${MIN_SHARED_KINDS - 1} kinds of brick (walls, a door and a roof), which two tiny homes share by chance`);
    assert(isSimilarBuild(evidence, { minKinds: 3 }) && isSimilarBuild(compareBuildShapes(buildShape(original), buildShape(original)), SIMILAR_BUILD_THRESHOLD),
        '13e. the bars can be changed, for the measuring script, and a bare threshold is still taken');

    const small = original.slice(0, MIN_COMPARED_BRICKS - 1);
    const inLarger = compareBuildShapes(buildShape(small), buildShape(original));
    assert(inLarger.mineInTheirs === 1 && !isSimilarBuild(inLarger), '13f. fewer shared bricks than MIN_COMPARED_BRICKS are never pointed out, however much of a build they are');
}
console.log('✓ too plain to tell');

{
    const garden = Array.from({ length: 70 }, (_, i) => brick('core:plate_2x4', 40 + (i % 10), 0.5, Math.floor(i / 10)));
    const pairs = [[original, tower()], [original, [...original, ...garden]], [tower(), cottage()], [original, turnedAndMoved(original, 90, { x: 1, y: 0, z: 1 })], [original.slice(0, 25), original]];
    for (const [a, b] of pairs) {
        const mine = buildShape(a);
        const theirs = buildShape(b);
        assert(!isSimilarBuild(compareBuildShapes(mine, theirs)) || couldBeSimilar(mine, theirs), '13g. couldBeSimilar() never rules out builds that are pointed out');
    }
    const extended = [buildShape([...original, ...garden]), buildShape(original)];
    assert(similarityUpperBound(...extended) < SIMILAR_BUILD_THRESHOLD && couldBeSimilar(...extended), '13h. a copy with more of its own is still compared');
    assert(!couldBeSimilar(buildShape(original), buildShape(garden)), '13i. builds with no kind of brick in common are not');
}
console.log('✓ which builds could be pointed out');

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
    // How much of a structure must be there grows as the structure shrinks.
    const points = (structure) => buildShape(structure.bricks).points.map((p) => brick(p.definitionId, p.x, p.y, p.z));
    const sized = (from, to) => VillageLibrary.structures.find((structure) => {
        const size = buildShape(structure.bricks).size;
        return size >= from && size < to;
    });
    for (const [label, structure, enough, tooFew] of [
        ['large (30+ bricks): half', sized(30, Infinity), 0.5, 0.45],
        ['medium (12 to 29): 70%', sized(12, 30), 0.7, 0.6],
        ['small (6 to 11): 80%', sized(6, 12), 0.8, 0.7]
    ]) {
        const all = points(structure);
        const keep = (share) => all.slice(0, Math.ceil(all.length * share));
        const changed = buildShape([...ownA, ...turnedAndMoved(keep(enough), 90, { x: 7, y: 0, z: -3 })]);
        assert(withoutReadyMade(changed, readyMade).size === buildShape(ownA).size,
            `22. a ${label} of it still standing counts as ${structure.id} (${withoutReadyMade(changed, readyMade).size - buildShape(ownA).size} left)`);
        const fewer = buildShape([...ownA, ...keep(tooFew)]);
        assert(withoutReadyMade(fewer, readyMade).size === fewer.size, `22a. less of ${structure.id} doesn't: those bricks were placed by hand`);
    }

    // The bricks its builder changed stay theirs.
    const houseAll = points(VillageLibrary.structures.find((structure) => structure.id === 'village:house'));
    const reworked = houseAll.map((b, i) => (i % 5 < 2 ? brick(b.definitionId === 'core:cube' ? 'core:roof_cone' : 'core:cube', b.position.x, b.position.y, b.position.z) : b));
    const reworkedShape = buildShape([...ownA, ...reworked]);
    const changedOnes = buildShape(reworked.filter((_, i) => i % 5 < 2));
    assert(withoutReadyMade(reworkedShape, readyMade).size === buildShape(ownA).size + changedOnes.size,
        '22b. a house with two bricks in five changed loses the bricks still as the house has them, and keeps the changed ones');

    assert([3, 5, 6, 11, 12, 29, 30, 144].map(readyMadeCoverage).join() === ',,0.8,0.8,0.7,0.7,0.5,0.5', '22c. 80%, 70% and half, by size; none under six bricks');
    assert(withoutReadyMade(changed(), readyMade, { coverageFor: () => 1 }).size > buildShape(ownA).size, '22d. another coverage can be tried (the measuring script does)');
    function changed() {
        return buildShape([...ownA, ...houseAll.slice(0, 40)]);
    }

    assert(withoutReadyMade(buildShape(original), readyMade).size === buildShape(original).size, '23. a build made by hand keeps every brick');
    const fence = VillageLibrary.structures.find((structure) => buildShape(structure.bricks).size < MIN_READY_MADE_POINTS);
    assert(fence && withoutReadyMade(buildShape([...ownA, ...fence.bricks]), readyMade).size === buildShape([...ownA, ...fence.bricks]).size,
        '24. a structure too small to tell from hand-placed bricks is left in');
    assert(withoutReadyMade(a, []) === a && withoutReadyMade(a, null) === a, '25. with no structures, nothing is taken out');
}
console.log('✓ ready-made structures taken out');

// The Collection's lighthouse is a watchtower with 4 of its 11 bricks changed
// (scripts/evaluate-ready-made-detection.mjs, E1): too much changed for the
// watchtower to count as there, on purpose. Rebuilt by hand, a third of it is
// its builder's own work; started from the Build Library, it is the lighthouse.
{
    const library = [...VillageLibrary.structures, ...CollectionLibrary.structures];
    const byId = (id) => library.find((structure) => structure.id === id);
    const watchtower = buildShape(byId('village:watchtower').bricks);
    const lighthouse = buildShape(byId('collection:lighthouse').bricks);
    const keepers = buildShape(byId('collection:keepers_lighthouse').bricks);
    assert(watchtower.size === 11 && lighthouse.size === 11 && compareBuildShapes(lighthouse, watchtower).shared === 7,
        '26. the lighthouse keeps 7 of the watchtower\'s 11 bricks');
    assert(readyMadeCoverage(watchtower.size) * watchtower.size > 7, '26a. fewer than a small structure needs');

    const withoutLighthouses = library
        .filter((structure) => !['collection:lighthouse', 'collection:keepers_lighthouse'].includes(structure.id))
        .map((structure) => buildShape(structure.bricks));
    assert(withoutReadyMade(lighthouse, withoutLighthouses).size === lighthouse.size,
        '27. a watchtower changed that much by hand counts as its builder\'s own bricks');

    const all = library.map((structure) => buildShape(structure.bricks));
    assert(withoutReadyMade(lighthouse, all).size === 0, '28. the lighthouse from the Build Library is taken out whole');
    const rest = withoutReadyMade(keepers, all);
    assert([...lighthouse.keys].every((key) => !rest.keys.has(key)), '28a. and so is the lighthouse a remix of it stands on');
}
console.log('✓ the lighthouse, a watchtower changed by a third');

console.log('✅ All build similarity tests passed.');
