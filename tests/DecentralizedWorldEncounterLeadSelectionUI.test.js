import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldEncounterMaterialLoadStatus, WorldEncounterMaterialSource } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus, WorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerification.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';

// 0.9.40 — Decentralized Lead Resolution Integration.
// See docs/Roadmap.md, "0.9.40 — Decentralized Lead Resolution
// Integration."
//
// `ui/components/WorldEncounterCanvas.js` gained `worldDiscoveryLeadRegistry`/
// `decentralizedLeadAssociations` props, `decentralizedLeadOutcome`/
// `resolvedLeadChoice` page-local state, a `resolvedLead` computed, and
// `refreshDecentralizedLeadOutcome()`/`chooseDecentralizedLead()` methods —
// see that file's own header, "0.9.40 — Decentralized Lead Resolution
// Integration." This file exercises that wiring directly, the same
// `Component.methods.x.call(ctx)`/`Component.computed.y.call(ctx)`
// discipline every other UI test file in this chain already uses.
// `application/DecentralizedWorldEncounterLeadSelection.js`'s own seam logic
// is covered separately, in
// tests/DecentralizedWorldEncounterLeadSelection.test.js; this file stays
// focused on how the canvas itself decides WHEN to resolve a lead and what
// it does with the result.
//
// Section A: FLAGSHIP — a RESOLVED lead is forwarded to material inspection
//            automatically, alongside a resolved local selection.
// Section B: an AMBIGUOUS lead outcome never forwards a resolvedLead until
//            the Wanderer explicitly chooses one of its own candidates.
// Section C: no worldDiscoveryLeadRegistry supplied — decentralizedLeadOutcome
//            never activates, and material inspection still proceeds via
//            resolvedEncounterSelection alone.
// Section D: a fresh selection resets any prior explicit lead choice.
// Section E: an injected source's own load() is called exactly once per
//            selection, even though both selectionOutcome and
//            decentralizedLeadOutcome refresh together.
// Section F: a chosen lead that has since disappeared from the registry is
//            never trusted — resolvedLead falls back to null.
// Section G: architectural regression — no second matching algorithm, both
//            new props declared, no rank/trust/preferred vocabulary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function registryOf(sources) {
    const registry = new WorldDiscoverySourceRegistry();
    for (const source of sources) {
        registry.setSource(source);
    }
    return registry;
}

function leadOf(overrides = {}) {
    return describeDecentralizedWorldDiscoveryLead({
        origin: 'dweb:some-search-service',
        discoveryTag: 'forkbuild_random_unique',
        uri: 'ar://ABC123',
        storage: 'ar',
        ...overrides
    });
}

function associationFor(lead, material) {
    return { origin: lead.origin, discoveryTag: lead.discoveryTag, uri: lead.uri, ...material };
}

function leadRegistryOf(leads) {
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    for (const lead of leads) {
        registry.setLead(lead);
    }
    return registry;
}

class FakeSource extends WorldEncounterMaterialSource {
    constructor(material) {
        super();
        this.material = material;
        this.calls = [];
    }

