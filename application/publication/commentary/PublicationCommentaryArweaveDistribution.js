import { ArweaveContentStore } from '../../../content/ArweaveContentStore.js';
import { ContentUnavailableError } from '../../../content/IpfsContentStore.js';
import { createArweaveTaggedTransactionUpload } from '../../arweave/ArweaveTaggedTransactionUpload.js';
import { createArweaveTaggedTransactionSearch } from '../../arweave/ArweaveTaggedTransactionSearch.js';

const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
const DEFAULT_TAG_NAME = 'ForkBuild-Commentary-Discovery-Tag';
const DEFAULT_DISCOVERY_TAG = 'forkbuild-commentary';
const DEFAULT_TIMEOUT_MS = 15000;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// 0.9.631 — Publication Commentary Arweave Asynchronous Distribution.
//
// tests/PublicationCommentaryArweaveDistributionBoundaryAudit.test.js
// (0.9.630) found this exact seam PREPARED, entirely inside a test file: a
// composition of `application/arweave/ArweaveTaggedTransactionUpload.js` (write) and
// `content/ArweaveContentStore.js#get()` (read) — two already-existing,
// already-production-wired transport primitives that never parse or care
// what an uploaded transaction's own bytes hold — already duck-type-conforms
// to `core/PublicationCommentaryAsynchronousDeliveryContract.js`'s own
// `{ publish, retrieve }` contract (0.9.626), carrying a real, signed
// `application/PublicationCommentaryDistributionEnvelope.js` through a live
// Arweave upload/retrieval round trip, byte for byte. That audit's own
// recommendation named two things still missing: "a single small production
// adapter file," exactly like 0.9.628 built for Nostr one substrate over,
// PLUS a genuinely new piece 0.9.628 needed nothing like — a standalone
// tag-search primitive for a real `discover()` (Section F), and an explicit
// acknowledgment, never a naive status mapping, of Arweave's own wider
// durability SEMANTIC_GAP (Section E). This file is that adapter; `application/
// ArweaveTaggedTransactionSearch.js` (this same milestone) is that missing
// search primitive.
//
//   PublicationCommentaryDistributionExchange#exportCommentary()   (0.9.618,
//        │                                                          unmodified
//        │                                                          — signs)
//        ▼
//   PublicationCommentaryArweaveDistribution#publish(envelopeJson)   ★ (THIS)
//        │  material = JSON.stringify(envelopeJson)
//        │  tag = { name: tagName, value: discoveryTag }
//        ▼
//   uploadTaggedTransaction(material, tag)   (application/
//        │                                    ArweaveTaggedTransactionUpload.js,
//        │                                    unmodified — signs, tags,
//        │                                    POSTs <gatewayUrl>/tx)
//        ▼
//   { published: true, locator: <transaction id> }   |   null
//
//   PublicationCommentaryArweaveDistribution#retrieve(locator)   ★ (THIS)
//        │  ArweaveContentStore#get({ uri: `ar://${locator}` })   (content/
//        │                                                         ArweaveContentStore.js,
//        │                                                         unmodified
//        │                                                         — GETs
//        │                                                         <gatewayUrl>/<id>)
//        ▼
//   envelopeJson   |   null (malformed locator only)   |   rejects with
//   ContentUnavailableError (see "THE DURABILITY GAP IS REAL," below)
//
//   PublicationCommentaryArweaveDistribution#discover()   ★ (THIS)
//        │  searchTaggedTransactionIds(discoveryTag)   (application/
//        │   ArweaveTaggedTransactionSearch.js, this same milestone —
//        │   GraphQL tag search, genuine failure REJECTS)
//        ▼
//   string[] of candidate transaction ids
//        │  per-candidate ArweaveContentStore#get() — a single candidate's
//        │  own failure is SKIPPED, never fatal to the batch (see "ONE BAD
//        │  CANDIDATE," below)
//        ▼
//   envelopeJson[]
//
// AN OPAQUE ENVELOPE CARRIER, NEVER A SECOND COMMENTARY AUTHORITY — THE
// IDENTICAL RESTRAINT `application/publication/commentary/PublicationCommentaryNostrDistribution.js`
// (0.9.628) ALREADY HOLDS, ONE SUBSTRATE OVER. This class never imports
// `core/PublicationCommentary.js`, `core/PublicationCommentaryDistributionEnvelope.js`,
// or `application/publication/commentary/PublicationCommentaryDistributionExchange.js`. It treats
// `envelopeJson` as a plain, opaque object to serialize into a transaction's
// own body and back — `uploadTaggedTransaction`/`ArweaveContentStore#get()`
// already hold this restraint one layer down; this file adds no vocabulary
// of its own on top. Every question about whether a retrieved envelope is
// genuinely signed by its own claimed author is answered entirely by the
// EXISTING, UNMODIFIED `PublicationCommentaryDistributionExchange`/
// `LocalAuthorizationVerifier` — a caller's job, never this file's, exactly
// as `application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js` (this
// same milestone) already holds it.
//
// PUBLISH(envelopeJson) TAKES AN ALREADY-SIGNED ENVELOPE — THIS FILE NEVER
// SIGNS COMMENTARY ITSELF (the injected `signer` signs the ARWEAVE
// TRANSACTION carrying it, a wholly different signature). The caller is
// expected to have already called `PublicationCommentaryDistributionExchange#
// exportCommentary(commentary)` (0.9.618, unmodified) — the exact same
// signed JSON both the WebRTC path and the Nostr path (0.9.628) already send,
// unmodified, given a third transport here.
//
// A SINGLE, FIXED CAMPAIGN DISCOVERY TAG, NEVER A PER-PUBLICATION ONE — THE
// SAME SHAPE `PublicationCommentaryNostrDistribution.js`'s OWN
// `'forkbuild-commentary'` ALREADY HOLDS, EXTENDED HERE. `discoveryTag`
// defaults to `'forkbuild-commentary'` — the identical DEFAULT value, but a
// SEPARATE campaign at the transport level: it is carried under this file's
// own `tagName` (`'ForkBuild-Commentary-Discovery-Tag'`), an Arweave Tag
// name distinct from `PUBLICATION_DISCOVERY_TAG`'s own Arweave tag name, so
// a Commentary tagged transaction can never be mistaken for a Publication
// announcement merely because both instances default to a similarly-spelled
// tag VALUE. `discover()` returns every envelope published under this one
// campaign; a caller (`application/
// DiscoverPublicationCommentaryFromArweaveUseCase.js`) filters the results
// by `publicationId` itself — the identical division of labor 0.9.628
// already holds for Nostr.
//
// THE DURABILITY GAP IS REAL, NEVER SMOOTHED OVER BY THIS FILE. 0.9.630's
// own Section E measured this live: Arweave's own "gateway accepted this for
// broadcast" (this file's own `publish()` resolving `{ published: true }`)
// is genuinely weaker than "durably retrievable" — a transaction can be
// accepted and not yet mined, and `content/ArweaveContentStore.js#get()`
// throws the IDENTICAL `ContentUnavailableError` for that case, for a
// transaction that was NEVER published at all, and for a gateway that is
// simply unreachable. This is STRICTLY WIDER than the gap
// `PublicationCommentaryNostrDistribution.js`'s own `retrieve()` leaves,
// which cleanly resolves `null` for "no matching event" while only
// REJECTING for a genuinely unreachable relay. This file does not invent a
// narrower distinction than the substrate actually offers: `retrieve()`
// below lets `ContentUnavailableError` propagate UNCAUGHT, exactly as
// `ArweaveContentStore#get()` itself already documents doing — never
// remapped to a bare `null` that would falsely claim "verified: this
// Commentary was never published," and never retried. A caller receiving a
// `ContentUnavailableError` from THIS file's own `retrieve()` knows only
// what 0.9.630 Section E proved a caller can ever know here: "not currently
// retrievable" — for any of three indistinguishable reasons. Per this
// milestone's own requesting brief: "a successful upload/submission should
// not automatically imply that the recipient can immediately discover the
// Commentary" — `publish()` resolving is `PERSISTENTLY_PUBLISHED`, in
// `core/PublicationCommentaryAsynchronousDeliveryContract.js`'s own sense,
// never `DISCOVERABLE`; only a later, independent, successful `retrieve()`
// or `discover()` call earns that.
//
// `retrieve(locator)` RESOLVES `null` ONLY FOR A MALFORMED LOCATOR — NEVER
// FOR "NOT YET RETRIEVABLE." The one case this file itself decides, before
// `ArweaveContentStore#get()` is ever consulted: a `locator` that is not
// even a well-formed Arweave transaction id string. This mirrors
// `ArweaveContentStore#get()`'s own documented discipline, "`null` only
// ever means this reference does not even point at Arweave" — held here one
// layer up, for a locator rather than a `ContentReference`.
//
// ONE BAD CANDIDATE NEVER ABORTS `discover()`'S OWN BATCH — BUT A GENUINE
// SEARCH-STEP FAILURE STILL REJECTS. Two different obligations, deliberately
// not conflated: the top-level tag search
// (`application/arweave/ArweaveTaggedTransactionSearch.js`, this same milestone)
// rejects for a genuine transport failure exactly as
// `nostr/NostrRelayQueryClient.js`'s own raw client does for Nostr, and that
// rejection propagates out of `discover()` unmodified — a caller decides
// whether it is worth surfacing or swallowing, exactly as
// `PublicationCommentaryNostrDistribution.js`'s own header already commits
// to for a `queryImpl` failure. But ONCE a list of candidate transaction ids
// is in hand, fetching each one's own bytes is a PER-CANDIDATE concern: a
// single transaction that is not yet mined, or whose own gateway fetch
// otherwise throws, is silently skipped, never allowed to abort the
// remaining candidates — the identical "one bad candidate never corrupts the
// others" restraint `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`'s
// own `search()` already holds for its own per-candidate envelope fetch, and
// `PublicationCommentaryNostrDistribution.js`'s own `discover()` already
// holds for a single malformed Nostr event's own `content`.
//
// MALFORMED RETRIEVED BYTES ARE SKIPPED, NEVER FATAL. Non-JSON transaction
// bytes, or JSON that is not even a plain object, resolve to `null` from
// `retrieve()` and are simply left out of `discover()`'s own result array —
// this file performs no `PublicationCommentary`-shape validation of its own,
// since it has no such vocabulary; a candidate that is JSON but not a
// well-formed Commentary envelope is `application/
// DiscoverPublicationCommentaryFromArweaveUseCase.js`'s own
// `importCommentaryEnvelope()` call's problem to reject, not this file's —
// the identical division 0.9.628 already holds for Nostr.
//
// ONE GATEWAY, ONE GRAPHQL ENDPOINT, ONE DISCOVERY TAG, PER INSTANCE — NO
// FAN-OUT, NO GATEWAY SELECTION, NO RANKING. The identical restraint every
// sibling in this Arweave family already holds (see `application/
// ArweaveTaggedTransactionUpload.js`'s own header). Multi-gateway resilience
// for Commentary remains a NEW_SUBSTRATE_BOUNDARY, deliberately unbuilt
// here, exactly as multi-relay resilience remains unbuilt for
// `PublicationCommentaryNostrDistribution.js`.
//
// NO RETRY OF ANY KIND — NOT EVEN TO COMPENSATE FOR MINING DELAY. Per this
// milestone's own requesting brief: a substrate adapter is not a background
// delivery orchestration system. `publish()` uploads once;
// `retrieve()`/`discover()` each issue exactly one gateway exchange per
// call. A caller wanting to check again later calls `retrieve()`/
// `discover()` again, itself, on its own schedule — this file starts no
// timer, remembers no locator across calls, and retries nothing on a
// caller's behalf.
//
// DELIBERATELY EXCLUDED FROM 0.9.631 — deliberately absent, not merely
// unimplemented: a retry/synchronization mechanism for mining delay (see
// immediately above); any change to `application/
// PublicationCommentaryNostrDistribution.js`, `application/
// DiscoverPublicationCommentaryFromNostrUseCase.js`, or the existing WebRTC
// path (`application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js`),
// all untouched; automatic fan-out to both Nostr and Arweave from one call
// (see `application/publication/distribution/PublicationDistributionRuntimeComposition.js`'s own
// "SELECTION, NEVER FAN-OUT" — the precedent this milestone's own
// application-layer wiring extends for Commentary, never loosens); any new
// Commentary identity field (no `arweaveTransactionId` on the envelope
// itself — a `publish()` result's own `locator` is a caller-side value,
// never folded into the envelope, the identical restraint
// `PublicationCommentaryNostrDistribution.js`'s own header already holds);
// any change to `content/ArweaveContentStore.js` or `application/
// ArweaveTaggedTransactionUpload.js` themselves, both reused unmodified; any
// change to `application/arweave/ArweaveAnnouncementPublisher.js` or `application/
// ArweaveGraphqlDiscoveryQueryService.js` (the LOCATOR-only classes 0.9.630
// Section C/F reconfirmed remain architectural mismatches for Commentary,
// still untouched); a second Arweave gateway configuration mechanism (a
// caller supplies `gatewayUrl`/`graphqlUrl` exactly as every other Arweave
// adapter in this codebase already does); and multi-gateway fallback,
// relay/gateway ranking, retry queues, background sync, subscriptions,
// read/delivery receipts, or global Commentary indexing of any kind.
export class PublicationCommentaryArweaveDistribution {
    // signer: the shape `arweave/ArweaveInjectedProviderSigner.js` already
    //   produces (`{ sign(material, tags=[]) -> Promise<{ id, transaction }> }`)
    //   — required, no ambient default; forwarded unread to both
    //   `createArweaveTaggedTransactionUpload()` (write) and
    //   `ArweaveContentStore` (constructed for its `get()` only — its own
    //   `put()`-side `sign()` shape is a strict subset of the same
    //   contract, so one signer serves both collaborators).
    // gatewayUrl: which Arweave gateway accepts a transaction POST at
    //   `<gatewayUrl>/tx` and serves raw transaction data at
    //   `<gatewayUrl>/<transaction-id>` — defaults to `arweave.net`,
    //   matching every sibling Arweave adapter in this codebase.
    // graphqlUrl: which Arweave GraphQL gateway `discover()` queries for
    //   tagged transaction ids — defaults to `arweave.net/graphql`.
    // tagName: which Arweave Tag NAME the discovery tag is attached under
    //   (and searched by, for `discover()`) — defaults to
    //   `'ForkBuild-Commentary-Discovery-Tag'`, this substrate's own,
    //   separate campaign namespace (see this file's own header).
    // discoveryTag: this instance's own campaign marker — defaults to
    //   `'forkbuild-commentary'`, matching
    //   `PublicationCommentaryNostrDistribution.js`'s own default VALUE
    //   while remaining a separate campaign at the transport level (this
    //   file's own header).
    // timeoutMs: how long each individual gateway/GraphQL exchange may take
    //   before this instance treats it as a genuine failure.
    constructor({
        signer,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        graphqlUrl = DEFAULT_GRAPHQL_URL,
        tagName = DEFAULT_TAG_NAME,
        discoveryTag = DEFAULT_DISCOVERY_TAG,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            throw new Error('PublicationCommentaryArweaveDistribution: a non-empty discoveryTag is required');
        }
        if (typeof tagName !== 'string' || tagName.length === 0) {
            throw new Error('PublicationCommentaryArweaveDistribution: a non-empty tagName is required');
        }

        this._tagName = tagName;
        this._discoveryTag = discoveryTag;
        this._upload = createArweaveTaggedTransactionUpload({ signer, gatewayUrl, fetchImpl, timeoutMs });
        this._contentStore = new ArweaveContentStore({ signer, gatewayUrl, fetchImpl, timeoutMs });
        this._search = createArweaveTaggedTransactionSearch({ graphqlUrl, tagName, fetchImpl, timeoutMs });

        // Bound so a reference survives being passed around, matching
        // `PublicationCommentaryNostrDistribution.js`'s own constructor.
        this.publish = this.publish.bind(this);
        this.retrieve = this.retrieve.bind(this);
        this.discover = this.discover.bind(this);
    }

