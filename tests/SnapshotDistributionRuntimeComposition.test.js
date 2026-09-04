import { readFile } from 'node:fs/promises';

import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.137 — Snapshot Distribution Runtime Composition.
// See docs/Roadmap.md, "0.9.137 — Snapshot Distribution Runtime
// Composition," for the full milestone story.
//
//   Section A: composeSnapshotDistributionRuntime() builds both real
//              collaborators when both host capabilities are usable
//   Section B: every call builds a fresh, independent pair — no singleton
//   Section C: options are forwarded verbatim to the appropriate
//              collaborator, never reinterpreted here
//   Section D: composition performs no I/O of any kind — construction only
//   Section E: a genuinely malformed (not merely absent) capability still
//              throws at composition time, unchanged
//   Section F: NEGATIVE — no Arweave capability: no fake store is ever
//              constructed, no false distribution success, existing
//              IPFS Snapshot functionality is completely unaffected
//   Section G: NEGATIVE — no Nostr capability: Arweave placement can still
//              occur directly; no announcement is ever fabricated; the
//              successful placement remains valid and retrievable
//   Section H: FLAGSHIP — a fake window exposing a fake Arweave wallet and
//              a fake Nostr extension, composed all the way through to a
//              real distribute -> discover -> resolve -> retrieve ->
//              verify round trip
//   Section I: architectural regression — no browser API, no orchestration
//              entry point, no summary availability flag, still unwired
//              into ui/main.js

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

// executeSnapshotDistributionCommand()'s own collaborator-contract checks
// throw SYNCHRONOUSLY (see application/SnapshotDistributionCommand.js's
// own header, "Collaborator contract violations are caught at the start")
// — a null contentStore/discoveryPublisher never even reaches a rejected
// promise. This helper covers both that synchronous case and the ordinary
// asynchronous-rejection case a genuine put()/publish() failure produces.
async function expectThrowsOrRejects(fn, message) {
    let threw = false;
    try { await fn(); } catch { threw = true; }
    assert(threw, message);
}

// ---------------------------------------------------------------------
// Fakes mirroring tests/SnapshotDistributionCommand.test.js's and tests/
// SnapshotDistributionAudit.test.js's own — a real ArweaveContentStore
// and a real (in-memory) Nostr network, driven through a fake gateway/
// relay rather than a fake signer/publishImpl, so Sections A-G can
// exercise composition directly against low-level `signer`/`publishImpl`
// values, the same shape a real host capability ultimately resolves to.
// ---------------------------------------------------------------------

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
    return {
        sign: async (material) => {
            counter += 1;
            return { id: `fake-composition-tx-${counter}`, transaction: { id: `fake-composition-tx-${counter}`, data: material } };
        }
    };
}

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
        if (log) log.push('DISCOVERY:QUERY');
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

// ---------------------------------------------------------------------
// Fakes for Section H's own flagship — a fake `window.arweaveWallet` and
// a fake `window.nostr`, mirroring tests/ArweaveInjectedProviderSigner.test.js's
// own fakeWallet()/fakeGateway() and tests/NostrInjectedProviderPublisher.test.js's
// own fakeExtension()/fakeRelaySocket() exactly, so this section proves
// composition against the SAME injected-provider shapes those files
// already prove work — never a shortcut fake specific to this file.
// ---------------------------------------------------------------------

function fakeArweaveWallet({ idPrefix = 'FlagshipTx' } = {}) {
    let counter = 0;
    return {
        connect: async () => {},
        sign: async (transaction) => {
            counter += 1;
            return { ...transaction, owner: 'fake-owner', signature: 'fake-signature', id: `${idPrefix}${counter}${'A'.repeat(30)}` };
        }
    };
}

// A real Arweave gateway serves a transaction's own DECODED data back on
// GET, not the base64url `data` field a POSTed transaction carries — see
// arweave/ArweaveInjectedProviderSigner.js's own `base64UrlEncode()`. This
// fake decodes on the way in so GET genuinely round-trips the original
// bytes, exactly as it must for Section H's own real, unmodified
// createArweaveInjectedProviderSigner() to be exercised honestly.
function base64UrlDecodeToText(base64url) {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function fakeArweaveGatewayFetch({ anchor = 'fake-anchor', reward = '1000' } = {}) {
    const network = new Map();
    return async (url, options = {}) => {
        if (url.includes('/tx_anchor')) return new Response(anchor, { status: 200 });
        if (url.includes('/price/')) return new Response(reward, { status: 200 });
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, base64UrlDecodeToText(transaction.data));
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    };
}

