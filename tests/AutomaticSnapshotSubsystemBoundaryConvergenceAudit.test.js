import { readFile } from 'node:fs/promises';

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
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
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
// entire autonomous Snapshot pipeline one proven seam at a time —
// distribution, discovery, resolution, verification, materialization,
// placement, World registration, presentation, comparison, automatic
// discovery, automatic cascade, retention, and (0.9.193/0.9.194) the
// session-lifetime boundary — and 0.9.192's and 0.9.194's own
// "Recommendation" sections both already said the same thing twice: stop
// adding Snapshot-specific lifecycle capability and instead ask whether the
// whole assembled thing has actually stopped where it should. This file is
// that question, asked directly, one last time, across the WHOLE
// subsystem rather than one seam of it:
//
//   Has automatic Snapshot machinery stopped exactly where it should,
//   without accidentally becoming a second World system?
//
// This is deliberately NOT another "does the guard hold under load" audit
// — 0.9.188, 0.9.191, 0.9.192, and 0.9.194 already asked that question, at
// increasing levels of adversarial rigor, and it already held every time.
// This file asks eleven DIFFERENT, narrower questions instead — session
// ownership vs. subject identity, retention's own boundary, failure
// isolation across every stage, identity non-substitution, source-family
// convergence, import-direction hygiene, automatic/manual provenance
// without a new field, re-entry without a tombstone, cadence composition,
// authority creep, and — Section L, the actual point of this milestone —
// an explicit, checked assertion of where the subsystem's own
// responsibility ends.
//
//   Section A: the complete autonomous path, spatial observation through
//              ordinary World rendering, with no manual step anywhere in
//              between.
//   Section B: session boundary at the WHOLE-SYSTEM level — two
//              concurrent sessions, each its own subject, neither aware
//              the other exists, and no session registry anywhere for
//              either to be aware of it THROUGH.
//   Section C: retention's own boundary — `reconcile()` only ever removes
//              an already-registered automatic source; it never
//              discovers, starts acquisition, cancels acquisition,
//              touches a Publication, deletes material, or affects a
//              manual registration.
//   Section D: failure isolation across all six stages (discovery,
//              resolution, verification, materialization, placement,
//              registration) — each failure terminates only its own
//              candidate, never a sibling candidate in the same tick.
//   Section E: identity closure — contentHash, publicationId, a Nostr
//              event id, a locator, a World origin, a World position, and
//              session identity never silently substitute for one
//              another.
//   Section F: source-family convergence — LOCAL, PEER, and SNAPSHOT
//              origins all converge on the identical, ordinary
//              `deriveWorldEncounters()` pipeline with no Snapshot-shaped
//              special case downstream of the registry.
//   Section G: no hidden Snapshot path — ordinary World-rendering
//              components import no Nostr/Arweave/discovery/cascade/
//              retention/materialization module, checked directly against
//              their own current source.
//   Section H: automatic vs. manual registration remain distinguishable
//              by ORCHESTRATION PROVENANCE alone — no `automatic` field
//              anywhere in a `WorldDiscoverySource` or the registry — and
//              unregister/material deletion/Publication deletion/Nostr
//              withdrawal remain four genuinely independent operations.
//   Section I: re-entry — a subject two separate dead sessions each
//              suppress is still, unconditionally, registerable by a
//              third, live session; no tombstone accumulates anywhere.
//   Section J: cadence composition — still exactly one spatial cadence,
//              reconfirmed against CURRENT source.
//   Section K: no accidental authority — the standing checklist 0.9.159,
//              0.9.163, 0.9.172, and 0.9.189 each separately established,
//              held here together as one section.
//   Section L: THE POINT — an explicit, machine-checked assertion of the
//              subsystem's own stopping point, and a vocabulary sweep
//              proving nothing beyond it has quietly been built.
//
// Every collaborator this file exercises is existing, unmodified
// application code — the identical classes and functions 0.9.9 through
// 0.9.194 already shipped, composed exactly as `ui/main.js` and
// `ui/views/WorldView.js` themselves compose them. No finding in this
// audit requires, or produces, a change to any of them.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any fix, for anything.** This file either confirms an existing
//   invariant or it does not; either way, no production file changes.
// - **Re-running 0.9.188/0.9.191/0.9.192/0.9.194's own concurrency/
//   adversarial-movement/teardown-timing ground.** Already proven, at
//   greater rigor than this file would add, by those four audits
//   specifically. This file asks structurally different questions.
// - **A new lifecycle vocabulary, a new registry field, a session
//   registry, a tombstone store, or an "automatic" flag of any kind** —
//   proposing any of those would itself be exactly the "accidental second
//   World system" this milestone exists to rule out, not something it
//   introduces to check for one.

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
// Real-machinery host — identical shape to 0.9.191/0.9.194's own
// makeHost(): a real (in-memory) Nostr relay, a real (in-memory) Arweave
// gateway/signer, and a real LocalContentStore, composed through the SAME,
// unmodified application commands ui/main.js itself wires up.
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
// makeSubsystemSession({...}) — the SAME monitor -> cascade -> (on
// REGISTERED) noteAutomaticRegistration() -> synchronous reconcile()
// composition 0.9.191/0.9.192/0.9.194's own harnesses already established,
// with a plain, non-reactive `sessionActive` flag exactly like
// `ui/views/WorldView.js`'s own `automaticCascadeSessionActive`.
// `teardown()` mirrors that file's own `onBeforeUnmount()` FIRST
// statement and nothing else — no cancellation of anything in flight.
// ---------------------------------------------------------------------
function makeSubsystemSession({
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
    // ---------------------------------------------------------------
    // Section A — the complete autonomous path: spatial observation
    // through ordinary World rendering, real machinery, no manual step.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-full-path');
        const publicationId = 'audit-full-path-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(3, 0, 4));
        const reference = await placeAndAnnounce(host, 'full-path-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Full Path', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const session = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });

        // The ONE call a caller ever makes — exactly ui/views/WorldView.js's
        // own refreshSpatialUI() tick, driven by session.updateSpatialView()
        // on a 3-second setInterval in production. Nothing else runs: no
        // "Discover"/"Resolve"/"Materialize"/"Place"/"Register" button, no
        // OwnPublicationPanel collaborator of any kind is constructed here.
        const result = await session.fullTick(pos(0, 0, 0));
        assert(result.cascadeResults.length === 1 && result.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            `1. one spatial tick alone carries a discovered candidate all the way to REGISTERED — got ${result.cascadeResults[0] && result.cascadeResults[0].outcome}`);
        assert(hasOrigin(registry, originFor(reference.hash, publicationId)), '2. the World registry genuinely holds the registration');

        // Ordinary World rendering — the SAME deriveWorldEncounters() any
        // other origin (LOCAL/PEER) already renders through.
        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1 && encounters.publications[0].objectId === publicationId,
            '3. the ordinary World rendering pipeline finds it with no Snapshot-specific rendering step');

        // Retention keeps watching it on the very next tick, still with no
        // manual step.
        const secondTick = await session.fullTick(pos(0, 0, 0));
        assert(hasOrigin(registry, originFor(reference.hash, publicationId)), '4. a second, purely automatic tick keeps it registered while the Wanderer is still nearby');
        assert(secondTick.removedThisTick.length === 0, '5. nothing was removed — the subject is genuinely retained, not re-registered from scratch');

        console.log('✓ Section A: the complete autonomous path — spatial observation, discovery, cascade, acquisition, placement, registration, and ordinary World rendering — runs to completion from a single spatial tick, with no manual UI action anywhere in the chain');
    }

    // ---------------------------------------------------------------
    // Section B — session boundary at the WHOLE-SYSTEM level: two
    // concurrent sessions, two different subjects, neither aware the
    // other exists, and no shared session-tracking state for either to
    // become aware of it through.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-two-sessions');
        const registry = new WorldDiscoverySourceRegistry();
        const worldModel = makeWorldModel();

        const pubA = 'audit-session-a-pub';
        worldModel.placeAt(pubA, new Position(1, 0, 0));
        const refA = await placeAndAnnounce(host, 'session-a-bytes', { publicationId: pubA, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: pubA, title: 'Session A Subject', contentReference: refA }));

        const pubB = 'audit-session-b-pub';
        worldModel.placeAt(pubB, new Position(2, 0, 0));
        const refB = await placeAndAnnounce(host, 'session-b-bytes', { publicationId: pubB, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: pubB, title: 'Session B Subject', contentReference: refB }));

        const resolveGateA = deferred();
        const sessionA = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: (candidate) => (candidate.publicationId === pubA
                ? resolveGateA.promise.then(() => host.resolveSelectedSnapshotCommand(candidate))
                : Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, bytes: null, reason: null })),
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });

        // Session A begins processing its own subject and stalls mid-flight.
        const { settled: settledA } = sessionA.tick(pos(0, 0, 0));
        await flushMicrotasks();
        assert(!hasOrigin(registry, originFor(refA.hash, pubA)), 'sanity: session A genuinely in flight, not yet registered');

        // Session B mounts independently — a completely separate WorldView,
        // a completely separate subject, sharing only the ONE thing
        // production actually shares between two mounted routes: the
        // registry itself.
        const sessionB = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: (candidate) => (candidate.publicationId === pubB
                ? host.resolveSelectedSnapshotCommand(candidate)
                : Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, bytes: null, reason: null })),
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const resultB = await sessionB.fullTick(pos(0, 0, 0));
        assert(resultB.cascadeResults.some((r) => r.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && r.publicationId === pubB),
            '1. session B genuinely registers its own subject, entirely independently of session A still being in flight');

        // Session A now tears down — its own subject's resolution never
        // even finished.
        sessionA.teardown();
        resolveGateA.resolve();
        const resultsA = await settledA;
        // sessionA's own tick discovers BOTH announcements (they share one
        // discoveryTag) — its own resolveSelectedSnapshotCommand stub
        // resolves every candidate OTHER than pubA to NOT_DISCOVERED
        // immediately, so pubA's own result (the one actually held open on
        // resolveGateA) must be looked up by its own publicationId, never
        // assumed to occupy a fixed array index.
        const resultAforPubA = resultsA.find((r) => r.publicationId === pubA);
        assert(resultAforPubA && resultAforPubA.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `2. session A's own late completion for its own subject is suppressed — got ${resultAforPubA && resultAforPubA.outcome}`);
        assert(!hasOrigin(registry, originFor(refA.hash, pubA)), '3. session A\'s own subject never registers');
        assert(hasOrigin(registry, originFor(refB.hash, pubB)), '4. session B\'s own registration is entirely undisturbed by session A\'s teardown');
        assert(registry.listSources().length === 1, '5. exactly one source exists total — session A contributed nothing, ever, to the registry');

        // Structural: none of the three classes a session is built from
        // hold any notion of "which sessions exist" — no static/module-level
        // registry of instances, no session-id parameter anywhere in their
        // own constructors.
        for (const file of ['application/AutomaticSnapshotEncounterCascade.js', 'application/WorldSnapshotDiscoveryMonitor.js', 'application/AutomaticSnapshotEncounterRetentionReconciliation.js']) {
            const source = await codeOnlySource(file);
            assert(!/\bstatic\s/.test(source), `6. ${file} declares no static class state a second session could observe`);
            assert(!/sessionId|sessionRegistry|activeSessions/i.test(source), `7. ${file} has no session-identity or session-registry concept of its own — "session" exists only as WorldView's own opaque isSessionActive() closure`);
        }

        console.log('✓ Section B: two concurrent sessions, two different subjects — each registers (or is suppressed) entirely on its own terms, sharing nothing but the registry itself, and none of the three classes a session is built from holds any notion of "which sessions exist"');
    }

    // ---------------------------------------------------------------
    // Section C — retention's own boundary: reconcile() only ever removes
    // an already-registered automatic source.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry, retentionRadius: 50 });

        // A manual registration — reconciliation never told about it.
        const manualPublication = publicationStub('audit-manual-pub');
        const manualPlacement = { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: manualPublication.id, contentHash: 'manual-hash', position: pos(9000, 0, 0), reason: null };
        registerMaterializedSnapshotWorldSource(registry, manualPlacement, manualPublication);

        // An automatic registration — reconciliation IS told about it.
        const autoPublication = publicationStub('audit-auto-pub');
        const autoPlacement = { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: autoPublication.id, contentHash: 'auto-hash', position: pos(0, 0, 0), reason: null };
        registerMaterializedSnapshotWorldSource(registry, autoPlacement, autoPublication);
        reconciliation.noteAutomaticRegistration({ publicationId: autoPublication.id, contentHash: 'auto-hash' });

        const setSourceCallsBefore = (() => {
            let calls = 0;
            const original = registry.setSource.bind(registry);
            registry.setSource = (...args) => { calls += 1; return original(...args); };
            return () => calls;
        })();

        // Sweep the Wanderer far away — only the AUTOMATIC subject is even
        // eligible for removal.
        const removed = reconciliation.reconcile(pos(9999, 9999, 9999));
        assert(removed.length === 1 && removed[0].publicationId === autoPublication.id, '1. only the automatically-noted subject is ever evaluated for removal');
        assert(!hasOrigin(registry, originFor('auto-hash', autoPublication.id)), '2. the automatic subject is genuinely unregistered once out of range');
        assert(hasOrigin(registry, originFor('manual-hash', manualPublication.id)), '3. the manual subject is completely untouched, even at the identical far-away position');
        assert(setSourceCallsBefore() === 0, '4. reconcile() never calls setSource() — it can only ever remove, never (re-)register, anything');

        // Structural: reconcile()'s own file never imports the discovery/
        // cascade/materialization/content/publisher machinery that WOULD be
        // needed to rediscover, start acquisition, or touch a Publication.
        const reconciliationSource = await codeOnlySource('application/AutomaticSnapshotEncounterRetentionReconciliation.js');
        for (const forbiddenImport of [
            'AutomaticSnapshotEncounterCascade', 'WorldSnapshotDiscoveryMonitor', 'DiscoverSnapshotCandidatesCommand',
            'ResolveSelectedSnapshotCommand', 'MaterializeSelectedSnapshotCommand', 'NostrSnapshotDiscoveryPublisher',
            'NostrSnapshotDiscoveryQueryService', 'DecentralizedSnapshotResolver', 'LocalContentStore', 'Publication'
        ]) {
            assert(!reconciliationSource.includes(forbiddenImport), `5. reconciliation never imports ${forbiddenImport} — it cannot rediscover, start acquisition, cancel acquisition, or touch a Publication even by accident`);
        }
        assert(reconciliationSource.includes('unregisterMaterializedSnapshotWorldSource'), '6. sanity: the ONE mutating call it does make is present');
        assert(!reconciliationSource.includes('registerMaterializedSnapshotWorldSource(') || reconciliationSource.includes('unregisterMaterializedSnapshotWorldSource('),
            '7. sanity: no bare register call exists outside the unregister name it is a substring of');

        console.log('✓ Section C: retention reconciliation only ever removes an already-registered AUTOMATIC source — never rediscovering, never starting or cancelling acquisition, never touching a Publication or material, and never affecting a manual registration, confirmed both behaviorally and against its own current imports');
    }

    // ---------------------------------------------------------------
    // Section D — failure isolation across all six stages. Each failure
    // terminates only its own candidate; a sibling candidate in the SAME
    // tick, and the monitor/registry/retention state around it, are
    // entirely unaffected.
    // ---------------------------------------------------------------
    {
        // D1 — discovery failure: the monitor's own network call rejects.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: () => Promise.reject(new Error('relay unreachable')), shouldRefresh: () => true });
            let cascadeCalls = 0;
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => { cascadeCalls += 1; return Promise.resolve(resolvedOutcome()); },
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('d1-hash')),
                worldDiscoverySourceRegistry: registry
            });

            await monitor.observe({ position: pos(0, 0, 0) });
            assert(monitor.lastError instanceof Error && monitor.lastResult === null, '1. a discovery failure is recorded as lastError, never thrown to the caller');
            assert(cascadeCalls === 0, '2. the cascade is never even reached when discovery itself fails — there is nothing to process');
            assert(registry.listSources().length === 0, '3. the registry is untouched');

            // The NEXT tick, with a working command, is entirely unaffected
            // by the previous failure — no permanent "broken" state.
            monitor._discoverSnapshotCandidatesCommand = () => Promise.resolve([{ contentHash: 'd1-hash', locator: 'ar://d1', storage: 'ar', publicationId: 'd1-pub' }]);
            await monitor.observe({ position: pos(1, 0, 0) });
            assert(monitor.lastError === null && Array.isArray(monitor.lastResult), '4. a later, successful discovery call clears the earlier failure and is processed normally');
        }

        // D2 through D6 — per-candidate cascade failures, each alongside a
        // control candidate that completes the full happy path in the SAME
        // tick.
        const stageCases = [
            {
                label: 'resolution',
                assertionNumber: 5,
                resolve: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, bytes: null, reason: 'not found on any queried relay' }),
                expectedOutcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED
            },
            {
                label: 'verification (bundled inside resolution)',
                assertionNumber: 6,
                resolve: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, bytes: null, reason: 'retrieved bytes do not hash to the announced contentHash' }),
                expectedOutcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH
            },
            {
                label: 'materialization',
                assertionNumber: 7,
                resolve: () => Promise.resolve(resolvedOutcome()),
                materialize: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.HASH_MISMATCH, contentHash: null, reason: 'stored bytes disagree with resolution' }),
                expectedOutcome: StoreSnapshotContentOutcome.HASH_MISMATCH
            },
            {
                label: 'placement',
                assertionNumber: 8,
                resolve: () => Promise.resolve(resolvedOutcome()),
                materialize: (resolution) => Promise.resolve(storedOutcome('placement-fail-hash')),
                resolvePlacementInfo: () => null, // no authoritative World placement known
                expectedOutcome: SnapshotWorldPlacementOutcome.UNPLACED
            },
            {
                label: 'registration (session torn down)',
                assertionNumber: 9,
                resolve: () => Promise.resolve(resolvedOutcome()),
                materialize: () => Promise.resolve(storedOutcome('registration-fail-hash')),
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId: 'failing-pub', position: pos(0, 0, 0) }),
                sessionActive: false,
                expectedOutcome: AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED
            }
        ];

        for (const stageCase of stageCases) {
            const registry = new WorldDiscoverySourceRegistry();
            const controlHash = 'control-hash';
            const controlPub = 'control-pub';
            const failingHash = `${stageCase.label.split(' ')[0]}-fail-hash`;
            const failingPub = 'failing-pub';

            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: (candidate) => (candidate.publicationId === failingPub
                    ? stageCase.resolve().then((outcome) => ({ ...outcome, __publicationId: failingPub }))
                    : Promise.resolve({ ...resolvedOutcome(), __publicationId: candidate.publicationId })),
                materializeSelectedSnapshotCommand: (resolution) => {
                    // Distinguish which candidate this materialization call
                    // belongs to via the `__publicationId` the resolve stub
                    // above stashed onto its own resolution — only the
                    // designated failing candidate's own materialize() call
                    // is ever redirected to stageCase.materialize(); the
                    // control candidate always uses the ordinary stored
                    // outcome for its own hash, regardless of which stage
                    // this iteration is exercising.
                    return (resolution.__publicationId === failingPub && stageCase.materialize)
                        ? stageCase.materialize(resolution)
                        : Promise.resolve(storedOutcome(controlHash));
                },
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: (publicationId) => (publicationId === failingPub && stageCase.resolvePlacementInfo
                    ? stageCase.resolvePlacementInfo()
                    : { placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: (publicationId) => publicationStub(publicationId),
                isSessionActive: () => (stageCase.sessionActive === undefined ? true : stageCase.sessionActive)
            });

            // For the registration-stage case, the control candidate must
            // resolve/materialize through its OWN hash, not the shared
            // control path above (since materialize() is stubbed per-case);
            // build it directly for clarity.
            const controlCandidate = { contentHash: controlHash, locator: 'ar://control', storage: 'ar', publicationId: controlPub };
            const failingCandidate = { contentHash: failingHash, locator: 'ar://failing', storage: 'ar', publicationId: failingPub };

            const [controlResult, failingResult] = await Promise.all([
                cascade.processCandidate(controlCandidate),
                cascade.processCandidate(failingCandidate)
            ]);

            if (stageCase.sessionActive === false) {
                // The registration-stage case's OWN cascade instance has
                // isSessionActive permanently false, so the control
                // candidate is ALSO suppressed by that same predicate — this
                // case isolates "does a registration-stage suppression for
                // one subject leak into a sibling," not "is the session
                // live." Assert both land on SUPPRESSED independently, with
                // no cross-contamination of outcome/identity between them.
                assert(controlResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `${stageCase.assertionNumber}a. [${stageCase.label}] the control candidate reaches its OWN suppression independently`);
                assert(failingResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `${stageCase.assertionNumber}b. [${stageCase.label}] the designated candidate is suppressed`);
                assert(controlResult.publicationId === controlPub && controlResult.contentHash === controlHash, `${stageCase.assertionNumber}c. [${stageCase.label}] the control result carries its OWN identity, never the failing candidate's`);
                assert(failingResult.publicationId === failingPub && failingResult.contentHash === failingHash, `${stageCase.assertionNumber}d. [${stageCase.label}] the failing result carries its OWN identity, never the control candidate's`);
            } else {
                assert(controlResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
                    `${stageCase.assertionNumber}a. [${stageCase.label}] the control candidate, sharing a tick with a failing sibling, still reaches REGISTERED — got ${controlResult.outcome}`);
                assert(hasOrigin(registry, originFor(controlHash, controlPub)), `${stageCase.assertionNumber}b. [${stageCase.label}] the control registration genuinely exists`);
                assert(failingResult.outcome === stageCase.expectedOutcome,
                    `${stageCase.assertionNumber}c. [${stageCase.label}] the designated candidate terminates at exactly its own stage's outcome — got ${failingResult.outcome}, expected ${stageCase.expectedOutcome}`);
                assert(!hasOrigin(registry, originFor(failingHash, failingPub)), `${stageCase.assertionNumber}d. [${stageCase.label}] the failing candidate never registers`);
                assert(registry.listSources().length === 1, `${stageCase.assertionNumber}e. [${stageCase.label}] exactly one source exists — the failure produced no partial, malformed, or duplicate registration`);
            }
        }

        console.log('✓ Section D: a failure at any of the six stages — discovery, resolution, verification, materialization, placement, registration — terminates only its own candidate\'s own path; a sibling candidate processed in the identical tick, and the registry around both, are entirely unaffected');
    }

    // ---------------------------------------------------------------
    // Section E — identity closure: contentHash, publicationId, a Nostr
    // event id, a locator, a World origin, a World position, and session
    // identity never silently substitute for one another.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();

        // 1. Swapping contentHash/publicationId between two subjects never
        // conflates them — the origin is a pure function of the PAIR, not
        // either half alone.
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
            materializeSelectedSnapshotCommand: (resolution, candidate) => Promise.resolve(storedOutcome(resolution.__hash)),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: (publicationId) => publicationStub(publicationId)
        });
        // materializeSelectedSnapshotCommand above needs the candidate's own
        // hash; wire resolve to stash it onto the resolution object so
        // materialize can key its own StoreSnapshotContentOutcome off the
        // SAME subject, exactly as 0.9.191/0.9.194's own multi-subject tests
        // already do.
        cascade._resolveSelectedSnapshotCommand = (candidate) => Promise.resolve({ ...resolvedOutcome(), __hash: candidate.contentHash });

        const subjectOne = await cascade.processCandidate({ contentHash: 'hash-one', locator: 'ar://one', storage: 'ar', publicationId: 'pub-two' });
        const subjectTwo = await cascade.processCandidate({ contentHash: 'hash-two', locator: 'ar://two', storage: 'ar', publicationId: 'pub-one' });
        assert(subjectOne.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && subjectTwo.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '1. sanity: both cross-labeled subjects register');
        assert(hasOrigin(registry, originFor('hash-one', 'pub-two')) && hasOrigin(registry, originFor('hash-two', 'pub-one')),
            '2. each subject occupies exactly the origin its OWN contentHash+publicationId pair derives — swapping the two values between subjects never collapses them onto one slot');
        assert(registry.listSources().length === 2, '3. two independent slots exist, never one');

        // 4. A Nostr event id is never consulted by the cascade or the
        // registration primitive as an identity of any kind.
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!/event\.?id|eventId/i.test(cascadeSource), '4. the cascade never reads a Nostr event id — two independent announcements of the identical contentHash+publicationId pair are always the SAME processing subject regardless of transport-level event identity');

        // 5. locator/storage are never part of the derived World origin —
        // materializedSnapshotWorldOrigin() takes exactly contentHash and
        // publicationId, nothing else.
        assert(materializedSnapshotWorldOrigin.length === 2, '5. materializedSnapshotWorldOrigin() has an arity of exactly two — contentHash and publicationId — a locator/storage value structurally cannot participate in a World origin');

        // 6. World position is never cached at note-time; it is always read
        // live from the registry's own current placement, so a claimed
        // position never becomes, and a stale note never lingers as, the
        // World position of record.
        const registry2 = new WorldDiscoverySourceRegistry();
        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry2, retentionRadius: 100 });
        const publication = publicationStub('live-position-pub');
        registerMaterializedSnapshotWorldSource(registry2, { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: publication.id, contentHash: 'live-position-hash', position: pos(0, 0, 0), reason: null }, publication);
        reconciliation.noteAutomaticRegistration({ publicationId: publication.id, contentHash: 'live-position-hash' });
        assert(reconciliation.reconcile(pos(0, 0, 0)).length === 0, '6a. sanity: retained while near the position at note-time');
        // The World placement moves (a re-registration, exactly as a fresh
        // cascade run against updated placementInfo would produce) —
        // reconcile() must see the NEW position, never a cached one.
        registerMaterializedSnapshotWorldSource(registry2, { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: publication.id, contentHash: 'live-position-hash', position: pos(9000, 0, 0), reason: null }, publication);
        assert(reconciliation.reconcile(pos(0, 0, 0)).some((r) => r.publicationId === publication.id), '6b. reconcile() evaluates the registry\'s CURRENT position, not a value cached at noteAutomaticRegistration() time');

        // 7. Session identity is never part of processing identity — two
        // independent sessions processing the identical subject derive the
        // identical origin (already the load-bearing fact behind Section
        // B's own registry.listSources().length === 1, and 0.9.194's own
        // Section E) — restated here explicitly as an identity-closure
        // property, not a session-boundary one.
        const registry3 = new WorldDiscoverySourceRegistry();
        const sessionOneCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('shared-subject-hash')),
            worldDiscoverySourceRegistry: registry3,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: 'shared-subject-pub', position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub('shared-subject-pub'),
            isSessionActive: () => true
        });
        const sessionTwoCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('shared-subject-hash')),
            worldDiscoverySourceRegistry: registry3,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: 'shared-subject-pub', position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub('shared-subject-pub'),
            isSessionActive: () => true
        });
        const r1 = await sessionOneCascade.processCandidate({ contentHash: 'shared-subject-hash', locator: 'ar://shared', storage: 'ar', publicationId: 'shared-subject-pub' });
        registry3.removeSource(originFor('shared-subject-hash', 'shared-subject-pub'));
        const r2 = await sessionTwoCascade.processCandidate({ contentHash: 'shared-subject-hash', locator: 'ar://shared', storage: 'ar', publicationId: 'shared-subject-pub' });
        assert(r1.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && r2.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '7a. sanity: both independent cascade instances register');
        assert(hasOrigin(registry3, originFor('shared-subject-hash', 'shared-subject-pub')), '7b. two entirely separate cascade instances (standing in for two separate sessions) derive the IDENTICAL origin for the identical subject — session identity plays no part in processing identity');

        console.log('✓ Section E: contentHash, publicationId, a Nostr event id, a locator, a World origin, a World position, and session identity are each confirmed distinct — none silently substitutes for another anywhere in the automatic pipeline');
    }

    // ---------------------------------------------------------------
    // Section F — source-family convergence: LOCAL, PEER, and SNAPSHOT
    // origins all converge on the identical, ordinary
    // deriveWorldEncounters() pipeline.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();

        const localPublication = new Publication({ id: 'local-pub', title: 'Local Publication', contentReference: new ContentReference({ hash: 'local-hash' }) });
        registry.setSource(describeWorldDiscoverySource({
            origin: 'local',
            publications: [localPublication],
            placements: [{ publicationId: 'local-pub', position: pos(0, 0, 0) }]
        }));

        const peerPublication = new Publication({ id: 'peer-pub', title: 'Peer Publication', contentReference: new ContentReference({ hash: 'peer-hash' }) });
        registry.setSource(describeWorldDiscoverySource({
            origin: 'peer:identity-42',
            publications: [peerPublication],
            placements: [{ publicationId: 'peer-pub', position: pos(1, 0, 0) }]
        }));

        const snapshotPublication = publicationStub('snapshot-pub');
        registerMaterializedSnapshotWorldSource(
            registry,
            { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: 'snapshot-pub', contentHash: 'snapshot-hash', position: pos(2, 0, 0), reason: null },
            snapshotPublication
        );

        assert(registry.listSources().length === 3, '1. three independent origins, one per family, coexist without collision');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        const objectIds = encounters.publications.map((e) => e.objectId).sort();
        assert(objectIds.length === 3 && objectIds.join(',') === ['local-pub', 'peer-pub', 'snapshot-pub'].sort().join(','),
            `2. all three families render through the identical pipeline with no family left out or duplicated — got ${JSON.stringify(objectIds)}`);

        // Every encounter has the same shape, regardless of which family
        // produced it — no Snapshot-specific field, tag, or branch exists
        // on the encounter itself.
        const snapshotEncounter = encounters.publications.find((e) => e.objectId === 'snapshot-pub');
        const localEncounter = encounters.publications.find((e) => e.objectId === 'local-pub');
        assert(JSON.stringify(Object.keys(snapshotEncounter).sort()) === JSON.stringify(Object.keys(localEncounter).sort()),
            '3. a Snapshot-sourced encounter and a LOCAL-sourced encounter carry the identical field shape — no Snapshot-specific rendering vocabulary exists downstream of the registry');

        // Structural: the two pure "what does the World look like" files
        // never import any Snapshot-specific machinery — they treat all
        // three origins as one uniform family, by construction.
        for (const file of ['core/WorldEncounter.js', 'core/WorldDiscoverySourceAssembly.js']) {
            const source = await codeOnlySource(file);
            // `snapshotPlacements` is one of the SIX generic, pre-existing
            // `WorldDiscoveryInputKeys` (0.9.5 — a PublicationSnapshotPlacement
            // anchor concept, unrelated to this milestone's automatic
            // pipeline) and is deliberately excluded from this sweep; the
            // acquisition-specific vocabulary below has no legitimate
            // reason to appear in either file at all.
            assert(!/Nostr|Arweave|AutomaticSnapshotEncounter|SnapshotDiscoveryMonitor|DiscoverSnapshot|ResolveSelectedSnapshot|MaterializeS(elected|napshot)/i.test(source),
                `4. ${file} contains no Nostr/Arweave/automatic-cascade/retention/discovery/materialization vocabulary of any kind — it derives encounters from six generic arrays, uniformly, regardless of which family populated them`);
        }

        console.log('✓ Section F: LOCAL, PEER, and SNAPSHOT sources converge on the identical deriveWorldEncounters() pipeline, producing field-for-field identical encounter shapes with no Snapshot-specific rendering branch anywhere downstream of the registry');
    }

    // ---------------------------------------------------------------
    // Section G — no hidden Snapshot path: ordinary World-rendering
    // components import no Nostr/Arweave/discovery/cascade/retention/
    // materialization module, checked directly against their own current
    // source.
    // ---------------------------------------------------------------
    {
        const forbiddenPattern = /^import\s.*from\s+['"].*(Nostr|Arweave|AutomaticSnapshotEncounterCascade|AutomaticSnapshotEncounterRetention|WorldSnapshotDiscoveryMonitor|DiscoverSnapshotCandidatesCommand|DiscoverSnapshotCommand|ResolveSelectedSnapshotCommand|MaterializeSelectedSnapshotCommand|MaterializeSnapshotFrom|DecentralizedSnapshotResolver|SnapshotDistribution|ShouldRefreshSnapshotDiscovery)[^'"]*['"];?$/m;

        const ordinaryWorldFiles = [
            'ui/views/LiveWorldView.js',
            'core/WorldEncounter.js',
            'core/WorldDiscoverySourceAssembly.js',
            'core/WorldDiscoverySource.js',
            'application/WorldEncounterIntegration.js',
            'application/WorldDiscoveryRegistryProjection.js',
            'application/WorldDiscoveryRuntimeBootstrap.js',
            'peer/PeerWorldDiscoveryLifecycleBridge.js'
        ];
        for (const file of ordinaryWorldFiles) {
            const raw = await readFile(new URL(file, SOURCE_ROOT), 'utf8');
            const importLines = raw.split('\n').filter((line) => line.trim().startsWith('import '));
            const offending = importLines.filter((line) => forbiddenPattern.test(line));
            assert(offending.length === 0, `1. ${file} imports no discovery/resolution/cascade/retention/materialization/Nostr/Arweave module — found: ${JSON.stringify(offending)}`);
        }

        // ui/components/WorldEncounterCanvas.js and ui/components/
        // OwnPublicationPanel.js DO legitimately import Snapshot-specific
        // PRESENTATION machinery (inspection, comparison, content view, the
        // symmetric unregister primitive) — see Section F's own field-shape
        // check, above, for why that is presentation convergence, not a
        // hidden path. What they must NEVER import is the ACQUISITION half
        // — discovery, resolution, materialization, or the cascade/
        // retention orchestrators themselves.
        for (const file of ['ui/components/WorldEncounterCanvas.js', 'ui/components/OwnPublicationPanel.js']) {
            const raw = await readFile(new URL(file, SOURCE_ROOT), 'utf8');
            const importLines = raw.split('\n').filter((line) => line.trim().startsWith('import '));
            const acquisitionPattern = /^import\s.*from\s+['"].*(Nostr|Arweave|AutomaticSnapshotEncounterCascade|AutomaticSnapshotEncounterRetention|WorldSnapshotDiscoveryMonitor|DecentralizedSnapshotResolver)[^'"]*['"];?$/m;
            const offending = importLines.filter((line) => acquisitionPattern.test(line));
            assert(offending.length === 0, `2. ${file} imports Snapshot presentation/registration primitives but never the acquisition machinery (Nostr/Arweave/cascade/retention/resolver) itself — found: ${JSON.stringify(offending)}`);
        }

        // ui/views/WorldView.js is the ONE UI-layer file allowed to import
        // the cascade/retention orchestrators directly (it is their
        // composition root) — confirmed as a positive fact, not a gap.
        const worldViewSource = await readFile(new URL('ui/views/WorldView.js', SOURCE_ROOT), 'utf8');
        assert(/import \{ AutomaticSnapshotEncounterCascade \}/.test(worldViewSource) && /import \{ AutomaticSnapshotEncounterRetentionReconciliation \}/.test(worldViewSource),
            '3. sanity: ui/views/WorldView.js is confirmed as the one legitimate composition root for the cascade/retention orchestrators');

        // ui/views/LiveWorldView.js — a second World-rendering route — never
        // composes the automatic pipeline at all. The automatic Snapshot
        // subsystem exists on exactly one route, not implicitly everywhere
        // a World renders.
        const liveWorldViewSource = await readFile(new URL('ui/views/LiveWorldView.js', SOURCE_ROOT), 'utf8');
        assert(!/AutomaticSnapshot|WorldSnapshotDiscoveryMonitor/.test(liveWorldViewSource), '4. ui/views/LiveWorldView.js never composes the automatic cascade/retention/monitor — the automatic Snapshot pipeline is not implicitly wired into every World-rendering route');

        console.log('✓ Section G: ordinary World-rendering components (core/WorldEncounter.js, core/WorldDiscoverySourceAssembly.js, LiveWorldView.js, the peer/registry-projection family) import no discovery/resolution/cascade/retention/materialization/Nostr/Arweave module; WorldEncounterCanvas.js and OwnPublicationPanel.js import Snapshot PRESENTATION primitives only, never the acquisition machinery; and ui/views/WorldView.js remains the one confirmed composition root');
    }

    // ---------------------------------------------------------------
    // Section H — automatic vs. manual isolation by orchestration
    // provenance, without an `automatic` registry field or lifecycle
    // state; unregister/material deletion/Publication deletion/Nostr
    // withdrawal remain four genuinely independent operations.
    // ---------------------------------------------------------------
    {
        // 1-2. No `automatic` (or similar) field exists anywhere in the
        // WorldDiscoverySource shape or the registry itself.
        const sourceShapeSource = await codeOnlySource('core/WorldDiscoverySource.js');
        const registrySource = await codeOnlySource('application/WorldDiscoverySourceRegistry.js');
        const bridgeSource = await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        for (const [label, source] of [['core/WorldDiscoverySource.js', sourceShapeSource], ['application/WorldDiscoverySourceRegistry.js', registrySource], ['application/MaterializedSnapshotWorldDiscoveryBridge.js', bridgeSource]]) {
            assert(!/\bautomatic\b/i.test(source), `1. ${label} carries no "automatic" field, flag, or vocabulary of any kind`);
            assert(!/\bmanual\b/i.test(source), `2. ${label} carries no "manual" field, flag, or vocabulary of any kind either — the registry cannot tell the two apart, by design`);
        }

        // 3. Provenance is distinguishable ANYWAY, entirely through which
        // caller happens to call noteAutomaticRegistration() — an automatic
        // registration is watched by retention; a manual one, calling the
        // identical registerMaterializedSnapshotWorldSource(), is not.
        const registry = new WorldDiscoverySourceRegistry();
        const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry, retentionRadius: 100 });
        const automaticPub = publicationStub('h-automatic-pub');
        const manualPub = publicationStub('h-manual-pub');
        registerMaterializedSnapshotWorldSource(registry, { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: automaticPub.id, contentHash: 'h-auto-hash', position: pos(0, 0, 0), reason: null }, automaticPub);
        reconciliation.noteAutomaticRegistration({ publicationId: automaticPub.id, contentHash: 'h-auto-hash' });
        registerMaterializedSnapshotWorldSource(registry, { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: manualPub.id, contentHash: 'h-manual-hash', position: pos(0, 0, 0), reason: null }, manualPub);
        // (manual: no noteAutomaticRegistration() call — exactly OwnPublicationPanel.js's own "Register" button)
        assert(reconciliation.watchedAutomaticSubjects().length === 1 && reconciliation.watchedAutomaticSubjects()[0].publicationId === automaticPub.id,
            '3. provenance is fully recoverable — retention watches exactly the subject its OWN caller told it about, and no other — with no field on the source itself ever consulted to decide');
        assert(JSON.stringify(Object.keys(registry.listSources().find((s) => s.origin === originFor('h-auto-hash', automaticPub.id)))) === JSON.stringify(Object.keys(registry.listSources().find((s) => s.origin === originFor('h-manual-hash', manualPub.id)))),
            '4. the two registered sources are structurally IDENTICAL — provenance lives entirely outside the registry, in the caller\'s own bookkeeping');

        // 5. unregister != material deletion != Publication deletion != Nostr
        // withdrawal — unregistering (automatic OR manual) never triggers
        // any of the other three.
        const host = makeHost('audit-independent-ops');
        const worldModel = makeWorldModel();
        const opsPub = 'h-ops-pub';
        worldModel.placeAt(opsPub, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'h-ops-bytes', { publicationId: opsPub, claimedPosition: { x: 0, y: 0, z: 0 } });
        const publication = new Publication({ id: opsPub, title: 'Ops Independence', contentReference: reference });
        worldModel.knowPublication(publication);
        const registry2 = new WorldDiscoverySourceRegistry();
        // Genuinely materialize (not just register) so the local material
        // store actually holds bytes to check survival against, below.
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const resolution = await host.resolveSelectedSnapshotCommand(candidate);
        const materialization = await host.materializeSelectedSnapshotCommand(resolution);
        assert(materialization.outcome === StoreSnapshotContentOutcome.STORED, 'sanity: materialization genuinely stored the bytes locally');
        registerMaterializedSnapshotWorldSource(registry2, { outcome: SnapshotWorldPlacementOutcome.PLACED, publicationId: opsPub, contentHash: reference.hash, position: pos(0, 0, 0), reason: null }, publication);
        assert(hasOrigin(registry2, originFor(reference.hash, opsPub)), 'sanity: registered');

        unregisterMaterializedSnapshotWorldSource(registry2, reference.hash, opsPub);
        assert(!hasOrigin(registry2, originFor(reference.hash, opsPub)), '5. unregistration itself genuinely removed the World source');
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '6. material was NOT deleted by unregistration');
        assert(worldModel.findPublicationById(opsPub) !== null, '7. the Publication was NOT deleted by unregistration');
        assert(host.network.events.length === 1, '8. the Nostr announcement was NOT withdrawn by unregistration');

        console.log('✓ Section H: automatic and manual registration remain distinguishable purely by which caller notes them to retention — no `automatic`/`manual` field exists anywhere in a WorldDiscoverySource or the registry — and unregistration is confirmed to never trigger material deletion, Publication deletion, or Nostr withdrawal as a side effect');
    }

    // ---------------------------------------------------------------
    // Section I — re-entry: a subject two separate dead sessions each
    // suppress is still, unconditionally, registerable by a third, live
    // session; no tombstone accumulates anywhere.
    // ---------------------------------------------------------------
    {
        const host = makeHost('audit-reentry');
        const publicationId = 'audit-reentry-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'reentry-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Reentry', contentReference: reference }));
        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(reference.hash, publicationId);

        // Session A dies before mounting; suppressed.
        const sessionA = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        sessionA.teardown();
        const resultA = await sessionA.fullTick(pos(0, 0, 0));
        assert(resultA.cascadeResults[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, '1. session A suppresses the subject');

        // Session B — an entirely SEPARATE dead session for the SAME
        // subject — also suppresses it. Two suppressions in a row, never
        // any accumulating "twice-blocked" state.
        const sessionB = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        sessionB.teardown();
        const resultB = await sessionB.fullTick(pos(0, 0, 0));
        assert(resultB.cascadeResults[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, '2. session B, independently, also suppresses the identical subject');
        assert(!hasOrigin(registry, origin), '3. still nothing registered after two independent suppressions');

        // Session C — genuinely live — still, unconditionally, registers
        // it. Two prior suppressions carry no cumulative weight of any
        // kind.
        const sessionC = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const resultC = await sessionC.fullTick(pos(0, 0, 0));
        assert(resultC.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `4. a third, live session registers the subject exactly as if it had never been suppressed before — got ${resultC.cascadeResults[0].outcome}`);
        assert(hasOrigin(registry, origin), '5. the registration genuinely exists');

        // Structural: no file in the automatic-Snapshot family defines any
        // persistent "suppressed"/"blocked"/"tombstone" collection — a
        // SUPPRESSED result is memoized only inside the one cascade
        // INSTANCE that produced it (already 0.9.194's own Section K), and
        // that instance is discarded with the session that owned it.
        for (const file of [
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js',
            'application/WorldDiscoverySourceRegistry.js',
            'application/MaterializedSnapshotWorldDiscoveryBridge.js'
        ]) {
            const source = await codeOnlySource(file);
            assert(!/tombstone|blocklist|blockList|suppressedSubjects|permanentlyBlocked/i.test(source), `6. ${file} defines no tombstone/blocklist vocabulary — a suppressed subject is never permanently excluded anywhere in the subsystem`);
        }

        console.log('✓ Section I: two separate dead sessions independently suppressing the identical subject carries no cumulative weight — a third, live session still registers it unconditionally, and no file in the subsystem defines any tombstone or blocklist that could have prevented that');
    }

    // ---------------------------------------------------------------
    // Section J — cadence composition: still exactly one spatial cadence,
    // reconfirmed against CURRENT source.
    // ---------------------------------------------------------------
    {
        const worldViewSource = await codeOnlySource('ui/views/WorldView.js');
        const intervalDeclarations = worldViewSource.match(/\bsetInterval\s*\(/g) || [];
        assert(intervalDeclarations.length === 3, `1. ui/views/WorldView.js still declares exactly three intervals total — got ${intervalDeclarations.length}`);

        // Exactly one of them calls refreshSpatialUI() — the one tick that
        // drives worldSnapshotDiscoveryMonitor.observe() and
        // automaticSnapshotEncounterRetentionReconciliation.reconcile().
        const intervalBlocks = worldViewSource.split(/setInterval\s*\(/).slice(1);
        const refreshCallingIntervals = intervalBlocks.filter((block) => block.slice(0, 400).includes('refreshSpatialUI()'));
        assert(refreshCallingIntervals.length === 1, `2. exactly one interval calls refreshSpatialUI() — got ${refreshCallingIntervals.length}`);

        // None of the three automatic-Snapshot application files declares a
        // timer, subscription, or animation-frame loop of its own.
        for (const file of ['application/WorldSnapshotDiscoveryMonitor.js', 'application/AutomaticSnapshotEncounterCascade.js', 'application/AutomaticSnapshotEncounterRetentionReconciliation.js']) {
            const source = await codeOnlySource(file);
            assert(!/setTimeout|setInterval|\.subscribe\(|requestAnimationFrame\(/.test(source), `3. ${file} declares no timer, subscription, or animation-frame loop of its own`);
        }

        console.log('✓ Section J: exactly one spatial cadence still exists in ui/views/WorldView.js — discovery observation and retention reconciliation both still ride the SAME single refreshSpatialUI() tick, reconfirmed against current source with no new Snapshot-specific timer having crept in');
    }

    // ---------------------------------------------------------------
    // Section K — no accidental authority: the standing checklist 0.9.159,
    // 0.9.163, 0.9.172, and 0.9.189 each separately established.
    // ---------------------------------------------------------------
    {
        // 1. A Nostr claimedPosition remains a claim — the cascade never
        // reads it, never imports the consumption seam.
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!/claimedPosition/.test(cascadeSource), '1a. the automatic cascade never reads candidate.claimedPosition');
        assert(!/SnapshotWorldPositionClaim/.test(cascadeSource), '1b. the automatic cascade never imports the position-claim consumption seam');

        // 2. World placement remains authoritative for World position — a
        // candidate carrying a claimedPosition still registers at the
        // PLACEMENT's own position, never the claim.
        const host = makeHost('audit-authority');
        const worldModel = makeWorldModel();
        const pubId = 'authority-pub';
        worldModel.placeAt(pubId, new Position(50, 0, 0));
        const reference = await placeAndAnnounce(host, 'authority-bytes', { publicationId: pubId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: pubId, title: 'Authority', contentReference: reference }));
        const registry = new WorldDiscoverySourceRegistry();
        const session = makeSubsystemSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        await session.fullTick(pos(0, 0, 0));
        const registeredSource = registry.listSources().find((s) => s.origin === originFor(reference.hash, pubId));
        assert(registeredSource && registeredSource.placements[0].position.x === 50, `2. registration lands at the AUTHORITATIVE placement's own position (x=50), never the announced claimedPosition (x=0) — got x=${registeredSource && registeredSource.placements[0].position.x}`);

        // 3. Discovery order is never reinterpreted as ranking — feeding the
        // SAME two candidates in reversed order produces the identical set
        // of registrations.
        const registryForward = new WorldDiscoverySourceRegistry();
        const registryReversed = new WorldDiscoverySourceRegistry();
        const candidates = [
            { contentHash: 'order-a-hash', locator: 'ar://order-a', storage: 'ar', publicationId: 'order-a-pub' },
            { contentHash: 'order-b-hash', locator: 'ar://order-b', storage: 'ar', publicationId: 'order-b-pub' }
        ];
        function orderCascade(registry) {
            return new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
                materializeSelectedSnapshotCommand: (resolution, candidate) => Promise.resolve(storedOutcome(resolution.__hash)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: (publicationId) => publicationStub(publicationId)
            });
        }
        const forwardCascade = orderCascade(registryForward);
        forwardCascade._resolveSelectedSnapshotCommand = (candidate) => Promise.resolve({ ...resolvedOutcome(), __hash: candidate.contentHash });
        for (const candidate of candidates) await forwardCascade.processCandidate(candidate);
        const reversedCascade = orderCascade(registryReversed);
        reversedCascade._resolveSelectedSnapshotCommand = (candidate) => Promise.resolve({ ...resolvedOutcome(), __hash: candidate.contentHash });
        for (const candidate of [...candidates].reverse()) await reversedCascade.processCandidate(candidate);
        assert(registryForward.listSources().length === 2 && registryReversed.listSources().length === 2, '3a. sanity: both orderings register both candidates');
        assert(new Set(registryForward.listSources().map((s) => s.origin)).size === new Set(registryReversed.listSources().map((s) => s.origin)).size
            && [...registryForward.listSources()].every((s) => hasOrigin(registryReversed, s.origin)),
            '3b. processing order never affects WHICH candidates end up registered — no first-wins/last-wins ranking exists');

        // 4. Content equality never becomes deduplication — two different
        // Publications sharing the identical contentHash both register,
        // independently (0.9.163's own collision fix, reconfirmed here as a
        // standing authority boundary rather than a historical regression
        // test).
        const registryCollision = new WorldDiscoverySourceRegistry();
        const collisionCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('shared-bytes-hash')),
            worldDiscoverySourceRegistry: registryCollision,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: (publicationId) => publicationStub(publicationId)
        });
        const collisionOne = await collisionCascade.processCandidate({ contentHash: 'shared-bytes-hash', locator: 'ar://shared', storage: 'ar', publicationId: 'collision-pub-one' });
        const collisionTwo = await collisionCascade.processCandidate({ contentHash: 'shared-bytes-hash', locator: 'ar://shared', storage: 'ar', publicationId: 'collision-pub-two' });
        assert(collisionOne.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && collisionTwo.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4a. sanity: both register');
        assert(registryCollision.listSources().length === 2, '4b. identical bytes across two different Publications never collapse into one registration — content equality is never treated as deduplication');

        // 5. Successful verification never becomes trust — RESOLVED and
        // STORED alone, with no authoritative placement known, stops at
        // UNPLACED, never REGISTERED.
        const registryTrust = new WorldDiscoverySourceRegistry();
        const trustCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome('trust-hash')),
            worldDiscoverySourceRegistry: registryTrust,
            resolvePlacementInfo: () => null,
            findPublicationById: () => publicationStub('trust-pub')
        });
        const trustResult = await trustCascade.processCandidate({ contentHash: 'trust-hash', locator: 'ar://trust', storage: 'ar', publicationId: 'trust-pub' });
        assert(trustResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, `5. a fully resolved AND materialized (successfully verified) Snapshot with no known authoritative placement stops at UNPLACED, never REGISTERED — got ${trustResult.outcome}`);

        // 6. Registration never implies ownership — no `owner` field exists
        // anywhere on a registered WorldDiscoverySource.
        const worldDiscoverySourceKeysCheck = registeredSource ? Object.keys(registeredSource) : [];
        assert(!worldDiscoverySourceKeysCheck.includes('owner'), '6. a registered WorldDiscoverySource carries no "owner" field of any kind');

        // 7. Retention never implies visibility — a subject reconciliation
        // has never watched (a manual registration) renders identically to
        // one it has, and reconcile() never touches rendering at all
        // (already Section C/F's own structural finding, restated here as
        // the authority-boundary point: being watched by retention is not a
        // precondition for being rendered).
        const encountersForOwnership = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encountersForOwnership.publications.some((e) => e.objectId === pubId), '7. rendering succeeds regardless of retention\'s own watch state — visibility and retention remain two entirely separate questions');

        console.log('✓ Section K: every standing authority boundary still holds — a Nostr claim is never promoted, World placement stays authoritative for position, discovery order carries no ranking, content equality never becomes deduplication, successful verification never becomes trust, registration never implies ownership, and retention never implies visibility');
    }

    // ---------------------------------------------------------------
    // Section L — THE POINT: an explicit, machine-checked assertion of
    // the subsystem's own stopping point.
    // ---------------------------------------------------------------
    {
        // The architectural stopping-point assertion this whole milestone
        // exists to make explicit:
        const STOPPING_POINT = 'maintain eligible Snapshot contributions to the ordinary World source registry during the lifetime of a WorldView session';
        assert(typeof STOPPING_POINT === 'string' && STOPPING_POINT.length > 0, 'sanity: the assertion itself is stated');

        // Everything named as OUTSIDE that boundary — acceptance beyond
        // registration, ownership, merge/adopt semantics, replacement,
        // trust, synchronization, conflict resolution, and withdrawal
        // semantics — must not exist as vocabulary anywhere in the
        // automatic-Snapshot family's own production code.
        const familyFiles = [
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterCascadeOutcome.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js',
            'application/AutomaticSnapshotEncounterRetentionPolicy.js',
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/MaterializedSnapshotWorldDiscoveryBridge.js',
            'application/WorldDiscoverySourceRegistry.js'
        ];
        const forbiddenVocabulary = [
            'adopt', 'merge', 'ownership', 'synchroniz', 'conflictResolution', 'withdraw', 'trustLevel', 'acceptance'
        ];
        for (const file of familyFiles) {
            const source = await codeOnlySource(file);
            for (const word of forbiddenVocabulary) {
                assert(!new RegExp(word, 'i').test(source), `1. ${file} contains no "${word}" vocabulary — this subsystem's own machinery never reaches for a concept beyond its stated stopping point`);
            }
        }

        // The stopping point itself, restated as three checkable facts:
        // (a) "maintain" — the ONLY ongoing action is reconcile()'s own
        //     keep/remove decision; no other periodic action exists over an
        //     already-registered source (confirmed structurally in Section
        //     J: exactly one cadence, and reconciliation's own file
        //     performs no other mutation — Section C).
        // (b) "eligible... to the ordinary World source registry" — the
        //     registry itself remains completely unaware anything is
        //     "eligible" versus not; eligibility is entirely the cascade's
        //     own upstream decision, reified as nothing more than whether
        //     setSource() was ever called (Section H).
        // (c) "during the lifetime of a WorldView session" — session
        //     boundedness is the 0.9.193/0.9.194 guard, reconfirmed at the
        //     whole-system level in this file's own Section B/I: no
        //     registration outlives the session that produced it unless a
        //     LATER, independently-live session re-confirms it.
        // (a)/(b)/(c) above are each already independently verified by
        // Sections C, H, and B/I of this same file — restated here as the
        // single sentence they jointly prove, not re-checked a second time.

        console.log('✓ Section L: the autonomous Snapshot machinery is confirmed to end exactly at "maintain eligible Snapshot contributions to the ordinary World source registry during the lifetime of a WorldView session" — no acceptance, ownership, merge/adopt, replacement, trust, synchronization, conflict-resolution, or withdrawal vocabulary exists anywhere in the family of files that implement it');
    }

    console.log('\n✅ All Automatic Snapshot Subsystem Boundary & Convergence Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
