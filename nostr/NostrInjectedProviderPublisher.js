const DEFAULT_TIMEOUT_MS = 6000;

// 0.9.121 — Nostr Injected Provider Publisher.
//
// application/NostrPublicationDistributionRuntimeAdapter.js (0.9.108)
// closed the seam a host Nostr publishing capability plugs into, but named
// "a concrete host Nostr publishing capability... a NIP-46/NIP-07
// integration" as later, unscheduled work. This file is that concrete
// capability: the first thing in this codebase that actually signs a
// Nostr event through a real, injected, NIP-07-shaped extension and
// broadcasts it to a real relay over a real WebSocket.
//
//   window.nostr (or any object shaped like it — see this file's own
//   tests for a fake one; NIP-07 — https://github.com/nostr-protocol/nips/
//   blob/master/07.md — is the real, documented interface)
//        │
//        ▼
//   nostr/NostrInjectedProviderPublisher.js   ★ (THIS)
//        createNostrInjectedProviderPublisher({ injectedProvider, webSocketImpl })
//        │
//        ▼
//   publish(relayUrl, eventTemplate) -> Promise<{ published, id? }>   | undefined
//        │
//        ▼
//   application/NostrPublicationDistributionRuntimeAdapter.js   (0.9.108, unmodified)
//
// A `publish` PRODUCER, NEVER A SECOND SEAM. 0.9.108's own adapter already
// renames a host's own `publish` onto `publishImpl`; this file is what a
// caller (`ui/main.js`) hands it AS that `publish`. This file has no idea
// `NostrPublicationDistributionRuntimeAdapter` or
// `NostrPublicationDiscoveryPublisher` exist — it imports nothing from
// `application/`, and knows nothing about Publications, discovery
// envelopes, or discovery tags. It solves exactly one problem: given a
// browser's own injected Nostr extension, a relay url, and a plain
// `{ kind, tags, content }` template, sign and broadcast a real event.
//
// `undefined`, NEVER A THROW, WHEN NO EXTENSION IS INJECTED — the same
// restraint `arweave/ArweaveInjectedProviderSigner.js` holds one substrate
// over. `createNostrInjectedProviderPublisher({ injectedProvider: null })`
// (or any object missing `getPublicKey`/`signEvent`) returns `undefined` —
// `resolveNostrPublisherOptions()` (0.9.105, unmodified) already treats an
// absent `publishImpl` as "Nostr is not currently configured," the
// identical outcome as today.
//
// SIGNING AND BROADCAST ARE TWO SEPARATE STEPS HERE, EVEN THOUGH THE
// `publishImpl` CONTRACT ABOVE TREATS THEM AS ONE OPAQUE EXCHANGE — a fact
// entirely internal to this file, invisible to its own caller. NIP-07
// defines a signing primitive only (`signEvent`); it defines no relay
// transport at all. This file signs via the injected extension, then opens
// its own WebSocket to `relayUrl` and speaks the one NIP-01 exchange this
// milestone needs — `["EVENT", event]` out, `["OK", id, ok, message]` back
// — never a general-purpose relay client, never a subscription, never a
// second relay for redundancy. `application/NostrPublicationDiscoveryPublisher.js`'s
// own header already draws this exact "signing and broadcast, one
// indivisible exchange from the caller's own vantage point" line; this
// file is the concrete thing living behind it.
//
// NO NIP-07 "CONNECT" STEP TO SURFACE — NIP-07 defines none; a real
// extension shows its own permission prompt, if any, on the first
// `getPublicKey()`/`signEvent()` call this file already makes, at exactly
// the moment a person clicked "Distribute Publication." No new UI, no new
// lifecycle state, mirroring `arweave/ArweaveInjectedProviderSigner.js`'s
// own identical restraint.
//
// THE SIGNED EVENT'S `id`/`sig` ARE NEVER COMPUTED BY THIS FILE. NIP-07's
// own `signEvent(event)` is defined to return the COMPLETE event —
// `id`/`pubkey`/`sig` populated by the extension — so this file computes
// no NIP-01 serialization, no event-id hash, and performs no Schnorr
// signing of any kind; it only builds the UNSIGNED `{ kind, tags, content,
// created_at, pubkey }` shape `signEvent()` expects and forwards whatever
// it resolves with, unread beyond the `id`/`sig` presence check every
// sibling file in this family already performs on its own injected
// collaborator.
//
// A RELAY'S `OK` FRAME IS THE ONLY MESSAGE THIS FILE INTERPRETS. Every
// other frame a relay might send (an `EOSE`, a `NOTICE`, an `OK` for a
// different event id, malformed JSON) is silently ignored — this file
// never subscribes, never requests, and forms no opinion about anything
// but the one acknowledgement it is waiting for. A relay that never sends
// one at all times out — a genuine transport failure, propagated as a
// rejection, never swallowed into a decline.
//
// NO EXTERNAL DEPENDENCY — plain `WebSocket`, injectable exactly like
// `application/ArweavePublicationMaterialUploader.js`'s own `fetchImpl`,
// so this file's own tests never open a real socket to a real relay.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **NIP-04/NIP-44 encryption, NIP-46 remote signing, multi-relay
//   fan-out, or relay-selection policy of any kind.** One relay, one
//   publish, exactly as `application/NostrPublicationDiscoveryPublisher.js`'s
//   own header already scopes itself.
// - **Any UI, connection button, or persisted extension state.**
// - **Any change to `application/NostrPublicationDistributionRuntimeAdapter.js`,
//   `application/NostrPublicationDiscoveryPublisher.js`, or anything else
//   under `application/`.** This file is a producer of the `publish`
//   capability those files already accept, never a rewrite of either.
export function createNostrInjectedProviderPublisher({
    injectedProvider = null,
    webSocketImpl = null,
    timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
    if (!injectedProvider || typeof injectedProvider.getPublicKey !== 'function' || typeof injectedProvider.signEvent !== 'function') {
        return undefined;
    }

    const webSocketCtor = webSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);

    // publish(relayUrl, eventTemplate) -> Promise<{ published: true, id } |
    //   { published: false, reason }>. See this file's own header for the
    //   full contract. Throws for no available WebSocket implementation, or
    //   for an injected provider that resolves signEvent() with no usable
    //   `id`/`sig` — a genuine signing/transport/relay failure (including
    //   this function's own timeout) propagates as a rejection.
    return async function publish(relayUrl, eventTemplate) {
        if (typeof webSocketCtor !== 'function') {
            throw new Error('NostrInjectedProviderPublisher: no WebSocket implementation available — pass webSocketImpl explicitly');
        }

        const pubkey = await injectedProvider.getPublicKey();
        const signedEvent = await injectedProvider.signEvent({
            kind: eventTemplate.kind,
            tags: eventTemplate.tags,
            content: eventTemplate.content,
            created_at: Math.floor(Date.now() / 1000),
            pubkey
        });

        if (!signedEvent || typeof signedEvent.id !== 'string' || signedEvent.id.length === 0 || typeof signedEvent.sig !== 'string' || signedEvent.sig.length === 0) {
            throw new Error('NostrInjectedProviderPublisher: injected provider resolved with no valid signed event');
        }

        return broadcastSignedEvent({ webSocketCtor, relayUrl, signedEvent, timeoutMs });
    };
}

