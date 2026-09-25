// 0.2.66 — the ICE configuration peer/WebRtcPeerConnectionProvider.js's
// own `iceServers` constructor option has accepted since 0.2.51, made
// explicit and given somewhere real to live, exactly the way peer/
// RendezvousConfig.js does for a rendezvous bootstrap list one file over.
// See that file's own header for the shared principle: this module is
// configuration a deployment can override, never a hard-coded network
// this codebase is tied to.
//
// STUN is free, public, well-known Internet infrastructure — it answers
// "what is my own reflexive address," nothing more, and learning it
// leaks no more than any ordinary outbound connection already would. The
// two defaults below are long-standing public Google STUN servers,
// included only so a fresh checkout can attempt real NAT traversal
// without any setup — see docs/Principles.md, "Rendezvous Can Introduce
// An Endpoint; It Can Never Establish Identity" (0.2.66), which applies
// here too: nothing about WHICH STUN server answers ever affects who
// peer/PeerAuthenticationSession.js's handshake proves is on the other
// end.
//
// TURN is different in kind, not just in protocol: a TURN relay carries
// the actual DataChannel bytes when a direct path can't be found, and
// almost always requires operator-issued, time-limited credentials — see
// docs/Principles.md, "TURN Is Transport Infrastructure, Never A Trusted
// Application Server" (0.2.66). This module shipped NO default TURN
// server through 0.2.66, the same "never one baked-in authority"
// restraint peer/RendezvousConfig.js applies to the rendezvous bootstrap
// list — but a TURN relay never authenticates a PEER the way a
// rendezvous server never does either (see that same principle): it only
// ever relays already-established DataChannel bytes between two
// connections peer/PeerAuthenticationSession.js has already handshaked,
// so operator-issued credentials are safe to configure here directly.
//
// 0.3.2 — this deployment's own operator-issued TURN credentials, from
// its `forkbuild.metered.live` Metered TURN Server app. This is the
// per-credential username/credential pair Metered's dashboard shows for
// one issued credential — never the account Secret Key (which mints new
// credentials and must only ever live server-side; this app has no
// server, so it must never appear here at all). Metered routes traffic
// for every customer through the same shared `standard.relay.metered.ca`
// relay hostname; these credentials are what tie that traffic back to
// this app's own account/quota. Issued as a NON-expiring credential in
// the Metered dashboard, so — unlike a short-lived one — it keeps
// working indefinitely without a runtime refresh; if it's ever rotated
// or revoked, replace the `standard.relay.metered.ca` entries below with
// the new iceServers JSON Metered's dashboard shows for the new
// credential.
//
// 0.3.4 — removed the two `?transport=tcp` entries (TURN/80 and
// TURNS/443) 0.3.2 originally included, after diagnosing live via
// chrome://webrtc-internals that they never produced a candidate OR an
// error at all — see that milestone's own now-superseded comment
// (still in git history) for the detail. Turned out to be one step in
// a longer story — see 0.3.5 below.
//
// 0.3.5 — ALL FIVE Metered entries removed; back to Google-STUN-only,
// the exact config that was already known to work before any of this.
// After 0.3.4's fix, a repeat "Invite Someone" attempt on the SAME
// reporting network STILL hit the full 30-second
// PeerSessionManager.SIGNAL_TIMEOUT_MS, even though every remaining
// entry had individually failed FAST (sub-second) in the previous
// webrtc-internals capture. That inconsistency — an entry that fails
// fast once and then apparently stalls the next time — means this
// network's path to Metered's infrastructure is not reliably
// well-behaved even when it isn't outright blackholed, and
// application/peer/PeerSessionManager.js's own createInvitation() has no
// tolerance for that: it waits for EVERY configured ICE server to
// either produce a candidate or a hard error (iceGatheringState ===
// 'complete', no trickle ICE — see SIGNAL_TIMEOUT_MS's own comment),
// so a single flaky entry is exactly as costly as a single dead one.
// Chasing individual Metered entries one at a time had diminishing
// returns; this restores the one combination already proven reliable
// (see 0.2.66's own header) rather than continuing to guess. Real TURN
// relay support — from Metered or elsewhere — remains a legitimate
// thing a deployment can add here (see this file's own header on why
// that's safe to configure directly), just not able to be revalidated
// as reliable from the network this was tested against. If reinstating
// it, prefer testing incrementally (one entry, a real "Invite Someone"
// attempt, a fresh webrtc-internals capture) over adding several at
// once — this file's own git history is a case study in why.
export const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];

