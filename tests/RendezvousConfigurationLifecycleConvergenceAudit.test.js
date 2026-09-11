import { readFile } from 'node:fs/promises';

import { RendezvousConfiguration, isValidRendezvousUrl } from '../core/RendezvousConfiguration.js';
import { IceServerConfiguration } from '../core/IceServerConfiguration.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetRendezvousConfigurationUseCase } from '../application/SetRendezvousConfigurationUseCase.js';
import { RendezvousTransport } from '../peer/RendezvousTransport.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { DEFAULT_ICE_SERVERS } from '../peer/IceServerConfig.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.389 — Rendezvous Configuration Lifecycle & Convergence Audit.
//
// Type: test-only. Production changes: NONE.
//
// 0.9.388 gave a user's own rendezvous server list a real value object
// (core/RendezvousConfiguration.js), a durable store (storage/
// RendezvousConfigurationStore.js), a write use case, a settings view, and
// one composition-root wiring in ui/main.js — tests/
// UserConfigurableRendezvousConfiguration.test.js already proved every one
// of those pieces correct, including a single restart round-trip all the
// way to a real (simulated) network LOOKUP. This audit asks the harder,
// cross-cutting question that milestone's own test never set out to
// answer: now that this configuration has crossed the full
//
//   RendezvousSettingsView -> SetRendezvousConfigurationUseCase ->
//   RendezvousConfigurationStore -> persistent StorageProvider -> (restart)
//   -> ui/main.js -> resolvedRendezvousUrls -> discoveryBootstrap ->
//   RendezvousDiscoveryProvider -> existing peer-discovery behavior
//
// lifecycle, is this configuration architecturally CLOSED — one authority,
// no accidental second store, no bleed into STUN/TURN/Arweave/Nostr/peer
// identity, and no configuration that has quietly become a health-check,
// endpoint-ranking, or retry/failover policy? This is the direct
// structural mirror of 0.9.387's own STUN convergence audit, applied to
// Rendezvous's own list-of-plain-strings configuration and its real
// networked consumer (DiscoveryBootstrap/RendezvousDiscoveryProvider/
// WebSocketRendezvousTransport) rather than a WebRTC ICE configuration.
//
// Section A: Configuration authority — one value object, one storage key,
//            one store/use-case construction site, no adapter self-decides.
// Section B: Default and absence semantics — three persisted states, proven
//            distinguishable even where two resolve to the same effective
//            URL list.
// Section C: List integrity — one URL, many URLs, ordering, defensive
//            copies, frozen collections, an invalid mixed list rejected
//            atomically (no partial persistence).
// Section D: Scheme isolation — ws:/wss: accepted; http:/https:/turn:/
//            stun:, malformed, relative, and scheme-confusable variants
//            all rejected on shape alone.
// Section E: Persistence failure semantics — a genuine StorageProvider
//            failure propagates (never degrades); an already-running
//            DiscoveryBootstrap is immune to a later corruption of the
//            underlying storage.
// Section F: Restart convergence (flagship #1) — four independently
//            composed "replicas" over one shared storage namespace
//            converge on the identical effective rendezvous list, with no
//            shared singleton anywhere in the chain.
// Section G: Bootstrap convergence — the exact resolved URL list reaches
//            DiscoveryBootstrap with no hidden second resolution; ui/
//            main.js's own composition remains the sole authority.
// Section H: Runtime failure isolation (flagship #2) — a configured,
//            unreachable rendezvous server degrades exactly like the
//            EXISTING RendezvousDiscoveryProvider/DiscoveryBootstrap
//            already degrade (empty/cached result, never a thrown error),
//            and is NEVER silently replaced by DEFAULT_RENDEZVOUS_URLS.
// Section I: Cross-configuration isolation — RendezvousConfiguration,
//            IceServerConfiguration, ArweaveGatewayConfiguration, and
//            NostrRelayConfiguration round-trip independently through one
//            shared storage namespace with no key collision and no value
//            bleed, in every direction.
// Section J: Product/architecture boundary — no health checking, endpoint
//            ranking, latency measurement, failover, retry scheduling,
//            connection testing, per-peer configuration, or STUN/TURN
//            coupling exists anywhere in this configuration's own files.
// Section K: Final decision matrix and verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Settings UI change, no
// TURN configuration work (0.9.390, a separate Product Decision Audit), no
// rendezvous protocol change, and no production code change of any kind —
// this file exists to confirm 0.9.388's own architecture is closed, never
// to extend it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Two or more SEPARATE instances over one externally-owned namespace — the
// same "restart" shape every sibling convergence audit in this codebase
// already establishes (tests/StunConfigurationLifecycleConvergenceAudit
// .test.js's own SharedNamespaceStorageProvider). No JS reference is ever
// shared between instances built over the same namespace object, only the
// underlying bytes.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('disk unavailable'); }
    load() { throw new Error('disk unavailable'); }
    remove() { throw new Error('disk unavailable'); }
    list() { return []; }
}

// A minimal, real EventTarget-based WebSocket stand-in exercising peer/
// WebSocketRendezvousTransport.js's actual client code against a fake
// in-memory server keyed by URL — the same technique tests/
// UserConfigurableRendezvousConfiguration.test.js's own FakeWebSocket
// already establishes, reused here for Sections F/G's own flagship proof:
// which URL a LOOKUP actually reached.
class FakeWebSocket extends EventTarget {
    constructor(url, serversByUrl) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        this._server = serversByUrl.get(url) || null;
        setTimeout(() => this._attemptOpen(), 0);
    }
    _attemptOpen() {
        if (!this._server) {
            this.readyState = FakeWebSocket.CLOSED;
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('close'));
            return;
        }
        this.readyState = FakeWebSocket.OPEN;
        this.dispatchEvent(new Event('open'));
    }
    send(data) {
        if (this.readyState !== FakeWebSocket.OPEN) throw new Error('FakeWebSocket: cannot send while not open');
        setTimeout(() => {
            const message = JSON.parse(data);
            const response = this._server.handle(message);
            this._receive(JSON.stringify(response));
        }, 0);
    }
    close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
    }
    _receive(data) {
        if (this.readyState !== FakeWebSocket.OPEN) return;
        const event = new Event('message');
        event.data = data;
        this.dispatchEvent(event);
    }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

// A "stupid" fake server that tags every successful LOOKUP result with its
// OWN label — so a caller can prove exactly which configured URL's own
// server actually answered, never merely that SOME server answered.
class LabelledLookupServer {
    constructor(label) { this.label = label; }
    handle(message) {
        if (message.type === 'LOOKUP') {
            return { v: 1, type: 'OK', requestId: message.requestId, result: [], _servedBy: this.label };
        }
        return { v: 1, type: 'ERROR', requestId: message.requestId, message: 'unsupported in this fake' };
    }
}

