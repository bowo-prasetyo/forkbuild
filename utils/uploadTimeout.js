// A request timeout for an upload: `baseMs` for the round trip, plus one
// second per full UPLOAD_BYTES_PER_SECOND of body, so a large upload over a
// slow connection is not cut off while it is still sending. An upload
// under that size keeps exactly baseMs.
export const UPLOAD_BYTES_PER_SECOND = 128 * 1024;

export function uploadTimeoutMs(baseMs, byteCount) {
    const bytes = Number.isFinite(byteCount) && byteCount > 0 ? byteCount : 0;
    return baseMs + Math.floor(bytes / UPLOAD_BYTES_PER_SECOND) * 1000;
}
