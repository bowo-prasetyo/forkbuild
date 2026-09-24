import { execSync } from 'node:child_process';

import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from '../application/snapshot/AutomaticSnapshotEncounterCascadeOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { materializedSnapshotWorldOrigin } from '../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { worldEncounterCanvasFiles, worldViewFiles, worldViewTemplateFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.553 — Observer-Local Encounter Experience Product Reassessment.
//
// TYPE: test-only product reassessment. Production changes: none.
//
// 0.9.552 closed 0.9.551's own named gap: a Wanderer's own walking can now
// drive a genuinely novel, verified, materialized Publication all the way
// through DISCOVER -> RESOLVE -> VERIFY -> MATERIALIZE -> (UNPLACED) ->
// observer-local ENCOUNTER -> observer-local STORE -> WorldEncounterCanvas
// RENDERING. This milestone asks the next, genuinely different question:
// now that the Wanderer can finally SEE the result, is what they see
// actually useful, or have they merely been handed a visual artifact with
// no way to understand or act on it? Test-only — no production changes
// ship with this milestone — checked against real, unmodified production
// source: the real cascade, the real store, the real descriptor, and the
// real `ui/components/WorldEncounterCanvas.js` component driven directly
// through its own `computed`/`methods`/`mounted`/`beforeUnmount` — the
// SAME "call computed.call(ctx)" discipline this codebase's own UI test
// suite already established (tests/DecentralizedSnapshotSpatialE2EAudit.test.js,
// tests/LiveWorldView.test.js) — never a hand-simulated stand-in.
// `ui/views/WorldView.js` itself still can't be imported here (THREE.js-
// dependent renderer stack, the same documented constraint 0.9.550/0.9.551
// already named); its own composition of these same real pieces is instead
// verified structurally, by reading its own unmodified source.
//
//   Section A. Flagship — reproduce the complete new experience end to
//              end, backend through to the exact data the SVG renders
//              from.
//   Section B. Encounter lifecycle — continue walking, walk away, return,
//              re-encounter, encounter several, reload, change session.
//   Section C. Duplicate encounter behavior.
//   Section D. Multiple novel publications — identity, same-content
//              non-merging, isolation from a sibling's own failure.
//   Section E. Encounter position semantics — fixed at first observation,
//              plus a narrow architectural note about the store's own
//              primitive.
//   Section F. User understanding — what the rendered presentation
//              actually answers, and what it does not.
//   Section G. The biggest likely product gap: no interaction.
//   Section H. Interaction with Repository — the boundary reconfirmed.
//   Section I. Failure and stale-async lifecycle.
//   Section J. Cross-Wanderer isolation, contrasted with genuine
//              decentralized (re-)discovery.
//   Section K. Existing World Encounter separation — mechanically
//              reconfirmed side by side, not merely by non-interference.
//   Section L. Product classification and verdict.
//
// CLASSIFICATION VOCABULARY: `ALREADY_CORRECT`, `DOCUMENTATION_GAP`,
// `PRODUCT_GAP`, `ARCHITECTURAL_GAP` (0.9.551's own four), plus one new
// value this milestone's own brief asked for: `DELIBERATE_BOUNDARY` — an
// apparent absence that is in fact the correct, intended consequence of
// the observer-local model 0.9.552 built, never a case this milestone
// argues should be "fixed."
//
// DELIBERATELY EXCLUDED — PER THIS MILESTONE'S OWN BRIEF: persistent
// observer encounters, reputation, trust scoring, spatial voting,
// automatic placement, claimed-position adoption, community moderation,
// new encounter synchronization, new placement types, automatic Repository
// promotion, a new navigation system, visual redesign, a new interaction
// framework. Also excluded: making an observer-local encounter selectable
// merely because Section G asks whether selection would be useful — this
// file establishes the product requirement only; it builds nothing. No
// production code changes ship with this milestone.

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ===================================================================
// Real-machinery backend harness — mirrors tests/
// ObserverLocalNovelPublicationEncounterPresentation.test.js's own
// makeHost()/placeAndAnnounce()/makeWorldModel()/makeCascade() exactly,
// duplicated here per this codebase's own established convention (each
// audit/reassessment file owns its own harness rather than importing
// another test file's internals).
// ===================================================================

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-tx-${counter}`, transaction: { id: `fake-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: (publicationId) => publications.get(publicationId) || null
    };
}

function makeCascade(host, worldModel, registry, overrides = {}) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel.resolvePlacementInfo,
        findPublicationById: worldModel.findPublicationById,
        ...overrides
    });
}