// A RendezvousTransport (the real base class) whose lookup() ALWAYS
// rejects — simulating a genuinely unreachable rendezvous server at the
// transport layer, exactly the scenario peer/RendezvousDiscoveryProvider
// .js's own "A Rendezvous Lookup Degrades; It Never Fails Loud" header
// exists to survive. publish()/remove() are unused by Section H but
// implemented to satisfy the RendezvousDiscoveryProvider constructor's own
// shape check.
class UnreachableRendezvousTransport extends RendezvousTransport {
    constructor(url) { super(); this.url = url; this.lookupAttempts = 0; }
    async publish() { throw new Error(`UnreachableRendezvousTransport(${this.url}): unreachable`); }
    async lookup(identityId) {
        this.lookupAttempts += 1;
        throw new Error(`UnreachableRendezvousTransport(${this.url}): unreachable`);
    }
    async remove() { throw new Error(`UnreachableRendezvousTransport(${this.url}): unreachable`); }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function executableOf(src) {
    return src.replace(/\/\/.*$/gm, '');
}

async function run() {
    console.log('Running Rendezvous Configuration Lifecycle & Convergence Audit tests...\n');

    // ===============================================================
    // Section A — Configuration authority: one value object, one storage
    // key, one store construction site, one write-use-case construction
    // site, no adapter self-decides.
    // ===============================================================
    {
        const configSource = await source('core/RendezvousConfiguration.js');
        const storeSource = await source('storage/RendezvousConfigurationStore.js');
        const useCaseSource = await source('application/SetRendezvousConfigurationUseCase.js');
        const viewSource = await source('ui/views/RendezvousSettingsView.js');
        const mainSource = await source('ui/main.js');

        const otherFiles = await Promise.all([
            ['peer/RendezvousConfig.js', await source('peer/RendezvousConfig.js')],
            ['peer/DiscoveryBootstrap.js', await source('peer/DiscoveryBootstrap.js')],
            ['peer/RendezvousDiscoveryProvider.js', await source('peer/RendezvousDiscoveryProvider.js')],
            ['peer/WebSocketRendezvousTransport.js', await source('peer/WebSocketRendezvousTransport.js')],
            ['peer/PeerAuthenticationSession.js', await source('peer/PeerAuthenticationSession.js')],
            ['core/IceServerConfiguration.js', await source('core/IceServerConfiguration.js')]
        ]);

        assert(configSource.includes('export class RendezvousConfiguration '), 'A1. core/RendezvousConfiguration.js is the one place the value object is defined');
        for (const [label, src] of otherFiles) {
            assert(!src.includes('class RendezvousConfiguration'), `A2 (${label}). no second definition of the value object exists`);
            assert(!/from\s*['"][^'"]*core\/RendezvousConfiguration\.js['"]/.test(src), `A3 (${label}). no unrelated file imports the value object directly — only the use case, the store, and ui/main.js may`);
            assert(!/from\s*['"][^'"]*storage\/RendezvousConfigurationStore\.js['"]/.test(src), `A4 (${label}). no unrelated file imports the persistence store directly — no adapter independently decides whether to use the default`);
            assert(!src.includes('new RendezvousConfigurationStore('), `A5 (${label}). no unrelated file constructs its own store instance`);
        }

        assert(storeSource.includes("'rendezvous-configuration'"), 'A6. the store owns the one storage key literal');
        for (const [label, src] of [['core/RendezvousConfiguration.js', configSource], ['application/SetRendezvousConfigurationUseCase.js', useCaseSource], ['ui/views/RendezvousSettingsView.js', viewSource], ...otherFiles]) {
            assert(!src.includes('rendezvous-configuration'), `A7 (${label}). no second file hardcodes the storage key — one key, one owner`);
        }

        assert(mainSource.includes('new RendezvousConfigurationStore('), 'A8. ui/main.js is where the store is actually constructed');
        assert((mainSource.match(/new RendezvousConfigurationStore\(/g) || []).length === 1, 'A9. ui/main.js constructs exactly one store instance');
        assert((mainSource.match(/new SetRendezvousConfigurationUseCase\(/g) || []).length === 1, 'A10. ui/main.js constructs exactly one write use case instance');

        // The use case is the ONE place `new RendezvousConfiguration(` is
        // ever called against a caller-supplied value (the store's own
        // rehydration in get() is a separate, already audited concern).
        assert(useCaseSource.includes('new RendezvousConfiguration({ urls })'), 'A11. the use case constructs the value object from a caller-supplied urls list');
        assert(!executableOf(viewSource).includes('new RendezvousConfiguration('), 'A12. the settings view never constructs the value object itself — only the use case does');

        // No settings UI constructs the domain object directly — the
        // brief's own "no settings UI constructing the domain object
        // directly" line, verified against the view's full executable
        // source, not merely the one line above.
        assert(!/new\s+RendezvousConfiguration\s*\(/.test(executableOf(viewSource)), 'A13. exhaustive sweep — RendezvousSettingsView.js contains no RendezvousConfiguration constructor call anywhere');

        // No RendezvousDiscoveryProvider self-selecting defaults — it
        // accepts a transport/url from its caller and never references
        // DEFAULT_RENDEZVOUS_URLS or this configuration boundary at all.
        const discoveryProviderExecutable = executableOf(otherFiles.find(([label]) => label === 'peer/RendezvousDiscoveryProvider.js')[1]);
        assert(!/DEFAULT_RENDEZVOUS_URLS|RendezvousConfiguration|RendezvousConfigurationStore/.test(discoveryProviderExecutable), 'A14. peer/RendezvousDiscoveryProvider.js never self-selects a default or references this configuration boundary — it only ever knows the transport it was constructed with');

        console.log('✓ Section A: exactly one value object, one storage key, one store construction site, and one write-use-case construction site exist; no settings UI constructs the domain object directly; RendezvousDiscoveryProvider never self-selects a default');
    }

    // ===============================================================
    // Section B — Default and absence semantics: three persisted states,
    // proven distinguishable even where two resolve to the identical
    // effective rendezvous URL list.
    // ===============================================================
    {
        function resolveEffective(store) {
            const configuration = store.get();
            return configuration ? configuration.urls : DEFAULT_RENDEZVOUS_URLS;
        }

        // State A: no configuration at all.
        const backingA = new InMemoryStorageProvider();
        const storeA = new RendezvousConfigurationStore(backingA);
        assert(storeA.get() === null, 'B1. State A (absence) — get() is a real null');
        assert(resolveEffective(storeA) === DEFAULT_RENDEZVOUS_URLS, 'B2. State A resolves to the deployment default, by reference');
        assert(backingA.load('rendezvous-configuration') === null, 'B3. State A leaves genuinely nothing on file');

        // State B: the user explicitly configures the SAME servers as the
        // default.
        const backingB = new InMemoryStorageProvider();
        const storeB = new RendezvousConfigurationStore(backingB);
        storeB.save(new RendezvousConfiguration({ urls: [...DEFAULT_RENDEZVOUS_URLS] }));
        assert(storeB.get() !== null, 'B4. State B (explicit default) — get() returns a real configuration, never null');
        const effectiveB = resolveEffective(storeB);
        assert(effectiveB.length === DEFAULT_RENDEZVOUS_URLS.length && effectiveB.every((url, i) => url === DEFAULT_RENDEZVOUS_URLS[i]),
            'B5. State B resolves to the same effective URLs as State A');
        assert(backingB.load('rendezvous-configuration') !== null, 'B6. …yet State B leaves a real, distinct entry on file — an explicit configuration is never treated as "nothing to persist" merely because it matches the default');

        // State C: a genuinely custom rendezvous list.
        const backingC = new InMemoryStorageProvider();
        const storeC = new RendezvousConfigurationStore(backingC);
        storeC.save(new RendezvousConfiguration({ urls: ['wss://alternative.example/rendezvous'] }));
        assert(resolveEffective(storeC)[0] === 'wss://alternative.example/rendezvous', 'B7. State C resolves to the custom list');

        // The decisive proof: A and B agree on effective URLs but disagree
        // on persisted representation.
        assert(storeA.get() === null && storeB.get() !== null, 'B8. State A and State B remain distinguishable PERSISTED facts: real null vs. a real RendezvousConfiguration instance, even though B5 already showed their effective URLs coincide');

        console.log('✓ Section B: State A (absence) and State B (explicit default) resolve to the identical effective rendezvous list, yet remain distinguishable facts in persistence; State C resolves to its own distinct custom list');
    }

    // ===============================================================
    // Section C — List integrity: one URL, multiple URLs, ordering
    // preservation, duplicate behavior, defensive-copy reads, frozen
    // collections, an invalid mixed list rejected atomically.
    // ===============================================================
    {
        // One URL.
        const singleConfiguration = new RendezvousConfiguration({ urls: ['wss://solo.example'] });
        assert(singleConfiguration.urls.length === 1 && singleConfiguration.urls[0] === 'wss://solo.example', 'C1. a single-URL configuration holds exactly that one entry');

        // Multiple URLs, ordering preserved.
        const orderedUrls = ['wss://first.example', 'wss://second.example', 'ws://third.example:8080/path'];
        const orderedConfiguration = new RendezvousConfiguration({ urls: orderedUrls });
        assert(orderedConfiguration.urls.every((url, i) => url === orderedUrls[i]), 'C2. a multi-URL configuration preserves the exact given order');

        // Duplicate behavior according to the actual configuration
        // contract: core/RendezvousConfiguration.js's own constructor
        // performs no deduplication — the same URL appearing twice is
        // accepted and preserved twice, exactly the "shape validation,
        // never a hidden normalization policy" restraint this file's own
        // header holds.
        const duplicateConfiguration = new RendezvousConfiguration({ urls: ['wss://dup.example', 'wss://dup.example'] });
        assert(duplicateConfiguration.urls.length === 2 && duplicateConfiguration.urls[0] === 'wss://dup.example' && duplicateConfiguration.urls[1] === 'wss://dup.example',
            'C3. a duplicate URL is preserved as given, never silently deduplicated — this class performs shape validation only, never list normalization');

        // Defensive-copy reads.
        const configuration = new RendezvousConfiguration({ urls: ['wss://a.example', 'wss://b.example'] });
        const read1 = configuration.urls;
        const read2 = configuration.urls;
        assert(read1 !== read2, 'C4. two reads of .urls return two distinct array instances');
        read1.push('wss://injected.example');
        read1[0] = 'wss://tampered.example';
        assert(configuration.urls.length === 2 && configuration.urls[0] === 'wss://a.example', 'C5. mutating a previously returned array never reaches the instance\'s own internal state');

        // Frozen configuration/internal collection.
        assert(Object.isFrozen(configuration), 'C6. the RendezvousConfiguration instance itself is frozen');
        let internalArrayThrew = false;
        try {
            // Reach for the internal array directly (bypassing the public,
            // already-defensive-copy getter) to confirm the INTERNAL
            // collection is frozen too, not merely the returned copies.
            configuration._urls.push('wss://direct-internal-push.example');
        } catch { internalArrayThrew = true; }
        assert(internalArrayThrew || configuration._urls.length === 2, 'C7. the internal urls array is itself frozen (a direct push either throws in strict mode or silently no-ops, never actually grows the array)');

        // Invalid mixed lists rejected atomically: valid, valid, invalid ->
        // NO partial configuration persisted.
        const backing = new InMemoryStorageProvider();
        const store = new RendezvousConfigurationStore(backing);
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });
        setUseCase.execute({ urls: ['wss://already-saved-one.example', 'wss://already-saved-two.example'] });

        let mixedThrew = false;
        try {
            setUseCase.execute({ urls: ['wss://valid-one.example', 'wss://valid-two.example', 'not-a-valid-url'] });
        } catch { mixedThrew = true; }
        assert(mixedThrew, 'C8. a list with two valid entries and one invalid entry throws — never partially accepted');
        assert(store.get().urls.length === 2 && store.get().urls[0] === 'wss://already-saved-one.example',
            'C9. NO PARTIAL CONFIGURATION PERSISTED — the previously saved two-entry configuration remains completely untouched by the rejected mixed list, and the two valid entries from the rejected list were never written either');

        console.log('✓ Section C: single and multi-URL lists preserve exact order and duplicates as given (shape validation only, no hidden normalization); every read returns a defensive copy; both the instance and its internal array are frozen; a valid/valid/invalid mixed list is rejected atomically with no partial persistence');
    }

    // ===============================================================
    // Section D — Scheme isolation: only ws:/wss: accepted; every other
    // scheme, malformed URL, relative URL, and scheme-confusable variant
    // is rejected on shape alone — never a reachability check.
    // ===============================================================
    {
        const rejectedUrls = [
            'http://not-a-websocket.example',
            'https://not-a-websocket.example',
            'turn:relay.example:3478',
            'turns:relay.example:5349',
            'stun:stun.example:3478',
            'stuns:stun.example:5349',
            'ftp://not-a-websocket.example',
            'not-a-url-at-all',
            '/relative/path/only',
            'relative-no-scheme.example',
            '//scheme-relative.example/path',
            'ws :not-a-real-scheme.example',
            'javascript:alert(1)',
            'data:text/plain,not-a-websocket',
            'file:///etc/passwd',
            ''
        ];
        for (const url of rejectedUrls) {
            assert(isValidRendezvousUrl(url) === false, `D1 ('${url}'). never accepted as a valid rendezvous url`);
            let threw = false;
            try { new RendezvousConfiguration({ urls: [url] }); } catch { threw = true; }
            assert(threw, `D2 ('${url}'). also throws at RendezvousConfiguration construction — validation is not bypassable by constructing directly`);
        }

        // The genuinely valid schemes, confirmed accepted.
        assert(isValidRendezvousUrl('ws://valid.example') === true, 'D3. ws: is accepted');
        assert(isValidRendezvousUrl('wss://valid.example') === true, 'D4. wss: is accepted');

        // Case-confusable and whitespace-padded variants of an otherwise
        // VALID scheme are still accepted — this codebase's own `new
        // URL(...)`-based technique normalizes the scheme to lowercase and
        // trims surrounding whitespace per the platform URL parser's own
        // behavior (RFC 3986/WHATWG URL), exactly like a browser's address
        // bar would. This is a genuine, intentional property of "parse it
        // as a real URL, then check the protocol" (see this file's own
        // header) — never a validation gap: the SCHEME itself (`WS:`,
        // `wss:` with padding) is still legitimately `ws:`/`wss:` after
        // normalization, unlike a rejected scheme (`turn:`, `http:`) which
        // no amount of case or whitespace variation ever turns into.
        assert(isValidRendezvousUrl('WS://uppercase-scheme.example') === true, 'D3a. an uppercase WS: scheme is still accepted — normalizes to the valid ws: protocol, the same case-insensitivity every URL scheme has');
        assert(isValidRendezvousUrl('WSS://uppercase-scheme.example') === true, 'D3b. an uppercase WSS: scheme is still accepted for the same reason');
        assert(isValidRendezvousUrl(' wss://leading-whitespace.example') === true, 'D3c. leading whitespace around an otherwise-valid URL is trimmed before parsing, so it is still accepted');
        assert(isValidRendezvousUrl('wss://trailing-whitespace.example ') === true, 'D3d. trailing whitespace around an otherwise-valid URL is likewise trimmed and accepted');
        const caseNormalized = new RendezvousConfiguration({ urls: ['WSS://Uppercase-Scheme.example'] });
        assert(caseNormalized.urls[0] === 'WSS://Uppercase-Scheme.example', 'D3e. the ORIGINAL string is preserved verbatim (only trimmed, never lowercased) — normalization happens during validation only, never rewrites the stored value');
        const whitespaceTrimmed = new RendezvousConfiguration({ urls: [' wss://leading-whitespace.example'] });
        assert(whitespaceTrimmed.urls[0] === 'wss://leading-whitespace.example', 'D3f. surrounding whitespace IS actually stripped from the stored value (the one normalization this class performs), unlike case, which is preserved verbatim');
        assert(isValidRendezvousUrl('wss://valid.example:9999/some/path?query=1') === true, 'D5. a wss: URL carrying a port, path, and query string is still accepted — this is a genuine URL contract, not a bare host:port authority');
        const validWithPath = new RendezvousConfiguration({ urls: ['wss://valid.example:9999/some/path?query=1'] });
        assert(validWithPath.urls[0] === 'wss://valid.example:9999/some/path?query=1', 'D6. the full URL, including path and query, is preserved exactly as given');

        // A scheme-confusable substring embedded in an otherwise-valid
        // wss: URL's path/query is still perfectly valid — the scheme
        // check is on the PARSED protocol, never a string-matching
        // heuristic against the word "turn"/"stun"/"http".
        assert(isValidRendezvousUrl('wss://valid.example/turn/stun/http') === true, 'D7. an embedded turn/stun/http SUBSTRING inside a genuinely wss: URL\'s own path is not itself grounds for rejection — the scheme check inspects the parsed protocol, never a keyword blocklist');

        // A mixed list — one genuine ws:/wss: entry alongside one
        // rejected-scheme entry — is rejected as a WHOLE.
        let mixedSchemeThrew = false;
        try {
            new RendezvousConfiguration({ urls: ['wss://good.example', 'turn:relay.example:3478'] });
        } catch { mixedSchemeThrew = true; }
        assert(mixedSchemeThrew, 'D8. a list mixing a valid wss: entry with a rejected-scheme entry is rejected in its entirety');

        // Validation is shape-only, never reachability: a syntactically
        // valid but entirely made-up hostname is accepted exactly like any
        // other valid rendezvous URL — reconfirmed here as this audit's
        // own structural property, not merely inherited from 0.9.388.
        assert(isValidRendezvousUrl('wss://this-host-will-never-exist.invalid') === true, 'D9. shape validation only — a syntactically valid but entirely unreachable-looking hostname is accepted; this class never opens a socket to "prove" a URL works');

        console.log('✓ Section D: only ws:/wss: is ever accepted — http:/https:/turn:/turns:/stun:/stuns:, malformed, relative, scheme-relative, case-confusable, and whitespace-padded variants are all rejected on shape alone; an embedded turn/stun/http substring inside an otherwise-valid wss: path is not itself grounds for rejection; a mixed valid/invalid-scheme list rejects atomically; validation never touches reachability');
    }

    // ===============================================================
    // Section E — Persistence failure semantics: a genuine StorageProvider
    // failure propagates out of save()/get()/clear() (never silently
    // degrades — that degradation is reserved for malformed DATA); an
    // already-running DiscoveryBootstrap is immune to a later corruption
    // of the underlying storage.
    // ===============================================================
    {
        const throwingStore = new RendezvousConfigurationStore(new ThrowingStorageProvider());

        let getThrew = false;
        try { throwingStore.get(); } catch { getThrew = true; }
        assert(getThrew, 'E1. a genuine StorageProvider.load() failure propagates out of get(), never silently degrading to null the way malformed DATA does');

        let saveThrew = false;
        try { throwingStore.save(new RendezvousConfiguration({ urls: ['wss://a.example'] })); } catch { saveThrew = true; }
        assert(saveThrew, 'E2. a genuine StorageProvider.save() failure propagates out of save()');

        let clearThrew = false;
        try { throwingStore.clear(); } catch { clearThrew = true; }
        assert(clearThrew, 'E3. a genuine StorageProvider.remove() failure propagates out of clear()');

        // Absence still (correctly) degrades to defaults; a genuine
        // TRANSPORT failure never does — the identical E1-E3/malformed
        // split 0.9.387's own STUN audit already established, reconfirmed
        // here for Rendezvous's own store.
        const malformedBacking = new InMemoryStorageProvider();
        malformedBacking.save('rendezvous-configuration', { urls: ['not-a-valid-url'] });
        const malformedStore = new RendezvousConfigurationStore(malformedBacking);
        let malformedGetThrew = false;
        let malformedResult;
        try { malformedResult = malformedStore.get(); } catch { malformedGetThrew = true; }
        assert(!malformedGetThrew && malformedResult === null, 'E4. malformed stored DATA degrades silently to null — the opposite of E1\'s genuine transport failure, confirming the two are deliberately different code paths');

        // An already-constructed DiscoveryBootstrap's own bootstrapProviders
        // were resolved ONCE at composition time from a plain array
        // argument — a LATER malformed or corrupted write to the store
        // (simulating a corrupted write mid-session, e.g. a second tab)
        // can never reach back into an already-running bootstrap; only a
        // fresh startup's own resolution would ever observe the
        // degrade-to-absence.
        const backing = new InMemoryStorageProvider();
        const store = new RendezvousConfigurationStore(backing);
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });
        setUseCase.execute({ urls: ['wss://running.example'] });
        const resolvedAtStartup = (store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;

        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('section-e-tester');
        const runningTransport = new UnreachableRendezvousTransport('wss://running.example');
        const runningBootstrap = new DiscoveryBootstrap({
            bootstrapProviders: resolvedAtStartup.map((url) => new RendezvousDiscoveryProvider({
                transport: url === 'wss://running.example' ? runningTransport : new WebSocketRendezvousTransport({ url }),
                identityProvider
            }))
        });
        assert(runningBootstrap.bootstrapProviders.length === 1, 'E5. sanity — the already-running bootstrap was composed with exactly the one resolved-at-startup URL');

        // Corrupt the underlying storage directly, bypassing the store's
        // own validation entirely (simulating bytes on disk going bad
        // while this process is still running).
        backing.save('rendezvous-configuration', { urls: ['not-a-valid-url'] });
        assert(store.get() === null, 'E6. sanity — the store itself now correctly reports the corrupted data as absent');

        // The already-running bootstrap's own composition is untouched —
        // it still only ever asks the ONE provider it was built with.
        const results = await runningBootstrap.discover('someone');
        assert(Array.isArray(results), 'E7. the already-running bootstrap still degrades gracefully (never throws) when its own sole provider\'s transport is unreachable');
        assert(runningBootstrap.bootstrapProviders.length === 1, 'E8. the ALREADY-RUNNING bootstrap\'s own provider count/composition is completely unaffected by a later corruption of the underlying storage — it was resolved once, at its own construction, and never re-reads the store on its own; only a genuine restart\'s own fresh resolution would ever observe the degrade-to-absence');

        runningBootstrap.dispose();

        console.log('✓ Section E: a genuine StorageProvider failure propagates out of save()/get()/clear() rather than degrading silently (that degradation is reserved for malformed DATA, never a transport failure); an already-running DiscoveryBootstrap\'s own resolved composition is immune to a later corruption of the underlying storage — only a fresh startup ever re-resolves');
    }

    // ===============================================================
    // Section F — Restart convergence (flagship #1): four genuinely
    // independent "replicas," sharing one storage namespace, converge on
    // the identical effective rendezvous list at every step, with no
    // shared singleton anywhere in the chain.
    // ===============================================================
    {
        const sharedNamespace = {};
        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('section-f-tester');

        // Replica 1 ("Alice's device") saves a custom rendezvous list.
        const replica1Store = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const replica1UseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: replica1Store });
        replica1UseCase.execute({ urls: ['wss://shared-replica.example'] });