    get gatewayUrl() { return this._contentStore.gatewayUrl; }
    get discoveryTag() { return this._discoveryTag; }

    // publish(envelopeJson) -> Promise<{ published: true, locator } | null>.
    // See this file's own header for the full contract: `null` for a
    // gateway that explicitly declined the upload (an ordinary decline,
    // e.g. a non-2xx `/tx` response); a genuine transport/signing failure
    // (no connectivity, no wallet, this instance's own timeout) propagates
    // as a rejection — `uploadTaggedTransaction`'s own, unmodified contract.
    async publish(envelopeJson) {
        const material = JSON.stringify(envelopeJson);
        const tag = Object.freeze({ name: this._tagName, value: this._discoveryTag });

        const result = await this._upload(material, tag);
        if (!result) {
            return null;
        }
        return Object.freeze({ published: true, locator: result.id });
    }

    // retrieve(locator) -> Promise<envelopeJson | null>. `null` ONLY for a
    // malformed locator, never even attempted. A `ContentUnavailableError`
    // from `ArweaveContentStore#get()` PROPAGATES, uncaught — see this
    // file's own header, "THE DURABILITY GAP IS REAL." Malformed retrieved
    // bytes (not JSON, or JSON that is not a plain object) resolve to
    // `null` instead.
    async retrieve(locator) {
        if (typeof locator !== 'string' || !TRANSACTION_ID_PATTERN.test(locator)) {
            return null;
        }
        const text = await this._contentStore.get({ uri: `ar://${locator}` });
        if (text === null) {
            return null;
        }
        return parseEnvelopeText(text);
    }

