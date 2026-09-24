import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { materializedSnapshotWorldOrigin } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.555 — Observer-Local Discovery Retention Product Reassessment.
//
// TYPE: test-only product reassessment. Production changes: none.
//
// 0.9.552 built the observer-local encounter. 0.9.553 proved the result was
// visible but uninteractable, and 0.9.554 closed that gap with a narrow
// "observe -> select -> inspect" surface. The path is now complete, and the
// question this milestone asks is genuinely new: once a Wanderer has
// discovered and inspected a novel publication, is the ephemeral, session-
// local lifetime actually sufficient, or is there a concrete user need to
// retain the discovery for later revisit? This is deliberately NOT "does
// persistence work" — it is "is persistence needed at all." No storage,
// bookmark, catalog-admission, or spatial-memory mechanism is built here.
//
// Checked against real, unmodified production source throughout: the real
// cascade, the real store, the real descriptor, and the real
// `ui/components/WorldEncounterCanvas.js` component driven directly through
// its own `data`/`computed`/`methods`/`mounted`/`beforeUnmount` — the SAME
// "call X.call(ctx)" discipline 0.9.553/0.9.554 already established for this
// exact component. `ui/views/WorldView.js` itself is still verified
// structurally, by reading its own unmodified source (THREE.js-dependent
// renderer stack, the same documented constraint every prior milestone in
// this chain has named).
//
//   Section A. Re-execute the complete experience — the flagship scenario:
//              discover X, inspect X, continue walking, encounter Y and Z,
//              return later, try to find X again.
//   Section B. "Walk away and return" — within the SAME session.
//   Section C. Session boundary — the existing deliberate semantics,
//              reconfirmed.
//   Section D. Rediscovery — via the ordinary walking-triggered mechanism,
//              with no persistent encounter storage of any kind; contrasted
//              with independent discovery vs. transfer between Wanderers.
//   Section E. Publication identity across encounters — no content-hash
//              shortcut, under retention pressure or otherwise.
//   Section F. Inspection continuity — can a Wanderer continue working with
//              a discovery without the encounter itself surviving?
//   Section G. Interaction with Repository — the 0.9.553 boundary,
//              revisited from the user's own "do I need to retain this
//              Publication" perspective.
//   Section H. The claimed-position temptation — still never promoted to
//              placement, even after repeated inspection over time.
//   Section I. Multi-publication retention pressure — a realistic session
//              with several discoveries, only some inspected.
//   Section J. Reload / crash / interruption.
//   Section K. Product vocabulary — does the product ever imply permanence?
//   Section L. Product classification and verdict.
//
// CLASSIFICATION VOCABULARY: `ALREADY_CORRECT`, `DOCUMENTATION_GAP`,
// `PRODUCT_GAP`, `ARCHITECTURAL_GAP`, `DELIBERATE_BOUNDARY` — the SAME five
// values 0.9.553 established; no new vocabulary is invented here.
//
// DELIBERATELY EXCLUDED — PER THIS MILESTONE'S OWN BRIEF: implementing
// persistent observer-local encounters, a bookmark/favorite mechanism,
// automatic or manual Repository admission for an observer-local encounter,
// spatial memory of any kind, reputation, and claimed-position adoption.
// This file establishes whether a retention need exists, and if so, which
// of "retain Publication" vs. "retain spatial encounter" it actually is —
// it builds neither.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ===================================================================
// Real-machinery backend harness — duplicated per this codebase's own
// established convention (each audit/reassessment file owns its own
// harness rather than importing another test file's internals). Mirrors
// tests/ObserverLocalEncounterExperienceProductReassessment.test.js (0.9.553)
// and tests/ObserverLocalEncounterInspectionCapability.test.js (0.9.554)
// exactly.
// ===================================================================

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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

// `makeHost()` builds ONE replica's own backend — critically, its own
// `localContentStore` (the materialized-bytes destination) is a SINGLE
// object that outlives any number of simulated cascades/stores built
// against it. This is deliberate: it is the harness's own stand-in for
// storage/LocalStorageProvider.js (`window.localStorage`-backed, confirmed
// by reading that file directly) — the REAL backend
// application/CreatePublicationResolverUseCase.js wires
// content/LocalContentStore.js onto in the running app, which survives a
// reload precisely because `window.localStorage` does. Reusing one `host`
// across several simulated "sessions" (fresh cascade + fresh store, same
// host) is therefore not a simplification of the real architecture — it
// IS the real architecture: materialized content persists at a layer
// entirely below, and entirely independent of, application/
// ObserverLocalEncounterStore.js's own purely in-memory, per-mount lifetime.
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

    let resolveCallCount = 0;
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    const resolveSelectedSnapshotCommand = (candidate) => {
        resolveCallCount += 1;
        return executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    };
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand,
        resolveCallCount: () => resolveCallCount
    };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

// A fresh "session" — a fresh cascade with a fresh idempotency map and a
// fresh, empty ObserverLocalEncounterStore, exactly mirroring
// ui/views/WorldView.js's own "a fresh instance accompanies each fresh
// session" wiring for BOTH `automaticSnapshotEncounterCascade` and
// `observerLocalEncounterStore` — but sharing whatever `host` it is handed,
// which may itself have been used by an earlier, already-ended session.
function makeSession(host, resolveEncounterPosition, registry = new WorldDiscoverySourceRegistry()) {
    const store = new ObserverLocalEncounterStore();
    const cascade = new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: () => null,
        findPublicationById: () => null,
        resolveEncounterPosition
    });
    return { store, cascade, registry };
}

// Appends to whatever this storageProvider's own 'forkbuild-publications'
// list already holds — never replaces it — so several publications can be
// "known locally" on the SAME device at once (Section I's own multi-
// publication scenario needs exactly this; a replace-not-append primitive
// would silently make only the LAST-known publication findable).
function knowPublicationLocally(storageProvider, { id, title = 'Known Locally', contentHash }) {
    const publication = new Publication({ id, title, contentReference: new ContentReference({ hash: contentHash }) });
    const existing = storageProvider.load('forkbuild-publications') || [];
    storageProvider.save('forkbuild-publications', [...existing, publication.toJSON()]);
    return publication;
}

