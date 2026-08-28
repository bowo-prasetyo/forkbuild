// 0.8.90 — Explicit Base Network & Account Observation.
//
// The closed vocabulary of chain ids this codebase recognizes as genuinely
// Base — the identical "closed set, never inferred" discipline application/
// BlockchainKind.js (0.8.89) already holds for the blockchain identifier
// itself, one field narrower: which EVM chain id actually IS Base, on each
// of the two networks Base itself publishes as real (base.org/network-
// information — mainnet and the Sepolia testnet).
//
//   MAINNET — 8453, Base's own production network.
//   TESTNET — 84532, Base Sepolia, Base's own public test network.
//
// A CHAIN ID NOT LISTED HERE IS NEVER BASE, NO MATTER HOW EVM-COMPATIBLE
// IT LOOKS. Ethereum mainnet (1), Optimism (10), and every other EVM chain
// share Base's own transaction/account model closely enough that a naive
// "it answered eth_chainId, so treat it as Base" check would happily
// mislabel any of them. This file exists so that check is never naive:
// base/BaseNetworkObserver.js maps an observed chain id through
// `baseNetworkForBaseChainId()` below and ONLY ever reports
// `network: 'mainnet'`/`'testnet'` when the map recognizes it — anything
// else is `BaseNetworkObservationState.CHAIN_MISMATCH`
// (application/BaseNetworkObservationState.js), never a guess.
//
// NEVER GROWN BY INFERENCE. A new entry here is added only when this
// codebase deliberately decides to recognize a new Base network (Base
// itself renaming or adding one) — never derived from a chain id a caller
// happens to pass, and never guessed from an RPC URL's own hostname. See
// docs/Principles.md, "Correlate Evidence By Explicit Identity, Never By
// Resemblance (0.8.78)."
export const BaseChainId = Object.freeze({
    MAINNET: 8453,
    TESTNET: 84532
});

const NETWORK_BY_CHAIN_ID = Object.freeze({
    [BaseChainId.MAINNET]: 'mainnet',
    [BaseChainId.TESTNET]: 'testnet'
});

// `null` for any chain id that is not one of Base's own — never a guess,
// never a default. See this file's own header.
export function baseNetworkForBaseChainId(chainId) {
    return NETWORK_BY_CHAIN_ID[chainId] || null;
}
