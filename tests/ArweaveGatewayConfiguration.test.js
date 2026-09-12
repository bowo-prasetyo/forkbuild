import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, isValidArweaveGatewayUrl, DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';

// 0.9.364 — User-Configurable Arweave Gateway Configuration Boundary.
// See docs/Roadmap.md, "0.9.364 — User-Configurable Arweave Gateway," and
// core/ArweaveGatewayConfiguration.js's own header for the full seam this
// milestone closes.
//
// Section A: construction — a valid absolute http(s) URL round-trips
// Section B: trailing-slash normalization, mirroring content/ArweaveContentStore.js
// Section C: rejection — malformed/non-URL/non-http(s) values all throw
// Section D: immutability — frozen, no setter, no mutation reaches another instance
// Section E: equals() — value equality, never identity
// Section F: toJSON() — plain-data shape only
// Section G: DEFAULT_ARWEAVE_GATEWAY_URL — a plain exported constant, never
//            silently substituted by the constructor itself
// Section H: architecture sweep — no persistence, no network, no ui/, no
//            extra fields, no IPFS/generic-endpoint abstraction

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
    // Section A — construction: a valid absolute http(s) URL round-trips.
    // ===============================================================
    {
        const config = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-arweave-gateway.example' });
        assert(config.gatewayUrl === 'https://my-arweave-gateway.example', 'A1. gatewayUrl round-trips exactly for an already-clean URL');

        const httpConfig = new ArweaveGatewayConfiguration({ gatewayUrl: 'http://localhost:1984' });
        assert(httpConfig.gatewayUrl === 'http://localhost:1984', 'A2. plain http:// (a local gateway) is accepted, not just https://');

        assert(isValidArweaveGatewayUrl('https://arweave.net') === true, 'A3. isValidArweaveGatewayUrl() itself accepts a well-formed https URL');
        assert(isValidArweaveGatewayUrl('http://127.0.0.1:1984') === true, 'A4. isValidArweaveGatewayUrl() accepts a well-formed http URL');
        console.log('✓ Section A: a valid absolute http(s) gatewayUrl constructs and round-trips');
    }

    // ===============================================================
    // Section B — trailing-slash normalization, mirroring content/
    // ArweaveContentStore.js's own constructor exactly.
    // ===============================================================
    {
        const config = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-arweave-gateway.example/' });
        assert(config.gatewayUrl === 'https://my-arweave-gateway.example', 'B1. one trailing slash is stripped');

        const configMultiSlash = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-arweave-gateway.example///' });
        assert(configMultiSlash.gatewayUrl === 'https://my-arweave-gateway.example', 'B2. multiple trailing slashes are all stripped');

        const configWithPath = new ArweaveGatewayConfiguration({ gatewayUrl: '  https://my-arweave-gateway.example  ' });
        assert(configWithPath.gatewayUrl === 'https://my-arweave-gateway.example', 'B3. surrounding whitespace is trimmed');
        console.log('✓ Section B: trailing slashes and surrounding whitespace are normalized away, matching content/ArweaveContentStore.js\'s own constructor');
    }

    // ===============================================================
    // Section C — rejection: malformed, non-URL, and non-http(s) values
    // all throw at construction time.
    // ===============================================================
    {
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: '' }), 'C1. an empty string throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: '   ' }), 'C2. a whitespace-only string throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: 'not-a-url' }), 'C3. a non-URL string throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: 'arweave.net' }), 'C4. a bare host with no scheme throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: 'ftp://arweave.net' }), 'C5. a non-http(s) scheme throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: 'javascript:alert(1)' }), 'C6. a javascript: URL throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: null }), 'C7. null throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: undefined }), 'C8. undefined/omitted throws — this class never invents a default, see this file\'s own Section G');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: 42 }), 'C9. a non-string value throws');
        expectThrows(() => new ArweaveGatewayConfiguration({}), 'C10. an empty options object throws');
        expectThrows(() => new ArweaveGatewayConfiguration(), 'C11. no arguments at all throws');

        assert(isValidArweaveGatewayUrl('not-a-url') === false, 'C12. isValidArweaveGatewayUrl() itself rejects a non-URL string, never just the constructor wrapping it');
        assert(isValidArweaveGatewayUrl(42) === false, 'C13. isValidArweaveGatewayUrl() rejects a non-string value without throwing');
        console.log('✓ Section C: every malformed, non-URL, or non-http(s) gatewayUrl is rejected at construction time — a malformed value is never silently accepted');
    }

    // ===============================================================
    // Section D — immutability: frozen, no setter, no mutation reaches
    // another instance.
    // ===============================================================
    {
        const config = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave.net' });
        assert(Object.isFrozen(config), 'D1. every instance is frozen');
        expectThrows(() => { config._gatewayUrl = 'https://evil.example'; }, 'D2. writing to the private field throws in strict mode / is a no-op that leaves the getter unchanged');
        assert(config.gatewayUrl === 'https://arweave.net', 'D3. gatewayUrl is unchanged after the attempted write');
        assert(typeof Object.getOwnPropertyDescriptor(ArweaveGatewayConfiguration.prototype, 'gatewayUrl').set === 'undefined', 'D4. gatewayUrl has no setter on the prototype');
        console.log('✓ Section D: every ArweaveGatewayConfiguration is immutable by construction, not by convention');
    }

    // ===============================================================
    // Section E — equals(): value equality, never identity.
    // ===============================================================
    {
        const a = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave.net' });
        const b = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave.net' });
        const c = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' });

        assert(a !== b, 'E1. two independently constructed instances with the same URL are not the same object');
        assert(a.equals(b), 'E2. …but they are value-equal');
        assert(!a.equals(c), 'E3. two instances with different URLs are not equal');
        assert(!a.equals({ gatewayUrl: 'https://arweave.net' }), 'E4. a plain object with a matching field is never equal — only a real ArweaveGatewayConfiguration instance');
        assert(!a.equals(null) && !a.equals(undefined), 'E5. equals() against null/undefined is false, never a throw');
        console.log('✓ Section E: equals() compares by value, never by reference, and never mistakes a plain object for a real instance');
    }

    // ===============================================================
    // Section F — toJSON(): plain-data shape only.
    //
    // 0.9.440 — toJSON() now always emits the LIST shape, `{ gatewayUrls }`,
    // even for a single-gatewayUrl-constructed instance — see core/
    // ArweaveGatewayConfiguration.js's own 0.9.440 header. This is the one
    // deliberate shape change this milestone makes to this class; every
    // other Section in this file (construction, normalization, rejection,
    // immutability, equals()) is unaffected by it.
    // ===============================================================
    {
        const config = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' });
        const json = config.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ gatewayUrls: ['https://my-gateway.example'] }), 'F1. toJSON() returns exactly { gatewayUrls }, a one-element array for a single-gatewayUrl configuration');
        assert(Object.keys(json).length === 1, 'F2. toJSON() carries exactly one field');
        assert(Array.isArray(json.gatewayUrls), 'F3. gatewayUrls is always an array, even for a single-gatewayUrl configuration');
        console.log('✓ Section F: toJSON() is a plain, single-field list-shaped data shape — no extra fields, no methods');
    }

    // ===============================================================
    // Section G — DEFAULT_ARWEAVE_GATEWAY_URL: a plain exported constant,
    // never silently substituted by the constructor itself.
    // ===============================================================
    {
        assert(DEFAULT_ARWEAVE_GATEWAY_URL === 'https://arweave.net', 'G1. the exported default is the same host every Arweave-facing adapter in this codebase already hardcodes');
        assert(isValidArweaveGatewayUrl(DEFAULT_ARWEAVE_GATEWAY_URL), 'G2. the default itself is a valid gatewayUrl by this file\'s own rule');
        // Section C already proved omitting gatewayUrl throws rather than
        // silently resolving DEFAULT_ARWEAVE_GATEWAY_URL — restated here by
        // name for the milestone's own "settings value is never the new
        // authority for the default" rule.
        expectThrows(() => new ArweaveGatewayConfiguration(), 'G3. the constructor never falls back to DEFAULT_ARWEAVE_GATEWAY_URL on its own — a caller resolving "no configuration" must consult the constant explicitly');
        console.log('✓ Section G: DEFAULT_ARWEAVE_GATEWAY_URL is a plain constant a caller consults explicitly — the constructor itself never becomes a second authority for it');
    }

    // ===============================================================
    // Section H — architecture sweep: no persistence, no network, no ui/,
    // no extra fields, no generic/IPFS abstraction — run against the real
    // source file, never a guess from this file's own prose.
    // ===============================================================
    {
        const configSource = await source('core/ArweaveGatewayConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/localStorage|StorageProvider/.test(configExecutable), 'H1. no persistence of any kind — no localStorage, no StorageProvider reference in this file\'s own executable code');
        assert(!/\bfetch\s*\(/.test(configExecutable), 'H2. no fetch() call anywhere — this file never makes a network request');
        assert(!/from\s*['"][^'"]*ui\//.test(configExecutable), 'H3. no import from ui/ — this is a pure core/ value object');
        assert(!/timeout|retry|fallbackGateway|healthCheck|priority/i.test(configExecutable), 'H4. none of the speculative fields (timeout/retry/fallbackGateway/healthCheck/priority) appear in this file\'s own executable code');
        assert(!/InfrastructureEndpointConfiguration/.test(configExecutable), 'H5. no generic InfrastructureEndpointConfiguration abstraction — this file names itself ArweaveGatewayConfiguration on purpose');
        assert(!/ipfs/i.test(configExecutable), 'H6. no IPFS reference in this file\'s own executable code — IPFS Gateway is a deliberately separate, later candidate');
        console.log('✓ Section H: architecture sweep of the real source file confirms no persistence, no network call, no ui/ dependency, no speculative fields, and no generic endpoint abstraction');
    }

    // ===============================================================
    // Section I — 0.9.440: `gatewayUrls` (an ordered list), and the
    // single-string shape's continued equivalence to a one-element list.
    // ===============================================================
    {
        // I1. A list of two or more constructs, preserves order, and
        // .gatewayUrl reads back the FIRST entry.
        const multi = new ArweaveGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example', 'https://c.example'] });
        assert(JSON.stringify(multi.gatewayUrls) === JSON.stringify(['https://a.example', 'https://b.example', 'https://c.example']), 'I1. gatewayUrls preserves configured order exactly');
        assert(multi.gatewayUrl === 'https://a.example', 'I1. gatewayUrl reads back the first configured entry');

        // I2. Reordering [A, B] -> [B, A] changes gatewayUrl/gatewayUrls,
        // and equals() treats the two as genuinely different configurations
        // — order IS the policy, never incidental.
        const ab = new ArweaveGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example'] });
        const ba = new ArweaveGatewayConfiguration({ gatewayUrls: ['https://b.example', 'https://a.example'] });
        assert(ab.gatewayUrl !== ba.gatewayUrl, 'I2. reordering changes which entry gatewayUrl reads back');
        assert(!ab.equals(ba), 'I2. equals() treats a reordered list as a different configuration');

        // I3. A single string is exactly a one-element list — the
        // "old configuration -> one-element list -> same behavior"
        // compatibility rule this milestone's own brief requires.
        const single = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://only.example' });
        const singleAsList = new ArweaveGatewayConfiguration({ gatewayUrls: ['https://only.example'] });
        assert(single.equals(singleAsList), 'I3. gatewayUrl: X and gatewayUrls: [X] construct value-equal configurations');
        assert(JSON.stringify(single.gatewayUrls) === JSON.stringify(['https://only.example']), 'I3. a single-gatewayUrl configuration still exposes a one-element gatewayUrls array');

        // I4. Passing both throws — never a silent "one wins."
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrl: 'https://a.example', gatewayUrls: ['https://b.example'] }),
            'I4. supplying both gatewayUrl and gatewayUrls throws, rather than silently preferring one');

        // I5. An empty gatewayUrls array throws — never "no gateway
        // configured," which is a caller's own absence to represent, not a
        // valid-but-empty configuration.
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrls: [] }), 'I5. an empty gatewayUrls array throws');
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrls: 'https://not-an-array.example' }), 'I5. a bare string under the gatewayUrls key (not an array) throws');

        // I6. Every entry is independently validated and normalized —
        // one malformed entry anywhere in the list throws the whole
        // construction, and trailing slashes are stripped per entry.
        expectThrows(() => new ArweaveGatewayConfiguration({ gatewayUrls: ['https://good.example', 'not-a-url'] }),
            'I6. one malformed entry anywhere in the list throws construction of the whole configuration');
        const trimmed = new ArweaveGatewayConfiguration({ gatewayUrls: ['https://a.example/', 'https://b.example///'] });
        assert(JSON.stringify(trimmed.gatewayUrls) === JSON.stringify(['https://a.example', 'https://b.example']), 'I6. trailing slashes are normalized per entry, identically to the single-gatewayUrl path');

        // I7. gatewayUrls is frozen — no mutation reaches another read.
        const frozen = new ArweaveGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example'] });
        assert(Object.isFrozen(frozen.gatewayUrls), 'I7. the returned gatewayUrls array is frozen');
        expectThrows(() => { frozen.gatewayUrls.push('https://c.example'); }, 'I7. push() on the returned array throws rather than silently mutating this instance');
        assert(frozen.gatewayUrls.length === 2, 'I7. the attempted mutation left this instance unchanged');

        console.log('✓ Section I: gatewayUrls constructs an ordered, frozen, independently-validated list; a single gatewayUrl string remains exactly a one-element list; both fields together throws; an empty/non-array list throws');
    }

    console.log('\n✅ All User-Configurable Arweave Gateway Configuration Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