function fakeNostrExtension({ idPrefix = 'f' } = {}) {
    let counter = 0;
    return {
        getPublicKey: async () => 'fake-pubkey-hex',
        signEvent: async (event) => {
            counter += 1;
            const hex = counter.toString(16);
            return { ...event, id: `${idPrefix}${hex}`.padEnd(64, '0'), sig: `deadbeef${hex}`.padEnd(128, '0') };
        }
    };
}

// The event a real host extension's own signEvent() resolves with already
// carries a real `id` (see fakeNostrExtension(), above) — this fake socket
// echoes that same id back in its own OK frame, needing no extra
// bookkeeping of its own.
function fakeRelaySocketCtor(network) {
    return class FakeSocket {
        constructor(url) {
            this.url = url;
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
        send(data) {
            const [, signedEvent] = JSON.parse(data);
            network.events.push(signedEvent);
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(['OK', signedEvent.id, true]) }); });
        }
        close() {}
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — composeSnapshotDistributionRuntime() builds both real
    // collaborators when both host capabilities are usable.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const network = makeNostrNetwork();

        const runtime = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryPublisherOptions: { discoveryTag: 'composition-section-a', publishImpl: network.publishImpl }
        });

        assert(runtime.contentStore instanceof ArweaveContentStore, '1. runtime.contentStore is a real ArweaveContentStore');
        assert(runtime.discoveryPublisher instanceof NostrSnapshotDiscoveryPublisher, '2. runtime.discoveryPublisher is a real NostrSnapshotDiscoveryPublisher');
        assert(typeof runtime.contentStore.put === 'function', '3. runtime.contentStore exposes a working put()');
        assert(typeof runtime.discoveryPublisher.publish === 'function', '4. runtime.discoveryPublisher exposes a working publish()');
        assert(Object.isFrozen(runtime), '5. the returned runtime object is frozen');

        console.log('✓ Section A: composeSnapshotDistributionRuntime() builds both real, working collaborators when both host capabilities are usable');
    }

    // ---------------------------------------------------------------
    // Section B — every call builds a fresh, independent pair; no
    // singleton behavior.
    // ---------------------------------------------------------------
    {
        const optionsFor = () => ({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl },
            nostrSnapshotDiscoveryPublisherOptions: { discoveryTag: 'composition-section-b', publishImpl: makeNostrNetwork().publishImpl }
        });

        const a = composeSnapshotDistributionRuntime(optionsFor());
        const b = composeSnapshotDistributionRuntime(optionsFor());

        assert(a.contentStore !== b.contentStore, '6. two composition calls never share a contentStore instance');
        assert(a.discoveryPublisher !== b.discoveryPublisher, '7. two composition calls never share a discoveryPublisher instance');

        console.log('✓ Section B: every composition call builds a fresh, independent contentStore/discoveryPublisher pair');
    }

    // ---------------------------------------------------------------
    // Section C — options are forwarded verbatim, never reinterpreted.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const network = makeNostrNetwork();

        const runtime = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-gateway.example' },
            nostrSnapshotDiscoveryPublisherOptions: { publishImpl: network.publishImpl, relayUrl: 'wss://custom-relay.example', discoveryTag: 'custom-snapshot-tag', tagName: 'custom-tag', kind: 30079 }
        });

        assert(runtime.contentStore.gatewayUrl === 'https://custom-gateway.example', '8. a custom gatewayUrl is forwarded to the contentStore, not defaulted a second time here');
        assert(runtime.discoveryPublisher.relayUrl === 'wss://custom-relay.example', '9. a custom relayUrl is forwarded to the discoveryPublisher, not defaulted a second time here');
        assert(runtime.discoveryPublisher.discoveryTag === 'custom-snapshot-tag', '10. discoveryTag is forwarded exactly as supplied');

        const reference = await runtime.contentStore.put('composition section C');
        assert(reference.uri.startsWith('ar://'), '11. the composed contentStore genuinely places content through the custom gateway');

        const published = await runtime.discoveryPublisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(published !== null && published.published === true, '12. the composed discoveryPublisher genuinely announces through the custom relay/tag');

        console.log('✓ Section C: constructor options are forwarded verbatim to the appropriate collaborator, never reinterpreted here');
    }

    // ---------------------------------------------------------------
    // Section D — composition performs no I/O of any kind.
    // ---------------------------------------------------------------
    {
        let gatewayCalls = 0;
        let relayCalls = 0;
        let signerCalls = 0;

        const runtime = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: {
                signer: { sign: async () => { signerCalls += 1; return { id: 'x', transaction: {} }; } },
                fetchImpl: async () => { gatewayCalls += 1; throw new Error('the gateway must never be contacted during composition'); }
            },
            nostrSnapshotDiscoveryPublisherOptions: {
                discoveryTag: 'composition-section-d',
                publishImpl: async () => { relayCalls += 1; throw new Error('the relay must never be contacted during composition'); }
            }
        });

        assert(gatewayCalls === 0, '13. composition alone never contacts the Arweave gateway');
        assert(relayCalls === 0, '14. composition alone never contacts the Nostr relay');
        assert(signerCalls === 0, '15. composition alone never invokes the signer');
        assert(runtime.contentStore !== null && runtime.discoveryPublisher !== null, '16. the runtime is still fully constructed despite doing no I/O');

        console.log('✓ Section D: composeSnapshotDistributionRuntime() performs no I/O — construction only');
    }

    // ---------------------------------------------------------------
    // Section E — a genuinely malformed (not merely absent) capability
    // still throws at composition time, unchanged.
    // ---------------------------------------------------------------
    {
        expectThrows(
            () => composeSnapshotDistributionRuntime({
                arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl, gatewayUrl: '' },
                nostrSnapshotDiscoveryPublisherOptions: {}
            }),
            '17. a real signer alongside an empty-string gatewayUrl still throws at composition time — absence is forgiven, malformation is not'
        );
        expectThrows(
            () => composeSnapshotDistributionRuntime({
                arweaveContentStoreOptions: {},
                nostrSnapshotDiscoveryPublisherOptions: { publishImpl: makeNostrNetwork().publishImpl, discoveryTag: 'x', relayUrl: '' }
            }),
            '18. a real publishImpl/discoveryTag alongside an empty-string relayUrl still throws at composition time'
        );

        console.log('✓ Section E: a genuinely malformed present capability still throws at composition time — only ABSENCE degrades gracefully');
    }

    // ---------------------------------------------------------------
    // Section F — NEGATIVE: no Arweave capability.
    // ---------------------------------------------------------------
    {
        const network = makeNostrNetwork();

        const runtime = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: {},
            nostrSnapshotDiscoveryPublisherOptions: { discoveryTag: 'composition-section-f', publishImpl: network.publishImpl }
        });

        assert(runtime.contentStore === null, '19. no signer means contentStore is null — no fake/stub store is ever constructed');
        assert(runtime.discoveryPublisher instanceof NostrSnapshotDiscoveryPublisher, '20. the discoveryPublisher is still real — one substrate\'s absence never blocks the other\'s own construction');

        // No false distribution success: handing the composed (null)
        // contentStore to the unmodified command throws synchronously,
        // before discoveryPublisher.publish() is ever reached.
        let publishCalls = 0;
        const spyPublisher = { discoveryTag: 'composition-section-f-spy', publish: async () => { publishCalls += 1; return { published: true, relayUrl: 'wss://x', id: '1'.repeat(64) }; } };
        await expectThrowsOrRejects(
            () => executeSnapshotDistributionCommand({ bytes: 'no Arweave capability', contentStore: runtime.contentStore, discoveryPublisher: spyPublisher }),
            '21. the unmodified command throws when handed a null contentStore — the composition never papers over the absence with a fake collaborator'
        );
        assert(publishCalls === 0, '22. discoveryPublisher.publish() was never even reached — no Nostr announcement occurs when Arweave is unavailable');

        // Existing local/IPFS Snapshot functionality remains completely
        // unaffected — a real IpfsContentStore, constructed independently
        // of this composition, still works exactly as it always has.
        const ipfsNetwork = new Map();
        function fakeCid(text) { return 'bafyFAKE' + computeContentHash(text); }
        async function fakeIpfsNode(url, options) {
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
                return ipfsNetwork.has(cid) ? new Response(ipfsNetwork.get(cid), { status: 200 }) : new Response('not found', { status: 500 });
            }
            return new Response('unknown route', { status: 404 });
        }
        const ipfsStore = new IpfsContentStore({ fetchImpl: fakeIpfsNode });
        const ipfsReference = await ipfsStore.put('IPFS remains fully unaffected by Arweave capability being absent');
        const ipfsBytes = await ipfsStore.get(ipfsReference);
        assert(ipfsBytes === 'IPFS remains fully unaffected by Arweave capability being absent', '23. content/IpfsContentStore.js still places and retrieves content normally — this composition never touches it, imports it, or degrades it');

        console.log('✓ Section F: NEGATIVE — no Arweave capability: no fake store is constructed, no Nostr announcement is ever reached, no false distribution success, existing IPFS Snapshot functionality is completely unaffected');
    }

    // ---------------------------------------------------------------
    // Section G — NEGATIVE: no Nostr capability.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();

        const runtime = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl },
            nostrSnapshotDiscoveryPublisherOptions: {}
        });

        assert(runtime.discoveryPublisher === null, '24. no publishImpl/discoveryTag means discoveryPublisher is null — no fake/stub publisher is ever constructed');
        assert(runtime.contentStore instanceof ArweaveContentStore, '25. the contentStore is still real — Nostr\'s absence never blocks Arweave\'s own construction');

        // Arweave placement can still occur directly — the architecture
        // exposes partial distribution: a caller holding this composed
        // runtime can call contentStore.put() on its own, bypassing the
        // full command (which requires BOTH collaborators and would
        // throw), and get a genuine, valid, retrievable placement.
        const bytes = 'no Nostr capability — Arweave placement still occurs on its own';
        const reference = await runtime.contentStore.put(bytes);
        assert(reference.uri.startsWith('ar://'), '26. Arweave placement genuinely succeeds with Nostr entirely unavailable');
        const readBack = await runtime.contentStore.get(reference);
        assert(readBack === bytes, '27. the successful placement remains genuinely valid and retrievable — never an artificial rollback because Nostr was absent');

        // No announcement is ever fabricated: nothing in this composed
        // runtime, or in the command it feeds, invents a discoveryPublisher
        // or a fake announcement result when one was never configured.
        await expectThrowsOrRejects(
            () => executeSnapshotDistributionCommand({ bytes: 'attempting the full command anyway', contentStore: runtime.contentStore, discoveryPublisher: runtime.discoveryPublisher }),
            '28. the unmodified command throws when handed a null discoveryPublisher — it never fabricates a { published: true } result out of nothing'
        );

        // Contrast: this absence is a WIRING failure (the full command
        // throws), genuinely distinct from the command's own already-
        // established "discovery declined" partial success, where a real
        // discoveryPublisher's own publish() resolves null and the
        // command composes { contentReference, announcement: null } —
        // proving this milestone preserves, rather than replaces, 0.9.136's
        // own legitimate partial-success shape.
        const decliningPublisher = { discoveryTag: 'composition-section-g-decline', publish: async () => null };
        const declinedResult = await executeSnapshotDistributionCommand({ bytes: 'a real discoveryPublisher that declines', contentStore: runtime.contentStore, discoveryPublisher: decliningPublisher });
        assert(declinedResult.announcement === null && declinedResult.contentReference.uri.startsWith('ar://'), '29. 0.9.136\'s own "placement succeeds, announcement declines" partial success is completely unchanged by this milestone');

        console.log('✓ Section G: NEGATIVE — no Nostr capability: Arweave placement still occurs directly and remains genuinely valid, no announcement is ever fabricated, and 0.9.136\'s own legitimate decline-partial-success shape is preserved');
    }

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: fake window -> fake Arweave wallet + fake
    // Nostr extension -> composition root -> concrete capabilities ->
    // SnapshotDistributionCommand -> Arweave placement -> Nostr
    // announcement -> discovery -> retrieval -> hash verification.
    // ---------------------------------------------------------------
    {
        const fakeWindow = {
            arweaveWallet: fakeArweaveWallet(),
            nostr: fakeNostrExtension()
        };

        // The one place this test touches "window" — never this
        // milestone's own production file, which imports neither
        // injected-provider factory; see Section I.
        const gatewayFetch = fakeArweaveGatewayFetch();
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: fakeWindow.arweaveWallet, fetchImpl: gatewayFetch });
        assert(signer !== undefined, 'H0. sanity: a usable fake window.arweaveWallet produces a real signer');

        const relayNetwork = { events: [] };
        const relaySocketCtor = fakeRelaySocketCtor(relayNetwork);
        const publishImpl = createNostrInjectedProviderPublisher({ injectedProvider: fakeWindow.nostr, webSocketImpl: relaySocketCtor });
        assert(publishImpl !== undefined, 'H0b. sanity: a usable fake window.nostr produces a real publish()');

        // composition root — concrete capabilities.
        const runtime = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer, fetchImpl: gatewayFetch },
            nostrSnapshotDiscoveryPublisherOptions: { publishImpl, discoveryTag: 'flagship-runtime-composition', relayUrl: 'wss://flagship-relay.example' }
        });
        assert(runtime.contentStore instanceof ArweaveContentStore && runtime.discoveryPublisher instanceof NostrSnapshotDiscoveryPublisher, 'H1. the composition root produced real, concrete capabilities from the fake host wallet/extension');

        // SnapshotDistributionCommand — Arweave placement -> Nostr
        // announcement, in one call, through the composed runtime alone.
        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'flagship-composition-building', bricks: 7 }] } });
        const expectedHash = computeContentHash(snapshotBytes);

        const distributed = await executeSnapshotDistributionCommand({
            bytes: snapshotBytes,
            contentStore: runtime.contentStore,
            discoveryPublisher: runtime.discoveryPublisher
        });
        assert(distributed.contentReference.hash === expectedHash, 'H2. Arweave placement, reached only through the composed runtime, produced the expected content hash');
        assert(distributed.announcement !== null && distributed.announcement.published === true, 'H3. Nostr announcement, reached only through the composed runtime, genuinely published');

        // Discovery -> retrieval -> hash verification, entirely through
        // the already-existing 0.9.133/0.9.134 retrieval path — this
        // milestone builds no new retrieval logic, and the query side
        // never touches the fake window/wallet/extension at all, only
        // the same in-memory relay the injected publisher broadcast to.
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(runtime.contentStore);
        const query = new NostrSnapshotDiscoveryQueryService({
            queryImpl: async (relayUrl, filter) => {
                const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
                return relayNetwork.events
                    .filter((event) => {
                        if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                        return tagFilters.every(([key, values]) => {
                            const tagName = key.slice(1);
                            return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                        });
                    })
                    .slice(0, filter.limit);
            }
        });
        const resolver = new DecentralizedSnapshotResolver(query);

        const resolved = await resolver.resolve('flagship-runtime-composition', expectedHash, { storeRegistry: registry });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'H4. the Snapshot distributed through the composed runtime resolves fully through the existing decentralized retrieval path');
        assert(resolved.locator === distributed.contentReference.uri, 'H5. the resolved locator is exactly the one the composed contentStore produced');
        assert(resolved.bytes === snapshotBytes, 'H6. the retrieved bytes are byte-identical to the original Snapshot');
        assert(computeContentHash(resolved.bytes) === expectedHash, 'H7. FLAGSHIP: hash verification — the resolved bytes still hash to the originally-expected contentHash, all the way from a fake window to a verified round trip');

        console.log('✓ Section H: FLAGSHIP — fake window (fake Arweave wallet + fake Nostr extension) -> composition root -> concrete capabilities -> SnapshotDistributionCommand -> Arweave placement -> Nostr announcement -> discovery -> retrieval -> hash verification, one continuous chain');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('application/SnapshotDistributionRuntimeComposition.js');

        const browserApiTerms = ['window.', 'navigator.', 'WebSocket', 'fetch('];
        for (const term of browserApiTerms) {
            assert(!code.includes(term), `30. application/SnapshotDistributionRuntimeComposition.js never references '${term}' — no browser API of any kind`);
        }

        assert(!code.includes('createArweaveInjectedProviderSigner') && !code.includes('createNostrInjectedProviderPublisher'), '31. never imports either injected-provider factory — those stay entirely a caller\'s own concern');
        assert(!code.includes('executeSnapshotDistributionCommand'), '32. never imports or calls the command itself — composition only, never orchestration');
        assert(!/\bavailable\b/i.test(code) && !/distributionAvailable/i.test(code), '33. no summary availability boolean of any kind — see this file\'s own header, "asymmetric availability is never collapsed into one misleading flag"');

        const forbiddenCouplingTerms = ['PublicationDistribution', 'ArweavePublicationMaterialUploader', 'NostrPublicationDiscoveryPublisher'];
        for (const term of forbiddenCouplingTerms) {
            assert(!code.includes(term), `34. application/SnapshotDistributionRuntimeComposition.js never references '${term}' — no coupling to the Signed Claim distribution family`);
        }

        const forbiddenVocabTerms = ['retry', 'cache', 'dedup', 'trust', 'reputation', 'ranking', 'scoring'];
        for (const term of forbiddenVocabTerms) {
            assert(!code.toLowerCase().includes(term), `35. code must never use "${term}" — composition only, no execution/state/trust vocabulary`);
        }

        const storeSource = await codeOnlySource('content/ArweaveContentStore.js');
        assert(!storeSource.includes('SnapshotDistributionRuntimeComposition'), '36. the 0.9.132 store itself is never modified to know about this composition file');
        const publisherSource = await codeOnlySource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(!publisherSource.includes('SnapshotDistributionRuntimeComposition'), '37. the 0.9.133 publisher itself is never modified to know about this composition file');
        const commandSource = await codeOnlySource('application/SnapshotDistributionCommand.js');
        assert(!commandSource.includes('SnapshotDistributionRuntimeComposition'), '38. the 0.9.136 command itself is never modified to know about this composition file — it remains, per this milestone\'s own brief, completely unchanged');

        // As of this milestone (0.9.137) itself, ui/main.js referenced none
        // of the terms below — this composition was composable (Section H
        // proves it works) but not yet composed into the running
        // application. 0.9.138 — World View Snapshot Distribution Action —
        // later wired ui/main.js to call composeSnapshotDistributionRuntime()
        // and executeSnapshotDistributionCommand() directly (see that
        // milestone's own tests/WorldViewSnapshotDistribution.test.js,
        // Section I, for the full architectural boundary this supersedes).
        // The concrete ArweaveContentStore/NostrSnapshotDiscoveryPublisher
        // classes are still never constructed or referenced BY NAME in
        // ui/main.js — 0.9.138 calls only composeSnapshotDistributionRuntime()
        // (this file's own export) and executeSnapshotDistributionCommand()
        // (0.9.136's own export), never a concrete collaborator class
        // directly. ui/main.js DOES now import from both files by path
        // (hence 'SnapshotDistributionRuntimeComposition.js'/
        // 'SnapshotDistributionCommand.js' themselves are no longer in this
        // forbidden list — only the concrete classes are).
        const uiMainCode = await codeOnlySource('ui/main.js');
        assert(uiMainCode.includes('composeSnapshotDistributionRuntime('), "39a. ui/main.js now calls composeSnapshotDistributionRuntime(), wired by 0.9.138 — World View Snapshot Distribution Action");
        const stillUnreferencedTerms = ['ArweaveContentStore', 'NostrSnapshotDiscoveryPublisher'];
        for (const term of stillUnreferencedTerms) {
            assert(!uiMainCode.includes(term), `39b. ui/main.js still never references '${term}' by name — 0.9.138 calls only the composed functions this file and 0.9.136 already export`);
        }

        console.log('✓ Section I: architectural regression — no browser API, no orchestration entry point, no summary availability flag, no coupling to Signed Claim distribution, and (as of 0.9.138) composed into ui/main.js through composition-level functions only, never a concrete collaborator class directly');
    }

    console.log('\n✅ All Snapshot Distribution Runtime Composition tests passed.');
}

await run();
