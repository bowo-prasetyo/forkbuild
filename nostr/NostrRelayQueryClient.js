const DEFAULT_TIMEOUT_MS = 8000;

// 0.9.147 — Decentralized Discovery Relay Query Client.
//
// docs/Roadmap.md's own 0.9.110 and 0.9.142 comments each name the
// identical, still-open gap: `application/NostrDiscoveryQueryService.js`
// (0.9.31) and `application/NostrSnapshotDiscoveryQueryService.js` (0.9.133)
// both require an injected `queryImpl: (relayUrl, filter) => Promise<events>`
// with no ambient default, and nothing in this codebase has ever supplied
// one — `ui/main.js` gracefully resolves `nostr: null` / `resolver: null`
// for both families rather than construct a service that could only ever
// throw. This file is that missing capability: the first thing in this
// codebase that actually opens a NIP-01 subscription against a real Nostr
// relay and hands back the raw events it collects.
//
//   Nostr relay
//        │
//        │   ["REQ", subId, filter]  →
//        │   ["EVENT", subId, event]  (zero or more)  ←
//        │   ["EOSE", subId]  ←
//        │   ["CLOSE", subId]  →
//        ▼
//   nostr/NostrRelayQueryClient.js   ★ (THIS)
//        createNostrRelayQueryClient({ webSocketImpl, timeoutMs })
//        │
//        │   queryImpl(relayUrl, filter) -> Promise<Array<event>>
//        ▼
//   application/NostrDiscoveryQueryService.js          (0.9.31, unmodified)
//   application/NostrSnapshotDiscoveryQueryService.js   (0.9.133, unmodified)
//
// A `queryImpl` PRODUCER, NEVER A THIRD DISCOVERY SERVICE. This file has no
// idea a `DecentralizedDiscoveryEnvelope`, a `SnapshotDiscoveryEnvelope`, a
// discovery tag, a lead, or a Publication exists — it imports nothing from
// `application/` or `core/`, and knows nothing about ForkBuild's own
// discovery vocabulary. It solves exactly one problem: given a relay url and
// a NIP-01 filter object, run the subscribe/collect/EOSE exchange and
// resolve with whatever raw events the relay sent back. Every semantic
// question — is this event's `content` a well-formed envelope, does a
// candidate deserve to become a lead, is a result trustworthy, should one
// relay be preferred over another — stays exactly where 0.9.31/0.9.133
// already put it, entirely untouched by this milestone. This mirrors
// `nostr/NostrInjectedProviderPublisher.js`'s own restraint for the write
// side exactly: that file signs and broadcasts one event and knows nothing
// about `NostrPublicationDiscoveryPublisher`; this file subscribes and
// collects events and knows nothing about either query service above it.
//
// THE EXACT `queryImpl` SHAPE BOTH QUERY SERVICES ALREADY DOCUMENT, NOTHING
// MORE. `createNostrRelayQueryClient()` returns a function of exactly
// `(relayUrl, filter) => Promise<events>` — the identical signature
// `application/NostrDiscoveryQueryService.js`'s own header names for
// `queryImpl`. A caller hands that function straight through as
// `nostrQueryImpl` (0.9.110's own composition) or
// `nostrSnapshotDiscoveryQueryServiceOptions.queryImpl` (0.9.142's own),
// unwrapped — this file never constructs either query service itself, and
// never imports either one.
//
// `undefined`, NEVER A FUNCTION THAT COULD ONLY THROW, WHEN NO WEBSOCKET
// IMPLEMENTATION IS AVAILABLE — the same restraint
// `nostr/NostrInjectedProviderPublisher.js`'s own header holds for a missing
// `injectedProvider`. Unlike that file, which degrades to `undefined`
// because a user may simply not have a NIP-07 extension installed, a
// missing `WebSocket` global here is an environment gap (a bare Node
// process with no `webSocketImpl` supplied, or a runtime with no `WebSocket`
// at all) — READING a relay needs no wallet, no signature, and no user
// permission, only a transport. Either way, both query services' own
// composition roots already treat an omitted/undefined `queryImpl`
// identically to "no host capability" — this file simply reuses that
// existing graceful path rather than inventing a second one.
//
// EXACTLY ONE RELAY, ONE SUBSCRIPTION, PER CALL — NO FAN-OUT, NO RETRY, NO
// RANKING. The identical "exactly one relay per instance" restraint every
// sibling in this family (`NostrDiscoveryQueryService`,
// `NostrSnapshotDiscoveryQueryService`, `NostrInjectedProviderPublisher`)
// already holds, held here one layer earlier, for the raw subscription
// itself. Querying several relays and combining what they each report
// stays entirely a caller's own, later, unscheduled concern — this file
// opens one socket, to the one `relayUrl` it was called with, and closes it
// before its own promise settles either way.
//
// EVENTS ARE COLLECTED IN THE ORDER THE RELAY SENDS THEM, NEVER COLLAPSED,
// NEVER DEDUPLICATED. Every `["EVENT", subId, event]` frame carrying this
// call's own subscription id becomes one entry in the array `queryImpl`
// resolves with — three distinct `EVENT` frames become an array of three,
// never merged into one. A frame naming a DIFFERENT subscription id (a
// stale subscription from a previous call sharing the same socket — which
// never happens here, since a fresh socket is opened per call, but relays
// are not required to honor `CLOSE` promptly) is silently ignored, never
// mixed into this call's own results.
//
// `EOSE` — NEVER A TIMER, NEVER A RESULT COUNT — IS WHAT ENDS A QUERY, AND
// A ZERO-EVENT `EOSE` IS AN ORDINARY, SUCCESSFUL EMPTY RESULT, NOT A
// FAILURE. The moment this call's own `["EOSE", subId]` frame arrives, this
// file sends `["CLOSE", subId]`, closes the socket, and resolves with
// whatever it collected — `[]` when the relay reported end-of-stream before
// a single matching `EVENT` arrived. `timeoutMs` exists only to bound a
// relay that never sends `EOSE` at all (see "connection failure and
// timeout are rejections, never `[]`," below) — it is never what a
// well-behaved relay's own empty result relies on.
//
// CONNECTION FAILURE AND TIMEOUT ARE REJECTIONS, NEVER `[]` — A DELIBERATE
// DIFFERENCE FROM HOW `NostrDiscoveryQueryService.search()`/
// `NostrSnapshotDiscoveryQueryService.search()` THEMSELVES BEHAVE ONE LAYER
// UP. Those two files already collapse every `queryImpl` failure — a
// rejection, a timeout, a non-array resolution — into `[]`, because a
// discovery candidate list has no room to express "the relay was
// unreachable" separately from "the relay had nothing to say," and 0.9.31's
// own header already commits to that restraint for its own callers. This
// file is a different, lower layer with a different obligation: a socket
// construction error, an `onerror` event, or `timeoutMs` elapsing with no
// `EOSE` all reject this function's own promise, so that "no matching
// events" (`resolve([])`), "relay unavailable" (`reject`), and "a malformed
// frame" (silently skipped, contributes to neither) never collapse into the
// same outcome AT THIS LAYER, even though the layer above deliberately
// re-collapses two of the three for its own, already-documented reasons.
//
// A MALFORMED FRAME IS SKIPPED, NEVER A FABRICATED EVENT AND NEVER A FATAL
// ERROR. Unparseable JSON, a non-array frame, an `EVENT` frame whose own
// payload is not a plain object, or any frame naming a type this file does
// not recognize (`NOTICE`, `CLOSED`, `AUTH`, or anything else NIP-01/its
// extensions define) is silently ignored — it neither becomes an entry in
// the resolved array nor aborts the subscription. The identical "one bad
// candidate never corrupts the others" restraint `application/
// NostrDiscoveryQueryService.js`'s own header already holds, held here one
// layer earlier, for a raw relay frame rather than a parsed envelope.
//
// NO NIP-01 `id`/`sig` VERIFICATION, NO CONTENT INSPECTION OF ANY KIND. An
// `EVENT` payload is handed back exactly as the relay sent it — this file
// never reads `event.content`, `event.kind`, or `event.tags`, and never
// checks `event.sig`. Whether an event is well-formed ForkBuild discovery
// data is entirely `parseDecentralizedDiscoveryEnvelope()`'s/
// `parseSnapshotDiscoveryEnvelope()`'s own job, one layer up; whether a
// signature should ever gate anything remains the same unscheduled question
// `core/DecentralizedDiscoveryEnvelope.js`'s own header already left open.
//
// NO EXTERNAL DEPENDENCY — plain `WebSocket`, injectable exactly like
// `nostr/NostrInjectedProviderPublisher.js`'s own `webSocketImpl`, so this
// file's own tests never open a real socket to a real relay.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Querying more than one relay, combining, ranking, deduplicating, or
//   retrying across relays.** See "exactly one relay, one subscription, per
//   call," above — a future, unscheduled composition layer over several
//   calls to this same function.
// - **Any signature or NIP verification of an event's `id`/`sig`/`pubkey`.**
//   See "no NIP-01 id/sig verification," above.
// - **Publishing, tagging, or signing a Nostr event.** This file only ever
//   reads — the read-side counterpart of `nostr/
//   NostrInjectedProviderPublisher.js`, never a replacement for it.
// - **Interpreting an event's own `content`, deciding whether it is a
//   ForkBuild discovery envelope, or constructing a `DecentralizedWorldDiscoveryLead`/
//   discovery candidate of any kind.** Entirely `application/
//   NostrDiscoveryQueryService.js`'s and `application/
//   NostrSnapshotDiscoveryQueryService.js`'s own job, unmodified.
// - **A live subscription that stays open past its own `EOSE`, streaming
//   updates.** This function's own promise always settles once, at `EOSE`
//   (or a failure) — it never resolves twice and never leaves a socket open
//   after settling.
// - **Provider/relay-health scoring, automatic failover, or a "best" relay
//   selection policy of any kind.**
export function createNostrRelayQueryClient({ webSocketImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const webSocketCtor = webSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (typeof webSocketCtor !== 'function') {
        return undefined;
    }

    // queryImpl(relayUrl, filter) -> Promise<Array<event>>. See this file's
    // own header for the complete contract: resolves with every `EVENT`
    // this call's own subscription received before the relay's own `EOSE`,
    // in the order received, `[]` when none arrived; rejects on a socket
    // construction error, a connection error, or `timeoutMs` elapsing with
    // no `EOSE` — a genuine transport failure, never silently reported as
    // `[]` by this file itself.
    return function queryImpl(relayUrl, filter) {
        return new Promise((resolve, reject) => {
            const subscriptionId = generateSubscriptionId();
            const events = [];
            let socket;
            let settled = false;

            const timer = setTimeout(() => {
                finish(() => reject(new Error('NostrRelayQueryClient: relay did not send EOSE before timing out')));
            }, timeoutMs);

            function finish(action) {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                if (socket) {
                    socket.onopen = null;
                    socket.onmessage = null;
                    socket.onerror = null;
                    try {
                        if (socket.readyState === undefined || socket.readyState === 1) {
                            socket.send(JSON.stringify(['CLOSE', subscriptionId]));
                        }
                    } catch {
                        // best-effort only — the relay may already be gone
                    }
                    try {
                        socket.close();
                    } catch {
                        // best-effort only — the socket may already be closing/closed
                    }
                }
                action();
            }

            try {
                socket = new webSocketCtor(relayUrl);
            } catch (error) {
                finish(() => reject(error));
                return;
            }

            socket.onopen = () => {
                try {
                    socket.send(JSON.stringify(['REQ', subscriptionId, filter]));
                } catch (error) {
                    finish(() => reject(error));
                }
            };

            socket.onerror = () => {
                finish(() => reject(new Error('NostrRelayQueryClient: relay connection failed')));
            };

            socket.onmessage = (messageEvent) => {
                const frame = parseRelayFrame(messageEvent.data);
                if (frame === null || frame.subscriptionId !== subscriptionId) {
                    return;
                }
                if (frame.type === 'EVENT') {
                    events.push(frame.payload);
                    return;
                }
                if (frame.type === 'EOSE') {
                    finish(() => resolve([...events]));
                }
                // any other frame type (NOTICE, CLOSED, AUTH, ...) is not
                // interpreted — see this file's own header, "a malformed
                // frame is skipped."
            };
        });
    };
}

createNostrRelayQueryClient.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

// Pure. Parses one raw relay message into `{ type, subscriptionId, payload }`
// or `null` — see this file's own header, "a malformed frame is skipped."
// Only `["EVENT", subId, event]` (event must be a plain object) and
// `["EOSE", subId]` are ever recognized; anything else — unparseable JSON, a
// non-array frame, a too-short array, an `EVENT` whose own payload is not a
// plain object — returns `null`.
function parseRelayFrame(rawData) {
    let parsed;
    try {
        parsed = JSON.parse(rawData);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed) || parsed.length < 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') {
        return null;
    }
    const [type, subscriptionId, payload] = parsed;
    if (type === 'EOSE') {
        return { type, subscriptionId, payload: null };
    }
    if (type === 'EVENT' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return { type, subscriptionId, payload };
    }
    return null;
}

// Pure-enough (reads no external state beyond Math.random/Date.now).
// Generates a per-call NIP-01 subscription id — unique per call so two
// concurrent queryImpl() calls sharing no state never collide.
function generateSubscriptionId() {
    return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
