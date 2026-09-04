import { readFile } from 'node:fs/promises';

import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.136 — Snapshot Distribution Command.
//
// 0.9.131 through 0.9.135 built and audited a complete, independently
// testable decentralized Snapshot path — placement (`content/
// ArweaveContentStore.js`), discovery (`application/
// NostrSnapshotDiscoveryPublisher.js`), and retrieval (`application/
// DecentralizedSnapshotResolver.js`) — but nothing sequenced placement
// and discovery into one call for a caller who merely wants to
// distribute a Snapshot. `application/SnapshotDistributionCommand.js` is
// that seam. This file proves it holds:
//
//   Section CONTRACT — one direct check per statement below:
//     1.  the command owns orchestration — a caller supplies only bytes
//         and two collaborators, never sequences put()/publish() itself
//     2.  ui/main.js never references this command — no UI wiring exists
//     3.  contentStore.put() is called strictly before
//         discoveryPublisher.publish()
//     4.  discoveryPublisher.publish() receives the ACTUAL locator
//         contentStore.put() produced, never a locator the caller
//         invented
//     5.  the content hash placed and the content hash announced are the
//         same value
//     6.  a contentStore.put() failure prevents discoveryPublisher.publish()
//         from ever being called
//     7.  a discoveryPublisher.publish() failure never undoes the
//         already-successful placement — the content remains retrievable
//     8.  this file never references a wallet, `fetch`, or `WebSocket`
//     9.  this file never constructs an Arweave transaction of any kind
//     10. this file never constructs a Nostr event of any kind
//   Section SEQUENCE — the flagship scenario: create a Snapshot, run it
//     through executeSnapshotDistributionCommand(), then discover,
//     resolve, retrieve, and verify it end to end through the already-
//     existing decentralized Snapshot retrieval path.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch { threw = true; }
    assert(threw, message);
}

// Mirrors tests/DecentralizedSnapshotResolution.test.js's own
// makeFakeArweaveGateway().
function makeFakeArweaveGateway({ log = null, alwaysFail = false } = {}) {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            if (log) log.push('PLACEMENT:PUT');
            if (alwaysFail) return new Response('gateway down', { status: 500 });
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
        return { id: `fake-command-tx-${counter}`, transaction: { id: `fake-command-tx-${counter}`, data: material } };
    }
    return { sign };
}

