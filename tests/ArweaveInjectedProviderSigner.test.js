import { readFile } from 'node:fs/promises';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';

// 0.9.121 — Arweave Injected Provider Signer.
// See docs/Roadmap.md, "0.9.121 — Publication Distribution Host Capability
// Integration," for the full milestone story.
//
//   Section A: no injectedProvider, or a malformed one — undefined, never a throw
//   Section B: a real (fake-backed) sign() produces a well-formed, POST-able transaction
//   Section C: connect() is called with the expected permissions before signing
//   Section D: the single-chunk ceiling is enforced before any network call
//   Section E: malformed material degrades before signer/gateway are ever consulted
//   Section F: a genuine gateway failure propagates, never swallowed
//   Section G: a wallet resolving with no valid id throws — a contract violation, not a decline
//   Section H: FLAGSHIP — the produced signer, handed to the real, unmodified
//              ArweavePublicationMaterialUploader, actually uploads
//   Section I: architectural regression — no distribution-infrastructure knowledge, no external dependency

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function fakeGateway({ anchor = 'fake-anchor-value', reward = '123456', anchorOk = true, rewardOk = true } = {}) {
    return async (url) => {
        if (url.includes('/tx_anchor')) {
            return new Response(anchor, { status: anchorOk ? 200 : 500 });
        }
        if (url.includes('/price/')) {
            return new Response(reward, { status: rewardOk ? 200 : 500 });
        }
        throw new Error(`fakeGateway: unexpected url ${url}`);
    };
}