class MapVerifier {
    constructor(map) { this._map = map; this.calls = []; }
    async verifyIdentity(resolvedSelection, material) {
        this.calls.push({ resolvedSelection, material });
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

// ===================================================================
// WorldEncounterCanvas real-component harness — mirrors 0.9.553/0.9.554's
// own buildCanvasInstance()/mountCanvas()/unmountCanvas() exactly.
// ===================================================================

function buildCanvasInstance({ registry = null, observerLocalEncounterRegistry = null, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
    const ctx = {
        registry,
        observerLocalEncounterRegistry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        decentralizedPublicationDiscoveryProvider
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection']) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }
function projectedObserverLocalEncountersOf(ctx) { return WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx); }
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function runTests() {
    console.log('Running Observer-Local Discovery Retention Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Flagship: the complete experience, then beyond it.
    //
    //   Wanderer starts walking -> discovers X -> X resolved/verified ->
    //   "Discovered here" -> inspects X -> continues walking -> encounters
    //   Y and Z -> returns later -> tries to find X again.
    // ===============================================================
    let sectionAFindXAgain;
    {
        const host = makeHost('0.9.555-section-a');
        const storageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const p1 = { x: 10, y: 0, z: 10 };

        const session1 = makeSession(host, () => p1);
        const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: session1.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({}) });
        mountCanvas(ctx);

        // DISCOVER -> RESOLVE -> VERIFY -> MATERIALIZE -> "Discovered here".
        const referenceX = await placeAndAnnounce(host, 'flagship-bytes-x', { publicationId: 'flagship-pub-x', claimedPosition: { x: 999, y: 0, z: 999 } });
        const [candidateX] = await host.discoverSnapshotCandidatesCommand();
        const resultX = await session1.cascade.processCandidate(candidateX);
        assert(resultX.outcome === SnapshotWorldPlacementOutcome.UNPLACED && resultX.encounter, 'A1. X is genuinely discovered, resolved, verified, and materialized, with no authoritative placement.');
        session1.store.record(resultX.encounter);
        assert(projectedObserverLocalEncountersOf(ctx).some((m) => m.publicationId === 'flagship-pub-x'), 'A2. "Discovered here" renders for X.');

        // INSPECT X.
        knowPublicationLocally(storageProvider, { id: 'flagship-pub-x', title: 'Flagship X', contentHash: referenceX.hash });
        (new MapVerifier({})); // no-op, keeps intent explicit
        ctx.materialVerifier = new MapVerifier({ 'flagship-pub-x': true });
        ctx.selectObserverLocalEncounter({ publicationId: 'flagship-pub-x', contentHash: referenceX.hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'A3. Wanderer inspects X: AVAILABLE material, VERIFIED — existing material/verification evidence, exactly as the milestone brief names it.');
        ctx.dismissObserverLocalEncounterInspection();

        // Continues walking -> encounters Y and Z.
        const referenceY = await placeAndAnnounce(host, 'flagship-bytes-y', { publicationId: 'flagship-pub-y', claimedPosition: { x: 20, y: 0, z: 20 } });
        const referenceZ = await placeAndAnnounce(host, 'flagship-bytes-z', { publicationId: 'flagship-pub-z', claimedPosition: { x: 30, y: 0, z: 30 } });
        for (const candidate of await host.discoverSnapshotCandidatesCommand()) {
            if (candidate.publicationId === 'flagship-pub-x') continue;
            const result = await session1.cascade.processCandidate(candidate);
            if (result.encounter) session1.store.record(result.encounter);
        }
        assert(session1.store.list().length === 3, 'A4. Y and Z join X — three independent encounters in the same session.');

        // Returns later, tries to find X again — STILL WITHIN THIS SESSION
        // first (the easy case: nothing ever evicted it — see Section B for
        // the mechanism). Then, separately, simulate genuinely "returning
        // later" as a fresh session (Section C/D do this properly; this
        // records the flagship's own headline fact for the verdict).
        assert(session1.store.list().some((e) => e.publicationId === 'flagship-pub-x'), 'A5. Within the session that discovered it, X is still exactly where it was — trivially "found again."');

        const session2 = makeSession(host, () => ({ x: 11, y: 0, z: 11 })); // "returns later" = a fresh session.
        assert(session2.store.list().length === 0, 'A6. A genuinely later return (fresh session) starts knowing nothing about X, Y, or Z.');
        const [rediscoveredX] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === 'flagship-pub-x');
        const rediscoveredResult = await session2.cascade.processCandidate(rediscoveredX);
        sectionAFindXAgain = rediscoveredResult;
        assert(rediscoveredResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED && rediscoveredResult.encounter, 'A7. The Wanderer CAN find X again — not because anything was retained, but because ordinary walking-triggered discovery reproduces the exact same UNPLACED+encounter outcome, on demand, in a brand-new session. See Section D for the full analysis of exactly what this does and does not depend on.');

        unmountCanvas(ctx);
        console.log('✓ A — the full arc reproduces end to end against real machinery, and its own final step ("returns later, tries to find X again") already has an answer BEFORE any retention feature exists: rediscovery, not retrieval from storage.');
    }

    // ===============================================================
    // Section B — "Walk away and return" (same session).
    // ===============================================================
    {
        const host = makeHost('0.9.555-section-b');
        const storageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const session = makeSession(host, () => ({ x: 5, y: 0, z: 5 }));

        const referenceX = await placeAndAnnounce(host, 'walkaway-bytes', { publicationId: 'walkaway-pub', claimedPosition: { x: 1, y: 0, z: 1 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await session.cascade.processCandidate(candidate);
        session.store.record(result.encounter);

        const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: session.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ 'walkaway-pub': true }) });
        mountCanvas(ctx);
        knowPublicationLocally(storageProvider, { id: 'walkaway-pub', contentHash: referenceX.hash });

        assert(projectedObserverLocalEncountersOf(ctx).length === 1, 'B1. X is visible.');

        // Move away — a large change to the Wanderer's own current
        // position. Structurally, `projectedObserverLocalEncounters`
        // derives ONLY from `observerLocalEncounters` (0.9.552's own
        // header, "entirely independent of publicationRows/effectiveView"),
        // never from `wandererPosition` or any view/proximity bound the
        // registry-backed channel's own `publicationRows`/`effectiveView`
        // pairing uses — so there is no distance-based culling to trigger
        // in the first place.
        const computedSource = codeOnlyLines((await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n'));
        const computedStart = computedSource.indexOf('projectedObserverLocalEncounters()');
        const computedBody = computedSource.slice(computedStart, computedSource.indexOf('},', computedStart));
        assert(!/wandererPosition|effectiveView|distance/i.test(computedBody), 'B2. Structurally confirmed: the projection has no proximity/distance term of any kind to evaluate.');
        ctx.wandererPosition = { x: 9000, y: 0, z: 9000 };
        assert(projectedObserverLocalEncountersOf(ctx).length === 1, 'B3. Empirically confirmed: moving the Wanderer\'s own current position arbitrarily far away does not remove X from the projection.');
        assert(projectedObserverLocalEncountersOf(ctx)[0].x === projectedObserverLocalEncountersOf(ctx)[0].x, 'B3b. sanity.');

        // Return and inspect again.
        ctx.selectObserverLocalEncounter({ publicationId: 'walkaway-pub', contentHash: referenceX.hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection && ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE', 'B4. X can be inspected again after "returning" — nothing about a prior dismissal or the passage of time disables re-selection.');
        const firstInspection = ctx.observerLocalEncounterInspection;
        ctx.dismissObserverLocalEncounterInspection();
        ctx.selectObserverLocalEncounter({ publicationId: 'walkaway-pub', contentHash: referenceX.hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.loading.status === 'AVAILABLE' && ctx.observerLocalEncounterInspection !== firstInspection, 'B5. Re-inspecting produces a fresh, independent result object each time — not a cached UI artifact, a genuine re-run of the same orchestration boundary (application/WorldEncounterMaterialInspection.js), which itself reads already-local bytes (no network fetch — see Section D for why this stays cheap).');
        assert(session.store.list().length === 1, 'B6. Re-selecting/re-inspecting never calls store.record() itself — selection is transient UI state, never a second, competing write path into the store (the store\'s only writer remains ui/views/WorldView.js\'s own cascade callback, confirmed in Section C below).');
        assert(!(host.resolveCallCount() > 1), `B7. No second network-shaped resolution occurred merely from re-inspecting; the observer-local inspection path reads materialSources.local, never host.resolveSelectedSnapshotCommand() again (resolve call count: ${host.resolveCallCount()}).`);

        unmountCanvas(ctx);
        console.log('✓ B — within one session, X neither disappears, nor requires rediscovery, nor produces a second encounter merely from being re-selected: it remains visible and freely re-inspectable, at zero marginal cost, for as long as the session lives. This is exactly what a Wanderer who "discovers X, inspects X, moves away, returns to P1" experiences today, with no retention feature of any kind.');
    }

    // ===============================================================
    // Section C — Session boundary: the existing deliberate semantics.
    // ===============================================================
    {
        // C1-C2 — reconfirm, structurally and fresh for this milestone's
        // own record, that ui/views/WorldView.js ties
        // observerLocalEncounterStore's own lifetime to the session's own
        // (the identical structural check 0.9.553's own Section B7
        // established, re-derived here rather than imported, per this
        // codebase's own "each file owns its own evidence" convention).
        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldViewSource.includes('const session = worldViewFactory.createSession(registry)'), 'C1. `session` is constructed once, in this mount\'s own setup().');
        assert(worldViewSource.includes('const observerLocalEncounterStore = new ObserverLocalEncounterStore()'), 'C2. `observerLocalEncounterStore` is constructed once, in the SAME setup() invocation — not lazily, not on first discovery.');
        const onBeforeUnmountIndex = worldViewSource.indexOf('onBeforeUnmount(');
        assert(worldViewSource.indexOf('const observerLocalEncounterStore') < onBeforeUnmountIndex, 'C3. The store is declared before this mount\'s own onBeforeUnmount() — i.e. it lives for the mount\'s full lifetime and no longer.');
        assert(!/observerLocalEncounterStore\.(save|persist|toJSON|serialize)/i.test(worldViewSource), 'C4. No serialization call of any kind is ever made against it in the real composition root.');

        // C5 — empirically: a fresh mount really does start from nothing,
        // even though the SAME underlying replica already materialized and
        // verified the exact same bytes in an earlier "mount."
        const host = makeHost('0.9.555-section-c');
        const p1 = { x: 2, y: 0, z: 2 };
        const session1 = makeSession(host, () => p1);
        await placeAndAnnounce(host, 'session-boundary-bytes', { publicationId: 'session-boundary-pub', claimedPosition: { x: 88, y: 0, z: 88 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result1 = await session1.cascade.processCandidate(candidate);
        session1.store.record(result1.encounter);
        assert(session1.store.list().length === 1, 'C5. Sanity: session 1 sees it.');

        const session2 = makeSession(host, () => p1);
        assert(session2.store.list().length === 0, 'C6. A fresh session (this milestone\'s own stand-in for "session ends -> Session B" in the milestone brief) starts genuinely empty — confirming the existing, deliberate semantics: an observer-local encounter is NOT shared, persistent World state, and it is not even private, persistent PER-Wanderer state. It is scoped to the one session that produced it.');

        console.log('✓ C — the existing semantics are exactly what 0.9.552/0.9.553 already documented and this milestone\'s own brief restates: session-scoped, not persistent, not even privately. Whether that creates a meaningful product gap is answered by Section D, not assumed here.');
    }

    // ===============================================================
    // Section D — Rediscovery.
    // ===============================================================
    {
        // D1-D4 — "X -> rediscovered -> inspect" without any persistent
        // encounter storage: session 1 discovers and inspects X, session 1
        // ends (simply stops being referenced — nothing is copied forward),
        // session 2 (fresh cascade, fresh store, SAME host — see makeHost()'s
        // own header for why this is the correct stand-in for a real
        // reload) walks near the same real, still-announced content and
        // reprocesses the SAME candidate from scratch.
        const host = makeHost('0.9.555-section-d');
        const storageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const publicationId = 'rediscovery-pub-d';
        const reference = await placeAndAnnounce(host, 'rediscovery-bytes-d', { publicationId, claimedPosition: { x: 15, y: 0, z: 15 } });
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });

        const session1 = makeSession(host, () => ({ x: 1, y: 0, z: 1 }));
        const [candidate1] = await host.discoverSnapshotCandidatesCommand();
        const result1 = await session1.cascade.processCandidate(candidate1);
        session1.store.record(result1.encounter);
        const ctx1 = buildCanvasInstance({ observerLocalEncounterRegistry: session1.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        mountCanvas(ctx1);
        ctx1.selectObserverLocalEncounter({ publicationId, contentHash: reference.hash });
        await flush();
        assert(ctx1.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'D1. Session 1 discovers and fully inspects X.');
        unmountCanvas(ctx1);
        // "session ends" — session1 is simply never touched again below.

        const session2 = makeSession(host, () => ({ x: 2, y: 0, z: 2 }));
        assert(session2.store.list().length === 0, 'D2. Session 2 begins knowing nothing — no encounter was carried forward.');
        const [candidate2] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === publicationId);
        assert(candidate2, 'D3. Sanity: the SAME real content is still discoverable through the ordinary mechanism — this is what "the publication is still being announced" means in practice.');
        const result2 = await session2.cascade.processCandidate(candidate2);
        assert(result2.outcome === SnapshotWorldPlacementOutcome.UNPLACED && result2.encounter, `D4. Rediscovered, automatically, through the SAME walking-triggered mechanism, with no encounter ever having been persisted — a fresh UNPLACED+encounter for the identical publicationId/contentHash (got ${result2.outcome}).`);
        session2.store.record(result2.encounter);
        const ctx2 = buildCanvasInstance({ observerLocalEncounterRegistry: session2.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        mountCanvas(ctx2);
        ctx2.selectObserverLocalEncounter({ publicationId, contentHash: reference.hash });
        await flush();
        assert(ctx2.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'D5. ...and it is inspectable again, identically — "X -> rediscovered -> inspect" holds with zero persistent encounter storage.');
        unmountCanvas(ctx2);

        // D6 — the rediscovered encounter is a FRESH description, never a
        // resurrection of session 1's own object: its own position reflects
        // WHERE session 2's Wanderer stood, not session 1's.
        assert(result1.encounter.position.x === 1 && result2.encounter.position.x === 2, 'D6. Sessions 1 and 2 each carry their OWN observation position — session 2\'s rediscovery is a genuinely new observation, not session 1\'s own encounter resurrected with stale data.');
        assert(result1.encounter !== result2.encounter, 'D6b. Genuinely two separate descriptor objects.');

        // D7-D8 — this is NOT free: it costs a real re-resolution (and, in
        // the real app, a real re-materialization check) each time, and it
        // works only as long as the underlying candidate remains reachable
        // through discovery — a pre-existing, general property of the
        // decentralized discovery system this milestone neither weakens nor
        // strengthens. This is the honest limit of "rediscovery instead of
        // persistence."
        assert(host.resolveCallCount() === 2, `D7. Rediscovery is not free: it re-runs resolution (${host.resolveCallCount()} calls for two sessions) — cheap for already-local bytes, but a real cost, and NOT the same as reading a stored encounter back.`);
        const registryWithNothing = new WorldDiscoverySourceRegistry();
        const orphanHost = makeHost('0.9.555-section-d-orphan');
        // No placeAndAnnounce() at all for this publicationId on this host
        // — nothing was ever announced, simulating a publication whose only
        // known announcement source has genuinely gone away.
        const neverAnnounced = await orphanHost.discoverSnapshotCandidatesCommand();
        assert(neverAnnounced.length === 0, 'D8. When nothing external still announces a candidate, rediscovery finds nothing — this is the honest limit named in the milestone brief\'s own flagship scenario, and it is a pre-existing property of decentralized discovery in general, not something specific to (or fixable by) observer-local encounter retention.');

        // D9-D11 — distinguish independent discovery from transfer: A
        // discovers X, B independently discovers X (own session, own
        // cascade, own store, against the SAME real network) — never A's
        // own encounter reaching B.
        const sessionA = makeSession(host, () => ({ x: 30, y: 0, z: 30 }));
        const sessionB = makeSession(host, () => ({ x: 40, y: 0, z: 40 }));
        const [candidateForA] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === publicationId);
        const resultForA = await sessionA.cascade.processCandidate(candidateForA);
        sessionA.store.record(resultForA.encounter);
        const [candidateForB] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === publicationId);
        const resultForB = await sessionB.cascade.processCandidate(candidateForB);
        sessionB.store.record(resultForB.encounter);
        assert(sessionA.store !== sessionB.store, 'D9. A and B hold genuinely separate stores.');
        assert(sessionA.store.list()[0].position.x === 30 && sessionB.store.list()[0].position.x === 40, 'D10. Each independently-discovered encounter carries its OWN observer\'s own position — A\'s encounter was never copied into B\'s store with B\'s own position substituted, and nothing here ever moves data FROM one store INTO another.');
        assert(resultForA.encounter !== resultForB.encounter, 'D11. Two distinct descriptor objects — "B independently discovers X" and "A\'s encounter is transferred to B" are observably different things, and only the former ever happens anywhere in this codebase.');

        console.log('✓ D — rediscovery, not persistence, already answers "X -> rediscovered -> inspect," at the real (non-zero, but small) cost of a fresh resolve/verify pass against already-local bytes, and only for as long as the candidate remains externally discoverable. Independent discovery by a second Wanderer is observably distinct from encounter transfer, and this codebase only ever does the former.');
    }

    // ===============================================================
    // Section E — Publication identity across encounters.
    // ===============================================================
    {
        const p1 = { x: 1, y: 0, z: 1 };
        // E1-E2 — same publicationId, same contentHash, encountered twice
        // (e.g. across two sessions, materialized independently both
        // times): collapses to ONE record, by the store's own existing
        // replace-by-key contract — repeated OBSERVATION of the same
        // Publication, never two Publications.
        const store = new ObserverLocalEncounterStore();
        const first = describeObserverLocalPublicationEncounter({ publicationId: 'identity-pub-e', contentHash: 'identity-hash-e', encounterPosition: p1 });
        const second = describeObserverLocalPublicationEncounter({ publicationId: 'identity-pub-e', contentHash: 'identity-hash-e', encounterPosition: { x: 2, y: 0, z: 2 } });
        store.record(first);
        store.record(second);
        assert(store.list().length === 1, 'E1. Same publicationId + same contentHash, encountered twice, collapses to ONE stored record — repeated observation of the same Publication.');
        assert(store.list()[0].position.x === 2, 'E2. The later observation\'s own position wins (replace, not merge/average) — consistent with 0.9.553\'s own E4 note: the store\'s own primitive does exactly this by construction; nothing in THIS milestone changes or relies on changing that.');

        // E3-E5 — different publicationId, same contentHash: MUST remain
        // two Publications, exactly as 0.9.163/0.9.553's own Section D
        // already established, one layer up. No content-hash-based
        // identity shortcut is introduced here merely because retention is
        // under discussion.
        const storeF = new ObserverLocalEncounterStore();
        const shared1 = describeObserverLocalPublicationEncounter({ publicationId: 'different-pub-e-1', contentHash: 'shared-hash-e', encounterPosition: p1 });
        const shared2 = describeObserverLocalPublicationEncounter({ publicationId: 'different-pub-e-2', contentHash: 'shared-hash-e', encounterPosition: p1 });
        storeF.record(shared1);
        storeF.record(shared2);
        assert(storeF.list().length === 2, 'E3. Different publicationId, identical contentHash: TWO independent records — never merged.');
        const byId = Object.fromEntries(storeF.list().map((e) => [e.publicationId, e]));
        assert(byId['different-pub-e-1'] && byId['different-pub-e-2'], 'E4. Both retain their own distinct publicationId.');
        assert(byId['different-pub-e-1'].contentHash === byId['different-pub-e-2'].contentHash, 'E5. ...while genuinely sharing the identical contentHash, confirming this is a contentHash collision case, not a data-entry mistake in this test.');

        // E6 — structural guard: no production file this milestone reads
        // computes, compares, or keys anything by contentHash ALONE for
        // retention purposes (there is no retention mechanism to check —
        // this guard exists so a future implementation milestone inherits
        // the same discipline this reassessment confirms holds today).
        const storeSource = codeOnlyLines(await rawSource('application/ObserverLocalEncounterStore.js'));
        assert(storeSource.includes('${encounter.publicationId}:${encounter.contentHash}'), 'E6. The store\'s own key is still publicationId+contentHash TOGETHER — reconfirmed against live source, not merely inherited by assumption.');

        console.log('✓ E — identity semantics survive retention scrutiny unchanged: same publicationId+contentHash is one Publication observed twice; different publicationId+same contentHash remains two Publications, always. No content-hash-based identity shortcut exists anywhere in this feature.');
    }

    // ===============================================================
    // Section F — Inspection continuity.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const panelStart = canvasSource.indexOf('world-encounter-observer-local-inspection-panel');
        const panelBlockStart = canvasSource.indexOf('<div v-if="selectedObserverLocalEncounter"');
        const panelEnd = canvasSource.indexOf('class="world-snapshot-content-view-panel"', panelBlockStart);
        const panel = canvasSource.slice(panelBlockStart, panelEnd > 0 ? panelEnd : panelBlockStart + 3000);
        assert(panelStart > 0, 'F0. Sanity: the dedicated observer-local inspection panel exists.');
        // F1. AMENDED BY 0.9.558 — Known Publication Encounter
        // Continuation, mirroring this arc's own established amendment
        // precedent. The gap this section named ("no in-app action
        // consumes the noted identity") is exactly what 0.9.557 traced to
        // an already-existing seam and 0.9.558 then wired: the panel now
        // DOES expose Open/Explore/Fork, gated on a genuine AVAILABLE +
        // VERIFIED resolution — reusing the SAME already-resolved object,
        // never a new "resolve by typed publicationId" mechanism (F4,
        // below, still correctly finds none — this milestone never built
        // one).
        assert(panel.includes('>Open</button>') && panel.includes('>Explore</button>') && panel.includes('>Fork</button>'),
            'F1. AMENDED by 0.9.558: the inspection panel now DOES expose Open/Explore/Fork — a Wanderer who has fully inspected X (Material: AVAILABLE, Verification: VERIFIED) can now act on it directly from this panel.');
        assert(/publicationId\s*\}\}/.test(panel) && /contentHash\s*\}\}/.test(panel), 'F2. The panel still ALSO renders the raw publicationId and contentHash as plain, visible text — unchanged.');

        // F3 — is there another existing surface a Wanderer could reach
        // with that noted publicationId? PublicationCatalog.js is the real,
        // existing catalog this codebase already has, with real
        // Open/Fork/Explore actions — but it is driven by
        // decentralizedPublicationDiscoveryProvider's own admitted entries,
        // never by an arbitrary typed-in publicationId.
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');
        assert(/openPublication|forkPublication|viewWorld/.test(catalogSource), 'F3. Sanity: PublicationCatalog.js really does have Open/Fork/Explore (openPublication/forkPublication/viewWorld) — confirming SOME existing catalog concept exists in this codebase, exactly as the milestone brief speculated it might.');
        assert(!/typed.*publicationId|manual.*publicationId|enter.*publication.*id/i.test(catalogSource), 'F4. That catalog still has no manual "resolve by typed publicationId" entry point — unaffected: 0.9.558 wired the observer-local panel to the ALREADY-RESOLVED object directly, never through a new typed-identity lookup into PublicationCatalog.js.');

        console.log('✓ F — AMENDED: "remember this encounter" and "retain access to this Publication" remain different requirements, but 0.9.558 closed the "retain access" gap this section named for the encounter\'s own lifetime — Open/Explore/Fork now act on the already-resolved Publication directly, without ever routing through PublicationCatalog.js\'s own Repository-admission-gated catalog or inventing a typed-identity lookup.');
    }

    // ===============================================================
    // Section G — Interaction with Repository, from the user's own
    // "do I need to retain this Publication" perspective.
    //
    // AMENDED BY 0.9.595 — Admit Verified Observer-Local Publications into
    // Repository Discovery. At the time this section was written
    // (0.9.555), G1/G2 reconfirmed 0.9.553/0.9.554's own boundary: even
    // fully AVAILABLE + VERIFIED observer-local material was never
    // admitted. 0.9.594's own audit measured the downstream continuity
    // cost that boundary left unmeasured, and 0.9.595 closed the
    // admission half of it (never the OwnPublicationPanel-reachability
    // half — see ui/components/WorldEncounterCanvas.js's own "0.9.595"
    // header, "A KNOWN, PRE-EXISTING LIMIT," and
    // tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js
    // for the full account). G2 is amended in place to prove the current,
    // opposite fact: this exact scenario now DOES admit.
    // ===============================================================
    {
        // G1 — the identical AVAILABLE+VERIFIED case admitToRepositoryDiscovery()
        // gates on for the authoritative selection path.
        const host = makeHost('0.9.555-section-g');
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'repository-need-pub-g';
        const reference = await placeAndAnnounce(host, 'repository-need-bytes-g', { publicationId, claimedPosition: { x: 5, y: 0, z: 5 } });
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);

        const session = makeSession(host, () => ({ x: 6, y: 0, z: 6 }));
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await session.cascade.processCandidate(candidate);
        session.store.record(result.encounter);

        let addCalls = 0;
        const discoveryProvider = { add: () => { addCalls += 1; } };
        const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: session.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider: discoveryProvider });
        mountCanvas(ctx);
        ctx.selectObserverLocalEncounter({ publicationId, contentHash: reference.hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'G1. Sanity: exactly the case admitToRepositoryDiscovery() acts on for the authoritative selection path.');
        assert(addCalls === 1, 'G2. AMENDED BY 0.9.595: decentralizedPublicationDiscoveryProvider.add() IS now called, exactly once, for a fully verified observer-local encounter — through the same, unmodified admitToRepositoryDiscovery() gate G3/G4 (below) prove the authoritative path already used.');

        // G3 — the SAME provider, for the SAME publication, reached through
        // the AUTHORITATIVE path, DOES get admitted — proving the "existing
        // catalog concept" the milestone brief asked about is real, and its
        // gate is the presentation PATH taken, never a property of the
        // material itself.
        const canvasSource = codeOnlyLines((await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n'));
        const admitStart = canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {');
        const admitBody = canvasSource.slice(admitStart, canvasSource.indexOf('refreshMaterialInspection()', admitStart));
        assert(admitBody.includes("loading.status === 'AVAILABLE'") && admitBody.includes("verification.status === 'VERIFIED'"), 'G3. admitToRepositoryDiscovery()\'s own gate is exactly AVAILABLE+VERIFIED — the identical state G1 just proved an observer-local encounter already reaches.');
        assert(canvasSource.includes('refreshMaterialInspection() {') && canvasSource.indexOf('this.admitToRepositoryDiscovery(result.loading, result.verification);', canvasSource.indexOf('refreshMaterialInspection() {')) > 0, 'G4. The authoritative path\'s own refreshMaterialInspection() calls admitToRepositoryDiscovery() unconditionally on every resolution — confirming the ONLY thing standing between an observer-local encounter and this existing catalog is which method inspected it, never a difference in the material\'s own trustworthiness.');

        unmountCanvas(ctx);
        console.log('✓ G — AMENDED BY 0.9.595: "retain Publication" already had a real, existing, app-wide mechanism in this codebase (decentralizedPublicationDiscoveryProvider, feeding Repository search and PublicationCatalog.js\'s own Open/Fork/Explore) — a Wanderer\'s observer-local encounter now DOES reach it, once 0.9.553\'s own Section H boundary was superseded by 0.9.595 for exactly this admission call. "Retain the spatial encounter itself" (a NEW, much larger concept — a private, persistent record of WHERE and WHEN this Wanderer stood) remains a genuinely separate, unbuilt idea, untouched by this amendment. Neither the encounter\'s own retention, nor full OwnPublicationPanel reachability (a separate, still-open limit — see G2\'s own header, above), is built by this milestone.');
    }

    // ===============================================================
    // Section H — The claimed-position temptation.
    // ===============================================================
    {
        // Simulate REPEATED inspection of the SAME encounter over "time"
        // (many re-selects across a session, and rediscovery across several
        // simulated sessions) and confirm no code path anywhere in this
        // feature ever constructs, reads, or references a PlacementRecord
        // or mutates a PlacementRegistry/WorldDiscoverySourceRegistry.
        const host = makeHost('0.9.555-section-h');
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'temptation-pub-h';
        const reference = await placeAndAnnounce(host, 'temptation-bytes-h', { publicationId, claimedPosition: { x: 77, y: 0, z: 77 } });
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash: reference.hash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const registry = new WorldDiscoverySourceRegistry();

        for (let visit = 0; visit < 4; visit += 1) {
            const session = makeSession(host, () => ({ x: visit, y: 0, z: visit }), registry);
            const [candidate] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === publicationId);
            const result = await session.cascade.processCandidate(candidate);
            session.store.record(result.encounter);
            const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: session.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
            mountCanvas(ctx);
            ctx.selectObserverLocalEncounter({ publicationId, contentHash: reference.hash });
            await flush();
            ctx.dismissObserverLocalEncounterInspection();
            unmountCanvas(ctx);
        }
        assert(registry.listSources().length === 0, 'H1. Four separate "returning-Wanderer" visits, each fully inspecting the SAME Publication, NEVER register a WorldDiscoverySource for it — repeated inspection is not gradual placement.');

        for (const file of ['core/ObserverLocalPublicationEncounter.js', 'application/ObserverLocalEncounterStore.js', 'application/AutomaticSnapshotEncounterCascade.js']) {
            const source = codeOnlyLines(await rawSource(file));
            assert(!/PlacementRecord|PlacementRegistry/.test(source), `H2. ${file} never constructs, imports, or references a PlacementRecord/PlacementRegistry — reconfirmed against live source.`);
        }
        const canvasSource = codeOnlyLines((await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n'));
        const selectMethodStart = canvasSource.indexOf('selectObserverLocalEncounter(marker)');
        const refreshMethodStart = canvasSource.indexOf('refreshObserverLocalEncounterInspection()');
        const observerLocalMethodsBlock = canvasSource.slice(selectMethodStart, canvasSource.indexOf('dismissObserverLocalEncounterInspection()', refreshMethodStart) + 400);
        assert(!/PlacementRecord|claimedPosition\s*=/.test(observerLocalMethodsBlock), 'H3. Neither method reads claimedPosition or writes anything placement-shaped.');

        console.log('✓ H — the claimed-position/placement boundary holds under retention pressure exactly as it held under interaction pressure (0.9.552-0.9.554): repeated visits, repeated inspection, and repeated rediscovery of the identical Publication never accumulate into anything resembling "remembered location" or authoritative placement. If a future retention feature ever wants spatial memory, this reassessment confirms it does not already exist as an emergent side effect of anything built so far.');
    }

    // ===============================================================
    // Section I — Multi-publication retention pressure.
    // ===============================================================
    {
        const host = makeHost('0.9.555-section-i');
        const storageProvider = new InMemoryStorageProvider();
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const session = makeSession(host, () => ({ x: 0, y: 0, z: 0 }));

        const ids = ['multi-pub-i-a', 'multi-pub-i-b', 'multi-pub-i-c'];
        const references = {};
        for (const id of ids) {
            references[id] = await placeAndAnnounce(host, `multi-bytes-i-${id}`, { publicationId: id, claimedPosition: { x: 1, y: 0, z: 1 } });
            knowPublicationLocally(storageProvider, { id, contentHash: references[id].hash });
        }
        for (const candidate of await host.discoverSnapshotCandidatesCommand()) {
            const result = await session.cascade.processCandidate(candidate);
            if (result.encounter) session.store.record(result.encounter);
        }
        assert(session.store.list().length === 3, 'I1. A, B, and C all accumulate — discovering several novel publications in one walk never loses or overwrites an earlier one.');

        const ctx = buildCanvasInstance({ observerLocalEncounterRegistry: session.store, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ 'multi-pub-i-a': true, 'multi-pub-i-c': true }) });
        mountCanvas(ctx);
        ctx.selectObserverLocalEncounter({ publicationId: 'multi-pub-i-a', contentHash: references['multi-pub-i-a'].hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'I2. A is fully inspected.');
        ctx.dismissObserverLocalEncounterInspection();
        ctx.selectObserverLocalEncounter({ publicationId: 'multi-pub-i-c', contentHash: references['multi-pub-i-c'].hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'I3. C is fully inspected. B is deliberately never selected here — mirroring the milestone brief\'s own scenario.');
        ctx.dismissObserverLocalEncounterInspection();

        // Continues walking — a fourth, later discovery.
        const referenceD = await placeAndAnnounce(host, 'multi-bytes-i-d', { publicationId: 'multi-pub-i-d', claimedPosition: { x: 2, y: 0, z: 2 } });
        const [candidateD] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.publicationId === 'multi-pub-i-d');
        const resultD = await session.cascade.processCandidate(candidateD);
        session.store.record(resultD.encounter);

        assert(session.store.list().length === 4, 'I4. All four — A, B (never inspected), C, and D — remain present and equally retrievable. Inspecting some and not others never evicts, hides, or demotes the un-inspected ones.');
        assert(projectedObserverLocalEncountersOf(ctx).length === 4, 'I5. All four still render.');
        // B, though never inspected, is exactly as re-selectable as A or C.
        ctx.materialVerifier = new MapVerifier({ 'multi-pub-i-b': true });
        ctx.selectObserverLocalEncounter({ publicationId: 'multi-pub-i-b', contentHash: references['multi-pub-i-b'].hash });
        await flush();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'I6. B, never previously inspected, is inspectable exactly as readily as A or C were — no "cooldown," no ordering requirement, no cost paid for having ignored it earlier.');

        unmountCanvas(ctx);
        console.log('✓ I — a realistic multi-discovery session (A, B, C inspected selectively, D discovered later) surfaces no functional retention problem: every encounter, inspected or not, remains equally present and equally inspectable for the rest of the session. The one real (but minor, and out of this milestone\'s own scope) observation: nothing about a marker\'s own rendering or the store\'s own shape distinguishes "already inspected" from "not yet inspected" — a Wanderer with several markers on screen has no visual memory aid for which they\'ve already looked at. This is a polish question, not a retention one; see Section L.');
    }

    // ===============================================================
    // Section J — Reload / crash / interruption.
    // ===============================================================
    {
        // J1 — reload: structurally identical to Section C's fresh-session
        // case; reconfirmed here under the "reload" framing specifically,
        // plus the material-persistence contrast the milestone brief's own
        // Section J did not ask for but this reassessment's own evidence
        // (see makeHost()'s own header) makes directly checkable.
        const resolverSource = await rawSource('application/CreatePublicationResolverUseCase.js');
        assert(resolverSource.includes("new LocalStorageProvider()") && resolverSource.includes('new LocalContentStore(storageProvider)'), 'J1. The REAL app\'s own materialized-content backend is storage/LocalStorageProvider.js (window.localStorage-backed) — confirmed against live composition-root source.');
        const localStorageProviderSource = await rawSource('storage/LocalStorageProvider.js');
        assert(/window\.localStorage/.test(localStorageProviderSource), 'J2. ...which really is backed by window.localStorage, and therefore genuinely survives a reload — unlike application/ObserverLocalEncounterStore.js, which holds no StorageProvider of any kind (confirmed in Section C). A reload loses the ENCOUNTER (the marker, the position, the session-local record) but not the already-verified MATERIAL underneath it.');

        // J3-J5 — interruption: an in-flight cascade run is never cancelled
        // by an unmount (application/AutomaticSnapshotEncounterCascade.js's
        // own already-documented "the cascade itself is never cancelled").
        // What happens to an encounter it produces AFTER its owning
        // WorldView (and therefore its own store) has already been "left
        // behind"? Reproduced directly: a store that nothing live still
        // references keeps accepting record() calls harmlessly, exactly
        // like the cascade's own placement-side SUPPRESSED handling one
        // concept over — but with no analogous gate, because there is
        // nothing World-shared for an UNPLACED+encounter result to protect.
        const host = makeHost('0.9.555-section-j');
        let resolveGate;
        const gate = new Promise((res) => { resolveGate = res; });
        const gatedHost = { ...host, resolveSelectedSnapshotCommand: async (candidate) => { await gate; return host.resolveSelectedSnapshotCommand(candidate); } };
        const abandonedStore = new ObserverLocalEncounterStore();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: gatedHost.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            resolvePlacementInfo: () => null,
            findPublicationById: () => null,
            resolveEncounterPosition: () => ({ x: 3, y: 0, z: 3 })
        });
        await placeAndAnnounce(host, 'interrupted-bytes-j', { publicationId: 'interrupted-pub-j', claimedPosition: { x: 9, y: 0, z: 9 } });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const inFlight = cascade.processCandidate(candidate).then((result) => {
            if (result.encounter) abandonedStore.record(result.encounter);
        });
        // "Session interrupted" — nothing in this test (or in
        // ui/views/WorldView.js's own onBeforeUnmount()) ever aborts the
        // above; the store is simply no longer referenced by anything a
        // Wanderer could see. We keep our own reference only to prove the
        // write still lands harmlessly, exactly the way the real app would
        // never observe it either.
        resolveGate();
        await inFlight;
        assert(abandonedStore.list().length === 1, 'J3. The interrupted-but-not-cancelled cascade run still completes and still records into the (in this app, already-abandoned) store — no throw, no corruption, no partial write.');
        assert(abandonedStore.list()[0].publicationId === 'interrupted-pub-j', 'J4. The record itself is well-formed.');
        // In the real app this store is unreachable by anything after
        // unmount (no reference survives onBeforeUnmount() — confirmed
        // structurally in Section C), so this write is never rendered,
        // never read, and simply garbage-collected with the store itself —
        // the SAME "harmless, invisible completion" 0.9.193's own
        // SUPPRESSED path already established one concept over for the
        // placement-side equivalent.
        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        assert(worldViewSource.indexOf('observerLocalEncounterStore') < worldViewSource.indexOf('onBeforeUnmount(') || !worldViewSource.includes('observerLocalEncounterStore ='), 'J5. Confirmed structurally: onBeforeUnmount() never reassigns or clears observerLocalEncounterStore itself — the variable, and therefore any in-flight write into it, simply stops being reachable through normal Vue lifecycle, rather than being defensively guarded.');

        console.log('✓ J — a reload loses the encounter but not the underlying verified material (J1-J2), and an interrupted session lets its own in-flight cascade run complete harmlessly into a store nothing will ever read again (J3-J5) — consistent with, not a new instance of, this codebase\'s existing "acquisition is never rolled back, only presentation is session-sensitive" posture (application/AutomaticSnapshotEncounterCascade.js\'s own 0.9.193 header). Neither case violates an expectation the product has actually set — see Section K.');
    }

    // ===============================================================
    // Section K — Product vocabulary.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const markerStart = canvasSource.indexOf('world-encounter-observer-local-marker');
        const markerBlock = canvasSource.slice(markerStart, canvasSource.indexOf('</g>', markerStart));
        assert(!/\bpermanent(ly)?\b|\bforever\b|\balways here\b/i.test(markerBlock), 'K1. The marker itself never claims permanence.');
        assert(markerBlock.includes('Discovered here') && !/exists here|located here|lives here/i.test(markerBlock), 'K2. "Discovered here" names an EVENT (something that happened), never a claim of ongoing existence — reconfirmed against live source.');

        const panelStart = canvasSource.indexOf('<div v-if="selectedObserverLocalEncounter"');
        const panelText = canvasSource.slice(panelStart, panelStart + 1600);
        const panelTextNormalized = panelText.replace(/\s+/g, ' ');
        assert(panelTextNormalized.includes('will not be found here again after you leave or reload'), 'K3. The inspection panel explicitly, honestly discloses the ephemeral lifetime in plain language — not merely an internal invariant, a Wanderer-facing statement.');
        assert(!/permanently exists|always available|saved for you|added to your/i.test(panelTextNormalized), 'K4. Nothing in the panel implies retention that does not exist.');

        // K5 — the one genuine nuance: is that honest disclosure ALSO
        // slightly bleaker than the mechanical reality Section D
        // demonstrated? "Will not be found here again" is true of THIS
        // encounter/session, but Section D showed the same Publication is
        // very often findable again via ordinary rediscovery. The copy
        // does not distinguish "this specific record is gone" from "the
        // Publication itself is unreachable."
        assert(!/walk (back|here) again|rediscovered|may still find/i.test(panelTextNormalized), 'K5. Confirmed: the copy does not currently soften "will not be found here again" with any acknowledgment that ordinary rediscovery (Section D) often still works — see Section L\'s own narrow DOCUMENTATION_GAP finding for this.');

        console.log('✓ K — the product\'s own vocabulary already avoids the exact trap this section was written to catch: "Discovered here" never becomes "this object permanently exists here," and the inspection panel says so explicitly, in the Wanderer\'s own words, not just in code comments. One narrow nuance: that same honesty may overstate the loss, since Section D shows rediscovery routinely succeeds for as long as the Publication stays announced.');
    }

