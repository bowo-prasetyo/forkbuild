import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldEncounterMaterialLoadStatus, WorldEncounterMaterialSource } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus, WorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerification.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';

// 0.9.39 — World Encounter Material Inspection Orchestration & UI
// Integration.
// See docs/Roadmap.md, "0.9.39 — World Encounter Material Inspection
// Orchestration & UI Integration."
//
// `ui/components/WorldEncounterCanvas.js` gained `materialSources`/
// `materialVerifier` props, `materialInspection`/`materialInspectionRequestId`
// page-local state, a `refreshMaterialInspection()` method (called from the
// tail of `refreshSelectionOutcome()` and `chooseSelectionOrigin()`), and a
// fourth `application/` import — `application/WorldEncounterMaterialInspection.js`'s
// own `inspectWorldEncounterMaterial()`. This file exercises that wiring
// directly, the same `Component.methods.x.call(ctx)` discipline every other
// UI test file in this chain already uses. `application/
// WorldEncounterMaterialInspection.js`'s own orchestration logic (routing,
// degrade paths, no-caching) is covered separately, in
// tests/WorldEncounterMaterialInspection.test.js; this file stays focused on
// how the canvas itself decides WHEN to call it and what it does with the
// result.
//
// Section A: FLAGSHIP — an automatically-resolved selection loads and
//            verifies material end to end.
// Section B: an AMBIGUOUS selection never loads material until the Wanderer
//            explicitly chooses an origin.
// Section C: no materialSources supplied — material inspection never
//            activates, even for an otherwise-resolved selection.
// Section D: a selection going stale clears materialInspection back to
//            null, synchronously.
// Section E: a request counter discards a stale, late-arriving response
//            once a newer selection has superseded it.
// Section F: unmounting invalidates any still-pending request.
// Section G: the result shape carries only `{ selection, lead, loading,
//            verification }` — no invented isVerified/isTrusted field.
// Section H: architectural regression — no resolvedLead ever supplied from
//            this component, default props, import boundary, no
//            trusted/authentic/safe vocabulary.
//
// 0.9.40 note: `WorldEncounterCanvas.js` gained `worldDiscoveryLeadRegistry`/
// `decentralizedLeadAssociations` props and now DOES forward a `resolvedLead`
// to `inspectWorldEncounterMaterial()` when one resolves — Section H's own
// assertion 26 is updated accordingly. Every `ctx` in this file leaves
// `worldDiscoveryLeadRegistry` `null`, so `resolvedLead` stays `null`
// throughout this file's own sections, exactly as before 0.9.40; that
// wiring is covered separately, in
// tests/DecentralizedWorldEncounterLeadSelectionUI.test.js.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
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

class FakeSource extends WorldEncounterMaterialSource {
    constructor(material) {
        super();
        this.material = material;
        this.calls = [];
    }

    async load(resolvedSelection) {
        this.calls.push(resolvedSelection);
        return typeof this.material === 'function' ? this.material(resolvedSelection) : this.material;
    }
}

class ControlledSource extends WorldEncounterMaterialSource {
    constructor() {
        super();
        this.pending = new Map();
        this.calls = [];
    }

    load(resolvedSelection) {
        this.calls.push(resolvedSelection);
        return new Promise((resolve) => {
            this.pending.set(resolvedSelection.objectId, resolve);
        });
    }

    resolve(objectId, material) {
        const resolveFn = this.pending.get(objectId);
        resolveFn(material);
    }
}

class FakeVerifier extends WorldEncounterMaterialVerifier {
    constructor(outcome) {
        super();
        this.outcome = outcome;
        this.calls = [];
    }

    async verifyIdentity(resolvedSelection, material, resolvedLead) {
        this.calls.push({ resolvedSelection, material, resolvedLead });
        return this.outcome;
    }
}

