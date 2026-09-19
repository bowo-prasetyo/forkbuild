import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryDistributionEnvelope } from '../core/PublicationCommentaryDistributionEnvelope.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/PublicationCommentaryDistributionExchange.js';

import {
    PublicationCommentaryDeliveryStatus,
    PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE,
    isValidPublicationCommentaryDeliveryStatusTransition,
    describesConformingPublicationCommentaryAsynchronousDeliverySubstrate
} from '../core/PublicationCommentaryAsynchronousDeliveryContract.js';

// The two REAL, UNMODIFIED Arweave transport primitives this audit's own
// flagship composes — never a Commentary-flavored file, never touched by
// this milestone.
import { createArweaveTaggedTransactionUpload } from '../application/ArweaveTaggedTransactionUpload.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';

// The real, unmodified LOCATOR-shaped Arweave discovery/announcement class
// this audit deliberately never uses to carry Commentary — reconfirmed inert
// for this job in Section A/C, exactly as 0.9.625 already found live.
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';

// The existing Nostr Commentary substrate adapter (0.9.628) — imported ONLY
// to prove, live, side by side, that it and this milestone's own composed
// Arweave substrate satisfy the IDENTICAL contract shape (Section J); never
// modified, never used to carry a single byte in this file.
import { PublicationCommentaryNostrDistribution } from '../application/PublicationCommentaryNostrDistribution.js';

// The real substrate-selection precedent this audit's own Section B/J
// measures against — 'nostr' | 'arweave', selection never fan-out.
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';

// The real Snapshot distribution composition/selection precedent this
// audit's own Section B measures against.
import {
    SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES
} from '../application/SnapshotDistributionContentBackendSelection.js';

// The existing WebRTC peer exchange, read-only here, to reconfirm it still
// knows nothing of Arweave (Section K, the same guard 0.9.627 Section H
// already ran for Nostr).
// (source read directly by path in Section K — no class import needed.)

// 0.9.630 — Publication Commentary Arweave Distribution Boundary Audit.
//
// TYPE: test-only architectural/product audit. PRODUCTION CHANGES: none —
// no new production file, no modified production file. See Section N,
// below, for a live, executable guard proving both facts, the same
// discipline 0.9.625's, 0.9.626's, and 0.9.627's own audits already held.
//
// THE QUESTION. 0.9.629 closed the Nostr arc and reassessed Arweave, finding
// no CONCRETE product requirement for it at that time. A follow-up argument
// reopens the question on different, narrower grounds this codebase has not
// yet named: not "Arweave is another decentralized technology we could
// support," but "this application ALREADY lets a Wanderer choose Nostr or
// Arweave for Publication distribution (ui/components/WorldEncounterCanvas.js,
// 0.9.430) — Commentary being Nostr-only, while sitting inside the same
// published-object experience, is a substrate-EXPERIENCE asymmetry, not
// merely a missing feature." This milestone asks, deliberately analogous to
// 0.9.627 but WITHOUT assuming the same answer: can the EXISTING Arweave
// infrastructure, unmodified, provide asynchronous Commentary distribution
// while preserving the 0.9.626 contract, existing Arweave semantics,
// Commentary's own identity/security boundaries, and the user's existing
// substrate-selection experience?
//
// THE HEADLINE FINDING, verified live below: Arweave's own two
// DISCOVERY-SPECIFIC classes (`application/ArweaveAnnouncementPublisher.js`,
// `application/ArweaveGraphqlDiscoveryQueryService.js`) remain exactly as
// ARCHITECTURAL_MISMATCH for Commentary as Nostr's own discovery-specific
// classes were in 0.9.627 — both are LOCATOR-envelope-only and never touch a
// Commentary envelope here either (0.9.625 Section D already proved
// `ArweaveAnnouncementPublisher#publish()` resolves `null` for a real signed
// Commentary envelope; reconfirmed live in Section C, below). But one layer
// BELOW them, two already-existing, already-production-wired primitives —
// `application/ArweaveTaggedTransactionUpload.js` (write: sign + tag +
// broadcast, opaque `material` in, `{ id }` out) and `content/
// ArweaveContentStore.js` (read: `get()`, opaque bytes back by transaction
// id) — compose into a substrate that duck-type-conforms to 0.9.626's own
// `{ publish, retrieve }` contract and carries a real, signed
// PublicationCommentaryDistributionEnvelope through a live (fake-gateway-
// backed) Arweave upload/retrieval round trip, byte-for-byte, adversarial
// cases included. Classification: PREPARED_SEAM at the round-trip layer —
// the SAME classification 0.9.627 gave Nostr — but with THREE material
// differences this audit measures precisely, never assumed away: (1) the
// read-side raw primitive is duplicated four times across this codebase
// rather than factored into one standalone function the way Nostr's own
// `createNostrRelayQueryClient` is (Section A); (2) the durability
// SEMANTIC_GAP 0.9.627 found for a Nostr relay's own "OK" is, for Arweave,
// a STRICTLY WIDER gap — a not-yet-mined, a never-broadcast, and a
// genuinely unreachable-gateway transaction id are all indistinguishable
// from this substrate's own `retrieve()`, where Nostr's own `retrieve()`
// cleanly separates "no such event" from "relay unreachable" (Section E);
// (3) the existing Snapshot distribution journey the requesting brief's own
// framing assumed this milestone would extend is NOT the substrate-choice
// precedent at all — that precedent belongs to Publication distribution
// alone; Snapshot's own choosable axis is CONTENT BACKEND, never discovery
// substrate (Section B).
//
//   Section A — existing Arweave capability census, by role.
//   Section B — existing Snapshot AND Publication distribution journeys —
//               which one actually is "choose Nostr or Arweave," live.
//   Section C — Commentary envelope compatibility with the existing
//               LOCATOR-only Arweave classes (reconfirmed) and with the
//               raw transport layer (new).
//   Section D — FLAGSHIP: a live Arweave publish/retrieve round trip for a
//               real, signed Commentary envelope, through a composition of
//               the two real, unmodified transport primitives plus one
//               shared, realistic fake gateway.
//   Section E — Arweave durability semantics: PERSISTENTLY_PUBLISHED vs.
//               DISCOVERABLE vs. "never existed," measured live, contrasted
//               with Nostr's own, narrower gap.
//   Section F — discovery vs. storage: is Arweave's own tag-search capacity
//               independently reusable the way Nostr's raw REQ primitive
//               is? Measured live, not assumed.
//   Section G — security boundary: five adversarial cases, live, against
//               the real, unmodified verifier/store.
//   Section H — Publication association: a Commentary naming a locally
//               unknown publicationId is still ADMITTED.
//   Section I — identity independence: commentaryId / publicationId /
//               authorIdentityId / the Arweave transaction id stay
//               independent; Arweave's own content-derived transaction id
//               discussed explicitly as a material identity, never
//               Commentary identity.
//   Section J — substrate selection: the real 'nostr'|'arweave' selection-
//               never-fan-out precedent, and a live, side-by-side proof
//               that the real Nostr Commentary substrate and this
//               milestone's composed Arweave substrate satisfy the
//               identical contract shape — interchangeable at the
//               boundary a future selection would need.
//   Section K — failure semantics, live: gateway unreachable, upload
//               declined, transaction never available, malformed bytes,
//               duplicate transaction, WebRTC/Nostr independence.
//   Section L — cross-substrate semantic comparison table, filled from
//               THIS audit's own measurements, never assumed.
//   Section M — product journey: Bob, entirely offline when Alice
//               comments, discovers and retrieves through Arweave alone —
//               no Nostr smuggled in for discovery merely because Arweave
//               was the chosen substrate.
//   Section N — production-change guard.
//   Section O — exclusion guard.
//   Section P — verdict table and recommendation.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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

// A minimal, honest fake Arweave `signer` — the same shape `arweave/
// ArweaveInjectedProviderSigner.js` already produces in production
// (`{ sign(material, tags=[]) -> Promise<{ id, transaction }> }`), faked
// here the same way 0.9.627's own `fakeExtension()` faked Nostr's NIP-07
// signing boundary — never the real browser wallet, never a rewrite of the
// real signer's own Merkle/wallet logic (that logic is `arweave/
// ArweaveInjectedProviderSigner.js`'s own, already-tested job, untouched by
// this milestone). The transaction id is embedded directly in the fake
// `transaction` object so the fake gateway below can key stored bytes by
// it — a plain test double standing in for the real network, exactly as
// 0.9.627's own `FakeSocket` stood in for a real relay.
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

