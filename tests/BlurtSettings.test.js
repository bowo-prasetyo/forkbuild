import { BlurtReadingConfiguration, DEFAULT_BLURT_API_NODES } from '../core/BlurtReadingConfiguration.js';
import { BlurtAnnouncingConfiguration } from '../core/BlurtAnnouncingConfiguration.js';
import { BlurtReadingConfigurationStore } from '../storage/BlurtReadingConfigurationStore.js';
import { BlurtAnnouncingConfigurationStore } from '../storage/BlurtAnnouncingConfigurationStore.js';
import { BlurtKnownAuthorStore } from '../storage/BlurtKnownAuthorStore.js';
import { SetBlurtReadingConfigurationUseCase } from '../application/settings/SetBlurtReadingConfigurationUseCase.js';
import { SetBlurtAnnouncingConfigurationUseCase } from '../application/settings/SetBlurtAnnouncingConfigurationUseCase.js';
import { blurtPublicationViewUrl, describePublicationClaimLocator, publicationClaimLocatorFromViewPath, publicationViewUrl } from '../core/ForkBuildAppLinks.js';
import { parseBlurtContentLocator } from '../core/BlurtPost.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function throws(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

// Reading settings: nodes, followed accounts and the first month, validated.
{
    const defaults = new BlurtReadingConfiguration();
    assert(defaults.apiNodes.join() === DEFAULT_BLURT_API_NODES.join() && defaults.followedAccounts.length === 0 && defaults.earliestPeriod === '2026-10', 'the defaults');
    const configured = new BlurtReadingConfiguration({ apiNodes: ['https://node.example/ ', 'https://node.example'], followedAccounts: ['@Alice'.toLowerCase(), 'bob'], earliestPeriod: '2026-11' });
    assert(configured.apiNodes.join() === 'https://node.example' && configured.followedAccounts.join() === 'alice,bob', 'trimmed and deduplicated');
    assert(throws(() => new BlurtReadingConfiguration({ apiNodes: ['http://insecure'] }))?.message.includes('https://'), 'only https nodes');
    assert(throws(() => new BlurtReadingConfiguration({ followedAccounts: ['No Spaces'] }))?.message.includes('Blurt account'), 'only account names');
    assert(BlurtReadingConfiguration.fromJSON({ earliestPeriod: 'soon' }) === null, 'a bad saved value reads as none');

    const store = new BlurtReadingConfigurationStore(new InMemoryStorageProvider());
    new SetBlurtReadingConfigurationUseCase({ blurtReadingConfigurationStore: store }).execute({ apiNodes: ['https://n.example'], followedAccounts: [], earliestPeriod: '2026-10' });
    assert(store.get().apiNodes[0] === 'https://n.example', 'saved and read back');
    console.log('✓ reading settings');
}

// The posting account, and the authors a device remembers.
{
    const store = new BlurtAnnouncingConfigurationStore(new InMemoryStorageProvider());
    new SetBlurtAnnouncingConfigurationUseCase({ blurtAnnouncingConfigurationStore: store }).execute({ account: '@alice' });
    assert(store.get().account === 'alice', 'the account, without @');
    assert(throws(() => new BlurtAnnouncingConfiguration({ account: 'x' })) !== null, 'too short to be an account');

    const known = new BlurtKnownAuthorStore(new InMemoryStorageProvider(), { limit: 3 });
    known.remember(['a1a', 'b2b']);
    known.remember(['c3c', 'a1a', 'd4d']);
    assert(known.list().join() === 'c3c,a1a,d4d', `most recent first, at most the limit (got ${known.list()})`);
    console.log('✓ account and known authors');
}

// Links into the app for a Signed Claim stored on Blurt.
{
    const url = blurtPublicationViewUrl('alice', 'forkbuild-c-x');
    assert(url === 'https://bowo-prasetyo.github.io/forkbuild/#/view/blurt/alice/forkbuild-c-x', 'the view link');
    assert(publicationViewUrl('blurt://alice/forkbuild-c-x') === url, 'from the locator');
    assert(describePublicationClaimLocator('blurt://alice/forkbuild-c-x').network === 'blurt', 'a Blurt claim');
    assert(publicationClaimLocatorFromViewPath('/view/blurt/alice/forkbuild-c-x') === 'blurt://alice/forkbuild-c-x', 'the route names the locator');
    assert(publicationClaimLocatorFromViewPath('/view/blurt/Alice!/x') === null, 'a bad name is no locator');
    assert(parseBlurtContentLocator('steem://alice/x') === null, 'a Steem locator is not a Blurt one');
    console.log('✓ links');
}