// Mirrors tests/DecentralizedSnapshotResolution.test.js's own
// makeNostrNetwork() — a real in-memory relay driving the real publisher
// and query service together.
function makeNostrNetwork(log = null) {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        if (log) log.push('DISCOVERY:PUBLISH');
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

async function run() {
    // ===============================================================
    // Section CONTRACT — one direct check per statement in this file's
    // own header.
    // ===============================================================

    // 1 — the command owns orchestration: calling it with only bytes and
    // two collaborators is enough to place AND announce, with no
    // sequencing performed by the test itself.
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-1-orchestration', publishImpl: network.publishImpl });

        const result = await executeSnapshotDistributionCommand({
            bytes: 'Section 1: the command owns orchestration',
            contentStore: store,
            discoveryPublisher: publisher
        });

        assert(result.contentReference && result.contentReference.uri.startsWith('ar://'), '1a. a single call placed the Snapshot and returned its ContentReference');
        assert(result.announcement && result.announcement.published === true, '1b. the SAME call also announced it — the caller never called put()/publish() itself');
        console.log('✓ 1. the command owns orchestration — one call places and announces a Snapshot from bytes and two collaborators alone');
    }

    // 2 — as of 0.9.136 itself, ui/main.js referenced this command nowhere;
    // no UI wiring existed yet for that milestone. 0.9.138 — World View
    // Snapshot Distribution Action — later wired ui/main.js to call
    // executeSnapshotDistributionCommand() directly (see that milestone's
    // own tests/WorldViewSnapshotDistribution.test.js, Section I, for the
    // full architectural boundary this supersedes), exactly the same
    // "composable, not composed" -> "now composed" transition the
    // Publication family's own 0.9.103/0.9.121 milestones already made for
    // application/PublicationDistributionCommand.js. This section now
    // records that later fact instead of re-asserting the superseded one.
    {
        const uiMainCode = await codeOnlySource('ui/main.js');
        assert(uiMainCode.includes('executeSnapshotDistributionCommand('), '2a. ui/main.js now calls executeSnapshotDistributionCommand() directly, wired by 0.9.138 — World View Snapshot Distribution Action');
        console.log('✓ 2. application/SnapshotDistributionCommand.js is a plain, constructible collaborator, wired into ui/main.js by 0.9.138');
    }

    // 3 — contentStore.put() is called strictly before
    // discoveryPublisher.publish() — never the reverse, never concurrent.
    {
        const callLog = [];
        const gateway = makeFakeArweaveGateway({ log: callLog });
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork(callLog);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-3-order', publishImpl: network.publishImpl });

        await executeSnapshotDistributionCommand({ bytes: 'Section 3: call order', contentStore: store, discoveryPublisher: publisher });

        assert(callLog.length === 2, '3a. exactly one placement call and one discovery call happened');
        assert(callLog[0] === 'PLACEMENT:PUT', '3b. placement happened first');
        assert(callLog[1] === 'DISCOVERY:PUBLISH', '3c. discovery happened strictly after placement, never before or interleaved with it');
        console.log('✓ 3. contentStore.put() is always called strictly before discoveryPublisher.publish()');
    }

    // 4 — discoveryPublisher.publish() receives the ACTUAL locator
    // contentStore.put() produced, never one the caller invented.
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();

        let publishedEnvelope = null;
        const spyPublisher = {
            discoveryTag: 'contract-4-real-locator',
            publish: async (envelope) => { publishedEnvelope = envelope; return { published: true, relayUrl: 'wss://relay.example', id: 'f'.repeat(64) }; }
        };

        const result = await executeSnapshotDistributionCommand({ bytes: 'Section 4: the real locator, not an invented one', contentStore: store, discoveryPublisher: spyPublisher });

        assert(publishedEnvelope.locator === result.contentReference.uri, '4a. the locator handed to publish() is exactly contentStore.put()\'s own uri');
        assert(publishedEnvelope.storage === result.contentReference.storage, '4b. ...and its own storage too');
        console.log('✓ 4. discoveryPublisher.publish() always receives the actual locator/storage contentStore.put() produced');
    }

    // 5 — the content hash placed and the content hash announced are the
    // same value.
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-5-hash', publishImpl: network.publishImpl });

        const bytes = 'Section 5: content hash remains unchanged end to end';
        const expectedHash = computeContentHash(bytes);
        const result = await executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });

        assert(result.contentReference.hash === expectedHash, '5a. the placed reference carries the expected content hash');
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const candidates = await query.search('contract-5-hash');
        assert(candidates.length === 1 && candidates[0].contentHash === expectedHash, '5b. the announced discovery record carries the EXACT SAME content hash — never re-derived, never drifted');
        console.log('✓ 5. the content hash placed and the content hash announced are identical, never independently recomputed');
    }

    // 6 — a contentStore.put() failure prevents discoveryPublisher.publish()
    // from ever being called.
    {
        const gateway = makeFakeArweaveGateway({ alwaysFail: true });
        const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        let publishCalls = 0;
        const spyPublisher = {
            discoveryTag: 'contract-6-placement-failure',
            publish: async () => { publishCalls += 1; return { published: true, relayUrl: 'wss://relay.example', id: 'a'.repeat(64) }; }
        };

        await expectRejects(
            executeSnapshotDistributionCommand({ bytes: 'Section 6: placement fails', contentStore: brokenStore, discoveryPublisher: spyPublisher }),
            '6a. the command\'s own promise rejects when placement fails'
        );
        assert(publishCalls === 0, '6b. discoveryPublisher.publish() was NEVER called — Nostr never receives a locator for content that does not exist');
        console.log('✓ 6. a placement failure prevents discovery from ever being attempted');
    }

    // 7 — a discoveryPublisher.publish() failure never undoes the
    // already-successful placement.
    {
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const decliningPublisher = {
            discoveryTag: 'contract-7-discovery-declines',
            publish: async () => null // ordinary decline — malformed input or relay refusal
        };

        const bytes = 'Section 7: discovery declines, placement stands';
        const result = await executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: decliningPublisher });
        assert(result.announcement === null, '7a. a declining discoveryPublisher composes into announcement: null, never a thrown error');
        assert(result.contentReference && result.contentReference.uri.startsWith('ar://'), '7b. the contentReference is still returned — the placement itself was never rolled back');

        // Prove the placement is genuinely still intact, independent of
        // discovery's own outcome, by reading it straight back from the
        // store.
        const readBack = await store.get(result.contentReference);
        assert(readBack === bytes, '7c. the placed content is still genuinely retrievable directly from the store — a declined announcement never undid the placement');

        // A genuine (rejecting) discovery failure is a different case —
        // see this file's own header, "Genuine failure propagates,
        // ordinary decline composes" — but even there, the placement
        // itself, external to this call, is never touched.
        const failingPublisher = {
            discoveryTag: 'contract-7-discovery-throws',
            publish: async () => { throw new Error('relay unreachable'); }
        };
        const secondReference = await store.put('Section 7b: a second snapshot whose own discovery genuinely fails');
        await expectRejects(
            executeSnapshotDistributionCommand({ bytes: 'Section 7b: a second snapshot whose own discovery genuinely fails', contentStore: store, discoveryPublisher: failingPublisher }),
            '7d. a genuinely failing discoveryPublisher.publish() propagates as a rejection'
        );
        const stillIntact = await store.get(secondReference);
        assert(stillIntact === 'Section 7b: a second snapshot whose own discovery genuinely fails', '7e. the placement made just before that rejection is still fully intact and retrievable');

        console.log('✓ 7. a discovery failure — whether an ordinary decline or a genuine rejection — never undoes an already-successful placement');
    }

    // 8, 9, 10 — structural: no wallet/browser API, no Arweave
    // transaction construction, no Nostr event construction.
    {
        const code = await codeOnlySource('application/SnapshotDistributionCommand.js');

        const walletBrowserTerms = ['wallet', 'fetch(', 'WebSocket', 'window.', 'navigator.'];
        for (const term of walletBrowserTerms) {
            assert(!code.includes(term), `8. application/SnapshotDistributionCommand.js never references '${term}' — no direct wallet/browser API`);
        }

        const arweaveTermsForbidden = ['ArweaveContentStore', 'signer.sign', 'transaction', 'gatewayUrl'];
        for (const term of arweaveTermsForbidden) {
            assert(!code.includes(term), `9. application/SnapshotDistributionCommand.js never references '${term}' — no direct Arweave transaction construction`);
        }

        const nostrTermsForbidden = ['NostrSnapshotDiscoveryPublisher', 'relayUrl', 'eventTemplate', 'kind:', 'tags:'];
        for (const term of nostrTermsForbidden) {
            assert(!code.includes(term), `10. application/SnapshotDistributionCommand.js never references '${term}' — no direct Nostr protocol handling`);
        }

        console.log('✓ 8, 9, 10. application/SnapshotDistributionCommand.js contains no wallet/browser API, no Arweave transaction construction, and no Nostr protocol handling — every one of those stays inside the injected collaborators');
    }

    // ===============================================================
    // Section SEQUENCE — the flagship scenario: create, distribute
    // through ONE command call, then discover, resolve, retrieve, and
    // verify end to end through the already-existing retrieval path.
    // ===============================================================
    {
        const gateway = makeFakeArweaveGateway();
        const signer = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-snapshot-distribution-command';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        // create Snapshot
        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'flagship-command-building', bricks: 4 }] } });
        const expectedHash = computeContentHash(snapshotBytes);

        // invoke distribution command
        const distributed = await executeSnapshotDistributionCommand({
            bytes: snapshotBytes,
            contentStore: store,
            discoveryPublisher: publisher
        });
        assert(distributed.contentReference.hash === expectedHash, 'SEQ. 1. the command\'s own placement produced the expected content hash');
        assert(distributed.announcement !== null && distributed.announcement.published === true, 'SEQ. 2. the command\'s own discovery announcement genuinely published');

        // discover announcement -> resolve Snapshot -> retrieve bytes ->
        // verify hash, entirely through the ALREADY-EXISTING 0.9.134
        // retrieval path — this milestone builds no new retrieval logic.
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(store);
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);

        const resolved = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'SEQ. 3. the Snapshot this command distributed resolves fully through the existing decentralized retrieval path');
        assert(resolved.locator === distributed.contentReference.uri, 'SEQ. 4. the resolved locator is exactly the one this command\'s own placement produced');
        assert(resolved.bytes === snapshotBytes, 'SEQ. 5. the retrieved bytes are byte-identical to the original Snapshot');
        assert(computeContentHash(resolved.bytes) === expectedHash, 'SEQ. 6. FLAGSHIP: the resolved bytes still hash to the originally-expected contentHash');

        console.log('✓ SEQUENCE: create → executeSnapshotDistributionCommand() → discover → resolve → retrieve → verify, one continuous round trip through a single application-level command');
    }

    // A distribution against a non-Arweave store (content/IpfsContentStore.js)
    // works identically — this command is never Arweave-specific, only
    // ContentStore/duck-type-specific.
    {
        const ipfsNetwork = new Map();
        function fakeCid(text) { return 'bafyFAKE' + computeContentHash(text); }
        async function makeFakeIpfsNode(url, options) {
            const parsed = new URL(url);
            if (parsed.pathname === '/api/v0/add') {
                const blob = options.body.get('file');
                const text = await blob.text();
                const cid = fakeCid(text);
                ipfsNetwork.set(cid, text);
                return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
            }
            if (parsed.pathname === '/api/v0/cat') {
                const cid = parsed.searchParams.get('arg');
                if (!ipfsNetwork.has(cid)) return new Response('not found', { status: 500 });
                return new Response(ipfsNetwork.get(cid), { status: 200 });
            }
            return new Response('unknown route', { status: 404 });
        }
        const ipfsStore = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode });
        const network = makeNostrNetwork();
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'sequence-ipfs-interchangeability', publishImpl: network.publishImpl });

        const result = await executeSnapshotDistributionCommand({ bytes: 'not Arweave-specific', contentStore: ipfsStore, discoveryPublisher: publisher });
        assert(result.contentReference.storage === 'ipfs', 'SEQ. interchangeability. the command works identically against a completely different ContentStore implementation');
        assert(result.announcement.published === true, 'SEQ. interchangeability. ...and discovery still announces it correctly');
        console.log('✓ SEQUENCE (interchangeability): the command is ContentStore-agnostic — a content/IpfsContentStore.js works exactly like content/ArweaveContentStore.js');
    }

    console.log('\n✅ All Snapshot Distribution Command tests passed.');
}

await run();
