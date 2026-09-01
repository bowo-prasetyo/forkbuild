import { readFile } from 'node:fs/promises';
import { DecentralizedWorldDiscoveryLeadRegistry } from '../application/DecentralizedWorldDiscoveryLeadRegistry.js';

// 0.9.26 — Decentralized World Discovery Lead Registry.
//
// See docs/Roadmap.md, "0.9.26 — Decentralized World Discovery Lead
// Registry," for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function leadOf(overrides = {}) {
    return {
        origin: 'dweb:arweave-graphql:https://arweave.net/graphql',
        discoveryTag: 'forkbuild_random_unique',
        uri: 'ar://abc123',
        storage: 'ar',
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. Basic membership: setLead()/listLeads() round-trip.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);

    const leads = registry.listLeads();
    assert(leads.length === 1, 'a single setLead() call produces one entry');
    assert(leads[0] === lead, 'the registry stores the exact same lead reference, never a clone');

    console.log('✓ Basic membership: setLead()/listLeads() round-trip');
}

// ---------------------------------------------------------------------
// 2. Identity is the (origin, discoveryTag, uri) triple — the same uri
//    reported by two different services is two independent leads, never
//    a replacement of one another.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    registry.setLead(leadOf({ origin: 'dweb:service-one' }));
    registry.setLead(leadOf({ origin: 'dweb:service-two' }));

    assert(registry.listLeads().length === 2, 'two services reporting the identical uri produce two independent leads');

    console.log('✓ Identity: same uri from two different origins never collapses into one entry');
}

// ---------------------------------------------------------------------
// 3. Identity also includes discoveryTag: the same origin/uri under two
//    different discovery tags is likewise two independent leads.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    registry.setLead(leadOf({ discoveryTag: 'tag-one' }));
    registry.setLead(leadOf({ discoveryTag: 'tag-two' }));

    assert(registry.listLeads().length === 2, 'the same origin/uri under two discovery tags produces two independent leads');

    console.log('✓ Identity: same origin/uri under two discovery tags never collapses into one entry');
}

// ---------------------------------------------------------------------
// 4. Replacement, not accumulation: setLead() on an existing
//    (origin, discoveryTag, uri) triple replaces, it never appends.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    registry.setLead(leadOf({ storage: 'ar' }));
    registry.setLead(leadOf({ storage: 'ar-v2' }));

    const leads = registry.listLeads();
    assert(leads.length === 1, 'setLead() on an existing triple replaces rather than appending a second lead');
    assert(leads[0].storage === 'ar-v2', 'the replaced lead carries only the latest contribution');

    console.log('✓ Replacement: re-setting the same triple replaces its lead, never accumulates');
}

// ---------------------------------------------------------------------
// 5. Removal is plain absence: no tombstone, no residual entry, and a
//    no-op when removing a triple that was never present.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);
    registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);

    assert(registry.listLeads().length === 0, 'removing the only lead leaves an empty registry, no trace');

    registry.removeLead('never', 'existed', 'at-all');
    assert(registry.listLeads().length === 0, 'removing a triple that was never set is a harmless no-op');

    console.log('✓ Removal: plain absence, no tombstone, no-op on an unknown triple');
}

// ---------------------------------------------------------------------
// 6. removeLead() only removes an exact triple match — changing any one
//    of the three fields misses the entry entirely.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);

    registry.removeLead('some-other-origin', lead.discoveryTag, lead.uri);
    registry.removeLead(lead.origin, 'some-other-tag', lead.uri);
    registry.removeLead(lead.origin, lead.discoveryTag, 'some-other-uri');
    assert(registry.listLeads().length === 1, 'removeLead() with any one field mismatched removes nothing');

    registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);
    assert(registry.listLeads().length === 0, 'removeLead() with the exact triple removes the lead');

    console.log('✓ Removal requires an exact (origin, discoveryTag, uri) match');
}

