const ARWEAVE_URI_PREFIX = 'ar://';
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 15000; // an upload is expected to take longer than a gateway GET — the same reasoning content/HttpPinningProvider.js's own DEFAULT_TIMEOUT_MS already states

// Deliberately mirrors the MAGNITUDE of application/
// ArweaveWorldEncounterMaterialResolver.js's own 0.9.35
// DEFAULT_MAX_RESPONSE_BYTES (48 * 1024), which itself mirrors
// application/PeerWorldEncounterMaterialProtocol.js's own 0.9.23
// MAX_WORLD_ENCOUNTER_MATERIAL_BYTES — an explicit, named safety ceiling
// rather than an arbitrary ("no limit at all") request or response. This
// is its own constant, never imported from either file: a peer wire
// envelope, a decentralized gateway GET, and a decentralized gateway POST
// are three different concerns at three different layers, and this file
// has no reason to depend on either of the other two just to get a
// sensible number. Reused for BOTH ceilings this file enforces — the
// outgoing material and the gateway's own response — see this file's own
// header, "Two size ceilings, never conflated."
const DEFAULT_MAX_MATERIAL_BYTES = 48 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 48 * 1024;

// 0.9.45 — Arweave Publication Material Uploader.
//
// 0.9.24 through 0.9.44 built the entire question one side at a time —
// where might a Publication's material be (a lead), how do I get its
// bytes once I already have a uri (application/
// ArweaveWorldEncounterMaterialResolver.js, 0.9.35), and what does a
// distribution look like once a materialUri already exists (application/
// PublicationDistributionDescriptor.js, 0.9.44). Every one of those files
// took `materialUri` as a given. This file is where one actually gets
// produced: the first concrete answer to "upload this Publication's
// serialized material somewhere, and hand back the uri 0.9.44's own
// `materialUri` parameter is waiting for."
//
//   signed Publication's serialized material (a caller already produced
//        this — see "Serialized material is supplied, never produced,"
//        below)
//              │
//              ▼
//   application/ArweavePublicationMaterialUploader.js   ★ (THIS)
//        ArweavePublicationMaterialUploader#upload(material)
//              │
//              ├──► injected signer.sign(material)  (signing — never
//              │        performed by this file itself; see "No wallet
//              │        management," below)
//              │        │
//              │        ▼
//              │    { id, transaction }
//              │
//              ▼
//   POST https://arweave.net/tx   { body: JSON.stringify(transaction) }
//              │
//              ▼
//   ar://<id>, or null — not currently uploadable
//              │
//              ▼
//   application/PublicationDistributionDescriptor.js   (0.9.44,
//        unmodified — this file's own return value is exactly the
//        `materialUri` that file's own `describePublicationDistribution()`
//        already accepts)
//
// THE PUBLISHING COUNTERPART OF application/
// ArweaveWorldEncounterMaterialResolver.js — SAME GATEWAY, SAME SIZE-
// CEILING DISCIPLINE, SAME `fetchImpl` INJECTION, OPPOSITE DIRECTION. That
// file answers "give me the bytes at this uri I already have"; this file
// answers "put these bytes somewhere and give me back a uri." Neither
// imports the other, and neither is a special case of the other — a GET
// and a POST against the same gateway are two distinct wire operations,
// exactly as content/IpfsGatewayContentStore.js (resolve only) and
// content/IpfsRemotePinningContentStore.js (publish only) already stay
// two separate classes for the identical reason on a different substrate.
//
// SERIALIZED MATERIAL IS SUPPLIED, NEVER PRODUCED — THIS FILE NEVER
// IMPORTS `Publication`. `upload(material)` takes exactly one already-
// serialized string — never a `Publication` instance, never something
// this file calls `.toJSON()` on itself. Producing that string (a
// caller's own `JSON.stringify(publication.toJSON())`, or any other
// serialization a caller already has) is a distinct, prior step this
// milestone deliberately leaves alone — the identical restraint
// application/PublicationDistributionDescriptor.js's own header already
// holds one layer over ("this file never imports Publication... duck-
// typed only"), extended here to the material itself rather than to the
// object naming it.
//
// NO WALLET MANAGEMENT, NO KEY MANAGEMENT, NO TRANSACTION-FORMAT
// KNOWLEDGE OF ANY KIND — THE SAME RESTRAINT anchoring/
// BitcoinAnchorPublisher.js's OWN 0.8.9 HEADER ALREADY HOLDS FOR BITCOIN,
// HELD HERE FOR ARWEAVE. This class never generates keys, never signs a
// transaction, and never knows what an Arweave transaction's own JSON
// shape (owner, tags, signature, reward, last_tx, …) actually looks like
// — it treats `signer.sign(material)`'s own `transaction` field as
// completely opaque, POSTing it unread. A `signer` has exactly this
// shape:
//
//   { sign(material) -> Promise<{ id, transaction }> }
//
// where `id` is the transaction id the signing step already deterministically
// computed (Arweave's own id is a hash of the transaction's signature, so
// it is known before any network call — never re-derived from the
// gateway's own response; see "The gateway's own response body is never
// read for meaning," below), and `transaction` is whatever this signer's
// own concrete implementation needs POSTed to actually place the material
// — this file forwards it as the literal POST body, unread and
// uninterpreted, via `JSON.stringify(transaction)`. Delegating "construct,
// sign" entirely to an injected `signer` — exactly as
// `BitcoinAnchorPublisher` delegates "construct, sign, broadcast" entirely
// to an injected `broadcaster` — is what lets this class run fully
// deterministically in tests/ArweavePublicationMaterialUploader.test.js
// with zero real key material anywhere in this codebase.
//
// `fetchImpl` IS A SECOND, SEPARATE INJECTION POINT — TRANSPORT, NEVER
// SIGNING. The identical `application/
// ArweaveWorldEncounterMaterialResolver.js` / content/
// HttpPinningProvider.js pattern this codebase already runs its other
// real-network adapters through: `tests/
// ArweavePublicationMaterialUploader.test.js` supplies a fake `signer`
// AND a fake `fetchImpl` independently, so this file's own orchestration
// (size ceilings, response classification, uri construction) is fully
// covered without either a real wallet or a real network call — and
// without this codebase's own test suite ever depending on
// `arweave.net` being reachable. A caller wanting a different gateway
// constructs a second instance with a different `gatewayUrl`; this file
// never falls back between gateways on its own.
//
// TWO SIZE CEILINGS, NEVER CONFLATED. `maxMaterialBytes` bounds the
// OUTGOING material — a caller handing this file material larger than
// that ceiling gets `null` back before `signer.sign()` is ever called and
// before any network request is ever made, exactly as 0.9.35's own
// resolver never calls its gateway for a uri it can already tell is
// malformed. `maxResponseBytes` separately bounds the gateway's own POST
// response — enforced the identical two-layer way 0.9.35's own resolver
// already enforces it for a GET response: first cheaply, against a
// `Content-Length` header when the gateway sends one; then always,
// against the actual decoded byte length of whatever body was read. A
// missing or dishonest `Content-Length` never lets an oversized response
// through, on either file.
//
// THE GATEWAY'S OWN RESPONSE BODY IS NEVER READ FOR MEANING. Unlike
// content/HttpPinningProvider.js, which reads a `cid` back out of its
// provider's own JSON response body, this file's returned uri is built
// entirely from the `id` the injected `signer` already produced BEFORE
// any network call — Arweave's own transaction id is a property of the
// signed transaction itself, not something a gateway assigns on receipt.
// The response body is still read (bounded by `maxResponseBytes`, exactly
// as documented above) so a caller is protected from an oversized or
// hanging response, but its CONTENTS are discarded, never parsed as JSON,
// never inspected — only the response's `ok` status and its size are
// ever consulted.
//
// A NON-2xx GATEWAY RESPONSE AND AN OVERSIZED RESPONSE BOTH RESOLVE TO
// `null` — "THIS UPLOAD DID NOT SUCCEED," NEVER A DISTINGUISHED STATUS.
// The identical "two statuses, never a third" restraint 0.9.35's own
// resolver already holds for retrieval, held here for upload: a gateway
// declining the transaction, a gateway timing out mid-response, and a
// response too large to safely buffer are all indistinguishable to this
// file's own caller — "not currently uploadable," never an error a
// caller must handle specially. See "A genuine transport/signing failure
// propagates," directly below, for the one case that is NOT collapsed
// this way.
//
// A GENUINE TRANSPORT/SIGNING FAILURE PROPAGATES — NEVER SWALLOWED INTO
// `null`. `signer.sign()` rejecting (no wallet available, a locked
// keystore, an operator declining to sign) and `fetch` itself rejecting
// (no connectivity, DNS failure, this file's own `timeoutMs` elapsing and
// aborting the request) are not "this upload did not succeed," they are
// "could not find out" — exactly 0.9.35's own resolver header, "a
// rejection... is never caught here; it propagates to this class's own
// caller unchanged," extended one layer earlier to signing as well as
// transport.
//
// A SIGNER THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT THROWS — NEVER
// DEGRADES TO `null`. If `signer.sign()` resolves successfully but hands
// back a missing/malformed `id` (failing the identical
// `[A-Za-z0-9_-]+` transaction-id charset 0.9.35's own resolver already
// enforces for reading one) or no `transaction` at all, this file throws
// rather than returning `null` — the same "resolved with success but
// broke its own contract" distinction anchoring/BitcoinAnchorPublisher.js
// (a `txid` failing its own pattern) and content/
// IpfsRemotePinningContentStore.js (no `cid` at all) already draw for
// their own injected dependencies. `null` is reserved for the GATEWAY's
// own ordinary, expected failure modes — a malformed `signer` is a bug in
// how this class was wired, not a fact about Arweave.
//
// MALFORMED `material` DEGRADES TO `null`, NEVER THROWS, AND THE SIGNER/
// GATEWAY ARE NEVER CONSULTED. A missing/non-string/empty `material`, and
// a `material` exceeding `maxMaterialBytes`, are both "not something this
// file can upload" — resolved as `null` before `signer.sign()` is ever
// called, exactly as 0.9.35's own resolver never calls its gateway for a
// non-`ar://` or malformed uri.
//
// NO CACHING, NO RETRY, NO DEDUPLICATION. Every call to `upload()` signs
// and POSTs a fresh transaction. A caller uploading byte-identical
// material twice gets two independent transactions, potentially two
// different ids — this file forms no opinion on whether that is wasteful;
// see 0.9.35's own resolver header, "no caching, no retry, no fallback
// between gateways," held here for the write side.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Publishing the discovery envelope this material's own uri belongs
//   in.** application/PublicationDistributionDescriptor.js (0.9.44)
//   already describes that envelope, unmodified by this file; actually
//   announcing it to Nostr is 0.9.46, unscheduled — see that file's own
//   header.
// - **A concrete `signer` implementation — real Arweave transaction
//   construction, RSA-PSS signing, or wallet/JWK handling of any kind.**
//   This file depends only on the `signer.sign(material) -> Promise<{ id,
//   transaction }>` contract documented above; a concrete implementation
//   is later, unscheduled work, the identical line content/
//   HttpPinningProvider.js already draws one layer over for
//   content/PinningProvider.js's own abstract `put()`.
// - **Wiring this class into a runtime composition alongside a Nostr
//   publisher.** 0.9.47, unscheduled — this file ships an uploader, never
//   composition.
// - **Reading `material` off a `Publication` instance, or serializing one
//   itself.** See "Serialized material is supplied, never produced,"
//   above.
// - **Deduplicating, batching, chunking, or streaming an upload.** Every
//   call is exactly one `signer.sign()` plus exactly one `POST`.
// - **Verifying that an uploaded transaction later confirms on Arweave.**
//   A successful `upload()` means only "the gateway accepted this
//   transaction for broadcast" — the identical "broadcast acceptance is
//   not anchor validity" distinction anchoring/BitcoinAnchorPublisher.js's
//   own header already draws for Bitcoin; confirmation tracking is
//   unscheduled, later work, if this codebase ever needs it for Arweave.
export class ArweavePublicationMaterialUploader {
    // signer: see this file's own header, "No wallet management" — the
    //   sole injection point responsible for turning `material` into a
    //   signed transaction and its own deterministic id.
    // gatewayUrl: which Arweave gateway accepts a transaction POST at
    //   `<gatewayUrl>/tx` — defaults to Arweave's own `arweave.net`, the
    //   same default host application/
    //   ArweaveWorldEncounterMaterialResolver.js already targets for
    //   retrieval.
    // fetchImpl: see this file's own header, "fetchImpl is a second,
    //   separate injection point."
    // timeoutMs: how long to wait before aborting the gateway request —
    //   the abort surfaces as a genuine rejection; see "a genuine
    //   transport/signing failure propagates," above.
    // maxMaterialBytes / maxResponseBytes: the two size ceilings; see
    //   this file's own header, "Two size ceilings, never conflated."
    constructor({
        signer,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxMaterialBytes = DEFAULT_MAX_MATERIAL_BYTES,
        maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    } = {}) {
        if (!signer || typeof signer.sign !== 'function') {
            throw new Error('ArweavePublicationMaterialUploader: a signer with a sign() method is required');
        }
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweavePublicationMaterialUploader: a non-empty gatewayUrl is required');
        }
        this._signer = signer;
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweavePublicationMaterialUploader: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxMaterialBytes = Number.isInteger(maxMaterialBytes) && maxMaterialBytes > 0
            ? maxMaterialBytes
            : DEFAULT_MAX_MATERIAL_BYTES;
        this._maxResponseBytes = Number.isInteger(maxResponseBytes) && maxResponseBytes > 0
            ? maxResponseBytes
            : DEFAULT_MAX_RESPONSE_BYTES;

