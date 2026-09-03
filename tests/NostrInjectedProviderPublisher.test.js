import { readFile } from 'node:fs/promises';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { describeDecentralizedDiscoveryEnvelope, DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION } from '../core/DecentralizedDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.121 — Nostr Injected Provider Publisher.
// See docs/Roadmap.md, "0.9.121 — Publication Distribution Host Capability
// Integration," for the full milestone story.
//
//   Section A: no injectedProvider, or a malformed one — undefined, never a throw
//   Section B: a real (fake-backed) publish() signs and broadcasts, resolving on the relay's own OK
//   Section C: a relay's own definite decline resolves { published: false, reason }
//   Section D: a relay that never answers times out — a genuine failure, propagates
//   Section E: a wallet resolving with no valid signed event throws
//   Section F: FLAGSHIP — the produced publish(), handed to the real, unmodified
//              NostrPublicationDiscoveryPublisher, actually publishes an envelope
//   Section G: architectural regression — no distribution-infrastructure knowledge, no external dependency

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function fakeExtension({ idPrefix = 'a' } = {}) {
    const calls = { getPublicKey: 0, signEvent: [] };
    let counter = 0;
    return {
        calls,
        getPublicKey: async () => { calls.getPublicKey += 1; return 'fake-pubkey-hex'; },
        signEvent: async (event) => {
            calls.signEvent.push(event);
            counter += 1;
            const hexCounter = counter.toString(16);
            return { ...event, id: `${idPrefix}${hexCounter}`.padEnd(64, '0'), sig: `deadbeef${hexCounter}`.padEnd(128, '0') };
        }
    };
}

// A minimal fake WebSocket matching the subset this file's own
// broadcastSignedEvent() actually uses: a constructor taking a url,
// onopen/onmessage/onerror assignment, send(), close().
function fakeRelaySocket({ respond } = {}) {
    class FakeSocket {
        constructor(url) {
            this.url = url;
            this.sent = [];
            queueMicrotask(() => { if (this.onopen) this.onopen(); });
        }
        send(data) {
            this.sent.push(data);
            const [, eventTemplate] = JSON.parse(data);
            const frame = respond ? respond(eventTemplate) : ['OK', eventTemplate.id, true];
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(frame) }); });
        }
        close() { this.closed = true; }
    }
    return FakeSocket;
}

function erroringSocketCtor() {
    return class FakeSocket {
        constructor() {
            queueMicrotask(() => { if (this.onerror) this.onerror(new Error('boom')); });
        }
        send() {}
        close() {}
    };
}

