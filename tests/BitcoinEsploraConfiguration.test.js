
import { BitcoinEsploraConfiguration, isValidBitcoinEsploraApiUrl, DEFAULT_BITCOIN_ESPLORA_API_URL, DEFAULT_BITCOIN_ESPLORA_API_URLS } from '../core/BitcoinEsploraConfiguration.js';
import { assert } from './support/Assert.js';
import { readSource as source } from './support/SourceText.js';

// User-Configurable Bitcoin Esplora Endpoint Configuration Boundary.
// See tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js's own
// Section G for the seven-times-reconfirmed DEFER this milestone reopens,
// on the concrete "no way for a user to route around a down default" gap
// that audit itself named as the one thing that would legitimately reopen
// it, and core/BitcoinEsploraConfiguration.js's own header for the full
// seam this closes.
//
// Section A: construction — a valid absolute http(s) URL round-trips
// Section B: trailing-slash normalization, mirroring the four existing
//            anchoring/BitcoinEsplora*.js consumer classes
// Section C: rejection — malformed/non-URL/non-http(s) values all throw
// Section D: immutability — frozen, no setter, no mutation reaches another instance
// Section E: equals() — value equality, never identity
// Section F: toJSON() — plain-data shape only
// Section G: DEFAULT_BITCOIN_ESPLORA_API_URL — a plain exported constant,
//            never silently substituted by the constructor itself
// Section H: architecture sweep — no persistence, no network, no ui/, no
//            extra fields
// Section I: several endpoints, in the order they are tried

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
        const config = new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' });
        assert(config.apiUrl === 'https://my-esplora-host.example/api', 'A1. apiUrl round-trips exactly for an already-clean URL');

        const httpConfig = new BitcoinEsploraConfiguration({ apiUrl: 'http://localhost:3000' });
        assert(httpConfig.apiUrl === 'http://localhost:3000', 'A2. plain http:// (a local Esplora instance) is accepted, not just https://');

        assert(isValidBitcoinEsploraApiUrl('https://blockstream.info/api') === true, 'A3. isValidBitcoinEsploraApiUrl() itself accepts a well-formed https URL');
        assert(isValidBitcoinEsploraApiUrl('http://127.0.0.1:3000') === true, 'A4. isValidBitcoinEsploraApiUrl() accepts a well-formed http URL');
        console.log('✓ Section A: a valid absolute http(s) apiUrl constructs and round-trips');
    }

    // ===============================================================
    // Section B — trailing-slash normalization.
    // ===============================================================
    {
        const config = new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api/' });
        assert(config.apiUrl === 'https://my-esplora-host.example/api', 'B1. one trailing slash is stripped');

        const configMultiSlash = new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api///' });
        assert(configMultiSlash.apiUrl === 'https://my-esplora-host.example/api', 'B2. multiple trailing slashes are all stripped');

        const configWithWhitespace = new BitcoinEsploraConfiguration({ apiUrl: '  https://my-esplora-host.example/api  ' });
        assert(configWithWhitespace.apiUrl === 'https://my-esplora-host.example/api', 'B3. surrounding whitespace is trimmed');
        console.log('✓ Section B: trailing slashes and surrounding whitespace are normalized away');
    }

    // ===============================================================
    // Section C — rejection: malformed, non-URL, and non-http(s) values
    // all throw at construction time.
    // ===============================================================
    {
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: '' }), 'C1. an empty string throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: '   ' }), 'C2. a whitespace-only string throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: 'not-a-url' }), 'C3. a non-URL string throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: 'blockstream.info' }), 'C4. a bare host with no scheme throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: 'ftp://blockstream.info/api' }), 'C5. a non-http(s) scheme throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: 'javascript:alert(1)' }), 'C6. a javascript: URL throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: null }), 'C7. null throws');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: undefined }), 'C8. undefined/omitted throws — this class never invents a default, see this file\'s own Section G');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: 42 }), 'C9. a non-string value throws');
        expectThrows(() => new BitcoinEsploraConfiguration({}), 'C10. an empty options object throws');
        expectThrows(() => new BitcoinEsploraConfiguration(), 'C11. no arguments at all throws');

        assert(isValidBitcoinEsploraApiUrl('not-a-url') === false, 'C12. isValidBitcoinEsploraApiUrl() itself rejects a non-URL string');
        assert(isValidBitcoinEsploraApiUrl(42) === false, 'C13. isValidBitcoinEsploraApiUrl() rejects a non-string value without throwing');
        console.log('✓ Section C: every malformed, non-URL, or non-http(s) apiUrl is rejected at construction time');
    }

    // ===============================================================
    // Section D — immutability.
    // ===============================================================
    {
        const config = new BitcoinEsploraConfiguration({ apiUrl: 'https://blockstream.info/api' });
        assert(Object.isFrozen(config), 'D1. every instance is frozen');
        expectThrows(() => { config._apiUrl = 'https://evil.example'; }, 'D2. writing to the private field throws in strict mode / is a no-op that leaves the getter unchanged');
        assert(config.apiUrl === 'https://blockstream.info/api', 'D3. apiUrl is unchanged after the attempted write');
        assert(typeof Object.getOwnPropertyDescriptor(BitcoinEsploraConfiguration.prototype, 'apiUrl').set === 'undefined', 'D4. apiUrl has no setter on the prototype');
        console.log('✓ Section D: every BitcoinEsploraConfiguration is immutable by construction');
    }

    // ===============================================================
    // Section E — equals().
    // ===============================================================
    {
        const a = new BitcoinEsploraConfiguration({ apiUrl: 'https://blockstream.info/api' });
        const b = new BitcoinEsploraConfiguration({ apiUrl: 'https://blockstream.info/api' });
        const c = new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' });

        assert(a !== b, 'E1. two independently constructed instances with the same URL are not the same object');
        assert(a.equals(b), 'E2. …but they are value-equal');
        assert(!a.equals(c), 'E3. two instances with different URLs are not equal');
        assert(!a.equals({ apiUrl: 'https://blockstream.info/api' }), 'E4. a plain object with a matching field is never equal');
        assert(!a.equals(null) && !a.equals(undefined), 'E5. equals() against null/undefined is false, never a throw');
        console.log('✓ Section E: equals() compares by value, never by reference');
    }

    // ===============================================================
    // Section F — toJSON().
    // ===============================================================
    {
        const config = new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' });
        const json = config.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ apiUrls: ['https://my-esplora-host.example/api'] }), 'F1. toJSON() returns exactly { apiUrls }, the list shape even for one endpoint');
        assert(Object.keys(json).length === 1, 'F2. toJSON() carries exactly one field');
        console.log('✓ Section F: toJSON() is a plain, single-field data shape');
    }

    // ===============================================================
    // Section G — DEFAULT_BITCOIN_ESPLORA_API_URL.
    // ===============================================================
    {
        assert(DEFAULT_BITCOIN_ESPLORA_API_URL === 'https://blockstream.info/api', 'G1. the exported default matches the host every Bitcoin Esplora consumer class in this codebase already hardcodes');
        assert(isValidBitcoinEsploraApiUrl(DEFAULT_BITCOIN_ESPLORA_API_URL), 'G2. the default itself is a valid apiUrl by this file\'s own rule');
        expectThrows(() => new BitcoinEsploraConfiguration(), 'G3. the constructor never falls back to DEFAULT_BITCOIN_ESPLORA_API_URL on its own');
        console.log('✓ Section G: DEFAULT_BITCOIN_ESPLORA_API_URL is a plain constant a caller consults explicitly');
    }

    // ===============================================================
    // Section H — architecture sweep.
    // ===============================================================
    {
        const configSource = await source('core/BitcoinEsploraConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/localStorage|StorageProvider/.test(configExecutable), 'H1. no persistence of any kind');
        assert(!/\bfetch\s*\(/.test(configExecutable), 'H2. no fetch() call anywhere');
        assert(!/from\s*['"][^'"]*ui\//.test(configExecutable), 'H3. no import from ui/ — this is a pure core/ value object');
        assert(!/timeout|retry|healthCheck|priority/i.test(configExecutable), 'H4. none of the speculative fields appear');
        assert(!/InfrastructureEndpointConfiguration/.test(configExecutable), 'H5. no generic InfrastructureEndpointConfiguration abstraction');
        console.log('✓ Section H: architecture sweep confirms no persistence, no network call, no ui/ dependency, and no speculative fields');
    }

    // ===============================================================
    // Section I — several endpoints, in the order they are tried.
    // ===============================================================
    {
        const config = new BitcoinEsploraConfiguration({ apiUrls: ['https://a.example/api/', ' https://b.example/api '] });
        assert(JSON.stringify(config.apiUrls) === JSON.stringify(['https://a.example/api', 'https://b.example/api']),
            'I1. apiUrls keeps the order given, each entry trimmed and normalized');
        assert(config.apiUrl === 'https://a.example/api', 'I2. apiUrl is the first entry');
        assert(Object.isFrozen(config.apiUrls), 'I3. the list is frozen');
        assert(JSON.stringify(config.toJSON()) === JSON.stringify({ apiUrls: ['https://a.example/api', 'https://b.example/api'] }), 'I4. toJSON() carries the whole list');
        assert(!config.equals(new BitcoinEsploraConfiguration({ apiUrls: ['https://b.example/api', 'https://a.example/api'] })), 'I5. order matters for equality');
        assert(config.equals(new BitcoinEsploraConfiguration({ apiUrls: ['https://a.example/api', 'https://b.example/api'] })), 'I6. same list, same order: equal');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrls: [] }), 'I7. an empty list is refused');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrls: ['https://a.example/api', 'not-a-url'] }), 'I8. one invalid entry refuses the whole list');
        expectThrows(() => new BitcoinEsploraConfiguration({ apiUrl: 'https://a.example/api', apiUrls: ['https://b.example/api'] }), 'I9. apiUrl and apiUrls together are refused');
        assert(DEFAULT_BITCOIN_ESPLORA_API_URLS[0] === DEFAULT_BITCOIN_ESPLORA_API_URL && DEFAULT_BITCOIN_ESPLORA_API_URLS.length >= 2,
            'I10. the default list starts with DEFAULT_BITCOIN_ESPLORA_API_URL and holds a second endpoint to fail over to');
        assert(new BitcoinEsploraConfiguration({ apiUrls: [...DEFAULT_BITCOIN_ESPLORA_API_URLS] }).apiUrls.length === DEFAULT_BITCOIN_ESPLORA_API_URLS.length,
            'I11. every default endpoint is itself valid');
        console.log('✓ Section I: several endpoints construct, keep their order, serialize as a list, and the defaults are valid');
    }

    console.log('\n✅ All User-Configurable Bitcoin Esplora Endpoint Configuration Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
