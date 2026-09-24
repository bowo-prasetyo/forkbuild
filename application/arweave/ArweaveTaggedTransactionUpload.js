const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 15000;

// Deliberately the same magnitude application/arweave/ArweavePublicationMaterialUploader.js's
// own DEFAULT_MAX_MATERIAL_BYTES/DEFAULT_MAX_RESPONSE_BYTES already use —
// this file's own constants, never imported from that one; see this file's
// own header, "a new adapter, never a shared base class."
const DEFAULT_MAX_MATERIAL_BYTES = 48 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 48 * 1024;

// 0.9.490 — Arweave Tagged Transaction Upload.
//
// tests/ArweaveAnnouncementDiscoveryCapabilityBoundaryAudit.test.js (0.9.489)
// confirmed, live, that `uploadTaggedTransaction` is the ONLY missing piece
// standing between `application/arweave/ArweaveAnnouncementPublisher.js` (0.9.428)
// and Arweave functioning as a real discovery substrate — and sized its
// concrete implementation precisely: a recombination of `arweave/
// ArweaveInjectedProviderSigner.js`'s own already-shipped signing/wallet-
// interaction logic (its `tags: []` now made non-empty, see that file's own
// 0.9.490 header) and `application/arweave/ArweavePublicationMaterialUploader.js`'s
// own already-shipped `POST <gatewayUrl>/tx` call. This file is that
// implementation.
//
//   ArweaveAnnouncementPublisher#publish(envelope)
//        │
//        │   material = JSON.stringify(described envelope)
//        │   tag = { name: tagName, value: discoveryTag }
//        │
//        ▼
//   application/arweave/ArweaveTaggedTransactionUpload.js   ★ (THIS)
//        createArweaveTaggedTransactionUpload({ signer, gatewayUrl, fetchImpl })
//             -> uploadTaggedTransaction(material, tag)
//        │
//        ├──► injected signer.sign(material, [tag])   (signing, tagging —
//        │        never performed by this file itself; see "No wallet
//        │        management," below)
//        │        │
//        │        ▼
//        │    { id, transaction }
//        │
//        ▼
//   POST <gatewayUrl>/tx   { body: JSON.stringify(transaction) }
//        │
//        ▼
//   { id } | null
//        │
//        ▼
//   ArweaveAnnouncementPublisher#publish() (0.9.428, unmodified)
//
// A PURE I/O TRANSLATION ADAPTER — NEVER AN APPLICATION DECISION OF ANY
// KIND. This file never decides what to announce, which discovery tag to
// use, when to announce it, whether Nostr should also be tried, whether a
// candidate is a duplicate, any retry/fallback policy, or attribution — all
// of that is `ArweaveAnnouncementPublisher.js`'s own concern (already
// finished, 0.9.428) or its own caller's, finished before `material`/`tag`
// ever reach this file. `uploadTaggedTransaction(material, tag)` accepts
// both arguments exactly as already prepared, constructs and signs the
// Arweave transaction, submits it, and hands back the transaction identity
// — nothing more.
//
// `signer.sign(material, tags)` IS THIS FILE'S OWN INJECTION POINT — THE
// SAME SHAPE `arweave/ArweaveInjectedProviderSigner.js` (0.9.121, extended
// 0.9.490) ALREADY PRODUCES, NEVER A NEW ONE. This file never generates
// keys, never signs a transaction, and never knows what an Arweave
// transaction's own JSON shape (owner, tags, signature, reward, last_tx,
// …) actually looks like — a `signer` is expected to already know how to
// build and sign one; this file forwards `[tag]` into it and POSTs the
// opaque `transaction` it gets back, exactly the restraint `application/
// ArweavePublicationMaterialUploader.js`'s own header already holds for its
// own `signer`. A `signer` has exactly this shape:
//
//   { sign(material, tags) -> Promise<{ id, transaction }> }
//
// `fetchImpl` IS A SECOND, SEPARATE INJECTION POINT — TRANSPORT, NEVER
// SIGNING. The identical `ArweavePublicationMaterialUploader.js` pattern:
// a fake `signer` and a fake `fetchImpl` supplied independently so this
// file's own orchestration (size ceilings, response classification) is
// fully covered without a real wallet or a real network call.
//
// A NEW ADAPTER, NEVER A SHARED BASE CLASS. This file's own POST-to-`/tx`
// wire logic and size-ceiling handling deliberately mirror `application/
// ArweavePublicationMaterialUploader.js`'s own — duplicated, never
// imported or factored into a shared helper, the same "two independent
// files" convention this whole Arweave family already follows (see
// `application/arweave/ArweaveAnnouncementPublisher.js`'s own header). Neither file
// is widened to serve the other's own role.
//
// MALFORMED INPUT DEGRADES TO `null` BEFORE `signer`/THE GATEWAY ARE EVER
// CONSULTED. A missing/non-string/empty `material`, a `material` exceeding
// `maxMaterialBytes`, and a `tag` that is not a well-formed `{ name, value }`
// pair of non-empty strings are all "not something this file can upload" —
// resolved as `null` before `signer.sign()` is ever called, exactly as
// `ArweavePublicationMaterialUploader.js`'s own `upload()` never calls its
// signer for malformed material. In practice `ArweaveAnnouncementPublisher.js`
// only ever calls this with an already-validated, frozen tag — this
// degrade path exists for the same defensive reason `upload()`'s own
// material check exists, not because a real caller is expected to trigger
// it.
//
// A NON-2xx GATEWAY RESPONSE AND AN OVERSIZED RESPONSE BOTH RESOLVE TO
// `null` — "THIS UPLOAD DID NOT SUCCEED," NEVER A DISTINGUISHED STATUS.
// Byte-for-byte the same restraint `ArweavePublicationMaterialUploader.js`'s
// own header already draws.
//
// A GENUINE TRANSPORT/SIGNING FAILURE PROPAGATES — NEVER SWALLOWED INTO
// `null`. `signer.sign()` rejecting (no wallet available, a locked
// keystore, an operator declining to sign) and `fetch` itself rejecting (no
// connectivity, DNS failure, this file's own `timeoutMs` elapsing) are not
// "this upload did not succeed," they are "could not find out" — propagates
// to this file's own caller unchanged, which `ArweaveAnnouncementPublisher.js`
// already expects (see that file's own header, "a genuine transport/signing
// failure propagates").
//
// A SIGNER THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT THROWS — NEVER
// DEGRADES TO `null`. If `signer.sign()` resolves but hands back a
// missing/malformed `id` or no `transaction` at all, this file throws
// rather than returning `null` — a malformed collaborator response is a
// bug in how this class was wired, not a fact about Arweave.
//
// NO CACHING, NO RETRY, NO DEDUPLICATION, NO FALLBACK BETWEEN GATEWAYS.
// Every call signs and POSTs a fresh transaction; a caller uploading
// byte-identical material/tag twice gets two independent transactions.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Wiring a real host signer (a browser wallet, via `arweave/
//   ArweaveInjectedProviderSigner.js`) into `ui/main.js`'s own production
//   composition root as this file's own `signer`.** This file is a
//   producer of the `uploadTaggedTransaction` capability `application/
//   PublicationDistributionConfigurationProvider.js#resolveArweaveAnnouncementPublisherOptions()`
//   already accepts, exactly like `arweave/ArweaveInjectedProviderSigner.js`
//   is a producer of `signer` for content upload — actually calling
//   `createArweaveTaggedTransactionUpload()` from `ui/main.js` and handing
//   its result to `createPublicationDistributionRuntimeProvider()` is a
//   separate, later, composition-root change (the same line 0.9.121's own
//   header already drew for `signer` itself).
// - **Any change to `application/arweave/ArweaveAnnouncementPublisher.js`,
//   `application/publication/distribution/PublicationDistributionRuntimeComposition.js`, `application/
//   ArweaveGraphqlDiscoveryQueryService.js`, or any other file 0.9.489
//   reconfirmed correct.** This file satisfies an existing, already-proven
//   contract; none of those files change.
// - **Multi-chunk data, or any Arweave protocol primitive beyond what
//   `arweave/ArweaveInjectedProviderSigner.js` already implements.** This
//   file inherits that signer's own single-chunk ceiling; it enforces no
//   protocol-level limit of its own beyond the material-size ceiling below.
// - **Verifying that a published transaction later confirms on Arweave.**
//   A successful call means only "the gateway accepted this for broadcast"
//   — the same restraint every other write-side Arweave class in this
//   codebase already draws for itself.
export function createArweaveTaggedTransactionUpload({
    signer,
    gatewayUrl = DEFAULT_GATEWAY_URL,
    fetchImpl = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxMaterialBytes = DEFAULT_MAX_MATERIAL_BYTES,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
} = {}) {
    if (!signer || typeof signer.sign !== 'function') {
        throw new Error('createArweaveTaggedTransactionUpload: a signer with a sign() method is required');
    }
    if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
        throw new Error('createArweaveTaggedTransactionUpload: a non-empty gatewayUrl is required');
    }
    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (typeof fetchFn !== 'function') {
        throw new Error('createArweaveTaggedTransactionUpload: no fetch implementation available — pass fetchImpl explicitly');
    }
    const base = gatewayUrl.replace(/\/+$/, '');
    const maxMaterial = Number.isInteger(maxMaterialBytes) && maxMaterialBytes > 0
        ? maxMaterialBytes
        : DEFAULT_MAX_MATERIAL_BYTES;
    const maxResponse = Number.isInteger(maxResponseBytes) && maxResponseBytes > 0
        ? maxResponseBytes
        : DEFAULT_MAX_RESPONSE_BYTES;

    // uploadTaggedTransaction(material, tag) -> Promise<{ id } | null>. See
    // this file's own header for the full contract.
    async function uploadTaggedTransaction(material, tag) {
        if (typeof material !== 'string' || material.length === 0) {
            return null;
        }
        if (byteLength(material) > maxMaterial) {
            return null;
        }
        if (!isWellFormedTag(tag)) {
            return null;
        }

        const signed = await signer.sign(material, [{ name: tag.name, value: tag.value }]);
        const id = signed && signed.id;
        if (typeof id !== 'string' || !TRANSACTION_ID_PATTERN.test(id)) {
            throw new Error('createArweaveTaggedTransactionUpload: signer resolved with no valid transaction id');
        }
        if (!signed || signed.transaction === undefined) {
            throw new Error('createArweaveTaggedTransactionUpload: signer resolved with no transaction to upload');
        }

        const body = JSON.stringify(signed.transaction);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetchFn(`${base}/tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return null;
        }

        const declaredLength = responseContentLength(response);
        if (declaredLength !== null && declaredLength > maxResponse) {
            return null;
        }

        let text;
        try {
            text = await response.text();
        } catch {
            return null;
        }
        if (byteLength(text) > maxResponse) {
            return null;
        }

        return Object.freeze({ id });
    }

    return uploadTaggedTransaction;
}

createArweaveTaggedTransactionUpload.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
createArweaveTaggedTransactionUpload.DEFAULT_MAX_MATERIAL_BYTES = DEFAULT_MAX_MATERIAL_BYTES;
createArweaveTaggedTransactionUpload.DEFAULT_MAX_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;

// Pure. A well-formed Arweave Tag is exactly a { name, value } pair of
// non-empty strings — the same shape application/arweave/ArweaveAnnouncementPublisher.js
// always freezes and hands this file.
function isWellFormedTag(tag) {
    return Boolean(tag)
        && typeof tag.name === 'string' && tag.name.length > 0
        && typeof tag.value === 'string' && tag.value.length > 0;
}

// Pure. Byte-for-byte the same private helper application/
// ArweavePublicationMaterialUploader.js already defines for itself — not
// imported from it; see this file's own header, "a new adapter, never a
// shared base class."
function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

// Pure. The actual decoded byte length of a string.
function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
