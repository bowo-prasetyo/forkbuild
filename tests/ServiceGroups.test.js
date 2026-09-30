// ui/serviceGroups.js: a group's services are built once, however many pages
// ask for it and however close together; a failed build is tried again on the
// next request; an unknown or doubly defined group is an error.
import { defineServiceGroup, loadServiceGroups } from '../ui/serviceGroups.js';
import { assert } from './support/Assert.js';

// Built once, even for concurrent requests, and not before it is asked for.
{
    let builds = 0;
    let finish;
    defineServiceGroup('once', () => new Promise((resolve) => { builds++; finish = resolve; }));
    assert(builds === 0, 'a group is not built when it is defined');
    const first = loadServiceGroups(['once']);
    const second = loadServiceGroups(['once']);
    await Promise.resolve();
    assert(builds === 1, 'two pages asking at once share one build');
    finish();
    await Promise.all([first, second]);
    await loadServiceGroups(['once']);
    assert(builds === 1, 'a group already built is not built again');
    console.log('✓ a group is built once, when first asked for');
}

// Several groups at once, and a page with none.
{
    const built = [];
    defineServiceGroup('a', async () => { built.push('a'); });
    defineServiceGroup('b', async () => { built.push('b'); });
    await loadServiceGroups(['a', 'b']);
    assert(built.sort().join() === 'a,b', 'every named group is built');
    await loadServiceGroups([]);
    console.log('✓ several groups load together, and none is a no-op');
}

// A failed build (a module that did not download) is tried again next time.
{
    let attempts = 0;
    defineServiceGroup('flaky', async () => {
        attempts++;
        if (attempts === 1) throw new Error('Failed to fetch dynamically imported module');
    });
    let failed = false;
    try {
        await loadServiceGroups(['flaky']);
    } catch {
        failed = true;
    }
    assert(failed, 'a failed build rejects the load');
    await loadServiceGroups(['flaky']);
    assert(attempts === 2, 'the next load builds it again');
    await loadServiceGroups(['flaky']);
    assert(attempts === 2, 'and once it succeeds, it is kept');
    console.log('✓ a failed build is retried by the next load');
}

// Mistakes are reported, not silently ignored.
{
    let rejected = null;
    try {
        await loadServiceGroups(['no-such-group']);
    } catch (error) {
        rejected = error;
    }
    assert(rejected && /no-such-group/.test(rejected.message), 'loading an unknown group rejects, naming it');
    let threw = false;
    try {
        defineServiceGroup('once', async () => {});
    } catch {
        threw = true;
    }
    assert(threw, 'defining a group twice throws');
    console.log('✓ an unknown or doubly defined group is an error');
}

console.log('\n✅ All ServiceGroups tests passed.');
