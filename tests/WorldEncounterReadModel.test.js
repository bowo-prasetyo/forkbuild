import { readFile } from 'node:fs/promises';
import { describeWorldEncounterReadModel } from '../application/WorldEncounterReadModel.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';

// 0.9.1 — World Encounter Read Model.
//
// Section A: malformed/absent encounters — empty, never throws
// Section B: a single publication encounter — field renaming/flattening fidelity
// Section C: a single avatar encounter — field renaming/flattening fidelity
// Section D: FLAGSHIP — two publishers, one avatar present, counts and order
// Section E: no evaluative/spatial-navigation vocabulary, on the result or in the code
// Section F: no mutation, frozen results, determinism, row order preserved
// Section G: consumes 0.9.0's own deriveWorldEncounters() result directly

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function publicationOf(overrides = {}) {
    return {
        id: 'pub-1',
        title: 'Untitled',
        publisherIdentity: { username: 'alice' },
        signature: { signedBy: 'alice' },
        ...overrides
    };
}

function placementOf(overrides = {}) {
    return {
        id: 'placement-1',
        publicationId: 'pub-1',
        position: { x: 10, y: 0, z: 20 },
        ...overrides
    };
}

function anchorOf(overrides = {}) {
    return { id: 'anchor-1', publicationId: 'pub-1', anchorType: 'bitcoin-opreturn', ...overrides };
}

function snapshotPlacementOf(overrides = {}) {
    return { id: 'sp-1', publicationId: 'pub-1', storage: 'ipfs', ...overrides };
}

