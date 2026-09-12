const REDACTED = '[redacted]';

// 0.9.454 — User-Configurable TURN Server Configuration.
//
// 0.9.453's own Contract Audit resolved, live, against real source (not
// merely in prose), the one open question standing between 0.9.390's DEFER
// and a real implementation: what shape does "bring your own TURN server"
// actually take. That audit's own Section F prototype is what this file
// promotes, unchanged in shape, to production:
//
//   a user's own TURN relay (one or more turn:/turns: URLs, ONE shared
//   username/credential pair — never a list of independently-credentialed
//   servers; that is a separate, deferred resilience feature, see 0.9.453
//   Section C3)
//        │
//        ▼
//   core/TurnServerConfiguration.js   ★ (THIS)
//        new TurnServerConfiguration({ urls, username, credential })
//        │  — throws for anything that isn't one or more valid
//        │    turn:/turns: URLs, or an empty username/credential
//        ▼
//   { urls: [...], username, credential }   (immutable, frozen, defensive
//        copies)
//        │
//        ▼
//   (0.9.454, sibling file) storage/TurnServerConfigurationStore.js
//        — durable persistence, deliberately separate, mirroring
//        storage/IceServerConfigurationStore.js's own shape exactly
//        │
//        ▼
//   (0.9.454, sibling file) application/TurnServerConfigurationProvider.js
//        │
//        ▼
//   (0.9.455, NOT this milestone) WebRTC composition ->
//        WebRtcPeerConnectionProvider's own iceServers array, via
//        toIceServerEntry() below — already proven, live, against the real,
//        unmodified provider in 0.9.453 Section D5/F5.
//
// A SEPARATE CLASS, NEVER A SHARED SHAPE WITH `IceServerConfiguration`.
// core/IceServerConfiguration.js remains STUN-only — see that file's own
// "STUN ONLY — NEVER TURN" header, unmodified by this milestone. This class
// is a genuinely independent configuration, with its own store, its own
// provider, and its own persistence key; it is never accepted by, merged
// into, or read from IceServerConfiguration or IceServerConfigurationStore,
// and it accepts no stun:/stuns: URL itself (see isValidTurnUrl below).
//
// ONE SHARED CREDENTIAL PAIR, ONE OR MORE RELAY URLS — the RTCIceServer
// contract's own real shape (udp/tcp/tls variants of the same operator's
// relay), deliberately NOT a list of independently-credentialed servers.
// See 0.9.453 Section C3: failover across multiple, separately-credentialed
// TURN servers is real, confirmed future work, but its own separate,
// later, unscheduled milestone — never smuggled into this configuration.
//
// VALIDATION IS DELIBERATELY MODEST — SHAPE ONLY, NEVER REACHABILITY,
// exactly the same restraint core/IceServerConfiguration.js's own header
// already draws for STUN. `isValidTurnUrl()` checks only that a value is a
// non-empty string matching the turn:/turns: URI form (RFC 7065), with an
// optional `?transport=udp|tcp` parameter — host, optional port. It never
// opens a socket and never rejects a syntactically valid TURN URL for being
// "probably unreachable." A configured-but-unreachable TURN server is a
// connection-time outcome for the existing peer/WebRtcPeerConnection.js
// ICE-gathering timeout to handle — see 0.9.453 Section G, unchanged by
// this milestone.
//
// IMMUTABLE, WITH DEFENSIVE COPIES — the identical convention
// IceServerConfiguration already holds. The constructor freezes the
// instance and the internal urls array; the public `urls` getter returns a
// FRESH array on every call, so nothing a caller does to a returned value
// can ever reach this instance's own internal state.
//
// THE CREDENTIAL IS SENSITIVE CONFIGURATION — NEVER A GENERALIZED SECRET
// FRAMEWORK. This class draws exactly one line, deliberately narrow: its
// own `credential` field never appears in this class's own `toString()` or
// `util.inspect` (console.log) representation, and no thrown error ever
// interpolates its value. `toJSON()` is the ONE place `credential` is
// intentionally, fully serialized — a deliberate escape hatch that exists
// solely for storage/TurnServerConfigurationStore.js's own persistence
// round trip (see that file). A caller logging, diagnosing, or displaying
// this configuration through any means OTHER than reading `.credential`
// directly or calling `.toJSON()`/`.toIceServerEntry()` directly will never
// see the real value. This is not a generalized secret-management system —
// there is no encryption, no redaction-on-read, no access control; it is
// the one narrow guarantee 0.9.454's own brief asks for: the credential
// does not leak through ORDINARY paths (an uncaught error, an accidental
// `console.log(configuration)`, JSON.stringify of some unrelated object
// that happens to hold a reference).
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Persistence of any kind.** See storage/TurnServerConfigurationStore.js,
//   this same milestone, sibling file.
// - **A network call, a real RTCPeerConnection, or any WebRTC import of any
//   kind.** This file never imports from `peer/`.
// - **Multiple, independently-credentialed TURN servers, failover, health
//   checking, or credential refresh.** See "one shared credential pair,"
//   above, and 0.9.453 Section C2/C3/H.
// - **A settings UI, or any `ui/` import.** Deferred to 0.9.456.
// - **Composing into WebRtcPeerConnectionProvider's own iceServers array.**
//   Deferred to 0.9.455 — `toIceServerEntry()` below produces the exact
//   shape that milestone will consume, but this file performs no
//   composition of its own.
const TURN_URL_PATTERN = /^turns?:[a-zA-Z0-9.\-]+(:[0-9]{1,5})?(\?transport=(udp|tcp))?$/i;