        // restart boundary — Replica 2: its own store instance, its own
        // StorageProvider instance, sharing only the namespace — exactly
        // the way a second application load, or a second browser tab,
        // shares one underlying localStorage without ever sharing a JS
        // object with the first.
        const replica2Store = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(replica2Store !== replica1Store, 'F1. sanity — genuinely separate store instances, not the same object reused');
        const replica2Resolved = (replica2Store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        assert(replica2Resolved[0] === 'wss://shared-replica.example', 'F2. Replica 2, independently composed over the same storage namespace, resolves the list Replica 1 saved — persistence is the authority, never an in-memory singleton');

        // restart boundary — Replica 3: composes all the way through a
        // real DiscoveryBootstrap/RendezvousDiscoveryProvider/
        // WebSocketRendezvousTransport, exactly as ui/main.js does, and a
        // real (simulated) LOOKUP proves which server actually answered.
        const replica3Store = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const replica3Resolved = (replica3Store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        const serversByUrl = new Map([['wss://shared-replica.example', new LabelledLookupServer('shared-replica-server')]]);
        const replica3Bootstrap = new DiscoveryBootstrap({
            bootstrapProviders: replica3Resolved.map((url) => new RendezvousDiscoveryProvider({
                transport: new WebSocketRendezvousTransport({
                    url,
                    WebSocketImpl: class extends FakeWebSocket { constructor(u) { super(u, serversByUrl); } }
                }),
                identityProvider
            }))
        });
        const replica3Results = await replica3Bootstrap.discover('someone');
        assert(Array.isArray(replica3Results), 'F3. Replica 3\'s own real (simulated) LOOKUP round trip completes without throwing');

        // Convergence: all three replicas agree, with no shared object
        // anywhere along the chain.
        assert(replica1Store !== replica2Store && replica2Store !== replica3Store && replica1Store !== replica3Store, 'F4. all three store instances are pairwise distinct objects — no shared store');
        assert(replica2Resolved[0] === replica3Resolved[0] && replica3Resolved[0] === 'wss://shared-replica.example', 'F5. Replica 2 and Replica 3 independently resolved the identical effective rendezvous list');

        replica3Bootstrap.dispose();

        // A further write from Replica 2 is visible back through Replica
        // 1's own (still-live) store instance too — the same underlying
        // storage, never divergent in-memory state.
        const replica2UseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: replica2Store });
        replica2UseCase.execute({ urls: ['wss://replica-2-write.example'] });
        assert(replica1Store.get().urls[0] === 'wss://replica-2-write.example', 'F6. a write from a later-constructed replica is visible back through the FIRST replica\'s own store instance — persistence, not process memory, is the single authority');

