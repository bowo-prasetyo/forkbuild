import { BitcoinAnchorTransactionBuilder } from '../anchoring/BitcoinAnchorTransactionBuilder.js';
import { BitcoinAnchorPsbtBuilder } from '../anchoring/BitcoinAnchorPsbtBuilder.js';
import { BitcoinAnchorWalletSigner } from '../anchoring/BitcoinAnchorWalletSigner.js';
import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';
import { BitcoinInjectedProviderWalletAdapter } from '../anchoring/BitcoinInjectedProviderWalletAdapter.js';
import { BitcoinWalletConnectionState } from '../application/BitcoinWalletConnectionState.js';
import { describeBitcoinWalletConnectionStateLabel, describeBitcoinWalletConnection } from '../application/BitcoinWalletConnectionView.js';

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// 0.8.50 (anchoring/BitcoinAnchorWalletSigner.js) proved ForkBuild can hand
// a real unsigned PSBT to an ALREADY-CONNECTED `wallet` and never trust its
// own "signed: true" claim. This milestone builds the missing piece before
// that one: obtaining `wallet` in the first place, from a real person's own
// browser extension, through an explicit "Connect Bitcoin Wallet" action —
// never assumed, never automatic, never a secret ForkBuild ever sees.
//
//   Section A: FLAGSHIP — Alice connects a wallet through
//              BitcoinInjectedProviderWalletAdapter (a fake, UniSat-shaped
//              `injectedProvider` standing in for a real extension),
//              BitcoinWalletConnection reports CONNECTED with her account
//              and network, and her connection's own `.wallet` feeds a
//              REAL BitcoinAnchorWalletSigner.requestSignature() against a
//              REAL plan/description/PSBT end to end, producing a genuine
//              `signed: true` — then she disconnects, and every trace of
//              the signing capability is gone.
//   Section B: REJECTED and UNAVAILABLE stay two different outcomes, never
//              collapsed into one "connection failed."
//   Section C: a network mismatch (wallet on testnet, ForkBuild expecting
//              mainnet) is reported, never silently substituted or
//              auto-corrected.
//   Section D: a provider-contract violation (connected: true with no
//              usable wallet/account/network) throws — a caller-contract
//              violation, never an operational outcome.
//   Section E: the label vocabulary names all four states honestly, and
//              describeBitcoinWalletConnection() adds no field beyond what
//              its own header promises.
//   Section F: the ONE concrete adapter this milestone ships translates a
//              UniSat-shaped provider's own real API faithfully — an
//              empty account list is a decline, a thrown requestAccounts()
//              is unavailable, an unrecognized network name is
//              unavailable, and a definite signPsbt() rejection is neither.
//
// See docs/Principles.md, "A Connection Grants A Capability; It Does Not
// Grant Trust (0.8.58)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

function utxo(txid, vout, valueSats, scriptType) {
    return { txid: txid.repeat(64).slice(0, 64), vout, valueSats, ...(scriptType ? { scriptType } : {}) };
}

function buildFlagshipDescription() {
    const transactionBuilder = new BitcoinAnchorTransactionBuilder({ network: 'mainnet', feeRateSatsPerVByte: 1 });
    const psbtBuilder = new BitcoinAnchorPsbtBuilder();
    const plan = transactionBuilder.build({
        contentHash: 'deadbeef',
        utxos: [utxo('a', 0, 100000, 'p2wpkh')],
        changeAddress: 'bc1qexamplechangeaddress'
    });
    return psbtBuilder.build({
        plan,
        utxoDetails: [{ txid: plan.inputs[0].txid, vout: 0, scriptPubKey: '0014' + 'a'.repeat(40), valueSats: 100000 }],
        changeScriptPubKey: '0014' + 'b'.repeat(40)
    });
}

// ---------------------------------------------------------------------
// A minimal, self-contained signed-PSBT hex encoder — the same technique
// tests/BitcoinAnchorWalletSigning.test.js's own `buildSignedPsbtHex()`
// already uses, duplicated rather than imported (the identical
// self-containment every anchoring/ test file in this codebase already
// holds). This only ever needs to prove structural inspection passes —
// never cryptographic validity, which stays anchoring/
// BitcoinAnchorSignedPsbtFinalizer.js's own, separate concern.
// ---------------------------------------------------------------------

function compactSizeHex(n) {
    if (n <= 0xfc) return n.toString(16).padStart(2, '0');
    throw new Error('test helper does not need multi-byte compactSize');
}