    async load(resolvedSelection, resolvedLead) {
        this.calls.push({ resolvedSelection, resolvedLead });
        return typeof this.material === 'function' ? this.material(resolvedSelection, resolvedLead) : this.material;
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
        worldDiscoveryLeadRegistry: null,
        decentralizedLeadAssociations: [],
        decentralizedLeadOutcome: null,
        resolvedLeadChoice: null,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        chooseSelectionOrigin: WorldEncounterCanvas.methods.chooseSelectionOrigin,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        chooseDecentralizedLead: WorldEncounterCanvas.methods.chooseDecentralizedLead,
        // 0.9.100 — `selectEncounter()` now also calls
        // `this.refreshDistributionLifecycle()`. `distributionLifecycleStore`
        // stays `null` throughout this file's own tests, so that call
        // always leaves `distributionLifecycle` at `null` without ever
        // touching a `PublicationDistributionLifecycleMemoryStore` — see
        // tests/WorldViewPublicationDistributionIntegration.test.js for that
        // wiring itself. This file's own sections stay focused on 0.9.40's
        // own decentralized-lead-selection contract, unaffected by that
        // addition.
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        // 0.9.101 — refreshDistributionLifecycle() now calls the shared
        // stopSubscription() helper instead of repeating its own
        // unsubscribe-and-clear idiom inline; this fake context needs it
        // too, the same way it already needs every other collaborator
        // method above.
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        ...overrides
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    // Mirrors Vue's own lazy-getter computed semantics: every read
    // re-evaluates against ctx's own CURRENT state.
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() {
            return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx);
        }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() {
            return WorldEncounterCanvas.computed.resolvedLead.call(ctx);
        }
    });
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a RESOLVED lead is forwarded to material
    // inspection automatically, alongside a resolved local selection.
    // ---------------------------------------------------------------
    {
        const material = Object.freeze({ id: 'pub-1', title: 'A Local Publication' });
        const decentralizedSource = new FakeSource(material);
        const verifier = new FakeVerifier(true);
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const lead = leadOf();
        const publicationMaterial = { kind: 'PUBLICATION', objectId: 'pub-1' };
        const leadRegistry = leadRegistryOf([lead]);
        const ctx = canvasCtx({
            registry,
            materialSources: { decentralized: decentralizedSource },
            materialVerifier: verifier,
            worldDiscoveryLeadRegistry: leadRegistry,
            decentralizedLeadAssociations: [associationFor(lead, publicationMaterial)]
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();

        assert(ctx.decentralizedLeadOutcome !== null && ctx.decentralizedLeadOutcome.status === 'RESOLVED', '1. FLAGSHIP — a single well-evidenced lead resolves automatically, no interaction required');
        assert(ctx.resolvedLead === lead, '2. FLAGSHIP — resolvedLead is the exact lead the registry holds');
        assert(ctx.materialInspection !== null, '3. FLAGSHIP — material inspection proceeds once both selection and lead resolve');
        assert(ctx.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. FLAGSHIP — the decentralized source supplies the material');
        assert(ctx.materialInspection.lead === lead, '5. FLAGSHIP — the resolved lead is forwarded through to the inspection result');
        assert(decentralizedSource.calls.length === 1 && decentralizedSource.calls[0].resolvedLead === lead, '6. FLAGSHIP — the decentralized source is asked exactly once, with the resolved lead');
        assert(ctx.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '7. FLAGSHIP — the injected verifier confirms identity correspondence');

        console.log('✓ Section A: FLAGSHIP — a RESOLVED lead is forwarded to material inspection automatically');
    }

    // ---------------------------------------------------------------
    // Section B — an AMBIGUOUS lead outcome never forwards a resolvedLead
    // until the Wanderer explicitly chooses one of its own candidates.
    // ---------------------------------------------------------------
    {
        const decentralizedSource = new FakeSource({ id: 'pub-shared' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-shared' }],
                placements: [{ id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const publicationMaterial = { kind: 'PUBLICATION', objectId: 'pub-shared' };
        const leadA = leadOf();
        const leadB = leadOf({ origin: 'dweb:another-service', uri: 'ar://DEF456' });
        const leadRegistry = leadRegistryOf([leadA, leadB]);
        const ctx = canvasCtx({
            registry,
            materialSources: { decentralized: decentralizedSource },
            materialVerifier: new FakeVerifier(true),
            worldDiscoveryLeadRegistry: leadRegistry,
            decentralizedLeadAssociations: [associationFor(leadA, publicationMaterial), associationFor(leadB, publicationMaterial)]
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-shared' });
        await flush();

        assert(ctx.decentralizedLeadOutcome.status === 'AMBIGUOUS', '8. two independently-evidenced leads classify as AMBIGUOUS');
        assert(ctx.resolvedLead === null, '9. resolvedLead stays null while the lead outcome is ambiguous — no lead is guessed on the Wanderer\'s behalf');
        assert(decentralizedSource.calls.length === 0, '10. the decentralized source is never called while no lead has been explicitly chosen — inspectWorldEncounterMaterial() still runs (resolvedSelection alone), but resolvedLead is null so it never routes to the decentralized source');

        const chosen = ctx.decentralizedLeadOutcome.candidates.find((c) => c.uri === leadB.uri);
        ctx.chooseDecentralizedLead(chosen);
        await flush();

        assert(ctx.resolvedLead === chosen, '11. once the Wanderer explicitly chooses a lead, resolvedLead reflects that exact choice');
        assert(decentralizedSource.calls.length === 1 && decentralizedSource.calls[0].resolvedLead === chosen, '12. only after the explicit choice is the decentralized source ever called, with the chosen lead');

        console.log('✓ Section B: an AMBIGUOUS lead outcome never forwards a resolvedLead until the Wanderer explicitly chooses one');
    }

    // ---------------------------------------------------------------
    // Section C — no worldDiscoveryLeadRegistry supplied:
    // decentralizedLeadOutcome never activates, and material inspection
    // still proceeds via resolvedEncounterSelection alone.
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

        assert(ctx.decentralizedLeadOutcome === null, '13. with no worldDiscoveryLeadRegistry supplied, decentralizedLeadOutcome stays null — describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry() is never even called');
        assert(ctx.resolvedLead === null, '14. resolvedLead stays null too');
        assert(ctx.materialInspection !== null && ctx.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '15. material inspection still proceeds normally through the local source, unaffected — every pre-0.9.40 caller of this component keeps working exactly as before');
        assert(ctx.materialInspection.lead === null, '16. the inspection result\'s own lead field stays null, exactly as 0.9.39 already established for every caller with no lead');

        console.log('✓ Section C: with no worldDiscoveryLeadRegistry supplied, decentralized lead resolution never activates and existing behavior is unaffected');
    }

    // ---------------------------------------------------------------
    // Section D — a fresh selection resets any prior explicit lead choice.
    // ---------------------------------------------------------------
    {
        const decentralizedSource = new FakeSource({ id: 'shared-material' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-a' }, { id: 'pub-b' }],
                placements: [
                    { id: 'placement-a', publicationId: 'pub-a', position: { x: 0, y: 0, z: 0 } },
                    { id: 'placement-b', publicationId: 'pub-b', position: { x: 1, y: 0, z: 1 } }
                ]
            })
        ]);
        const materialA = { kind: 'PUBLICATION', objectId: 'pub-a' };
        const materialB = { kind: 'PUBLICATION', objectId: 'pub-b' };
        const leadA1 = leadOf({ uri: 'ar://A1' });
        const leadA2 = leadOf({ origin: 'dweb:another-service', uri: 'ar://A2' });
        const leadB1 = leadOf({ uri: 'ar://B1' });
        const leadRegistry = leadRegistryOf([leadA1, leadA2, leadB1]);
        const ctx = canvasCtx({
            registry,
            materialSources: { decentralized: decentralizedSource },
            materialVerifier: new FakeVerifier(true),
            worldDiscoveryLeadRegistry: leadRegistry,
            decentralizedLeadAssociations: [
                associationFor(leadA1, materialA),
                associationFor(leadA2, materialA),
                associationFor(leadB1, materialB)
            ]
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-a' });
        await flush();
        assert(ctx.decentralizedLeadOutcome.status === 'AMBIGUOUS', '17. pub-a has two independently-evidenced leads — AMBIGUOUS');
        ctx.chooseDecentralizedLead(ctx.decentralizedLeadOutcome.candidates[0]);
        await flush();
        assert(ctx.resolvedLead !== null, '18. an explicit choice resolves the lead for pub-a');

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-b' });
        await flush();

        assert(ctx.resolvedLeadChoice === null, '19. selecting a new encounter clears any prior explicit lead choice');
        assert(ctx.decentralizedLeadOutcome.status === 'RESOLVED', '20. pub-b has exactly one evidenced lead — it resolves automatically, unaffected by whatever was chosen for pub-a');
        assert(ctx.resolvedLead === leadB1, '21. resolvedLead reflects pub-b\'s own single resolved lead, never a leftover choice from pub-a');

        console.log('✓ Section D: a fresh selection resets any prior explicit lead choice — no leakage across selections');
    }

    // ---------------------------------------------------------------
    // Section E — an injected source's own load() is called exactly once
    // per selection, even though both selectionOutcome and
    // decentralizedLeadOutcome refresh together.
    // ---------------------------------------------------------------
    {
        const decentralizedSource = new FakeSource({ id: 'pub-1' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-1' }],
                placements: [{ id: 'placement-1', publicationId: 'pub-1', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const lead = leadOf();
        const leadRegistry = leadRegistryOf([lead]);
        const ctx = canvasCtx({
            registry,
            materialSources: { decentralized: decentralizedSource },
            materialVerifier: new FakeVerifier(true),
            worldDiscoveryLeadRegistry: leadRegistry,
            decentralizedLeadAssociations: [associationFor(lead, { kind: 'PUBLICATION', objectId: 'pub-1' })]
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();

        assert(decentralizedSource.calls.length === 1, '22. a single selectEncounter() call triggers exactly one material-loading request, even though refreshSelectionOutcome() and refreshDecentralizedLeadOutcome() both run');
        assert(ctx.materialInspectionRequestId === 1, '23. materialInspectionRequestId advances by exactly one per selection, confirming refreshMaterialInspection() itself is called exactly once');

        console.log('✓ Section E: refreshMaterialInspection() runs exactly once per selection, never once per outcome refreshed');
    }

    // ---------------------------------------------------------------
    // Section F — a chosen lead that has since disappeared from the
    // registry is never trusted — resolvedLead falls back to null.
    // ---------------------------------------------------------------
    {
        const decentralizedSource = new FakeSource({ id: 'pub-shared' });
        const registry = registryOf([
            describeLocalWorldDiscoverySource({
                publications: [{ id: 'pub-shared' }],
                placements: [{ id: 'placement-shared', publicationId: 'pub-shared', position: { x: 0, y: 0, z: 0 } }]
            })
        ]);
        const publicationMaterial = { kind: 'PUBLICATION', objectId: 'pub-shared' };
        const leadA = leadOf();
        const leadB = leadOf({ origin: 'dweb:another-service', uri: 'ar://DEF456' });
        const leadRegistry = leadRegistryOf([leadA, leadB]);
        const ctx = canvasCtx({
            registry,
            materialSources: { decentralized: decentralizedSource },
            materialVerifier: new FakeVerifier(true),
            worldDiscoveryLeadRegistry: leadRegistry,
            decentralizedLeadAssociations: [associationFor(leadA, publicationMaterial), associationFor(leadB, publicationMaterial)]
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-shared' });
        await flush();
        const chosen = ctx.decentralizedLeadOutcome.candidates.find((c) => c.uri === leadA.uri);
        ctx.chooseDecentralizedLead(chosen);
        await flush();
        assert(ctx.resolvedLead === chosen, '24. the explicit choice resolves normally while both leads still exist');

        leadRegistry.removeLead(leadA.origin, leadA.discoveryTag, leadA.uri);
        ctx.refreshDecentralizedLeadOutcome();
        ctx.refreshMaterialInspection();
        await flush();

        assert(ctx.decentralizedLeadOutcome.status === 'RESOLVED', '25. once the chosen lead disappears, only leadB remains evidenced — the outcome itself resolves automatically');
        assert(ctx.resolvedLead === leadB, '26. resolvedLead reflects the CURRENT outcome, never the stale explicit choice for a lead that no longer exists');

        console.log('✓ Section F: a chosen lead that has since disappeared from the registry is never trusted — resolvedLead reflects only current evidence');
    }

    // ---------------------------------------------------------------
    // Section G — architectural regression.
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes('describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry({'), '27. WorldEncounterCanvas.js calls describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry() directly');
        assert(codeOnly.includes('worldDiscoveryLeadRegistry: {') && codeOnly.includes('decentralizedLeadAssociations: {'), '28. both new props are declared');
        assert(!codeOnly.includes('core/DecentralizedWorldEncounterLeadAssociation.js') && !codeOnly.includes('DecentralizedWorldDiscoveryLeadRegistry.js\''), '29. this component never imports the association/registry core modules directly — only the application-layer selection seam');
        const resolvedLeadChoiceAssignments = codeOnly.match(/this\.resolvedLeadChoice\s*=\s*[^;]+;/g) || [];
        assert(resolvedLeadChoiceAssignments.length === 2, '30a. resolvedLeadChoice is assigned in exactly two places');
        assert(resolvedLeadChoiceAssignments.every((line) => /=\s*(null|candidate)\s*;/.test(line)), '30. resolvedLeadChoice is only ever assigned null (reset) or the exact candidate handed to chooseDecentralizedLead() — never guessed');

        const forbiddenTerms = ['trusted', 'authentic', 'issafe', 'is-safe', 'reputation', 'ranking', 'preferred', '.find('];
        const lowerCodeOnly = codeOnly.toLowerCase();
        for (const term of forbiddenTerms) {
            assert(!lowerCodeOnly.includes(term), `31. WorldEncounterCanvas.js never uses "${term}" anywhere in its own code`);
        }

        console.log('✓ Section G: architectural regression — no second matching algorithm, both new props declared, no trusted/ranking/picking vocabulary');
    }

    console.log('\nAll DecentralizedWorldEncounterLeadSelectionUI tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedWorldEncounterLeadSelectionUI.test.js FAILED:', error);
    process.exitCode = 1;
});
