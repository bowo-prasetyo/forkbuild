import {
    commentaryPublicationTag, snapshotCellTag, snapshotCellTagsAround, SNAPSHOT_CELL_SIZE
} from '../core/NarrowDiscoveryTags.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { ArweaveSnapshotDiscoveryPublisher } from '../application/arweave/ArweaveSnapshotDiscoveryPublisher.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { PublicationCommentaryNostrDistribution } from '../application/publication/commentary/PublicationCommentaryNostrDistribution.js';
import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Announcement Index, Phase 6 (docs/AnnouncementIndex.md): announcements
// carry a narrow tag beside their global one, and readers ask for it.

const EVENT_ID = 'a'.repeat(64);
const TX_ID = 'TxIdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function run() {
    // Section A: tag helpers.
    {
        assert(commentaryPublicationTag('pub-1') === 'forkbuild-commentary:pub-1', 'A1. a Publication\'s commentary tag');
        assert(commentaryPublicationTag('') === null && commentaryPublicationTag(undefined) === null, 'A2. none without a publication id');
        assert(snapshotCellTag({ x: 10, y: 5, z: 999 }) === 'forkbuild-snapshot:cell:0:0', 'A3. a position\'s cell');
        assert(snapshotCellTag({ x: -1, y: 0, z: SNAPSHOT_CELL_SIZE }) === 'forkbuild-snapshot:cell:-1:1', 'A4. negative coordinates floor downwards');
        assert(snapshotCellTag({ x: -0, y: 0, z: 0 }) === 'forkbuild-snapshot:cell:0:0', 'A5. -0 is cell 0');
        assert(snapshotCellTag(null) === null && snapshotCellTag({ x: NaN, z: 0 }) === null, 'A6. none without a finite position');
        const around = snapshotCellTagsAround({ x: 1500, z: -200 });
        assert(around.length === 9 && around.includes('forkbuild-snapshot:cell:1:-1') && around.includes('forkbuild-snapshot:cell:2:0') && around.includes('forkbuild-snapshot:cell:0:-2'), 'A7. a 3x3 block around the player');
        console.log('✓ Section A: tag helpers');
    }

    // Section B: Snapshot announcements carry their cell tag.
    {
        const templates = [];
        const nostr = new NostrSnapshotDiscoveryPublisher({
            discoveryTag: 'forkbuild-snapshot',
            publishImpl: async (_relay, template) => { templates.push(template); return { published: true, id: EVENT_ID }; }
        });
        await nostr.publish({ contentHash: 'h', locator: 'ar://x', storage: 'ar', publicationId: 'p', claimedPosition: { x: 2500, y: 0, z: 10 } });
        await nostr.publish({ contentHash: 'h', locator: 'ar://x', storage: 'ar' });
        assert(JSON.stringify(templates[0].tags) === JSON.stringify([['t', 'forkbuild-snapshot'], ['t', 'forkbuild-snapshot:cell:2:0']]), 'B1. Nostr: global tag plus the cell tag');
        assert(JSON.stringify(templates[1].tags) === JSON.stringify([['t', 'forkbuild-snapshot']]), 'B2. Nostr: no position, no cell tag');

        const uploads = [];
        const arweave = new ArweaveSnapshotDiscoveryPublisher({
            discoveryTag: 'forkbuild-snapshot',
            uploadTaggedTransaction: async (material, tag, extraTags) => { uploads.push({ tag, extraTags }); return { id: TX_ID }; }
        });
        await arweave.publish({ contentHash: 'h', locator: 'ar://x', storage: 'ar', publicationId: 'p', claimedPosition: { x: 0, y: 0, z: -1 } });
        assert(uploads[0].tag.value === 'forkbuild-snapshot' && uploads[0].extraTags[0].value === 'forkbuild-snapshot:cell:0:-1', 'B3. Arweave: the cell tag rides on the same transaction');

        const signed = [];
        const upload = createArweaveTaggedTransactionUpload({
            signer: { sign: async (_material, tags) => { signed.push(tags); return { id: TX_ID, transaction: {} }; } },
            fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '' })
        });
        await upload('m', { name: 'N', value: 'global' }, [{ name: 'N', value: 'narrow' }]);
        assert(JSON.stringify(signed[0]) === JSON.stringify([{ name: 'N', value: 'global' }, { name: 'N', value: 'narrow' }]), 'B4. the upload signs every tag');
        assert(await upload('m', { name: 'N', value: 'global' }, [{ name: '' }]) === null, 'B5. a malformed extra tag declines the upload');
        console.log('✓ Section B: Snapshot cell tags on Nostr and Arweave');
    }

    // Section C: Commentary carries and reads its Publication's tag.
    {
        const events = [];
        const filters = [];
        const envelope = { kind: 'forkbuild.publication-commentary-distribution', publicationId: 'pub-1', commentaryId: 'c1' };
        const nostr = new PublicationCommentaryNostrDistribution({
            publishImpl: async (_relay, template) => { events.push(template); return { published: true, id: EVENT_ID }; },
            queryImpl: async (_relay, filter) => {
                filters.push(filter['#t'][0]);
                return [{ id: EVENT_ID, content: JSON.stringify(envelope) }];
            }
        });
        await nostr.publish(envelope);
        assert(JSON.stringify(events[0].tags) === JSON.stringify([['t', 'forkbuild-commentary'], ['t', 'forkbuild-commentary:pub-1']]), 'C1. Nostr: global and Publication tags');
        const found = await nostr.discover('pub-1');
        assert(JSON.stringify(filters.sort()) === JSON.stringify(['forkbuild-commentary', 'forkbuild-commentary:pub-1']), 'C2. discover(publicationId) reads both tags');
        assert(found.length === 1, 'C3. an event found under both tags is returned once');
        filters.length = 0;
        await nostr.discover();
        assert(JSON.stringify(filters) === JSON.stringify(['forkbuild-commentary']), 'C4. without a publication, only the global tag');

        const searched = [];
        const signedTags = [];
        const fetchImpl = async (url, init) => {
            if (url.endsWith('/graphql')) {
                searched.push(/values: \["([^"]+)"\]/.exec(JSON.parse(init.body).query)[1]);
                return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: { transactions: { edges: [] } } }) };
            }
            return { ok: true, status: 200, headers: { get: () => null }, text: async () => '' };
        };
        const arweave = new PublicationCommentaryArweaveDistribution({
            signer: { sign: async (_material, tags) => { signedTags.push(tags.map((t) => t.value)); return { id: TX_ID, transaction: {} }; } },
            fetchImpl
        });
        await arweave.publish(envelope);
        assert(JSON.stringify(signedTags[0]) === JSON.stringify(['forkbuild-commentary', 'forkbuild-commentary:pub-1']), 'C5. Arweave: both tags on one transaction');
        await arweave.discover('pub-1');
        assert(JSON.stringify(searched.sort()) === JSON.stringify(['forkbuild-commentary', 'forkbuild-commentary:pub-1']), 'C6. Arweave discover(publicationId) searches both tags');
        console.log('✓ Section C: Commentary Publication tags');
    }

    // Section D: readers.
    {
        const contexts = [];
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand: async (context) => { contexts.push(context); return []; } });
        const context = { position: { x: 1, y: 0, z: 2 } };
        await monitor.observe(context);
        assert(contexts[0] === context, 'D1. the Snapshot monitor hands its spatial context to the command, which reads the player\'s cell');

        const index = new AnnouncementIndex({ storage: new InMemoryStorageProvider() });
        const inCell = { contentHash: 'h1', locator: 'ar://1', storage: 'ar', publicationId: 'p', claimedPosition: { x: 10, y: 0, z: 10 } };
        const elsewhere = { contentHash: 'h2', locator: 'ar://2', storage: 'ar', publicationId: 'p', claimedPosition: { x: 5000, y: 0, z: 10 } };
        const unplaced = { contentHash: 'h3', locator: 'ar://3', storage: 'ar' };
        const result = index.record(AnnouncementKind.SNAPSHOT, 'forkbuild-snapshot:cell:0:0', [inCell, elsewhere, unplaced], 'nostr');
        assert(result.added === 1, 'D2. a cell\'s list only holds Snapshots claimed inside that cell');
        assert(index.record(AnnouncementKind.SNAPSHOT, 'forkbuild-snapshot', [elsewhere, unplaced], 'nostr').added === 2, 'D3. the global tag takes any Snapshot');
        console.log('✓ Section D: readers use the narrow tags');
    }

    console.log('\nAll NarrowDiscoveryTags tests passed.');
}

await run().catch((error) => {
    console.error('NarrowDiscoveryTags.test.js FAILED:', error);
    process.exitCode = 1;
});
