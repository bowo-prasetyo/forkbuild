import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldEncounterMarker from '../ui/components/WorldEncounterMarker.js';

// 0.9.4 — World Encounter Selection.
//
// The one interaction 0.9.3 deliberately left inert: a marker click now
// reports "the user selected this marker" as `{ kind, objectId }`, and
// ui/components/WorldEncounterCanvas.js owns the resulting page-local
// `selectedEncounter` state. Nothing is fetched, compared, ranked, or
// persisted — see both components' own headers for the full boundary.
//
// Section A: FLAGSHIP — select P2, then A1 (from the task's own scenario).
// Section B: publication/avatar independence — selecting one kind never
//            touches the other.
// Section C: repeated selection — P1 -> P2 -> A1 leaves only A1 selected.
// Section D: selecting the same marker repeatedly is deterministic.
// Section E: an empty World has no markers to select — no accidental
//            selection.
// Section F: a malformed marker identity degrades gracefully, never
//            throws.
// Section G: selection never mutates the 0.9.2 view/props passed in.
// Section H: selection never reorders projected rows.
// Section I: WorldEncounterMarker still imports nothing.
// Section J: no network/persistence anywhere in this milestone's own code.
// Section K: the selected encounter never acquires interpretive fields
//            (verified/trusted/nearby/relevant) beyond kind/objectId.
// Section L: WorldEncounterMarker's `select` emit carries exactly
//            `{ kind, objectId }` — never the whole marker record.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function markerCtx(overrides = {}) {
    const emitted = [];
    const ctx = {
        kind: 'PUBLICATION',
        objectId: 'pub-1',
        label: 'A Publication',
        x: 0,
        y: 0,
        $emit(name, payload) {
            emitted.push({ name, payload });
        },
        ...overrides
    };
    return { ctx, emitted };
}

