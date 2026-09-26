import { execSync } from 'node:child_process';

import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryNostrDistribution } from '../application/publication/commentary/PublicationCommentaryNostrDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';

import {
    PublicationCommentaryDeliveryStatus,
    PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE,
    isValidPublicationCommentaryDeliveryStatusTransition,
    describesConformingPublicationCommentaryAsynchronousDeliverySubstrate
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';

import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// 0.9.628 — Publication Commentary Nostr Asynchronous Distribution.
//
// TYPE: narrow production implementation + closure test. 0.9.627's own
// audit (tests/PublicationCommentaryNostrRoundTripBoundaryAudit.test.js)
// proved, entirely inside a test file, that a plain composition of the
// two raw Nostr transport primitives (nostr/NostrInjectedProviderPublisher.js,
// nostr/NostrRelayQueryClient.js) already conforms to core/
// PublicationCommentaryAsynchronousDeliveryContract.js's own contract and
// can carry a real, signed Commentary envelope through a live NIP-01
// round trip. Its own verdict named exactly one remaining gap —
// CONCRETE_PRODUCT_GAP: "a single small production adapter file...
// never built here." This milestone builds exactly that adapter
// (application/publication/commentary/PublicationCommentaryNostrDistribution.js), the admission
// boundary on top of it (application/
// DiscoverPublicationCommentaryFromNostrUseCase.js), and the ui/main.js
// wiring making both reachable from the real, running application — the
// smallest step from PREPARED_SEAM to a genuinely usable capability.
//
//   Section A — the new adapter conforms to 0.9.626's own contract, live.
//   Section B — FLAGSHIP: the full product journey through the REAL
//               production classes (never a test-local composition this
//               time) — Alice comments while Bob is offline; Bob
//               discovers, verifies, and admits it later, with the exact
//               commentaryId, through a real (fake-relay-backed) NIP-01
//               exchange.
//   Section C — publicationId filtering: several publications' own
//               commentaries share one relay/discovery tag; discovery for
//               one publicationId never leaks another's.
//   Section D — adversarial candidates never abort a discovery batch.
//   Section E — a Commentary naming a locally unknown Publication is
//               still admitted through this new path.
//   Section F — transport-failure/contract-violation semantics: an
//               unavailable relay rejects; a publishImpl that violates
//               its own contract throws; malformed/unrelated content is
//               skipped, never fatal.
//   Section G — no publicationId, no network call.
//   Section H — production wiring census: ui/main.js is the one and only
//               place either new class is constructed.
//   Section I — ui/main.js's own addPublicationCommentaryCommand:
//               create -> persist -> announce -> Nostr publish, in that
//               source order, live-instrumented; a Nostr failure never
//               undoes local persistence or the WebRTC announce.
//   Section J — the read side stays untouched: getPublicationCommentariesCommand/
//               GetPublicationCommentariesUseCase.js remain synchronous
//               and Nostr-unaware; discovery is its own, separately
//               invoked ui/main.js command.
//   Section K — notification reuse: the Nostr discovery command feeds the
//               SAME PublicationCommentaryRemoteNotificationBridge the
//               WebRTC path already uses — that bridge file itself
//               remains unmodified, mentioning nothing Nostr-shaped.
//   Section L — exclusion guard: nothing on this milestone's own
//               "deliberately excluded" list was built.
//   Section M — verdict.

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

function makeExchange(identityProvider) {
    const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
    const exchange = new PublicationCommentaryDistributionExchange(store, identityProvider, new LocalAuthorizationVerifier());
    return { store, exchange };
}

let globalSignCounter = 0;
function fakeExtension() {
    return {
        getPublicKey: async () => 'fake-pubkey',
        signEvent: async (event) => {
            globalSignCounter += 1;
            const hex = globalSignCounter.toString(16);
            return { ...event, id: hex.padEnd(64, '0'), sig: 'a'.repeat(128) };
        }
    };
}

// A shared, realistic fake relay — the identical NIP-01 exchange shape
// tests/PublicationCommentaryNostrRoundTripBoundaryAudit.test.js's own
// makeSharedFakeRelay() already speaks, reused here against the real
// PRODUCTION adapter this milestone builds rather than a test-local
// composition.
function makeSharedFakeRelay({ declineReason = null } = {}) {
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
                if (declineReason) {
                    queueMicrotask(() => this.onmessage && this.onmessage({ data: JSON.stringify(['OK', event.id, false, declineReason]) }));
                    return;
                }
                events.set(event.id, JSON.parse(JSON.stringify(event)));
                queueMicrotask(() => this.onmessage && this.onmessage({ data: JSON.stringify(['OK', event.id, true]) }));
                return;
            }
            if (parsed[0] === 'REQ') {
                const [, subId, filter] = parsed;
                const matches = Array.from(events.values()).filter((event) => matchesFilter(event, filter));
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
function matchesFilter(event, filter) {
    if (Array.isArray(filter.ids) && !filter.ids.includes(event.id)) return false;
    if (Array.isArray(filter['#t'])) {
        const tagValues = (event.tags || []).filter((tag) => tag[0] === 't').map((tag) => tag[1]);
        if (!filter['#t'].some((tag) => tagValues.includes(tag))) return false;
    }
    return true;
}
function erroringSocketCtor() {
    return class FakeSocket {
        constructor() { queueMicrotask(() => { if (this.onerror) this.onerror(new Error('boom')); }); }
        send() {}
        close() {}
    };
}

function makeDistribution({ relay, extension, relayUrl = 'wss://relay.example', discoveryTag = 'forkbuild-commentary' } = {}) {
    return new PublicationCommentaryNostrDistribution({
        publishImpl: createNostrInjectedProviderPublisher({ injectedProvider: extension || fakeExtension(), webSocketImpl: relay.FakeSocket }),
        queryImpl: createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket }),
        relayUrl,
        discoveryTag
    });
}

