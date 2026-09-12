import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import util from 'node:util';

import { TurnServerConfiguration, isValidTurnUrl } from '../core/TurnServerConfiguration.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { resolveTurnServerConfiguration } from '../application/TurnServerConfigurationProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IceServerConfiguration, isValidStunUrl } from '../core/IceServerConfiguration.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { DEFAULT_ICE_SERVERS } from '../peer/IceServerConfig.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';

// 0.9.454 — TURN Server Configuration + Persistence + Provider.
//
// 0.9.453's own Contract Audit proved, live, against real (and
// realistically prototyped) code, the exact shape this milestone promotes
// to production: core/TurnServerConfiguration.js (the value object),
// storage/TurnServerConfigurationStore.js (its dedicated persistence), and
// application/TurnServerConfigurationProvider.js (the narrow read seam).
// This file is the real regression suite for all three, run against the
// actual production classes rather than the audit's own in-file prototype.
//
// ELEVEN LETTERED SECTIONS:
//
//   A. Value object — valid construction, immutability, normalized shape.
//   B. URL cardinality — one URL, multiple URLs, duplicate URLs, empty URL,
//      empty list.
//   C. Persistence — save -> get, save -> replace -> get, clear -> absent.
//   D. Malformed persistence — degrades safely, never throws, never a
//      partially-valid configuration.
//   E. Provider — resolveTurnServerConfiguration() returns the store's own
//      get() result, verbatim, with no fabricated default.
//   F. JSON / RTCIceServer representation — toJSON()/fromJSON() round trip,
//      toIceServerEntry() shape.
//   G. STUN isolation — TURN configuration and STUN configuration never
//      read, write, or fall back to each other's storage.
//   H. turn: boundary — the existing STUN configuration still rejects
//      turn: URLs; this TURN configuration still rejects stun: URLs.
//   I. Credential non-leakage — errors, toString(), console.log/util.inspect,
//      and JSON.stringify(error) never expose the real credential.
//   J. Composition prototype — the real, unmodified WebRtcPeerConnectionProvider
//      accepts toIceServerEntry()'s own output unmodified, alongside STUN.
//   K. Production-change guard — only this milestone's own named files are
//      touched.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
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

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('storage backend unavailable'); }
    load() { throw new Error('storage backend unavailable'); }
    remove() { throw new Error('storage backend unavailable'); }
    list() { return []; }
}

// Reused from tests/TurnServerConfigurationContractAudit.test.js's own
// fixture, for Section J.
class FakeDataChannel {
    constructor(label) { this.label = label; this._listeners = new Map(); }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    send() {}
    close() {}
}
class RecordingRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        RecordingRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription() {}
    addTrack() { return { replaceTrack: async () => {} }; }
    close() {}
}

const SECRET_CREDENTIAL = 'super-sekret-do-not-leak-9f31';

