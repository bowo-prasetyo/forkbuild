import { publicationShareUrl } from '../core/ForkBuildAppLinks.js';
import {
    canUseShareSheet, copyPublicationShareLink, describePublicationShare, sharePublicationLink
} from '../application/publication/PublicationShareLink.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { executePublicationDistributionCommand } from '../application/publication/distribution/PublicationDistributionCommand.js';
import { assert } from './support/Assert.js';

// Sharing a distributed Publication: the link from where its Signed Claim is
// stored, and the share sheet or clipboard.

const URL = 'https://bowo-prasetyo.github.io/forkbuild/#/view/steem/forkbuild/forkbuild-c-muiesncy-wkg6k1nb';
const onSteem = { material: { state: 'PRESENT', uri: 'steem://forkbuild/forkbuild-c-muiesncy-wkg6k1nb', storage: 'steem' }, discovery: { state: 'PRESENT' } };

// The link.
{
    assert(publicationShareUrl(onSteem.material) === URL, 'a claim on Steem gives the view link');
    for (const material of [{ uri: 'ar://TX1' }, { uri: 'ipfs://bafy' }, { uri: 'steem://Not An Account/x' }, { uri: null }, null]) {
        assert(publicationShareUrl(material) === null, `${JSON.stringify(material)} gives no link`);
    }
    assert(publicationShareUrl(onSteem.material, 'https://example.org/app/') === 'https://example.org/app/#/view/steem/forkbuild/forkbuild-c-muiesncy-wkg6k1nb', 'the app address can be given');
    console.log('✓ the link');
}

// What to offer.
{
    assert(describePublicationShare({ lifecycle: null }) === null, 'nothing before a distribution');
    assert(describePublicationShare({ lifecycle: { material: { state: 'ABSENT' } } }) === null, 'nothing while the claim is not stored');
    const share = describePublicationShare({ lifecycle: onSteem, title: '  Twin House With Rabbits ' });
    assert(share.available && share.url === URL && share.title === 'Twin House With Rabbits' && share.text === 'Twin House With Rabbits, built with ForkBuild', `a Steem claim can be shared (got ${JSON.stringify(share)})`);
    assert(describePublicationShare({ lifecycle: onSteem }).text === 'A build, built with ForkBuild', 'an untitled build still reads');
    const elsewhere = describePublicationShare({ lifecycle: { material: { state: 'PRESENT', uri: 'ar://TX1', storage: 'ar' } } });
    assert(elsewhere.available === false && elsewhere.reason.includes('Steem storage'), 'a claim stored elsewhere says how to get a link');
    console.log('✓ what to offer');
}

// The link follows the distribution record a real distribution writes.
{
    const store = new PublicationDistributionLifecycleMemoryStore();
    const seen = [];
    store.subscribe('pub-1', (_id, lifecycle) => seen.push(describePublicationShare({ lifecycle, title: 'Tower' })));
    await executePublicationDistributionCommand({
        publication: { id: 'pub-1', signature: { signature: 'sig' } },
        serializedMaterial: '{"id":"pub-1"}',
        materialStorage: 'steem',
        discoveryProvider: 'steem',
        steemMaterialStore: { storage: 'steem', put: async () => ({ uri: 'steem://alice/forkbuild-c-x-abcd1234' }) },
        steemPublicationDiscoveryPublisher: { discoveryTag: 'forkbuild-publication', publish: async () => ({ published: true, relayUrl: 'https://steemit.com/x', id: 'x' }) },
        lifecycleStore: store
    });
    assert(seen.length >= 1 && seen.at(-1).available && seen.at(-1).url.endsWith('#/view/steem/alice/forkbuild-c-x-abcd1234'), `recording a Steem distribution makes the link available (got ${JSON.stringify(seen)})`);
    console.log('✓ a real distribution makes the link available');
}

// Sharing and copying.
{
    const share = describePublicationShare({ lifecycle: onSteem, title: 'Tower' });
    const calls = [];
    const phone = {
        share: async (data) => { calls.push(['share', data]); },
        canShare: () => true,
        clipboard: { writeText: async (text) => { calls.push(['copy', text]); } }
    };
    assert(canUseShareSheet(share, phone) && await sharePublicationLink(share, phone) === 'shared', 'a phone opens the share sheet');
    assert(JSON.stringify(calls[0]) === JSON.stringify(['share', { title: 'Tower', text: 'Tower, built with ForkBuild', url: URL }]), 'with the title, text and link');

    const closed = { ...phone, share: async () => { throw Object.assign(new Error('Share canceled'), { name: 'AbortError' }); } };
    assert(await sharePublicationLink(share, closed) === 'cancelled', 'closing the sheet is not an error');
    const refused = { ...phone, share: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } };
    calls.length = 0;
    assert(await sharePublicationLink(share, refused) === 'copied' && calls[0][1] === URL, 'a sheet that fails falls back to copying');

    const desktop = { clipboard: { writeText: async (text) => { calls.push(['copy', text]); } } };
    assert(!canUseShareSheet(share, desktop) && await sharePublicationLink(share, desktop) === 'copied', 'without a share sheet it copies');
    assert(!canUseShareSheet(share, { ...phone, canShare: () => false }), 'a sheet that can\'t take the data is not offered');
    assert(await copyPublicationShareLink(share, { clipboard: { writeText: async () => { throw new Error('denied'); } } }) === 'unavailable', 'a refused clipboard asks to copy by hand');
    assert(await copyPublicationShareLink(share, {}) === 'unavailable', 'no clipboard, the same');
    assert(await copyPublicationShareLink({ available: false }, desktop) === 'unavailable', 'nothing to copy without a link');
    console.log('✓ sharing and copying');
}

console.log('\n✅ All PublicationShareLink tests passed.');