// TURN credentials come from the rendezvous server, never from this code.
// Through 0.9.703 this module held a Metered API key and fetched TURN
// credentials from Metered on every page load, so every visitor contacted
// a third party and anyone could read the key and spend the account's
// relay quota. Now:
//
// - The key lives only on the rendezvous server (server/rendezvous-worker/,
//   GET /turn-credentials), which creates credentials that expire after an
//   hour and rate limits each address.
// - The app asks for them only when it starts a peer connection (see
//   createTurnCredentialSource() and WebRtcPeerConnectionProvider#prepareIceServers),
//   and only from the rendezvous servers it is already configured to use.
//   With no rendezvous server, or one offering no TURN relay, connections
//   use STUN (and any TURN server the user configured) as before.

const TURN_CREDENTIALS_PATH = '/turn-credentials';
const FETCH_TURN_CREDENTIALS_TIMEOUT_MS = 5000;
// Credentials are fetched again this long before they expire, so a
// connection never starts with one about to lapse.
const TURN_CREDENTIAL_RENEW_MARGIN_MS = 5 * 60 * 1000;
// After no server answered, connections go without TURN for this long
// before asking again, so each one doesn't wait out the timeout.
const TURN_CREDENTIAL_RETRY_AFTER_MS = 10 * 60 * 1000;

// The credentials URL a rendezvous server answers on: its own host, over
// HTTPS (HTTP for a plain ws:// development server). Null for anything
// that is not a WebSocket URL.
export function turnCredentialsUrlFor(rendezvousUrl) {
    let url;
    try {
        url = new URL(rendezvousUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        return null;
    }
    return `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}${TURN_CREDENTIALS_PATH}`;
}

// Returns an async function resolving to TURN ICE servers ([] when none are
// available). It asks each of `rendezvousUrls`' credential endpoints in
// turn and keeps the first valid answer until shortly before it expires
// (a failure, for ten minutes). Concurrent calls share one request. It never throws and never waits
// longer than `timeoutMs` per endpoint.
export function createTurnCredentialSource({
    rendezvousUrls = [],
    fetchImpl = globalThis.fetch,
    timeoutMs = FETCH_TURN_CREDENTIALS_TIMEOUT_MS,
    now = () => Date.now()
} = {}) {
    const endpoints = rendezvousUrls.map(turnCredentialsUrlFor).filter(Boolean);
    let cached = null; // { iceServers, renewAt }
    let inFlight = null;

    async function fetchFrom(endpoint) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetchImpl(endpoint, controller ? { signal: controller.signal } : {});
            if (!response.ok) return null;
            const body = await response.json();
            const expiresAtMs = Date.parse(body && body.expiresAt);
            if (!body || !Array.isArray(body.iceServers) || body.iceServers.length === 0 || Number.isNaN(expiresAtMs)) {
                return null;
            }
            return { iceServers: body.iceServers, renewAt: expiresAtMs - TURN_CREDENTIAL_RENEW_MARGIN_MS };
        } catch {
            return null;
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    return async function turnIceServers() {
        if (cached && now() < cached.renewAt) {
            return cached.iceServers;
        }
        if (endpoints.length === 0 || typeof fetchImpl !== 'function') {
            return [];
        }
        if (!inFlight) {
            inFlight = (async () => {
                for (const endpoint of endpoints) {
                    const result = await fetchFrom(endpoint);
                    if (result) return result;
                }
                return null;
            })().finally(() => { inFlight = null; });
        }
        const result = await inFlight;
        cached = result || { iceServers: [], renewAt: now() + TURN_CREDENTIAL_RETRY_AFTER_MS };
        return cached.iceServers;
    };
}

// `extra` (fetched TURN entries) first, then `base` (the configured
// STUN/TURN list), skipping entries whose urls repeat.
export function mergeIceServers(extra, base) {
    const seen = new Set();
    const result = [];
    for (const entry of [...extra, ...base]) {
        const key = JSON.stringify(entry && entry.urls);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(entry);
    }
    return result;
}
