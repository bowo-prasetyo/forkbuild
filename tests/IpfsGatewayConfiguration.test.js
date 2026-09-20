import { readFile } from 'node:fs/promises';

import { IpfsGatewayConfiguration, isValidIpfsGatewayUrl, DEFAULT_IPFS_GATEWAY_URL } from '../core/IpfsGatewayConfiguration.js';

// 0.9.665 — User-Configurable IPFS Gateway Configuration Boundary.
// Mirrors tests/ArweaveGatewayConfiguration.test.js's own Sections A-H
// exactly, minus its 0.9.440 Section I (gatewayUrls list) — see core/
// IpfsGatewayConfiguration.js's own header for why this class stays
// single-value: content/IpfsGatewayContentStore.js only ever supports one
// gateway per instance.

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
        assert(JSON.stringify(json) === JSON.stringify({ gatewayUrl: 'https://gateway.pinata.cloud' }), 'F1. toJSON() returns exactly { gatewayUrl }');
        assert(Object.keys(json).length === 1, 'F2. toJSON() carries exactly one field');
        console.log('✓ Section F: toJSON() is a plain, single-field data shape');
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
    // no extra fields, no list/failover, no generic abstraction.
    // ===============================================================
    {
        const configSource = await source('core/IpfsGatewayConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/localStorage|StorageProvider/.test(configExecutable), 'H1. no persistence of any kind in this file\'s own executable code');
        assert(!/\bfetch\s*\(/.test(configExecutable), 'H2. no fetch() call anywhere — this file never makes a network request');
        assert(!/from\s*['"][^'"]*ui\//.test(configExecutable), 'H3. no import from ui/ — this is a pure core/ value object');
        assert(!/timeout|retry|healthCheck|priority/i.test(configExecutable), 'H4. none of the speculative fields appear in this file\'s own executable code');
        assert(!/InfrastructureEndpointConfiguration/.test(configExecutable), 'H5. no generic InfrastructureEndpointConfiguration abstraction');
        assert(!/gatewayUrls/.test(configExecutable), 'H6. no gatewayUrls/list/failover shape — content/IpfsGatewayContentStore.js only ever supports one gateway per instance, so this class deliberately never grows Arweave\'s later multi-gateway extension');
        console.log('✓ Section H: architecture sweep confirms no persistence, no network call, no ui/ dependency, no speculative fields, and no list/failover shape');
    }

    console.log('\n✅ All User-Configurable IPFS Gateway Configuration Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
