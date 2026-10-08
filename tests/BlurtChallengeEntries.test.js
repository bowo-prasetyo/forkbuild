// Challenge entries distributed to Blurt: a build post lists the build's own
// tags (core/BlurtPost.js), the reader passes them on
// (application/blurt/BlurtDiscoveryReader.js), and the Blurt publication
// query answers a build-tag discovery tag (`forkbuild-tag:<tag>`) with the
// posts that list it, so the weekly challenge finds Blurt entries as it finds
// Nostr and Arweave ones.
import { createBlurtDiscoveryReader } from '../application/blurt/BlurtDiscoveryReader.js';
import { createBlurtRpcClient } from '../blurt/BlurtRpcClient.js';
import { BlurtPublicationDiscoveryQueryService } from '../application/blurt/BlurtPublicationDiscoveryQueryService.js';
import { BlurtKnownAuthorStore } from '../storage/BlurtKnownAuthorStore.js';
import { blurtBuildPostOperation, emptyBlurtBuildPost, parseBlurtBuildPost } from '../core/BlurtPost.js';
import { buildTagDiscoveryTag, buildTagOfDiscoveryTag } from '../core/NarrowDiscoveryTags.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { blurtChainTime, fakeBlurtChain } from './support/FakeBlurtChain.js';
import { assert } from './support/Assert.js';

const TAG = 'chapel-20261005';

// A build post as ForkBuild writes one: one publication announcement, and a
// card (with the build's tags) once the post has a view link.
function buildPost({ author, permlink, objectId, tags }) {
    const state = {
        ...emptyBlurtBuildPost(),
        announcements: [{ family: 'publication', envelope: { protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId, uri: `blurt://${author}/${permlink}-claim` } }],
        card: { title: objectId, tags },
        viewUrl: `https://bowo-prasetyo.github.io/forkbuild/#/view/blurt/${author}/${permlink}`
    };
    const [, op] = blurtBuildPostOperation({ author, permlink, state });
    return op;
}

// Section A — a build post's tags are read back, without ForkBuild's own.
{
    const op = buildPost({ author: 'alice', permlink: 'forkbuild-a', objectId: 'pub-a', tags: [TAG, 'garden'] });
    const parsed = parseBlurtBuildPost({ ...op, created: '2026-10-08T10:00:00' });
    assert(parsed.tags.join() === `${TAG},garden`, `A1. the build's own tags, ForkBuild's left out (got ${parsed.tags})`);
    const untagged = parseBlurtBuildPost({ ...buildPost({ author: 'bob', permlink: 'forkbuild-b', objectId: 'pub-b', tags: [] }), created: '2026-10-08T10:00:00' });
    assert(untagged.tags.length === 0, 'A2. a build with no tags lists none');
    const legacy = parseBlurtBuildPost({ ...op, json_metadata: JSON.stringify({ forkbuild: JSON.parse(op.json_metadata).forkbuild }), created: '2026-10-08T10:00:00' });
    assert(legacy && legacy.tags.length === 0, 'A3. a post without a tags list still parses, with none');
    console.log('✓ A. a Blurt build post\'s own tags are read back');
}

// Section B — the build tag a discovery tag names.
{
    assert(buildTagOfDiscoveryTag(buildTagDiscoveryTag(TAG)) === TAG, 'B1. round trip');
    for (const value of ['forkbuild-publication', 'forkbuild-tag:', 'forkbuild-tag:Not A Tag', TAG, null]) {
        assert(buildTagOfDiscoveryTag(value) === null, `B2. ${JSON.stringify(value)} names no build tag`);
    }
    console.log('✓ B. a build-tag discovery tag is read back to its build tag');
}

// Section C — the Blurt publication query answers the week's tag with the posts that list it.
{
    const chain = fakeBlurtChain();
    const plant = (op, ageMs) => {
        const created = blurtChainTime(chain.time - ageMs);
        chain.posts.set(`${op.author}/${op.permlink}`, { ...op, title: 't', body: 'b', created, last_update: created });
    };
    plant(buildPost({ author: 'alice', permlink: 'forkbuild-a', objectId: 'pub-entry', tags: [TAG, 'garden'] }), 60000);
    plant(buildPost({ author: 'bob', permlink: 'forkbuild-b', objectId: 'pub-other', tags: ['castle'] }), 120000);
    const known = new BlurtKnownAuthorStore(new InMemoryStorageProvider());
    const reader = createBlurtDiscoveryReader({ rpc: createBlurtRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }), clock: () => chain.time, knownAuthors: known });
    const service = new BlurtPublicationDiscoveryQueryService({ reader });

    const all = await service.searchEnvelopes('forkbuild-publication');
    assert(all.map((e) => e.objectId).sort().join() === 'pub-entry,pub-other', 'C1. the shared tag still finds every build');
    const entries = await service.searchEnvelopes(buildTagDiscoveryTag(TAG));
    assert(entries.length === 1 && entries[0].objectId === 'pub-entry' && entries[0].origin === 'dweb:blurt', `C2. the week's tag finds only the post that lists it (got ${entries.map((e) => e.objectId)})`);
    assert(entries[0].uri === 'blurt://alice/forkbuild-a-claim', 'C3. with where its Signed Claim is');
    assert((await service.searchEnvelopes(buildTagDiscoveryTag('lighthouse-20261012'))).length === 0, 'C4. a tag no post lists finds nothing');
    assert((await service.searchEnvelopes('forkbuild-snapshot')).length === 0, 'C5. any other tag finds nothing, as before');
    console.log('✓ C. Blurt answers the week\'s tag with the build posts that list it');
}
