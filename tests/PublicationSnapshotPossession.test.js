import { describePublicationSnapshotPossession, isSnapshotPossessed } from '../application/PublicationSnapshotPossessionView.js';
import { describePublicationReplicaContentKnowledge } from '../application/PublicationReplicaContentKnowledgeView.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.8.39 — Local Snapshot Possession & Replica Content Knowledge.
//
//   Section A: describePublicationSnapshotPossession() — a pure reshaping
//              of application/CheckLocalSnapshotContentAvailabilityUseCase
//              .js's own resolved shape (0.8.33), never a second content
//              checker. "Not yet checked" (null/absent) reports
//              `possession.state: null`, never a fabricated outcome.
//   Section B: isSnapshotPossessed() — TRUE only for AVAILABLE; NOT_AVAILABLE,
//              CONTENT_HASH_MISMATCH, and "not yet checked" all report
//              FALSE, deliberately never distinguished from one another
//              by this one bit.
//   Section C: describePublicationReplicaContentKnowledge() — composes
//              `hasPublication` (a plain boolean the caller supplies,
//              mirroring application/PublicationReplicaKnowledgeView.js's
//              own 0.8.28 parameter) with a possession view into
//              `{ publicationId, hasPublication, hasValidSnapshot }`,
//              proving every one of the four combinations is reported as
//              an entirely ordinary, non-contradictory state.
//   Section D: a real application/CheckLocalSnapshotContentAvailabilityUseCase
//              .js, over a real content/LocalContentStore.js, feeding its
//              resolved result through this milestone's own pure views —
//              proving the composition holds for genuine bytes, not just
//              hand-built fixtures. NOT_AVAILABLE -> AVAILABLE -> (storage
//              corrupted beneath the replica) -> CONTENT_HASH_MISMATCH,
//              re-checked fresh each time.
//
// See docs/Principles.md, "Current Snapshot Possession Is A Local
// Observation, Not A Distributed Claim (0.8.39)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    return publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — describePublicationSnapshotPossession()
    // ---------------------------------------------------------------
    {
        const notYetChecked = describePublicationSnapshotPossession(null);
        assert(notYetChecked.possession.state === null, '1. no attempt supplied — possession.state is null, never a fabricated outcome');
        assert(notYetChecked.publicationId === null && notYetChecked.contentHash === null, '2. and neither id nor hash is fabricated either');

        const inFlight = describePublicationSnapshotPossession({ checking: true });
        assert(inFlight.possession.state === null, '3. an in-flight `{ checking: true }` marker is not itself a resolved observation — state stays null');

        for (const outcome of [
            LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE,
            LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH
        ]) {
            const view = describePublicationSnapshotPossession({ publicationId: 'pub-x', contentHash: 'hash-x', outcome });
            assert(view.possession.state === outcome, `4. a resolved ${outcome} attempt is carried through unchanged as possession.state`);
            assert(view.publicationId === 'pub-x' && view.contentHash === 'hash-x', `5. publicationId/contentHash pass through unchanged for ${outcome}`);
        }

        const view = describePublicationSnapshotPossession({ publicationId: 'pub-x', contentHash: 'hash-x', outcome: LocalSnapshotContentAvailabilityOutcome.AVAILABLE });
        assert(Object.isFrozen(view) && Object.isFrozen(view.possession), '6. the returned view, and its nested possession object, are both frozen');
        assert(!('contentReference' in view) && !('checking' in view) && !('checked' in view) && !('label' in view) && !('message' in view),
            '7. the possession view carries NOTHING beyond publicationId/contentHash/possession — no UI-specific fields, no contentReference');
    }
    console.log('✓ Section A: describePublicationSnapshotPossession() — a pure reshaping, never a second content checker');

    // ---------------------------------------------------------------
    // Section B — isSnapshotPossessed()
    // ---------------------------------------------------------------
    {
        assert(isSnapshotPossessed(null) === false, '1. no possession view at all reports NOT possessed');
        assert(isSnapshotPossessed(describePublicationSnapshotPossession(null)) === false, '2. "not yet checked" reports NOT possessed');
        assert(isSnapshotPossessed(describePublicationSnapshotPossession({ outcome: LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE })) === false,
            '3. NOT_AVAILABLE reports NOT possessed');
        assert(isSnapshotPossessed(describePublicationSnapshotPossession({ outcome: LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH })) === false,
            '4. CONTENT_HASH_MISMATCH reports NOT possessed — a definite finding is still not possession');
        assert(isSnapshotPossessed(describePublicationSnapshotPossession({ outcome: LocalSnapshotContentAvailabilityOutcome.AVAILABLE })) === true,
            '5. AVAILABLE, and only AVAILABLE, reports possessed');
    }
    console.log('✓ Section B: isSnapshotPossessed() — true only for AVAILABLE, false for every other state including "not yet checked"');

    // ---------------------------------------------------------------
    // Section C — describePublicationReplicaContentKnowledge()
    // ---------------------------------------------------------------
    {
        const unknown = describePublicationReplicaContentKnowledge({ publicationId: 'pub-x' });
        assert(unknown.hasPublication === false && unknown.hasValidSnapshot === false, '1. defaults: an unknown publication reports both dimensions false');

        const knownNoSnapshot = describePublicationReplicaContentKnowledge({
            publicationId: 'pub-x', hasPublication: true,
            possession: describePublicationSnapshotPossession({ outcome: LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE })
        });
        assert(knownNoSnapshot.hasPublication === true && knownNoSnapshot.hasValidSnapshot === false,
            '2. a publication known locally with no possessed bytes is an entirely ordinary, non-contradictory state');

        const knownWithSnapshot = describePublicationReplicaContentKnowledge({
            publicationId: 'pub-x', hasPublication: true,
            possession: describePublicationSnapshotPossession({ outcome: LocalSnapshotContentAvailabilityOutcome.AVAILABLE })
        });
        assert(knownWithSnapshot.hasPublication === true && knownWithSnapshot.hasValidSnapshot === true, '3. known + possessed — both true');

        const unknownWithSnapshot = describePublicationReplicaContentKnowledge({
            publicationId: 'pub-x', hasPublication: false,
            possession: describePublicationSnapshotPossession({ outcome: LocalSnapshotContentAvailabilityOutcome.AVAILABLE })
        });
        assert(unknownWithSnapshot.hasPublication === false && unknownWithSnapshot.hasValidSnapshot === true,
            '4. INVARIANT: `hasPublication` and `hasValidSnapshot` vary completely independently — even the (unusual but not impossible) case of possessing bytes for a publication this replica has never cataloged is reported plainly, never rejected or coerced');

        assert(Object.isFrozen(knownWithSnapshot), '5. the returned view is frozen');
        assert(Object.keys(knownWithSnapshot).sort().join(',') === 'hasPublication,hasValidSnapshot,publicationId',
            '6. the view carries EXACTLY these three fields — no evidence, no placements, no counts of any kind');

        const missingPossession = describePublicationReplicaContentKnowledge({ publicationId: 'pub-x', hasPublication: true });
        assert(missingPossession.hasValidSnapshot === false, '7. an absent possession argument degrades to "not possessed", never throws');
    }
    console.log('✓ Section C: describePublicationReplicaContentKnowledge() — three independent facts, never merged, never scored');

    // ---------------------------------------------------------------
    // Section D — the real CheckLocalSnapshotContentAvailabilityUseCase
    // (0.8.33), unchanged, feeding this milestone's own pure views
    // ---------------------------------------------------------------
    {
        const identityProvider = makeIdentity('Frank-Possession');
        const storageProvider = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const checker = new CheckLocalSnapshotContentAvailabilityUseCase(contentStore);

        const bytes = JSON.stringify({ possession: '0.8.39' });
        const probe = await contentStore.put(bytes);
        const publication = signPublication(identityProvider, { id: 'pub-possession-d', contentKind: 'forkbuild.structure', contentReference: probe });

        // Not yet stored under THIS publication's own key (the probe put()
        // above wrote it, but a fresh replica would not have called put()
        // at all — simulate that by removing it again before the first check).
        storageProvider.remove('content:' + probe.hash);
        const notAvailable = await checker.execute(publication);
        const notAvailableView = describePublicationSnapshotPossession(notAvailable);
        assert(notAvailableView.possession.state === LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE, '1. a real, empty content store composes to NOT_AVAILABLE');
        assert(isSnapshotPossessed(notAvailableView) === false, '2. and is reported as not possessed');
        const knowledgeWhenAbsent = describePublicationReplicaContentKnowledge({ publicationId: publication.id, hasPublication: true, possession: notAvailableView });
        assert(knowledgeWhenAbsent.hasPublication === true && knowledgeWhenAbsent.hasValidSnapshot === false,
            '3. replica content knowledge: publication known, snapshot not available');

        await contentStore.put(bytes);
        const available = await checker.execute(publication);
        const availableView = describePublicationSnapshotPossession(available);
        assert(availableView.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE, '4. once stored, a fresh check composes to AVAILABLE');
        assert(isSnapshotPossessed(availableView) === true, '5. and is reported as possessed');
        const knowledgeWhenAvailable = describePublicationReplicaContentKnowledge({ publicationId: publication.id, hasPublication: true, possession: availableView });
        assert(knowledgeWhenAvailable.hasValidSnapshot === true, '6. replica content knowledge: publication known, snapshot available');

        // Corrupt the bytes in place, directly through the underlying
        // storage — bypassing put() entirely, exactly as real storage
        // corruption or manual tampering would (mirroring tests/
        // LocalSnapshotContentAvailability.test.js's own Dave scenario).
        storageProvider.save('content:' + probe.hash, 'these-bytes-were-corrupted-after-storage');
        const mismatched = await checker.execute(publication);
        const mismatchedView = describePublicationSnapshotPossession(mismatched);
        assert(mismatchedView.possession.state === LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH, '7. corrupted bytes compose to CONTENT_HASH_MISMATCH');
        assert(isSnapshotPossessed(mismatchedView) === false, '8. and are STILL reported as not possessed — a definite finding is not possession');
        const knowledgeWhenMismatched = describePublicationReplicaContentKnowledge({ publicationId: publication.id, hasPublication: true, possession: mismatchedView });
        assert(knowledgeWhenMismatched.hasValidSnapshot === false, '9. replica content knowledge: publication known, snapshot not available (mismatch collapses to the same boolean as absence — the finer distinction still lives in possession.state)');
        assert(mismatchedView.possession.state !== notAvailableView.possession.state,
            '10. INVARIANT: even though both collapse to hasValidSnapshot:false, the underlying possession.state keeps NOT_AVAILABLE and CONTENT_HASH_MISMATCH distinct — nothing here conflates absence with corruption');
    }
    console.log('✓ Section D: the real 0.8.33 use case, unchanged, feeding this milestone\'s own pure views — NOT_AVAILABLE -> AVAILABLE -> CONTENT_HASH_MISMATCH, always freshly recomputed');

    console.log('\n✅ All PublicationSnapshotPossession tests passed');
}

run().catch((error) => {
    console.error('❌ PublicationSnapshotPossession tests failed:', error);
    process.exitCode = 1;
});
