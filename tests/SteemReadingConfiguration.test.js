import { SteemReadingConfiguration, DEFAULT_STEEM_API_NODES, DEFAULT_STEEM_EARLIEST_PERIOD } from '../core/SteemReadingConfiguration.js';
import { SteemReadingConfigurationStore } from '../storage/SteemReadingConfigurationStore.js';
import { SetSteemReadingConfigurationUseCase } from '../application/settings/SetSteemReadingConfigurationUseCase.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function throwsWith(fn, text) {
    try {
        fn();
        return false;
    } catch (error) {
        return error.message.includes(text);
    }
}

// Defaults and normalization.
{
    const defaults = new SteemReadingConfiguration();
    assert(JSON.stringify(defaults.apiNodes) === JSON.stringify(DEFAULT_STEEM_API_NODES), 'the default API node');
    assert(JSON.stringify(defaults.threadAccounts) === '["forkbuild"]', 'the default thread account');
    assert(defaults.earliestPeriod === DEFAULT_STEEM_EARLIEST_PERIOD && DEFAULT_STEEM_EARLIEST_PERIOD === '2026-09', 'reading starts at 2026-09');

    const custom = new SteemReadingConfiguration({
        apiNodes: [' https://api.example.org/ ', 'https://api.example.org'],
        threadAccounts: ['@forkbuild', 'mirror-threads'],
        earliestPeriod: '2026-10'
    });
    assert(JSON.stringify(custom.apiNodes) === '["https://api.example.org"]', `nodes are trimmed and deduplicated (got ${custom.apiNodes})`);
    assert(JSON.stringify(custom.threadAccounts) === '["forkbuild","mirror-threads"]', 'a leading @ is dropped');
    console.log('✓ defaults and normalization');
}

// Invalid values are refused with a readable message.
{
    assert(throwsWith(() => new SteemReadingConfiguration({ apiNodes: ['http://api.steemit.com'] }), 'https://'), 'plain http is refused');
    assert(throwsWith(() => new SteemReadingConfiguration({ apiNodes: [] }), 'non-empty'), 'an empty node list is refused');
    assert(throwsWith(() => new SteemReadingConfiguration({ threadAccounts: ['No Such'] }), 'not a Steem account name'), 'a bad account is refused');
    assert(throwsWith(() => new SteemReadingConfiguration({ earliestPeriod: 'September' }), 'YYYY-MM'), 'a bad month is refused');
    assert(throwsWith(() => new SteemReadingConfiguration({ apiNodes: Array.from({ length: 9 }, (_, i) => `https://n${i}.example`) }), 'at most'), 'too many nodes are refused');
    console.log('✓ invalid values are refused');
}

// Saved through the use case, read back through the store.
{
    const store = new SteemReadingConfigurationStore(new InMemoryStorageProvider());
    assert(store.get() === null, 'nothing saved reads as no override');
    const useCase = new SetSteemReadingConfigurationUseCase({ steemReadingConfigurationStore: store });
    useCase.execute({ apiNodes: ['https://api.example.org'], threadAccounts: ['forkbuild'], earliestPeriod: '2026-11' });
    const saved = store.get();
    assert(saved instanceof SteemReadingConfiguration && saved.earliestPeriod === '2026-11' && saved.apiNodes[0] === 'https://api.example.org', 'the saved settings read back');
    assert(throwsWith(() => useCase.execute({ apiNodes: ['ftp://x'], threadAccounts: ['forkbuild'], earliestPeriod: '2026-11' }), 'https://'), 'the use case refuses invalid settings');
    assert(store.get().apiNodes[0] === 'https://api.example.org', 'a refused save leaves the old settings');
    store.clear();
    assert(store.get() === null, 'clearing returns to the defaults');

    const provider = new InMemoryStorageProvider();
    provider.save('steem-reading-configuration', { apiNodes: ['http://old'], threadAccounts: ['forkbuild'], earliestPeriod: '2026-09' });
    assert(new SteemReadingConfigurationStore(provider).get() === null, 'a stored value that no longer validates reads as no override');
    console.log('✓ saving and reading settings');
}

// The composed runtime reads through the configured node and accounts.
{
    const requests = [];
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        requests.push({ url, body });
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: [] }) };
    };
    const runtime = composeSteemRuntime({
        configuration: new SteemReadingConfiguration({ apiNodes: ['https://api.example.org'], threadAccounts: ['forkbuild'], earliestPeriod: '2026-09' }),
        fetchImpl
    });
    const outcome = await runtime.snapshotDiscoveryQueryService.searchWithOutcome('forkbuild-snapshot');
    assert(outcome.outcome === 'empty', `an empty chain reads as empty (got ${outcome.outcome})`);
    assert(requests.length > 0 && requests.every((r) => r.url === 'https://api.example.org' && r.body.method === 'condenser_api.get_content_replies'), 'replies are read from the configured node');
    assert(requests[0].body.params[0] === 'forkbuild' && requests[0].body.params[1] === 'forkbuild-snapshot-2026-09', `the first thread read is September's (got ${requests[0].body.params})`);
    assert(runtime.publicationDiscoveryQueryService.origin === 'dweb:steem:forkbuild', 'the publication service is composed');
    assert(composeSteemRuntime({ fetchImpl: null }) === null, 'without fetch there is no Steem reading');
    console.log('✓ the composed runtime');
}
