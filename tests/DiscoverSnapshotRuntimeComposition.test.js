import { readFile } from 'node:fs/promises';

import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.142 — World View Snapshot Discovery Command.
// See docs/Roadmap.md, "0.9.142 — World View Snapshot Discovery Command,"
// for the full milestone story.
//
//   Section A: composeDiscoverSnapshotRuntime() builds both real
//              collaborators when both host capabilities are usable
//   Section B: every call builds a fresh, independent pair — no singleton
//   Section C: options are forwarded verbatim to the appropriate
//              collaborator, never reinterpreted here
//   Section D: composition performs no I/O of any kind — construction only
//   Section E: a genuinely malformed (not merely absent) capability still
//              throws at composition time, unchanged
//   Section F: NEGATIVE — no Arweave capability: resolver is still real
//              and genuinely reaches STORE_UNAVAILABLE, never a fake
//              resolution
//   Section G: NEGATIVE — no Nostr capability: resolver is null, never a
//              fabricated one that would silently report NOT_DISCOVERED
//              for every query
//   Section H: FLAGSHIP — a real Snapshot distributed through
//              SnapshotDistributionCommand, then discovered end to end
//              through composeDiscoverSnapshotRuntime() +
//              executeDiscoverSnapshotCommand() alone
//   Section I: architectural regression — no browser API, no
//              orchestration entry point, no summary availability flag

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function makeFakeArweaveGateway({ alwaysFail = false } = {}) {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
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
    return {
        sign: async (material) => {
            counter += 1;
            return { id: `fake-discovery-composition-tx-${counter}`, transaction: { id: `fake-discovery-composition-tx-${counter}`, data: material } };
        }
    };
}

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

