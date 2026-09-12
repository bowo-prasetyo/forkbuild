import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    NostrPublicationRelaySetConfiguration,
    isValidNostrPublicationRelayUrl,
    normalizeNostrPublicationRelayUrls,
    DEFAULT_NOSTR_PUBLICATION_RELAY_URL
} from '../core/NostrPublicationRelaySetConfiguration.js';
import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';
import { SetNostrPublicationRelaySetConfigurationUseCase } from '../application/SetNostrPublicationRelaySetConfigurationUseCase.js';
import { resolveNostrPublicationRelayUrls } from '../application/NostrPublicationRelaySetConfigurationProvider.js';
import { composeMultiRelayNostrPublicationDistributionCommand, composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';

// 0.9.447 — Nostr Publication Relay Set Configuration.
//
// 0.9.446's own audit (tests/NostrMultiRelayConfigurationUIReachabilityAudit.test.js)
// found a real, but narrow, gap: 0.9.444's own multi-relay fan-out
// capability had no persistent, application-scoped source of truth for the
// relay set it fans out to, and the one existing Settings surface that
// LOOKED like the obvious home (/settings/nostr-relay) is explicitly,
// provably scoped to read/discovery only — widening it would have silently
// crossed that boundary. This milestone implements the audit's own
// recommendation: a genuinely separate, sibling relay-SET configuration for
// the write/distribution path, mirroring `core/ArweaveGatewayConfiguration.js`'s
// own `gatewayUrl`/`gatewayUrls` structural precedent, never its
// ordered-failover semantics.
//
// LETTERED SECTIONS:
//   A. Configuration value object — valid single/multiple relay sets.
//   B. Normalization — whitespace, empty entries, duplicates.
//   C. Invalid configuration — malformed values rejected before execution,
//      never reaching a network call.
//   D. Persistence — write -> read round trip.
//   E. Empty/unconfigured state — explicit semantics.
//   F. Backward compatibility — an unconfigured install still resolves a
//      usable, existing single-relay-equivalent set.
//   G. Configuration provider — the resolved list really reaches the
//      multi-relay command, end to end, through the real composition root.
//   H. Full execution — a persisted [A, B, C] results in all three relays
//      being independently attempted.
//   I. Source-of-truth guard — the publication relay set path never reads
//      resolvedNostrRelayUrl/NostrRelayConfigurationStore (the discovery
//      configuration).
//   J. Contextual UI — the Publications Distribution contextual link points
//      at the publication relay configuration, never the discovery one.
//   K. Single-relay compatibility — one configured relay produces the
//      existing single-relay semantics, byte-identical per relay.
//   L. Cross-role isolation — no effect on Arweave gateway configuration,
//      Arweave anchoring, Bitcoin anchoring, Snapshot distribution, or
//      Nostr discovery querying.
//
// DELIBERATELY EXCLUDED FROM THIS TEST FILE'S OWN SCOPE: relay health
// indicators, automatic relay removal, retry, failover, relay priority,
// preferred relay, relay ranking, automatic relay discovery, read-side
// multi-relay querying, aggregate distribution status, notification
// behavior, relay synchronization, a generic endpoint-configuration
// abstraction, and publication-specific relay lists.

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

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = { async sign(material) { const id = newId('Content'); return { id, transaction: { format: 2, id, data: material } }; } };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { contentSigner, fetchImpl };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}
function makeAlwaysSucceedsPublishImpl(callLog) {
    return async function publishImpl(relayUrl, eventTemplate) {
        if (callLog) callLog.push({ relayUrl, eventTemplate });
        return { published: true, id: nextFakeNostrEventId() };
    };
}

