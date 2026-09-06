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
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.194 — Automatic Snapshot Session-Lifetime Guard E2E Audit.
//
// Test-only. No production changes. 0.9.193 closed 0.9.192's own Section D
// orphan with one narrow, synchronous guard inside
// `application/AutomaticSnapshotEncounterCascade.js`, verified there against
// stubbed collaborators. This file asks the question that leaves open:
// does that guard compose correctly with EVERYTHING 0.9.186-0.9.193 already
// built — real Nostr discovery, real Arweave resolution, real local
// materialization, real World placement/registration, and real retention
// reconciliation — the way `ui/views/WorldView.js`'s own `refreshSpatialUI()`
// actually wires them together, end to end?
//
// The central invariant under audit:
//
//   A cascade belongs to the WorldView session that created it; acquisition
//   may outlive that session, but World registration may not.
//
// `makeGuardedSession()`, below, extends the exact `makeAutomaticSession()`
// composition `tests/WorldSnapshotAutomaticEncounterRetentionLifecycleAudit.test.js`
// (0.9.191) and `tests/WorldSnapshotAutomaticObservationCadenceAudit.test.js`
// (0.9.192) already established — monitor -> cascade -> (on REGISTERED)
// `noteAutomaticRegistration()` -> synchronous `reconcile()`, the discovery/
// cascade chain fired WITHOUT being awaited before `reconcile()` runs — with
// the ONE thing neither of those files' own harnesses ever wired in: the
// cascade's own `isSessionActive` collaborator (0.9.193), reading a plain,
// non-reactive flag exactly like `ui/views/WorldView.js`'s own
// `automaticCascadeSessionActive`, flipped by a `teardown()` call that never
// cancels anything already in flight — the identical restraint that file's
// own `onBeforeUnmount()` holds.
//
//   Section A: FLAGSHIP — full real-machinery lifecycle. WorldView A mounts,
//              discovers via a real Nostr query, begins resolving a real
//              Arweave-hosted candidate, unmounts mid-flight, and the late
//              completion is SUPPRESSED — material, Publication, the Nostr
//              announcement, and the Arweave content all survive; no World
//              source exists. WorldView B then mounts fresh and its own,
//              independent cascade run genuinely REGISTERS the same subject,
//              completely unaffected by A's late, suppressed completion.
//   Section B: live-session registration — the ordinary real-machinery
//              happy path, completely unaffected by the guard's presence.
//   Section C: teardown at every asynchronous boundary the cascade actually
//              has — discovery, resolution (verification is bundled inside
//              resolution from the cascade's own point of view, see
//              `application/ResolveSelectedSnapshotCommand.js`), and
//              materialization — all converge on SUPPRESSED; a structural
//              check confirms placement itself is synchronous and therefore
//              never its own distinct teardown window.
//   Section D: acquisition survival — no material deletion, no rollback, no
//              Publication deletion, no discovery withdrawal, no Arweave
//              deletion, under a real-machinery suppressed run.
//   Section E: FLAGSHIP NEGATIVE — session-scoped, not subject-scoped. Two
//              sessions process the IDENTICAL publicationId/contentHash;
//              the live one registers, and the torn-down one's later
//              completion for that SAME subject is suppressed without
//              perturbing the standing registration in any way.
//   Section F: fresh re-entry — a subject a dead session suppressed is
//              never permanently blocked; a fresh session's own independent
//              cascade instance still genuinely registers it.
//   Section G: concurrent candidates in one session — only work that
//              reaches the registration checkpoint while the session is
//              still active actually registers, and retention only ever
//              watches those.
//   Section H: retention interaction — a live REGISTERED subject still
//              KEEPs/UNREGISTERs exactly as 0.9.190 established; a
//              SUPPRESSED subject is never watched, so reconcile() simply
//              has nothing to do for it.
//   Section I: manual registration remains completely independent of the
//              automatic cascade's session predicate.
//   Section J: identity isolation — SUPPRESSED alters no identity: not
//              contentHash, publicationId, locator/storage, the Publication
//              object, the Nostr event, the Arweave transaction, or the
//              origin a later genuine registration produces.
//   Section K: idempotency — a suppressed subject does not become
//              registered merely because it is observed again, even by the
//              SAME cascade instance whose own `isSessionActive` closure is
//              later flipped back to true; only a genuinely NEW cascade
//              instance re-arms.
//   Section L: structural sweep — exactly one `isSessionActive()`
//              checkpoint, no `await` between it and registration, no
//              cancellation machinery, no new timer, no new World lifecycle
//              enum, and manual registration's own primitive still has no
//              `isSessionActive` concept at all.

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
// Real-machinery host — identical shape to 0.9.191's own makeHost(): a real
// (in-memory) Nostr relay, a real (in-memory) Arweave gateway/signer, and a
// real LocalContentStore, composed through the SAME, unmodified application
// commands ui/main.js itself wires up.
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
        return { id: `fake-e2e-tx-${counter}`, transaction: { id: `fake-e2e-tx-${counter}`, data: material } };
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
// makeGuardedSession({...}) — the SAME monitor -> cascade -> (on
// REGISTERED) noteAutomaticRegistration() -> synchronous reconcile()
// composition 0.9.191/0.9.192's own makeAutomaticSession() already
// established, extended with EXACTLY the one thing 0.9.193 added to
// production: a plain, non-reactive `sessionActive` flag — byte-for-byte
// what `ui/views/WorldView.js`'s own `automaticCascadeSessionActive` is —
// read through a closure the cascade calls as `isSessionActive`.
// `teardown()` mirrors that file's own `onBeforeUnmount()` FIRST statement:
// it flips the flag and NOTHING else. It never cancels the monitor's,
// cascade's, or reconciliation's own in-flight work (none of the three
// classes expose a cancel/destroy/dispose method — see Section L), and a
// torn-down session simply stops being ticked, exactly as production.
// ---------------------------------------------------------------------
function makeGuardedSession({
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

    // tick(position) -> { removedThisTick, settled } — see 0.9.191/0.9.192's
    // own identical shape: reconcile() runs synchronously, before the
    // discover -> cascade -> note chain (fired unawaited) has settled.
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
    // Section A — FLAGSHIP: full real-machinery lifecycle, session
    // boundary, and a fresh mount's own independent recovery.
    // ---------------------------------------------------------------
    {
        const host = makeHost('e2e-flagship');
        const publicationId = 'e2e-flagship-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(10, 0, 0));
        const reference = await placeAndAnnounce(host, 'flagship-e2e-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Flagship E2E', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(reference.hash, publicationId);
        const resolveGate = deferred();

        // WorldView A mounts: real Nostr discovery, real Arweave/local
        // resolution held open at the exact moment a real network
        // round-trip would be in flight.
        const sessionA = makeGuardedSession({
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
        assert(!hasOrigin(registry, origin), 'sanity: cascade genuinely in flight, blocked on resolveGate');

        // WorldView A unmounts — exactly ui/views/WorldView.js's own
        // onBeforeUnmount() first statement, never cancelling the resolve
        // chain already in flight.
        sessionA.teardown();

        resolveGate.resolve();
        const resultsA = await settled;
        assert(resultsA.length === 1 && resultsA[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED,
            `1. session A's late completion is SUPPRESSED — got ${resultsA[0] && resultsA[0].outcome}`);
        assert(!hasOrigin(registry, origin), '2. no World source exists for the torn-down session\'s late completion');

        // Acquisition survives.
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '3. material survives locally');
        assert(worldModel.findPublicationById(publicationId) !== null, '4. Publication survives');
        assert(host.network.events.length === 1, '5. Nostr discovery announcement survives');
        assert(host.gateway.network.has(reference.uri.slice('ar://'.length)), '6. Arweave-hosted content survives');

        // The ordinary World View rendering pipeline sees nothing.
        let encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 0, '7. the ordinary World View encounter pipeline renders nothing for the suppressed subject');

        // WorldView B mounts fresh, sharing only the registry and the same
        // real Nostr/Arweave network — A's late completion cannot affect it.
        const sessionB = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });
        const tickB = await sessionB.fullTick(pos(0, 0, 0));
        assert(tickB.cascadeResults.some((r) => r.outcome === SnapshotWorldRegistrationOutcome.REGISTERED),
            '8. WorldView B\'s own independent, live cascade run genuinely REGISTERS the same subject');
        assert(hasOrigin(registry, origin), '9. the registration now genuinely exists');

        encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1 && encounters.publications[0].objectId === publicationId,
            '10. the ordinary World View encounter pipeline now renders it, exactly like any other Publication');

        console.log('✓ Section A: FLAGSHIP — a real-machinery cascade torn down mid-flight is SUPPRESSED with acquisition intact and no World source, and a freshly-mounted WorldView\'s own independent cascade run then genuinely registers the identical subject, completely unaffected by the late completion');
    }

    // ---------------------------------------------------------------
    // Section B — live-session registration, real machinery, unaffected.
    // ---------------------------------------------------------------
    {
        const host = makeHost('e2e-live');
        const publicationId = 'e2e-live-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(5, 0, 0));
        const reference = await placeAndAnnounce(host, 'live-e2e-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Live E2E', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const session = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById,
            retentionRadius: 100
        });

        const result = await session.fullTick(pos(0, 0, 0));
        assert(result.cascadeResults.length === 1 && result.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            `1. an ordinary live session still reaches REGISTERED — got ${result.cascadeResults[0] && result.cascadeResults[0].outcome}`);
        assert(hasOrigin(registry, originFor(reference.hash, publicationId)), '2. genuinely registered');

        const encounters = deriveWorldEncounters(assembleWorldDiscoveryInputs(registry.listSources()));
        assert(encounters.publications.length === 1, '3. renders ordinarily');

        console.log('✓ Section B: an ordinary live session, full real machinery, registers and renders exactly as before the guard existed');
    }

    // ---------------------------------------------------------------
    // Section C — teardown at every asynchronous boundary the cascade
    // actually has.
    // ---------------------------------------------------------------
    {
        // C1 — teardown while discovery's own real Nostr query is in flight.
        {
            const host = makeHost('e2e-boundary-discover');
            const publicationId = 'e2e-boundary-discover-pub';
            const worldModel = makeWorldModel();
            worldModel.placeAt(publicationId, new Position(0, 0, 0));
            const reference = await placeAndAnnounce(host, 'boundary-discover-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
            worldModel.knowPublication(new Publication({ id: publicationId, title: 'Boundary Discover', contentReference: reference }));

            const registry = new WorldDiscoverySourceRegistry();
            const discoverGate = deferred();
            const session = makeGuardedSession({
                discoverSnapshotCandidatesCommand: () => discoverGate.promise.then(() => host.discoverSnapshotCandidatesCommand()),
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: worldModel.resolvePlacementInfo,
                findPublicationById: worldModel.findPublicationById
            });

            const { settled } = session.tick(pos(0, 0, 0));
            await flushMicrotasks();
            session.teardown();
            discoverGate.resolve();
            const results = await settled;
            assert(results.length === 1 && results[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED,
                `1. teardown during discovery's own real network query -> SUPPRESSED once the candidate is finally processed, got ${results[0] && results[0].outcome}`);
            assert(!hasOrigin(registry, originFor(reference.hash, publicationId)), '2. no registration');
        }

        // C2 — teardown during resolution (which itself bundles hash
        // verification — see application/ResolveSelectedSnapshotCommand.js's
        // own header: the cascade has no separate "verify" await of its own).
        {
            const host = makeHost('e2e-boundary-resolve');
            const publicationId = 'e2e-boundary-resolve-pub';
            const worldModel = makeWorldModel();
            worldModel.placeAt(publicationId, new Position(0, 0, 0));
            const reference = await placeAndAnnounce(host, 'boundary-resolve-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
            worldModel.knowPublication(new Publication({ id: publicationId, title: 'Boundary Resolve', contentReference: reference }));

            const registry = new WorldDiscoverySourceRegistry();
            const resolveGate = deferred();
            const session = makeGuardedSession({
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: (candidate) => resolveGate.promise.then(() => host.resolveSelectedSnapshotCommand(candidate)),
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: worldModel.resolvePlacementInfo,
                findPublicationById: worldModel.findPublicationById
            });

            const { settled } = session.tick(pos(0, 0, 0));
            await flushMicrotasks();
            session.teardown();
            resolveGate.resolve();
            const results = await settled;
            assert(results.length === 1 && results[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED,
                `3. teardown during resolution+verification -> SUPPRESSED, got ${results[0] && results[0].outcome}`);
            assert(!hasOrigin(registry, originFor(reference.hash, publicationId)), '4. no registration');
            assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '5. materialization still ran after the (real) resolution finally settled');
        }

        // C3 — teardown during materialization.
        {
            const host = makeHost('e2e-boundary-materialize');
            const publicationId = 'e2e-boundary-materialize-pub';
            const worldModel = makeWorldModel();
            worldModel.placeAt(publicationId, new Position(0, 0, 0));
            const reference = await placeAndAnnounce(host, 'boundary-materialize-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
            worldModel.knowPublication(new Publication({ id: publicationId, title: 'Boundary Materialize', contentReference: reference }));

            const registry = new WorldDiscoverySourceRegistry();
            const materializeGate = deferred();
            const session = makeGuardedSession({
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: (resolution) => materializeGate.promise.then(() => host.materializeSelectedSnapshotCommand(resolution)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: worldModel.resolvePlacementInfo,
                findPublicationById: worldModel.findPublicationById
            });

            const { settled } = session.tick(pos(0, 0, 0));
            await flushMicrotasks();
            session.teardown();
            materializeGate.resolve();
            const results = await settled;
            assert(results.length === 1 && results[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED,
                `6. teardown during materialization -> SUPPRESSED, got ${results[0] && results[0].outcome}`);
            assert(!hasOrigin(registry, originFor(reference.hash, publicationId)), '7. no registration');
            assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '8. materialization itself still genuinely completed');
        }

        // C4 — structural: placement is synchronous, so it is never its own
        // distinct teardown window — everything from the moment
        // materialization settles through the registration call it gates
        // runs in ONE uninterrupted synchronous stretch.
        {
            const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
            const materializeAwaitIndex = cascadeSource.indexOf('await this._materializeSelectedSnapshotCommand(resolution);');
            const registerIndex = cascadeSource.indexOf('registerMaterializedSnapshotWorldSource(this._worldDiscoverySourceRegistry');
            assert(materializeAwaitIndex > -1 && registerIndex > materializeAwaitIndex, '9. sanity: both markers present, in order');
            const between = cascadeSource.slice(materializeAwaitIndex + 'await this._materializeSelectedSnapshotCommand(resolution);'.length, registerIndex);
            assert(!/\bawait\b/.test(between), '10. no `await` exists between materialization settling and the registration call — placement, publication lookup, and the session guard all run synchronously in between, so "teardown during placement" is not a distinguishable window from "teardown immediately after materialization"');
        }

        console.log('✓ Section C: teardown during discovery\'s own network query, during resolution+verification, and during materialization all converge on SUPPRESSED once the run reaches its own registration checkpoint; placement itself is confirmed structurally synchronous, so it is never a distinct teardown boundary of its own');
    }

    // ---------------------------------------------------------------
    // Section D — acquisition survival: no material deletion, no rollback,
    // no Publication deletion, no discovery withdrawal, no Arweave deletion.
    // ---------------------------------------------------------------
    {
        const host = makeHost('e2e-survival');
        const publicationId = 'e2e-survival-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'survival-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Survival E2E', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        let removeSourceCalls = 0;
        const originalRemoveSource = registry.removeSource.bind(registry);
        registry.removeSource = (...args) => { removeSourceCalls += 1; return originalRemoveSource(...args); };

        const session = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        session.teardown();

        const result = await session.fullTick(pos(0, 0, 0));
        assert(result.cascadeResults.length === 1 && result.cascadeResults[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, '1. sanity: suppressed');
        assert(!hasOrigin(registry, originFor(reference.hash, publicationId)), '2. no World source exists');
        assert(removeSourceCalls === 0, '3. no compensating removeSource() call of any kind');
        assert(await host.localContentStore.has(new ContentReference({ hash: reference.hash })), '4. material was not deleted');
        assert(worldModel.findPublicationById(publicationId) !== null, '5. Publication was not deleted');
        assert(host.network.events.length === 1, '6. Nostr discovery announcement was not withdrawn');
        assert(host.gateway.network.has(reference.uri.slice('ar://'.length)), '7. Arweave content was not deleted');

        console.log('✓ Section D: a real-machinery suppressed run leaves material, Publication, Nostr announcement, and Arweave content entirely intact — SUPPRESSED withholds only the one World-side registration');
    }

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP NEGATIVE: session-scoped, not subject-scoped.
    // ---------------------------------------------------------------
    {
        const host = makeHost('e2e-scope');
        const publicationId = 'e2e-scope-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'scope-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Scope E2E', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(reference.hash, publicationId);
        const resolveGateA = deferred();

        // Session A: begins resolving the SAME subject, held open.
        const sessionA = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: (candidate) => resolveGateA.promise.then(() => host.resolveSelectedSnapshotCommand(candidate)),
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const { settled: settledA } = sessionA.tick(pos(0, 0, 0));
        await flushMicrotasks();

        // Session A tears down while still blocked on its own resolution.
        sessionA.teardown();

        // Session B: a genuinely live, independent session for the IDENTICAL
        // publicationId/contentHash, running to completion first.
        const sessionB = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const resultB = await sessionB.fullTick(pos(0, 0, 0));
        assert(resultB.cascadeResults.some((r) => r.outcome === SnapshotWorldRegistrationOutcome.REGISTERED),
            '1. session B\'s own live cascade run genuinely REGISTERS the shared subject');
        assert(hasOrigin(registry, origin), '2. the registration exists');

        // NOW session A's held-open resolution finally settles — for the
        // SAME publicationId/contentHash session B already registered.
        // Materialization sees ALREADY_AVAILABLE (session B already stored
        // it), reaching the exact same registration checkpoint.
        resolveGateA.resolve();
        const resultsA = await settledA;
        assert(resultsA.length === 1 && resultsA[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED,
            `3. session A's late completion for the SAME subject is SUPPRESSED — got ${resultsA[0] && resultsA[0].outcome}`);

        // Session B's registration is completely undisturbed.
        assert(hasOrigin(registry, origin), '4. session B\'s own registration still stands, untouched by session A\'s later suppressed completion for the identical subject');
        assert(registry.listSources().length === 1, '5. exactly one source exists — session A\'s late arrival never duplicated, overwrote, or perturbed it');

        console.log('✓ Section E: FLAGSHIP NEGATIVE — the guard is SESSION-scoped, not SUBJECT-scoped: a live session\'s registration for a subject stands even after a different, torn-down session\'s own later completion for that IDENTICAL subject arrives suppressed');
    }

    // ---------------------------------------------------------------
    // Section F — fresh re-entry: a subject a dead session suppressed is
    // never permanently blocked.
    // ---------------------------------------------------------------
    {
        const host = makeHost('e2e-reentry');
        const publicationId = 'e2e-reentry-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'reentry-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        worldModel.knowPublication(new Publication({ id: publicationId, title: 'Reentry E2E', contentReference: reference }));

        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(reference.hash, publicationId);

        const deadSession = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        deadSession.teardown();
        const deadResult = await deadSession.fullTick(pos(0, 0, 0));
        assert(deadResult.cascadeResults[0].outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, 'sanity: the dead session\'s own run is suppressed');
        assert(!hasOrigin(registry, origin), 'sanity: nothing registered yet');

        const freshSession = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const freshResult = await freshSession.fullTick(pos(0, 0, 0));
        assert(freshResult.cascadeResults[0].outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            `1. a fresh session's own independent cascade instance genuinely REGISTERS the SAME subject a dead session suppressed — got ${freshResult.cascadeResults[0].outcome}`);
        assert(hasOrigin(registry, origin), '2. the registration now exists');

        console.log('✓ Section F: A -> SUPPRESSED, B -> REGISTERED — a subject suppressed by a dead session is never permanently blocked; a fresh session performing genuinely new discovery/cascade work still registers it');
    }

    // ---------------------------------------------------------------
    // Section G — concurrent candidates in one session: only work reaching
    // the registration checkpoint while active actually registers.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const aHash = 'concurrent-a-hash', aPub = 'concurrent-a-pub';
        const bHash = 'concurrent-b-hash', bPub = 'concurrent-b-pub';
        const cHash = 'concurrent-c-hash', cPub = 'concurrent-c-pub';
        const bGate = deferred();

        // Each resolution carries its own candidate's contentHash straight
        // through as an extra field, so materialize (which only ever
        // receives the resolution, never the original candidate) can key
        // its own stored outcome off the SAME subject — the identical
        // plumbing 0.9.191's own Section F/Section H use for their own
        // multi-subject tests.
        const session = makeGuardedSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([]),
            resolveSelectedSnapshotCommand: (candidate) => {
                const settle = () => ({ ...resolvedOutcome(), __contentHash: candidate.contentHash });
                return candidate.publicationId === bPub ? bGate.promise.then(settle) : Promise.resolve(settle());
            },
            materializeSelectedSnapshotCommand: (resolution) => Promise.resolve(storedOutcome(resolution.__contentHash)),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: (publicationId) => publicationStub(publicationId),
            retentionRadius: 100
        });

        // A resolves immediately while the session is active.
        const aResult = await session.cascade.processCandidate({ contentHash: aHash, locator: 'ar://a', storage: 'ar', publicationId: aPub });
        assert(aResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `1. candidate A REGISTERED while active — got ${aResult.outcome}`);
        if (aResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
            session.reconciliation.noteAutomaticRegistration({ publicationId: aResult.publicationId, contentHash: aResult.contentHash });
        }

        // B starts while active; the session dies before its own resolution
        // settles.
        const bResultPromise = session.cascade.processCandidate({ contentHash: bHash, locator: 'ar://b', storage: 'ar', publicationId: bPub });
        await flushMicrotasks();
        session.teardown();

        // C is submitted for the first time only after the session died.
        const cResult = await session.cascade.processCandidate({ contentHash: cHash, locator: 'ar://c', storage: 'ar', publicationId: cPub });
        assert(cResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `2. candidate C, submitted after teardown, is SUPPRESSED — got ${cResult.outcome}`);

        bGate.resolve();
        const bResult = await bResultPromise;
        assert(bResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `3. candidate B, in flight at teardown, is SUPPRESSED once it settles — got ${bResult.outcome}`);

        assert(hasOrigin(registry, originFor(aHash, aPub)), '4. only candidate A is registered');
        assert(!hasOrigin(registry, originFor(bHash, bPub)), '5. candidate B never registers');
        assert(!hasOrigin(registry, originFor(cHash, cPub)), '6. candidate C never registers');
        assert(session.reconciliation.watchedAutomaticSubjects().length === 1
            && session.reconciliation.watchedAutomaticSubjects()[0].publicationId === aPub,
            '7. retention watches ONLY the one subject that genuinely registered — B and C were never noted, since noteAutomaticRegistration() is only ever called on REGISTERED');

        console.log('✓ Section G: across several concurrent candidates in one session, only the work that reached the registration checkpoint while genuinely active registers, and retention only ever watches that work');
    }

    // ---------------------------------------------------------------
    // Section H — retention interaction: the guard does not interfere with
    // 0.9.190's own retention behavior in either direction.
    // ---------------------------------------------------------------
    {
        // H1 — live session: REGISTERED -> outside radius -> UNREGISTERED.
        {
            const host = makeHost('e2e-retention-live');
            const publicationId = 'e2e-retention-live-pub';
            const worldModel = makeWorldModel();
            worldModel.placeAt(publicationId, new Position(10, 0, 0));
            const reference = await placeAndAnnounce(host, 'retention-live-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
            worldModel.knowPublication(new Publication({ id: publicationId, title: 'Retention Live', contentReference: reference }));

            const registry = new WorldDiscoverySourceRegistry();
            const session = makeGuardedSession({
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: worldModel.resolvePlacementInfo,
                findPublicationById: worldModel.findPublicationById,
                retentionRadius: 100
            });

            await session.fullTick(pos(0, 0, 0));
            await session.fullTick(pos(0, 0, 0)); // first tick that can evaluate the now-watched subject
            assert(hasOrigin(registry, originFor(reference.hash, publicationId)), '1. registered and retained while near');

            const farTick = await session.fullTick(pos(9000, 0, 0));
            assert(!hasOrigin(registry, originFor(reference.hash, publicationId)), '2. unregistered once the Wanderer moves outside the retention radius — exactly as 0.9.190 always has');
            assert(farTick.removedThisTick.some((r) => r.publicationId === publicationId), '3. this exact tick reports the removal');
        }

        // H2 — dead session: SUPPRESSED -> nothing to reconcile.
        {
            const host = makeHost('e2e-retention-dead');
            const publicationId = 'e2e-retention-dead-pub';
            const worldModel = makeWorldModel();
            worldModel.placeAt(publicationId, new Position(0, 0, 0));
            const reference = await placeAndAnnounce(host, 'retention-dead-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
            worldModel.knowPublication(new Publication({ id: publicationId, title: 'Retention Dead', contentReference: reference }));

            const registry = new WorldDiscoverySourceRegistry();
            const session = makeGuardedSession({
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: worldModel.resolvePlacementInfo,
                findPublicationById: worldModel.findPublicationById,
                retentionRadius: 100
            });
            session.teardown();

            const t1 = await session.fullTick(pos(0, 0, 0));
            const t2 = await session.fullTick(pos(0, 0, 0));
            assert(!hasOrigin(registry, originFor(reference.hash, publicationId)), '4. never registered');
            assert(session.reconciliation.watchedAutomaticSubjects().length === 0, '5. never watched — SUPPRESSED never calls noteAutomaticRegistration()');
            assert(t1.removedThisTick.length === 0 && t2.removedThisTick.length === 0, '6. reconcile() has nothing to do for it on either tick — a no-op, never an error or a phantom removal');
        }

        console.log('✓ Section H: a live-session registration still KEEPs/UNREGISTERs by retention radius exactly as 0.9.190 established, and a dead-session SUPPRESSED subject is simply never watched — reconcile() has nothing to reconcile for it');
    }

    // ---------------------------------------------------------------
    // Section I — manual registration remains completely independent of
    // the automatic cascade's session predicate.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationId = 'manual-e2e-pub';
        const contentHash = 'manual-e2e-hash';
        const publication = publicationStub(publicationId);
        const placement = {
            outcome: SnapshotWorldPlacementOutcome.PLACED,
            publicationId, contentHash,
            position: pos(1, 2, 3),
            reason: null
        };

        // No session, no cascade, no isSessionActive anywhere — exactly
        // OwnPublicationPanel.js's own explicit "Register" button.
        const registration = registerMaterializedSnapshotWorldSource(registry, placement, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. manual registration reaches REGISTERED unconditionally');
        assert(hasOrigin(registry, originFor(contentHash, publicationId)), '2. genuinely landed');

        const bridgeSource = await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(!/isSessionActive/.test(bridgeSource), '3. structural: the shared registration primitive both manual buttons and the automatic cascade call has no isSessionActive concept of its own — the guard lives exclusively one layer up, inside the cascade');

        console.log('✓ Section I: manual registration (and the shared registration primitive it and the cascade both call) is completely independent of any automatic session predicate');
    }

    // ---------------------------------------------------------------
    // Section J — identity isolation: SUPPRESSED alters no identity.
    // ---------------------------------------------------------------
    {
        const host = makeHost('e2e-identity');
        const publicationId = 'e2e-identity-pub';
        const worldModel = makeWorldModel();
        worldModel.placeAt(publicationId, new Position(0, 0, 0));
        const reference = await placeAndAnnounce(host, 'identity-bytes', { publicationId, claimedPosition: { x: 0, y: 0, z: 0 } });
        const publication = new Publication({ id: publicationId, title: 'Identity E2E', contentReference: reference });
        worldModel.knowPublication(publication);

        const registry = new WorldDiscoverySourceRegistry();
        const suppressedSession = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        suppressedSession.teardown();
        const suppressedResult = await suppressedSession.fullTick(pos(0, 0, 0));
        const suppressed = suppressedResult.cascadeResults[0];
        assert(suppressed.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, 'sanity: suppressed');
        assert(suppressed.publicationId === publicationId, '1. publicationId is reported unchanged on the suppressed result itself');
        assert(suppressed.contentHash === reference.hash, '2. contentHash is reported unchanged on the suppressed result itself');

        // Identity of every collaborator, unchanged after suppression.
        assert(worldModel.findPublicationById(publicationId) === publication, '3. the exact same Publication object identity survives');
        assert(host.network.events.length === 1, '4. still exactly one Nostr event — same id/sig, never re-announced or mutated');
        const nostrEventId = host.network.events[0].id;
        const arweaveTxId = reference.uri.slice('ar://'.length);
        assert(host.gateway.network.has(arweaveTxId), '5. the original Arweave transaction id still resolves');

        // A genuinely fresh, live session then registers the SAME subject —
        // its origin, locator/storage, and every identity value are exactly
        // what an ordinary (never-suppressed) registration would produce.
        const freshSession = makeGuardedSession({
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: worldModel.resolvePlacementInfo,
            findPublicationById: worldModel.findPublicationById
        });
        const freshResult = await freshSession.fullTick(pos(0, 0, 0));
        const registered = freshResult.cascadeResults[0];
        assert(registered.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '6. the fresh session genuinely registers');
        assert(registered.publicationId === publicationId && registered.contentHash === reference.hash, '7. identical publicationId/contentHash as the earlier suppressed attempt');
        const source = registry.listSources().find((s) => s.origin === originFor(reference.hash, publicationId));
        assert(source, '8. the registered source exists at the ordinary origin format — no "suppressed-then-registered" variant exists');
        assert(host.network.events.length === 1 && host.network.events[0].id === nostrEventId, '9. still the SAME single Nostr event — no re-announcement occurred as a side effect of the earlier suppression');
        assert(host.gateway.network.has(arweaveTxId), '10. still the SAME Arweave transaction — no re-upload occurred');

        console.log('✓ Section J: SUPPRESSED alters no identity whatsoever — publicationId, contentHash, the Publication object, the Nostr event, the Arweave transaction, and the ordinary World origin format are all exactly what a never-suppressed registration would produce');
    }

    // ---------------------------------------------------------------
    // Section K — idempotency: a suppressed subject does not become
    // registered merely because it is observed again.
    // ---------------------------------------------------------------
    {
        const contentHash = 'idempotent-hash';
        const publicationId = 'idempotent-pub';
        const candidate = { contentHash, locator: 'ar://idempotent', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        let resolveCalls = 0, materializeCalls = 0;
        let sessionActive = false;

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve(resolvedOutcome()); },
            materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve(storedOutcome(contentHash)); },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => sessionActive
        });

        const first = await cascade.processCandidate(candidate);
        assert(first.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, 'sanity: first observation is suppressed');
        assert(resolveCalls === 1 && materializeCalls === 1, 'sanity: resolved/materialized exactly once');

        // Observed again through the SAME cascade instance, still dead.
        const second = await cascade.processCandidate(candidate);
        assert(second.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, '1. observing the same key again returns the memoized SUPPRESSED result');
        assert(resolveCalls === 1 && materializeCalls === 1, '2. no re-run of resolve/materialize — the per-key idempotency map short-circuits entirely');
        assert(!hasOrigin(registry, originFor(contentHash, publicationId)), '3. still not registered');

        // Pathological: the SAME cascade instance's own isSessionActive
        // closure is flipped back to true (production never does this —
        // WorldView.js constructs a brand-new cascade per mount — but the
        // idempotency map's own terminal-memoization guarantee should hold
        // even here).
        sessionActive = true;
        const third = await cascade.processCandidate(candidate);
        assert(third.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `4. even with isSessionActive() now returning true, the SAME cascade instance's memoized SUPPRESSED result for this key is never re-evaluated — got ${third.outcome}`);
        assert(resolveCalls === 1 && materializeCalls === 1, '5. still no re-run — SUPPRESSED is exactly as terminal and memoized as REGISTERED or any other outcome');
        assert(!hasOrigin(registry, originFor(contentHash, publicationId)), '6. still never registered by this instance');

        // Only a genuinely NEW cascade instance re-arms.
        const newCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome()),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => true
        });
        const fourth = await newCascade.processCandidate(candidate);
        assert(fourth.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `7. only a genuinely NEW cascade instance re-arms automatic retention for this subject — got ${fourth.outcome}`);
        assert(hasOrigin(registry, originFor(contentHash, publicationId)), '8. genuinely registered by the new instance');

        console.log('✓ Section K: a suppressed subject never becomes registered merely by being observed again — not by the same cascade instance, and not even if that same instance\'s own isSessionActive predicate is later flipped back to true; only a genuinely new cascade instance re-arms automatic retention');
    }

    // ---------------------------------------------------------------
    // Section L — structural sweep.
    // ---------------------------------------------------------------
    {
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');

        const checkpointOccurrences = cascadeSource.split('this._isSessionActive()').length - 1;
        assert(checkpointOccurrences === 1, `1. exactly one isSessionActive() checkpoint exists in the cascade — got ${checkpointOccurrences}`);

        const guardIndex = cascadeSource.indexOf('!this._isSessionActive()');
        const registerIndex = cascadeSource.indexOf('registerMaterializedSnapshotWorldSource(this._worldDiscoverySourceRegistry');
        assert(guardIndex > -1 && registerIndex > guardIndex, '2. sanity: guard precedes the register call');
        assert(!/\bawait\b/.test(cascadeSource.slice(guardIndex, registerIndex)), '3. no await sits between the checkpoint and the registration call it gates');

        assert(!/AbortController|AbortSignal|CancellationToken/i.test(cascadeSource), '4. no cancellation machinery of any kind');
        for (const lifecycleMethod of ['destroy(', 'dispose(', 'cancel(', 'abort(']) {
            assert(!cascadeSource.includes(lifecycleMethod), `5. no "${lifecycleMethod}" method exists on the cascade`);
        }
        assert(!/setTimeout|setInterval/.test(cascadeSource), '6. no new timer of any kind');

        const outcomeKeys = Object.keys(AutomaticSnapshotEncounterCascadeOutcome);
        assert(outcomeKeys.length === 2 && outcomeKeys.includes('INELIGIBLE') && outcomeKeys.includes('SUPPRESSED'),
            `7. AutomaticSnapshotEncounterCascadeOutcome carries exactly two values total — got ${JSON.stringify(outcomeKeys)}`);
        const outcomeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascadeOutcome.js');
        for (const forbidden of ['CANCELLED', 'CANCELED', 'ABANDONED', 'EXPIRED', 'ORPHANED', 'DEAD', 'STALE']) {
            assert(!outcomeSource.includes(forbidden), `8. no "${forbidden}" lifecycle value exists`);
        }

        const bridgeSource = await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(!/isSessionActive/.test(bridgeSource), '9. manual registration\'s own primitive still has no isSessionActive concept of any kind');

        const registryClassSource = await codeOnlySource('application/WorldDiscoverySourceRegistry.js');
        assert(!/isSessionActive/.test(registryClassSource), '10. the shared World registry itself has no isSessionActive concept either — the guard lives exclusively inside the automatic cascade');

        console.log('✓ Section L: exactly one isSessionActive() checkpoint, no await between it and registration, no cancellation machinery, no new timer, exactly two cascade outcome values with no new lifecycle vocabulary, and manual registration/the shared registry both remain completely untouched');
    }

    console.log('\n✅ All Automatic Snapshot Session-Lifetime Guard E2E Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