async function run() {
    // ---------------------------------------------------------------
    // Section A — both real collaborators when both capabilities usable.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const network = makeNostrNetwork();

        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });

        assert(runtime.contentStore instanceof ArweaveContentStore, '1. runtime.contentStore is a real ArweaveContentStore');
        assert(runtime.resolver instanceof DecentralizedSnapshotResolver, '2. runtime.resolver is a real DecentralizedSnapshotResolver');
        assert(typeof runtime.resolver.resolve === 'function', '3. runtime.resolver exposes a working resolve()');
        assert(Object.isFrozen(runtime), '4. the returned runtime object is frozen');
        assert(runtime.queryService instanceof NostrSnapshotDiscoveryQueryService, '4a. 0.9.151 — runtime.queryService is a real NostrSnapshotDiscoveryQueryService, returned alongside resolver/contentStore');
        assert(typeof runtime.queryService.search === 'function', '4b. runtime.queryService exposes a working search()');

        console.log('✓ Section A: composeDiscoverSnapshotRuntime() builds both real, working collaborators when both host capabilities are usable');
    }

    // ---------------------------------------------------------------
    // Section B — every call builds a fresh, independent pair.
    // ---------------------------------------------------------------
    {
        const optionsFor = () => ({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: makeNostrNetwork().queryImpl }
        });

        const a = composeDiscoverSnapshotRuntime(optionsFor());
        const b = composeDiscoverSnapshotRuntime(optionsFor());

        assert(a.contentStore !== b.contentStore, '5. two composition calls never share a contentStore instance');
        assert(a.resolver !== b.resolver, '6. two composition calls never share a resolver instance');

        console.log('✓ Section B: every composition call builds a fresh, independent resolver/contentStore pair');
    }

    // ---------------------------------------------------------------
    // Section C — options forwarded verbatim, never reinterpreted.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const network = makeNostrNetwork();

        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-discovery-gateway.example' },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl, relayUrl: 'wss://custom-discovery-relay.example' }
        });

        assert(runtime.contentStore.gatewayUrl === 'https://custom-discovery-gateway.example', '7. a custom gatewayUrl is forwarded to the contentStore, not defaulted a second time here');

        // Prove the underlying query service actually used the custom
        // relayUrl by having queryImpl itself observe it.
        let observedRelayUrl = null;
        const relayObservingRuntime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: {},
            nostrSnapshotDiscoveryQueryServiceOptions: {
                relayUrl: 'wss://observed-relay.example',
                queryImpl: async (relayUrl) => { observedRelayUrl = relayUrl; return []; }
            }
        });
        await relayObservingRuntime.resolver.resolve('tag', 'hash');
        assert(observedRelayUrl === 'wss://observed-relay.example', '9. a custom relayUrl is forwarded to the query service, not defaulted a second time here');

        console.log('✓ Section C: constructor options are forwarded verbatim to the appropriate collaborator, never reinterpreted here');
    }

    // ---------------------------------------------------------------
    // Section D — composition performs no I/O of any kind.
    // ---------------------------------------------------------------
    {
        let gatewayCalls = 0;
        let relayCalls = 0;
        let signerCalls = 0;

        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: {
                signer: { sign: async () => { signerCalls += 1; return { id: 'x', transaction: {} }; } },
                fetchImpl: async () => { gatewayCalls += 1; throw new Error('the gateway must never be contacted during composition'); }
            },
            nostrSnapshotDiscoveryQueryServiceOptions: {
                queryImpl: async () => { relayCalls += 1; throw new Error('the relay must never be contacted during composition'); }
            }
        });

        assert(gatewayCalls === 0, '10. composition alone never contacts the Arweave gateway');
        assert(relayCalls === 0, '11. composition alone never contacts the Nostr relay');
        assert(signerCalls === 0, '12. composition alone never invokes the signer');
        assert(runtime.contentStore !== null && runtime.resolver !== null, '13. the runtime is still fully constructed despite doing no I/O');

        console.log('✓ Section D: composeDiscoverSnapshotRuntime() performs no I/O — construction only');
    }

    // ---------------------------------------------------------------
    // Section E — a genuinely malformed (not merely absent) capability
    // still throws at composition time.
    // ---------------------------------------------------------------
    {
        expectThrows(
            () => composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl, gatewayUrl: '' },
                nostrSnapshotDiscoveryQueryServiceOptions: {}
            }),
            '14. a real signer alongside an empty-string gatewayUrl still throws at composition time — absence is forgiven, malformation is not'
        );

        console.log('✓ Section E: a genuinely malformed present capability still throws at composition time — only ABSENCE degrades gracefully');
    }

    // ---------------------------------------------------------------
    // Section F — NEGATIVE: no Arweave capability. The resolver is still
    // real and genuinely reaches STORE_UNAVAILABLE — never a fake
    // resolution, never a collapsed availability flag.
    // ---------------------------------------------------------------
    {
        const network = makeNostrNetwork();
        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: {},
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });

        assert(runtime.contentStore === null, '15. no signer means contentStore is null — no fake/stub store is ever constructed');
        assert(runtime.resolver instanceof DecentralizedSnapshotResolver, '16. the resolver is still real — Arweave\'s absence never blocks discovery/location reporting');
        assert(runtime.queryService instanceof NostrSnapshotDiscoveryQueryService, '16a. 0.9.151 — queryService stays real even with no Arweave capability, the same "resolver depends only on queryImpl" independence');

        // Announce a candidate via the real Nostr network, then resolve
        // through the composed (contentStore-less) runtime: DISCOVERY
        // succeeds, LOCATION honestly fails.
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'composition-discovery-section-f', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: 'section-f-hash', locator: 'ar://section-f-locator', storage: 'ar' });

        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'composition-discovery-section-f',
            contentHash: 'section-f-hash',
            resolver: runtime.resolver,
            contentStore: runtime.contentStore
        });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE,
            '17. with Arweave unavailable, a genuinely discovered candidate honestly reports STORE_UNAVAILABLE — never NOT_DISCOVERED, never a fabricated RESOLVED');

        console.log('✓ Section F: NEGATIVE — no Arweave capability: the resolver stays real, discovery still succeeds, and location honestly reports STORE_UNAVAILABLE');
    }

    // ---------------------------------------------------------------
    // Section G — NEGATIVE: no Nostr capability. resolver is null, never
    // a fabricated one that would silently report NOT_DISCOVERED for
    // every query.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const runtime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: {}
        });

        assert(runtime.resolver === null, '18. no queryImpl means resolver is null — no fake/stub resolver is ever constructed');
        assert(runtime.contentStore instanceof ArweaveContentStore, '19. the contentStore is still real — Nostr\'s absence never blocks Arweave\'s own construction');
        assert(runtime.queryService === null, '19a. 0.9.151 — no queryImpl means queryService is also null, the identical condition resolver already goes null under; the two are never independently absent');

        expectThrows(
            () => executeDiscoverSnapshotCommand({ discoveryTag: 'tag', contentHash: 'hash', resolver: runtime.resolver, contentStore: runtime.contentStore }),
            '20. the unmodified command throws when handed a null resolver — the composition never papers over the absence with a fake collaborator that would silently report NOT_DISCOVERED'
        );

        console.log('✓ Section G: NEGATIVE — no Nostr capability: resolver is null, and the command honestly throws rather than fabricating a resolution');
    }

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: a real Snapshot distributed through
    // SnapshotDistributionCommand, discovered end to end through
    // composeDiscoverSnapshotRuntime() + executeDiscoverSnapshotCommand()
    // alone.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const network = makeNostrNetwork();
        const discoveryTag = 'flagship-discover-snapshot-command';

        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'flagship-discovery-building', bricks: 9 }] } });
        const expectedHash = computeContentHash(snapshotBytes);

        const distributed = await executeSnapshotDistributionCommand({ bytes: snapshotBytes, contentStore: store, discoveryPublisher: publisher });
        assert(distributed.announcement.published === true, 'H1. sanity: the Snapshot was genuinely distributed and announced');

        // A SEPARATE runtime — a discovering replica typically has no
        // signer of its own; this milestone's own contentStore is built
        // fresh from a NEW signer/gateway pair, never reused from the
        // distributing side, proving discovery needs only a queryImpl and
        // its own Arweave read capability.
        const discoveringRuntime = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
        });

        const result = await executeDiscoverSnapshotCommand({
            discoveryTag,
            contentHash: expectedHash,
            resolver: discoveringRuntime.resolver,
            contentStore: discoveringRuntime.contentStore
        });

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'H2. FLAGSHIP — a Snapshot distributed through the (unmodified) distribution command resolves fully through the newly composed discovery runtime');
        assert(result.locator === distributed.contentReference.uri, 'H3. the resolved locator is exactly the one the distributing store produced');
        assert(result.bytes === snapshotBytes, 'H4. the retrieved bytes are byte-identical to the original Snapshot');
        assert(computeContentHash(result.bytes) === expectedHash, 'H5. FLAGSHIP: the resolved bytes still hash to the originally-expected contentHash');

        // NEGATIVE control, same section: a wrong contentHash never
        // resolves, even though a candidate exists under the same tag.
        const wrongHashResult = await executeDiscoverSnapshotCommand({
            discoveryTag,
            contentHash: 'a-hash-nobody-announced',
            resolver: discoveringRuntime.resolver,
            contentStore: discoveringRuntime.contentStore
        });
        assert(wrongHashResult.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
            'H6. NEGATIVE — an unannounced contentHash under the SAME discoveryTag never resolves; discovery is always keyed by an explicit, targeted contentHash');

        console.log('✓ Section H: FLAGSHIP — a real Snapshot, distributed through the unmodified distribution command, discovered end to end through composeDiscoverSnapshotRuntime() + executeDiscoverSnapshotCommand() alone, with a negative contentHash control');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('application/DiscoverSnapshotRuntimeComposition.js');

        const browserApiTerms = ['window.', 'navigator.', 'WebSocket', 'fetch('];
        for (const term of browserApiTerms) {
            assert(!code.includes(term), `21. application/DiscoverSnapshotRuntimeComposition.js never references '${term}' — no browser API of any kind`);
        }

        assert(!code.includes('executeDiscoverSnapshotCommand'), '22. never imports or calls the command itself — composition only, never orchestration');
        assert(!/\bavailable\b/i.test(code) && !/discoveryAvailable/i.test(code), '23. no summary availability boolean of any kind');

        const forbiddenCouplingTerms = ['DecentralizedWorldDiscoveryQuery', 'ArweaveGraphqlDiscoveryQueryService', 'NostrDiscoveryQueryService(', 'PublicationDistribution', 'NostrSnapshotDiscoveryPublisher', 'SnapshotPlacementStoreRegistry'];
        for (const term of forbiddenCouplingTerms) {
            assert(!code.includes(term), `24. application/DiscoverSnapshotRuntimeComposition.js never references '${term}' — no coupling to Publication discovery, Snapshot distribution, or a store registry`);
        }

        const forbiddenVocabTerms = ['retry', 'cache', 'dedup', 'trust', 'reputation', 'ranking', 'scoring', 'attribut'];
        for (const term of forbiddenVocabTerms) {
            assert(!code.toLowerCase().includes(term), `25. code must never use "${term}" — composition only, no execution/state/trust/attribution vocabulary`);
        }

        const resolverSource = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        assert(!resolverSource.includes('DiscoverSnapshotRuntimeComposition'), '26. the 0.9.134 resolver itself is never modified to know about this composition file');
        const queryServiceSource = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!queryServiceSource.includes('DiscoverSnapshotRuntimeComposition'), '27. the 0.9.133 query service itself is never modified to know about this composition file');
        const commandSource = await codeOnlySource('application/DiscoverSnapshotCommand.js');
        assert(!commandSource.includes('DiscoverSnapshotRuntimeComposition'), '28. the 0.9.142 command itself is never modified to know about this composition file — it remains completely decoupled from it');

        console.log('✓ Section I: architectural regression — no browser API, no orchestration entry point, no summary availability flag, no coupling to Publication discovery or Snapshot distribution');
    }

    console.log('\n✅ All Discover Snapshot Runtime Composition tests passed.');
}

await run();
