
import { IpfsGatewayConfiguration, isValidIpfsGatewayUrl, DEFAULT_IPFS_GATEWAY_URL } from '../core/IpfsGatewayConfiguration.js';
import { assert } from './support/Assert.js';
import { readSource as source } from './support/SourceText.js';

// 0.9.665 — User-Configurable IPFS Gateway Configuration Boundary.
// 0.9.666 — IPFS Gateway Read Failover. Mirrors tests/
// ArweaveGatewayConfiguration.test.js's own Sections A-I exactly, in full
// now — see core/IpfsGatewayConfiguration.js's own header for how this
// class came to mirror Arweave Gateway's own 0.9.440 gatewayUrls/failover
// shape one axis over.

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function run() {
    // ===============================================================
    // Section A — construction: a valid absolute http(s) URL round-trips.
    // ===============================================================
    {
        const config = new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' });
        assert(config.gatewayUrl === 'https://gateway.pinata.cloud', 'A1. gatewayUrl round-trips exactly for an already-clean URL');

        const httpConfig = new IpfsGatewayConfiguration({ gatewayUrl: 'http://localhost:8080' });
        assert(httpConfig.gatewayUrl === 'http://localhost:8080', 'A2. plain http:// (a local gateway) is accepted, not just https://');

        assert(isValidIpfsGatewayUrl('https://ipfs.io') === true, 'A3. isValidIpfsGatewayUrl() itself accepts a well-formed https URL');
        assert(isValidIpfsGatewayUrl('http://127.0.0.1:8080') === true, 'A4. isValidIpfsGatewayUrl() accepts a well-formed http URL');
        console.log('✓ Section A: a valid absolute http(s) gatewayUrl constructs and round-trips');
    }

    // ===============================================================
    // Section B — trailing-slash normalization, mirroring content/
    // IpfsGatewayContentStore.js's own constructor exactly.
    // ===============================================================
    {
        const config = new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud/' });
        assert(config.gatewayUrl === 'https://gateway.pinata.cloud', 'B1. one trailing slash is stripped');

        const configMultiSlash = new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud///' });
        assert(configMultiSlash.gatewayUrl === 'https://gateway.pinata.cloud', 'B2. multiple trailing slashes are all stripped');

        const configWithSpace = new IpfsGatewayConfiguration({ gatewayUrl: '  https://gateway.pinata.cloud  ' });
        assert(configWithSpace.gatewayUrl === 'https://gateway.pinata.cloud', 'B3. surrounding whitespace is trimmed');
        console.log('✓ Section B: trailing slashes and surrounding whitespace are normalized away, matching content/IpfsGatewayContentStore.js\'s own constructor');
    }

    // ===============================================================
    // Section C — rejection: malformed, non-URL, and non-http(s) values
    // all throw at construction time.
    // ===============================================================
    {
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: '' }), 'C1. an empty string throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: '   ' }), 'C2. a whitespace-only string throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: 'not-a-url' }), 'C3. a non-URL string throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: 'ipfs.io' }), 'C4. a bare host with no scheme throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: 'ftp://ipfs.io' }), 'C5. a non-http(s) scheme throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: 'javascript:alert(1)' }), 'C6. a javascript: URL throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: null }), 'C7. null throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: undefined }), 'C8. undefined/omitted throws — this class never invents a default, see this file\'s own Section G');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: 42 }), 'C9. a non-string value throws');
        expectThrows(() => new IpfsGatewayConfiguration({}), 'C10. an empty options object throws');
        expectThrows(() => new IpfsGatewayConfiguration(), 'C11. no arguments at all throws');

        assert(isValidIpfsGatewayUrl('not-a-url') === false, 'C12. isValidIpfsGatewayUrl() itself rejects a non-URL string, never just the constructor wrapping it');
        assert(isValidIpfsGatewayUrl(42) === false, 'C13. isValidIpfsGatewayUrl() rejects a non-string value without throwing');
        console.log('✓ Section C: every malformed, non-URL, or non-http(s) gatewayUrl is rejected at construction time');
    }

    // ===============================================================
    // Section D — immutability: frozen, no setter, no mutation reaches
    // another instance.
    // ===============================================================
    {
        const config = new IpfsGatewayConfiguration({ gatewayUrl: 'https://ipfs.io' });
        assert(Object.isFrozen(config), 'D1. every instance is frozen');
        expectThrows(() => { config._gatewayUrl = 'https://evil.example'; }, 'D2. writing to the private field throws in strict mode');
        assert(config.gatewayUrl === 'https://ipfs.io', 'D3. gatewayUrl is unchanged after the attempted write');
        assert(typeof Object.getOwnPropertyDescriptor(IpfsGatewayConfiguration.prototype, 'gatewayUrl').set === 'undefined', 'D4. gatewayUrl has no setter on the prototype');
        console.log('✓ Section D: every IpfsGatewayConfiguration is immutable by construction');
    }

    // ===============================================================
    // Section E — equals(): value equality, never identity.
    // ===============================================================
    {
        const a = new IpfsGatewayConfiguration({ gatewayUrl: 'https://ipfs.io' });
        const b = new IpfsGatewayConfiguration({ gatewayUrl: 'https://ipfs.io' });
        const c = new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' });

        assert(a !== b, 'E1. two independently constructed instances with the same URL are not the same object');
        assert(a.equals(b), 'E2. …but they are value-equal');
        assert(!a.equals(c), 'E3. two instances with different URLs are not equal');
        assert(!a.equals({ gatewayUrl: 'https://ipfs.io' }), 'E4. a plain object with a matching field is never equal — only a real IpfsGatewayConfiguration instance');
        assert(!a.equals(null) && !a.equals(undefined), 'E5. equals() against null/undefined is false, never a throw');
        console.log('✓ Section E: equals() compares by value, never by reference');
    }

    // ===============================================================
    // Section F — toJSON(): plain-data shape only.
    // ===============================================================
    {
        const config = new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' });
        const json = config.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ gatewayUrls: ['https://gateway.pinata.cloud'] }), 'F1. toJSON() returns exactly { gatewayUrls } — always the list shape, even for a single-gateway configuration');
        assert(Object.keys(json).length === 1, 'F2. toJSON() carries exactly one field');
        console.log('✓ Section F: toJSON() is a plain, single-field data shape, always the list shape');
    }

    // ===============================================================
    // Section G — DEFAULT_IPFS_GATEWAY_URL: a plain exported constant,
    // never silently substituted by the constructor itself, and
    // byte-identical to content/IpfsGatewayContentStore.js's own default.
    // ===============================================================
    {
        assert(DEFAULT_IPFS_GATEWAY_URL === 'https://ipfs.io', 'G1. the exported default matches content/IpfsGatewayContentStore.js\'s own DEFAULT_GATEWAY_URL');
        assert(isValidIpfsGatewayUrl(DEFAULT_IPFS_GATEWAY_URL), 'G2. the default itself is a valid gatewayUrl by this file\'s own rule');
        expectThrows(() => new IpfsGatewayConfiguration(), 'G3. the constructor never falls back to DEFAULT_IPFS_GATEWAY_URL on its own — a caller resolving "no configuration" must consult the constant explicitly');

        const gatewaySource = await source('content/IpfsGatewayContentStore.js');
        assert(gatewaySource.includes("const DEFAULT_GATEWAY_URL = 'https://ipfs.io'"), 'G4. this shipped default is unchanged by this milestone — only its configurability is new, never a silent swap of what "unconfigured" means');
        console.log('✓ Section G: DEFAULT_IPFS_GATEWAY_URL is a plain constant, unchanged from the shipped default, never a second authority the constructor invents');
    }

    // ===============================================================
    // Section H — architecture sweep: no persistence, no network, no ui/,
    // no extra fields, no generic abstraction.
    // ===============================================================
    {
        const configSource = await source('core/IpfsGatewayConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/localStorage|StorageProvider/.test(configExecutable), 'H1. no persistence of any kind in this file\'s own executable code');
        assert(!/\bfetch\s*\(/.test(configExecutable), 'H2. no fetch() call anywhere — this file never makes a network request');
        assert(!/from\s*['"][^'"]*ui\//.test(configExecutable), 'H3. no import from ui/ — this is a pure core/ value object');
        assert(!/timeout|retry|healthCheck|priority/i.test(configExecutable), 'H4. none of the speculative fields appear in this file\'s own executable code');
        assert(!/InfrastructureEndpointConfiguration/.test(configExecutable), 'H5. no generic InfrastructureEndpointConfiguration abstraction');
        console.log('✓ Section H: architecture sweep confirms no persistence, no network call, no ui/ dependency, and no speculative fields');
    }

    // ===============================================================
    // Section I — 0.9.666: `gatewayUrls` (an ordered list), and the
    // single-string shape's continued equivalence to a one-element list.
    // ===============================================================
    {
        // I1. A list of two or more constructs, preserves order, and
        // .gatewayUrl reads back the FIRST entry.
        const multi = new IpfsGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example', 'https://c.example'] });
        assert(JSON.stringify(multi.gatewayUrls) === JSON.stringify(['https://a.example', 'https://b.example', 'https://c.example']), 'I1. gatewayUrls preserves configured order exactly');
        assert(multi.gatewayUrl === 'https://a.example', 'I1. gatewayUrl reads back the first configured entry');

        // I2. Reordering [A, B] -> [B, A] changes gatewayUrl/gatewayUrls,
        // and equals() treats the two as genuinely different configurations
        // — order IS the policy, never incidental.
        const ab = new IpfsGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example'] });
        const ba = new IpfsGatewayConfiguration({ gatewayUrls: ['https://b.example', 'https://a.example'] });
        assert(ab.gatewayUrl !== ba.gatewayUrl, 'I2. reordering changes which entry gatewayUrl reads back');
        assert(!ab.equals(ba), 'I2. equals() treats a reordered list as a different configuration');

        // I3. A single string is exactly a one-element list — the
        // "old configuration -> one-element list -> same behavior"
        // compatibility rule this milestone requires.
        const single = new IpfsGatewayConfiguration({ gatewayUrl: 'https://only.example' });
        const singleAsList = new IpfsGatewayConfiguration({ gatewayUrls: ['https://only.example'] });
        assert(single.equals(singleAsList), 'I3. gatewayUrl: X and gatewayUrls: [X] construct value-equal configurations');
        assert(JSON.stringify(single.gatewayUrls) === JSON.stringify(['https://only.example']), 'I3. a single-gatewayUrl configuration still exposes a one-element gatewayUrls array');

        // I4. Passing both throws — never a silent "one wins."
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrl: 'https://a.example', gatewayUrls: ['https://b.example'] }),
            'I4. supplying both gatewayUrl and gatewayUrls throws, rather than silently preferring one');

        // I5. An empty gatewayUrls array throws — never "no gateway
        // configured," which is a caller's own absence to represent, not a
        // valid-but-empty configuration.
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrls: [] }), 'I5. an empty gatewayUrls array throws');
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrls: 'https://not-an-array.example' }), 'I5. a bare string under the gatewayUrls key (not an array) throws');

        // I6. Every entry is independently validated and normalized —
        // one malformed entry anywhere in the list throws the whole
        // construction, and trailing slashes are stripped per entry.
        expectThrows(() => new IpfsGatewayConfiguration({ gatewayUrls: ['https://good.example', 'not-a-url'] }),
            'I6. one malformed entry anywhere in the list throws construction of the whole configuration');
        const trimmed = new IpfsGatewayConfiguration({ gatewayUrls: ['https://a.example/', 'https://b.example///'] });
        assert(JSON.stringify(trimmed.gatewayUrls) === JSON.stringify(['https://a.example', 'https://b.example']), 'I6. trailing slashes are normalized per entry, identically to the single-gatewayUrl path');

        // I7. gatewayUrls is frozen — no mutation reaches another read.
        const frozen = new IpfsGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example'] });
        assert(Object.isFrozen(frozen.gatewayUrls), 'I7. the returned gatewayUrls array is frozen');
        expectThrows(() => { frozen.gatewayUrls.push('https://c.example'); }, 'I7. push() on the returned array throws rather than silently mutating this instance');
        assert(frozen.gatewayUrls.length === 2, 'I7. the attempted mutation left this instance unchanged');

        console.log('✓ Section I: gatewayUrls constructs an ordered, frozen, independently-validated list; a single gatewayUrl string remains exactly a one-element list; both fields together throws; an empty/non-array list throws');
    }

    console.log('\n✅ All User-Configurable IPFS Gateway Configuration Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