    // discover() -> Promise<envelopeJson[]>. See this file's own header,
    // "ONE BAD CANDIDATE NEVER ABORTS discover()'S OWN BATCH." A genuine
    // tag-search failure (this instance's own `searchTaggedTransactionIds`
    // rejecting) propagates unmodified; a single candidate transaction that
    // is not yet retrievable, or whose bytes fail to parse, is silently
    // skipped instead.
    async discover() {
        const candidateIds = await this._search(this._discoveryTag);
        const envelopes = [];
        for (const candidateId of candidateIds) {
            let text;
            try {
                text = await this._contentStore.get({ uri: `ar://${candidateId}` });
            } catch (error) {
                if (error instanceof ContentUnavailableError) {
                    continue;
                }
                throw error;
            }
            const parsed = parseEnvelopeText(text);
            if (parsed !== null) {
                envelopes.push(parsed);
            }
        }
        return envelopes;
    }
}

PublicationCommentaryArweaveDistribution.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
PublicationCommentaryArweaveDistribution.DEFAULT_GRAPHQL_URL = DEFAULT_GRAPHQL_URL;
PublicationCommentaryArweaveDistribution.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
PublicationCommentaryArweaveDistribution.DEFAULT_DISCOVERY_TAG = DEFAULT_DISCOVERY_TAG;

// Pure. `null` for a non-string, or a string that fails to parse as JSON, or
// JSON that is not a plain object — never throws. Mirrors
// `PublicationCommentaryNostrDistribution.js`'s own private
// `parseEventContent()`, one layer over (text, not an event's `content`).
function parseEnvelopeText(text) {
    if (typeof text !== 'string') {
        return null;
    }
    try {
        const parsed = JSON.parse(text);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch {
        return null;
    }
}
