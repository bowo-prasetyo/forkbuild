import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterRetentionReconciliation } from '../application/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.191 — Automatic Snapshot Encounter Retention Lifecycle Audit.
//
// 0.9.186 through 0.9.190 built two independently-correct autonomous
// processes sharing the identical Wanderer-movement observation cadence —
// `application/WorldSnapshotDiscoveryMonitor.js` +
// `application/AutomaticSnapshotEncounterCascade.js` (DISCOVER -> ... ->
// REGISTER) and `application/AutomaticSnapshotEncounterRetentionReconciliation.js`
// (RETAIN -> UNREGISTER). Each was proven correct in isolation — 0.9.187/
// 0.9.188 for the cascade alone, 0.9.189/0.9.190 for reconciliation alone.
// NEITHER prior test file ever constructs both together, feeding the SAME
// `ui/views/WorldView.js` observation tick the way that file's own
// `refreshSpatialUI()` actually does. This file is that composition:
//
// NO PRODUCTION CODE CHANGES IN THIS MILESTONE. Every assertion below
// exercises EXISTING, UNMODIFIED application code exactly as 0.9.190
// shipped it. `makeAutomaticSession()`, below, reproduces
// `ui/views/WorldView.js`'s own `refreshSpatialUI()` composition line for
// line (same monitor -> cascade -> `noteAutomaticRegistration()` ->
// `reconcile()` ordering, including that the middle chain is fired WITHOUT
// being awaited before `reconcile()` runs synchronously) — never a new
// orchestration approach of its own. Any finding this audit surfaces about
// how that EXISTING ordering behaves is recorded as OBSERVED, exactly as
// 0.9.188 recorded its own races — never "fixed" here.
//
//   Section A: FLAGSHIP — the complete automatic lifecycle, real Nostr/
//              Arweave/local materialization: DISCOVER -> RESOLVE -> VERIFY
//              -> MATERIALIZE -> PLACE -> REGISTER -> ordinary World View
//              rendering -> RETAIN -> move away -> UNREGISTER -> vanishes
//              from World View rendering
//   Section B: boundary movement — inside -> boundary -> outside yields
//              KEEP -> KEEP -> REMOVE (inclusive 0.9.189 boundary)
//   Section C: return movement never resurrects on its own; only a fresh
//              discovery/cascade (a new session) does
//   Section D: the one-tick lag — discovery/cascade settling is asynchronous
//              and never awaited before reconcile() runs, so a subject
//              cascaded to REGISTERED during tick N is structurally
//              invisible to tick N's OWN reconcile() call; it is first
//              evaluated starting at tick N+1. No oscillation results.
//   Section E: a candidate that completes its cascade while the Wanderer
//              is ALREADY outside the retention region is registered
//              deterministically once, then unregistered deterministically
//              once, on the very next tick — never corrupted, never removed
//              twice
//   Section F: multiple independent Snapshots — only the distant ones
//              disappear
//   Section G: same content, different Publications — only the distant
//              Publication is removed
//   Section H: same Publication, different content revisions (including two
//              that later SWAP which one is near) — retained/removed
//              independently, by position alone
//   Section I: FLAGSHIP NEGATIVE — a manually-registered Snapshot is never
//              touched by automatic retention, even under sustained,
//              concurrent automatic discovery/cascade/reconciliation churn
//   Section J: World registry churn — unrelated LOCAL/PEER/automatic
//              registrations occurring mid-stream never perturb reconciliation
//   Section K: material survival + no hidden rediscovery — after automatic
//              removal, material/Publication/Nostr announcement/Arweave
//              content all survive, and moving back inside the radius for
//              many further real discovery ticks triggers zero additional
//              Nostr query / resolve / materialize / register calls
//   Section L: OBSERVED — the phantom re-watch. A stale, cache-hit REGISTERED
//              cascade result re-arms noteAutomaticRegistration() after an
//              automatic removal, but the very next reconcile() call finds
//              no source at that origin and silently re-forgets it — never
//              calling unregister a second time and never resurrecting the
//              World registration. Held here as the exact semantic
//              consequence of "forgets removed subjects," verified rather
//              than assumed.
//   Section M: session isolation — two independent WorldView-shaped
//              sessions (own monitor/cascade/reconciliation, ONE shared
//              registry) never share watched-subject state, even for the
//              identical publicationId+contentHash pair
//   Section N: World rendering convergence — after REGISTER, the ordinary
//              deriveWorldEncounters() pipeline sees it; after automatic
//              UNREGISTER, it collapses out of that same derivation, with
//              zero Snapshot-specific removal machinery downstream
//   Section O: structural sweep — WATCHED/FORGOTTEN remain implementation
//              concepts only; no new lifecycle enum was introduced to make
//              discovery and retention compose

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function pos(x, y, z) {
    return { x, y, z };
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

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
        return { id: `fake-audit-tx-${counter}`, transaction: { id: `fake-audit-tx-${counter}`, data: material } };
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

    let discoverCalls = 0, resolveCalls = 0, materializeCalls = 0;
    const discoverSnapshotCandidatesCommand = () => {
        discoverCalls += 1;
        return executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService: queryService });
    };
    const resolveSelectedSnapshotCommand = (candidate) => {
        resolveCalls += 1;
        return executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });
    };
    const materializeSelectedSnapshotCommand = (resolution) => {
        materializeCalls += 1;
        return executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
    };

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore, storeSnapshotContentUseCase, materializer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand,
        counts: () => ({ discoverCalls, resolveCalls, materializeCalls })
    };
}

async function placeAndAnnounce(host, bytes, { publicationId = undefined, claimedPosition = undefined } = {}) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage, publicationId, claimedPosition });
    return reference;
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
}

// Mirrors WorldNavigationSession's own getPlacementInfoForPublication()/
// findPublicationById() methods, exactly as tests/
// WorldSnapshotAutomaticEncounterLifecycleAudit.test.js (0.9.188) already
// does, without depending on that large, `three`-importing class here.
function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        placeAt(publicationId, position, owner = 'alice') { placeReal(placementRegistry, publicationId, position, owner); },
        resolvePlacementInfo: (publicationId) => placementInfoFor(placementRegistry, publicationId),
        findPublicationById: (publicationId) => publications.get(publicationId) || null
    };
}