function canvasCtx(overrides = {}) {
    const ctx = {
        view: WorldEncounterCanvas.props.view.default(),
        // Never supplied by this file's own tests — 0.9.13 added this
        // prop, but selection (0.9.4) predates and is independent of it;
        // `effectiveView` below therefore always falls back to `view`.
        registry: null,
        wandererPosition: { x: 0, y: 0, z: 0 },
        selectedEncounter: null,
        // 0.9.20 — page-local state `selectEncounter()` now also writes
        // (via `refreshSelectionOutcome()`, attached below). `registry`
        // stays `null` throughout this file's own tests, so
        // `refreshSelectionOutcome()` always leaves `selectionOutcome`
        // `null` — this file's own sections stay focused on 0.9.4's own
        // selectedEncounter contract, unaffected by 0.9.20's addition.
        selectionOutcome: null,
        resolvedSelectionChoice: null,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        // 0.9.39 — `refreshSelectionOutcome()` now also calls
        // `this.refreshMaterialInspection()`. `materialSources` stays
        // undefined throughout this file's own tests, so that call always
        // leaves `materialInspection` at `null` without ever touching
        // `inspectWorldEncounterMaterial()` — see
        // tests/WorldEncounterMaterialInspectionUI.test.js for
        // material-inspection wiring itself. This file's own sections stay
        // focused on 0.9.4's own selectedEncounter contract, unaffected by
        // that addition.
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        materialInspectionRequestId: 0,
        ...overrides
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: select P2, then A1.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx();

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'P2' });
        assert(serialize(ctx.selectedEncounter) === serialize({ kind: 'PUBLICATION', objectId: 'P2' }), '1. FLAGSHIP — selecting P2 sets selectedEncounter to { kind: PUBLICATION, objectId: P2 }');

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'AVATAR', objectId: 'A1' });
        assert(serialize(ctx.selectedEncounter) === serialize({ kind: 'AVATAR', objectId: 'A1' }), '2. FLAGSHIP — selecting A1 afterwards sets selectedEncounter to { kind: AVATAR, objectId: A1 }');

        console.log('✓ Section A: FLAGSHIP — selecting P2 then A1 produces the expected selectedEncounter each time');
    }

    // ---------------------------------------------------------------
    // Section B — publication/avatar independence.
    // ---------------------------------------------------------------
    {
        const { ctx: pubCtx, emitted: pubEmitted } = markerCtx({ kind: 'PUBLICATION', objectId: 'pub-1' });
        WorldEncounterMarker.methods.emitSelect.call(pubCtx);
        assert(pubEmitted.length === 1 && pubEmitted[0].payload.kind === 'PUBLICATION', '3. selecting a publication marker emits kind PUBLICATION');
        assert(pubEmitted[0].payload.kind !== 'AVATAR', '4. selecting a publication marker never emits kind AVATAR');

        const { ctx: avatarCtx, emitted: avatarEmitted } = markerCtx({ kind: 'AVATAR', objectId: 'avatar-1' });
        WorldEncounterMarker.methods.emitSelect.call(avatarCtx);
        assert(avatarEmitted.length === 1 && avatarEmitted[0].payload.kind === 'AVATAR', '5. selecting an avatar marker emits kind AVATAR');
        assert(avatarEmitted[0].payload.kind !== 'PUBLICATION', '6. selecting an avatar marker never emits kind PUBLICATION');

        console.log('✓ Section B: selecting a publication marker can never select an avatar, and vice versa');
    }

    // ---------------------------------------------------------------
    // Section C — repeated selection: P1 -> P2 -> A1 leaves only A1.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx();
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'P1' });
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'P2' });
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'AVATAR', objectId: 'A1' });

        assert(serialize(ctx.selectedEncounter) === serialize({ kind: 'AVATAR', objectId: 'A1' }), '7. after P1 -> P2 -> A1, only A1 remains selected');

        console.log('✓ Section C: a sequence of selections leaves only the most recent one selected');
    }

    // ---------------------------------------------------------------
    // Section D — selecting the same marker repeatedly is deterministic.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx();
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'P1' });
        const first = serialize(ctx.selectedEncounter);
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'P1' });
        const second = serialize(ctx.selectedEncounter);
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'P1' });
        const third = serialize(ctx.selectedEncounter);

        assert(first === second && second === third, '8. selecting the same marker repeatedly always yields the identical selectedEncounter value');

        console.log('✓ Section D: repeated selection of the same marker is deterministic');
    }

    // ---------------------------------------------------------------
    // Section E — an empty World has no markers to select.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx({ view: { isEmpty: true, publicationCount: 0, avatarCount: 0, totalCount: 0, publications: [], avatars: [] } });
        const publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
        const avatarRows = WorldEncounterCanvas.computed.avatarRows.call(ctx);

        assert(publicationRows.length === 0 && avatarRows.length === 0, '9. an empty World has zero rows of either kind to render as selectable markers');
        assert(ctx.selectedEncounter === null, '10. an empty World never produces an accidental selection — selectedEncounter stays null');

        console.log('✓ Section E: an empty World renders no encounter markers, so nothing is ever accidentally selected');
    }

    // ---------------------------------------------------------------
    // Section F — a malformed marker identity degrades gracefully.
    // ---------------------------------------------------------------
    {
        const { ctx: emptyIdCtx, emitted: emptyIdEmitted } = markerCtx({ kind: 'PUBLICATION', objectId: '' });
        WorldEncounterMarker.methods.emitSelect.call(emptyIdCtx);
        assert(emptyIdEmitted.length === 1 && emptyIdEmitted[0].payload.objectId === '', '11. an empty objectId still emits select gracefully, never throws');

        const { ctx: undefinedIdCtx, emitted: undefinedIdEmitted } = markerCtx({ kind: 'AVATAR', objectId: undefined });
        WorldEncounterMarker.methods.emitSelect.call(undefinedIdCtx);
        assert(undefinedIdEmitted.length === 1 && undefinedIdEmitted[0].payload.kind === 'AVATAR', '12. an undefined objectId still emits select gracefully, never throws');

        const canvasCtxWithMalformed = canvasCtx();
        WorldEncounterCanvas.methods.selectEncounter.call(canvasCtxWithMalformed, { kind: 'PUBLICATION', objectId: undefined });
        assert(canvasCtxWithMalformed.selectedEncounter.objectId === undefined, '13. WorldEncounterCanvas accepts a malformed selection payload without throwing');

        console.log('✓ Section F: a malformed marker identity is accepted and stored gracefully — never thrown');
    }

    // ---------------------------------------------------------------
    // Section G — selection never mutates the 0.9.2 view.
    // ---------------------------------------------------------------
    {
        const view = Object.freeze({
            isEmpty: false,
            publicationCount: 1,
            avatarCount: 0,
            totalCount: 1,
            publications: Object.freeze([Object.freeze({ objectId: 'pub-1', title: 'First', x: 0, y: 0, z: 0 })]),
            avatars: Object.freeze([])
        });
        const ctx = canvasCtx({ view });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-1' });

        assert(ctx.view === view, '14. selecting a marker never replaces the view prop reference');
        assert(ctx.view.publications[0].title === 'First', '15. selecting a marker never mutates a row inside the view prop (frozen view would throw if it tried)');

        console.log('✓ Section G: selection is fully separate page-local state — the original 0.9.2 view is never mutated');
    }

    // ---------------------------------------------------------------
    // Section H — selection never reorders projected rows.
    // ---------------------------------------------------------------
    {
        const view = {
            isEmpty: false,
            publicationCount: 3,
            avatarCount: 0,
            totalCount: 3,
            publications: [
                { objectId: 'p3', title: 'Third', x: 0, y: 0, z: 0 },
                { objectId: 'p1', title: 'First', x: 0, y: 0, z: 0 },
                { objectId: 'p2', title: 'Second', x: 0, y: 0, z: 0 }
            ],
            avatars: []
        };
        const ctx = canvasCtx({ view });
        ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
        ctx.avatarRows = WorldEncounterCanvas.computed.avatarRows.call(ctx);
        const before = serialize(WorldEncounterCanvas.computed.projectedPublications.call(ctx).map((m) => m.objectId));

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'p2' });

        const after = serialize(WorldEncounterCanvas.computed.projectedPublications.call(ctx).map((m) => m.objectId));
        assert(before === after && before === serialize(['p3', 'p1', 'p2']), '16. selecting a marker never reorders projectedPublications');

        console.log('✓ Section H: selecting an encounter never alters projected row order');
    }

    // ---------------------------------------------------------------
    // Section I — WorldEncounterMarker still imports nothing.
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
        const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '17. WorldEncounterMarker.js still imports nothing after adding its select emit — no application/, no core/, not even vue');

        console.log('✓ Section I: WorldEncounterMarker.js remains a dumb component with zero imports');
    }

    // ---------------------------------------------------------------
    // Section J — no network/persistence anywhere in this milestone's own
    // code, and no distance/trust/rank vocabulary either.
    // ---------------------------------------------------------------
    {
        const forbiddenInCode = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'verified', 'confidence',
            'distance', 'nearest', 'nearby', 'radius', 'cluster', 'relevance', 'priorit',
            'fetch(', 'websocket', 'localstorage', 'sessionstorage', '.sort('
        ];
        for (const path of ['../ui/components/WorldEncounterCanvas.js', '../ui/components/WorldEncounterMarker.js']) {
            const source = await readFile(new URL(path, import.meta.url), 'utf8');
            const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
            for (const term of forbiddenInCode) {
                assert(!codeOnly.includes(term), `18. ${path}'s own code never carries "${term}"`);
            }
        }

        console.log('✓ Section J: no network/persistence/sort call, and no distance/trust/rank vocabulary, anywhere in this milestone\'s own code');
    }

    // ---------------------------------------------------------------
    // Section K — the selected encounter never acquires interpretive
    // fields beyond kind/objectId.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx();
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-1' });

        assert(serialize(Object.keys(ctx.selectedEncounter).sort()) === serialize(['kind', 'objectId']), '19. selectedEncounter carries only kind/objectId — no selected/verified/trusted/nearby/relevant field of any kind');

        console.log('✓ Section K: the selected encounter never acquires any interpretive field beyond kind/objectId');
    }

    // ---------------------------------------------------------------
    // Section L — a marker's own select emit carries exactly
    // { kind, objectId }, never the whole marker record (label/x/y).
    // ---------------------------------------------------------------
    {
        const { ctx, emitted } = markerCtx({ kind: 'PUBLICATION', objectId: 'pub-1', label: 'A Publication', x: 123, y: 456 });
        WorldEncounterMarker.methods.emitSelect.call(ctx);

        assert(emitted.length === 1 && emitted[0].name === 'select', '20. clicking a marker emits exactly one "select" event');
        assert(serialize(Object.keys(emitted[0].payload).sort()) === serialize(['kind', 'objectId']), '21. the select payload carries only kind/objectId — never label, x, y, or the whole marker record');
        assert(serialize(emitted[0].payload) === serialize({ kind: 'PUBLICATION', objectId: 'pub-1' }), '22. the select payload matches the marker\'s own kind/objectId exactly');

        console.log('✓ Section L: a marker\'s select emit carries only { kind, objectId } — never the entire domain object');
    }

    console.log('\nAll WorldEncounterSelectionUI tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterSelectionUI.test.js FAILED:', error);
    process.exitCode = 1;
});
