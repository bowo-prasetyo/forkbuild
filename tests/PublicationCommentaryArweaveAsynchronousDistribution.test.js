import { execSync } from 'node:child_process';

import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionEnvelope } from '../core/PublicationCommentaryDistributionEnvelope.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { createArweaveTaggedTransactionSearch } from '../application/arweave/ArweaveTaggedTransactionSearch.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

import {
    PublicationCommentaryDeliveryStatus,
    PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE,
    isValidPublicationCommentaryDeliveryStatusTransition,
    describesConformingPublicationCommentaryAsynchronousDeliverySubstrate
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';

// The existing, unmodified Nostr Commentary substrate — imported ONLY to
// prove, live, side by side, that it and this milestone's own Arweave
// substrate satisfy the identical contract shape (Section A) and remain
// genuinely independent (Section I); never modified, never used to carry a
// single byte of this file's own Commentary traffic.
import { PublicationCommentaryNostrDistribution } from '../application/publication/commentary/PublicationCommentaryNostrDistribution.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.631 — Publication Commentary Arweave Asynchronous Distribution.
//
// TYPE: narrow production implementation + comprehensive tests. 0.9.630's
// own audit (tests/PublicationCommentaryArweaveDistributionBoundaryAudit.test.js)
// proved, entirely inside a test file, that a composition of two existing,
// unmodified Arweave transport primitives (application/
// ArweaveTaggedTransactionUpload.js, content/ArweaveContentStore.js#get())
// already duck-type-conforms to core/PublicationCommentaryAsynchronousDeliveryContract.js's
// own { publish, retrieve } contract and can carry a real, signed
// Commentary envelope through a live Arweave upload/retrieval round trip.
// That audit named two remaining gaps: a small, permanent production
// adapter (mirroring 0.9.628's own Nostr adapter), and a standalone
// tag-search primitive for a real discover() (the Nostr-equivalent of
// nostr/NostrRelayQueryClient.js's own createNostrRelayQueryClient). This
// milestone builds exactly those two pieces (application/
// PublicationCommentaryArweaveDistribution.js, application/
// ArweaveTaggedTransactionSearch.js), the admission boundary on top of the
// adapter (application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js),
// and the ui/main.js wiring making all three reachable from the real,
// running application — deliberately preserving Arweave's own wider
// durability SEMANTIC_GAP (0.9.630 Section E) rather than papering over it,
// and deliberately SELECTING between Nostr and Arweave rather than fanning
// out to both.
//
//   Section A — the new adapter conforms to 0.9.626's own contract, live,
//               side by side with the real Nostr substrate.
//   Section B — publish(): success, an ordinary gateway decline, and a
//               genuine transport failure.
//   Section C — retrieve(): the durability gap is honestly preserved —
//               not-yet-mined, never-published, and gateway-unreachable
//               all propagate as ContentUnavailableError, NEVER a false
//               "verified absent" null; a malformed locator alone is null.
//   Section D — the standalone tag-search primitive, direct: correct
//               query, id extraction, malformed/empty body, and the
//               genuine-failure-rejects/malformed-response-resolves-[]
//               split named in that file's own header.
//   Section E — discover(): a genuine search failure propagates; a single
//               bad candidate is skipped, never fatal to the batch.
//   Section F — FLAGSHIP: the full product journey through the REAL
//               production classes — Alice comments over Arweave while Bob
//               is offline; Bob returns, discovers by tag, retrieves,
//               verifies, admits, and is notified.
//   Section G — adversarial corpus: ten cases, including the two
//               Arweave-specific failure modes, proven non-destructive to
//               local Commentary state.
//   Section H — identity independence: commentaryId / publicationId /
//               authorIdentityId / the Arweave transaction id stay four
//               independent facts.
//   Section I — ui/main.js production wiring: both new classes constructed
//               exactly once, reusing existing host/gateway collaborators;
//               addPublicationCommentaryCommand SELECTS between Nostr and
//               Arweave, never fans out to both from one call.
//   Section J — DiscoverPublicationCommentaryFromArweaveUseCase in
//               isolation: no publicationId, filtering, one-bad-candidate
//               resilience.
//   Section K — exclusion guard: no retry/mining-delay compensation, no
//               new Commentary identity field, no change to the Nostr or
//               WebRTC paths.
//   Section L — verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function grepFiles(pattern, dirs) {
    let hits = '';
    try {
        hits = execSync(`grep -rlE "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function makeExchange(provider = makeIdentity('default')) {
    const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
    const exchange = new PublicationCommentaryDistributionExchange(store, provider, new LocalAuthorizationVerifier());
    return { store, exchange, provider };
}

function signedCommentaryEnvelopeJson(authorProvider, overrides = {}) {
    const exchange = new PublicationCommentaryDistributionExchange(
        new PublicationCommentaryStore(new InMemoryStorageProvider()),
        authorProvider,
        new LocalAuthorizationVerifier()
    );
    const commentary = new PublicationCommentary({
        publicationId: overrides.publicationId || 'pub-0.9.631-default',
        authorIdentityId: authorProvider.getSigningIdentity().id,
        content: overrides.content || 'a real, signed Commentary distribution envelope, 0.9.631'
    });
    return exchange.exportCommentary(commentary);
}

// A minimal, honest fake Arweave `signer` — the identical shape
// `arweave/ArweaveInjectedProviderSigner.js` already produces in
// production, faked the same way 0.9.630's own audit already faked it.
function fakeArweaveSigner(label) {
    const calls = { sign: [] };
    let counter = 0;
    return {
        calls,
        sign: async (material, tags = []) => {
            calls.sign.push({ material, tags });
            counter += 1;
            const id = `${label}Tx${counter}`.padEnd(43, '0');
            return { id, transaction: { id, format: 2, data: material, tags } };
        }
    };
}

// A realistic fake Arweave gateway speaking the same two HTTP exchanges the
// real production transport files implement — `POST <gatewayUrl>/tx` and
// `GET <gatewayUrl>/<transaction-id>` — plus a fake GraphQL endpoint
// speaking the same query shape `application/arweave/ArweaveTaggedTransactionSearch.js`
// sends, so `discover()` can be exercised end to end without a real
// network. `mineDelayTicks` simulates a transaction the gateway has
// accepted but does not yet serve on GET — the genuine gap Section C
// measures.
function makeSharedFakeGateway({ declineUpload = false, mineDelayTicks = 0, graphqlUnreachable = false } = {}) {
    const transactions = new Map(); // id -> { data, tags, minedAtTick }
    let tick = 0;
    const gateway = {
        transactions,
        graphqlUrl: 'https://fake-arweave-gateway.example/graphql',
        advanceTick(count = 1) { tick += count; },
        async fetchImpl(url, options = {}) {
            const method = (options.method || 'GET').toUpperCase();
            if (method === 'POST' && url.endsWith('/graphql')) {
                if (graphqlUnreachable) {
                    throw new Error('fakeGateway: graphql endpoint unreachable');
                }
                const body = JSON.parse(options.body);
                const match = /values:\s*\["([^"]+)"\]/.exec(body.query);
                const discoveryTag = match ? match[1] : null;
                const tagNameMatch = /name:\s*"([^"]+)"/.exec(body.query);
                const tagName = tagNameMatch ? tagNameMatch[1] : null;
                const edges = [];
                for (const [id, entry] of transactions.entries()) {
                    const matches = (entry.tags || []).some((tag) => tag.name === tagName && tag.value === discoveryTag);
                    if (matches) edges.push({ node: { id } });
                }
                return new Response(JSON.stringify({ data: { transactions: { edges } } }), { status: 200 });
            }
            if (method === 'POST' && url.endsWith('/tx')) {
                if (declineUpload) {
                    return new Response('service unavailable', { status: 503 });
                }
                const body = JSON.parse(options.body);
                transactions.set(body.id, { data: body.data, tags: body.tags || [], minedAtTick: tick + mineDelayTicks });
                return new Response('OK', { status: 200 });
            }
            const match = /\/([A-Za-z0-9_-]+)$/.exec(url);
            if (method === 'GET' && match) {
                const id = match[1];
                const entry = transactions.get(id);
                if (!entry || tick < entry.minedAtTick) {
                    return new Response('Not Found', { status: 404 });
                }
                return new Response(entry.data, {
                    status: 200,
                    headers: { 'content-length': String(new TextEncoder().encode(entry.data).length) }
                });
            }
            throw new Error(`fakeGateway: unexpected request ${method} ${url}`);
        }
    };
    return gateway;
}

function erroringFetchImpl() {
    return async () => { throw new Error('fakeGateway: network unreachable'); };
}

const ARWEAVE_TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function makeDistribution({ gateway, signer, discoveryTag, gatewayUrl = 'https://fake-arweave-gateway.example', timeoutMs } = {}) {
    return new PublicationCommentaryArweaveDistribution({
        signer: signer || fakeArweaveSigner('default'),
        gatewayUrl,
        graphqlUrl: gateway ? gateway.graphqlUrl : `${gatewayUrl}/graphql`,
        fetchImpl: gateway ? gateway.fetchImpl : erroringFetchImpl(),
        discoveryTag: discoveryTag || 'forkbuild-commentary',
        ...(timeoutMs ? { timeoutMs } : {})
    });
}

async function run() {
    // ===============================================================
    // Section A — contract conformance, live, side by side with Nostr.
    // ===============================================================
    {
        const gateway = makeSharedFakeGateway();
        const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('a'), discoveryTag: '0.9.631-a' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(distribution) === true,
            n('PublicationCommentaryArweaveDistribution genuinely conforms to the 0.9.626 contract — publish/retrieve are both real functions'));
        assert(typeof distribution.discover === 'function',
            n('discover() is also exposed, exactly as PublicationCommentaryNostrDistribution.js already exposes one'));

        const nostrDistribution = new PublicationCommentaryNostrDistribution({
            relayUrl: 'wss://fake-relay.example',
            publishImpl: async () => ({ published: true, id: '0'.repeat(64) }),
            queryImpl: async () => []
        });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(nostrDistribution) === true,
            n('the real, unmodified Nostr substrate still conforms too — both substrates satisfy the identical shape a future selection would switch between'));

        console.log('✓ A: PublicationCommentaryArweaveDistribution conforms to the 0.9.626 contract, side by side with the real, unmodified Nostr substrate.');
    }

    // ===============================================================
    // Section B — publish(): success, decline, transport failure.
    // ===============================================================
    {
        const gateway = makeSharedFakeGateway();
        const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('b'), discoveryTag: '0.9.631-b' });
        const envelopeJson = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-b-author'));

        const result = await distribution.publish(envelopeJson);
        assert(result && result.published === true && ARWEAVE_TRANSACTION_ID_PATTERN.test(result.locator),
            n('a successful publish() resolves { published: true, locator } — the real transaction id the fake gateway accepted'));

        const [storedEntry] = Array.from(gateway.transactions.values());
        assert(storedEntry.data === JSON.stringify(envelopeJson),
            n('the transaction body is the envelope\'s own full JSON, byte for byte — never a locator-only shape'));
        assert(storedEntry.tags.some((tag) => tag.name === 'ForkBuild-Commentary-Discovery-Tag' && tag.value === '0.9.631-b'),
            n('the transaction carries this instance\'s own discoveryTag under its own, separate tagName — a Commentary transaction is genuinely tagged, never bare'));

        const decliningDistribution = makeDistribution({ gateway: makeSharedFakeGateway({ declineUpload: true }), signer: fakeArweaveSigner('b-decline'), discoveryTag: '0.9.631-b' });
        const declined = await decliningDistribution.publish(signedCommentaryEnvelopeJson(makeIdentity('0.9.631-b-decline-author')));
        assert(declined === null, n('an explicit gateway decline (non-2xx on /tx) resolves publish() to null — an ordinary decline'));

        const unreachableDistribution = makeDistribution({ gateway: { fetchImpl: erroringFetchImpl(), graphqlUrl: 'https://unreachable.example/graphql' }, signer: fakeArweaveSigner('b-unreachable'), discoveryTag: '0.9.631-b' });
        let publishRejected = false;
        try { await unreachableDistribution.publish(signedCommentaryEnvelopeJson(makeIdentity('0.9.631-b-unreachable-author'))); } catch { publishRejected = true; }
        assert(publishRejected, n('a genuinely unreachable gateway makes publish() reject — never a silent null or false success'));

        console.log('✓ B: publish() succeeds with a real tagged transaction, resolves null for an ordinary decline, and rejects for a genuine transport failure.');
    }

    // ===============================================================
    // Section C — retrieve(): the durability gap is honestly preserved.
    // ===============================================================
    {
        const distribution = makeDistribution({ gateway: makeSharedFakeGateway(), signer: fakeArweaveSigner('c'), discoveryTag: '0.9.631-c' });

        const malformedResult = await distribution.retrieve('not a valid transaction id!!');
        assert(malformedResult === null, n('retrieve() resolves null ONLY for a malformed locator — never even attempted against the gateway'));

        // Not yet mined: PERSISTENTLY_PUBLISHED but not yet DISCOVERABLE.
        const mineDelayGateway = makeSharedFakeGateway({ mineDelayTicks: 2 });
        const mineDelayDistribution = makeDistribution({ gateway: mineDelayGateway, signer: fakeArweaveSigner('c-mine'), discoveryTag: '0.9.631-c' });
        const envelopeJson = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-c-mine-author'));
        const publishResult = await mineDelayDistribution.publish(envelopeJson);
        assert(publishResult.published === true, n('the gateway accepted the transaction for broadcast — PERSISTENTLY_PUBLISHED'));

        let notYetError = null;
        try { await mineDelayDistribution.retrieve(publishResult.locator); } catch (error) { notYetError = error; }
        assert(notYetError instanceof ContentUnavailableError,
            n('retrieve() for a not-yet-mined transaction THROWS ContentUnavailableError — never a false "verified absent" null, and never resolves with placeholder content'));

        mineDelayGateway.advanceTick(2);
        const retrievedAfterMining = await mineDelayDistribution.retrieve(publishResult.locator);
        assert(retrievedAfterMining !== null && retrievedAfterMining.commentaryId === envelopeJson.commentaryId,
            n('once mined, the identical retrieve() call succeeds — DISCOVERABLE was reachable all along, merely not yet'));

        // Never published: the SAME error type, indistinguishable — the
        // durability gap 0.9.630 Section E measured, reconfirmed live here
        // as this milestone's own production behavior, never smoothed over.
        let neverPublishedError = null;
        try { await distribution.retrieve('z'.repeat(43)); } catch (error) { neverPublishedError = error; }
        assert(neverPublishedError instanceof ContentUnavailableError,
            n('a locator that was NEVER published fails with the SAME ContentUnavailableError as a not-yet-mined one — this adapter does not invent a distinction the substrate cannot actually make'));

        // Gateway unreachable: the SAME error type again.
        const unreachableDistribution = makeDistribution({ gateway: { fetchImpl: erroringFetchImpl(), graphqlUrl: 'https://unreachable.example/graphql' }, signer: fakeArweaveSigner('c-unreachable'), discoveryTag: '0.9.631-c' });
        let unreachableError = null;
        try { await unreachableDistribution.retrieve('a'.repeat(43)); } catch (error) { unreachableError = error; }
        assert(unreachableError instanceof ContentUnavailableError,
            n('a genuinely unreachable gateway ALSO throws ContentUnavailableError — confirming the three-way collapse is real production behavior, not a test artifact'));

        // Malformed retrieved bytes resolve to null, distinct from the
        // three cases above.
        const malformedGateway = makeSharedFakeGateway();
        const malformedDistribution = makeDistribution({ gateway: malformedGateway, signer: fakeArweaveSigner('c-malformed'), discoveryTag: '0.9.631-c' });
        const malformedUpload = await malformedDistribution.publish({ not: 'json-parseable as an envelope, but IS valid JSON' });
        // Corrupt the stored bytes so they fail to parse as JSON at all.
        malformedGateway.transactions.get(malformedUpload.locator).data = '{not valid json';
        const malformedRetrieve = await malformedDistribution.retrieve(malformedUpload.locator);
        assert(malformedRetrieve === null, n('malformed (non-JSON) retrieved bytes resolve to null — a distinct outcome from every ContentUnavailableError case above'));

        console.log('✓ C: retrieve() never fabricates a distinction Arweave cannot make — not-yet-mined, never-published, and gateway-unreachable all propagate as ContentUnavailableError, while a malformed locator (null) and malformed bytes (null) remain their own, separate outcomes.');
    }

    // ===============================================================
    // Section D — the standalone tag-search primitive, direct.
    // ===============================================================
    {
        const gateway = makeSharedFakeGateway();
        const search = createArweaveTaggedTransactionSearch({ graphqlUrl: gateway.graphqlUrl, tagName: 'ForkBuild-Commentary-Discovery-Tag', fetchImpl: gateway.fetchImpl });

        const upload = { data: JSON.stringify({ hello: 'world' }), tags: [{ name: 'ForkBuild-Commentary-Discovery-Tag', value: '0.9.631-d' }] };
        gateway.transactions.set('d'.repeat(43), { ...upload, minedAtTick: 0 });
        gateway.transactions.set('e'.repeat(43), { data: 'irrelevant', tags: [{ name: 'ForkBuild-Commentary-Discovery-Tag', value: 'a-different-campaign' }], minedAtTick: 0 });

        const ids = await search('0.9.631-d');
        assert(Array.isArray(ids) && ids.length === 1 && ids[0] === 'd'.repeat(43),
            n('searchTaggedTransactionIds() returns exactly the ids tagged with the requested value — a differently-tagged transaction is excluded'));

        const emptyIds = await search('no-such-campaign');
        assert(Array.isArray(emptyIds) && emptyIds.length === 0, n('a discoveryTag matching nothing resolves to [] — an ordinary empty result, never a rejection'));

        const malformedBodyGateway = { fetchImpl: async () => new Response('not json at all', { status: 200 }) };
        const malformedSearch = createArweaveTaggedTransactionSearch({ graphqlUrl: 'https://fake.example/graphql', fetchImpl: malformedBodyGateway.fetchImpl });
        assert(JSON.stringify(await malformedSearch('any')) === '[]', n('a 200 response whose body is not valid JSON resolves to [] — malformed-but-reachable is not a rejection'));

        const nonOkGateway = { fetchImpl: async () => new Response('nope', { status: 500 }) };
        const nonOkSearch = createArweaveTaggedTransactionSearch({ graphqlUrl: 'https://fake.example/graphql', fetchImpl: nonOkGateway.fetchImpl });
        assert(JSON.stringify(await nonOkSearch('any')) === '[]', n('a reachable gateway answering with a non-2xx status resolves to [] as well'));

        const unreachableSearch = createArweaveTaggedTransactionSearch({ graphqlUrl: 'https://fake.example/graphql', fetchImpl: erroringFetchImpl() });
        let searchRejected = false;
        try { await unreachableSearch('any'); } catch { searchRejected = true; }
        assert(searchRejected, n('a genuine network failure REJECTS — mirroring nostr/NostrRelayQueryClient.js\'s own raw-layer discipline, "nothing matched" and "could not find out" stay distinguishable at this layer'));

        console.log('✓ D: the standalone tag-search primitive returns correct ids, resolves [] for an empty or malformed-but-reachable response, and rejects for a genuine transport failure.');
    }

    // ===============================================================
    // Section E — discover(): search failure propagates; one bad
    // candidate never aborts the batch.
    // ===============================================================
    {
        const gateway = makeSharedFakeGateway();
        const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('e'), discoveryTag: '0.9.631-e' });

        const good1 = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-e1'), { publicationId: 'pub-e' });
        const good2 = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-e2'), { publicationId: 'pub-e' });
        await distribution.publish(good1);
        await distribution.publish(good2);

        // A transaction sharing the discovery tag but not yet mined — must
        // be silently skipped by discover(), never fatal to the batch.
        const mineDelayGateway = makeSharedFakeGateway({ mineDelayTicks: 100 });
        // Reuse the SAME transactions map so discover() sees all three
        // under one gateway.
        for (const [id, entry] of gateway.transactions.entries()) {
            mineDelayGateway.transactions.set(id, { ...entry, minedAtTick: 0 });
        }
        const notYetMinedDistribution = makeDistribution({ gateway: mineDelayGateway, signer: fakeArweaveSigner('e-late'), discoveryTag: '0.9.631-e' });
        await notYetMinedDistribution.publish(signedCommentaryEnvelopeJson(makeIdentity('0.9.631-e3'), { publicationId: 'pub-e' }));

        const discovered = await notYetMinedDistribution.discover();
        assert(discovered.length === 2
            && discovered.some((c) => c.commentaryId === good1.commentaryId)
            && discovered.some((c) => c.commentaryId === good2.commentaryId),
            n('discover() returns exactly the two currently-retrievable candidates — the third, not-yet-mined one is silently skipped, never aborting the batch'));

        const unreachableDistribution = makeDistribution({ gateway: { fetchImpl: erroringFetchImpl(), graphqlUrl: 'https://unreachable.example/graphql' }, signer: fakeArweaveSigner('e-unreachable'), discoveryTag: '0.9.631-e' });
        let discoverRejected = false;
        try { await unreachableDistribution.discover(); } catch { discoverRejected = true; }
        assert(discoverRejected, n('a genuine tag-search failure (the GraphQL endpoint itself unreachable) propagates out of discover() — a caller decides whether to retry or swallow it'));

        console.log('✓ E: discover() skips a single not-yet-retrievable candidate without losing the rest of the batch, and propagates a genuine search-step failure rather than silently returning [].');
    }

    // ===============================================================
    // Section F — FLAGSHIP: Alice comments over Arweave while Bob is
    // offline; Bob returns, discovers by tag, retrieves, verifies,
    // admits, and is notified — through the REAL production classes.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.631-flagship-alice');
        const aliceExchange = new PublicationCommentaryDistributionExchange(
            new PublicationCommentaryStore(new InMemoryStorageProvider()), aliceProvider, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.631-bobs-work',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'nice work, Bob — seen while you were offline, over Arweave, 0.9.631'
        });
        const envelopeJson = aliceExchange.exportCommentary(commentary);

        const gateway = makeSharedFakeGateway();
        const sharedTag = 'forkbuild-commentary-flagship-0.9.631';
        const aliceDistribution = makeDistribution({ gateway, signer: fakeArweaveSigner('flagship-alice'), discoveryTag: sharedTag });
        const publishResult = await aliceDistribution.publish(envelopeJson);
        assert(publishResult && publishResult.published === true, n('Alice publishes her signed Commentary to Arweave — Bob is entirely offline; no WebRTC connection exists anywhere in this section'));

        // "Bob returns" — a genuinely independent distribution instance and
        // exchange/store, sharing only the fake gateway's own storage.
        const bobExchange = new PublicationCommentaryDistributionExchange(
            new PublicationCommentaryStore(new InMemoryStorageProvider()), makeIdentity('0.9.631-flagship-bob'), new LocalAuthorizationVerifier()
        );
        const bobDistribution = makeDistribution({ gateway, signer: fakeArweaveSigner('flagship-bob'), discoveryTag: sharedTag });
        const bobUseCase = new DiscoverPublicationCommentaryFromArweaveUseCase(bobDistribution, bobExchange);

        const admitted = await bobUseCase.execute({ publicationId: 'pub-0.9.631-bobs-work' });
        assert(admitted.length === 1 && admitted[0].isNew === true && admitted[0].commentary.commentaryId === commentary.commentaryId,
            n('Bob discovers, verifies, and admits Alice\'s Commentary through Arweave alone — no locator ever communicated out of band, no Nostr call anywhere in this section'));

        // Feed the admission result into the SAME notification bridge shape
        // ui/main.js's own discoverPublicationCommentaryFromArweaveCommand
        // uses — proving the { commentary, isNew } shape this use case
        // returns is exactly what the existing, unmodified bridge expects.
        const notificationEventStore = new NotificationEventStore(new InMemoryStorageProvider());
        const bridge = new PublicationCommentaryRemoteNotificationBridge(
            new LocalDiscoveryProvider(new InMemoryStorageProvider()),
            makeIdentity('0.9.631-flagship-bridge-identity'),
            (notificationEvent) => notificationEventStore.save(notificationEvent)
        );
        let notified = true;
        try {
            bridge.handleCommentaryReceived(admitted[0]);
        } catch {
            notified = false;
        }
        assert(notified, n('the admitted { commentary, isNew } result is accepted by the real, unmodified PublicationCommentaryRemoteNotificationBridge without any Arweave-specific shape of its own'));

        console.log('✓ F — FLAGSHIP: Alice comments over Arweave while Bob is entirely offline; Bob returns, discovers by tag, retrieves, verifies, and admits — through the real, unmodified production classes throughout.');
    }

    // ===============================================================
    // Section G — adversarial corpus (10 cases), non-destructive.
    // ===============================================================
    {
        function freshCase(label) {
            const provider = makeIdentity(`0.9.631-adv-${label}`);
            const { store, exchange } = makeExchange(provider);
            const commentary = new PublicationCommentary({
                publicationId: `pub-0.9.631-adv-${label}`,
                authorIdentityId: provider.getSigningIdentity().id,
                content: `original honest content for ${label}`
            });
            return { provider, store, commentary, envelopeJson: exchange.exportCommentary(commentary) };
        }
        function admitOrReject(retrievedJson) {
            if (retrievedJson === null) return { admitted: false };
            const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(retrievedJson);
            if (reconstructed === null) return { admitted: false };
            const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
            if (!verification.valid) return { admitted: false };
            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            store.save(reconstructed.toCommentary());
            return { admitted: true };
        }
        function assertLocalStateIntact(localStore, commentaryId, label) {
            assert(localStore.getById(commentaryId) !== null,
                n(`(${label}) the author's own local, already-persisted Commentary is untouched — an adversarial/unavailable remote outcome never mutates or deletes local state`));
        }

        // (1) Tampered gateway bytes.
        {
            const { store, commentary, envelopeJson } = freshCase('gateway-bytes');
            store.save(commentary);
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g1'), discoveryTag: 't-g1' });
            const { locator } = await distribution.publish(envelopeJson);
            gateway.transactions.get(locator).data = JSON.stringify({ ...envelopeJson, content: 'TAMPERED after publish' });
            const retrieved = await distribution.retrieve(locator);
            assert(admitOrReject(retrieved).admitted === false, n('(1) tampered gateway bytes (altered content) fail verification and are never admitted'));
            assertLocalStateIntact(store, commentary.commentaryId, '1');
        }

        // (2) Altered commentaryId in the retrieved JSON.
        {
            const { store, commentary, envelopeJson } = freshCase('commentary-id');
            store.save(commentary);
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g2'), discoveryTag: 't-g2' });
            const { locator } = await distribution.publish(envelopeJson);
            gateway.transactions.get(locator).data = JSON.stringify({ ...envelopeJson, commentaryId: 'forged-id-0000000000000000000000000000000000' });
            const retrieved = await distribution.retrieve(locator);
            assert(admitOrReject(retrieved).admitted === false, n('(2) an altered commentaryId breaks the signature check and is rejected'));
            assertLocalStateIntact(store, commentary.commentaryId, '2');
        }

        // (3) Altered publicationId.
        {
            const { store, commentary, envelopeJson } = freshCase('publication-id');
            store.save(commentary);
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g3'), discoveryTag: 't-g3' });
            const { locator } = await distribution.publish(envelopeJson);
            gateway.transactions.get(locator).data = JSON.stringify({ ...envelopeJson, publicationId: 'pub-some-other-publication' });
            const retrieved = await distribution.retrieve(locator);
            assert(admitOrReject(retrieved).admitted === false, n('(3) an altered publicationId breaks the signature check and is rejected'));
            assertLocalStateIntact(store, commentary.commentaryId, '3');
        }

        // (4) Forged signer (a different identity's signature claimed).
        {
            const { store, commentary, envelopeJson } = freshCase('forged-signer');
            store.save(commentary);
            const impostor = makeIdentity('0.9.631-adv-impostor');
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g4'), discoveryTag: 't-g4' });
            const { locator } = await distribution.publish(envelopeJson);
            gateway.transactions.get(locator).data = JSON.stringify({ ...envelopeJson, authorIdentityId: impostor.getSigningIdentity().id });
            const retrieved = await distribution.retrieve(locator);
            assert(admitOrReject(retrieved).admitted === false, n('(4) a claimed signer that never actually signed this tuple is rejected'));
            assertLocalStateIntact(store, commentary.commentaryId, '4');
        }

        // (5) Malformed envelope (missing required field).
        {
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g5'), discoveryTag: 't-g5' });
            const { locator } = await distribution.publish({ commentaryId: 'incomplete-only' });
            const retrieved = await distribution.retrieve(locator);
            assert(admitOrReject(retrieved).admitted === false, n('(5) a malformed envelope (missing required fields) fails reconstruction and is rejected'));
        }

        // (6) Duplicate transaction (byte-identical material published twice).
        {
            const { store, commentary, envelopeJson } = freshCase('duplicate');
            store.save(commentary);
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g6'), discoveryTag: 't-g6' });
            const first = await distribution.publish(envelopeJson);
            const second = await distribution.publish(envelopeJson);
            assert(first.locator !== second.locator, n('(6) publishing byte-identical Commentary material twice produces two independent transactions — no deduplication at this layer'));
            const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const firstReconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(await distribution.retrieve(first.locator));
            const secondReconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(await distribution.retrieve(second.locator));
            const firstAdmit = bobStore.save(firstReconstructed.toCommentary());
            const secondAdmit = bobStore.save(secondReconstructed.toCommentary());
            assert(firstAdmit === true && secondAdmit === false,
                n('(6) the SAME commentaryId, retrieved from two different Arweave transactions, still admits exactly once — the store\'s own idempotent semantics absorb the duplicate'));
        }

        // (7) Unknown Publication (locally unrecognized publicationId) is
        // still admitted, never rejected on that basis alone.
        {
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g7'), discoveryTag: 't-g7' });
            const envelopeJson = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-adv-unknown-pub'), { publicationId: 'pub-totally-unrecognized-locally' });
            const { locator } = await distribution.publish(envelopeJson);
            const retrieved = await distribution.retrieve(locator);
            assert(admitOrReject(retrieved).admitted === true, n('(7) a Commentary naming a locally unknown Publication is still admitted — no Publication-existence check at this boundary'));
        }

        // (8) Wrong discovery tag — a candidate published under a
        // different campaign is never returned by discover() for this one.
        {
            const gateway = makeSharedFakeGateway();
            const distributionA = makeDistribution({ gateway, signer: fakeArweaveSigner('g8a'), discoveryTag: 't-g8-campaign-a' });
            const distributionB = makeDistribution({ gateway, signer: fakeArweaveSigner('g8b'), discoveryTag: 't-g8-campaign-b' });
            await distributionA.publish(signedCommentaryEnvelopeJson(makeIdentity('0.9.631-adv-tag-a'), { publicationId: 'pub-g8' }));
            const discoveredUnderB = await distributionB.discover();
            assert(discoveredUnderB.length === 0, n('(8) a candidate published under a different discovery tag never surfaces in a search for this one'));
        }

        // (9) Gateway unavailable at retrieval time — non-destructive.
        {
            const { store, commentary, envelopeJson } = freshCase('gateway-unavailable');
            store.save(commentary);
            const gateway = makeSharedFakeGateway();
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g9'), discoveryTag: 't-g9' });
            const { locator } = await distribution.publish(envelopeJson);
            const unreachableDistribution = makeDistribution({ gateway: { fetchImpl: erroringFetchImpl(), graphqlUrl: 'https://unreachable.example/graphql' }, signer: fakeArweaveSigner('g9b'), discoveryTag: 't-g9' });
            let rejected = false;
            try { await unreachableDistribution.retrieve(locator); } catch { rejected = true; }
            assert(rejected, n('(9) an unavailable gateway at retrieval time rejects, never silently admits or deletes anything'));
            assertLocalStateIntact(store, commentary.commentaryId, '9');
        }

        // (10) Transaction not yet mined — non-destructive.
        {
            const { store, commentary, envelopeJson } = freshCase('not-yet-mined');
            store.save(commentary);
            const gateway = makeSharedFakeGateway({ mineDelayTicks: 5 });
            const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('g10'), discoveryTag: 't-g10' });
            const { locator } = await distribution.publish(envelopeJson);
            let rejected = false;
            try { await distribution.retrieve(locator); } catch { rejected = true; }
            assert(rejected, n('(10) a not-yet-mined transaction rejects retrieve(), never silently admits or deletes anything'));
            assertLocalStateIntact(store, commentary.commentaryId, '10');
        }

        console.log('✓ G: all ten adversarial cases — tampered bytes, altered commentaryId, altered publicationId, forged signer, malformed envelope, duplicate transaction, unknown Publication, wrong discovery tag, unavailable gateway, and not-yet-mined — behave correctly, and the two Arweave-specific failure modes (9, 10) are proven non-destructive to already-persisted local Commentary state.');
    }

    // ===============================================================
    // Section H — identity independence.
    // ===============================================================
    {
        const provider = makeIdentity('0.9.631-identity');
        const gateway = makeSharedFakeGateway();
        const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('h'), discoveryTag: 't-h' });
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.631-identity', authorIdentityId: provider.getSigningIdentity().id, content: 'identity independence check' });
        const exchange = new PublicationCommentaryDistributionExchange(new PublicationCommentaryStore(new InMemoryStorageProvider()), provider, new LocalAuthorizationVerifier());
        const envelopeJson = exchange.exportCommentary(commentary);
        const { locator } = await distribution.publish(envelopeJson);

        assert(locator !== commentary.commentaryId && locator !== commentary.publicationId && locator !== provider.getSigningIdentity().id,
            n('the Arweave transaction id (locator) is a distinct fact from commentaryId, publicationId, and authorIdentityId — never aliased to any of them'));
        const retrieved = await distribution.retrieve(locator);
        assert(retrieved.commentaryId === commentary.commentaryId && retrieved.publicationId === commentary.publicationId,
            n('commentaryId and publicationId survive the round trip unchanged, independent of the transport-layer locator'));

        const envelopeSource = await rawSource('core/PublicationCommentaryDistributionEnvelope.js');
        assert(!/arweaveTransactionId/i.test(envelopeSource),
            n('the envelope class carries no arweaveTransactionId field of any kind — the locator stays a caller-side fact, never folded into Commentary identity'));

        console.log('✓ H: commentaryId / publicationId / authorIdentityId / the Arweave transaction id remain four independent facts.');
    }

    // ===============================================================
    // Section I — ui/main.js production wiring: construction sites and
    // selection, never fan-out.
    // ===============================================================
    {
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        assert(mainSource.includes("import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';")
            && mainSource.includes("import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';"),
            n('ui/main.js imports both new classes'));

        const constructionSites = grepFiles('new PublicationCommentaryArweaveDistribution\\(', ['ui', 'application']);
        assert(constructionSites.length === 1 && constructionSites[0].endsWith('ui/main.js'),
            n('ui/main.js is the one and only production construction site for PublicationCommentaryArweaveDistribution'));

        assert(mainSource.includes('signer: arweaveHostSigner,') && mainSource.includes('gatewayUrl: resolvedArweaveGatewayUrl'),
            n('the Arweave Commentary distribution instance reuses the SAME arweaveHostSigner/resolvedArweaveGatewayUrl bindings every other Arweave capability in this file already reuses — no second signer/gateway resolution'));

        assert(mainSource.includes("app.provide('discoverPublicationCommentaryFromArweaveCommand', discoverPublicationCommentaryFromArweaveCommand)"),
            n('the Arweave discovery command is provided app-wide, mirroring discoverPublicationCommentaryFromNostrCommand exactly'));

        const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
        assert(wrapperMatch !== null, n('addPublicationCommentaryCommand is found, source-level'));
        const wrapperBody = wrapperMatch[1];
        assert(/discoveryProvider === 'arweave'\s*\?\s*publicationCommentaryArweaveDistribution\s*:\s*publicationCommentaryNostrDistribution/.test(wrapperBody),
            n('SELECTION, NEVER FAN-OUT: exactly one asynchronous substrate is chosen per call — never both — mirroring application/publication/distribution/PublicationDistributionRuntimeComposition.js\'s own invariant of the same name'));
        assert((wrapperBody.match(/\.publish\(envelopeJson\)\.catch\(\(\) => \{\}\)/g) || []).length === 1,
            n('exactly one fire-and-forget publish call exists in the wrapper body — the selected substrate\'s own, never two parallel publish attempts'));

        console.log('✓ I: ui/main.js constructs PublicationCommentaryArweaveDistribution exactly once, reusing existing Arweave host/gateway collaborators, and addPublicationCommentaryCommand selects between Nostr and Arweave rather than fanning out to both.');
    }

    // ===============================================================
    // Section J — DiscoverPublicationCommentaryFromArweaveUseCase in
    // isolation.
    // ===============================================================
    {
        let threw = false;
        try { new DiscoverPublicationCommentaryFromArweaveUseCase(null, {}); } catch { threw = true; }
        assert(threw, n('a missing arweaveDistribution collaborator throws at construction'));
        threw = false;
        try { new DiscoverPublicationCommentaryFromArweaveUseCase({ discover: async () => [] }, null); } catch { threw = true; }
        assert(threw, n('a missing commentaryExchange collaborator throws at construction'));

        const gateway = makeSharedFakeGateway();
        const distribution = makeDistribution({ gateway, signer: fakeArweaveSigner('j'), discoveryTag: 't-j' });
        const { exchange } = makeExchange();
        const useCase = new DiscoverPublicationCommentaryFromArweaveUseCase(distribution, exchange);

        assert(JSON.stringify(await useCase.execute({})) === '[]', n('no publicationId, no candidates fetched at all — an empty array, never a thrown error'));
        assert(JSON.stringify(await useCase.execute()) === '[]', n('no argument at all behaves identically'));

        const good = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-j-good'), { publicationId: 'pub-j' });
        await distribution.publish(good);
        // A candidate under the SAME tag but naming a different publicationId
        // must be filtered out.
        const otherPub = signedCommentaryEnvelopeJson(makeIdentity('0.9.631-j-other'), { publicationId: 'pub-j-other' });
        await distribution.publish(otherPub);

        const admitted = await useCase.execute({ publicationId: 'pub-j' });
        assert(admitted.length === 1 && admitted[0].commentary.commentaryId === good.commentaryId,
            n('only the candidate naming the requested publicationId is admitted — the shared discovery tag is a query mechanism, never Commentary identity'));

        console.log('✓ J: DiscoverPublicationCommentaryFromArweaveUseCase guards both constructor arguments, degrades gracefully with no publicationId, and filters candidates by publicationId correctly.');
    }

    // ===============================================================
    // Section K — exclusion guard.
    // ===============================================================
    {
        const newFilesSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryArweaveDistribution.js'))
            + codeOnly(await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js'))
            + codeOnly(await rawSource('application/arweave/ArweaveTaggedTransactionSearch.js'));
        assert(!/arweaveTransactionId\s*[:=]|nostrEventId\s*[:=]/.test(newFilesSource),
            n('no new Commentary identity field of any kind is introduced anywhere in this milestone\'s own new files'));
        assert(!/setTimeout\([^)]*retry|setInterval|while\s*\(\s*true\s*\)|MAX_RETR|backoff/i.test(newFilesSource),
            n('no retry/background-sync/backoff vocabulary of any kind — this milestone deliberately never compensates for mining delay with a retry mechanism'));
        assert(!/relayRank|relayScore|gatewayRank|gatewayScore|gatewayFallback|fallbackGateway/i.test(newFilesSource),
            n('no gateway ranking, preference, or fallback vocabulary of any kind'));

        const nostrFilesSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryNostrDistribution.js'))
            + codeOnly(await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js'));
        assert(!/Arweave/i.test(nostrFilesSource),
            n('the existing Nostr Commentary substrate/admission files remain completely unmodified and unaware of Arweave'));

        const peerExchangeSource = await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js');
        assert(!/Arweave/i.test(peerExchangeSource),
            n('the existing WebRTC peer exchange remains entirely unaware of Arweave, exactly as it already was unaware of Nostr'));

        const bridgeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js'));
        assert(!/Arweave/i.test(bridgeSource),
            n('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js is unmodified by this milestone — it still mentions nothing Arweave-shaped, because it already accepts the transport-agnostic { commentary, isNew } shape'));

        console.log('✓ K: no new Commentary identity field, no retry/mining-delay compensation, no gateway ranking, and no change whatsoever to the Nostr or WebRTC Commentary paths.');
    }

    // ===============================================================
    // Section L — verdict.
    // ===============================================================
    {
        console.log('\n=== 0.9.631 VERDICT ===');
        console.log('CONCRETE_PRODUCT_GAP (0.9.630) -> CLOSED. application/publication/commentary/PublicationCommentaryArweaveDistribution.js');
        console.log('    (the small, permanent adapter that audit named) now exists, composing the same two');
        console.log('    unmodified transport primitives that audit proved conform, plus a new standalone');
        console.log('    tag-search primitive (application/arweave/ArweaveTaggedTransactionSearch.js) filling the');
        console.log('    second gap that audit named. It is wired into ui/main.js as a genuinely SELECTABLE');
        console.log('    asynchronous substrate alongside Nostr — never a silent fan-out to both.');
        console.log('SEMANTIC_GAP (0.9.630 Section E) -> PRESERVED, HONESTLY. retrieve() never claims a');
        console.log('    stronger guarantee than the substrate offers: not-yet-mined, never-published, and');
        console.log('    gateway-unreachable all remain indistinguishable ContentUnavailableError rejections.');
        console.log('Retry/mining-delay compensation -> DELIBERATELY UNBUILT, per this milestone\'s own brief.');
        console.log(`\n✅ All Publication Commentary Arweave Asynchronous Distribution tests passed (${assertionCount} assertions).`);
    }
}

await run();