function u64le(n) {
    let big = BigInt(n);
    const bytes = [];
    for (let i = 0; i < 8; i++) { bytes.push(Number(big & 0xffn)); big >>= 8n; }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function kv(keyHex, valueHex) {
    return compactSizeHex(keyHex.length / 2) + keyHex + compactSizeHex(valueHex.length / 2) + valueHex;
}

function u32le(n) {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
        .map((b) => b.toString(16).padStart(2, '0')).join('');
}

function reverseHex(hex) {
    return hex.match(/.{2}/g).reverse().join('');
}

function encodeUnsignedTxHex(tx) {
    const inputsHex = tx.inputs.map((input) =>
        reverseHex(input.txid) + u32le(input.vout) + compactSizeHex(0) + u32le(input.sequence)
    ).join('');
    const outputsHex = tx.outputs.map((output) =>
        u64le(output.valueSats) + compactSizeHex(output.scriptPubKey.length / 2) + output.scriptPubKey
    ).join('');
    return u32le(tx.version) + compactSizeHex(tx.inputs.length) + inputsHex
        + compactSizeHex(tx.outputs.length) + outputsHex + u32le(tx.locktime);
}

function finalScriptWitnessKv() {
    const item = 'ff';
    const value = compactSizeHex(1) + compactSizeHex(item.length / 2) + item;
    return kv('08', value);
}

// Signs EVERY input of `description` with a structurally-valid (never
// cryptographically valid) finalScriptWitness.
function signedPsbtHexFor(description) {
    let out = '70736274ff'; // magic
    out += kv('00', encodeUnsignedTxHex(description.globalUnsignedTx));
    out += '00';
    description.inputs.forEach((input) => {
        const w = input.witnessUtxo;
        const valueHex = u64le(w.valueSats) + compactSizeHex(w.scriptPubKey.length / 2) + w.scriptPubKey;
        out += kv('01', valueHex);
        out += finalScriptWitnessKv();
        out += '00';
    });
    description.globalUnsignedTx.outputs.forEach(() => { out += '00'; });
    return out;
}

// A fake browser wallet extension, shaped exactly like UniSat's own real,
// documented API — the ONE concrete shape anchoring/
// BitcoinInjectedProviderWalletAdapter.js adapts. Never a real extension;
// see that file's own header on why a fake standing in for its real,
// stable, documented API is a faithful stand-in, not a fabrication.
function fakeUnisatProvider({ account = 'bc1qalice0000000000000000000000000000000', network = 'livenet', signedPsbtHex = null, rejectAccounts = false, throwOnAccounts = false, rejectSign = false } = {}) {
    return {
        async requestAccounts() {
            if (throwOnAccounts) throw new Error('simulated: wallet locked');
            if (rejectAccounts) return [];
            return [account];
        },
        async getNetwork() {
            return network;
        },
        async signPsbt(psbtHex) {
            if (rejectSign) throw new Error('User rejected the request');
            return signedPsbtHex || psbtHex; // stands in for a signed result when the caller does not care about content
        }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const description = buildFlagshipDescription();
        const signedHex = signedPsbtHexFor(description);

        const injectedProvider = fakeUnisatProvider({ account: 'bc1qalice0000000000000000000000000000000', network: 'livenet', signedPsbtHex: signedHex });
        const adapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider });
        const connection = new BitcoinWalletConnection({ provider: adapter });

        assert(connection.status === BitcoinWalletConnectionState.DISCONNECTED, '1. Alice opens the Bitcoin Anchor UI — the wallet starts DISCONNECTED');
        assert(connection.wallet === null, '2. no signing capability exists before she connects');

        const connectResult = await connection.connect();
        assert(connectResult.connected === true, '3. Alice explicitly clicks "Connect Bitcoin Wallet" and the wallet reports an account and network');
        assert(connection.status === BitcoinWalletConnectionState.CONNECTED, '4. the connection now reports CONNECTED');
        assert(connection.account === 'bc1qalice0000000000000000000000000000000', '5. her account is exposed');
        assert(connection.network === 'mainnet', '6. UniSat\'s own "livenet" is translated into this codebase\'s own "mainnet" vocabulary');

        // ForkBuild constructs the real PSBT using 0.8.47-0.8.49 (already
        // done by buildFlagshipDescription() above), then hands the
        // connection's own `.wallet` — and NOTHING else about the
        // connection — to the REAL, unchanged BitcoinAnchorWalletSigner.
        const signer = new BitcoinAnchorWalletSigner({ wallet: connection.wallet });
        const signResult = await signer.requestSignature({ description });
        assert(signResult.signed === true, '7. the connection\'s own wallet capability satisfies BitcoinAnchorWalletSigner\'s own contract end to end');
        assert(signResult.signedInputs.length === description.inputs.length, '8. every input independently inspected as signed');

        connection.disconnect();
        assert(connection.status === BitcoinWalletConnectionState.DISCONNECTED, '9. Alice disconnects — the connection returns to DISCONNECTED');
        assert(connection.wallet === null && connection.account === null && connection.network === null, '10. every trace of the signing capability, account, and network is gone');
    }
    console.log('✓ Section A (FLAGSHIP): connect -> real end-to-end signature via BitcoinAnchorWalletSigner -> disconnect clears everything');

    // ---------------------------------------------------------------
    // Section B — REJECTED and UNAVAILABLE stay distinguishable.
    // ---------------------------------------------------------------
    {
        // A definite decline: the wallet's own popup closed with no
        // account selected.
        const declineAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ rejectAccounts: true }) });
        const declineConnection = new BitcoinWalletConnection({ provider: declineAdapter });
        const declineResult = await declineConnection.connect();
        assert(declineResult.connected === false && !declineResult.unavailable, '11. an empty account list is a definite decline, not "unavailable"');
        assert(declineConnection.status === BitcoinWalletConnectionState.DISCONNECTED, '12. a decline leaves the connection DISCONNECTED, never a persisted "rejected" state');

        // Cannot presently tell: the wallet is locked and requestAccounts() throws.
        const lockedAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ throwOnAccounts: true }) });
        const lockedConnection = new BitcoinWalletConnection({ provider: lockedAdapter });
        const lockedResult = await lockedConnection.connect();
        assert(lockedResult.connected === false && lockedResult.unavailable === true, '13. a thrown requestAccounts() is UNAVAILABLE, never treated as a decline');
        assert(lockedConnection.status === BitcoinWalletConnectionState.UNAVAILABLE, '14. the connection itself reports UNAVAILABLE');

        // No extension installed at all.
        const noExtensionAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: null });
        const noExtensionConnection = new BitcoinWalletConnection({ provider: noExtensionAdapter });
        const noExtensionResult = await noExtensionConnection.connect();
        assert(noExtensionResult.unavailable === true, '15. no installed extension at all is UNAVAILABLE, never a crash');

        // A raw provider (bypassing the adapter) that throws directly —
        // BitcoinWalletConnection's own last-resort catch, mirroring
        // anchoring/BitcoinAnchorWalletSigner.js's own identical restraint.
        const throwingConnection = new BitcoinWalletConnection({ provider: { connect: async () => { throw new Error('simulated provider crash'); } } });
        const throwingResult = await throwingConnection.connect();
        assert(throwingResult.unavailable === true, '16. a throwing provider.connect() is caught and reported as UNAVAILABLE, never a definite decline');
    }
    console.log('✓ Section B: a definite decline, a locked/unreachable wallet, a missing extension, and a throwing provider all stay distinguishable — never collapsed into one "connection failed"');

    // ---------------------------------------------------------------
    // Section C — network mismatch is reported, never resolved.
    // ---------------------------------------------------------------
    {
        const testnetAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ network: 'testnet' }) });
        const connection = new BitcoinWalletConnection({ provider: testnetAdapter });
        await connection.connect();
        assert(connection.network === 'testnet', '17. the wallet\'s own reported network is exposed unchanged');

        const view = describeBitcoinWalletConnection(connection, { expectedNetwork: 'mainnet' });
        assert(view.networkMismatch === true, '18. a testnet wallet against an expected mainnet anchor is reported as a mismatch');
        assert(view.network === 'testnet' && view.expectedNetwork === 'mainnet', '19. neither network is silently substituted for the other');

        // No automatic switching: the connection itself still holds the
        // wallet's own signing capability — this milestone reports the
        // mismatch; it never disconnects, switches, or picks a different
        // wallet on a person's behalf.
        assert(connection.wallet !== null, '20. the connection does not auto-disconnect on a mismatch — it is reported, not enforced, by this domain layer');

        connection.disconnect();
        const disconnectedView = describeBitcoinWalletConnection(connection, { expectedNetwork: 'mainnet' });
        assert(disconnectedView.networkMismatch === false, '21. a disconnected wallet never reports a mismatch — there is nothing to compare');
    }
    console.log('✓ Section C: a wallet on the wrong network is reported, honestly, never auto-switched or auto-corrected');

    // ---------------------------------------------------------------
    // Section D — a provider-contract violation throws.
    // ---------------------------------------------------------------
    {
        const malformedProvider = { connect: async () => ({ connected: true }) }; // no account, network, or wallet
        const connection = new BitcoinWalletConnection({ provider: malformedProvider });
        await expectThrowsAsync(() => connection.connect(), '22. a "connected: true" result missing account/network/wallet is a contract violation, and throws');
        assert(connection.status === BitcoinWalletConnectionState.DISCONNECTED, '23. the connection resets to DISCONNECTED rather than being left CONNECTING forever');
    }
    console.log('✓ Section D: a provider claiming success while withholding account/network/wallet is a caller-contract violation, not an operational outcome');

    // ---------------------------------------------------------------
    // Section E — the label vocabulary and describeBitcoinWalletConnection().
    // ---------------------------------------------------------------
    {
        assert(describeBitcoinWalletConnectionStateLabel(BitcoinWalletConnectionState.DISCONNECTED) === 'Disconnected', '24. DISCONNECTED label');
        assert(describeBitcoinWalletConnectionStateLabel(BitcoinWalletConnectionState.CONNECTING) === 'Connecting…', '25. CONNECTING label');
        assert(describeBitcoinWalletConnectionStateLabel(BitcoinWalletConnectionState.CONNECTED) === 'Connected', '26. CONNECTED label');
        assert(describeBitcoinWalletConnectionStateLabel(BitcoinWalletConnectionState.UNAVAILABLE) === 'Wallet unavailable', '27. UNAVAILABLE label');
        assert(describeBitcoinWalletConnectionStateLabel('not-a-real-state') === null, '28. an unrecognized state names nothing, rather than guessing');

        const adapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({}) });
        const connection = new BitcoinWalletConnection({ provider: adapter });
        await connection.connect();
        const view = describeBitcoinWalletConnection(connection, { expectedNetwork: 'mainnet' });
        assert(Object.keys(view).sort().join(',') === ['account', 'expectedNetwork', 'network', 'networkMismatch', 'state', 'stateLabel'].sort().join(','),
            '29. describeBitcoinWalletConnection() carries exactly this fixed field set — no more, no less');
        assert(Object.isFrozen(view), '30. the projected result is frozen');
        for (const forbidden of ['valid', 'trusted', 'authorized', 'verified', 'confidence', 'score']) {
            assert(!(forbidden in view), `31. describeBitcoinWalletConnection() never carries a "${forbidden}" field — CONNECTED is never promoted to a trust judgment`);
        }
    }
    console.log('✓ Section E: the label vocabulary names all four states honestly, and describeBitcoinWalletConnection() adds no field beyond its own fixed, documented set');

    // ---------------------------------------------------------------
    // Section F — the concrete adapter's own translation of a
    // UniSat-shaped provider.
    // ---------------------------------------------------------------
    {
        // An unrecognized network name is unavailable, never guessed at.
        const weirdNetworkAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ network: 'signet' }) });
        const weirdResult = await weirdNetworkAdapter.connect();
        assert(weirdResult.connected === false && weirdResult.unavailable === true, '32. an unrecognized network name from the wallet is reported as unavailable');

        // An incomplete provider (extension present, but missing a
        // required method) is unavailable, not a throw.
        const incompleteAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: { requestAccounts: async () => ['bc1qsomething'] } });
        const incompleteResult = await incompleteAdapter.connect();
        assert(incompleteResult.connected === false && incompleteResult.unavailable === true, '33. a provider missing getNetwork/signPsbt is unavailable, not a crash');

        // A definite signPsbt() rejection is a decline, never "unavailable" —
        // mirrors anchoring/BitcoinAnchorWalletSigner.js's own identical
        // restraint one layer up.
        const rejectSignAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({ rejectSign: true }) });
        const rejectSignConnect = await rejectSignAdapter.connect();
        const signOutcome = await rejectSignConnect.wallet.signPsbt({ hex: 'deadbeef' });
        assert(signOutcome.signed === false && !signOutcome.unavailable, '34. a wallet declining to sign a specific PSBT is a definite decline, not "unavailable"');

        // The wallet capability accepts a serializer result ({ hex }), a
        // bare hex string, or raw bytes alike — the identical trio every
        // PSBT-accepting method in anchoring/ already accepts.
        const passthroughAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider: fakeUnisatProvider({}) });
        const passthroughConnect = await passthroughAdapter.connect();
        const viaHexObject = await passthroughConnect.wallet.signPsbt({ hex: 'aabb' });
        const viaBareHexString = await passthroughConnect.wallet.signPsbt('aabb');
        const viaBytes = await passthroughConnect.wallet.signPsbt(Uint8Array.from([0xaa, 0xbb]));
        assert(viaHexObject.signed && viaBareHexString.signed && viaBytes.signed, '35. { hex }, a bare hex string, and raw bytes are all accepted as unsignedPsbt');
    }
    console.log('✓ Section F: BitcoinInjectedProviderWalletAdapter faithfully translates a real, documented wallet API — never guessing at an unrecognized network, and never confusing a signing decline with unavailability');

    console.log('\nAll BitcoinWalletConnectionUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinWalletConnectionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
