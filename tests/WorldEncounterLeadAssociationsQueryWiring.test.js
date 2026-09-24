import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldEncounterMaterialSource } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerification.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { composeWorldEncounterLeadAssociationsQuery } from '../application/WorldEncounterLeadAssociationsQueryComposition.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// Connects WorldEncounterCanvas's "Location" / "Choose Location" panel to
// real association evidence.
//
// Before: the canvas resolved a selected encounter's decentralized leads
// against its `decentralizedLeadAssociations` prop, which no production
// caller ever passed — so every outcome was UNAVAILABLE, the panel never
// rendered, and an encounter with several matching leads could never be
// resolved (discovery itself only loads material for a RESOLVED lead).
//
// Now: ui/main.js composes `composeWorldEncounterLeadAssociationsQuery()`
// from the SAME runtime and publication source as
// `discoverWorldEncounterPublicationCommand`, ui/views/WorldView.js passes
// it as the canvas's `leadAssociationsQuery` prop, and the canvas reads it
// fresh on every outcome refresh.
//
// Section A: the composed query derives associations from the provider's
//            signed Publications and the runtime's lead registry.
// Section B: the query reads both inputs fresh on every call.
// Section C: missing collaborators degrade to no evidence, never a throw.
// Section D: canvas — a single matching lead RESOLVES automatically.
// Section E: canvas — several matching leads are AMBIGUOUS until the
//            Wanderer chooses one, and the choice reaches material loading.
// Section F: canvas — a lead arriving later is picked up on the registry's
//            own change notification (the query is re-read, not cached).
// Section G: canvas — the query wins over the array prop, and a throwing
//            query degrades to UNAVAILABLE without breaking selection.
// Section H: production wiring — main.js shares one provider between the
//            command and the query; WorldView injects and binds it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
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

function leadRegistryOf(leads) {
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    for (const lead of leads) {
        registry.setLead(lead);
    }
    return registry;
}

// The minimal signed-Publication shape
// core/DecentralizedPublicationLocationClaim.js reads a claim from.
function signedPublication(id, uri) {
    return { id, signature: 'sig-' + id, contentReference: { hash: 'hash-' + id, uri } };
}

class FakeProvider {
    constructor(publications) {
        this.publications = publications;
        this.listCalls = 0;
    }

    list() {
        this.listCalls += 1;
        return this.publications;
    }
}

class FakeSource extends WorldEncounterMaterialSource {
    constructor(material) {
        super();
        this.material = material;
        this.calls = [];
    }

    async load(resolvedSelection, resolvedLead) {
        this.calls.push({ resolvedSelection, resolvedLead });
        return this.material;
    }
}

class FakeVerifier extends WorldEncounterMaterialVerifier {
    async verifyIdentity() {
        return true;
    }
}

function encounterRegistryOf(publicationId) {
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: publicationId }],
        placements: [{ id: 'placement-' + publicationId, publicationId, position: { x: 0, y: 0, z: 0 } }]
    }));
    return registry;
}

