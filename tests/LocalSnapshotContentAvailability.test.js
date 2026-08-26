import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import {
    describeLocalSnapshotContentAvailability,
    describeAvailabilityOutcomeLabel,
    describeAvailabilityOutcomeMessage,
    describeAvailabilityCheckButtonLabel
} from '../application/LocalSnapshotContentAvailabilityView.js';
import { buildPublicationReplicaPackage } from '../application/PublicationReplicaPackage.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
//
//   Section A: CheckLocalSnapshotContentAvailabilityUseCase argument
//              handling and the constructor's own ContentStore requirement.
//   Section B: describeLocalSnapshotContentAvailability() / label /
//              message / button-label pure view functions, over every
//              LocalSnapshotContentAvailabilityOutcome value plus the
//              idle/checking states.
//   Section C — FLAGSHIP: Alice publishes P, holds its bytes locally, and
//              builds both a Publication Replica Package (0.8.29) and a
//              Publication Snapshot Transfer Package (0.8.32). Bob imports
//              only the replica package: he knows P and exactly where its
//              placement CLAIMS the bytes are retrievable, and a local
//              availability check reports NOT_AVAILABLE. Carol imports the
//              replica package AND the transfer package: her check reports
//              AVAILABLE, with the exact "matches the publication's
//              content hash" sentence. Dave possesses bytes under the
//              correct content-store key that have been corrupted beneath
//              him (simulating storage-layer damage, never anything this
//              class itself could cause) — his check reports
//              CONTENT_HASH_MISMATCH, a DEFINITE finding distinct from
//              Bob's NOT_AVAILABLE.
//   Section D: re-checking is always fresh, never cached — content
//              deleted between two checks flips AVAILABLE back to
//              NOT_AVAILABLE; checking never touches a publication
//              catalog, an anchor, or a placement.
//
// See docs/Principles.md, "Local Content Availability Is An Observation,
// Not A Verdict (0.8.33)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    assert(threw !== null, message);
}

