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
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
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

// 0.9.188 — Automatic Snapshot Encounter Lifecycle Audit.
//
// 0.9.187 composed the already-proven resolve -> verify -> materialize ->
// place -> register chain into one background-triggered orchestration seam,
// `application/AutomaticSnapshotEncounterCascade.js`. Its own test file
// (`tests/WorldSnapshotAutomaticEncounterCascade.test.js`) proved every
// SECTION of that chain works in isolation — one candidate, one cascade
// instance, one scenario at a time. This file asks the harder question the
// milestone's own recommendation named directly: does the autonomous system
// behave correctly when discovery, movement, asynchronous operations,
// duplicates, failures, and World-lifecycle changes happen AT THE SAME TIME,
// and across MULTIPLE independent cascade instances the way
// `ui/views/WorldView.js` actually constructs them — freshly, one per
// mounted session?
//
// NO PRODUCTION CODE CHANGES IN THIS MILESTONE. Every assertion below
// exercises EXISTING, UNMODIFIED application code
// (`AutomaticSnapshotEncounterCascade`, `WorldSnapshotDiscoveryMonitor`,
// `MaterializedSnapshotWorldDiscoveryBridge`, `WorldDiscoverySourceRegistry`,
// `SnapshotWorldPlacement`) exactly as 0.9.187 shipped it. Where a section
// below documents a real, non-obvious consequence of that existing code
// (see Section E and Section I) it is recorded as an OBSERVED, INTENTIONAL
// behavior — never "fixed" here. Any lifecycle policy the audit's own
// findings might motivate (retry, expiration, distance-based removal,
// ranking) is explicitly a SEPARATE, later, unscheduled milestone.
//
//   Section A: zero-click complete cascade — discovery through World
//              Encounter rendering, with no explicit click anywhere
//   Section B: sequential duplicate discovery — one effective cascade run
//   Section C: concurrent duplicate discovery — one effective cascade run
//   Section D: same content, different Publications — never deduplicated
//   Section E: same Publication, changed content — two independent
//              processing subjects, AND the resulting World-registry
//              consequence of that choice, made explicit
//   Section F: discovery-event identity — convergent for the identical
//              publicationId+contentHash pair, independent across a
//              different publicationId
//   Section G: failure closure at every stage — a stopped stage leaves
//              World state at exactly that boundary, nothing further
//   Section H: no accidental retry — a later, independent discovery tick
//              for a candidate whose FIRST cascade run already failed
//              reports the identical terminal failure, never a silent
//              retry
//   Section I: movement/discovery races — a stale WorldSnapshotDiscoveryMonitor
//              response never corrupts a fresher one; a losing response's
//              own unique candidates are (today) simply never fed to the
//              cascade at all — the audit records which side of that
//              boundary the current implementation sits on
//   Section J: World removal during processing — an unrelated mid-flight
//              removal of the cascade's own eventual origin does not
//              cancel or corrupt the in-flight run; the run's own
//              completion re-establishes the registration
//   Section K: session teardown during processing — two independent
//              AutomaticSnapshotEncounterCascade instances (mirroring two
//              independent WorldView mounts) never share processing state,
//              and a second session may legitimately reprocess the exact
//              same publicationId+contentHash pair a first session already
//              started
//   Section L: authoritative placement invariant — a hostile/incorrect
//              claimedPosition is never read, under adversarial values
//   Section M: visibility remains downstream — a cascade-registered
//              Snapshot source produces a structurally ordinary World
//              Encounter, indistinguishable in shape from a LOCAL/PEER one
//   Section N: cross-family regression under live automatic traffic —
//              LOCAL/PEER sources survive an active monitor+cascade
//              running many ticks alongside them
//   Section O: manual controls remain independent — a manual
//              Resolve/Materialize/Place/Register chain never touches, and
//              is never touched by, a concurrently-running cascade instance
//   Section P: registry churn isolation — unrelated LOCAL/PEER/Snapshot
//              registry mutations never trigger, block, or duplicate an
//              unrelated in-flight cascade run
//   Section Q: structural sweep — no retry/backoff/persistence/ranking
//              vocabulary has crept into the audited files since 0.9.187

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

// Mirrors what WorldNavigationSession's own 0.9.187
// getPlacementInfoForPublication()/findPublicationById() methods do
// internally, without depending on that (large, `three`-importing) class
// here — exactly the same restraint the 0.9.187 cascade test file itself
// used for every section but its own Section R.
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

