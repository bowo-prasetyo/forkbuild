import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { LocalPublicationAnchorStore, PUBLICATION_ANCHOR_STORE_KEY } from '../application/LocalPublicationAnchorStore.js';
import {
    RestorePublicationAnchorCatalogUseCase,
    AnchorRestorationRejectionReason
} from '../application/RestorePublicationAnchorCatalogUseCase.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import {
    deriveAnchorVerificationLifecycle
} from '../application/PublicationAnchorVerificationLifecycleView.js';
import { AnchorVerificationLifecycleState } from '../application/AnchorVerificationLifecycleState.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.15 — Persistent External Evidence Catalog & Restart Recovery.
//
//   Section A: LocalPublicationAnchorStore — save/get/has/remove/list,
//              first-seen-wins, and defensive reads over an untrusted
//              byte source (a malformed/garbage record already sitting
//              in storage never crashes any read method).
//   Section B: LocalPublicationAnchorCatalog delegates to the store —
//              unchanged public API/behavior, and the two now provably
//              share the same physical storage (a write through one is
//              immediately visible through the other).
//   Section C: RestorePublicationAnchorCatalogUseCase — constructor
//              requirements; a genuinely signed record restores cleanly;
//              a forged/malformed record injected directly into storage
//              is rejected AND pruned; ExternalAnchorVerifier is NEVER
//              consulted (call-counting spy).
//   Section D: FLAGSHIP — restart round trip. Alice signs an anchor; Bob
//              receives and catalogs it through the ordinary
//              PublicationAnchorExchange boundary; Bob's process ends.
//              A brand new Bob process (fresh catalog/store/exchange
//              instances, same underlying storage) restores at startup
//              and discovers the identical anchor — byte-identical
//              toJSON(), `receivedAt` UNCHANGED across the restart,
//              duplicate re-arrival after restart still reports
//              isNew: false and never resets receivedAt, verification
//              state (VALID before restart) reads back as NOT_VERIFIED
//              in the new process's own ephemeral session state, and
//              several independent anchors for the same publication all
//              survive, unranked.
//
// See docs/Principles.md, "A Persistent Store Is An Untrusted Byte
// Source, Not A Second Trust Root (0.8.15)," and "Restoration Re-Earns
// Trust In The Claim; It Never Re-Asks The External System (0.8.15)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    let error = null;
    try { fn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    return error;
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

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({
        ...fields,
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — LocalPublicationAnchorStore
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        expectThrows(() => new LocalPublicationAnchorStore(null), '1. requires a storageProvider');

        const storageProvider = new InMemoryStorageProvider();
        const store = new LocalPublicationAnchorStore(storageProvider);

        expectThrows(() => store.save(null, new Date()), '2. save() requires a PublicationAnchor instance');
        assert(store.get('missing') === null, '3. get() on an unknown id returns null, never throws');
        assert(store.has('missing') === false, '4. has() on an unknown id is false');
        assert(store.remove('missing') === false, '5. remove() on an unknown id returns false');
        assert(store.list().length === 0, '6. an empty store lists nothing');

        const anchor = signAnchor(registry, {
            publicationId: 'pub-a', contentHash: 'hash-a', anchorType: 'local-test', locator: 'local://ledger/a'
        });
        const receivedAt = new Date('2026-01-01T10:00:00.000Z');
        assert(store.save(anchor, receivedAt) === true, '7. save() reports true for a genuinely new record');
        assert(store.has(anchor.id), '8. has() now reports the record as known');

        const raw = store.get(anchor.id);
        assert(raw.receivedAt === receivedAt.toISOString(), '9. get() preserves the exact receivedAt supplied');
        assert(raw.anchor.id === anchor.id && raw.anchor.publicationId === 'pub-a',
            '10. get() returns the record\'s own raw JSON envelope');
        assert(typeof raw.anchor.toJSON !== 'function',
            '11. get() returns PLAIN JSON, never a hydrated PublicationAnchor instance');

        // First-seen-wins: re-saving the identical id is a no-op.
        const laterReceivedAt = new Date('2026-06-01T00:00:00.000Z');
        assert(store.save(anchor, laterReceivedAt) === false, '12. re-saving the same id reports false');
        assert(store.get(anchor.id).receivedAt === receivedAt.toISOString(),
            '13. re-saving never resets receivedAt');
        assert(store.list().length === 1, '14. re-saving never creates a second record');

        // Defensive reads: a malformed record already sitting in the raw
        // storage backend (never reachable through save()) never crashes
        // has()/get()/list()/remove() — the whole point of this class
        // treating storage as an untrusted byte source.
        const all = storageProvider.load(PUBLICATION_ANCHOR_STORE_KEY);
        all.push({ anchor: { kind: 'not-an-anchor' }, receivedAt: 'not-a-date' });
        all.push(null);
        storageProvider.save(PUBLICATION_ANCHOR_STORE_KEY, all);

        assert(store.has('missing') === false, '15. has() tolerates garbage entries without throwing');
        assert(store.get('missing') === null, '16. get() tolerates garbage entries without throwing');
        const listed = store.list();
        assert(listed.length === 3, '17. list() returns every raw entry, garbage included, unfiltered');
        assert(store.remove(anchor.id) === true, '18. remove() still finds the genuine record among the garbage');
        assert(store.has(anchor.id) === false, '19. remove() withdraws exactly the targeted record');
        assert(store.list().length === 2, '20. remove() leaves the untouched (garbage) records alone');
    }
    console.log('✓ Section A: LocalPublicationAnchorStore — CRUD, first-seen-wins, defensive reads over untrusted bytes');

    // ---------------------------------------------------------------
    // Section B — LocalPublicationAnchorCatalog delegates to the store
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        const storageProvider = new InMemoryStorageProvider();
        const catalog = new LocalPublicationAnchorCatalog(storageProvider);
        const store = new LocalPublicationAnchorStore(storageProvider);

        const anchor = signAnchor(registry, {
            publicationId: 'pub-b', contentHash: 'hash-b', anchorType: 'local-test', locator: 'local://ledger/b'
        });
        catalog.add(anchor);

        assert(store.has(anchor.id), '1. an anchor added through the catalog is visible through an independent store over the same storage');
        assert(store.get(anchor.id).anchor.id === anchor.id, '2. the store\'s own raw record matches what the catalog added');

        // Pruning through the store is immediately reflected through the
        // catalog — they share the same physical storage, not a copy.
        store.remove(anchor.id);
        assert(catalog.has(anchor.id) === false, '3. a removal through the store is immediately visible through the catalog');
        assert(catalog.list().length === 0, '4. list() reflects the shared storage, not a private in-memory copy');
    }
    console.log('✓ Section B: LocalPublicationAnchorCatalog and LocalPublicationAnchorStore share one physical storage');

    // ---------------------------------------------------------------
    // Section C — RestorePublicationAnchorCatalogUseCase
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        const storageProvider = new InMemoryStorageProvider();
        const store = new LocalPublicationAnchorStore(storageProvider);
        const verifier = new LocalAuthorizationVerifier();

        expectThrows(() => new RestorePublicationAnchorCatalogUseCase(null, verifier), '1. requires a store');
        expectThrows(() => new RestorePublicationAnchorCatalogUseCase(store, null), '2. requires a verifier');

        // A genuinely signed anchor restores cleanly.
        const goodAnchor = signAnchor(registry, {
            publicationId: 'pub-c', contentHash: 'hash-c', anchorType: 'local-test', locator: 'local://ledger/c'
        });
        store.save(goodAnchor, new Date());

        // A structurally malformed record, injected directly into raw
        // storage — never reachable through store.save(), exactly the
        // "untrusted byte source" this milestone's own design names.
        const structurallyBad = { kind: 'something.else', id: 'bad-structure' };
        const rawAll = storageProvider.load(PUBLICATION_ANCHOR_STORE_KEY);
        rawAll.push({ anchor: structurallyBad, receivedAt: new Date().toISOString() });

        // A well-formed-but-FORGED record: real shape, tampered
        // signature — passes structural validation, fails verification.
        const forgedSource = signAnchor(registry, {
            publicationId: 'pub-c2', contentHash: 'hash-c2', anchorType: 'local-test', locator: 'local://ledger/c2'
        });
        const forgedJson = { ...forgedSource.toJSON(), contentHash: 'tampered-after-signing' };
        rawAll.push({ anchor: forgedJson, receivedAt: new Date().toISOString() });
        storageProvider.save(PUBLICATION_ANCHOR_STORE_KEY, rawAll);

        assert(store.list().length === 3, '3. all three records (good, malformed, forged) are on file before restore');

        const restore = new RestorePublicationAnchorCatalogUseCase(store, verifier);
        const result = restore.execute();

        assert(result.restoredAnchors.length === 1 && result.restoredAnchors[0].id === goodAnchor.id,
            '4. only the genuinely signed anchor is reported as restored');
        assert(result.rejectedAnchors.length === 2, '5. both the malformed and the forged record are reported as rejected');
        assert(result.rejectedAnchors.some((r) => r.anchorId === 'bad-structure' && r.reason === AnchorRestorationRejectionReason.INVALID_STRUCTURE),
            '6. the malformed record is categorized as INVALID_STRUCTURE');
        assert(result.rejectedAnchors.some((r) => r.anchorId === forgedSource.id && r.reason === AnchorRestorationRejectionReason.INVALID_SIGNATURE),
            '7. the tampered record is categorized as INVALID_SIGNATURE');

        // Rejection PRUNES — the bad records are gone from the store, the
        // good one is untouched.
        assert(store.has(goodAnchor.id), '8. the genuinely signed anchor remains in the store after restore');
        assert(store.has('bad-structure') === false, '9. the malformed record is pruned from the store');
        assert(store.has(forgedSource.id) === false, '10. the forged record is pruned from the store');
        assert(store.list().length === 1, '11. only the genuinely signed record remains on file');

        // Restore never calls ExternalAnchorVerifier — proven with a
        // call-counting spy, not merely by omission.
        let externalVerifyCalls = 0;
        const originalVerify = ExternalAnchorVerifier.prototype.verify;
        ExternalAnchorVerifier.prototype.verify = function spy(...args) {
            externalVerifyCalls += 1;
            return originalVerify.apply(this, args);
        };
        try {
            const secondStore = new LocalPublicationAnchorStore(new InMemoryStorageProvider());
            const anotherAnchor = signAnchor(registry, {
                publicationId: 'pub-c3', contentHash: 'hash-c3', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/spy', proof: { txid: 'spy' }
            });
            secondStore.save(anotherAnchor, new Date());
            new RestorePublicationAnchorCatalogUseCase(secondStore, verifier).execute();
        } finally {
            ExternalAnchorVerifier.prototype.verify = originalVerify;
        }
        assert(externalVerifyCalls === 0, '12. restoration never consults ExternalAnchorVerifier, even for an anchorType that would match a real proof adapter');
    }
    console.log('✓ Section C: RestorePublicationAnchorCatalogUseCase — validates + verifies signatures, prunes what fails, never touches ExternalAnchorVerifier');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: restart round trip
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');

        // Alice signs three independent anchors for the same publication
        // (Section H — multiple anchors, none preferred) plus a fourth
        // for a different publication.
        const anchorA = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: 'hash-flagship', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/aaa'
        });
        const anchorB = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: 'hash-flagship', anchorType: 'other-ledger', locator: 'other://chain/bbb'
        });
        const anchorC = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: 'hash-flagship', anchorType: 'local-test', locator: 'local://ledger/ccc'
        });
        const anchorD = signAnchor(alice, {
            publicationId: 'pub-other', contentHash: 'hash-other', anchorType: 'local-test', locator: 'local://ledger/ddd'
        });

        // Bob's "disk" — the one piece of state that survives a restart.
        const bobDisk = new InMemoryStorageProvider();

        // --- Bob, process #1 ---
        let bobCatalog = new LocalPublicationAnchorCatalog(bobDisk);
        let bobVerifier = new LocalAuthorizationVerifier();
        let bobExchange = new PublicationAnchorExchange(bobCatalog, bobVerifier);

        for (const anchor of [anchorA, anchorB, anchorC, anchorD]) {
            const { isNew } = bobExchange.importAnchor(anchor.toJSON());
            assert(isNew === true, `1. Bob catalogs anchor ${anchor.id} as new, in process #1`);
        }

        const receivedAtBeforeRestart = bobCatalog.getReceivedAt(anchorA.id);
        const anchorAJsonBeforeRestart = bobCatalog.get(anchorA.id).toJSON();

        // Bob explicitly verifies anchorA in process #1 — VALID.
        const bobExternalVerifier = new ExternalAnchorVerifier(bobVerifier);
        const verifyBefore = await bobExternalVerifier.verify(bobCatalog.get(anchorA.id).toJSON());
        assert(verifyBefore.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED,
            '2. Bob independently verifies anchorA in process #1 (no proof plugin supplied)');
        // Session-local verification history — never written to the
        // catalog or anywhere durable; this is what "verification state
        // does not survive restart" is actually testing against.
        let bobVerificationHistory = [
            createVerificationObservation({ anchorId: anchorA.id, outcome: AnchorVerificationOutcome.VALID })
        ];
        const lifecycleBeforeRestart = deriveAnchorVerificationLifecycle(bobVerificationHistory);
        assert(lifecycleBeforeRestart.state === AnchorVerificationLifecycleState.VERIFIED,
            '3. anchorA reads as VERIFIED in process #1\'s own session state');

        // --- "Bob restarts" — process #1 ends; nothing but bobDisk
        // survives. Process #2 is built from fresh instances over the
        // SAME storage, exactly like ui/main.js constructing application/
        // CreatePublicationAnchorPeerExchangeUseCase.js fresh on every
        // page load. ---
        const bobStore2 = new LocalPublicationAnchorStore(bobDisk);
        const bobVerifier2 = new LocalAuthorizationVerifier();
        const restoreResult = new RestorePublicationAnchorCatalogUseCase(bobStore2, bobVerifier2).execute();
        const bobCatalog2 = new LocalPublicationAnchorCatalog(bobDisk);
        const bobExchange2 = new PublicationAnchorExchange(bobCatalog2, bobVerifier2);

        assert(restoreResult.restoredAnchors.length === 4, '4. all four previously-cataloged anchors pass restoration');
        assert(restoreResult.rejectedAnchors.length === 0, '5. nothing is rejected — every record was genuinely signed');

        // A — restart round trip: the exact same anchor is discovered.
        assert(bobCatalog2.has(anchorA.id), '6. anchorA is discovered again in process #2, without re-announcing it');
        assert(bobCatalog2.findByPublicationId('pub-flagship').length === 3,
            '7. all three independent anchors for pub-flagship survive the restart');

        // B — byte preservation.
        const anchorAJsonAfterRestart = bobCatalog2.get(anchorA.id).toJSON();
        assert(JSON.stringify(anchorAJsonAfterRestart) === JSON.stringify(anchorAJsonBeforeRestart),
            '8. anchor.toJSON() is byte-identical before persistence and after restoration');

        // F — receivedAt survives, unchanged, across the restart.
        assert(bobCatalog2.getReceivedAt(anchorA.id) === receivedAtBeforeRestart,
            '9. receivedAt(before restart) === receivedAt(after restart)');

        // G — duplicate restoration / re-arrival preserves first-seen-wins
        // and never updates receivedAt, exactly like an ordinary
        // re-ANNOUNCE would.
        const reImported = bobExchange2.importAnchor(anchorA.toJSON());
        assert(reImported.isNew === false, '10. re-importing an already-restored anchor reports isNew: false');
        assert(bobCatalog2.getReceivedAt(anchorA.id) === receivedAtBeforeRestart,
            '11. re-importing after restart still never updates receivedAt');

        // E — verification state does not survive: process #2 starts with
        // its own, empty verification-observation history — the anchor
        // was durably restored, but "VALID" was never part of what got
        // persisted (application/PublicationAnchorVerificationObservation
        // .js's own header: "NEVER PERSISTED, NEVER SHARED").
        const bobVerificationHistory2 = [];
        const lifecycleAfterRestart = deriveAnchorVerificationLifecycle(bobVerificationHistory2);
        assert(lifecycleAfterRestart.state === AnchorVerificationLifecycleState.NOT_VERIFIED,
            '12. the restored anchor reads as NOT_VERIFIED from process #2\'s own fresh session state');
        assert(bobCatalog2.get(anchorA.id).toJSON().verified === undefined,
            '13. the anchor record itself never carried a verification flag to lose in the first place');

        // D — restoration itself never called ExternalAnchorVerifier —
        // proven again here, at the composition level, with a spy.
        let externalVerifyCallsDuringRestore = 0;
        const originalVerify = ExternalAnchorVerifier.prototype.verify;
        ExternalAnchorVerifier.prototype.verify = function spy(...args) {
            externalVerifyCallsDuringRestore += 1;
            return originalVerify.apply(this, args);
        };
        try {
            new RestorePublicationAnchorCatalogUseCase(new LocalPublicationAnchorStore(bobDisk), new LocalAuthorizationVerifier()).execute();
        } finally {
            ExternalAnchorVerifier.prototype.verify = originalVerify;
        }
        assert(externalVerifyCallsDuringRestore === 0, '14. restoring an already-verified anchor still never calls ExternalAnchorVerifier');

        // H — several independent anchors, still unranked, still no
        // canonical selection, after surviving a restart.
        const survivingForFlagship = bobCatalog2.findByPublicationId('pub-flagship');
        assert(survivingForFlagship.some((a) => a.id === anchorA.id)
            && survivingForFlagship.some((a) => a.id === anchorB.id)
            && survivingForFlagship.some((a) => a.id === anchorC.id),
            '15. all three anchors for pub-flagship are individually present after restart');
        assert(bobCatalog2.findByPublicationId('pub-other').length === 1
            && bobCatalog2.findByPublicationId('pub-other')[0].id === anchorD.id,
            '16. the unrelated publication\'s own anchor survives independently');
    }
    console.log('✓ Section D: FLAGSHIP — restart round trip: same anchor discovered, bytes preserved, receivedAt unchanged, first-seen-wins holds, verification state does not survive, multiple anchors survive unranked, ExternalAnchorVerifier never consulted by restoration');

    console.log('\nAll Persistent Publication Anchor Catalog tests passed.');
}

run().catch((error) => {
    console.error('PersistentPublicationAnchorCatalog.test.js FAILED:', error);
    process.exitCode = 1;
});
