const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 15000;
// Bug fix — mirrors nostr/NostrInjectedProviderPublisher.js's own
// DEFAULT_SIGNING_TIMEOUT_MS exactly, one substrate over. Neither
// `injectedProvider.connect()` nor `injectedProvider.sign()` (below) was
// ever bounded by any timeout at all — unlike the gateway `fetch()` calls
// this file already wraps in an AbortController — so a real ArConnect/
// Wander installation whose own response never reaches the page (the
// identical "an MV3 background service worker recycled mid-request"
// failure mode that motivated the Nostr fix) left `sign()` awaiting
// forever, with no way to recover, even though the wallet's own approval
// popup may already have been resolved on its own side.
const DEFAULT_SIGNING_TIMEOUT_MS = 120000;
const DEFAULT_PERMISSIONS = ['SIGN_TRANSACTION'];
const NOTE_SIZE = 32;
const MAX_SINGLE_CHUNK_BYTES = 256 * 1024;

// 0.9.121 — Arweave Injected Provider Signer.
//
// application/arweave/ArweavePublicationDistributionRuntimeAdapter.js (0.9.109)
// closed the seam a host Arweave signing capability plugs into, but named
// "a concrete host Arweave signing capability... a wallet-extension
// integration" as later, unscheduled work — the one thing standing between
// a real browser wallet and a real World View click. This file is that
// concrete capability: the first thing in this codebase that actually
// turns `signer.sign(material)` into a real Arweave transaction, signed by
// a real, injected, ArConnect-shaped wallet.
//
//   window.arweaveWallet (or any object shaped like it — see this file's
//   own tests for a fake one; ArConnect/Wander are the real, documented
//   implementations)
//        │
//        ▼
//   arweave/ArweaveInjectedProviderSigner.js   ★ (THIS)
//        createArweaveInjectedProviderSigner({ injectedProvider, gatewayUrl, fetchImpl })
//        │
//        ▼
//   { sign(material) -> Promise<{ id, transaction }> }   | undefined
//        │
//        ▼
//   application/arweave/ArweavePublicationDistributionRuntimeAdapter.js   (0.9.109, unmodified)
//
// A SIGNER PRODUCER, NEVER A SECOND SEAM. 0.9.109's own adapter already
// forwards a `signer` verbatim; this file is what a caller (`ui/main.js`)
// hands it AS that `signer` — nothing about 0.9.109, 0.9.107, 0.9.106, or
// 0.9.105 changes. This file has no idea `PublicationDistributionRuntimeAdapter`
// exists — it imports nothing from `application/`, and knows nothing about
// Publications, uploads, or discovery. It solves exactly one problem: given
// a browser's own injected Arweave wallet and a UTF-8 string, produce a
// real, POST-able, signed Arweave transaction and its id.
//
// `undefined`, NEVER A THROW, WHEN NO WALLET IS INJECTED — the identical
// "no extension installed is a first-class, expected outcome" restraint
// `base/BaseInjectedProviderWalletAdapter.js` already holds for Base,
// applied here at the point a CAPABILITY is produced rather than a
// connection. `createArweaveInjectedProviderSigner({ injectedProvider: null })`
// (or any object missing a `sign` function) returns `undefined` — never an
// object with an `unavailable` flag, because the `signer` vocabulary
// downstream has no room for one: `resolveArweaveUploaderOptions()`
// (0.9.105, unmodified) already treats an absent `signer` as "Arweave is
// not currently configured," the identical outcome as today.
//
// NO EXPLICIT "CONNECT" STEP FOR A PERSON TO CLICK — CONNECTION IS LAZY,
// INSIDE `sign()` ITSELF, TRIGGERED BY THE SAME CLICK THAT ALREADY TRIGGERS
// SIGNING. This is a deliberate departure from `base/BaseWalletConnection.js`'s
// own explicit `connect()` step: that class exists because a Base account
// address is worth knowing before any signing is attempted. Nothing in this
// milestone's own brief wants a "Connect Arweave Wallet" button, a new
// lifecycle state, or any change to World View's existing "Distribute
// Publication" action — so the one moment a browser wallet's own permission
// prompt is appropriate to show is exactly the moment a person already
// asked to distribute. `sign()` calls `injectedProvider.connect(permissions)`
// (only if the injected object exposes one) every time, relying on a real
// wallet's own documented idempotence — already-granted permissions never
// re-prompt.
//
// A SINGLE-CHUNK TRANSACTION ONLY — NEVER MULTI-CHUNK ARWEAVE UPLOAD. Real
// Arweave transactions merkle-chunk `data` above 256 KiB; that scheme is
// deliberately unimplemented here. `application/arweave/ArweavePublicationMaterialUploader.js`'s
// own `DEFAULT_MAX_MATERIAL_BYTES` (48 * 1024) already guarantees `sign()`
// is never called with material anywhere near that ceiling — this file
// enforces the boundary anyway, throwing rather than silently producing a
// data_root Arweave's own network would ultimately reject.
//
// `data_root` IS COMPUTED HERE, RSA-PSS SIGNING IS NOT — THE ONE LINE THIS
// FILE DRAWS BETWEEN "TRANSACTION SHAPE" AND "CRYPTOGRAPHIC SIGNING
// AUTHORITY." A real Arweave transaction's own `owner`/`signature`/`id`
// fields can only be produced by whatever holds the wallet's private key —
// this file never touches one. It computes `data_root` (Arweave's own
// single-leaf Merkle digest — SHA-256 over the concatenation of
// SHA-256(chunk) and SHA-256(byte-length note), the same construction real
// Arweave nodes verify a submitted transaction's `data` against) because
// that is a public, deterministic, keyless computation over the material
// itself, no different in kind from computing a uri's own transaction-id
// pattern elsewhere in this codebase. Everything requiring the wallet's own
// key — `owner`, `signature`, and the `id` derived from that signature —
// is left entirely to `injectedProvider.sign()`, mirroring
// `anchoring/BitcoinAnchorWalletSigner.js`'s own identical line between
// "this class builds the thing to be signed" and "the wallet signs it."
//
// `injectedProvider.sign(transaction)` IS THIS FILE'S OWN CONTRACT, NOT A
// TRANSCRIPTION OF ANY ONE WALLET'S TYPESCRIPT DEFINITIONS. `transaction`
// is handed to `sign()` as a plain, JSON-shaped object (`format`, `last_tx`,
// `owner: ''`, `tags: []`, `target: ''`, `quantity: '0'`, `data_root`,
// `data`, `data_size`, `reward`, `signature: ''`) — never a class instance —
// because every real wallet extension communicates across an isolated
// content-script boundary via structured message passing, where only plain,
// serializable data survives; `sign()` is expected to resolve with the SAME
// shape, `owner`/`signature`/`id` now populated. A real extension whose own
// `sign()` insists on a different envelope is a translation this exact
// function is the one, isolated place to adjust — never a reason to widen
// this file's own caller, `ui/main.js`.
//
// NO WALLET UI, NO KEY MANAGEMENT, NO GATEWAY-SELECTION POLICY, NO NEW
// LIFECYCLE STATE. This file never reads `localStorage`, never renders
// anything, never generates or stores a key, and has no relationship to
// `PublicationDistributionLifecycle.js`/`WorldEncounterCanvas.js`/the
// Distribution panel — none of them are imported, and none of them know
// this file exists.
//
// NO EXTERNAL DEPENDENCY. Exactly like `anchoring/BitcoinAnchorPsbtBuilder.js`
// hand-builds a PSBT and `base/BaseInjectedProviderWalletAdapter.js`
// hand-rolls its own EIP-1193 call rather than importing a chain SDK, this
// file uses only `crypto.subtle`, `TextEncoder`, and `btoa` — every browser
// and every Node version this codebase's own test suite already runs
// against — never an Arweave SDK loaded from a CDN.
//
// 0.9.490 — `sign()` GAINS AN OPTIONAL, NON-EMPTY `tags` PARAMETER — THE
// EXACT RECOMBINATION `tests/ArweaveAnnouncementDiscoveryCapabilityBoundaryAudit.test.js`
// (0.9.489) Section C5 named: this file's own `tags: []` field, made
// non-empty. `sign(material, tags = [])` is fully backward compatible —
// every existing caller (`application/arweave/ArweavePublicationMaterialUploader.js`,
// `anchoring/ArweaveAnchorPublisher.js`) still calls `sign(material)` with
// one argument and still gets the identical `tags: []` it always got.
// `application/arweave/ArweaveTaggedTransactionUpload.js` (NEW, 0.9.490) is the one
// caller passing a real, non-empty `tags` array. Each `{ name, value }` pair
// is base64url-encoded here, the same JSON-safe convention `data`/
// `data_root` already use — never left as a raw string, since Arweave Tags,
// exactly like `data`, are bound into the transaction's own signed fields
// and must already be wire-ready before `injectedProvider.sign()` is ever
// called. A malformed tag (missing `name`/`value`, wrong type) throws
// immediately, before the wallet or gateway are ever consulted — the same
// "malformed input never reaches signing" restraint this file's own
// `material` check already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Multi-chunk data, RSA-PSS signing, deep-hash computation, or any
//   other part of the Arweave protocol not already named above.** See
//   "A single-chunk transaction only" and "`data_root` is computed here,"
//   above.
// - **Any UI, connection button, or persisted wallet state.** See "No
//   explicit connect step," above.
// - **Any change to `application/arweave/ArweavePublicationDistributionRuntimeAdapter.js`,
//   `application/arweave/ArweavePublicationMaterialUploader.js`, or anything else
//   under `application/`.** This file is a producer of the `signer` those
//   files already accept, never a rewrite of either.
export function createArweaveInjectedProviderSigner({
    injectedProvider = null,
    gatewayUrl = DEFAULT_GATEWAY_URL,
    fetchImpl = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signingTimeoutMs = DEFAULT_SIGNING_TIMEOUT_MS,
    permissions = DEFAULT_PERMISSIONS
} = {}) {
    if (!injectedProvider || typeof injectedProvider.sign !== 'function') {
        return undefined;
    }

    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const base = (typeof gatewayUrl === 'string' && gatewayUrl.length > 0 ? gatewayUrl : DEFAULT_GATEWAY_URL).replace(/\/+$/, '');

    // sign(material, tags = []) -> Promise<{ id, transaction }>. See this
    // file's own header for the full contract. Throws for non-string/empty
    // material, for a malformed `tags` array or entry, for material
    // exceeding the single-chunk ceiling, for an unavailable fetch
    // implementation, or for a gateway/wallet response that resolves but
    // carries no usable id — a genuine gateway or wallet failure propagates
    // as a rejection, never swallowed. `tags` defaults to `[]`, identical to
    // this function's own behavior before 0.9.490.
    async function sign(material, tags = []) {
        if (typeof material !== 'string' || material.length === 0) {
            throw new Error('ArweaveInjectedProviderSigner: sign() requires a non-empty string material');
        }
        if (typeof fetchFn !== 'function') {
            throw new Error('ArweaveInjectedProviderSigner: no fetch implementation available — pass fetchImpl explicitly');
        }
        if (!Array.isArray(tags)) {
            throw new Error('ArweaveInjectedProviderSigner: sign() requires tags to be an array');
        }
        const encodedTags = tags.map((tag) => {
            if (!tag || typeof tag.name !== 'string' || tag.name.length === 0 || typeof tag.value !== 'string') {
                throw new Error('ArweaveInjectedProviderSigner: sign() requires every tag to be a { name, value } pair of strings');
            }
            return {
                name: base64UrlEncode(new TextEncoder().encode(tag.name)),
                value: base64UrlEncode(new TextEncoder().encode(tag.value))
            };
        });

        const dataBytes = new TextEncoder().encode(material);
        if (dataBytes.length > MAX_SINGLE_CHUNK_BYTES) {
            throw new Error('ArweaveInjectedProviderSigner: material exceeds the single-chunk limit this signer supports');
        }

        if (typeof injectedProvider.connect === 'function') {
            try {
                await withSigningTimeout(injectedProvider.connect(permissions), signingTimeoutMs, 'connect()');
            } catch (error) {
                if (error instanceof SigningTimeoutError) {
                    throw new Error(`ArweaveInjectedProviderSigner: ${error.message}`);
                }
                throw new Error(`ArweaveInjectedProviderSigner: wallet extension rejected connect() — ${describeInjectedProviderError(error)}`);
            }
        }

        const anchorFetchedAt = Date.now();
        const [lastTx, reward] = await Promise.all([
            fetchText(fetchFn, `${base}/tx_anchor`, timeoutMs, 'anchor'),
            fetchText(fetchFn, `${base}/price/${dataBytes.length}`, timeoutMs, 'price')
        ]);

        const { dataRoot, chunks, proofs } = await computeSingleChunkMerkleData(dataBytes);

        const unsignedTransaction = {
            format: 2,
            id: '',
            last_tx: lastTx,
            owner: '',
            tags: encodedTags,
            target: '',
            quantity: '0',
            data_root: base64UrlEncode(dataRoot),
            data: base64UrlEncode(dataBytes),
            data_size: String(dataBytes.length),
            reward,
            signature: '',
            // AMENDED — a real Wander/ArConnect installation surfaces
            // "expected to be not undefined" the instant sign() is called,
            // live-confirmed (not reproducible in this codebase's own
            // headless test suite, which only ever exercises a fake
            // injectedProvider). Per Wander's own docs, sign() expects "an
            // Arweave transaction instance ... created via
            // arweave.createTransaction()" — a real arweave-js Transaction,
            // which carries a `chunks` field this plain object never had.
            // A known Wander issue (th8ta/ArConnect#31, "arweaveWallet.sign
            // results in dropped transaction data/chunk keys") independently
            // confirms sign()'s own internal reconstruction reads `chunks`.
            // Per arweave-js's own transaction.ts, `getSignatureData()` only
            // calls `prepareChunks()` itself when `!this.data_root` — since
            // this file already sets `data_root` up front, that guard never
            // fires, so `chunks` must already be attached here or signing
            // has nothing to read.
            //
            // Deliberately hand-rolled rather than depending on arweave-js
            // (this file's own "no external dependency" line, held since
            // 0.9.121 — see this file's own header) — computed by the SAME
            // single-leaf Merkle construction `computeSingleChunkMerkleData()`
            // already uses for `data_root`, matching arweave-js's own
            // `Chunk`/`Proof` shapes (`merkle.ts`) field-for-field. Every
            // binary field is base64url-encoded, mirroring `data`/`data_root`
            // immediately above, rather than arweave-js's own raw-Uint8Array
            // internal representation, since this object is never anything
            // but a plain, JSON-safe value crossing a postMessage boundary.
            //
            // A BEST-EFFORT TRANSLATION, NOT A CONFIRMED FIX — this codebase
            // has no way to run a real Wander/ArConnect extension in its own
            // test suite (see this file's own tests, which only ever exercise
            // a fake injectedProvider); this is the most faithful
            // reconstruction available from arweave-js's own published source
            // and Wander's own documented contract, still awaiting a live
            // retry to confirm it actually resolves the failure.
            chunks: {
                data_root: base64UrlEncode(dataRoot),
                chunks,
                proofs
            }
        };

        let signed;
        try {
            signed = await withSigningTimeout(injectedProvider.sign(unsignedTransaction), signingTimeoutMs, 'sign()');
        } catch (error) {
            if (error instanceof SigningTimeoutError) {
                throw new Error(`ArweaveInjectedProviderSigner: ${error.message}`);
            }
            throw new Error(`ArweaveInjectedProviderSigner: wallet extension rejected sign() — ${describeInjectedProviderError(error)}`);
        }
        if (!signed || typeof signed.id !== 'string' || signed.id.length === 0) {
            throw new Error('ArweaveInjectedProviderSigner: injected provider resolved with no valid transaction id');
        }

        // AMENDED — `chunks` above exists ONLY to satisfy a real wallet's
        // OWN internal sign() reconstruction (see that field's own header);
        // it is never part of Arweave's actual wire format. arweave-js's
        // own Transaction#toJSON() explicitly excludes `chunks` from what
        // gets serialized to a gateway — a real wallet's sign() commonly
        // returns the transaction it received with its own fields merged
        // in (per this file's own tests' fakeWallet, and per the same
        // th8ta/ArConnect#31 issue this fix is built on, whose own spread-
        // based reconstruction preserves whatever it was given), so
        // `signed` would otherwise still carry it straight into
        // ArweavePublicationMaterialUploader.js's own POST body — an
        // unexpected extra field a real gateway's strict schema validator
        // has no reason to accept. `uploader.upload()`'s own header already
        // documents treating this returned `transaction` as completely
        // opaque and POSTing it unread; this is the one, isolated place
        // that keeps that opaque value limited to fields the network
        // actually expects.
        const { chunks: _chunks, ...transaction } = signed;

        // Diagnostic only — an anchor (last_tx) or reward fetched before a
        // wallet's own signing popup is approved can go stale by the time
        // the transaction actually reaches the network: real Arweave nodes
        // only accept a `last_tx` naming one of a recent range of blocks,
        // and `reward` must still meet the CURRENT price at submission
        // time. Both would surface as the SAME generic "Transaction
        // verification failed" this file has already ruled every field-
        // encoding cause out for. This has no fix on this file's own side
        // (there is no way to sign AFTER knowing the exact submission
        // time) — it only makes a staleness explanation visible instead of
        // invisible.
        console.error('ArweaveInjectedProviderSigner: time elapsed between fetching last_tx/reward and sign() resolving', {
            elapsedMs: Date.now() - anchorFetchedAt
        });

        // AMENDED — live-confirmed: a real wallet's sign() resolved with
        // `data` as a raw Uint8Array rather than the base64url string this
        // file's own `unsignedTransaction` used — arweave-js's own
        // Transaction class stores `data` internally exactly that way,
        // only base64url-encoding it through its own toJSON()/get(), which
        // a plain object spread (here and, per th8ta/ArConnect#31,
        // apparently inside the wallet's own reconstruction too) never
        // calls. `JSON.stringify()` turns a bare Uint8Array into a
        // "{"0":.., "1":..}" object instead of a string — syntactically
        // valid JSON, but nothing like the transaction record Arweave's
        // own gateway expects, hence the live "Invalid JSON" 400. `tags`
        // gets the identical treatment for the same reason: arweave-js's
        // own Tag class holds `name`/`value` the same raw way (see
        // wander-docs' own `tag.get('name', { decode: true })` — decoding
        // is opt-in, meaning the raw form is Uint8Array too), and this
        // wallet added its own tags (empty before signing, non-empty
        // after) that never passed through this file's own base64url
        // encoding at all.
        transaction.data = toBase64UrlIfBinary(transaction.data);
        if (Array.isArray(transaction.tags)) {
            transaction.tags = transaction.tags.map((tag) => {
                if (!tag) {
                    return tag;
                }
                if (tag.name instanceof Uint8Array || tag.value instanceof Uint8Array) {
                    return { name: toBase64UrlIfBinary(tag.name), value: toBase64UrlIfBinary(tag.value) };
                }
                // Diagnostic only — a tag that is neither a plain
                // { name: string, value: string } pair NOR one with
                // Uint8Array fields (the two shapes this file knows how to
                // normalize) means whatever the wallet actually signed
                // over may not survive into JSON.stringify() the same way
                // — e.g. a live class instance with getter-only fields,
                // where `tag.name`/`tag.value` read as `undefined` here
                // even though the class's own toJSON() might still encode
                // it correctly for the wire.
                if (typeof tag.name !== 'string' || typeof tag.value !== 'string') {
                    console.error('ArweaveInjectedProviderSigner: a wallet-added tag has an unrecognized shape — neither plain strings nor Uint8Array', {
                        nameType: tag.name && tag.name.constructor ? tag.name.constructor.name : typeof tag.name,
                        valueType: tag.value && tag.value.constructor ? tag.value.constructor.name : typeof tag.value,
                        tagConstructor: tag.constructor ? tag.constructor.name : typeof tag
                    });
                }
                return tag;
            });
        }

        // Diagnostic only — a direct, offline check of the ONE thing this
        // file computes itself (data_root) against the ACTUAL final `data`
        // bytes being sent, catching a "the wallet's own decode of our
        // base64url data subtly altered it" class of bug that field-type/
        // value inspection alone cannot: if this ever logs a mismatch, the
        // gateway's own "Transaction verification failed" is explained —
        // data_root no longer matches data, so the server's own
        // independently recomputed root can never match the claimed one.
        if (typeof transaction.data === 'string') {
            const recomputedDataRoot = base64UrlEncode((await computeSingleChunkMerkleData(base64UrlDecode(transaction.data))).dataRoot);
            if (recomputedDataRoot !== transaction.data_root) {
                console.error('ArweaveInjectedProviderSigner: data_root does not match a fresh recomputation from the final data field', {
                    claimedDataRoot: transaction.data_root,
                    recomputedFromFinalData: recomputedDataRoot
                });
            }
        }

        return { id: signed.id, transaction };
    }

    return Object.freeze({ sign });
}

