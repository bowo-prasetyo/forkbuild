import { readFile } from 'node:fs/promises';

import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';

// 0.9.133 — Snapshot Location Discovery via Nostr.
//
// content/ArweaveContentStore.js (0.9.132) closed the STORAGE half of the
// gap tests/SnapshotDistributionBoundary.test.js (0.9.131) named — a
// Snapshot's bytes can be placed on Arweave and handed back a real
// `ContentReference{ hash, uri, storage }`. This milestone closes the
// DISCOVERY half: a way for a second replica, who was never handed that
// `ContentReference` directly, to learn where a Snapshot's bytes claim to
// be retrievable from — via Nostr, explicitly NOT a reuse of application/
// NostrPublicationDiscoveryPublisher.js (0.9.46), per tests/
// SnapshotDistributionBoundary.test.js's own point 4.
//
//   contentReference.hash
//           │
//           │ identifies content
//           ▼
//        Snapshot
//
//   Arweave transaction ID
//           │
//           │ locates content
//           ▼
//    Arweave snapshot
//
//   Nostr event
//           │
//           │ discovers locator
//           ▼
//   Arweave snapshot
//
// Nostr does not store the Snapshot. It announces evidence that CAN LEAD
// to its storage location. The Arweave transaction ID does not become the
// Snapshot's identity, and finding a Nostr record is not verification —
// see the flagship negative case below.
//
//   Section CONTRACT — one direct check per statement below:
//     1. Snapshot identity is content-hash based
//     2. Locator is distinct from identity
//     3. Nostr is discovery-only — no snapshot bytes ride in an event
//     4. The Nostr publisher/query service are injected — no window.nostr
//     5. Signed Claim distribution remains untouched
//     6. Snapshot placement remains untouched
//     7. Discovery evidence is not verification
//     8. Multiple discovery records don't automatically become ranking
//   Section SEQUENCE — the flagship scenario: create a snapshot, place it
//     on Arweave, publish discovery to Nostr, query Nostr, resolve the
//     locator, retrieve the bytes, verify identity — then break each half
//     independently, and prove a false discovery record is discoverable
//     but never verified.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message, ErrorType = null) {
    let rejected = false;
    let error = null;
    try { await promise; } catch (e) { rejected = true; error = e; }
    assert(rejected, message);
    if (ErrorType) {
        assert(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

// A tiny in-memory stand-in for an Arweave gateway — mirrors tests/
// ArweaveContentStore.test.js's own makeFakeArweaveGateway() exactly.
function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-snapshot-discovery-tx-${counter}`, transaction: { id: `fake-snapshot-discovery-tx-${counter}`, data: material } };
    }
    return { sign };
}

// A tiny in-memory stand-in for a Nostr relay — publishing REALLY stores
// the event, and querying REALLY filters by kind/tag against what was
// published, so the flagship SEQUENCE below drives the real publisher and
// the real query service against one shared network, never two isolated
// fakes that merely assert they were called correctly.
function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const NOSTR_SNAPSHOT_DISCOVERY_FILES = [
    'core/SnapshotDiscoveryEnvelope.js',
    'application/NostrSnapshotDiscoveryPublisher.js',
    'application/NostrSnapshotDiscoveryQueryService.js'
];

async function run() {
    // ===============================================================
    // Section CONTRACT — one direct check per statement in this file's
    // own header.
    // ===============================================================

    // 1 — Snapshot identity is content-hash based: discovery associates
    // the locator with contentReference.hash.
    {
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();

        const bytes = JSON.stringify({ world: { buildings: [{ id: 'b1' }] } });
        const reference = await store.put(bytes);

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-1', publishImpl: network.publishImpl });
        const published = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(published !== null, '1a. publishing a discovery record for a real placed snapshot succeeds');

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const [candidate] = await query.search('contract-1');
        assert(candidate.contentHash === reference.hash, '1b. the discovered candidate is keyed by the SAME contentReference.hash the placement produced — never a hand-picked or derived value');

        console.log('✓ 1. Snapshot identity is content-hash based — discovery associates the locator with contentReference.hash');
    }

    // 2 — Locator is distinct from identity: the Arweave transaction ID
    // never replaces the content hash.
    {
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();

        const bytes = 'some snapshot bytes for the locator/identity distinction';
        const reference = await store.put(bytes);
        assert(reference.uri !== 'ar://' + reference.hash, '2a. sanity: the placement itself already keeps the transaction id and the hash distinct');

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-2', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const [candidate] = await query.search('contract-2');
        assert(candidate.locator === reference.uri, '2b. the discovered locator is exactly the ar:// transaction locator');
        assert(candidate.contentHash === reference.hash, '2c. the discovered contentHash is exactly OUR content hash');
        assert(candidate.locator !== candidate.contentHash, '2d. the two fields are never the same string — a locator is never treated as an identity, discovered or otherwise');

        console.log('✓ 2. Locator is distinct from identity — the Arweave transaction ID never replaces the content hash, discovered or otherwise');
    }

    // 3 — Nostr is discovery-only: no snapshot bytes are embedded in, or
    // treated as stored by, a Nostr event.
    {
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();

        const bytes = JSON.stringify({ world: { buildings: Array.from({ length: 20 }, (_, i) => ({ id: `brick-${i}`, marker: 'UNIQUE_SNAPSHOT_PAYLOAD_MARKER' })) } });
        const reference = await store.put(bytes);

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-3', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        assert(network.events.length === 1, '3a. exactly one Nostr event was published');
        const publishedEvent = network.events[0];
        assert(!publishedEvent.content.includes('UNIQUE_SNAPSHOT_PAYLOAD_MARKER'), '3b. the Nostr event\'s own content never embeds the snapshot\'s own bytes — only the envelope\'s three fields');
        const parsedContent = JSON.parse(publishedEvent.content);
        assert(Object.keys(parsedContent).sort().join(',') === 'contentHash,locator,protocol,storage,version', '3c. the event content carries exactly the envelope\'s own fields — nothing else, and never a payload field');

        console.log('✓ 3. Nostr is discovery-only — no snapshot bytes ride in a Nostr event; it announces evidence that can LEAD to a storage location, never the content itself');
    }

    // 4 — the Nostr publisher/query service are injected collaborators —
    // no direct window.nostr access, no new NIP-07/browser adapter.
    {
        for (const file of NOSTR_SNAPSHOT_DISCOVERY_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('window.nostr'), `4a. ${file} never references window.nostr directly`);
            assert(!code.includes('WebSocket'), `4b. ${file} never opens a WebSocket itself — that belongs to whatever publishImpl/queryImpl a caller injects`);
            assert(!code.includes('NostrInjectedProviderPublisher'), `4c. ${file} never imports nostr/NostrInjectedProviderPublisher.js directly — a caller wires a concrete publishImpl in from outside, exactly as every sibling in this family already requires`);
        }
        console.log('✓ 4. the Nostr publisher/query service are injected collaborators — no direct window.nostr access, no new browser adapter built or required');
    }

    // 5 — Signed Claim distribution remains untouched: no imports or calls
    // into PublicationDistribution*, per tests/
    // SnapshotDistributionBoundary.test.js's own point 4.
    {
        for (const file of NOSTR_SNAPSHOT_DISCOVERY_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('PublicationDistribution'), `5a. ${file} never references the PublicationDistribution family`);
            assert(!code.includes('ArweavePublicationMaterialUploader'), `5b. ${file} never references ArweavePublicationMaterialUploader`);
            assert(!code.includes('NostrPublicationDiscoveryPublisher'), `5c. ${file} never references application/NostrPublicationDiscoveryPublisher.js — a deliberately distinct semantic contract, never reused`);
            assert(!code.includes('DecentralizedDiscoveryEnvelope'), `5d. ${file} never references the Signed Claim's own envelope shape`);
        }
        console.log('✓ 5. the Signed Claim distribution family is never imported, constructed, or read by this milestone\'s own files');
    }

    // 6 — Snapshot placement remains untouched: discovery never calls
    // SnapshotPlacementStoreRegistry, SnapshotPlacementResolver, or
    // PublicationSnapshotPlacement's own catalog machinery.
    {
        for (const file of NOSTR_SNAPSHOT_DISCOVERY_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('SnapshotPlacementStoreRegistry'), `6a. ${file} never references SnapshotPlacementStoreRegistry`);
            assert(!code.includes('SnapshotPlacementResolver'), `6b. ${file} never references SnapshotPlacementResolver`);
            assert(!code.includes('PublicationSnapshotPlacement'), `6c. ${file} never references PublicationSnapshotPlacement`);
        }
        console.log('✓ 6. the Snapshot Placement family\'s own signing/catalog/resolution machinery is never imported, constructed, or read by this milestone\'s own files');
    }

    // 7 — Discovery evidence is not verification: finding a Nostr record
    // does not imply the snapshot is valid or trusted. (A behavioral
    // preview — the full flagship negative case is in Section SEQUENCE.)
    {
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-7', publishImpl: network.publishImpl });

        // Nothing stops a caller from announcing a contentHash for a
        // locator that was never actually placed at all — this file
        // performs no placement of its own, and never checks one.
        await publisher.publish({ contentHash: 'a-hash-nobody-ever-actually-placed', locator: 'ar://a-locator-that-may-not-even-exist', storage: 'ar' });

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const [candidate] = await query.search('contract-7');
        assert(candidate !== undefined, '7a. an unverified, self-declared announcement is discoverable exactly like a real one — this milestone performs no placement check before, during, or after publishing');
        assert(candidate.contentHash === 'a-hash-nobody-ever-actually-placed', '7b. the candidate is reported at face value — a claim, never evidence');

        console.log('✓ 7. discovery evidence is not verification — a discovered record is a claim, exactly as discoverable whether or not it is true');
    }

    // 8 — Multiple discovery records don't automatically become ranking —
    // no "best provider" or trust decision is made by this milestone.
    {
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-8', publishImpl: network.publishImpl });

        await publisher.publish({ contentHash: 'shared-hash', locator: 'ar://provider-one', storage: 'ar' });
        await publisher.publish({ contentHash: 'shared-hash', locator: 'ipfs://provider-two', storage: 'ipfs' });

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await query.search('contract-8');
        assert(candidates.length === 2, '8a. BOTH independently-announced locators for the same contentHash are reported — search() never collapses, ranks, or picks a winner among them');

        for (const file of NOSTR_SNAPSHOT_DISCOVERY_FILES) {
            const code = await codeOnlySource(file);
            const forbidden = ['trusted', 'reputation', 'ranking', 'scoring', 'preferred', 'bestProvider'];
            for (const term of forbidden) {
                assert(!code.toLowerCase().includes(term.toLowerCase()), `8b. ${file} never uses "${term}" — no ranking or trust vocabulary anywhere in this milestone`);
            }
        }

        console.log('✓ 8. multiple discovery records are all reported, never ranked, never resolved to a single "best" provider');
    }

    // ===============================================================
    // Section SEQUENCE — the flagship scenario: create, place, publish,
    // query, resolve, retrieve, verify — then break each half
    // independently, and prove a false announcement is discoverable but
    // never verified.
    // ===============================================================
    {
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-snapshot-discovery';

        // create snapshot -> compute contentReference.hash
        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'flagship-building', bricks: 12 }] } });
        const expectedHash = computeContentHash(snapshotBytes);

        // ArweaveContentStore.put() -> receive Arweave locator
        const reference = await store.put(snapshotBytes);
        assert(reference.hash === expectedHash, 'SEQ. 1. the placed reference\'s hash matches the hash computed before placement');

        // publish snapshot discovery event to Nostr
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const publishResult = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(publishResult !== null && publishResult.published === true, 'SEQ. 2. the discovery announcement publishes successfully');

        // query Nostr -> discover event -> resolve snapshot locator
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await query.search(discoveryTag);
        assert(candidates.length === 1, 'SEQ. 3. exactly one discovery event is found');
        const resolvedLocator = await query.resolveLocator(discoveryTag, reference.hash);
        assert(resolvedLocator === reference.uri, 'SEQ. 4. the resolved locator is exactly the locator ArweaveContentStore produced');

        // verify hash/identity relationship — retrieve the bytes from
        // Arweave using nothing but the DISCOVERED locator, and confirm
        // they hash to the DISCOVERED contentHash.
        const discoveredReference = new ContentReference({ hash: candidates[0].contentHash, uri: resolvedLocator, storage: candidates[0].storage });
        const retrievedBytes = await store.get(discoveredReference);
        assert(retrievedBytes === snapshotBytes, 'SEQ. 5. retrieval via the discovered locator returns exactly the original bytes');
        assert(computeContentHash(retrievedBytes) === expectedHash, 'SEQ. 6. the retrieved bytes still hash to the original value');
        assert(discoveredReference.verify(retrievedBytes), 'SEQ. 7. the discovered reference\'s own verify() confirms the retrieved bytes independently — discovery led to a genuinely resolvable, genuinely matching snapshot in this case');

        console.log('✓ SEQUENCE (flagship): create → place on Arweave → publish discovery to Nostr → query → resolve locator → retrieve → verify — one continuous, working round trip');

        // -----------------------------------------------------------
        // Break half 1: Arweave placement succeeds, Nostr publication
        // fails — the Arweave snapshot remains retrievable regardless.
        // -----------------------------------------------------------
        const secondBytes = 'a second snapshot, placed but never successfully announced';
        const secondReference = await store.put(secondBytes);

        const decliningPublisher = new NostrSnapshotDiscoveryPublisher({
            discoveryTag,
            publishImpl: async () => ({ published: false, reason: 'relay declined the event' })
        });
        const declinedResult = await decliningPublisher.publish({ contentHash: secondReference.hash, locator: secondReference.uri, storage: secondReference.storage });
        assert(declinedResult === null, 'SEQ. independence 1a. the discovery announcement genuinely failed to publish');

        const stillRetrieved = await store.get(secondReference);
        assert(stillRetrieved === secondBytes, 'SEQ. independence 1b. the already-placed Arweave snapshot remains perfectly retrievable — a failed Nostr publication never touched it. Discovery and storage are independently failable.');

        // -----------------------------------------------------------
        // Break half 2: Nostr discovery exists, Arweave retrieval fails —
        // the discovery evidence still exists regardless.
        // -----------------------------------------------------------
        const brokenGatewayFetch = async () => new Response('gateway overloaded', { status: 503 });
        const brokenStore = new ArweaveContentStore({ signer, fetchImpl: brokenGatewayFetch });

        await expectRejects(
            brokenStore.get(discoveredReference),
            'SEQ. independence 2a. retrieval genuinely fails against a broken gateway',
            ContentUnavailableError
        );

        const candidatesAfterRetrievalFailure = await query.search(discoveryTag);
        assert(candidatesAfterRetrievalFailure.length === 1 && candidatesAfterRetrievalFailure[0].contentHash === reference.hash,
            'SEQ. independence 2b. the discovery evidence itself is completely unaffected by a retrieval failure — the Nostr network still reports the exact same announcement. Discoverability is not availability.');

        console.log('✓ SEQUENCE (independence): a failed Nostr publication never disturbs an already-placed Arweave snapshot, and a failed Arweave retrieval never disturbs already-published discovery evidence');

        // -----------------------------------------------------------
        // Negative flagship case: a discovery record exists, its locator
        // resolves, content is retrieved from Arweave — but the retrieved
        // bytes do NOT match the announced contentHash. Discovery told us
        // "someone announced this locator." It never told us "the bytes
        // at this locator are the expected Snapshot."
        // -----------------------------------------------------------
        const decoyBytes = 'decoy bytes that really exist at their own real locator';
        const decoyReference = await store.put(decoyBytes);

        // A caller — mistaken or malicious, this file forms no opinion
        // about which — announces decoyReference's own REAL locator
        // paired with a contentHash for bytes that were never placed
        // there at all.
        const falseAnnouncementTag = 'false-announcement-flagship';
        const falsePublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: falseAnnouncementTag, publishImpl: network.publishImpl });
        await falsePublisher.publish({ contentHash: expectedHash, locator: decoyReference.uri, storage: decoyReference.storage });

        const falseCandidates = await query.search(falseAnnouncementTag);
        assert(falseCandidates.length === 1, 'NEG. 1. the false announcement is discoverable — exactly as discoverable as a true one, per CONTRACT 7');

        const falseResolvedLocator = await query.resolveLocator(falseAnnouncementTag, expectedHash);
        assert(falseResolvedLocator === decoyReference.uri, 'NEG. 2. the locator resolves — discovery genuinely produced a usable locator');

        const claimedReference = new ContentReference({ hash: expectedHash, uri: falseResolvedLocator, storage: 'ar' });
        const actuallyRetrievedBytes = await store.get(claimedReference);
        assert(actuallyRetrievedBytes === decoyBytes, 'NEG. 3. retrieval succeeds — the locator genuinely serves SOME bytes');
        assert(computeContentHash(actuallyRetrievedBytes) !== expectedHash, 'NEG. 4. FLAGSHIP NEGATIVE — the retrieved bytes do NOT hash to the announced contentHash: the discovery record was false');
        assert(claimedReference.verify(actuallyRetrievedBytes) === false, 'NEG. 5. FLAGSHIP NEGATIVE — ContentReference#verify() independently confirms the mismatch: discovery ≠ verification. A caller who trusted the Nostr announcement alone, without this verification step, would have accepted the wrong content as the expected Snapshot.');

        console.log('✓ SEQUENCE (negative flagship): a false discovery record is exactly as discoverable as a true one, resolves to a locator that genuinely serves bytes — and verification is the only thing that catches that those bytes are wrong. Discovery is not verification.');
    }

    console.log('\n✅ All Snapshot Location Discovery via Nostr tests passed.');
}

await run();
