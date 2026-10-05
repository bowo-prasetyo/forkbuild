import { BUILD_TAG_MAX_COUNT, normalizeBuildTag, normalizeBuildTags, suggestBuildTags } from '../core/BuildTags.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { assert } from './support/Assert.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A tag is lowercase a–z, 0–9 and inner hyphens, 2 to 24 characters,
// starting with a letter; ForkBuild's own tags can't be made.
{
    assert(normalizeBuildTag('#Japan') === 'japan' && normalizeBuildTag('Café') === 'cafe' && normalizeBuildTag('Tea House') === 'tea-house', 'case, accents, "#" and spaces');
    assert(normalizeBuildTag('3d') === null && normalizeBuildTag('x') === null && normalizeBuildTag('a'.repeat(25)) === null, 'too short, too long, or not starting with a letter');
    assert(normalizeBuildTag('forkbuild') === null && normalizeBuildTag('forkbuild-snapshot') === null, 'ForkBuild\'s own tags are not a build\'s');
    assert(normalizeBuildTag('日本') === null && normalizeBuildTag(null) === null, 'nothing a tag can be made of');
    assert(same(normalizeBuildTags('#Japan, café  japan tea-house x a b c d e f'), ['japan', 'cafe', 'tea-house']) , `text split, cleaned and each kept once (got ${normalizeBuildTags('#Japan, café  japan tea-house x a b c d e f')})`);
    assert(normalizeBuildTags(['one', 'two', 'three', 'four', 'five', 'six']).length === BUILD_TAG_MAX_COUNT, `at most ${BUILD_TAG_MAX_COUNT}`);
    console.log('✓ tags');
}

// Suggestions: the title's words first, then the description's most
// frequent, without common words or what can't be a tag.
{
    const japanese = suggestBuildTags({
        title: 'A Japanese Traditional House',
        description: 'A traditional house on a raised **stone** plinth.\n\n## Materials\n- Stone plinth\n- Stone steps'
    });
    assert(same(japanese, ['japanese', 'traditional', 'house', 'stone', 'plinth']), `title first, then frequent words (got ${japanese})`);
    assert(same(suggestBuildTags({ title: 'Maison à colombages', description: 'Une maison normande.' }), ['maison', 'colombages', 'normande']), 'accents removed and French filler left out');
    assert(same(suggestBuildTags({ title: '日本の家' }), []), 'no suggestion from other scripts');
    assert(same(suggestBuildTags({ title: 'Untitled ForkBuild World' }), ['world']), 'not "untitled" or "forkbuild"');
    assert(suggestBuildTags({ title: 'one two three alpha beta gamma delta epsilon' }, 2).length === 2, 'at most the count asked for');
    console.log('✓ suggestions');
}

// A document keeps its tags, saved only when it has some, so older
// documents keep their content hash.
{
    const plain = new DocumentMetadata({ title: 'T' });
    assert(same(plain.tags, []) && !('tags' in plain.toJSON()), 'no tags, nothing saved');
    const tagged = new DocumentMetadata({ title: 'T', tags: ['Japan', 'forkbuild', 'temple'] });
    assert(same(tagged.toJSON().tags, ['japan', 'temple']), 'saved cleaned');
    assert(same(DocumentMetadata.fromJSON(tagged.toJSON()).tags, ['japan', 'temple']) && same(DocumentMetadata.fromJSON({ title: 'Old' }).tags, []), 'read back, and absent in older documents');
    tagged.tags = 'garden, Pond';
    assert(same(tagged.tags, ['garden', 'pond']), 'set from text');
    console.log('✓ document metadata');
}

// A fork keeps the tags, as it keeps the description.
{
    const source = new Document({ world: new World(), metadata: new DocumentMetadata({ title: 'Temple', tags: ['japan', 'temple'] }) });
    const fork = new DocumentCloneService().execute(source);
    assert(same(fork.metadata.tags, ['japan', 'temple']), `a fork keeps its source's tags (got ${fork.metadata.tags})`);
    console.log('✓ forks keep tags');
}
