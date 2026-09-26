// @environment browser
import { SteemContentStore } from '../content/SteemContentStore.js';
import { createSteemAnnouncer } from '../application/steem/SteemAnnouncer.js';
import { STEEM_CONTENT_PART_MAX_BYTES } from '../core/SteemContentManifest.js';
import { assert } from './support/Assert.js';

// SteemContentStore with the browser's own CompressionStream,
// DecompressionStream and WebCrypto: a build stored in parts and read back.
// The logic is covered in Node by tests/SteemContentStore.test.js.

const posts = new Map([['forkbuild/forkbuild-content-2026-10', { author: 'forkbuild', permlink: 'forkbuild-content-2026-10', allow_replies: true }]]);
const rpc = {
    async getContent(author, permlink) {
        return posts.get(`${author}/${permlink}`) ?? { author: '', permlink: '' };
    },
    async getContentReplies(author, permlink) {
        return [...posts.values()].filter((post) => post.parent_author === author && post.parent_permlink === permlink);
    }
};
let broadcasts = 0;
const broadcaster = {
    async broadcast(account, operations) {
        broadcasts++;
        const [, comment] = operations[0];
        posts.set(`${comment.author}/${comment.permlink}`, { ...comment });
        return { transactionId: `tx${broadcasts}` };
    }
};
let suffix = 0;
const announcer = createSteemAnnouncer({
    rpc,
    getBroadcaster: () => broadcaster,
    getAccount: () => 'alice',
    now: () => new Date('2026-10-05T12:00:00Z'),
    sleep: async () => {},
    randomSuffix: () => `abcdefg${suffix++}`
});
const store = new SteemContentStore({ rpc, announcer, threadAccounts: ['forkbuild'] });

{
    // UUID-like ids barely compress, so this needs parts.
    const bricks = Array.from({ length: 4000 }, (_, i) => ({ id: crypto.randomUUID(), definitionId: 'core:cube', position: [i % 40, 0, Math.floor(i / 40)] }));
    const text = JSON.stringify({ schemaVersion: 2, bricks });
    const events = [];
    const reference = await store.put(text, { onProgress: (state) => events.push(state.phase) });
    assert(broadcasts >= 3, `the build is stored in a manifest and parts (${broadcasts} posts)`);
    assert(text.length > STEEM_CONTENT_PART_MAX_BYTES && events.at(-1) === 'stored', 'progress ends stored');
    const loaded = await store.get(reference);
    assert(loaded === text && reference.verify(loaded), 'the parts read back into the same content in the browser');
    console.log('✓ a build stored in parts and read back in the browser');
}