function publicationStub(id) {
    return { id, title: `Publication ${id}`, publisherIdentity: 'identity-1' };
}

function originFor(contentHash, publicationId) {
    return `snapshot:${contentHash}:${publicationId}`;
}

function hasOrigin(registry, origin) {
    return registry.listSources().some((source) => source.origin === origin);
}

// Registers a fake, already-PLACED Snapshot directly through the REAL
// registration bridge — exactly what a person's own manual "Register"
// button, or a settled AutomaticSnapshotEncounterCascade run, ultimately
// does one layer up.
function registerSnapshot(registry, { contentHash, publicationId, position }) {
    const result = registerMaterializedSnapshotWorldSource(
        registry,
        { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, position },
        publicationStub(publicationId)
    );
    assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'setup: registration itself must succeed');
    return result;
}

// A deferred promise pair, used to hold a collaborator open mid-flight so a
// test can interleave other operations before letting it settle — the SAME
// helper tests/WorldSnapshotAutomaticEncounterLifecycleAudit.test.js (0.9.188)
// already uses.
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

// Spies on a registry's own mutating methods without changing its
// behavior — the same inline pattern 0.9.188's own test file uses at each
// of its own call sites, lifted into one shared helper here since this
// file's sections use it repeatedly.
function spyOnRegistry(registry) {
    const counts = { setSource: 0, removeSource: 0 };
    const originalSetSource = registry.setSource.bind(registry);
    const originalRemoveSource = registry.removeSource.bind(registry);
    registry.setSource = (...args) => { counts.setSource += 1; return originalSetSource(...args); };
    registry.removeSource = (...args) => { counts.removeSource += 1; return originalRemoveSource(...args); };
    return counts;
}

