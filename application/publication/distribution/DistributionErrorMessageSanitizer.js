// Post-Publish Distribution Error Sanitization.
//
// Every existing distribution error path (EditorView.js,
// OwnPublicationPanel.js, WorldEncounterCanvas.js) has always reported one
// fixed, generic notice on ANY failure — "no leaked wallet error text, no
// new vocabulary" is an explicit, tested invariant elsewhere in this
// codebase (see tests/PublicationDistributionEndToEndRuntimeAudit.test.js's
// own Section D1). That protects against a browser wallet extension's own
// error text leaking something unsafe, but it also means a user who hits
// the single most common, actionable cause — no compatible wallet
// extension installed at all — sees exactly the same unhelpful notice as a
// genuine unknown failure, with nothing to act on.
//
// This module is the seam that lets a caller show WHY an attempt failed
// without reversing that existing caution: rather than displaying an
// underlying error verbatim, it strips the categories of content that
// could be unsafe or meaningless to a user — hostnames/URLs, IP addresses,
// filesystem paths, stack traces, version strings, and long opaque
// token/credential-looking runs — and returns whatever readable remainder
// survives, or null when nothing safe/useful is left. A caller sees null
// exactly when it should fall back to its own existing generic notice —
// this function never invents one itself.
//
// A BEST-EFFORT FILTER, NEVER A GUARANTEE. Pattern-matching free-form error
// text can't prove the absence of every possible sensitive detail — this
// stays conservative on purpose: when in doubt, it redacts rather than
// risks showing something unsafe. It has no opinion about WHERE a message
// came from and performs no I/O — a pure function of the one value handed
// to it.
const REDACTED = '[redacted]';
const MAX_LENGTH = 160;

export function sanitizeDistributionErrorMessage(error) {
    if (!error) {
        return null;
    }
    const raw = typeof error === 'string' ? error : (error && error.message);
    if (typeof raw !== 'string' || !raw.trim()) {
        return null;
    }

    let message = raw
        // A stack trace never belongs on screen — keep only the text
        // before the first line break or the first "at <frame>" marker.
        .split(/\r?\n|\s+at\s+\S+/)[0]
        // URLs and dotted hostnames can name an internal server.
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, REDACTED)
        .replace(/\b(?:[a-z0-9-]+\.){1,}[a-z]{2,}(?::\d+)?\b/gi, REDACTED)
        // IPv4 and IPv6 addresses.
        .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, REDACTED)
        .replace(/\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){5,7}\b/gi, REDACTED)
        // Filesystem paths (unix and windows) — two or more path segments.
        .replace(/(?:[A-Za-z]:)?(?:[\\/][^\s\\/:]+){2,}/g, REDACTED)
        // Version-looking tokens that could name a library version.
        .replace(/\bv?\d+\.\d+\.\d+(?:[-.][\w]+)*\b/g, REDACTED)
        // Long opaque runs — API keys, auth tokens, hashes — but never a
        // pure-letter PascalCase identifier (a class/file name, the exact
        // thing that makes "X: wallet extension rejected sign()" useful).
        // A real secret or hash always mixes in a digit; an identifier like
        // "ArweaveInjectedProviderSigner" does not, so requiring at least
        // one digit in the run tells the two apart without a name-specific
        // allowlist.
        .replace(/\b[A-Za-z0-9_-]{20,}\b/g, (token) => (/\d/.test(token) ? REDACTED : token))
        .trim();

    // Nothing but redaction markers (and punctuation between them)
    // survived — there is no readable cause left to show.
    const withoutMarkersOrPunctuation = message.split(REDACTED).join('').replace(/[\s.,:;-]/g, '');
    if (!message || !withoutMarkersOrPunctuation) {
        return null;
    }

    if (message.length > MAX_LENGTH) {
        message = `${message.slice(0, MAX_LENGTH).trim()}…`;
    }

    return message;
}
