import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalWorldEncounterPublicationAdmissionLog } from '../application/worldEncounter/LocalWorldEncounterPublicationAdmissionLog.js';
import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { mainFiles } from './support/SourceFileGroups.js';

// 0.9.651 — Persist World-Encounter Publication Admissions.
//
// Tests the production reconstruction class and its ui/main.js wiring —
// the World-Encounter counterpart to
// tests/ReconstructPublicationDiscoveryUseCase.js's own Section A/D/E/F.
//
//   Section A — session-boundary flagship: a World-Encounter admission in
//               "session 1" is discoverable again in "session 2" after
//               reconstruction, with its PlacementRecord untouched.
//   Section B — idempotent: a second execute() against the same,
//               already-populated provider reports 0, never duplicates.
//   Section C — one bad/unreadable entry never suppresses another valid one.
//   Section D — no network access of any kind — a discoveryProvider whose
//               only two required methods are add()/findById() is
//               sufficient; nothing resembling a resolver/coordinator is
//               ever touched.
//   Section E — placement independence.
//   Section F — constructor contract.
//   Section G — ui/main.js composition wiring.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function throwsFn(fn) {
    try { fn(); return false; } catch { return true; }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePublication({ id, documentId = id, title = 'World Encountered Work', author = 'someone-else', contentHash = `hash-${id}` }) {
    return new Publication({
        id, documentId, title, author,
        contentReference: new ContentReference({ hash: contentHash, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 42 })
    });
}

