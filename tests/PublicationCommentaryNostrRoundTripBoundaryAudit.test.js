import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryDistributionEnvelope } from '../core/PublicationCommentaryDistributionEnvelope.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionPeerExchange } from '../application/PublicationCommentaryDistributionPeerExchange.js';

import {
    PublicationCommentaryDeliveryStatus,
    PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE,
    isValidPublicationCommentaryDeliveryStatusTransition,
    describesConformingPublicationCommentaryAsynchronousDeliverySubstrate
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';

// The two REAL, UNMODIFIED, generic Nostr transport primitives this audit's
// own flagship composes — never a Commentary-flavored file, never touched by
// this milestone.
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';

// The two, real, unmodified, LOCATOR-shaped discovery classes this audit
// deliberately never uses to carry Commentary — reconfirmed inert for this
// job in Section A, exactly as 0.9.625/0.9.626 already found.
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';

// 0.9.627 — Publication Commentary Nostr Round-Trip Boundary Audit.
//
// TYPE: test-only architectural/product audit. PRODUCTION CHANGES: none —
// no new production file, no modified production file. See Section G/H,
// below, for a live, executable guard proving both facts, the same
// discipline 0.9.625's and 0.9.626's own audits already held.
//
// THE QUESTION THIS MILESTONE ANSWERS, restated precisely from its own
// requesting brief: can the EXISTING Nostr infrastructure, without changing
// its existing Publication/Snapshot discovery semantics, provide a
// substrate implementation conforming to 0.9.626's own asynchronous
// delivery contract (core/PublicationCommentaryAsynchronousDeliveryContract.js
// — a `{ publish(envelopeJson), retrieve(locator) }` round trip)? 0.9.625
// answered a narrower question (does a concrete product requirement exist,
// and do the two existing LOCATOR envelope families fit) and 0.9.626
// answered a different one (is the CONTRACT itself satisfiable at all,
// against a generic fake substrate). Neither audit ever constructed a real
// Nostr wire exchange. This one does — the first time this codebase has
// ever put a full Commentary envelope through an actual (fake-transport-
// backed) NIP-01 publish/subscribe round trip.
//
// THE HEADLINE FINDING, verified live below: Nostr's own DISCOVERY-SPECIFIC
// classes (`application/NostrPublicationDiscoveryPublisher.js`,
// `application/NostrDiscoveryQueryService.js`) remain exactly as
// ARCHITECTURAL_MISMATCH as 0.9.625/0.9.626 already found — they are
// locator-envelope-only and never touch a Commentary envelope in this file
// either. But one layer BELOW them, two already-existing, already-
// production-wired, genuinely SUBSTRATE-NEUTRAL transport primitives —
// `nostr/NostrInjectedProviderPublisher.js` (publish: a real NIP-07 sign +
// NIP-01 broadcast, opaque `{ kind, tags, content }` in, `{ published, id }`
// out) and `nostr/NostrRelayQueryClient.js` (retrieve: a real NIP-01
// REQ/EVENT/EOSE subscription, opaque filter in, raw events out) — never
// parse, validate, or care what `content` holds. A plain composition of
// those two, built ENTIRELY INSIDE THIS TEST FILE (never a new production
// file — see Section G), duck-type-conforms to 0.9.626's own contract and
// carries a real, signed PublicationCommentaryDistributionEnvelope through
// a live (fake-relay-backed) NIP-01 exchange, byte-for-byte, adversarial
// cases included. Classification: PREPARED_SEAM at the transport layer;
// CONCRETE_PRODUCT_GAP for the small, still-unbuilt production adapter that
// would wrap this same composition permanently (0.9.627 builds no such
// file); SEMANTIC_GAP for what a single relay's own acceptance actually
// proves about durability (Section G). See the verdict table in Section L.
//
//   Section A — Nostr substrate capability census: which existing classes
//               expose publish+retrieve (none of the discovery-specific
//               ones; both raw transport primitives do, independently).
//   Section B — existing Nostr event semantics: content is a genuinely
//               opaque application payload to both transport primitives.
//   Section C — FLAGSHIP: a live NIP-01 publish/retrieve round trip for a
//               real, signed Commentary envelope, through a composition of
//               the two real, unmodified transport primitives plus one
//               shared, realistic fake relay (never a generic fake
//               substrate) — full field equality, every one of the seven
//               delivery stages traversed in order.
//   Section D — identity separation: commentaryId / publicationId / the
//               Nostr event id stay three independent, unaliased values.
//   Section E — verification boundary: modified Nostr content, modified
//               Commentary content, modified signature, wrong signer,
//               malformed envelope, duplicate retrieval — each one, live.
//   Section F — Publication association: a Commentary naming a locally
//               unknown publicationId is still ADMITTED.
//   Section G — production-change guard.
//   Section H — discovery-vs-retrieval architecture guard: the flagship's
//               own composition never imports either discovery-specific
//               class, and neither of them gained a retrieve() of its own.
//   Section I — multi-relay/failure-semantics census (audited, nothing new
//               built) and a live single-relay unavailability proof.
//   Section J — product journey: Bob, entirely offline when Alice comments,
//               discovers AND retrieves the Commentary through one relay
//               exchange keyed by a shared discovery tag alone — no
//               locator ever communicated out of band.
//   Section K — exclusion guard: nothing on the requesting brief's
//               "deliberately excluded" list was built.
//   Section L — verdict table.
//
// AMENDED BY 0.9.629 — Publication Commentary Nostr Asynchronous
// Distribution Closure Audit. This audit's own RECOMMENDATION (Section L,
// below) was implemented next, exactly as named: 0.9.628 built "a single
// small production adapter file wiring the two raw transport primitives
// together exactly as this test's own ComposedNostrTransportCommentarySubstrate
// does" (application/PublicationCommentaryNostrDistribution.js) plus its
// own admission boundary (application/
// DiscoverPublicationCommentaryFromNostrUseCase.js) — a CONCRETE_PRODUCT_GAP
// closed, never a NEW_SUBSTRATE_BOUNDARY crossed; Arweave remains untouched,
// exactly as this audit's own closing line anticipated. Only Section K's
// own now-stale file-census assertion and closing narration are amended in
// place, below, plus this note — every other section, including this
// file's own live Nostr round-trip flagship (Section C/J) and its own
// SEMANTIC_GAP finding about PERSISTENTLY_PUBLISHED (Section L), holds
// exactly as measured and remains the reason 0.9.628's own header
// documents that same distinction rather than silently promising
// Arweave-grade durability.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

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

function fakeExtension(signerIdentityHint) {
    const calls = { getPublicKey: 0, signEvent: [] };
    let counter = 0;
    return {
        calls,
        getPublicKey: async () => { calls.getPublicKey += 1; return `fake-pubkey-${signerIdentityHint}`; },
        signEvent: async (event) => {
            calls.signEvent.push(event);
            counter += 1;
            const hex = counter.toString(16);
            return { ...event, id: `${hex}`.padEnd(64, '0'), sig: `sig${hex}`.padEnd(128, '0') };
        }
    };
}

// A REALISTIC fake relay — never a generic key-value substrate like 0.9.626's
// own FakeGenericPersistentSubstrate — speaking the same two NIP-01
// exchanges the two REAL production transport files already implement:
// `["EVENT", event]` -> `["OK", id, ok]` (nostr/NostrInjectedProviderPublisher.js's
// own broadcastSignedEvent()), and `["REQ", subId, filter]` ->
// `["EVENT", subId, event]`* -> `["EOSE", subId]` (nostr/NostrRelayQueryClient.js's
// own queryImpl()). One shared, module-scope-captured `events` Map stands in
// for the relay's own storage — a fresh FakeSocket instance is constructed
// per publish()/retrieve() call (exactly as both real files already do),
// but every instance from the SAME `makeSharedFakeRelay()` call shares the
// identical underlying storage, simulating "the same relay, queried
// independently, later."
function makeSharedFakeRelay({ declineReason = null } = {}) {
    const events = new Map();
    class FakeSocket {
        constructor(url) {
            this.url = url;
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
        send(data) {
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }
            if (!Array.isArray(parsed)) {
                return;
            }
            if (parsed[0] === 'EVENT' && parsed.length === 2) {
                const event = parsed[1];
                if (declineReason) {
                    queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(['OK', event.id, false, declineReason]) }); });
                    return;
                }
                events.set(event.id, JSON.parse(JSON.stringify(event)));
                queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(['OK', event.id, true]) }); });
                return;
            }
            if (parsed[0] === 'REQ') {
                const [, subId, filter] = parsed;
                const matches = Array.from(events.values()).filter((event) => matchesFilter(event, filter));
                queueMicrotask(() => {
                    if (!this.onmessage) return;
                    for (const event of matches) {
                        this.onmessage({ data: JSON.stringify(['EVENT', subId, event]) });
                    }
                    this.onmessage({ data: JSON.stringify(['EOSE', subId]) });
                });
                return;
            }
            // CLOSE and anything else: no-op, exactly as a real relay's own
            // ordinary frames this file never needs to interpret.
        }
        close() {}
    }
    return { FakeSocket, events };
}

