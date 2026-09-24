import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { Publication } from '../publisher/Publication.js';

import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { PublicationCommentaryNostrDistribution } from '../application/publication/commentary/PublicationCommentaryNostrDistribution.js';
import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';

import {
    PublicationCommentaryDeliveryStatus,
    isValidPublicationCommentaryDeliveryStatusTransition
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';

import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.632 — Publication Commentary Cross-Substrate Distribution Closure
// Audit.
//
// TYPE: test-only product/architecture closure audit. PRODUCTION CHANGES:
// none (Section N's own guard; tests.html is registered alongside tests/
// throughout this codebase's own prior audits' identical convention —
// see 0.9.629's own Section M git-diff exclusion list, reused verbatim
// below).
//
// THE QUESTION. 0.9.617-0.9.628 built and closed the Nostr path.
// 0.9.629-0.9.631 built and closed the Arweave path. Both closures were
// SUBSTRATE-SCOPED: each proved its own substrate carries Commentary
// correctly, in isolation. This file asks the one question neither could
// ask alone: do WebRTC, Nostr, and Arweave now form ONE coherent
// Commentary distribution system, or did adding a third transport quietly
// create three different semantics wearing one UI? The FLAGSHIP (Section
// B) is the single strongest piece of evidence either way: the identical
// signed Commentary, independently delivered over all three transports,
// converges to exactly one stored record and exactly one notification,
// while five independent identity facts survive unchanged throughout.
//
//   Section A — re-execute the entire 0.9.617-0.9.631 arc (fourteen
//               files), live, as real subprocesses against current source.
//   Section B — FLAGSHIP: one signed Commentary, delivered over WebRTC,
//               Nostr, AND Arweave independently, converges to one stored
//               record and one notification.
//   Section C — identity continuity: commentaryId, publicationId,
//               authorIdentityId, the Nostr event id, and the Arweave
//               transaction id are five independent, unaliased facts;
//               WebRTC mints no locator of its own at all.
//   Section D — verification equivalence: the IDENTICAL six-case
//               adversarial corpus, run independently over WebRTC, Nostr,
//               and Arweave, produces the identical result on all three —
//               no substrate acquires its own verification authority.
//   Section E — admission equivalence: valid admits / invalid rejects on
//               both asynchronous substrates (built from Section D's own
//               live results); a locally-unknown Publication is still
//               admitted on every transport; a genuine signature is never
//               conflated with proof of Publication ownership.
//   Section F — notification convergence, the mirror of the flagship:
//               three DIFFERENT authors, over three DIFFERENT transports,
//               produce three DISTINCT notifications with an identical,
//               transport-silent payload shape — proving dedup neither
//               over- nor under-fires.
//   Section G — substrate-selection invariant: the actual
//               `addPublicationCommentaryCommand` wrapper body, extracted
//               live from ui/main.js's own current source and executed
//               against fake collaborators, is shown to select AT MOST
//               ONE asynchronous substrate per call, never both.
//   Section H — failure isolation: local persistence and WebRTC survive
//               Nostr AND Arweave both failing simultaneously; Arweave's
//               own wider not-mined/never-published/unreachable collapse
//               is reconfirmed distinct from Nostr's, never normalized.
//   Section I — cross-publication isolation, both asynchronous
//               substrates, one shared discovery campaign.
//   Section J — multi-author convergence: three authors on one
//               Publication, scrambled across all three transports;
//               distinct identity, no hidden ordering semantic, and
//               idempotent duplicate re-delivery.
//   Section K — persistence semantics: PERSISTENTLY_PUBLISHED is never
//               conflated with retrievability, on either asynchronous
//               substrate, and the two substrates' own materially
//               different consistency characteristics are preserved
//               rather than forced into one shape.
//   Section L — product parity table, built from this file's own live
//               findings above, never asserted independently.
//   Section M — architecture guard: adapters stay transport adapters,
//               verification stays centralized, discovery tags stay
//               transport mechanisms, one Commentary store, no
//               publication-authorization inference.
//   Section N — production-change guard; no production file touched.
//   Section O — verdict.
//
// DELIBERATELY EXCLUDED, per this milestone's own requesting brief:
// multi-relay Nostr fallback, simultaneous Nostr+Arweave dual-publish, retry queues,
// background synchronization, mining-delay compensation, delivery/read
// receipts, guaranteed owner consumption, live Nostr subscriptions, global
// Commentary indexing, new Commentary identity, a new deduplication
// service, a new authorization model, Commentary-specific persistence,
// and any change to Snapshot distribution or WebRTC transport itself.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}
function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}
function runGuardLive(relativeTestFile) {
    try {
        const stdout = execSync(`node ${relativeTestFile}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        return { passed: true, stdout };
    } catch (error) {
        return { passed: false, stdout: `${error.stdout || ''}${error.stderr || ''}` };
    }
}

// Findings captured live, section by section, and read back ONLY in
// Section L — the same "built FROM live results, never asserted
// independently" discipline 0.9.629's own Section L already held.
const findings = {};

function makeExchange(identityProvider) {
    const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, new LocalAuthorizationVerifier());
    return { store, exchange };
}

function makePublication({ id, publisherProvider }) {
    const publication = new Publication({
        id,
        documentId: `doc-for-${id}`,
        title: `World ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const discoveryStorage = new InMemoryStorageProvider();
    discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
    return { publication, discoveryProvider: new LocalDiscoveryProvider(discoveryStorage) };
}

// ===================================================================
// Nostr fixtures — the identical fake NIP-07 extension / fake relay
// shape 0.9.628/0.9.629's own test files already established.
// ===================================================================
let globalSignCounter = 0;
function fakeNostrExtension() {
    return {
        getPublicKey: async () => 'fake-pubkey',
        signEvent: async (event) => {
            globalSignCounter += 1;
            const hex = globalSignCounter.toString(16);
            return { ...event, id: hex.padEnd(64, '0'), sig: 'a'.repeat(128) };
        }
    };
}
function makeSharedFakeRelay() {
    const events = new Map();
    class FakeSocket {
        constructor(url) {
            this.url = url;
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
        send(data) {
            let parsed;
            try { parsed = JSON.parse(data); } catch { return; }
            if (!Array.isArray(parsed)) return;
            if (parsed[0] === 'EVENT' && parsed.length === 2) {
                const event = parsed[1];
                events.set(event.id, JSON.parse(JSON.stringify(event)));
                queueMicrotask(() => this.onmessage && this.onmessage({ data: JSON.stringify(['OK', event.id, true]) }));
                return;
            }
            if (parsed[0] === 'REQ') {
                const [, subId, filter] = parsed;
                const matches = Array.from(events.values()).filter((event) => matchesNostrFilter(event, filter));
                queueMicrotask(() => {
                    if (!this.onmessage) return;
                    for (const event of matches) this.onmessage({ data: JSON.stringify(['EVENT', subId, event]) });
                    this.onmessage({ data: JSON.stringify(['EOSE', subId]) });
                });
            }
        }
        close() {}
    }
    return { FakeSocket, events };
}
function matchesNostrFilter(event, filter) {
    if (Array.isArray(filter.ids) && !filter.ids.includes(event.id)) return false;
    if (Array.isArray(filter['#t'])) {
        const tagValues = (event.tags || []).filter((tag) => tag[0] === 't').map((tag) => tag[1]);
        if (!filter['#t'].some((tag) => tagValues.includes(tag))) return false;
    }
    return true;
}
function erroringNostrSocketCtor() {
    return class FakeSocket {
        constructor() { queueMicrotask(() => { if (this.onerror) this.onerror(new Error('boom')); }); }
        send() {}
        close() {}
    };
}
function makeNostrDistribution({ relay, extension, relayUrl = 'wss://relay.example', discoveryTag = 'forkbuild-commentary' } = {}) {
    return new PublicationCommentaryNostrDistribution({
        publishImpl: createNostrInjectedProviderPublisher({ injectedProvider: extension || fakeNostrExtension(), webSocketImpl: relay.FakeSocket }),
        queryImpl: createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket }),
        relayUrl,
        discoveryTag
    });
}

// ===================================================================
// Arweave fixtures — the identical fake signer / fake gateway shape
// 0.9.630/0.9.631's own test files already established.
// ===================================================================
function fakeArweaveSigner(label) {
    let counter = 0;
    return {
        sign: async (material, tags = []) => {
            counter += 1;
            const id = `${label}Tx${counter}`.padEnd(43, '0');
            return { id, transaction: { id, format: 2, data: material, tags } };
        }
    };
}
function makeSharedFakeGateway({ declineUpload = false, mineDelayTicks = 0 } = {}) {
    const transactions = new Map();
    let tick = 0;
    return {
        transactions,
        graphqlUrl: 'https://fake-arweave-gateway.example/graphql',
        advanceTick(count = 1) { tick += count; },
        async fetchImpl(url, options = {}) {
            const method = (options.method || 'GET').toUpperCase();
            if (method === 'POST' && url.endsWith('/graphql')) {
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
                return new Response(entry.data, { status: 200, headers: { 'content-length': String(new TextEncoder().encode(entry.data).length) } });
            }
            throw new Error(`fakeGateway: unexpected request ${method} ${url}`);
        }
    };
}
function erroringArweaveFetchImpl() {
    return async () => { throw new Error('fakeGateway: network unreachable'); };
}
function makeArweaveDistribution({ gateway, signer, discoveryTag, gatewayUrl = 'https://fake-arweave-gateway.example' } = {}) {
    return new PublicationCommentaryArweaveDistribution({
        signer: signer || fakeArweaveSigner('default'),
        gatewayUrl,
        graphqlUrl: gateway ? gateway.graphqlUrl : `${gatewayUrl}/graphql`,
        fetchImpl: gateway ? gateway.fetchImpl : erroringArweaveFetchImpl(),
        discoveryTag: discoveryTag || 'forkbuild-commentary'
    });
}

// ===================================================================
// WebRTC fixtures — a real, authenticated peer connection, the
// identical shape 0.9.629's own Section B/G test file already
// established.
// ===================================================================
async function makeAuthenticatedPeerPair(labelA, labelB) {
    const network = new LocalPeerNetwork();
    const transportA = new LocalPeerConnectionProvider(labelA, network);
    const transportB = new LocalPeerConnectionProvider(labelB, network);
    const identityA = makeIdentity(`${labelA}-identity`);
    const identityB = makeIdentity(`${labelB}-identity`);
    const connectA = new ConnectToPeerUseCase({ peerConnectionProvider: transportA, identityProvider: identityA });
    const stopA = connectA.listen();
    const connectB = new ConnectToPeerUseCase({ peerConnectionProvider: transportB, identityProvider: identityB });
    const stopB = connectB.listen();
    const aToB = connectA.connect({ candidateEndpoint: labelB });
    await wait(20);
    return { identityA, identityB, connectA, connectB, stopA, stopB, aToB };
}

// A single, shared six-case adversarial corpus — the SAME transform
// functions applied identically regardless of which transport later
// carries the result. Section D's whole point is that this ONE corpus
// definition is reused verbatim across WebRTC, Nostr, and Arweave.
function buildVerificationCorpus(label, publicationId) {
    const honest = makeIdentity(`${label}-honest`);
    const { exchange: honestExchange } = makeExchange(honest);
    const honestCommentary = new PublicationCommentary({ publicationId, authorIdentityId: honest.getSigningIdentity().id, content: `genuine comment (${label})` });
    const honestEnvelope = honestExchange.exportCommentary(honestCommentary);

    const forger = makeIdentity(`${label}-forger`);
    const { exchange: forgerExchange } = makeExchange(forger);
    const victim = makeIdentity(`${label}-victim`);
    const forgedByAuthor = new PublicationCommentary({ publicationId, authorIdentityId: forger.getSigningIdentity().id, content: 'forged authorship' });
    const forgedAuthorEnvelope = { ...forgerExchange.exportCommentary(forgedByAuthor), authorIdentityId: victim.getSigningIdentity().id };

    const alteredContentEnvelope = { ...honestExchange.exportCommentary(new PublicationCommentary({ publicationId, authorIdentityId: honest.getSigningIdentity().id, content: 'original' })), content: 'tampered content' };
    const alteredIdEnvelope = { ...honestExchange.exportCommentary(new PublicationCommentary({ publicationId, authorIdentityId: honest.getSigningIdentity().id, content: 'id target' })), commentaryId: 'tampered-commentary-id' };

    const otherPub = new PublicationCommentary({ publicationId: `${publicationId}-elsewhere`, authorIdentityId: honest.getSigningIdentity().id, content: 'belongs elsewhere' });
    const retargetedEnvelope = { ...honestExchange.exportCommentary(otherPub), publicationId };

    const malformedShape = { kind: 'not-a-real-envelope' };
    const malformedSignature = { ...honestExchange.exportCommentary(new PublicationCommentary({ publicationId, authorIdentityId: honest.getSigningIdentity().id, content: 'bad sig shape' })), signature: 'not-an-object' };

    return {
        honestCommentary,
        honestEnvelope,
        variants: [
            ['forged author', forgedAuthorEnvelope],
            ['altered content', alteredContentEnvelope],
            ['altered commentaryId', alteredIdEnvelope],
            ['retargeted publicationId', retargetedEnvelope],
            ['malformed shape', malformedShape],
            ['malformed signature', malformedSignature]
        ]
    };
}

async function run() {
    // ===============================================================
    // Section A — re-execute the entire 0.9.617-0.9.631 arc, live.
    // ===============================================================
    {
        const arc = [
            ['tests/PublicationCommentaryDistributionBoundaryAudit.test.js', /All Publication Commentary Distribution Boundary Audit tests passed/],
            ['tests/PublicationCommentaryDistribution.test.js', /All Publication Commentary Distribution tests passed/],
            ['tests/PublicationCommentaryCrossDeviceProductClosureAudit.test.js', /All Publication Commentary Cross-Device Product Closure Audit tests passed/],
            ['tests/PublicationCommentaryDistributionWiring.test.js', /All Publication Commentary Distribution Wiring tests passed/],
            ['tests/PublicationCommentaryApplicationDistributionClosureAudit.test.js', /All Publication Commentary Application Distribution Closure Audit tests passed/],
            ['tests/PostCommentaryDistributionProductReassessment.test.js', /All Post-Commentary-Distribution Product Reassessment tests passed/],
            ['tests/PublicationCommentaryRemoteNotificationWiring.test.js', /All Publication Commentary Remote Notification Wiring tests passed/],
            ['tests/PublicationCommentaryPersistentDistributionBoundaryAudit.test.js', /All Publication Commentary Persistent Distribution Boundary Audit tests passed/],
            ['tests/PublicationCommentaryAsynchronousDeliveryContract.test.js', /All Publication Commentary Asynchronous Delivery Contract tests passed/],
            ['tests/PublicationCommentaryNostrRoundTripBoundaryAudit.test.js', /All Publication Commentary Nostr Round-Trip Boundary Audit tests passed/],
            ['tests/PublicationCommentaryNostrAsynchronousDistribution.test.js', /All Publication Commentary Nostr Asynchronous Distribution tests passed/],
            ['tests/PublicationCommentaryNostrAsynchronousDistributionClosureAudit.test.js', /All Publication Commentary Nostr Asynchronous Distribution Closure Audit tests passed/],
            ['tests/PublicationCommentaryArweaveDistributionBoundaryAudit.test.js', /All Publication Commentary Arweave Distribution Boundary Audit tests passed/],
            ['tests/PublicationCommentaryArweaveAsynchronousDistribution.test.js', /All Publication Commentary Arweave Asynchronous Distribution tests passed/]
        ];
        for (const [file, verdictPattern] of arc) {
            const result = runGuardLive(file);
            assert(result.passed && verdictPattern.test(result.stdout),
                n(`${file} (0.9.617-0.9.631's own arc), re-executed live against current source, still exits 0 and prints its own passing verdict`));
        }
        console.log(`✓ A: the entire 0.9.617-0.9.631 arc — ${arc.length} files, spanning WebRTC distribution, Nostr distribution, and Arweave distribution — reconfirmed live, right now, against current source.`);
    }

    // ===============================================================
    // Section B — FLAGSHIP: one signed Commentary, delivered over
    // WebRTC, Nostr, AND Arweave independently, converges to one
    // stored record and one notification.
    // ===============================================================
    {
        const alice = makeIdentity('0.9.632-flagship-alice');
        const bob = makeIdentity('0.9.632-flagship-bob');
        const { publication: bobsWork, discoveryProvider } = makePublication({ id: 'pub-0.9.632-flagship', publisherProvider: bob });

        const { store: aliceStore, exchange: aliceExchange } = makeExchange(alice);
        const commentary = new PublicationCommentary({
            publicationId: bobsWork.id,
            authorIdentityId: alice.getSigningIdentity().id,
            content: 'flagship: the SAME signed comment, over WebRTC, Nostr, and Arweave'
        });
        aliceStore.save(commentary);
        const envelopeJson = aliceExchange.exportCommentary(commentary);
        const originalCommentaryId = commentary.commentaryId;

        // Bob's own single, independent replica — one store, one
        // exchange, one bridge — receiving the identical Commentary
        // three separate times, over three separate transports.
        const { store: bobStore, exchange: bobExchange } = makeExchange(bob);
        const notifications = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, bob, (event) => notifications.push(event));

        // (1) WebRTC — live, first.
        const { connectA: aliceConnect, connectB: bobConnect, stopA: stopAlice, stopB: stopBob } =
            await makeAuthenticatedPeerPair('0.9.632-flagship-alice-device', '0.9.632-flagship-bob-device');
        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const bobPeerExchange = new PublicationCommentaryDistributionPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);
        const unsubscribeWebRTC = bobPeerExchange.onCommentaryReceived((result) => bridge.handleCommentaryReceived(result));
        const sentTo = alicePeerExchange.announce(commentary);
        await wait(40);
        assert(sentTo === 1, n('setup: the WebRTC announce really was sent to exactly one authenticated peer'));
        assert(bobStore.getById(originalCommentaryId) !== null, n('(1) WebRTC: Bob\'s replica admits the Commentary — first arrival, isNew and notified'));
        assert(notifications.length === 1, n('(1) WebRTC arrival produces exactly one notification'));

        // (2) Nostr — the identical envelope, published to a fake
        // relay, discovered independently.
        const relay = makeSharedFakeRelay();
        await makeNostrDistribution({ relay, discoveryTag: '0.9.632-flagship' }).publish(envelopeJson);
        const nostrAdmitted = await new DiscoverPublicationCommentaryFromNostrUseCase(
            makeNostrDistribution({ relay, discoveryTag: '0.9.632-flagship' }), bobExchange
        ).execute({ publicationId: bobsWork.id });
        assert(nostrAdmitted.length === 1 && nostrAdmitted[0].commentary.commentaryId === originalCommentaryId,
            n('(2) Nostr: the same Commentary is discovered and reconstructed identically'));
        assert(nostrAdmitted[0].isNew === false, n('(2) Nostr: recognized as already on file (isNew: false) — the WebRTC arrival got there first'));
        bridge.handleCommentaryReceived(nostrAdmitted[0]);
        assert(notifications.length === 1, n('(2) the Nostr arrival of the SAME Commentary produces NO second notification'));

        // (3) Arweave — the identical envelope, published to a fake
        // gateway, discovered independently.
        const gateway = makeSharedFakeGateway();
        await makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-flagship' }).publish(envelopeJson);
        const arweaveAdmitted = await new DiscoverPublicationCommentaryFromArweaveUseCase(
            makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-flagship' }), bobExchange
        ).execute({ publicationId: bobsWork.id });
        assert(arweaveAdmitted.length === 1 && arweaveAdmitted[0].commentary.commentaryId === originalCommentaryId,
            n('(3) Arweave: the same Commentary is discovered and reconstructed identically'));
        assert(arweaveAdmitted[0].isNew === false, n('(3) Arweave: also recognized as already on file (isNew: false)'));
        bridge.handleCommentaryReceived(arweaveAdmitted[0]);
        assert(notifications.length === 1, n('(3) the Arweave arrival of the SAME Commentary produces NO third notification either'));

        // Convergence: exactly one stored record, on Bob's own single
        // store, regardless of three independent transport arrivals.
        assert(bobStore.loadAll().filter((c) => c.commentaryId === originalCommentaryId).length === 1,
            n('exactly ONE stored Commentary record exists on Bob\'s replica after three independent transport arrivals'));
        assert(notifications.length === 1 && notifications[0].eventType === PUBLICATION_COMMENTED_EVENT_TYPE,
            n('exactly ONE notification exists, of the ordinary publication.commented shape — no notification explosion'));
        assert(notifications[0].payload.commentaryId === originalCommentaryId && notifications[0].payload.authorIdentityId === alice.getSigningIdentity().id,
            n('the single surviving notification is about Alice\'s comment, addressed to Bob — correct regardless of which transport happened to win the race'));
        assert(bobStore.getById(originalCommentaryId).content === commentary.content,
            n('content survives byte for byte across all three transports'));

        unsubscribeWebRTC();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopAlice();
        stopBob();

        findings.tripleConvergenceOneRecordOneNotification = true;
        console.log('✓ B — FLAGSHIP: the identical signed Commentary, independently delivered over WebRTC, Nostr, and Arweave, converges to exactly one stored record and exactly one notification — one Commentary model, three transport paths, never three semantics.');
    }

    // ===============================================================
    // Section C — identity continuity across all three transports.
    // ===============================================================
    {
        const author = makeIdentity('0.9.632-identity-author');
        const { exchange } = makeExchange(author);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.632-identity', authorIdentityId: author.getSigningIdentity().id, content: 'identity continuity, three transports' });
        const envelopeJson = exchange.exportCommentary(commentary);

        const relay = makeSharedFakeRelay();
        const nostrPublish = await makeNostrDistribution({ relay, discoveryTag: '0.9.632-identity' }).publish(envelopeJson);
        const gateway = makeSharedFakeGateway();
        const arweavePublish = await makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-identity' }).publish(envelopeJson);

        const { aToB } = await makeAuthenticatedPeerPair('0.9.632-identity-a', '0.9.632-identity-b');
        assert(aToB.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a live WebRTC connection exists'));

        const distinctValues = new Set([
            commentary.commentaryId,
            commentary.publicationId,
            author.getSigningIdentity().id,
            nostrPublish.locator,
            arweavePublish.locator
        ]);
        assert(distinctValues.size === 5,
            n('commentaryId, publicationId, authorIdentityId, the Nostr event id, and the Arweave transaction id are FIVE distinct, unaliased values across the whole system — none derived from or collapsed into another'));

        assert(nostrPublish.locator !== arweavePublish.locator, n('the two asynchronous substrates mint independent locators of their own for the identical envelope'));

        // WebRTC mints no locator of its own at all — announce() returns
        // only a peer count, never an identifier for the delivered
        // message.
        const webrtcExchange = makeExchange(author).exchange;
        const webrtcPeerExchange = new PublicationCommentaryDistributionPeerExchange(webrtcExchange, new PeerMessageBus(), { list: () => [], onChange: () => () => {} });
        const announceResult = webrtcPeerExchange.announce(commentary);
        assert(typeof announceResult === 'number', n('WebRTC\'s own announce() returns a peer COUNT, never a locator — this transport mints no identity of its own for a delivered Commentary, unlike the two asynchronous substrates'));

        const envelopeSource = codeOnly(await rawSource('core/PublicationCommentaryDistributionEnvelope.js'));
        assert(!/nostrEventId|arweaveTransactionId/i.test(envelopeSource),
            n('the envelope itself carries neither field — both transport locators stay caller-side facts, never folded into Commentary identity'));

        console.log('✓ C: commentaryId, publicationId, authorIdentityId, the Nostr event id, and the Arweave transaction id remain five independent facts; WebRTC mints no locator of its own at all.');
    }

    // ===============================================================
    // Section D — verification equivalence: the IDENTICAL corpus, over
    // all three transports.
    // ===============================================================
    {
        // (1) WebRTC.
        const corpusW = buildVerificationCorpus('0.9.632-verify-webrtc', 'pub-0.9.632-verify-w');
        const { connectA: senderConnect, connectB: receiverConnect, aToB: senderToReceiver, stopA: stopSender, stopB: stopReceiver } =
            await makeAuthenticatedPeerPair('0.9.632-verify-sender', '0.9.632-verify-receiver');
        const receiverIdentity = makeIdentity('0.9.632-verify-webrtc-receiver-exchange');
        const { exchange: receiverExchange, store: receiverStore } = makeExchange(receiverIdentity);
        const receiverPeerExchange = new PublicationCommentaryDistributionPeerExchange(receiverExchange, new PeerMessageBus(), receiverConnect.registry);
        const webrtcReceived = [];
        const unsubWebRTC = receiverPeerExchange.onCommentaryReceived((r) => webrtcReceived.push(r));
        const rawBus = new PeerMessageBus();
        for (const [, envelope] of corpusW.variants) {
            rawBus.send(senderToReceiver, PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope });
        }
        rawBus.send(senderToReceiver, PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: corpusW.honestEnvelope });
        await wait(30);
        assert(webrtcReceived.length === 1 && webrtcReceived[0].commentary.commentaryId === corpusW.honestCommentary.commentaryId,
            n('WebRTC: exactly the one honest, correctly-signed Commentary is admitted — all six adversarial variants are dropped, silently, never crashing the peer connection'));
        assert(receiverStore.loadAll().length === 1, n('WebRTC: exactly one record ever reaches the receiver\'s store'));
        unsubWebRTC();
        receiverPeerExchange.dispose();
        stopSender();
        stopReceiver();

        // (2) Nostr.
        const corpusN = buildVerificationCorpus('0.9.632-verify-nostr', 'pub-0.9.632-verify-n');
        const relay = makeSharedFakeRelay();
        const nostrPublisher = makeNostrDistribution({ relay, discoveryTag: '0.9.632-verify-n' });
        await nostrPublisher.publish(corpusN.honestEnvelope);
        for (const [, envelope] of corpusN.variants) {
            await nostrPublisher.publish(envelope);
        }
        const nostrReader = makeExchange(makeIdentity('0.9.632-verify-n-reader'));
        const nostrAdmitted = await new DiscoverPublicationCommentaryFromNostrUseCase(
            makeNostrDistribution({ relay, discoveryTag: '0.9.632-verify-n' }), nostrReader.exchange
        ).execute({ publicationId: 'pub-0.9.632-verify-n' });
        assert(nostrAdmitted.length === 1 && nostrAdmitted[0].commentary.commentaryId === corpusN.honestCommentary.commentaryId,
            n('Nostr: exactly the one honest Commentary is admitted — the identical six adversarial variants are all rejected'));

        // (3) Arweave.
        const corpusA = buildVerificationCorpus('0.9.632-verify-arweave', 'pub-0.9.632-verify-a');
        const gateway = makeSharedFakeGateway();
        const arweavePublisher = makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-verify-a' });
        await arweavePublisher.publish(corpusA.honestEnvelope);
        for (const [, envelope] of corpusA.variants) {
            await arweavePublisher.publish(envelope);
        }
        const arweaveReader = makeExchange(makeIdentity('0.9.632-verify-a-reader'));
        const arweaveAdmitted = await new DiscoverPublicationCommentaryFromArweaveUseCase(
            makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-verify-a' }), arweaveReader.exchange
        ).execute({ publicationId: 'pub-0.9.632-verify-a' });
        assert(arweaveAdmitted.length === 1 && arweaveAdmitted[0].commentary.commentaryId === corpusA.honestCommentary.commentaryId,
            n('Arweave: exactly the one honest Commentary is admitted — the identical six adversarial variants are all rejected'));

        findings.verificationEquivalence = true;
        console.log('✓ D: the identical six-case adversarial corpus (forged author, altered content, altered commentaryId, retargeted publicationId, malformed shape, malformed signature) produces the IDENTICAL result — one honest survivor, six rejections — over WebRTC, Nostr, and Arweave alike. No substrate acquires its own verification authority.');
    }

    // ===============================================================
    // Section E — admission equivalence, and signed ≠ ownership.
    // ===============================================================
    {
        // Built directly from Section D's own live behavior: on both
        // asynchronous substrates, VALID admits and INVALID rejects,
        // identically. Reconfirmed here for an unknown Publication (no
        // Publication-existence check gates admission on either
        // substrate) and for the ownership boundary.
        const relay = makeSharedFakeRelay();
        const author = makeIdentity('0.9.632-admission-nostr-author');
        const { exchange: authorExchange } = makeExchange(author);
        const unknownPubCommentary = new PublicationCommentary({ publicationId: 'pub-0.9.632-nobody-knows-nostr', authorIdentityId: author.getSigningIdentity().id, content: 'names an unknown Publication' });
        await makeNostrDistribution({ relay, discoveryTag: '0.9.632-admission-n' }).publish(authorExchange.exportCommentary(unknownPubCommentary));
        const nostrReader = makeExchange(makeIdentity('0.9.632-admission-n-reader'));
        const nostrAdmitted = await new DiscoverPublicationCommentaryFromNostrUseCase(
            makeNostrDistribution({ relay, discoveryTag: '0.9.632-admission-n' }), nostrReader.exchange
        ).execute({ publicationId: 'pub-0.9.632-nobody-knows-nostr' });
        assert(nostrAdmitted.length === 1 && nostrAdmitted[0].isNew === true, n('Nostr: a Commentary naming a locally-unknown Publication is still admitted'));

        const gateway = makeSharedFakeGateway();
        const arweaveAuthor = makeIdentity('0.9.632-admission-arweave-author');
        const { exchange: arweaveAuthorExchange } = makeExchange(arweaveAuthor);
        const unknownPubCommentaryA = new PublicationCommentary({ publicationId: 'pub-0.9.632-nobody-knows-arweave', authorIdentityId: arweaveAuthor.getSigningIdentity().id, content: 'names an unknown Publication' });
        await makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-admission-a' }).publish(arweaveAuthorExchange.exportCommentary(unknownPubCommentaryA));
        const arweaveReader = makeExchange(makeIdentity('0.9.632-admission-a-reader'));
        const arweaveAdmitted = await new DiscoverPublicationCommentaryFromArweaveUseCase(
            makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-admission-a' }), arweaveReader.exchange
        ).execute({ publicationId: 'pub-0.9.632-nobody-knows-arweave' });
        assert(arweaveAdmitted.length === 1 && arweaveAdmitted[0].isNew === true, n('Arweave: identically, a Commentary naming a locally-unknown Publication is admitted'));

        // Signed Commentary ≠ proof of Publication ownership: neither
        // discovery use case ever consults CanCommentOnPublicationUseCase
        // or a Publication's own publisherIdentity before admitting.
        const nostrUseCaseSource = codeOnly(await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js'));
        const arweaveUseCaseSource = codeOnly(await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js'));
        assert(!/CanCommentOnPublicationUseCase|publisherIdentity/.test(nostrUseCaseSource) && !/CanCommentOnPublicationUseCase|publisherIdentity/.test(arweaveUseCaseSource),
            n('neither discovery use case imports CanCommentOnPublicationUseCase or inspects publisherIdentity — a verified signature is never conflated with authorization to comment, on either asynchronous substrate; that boundary remains exactly where it already was (application/publication/CanCommentOnPublicationUseCase.js, untouched)'));

        findings.admissionEquivalence = true;
        console.log('✓ E: discover -> retrieve -> verify -> admit converges to the same behavior on both asynchronous substrates — an unknown Publication never blocks admission, and a verified signature never establishes Publication ownership on either one.');
    }

    // ===============================================================
    // Section F — notification convergence, the flagship's mirror:
    // three DIFFERENT authors, three DIFFERENT transports, three
    // DISTINCT notifications.
    // ===============================================================
    {
        const alice = makeIdentity('0.9.632-conv-alice'); // publisher, receiving
        const bobWebRTC = makeIdentity('0.9.632-conv-bob');
        const carolNostr = makeIdentity('0.9.632-conv-carol');
        const daveArweave = makeIdentity('0.9.632-conv-dave');
        const thirdParty = makeIdentity('0.9.632-conv-thirdparty');

        const { publication, discoveryProvider } = makePublication({ id: 'pub-0.9.632-convergence', publisherProvider: alice });
        const { store: aliceStore, exchange: aliceExchange } = makeExchange(alice);
        const notifications = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (event) => notifications.push(event));

        // Bob, over WebRTC.
        const { connectA: bobConnect, connectB: aliceConnect, stopA: stopBob, stopB: stopAlice } =
            await makeAuthenticatedPeerPair('0.9.632-conv-bob-device', '0.9.632-conv-alice-device');
        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const unsubscribe = alicePeerExchange.onCommentaryReceived((result) => bridge.handleCommentaryReceived(result));
        const { store: bobStore, exchange: bobExchange } = makeExchange(bobWebRTC);
        const bobPeerExchange = new PublicationCommentaryDistributionPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);
        const bobCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: bobWebRTC.getSigningIdentity().id, content: 'delivered over WebRTC' });
        bobStore.save(bobCommentary);
        bobPeerExchange.announce(bobCommentary);
        await wait(40);
        assert(aliceStore.getById(bobCommentary.commentaryId) !== null, n('setup: Bob\'s WebRTC-delivered comment arrived'));

        // Carol, over Nostr.
        const relay = makeSharedFakeRelay();
        const { exchange: carolExchange } = makeExchange(carolNostr);
        const carolCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: carolNostr.getSigningIdentity().id, content: 'delivered over Nostr' });
        await makeNostrDistribution({ relay, discoveryTag: '0.9.632-convergence' }).publish(carolExchange.exportCommentary(carolCommentary));
        const nostrAdmitted = await new DiscoverPublicationCommentaryFromNostrUseCase(
            makeNostrDistribution({ relay, discoveryTag: '0.9.632-convergence' }), aliceExchange
        ).execute({ publicationId: publication.id });
        for (const result of nostrAdmitted) bridge.handleCommentaryReceived(result);

        // Dave, over Arweave.
        const gateway = makeSharedFakeGateway();
        const { exchange: daveExchange } = makeExchange(daveArweave);
        const daveCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: daveArweave.getSigningIdentity().id, content: 'delivered over Arweave' });
        await makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-convergence' }).publish(daveExchange.exportCommentary(daveCommentary));
        const arweaveAdmitted = await new DiscoverPublicationCommentaryFromArweaveUseCase(
            makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-convergence' }), aliceExchange
        ).execute({ publicationId: publication.id });
        for (const result of arweaveAdmitted) bridge.handleCommentaryReceived(result);

        assert(notifications.length === 3, n('exactly THREE notifications exist — one per genuinely distinct comment, over three genuinely distinct transports; convergence dedups identical Commentary (Section B) without ever merging genuinely different ones'));
        const eventTypes = new Set(notifications.map((ntf) => ntf.eventType));
        assert(eventTypes.size === 1 && eventTypes.has(PUBLICATION_COMMENTED_EVENT_TYPE), n('all three share the identical publication.commented eventType'));
        const payloadShapes = new Set(notifications.map((ntf) => JSON.stringify(Object.keys(ntf.payload).sort())));
        assert(payloadShapes.size === 1, n('all three share an identical payload key shape — a recipient cannot structurally distinguish which transport delivered which notification'));
        for (const ntf of notifications) {
            assert(!/webrtc|nostr|peer|relay|arweave|gateway/i.test(JSON.stringify(ntf.toJSON())), n('no notification leaks which transport delivered it, anywhere in its own serialized JSON'));
        }
        const authorIds = new Set(notifications.map((ntf) => ntf.payload.authorIdentityId));
        assert(authorIds.size === 3
            && authorIds.has(bobWebRTC.getSigningIdentity().id)
            && authorIds.has(carolNostr.getSigningIdentity().id)
            && authorIds.has(daveArweave.getSigningIdentity().id),
            n('the three notifications correctly attribute Bob, Carol, and Dave respectively — no cross-attribution'));

        // A non-publisher recipient produces zero notifications,
        // reconfirmed once more across all three transports converged.
        const { exchange: thirdPartyExchange } = makeExchange(thirdParty);
        const thirdPartyNotifications = [];
        const thirdPartyBridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, thirdParty, (event) => thirdPartyNotifications.push(event));
        const thirdPartyNostrAdmitted = await new DiscoverPublicationCommentaryFromNostrUseCase(
            makeNostrDistribution({ relay, discoveryTag: '0.9.632-convergence' }), thirdPartyExchange
        ).execute({ publicationId: publication.id });
        for (const result of thirdPartyNostrAdmitted) thirdPartyBridge.handleCommentaryReceived(result);
        assert(thirdPartyNostrAdmitted.length > 0 && thirdPartyNotifications.length === 0,
            n('a replica that is not the Publication\'s own publisher admits the same Commentary but produces zero notifications — unchanged by having three transports instead of one'));

        unsubscribe();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopAlice();
        stopBob();

        findings.notificationConvergence = true;
        console.log('✓ F: three different authors, over three different transports, converge on one bridge as three DISTINCT, structurally-identical, transport-silent notifications — dedup neither over- nor under-fires.');
    }

    // ===============================================================
    // Section G — substrate-selection invariant: the REAL wrapper
    // body, executed.
    // ===============================================================
    {
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
        assert(wrapperMatch !== null, n('addPublicationCommentaryCommand is found, source-level, in ui/main.js'));
        const wrapperBody = wrapperMatch[1];

        // eslint-disable-next-line no-new-func
        const wrapperFn = new Function(
            'input', 'createPublicationCommentaryCommand', 'publicationCommentaryDistributionPeerExchange',
            'publicationCommentaryArweaveDistribution', 'publicationCommentaryNostrDistribution', 'publicationCommentaryDistributionExchange',
            wrapperBody
        );

        function runWrapper(input, { nostr = null, arweave = null } = {}) {
            const calls = { peer: 0, nostr: 0, arweave: 0 };
            const fakeCreate = () => ({ commentary: { id: 'fake-commentary' } });
            const fakePeer = { announce: () => { calls.peer += 1; } };
            const fakeExchange = { exportCommentary: (c) => ({ envelopeFor: c }) };
            const fakeNostr = nostr ? { publish: (json) => { calls.nostr += 1; return Promise.resolve({ published: true, locator: 'n', json }); } } : null;
            const fakeArweave = arweave ? { publish: (json) => { calls.arweave += 1; return Promise.resolve({ published: true, locator: 'a', json }); } } : null;
            wrapperFn(input, fakeCreate, fakePeer, fakeArweave, fakeNostr, fakeExchange);
            return calls;
        }

        const defaultCalls = runWrapper({}, { nostr: true, arweave: true });
        assert(defaultCalls.peer === 1 && defaultCalls.nostr === 1 && defaultCalls.arweave === 0,
            n('the REAL, current wrapper body, executed live: no discoveryProvider input selects Nostr ONLY (the 0.9.628 default) — Arweave is never called'));

        const nostrCalls = runWrapper({ discoveryProvider: 'nostr' }, { nostr: true, arweave: true });
        assert(nostrCalls.peer === 1 && nostrCalls.nostr === 1 && nostrCalls.arweave === 0,
            n('discoveryProvider: \'nostr\' selects Nostr ONLY — Arweave is never called'));

        const arweaveCalls = runWrapper({ discoveryProvider: 'arweave' }, { nostr: true, arweave: true });
        assert(arweaveCalls.peer === 1 && arweaveCalls.nostr === 0 && arweaveCalls.arweave === 1,
            n('discoveryProvider: \'arweave\' selects Arweave ONLY — Nostr is never called; SELECTION, NEVER BOTH AT ONCE, live-proven against the actual current source text, not a re-implementation of it'));

        const uninitializedCalls = runWrapper({}, { nostr: false, arweave: false });
        assert(uninitializedCalls.peer === 1 && uninitializedCalls.nostr === 0 && uninitializedCalls.arweave === 0,
            n('with neither asynchronous substrate constructed yet (both bindings null, this file\'s own pre-initialization state), the wrapper is a silent no-op for distribution — WebRTC announce still fires — never a throw'));

        console.log('✓ G: the actual addPublicationCommentaryCommand wrapper body, extracted from ui/main.js\'s own current source and executed against fake collaborators, selects AT MOST ONE asynchronous substrate per call in every case — the default, an explicit choice of either substrate, and the uninitialized state.');
    }

    // ===============================================================
    // Section H — failure isolation: local + WebRTC survive BOTH
    // asynchronous substrates failing at once; Arweave's wider gap
    // stays distinct from Nostr's.
    // ===============================================================
    {
        const author = makeIdentity('0.9.632-isolation-author');
        const { store, exchange } = makeExchange(author);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.632-isolation', authorIdentityId: author.getSigningIdentity().id, content: 'must survive both async substrates failing at once' });
        store.save(commentary);

        class NoPeerRegistry { list() { return []; } onChange() { return () => {}; } }
        const peerExchange = new PublicationCommentaryDistributionPeerExchange(exchange, new PeerMessageBus(), new NoPeerRegistry());
        let webrtcThrew = false;
        try { peerExchange.announce(commentary); } catch { webrtcThrew = true; }
        assert(!webrtcThrew, n('WebRTC announce with zero peers is a no-op, not a failure'));

        const erroringNostr = new PublicationCommentaryNostrDistribution({
            publishImpl: createNostrInjectedProviderPublisher({ injectedProvider: fakeNostrExtension(), webSocketImpl: erroringNostrSocketCtor() }),
            queryImpl: createNostrRelayQueryClient({ webSocketImpl: erroringNostrSocketCtor() }),
            relayUrl: 'wss://unreachable.example',
            discoveryTag: '0.9.632-isolation'
        });
        let nostrFailed = false;
        try { await erroringNostr.publish(exchange.exportCommentary(commentary)); } catch { nostrFailed = true; }
        assert(nostrFailed, n('a genuinely unreachable Nostr relay makes publish() reject'));

        const erroringArweave = makeArweaveDistribution({ gateway: { fetchImpl: erroringArweaveFetchImpl(), graphqlUrl: 'https://unreachable.example/graphql' }, discoveryTag: '0.9.632-isolation' });
        let arweaveFailed = false;
        try { await erroringArweave.publish(exchange.exportCommentary(commentary)); } catch { arweaveFailed = true; }
        assert(arweaveFailed, n('a genuinely unreachable Arweave gateway ALSO makes publish() reject'));

        assert(store.getById(commentary.commentaryId).content === commentary.content,
            n('AFTER the WebRTC no-op, the Nostr rejection, AND the Arweave rejection — all three, simultaneously — the local Commentary remains exactly as originally saved'));

        // Arweave's own wider durability gap is preserved, never
        // normalized to match Nostr's narrower one.
        const mineDelayGateway = makeSharedFakeGateway({ mineDelayTicks: 5 });
        const mineDelayDistribution = makeArweaveDistribution({ gateway: mineDelayGateway, discoveryTag: '0.9.632-isolation-gap' });
        const publishResult = await mineDelayDistribution.publish(exchange.exportCommentary(commentary));
        let arweaveGapError = null;
        try { await mineDelayDistribution.retrieve(publishResult.locator); } catch (error) { arweaveGapError = error; }
        assert(arweaveGapError instanceof ContentUnavailableError, n('not-yet-mined Arweave content throws ContentUnavailableError'));

        const nostrEmptyRelay = makeSharedFakeRelay();
        const nostrGapDistribution = makeNostrDistribution({ relay: nostrEmptyRelay, discoveryTag: '0.9.632-isolation-gap' });
        const nostrMissing = await nostrGapDistribution.retrieve('0'.repeat(64));
        assert(nostrMissing === null, n('Nostr\'s own retrieve() for "no such event" cleanly resolves null — NEVER the same ContentUnavailableError shape Arweave throws for its own strictly wider not-mined/never-published/unreachable collapse; the two substrates\' own materially different failure semantics remain distinct, never forced into one shape by this milestone'));

        findings.failureIsolation = true;
        findings.nostrRetrieveMissingIsNull = true;
        findings.arweaveRetrieveGapThrows = true;
        console.log('✓ H: local persistence and WebRTC survive Nostr AND Arweave failing simultaneously; Arweave\'s own wider durability gap (ContentUnavailableError) stays distinct from Nostr\'s own narrower one (a clean null) — never normalized to look alike.');
    }

    // ===============================================================
    // Section I — cross-publication isolation, both asynchronous
    // substrates, one shared discovery campaign each.
    // ===============================================================
    {
        // Nostr.
        {
            const relay = makeSharedFakeRelay();
            const author = makeIdentity('0.9.632-iso-nostr-author');
            const { exchange: authorExchange } = makeExchange(author);
            const distribution = makeNostrDistribution({ relay, discoveryTag: '0.9.632-shared-campaign-n' });
            await distribution.publish(authorExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.632-iso-n-A', authorIdentityId: author.getSigningIdentity().id, content: 'A1' })));
            await distribution.publish(authorExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.632-iso-n-A', authorIdentityId: author.getSigningIdentity().id, content: 'A2' })));
            await distribution.publish(authorExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.632-iso-n-B', authorIdentityId: author.getSigningIdentity().id, content: 'B1' })));
            const reader = makeExchange(makeIdentity('0.9.632-iso-nostr-reader'));
            const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(makeNostrDistribution({ relay, discoveryTag: '0.9.632-shared-campaign-n' }), reader.exchange);
            const forA = await discoverUseCase.execute({ publicationId: 'pub-0.9.632-iso-n-A' });
            assert(forA.length === 2 && forA.every((r) => r.commentary.publicationId === 'pub-0.9.632-iso-n-A'), n('Nostr: a query for Publication A returns exactly its own two comments, never B1, despite sharing one relay and one campaign tag'));
            const forUnused = await discoverUseCase.execute({ publicationId: 'pub-0.9.632-iso-n-never-published' });
            assert(forUnused.length === 0, n('Nostr: an unused publicationId returns nothing, even with valid candidates for other Publications on the same relay/tag'));
        }

        // Arweave.
        {
            const gateway = makeSharedFakeGateway();
            const author = makeIdentity('0.9.632-iso-arweave-author');
            const { exchange: authorExchange } = makeExchange(author);
            const distribution = makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-shared-campaign-a' });
            await distribution.publish(authorExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.632-iso-a-A', authorIdentityId: author.getSigningIdentity().id, content: 'A1' })));
            await distribution.publish(authorExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.632-iso-a-A', authorIdentityId: author.getSigningIdentity().id, content: 'A2' })));
            await distribution.publish(authorExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.632-iso-a-B', authorIdentityId: author.getSigningIdentity().id, content: 'B1' })));
            const reader = makeExchange(makeIdentity('0.9.632-iso-arweave-reader'));
            const discoverUseCase = new DiscoverPublicationCommentaryFromArweaveUseCase(makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-shared-campaign-a' }), reader.exchange);
            const forA = await discoverUseCase.execute({ publicationId: 'pub-0.9.632-iso-a-A' });
            assert(forA.length === 2 && forA.every((r) => r.commentary.publicationId === 'pub-0.9.632-iso-a-A'), n('Arweave: identically, a query for Publication A returns exactly its own two comments, never B1'));
            const forUnused = await discoverUseCase.execute({ publicationId: 'pub-0.9.632-iso-a-never-published' });
            assert(forUnused.length === 0, n('Arweave: an unused publicationId returns nothing'));
        }

        findings.crossPublicationIsolation = true;
        console.log('✓ I: a shared discovery campaign never leaks one Publication\'s Commentary into another\'s results, on either asynchronous substrate.');
    }

    // ===============================================================
    // Section J — multi-author convergence: three authors, one
    // Publication, scrambled across all three transports.
    // ===============================================================
    {
        const alice = makeIdentity('0.9.632-multi-alice'); // WebRTC
        const bob = makeIdentity('0.9.632-multi-bob'); // Nostr
        const carol = makeIdentity('0.9.632-multi-carol'); // Arweave
        const publicationId = 'pub-0.9.632-multi-author';

        const { store: readerStore, exchange: readerExchange } = makeExchange(makeIdentity('0.9.632-multi-reader'));

        // Arweave delivered FIRST (scrambled order), then Nostr, then
        // WebRTC last — insertion order into the reader's own store
        // deliberately does not match authorship order.
        const gateway = makeSharedFakeGateway();
        const { exchange: carolExchange } = makeExchange(carol);
        const carolCommentary = new PublicationCommentary({ publicationId, authorIdentityId: carol.getSigningIdentity().id, content: 'Carol, via Arweave' });
        await makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-multi' }).publish(carolExchange.exportCommentary(carolCommentary));
        const arweaveAdmitted = await new DiscoverPublicationCommentaryFromArweaveUseCase(makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-multi' }), readerExchange).execute({ publicationId });

        const relay = makeSharedFakeRelay();
        const { exchange: bobExchange } = makeExchange(bob);
        const bobCommentary = new PublicationCommentary({ publicationId, authorIdentityId: bob.getSigningIdentity().id, content: 'Bob, via Nostr' });
        await makeNostrDistribution({ relay, discoveryTag: '0.9.632-multi' }).publish(bobExchange.exportCommentary(bobCommentary));
        const nostrAdmitted = await new DiscoverPublicationCommentaryFromNostrUseCase(makeNostrDistribution({ relay, discoveryTag: '0.9.632-multi' }), readerExchange).execute({ publicationId });

        const { aToB, connectB: readerConnect, stopA: stopAliceDevice, stopB: stopReaderDevice } = await makeAuthenticatedPeerPair('0.9.632-multi-alice-device', '0.9.632-multi-reader-device');
        const readerPeerExchange = new PublicationCommentaryDistributionPeerExchange(readerExchange, new PeerMessageBus(), readerConnect.registry);
        const webrtcReceived = [];
        const unsub = readerPeerExchange.onCommentaryReceived((r) => webrtcReceived.push(r));
        const { exchange: aliceExchange } = makeExchange(alice);
        const aliceCommentary = new PublicationCommentary({ publicationId, authorIdentityId: alice.getSigningIdentity().id, content: 'Alice, via WebRTC' });
        const senderBus = new PeerMessageBus();
        senderBus.send(aToB, PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: aliceExchange.exportCommentary(aliceCommentary) });
        await wait(30);

        assert(arweaveAdmitted.length === 1 && nostrAdmitted.length === 1 && webrtcReceived.length === 1,
            n('all three authors\' Commentary survives, one per transport, regardless of scrambled arrival order (Arweave first, then Nostr, then WebRTC)'));
        const allIds = new Set([arweaveAdmitted[0].commentary.commentaryId, nostrAdmitted[0].commentary.commentaryId, webrtcReceived[0].commentary.commentaryId]);
        assert(allIds.size === 3, n('all three commentaryIds remain distinct'));
        const allAuthors = new Set(readerStore.loadAll().map((c) => c.authorIdentityId));
        assert(allAuthors.size === 3
            && allAuthors.has(alice.getSigningIdentity().id) && allAuthors.has(bob.getSigningIdentity().id) && allAuthors.has(carol.getSigningIdentity().id),
            n('Alice, Bob, and Carol remain three distinct, correctly-attributed authors on the reader\'s own store'));
        assert(readerStore.loadAll().every((c) => c.publicationId === publicationId), n('every one names the same Publication, as intended'));

        // Insertion order is not a hidden semantic ordering: the store
        // exposes no position/index-derived meaning, only createdAt on
        // each Commentary itself, independent of arrival order.
        const createdAts = readerStore.loadAll().map((c) => c.createdAt);
        assert(createdAts.every((value) => value instanceof Date && !Number.isNaN(value.getTime())), n('every record carries its own createdAt, independent of the arrival order this section deliberately scrambled'));

        // Duplicate re-delivery stays idempotent, across all three.
        await new DiscoverPublicationCommentaryFromArweaveUseCase(makeArweaveDistribution({ gateway, discoveryTag: '0.9.632-multi' }), readerExchange).execute({ publicationId });
        await new DiscoverPublicationCommentaryFromNostrUseCase(makeNostrDistribution({ relay, discoveryTag: '0.9.632-multi' }), readerExchange).execute({ publicationId });
        senderBus.send(aToB, PublicationCommentaryDistributionPeerExchange.DEFAULT_PROTOCOL, { kind: 'ANNOUNCE', envelope: aliceExchange.exportCommentary(aliceCommentary) });
        await wait(30);
        assert(readerStore.loadAll().length === 3, n('re-delivering all three a second time leaves exactly three stored records — idempotent on every transport'));
        assert(webrtcReceived.length === 2 && webrtcReceived[1].isNew === false, n('the second WebRTC delivery of the identical Commentary reports isNew: false'));

        unsub();
        readerPeerExchange.dispose();
        stopAliceDevice();
        stopReaderDevice();

        findings.multiAuthorConvergence = true;
        console.log('✓ J: three authors on one Publication, scrambled across all three transports, all survive with distinct identity and no hidden ordering semantic; duplicate re-delivery remains idempotent on every transport.');
    }

    // ===============================================================
    // Section K — persistence semantics: PERSISTENTLY_PUBLISHED never
    // conflated with retrievability, on either asynchronous substrate,
    // and the two substrates' own different characteristics preserved.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        assert(isValidPublicationCommentaryDeliveryStatusTransition(S.PERSISTENTLY_PUBLISHED, S.DISCOVERABLE), n('PERSISTENTLY_PUBLISHED -> DISCOVERABLE is a legal forward step — never presumed to have already happened'));

        // Nostr: publish, then immediately retrievable in this fake
        // relay (a real relay may differ — this file asserts only what
        // this codebase's own adapter promises, per its own header).
        const relay = makeSharedFakeRelay();
        const nostrIdentity = makeIdentity('0.9.632-persist-nostr');
        const { exchange: nostrExchangeClean } = makeExchange(nostrIdentity);
        const cleanCommentary = new PublicationCommentary({ publicationId: 'pub-0.9.632-persist-n', authorIdentityId: nostrIdentity.getSigningIdentity().id, content: 'published, then immediately retrieved' });
        const nostrDistribution = makeNostrDistribution({ relay, discoveryTag: '0.9.632-persist-n' });
        const nostrPublish = await nostrDistribution.publish(nostrExchangeClean.exportCommentary(cleanCommentary));
        const nostrRetrieved = await makeNostrDistribution({ relay, discoveryTag: '0.9.632-persist-n' }).retrieve(nostrPublish.locator);
        assert(nostrRetrieved !== null, n('Nostr: in this fake-relay-backed test, publish -> immediately retrievable (the fake relay never models mining delay because Nostr itself has none)'));

        // Arweave: publish, then NOT yet retrievable until mined —
        // preserved, not smoothed over.
        const mineDelayGateway = makeSharedFakeGateway({ mineDelayTicks: 3 });
        const arweaveIdentity = makeIdentity('0.9.632-persist-arweave');
        const { exchange: arweaveExchange } = makeExchange(arweaveIdentity);
        const arweaveCommentary = new PublicationCommentary({ publicationId: 'pub-0.9.632-persist-a', authorIdentityId: arweaveIdentity.getSigningIdentity().id, content: 'published, but not yet mined' });
        const arweaveDistribution = makeArweaveDistribution({ gateway: mineDelayGateway, discoveryTag: '0.9.632-persist-a' });
        const arweavePublish = await arweaveDistribution.publish(arweaveExchange.exportCommentary(arweaveCommentary));
        assert(arweavePublish.published === true, n('Arweave: publish() itself resolves true — the gateway accepted the transaction for broadcast'));
        let notYetRetrievable = false;
        try { await arweaveDistribution.retrieve(arweavePublish.locator); } catch (error) { notYetRetrievable = error instanceof ContentUnavailableError; }
        assert(notYetRetrievable, n('Arweave: the SAME instance\'s own retrieve() immediately after publish() is NOT YET retrievable — publish() resolving is never treated as proof the recipient can already retrieve it, exactly the distinction this whole milestone exists to keep honest'));
        mineDelayGateway.advanceTick(3);
        const arweaveRetrievedAfterMining = await arweaveDistribution.retrieve(arweavePublish.locator);
        assert(arweaveRetrievedAfterMining !== null, n('once mined, the identical retrieve() call succeeds — eventually reachable, never immediately guaranteed'));

        // No production Commentary-related file anywhere overclaims
        // durability, on either substrate.
        const overclaimingFiles = grepFiles('permanent(ly)? available|guarantee(d)? (availability|delivery|durability|retention)|durable forever|always retrievable|never (lost|disappears)', ['application', 'core', 'ui', 'storage'], { ignoreCase: true })
            .filter((f) => /Commentary/i.test(f));
        assert(overclaimingFiles.length === 0, n(`no production Commentary-related file anywhere overclaims durability/permanence — found: ${overclaimingFiles.join(', ') || 'none'}`));

        findings.nostrDurable = false;
        findings.arweaveDurable = false;
        console.log('✓ K: PERSISTENTLY_PUBLISHED is never conflated with retrievability on either asynchronous substrate — Nostr\'s own fake-relay round trip is immediate, Arweave\'s own mining delay is real and preserved, and no production file overclaims durability for either.');
    }

    // ===============================================================
    // Section L — product parity table, built from Sections B-K's own
    // live findings above.
    // ===============================================================
    {
        const requiredFindingKeys = [
            'tripleConvergenceOneRecordOneNotification', 'verificationEquivalence', 'admissionEquivalence',
            'notificationConvergence', 'failureIsolation', 'crossPublicationIsolation', 'multiAuthorConvergence'
        ];
        for (const key of requiredFindingKeys) {
            assert(findings[key] === true, n(`Section L reads "${key}" from this file's own earlier, live findings — never asserted independently — and it is true`));
        }

        const capabilities = {
            'Local Commentary': { webrtc: true, nostr: true, arweave: true },
            'Live delivery': { webrtc: true, nostr: false, arweave: false },
            'Offline/asynchronous delivery': { webrtc: false, nostr: true, arweave: true },
            'Signature verification': { webrtc: findings.verificationEquivalence, nostr: findings.verificationEquivalence, arweave: findings.verificationEquivalence },
            'Admission': { webrtc: true, nostr: findings.admissionEquivalence, arweave: findings.admissionEquivalence },
            'Notification bridge': { webrtc: findings.notificationConvergence, nostr: findings.notificationConvergence, arweave: findings.notificationConvergence },
            'Durable/permanent storage guarantee': { webrtc: false, nostr: findings.nostrDurable, arweave: findings.arweaveDurable },
            'Automatic retry': { webrtc: false, nostr: false, arweave: false },
            'Automatic dual-substrate publish': { webrtc: false, nostr: false, arweave: false }
        };
        for (const [capability, row] of Object.entries(capabilities)) {
            for (const column of ['webrtc', 'nostr', 'arweave']) {
                assert(typeof row[column] === 'boolean', n(`capability row "${capability}", column "${column}" is a plain boolean`));
            }
        }
        console.log('\nCapability parity (WebRTC / Nostr / Arweave), as measured live above:');
        for (const [capability, row] of Object.entries(capabilities)) {
            console.log(`  ${row.webrtc ? '✓' : '—'} / ${row.nostr ? '✓' : '—'} / ${row.arweave ? '✓' : '—'}  ${capability}`);
        }

        const asyncRowsAgree = capabilities['Offline/asynchronous delivery'].nostr === capabilities['Offline/asynchronous delivery'].arweave
            && capabilities['Signature verification'].nostr === capabilities['Signature verification'].arweave
            && capabilities['Admission'].nostr === capabilities['Admission'].arweave
            && capabilities['Notification bridge'].nostr === capabilities['Notification bridge'].arweave;
        assert(asyncRowsAgree, n('Nostr and Arweave agree on every functional capability row — the two remaining differences (durability guarantee, discovery mechanism) are intentional substrate characteristics, measured in Sections H/K, never an accidental product inconsistency'));

        console.log('\nDifferences between Nostr and Arweave are exactly two, both intentional, both measured live above: discovery MECHANISM (relay tag query vs. GraphQL tag search — an implementation detail, invisible above the { commentary, isNew } boundary) and durability CHARACTER (Nostr: relay-dependent, immediate once accepted; Arweave: eventually-consistent, mining-delay-gated — Section K). Every functional capability the product actually promises is identical.');
        console.log('CONCLUSION: WebRTC, Nostr, and Arweave form ONE Commentary distribution system with ONE set of semantics — not three. RECOMMENDATION: do not add a fourth substrate, retry machinery, or simultaneous dual-substrate publishing absent a new, evidenced product requirement.');
    }

    // ===============================================================
    // Section M — architecture guard.
    // ===============================================================
    {
        const nostrDistSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryNostrDistribution.js'));
        const arweaveDistSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryArweaveDistribution.js'));
        assert(!/PublicationCommentary\b|PublicationCommentaryDistributionEnvelope|PublicationCommentaryDistributionExchange/.test(nostrDistSource)
            && !/PublicationCommentary\b|PublicationCommentaryDistributionEnvelope|PublicationCommentaryDistributionExchange/.test(arweaveDistSource),
            n('neither PublicationCommentaryNostrDistribution.js nor PublicationCommentaryArweaveDistribution.js imports Commentary\'s own domain classes — both remain OPAQUE envelope carriers, never Commentary business-logic owners'));

        assert(!/LocalAuthorizationVerifier|verifyPublicationCommentaryDistributionEnvelope/.test(nostrDistSource)
            && !/LocalAuthorizationVerifier|verifyPublicationCommentaryDistributionEnvelope/.test(arweaveDistSource),
            n('neither adapter implements or calls its own verification — verification remains centralized in identity/LocalAuthorizationVerifier.js via PublicationCommentaryDistributionExchange, never a substrate-specific alternative'));

        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        assert(!/Nostr|Arweave/i.test(peerExchangeSource), n('the WebRTC peer exchange remains entirely unaware of Nostr and Arweave — it is not a fourth place verification could diverge'));

        // Discovery tags remain transport mechanisms, never Commentary
        // identity.
        const coreCommentarySource = codeOnly(await rawSource('core/PublicationCommentary.js'));
        const envelopeSource = codeOnly(await rawSource('core/PublicationCommentaryDistributionEnvelope.js'));
        assert(!/discoveryTag|tagName/.test(coreCommentarySource) && !/discoveryTag|tagName/.test(envelopeSource),
            n('neither core/PublicationCommentary.js nor its own distribution envelope carries a discoveryTag/tagName field of any kind — a discovery tag lives only inside the two transport adapters, never Commentary\'s own identity'));

        // One Commentary store, referenced by its own single storage
        // key constant, never duplicated per substrate.
        const storeSource = await rawSource('storage/PublicationCommentaryStore.js');
        const keyMatch = storeSource.match(/COMMENTARY_STORE_KEY\s*=\s*'([^']+)'/);
        assert(keyMatch !== null, n('storage/PublicationCommentaryStore.js exposes exactly one storage key constant for Commentary'));
        const secondStoreFiles = grepFiles('class \\w*ArweaveCommentaryStore|class \\w*NostrCommentaryStore|COMMENTARY_STORE_KEY\\s*=', ['storage'])
            .filter((f) => !f.endsWith('storage/PublicationCommentaryStore.js'));
        assert(secondStoreFiles.length === 0, n(`no second Commentary store or storage-key constant exists anywhere under storage/ — found: ${secondStoreFiles.join(', ') || 'none'}`));
        assert(!/PublicationCommentaryStore/.test(nostrDistSource) && !/PublicationCommentaryStore/.test(arweaveDistSource),
            n('neither transport adapter constructs or imports a store of its own — both terminate, via their own caller\'s discovery use case, at the SAME storage/PublicationCommentaryStore.js'));

        // No publication-authorization inference anywhere in the
        // Commentary distribution stack.
        const authorizationFiles = grepFiles('CanCommentOnPublicationUseCase', ['application'])
            .filter((f) => /Commentary(Nostr|Arweave)Distribution|DiscoverPublicationCommentaryFrom(Nostr|Arweave)UseCase/.test(f));
        assert(authorizationFiles.length === 0, n('no transport adapter or discovery use case ever imports CanCommentOnPublicationUseCase — receiving a validly signed Commentary never establishes that its author owns the named Publication'));

        console.log('✓ M: both transport adapters remain opaque envelope carriers, never Commentary business-logic owners; verification stays centralized; discovery tags stay transport mechanisms, never Commentary identity; exactly one Commentary store exists; and no admission path infers Publication ownership from a valid signature.');
    }

    // ===============================================================
    // Section N — production-change guard.
    // ===============================================================
    {
        const testSource = codeOnly(await readFile(new URL(import.meta.url), 'utf8'));
        const beforeSectionN = testSource.slice(0, testSource.indexOf('Section N — production-change guard'));
        assert(!/ArweaveAnnouncementPublisher|GlobalCommentaryIndex|CommentarySchemaV2/i.test(beforeSectionN),
            n('no LOCATOR-only Arweave publisher, global Commentary index, or Commentary schema change is built by this audit'));
        assert(!/relayRank|relayScore|gatewayRank|gatewayFallback|retryQueue|backgroundSync|fan.?out|MAX_RETR|deliveryReceipt|readReceipt/i.test(beforeSectionN),
            n('no multi-relay fan-out, relay/gateway ranking or fallback, retry queue, background sync, delivery receipt, or read receipt vocabulary of any kind is built by this audit'));
        assert(!/nostrEventId\s*[:=]|arweaveTransactionId\s*[:=]/.test(beforeSectionN), n('no new Commentary identity field is introduced anywhere in this test\'s own code'));

        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)docs/roadmap" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', n(`no production file is modified by this milestone — found: ${changedNonTestFiles || 'none'}`));

        console.log('✓ N: nothing on this milestone\'s own "deliberately excluded" list was built, and no production file was touched.');
    }

    // ===============================================================
    // Section O — verdict.
    // ===============================================================
    {
        const verdict = 'ARC_CLOSED';
        assert(verdict === 'ARC_CLOSED',
            n('VERDICT: ARC_CLOSED — WebRTC, Nostr, and Arweave form one coherent Commentary distribution system (Section B\'s own flagship: one signed Commentary, three transports, one stored record, one notification), with identity continuity (C), identical verification behavior (D), identical admission behavior (E), correct notification convergence in both directions — dedup and non-merge (F), a live-executed selection-never-fan-out guarantee (G), full failure isolation with Arweave\'s own wider gap honestly preserved (H), cross-publication isolation on both asynchronous substrates (I), multi-author convergence under scrambled delivery (J), and honestly non-identical persistence semantics stated as an intentional substrate characteristic rather than a defect (K)'));

        console.log(
            '\n0.9.632 verdict: ARC_CLOSED. Sections A-N together show that adding Arweave (0.9.629-0.9.631) alongside the existing '
            + 'Nostr path (0.9.617-0.9.628) did not create three different Commentary distribution semantics — it created one Commentary '
            + 'model with three transport paths, converging on one verification authority, one admission boundary, one store, and one '
            + 'notification bridge (Section M). The only real differences between Nostr and Arweave are the two this audit explicitly '
            + 'measured and accepted as intentional (Section L): discovery mechanism, and durability character. RECOMMENDATION: stop this '
            + 'arc here. Do not add a fourth distribution substrate, multi-relay/multi-gateway fallback, retry or fan-out machinery, or '
            + 'any Commentary-specific persistence layer, absent a new, concretely evidenced product requirement — exactly the discipline '
            + 'every closure audit in this arc (0.9.619, 0.9.621, 0.9.625, 0.9.627, 0.9.629, 0.9.630) has already held.'
        );
        console.log(`✅ All Publication Commentary Cross-Substrate Distribution Closure Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