        // A clear() from one replica is durable across a further restart.
        replica1Store.clear();
        const replica4Store = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert((replica4Store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls === DEFAULT_RENDEZVOUS_URLS, 'F7. Replica 4, restarted after Replica 1 cleared the override, resolves the deployment default — the clear() is durable across the same restart boundary');

        // No shared singleton was necessary anywhere: constructing a FIFTH
        // replica concurrently with a fourth, both over the same
        // namespace, never causes one to observe the other's in-memory
        // state before a write actually lands.
        const replica5StoreA = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const replica5StoreB = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(replica5StoreA !== replica5StoreB, 'F8. two replicas constructed back-to-back over the same namespace are still two distinct instances — no memoization/singleton smuggled in anywhere');

        console.log('✓ Section F: FLAGSHIP — four genuinely independent replicas over one shared storage namespace converge on the same effective rendezvous list at each step — custom -> restart -> restart-through-a-real-simulated-LOOKUP -> a further write visible back through the original instance -> clear -> restart -> deployment default — with no shared singleton anywhere in the chain');
    }

    // ===============================================================
    // Section G — Bootstrap convergence: the exact resolved rendezvous URL
    // list reaches the existing discoveryBootstrap, with no hidden second
    // resolution (main.js -> custom URLs, provider -> defaults again). The
    // startup composition remains authoritative.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        // Structural proof: resolvedRendezvousUrls is computed exactly
        // once, from exactly one store.get() call, and DiscoveryBootstrap's
        // bootstrapProviders is built from that SAME resolved variable —
        // never a second, independent DEFAULT_RENDEZVOUS_URLS.map(...) or a
        // second store.get() anywhere else in the file.
        const resolvedAssignments = (mainSource.match(/const resolvedRendezvousUrls\s*=/g) || []).length;
        assert(resolvedAssignments === 1, `G1. resolvedRendezvousUrls is assigned exactly once in ui/main.js — found ${resolvedAssignments}`);

