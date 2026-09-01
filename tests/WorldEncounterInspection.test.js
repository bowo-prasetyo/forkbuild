import { readFile } from 'node:fs/promises';
import { describeWorldEncounterInspection } from '../application/WorldEncounterInspection.js';

// 0.9.16 — World Encounter Inspection Read Model.
//
// 0.9.4 gave the Wanderer a `selectedEncounter = { kind, objectId }` — an
// identity, never a description. This file's own function joins that
// identity back against 0.9.2's own `view` (the already-computed
// `publications`/`avatars` arrays) to produce a read-only, structural
// inspection row — still never verifying, still never trusting.
//
// Section A: malformed/absent input — null, never throws.
// Section B: FLAGSHIP — select a publication, then an avatar, from a
//            mixed view (the task's own worked example).
// Section C: not found — an objectId absent from view degrades to null.
// Section D: kind/objectId cross-matching is never allowed — a
//            publication objectId can't be "found" under kind AVATAR.
// Section E: multiple rows — the correct row is picked, not just the first.
// Section F: verbatim field forwarding — every field is the row's own,
//            unchanged; no renaming.
// Section G: `isSigned` never becomes `isVerified`/`isTrusted`/`isAuthentic`.
// Section H: no mutation of selectedEncounter/view, frozen result, determinism.
// Section I: no score/rank/trust/verified/nearest/distance vocabulary
//            anywhere in the result or in this file's own code.
// Section J: this file imports nothing.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function publicationRow(overrides = {}) {
    return {
        objectId: 'pub-1',
        title: 'First',
        publisherIdentity: { username: 'alice' },
        isSigned: true,
        x: 1,
        y: 0,
        z: 2,
        anchorCount: 3,
        placementCount: 1,
        ...overrides
    };
}

function avatarRow(overrides = {}) {
    return {
        objectId: 'avatar-1',
        ownerIdentity: 'bob',
        displayName: 'Bob',
        x: 5,
        y: 0,
        z: 6,
        ...overrides
    };
}

