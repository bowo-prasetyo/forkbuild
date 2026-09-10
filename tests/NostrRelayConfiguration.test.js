import { readFile } from 'node:fs/promises';

import { NostrRelayConfiguration, isValidNostrRelayUrl, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';

// 0.9.369 — Nostr Relay Configuration Boundary.
// See docs/Roadmap.md, "0.9.369 — Nostr Relay Configuration Boundary," and
// core/NostrRelayConfiguration.js's own header for the full seam this
// milestone closes — the direct structural mirror of tests/
// ArweaveGatewayConfiguration.test.js, one relay URL instead of one
// gateway URL.
//
// Section A: construction — a valid absolute ws:/wss: URL round-trips
// Section B: whitespace is trimmed; no trailing-slash normalization occurs
//            (unlike core/ArweaveGatewayConfiguration.js — see that file's
//            own header for why the two differ)
// Section C: rejection — malformed/non-URL/non-ws(s) values all throw
// Section D: immutability — frozen, no setter, no mutation reaches another
//            instance
// Section E: equals() — value equality, never identity
// Section F: toJSON() — plain-data shape only
// Section G: DEFAULT_NOSTR_RELAY_URL — a plain exported constant, never
//            silently substituted by the constructor itself
// Section H: architecture sweep — no persistence, no network, no ui/, no
//            extra fields, no shared abstraction with
//            ArweaveGatewayConfiguration

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — construction: a valid absolute ws:/wss: URL round-trips.
    // ===============================================================
    {
        const config = new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' });
        assert(config.relayUrl === 'wss://my-relay.example', 'A1. relayUrl round-trips exactly for an already-clean URL');

        const plainWsConfig = new NostrRelayConfiguration({ relayUrl: 'ws://localhost:7777' });
        assert(plainWsConfig.relayUrl === 'ws://localhost:7777', 'A2. plain ws:// (a local relay) is accepted, not just wss://');

        assert(isValidNostrRelayUrl('wss://relay.damus.io') === true, 'A3. isValidNostrRelayUrl() itself accepts a well-formed wss URL');
        assert(isValidNostrRelayUrl('ws://127.0.0.1:7000') === true, 'A4. isValidNostrRelayUrl() accepts a well-formed ws URL');
        console.log('✓ Section A: a valid absolute ws(s) relayUrl constructs and round-trips');
    }

    // ===============================================================
    // Section B — whitespace is trimmed; no trailing-slash normalization
    // occurs (deliberately, unlike core/ArweaveGatewayConfiguration.js —
    // see that file's own header, "no trailing-slash normalization").
    // ===============================================================
    {
        const config = new NostrRelayConfiguration({ relayUrl: '  wss://my-relay.example  ' });
        assert(config.relayUrl === 'wss://my-relay.example', 'B1. surrounding whitespace is trimmed');

        const configWithTrailingSlash = new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example/' });
        assert(configWithTrailingSlash.relayUrl === 'wss://my-relay.example/', 'B2. a trailing slash is preserved verbatim — none of the three read-path consumers ever concatenate onto relayUrl, so there is nothing to normalize for');
        console.log('✓ Section B: surrounding whitespace is trimmed, and a trailing slash is preserved verbatim — no speculative normalization with no real consumer behavior to justify it');
    }

    // ===============================================================
    // Section C — rejection: malformed, non-URL, and non-ws(s) values all
    // throw at construction time.
    // ===============================================================
    {
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: '' }), 'C1. an empty string throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: '   ' }), 'C2. a whitespace-only string throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: 'not-a-url' }), 'C3. a non-URL string throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: 'relay.damus.io' }), 'C4. a bare host with no scheme throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: 'https://relay.damus.io' }), 'C5. an http(s) scheme throws — this is a relay URL, never a gateway URL');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: 'ftp://relay.damus.io' }), 'C6. an unrelated non-ws(s) scheme throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: 'javascript:alert(1)' }), 'C7. a javascript: URL throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: null }), 'C8. null throws');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: undefined }), 'C9. undefined/omitted throws — this class never invents a default, see this file\'s own Section G');
        expectThrows(() => new NostrRelayConfiguration({ relayUrl: 42 }), 'C10. a non-string value throws');
        expectThrows(() => new NostrRelayConfiguration({}), 'C11. an empty options object throws');
        expectThrows(() => new NostrRelayConfiguration(), 'C12. no arguments at all throws');

        assert(isValidNostrRelayUrl('not-a-url') === false, 'C13. isValidNostrRelayUrl() itself rejects a non-URL string, never just the constructor wrapping it');
        assert(isValidNostrRelayUrl('https://relay.damus.io') === false, 'C14. isValidNostrRelayUrl() rejects an http(s) URL — the wrong scheme family entirely');
        assert(isValidNostrRelayUrl(42) === false, 'C15. isValidNostrRelayUrl() rejects a non-string value without throwing');
        console.log('✓ Section C: every malformed, non-URL, or non-ws(s) relayUrl is rejected at construction time — a malformed value is never silently accepted');
    }

    // ===============================================================
    // Section D — immutability: frozen, no setter, no mutation reaches
    // another instance.
    // ===============================================================
    {
        const config = new NostrRelayConfiguration({ relayUrl: 'wss://relay.damus.io' });
        assert(Object.isFrozen(config), 'D1. every instance is frozen');
        expectThrows(() => { config._relayUrl = 'wss://evil.example'; }, 'D2. writing to the private field throws in strict mode / is a no-op that leaves the getter unchanged');
        assert(config.relayUrl === 'wss://relay.damus.io', 'D3. relayUrl is unchanged after the attempted write');
        assert(typeof Object.getOwnPropertyDescriptor(NostrRelayConfiguration.prototype, 'relayUrl').set === 'undefined', 'D4. relayUrl has no setter on the prototype');
        console.log('✓ Section D: every NostrRelayConfiguration is immutable by construction, not by convention');
    }

    // ===============================================================
    // Section E — equals(): value equality, never identity.
    // ===============================================================
    {
        const a = new NostrRelayConfiguration({ relayUrl: 'wss://relay.damus.io' });
        const b = new NostrRelayConfiguration({ relayUrl: 'wss://relay.damus.io' });
        const c = new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' });

        assert(a !== b, 'E1. two independently constructed instances with the same URL are not the same object');
        assert(a.equals(b), 'E2. …but they are value-equal');
        assert(!a.equals(c), 'E3. two instances with different URLs are not equal');
        assert(!a.equals({ relayUrl: 'wss://relay.damus.io' }), 'E4. a plain object with a matching field is never equal — only a real NostrRelayConfiguration instance');
        assert(!a.equals(null) && !a.equals(undefined), 'E5. equals() against null/undefined is false, never a throw');
        console.log('✓ Section E: equals() compares by value, never by reference, and never mistakes a plain object for a real instance');
    }

    // ===============================================================
    // Section F — toJSON(): plain-data shape only.
    // ===============================================================
    {
        const config = new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' });
        const json = config.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ relayUrl: 'wss://my-relay.example' }), 'F1. toJSON() returns exactly { relayUrl }, nothing more');
        assert(Object.keys(json).length === 1, 'F2. toJSON() carries exactly one field');
        console.log('✓ Section F: toJSON() is a plain, single-field data shape — no extra fields, no methods');
    }

    // ===============================================================
    // Section G — DEFAULT_NOSTR_RELAY_URL: a plain exported constant, never
    // silently substituted by the constructor itself.
    // ===============================================================
    {
        assert(DEFAULT_NOSTR_RELAY_URL === 'wss://relay.damus.io', 'G1. the exported default is the same relay every one of the three read-path Nostr discovery classes in this codebase already hardcodes');
        assert(isValidNostrRelayUrl(DEFAULT_NOSTR_RELAY_URL), 'G2. the default itself is a valid relayUrl by this file\'s own rule');
        // Section C already proved omitting relayUrl throws rather than
        // silently resolving DEFAULT_NOSTR_RELAY_URL — restated here by
        // name for the milestone's own "absent -> null, never the default"
        // rule.
        expectThrows(() => new NostrRelayConfiguration(), 'G3. the constructor never falls back to DEFAULT_NOSTR_RELAY_URL on its own — a caller resolving "no configuration" must consult the constant explicitly');
        console.log('✓ Section G: DEFAULT_NOSTR_RELAY_URL is a plain constant a caller consults explicitly — the constructor itself never becomes a second authority for it');
    }

    // ===============================================================
    // Section H — architecture sweep: no persistence, no network, no ui/,
    // no extra fields, no shared abstraction with
    // ArweaveGatewayConfiguration — run against the real source file, never
    // a guess from this file's own prose.
    // ===============================================================
    {
        const configSource = await source('core/NostrRelayConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/localStorage|StorageProvider/.test(configExecutable), 'H1. no persistence of any kind — no localStorage, no StorageProvider reference in this file\'s own executable code');
        assert(!/\bfetch\s*\(/.test(configExecutable) && !/new\s+WebSocket/.test(configExecutable), 'H2. no fetch() call and no WebSocket construction anywhere — this file never makes a network connection');
        assert(!/from\s*['"][^'"]*ui\//.test(configExecutable), 'H3. no import from ui/ — this is a pure core/ value object');
        assert(!/timeout|retry|fallbackRelay|healthCheck|priority/i.test(configExecutable), 'H4. none of the speculative fields (timeout/retry/fallbackRelay/healthCheck/priority) appear in this file\'s own executable code');
        assert(!/InfrastructureEndpointConfiguration/.test(configExecutable), 'H5. no generic InfrastructureEndpointConfiguration abstraction');
        assert(!/ArweaveGatewayConfiguration/.test(configExecutable), 'H6. no reference to ArweaveGatewayConfiguration of any kind — two deliberately unconnected configuration systems');
        assert(!/relayList|relays\s*:/i.test(configExecutable), 'H7. no relay-list field of any kind — exactly one relayUrl, never a list');
        console.log('✓ Section H: architecture sweep of the real source file confirms no persistence, no network access, no ui/ dependency, no speculative fields, and no shared abstraction with ArweaveGatewayConfiguration');
    }

    console.log('\n✅ All Nostr Relay Configuration Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