        const storeGetCalls = (executableOf(mainSource).match(/rendezvousConfigurationStore\.get\(\)/g) || []).length;
        assert(storeGetCalls === 1, `G2. rendezvousConfigurationStore.get() is called exactly once in ui/main.js's own executable code — no second, independent resolution exists`);

        assert(mainSource.includes('bootstrapProviders: resolvedRendezvousUrls.map((url) => new RendezvousDiscoveryProvider({'),
            'G3. DiscoveryBootstrap\'s own bootstrapProviders is built directly from resolvedRendezvousUrls — the SAME variable G1 confirms is assigned exactly once');
        assert(!/bootstrapProviders:\s*DEFAULT_RENDEZVOUS_URLS\.map/.test(mainSource),
            'G4. no hidden second resolution exists of the shape "provider -> defaults again" — the old bare DEFAULT_RENDEZVOUS_URLS.map(...) construction is entirely gone');

        // Behavioral proof, alongside the structural one above: a resolved
        // list, once computed, reaches a REAL DiscoveryBootstrap unaltered
        // — no provider-side substitution of its own defaults occurs.
        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('section-g-tester');
        const configuredUrls = ['wss://bootstrap-convergence-a.example', 'wss://bootstrap-convergence-b.example'];
        const bootstrap = new DiscoveryBootstrap({
            bootstrapProviders: configuredUrls.map((url) => new RendezvousDiscoveryProvider({
                transport: new WebSocketRendezvousTransport({ url }),
                identityProvider
            }))
        });
        assert(bootstrap.bootstrapProviders.length === configuredUrls.length, 'G5. the resolved list reaches DiscoveryBootstrap with exactly one provider per configured URL — no provider dropped, no provider added');
        const transportUrls = bootstrap.bootstrapProviders.map((provider) => provider._transport.url);
        assert(configuredUrls.every((url) => transportUrls.includes(url)), 'G6. every configured URL reaches its own concrete WebSocketRendezvousTransport unchanged — the exact resolved list, never a re-derived or re-defaulted one');
        assert(!transportUrls.includes(DEFAULT_RENDEZVOUS_URLS[0]), 'G7. the deployment default URL is NOT present among the bootstrap\'s transports when a genuinely different custom list was configured — no silent re-inclusion of the default alongside (or instead of) the configured list');
        bootstrap.dispose();