function viewOf({ publications = [], avatars = [] } = {}) {
    return { isEmpty: publications.length === 0 && avatars.length === 0, publicationCount: publications.length, avatarCount: avatars.length, totalCount: publications.length + avatars.length, publications, avatars };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent input degrades to null, never throws.
    // ---------------------------------------------------------------
    {
        assert(describeWorldEncounterInspection() === null, '1. calling with no argument at all returns null');
        assert(describeWorldEncounterInspection({}) === null, '2. an empty options object returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: null, view: viewOf({ publications: [publicationRow()] }) }) === null, '3. a null selectedEncounter returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION' }, view: viewOf({ publications: [publicationRow()] }) }) === null, '4. a selectedEncounter with no objectId returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view: null }) === null, '5. a null view returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view: {} }) === null, '6. a view missing publications/avatars arrays returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'ASTEROID', objectId: 'pub-1' }, view: viewOf({ publications: [publicationRow()] }) }) === null, '7. an unrecognized kind returns null, never guesses which array to search');

        console.log('✓ Section A: malformed/absent input degrades to null, never throws');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: select a publication, then an avatar.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [publicationRow({ objectId: 'pub-1', title: 'First', publisherIdentity: { username: 'alice' }, isSigned: true, x: 1, y: 0, z: 2, anchorCount: 3, placementCount: 1 })],
            avatars: [avatarRow({ objectId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', x: 5, y: 0, z: 6 })]
        });

        const publicationInspection = describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view });
        assert(serialize(publicationInspection) === serialize({
            kind: 'PUBLICATION', objectId: 'pub-1', title: 'First', publisherIdentity: { username: 'alice' },
            isSigned: true, x: 1, y: 0, z: 2, anchorCount: 3, placementCount: 1
        }), '8. FLAGSHIP — inspecting the selected publication produces the exact expected structural description');

        const avatarInspection = describeWorldEncounterInspection({ selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-1' }, view });
        assert(serialize(avatarInspection) === serialize({
            kind: 'AVATAR', objectId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', x: 5, y: 0, z: 6
        }), '9. FLAGSHIP — inspecting the selected avatar produces the exact expected structural description, in a separate shape');

        console.log('✓ Section B: FLAGSHIP — selecting a publication then an avatar each produce the expected inspection');
    }

    // ---------------------------------------------------------------
    // Section C — not found: an objectId absent from view degrades to null.
    // ---------------------------------------------------------------
    {
        const view = viewOf({ publications: [publicationRow({ objectId: 'pub-1' })], avatars: [avatarRow({ objectId: 'avatar-1' })] });

        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-does-not-exist' }, view }) === null, '10. a publication objectId no longer in view returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-does-not-exist' }, view }) === null, '11. an avatar objectId no longer in view returns null');
        assert(describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view: viewOf() }) === null, '12. an empty view (nothing encounterable) returns null for any selection');

        console.log('✓ Section C: an encounter that has left the World between selection and inspection degrades to null, never a stale row');
    }

    // ---------------------------------------------------------------
    // Section D — kind/objectId cross-matching is never allowed.
    // ---------------------------------------------------------------
    {
        const view = viewOf({ publications: [publicationRow({ objectId: 'shared-id' })], avatars: [avatarRow({ objectId: 'shared-id' })] });

        const asPublication = describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'shared-id' }, view });
        assert(asPublication !== null && asPublication.kind === 'PUBLICATION' && 'title' in asPublication, '13. selecting kind PUBLICATION with a shared id resolves the publication row');

        const asAvatar = describeWorldEncounterInspection({ selectedEncounter: { kind: 'AVATAR', objectId: 'shared-id' }, view });
        assert(asAvatar !== null && asAvatar.kind === 'AVATAR' && 'displayName' in asAvatar, '14. selecting kind AVATAR with the same shared id resolves the avatar row, not the publication');

        assert(!('displayName' in asPublication), '15. a publication inspection never gains avatar-only fields');
        assert(!('title' in asAvatar), '16. an avatar inspection never gains publication-only fields');

        console.log('✓ Section D: kind decides which array is searched — an objectId shared across kinds never cross-matches');
    }

    // ---------------------------------------------------------------
    // Section E — multiple rows: the correct row is picked, not just the first.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [
                publicationRow({ objectId: 'p1', title: 'First' }),
                publicationRow({ objectId: 'p2', title: 'Second' }),
                publicationRow({ objectId: 'p3', title: 'Third' })
            ],
            avatars: [
                avatarRow({ objectId: 'a1', displayName: 'Alpha' }),
                avatarRow({ objectId: 'a2', displayName: 'Beta' })
            ]
        });

        const p2 = describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'p2' }, view });
        assert(p2.title === 'Second', '17. selecting p2 out of three publications resolves p2, not p1');

        const a2 = describeWorldEncounterInspection({ selectedEncounter: { kind: 'AVATAR', objectId: 'a2' }, view });
        assert(a2.displayName === 'Beta', '18. selecting a2 out of two avatars resolves a2, not a1');

        console.log('✓ Section E: the matching row is picked by objectId, regardless of its position in the view');
    }

    // ---------------------------------------------------------------
    // Section F — verbatim field forwarding, no renaming.
    // ---------------------------------------------------------------
    {
        const pubRow = publicationRow({ objectId: 'pub-1', title: 'Verbatim Title', publisherIdentity: { username: 'carol' }, isSigned: false, x: 9, y: 8, z: 7, anchorCount: 2, placementCount: 4 });
        const view = viewOf({ publications: [pubRow] });
        const inspection = describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view });

        assert(inspection.title === pubRow.title, '19. title is forwarded verbatim');
        assert(serialize(inspection.publisherIdentity) === serialize(pubRow.publisherIdentity), '20. publisherIdentity is forwarded verbatim');
        assert(inspection.isSigned === pubRow.isSigned, '21. isSigned is forwarded verbatim, unchanged');
        assert(inspection.x === pubRow.x && inspection.y === pubRow.y && inspection.z === pubRow.z, '22. x/y/z are forwarded verbatim');
        assert(inspection.anchorCount === pubRow.anchorCount && inspection.placementCount === pubRow.placementCount, '23. anchorCount/placementCount are forwarded verbatim');
        assert(serialize(Object.keys(inspection).sort()) === serialize(['anchorCount', 'isSigned', 'kind', 'objectId', 'placementCount', 'publisherIdentity', 'title', 'x', 'y', 'z']), '24. a publication inspection carries exactly these fields, nothing more');

        const avRow = avatarRow({ objectId: 'avatar-1', ownerIdentity: 'dave', displayName: 'Dave', x: 1, y: 2, z: 3 });
        const avatarInspection = describeWorldEncounterInspection({ selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-1' }, view: viewOf({ avatars: [avRow] }) });
        assert(serialize(Object.keys(avatarInspection).sort()) === serialize(['displayName', 'kind', 'objectId', 'ownerIdentity', 'x', 'y', 'z']), '25. an avatar inspection carries exactly these fields, nothing more');

        console.log('✓ Section F: every field is forwarded verbatim under its own name, with no extra fields on either shape');
    }

    // ---------------------------------------------------------------
    // Section G — isSigned never becomes isVerified/isTrusted/isAuthentic.
    // ---------------------------------------------------------------
    {
        const signed = describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view: viewOf({ publications: [publicationRow({ objectId: 'pub-1', isSigned: true })] }) });
        assert(signed.isSigned === true, '26. isSigned true still means only "carries signature material"');
        assert(!('isVerified' in signed) && !('isTrusted' in signed) && !('isAuthentic' in signed) && !('verified' in signed), '27. no isVerified/isTrusted/isAuthentic/verified field is ever introduced');

        console.log('✓ Section G: isSigned stays exactly what it already was — never promoted to a trust/verification claim');
    }

    // ---------------------------------------------------------------
    // Section H — no mutation, frozen result, determinism.
    // ---------------------------------------------------------------
    {
        const selectedEncounter = Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-1' });
        const view = Object.freeze(viewOf({ publications: [Object.freeze(publicationRow({ objectId: 'pub-1' }))] }));
        const before = serialize(view);

        const first = describeWorldEncounterInspection({ selectedEncounter, view });
        assert(serialize(view) === before, '28. the supplied view is never mutated');
        assert(Object.isFrozen(first), '29. the returned inspection is frozen');

        const second = describeWorldEncounterInspection({ selectedEncounter, view });
        assert(serialize(first) === serialize(second), '30. calling twice with byte-identical arguments returns a byte-identical result');
        assert(first !== second, '31. each call returns a freshly frozen object, never the same reference as view\'s own row');

        console.log('✓ Section H: no mutation of selectedEncounter/view, a frozen result, and deterministic repeat calls');
    }

    // ---------------------------------------------------------------
    // Section I — no score/rank/trust/verified/nearest/distance vocabulary.
    // ---------------------------------------------------------------
    {
        const view = viewOf({ publications: [publicationRow()], avatars: [avatarRow()] });
        const publicationResult = serialize(describeWorldEncounterInspection({ selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' }, view })).toLowerCase();
        const avatarResult = serialize(describeWorldEncounterInspection({ selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-1' }, view })).toLowerCase();

        const forbiddenInResult = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'confidence',
            'distance', 'nearest', 'nearby', 'visible', 'visibility', 'viewport', 'radius',
            'cluster', 'relevance', 'priorit', 'isverified', 'istrusted', 'isauthentic'
        ];
        for (const term of forbiddenInResult) {
            assert(!publicationResult.includes(term), `32. the publication inspection result never carries "${term}"`);
            assert(!avatarResult.includes(term), `33. the avatar inspection result never carries "${term}"`);
        }

        const moduleSource = await readFile(new URL('../application/WorldEncounterInspection.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'confidence',
            'distance', 'nearest', 'nearby', 'visible', 'visibility', 'viewport', 'radius',
            'cluster', 'relevance', 'priorit', 'camera', 'movement', 'sort(', 'fetch(', 'websocket',
            'isverified', 'istrusted', 'isauthentic'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `34. this file's own code never carries "${term}"`);
        }

        console.log('✓ Section I: no score/rank/trust/verified/distance vocabulary anywhere in the result or in this file\'s own code');
    }

    // ---------------------------------------------------------------
    // Section J — this file imports nothing.
    // ---------------------------------------------------------------
    {
        const moduleSource = await readFile(new URL('../application/WorldEncounterInspection.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '35. application/WorldEncounterInspection.js imports nothing');

        console.log('✓ Section J: this file imports nothing');
    }

    console.log('\nAll WorldEncounterInspection tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterInspection.test.js FAILED:', error);
    process.exitCode = 1;
});