// Opens exactly one WebSocket to `relayUrl`, sends `["EVENT", signedEvent]`
// once the socket is open, and resolves the first `["OK", signedEvent.id,
// ok, message?]` frame the relay sends back — see this file's own header,
// "A relay's OK frame is the only message this file interprets." Rejects
// on a socket error or on `timeoutMs` elapsing with no matching frame. The
// socket is always closed before this function's own promise settles.
function broadcastSignedEvent({ webSocketCtor, relayUrl, signedEvent, timeoutMs }) {
    return new Promise((resolve, reject) => {
        let socket;
        try {
            socket = new webSocketCtor(relayUrl);
        } catch (error) {
            reject(error);
            return;
        }

        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('NostrInjectedProviderPublisher: relay did not acknowledge the event before timing out'));
        }, timeoutMs);

        function cleanup() {
            clearTimeout(timer);
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            try {
                socket.close();
            } catch {
                // best-effort only — the socket may already be closing/closed
            }
        }

        socket.onopen = () => {
            socket.send(JSON.stringify(['EVENT', signedEvent]));
        };
        socket.onerror = () => {
            cleanup();
            reject(new Error('NostrInjectedProviderPublisher: relay connection failed'));
        };
        socket.onmessage = (messageEvent) => {
            let parsed;
            try {
                parsed = JSON.parse(messageEvent.data);
            } catch {
                return;
            }
            if (!Array.isArray(parsed) || parsed[0] !== 'OK' || parsed[1] !== signedEvent.id) {
                return;
            }
            cleanup();
            resolve(parsed[2] === true
                ? { published: true, id: signedEvent.id }
                : { published: false, reason: typeof parsed[3] === 'string' ? parsed[3] : 'relay declined the event' });
        };
    });
}

createNostrInjectedProviderPublisher.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
