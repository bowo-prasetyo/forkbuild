import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import {
    LocalPublicationSnapshotPlacementStore,
    PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY
} from '../application/LocalPublicationSnapshotPlacementStore.js';
import {
    RestorePublicationSnapshotPlacementCatalogUseCase,
    PlacementRestorationRejectionReason
} from '../application/RestorePublicationSnapshotPlacementCatalogUseCase.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.21 — Persistent Snapshot Placement Catalog & Restart Recovery.
//
//   Section A: LocalPublicationSnapshotPlacementStore — save/get/has/
//              remove/list, first-seen-wins, and defensive reads over an
//              untrusted byte source (a malformed/garbage record already
//              sitting in storage never crashes any read method).
//   Section B: LocalPublicationSnapshotPlacementCatalog delegates to the
//              store — unchanged public API/behavior, and the two now
//              provably share the same physical storage (a write through
//              one is immediately visible through the other), and the
//              SAME storage key application/
//              LocalPublicationSnapshotPlacementCatalog.js already wrote
//              to before this milestone (0.8.18-0.8.20) — no migration.
//   Section C: RestorePublicationSnapshotPlacementCatalogUseCase —
//              constructor requirements; a genuinely signed record
//              restores cleanly; a forged/malformed record injected
//              directly into storage is rejected AND pruned;
//              SnapshotPlacementResolver is NEVER consulted (call-
//              counting spy).
//   Section D: FLAGSHIP — restart round trip. Alice creates a
//              publication snapshot and places it; Bob receives and
//              catalogs the placement through the ordinary
//              PublicationSnapshotPlacementExchange boundary; Bob's
//              process ends. A brand new Bob process (fresh catalog/
//              store/exchange instances, same underlying storage)
//              restores at startup and discovers the identical placement
//              — byte-identical toJSON(), receivedAt UNCHANGED across the
//              restart, duplicate re-arrival after restart still reports
//              isNew: false and never resets receivedAt, resolution state
//              is untouched by restoration (proven with a spy — zero
//              calls to SnapshotPlacementResolver during restore), and
//              only AFTER restoration does an explicit "Resolve Snapshot"
//              call retrieve AVAILABLE bytes. The persistent store is
//              then deliberately corrupted with a forged signature and a
//              malformed envelope alongside a genuinely valid one; after
//              a second restart the valid placement survives, the forged
//              and malformed ones are rejected and pruned.
//
// See docs/Principles.md, "Restoring A Snapshot Placement Re-establishes
// The Signed Claim, Not Its Current Availability (0.8.21)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — LocalPublicationSnapshotPlacementStore
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        expectThrows(() => new LocalPublicationSnapshotPlacementStore(null), '1. requires a storageProvider');

        const storageProvider = new InMemoryStorageProvider();
        const store = new LocalPublicationSnapshotPlacementStore(storageProvider);

        expectThrows(() => store.save(null, new Date()), '2. save() requires a PublicationSnapshotPlacement instance');
        assert(store.get('missing') === null, '3. get() on an unknown id returns null, never throws');
        assert(store.has('missing') === false, '4. has() on an unknown id is false');
        assert(store.remove('missing') === false, '5. remove() on an unknown id returns false');
        assert(store.list().length === 0, '6. an empty store lists nothing');

        const placement = signPlacement(registry, {
            publicationId: 'pub-a', contentHash: 'hash-a', storage: 'local', locator: 'local://key/a'
        });
        const receivedAt = new Date('2026-01-01T10:00:00.000Z');
        assert(store.save(placement, receivedAt) === true, '7. save() reports true for a genuinely new record');
        assert(store.has(placement.id), '8. has() now reports the record as known');

        const raw = store.get(placement.id);
        assert(raw.receivedAt === receivedAt.toISOString(), '9. get() preserves the exact receivedAt supplied');
        assert(raw.placement.id === placement.id && raw.placement.publicationId === 'pub-a',
            '10. get() returns the record\'s own raw JSON envelope');
        assert(typeof raw.placement.toJSON !== 'function',
            '11. get() returns PLAIN JSON, never a hydrated PublicationSnapshotPlacement instance');

        // First-seen-wins: re-saving the identical id is a no-op.
        const laterReceivedAt = new Date('2026-06-01T00:00:00.000Z');
        assert(store.save(placement, laterReceivedAt) === false, '12. re-saving the same id reports false');
        assert(store.get(placement.id).receivedAt === receivedAt.toISOString(),
            '13. re-saving never resets receivedAt');
        assert(store.list().length === 1, '14. re-saving never creates a second record');

        // Defensive reads: a malformed record already sitting in the raw
        // storage backend (never reachable through save()) never crashes
        // has()/get()/list()/remove() — the whole point of this class
        // treating storage as an untrusted byte source.
        const all = storageProvider.load(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY);
        all.push({ placement: { kind: 'not-a-placement' }, receivedAt: 'not-a-date' });
        all.push(null);
        storageProvider.save(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY, all);

        assert(store.has('missing') === false, '15. has() tolerates garbage entries without throwing');
        assert(store.get('missing') === null, '16. get() tolerates garbage entries without throwing');
        const listed = store.list();
        assert(listed.length === 3, '17. list() returns every raw entry, garbage included, unfiltered');
        assert(store.remove(placement.id) === true, '18. remove() still finds the genuine record among the garbage');
        assert(store.has(placement.id) === false, '19. remove() withdraws exactly the targeted record');
        assert(store.list().length === 2, '20. remove() leaves the untouched (garbage) records alone');
    }
    console.log('✓ Section A: LocalPublicationSnapshotPlacementStore — CRUD, first-seen-wins, defensive reads over untrusted bytes');

    // ---------------------------------------------------------------
    // Section B — LocalPublicationSnapshotPlacementCatalog delegates to the store
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        const storageProvider = new InMemoryStorageProvider();
        const catalog = new LocalPublicationSnapshotPlacementCatalog(storageProvider);
        const store = new LocalPublicationSnapshotPlacementStore(storageProvider);

        const placement = signPlacement(registry, {
            publicationId: 'pub-b', contentHash: 'hash-b', storage: 'local', locator: 'local://key/b'
        });
        catalog.add(placement);

        assert(store.has(placement.id), '1. a placement added through the catalog is visible through an independent store over the same storage');
        assert(store.get(placement.id).placement.id === placement.id, '2. the store\'s own raw record matches what the catalog added');

        // Pruning through the store is immediately reflected through the
        // catalog — they share the same physical storage, not a copy.
        store.remove(placement.id);
        assert(catalog.has(placement.id) === false, '3. a removal through the store is immediately visible through the catalog');
        assert(catalog.list().length === 0, '4. list() reflects the shared storage, not a private in-memory copy');

        // Same storage key as before this milestone — a replica upgrading
        // from 0.8.18/0.8.19/0.8.20 finds its already-cataloged placements
        // exactly where this class expects them, no migration required.
        const secondPlacement = signPlacement(registry, {
            publicationId: 'pub-b2', contentHash: 'hash-b2', storage: 'local', locator: 'local://key/b2'
        });
        catalog.add(secondPlacement);
        const preExistingKeyEntries = storageProvider.load(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY);
        assert(Array.isArray(preExistingKeyEntries) && preExistingKeyEntries.some((e) => e.placement.id === secondPlacement.id),
            '5. the catalog persists under the same key application/LocalPublicationSnapshotPlacementStore.js reads/writes');
    }
    console.log('✓ Section B: LocalPublicationSnapshotPlacementCatalog and LocalPublicationSnapshotPlacementStore share one physical storage/key');

    // ---------------------------------------------------------------
    // Section C — RestorePublicationSnapshotPlacementCatalogUseCase
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        const storageProvider = new InMemoryStorageProvider();
        const store = new LocalPublicationSnapshotPlacementStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();

        expectThrows(() => new RestorePublicationSnapshotPlacementCatalogUseCase(null, verifier), '1. requires a store');
        expectThrows(() => new RestorePublicationSnapshotPlacementCatalogUseCase(store, null), '2. requires a verifier');

        // A genuinely signed placement restores cleanly.
        const goodPlacement = signPlacement(registry, {
            publicationId: 'pub-c', contentHash: 'hash-c', storage: 'local', locator: 'local://key/c'
        });
        store.save(goodPlacement, new Date());

        // A structurally malformed record, injected directly into raw
        // storage — never reachable through store.save(), exactly the
        // "untrusted byte source" this milestone's own design names.
        const structurallyBad = { kind: 'something.else', id: 'bad-structure' };
        const rawAll = storageProvider.load(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY);
        rawAll.push({ placement: structurallyBad, receivedAt: new Date().toISOString() });

        // A well-formed-but-FORGED record: real shape, tampered
        // signature — passes structural validation, fails verification.
        const forgedSource = signPlacement(registry, {
            publicationId: 'pub-c2', contentHash: 'hash-c2', storage: 'local', locator: 'local://key/c2'
        });
        const forgedJson = { ...forgedSource.toJSON(), contentHash: 'tampered-after-signing' };
        rawAll.push({ placement: forgedJson, receivedAt: new Date().toISOString() });
        storageProvider.save(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY, rawAll);

        assert(store.list().length === 3, '3. all three records (good, malformed, forged) are on file before restore');

        const restore = new RestorePublicationSnapshotPlacementCatalogUseCase(store, verifier);
        const result = restore.execute();

        assert(result.restoredPlacements.length === 1 && result.restoredPlacements[0].id === goodPlacement.id,
            '4. only the genuinely signed placement is reported as restored');
        assert(result.rejectedPlacements.length === 2, '5. both the malformed and the forged record are reported as rejected');
        assert(result.rejectedPlacements.some((r) => r.placementId === 'bad-structure' && r.reason === PlacementRestorationRejectionReason.INVALID_STRUCTURE),
            '6. the malformed record is categorized as INVALID_STRUCTURE');
        assert(result.rejectedPlacements.some((r) => r.placementId === forgedSource.id && r.reason === PlacementRestorationRejectionReason.INVALID_SIGNATURE),
            '7. the tampered record is categorized as INVALID_SIGNATURE');

        // Rejection PRUNES — the bad records are gone from the store, the
        // good one is untouched.
        assert(store.has(goodPlacement.id), '8. the genuinely signed placement remains in the store after restore');
        assert(store.has('bad-structure') === false, '9. the malformed record is pruned from the store');
        assert(store.has(forgedSource.id) === false, '10. the forged record is pruned from the store');
        assert(store.list().length === 1, '11. only the genuinely signed record remains on file');

        // Restore never calls SnapshotPlacementResolver — proven with a
        // call-counting spy, not merely by omission.
        let resolverCalls = 0;
        const originalResolve = SnapshotPlacementResolver.prototype.resolve;
        SnapshotPlacementResolver.prototype.resolve = function spy(...args) {
            resolverCalls += 1;
            return originalResolve.apply(this, args);
        };
        try {
            const secondStore = new LocalPublicationSnapshotPlacementStore(new InMemoryStorageProvider());
            const anotherPlacement = signPlacement(registry, {
                publicationId: 'pub-c3', contentHash: 'hash-c3', storage: 'ipfs', locator: 'ipfs://spy-cid'
            });
            secondStore.save(anotherPlacement, new Date());
            new RestorePublicationSnapshotPlacementCatalogUseCase(secondStore, verifier).execute();
        } finally {
            SnapshotPlacementResolver.prototype.resolve = originalResolve;
        }
        assert(resolverCalls === 0, '12. restoration never consults SnapshotPlacementResolver, even for a storage that would match a registered store');
    }
    console.log('✓ Section C: RestorePublicationSnapshotPlacementCatalogUseCase — validates + verifies signatures, prunes what fails, never touches SnapshotPlacementResolver');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: restart round trip
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');

        // The bytes Alice's snapshot actually contains, and their hash —
        // used both to sign the placement and, later, to prove an
        // explicit resolve() genuinely retrieves the SAME bytes.
        const snapshotBytes = JSON.stringify({ world: 'flagship-snapshot' });
        const snapshotHash = computeContentHash(snapshotBytes);

        // Alice signs three independent placements for the same
        // publication (different storage backends, none preferred) plus
        // a fourth for a different publication.
        const placementA = signPlacement(alice, {
            publicationId: 'pub-flagship', contentHash: snapshotHash, storage: 'local', locator: 'local://key/aaa'
        });
        const placementB = signPlacement(alice, {
            publicationId: 'pub-flagship', contentHash: snapshotHash, storage: 'ipfs', locator: 'ipfs://bbb'
        });
        const placementC = signPlacement(alice, {
            publicationId: 'pub-flagship', contentHash: snapshotHash, storage: 'other-cdn', locator: 'other://ccc'
        });
        const placementD = signPlacement(alice, {
            publicationId: 'pub-other', contentHash: 'hash-other', storage: 'local', locator: 'local://key/ddd'
        });

        // Bob's "disk" — the one piece of state that survives a restart.
        const bobDisk = new InMemoryStorageProvider();

        // A real local content store, over its OWN storage — the bytes
        // Bob will actually be able to retrieve once he explicitly
        // resolves placementA. Registering the exact bytes under the
        // SAME hash placementA claims mirrors Alice having placed her
        // already-published snapshot onto this backend.
        const bobContentStore = new LocalContentStore(bobDisk);
        bobDisk.save('content:' + snapshotHash, snapshotBytes);

        // --- Bob, process #1 ---
        let bobCatalog = new LocalPublicationSnapshotPlacementCatalog(bobDisk);
        let bobVerifier = new LocalAuthorizationVerifier();
        let bobExchange = new PublicationSnapshotPlacementExchange(bobCatalog, bobVerifier);

        for (const placement of [placementA, placementB, placementC, placementD]) {
            const { isNew } = bobExchange.importPlacement(placement.toJSON());
            assert(isNew === true, `1. Bob catalogs placement ${placement.id} as new, in process #1`);
        }

        const receivedAtBeforeRestart = bobCatalog.getReceivedAt(placementA.id);
        const placementAJsonBeforeRestart = bobCatalog.get(placementA.id).toJSON();

        // Bob explicitly resolves placementA in process #1 — RESOLVED,
        // against his own registered local store.
        const bobStoreRegistry = new SnapshotPlacementStoreRegistry();
        bobStoreRegistry.register(bobContentStore);
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const resolveBefore = await bobResolver.resolve(bobCatalog.get(placementA.id).toJSON(), { storeRegistry: bobStoreRegistry });
        assert(resolveBefore.outcome === SnapshotPlacementResolutionOutcome.RESOLVED,
            '2. Bob independently resolves placementA in process #1, against his own registered local store');
        assert(resolveBefore.bytes === snapshotBytes,
            '3. the resolved bytes are exactly the snapshot bytes Alice placed');

        // --- "Bob restarts" — process #1 ends; nothing but bobDisk
        // survives. Process #2 is built from fresh instances over the
        // SAME storage, exactly like ui/main.js constructing application/
        // CreatePublicationSnapshotPlacementPeerExchangeUseCase.js fresh
        // on every page load. ---
        const bobStore2 = new LocalPublicationSnapshotPlacementStore(bobDisk);
        const bobVerifier2 = new LocalAuthorizationVerifier();

        // Restoration itself never calls SnapshotPlacementResolver —
        // proven at the composition level with a spy, not merely by
        // omission.
        let resolverCallsDuringRestore = 0;
        const originalResolve = SnapshotPlacementResolver.prototype.resolve;
        SnapshotPlacementResolver.prototype.resolve = function spy(...args) {
            resolverCallsDuringRestore += 1;
            return originalResolve.apply(this, args);
        };
        let restoreResult;
        try {
            restoreResult = new RestorePublicationSnapshotPlacementCatalogUseCase(bobStore2, bobVerifier2).execute();
        } finally {
            SnapshotPlacementResolver.prototype.resolve = originalResolve;
        }
        assert(resolverCallsDuringRestore === 0, '4. restoration never calls SnapshotPlacementResolver — restart is never re-resolution');

        const bobCatalog2 = new LocalPublicationSnapshotPlacementCatalog(bobDisk);
        const bobExchange2 = new PublicationSnapshotPlacementExchange(bobCatalog2, bobVerifier2);

        assert(restoreResult.restoredPlacements.length === 4, '5. all four previously-cataloged placements pass restoration');
        assert(restoreResult.rejectedPlacements.length === 0, '6. nothing is rejected — every record was genuinely signed');

        // A — restart round trip: the exact same placement is discovered.
        assert(bobCatalog2.has(placementA.id), '7. placementA is discovered again in process #2, without re-announcing it');
        assert(bobCatalog2.findByPublicationId('pub-flagship').length === 3,
            '8. all three independent placements for pub-flagship survive the restart');

        // B — byte preservation.
        const placementAJsonAfterRestart = bobCatalog2.get(placementA.id).toJSON();
        assert(JSON.stringify(placementAJsonAfterRestart) === JSON.stringify(placementAJsonBeforeRestart),
            '9. placement.toJSON() is byte-identical before persistence and after restoration — same id, publicationId, contentHash, locator, signature, placedAt');

        // F — receivedAt survives, unchanged, across the restart.
        assert(bobCatalog2.getReceivedAt(placementA.id) === receivedAtBeforeRestart,
            '10. receivedAt(before restart) === receivedAt(after restart)');

        // G — duplicate restoration / re-arrival preserves first-seen-wins
        // and never updates receivedAt, exactly like an ordinary
        // re-ANNOUNCE would.
        const reImported = bobExchange2.importPlacement(placementA.toJSON());
        assert(reImported.isNew === false, '11. re-importing an already-restored placement reports isNew: false');
        assert(bobCatalog2.getReceivedAt(placementA.id) === receivedAtBeforeRestart,
            '12. re-importing after restart still never updates receivedAt');

        // E — restoration answers "is this a valid signed claim," never
        // "can I retrieve it right now": the restored placement starts
        // process #2 with NO resolution outcome attached anywhere — the
        // catalog record itself never carried one to begin with.
        assert(bobCatalog2.get(placementA.id).toJSON().resolved === undefined
            && bobCatalog2.get(placementA.id).toJSON().resolutionOutcome === undefined,
            '13. the restored placement record itself never carries a resolution flag to lose in the first place');

        // Only AFTER restoration, an explicit "Resolve Snapshot" call —
        // never implied by restore() itself — retrieves the bytes again,
        // against the SAME registered local store.
        const bobResolver2 = new SnapshotPlacementResolver(bobVerifier2);
        const bobStoreRegistry2 = new SnapshotPlacementStoreRegistry();
        bobStoreRegistry2.register(new LocalContentStore(bobDisk));
        const resolveAfter = await bobResolver2.resolve(bobCatalog2.get(placementA.id).toJSON(), { storeRegistry: bobStoreRegistry2 });
        assert(resolveAfter.outcome === SnapshotPlacementResolutionOutcome.RESOLVED,
            '14. an explicit post-restart Resolve Snapshot call for placementA reports RESOLVED');

        // H — several independent placements, still unranked, still no
        // canonical selection, after surviving a restart.
        const survivingForFlagship = bobCatalog2.findByPublicationId('pub-flagship');
        assert(survivingForFlagship.some((p) => p.id === placementA.id)
            && survivingForFlagship.some((p) => p.id === placementB.id)
            && survivingForFlagship.some((p) => p.id === placementC.id),
            '15. all three placements for pub-flagship are individually present after restart');
        assert(bobCatalog2.findByPublicationId('pub-other').length === 1
            && bobCatalog2.findByPublicationId('pub-other')[0].id === placementD.id,
            '16. the unrelated publication\'s own placement survives independently');

        // --- Deliberate corruption of Bob's persistent store, then a
        // SECOND restart, mirroring this milestone's own design: a valid
        // placement, a forged signature, and a malformed envelope, all
        // sitting side by side. ---
        const forgedSource = signPlacement(alice, {
            publicationId: 'pub-corrupt', contentHash: 'hash-corrupt', storage: 'local', locator: 'local://key/corrupt'
        });
        const forgedJson = { ...forgedSource.toJSON(), locator: 'local://key/tampered-after-signing' };
        const rawAll = bobDisk.load(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY);
        rawAll.push({ placement: forgedJson, receivedAt: new Date().toISOString() });
        rawAll.push({ placement: { kind: 'garbage', id: 'malformed-corrupt' }, receivedAt: new Date().toISOString() });
        bobDisk.save(PUBLICATION_SNAPSHOT_PLACEMENT_STORE_KEY, rawAll);

        const bobStore3 = new LocalPublicationSnapshotPlacementStore(bobDisk);
        const bobVerifier3 = new LocalAuthorizationVerifier();
        const secondRestoreResult = new RestorePublicationSnapshotPlacementCatalogUseCase(bobStore3, bobVerifier3).execute();

        assert(secondRestoreResult.restoredPlacements.length === 4,
            '17. after the second restart, the four originally-genuine placements still restore cleanly');
        assert(secondRestoreResult.rejectedPlacements.length === 2,
            '18. the newly-injected forged and malformed records are both rejected');
        assert(secondRestoreResult.rejectedPlacements.some((r) => r.placementId === forgedSource.id && r.reason === PlacementRestorationRejectionReason.INVALID_SIGNATURE),
            '19. the tampered-after-signing placement is categorized as INVALID_SIGNATURE');
        assert(secondRestoreResult.rejectedPlacements.some((r) => r.placementId === 'malformed-corrupt' && r.reason === PlacementRestorationRejectionReason.INVALID_STRUCTURE),
            '20. the malformed envelope is categorized as INVALID_STRUCTURE');

        const bobCatalog3 = new LocalPublicationSnapshotPlacementCatalog(bobDisk);
        assert(bobCatalog3.has(placementA.id) && bobCatalog3.has(placementB.id) && bobCatalog3.has(placementC.id) && bobCatalog3.has(placementD.id),
            '21. all four originally-valid placements remain cataloged after the corrupted restart');
        assert(bobCatalog3.has(forgedSource.id) === false && bobCatalog3.has('malformed-corrupt') === false,
            '22. the forged and malformed records are pruned, never cataloged');
    }
    console.log('✓ Section D: FLAGSHIP — restart round trip: same placement discovered, bytes preserved, receivedAt unchanged, first-seen-wins holds, resolution never implied by restore, explicit post-restart resolve() still works, multiple placements survive unranked, SnapshotPlacementResolver never consulted by restoration, a second corrupted restart prunes only what fails');

    console.log('\nAll Persistent Publication Snapshot Placement Catalog tests passed.');
}

run().catch((error) => {
    console.error('PersistentPublicationSnapshotPlacementCatalog.test.js FAILED:', error);
    process.exitCode = 1;
});