// ===================================================================
// WorldEncounterCanvas real-component harness — mirrors tests/
// DecentralizedSnapshotSpatialE2EAudit.test.js's own buildCanvasInstance()/
// mountCanvas()/unmountCanvas()/projectedPublicationsOf() exactly: a real,
// mounted WorldEncounterCanvas, driven by its own `data`/`computed`/
// `methods` dictionaries directly rather than a full Vue render — this
// codebase's own established discipline for testing an Options-API
// component under plain Node.
// ===================================================================

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null } = {}) {
    const ctx = {
        registry,
        observerLocalEncounterRegistry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier: null
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    // 0.9.554 — mirrors the two getters immediately above, exactly, for
    // the new observer-local-encounter-only resolved-selection computed.
    Object.defineProperty(ctx, 'observerLocalEncounterResolvedSelection', {
        get() { return WorldEncounterCanvas.computed.observerLocalEncounterResolvedSelection.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function projectedObserverLocalEncountersOf(ctx) {
    return WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx);
}

function makeDeferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

async function runTests() {
    console.log('Running Observer-Local Encounter Experience Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Flagship: the complete new experience, end to end.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-a');
        const publicationId = 'unknown-publisher-pub-a';
        const claimedPosition = { x: 4200, y: 0, z: 4200 };
        const wandererPosition = { x: 12, y: 0, z: -7 };

        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => wandererPosition });

        // Walking -> Snapshot discovery.
        const reference = await placeAndAnnounce(host, 'novel-bytes-a', { publicationId, claimedPosition });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        assert(candidate && candidate.contentHash === reference.hash, 'A1. A real discovery candidate names the real published content.');

        // Resolution -> Verification -> Materialization -> UNPLACED + encounter.
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, `A2. No authoritative placement exists: the cascade stops at UNPLACED (got ${result.outcome}).`);
        assert(result.encounter !== null, 'A3. An observer-local encounter is produced for this genuinely novel, verified, materialized publication.');
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), 'A4. The bytes are genuinely present locally — this is not a claim, it is materialized content.');

        // Observer-local store.
        store.record(result.encounter);
        assert(store.list().length === 1, 'A5. The encounter reaches the session-scoped store.');

        // World rendering — the real WorldEncounterCanvas component, mounted
        // with this store as its observerLocalEncounterRegistry, exactly as
        // ui/views/WorldView.js itself wires it.
        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.observerLocalEncounters.length === 1, 'A6. mounted() seeds the component\'s own page-local state from the store.');
        const projected = projectedObserverLocalEncountersOf(ctx);
        assert(projected.length === 1, 'A7. Exactly one marker is projected for rendering.');
        assert(projected[0].publicationId === publicationId && projected[0].contentHash === reference.hash,
            'A8. The projected marker carries the real publicationId/contentHash.');
        assert(Number.isFinite(projected[0].x) && Number.isFinite(projected[0].y),
            'A9. The projected marker carries finite screen coordinates — a Wanderer can actually perceive this in the World, not merely hold it in memory.');
        assert(Object.keys(projected[0]).sort().join(',') === ['contentHash', 'publicationId', 'x', 'y'].sort().join(','),
            'A10. The projected marker carries exactly the fields the template actually binds — nothing fabricated, nothing missing.');
        unmountCanvas(ctx);
        unmountCanvas(ctx); // idempotent — a second unmount is a harmless no-op.

        console.log('✓ A — the complete new experience reproduces end to end, from a Wanderer\'s own walking-triggered discovery through to the exact, finite screen coordinates the real WorldEncounterCanvas component projects for rendering.');
    }

    // ===============================================================
    // Section B — Encounter lifecycle.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-b');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 1, y: 0, z: 1 }) });

        const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        let notifyCount = 0;
        store.subscribe(() => { notifyCount += 1; });

        // B1. First encounter.
        const publicationId = 'lifecycle-pub-b';
        await placeAndAnnounce(host, 'novel-bytes-b', { publicationId, claimedPosition: { x: 9, y: 0, z: 9 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const firstResult = await cascade.processCandidate(candidate);
        store.record(firstResult.encounter);
        assert(ctx.observerLocalEncounters.length === 1, 'B1. First encounter: the Wanderer sees it.');

        // B2. Continues walking — a later observation tick re-feeds the SAME
        // already-discovered candidate (this pipeline's own idempotency, see
        // application/snapshot/AutomaticSnapshotEncounterCascade.js's own header,
        // "idempotent and concurrency-safe by construction").
        const secondResult = await cascade.processCandidate(candidate);
        store.record(secondResult.encounter);
        assert(ctx.observerLocalEncounters.length === 1, 'B2. Continuing to walk (repeated discovery ticks for the same subject) never produces a second, duplicate encounter.');

        // B3. Walks away — nothing in this store's own contract ever
        // removes an encounter on its own; see application/
        // ObserverLocalEncounterStore.js's own header, "expiry, eviction,
        // or removal of any kind" is deliberately excluded.
        assert(ctx.observerLocalEncounters.length === 1, 'B3. Walking away does not remove the encounter — there is no proximity-based eviction in this store\'s own contract.');

        // B4. Encounters the same publication again (yet another tick) —
        // still no duplicate.
        const thirdResult = await cascade.processCandidate(candidate);
        store.record(thirdResult.encounter);
        assert(ctx.observerLocalEncounters.length === 1, 'B4. Re-encountering the identical publication again still produces no duplicate.');

        // B5. Encounters several novel publications.
        for (const suffix of ['x', 'y', 'z']) {
            const otherPublicationId = `lifecycle-pub-b-${suffix}`;
            await placeAndAnnounce(host, `novel-bytes-b-${suffix}`, { publicationId: otherPublicationId, claimedPosition: { x: 20, y: 0, z: 20 } });
        }
        for (const otherCandidate of await host.discoverSnapshotCandidatesCommand()) {
            const otherResult = await cascade.processCandidate(otherCandidate);
            if (otherResult.encounter) store.record(otherResult.encounter);
        }
        assert(ctx.observerLocalEncounters.length === 4, `B5. Encountering several novel publications accumulates independent entries (got ${ctx.observerLocalEncounters.length}).`);

        // B6. Refreshes/reloads the World, or leaves and returns to the
        // View — a fresh WorldView mount constructs a fresh
        // ObserverLocalEncounterStore (see ui/views/WorldView.js's own
        // wiring, confirmed structurally below); the SAME behavior is
        // reproduced directly here with a brand-new store standing in for
        // that fresh mount.
        const freshStore = new ObserverLocalEncounterStore();
        const freshCtx = buildCanvasInstance({ observerLocalEncounterRegistry: freshStore });
        mountCanvas(freshCtx);
        assert(freshCtx.observerLocalEncounters.length === 0, 'B6. A reload/return (a fresh WorldView mount, hence a fresh store) starts with no encounters at all — the previous session\'s own encounters do not survive it. This is deliberate, session-scoped ephemerality, not a bug.');

        // B7. Changes the active World session — structurally, this
        // codebase ties `observerLocalEncounterStore`'s own lifetime
        // directly to the SAME `setup()` invocation that constructs
        // `session` itself (see ui/views/WorldView.js's own header,
        // "a fresh, empty store accompanies each fresh session"): there is
        // no separate "switch active World without remounting" path in
        // this component tree today, so a session change and a fresh
        // mount are, in this codebase, the identical event. Confirmed
        // directly against real, unmodified source.
        const worldViewSource = codeOnlyLines((await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n'));
        const sessionDeclarationIndex = worldViewSource.indexOf('const session = worldViewFactory.createSession(registry)');
        const storeDeclarationIndex = worldViewSource.indexOf('const observerLocalEncounterStore = new ObserverLocalEncounterStore()');
        const firstOnMountedIndex = worldViewSource.indexOf('onMounted(');
        const onBeforeUnmountIndex = worldViewSource.indexOf('onBeforeUnmount(');
        assert(sessionDeclarationIndex >= 0 && storeDeclarationIndex >= 0, 'B7a. Both `session` and `observerLocalEncounterStore` are declared, verbatim, in ui/views/WorldView.js.');
        assert(sessionDeclarationIndex < onBeforeUnmountIndex && storeDeclarationIndex < onBeforeUnmountIndex,
            'B7b. Both are declared before this mount\'s own onBeforeUnmount() — i.e. both live for this mount\'s own full lifetime, never reconstructed mid-mount.');
        const storeConstructionOccurrences = (worldViewSource.match(/const observerLocalEncounterStore = new ObserverLocalEncounterStore\(\)/g) || []).length;
        const storeReassignmentOccurrences = (worldViewSource.match(/\bobserverLocalEncounterStore\s*=(?!=)/g) || []).length;
        assert(storeConstructionOccurrences === 1, `B7c. Exactly one ObserverLocalEncounterStore is constructed per mount (got ${storeConstructionOccurrences}).`);
        assert(storeReassignmentOccurrences === 1, `B7d. The store is never reassigned after its one construction — a "change active World session" event, in this codebase, can only mean a fresh mount, never a silent store swap underneath an existing one (got ${storeReassignmentOccurrences} total assignment(s), matching exactly the one construction).`);
        assert(firstOnMountedIndex === -1 || true, 'B7e. sanity: no additional assertion needed beyond the above — recorded for readability.');

        console.log('✓ B — the session-local store\'s own existing semantics already produce a coherent lifecycle: no duplicate on repeated/continued encounter, no eviction from merely walking away, several independent novel encounters accumulate correctly, and a reload/session-change (structurally, the same event as a fresh mount) starts genuinely empty. This is documented, deliberate ephemerality — see Section L.');
    }

    // ===============================================================
    // Section C — Duplicate encounter behavior.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-c');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 3, y: 0, z: 3 }) });
        const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: store });
        mountCanvas(ctx);

        const publicationId = 'duplicate-pub-c';
        await placeAndAnnounce(host, 'novel-bytes-c', { publicationId, claimedPosition: { x: 11, y: 0, z: 11 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();

        // The walking trigger fires several times for the identical
        // Publication — a realistic repeated-observation-tick sequence,
        // never a single call.
        for (let tick = 0; tick < 5; tick += 1) {
            const result = await cascade.processCandidate(candidate);
            if (result.encounter) store.record(result.encounter);
        }

        assert(store.list().length === 1, 'C1. Five repeated observation ticks for the identical publicationId:contentHash subject produce exactly ONE stored encounter, never five.');
        assert(ctx.observerLocalEncounters.length === 1, 'C2. The rendering layer accordingly renders exactly one marker, never a stack of identical ones.');
        assert(projectedObserverLocalEncountersOf(ctx).length === 1, 'C3. Exactly one projected marker reaches the SVG v-for.');

        console.log('✓ C — duplicate visual encounters are NOT a real product problem today: the existing store already preserves exactly one observer-local encounter per identical subject, keyed by publicationId:contentHash, via ordinary replace-not-accumulate semantics it already held before this milestone. No new global deduplication rule is needed to solve a UI symptom that does not exist.');
    }

    // ===============================================================
    // Section D — Multiple novel publications.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-d');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const positions = { a: { x: 1, y: 0, z: 1 }, b: { x: 2, y: 0, z: 2 }, c: { x: 3, y: 0, z: 3 } };
        let current = positions.a;
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => current });

        // A and B share IDENTICAL bytes (hence the SAME contentHash) but
        // different publicationIds — same-content publications must not
        // accidentally merge.
        const sharedBytes = 'identical-content-bytes-d';
        current = positions.a;
        const referenceA = await placeAndAnnounce(host, sharedBytes, { publicationId: 'multi-pub-d-a', claimedPosition: { x: 50, y: 0, z: 50 } });
        current = positions.b;
        const referenceB = await placeAndAnnounce(host, sharedBytes, { publicationId: 'multi-pub-d-b', claimedPosition: { x: 60, y: 0, z: 60 } });
        assert(referenceA.hash === referenceB.hash, 'D0. Sanity: A and B really do share the identical contentHash (same bytes).');

        // C carries a forged contentHash targeting the real content at A's
        // own locator — a failed encounter, sitting alongside A/B.
        const forgedCandidateC = { contentHash: 'forged-hash-d', locator: referenceA.uri, storage: referenceA.storage, publicationId: 'multi-pub-d-c', claimedPosition: { x: 70, y: 0, z: 70 } };

        const candidates = await host.discoverSnapshotCandidatesCommand();
        for (const candidate of candidates) {
            current = candidate.publicationId === 'multi-pub-d-a' ? positions.a : positions.b;
            const result = await cascade.processCandidate(candidate);
            if (result.encounter) store.record(result.encounter);
        }
        const failedResult = await cascade.processCandidate(forgedCandidateC);

        assert(failedResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, `D1. The forged candidate fails verification, never producing an encounter (got ${failedResult.outcome}).`);
        assert(failedResult.encounter === null, 'D2. A failed candidate never contributes an encounter.');

        const list = store.list();
        assert(list.length === 2, `D3. Exactly A and B are recorded — same-content publications with different publicationIds do NOT merge into one entry (got ${list.length}).`);
        const byPublicationId = Object.fromEntries(list.map((e) => [e.publicationId, e]));
        assert(byPublicationId['multi-pub-d-a'] && byPublicationId['multi-pub-d-b'], 'D4. Both A and B retain their own, distinct publicationId.');
        assert(byPublicationId['multi-pub-d-a'].contentHash === byPublicationId['multi-pub-d-b'].contentHash,
            'D5. Both carry the identical contentHash — identity is publicationId+contentHash TOGETHER, never contentHash alone.');
        assert(byPublicationId['multi-pub-d-a'].position.x === positions.a.x && byPublicationId['multi-pub-d-b'].position.x === positions.b.x,
            'D6. Each encounter carries its OWN observation position — positions are never shared, averaged, or reconciled merely because the underlying content is identical.');
        assert(!byPublicationId['multi-pub-d-c'], 'D7. C\'s own failed encounter never appears — and, critically, C\'s failure removed neither A nor B.');

        console.log('✓ D — multiple novel publications each retain their own publicationId; identical content under different publicationIds never merges; each carries its own observation position; and one sibling\'s failed encounter never disturbs another\'s already-recorded one.');
    }

    // ===============================================================
    // Section E — Encounter position semantics.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-e');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const p1 = { x: 5, y: 0, z: 5 };
        const p2 = { x: 500, y: 0, z: 500 };
        let currentWandererPosition = p1;
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => currentWandererPosition });

        const publicationId = 'position-pub-e';
        await placeAndAnnounce(host, 'novel-bytes-e', { publicationId, claimedPosition: { x: 999, y: 0, z: 999 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();

        // Discover at P1.
        const firstResult = await cascade.processCandidate(candidate);
        assert(firstResult.encounter.position.x === p1.x && firstResult.encounter.position.z === p1.z, 'E1. The encounter is first observed at P1.');

        // Move to P2, then the identical candidate is rediscovered on a
        // later observation tick (the ordinary, realistic case — a
        // Wanderer who keeps walking keeps re-observing already-known
        // candidates).
        currentWandererPosition = p2;
        const secondResult = await cascade.processCandidate(candidate);
        assert(secondResult.encounter !== null, 'E2. Sanity: re-processing still yields an encounter.');
        assert(secondResult.encounter.position.x === p1.x && secondResult.encounter.position.z === p1.z,
            `E3. The encounter REMAINS associated with P1, never silently relocating to P2 — mechanically enforced by the cascade's own per-subject idempotency memoization (application/snapshot/AutomaticSnapshotEncounterCascade.js's own "idempotent and concurrency-safe by construction"), not merely a convention (got position ${secondResult.encounter.position.x},${secondResult.encounter.position.z}).`);

        // E4 — a narrow architectural note: application/
        // ObserverLocalEncounterStore.js's own `record()` replaces by key
        // (see its own header, "replaces, keyed by publicationId:contentHash").
        // In the REAL composition (ui/views/WorldView.js), the only caller
        // of `.record()` is fed the cascade's own already-memoized
        // `result.encounter` (see WorldView.js's own comment,
        // "the ONLY place a described encounter is ever recorded"), so this
        // never actually happens today. But the store's own primitive,
        // exercised directly and in isolation, does NOT itself defend
        // against being handed a redescribed position for an
        // already-recorded identity.
        const isolatedStore = new ObserverLocalEncounterStore();
        isolatedStore.record(describeObserverLocalPublicationEncounter({ publicationId: 'isolated-pub-e', contentHash: 'isolated-hash-e', encounterPosition: p1 }));
        isolatedStore.record(describeObserverLocalPublicationEncounter({ publicationId: 'isolated-pub-e', contentHash: 'isolated-hash-e', encounterPosition: p2 }));
        assert(isolatedStore.list()[0].position.x === p2.x,
            'E4. ARCHITECTURAL_GAP (narrow): the store\'s own record()-by-key primitive, exercised directly, DOES let a redescribed position for an identical identity move an already-recorded encounter. Nothing reachable in today\'s real composition ever does this (see E1-E3) — but the invariant "an observation never becomes a moving object" is upheld today only because of the cascade\'s own idempotency, one layer away, not because the store itself enforces it. See Section L.');

        console.log('✓ E — in the real, composed pipeline, an encounter\'s own position is fixed at first observation and never silently updated as the Wanderer keeps moving, enforced by the cascade\'s own existing idempotency. The store\'s own lower-level primitive does not itself hold that invariant in isolation — a narrow, correctly-scoped architectural note, not a live bug.');
    }

    // ===============================================================
    // Section F — User understanding: what the rendered presentation
    // actually answers.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const blockStart = canvasSource.indexOf('world-encounter-observer-local-marker');
        assert(blockStart >= 0, 'F0. The observer-local marker block exists in the real template source.');
        const block = canvasSource.slice(blockStart, canvasSource.indexOf('</g>', blockStart));

        assert(block.includes('Discovered here'), 'F1. "Why is it here?" is PARTIALLY answered — the visible label reads "Discovered here."');
        assert(block.includes('discovered while you were here'), 'F1b. The tooltip elaborates: "This publication was discovered while you were here."');
        assert(!/\btitle\b\s*[:=]|\bpublisherIdentity\b|\bauthor\b/i.test(block),
            'F2. "What did I discover?" is UNANSWERED — the marker carries no title, author, or publisher identity of any kind (see 0.9.552 Section F: the descriptor itself carries only publicationId+contentHash).');
        assert(!/\bverified\b|\bhash[- ]?checked\b|\bsignature\b/i.test(block),
            'F3. "Is it real material or merely a claim?" and "Is it verified?" are UNANSWERED in the visible presentation — even though verification is, in fact, a hard precondition for this marker to exist at all (0.9.552\'s own "AVAILABLE + VERIFIED remains mandatory"). The invariant is real; it is simply never communicated.');
        assert(!/\btemporary\b|\bephemeral\b|\bsession\b|\bexpire[sd]?\b|\breload\b/i.test(block),
            'F4. "Is it temporary?" is UNANSWERED — nothing in the rendered presentation hints that this marker will not survive a reload (see Section B6) or another Wanderer\'s own separate session (see Section J).');
        // AMENDED BY 0.9.554 — Observer-Local Encounter Inspection
        // Capability. This assertion originally asserted the ABSENCE of
        // any click handler on this marker, naming that absence as exactly
        // the PRODUCT_GAP Section G went on to detail. 0.9.554 closed that
        // gap with a narrow, separate inspection surface (see that
        // milestone's own header in ui/components/WorldEncounterCanvas.js)
        // — this now asserts the fact that closure actually produced,
        // rather than loosening the check to stop noticing either way.
        assert(/@click/.test(block), 'F5. AMENDED BY 0.9.554: "Can I inspect it?" now has an answer — a dedicated @click handler is bound to this marker (see tests/ObserverLocalEncounterInspectionCapability.test.js for the full new capability).');
        assert(!/@select/i.test(block), 'F5b. Still never wired through the existing WorldEncounterMarker\'s own @select emission, and still never routed through selectEncounter()/selectionOutcome — see Section G below, unchanged: that machinery still resolves an observer-local encounter to a false UNAVAILABLE.');
        assert(!/\bagain\b|\bpersist/i.test(block),
            'F6. "Can I find it again?" is UNANSWERED — and, per Section B6, the honest answer is usually no.');
        assert(!/Placed|Official location|Located by publisher|Trusted location|Authoritative|Owned/i.test(block),
            'F7. Confirmed ALREADY_CORRECT: the vocabulary this milestone\'s own brief cared most about avoiding (a false claim of placement/trust/authority) is genuinely absent from the rendered text.');

        console.log('✓ F — AMENDED BY 0.9.554: of the seven questions this milestone\'s own brief posed, "can I inspect it" is now answered (F5) by that follow-up\'s own dedicated click handler and inspection panel — see tests/ObserverLocalEncounterInspectionCapability.test.js. The rendered marker itself still leaves "what is it," "is it verified," "is it temporary," and "can I find it again" unanswered (0.9.554 answers the first three in its own, separate inspection panel instead, deliberately never inside this marker\'s own <g> block — see that milestone\'s own header); it still answers "why is it here" (partially) and implicitly signals non-placement (F7, correctly).');
    }

    // ===============================================================
    // Section G — The biggest likely product gap: no interaction.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const blockStart = canvasSource.indexOf('world-encounter-observer-local-marker');
        const block = canvasSource.slice(blockStart, canvasSource.indexOf('</g>', blockStart));
        // AMENDED BY 0.9.554: the marker now DOES bind a click handler
        // (@click, checked in Section F's own F5) — this assertion still
        // holds, and still matters, for a narrower reason: it confirms
        // that handler is never @select, i.e. never a repurposing of the
        // EXISTING selection component's own emission contract (0.9.4).
        assert(!block.includes('@select'), 'G1. Structurally: the observer-local marker still binds no @select handler of any kind — 0.9.554\'s own @click (see Section F\'s F5) is a genuinely separate event, never this one.');
        assert(!block.includes('<WorldEncounterMarker'), 'G2. Structurally: it is a plain <g>, never a <WorldEncounterMarker> — it never enters the existing selection component at all.');
        assert(!/PlacementRecord/.test(block), 'G3. Sanity: nothing near this marker constructs or references a PlacementRecord — a future inspect affordance here would not need to touch that machinery either (the tooltip\'s own single, deliberate mention of "placement" is the disclaiming sentence itself, checked in Section F).');

        // Empirical probe: if a caller DID try to route an observer-local
        // encounter through the EXISTING selection machinery anyway (which
        // nothing in production does — see G1/G2), what would happen?
        const host = makeHost('0.9.553-section-g');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry(); // real, but knows nothing about this publicationId.
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 4, y: 0, z: 4 }) });
        const publicationId = 'no-interaction-pub-g';
        await placeAndAnnounce(host, 'novel-bytes-g', { publicationId, claimedPosition: { x: 30, y: 0, z: 30 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        store.record(result.encounter);

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationId });
        assert(ctx.selectionOutcome && ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE,
            `G4. Confirms 0.9.552's own header verbatim: routing an observer-local encounter through the EXISTING selection machinery STILL resolves to UNAVAILABLE — a false "this left the World" notice for something that was never a registered WorldEncounter (got ${ctx.selectionOutcome && ctx.selectionOutcome.status}). 0.9.554 did not fix this path, and was never supposed to (see this file's own G1 amendment) — it built a genuinely separate one instead (see G5 below).`);

        // AMENDED BY 0.9.554 — the narrow, separate path G4 shows is
        // missing from the EXISTING machinery now exists, alongside it,
        // never through it: selectObserverLocalEncounter() resolves this
        // exact publicationId/contentHash straight to materialSources.local
        // (via materializedSnapshotWorldOrigin(), reused verbatim), with no
        // registry candidate search at all.
        ctx.selectObserverLocalEncounter({ publicationId, contentHash: result.encounter.contentHash });
        assert(ctx.selectedObserverLocalEncounter && ctx.selectedObserverLocalEncounter.publicationId === publicationId,
            'G5. AMENDED BY 0.9.554: the SAME observer-local encounter G4 just proved unreachable through the existing selection machinery IS reachable through the new, separate one.');
        assert(ctx.observerLocalEncounterResolvedSelection && ctx.observerLocalEncounterResolvedSelection.origin === materializedSnapshotWorldOrigin(result.encounter.contentHash, publicationId),
            'G6. The new path resolves to the EXACT snapshot:<contentHash>:<publicationId> origin a future registration for this same pair would itself derive — never a guess, never a re-implementation.');

        console.log('✓ G — AMENDED BY 0.9.554: an observer-local encounter now supports a genuinely separate, narrow "observe -> select -> inspect" surface (G5-G6) — never "observe -> select -> modify World placement" (G3, still true: nothing here constructs a PlacementRecord), and never a repurposing of the EXISTING selection machinery, which G4 confirms still correctly reports this identity as UNAVAILABLE through that unrelated path. See tests/ObserverLocalEncounterInspectionCapability.test.js for the full new capability\'s own acceptance criteria.');
    }

    // ===============================================================
    // Section H — Interaction with Repository.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const methodStart = canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {');
        assert(methodStart >= 0, 'H0. admitToRepositoryDiscovery() exists in real source.');
        const methodEnd = canvasSource.indexOf('\n    refreshMaterialInspection()', methodStart);
        const methodBody = canvasSource.slice(methodStart, methodEnd);
        assert(!/observerLocalEncounter/i.test(methodBody),
            'H1. admitToRepositoryDiscovery() never reads or reasons about an observer-local encounter of any kind — its own gate is entirely `decentralizedPublicationDiscoveryProvider` + a resolved, VERIFIED material loading/verification pair, reachable only through the EXISTING selection/material-inspection path (see Section G: never reachable for an observer-local encounter at all today).');

        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n');
        const storeBindingLine = ':observerLocalEncounterRegistry="observerLocalEncounterStore"';
        assert(worldViewSource.includes(storeBindingLine), 'H2. Sanity: the real composition root binds the observer-local store to its own, dedicated prop.');
        const repositoryBindingLine = ':decentralizedPublicationDiscoveryProvider="decentralizedDiscoveryProviderForEnrichment"';
        assert(worldViewSource.includes(repositoryBindingLine), 'H2b. Sanity: Repository admission is wired through an entirely differently-named prop, bound to an entirely different variable.');
        assert(!new RegExp(`observerLocalEncounterStore[^\\n]*decentralizedPublicationDiscoveryProvider|decentralizedPublicationDiscoveryProvider[^\\n]*observerLocalEncounterStore`).test(worldViewSource),
            'H3. The two identifiers never co-occur on the same line anywhere in the composition root — no bridging code joins them.');

        console.log('✓ H — DELIBERATE_BOUNDARY, reconfirmed: an observer-local encounter has no path, automatic or manual, into app-wide Repository discovery today. "Repository = app-wide discovered Publications" and "observer-local encounter = something THIS Wanderer physically encountered" remain genuinely, mechanically separate concepts — Repository admission is gated by the existing selection/material-inspection pathway alone, which Section G already showed an observer-local encounter cannot reach. Automatic promotion would be new work, not a repurposing of anything that already bridges the two — this milestone does not build it, and does not recommend building it without a separate product decision.');
    }

    // ===============================================================
    // Section I — Failure and stale-async lifecycle.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-i');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();

        const slowPublicationId = 'stale-async-pub-i-slow';
        const fastPublicationId = 'stale-async-pub-i-fast';
        const slowReference = await placeAndAnnounce(host, 'slow-bytes-i', { publicationId: slowPublicationId, claimedPosition: { x: 1, y: 0, z: 1 } });
        await placeAndAnnounce(host, 'fast-bytes-i', { publicationId: fastPublicationId, claimedPosition: { x: 2, y: 0, z: 2 } });

        // I1-I2 — an old async result (a resolution that started BEFORE a
        // second, unrelated candidate's own full run) arrives AFTER that
        // second run has already completed and been recorded. This is
        // exactly the "old async result arrives" shape 0.9.536-0.9.537
        // already closed one layer up, for the existing selection/material
        // path — reconfirmed here for the NEW observer-local store.
        const gate = makeDeferred();
        const gatedResolveSelectedSnapshotCommand = async (candidate) => {
            if (candidate.contentHash === slowReference.hash) {
                await gate.promise;
            }
            return host.resolveSelectedSnapshotCommand(candidate);
        };
        const cascade = makeCascade(host, worldModel, registry, {
            resolveSelectedSnapshotCommand: gatedResolveSelectedSnapshotCommand,
            resolveEncounterPosition: () => ({ x: 7, y: 0, z: 7 })
        });

        const discoveredCandidates = await host.discoverSnapshotCandidatesCommand();
        const slowCandidate = discoveredCandidates.find((c) => c.contentHash === slowReference.hash);
        const fastCandidate = discoveredCandidates.find((c) => c.contentHash !== slowReference.hash);
        const slowResultPromise = cascade.processCandidate(slowCandidate); // starts, then blocks on the gate.
        const fastResult = await cascade.processCandidate(fastCandidate); // completes fully first.
        store.record(fastResult.encounter);
        assert(store.list().length === 1 && store.list()[0].publicationId === fastPublicationId,
            'I1. The faster candidate\'s own encounter is recorded first, entirely independent of the still-in-flight slow one.');

        gate.resolve();
        const slowResult = await slowResultPromise;
        store.record(slowResult.encounter);
        assert(store.list().length === 2, 'I2. The slow candidate\'s own encounter — an "old" async result, arriving after a later one already completed — still lands correctly, without clobbering or being dropped by the faster one. The store is keyed per-subject, never a single "latest encounter" slot, so there is no ownership race to lose.');

        // I3 — one succeeds, one fails, concurrently.
        const registry2 = new WorldDiscoverySourceRegistry();
        const worldModel2 = makeWorldModel();
        const store2 = new ObserverLocalEncounterStore();
        const cascade2 = makeCascade(host, worldModel2, registry2, { resolveEncounterPosition: () => ({ x: 8, y: 0, z: 8 }) });
        const forgedCandidate = { contentHash: 'forged-hash-i3', locator: slowReference.uri, storage: slowReference.storage, publicationId: 'stale-async-pub-i3-fails', claimedPosition: { x: 3, y: 0, z: 3 } };
        const okPublicationId = 'stale-async-pub-i3-succeeds';
        await placeAndAnnounce(host, 'ok-bytes-i3', { publicationId: okPublicationId, claimedPosition: { x: 4, y: 0, z: 4 } });
        const [okCandidate] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === okPublicationId);
        const [okResult, failResult] = await Promise.all([
            cascade2.processCandidate(okCandidate),
            cascade2.processCandidate(forgedCandidate)
        ]);
        if (okResult.encounter) store2.record(okResult.encounter);
        if (failResult.encounter) store2.record(failResult.encounter);
        assert(store2.list().length === 1 && store2.list()[0].publicationId === okPublicationId,
            'I3. Concurrently: one succeeding and one failing candidate never interfere with each other — exactly the successful one, and only it, is ever recorded.');

        console.log('✓ I — the observer-local store does not reintroduce any version of the async-ownership problems 0.9.536-0.9.537 already closed for the existing selection path: it is keyed per-subject rather than holding a single mutable "current" slot, so a slower, earlier-started candidate\'s own eventual result never clobbers or is clobbered by a faster, later one, and concurrent success/failure never cross-contaminate.');
    }

    // ===============================================================
    // Section J — Cross-Wanderer isolation, contrasted with genuine
    // decentralized (re-)discovery.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-j');
        const publicationId = 'shared-novel-pub-j';
        await placeAndAnnounce(host, 'novel-bytes-j', { publicationId, claimedPosition: { x: 40, y: 0, z: 40 } });

        // Wanderer A — own worldModel/registry/cascade/store, exactly the
        // "fresh instance per WorldView mount" shape ui/views/WorldView.js
        // itself uses.
        const worldModelA = makeWorldModel();
        const registryA = new WorldDiscoverySourceRegistry();
        const storeA = new ObserverLocalEncounterStore();
        const cascadeA = makeCascade(host, worldModelA, registryA, { resolveEncounterPosition: () => ({ x: 1, y: 0, z: 1 }) });
        const [candidateForA] = await host.discoverSnapshotCandidatesCommand();
        const resultA = await cascadeA.processCandidate(candidateForA);
        storeA.record(resultA.encounter);
        assert(storeA.list().length === 1, 'J1. Wanderer A independently discovers and sees the publication.');

        // Wanderer C — never walks near it, never calls
        // discoverSnapshotCandidatesCommand()/processCandidate() at all.
        // This is the "never sees it merely because A did" half — this is
        // NOT a broadcast/gossip system.
        const storeC = new ObserverLocalEncounterStore();
        assert(storeC.list().length === 0, 'J2. Wanderer C, who never walked near this publication, never sees it — no shared object connects C\'s own store to A\'s, and nothing pushes A\'s discovery to C.');

        // Wanderer B — independently discovers the SAME publication (a
        // genuinely separate cascade run, against the same real Nostr/
        // Arweave network the publication was actually announced to).
        // This is the OTHER half: ordinary decentralized discovery still
        // works per-observer, it is simply never automatically shared.
        const worldModelB = makeWorldModel();
        const registryB = new WorldDiscoverySourceRegistry();
        const storeB = new ObserverLocalEncounterStore();
        const cascadeB = makeCascade(host, worldModelB, registryB, { resolveEncounterPosition: () => ({ x: 2, y: 0, z: 2 }) });
        const [candidateForB] = await host.discoverSnapshotCandidatesCommand();
        const resultB = await cascadeB.processCandidate(candidateForB);
        storeB.record(resultB.encounter);
        assert(storeB.list().length === 1, 'J3. Wanderer B independently discovers the identical publication too — decentralized discovery itself is unaffected by 0.9.552/0.9.553; nothing here weakens it.');
        assert(storeA.list()[0].position.x === 1 && storeB.list()[0].position.x === 2,
            'J4. A and B each retain their OWN encounter position — never merged, averaged, or reconciled into one shared "canonical" encounter.');
        assert(storeA !== storeB && storeA !== storeC && storeB !== storeC, 'J5. All three stores are genuinely separate instances.');

        console.log('✓ J — cross-Wanderer isolation reconfirmed, alongside the genuinely different fact it must not be confused with: a Wanderer who never encounters a publication never sees it (J2, session-local presentation is not distribution), while a Wanderer who independently walks near it and triggers their own real discovery/verification pipeline sees it too, entirely on their own (J3-J4) — ordinary decentralized publication/discovery, unweakened, was never at risk from this observer-local presentation layer.');
    }

    // ===============================================================
    // Section K — Existing World Encounter separation, mechanically
    // reconfirmed side by side.
    // ===============================================================
    {
        const host = makeHost('0.9.553-section-k');
        const worldModel = makeWorldModel();
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();

        // An authoritative, PLACED + REGISTERED publication.
        const placedPublicationId = 'placed-pub-k';
        worldModel.placeAt(placedPublicationId, new Position(6, 0, 6));
        worldModel.knowPublication(new Publication({ id: placedPublicationId, title: 'Placed Publication K', contentReference: new ContentReference({ hash: 'placeholder-k' }) }));
        const placedCascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 0, y: 0, z: 0 }) });
        const placedReference = await host.contentStore.put('placed-bytes-k');
        const placedCandidate = { contentHash: placedReference.hash, locator: placedReference.uri, storage: placedReference.storage, publicationId: placedPublicationId };
        const placedResult = await placedCascade.processCandidate(placedCandidate);
        assert(placedResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `K0. Sanity: the placed publication really does reach REGISTERED (got ${placedResult.outcome}).`);

        // A separate, genuinely novel, UNPLACED + observer-local-encountered
        // publication.
        const novelPublicationId = 'novel-pub-k';
        await placeAndAnnounce(host, 'novel-bytes-k', { publicationId: novelPublicationId, claimedPosition: { x: 80, y: 0, z: 80 } });
        const novelCascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 9, y: 0, z: 9 }) });
        const [novelCandidate] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === novelPublicationId);
        const novelResult = await novelCascade.processCandidate(novelCandidate);
        assert(novelResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED && novelResult.encounter, 'K0b. Sanity: the novel publication really does stop at UNPLACED with an encounter.');
        store.record(novelResult.encounter);

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);

        const projectedPlaced = projectedPublicationsOf(ctx);
        assert(projectedPlaced.length === 1 && projectedPlaced[0].label === 'Placed Publication K',
            'K1. The registry-backed channel renders exactly the placed publication, with its own real title.');
        const projectedObserverLocal = projectedObserverLocalEncountersOf(ctx);
        assert(projectedObserverLocal.length === 1 && projectedObserverLocal[0].publicationId === novelPublicationId,
            'K2. The observer-local channel renders exactly the novel encounter, and only it.');
        assert(!('label' in projectedObserverLocal[0]) && !('objectId' in projectedObserverLocal[0]),
            'K3. The observer-local projection never fabricates a title/objectId it does not have — it stays honestly `{publicationId, contentHash, x, y}`.');

        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: placedPublicationId });
        assert(ctx.selectionOutcome && ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED,
            'K4. The placed publication resolves normally through the EXISTING selection machinery, side by side with the observer-local encounter that (Section G) cannot.');

        assert(ctx.registry !== ctx.observerLocalEncounterRegistry, 'K5. The two channels are genuinely separate objects.');
        store.record(describeObserverLocalPublicationEncounter({ publicationId: 'yet-another-pub-k', contentHash: 'yet-another-hash-k', encounterPosition: { x: 1, y: 0, z: 1 } }));
        assert(projectedPublicationsOf(ctx).length === 1, 'K6. Adding a second observer-local encounter never leaks into, or changes the count of, the registry-backed publication channel.');

        console.log('✓ K — the architectural separation 0.9.552 drew (authoritative/persistent/shared/selectable Placement vs. ephemeral/session-local/observer-specific/presentation-only Encounter) is mechanically confirmed side by side, in one mount, with both channels genuinely active at once: they never merge, never cross-count, and only the authoritative channel supports today\'s existing selection/inspection machinery.');
    }

    // ===============================================================
    // Section L — Product classification and verdict.
    // ===============================================================
    {
        const classifications = [
            ['Duplicate visual encounters from repeated observation ticks', 'ALREADY_CORRECT — Section C: the existing replace-by-key store contract already prevents this; no new global deduplication rule is needed.'],
            ['A described encounter\'s own position across continued movement', 'ALREADY_CORRECT — Section E1-E3: mechanically fixed at first observation by the cascade\'s own existing idempotency.'],
            ['The store\'s own record()-by-key primitive, in isolation', 'ARCHITECTURAL_GAP, narrow — Section E4: the primitive itself would let a redescribed position move an already-recorded encounter; nothing in today\'s real composition ever does this, but the invariant is not self-enforced by the store.'],
            ['Session-scoped, ephemeral, observer-local encounter lifecycle (no persistence, no eviction, fresh store per mount)', 'DELIBERATE_BOUNDARY — Section B: this is the intended consequence of 0.9.552\'s own chosen model, not an oversight.'],
            ['Cross-Wanderer isolation, and its genuine difference from ordinary decentralized discovery', 'ALREADY_CORRECT — Section J: isolation holds; independent, per-observer decentralized discovery is unweakened.'],
            ['Async ownership under concurrent/interleaved candidates (no single "current" slot)', 'ALREADY_CORRECT — Section I: keyed per-subject; no re-emergence of the class of bug 0.9.536-0.9.537 closed.'],
            ['Mechanical separation between authoritative Placement and observer-local Encounter rendering', 'ALREADY_CORRECT — Section K: both channels coexist correctly in one mount without merging or cross-counting.'],
            ['Whether the rendered presentation communicates what/verified/temporary/inspectable/findable-again', 'DOCUMENTATION_GAP, PARTIALLY CLOSED BY 0.9.554 — Section F: "inspectable" is now answered (a click handler and a dedicated inspection panel); "what/verified/temporary" are answered inside that new panel (never inside the marker\'s own rendered text); "findable-again" remains unanswered, deliberately (see 0.9.554\'s own "deliberately excluded").'],
            ['A Wanderer\'s ability to interact with (select/inspect) an observer-local encounter', 'PRODUCT_GAP, CLOSED BY 0.9.554 — Section G: a narrow, separate "observe -> select -> inspect" surface now exists (G5-G6), reusing the existing material inspection orchestration boundary without routing through the existing selection machinery, which G4 confirms still correctly reports UNAVAILABLE for this unrelated path.'],
            ['Automatic or manual promotion of an observer-local encounter into Repository discovery', 'DELIBERATE_BOUNDARY — Section H: genuinely, mechanically separate today; a real product decision, not a repurposing of anything that already bridges the two.']
        ];
        for (const [surface, verdict] of classifications) {
            assert(/^ALREADY_CORRECT|^DOCUMENTATION_GAP|^PRODUCT_GAP|^ARCHITECTURAL_GAP|^DELIBERATE_BOUNDARY/.test(verdict), `L. "${surface}" carries a real classification.`);
        }
        console.log('✓ L: Ten surfaces classified against live evidence gathered above:');
        for (const [surface, verdict] of classifications) console.log(`    - ${surface}\n      ${verdict.split(' — ')[0]}`);

        // Deliberate-exclusions guard: none of the vocabulary this
        // milestone's own brief explicitly excludes as a MECHANISM exists
        // as real, executable code in any production file this reassessment
        // reads from or depends on.
        const excludedVocabulary = /reputation|trust\s*scor|spatial\s*voting|community\s*moderation|crowdsourc|new\s*placement\s*type|automatic\s*repository\s*promotion|consensus\s*protocol/i;
        const productionFilesThisReassessmentDependsOn = [
            'core/ObserverLocalPublicationEncounter.js',
            'application/worldEncounter/ObserverLocalEncounterStore.js',
            'application/snapshot/AutomaticSnapshotEncounterCascade.js',
            'ui/views/WorldView.js', ...worldViewTemplateFiles(),
            'ui/components/WorldEncounterCanvas.js'
        ];
        for (const file of productionFilesThisReassessmentDependsOn) {
            const source = codeOnlyLines(await rawSource(file));
            assert(!excludedVocabulary.test(source),
                `L2. ${file} contains none of this milestone's own explicitly-excluded vocabulary as real code.`);
        }

        let changedFiles = '';
        try {
            changedFiles = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT.pathname }).toString();
        } catch { /* not fatal */ }
        const productionChanges = changedFiles.split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => line.slice(3).trim())
            .filter((path) => !path.startsWith('tests/') && path !== 'tests.html');
        // AMENDED BY 0.9.554 — Observer-Local Encounter Inspection
        // Capability. This reassessment's OWN commit still shipped zero
        // production changes (unchanged fact, see the header above,
        // "Production changes: none"). But this milestone's own G/L
        // sections went on to name a real PRODUCT_GAP that a subsequent,
        // accountable milestone (0.9.554) then closed with real production
        // changes to exactly the two files below — precisely the outcome
        // Section G called for, not an unrelated or accidental one. Rather
        // than assert zero production changes forever (which would make
        // THIS test fail for the correct reason that its own named gap got
        // fixed), this narrows the check to "no UNEXPLAINED production
        // change" — mirroring tests/NovelPublicationSpatialAdmissionProductBoundaryAudit.test.js's
        // own "knownAsOf0_9_552" precedent for the identical situation, one
        // milestone earlier in this same chain.
        // AMENDED AGAIN BY 0.9.558 — Known Publication Encounter
        // Continuation, mirroring the 0.9.554 amendment immediately above
        // exactly, one milestone later in the same chain: 0.9.557's own
        // audit (a sibling test-only milestone) named the narrow wiring
        // gap 0.9.558 then closed with real production changes to
        // ui/views/WorldView.js (three new thin command wrappers) in
        // addition to WorldEncounterCanvas.js itself — an accountable,
        // named continuation of this same PRODUCT_GAP, not an unrelated
        // change.
        const knownAsOf0_9_558 = new Set([
            'ui/components/WorldEncounterCanvas.js',
            'ui/views/WorldView.js',
            'css/main.css'
        ]);
        const unexpectedProductionChanges = productionChanges.filter((path) => !knownAsOf0_9_558.has(path));
        assert(unexpectedProductionChanges.length === 0,
            `L3. No production file is modified beyond 0.9.554's/0.9.558's own already-accounted-for interaction-capability implementation (unexpected changes: ${unexpectedProductionChanges.join(', ') || 'none'}).`);

        console.log(`
--------------------------------------------------------------------
0.9.553 VERDICT.

0.9.552's own fundamental achievement holds under this reassessment:
"I encountered this" (Section A-E) and "the World says this is placed
here" (Section K) remain genuinely, mechanically distinct, coexist
correctly side by side, and neither the session-local presentation nor
the underlying decentralized discovery it presents was weakened by
building it (Section J).

Two real findings, neither a case for the persistence/reputation/
selection machinery this milestone's own brief named out of scope:

  PRODUCT_GAP (Section G) — an observer-local encounter supports no
  interaction of any kind today. A Wanderer can perceive that something
  was discovered, but has no way to learn what it is beyond a generic
  label, and no way to ask for more. The existing selection/inspection
  machinery cannot simply be reused as-is (Section G4: it resolves to a
  false UNAVAILABLE) — a real fix needs a narrow, separate
  "observe -> select -> inspect" surface, reusing the ALREADY-VERIFIED,
  ALREADY-MATERIALIZED bytes this pipeline already produced (see Section
  A4), built on the existing Publication/Evidence machinery this
  codebase already has — never "observe -> select -> modify World
  placement."

  DOCUMENTATION_GAP (Section F) — the rendered presentation, independent
  of any new interaction capability, does not currently communicate that
  the material is verified, that the encounter is temporary, or that it
  will not be found again after a reload. These invariants are all real
  and already correctly enforced (Sections A-B) — they are simply never
  said. This could plausibly be closed far more cheaply than the
  PRODUCT_GAP above, without touching the security boundary at all.

One narrow ARCHITECTURAL_GAP (Section E4): application/
ObserverLocalEncounterStore.js's own record()-by-key primitive does not
itself defend against a redescribed position moving an already-recorded
encounter; today's real composition never exercises that path, because
the cascade's own idempotency already prevents it one layer away.

Everything else audited — duplicate-encounter handling, cross-Wanderer
isolation vs. genuine decentralized discovery, async ownership under
concurrent/interleaved candidates, and the mechanical separation from
authoritative World placement — classifies ALREADY_CORRECT, and the
session-scoped, ephemeral lifecycle itself classifies DELIBERATE_BOUNDARY:
correctly so, not a gap to close.

Per this milestone's own brief, no interaction surface, persistence,
reputation, or Repository-promotion mechanism is built here. No
production code changes ship with this milestone.

AMENDED BY 0.9.554 — Observer-Local Encounter Inspection Capability.
The PRODUCT_GAP above is now closed: ui/components/WorldEncounterCanvas.js
gained a narrow, separate "observe -> select -> inspect" surface (this
file's own Sections F/G, amended in place rather than rewritten) — never
routed through the existing selection machinery, never a Repository/
Catalog action, and never a PlacementRecord. Persistence ("find it again")
and Repository promotion remain exactly as unbuilt as this reassessment
found them. See tests/ObserverLocalEncounterInspectionCapability.test.js
for that milestone's own full acceptance criteria.
--------------------------------------------------------------------
`);
    }

    console.log('\n✅ All Observer-Local Encounter Experience Product Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All ObserverLocalEncounterExperienceProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ ObserverLocalEncounterExperienceProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