// A plain-object stand-in for the mounted component, built from the
// component's own real methods/computeds — the same technique
// tests/DecentralizedWorldEncounterLeadSelectionUI.test.js uses.
function canvasCtx(overrides = {}) {
    const methods = WorldEncounterCanvas.methods;
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
        decentralizedPublicationDiscoveryProvider: null,
        worldDiscoveryLeadRegistry: null,
        decentralizedLeadAssociations: [],
        leadAssociationsQuery: null,
        decentralizedLeadOutcome: null,
        resolvedLeadChoice: null,
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        admitToRepositoryDiscovery: methods.admitToRepositoryDiscovery,
        selectEncounter: methods.selectEncounter,
        refreshSelectionOutcome: methods.refreshSelectionOutcome,
        chooseSelectionOrigin: methods.chooseSelectionOrigin,
        refreshMaterialInspection: methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: methods.refreshDecentralizedLeadOutcome,
        chooseDecentralizedLead: methods.chooseDecentralizedLead,
        refreshDistributionLifecycle: methods.refreshDistributionLifecycle,
        stopSubscription: methods.stopSubscription,
        ...overrides
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
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
    // Section A — the composed query derives real associations.
    // ---------------------------------------------------------------
    {
        const lead = leadOf();
        const unrelatedLead = leadOf({ origin: 'dweb:other', uri: 'ar://UNRELATED' });
        const runtime = { registry: leadRegistryOf([lead, unrelatedLead]) };
        const provider = new FakeProvider([signedPublication('pub-1', 'ar://ABC123')]);
        const query = composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider: provider });

        const associations = query();
        assert(Array.isArray(associations) && associations.length === 1, '1. one signed Publication claiming one known lead\'s uri yields exactly one association');
        assert(associations[0].objectId === 'pub-1' && associations[0].kind === 'PUBLICATION', '2. the association names the claiming Publication');
        assert(associations[0].origin === lead.origin && associations[0].discoveryTag === lead.discoveryTag && associations[0].uri === lead.uri,
            '3. origin/discoveryTag/uri come from the matching lead — an unrelated lead contributes nothing');

        const secondLead = leadOf({ origin: 'dweb:another-service' });
        runtime.registry.setLead(secondLead);
        assert(query().length === 2, '4. two independent leads for the same uri yield two associations (one per lead), never merged');

        console.log('✓ Section A: the composed query derives associations from signed Publications and the runtime registry');
    }

    // ---------------------------------------------------------------
    // Section B — both inputs are read fresh on every call.
    // ---------------------------------------------------------------
    {
        const runtime = { registry: leadRegistryOf([]) };
        const provider = new FakeProvider([]);
        const query = composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider: provider });

        assert(query().length === 0, '5. no leads and no publications yield no associations');
        runtime.registry.setLead(leadOf());
        assert(query().length === 0, '6. a lead no Publication claims yields no association');
        provider.publications = [signedPublication('pub-1', 'ar://ABC123')];
        assert(query().length === 1, '7. a Publication stored after composition is seen on the next call — nothing cached at composition time');
        assert(provider.listCalls === 3, '8. discoveryProvider.list() is read once per call');

        console.log('✓ Section B: the query reads the provider and registry fresh on every call');
    }

    // ---------------------------------------------------------------
    // Section C — missing collaborators degrade to no evidence.
    // ---------------------------------------------------------------
    {
        const lead = leadOf();
        assert(composeWorldEncounterLeadAssociationsQuery({ runtime: { registry: leadRegistryOf([lead]) } })().length === 0,
            '9. no discoveryProvider means no publications, so no associations');
        assert(composeWorldEncounterLeadAssociationsQuery({ discoveryProvider: new FakeProvider([signedPublication('pub-1', lead.uri)]) })().length === 0,
            '10. no runtime means no leads, so no associations');
        assert(composeWorldEncounterLeadAssociationsQuery()().length === 0, '11. no arguments at all still returns an empty array, never throws');

        console.log('✓ Section C: missing collaborators degrade to no evidence');
    }

    // ---------------------------------------------------------------
    // Section D — canvas: a single matching lead resolves automatically.
    // ---------------------------------------------------------------
    {
        const lead = leadOf();
        const runtime = { registry: leadRegistryOf([lead]) };
        const provider = new FakeProvider([signedPublication('pub-1', lead.uri)]);
        const source = new FakeSource({ id: 'pub-1' });
        const ctx = canvasCtx({
            registry: encounterRegistryOf('pub-1'),
            materialSources: { decentralized: source },
            materialVerifier: new FakeVerifier(),
            worldDiscoveryLeadRegistry: runtime.registry,
            leadAssociationsQuery: composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider: provider })
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        await flush();

        assert(ctx.decentralizedLeadOutcome && ctx.decentralizedLeadOutcome.status === 'RESOLVED',
            '12. with the query wired, a single matching lead RESOLVES — the "Location" line now has an outcome to render');
        assert(ctx.resolvedLead === lead, '13. resolvedLead is that lead');
        assert(source.calls.length === 1 && source.calls[0].resolvedLead === lead, '14. material loading is routed through the resolved lead');

        console.log('✓ Section D: a single matching lead resolves automatically once the query is wired');
    }

    // ---------------------------------------------------------------
    // Section E — canvas: AMBIGUOUS until the Wanderer chooses.
    // ---------------------------------------------------------------
    {
        const leadA = leadOf({ uri: 'ar://SHARED' });
        const leadB = leadOf({ origin: 'dweb:another-service', uri: 'ar://SHARED' });
        const runtime = { registry: leadRegistryOf([leadA, leadB]) };
        const provider = new FakeProvider([signedPublication('pub-shared', 'ar://SHARED')]);
        const source = new FakeSource({ id: 'pub-shared' });
        const ctx = canvasCtx({
            registry: encounterRegistryOf('pub-shared'),
            materialSources: { decentralized: source },
            materialVerifier: new FakeVerifier(),
            worldDiscoveryLeadRegistry: runtime.registry,
            leadAssociationsQuery: composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider: provider })
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-shared' });
        await flush();

        assert(ctx.decentralizedLeadOutcome.status === 'AMBIGUOUS' && ctx.decentralizedLeadOutcome.candidates.length === 2,
            '15. two leads for the same claimed uri are AMBIGUOUS with both offered — the "Choose Location" panel now renders');
        assert(ctx.resolvedLead === null && source.calls.length === 0, '16. nothing is guessed or loaded before the Wanderer chooses');

        const chosen = ctx.decentralizedLeadOutcome.candidates.find((c) => c.origin === leadB.origin);
        ctx.chooseDecentralizedLead(chosen);
        await flush();

        assert(ctx.resolvedLead === chosen, '17. the Wanderer\'s choice becomes resolvedLead');
        assert(source.calls.length === 1 && source.calls[0].resolvedLead === chosen, '18. the chosen lead reaches material loading — the ambiguous case is no longer a dead end');

        console.log('✓ Section E: several matching leads are AMBIGUOUS until chosen, and the choice reaches material loading');
    }

    // ---------------------------------------------------------------
    // Section F — a lead arriving later is picked up on refresh.
    // ---------------------------------------------------------------
    {
        const runtime = { registry: leadRegistryOf([]) };
        const lead = leadOf();
        const provider = new FakeProvider([signedPublication('pub-1', lead.uri)]);
        let queryCalls = 0;
        const query = composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider: provider });
        const ctx = canvasCtx({
            registry: encounterRegistryOf('pub-1'),
            worldDiscoveryLeadRegistry: runtime.registry,
            leadAssociationsQuery: () => {
                queryCalls += 1;
                return query();
            }
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        assert(ctx.decentralizedLeadOutcome.status === 'UNAVAILABLE', '19. before discovery has produced any lead, the outcome is UNAVAILABLE (panel hidden)');

        // What the registry's own subscription does in mounted().
        runtime.registry.setLead(lead);
        ctx.refreshDecentralizedLeadOutcome();

        assert(ctx.decentralizedLeadOutcome.status === 'RESOLVED', '20. once discovery adds a matching lead, the next refresh resolves it');
        assert(queryCalls === 2, '21. the query is called on every refresh — fresh evidence each time, never a cached snapshot');

        console.log('✓ Section F: a lead arriving later is picked up on the registry-driven refresh');
    }

    // ---------------------------------------------------------------
    // Section G — precedence and failure handling.
    // ---------------------------------------------------------------
    {
        const lead = leadOf();
        const staleArrayAssociation = { origin: lead.origin, discoveryTag: lead.discoveryTag, uri: lead.uri, kind: 'PUBLICATION', objectId: 'pub-1' };
        const ctx = canvasCtx({
            registry: encounterRegistryOf('pub-1'),
            worldDiscoveryLeadRegistry: leadRegistryOf([lead]),
            decentralizedLeadAssociations: [staleArrayAssociation],
            leadAssociationsQuery: () => []
        });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        assert(ctx.decentralizedLeadOutcome.status === 'UNAVAILABLE', '22. when both are supplied, leadAssociationsQuery wins over the decentralizedLeadAssociations array');

        const originalError = console.error;
        const logged = [];
        console.error = (...args) => logged.push(args);
        let threw = false;
        const failing = canvasCtx({
            registry: encounterRegistryOf('pub-1'),
            worldDiscoveryLeadRegistry: leadRegistryOf([lead]),
            leadAssociationsQuery: () => { throw new Error('storage unreadable'); }
        });
        try {
            failing.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        } catch {
            threw = true;
        } finally {
            console.error = originalError;
        }
        assert(!threw, '23. a throwing query never breaks selecting an encounter');
        assert(failing.selectedEncounter && failing.selectedEncounter.objectId === 'pub-1', '24. the encounter is still selected');
        assert(failing.decentralizedLeadOutcome.status === 'UNAVAILABLE', '25. a throwing query degrades to no evidence (UNAVAILABLE)');
        assert(logged.length === 1, '26. the failure is logged once, not swallowed silently');

        const noQuery = canvasCtx({
            registry: encounterRegistryOf('pub-1'),
            worldDiscoveryLeadRegistry: leadRegistryOf([lead]),
            decentralizedLeadAssociations: [staleArrayAssociation]
        });
        noQuery.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });
        assert(noQuery.decentralizedLeadOutcome.status === 'RESOLVED', '27. without a query, the decentralizedLeadAssociations array still works exactly as before');

        console.log('✓ Section G: the query takes precedence, and a throwing query degrades safely');
    }

    // ---------------------------------------------------------------
    // Section H — production wiring.
    // ---------------------------------------------------------------
    {
        const mainSource = await readFile(new URL('../ui/main.js', import.meta.url), 'utf8');
        const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))).join('\n');

        assert(/const worldEncounterPublicationEvidenceProvider = new LocalDiscoveryProvider\(new LocalStorageProvider\(\)\);/.test(mainSource),
            '28. main.js constructs one publication evidence provider');
        assert(/composeDiscoverWorldEncounterPublicationCommand\(\{\s*runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,\s*discoveryProvider: worldEncounterPublicationEvidenceProvider\s*\}\)/.test(mainSource)
            && /composeWorldEncounterLeadAssociationsQuery\(\{\s*runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,\s*discoveryProvider: worldEncounterPublicationEvidenceProvider\s*\}\)/.test(mainSource),
            '29. the discovery command and the association query share the SAME runtime and provider, so the panel and discovery always agree');
        assert(mainSource.includes("app.provide('worldEncounterLeadAssociationsQuery', worldEncounterLeadAssociationsQuery);"),
            '30. main.js provides the query app-wide');
        assert(worldViewSource.includes("inject('worldEncounterLeadAssociationsQuery', null)"),
            '31. WorldView injects the query, defaulting to null');
        assert(/<WorldEncounterCanvas[\s\S]*?:leadAssociationsQuery="worldEncounterLeadAssociationsQuery"[\s\S]*?\/>/.test(worldViewSource),
            '32. WorldView binds it to the canvas\'s leadAssociationsQuery prop');
        assert(WorldEncounterCanvas.props.leadAssociationsQuery && WorldEncounterCanvas.props.leadAssociationsQuery.default === null,
            '33. the prop is optional, defaulting to null — LiveWorldView and every other caller are unaffected');
        assert(!/^import[^;]*DecentralizedWorldEncounterLeadAssociationEvidenceIngress/m.test(canvasSource),
            '34. the canvas still derives no evidence itself — it only calls the caller\'s query');

        console.log('✓ Section H: production wiring shares one provider between discovery and the panel');
    }
}

run().then(() => {
    console.log('WorldEncounterLeadAssociationsQueryWiring tests passed');
}).catch((error) => {
    console.error('✗ WorldEncounterLeadAssociationsQueryWiring tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