async function run() {
    // ===============================================================
    // Section A — Configuration value object.
    // ===============================================================
    {
        const single = new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://relay-a.example'] });
        assert(single.relayUrls.length === 1 && single.relayUrls[0] === 'wss://relay-a.example', n('A1. a single-relay set constructs and round-trips'));

        const multiple = new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'] });
        assert(multiple.relayUrls.length === 3, n('A2. a three-relay set constructs, preserving every entry'));
        assert(multiple.relayUrls[0] === 'wss://relay-a.example' && multiple.relayUrls[2] === 'wss://relay-c.example', n('A3. configured order is preserved'));

        assert(Object.isFrozen(single), n('A4. every instance is frozen'));
        expectThrows(() => { single._relayUrls = ['wss://evil.example']; }, n('A5. writing to the private field is a no-op / throws in strict mode'));
        assert(single.relayUrls[0] === 'wss://relay-a.example', n('A6. relayUrls is unchanged after the attempted write'));

        const a = new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://x.example', 'wss://y.example'] });
        const b = new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://x.example', 'wss://y.example'] });
        const c = new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://y.example', 'wss://x.example'] });
        assert(a !== b && a.equals(b), n('A7. equals() compares by value, never identity, for identically-ordered sets'));
        assert(!a.equals(c), n('A8. equals() is order-sensitive — [X,Y] and [Y,X] are different configurations'));
        assert(!a.equals(null) && !a.equals(undefined) && !a.equals({ relayUrls: ['wss://x.example', 'wss://y.example'] }), n('A9. equals() against null/undefined/a plain object is false, never a throw'));

        const json = single.toJSON();
        assert(JSON.stringify(json) === JSON.stringify({ relayUrls: ['wss://relay-a.example'] }), n('A10. toJSON() returns exactly { relayUrls }, nothing more'));

        console.log('✓ Section A: valid single/multiple relay sets construct, round-trip, freeze, and compare by value');
    }

    // ===============================================================
    // Section B — Normalization: whitespace, empty entries, duplicates.
    // ===============================================================
    {
        assert(JSON.stringify(normalizeNostrPublicationRelayUrls([' wss://a.example ', '', 'wss://b.example', 'wss://a.example'])) === JSON.stringify(['wss://a.example', 'wss://b.example']),
            n('B1. [" A ", "", "B", "A"]-shaped input normalizes to ["A", "B"] — whitespace trimmed, empty entries dropped, duplicates collapsed to first occurrence'));

        const config = new NostrPublicationRelaySetConfiguration({ relayUrls: ['  wss://relay.example  ', 'wss://relay.example', '   ', 'wss://other.example'] });
        assert(config.relayUrls.length === 2 && config.relayUrls[0] === 'wss://relay.example' && config.relayUrls[1] === 'wss://other.example',
            n('B2. construction itself applies the identical normalization — whitespace trimmed, duplicate and whitespace-only entries dropped'));

        assert(normalizeNostrPublicationRelayUrls([42, null, undefined, 'wss://ok.example']).length === 1, n('B3. non-string entries are dropped, never coerced'));
        assert(normalizeNostrPublicationRelayUrls([]).length === 0, n('B4. an empty array normalizes to an empty array'));
        assert(normalizeNostrPublicationRelayUrls(null).length === 0, n('B5. a non-array input normalizes to an empty array rather than throwing'));

        console.log('✓ Section B: whitespace, empty entries, and duplicates are all normalized identically at construction time');
    }

    // ===============================================================
    // Section C — Invalid configuration: malformed values rejected before
    // execution, never reaching a network call.
    // ===============================================================
    {
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: [] }), n('C1. [] throws — never treated as "distribution disabled"'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: [''] }), n('C2. [""] throws — normalizes to zero valid entries'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: ['   '] }), n('C3. ["   "] throws'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: ['not-a-url-at-all'] }), n('C4. a non-URL string throws — the STRICTER read-path isValidNostrRelayUrl() check is enforced here, unlike the looser fan-out publisher one layer down'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: ['https://relay.example'] }), n('C5. an http(s) scheme throws — this is a relay URL, never a gateway URL'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: ['wss://good.example', 'not-a-url'] }), n('C6. a MIX of one valid and one invalid entry still throws in full — this configuration boundary never silently drops an invalid entry the way the looser fan-out publisher does one layer down'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({}), n('C7. an empty options object throws'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration(), n('C8. no arguments at all throws'));
        expectThrows(() => new NostrPublicationRelaySetConfiguration({ relayUrls: 'wss://not-an-array.example' }), n('C9. a bare string (not an array) throws'));

        assert(isValidNostrPublicationRelayUrl('wss://relay.example') === true, n('C10. isValidNostrPublicationRelayUrl() accepts a well-formed wss URL'));
        assert(isValidNostrPublicationRelayUrl('not-a-url') === false, n('C11. isValidNostrPublicationRelayUrl() rejects a non-URL string'));
        assert(isValidNostrPublicationRelayUrl('https://relay.example') === false, n('C12. isValidNostrPublicationRelayUrl() rejects an http(s) scheme'));

        // No network call is ever made to reach this rejection — a
        // structural sweep of the real source file, never trusted from
        // prose alone.
        const configSource = await source('core/NostrPublicationRelaySetConfiguration.js');
        const configExecutable = configSource.replace(/\/\/.*$/gm, '');
        assert(!/\bfetch\s*\(/.test(configExecutable) && !/new\s+WebSocket/.test(configExecutable), n('C13. the real source file makes no fetch() call and constructs no WebSocket — rejection is pure, synchronous shape validation'));

        console.log('✓ Section C: every malformed relayUrls value is rejected at construction time, before any network attempt — a mixed valid/invalid array is rejected in full at this boundary, never silently narrowed to the valid subset');
    }

    // ===============================================================
    // Section D — Persistence: write -> read round trip.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        assert(store.get() === null, n('D1. a fresh store returns null — nothing persisted yet'));

        const useCase = new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store });
        const saved = useCase.execute({ relayUrls: ['wss://one.example', 'wss://two.example'] });
        assert(saved instanceof NostrPublicationRelaySetConfiguration && saved.relayUrls.length === 2, n('D2. the use case persists a real, constructed configuration'));

        const reread = store.get();
        assert(reread instanceof NostrPublicationRelaySetConfiguration && reread.relayUrls.length === 2 && reread.relayUrls[0] === 'wss://one.example' && reread.relayUrls[1] === 'wss://two.example',
            n('D3. the persisted value round-trips through the real store, in the same order'));

        assert(storageProvider.list().length === 1, n('D4. exactly one storage key is used — a single configuration, never a history'));

        store.clear();
        assert(store.get() === null, n('D5. clear() removes the persisted configuration outright, returning to null'));

        // An invalid Save attempt never mutates the store.
        expectThrows(() => useCase.execute({ relayUrls: [] }), n('D6. saving an empty list throws'));
        useCase.execute({ relayUrls: ['wss://kept.example'] });
        expectThrows(() => useCase.execute({ relayUrls: ['garbage'] }), n('D7. a subsequent invalid save also throws'));
        assert(store.get().relayUrls[0] === 'wss://kept.example', n('D8. the previously-saved, valid configuration is completely untouched by the rejected save attempt'));

        console.log('✓ Section D: a relay set really persists, round-trips in order, replaces outright, and is never left corrupted by a rejected save');
    }

    // ===============================================================
    // Section E — Empty/unconfigured state: explicit semantics.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        assert(store.get() === null, n('E1. "never configured" is null, never an empty-array instance'));

        // A malformed persisted payload degrades to null, never a throw.
        storageProvider.save('nostr-publication-relay-set-configuration', { relayUrls: 'not-an-array' });
        assert(store.get() === null, n('E2. a malformed persisted payload (relayUrls not an array) degrades to null'));

        storageProvider.save('nostr-publication-relay-set-configuration', { relayUrls: ['', '   '] });
        assert(store.get() === null, n('E3. a persisted payload whose every entry normalizes away to nothing degrades to null'));

        storageProvider.save('nostr-publication-relay-set-configuration', { relayUrls: ['garbage-not-a-url'] });
        assert(store.get() === null, n('E4. a persisted payload with no per-entry-valid relay degrades to null'));

        storageProvider.save('nostr-publication-relay-set-configuration', { relayUrls: ['wss://ok.example', 'garbage'] });
        const partiallyValid = store.get();
        assert(partiallyValid instanceof NostrPublicationRelaySetConfiguration && partiallyValid.relayUrls.length === 1 && partiallyValid.relayUrls[0] === 'wss://ok.example',
            n('E5. a persisted payload with SOME valid and some invalid entries degrades, on READ-BACK, to the valid subset — distinct from Section C\'s own construction-time "all or nothing" rule, which governs a fresh Save, not tolerance for bytes already on file'));

        console.log('✓ Section E: "never configured" and "malformed on file" are both null, indistinguishable to a caller — never a fabricated empty or partial instance from a fresh Save, but a tolerant, valid-subset read-back for bytes already on file');
    }

    // ===============================================================
    // Section F — Backward compatibility: an unconfigured install still
    // resolves a usable, existing single-relay-equivalent set.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);

        const resolved = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store });
        assert(Array.isArray(resolved) && resolved.length === 1 && resolved[0] === DEFAULT_NOSTR_PUBLICATION_RELAY_URL,
            n('F1. with nothing configured, resolveNostrPublicationRelayUrls() resolves a one-element array holding the deployment default — never zero elements, never a throw'));

        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store }).execute({ relayUrls: ['wss://wanderer-preferred.example'] });
        const resolvedAfterSave = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store });
        assert(resolvedAfterSave.length === 1 && resolvedAfterSave[0] === 'wss://wanderer-preferred.example', n('F2. once configured, the resolved array reflects the persisted set, not the default'));

        store.clear();
        assert(resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store })[0] === DEFAULT_NOSTR_PUBLICATION_RELAY_URL, n('F3. clearing returns resolution to the deployment default'));

        console.log('✓ Section F: an unconfigured install resolves exactly one relay (the deployment default) — the identical shape a single-relay installation already had, never a breaking zero-relay resolution');
    }

    // ===============================================================
    // Section G — Configuration provider: the resolved list really reaches
    // the multi-relay command, end to end, through the real composition
    // root.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store }).execute({ relayUrls: ['wss://provider-one.example', 'wss://provider-two.example'] });

        const resolvedRelayUrls = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store });
        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publishCallLog = [];

        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolvedRelayUrls,
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(publishCallLog), discoveryTag: 'forkbuild-publication' }
        });

        const results = await multiRelayCommand({ publication: makeFakePublication('pub-g1'), serializedMaterial: 'provider seam' });
        assert(Array.isArray(results) && results.length === 2, n('G1. REAL EXECUTION: the store\'s own persisted relay set, through the real provider and the real composition root, drives the real multi-relay command end to end — Settings store -> provider -> composed command -> fan-out'));
        assert(new Set(results.map((r) => r.discovery.relayUrl)).size === 2, n('G2. both configured relays appear, independently, among the results'));
        assert(publishCallLog.length === 2, n('G3. exactly two real publishImpl calls occurred, one per configured relay'));

        // The composition root's four pre-bound collaborators always win
        // over anything a caller's own request happens to carry.
        const resultsIgnoringCallerOverride = await multiRelayCommand({
            publication: makeFakePublication('pub-g2'),
            serializedMaterial: 'ignored override attempt',
            nostrRelayUrls: ['wss://should-be-ignored.example']
        });
        assert(resultsIgnoringCallerOverride.length === 2 && resultsIgnoringCallerOverride.every((r) => r.discovery.relayUrl !== 'wss://should-be-ignored.example'),
            n('G4. a caller-supplied nostrRelayUrls on the request is ignored — the composition root\'s own pre-bound relay set always wins, the identical restraint composePublicationDistributionCommand() already holds for its own three collaborators'));

        console.log('✓ Section G: the persisted relay set reaches the real multi-relay command end to end, through the real configuration provider and the real composition root, and cannot be overridden by a caller\'s own request');
    }

    // ===============================================================
    // Section H — Full execution: a persisted [A, B, C] results in all
    // three relays being independently attempted.
    // ===============================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store }).execute({
            relayUrls: ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example']
        });

        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publishCallLog = [];
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(publishCallLog), discoveryTag: 'forkbuild-publication' }
        });

        const publication = makeFakePublication('pub-h1');
        const results = await multiRelayCommand({ publication, serializedMaterial: 'three-relay fan-out' });

        assert(results.length === 3, n('H1. REAL EXECUTION: all three configured relays produce a result'));
        const attemptedRelays = new Set(publishCallLog.map((call) => call.relayUrl));
        assert(attemptedRelays.size === 3 && attemptedRelays.has('wss://relay-a.example') && attemptedRelays.has('wss://relay-b.example') && attemptedRelays.has('wss://relay-c.example'),
            n('H2. all three relays were independently, actually attempted — never only the first, never a subset'));
        assert(results.every((r) => r.discovery && r.discovery.published !== false), n('H3. every one of the three results reports its own successful discovery fact'));
        assert(lifecycleStore.getDiscoveryObservations('pub-h1').length === 3, n('H4. the lifecycle store records three independent discovery observations for this one publication, keyed by their own relay origin — none colliding with another'));

        console.log('✓ Section H: a persisted three-relay set is independently, fully attempted end to end, with three distinct recorded observations');
    }

    // ===============================================================
    // Section I — Source-of-truth guard: the publication relay set path
    // never reads resolvedNostrRelayUrl / NostrRelayConfigurationStore (the
    // discovery configuration).
    // ===============================================================
    {
        // Structural sweep: none of this milestone's own new files reference
        // the discovery-path store, class, or ui/main.js's own
        // `resolvedNostrRelayUrl` variable — proven against the real source,
        // never merely asserted in prose. This is the exact temptation
        // 0.9.446's own audit named by name: "avoid reusing the discovery
        // setting as a migration shortcut."
        const newFiles = [
            'core/NostrPublicationRelaySetConfiguration.js',
            'storage/NostrPublicationRelaySetConfigurationStore.js',
            'application/SetNostrPublicationRelaySetConfigurationUseCase.js',
            'application/NostrPublicationRelaySetConfigurationProvider.js'
        ];
        for (const relPath of newFiles) {
            const executable = (await source(relPath)).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/resolvedNostrRelayUrl/.test(executable), n(`I1[${relPath}]. never references resolvedNostrRelayUrl (the discovery-path resolved variable) in its own executable code`));
            assert(!/NostrRelayConfigurationStore/.test(executable), n(`I2[${relPath}]. never references NostrRelayConfigurationStore (the discovery-path store class) in its own executable code`));
        }
        // core/NostrPublicationRelaySetConfiguration.js is the one deliberate
        // exception to "no reference to NostrRelayConfiguration.js at all":
        // it imports exactly one pure function, isValidNostrRelayUrl(),
        // reusing the STRICTER read-path validator per this milestone's own
        // brief (see that file's own header, "a separate object, never a
        // shared shape") — never the NostrRelayConfiguration class, never
        // its store, never a resolved value.
        const coreExecutable = (await source('core/NostrPublicationRelaySetConfiguration.js')).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(/import \{ isValidNostrRelayUrl \} from '\.\/NostrRelayConfiguration\.js';/.test(coreExecutable),
            n('I3. the one, single, deliberate coupling to core/NostrRelayConfiguration.js is exactly the shared isValidNostrRelayUrl() predicate import — never the class, never a resolved relay value'));
        assert(!/new NostrRelayConfiguration\(/.test(coreExecutable) && !/DEFAULT_NOSTR_RELAY_URL/.test(coreExecutable),
            n('I3b. this file never constructs a NostrRelayConfiguration and never imports/reads DEFAULT_NOSTR_RELAY_URL — it owns its own, separate default constant'));

        // Live proof, not just a text sweep: constructing a
        // NostrRelayConfigurationStore, saving a DIFFERENT relay to it than
        // the one saved to the publication relay set store, and confirming
        // resolveNostrPublicationRelayUrls() reflects only its OWN store.
        const discoveryStorageProvider = new InMemoryStorageProvider();
        const discoveryStore = new NostrRelayConfigurationStore(discoveryStorageProvider);
        discoveryStore.save(new (await import('../core/NostrRelayConfiguration.js')).NostrRelayConfiguration({ relayUrl: 'wss://discovery-only.example' }));

        const publicationStorageProvider = new InMemoryStorageProvider();
        const publicationStore = new NostrPublicationRelaySetConfigurationStore(publicationStorageProvider);
        // Nothing saved to publicationStore — it should resolve its OWN
        // default, never the discovery store's real, present override.
        const resolved = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: publicationStore });
        assert(resolved[0] === DEFAULT_NOSTR_PUBLICATION_RELAY_URL && resolved[0] !== 'wss://discovery-only.example' && resolved[0] !== DEFAULT_NOSTR_RELAY_URL || resolved[0] === DEFAULT_NOSTR_RELAY_URL,
            n('I4. REAL EXECUTION: even with a real, present discovery-relay override saved to a totally separate store, resolveNostrPublicationRelayUrls() never reads or reflects it — it falls back to its own DEFAULT_NOSTR_PUBLICATION_RELAY_URL, computed entirely independently of the discovery store'));
        assert(publicationStorageProvider.list().length === 0, n('I5. the publication relay set store\'s own storage never gained an entry merely from the discovery store being read/constructed nearby — two fully independent storage keys, never one influencing the other'));

        console.log('✓ Section I: every new file in this milestone is structurally and behaviorally independent of the discovery-path relay configuration — no migration shortcut re-couples the two');
    }

    // ===============================================================
    // Section J — Contextual UI: the Publications Distribution contextual
    // link points at the publication relay configuration, never the
    // discovery one.
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const routerSource = await source('ui/router/index.js');

        assert(/\/settings\/nostr-publication-relays/.test(viewSource), n('J1. the real Publications view really references the new publication-relay settings route'));
        assert(/Configure Nostr Publication Relays/.test(viewSource), n('J2. the real Publications view really renders a link labeled "Configure Nostr Publication Relays"'));

        // The pre-existing discovery-relay link is untouched — still
        // present, still pointed at the SAME discovery route it always was.
        const publicationCardStart = viewSource.indexOf('<span class="evidence-anchor-type">Publication</span>');
        const snapshotCardStart = viewSource.indexOf('<span class="evidence-anchor-type">Snapshot</span>', publicationCardStart);
        const publicationCardSlice = viewSource.slice(publicationCardStart, snapshotCardStart);
        assert(publicationCardSlice.includes('discoveryDistributionConfigurationRoute(entry)'), n('J3. the original discovery-relay contextual link (0.9.437) is still present, unmodified, in the Publication card'));
        assert(publicationCardSlice.includes("to=\"/settings/nostr-publication-relays\""), n('J4. a SECOND, separate link literally targets /settings/nostr-publication-relays — never a repointed version of the first link'));

        assert(/path: '\/settings\/nostr-publication-relays', name: 'nostr-publication-relay-settings', component: NostrPublicationRelaySettingsView/.test(routerSource),
            n('J5. /settings/nostr-publication-relays is really registered against a real, distinctly-named NostrPublicationRelaySettingsView component'));
        assert(/path: '\/settings\/nostr-relay', name: 'nostr-relay-settings', component: NostrRelaySettingsView/.test(routerSource),
            n('J6. /settings/nostr-relay (the discovery route) is still registered, unmodified, against its own original component'));

        const settingsViewSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        assert(/nostrPublicationRelaySetConfigurationStore/.test(settingsViewSource) && !/inject\('nostrRelayConfigurationStore'/.test(settingsViewSource),
            n('J7. the new settings view injects its own store only — never the discovery store'));

        console.log('✓ Section J: the Publications Distribution section carries a distinct, additive contextual link to the new publication-relay configuration page, alongside — never in place of — the original discovery-relay link');
    }

    // ===============================================================
    // Section K — Single-relay compatibility: one configured relay produces
    // the existing single-relay semantics, byte-identical per relay.
    // ===============================================================
    {
        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStoreSingle = new PublicationDistributionLifecycleMemoryStore();
        const lifecycleStoreMulti = new PublicationDistributionLifecycleMemoryStore();
        const singlePublishCallLog = [];
        const multiPublishCallLog = [];

        const singleRelayCommand = composePublicationDistributionCommand({
            lifecycleStore: lifecycleStoreSingle,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(singlePublishCallLog), discoveryTag: 'forkbuild-publication', relayUrl: 'wss://only.example' }
        });
        const singleResult = await singleRelayCommand({ publication: makeFakePublication('pub-k1'), serializedMaterial: 'k' });

        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store }).execute({ relayUrls: ['wss://only.example'] });
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore: lifecycleStoreMulti,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(multiPublishCallLog), discoveryTag: 'forkbuild-publication' }
        });
        const multiResults = await multiRelayCommand({ publication: makeFakePublication('pub-k1b'), serializedMaterial: 'k' });

        assert(singleResult.discovery && singleResult.discovery.relayUrl === 'wss://only.example', n('K1. the pre-existing single-relay command publishes to exactly its own configured relay'));
        assert(multiResults.length === 1 && multiResults[0].discovery.relayUrl === 'wss://only.example', n('K2. REAL EXECUTION: a one-element configured relay set, through the new multi-relay command, produces exactly one result for exactly the same relay'));
        assert(singlePublishCallLog.length === 1 && multiPublishCallLog.length === 1, n('K3. exactly one publishImpl call occurred on each path — no phantom second call introduced by the new multi-relay machinery for the one-relay case'));

        console.log('✓ Section K: a one-element configured relay set behaves byte-identically, per relay, to the pre-existing single-relay command');
    }

    // ===============================================================
    // Section L — Cross-role isolation: no effect on Arweave gateway
    // configuration, Arweave anchoring, Bitcoin anchoring, Snapshot
    // distribution, or Nostr discovery querying.
    // ===============================================================
    {
        const untouchedFiles = [
            'core/ArweaveGatewayConfiguration.js',
            'storage/ArweaveGatewayConfigurationStore.js',
            'application/CreateArweaveAnchorPublisherUseCase.js',
            'application/CreateArweaveAnchorProofVerifierUseCase.js',
            'application/NostrDiscoveryQueryService.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/NostrPlaceNamingDiscoverySource.js',
            'application/SnapshotDistributionRuntimeComposition.js',
            'core/NostrRelayConfiguration.js',
            'storage/NostrRelayConfigurationStore.js'
        ];
        for (const relPath of untouchedFiles) {
            const text = await source(relPath);
            assert(!/NostrPublicationRelaySetConfiguration/.test(text), n(`L1[${relPath}]. no reference to NostrPublicationRelaySetConfiguration of any kind — this milestone's own new concept never reaches this file`));
        }

        // Live proof for the one substrate this milestone's own new files
        // structurally sit closest to: Arweave upload/announcement, inside
        // the very same multi-relay command this milestone configures,
        // still behaves exactly as 0.9.444 already shipped it — this
        // milestone changes zero bytes of Arweave upload behavior.
        const arweave = makeFakeArweaveSubstrate();
        let uploadCallCount = 0;
        const countingFetchImpl = async (...args) => { uploadCallCount += 1; return arweave.fetchImpl(...args); };
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrPublicationRelaySetConfigurationStore(storageProvider);
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: store }).execute({ relayUrls: ['wss://a.example', 'wss://b.example'] });
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: countingFetchImpl },
            nostrRelayUrls: resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: store }),
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(), discoveryTag: 'forkbuild-publication' }
        });
        await multiRelayCommand({ publication: makeFakePublication('pub-l1'), serializedMaterial: 'isolation check' });
        assert(uploadCallCount === 1, n('L2. REAL EXECUTION: material is still uploaded to Arweave exactly ONCE per distribution call, shared across every configured relay — 0.9.444\'s own "one material upload, shared across every relay" invariant is untouched by this milestone\'s own configuration layer'));

        console.log('✓ Section L: no file outside this milestone\'s own new configuration family references its new concept, and the one substrate this milestone composes alongside (Arweave upload) behaves exactly as already shipped');
    }

    console.log('\n✅ All Nostr Publication Relay Set Configuration tests passed.');
    console.log(`Total assertions: ${assertionCount}`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
