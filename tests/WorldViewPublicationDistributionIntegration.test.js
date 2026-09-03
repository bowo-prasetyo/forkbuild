import { readFile } from 'node:fs/promises';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../application/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionLifecyclePersistenceBridge } from '../application/PublicationDistributionLifecyclePersistenceBridge.js';
import { PublicationDistributionLifecycleRestorer } from '../application/PublicationDistributionLifecycleRestorer.js';
import { hydratePublicationDistributionLifecycles } from '../application/PublicationDistributionLifecycleHydration.js';
import { describePublicationDistributionLifecycle, PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';

// 0.9.100 — Publication Distribution World View Integration.
//
// 0.9.48 through 0.9.58 built the entire publication-side distribution
// story (Arweave upload, Nostr discovery, an orchestration call boundary)
// and 0.9.50 through 0.9.57 then built a complete lifecycle line on top of
// it — description, transition, an in-memory observation store, snapshot
// persistence, a persistence bridge, restoration, and startup hydration —
// entirely independent of any UI. This milestone is the third and final
// paused World View integration 0.9.98/0.9.99 left behind, and follows the
// SAME composition-root-first discipline 0.9.99 established: `ui/main.js`
// now composes the existing, unmodified lifecycle chain (restoring what
// this replica already persisted, then bridging future changes back to
// persistence) and provides ONE app-wide
// `PublicationDistributionLifecycleMemoryStore`; `ui/views/WorldView.js`
// injects it and hands it straight through to
// `WorldEncounterCanvas`'s own new `distributionLifecycleStore` prop;
// `WorldEncounterCanvas` subscribes to it for the CURRENTLY selected
// publication and renders its two independent
// `PublicationDistributionState` values (`ABSENT`/`PRESENT`) in a new
// "Distribution" panel, alongside its existing "Material"/"Verification"
// one. No second lifecycle, no new vocabulary, no polling, and — since
// actually EXECUTING a distribution needs real signer/relay configuration
// this app establishes nowhere — no Arweave uploader, Nostr publisher,
// executor, or orchestrator is ever constructed by any file this milestone
// touches.
//
// Section A: FLAGSHIP — the REAL, unmodified lifecycle chain (memory
//            store, persistence, persistence bridge, restorer, hydration)
//            carries a lifecycle across a simulated process restart,
//            exactly the composition `ui/main.js` now performs.
// Section B: WorldEncounterCanvas renders an already-recorded lifecycle
//            for a selected publication immediately upon selection.
// Section C: live observation — a store change for the selected
//            publication updates the rendered state without a new
//            selection and without any polling.
// Section D: no distributionLifecycleStore supplied — the panel's own
//            state defaults to ABSENT/ABSENT, and neither get() nor
//            subscribe() is ever called.
// Section E: selecting a non-PUBLICATION encounter never touches the
//            store.
// Section F: switching the selected publication unsubscribes from the
//            previous one — a store change for the OLD publication no
//            longer reaches the canvas.
// Section G: unmounting unsubscribes — a store change after unmount is
//            never observed.
// Section H: repeated observation of an unchanged lifecycle is
//            deterministic.
// Section I: architectural regression — ui/main.js composes the real
//            lifecycle chain (store/persistence/bridge/restorer/hydration)
//            and provides it app-wide, without ever importing an Arweave
//            uploader, Nostr publisher, executor, or orchestrator.
// Section J: architectural regression — ui/views/WorldView.js injects the
//            store (defaulting to null) and forwards it verbatim; it never
//            calls get()/set()/subscribe() itself, and the pre-existing
//            registry/materialSources/materialVerifier/VehicleInteractionPrompt
//            wiring is unaffected.
// Section K: architectural regression — WorldEncounterCanvas.js never
//            imports Arweave/Nostr/executor/orchestrator/transition, and
//            invents no TRUSTED/PUBLISHED/POPULAR/SUCCESSFUL/ONLINE/
//            DECENTRALIZED vocabulary in its new wiring.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function distributedLifecycle(publicationId) {
    return describePublicationDistributionLifecycle({
        publication: { id: publicationId },
        material: { uri: 'ar://tx-' + publicationId, storage: null },
        discovery: { relayUrl: 'wss://relay.example', discoveryTag: 'tag-' + publicationId, id: 'evt-' + publicationId }
    });
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
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        chooseSelectionOrigin: WorldEncounterCanvas.methods.chooseSelectionOrigin,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        chooseDecentralizedLead: WorldEncounterCanvas.methods.chooseDecentralizedLead,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        ...overrides
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributionMaterialState', {
        get() { return WorldEncounterCanvas.computed.distributionMaterialState.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributionDiscoveryState', {
        get() { return WorldEncounterCanvas.computed.distributionDiscoveryState.call(ctx); }
    });
    return ctx;
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — FLAGSHIP: the real lifecycle chain, across a
    // simulated process restart
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();

        // "Before restart" — a caller (the not-yet-built distribute
        // command) records a described lifecycle into the store; an
        // observing persistence bridge — exactly what ui/main.js wires —
        // persists it automatically.
        const storeBefore = new PublicationDistributionLifecycleMemoryStore();
        const persistenceBefore = new PublicationDistributionLifecyclePersistence(storage);
        const bridgeBefore = new PublicationDistributionLifecyclePersistenceBridge(storeBefore, persistenceBefore);
        bridgeBefore.observe('pub-1');
        storeBefore.set('pub-1', distributedLifecycle('pub-1'));

        assert(persistenceBefore.load('pub-1') !== null,
            '1. FLAGSHIP: a lifecycle set() on the store, with an observing persistence bridge, is genuinely persisted');

        // "After restart" — a fresh store + restorer pair, hydrated from
        // the same publication ids ui/main.js would supply via
        // publicationCatalog.list().
        const storeAfter = new PublicationDistributionLifecycleMemoryStore();
        const persistenceAfter = new PublicationDistributionLifecyclePersistence(storage);
        const restorerAfter = new PublicationDistributionLifecycleRestorer(persistenceAfter, storeAfter);

        const restored = hydratePublicationDistributionLifecycles(restorerAfter, ['pub-1', 'pub-never-distributed']);

        assert(restored.length === 2,
            '2. hydration returns one pair per input publication id, regardless of whether a persisted record existed');
        assert(storeAfter.get('pub-1') !== null,
            '3. FLAGSHIP: hydration restores a persisted lifecycle into a fresh store, across a simulated restart');
        assert(storeAfter.get('pub-1').material.state === PublicationDistributionState.PRESENT,
            '4. the restored lifecycle carries the exact material state that was persisted');
        assert(storeAfter.get('pub-1').discovery.state === PublicationDistributionState.PRESENT,
            '5. ...and the exact discovery state');
        assert(storeAfter.get('pub-never-distributed') === null,
            '6. a publication id with nothing ever distributed restores to nothing — never a guessed or default lifecycle');

        console.log('✓ Flagship: the real, unmodified lifecycle chain carries a lifecycle across a simulated restart');
    }

    // -------------------------------------------------------------
    // Section B — an already-recorded lifecycle renders on selection
    // -------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-1', distributedLifecycle('pub-1'));

        const ctx = canvasCtx({ distributionLifecycleStore: store });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-1' });

        assert(ctx.distributionLifecycle !== null,
            '7. selecting a publication with an already-recorded lifecycle observes it immediately');
        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT,
            '8. the panel-facing material state reflects the store exactly');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT,
            '9. ...and the discovery state');

        console.log('✓ Selecting a publication observes its already-recorded distribution lifecycle');
    }

    // -------------------------------------------------------------
    // Section C — live observation, never polling
    // -------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const ctx = canvasCtx({ distributionLifecycleStore: store });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-2' });

        assert(ctx.distributionMaterialState === PublicationDistributionState.ABSENT,
            '10. nothing distributed yet for this publication — ABSENT, not a thrown error or a guess');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.ABSENT, '11. ...on both dimensions');

        // A later change to the SAME store, for the SAME publication —
        // simulating a distribute command completing sometime after
        // selection — reaches the canvas via the subscription alone, with
        // no re-selection and no timer of any kind.
        store.set('pub-2', distributedLifecycle('pub-2'));

        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT,
            '12. a store change for the selected publication updates the rendered state live, via subscription');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, '13. ...on both dimensions');

        console.log('✓ A later store change reaches the canvas through observation, with no polling');
    }

    // -------------------------------------------------------------
    // Section D — no store supplied, never throws, never called
    // -------------------------------------------------------------
    {
        const ctx = canvasCtx({ distributionLifecycleStore: null });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-3' });

        assert(ctx.distributionLifecycle === null,
            '14. with no distributionLifecycleStore supplied, distributionLifecycle stays null');
        assert(ctx.distributionMaterialState === PublicationDistributionState.ABSENT,
            '15. ...and the panel-facing state degrades to ABSENT, never a thrown error');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.ABSENT, '16. ...on both dimensions');

        console.log('✓ No distributionLifecycleStore supplied degrades honestly, never throws');
    }

    // -------------------------------------------------------------
    // Section E — a non-PUBLICATION selection never touches the store
    // -------------------------------------------------------------
    {
        class ThrowingStore {
            get() { throw new Error('get() should never be called for a non-PUBLICATION selection'); }
            subscribe() { throw new Error('subscribe() should never be called for a non-PUBLICATION selection'); }
        }

        const ctx = canvasCtx({ distributionLifecycleStore: new ThrowingStore() });
        ctx.selectEncounter({ kind: 'AVATAR', objectId: 'avatar-1' });

        assert(ctx.distributionLifecycle === null,
            '17. selecting an AVATAR encounter never populates distributionLifecycle');

        console.log('✓ A non-PUBLICATION selection never calls the distribution store');
    }

    // -------------------------------------------------------------
    // Section F — switching selection unsubscribes from the old one
    // -------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const ctx = canvasCtx({ distributionLifecycleStore: store });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-a' });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-b' });

        // A change to the OLD publication, after the Wanderer has since
        // selected a different one, must never reach the canvas.
        store.set('pub-a', distributedLifecycle('pub-a'));
        assert(ctx.distributionLifecycle === null,
            '18. a store change for a previously-selected (now superseded) publication is never observed');

        store.set('pub-b', distributedLifecycle('pub-b'));
        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT,
            '19. the CURRENTLY selected publication is still observed correctly after switching');

        console.log('✓ Switching the selected publication unsubscribes from the previous one');
    }

    // -------------------------------------------------------------
    // Section G — unmounting unsubscribes
    // -------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        const ctx = canvasCtx({ distributionLifecycleStore: store });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-4' });

        // beforeUnmount()'s own distribution-lifecycle cleanup, exercised
        // directly — mirrors this file's own unsubscribeWorldRegistry/
        // unsubscribeWorldDiscoveryLeadRegistry cleanup exactly.
        if (typeof ctx.unsubscribeDistributionLifecycle === 'function') {
            ctx.unsubscribeDistributionLifecycle();
        }
        ctx.unsubscribeDistributionLifecycle = null;

        store.set('pub-4', distributedLifecycle('pub-4'));
        assert(ctx.distributionLifecycle === null,
            '20. a store change arriving after unmount is never written to distributionLifecycle');

        console.log('✓ Unsubscribing (as beforeUnmount() does) stops further observation');
    }

    // -------------------------------------------------------------
    // Section H — repeated observation is deterministic
    // -------------------------------------------------------------
    {
        const store = new PublicationDistributionLifecycleMemoryStore();
        store.set('pub-5', distributedLifecycle('pub-5'));

        const ctx = canvasCtx({ distributionLifecycleStore: store });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-5' });
        const first = ctx.distributionMaterialState;

        for (let i = 0; i < 3; i++) {
            ctx.refreshDistributionLifecycle();
            assert(ctx.distributionMaterialState === first,
                '21. repeated observation of an unchanged lifecycle reports the identical state, every time');
        }

        console.log('✓ Repeated observation of an unchanged lifecycle is deterministic');
    }

    // -------------------------------------------------------------
    // Section I — architectural regression: ui/main.js
    // -------------------------------------------------------------
    {
        const mainSourceUrl = new URL('../ui/main.js', import.meta.url);
        const mainSource = await readFile(mainSourceUrl, 'utf8');
        const mainCodeOnly = mainSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(mainCodeOnly.includes("import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';"),
            '22. ui/main.js imports the existing, unmodified PublicationDistributionLifecycleMemoryStore — never a second store');
        assert(mainCodeOnly.includes("import { PublicationDistributionLifecyclePersistence } from '../application/PublicationDistributionLifecyclePersistence.js';"),
            '23. ...and the existing PublicationDistributionLifecyclePersistence');
        assert(mainCodeOnly.includes("import { PublicationDistributionLifecyclePersistenceBridge } from '../application/PublicationDistributionLifecyclePersistenceBridge.js';"),
            '24. ...and the existing PublicationDistributionLifecyclePersistenceBridge');
        assert(mainCodeOnly.includes("import { PublicationDistributionLifecycleRestorer } from '../application/PublicationDistributionLifecycleRestorer.js';"),
            '25. ...and the existing PublicationDistributionLifecycleRestorer');
        assert(mainCodeOnly.includes("import { hydratePublicationDistributionLifecycles } from '../application/PublicationDistributionLifecycleHydration.js';"),
            '26. ...and the existing hydratePublicationDistributionLifecycles()');

        assert(mainCodeOnly.includes('new PublicationDistributionLifecycleMemoryStore(')
            && mainCodeOnly.includes('new PublicationDistributionLifecyclePersistence(')
            && mainCodeOnly.includes('new PublicationDistributionLifecyclePersistenceBridge(')
            && mainCodeOnly.includes('new PublicationDistributionLifecycleRestorer(')
            && mainCodeOnly.includes('hydratePublicationDistributionLifecycles('),
            '27. ui/main.js actually composes all five collaborators — not merely importing them unused');
        assert(mainCodeOnly.includes("app.provide('publicationDistributionLifecycleStore'"),
            '28. ui/main.js provides the composed store app-wide, the same convention every other collaborator in this file already uses');
        assert(mainCodeOnly.includes('publicationCatalog.list()'),
            "29. hydration is seeded from this replica's own already-existing publicationCatalog — never a second, invented list of ids");

        // No second lifecycle, and no distribution EXECUTION runtime —
        // producing a NEW distribution result stays entirely a separate,
        // unscheduled concern; this milestone only observes results that
        // already exist.
        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|transitionPublicationDistributionLifecycle/.test(mainCodeOnly),
            '30. ui/main.js never constructs an Arweave uploader, Nostr publisher, executor, orchestrator, or a second lifecycle transition of its own');

        console.log('✓ ui/main.js composes the real, existing lifecycle chain verbatim and provides it app-wide');
    }

    // -------------------------------------------------------------
    // Section J — architectural regression: ui/views/WorldView.js
    // -------------------------------------------------------------
    {
        const viewSourceUrl = new URL('../ui/views/WorldView.js', import.meta.url);
        const viewSource = await readFile(viewSourceUrl, 'utf8');
        const viewCodeOnly = viewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(viewCodeOnly.includes("inject('publicationDistributionLifecycleStore', null)"),
            "31. WorldView.js injects publicationDistributionLifecycleStore, defaulting to null — never throwing when ui/main.js's provider is absent");
        assert(/<WorldEncounterCanvas[\s\S]{0,400}distributionLifecycleStore="publicationDistributionLifecycleStore"/.test(viewCodeOnly),
            '32. WorldView.js forwards publicationDistributionLifecycleStore to WorldEncounterCanvas as its own new prop');

        // The pre-existing (0.9.17/0.9.98/0.9.99) wiring is unaffected.
        assert(viewCodeOnly.includes(':registry="worldDiscoverySourceRegistry"'), '33. the pre-existing (0.9.17) registry binding is unchanged');
        assert(viewCodeOnly.includes('materialSources="worldEncounterMaterialSources"'), '34. the pre-existing (0.9.99) materialSources binding is unchanged');
        assert(viewCodeOnly.includes('materialVerifier="worldEncounterMaterialVerifier"'), '35. the pre-existing (0.9.99) materialVerifier binding is unchanged');
        assert(viewCodeOnly.includes('<VehicleInteractionPrompt :state="vehicleInteractionState" />'), '36. the pre-existing (0.9.98) VehicleInteractionPrompt wiring is unaffected by this milestone');

        // WorldView.js never reaches into the lifecycle chain itself — it
        // only forwards the one already-composed store.
        assert(!/\.set\(|\.subscribe\(|describePublicationDistributionLifecycle|transitionPublicationDistributionLifecycle|PublicationDistributionLifecyclePersistence|PublicationDistributionLifecycleRestorer/.test(viewCodeOnly),
            '37. WorldView.js never calls the lifecycle chain itself — that stays entirely inside ui/main.js (composition) and WorldEncounterCanvas (observation)');

        // No new trust/status vocabulary introduced by this milestone's own
        // wiring (bounded to the setup()-level inject block and the
        // WorldEncounterCanvas mount, mirroring 0.9.99's own identically-
        // scoped check — WorldView.js already carries an UNRELATED,
        // pre-existing "trusted" concept, remoteAvatarDiagnostics, 0.4.x,
        // this milestone neither touches nor should flag).
        const distributionWiringSnippet = [
            viewCodeOnly.slice(viewCodeOnly.indexOf("inject('publicationDistributionLifecycleStore'"), viewCodeOnly.indexOf("inject('publicationDistributionLifecycleStore'") + 400),
            viewCodeOnly.slice(viewCodeOnly.indexOf('<WorldEncounterCanvas'), viewCodeOnly.indexOf('<WorldEncounterCanvas') + 400)
        ].join('\n');
        assert(!/TRUSTED|PUBLISHED|POPULAR|SUCCESSFUL|ONLINE|DECENTRALIZED/i.test(distributionWiringSnippet),
            '38. the new publication-distribution wiring introduces no TRUSTED/PUBLISHED/POPULAR/SUCCESSFUL/ONLINE/DECENTRALIZED vocabulary of its own');

        console.log('✓ WorldView.js forwards the composed store verbatim, with no lifecycle logic or new vocabulary of its own');
    }

    // -------------------------------------------------------------
    // Section K — architectural regression: ui/components/WorldEncounterCanvas.js
    // -------------------------------------------------------------
    {
        const canvasSourceUrl = new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url);
        const canvasSource = await readFile(canvasSourceUrl, 'utf8');
        const canvasCodeOnly = canvasSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|transitionPublicationDistributionLifecycle|PublicationDistributionLifecycleMemoryStore/.test(canvasCodeOnly),
            '39. WorldEncounterCanvas.js never constructs an Arweave uploader, Nostr publisher, executor, orchestrator, transition, or a second memory store — it only reads the one it is handed');
        assert(canvasCodeOnly.includes('distributionLifecycleStore.get(') && canvasCodeOnly.includes('distributionLifecycleStore.subscribe('),
            '40. WorldEncounterCanvas.js observes the injected store through get()/subscribe() only');
        assert(!/setInterval|setTimeout/.test(canvasCodeOnly),
            '41. no polling loop of any kind is introduced (this file has never used a timer, and still does not)');
        assert(!/\bTRUSTED\b|\bPUBLISHED\b|\bPOPULAR\b|\bSUCCESSFUL\b|\bONLINE\b|\bDECENTRALIZED\b/.test(canvasCodeOnly),
            '42. no TRUSTED/PUBLISHED/POPULAR/SUCCESSFUL/ONLINE/DECENTRALIZED vocabulary is invented anywhere in this file');

        console.log('✓ WorldEncounterCanvas.js only observes the injected store — no execution, no polling, no new vocabulary');
    }

    console.log('✅ All World View Publication Distribution Integration tests passed.');
}

await runTests();