async function run() {
    console.log('Running ReconstructWorldEncounterPublicationDiscoveryUseCase tests...\n');

    // ===============================================================
    // Section A — Session-boundary flagship.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('Alice-651-A');

        // SESSION 1: WorldEncounterCanvas admits -> durable log -> place.
        const log1 = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const provider1 = new DecentralizedPublicationDiscoveryProvider();
        const publication = makePublication({ id: 'a-pub', documentId: 'a-doc' });
        log1.add(publication);
        new ReconstructWorldEncounterPublicationDiscoveryUseCase(log1, provider1).execute();
        assert(provider1.findById('a-pub') !== null, '1. setup sanity: session 1 discovers its own just-admitted Publication.');

        const spatialIndexProvider1 = new LocalSpatialIndexProvider(storage);
        const placementRegistry1 = new LocalPlacementRegistry(storage, spatialIndexProvider1);
        new PlacePublicationUseCase(spatialIndexProvider1, provider1, { execute() { throw new Error('no document'); } }, null, placementRegistry1, alice)
            .execute(publication.id, { x: 5, y: 0, z: 5 });
        assert(placementRegistry1.findByPublicationId(publication.id).length === 1, '2. setup sanity: session 1 genuinely places the Publication.');

        // SESSION 2: fresh instances over the SAME durable storage.
        const log2 = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const provider2 = new DecentralizedPublicationDiscoveryProvider();
        assert(provider2.findById('a-pub') === null, '3. before reconstruction, a fresh provider has never heard of this Publication.');

        const { reconstructed } = new ReconstructWorldEncounterPublicationDiscoveryUseCase(log2, provider2).execute();
        assert(reconstructed === 1, '4. execute() reports exactly one Publication reconstructed.');
        assert(provider2.findById('a-pub') !== null, '5. *** THE FIX *** after reconstruction, the Publication is discoverable again in the fresh provider.');

        const placementRegistry2 = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        const recordsAfter = placementRegistry2.findByPublicationId('a-pub');
        assert(recordsAfter.length === 1, '6. the original PlacementRecord still exists — exactly one, never zero, never duplicated.');
        assert(recordsAfter[0].position.x === 5, '7. ...at its own original position, untouched by reconstruction.');

        console.log('✓ Section A: a World-Encounter admission durably survives a session boundary, and its original PlacementRecord is exactly as it was.');
    }

    // ===============================================================
    // Section B — idempotent re-execution.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        log.add(makePublication({ id: 'b-pub' }));
        const provider = new DecentralizedPublicationDiscoveryProvider();

        const first = new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, provider).execute();
        assert(first.reconstructed === 1, '1. first execute() reconstructs the one entry.');
        const second = new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, provider).execute();
        assert(second.reconstructed === 0, '2. a second execute() against the SAME, already-populated provider reports 0 — Reconstruct(Reconstruct(S)) = Reconstruct(S).');
        assert(provider.list().length === 1, '3. the provider still holds exactly one entry — never doubled.');

        console.log('✓ Section B: repeated reconstruction against the same provider is idempotent — no duplicate admission.');
    }

    // ===============================================================
    // Section C — one bad entry never suppresses another valid one.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        log.add(makePublication({ id: 'c-good', documentId: 'c-doc-good' }));

        // Corrupt the durable record directly on disk, as a hostile or
        // simply damaged localStorage entry would — malformed JSON shape
        // for one entry must never prevent the valid one from reconstructing.
        const all = storage.load('world-encounter-publication-admission-log:entries');
        all.push({ publication: { id: 'c-malformed' }, admittedAt: new Date().toISOString() });
        storage.save('world-encounter-publication-admission-log:entries', all);

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { reconstructed } = new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, provider).execute();

        assert(provider.findById('c-good') !== null, '1. the valid entry reconstructs.');
        // A malformed record (missing documentId/contentReference) still
        // produces SOME Publication instance via Publication.fromJSON()
        // (it has no validation of its own — see that class's header) —
        // this section's own point is narrower and still holds: the good
        // entry is never suppressed by whatever comes after or before it.
        assert(reconstructed >= 1, '2. at least the valid entry is reconstructed, regardless of what else was on file.');

        console.log('✓ Section C: a malformed neighboring entry never suppresses an independently valid one.');
    }

    // ===============================================================
    // Section D — no network access, no resolver/coordinator dependency.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        log.add(makePublication({ id: 'd-pub' }));

        // A minimal discoveryProvider stand-in exposing ONLY add()/findById()
        // — proof this class needs nothing resembling a resolver, a
        // ContentStore, or a peer/coordinator to do its job.
        const calls = [];
        const minimalProvider = {
            _items: [],
            add(p) { calls.push('add'); this._items.push(p); },
            findById(id) { calls.push('findById'); return this._items.find((p) => p.id === id) || null; }
        };

        const { reconstructed } = new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, minimalProvider).execute();
        assert(reconstructed === 1, '1. reconstruction succeeds against a minimal add()/findById() provider.');
        assert(calls.includes('add') && calls.includes('findById'), '2. only add()/findById() were ever called — nothing resembling network retrieval.');

        console.log('✓ Section D: reconstruction requires nothing beyond a durable log and a plain add()/findById() discovery provider — no resolver, no ContentStore, no network access.');
    }

    // ===============================================================
    // Section E — placement independence.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const ivan = new LocalIdentityProvider(storage);
        ivan.login('Ivan-651-E');
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        log.add(makePublication({ id: 'e-placed', documentId: 'e-placed-doc' }));
        log.add(makePublication({ id: 'e-unplaced', documentId: 'e-unplaced-doc' }));

        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
        const bootstrapProvider = new DecentralizedPublicationDiscoveryProvider();
        new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, bootstrapProvider).execute();
        new PlacePublicationUseCase(spatialIndexProvider, bootstrapProvider, { execute() { throw new Error('x'); } }, null, placementRegistry, ivan)
            .execute('e-placed', { x: 4, y: 0, z: 4 });

        const recordCountBefore = storage.list().filter((k) => k.startsWith('placement-record:')).length;

        const provider = new DecentralizedPublicationDiscoveryProvider();
        new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, provider).execute();

        const recordCountAfter = storage.list().filter((k) => k.startsWith('placement-record:')).length;
        assert(recordCountAfter === recordCountBefore, '1. reconstruction creates zero new placement-record keys.');

        const placementRegistryAfter = new LocalPlacementRegistry(storage, new LocalSpatialIndexProvider(storage));
        assert(placementRegistryAfter.findByPublicationId('e-placed').length === 1, '2. the placed Publication remains placed, exactly once.');
        assert(placementRegistryAfter.findByPublicationId('e-unplaced').length === 0, '3. the unplaced Publication remains unplaced.');
        assert(provider.findById('e-placed') !== null && provider.findById('e-unplaced') !== null,
            '4. both are discoverable regardless of placement — discovery and placement stay independent facts.');

        console.log('✓ Section E: reconstruction never creates, modifies, or infers a placement — a placed and an unplaced admission both reconstruct, independent of placement.');
    }

    // ===============================================================
    // Section F — constructor contract.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const provider = new DecentralizedPublicationDiscoveryProvider();

        assert(throwsFn(() => new ReconstructWorldEncounterPublicationDiscoveryUseCase(null, provider)), '1. an admissionLog is required.');
        assert(throwsFn(() => new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, null)), '2. a discoveryProvider is required.');
        assert(throwsFn(() => new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, { add() {} })), '3. a discoveryProvider lacking findById() is rejected.');
        assert(!throwsFn(() => new ReconstructWorldEncounterPublicationDiscoveryUseCase(log, provider)), '4. a well-formed (log, provider) pair is accepted.');

        console.log('✓ Section F: both required collaborators are enforced.');
    }

    // ===============================================================
    // Section G — ui/main.js composition wiring.
    // ===============================================================
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n');

        assert(mainSource.includes("import { CreateWorldEncounterPublicationAdmissionLogUseCase } from '../application/worldEncounter/CreateWorldEncounterPublicationAdmissionLogUseCase.js';"),
            '1. ui/main.js imports the composition-root use case.');
        assert(mainSource.includes("import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';"),
            '2. ui/main.js imports the production reconstruction use case.');

        const providerConstructionIndex = mainSource.indexOf('const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();');
        const logConstructionIndex = mainSource.indexOf('new CreateWorldEncounterPublicationAdmissionLogUseCase().execute();');
        const reconstructIndex = mainSource.indexOf('new ReconstructWorldEncounterPublicationDiscoveryUseCase(');
        assert(providerConstructionIndex !== -1 && logConstructionIndex > providerConstructionIndex,
            '3. the admission log is constructed after the one provider instance this replica ever constructs.');
        assert(reconstructIndex > logConstructionIndex, '4. reconstruction runs after both the provider and the admission log exist.');

        const wiringWindow = mainSource.slice(logConstructionIndex, reconstructIndex + 300);
        assert(/new ReconstructWorldEncounterPublicationDiscoveryUseCase\(\s*worldEncounterPublicationAdmissionLog, decentralizedPublicationDiscoveryProvider\s*\)\.execute\(\);/.test(wiringWindow),
            '5. reconstruction reuses the SAME worldEncounterPublicationAdmissionLog/decentralizedPublicationDiscoveryProvider — never a second log or provider.');

        const provideIndex = mainSource.indexOf("app.provide('worldEncounterPublicationAdmissionLog', worldEncounterPublicationAdmissionLog);");
        const mountIndex = mainSource.indexOf("app.mount('#app');");
        assert(provideIndex !== -1 && reconstructIndex < provideIndex && provideIndex < mountIndex,
            '6. reconstruction runs before app.provide() hands the log out, and well before the app mounts.');

        console.log('✓ Section G: ui/main.js wires reconstruction right after both the durable log and the discovery provider it populates exist, awaited before app.provide() and app.mount().');
    }

    console.log('\nAll ReconstructWorldEncounterPublicationDiscoveryUseCase tests passed.');
}

run().catch((error) => {
    console.error('✗ ReconstructWorldEncounterPublicationDiscoveryUseCase tests failed:', error.message);
    console.error(error);
    process.exitCode = 1;
});