createArweaveInjectedProviderSigner.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
createArweaveInjectedProviderSigner.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;
createArweaveInjectedProviderSigner.DEFAULT_SIGNING_TIMEOUT_MS = DEFAULT_SIGNING_TIMEOUT_MS;

// A distinct Error subclass (rather than a message-sniffing check) so
// `sign()`'s own catch can tell "the extension never answered" apart from
// "the extension answered with a rejection" — mirrors nostr/
// NostrInjectedProviderPublisher.js's own identically-named class exactly,
// one substrate over.
class SigningTimeoutError extends Error {}

// withSigningTimeout(promise, ms, label) -> Promise. Resolves/rejects
// exactly as `promise` does, unless `ms` elapses first, in which case it
// rejects with a SigningTimeoutError naming which call never answered —
// mirrors nostr/NostrInjectedProviderPublisher.js's own identically-named
// helper exactly.
function withSigningTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new SigningTimeoutError(`${label} did not respond within ${ms}ms — check for a pending approval popup from your Arweave wallet`));
        }, ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}

// Bounded GET returning trimmed text, or a rejection on a non-2xx response,
// a timeout, or a transport failure — a genuine gateway failure, never
// swallowed. Mirrors application/arweave/ArweavePublicationMaterialUploader.js's
// own AbortController/timeout shape, one call at a time rather than one
// POST.
async function fetchText(fetchFn, url, timeoutMs, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetchFn(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        throw new Error(`ArweaveInjectedProviderSigner: gateway could not supply a ${label}`);
    }
    return (await response.text()).trim();
}