// A deferred promise pair — used throughout this file to hold a
// collaborator call open mid-flight so a test can interleave OTHER
// operations (a registry mutation, a second cascade instance, a second
// discovery tick) before letting the first one settle.
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — zero-click complete cascade: discovery through World
    // Encounter rendering, with no explicit click of any kind, using
    // REAL Nostr discovery, REAL Arweave resolution, and REAL local
    // materialization — the ordinary Publication World object, not a
    // special "automatic Snapshot" rendering path.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-zero-click');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'zero-click-building', bricks: 3 }] } });
        const publicationId = 'zero-click-publication';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(4, 8, 15));
        const reference = await placeAndAnnounce(host, bytes, { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Zero Click World', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry);
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand });

        // The ONLY user activity in this section is movement / spatial
        // observation — no Discover/Resolve/Materialize/Place/Register
        // click anywhere in this block.
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        const results = await Promise.all(monitor.lastResult.map((c) => cascade.processCandidate(c)));

        assert(results.length === 1 && results[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '1. movement/observation alone drove DISCOVER -> RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER to completion');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1, '2. the World Encounter pipeline sees exactly one Publication');
        const [encounter] = encounters.publications;
        assert(encounter.objectId === publicationId && encounter.position.x === 4 && encounter.position.y === 8 && encounter.position.z === 15,
            '3. the rendered object is the ORDINARY Publication World object, at its authoritative placement — no special "automatic Snapshot" shape or field appears anywhere on it');
        assert(!('automatic' in encounter) && !('cascade' in encounter) && !('snapshotOrigin' in encounter),
            '4. the encounter carries no cascade-specific marker field of any kind');

        console.log('✓ Section A: zero-click complete cascade — movement/spatial observation alone drives a real candidate through the entire chain to an ordinary, unmarked World Encounter');
    }

    // ---------------------------------------------------------------
    // Section B — sequential duplicate discovery: one effective cascade,
    // repeated many times over.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0, materializeCalls = 0, registerCalls = 0;
        const candidate = { contentHash: 'audit-dup-seq-hash', locator: 'ar://audit-dup-seq-hash', storage: 'ar', publicationId: 'audit-dup-seq-pub' };
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

        // Ten independent, sequential re-discoveries of the identical
        // candidate — well beyond the two the 0.9.187 test file itself
        // exercised.
        const outcomes = [];
        for (let i = 0; i < 10; i++) {
            outcomes.push((await cascade.processCandidate({ ...candidate })).outcome);
        }

        assert(resolveCalls === 1 && materializeCalls === 1 && registerCalls === 1,
            '1. ten sequential rediscoveries of the SAME candidate still produce exactly one effective resolve/materialize/register operation');
        assert(outcomes.every((o) => o === SnapshotWorldRegistrationOutcome.REGISTERED),
            '2. every one of the ten calls reports the identical terminal outcome');

        console.log('✓ Section B: sequential duplicate discovery, repeated ten times, remains exactly one effective cascade run');
    }

    // ---------------------------------------------------------------
    // Section C — concurrent duplicate discovery: many simultaneous
    // callers coalesce into one cascade run, one materialization, one
    // World registration, while the candidate itself is preserved
    // unchanged.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0, materializeCalls = 0, registerCalls = 0;
        const seenCandidates = [];
        const candidate = { contentHash: 'audit-dup-concurrent-hash', locator: 'ar://audit-dup-concurrent-hash', storage: 'ar', publicationId: 'audit-dup-concurrent-pub' };
        let releaseResolve;
        const registry = new WorldDiscoverySourceRegistry();
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: (c) => {
                resolveCalls += 1;
                seenCandidates.push(c);
                return new Promise((resolve) => { releaseResolve = resolve; });
            },
            materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }); },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Dup Concurrent' })
        });

        // Five simultaneous discovery ticks (sequential AND concurrent
        // duplication together, per the mission's own "both sequentially
        // and concurrently" instruction) all reporting the identical
        // candidate before the first resolve call has settled.
        const promises = [0, 1, 2, 3, 4].map(() => cascade.processCandidate({ ...candidate }));
        await flushMicrotasks();

        assert(resolveCalls === 1, '1. five concurrent duplicate discoveries never start more than one resolve call while the first is in flight');
        assert(promises.every((p) => p === promises[0]), '2. all five callers are handed the exact same in-flight result promise');
        assert(seenCandidates.length === 1 && seenCandidates[0].contentHash === candidate.contentHash && seenCandidates[0].publicationId === candidate.publicationId,
            '3. the candidate handed to resolution is preserved unchanged — no merging/mutation across the five duplicate calls');

        releaseResolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        const results = await Promise.all(promises);

        assert(materializeCalls === 1 && registerCalls === 1, '4. exactly one materialization and one World registration resulted, despite five concurrent callers');
        assert(results.every((r) => r.outcome === SnapshotWorldRegistrationOutcome.REGISTERED), '5. every one of the five callers observes the identical successful outcome');

        console.log('✓ Section C: five concurrent duplicate discoveries of the same candidate coalesce into exactly one cascade run, one materialization, and one World registration');
    }

    // ---------------------------------------------------------------
    // Section D — same content, different Publications: never
    // deduplicated by content identity alone.
    // ---------------------------------------------------------------
    {
        const sharedContentHash = 'audit-shared-content-hash';
        const worldModel = makeWorldModel();
        worldModel.placeAt('audit-pub-A', new Position(1, 0, 1));
        worldModel.placeAt('audit-pub-B', new Position(2, 0, 2));
        worldModel.knowPublication(new Publication({ id: 'audit-pub-A', title: 'Publication A' }));
        worldModel.knowPublication(new Publication({ id: 'audit-pub-B', title: 'Publication B' }));

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([5]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: sharedContentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });

        const candidateA = { contentHash: sharedContentHash, locator: 'ar://audit-shared-A', storage: 'ar', publicationId: 'audit-pub-A' };
        const candidateB = { contentHash: sharedContentHash, locator: 'ar://audit-shared-B', storage: 'ar', publicationId: 'audit-pub-B' };

        const [resultA, resultB] = await Promise.all([cascade.processCandidate(candidateA), cascade.processCandidate(candidateB)]);

        assert(resultA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && resultB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '1. both distinct Publications register independently, despite sharing identical content');
        const sources = registry.listSources();
        assert(sources.length === 2, '2. two independent World objects exist — never one merged "World object X"');
        assert(sources.some((s) => s.origin === `snapshot:${sharedContentHash}:audit-pub-A`) && sources.some((s) => s.origin === `snapshot:${sharedContentHash}:audit-pub-B`),
            '3. each occupies its own dedicated origin, keyed by BOTH contentHash and publicationId — the processing identity was never promoted to a content identity');

        console.log('✓ Section D: pub-A+hash-X and pub-B+hash-X never collapse into one World object — they remain two independent World objects');
    }

    // ---------------------------------------------------------------
    // Section E — same Publication, changed content: two independent
    // processing subjects, AND the resulting World-registry consequence
    // of that choice made explicit (the "one architectural question"
    // the mission itself raised).
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const publicationId = 'audit-changed-content-pub';
        const hashX = 'audit-changed-content-hash-X';
        const hashY = 'audit-changed-content-hash-Y';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(6, 6, 6));
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Changed Content' }));

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
            materializeSelectedSnapshotCommand: (resolution) => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: resolution.__testHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        // A resolution object is opaque to the cascade — it forwards
        // whatever `resolveSelectedSnapshotCommand` returned straight to
        // `materializeSelectedSnapshotCommand` — so this test tags each
        // resolution with which contentHash it stands for, purely as its
        // own test plumbing (never a shape the real command produces).
        const originalResolve = cascade._resolveSelectedSnapshotCommand;
        cascade._resolveSelectedSnapshotCommand = async (candidate) => {
            const resolution = await originalResolve(candidate);
            return { ...resolution, __testHash: candidate.contentHash };
        };

        const resultX = await cascade.processCandidate({ contentHash: hashX, locator: 'ar://x', storage: 'ar', publicationId });
        const resultY = await cascade.processCandidate({ contentHash: hashY, locator: 'ar://y', storage: 'ar', publicationId });

        assert(resolveCalls === 2, '1. A+hash-X and A+hash-Y are NOT treated as the same processing subject — each triggers its own independent resolve call');
        assert(resultX.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && resultY.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '2. both independently reach REGISTERED');

        // THE OBSERVED CONSEQUENCE: because
        // `materializedSnapshotWorldOrigin()` keys a registration on
        // `contentHash` AND `publicationId` together, two DIFFERENT
        // content hashes for the SAME publicationId occupy TWO DIFFERENT
        // origins — never one origin overwriting the other the way two
        // discoveries of the identical pair would. The audit records this
        // plainly rather than silently accepting it: today, a Publication
        // whose Snapshot content changes across two independently
        // discovered revisions ends up registered TWICE, simultaneously,
        // both anchored at the SAME authoritative placement (placement is
        // resolved from publicationId alone, never from contentHash).
        // Nothing in 0.9.187 or this audit decides which revision should
        // "win," retire the other, or supersede it — that is exactly the
        // kind of lifecycle policy this milestone's own mission explicitly
        // defers to a later, unscheduled milestone.
        const sources = registry.listSources();
        const publicationSources = sources.filter((s) => s.placements.some((p) => p.publicationId === publicationId));
        assert(publicationSources.length === 2, '3. OBSERVED: the same Publication now occupies two simultaneous, independent World-registry origins — one per content revision — because the processing key intentionally never became a content-superseding identity');
        assert(publicationSources.every((s) => {
            const placement = s.placements.find((p) => p.publicationId === publicationId);
            return placement.position.x === 6 && placement.position.y === 6 && placement.position.z === 6;
        }), '4. OBSERVED: both co-existing registrations point at the identical authoritative placement — the duplication is purely a registry-membership artifact, never a position disagreement');

        console.log('✓ Section E: A+hash-X and A+hash-Y remain two independent processing subjects — the audit records, without fixing, the resulting co-existence of two World-registry origins for one Publication');
    }

    // ---------------------------------------------------------------
    // Section F — discovery-event identity: convergent for the SAME
    // publicationId+contentHash pair, independent across a different
    // publicationId, regardless of how many distinct "events" reported
    // either.
    // ---------------------------------------------------------------
    {
        let resolveCallsShared = 0;
        const sharedPublicationId = 'audit-event-identity-pub-A';
        const contentHash = 'audit-event-identity-hash';
        const registry = new WorldDiscoverySourceRegistry();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: (c) => {
                if (c.publicationId === sharedPublicationId) resolveCallsShared += 1;
                return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([4]), reason: null });
            },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: { x: 0, y: 0, z: 0 } }),
            findPublicationById: (publicationId) => new Publication({ id: publicationId, title: publicationId })
        });

        // Three "events," all announcing the identical publicationId +
        // contentHash pair, through three different locators/transports —
        // this cascade never reads a Nostr event id at all.
        await cascade.processCandidate({ contentHash, locator: 'ar://event-1', storage: 'ar', publicationId: sharedPublicationId });
        await cascade.processCandidate({ contentHash, locator: 'ar://event-2', storage: 'ar', publicationId: sharedPublicationId });
        await cascade.processCandidate({ contentHash, locator: 'ar://event-3', storage: 'ar', publicationId: sharedPublicationId });
        assert(resolveCallsShared === 1, '1. three independent "events" naming the identical publicationId+contentHash pair converge on one processing subject');

        // A fourth "event" names a DIFFERENT publicationId with the SAME
        // contentHash — must remain fully independent.
        const otherPublicationId = 'audit-event-identity-pub-B';
        const resultOther = await cascade.processCandidate({ contentHash, locator: 'ar://event-4', storage: 'ar', publicationId: otherPublicationId });
        assert(resultOther.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '2. a fourth event naming a different publicationId still registers independently');
        assert(registry.listSources().length === 2, '3. two independent World objects exist — event count and event identity played no role in either convergence or divergence');

        console.log('✓ Section F: discovery-event identity is irrelevant — publicationId+contentHash alone determines convergence, regardless of how many distinct "events" reported it');
    }

    // ---------------------------------------------------------------
    // Section G — failure closure at every stage: a stopped stage leaves
    // World state at exactly that boundary, and nothing downstream runs.
    // ---------------------------------------------------------------
    {
        // G.1 — RESOLVE fails.
        {
            let materializeCalls = 0, placementInfoCalls = 0, registerCalls = 0;
            const candidate = { contentHash: 'audit-fail-resolve-hash', locator: 'ar://audit-fail-resolve', storage: 'ar', publicationId: 'audit-fail-resolve-pub' };
            const registry = new WorldDiscoverySourceRegistry();
            const originalSetSource = registry.setSource.bind(registry);
            registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, reason: 'gateway timed out' }),
                materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED }); },
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => { placementInfoCalls += 1; return null; },
                findPublicationById: () => null
            });
            const result = await cascade.processCandidate(candidate);
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'G.1.1 RESOLVE failure is reported verbatim');
            assert(materializeCalls === 0 && placementInfoCalls === 0 && registerCalls === 0, 'G.1.2 nothing downstream of RESOLVE ever runs: no material, no placement lookup, no registration');
        }

        // G.2 — VERIFY fails (CONTENT_HASH_MISMATCH, real tampered bytes).
        {
            const host = makeHost('audit-fail-verify');
            const publicationId = 'audit-fail-verify-pub';
            const reference = await placeAndAnnounce(host, 'genuine-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
            const transactionId = reference.uri.slice('ar://'.length);
            host.gateway.network.set(transactionId, 'tampered-bytes');
            const worldModel = makeWorldModel();
            worldModel.placeAt(publicationId, new Position(1, 1, 1));
            worldModel.knowPublication(new Publication({ id: publicationId, title: 'Verify Fail' }));
            const registry = new WorldDiscoverySourceRegistry();
            let materializeCalls = 0;
            const cascade = makeCascade(host, worldModel, registry);
            const realMaterialize = cascade._materializeSelectedSnapshotCommand;
            cascade._materializeSelectedSnapshotCommand = (r) => { materializeCalls += 1; return realMaterialize(r); };
            const [candidate] = await host.discoverSnapshotCandidatesCommand();
            const result = await cascade.processCandidate(candidate);
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'G.2.1 VERIFY failure stops the chain honestly');
            assert(materializeCalls === 0, 'G.2.2 MATERIALIZE never runs once VERIFY fails');
            assert(registry.listSources().length === 0, 'G.2.3 nothing registers for content that failed verification');
        }

        // G.3 — MATERIALIZE fails: material does NOT exist, no placement
        // is even computed, nothing registers.
        {
            let placementInfoCalls = 0, registerCalls = 0;
            const candidate = { contentHash: 'audit-fail-materialize-hash', locator: 'ar://audit-fail-materialize', storage: 'ar', publicationId: 'audit-fail-materialize-pub' };
            const registry = new WorldDiscoverySourceRegistry();
            const originalSetSource = registry.setSource.bind(registry);
            registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([9]), reason: null }),
                materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: SnapshotCandidateMaterializationOutcome.HASH_MISMATCH, contentHash: candidate.contentHash, reason: 'independent re-verification disagreed' }),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => { placementInfoCalls += 1; return { placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }; },
                findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Materialize Fail' })
            });
            const result = await cascade.processCandidate(candidate);
            assert(result.outcome === SnapshotCandidateMaterializationOutcome.HASH_MISMATCH, 'G.3.1 MATERIALIZE failure is reported verbatim');
            assert(placementInfoCalls === 0 && registerCalls === 0, 'G.3.2 nothing downstream of MATERIALIZE ever runs');
        }

        // G.4 — PLACEMENT fails (UNPLACED): material EXISTS, but the
        // World source does NOT — the exact distinction the mission
        // called out by name. Uses a REAL StoreSnapshotContentUseCase over
        // a REAL LocalContentStore (never the fake Arweave host) so the
        // "material genuinely exists locally" claim below is verified
        // directly, not merely inferred from the cascade's own reported
        // outcome.
        {
            let registerCalls = 0;
            const publicationId = 'audit-fail-placement-pub';
            const bytesText = 'materialized-but-unplaced-bytes';
            const bytes = new TextEncoder().encode(bytesText);
            const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
            const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
            // Compute the real content hash the same way any genuine
            // resolver would have reported it, via a throwaway probe
            // store — never a value this test invents by hand.
            const probeStore = new LocalContentStore(new InMemoryStorageProvider());
            const probeReference = probeStore.put(bytes);
            const contentHash = probeReference.hash;
            const candidate = { contentHash, locator: 'ar://audit-fail-placement', storage: 'ar', publicationId };

            const registry = new WorldDiscoverySourceRegistry();
            const originalSetSource = registry.setSource.bind(registry);
            registry.setSource = (...args) => { registerCalls += 1; return originalSetSource(...args); };
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, reason: null }),
                materializeSelectedSnapshotCommand: (resolution) => storeSnapshotContentUseCase.execute({ contentHash, bytes: resolution.bytes })
                    .then((stored) => ({ outcome: stored.outcome, contentHash, contentReference: stored.contentReference, reason: null })),
                worldDiscoverySourceRegistry: registry,
                // No authoritative placement is known for this publicationId.
                resolvePlacementInfo: () => null,
                findPublicationById: () => new Publication({ id: publicationId, title: 'Unplaced' })
            });
            const result = await cascade.processCandidate(candidate);
            assert(result.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'G.4.1 no known authoritative placement stops the chain at UNPLACED');
            assert(registerCalls === 0, 'G.4.2 registration never runs once placement fails');
            assert(registry.listSources().length === 0, 'G.4.3 the World runtime registry is untouched: material exists locally, but nothing represents it in the World');

            const locallyAvailable = await localContentStore.has(new ContentReference({ hash: contentHash }));
            assert(locallyAvailable === true, 'G.4.4 MATERIALIZE succeeded / PLACEMENT failed means EXACTLY: material exists locally, World source does not — both facts verified directly, not inferred from the cascade\'s own outcome alone');
        }

        // G.5 — REGISTER fails: placement succeeds, but a registry
        // collaborator's own failure (missing registry) stops the chain
        // at PLACED's own outcome, never invented as a new REGISTER-level
        // vocabulary.
        {
            const candidate = { contentHash: 'audit-fail-register-hash', locator: 'ar://audit-fail-register', storage: 'ar', publicationId: 'audit-fail-register-pub' };
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([2]), reason: null }),
                materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
                worldDiscoverySourceRegistry: null, // no registry configured at all
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 0, y: 0, z: 0 } }),
                findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'No Registry' })
            });
            const result = await cascade.processCandidate(candidate);
            assert(result.outcome === SnapshotWorldPlacementOutcome.PLACED, 'G.5.1 with no registry configured, the chain stops at PLACED — its own last successfully-computed stage, never a synthesized REGISTER failure code');

            console.log('✓ Section G: a failure at RESOLVE, VERIFY, MATERIALIZE, PLACEMENT, or REGISTER stops the cascade EXACTLY there — World state corresponds precisely to the last stage that actually succeeded, never more, never less');
        }
    }

    // ---------------------------------------------------------------
    // Section H — no accidental retry: a terminal failure for a
    // processing subject stays terminal for this cascade instance's own
    // lifetime, even across an ordinary later observation tick that
    // rediscovers the identical candidate.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const candidate = { contentHash: 'audit-no-retry-hash', locator: 'ar://audit-no-retry', storage: 'ar', publicationId: 'audit-no-retry-pub' };
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => {
                resolveCalls += 1;
                return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, reason: 'verification failed the first time' });
            },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED }),
            worldDiscoverySourceRegistry: new WorldDiscoverySourceRegistry()
        });

        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]) });

        // t0: first discovery, cascade run fails and settles.
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        const firstRun = await Promise.all(monitor.lastResult.map((c) => cascade.processCandidate(c)));
        assert(firstRun[0].outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, '1. t0: the candidate genuinely fails verification');

        // t3, t6, t9: three MORE ordinary observation ticks, each
        // independently rediscovering the SAME candidate — mirroring
        // WorldSnapshotDiscoveryMonitor's own 3-second cadence crossing a
        // spatial threshold repeatedly.
        for (const distance of [101, 202, 303]) {
            await monitor.observe({ position: { x: distance, y: 0, z: 0 } });
            await Promise.all(monitor.lastResult.map((c) => cascade.processCandidate(c)));
        }

        assert(resolveCalls === 1, '2. three further, entirely ordinary observation ticks for the SAME already-failed candidate never trigger a second resolve call — no hidden retry loop accidentally emerged');
        const finalResult = await cascade.processCandidate({ ...candidate });
        assert(finalResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, '3. the terminal outcome for this cascade instance remains exactly what it was at t0 — the current processing-identity/session semantics, never a silently-invented retry semantics');

        console.log('✓ Section H: a terminal failure stays terminal across repeated ordinary rediscovery — no accidental retry loop emerged from background re-observation alone');
    }

    // ---------------------------------------------------------------
    // Section I — movement/discovery races: a stale
    // WorldSnapshotDiscoveryMonitor response never corrupts a fresher
    // one, and the audit records which side of the "stale UI state vs.
    // invalid World content" boundary the current implementation sits
    // on.
    // ---------------------------------------------------------------
    {
        // I.1 — the winning (fresher) response's candidate reaches
        // REGISTERED even though a slower, now-stale request for an
        // EARLIER position is still pending when it does.
        {
            let resolveCalls = 0;
            const sharedCandidate = { contentHash: 'audit-race-shared-hash', locator: 'ar://audit-race-shared', storage: 'ar', publicationId: 'audit-race-shared-pub' };
            const registry = new WorldDiscoverySourceRegistry();
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
                materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: sharedCandidate.contentHash, reason: null }),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId: sharedCandidate.publicationId, position: { x: 0, y: 0, z: 0 } }),
                findPublicationById: () => new Publication({ id: sharedCandidate.publicationId, title: 'Race Shared' })
            });

            let releasePositionA;
            let releasePositionBCalled = false;
            const monitor = new WorldSnapshotDiscoveryMonitor({
                discoverSnapshotCandidatesCommand: () => {
                    if (!releasePositionBCalled) {
                        // The FIRST call (Position A) never resolves on its
                        // own — held open until released below, AFTER
                        // Position B's own call has already won the race.
                        return new Promise((resolve) => { releasePositionA = resolve; });
                    }
                    return Promise.resolve([sharedCandidate]);
                }
            });

            // Position A starts a discovery (held open).
            const observeA = monitor.observe({ position: { x: 0, y: 0, z: 0 } })
                .then(() => {
                    const candidates = monitor.lastResult || [];
                    return Promise.all(candidates.map((c) => cascade.processCandidate(c)));
                });
            await flushMicrotasks();

            // Position B starts a SECOND, independent discovery before A
            // has resolved, and B's own call resolves first — exactly
            // "B returns first, A returns later."
            releasePositionBCalled = true;
            const observeB = monitor.observe({ position: { x: 500, y: 0, z: 0 } })
                .then(() => {
                    const candidates = monitor.lastResult || [];
                    return Promise.all(candidates.map((c) => cascade.processCandidate(c)));
                });
            await observeB;
            assert(monitor.lastResult && monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === sharedCandidate.contentHash,
                '1. Position B\'s own (winning) response is the one recorded as lastResult');

            // NOW release Position A's stale, slower response.
            releasePositionA([sharedCandidate]);
            await observeA;

            assert(resolveCalls === 1, '2. despite the stale Position-A response ALSO eventually driving its own read of monitor.lastResult through the cascade, the cascade\'s own idempotency absorbed it — exactly one resolve call total');
            assert(registry.listSources().length === 1, '3. exactly one World registration resulted from the entire race, no corruption of registry state from the late-arriving stale response');

            console.log('✓ Section I.1: a stale, slower discovery response never corrupts a fresher one — WorldSnapshotDiscoveryMonitor\'s own request-id protection plus the cascade\'s own idempotency together absorb the race cleanly');
        }

        // I.2 — THE BOUNDARY THIS AUDIT WAS ASKED TO ESTABLISH: when the
        // slower (Position A) response would have carried a candidate
        // UNIQUE to it (never reported by Position B's own response), the
        // current implementation's own "read monitor.lastResult AFTER
        // observe() resolves" pattern (ui/views/WorldView.js's own
        // refreshSpatialUI(), reproduced exactly here) means that unique
        // candidate is NEVER fed to the cascade at all once a fresher
        // request has already won the race by the time the stale one's
        // own .then() callback runs. This is recorded here as an OBSERVED
        // FACT about the current implementation, not asserted as
        // desirable or fixed.
        {
            let resolveCalls = 0;
            const uniqueToPositionA = { contentHash: 'audit-race-unique-A-hash', locator: 'ar://audit-race-unique-A', storage: 'ar', publicationId: 'audit-race-unique-A-pub' };
            const uniqueToPositionB = { contentHash: 'audit-race-unique-B-hash', locator: 'ar://audit-race-unique-B', storage: 'ar', publicationId: 'audit-race-unique-B-pub' };
            const registry = new WorldDiscoverySourceRegistry();
            // Resolution only, deliberately stubbed short of materialization
            // — this section's own assertions are entirely about which
            // candidate reaches RESOLUTION, never about the full chain.
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
                materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, reason: null }),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: { x: 0, y: 0, z: 0 } }),
                findPublicationById: (publicationId) => new Publication({ id: publicationId, title: publicationId })
            });

            let callCount = 0;
            const monitor = new WorldSnapshotDiscoveryMonitor({
                discoverSnapshotCandidatesCommand: () => {
                    callCount += 1;
                    if (callCount === 1) {
                        // Position A's own call — held open.
                        return new Promise((resolve) => { monitor.__releaseA = resolve; });
                    }
                    // Position B's own call — resolves immediately with a
                    // DIFFERENT, non-overlapping candidate set.
                    return Promise.resolve([uniqueToPositionB]);
                }
            });

            const feed = async (observePromise) => {
                await observePromise;
                const candidates = monitor.lastResult || [];
                return Promise.all(candidates.map((c) => cascade.processCandidate(c)));
            };

            const observeA = monitor.observe({ position: { x: 0, y: 0, z: 0 } });
            const runA = feed(observeA);
            await flushMicrotasks();

            const observeB = monitor.observe({ position: { x: 500, y: 0, z: 0 } });
            const runB = feed(observeB);
            await runB;
            assert(monitor.lastResult[0].publicationId === uniqueToPositionB.publicationId, '1. Position B\'s own response won and is recorded as lastResult');

            // Release Position A's own stale response now.
            monitor.__releaseA([uniqueToPositionA]);
            await runA;

            // OBSERVED BOUNDARY: Position A's own uniquely-discovered
            // candidate was NEVER fed to the cascade — by the time its
            // own .then() ran, monitor.lastResult had already been
            // overwritten by Position B's own winning response, and
            // WorldView's own call site (reproduced by `feed()` above)
            // reads lastResult fresh, not whatever observe() itself
            // internally resolved. Two resolve calls happened — BOTH for
            // Position B's own candidate (fed twice, once per settled
            // observe() promise) — never one for Position A's own unique
            // candidate at all.
            assert(resolveCalls === 1, '2. OBSERVED: Position A\'s own uniquely-discovered candidate never reached resolution at all — only Position B\'s own (fed twice, absorbed by idempotency into one call) did');
            assert(registry.listSources().length === 0 || registry.listSources().every((s) => s.origin.includes(uniqueToPositionB.publicationId) === false),
                '3. sanity: this stub run never reaches REGISTERED (materialization is intentionally stubbed out above) — the assertion above is solely about which candidate reached RESOLUTION, not the full chain');

            console.log('✓ Section I.2: OBSERVED — today, a stale discovery response\'s own UNIQUE candidate is silently never fed to the cascade once a fresher response has already won the race; the current implementation sits on the "stale UI state also drops that content" side of the boundary the mission named, recorded here rather than silently assumed');
        }
    }

    // ---------------------------------------------------------------
    // Section J — World removal during processing: an unrelated,
    // mid-flight removal of the cascade's own eventual origin does not
    // cancel the in-flight run; the run's own later completion
    // re-establishes the registration. Unregistration is a World
    // contribution operation, never a cancellation command for an
    // independent cascade.
    // ---------------------------------------------------------------
    {
        const candidate = { contentHash: 'audit-removal-hash', locator: 'ar://audit-removal', storage: 'ar', publicationId: 'audit-removal-pub' };
        const origin = materializedSnapshotWorldOrigin(candidate.contentHash, candidate.publicationId);
        const registry = new WorldDiscoverySourceRegistry();

        // A pre-existing (e.g. from an earlier session) registration
        // already occupies this exact origin.
        const stalePublication = new Publication({ id: candidate.publicationId, title: 'Stale Prior Registration' });
        registry.setSource(describeWorldDiscoverySource({
            origin, publications: [stalePublication], placements: [{ publicationId: candidate.publicationId, position: { x: 1, y: 1, z: 1 } }]
        }));
        assert(registry.listSources().some((s) => s.origin === origin), 'sanity: the stale registration exists before the cascade starts');

        const deferredResolve = deferred();
        const freshPublication = new Publication({ id: candidate.publicationId, title: 'Fresh Cascade Registration' });
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => deferredResolve.promise,
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 9, y: 9, z: 9 } }),
            findPublicationById: () => freshPublication
        });

        const runPromise = cascade.processCandidate(candidate);
        await flushMicrotasks();

        // WHILE the cascade is still mid-flight (resolution not yet
        // settled), the World source at its own eventual origin gets
        // removed — e.g. an unrelated unregister action, or simply the
        // stale prior registration being cleaned up by something else
        // entirely.
        unregisterMaterializedSnapshotWorldSource(registry, candidate.contentHash, candidate.publicationId);
        assert(registry.listSources().some((s) => s.origin === origin) === false, '1. the World source is genuinely absent immediately after removal, mid-flight');

        // Now let the cascade actually complete.
        deferredResolve.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        const result = await runPromise;

        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '2. the cascade\'s own in-flight run completes to REGISTERED, entirely unaware of the mid-flight removal — it is an independent asynchronous operation, not something the World registry can cancel');
        const finalSource = registry.listSources().find((s) => s.origin === origin);
        assert(finalSource, '3. the cascade\'s own completion RE-ESTABLISHES the World source at its own origin');
        assert(finalSource.publications[0] === freshPublication, '4. the re-established source carries the cascade\'s own fresh Publication reference, never the stale one that was removed');

        console.log('✓ Section J: an unrelated mid-flight removal of the cascade\'s own eventual World origin does not cancel the in-flight run — its own later completion legitimately re-registers, because unregistration is a World-contribution operation, not a cancellation command for an independent cascade (current, deliberately-untested behavior, confirmed here rather than assumed)');
    }

    // ---------------------------------------------------------------
    // Section K — session teardown during processing: two independent
    // AutomaticSnapshotEncounterCascade instances, mirroring two
    // independent WorldView mounts, never share processing state; a
    // second session may legitimately reprocess the exact same
    // publicationId+contentHash pair a first session already started —
    // that is a new session, never a duplicate-processing bug.
    // ---------------------------------------------------------------
    {
        const candidate = { contentHash: 'audit-session-hash', locator: 'ar://audit-session', storage: 'ar', publicationId: 'audit-session-pub' };
        // The registry is APP-WIDE, constructed once by ui/main.js and
        // handed unchanged to every WorldView mount — never re-created
        // per session, unlike the cascade instance itself. See
        // ui/views/WorldView.js's own 0.9.187 comment, "Scoped to this
        // WorldView's own mount, exactly like `session` itself."
        const sharedRegistry = new WorldDiscoverySourceRegistry();

        let resolveCallsSessionA = 0;
        const deferredA = deferred();
        // Session A — the FIRST WorldView mount's own cascade instance.
        const cascadeSessionA = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCallsSessionA += 1; return deferredA.promise; },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'session-a', publicationId: candidate.publicationId, position: { x: 1, y: 1, z: 1 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Session A View' })
        });

        // Session A starts processing the candidate — still in flight
        // when the WorldView that owned it unmounts (nothing tears the
        // in-flight promise chain down; it is an independent async
        // operation exactly as Section J already established).
        const runSessionA = cascadeSessionA.processCandidate(candidate);
        await flushMicrotasks();
        assert(resolveCallsSessionA === 1, '1. Session A\'s own cascade genuinely started processing');

        // "WorldView unmounts" — modeled exactly as the real architecture
        // implies: nothing calls cascadeSessionA.destroy() (no such
        // method exists), and a BRAND NEW WorldView mount constructs a
        // BRAND NEW cascade instance, sharing only the app-wide registry.
        let resolveCallsSessionB = 0;
        const cascadeSessionB = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCallsSessionB += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }); },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'session-b', publicationId: candidate.publicationId, position: { x: 2, y: 2, z: 2 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Session B View' })
        });

        assert(cascadeSessionA !== cascadeSessionB, 'sanity: two distinct instances');
        assert(cascadeSessionA._results !== cascadeSessionB._results, '2. processingCandidates(A) !== processingCandidates(B) — two entirely separate Map instances, never shared state');

        // Session B legitimately reprocesses the IDENTICAL
        // publicationId+contentHash pair Session A already started —
        // this is NOT blocked by Session A's own in-flight map entry,
        // because Session B has no visibility into Session A's map at
        // all.
        const runSessionB = cascadeSessionB.processCandidate({ ...candidate });
        const resultB = await runSessionB;
        assert(resolveCallsSessionB === 1, '3. Session B started its OWN, independent resolve call — Session A\'s own in-flight (and even already-completed, see below) processing state never blocked it');
        assert(resultB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. Session B\'s own cascade reaches REGISTERED entirely on its own');

        // NOW let Session A's own (still in-flight, older) run finally
        // complete — nothing about Session B's own completion above
        // prevented, cancelled, or corrupted it.
        deferredA.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        const resultA = await runSessionA;
        assert(resultA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '5. Session A\'s own run, from a WorldView that no longer exists, still completes correctly — nothing "mutates a dead WorldView," because the cascade never held a reference to one in the first place');

        // The shared registry now reflects whichever cascade instance's
        // own registerMaterializedSnapshotWorldSource() call happened
        // LAST (B settled before A resolved above) — a plain
        // "replacement, not accumulation" outcome at the registry's own
        // layer, entirely ordinary and not a session-isolation violation:
        // both cascades derive the SAME origin (same contentHash +
        // publicationId), so the registry's own single-slot-per-origin
        // rule, not any cascade-level coordination, is what one publication
        // ID ending up singly-registered here.
        const finalSources = sharedRegistry.listSources().filter((s) => s.origin.includes(candidate.publicationId));
        assert(finalSources.length === 1, '6. exactly one registry slot exists for this publicationId+contentHash pair — Session A\'s LATER completion overwrote Session B\'s earlier one at the SAME derived origin, ordinary registry replacement semantics, never cross-session corruption');

        console.log('✓ Section K: two independent cascade instances (mirroring two independent WorldView mounts) never share processing state; a second session legitimately reprocessing the identical publicationId+contentHash pair a first session already started is a NEW SESSION, not a duplicate-processing bug, and a torn-down session\'s own in-flight work completes safely with no dangling reference to mutate');
    }

    // ---------------------------------------------------------------
    // Section L — authoritative placement invariant, under adversarial
    // claimedPosition values.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-authoritative-placement');
        const bytes = 'authoritative-placement-bytes';
        const publicationId = 'audit-authoritative-placement-pub';
        const worldModel = makeWorldModel();
        const authoritativePosition = new Position(10, 20, 30);
        worldModel.placeAt(publicationId, authoritativePosition);
        const reference = await placeAndAnnounce(host, bytes, {
            publicationId,
            // A deliberately hostile/incorrect claimed position, far
            // outside any plausible World bounds.
            claimedPosition: { x: 999999, y: 999999, z: 999999 }
        });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Authoritative Placement', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(host, worldModel, registry);
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        assert(candidate.claimedPosition.x === 999999, 'sanity: the hostile claim really is on the discovered candidate');

        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. the candidate still registers successfully');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        const [encounter] = encounters.publications;
        assert(encounter.position.x === 10 && encounter.position.y === 20 && encounter.position.z === 30,
            '2. the resulting World object appears EXACTLY at the authoritative placement (10,20,30) — the hostile claimedPosition (999999,999999,999999) never influenced it in any way');

        const source = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!source.includes('claimedPosition'), '3. structural confirmation: the cascade\'s own source never references claimedPosition at all — this is not merely a value that lost a comparison, the field is never read');

        console.log('✓ Section L: an adversarial claimedPosition of (999999,999999,999999) has zero effect — the resulting World object appears exactly at the authoritative (10,20,30) placement');
    }

    // ---------------------------------------------------------------
    // Section M — visibility remains downstream: a cascade-registered
    // Snapshot source produces a structurally ORDINARY World Encounter,
    // indistinguishable in shape from a LOCAL source at the same
    // position — the cascade establishes World participation only, it
    // never decides visibility.
    // ---------------------------------------------------------------
    {
        const position = { x: 42, y: 7, z: -3 };

        const localPublication = new Publication({ id: 'audit-visibility-local-pub', title: 'Ordinary Local Publication' });
        const localSource = describeWorldDiscoverySource({
            origin: 'local', publications: [localPublication], placements: [{ publicationId: localPublication.id, position }]
        });

        const worldModel = makeWorldModel();
        const snapshotPublicationId = 'audit-visibility-snapshot-pub';
        worldModel.placeAt(snapshotPublicationId, new Position(position.x, position.y, position.z));
        worldModel.knowPublication(new Publication({ id: snapshotPublicationId, title: 'Ordinary Cascade Publication' }));
        const host = makeHost('audit-visibility');
        await placeAndAnnounce(host, 'visibility-bytes', { publicationId: snapshotPublicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(localSource);
        const cascade = makeCascade(host, worldModel, registry);
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. sanity: the Snapshot registers');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        const localEncounter = encounters.publications.find((p) => p.objectId === localPublication.id);
        const snapshotEncounter = encounters.publications.find((p) => p.objectId === snapshotPublicationId);
        assert(localEncounter && snapshotEncounter, '2. both a LOCAL-origin and a cascade-registered Snapshot-origin Publication were derived');

        const localKeys = Object.keys(localEncounter).sort();
        const snapshotKeys = Object.keys(snapshotEncounter).sort();
        assert(JSON.stringify(localKeys) === JSON.stringify(snapshotKeys),
            '3. the two encounters carry EXACTLY the same set of fields — no snapshot-specific "isAutomatic"/"cascadeOrigin"/"sourceKind" field leaks into the shape');
        assert(localEncounter.position.x === snapshotEncounter.position.x
            && localEncounter.position.y === snapshotEncounter.position.y
            && localEncounter.position.z === snapshotEncounter.position.z,
            '4. both occupy the identical position, and neither encounter object records which origin family produced it');

        // NOTE: core/WorldEncounter.js legitimately mentions "snapshot" for
        // an entirely UNRELATED, older concept
        // (PublicationSnapshotPlacement/snapshotPlacements — a placement-
        // count fact, unrelated to which registry ORIGIN a Publication
        // arrived from) — so this audit checks structural behavior above
        // (identical field shape, identical position, no origin-family
        // marker) rather than a keyword sweep here, which would false-
        // positive on that pre-existing, unrelated vocabulary.

        console.log('✓ Section M: a cascade-registered Snapshot produces a structurally ordinary World Encounter, field-for-field identical in shape to a LOCAL-origin one — the cascade establishes World participation only, visibility/projection remains entirely downstream, unmodified machinery');
    }

    // ---------------------------------------------------------------
    // Section N — cross-family regression under live automatic traffic:
    // LOCAL/PEER sources survive an actively-running monitor+cascade
    // driving many discovery ticks alongside them.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const localPublication = new Publication({ id: 'audit-regression-local-pub', title: 'Regression Local' });
        const peerPublication = new Publication({ id: 'audit-regression-peer-pub', title: 'Regression Peer' });
        const localSource = describeWorldDiscoverySource({ origin: 'local', publications: [localPublication], placements: [{ publicationId: localPublication.id, position: { x: 5, y: 5, z: 5 } }] });
        const peerSource = describeWorldDiscoverySource({ origin: 'peer:regression-identity', publications: [peerPublication], placements: [{ publicationId: peerPublication.id, position: { x: 6, y: 6, z: 6 } }] });
        registry.setSource(localSource);
        registry.setSource(peerSource);

        const worldModel = makeWorldModel();
        const snapshotPublicationId = 'audit-regression-snapshot-pub';
        worldModel.placeAt(snapshotPublicationId, new Position(7, 7, 7));
        worldModel.knowPublication(new Publication({ id: snapshotPublicationId, title: 'Regression Snapshot' }));
        const host = makeHost('audit-regression');
        await placeAndAnnounce(host, 'regression-bytes', { publicationId: snapshotPublicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        const cascade = makeCascade(host, worldModel, registry);
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand });

        // Many independent, live observation ticks, exactly as an active
        // WorldView session would generate over a period of continuous
        // movement.
        for (const distance of [0, 150, 300, 450, 600, 750]) {
            await monitor.observe({ position: { x: distance, y: 0, z: 0 } });
            await Promise.all((monitor.lastResult || []).map((c) => cascade.processCandidate(c)));
        }

        const sourcesAfter = registry.listSources();
        assert(sourcesAfter.find((s) => s.origin === 'local') === localSource, '1. the pre-existing LOCAL source is untouched — the exact same reference, after six live discovery ticks');
        assert(sourcesAfter.find((s) => s.origin === 'peer:regression-identity') === peerSource, '2. the pre-existing PEER source is untouched — the exact same reference');
        assert(sourcesAfter.some((s) => s.origin.includes(snapshotPublicationId)), '3. the Snapshot itself did register, in its own dedicated origin');
        assert(sourcesAfter.length === 3, '4. exactly three sources exist — LOCAL and PEER were neither replaced, merged, nor duplicated by six ticks of live automatic traffic');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(sourcesAfter));
        assert(encounters.publications.length === 3, '5. all three Publications — LOCAL, PEER, and the automatically-discovered Snapshot — converge through the identical, unmodified World Encounter pipeline');

        console.log('✓ Section N: LOCAL and PEER World sources remain completely unaffected across six live automatic-discovery ticks — the automatic Snapshot system introduces no Snapshot-specific rendering or selection branch');
    }

    // ---------------------------------------------------------------
    // Section O — manual controls remain independent: a manual
    // Resolve/Materialize/Place/Register chain, running CONCURRENTLY
    // with an automatic cascade processing an unrelated candidate,
    // never attaches to the cascade's own processing map, and vice
    // versa.
    // ---------------------------------------------------------------
    {
        const hostAutomatic = makeHost('audit-independence-automatic');
        const automaticPublicationId = 'audit-independence-automatic-pub';
        const worldModelAutomatic = makeWorldModel();
        worldModelAutomatic.placeAt(automaticPublicationId, new Position(1, 1, 1));
        worldModelAutomatic.knowPublication(new Publication({ id: automaticPublicationId, title: 'Independence Automatic' }));
        await placeAndAnnounce(hostAutomatic, 'independence-automatic-bytes', { publicationId: automaticPublicationId, claimedPosition: { x: 0, y: 0, z: 0 } });

        const hostManual = makeHost('audit-independence-manual');
        const manualPublicationId = 'audit-independence-manual-pub';
        const manualReference = await placeAndAnnounce(hostManual, 'independence-manual-bytes', { publicationId: manualPublicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        const manualPublication = new Publication({ id: manualPublicationId, title: 'Independence Manual', contentReference: manualReference });
        const manualPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(manualPlacementRegistry, manualPublicationId, new Position(2, 2, 2));
        const manualPlacementInfo = placementInfoFor(manualPlacementRegistry, manualPublicationId);

        const registry = new WorldDiscoverySourceRegistry();
        const cascade = makeCascade(hostAutomatic, worldModelAutomatic, registry);

        // Kick off the automatic cascade for its own candidate, and the
        // manual chain for a COMPLETELY UNRELATED candidate, genuinely
        // concurrently.
        const [automaticCandidate] = await hostAutomatic.discoverSnapshotCandidatesCommand();
        const automaticRun = cascade.processCandidate(automaticCandidate);

        const [manualCandidate] = await hostManual.discoverSnapshotCandidatesCommand();
        const manualResolution = await hostManual.resolveSelectedSnapshotCommand(manualCandidate);
        const manualMaterialization = await hostManual.materializeSelectedSnapshotCommand(manualResolution);
        const manualPlacement = resolveSnapshotWorldPlacement(manualMaterialization, manualPlacementInfo);
        const manualRegistration = registerMaterializedSnapshotWorldSource(registry, manualPlacement, manualPublication);

        const automaticResult = await automaticRun;

        assert(manualResolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '1. the manual resolve command works, entirely independent of the concurrently-running cascade');
        assert(manualMaterialization.outcome === StoreSnapshotContentOutcome.STORED, '2. the manual materialize command works');
        assert(manualPlacement.outcome === SnapshotWorldPlacementOutcome.PLACED, '3. the manual placement function works');
        assert(manualRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. the manual registration works');
        assert(automaticResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '5. the automatic cascade\'s own unrelated candidate ALSO reaches REGISTERED, unaffected by the concurrent manual chain');

        assert(cascade._results.size === 1, '6. the cascade\'s own processing map holds exactly one entry — the manual chain never attached itself to the cascade\'s idempotency map');
        assert(Array.from(cascade._results.keys())[0].includes(automaticPublicationId), '7. that one entry names the automatic candidate\'s own key, never the manual publicationId');

        const sources = registry.listSources();
        assert(sources.length === 2 && sources.some((s) => s.origin.includes(automaticPublicationId)) && sources.some((s) => s.origin.includes(manualPublicationId)),
            '8. both the automatic and manual registrations coexist independently in the shared registry, each under its own dedicated origin');

        console.log('✓ Section O: a manual Resolve/Materialize/Place/Register chain and a concurrently-running automatic cascade for an unrelated candidate never interfere with each other — neither attaches to the other\'s own state');
    }

    // ---------------------------------------------------------------
    // Section P — registry churn isolation: unrelated LOCAL/PEER/
    // Snapshot registry mutations occurring WHILE a cascade run is
    // in-flight never trigger, block, duplicate, or otherwise perturb
    // that unrelated in-flight run.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        const candidate = { contentHash: 'audit-churn-hash', locator: 'ar://audit-churn', storage: 'ar', publicationId: 'audit-churn-pub' };
        const registry = new WorldDiscoverySourceRegistry();
        const deferredResolve = deferred();

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return deferredResolve.promise; },
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidate.contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: candidate.publicationId, position: { x: 3, y: 3, z: 3 } }),
            findPublicationById: () => new Publication({ id: candidate.publicationId, title: 'Churn' })
        });

        const runPromise = cascade.processCandidate(candidate);
        await flushMicrotasks();
        assert(resolveCalls === 1, 'sanity: the cascade genuinely started');

        // Registry churn WHILE the cascade above is still mid-flight:
        // unrelated LOCAL registration, unrelated PEER registration, and
        // an unrelated Snapshot removal (of an origin that was never
        // even registered — an ordinary no-op at the registry's own
        // layer).
        registry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [new Publication({ id: 'audit-churn-local-pub', title: 'Churn Local' })], placements: [{ publicationId: 'audit-churn-local-pub', position: { x: 0, y: 0, z: 0 } }] }));
        registry.setSource(describeWorldDiscoverySource({ origin: 'peer:churn-identity', publications: [new Publication({ id: 'audit-churn-peer-pub', title: 'Churn Peer' })], placements: [{ publicationId: 'audit-churn-peer-pub', position: { x: 1, y: 1, z: 1 } }] }));
        unregisterMaterializedSnapshotWorldSource(registry, 'unrelated-hash', 'unrelated-pub');
        await flushMicrotasks();

        assert(resolveCalls === 1, '1. the unrelated LOCAL registration, PEER registration, and Snapshot removal caused no additional resolve call for the unrelated in-flight cascade');

        deferredResolve.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        const result = await runPromise;

        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '2. the cascade completes normally, entirely undisturbed by the churn that happened around it');
        const sources = registry.listSources();
        assert(sources.length === 3, '3. all three sources — the two unrelated registrations plus the cascade\'s own — coexist; nothing was evicted by the churn or by the cascade\'s own completion');

        const registrySource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!/\.subscribe\(/.test(registrySource), '4. structural confirmation: the cascade never subscribes to the registry at all — it has no way to even OBSERVE unrelated churn, let alone react to it');

        console.log('✓ Section P: unrelated LOCAL/PEER registrations and an unrelated Snapshot removal, all occurring while a cascade run is in-flight, never trigger, block, or duplicate that unrelated run');
    }

    // ---------------------------------------------------------------
    // Section Q — structural sweep: no retry/backoff/persistence/ranking
    // vocabulary has crept into the audited files since 0.9.187.
    // ---------------------------------------------------------------
    {
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!/\bretry\b|backoff|setTimeout|setInterval/i.test(cascadeSource), '1. no retry/backoff/polling vocabulary in the cascade');
        assert(!/localStorage|IndexedDB|StorageProvider|persist/i.test(cascadeSource), '2. no persistence vocabulary — `_results` remains purely in-memory, per-instance');
        assert(!/rank|score|trust|preference|nearest/i.test(cascadeSource), '3. no ranking/trust/provider-scoring vocabulary');
        assert(!/\bexpir\w*\b|\bttl\b|\bstale\b/i.test(cascadeSource), '4. no expiration/TTL vocabulary');

        const monitorSource = await codeOnlySource('application/WorldSnapshotDiscoveryMonitor.js');
        assert(!/\bretry\b|backoff/i.test(monitorSource), '5. no retry/backoff vocabulary in the discovery monitor either');

        const bridgeSource = await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(!/distance|viewport|proximity/i.test(bridgeSource), '6. no distance-based/viewport-based removal vocabulary in the World registration bridge');

        const outcomeKeys = Object.keys(AutomaticSnapshotEncounterCascadeOutcome);
        assert(outcomeKeys.length === 1 && outcomeKeys.includes('INELIGIBLE'), '7. AutomaticSnapshotEncounterCascadeOutcome still carries exactly its own one new value — no new Snapshot lifecycle enum was introduced');

        console.log('✓ Section Q: structural sweep confirms no retry/backoff/persistence/ranking/expiration/distance-based-removal vocabulary exists anywhere in the audited automatic-Snapshot files — the audit found no evidence any of those speculative mechanisms are actually necessary');
    }

    console.log('\n✅ All World Snapshot Automatic Encounter Lifecycle Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
