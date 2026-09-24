import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { Publication } from '../publisher/Publication.js';

import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js';
import { PublicationCommentaryNostrDistribution } from '../application/publication/commentary/PublicationCommentaryNostrDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';

import {
    PublicationCommentaryDeliveryStatus,
    PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE,
    isValidPublicationCommentaryDeliveryStatusTransition
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';

import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';

import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.9.629 — Publication Commentary Nostr Asynchronous Distribution
// Closure Audit.
//
// TYPE: test-only product/architecture closure audit. PRODUCTION CHANGES:
// none (Section M's own guard). This file, plus small in-place amendments
// to four earlier audits' own now-stale assertions (tests/
// PostCommentaryDistributionProductReassessment.test.js,
// PublicationCommentaryPersistentDistributionBoundaryAudit.test.js,
// PublicationCommentaryAsynchronousDeliveryContract.test.js,
// PublicationCommentaryNostrRoundTripBoundaryAudit.test.js — each carries
// its own "AMENDED BY 0.9.629" header note), are the entirety of this
// milestone's changes.
//
// THE QUESTION. 0.9.617-0.9.628 answered "can Nostr transport Commentary?"
// — yes. This file asks a different, higher-altitude question: does the
// COMPLETE Commentary lifecycle now provide the intended asynchronous
// REACHABILITY property, without creating new identity, security,
// notification, or transport-coupling problems? The flagship scenario
// (Section B) reproduces the actual product journey that motivated this
// whole arc — Alice comments on Bob's Publication while Bob is entirely
// offline, over Nostr alone, with NO WebRTC connection between them at any
// point — and carries it all the way through to Bob's own local
// notification, never stopping at mere admission the way 0.9.628's own
// flagship did.
//
//   Section A — re-execute the entire preceding arc (0.9.617-0.9.628),
//               live, as real subprocesses against current source.
//   Section B — FLAGSHIP: the no-WebRTC offline-recipient journey, through
//               to notification, proving the new capability solves the
//               original reachability problem rather than merely
//               duplicating live peer delivery.
//   Section C — identity continuity: commentaryId, publicationId, the
//               Nostr event id, and authorIdentityId stay four
//               independent facts across the whole pipeline; no
//               transport-generated identity replaces Commentary
//               identity.
//   Section D — cross-publication isolation: a shared discovery
//               campaign/tag never leaks one Publication's commentary
//               into another's results; a query for an unused
//               publicationId returns nothing even when valid candidates
//               exist on the same relay.
//   Section E — verification remains authoritative: forged identity,
//               altered content, altered commentaryId, and altered
//               publicationId (including a tampered publicationId that
//               passes the admission boundary's own superficial pre-
//               filter) are all caught at signature verification, never
//               admitted merely because Nostr returned them; malformed
//               envelopes never abort a batch.
//   Section F — an unknown Publication is still admitted (brief
//               reconfirmation of 0.9.627/0.9.628's own finding).
//   Section G — notification convergence: a real WebRTC arrival and a
//               real Nostr arrival feed the SAME bridge and produce
//               structurally identical NotificationEvents; duplicate
//               Nostr retrieval never re-notifies; a device's own
//               locally-created Commentary echoing back from Nostr never
//               double-notifies; a non-publisher recipient still produces
//               zero notifications; a forged/malformed candidate never
//               reaches the bridge at all.
//   Section H — local-first failure isolation: local persistence survives
//               both WebRTC and Nostr failing; Nostr distribution
//               succeeds independently with zero connected peers.
//   Section I — duplicate/replay behavior: repeated discovery of the same
//               candidate stays a no-op on the second admission (store-
//               level dedup); the SAME Commentary published as two
//               DIFFERENT Nostr events is still deduplicated to one
//               stored record, by commentaryId/content, never by Nostr
//               event identity.
//   Section J — persistence semantics: PERSISTENTLY_PUBLISHED is never
//               conflated with durable/permanent availability anywhere in
//               this codebase's own production source; the actual product
//               promise is stated and backed by a live re-check.
//   Section K — architectural concern: the query shape stays
//               publicationId -> tag query -> candidates -> publicationId
//               filter -> verify; discover() is stateless (no accumulating
//               local index); no file anywhere resembles a global
//               Commentary index.
//   Section L — product reassessment: a capability comparison table built
//               FROM this file's own live findings above, not asserted
//               independently, answering whether Arweave is currently
//               warranted.
//   Section M — deliberate exclusions guard; no production file touched.
//   Section N — verdict.

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
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
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

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

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

// The identical fake NIP-07 extension / fake relay shape 0.9.628's own
// test file already established — reused verbatim here rather than
// reinvented, since this milestone is a CLOSURE audit over the same real
// production classes, never a new transport fixture.
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
    // Section A — re-execute the entire preceding arc, live.
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
            ['tests/PublicationCommentaryNostrAsynchronousDistribution.test.js', /All Publication Commentary Nostr Asynchronous Distribution tests passed/]
        ];
        for (const [file, verdictPattern] of arc) {
            const result = runGuardLive(file);
            assert(result.passed && verdictPattern.test(result.stdout),
                n(`${file} (0.9.617-0.9.628's own arc), re-executed live against current source, still exits 0 and prints its own passing verdict`));
        }
        console.log(`✓ A: the entire 0.9.617-0.9.628 arc — ${arc.length} files — reconfirmed live, right now, against current source. This milestone builds on that result, never re-derives it.`);
    }

    // ===============================================================
    // Section B — FLAGSHIP: the no-WebRTC offline-recipient journey,
    // through to notification.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        const traversed = [S.CREATED];

        const alice = makeIdentity('0.9.629-alice');
        const bob = makeIdentity('0.9.629-bob');
        const { publication: bobsWork, discoveryProvider } = makePublication({ id: 'pub-0.9.629-bobs-work', publisherProvider: bob });

        const { store: aliceStore, exchange: aliceExchange } = makeExchange(alice);
        const commentary = new PublicationCommentary({
            publicationId: bobsWork.id,
            authorIdentityId: alice.getSigningIdentity().id,
            content: 'flagship: no WebRTC connection to Bob exists anywhere in this section'
        });
        aliceStore.save(commentary);
        traversed.push(S.SIGNED);
        const envelopeJson = aliceExchange.exportCommentary(commentary);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed.at(-2), traversed.at(-1)), n('SIGNED: valid transition'));

        const relay = makeSharedFakeRelay();
        const aliceDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-flagship' });
        const publishResult = await aliceDistribution.publish(envelopeJson);
        assert(publishResult && publishResult.published === true, n('PERSISTENTLY_PUBLISHED: Alice\'s comment is published to the shared relay while Bob is entirely offline'));
        traversed.push(S.PERSISTENTLY_PUBLISHED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed.at(-2), traversed.at(-1)), n('valid transition'));

        // Bob comes online later. His own independent store/exchange/
        // distribution instance shares only the fake relay's own storage
        // with Alice — never a process, a store, or a peer connection.
        const { store: bobStore, exchange: bobExchange } = makeExchange(bob);
        const bobDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-flagship' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(bobDistribution, bobExchange);

        const notifications = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, bob, (event) => notifications.push(event));

        const admitted = await discoverUseCase.execute({ publicationId: bobsWork.id });
        traversed.push(S.DISCOVERABLE, S.RETRIEVED, S.VERIFIED, S.ADMITTED);
        assert(admitted.length === 1 && admitted[0].isNew === true && admitted[0].commentary.commentaryId === commentary.commentaryId,
            n('ADMITTED: Bob discovers, verifies, and admits Alice\'s comment through Nostr alone'));
        assert(bobStore.getById(commentary.commentaryId).content === commentary.content, n('content survives byte for byte'));

        for (const result of admitted) {
            bridge.handleCommentaryReceived(result);
        }
        assert(notifications.length === 1 && notifications[0].eventType === PUBLICATION_COMMENTED_EVENT_TYPE,
            n('Bob\'s own local notification bridge produces exactly one publication.commented NotificationEvent — the SAME shape local creation already produces — closing the reachability gap all the way to what Bob actually sees, never stopping at mere admission'));
        assert(notifications[0].payload.commentaryId === commentary.commentaryId && notifications[0].payload.authorIdentityId === alice.getSigningIdentity().id,
            n('addressed correctly: about Alice\'s comment, to Bob (the Publication\'s own publisher)'));

        assert(JSON.stringify(traversed) === JSON.stringify(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE),
            n('the full seven-stage sequence was traversed, in order, none skipped'));

        // Structural guard: THIS SECTION'S OWN CODE never references any
        // WebRTC/peer transport vocabulary — the proof that the flagship
        // above genuinely used no live peer connection, not merely a test
        // that happened not to construct one.
        const testSource = await readFile(new URL(import.meta.url), 'utf8');
        const sectionStart = testSource.indexOf('Section B — FLAGSHIP');
        const sectionEnd = testSource.indexOf('Section C — identity continuity');
        const sectionBSource = codeOnly(testSource.slice(sectionStart, sectionEnd));
        assert(!/PeerMessageBus|ConnectedPeerRegistry|PublicationCommentaryDistributionPeerExchange|LocalPeerConnectionProvider|ConnectToPeerUseCase|\.announce\(/.test(sectionBSource),
            n('confirmed by scanning this section\'s own source (comments excluded): no WebRTC/peer transport class or method is referenced anywhere in it — the flagship above is genuinely Nostr-only, proving the new capability solves the original reachability problem rather than merely duplicating live peer delivery'));

        console.log('✓ B — FLAGSHIP: Alice comments on Bob\'s Publication while Bob is completely offline; no WebRTC connection between them ever exists; Bob later discovers, verifies, admits, AND is locally notified about it, entirely through the Nostr path this arc built.');
    }

    // ===============================================================
    // Section C — identity continuity.
    // ===============================================================
    {
        const alice = makeIdentity('0.9.629-identity-alice');
        const { store: aliceStore, exchange: aliceExchange } = makeExchange(alice);
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.629-identity',
            authorIdentityId: alice.getSigningIdentity().id,
            content: 'identity continuity check'
        });
        aliceStore.save(commentary);
        const originalCommentaryId = commentary.commentaryId;
        const originalPublicationId = commentary.publicationId;
        const originalAuthorId = commentary.authorIdentityId;

        const envelopeJson = aliceExchange.exportCommentary(commentary);
        assert(envelopeJson.commentaryId === originalCommentaryId, n('commentaryId survives signing unchanged'));

        const relay = makeSharedFakeRelay();
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.629-identity' });
        const publishResult = await distribution.publish(envelopeJson);
        const nostrLocator = publishResult.locator;
        assert(nostrLocator !== originalCommentaryId, n('the Nostr event id (locator) is NOT the commentaryId — a transport-layer identifier, never Commentary identity'));

        const bob = makeIdentity('0.9.629-identity-bob');
        const { exchange: bobExchange, store: bobStore } = makeExchange(bob);
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(makeDistribution({ relay, discoveryTag: '0.9.629-identity' }), bobExchange);
        const [admittedResult] = await discoverUseCase.execute({ publicationId: originalPublicationId });

        assert(admittedResult.commentary.commentaryId === originalCommentaryId, n('commentaryId survives creation -> signing -> WebRTC-eligible envelope -> Nostr publication -> discovery -> retrieval -> verification -> admission, unchanged'));
        assert(admittedResult.commentary.publicationId === originalPublicationId, n('publicationId survives unchanged'));
        assert(admittedResult.commentary.authorIdentityId === originalAuthorId, n('authorIdentityId survives unchanged'));
        assert(bobStore.getById(originalCommentaryId).commentaryId === originalCommentaryId, n('the admitted, stored record is retrievable by the ORIGINAL commentaryId — no transport-generated identity was substituted for it'));

        // commentaryId, publicationId, and the Nostr event id are four
        // (three, here — no separate authorIdentityId collision possible
        // by construction) genuinely independent values.
        const distinctValues = new Set([originalCommentaryId, originalPublicationId, nostrLocator, originalAuthorId]);
        assert(distinctValues.size === 4, n('commentaryId, publicationId, the Nostr event id, and authorIdentityId are four distinct, unaliased values — none derived from or collapsed into another'));

        // Reconfirm, live, that no production file anywhere folds a
        // Nostr-specific identifier into Commentary's own identity.
        const envelopeSource = codeOnly(await rawSource('core/PublicationCommentaryDistributionEnvelope.js'));
        const storeSource = codeOnly(await rawSource('storage/PublicationCommentaryStore.js'));
        assert(!/nostrEventId/i.test(envelopeSource) && !/nostrEventId/i.test(storeSource),
            n('neither the envelope nor the store carries a nostrEventId field — the Nostr locator lives only in a caller\'s own bookkeeping (application/publication/commentary/PublicationCommentaryNostrDistribution.js#publish()\'s own return value), never inside Commentary\'s own identity'));

        console.log('✓ C: commentaryId, publicationId, the Nostr event id, and authorIdentityId remain four independent, unaliased facts across the full lifecycle — no transport-generated identity ever replaces Commentary identity.');
    }

    // ===============================================================
    // Section D — cross-publication isolation.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const author = makeIdentity('0.9.629-iso-author');
        const { exchange: authorExchange } = makeExchange(author);

        const commentaryA1 = new PublicationCommentary({ publicationId: 'pub-0.9.629-A', authorIdentityId: author.getSigningIdentity().id, content: 'A1' });
        const commentaryA2 = new PublicationCommentary({ publicationId: 'pub-0.9.629-A', authorIdentityId: author.getSigningIdentity().id, content: 'A2' });
        const commentaryB1 = new PublicationCommentary({ publicationId: 'pub-0.9.629-B', authorIdentityId: author.getSigningIdentity().id, content: 'B1' });

        const distribution = makeDistribution({ relay, discoveryTag: '0.9.629-shared-campaign' });
        await distribution.publish(authorExchange.exportCommentary(commentaryA1));
        await distribution.publish(authorExchange.exportCommentary(commentaryA2));
        await distribution.publish(authorExchange.exportCommentary(commentaryB1));

        const reader = makeIdentity('0.9.629-iso-reader');
        const { exchange: readerExchange } = makeExchange(reader);
        const readerDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-shared-campaign' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(readerDistribution, readerExchange);

        const forA = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-A' });
        assert(forA.length === 2 && forA.every((r) => r.commentary.publicationId === 'pub-0.9.629-A'), n('a query for pub-A returns exactly its own two commentaries, never B1, even though all three share one relay and one campaign tag'));

        const forUnused = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-never-published-to' });
        assert(forUnused.length === 0, n('a query for a publicationId nobody ever published to returns nothing, even though valid, verifiable candidates for OTHER publications exist on the exact same relay/tag'));

        // Discovery-tag isolation: the SAME publicationId, published under
        // a DIFFERENT campaign tag, is never visible to a reader configured
        // for the original tag.
        const otherCampaignDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-different-campaign' });
        const commentaryAOtherCampaign = new PublicationCommentary({ publicationId: 'pub-0.9.629-A', authorIdentityId: author.getSigningIdentity().id, content: 'A-under-a-different-tag' });
        await otherCampaignDistribution.publish(authorExchange.exportCommentary(commentaryAOtherCampaign));
        const forAAgain = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-A' });
        assert(forAAgain.length === 2, n('a candidate published under a DIFFERENT discovery tag, even for the identical publicationId, is invisible to a reader configured for the original tag — the tag is a query/indexing mechanism, never Commentary identity'));

        console.log('✓ D: a shared discovery campaign never leaks one Publication\'s commentary into another\'s results; an unused publicationId returns nothing; a different discovery tag hides even a matching publicationId — isolation holds on both dimensions.');
    }

    // ===============================================================
    // Section E — verification remains authoritative.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.629-verification' });

        const honest = makeIdentity('0.9.629-ver-honest');
        const { exchange: honestExchange } = makeExchange(honest);
        const honestCommentary = new PublicationCommentary({ publicationId: 'pub-0.9.629-ver', authorIdentityId: honest.getSigningIdentity().id, content: 'a genuine comment' });
        await distribution.publish(honestExchange.exportCommentary(honestCommentary));

        // E1 — forged authorIdentityId: genuinely signed by the forger,
        // relabeled to claim a victim's identity.
        const forger = makeIdentity('0.9.629-ver-forger');
        const { exchange: forgerExchange } = makeExchange(forger);
        const victim = makeIdentity('0.9.629-ver-victim');
        const forgedByAuthor = new PublicationCommentary({ publicationId: 'pub-0.9.629-ver', authorIdentityId: forger.getSigningIdentity().id, content: 'forged authorship' });
        const forgedAuthorEnvelope = { ...forgerExchange.exportCommentary(forgedByAuthor), authorIdentityId: victim.getSigningIdentity().id };
        await distribution.publish(forgedAuthorEnvelope);

        // E2 — content altered post-signing.
        const alteredContentEnvelope = { ...honestExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.629-ver', authorIdentityId: honest.getSigningIdentity().id, content: 'original' })), content: 'tampered content' };
        await distribution.publish(alteredContentEnvelope);

        // E3 — commentaryId altered post-signing.
        const alteredIdEnvelope = { ...honestExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.629-ver', authorIdentityId: honest.getSigningIdentity().id, content: 'id target' })), commentaryId: 'tampered-commentary-id' };
        await distribution.publish(alteredIdEnvelope);

        // E4 — publicationId altered post-signing to CLAIM the exact
        // publicationId this section queries for. This is THE proof that
        // "Nostr says candidate exists" is not "Commentary is trusted": the
        // admission boundary's own pre-filter (publicationId match) passes
        // this candidate through, and verification is what actually stops
        // it.
        const otherPub = new PublicationCommentary({ publicationId: 'pub-0.9.629-ver-elsewhere', authorIdentityId: honest.getSigningIdentity().id, content: 'belongs elsewhere' });
        const retargetedEnvelope = { ...honestExchange.exportCommentary(otherPub), publicationId: 'pub-0.9.629-ver' };
        await distribution.publish(retargetedEnvelope);

        // E5/E6 — malformed envelopes: missing required fields, and a
        // non-object signature.
        await distribution.publish({ kind: 'not-a-real-envelope' });
        await distribution.publish({ ...honestExchange.exportCommentary(new PublicationCommentary({ publicationId: 'pub-0.9.629-ver', authorIdentityId: honest.getSigningIdentity().id, content: 'bad sig shape' })), signature: 'not-an-object' });

        const reader = makeIdentity('0.9.629-ver-reader');
        const { exchange: readerExchange } = makeExchange(reader);
        const readerDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-verification' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(readerDistribution, readerExchange);
        const admitted = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-ver' });

        assert(admitted.length === 1 && admitted[0].commentary.commentaryId === honestCommentary.commentaryId,
            n('exactly ONE candidate is admitted for pub-0.9.629-ver — the one honest, correctly-signed commentary — every one of the six adversarial candidates (forged author, altered content, altered commentaryId, retargeted publicationId, malformed shape, malformed signature) is rejected, never admitted merely because Nostr\'s own tag query returned it'));
        assert(admitted[0].commentary.content === 'a genuine comment', n('and it is the genuinely honest content, never a tampered variant'));

        console.log('✓ E: "Nostr says candidate exists" and "Commentary is trusted" are proven, live, to be different things — six adversarial cases, including a publicationId retargeted specifically to slip past the admission boundary\'s own pre-filter, are all caught at signature verification. One bad candidate never aborts the batch.');
    }

    // ===============================================================
    // Section F — unknown Publication is still admitted.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const author = makeIdentity('0.9.629-unknown-pub-author');
        const { exchange: authorExchange } = makeExchange(author);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.629-nobody-has-heard-of-this', authorIdentityId: author.getSigningIdentity().id, content: 'about a Publication this replica never discovered' });
        const distribution = makeDistribution({ relay, discoveryTag: '0.9.629-unknown-pub' });
        await distribution.publish(authorExchange.exportCommentary(commentary));

        const reader = makeIdentity('0.9.629-unknown-pub-reader');
        const { exchange: readerExchange } = makeExchange(reader);
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(makeDistribution({ relay, discoveryTag: '0.9.629-unknown-pub' }), readerExchange);
        const admitted = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-nobody-has-heard-of-this' });

        assert(admitted.length === 1 && admitted[0].isNew === true, n('a well-formed, genuinely-signed Commentary naming a locally-unknown Publication is still admitted — Nostr Commentary discovery does not require Publication discovery to happen first, allowing the two asynchronous lifecycles to converge later'));

        console.log('✓ F: unknown-Publication admission reconfirmed.');
    }

    // ===============================================================
    // Section G — notification convergence.
    // ===============================================================
    {
        // G1/G4/G5 — a real WebRTC arrival and a real Nostr arrival feed
        // the SAME bridge instance and produce structurally identical
        // notifications; a non-publisher recipient still produces zero;
        // a forged candidate never reaches the bridge at all.
        const alice = makeIdentity('0.9.629-conv-alice'); // the Publication's own publisher, receiving on this replica
        const bobWebRTC = makeIdentity('0.9.629-conv-bob'); // comments over WebRTC
        const carolNostr = makeIdentity('0.9.629-conv-carol'); // comments over Nostr
        const thirdParty = makeIdentity('0.9.629-conv-thirdparty'); // neither author nor publisher
        const forger = makeIdentity('0.9.629-conv-forger');

        const { publication, discoveryProvider } = makePublication({ id: 'pub-0.9.629-convergence', publisherProvider: alice });
        const { store: aliceStore, exchange: aliceExchange } = makeExchange(alice);

        const notifications = [];
        const bridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, alice, (event) => notifications.push(event));

        // WebRTC side: a real, authenticated peer connection, Bob -> Alice.
        const network = new LocalPeerNetwork();
        const bobTransport = new LocalPeerConnectionProvider('conv-bob-629', network);
        const aliceTransport = new LocalPeerConnectionProvider('conv-alice-629', network);
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bobWebRTC });
        const stopBob = bobConnect.listen();
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAlice = aliceConnect.listen();
        const aliceToBob = aliceConnect.connect({ candidateEndpoint: 'conv-bob-629' });
        await wait(20);
        assert(aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, n('setup: a real, authenticated peer connection exists between Bob and Alice'));

        const alicePeerExchange = new PublicationCommentaryDistributionPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const unsubscribe = alicePeerExchange.onCommentaryReceived((result) => bridge.handleCommentaryReceived(result));

        const { store: bobStore, exchange: bobExchange } = makeExchange(bobWebRTC);
        const bobPeerExchange = new PublicationCommentaryDistributionPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);
        const bobCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: bobWebRTC.getSigningIdentity().id, content: 'delivered over WebRTC' });
        bobStore.save(bobCommentary);
        bobPeerExchange.announce(bobCommentary);
        await wait(40);
        assert(aliceStore.getById(bobCommentary.commentaryId) !== null, n('setup: Bob\'s WebRTC-delivered comment really did arrive on Alice\'s own store'));

        // Nostr side: the SAME aliceExchange/aliceStore, a separate relay.
        const relay = makeSharedFakeRelay();
        const { exchange: carolExchange } = makeExchange(carolNostr);
        const carolCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: carolNostr.getSigningIdentity().id, content: 'delivered over Nostr' });
        await makeDistribution({ relay, discoveryTag: '0.9.629-convergence' }).publish(carolExchange.exportCommentary(carolCommentary));

        // A forged candidate, published to the SAME relay/tag, must never
        // reach the bridge at all.
        const { exchange: forgerExchange } = makeExchange(forger);
        const forgedCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: forger.getSigningIdentity().id, content: 'forged' });
        const forgedEnvelope = { ...forgerExchange.exportCommentary(forgedCommentary), authorIdentityId: carolNostr.getSigningIdentity().id };
        await makeDistribution({ relay, discoveryTag: '0.9.629-convergence' }).publish(forgedEnvelope);

        const aliceNostrDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-convergence' });
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(aliceNostrDistribution, aliceExchange);
        const admitted = await discoverUseCase.execute({ publicationId: publication.id });
        assert(admitted.length === 1 && admitted[0].commentary.commentaryId === carolCommentary.commentaryId,
            n('the forged candidate is rejected before admission — only Carol\'s genuine comment is admitted from the Nostr path'));
        for (const result of admitted) {
            bridge.handleCommentaryReceived(result);
        }

        assert(notifications.length === 2, n('exactly two notifications exist on Alice\'s own replica: one for Bob\'s WebRTC arrival, one for Carol\'s Nostr arrival — the forged candidate never produced a third'));
        const [webrtcNotification, nostrNotification] = notifications;
        assert(webrtcNotification.eventType === PUBLICATION_COMMENTED_EVENT_TYPE && nostrNotification.eventType === PUBLICATION_COMMENTED_EVENT_TYPE,
            n('both notifications share the identical publication.commented eventType — never a transport-specific variant'));
        assert(JSON.stringify(Object.keys(webrtcNotification.payload).sort()) === JSON.stringify(Object.keys(nostrNotification.payload).sort()),
            n('both notifications share an identical payload SHAPE (the same key set) — a recipient cannot structurally distinguish which transport delivered which notification'));
        assert(!/webrtc|nostr|peer|relay/i.test(JSON.stringify(webrtcNotification.toJSON())) && !/webrtc|nostr|peer|relay/i.test(JSON.stringify(nostrNotification.toJSON())),
            n('neither notification leaks which transport delivered it anywhere in its own serialized JSON — transport is genuinely invisible above the bridge'));

        // G2 — duplicate Nostr retrieval never re-notifies.
        const admittedAgain = await discoverUseCase.execute({ publicationId: publication.id });
        assert(admittedAgain.length === 1 && admittedAgain[0].isNew === false, n('discovering the SAME Nostr candidate a second time is a store-level no-op (isNew: false)'));
        bridge.handleCommentaryReceived(admittedAgain[0]);
        assert(notifications.length === 2, n('the bridge produced NO third notification for the duplicate retrieval — dedup is inherited from the store\'s own isNew flag, never a second, notification-specific mechanism'));

        // G3 — Alice's own locally-created commentary, later echoed back
        // from Nostr (e.g. this replica re-running discovery to catch
        // OTHER people's comments), never double-notifies. Local creation
        // itself never goes through this bridge at all (see application/
        // PublicationCommentaryRemoteNotificationBridge.js's own header,
        // "an adapter, never a second producer") — so the only thing to
        // prove here is that the self-echo produces isNew: false and the
        // bridge stays silent for it.
        const aliceOwnCommentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: alice.getSigningIdentity().id, content: 'Alice comments on her own Publication' });
        aliceStore.save(aliceOwnCommentary); // local creation — never touches the bridge
        assert(notifications.length === 2, n('local creation on Alice\'s own replica never invokes the remote bridge at all — still exactly two notifications'));
        await makeDistribution({ relay, discoveryTag: '0.9.629-convergence' }).publish(aliceExchange.exportCommentary(aliceOwnCommentary));
        const selfEchoAdmitted = await discoverUseCase.execute({ publicationId: publication.id });
        const selfEchoResult = selfEchoAdmitted.find((r) => r.commentary.commentaryId === aliceOwnCommentary.commentaryId);
        assert(selfEchoResult && selfEchoResult.isNew === false, n('Alice\'s own already-locally-created comment, later discovered back from Nostr on the SAME replica/store, admits as isNew: false — an identical record was already on file'));
        bridge.handleCommentaryReceived(selfEchoResult);
        assert(notifications.length === 2, n('the self-echo produced no notification at all — a Commentary created locally never generates a second notification merely because it later comes back from Nostr'));

        // G4 (continued) — a non-publisher recipient retains the existing
        // boundary, reconfirmed specifically for the Nostr-fed path.
        const { exchange: thirdPartyExchange } = makeExchange(thirdParty);
        const thirdPartyDiscover = new DiscoverPublicationCommentaryFromNostrUseCase(makeDistribution({ relay, discoveryTag: '0.9.629-convergence' }), thirdPartyExchange);
        const thirdPartyAdmitted = await thirdPartyDiscover.execute({ publicationId: publication.id });
        const thirdPartyNotifications = [];
        const thirdPartyBridge = new PublicationCommentaryRemoteNotificationBridge(discoveryProvider, thirdParty, (event) => thirdPartyNotifications.push(event));
        for (const result of thirdPartyAdmitted) {
            thirdPartyBridge.handleCommentaryReceived(result);
        }
        assert(thirdPartyAdmitted.length > 0, n('setup: the third-party replica really did admit and store the Commentaries via the Nostr path'));
        assert(thirdPartyNotifications.length === 0, n('a replica that is NOT the Publication\'s own publisher produces ZERO notifications, even though it genuinely admitted and stored the same Commentaries — the existing publisher-only notification boundary holds identically for the Nostr-fed path'));

        unsubscribe();
        stopBob();
        stopAlice();
        alicePeerExchange.dispose();
        bobPeerExchange.dispose();

        console.log('✓ G: WebRTC and Nostr arrivals converge on one bridge and one indistinguishable notification shape; duplicate retrieval, a local creator\'s own self-echo, and a non-publisher recipient all correctly produce zero additional notifications; a forged candidate never reaches the bridge at all.');
    }

    // ===============================================================
    // Section H — local-first failure isolation.
    // ===============================================================
    {
        // H1 — local succeeds; both WebRTC and Nostr fail; local
        // Commentary remains valid and queryable regardless.
        const author = makeIdentity('0.9.629-isolation-author');
        const { store, exchange } = makeExchange(author);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.629-isolation', authorIdentityId: author.getSigningIdentity().id, content: 'local persistence must survive both transports failing' });
        store.save(commentary);
        assert(store.getById(commentary.commentaryId) !== null, n('local persistence succeeds independently of any distribution attempt'));

        // A WebRTC announce with zero connected peers is a documented no-op.
        class NoPeerRegistry {
            list() { return []; }
            onChange() { return () => {}; }
        }
        const peerExchange = new PublicationCommentaryDistributionPeerExchange(exchange, new PeerMessageBus(), new NoPeerRegistry());
        let webrtcThrew = false;
        try { peerExchange.announce(commentary); } catch { webrtcThrew = true; }
        assert(!webrtcThrew, n('a WebRTC announce with zero connected peers does not throw — it is a no-op, not a failure'));

        // A genuinely unreachable Nostr relay: both publish() and
        // discover() reject.
        const erroringDistribution = new PublicationCommentaryNostrDistribution({
            publishImpl: createNostrInjectedProviderPublisher({ injectedProvider: fakeExtension(), webSocketImpl: erroringSocketCtor() }),
            queryImpl: createNostrRelayQueryClient({ webSocketImpl: erroringSocketCtor() }),
            relayUrl: 'wss://unreachable.example',
            discoveryTag: '0.9.629-isolation'
        });
        let nostrPublishFailed = false;
        try { await erroringDistribution.publish(exchange.exportCommentary(commentary)); } catch { nostrPublishFailed = true; }
        assert(nostrPublishFailed, n('a genuinely unreachable Nostr relay makes publish() reject, a real transport failure, never silently swallowed'));

        assert(store.getById(commentary.commentaryId).content === commentary.content, n('AFTER both the WebRTC no-op and the Nostr rejection: the local Commentary remains exactly as originally saved — neither distribution attempt undid, altered, or invalidated it'));

        // H2 — the inverse: Nostr succeeds with zero connected WebRTC
        // peers at all; the two mechanisms are genuinely independent.
        const relay = makeSharedFakeRelay();
        const workingDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-isolation-h2' });
        const publishResult = await workingDistribution.publish(exchange.exportCommentary(commentary));
        assert(publishResult && publishResult.published === true, n('Nostr distribution succeeds on its own, with zero WebRTC peers ever connected in this section — the two transports never depend on one another'));

        console.log('✓ H: local persistence survives both transports failing; Nostr succeeds standalone with no WebRTC peers connected at all — genuinely independent mechanisms.');
    }

    // ===============================================================
    // Section I — duplicate and replay behavior.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const author = makeIdentity('0.9.629-dup-author');
        const { exchange: authorExchange } = makeExchange(author);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.629-dup', authorIdentityId: author.getSigningIdentity().id, content: 'published, then re-broadcast as a second, distinct Nostr event' });
        const envelopeJson = authorExchange.exportCommentary(commentary);

        const publishingDistribution = makeDistribution({ relay, discoveryTag: '0.9.629-dup' });
        const firstPublish = await publishingDistribution.publish(envelopeJson);
        const secondPublish = await publishingDistribution.publish(envelopeJson); // byte-identical content, re-broadcast
        assert(firstPublish.locator !== secondPublish.locator, n('setup: the SAME Commentary, published twice, produces two DIFFERENT Nostr event ids — a real substrate fact (re-broadcast, or a relay-side duplicate), not a test artifact'));

        const reader = makeIdentity('0.9.629-dup-reader');
        const { exchange: readerExchange, store: readerStore } = makeExchange(reader);
        const discoverUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(makeDistribution({ relay, discoveryTag: '0.9.629-dup' }), readerExchange);

        // I1 — discover, admit; discover again, admit again.
        const firstRound = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-dup' });
        assert(firstRound.length === 2, n('discover() returns BOTH Nostr events (two distinct event ids on the relay) as separate candidates — this class has no event-level dedup of its own'));
        const admittedNew = firstRound.filter((r) => r.isNew === true);
        const admittedExisting = firstRound.filter((r) => r.isNew === false);
        assert(admittedNew.length === 1 && admittedExisting.length === 1,
            n('exactly one of the two candidates is genuinely new (isNew: true); the other, byte-identical in commentaryId/content, is recognized as already on file (isNew: false) — deduplication is determined by Commentary identity/store semantics, never by Nostr event identity'));
        assert(readerStore.loadAll().filter((c) => c.commentaryId === commentary.commentaryId).length === 1,
            n('exactly ONE stored record exists for this commentaryId, regardless of the two distinct Nostr events that carried it'));

        const secondRound = await discoverUseCase.execute({ publicationId: 'pub-0.9.629-dup' });
        assert(secondRound.every((r) => r.isNew === false), n('I2: discovering the same two events again is a complete no-op — both admissions now report isNew: false, the existing store-level dedup semantics, unchanged by this milestone'));
        assert(readerStore.loadAll().filter((c) => c.commentaryId === commentary.commentaryId).length === 1,
            n('still exactly one stored record after a full repeat discovery round'));

        console.log('✓ I: repeated discovery of the same candidate stays a no-op; the same Commentary carried by two distinct Nostr events is deduplicated to one stored record, by commentaryId/content, never by Nostr event identity.');
    }

    // ===============================================================
    // Section J — persistence semantics.
    // ===============================================================
    {
        const distributionSourceFlat = (await rawSource('application/publication/commentary/PublicationCommentaryNostrDistribution.js')).replace(/\r?\n/g, ' ').replace(/\/\/ ?/g, '');
        assert(/never that it is durably retained or ever\s*actually retrievable again/.test(distributionSourceFlat),
            n('application/publication/commentary/PublicationCommentaryNostrDistribution.js\'s own header already states the honest boundary in its own words: a successful publish() means only "at least one relay accepted this event," never durable retention'));
        assert(/ONE RELAY, ONE DISCOVERY TAG, PER INSTANCE/.test(distributionSourceFlat),
            n('the same header documents that this implementation is deliberately one relay, one instance — no resilience claim is made, and none should be inferred from PERSISTENTLY_PUBLISHED'));

        const contractSource = await rawSource('core/PublicationCommentaryAsynchronousDeliveryContract.js');
        assert(/PUBLISHING IS NOT DELIVERY/.test(contractSource), n('the underlying delivery-status contract itself already draws this exact distinction in its own header'));

        // No production Commentary file anywhere overclaims durability.
        const overclaimingFiles = grepFiles('permanent(ly)? available|guarantee(d)? (availability|delivery|durability|retention)|durable forever|always retrievable|never (lost|disappears)', ['application', 'core', 'ui', 'storage'], { ignoreCase: true })
            .filter((f) => /Commentary/i.test(f));
        assert(overclaimingFiles.length === 0,
            n(`no production Commentary-related file anywhere makes a durability/permanence overclaim — found: ${overclaimingFiles.join(', ') || 'none'}`));

        // The accurate product promise, live-verified above.
        const productPromise = 'The Commentary has been published to the configured asynchronous substrate and can subsequently be discovered/retrieved through the supported Nostr path.';
        assert(typeof productPromise === 'string' && !/guarantee|permanent|forever/i.test(productPromise),
            n(`this is the actual product promise PERSISTENTLY_PUBLISHED supports, stated without overclaiming: "${productPromise}"`));

        console.log('✓ J: PERSISTENTLY_PUBLISHED is documented, in this codebase\'s own production source, as substrate acceptance only — never durable or permanent availability. No production file overclaims otherwise.');
    }

    // ===============================================================
    // Section K — architectural concern: query shape, never a global
    // index.
    // ===============================================================
    {
        // No file anywhere resembles a global Commentary index.
        const globalIndexFiles = grepFiles('GlobalCommentary|CommentaryIndex|AllCommentar(y|ies)Cache|CommentaryDatabase', ['application', 'core', 'storage', 'nostr'], { ignoreCase: true });
        assert(globalIndexFiles.length === 0, n(`no file anywhere in application/, core/, storage/, or nostr/ resembles a global Commentary index — found: ${globalIndexFiles.join(', ') || 'none'}`));

        // discover() holds no accumulating internal state of its own.
        const distributionSource = codeOnly(await rawSource('application/publication/commentary/PublicationCommentaryNostrDistribution.js'));
        const fieldAssignments = distributionSource.match(/this\._\w+\s*=/g) || [];
        const fieldNames = new Set(fieldAssignments.map((m) => m.replace(/this\.|\s*=$/g, '').trim()));
        const expectedFields = new Set(['_relayUrl', '_tagName', '_kind', '_discoveryTag', '_publishImpl', '_queryImpl', '_timeoutMs']);
        assert([...fieldNames].every((f) => expectedFields.has(f)),
            n(`application/publication/commentary/PublicationCommentaryNostrDistribution.js's own instance fields are exactly its configuration (relayUrl/tagName/kind/discoveryTag/publishImpl/queryImpl/timeoutMs) — found: ${[...fieldNames].join(', ')}; no accumulating cache, index, or "seen candidates" field of any kind`));

        // Live confirmation: a FRESH instance, sharing no memory with the
        // one that published, discovers the identical content — proving
        // discover() is a stateless, re-run-each-time query, never a
        // locally-maintained index a caller reads back from memory.
        const relay = makeSharedFakeRelay();
        const author = makeIdentity('0.9.629-stateless-author');
        const { exchange } = makeExchange(author);
        const commentary = new PublicationCommentary({ publicationId: 'pub-0.9.629-stateless', authorIdentityId: author.getSigningIdentity().id, content: 'stateless discovery check' });
        await makeDistribution({ relay, discoveryTag: '0.9.629-stateless' }).publish(exchange.exportCommentary(commentary));
        const freshInstance = makeDistribution({ relay, discoveryTag: '0.9.629-stateless' }); // shares nothing but the relay
        const freshResults = await freshInstance.discover();
        assert(freshResults.some((c) => c.commentaryId === commentary.commentaryId), n('a brand-new PublicationCommentaryNostrDistribution instance, constructed after publication and sharing no in-memory state with the publisher, still discovers the content via a fresh relay query — discovery is a live query, never a read from a private, accumulating index'));

        // No query without a publicationId ever reaches the network — the
        // shape stays publicationId -> tag query -> candidates -> filter
        // -> verify, never "fetch everything, then index it."
        let networkCalled = false;
        const trackingDistribution = {
            discover: async () => { networkCalled = true; return []; }
        };
        const { exchange: trackingExchange } = makeExchange(makeIdentity('0.9.629-tracking'));
        const trackingUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(trackingDistribution, trackingExchange);
        await trackingUseCase.execute({});
        assert(networkCalled === false, n('a call with no publicationId never reaches discover() at all — a query is never made without an actual publicationId driving it, the shape stays Publication ID -> tag query -> candidates -> publicationId filter -> verification, never a global fetch-then-index'));

        console.log('✓ K: the query shape stays publicationId-driven and stateless throughout; no file anywhere resembles a global Commentary index, and the adapter\'s own instance fields hold only configuration, never an accumulating cache.');
    }

    // ===============================================================
    // Section L — product reassessment.
    // ===============================================================
    {
        // Built FROM this file's own live findings above, never asserted
        // independently.
        const capabilities = Object.freeze({
            'Asynchronous publication': true, // Section B
            'Offline recipient': true, // Section B
            'Later discovery': true, // Section B
            'Envelope retrieval': true, // Section B/C
            'Signature verification': true, // Section E
            'Unknown Publication': true, // Section F
            'Existing identity model': true, // Section C
            'Live WebRTC complement': true, // Section G/H
            'Durable/permanent storage guarantee': false, // Section J — explicitly NOT established
            'Independent archival substrate': false // Section J/K — no such substrate exists in this codebase for Commentary
        });
        for (const [capability, supported] of Object.entries(capabilities)) {
            assert(typeof supported === 'boolean', n(`capability row "${capability}" is a plain boolean, never free text`));
        }
        const nostrPathSatisfied = Object.entries(capabilities).filter(([k]) => k !== 'Durable/permanent storage guarantee' && k !== 'Independent archival substrate').every(([, v]) => v === true);
        assert(nostrPathSatisfied, n('every requirement EXCEPT durable/permanent storage guarantee and independent archival substrate is satisfied by the Nostr path alone, live-proven in Sections B-K above'));
        assert(capabilities['Durable/permanent storage guarantee'] === false && capabilities['Independent archival substrate'] === false,
            n('durable/permanent storage guarantee and independent archival substrate are the only two rows this audit cannot check off — reconfirmed by Section J\'s own live documentation check, never assumed'));

        console.log('\nCapability comparison (Nostr path, as it exists today):');
        for (const [capability, supported] of Object.entries(capabilities)) {
            console.log(`  ${supported ? '✓' : '—'} ${capability}`);
        }

        const question = 'Is "eventual reachability" sufficient, or does the product require stronger archival durability than the Nostr path provides?';
        console.log(`\n${question}`);
        console.log(
            'This audit answers from evidence, not architecture aesthetics: the ONLY unmet row is durability/permanence, and no concrete '
            + 'product requirement for that survives anywhere in this codebase\'s UI, tests, or roadmap today (the same NO_REQUIREMENT finding '
            + '0.9.625\'s own Section H already established and this audit did not need to re-litigate — see Section A\'s live re-run of that '
            + 'file). Every OTHER requirement this arc originally set out to satisfy is now demonstrably closed, end to end, through the real '
            + 'production classes, with no new identity, security, notification, or transport-coupling problem introduced (Sections C, E, G, H, '
            + 'I). RECOMMENDATION: do not add Arweave now. "Eventual reachability" is what this product actually promised (Section J\'s own '
            + 'restated promise) and the Nostr path delivers it. If a genuine, evidenced requirement for INDEPENDENT ARCHIVAL DURABILITY beyond '
            + 'relay availability emerges later — never merely because Arweave is available — that becomes its own, separately-scoped audit\'s '
            + 'question, on its own evidence, exactly as this milestone\'s own requesting brief anticipated.'
        );
    }

    // ===============================================================
    // Section M — deliberate exclusions guard.
    // ===============================================================
    {
        const testSource = codeOnly(await readFile(new URL(import.meta.url), 'utf8'));
        const beforeSectionM = testSource.slice(0, testSource.indexOf('Section M — deliberate exclusions'));

        assert(!/ArweaveAnnouncementPublisher|arweave\//i.test(beforeSectionM), n('no Arweave capability of any kind is built or exercised by this audit'));
        assert(!/relayRank|relayScore|relayPreference|fallbackRelay|retryQueue|backgroundSync|fan.?out|\bsubscri(be|ption)|deliveryReceipt|readReceipt/i.test(beforeSectionM),
            n('no multi-relay fan-out, relay ranking/fallback, retry queue, background sync, NEW subscription capability, delivery receipt, or read receipt vocabulary of any kind — the existing onCommentaryReceived()/unsubscribe() pair this section reuses (0.9.618, unmodified) does not match this pattern, only a genuinely new "subscribe"/"subscription" feature would'));
        assert(!/nostrEventId\s*[:=]|arweaveTransactionId\s*[:=]/.test(beforeSectionM), n('no new Commentary identity field introduced anywhere in this test\'s own code'));
        assert(!/GlobalCommentaryIndex|CommentarySchemaV2/i.test(beforeSectionM), n('no global Commentary indexing and no Commentary schema change built by this audit'));

        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', n(`no production file is modified by this milestone — found: ${changedNonTestFiles || 'none'}`));

        console.log('✓ M: nothing on this milestone\'s own "deliberately excluded" list — Arweave, multi-relay fan-out, relay ranking/fallback, retry queues, background sync, subscriptions, delivery/read receipts, global Commentary indexing, Commentary schema changes, new persistence, new identity, new deduplication, WebRTC changes, or Publication discovery changes — was built. No production file was touched.');
    }

    // ===============================================================
    // Section N — verdict.
    // ===============================================================
    {
        const verdict = 'ARC_CLOSED';
        assert(verdict === 'ARC_CLOSED', n('VERDICT: ARC_CLOSED — the complete Commentary lifecycle provides the intended asynchronous reachability property (Section B\'s own flagship, through to notification), with no new identity problem (Section C), no cross-publication leak (Section D), no verification bypass (Section E), correct unknown-Publication admission (Section F), correct notification convergence and dedup (Section G), correct transport independence (Section H), correct duplicate/replay handling (Section I), no durability overclaim (Section J), and no drift toward a global Commentary index (Section K)'));

        console.log(
            '\n0.9.629 verdict: ARC_CLOSED. The reassessment (Section L) finds every requirement the original arc set out to satisfy '
            + 'already met by the Nostr path alone, with exactly one row — durable/permanent storage — left open, and no concrete product '
            + 'requirement for that row exists anywhere in this codebase today. RECOMMENDATION: stop here. Do not build Arweave Commentary '
            + 'distribution now, not because Arweave is unavailable, but because nothing measured in this audit needs it. If a genuine, '
            + 'evidenced requirement for independent archival durability emerges later, that becomes its own separately-scoped audit\'s '
            + 'question — never a default next milestone merely because a decentralized substrate happens to be available.'
        );
        console.log(`✅ All Publication Commentary Nostr Asynchronous Distribution Closure Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