// The single-leaf case of Arweave's own Merkle scheme: for data that fits
// in exactly one chunk (guaranteed by MAX_SINGLE_CHUNK_BYTES, above),
// returns the SAME three facts a real arweave-js Transaction's own
// `prepareChunks()`/`chunks` property would carry for one chunk (see
// merkle.ts's own `generateTransactionChunks()`/`generateLeaves()`/
// `generateProofs()`, and this function's own use at the `chunks:` field
// above) — computed here directly rather than by building and walking an
// actual tree, since a one-leaf tree has no branch nodes to build:
//   - `dataRoot` — the leaf's own id, SHA-256(SHA-256(chunkHash) ||
//     SHA-256(offsetNote)) — where `chunkHash` is SHA-256(dataBytes) and
//     `offsetNote` is the chunk's own end offset (dataBytes.length)
//     encoded as a big-endian, 32-byte buffer (arweave-js's own
//     `intToBuffer` — see `encodeOffsetNote()` below).
//   - `chunks` — one `Chunk` (`{ dataHash, minByteRange, maxByteRange }`),
//     `dataHash` base64url-encoded per this file's own JSON-safe
//     convention (see `chunks:` field's own comment, above).
//   - `proofs` — one `Proof` (`{ offset, proof }`); for a single leaf,
//     `proof` is `chunkHash || offsetNote` (merkle.ts's own
//     `resolveBranchProofs()` leaf case, starting from an empty
//     accumulated proof — there are no branch nodes to prepend).
// Returns `{ dataRoot, chunks, proofs }` — `dataRoot` as 32 raw bytes
// (matching this function's own pre-existing return shape, still
// base64url-encoded at each call site), `chunks`/`proofs` already in
// their final, base64url-safe, JSON-serializable form.
async function computeSingleChunkMerkleData(dataBytes) {
    const chunkHash = await sha256(dataBytes);
    const offsetNote = encodeOffsetNote(dataBytes.length);
    const hashedChunkHash = await sha256(chunkHash);
    const hashedOffsetNote = await sha256(offsetNote);
    const dataRoot = await sha256(concatBytes(hashedChunkHash, hashedOffsetNote));
    return {
        dataRoot,
        chunks: [{
            dataHash: base64UrlEncode(chunkHash),
            minByteRange: 0,
            maxByteRange: dataBytes.length
        }],
        proofs: [{
            offset: dataBytes.length - 1,
            proof: base64UrlEncode(concatBytes(chunkHash, offsetNote))
        }]
    };
}

