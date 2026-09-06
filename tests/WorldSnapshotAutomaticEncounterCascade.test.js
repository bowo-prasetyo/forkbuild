import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from '../application/AutomaticSnapshotEncounterCascadeOutcome.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.187 — Automatic Snapshot Encounter Cascade.
//
// 0.9.186 gave this codebase automatic Snapshot candidate DISCOVERY, driven
// by a Wanderer's own movement, and deliberately stopped there — nothing
// downstream ever moved on its own. This milestone composes the ALREADY-
// PROVEN resolve -> verify -> materialize -> place -> register chain
// (0.9.152 through 0.9.172) into one orchestration seam,
// `application/AutomaticSnapshotEncounterCascade.js`, that
// `ui/views/WorldView.js` now feeds with `WorldSnapshotDiscoveryMonitor`'s
// own `lastResult` on every observation tick. No existing operation is
// replaced; the existing explicit Resolve/Materialize/Place/Register
// buttons on `OwnPublicationPanel.js` remain fully functional.
//
//   Section A: automatic start — discovery alone, with no explicit clicks
//              of any kind, drives a candidate through the full chain
//   Section B: FLAGSHIP — the complete happy path, with a REAL Nostr
//              discovery, REAL Arweave resolution, REAL local
//              materialization, a REAL WorldPlacement, and a REAL
//              WorldDiscoverySourceRegistry, ending in a genuine,
//              correctly-positioned World Encounter; a claimed position
//              on the announcement itself is proven NEVER promoted over
//              the authoritative placement
//   Section C: verification failure (CONTENT_HASH_MISMATCH) stops the
//              cascade before materialization/placement/registration
//   Section D: resolution failure stops the cascade before materialization
//   Section E: materialization failure stops the cascade before
//              placement/registration
//   Section F: placement failure (UNPLACED) — bytes materialize, but no
//              authoritative placement exists, so nothing registers
//   Section G: duplicate discovery (sequential, after settling) produces
//              exactly one effective resolve/materialize/register call
//   Section H: concurrent duplicate discovery (before settling) coalesces
//              into exactly one underlying cascade run
//   Section I: two different Publications sharing identical content are
//              never deduplicated — both register independently
//   Section J: the same content, claimed for two different Publications,
//              appears at each Publication's own independent position
//   Section K: discovery-event identity is irrelevant — two "announcements"
//              of the identical publicationId+contentHash pair, arriving
//              through different locators, coalesce into one cascade run
//   Section L: cross-family isolation — LOCAL/PEER World sources are
//              completely unaffected by the cascade's own registrations
//   Section M: the existing manual Resolve/Materialize/Register commands
//              keep working standalone, entirely independent of the cascade
//   Section N: structural sweep — no rendering logic, no claimedPosition
//              consumption, no ranking/dedup-preference vocabulary
//   Section O: many discovery ticks over time for the SAME candidate
//              (t0/t3/t6/t9, mirroring WorldSnapshotDiscoveryMonitor's own
//              3-second cadence) still produce exactly one cascade run
//   Section P: a candidate with no publicationId (pre-0.9.171 style) is
//              INELIGIBLE — never resolved, never materialized
//   Section Q: processCandidate() never rejects, even when an injected
//              collaborator throws
//   Section R: the cascade wired to WorldNavigationSession's own real,
//              new getPlacementInfoForPublication()/findPublicationById()
//              methods (0.9.187) — the exact collaborators
//              ui/views/WorldView.js now composes it with

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
        return { id: `fake-cascade-tx-${counter}`, transaction: { id: `fake-cascade-tx-${counter}`, data: material } };
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

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag, discoveryQueryService: queryService
    });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate, resolver, contentStore
    });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
        resolution, materializer
    });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore, storeSnapshotContentUseCase, materializer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
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

