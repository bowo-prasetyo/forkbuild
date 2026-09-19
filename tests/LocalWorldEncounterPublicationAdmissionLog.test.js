import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalWorldEncounterPublicationAdmissionLog } from '../application/LocalWorldEncounterPublicationAdmissionLog.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.651 — Persist World-Encounter Publication Admissions.
//
// Unit tests for the new durable log itself — the small, purpose-built
// sibling to application/LocalPublicationCatalog.js that exists because
// reusing that class directly for a plain publisher/Publication.js
// instance is unsafe (see this class's own header, and
// tests/DistributionResultPublicationCenterDeepLinkAudit.test.js's own
// Section B6, for the live proof).
//
//   Section A — add()/list() round-trip a real Publication.
//   Section B — first-seen-wins idempotency, mirroring LocalPublicationCatalog#add().
//   Section C — has().
//   Section D — constructor contract.
//   Section E — a real publisher/Publication.js instance corrupts
//               LocalPublicationCatalog if handed to it directly (the
//               documented reason this class exists), but round-trips
//               cleanly through THIS class.
//   Section F — persists across a fresh instance over the same storage
//               (the actual restart scenario this milestone exists for).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function throwsFn(fn) {
    try { fn(); return false; } catch { return true; }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePublication({ id, documentId = id, title = 'A World Encountered Work', author = 'someone-else', contentHash = `hash-${id}` }) {
    return new Publication({
        id, documentId, title, author,
        contentReference: new ContentReference({ hash: contentHash, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 42 })
    });
}

function run() {
    console.log('Running LocalWorldEncounterPublicationAdmissionLog tests...\n');

    // ===============================================================
    // Section A — add()/list() round-trip.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const publication = makePublication({ id: 'a-pub', documentId: 'a-doc' });

        const { publication: added, isNew } = log.add(publication);
        assert(isNew === true, '1. add() reports isNew=true for a genuinely new publicationId.');
        assert(added === publication, '2. add() returns the exact instance handed to it on a first add.');

        const listed = log.list();
        assert(listed.length === 1, '3. list() returns exactly one entry.');
        assert(listed[0] instanceof Publication, '4. the reconstructed entry is a real Publication instance.');
        assert(listed[0].id === 'a-pub' && listed[0].documentId === 'a-doc', '5. id/documentId survive the JSON round-trip intact.');

        console.log('✓ Section A: add()/list() round-trip a real Publication through durable storage.');
    }

    // ===============================================================
    // Section B — first-seen-wins idempotency.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const first = makePublication({ id: 'b-pub', title: 'First Seen' });
        const second = makePublication({ id: 'b-pub', title: 'Second Seen (never stored)' });

        log.add(first);
        const { publication: reAdded, isNew } = log.add(second);
        assert(isNew === false, '1. re-admitting the same publicationId reports isNew=false.');
        assert(reAdded.title === 'First Seen', '2. first-seen-wins: the ORIGINAL record is returned, never overwritten by a later add() with the same id.');
        assert(log.list().length === 1, '3. exactly one durable entry exists after repeated admission — no duplicate durable records.');

        console.log('✓ Section B: first-seen-wins idempotency mirrors LocalPublicationCatalog#add() exactly — repeated admission never duplicates or overwrites.');
    }

    // ===============================================================
    // Section C — has().
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        assert(log.has('c-pub') === false, '1. has() is false before admission.');
        log.add(makePublication({ id: 'c-pub' }));
        assert(log.has('c-pub') === true, '2. has() is true after admission.');
        console.log('✓ Section C: has() reflects admission state correctly.');
    }

    // ===============================================================
    // Section D — constructor contract.
    // ===============================================================
    {
        assert(throwsFn(() => new LocalWorldEncounterPublicationAdmissionLog(null)), '1. a storageProvider is required.');
        assert(throwsFn(() => new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider()).add(null)), '2. add() rejects a non-Publication value.');
        assert(throwsFn(() => new LocalWorldEncounterPublicationAdmissionLog(new InMemoryStorageProvider()).add({ id: 'x' })), '3. add() rejects a plain object masquerading as a Publication.');
        console.log('✓ Section D: constructor and add() both enforce their required-collaborator/required-type contracts.');
    }

    // ===============================================================
    // Section E — the documented reason this class exists: a real
    // publisher/Publication.js instance corrupts LocalPublicationCatalog,
    // but round-trips cleanly through THIS class.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const publication = makePublication({ id: 'e-pub', documentId: 'e-doc' });

        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const addResult = catalog.add(publication);
        assert(addResult.isNew === true, '1. LocalPublicationCatalog.add() accepts a publisher/Publication.js instance silently (it only checks toJSON()/id).');
        assert(throwsFn(() => catalog.list()), '2. ...but LocalPublicationCatalog.list() now THROWS — confirming this milestone\'s own documented reason for a SEPARATE log, live.');

        const log = new LocalWorldEncounterPublicationAdmissionLog(storage);
        log.add(publication);
        assert(!throwsFn(() => log.list()), '3. the SAME Publication instance round-trips cleanly through LocalWorldEncounterPublicationAdmissionLog — no corruption.');
        assert(log.list()[0].id === 'e-pub', '4. ...and reconstructs with the correct identity.');

        console.log('✓ Section E: live-proven — bridging a World-Encountered Publication into LocalPublicationCatalog corrupts it; the SAME Publication is safe in this dedicated log.');
    }

    // ===============================================================
    // Section F — persists across a fresh instance over the same
    // storage (the actual restart scenario).
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const session1 = new LocalWorldEncounterPublicationAdmissionLog(storage);
        session1.add(makePublication({ id: 'f-pub', documentId: 'f-doc', title: 'Survives Restart' }));

        // Simulate a restart: a fresh instance, same underlying storage.
        const session2 = new LocalWorldEncounterPublicationAdmissionLog(storage);
        const listed = session2.list();
        assert(listed.length === 1, '1. a fresh instance over the same storage sees the admitted entry.');
        assert(listed[0].id === 'f-pub' && listed[0].title === 'Survives Restart', '2. identity and content survive intact.');

        console.log('✓ Section F: admission durably survives a fresh instance over the same storage — the restart scenario this milestone exists to fix.');
    }

    console.log('\nAll LocalWorldEncounterPublicationAdmissionLog tests passed.');
}

run();