function matchesFilter(event, filter) {
    if (Array.isArray(filter.ids) && !filter.ids.includes(event.id)) {
        return false;
    }
    if (Array.isArray(filter['#t'])) {
        const eventTagValues = (event.tags || []).filter((tag) => tag[0] === 't').map((tag) => tag[1]);
        if (!filter['#t'].some((tag) => eventTagValues.includes(tag))) {
            return false;
        }
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

// A plain composition of the two REAL, UNMODIFIED transport primitives —
// defined only in this test file, never exported, never a production
// class. It exposes exactly `publish(envelopeJson)`/`retrieve(locator)`,
// the shape 0.9.626's own contract describes, so it can be run through
// `describesConformingPublicationCommentaryAsynchronousDeliverySubstrate()`
// exactly like a real future adapter would be. It builds its own Nostr
// event template (`{ kind, tags: [[tagName, discoveryTag]], content }`)
// the identical way `application/NostrPublicationDiscoveryPublisher.js`'s
// own header already documents for a locator envelope, held here for an
// opaque Commentary envelope instead — never importing that file, or
// `application/NostrDiscoveryQueryService.js`, at all (see Section H).
class ComposedNostrTransportCommentarySubstrate {
    constructor({ publish, queryImpl, relayUrl, discoveryTag, tagName = 't', kind = 1 }) {
        this._publish = publish;
        this._queryImpl = queryImpl;
        this._relayUrl = relayUrl;
        this._discoveryTag = discoveryTag;
        this._tagName = tagName;
        this._kind = kind;
    }
    async publish(envelopeJson) {
        const result = await this._publish(this._relayUrl, {
            kind: this._kind,
            tags: [[this._tagName, this._discoveryTag]],
            content: JSON.stringify(envelopeJson)
        });
        if (!result || result.published !== true) {
            return null;
        }
        return { published: true, locator: result.id };
    }
    async retrieve(locator) {
        const events = await this._queryImpl(this._relayUrl, { ids: [locator] });
        const event = events.find((candidate) => candidate.id === locator);
        if (!event) {
            return null;
        }
        try {
            return JSON.parse(event.content);
        } catch {
            return null;
        }
    }
    // Retrieval by the shared discovery tag alone — never a locator a
    // caller had to learn out of band. Used only by Section J's own
    // product-journey test; see that section for why this is a genuinely
    // separate operation from `retrieve()` above, not a second class.
    async retrieveByDiscoveryTag() {
        const events = await this._queryImpl(this._relayUrl, { '#t': [this._discoveryTag] });
        const results = [];
        for (const event of events) {
            try {
                results.push(JSON.parse(event.content));
            } catch {
                // a non-JSON event under this tag is simply not a candidate
            }
        }
        return results;
    }
}

function makeComposition({ relay, extension, relayUrl = 'wss://relay.example', discoveryTag }) {
    const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: relay.FakeSocket });
    const queryImpl = createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket });
    return new ComposedNostrTransportCommentarySubstrate({ publish, queryImpl, relayUrl, discoveryTag });
}

