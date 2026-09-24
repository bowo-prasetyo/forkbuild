// Trims relay URLs and drops non-strings, empty entries and repeats,
// keeping the order each distinct URL first appears in.
export function normalizeRelayUrls(relayUrls) {
    const seen = new Set();
    const normalized = [];
    for (const relayUrl of relayUrls) {
        if (typeof relayUrl !== 'string') continue;
        const trimmed = relayUrl.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) continue;
        seen.add(trimmed);
        normalized.push(trimmed);
    }
    return normalized;
}
