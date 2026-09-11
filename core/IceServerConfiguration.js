// 0.9.386 — User-Configurable STUN Server Configuration.
//
// 0.9.385's own audit named STUN as one of exactly two candidates
// (STUN, Rendezvous) that already carry a real, live, constructor-
// injectable configuration seam and sit on the sole default path a
// peer connection takes — see docs/Roadmap.md, 0.9.385, Sections D/E/H.
// This file is the direct structural mirror of `core/
// ArweaveGatewayConfiguration.js` / `core/NostrRelayConfiguration.js`,
// applied to a STUN server LIST instead of a single gateway/relay URL:
//
//   a user's own STUN server list (plain strings, from a future
//   settings surface — this file builds none)
//        │
//        ▼
//   core/IceServerConfiguration.js   ★ (THIS)
//        new IceServerConfiguration({ servers })
//        │  — throws for anything that isn't one or more valid stun:/stuns: URLs
//        ▼
//   { servers: [{ urls }, ...] }   (immutable, frozen, defensive copies)
//        │
//        ▼
//   (this milestone) storage/IceServerConfigurationStore.js
//        — durable persistence, deliberately a SEPARATE file; see that
//        file's own header
//        │
//        ▼
//   (this milestone) ui/main.js resolves `iceServerConfigurationStore.get()`
//   once at startup and hands its `servers` to
//   `new WebRtcPeerConnectionProvider({ iceServers })` — the exact
//   constructor argument that provider already accepts today.
//
// A SEPARATE OBJECT, NEVER A SHARED SHAPE WITH `ArweaveGatewayConfiguration`
// OR `NostrRelayConfiguration`. Structurally similar (a validated
// scheme family, one storage key, "absence stays meaningful") but a
// genuinely independent endpoint configuration with its own consumer
// (`peer/WebRtcPeerConnectionProvider.js`, never an Arweave or Nostr
// class) — this file names itself `IceServerConfiguration`, never a
// generic `InfrastructureEndpointConfiguration`, on purpose.
//
// A LIST, NOT A SINGLE URL — the one deliberate difference from those
// two sibling files. `peer/WebRtcPeerConnectionProvider.js#setIceServers()`
// and its constructor both already accept an ARRAY of `{ urls }` entries
// (an ordinary `RTCConfiguration.iceServers` shape), and a real STUN
// deployment commonly wants more than one server for redundancy — see
// `peer/IceServerConfig.js`'s own `DEFAULT_ICE_SERVERS`, which already
// ships two. `servers` here mirrors that shape exactly: one or more
// entries, each `{ urls: 'stun:...' }`.
//
// STUN ONLY — NEVER TURN. `isValidStunUrl()` accepts exactly the
// `stun:`/`stuns:` URI schemes; a `turn:`/`turns:` entry is rejected
// outright, by construction. See 0.9.385, Section E/H: TURN's own
// configuration shape remains genuinely underdetermined (credentials,
// expiry, rotation) and is a separate product decision — this file
// deliberately cannot be used to smuggle a TURN entry in under a STUN
// label. `peer/IceServerConfig.js`'s own `fetchIceServers()` — the
// TURN-fetching seam — is entirely unmodified by this file and this
// milestone; see that file and `ui/main.js`'s own 0.9.386 comment for
// how the two compose without either changing the other's behavior.
//
// VALIDATION IS DELIBERATELY MODEST — SHAPE ONLY, NEVER REACHABILITY,
// exactly the same restraint `core/ArweaveGatewayConfiguration.js`'s own
// header already draws. `isValidStunUrl()` checks only that a value is a
// non-empty string matching the `stun:`/`stuns:` URI form (RFC 7064) —
// host, optional port. It never opens a socket, never gathers a real ICE
// candidate, and never rejects a syntactically valid STUN URL for being
// "probably unreachable." A configured-but-unreachable STUN server is a
// connection-time outcome for the EXISTING `peer/WebRtcPeerConnection.js`
// ICE-gathering timeout to handle — never something this file, or
// anything in this milestone, tries to predict, health-check, or fall
// back away from. See docs/Roadmap.md, 0.9.386, "critical startup
// semantics": a malformed SAVED configuration degrades to absence
// (handled one layer up, in storage/IceServerConfigurationStore.js#get());
// a validly-saved-but-unreachable one is never silently replaced.
//
// IMMUTABLE, WITH DEFENSIVE COPIES. The constructor freezes the instance,
// the internal `servers` array, and every entry inside it; the public
// `servers` getter additionally returns a FRESH array of fresh plain
// objects on every call, so nothing a caller does to a returned value can
// ever reach this instance's own internal state.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Persistence of any kind.** See storage/IceServerConfigurationStore.js,
//   this same milestone, sibling file.
// - **A network call, a real RTCPeerConnection, or any WebRTC import of
//   any kind.** This file never imports from `peer/`, and never gathers
//   a candidate to "prove" a server works — see "validation is
//   deliberately modest," above.
// - **TURN credentials, `username`/`credential` fields, or any field
//   beyond `urls`.** Out of scope for this milestone by design — see
//   0.9.385, Section I, and "STUN only" above.
// - **A settings UI, or any `ui/` import.** See ui/views/StunSettingsView.js,
//   this same milestone, sibling file.
// - **Health checking, latency ranking, automatic fallback, or STUN
//   discovery.** None of these were selected by 0.9.385's own scoped
//   brief — see docs/Roadmap.md, 0.9.386, "explicitly exclude."
const STUN_URL_PATTERN = /^stuns?:[a-zA-Z0-9.\-]+(:[0-9]{1,5})?$/i;

export function isValidStunUrl(value) {
    if (typeof value !== 'string') return false;
    return STUN_URL_PATTERN.test(value.trim());
}

export class IceServerConfiguration {
    constructor({ servers } = {}) {
        if (!Array.isArray(servers) || servers.length === 0) {
            throw new Error('IceServerConfiguration: servers must be a non-empty array of { urls } entries');
        }
        const normalized = servers.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new Error('IceServerConfiguration: each server entry must be a plain object with a urls field');
            }
            if (!isValidStunUrl(entry.urls)) {
                throw new Error(`IceServerConfiguration: invalid STUN url "${entry.urls}"`);
            }
            return Object.freeze({ urls: entry.urls.trim() });
        });
        this._servers = Object.freeze(normalized);
        Object.freeze(this);
    }

    // A fresh array of fresh plain objects on every call — see this
    // file's own header, "immutable, with defensive copies."
    get servers() {
        return this._servers.map((server) => ({ urls: server.urls }));
    }

    // Value equality, never identity — the same convention `core/
    // ArweaveGatewayConfiguration.js`'s own equals() already holds,
    // extended here to compare an ordered list of entries.
    equals(other) {
        if (!(other instanceof IceServerConfiguration)) return false;
        if (other._servers.length !== this._servers.length) return false;
        return this._servers.every((server, index) => server.urls === other._servers[index].urls);
    }

    // Plain-data convenience for storage/IceServerConfigurationStore.js —
    // this class itself never calls it, and never reads or writes any
    // storage key on its own.
    toJSON() {
        return { servers: this.servers };
    }

    static fromJSON(data) {
        return new IceServerConfiguration({ servers: data && data.servers });
    }
}