// ---------------------------------------------------------------------
// 7. Ordering: first-set position is retained across an in-place update;
//    remove-then-re-add places the triple last, as a fresh entry.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const leadA = leadOf({ uri: 'ar://a' });
    const leadB = leadOf({ uri: 'ar://b' });
    const leadC = leadOf({ uri: 'ar://c' });
    registry.setLead(leadA);
    registry.setLead(leadB);
    registry.setLead(leadC);

    assert(registry.listLeads().map((l) => l.uri).join(',') === 'ar://a,ar://b,ar://c', 'initial insertion order is preserved');

    registry.setLead(leadOf({ uri: 'ar://b', storage: 'ar-updated' }));
    assert(registry.listLeads().map((l) => l.uri).join(',') === 'ar://a,ar://b,ar://c', 'updating an existing triple does not move its position');

    registry.removeLead(leadA.origin, leadA.discoveryTag, leadA.uri);
    registry.setLead(leadA);
    assert(registry.listLeads().map((l) => l.uri).join(',') === 'ar://b,ar://c,ar://a', 'remove-then-re-add places the triple last, as a fresh entry');

    console.log('✓ Ordering: stable position on update, last position on remove-then-re-add');
}

// ---------------------------------------------------------------------
// 8. Malformed input degrades silently, never throws, and never changes
//    registry state.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();

    for (const badLead of [
        undefined, null, 'not-a-lead', 7,
        {},
        { origin: 'x' },
        { origin: 'x', discoveryTag: 'y' },
        { origin: '', discoveryTag: 'y', uri: 'z' },
        { origin: 'x', discoveryTag: '', uri: 'z' },
        { origin: 'x', discoveryTag: 'y', uri: '' },
        { origin: 42, discoveryTag: 'y', uri: 'z' }
    ]) {
        registry.setLead(badLead);
    }
    assert(registry.listLeads().length === 0, 'malformed setLead() input never registers a lead');

    registry.setLead(leadOf());
    for (const badArgs of [
        [undefined, 'y', 'z'], [null, 'y', 'z'], ['', 'y', 'z'], [42, 'y', 'z'],
        ['x', undefined, 'z'], ['x', '', 'z'],
        ['x', 'y', undefined], ['x', 'y', '']
    ]) {
        registry.removeLead(...badArgs);
    }
    assert(registry.listLeads().length === 1, 'malformed removeLead() input never throws and changes nothing');

    console.log('✓ Malformed input degrades silently for both setLead() and removeLead(), never throws');
}

// ---------------------------------------------------------------------
// 9. Freezing and reference identity: listLeads() returns a fresh, frozen
//    array every call; the lead objects inside are the exact same
//    references handed to setLead(), never cloned.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    const lead = leadOf();
    registry.setLead(lead);

    const first = registry.listLeads();
    const second = registry.listLeads();
    assert(Object.isFrozen(first), 'listLeads() result is frozen');
    assert(first !== second, 'listLeads() returns a fresh array on every call');
    assert(first[0] === lead, 'the registry stores the exact same lead reference, never a clone');

    console.log('✓ Freezing: fresh frozen array per call, lead references preserved unchanged');
}

// ---------------------------------------------------------------------
// 10. clear() empties the registry and it behaves exactly as fresh
//     afterward.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    registry.setLead(leadOf({ uri: 'ar://a' }));
    registry.setLead(leadOf({ uri: 'ar://b' }));
    registry.clear();

    assert(registry.listLeads().length === 0, 'clear() removes every lead');

    registry.setLead(leadOf({ uri: 'ar://c' }));
    assert(registry.listLeads().length === 1 && registry.listLeads()[0].uri === 'ar://c', 'the registry accepts new leads normally after clear()');

    console.log('✓ clear() empties the registry and it works normally afterward');
}

// ---------------------------------------------------------------------
// 11. Per-instance isolation: two registries never share state.
// ---------------------------------------------------------------------
{
    const registryOne = new DecentralizedWorldDiscoveryLeadRegistry();
    const registryTwo = new DecentralizedWorldDiscoveryLeadRegistry();

    registryOne.setLead(leadOf());

    assert(registryOne.listLeads().length === 1, 'registryOne holds the lead it was given');
    assert(registryTwo.listLeads().length === 0, 'registryTwo is unaffected by registryOne');

    console.log('✓ Per-instance isolation: two registries never share state');
}

