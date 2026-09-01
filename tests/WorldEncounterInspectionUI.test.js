import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.18 — Render Selected Encounter Inspection.
//
// 0.9.16 built `describeWorldEncounterInspection({ selectedEncounter, view })`
// and stopped, explicitly leaving "any UI, panel, or rendering technology
// choice" as separate, later, unscheduled work. This file exercises the
// one thing 0.9.18 adds: `WorldEncounterCanvas`'s own new
// `selectedEncounterInspection` computed, joining its own already-existing
// `selectedEncounter` (0.9.4) against its own already-existing
// `effectiveView` (0.9.2/0.9.13) through 0.9.16's own unmodified function.
//
// Section A: FLAGSHIP — selecting a publication, then an avatar, each
//            produces the expected inspection via the canvas's own
//            computed.
// Section B: no selection — selectedEncounterInspection is null.
// Section C: a stale selection — the selected object has left the World
//            — renders null, never a stale row, and never clears
//            selectedEncounter itself.
// Section D: a selection can resume — an object that reappears under the
//            same objectId is inspected again automatically.
// Section E: publisherIdentity renders as its own verbatim structure,
//            never a cherry-picked field.
// Section F: isSigned stays isSigned — no isVerified/isTrusted/isAuthentic
//            vocabulary anywhere in this component's own code.
// Section G: import boundary — exactly two application/ modules, still no
//            core/.
// Section H: kind/objectId cross-matching still never happens through the
//            canvas's own computed.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function publicationRow(overrides = {}) {
    return {
        objectId: 'pub-1',
        title: 'First Publication',
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
    const totalCount = publications.length + avatars.length;
    return { isEmpty: totalCount === 0, publicationCount: publications.length, avatarCount: avatars.length, totalCount, publications, avatars };
}