async function expectRejects(promise, message) {
    let threw = null;
    try { await promise; } catch (e) { threw = e; }
    assert(threw !== null, message);
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
    let placement = new PublicationSnapshotPlacement({ ...fields, placerIdentity: identityProvider.getSigningIdentity().toJSON() });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — CheckLocalSnapshotContentAvailabilityUseCase argument
    // handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => new CheckLocalSnapshotContentAvailabilityUseCase(null), '1. a ContentStore is required');
        expectThrows(() => new CheckLocalSnapshotContentAvailabilityUseCase({}), '2. a ContentStore-shaped object (has()/get()) is required');

        const useCase = new CheckLocalSnapshotContentAvailabilityUseCase(new LocalContentStore(new InMemoryStorageProvider()));
        await expectRejects(useCase.execute(null), '3. a publication is required');
        await expectRejects(useCase.execute({ id: 'pub-x' }), '4. a publication with a contentReference is required');
        await expectRejects(useCase.execute({ id: 'pub-x', contentReference: new ContentReference({ hash: null }) }), '5. a contentReference with a hash is required');
    }
    console.log('✓ Section A: CheckLocalSnapshotContentAvailabilityUseCase argument handling');

    // ---------------------------------------------------------------
    // Section B — pure view functions
    // ---------------------------------------------------------------
    {
        const idle = describeLocalSnapshotContentAvailability(null);
        assert(idle.checking === false && idle.checked === false && idle.outcome === null && idle.label === 'Not yet checked' && idle.message === null,
            '1. idle (never checked) reports checking:false, checked:false, no outcome, no message');

        const checking = describeLocalSnapshotContentAvailability({ checking: true });
        assert(checking.checking === true && checking.checked === false && checking.label === 'Checking…',
            '2. an in-flight check reports checking:true, checked:false');

        const available = describeLocalSnapshotContentAvailability({ outcome: LocalSnapshotContentAvailabilityOutcome.AVAILABLE });
        assert(available.checked === true && available.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '3. a completed AVAILABLE check reports checked:true with the outcome carried through');
        assert(available.message === "Local snapshot is available and matches the publication's content hash.",
            '4. AVAILABLE carries the exact, deliberately unhedged sentence — never "verified"/"trusted"/"authentic"/"confirmed"');

        const notAvailable = describeLocalSnapshotContentAvailability({ outcome: LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE });
        assert(notAvailable.message === 'This replica does not currently hold bytes for this snapshot.',
            '5. NOT_AVAILABLE carries its own distinct sentence');

        const mismatch = describeLocalSnapshotContentAvailability({ outcome: LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH });
        assert(mismatch.message !== notAvailable.message && mismatch.message.includes('no longer match'),
            '6. CONTENT_HASH_MISMATCH is worded as a distinct, definite finding — never conflated with NOT_AVAILABLE');

        assert(describeAvailabilityOutcomeLabel(LocalSnapshotContentAvailabilityOutcome.AVAILABLE) === 'Available', '7. AVAILABLE label');
        assert(describeAvailabilityOutcomeLabel(LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE) === 'Not available', '8. NOT_AVAILABLE label');
        assert(describeAvailabilityOutcomeLabel(LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH) === 'Hash mismatch', '9. CONTENT_HASH_MISMATCH label');
        assert(describeAvailabilityOutcomeMessage('not-a-real-outcome') === null, '10. an unrecognized outcome yields no message');

        assert(describeAvailabilityCheckButtonLabel({}) === 'Check Local Snapshot', '11. idle button label');
        assert(describeAvailabilityCheckButtonLabel({ checking: true }) === 'Checking…', '12. in-flight button label');
        assert(describeAvailabilityCheckButtonLabel({ checked: true }) === 'Check Again', '13. post-check button label');
    }
    console.log('✓ Section B: pure view functions over every outcome plus idle/checking');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: three replicas that all know the same
    // publication, in materially different local content states
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-local-availability';
        const SNAPSHOT_BYTES = JSON.stringify({ hello: 'flagship local availability bytes' });

        // --- Alice: publishes P, holds S locally, places it on IPFS,
        // builds both a replica package and a transfer package. ---
        const alice = makeIdentity('Alice-Availability');
        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const contentReference = aliceContentStore.put(SNAPSHOT_BYTES);

        const publication = signPublication(alice, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference });
        const placement = signPlacement(alice, { publicationId: PUBLICATION_ID, contentHash: contentReference.hash, storage: 'ipfs', locator: 'ipfs://CID-local-availability' });

        const alicePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        alicePublicationCatalog.add(publication);

        const replicaPackage = buildPublicationReplicaPackage(publication, { anchors: [], placements: [placement] });
        const aliceSnapshotBuilder = new BuildPublicationSnapshotTransferPackageUseCase({ publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore });
        const transferPackage = await aliceSnapshotBuilder.execute(PUBLICATION_ID);

        // --- Bob: imports only the replica package. He knows P and
        // exactly where the placement CLAIMS the bytes are retrievable,
        // and never possesses them. ---
        const bobPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const bobPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());

        const bobPublicationExchange = new PublicationExchange(bobPublicationCatalog, new LocalAuthorizationVerifier());
        const bobAnchorExchange = new PublicationAnchorExchange(bobAnchorCatalog, new LocalAuthorizationVerifier());
        const bobPlacementExchange = new PublicationSnapshotPlacementExchange(bobPlacementCatalog, new LocalAuthorizationVerifier());
        new ImportPublicationReplicaPackageUseCase(bobPublicationExchange, bobAnchorExchange, bobPlacementExchange).execute(replicaPackage);

        assert(bobPlacementCatalog.findByPublicationId(PUBLICATION_ID)[0].locator === 'ipfs://CID-local-availability',
            '1. Bob knows exactly where the snapshot is CLAIMED to be retrievable');

        const bobChecker = new CheckLocalSnapshotContentAvailabilityUseCase(bobContentStore);
        const bobResult = await bobChecker.execute(bobPublicationCatalog.get(PUBLICATION_ID));
        assert(bobResult.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
            '2. Bob\'s local availability check reports NOT_AVAILABLE — knowing a placement claim is not possessing the bytes');
        assert(bobResult.publicationId === PUBLICATION_ID && bobResult.contentHash === contentReference.hash,
            '3. the observation still names the exact publication and content hash being checked');

        // --- Carol: imports the replica package AND the transfer
        // package. Her check reports AVAILABLE. ---
        const carolPublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const carolAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const carolPlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());

        const carolPublicationExchange = new PublicationExchange(carolPublicationCatalog, new LocalAuthorizationVerifier());
        const carolAnchorExchange = new PublicationAnchorExchange(carolAnchorCatalog, new LocalAuthorizationVerifier());
        const carolPlacementExchange = new PublicationSnapshotPlacementExchange(carolPlacementCatalog, new LocalAuthorizationVerifier());
        new ImportPublicationReplicaPackageUseCase(carolPublicationExchange, carolAnchorExchange, carolPlacementExchange).execute(replicaPackage);
        await new ImportPublicationSnapshotTransferPackageUseCase(carolContentStore, carolPublicationCatalog).execute(transferPackage);

        const carolChecker = new CheckLocalSnapshotContentAvailabilityUseCase(carolContentStore);
        const carolResult = await carolChecker.execute(carolPublicationCatalog.get(PUBLICATION_ID));
        assert(carolResult.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '4. Carol\'s local availability check reports AVAILABLE — she possesses the bytes, obtained entirely through offline transfer');
        assert(describeLocalSnapshotContentAvailability({ outcome: carolResult.outcome }).message === "Local snapshot is available and matches the publication's content hash.",
            '5. the displayed sentence is exactly the precise, unhedged claim this milestone allows');

        // --- Dave: imports the replica package, then possesses bytes
        // stored under the CORRECT content-store key that have been
        // corrupted beneath him — simulating storage-layer damage, never
        // anything a normal put()/transfer path could itself cause. ---
        const davePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const daveAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const davePlacementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const daveStorageProvider = new InMemoryStorageProvider();
        const daveContentStore = new LocalContentStore(daveStorageProvider);

        const davePublicationExchange = new PublicationExchange(davePublicationCatalog, new LocalAuthorizationVerifier());
        const daveAnchorExchange = new PublicationAnchorExchange(daveAnchorCatalog, new LocalAuthorizationVerifier());
        const davePlacementExchange = new PublicationSnapshotPlacementExchange(davePlacementCatalog, new LocalAuthorizationVerifier());
        new ImportPublicationReplicaPackageUseCase(davePublicationExchange, daveAnchorExchange, davePlacementExchange).execute(replicaPackage);
        await new ImportPublicationSnapshotTransferPackageUseCase(daveContentStore, davePublicationCatalog).execute(transferPackage);

        // Corrupt the bytes in place, directly through the underlying
        // storage — bypassing put() entirely, exactly as real storage
        // corruption or manual tampering would.
        daveStorageProvider.save('content:' + contentReference.hash, 'these-bytes-were-corrupted-after-storage');

        const daveChecker = new CheckLocalSnapshotContentAvailabilityUseCase(daveContentStore);
        const daveResult = await daveChecker.execute(davePublicationCatalog.get(PUBLICATION_ID));
        assert(daveResult.outcome === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH,
            '6. Dave\'s local availability check reports CONTENT_HASH_MISMATCH — bytes are present but no longer verify');
        assert(daveResult.outcome !== bobResult.outcome,
            '7. INVARIANT: "no bytes here" (Bob) and "the wrong bytes are here" (Dave) are reported as distinct, never-conflated outcomes');

        console.log('  8. Three replicas, one publication: Bob (NOT_AVAILABLE), Carol (AVAILABLE), Dave (CONTENT_HASH_MISMATCH) — knowing a publication is not possessing its content, and possessing bytes is not the same as those bytes still being intact');
    }
    console.log('✓ Section C: FLAGSHIP — three replicas, three distinct local content states for the identical publication');

    // ---------------------------------------------------------------
    // Section D — always fresh, never cached; touches no publication,
    // anchor, or placement catalog
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-section-d-availability';
        const SNAPSHOT_BYTES = 'section-d-availability-bytes';

        const frank = makeIdentity('Frank-Availability');
        const storageProvider = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const contentReference = contentStore.put(SNAPSHOT_BYTES);
        const publication = signPublication(frank, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference });

        const checker = new CheckLocalSnapshotContentAvailabilityUseCase(contentStore);

        const firstCheck = await checker.execute(publication);
        assert(firstCheck.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '1. bytes are present — AVAILABLE');

        // Delete the bytes directly from the underlying storage (this
        // class exposes no delete operation of its own — see this
        // milestone's own docs/Roadmap.md "Deliberately excluded" list).
        storageProvider.remove('content:' + contentReference.hash);

        const secondCheck = await checker.execute(publication);
        assert(secondCheck.outcome === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
            '2. re-checking after the bytes are removed reports NOT_AVAILABLE — never cached from the earlier AVAILABLE result');

        // Restore the bytes: a third check reports AVAILABLE again, with
        // no memory of the NOT_AVAILABLE result in between.
        contentStore.put(SNAPSHOT_BYTES);
        const thirdCheck = await checker.execute(publication);
        assert(thirdCheck.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '3. re-checking after the bytes are restored reports AVAILABLE again — always a fresh read, never a stale memory');
    }
    console.log('✓ Section D: always fresh, never cached — a plain re-read of present local state on every call');

    console.log('\n✅ All LocalSnapshotContentAvailability tests passed');
}

run().catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
