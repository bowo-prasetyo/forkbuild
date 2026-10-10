import { familyTreesOf, remixFamily, remixFamilySize } from '../core/RemixFamily.js';
import { assert } from './support/Assert.js';

// A build's family (core/RemixFamily.js): the builds it was remixed from,
// back to the original, and the remixes made of it, from what Publications
// state, as far as this device knows.

function pub(documentId, parentDocumentId = null, { title = documentId, author = 'ana', publishedAt = '2026-10-01T00:00:00Z', license = null } = {}) {
    return { id: `pub-${documentId}-${publishedAt}`, documentId, parentDocumentId, title, author, publishedAt, license };
}

function lookUpOver(publications) {
    return {
        findByDocumentId: (documentId) => publications.filter((p) => p.documentId === documentId),
        findByParentId: (documentId) => publications.filter((p) => p.parentDocumentId === documentId)
    };
}

// original ← mill ← mill-2 (this) ← { mill-3a ← mill-4, mill-3b }
const all = [
    pub('original'),
    pub('mill', 'original', { author: 'ben' }),
    pub('mill-2', 'mill', { author: 'cy' }),
    pub('mill-3a', 'mill-2', { publishedAt: '2026-10-03T00:00:00Z' }),
    pub('mill-3b', 'mill-2', { publishedAt: '2026-10-05T00:00:00Z' }),
    pub('mill-4', 'mill-3a'),
    // Published twice, and known from two places: one remix.
    pub('mill-3b', 'mill-2', { publishedAt: '2026-10-04T00:00:00Z', title: 'older title' })
];

{
    const family = remixFamily(all[2], lookUpOver(all));
    assert(family.ancestors.map((a) => a.documentId).join() === 'original,mill', 'ancestors run oldest first, ending at the parent');
    assert(family.ancestors[1].author === 'ben', 'each ancestor is credited');
    assert(family.build.documentId === 'mill-2', 'the build itself');
    assert(family.remixes.map((r) => r.documentId).join() === 'mill-3b,mill-3a', 'remixes, newest first');
    assert(family.remixes[0].title === 'mill-3b', 'a remix published twice shows its newest Publication');
    assert(family.remixes[1].remixes.map((r) => r.documentId).join() === 'mill-4', 'remixes of remixes, nested');
    assert(remixFamilySize(family) === 5, 'five builds besides this one');
    console.log('✓ a family runs back to the original and down through its remixes');
}

// A parent this device hasn't seen is named from the remix's credit, and the
// line stops there; with no credit it is unnamed.
{
    const credited = pub('copy', 'faraway', { license: { attribution: { sourceDocumentId: 'faraway', title: 'Faraway Castle', author: 'dee' } } });
    const family = remixFamily(credited, lookUpOver([credited]));
    assert(family.ancestors.length === 1 && family.ancestors[0].title === 'Faraway Castle' && family.ancestors[0].author === 'dee', 'the credit names the unseen parent');
    assert(family.ancestors[0].publication === null, 'and it has no Publication to open');
    const uncredited = remixFamily(pub('copy', 'faraway'), lookUpOver([]));
    assert(uncredited.ancestors.length === 1 && uncredited.ancestors[0].title === null, 'with no credit it is unnamed');
    console.log('✓ an unseen parent is named from the credit');
}

// Cycles and self-references never loop or repeat.
{
    const loop = [pub('a', 'b'), pub('b', 'a'), pub('c', 'c')];
    const family = remixFamily(loop[0], lookUpOver(loop));
    assert(family.ancestors.map((m) => m.documentId).join() === 'b', 'a cycle is followed once');
    assert(family.remixes.length === 0, 'a build already in the line is not its own remix');
    assert(remixFamilySize(remixFamily(loop[2], lookUpOver(loop))) === 0, 'a build naming itself as parent has no family');
    console.log('✓ cycles end');
}

// Limits keep a much-remixed build readable, and count what they leave out.
{
    const many = [pub('root'), ...Array.from({ length: 10 }, (_, i) => pub(`r${i}`, 'root')), pub('deep', 'r0'), pub('deeper', 'deep')];
    const family = remixFamily(many[0], lookUpOver(many), { ancestors: 6, depth: 1, remixes: 4 });
    assert(family.remixes.length === 4, 'at most four remixes shown');
    assert(family.remixes.every((r) => r.remixes.length === 0), 'one level deep');
    assert(family.more >= 6, `the rest are counted (${family.more})`);
    console.log('✓ limits are counted, never silently dropped');
}

// A failing lookup shows less, never throws.
{
    const failing = { findByDocumentId: () => { throw new Error('offline'); }, findByParentId: () => { throw new Error('offline'); } };
    const family = remixFamily(pub('x', 'y'), failing);
    assert(family.build.documentId === 'x' && family.remixes.length === 0, 'a failed lookup leaves the family short');
    assert(remixFamily(null, failing).build === null, 'no build, no family');
    console.log('✓ lookups never throw out');
}

// A week's entries: a chain of entries is shown once, from its earliest
// member; an entry with no family isn't shown.
{
    const entries = [all[3], all[2], pub('lonely')];
    const families = familyTreesOf(entries, lookUpOver([...all, entries[2]]));
    assert(families.length === 1 && families[0].build.documentId === 'mill-2', `one tree, from mill-2 (got ${families.map((f) => f.build.documentId)})`);
    console.log('✓ challenge entries share one tree per chain');
}
