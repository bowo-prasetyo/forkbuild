import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/WorldEncounterSelectionOutcome.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';

// 0.9.20 — World Encounter Selection Resolution.
//
// `ui/components/WorldEncounterCanvas.js` gained `selectionOutcome`/
// `resolvedSelectionChoice` page-local state, a `resolvedEncounterSelection`
// computed, and `refreshSelectionOutcome()`/`chooseSelectionOrigin()`
// methods — see that file's own header, "0.9.20 — World Encounter
// Selection Resolution." This file exercises that wiring directly, the
// same `Component.methods.x.call(ctx)`/`Component.computed.y.call(ctx)`
// discipline every other UI test file in this chain already uses.
//
// Section A: FLAGSHIP — an unambiguous selection resolves automatically,
//            no explicit choice required.
// Section B: an ambiguous selection stays unresolved until the Wanderer
//            explicitly chooses one of its own candidates.
// Section C: a new selection resets any prior explicit choice — no
//            leakage across selections.
// Section D: a stale (zero-candidate) selection classifies UNAVAILABLE
//            and never resolves.
// Section E: no `registry` supplied — resolution never activates; the
//            pre-0.9.20 `view`-prop-only contract is unaffected.
// Section F: a chosen origin that has since disappeared from the current
//            candidate list is never trusted — resolvedEncounterSelection
//            falls back to null, never a stale identity.
// Section G: chooseSelectionOrigin() never picks on its own — it only
//            ever stores exactly the candidate object handed to it.
// Section H: architectural regression — no score/rank/trust/"preferred"
//            vocabulary, and no `.find()`/array-position default, in the
//            0.9.20 additions to WorldEncounterCanvas.js.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function peerSourceOf(origin, { publications = [], placements = [] } = {}) {
    return describeWorldDiscoverySource({ origin, publications, placements, avatarProfiles: [], avatarPresences: [] });
}

function registryOf(sources) {
    const registry = new WorldDiscoverySourceRegistry();
    for (const source of sources) {
        registry.setSource(source);
    }
    return registry;
}

