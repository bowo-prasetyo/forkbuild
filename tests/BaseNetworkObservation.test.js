import { BaseChainId, baseNetworkForBaseChainId } from '../application/BaseChainId.js';
import { BaseNetworkObservationState, isValidBaseNetworkObservationState } from '../application/BaseNetworkObservationState.js';
import { BaseAccountObservation } from '../application/BaseAccountObservation.js';
import { describeBaseAccountObservationStateLabel, describeBaseAccountObservation } from '../application/BaseAccountObservationView.js';
import { BaseWalletConnectionState } from '../application/BaseWalletConnectionState.js';
import { describeBaseWalletConnectionStateLabel, describeBaseWalletConnection } from '../application/BaseWalletConnectionView.js';
import { BaseWalletConnection } from '../base/BaseWalletConnection.js';
import { BaseInjectedProviderWalletAdapter } from '../base/BaseInjectedProviderWalletAdapter.js';
import { BaseJsonRpcClient } from '../base/BaseJsonRpcClient.js';
import { BaseNetworkObserver } from '../base/BaseNetworkObserver.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';

// 0.8.90 — Explicit Base Network & Account Observation.
//
// The first real Base capability this codebase ships — read-only network
// and account observation, deliberately stopping short of constructing,
// signing, estimating gas for, or broadcasting anything. See docs/
// Roadmap.md, "0.8.90 — Explicit Base Network & Account Observation."
//
//   Section A: BaseChainId / BaseNetworkObservationState — closed
//              vocabularies, no inference
//   Section B: BaseAccountObservation — construction, validation,
//              immutability, JSON round trip
//   Section C: BaseJsonRpcClient — real HTTP wire behavior against a fake
//              fetchImpl; never throws, decodes wei as a decimal string
//   Section D: BaseNetworkObserver — OBSERVED / CHAIN_MISMATCH /
//              UNAVAILABLE, and the chain check always gating the balance
//              read
//   Section E: BaseWalletConnection / BaseInjectedProviderWalletAdapter —
//              connect/disconnect, decline vs unavailable, and NO signing
//              capability exposed anywhere
//   Section F: the label vocabularies and describe*() views
//   Section G: FLAGSHIP — a full, explicit Base observation, end to end,
//              never touching a real Bitcoin wallet capability sitting
//              right beside it, and 0.8.89's own blockchain-identity
//              invariant unweakened by this milestone's own real
//              implementation existing
//   Section H: a connected network reporting a non-Base chain id is never
//              labeled BASE, and the actual chain id is never discarded

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

const ALICE_ADDRESS = '0x' + 'a1'.repeat(20);
const MAINNET_CHAIN_ID_HEX = '0x2105'; // 8453, decimal, Base mainnet
const ETHEREUM_MAINNET_CHAIN_ID_HEX = '0x1'; // 1, decimal — a real EVM chain, deliberately not Base
const ONE_ETH_HEX = '0xde0b6b3a7640000'; // 1000000000000000000 wei

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body };
}

// A fake Base JSON-RPC endpoint, shaped exactly like the real
// `https://mainnet.base.org` this codebase's own base/BaseJsonRpcClient.js
// speaks to — never a real network call. `throwFor`/`errorFor` simulate an
// unreachable host and a JSON-RPC error object respectively.
function fakeBaseRpcFetch({ chainIdHex = MAINNET_CHAIN_ID_HEX, balanceHex = ONE_ETH_HEX, throwFor = null, errorFor = null, malformedMethod = null, statusFor = null } = {}) {
    return async (_url, options) => {
        const body = JSON.parse(options.body);
        if (throwFor === body.method) throw new Error('simulated: network unreachable');
        if (statusFor === body.method) return { ok: false, status: 503 };
        if (errorFor === body.method) return jsonResponse({ jsonrpc: '2.0', id: 1, error: { message: 'simulated RPC error' } });
        if (malformedMethod === body.method) return jsonResponse({ jsonrpc: '2.0', id: 1, result: 'not-a-hex-quantity' });
        if (body.method === 'eth_chainId') return jsonResponse({ jsonrpc: '2.0', id: 1, result: chainIdHex });
        if (body.method === 'eth_getBalance') return jsonResponse({ jsonrpc: '2.0', id: 1, result: balanceHex });
        throw new Error(`test helper does not stub method ${body.method}`);
    };
}