function silentSocketCtor() {
    return class FakeSocket {
        constructor() { /* never opens, never answers — simulates a dead relay */ }
        send() {}
        close() {}
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — no injectedProvider, or a malformed one — undefined.
    // ---------------------------------------------------------------
    {
        assert(createNostrInjectedProviderPublisher({}) === undefined, '1. no injectedProvider supplied degrades to undefined');
        assert(createNostrInjectedProviderPublisher() === undefined, '2. calling with no argument at all degrades to undefined');
        assert(createNostrInjectedProviderPublisher({ injectedProvider: { getPublicKey: async () => 'x' } }) === undefined, '3. an injectedProvider missing signEvent() degrades to undefined');
        assert(createNostrInjectedProviderPublisher({ injectedProvider: { signEvent: async () => ({}) } }) === undefined, '4. an injectedProvider missing getPublicKey() degrades to undefined');

        console.log('✓ Section A: no usable injected extension degrades gracefully to undefined, never a throw');
    }

    // ---------------------------------------------------------------
    // Section B — a real (fake-backed) publish() signs and broadcasts,
    // resolving on the relay's own OK.
    // ---------------------------------------------------------------
    {
        const extension = fakeExtension();
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: fakeRelaySocket() });
        assert(typeof publish === 'function', '5. a usable injectedProvider resolves a real publish() function');

        const result = await publish('wss://relay.example', { kind: 1, tags: [['t', 'demo']], content: 'hello' });
        assert(result.published === true, '6. a relay accepting the event resolves published: true');
        assert(typeof result.id === 'string' && result.id.length > 0, '7. the resolved id came from the extension\'s own signEvent()');
        assert(extension.calls.getPublicKey === 1, '8. getPublicKey() is called exactly once per publish()');
        assert(extension.calls.signEvent.length === 1, '9. signEvent() is called exactly once per publish()');
        assert(extension.calls.signEvent[0].pubkey === 'fake-pubkey-hex', '10. the unsigned event carries the pubkey getPublicKey() resolved');
        assert(extension.calls.signEvent[0].kind === 1 && extension.calls.signEvent[0].content === 'hello', '11. kind/content/tags are forwarded verbatim from eventTemplate');
        assert(typeof extension.calls.signEvent[0].id === 'undefined' && typeof extension.calls.signEvent[0].sig === 'undefined', '12. the unsigned event carries no id/sig of this file\'s own making — the extension computes both');

        console.log('✓ Section B: a fake host extension signs and a fake relay acknowledges — publish() resolves published: true');
    }

    // ---------------------------------------------------------------
    // Section C — a relay's own definite decline resolves
    // { published: false, reason }.
    // ---------------------------------------------------------------
    {
        const extension = fakeExtension();
        const decliningSocket = fakeRelaySocket({ respond: (event) => ['OK', event.id, false, 'rate-limited'] });
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: decliningSocket });

        const result = await publish('wss://relay.example', { kind: 1, tags: [], content: 'declined' });
        assert(result.published === false && result.reason === 'rate-limited', '13. a relay\'s own OK-false frame resolves published: false with the relay\'s own reason');

        console.log('✓ Section C: a relay\'s own definite decline resolves published: false, never a throw');
    }

    // ---------------------------------------------------------------
    // Section D — a relay that never answers times out; a connection
    // error also propagates.
    // ---------------------------------------------------------------
    {
        const extension = fakeExtension();
        const publishSilent = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: silentSocketCtor(), timeoutMs: 50 });
        await publishSilent('wss://relay.example', { kind: 1, tags: [], content: 'never answered' }).then(
            () => assert(false, '14. a relay that never answers should have timed out'),
            (error) => assert(/timing out/.test(error.message), '14. a relay that never answers times out with a clear error')
        );

        const publishErroring = createNostrInjectedProviderPublisher({ injectedProvider: fakeExtension(), webSocketImpl: erroringSocketCtor() });
        await publishErroring('wss://relay.example', { kind: 1, tags: [], content: 'connection fails' }).then(
            () => assert(false, '15. a failing socket connection should have propagated'),
            (error) => assert(/connection failed/.test(error.message), '15. a genuine relay connection failure propagates as a rejection')
        );

        console.log('✓ Section D: a silent relay times out, and a connection failure propagates — neither is swallowed');
    }

    // ---------------------------------------------------------------
    // Section E — a wallet resolving with no valid signed event throws.
    // ---------------------------------------------------------------
    {
        const brokenExtension = {
            getPublicKey: async () => 'pk',
            signEvent: async (event) => ({ ...event, id: '', sig: '' })
        };
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: brokenExtension, webSocketImpl: fakeRelaySocket() });

        await publish('wss://relay.example', { kind: 1, tags: [], content: 'broken' }).then(
            () => assert(false, '16. an extension resolving with no valid id/sig should have thrown'),
            (error) => assert(/no valid signed event/.test(error.message), '16. an extension violating its own contract throws rather than degrading silently')
        );

        console.log('✓ Section E: an extension resolving with no valid signed event throws, never degrades silently');
    }

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: the produced publish(), handed to the
    // real, unmodified NostrPublicationDiscoveryPublisher, actually
    // publishes an envelope.
    // ---------------------------------------------------------------
    {
        const extension = fakeExtension({ idPrefix: 'fac' });
        let capturedEventTemplate = null;
        const capturingSocket = fakeRelaySocket({
            respond: (event) => { capturedEventTemplate = event; return ['OK', event.id, true]; }
        });
        const publish = createNostrInjectedProviderPublisher({ injectedProvider: extension, webSocketImpl: capturingSocket });

        const publisher = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-flagship',
            publishImpl: publish
        });

        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
            kind: WorldEncounterKind.PUBLICATION,
            objectId: 'pub-flagship-1',
            uri: 'ar://flagship-tx'
        });

        const result = await publisher.publish(envelope);
        assert(result !== null && result.published === true, '17. FLAGSHIP — a real (fake-backed) host extension, adapted through this file alone, reaches the real, unmodified NostrPublicationDiscoveryPublisher and actually publishes');
        assert(result.relayUrl === 'wss://relay.example', '18. FLAGSHIP — the relay this publisher instance targeted is the one this file\'s own publish() actually opened a socket to');
        assert(capturedEventTemplate.tags.some(([name, value]) => name === 't' && value === 'forkbuild-flagship'), '19. FLAGSHIP — the discovery tag this milestone never invents reached the relay unchanged, entirely NostrPublicationDiscoveryPublisher\'s own construction');
        assert(JSON.parse(capturedEventTemplate.content).objectId === 'pub-flagship-1', '20. FLAGSHIP — the envelope\'s own JSON reached the relay\'s content field unchanged');

        console.log('✓ Section F: FLAGSHIP — a fake host extension\'s output reaches the real, unmodified NostrPublicationDiscoveryPublisher and actually publishes');
    }

    // ---------------------------------------------------------------
    // Section G — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../nostr/NostrInjectedProviderPublisher.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/PublicationDistribution|NostrPublicationDiscoveryPublisher|ArweavePublicationMaterialUploader|DecentralizedDiscoveryEnvelope/.test(codeOnly),
            '21. never imports or references any distribution-subsystem infrastructure — a pure host-capability producer');
        assert(!codeOnly.includes("from '../ui/") && !codeOnly.includes('from "../ui/'), '22. no UI import of any kind');
        assert(!codeOnly.includes('localStorage'), '23. no persistence of any kind');
        assert(!/\bimport\s/.test(codeOnly), '24. no import statement at all — zero external or internal dependencies');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '25. exports exactly one public function');
        assert(!/privateKey|mnemonic|\bseed\b|walletPassword/i.test(codeOnly), '26. never reads or derives a private key, mnemonic, seed, or wallet password');

        console.log('✓ Section G: architectural regression — a pure host-capability producer, no distribution knowledge, no dependency of any kind');
    }

    console.log('\nAll NostrInjectedProviderPublisher tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
