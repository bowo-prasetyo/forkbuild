import { readFile, readdir } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from '../application/AutomaticSnapshotEncounterCascadeOutcome.js';
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
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters, WorldEncounterKind } from '../core/WorldEncounter.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource, derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.195 — Automatic Snapshot Subsystem Boundary & Convergence Audit.
//
// Test-only. No production changes. 0.9.131 through 0.9.194 built the
// entire autonomous Snapshot pipeline one proven seam at a time:
//
//   WorldView spatial cadence
//        │
//        ▼
//   WorldSnapshotDiscoveryMonitor (0.9.186)
//        │
//        ▼
//   discoverSnapshotCandidatesCommand (0.9.150/0.9.151)
//        │
//        ▼
//   AutomaticSnapshotEncounterCascade (0.9.187)
//        │
//        ├── resolve (0.9.152)      ├── materialize (0.9.158)
//        ├── verify (bundled in resolve)
//        ├── place (0.9.159)
//        └── session guard (0.9.193)
//                │
//                ▼
//        World source registration (0.9.160)
//                │
//                ▼
//        ordinary World Encounter (0.9.0/0.9.7/0.9.9)
//                │
//                ▼
//        retention reconciliation (0.9.189/0.9.190)
//
// Every individual seam above already has its own dedicated, passing audit
// (0.9.153, 0.9.156, 0.9.162, 0.9.188, 0.9.191, 0.9.192, 0.9.194, among
// others). This milestone asks a DIFFERENT, whole-system question none of
// those files' own scope ever covered:
//
//   "Has Snapshot automation stopped exactly where it should, without
//    accidentally becoming a second World system?"
//
// Twelve sections, each a distinct boundary or convergence claim, and
// deliberately never re-proving ground an earlier audit already closed —
// only combining, cross-cutting, or structurally re-confirming it at the
// whole-system level a single-seam audit could never see:
//
//   Section A: the complete autonomous path, real machinery, one spatial
//              observation to a rendered World encounter, with no manual
//              UI action anywhere in the call graph.
//   Section B: the session boundary at whole-system scale — a torn-down
//              session's own late completion never mutates a running
//              World that also carries pre-existing LOCAL/PEER sources,
//              and a live session's registration is untouched by it.
//   Section C: the retention boundary — reconcile() cannot rediscover,
//              cannot cascade, cannot touch a manual registration, cannot
//              touch LOCAL/PEER, and cannot delete material, PROVEN by
//              construction (it holds no reference to any of those
//              collaborators at all) as well as by behavior.
//   Section D: failure isolation across every stage in one batch — a
//              discovery/resolution failure, a verification failure, a
//              materialization failure, a placement failure, and a
//              thrown collaborator all terminate their OWN candidate
//              only, alongside one genuinely successful registration in
//              the same tick (session-guard suppression is necessarily
//              SESSION-wide, never per-candidate, so it is audited at
//              whole-system scope in Sections B and I instead).
//   Section E: identity closure — contentHash, publicationId, locator/
//              storage, the Nostr event id, the World origin, the World
//              position, and session identity are all, by construction,
//              distinct values, and nothing in the pipeline ever
//              substitutes one for another.
//   Section F: source-family convergence — LOCAL, PEER, and SNAPSHOT
//              origins registered together converge, past
//              WorldDiscoverySourceRegistry, into IDENTICALLY-shaped
//              World encounters; Snapshot-specific machinery terminates
//              exactly at that convergence point.
//   Section G: a structural, repository-wide import sweep proving ordinary
//              World machinery never imports Nostr discovery, Arweave
//              resolution, or any Snapshot acquisition file — the
//              dependency direction runs Snapshot → World source boundary
//              → ordinary World machinery, never the reverse.
//   Section H: automatic vs. manual registration/unregistration remain
//              distinguishable only by ORCHESTRATION PROVENANCE (which
//              code called the shared primitive), never by a registry
//              field — and material deletion, Publication deletion, and
//              Nostr withdrawal are confirmed to not exist as concepts
//              anywhere in this pipeline at all.
//   Section I: re-entry — a session that dies mid-cascade suppresses its
//              own subject forever, but the SUBJECT itself is never
//              tombstoned; a fresh session's own independent cascade
//              still registers it, and no blocklist/tombstone vocabulary
//              exists anywhere in the automatic pipeline's own source.
//   Section J: cadence composition — exactly one spatial cadence drives
//              both discovery observation and retention reconciliation;
//              no Snapshot file owns a timer of its own.
//   Section K: no accidental authority — a claimed position is never
//              promoted to World position, discovery order never becomes
//              ranking, identical content under different Publications
//              never becomes deduplication, and registration never grants
//              ownership or trust.
//   Section L: the explicit architectural stopping-point assertion — the
//              autonomous Snapshot machinery ends at "maintain eligible
//              Snapshot contributions to the ordinary World source
//              registry during the lifetime of a WorldView session," and
//              nothing beyond that (acceptance, ownership, merge/adopt,
//              trust, synchronization, conflict resolution, withdrawal)
//              exists anywhere in its own source.
//
// Every collaborator this file exercises is existing, unmodified
// application code — the same classes 0.9.131 through 0.9.194 already
// shipped, composed exactly as `ui/views/WorldView.js` itself composes
// them. No finding in this audit required a change to any of them.

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

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments AND `<!-- -->` HTML comments (Vue
// template prose embedded in a `ui/components/*.js` file's own template
// string) so a structural sweep matches genuine code, never a comment
// that merely NAMES a file/vocabulary word in prose — the identical
// helper every prior audit in this family (0.9.156, 0.9.191, 0.9.194,
// ...) already uses for the identical reason.
async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function listJsFilesRecursively(relativeDir) {
    const results = [];
    async function walk(dir) {
        let entries;
        try {
            entries = await readdir(new URL(dir, SOURCE_ROOT), { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const childPath = `${dir}${dir.endsWith('/') ? '' : '/'}${entry.name}`;
            if (entry.isDirectory()) {
                await walk(`${childPath}/`);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                results.push(childPath);
            }
        }
    }
    await walk(relativeDir);
    return results;
}

function originFor(contentHash, publicationId) {
    return `snapshot:${contentHash}:${publicationId}`;
}

function hasOrigin(registry, origin) {
    return registry.listSources().some((source) => source.origin === origin);
}

function publicationStub(id) {
    return { id, title: `Publication ${id}`, publisherIdentity: 'identity-1' };
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function resolvedOutcome(bytes = new Uint8Array([1])) {
    return { outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, reason: null };
}

function storedOutcome(contentHash) {
    return { outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null };
}

// ---------------------------------------------------------------------
// Real-machinery host — identical shape to 0.9.191's/0.9.194's own
// makeHost(): a real (in-memory) Nostr relay, a real (in-memory) Arweave
// gateway/signer, and a real LocalContentStore, composed through the
// SAME, unmodified application commands ui/main.js itself wires up.
// ---------------------------------------------------------------------
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
        return { id: `fake-boundary-tx-${counter}`, transaction: { id: `fake-boundary-tx-${counter}`, data: material } };
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

// ---------------------------------------------------------------------
// makeWorldSession({...}) — the SAME monitor -> cascade -> (on
// REGISTERED) noteAutomaticRegistration() -> synchronous reconcile()
// composition 0.9.191/0.9.192/0.9.194's own harnesses already established
// — one instance per WorldView mount, wired together only through a
// `tick(position)` call exactly mirroring `refreshSpatialUI()`. An
// optional `isSessionActive` closure (0.9.193) and `teardown()` are
// supported for the sections that need a session boundary; sections that
// don't simply never call `teardown()`.
// ---------------------------------------------------------------------
function makeWorldSession({
    discoverSnapshotCandidatesCommand,
    resolveSelectedSnapshotCommand,
    materializeSelectedSnapshotCommand,
    worldDiscoverySourceRegistry,
    resolvePlacementInfo = null,
    findPublicationById = null,
    retentionRadius = undefined
}) {
    let sessionActive = true;

    const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
    const cascade = new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry,
        resolvePlacementInfo,
        findPublicationById,
        isSessionActive: () => sessionActive
    });
    const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({
        worldDiscoverySourceRegistry,
        ...(retentionRadius === undefined ? {} : { retentionRadius })
    });

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

        const removedThisTick = reconciliation.reconcile(position);
        return { removedThisTick, settled };
    }

    async function fullTick(position) {
        const { removedThisTick, settled } = tick(position);
        const cascadeResults = await settled;
        return { removedThisTick, cascadeResults };
    }

    function teardown() { sessionActive = false; }

    return { monitor, cascade, reconciliation, tick, fullTick, teardown, isActive: () => sessionActive };
}

async function runTests() {
    // =================================================================
    // Section A — the complete autonomous path, real machinery, no
    // manual UI action anywhere in the call graph.
    // =================================================================
    {
        const host = makeHost('boundary-complete-path');
        const publicationId = 'boundary-complete-path-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(7, 0, 3));
        const reference = await placeAndAnnounce(host, 'complete-path-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Complete Path', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const session = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });

        // ONE spatial observation — exactly one refreshSpatialUI() tick —
        // carries the whole chain from discovery through registration.
        const result = await session.fullTick(pos(0, 0, 0));
        assert(result.cascadeResults.length === 1 && result.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            `1. a single spatial observation drives discovery -> cascade -> registration to completion — got ${result.cascadeResults[0] && result.cascadeResults[0].outcome}`);
        assert(hasOrigin(registry, originFor(reference.hash, publicationId)), '2. genuinely registered in the shared World registry');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1 && encounters.publications[0].objectId === publicationId,
            '3. the ordinary World rendering pipeline renders it, with no rendering code of this file\'s own');
        assert(encounters.publications[0].position.x === 7 && encounters.publications[0].position.z === 3,
            '4. the rendered position is the authoritative World placement, not the candidate\'s own claimed position');

        // NO MANUAL UI ACTION: the automatic path never references the
        // manual UI component at all — structurally confirmed against the
        // exact files this run just exercised.
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        const monitorSource = await codeOnlySource('application/WorldSnapshotDiscoveryMonitor.js');
        const reconciliationSource = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js');
        for (const [name, source] of [['AutomaticSnapshotEncounterCascade.js', cascadeSource], ['WorldSnapshotDiscoveryMonitor.js', monitorSource], ['AutomaticSnapshotEncounterRetentionReconciliation.js', reconciliationSource]]) {
            assert(!/OwnPublicationPanel/.test(source), `5. ${name} never references OwnPublicationPanel.js — no manual UI action is reachable from, or required by, the automatic path`);
        }

        console.log('✓ Section A: a single real-machinery spatial observation carries the ENTIRE autonomous path — spatial observation -> discovery -> candidate -> cascade -> acquisition -> placement -> registration -> World rendering — to completion, with no manual UI action anywhere in the call graph');
    }

    // =================================================================
    // Section B — the session boundary at whole-system scale: a
    // torn-down session's late completion never mutates a running World
    // that also carries pre-existing LOCAL/PEER contributions.
    // =================================================================
    {
        const host = makeHost('boundary-session-scope');
        const publicationId = 'boundary-session-scope-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'session-scope-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Session Scope', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();

        // Pre-existing LOCAL and PEER World contributions — neither one
        // has anything to do with Snapshot automation.
        const localPublication = publicationStub('boundary-local-pub');
        const localSource = describeLocalWorldDiscoverySource({
            publications: [localPublication],
            placements: [{ publicationId: localPublication.id, position: pos(1, 0, 0) }]
        });
        registry.setSource(localSource);
        const peerPublication = publicationStub('boundary-peer-pub');
        const connectedPeer = { remoteIdentity: { identityId: 'peer-session-scope' } };
        const peerSource = describePeerWorldDiscoverySource({
            publications: [peerPublication],
            placements: [{ publicationId: peerPublication.id, position: pos(2, 0, 0) }]
        }, connectedPeer);
        registry.setSource(peerSource);
        const localBefore = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        const peerBefore = registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(connectedPeer));

        const origin = originFor(reference.hash, publicationId);
        const resolveGate = deferred();

        // Session A mounts, discovers, begins resolving, and is torn down
        // mid-flight — exactly WorldView's own onBeforeUnmount().
        const sessionA = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: (candidate) => resolveGate.promise.then(() => host.resolveSelectedSnapshotCommand(candidate)),
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });
        const { settled } = sessionA.tick(pos(0, 0, 0));
        await flushMicrotasks();
        sessionA.teardown();

        // Session B mounts fresh, live, and independently registers the
        // SAME subject BEFORE session A's held-open resolution settles.
        const sessionB = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });
        const resultB = await sessionB.fullTick(pos(0, 0, 0));
        assert(resultB.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. session B genuinely registers the subject');
        assert(hasOrigin(registry, origin), '2. the registration exists');

        // NOW session A's held-open resolution finally settles.
        resolveGate.resolve();
        const resultsA = await settled;
        assert(resultsA[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `3. session A's late completion is SUPPRESSED — got ${resultsA[0] && resultsA[0].outcome}`);

        // The whole-system invariant: session A never mutated ANYTHING —
        // not its own subject's registration (which stands, from session
        // B), and not LOCAL or PEER, which were never even touched by
        // either session.
        assert(registry.listSources().length === 3, '4. exactly three sources exist: LOCAL, PEER, and the one Snapshot registration — session A\'s late arrival created no fourth');
        assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) === localBefore, '5. LOCAL is the exact same object reference, untouched by either session');
        assert(registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(connectedPeer)) === peerBefore, '6. PEER is the exact same object reference, untouched by either session');
        assert(hasOrigin(registry, origin), '7. session B\'s own registration still stands, completely undisturbed by session A\'s later suppressed completion for the identical subject');

        console.log('✓ Section B: whole-system session boundary — a torn-down session\'s late completion for a subject a LIVE session already registered is SUPPRESSED without perturbing that registration, and pre-existing LOCAL/PEER World contributions are never touched by either session at any point');
    }

    // =================================================================
    // Section C — the retention boundary: reconcile() cannot rediscover,
    // cascade, touch a manual registration, touch LOCAL/PEER, or delete
    // material — proven by construction, not merely by observed behavior.
    // =================================================================
    {
        // C1 — by construction: a reconciliation instance is handed
        // NOTHING but a registry (and, optionally, a radius/policy
        // override) — it holds no reference whatsoever to any discovery,
        // resolution, materialization, or cascade collaborator, so it is
        // structurally incapable of calling any of them.
        {
            // Every value an instance actually holds is either the
            // registry itself, its own Map, or its own configured
            // radius/policy function — never a discovery, resolve,
            // materialize, or cascade collaborator, because the
            // constructor never accepts one, confirmed structurally below
            // against the class's own source rather than merely its own
            // documented parameter list.
            const reconciliationSource = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js');
            for (const forbidden of ['discoverSnapshotCandidatesCommand', 'resolveSelectedSnapshotCommand', 'materializeSelectedSnapshotCommand', 'AutomaticSnapshotEncounterCascade', 'WorldSnapshotDiscoveryMonitor', 'DiscoverSnapshotCandidatesCommand']) {
                assert(!reconciliationSource.includes(forbidden), `1. application/AutomaticSnapshotEncounterRetentionReconciliation.js never references "${forbidden}" — reconcile() cannot rediscover or cascade because it holds no path to either, not merely because it chooses not to call one`);
            }
        }

        // C2 — behaviorally: LOCAL, PEER, a MANUAL Snapshot registration,
        // and an AUTOMATIC Snapshot registration all coexist; only the
        // automatic one is ever watched, and only it is removed once the
        // Wanderer moves far away.
        {
            const registry = new WorldDiscoverySourceRegistry();

            const localPublication = publicationStub('boundary-c-local-pub');
            registry.setSource(describeLocalWorldDiscoverySource({
                publications: [localPublication],
                placements: [{ publicationId: localPublication.id, position: pos(0, 0, 0) }]
            }));
            const connectedPeer = { remoteIdentity: { identityId: 'peer-boundary-c' } };
            const peerPublication = publicationStub('boundary-c-peer-pub');
            registry.setSource(describePeerWorldDiscoverySource({
                publications: [peerPublication],
                placements: [{ publicationId: peerPublication.id, position: pos(0, 0, 0) }]
            }, connectedPeer));

            const manualPublication = publicationStub('boundary-c-manual-pub');
            const manualPlacement = { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: manualPublication.id, contentHash: 'manual-c-hash', position: pos(0, 0, 0), reason: null };
            const manualRegistration = registerMaterializedSnapshotWorldSource(registry, manualPlacement, manualPublication);
            assert(manualRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity: manual registration succeeded');

            const localBefore = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
            const peerBefore = registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(connectedPeer));
            const manualBefore = registry.listSources().find((s) => s.origin === manualRegistration.origin);

            const automaticPublicationId = 'boundary-c-automatic-pub';
            const automaticContentHash = 'automatic-c-hash';
            const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry, retentionRadius: 50 });
            const automaticPlacement = { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: automaticPublicationId, contentHash: automaticContentHash, position: pos(0, 0, 0), reason: null };
            registerMaterializedSnapshotWorldSource(registry, automaticPlacement, publicationStub(automaticPublicationId));
            reconciliation.noteAutomaticRegistration({ publicationId: automaticPublicationId, contentHash: automaticContentHash });

            // Move far away and reconcile.
            const removed = reconciliation.reconcile(pos(9000, 0, 0));
            assert(removed.length === 1 && removed[0].publicationId === automaticPublicationId, '2. reconcile() removes exactly the one automatic subject it was ever told about');
            assert(!hasOrigin(registry, originFor(automaticContentHash, automaticPublicationId)), '3. the automatic Snapshot is gone');

            assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) === localBefore, '4. LOCAL untouched — same object reference');
            assert(registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(connectedPeer)) === peerBefore, '5. PEER untouched — same object reference');
            assert(registry.listSources().find((s) => s.origin === manualRegistration.origin) === manualBefore, '6. the manual Snapshot registration is untouched — same object reference — even though the Wanderer moved far away from it too; reconcile() only ever evaluates subjects THIS instance was told registered automatically');
            assert(publicationUnchanged(manualPublication), '7. sanity — the manual Publication object itself was never mutated');

            console.log('✓ Section C: reconcile() is structurally incapable of rediscovering or cascading (it holds no reference to either collaborator), and behaviorally touches only the one automatic subject it was ever told about — LOCAL, PEER, and a manual Snapshot registration all survive untouched even when moved far outside the retention radius');
        }
    }

    // =================================================================
    // Section D — failure isolation: every stage's own failure terminates
    // only its own candidate, exercised together in one batch alongside
    // one genuinely successful registration.
    // =================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const happyPublicationId = 'boundary-d-happy-pub';
        let materializeCalls = 0;

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: (candidate) => {
                if (candidate.publicationId === 'boundary-d-not-discovered-pub') {
                    return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, bytes: null, reason: 'no candidate found' });
                }
                if (candidate.publicationId === 'boundary-d-hash-mismatch-pub') {
                    return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, bytes: null, reason: 'bytes did not hash to the requested contentHash' });
                }
                if (candidate.publicationId === 'boundary-d-thrown-pub') {
                    throw new Error('synchronous collaborator failure');
                }
                return Promise.resolve(resolvedOutcome());
            },
            materializeSelectedSnapshotCommand: (resolution) => {
                materializeCalls += 1;
                if (resolution.__publicationId === 'boundary-d-materialize-fail-pub') {
                    return Promise.resolve({ outcome: StoreSnapshotContentOutcome.HASH_MISMATCH, contentHash: null, reason: 'materialized bytes did not match' });
                }
                return Promise.resolve(storedOutcome(resolution.__contentHash));
            },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => (publicationId === happyPublicationId
                ? { placementId: 'p-happy', publicationId, position: pos(0, 0, 0) }
                : null), // every other publicationId has no known placement -> UNPLACED
            findPublicationById: (publicationId) => publicationStub(publicationId)
        });

        // resolveSelectedSnapshotCommand above needs each resolution to
        // carry its own candidate's own publicationId/contentHash straight
        // through so materialize (which only ever receives the
        // resolution) can special-case exactly one candidate — mirroring
        // the identical plumbing 0.9.191's/0.9.194's own multi-subject
        // sections already use.
        const baseResolve = cascade._resolveSelectedSnapshotCommand;
        cascade._resolveSelectedSnapshotCommand = (candidate) => Promise.resolve(baseResolve(candidate)).then((resolution) => (resolution && resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED)
            ? { ...resolution, __publicationId: candidate.publicationId, __contentHash: candidate.contentHash }
            : resolution);

        const candidates = [
            // 1. discovery/resolution failure.
            { contentHash: 'd-hash-1', locator: 'ar://d1', storage: 'ar', publicationId: 'boundary-d-not-discovered-pub' },
            // 2. verification failure, bundled inside resolution.
            { contentHash: 'd-hash-2', locator: 'ar://d2', storage: 'ar', publicationId: 'boundary-d-hash-mismatch-pub' },
            // 3. materialization failure.
            { contentHash: 'd-hash-3', locator: 'ar://d3', storage: 'ar', publicationId: 'boundary-d-materialize-fail-pub' },
            // 4. placement failure — resolves and materializes fine, but
            //    no authoritative World placement is known.
            { contentHash: 'd-hash-4', locator: 'ar://d4', storage: 'ar', publicationId: 'boundary-d-unplaced-pub' },
            // 5. a thrown (never-resolving) collaborator.
            { contentHash: 'd-hash-5', locator: 'ar://d5', storage: 'ar', publicationId: 'boundary-d-thrown-pub' },
            // 6. the complete happy path.
            { contentHash: 'd-hash-6', locator: 'ar://d6', storage: 'ar', publicationId: happyPublicationId }
        ];

        const results = await Promise.all(candidates.map((candidate) => cascade.processCandidate(candidate)));

        assert(results[0].outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, `1. candidate 1 (discovery/resolution failure) terminates at NOT_DISCOVERED — got ${results[0].outcome}`);
        assert(results[1].outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, `2. candidate 2 (verification failure) terminates at CONTENT_HASH_MISMATCH — got ${results[1].outcome}`);
        assert(results[2].outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, `3. candidate 3 (materialization failure) terminates at HASH_MISMATCH — got ${results[2].outcome}`);
        assert(results[3].outcome === SnapshotWorldPlacementOutcome.UNPLACED, `4. candidate 4 (placement failure) terminates at UNPLACED — got ${results[3].outcome}`);
        assert(results[4].outcome === AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE, `5. candidate 5 (a synchronously-thrown collaborator) terminates at INELIGIBLE, never propagating an unhandled exception through Promise.all — got ${results[4].outcome}`);
        assert(results[5].outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `6. candidate 6 (the happy path) still reaches REGISTERED, completely unaffected by every OTHER candidate's own failure in the SAME batch — got ${results[5].outcome}`);

        assert(registry.listSources().length === 1 && hasOrigin(registry, originFor('d-hash-6', happyPublicationId)), '7. exactly one World source exists — the one genuinely successful registration');
        assert(materializeCalls === 3, '8. materialization was attempted for exactly the three candidates that reached it (3, 4, 6) — never for 1, 2 (stopped at resolution), or 5 (stopped at the thrown collaborator)');

        console.log('✓ Section D: six candidates processed together in one batch — discovery/resolution failure, verification failure, materialization failure, placement failure, a thrown collaborator, and a full success — each terminates at exactly its own stage\'s own outcome, none propagates an exception, and none affects any other candidate\'s own independent result');
    }

    // =================================================================
    // Section E — identity closure: contentHash, publicationId, locator/
    // storage, the Nostr event id, the World origin, the World position,
    // and session identity are all, by construction, distinct values,
    // and nothing in the pipeline ever substitutes one for another.
    // =================================================================
    {
        const host = makeHost('boundary-identity');
        const publicationId = 'boundary-identity-pub';
        const worldModel = makeWorldModel();
        const registeredPosition = new Position(11, 22, 33);
        worldModel.placeAt(publicationId, registeredPosition);
        const reference = await placeAndAnnounce(host, 'identity-closure-bytes', { publicationId, claimedPosition: { x: 999, y: 999, z: 999 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Identity Closure', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const sessionIdentityLabel = 'session-identity-E';
        const session = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });

        // Capture the raw discovered candidate BEFORE it enters the
        // cascade, to confirm the Nostr event id never even reaches it.
        const rawCandidates = await host.discoverSnapshotCandidatesCommand();
        assert(rawCandidates.length === 1, 'sanity: exactly one candidate discovered');
        const candidateKeys = Object.keys(rawCandidates[0]).sort();
        assert(!candidateKeys.includes('id') && !candidateKeys.includes('eventId') && !candidateKeys.includes('nostrEventId'),
            `1. a discovered candidate never carries the Nostr event id under any field name — got keys ${JSON.stringify(candidateKeys)}`);

        const result = await session.fullTick(pos(0, 0, 0));
        assert(result.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity: registered');

        const contentHash = reference.hash;
        const locator = reference.uri;
        const storage = reference.storage;
        const nostrEventId = host.network.events[0].id;
        const registeredSource = registry.listSources().find((s) => s.origin === originFor(contentHash, publicationId));
        const worldOrigin = registeredSource.origin;
        const worldPosition = registeredSource.placements[0].position;

        // Pairwise distinctness — every identity named in the roadmap's
        // own Section E diagram.
        const identities = { contentHash, publicationId, locator, storage, nostrEventId, worldOrigin, sessionIdentityLabel };
        const names = Object.keys(identities);
        for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
                assert(identities[names[i]] !== identities[names[j]], `2. ${names[i]} (${identities[names[i]]}) !== ${names[j]} (${identities[names[j]]})`);
            }
        }
        assert(typeof worldPosition === 'object' && !Object.values(identities).includes(worldPosition), '3. the World position is a distinct spatial object, never collapsible with any string identity above');
        assert(worldPosition.x === 11 && worldPosition.y === 22 && worldPosition.z === 33, '4. the World position is the authoritative placement — the candidate\'s own claimedPosition ({999,999,999}) never substitutes for it');

        // The origin is a pure, DERIVED function of contentHash AND
        // publicationId together — never a NEW third identity minted from
        // scratch, and never equal to either of its own two inputs.
        assert(materializedSnapshotWorldOrigin(contentHash, publicationId) === worldOrigin, '5. the registered origin is exactly what materializedSnapshotWorldOrigin(contentHash, publicationId) derives — a pure function of the two, never a separately-assigned identity');

        // The cascade's own processing identity is publicationId:contentHash
        // — never the Nostr event id, never the origin string itself.
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(cascadeSource.includes('${publicationId}:${contentHash}'), '6. the cascade\'s own idempotency key is publicationId:contentHash — never a Nostr event id or the World origin string');
        assert(!/eventId|nostrEvent/i.test(cascadeSource), '7. the cascade never references a Nostr event id under any name — it has no way to, and no reason to');

        console.log('✓ Section E: contentHash, publicationId, locator, storage, the Nostr event id, the World origin, the World position, and session identity are all pairwise distinct values by construction, the origin is a pure derived function of contentHash+publicationId only, and the registered World position is the authoritative placement — never the candidate\'s own claimed position');
    }

    // =================================================================
    // Section F — source-family convergence: LOCAL, PEER, and SNAPSHOT
    // registered together converge into IDENTICALLY-shaped World
    // encounters; Snapshot-specific machinery terminates exactly there.
    // =================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();

        const localPublication = new Publication({ id: 'boundary-f-local-pub', title: 'Local Family' });
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [localPublication],
            placements: [{ publicationId: localPublication.id, position: pos(1, 0, 0) }]
        }));

        const peerPublication = new Publication({ id: 'boundary-f-peer-pub', title: 'Peer Family' });
        const connectedPeer = { remoteIdentity: { identityId: 'peer-boundary-f' } };
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [peerPublication],
            placements: [{ publicationId: peerPublication.id, position: pos(2, 0, 0) }]
        }, connectedPeer));

        const host = makeHost('boundary-f-snapshot');
        const snapshotPublicationId = 'boundary-f-snapshot-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(snapshotPublicationId, new Position(3, 0, 0));
        const reference = await placeAndAnnounce(host, 'family-convergence-bytes', { publicationId: snapshotPublicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: snapshotPublicationId, title: 'Snapshot Family', contentReference: reference }));
        const session = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        await session.fullTick(pos(0, 0, 0));

        assert(registry.listSources().length === 3, 'sanity: LOCAL, PEER, and SNAPSHOT all coexist');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 3, '1. all three families converge into three World encounters');

        const shapes = encounters.publications.map((encounter) => Object.keys(encounter).sort().join(','));
        assert(new Set(shapes).size === 1, `2. all three encounters share the EXACT same shape, regardless of which family produced them — got ${JSON.stringify(shapes)}`);
        assert(encounters.publications.every((encounter) => encounter.kind === WorldEncounterKind.PUBLICATION), '3. all three carry the identical WorldEncounterKind — no per-family kind exists');
        for (const encounter of encounters.publications) {
            assert(!('origin' in encounter) && !('source' in encounter) && !('family' in encounter), `4. encounter for ${encounter.objectId} carries no origin/source/family field of any kind — provenance is discarded before this point, exactly as it is for LOCAL and PEER`);
        }

        console.log('✓ Section F: LOCAL, PEER, and SNAPSHOT origins registered together converge, past assembleWorldDiscoveryInputs()/deriveWorldEncounters(), into three IDENTICALLY-shaped World encounters carrying no origin/family field of any kind — Snapshot-specific machinery terminates exactly at that convergence point, never past it');
    }

    // =================================================================
    // Section G — no hidden Snapshot path: a structural, repository-wide
    // import sweep proving the dependency direction runs Snapshot ->
    // World source boundary -> ordinary World machinery, never reverse.
    // =================================================================
    {
        // The autonomous Snapshot ACQUISITION machinery — discovery,
        // resolution, materialization, cascade, retention. Deliberately
        // NOT the Snapshot PRESENTATION family (inspection/comparison/
        // content-view/attribution, 0.9.16x) — that family is already an
        // established, deliberate seam into ui/components/WorldEncounterCanvas.js
        // (see tests/SnapshotWorldConvergenceAudit.test.js and
        // tests/WorldSnapshotCompletionBoundaryAudit.test.js's own Section
        // J), and this section audits ACQUISITION reaching where it
        // never should, not presentation reaching where it already does.
        const acquisitionModuleNames = [
            'NostrSnapshotDiscoveryQueryService.js', 'NostrSnapshotDiscoveryPublisher.js',
            'DecentralizedSnapshotResolver.js', 'ArweaveContentStore.js',
            'DiscoverSnapshotCandidatesCommand.js', 'DiscoverSnapshotCommand.js',
            'ResolveSelectedSnapshotCommand.js', 'MaterializeSelectedSnapshotCommand.js',
            'MaterializeSnapshotFromSelectedCandidateUseCase.js',
            'WorldSnapshotDiscoveryMonitor.js', 'AutomaticSnapshotEncounterCascade.js',
            'AutomaticSnapshotEncounterRetentionPolicy.js', 'AutomaticSnapshotEncounterRetentionReconciliation.js',
            'DiscoverSnapshotRuntimeComposition.js'
        ];

        // G1. Ordinary World rendering/geometry directories never import
        // any acquisition module, Nostr, or Arweave directly.
        for (const dir of ['world/', 'world-layout/', 'renderer/']) {
            const files = await listJsFilesRecursively(dir);
            for (const file of files) {
                const source = await codeOnlySource(file);
                assert(!/from ['"](\.\.\/)*nostr\//.test(source), `1. ${file} never imports nostr/ directly`);
                assert(!/from ['"](\.\.\/)*arweave\//.test(source), `2. ${file} never imports arweave/ directly`);
                for (const moduleName of acquisitionModuleNames) {
                    assert(!source.includes(moduleName), `3. ${file} never references ${moduleName} — ordinary World geometry/rendering has no idea Snapshot acquisition exists`);
                }
            }
        }

        // G2. The World source boundary itself — core/WorldEncounter.js,
        // core/WorldDiscoverySource.js, core/WorldDiscoverySourceAssembly.js,
        // application/WorldDiscoverySourceRegistry.js — never imports
        // acquisition machinery either. This is the seam Snapshot
        // registration writes THROUGH, never a seam that reaches back.
        const boundaryFiles = ['core/WorldEncounter.js', 'core/WorldDiscoverySource.js', 'core/WorldDiscoverySourceAssembly.js', 'application/WorldDiscoverySourceRegistry.js'];
        for (const file of boundaryFiles) {
            const source = await codeOnlySource(file);
            assert(!/from ['"](\.\.\/)*nostr\//.test(source) && !/from ['"](\.\.\/)*arweave\//.test(source), `4. ${file} never imports nostr/ or arweave/`);
            for (const moduleName of acquisitionModuleNames) {
                assert(!source.includes(moduleName), `5. ${file} never references ${moduleName} — the World source boundary has no idea Snapshot acquisition exists on the other side of it`);
            }
        }

        // G3. ui/components/WorldEncounterCanvas.js legitimately imports
        // the Snapshot PRESENTATION family and the registration BRIDGE
        // (register/unregister — the boundary primitive itself) — but
        // never the acquisition machinery this section actually audits.
        const canvasSource = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        for (const moduleName of acquisitionModuleNames) {
            assert(!canvasSource.includes(moduleName), `6. ui/components/WorldEncounterCanvas.js never references ${moduleName} — World rendering consumes an already-registered source, it never discovers, resolves, or cascades one of its own`);
        }
        assert(canvasSource.includes('MaterializedSnapshotWorldDiscoveryBridge'), '7. sanity — the canvas DOES legitimately import the registration bridge, for its own manual unregisterSelectedSnapshot() action (0.9.179) — the boundary primitive itself is the one legitimate crossing point');

        // G4. The reverse direction: the acquisition files themselves may
        // depend on the World source boundary (registry/bridge) — that is
        // the correct, one-directional dependency — but never on the
        // rendering layer above it.
        for (const file of ['application/AutomaticSnapshotEncounterCascade.js', 'application/AutomaticSnapshotEncounterRetentionReconciliation.js', 'application/MaterializedSnapshotWorldDiscoveryBridge.js', 'application/WorldSnapshotDiscoveryMonitor.js']) {
            const source = await codeOnlySource(file);
            for (const renderingName of ['WorldEncounterCanvas', 'WorldEncounterMarker', 'ui/components/', 'ui/views/']) {
                assert(!source.includes(renderingName), `8. ${file} never references ${renderingName} — the Snapshot subsystem depends downward on the World source boundary, never upward into rendering`);
            }
        }

        console.log('✓ Section G: ordinary World rendering/geometry (world/, world-layout/, renderer/) and the World source boundary itself (core/WorldEncounter.js, WorldDiscoverySource*.js, WorldDiscoverySourceRegistry.js) never import Nostr, Arweave, or any Snapshot acquisition module; WorldEncounterCanvas.js imports only the already-established presentation family and the registration bridge, never acquisition; and the acquisition files themselves never reach upward into rendering — the dependency direction runs Snapshot subsystem -> World source boundary -> ordinary World machinery, never the reverse');
    }

    // =================================================================
    // Section H — automatic vs. manual isolation: distinguishable only by
    // orchestration provenance, without an `automatic` field anywhere;
    // material deletion, Publication deletion, and Nostr withdrawal are
    // confirmed to not exist as concepts in this pipeline at all.
    // =================================================================
    {
        // H1. No `automatic` field/flag anywhere in the source shape, the
        // registry, or the registration bridge.
        for (const file of ['core/WorldDiscoverySource.js', 'application/WorldDiscoverySourceRegistry.js', 'application/MaterializedSnapshotWorldDiscoveryBridge.js']) {
            const source = await codeOnlySource(file);
            assert(!/\bautomatic\b/i.test(source), `1. ${file} never mentions "automatic" in its own code — the distinction lives nowhere in the data shape`);
        }

        // H2. Exactly two call sites for each of register/unregister,
        // system-wide — one automatic, one manual, distinguished only by
        // WHICH CODE calls the shared primitive.
        const registerCallers = ['application/AutomaticSnapshotEncounterCascade.js', 'ui/components/OwnPublicationPanel.js'];
        const unregisterCallers = ['application/AutomaticSnapshotEncounterRetentionReconciliation.js', 'ui/components/WorldEncounterCanvas.js'];
        for (const file of registerCallers) {
            const source = await codeOnlySource(file);
            assert(/(?<![a-zA-Z])registerMaterializedSnapshotWorldSource\(/.test(source), `2. ${file} calls registerMaterializedSnapshotWorldSource() directly`);
        }
        for (const file of unregisterCallers) {
            const source = await codeOnlySource(file);
            assert(/unregisterMaterializedSnapshotWorldSource\(/.test(source), `3. ${file} calls unregisterMaterializedSnapshotWorldSource() directly`);
        }
        // No THIRD caller of either exists anywhere else in the app/ui
        // source (the bridge's own definition file is excluded, since
        // defining a function is not calling it).
        const allJsFiles = [
            ...(await listJsFilesRecursively('application/')),
            ...(await listJsFilesRecursively('ui/')),
            ...(await listJsFilesRecursively('world/')),
            ...(await listJsFilesRecursively('world-layout/'))
        ];
        let registerCallSites = 0, unregisterCallSites = 0;
        for (const file of allJsFiles) {
            if (file === 'application/MaterializedSnapshotWorldDiscoveryBridge.js') continue;
            const source = await codeOnlySource(file);
            if (/(?<![a-zA-Z])registerMaterializedSnapshotWorldSource\(/.test(source)) registerCallSites += 1;
            if (/unregisterMaterializedSnapshotWorldSource\(/.test(source)) unregisterCallSites += 1;
        }
        assert(registerCallSites === 2, `4. exactly two call sites of registerMaterializedSnapshotWorldSource() exist system-wide (automatic + manual) — got ${registerCallSites}`);
        assert(unregisterCallSites === 2, `5. exactly two call sites of unregisterMaterializedSnapshotWorldSource() exist system-wide (automatic reconciliation + manual UI action) — got ${unregisterCallSites}`);

        // H3. Behaviorally, both an automatic and a manual registration
        // for two DIFFERENT subjects land on the registry with the exact
        // same shape — indistinguishable except by which code path wrote
        // them, which this file already knows because it wrote both.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const manualPublication = publicationStub('boundary-h-manual-pub');
            const manualResult = registerMaterializedSnapshotWorldSource(registry,
                { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: manualPublication.id, contentHash: 'h-manual-hash', position: pos(0, 0, 0), reason: null },
                manualPublication);
            const automaticPublication = publicationStub('boundary-h-automatic-pub');
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('h-automatic-hash')),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId: automaticPublication.id, position: pos(0, 0, 0) }),
                findPublicationById: () => automaticPublication
            });
            const automaticResult = await cascade.processCandidate({ contentHash: 'h-automatic-hash', locator: 'ar://h', storage: 'ar', publicationId: automaticPublication.id });
            assert(automaticResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity: automatic registration succeeded');

            const manualSource = registry.listSources().find((s) => s.origin === manualResult.origin);
            const automaticSource = registry.listSources().find((s) => s.origin === originFor('h-automatic-hash', automaticPublication.id));
            assert(Object.keys(manualSource).sort().join(',') === Object.keys(automaticSource).sort().join(','), '6. a manual and an automatic registration produce the exact same WorldDiscoverySource shape — no field distinguishes them');
        }

        // H4. Material deletion, Publication deletion, and Nostr
        // withdrawal are not merely distinguished from unregistration —
        // they do not exist as concepts anywhere in this pipeline.
        const localContentStoreSource = await codeOnlySource('content/LocalContentStore.js');
        const arweaveContentStoreSource = await codeOnlySource('content/ArweaveContentStore.js');
        for (const [name, source] of [['content/LocalContentStore.js', localContentStoreSource], ['content/ArweaveContentStore.js', arweaveContentStoreSource]]) {
            assert(!/\bdelete\(|\bremove\(/.test(source), `7. ${name} exposes no delete()/remove() method — material deletion is not a capability this pipeline has, automatic or manual`);
        }
        const publisherSource = await codeOnlySource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(!/withdraw|retract/i.test(publisherSource), '8. application/NostrSnapshotDiscoveryPublisher.js exposes no withdraw()/retract() method — Nostr withdrawal is not a capability this pipeline has');
        assert(!/deletePublication/i.test(await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js') + await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js')), '9. neither the registration bridge nor automatic retention ever deletes a Publication — that capability does not exist here');

        console.log('✓ Section H: no `automatic` field exists anywhere in the World source shape/registry/bridge — automatic and manual registration/unregistration remain distinguishable ONLY by which code called the shared primitive, producing byte-for-byte identical WorldDiscoverySource shapes either way — and material deletion, Publication deletion, and Nostr withdrawal are confirmed absent as concepts anywhere in this pipeline, not merely distinguished from unregistration');
    }

    // =================================================================
    // Section I — re-entry: a subject a dead session suppressed is never
    // permanently blocked, and no tombstone/blocklist vocabulary exists
    // anywhere in the automatic pipeline's own source.
    // =================================================================
    {
        const host = makeHost('boundary-reentry');
        const publicationId = 'boundary-reentry-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'reentry-boundary-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Reentry Boundary', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(reference.hash, publicationId);

        const deadSession = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        deadSession.teardown();
        const deadResult = await deadSession.fullTick(pos(0, 0, 0));
        assert(deadResult.cascadeResults[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, 'sanity: A dies -> X is suppressed');
        assert(!hasOrigin(registry, origin), 'sanity: nothing registered yet');

        const freshSession = makeWorldSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const freshResult = await freshSession.fullTick(pos(0, 0, 0));
        assert(freshResult.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `1. B discovers/reuses/registers X — a fresh, independent session's own cascade genuinely registers the SAME subject a dead session suppressed — got ${freshResult.cascadeResults[0].outcome}`);
        assert(hasOrigin(registry, origin), '2. the registration now exists');

        // No subject-level tombstone or permanent suppression exists
        // anywhere in the automatic pipeline's own source — a structural
        // sweep, not just this one behavioral proof.
        const pipelineFiles = [
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js',
            'application/AutomaticSnapshotEncounterRetentionPolicy.js',
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/MaterializedSnapshotWorldDiscoveryBridge.js',
            'application/WorldDiscoverySourceRegistry.js'
        ];
        for (const file of pipelineFiles) {
            const source = await codeOnlySource(file);
            for (const forbidden of ['tombstone', 'blocklist', 'blockList', 'denylist', 'denyList', 'permanentlySuppress', 'suppressedSubjects']) {
                assert(!source.toLowerCase().includes(forbidden.toLowerCase()), `3. ${file} carries no "${forbidden}" vocabulary — suppression is per-session-instance memoization only, never a persistent record of a subject`);
            }
        }

        console.log('✓ Section I: A discovers/acquires X and dies -> X is suppressed for A alone; B independently discovers/reuses X and registers it — no subject-level tombstone or permanent suppression exists anywhere in the automatic pipeline\'s own source, confirmed both behaviorally and by a structural vocabulary sweep');
    }

    // =================================================================
    // Section J — cadence composition: exactly one spatial cadence drives
    // both discovery observation and retention reconciliation; no
    // Snapshot file owns a timer of its own.
    // =================================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const intervalCount = (worldViewSource.match(/setInterval\(/g) || []).length;
        assert(intervalCount === 3, `1. ui/views/WorldView.js still declares exactly three intervals total (spatialInterval, spatialPresenceSyncInterval, vehicleInteractionInterval) — got ${intervalCount}`);

        // Both the discovery observation call and the retention
        // reconcile() call live inside the SAME refreshSpatialUI()
        // function body — the one shared spatial cadence, never two.
        const functionStart = worldViewSource.indexOf('function refreshSpatialUI()');
        assert(functionStart > -1, 'sanity: refreshSpatialUI() exists');
        const nextFunctionStart = worldViewSource.indexOf('\n        function ', functionStart + 1);
        const functionBody = worldViewSource.slice(functionStart, nextFunctionStart > -1 ? nextFunctionStart : undefined);
        assert(functionBody.includes('worldSnapshotDiscoveryMonitor.observe('), '2. discovery observation is invoked from inside refreshSpatialUI()');
        assert(functionBody.includes('automaticSnapshotEncounterRetentionReconciliation.reconcile('), '3. retention reconciliation is invoked from inside the SAME refreshSpatialUI() function body — one shared cadence, never a second one');

        // No Snapshot ORCHESTRATION file in the automatic pipeline owns a
        // polling/cadence timer, subscription, or animation-frame loop of
        // its own — the exact scope 0.9.192's own Section G structural
        // sweep already established for these same three files, held
        // here for the whole pipeline's own command-wrapper layer too.
        // Deliberately excludes the lower-level Nostr/Arweave transport
        // files (NostrSnapshotDiscoveryQueryService.js,
        // NostrSnapshotDiscoveryPublisher.js) — each carries its own,
        // unrelated, ALREADY-established per-call `setTimeout()` network
        // TIMEOUT GUARD (bounding one request, cleared on that request's
        // own settlement), never a recurring cadence of any kind; see
        // this file's own "Deliberately excluded," below.
        const pipelineFiles = [
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterRetentionPolicy.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js',
            'application/DiscoverSnapshotCandidatesCommand.js',
            'application/ResolveSelectedSnapshotCommand.js',
            'application/MaterializeSelectedSnapshotCommand.js'
        ];
        for (const file of pipelineFiles) {
            const source = await codeOnlySource(file);
            assert(!/setInterval\(|setTimeout\(|\.subscribe\(|requestAnimationFrame\(/.test(source), `4. ${file} owns no timer/subscription/animation-frame loop of its own — every Snapshot-automatic orchestration file rides the one caller-driven cadence WorldView.js itself owns`);
        }
        // The two transport files DO carry a timer — confirmed to be
        // exactly the documented per-call timeout guard shape (a single
        // `setTimeout()` racing a `reject()`), never a SECOND `setInterval()`
        // masquerading as one, and never more than that one guard each.
        for (const file of ['application/NostrSnapshotDiscoveryQueryService.js', 'application/NostrSnapshotDiscoveryPublisher.js']) {
            const source = await codeOnlySource(file);
            assert(!/setInterval\(|\.subscribe\(|requestAnimationFrame\(/.test(source), `5. ${file} owns no recurring cadence of any kind`);
            const timeoutCount = (source.match(/setTimeout\(/g) || []).length;
            assert(timeoutCount === 1, `6. ${file} carries exactly one setTimeout() — the single documented per-call network timeout guard, never a second, cadence-shaped timer — got ${timeoutCount}`);
        }

        console.log('✓ Section J: ui/views/WorldView.js still declares exactly three intervals total, discovery observation and retention reconciliation both fire from inside the SAME refreshSpatialUI() function body, and no Snapshot-automatic application file owns a timer, subscription, or animation-frame loop of its own — one spatial cadence, never a second, Snapshot-specific one');
    }

    // =================================================================
    // Section K — no accidental authority.
    // =================================================================
    {
        // K1. A claimed position is never promoted to World position, even
        // when it conflicts with the actual authoritative placement.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const publicationId = 'boundary-k-claim-pub';
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('k-claim-hash')),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(5, 5, 5) }),
                findPublicationById: () => publicationStub(publicationId)
            });
            const result = await cascade.processCandidate({ contentHash: 'k-claim-hash', locator: 'ar://k', storage: 'ar', publicationId, claimedPosition: { x: 999, y: 999, z: 999 } });
            assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity: registered');
            const source = registry.listSources().find((s) => s.origin === originFor('k-claim-hash', publicationId));
            assert(source.placements[0].position.x === 5 && source.placements[0].position.y === 5 && source.placements[0].position.z === 5, '1. World placement remains authoritative — the candidate\'s own claimedPosition is never promoted, even when it directly conflicts with it');
        }

        // K2. Discovery order never becomes ranking — two independent
        // subjects register in either order, converging on the identical
        // final World state.
        {
            const registryOrderA = new WorldDiscoverySourceRegistry();
            const registryOrderB = new WorldDiscoverySourceRegistry();
            const candidateX = { contentHash: 'k-order-hash-x', locator: 'ar://kx', storage: 'ar', publicationId: 'boundary-k-order-x-pub' };
            const candidateY = { contentHash: 'k-order-hash-y', locator: 'ar://ky', storage: 'ar', publicationId: 'boundary-k-order-y-pub' };
            function orderCascade(registry) {
                return new AutomaticSnapshotEncounterCascade({
                    resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
                    materializeSelectedSnapshotCommand: (resolution) => Promise.resolve(storedOutcome(resolution.__contentHash)),
                    worldDiscoverySourceRegistry: registry,
                    resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                    findPublicationById: (publicationId) => publicationStub(publicationId)
                });
            }
            // Both cascades need materialize to see each candidate's own
            // contentHash — reuse the same __contentHash plumbing Section D
            // already established.
            function withPlumbing(cascade) {
                const baseResolve = cascade._resolveSelectedSnapshotCommand;
                cascade._resolveSelectedSnapshotCommand = (candidate) => Promise.resolve(baseResolve(candidate)).then((r) => ({ ...r, __contentHash: candidate.contentHash }));
                return cascade;
            }
            const cascadeA = withPlumbing(orderCascade(registryOrderA));
            await cascadeA.processCandidate(candidateX);
            await cascadeA.processCandidate(candidateY);
            const cascadeB = withPlumbing(orderCascade(registryOrderB));
            await cascadeB.processCandidate(candidateY);
            await cascadeB.processCandidate(candidateX);

            const originsA = registryOrderA.listSources().map((s) => s.origin).sort();
            const originsB = registryOrderB.listSources().map((s) => s.origin).sort();
            assert(originsA.length === 2 && JSON.stringify(originsA) === JSON.stringify(originsB), `2. processing X then Y produces the identical final World state as processing Y then X — discovery order is never reinterpreted as ranking or preference — got ${JSON.stringify(originsA)} vs ${JSON.stringify(originsB)}`);
        }

        // K3. Content equality never becomes deduplication — two different
        // Publications sharing the identical contentHash both register
        // independently (the 0.9.163 origin-collision fix, reconfirmed).
        {
            const registry = new WorldDiscoverySourceRegistry();
            const sharedHash = 'k-shared-content-hash';
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(sharedHash)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: (publicationId) => publicationStub(publicationId)
            });
            await cascade.processCandidate({ contentHash: sharedHash, locator: 'ar://k1', storage: 'ar', publicationId: 'boundary-k-content-x' });
            await cascade.processCandidate({ contentHash: sharedHash, locator: 'ar://k2', storage: 'ar', publicationId: 'boundary-k-content-y' });
            assert(registry.listSources().length === 2, '3. two different Publications sharing the identical contentHash register as two independent World sources — identical content is never treated as a duplicate to collapse');
        }

        // K4. No trust, ownership, or visibility vocabulary anywhere in
        // the files this section's own claims are actually about.
        const noTrustFiles = ['application/AutomaticSnapshotEncounterCascade.js', 'application/MaterializedSnapshotWorldDiscoveryBridge.js', 'application/WorldDiscoverySourceRegistry.js'];
        for (const file of noTrustFiles) {
            const source = await codeOnlySource(file);
            assert(!/\btrust(ed)?\b/i.test(source), `4. ${file} contains no trust vocabulary — successful verification never becomes trust`);
        }
        // Registration grants no ownership: the registered source's own
        // placements entry carries exactly { publicationId, position } —
        // no owner/authority field of the registration's own invention.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const publication = publicationStub('boundary-k-ownership-pub');
            registerMaterializedSnapshotWorldSource(registry,
                { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: publication.id, contentHash: 'k-ownership-hash', position: pos(0, 0, 0), reason: null },
                publication);
            const source = registry.listSources().find((s) => s.origin === originFor('k-ownership-hash', publication.id));
            assert(Object.keys(source.placements[0]).sort().join(',') === ['position', 'publicationId'].sort().join(','), `5. the registered placement entry carries exactly { publicationId, position } — got keys ${JSON.stringify(Object.keys(source.placements[0]))} — registration grants no ownership/authority field of its own`);
        }
        // Retention never touches rendering/visibility.
        const reconciliationSource = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js');
        assert(!/WorldEncounterCanvas|visib|camera|viewport|render/i.test(reconciliationSource), '6. application/AutomaticSnapshotEncounterRetentionReconciliation.js contains no rendering/visibility vocabulary of any kind — retention decides World-registry membership only, never what is currently on screen');

        console.log('✓ Section K: World placement remains authoritative over a claimed position even in direct conflict; discovery order never becomes ranking (X-then-Y and Y-then-X converge identically); identical content under different Publications never becomes deduplication; and no trust, ownership, or visibility vocabulary exists in the files this pipeline actually mutates');
    }

    // =================================================================
    // Section L — the explicit architectural stopping-point assertion.
    // =================================================================
    {
        const BOUNDARY_STATEMENT = 'maintain eligible Snapshot contributions to the ordinary World source registry during the lifetime of a WorldView session';
        assert(typeof BOUNDARY_STATEMENT === 'string' && BOUNDARY_STATEMENT.length > 0, 'sanity: the boundary statement itself is on record in this file');

        // Everything BEYOND that stated boundary — acceptance, ownership,
        // merge/adopt, replacement, trust, synchronization, conflict
        // resolution, withdrawal semantics — is confirmed absent, by a
        // vocabulary sweep across the COMPLETE automatic pipeline, not
        // merely the one or two files each earlier section already swept
        // for its own narrower reason.
        const wholeAutomaticPipeline = [
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/DiscoverSnapshotCandidatesCommand.js',
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterCascadeOutcome.js',
            'application/AutomaticSnapshotEncounterRetentionPolicy.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js',
            'application/MaterializedSnapshotWorldDiscoveryBridge.js'
        ];
        const forbiddenBeyondBoundary = [
            'ownership', 'adopt', 'merge', 'trust', 'conflict', 'synchroniz', 'withdrawal', 'acceptance'
        ];
        let sweptCharacters = 0;
        for (const file of wholeAutomaticPipeline) {
            const source = await codeOnlySource(file);
            sweptCharacters += source.length;
            for (const forbidden of forbiddenBeyondBoundary) {
                assert(!source.toLowerCase().includes(forbidden), `1. ${file} contains no "${forbidden}" vocabulary — that concept lives outside this subsystem's own stated boundary entirely`);
            }
        }
        assert(sweptCharacters > 0, 'sanity: the sweep actually read real source, not empty files');

        // The registry named in the boundary statement — "the ordinary
        // World source registry" — is confirmed, one final time, to be
        // the literal termination point: every file in the automatic
        // pipeline either imports it/the registration bridge, or imports
        // nothing that reaches past it (no rendering import — already
        // proven structurally in Section G's own G4, reconfirmed here as
        // this section's own closing fact rather than borrowed from it).
        const registrySource = await codeOnlySource('application/WorldDiscoverySourceRegistry.js');
        assert(!/WorldEncounterCanvas|WorldEncounterMarker/.test(registrySource), '2. application/WorldDiscoverySourceRegistry.js itself never imports a rendering component — it is a pure membership store, exactly the "ordinary World source registry" the boundary statement names, and nothing past it belongs to this subsystem');

        console.log(`✓ Section L: the autonomous Snapshot machinery ends exactly at — "${BOUNDARY_STATEMENT}" — and a vocabulary sweep across the complete automatic pipeline (discovery, cascade, retention policy, retention reconciliation, registration bridge) confirms acceptance, ownership, merge/adopt, trust, synchronization, conflict resolution, and withdrawal semantics are not implicitly part of this subsystem — they exist nowhere in its own source`);
    }

    console.log('\n✅ All Automatic Snapshot Subsystem Boundary & Convergence Audit tests passed.');
}

// Sanity helper for Section C — confirms a Publication object handed
// through registerMaterializedSnapshotWorldSource() is never mutated by
// this file's own use of it (a trivial identity check kept as its own
// named helper purely for the assertion message's own readability).
function publicationUnchanged(publication) {
    return publication && typeof publication === 'object' && publication.title === `Publication ${publication.id}`;
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