// ---------------------------------------------------------------------
// 12. subscribe(): notified only on an actual membership change, listener
//     isolation, and idempotent unsubscribe.
// ---------------------------------------------------------------------
{
    const registry = new DecentralizedWorldDiscoveryLeadRegistry();
    let notifications = 0;
    const unsubscribe = registry.subscribe(() => { notifications++; });

    registry.setLead(leadOf());
    assert(notifications === 1, 'setLead() storing a new lead notifies once');

    registry.setLead(leadOf({ storage: 'ar-v2' }));
    assert(notifications === 2, 'setLead() replacing an existing triple still notifies');

    const lead = leadOf({ storage: 'ar-v2' });
    registry.removeLead('missing', 'missing', 'missing');
    assert(notifications === 2, 'a no-op removeLead() never notifies');

    registry.removeLead(lead.origin, lead.discoveryTag, lead.uri);
    assert(notifications === 3, 'an actual removeLead() notifies');

    registry.clear();
    assert(notifications === 3, 'clear() on an already-empty registry never notifies');

    registry.setLead(leadOf());
    assert(notifications === 4, 'setLead() on the now-empty registry notifies once');
    registry.clear();
    assert(notifications === 5, 'clear() on a non-empty registry notifies exactly once');

    unsubscribe();
    registry.setLead(leadOf());
    assert(notifications === 5, 'unsubscribe() stops further notifications');

    unsubscribe();
    registry.setLead(leadOf({ uri: 'ar://another' }));
    assert(notifications === 5, 'calling unsubscribe() twice is a harmless no-op');

    let throwingCalls = 0;
    let normalCalls = 0;
    registry.subscribe(() => { throwingCalls++; throw new Error('boom'); });
    registry.subscribe(() => { normalCalls++; });
    registry.clear();
    assert(throwingCalls === 1 && normalCalls === 1, 'a throwing subscriber never breaks another subscriber or the mutation');
    assert(registry.listLeads().length === 0, 'the mutation that triggered a throwing subscriber still completes normally');

    const noopUnsubscribe = registry.subscribe('not-a-function');
    assert(typeof noopUnsubscribe === 'function', 'subscribe() with a non-function listener still returns a callable unsubscribe');
    noopUnsubscribe();

    console.log('✓ subscribe(): change-only notification, listener isolation, idempotent unsubscribe');
}

// ---------------------------------------------------------------------
// 13. Architectural regression: forbidden imports and vocabulary — this
//     file is membership only, never a second World-data registry.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../application/DecentralizedWorldDiscoveryLeadRegistry.js', import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    // Never merges into the World-data registry or derives World data.
    assert(!codeOnly.includes('WorldDiscoverySourceRegistry'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference WorldDiscoverySourceRegistry');
    assert(!codeOnly.includes('WorldEncounter'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference WorldEncounter');
    assert(!codeOnly.includes('ContentReference'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference ContentReference');
    assert(!codeOnly.includes('DecentralizedPublication'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference DecentralizedPublication');

    // No query service or network knowledge.
    assert(!codeOnly.includes('DecentralizedWorldDiscoveryQuery'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference DecentralizedWorldDiscoveryQuery');
    assert(!codeOnly.includes('ArweaveGraphqlDiscoveryQueryService'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference ArweaveGraphqlDiscoveryQueryService');
    assert(!/fetch\(/.test(codeOnly), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never call fetch(...)');
    assert(!codeOnly.includes('WebSocket'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference WebSocket');

    // No storage/persistence.
    assert(!codeOnly.includes('StorageProvider'), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference StorageProvider');
    assert(!/\blocalStorage\b/.test(codeOnly), 'DecentralizedWorldDiscoveryLeadRegistry.js code must never reference localStorage');

    // No trust/tombstone/reconciliation vocabulary of any kind.
    const forbiddenTerms = [
        'trusted', 'trust(', 'verified', 'verify(', 'authority', 'priority', 'weight', 'confidence', 'ranking', 'scoring',
        'tombstone', 'revoke', 'invalidate', 'untrust', 'stale', 'expired',
        'dedup', 'reconcile', 'winner'
    ];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `DecentralizedWorldDiscoveryLeadRegistry.js code must never use "${term}"`);
    }

    console.log('✓ Architectural regression: forbidden imports and vocabulary');
}

console.log('\nAll decentralized world discovery lead registry tests passed.');
