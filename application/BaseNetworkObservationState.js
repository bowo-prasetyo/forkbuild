// 0.8.90 — Explicit Base Network & Account Observation.
//
// The vocabulary base/BaseNetworkObserver.js reports its own account
// observation through — the identical "name the difference structurally,
// not by convention" discipline application/BitcoinAnchorConfirmationState.js
// (0.8.54) and application/BitcoinAnchorFundingObservationState.js (0.8.60)
// already hold, one chain over.
//
//   OBSERVED       — the RPC source was reached, reported a chain id this
//                    codebase recognizes as a real Base network, and
//                    reported a native balance for the requested address.
//   CHAIN_MISMATCH — the RPC source was reached and answered, but the
//                    chain id it reported is NOT one of the known Base
//                    chain ids (application/BaseChainId.js). This is a
//                    REAL, positive fact — the connection genuinely
//                    answered, it simply is not Base — never conflated
//                    with UNAVAILABLE below. See this file's own
//                    "NEVER LABELED BASE ON A MISMATCH" note.
//   UNAVAILABLE    — this observation cannot presently tell what the
//                    network reports: the RPC source could not be reached,
//                    timed out, or returned a malformed/incomplete
//                    response. Retrying later may reach a different, more
//                    informative answer.
//
// NEVER LABELED BASE ON A MISMATCH. A CHAIN_MISMATCH observation still
// carries the chain id actually observed (application/
// BaseAccountObservation.js's own `chainId` field), but its `network` is
// always `null` — this codebase never reports `network: 'mainnet'` (or any
// other Base network label) for a chain id that is not actually one of
// Base's own. EVM compatibility is not Base membership; see docs/
// Principles.md, "Blockchain Identity Is Explicit; A Shared Reference Is
// Never Evidence Of A Shared Publication (0.8.89)," held here one layer
// earlier — before any publication identity is ever minted, the network
// fact it would be minted from is already never inferred from resemblance.
//
// NEVER A FOURTH VALUE FOR "DEFINITELY NOT BASE, PERMANENTLY." A wallet
// connected to the wrong chain today may be switched to Base a moment
// later — CHAIN_MISMATCH is a fact about THIS observation, never a
// permanent verdict about the account or the connection.
//
// NEVER A SCORE, A TRUST LEVEL, OR A "SAFE TO PUBLISH" JUDGMENT. This
// vocabulary reports what the network currently says, nothing more — no
// capability to construct, sign, or broadcast a transaction is implied by
// OBSERVED. See docs/Roadmap.md, "0.8.90 — Explicit Base Network & Account
// Observation."
export const BaseNetworkObservationState = Object.freeze({
    OBSERVED: 'observed',
    CHAIN_MISMATCH: 'chain-mismatch',
    UNAVAILABLE: 'unavailable'
});

export function isValidBaseNetworkObservationState(value) {
    return Object.values(BaseNetworkObservationState).includes(value);
}
