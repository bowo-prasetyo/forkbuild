// 0.9.388 — User-Configurable Rendezvous Server Configuration.
//
// 0.9.385's own audit named Rendezvous as the second of exactly two
// candidates (STUN, Rendezvous) that already carry a real, live,
// constructor-injectable configuration seam and sit on the sole default
// path of the `Peer -> Sync -> Repository -> Explore -> Fork` primary
// journey — see docs/Roadmap.md, 0.9.385, Sections D/E/H, and 0.9.387's
// own "Next" section. This file is the direct structural mirror of
// `core/IceServerConfiguration.js` (0.9.386), applied to a rendezvous
// URL LIST instead of a STUN server list:
//
//   a user's own rendezvous server list (plain strings, from a future
//   settings surface — this file builds none)
//        │
//        ▼
//   core/RendezvousConfiguration.js   ★ (THIS)
//        new RendezvousConfiguration({ urls })
//        │  — throws for anything that isn't one or more valid ws:/wss: URLs
//        ▼
//   { urls: [...] }   (immutable, frozen, defensive copies)
//        │
//        ▼
//   (this milestone) storage/RendezvousConfigurationStore.js
//        — durable persistence, deliberately a SEPARATE file; see that
//        file's own header
//        │
//        ▼
//   (this milestone) ui/main.js resolves `rendezvousConfigurationStore.get()`
//   once at startup and hands its `urls` to
//   `DEFAULT_RENDEZVOUS_URLS.map(...)`'s own replacement,
//   `resolvedRendezvousUrls.map((url) => new RendezvousDiscoveryProvider({
//   transport: new WebSocketRendezvousTransport({ url }), ... }))` — the
//   exact shape `peer/RendezvousConfig.js`'s own `DEFAULT_RENDEZVOUS_URLS`
//   already produces today.
//
// A SEPARATE OBJECT, NEVER A SHARED SHAPE WITH `IceServerConfiguration`,
// `ArweaveGatewayConfiguration`, OR `NostrRelayConfiguration`. Structurally
// similar (a validated scheme family, one storage key, "absence stays
// meaningful") but a genuinely independent endpoint configuration with its
// own consumer (`peer/DiscoveryBootstrap.js`/`peer/WebSocketRendezvousTransport.js`,
// never a WebRTC, Arweave, or Nostr class) — this file names itself
// `RendezvousConfiguration`, never a generic
// `InfrastructureEndpointConfiguration`, on purpose. See 0.9.387's own
// "Next" section, which draws this exact line before this file existed.
//
// A LIST OF PLAIN STRINGS, NOT A LIST OF `{ urls }` ENTRIES — the one
// deliberate shape difference from `core/IceServerConfiguration.js`.
// `peer/RendezvousConfig.js`'s own `DEFAULT_RENDEZVOUS_URLS` is already an
// array of plain WebSocket URL strings, and every consumer
// (`new WebSocketRendezvousTransport({ url })`) takes one plain string —
// there is no `RTCConfiguration.iceServers`-shaped contract to mirror
// here, so this class holds the simpler shape its own consumers actually
// need, rather than manufacturing an unnecessary `{ urls }` wrapper.
//
// WS/WSS ONLY. `isValidRendezvousUrl()` accepts exactly an absolute URL
// (RFC 3986, via the platform `URL` constructor) whose scheme is `ws:` or
// `wss:` — the same "parse it as a real URL, then check the protocol"
// technique `core/NostrRelayConfiguration.js#isValidNostrRelayUrl` already
// establishes, chosen over `core/IceServerConfiguration.js`'s own
// hand-rolled regex because a rendezvous URL, unlike a bare `stun:host:port`
// authority, is a genuine WebSocket URL that may carry a path (see
// `peer/RendezvousConfig.js`'s own `DEFAULT_RENDEZVOUS_URLS` entry, a bare
// host with no path, and `peer/WebSocketRendezvousTransport.js`'s own wire
// protocol, which never assumes one). Any other scheme — `http:`, `https:`,
// `stun:`, `turn:` — is rejected outright, by construction.
//
// VALIDATION IS DELIBERATELY MODEST — SHAPE ONLY, NEVER REACHABILITY,
// exactly the same restraint `core/IceServerConfiguration.js`'s own header
// already draws. `isValidRendezvousUrl()` never opens a socket, never
// issues a real PUBLISH/LOOKUP, and never rejects a syntactically valid
// rendezvous URL for being "probably unreachable." A configured-but-
// unreachable rendezvous server is a LOOKUP-time outcome for the EXISTING
// `peer/RendezvousDiscoveryProvider.js#discover()` graceful-degradation
// path to handle (see that file's own header, "A Rendezvous Lookup
// Degrades; It Never Fails Loud") — never something this file, or
// anything in this milestone, tries to predict, health-check, or fall
// back away from.
//
// IMMUTABLE, WITH DEFENSIVE COPIES. The constructor freezes the instance
// and the internal `urls` array; the public `urls` getter additionally
// returns a FRESH array on every call, so nothing a caller does to a
// returned value can ever reach this instance's own internal state.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Persistence of any kind.** See storage/RendezvousConfigurationStore.js,
//   this same milestone, sibling file.
// - **A network call, a real WebSocket, or any `peer/` import of any
//   kind.** This file never imports from `peer/`, and never issues a
//   PUBLISH/LOOKUP to "prove" a server works — see "validation is
//   deliberately modest," above.
// - **A settings UI, or any `ui/` import.** See
//   ui/views/RendezvousSettingsView.js, this same milestone, sibling file.
// - **Health checking, latency ranking, automatic fallback, endpoint
//   selection, or rendezvous protocol changes.** None of these were
//   selected by 0.9.385's own scoped brief — see docs/Roadmap.md, 0.9.386,
//   "explicitly exclude," the identical restraint held here for Rendezvous.
// - **STUN/TURN configuration, peer connection changes, or authentication
//   changes.** This file never imports anything ICE/WebRTC-shaped, and
//   never touches `peer/PeerAuthenticationSession.js` — configuring WHERE
//   discovery connects is never conflated with WHO a connection is proven
//   to belong to.
const RENDEZVOUS_URL_SCHEMES = new Set(['ws:', 'wss:']);

export function isValidRendezvousUrl(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        return false;
    }
    return RENDEZVOUS_URL_SCHEMES.has(parsed.protocol);
}

export class RendezvousConfiguration {
    constructor({ urls } = {}) {
        if (!Array.isArray(urls) || urls.length === 0) {
            throw new Error('RendezvousConfiguration: urls must be a non-empty array of ws:/wss: URL strings');
        }
        const normalized = urls.map((url) => {
            if (!isValidRendezvousUrl(url)) {
                throw new Error(`RendezvousConfiguration: invalid rendezvous url "${url}"`);
            }
            return url.trim();
        });
        this._urls = Object.freeze(normalized);
        Object.freeze(this);
    }

    // A fresh array on every call — see this file's own header,
    // "immutable, with defensive copies."
    get urls() {
        return this._urls.slice();
    }

    // Value equality, never identity — the same convention `core/
    // IceServerConfiguration.js`'s own equals() already holds, extended
    // here to compare an ordered list of plain URL strings.
    equals(other) {
        if (!(other instanceof RendezvousConfiguration)) return false;
        if (other._urls.length !== this._urls.length) return false;
        return this._urls.every((url, index) => url === other._urls[index]);
    }

    // Plain-data convenience for storage/RendezvousConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own.
    toJSON() {
        return { urls: this.urls };
    }

    static fromJSON(data) {
        return new RendezvousConfiguration({ urls: data && data.urls });
    }
}