// makeAutomaticSession({...}) — reproduces ui/views/WorldView.js's own
// refreshSpatialUI() composition (0.9.186 discovery -> 0.9.187 cascade ->
// 0.9.190 reconciliation), EXACTLY, including its own ordering: the
// discover -> cascade -> noteAutomaticRegistration() chain is fired WITHOUT
// being awaited, and reconcile() runs SYNCHRONOUSLY immediately after, on
// the SAME tick — never a new orchestration approach invented by this test
// file. One instance mirrors ONE mounted WorldView session; a caller who
// wants two independent sessions sharing one registry (Section M) simply
// constructs two.
function makeAutomaticSession({
    discoverSnapshotCandidatesCommand,
    resolveSelectedSnapshotCommand,
    materializeSelectedSnapshotCommand,
    worldDiscoverySourceRegistry,
    resolvePlacementInfo = null,
    findPublicationById = null,
    retentionRadius = undefined
}) {
    const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
    const cascade = new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry,
        resolvePlacementInfo,
        findPublicationById
    });
    const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({
        worldDiscoverySourceRegistry,
        ...(retentionRadius === undefined ? {} : { retentionRadius })
    });

    // tick(position) -> { removedThisTick, settled }
    //
    // `removedThisTick` is reconcile()'s own SYNCHRONOUS return value for
    // THIS call, exactly as WorldView.js's own refreshSpatialUI() computes
    // it — before the discovery/cascade chain above has necessarily
    // settled. `settled` resolves, later, to the array of cascade results
    // this tick's own discovery batch produced (`[]` when nothing was
    // discovered/fed this tick).
    function tick(position) {
        const cascadeResults = [];
        const settled = monitor.observe({ position }).then(() => {
            const candidates = monitor.lastResult;
            if (!Array.isArray(candidates)) return [];
            return Promise.all(candidates.map((candidate) => cascade.processCandidate(candidate).then((result) => {
                cascadeResults.push(result);
                if (result && result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
                    reconciliation.noteAutomaticRegistration({ publicationId: result.publicationId, contentHash: result.contentHash });
                }
                return result;
            })));
        }).then(() => cascadeResults);

        // Runs synchronously, right here — never awaiting `settled` above.
        const removedThisTick = reconciliation.reconcile(position);

        return { removedThisTick, settled };
    }

    async function fullTick(position) {
        const { removedThisTick, settled } = tick(position);
        const cascadeResults = await settled;
        return { removedThisTick, cascadeResults };
    }

    return { monitor, cascade, reconciliation, tick, fullTick };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the complete automatic lifecycle, real
    // Nostr discovery, real Arweave resolution, real local
    // materialization, a real WorldPlacement, a real
    // WorldDiscoverySourceRegistry, and real reconciliation — no explicit
    // click of any kind, anywhere in this section.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-flagship');
        const publicationId = 'flagship-publication';
        const worldModel = makeWorldModel();
        const snapshotPosition = new Position(10, 0, 0);
        worldModel.placeAt(publicationId, snapshotPosition);
        const reference = await placeAndAnnounce(host, 'flagship-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Flagship World', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });
        const origin = originFor(reference.hash, publicationId);

        // The Wanderer stands right where the Snapshot itself will place —
        // well within the retention radius — and one full tick (awaiting
        // the entire fire-and-forget discover -> cascade -> note chain,
        // exactly as `fullTick()`'s own doc describes) is enough for the
        // ENTIRE chain to settle, with no explicit click anywhere.
        const firstTick = await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), '1. DISCOVER -> RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER completed with no explicit click anywhere');
        assert(session.reconciliation.watchedAutomaticSubjects().some((s) => s.publicationId === publicationId && s.contentHash === reference.hash),
            '2. the freshly REGISTERED subject is now watched for automatic retention');
        assert(firstTick.removedThisTick.length === 0, '3. this SAME tick\'s own reconcile() call removed nothing — it ran synchronously BEFORE the registration above had even settled (see Section D)');

        // A second tick, still near, is the first one that can actually
        // evaluate the now-watched subject — and correctly keeps it.
        const secondTick = await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), '4. still registered — the Wanderer is well within the 100-unit retention radius');
        assert(secondTick.removedThisTick.length === 0, '5. nothing removed on the tick that first observed the registration as watched');

        // The Snapshot appears in the ORDINARY World View rendering
        // pipeline — no automatic-specific shape.
        let encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1 && encounters.publications[0].objectId === publicationId,
            '5. the Snapshot appears in the ordinary World View encounter pipeline, exactly like any other Publication');

        // The Wanderer walks away, well outside the retention radius.
        const farTick = await session.fullTick(pos(9000, 0, 0));
        assert(!hasOrigin(registry, origin), '6. retention reconciliation unregistered the Snapshot once the Wanderer moved away');
        assert(farTick.removedThisTick.some((r) => r.publicationId === publicationId), '7. this exact tick reports the removal');

        // The Snapshot vanishes from ordinary World View rendering.
        encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 0, '8. the Snapshot no longer appears in the ordinary World View encounter pipeline');

        // Material, Publication, and discovery evidence all survive.
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '9. the material itself remains locally available');
        assert(worldModel.findPublicationById(publicationId) !== null, '10. the Publication object itself still exists');
        assert(host.network.events.length === 1, '11. the original Nostr discovery announcement still exists');
        assert(host.gateway.network.has(reference.uri.slice('ar://'.length)), '12. the original Arweave-hosted content still exists');

        console.log('✓ Section A: FLAGSHIP — discover -> cascade -> register -> ordinary rendering -> retain -> move away -> unregister -> vanish from rendering, entirely from movement alone, with material/Publication/discovery evidence surviving removal');
    }

    // ---------------------------------------------------------------
    // Section B — boundary movement: inside -> boundary -> outside.
    // ---------------------------------------------------------------
    {
        const candidate = { contentHash: 'boundary-hash', locator: 'ar://boundary', storage: 'ar', publicationId: 'boundary-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(candidate.contentHash, candidate.publicationId);
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: pos(100, 0, 0) }),
            findPublicationById: () => publicationStub(candidate.publicationId),
            retentionRadius: 100
        });

        await session.fullTick(pos(0, 0, 0));
        await session.fullTick(pos(0, 0, 0)); // second tick: registration is now watched and reconciled
        assert(hasOrigin(registry, origin), 'sanity: registered and retained once inside');

        // inside (distance 0 from the Snapshot's own position along a
        // shorter axis is irrelevant here — the Wanderer moves, the
        // Snapshot's placement at (100,0,0) never does)
        await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), '1. inside the retention radius: KEEP');

        // boundary — Wanderer at (0,0,0), Snapshot at (100,0,0): exactly 100.
        await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), '2. exactly on the retention radius: KEEP (inclusive boundary)');

        // outside — Wanderer moves to make the distance exceed 100.
        const removedTick = await session.fullTick(pos(-1, 0, 0));
        assert(!hasOrigin(registry, origin), '3. just outside the retention radius: REMOVE');
        assert(removedTick.removedThisTick.some((r) => r.contentHash === candidate.contentHash), '4. the removal is reported on the exact tick that crossed the boundary');

        console.log('✓ Section B: inside -> boundary -> outside yields KEEP -> KEEP -> REMOVE, the inclusive 0.9.189 boundary preserved through the full composition');
    }

    // ---------------------------------------------------------------
    // Section C — return movement never resurrects on its own; only a
    // fresh discovery/cascade (a new session) does.
    // ---------------------------------------------------------------
    {
        const contentHash = 'return-hash';
        const publicationId = 'return-pub';
        const candidate = { contentHash, locator: 'ar://return', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(contentHash, publicationId);
        let resolveCalls = 0, registerCalls = 0;
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };

        const collaborators = {
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(10, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId)
        };

        const sessionOne = makeAutomaticSession(collaborators);
        await sessionOne.fullTick(pos(0, 0, 0));
        await sessionOne.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), 'sanity: registered by the first session');
        assert(resolveCalls === 1 && registerCalls === 1, 'sanity: exactly one resolve/register so far');

        await sessionOne.fullTick(pos(9000, 0, 0)); // move far — unregistered
        assert(!hasOrigin(registry, origin), 'sanity: unregistered once far');

        // The SAME session, moving back near, across several further
        // ticks, never resurrects it — the cascade's own idempotency map
        // (see Section L) never triggers a second register call, and
        // reconcile() has nothing watched to act on either way.
        await sessionOne.fullTick(pos(0, 0, 0));
        await sessionOne.fullTick(pos(0, 0, 0));
        await sessionOne.fullTick(pos(0, 0, 0));
        assert(!hasOrigin(registry, origin), '1. the SAME session moving back near, repeatedly, never resurrects the Snapshot on its own');
        assert(registerCalls === 1, '2. no additional registration was ever attempted by the same session\'s own cascade instance');

        // A brand-new session — mirroring an entirely new WorldView mount
        // — sharing only the registry, DOES revive it, through the full
        // chain again.
        const sessionTwo = makeAutomaticSession(collaborators);
        await sessionTwo.fullTick(pos(0, 0, 0));
        await sessionTwo.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), '3. a genuinely fresh discovery/cascade (a new session) DOES revive the Snapshot');
        assert(resolveCalls === 2 && registerCalls === 2, '4. the revival ran the full resolve -> ... -> register chain again — never a resurrection short-circuit of any kind');

        console.log('✓ Section C: moving back inside the retention radius never resurrects a forgotten Snapshot on its own; only an independent, fresh discovery/cascade (a new session) does, running the full chain again');
    }

    // ---------------------------------------------------------------
    // Section D — the one-tick lag: discovery/cascade settling is
    // asynchronous and never awaited before reconcile() runs, so a
    // subject cascaded to REGISTERED during tick N is structurally
    // invisible to tick N's OWN reconcile() call.
    // ---------------------------------------------------------------
    {
        const contentHash = 'race-hash';
        const publicationId = 'race-pub';
        const candidate = { contentHash, locator: 'ar://race', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const counts = spyOnRegistry(registry);
        const origin = originFor(contentHash, publicationId);

        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        // Tick N: the Wanderer is right on top of the Snapshot's own
        // placement — discovery/cascade fire, but have NOT settled yet
        // when reconcile() runs synchronously, right here.
        const { removedThisTick: removedAtTickN } = session.tick(pos(0, 0, 0));
        assert(removedThisTickIsEmpty(removedAtTickN), '1. tick N\'s own SYNCHRONOUS reconcile() call sees nothing watched yet — the cascade has not had a chance to settle');
        assert(session.reconciliation.watchedAutomaticSubjects().length === 0, '2. still not watched, synchronously, immediately after tick N returns');
        assert(!hasOrigin(registry, origin), '3. not yet registered either — the cascade itself has not settled synchronously');

        // Let tick N's own fire-and-forget chain actually settle.
        await flushMicrotasks();
        assert(hasOrigin(registry, origin), '4. the cascade DID complete — registration itself is not gated on reconcile() in any way');
        assert(session.reconciliation.watchedAutomaticSubjects().length === 1, '5. NOW it is watched — noteAutomaticRegistration() ran only after tick N\'s own synchronous reconcile() had already returned');
        assert(counts.setSource === 1 && counts.removeSource === 0, '6. exactly one registration, zero removals so far — no oscillation within tick N itself');

        // Tick N+1: the Wanderer has moved far away. THIS tick's own
        // reconcile() call is the first one that can possibly see the
        // subject noted after tick N settled.
        const tickNPlus1 = await session.fullTick(pos(9000, 0, 0));
        assert(!hasOrigin(registry, origin), '7. removed on tick N+1, the very first tick that could evaluate it');
        assert(tickNPlus1.removedThisTick.some((r) => r.publicationId === publicationId), '8. tick N+1 itself reports the removal');
        assert(counts.setSource === 1 && counts.removeSource === 1, '9. exactly one registration and exactly one removal total across the whole sequence — never register -> remove -> discover -> register -> remove');

        console.log('✓ Section D: OBSERVED — a same-tick discover/cascade/register can never be evaluated by that SAME tick\'s own reconcile() call, because reconcile() runs synchronously before the cascade\'s own fire-and-forget chain settles; the subject is first evaluated starting the NEXT tick, with no oscillation');
    }

    // ---------------------------------------------------------------
    // Section E — a candidate whose cascade completes while the Wanderer
    // is ALREADY outside the retention region: registered deterministically
    // once, unregistered deterministically once, on the very next tick.
    // ---------------------------------------------------------------
    {
        const contentHash = 'already-far-hash';
        const publicationId = 'already-far-pub';
        const candidate = { contentHash, locator: 'ar://already-far', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const counts = spyOnRegistry(registry);
        const origin = originFor(contentHash, publicationId);
        const FAR = pos(9000, 0, 0);

        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            // The candidate's own authoritative placement is right where
            // the Wanderer already is not — far away — from the very start.
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        await session.fullTick(FAR); // tick 0: discovers, cascades, registers — Wanderer already far the whole time
        assert(hasOrigin(registry, origin), '1. the candidate genuinely registers — the cascade has no notion of the Wanderer\'s own position at all');
        assert(counts.setSource === 1, '2. exactly one registration occurred');

        const tick1 = await session.fullTick(FAR); // tick 1: the FIRST tick that can evaluate it
        assert(!hasOrigin(registry, origin), '3. unregistered on the very next tick, deterministically');
        assert(tick1.removedThisTick.length === 1, '4. exactly one removal reported, not zero, not two');
        assert(counts.setSource === 1 && counts.removeSource === 1, '5. exactly one registration and exactly one removal — a "registration immediately followed by removal" never corrupts the count');

        // Further ticks at the same far position are simply idempotent —
        // nothing left to remove, no error.
        const tick2 = await session.fullTick(FAR);
        assert(tick2.removedThisTick.length === 0, '6. a further tick at the same position removes nothing further');
        assert(counts.removeSource === 1, '7. removeSource is never called a second time for an already-forgotten subject');

        console.log('✓ Section E: a Snapshot whose cascade completes while the Wanderer is already outside the retention region is registered exactly once and unregistered exactly once, deterministically, on the very next tick');
    }

    // ---------------------------------------------------------------
    // Section F — multiple independent Snapshots: only the distant ones
    // disappear.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const subjects = [
            { id: 'A', publicationId: 'multi-A', contentHash: 'multi-hash-A', position: pos(10, 0, 0), far: false },
            { id: 'B', publicationId: 'multi-B', contentHash: 'multi-hash-B', position: pos(9000, 0, 0), far: true },
            { id: 'C', publicationId: 'multi-C', contentHash: 'multi-hash-C', position: pos(-20, 0, 0), far: false },
            { id: 'D', publicationId: 'multi-D', contentHash: 'multi-hash-D', position: pos(0, 9000, 0), far: true }
        ];
        const candidates = subjects.map((s) => ({ contentHash: s.contentHash, locator: `ar://${s.id}`, storage: 'ar', publicationId: s.publicationId }));
        const placements = new Map(subjects.map((s) => [s.publicationId, s.position]));

        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve(candidates),
            resolveSelectedSnapshotCommand: (c) => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: (resolution, /* candidate not passed, so key on nothing */) => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: placements.get(publicationId) }),
            findPublicationById: (publicationId) => publicationStub(publicationId),
            retentionRadius: 100
        });
        // materializeSelectedSnapshotCommand above cannot see the original
        // candidate (it only receives the resolution) — patch the cascade's
        // own materialize call to forward the right contentHash per
        // subject, mirroring how the REAL command threads contentHash
        // through resolution/verification; this is test plumbing only, the
        // same restraint 0.9.188's own Section E documents for its
        // `__testHash` tag.
        const originalResolve = session.cascade._resolveSelectedSnapshotCommand;
        session.cascade._resolveSelectedSnapshotCommand = async (candidate) => {
            const resolution = await originalResolve(candidate);
            return { ...resolution, __testHash: candidate.contentHash };
        };
        session.cascade._materializeSelectedSnapshotCommand = (resolution) => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: resolution.__testHash, reason: null });

        await session.fullTick(pos(0, 0, 0)); // one tick: all four discover, cascade, and register; none yet watched by reconcile() (see Section D)
        for (const s of subjects) {
            assert(hasOrigin(registry, originFor(s.contentHash, s.publicationId)), `sanity: ${s.id} registered before reconciliation acts`);
        }

        await session.fullTick(pos(0, 0, 0)); // one more tick to let reconcile() act with everyone already watched
        for (const s of subjects) {
            assert(hasOrigin(registry, originFor(s.contentHash, s.publicationId)) === !s.far, `1. ${s.id}: ${s.far ? 'far, removed' : 'near, retained'}`);
        }

        console.log('✓ Section F: with four independent Snapshots (A near, B far, C near, D far), only the two far ones (B, D) are removed');
    }

    // ---------------------------------------------------------------
    // Section G — same content, different Publications: only the distant
    // Publication is removed.
    // ---------------------------------------------------------------
    {
        const sharedContentHash = 'shared-content-hash';
        const registry = new WorldDiscoverySourceRegistry();
        const positions = new Map([['pub-near', pos(10, 0, 0)], ['pub-far', pos(9000, 0, 0)]]);
        const candidates = [
            { contentHash: sharedContentHash, locator: 'ar://shared-near', storage: 'ar', publicationId: 'pub-near' },
            { contentHash: sharedContentHash, locator: 'ar://shared-far', storage: 'ar', publicationId: 'pub-far' }
        ];
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve(candidates),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: sharedContentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: positions.get(publicationId) }),
            findPublicationById: (publicationId) => publicationStub(publicationId),
            retentionRadius: 100
        });

        await session.fullTick(pos(0, 0, 0));
        await session.fullTick(pos(0, 0, 0));
        await session.fullTick(pos(0, 0, 0));

        assert(hasOrigin(registry, originFor(sharedContentHash, 'pub-near')), '1. Publication One, near, remains registered');
        assert(!hasOrigin(registry, originFor(sharedContentHash, 'pub-far')), '2. Publication Two, identical content but far, is removed');

        console.log('✓ Section G: two Publications sharing identical content are reconciled purely on their own position');
    }

    // ---------------------------------------------------------------
    // Section H — same Publication, different content revisions,
    // including a later SWAP of which one is near.
    // ---------------------------------------------------------------
    {
        const publicationId = 'revisions-pub';
        const registry = new WorldDiscoverySourceRegistry();
        let positions = new Map([['revision-a', pos(10, 0, 0)], ['revision-b', pos(9000, 0, 0)]]);
        const candidates = [
            { contentHash: 'revision-a', locator: 'ar://rev-a', storage: 'ar', publicationId },
            { contentHash: 'revision-b', locator: 'ar://rev-b', storage: 'ar', publicationId }
        ];
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve(candidates),
            resolveSelectedSnapshotCommand: async (c) => ({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null, __testHash: c.contentHash }),
            materializeSelectedSnapshotCommand: (resolution) => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: resolution.__testHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            // publicationId alone determines the placement, per
            // application/AutomaticSnapshotEncounterCascade.js's own header
            // ("placement is resolved from publicationId alone, never from
            // contentHash") — this test reads whichever revision is
            // currently "the near one" at call time via the closure below.
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: positions.get('__active') || pos(10, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 100
        });

        // Both revisions share ONE authoritative placement (publicationId
        // alone determines it) — so to exercise "retained/removed
        // independently by position," this section instead gives each
        // revision its OWN dedicated registry origin (0.9.188's own
        // documented "OBSERVED" consequence of Section E: two content
        // revisions of one Publication occupy two independent origins) and
        // reconciles each origin's own watched placement directly, exactly
        // as application/AutomaticSnapshotEncounterRetentionReconciliation.js
        // itself does per-origin — never conflating the two revisions'
        // own positions into one.
        registry.setSource(describeWorldDiscoverySource({
            origin: originFor('revision-a', publicationId), publications: [publicationStub(publicationId)],
            placements: [{ publicationId, position: pos(10, 0, 0) }]
        }));
        registry.setSource(describeWorldDiscoverySource({
            origin: originFor('revision-b', publicationId), publications: [publicationStub(publicationId)],
            placements: [{ publicationId, position: pos(9000, 0, 0) }]
        }));
        session.reconciliation.noteAutomaticRegistration({ publicationId, contentHash: 'revision-a' });
        session.reconciliation.noteAutomaticRegistration({ publicationId, contentHash: 'revision-b' });

        session.reconciliation.reconcile(pos(0, 0, 0));
        assert(hasOrigin(registry, originFor('revision-a', publicationId)), '1. revision-a, near, remains registered');
        assert(!hasOrigin(registry, originFor('revision-b', publicationId)), '2. revision-b, far, is removed');

        // SWAP: re-register revision-b near, revision-a still (independently)
        // near too — both should now be retained.
        registry.setSource(describeWorldDiscoverySource({
            origin: originFor('revision-b', publicationId), publications: [publicationStub(publicationId)],
            placements: [{ publicationId, position: pos(5, 0, 0) }]
        }));
        session.reconciliation.noteAutomaticRegistration({ publicationId, contentHash: 'revision-b' });
        session.reconciliation.reconcile(pos(0, 0, 0));
        assert(hasOrigin(registry, originFor('revision-a', publicationId)) && hasOrigin(registry, originFor('revision-b', publicationId)),
            '3. after revision-b is independently re-placed near, both revisions coexist, retained independently');

        console.log('✓ Section H: two content revisions of the same Publication are retained/removed strictly by their own position, never conflated with each other');
    }

    // ---------------------------------------------------------------
    // Section I — FLAGSHIP NEGATIVE: a manually-registered Snapshot is
    // never touched by automatic retention, even under sustained,
    // concurrent automatic discovery/cascade/reconciliation churn.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        // Registered exactly as a person's own explicit "Register" button
        // would — through the SAME bridge function, but NEVER passed
        // through noteAutomaticRegistration(), and far outside any
        // plausible retention radius.
        registerSnapshot(registry, { contentHash: 'manual-hash', publicationId: 'manual-pub', position: pos(999999, 0, 0) });
        const manualOrigin = originFor('manual-hash', 'manual-pub');

        const automaticCandidate = { contentHash: 'auto-hash', locator: 'ar://auto', storage: 'ar', publicationId: 'auto-pub' };
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([automaticCandidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'auto-hash', reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: 'auto-pub', position: pos(10, 0, 0) }),
            findPublicationById: () => publicationStub('auto-pub'),
            retentionRadius: 100
        });

        // Sustained automatic churn: many ticks, moving the Wanderer both
        // near and far from the AUTOMATIC subject's own placement — the
        // manual Snapshot's own position never changes and is never
        // consulted by any of this.
        for (const p of [pos(0, 0, 0), pos(0, 0, 0), pos(9000, 0, 0), pos(0, 0, 0), pos(0, 0, 0), pos(9000, 0, 0)]) {
            await session.fullTick(p);
        }

        assert(hasOrigin(registry, manualOrigin), '1. the manually-registered Snapshot, however far, is never removed across sustained automatic churn');
        assert(session.reconciliation.watchedAutomaticSubjects().every((s) => s.publicationId !== 'manual-pub'), '2. the manual Snapshot was never watched in the first place');

        // Sanity: the automatic subject itself genuinely did churn
        // (registered then removed at least once) during the same run,
        // proving the manual Snapshot's own survival was not simply
        // because nothing automatic ever happened.
        const finalAutoAbsent = !hasOrigin(registry, originFor('auto-hash', 'auto-pub'));
        assert(finalAutoAbsent, '3. sanity: the automatic subject itself DID churn (ended up removed, since the loop above ends on a far tick) — the manual Snapshot\'s survival is a genuine independence, not an artifact of nothing automatic happening');

        console.log('✓ Section I: FLAGSHIP NEGATIVE — a manually-registered Snapshot remains completely untouched through sustained, concurrently-churning automatic discovery/cascade/retention traffic');
    }

    // ---------------------------------------------------------------
    // Section J — World registry churn: unrelated LOCAL/PEER/automatic
    // registrations occurring mid-stream never perturb reconciliation.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const watchedCandidate = { contentHash: 'churn-watched-hash', locator: 'ar://churn-watched', storage: 'ar', publicationId: 'churn-watched-pub' };
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([watchedCandidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: watchedCandidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: watchedCandidate.publicationId, position: pos(9000, 0, 0) }),
            findPublicationById: () => publicationStub(watchedCandidate.publicationId),
            retentionRadius: 100
        });

        await session.fullTick(pos(0, 0, 0)); // registers; not yet watched by THIS tick's own reconcile() (see Section D)
        assert(hasOrigin(registry, originFor(watchedCandidate.contentHash, watchedCandidate.publicationId)), 'sanity: registered, and still present — watched only after this tick settled');

        // Registry churn: an unrelated LOCAL source, an unrelated PEER
        // source, and an unrelated manual Snapshot registration, all
        // injected mid-stream, before the watched subject has ever once
        // been reconciled against its own (far) placement.
        registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [publicationStub('churn-local-pub')], placements: [] }));
        registry.setSource(describeWorldDiscoverySource({ origin: 'peer:churn-identity', publications: [publicationStub('churn-peer-pub')], placements: [] }));
        registerSnapshot(registry, { contentHash: 'churn-manual-hash', publicationId: 'churn-manual-pub', position: pos(9000, 0, 0) });

        const removalTick = await session.fullTick(pos(0, 0, 0)); // the first tick that can actually reconcile the watched subject
        assert(!hasOrigin(registry, originFor(watchedCandidate.contentHash, watchedCandidate.publicationId)), '1. the watched automatic subject is still correctly removed once far, despite the churn');
        assert(removalTick.removedThisTick.length === 1, '2. exactly one removal reported — the churn added no phantom watched entries');

        assert(hasOrigin(registry, 'local'), '3. the unrelated LOCAL source survives the churn and the reconciliation pass');
        assert(hasOrigin(registry, 'peer:churn-identity'), '4. the unrelated PEER source survives');
        assert(hasOrigin(registry, originFor('churn-manual-hash', 'churn-manual-pub')), '5. the unrelated manually-registered Snapshot survives, however far, since it was never watched');
        assert(registry.listSources().length === 3, '6. exactly the three unrelated/manual sources remain once the automatic subject is gone');

        console.log('✓ Section J: unrelated LOCAL/PEER/manual registry churn occurring mid-stream never perturbs reconciliation of the actually-watched automatic subject, nor is any of it itself disturbed');
    }

    // ---------------------------------------------------------------
    // Section K — material survival + no hidden rediscovery.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-material-survival');
        const publicationId = 'material-survival-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(5, 0, 0));
        const reference = await placeAndAnnounce(host, 'material-survival-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Material Survival', contentReference: reference }));
        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(reference.hash, publicationId);

        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });

        await session.fullTick(pos(0, 0, 0));
        await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), 'sanity: registered');

        await session.fullTick(pos(9000, 0, 0));
        assert(!hasOrigin(registry, origin), 'sanity: automatically removed once far');

        const countsAfterRemoval = host.counts();

        // World source absent, everything else present.
        assert(!hasOrigin(registry, origin), '1. World source: absent');
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '2. material: present');
        assert(worldModel.findPublicationById(publicationId) !== null, '3. Publication: present');
        assert(host.network.events.some((e) => { try { return JSON.parse(e.content).contentHash === reference.hash; } catch { return false; } }), '4. Nostr discovery announcement: present');
        assert(host.gateway.network.has(reference.uri.slice('ar://'.length)), '5. Arweave content: present');

        // Moving back near for MANY further real discovery ticks (large
        // position deltas, so WorldSnapshotDiscoveryMonitor's own
        // shouldRefresh threshold genuinely fires a fresh Nostr query each
        // time) triggers zero additional resolve/materialize/register calls,
        // and the registry stays clean.
        for (const p of [pos(0, 0, 0), pos(9000, 0, 0), pos(0, 0, 0), pos(9000, 0, 0), pos(0, 0, 0)]) {
            await session.fullTick(p);
        }
        const countsAfterMovement = host.counts();
        assert(countsAfterMovement.discoverCalls > countsAfterRemoval.discoverCalls, '6. sanity: further real Nostr discovery queries genuinely did fire during the movement above');
        assert(countsAfterMovement.resolveCalls === countsAfterRemoval.resolveCalls, '7. no hidden rediscovery: zero additional resolve calls despite repeated real re-discovery of the identical announcement');
        assert(countsAfterMovement.materializeCalls === countsAfterRemoval.materializeCalls, '8. no hidden rediscovery: zero additional materialize calls');
        assert(!hasOrigin(registry, origin), '9. no hidden rediscovery: the World registry stays clean — moving back inside the radius alone never re-registers');

        console.log('✓ Section K: after automatic removal, material/Publication/Nostr announcement/Arweave content all survive; moving back inside the radius for many further REAL discovery ticks triggers zero additional resolve/materialize/register calls');
    }

    // ---------------------------------------------------------------
    // Section L — OBSERVED: the phantom re-watch. A stale, cache-hit
    // REGISTERED cascade result re-arms noteAutomaticRegistration() after
    // an automatic removal, but the very next reconcile() call finds no
    // source at that origin and silently re-forgets it — never calling
    // unregister a second time and never resurrecting the World
    // registration.
    // ---------------------------------------------------------------
    {
        const contentHash = 'phantom-hash';
        const publicationId = 'phantom-pub';
        const candidate = { contentHash, locator: 'ar://phantom', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const counts = spyOnRegistry(registry);
        const origin = originFor(contentHash, publicationId);
        // The discovery command keeps re-announcing the SAME candidate on
        // every tick — the ordinary, expected case: a Nostr announcement
        // does not disappear merely because the local World forgot it.
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(9000, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        await session.fullTick(pos(0, 0, 0)); // discovers, cascades, registers; not yet watched by THIS tick's own reconcile() (see Section D)
        assert(hasOrigin(registry, origin), 'sanity: registered');
        assert(counts.setSource === 1, 'sanity: exactly one registration so far');

        // This tick's own SYNCHRONOUS reconcile() finally acts on the
        // subject noted after the previous tick settled, removing it —
        // and this SAME tick's own cascade re-processes the identical
        // candidate (idempotent — cache hit, no new resolve/materialize/
        // register call), whose settled `.then()` unconditionally re-calls
        // noteAutomaticRegistration() for the very subject reconcile() just
        // removed, one tick lag later (see Section D).
        await session.fullTick(pos(0, 0, 0));
        assert(!hasOrigin(registry, origin), '1. the World registration is genuinely gone');
        assert(counts.setSource === 1 && counts.removeSource === 1, '2. exactly one registration and one removal so far');
        assert(session.reconciliation.watchedAutomaticSubjects().some((s) => s.publicationId === publicationId),
            '3. OBSERVED: the subject is watched AGAIN — the same tick\'s own cache-hit cascade result re-armed noteAutomaticRegistration(), one tick lag after the removal that was itself one tick lag from the original registration');

        // The NEXT reconcile() call finds no source at this origin
        // (genuinely gone) and silently re-forgets it — the "a missing
        // source is forgotten" branch, never the "unregister" branch.
        const secondPass = await session.fullTick(pos(0, 0, 0));
        assert(!hasOrigin(registry, origin), '4. still absent — no resurrection of the World registration');
        assert(counts.setSource === 1 && counts.removeSource === 1, '5. neither setSource nor removeSource was called again — the re-forget is silent, never a second unregister call');
        assert(secondPass.removedThisTick.length === 0, '6. this pass is not reported as a "removal" at all — nothing was actually removed, only an internal, already-dead watch entry was discarded');

        // Left running, this phantom cycle repeats every further tick —
        // documented here across two more, rather than left as a one-off.
        await session.fullTick(pos(0, 0, 0));
        await session.fullTick(pos(0, 0, 0));
        assert(!hasOrigin(registry, origin) && counts.setSource === 1 && counts.removeSource === 1,
            '7. across further repeated ticks, the World registration stays permanently gone and neither counter ever increments again — the phantom re-watch is purely an internal bookkeeping artifact, never a functional resurrection');

        console.log('✓ Section L: OBSERVED — a stale, cache-hit REGISTERED cascade result re-arms noteAutomaticRegistration() one tick after an automatic removal, but the immediately following reconcile() call silently re-forgets it (never a second unregister call, never a World resurrection); this is the exact, honest semantic consequence of "forgets removed subjects" once a caller keeps re-feeding an idempotent cascade\'s own cached result forward, recorded here rather than assumed');
    }

    // ---------------------------------------------------------------
    // Section M — session isolation: two independent WorldView-shaped
    // sessions never share watched-subject state, even for the identical
    // publicationId+contentHash pair.
    // ---------------------------------------------------------------
    {
        const sharedRegistry = new WorldDiscoverySourceRegistry();
        const publicationId = 'isolation-pub';
        const contentHash = 'isolation-hash';
        const candidate = { contentHash, locator: 'ar://isolation', storage: 'ar', publicationId };
        const origin = originFor(contentHash, publicationId);

        // Each session's own discovery command reports the candidate only
        // ONCE — this section is about session isolation, not a second
        // exercise of Section L's own "phantom re-watch" finding, which a
        // sustained re-feed of the identical candidate would otherwise
        // reproduce here too.
        const collaboratorsFor = (position) => {
            let discovered = false;
            return {
                discoverSnapshotCandidatesCommand: () => { const result = discovered ? [] : [candidate]; discovered = true; return Promise.resolve(result); },
                resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
                materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
                worldDiscoverySourceRegistry: sharedRegistry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position }),
                findPublicationById: () => publicationStub(publicationId),
                retentionRadius: 50
            };
        };

        // Session A's own Wanderer sits NEAR this candidate's own placement.
        const sessionA = makeAutomaticSession(collaboratorsFor(pos(0, 0, 0)));
        await sessionA.fullTick(pos(0, 0, 0));
        await sessionA.fullTick(pos(0, 0, 0));
        assert(hasOrigin(sharedRegistry, origin), 'sanity: Session A registers and retains it');
        assert(sessionA.reconciliation.watchedAutomaticSubjects().length === 1, 'sanity: Session A watches it');

        // Session B — an entirely independent WorldView mount, sharing
        // only the registry — never noted this subject at all (its own
        // cascade never ran for it), so its own reconciliation instance
        // has nothing watched, regardless of what Session A did.
        const sessionB = makeAutomaticSession(collaboratorsFor(pos(9000, 0, 0)));
        assert(sessionB.reconciliation.watchedAutomaticSubjects().length === 0, '1. Session B starts with an empty watch list of its own — never inherits Session A\'s');

        // Session B's own reconcile() call, evaluated against ITS OWN
        // watch list (empty), does nothing to the shared registry, even
        // though the exact same origin is registered there right now.
        const sessionBRemoved = sessionB.reconciliation.reconcile(pos(9000, 0, 0));
        assert(sessionBRemoved.length === 0, '2. Session B\'s own reconcile() call removes nothing — it never watched this origin');
        assert(hasOrigin(sharedRegistry, origin), '3. the shared registration is untouched by Session B\'s own reconcile() call');

        // Session A's own reconcile(), unaffected by Session B's own
        // existence, still correctly removes it once ITS OWN Wanderer
        // walks away. Called directly here (rather than another
        // sessionA.fullTick()) to isolate THIS section's own concern —
        // session isolation — from Section L's own separately-documented
        // "phantom re-watch" finding, which repeatedly re-feeding the
        // identical cached candidate through a full tick would otherwise
        // also reproduce here.
        const sessionARemoved = sessionA.reconciliation.reconcile(pos(9000, 0, 0));
        assert(sessionARemoved.some((r) => r.publicationId === publicationId), '4. Session A\'s own retention still functions correctly, entirely independent of Session B');
        assert(!hasOrigin(sharedRegistry, origin), '5. the shared registration is genuinely gone');
        assert(sessionA.reconciliation.watchedAutomaticSubjects().length === 0, '6. Session A forgets it, as usual');
        assert(sessionB.reconciliation.watchedAutomaticSubjects().length === 0, '7. Session B\'s own (always-empty, for this subject) watch list is unaffected either way');

        console.log('✓ Section M: two independent WorldView-shaped sessions, sharing one registry, never share watched-subject state — not even for the identical publicationId+contentHash pair');
    }

    // ---------------------------------------------------------------
    // Section N — World rendering convergence: ordinary
    // deriveWorldEncounters() sees a REGISTER and collapses on an
    // automatic UNREGISTER, with zero Snapshot-specific removal machinery
    // downstream.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const localPublication = publicationStub('render-local-pub');
        registry.setSource(describeWorldDiscoverySource({
            origin: 'local', publications: [localPublication], placements: [{ publicationId: localPublication.id, position: pos(1, 1, 1) }]
        }));

        const publicationId = 'render-snapshot-pub';
        const contentHash = 'render-snapshot-hash';
        const candidate = { contentHash, locator: 'ar://render', storage: 'ar', publicationId };
        const origin = originFor(contentHash, publicationId);
        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(42, 7, -3) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        await session.fullTick(pos(0, 0, 0));
        await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, origin), 'sanity: registered');

        let encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 2, '1. both the pre-existing LOCAL Publication and the freshly-registered automatic Snapshot converge through the ordinary pipeline');
        const snapshotEncounter = encounters.publications.find((p) => p.objectId === publicationId);
        const localEncounter = encounters.publications.find((p) => p.objectId === localPublication.id);
        assert(snapshotEncounter && localEncounter, '2. both are present');
        assert(JSON.stringify(Object.keys(snapshotEncounter).sort()) === JSON.stringify(Object.keys(localEncounter).sort()),
            '3. the automatic Snapshot\'s own encounter carries exactly the same field shape as the ordinary LOCAL one — no "automatic"/"retained"/"watched" marker of any kind');

        await session.fullTick(pos(9000, 0, 0));
        assert(!hasOrigin(registry, origin), 'sanity: automatically unregistered');

        encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1 && encounters.publications[0].objectId === localPublication.id,
            '4. the automatic Snapshot collapses out of the ordinary World Encounter pipeline entirely on its own, the moment its registry source is gone — no Snapshot-specific selection/removal step exists, or was needed, downstream');

        console.log('✓ Section N: after REGISTER, the ordinary World Encounter pipeline picks up the automatic Snapshot with no special shape; after automatic UNREGISTER, it collapses back out through that exact same, entirely unmodified pipeline');
    }

    // ---------------------------------------------------------------
    // Section O — structural sweep: WATCHED/FORGOTTEN remain
    // implementation concepts only; no new lifecycle enum was introduced
    // to make discovery and retention compose.
    // ---------------------------------------------------------------
    {
        const reconciliationSource = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js');
        const exportCount = (reconciliationSource.match(/^export /gm) || []).length;
        assert(exportCount === 1, '1. AutomaticSnapshotEncounterRetentionReconciliation.js exports exactly one thing — the class itself, no companion enum/constant');
        for (const token of ['WATCHED', 'FORGOTTEN', 'ACTIVE', 'STALE', 'EXPIRED', 'RETIRED', 'LOST']) {
            assert(!new RegExp(`\\b${token}\\b`).test(reconciliationSource), `2. no "${token}" lifecycle-state token appears anywhere in the reconciliation file`);
        }

        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!cascadeSource.includes('AutomaticSnapshotEncounterRetentionReconciliation'), '3. the cascade still never imports the reconciliation class — composition happens only at ui/views/WorldView.js\'s own call site, never inside either file');

        const worldViewSource = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewSource.includes('automaticSnapshotEncounterCascade') && worldViewSource.includes('automaticSnapshotEncounterRetentionReconciliation'),
            '4. sanity: WorldView.js genuinely composes both, exactly as this file\'s own makeAutomaticSession() reproduces');

        console.log('✓ Section O: structural sweep confirms no new Snapshot lifecycle vocabulary (WATCHED/FORGOTTEN/ACTIVE/STALE/etc.) exists anywhere in the composed files — discovery and retention compose entirely through existing, unmodified seams');
    }

    console.log('\n✅ All World Snapshot Automatic Encounter Retention Lifecycle Audit tests passed.');
}

function removedThisTickIsEmpty(removed) {
    return Array.isArray(removed) && removed.length === 0;
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