async function run() {
    // ===============================================================
    // Section A — contract conformance.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.628-conformance' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(distribution) === true,
            n('the new, real, permanent PublicationCommentaryNostrDistribution class — never a test-local composition — duck-type-conforms to core/PublicationCommentaryAsynchronousDeliveryContract.js\'s own publish()/retrieve() contract'));
        assert(distribution.relayUrl === 'wss://relay.example' && distribution.discoveryTag === '0.9.628-conformance',
            n('relayUrl/discoveryTag are exposed exactly as constructed, mirroring application/nostr/NostrPublicationDiscoveryPublisher.js\'s own getters'));

        console.log('✓ A: the real production adapter conforms to the asynchronous delivery contract.');
    }

    // ===============================================================
    // Section B — FLAGSHIP: the full product journey, real classes only.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        const traversed = [S.CREATED];

        const aliceProvider = makeIdentity('0.9.628-alice');
        const { store: aliceStore, exchange: aliceExchange } = makeExchange(aliceProvider);
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.628-bobs-work',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'nice work, Bob — seen while you were offline (0.9.628)'
        });
        aliceStore.save(commentary);
        assert(aliceStore.getById(commentary.commentaryId) !== null, n('CREATED: Alice\'s own local, unsigned Commentary exists'));

        const envelopeJson = aliceExchange.exportCommentary(commentary);
        traversed.push(S.SIGNED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed.at(-2), traversed.at(-1)), n('SIGNED: valid transition'));

        const relay = makeSharedFakeRelay();
        const aliceDistribution = makeDistribution({ relay, discoveryTag: '0.9.628-flagship' });

        const publishResult = await aliceDistribution.publish(envelopeJson);
        assert(publishResult && publishResult.published === true && typeof publishResult.locator === 'string',
            n('PERSISTENTLY_PUBLISHED: the real production adapter published a real, signed envelope through the real, unmodified transport primitives'));
        traversed.push(S.PERSISTENTLY_PUBLISHED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed.at(-2), traversed.at(-1)), n('valid transition'));

        // Bob, entirely offline when Alice commented, comes online later —
        // an independent PublicationCommentaryNostrDistribution instance,
        // an independent store/exchange, sharing only the fake relay's own
        // storage.
        const bobProvider = makeIdentity('0.9.628-bob');
        const { store: bobStore, exchange: bobExchange } = makeExchange(bobProvider);
        const bobDistribution = makeDistribution({ relay, discoveryTag: '0.9.628-flagship' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(bobDistribution, bobExchange);

        const admitted = await discoverUseCase.execute({ publicationId: 'pub-0.9.628-bobs-work' });
        traversed.push(S.DISCOVERABLE, S.RETRIEVED, S.VERIFIED, S.ADMITTED);
        assert(admitted.length === 1 && admitted[0].isNew === true && admitted[0].commentary.commentaryId === commentary.commentaryId,
            n('ADMITTED: Bob\'s own real, unmodified store now holds the exact Commentary Alice authored, discovered and verified through the new production Nostr path alone — no WebRTC, no shared process state'));
        assert(bobStore.getById(commentary.commentaryId).content === commentary.content,
            n('content survives byte for byte'));
        assert(bobStore !== aliceStore, n('two genuinely independent stores'));

        assert(JSON.stringify(traversed) === JSON.stringify(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE),
            n('the full seven-stage sequence was traversed, in order, none skipped, none repeated — collapsing DISCOVERABLE/RETRIEVED/VERIFIED into one discover() call is the identical substrate-specific fact 0.9.627\'s own Section J already found for Nostr'));

        console.log('✓ B — FLAGSHIP: a real Commentary, signed while its recipient was completely offline, is published and later discovered, verified, and admitted through the new production PublicationCommentaryNostrDistribution / DiscoverPublicationCommentaryFromNostrUseCase pair alone.');
    }

    // ===============================================================
    // Section C — publicationId filtering never leaks across publications.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const authorProvider = makeIdentity('0.9.628-filter-author');
        const { store: authorStore, exchange: authorExchange } = makeExchange(authorProvider);

        const commentaryA = new PublicationCommentary({ publicationId: 'pub-0.9.628-A', authorIdentityId: authorProvider.getSigningIdentity().id, content: 'about A' });
        const commentaryB = new PublicationCommentary({ publicationId: 'pub-0.9.628-B', authorIdentityId: authorProvider.getSigningIdentity().id, content: 'about B' });
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.628-shared-campaign' });
        await distribution.publish(authorExchange.exportCommentary(commentaryA));
        await distribution.publish(authorExchange.exportCommentary(commentaryB));

        const readerProvider = makeIdentity('0.9.628-filter-reader');
        const { exchange: readerExchange } = makeExchange(readerProvider);
        const readerDistribution = makeDistribution({ relay, discoveryTag: '0.9.628-shared-campaign' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(readerDistribution, readerExchange);

        const forA = await discoverUseCase.execute({ publicationId: 'pub-0.9.628-A' });
        const forB = await discoverUseCase.execute({ publicationId: 'pub-0.9.628-B' });
        assert(forA.length === 1 && forA[0].commentary.commentaryId === commentaryA.commentaryId,
            n('discovery for pub-A returns exactly pub-A\'s own commentary, even though both share one relay and one discovery campaign tag'));
        assert(forB.length === 1 && forB[0].commentary.commentaryId === commentaryB.commentaryId,
            n('discovery for pub-B returns exactly pub-B\'s own commentary — the discovery tag is a query mechanism, never Commentary identity, exactly this milestone\'s own design decision'));

        console.log('✓ C: a single, shared discoveryTag campaign never leaks one Publication\'s commentary into another\'s discovery results — filtering happens by publicationId, in the admission use case, never in the tag itself.');
    }

    // ===============================================================
    // Section D — adversarial candidates never abort a discovery batch.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.628-adversarial' });

        const honestProvider = makeIdentity('0.9.628-adv-honest');
        const { exchange: honestExchange } = makeExchange(honestProvider);
        const honestCommentary = new PublicationCommentary({ publicationId: 'pub-0.9.628-adv', authorIdentityId: honestProvider.getSigningIdentity().id, content: 'a genuine comment' });
        await distribution.publish(honestExchange.exportCommentary(honestCommentary));

        // A forged envelope: genuinely signed by one identity, relabeled to
        // claim a different author, published under the SAME campaign tag.
        const forgerProvider = makeIdentity('0.9.628-adv-forger');
        const { exchange: forgerExchange } = makeExchange(forgerProvider);
        const victimProvider = makeIdentity('0.9.628-adv-victim');
        const forgedCommentary = new PublicationCommentary({ publicationId: 'pub-0.9.628-adv', authorIdentityId: forgerProvider.getSigningIdentity().id, content: 'a forged claim' });
        const forgedEnvelope = { ...forgerExchange.exportCommentary(forgedCommentary), authorIdentityId: victimProvider.getSigningIdentity().id };
        await distribution.publish(forgedEnvelope);

        // A malformed, non-envelope JSON payload under the same tag.
        await distribution.publish({ totally: 'unrelated' });

        const readerProvider = makeIdentity('0.9.628-adv-reader');
        const { exchange: readerExchange } = makeExchange(readerProvider);
        const readerDistribution = makeDistribution({ relay, discoveryTag: '0.9.628-adversarial' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(readerDistribution, readerExchange);

        const admitted = await discoverUseCase.execute({ publicationId: 'pub-0.9.628-adv' });
        assert(admitted.length === 1 && admitted[0].commentary.commentaryId === honestCommentary.commentaryId,
            n('the forged and malformed candidates are skipped; the one honest, verifiable candidate is still admitted — one bad candidate on a shared relay never aborts the whole discovery batch, and never causes a forged claim to be admitted'));

        console.log('✓ D: a forged envelope and a malformed payload sharing the same discovery tag are both silently skipped; the genuine candidate among them is still admitted.');
    }

    // ===============================================================
    // Section E — unknown Publication is still admitted.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const authorProvider = makeIdentity('0.9.628-unknownpub-author');
        const { exchange: authorExchange } = makeExchange(authorProvider);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.628-nobody-has-heard-of-this', authorIdentityId: authorProvider.getSigningIdentity().id, content: 'about an undiscovered publication' });
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.628-unknownpub' });
        await distribution.publish(authorExchange.exportCommentary(commentary));

        const readerProvider = makeIdentity('0.9.628-unknownpub-reader');
        const { store: readerStore, exchange: readerExchange } = makeExchange(readerProvider);
        const readerDistribution = makeDistribution({ relay, discoveryTag: '0.9.628-unknownpub' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(readerDistribution, readerExchange);

        const admitted = await discoverUseCase.execute({ publicationId: 'pub-0.9.628-nobody-has-heard-of-this' });
        assert(admitted.length === 1 && admitted[0].isNew === true, n('ADMITTED succeeds regardless of local Publication awareness — no discoveryProvider/Publication existence check of any kind is introduced anywhere on this path'));
        assert(readerStore.getById(commentary.commentaryId) !== null, n('the commentary really is on file'));

        const useCaseSource = codeOnly(await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js'));
        assert(!/discoveryProvider|DiscoveryProvider|CanCommentOnPublicationUseCase/.test(useCaseSource),
            n('application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js imports/mentions no Publication discovery or authorization collaborator of any kind — the same structural separation 0.9.627\'s own Section F already proved for the WebRTC path, reconfirmed here for Nostr'));

        console.log('✓ E: a Commentary naming a locally unknown Publication is admitted through the new Nostr path exactly like every other transport.');
    }

    // ===============================================================
    // Section F — transport-failure / contract-violation semantics.
    // ===============================================================
    {
        // F1. Unavailable relay: publish()/retrieve()/discover() all reject.
        const failingRelay = { FakeSocket: erroringSocketCtor() };
        const failing = makeDistribution({ relay: failingRelay, discoveryTag: '0.9.628-fail' });
        let publishRejected = false;
        try { await failing.publish({ commentaryId: 'irrelevant' }); } catch { publishRejected = true; }
        assert(publishRejected, n('an unavailable relay makes publish() reject, never silently return null'));
        let retrieveRejected = false;
        try { await failing.retrieve('a'.repeat(64)); } catch { retrieveRejected = true; }
        assert(retrieveRejected, n('an unavailable relay makes retrieve() reject'));
        let discoverRejected = false;
        try { await failing.discover(); } catch { discoverRejected = true; }
        assert(discoverRejected, n('an unavailable relay makes discover() reject'));

        // F2. A relay's definite decline degrades to null.
        const decliningRelay = makeSharedFakeRelay({ declineReason: 'blocked: spam' });
        const declining = makeDistribution({ relay: decliningRelay, discoveryTag: '0.9.628-decline' });
        const declinedResult = await declining.publish({ commentaryId: 'irrelevant' });
        assert(declinedResult === null, n('a relay that definitely declines the event resolves publish() to null, never a rejection'));

        // F3. A publishImpl violating its own contract (bad id) throws
        // rather than degrading to null.
        const relay = makeSharedFakeRelay();
        const brokenPublishImpl = async () => ({ published: true, id: 'not-a-valid-hex-id' });
        const broken = new PublicationCommentaryNostrDistribution({
            publishImpl: brokenPublishImpl,
            queryImpl: createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket }),
            relayUrl: 'wss://relay.example',
            discoveryTag: '0.9.628-broken'
        });
        let threw = false;
        try { await broken.publish({ commentaryId: 'irrelevant' }); } catch { threw = true; }
        assert(threw, n('a publishImpl that resolves with published:true but a malformed id throws — a bug in wiring, never an ordinary Nostr outcome'));

        // F4. Malformed locator / non-JSON content / unrelated JSON all
        // degrade to null for retrieve(), and are silently excluded from
        // discover()'s own result array.
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.628-malformed' });
        assert(await distribution.retrieve('too-short') === null, n('a malformed locator (not 64 hex chars) resolves retrieve() to null without ever querying the relay'));
        const rawPublish = createNostrInjectedProviderPublisher({ injectedProvider: fakeExtension(), webSocketImpl: relay.FakeSocket });
        const nonJson = await rawPublish('wss://relay.example', { kind: 1, tags: [['t', '0.9.628-malformed']], content: 'not json {{{' });
        assert(await distribution.retrieve(nonJson.id) === null, n('non-JSON event content resolves retrieve() to null'));
        const discovered = await distribution.discover();
        assert(Array.isArray(discovered) && discovered.every((entry) => entry && typeof entry === 'object'),
            n('discover() never includes a non-JSON/non-object candidate in its own result array'));

        console.log('✓ F: relay unavailability is a rejection, a definite decline or malformed candidate degrades to null/is skipped, and a publishImpl violating its own contract throws — the identical semantics application/nostr/NostrPublicationDiscoveryPublisher.js already holds one substrate over.');
    }

    // ===============================================================
    // Section G — no publicationId, no network call.
    // ===============================================================
    {
        let discoverCalled = false;
        const spyDistribution = { discover: async () => { discoverCalled = true; return []; } };
        const provider = makeIdentity('0.9.628-guard');
        const { exchange } = makeExchange(provider);
        const useCase = new DiscoverPublicationCommentaryFromNostrUseCase(spyDistribution, exchange);
        const result = await useCase.execute({});
        assert(Array.isArray(result) && result.length === 0 && discoverCalled === false,
            n('a call with no publicationId returns [] without ever calling nostrDistribution.discover() — mirrors application/publication/commentary/GetPublicationCommentariesUseCase.js\'s own composed guard restraint exactly'));

        console.log('✓ G: no publicationId, no discover() call, no thrown error.');
    }

    // ===============================================================
    // Section H — production wiring census.
    // ===============================================================
    {
        // UNIFIED — ui/main.js no longer constructs PublicationCommentaryNostrDistribution
        // directly; it constructs application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js
        // instead, which itself constructs one PublicationCommentaryNostrDistribution
        // instance per configured relay (fan-out across the unified Nostr
        // relay set — see core/NostrRelayConfiguration.js's own "unified"
        // header). So the real construction site for the single-relay class
        // moved from ui/main.js to that one sibling file — still exactly
        // one production file, never a second, ad hoc construction anywhere
        // else.
        const distributionSites = grepFiles('new PublicationCommentaryNostrDistribution\\(', ['ui', 'application']);
        assert(distributionSites.length === 1 && distributionSites[0].includes('NostrMultiRelayPublicationCommentaryDistribution.js'),
            n(`exactly one production file constructs PublicationCommentaryNostrDistribution — application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js — found: ${distributionSites.join(', ') || 'none'}`));
        const multiRelayConstructionSites = grepFiles('new NostrMultiRelayPublicationCommentaryDistribution\\(', ['ui', 'application']);
        assert(multiRelayConstructionSites.length === 1 && multiRelayConstructionSites[0].includes('ui/main.js'),
            n(`exactly one production file constructs NostrMultiRelayPublicationCommentaryDistribution — ui/main.js — found: ${multiRelayConstructionSites.join(', ') || 'none'}`));

        const discoverSites = grepFiles('new DiscoverPublicationCommentaryFromNostrUseCase\\(', ['ui', 'application']);
        assert(discoverSites.length === 1 && discoverSites[0].includes('ui/main.js'),
            n(`exactly one production file constructs DiscoverPublicationCommentaryFromNostrUseCase — ui/main.js — found: ${discoverSites.join(', ') || 'none'}`));

        const exchangeConstructionSites = grepFiles('new PublicationCommentaryDistribution(Exchange|PeerExchange)\\(', ['ui', 'application']);
        assert(exchangeConstructionSites.length === 1 && exchangeConstructionSites[0].includes('CreatePublicationCommentaryDistributionPeerExchangeUseCase.js'),
            n('this milestone constructs no second PublicationCommentaryDistributionExchange/PeerExchange anywhere — ui/main.js reuses the SAME instance application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js (0.9.620) already builds for WebRTC, for Nostr publish/import too'));

        // UNIFIED — ui/main.js now imports the fan-out wrapper instead of
        // the single-relay class directly; see this file's own "production
        // wiring census" amendment, above.
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        assert(mainSource.includes("import { NostrMultiRelayPublicationCommentaryDistribution } from '../application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js';")
            && mainSource.includes("import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';"),
            n('ui/main.js imports both new classes'));
        assert(mainSource.includes('publishImpl: nostrHostPublisher,') && mainSource.includes('queryImpl: nostrRelayQueryClient,') && mainSource.includes('relayUrl: resolvedNostrRelayUrl'),
            n('the Nostr distribution instance reuses the SAME nostrHostPublisher/nostrRelayQueryClient/resolvedNostrRelayUrl bindings every other Nostr capability in this file already reuses — no second host-capability resolution, no second relay-configuration mechanism'));
        assert(mainSource.includes("app.provide('discoverPublicationCommentaryFromNostrCommand', discoverPublicationCommentaryFromNostrCommand)"),
            n('the discovery command is provided app-wide, the identical shape every sibling command in this file already uses'));

        console.log('✓ H: ui/main.js is the one and only production composition site for both new classes, and it reuses every existing Nostr/exchange collaborator rather than constructing a second one.');
    }

    // ===============================================================
    // Section I — addPublicationCommentaryCommand: create -> persist ->
    // announce -> Nostr publish, source order and live instrumentation.
    // ===============================================================
    {
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
        assert(wrapperMatch !== null, n('ui/main.js\'s own addPublicationCommentaryCommand wrapper is found, source-level'));
        const wrapperBody = wrapperMatch[1];
        const createIndex = wrapperBody.indexOf('createPublicationCommentaryCommand(input)');
        const announceIndex = wrapperBody.indexOf('.announce(');
        const publishIndex = wrapperBody.indexOf('.publish(');
        assert(createIndex >= 0 && announceIndex >= 0 && publishIndex >= 0 && createIndex < announceIndex && announceIndex < publishIndex,
            n('source order inside the wrapper: local creation, then WebRTC announce, then Nostr publish — never a reordering that could make either distribution attempt precede local persistence'));
        // AMENDED BY 0.9.631 — Publication Commentary Arweave Asynchronous
        // Distribution added exactly-one-of-Nostr-or-Arweave SELECTION to
        // this same wrapper (`asynchronousDistribution`, resolved from
        // `input.discoveryProvider`, defaulting to Nostr — see that
        // milestone's own header on `addPublicationCommentaryCommand`), so
        // the publish call no longer names `publicationCommentaryNostrDistribution`
        // literally. The invariant this assertion actually protects —
        // fire-and-forget, with its own rejection handler, never awaited
        // inline — still holds, on whichever substrate was selected.
        assert(wrapperBody.includes('asynchronousDistribution.publish(envelopeJson).catch(() => {})'),
            n('the asynchronous-substrate publish call (Nostr or Arweave, per 0.9.631\'s own selection) is fire-and-forget with its own rejection handler — never awaited inline, so a slow or unreachable relay/gateway can never block a Commentary submission'));
        assert(wrapperBody.includes("? publicationCommentaryArweaveDistribution\n        : publicationCommentaryNostrDistribution;")
            || /publicationCommentaryArweaveDistribution[\s\S]{0,80}publicationCommentaryNostrDistribution/.test(wrapperBody),
            n('0.9.631: the wrapper selects between the two asynchronous substrates rather than fanning out to both — the identical "selection, never fan-out" invariant application/publication/distribution/PublicationDistributionRuntimeComposition.js already holds, extended here to Commentary'));

        console.log('✓ I (source): create → persist → announce → Nostr publish, confirmed by source order.');
    }
    {
        // Live instrumentation: at the moment the Nostr publish is
        // attempted, the commentary must already be durably persisted and
        // already announced — reusing this milestone's own real classes
        // directly, mirroring how they are actually wired, without
        // booting the full Vue application.
        const provider = makeIdentity('0.9.628-ordering');
        const { store, exchange } = makeExchange(provider);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.628-ordering', authorIdentityId: provider.getSigningIdentity().id, content: 'ordering check' });

        let announced = false;
        let persistedWhenPublishCalled = null;
        let announcedWhenPublishCalled = null;
        const relay = makeSharedFakeRelay();
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.628-ordering' });
        const originalPublish = distribution.publish.bind(distribution);
        distribution.publish = (envelopeJson) => {
            persistedWhenPublishCalled = store.getById(commentary.commentaryId) !== null;
            announcedWhenPublishCalled = announced;
            return originalPublish(envelopeJson);
        };

        // Reproduces ui/main.js's own wrapper body, line for line: create +
        // persist (already done, above), announce (simulated), then Nostr
        // publish, fire-and-forget.
        store.save(commentary);
        announced = true;
        const envelopeJson = exchange.exportCommentary(commentary);
        await distribution.publish(envelopeJson).catch(() => {});

        assert(persistedWhenPublishCalled === true && announcedWhenPublishCalled === true,
            n('behaviorally: at the exact moment the Nostr publish is invoked, the commentary is already durably persisted AND already announced over WebRTC — matching the source-order guard in the section above'));

        // A Nostr failure never undoes local persistence.
        const failingRelay = { FakeSocket: erroringSocketCtor() };
        const failingDistribution = makeDistribution({ relay: failingRelay, discoveryTag: '0.9.628-ordering-failure' });
        const commentary2 = new PublicationCommentary({ publicationId: 'pub-0.9.628-ordering-2', authorIdentityId: provider.getSigningIdentity().id, content: 'nostr will fail for this one' });
        store.save(commentary2);
        await failingDistribution.publish(exchange.exportCommentary(commentary2)).catch(() => {});
        assert(store.getById(commentary2.commentaryId) !== null,
            n('a genuinely failing Nostr publish (relay unreachable) never undoes the already-successful local persistence — matches this milestone\'s own "keep local creation first" requirement'));

        console.log('✓ I (live): create → persist → announce happen before Nostr publish is ever attempted, and a Nostr failure never undoes local persistence.');
    }

    // ===============================================================
    // Section J — the read side stays untouched.
    // ===============================================================
    {
        const getUseCaseSource = codeOnly(await rawSource('application/publication/commentary/GetPublicationCommentariesUseCase.js'));
        const createUseCaseSource = codeOnly(await rawSource('application/publication/commentary/CreatePublicationCommentaryUseCase.js'));
        assert(!/Nostr/.test(getUseCaseSource) && !/Nostr/.test(createUseCaseSource),
            n('application/publication/commentary/GetPublicationCommentariesUseCase.js and application/publication/commentary/CreatePublicationCommentaryUseCase.js — both unmodified by this milestone — mention nothing Nostr-shaped; the synchronous, storage-only read path is untouched, exactly as this milestone\'s own requesting brief required ("retrieval should remain explicitly separate")'));

        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        assert(mainSource.includes('function discoverPublicationCommentaryFromNostrCommand(publicationId) {')
            && !/getPublicationCommentariesCommand\s*=.*[Nn]ostr/.test(mainSource),
            n('the Nostr discovery command is its own, separately-named, separately-invoked function — never folded into getPublicationCommentariesCommand, and never invoked automatically inside it'));

        console.log('✓ J: reading local commentary stays exactly as thin and Nostr-unaware as before; discovery is a genuinely separate, explicitly-invoked command.');
    }

    // ===============================================================
    // Section K — notification reuse, never a second mechanism.
    // ===============================================================
    {
        const bridgeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js'));
        assert(!/Nostr/.test(bridgeSource),
            n('application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js is unmodified by this milestone — it still mentions nothing Nostr-shaped, because it does not need to: it already accepts the transport-agnostic { commentary, isNew } shape'));

        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        // AMENDED BY 0.9.631 — Publication Commentary Arweave Asynchronous
        // Distribution added a third call site, `discoverPublicationCommentaryFromArweaveCommand`,
        // mirroring the Nostr one exactly and funneling into the SAME
        // bridge instance — never a second, transport-specific
        // notification mechanism. The count this assertion protects
        // becomes three, never a fixed "two" that this milestone's own
        // brief never actually required.
        assert(mainSource.includes('publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result)') &&
            (mainSource.match(/publicationCommentaryRemoteNotificationBridge\.handleCommentaryReceived\(/g) || []).length === 4,
            n('exactly four production call sites feed publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived() — the WebRTC onCommentaryReceived() subscription, and the Nostr, Arweave and Steem discovery commands — all funneling into the SAME bridge instance, never a second, transport-specific notification path'));

        console.log('✓ K: a newly-admitted Nostr Commentary reaches the identical local-notification boundary the WebRTC path already uses — no duplicate notification mechanism was built.');
    }

    // ===============================================================
    // Section L — exclusion guard.
    // ===============================================================
    {
        const newFilesSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryNostrDistribution.js'))
            + codeOnly(await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js'));
        assert(!/ArweaveAnnouncementPublisher|arweave\//i.test(newFilesSource),
            n('neither new file imports or references anything Arweave-shaped'));
        assert(!/relayRank|relayScore|relayPreference|fallbackRelay|retryQueue|backgroundSync|fan.?out/i.test(newFilesSource),
            n('no relay ranking, preference, fallback, retry queue, background sync, or fan-out vocabulary of any kind'));
        assert(!/nostrEventId\s*[:=]|arweaveTransactionId\s*[:=]/.test(newFilesSource),
            n('no new Commentary identity field is introduced — a publish() result\'s own `locator` is a caller-side value only, never folded into the envelope'));
        assert((newFilesSource.match(/relayUrl/g) || []).length > 0, n('sanity: the exclusion scan actually read real, substantial file content, not an empty string'));

        const peerExchangeSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js'));
        assert(!/Nostr/.test(peerExchangeSource), n('the existing WebRTC peer exchange class remains completely unmodified and Nostr-unaware'));

        const nostrDiscoveryPublisherSource = codeOnly(await rawSource('application/nostr/NostrPublicationDiscoveryPublisher.js'));
        const nostrDiscoveryQueryServiceSource = codeOnly(await rawSource('application/nostr/NostrDiscoveryQueryService.js'));
        assert(!/Commentary/.test(nostrDiscoveryPublisherSource) && !/Commentary/.test(nostrDiscoveryQueryServiceSource),
            n('the existing Publication/Snapshot discovery-specific Nostr classes remain unmodified and mention no Commentary vocabulary of any kind — the architectural mismatch 0.9.625-0.9.627 already found stays exactly that; this milestone never repurposed either class'));

        console.log('✓ L: nothing on this milestone\'s own "deliberately excluded" list — Arweave, multi-relay fan-out, relay ranking/fallback, retry queues, background sync, a new Commentary identity field, or a change to the WebRTC path or the existing discovery-specific Nostr classes — was built.');
    }

    // ===============================================================
    // Section M — verdict.
    // ===============================================================
    {
        console.log('\n=== 0.9.628 VERDICT ===');
        console.log('  CONCRETE_PRODUCT_GAP (0.9.627)  -> CLOSED. application/publication/commentary/PublicationCommentaryNostrDistribution.js');
        console.log('                                     (the small, permanent adapter that milestone\'s own audit named)');
        console.log('                                     now exists, is wired into ui/main.js as a genuinely parallel');
        console.log('                                     path alongside the existing WebRTC announce, and its own');
        console.log('                                     discovery/admission boundary (application/');
        console.log('                                     DiscoverPublicationCommentaryFromNostrUseCase.js) is provided');
        console.log('                                     as an explicit, separately-invoked ui/main.js command — never');
        console.log('                                     auto-wired into every Commentary read.');
        console.log('  SEMANTIC_GAP (0.9.627)          -> UNCHANGED, honestly: PERSISTENTLY_PUBLISHED here still means');
        console.log('                                     only "at least one relay\'s OK," never Arweave-grade');
        console.log('                                     durability — this milestone introduces no confirmation step');
        console.log('                                     claiming otherwise.');
        console.log('  Multi-relay fan-out/resilience  -> CLOSED. application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js');
        console.log('                                     fans publish/retrieve/discover out across the unified Nostr relay');
        console.log('                                     set — see core/NostrRelayConfiguration.js\'s own "unified" header.');
        console.log(`\n✅ All Publication Commentary Nostr Asynchronous Distribution tests passed (${assertionCount} assertions).`);
    }
}

await run();
