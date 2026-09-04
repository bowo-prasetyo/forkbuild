const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PERMISSIONS = ['SIGN_TRANSACTION'];
const NOTE_SIZE = 32;
const MAX_SINGLE_CHUNK_BYTES = 256 * 1024;

// 0.9.121 — Arweave Injected Provider Signer.
//
// application/ArweavePublicationDistributionRuntimeAdapter.js (0.9.109)
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
//   application/ArweavePublicationDistributionRuntimeAdapter.js   (0.9.109, unmodified)
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
// deliberately unimplemented here. `application/ArweavePublicationMaterialUploader.js`'s
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
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Multi-chunk data, RSA-PSS signing, deep-hash computation, or any
//   other part of the Arweave protocol not already named above.** See
//   "A single-chunk transaction only" and "`data_root` is computed here,"
//   above.
// - **Any UI, connection button, or persisted wallet state.** See "No
//   explicit connect step," above.
// - **Any change to `application/ArweavePublicationDistributionRuntimeAdapter.js`,
//   `application/ArweavePublicationMaterialUploader.js`, or anything else
//   under `application/`.** This file is a producer of the `signer` those
//   files already accept, never a rewrite of either.
export function createArweaveInjectedProviderSigner({
    injectedProvider = null,
    gatewayUrl = DEFAULT_GATEWAY_URL,
    fetchImpl = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    permissions = DEFAULT_PERMISSIONS
} = {}) {
    if (!injectedProvider || typeof injectedProvider.sign !== 'function') {
        return undefined;
    }

    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const base = (typeof gatewayUrl === 'string' && gatewayUrl.length > 0 ? gatewayUrl : DEFAULT_GATEWAY_URL).replace(/\/+$/, '');

    // sign(material) -> Promise<{ id, transaction }>. See this file's own
    // header for the full contract. Throws for non-string/empty material,
    // for material exceeding the single-chunk ceiling, for an unavailable
    // fetch implementation, or for a gateway/wallet response that resolves
    // but carries no usable id — a genuine gateway or wallet failure
    // propagates as a rejection, never swallowed.
    async function sign(material) {
        if (typeof material !== 'string' || material.length === 0) {
            throw new Error('ArweaveInjectedProviderSigner: sign() requires a non-empty string material');
        }
        if (typeof fetchFn !== 'function') {
            throw new Error('ArweaveInjectedProviderSigner: no fetch implementation available — pass fetchImpl explicitly');
        }

        const dataBytes = new TextEncoder().encode(material);
        if (dataBytes.length > MAX_SINGLE_CHUNK_BYTES) {
            throw new Error('ArweaveInjectedProviderSigner: material exceeds the single-chunk limit this signer supports');
        }

        if (typeof injectedProvider.connect === 'function') {
            await injectedProvider.connect(permissions);
        }

        const [lastTx, reward] = await Promise.all([
            fetchText(fetchFn, `${base}/tx_anchor`, timeoutMs, 'anchor'),
            fetchText(fetchFn, `${base}/price/${dataBytes.length}`, timeoutMs, 'price')
        ]);

        const dataRoot = await computeSingleChunkDataRoot(dataBytes);

        const unsignedTransaction = {
            format: 2,
            id: '',
            last_tx: lastTx,
            owner: '',
            tags: [],
            target: '',
            quantity: '0',
            data_root: base64UrlEncode(dataRoot),
            data: base64UrlEncode(dataBytes),
            data_size: String(dataBytes.length),
            reward,
            signature: ''
        };

        const signed = await injectedProvider.sign(unsignedTransaction);
        if (!signed || typeof signed.id !== 'string' || signed.id.length === 0) {
            throw new Error('ArweaveInjectedProviderSigner: injected provider resolved with no valid transaction id');
        }

        return { id: signed.id, transaction: signed };
    }

    return Object.freeze({ sign });
}

createArweaveInjectedProviderSigner.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
createArweaveInjectedProviderSigner.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;

// Bounded GET returning trimmed text, or a rejection on a non-2xx response,
// a timeout, or a transport failure — a genuine gateway failure, never
// swallowed. Mirrors application/ArweavePublicationMaterialUploader.js's
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

// The single-leaf case of Arweave's own Merkle `data_root` scheme: for data
// that fits in exactly one chunk (guaranteed by MAX_SINGLE_CHUNK_BYTES,
// above), the root is exactly the one leaf's own id —
// SHA-256(SHA-256(chunkHash) || SHA-256(offsetNote)) — where `chunkHash` is
// SHA-256(dataBytes) and `offsetNote` is the chunk's own end offset
// (dataBytes.length for a single chunk) encoded as a big-endian, 32-byte
// buffer. Returns 32 raw bytes.
async function computeSingleChunkDataRoot(dataBytes) {
    const chunkHash = await sha256(dataBytes);
    const offsetNote = encodeOffsetNote(dataBytes.length);
    const hashedChunkHash = await sha256(chunkHash);
    const hashedOffsetNote = await sha256(offsetNote);
    return sha256(concatBytes(hashedChunkHash, hashedOffsetNote));
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