// Builds the two collaborators a real, production-shaped
// AutomaticSnapshotEncounterCascade needs beyond resolve/materialize —
// `resolvePlacementInfo`/`findPublicationById` — from a plain
// { publicationId -> { publication, placementRegistry } } world model,
// exactly mirroring what `application/WorldNavigationSession.js`'s own
// 0.9.187 `getPlacementInfoForPublication()`/`findPublicationById()`
// methods do internally, without depending on that (large) class here.
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

function makeCascade(host, worldModel, registry) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel ? worldModel.resolvePlacementInfo : null,
        findPublicationById: worldModel ? worldModel.findPublicationById : null
    });
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — automatic start: no explicit clicks of any kind.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        let materializeCalls = 0;
        const candidate = { contentHash: 'auto-start-hash', locator: 'ar://auto-start-hash', storage: 'ar', publicationId: 'pub-auto-start' };

        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate])
        });

        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-auto-start', title: 'Auto Start Publication' });
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: (c) => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
            materializeSelectedSnapshotCommand: (r) => { materializeCalls += 1; return Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }); },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p1', publicationId: 'pub-auto-start', position: { x: 1, y: 2, z: 3 } }),
            findPublicationById: () => publication
        });

        // Exactly the glue ui/views/WorldView.js's own refreshSpatialUI()
        // now performs: observe(), then feed lastResult through the
        // cascade — no button, no explicit selection, no explicit
        // Resolve/Materialize/Register call anywhere in this section.
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        await Promise.all(monitor.lastResult.map((c) => cascade.processCandidate(c)));

        assert(resolveCalls === 1 && materializeCalls === 1, '1. background discovery alone drove resolution and materialization, with no explicit click');
        const sources = registry.listSources();
        assert(sources.some((s) => s.origin === 'snapshot:auto-start-hash:pub-auto-start'), '2. the candidate was driven all the way through to World registration automatically');

        console.log('✓ Section A: background discovery alone, with no explicit user action, drives a candidate through the entire resolve/verify/materialize/place/register chain');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: complete happy path, real machinery
    // end-to-end, claimedPosition never promoted.
    // ---------------------------------------------------------------
    {
        const host = makeHost('cascade-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'cascade-flagship-building', bricks: 7 }] } });

        const publicationId = 'flagship-cascade-publication';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(12, 5, -3));
        const reference = await placeAndAnnounce(host, bytes, {
            publicationId,
            // Deliberately a DIFFERENT position than the authoritative
            // placement above — proving the cascade never promotes a
            // publisher's own claim into World authority.
            claimedPosition: { x: 999, y: 999, z: 999 }
        });
        const publication = new Publication({ id: publicationId, title: 'Flagship Cascade World', contentReference: reference });
        worldModel.knowPublication(publication);

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry);

        const candidates = await host.discoverSnapshotCandidatesCommand();
        assert(candidates.length === 1 && candidates[0].publicationId === publicationId, '1. the real candidate was genuinely discovered, carrying its own publicationId');

        const results = await Promise.all(candidates.map((c) => cascade.processCandidate(c)));
        assert(results[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '2. FLAGSHIP — the cascade drove the real candidate all the way to REGISTERED');

        const sources = registry.listSources();
        const inputs = assembleWorldDiscoveryInputs(sources);
        const encounters = deriveWorldEncounters(inputs);
        assert(encounters.publications.length === 1, '3. the registered Snapshot is now encounterable through the entirely unmodified World Encounter pipeline');
        const [encounter] = encounters.publications;
        assert(encounter.objectId === publicationId, '4. the encounter names the correct Publication');
        assert(encounter.position.x === 12 && encounter.position.y === 5 && encounter.position.z === -3,
            '5. the encounter position is the AUTHORITATIVE placement position — the announcement\'s own claimedPosition (999,999,999) was never used');

        console.log('✓ Section B: FLAGSHIP — a real Nostr-discovered, resolved, materialized candidate is automatically placed and registered into a genuine, correctly-positioned World Encounter, with a claimed position never promoted over World authority');
    }

    // ---------------------------------------------------------------
    // Section C — verification failure stops the cascade.
    // ---------------------------------------------------------------
    {
        const host = makeHost('cascade-verify-failure');
        const bytes = 'genuine-bytes-before-tampering';
        const publicationId = 'verify-failure-publication';
        const reference = await placeAndAnnounce(host, bytes, { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });

        // Tamper with the stored bytes AFTER announcement — the announced
        // contentHash no longer matches what the store actually returns.
        // `reference.uri` is `ar://<transactionId>` (content/
        // ArweaveContentStore.js's own ARWEAVE_URI_PREFIX) — the SAME id
        // the fake gateway itself keys its network Map under.
        const transactionId = reference.uri.slice('ar://'.length);
        host.gateway.network.set(transactionId, 'tampered-bytes');

        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(1, 1, 1));
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Verify Failure' }));
        const registry = new WorldDiscoverySourceRegistry();

        let materializeCalls = 0;
        const cascade = makeCascade(host, worldModel, registry);
        const realMaterialize = cascade._materializeSelectedSnapshotCommand;
        cascade._materializeSelectedSnapshotCommand = (r) => { materializeCalls += 1; return realMaterialize(r); };

        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            '1. a tampered Snapshot honestly stops at CONTENT_HASH_MISMATCH');
        assert(materializeCalls === 0, '2. materialization is never attempted once verification fails');
        assert(registry.listSources().length === 0, '3. nothing is ever registered for content that failed verification');

        console.log('✓ Section C: verification failure (CONTENT_HASH_MISMATCH) stops the cascade before materialization, placement, or registration are ever attempted');
    }

    // ---------------------------------------------------------------
    // Section D — resolution failure stops the cascade.
    // ---------------------------------------------------------------
    {
        let materializeCalls = 0;
        let placementInfoCalls = 0;
        const candidate = { contentHash: 'resolve-fail-hash', locator: 'ar://resolve-fail-hash', storage: 'ar', publicationId: 'resolve-fail-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, reason: 'no content store available for storage \'ar\'' }),
            materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED }); },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => { placementInfoCalls += 1; return null; },
            findPublicationById: () => null
        });

        const result = await cascade.processCandidate(candidate);

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, '1. resolution\'s own failure outcome is reported verbatim');
        assert(result.reason === 'no content store available for storage \'ar\'', '2. resolution\'s own reason is forwarded, unchanged');
        assert(materializeCalls === 0, '3. materialization is never attempted once resolution fails');
        assert(placementInfoCalls === 0, '4. placement is never even considered once resolution fails');
        assert(registry.listSources().length === 0, '5. nothing is registered');

        console.log('✓ Section D: resolution failure stops the cascade before materialization is ever attempted');
    }

    // ---------------------------------------------------------------
    // Section E — materialization failure stops the cascade.
    // ---------------------------------------------------------------
    {
        let placementInfoCalls = 0;
        let registerCalls = 0;
        const candidate = { contentHash: 'materialize-fail-hash', locator: 'ar://materialize-fail-hash', storage: 'ar', publicationId: 'materialize-fail-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource = (() => { const original = registry.setSource.bind(registry); return (...args) => { registerCalls += 1; return original(...args); }; })();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([9]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: SnapshotCandidateMaterializationOutcome.HASH_MISMATCH, contentHash: candidate.contentHash, reason: 'independent re-verification disagreed' }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => { placementInfoCalls += 1; return { placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }; },
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Materialize Fail' })
        });

        const result = await cascade.processCandidate(candidate);

        assert(result.outcome === SnapshotCandidateMaterializationOutcome.HASH_MISMATCH, '1. materialization\'s own failure outcome is reported verbatim');
        assert(placementInfoCalls === 0, '2. placement is never computed once materialization fails');
        assert(registerCalls === 0, '3. registration is never attempted once materialization fails');

        console.log('✓ Section E: materialization failure stops the cascade before placement or registration are ever attempted');
    }

    // ---------------------------------------------------------------
    // Section F — placement failure (UNPLACED): material exists, but
    // nothing registers.
    // ---------------------------------------------------------------
    {
        let registerCalls = 0;
        const candidate = { contentHash: 'unplaced-hash', locator: 'ar://unplaced-hash', storage: 'ar', publicationId: 'unplaced-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([3]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            // No authoritative placement is known for this publicationId.
            resolvePlacementInfo: () => null,
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Unplaced' })
        });

        const result = await cascade.processCandidate(candidate);

        assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '1. materialized bytes with no known World placement stop at UNPLACED');
        assert(registerCalls === 0, '2. registration is never attempted merely because bytes were materialized');
        assert(registry.listSources().length === 0, '3. the World runtime registry is untouched');

        console.log('✓ Section F: material can exist locally while the candidate stays entirely absent from the World — materialization is never, by itself, treated as World participation');
    }

    // ---------------------------------------------------------------
    // Section G — duplicate discovery (sequential): one effective
    // operation.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        let materializeCalls = 0;
        let registerCalls = 0;
        const candidate = { contentHash: 'dup-seq-hash', locator: 'ar://dup-seq-hash', storage: 'ar', publicationId: 'dup-seq-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
            materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }); },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Dup Seq' })
        });

        const first = await cascade.processCandidate(candidate);
        // A LATER, entirely separate discovery of the identical candidate —
        // mirroring the mission's own t0/t3/t6 rediscovery scenario.
        const second = await cascade.processCandidate({ ...candidate });

        assert(resolveCalls === 1 && materializeCalls === 1 && registerCalls === 1,
            '1. repeated discovery of the SAME candidate, discovered again after the first run already settled, produces exactly one effective resolve/materialize/register operation');
        assert(second.outcome === first.outcome && second.publicationId === first.publicationId && second.contentHash === first.contentHash,
            '2. the repeated discovery still reports the SAME terminal outcome');

        console.log('✓ Section G: duplicate discovery of the same candidate, discovered again after processing already completed, produces only one effective processing operation');
    }

    // ---------------------------------------------------------------
    // Section H — concurrent duplicate discovery: only one cascade runs.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const candidate = { contentHash: 'dup-concurrent-hash', locator: 'ar://dup-concurrent-hash', storage: 'ar', publicationId: 'dup-concurrent-pub' };
        let releaseResolve;
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => {
                resolveCalls += 1;
                return new Promise((resolve) => { releaseResolve = resolve; });
            },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Dup Concurrent' })
        });

        // Two independent discovery ticks report the SAME candidate while
        // the FIRST cascade run is still in flight — e.g. Discovery A and
        // Discovery B both surfacing candidate X before X has resolved.
        const promiseA = cascade.processCandidate(candidate);
        const promiseB = cascade.processCandidate({ ...candidate });
        await flushMicrotasks();

        assert(resolveCalls === 1, '1. a concurrent duplicate never starts a second, independent resolve call while the first is still in flight');
        assert(promiseA === promiseB, '2. both concurrent callers are handed the exact SAME in-flight result promise — one cascade run, not two');

        releaseResolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        const [resultA, resultB] = await Promise.all([promiseA, promiseB]);
        assert(resultA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && resultB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '3. both callers observe the identical, single cascade run reaching completion');

        console.log('✓ Section H: concurrent duplicate discovery of the same candidate while processing is already underway coalesces into exactly one cascade run');
    }

    // ---------------------------------------------------------------
    // Section I — different Publications, identical content: no
    // deduplication.
    // ---------------------------------------------------------------
    {
        const sharedContentHash = 'shared-content-hash';
        const worldModel = makeWorldModel();
        worldModel.placeAt('pub-A', new Position(1, 0, 1));
        worldModel.placeAt('pub-B', new Position(2, 0, 2));
        worldModel.knowPublication(new Publication({ id: 'pub-A', title: 'Publication A' }));
        worldModel.knowPublication(new Publication({ id: 'pub-B', title: 'Publication B' }));

        const registry = new WorldDiscoverySourceRegistry();
        const fakeResolve = () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([5]), reason: null });
        const fakeMaterialize = (resolution) => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: sharedContentHash, reason: null });
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: fakeResolve,
            materializeSelectedSnapshotCommand: fakeMaterialize,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });

        const candidateA = { contentHash: sharedContentHash, locator: 'ar://shared-A', storage: 'ar', publicationId: 'pub-A' };
        const candidateB = { contentHash: sharedContentHash, locator: 'ar://shared-B', storage: 'ar', publicationId: 'pub-B' };

        const [resultA, resultB] = await Promise.all([cascade.processCandidate(candidateA), cascade.processCandidate(candidateB)]);

        assert(resultA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && resultB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '1. both distinct Publications register independently, despite sharing identical content');
        const sources = registry.listSources();
        assert(sources.length === 2, '2. two independent World Publications exist — no deduplication by contentHash alone');
        assert(sources.some((s) => s.origin === `snapshot:${sharedContentHash}:pub-A`) && sources.some((s) => s.origin === `snapshot:${sharedContentHash}:pub-B`),
            '3. each occupies its own dedicated origin, keyed by BOTH contentHash and publicationId');

        console.log('✓ Section I: two different Publications sharing identical content produce two independent World Publications — never deduplicated');
    }

    // ---------------------------------------------------------------
    // Section J — same content, different claimed positions, appear
    // independently.
    // ---------------------------------------------------------------
    {
        const sharedContentHash = 'shared-position-hash';
        const worldModel = makeWorldModel();
        worldModel.placeAt('pos-pub-A', new Position(10, 0, 0));
        worldModel.placeAt('pos-pub-B', new Position(-10, 0, 0));
        worldModel.knowPublication(new Publication({ id: 'pos-pub-A', title: 'Position A' }));
        worldModel.knowPublication(new Publication({ id: 'pos-pub-B', title: 'Position B' }));

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([2]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: sharedContentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });

        await Promise.all([
            cascade.processCandidate({ contentHash: sharedContentHash, locator: 'ar://pos-A', storage: 'ar', publicationId: 'pos-pub-A' }),
            cascade.processCandidate({ contentHash: sharedContentHash, locator: 'ar://pos-B', storage: 'ar', publicationId: 'pos-pub-B' })
        ]);

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        const encounterA = encounters.publications.find((p) => p.objectId === 'pos-pub-A');
        const encounterB = encounters.publications.find((p) => p.objectId === 'pos-pub-B');
        assert(encounterA && encounterA.position.x === 10, '1. Publication A encounters at its own authoritative position');
        assert(encounterB && encounterB.position.x === -10, '2. Publication B encounters at its own, independent authoritative position');

        console.log('✓ Section J: identical content claimed for two different Publications appears independently at each Publication\'s own position');
    }

    // ---------------------------------------------------------------
    // Section K — discovery-event identity is irrelevant.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const publicationId = 'event-identity-pub';
        const contentHash = 'event-identity-hash';
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([4]), reason: null }); },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: { x: 0, y: 0, z: 0 } }),
            findPublicationById: () => new Publication({ id: publicationId, title: 'Event Identity' })
        });

        // Two "announcements" of the identical publicationId+contentHash
        // pair, as if reported by two different Nostr events (different
        // locator/storage transport details) — this cascade never reads a
        // Nostr event id at all, so nothing here could distinguish them
        // even if it wanted to.
        const eventCandidateOne = { contentHash, locator: 'ar://event-one', storage: 'ar', publicationId };
        const eventCandidateTwo = { contentHash, locator: 'ar://event-two', storage: 'ar', publicationId };

        await cascade.processCandidate(eventCandidateOne);
        await cascade.processCandidate(eventCandidateTwo);

        assert(resolveCalls === 1, '1. two independent announcements of the same publicationId+contentHash never create two World objects merely because their own transport details (and, in production, their own Nostr event ids) differ');
        assert(registry.listSources().length === 1, '2. exactly one World Publication resulted');

        console.log('✓ Section K: discovery-event identity is irrelevant to the cascade — publicationId+contentHash alone identifies the processing subject');
    }

    // ---------------------------------------------------------------
    // Section L — cross-family isolation.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const localPublication = new Publication({ id: 'local-pub', title: 'Local Publication' });
        const peerPublication = new Publication({ id: 'peer-pub', title: 'Peer Publication' });
        const localSource = describeWorldDiscoverySource({ origin: 'local', publications: [localPublication], placements: [{ publicationId: 'local-pub', position: { x: 5, y: 5, z: 5 } }] });
        const peerSource = describeWorldDiscoverySource({ origin: 'peer:identity-1', publications: [peerPublication], placements: [{ publicationId: 'peer-pub', position: { x: 6, y: 6, z: 6 } }] });
        registry.setSource(localSource);
        registry.setSource(peerSource);

        const worldModel = makeWorldModel();
        worldModel.placeAt('snapshot-pub', new Position(7, 7, 7));
        worldModel.knowPublication(new Publication({ id: 'snapshot-pub', title: 'Snapshot Publication' }));
        const host = makeHost('cascade-isolation');
        const bytes = 'cross-family-isolation-bytes';
        await placeAndAnnounce(host, bytes, { publicationId: 'snapshot-pub', claimedPosition: { x: 0, y: 0, z: 0 } });
        const cascade = makeCascade(host, worldModel, registry);
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. sanity: the Snapshot itself registers');

        const sourcesAfter = registry.listSources();
        assert(sourcesAfter.find((s) => s.origin === 'local') === localSource, '2. the pre-existing LOCAL source is untouched — the exact same reference');
        assert(sourcesAfter.find((s) => s.origin === 'peer:identity-1') === peerSource, '3. the pre-existing PEER source is untouched — the exact same reference');
        assert(sourcesAfter.length === 3, '4. the Snapshot occupies its own dedicated, additional origin — LOCAL/PEER slots are neither replaced nor merged');

        console.log('✓ Section L: existing LOCAL/PEER World sources remain completely unaffected by the cascade\'s own Snapshot registrations');
    }

    // ---------------------------------------------------------------
    // Section M — existing manual operations keep working, independent
    // of the cascade.
    // ---------------------------------------------------------------
    {
        const host = makeHost('cascade-manual-still-works');
        const bytes = 'manual-path-still-works';
        const publicationId = 'manual-path-pub';
        const reference = await placeAndAnnounce(host, bytes, { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        const publication = new Publication({ id: publicationId, title: 'Manual Path', contentReference: reference });

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, publicationId, new Position(9, 9, 9));
        const placementInfo = placementInfoFor(placementRegistry, publicationId);
        const registry = new WorldDiscoverySourceRegistry();

        // The exact manual chain OwnPublicationPanel.js's own explicit
        // Resolve/Materialize/Place/Register buttons already call — never
        // touching AutomaticSnapshotEncounterCascade at all.
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const resolution = await host.resolveSelectedSnapshotCommand(candidate);
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '1. the manual resolve command still works, unmodified');
        const materialization = await host.materializeSelectedSnapshotCommand(resolution);
        assert(materialization.outcome === StoreSnapshotContentOutcome.STORED, '2. the manual materialize command still works, unmodified');
        const { resolveSnapshotWorldPlacement } = await import('../application/SnapshotWorldPlacement.js');
        const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
        assert(placement.outcome === SnapshotWorldPlacementOutcome.PLACED, '3. the manual placement function still works, unmodified');
        const registration = registerMaterializedSnapshotWorldSource(registry, placement, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. the manual registration function still works, unmodified — entirely independent of any AutomaticSnapshotEncounterCascade instance');

        console.log('✓ Section M: existing manual Resolve/Materialize/Place/Register operations continue to work, entirely independent of the automatic cascade');
    }

    // ---------------------------------------------------------------
    // Section N — structural sweep.
    // ---------------------------------------------------------------
    {
        const source = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!source.includes('claimedPosition'), '1. the cascade never reads a candidate\'s own claimedPosition — a publisher claim is never promoted to World authority');
        assert(!/WorldEncounterCanvas|render|Renderer|mesh|Scene|Camera/i.test(source), '2. the cascade contains no rendering-specific logic of any kind — it stops at World registration');
        assert(!/rank|score|trust|preference|nearest/i.test(source), '3. the cascade introduces no ranking/trust/provider-scoring/nearest-preference vocabulary');
        assert(!source.includes('OwnPublicationPanel'), '4. the cascade never imports the existing manual UI component');
        assert(!/\bretry\b|backoff|setTimeout|setInterval/i.test(source), '5. the cascade performs no retry/backoff/polling of its own — a terminal result is terminal for this instance');

        const outcomeKeys = Object.keys(AutomaticSnapshotEncounterCascadeOutcome);
        // UPDATED 0.9.193 — Automatic Snapshot Session-Lifetime Guard added
        // its own one new value, SUPPRESSED, alongside 0.9.187's own
        // INELIGIBLE (see application/AutomaticSnapshotEncounterCascadeOutcome.js's
        // own header) — every OTHER outcome remains an existing,
        // already-tested vocabulary forwarded verbatim, exactly as before.
        assert(outcomeKeys.length === 2 && outcomeKeys.includes('INELIGIBLE') && outcomeKeys.includes('SUPPRESSED'), '6. AutomaticSnapshotEncounterCascadeOutcome carries exactly its own two new values (INELIGIBLE, 0.9.187; SUPPRESSED, 0.9.193) — every other outcome is an existing, already-tested vocabulary forwarded verbatim');

        console.log('✓ Section N: structural sweep — no rendering logic, no claimedPosition consumption, no ranking/dedup-preference vocabulary, and exactly one new outcome value');
    }

    // ---------------------------------------------------------------
    // Section O — many discovery ticks over time for the SAME
    // candidate still produce exactly one cascade run.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        let registerCalls = 0;
        const candidate = { contentHash: 'ticks-hash', locator: 'ar://ticks-hash', storage: 'ar', publicationId: 'ticks-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Ticks' })
        });

        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]) });

        // t0, t3, t6, t9 — mirroring WorldSnapshotDiscoveryMonitor's own
        // 3-second observation cadence crossing a spatial threshold
        // repeatedly, each tick independently re-discovering the SAME
        // candidate.
        for (const distance of [0, 101, 202, 303]) {
            await monitor.observe({ position: { x: distance, y: 0, z: 0 } });
            await Promise.all(monitor.lastResult.map((c) => cascade.processCandidate(c)));
        }

        assert(resolveCalls === 1, '1. four independent discovery ticks for the identical candidate produce exactly one resolve call, never four');
        assert(registerCalls === 1, '2. exactly one registration results, never a repeated registration per tick');

        console.log('✓ Section O: repeated background-discovery ticks over time for the same candidate remain harmless — the cascade\'s own idempotency, not a new timer/cache/discovery-dedup layer, absorbs the repetition');
    }

    // ---------------------------------------------------------------
    // Section P — a candidate with no publicationId is INELIGIBLE.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED }); },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED }),
            worldDiscoverySourceRegistry: new WorldDiscoverySourceRegistry()
        });

        // A pre-0.9.171-style candidate — no publicationId/claimedPosition
        // at all, exactly what every announcement made before that
        // milestone still looks like.
        const legacyCandidate = { contentHash: 'legacy-hash', locator: 'ar://legacy-hash', storage: 'ar' };
        const result = await cascade.processCandidate(legacyCandidate);

        assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE, '1. a candidate with no publicationId never becomes a processing subject');
        assert(resolveCalls === 0, '2. resolution is never even attempted for an ineligible candidate');
        assert(result.contentHash === 'legacy-hash' && result.publicationId === null, '3. the ineligible result still names whatever identity WAS available');

        console.log('✓ Section P: a candidate carrying no publicationId is reported INELIGIBLE and never reaches resolution at all');
    }

    // ---------------------------------------------------------------
    // Section Q — processCandidate() never rejects.
    // ---------------------------------------------------------------
    {
        const candidate = { contentHash: 'throws-hash', locator: 'ar://throws-hash', storage: 'ar', publicationId: 'throws-pub' };
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { throw new Error('synchronous collaborator failure'); },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED }),
            worldDiscoverySourceRegistry: new WorldDiscoverySourceRegistry()
        });

        let threw = false;
        let result = null;
        try {
            result = await cascade.processCandidate(candidate);
        } catch (error) {
            threw = true;
        }

        assert(threw === false, '1. a thrown collaborator error never propagates as a rejection to processCandidate()\'s own caller');
        assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE, '2. the failure is honestly reported as INELIGIBLE rather than silently swallowed');

        console.log('✓ Section Q: processCandidate() never rejects, even when an injected collaborator throws synchronously');
    }

    // ---------------------------------------------------------------
    // Section R — the REAL production collaborators
    // (WorldNavigationSession's own new 0.9.187
    // getPlacementInfoForPublication()/findPublicationById() methods),
    // not just the makeWorldModel() test double every earlier section
    // used.
    // ---------------------------------------------------------------
    {
        const { WorldNavigationSession } = await import('../application/WorldNavigationSession.js');
        const publicationId = 'session-wired-pub';
        const publication = new Publication({ id: publicationId, title: 'Session Wired' });
        const discoveryProvider = { findById: (id) => (id === publicationId ? publication : null) };
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, publicationId, new Position(3, 4, 5));

        const session = new WorldNavigationSession({
            registry: {}, loadPublicationDocumentUseCase: {}, worldLayoutProvider: {},
            discoveryProvider, placementRegistry
        });

        assert(session.findPublicationById(publicationId) === publication, '1. findPublicationById() returns the exact Publication instance the discoveryProvider holds');
        assert(session.findPublicationById('unknown-pub') === null, '2. findPublicationById() returns null for an unknown publicationId, never throwing');

        const placementInfo = session.getPlacementInfoForPublication(publicationId);
        assert(placementInfo && placementInfo.publicationId === publicationId && placementInfo.position.x === 3 && placementInfo.position.y === 4 && placementInfo.position.z === 5,
            '3. getPlacementInfoForPublication() resolves the authoritative placement directly from a publicationId, with no documentId at all');
        assert(session.getPlacementInfoForPublication('unknown-pub') === null, '4. getPlacementInfoForPublication() returns null for a publicationId with no known placement');

        const registry = new WorldDiscoverySourceRegistry();
        const host = makeHost('cascade-session-wired');
        await placeAndAnnounce(host, 'session-wired-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (id) => session.getPlacementInfoForPublication(id),
            findPublicationById: (id) => session.findPublicationById(id)
        });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '5. the cascade, wired to the REAL WorldNavigationSession collaborators exactly as ui/views/WorldView.js now composes them, reaches REGISTERED');

        console.log('✓ Section R: AutomaticSnapshotEncounterCascade works correctly wired to WorldNavigationSession\'s own real getPlacementInfoForPublication()/findPublicationById() methods — the exact collaborators ui/views/WorldView.js now composes it with');
    }

    console.log('\n✅ All World Snapshot Automatic Encounter Cascade tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