// A fake window.ethereum-shaped EIP-1193 provider — the ONE concrete shape
// base/BaseInjectedProviderWalletAdapter.js adapts.
function fakeEip1193Provider({ account = ALICE_ADDRESS, rejectAccounts = false, throwOnRequest = false } = {}) {
    return {
        async request({ method }) {
            if (method !== 'eth_requestAccounts') throw new Error(`test helper does not stub method ${method}`);
            if (throwOnRequest) throw new Error('simulated: wallet locked');
            if (rejectAccounts) return [];
            return [account];
        }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — BaseChainId / BaseNetworkObservationState.
    // ---------------------------------------------------------------
    {
        assert(BaseChainId.MAINNET === 8453, '1. Base mainnet chain id is 8453');
        assert(BaseChainId.TESTNET === 84532, '2. Base Sepolia chain id is 84532');
        assert(Object.isFrozen(BaseChainId), '3. BaseChainId is frozen');
        assert(baseNetworkForBaseChainId(8453) === 'mainnet', '4. 8453 maps to mainnet');
        assert(baseNetworkForBaseChainId(84532) === 'testnet', '5. 84532 maps to testnet');
        assert(baseNetworkForBaseChainId(1) === null, '6. Ethereum mainnet (1) is never mapped to a Base network');
        assert(baseNetworkForBaseChainId(10) === null, '7. Optimism (10) is never mapped to a Base network');
        assert(baseNetworkForBaseChainId(null) === null, '8. a null chain id maps to null, never a guess');

        assert(isValidBaseNetworkObservationState(BaseNetworkObservationState.OBSERVED), '9. OBSERVED is known');
        assert(isValidBaseNetworkObservationState(BaseNetworkObservationState.CHAIN_MISMATCH), '10. CHAIN_MISMATCH is known');
        assert(isValidBaseNetworkObservationState(BaseNetworkObservationState.UNAVAILABLE), '11. UNAVAILABLE is known');
        assert(!isValidBaseNetworkObservationState('confirmed'), '12. an unlisted state is never silently accepted');
        assert(Object.isFrozen(BaseNetworkObservationState), '13. BaseNetworkObservationState is frozen');
    }
    console.log('✓ Section A: BaseChainId / BaseNetworkObservationState — closed vocabularies, no inference');

    // ---------------------------------------------------------------
    // Section B — BaseAccountObservation: construction, validation,
    // immutability, JSON round trip.
    // ---------------------------------------------------------------
    {
        const observedAt = new Date('2026-08-28T00:00:00.000Z');
        const observed = new BaseAccountObservation({
            state: BaseNetworkObservationState.OBSERVED,
            address: ALICE_ADDRESS, network: 'mainnet', chainId: 8453, nativeBalanceWei: '1000000000000000000',
            observedAt
        });
        assert(observed.state === BaseNetworkObservationState.OBSERVED, '14. state is exposed unchanged');
        assert(observed.address === ALICE_ADDRESS, '15. address is exposed unchanged');
        assert(observed.network === 'mainnet', '16. network is exposed unchanged');
        assert(observed.chainId === 8453, '17. chainId is exposed unchanged');
        assert(observed.nativeBalanceWei === '1000000000000000000', '18. nativeBalanceWei is exposed unchanged, as a string');
        assert(typeof observed.nativeBalanceWei === 'string', '19. nativeBalanceWei is never coerced into a Number');
        assert(observed.reason === null, '20. an OBSERVED observation carries no reason');
        assert(Object.isFrozen(observed), '21. an observation is frozen');

        expectThrows(() => new BaseAccountObservation({ state: 'not-a-state', address: ALICE_ADDRESS, observedAt }), '22. an unknown state throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.OBSERVED, address: 'not-an-address', network: 'mainnet', chainId: 8453, nativeBalanceWei: '1', observedAt }), '23. a malformed address throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.OBSERVED, address: ALICE_ADDRESS, network: 'not-a-network', chainId: 8453, nativeBalanceWei: '1', observedAt }), '24. OBSERVED with an invalid network throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.OBSERVED, address: ALICE_ADDRESS, network: 'mainnet', chainId: 8453, nativeBalanceWei: 1000, observedAt }), '25. OBSERVED with a Number balance (not a string) throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.UNAVAILABLE, address: ALICE_ADDRESS, reason: 'rpc down', chainId: 8453, observedAt }), '26. UNAVAILABLE carrying a chainId throws — the source was never reached far enough to report one');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.CHAIN_MISMATCH, address: ALICE_ADDRESS, reason: 'wrong chain', observedAt }), '27. CHAIN_MISMATCH without the observed chainId throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.UNAVAILABLE, address: ALICE_ADDRESS, observedAt }), '28. a non-OBSERVED state without a reason throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.OBSERVED, address: ALICE_ADDRESS, network: 'mainnet', chainId: 8453, nativeBalanceWei: '1', reason: 'should not be here', observedAt }), '29. OBSERVED carrying a reason throws');
        expectThrows(() => new BaseAccountObservation({ state: BaseNetworkObservationState.OBSERVED, address: ALICE_ADDRESS, network: 'mainnet', chainId: 8453, nativeBalanceWei: '1', observedAt: 'not-a-date' }), '30. an invalid observedAt throws');

        const json = observed.toJSON();
        assert(json.observedAt === observedAt.toISOString(), '31. toJSON() renders observedAt as an ISO string');
        const restored = BaseAccountObservation.fromJSON(json);
        assert(restored.address === observed.address && restored.nativeBalanceWei === observed.nativeBalanceWei, '32. fromJSON()/toJSON() round-trips faithfully');
        assert(BaseAccountObservation.fromJSON(null) === null, '33. fromJSON(null) returns null rather than throwing');

        const mismatch = new BaseAccountObservation({
            state: BaseNetworkObservationState.CHAIN_MISMATCH, address: ALICE_ADDRESS, chainId: 1,
            reason: 'connected network reports chain id 1, which is not a known Base network', observedAt
        });
        assert(mismatch.network === null, '34. CHAIN_MISMATCH never names a network');
        assert(mismatch.chainId === 1, '35. CHAIN_MISMATCH still carries the chain id actually observed, never discarding it');
        assert(mismatch.nativeBalanceWei === null, '36. CHAIN_MISMATCH never carries a balance');
    }
    console.log('✓ Section B: BaseAccountObservation — construction, validation, immutability, JSON round trip');

    // ---------------------------------------------------------------
    // Section C — BaseJsonRpcClient: real wire behavior, fake transport.
    // ---------------------------------------------------------------
    {
        const client = new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch() });
        const chain = await client.fetchChainId();
        assert(chain.available === true && chain.chainId === 8453, '37. fetchChainId() decodes 0x2105 as 8453');

        const balance = await client.fetchBalance(ALICE_ADDRESS);
        assert(balance.available === true && balance.balanceWei === '1000000000000000000', '38. fetchBalance() decodes 1 ETH as a decimal-digit string, never a Number');

        const unreachable = new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch({ throwFor: 'eth_chainId' }) });
        const unreachableResult = await unreachable.fetchChainId();
        assert(unreachableResult.available === false && typeof unreachableResult.reason === 'string', '39. a throwing transport is reported as unavailable, never thrown onward');

        const badStatus = new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch({ statusFor: 'eth_chainId' }) });
        assert((await badStatus.fetchChainId()).available === false, '40. a non-2xx HTTP status is reported as unavailable');

        const rpcError = new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch({ errorFor: 'eth_getBalance' }) });
        assert((await rpcError.fetchBalance(ALICE_ADDRESS)).available === false, '41. a JSON-RPC error object is reported as unavailable, never surfaced as a result');

        const malformed = new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch({ malformedMethod: 'eth_chainId' }) });
        assert((await malformed.fetchChainId()).available === false, '42. a non-hex-quantity result is reported as unavailable, never coerced');

        expectThrows(() => new BaseJsonRpcClient({ rpcUrl: '', fetchImpl: fakeBaseRpcFetch() }), '43. an empty rpcUrl throws at construction');
    }
    console.log('✓ Section C: BaseJsonRpcClient — real wire behavior against a fake transport; never throws for an operational failure');

    // ---------------------------------------------------------------
    // Section D — BaseNetworkObserver: OBSERVED / CHAIN_MISMATCH /
    // UNAVAILABLE, and the chain check gating the balance read.
    // ---------------------------------------------------------------
    {
        const observer = new BaseNetworkObserver({ rpcSource: new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch() }) });
        const observed = await observer.observeAccount({ address: ALICE_ADDRESS });
        assert(observed.state === BaseNetworkObservationState.OBSERVED, '44. a real Base chain id and a real balance together produce OBSERVED');
        assert(observed.network === 'mainnet' && observed.chainId === 8453, '45. network and chainId are both carried through');
        assert(observed.nativeBalanceWei === '1000000000000000000', '46. the observed balance is carried through, as a string');

        let balanceFetchCalls = 0;
        const countingRpc = {
            async fetchChainId() { return { available: true, chainId: 1 }; }, // Ethereum mainnet, not Base
            async fetchBalance(address) { balanceFetchCalls += 1; return { available: true, balanceWei: '1' }; }
        };
        const mismatchObserver = new BaseNetworkObserver({ rpcSource: countingRpc });
        const mismatch = await mismatchObserver.observeAccount({ address: ALICE_ADDRESS });
        assert(mismatch.state === BaseNetworkObservationState.CHAIN_MISMATCH, '47. a non-Base chain id produces CHAIN_MISMATCH');
        assert(mismatch.network === null, '48. CHAIN_MISMATCH never names a network');
        assert(mismatch.chainId === 1, '49. CHAIN_MISMATCH still names the chain id actually observed');
        assert(balanceFetchCalls === 0, '50. the balance is NEVER fetched once the chain check fails — the chain check always gates the balance read');

        const unavailableObserver = new BaseNetworkObserver({
            rpcSource: { async fetchChainId() { throw new Error('simulated: rpc unreachable'); }, async fetchBalance() { return { available: true, balanceWei: '1' }; } }
        });
        const unavailable = await unavailableObserver.observeAccount({ address: ALICE_ADDRESS });
        assert(unavailable.state === BaseNetworkObservationState.UNAVAILABLE, '51. a throwing chain fetch is reported as UNAVAILABLE');
        assert(unavailable.chainId === null && unavailable.network === null && unavailable.nativeBalanceWei === null, '52. an UNAVAILABLE observation carries no chain id, network, or balance');

        const balanceUnavailableObserver = new BaseNetworkObserver({
            rpcSource: { async fetchChainId() { return { available: true, chainId: 8453 }; }, async fetchBalance() { return { available: false, reason: 'simulated: could not read balance' }; } }
        });
        const balanceUnavailable = await balanceUnavailableObserver.observeAccount({ address: ALICE_ADDRESS });
        assert(balanceUnavailable.state === BaseNetworkObservationState.UNAVAILABLE, '53. a real Base chain id with an unreadable balance is still UNAVAILABLE, never a partial OBSERVED');

        await expectThrowsAsync(() => observer.observeAccount({ address: 'not-an-address' }), '54. a malformed address is a caller-contract violation, and throws');
        await expectThrowsAsync(() => observer.observeAccount({}), '55. a missing address throws');
        expectThrows(() => new BaseNetworkObserver({}), '56. a missing rpcSource throws at construction');

        // Every observation is a fresh read — calling twice never reuses or
        // caches the first result.
        let chainCalls = 0;
        const freshnessRpc = {
            async fetchChainId() { chainCalls += 1; return { available: true, chainId: 8453 }; },
            async fetchBalance() { return { available: true, balanceWei: String(chainCalls) }; }
        };
        const freshnessObserver = new BaseNetworkObserver({ rpcSource: freshnessRpc });
        const first = await freshnessObserver.observeAccount({ address: ALICE_ADDRESS });
        const second = await freshnessObserver.observeAccount({ address: ALICE_ADDRESS });
        assert(chainCalls === 2 && first.nativeBalanceWei !== second.nativeBalanceWei, '57. observeAccount() never caches or remembers a previous observation — every call is a fresh read');
    }
    console.log('✓ Section D: BaseNetworkObserver — OBSERVED / CHAIN_MISMATCH / UNAVAILABLE, with the chain check always gating the balance read, and every call a fresh read');

    // ---------------------------------------------------------------
    // Section E — BaseWalletConnection / BaseInjectedProviderWalletAdapter:
    // connect/disconnect, decline vs unavailable, NO signing capability.
    // ---------------------------------------------------------------
    {
        const adapter = new BaseInjectedProviderWalletAdapter({ injectedProvider: fakeEip1193Provider({ account: ALICE_ADDRESS }) });
        const connection = new BaseWalletConnection({ provider: adapter });
        assert(connection.status === BaseWalletConnectionState.DISCONNECTED, '58. a fresh connection starts DISCONNECTED');
        assert(connection.account === null, '59. no account before connecting');
        assert(!('wallet' in connection), '60. BaseWalletConnection exposes NO wallet/signing capability at all — not even as null');

        const result = await connection.connect();
        assert(result.connected === true && result.account === ALICE_ADDRESS, '61. an explicit connect() reports the account');
        assert(connection.status === BaseWalletConnectionState.CONNECTED, '62. the connection reports CONNECTED');
        assert(!('wallet' in connection) && typeof connection.signTransaction === 'undefined', '63. even once CONNECTED, no signing method of any kind is exposed');

        connection.disconnect();
        assert(connection.status === BaseWalletConnectionState.DISCONNECTED && connection.account === null, '64. disconnect() clears every trace of the account');

        const declineAdapter = new BaseInjectedProviderWalletAdapter({ injectedProvider: fakeEip1193Provider({ rejectAccounts: true }) });
        const declineConnection = new BaseWalletConnection({ provider: declineAdapter });
        const declineResult = await declineConnection.connect();
        assert(declineResult.connected === false && !declineResult.unavailable, '65. an empty account array is a definite decline, not "unavailable"');

        const lockedAdapter = new BaseInjectedProviderWalletAdapter({ injectedProvider: fakeEip1193Provider({ throwOnRequest: true }) });
        const lockedConnection = new BaseWalletConnection({ provider: lockedAdapter });
        const lockedResult = await lockedConnection.connect();
        assert(lockedResult.connected === false && lockedResult.unavailable === true, '66. a thrown eth_requestAccounts is UNAVAILABLE, never a decline');

        const noExtensionAdapter = new BaseInjectedProviderWalletAdapter({ injectedProvider: null });
        const noExtensionResult = await new BaseWalletConnection({ provider: noExtensionAdapter }).connect();
        assert(noExtensionResult.unavailable === true, '67. no installed extension at all is UNAVAILABLE, never a crash');

        const malformedProvider = { connect: async () => ({ connected: true }) }; // no account
        await expectThrowsAsync(() => new BaseWalletConnection({ provider: malformedProvider }).connect(), '68. a "connected: true" result missing an account is a contract violation, and throws');

        expectThrows(() => new BaseWalletConnection({}), '69. a missing provider throws at construction');
    }
    console.log('✓ Section E: BaseWalletConnection / BaseInjectedProviderWalletAdapter — a definite decline and an unavailable wallet stay distinguishable, and no signing capability is ever exposed');

    // ---------------------------------------------------------------
    // Section F — label vocabularies and describe*() views.
    // ---------------------------------------------------------------
    {
        assert(describeBaseAccountObservationStateLabel(BaseNetworkObservationState.OBSERVED) === 'Base account observed', '70. OBSERVED label');
        assert(describeBaseAccountObservationStateLabel(BaseNetworkObservationState.CHAIN_MISMATCH) === 'Connected network is not Base', '71. CHAIN_MISMATCH label');
        assert(describeBaseAccountObservationStateLabel(BaseNetworkObservationState.UNAVAILABLE) === 'Base account unavailable', '72. UNAVAILABLE label');
        assert(describeBaseAccountObservationStateLabel('not-a-real-state') === null, '73. an unrecognized state names nothing');

        const observation = new BaseAccountObservation({
            state: BaseNetworkObservationState.OBSERVED, address: ALICE_ADDRESS, network: 'mainnet', chainId: 8453,
            nativeBalanceWei: '1', observedAt: new Date()
        });
        const view = describeBaseAccountObservation(observation);
        assert(Object.isFrozen(view), '74. the projected observation view is frozen');
        assert(Object.keys(view).sort().join(',') === ['address', 'chainId', 'nativeBalanceWei', 'network', 'observedAt', 'reason', 'state', 'stateLabel'].sort().join(','),
            '75. describeBaseAccountObservation() carries exactly this fixed field set');
        for (const forbidden of ['valid', 'trusted', 'authorized', 'verified', 'confidence', 'score', 'safe']) {
            assert(!(forbidden in view), `76. describeBaseAccountObservation() never carries a "${forbidden}" field`);
        }
        assert(describeBaseAccountObservation(null).state === null, '77. describeBaseAccountObservation(null) degrades gracefully rather than throwing');

        assert(describeBaseWalletConnectionStateLabel(BaseWalletConnectionState.CONNECTED) === 'Connected', '78. CONNECTED label');
        assert(describeBaseWalletConnectionStateLabel(BaseWalletConnectionState.UNAVAILABLE) === 'Wallet unavailable', '79. UNAVAILABLE label');

        const connectionAdapter = new BaseInjectedProviderWalletAdapter({ injectedProvider: fakeEip1193Provider({ account: ALICE_ADDRESS }) });
        const connection = new BaseWalletConnection({ provider: connectionAdapter });
        await connection.connect();
        const connectionView = describeBaseWalletConnection(connection);
        assert(Object.keys(connectionView).sort().join(',') === ['address', 'state', 'stateLabel'].sort().join(','), '80. describeBaseWalletConnection() carries exactly this fixed field set — no networkMismatch field, unlike its Bitcoin counterpart');
        assert(connectionView.address === ALICE_ADDRESS, '81. the connected address is projected through');
    }
    console.log('✓ Section F: the label vocabularies name every state honestly, and both describe*() views carry exactly their documented, fixed field set');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: a full, explicit Base observation, end to
    // end, never touching a real Bitcoin wallet capability sitting right
    // beside it; and 0.8.89's own blockchain-identity invariant
    // unweakened by this milestone's real implementation now existing.
    // ---------------------------------------------------------------
    {
        // A REAL Bitcoin wallet connection, wired to a provider that
        // throws loudly and distinctively if it is EVER asked to connect
        // — standing in for "a person also has a Bitcoin wallet extension
        // installed," exactly as 0.8.90's own proposal names as the
        // isolation this flagship must prove.
        let bitcoinProviderTouched = false;
        const poisonedBitcoinProvider = {
            async connect() { bitcoinProviderTouched = true; throw new Error('Base observation must NEVER touch a Bitcoin wallet capability'); }
        };
        const bitcoinWalletConnection = new BitcoinWalletConnection({ provider: poisonedBitcoinProvider });
        assert(bitcoinWalletConnection.status !== undefined, '82. a real, independent Bitcoin wallet connection exists alongside the Base one below');

        // Alice explicitly connects a Base-capable wallet.
        const baseAdapter = new BaseInjectedProviderWalletAdapter({ injectedProvider: fakeEip1193Provider({ account: ALICE_ADDRESS }) });
        const baseWalletConnection = new BaseWalletConnection({ provider: baseAdapter });
        const connectResult = await baseWalletConnection.connect();
        assert(connectResult.connected === true, '83. Alice explicitly connects a Base wallet');

        // She explicitly observes her Base account — a real
        // BaseNetworkObserver over a real BaseJsonRpcClient, against a
        // fake transport standing in for the real network.
        const baseNetworkObserver = new BaseNetworkObserver({ rpcSource: new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch() }) });
        const observation = await baseNetworkObserver.observeAccount({ address: baseWalletConnection.account });
        assert(observation.state === BaseNetworkObservationState.OBSERVED, '84. the explicit observation succeeds');
        assert(observation.network === 'mainnet' && observation.nativeBalanceWei === '1000000000000000000', '85. the observation carries real network and balance facts');

        assert(bitcoinProviderTouched === false, '86. FLAGSHIP: observing a Base account never touches the Bitcoin wallet connection sitting right beside it — no Bitcoin connect(), no Bitcoin transaction construction, no signing, no broadcast');
        assert(bitcoinWalletConnection.status === 'disconnected', '87. the untouched Bitcoin connection remains exactly as it started');

        // The observation itself carries nothing that could be mistaken
        // for Bitcoin evidence, a PSBT, a UTXO, or a signature.
        const observationJson = observation.toJSON();
        for (const bitcoinField of ['psbt', 'utxo', 'utxos', 'txid', 'scriptPubKey', 'signature']) {
            assert(!(bitcoinField in observationJson), `88. a Base account observation never carries a "${bitcoinField}" field`);
        }

        // 0.8.89's own invariant, unweakened by this milestone's real Base
        // implementation now existing: a Bitcoin publication identity and
        // a (still not built) Base publication identity sharing both the
        // same contentHash AND the same chainReference string remain two
        // entirely separate publications. Nothing built in this milestone
        // — not BaseNetworkObserver, not BaseWalletConnection — produces a
        // BlockchainPublicationIdentity at all (there is still no Base
        // publication), so this reuses exactly 0.8.89's own simulated
        // Base side, now sitting beside a REAL Base capability rather than
        // a purely hypothetical one.
        const sharedContentHash = 'a'.repeat(64);
        const sharedReference = 'b'.repeat(64);
        const bitcoinRecord = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-base-isolation', contentHash: sharedContentHash, txid: sharedReference, network: 'mainnet', createdAt: new Date()
        });
        const bitcoinIdentity = bitcoinRecord.toBlockchainPublicationIdentity();
        const simulatedBaseIdentity = new BlockchainPublicationIdentity({
            blockchain: BlockchainKind.BASE, contentHash: sharedContentHash, chainReference: sharedReference, createdAt: new Date()
        });
        assert(!bitcoinIdentity.sameAs(simulatedBaseIdentity) && !simulatedBaseIdentity.sameAs(bitcoinIdentity),
            '89. FLAGSHIP: a real Base observation capability now existing does not weaken 0.8.89\'s own invariant — a same-contentHash, same-chainReference Bitcoin and Base publication are still never the same publication');
    }
    console.log('✓ Section G (FLAGSHIP): a full, explicit Base wallet connect + account observation never touches a real Bitcoin wallet capability, and 0.8.89\'s blockchain-identity invariant holds unweakened');

    // ---------------------------------------------------------------
    // Section H — a non-Base chain is never labeled BASE, and its real
    // chain id is never silently discarded.
    // ---------------------------------------------------------------
    {
        const ethereumMainnetRpc = new BaseJsonRpcClient({ fetchImpl: fakeBaseRpcFetch({ chainIdHex: ETHEREUM_MAINNET_CHAIN_ID_HEX }) });
        const observer = new BaseNetworkObserver({ rpcSource: ethereumMainnetRpc });
        const observation = await observer.observeAccount({ address: ALICE_ADDRESS });
        assert(observation.state === BaseNetworkObservationState.CHAIN_MISMATCH, '90. Ethereum mainnet (a real, reachable, EVM-compatible chain) is never mistaken for Base');
        assert(observation.network === null, '91. no network label of any kind is assigned to the mismatch');
        assert(observation.chainId === 1, '92. the actually-observed chain id (1) is preserved, never discarded or replaced with a Base default');
        assert(typeof observation.reason === 'string' && observation.reason.includes('1'), '93. the mismatch reason names the actual chain id observed, for a person to act on');

        const view = describeBaseAccountObservation(observation);
        assert(view.stateLabel === 'Connected network is not Base', '94. the UI-facing label for a mismatch is an honest sentence, never "Base account observed"');
    }
    console.log('✓ Section H: a real, reachable, non-Base EVM chain is reported as a mismatch, never inferred to be Base by resemblance');

    console.log('\nAll BaseNetworkObservation tests passed.');
}

run().catch((error) => {
    console.error('BaseNetworkObservation.test.js FAILED:', error);
    process.exitCode = 1;
});