function avatarProfileOf(overrides = {}) {
    return { avatarId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', ...overrides };
}

function avatarPresenceOf(overrides = {}) {
    return { avatarId: 'avatar-1', position: { x: 5, y: 0, z: 5 }, ...overrides };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent encounters.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { publications: 'nope' }, { publications: null, avatars: null }]) {
            const readModel = describeWorldEncounterReadModel(malformed);
            assert(readModel.publicationCount === 0, `1. malformed input (${serialize(malformed)}) reports publicationCount 0`);
            assert(readModel.avatarCount === 0, `2. malformed input (${serialize(malformed)}) reports avatarCount 0`);
            assert(readModel.totalCount === 0, `3. malformed input (${serialize(malformed)}) reports totalCount 0`);
            assert(Array.isArray(readModel.publications) && readModel.publications.length === 0, `4. malformed input (${serialize(malformed)}) reports an empty publications array`);
            assert(Array.isArray(readModel.avatars) && readModel.avatars.length === 0, `5. malformed input (${serialize(malformed)}) reports an empty avatars array`);
            assert(Object.isFrozen(readModel) && Object.isFrozen(readModel.publications) && Object.isFrozen(readModel.avatars), `6. malformed input (${serialize(malformed)}) still returns a frozen, valid result`);
        }
        assert(describeWorldEncounterReadModel().totalCount === 0, '7. calling with no argument defaults to an empty result, never throws');

        console.log('✓ Section A: malformed/absent input degrades to a valid, empty read model rather than throwing');
    }

    // ---------------------------------------------------------------
    // Section B — a single publication encounter: renaming/flattening fidelity.
    // ---------------------------------------------------------------
    {
        const encounters = deriveWorldEncounters({
            publications: [publicationOf()],
            placements: [placementOf()],
            anchors: [anchorOf(), anchorOf({ id: 'anchor-2' })],
            snapshotPlacements: [snapshotPlacementOf()]
        });
        const readModel = describeWorldEncounterReadModel(encounters);

        assert(readModel.publicationCount === 1, '8. exactly one publication row');
        const [row] = readModel.publications;
        assert(row.objectId === 'pub-1', '9. objectId is carried forward under 0.9.0\'s own name, never renamed to "id"');
        assert(row.title === 'Untitled', '10. title is carried forward verbatim');
        assert(row.publisherIdentity.username === 'alice', '11. publisherIdentity is carried forward as the whole object, never collapsed to a scalar');
        assert(row.isSigned === true, '12. isSigned is carried forward verbatim');
        assert(row.x === 10 && row.y === 0 && row.z === 20, '13. position.x/y/z are flattened onto the row as x/y/z');
        assert(!('position' in row), '14. the nested position object itself is not carried forward once flattened');
        assert(!('kind' in row), '15. kind is dropped — a publications-array row is already unambiguously a publication');
        assert(row.anchorCount === 2 && row.placementCount === 1, '16. anchorCount/placementCount are carried forward verbatim, still two independent counts');

        console.log('✓ Section B: a publication row carries 0.9.0\'s own fields verbatim, with position flattened and kind dropped');
    }

    // ---------------------------------------------------------------
    // Section C — a single avatar encounter: renaming/flattening fidelity.
    // ---------------------------------------------------------------
    {
        const encounters = deriveWorldEncounters({
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });
        const readModel = describeWorldEncounterReadModel(encounters);

        assert(readModel.avatarCount === 1, '17. exactly one avatar row');
        const [row] = readModel.avatars;
        assert(row.objectId === 'avatar-1', '18. objectId is carried forward under 0.9.0\'s own name');
        assert(row.ownerIdentity === 'bob', '19. ownerIdentity is carried forward verbatim');
        assert(row.displayName === 'Bob', '20. displayName is carried forward verbatim');
        assert(row.x === 5 && row.y === 0 && row.z === 5, '21. position.x/y/z are flattened onto the row as x/y/z');
        assert(!('position' in row), '22. the nested position object itself is not carried forward once flattened');
        assert(!('kind' in row), '23. kind is dropped — an avatars-array row is already unambiguously an avatar');

        console.log('✓ Section C: an avatar row carries 0.9.0\'s own fields verbatim, with position flattened and kind dropped');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: two publishers, one avatar present, one not.
    // ---------------------------------------------------------------
    {
        const alicePub = publicationOf({ id: 'alice-pub', title: "Alice's Sculpture", publisherIdentity: { username: 'alice' } });
        const bobPub = publicationOf({ id: 'bob-pub', title: "Bob's Garden", publisherIdentity: { username: 'bob' }, signature: null });
        const carolPub = publicationOf({ id: 'carol-pub', title: "Carol's Draft", publisherIdentity: { username: 'carol' } });

        const encounters = deriveWorldEncounters({
            publications: [alicePub, bobPub, carolPub],
            placements: [
                placementOf({ id: 'p-alice', publicationId: 'alice-pub', position: { x: 100, y: 0, z: 100 } }),
                placementOf({ id: 'p-bob', publicationId: 'bob-pub', position: { x: -50, y: 0, z: 30 } })
                // carol-pub is never placed.
            ],
            anchors: [anchorOf({ publicationId: 'alice-pub' })],
            snapshotPlacements: [snapshotPlacementOf({ publicationId: 'alice-pub' })],
            avatarProfiles: [
                avatarProfileOf({ avatarId: 'bob-avatar', ownerIdentity: 'bob', displayName: 'Bob' }),
                avatarProfileOf({ avatarId: 'alice-avatar', ownerIdentity: 'alice', displayName: 'Alice' })
            ],
            avatarPresences: [avatarPresenceOf({ avatarId: 'bob-avatar', position: { x: -48, y: 0, z: 31 } })]
        });

        const readModel = describeWorldEncounterReadModel(encounters);

        assert(readModel.publicationCount === 2, '24. FLAGSHIP — exactly two placed publications');
        assert(readModel.avatarCount === 1, '25. FLAGSHIP — exactly one present avatar');
        assert(readModel.totalCount === 3, '26. FLAGSHIP — totalCount is the plain structural sum, 2 + 1');
        assert(readModel.publications.every((row) => row.objectId !== 'carol-pub'), '27. FLAGSHIP — Carol\'s unplaced document never appears');

        const alice = readModel.publications.find((row) => row.objectId === 'alice-pub');
        const bob = readModel.publications.find((row) => row.objectId === 'bob-pub');
        assert(alice.anchorCount === 1 && alice.placementCount === 1, "28. FLAGSHIP — Alice's evidence counts carried forward");
        assert(bob.anchorCount === 0 && bob.placementCount === 0, "29. FLAGSHIP — Bob's zero counts carried forward as plain zeroes");
        assert(alice.isSigned === true && bob.isSigned === false, '30. FLAGSHIP — isSigned is per-row, independently reported');

        assert(readModel.avatars.length === 1 && readModel.avatars[0].objectId === 'bob-avatar', "31. FLAGSHIP — only Bob's present avatar is encountered");

        // Row order preserves 0.9.0's own order, unchanged — never re-sorted.
        const expectedOrder = encounters.publications.map((e) => e.objectId);
        const actualOrder = readModel.publications.map((row) => row.objectId);
        assert(serialize(expectedOrder) === serialize(actualOrder), '32. FLAGSHIP — publication row order is 0.9.0\'s own order, unchanged');

        console.log('✓ Section D: FLAGSHIP — two publishers and one present avatar, with plain structural counts and preserved order');
    }

    // ---------------------------------------------------------------
    // Section E — vocabulary boundary: no evaluative/spatial-navigation
    // vocabulary, on the result or in this file's own code.
    // ---------------------------------------------------------------
    {
        const encounters = deriveWorldEncounters({
            publications: [publicationOf()],
            placements: [placementOf()],
            anchors: [anchorOf()],
            snapshotPlacements: [snapshotPlacementOf()],
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });
        const readModel = describeWorldEncounterReadModel(encounters);
        const resultText = serialize(readModel).toLowerCase();

        const forbiddenInResult = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'verified', 'confidence',
            'distance', 'nearest', 'nearby', 'visible', 'visibility', 'interesting', 'relevance', 'radius'
        ];
        for (const term of forbiddenInResult) {
            assert(!resultText.includes(term), `33. the result never carries evaluative/spatial-navigation vocabulary ('${term}')`);
        }

        const moduleSource = await readFile(new URL('../application/WorldEncounterReadModel.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'verified', 'confidence',
            'distance', 'nearest', 'nearby', 'visible', 'visibility', 'interesting', 'relevance', 'radius',
            'camera', 'fetch(', 'websocket', 'gossip', 'socket'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `34. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '35. this file imports nothing — it performs no join and never calls deriveWorldEncounters() itself');

        console.log('✓ Section E: no evaluative or spatial-navigation vocabulary appears in the result or in this file\'s own code, and this file imports nothing');
    }

    // ---------------------------------------------------------------
    // Section F — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const encounters = deriveWorldEncounters({
            publications: [publicationOf()],
            placements: [placementOf()],
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });
        const before = serialize(encounters);

        const readModel = describeWorldEncounterReadModel(encounters);

        assert(serialize(encounters) === before, '36. the supplied encounters result is never mutated');
        assert(Object.isFrozen(readModel), '37. the result is frozen');
        assert(Object.isFrozen(readModel.publications), '38. the publications array is frozen');
        assert(Object.isFrozen(readModel.avatars), '39. the avatars array is frozen');
        assert(Object.isFrozen(readModel.publications[0]), '40. a publication row is frozen');
        assert(Object.isFrozen(readModel.avatars[0]), '41. an avatar row is frozen');

        const again = describeWorldEncounterReadModel(encounters);
        assert(serialize(again) === serialize(readModel), '42. calling describeWorldEncounterReadModel() twice with a byte-identical argument returns a byte-identical result');

        console.log('✓ Section F: no mutation of the supplied encounters, every returned object/array is frozen, and computation is deterministic');
    }

    // ---------------------------------------------------------------
    // Section G — consumes 0.9.0's own deriveWorldEncounters() result
    // directly, with no encounters produced.
    // ---------------------------------------------------------------
    {
        const emptyEncounters = deriveWorldEncounters();
        const readModel = describeWorldEncounterReadModel(emptyEncounters);

        assert(readModel.publicationCount === 0 && readModel.avatarCount === 0 && readModel.totalCount === 0, '43. an empty 0.9.0 result produces an empty read model');
        assert(serialize(readModel) === serialize(describeWorldEncounterReadModel({ publications: [], avatars: [] })), '44. an empty 0.9.0 result agrees exactly with an explicitly empty argument');

        console.log('✓ Section G: this file consumes 0.9.0\'s own deriveWorldEncounters() result directly, agreeing exactly on the empty case');
    }

    console.log('\nAll WorldEncounterReadModel tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterReadModel.test.js FAILED:', error);
    process.exitCode = 1;
});