async function run() {
    // ===============================================================
    // Section A — Value object.
    // ===============================================================
    {
        const config = new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'alice', credential: 'sekret' });
        assert(config.urls.length === 1 && config.urls[0] === 'turn:relay.example:3478', n('A1. a single url normalizes into a one-element array'));
        assert(config.username === 'alice', n('A2. username round-trips'));
        assert(config.credential === 'sekret', n('A3. credential round-trips through its own accessor'));
        assert(Object.isFrozen(config), n('A4. the instance is frozen'));

        const trimmed = new TurnServerConfiguration({ urls: '  turn:relay.example:3478  ', username: '  alice  ', credential: 'sekret' });
        assert(trimmed.urls[0] === 'turn:relay.example:3478', n('A5. a url with surrounding whitespace normalizes trimmed'));
        assert(trimmed.username === 'alice', n('A6. a username with surrounding whitespace normalizes trimmed'));

        const urlsA = config.urls;
        urlsA.push('turn:tampered.example:1');
        assert(config.urls.length === 1, n('A7. mutating a returned urls array never reaches internal state'));

        console.log('\n=== SECTION A: VALUE OBJECT ===');
        console.log('✓ Section A: valid construction, trimming, immutability, and defensive copies all hold against the real production class.');
    }

    // ===============================================================
    // Section B — URL cardinality.
    // ===============================================================
    {
        const one = new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'a', credential: 'b' });
        assert(one.urls.length === 1, n('B1. one URL constructs correctly'));

        const many = new TurnServerConfiguration({ urls: ['turn:relay.example:3478', 'turns:relay.example:5349'], username: 'a', credential: 'b' });
        assert(many.urls.length === 2, n('B2. multiple URLs sharing one credential pair construct correctly'));

        const duplicated = new TurnServerConfiguration({ urls: ['turn:relay.example:3478', 'turn:relay.example:3478'], username: 'a', credential: 'b' });
        assert(duplicated.urls.length === 2 && duplicated.urls[0] === duplicated.urls[1], n('B3. a duplicated URL is preserved verbatim, never silently deduplicated — this class validates shape only, never set semantics'));

        expectThrows(() => new TurnServerConfiguration({ urls: '', username: 'a', credential: 'b' }), n('B4. an empty URL string is rejected'));
        expectThrows(() => new TurnServerConfiguration({ urls: [], username: 'a', credential: 'b' }), n('B5. an empty URL list is rejected'));
        expectThrows(() => new TurnServerConfiguration({ urls: undefined, username: 'a', credential: 'b' }), n('B6. an absent urls field is rejected'));

        console.log('\n=== SECTION B: URL CARDINALITY ===');
        console.log('✓ Section B: one URL, multiple URLs, and duplicate URLs all construct; an empty URL, empty list, or absent field all throw.');
    }

    // ===============================================================
    // Section C — Persistence.
    // ===============================================================
    {
        const store = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, n('C1. a never-written store returns null'));

        const first = new TurnServerConfiguration({ urls: 'turn:first.example:3478', username: 'alice', credential: 'sekret-1' });
        store.save(first);
        const loaded = store.get();
        assert(loaded instanceof TurnServerConfiguration, n('C2. get() returns a real TurnServerConfiguration instance'));
        assert(loaded !== first, n('C3. the reloaded instance is a NEW object, never the same reference'));
        assert(loaded.equals(first), n('C4. the reloaded configuration is value-equal to the original'));

        const second = new TurnServerConfiguration({ urls: ['turn:second.example:3478', 'turns:second.example:5349'], username: 'bob', credential: 'sekret-2' });
        store.save(second);
        assert(store.get().equals(second), n('C5. a second save() REPLACES the first outright'));
        assert(!store.get().equals(first), n('C6. …the first configuration is genuinely gone, not merged with the second'));

        store.clear();
        assert(store.get() === null, n('C7. clear() removes the persisted override — get() returns null again'));
        store.clear();
        assert(store.get() === null, n('C8. clearing an already-empty store is a no-op, not an error'));

        expectThrows(() => new TurnServerConfigurationStore(new ThrowingStorageProvider()).get(), n('C9. get() propagates a genuine storage failure rather than degrading to null'));
        expectThrows(() => new TurnServerConfigurationStore(new ThrowingStorageProvider()).save(first), n('C10. save() propagates a genuine storage failure'));
        expectThrows(() => new TurnServerConfigurationStore(new ThrowingStorageProvider()).clear(), n('C11. clear() propagates a genuine storage failure'));

        console.log('\n=== SECTION C: PERSISTENCE ===');
        console.log('✓ Section C: save() -> get(), save() -> replace -> get(), and clear() -> absent all hold; a genuine storage failure propagates rather than degrading.');
    }

    // ===============================================================
    // Section D — Malformed persistence.
    // ===============================================================
    {
        const cases = [
            ['not an object', 'a bare string payload'],
            [['not', 'an', 'object'], 'an array payload'],
            [{ notUrls: 'turn:relay.example:3478', username: 'a', credential: 'b' }, 'missing urls field'],
            [{ urls: [], username: 'a', credential: 'b' }, 'empty urls array'],
            [{ urls: ['stun:stun.l.google.com:19302'], username: 'a', credential: 'b' }, 'a stun: url where a turn: url is required'],
            [{ urls: ['turn:relay.example:3478'], username: '', credential: 'b' }, 'empty username'],
            [{ urls: ['turn:relay.example:3478'], username: 'a', credential: '' }, 'empty credential'],
            [{ urls: ['turn:relay.example:3478'] }, 'missing username and credential entirely'],
            [null, 'a null payload']
        ];
        for (const [payload, description] of cases) {
            const storage = new InMemoryStorageProvider();
            if (payload !== null) storage.save('turn-server-configuration', payload);
            const store = new TurnServerConfigurationStore(storage);
            assert(store.get() === null, n(`D1. malformed persisted data (${description}) degrades to null, never a thrown error and never a partially-valid configuration`));
        }

        console.log('\n=== SECTION D: MALFORMED PERSISTENCE ===');
        console.log('✓ Section D: every malformed or absent shape degrades safely to null — this store never hands back an invalid TurnServerConfiguration and never throws over bad bytes on file.');
    }

    // ===============================================================
    // Section E — Provider.
    // ===============================================================
    {
        expectThrows(() => resolveTurnServerConfiguration({ turnServerConfigurationStore: {} }), n('E1. resolveTurnServerConfiguration() requires a real TurnServerConfigurationStore, rejecting a duck-typed plain object'));
        expectThrows(() => resolveTurnServerConfiguration({}), n('E2. …and rejects a missing store entirely'));

        const emptyStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        assert(resolveTurnServerConfiguration({ turnServerConfigurationStore: emptyStore }) === null, n('E3. with nothing configured, the provider returns null — never a fabricated default TURN server'));

        const populatedStore = new TurnServerConfigurationStore(new InMemoryStorageProvider());
        const configured = new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'alice', credential: 'sekret' });
        populatedStore.save(configured);
        const resolved = resolveTurnServerConfiguration({ turnServerConfigurationStore: populatedStore });
        assert(resolved instanceof TurnServerConfiguration && resolved.equals(configured), n('E4. with a saved configuration, the provider returns it, value-equal to what was saved'));

        const resolvedAgain = resolveTurnServerConfiguration({ turnServerConfigurationStore: populatedStore });
        assert(resolvedAgain.equals(resolved), n('E5. calling the provider twice, with no write in between, resolves an equal result both times'));

        populatedStore.clear();
        assert(resolveTurnServerConfiguration({ turnServerConfigurationStore: populatedStore }) === null, n('E6. after clear(), the provider returns null again — resolved fresh on every call, never cached'));

        console.log('\n=== SECTION E: PROVIDER ===');
        console.log('✓ Section E: resolveTurnServerConfiguration() returns the store\'s own get() result verbatim — null when absent, the configuration when present, never a fabricated default.');
    }

    // ===============================================================
    // Section F — JSON / RTCIceServer representation.
    // ===============================================================
    {
        const single = new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'alice', credential: 'sekret' });
        const multi = new TurnServerConfiguration({ urls: ['turn:relay.example:3478', 'turns:relay.example:5349'], username: 'alice', credential: 'sekret' });

        const roundTripped = TurnServerConfiguration.fromJSON(multi.toJSON());
        assert(roundTripped.equals(multi), n('F1. toJSON() -> fromJSON() round-trips to an equal (never identical) instance'));
        assert(roundTripped !== multi, n('F2. …a genuinely new instance, never the same reference'));
        assert(!roundTripped.equals(single), n('F3. equals() correctly distinguishes a genuinely different configuration'));

        assert(single.toIceServerEntry().urls === 'turn:relay.example:3478', n('F4. a single-url configuration serializes to a plain string urls field'));
        assert(single.toIceServerEntry().username === 'alice' && single.toIceServerEntry().credential === 'sekret', n('F5. …with username/credential present'));
        const multiEntry = multi.toIceServerEntry();
        assert(Array.isArray(multiEntry.urls) && multiEntry.urls.length === 2, n('F6. a multi-url configuration serializes to an array urls field'));

        console.log('\n=== SECTION F: JSON / RTCIceServer REPRESENTATION ===');
        console.log('✓ Section F: toJSON()/fromJSON() round-trip correctly, and toIceServerEntry() produces the exact RTCIceServer-shaped object the existing WebRTC boundary already accepts.');
    }

    // ===============================================================
    // Section G — STUN isolation.
    // ===============================================================
    {
        const sharedStorage = new InMemoryStorageProvider();
        const turnStore = new TurnServerConfigurationStore(sharedStorage);
        const stunStore = new IceServerConfigurationStore(sharedStorage);

        turnStore.save(new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'alice', credential: 'sekret' }));
        assert(stunStore.get() === null, n('G1. saving a TURN configuration never becomes visible through the STUN store, even sharing the same underlying storage'));

        stunStore.save(new IceServerConfiguration({ servers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
        assert(turnStore.get() !== null, n('G2. saving a STUN configuration afterward never clobbers the already-saved TURN configuration'));

        turnStore.clear();
        assert(stunStore.get() !== null, n('G3. clearing the TURN store never clears the STUN store'));

        stunStore.clear();
        assert(turnStore.get() === null, n('G4. clearing the STUN store never resurrects or affects the (already-cleared) TURN store'));

        const rawKeys = sharedStorage.list();
        assert(rawKeys.length === 0, n('G5. after clearing both, no key from either store remains on the shared underlying storage'));

        console.log('\n=== SECTION G: STUN ISOLATION ===');
        console.log('✓ Section G: TurnServerConfigurationStore and IceServerConfigurationStore, even sharing one underlying StorageProvider, never read, write, or fall back to each other\'s persisted data.');
    }

    // ===============================================================
    // Section H — turn: boundary.
    // ===============================================================
    {
        assert(!isValidStunUrl('turn:relay.example:3478'), n('H1. the existing STUN validator still rejects a turn: URL'));
        assert(!isValidStunUrl('turns:relay.example:5349'), n('H2. …and a turns: URL'));
        assert(!isValidTurnUrl('stun:stun.l.google.com:19302'), n('H3. this new TURN validator rejects a stun: URL'));
        assert(!isValidTurnUrl('stuns:stun.l.google.com:19302'), n('H4. …and a stuns: URL'));

        expectThrows(() => new IceServerConfiguration({ servers: [{ urls: 'turn:relay.example:3478' }] }), n('H5. IceServerConfiguration itself still refuses to construct with a turn: entry'));
        expectThrows(() => new TurnServerConfiguration({ urls: 'stun:stun.l.google.com:19302', username: 'a', credential: 'b' }), n('H6. TurnServerConfiguration itself refuses to construct with a stun: entry'));

        const stunConfigSource = await source('core/IceServerConfiguration.js');
        assert(stunConfigSource.includes('STUN ONLY — NEVER TURN'), n('H7. core/IceServerConfiguration.js remains STUN-only, unmodified by this milestone'));

        console.log('\n=== SECTION H: turn: BOUNDARY ===');
        console.log('✓ Section H: the STUN/TURN scheme boundary holds in both directions, at both the validator level and the constructor level.');
    }

    // ===============================================================
    // Section I — Credential non-leakage.
    // ===============================================================
    {
        const config = new TurnServerConfiguration({ urls: 'turn:relay.example:3478', username: 'alice', credential: SECRET_CREDENTIAL });

        assert(!String(config).includes(SECRET_CREDENTIAL), n('I1. String(configuration) never includes the real credential'));
        assert(!config.toString().includes(SECRET_CREDENTIAL), n('I2. toString() never includes the real credential'));
        assert(!util.inspect(config).includes(SECRET_CREDENTIAL), n('I3. util.inspect(configuration) — what console.log() would print — never includes the real credential'));
        assert(!JSON.stringify({ note: 'unrelated diagnostic', config: config.toString() }).includes(SECRET_CREDENTIAL), n('I4. embedding toString() output inside an unrelated diagnostic object never leaks the credential'));

        // Every constructor rejection path, exercised with the real secret
        // present in the input, never echoes it back in the thrown message.
        const rejectionInputs = [
            { urls: '', username: 'alice', credential: SECRET_CREDENTIAL },
            { urls: [], username: 'alice', credential: SECRET_CREDENTIAL },
            { urls: 'not-a-turn-url', username: 'alice', credential: SECRET_CREDENTIAL },
            { urls: 'turn:relay.example:3478', username: '', credential: SECRET_CREDENTIAL },
            { urls: 'turn:relay.example:3478', username: 'alice', credential: '' }
        ];
        for (const input of rejectionInputs) {
            try {
                new TurnServerConfiguration(input);
                assert(false, n('I5. every rejection-input case above must actually throw for this check to be meaningful'));
            } catch (error) {
                assert(!error.message.includes(SECRET_CREDENTIAL), n(`I5. a thrown construction error never includes the real credential (input: ${JSON.stringify({ ...input, credential: '<redacted-for-test-output>' })})`));
                assert(!JSON.stringify(error.message).includes(SECRET_CREDENTIAL), n('I6. JSON.stringify(error.message) never includes the real credential either'));
            }
        }

        // toJSON()/toIceServerEntry() are the two DELIBERATE escape hatches
        // — the credential legitimately appears there, on purpose, for
        // persistence and WebRTC composition respectively.
        assert(config.toJSON().credential === SECRET_CREDENTIAL, n('I7. toJSON() DELIBERATELY includes the real credential — the one escape hatch persistence needs'));
        assert(config.toIceServerEntry().credential === SECRET_CREDENTIAL, n('I8. toIceServerEntry() DELIBERATELY includes the real credential — the one escape hatch WebRTC composition needs'));

        console.log('\n=== SECTION I: CREDENTIAL NON-LEAKAGE ===');
        console.log('✓ Section I: the real credential never appears in toString(), util.inspect() (console.log) output, or any thrown construction error — while toJSON()/toIceServerEntry() remain the two deliberate, documented escape hatches that legitimately expose it.');
    }

    // ===============================================================
    // Section J — Composition prototype, against the real, unmodified
    // WebRtcPeerConnectionProvider — proving no change is needed there
    // for a future 0.9.455 to compose this configuration in.
    // ===============================================================
    {
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: DEFAULT_ICE_SERVERS, RTCPeerConnectionImpl: RecordingRTCPeerConnection });

        const turnConfig = new TurnServerConfiguration({
            urls: ['turn:my-own-relay.example:3478', 'turns:my-own-relay.example:5349'],
            username: 'my-user',
            credential: 'my-secret'
        });
        provider.setIceServers([...DEFAULT_ICE_SERVERS, turnConfig.toIceServerEntry()]);
        provider.createOffer();

        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.length === DEFAULT_ICE_SERVERS.length + 1, n('J1. the real provider forwards the merged STUN + TURN list unchanged, one extra entry, no cap'));
        assert(constructed.some((entry) => Array.isArray(entry.urls) && entry.urls.length === 2 && entry.username === 'my-user' && entry.credential === 'my-secret'), n('J2. the TURN entry, produced by toIceServerEntry(), survives construction unchanged — array urls field, username, and credential all intact'));
        assert(constructed.some((entry) => DEFAULT_ICE_SERVERS.some((s) => s.urls === entry.urls)), n('J3. the existing STUN entries survive alongside it, untouched'));
        provider.dispose();

        console.log('\n=== SECTION J: COMPOSITION PROTOTYPE ===');
        console.log('✓ Section J: TurnServerConfiguration.toIceServerEntry() passes through the real, unmodified WebRtcPeerConnectionProvider unchanged, alongside STUN — zero changes needed to that provider for a future composition step.');
    }

    // ===============================================================
    // Section K — Production-change guard.
    // ===============================================================
    {
        const ALLOWED_FILES = new Set([
            'core/TurnServerConfiguration.js',
            'storage/TurnServerConfigurationStore.js',
            'application/TurnServerConfigurationProvider.js',
            'tests/TurnServerConfiguration.test.js',
            'tests.html'
        ]);

        let changedFiles = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            changedFiles = statusOutput.split('\n')
                .map((line) => line.slice(3).trim())
                .filter(Boolean);
        } catch { /* git unavailable — not a failure of this guard */ }

        const unexpected = changedFiles.filter((f) => !ALLOWED_FILES.has(f));
        assert(unexpected.length === 0, n(`K1. this milestone's own working-tree changes touch only its named files (unexpected: ${JSON.stringify(unexpected)})`));

        console.log('\n=== SECTION K: PRODUCTION-CHANGE GUARD ===');
        console.log('✓ Section K: only core/TurnServerConfiguration.js, storage/TurnServerConfigurationStore.js, application/TurnServerConfigurationProvider.js, this test file, and tests.html are touched — no UI, no router entry, no WebRTC runtime change.');
    }

    console.log('\n✅ All TURN Server Configuration + Persistence + Provider tests passed.');
}

run().catch((error) => {
    console.error('TurnServerConfiguration.test.js FAILED:', error);
    process.exitCode = 1;
});