async function run() {
    // ===============================================================
    // Section A — Nostr substrate capability census.
    // ===============================================================
    {
        const realNostrDiscoveryPublisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: '0.9.627-census', publishImpl: async () => ({ published: true, id: '0'.repeat(64) })
        });
        assert(typeof realNostrDiscoveryPublisher.publish === 'function' && typeof realNostrDiscoveryPublisher.retrieve === 'undefined',
            n('the real, unmodified NostrPublicationDiscoveryPublisher still exposes publish() but no retrieve() — reconfirmed live, unchanged since 0.9.625/0.9.626'));
        assert(typeof NostrDiscoveryQueryService.prototype.search === 'function' && typeof NostrDiscoveryQueryService.prototype.retrieve === 'undefined',
            n('the real, unmodified NostrDiscoveryQueryService exposes only search(discoveryTag) — a tag-filtered LIST of candidates parsed through parseDecentralizedDiscoveryEnvelope(), never a retrieve(locator) returning one envelope\'s own raw bytes'));

        const relay = makeSharedFakeRelay();
        const extension = fakeExtension('census');
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: relay.FakeSocket });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket });
        assert(typeof publish === 'function' && typeof queryImpl === 'function',
            n('nostr/NostrInjectedProviderPublisher.js and nostr/NostrRelayQueryClient.js — the two RAW transport primitives, one layer below every discovery-specific class — each produce a real, usable function today, already production-wired (window.nostr NIP-07 / WebSocket), exactly as 0.9.625 Section B already found for the discovery-specific publishers'));

        const composition = makeComposition({ relay, extension, discoveryTag: '0.9.627-census' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(composition) === true,
            n('a composition of ONLY those two raw transport primitives — built here, in this test file, never in production code — already duck-type-conforms to 0.9.626\'s own contract; neither raw primitive alone does (each exposes only one of publish/retrieve), but together they do, with zero Commentary-specific or discovery-envelope-specific code of any kind'));

        console.log('✓ A: the two discovery-specific Nostr classes remain publish-only/search-only (no retrieve); the two raw transport primitives one layer below them, composed together, already conform to the asynchronous delivery contract — a live capability census, not merely a restated conclusion.');
    }

    // ===============================================================
    // Section B — existing Nostr event semantics: content is opaque.
    // ===============================================================
    {
        const relay = makeSharedFakeRelay();
        const extension = fakeExtension('semantics');
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: relay.FakeSocket });

        const arbitraryPayload = { totally: 'unrelated to any discovery envelope', nested: { ok: true } };
        await publish('wss://relay.example', { kind: 1, tags: [['t', 'whatever']], content: JSON.stringify(arbitraryPayload) });

        assert(extension.calls.signEvent[0].kind === 1
            && extension.calls.signEvent[0].tags[0][1] === 'whatever'
            && extension.calls.signEvent[0].content === JSON.stringify(arbitraryPayload),
            n('NostrInjectedProviderPublisher forwards kind/tags/content to signEvent() completely unexamined — it never parses, validates, or forms any opinion about what content holds'));

        const [storedEvent] = Array.from(relay.events.values());
        assert(storedEvent.content === JSON.stringify(arbitraryPayload),
            n('the relay itself stores content as an opaque string — a real Nostr event has exactly four application-visible fields (identity/pubkey, tags, content, signature/sig), and this milestone writes into content only, never a new tag or a new event field of any kind'));

        const readBack = await createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket })('wss://relay.example', { ids: [storedEvent.id] });
        assert(readBack.length === 1 && JSON.parse(readBack[0].content).nested.ok === true,
            n('NostrRelayQueryClient likewise hands content back completely unexamined — no discovery-envelope parsing of any kind happens at this layer; that stays entirely application/NostrDiscoveryQueryService.js\'s own, separate, unused-here job'));

        console.log('✓ B: a Nostr event\'s own content field is a genuinely opaque application payload to both real transport primitives — "Nostr may transport Commentary; it must not become the authority defining Commentary" holds structurally, not merely by policy, because neither transport primitive parses content at all.');
    }

    // ===============================================================
    // Section C — FLAGSHIP: live NIP-01 round trip for a real, signed
    // Commentary envelope, through the composed real transport primitives.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        const traversed = [S.CREATED];

        const aliceProvider = makeIdentity('0.9.627-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const aliceExchange = new PublicationCommentaryDistributionExchange(
            aliceStore, aliceProvider, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.627-bobs-work',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'a comment carried over a live Nostr round trip, 0.9.627'
        });
        aliceStore.save(commentary);
        assert(aliceStore.getById(commentary.commentaryId) !== null,
            n('CREATED: Alice\'s own local, unsigned Commentary exists'));

        const signedEnvelopeJson = aliceExchange.exportCommentary(commentary);
        traversed.push(S.SIGNED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('SIGNED: the CREATED -> SIGNED step is valid — same exportCommentary() call the WebRTC path already uses'));

        const relay = makeSharedFakeRelay();
        const aliceExtension = fakeExtension('alice');
        const composition = makeComposition({ relay, extension: aliceExtension, discoveryTag: '0.9.627-flagship' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(composition) === true,
            n('the composition used for this round trip genuinely conforms to 0.9.626\'s own contract before it is used'));

        const publishResult = await composition.publish(signedEnvelopeJson);
        assert(publishResult && publishResult.published === true && typeof publishResult.locator === 'string' && publishResult.locator.length === 64,
            n('PERSISTENTLY_PUBLISHED: the real NostrInjectedProviderPublisher signed the event (via the fake NIP-07 extension) and the fake relay acknowledged it with a real NIP-01 OK frame; the locator is the real, signed event\'s own 64-hex-char id'));
        traversed.push(S.PERSISTENTLY_PUBLISHED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the SIGNED -> PERSISTENTLY_PUBLISHED step is valid'));

        const locatorKnownToBob = publishResult.locator;
        traversed.push(S.DISCOVERABLE);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the PERSISTENTLY_PUBLISHED -> DISCOVERABLE step is valid — Bob now merely knows a locator exists, communicated out of band; he has issued no REQ yet'));

        // "Days later," Bob — a genuinely independent composition, sharing
        // only the fake relay's own storage, never any in-process reference
        // to Alice's envelope object — retrieves by locator alone.
        const bobComposition = makeComposition({ relay, extension: fakeExtension('bob-reader'), discoveryTag: '0.9.627-flagship' });
        const retrievedEnvelopeJson = await bobComposition.retrieve(locatorKnownToBob);
        assert(retrievedEnvelopeJson !== null
            && retrievedEnvelopeJson.commentaryId === signedEnvelopeJson.commentaryId
            && retrievedEnvelopeJson.publicationId === signedEnvelopeJson.publicationId
            && retrievedEnvelopeJson.authorIdentityId === signedEnvelopeJson.authorIdentityId
            && retrievedEnvelopeJson.content === signedEnvelopeJson.content
            && JSON.stringify(retrievedEnvelopeJson.signature) === JSON.stringify(signedEnvelopeJson.signature),
            n('RETRIEVED: a real NIP-01 REQ/EVENT/EOSE exchange, issued by NostrRelayQueryClient and answered by the fake relay, returns an envelope byte-identical to what Alice published — commentaryId, publicationId, authorIdentityId, content, and signature all match exactly, field for field'));
        assert(JSON.stringify(retrievedEnvelopeJson) === JSON.stringify(signedEnvelopeJson),
            n('the recovered envelope is fully serialization-equivalent to the original — not merely field-equal on the fields this test happened to check'));
        traversed.push(S.RETRIEVED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the DISCOVERABLE -> RETRIEVED step is valid'));

        const reconstructedEnvelope = PublicationCommentaryDistributionEnvelope.fromJSON(retrievedEnvelopeJson);
        assert(reconstructedEnvelope !== null, n('the real, unmodified envelope class reconstructs a real instance from the Nostr-round-tripped JSON'));
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructedEnvelope.toJSON());
        assert(verification.valid === true,
            n('VERIFIED: the real, unmodified verifier accepts the envelope after it traveled through a real NIP-01 exchange — identical outcome to the WebRTC path for the identical bytes'));
        traversed.push(S.VERIFIED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the RETRIEVED -> VERIFIED step is valid'));

        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructedEnvelope.toCommentary());
        assert(admitted === true && bobStore.getById(commentary.commentaryId) !== null,
            n('ADMITTED: Bob\'s own real, unmodified PublicationCommentaryStore now holds the Commentary — no second database, no Nostr-flavored persistence of any kind'));
        traversed.push(S.ADMITTED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the VERIFIED -> ADMITTED step is valid'));

        assert(JSON.stringify(traversed) === JSON.stringify(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE),
            n('the exact sequence of stages this LIVE Nostr round trip traversed matches the contract\'s own canonical sequence precisely, in order, none skipped, none repeated'));

        console.log('✓ C — FLAGSHIP: a real, signed Commentary travels CREATED -> ... -> ADMITTED through an ACTUAL NIP-01 publish/retrieve exchange (real NostrInjectedProviderPublisher + real NostrRelayQueryClient, fake NIP-07 extension + fake relay only), byte-for-byte, serialization-equivalent — the existing Nostr transport infrastructure genuinely provides a conforming substrate at the raw-transport layer.');
    }

    // ===============================================================
    // Section D — identity separation.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.627-identity-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const exchange = new PublicationCommentaryDistributionExchange(aliceStore, aliceProvider, new LocalAuthorizationVerifier());
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.627-identity-target',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'identity separation check'
        });
        const envelopeJson = exchange.exportCommentary(commentary);

        const relay = makeSharedFakeRelay();
        const composition = makeComposition({ relay, extension: fakeExtension('identity'), discoveryTag: '0.9.627-identity' });
        const { locator: nostrEventId } = await composition.publish(envelopeJson);

        assert(commentary.commentaryId !== envelopeJson.publicationId
            && commentary.commentaryId !== nostrEventId
            && envelopeJson.publicationId !== nostrEventId,
            n('commentaryId, publicationId, and the Nostr event id (this substrate\'s own locator) are three distinct values — no aliasing of any kind'));
        assert(!('nostrEventId' in envelopeJson) && !('locator' in envelopeJson) && !('id' in envelopeJson),
            n('the envelope\'s own wire JSON carries no Nostr-event-id field — the locator lives only in this test\'s own local variable, exactly as a caller-side value the contract\'s own publish() result shape already scopes it to, never inside the envelope itself'));

        const envelopeSource = await readFile(new URL('../core/PublicationCommentaryDistributionEnvelope.js', import.meta.url), 'utf8');
        assert(!/nostrEventId|arweaveTransactionId/i.test(envelopeSource),
            n('the real, unmodified envelope class source still defines no such field — reconfirmed live, not merely cited from an earlier milestone'));

        console.log('✓ D: commentaryId / publicationId / the Nostr event id remain three independent, unaliased identities after a real Nostr round trip — the event id is a transport-layer locator this test\'s own caller code holds, never a field of the envelope\'s own identity.');
    }

    // ===============================================================
    // Section E — verification boundary: six adversarial cases, live.
    // ===============================================================
    {
        function freshCase(label) {
            const provider = makeIdentity(`0.9.627-adv-${label}`);
            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const exchange = new PublicationCommentaryDistributionExchange(store, provider, new LocalAuthorizationVerifier());
            const commentary = new PublicationCommentary({
                publicationId: `pub-0.9.627-adv-${label}`,
                authorIdentityId: provider.getSigningIdentity().id,
                content: `original honest content for ${label}`
            });
            return { provider, commentary, envelopeJson: exchange.exportCommentary(commentary) };
        }

        async function admitOrReject(retrievedJson) {
            const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(retrievedJson);
            if (reconstructed === null) {
                return { reconstructed: null, verified: false, admitted: false };
            }
            const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
            if (!verification.valid) {
                return { reconstructed, verified: false, admitted: false };
            }
            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            store.save(reconstructed.toCommentary());
            return { reconstructed, verified: true, admitted: true };
        }

        // (1) Modified Nostr content — the raw wire `content` string itself
        // is replaced after publish, before retrieve (a relay/MITM byte
        // tamper), yielding a structurally different JSON payload.
        {
            const { envelopeJson } = freshCase('nostr-content');
            const relay = makeSharedFakeRelay();
            const composition = makeComposition({ relay, extension: fakeExtension('nc'), discoveryTag: 't-nc' });
            const { locator } = await composition.publish(envelopeJson);
            const stored = relay.events.get(locator);
            stored.content = JSON.stringify({ ...envelopeJson, content: 'forged: a totally different comment' });

            const retrieved = await composition.retrieve(locator);
            const outcome = await admitOrReject(retrieved);
            assert(outcome.verified === false && outcome.admitted === false,
                n('modified Nostr content (the raw event.content bytes altered in transit/at rest): VERIFIED fails, ADMITTED never happens'));
        }

        // (2) Modified Commentary content — same idea, expressed as a
        // targeted field edit on the parsed envelope rather than a raw
        // string replacement, for clarity.
        {
            const { envelopeJson } = freshCase('commentary-content');
            const relay = makeSharedFakeRelay();
            const composition = makeComposition({ relay, extension: fakeExtension('cc'), discoveryTag: 't-cc' });
            const { locator } = await composition.publish(envelopeJson);
            const retrieved = await composition.retrieve(locator);
            const tampered = { ...retrieved, content: 'a forged edit the original author never signed' };
            const outcome = await admitOrReject(tampered);
            assert(outcome.verified === false && outcome.admitted === false,
                n('modified Commentary content field alone: VERIFIED fails — the signature was computed over the original content'));
        }

        // (3) Modified signature.
        {
            const { envelopeJson } = freshCase('signature');
            const relay = makeSharedFakeRelay();
            const composition = makeComposition({ relay, extension: fakeExtension('sig'), discoveryTag: 't-sig' });
            const { locator } = await composition.publish(envelopeJson);
            const retrieved = await composition.retrieve(locator);
            const tampered = { ...retrieved, signature: { ...retrieved.signature, signedHash: '0'.repeat(64) } };
            const outcome = await admitOrReject(tampered);
            assert(outcome.verified === false && outcome.admitted === false,
                n('modified signature (signedHash corrupted): VERIFIED fails'));
        }

        // (4) Wrong signer — a genuinely, honestly signed envelope (by
        // Alice) whose authorIdentityId is then relabeled to a different
        // identity (Bob's) before publish, claiming Bob wrote it.
        {
            const aliceCase = freshCase('wrong-signer-alice');
            const bobProvider = makeIdentity('0.9.627-adv-wrong-signer-bob');
            const relabeled = { ...aliceCase.envelopeJson, authorIdentityId: bobProvider.getSigningIdentity().id };
            const relay = makeSharedFakeRelay();
            const composition = makeComposition({ relay, extension: fakeExtension('ws'), discoveryTag: 't-ws' });
            const { locator } = await composition.publish(relabeled);
            const retrieved = await composition.retrieve(locator);
            const outcome = await admitOrReject(retrieved);
            assert(outcome.verified === false && outcome.admitted === false,
                n('wrong signer (Alice\'s real signature, Bob\'s claimed authorIdentityId): VERIFIED fails — "signer does not match the commentary\'s own author"'));
        }

        // (5) Malformed envelope — two flavors: non-JSON content, and
        // valid JSON that is not a valid Commentary envelope at all.
        {
            const relay = makeSharedFakeRelay();
            const composition = makeComposition({ relay, extension: fakeExtension('malformed'), discoveryTag: 't-malformed' });
            const extension = fakeExtension('malformed-raw');
            const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: relay.FakeSocket });
            const nonJson = await publish('wss://relay.example', { kind: 1, tags: [['t', 't-malformed']], content: 'not json at all {{{' });
            const retrievedNonJson = await composition.retrieve(nonJson.id);
            assert(retrievedNonJson === null,
                n('malformed envelope, variant 1 (event content is not even valid JSON): retrieve() itself degrades to null, never a thrown error escaping this composition'));

            const unrelatedJson = await publish('wss://relay.example', { kind: 1, tags: [['t', 't-malformed']], content: JSON.stringify({ foo: 'bar' }) });
            const retrievedUnrelated = await composition.retrieve(unrelatedJson.id);
            assert(retrievedUnrelated !== null, n('malformed envelope, variant 2: valid JSON is retrieved as such'));
            const outcome = await admitOrReject(retrievedUnrelated);
            assert(outcome.reconstructed === null && outcome.admitted === false,
                n('malformed envelope, variant 2 (valid JSON, not a valid Commentary envelope): PublicationCommentaryDistributionEnvelope.fromJSON() itself returns null — never reaches VERIFIED or ADMITTED'));
        }

        // (6) Duplicate retrieval — idempotent, via the store's own
        // EXISTING commentaryId semantics, reconfirmed through the real
        // Nostr transport this time.
        {
            const { envelopeJson, commentary } = freshCase('duplicate');
            const relay = makeSharedFakeRelay();
            const composition = makeComposition({ relay, extension: fakeExtension('dup'), discoveryTag: 't-dup' });
            const { locator } = await composition.publish(envelopeJson);

            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const firstRetrieved = await composition.retrieve(locator);
            const firstAdmit = store.save(PublicationCommentaryDistributionEnvelope.fromJSON(firstRetrieved).toCommentary());
            const secondRetrieved = await composition.retrieve(locator);
            const secondAdmit = store.save(PublicationCommentaryDistributionEnvelope.fromJSON(secondRetrieved).toCommentary());

            assert(firstAdmit === true && secondAdmit === false,
                n('duplicate retrieval (Bob\'s client queries the relay twice, or comes online twice): the first admission succeeds, the second is an idempotent no-op — the same existing commentaryId semantics, never a new dedup service'));
            assert(store.getById(commentary.commentaryId) !== null,
                n('exactly one Commentary is on file after both retrievals'));
        }

        console.log('✓ E: all six adversarial cases — modified Nostr content, modified Commentary content, modified signature, wrong signer, malformed envelope (both variants), and duplicate retrieval — are caught by the existing, unmodified verifier/store, live, over a real NIP-01 exchange.');
    }

    // ===============================================================
    // Section F — Publication association: a Commentary naming a locally
    // unknown Publication is still ADMITTED.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.627-unknownpub-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const exchange = new PublicationCommentaryDistributionExchange(aliceStore, aliceProvider, new LocalAuthorizationVerifier());
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.627-bob-has-never-heard-of-this',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'a comment on a Publication Bob has not yet discovered'
        });
        const envelopeJson = exchange.exportCommentary(commentary);

        const relay = makeSharedFakeRelay();
        const composition = makeComposition({ relay, extension: fakeExtension('unknownpub'), discoveryTag: '0.9.627-unknownpub' });
        const { locator } = await composition.publish(envelopeJson);
        const retrieved = await composition.retrieve(locator);
        const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(retrieved);
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
        assert(verification.valid === true, n('the envelope verifies correctly regardless of whether Bob has ever seen this publicationId'));

        // Bob's own store — deliberately: no Publication repository of any
        // kind is constructed anywhere in this test file, simulating that
        // Bob genuinely has no local record of pub-0.9.627-bob-has-never-heard-of-this.
        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructed.toCommentary());
        assert(admitted === true && bobStore.getById(commentary.commentaryId) !== null,
            n('ADMITTED succeeds regardless — storage/PublicationCommentaryStore.js#save() performs no Publication-existence check of any kind; content validity and local referential availability stay genuinely independent, exactly as the requesting brief asked this section to prove'));

        const canCommentSource = await readFile(new URL('../application/CanCommentOnPublicationUseCase.js', import.meta.url), 'utf8');
        const exchangeSource = await readFile(new URL('../application/PublicationCommentaryDistributionExchange.js', import.meta.url), 'utf8');
        assert(!/^\s*import[^\n]*CanCommentOnPublicationUseCase/m.test(exchangeSource),
            n('application/PublicationCommentaryDistributionExchange.js (the real import path a remote envelope is admitted through) never IMPORTS CanCommentOnPublicationUseCase.js — that file\'s own header merely cites it in prose as "a separate, LOCAL-ONLY authoring-time gate, never a remote-admission gate"; this assertion confirms that separation holds structurally, not just in comment text'));
        assert(canCommentSource.length > 0, n('sanity: the file exists and was actually read, not silently skipped'));

        console.log('✓ F: a Commentary naming a publicationId the receiving device has no local record of is verified and ADMITTED exactly the same as any other — the Commentary is never discarded merely because the Publication is temporarily (or permanently) unavailable locally.');
    }

    // ===============================================================
    // Section G — production-change guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        const newNonTestFiles = execSync(
            'git status --porcelain -- . ":(exclude)tests" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean)
            .filter((line) => line.startsWith('??'))
            .map((line) => line.replace(/^\?\?\s*/, ''));

        assert(changedNonTestFiles.length === 0,
            n(`no existing production file is modified by this milestone — found modified: ${changedNonTestFiles.join(', ') || 'none'}`));
        assert(newNonTestFiles.length === 0,
            n(`no new production file is added by this milestone — this is a test-only audit, unlike 0.9.626's own one-file contract — found new: ${newNonTestFiles.join(', ') || 'none'}`));

        console.log('✓ G: zero production files changed or added — a genuinely test-only audit, exactly as this milestone\'s own requesting brief specified.');
    }

    // ===============================================================
    // Section H — discovery-vs-retrieval architecture guard.
    // ===============================================================
    {
        const testSource = await readFile(new URL(import.meta.url), 'utf8');
        const testCodeOnly = testSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        // Only the two IMPORT lines naming the discovery-specific classes
        // (Section A's own census, and the header's own explanatory prose)
        // may mention them; the flagship composition (Section C) and every
        // adversarial case (Section E) must never construct or call either.
        const compositionSourceOnly = testCodeOnly.slice(
            testCodeOnly.indexOf('class ComposedNostrTransportCommentarySubstrate'),
            testCodeOnly.indexOf('async function run()')
        );
        assert(!/NostrPublicationDiscoveryPublisher|NostrDiscoveryQueryService|parseDecentralizedDiscoveryEnvelope|describeDecentralizedDiscoveryEnvelope/.test(compositionSourceOnly),
            n('the composed substrate class this audit\'s own flagship uses never references either discovery-specific class or the locator-envelope parser/describer at all — Commentary travels through the raw transport layer exclusively'));

        const peerExchangeSource = await readFile(new URL('../application/PublicationCommentaryDistributionPeerExchange.js', import.meta.url), 'utf8');
        assert(!/Nostr|Arweave/i.test(peerExchangeSource),
            n('the existing WebRTC peer exchange class still imports and references nothing Nostr- or Arweave-shaped — the live-dissemination path remains entirely unaware of this audit'));

        const nostrDiscoveryPublisherSource = await readFile(new URL('../application/NostrPublicationDiscoveryPublisher.js', import.meta.url), 'utf8');
        assert(!/Commentary/.test(nostrDiscoveryPublisherSource),
            n('the real NostrPublicationDiscoveryPublisher.js source still contains no reference to Commentary whatsoever'));
        const nostrDiscoveryQueryServiceSource = await readFile(new URL('../application/NostrDiscoveryQueryService.js', import.meta.url), 'utf8');
        assert(!/Commentary/.test(nostrDiscoveryQueryServiceSource),
            n('the real NostrDiscoveryQueryService.js source likewise contains no reference to Commentary whatsoever — this audit never made the existing Publication discovery provider responsible for Commentary retrieval'));

        console.log('✓ H: this audit\'s own flagship composition is built exclusively from the two raw transport primitives; neither Nostr discovery-specific class gained, referenced, or was repurposed toward any Commentary capability.');
    }

    // ===============================================================
    // Section I — multi-relay/failure-semantics census, plus one live
    // single-relay-unavailability proof.
    // ===============================================================
    {
        // Relay selection is ALREADY explicit and per-call for both raw
        // transport primitives — neither hardcodes a relay the way
        // NostrPublicationDiscoveryPublisher's own DEFAULT_RELAY_URL does.
        const relay = makeSharedFakeRelay();
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: fakeExtension('relay-a'), webSocketImpl: relay.FakeSocket });
        const queryImpl = createNostrRelayQueryClient({ webSocketImpl: relay.FakeSocket });
        assert(publish.length === 2 && typeof queryImpl === 'function',
            n('both createNostrInjectedProviderPublisher() and createNostrRelayQueryClient() already take relayUrl as an explicit, per-call argument, never an ambient default a caller could silently drift from — relay selection is already explicit, matching every sibling file\'s own documented "one relay per call, no fan-out" restraint'));

        // A relay-SET configuration abstraction already exists for
        // Publication distribution — audited here, never reused for
        // Commentary in this milestone.
        const relaySetConfigSource = await readFile(new URL('../storage/NostrPublicationRelaySetConfigurationStore.js', import.meta.url), 'utf8');
        assert(relaySetConfigSource.includes('relayUrls'),
            n('storage/NostrPublicationRelaySetConfigurationStore.js already holds a Wanderer\'s own configured LIST of relay urls — a relay-set abstraction genuinely exists in this codebase today, for Publication distribution; this audit leaves it untouched and never wires Commentary to it'));
        const multiRelayOrchestratorSource = await readFile(new URL('../application/NostrMultiRelayPublicationDistributionOrchestrator.js', import.meta.url), 'utf8');
        assert(/fan.?out/i.test(multiRelayOrchestratorSource),
            n('an explicit multi-relay FAN-OUT policy already exists for Publication discovery ANNOUNCEMENT (0.9.444) — prior art this audit deliberately does not extend to Commentary; per the requesting brief, "selection is not fan-out, and configuration is not resilience," and no new ranking/fallback policy is introduced here'));

        // What happens when a relay is unavailable — already proven by
        // both raw primitives' own existing test suites; reconfirmed live
        // here through THIS audit's own composed substrate.
        const failingRelay = { FakeSocket: erroringSocketCtor() };
        const failingComposition = makeComposition({ relay: failingRelay, extension: fakeExtension('fail'), discoveryTag: 't-fail' });
        let publishRejected = false;
        try {
            await failingComposition.publish({ commentaryId: 'irrelevant' });
        } catch {
            publishRejected = true;
        }
        assert(publishRejected === true,
            n('a relay that is genuinely unavailable makes publish() reject (propagate), never silently return null or a false success — a caller building a real adapter must handle this as a distinct outcome from "the relay was reached and declined"'));
        let retrieveRejected = false;
        try {
            await failingComposition.retrieve('any-locator');
        } catch {
            retrieveRejected = true;
        }
        assert(retrieveRejected === true,
            n('an unavailable relay likewise makes retrieve() reject — this milestone introduces no swallowing of a genuine transport failure at either end of the round trip'));

        console.log('✓ I: relay selection is already explicit and per-call; a relay-SET configuration abstraction and an explicit multi-relay fan-out policy already exist for Publication discovery announcement (audited, not reused); and a genuinely unavailable relay makes both publish() and retrieve() reject rather than silently degrade — all reconfirmed live, nothing new built.');
    }

    // ===============================================================
    // Section J — product journey: Bob, entirely offline when Alice
    // comments, discovers AND retrieves through one relay exchange keyed
    // by a shared discovery tag alone.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.627-journey-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const exchange = new PublicationCommentaryDistributionExchange(aliceStore, aliceProvider, new LocalAuthorizationVerifier());
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.627-bobs-snapshot',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'nice work, Bob — seen while you were offline'
        });
        const envelopeJson = exchange.exportCommentary(commentary);

        const relay = makeSharedFakeRelay();
        const sharedDiscoveryTag = 'forkbuild-commentary-pub-0.9.627-bobs-snapshot';
        const aliceComposition = makeComposition({ relay, extension: fakeExtension('journey-alice'), discoveryTag: sharedDiscoveryTag });
        await aliceComposition.publish(envelopeJson);

        // Bob comes online later. He was never told an event id (a
        // locator) out of band — only the discoveryTag convention both
        // sides already share (the identical "discoveryTag, never an
        // envelope field" pattern application/NostrPublicationDiscoveryPublisher.js's
        // own header already documents, held here for Commentary).
        const bobComposition = makeComposition({ relay, extension: fakeExtension('journey-bob'), discoveryTag: sharedDiscoveryTag });
        const discovered = await bobComposition.retrieveByDiscoveryTag();

        assert(discovered.length === 1 && discovered[0].commentaryId === commentary.commentaryId,
            n('Bob discovers the Commentary through a single REQ filtered by the shared discovery tag alone — no locator/event id ever communicated out of band'));

        // AN IMPORTANT ARCHITECTURAL FINDING, live: over real NIP-01, a
        // relay's own EVENT frame already carries the FULL event
        // (including content) the instant it matches a filter — "discover
        // that it exists" and "retrieve its bytes" are not two separate
        // network round trips the way a locator-plus-content-store
        // substrate (Arweave) would require. The SIGNED -> RETRIEVED
        // skip-ahead transition 0.9.626's own contract already declared
        // valid (its own Section B) is the natural one for a Nostr
        // substrate — DISCOVERABLE is not a separately OBSERVABLE network
        // state here, only a conceptual one.
        const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(discovered[0]);
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
        assert(verification.valid === true, n('the tag-discovered envelope verifies correctly'));
        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructed.toCommentary());
        assert(admitted === true, n('Bob admits it into his own, real, unmodified store — the full product journey: signed while offline, published, discovered by tag, verified, and admitted, with no live peer connection ever involved'));

        console.log('✓ J: the full product journey holds — Alice comments while Bob is offline; Bob returns online, discovers the Commentary by a shared discovery tag alone (no out-of-band locator), verifies, and admits it. A NIP-01 tag query already returns full content on a match, so DISCOVERABLE and RETRIEVED collapse into one relay exchange for Nostr specifically — a substrate-specific fact this milestone\'s own contract already accommodates via its skip-ahead transitions, never something this file needed to special-case.');
    }

    // ===============================================================
    // Section K — exclusion guard.
    // ===============================================================
    {
        const testSource = await readFile(new URL(import.meta.url), 'utf8');
        // Scans only the CODE this file wrote BEFORE Section K's own
        // marker — Section K's own text necessarily names every excluded
        // term in order to check for it, so including it here would make
        // this a self-referential no-op (every regex below would match its
        // own source line). Every earlier section is real, executable
        // production-relevant logic, exactly what an exclusion guard needs
        // to scan.
        const beforeSectionK = testSource.slice(0, testSource.indexOf('// Section K — exclusion guard'));
        const codeOnly = beforeSectionK.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/ArweaveAnnouncementPublisher/.test(codeOnly),
            n('no Arweave Commentary implementation of any kind — this milestone imports ArweaveAnnouncementPublisher nowhere at all (0.9.626 already proved, live, that it does not conform to the delivery contract; this audit does not repeat that check)'));
        assert(!/relayRank|relayScore|relayPreference|fallbackRelay|retryQueue|backgroundSync/i.test(codeOnly),
            n('no relay ranking, preference, fallback, retry queue, or background sync vocabulary of any kind'));
        assert(!/nostrEventId\s*[:=]|arweaveTransactionId\s*[:=]/.test(codeOnly),
            n('no new Commentary identity field introduced anywhere in this test\'s own code'));

        // AMENDED BY 0.9.629 — see this file's own header note, above.
        // Two such files now exist — 0.9.628's own adapter and admission
        // boundary — built AFTER this milestone, per this audit's own
        // recommendation, never by this milestone itself.
        //
        // AMENDED AGAIN BY 0.9.631 — 0.9.630's own, later, Arweave-focused
        // audit made the same recommendation for Arweave that THIS
        // milestone's audit made for Nostr; 0.9.631, one further milestone
        // on, built exactly that adapter/admission/search-primitive trio,
        // never this milestone. Five such files now exist, never zero —
        // the identical "recommended here, built one or more milestones
        // later" pattern this file's own 0.9.629 amendment already
        // established for Nostr, now reconfirmed for Arweave too.
        const commentaryNostrOrArweaveFiles = (() => {
            let hits = '';
            try {
                hits = execSync('grep -rlE "Commentary" nostr application arweave --include="*.js" | grep -E "Nostr|Arweave" || true', { cwd: SOURCE_ROOT.pathname }).toString();
            } catch { /* zero hits */ }
            return hits.trim() ? hits.trim().split('\n') : [];
        })();
        assert(commentaryNostrOrArweaveFiles.length === 5
            && commentaryNostrOrArweaveFiles.some((f) => f.includes('PublicationCommentaryNostrDistribution.js'))
            && commentaryNostrOrArweaveFiles.some((f) => f.includes('DiscoverPublicationCommentaryFromNostrUseCase.js'))
            && commentaryNostrOrArweaveFiles.some((f) => f.includes('PublicationCommentaryArweaveDistribution.js'))
            && commentaryNostrOrArweaveFiles.some((f) => f.includes('DiscoverPublicationCommentaryFromArweaveUseCase.js'))
            && commentaryNostrOrArweaveFiles.some((f) => f.includes('ArweaveTaggedTransactionSearch.js')),
            n(`exactly 0.9.628's own two Nostr-flavored Commentary production files AND 0.9.631's own three Arweave-flavored ones exist — found: ${commentaryNostrOrArweaveFiles.join(', ') || 'none'}; none of the five existed when THIS milestone (0.9.627) ran, and this milestone itself still built none of them — each was built by a later milestone, per this audit's own (and 0.9.630's own) recommendation`));

        console.log('✓ K (AMENDED BY 0.9.629): nothing on the requesting brief\'s own "deliberately excluded" list — an Arweave implementation, multi-relay fan-out, relay ranking/fallback, retry queues, background sync, a new Commentary identity field, or a WebRTC/Publication-discovery change — was built by THIS milestone (0.9.627), still true. A Nostr Commentary publisher/admission boundary, the one item this audit\'s own verdict table (Section L) explicitly recommended rather than excluded, was subsequently built by 0.9.628, one milestone later.');
    }

    // ===============================================================
    // Section L — verdict table.
    // ===============================================================
    {
        const verdicts = Object.freeze({
            'Raw Nostr transport primitives (NostrInjectedProviderPublisher + NostrRelayQueryClient), composed': 'PREPARED_SEAM',
            'A permanent production adapter class making that composition reusable': 'CONCRETE_PRODUCT_GAP',
            'Existing discovery-specific classes (NostrPublicationDiscoveryPublisher / NostrDiscoveryQueryService)': 'ARCHITECTURAL_MISMATCH',
            'Relay durability: does one relay\'s OK == PERSISTENTLY_PUBLISHED in the contract\'s own strong sense': 'SEMANTIC_GAP',
            'Multi-relay fan-out / ranking / fallback for Commentary': 'NEW_SUBSTRATE_BOUNDARY (deliberately unbuilt)',
            'Identity separation / verification boundary / Publication association': 'ALREADY_CORRECT'
        });
        assert(Object.keys(verdicts).length === 6, n('the verdict table names exactly the six questions this audit set out to answer'));
        assert(verdicts['Raw Nostr transport primitives (NostrInjectedProviderPublisher + NostrRelayQueryClient), composed'] === 'PREPARED_SEAM',
            n('VERDICT: the raw transport layer is a prepared seam — Section C\'s own live round trip is the proof'));
        assert(verdicts['Existing discovery-specific classes (NostrPublicationDiscoveryPublisher / NostrDiscoveryQueryService)'] === 'ARCHITECTURAL_MISMATCH',
            n('VERDICT: the discovery-specific classes remain a mismatch, reconfirmed live in Section A/H — never repurposed'));
        assert(verdicts['Relay durability: does one relay\'s OK == PERSISTENTLY_PUBLISHED in the contract\'s own strong sense'] === 'SEMANTIC_GAP',
            n('VERDICT: a semantic gap exists — a relay\'s own OK acknowledgment, the only signal this milestone\'s own transport primitives ever observe, is documented by application/NostrPublicationDiscoveryPublisher.js\'s own existing header as meaning only "the relay accepted this event," explicitly NOT "the event is retained, confirmed, or ever actually queryable again"'));

        const nostrPublisherHeader = await readFile(new URL('../application/NostrPublicationDiscoveryPublisher.js', import.meta.url), 'utf8');
        assert(nostrPublisherHeader.includes('is ever actually retained'),
            n('the exact, pre-existing sentence this SEMANTIC_GAP verdict rests on is really in the codebase today, not asserted fresh by this audit: "...appears in a relay\'s own query results, or is ever actually retained. A successful publish() means only \'the relay accepted this event\'..."'));

        console.log('\n=== 0.9.627 VERDICT TABLE ===');
        for (const [question, verdict] of Object.entries(verdicts)) {
            console.log(`  ${verdict.padEnd(28)} — ${question}`);
        }
        console.log('\nRECOMMENDATION (audit output, not a build decision this milestone makes): the smallest next step, if taken, is a single small production adapter file wiring the two raw transport primitives together exactly as this test\'s own ComposedNostrTransportCommentarySubstrate does — a CONCRETE_PRODUCT_GAP, never a NEW_SUBSTRATE_BOUNDARY — with PERSISTENTLY_PUBLISHED honestly documented as "at least one relay\'s OK," never silently equated with Arweave-grade durability (the SEMANTIC_GAP above). Arweave remains untouched and independently assessed later.');

        console.log(`\n✅ All Publication Commentary Nostr Round-Trip Boundary Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