        // Bound so `uploader.upload` survives being passed around as a
        // bare function reference — the identical reason application/
        // ArweaveWorldEncounterMaterialResolver.js's own
        // `retrieveByUri` is bound in its own constructor.
        this.upload = this.upload.bind(this);
    }

    get gatewayUrl() { return this._gatewayUrl; }

    // Matches the `storage: 'ar'` application/
    // ArweaveWorldEncounterMaterialResolver.js's own resolver, and
    // discovered leads via `storage: 'ar'`, already carry — never read by
    // this file itself, just a stable self-identifying label a caller may
    // use however it likes (e.g. as `application/
    // PublicationDistributionDescriptor.js`'s own `materialStorage`
    // override).
    get storage() { return 'ar'; }

    // upload(material) -> Promise<string uri | null>. See this file's own
    // header for the full contract: `null` for missing/non-string/empty
    // `material`, for `material` exceeding `maxMaterialBytes`, for a
    // non-2xx gateway response, or for an oversized gateway response; a
    // genuine `signer.sign()` or `fetch` failure (including this class's
    // own timeout) propagates as a rejection; a `signer` that resolves
    // but violates its own `{ id, transaction }` contract throws rather
    // than degrading to `null`.
    async upload(material) {
        if (typeof material !== 'string' || material.length === 0) {
            return null;
        }
        if (byteLength(material) > this._maxMaterialBytes) {
            return null;
        }

        const signed = await this._signer.sign(material);
        const id = signed && signed.id;
        if (typeof id !== 'string' || !TRANSACTION_ID_PATTERN.test(id)) {
            throw new Error('ArweavePublicationMaterialUploader: signer resolved with no valid transaction id');
        }
        if (!signed || signed.transaction === undefined) {
            throw new Error('ArweavePublicationMaterialUploader: signer resolved with no transaction to upload');
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
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return null;
        }

        const declaredLength = responseContentLength(response);
        if (declaredLength !== null && declaredLength > this._maxResponseBytes) {
            return null;
        }

        let text;
        try {
            text = await response.text();
        } catch {
            return null;
        }

        if (byteLength(text) > this._maxResponseBytes) {
            return null;
        }

        return ARWEAVE_URI_PREFIX + id;
    }
}

ArweavePublicationMaterialUploader.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweavePublicationMaterialUploader.DEFAULT_MAX_MATERIAL_BYTES = DEFAULT_MAX_MATERIAL_BYTES;
ArweavePublicationMaterialUploader.DEFAULT_MAX_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;

// Pure. Reads a `Content-Length` header off a fetch Response, or `null`
// when the response carries no headers object, no such header, or a
// non-numeric value — the cheap first line of defense against an
// oversized response body; see this file's own header, "Two size
// ceilings, never conflated." Byte-identical to application/
// ArweaveWorldEncounterMaterialResolver.js's own private helper of the
// same name — not imported from it, since that helper is not exported and
// a GET response and a POST response are different concerns this file
// keeps deliberately separate; see this file's own header, "same gateway
// ... opposite direction."
function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

// Pure. The actual decoded byte length of a string — used for both size
// ceilings this file enforces: the outgoing `material` (against
// `maxMaterialBytes`) and the gateway's own response body (against
// `maxResponseBytes`, as the always-enforced second line of defense
// independent of whatever, or whether, a `Content-Length` header
// claimed).
function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
