import { IpfsNodeConfiguration, isValidIpfsNodeApiUrl, DEFAULT_IPFS_NODE_API_URL } from '../core/IpfsNodeConfiguration.js';
import { assert } from './support/Assert.js';

// User-Configurable IPFS Node API URL Boundary.
// Mirrors tests/IpfsGatewayConfiguration.test.js's own structure, one field
// instead of a gatewayUrl(s) list — content/IpfsContentStore.js only ever
// talks to a single Kubo node per instance.

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
        const config = new IpfsNodeConfiguration({ apiUrl: 'https://remote-node.example:5001' });
        assert(config.apiUrl === 'https://remote-node.example:5001', 'A1. apiUrl round-trips exactly for an already-clean URL');

        const localConfig = new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001' });
        assert(localConfig.apiUrl === 'http://127.0.0.1:5001', 'A2. plain http:// (a local node) is accepted, not just https://');

        assert(isValidIpfsNodeApiUrl('http://127.0.0.1:5001') === true, 'A3. isValidIpfsNodeApiUrl() accepts a well-formed http URL');
        assert(isValidIpfsNodeApiUrl('https://remote-node.example:5001') === true, 'A4. isValidIpfsNodeApiUrl() accepts a well-formed https URL');
        console.log('✓ Section A: a valid absolute http(s) apiUrl constructs and round-trips');
    }

    // ===============================================================
    // Section B — trailing slashes are normalized, mirroring content/
    // IpfsContentStore.js's own constructor exactly.
    // ===============================================================
    {
        const config = new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001///' });
        assert(config.apiUrl === 'http://127.0.0.1:5001', 'B1. trailing slashes are stripped');

        const padded = new IpfsNodeConfiguration({ apiUrl: '  http://127.0.0.1:5001  ' });
        assert(padded.apiUrl === 'http://127.0.0.1:5001', 'B2. surrounding whitespace is trimmed');
        console.log('✓ Section B: apiUrl is trimmed and trailing-slash-normalized');
    }

    // ===============================================================
    // Section C — rejection: empty, non-string, non-http(s), and
    // malformed values all throw, never silently degrade.
    // ===============================================================
    {
        expectThrows(() => new IpfsNodeConfiguration({ apiUrl: '' }), 'C1. an empty string throws');
        expectThrows(() => new IpfsNodeConfiguration({ apiUrl: '   ' }), 'C2. a whitespace-only string throws');
        expectThrows(() => new IpfsNodeConfiguration({ apiUrl: undefined }), 'C3. a missing apiUrl throws');
        expectThrows(() => new IpfsNodeConfiguration({ apiUrl: 42 }), 'C4. a non-string apiUrl throws');
        expectThrows(() => new IpfsNodeConfiguration({ apiUrl: 'not a url' }), 'C5. an unparseable string throws');
        expectThrows(() => new IpfsNodeConfiguration({ apiUrl: 'ftp://127.0.0.1:5001' }), 'C6. a non-http(s) protocol throws');
        assert(isValidIpfsNodeApiUrl('') === false, 'C7. isValidIpfsNodeApiUrl() itself rejects an empty string');
        assert(isValidIpfsNodeApiUrl(null) === false, 'C8. isValidIpfsNodeApiUrl() itself rejects null');
        console.log('✓ Section C: invalid apiUrl values all throw construction, never silently degrade');
    }

    // ===============================================================
    // Section D — equals()/toJSON(): value equality and plain-data shape.
    // ===============================================================
    {
        const a = new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001' });
        const b = new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001' });
        const c = new IpfsNodeConfiguration({ apiUrl: 'https://remote-node.example:5001' });
        assert(a.equals(b), 'D1. two configurations with the same apiUrl are value-equal');
        assert(!a.equals(c), 'D2. two configurations with different apiUrls are not equal');
        assert(!a.equals({ apiUrl: 'http://127.0.0.1:5001' }), 'D3. a plain object is never equal, even with matching fields');
        assert(JSON.stringify(a.toJSON()) === JSON.stringify({ apiUrl: 'http://127.0.0.1:5001' }), 'D4. toJSON() returns the plain-data shape storage/IpfsNodeConfigurationStore.js persists');
        console.log('✓ Section D: equals() is value equality; toJSON() is the plain persisted shape');
    }

    // ===============================================================
    // Section E — frozen, and the deployment default is exported unchanged.
    // ===============================================================
    {
        const config = new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001' });
        assert(Object.isFrozen(config), 'E1. an IpfsNodeConfiguration instance is frozen');
        assert(DEFAULT_IPFS_NODE_API_URL === 'http://127.0.0.1:5001', 'E2. the deployment default is byte-identical to content/IpfsContentStore.js\'s own DEFAULT_API_URL');
        console.log('✓ Section E: instances are frozen; the deployment default matches content/IpfsContentStore.js exactly');
    }

    console.log('\n✅ All User-Configurable IPFS Node API URL Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