function canvasCtx(overrides = {}) {
    const ctx = {
        view: WorldEncounterCanvas.props.view.default(),
        registry: null,
        wandererPosition: { x: 0, y: 0, z: 0 },
        selectedEncounter: null,
        selectionOutcome: null,
        resolvedSelectionChoice: null,
        materialSources: null,
        materialVerifier: null,
        materialInspection: null,
        materialInspectionRequestId: 0,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        chooseSelectionOrigin: WorldEncounterCanvas.methods.chooseSelectionOrigin,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        // 0.9.40 — `selectEncounter()` now also calls
        // `this.refreshDecentralizedLeadOutcome()`. `worldDiscoveryLeadRegistry`
        // stays `null` throughout this file's own tests, so that call always
        // leaves `decentralizedLeadOutcome` (and therefore `resolvedLead`)
        // at `null` without ever touching
        // `describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()`
        // — see tests/DecentralizedWorldEncounterLeadSelectionUI.test.js for
        // that wiring itself. This file's own sections stay focused on
        // 0.9.39's own material-inspection contract, unaffected by that
        // addition.
        worldDiscoveryLeadRegistry: null,
        decentralizedLeadAssociations: [],
        decentralizedLeadOutcome: null,
        resolvedLeadChoice: null,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        chooseDecentralizedLead: WorldEncounterCanvas.methods.chooseDecentralizedLead,
        ...overrides
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    // Mirrors Vue's own lazy-getter computed semantics: every read
    // re-evaluates against ctx's own CURRENT state, exactly the way a real
    // mounted component's `this.resolvedEncounterSelection` would.
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() {
            return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx);
        }
    });
    // 0.9.40 — same lazy-getter treatment for `resolvedLead`.
    Object.defineProperty(ctx, 'resolvedLead', {
        get() {
            return WorldEncounterCanvas.computed.resolvedLead.call(ctx);
        }
    });
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: an automatically-resolved selection loads and
    // verifies material end to end.
    // ---------------------------------------------------------------
    {
        const material = Object.freeze({ id: 'pub-1', title: 'A Local Publication' });
        const localSource = new FakeSource(material);
        const verifier = new FakeVerifier(true);
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const ctx = canvasCtx({ registry, materialSources: { local: localSource }, materialVerifier: verifier });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();

        assert(ctx.materialInspection !== null, '1. FLAGSHIP — an automatically-resolved selection triggers material inspection without any explicit "load" action');
        assert(ctx.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '2. FLAGSHIP — the registered local source supplies the material');
        assert(ctx.materialInspection.loading.material === material, '3. FLAGSHIP — the loaded material is forwarded by reference, all the way to the canvas');
        assert(ctx.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '4. FLAGSHIP — the injected verifier confirms identity correspondence');
        assert(localSource.calls.length === 1 && localSource.calls[0].objectId === 'pub-1', '5. FLAGSHIP — the local source is asked exactly once, for the resolved selection');

        console.log('✓ Section A: FLAGSHIP — an automatically-resolved selection loads and verifies material end to end');
    }

    // ---------------------------------------------------------------
    // Section B — an AMBIGUOUS selection never loads material until the
    // Wanderer explicitly chooses an origin.
    // ---------------------------------------------------------------
    {
        const publication = { id: 'pub-shared' };
        const placement = { id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } };
        const localSource = new FakeSource({ id: 'pub-shared' });
        const peerSource = new FakeSource({ id: 'pub-shared' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({ publications: [publication], placements: [placement] }),
            peerSourceOf('peer:did:key:zPeerA', { publications: [publication], placements: [placement] })
        ]);
        const ctx = canvasCtx({
            registry,
            materialSources: { local: localSource, peer: peerSource },
            materialVerifier: new FakeVerifier(true)
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-shared' });
        await flush();

        assert(ctx.materialInspection === null, '6. an AMBIGUOUS selection never triggers material loading — no source is guessed on the Wanderer\'s behalf');
        assert(localSource.calls.length === 0 && peerSource.calls.length === 0, '7. neither candidate source is ever called while the selection stays ambiguous');

        const chosen = ctx.selectionOutcome.candidates.find((c) => c.origin === 'local');
        ctx.chooseSelectionOrigin(chosen);
        await flush();

        assert(ctx.materialInspection !== null, '8. once the Wanderer explicitly chooses an origin, material inspection proceeds');
        assert(localSource.calls.length === 1 && peerSource.calls.length === 0, '9. only the explicitly chosen origin\'s own source is ever called');
        assert(ctx.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '10. the explicitly-resolved selection loads successfully');

        console.log('✓ Section B: material is never loaded for an ambiguous selection until the Wanderer explicitly chooses an origin');
    }

    // ---------------------------------------------------------------
    // Section C — no materialSources supplied: material inspection never
    // activates, even for an otherwise-resolved selection.
    // ---------------------------------------------------------------
    {
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const ctx = canvasCtx({ registry });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();

        assert(ctx.selectionOutcome.status === 'RESOLVED', '11. the selection itself still resolves automatically, exactly as 0.9.20 already established');
        assert(ctx.materialInspection === null, '12. with no materialSources supplied, materialInspection stays null — inspectWorldEncounterMaterial() is never even called');

        console.log('✓ Section C: with no materialSources supplied, material inspection never activates');
    }

    // ---------------------------------------------------------------
    // Section D — a selection going stale clears materialInspection back to
    // null, synchronously.
    // ---------------------------------------------------------------
    {
        const localSource = new FakeSource({ id: 'pub-1' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const ctx = canvasCtx({ registry, materialSources: { local: localSource }, materialVerifier: new FakeVerifier(true) });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();
        assert(ctx.materialInspection !== null, '13. material inspection is present before the source disappears');

        registry.removeSource(ctx.selectionOutcome.resolvedSelection.origin);
        ctx.refreshSelectionOutcome();

        assert(ctx.selectionOutcome.status === 'UNAVAILABLE', '14. the outcome recomputes to UNAVAILABLE once the source disappears');
        assert(ctx.materialInspection === null, '15. materialInspection clears back to null synchronously — no stale material is ever left rendered');

        console.log('✓ Section D: a selection going stale clears materialInspection synchronously, without waiting on any async response');
    }

    // ---------------------------------------------------------------
    // Section E — a request counter discards a stale, late-arriving
    // response once a newer selection has superseded it.
    // ---------------------------------------------------------------
    {
        const source = new ControlledSource();
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-a' }, { id: 'pub-b' }],
                placements: [
                    { id: 'placement-a', publicationId: 'pub-a', position: { x: 0, y: 0, z: 0 } },
                    { id: 'placement-b', publicationId: 'pub-b', position: { x: 1, y: 0, z: 1 } }
                ]
            })
        ]);
        const ctx = canvasCtx({ registry, materialSources: { local: source }, materialVerifier: new FakeVerifier(true) });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-a' });
        await flush();
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-b' });
        await flush();

        assert(source.calls.length === 2, '16. both selections triggered their own load request');
        assert(ctx.materialInspection === null, '17. neither request has resolved yet — materialInspection is still null');

        // A's own (now superseded) request finally resolves late.
        source.resolve('pub-a', { id: 'pub-a', title: 'Stale — should never be shown' });
        await flush();
        assert(ctx.materialInspection === null, '18. A\'s stale, late-arriving response is discarded — it is no longer the current request');

        // B's own request resolves.
        source.resolve('pub-b', { id: 'pub-b', title: 'Current' });
        await flush();
        assert(ctx.materialInspection !== null, '19. B\'s own response, once it resolves, is written normally');
        assert(ctx.materialInspection.loading.material.id === 'pub-b', '20. materialInspection reflects the CURRENT selection (B), never the superseded one (A)');

        console.log('✓ Section E: a superseded request\'s late response is discarded; only the current request\'s response is ever written');
    }

    // ---------------------------------------------------------------
    // Section F — unmounting invalidates any still-pending request.
    // ---------------------------------------------------------------
    {
        const source = new ControlledSource();
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const ctx = canvasCtx({ registry, materialSources: { local: source }, materialVerifier: new FakeVerifier(true), unsubscribeWorldRegistry: null });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();
        assert(ctx.materialInspection === null, '21. the request is still pending, unresolved');

        WorldEncounterCanvas.beforeUnmount.call(ctx);
        source.resolve('pub-1', { id: 'pub-1' });
        await flush();

        assert(ctx.materialInspection === null, '22. a response arriving after beforeUnmount() is never written to materialInspection');

        console.log('✓ Section F: unmounting invalidates any still-pending material-inspection request');
    }

    // ---------------------------------------------------------------
    // Section G — the result shape carries only `{ selection, lead,
    // loading, verification }` — no invented isVerified/isTrusted field.
    // ---------------------------------------------------------------
    {
        const material = Object.freeze({ id: 'pub-1' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const ctx = canvasCtx({ registry, materialSources: { local: new FakeSource(material) }, materialVerifier: new FakeVerifier(true) });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();

        assert(serialize(Object.keys(ctx.materialInspection).sort()) === serialize(['lead', 'loading', 'selection', 'verification']), '23. materialInspection carries exactly selection/lead/loading/verification — nothing else');
        assert(!('isVerified' in ctx.materialInspection) && !('isTrusted' in ctx.materialInspection) && !('isAuthentic' in ctx.materialInspection), '24. no isVerified/isTrusted/isAuthentic field is ever invented at this layer');

        console.log('✓ Section G: the material-inspection result carries exactly the four documented fields, no invented trust vocabulary');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression.
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes('inspectWorldEncounterMaterial({'), '25. WorldEncounterCanvas.js calls inspectWorldEncounterMaterial() directly');
        // 26. As of 0.9.40, this component DOES supply a `resolvedLead` to
        // `inspectWorldEncounterMaterial()` — see
        // tests/DecentralizedWorldEncounterLeadSelectionUI.test.js for full
        // coverage of that wiring. This file's own assertion now checks
        // only that the call still forwards `this.resolvedLead` verbatim
        // (never a re-derived or hardcoded value), preserving this
        // section's original intent of pinning down exactly what this
        // component passes through.
        assert(/inspectWorldEncounterMaterial\(\{[^}]*resolvedLead:\s*this\.resolvedLead/s.test(codeOnly), '26. this component forwards exactly this.resolvedLead to inspectWorldEncounterMaterial(), never a re-derived value');
        assert(codeOnly.includes('materialSources: {') && codeOnly.includes('type: Object') , '27. materialSources is declared as an Object-typed prop');
        assert(codeOnly.includes('materialVerifier: {'), '28. materialVerifier is declared as its own separate prop');

        const forbiddenTerms = ['trusted', 'authentic', 'issafe', 'is-safe', 'reputation', 'ranking', 'preferred'];
        const lowerCodeOnly = codeOnly.toLowerCase();
        for (const term of forbiddenTerms) {
            assert(!lowerCodeOnly.includes(term), `29. WorldEncounterCanvas.js never uses "${term}" anywhere in its own code`);
        }

        console.log('✓ Section H: architectural regression — no resolvedLead ever supplied, no trusted/authentic vocabulary, props declared correctly');
    }

    console.log('\nAll WorldEncounterMaterialInspectionUI tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterMaterialInspectionUI.test.js FAILED:', error);
    process.exitCode = 1;
});