function fakeWallet({ idPrefix = 'FakeTx' } = {}) {
    const calls = { connect: [], sign: [] };
    return {
        calls,
        connect: async (permissions) => { calls.connect.push(permissions); },
        sign: async (transaction) => {
            calls.sign.push(transaction);
            return {
                ...transaction,
                owner: 'fake-owner-modulus',
                signature: 'fake-signature-bytes',
                id: `${idPrefix}${calls.sign.length}${'A'.repeat(30)}`
            };
        }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — no injectedProvider, or a malformed one — undefined.
    // ---------------------------------------------------------------
    {
        assert(createArweaveInjectedProviderSigner({}) === undefined, '1. no injectedProvider supplied degrades to undefined');
        assert(createArweaveInjectedProviderSigner() === undefined, '2. calling with no argument at all degrades to undefined');
        assert(createArweaveInjectedProviderSigner({ injectedProvider: {} }) === undefined, '3. an injectedProvider with no sign() function degrades to undefined');
        assert(createArweaveInjectedProviderSigner({ injectedProvider: { sign: 'not-a-function' } }) === undefined, '4. a non-function sign field degrades to undefined');

        console.log('✓ Section A: no usable injected wallet degrades gracefully to undefined, never a throw');
    }

    // ---------------------------------------------------------------
    // Section B — a real (fake-backed) sign() produces a well-formed,
    // POST-able transaction.
    // ---------------------------------------------------------------
    {
        const wallet = fakeWallet();
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: wallet, fetchImpl: fakeGateway() });
        assert(signer !== undefined && typeof signer.sign === 'function', '5. a usable injectedProvider resolves a real signer object');

        const signed = await signer.sign('hello arweave');
        assert(typeof signed.id === 'string' && signed.id.length > 0, '6. sign() resolves a real transaction id');
        assert(signed.transaction.format === 2, '7. the built transaction declares format 2');
        assert(signed.transaction.last_tx === 'fake-anchor-value', '8. the anchor came from the gateway\'s own /tx_anchor response');
        assert(signed.transaction.reward === '123456', '9. the reward came from the gateway\'s own /price response');
        assert(typeof signed.transaction.data === 'string' && signed.transaction.data.length > 0, '10. the transaction carries base64url-encoded data');
        assert(typeof signed.transaction.data_root === 'string' && signed.transaction.data_root.length > 0, '11. the transaction carries a computed data_root');
        assert(signed.transaction.data_size === String(new TextEncoder().encode('hello arweave').length), '12. data_size matches the material\'s own UTF-8 byte length');
        assert(signed.transaction.owner === 'fake-owner-modulus' && signed.transaction.signature === 'fake-signature-bytes', '13. owner/signature came from the wallet\'s own sign() response, unmodified');

        const secondSigned = await signer.sign('hello arweave');
        assert(secondSigned.transaction.data_root === signed.transaction.data_root, '14. data_root is a deterministic function of the material alone — no timestamp, no randomness');

        // AMENDED — a live Wander/ArConnect installation rejected sign()
        // with "expected to be not undefined" because this plain object
        // never carried a `chunks` field the real wallet's own internal
        // reconstruction reads (see computeSingleChunkMerkleData()'s own
        // header for the full chain of evidence). These assertions pin the
        // hand-rolled single-leaf Chunk/Proof shape this file attaches to
        // the transaction it HANDS TO sign() — `wallet.calls.sign[0]`, the
        // real input the fake wallet recorded, never `signed.transaction`
        // (the RESOLVED value), since `chunks` is deliberately stripped
        // from that before this file returns it (see the next assertion).
        const materialBytes = new TextEncoder().encode('hello arweave');
        const sentTransaction = wallet.calls.sign[wallet.calls.sign.length - 1];
        assert(sentTransaction.chunks && sentTransaction.chunks.data_root === signed.transaction.data_root,
            '14b. the chunks handed to sign() carries a data_root matching the transaction\'s own top-level data_root exactly');
        assert(Array.isArray(sentTransaction.chunks.chunks) && sentTransaction.chunks.chunks.length === 1,
            '14c. exactly one Chunk is attached — this file only ever handles the single-chunk case');
        const chunk = sentTransaction.chunks.chunks[0];
        assert(chunk.minByteRange === 0 && chunk.maxByteRange === materialBytes.length && typeof chunk.dataHash === 'string' && chunk.dataHash.length > 0,
            '14d. the Chunk spans the whole single chunk (0..byteLength) and carries a base64url-encoded dataHash');
        assert(Array.isArray(sentTransaction.chunks.proofs) && sentTransaction.chunks.proofs.length === 1,
            '14e. exactly one Proof is attached, matching the one Chunk');
        const proof = sentTransaction.chunks.proofs[0];
        assert(proof.offset === materialBytes.length - 1 && typeof proof.proof === 'string' && proof.proof.length > 0,
            '14f. the Proof\'s offset is the chunk\'s own last byte index (arweave-js\'s own convention), and proof is base64url-encoded');

        // AMENDED — `chunks` is never part of Arweave's actual wire format
        // (arweave-js's own Transaction#toJSON() excludes it) — sending it
        // on to a real gateway's /tx endpoint produced a live "Transaction
        // verification failed" 400. It must reach sign() (assertions
        // above) but never survive into the transaction this file hands
        // back to its own caller, which POSTs it unread.
        assert(!('chunks' in signed.transaction), '14g. the RETURNED transaction never carries a chunks field — stripped before this file hands it back, so it never reaches the gateway POST body');

        console.log('✓ Section B: a fake host wallet produces a real, well-formed, POST-able Arweave transaction — chunks reaches sign() but is stripped from what actually gets POSTed');
    }

    // ---------------------------------------------------------------
    // Section B2 — AMENDED: a real wallet's sign() resolution came back
    // live with `data` as a raw Uint8Array (not the base64url string this
    // file's own unsignedTransaction sent) and with its own tags added
    // (empty before signing, non-empty after) — a real Arweave gateway
    // rejected the resulting body with "Invalid JSON." This section
    // reproduces exactly that shape with a fake wallet and confirms every
    // binary field is normalized back to a JSON-safe string before this
    // file hands the transaction back to its own caller.
    // ---------------------------------------------------------------
    {
        const decodingWallet = () => {
            const calls = { connect: [], sign: [] };
            return {
                calls,
                connect: async () => {},
                sign: async (transaction) => {
                    calls.sign.push(transaction);
                    // Mimics arweave-js's own Transaction class: `data` is
                    // decoded back to raw bytes internally, and the wallet
                    // appended its own app-identifying tag with Uint8Array
                    // name/value, exactly per wander-docs' own "decoding is
                    // opt-in" get(name, { decode }) contract.
                    return {
                        ...transaction,
                        data: new TextEncoder().encode(atob(transaction.data.replace(/-/g, '+').replace(/_/g, '/'))),
                        tags: [
                            ...transaction.tags,
                            { name: new TextEncoder().encode('App-Name'), value: new TextEncoder().encode('Wander') }
                        ],
                        owner: 'fake-owner-modulus',
                        signature: 'fake-signature-bytes',
                        id: `DecodingTx${calls.sign.length}${'A'.repeat(30)}`
                    };
                }
            };
        };
        const wallet = decodingWallet();
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: wallet, fetchImpl: fakeGateway() });

        const signed = await signer.sign('hello arweave, decoded');
        assert(typeof signed.transaction.data === 'string' && signed.transaction.data.length > 0,
            '14h. a `data` field that came back as a raw Uint8Array is normalized to a base64url string, never left as binary for JSON.stringify() to explode into a byte-index object');
        assert(Array.isArray(signed.transaction.tags) && signed.transaction.tags.length === 1,
            '14i. the wallet\'s own added tag survives (this file adds none of its own, and never drops one)');
        const addedTag = signed.transaction.tags[0];
        assert(typeof addedTag.name === 'string' && typeof addedTag.value === 'string' && addedTag.name.length > 0 && addedTag.value.length > 0,
            '14j. a tag whose name/value came back as raw Uint8Array is normalized to base64url strings the same way `data` is');

        // The whole thing must still be a compact, well-formed JSON body —
        // never a bloated byte-index object — the exact live failure mode
        // this section reproduces and fixes.
        const body = JSON.stringify(signed.transaction);
        assert(!body.includes('"0":') , '14k. the POST body contains no byte-index object anywhere — the live "Invalid JSON" failure mode is gone');
        assert(body.length < 2000, `14l. the body stays a compact, well-formed transaction record rather than an exploded byte-index object: got length ${body.length}`);

        console.log('✓ Section B2: a wallet that returns already-decoded (Uint8Array) data/tag fields is normalized back to base64url strings before this file hands the transaction back — the exact live "Invalid JSON" failure this milestone fixes');
    }

    // ---------------------------------------------------------------
    // Section C — connect() is called with the expected permissions
    // before signing.
    // ---------------------------------------------------------------
    {
        const wallet = fakeWallet();
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: wallet, fetchImpl: fakeGateway() });
        await signer.sign('needs a connection first');

        assert(wallet.calls.connect.length === 1, '15. connect() is called exactly once per sign() — lazily, on the same click that triggers signing');
        assert(Array.isArray(wallet.calls.connect[0]) && wallet.calls.connect[0].includes('SIGN_TRANSACTION'), '16. connect() is called with the SIGN_TRANSACTION permission');

        const walletWithoutConnect = fakeWallet();
        delete walletWithoutConnect.connect;
        const signerWithoutConnect = createArweaveInjectedProviderSigner({ injectedProvider: walletWithoutConnect, fetchImpl: fakeGateway() });
        const signedWithoutConnect = await signerWithoutConnect.sign('a wallet with no connect() at all');
        assert(typeof signedWithoutConnect.id === 'string', '17. a wallet exposing no connect() at all is still fully usable — duck-typed, never required');

        console.log('✓ Section C: connection is attempted lazily, only when the wallet actually exposes one');
    }

    // ---------------------------------------------------------------
    // Section D — the single-chunk ceiling is enforced before any
    // network call.
    // ---------------------------------------------------------------
    {
        const wallet = fakeWallet();
        let gatewayCalled = false;
        const signer = createArweaveInjectedProviderSigner({
            injectedProvider: wallet,
            fetchImpl: async (...args) => { gatewayCalled = true; return fakeGateway()(...args); }
        });

        const oversized = 'x'.repeat(256 * 1024 + 1);
        await signer.sign(oversized).then(
            () => assert(false, '18. oversized material should have thrown'),
            (error) => assert(/single-chunk limit/.test(error.message), '18. oversized material throws a clear single-chunk-limit error')
        );
        assert(gatewayCalled === false, '19. no gateway call is made for material that already fails the size check');
        assert(wallet.calls.sign.length === 0, '20. the wallet is never asked to sign material that already fails the size check');

        console.log('✓ Section D: material exceeding the single-chunk ceiling is rejected before any signer/gateway call');
    }

    // ---------------------------------------------------------------
    // Section E — malformed material degrades before signer/gateway
    // are ever consulted.
    // ---------------------------------------------------------------
    {
        const wallet = fakeWallet();
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: wallet, fetchImpl: fakeGateway() });

        for (const malformed of [undefined, null, 42, '']) {
            await signer.sign(malformed).then(
                () => assert(false, `21. sign(${JSON.stringify(malformed)}) should have thrown`),
                (error) => assert(/non-empty string material/.test(error.message), '21. non-string/empty material throws a clear error')
            );
        }
        assert(wallet.calls.sign.length === 0, '22. the wallet is never consulted for malformed material');

        console.log('✓ Section E: malformed material is rejected before the signer/gateway are ever consulted');
    }

    // ---------------------------------------------------------------
    // Section F — a genuine gateway failure propagates, never
    // swallowed.
    // ---------------------------------------------------------------
    {
        const wallet = fakeWallet();
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: wallet, fetchImpl: fakeGateway({ anchorOk: false }) });

        await signer.sign('a gateway that declines the anchor request').then(
            () => assert(false, '23. a failing gateway anchor request should have propagated'),
            (error) => assert(/gateway could not supply/.test(error.message), '23. a genuine gateway failure propagates as a rejection, never swallowed')
        );

        console.log('✓ Section F: a genuine gateway failure propagates as a rejection');
    }

    // ---------------------------------------------------------------
    // Section G — a wallet resolving with no valid id throws.
    // ---------------------------------------------------------------
    {
        const brokenWallet = { sign: async (transaction) => ({ ...transaction, owner: 'x', signature: 'y', id: '' }) };
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: brokenWallet, fetchImpl: fakeGateway() });

        await signer.sign('a wallet that violates its own contract').then(
            () => assert(false, '24. a wallet resolving with no valid id should have thrown'),
            (error) => assert(/no valid transaction id/.test(error.message), '24. a wallet violating its own contract throws rather than degrading silently')
        );

        console.log('✓ Section G: a wallet resolving with no valid id throws, never degrades silently');
    }

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: the produced signer, handed to the real,
    // unmodified ArweavePublicationMaterialUploader, actually uploads.
    // ---------------------------------------------------------------
    {
        const wallet = fakeWallet({ idPrefix: 'FlagshipTx' });
        const signer = createArweaveInjectedProviderSigner({ injectedProvider: wallet, fetchImpl: fakeGateway() });

        const uploader = new ArweavePublicationMaterialUploader({
            signer,
            fetchImpl: async (url, options) => {
                assert(url.endsWith('/tx'), '25. FLAGSHIP — the uploader POSTs to the gateway\'s own /tx endpoint');
                assert(options.method === 'POST', '25. FLAGSHIP — the uploader issues a POST');
                const body = JSON.parse(options.body);
                assert(typeof body.data_root === 'string' && body.data_root.length > 0, '25. FLAGSHIP — the POST body carries the computed data_root, unread and unmodified by the uploader');
                return new Response('accepted', { status: 200 });
            }
        });

        const uri = await uploader.upload(JSON.stringify({ hello: 'flagship' }));
        assert(typeof uri === 'string' && uri.startsWith('ar://FlagshipTx1'), '26. FLAGSHIP — a real (fake-backed) host wallet, adapted through this file alone, produces a uri the real, unmodified uploader accepts end to end');

        console.log('✓ Section H: FLAGSHIP — a fake host wallet\'s output reaches the real, unmodified ArweavePublicationMaterialUploader and actually uploads');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../arweave/ArweaveInjectedProviderSigner.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/PublicationDistribution|ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher/.test(codeOnly),
            '27. never imports or references any distribution-subsystem infrastructure — a pure host-capability producer');
        assert(!codeOnly.includes("from '../ui/") && !codeOnly.includes('from "../ui/'), '28. no UI import of any kind');
        assert(!codeOnly.includes('localStorage'), '29. no persistence of any kind');
        assert(!/\bimport\s/.test(codeOnly), '30. no import statement at all — zero external or internal dependencies');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '31. exports exactly one public function');
        assert(!/privateKey|mnemonic|\bseed\b|walletPassword/i.test(codeOnly), '32. never reads or derives a private key, mnemonic, seed, or wallet password');

        console.log('✓ Section I: architectural regression — a pure host-capability producer, no distribution knowledge, no dependency of any kind');
    }

    console.log('\nAll ArweaveInjectedProviderSigner tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
