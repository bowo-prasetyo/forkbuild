// A build's remix lineage (core/RemixLineage.js): how many builds remix it,
// counted once per remixed document, and what it was remixed from, from the
// parent's own Publication when this device has one, else from the credit
// the remix's license carries.
import { countRemixes, describeRemixSource } from '../core/RemixLineage.js';
import { Publication } from '../publisher/Publication.js';
import { License, LicenseId } from '../core/License.js';
import { assert } from './support/Assert.js';

function publication({ id, documentId, parentDocumentId = null, title = 'A build', author = 'alice', publishedAt = '2026-10-01T00:00:00Z', license = null }) {
    return new Publication({ id, documentId, title, author, providerId: 'local', publishedAt, parentDocumentId, contentHash: 'sha256:00', license });
}

// Counting: one per remixed build, never the build itself, never another's.
{
    const remixes = [
        publication({ id: 'a1', documentId: 'remix-a', parentDocumentId: 'castle' }),
        publication({ id: 'a2', documentId: 'remix-a', parentDocumentId: 'castle' }),
        publication({ id: 'b1', documentId: 'remix-b', parentDocumentId: 'castle' }),
        publication({ id: 'c1', documentId: 'remix-c', parentDocumentId: 'tower' }),
        publication({ id: 'self', documentId: 'castle', parentDocumentId: 'castle' })
    ];
    assert(countRemixes(remixes, 'castle') === 2, 'a remix published twice, or known twice, counts once');
    assert(countRemixes([...remixes, ...remixes], 'castle') === 2, 'the same Publications from two places count once');
    assert(countRemixes(remixes, 'tower') === 1, 'each build counts its own remixes');
    assert(countRemixes(remixes, 'nobody') === 0, 'a build no one remixed has none');
    assert(countRemixes(remixes, '') === 0 && countRemixes(remixes, null) === 0 && countRemixes(null, 'castle') === 0, 'nothing to count is zero');
    assert(countRemixes([{ parentDocumentId: 'castle' }, null, { parentDocumentId: 'castle', documentId: '' }], 'castle') === 0, 'an entry with no document of its own is not a remix');
    console.log('✓ a build\'s remixes are counted once per remixed build');
}

// The source: the parent's newest Publication first.
{
    const remix = publication({ id: 'r', documentId: 'remix', parentDocumentId: 'castle' });
    const parents = [
        publication({ id: 'p1', documentId: 'castle', title: 'Castle', author: 'bob', publishedAt: '2026-09-01T00:00:00Z' }),
        publication({ id: 'p2', documentId: 'castle', title: 'Castle, rebuilt', author: 'bob', publishedAt: '2026-09-20T00:00:00Z' }),
        publication({ id: 'x', documentId: 'elsewhere', title: 'Not it', author: 'eve', publishedAt: '2026-10-01T00:00:00Z' })
    ];
    const source = describeRemixSource(remix, parents);
    assert(source.title === 'Castle, rebuilt' && source.author === 'bob', `the newest Publication of the parent names it (${JSON.stringify(source)})`);
    assert(describeRemixSource(publication({ id: 'o', documentId: 'original' }), parents) === null, 'a build that isn\'t a remix has no source');
    console.log('✓ the source is named from the parent\'s newest Publication');
}

// Else the credit the remix's license carries, but only for that parent.
{
    const credit = new License({ id: LicenseId.CC_BY_4_0, attribution: { title: ' Old Keep ', author: 'bob', sourceDocumentId: 'keep', sourcePublicationId: 'pk' } });
    const remix = publication({ id: 'r', documentId: 'remix', parentDocumentId: 'keep', license: credit });
    const source = describeRemixSource(remix, []);
    assert(source.title === 'Old Keep' && source.author === 'bob', `the license's credit names it (${JSON.stringify(source)})`);
    const fromJson = describeRemixSource(remix.toJSON(), []);
    assert(fromJson.title === 'Old Keep', 'from a claim\'s JSON too');
    const otherCredit = publication({ id: 's', documentId: 'remix2', parentDocumentId: 'castle', license: credit });
    const unknown = describeRemixSource(otherCredit, []);
    assert(unknown.title === null && unknown.author === null, 'a credit for another build is not used: the source is unknown');
    const blank = describeRemixSource(publication({ id: 'b', documentId: 'remix3', parentDocumentId: 'keep', license: new License({ id: LicenseId.CC_BY_4_0, attribution: { title: '  ', author: '', sourceDocumentId: 'keep' } }) }), []);
    assert(blank.title === null && blank.author === null, 'blank names are unknown');
    console.log('✓ otherwise the credit the remix carries names its source');
}