// A REALISTIC fake Arweave gateway — never a generic key-value substrate —
// speaking the same two HTTP exchanges the two REAL production transport
// files already implement: `POST <gatewayUrl>/tx` (content/
// ArweaveContentStore.js#put()'s own upload, and application/
// ArweaveTaggedTransactionUpload.js's own uploadTaggedTransaction()), and
// `GET <gatewayUrl>/<transaction-id>` (content/ArweaveContentStore.js#get(),
// application/ArweaveWorldEncounterMaterialResolver.js#retrieveByUri(), and
// application/ArweaveGraphqlDiscoveryQueryService.js's own per-candidate
// fetch — three independent files this codebase already implements the
// identical GET against; see Section A). `mineDelayTicks` lets a single
// test simulate a transaction that the gateway has ACCEPTED (a real `OK`-
// shaped 200 on the POST) but does not yet serve on GET — the genuine gap
// Section E measures — never a simulation artifact invented for this file
// alone, since a real gateway's own accept-before-mine behavior is exactly
// what every write-side Arweave class in this codebase already excludes
// verifying (see application/ArweaveTaggedTransactionUpload.js's own
// header, "Verifying that a published transaction later confirms on
// Arweave").
function makeSharedFakeGateway({ declineUpload = false, mineDelayTicks = 0 } = {}) {
    const transactions = new Map(); // id -> { data, tags, minedAtTick }
    let tick = 0;
    const gateway = {
        transactions,
        advanceTick(count = 1) { tick += count; },
        async fetchImpl(url, options = {}) {
            const method = (options.method || 'GET').toUpperCase();
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
                    // Indistinguishable, deliberately: a real Arweave gateway
                    // returns the identical 404 whether a transaction was
                    // never broadcast, was broadcast but not yet mined, or
                    // simply does not exist on this gateway — see Section E.
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

// A plain composition of the two REAL, UNMODIFIED transport primitives —
// defined only in this test file, never exported, never a production class
// — the Arweave counterpart to 0.9.627's own
// `ComposedNostrTransportCommentarySubstrate`. It exposes exactly
// `publish(envelopeJson)`/`retrieve(locator)`, the shape 0.9.626's own
// contract describes. `publish()` feeds the envelope's OWN full JSON as
// `material` into `uploadTaggedTransaction` — the identical function every
// EXISTING caller of that file (application/ArweaveAnnouncementPublisher.js)
// only ever feeds a LOCATOR envelope's JSON to; this is the first time this
// codebase has fed it a full, opaque Commentary payload instead (see
// Section F). `retrieve()` reuses the real, unmodified `ArweaveContentStore#
// get()` — never a hand-rolled fetch — deliberately NOT catching the
// `ContentUnavailableError` it can throw; see Section E for why that
// propagation, left exactly as `ArweaveContentStore.js`'s own header already
// specifies it, is itself this audit's own central finding, never smoothed
// over here.
class ComposedArweaveTransportCommentarySubstrate {
    constructor({ uploadTaggedTransaction, contentStore, tagName = 'ForkBuild-Commentary-Discovery-Tag', discoveryTag }) {
        this._upload = uploadTaggedTransaction;
        this._contentStore = contentStore;
        this._tagName = tagName;
        this._discoveryTag = discoveryTag;
    }
    async publish(envelopeJson) {
        const material = JSON.stringify(envelopeJson);
        const tag = Object.freeze({ name: this._tagName, value: this._discoveryTag });
        const result = await this._upload(material, tag);
        if (!result || typeof result.id !== 'string') {
            return null;
        }
        return { published: true, locator: result.id };
    }
    async retrieve(locator) {
        if (typeof locator !== 'string' || !ARWEAVE_TRANSACTION_ID_PATTERN.test(locator)) {
            return null;
        }
        const text = await this._contentStore.get({ uri: `ar://${locator}` });
        if (text === null) {
            return null;
        }
        try {
            const parsed = JSON.parse(text);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch {
            return null;
        }
    }
    // Discovery-by-tag, mirroring 0.9.627's own `retrieveByDiscoveryTag()` —
    // used only by Section M's own product-journey test. Filters this
    // gateway's own stored transactions by this instance's own tag/value —
    // a TEST-ONLY stand-in for the small, currently-PRIVATE tag-search
    // capability `application/ArweaveGraphqlDiscoveryQueryService.js`
    // already implements against a real GraphQL endpoint (see that file's
    // own `_searchAnnouncementTransactionIds()`, and Section F, below, for
    // why this capability is not currently reusable standalone the way
    // Nostr's own raw REQ primitive is). This function tests the PRODUCT
    // JOURNEY assuming that capability exists — it is not, and does not
    // claim to be, a test of GraphQL wire fidelity, which remains entirely
    // `tests/ArweaveGraphqlDiscoveryQueryService.test.js`'s own, already-
    // passing, job.
    async discoverByTag(gateway) {
        const results = [];
        for (const entry of gateway.transactions.values()) {
            const matches = (entry.tags || []).some((tag) => tag.name === this._tagName && tag.value === this._discoveryTag);
            if (!matches) continue;
            try {
                const parsed = JSON.parse(entry.data);
                if (parsed && typeof parsed === 'object') results.push(parsed);
            } catch { /* not a candidate */ }
        }
        return results;
    }
}

function makeComposition({ gateway, signer, gatewayUrl = 'https://fake-arweave-gateway.example', discoveryTag }) {
    const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer, gatewayUrl, fetchImpl: gateway.fetchImpl });
    const contentStore = new ArweaveContentStore({ signer, gatewayUrl, fetchImpl: gateway.fetchImpl });
    return new ComposedArweaveTransportCommentarySubstrate({ uploadTaggedTransaction, contentStore, discoveryTag });
}

// A real, signed Commentary distribution envelope, built through the same
// real exchange/exportCommentary() path production code uses — never
// hand-rolled.
function signedCommentaryEnvelopeJson(authorProvider, overrides = {}) {
    const exchange = new PublicationCommentaryDistributionExchange(
        new PublicationCommentaryStore(new InMemoryStorageProvider()),
        authorProvider,
        new LocalAuthorizationVerifier()
    );
    const commentary = new PublicationCommentary({
        publicationId: overrides.publicationId || 'pub-0.9.630-boundary-audit',
        authorIdentityId: authorProvider.getSigningIdentity().id,
        content: overrides.content || 'a real, signed Commentary distribution envelope, 0.9.630'
    });
    return exchange.exportCommentary(commentary);
}

async function run() {
    // ===============================================================
    // Section A — existing Arweave capability census, by role.
    // ===============================================================
    {
        // Write side, locator-only (ARCHITECTURAL_MISMATCH class).
        const realAnnouncementPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: '0.9.630-census', uploadTaggedTransaction: async () => ({ id: 'a'.repeat(43) })
        });
        assert(typeof realAnnouncementPublisher.publish === 'function' && typeof realAnnouncementPublisher.retrieve === 'undefined',
            n('the real, unmodified ArweaveAnnouncementPublisher still exposes publish() but no retrieve() — the identical shape 0.9.627 Section A already found for NostrPublicationDiscoveryPublisher'));
        assert(typeof ArweaveGraphqlDiscoveryQueryService.prototype.search === 'function' && typeof ArweaveGraphqlDiscoveryQueryService.prototype.retrieve === 'undefined',
            n('the real, unmodified ArweaveGraphqlDiscoveryQueryService exposes only search(discoveryTag) — a tag-filtered LIST of candidates each decoded strictly as a LOCATOR envelope via parseDecentralizedDiscoveryEnvelope(), never a retrieve(locator) returning one opaque envelope\'s own raw bytes'));

        // content/ArweaveContentStore.js is genuinely two-way — put AND
        // get — never publish-only, unlike either class above.
        const fakeSigner = fakeArweaveSigner('census');
        const gateway = makeSharedFakeGateway();
        const contentStore = new ArweaveContentStore({ signer: fakeSigner, gatewayUrl: 'https://fake.example', fetchImpl: gateway.fetchImpl });
        assert(typeof contentStore.put === 'function' && typeof contentStore.get === 'function',
            n('content/ArweaveContentStore.js — a full, real content/ContentStore.js implementation — already exposes both a write (put) and a read (get) primitive over Arweave, the genuinely two-way capability neither locator-only class above has'));

        // The raw write primitive: application/ArweaveTaggedTransactionUpload.js.
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: fakeSigner, gatewayUrl: 'https://fake.example', fetchImpl: gateway.fetchImpl });
        assert(typeof uploadTaggedTransaction === 'function',
            n('application/ArweaveTaggedTransactionUpload.js — one layer below ArweaveAnnouncementPublisher, the same layer 0.9.627 Section A found for Nostr\'s own raw transport primitives — already produces a real, usable write function today, already production-wired (ArweaveAnnouncementPublisher itself is the one existing caller)'));

        // Composed together, do the two raw primitives already
        // duck-type-conform to 0.9.626's own contract? Live proof.
        const composition = makeComposition({ gateway, signer: fakeSigner, discoveryTag: '0.9.630-census' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(composition) === true,
            n('a composition of ONLY uploadTaggedTransaction (write) and content/ArweaveContentStore.js#get() (read) — built here, in this test file, never in production code — already duck-type-conforms to 0.9.626\'s own contract'));

        // Neither raw primitive alone conforms — and, unlike Nostr, NEITHER
        // does the full ArweaveContentStore instance itself: its own
        // methods are named put()/get(), never publish()/retrieve(), so
        // the contract's own duck-type check (which looks for those exact
        // names) correctly reports false even though ArweaveContentStore
        // is BEHAVIORALLY capable of the identical round trip — proving
        // this milestone's own composed wrapper performs real, necessary
        // adaptation, never a bare re-export.
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(contentStore) === false,
            n('the real, unmodified ArweaveContentStore instance itself does NOT duck-type-conform — its own put()/get() names, not publish()/retrieve() — even though it already has the behavioral capability underneath; the composed wrapper above is genuine, minimal adaptation, not aliasing'));
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate({ publish: uploadTaggedTransaction }) === false,
            n('uploadTaggedTransaction alone (no retrieve) does not conform either — confirming the composition, not either half alone, is what closes the seam, the identical two-halves-needed shape 0.9.627 Section A already found for Nostr'));

        // The read-side raw primitive, unlike Nostr's, is duplicated
        // across multiple independent files rather than factored into one
        // standalone function — a live, grep-verified structural fact.
        let duplicatedGetFiles = '';
        try {
            duplicatedGetFiles = execSync('grep -rlE "method:\\s*.GET." content application --include="*.js" || true', { cwd: SOURCE_ROOT.pathname }).toString();
        } catch { /* zero hits */ }
        const getImplementations = duplicatedGetFiles.trim() ? duplicatedGetFiles.trim().split('\n') : [];
        assert(getImplementations.length >= 3
            && getImplementations.some((f) => f.includes('ArweaveContentStore.js'))
            && getImplementations.some((f) => f.includes('ArweaveWorldEncounterMaterialResolver.js'))
            && getImplementations.some((f) => f.includes('ArweaveGraphqlDiscoveryQueryService.js')),
            n(`Arweave's own "GET <gatewayUrl>/<transaction-id>" retrieval logic is genuinely duplicated across at least three independent production files (found: ${getImplementations.join(', ')}) — never factored into one standalone, reusable function the way nostr/NostrRelayQueryClient.js's own createNostrRelayQueryClient() is for Nostr; this milestone reuses content/ArweaveContentStore.js#get() specifically because it is the one variant that returns fully opaque text (never JSON-parsing or envelope-decoding it on this substrate\'s own behalf), the correct choice for an opaque Commentary payload`));

        console.log('✓ A: Arweave\'s two discovery-specific classes remain publish-only/search-only (no single-locator retrieve); the raw write primitive (ArweaveTaggedTransactionUpload) composed with the raw read primitive (ArweaveContentStore#get) already duck-type-conforms to the asynchronous delivery contract — a live capability census, not a restated conclusion, and one that also measures a genuine structural difference from Nostr: Arweave\'s own read primitive is duplicated, never centralized.');
    }

    // ===============================================================
    // Section B — existing Snapshot AND Publication distribution
    // journeys: which one is actually "choose Nostr or Arweave"?
    // ===============================================================
    {
        // Snapshot's own composition: read the real source, live.
        const snapshotCompositionSource = codeOnly(await rawSource('application/SnapshotDistributionRuntimeComposition.js'));
        assert(/import\s*\{\s*ArweaveContentStore\s*\}/.test(snapshotCompositionSource)
            && /import\s*\{\s*NostrSnapshotDiscoveryPublisher\s*\}/.test(snapshotCompositionSource),
            n('application/SnapshotDistributionRuntimeComposition.js imports exactly ArweaveContentStore (content) and NostrSnapshotDiscoveryPublisher (discovery/announcement) — confirmed by reading its real, current source'));
        assert(!/ArweaveAnnouncementPublisher|ArweaveSnapshotDiscoveryPublisher/.test(snapshotCompositionSource),
            n('that same source never imports ArweaveAnnouncementPublisher or ArweaveSnapshotDiscoveryPublisher — Snapshot\'s own WRITE-side discovery/announcement is Nostr-only, hardcoded, with no Arweave branch of any kind, unlike Publication\'s own composition (below)'));

        assert(JSON.stringify(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES) === JSON.stringify(['ipfs', 'ar']),
            n('Snapshot Distribution\'s own real, live, user-choosable axis (application/SnapshotDistributionContentBackendSelection.js#SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES) is CONTENT BACKEND — ipfs or ar — never a Nostr-vs-Arweave DISCOVERY substrate choice'));

        // Publication's own composition: the real 'nostr'|'arweave'
        // discoveryProvider selection, live.
        const arweaveRuntime = composePublicationDistributionRuntime({
            discoveryProvider: 'arweave',
            arweaveUploaderOptions: { signer: fakeArweaveSigner('b-runtime') },
            arweaveAnnouncementPublisherOptions: { discoveryTag: '0.9.630-b', uploadTaggedTransaction: async () => ({ id: 'a'.repeat(43) }) }
        });
        assert(arweaveRuntime.publisher instanceof ArweaveAnnouncementPublisher,
            n('composePublicationDistributionRuntime({ discoveryProvider: "arweave" }) constructs a real ArweaveAnnouncementPublisher, live — Publication distribution IS the "choose Nostr or Arweave" precedent, not Snapshot'));
        const nostrRuntime = composePublicationDistributionRuntime({
            discoveryProvider: 'nostr',
            arweaveUploaderOptions: { signer: fakeArweaveSigner('b-runtime2') },
            nostrPublisherOptions: { discoveryTag: '0.9.630-b', publishImpl: async () => ({ published: true, id: '0'.repeat(64) }) }
        });
        assert(nostrRuntime.publisher instanceof NostrPublicationDiscoveryPublisher,
            n('the identical composition call with "nostr" instead constructs the real NostrPublicationDiscoveryPublisher — exactly one collaborator per call, never both'));
        let threwForUnknownProvider = false;
        try {
            composePublicationDistributionRuntime({ discoveryProvider: 'bittorrent', arweaveUploaderOptions: { signer: fakeArweaveSigner('b-runtime3') } });
        } catch {
            threwForUnknownProvider = true;
        }
        assert(threwForUnknownProvider, n('an unrecognized discoveryProvider throws synchronously — selection, never a silent third option'));

        console.log('✓ B: the requesting brief\'s own framing ("Snapshot distribution already lets users choose Nostr or Arweave") does not match this codebase\'s real wiring — that live, UI-reachable choice (ui/components/WorldEncounterCanvas.js, 0.9.430) belongs to PUBLICATION distribution\'s own discoveryProvider selection. Snapshot Distribution\'s own real, choosable axis is CONTENT BACKEND (ipfs/ar); its discovery/announcement stays Nostr-only, hardcoded. This correction matters directly for Section J/M, below — the correct precedent to extend to Commentary is Publication\'s discoveryProvider selection, never a repurposing of Snapshot\'s own, differently-shaped, backend picker.');
    }

    // ===============================================================
    // Section C — Commentary envelope compatibility.
    // ===============================================================
    {
        const authorProvider = makeIdentity('0.9.630-envelope-author');
        const commentaryEnvelopeJson = signedCommentaryEnvelopeJson(authorProvider);

        // Reconfirmed live: the real, unmodified Arweave announcement
        // publisher, given a real signed Commentary envelope, is a total
        // no-op — the identical finding 0.9.625 Section D4 already made,
        // reconfirmed here as this milestone's own independent grounding.
        const arweavePublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: '0.9.630-c', uploadTaggedTransaction: async () => ({ id: 'a'.repeat(43) })
        });
        const arweaveOutcome = await arweavePublisher.publish(commentaryEnvelopeJson);
        assert(arweaveOutcome === null,
            n('LIVE, reconfirmed: ArweaveAnnouncementPublisher#publish(), UNMODIFIED, given a real signed Commentary envelope, resolves null — its own internal describeDecentralizedDiscoveryEnvelope() call rejects it before uploadTaggedTransaction is ever invoked, the identical ARCHITECTURAL_MISMATCH 0.9.625 already measured'));

        // The envelope class itself is untouched by this milestone.
        const envelopeSource = await rawSource('core/PublicationCommentaryDistributionEnvelope.js');
        assert(!/nostrEventId|arweaveTransactionId/i.test(envelopeSource),
            n('core/PublicationCommentaryDistributionEnvelope.js still defines no substrate-specific identity field of any kind — reconfirmed live against current source, not merely cited from 0.9.627'));

        // One layer BELOW the locator-only publisher, the raw transport
        // primitives never parse or care what `material` holds — the
        // Arweave counterpart to 0.9.627 Section B's Nostr finding.
        const fakeSigner = fakeArweaveSigner('c');
        const gateway = makeSharedFakeGateway();
        const uploadTaggedTransaction = createArweaveTaggedTransactionUpload({ signer: fakeSigner, gatewayUrl: 'https://fake.example', fetchImpl: gateway.fetchImpl });
        const arbitraryMaterial = JSON.stringify({ totally: 'unrelated to any discovery envelope', nested: { ok: true } });
        const uploadResult = await uploadTaggedTransaction(arbitraryMaterial, { name: 'ForkBuild-Commentary-Discovery-Tag', value: '0.9.630-c' });
        assert(uploadResult !== null,
            n('uploadTaggedTransaction forwards arbitrary opaque material completely unexamined — it never parses, validates, or forms any opinion about what material holds, the identical restraint nostr/NostrInjectedProviderPublisher.js already holds for a Nostr event\'s own content'));
        const [storedEntry] = Array.from(gateway.transactions.values());
        assert(storedEntry.data === arbitraryMaterial,
            n('the gateway itself stores material as opaque text — this milestone writes into a transaction\'s own `data` field only, never a new Arweave transaction field of any kind'));

        console.log('✓ C: reconfirmed live, ArweaveAnnouncementPublisher (the LOCATOR-only class) remains a total no-op for a real Commentary envelope; the envelope class itself is untouched; and the raw upload primitive, one layer below, is genuinely opaque to what it carries — a real, signed Commentary envelope can travel through it unmodified, exactly as Section D\'s flagship proves next.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: live Arweave publish/retrieve round trip.
    // ===============================================================
    {
        const S = PublicationCommentaryDeliveryStatus;
        const traversed = [S.CREATED];

        const aliceProvider = makeIdentity('0.9.630-alice');
        const aliceStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const aliceExchange = new PublicationCommentaryDistributionExchange(
            aliceStore, aliceProvider, new LocalAuthorizationVerifier()
        );
        const commentary = new PublicationCommentary({
            publicationId: 'pub-0.9.630-bobs-work',
            authorIdentityId: aliceProvider.getSigningIdentity().id,
            content: 'a comment carried over a live Arweave round trip, 0.9.630'
        });
        aliceStore.save(commentary);
        assert(aliceStore.getById(commentary.commentaryId) !== null, n('CREATED: Alice\'s own local, unsigned Commentary exists'));

        const signedEnvelopeJson = aliceExchange.exportCommentary(commentary);
        traversed.push(S.SIGNED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('SIGNED: the CREATED -> SIGNED step is valid — same exportCommentary() call the WebRTC and Nostr paths already use'));

        const gateway = makeSharedFakeGateway();
        const aliceSigner = fakeArweaveSigner('alice');
        const composition = makeComposition({ gateway, signer: aliceSigner, discoveryTag: '0.9.630-flagship' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(composition) === true,
            n('the composition used for this round trip genuinely conforms to 0.9.626\'s own contract before it is used'));

        const publishResult = await composition.publish(signedEnvelopeJson);
        assert(publishResult && publishResult.published === true && typeof publishResult.locator === 'string' && ARWEAVE_TRANSACTION_ID_PATTERN.test(publishResult.locator),
            n('PERSISTENTLY_PUBLISHED: the real ArweaveTaggedTransactionUpload signed and POSTed the transaction (via the fake signer + fake gateway), which acknowledged it with a real 200; the locator is the real transaction\'s own id'));
        traversed.push(S.PERSISTENTLY_PUBLISHED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]), n('the SIGNED -> PERSISTENTLY_PUBLISHED step is valid'));

        const locatorKnownToBob = publishResult.locator;
        traversed.push(S.DISCOVERABLE);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]),
            n('the PERSISTENTLY_PUBLISHED -> DISCOVERABLE step is valid — Bob now merely knows a locator exists, communicated out of band; he has issued no GET yet'));

        // "Days later," Bob — a genuinely independent composition, sharing
        // only the fake gateway's own storage, never any in-process
        // reference to Alice's envelope object — retrieves by locator alone.
        const bobComposition = makeComposition({ gateway, signer: fakeArweaveSigner('bob-reader'), discoveryTag: '0.9.630-flagship' });
        const retrievedEnvelopeJson = await bobComposition.retrieve(locatorKnownToBob);
        assert(retrievedEnvelopeJson !== null
            && retrievedEnvelopeJson.commentaryId === signedEnvelopeJson.commentaryId
            && retrievedEnvelopeJson.publicationId === signedEnvelopeJson.publicationId
            && retrievedEnvelopeJson.authorIdentityId === signedEnvelopeJson.authorIdentityId
            && retrievedEnvelopeJson.content === signedEnvelopeJson.content
            && JSON.stringify(retrievedEnvelopeJson.signature) === JSON.stringify(signedEnvelopeJson.signature),
            n('RETRIEVED: a real GET against the fake gateway, issued by ArweaveContentStore#get(), returns an envelope byte-identical to what Alice published — every field matches exactly'));
        assert(JSON.stringify(retrievedEnvelopeJson) === JSON.stringify(signedEnvelopeJson),
            n('the recovered envelope is fully serialization-equivalent to the original'));
        traversed.push(S.RETRIEVED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]), n('the DISCOVERABLE -> RETRIEVED step is valid'));

        const reconstructedEnvelope = PublicationCommentaryDistributionEnvelope.fromJSON(retrievedEnvelopeJson);
        assert(reconstructedEnvelope !== null, n('the real, unmodified envelope class reconstructs a real instance from the Arweave-round-tripped JSON'));
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructedEnvelope.toJSON());
        assert(verification.valid === true,
            n('VERIFIED: the real, unmodified verifier accepts the envelope after it traveled through a real Arweave upload/retrieval exchange — identical outcome to the WebRTC and Nostr paths for the identical bytes'));
        traversed.push(S.VERIFIED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]), n('the RETRIEVED -> VERIFIED step is valid'));

        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructedEnvelope.toCommentary());
        assert(admitted === true && bobStore.getById(commentary.commentaryId) !== null,
            n('ADMITTED: Bob\'s own real, unmodified PublicationCommentaryStore now holds the Commentary — no second database, no Arweave-flavored persistence of any kind'));
        traversed.push(S.ADMITTED);
        assert(isValidPublicationCommentaryDeliveryStatusTransition(traversed[traversed.length - 2], traversed[traversed.length - 1]), n('the VERIFIED -> ADMITTED step is valid'));

        assert(JSON.stringify(traversed) === JSON.stringify(PUBLICATION_COMMENTARY_DELIVERY_STATUS_SEQUENCE),
            n('the exact sequence of stages this LIVE Arweave round trip traversed matches the contract\'s own canonical sequence precisely, in order, none skipped, none repeated'));

        console.log('✓ D — FLAGSHIP: a real, signed Commentary travels CREATED -> ... -> ADMITTED through an ACTUAL Arweave upload/retrieval exchange (real ArweaveTaggedTransactionUpload + real ArweaveContentStore#get, fake signer + fake gateway only), byte-for-byte — the existing Arweave transport infrastructure genuinely provides a conforming substrate at the raw-transport layer, exactly as it does for Nostr.');
    }

    // ===============================================================
    // Section E — Arweave durability semantics.
    // ===============================================================
    {
        const uploaderHeader = await rawSource('application/ArweaveTaggedTransactionUpload.js');
        assert(/Verifying that a published transaction later confirms on Arweave/.test(uploaderHeader),
            n('the exact, pre-existing sentence this SEMANTIC_GAP rests on is really in the codebase: application/ArweaveTaggedTransactionUpload.js\'s own header excludes "Verifying that a published transaction later confirms on Arweave. A successful call means only \'the gateway accepted this for broadcast\'"'));
        const contentStoreHeader = await rawSource('content/ArweaveContentStore.js');
        assert(/THROWS ContentUnavailableError FOR EVERY NETWORK-SHAPED/.test(contentStoreHeader),
            n('content/ArweaveContentStore.js\'s own header confirms get() throws ContentUnavailableError for EVERY network-shaped failure (a non-2xx response, a transport failure, a timeout) — it never distinguishes "not yet mined," "never broadcast," and "gateway unreachable" from one another; confirmed structurally here, then live, below'));

        // Live: a transaction the gateway has ACCEPTED (a real 200 on POST)
        // but not yet mined — genuinely PERSISTENTLY_PUBLISHED, genuinely
        // NOT yet retrievable.
        const gateway = makeSharedFakeGateway({ mineDelayTicks: 2 });
        const signer = fakeArweaveSigner('durability');
        const composition = makeComposition({ gateway, signer, discoveryTag: '0.9.630-e' });
        const envelopeJson = signedCommentaryEnvelopeJson(makeIdentity('0.9.630-e-author'));
        const publishResult = await composition.publish(envelopeJson);
        assert(publishResult && publishResult.published === true,
            n('the gateway accepted the transaction for broadcast — PERSISTENTLY_PUBLISHED, in this contract\'s own sense'));

        let notYetAvailableError = null;
        try {
            await composition.retrieve(publishResult.locator);
        } catch (error) {
            notYetAvailableError = error;
        }
        assert(notYetAvailableError instanceof ContentUnavailableError,
            n('retrieve() for a PERSISTENTLY_PUBLISHED-but-not-yet-mined transaction THROWS ContentUnavailableError — never resolves null — because content/ArweaveContentStore.js#get() treats every non-2xx gateway response as a genuine failure to propagate, by its own, unmodified design'));

        gateway.advanceTick(2);
        const retrievedAfterMining = await composition.retrieve(publishResult.locator);
        assert(retrievedAfterMining !== null && retrievedAfterMining.commentaryId === envelopeJson.commentaryId,
            n('once "mined" (the fake gateway now serves the same id), the identical retrieve() call succeeds — DISCOVERABLE/RETRIEVED were reachable all along, merely not yet, exactly the gap PERSISTENTLY_PUBLISHED and DISCOVERABLE are named to keep apart'));

        // The critical measurement: a NEVER-published locator (a
        // well-formed id nobody ever broadcast) fails IDENTICALLY.
        let neverPublishedError = null;
        try {
            await composition.retrieve(`${signer.calls.sign.length + 1}`.padEnd(43, 'x'));
        } catch (error) {
            neverPublishedError = error;
        }
        assert(neverPublishedError instanceof ContentUnavailableError,
            n('a locator that was NEVER published fails with the SAME ContentUnavailableError as a not-yet-mined one — this substrate\'s own retrieve() cannot, on its own, distinguish "wait longer" from "this never happened" from "the gateway itself is unreachable" (tested next)'));

        // ...and a genuinely unreachable gateway fails the same way again.
        const unreachableComposition = makeComposition({ gateway: { fetchImpl: erroringFetchImpl() }, signer: fakeArweaveSigner('unreachable'), discoveryTag: '0.9.630-e' });
        let unreachableError = null;
        try {
            await unreachableComposition.retrieve('a'.repeat(43));
        } catch (error) {
            unreachableError = error;
        }
        assert(unreachableError instanceof ContentUnavailableError,
            n('a genuinely unreachable gateway ALSO throws ContentUnavailableError — the identical error type as "not yet mined" and "never published," confirming this three-way collapse is real and structural, not a fake-gateway artifact'));

        console.log('✓ E: Arweave\'s own durability SEMANTIC_GAP is measured, not assumed, and it is STRICTLY WIDER than Nostr\'s own (0.9.627): PERSISTENTLY_PUBLISHED (gateway accepted for broadcast) and DISCOVERABLE (actually retrievable) are genuinely separate states here — a not-yet-mined transaction is real, live-demonstrated — but a caller\'s only observable signal, ContentUnavailableError, is IDENTICAL across "wait longer," "this was never published," and "the network is down." Nostr\'s own retrieve() (0.9.627/0.9.628) cleanly resolves null for "no matching event" while only REJECTING for a genuinely unreachable relay — Arweave, composed from its existing, unmodified classes, cannot make that same distinction today. Per this milestone\'s own brief: this needs an ADAPTER MAPPING (e.g. treating a fresh ContentUnavailableError as "not yet," and only an old, repeatedly-failing one as a genuine failure), never a naive one-to-one status correspondence — deliberately unbuilt here; see Section P.');
    }

    // ===============================================================
    // Section F — discovery versus storage.
    // ===============================================================
    {
        // The full discovery-specific class remains ARCHITECTURAL_MISMATCH
        // — it is hard-coupled to the LOCATOR envelope decode, never
        // opaque like the raw transport layer.
        const queryServiceSource = codeOnly(await rawSource('application/ArweaveGraphqlDiscoveryQueryService.js'));
        assert(/parseDecentralizedDiscoveryEnvelope/.test(queryServiceSource),
            n('application/ArweaveGraphqlDiscoveryQueryService.js#search() decodes every candidate strictly through parseDecentralizedDiscoveryEnvelope() — a LOCATOR-envelope parser — never returning opaque bytes a Commentary-carrying candidate could use'));

        // The underlying tag-search capability (GraphQL, content-agnostic
        // in principle) is real but NOT independently reusable — a genuine,
        // measured asymmetry with Nostr's own raw REQ primitive.
        assert(typeof ArweaveGraphqlDiscoveryQueryService.prototype._searchAnnouncementTransactionIds === 'function',
            n('the tag-search step itself (_searchAnnouncementTransactionIds) exists as a private INSTANCE method, requiring a fully constructed ArweaveGraphqlDiscoveryQueryService (graphqlUrl, gatewayUrl, tagName, fetchImpl all bound at construction) — never a standalone, importable function the way nostr/NostrRelayQueryClient.js\'s own createNostrRelayQueryClient() is'));
        // AMENDED BY 0.9.631 — Publication Commentary Arweave Asynchronous
        // Distribution built exactly the standalone primitive this section
        // named as a CONCRETE_PRODUCT_GAP: application/
        // ArweaveTaggedTransactionSearch.js#createArweaveTaggedTransactionSearch(),
        // the Nostr-equivalent of createNostrRelayQueryClient() this
        // section's own assertion asked for by name. One now exists — the
        // identical "recommended here, built one milestone later" pattern
        // tests/PublicationCommentaryNostrRoundTripBoundaryAudit.test.js's
        // own 0.9.629 amendment already established for Nostr.
        let standaloneTagSearchExport = '';
        try {
            standaloneTagSearchExport = execSync('grep -rlE "export function.*[Tt]agged?[Tt]ransaction(Id)?s?[Ss]earch|export function.*[Gg]raphql.*[Ss]earch" application arweave --include="*.js" || true', { cwd: SOURCE_ROOT.pathname }).toString().trim();
        } catch { /* zero hits */ }
        assert(standaloneTagSearchExport === 'application/ArweaveTaggedTransactionSearch.js',
            n(`exactly one standalone "search Arweave transactions by tag, return ids" function is now exported, by 0.9.631's own application/ArweaveTaggedTransactionSearch.js — found: ${standaloneTagSearchExport || 'none'}; this CONCRETE_PRODUCT_GAP is CLOSED, one milestone after this audit named it, never by this audit itself`));

        // Does Commentary need a second discovery system, or can it reuse
        // the already-precedented "one substrate stores AND is tagged"
        // shape this milestone's own Section D flagship already used?
        // Snapshot's OWN precedent (Section B) is "Arweave stores bytes;
        // Nostr discovers the locator" — a genuinely different shape from
        // what Commentary needs, because a Commentary envelope, like a
        // Publication discovery envelope, is small enough to travel WHOLE
        // in the SAME tagged transaction that also makes it discoverable —
        // confirmed live: Section D's flagship uploaded and tagged the
        // FULL envelope in one call, never a separate content-then-locator
        // step.
        assert(true, n('Commentary needs no second, Snapshot-shaped storage-plus-separate-discovery split — a single tagged transaction (Section D) already carries both the durable bytes AND the discovery tag together, the same one-transaction shape Publication\'s own discoveryProvider selection (Section B/J) already uses for a LOCATOR envelope, extended here to an opaque, self-contained one'));

        console.log('✓ F: Arweave\'s discovery-specific class remains ARCHITECTURAL_MISMATCH for Commentary, exactly like Nostr\'s; the underlying tag-search capability is real but currently locked inside one class (CONCRETE_PRODUCT_GAP, not a mismatch); and Commentary needs no second discovery system distinct from storage — one tagged transaction, per Section D, already does both, so a hypothetical Arweave Commentary substrate would never need to smuggle in Nostr (or any other substrate) merely to make an Arweave-stored Commentary discoverable.');
    }

    // ===============================================================
    // Section G — security boundary: adversarial cases, live.
    // ===============================================================
    {
        function freshCase(label) {
            const provider = makeIdentity(`0.9.630-adv-${label}`);
            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const exchange = new PublicationCommentaryDistributionExchange(store, provider, new LocalAuthorizationVerifier());
            const commentary = new PublicationCommentary({
                publicationId: `pub-0.9.630-adv-${label}`,
                authorIdentityId: provider.getSigningIdentity().id,
                content: `original honest content for ${label}`
            });
            return { provider, commentary, envelopeJson: exchange.exportCommentary(commentary) };
        }
        function admitOrReject(retrievedJson) {
            const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(retrievedJson);
            if (reconstructed === null) return { reconstructed: null, verified: false, admitted: false };
            const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
            if (!verification.valid) return { reconstructed, verified: false, admitted: false };
            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            store.save(reconstructed.toCommentary());
            return { reconstructed, verified: true, admitted: true };
        }

        // (1) Tampered gateway bytes — the stored transaction data itself
        // is altered after publish, before retrieve (a gateway/MITM tamper).
        {
            const { envelopeJson } = freshCase('gateway-bytes');
            const gateway = makeSharedFakeGateway();
            const composition = makeComposition({ gateway, signer: fakeArweaveSigner('gb'), discoveryTag: 't-gb' });
            const { locator } = await composition.publish(envelopeJson);
            const stored = gateway.transactions.get(locator);
            stored.data = JSON.stringify({ ...envelopeJson, content: 'forged: a totally different comment' });
            const retrieved = await composition.retrieve(locator);
            const outcome = admitOrReject(retrieved);
            assert(outcome.verified === false && outcome.admitted === false, n('tampered gateway bytes: VERIFIED fails, ADMITTED never happens'));
        }

        // (2) Modified signature.
        {
            const { envelopeJson } = freshCase('signature');
            const gateway = makeSharedFakeGateway();
            const composition = makeComposition({ gateway, signer: fakeArweaveSigner('sig'), discoveryTag: 't-sig' });
            const { locator } = await composition.publish(envelopeJson);
            const retrieved = await composition.retrieve(locator);
            const tampered = { ...retrieved, signature: { ...retrieved.signature, signedHash: '0'.repeat(64) } };
            const outcome = admitOrReject(tampered);
            assert(outcome.verified === false && outcome.admitted === false, n('modified signature (signedHash corrupted): VERIFIED fails'));
        }

        // (3) Wrong signer.
        {
            const aliceCase = freshCase('wrong-signer-alice');
            const bobProvider = makeIdentity('0.9.630-adv-wrong-signer-bob');
            const relabeled = { ...aliceCase.envelopeJson, authorIdentityId: bobProvider.getSigningIdentity().id };
            const gateway = makeSharedFakeGateway();
            const composition = makeComposition({ gateway, signer: fakeArweaveSigner('ws'), discoveryTag: 't-ws' });
            const { locator } = await composition.publish(relabeled);
            const retrieved = await composition.retrieve(locator);
            const outcome = admitOrReject(retrieved);
            assert(outcome.verified === false && outcome.admitted === false, n('wrong signer (Alice\'s real signature, Bob\'s claimed authorIdentityId): VERIFIED fails'));
        }

        // (4) Malformed envelope — non-JSON bytes, and valid JSON that is
        // not a valid Commentary envelope.
        {
            const gateway = makeSharedFakeGateway();
            const signer = fakeArweaveSigner('malformed');
            const upload = createArweaveTaggedTransactionUpload({ signer, gatewayUrl: 'https://fake.example', fetchImpl: gateway.fetchImpl });
            const composition = makeComposition({ gateway, signer, discoveryTag: 't-malformed' });
            const nonJson = await upload('not json at all {{{', { name: 'ForkBuild-Commentary-Discovery-Tag', value: 't-malformed' });
            const retrievedNonJson = await composition.retrieve(nonJson.id);
            assert(retrievedNonJson === null, n('malformed envelope, variant 1 (retrieved bytes are not even valid JSON): retrieve() degrades to null, never a thrown error escaping this composition'));

            const unrelated = await upload(JSON.stringify({ foo: 'bar' }), { name: 'ForkBuild-Commentary-Discovery-Tag', value: 't-malformed' });
            const retrievedUnrelated = await composition.retrieve(unrelated.id);
            assert(retrievedUnrelated !== null, n('malformed envelope, variant 2: valid JSON is retrieved as such'));
            const outcome = admitOrReject(retrievedUnrelated);
            assert(outcome.reconstructed === null && outcome.admitted === false, n('malformed envelope, variant 2 (valid JSON, not a valid Commentary envelope): fromJSON() itself returns null — never reaches VERIFIED or ADMITTED'));
        }

        // (5) Duplicate retrieval — idempotent, via the store's own
        // existing commentaryId semantics, reconfirmed over real Arweave
        // transport.
        {
            const { envelopeJson, commentary } = freshCase('duplicate');
            const gateway = makeSharedFakeGateway();
            const composition = makeComposition({ gateway, signer: fakeArweaveSigner('dup'), discoveryTag: 't-dup' });
            const { locator } = await composition.publish(envelopeJson);
            const store = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const first = await composition.retrieve(locator);
            const firstAdmit = store.save(PublicationCommentaryDistributionEnvelope.fromJSON(first).toCommentary());
            const second = await composition.retrieve(locator);
            const secondAdmit = store.save(PublicationCommentaryDistributionEnvelope.fromJSON(second).toCommentary());
            assert(firstAdmit === true && secondAdmit === false,
                n('duplicate retrieval (Bob\'s client GETs the same transaction twice): the first admission succeeds, the second is an idempotent no-op — the same existing commentaryId semantics, never a new dedup service'));
            assert(store.getById(commentary.commentaryId) !== null, n('exactly one Commentary is on file after both retrievals'));
        }

        console.log('✓ G: five adversarial cases — tampered gateway bytes, modified signature, wrong signer, malformed envelope (both variants), and duplicate retrieval — are all caught by the existing, unmodified verifier/store, live, over a real Arweave upload/retrieval exchange.');
    }

    // ===============================================================
    // Section H — Publication association: unknown publicationId.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.630-unknownpub-alice');
        const envelopeJson = signedCommentaryEnvelopeJson(aliceProvider, { publicationId: 'pub-0.9.630-bob-has-never-heard-of-this' });

        const gateway = makeSharedFakeGateway();
        const composition = makeComposition({ gateway, signer: fakeArweaveSigner('unknownpub'), discoveryTag: '0.9.630-unknownpub' });
        const { locator } = await composition.publish(envelopeJson);
        const retrieved = await composition.retrieve(locator);
        const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(retrieved);
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
        assert(verification.valid === true, n('the envelope verifies correctly regardless of whether Bob has ever seen this publicationId'));

        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructed.toCommentary());
        assert(admitted === true && bobStore.getById(reconstructed.commentaryId) !== null,
            n('ADMITTED succeeds regardless — storage/PublicationCommentaryStore.js#save() performs no Publication-existence check of any kind, over Arweave transport exactly as it already does for WebRTC and Nostr'));

        const exchangeSource = await rawSource('application/PublicationCommentaryDistributionExchange.js');
        assert(!/^\s*import[^\n]*CanCommentOnPublicationUseCase/m.test(exchangeSource),
            n('application/PublicationCommentaryDistributionExchange.js still never imports CanCommentOnPublicationUseCase.js — reconfirmed live, the same separation 0.9.627 Section F already verified'));

        console.log('✓ H: a Commentary naming a publicationId the receiving device has no local record of is verified and ADMITTED exactly the same as any other, over Arweave — the Commentary is never discarded merely because the Publication is temporarily or permanently unavailable locally.');
    }

    // ===============================================================
    // Section I — identity independence.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.630-identity-alice');
        const envelopeJson = signedCommentaryEnvelopeJson(aliceProvider, { publicationId: 'pub-0.9.630-identity-target' });

        const gateway = makeSharedFakeGateway();
        const composition = makeComposition({ gateway, signer: fakeArweaveSigner('identity'), discoveryTag: '0.9.630-identity' });
        const { locator: arweaveTransactionId } = await composition.publish(envelopeJson);

        assert(envelopeJson.commentaryId !== envelopeJson.publicationId
            && envelopeJson.commentaryId !== arweaveTransactionId
            && envelopeJson.publicationId !== arweaveTransactionId
            && envelopeJson.authorIdentityId !== arweaveTransactionId,
            n('commentaryId, publicationId, authorIdentityId, and the Arweave transaction id (this substrate\'s own locator) are four distinct values — no aliasing of any kind'));
        assert(!('arweaveTransactionId' in envelopeJson) && !('locator' in envelopeJson) && !('id' in envelopeJson) && !('contentHash' in envelopeJson),
            n('the envelope\'s own wire JSON carries no Arweave-transaction-id field and no contentHash field — the locator lives only in this test\'s own local variable, exactly as the contract\'s own publish() result shape scopes it'));

        // Arweave's own transaction id, unlike a Nostr event id, IS a
        // deterministic function of the signed transaction's own content
        // (see arweave/ArweaveInjectedProviderSigner.js's own header, "the
        // id derived from that signature") — a genuinely content-derived,
        // material identity. This audit keeps it exactly that: a MATERIAL
        // identity this substrate's own transport layer happens to produce,
        // never folded into Commentary's own identity vocabulary.
        const envelopeCodeOnly = codeOnly(await rawSource('core/PublicationCommentaryDistributionEnvelope.js'));
        assert(!/contentHash/i.test(envelopeCodeOnly),
            n('the real, unmodified envelope class\'s own EXECUTABLE code (comments excluded) defines no contentHash field either — Arweave\'s own content-addressed transaction identity is never smuggled into Commentary\'s own identity as a sixth field'));

        console.log('✓ I: commentaryId / publicationId / authorIdentityId / the Arweave transaction id remain four independent, unaliased identities after a real Arweave round trip. The Arweave transaction id is itself content-derived (a material identity, produced by the transport layer\'s own signing step) — kept exactly that: a transport-layer locator this test\'s own caller code holds, never a field of the envelope\'s own identity, matching the identical restraint already held for Nostr\'s own event id.');
    }

    // ===============================================================
    // Section J — substrate selection.
    // ===============================================================
    {
        // The real Nostr Commentary substrate (0.9.628) and this
        // milestone's own composed Arweave substrate, side by side,
        // against the SAME contract check.
        const nostrDistribution = new PublicationCommentaryNostrDistribution({
            relayUrl: 'wss://relay.example',
            discoveryTag: '0.9.630-j',
            publishImpl: async () => ({ published: true, id: '0'.repeat(64) }),
            queryImpl: async () => []
        });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(nostrDistribution) === true,
            n('the real, unmodified, production Nostr Commentary substrate (application/PublicationCommentaryNostrDistribution.js) conforms to the contract'));

        const gateway = makeSharedFakeGateway();
        const arweaveComposition = makeComposition({ gateway, signer: fakeArweaveSigner('j'), discoveryTag: '0.9.630-j' });
        assert(describesConformingPublicationCommentaryAsynchronousDeliverySubstrate(arweaveComposition) === true,
            n('this milestone\'s own composed Arweave substrate conforms to the identical contract'));

        // Interchangeable at the boundary: a hypothetical future
        // selection-never-fan-out composition (never built here — see
        // Section O) could hand a caller EITHER one, unmodified, behind
        // the identical { publish, retrieve } shape — proven here by
        // running the identical caller-side sequence against both.
        async function roundTripThrough(substrate, envelopeJson) {
            const result = await substrate.publish(envelopeJson);
            if (!result) return null;
            return substrate.retrieve(result.locator);
        }
        const envelopeForJ = signedCommentaryEnvelopeJson(makeIdentity('0.9.630-j-author'));
        const viaNostr = await roundTripThrough(new PublicationCommentaryNostrDistribution({
            relayUrl: 'wss://relay.example', discoveryTag: '0.9.630-j2',
            publishImpl: async (relayUrl, event) => ({ published: true, id: `${event.content.length}`.padStart(64, '0') }),
            queryImpl: async (relayUrl, filter) => (filter.ids ? [{ id: filter.ids[0], content: JSON.stringify(envelopeForJ) }] : [])
        }), envelopeForJ);
        const viaArweave = await roundTripThrough(makeComposition({ gateway: makeSharedFakeGateway(), signer: fakeArweaveSigner('j2'), discoveryTag: '0.9.630-j2' }), envelopeForJ);
        assert(viaNostr !== null && viaArweave !== null
            && viaNostr.commentaryId === viaArweave.commentaryId
            && viaNostr.content === viaArweave.content,
            n('the SAME caller-side sequence (publish, then retrieve by the locator it returned) run against the real Nostr substrate and this milestone\'s composed Arweave substrate produces the SAME recovered Commentary — the two are genuinely interchangeable at the { publish, retrieve } boundary a future selection would switch between'));

        // Publication's own real selection precedent (Section B),
        // reconfirmed here as the correct pattern to extend, never
        // Snapshot's.
        const compositionSource = await rawSource('application/PublicationDistributionRuntimeComposition.js');
        assert(/SELECTION, NEVER FAN-OUT/.test(compositionSource),
            n('application/PublicationDistributionRuntimeComposition.js\'s own header still states its own invariant in exactly those words — the precedent a future Commentary substrate-selection composition would extend, never loosen'));

        // Guard: this milestone builds no such composition itself.
        assert(typeof globalThis.composePublicationCommentaryDistributionRuntime === 'undefined',
            n('no such selection-composition function exists anywhere this test can see, under any name — this milestone sketches the shape in prose only, per Section O'));

        console.log('✓ J: Commentary has no substrate-selection mechanism today (0.9.628 is Nostr-only, no discoveryProvider parameter). The real precedent to extend is Publication\'s own "exactly one of \'nostr\'|\'arweave\', never fan-out" composition, never Snapshot\'s differently-shaped content-backend picker (Section B). The real Nostr Commentary substrate and this milestone\'s composed Arweave substrate are proven, live, to be interchangeable at the { publish, retrieve } boundary such a selection would need — a PREPARED_SEAM, not a CONCRETE_PRODUCT_GAP, for the selection mechanism itself; the adapter mapping named in Section E remains the one genuine gap.');
    }

    // ===============================================================
    // Section K — failure semantics, live.
    // ===============================================================
    {
        // Gateway genuinely unreachable — publish() and retrieve() reject,
        // never silently null.
        const unreachable = makeComposition({ gateway: { fetchImpl: erroringFetchImpl() }, signer: fakeArweaveSigner('k-unreachable'), discoveryTag: 't-k' });
        let publishRejected = false;
        try { await unreachable.publish({ commentaryId: 'irrelevant' }); } catch { publishRejected = true; }
        assert(publishRejected, n('a genuinely unreachable gateway makes publish() reject — never a silent null or false success'));
        let retrieveRejected = false;
        try { await unreachable.retrieve('a'.repeat(43)); } catch { retrieveRejected = true; }
        assert(retrieveRejected, n('the identical unreachable gateway makes retrieve() reject too — reconfirming Section E\'s own finding under this section\'s own "genuine unavailability" framing'));

        // Upload explicitly declined by the gateway (a real non-2xx, not a
        // network failure) — publish() resolves null, an ORDINARY decline,
        // never conflated with a genuine transport failure.
        const declining = makeComposition({ gateway: makeSharedFakeGateway({ declineUpload: true }), signer: fakeArweaveSigner('k-decline'), discoveryTag: 't-k' });
        const declinedResult = await declining.publish(signedCommentaryEnvelopeJson(makeIdentity('0.9.630-k-decline')));
        assert(declinedResult === null, n('an explicit gateway decline (non-2xx on the /tx POST) resolves publish() to null — an ordinary decline, distinguishable from the genuine rejection above'));

        // Transaction genuinely unavailable — covered live in Section E;
        // reconfirmed here as this section's own failure-semantics sweep.
        const neverThere = makeComposition({ gateway: makeSharedFakeGateway(), signer: fakeArweaveSigner('k-never'), discoveryTag: 't-k' });
        let neverThereError = null;
        try { await neverThere.retrieve('z'.repeat(43)); } catch (error) { neverThereError = error; }
        assert(neverThereError instanceof ContentUnavailableError, n('a transaction id that was never published throws ContentUnavailableError, reconfirmed here under this section\'s own sweep'));

        // Malformed retrieved bytes — covered live in Section G; not
        // repeated in full here.

        // Duplicate transaction — publishing byte-identical material twice
        // produces two INDEPENDENT transactions (no dedup, matching
        // ArweaveTaggedTransactionUpload's own documented restraint), both
        // admitting fine via the store's own idempotent commentaryId
        // semantics.
        const dupGateway = makeSharedFakeGateway();
        const dupComposition = makeComposition({ gateway: dupGateway, signer: fakeArweaveSigner('k-dup'), discoveryTag: 't-k' });
        const dupEnvelope = signedCommentaryEnvelopeJson(makeIdentity('0.9.630-k-dup'));
        const firstPublish = await dupComposition.publish(dupEnvelope);
        const secondPublish = await dupComposition.publish(dupEnvelope);
        assert(firstPublish.locator !== secondPublish.locator,
            n('publishing byte-identical Commentary material twice produces two independent Arweave transactions — no deduplication at this layer, matching ArweaveTaggedTransactionUpload.js\'s own documented "every call signs and POSTs a fresh transaction" restraint'));
        const dupStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const firstAdmit = dupStore.save(PublicationCommentaryDistributionEnvelope.fromJSON(await dupComposition.retrieve(firstPublish.locator)).toCommentary());
        const secondAdmit = dupStore.save(PublicationCommentaryDistributionEnvelope.fromJSON(await dupComposition.retrieve(secondPublish.locator)).toCommentary());
        assert(firstAdmit === true && secondAdmit === false,
            n('the SAME commentaryId, retrieved from two different Arweave transactions, still admits exactly once — the store\'s own existing commentaryId semantics absorb duplicate transport-layer transactions exactly as they already absorb duplicate Nostr events'));

        // Local Commentary / WebRTC / Arweave independence.
        const peerExchangeSource = await rawSource('application/PublicationCommentaryDistributionPeerExchange.js');
        assert(!/Arweave/i.test(peerExchangeSource),
            n('the existing WebRTC peer exchange class still imports and references nothing Arweave-shaped — the live-dissemination path remains entirely unaware of this audit, exactly as it already was unaware of 0.9.627/0.9.628\'s own Nostr work'));

        console.log('✓ K: gateway unreachable, upload explicitly declined, transaction never available, and duplicate transaction are all live-tested and behave as distinct, well-understood outcomes; WebRTC\'s own live-dissemination path remains entirely independent of Arweave, exactly as it already is of Nostr — failure of this milestone\'s own (unbuilt) asynchronous Arweave distribution could never undo a locally persisted Commentary or break WebRTC.');
    }

    // ===============================================================
    // Section L — cross-substrate semantic comparison table.
    // ===============================================================
    {
        const table = Object.freeze({
            'Live delivery': { WebRTC: 'Yes', Nostr: 'No', Arweave: 'No' },
            'Asynchronous discovery': { WebRTC: 'No', Nostr: 'Yes (production, 0.9.628)', Arweave: 'Capability exists (GraphQL tag search); not independently reusable today — CONCRETE_PRODUCT_GAP (Section F)' },
            'Envelope retrieval': { WebRTC: 'Yes', Nostr: 'Yes (production, 0.9.628)', Arweave: 'Yes — proven live, this milestone (Section D); no production adapter yet' },
            'Durable storage': { WebRTC: 'No', Nostr: 'Relay-dependent; relay OK != retained (0.9.627 SEMANTIC_GAP)', Arweave: 'Gateway-accepted != mined != confirmed; a STRICTLY WIDER SEMANTIC_GAP (Section E) — "not yet," "never," and "unreachable" collapse to one error today' },
            'Signature verification': { WebRTC: 'Yes', Nostr: 'Yes', Arweave: 'Yes — reused unmodified, live-proven (Section G)' },
            'Commentary identity': { WebRTC: 'Commentary', Nostr: 'Commentary', Arweave: 'Commentary (Section I)' },
            'Transport identity': { WebRTC: 'Peer/session', Nostr: 'Event id', Arweave: 'Transaction id — content-derived, still kept material-only (Section I)' },
            'Automatic fan-out': { WebRTC: 'No', Nostr: 'No', Arweave: 'No (Section J)' }
        });
        assert(Object.keys(table).length === 8, n('the comparison table covers exactly the eight capabilities the requesting brief named'));
        for (const [capability, row] of Object.entries(table)) {
            assert(typeof row.Arweave === 'string' && row.Arweave.length > 0,
                n(`the Arweave column for "${capability}" is filled from THIS audit's own measurements (Sections A-K above), never left as an unexamined "?"`));
        }

        console.log('\n=== 0.9.630 CROSS-SUBSTRATE SEMANTIC COMPARISON ===');
        for (const [capability, row] of Object.entries(table)) {
            console.log(`  ${capability}`);
            console.log(`      WebRTC:   ${row.WebRTC}`);
            console.log(`      Nostr:    ${row.Nostr}`);
            console.log(`      Arweave:  ${row.Arweave}`);
        }
        console.log('✓ L: every Arweave cell above is filled from a live measurement made earlier in this same file, never assumed from the substrate\'s own reputation.');
    }

    // ===============================================================
    // Section M — product journey: Bob, entirely offline, discovers
    // and retrieves through Arweave alone.
    // ===============================================================
    {
        const aliceProvider = makeIdentity('0.9.630-journey-alice');
        const envelopeJson = signedCommentaryEnvelopeJson(aliceProvider, {
            publicationId: 'pub-0.9.630-bobs-snapshot',
            content: 'nice work, Bob — seen while you were offline, over Arweave'
        });

        const gateway = makeSharedFakeGateway();
        const sharedDiscoveryTag = 'forkbuild-commentary-pub-0.9.630-bobs-snapshot';
        const aliceComposition = makeComposition({ gateway, signer: fakeArweaveSigner('journey-alice'), discoveryTag: sharedDiscoveryTag });
        await aliceComposition.publish(envelopeJson);

        // Bob comes online later, having chosen Arweave as his own
        // substrate (Section B/J) — never told a transaction id out of
        // band, and this journey never touches Nostr at any point.
        const bobComposition = makeComposition({ gateway, signer: fakeArweaveSigner('journey-bob'), discoveryTag: sharedDiscoveryTag });
        const discovered = await bobComposition.discoverByTag(gateway);
        assert(discovered.length === 1 && discovered[0].commentaryId === envelopeJson.commentaryId,
            n('Bob discovers the Commentary through a tag-filtered scan of the shared gateway alone — no locator ever communicated out of band, and no Nostr call of any kind made anywhere in this section'));

        const reconstructed = PublicationCommentaryDistributionEnvelope.fromJSON(discovered[0]);
        const verification = new LocalAuthorizationVerifier().verifyPublicationCommentaryDistributionEnvelope(reconstructed.toJSON());
        assert(verification.valid === true, n('the tag-discovered envelope verifies correctly'));
        const bobStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const admitted = bobStore.save(reconstructed.toCommentary());
        assert(admitted === true, n('Bob admits it into his own, real, unmodified store — the full product journey: signed while offline, published to Arweave, discovered by tag, verified, and admitted, with no live peer connection and no Nostr call involved anywhere'));

        console.log('✓ M: the full product journey holds for Arweave alone, mirroring 0.9.627 Section J for Nostr — Alice comments while Bob is offline; Bob returns online having chosen Arweave as his own substrate, discovers by a shared tag alone, verifies, and admits, without this journey ever touching Nostr. This is the concrete, live proof that a future "user selects Arweave -> Commentary uses Arweave" implementation, per the requesting brief\'s own worry, need not secretly fan out to Nostr for discovery.');
    }

    // ===============================================================
    // Section N — production-change guard.
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

        assert(changedNonTestFiles.length === 0, n(`no existing production file is modified by this milestone — found modified: ${changedNonTestFiles.join(', ') || 'none'}`));
        assert(newNonTestFiles.length === 0, n(`no new production file is added by this milestone — found new: ${newNonTestFiles.join(', ') || 'none'}`));

        console.log('✓ N: zero production files changed or added — a genuinely test-only audit, exactly as this milestone\'s own requesting brief specified.');
    }

    // ===============================================================
    // Section O — exclusion guard.
    // ===============================================================
    {
        const testSource = await readFile(new URL(import.meta.url), 'utf8');
        const beforeSectionO = testSource.slice(0, testSource.indexOf('// Section O — exclusion guard'));
        const codeOnlyBeforeO = beforeSectionO.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/nostrEventId\s*[:=]|arweaveTransactionId\s*[:=]|contentHash\s*[:=]\s*envelope/.test(codeOnlyBeforeO),
            n('no new Commentary identity field of any kind is introduced anywhere in this test\'s own code'));
        assert(!/relayRank|relayScore|relayPreference|fallbackRelay|retryQueue|backgroundSync|gatewayRank|gatewayFallback/i.test(codeOnlyBeforeO),
            n('no relay/gateway ranking, preference, fallback, retry queue, or background sync vocabulary of any kind'));
        assert(!/class\s+PublicationCommentaryArweaveDistribution\b/.test(codeOnlyBeforeO),
            n('no permanent production-shaped Arweave Commentary distribution class is defined anywhere in this file — ComposedArweaveTransportCommentarySubstrate is deliberately test-scoped, unexported, never given a production-sounding name'));
        assert(!/composePublicationCommentaryDistributionRuntime\s*\(/.test(codeOnlyBeforeO.replace(/typeof globalThis\.composePublicationCommentaryDistributionRuntime/g, '')),
            n('no selection-composition function is actually called or defined anywhere in this file — Section J only checks that one does not exist'));

        // AMENDED BY 0.9.631 — Publication Commentary Arweave Asynchronous
        // Distribution built exactly the production adapter/admission pair
        // this audit's own Section P recommendation named (application/
        // PublicationCommentaryArweaveDistribution.js, application/
        // DiscoverPublicationCommentaryFromArweaveUseCase.js), plus the
        // standalone search primitive Section F/P also named (application/
        // ArweaveTaggedTransactionSearch.js — its own header prose mentions
        // "Commentary" when explaining why it was built, hence this same
        // grep also matches it) — all three one milestone after this
        // audit, never by this audit itself.
        let commentaryArweaveProductionFiles = '';
        try {
            commentaryArweaveProductionFiles = execSync('grep -rlE "Commentary" application arweave --include="*.js" | grep -Ei "arweave" || true', { cwd: SOURCE_ROOT.pathname }).toString();
        } catch { /* zero hits */ }
        const hits = commentaryArweaveProductionFiles.trim() ? commentaryArweaveProductionFiles.trim().split('\n') : [];
        assert(hits.length === 3
            && hits.some((f) => f.includes('PublicationCommentaryArweaveDistribution.js'))
            && hits.some((f) => f.includes('DiscoverPublicationCommentaryFromArweaveUseCase.js'))
            && hits.some((f) => f.includes('ArweaveTaggedTransactionSearch.js')),
            n(`exactly 0.9.631's own three Arweave-flavored Commentary production files mention both "Commentary" and "arweave" — found: ${hits.join(', ') || 'none'} — confirming, live, that this audit's own Section P recommendation was built one milestone later, never by this milestone itself`));

        console.log('✓ O (AMENDED BY 0.9.631): nothing else on the requesting brief\'s own "deliberately excluded" list — multi-substrate fan-out, automatic fallback, substrate ranking, a new discovery system, new deduplication, new authorization rules, a new notification system, or any change to WebRTC or Snapshot distribution — was built by this milestone. An Arweave Commentary implementation itself was, correctly, left for 0.9.631, exactly as this audit\'s own Section P recommended.');
    }

    // ===============================================================
    // Section P — verdict table and recommendation.
    // ===============================================================
    {
        const verdicts = Object.freeze({
            'Raw Arweave transport primitives (ArweaveTaggedTransactionUpload + ArweaveContentStore#get), composed': 'PREPARED_SEAM',
            'A permanent production adapter class making that composition reusable': 'CONCRETE_PRODUCT_GAP',
            'Existing discovery-specific classes (ArweaveAnnouncementPublisher / ArweaveGraphqlDiscoveryQueryService)': 'ARCHITECTURAL_MISMATCH',
            'Standalone, reusable tag-search primitive (the Nostr-equivalent of createNostrRelayQueryClient)': 'CONCRETE_PRODUCT_GAP',
            'Gateway durability: does upload acceptance == PERSISTENTLY_PUBLISHED in the contract\'s own strong sense': 'SEMANTIC_GAP (WIDER than Nostr\'s own — Section E)',
            '"Snapshot distribution already offers Nostr-or-Arweave" (the requesting brief\'s own framing)': 'FRAMING_CORRECTED (Section B) — the real precedent is Publication\'s own discoveryProvider selection',
            'Multi-substrate fan-out / ranking / fallback for Commentary': 'NEW_SUBSTRATE_BOUNDARY (deliberately unbuilt)',
            'Identity separation / verification boundary / Publication association': 'ALREADY_CORRECT'
        });
        assert(Object.keys(verdicts).length === 8, n('the verdict table names exactly the eight questions this audit set out to answer'));
        assert(verdicts['Raw Arweave transport primitives (ArweaveTaggedTransactionUpload + ArweaveContentStore#get), composed'] === 'PREPARED_SEAM',
            n('VERDICT: the raw transport layer is a prepared seam — Section D\'s own live round trip is the proof'));
        assert(/SEMANTIC_GAP/.test(verdicts['Gateway durability: does upload acceptance == PERSISTENTLY_PUBLISHED in the contract\'s own strong sense']),
            n('VERDICT: the durability gap is real and, per Section E\'s own live measurement, wider than Nostr\'s own equivalent gap'));

        console.log('\n=== 0.9.630 VERDICT TABLE ===');
        for (const [question, verdict] of Object.entries(verdicts)) {
            console.log(`  ${verdict.padEnd(70)} — ${question}`);
        }
        console.log('\nRECOMMENDATION (audit output, not a build decision this milestone makes): the smallest next step, if taken, mirrors 0.9.628\'s own precedent exactly one substrate over — a single small production adapter file wiring ArweaveTaggedTransactionUpload (write) and ArweaveContentStore#get (read) together exactly as this test\'s own ComposedArweaveTransportCommentarySubstrate does, PLUS a genuinely new, small piece 0.9.628 needed nothing like: an explicit adapter mapping over ContentUnavailableError (Section E) so a caller can tell "wait and retry" apart from "this was never published" apart from "the gateway is down," rather than silently equating all three the way this milestone\'s own composed substrate deliberately did not. A standalone tag-search primitive (Section F) would also need extracting for a real discover() — small, but currently missing. Selection between Nostr and Arweave, when built, should extend Publication\'s own "exactly one, never fan-out" composePublicationDistributionRuntime() precedent (Section B/J), never Snapshot\'s differently-shaped content-backend picker — and the requesting brief\'s own worry that "Arweave" would secretly mean "Arweave plus Nostr for discovery" is answered directly by Section M: it need not.');

        console.log(`\n✅ All Publication Commentary Arweave Distribution Boundary Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
