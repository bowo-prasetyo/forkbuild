// Two independent checks against an oversized fetch response body: the
// Content-Length header (cheap, but only a claim) and the decoded body's
// actual byte length (always enforced).

// Returns null when the response has no usable Content-Length header.
export function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

export function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
