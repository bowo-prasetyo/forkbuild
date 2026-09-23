// Splits a multi-line text field into one trimmed entry per non-empty line,
// order preserved — the "one URL per line" reading every Network Settings
// textarea (Arweave/IPFS gateways, Nostr relays, STUN, TURN, Rendezvous)
// shares. Interpretation stops here: whether each entry is a valid URL,
// or whether an empty list is acceptable, stays with the value object the
// caller's own use case constructs.
export function splitNonEmptyLines(text) {
    return String(text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
