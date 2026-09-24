// JSON.parse() that returns null instead of throwing on malformed text.
export function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
