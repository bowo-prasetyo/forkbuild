// 0.8.89 — Multi-Blockchain Publication Domain Boundary.
//
// The smallest possible vocabulary for "which blockchain does this
// publication identity belong to" — a closed set of string constants,
// deliberately never an open-ended free-text field. Every publication
// identity this codebase produces, on any chain, names exactly one of
// these — see application/BlockchainPublicationIdentity.js's own header
// for why that single field is the one thing that keeps two publications
// on two different chains from ever being mistaken for the same fact.
//
//   BITCOIN — the one blockchain this codebase actually publishes to and
//             observes today, from anchoring/BitcoinAnchorPublisher.js
//             through application/BitcoinAnchorPublicationRecord.js
//             (0.8.80) and everything built on top of it since.
//   BASE    — RESERVED. Named here so a future Base implementation has a
//             fixed, stable identifier to construct its own publication
//             identities against from day one — never a signal that a
//             Base publisher, signer, broadcaster, or confirmation
//             observer exists yet. None of that ships in 0.8.89. See
//             docs/Roadmap.md, 0.8.89, "Deliberately excluded," for the
//             complete list of what naming this constant does NOT do.
//
// THIS IS NOT A RANKING, AND NEVER GROWS BY INFERENCE. No value here is
// more "real," more trusted, or more capable than another — BASE sitting
// unimplemented next to BITCOIN says nothing about which is preferred.
// A new value is added here only when this codebase deliberately decides
// to represent a new chain's publications — never derived from a string
// a caller happens to pass, and never guessed from a locator, a network
// name, or any other resemblance. See docs/Principles.md, "Correlate
// Evidence By Explicit Identity, Never By Resemblance (0.8.78)," held
// here one layer up: the chain a publication belongs to is itself an
// explicit fact, never an inference.
export const BlockchainKind = Object.freeze({
    BITCOIN: 'bitcoin',
    BASE: 'base'
});

export function isValidBlockchainKind(value) {
    return Object.values(BlockchainKind).includes(value);
}
