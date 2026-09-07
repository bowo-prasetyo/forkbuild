import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    addPublicationCommentary,
    getPublicationCommentaryById,
    getPublicationCommentariesForPublication
} from '../core/PublicationCommentaryCollection.js';

// 0.9.242 — Publication Commentary Domain Boundary. Covers the pure
// domain descriptor (core/PublicationCommentary.js) and its small
// in-memory collection (core/PublicationCommentaryCollection.js) —
// nothing else. No UI, no networking, no persistence adapter, no
// real-time synchronization exists yet for this milestone to test.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — Construction
    // -------------------------------------------------------------
    {
        const commentary = new PublicationCommentary({
            publicationId: 'pub-1',
            authorIdentityId: 'alice',
            content: 'Great work on this piece.'
        });
        assert(typeof commentary.commentaryId === 'string' && commentary.commentaryId.length > 0, 'A1. commentaryId is auto-generated when omitted');
        assert(commentary.publicationId === 'pub-1', 'A2. publicationId is stored verbatim');
        assert(commentary.authorIdentityId === 'alice', 'A3. authorIdentityId is stored verbatim');
        assert(commentary.content === 'Great work on this piece.', 'A4. content is stored verbatim');
        assert(commentary.createdAt instanceof Date && !Number.isNaN(commentary.createdAt.getTime()), 'A5. createdAt defaults to a valid Date');

        const json = commentary.toJSON();
        assert(json.commentaryId === commentary.commentaryId, 'A6. toJSON round-trips commentaryId');
        assert(json.publicationId === 'pub-1', 'A7. toJSON round-trips publicationId');
        assert(typeof json.createdAt === 'string', 'A8. toJSON serializes createdAt as an ISO string');

        const restored = PublicationCommentary.fromJSON(json);
        assert(restored instanceof PublicationCommentary, 'A9. fromJSON restores an instance');
        assert(restored.commentaryId === commentary.commentaryId, 'A10. fromJSON preserves commentaryId');
        assert(restored.content === commentary.content, 'A11. fromJSON preserves content');
    }

    // -------------------------------------------------------------
    // Section B — Validation
    // -------------------------------------------------------------
    {
        const valid = { publicationId: 'pub-1', authorIdentityId: 'alice', content: 'hello' };

        let threw = false;
        try { new PublicationCommentary({ ...valid, commentaryId: '' }); } catch (e) { threw = true; }
        assert(threw, 'B1. rejects an empty commentaryId');

        threw = false;
        try { new PublicationCommentary({ ...valid, publicationId: undefined }); } catch (e) { threw = true; }
        assert(threw, 'B2. rejects a missing publicationId');

        threw = false;
        try { new PublicationCommentary({ ...valid, authorIdentityId: undefined }); } catch (e) { threw = true; }
        assert(threw, 'B3. rejects a missing authorIdentityId');

        threw = false;
        try { new PublicationCommentary({ ...valid, content: undefined }); } catch (e) { threw = true; }
        assert(threw, 'B4. rejects missing content');

        threw = false;
        try { new PublicationCommentary({ ...valid, content: '   ' }); } catch (e) { threw = true; }
        assert(threw, 'B5. rejects whitespace-only content');

        threw = false;
        try { new PublicationCommentary({ ...valid, content: 42 }); } catch (e) { threw = true; }
        assert(threw, 'B6. rejects non-string content');

        threw = false;
        try { new PublicationCommentary({ ...valid, createdAt: 'not-a-date' }); } catch (e) { threw = true; }
        assert(threw, 'B7. rejects an invalid createdAt');

        threw = false;
        try { new PublicationCommentary({}); } catch (e) { threw = true; }
        assert(threw, 'B8. rejects a fully empty descriptor');
    }

    // -------------------------------------------------------------
    // Section C — Publication identity: two commentaries may share a
    // Publication while remaining distinct objects
    // -------------------------------------------------------------
    {
        const c1 = new PublicationCommentary({ publicationId: 'pub-1', authorIdentityId: 'alice', content: 'first' });
        const c2 = new PublicationCommentary({ publicationId: 'pub-1', authorIdentityId: 'bob', content: 'second' });
        assert(c1.publicationId === c2.publicationId, 'C1. both commentaries reference the same Publication');
        assert(c1.commentaryId !== c2.commentaryId, 'C2. yet they remain distinct commentary objects');

        let collection = [];
        collection = addPublicationCommentary(collection, c1);
        collection = addPublicationCommentary(collection, c2);
        const forPub1 = getPublicationCommentariesForPublication(collection, 'pub-1');
        assert(forPub1.length === 2, 'C3. both are returned for that Publication');
        assert(forPub1.includes(c1) && forPub1.includes(c2), 'C4. exactly the two original instances are returned');
    }

    // -------------------------------------------------------------
    // Section D — Publication separation: commentary on different
    // Publications must not cross-contaminate
    // -------------------------------------------------------------
    {
        const c1 = new PublicationCommentary({ publicationId: 'pub-1', authorIdentityId: 'alice', content: 'about P1' });
        const c2 = new PublicationCommentary({ publicationId: 'pub-2', authorIdentityId: 'alice', content: 'about P2' });

        let collection = [];
        collection = addPublicationCommentary(collection, c1);
        collection = addPublicationCommentary(collection, c2);

        const forPub1 = getPublicationCommentariesForPublication(collection, 'pub-1');
        const forPub2 = getPublicationCommentariesForPublication(collection, 'pub-2');
        assert(forPub1.length === 1 && forPub1[0] === c1, 'D1. pub-1 only sees its own commentary');
        assert(forPub2.length === 1 && forPub2[0] === c2, 'D2. pub-2 only sees its own commentary');
        assert(getPublicationCommentariesForPublication(collection, 'pub-3').length === 0, 'D3. an unrelated publicationId returns nothing');
        assert(getPublicationCommentaryById(collection, c1.commentaryId) === c1, 'D4. lookup by id finds the exact instance');
        assert(getPublicationCommentaryById(collection, 'no-such-id') === null, 'D5. lookup by an unknown id returns null, never throws');
    }

    // -------------------------------------------------------------
    // Section E — Document/publication distinction: two Publications
    // from the same Document keep their commentary separate
    // -------------------------------------------------------------
    {
        // The same underlying documentId (D1) produced two different
        // Publications, P1 and P2 — this domain never sees documentId
        // at all, which is itself the point: commentary only ever
        // knows about the Publication, never the Document behind it.
        const documentId = 'doc-1';
        const p1 = 'pub-from-doc1-v1';
        const p2 = 'pub-from-doc1-v2';
        assert(documentId !== p1 && documentId !== p2, 'E0. sanity: documentId is not itself a publicationId');

        const c1 = new PublicationCommentary({ publicationId: p1, authorIdentityId: 'alice', content: 'on the first publish' });
        const c2 = new PublicationCommentary({ publicationId: p2, authorIdentityId: 'alice', content: 'on the second publish' });

        let collection = [];
        collection = addPublicationCommentary(collection, c1);
        collection = addPublicationCommentary(collection, c2);

        assert(getPublicationCommentariesForPublication(collection, p1).length === 1, 'E1. P1 keeps exactly its own commentary');
        assert(getPublicationCommentariesForPublication(collection, p2).length === 1, 'E2. P2 keeps exactly its own commentary');
        assert(getPublicationCommentariesForPublication(collection, p1)[0].publicationId === p1, 'E3. C1 stays attached to P1, never migrates to P2');
    }

    // -------------------------------------------------------------
    // Section F — Content immutability semantics: nothing in this
    // domain lets a later edit re-target an existing commentary
    // -------------------------------------------------------------
    {
        const commentary = new PublicationCommentary({ publicationId: 'pub-1', authorIdentityId: 'alice', content: 'original' });
        const originalPublicationId = commentary.publicationId;

        // Simulate the Document behind pub-1 being edited and
        // re-published as an entirely new Publication — a step this
        // domain has no method for performing on an existing
        // commentary at all.
        const republished = 'pub-1-revision-2';
        assert(republished !== originalPublicationId, 'F1. sanity: the new Publication has a different id');
        assert(commentary.publicationId === originalPublicationId, 'F2. the existing commentary\'s publicationId is untouched by that later publish');

        assert(typeof commentary.withPublicationId !== 'function', 'F3. there is no method to re-target a commentary to a different Publication');
        assert(typeof commentary.withContent !== 'function', 'F4. there is no edit method at all — a commentary is immutable once created');

        const json = commentary.toJSON();
        json.publicationId = 'tampered';
        assert(commentary.publicationId === originalPublicationId, 'F5. mutating a returned toJSON() plain object never affects the instance');
    }

    // -------------------------------------------------------------
    // Section G — Author identity: different authors may comment on
    // the same Publication without changing Publication identity
    // -------------------------------------------------------------
    {
        const publicationId = 'pub-shared';
        const c1 = new PublicationCommentary({ publicationId, authorIdentityId: 'alice', content: 'alice says hi' });
        const c2 = new PublicationCommentary({ publicationId, authorIdentityId: 'bob', content: 'bob says hi too' });

        assert(c1.authorIdentityId !== c2.authorIdentityId, 'G1. two distinct authors');
        assert(c1.publicationId === c2.publicationId, 'G2. commenting does not fork or change the Publication identity');

        let collection = [];
        collection = addPublicationCommentary(collection, c1);
        collection = addPublicationCommentary(collection, c2);
        const authors = getPublicationCommentariesForPublication(collection, publicationId).map((c) => c.authorIdentityId);
        assert(authors.includes('alice') && authors.includes('bob'), 'G3. both authors\' commentary is retained for the one Publication');
    }

    // -------------------------------------------------------------
    // Section H — No collaboration semantics: this domain must never
    // grow the causal-execution vocabulary the just-closed
    // 0.9.222-0.9.240 collaboration arc owns
    // -------------------------------------------------------------
    {
        const commentary = new PublicationCommentary({ publicationId: 'pub-1', authorIdentityId: 'alice', content: 'hello' });
        const json = commentary.toJSON();

        assert(!('causalPredecessors' in json), 'H1. no causalPredecessors field');
        assert(!('logicalClock' in json), 'H2. no logicalClock field');
        assert(!('operationId' in json), 'H3. no operationId field');
        assert(!('sequence' in json), 'H4. no sequence field');
        assert(!('editedAt' in json), 'H5. no editedAt field — editing is an explicitly deferred decision');
        assert(!('deleted' in json) && !('tombstone' in json), 'H6. no deleted/tombstone field');
        assert(!('replyTo' in json) && !('threadId' in json), 'H7. no threading field');
        assert(!('reactions' in json) && !('likes' in json), 'H8. no reactions/likes field');

        const expectedKeys = ['commentaryId', 'publicationId', 'authorIdentityId', 'content', 'createdAt'].sort();
        assert(JSON.stringify(Object.keys(json).sort()) === JSON.stringify(expectedKeys), 'H9. toJSON exposes exactly the five 0.9.242 fields, nothing more');
    }

    console.log('\n✅ All PublicationCommentary tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationCommentary tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationCommentary tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