function canvasCtx({ view, selectedEncounter = null } = {}) {
    const ctx = {
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        registry: null,
        wandererPosition: { x: 0, y: 0, z: 0 },
        selectedEncounter
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: selecting a publication, then an avatar.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [publicationRow({ objectId: 'pub-1', title: 'First', publisherIdentity: { username: 'alice' }, isSigned: true, x: 1, y: 0, z: 2, anchorCount: 3, placementCount: 1 })],
            avatars: [avatarRow({ objectId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', x: 5, y: 0, z: 6 })]
        });

        const publicationCtx = canvasCtx({ view, selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' } });
        const publicationInspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(publicationCtx);
        assert(serialize(publicationInspection) === serialize({
            kind: 'PUBLICATION', objectId: 'pub-1', title: 'First', publisherIdentity: { username: 'alice' },
            isSigned: true, x: 1, y: 0, z: 2, anchorCount: 3, placementCount: 1
        }), '1. FLAGSHIP — selecting a publication produces its full inspection via the canvas\'s own computed');

        const avatarCtx = canvasCtx({ view, selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-1' } });
        const avatarInspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(avatarCtx);
        assert(serialize(avatarInspection) === serialize({
            kind: 'AVATAR', objectId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', x: 5, y: 0, z: 6
        }), '2. FLAGSHIP — selecting an avatar produces its full inspection, in its own separate shape');

        console.log('✓ Section A: FLAGSHIP — selecting a publication then an avatar each render their expected inspection');
    }

    // ---------------------------------------------------------------
    // Section B — no selection: selectedEncounterInspection is null.
    // ---------------------------------------------------------------
    {
        const view = viewOf({ publications: [publicationRow()] });
        const ctx = canvasCtx({ view, selectedEncounter: null });

        assert(WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx) === null, '3. with no selectedEncounter, selectedEncounterInspection is null');

        console.log('✓ Section B: no selection means no inspection to render');
    }

    // ---------------------------------------------------------------
    // Section C — a stale selection renders null, never a stale row, and
    // never clears selectedEncounter itself.
    // ---------------------------------------------------------------
    {
        // The Wanderer selects a publication that is present...
        const withPublication = viewOf({ publications: [publicationRow({ objectId: 'pub-1' })] });
        const ctx = canvasCtx({ view: withPublication, selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' } });
        const firstInspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx);
        assert(firstInspection !== null && firstInspection.objectId === 'pub-1', '4. the selected publication starts out inspectable');

        // ...then the World re-renders with that publication gone (a peer
        // disconnected, or replaced its source) — exactly the live-registry
        // churn 0.9.13 already made possible. selectedEncounter itself is
        // left untouched; only effectiveView changed.
        ctx.view = viewOf();
        ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
        const staleInspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx);

        assert(staleInspection === null, '5. a selection whose object has left the World renders null, never the previous inspection');
        assert(serialize(ctx.selectedEncounter) === serialize({ kind: 'PUBLICATION', objectId: 'pub-1' }), '6. selectedEncounter itself is never cleared just because its inspection went stale');

        console.log('✓ Section C: a stale selection renders no inspection details, without retaining or fabricating stale information');
    }

    // ---------------------------------------------------------------
    // Section D — a selection resumes automatically once its object
    // reappears under the same objectId.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx({ view: viewOf(), selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-1' } });
        assert(WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx) === null, '7. selecting an avatar not yet present in the World renders null');

        ctx.view = viewOf({ avatars: [avatarRow({ objectId: 'avatar-1', displayName: 'Bob' })] });
        ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
        const resumed = WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx);

        assert(resumed !== null && resumed.displayName === 'Bob', '8. the same selection resumes inspecting automatically once its object reappears — no explicit retry/refresh action');

        console.log('✓ Section D: a selection automatically resumes inspecting once its own object reappears in a fresh view');
    }

    // ---------------------------------------------------------------
    // Section E — publisherIdentity renders as its own verbatim structure.
    // ---------------------------------------------------------------
    {
        const view = viewOf({ publications: [publicationRow({ objectId: 'pub-1', publisherIdentity: { username: 'carol', did: 'did:key:abc123' } })] });
        const ctx = canvasCtx({ view, selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' } });
        ctx.selectedEncounterInspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx);
        const label = WorldEncounterCanvas.computed.selectedEncounterInspectionPublisherIdentityLabel.call(ctx);

        assert(label === JSON.stringify({ username: 'carol', did: 'did:key:abc123' }), '9. publisherIdentity renders as its own verbatim JSON structure');
        assert(!label.includes('[object Object]'), '10. publisherIdentity is never rendered as an unhelpful [object Object]');

        const avatarCtx = canvasCtx({ view: viewOf({ avatars: [avatarRow()] }), selectedEncounter: { kind: 'AVATAR', objectId: 'avatar-1' } });
        avatarCtx.selectedEncounterInspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(avatarCtx);
        assert(WorldEncounterCanvas.computed.selectedEncounterInspectionPublisherIdentityLabel.call(avatarCtx) === '', '11. an avatar selection never produces a publisherIdentity label — that field belongs only to a publication inspection');

        const noSelectionCtx = canvasCtx({ view: viewOf(), selectedEncounter: null });
        noSelectionCtx.selectedEncounterInspection = null;
        assert(WorldEncounterCanvas.computed.selectedEncounterInspectionPublisherIdentityLabel.call(noSelectionCtx) === '', '12. with no inspection at all, the publisherIdentity label is the empty string, never a thrown error');

        console.log('✓ Section E: publisherIdentity is rendered as its own structure, never a cherry-picked field');
    }

    // ---------------------------------------------------------------
    // Section F — isSigned stays isSigned; no isVerified/isTrusted/
    // isAuthentic vocabulary anywhere in this component's own code.
    // ---------------------------------------------------------------
    {
        const view = viewOf({ publications: [publicationRow({ objectId: 'pub-1', isSigned: true })] });
        const ctx = canvasCtx({ view, selectedEncounter: { kind: 'PUBLICATION', objectId: 'pub-1' } });
        const inspection = WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx);
        assert(inspection.isSigned === true, '13. isSigned is forwarded exactly as 0.9.16 computed it');

        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbidden = ['isverified', 'istrusted', 'isauthentic', 'score', 'rank', 'trust', 'reputation', 'confidence', 'distance', 'nearest', 'nearby', 'radius', 'fetch(', 'websocket'];
        for (const term of forbidden) {
            assert(!codeOnly.includes(term), `14. WorldEncounterCanvas.js's own code never carries "${term}"`);
        }

        console.log('✓ Section F: isSigned stays exactly what 0.9.16 already made it — no trust/verification vocabulary enters this component');
    }

    // ---------------------------------------------------------------
    // Section G — import boundary: exactly two application/ modules, still
    // no core/ module.
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(!importLines.some((line) => line.includes('core/')), '15. WorldEncounterCanvas.js still never imports any core/ module directly');
        const applicationImportLines = importLines.filter((line) => line.includes('application/'));
        assert(applicationImportLines.length === 2, '16. WorldEncounterCanvas.js imports exactly two application/ modules as of 0.9.18');
        assert(applicationImportLines.some((line) => line.includes('WorldDiscoveryRegistryProjection.js') && line.includes('describeWorldFromDiscoveryRegistry')), '17. the pre-existing 0.9.13 registry-projection import is unchanged');
        assert(applicationImportLines.some((line) => line.includes('WorldEncounterInspection.js') && line.includes('describeWorldEncounterInspection')), '18. this milestone adds exactly one new import — WorldEncounterInspection.js\'s own describeWorldEncounterInspection()');

        console.log('✓ Section G: WorldEncounterCanvas.js imports exactly two application/ modules, still no core/ module, as of 0.9.18');
    }

    // ---------------------------------------------------------------
    // Section H — kind/objectId cross-matching still never happens through
    // the canvas's own computed.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [publicationRow({ objectId: 'shared-id' })],
            avatars: [avatarRow({ objectId: 'shared-id' })]
        });

        const asPublication = WorldEncounterCanvas.computed.selectedEncounterInspection.call(canvasCtx({ view, selectedEncounter: { kind: 'PUBLICATION', objectId: 'shared-id' } }));
        assert(asPublication.kind === 'PUBLICATION' && 'title' in asPublication, '19. selecting kind PUBLICATION with a shared id resolves the publication row through the canvas\'s own computed');

        const asAvatar = WorldEncounterCanvas.computed.selectedEncounterInspection.call(canvasCtx({ view, selectedEncounter: { kind: 'AVATAR', objectId: 'shared-id' } }));
        assert(asAvatar.kind === 'AVATAR' && 'displayName' in asAvatar, '20. selecting kind AVATAR with the same shared id resolves the avatar row, not the publication');

        console.log('✓ Section H: kind still decides which array is searched, even through the canvas\'s own computed');
    }

    console.log('\nAll WorldEncounterInspectionUI tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterInspectionUI.test.js FAILED:', error);
    process.exitCode = 1;
});