export function isValidTurnUrl(value) {
    if (typeof value !== 'string') return false;
    return TURN_URL_PATTERN.test(value.trim());
}

export class TurnServerConfiguration {
    constructor({ urls, username, credential } = {}) {
        const urlList = Array.isArray(urls) ? urls : [urls];
        if (urlList.length === 0) {
            throw new Error('TurnServerConfiguration: urls must be a non-empty turn:/turns: URL or array of URLs');
        }
        const normalizedUrls = urlList.map((url) => {
            if (!isValidTurnUrl(url)) {
                throw new Error(`TurnServerConfiguration: invalid TURN url "${url}"`);
            }
            return url.trim();
        });
        if (typeof username !== 'string' || username.trim().length === 0) {
            throw new Error('TurnServerConfiguration: username must be a non-empty string');
        }
        if (typeof credential !== 'string' || credential.trim().length === 0) {
            throw new Error('TurnServerConfiguration: credential must be a non-empty string');
        }
        this._urls = Object.freeze(normalizedUrls);
        this._username = username.trim();
        this._credential = credential;
        Object.freeze(this);
    }

    // A fresh array on every call — see this file's own header, "immutable,
    // with defensive copies."
    get urls() { return [...this._urls]; }

    get username() { return this._username; }

    // The raw credential value. Reading it through this accessor is the
    // caller's own explicit choice to handle a secret — see this file's own
    // header, "the credential is sensitive configuration."
    get credential() { return this._credential; }

    // Value equality, never identity — the same convention
    // IceServerConfiguration already holds.
    equals(other) {
        if (!(other instanceof TurnServerConfiguration)) return false;
        return this._username === other._username
            && this._credential === other._credential
            && this._urls.length === other._urls.length
            && this._urls.every((url, index) => url === other._urls[index]);
    }

    // The exact RTCIceServer-shaped object WebRtcPeerConnectionProvider's
    // own iceServers array already accepts, per entry — a single-string
    // urls field when there is exactly one URL (matching the existing
    // Metered-fetch shape byte for byte), an array field otherwise. Proven,
    // live, against the real provider in 0.9.453 Section D5/F5. Includes
    // the real credential — this method is one of the two deliberate
    // escape hatches named in this file's own header, alongside toJSON().
    toIceServerEntry() {
        return {
            urls: this._urls.length === 1 ? this._urls[0] : [...this._urls],
            username: this._username,
            credential: this._credential
        };
    }

    // Plain-data convenience for storage/TurnServerConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own. Includes the real credential — see this
    // file's own header, "the credential is sensitive configuration": this
    // is the ONE intentional full-serialization escape hatch.
    toJSON() {
        return { urls: this.urls, username: this._username, credential: this._credential };
    }

    static fromJSON(data) {
        return new TurnServerConfiguration({ urls: data && data.urls, username: data && data.username, credential: data && data.credential });
    }

    // Deliberately redacted — see this file's own header, "the credential
    // is sensitive configuration." Never includes `_credential`.
    toString() {
        return `TurnServerConfiguration(${this._urls.length} url(s), username=${this._username}, credential=${REDACTED})`;
    }

    // Node's console.log()/util.inspect() call this symbol, when present,
    // instead of enumerating own properties — without it, an accidental
    // `console.log(configuration)` would print the real `_credential`
    // field straight from the frozen instance. Redacted for the identical
    // reason as toString(), above.
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
}