async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

// A real wallet extension's own rejection reason — often a bare string,
// not an Error, once it has crossed that extension's own content-script
// message-passing boundary (which loses any original stack in transit,
// per this file's own header on "no transcription of any one wallet's
// TypeScript definitions"). Reading `.message` first, falling back to the
// value itself, means whichever shape a given extension rejects with, the
// re-thrown Error above always carries a readable reason rather than
// "[object Object]" or an empty string.
function describeInjectedProviderError(error) {
    if (error && typeof error.message === 'string' && error.message) {
        return error.message;
    }
    return typeof error === 'string' && error ? error : 'no further detail was given';
}

// A field a real wallet's own sign() resolution may return already-decoded
// (a raw Uint8Array) rather than the base64url string Arweave's own wire
// format expects — see the `sign()` field's own AMENDED comment, above, for
// the full evidence. Passes anything else through unchanged: a field this
// file or a wallet already encoded as a string needs no second encoding.
function toBase64UrlIfBinary(value) {
    return value instanceof Uint8Array ? base64UrlEncode(value) : value;
}

// Encodes a non-negative integer into a fixed-width, 32-byte, big-endian
// buffer — Arweave's own "note" encoding for a chunk's byte offset.
function encodeOffsetNote(offset) {
    const buffer = new Uint8Array(NOTE_SIZE);
    let remaining = offset;
    for (let i = buffer.length - 1; i >= 0 && remaining > 0; i--) {
        buffer[i] = remaining % 256;
        remaining = Math.floor(remaining / 256);
    }
    return buffer;
}

function base64UrlEncode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The inverse of base64UrlEncode() — needed only for the diagnostic
// verification below, never for anything this file sends onward.
function base64UrlDecode(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
