import { readFile } from 'node:fs/promises';
import { describeWorldEncounterView } from '../application/WorldEncounterView.js';
import { describeWorldEncounterReadModel } from '../application/WorldEncounterReadModel.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';

// 0.9.2 — World View Presentation Projection.
//
// Section A: malformed/absent readModel — empty, never throws
// Section B: FLAGSHIP — 2 publications, 1 avatar
// Section C: isEmpty boundary — 0/0, 1/0, 0/1
// Section D: verbatim row forwarding — same references, no reinterpretation
// Section E: separate branches — publications and avatars never cross
// Section F: order preservation — no sorting
// Section G: no spatial or evaluative vocabulary, on the result or in the code
// Section H: no mutation, frozen results, determinism
// Section I: consumes 0.9.1's own read model result directly

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

function avatarProfileOf(overrides = {}) {
    return { avatarId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', ...overrides };
}

function avatarPresenceOf(overrides = {}) {
    return { avatarId: 'avatar-1', position: { x: 5, y: 0, z: 5 }, ...overrides };
}

function readModelFrom({ publications = [], placements = [], avatarProfiles = [], avatarPresences = [] } = {}) {
    const encounters = deriveWorldEncounters({ publications, placements, avatarProfiles, avatarPresences });
    return describeWorldEncounterReadModel(encounters);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent readModel.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { publications: 'nope' }, { publications: null, avatars: null }]) {
            const view = describeWorldEncounterView(malformed);
            assert(view.isEmpty === true, `1. malformed input (${serialize(malformed)}) reports isEmpty true`);
            assert(view.publicationCount === 0, `2. malformed input (${serialize(malformed)}) reports publicationCount 0`);
            assert(view.avatarCount === 0, `3. malformed input (${serialize(malformed)}) reports avatarCount 0`);
            assert(view.totalCount === 0, `4. malformed input (${serialize(malformed)}) reports totalCount 0`);
            assert(Array.isArray(view.publications) && view.publications.length === 0, `5. malformed input (${serialize(malformed)}) reports an empty publications array`);
            assert(Array.isArray(view.avatars) && view.avatars.length === 0, `6. malformed input (${serialize(malformed)}) reports an empty avatars array`);
            assert(Object.isFrozen(view) && Object.isFrozen(view.publications) && Object.isFrozen(view.avatars), `7. malformed input (${serialize(malformed)}) still returns a frozen, valid result`);
        }
        assert(describeWorldEncounterView().isEmpty === true, '8. calling with no argument defaults to an empty, isEmpty result, never throws');

        console.log('✓ Section A: malformed/absent input degrades to a valid, empty, isEmpty view rather than throwing');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: 2 publications, 1 avatar.
    // ---------------------------------------------------------------
    {
        const readModel = readModelFrom({
            publications: [
                publicationOf({ id: 'pub-1', title: 'First' }),
                publicationOf({ id: 'pub-2', title: 'Second', publisherIdentity: { username: 'bob' } })
            ],
            placements: [
                placementOf({ id: 'placement-1', publicationId: 'pub-1', position: { x: 1, y: 0, z: 1 } }),
                placementOf({ id: 'placement-2', publicationId: 'pub-2', position: { x: 2, y: 0, z: 2 } })
            ],
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });

        const view = describeWorldEncounterView(readModel);

        assert(view.isEmpty === false, '9. FLAGSHIP — a mixed World is never empty');
        assert(view.publicationCount === 2, '10. FLAGSHIP — publicationCount is 2');
        assert(view.avatarCount === 1, '11. FLAGSHIP — avatarCount is 1');
        assert(view.totalCount === 3, '12. FLAGSHIP — totalCount is 3');
        assert(view.publications.length === 2, '13. FLAGSHIP — publications array has 2 entries');
        assert(view.avatars.length === 1, '14. FLAGSHIP — avatars array has 1 entry');

        console.log('✓ Section B: FLAGSHIP — 2 publications, 1 avatar produces isEmpty:false with matching counts');
    }

    // ---------------------------------------------------------------
    // Section C — isEmpty boundary: 0/0, 1/0, 0/1.
    // ---------------------------------------------------------------
    {
        const empty = describeWorldEncounterView(readModelFrom());
        assert(empty.isEmpty === true, '15. 0 publications, 0 avatars — isEmpty is true');
        assert(empty.publicationCount === 0 && empty.avatarCount === 0 && empty.totalCount === 0, '16. 0/0 counts are all zero');
        assert(empty.publications.length === 0 && empty.avatars.length === 0, '17. 0/0 arrays are both empty');

        const onlyPublication = describeWorldEncounterView(readModelFrom({
            publications: [publicationOf()],
            placements: [placementOf()]
        }));
        assert(onlyPublication.isEmpty === false, '18. 1 publication, 0 avatars — isEmpty MUST be false');
        assert(onlyPublication.publicationCount === 1 && onlyPublication.avatarCount === 0, '19. 1/0 counts are correct');

        const onlyAvatar = describeWorldEncounterView(readModelFrom({
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        }));
        assert(onlyAvatar.isEmpty === false, '20. 0 publications, 1 avatar — isEmpty MUST be false');
        assert(onlyAvatar.publicationCount === 0 && onlyAvatar.avatarCount === 1, '21. 0/1 counts are correct');

        console.log('✓ Section C: isEmpty is based on encounter presence — 1/0 and 0/1 are both non-empty');
    }

    // ---------------------------------------------------------------
    // Section D — verbatim row forwarding: same references, no reinterpretation.
    // ---------------------------------------------------------------
    {
        const readModel = readModelFrom({
            publications: [publicationOf()],
            placements: [placementOf()],
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });
        const view = describeWorldEncounterView(readModel);

        assert(view.publications[0] === readModel.publications[0], '22. a publication row is the SAME object 0.9.1 already produced, not a copy');
        assert(view.avatars[0] === readModel.avatars[0], '23. an avatar row is the SAME object 0.9.1 already produced, not a copy');
        assert(serialize(view.publications[0]) === serialize(readModel.publications[0]), '24. a publication row is byte-identical to 0.9.1\'s own row');
        assert(serialize(view.avatars[0]) === serialize(readModel.avatars[0]), '25. an avatar row is byte-identical to 0.9.1\'s own row');

        console.log('✓ Section D: rows survive verbatim, forwarded by reference, never rebuilt or reinterpreted');
    }

    // ---------------------------------------------------------------
    // Section E — separate branches: publications and avatars never cross.
    // ---------------------------------------------------------------
    {
        const readModel = readModelFrom({
            publications: [publicationOf({ id: 'pub-1' })],
            placements: [placementOf({ publicationId: 'pub-1' })],
            avatarProfiles: [avatarProfileOf({ avatarId: 'avatar-1' })],
            avatarPresences: [avatarPresenceOf({ avatarId: 'avatar-1' })]
        });
        const view = describeWorldEncounterView(readModel);

        assert(!('objects' in view), '26. there is no flattened, generic "objects" collection');
        assert(view.publications.every((row) => row.objectId !== 'avatar-1'), '27. an avatar never appears in the publications array');
        assert(view.avatars.every((row) => row.objectId !== 'pub-1'), '28. a publication never appears in the avatars array');
        assert(!('ownerIdentity' in view.publications[0]), '29. a publication row never gains avatar-only fields');
        assert(!('title' in view.avatars[0]), '30. an avatar row never gains publication-only fields');

        console.log('✓ Section E: publications and avatars stay in separate, non-crossing arrays');
    }

    // ---------------------------------------------------------------
    // Section F — order preservation: no sorting.
    // ---------------------------------------------------------------
    {
        const readModel = readModelFrom({
            publications: [
                publicationOf({ id: 'p3', title: 'Third' }),
                publicationOf({ id: 'p1', title: 'First' }),
                publicationOf({ id: 'p2', title: 'Second' })
            ],
            placements: [
                placementOf({ id: 'pl3', publicationId: 'p3' }),
                placementOf({ id: 'pl1', publicationId: 'p1' }),
                placementOf({ id: 'pl2', publicationId: 'p2' })
            ],
            avatarProfiles: [
                avatarProfileOf({ avatarId: 'a3' }),
                avatarProfileOf({ avatarId: 'a1' }),
                avatarProfileOf({ avatarId: 'a2' })
            ],
            avatarPresences: [
                avatarPresenceOf({ avatarId: 'a3' }),
                avatarPresenceOf({ avatarId: 'a1' }),
                avatarPresenceOf({ avatarId: 'a2' })
            ]
        });
        const view = describeWorldEncounterView(readModel);

        assert(serialize(view.publications.map((row) => row.objectId)) === serialize(readModel.publications.map((row) => row.objectId)), '31. publication row order preserves 0.9.1\'s own order, unchanged');
        assert(serialize(view.avatars.map((row) => row.objectId)) === serialize(readModel.avatars.map((row) => row.objectId)), '32. avatar row order preserves 0.9.1\'s own order, unchanged');
        assert(serialize(view.publications.map((row) => row.objectId)) === serialize(['p3', 'p1', 'p2']), '33. publication order is never re-sorted by id or title');

        console.log('✓ Section F: row order preserves 0.9.1\'s own order — no sorting anywhere');
    }

    // ---------------------------------------------------------------
    // Section G — vocabulary boundary: no spatial or evaluative vocabulary,
    // on the result or in this file's own code.
    // ---------------------------------------------------------------
    {
        const readModel = readModelFrom({
            publications: [publicationOf()],
            placements: [placementOf()],
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });
        const view = describeWorldEncounterView(readModel);
        const resultText = serialize(view).toLowerCase();

        const forbiddenInResult = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'verified', 'confidence',
            'distance', 'nearest', 'nearby', 'visible', 'visibility', 'viewport', 'radius',
            'cluster', 'relevance', 'priorit'
        ];
        for (const term of forbiddenInResult) {
            assert(!resultText.includes(term), `34. the result never carries spatial/evaluative vocabulary ('${term}')`);
        }

        const moduleSource = await readFile(new URL('../application/WorldEncounterView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'verified', 'confidence',
            'distance', 'nearest', 'nearby', 'visible', 'visibility', 'viewport', 'radius',
            'cluster', 'relevance', 'priorit', 'camera', 'movement', 'sort(', 'fetch(', 'websocket'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `35. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '36. this file imports nothing');

        console.log('✓ Section G: no spatial or evaluative vocabulary appears in the result or in this file\'s own code, and this file imports nothing');
    }

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const readModel = readModelFrom({
            publications: [publicationOf()],
            placements: [placementOf()],
            avatarProfiles: [avatarProfileOf()],
            avatarPresences: [avatarPresenceOf()]
        });
        const before = serialize(readModel);

        const view = describeWorldEncounterView(readModel);

        assert(serialize(readModel) === before, '37. the supplied readModel is never mutated');
        assert(Object.isFrozen(view), '38. the result is frozen');
        assert(Object.isFrozen(view.publications), '39. the publications array is frozen');
        assert(Object.isFrozen(view.avatars), '40. the avatars array is frozen');

        const again = describeWorldEncounterView(readModel);
        assert(serialize(again) === serialize(view), '41. calling describeWorldEncounterView() twice with a byte-identical argument returns a byte-identical result');

        console.log('✓ Section H: no mutation of the supplied readModel, every returned array is frozen, and computation is deterministic');
    }

    // ---------------------------------------------------------------
    // Section I — consumes 0.9.1's own read model result directly.
    // ---------------------------------------------------------------
    {
        const emptyReadModel = describeWorldEncounterReadModel(deriveWorldEncounters());
        const view = describeWorldEncounterView(emptyReadModel);

        assert(view.isEmpty === true && view.totalCount === 0, '42. an empty 0.9.1 read model produces an empty, isEmpty view');
        assert(serialize(view) === serialize(describeWorldEncounterView({ publications: [], avatars: [] })), '43. an empty 0.9.1 result agrees exactly with an explicitly empty argument');

        console.log('✓ Section I: this file consumes 0.9.1\'s own read model result directly, agreeing exactly on the empty case');
    }

    console.log('\nAll WorldEncounterView tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterView.test.js FAILED:', error);
    process.exitCode = 1;
});
