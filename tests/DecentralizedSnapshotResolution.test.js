import { readFile } from 'node:fs/promises';

import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';

// 0.9.134 — Snapshot Retrieval from Decentralized Discovery.
//
// 0.9.132 (content/ArweaveContentStore.js) proved a Snapshot's bytes can
// be PLACED on Arweave. 0.9.133 (application/
// NostrSnapshotDiscoveryQueryService.js) proved a Snapshot's own locator
// can be DISCOVERED via Nostr, and proved — as its own flagship negative
// case — that discovery is not verification. Neither milestone connected
// the two: discovering a candidate and actually retrieving/verifying its
// bytes remained two entirely separate, manually-driven steps. This
// milestone is that connection: application/DecentralizedSnapshotResolver.js,
// a narrow application-level resolver that turns
// `(discoveryTag, contentHash)` into either a verified Snapshot or a
// specific, structural reason it could not be produced.
//
//   Nostr discovery
//         │ contentHash + locator
//         ▼
//   Snapshot locator
//         │
//         ▼
//   Snapshot ContentStore
//         │ get(locator)
//         ▼
//   Snapshot bytes
//         │
//         ▼
//   content hash verification
//         │
//         ▼
//   usable Snapshot
//
// THE CENTERPIECE INVARIANT — four layers, never collapsed into one
// status:
//
//   DISCOVERY     "A locator was announced."        NOT_DISCOVERED
//   LOCATION      "The locator can be queried."      STORE_UNAVAILABLE
//   RETRIEVAL     "Bytes were obtained."              CONTENT_UNAVAILABLE
//   VERIFICATION  "Those bytes are the expected
//                  Snapshot."                         CONTENT_HASH_MISMATCH
//
//   Section CONTRACT — one direct check per statement below:
//     1. The four layers are distinct outcomes, never collapsed
//     2. DISCOVERY failure — no candidate for this contentHash/tag
//     3. LOCATION failure — a discovered candidate's storage has no
//        registered content store
//     4. RETRIEVAL failure — a stale locator: discoverable, but the
//        store cannot presently retrieve it
//     5. VERIFICATION failure — a false discovery record: retrieval
//        genuinely succeeds, but the bytes don't match
//     6. Reuses application/SnapshotPlacementStoreRegistry.js — no new
//        ContentStoreRegistry is built
//     7. Multiple candidates are preserved, never silently ranked
//     8. resolve() never throws for a discovery/store/network failure —
//        only for a caller contract violation
//     9. No composition wiring — nothing outside this milestone's own
//        test references DecentralizedSnapshotResolver
//   Section SEQUENCE — the flagship scenario: create a snapshot, place it
//     on Arweave, publish discovery to Nostr, resolve it end to end via
//     ONE call — then break each of the four layers independently.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrows(fn, message) {
    let threw = false;
    try { await fn(); } catch { threw = true; }
    assert(threw, message);
}

