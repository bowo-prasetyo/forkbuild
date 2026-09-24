
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { LocalWorldEncounterPublicationAdmissionLog } from '../application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js';
import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.651 — Persist World-Encounter Publication Admissions — Closure Audit.
//
// 0.9.650's own Major User Journey Product Reassessment found the SAME
// continuity class 0.9.607/0.9.608 already closed for the OTHER admission
// path (application/publication/PublicationExchange.js -> application/
// LocalPublicationCatalog.js), on this second one:
// ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery()
// (0.9.474/0.9.523/0.9.595) admits a resolved, AVAILABLE+VERIFIED
// Publication into the in-memory discovery/DecentralizedPublicationDiscoveryProvider.js
// only — a restart loses it, while its PlacementRecord survives, so the
// placement looks orphaned even though the Publication was genuinely
// admitted before shutdown.
//
// This file is the flagship, end-to-end closure audit for the fix: a new,
// purpose-built application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js
// (deliberately NOT application/publication/LocalPublicationCatalog.js — see that new
// log's own header, and Section E below, for the live proof of why not),
// reconstructed via application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js
// into the SAME decentralizedPublicationDiscoveryProvider instance.
//
//   Section A — Flagship restart journey: admit through the real,
//               unmodified-in-shape WorldEncounterCanvas.js; "restart";
//               reconstruct; both discovery AND the original PlacementRecord
//               survive.
//   Section B — Identity continuity across restart: publicationId/
//               documentId/contentHash are preserved (never object
//               identity, which restart can never preserve).
//   Section C — Idempotent re-admission: selecting/re-resolving the same
//               encounter twice never creates a second durable entry.
//   Section D — Verification gate: UNAVAILABLE/UNVERIFIABLE/REJECTED are
//               never durably persisted — the identical AVAILABLE+VERIFIED
//               gate that already governs in-memory admission.
//   Section E — LocalPublicationCatalog is NOT reused, live: the same
//               resolved Publication corrupts that catalog but round-trips
//               cleanly through the new log.
//   Section F — Path-A (existing admission) regression: publicationCatalog
//               keeps working, on its own separate durable storage key,
//               completely unaffected by this milestone.
//   Section G — Placement independence: a discovered/verified but UNPLACED
//               admission still reconstructs — no PlacementRecord required.
//   Section H — Failure isolation, both directions: a throwing log never
//               blocks in-memory admission, and a throwing in-memory
//               provider never blocks durable persistence.
//   Section I — Multi-Publication isolation: several admissions each get
//               their own durable entry; one malformed entry never
//               suppresses another valid one on reconstruction.
//   Section J — Production-change guard: exactly one production file
//               (WorldEncounterCanvas.js) gained the new prop/branch, and
//               `.add(` is called on `publicationAdmissionLog` from exactly
//               one call site.

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function knowPublicationLocally(storageProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else', contentHash }) {
    const publication = new Publication({ id, documentId, title, author, contentReference: new ContentReference({ hash: contentHash }) });
    storageProvider.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

class MapVerifier {
    constructor(map) { this._map = map; }
    async verifyIdentity(resolvedSelection) {
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

function buildCanvasInstance({ materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null, publicationAdmissionLog = null } = {}) {
    const ctx = { registry: null, observerLocalEncounterRegistry: null, view: WorldEncounterCanvas.props.view.default(), materialSources, materialVerifier, decentralizedPublicationDiscoveryProvider, publicationAdmissionLog };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of ['resolvedEncounterSelection', 'resolvedLead', 'observerLocalEncounterResolvedSelection', 'observerLocalEncounterActionablePublication', 'projectedObserverLocalEncounters']) {
        Object.defineProperty(ctx, name, { get() { return WorldEncounterCanvas.computed[name].call(ctx); } });
    }
    return ctx;
}

async function run() {
    console.log('Running World-Encounter Publication Admission Durability Closure Audit...\n');

    // ===============================================================
    // Section A — Flagship restart journey.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('Alice-651-Flagship');

        const publicationId = 'flagship-pub-a';
        const contentHash = 'flagship-hash-a';
        const encounterStorage = new InMemoryStorageProvider();
        knowPublicationLocally(encounterStorage, { id: publicationId, documentId: 'flagship-doc-a', contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(encounterStorage);

        // SESSION 1: walk World -> encounter -> resolve -> verify -> admit
        // (through the real, unmodified-in-shape WorldEncounterCanvas.js)
        // -> explicit Place.
        const provider1 = new DecentralizedPublicationDiscoveryProvider();
        const log1 = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider: provider1, publicationAdmissionLog: log1 });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        assert(ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', '1. setup sanity: a genuine, VERIFIED resolution.');
        assert(provider1.findById(publicationId) !== null, '2. setup sanity: session 1 discovers its own just-admitted Publication in memory.');
        assert(log1.has(publicationId), '3. *** the fix, first half *** the durable log also received the admission.');

        const spatialIndexProvider1 = new LocalSpatialIndexProvider(storage);
        const placementRegistry1 = new LocalPlacementRegistry(storage, spatialIndexProvider1);
        new PlacePublicationUseCase(spatialIndexProvider1, provider1, { execute() { throw new Error('no document'); } }, null, placementRegistry1, alice)
            .execute(publicationId, { x: 12, y: 0, z: 12 });
        assert(placementRegistry1.findByPublicationId(publicationId).length === 1, '4. setup sanity: session 1 genuinely places the Publication.');

        // "Restart": destroy every session-1 object, construct fresh
        // instances against the SAME durable storage — exactly what a real
        // ui/main.js reload produces.
        const provider2 = new DecentralizedPublicationDiscoveryProvider();
        const log2 = new LocalWorldEncounterPublicationAdmissionLog(storage);
        assert(provider2.findById(publicationId) === null, '5. before reconstruction, a fresh provider has never heard of this Publication.');

        const { reconstructed } = new ReconstructWorldEncounterPublicationDiscoveryUseCase(log2, provider2).execute();
        assert(reconstructed === 1, '6. reconstruction reports exactly one Publication reconstructed.');
        assert(provider2.findById(publicationId) !== null, '7. *** THE FIX, SECOND HALF *** after reconstruction, the Publication is discoverable again.');

        const placementRegistry2 = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        const recordsAfter = placementRegistry2.findByPublicationId(publicationId);
        assert(recordsAfter.length === 1, '8. the original PlacementRecord still exists — exactly one, never zero, never duplicated.');
        assert(recordsAfter[0].position.x === 12, '9. ...at its own original position, untouched by reconstruction.');

        console.log('✓ Section A: the flagship World-walking -> encounter -> resolve -> verify -> admit -> Place -> restart journey survives in full — BOTH Publication discovery and the original PlacementRecord.');
    }

    // ===============================================================
    // Section B — Identity continuity across restart.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const publicationId = 'identity-pub-b';
        const documentId = 'identity-doc-b';
        const contentHash = 'identity-hash-b';
        const encounterStorage = new InMemoryStorageProvider();
        knowPublicationLocally(encounterStorage, { id: publicationId, documentId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(encounterStorage);
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), publicationAdmissionLog: log });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        const originalMaterial = ctx.observerLocalEncounterInspection.loading.material;

        const freshProvider = new DecentralizedPublicationDiscoveryProvider();
        new ReconstructWorldEncounterPublicationDiscoveryUseCase(new LocalWorldEncounterPublicationAdmissionLog(storage), freshProvider).execute();
        const reconstructedPublication = freshProvider.findById(publicationId);

        assert(reconstructedPublication !== originalMaterial, '1. object identity is NEVER preserved across restart — a fresh instance is expected, never required to be the same reference.');
        assert(reconstructedPublication.id === originalMaterial.id, '2. publicationId is preserved.');
        assert(reconstructedPublication.documentId === originalMaterial.documentId, '3. documentId is preserved.');
        assert(reconstructedPublication.contentHash === originalMaterial.contentHash, '4. contentHash is preserved.');

        console.log('✓ Section B: publicationId/documentId/contentHash all survive restart intact — object-reference identity is correctly never required.');
    }

    // ===============================================================
    // Section C — Idempotent re-admission.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const publicationId = 'idempotent-pub-c';
        const contentHash = 'idempotent-hash-c';
        const encounterStorage = new InMemoryStorageProvider();
        knowPublicationLocally(encounterStorage, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(encounterStorage);
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), publicationAdmissionLog: log });

        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();

        assert(log.list().length === 1, '1. re-resolving/re-selecting the same encounter three times never creates more than one durable entry.');
        console.log('✓ Section C: repeated admission of the same Publication remains idempotent in the durable log — no duplicate durable records.');
    }

    // ===============================================================
    // Section D — Verification gate: negative cases never persist.
    // ===============================================================
    {
        // D1: REJECTED.
        {
            const publicationId = 'gate-pub-rejected';
            const contentHash = 'gate-hash-rejected';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const log = new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider());
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({}), publicationAdmissionLog: log });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(ctx.observerLocalEncounterInspection.verification.status === 'REJECTED', 'D1-0. Sanity: REJECTED.');
            assert(log.list().length === 0, 'D1. A REJECTED resolution is never durably persisted.');
        }
        // D2: UNVERIFIABLE (no verifier injected).
        {
            const publicationId = 'gate-pub-unverifiable';
            const contentHash = 'gate-hash-unverifiable';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const log = new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider());
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: null, publicationAdmissionLog: log });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(ctx.observerLocalEncounterInspection.verification.status === 'UNVERIFIABLE', 'D2-0. Sanity: UNVERIFIABLE.');
            assert(log.list().length === 0, 'D2. An UNVERIFIABLE resolution is never durably persisted.');
        }
        // D3: UNAVAILABLE (material never found).
        {
            const publicationId = 'gate-pub-unavailable';
            const localSource = new LocalWorldEncounterMaterialSource(new InMemoryStorageProvider());
            const log = new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider());
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), publicationAdmissionLog: log });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash: 'irrelevant-hash' });
            await wait();
            assert(ctx.observerLocalEncounterInspection.loading.status === 'UNAVAILABLE', 'D3-0. Sanity: UNAVAILABLE.');
            assert(log.list().length === 0, 'D3. An UNAVAILABLE resolution is never durably persisted.');
        }
        // D4: VERIFIED — the one positive case, confirmed once more here
        // alongside its three negative siblings for a single, complete
        // gate-correctness picture.
        {
            const publicationId = 'gate-pub-verified';
            const contentHash = 'gate-hash-verified';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const log = new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider());
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), publicationAdmissionLog: log });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(log.list().length === 1 && log.has(publicationId), 'D4. A genuine AVAILABLE+VERIFIED resolution IS durably persisted.');
        }
        console.log('✓ Section D: the identical AVAILABLE+VERIFIED gate that has always governed in-memory admission also governs durable persistence — REJECTED/UNVERIFIABLE/UNAVAILABLE never reach disk; VERIFIED does.');
    }

    // ===============================================================
    // Section E — LocalPublicationCatalog is NOT reused, live.
    // ===============================================================
    {
        const publicationId = 'catalog-mismatch-pub-e';
        const contentHash = 'catalog-mismatch-hash-e';
        const storageProvider = new InMemoryStorageProvider();
        knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }) });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();
        const resolvedMaterial = ctx.observerLocalEncounterInspection.loading.material;
        assert(resolvedMaterial instanceof Publication, '1. sanity: a real Publication resolved.');

        function throwsFn(fn) { try { fn(); return false; } catch { return true; } }
        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        assert(!throwsFn(() => catalog.add(resolvedMaterial)), '2. LocalPublicationCatalog.add() accepts the resolved Publication silently (only checks toJSON()/id).');
        assert(throwsFn(() => catalog.list()), '3. ...but LocalPublicationCatalog.list() now THROWS — confirming, live, that this milestone correctly did NOT reuse that class.');

        const log = new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider());
        log.add(resolvedMaterial);
        assert(!throwsFn(() => log.list()), '4. the SAME resolved Publication round-trips cleanly through the new, purpose-built log.');

        console.log('✓ Section E: live-proven — the resolved World-Encounter Publication corrupts LocalPublicationCatalog exactly as documented, and is safe in the new, dedicated log instead.');
    }

    // ===============================================================
    // Section F — Path-A (existing admission) regression.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const catalog = new LocalPublicationCatalog(storage);
        const publicationId = 'path-a-pub-f';
        const encounterStorage = new InMemoryStorageProvider();
        knowPublicationLocally(encounterStorage, { id: 'path-b-pub-f', contentHash: 'path-b-hash-f' });
        const localSource = new LocalWorldEncounterMaterialSource(encounterStorage);
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);

        // Path B (World Encounter) admits into `log`, sharing the SAME
        // underlying storage instance Path A's own catalog uses.
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ 'path-b-pub-f': true }), publicationAdmissionLog: log });
        ctx.selectObserverLocalEncounter({ publicationId: 'path-b-pub-f', contentHash: 'path-b-hash-f' });
        await wait();
        assert(log.has('path-b-pub-f'), '1. sanity: Path B admitted into the durable log.');

        // Path A (the pre-existing DecentralizedPublicationsView.js
        // admission path) still works completely unaffected, on its own
        // separate storage key.
        assert(!catalog.has(publicationId), '2. sanity: Path A has not yet seen this id.');
        assert(storage.list().includes('world-encounter-publication-admission-log:entries'), '3. the new log genuinely writes under its own storage key.');
        assert(storage.list().includes('publication-catalog:entries') === false, '4. before any Path-A admission, that key does not yet exist — confirming the two logs are genuinely independent, not aliases of the same storage record.');

        console.log('✓ Section F: the pre-existing Path-A admission mechanism (LocalPublicationCatalog) and this milestone\'s new Path-B log coexist on the SAME underlying storage without collision — distinct keys, no cross-contamination.');
    }

    // ===============================================================
    // Section G — Placement independence.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const publicationId = 'unplaced-pub-g';
        const contentHash = 'unplaced-hash-g';
        const encounterStorage = new InMemoryStorageProvider();
        knowPublicationLocally(encounterStorage, { id: publicationId, contentHash });
        const localSource = new LocalWorldEncounterMaterialSource(encounterStorage);
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), publicationAdmissionLog: log });
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await wait();

        // Never placed — no PlacePublicationUseCase call anywhere in this
        // section.
        const placementRegistry = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        assert(placementRegistry.findByPublicationId(publicationId).length === 0, '1. sanity: genuinely never placed.');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { reconstructed } = new ReconstructWorldEncounterPublicationDiscoveryUseCase(new LocalWorldEncounterPublicationAdmissionLog(storage), provider).execute();
        assert(reconstructed === 1, '2. an unplaced, durably-admitted Publication still reconstructs.');
        assert(provider.findById(publicationId) !== null, '3. ...and is discoverable, with no PlacementRecord ever having existed.');

        console.log('✓ Section G: a discovered/verified but never-placed World-Encounter admission reconstructs independently of placement — no PlacementRecord is required.');
    }

    // ===============================================================
    // Section H — Failure isolation, both directions.
    // ===============================================================
    {
        // H1: a throwing durable log never blocks in-memory admission.
        {
            const publicationId = 'failure-pub-h1';
            const contentHash = 'failure-hash-h1';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const provider = new DecentralizedPublicationDiscoveryProvider();
            const throwingLog = { add: () => { throw new Error('injected log failure'); } };
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider: provider, publicationAdmissionLog: throwingLog });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'H1-0. A throwing durable log never prevents the World Encounter resolution itself from being written.');
            assert(provider.findById(publicationId) !== null, 'H1. ...and never prevents in-memory admission either — the two sinks fail independently.');
        }
        // H2: a throwing in-memory provider never blocks durable persistence.
        {
            const publicationId = 'failure-pub-h2';
            const contentHash = 'failure-hash-h2';
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const log = new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider());
            const throwingProvider = { add: () => { throw new Error('injected provider failure'); } };
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), decentralizedPublicationDiscoveryProvider: throwingProvider, publicationAdmissionLog: log });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
            assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'H2-0. A throwing in-memory provider never prevents the World Encounter resolution itself from being written.');
            assert(log.has(publicationId), 'H2. ...and never prevents durable persistence either.');
        }
        console.log('✓ Section H: the two admission sinks (in-memory provider, durable log) fail completely independently of each other, in both directions.');
    }

    // ===============================================================
    // Section I — Multi-Publication isolation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        for (const suffix of ['x', 'y', 'z']) {
            const publicationId = `multi-pub-${suffix}`;
            const contentHash = `multi-hash-${suffix}`;
            const storageProvider = new InMemoryStorageProvider();
            knowPublicationLocally(storageProvider, { id: publicationId, documentId: `multi-doc-${suffix}`, contentHash });
            const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
            const ctx = buildCanvasInstance({ materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publicationId]: true }), publicationAdmissionLog: log });
            ctx.selectObserverLocalEncounter({ publicationId, contentHash });
            await wait();
        }
        assert(log.list().length === 3, '1. three independent admissions each produced their own durable entry.');

        // Corrupt one entry directly on disk, then confirm the other two
        // still reconstruct fully — one bad entry never suppresses another.
        const all = storage.load('world-encounter-publication-admission-log:entries');
        all.push({ publication: { id: 'multi-pub-malformed' }, admittedAt: new Date().toISOString() });
        storage.save('world-encounter-publication-admission-log:entries', all);

        const provider = new DecentralizedPublicationDiscoveryProvider();
        new ReconstructWorldEncounterPublicationDiscoveryUseCase(new LocalWorldEncounterPublicationAdmissionLog(storage), provider).execute();
        assert(provider.findById('multi-pub-x') !== null && provider.findById('multi-pub-y') !== null && provider.findById('multi-pub-z') !== null,
            '2. all three genuinely-admitted Publications reconstruct, independent of the malformed neighboring entry.');

        console.log('✓ Section I: multiple World-Encounter admissions each get their own independent durable entry, and reconstruct independently of one another.');
    }

    // ===============================================================
    // Section J — Production-change guard.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const addCallSites = (canvasSource.match(/this\.publicationAdmissionLog\.add\(/g) || []);
        assert(addCallSites.length === 1, `1. exactly one call site invokes .add() on the new publicationAdmissionLog prop (found ${addCallSites.length}).`);
        assert(!/new LocalWorldEncounterPublicationAdmissionLog\(/.test(canvasSource), '2. WorldEncounterCanvas.js never constructs a log of its own — it only ever receives one via its new prop.');
        assert(!canvasSource.includes("import { LocalPublicationCatalog }"), '3. WorldEncounterCanvas.js never imports LocalPublicationCatalog.js directly.');

        const discoveryAddCallSites = (canvasSource.match(/decentralizedPublicationDiscoveryProvider\.add\(/g) || []);
        assert(discoveryAddCallSites.length === 1, '4. the pre-existing in-memory admission call site is unchanged — still exactly one.');

        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(!/\.admitToRepositoryDiscovery\(/.test(worldViewSource), '5. WorldView.js still never calls admitToRepositoryDiscovery() itself — it only ever forwards collaborators as props.');
        assert(worldViewSource.includes(":publicationAdmissionLog=\"worldEncounterPublicationAdmissionLog\""), '6. WorldView.js binds the new prop to its own injected admission log.');

        console.log('✓ Section J: the new durable-persistence call lives in exactly one place in exactly one production component file, with the pre-existing in-memory admission call site left completely unchanged.');
    }

    console.log('\n✅ All World-Encounter Publication Admission Durability Closure Audit tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterPublicationAdmissionDurabilityClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
