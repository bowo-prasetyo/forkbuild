import { ContentStore } from './ContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { ContentUnavailableError } from './IpfsContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

const ARWEAVE_URI_PREFIX = 'ar://';
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 15000;

// A response larger than this can never be legitimate content THIS store
// itself placed — it mirrors arweave/ArweaveInjectedProviderSigner.js's
// own MAX_SINGLE_CHUNK_BYTES (256 * 1024), the hard ceiling that signer
// already enforces on the write side. Not imported from it; see this
// file's own header, "no cross-import of the write-side ceiling."
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

// 0.9.132 — Arweave Snapshot Content Store.
//
// content/ContentStore.js's own 0.2.14 header named this class directly
// as future work ("Future implementations: IPFSContentStore,
// ArweaveContentStore, HttpContentStore"), and tests/
// SnapshotDistributionBoundary.test.js's own 0.9.131 point 5 pinned down,
// structurally, that it did not exist yet — a deliberate tripwire, not an
// oversight; see that file's own point 5 for what changed the moment this
// file was created. This is that concrete implementation: a real
// content/ContentStore.js backed by Arweave, built the same way
// content/IpfsContentStore.js already is, so it drops into
// application/SnapshotPlacementStoreRegistry.js with zero code change
// anywhere else.
//
//   Snapshot bytes (a caller already has these — see "bytes are
//   supplied, never produced," below)
//        │
//        ▼
//   content/ArweaveContentStore.js   ★ (THIS)
//        ArweaveContentStore#put(bytes)
//        │
//        ├──► injected signer.sign(text)   (signing — never performed by
//        │        this file itself; see "no wallet management," below)
//        │        │
//        │        ▼
//        │    { id, transaction }
//        │
//        ▼
//   POST <gatewayUrl>/tx   { body: JSON.stringify(transaction) }
//        │
//        ▼
//   ContentReference{ hash: OUR OWN hash of the bytes, uri: ar://<id>,
//                      storage: 'ar' }
//        │
//        ▼
//   application/SnapshotPlacementStoreRegistry.js   (0.8.18, unmodified —
//        registered exactly like content/IpfsContentStore.js already is,
//        keyed by this class's own `storage` getter)
//
// A STORAGE ADAPTER, NEVER A DISTRIBUTION ORCHESTRATOR. This class
// decides nothing about whether a snapshot SHOULD be placed, whether a
// Signed Claim should exist, whether Nostr should announce anything,
// whether a placement is trusted, or whether Arweave's own result is
// authoritative — see docs/Roadmap.md, 0.9.132, "what the store should
// actually mean." It answers exactly one question, the same one
// content/IpfsContentStore.js already answers for its own substrate:
// given bytes, place them and hand back a locator; given a locator,
// retrieve the bytes back.
//
// THE HASH IS OURS, NEVER THE TRANSACTION ID — the identical discipline
// content/IpfsContentStore.js's own header already states for its CID,
// extended here to Arweave's own transaction id. `put()` computes its
// returned ContentReference's `hash` locally, from the bytes THIS
// REPLICA is looking at, the exact same `computeContentHash()` every
// other ContentStore in this codebase already uses — and only ever puts
// the transaction id into `uri`, one retrieval mechanism among however
// many a ContentReference may carry, never a second, competing notion of
// what the content IS. `contentReference.hash` is the one fact a claim's
// own Arweave material distribution and a snapshot's own Arweave
// placement could ever share (tests/SnapshotDistributionBoundary.test.js,
// 0.9.131, point 1) — the Arweave transaction id this file produces is
// most emphatically NOT that fact, and this file never treats it as one.
//
// REUSES THE EXISTING INJECTED-SIGNER CONTRACT, NEVER A SECOND WALLET
// ABSTRACTION. `signer` here is the identical shape application/
// ArweavePublicationMaterialUploader.js's own `signer` parameter already
// requires — `{ sign(material) -> Promise<{ id, transaction }> }` — and
// arweave/ArweaveInjectedProviderSigner.js (0.9.121) is already a real,
// concrete producer of exactly that shape. This file never imports
// EITHER of them: not application/ArweavePublicationMaterialUploader.js
// (see "no coupling to Signed Claim distribution," below, and tests/
// SnapshotDistributionBoundary.test.js's own point 3, which now checks
// this file too), and not arweave/ArweaveInjectedProviderSigner.js
// either — a caller (a future composition root, unbuilt this milestone)
// wires a concrete signer in from outside, exactly as application/
// SnapshotPlacementStoreRegistry.js already never imports content/
// IpfsContentStore.js. This class never generates keys, never signs a
// transaction, and never knows what an Arweave transaction's own JSON
// shape actually looks like — it treats `signer.sign()`'s own
// `transaction` field as completely opaque, POSTing it unread, the exact
// restraint application/ArweavePublicationMaterialUploader.js's own
// header already states for the identical reason.
//
// NO CROSS-IMPORT OF THE WRITE-SIDE CEILING. This file enforces no size
// limit of its own on outgoing content — an injected signer already owns
// that decision (arweave/ArweaveInjectedProviderSigner.js's own
// MAX_SINGLE_CHUNK_BYTES throws for material it cannot single-chunk), the
// same "transaction-shape knowledge lives with whoever signs" restraint
// held one layer earlier. DEFAULT_MAX_RESPONSE_BYTES, above, only bounds
// what this file will ever read back on the RETRIEVAL side — a value
// chosen to match that exact ceiling, not imported from it, for the
// identical reason application/ArweavePublicationMaterialUploader.js's
// own `responseContentLength`/`byteLength` helpers are byte-identical to,
// yet never imported from, application/
// ArweaveWorldEncounterMaterialResolver.js's own private helpers of the
// same name: two different concerns at two different layers, kept
// deliberately separate rather than cross-imported.
//
// `put()` NEVER RETURNS null OR A FAKE ContentReference — IT SUCCEEDS OR
// THROWS. Mirrors content/IpfsContentStore.js's own put() exactly, and
// is a deliberate DEPARTURE from application/
// ArweavePublicationMaterialUploader.js's own `upload()`, which resolves
// to `null` for an ordinary gateway failure — that file serves a
// caller (application/PublicationDistributionExecutor.js) whose own
// result vocabulary already has room for "material: null, distribution
// continues anyway." content/ContentStore.js's own `put()` contract has
// no such room; every other concrete store in this codebase throws
// on failure, so this one does too, via the SAME
// content/IpfsContentStore.js#ContentUnavailableError every other
// ContentStore in this codebase already throws — never a store-specific
// error class nothing else recognizes.
//
// A SIGNER FAILURE PROPAGATES UNCHANGED, NEVER WRAPPED, NEVER SWALLOWED.
// `signer.sign()` rejecting (no wallet available, a locked keystore, an
// operator declining to sign) is not "this store is unavailable," it is
// "could not even attempt to place this" — the identical distinction
// application/ArweavePublicationMaterialUploader.js's own header already
// draws, held here for the write side of THIS file. A signer that
// resolves but violates its own `{ id, transaction }` contract throws a
// plain Error instead — a bug in how this store was wired, never a fact
// about Arweave's own gateway, the same "resolved with success but broke
// its own contract" distinction that file already draws too.
//
// `get()` THROWS ContentUnavailableError FOR EVERY NETWORK-SHAPED
// FAILURE — the identical content/IpfsContentStore.js#get() contract,
// extended to this substrate: a non-2xx gateway response, a transport
// failure, this file's own timeout elapsing, and an oversized response
// are all a ContentUnavailableError, never a silent `null`. `null` is
// reserved for exactly one case: a reference that does not even carry an
// `ar://` uri — the wrong store was asked, the identical "not even ours"
// null content/IpfsContentStore.js#get() already returns for a non-
// `ipfs://` reference.
//
// `has()` NEVER THROWS — best-effort, degrading to `false` for anything
// unreachable, the identical posture every other concrete ContentStore
// in this codebase already holds for the same reason: a caller that only
// wants a boolean has nowhere to route a network error anyway.
//
// NO COUPLING TO SIGNED CLAIM DISTRIBUTION, NOSTR, OR SNAPSHOT
// PLACEMENT'S OWN SIGNING/CATALOG MACHINERY. This file never imports
// application/PublicationDistribution*.js, application/
// ArweavePublicationMaterialUploader.js, application/
// NostrPublicationDiscoveryPublisher.js, core/
// PublicationSnapshotPlacement.js, or application/
// SnapshotPlacementResolver.js — it is a plain content/ContentStore.js
// implementation, exactly as interchangeable with content/
// IpfsContentStore.js as that file already is with content/
// LocalContentStore.js. tests/SnapshotDistributionBoundary.test.js's own
// structural sweep (point 3) now includes this file in that check.
//
// BYTES ARE SUPPLIED, NEVER PRODUCED — THIS FILE NEVER IMPORTS
// `Document`/`World`/`Publication`. `put(bytes)` takes exactly the bytes
// a caller already has (a string, or anything `TextDecoder` can decode),
// the identical restraint content/IpfsContentStore.js's own `put()`
// already holds, and application/ArweavePublicationMaterialUploader.js's
// own header holds one layer over for a claim's own serialized material.
//
// NO CACHING, NO RETRY, NO DEDUPLICATION, NO FALLBACK BETWEEN GATEWAYS.
// Every call to `put()` signs and POSTs a fresh transaction; every call
// to `get()` issues exactly one GET against exactly this store's own
// configured gateway. The identical restraint application/
// ArweavePublicationMaterialUploader.js and application/
// ArweaveWorldEncounterMaterialResolver.js already hold for their own
// substrate.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. See docs/Roadmap.md,
// 0.9.132, "deliberately excluded" — Nostr snapshot announcement/
// discovery, automatic replication, provider selection, storage ranking,
// retry policy, snapshot lifecycle states, automatic Signed Claim
// generation/distribution, any change to IPFS/local storage behavior,
// UI, new verification/trust semantics, and any composition wiring this
// store into application/CreateSnapshotPlacementOrchestratorUseCase.js's
// own `stores` list — that remains a caller's own, later decision,
// exactly as passing a real content/IpfsContentStore.js in already is.
export class ArweaveContentStore extends ContentStore {
    // signer: see this file's own header, "reuses the existing injected-
    //   signer contract" — the sole injection point responsible for
    //   turning content into a signed transaction and its own
    //   deterministic id.
    // gatewayUrl: which Arweave gateway accepts a transaction POST at
    //   `<gatewayUrl>/tx` and serves raw transaction data at
    //   `<gatewayUrl>/<transaction-id>` — defaults to Arweave's own
    //   `arweave.net`, the same default host every other Arweave-facing
    //   file in this codebase already targets.
    // fetchImpl / timeoutMs / maxResponseBytes: see this file's own
    //   header, "no cross-import of the write-side ceiling."
    constructor({
        signer,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    } = {}) {
        super();
        if (!signer || typeof signer.sign !== 'function') {
            throw new Error('ArweaveContentStore: a signer with a sign() method is required');
        }
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweaveContentStore: a non-empty gatewayUrl is required');
        }
        this._signer = signer;
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveContentStore: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxResponseBytes = Number.isInteger(maxResponseBytes) && maxResponseBytes > 0
            ? maxResponseBytes
            : DEFAULT_MAX_RESPONSE_BYTES;
    }

    get gatewayUrl() { return this._gatewayUrl; }

    // 0.8.18 — matches content/ContentStore.js's own `storage` discipline;
    // the exact `storage: 'ar'` label application/
    // ArweavePublicationMaterialUploader.js and application/
    // ArweaveWorldEncounterMaterialResolver.js already self-identify with
    // on their own, unrelated substrate — see this file's own header,
    // "no coupling," for why sharing the label is fine while the classes
    // stay unconnected.
    get storage() { return 'ar'; }

    // put(bytes) -> Promise<ContentReference>. Never returns null; either
    // resolves with a real ContentReference or throws — see this file's
    // own header, "put() never returns null or a fake ContentReference."
    async put(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const hash = computeContentHash(text);

        const signed = await this._signer.sign(text);
        const id = signed && signed.id;
        if (typeof id !== 'string' || !TRANSACTION_ID_PATTERN.test(id)) {
            throw new Error('ArweaveContentStore: signer resolved with no valid transaction id');
        }
        if (!signed || signed.transaction === undefined) {
            throw new Error('ArweaveContentStore: signer resolved with no transaction to upload');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}/tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(signed.transaction),
                signal: controller.signal
            });
        } catch (error) {
            throw new ContentUnavailableError(`ArweaveContentStore: could not reach Arweave gateway at ${this._gatewayUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw new ContentUnavailableError(`ArweaveContentStore: Arweave gateway at ${this._gatewayUrl} returned ${response.status} for a transaction POST`);
        }

        return new ContentReference({
            hash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size: text.length,
            uri: ARWEAVE_URI_PREFIX + id,
            storage: 'ar'
        });
    }

    // get(reference) -> Promise<string|null>. `null` only ever means
    // "this reference does not even point at Arweave" (no `ar://` uri) —
    // a caller asked the wrong store. Every network-shaped failure THROWS
    // ContentUnavailableError instead — see this file's own header.
    async get(reference) {
        const transactionId = this._transactionIdFromReference(reference);
        if (transactionId === null) return null;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}/${transactionId}`, {
                method: 'GET',
                signal: controller.signal
            });
        } catch (error) {
            throw new ContentUnavailableError(`ArweaveContentStore: could not reach Arweave gateway at ${this._gatewayUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw new ContentUnavailableError(`ArweaveContentStore: Arweave gateway at ${this._gatewayUrl} returned ${response.status} for transaction ${transactionId}`);
        }

        const declaredLength = responseContentLength(response);
        if (declaredLength !== null && declaredLength > this._maxResponseBytes) {
            throw new ContentUnavailableError(`ArweaveContentStore: Arweave gateway response for transaction ${transactionId} exceeds the maximum allowed size`);
        }

        let text;
        try {
            text = await response.text();
        } catch (error) {
            throw new ContentUnavailableError(`ArweaveContentStore: could not read Arweave gateway's response body — ${error.message}`);
        }

        if (byteLength(text) > this._maxResponseBytes) {
            throw new ContentUnavailableError(`ArweaveContentStore: Arweave gateway response for transaction ${transactionId} exceeds the maximum allowed size`);
        }

        return text;
    }

    // has(reference) -> Promise<boolean>. Best-effort only — NEVER
    // throws, degrading to `false` for anything unreachable; see this
    // file's own header.
    async has(reference) {
        try {
            const bytes = await this.get(reference);
            return bytes !== null;
        } catch {
            return false;
        }
    }

    _transactionIdFromReference(reference) {
        const uri = reference && reference.uri;
        if (!uri || !uri.startsWith(ARWEAVE_URI_PREFIX)) return null;
        const id = uri.slice(ARWEAVE_URI_PREFIX.length);
        return TRANSACTION_ID_PATTERN.test(id) ? id : null;
    }
}

// Pure. Reads a `Content-Length` header off a fetch Response, or `null`
// when the response carries no headers object, no such header, or a
// non-numeric value — the cheap first line of defense against an
// oversized response body. Deliberately NOT imported from application/
// ArweavePublicationMaterialUploader.js or application/
// ArweaveWorldEncounterMaterialResolver.js's own byte-identical private
// helpers of the same name; see this file's own header, "no cross-import
// of the write-side ceiling," for why this codebase keeps these small
// per-file rather than shared.
function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

// Pure. The actual decoded byte length of a string — the always-enforced
// second line of defense against an oversized body, independent of
// whatever (or whether) a `Content-Length` header claimed.
function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}

ArweaveContentStore.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveContentStore.DEFAULT_MAX_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;