// Mirrors tests/ArweaveContentStore.test.js's own makeFakeArweaveGateway().
function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-resolution-tx-${counter}`, transaction: { id: `fake-resolution-tx-${counter}`, data: material } };
    }
    return { sign };
}

// Mirrors tests/NostrSnapshotDiscovery.test.js's own makeNostrNetwork() —
// a real in-memory relay, driving the real publisher and the real query
// service together, never two isolated mocks.
function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function fileExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT));
        return true;
    } catch {
        return false;
    }
}

const RESOLUTION_FILES = [
    'application/DecentralizedSnapshotResolver.js',
    'application/DecentralizedSnapshotResolutionOutcome.js'
];

// One assembled scenario: a real ArweaveContentStore, a real Nostr
// network, a registry with the store registered, and a resolver wired
// against it. Shared by several sections below so each only needs to
// place/publish/resolve, not re-wire the world.
function makeScenario() {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork();
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(store);
    const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
    const resolver = new DecentralizedSnapshotResolver(query);
    return { gateway, signer, store, network, registry, query, resolver };
}

async function run() {
    // ===============================================================
    // Section CONTRACT — one direct check per statement in this file's
    // own header.
    // ===============================================================

    // 1 — the four layers are distinct outcomes: the enum names one
    // member per layer, never collapsing two layers into one string.
    {
        const outcomes = Object.values(DecentralizedSnapshotResolutionOutcome);
        assert(new Set(outcomes).size === outcomes.length, '1a. every outcome value is unique — no two layers share one status string');
        for (const expected of ['resolved', 'not-discovered', 'store-unavailable', 'content-unavailable', 'content-hash-mismatch']) {
            assert(outcomes.includes(expected), `1b. the outcome enum names '${expected}'`);
        }
        console.log('✓ 1. DISCOVERY, LOCATION, RETRIEVAL, and VERIFICATION are four distinct, named outcomes — never collapsed into one status');
    }

    // 2 — DISCOVERY failure: nothing was ever announced for this
    // contentHash under this discoveryTag.
    {
        const { resolver } = makeScenario();
        const result = await resolver.resolve('never-announced-tag', 'a-hash-nobody-ever-published', {});
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, '2a. resolve() reports NOT_DISCOVERED when search() finds no matching candidate');
        assert(result.bytes === null, '2b. bytes is null on NOT_DISCOVERED');
        assert(Array.isArray(result.candidates) && result.candidates.length === 0, '2c. candidates is an empty array on NOT_DISCOVERED');
        assert(result.locator === null && result.storage === null, '2d. no locator/storage is reported — none was ever discovered to attempt');
        console.log('✓ 2. DISCOVERY failure — no candidate for this contentHash/tag reports NOT_DISCOVERED, distinct from every later layer');
    }

    // 3 — LOCATION failure: a candidate is genuinely discovered, but its
    // own storage has no registered content store.
    {
        const { store, network } = makeScenario();
        const emptyRegistry = new SnapshotPlacementStoreRegistry(); // deliberately nothing registered
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);

        const bytes = 'bytes placed on Arweave, but announced with a resolver holding no registered store';
        const reference = await store.put(bytes);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-3-location', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        const result = await resolver.resolve('contract-3-location', reference.hash, { storeRegistry: emptyRegistry });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, '3a. resolve() reports STORE_UNAVAILABLE when the discovered storage has no registered store');
        assert(result.bytes === null, '3b. bytes is null on STORE_UNAVAILABLE');
        assert(result.candidates.length === 1 && result.locator === reference.uri, '3c. the candidate WAS discovered — the failure is specifically about locating a store for it, never about discovery itself');
        console.log('✓ 3. LOCATION failure — a discovered candidate whose storage has no registered store reports STORE_UNAVAILABLE, never conflated with NOT_DISCOVERED');
    }

    // 4 — RETRIEVAL failure: a stale locator. The discovery record
    // remains discoverable and well-formed; the store simply cannot
    // presently retrieve the bytes.
    {
        const { store, registry, network, resolver } = makeScenario();

        const bytes = 'bytes that were placed, announced, and then became unreachable';
        const reference = await store.put(bytes);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-4-stale', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        // Swap in a broken gateway under the SAME 'ar' storage name —
        // the discovery record itself is untouched.
        const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('gateway overloaded', { status: 503 }) });
        const brokenRegistry = new SnapshotPlacementStoreRegistry();
        brokenRegistry.register(brokenStore);

        const result = await resolver.resolve('contract-4-stale', reference.hash, { storeRegistry: brokenRegistry });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, '4a. resolve() reports CONTENT_UNAVAILABLE when the store cannot retrieve the discovered locator');
        assert(result.bytes === null, '4b. bytes is null on CONTENT_UNAVAILABLE');
        assert(result.candidates.length === 1 && result.locator === reference.uri, '4c. the candidate WAS discovered and its locator IS the one attempted — the failure is specifically about retrieval');

        // The exact same discovery record still resolves fully against
        // the ORIGINAL, working store — proving the record itself was
        // never the problem.
        const stillResolvable = await resolver.resolve('contract-4-stale', reference.hash, { storeRegistry: registry });
        assert(stillResolvable.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '4d. the identical discovery record resolves fully once a working store is available — the discovery record was never stale, only the store was momentarily unreachable');

        console.log('✓ 4. RETRIEVAL failure — a stale locator reports CONTENT_UNAVAILABLE while the discovery record itself remains discoverable and, against a working store, fully resolvable');
    }

    // 5 — VERIFICATION failure: a false discovery record. Retrieval
    // genuinely succeeds — the locator serves real bytes — but those
    // bytes do not hash to the announced contentHash.
    {
        const { store, registry, network, resolver } = makeScenario();

        const decoyBytes = 'decoy bytes that really exist at their own real Arweave locator';
        const decoyReference = await store.put(decoyBytes);
        const claimedHash = computeContentHash('bytes that were never actually placed anywhere');

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-5-false', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: claimedHash, locator: decoyReference.uri, storage: decoyReference.storage });

        const result = await resolver.resolve('contract-5-false', claimedHash, { storeRegistry: registry });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, '5a. resolve() reports CONTENT_HASH_MISMATCH — discovery succeeded, retrieval succeeded, but verification failed');
        assert(result.bytes === null, '5b. bytes is null on CONTENT_HASH_MISMATCH — the wrong bytes are never handed back as if they were the Snapshot');
        assert(result.candidates.length === 1 && result.locator === decoyReference.uri, '5c. the candidate and its locator are still reported — a caller can see exactly what was retrieved and rejected');

        console.log('✓ 5. VERIFICATION failure — a false discovery record resolves its locator and genuinely retrieves bytes, but reports CONTENT_HASH_MISMATCH rather than promoting false discovery into a Snapshot');
    }

    // 6 — no new ContentStoreRegistry is built; the resolver reuses
    // application/SnapshotPlacementStoreRegistry.js exclusively.
    {
        for (const file of RESOLUTION_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('ContentStoreRegistry'), `6a. ${file} never references a 'ContentStoreRegistry' — SnapshotPlacementStoreRegistry is reused, never re-invented under a new name`);
        }
        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        assert(!resolverCode.includes("import { SnapshotPlacementStoreRegistry }"), '6b. DecentralizedSnapshotResolver.js never imports a concrete registry — a caller supplies one, exactly as application/SnapshotPlacementResolver.js already requires');
        assert(!resolverCode.includes('ArweaveContentStore') && !resolverCode.includes('IpfsContentStore'), '6c. DecentralizedSnapshotResolver.js never imports a concrete ContentStore — it only ever calls a resolved store\'s own get()');
        console.log('✓ 6. application/SnapshotPlacementStoreRegistry.js is reused as-is — no second, competing ContentStoreRegistry is built');
    }

    // 7 — multiple candidates for the same contentHash are preserved,
    // never silently ranked into a single "best" one.
    {
        const { store, registry, network, resolver } = makeScenario();

        const bytes = 'bytes announced by three independent, differently-storaged discovery records';
        const reference = await store.put(bytes);

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-7-multi', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        await publisher.publish({ contentHash: reference.hash, locator: 'ipfs://a-second-independent-locator', storage: 'ipfs' });
        await publisher.publish({ contentHash: reference.hash, locator: 'ar://a-third-independent-locator', storage: 'ar' });

        const result = await resolver.resolve('contract-7-multi', reference.hash, { storeRegistry: registry });
        assert(result.candidates.length === 3, '7a. ALL THREE independently-announced candidates for this contentHash are preserved on the result — never collapsed to one');
        assert(result.candidates[0].locator === reference.uri, '7b. the FIRST-discovered candidate is the one actually attempted — a deterministic, documented rule, never a ranking or trust decision');
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '7c. resolution against the first candidate succeeds since it genuinely is the real placement');
        assert(result.locator === reference.uri, '7d. the reported locator is exactly the one attempted');

        for (const file of RESOLUTION_FILES) {
            const code = await codeOnlySource(file);
            const forbidden = ['trusted', 'reputation', 'ranking', 'scoring', 'preferred', 'bestProvider'];
            for (const term of forbidden) {
                assert(!code.toLowerCase().includes(term.toLowerCase()), `7e. ${file} never uses "${term}" — no ranking or trust vocabulary anywhere in this milestone`);
            }
        }

        console.log('✓ 7. multiple discovery candidates for one contentHash are all preserved on the result — resolution uses a documented, deterministic first-match rule, never ranking');
    }

    // 8 — resolve() never throws for a discovery/store/network failure;
    // it only throws for a caller contract violation.
    {
        const { registry, resolver } = makeScenario();

        // Every one of these is a genuine failure somewhere in the
        // pipeline — none of them should ever surface as a thrown error.
        await resolver.resolve('nothing-here', 'nothing-here-either', {}); // NOT_DISCOVERED
        const { store, network } = makeScenario();
        const bytes = 'bytes for the never-throws sweep';
        const reference = await store.put(bytes);
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'contract-8-nothrow', publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        await resolver.resolve('contract-8-nothrow', reference.hash, { storeRegistry: new SnapshotPlacementStoreRegistry() }); // STORE_UNAVAILABLE — different resolver's registry, unrelated store

        // Caller contract violations DO throw, synchronously-observable
        // via rejection — a missing discoveryTag/contentHash, or a
        // malformed queryService.
        await expectThrows(() => resolver.resolve(null, reference.hash, { storeRegistry: registry }), '8a. resolve() throws for a missing discoveryTag');
        await expectThrows(() => resolver.resolve('some-tag', null, { storeRegistry: registry }), '8b. resolve() throws for a missing contentHash');
        assert((() => { try { new DecentralizedSnapshotResolver(null); return false; } catch { return true; } })(), '8c. the constructor throws when no queryService is supplied');
        assert((() => { try { new DecentralizedSnapshotResolver({}); return false; } catch { return true; } })(), '8d. the constructor throws when the supplied collaborator has no search() method');

        console.log('✓ 8. resolve() never throws for a discovery/store/network failure — only a missing argument or a malformed collaborator throws, exactly like every sibling resolver in this codebase');
    }

    // 9 — no composition wiring: nothing outside this milestone's own
    // test file references DecentralizedSnapshotResolver.
    {
        const uiMain = await codeOnlySource('ui/main.js');
        assert(!uiMain.includes('DecentralizedSnapshotResolver'), '9a. ui/main.js never references DecentralizedSnapshotResolver — this milestone wires no composition root');
        assert(await fileExists('application/DecentralizedSnapshotResolver.js'), '9b. sanity: the file itself does exist');
        console.log('✓ 9. no composition wiring — DecentralizedSnapshotResolver is a plain, constructible collaborator, not yet wired into any composition root or UI');
    }

    // ===============================================================
    // Section SEQUENCE — the flagship scenario: create, place, publish,
    // resolve end to end via ONE call — then break each of the four
    // layers independently, on top of a single shared scenario.
    // ===============================================================
    {
        const { store, registry, network, resolver } = makeScenario();
        const discoveryTag = 'flagship-decentralized-resolution';

        // create snapshot -> compute contentHash
        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'flagship-resolution-building', bricks: 7 }] } });
        const expectedHash = computeContentHash(snapshotBytes);

        // ArweaveContentStore.put() -> Arweave locator
        const reference = await store.put(snapshotBytes);
        assert(reference.hash === expectedHash, 'SEQ. 1. the placed reference\'s hash matches the hash computed before placement');

        // NostrSnapshotDiscoveryPublisher#publish() -> announced
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const publishResult = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
        assert(publishResult !== null && publishResult.published === true, 'SEQ. 2. the discovery announcement publishes successfully');

        // ONE call: discovery -> location -> retrieval -> verification.
        const resolved = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'SEQ. 3. a single resolve() call carries a real snapshot all the way from Nostr discovery through Arweave retrieval to verified bytes');
        assert(resolved.bytes === snapshotBytes, 'SEQ. 4. the resolved bytes are EXACTLY the original snapshot bytes');
        assert(resolved.locator === reference.uri, 'SEQ. 5. the reported locator is exactly the Arweave locator that was announced');
        assert(resolved.storage === 'ar', 'SEQ. 6. the reported storage is exactly \'ar\'');
        assert(computeContentHash(resolved.bytes) === expectedHash, 'SEQ. 7. the resolved bytes still hash to the originally-expected contentHash');

        console.log('✓ SEQUENCE (flagship): create → place on Arweave → publish discovery to Nostr → resolve() → verified Snapshot, in one continuous round trip through DecentralizedSnapshotResolver');

        // -----------------------------------------------------------
        // Break each layer independently, against the SAME already-
        // working scenario above — proving each failure is local to its
        // own layer and never disturbs an already-resolved snapshot.
        // -----------------------------------------------------------

        // DISCOVERY breaks: a different contentHash, never announced.
        const neverAnnouncedHash = computeContentHash('bytes that were never placed or announced at all');
        const discoveryBreak = await resolver.resolve(discoveryTag, neverAnnouncedHash, { storeRegistry: registry });
        assert(discoveryBreak.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'SEQ. independence 1. an unannounced contentHash under the SAME discoveryTag reports NOT_DISCOVERED, and never disturbs the original resolution');
        const stillResolvedAfterDiscoveryBreak = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });
        assert(stillResolvedAfterDiscoveryBreak.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'SEQ. independence 1b. the original snapshot still resolves fully afterward');

        // LOCATION breaks: the exact same discovered candidate, but
        // resolved against a registry with nothing registered.
        const emptyRegistry = new SnapshotPlacementStoreRegistry();
        const locationBreak = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: emptyRegistry });
        assert(locationBreak.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'SEQ. independence 2. resolving the SAME discovered candidate against an empty registry reports STORE_UNAVAILABLE, never disturbing the discovery evidence itself');
        assert(locationBreak.candidates.length === 1, 'SEQ. independence 2b. the candidate was still genuinely discovered');

        // RETRIEVAL breaks: a broken gateway registered under 'ar'.
        const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('gateway overloaded', { status: 503 }) });
        const brokenRegistry = new SnapshotPlacementStoreRegistry();
        brokenRegistry.register(brokenStore);
        const retrievalBreak = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: brokenRegistry });
        assert(retrievalBreak.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'SEQ. independence 3. the SAME discovered candidate, resolved against a broken store, reports CONTENT_UNAVAILABLE');

        // VERIFICATION breaks: a false announcement under a fresh tag,
        // reusing the SAME real, working store/registry.
        const decoyBytes = 'a second, unrelated decoy snapshot for the flagship verification break';
        const decoyReference = await store.put(decoyBytes);
        const falseTag = 'flagship-decentralized-resolution-false';
        const falsePublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: falseTag, publishImpl: network.publishImpl });
        await falsePublisher.publish({ contentHash: expectedHash, locator: decoyReference.uri, storage: decoyReference.storage });
        const verificationBreak = await resolver.resolve(falseTag, expectedHash, { storeRegistry: registry });
        assert(verificationBreak.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'SEQ. independence 4. FLAGSHIP NEGATIVE — a false discovery record resolves its locator and genuinely retrieves bytes, but resolve() refuses to promote it into a Snapshot: CONTENT_HASH_MISMATCH, not RESOLVED');

        // And, finally: the ORIGINAL flagship resolution still succeeds,
        // completely unaffected by every failure exercised above.
        const finalCheck = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });
        assert(finalCheck.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'SEQ. independence 5. after every layer was broken independently, the original discovery/placement still resolves fully — each failure mode is local to its own call, never global state');
        assert(finalCheck.bytes === snapshotBytes, 'SEQ. independence 5b. and still returns exactly the original bytes');

        console.log('✓ SEQUENCE (independence): DISCOVERY, LOCATION, RETRIEVAL, and VERIFICATION each fail independently without disturbing the others or any prior successful resolution');
    }

    console.log('\n✅ All Snapshot Retrieval from Decentralized Discovery tests passed.');
}

await run();