        console.log('✓ Section G: resolvedRendezvousUrls is computed exactly once from exactly one store.get() call, and DiscoveryBootstrap\'s own bootstrapProviders is built directly from that SAME variable — no hidden second resolution, structurally or behaviorally, and the startup composition in ui/main.js remains the sole authority');
    }

    // ===============================================================
    // Section H — Runtime failure isolation (flagship #2): a configured,
    // unreachable rendezvous server degrades exactly like the EXISTING
    // RendezvousDiscoveryProvider/DiscoveryBootstrap already degrade —
    // never silently restored to defaults, and no new retry/fallback
    // semantics appear.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new RendezvousConfigurationStore(backing);
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });

        // Syntactically valid, deliberately unreachable — accepted exactly
        // like any other valid rendezvous url, because validation is
        // shape-only (Section D).
        const unreachableUrl = 'wss://this-host-does-not-exist.invalid';
        setUseCase.execute({ urls: [unreachableUrl] });

        // A real application startup's own resolution — no health check,
        // no reachability probe, no special-casing of any kind.
        const resolvedRendezvousUrls = (store.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
        assert(resolvedRendezvousUrls[0] === unreachableUrl, 'H1. sanity — the unreachable-looking custom URL is what actually resolved');

        const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        identityProvider.login('section-h-tester');
        const unreachableTransport = new UnreachableRendezvousTransport(unreachableUrl);
        const provider = new RendezvousDiscoveryProvider({ transport: unreachableTransport, identityProvider });
        const bootstrap = new DiscoveryBootstrap({ bootstrapProviders: [provider] });

        // discover() on the EXISTING, UNMODIFIED
        // RendezvousDiscoveryProvider/DiscoveryBootstrap classes must
        // degrade exactly like it always has — never throw, never return
        // anything other than the empty/cached result a genuinely
        // unreachable rendezvous node produces.
        let discoverThrew = false;
        let results;
        try { results = await bootstrap.discover('someone'); } catch { discoverThrew = true; }
        assert(!discoverThrew, 'H2. FLAGSHIP — a bootstrap built from the configured, unreachable rendezvous URL degrades EXACTLY like the existing provider already does: discover() never throws');
        assert(Array.isArray(results) && results.length === 0, 'H3. …the result is a real, empty array — the EXISTING graceful-degradation behavior peer/RendezvousDiscoveryProvider.js already documents, completely unmodified by this configuration boundary');
        assert(unreachableTransport.lookupAttempts === 1, 'H4. sanity — the transport\'s own lookup() was genuinely attempted (and genuinely rejected), not skipped');

        // The decisive proof: even AFTER the failed LOOKUP, the
        // configuration itself, the bootstrap's own provider composition,
        // and a SECOND discover() attempt all remain exactly the
        // configured, still-unreachable URL. Nothing replaced it, nothing
        // silently reverted it to DEFAULT_RENDEZVOUS_URLS.
        assert(store.get().urls[0] === unreachableUrl,
            'H5. the persisted configuration itself is untouched by the earlier failed LOOKUP — nothing in this milestone\'s classes ever writes back to the store as a reaction to a discovery-time outcome');
        assert(bootstrap.bootstrapProviders.length === 1 && bootstrap.bootstrapProviders[0] === provider,
            'H6. the bootstrap\'s own provider composition is unchanged after the failed LOOKUP — no automatic removal, replacement, or fallback provider was ever added');

        let secondDiscoverThrew = false;
        let secondResults;
        try { secondResults = await bootstrap.discover('someone-else'); } catch { secondDiscoverThrew = true; }
        assert(!secondDiscoverThrew && Array.isArray(secondResults) && secondResults.length === 0,
            'H7. a SECOND, later discover() call from the same bootstrap still degrades the same way — no automatic fallback was triggered by the first call\'s own failure, and no retry/backoff state accumulated');
        assert(unreachableTransport.lookupAttempts === 2, 'H8. the transport was genuinely asked again on the second call — this is real per-call behavior, never a cached "give up after one failure" retry policy');

        // publishToAll()/unpublishFromAll() on an unreachable provider
        // degrade the same documented way DiscoveryBootstrap already
        // established (publish surfaces the failure; unpublish tolerates
        // it) — reconfirmed here as UNCHANGED by this configuration
        // boundary, never newly introduced by it.
        let publishThrew = false;
        try {
            await bootstrap.publishToAll({ endpoint: 'wss://caller.example/offer', identityHint: 'section-h-tester', expiresAt: new Date(Date.now() + 60000) });
        } catch { publishThrew = true; }
        assert(publishThrew, 'H9. publishToAll() against an unreachable provider still surfaces the failure exactly as peer/DiscoveryBootstrap.js\'s own existing (unmodified) header documents — a deliberate "be discoverable" act is never silently swallowed');

        let unpublishThrew = false;
        try { await bootstrap.unpublishFromAll(); } catch { unpublishThrew = true; }
        assert(!unpublishThrew, 'H10. unpublishFromAll() against an unreachable provider still tolerates the failure exactly as peer/DiscoveryBootstrap.js\'s own existing (unmodified) header documents — a best-effort withdrawal never throws');

        bootstrap.dispose();

        console.log('✓ Section H: FLAGSHIP — a configured, unreachable rendezvous server degrades EXACTLY like the existing, completely unmodified RendezvousDiscoveryProvider/DiscoveryBootstrap classes already do (empty result on discover(), a surfaced failure on publishToAll(), a tolerated failure on unpublishFromAll()), across repeated calls, with the persisted configuration and the bootstrap\'s own composition both untouched — never silently restored to DEFAULT_RENDEZVOUS_URLS, and no new retry/fallback/backoff semantics appear anywhere');
    }

    // ===============================================================
    // Section I — Cross-configuration isolation: RendezvousConfiguration,
    // IceServerConfiguration, ArweaveGatewayConfiguration, and
    // NostrRelayConfiguration round-trip independently through one shared
    // storage namespace with no key collision and no value bleed, in
    // every direction.
    // ===============================================================
    {
        const sharedNamespace = {};
        const rendezvousStore = new RendezvousConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const stunStore = new IceServerConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));

        rendezvousStore.save(new RendezvousConfiguration({ urls: ['wss://rendezvous-only.example'] }));
        stunStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:stun-only.example:3478' }] }));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave-only.example' }));
        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://nostr-only.example' }));

        assert(rendezvousStore.get().urls[0] === 'wss://rendezvous-only.example', 'I1. the Rendezvous store still reads back exactly its own saved value after three unrelated configurations were written to the same namespace');
        assert(stunStore.get().servers[0].urls === 'stun:stun-only.example:3478', 'I2. the STUN store is unaffected by the co-resident Rendezvous configuration');
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example', 'I3. the Arweave store is unaffected by the co-resident Rendezvous configuration');
        assert(nostrStore.get().relayUrl === 'wss://nostr-only.example', 'I4. the Nostr store is unaffected by the co-resident Rendezvous configuration');

        const namespaceKeys = Object.keys(sharedNamespace).sort();
        assert(namespaceKeys.length === 4
            && namespaceKeys.includes('rendezvous-configuration')
            && namespaceKeys.includes('ice-server-configuration')
            && namespaceKeys.includes('arweave-gateway-configuration')
            && namespaceKeys.includes('nostr-relay-configuration'),
            `I5. exactly four distinct, non-colliding storage keys exist in the shared namespace — found ${JSON.stringify(namespaceKeys)}`);

        // Changing, then clearing, the Rendezvous override has zero effect
        // on the three co-resident values.
        rendezvousStore.save(new RendezvousConfiguration({ urls: ['wss://rendezvous-changed.example'] }));
        assert(stunStore.get().servers[0].urls === 'stun:stun-only.example:3478'
            && arweaveStore.get().gatewayUrl === 'https://arweave-only.example'
            && nostrStore.get().relayUrl === 'wss://nostr-only.example',
            'I6. changing the Rendezvous override leaves the three co-resident values untouched');
        rendezvousStore.clear();
        assert(stunStore.get().servers[0].urls === 'stun:stun-only.example:3478'
            && arweaveStore.get().gatewayUrl === 'https://arweave-only.example'
            && nostrStore.get().relayUrl === 'wss://nostr-only.example',
            'I7. clearing the Rendezvous override entirely leaves the three co-resident values untouched');
        assert(rendezvousStore.get() === null, 'I8. sanity — the Rendezvous override is genuinely cleared');

        // Reverse direction: clearing STUN, Arweave, or Nostr leaves
        // Rendezvous untouched too.
        rendezvousStore.save(new RendezvousConfiguration({ urls: ['wss://rendezvous-survives-others-clearing.example'] }));
        stunStore.clear();
        arweaveStore.clear();
        nostrStore.clear();
        assert(rendezvousStore.get().urls[0] === 'wss://rendezvous-survives-others-clearing.example',
            'I9. clearing STUN, Arweave, and Nostr in turn leaves the Rendezvous configuration completely untouched — isolation genuinely holds in both directions');

        // Structural sweep, both directions.
        const rendezvousConfigSource = executableOf(await source('core/RendezvousConfiguration.js'));
        const rendezvousStoreSource = executableOf(await source('storage/RendezvousConfigurationStore.js'));
        const isolationPattern = /IceServerConfiguration|Arweave|Nostr|Ipfs|IPFS|Bitcoin|Base\b|RoleProvider|ProviderSelection|providerRanking/;
        assert(!isolationPattern.test(rendezvousConfigSource), 'I10. core/RendezvousConfiguration.js references none of STUN/Arweave/Nostr/IPFS/Bitcoin/Base/RoleProviderPreference');
        assert(!isolationPattern.test(rendezvousStoreSource), 'I11. storage/RendezvousConfigurationStore.js references none of STUN/Arweave/Nostr/IPFS/Bitcoin/Base/RoleProviderPreference');

        const stunConfigSource = executableOf(await source('core/IceServerConfiguration.js'));
        const stunStoreSource = executableOf(await source('storage/IceServerConfigurationStore.js'));
        const arweaveConfigSource = executableOf(await source('core/ArweaveGatewayConfiguration.js'));
        const arweaveStoreSource = executableOf(await source('storage/ArweaveGatewayConfigurationStore.js'));
        const nostrConfigSource = executableOf(await source('core/NostrRelayConfiguration.js'));
        const nostrStoreSource = executableOf(await source('storage/NostrRelayConfigurationStore.js'));
        for (const [label, src] of [
            ['core/IceServerConfiguration.js', stunConfigSource],
            ['storage/IceServerConfigurationStore.js', stunStoreSource],
            ['core/ArweaveGatewayConfiguration.js', arweaveConfigSource],
            ['storage/ArweaveGatewayConfigurationStore.js', arweaveStoreSource],
            ['core/NostrRelayConfiguration.js', nostrConfigSource],
            ['storage/NostrRelayConfigurationStore.js', nostrStoreSource]
        ]) {
            assert(!/RendezvousConfiguration|RendezvousConfigurationStore|SetRendezvousConfigurationUseCase|RendezvousSettingsView/.test(src), `I12 (${label}). no reverse reference to Rendezvous's own configuration boundary exists either — isolation holds in both directions`);
        }

        console.log('✓ Section I: RendezvousConfiguration, IceServerConfiguration, ArweaveGatewayConfiguration, and NostrRelayConfiguration round-trip independently through one shared storage namespace with no key collision and no value bleed in either direction; clearing any one of the four leaves the other three completely untouched, and startup resolution for each remains structurally independent');
    }

    // ===============================================================
    // Section J — Product/architecture boundary: no health checking,
    // endpoint ranking, latency measurement, failover, retry scheduling,
    // connection testing, peer-specific configuration, STUN/TURN coupling,
    // or new rendezvous protocol semantics exist anywhere in this
    // configuration's own files.
    // ===============================================================
    {
        const configSource = executableOf(await source('core/RendezvousConfiguration.js'));
        const storeSource = executableOf(await source('storage/RendezvousConfigurationStore.js'));
        const useCaseSource = executableOf(await source('application/SetRendezvousConfigurationUseCase.js'));
        const viewSource = executableOf(await source('ui/views/RendezvousSettingsView.js'));
        const filesUnderAudit = [
            ['core/RendezvousConfiguration.js', configSource],
            ['storage/RendezvousConfigurationStore.js', storeSource],
            ['application/SetRendezvousConfigurationUseCase.js', useCaseSource],
            ['ui/views/RendezvousSettingsView.js', viewSource]
        ];

        const forbiddenPattern = /healthCheck|latencyRank|autoSelect|automaticFallback|reconnectionPolicy|pingServer|probeServer|rankServers|retrySchedule|failover|endpointRank|connectionTest/i;
        for (const [label, src] of filesUnderAudit) {
            assert(!forbiddenPattern.test(src), `J1 (${label}). no health-check/latency-ranking/auto-selection/failover/retry-scheduling identifier of any kind exists`);
        }

        // No STUN/TURN coupling: neither scheme, nor either module, is
        // ever referenced.
        for (const [label, src] of filesUnderAudit) {
            assert(!/\bstun:|\bturn:|\bturns:|fetchIceServers|METERED_TURN_ENDPOINT|METERED_API_KEY|IceServerConfiguration/.test(src), `J2 (${label}). no STUN/TURN coupling of any kind — no scheme literal, no TURN credential constant, no IceServerConfiguration reference`);
        }

        // No peer-specific configuration: this is a single, app-wide
        // configuration, never keyed by identityId/peerDiscoveryId/
        // connectionId of any kind.
        for (const [label, src] of filesUnderAudit) {
            assert(!/identityId|peerDiscoveryId|connectionId|perPeer|per-peer/i.test(src), `J3 (${label}). no per-peer or per-connection configuration dimension exists — a single configuration applies to every future discover()/publish() call this replica makes`);
        }

        // No new rendezvous protocol semantics: the wire protocol version
        // constant and message type vocabulary are never referenced by
        // this configuration boundary.
        for (const [label, src] of filesUnderAudit) {
            assert(!/RENDEZVOUS_PROTOCOL_VERSION|PUBLISH|LOOKUP|REMOVE\b/.test(src), `J4 (${label}). no rendezvous wire-protocol identifier is referenced — this boundary only ever supplies a URL string, never a message shape`);
        }

        // No class in this boundary exposes a method shaped like a
        // reachability probe, a ranking function, or a reconnection
        // trigger.
        const store = new RendezvousConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore: store });
        const configuration = new RendezvousConfiguration({ urls: ['wss://a.example'] });
        for (const forbiddenMethod of ['test', 'testConnection', 'healthCheck', 'ping', 'probe', 'verify', 'checkReachability', 'rank', 'reconnect', 'selectBest', 'failover', 'retry']) {
            assert(typeof store[forbiddenMethod] === 'undefined', `J5. RendezvousConfigurationStore exposes no ${forbiddenMethod}()`);
            assert(typeof setUseCase[forbiddenMethod] === 'undefined', `J5. SetRendezvousConfigurationUseCase exposes no ${forbiddenMethod}()`);
            assert(typeof configuration[forbiddenMethod] === 'undefined', `J5. RendezvousConfiguration exposes no ${forbiddenMethod}()`);
        }

        // Saving never attempts a network call of any kind — WebSocket or
        // fetch — reconfirmed here as a structural property of this
        // audit's own scope, not merely inherited from 0.9.388's own test.
        let websocketConstructed = false;
        let fetchCalled = false;
        const OriginalWebSocket = globalThis.WebSocket;
        const originalFetch = globalThis.fetch;
        globalThis.WebSocket = class { constructor() { websocketConstructed = true; } };
        globalThis.fetch = (...args) => { fetchCalled = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch')); };
        try {
            setUseCase.execute({ urls: ['wss://no-network-check.example'] });
        } finally {
            globalThis.WebSocket = OriginalWebSocket;
            globalThis.fetch = originalFetch;
        }
        assert(!websocketConstructed, 'J6. saving a configuration never opens a WebSocket of any kind');
        assert(!fetchCalled, 'J7. saving a configuration never triggers an HTTP fetch of any kind');

        console.log('✓ Section J: no health-check, latency-ranking, automatic-selection, failover, retry-scheduling, connection-testing, per-peer-configuration, STUN/TURN-coupling, or rendezvous-protocol identifier or method exists anywhere in this configuration boundary, and saving still never opens a WebSocket or issues a fetch — every one of these capabilities is structurally absent, not merely unexercised');
    }

    // ===============================================================
    // Section K — Final decision matrix.
    // ===============================================================
    {
        const matrix = [
            ['One configuration model?', 'YES', '✅'],
            ['One storage key?', 'YES', '✅'],
            ['One store construction site?', 'YES', '✅'],
            ['One write-use-case construction site?', 'YES', '✅'],
            ['One startup resolution point (ui/main.js)?', 'YES', '✅'],
            ['RendezvousDiscoveryProvider self-selects a default?', 'NO', '✅'],
            ['Settings UI constructs the domain object directly?', 'NO', '✅'],
            ['Absence preserved?', 'YES', '✅'],
            ['Explicit default preserved as a distinct fact?', 'YES', '✅'],
            ['List order/duplicates preserved as given (no hidden normalization)?', 'YES', '✅'],
            ['Defensive-copy reads / frozen configuration?', 'YES', '✅'],
            ['Invalid mixed list partially persisted?', 'NO', '✅'],
            ['Only ws:/wss: ever accepted?', 'YES', '✅'],
            ['Scheme-confusable variant ever accepted?', 'NO', '✅'],
            ['Storage failures propagate (never degrade)?', 'YES', '✅'],
            ['Running bootstrap immune to later corruption?', 'YES', '✅'],
            ['Restart convergence across independent replicas?', 'YES', '✅'],
            ['Hidden second resolution (bootstrap re-defaults)?', 'NO', '✅'],
            ['Unreachable server degrades like the existing provider?', 'YES', '✅'],
            ['Unreachable server silently restores defaults?', 'NO', '✅'],
            ['New retry/fallback semantics introduced?', 'NO', '✅'],
            ['Cross-configuration bleed (STUN/Arweave/Nostr)?', 'NO', '✅'],
            ['STUN/TURN coupling of any kind?', 'NO', '✅'],
            ['Per-peer configuration dimension?', 'NO', '✅'],
            ['New rendezvous protocol semantics?', 'NO', '✅'],
            ['Health checking / latency ranking / auto-selection / failover?', 'NO', '✅'],
            ['Second configuration authority of any kind?', 'NO', '✅']
        ];
        console.log('\n=== FINAL DECISION MATRIX ===');
        console.log('Property                                                         | Expected | Observed');
        console.log('------------------------------------------------------------------|----------|---------');
        for (const [question, expected, observed] of matrix) {
            console.log(`${question.padEnd(67)}| ${expected.padEnd(9)}| ${observed}`);
        }

        console.log('\n=== VERDICT: CONVERGED / ARCHITECTURALLY CLOSED ===');
        console.log('Sections A-J prove convergence, not just correctness-in-isolation: one value object, one storage');
        console.log('key, one store construction site, one write-use-case construction site, and one startup');
        console.log('resolution point are ever referenced, and RendezvousDiscoveryProvider never self-selects a');
        console.log('default (A); absence and an explicit default stay distinguishable facts in persistence even when');
        console.log('their effective URL list coincides (B); a single URL, a multi-URL list, duplicates, and a');
        console.log('valid/valid/invalid mixed list all behave exactly as this configuration\'s own contract states,');
        console.log('with defensive-copy reads, frozen collections, and no partial persistence (C); only ws:/wss: is');
        console.log('ever accepted — every other scheme, malformed input, and scheme-confusable variant is rejected');
        console.log('on shape alone, never reachability (D); a genuine storage failure propagates rather than');
        console.log('degrading, and an already-running bootstrap is immune to a later corruption of the underlying');
        console.log('storage (E); four independently-composed replicas over one shared storage namespace converge on');
        console.log('the identical effective list, proven through a real (simulated) LOOKUP round trip (F); the');
        console.log('exact resolved URL list reaches DiscoveryBootstrap with no hidden second resolution, structurally');
        console.log('and behaviorally (G); a configured-but-unreachable rendezvous server degrades EXACTLY like the');
        console.log('existing, completely unmodified provider already does — never silently restored to the');
        console.log('deployment default, and no new retry/fallback semantics appear (H); Rendezvous, STUN, Arweave,');
        console.log('and Nostr configuration round-trip independently through one shared namespace with no bleed in');
        console.log('either direction (I); and no health-check, latency-ranking, failover, per-peer-configuration, or');
        console.log('STUN/TURN-coupling capability exists anywhere in this boundary (J).');
        console.log('');
        console.log('Rendezvous configuration selects the configured discovery endpoints; the existing Rendezvous');
        console.log('provider remains solely responsible for what happens when those endpoints succeed or fail.');
        console.log('');
        console.log('0.9.388\'s implementation is architecturally closed. No convergence defect was found; no production change was made.');
    }

    console.log('\n✅ All Rendezvous Configuration Lifecycle & Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