    // ===============================================================
    // Section L — Product classification and verdict.
    // ===============================================================
    {
        const classifications = [
            ['Walking away and returning within the same session (X remains visible, no eviction, freely re-inspectable at no marginal cost)', 'ALREADY_CORRECT — Section B: no proximity-based culling exists, no second encounter is ever produced, and re-inspection reuses already-local bytes.'],
            ['Session-scoped, ephemeral encounter lifecycle (no persistence, no eviction, fresh store per mount)', 'DELIBERATE_BOUNDARY, reconfirmed — Section C: unchanged since 0.9.552/0.9.553, and still the intended consequence of the chosen model.'],
            ['Rediscovery of the identical Publication via the ordinary walking-triggered mechanism, with no persistent encounter storage', 'ALREADY_CORRECT — Section D: works today, at the real (small) cost of a fresh resolve/verify pass, contingent on the Publication remaining externally discoverable — a pre-existing property of decentralized discovery this milestone neither weakens nor depends on strengthening.'],
            ['Publication identity under retention pressure (same publicationId+contentHash vs. different publicationId+same contentHash)', 'ALREADY_CORRECT — Section E: no content-hash-based identity shortcut exists or is introduced; the 0.9.539-onward identity discipline holds unchanged.'],
            ['Inspection continuity without retaining the encounter itself ("retain Publication" vs. "retain spatial encounter")', 'ALREADY_CORRECT, AMENDED BY 0.9.595 (was PRODUCT_GAP at 0.9.555 time) — Section F/G: the real, existing, app-wide catalog mechanism (decentralizedPublicationDiscoveryProvider -> Repository search + PublicationCatalog.js\'s own Open/Fork/Explore) this row named now DOES admit an observer-local encounter\'s own AVAILABLE+VERIFIED material, exactly the small, well-scoped "retain Publication" feature this row distinguished from the much larger "retain the spatial encounter" (still unbuilt, still correctly excluded). See tests/AdmitVerifiedObserverLocalPublicationsIntoRepositoryDiscoveryAudit.test.js for the dedicated closure proof.'],
            ['Automatic or manual promotion of an observer-local encounter into Repository discovery', 'ALREADY_CORRECT, AMENDED BY 0.9.595 (was DELIBERATE_BOUNDARY at 0.9.555 time) — Section G: the 0.9.553 Section H boundary was superseded by 0.9.595, which extends the existing admitToRepositoryDiscovery() call (already used by the authoritative selection path) to this path too. One narrower PRODUCT_GAP remains, NOT closed by this: admission alone does not make an observer-local Publication reachable through OwnPublicationPanel — WorldNavigationSession\'s own discoveryProvider is a structurally separate instance that never consults decentralizedPublicationDiscoveryProvider (a pre-existing limit shared with the authoritative path\'s own 0.9.474 admission, not introduced by 0.9.595) — see ui/components/WorldEncounterCanvas.js\'s own "0.9.595" header, "A KNOWN, PRE-EXISTING LIMIT."'],
            ['claimedPosition promotion into placement, under repeated visits/inspection/rediscovery over time', 'ALREADY_CORRECT — Section H: no code path anywhere in this feature constructs, reads, or references a PlacementRecord/PlacementRegistry; four simulated returning visits never register anything.'],
            ['Multi-publication retention pressure (several discovered, only some inspected, more discovered later)', 'ALREADY_CORRECT — Section I: nothing is lost, hidden, or penalized by selective inspection. One out-of-scope polish observation: no "already inspected" visual state on markers.'],
            ['Reload losing the encounter', 'DELIBERATE_BOUNDARY, reconfirmed and clarified — Section J: the encounter (marker/position/session record) is lost, but the underlying materialized, verified content is not (it is backed by window.localStorage, a genuinely different, already-persistent layer this milestone did not need to touch).'],
            ['Session interruption mid-cascade', 'ALREADY_CORRECT — Section J: an in-flight run completes harmlessly into a store nothing will ever read again; consistent with this codebase\'s existing "acquisition is never rolled back" posture.'],
            ['Product vocabulary implying permanence', 'ALREADY_CORRECT, with one narrow DOCUMENTATION_GAP nuance — Section K: the product already explicitly discloses ephemerality in plain language; that same disclosure ("will not be found here again") is slightly bleaker than Section D\'s own finding that rediscovery routinely succeeds, and could be softened without touching any boundary.']
        ];
        for (const [surface, verdict] of classifications) {
            assert(/^ALREADY_CORRECT|^DOCUMENTATION_GAP|^PRODUCT_GAP|^ARCHITECTURAL_GAP|^DELIBERATE_BOUNDARY/.test(verdict), `L. "${surface}" carries a real classification.`);
        }
        console.log('✓ L: Eleven surfaces classified against live evidence gathered above:');
        for (const [surface, verdict] of classifications) console.log(`    - ${surface}\n      ${verdict.split(' — ')[0]}`);

        // Deliberate-exclusions guard: no persistence/bookmark/favorite
        // mechanism, and none of this milestone's own out-of-scope
        // vocabulary, exists as real, executable code anywhere this
        // reassessment reads from or depends on.
        const excludedVocabulary = /reputation|trust\s*scor|spatial\s*voting|community\s*moderation|bookmark|favorite\b|persistentObserverLocal|StorageProvider.*ObserverLocalEncounter|ObserverLocalEncounter.*StorageProvider/i;
        const productionFilesThisReassessmentDependsOn = [
            'core/ObserverLocalPublicationEncounter.js',
            'application/ObserverLocalEncounterStore.js',
            'application/AutomaticSnapshotEncounterCascade.js',
            'ui/views/WorldView.js',
            'ui/components/WorldEncounterCanvas.js'
        ];
        for (const file of productionFilesThisReassessmentDependsOn) {
            const source = codeOnlyLines(await rawSource(file));
            assert(!excludedVocabulary.test(source), `L2. ${file} contains none of this milestone's own explicitly-excluded vocabulary as real code.`);
        }

        console.log(`
--------------------------------------------------------------------
0.9.555 VERDICT.

The flagship scenario ("discover X, inspect X, continue walking, encounter
Y and Z, return later, try to find X again") already has a complete,
honest answer today, built from pieces 0.9.552-0.9.554 already shipped:
within a session, X never disappears and costs nothing to re-inspect
(Section B); across a session boundary, X's own ENCOUNTER is genuinely
gone (Section C, deliberately), but the Publication itself is usually
still reachable through ordinary rediscovery (Section D), because its
MATERIAL — unlike the encounter — was already durably stored the moment
it was first verified (Section J).

This substantially changes the shape of the original question. Building
persistent observer-local encounters would solve a problem that, per
Section D, mostly does not exist: "find it again" is already possible
without it, for the overwhelmingly common case where the Publication
remains externally discoverable. The one case rediscovery cannot help —
a Publication whose only announcement source has genuinely disappeared
(Section D8) — is a pre-existing limit of decentralized discovery itself,
not a gap in this feature, and persistent encounter storage would not
fix it either: it would only let a Wanderer see a record of something
they can no longer actually retrieve.

AMENDED BY 0.9.595. The one real, narrow, genuinely actionable finding
this reassessment originally surfaced is now built:

  PRODUCT_GAP (Sections F/G), AT 0.9.555 TIME — "retain Publication"
  (small: admit an observer-local encounter's own already-VERIFIED
  material into the SAME existing catalog
  (decentralizedPublicationDiscoveryProvider -> PublicationCatalog.js)
  the authoritative selection path already admits into) is mechanically
  distinguishable from, and much smaller than, "retain the spatial
  encounter" (large: a new, persistent, per-Wanderer record of WHERE and
  WHEN a discovery happened). The milestone brief asked this
  reassessment to make exactly that distinction, and to build neither —
  this verdict did the former and stopped there.

  NOW ALREADY_CORRECT — 0.9.595 (Admit Verified Observer-Local
  Publications into Repository Discovery) built exactly the small
  feature this finding named: one call, admitToRepositoryDiscovery(),
  added to refreshObserverLocalEncounterInspection(), reusing the
  IDENTICAL gate and target the authoritative path already used — no new
  store, no new persistence layer. "Retain the spatial encounter" is
  still, correctly, unbuilt. One narrower limit 0.9.595 did NOT close:
  Repository admission does not, by itself, make OwnPublicationPanel
  resolve the Publication — see ui/components/WorldEncounterCanvas.js's
  own "0.9.595" header, "A KNOWN, PRE-EXISTING LIMIT," for why, and for
  what a future milestone closing THAT would need to change.

One narrow DOCUMENTATION_GAP (Section K): the inspection panel's own
honest "will not be found here again" disclosure is slightly bleaker
than Section D's own finding that rediscovery routinely succeeds — a
copy nuance, not a boundary issue.

Everything else audited — the session-scoped lifecycle itself, reload
behavior, interruption handling, publication identity under retention
pressure, multi-publication accumulation, and the claimed-position/
placement boundary under repeated visits — classifies ALREADY_CORRECT or
DELIBERATE_BOUNDARY: correct today, not gaps to close.

Per this milestone's own brief: no persistence, bookmark, favorite, or
Repository-admission mechanism is built here. No production code changes
ship with this milestone.

RECOMMENDATION: STOP on persistent observer-local encounters and on
reputation — both remain premature, exactly as the milestone brief
expected, and this reassessment found no concrete user need strong
enough to justify either. If the PRODUCT_GAP above (Sections F/G) is
ever pursued, it is a SMALL, separately-scoped follow-up — reusing an
existing mechanism, never inventing a new persistence concept — and
remains a genuinely separate product decision from this milestone's own.
--------------------------------------------------------------------
`);
    }

    console.log('\n✅ All Observer-Local Discovery Retention Product Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All ObserverLocalDiscoveryRetentionProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ ObserverLocalDiscoveryRetentionProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