function canvasCtx(overrides = {}) {
    const ctx = {
        view: WorldEncounterCanvas.props.view.default(),
        registry: null,
        wandererPosition: { x: 0, y: 0, z: 0 },
        selectedEncounter: null,
        selectionOutcome: null,
        resolvedSelectionChoice: null,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        chooseSelectionOrigin: WorldEncounterCanvas.methods.chooseSelectionOrigin,
        // 0.9.39 — `refreshSelectionOutcome()`/`chooseSelectionOrigin()`
        // now also call `this.refreshMaterialInspection()`. `materialSources`
        // stays undefined throughout this file's own tests, so that call
        // always leaves `materialInspection` at `null` without ever
        // touching `inspectWorldEncounterMaterial()` — see this file's own
        // 0.9.39 counterpart, tests/WorldEncounterMaterialInspectionUI.test.js,
        // for material-inspection wiring itself. This file's own sections
        // stay focused on 0.9.20's own selection-resolution contract,
        // unaffected by that addition.
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        materialInspectionRequestId: 0,
        // 0.9.40 — `selectEncounter()` now also calls
        // `this.refreshDecentralizedLeadOutcome()`. `worldDiscoveryLeadRegistry`
        // stays `null` throughout this file's own tests, so that call
        // always leaves `decentralizedLeadOutcome` at `null` without ever
        // touching `describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()`
        // — see this file's own 0.9.40 counterpart,
        // tests/DecentralizedWorldEncounterLeadSelectionUI.test.js, for
        // that wiring itself. This file's own sections stay focused on
        // 0.9.20's own selection-resolution contract, unaffected by that
        // addition.
        worldDiscoveryLeadRegistry: null,
        decentralizedLeadAssociations: [],
        decentralizedLeadOutcome: null,
        resolvedLeadChoice: null,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        // 0.9.100 — `selectEncounter()` now also calls
        // `this.refreshDistributionLifecycle()`. `distributionLifecycleStore`
        // stays `null` throughout this file's own tests, so that call
        // always leaves `distributionLifecycle` at `null` without ever
        // touching a `PublicationDistributionLifecycleMemoryStore` — see
        // tests/WorldViewPublicationDistributionIntegration.test.js for that
        // wiring itself. This file's own sections stay focused on 0.9.20's
        // own selection-resolution contract, unaffected by that addition.
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        ...overrides
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: an unambiguous selection resolves
    // automatically.
    // ---------------------------------------------------------------
    {
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const ctx = canvasCtx({ registry });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-1' });

        assert(ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '1. FLAGSHIP — a single-source selection classifies RESOLVED');
        const resolved = WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx);
        assert(serialize(resolved) === serialize({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' }), '2. FLAGSHIP — resolvedEncounterSelection is set automatically, with no explicit choice ever made');

        console.log('✓ Section A: FLAGSHIP — an unambiguous selection resolves automatically, no interaction required');
    }

    // ---------------------------------------------------------------
    // Section B — an ambiguous selection stays unresolved until chosen.
    // ---------------------------------------------------------------
    {
        const publication = { id: 'pub-shared', title: 'Shared' };
        const placement = { id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } };
        const registry = registryOf([
            describeLocalWorldDiscoverySource({ publications: [publication], placements: [placement] }),
            peerSourceOf('peer:did:key:zPeerA', { publications: [publication], placements: [placement] }),
            peerSourceOf('peer:did:key:zPeerB', { publications: [publication], placements: [placement] })
        ]);
        const ctx = canvasCtx({ registry });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-shared' });

        assert(ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, '3. a three-source selection classifies AMBIGUOUS');
        assert(ctx.selectionOutcome.candidates.length === 3, '4. every candidate is surfaced, never trimmed');
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx) === null, '5. resolvedEncounterSelection stays null until the Wanderer explicitly chooses');

        const chosen = ctx.selectionOutcome.candidates[1];
        WorldEncounterCanvas.methods.chooseSelectionOrigin.call(ctx, chosen);
        const resolvedAfterChoice = WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx);
        assert(serialize(resolvedAfterChoice) === serialize(chosen), '6. after an explicit choice, resolvedEncounterSelection returns exactly the chosen candidate, verbatim');

        console.log('✓ Section B: an ambiguous selection stays unresolved until the Wanderer explicitly chooses one of its own candidates');
    }

    // ---------------------------------------------------------------
    // Section C — a new selection resets any prior explicit choice.
    // ---------------------------------------------------------------
    {
        const publicationA = { id: 'pub-a' };
        const placementA = { id: 'placement-a', publicationId: 'pub-a', position: { x: 0, y: 0, z: 0 } };
        const publicationB = { id: 'pub-b' };
        const placementB = { id: 'placement-b', publicationId: 'pub-b', position: { x: 1, y: 0, z: 1 } };
        const registry = registryOf([
            describeLocalWorldDiscoverySource({ publications: [publicationA, publicationB], placements: [placementA, placementB] }),
            peerSourceOf('peer:did:key:zPeer', { publications: [publicationA, publicationB], placements: [placementA, placementB] })
        ]);
        const ctx = canvasCtx({ registry });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-a' });
        WorldEncounterCanvas.methods.chooseSelectionOrigin.call(ctx, ctx.selectionOutcome.candidates[0]);
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx) !== null, '7. a choice is recorded for the first selection');

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-b' });
        assert(ctx.resolvedSelectionChoice === null, '8. selecting a new encounter clears any prior explicit choice');
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx) === null, '9. the new (also ambiguous) selection starts unresolved — no leakage from the previous choice');

        console.log('✓ Section C: a new selection never inherits a prior explicit choice');
    }

    // ---------------------------------------------------------------
    // Section D — a stale selection classifies UNAVAILABLE and never
    // resolves.
    // ---------------------------------------------------------------
    {
        const registry = registryOf([
            describeLocalWorldDiscoverySource({ publications: [{ id: 'pub-1' }], placements: [] })
        ]);
        const ctx = canvasCtx({ registry });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-does-not-exist' });

        assert(ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '10. a stale selection classifies UNAVAILABLE');
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx) === null, '11. an UNAVAILABLE outcome never resolves to anything');

        console.log('✓ Section D: a stale, zero-candidate selection classifies UNAVAILABLE and never resolves');
    }

    // ---------------------------------------------------------------
    // Section E — no registry supplied: resolution never activates.
    // ---------------------------------------------------------------
    {
        const view = {
            isEmpty: false, publicationCount: 1, avatarCount: 0, totalCount: 1,
            publications: [{ objectId: 'pub-1', title: 'First', x: 0, y: 0, z: 0 }],
            avatars: []
        };
        const ctx = canvasCtx({ view, registry: null });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-1' });

        assert(ctx.selectionOutcome === null, '12. with no registry, selectionOutcome stays null — resolution never activates without per-source data');
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx) === null, '13. with no registry, resolvedEncounterSelection stays null — this milestone never fabricates an origin');
        assert(ctx.selectedEncounter !== null, '14. selectedEncounter itself is completely unaffected — the pre-0.9.20 view-prop-only contract still works exactly as before');

        console.log('✓ Section E: with no registry supplied, resolution never activates — the pre-0.9.20 contract is unaffected');
    }

    // ---------------------------------------------------------------
    // Section F — a chosen origin that has since disappeared is never
    // trusted.
    // ---------------------------------------------------------------
    {
        const publication = { id: 'pub-shared' };
        const placement = { id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } };
        const localSource = describeLocalWorldDiscoverySource({ publications: [publication], placements: [placement] });
        const peerSource = peerSourceOf('peer:did:key:zGone', { publications: [publication], placements: [placement] });
        const registry = registryOf([localSource, peerSource]);
        const ctx = canvasCtx({ registry });

        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-shared' });
        const peerCandidate = ctx.selectionOutcome.candidates.find((c) => c.origin === 'peer:did:key:zGone');
        WorldEncounterCanvas.methods.chooseSelectionOrigin.call(ctx, peerCandidate);
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx).origin === 'peer:did:key:zGone', '15. the explicit choice resolves while its own origin is still offered');

        // The peer disappears; a fresh refresh (mirroring the registry's
        // own change-notification listener) recomputes selectionOutcome
        // down to a single remaining candidate.
        registry.removeSource('peer:did:key:zGone');
        WorldEncounterCanvas.methods.refreshSelectionOutcome.call(ctx);

        assert(ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '16. after the peer disappears, the outcome recomputes down to RESOLVED for the one remaining source');
        assert(ctx.resolvedSelectionChoice.origin === 'peer:did:key:zGone', '17. the stale explicit choice itself is never cleared — it simply stops being trusted (see 0.9.18\'s own "never clear the selection" posture, applied here to the choice)');
        assert(WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx).origin === 'local', '18. resolvedEncounterSelection falls through to the outcome\'s own automatic RESOLVED answer, never a vanished choice');

        console.log('✓ Section F: a stale explicit choice is re-checked on every read, never trusted blindly once its own origin disappears');
    }

    // ---------------------------------------------------------------
    // Section G — chooseSelectionOrigin() only ever stores exactly the
    // candidate handed to it.
    // ---------------------------------------------------------------
    {
        const ctx = canvasCtx();
        const candidate = Object.freeze({ kind: 'AVATAR', objectId: 'avatar-9', origin: 'peer:did:key:zSomeone' });
        WorldEncounterCanvas.methods.chooseSelectionOrigin.call(ctx, candidate);
        assert(ctx.resolvedSelectionChoice === candidate, '19. chooseSelectionOrigin() stores the exact candidate reference, never a copy or a re-derived value');

        console.log('✓ Section G: chooseSelectionOrigin() stores exactly the candidate object it was handed');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression on the 0.9.20 additions.
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        const forbiddenTerms = [
            'trusted', 'trust(', 'reputation', 'verified', 'verify(', 'authority', 'priority',
            'weight', 'confidence', 'ranking', 'scoring', 'nearest', 'proximity', 'winner',
            'preferred', 'dedup', 'reconcile', 'compare', 'localstorage', 'sessionstorage', 'fetch('
        ];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `20. WorldEncounterCanvas.js never uses "${term}" anywhere in its own code`);
        }
        assert(!codeOnly.includes('.find('), '21. WorldEncounterCanvas.js never calls .find() to guess among selection candidates');
        assert(!/candidates\[0\]/.test(codeOnly), '22. WorldEncounterCanvas.js never reads candidates[0] as an implicit default among several');

        console.log('✓ Section H: no score/rank/trust/"preferred" vocabulary, and no .find()/array-position default, in the 0.9.20 additions');
    }

    console.log('\nAll WorldEncounterSelectionResolutionUI tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterSelectionResolutionUI.test.js FAILED:', error);
    process.exitCode = 1;
});
