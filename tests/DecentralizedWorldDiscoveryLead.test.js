import { readFile } from 'node:fs/promises';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.24 — Decentralized World Discovery Source Boundary.
//
// See docs/Roadmap.md, "0.9.24 — Decentralized World Discovery Source
// Boundary," for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function leadOf(overrides = {}) {
    return {
        origin: 'dweb:some-search-service',
        discoveryTag: 'forkbuild_random_unique',
        uri: 'ipfs://bafybeigd2example',
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. describeDecentralizedWorldDiscoveryLead: basic shape
// ---------------------------------------------------------------------
{
    const lead = describeDecentralizedWorldDiscoveryLead(leadOf({ storage: 'ipfs' }));

    assert(lead !== null, 'a lead with origin, discoveryTag, and uri is describable');
    assert(lead.origin === 'dweb:some-search-service', 'origin is carried verbatim');
    assert(lead.discoveryTag === 'forkbuild_random_unique', 'discoveryTag is carried verbatim');
    assert(lead.uri === 'ipfs://bafybeigd2example', 'uri is carried verbatim');
    assert(lead.storage === 'ipfs', 'a supplied storage label is carried verbatim');
    assert(Object.isFrozen(lead), 'the lead is frozen');

    console.log('✓ describeDecentralizedWorldDiscoveryLead: basic shape');
}

// ---------------------------------------------------------------------
// 2. storage is optional; everything else is required
// ---------------------------------------------------------------------
{
    const lead = describeDecentralizedWorldDiscoveryLead(leadOf());
    assert(lead !== null, 'a lead with no storage label is still describable');
    assert(lead.storage === null, 'an unsupplied storage label degrades to null');

    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ storage: '' })) !== null, 'an empty-string storage label is still a describable lead');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ storage: '' })).storage === null, 'an empty-string storage label degrades to null, not to an empty string');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ storage: 42 })).storage === null, 'a non-string storage label degrades to null');

    assert(describeDecentralizedWorldDiscoveryLead({}) === null, 'no fields at all degrades to null, never throws');
    assert(describeDecentralizedWorldDiscoveryLead() === null, 'no argument at all degrades to null, never throws');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ origin: '' })) === null, 'an empty origin degrades to null');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ origin: null })) === null, 'a null origin degrades to null');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ discoveryTag: '' })) === null, 'an empty discoveryTag degrades to null');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ discoveryTag: 7 })) === null, 'a non-string discoveryTag degrades to null');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ uri: '' })) === null, 'an empty uri degrades to null');
    assert(describeDecentralizedWorldDiscoveryLead(leadOf({ uri: undefined })) === null, 'a missing uri degrades to null');

    console.log('✓ storage is optional; everything else is required');
}

// ---------------------------------------------------------------------
// 3. discoveryTag and uri are independent identifiers
// ---------------------------------------------------------------------
{
    const leadA = describeDecentralizedWorldDiscoveryLead(leadOf({ origin: 'dweb:service-a', uri: 'ipfs://cid-1' }));
    const leadB = describeDecentralizedWorldDiscoveryLead(leadOf({ origin: 'dweb:service-b', uri: 'ipfs://cid-2' }));

    assert(leadA.discoveryTag === leadB.discoveryTag, 'two independent leads may share the same discovery tag');
    assert(leadA.uri !== leadB.uri, 'each lead names its own uri');
    assert(leadA.origin !== leadB.origin, 'each lead names its own reporting service');

    console.log('✓ discoveryTag and uri are independent identifiers');
}

// ---------------------------------------------------------------------
// 4. storage is open, free-form — never validated against a closed list
// ---------------------------------------------------------------------
{
    const knownStorage = describeDecentralizedWorldDiscoveryLead(leadOf({ storage: 'ipfs' }));
    const unknownStorage = describeDecentralizedWorldDiscoveryLead(leadOf({ storage: 'some-future-backend-nobody-has-heard-of-yet' }));

    assert(knownStorage !== null && knownStorage.storage === 'ipfs', 'a familiar storage label is accepted');
    assert(unknownStorage !== null && unknownStorage.storage === 'some-future-backend-nobody-has-heard-of-yet', 'an unfamiliar storage label is just as valid — storage is open, never a closed enum');

    console.log('✓ storage is open, free-form — never validated against a closed list');
}

// ---------------------------------------------------------------------
// 5. Leads are independent; this file never combines two of them
// ---------------------------------------------------------------------
{
    const leadA = describeDecentralizedWorldDiscoveryLead(leadOf({ origin: 'dweb:service-a', uri: 'ipfs://shared-cid' }));
    const leadB = describeDecentralizedWorldDiscoveryLead(leadOf({ origin: 'dweb:service-b', uri: 'ipfs://shared-cid' }));

    assert(leadA.uri === leadB.uri, 'two leads may report the very same uri');
    assert(leadA !== leadB, 'two leads sharing a uri still remain two entirely separate, uncombined objects');
    assert(leadA.origin !== leadB.origin, 'a shared uri never collapses two leads into one origin');

    console.log('✓ Leads are independent; this file never combines two of them');
}

// ---------------------------------------------------------------------
// 6. `uri`/`storage` line up with core/ContentReference.js's own field names,
//    so an eventual, verified ContentReference can be built without renaming
// ---------------------------------------------------------------------
{
    const lead = describeDecentralizedWorldDiscoveryLead(leadOf({ uri: 'ipfs://cid-example', storage: 'ipfs' }));

    // Standing in for a future, unscheduled retrieval step (0.9.27+):
    // once bytes behind a lead are actually fetched and hashed, the
    // same `uri`/`storage` fields drop straight into a real
    // ContentReference — no field-renaming translation layer required.
    const reference = new ContentReference({ hash: 'sha256:stand-in', uri: lead.uri, storage: lead.storage });
    assert(reference.uri === lead.uri, 'lead.uri lines up with ContentReference#uri');
    assert(reference.storage === lead.storage, 'lead.storage lines up with ContentReference#storage');

    console.log('✓ uri/storage line up with core/ContentReference.js\'s own field names');
}

// ---------------------------------------------------------------------
// 7. Vocabulary boundary: no trust, network, storage-persistence, envelope, or backend vocabulary
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/DecentralizedWorldDiscoveryLead.js', import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    const forbidden = [
        'trust', 'reputation', 'verified', 'authority', 'priority', 'weight', 'confidence',
        'merge', 'combine', 'reconcile', 'dedup', 'rank',
        'fetch(', 'websocket', 'WebSocket', 'gossip', 'socket', 'StorageProvider',
        'ipfs', 'arweave', 'blockchain',
        'objectId', 'signature', 'WorldEncounterKind',
        'ContentReference', 'DecentralizedPublication', 'hash'
    ];
    for (const term of forbidden) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/DecentralizedWorldDiscoveryLead.js code must never use the word "${term}"`);
    }

    console.log('✓ Vocabulary boundary: no trust, network, storage-persistence, envelope, or backend vocabulary');
}

console.log('\nAll decentralized world discovery lead tests passed.');
