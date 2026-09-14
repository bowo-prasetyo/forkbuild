import { readFile } from 'node:fs/promises';

import { ContentStore } from '../content/ContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore, ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { StorageProvider } from '../storage/StorageProvider.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';

import { RoleProviderRole } from '../core/RoleProviderRole.js';

// 0.9.504 — Snapshot Content Storage Choice Capability Boundary Audit.
//
// Type: test-only capability audit. Zero production changes.
//
// A user, having watched Snapshot Placement (application/
// CreateSnapshotPlacementOrchestratorUseCase.js, wired in ui/main.js with
// `stores: [publicationContentStore, new IpfsContentStore()]`) offer a
// Local/IPFS storage choice while Snapshot Distribution (application/
// SnapshotDistributionCommand.js + application/
// SnapshotDistributionRuntimeComposition.js, wired in ui/main.js as
// `snapshotDistributionCommand`) offers no storage choice at all — every
// call is Arweave, unconditionally — asked whether that asymmetry is a
// real product gap, and whether closing it is cheap or expensive. This
// milestone answers both questions from real, current source only, and
// deliberately builds nothing: no new ContentStore class, no registry
// change, no UI, no composition-root rewiring. `content/
// ArweaveContentStore.js` (0.9.132) and `application/
// SnapshotDistributionCommand.js` (0.9.136) already exist and are already
// proven, individually, in `tests/SnapshotDistributionBoundary.test.js`
// and `tests/ArweaveContentStore.test.js`; this file asks the cross-
// cutting question neither of those was scoped to ask: are Local, IPFS,
// and Arweave genuinely interchangeable behind ONE Snapshot Content
// storage-selection contract, and if so, exactly how narrow is the gap
// standing between that and what ships today?
//
// THE BAR, BORROWED FROM 0.9.424 (`tests/
// ArweaveCrossRoleSubstrateCapabilityAudit.test.js`) AND CARRIED FORWARD
// UNCHANGED: a claim is proven only from current source — a structural
// sweep of real files, or a behavioral round trip against a real class
// with an injected fetch/signer — never from a prior milestone's own
// prose, however recent. Every verdict below uses that same file's own
// three-way vocabulary: PROVIDER_GAP (a concrete class is missing, but the
// registry/mechanism it would plug into already exists and is already
// reachable), MECHANISM_GAP (no registry/pipeline slot exists yet for even
// a well-built class to plug into), or ALREADY_COMPLETE (nothing missing
// at all — pure composition-root wiring).
//
// LETTERED SECTIONS:
//   A. Registry-contract shape — Local/IPFS/Arweave each genuinely
//      `extends ContentStore` and implements storage/put/get/has.
//   B. Identity fidelity — identical bytes placed on all three stores
//      yield the identical contentHash and three genuinely distinct
//      locators/storage labels.
//   C. Write/read round trip, per store, against a real class with an
//      injected fetch/signer/storage — never a mock of the class itself.
//   D. Configuration/authentication semantics compared from the real
//      constructors — Local needs a StorageProvider only, IPFS needs
//      nothing but defaults to a local daemon URL, Arweave alone REQUIRES
//      a signer and throws synchronously without one.
//   E. Failure-semantics parity — get()/has()/put() hold the identical
//      throw/degrade contract on IPFS and Arweave; Local's own contract is
//      narrower (synchronous, no network) but never contradicts it; one
//      genuine, narrow asymmetry (Local never checks a reference's own
//      `storage`/`uri` before answering) is named and shown unreachable in
//      production because SnapshotPlacementStoreRegistry already dispatches
//      by `storage` before any store is ever asked.
//   F. SnapshotPlacementStoreRegistry drop-in proof — all three stores
//      register and resolve through ONE fresh registry with zero registry
//      code change (mirrors `tests/SnapshotDistributionBoundary.test.js`
//      point 5, generalized to all three storages at once).
//   G. The Distribution composition boundary, structural — application/
//      SnapshotDistributionRuntimeComposition.js constructs exactly one
//      hardcoded `new ArweaveContentStore(...)`, with no selection
//      parameter of any kind (unlike its own Signed-Claim-family cousin,
//      `PublicationDistributionRuntimeComposition.js`, which already
//      branches on a `discoveryProvider` string) — and never imports
//      `content/IpfsContentStore.js` at all.
//   H. The Distribution command itself is already storage-agnostic,
//      behaviorally — `executeSnapshotDistributionCommand()`, unmodified,
//      completes identically when handed a real IpfsContentStore instead
//      of a real ArweaveContentStore. The gap Section G found is confined
//      to ONE hardcoded construction call, never to the command's own
//      contract.
//   I. No role coupling — none of the three ContentStore files reference
//      Nostr/discovery in any form, and a Placement made through one
//      storage choice is shown, in one continuous scenario, to leave a
//      same-publication Distribution's own discovery choice completely
//      unaffected, in both directions.
//   J. Production composition-root topology, structural — ui/main.js's own
//      Placement wiring and Distribution wiring are two independent call
//      sites: Distribution's own block never references
//      `snapshotPlacementStoreRegistry`, `IpfsContentStore`, or
//      `publicationContentStore` at all. Two structurally unconnected
//      "storage choice" surfaces exist in shipped code today, not one.
//   K. Verdict, per candidate change, using the vocabulary above.
//   L. Deliberately excluded.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Registering ArweaveContentStore into ui/main.js's real `stores` list
//   for Placement.** Section F proves the registry already accepts it with
//   zero code change; wiring it into the real, running composition root
//   remains a separate, later, narrowly-scoped milestone.
// - **Any change to SnapshotDistributionRuntimeComposition.js, or any new
//   `contentStorage`/`storage` selection parameter on it.** Section G/H
//   name exactly how narrow that change would be; making it is real,
//   unscheduled, later work.
// - **A unified Placement+Distribution storage-selection UI, dropdown, or
//   preference.** Section J's own finding — two independently constructed
//   composition sites exist today — is exactly why this milestone declines
//   to design that unification; see Section K's own closing note.
// - **Any RoleAwareProviderResolver wiring for the CONTENT role into either
//   Placement or Distribution.** Neither pipeline consults it today; this
//   file only confirms that remains true (Section I), never changes it.
// - **Any UI, panel, or preference control.** Nothing in `ui/` is edited.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

async function expectRejects(promise, message, ErrorType = null) {
    let rejected = false;
    let error = null;
    try { await promise; } catch (e) { rejected = true; error = e; }
    check(rejected, message);
    if (ErrorType) {
        check(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function fakeCid(text) {
    return 'bafyAUDIT' + computeContentHash(text);
}

// Mirrors tests/SnapshotDistributionBoundary.test.js's own makeFakeIpfsNode().
function makeFakeIpfsNode(network) {
    return async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) return new Response('not found', { status: 500 });
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('unknown route', { status: 404 });
    };
}

let arweaveTxCounter = 0;

// A tiny in-memory stand-in for an Arweave gateway that actually stores
// what it's POSTed and serves it back on GET — mirrors tests/
// ArweaveContentStore.test.js's own makeFakeArweaveGateway().
function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        if (options.method === 'POST' && url.endsWith('/tx')) {
            const body = JSON.parse(options.body);
            const id = body.id;
            network.set(id, body.data !== undefined ? String(body.data) : '');
            return new Response('accepted', { status: 200 });
        }
        const id = url.split('/').pop();
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id), { status: 200 });
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    return {
        sign: async (material) => {
            arweaveTxCounter += 1;
            const id = `AuditTxId${String(arweaveTxCounter).padStart(4, '0')}${'x'.repeat(20)}`;
            return { id, transaction: { id, data: material } };
        }
    };
}

function makeFakeDiscoveryPublisher({ discoveryTag = 'forkbuild-snapshot-audit', handler } = {}) {
    const calls = [];
    return {
        discoveryTag,
        publish: async (envelope) => {
            calls.push(envelope);
            return handler ? handler(envelope) : { published: true, relayUrl: 'wss://relay.audit.example', id: 'e'.repeat(64) };
        },
        calls
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ===============================================================
    // Section A — registry-contract shape: all three genuinely extend
    // ContentStore and implement storage/put/get/has.
    // ===============================================================
    {
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });
        const arweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl });

        for (const [label, store] of [['local', local], ['ipfs', ipfs], ['arweave', arweave]]) {
            check(store instanceof ContentStore, `A. ${label} store is a genuine ContentStore instance`);
            check(typeof store.storage === 'string' && store.storage.length > 0, `A. ${label} store self-identifies with a non-empty storage label`);
            check(typeof store.put === 'function', `A. ${label} store implements put()`);
            check(typeof store.get === 'function', `A. ${label} store implements get()`);
            check(typeof store.has === 'function', `A. ${label} store implements has()`);
        }
        check(local.storage === 'local' && ipfs.storage === 'ipfs' && arweave.storage === 'ar', 'A. the three storage labels are distinct and match their own class');
        console.log('✓ A. Local/IPFS/Arweave are all genuine, shape-complete content/ContentStore.js implementations');
    }

    // ===============================================================
    // Section B — identity fidelity: identical bytes -> identical
    // contentHash across all three, distinct locators.
    // ===============================================================
    let sharedReference;
    {
        const bytes = JSON.stringify({ audit: '0.9.504', payload: 'Snapshot Content Storage Choice Capability Boundary Audit' });
        const expectedHash = computeContentHash(bytes);

        const local = new LocalContentStore(new InMemoryStorageProvider());
        const ipfsNetwork = new Map();
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) });
        const arweaveGateway = makeFakeArweaveGateway();
        const arweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: arweaveGateway.fetchImpl });

        const localRef = local.put(bytes);
        const ipfsRef = await ipfs.put(bytes);
        const arweaveRef = await arweave.put(bytes);
        sharedReference = { localRef, ipfsRef, arweaveRef, bytes };

        check(localRef.hash === expectedHash, 'B. Local.contentHash matches computeContentHash(bytes) directly');
        check(ipfsRef.hash === expectedHash, 'B. IPFS.contentHash matches computeContentHash(bytes) directly');
        check(arweaveRef.hash === expectedHash, 'B. Arweave.contentHash matches computeContentHash(bytes) directly');
        check(localRef.hash === ipfsRef.hash && ipfsRef.hash === arweaveRef.hash, 'B. all three stores produced the IDENTICAL contentHash for the identical bytes');

        check(localRef.uri === null, 'B. Local produces no retrieval uri of its own (in-process only)');
        check(ipfsRef.uri.startsWith('ipfs://'), 'B. IPFS produces an ipfs:// locator');
        check(arweaveRef.uri.startsWith('ar://'), 'B. Arweave produces an ar:// locator');
        check(new Set([localRef.storage, ipfsRef.storage, arweaveRef.storage]).size === 3, 'B. all three storage labels are pairwise distinct');
        check(ipfsRef.uri !== arweaveRef.uri, 'B. the ipfs:// and ar:// locators are never the same value');

        console.log('✓ B. contentHash is identical across storage backends for identical bytes; each backend\'s own locator remains distinct — the storage/identity split docs/Roadmap.md, 0.9.132, already drew');
    }

    // ===============================================================
    // Section C — write/read round trip, per store.
    // ===============================================================
    {
        const bytes = 'audit-round-trip-payload';

        const storageProvider = new InMemoryStorageProvider();
        const local = new LocalContentStore(storageProvider);
        const localRef = local.put(bytes);
        check(local.get(localRef) === bytes, 'C. Local round trip: get() returns exactly what put() stored');
        check(localRef.verify(bytes), 'C. Local round trip: ContentReference.verify() confirms the hash');

        const ipfsNetwork = new Map();
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) });
        const ipfsRef = await ipfs.put(bytes);
        const ipfsBytes = await ipfs.get(ipfsRef);
        check(ipfsBytes === bytes, 'C. IPFS round trip: get() returns exactly what put() stored');
        check(ipfsRef.verify(ipfsBytes), 'C. IPFS round trip: ContentReference.verify() confirms the hash');
        check(await ipfs.has(ipfsRef) === true, 'C. IPFS round trip: has() reports true for content genuinely placed');

        const arweaveGateway = makeFakeArweaveGateway();
        const arweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: arweaveGateway.fetchImpl });
        const arweaveRef = await arweave.put(bytes);
        const arweaveBytes = await arweave.get(arweaveRef);
        check(arweaveBytes === bytes, 'C. Arweave round trip: get() returns exactly what put() stored');
        check(arweaveRef.verify(arweaveBytes), 'C. Arweave round trip: ContentReference.verify() confirms the hash');
        check(await arweave.has(arweaveRef) === true, 'C. Arweave round trip: has() reports true for content genuinely placed');

        console.log('✓ C. put() -> get() round-trips byte-identically on all three real classes, verified independently against ContentReference.verify()');
    }

    // ===============================================================
    // Section D — configuration/authentication semantics, from the real
    // constructors: Local needs a StorageProvider only; IPFS defaults
    // cleanly with zero required options; Arweave alone mandates a signer.
    // ===============================================================
    {
        let threw = false;
        try { new ArweaveContentStore({ fetchImpl: async () => new Response('', { status: 200 }) }); } catch (e) { threw = true; }
        check(threw, 'D. ArweaveContentStore throws synchronously with no signer — the one backend of the three with a mandatory authentication/signing collaborator');

        threw = false;
        try { new ArweaveContentStore({ signer: {}, fetchImpl: async () => new Response('', { status: 200 }) }); } catch (e) { threw = true; }
        check(threw, 'D. ArweaveContentStore throws for a signer with no sign() method — a shape check, not merely a presence check');

        threw = false;
        let ipfsInstance = null;
        try { ipfsInstance = new IpfsContentStore({ fetchImpl: async () => new Response('{}', { status: 200 }) }); } catch (e) { threw = true; }
        check(!threw, 'D. IpfsContentStore constructs with no signer, no wallet, no explicit apiUrl at all — it defaults to a local daemon URL');
        check(ipfsInstance.apiUrl === 'http://127.0.0.1:5001', 'D. IpfsContentStore\'s own default apiUrl is exactly its documented DEFAULT_API_URL');

        threw = false;
        try { new LocalContentStore(new InMemoryStorageProvider()); } catch (e) { threw = true; }
        check(!threw, 'D. LocalContentStore constructs from a bare StorageProvider — no network configuration and no authentication collaborator of any kind');

        console.log('✓ D. the three backends are NOT uniformly configured — Local is synchronous/local-only, IPFS is network-only, Arweave alone requires a signing collaborator and throws without one; this is a real, structural difference the storage-selection contract itself must tolerate, never paper over');
    }

    // ===============================================================
    // Section E — failure-semantics parity, plus one named asymmetry.
    // ===============================================================
    {
        // IPFS: a non-2xx gateway response throws ContentUnavailableError
        // from put() AND get(); has() degrades to false, never throws.
        const failingIpfs = new IpfsContentStore({ fetchImpl: async () => new Response('down', { status: 500 }) });
        await expectRejects(failingIpfs.put('x'), 'E. IPFS put() throws ContentUnavailableError for a non-2xx gateway response', ContentUnavailableError);
        const unreachableRef = new ContentReference({ hash: 'h', uri: 'ipfs://missing', storage: 'ipfs' });
        await expectRejects(failingIpfs.get(unreachableRef), 'E. IPFS get() throws ContentUnavailableError for a non-2xx gateway response', ContentUnavailableError);
        check(await failingIpfs.has(unreachableRef) === false, 'E. IPFS has() degrades to false for the identical failure, never throws');

        // Arweave: the identical contract, on its own substrate.
        const failingArweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('down', { status: 500 }) });
        await expectRejects(failingArweave.put('x'), 'E. Arweave put() throws ContentUnavailableError for a non-2xx gateway response', ContentUnavailableError);
        const unreachableArweaveRef = new ContentReference({ hash: 'h', uri: 'ar://MissingTransactionId00000000000001', storage: 'ar' });
        await expectRejects(failingArweave.get(unreachableArweaveRef), 'E. Arweave get() throws ContentUnavailableError for a non-2xx gateway response', ContentUnavailableError);
        check(await failingArweave.has(unreachableArweaveRef) === false, 'E. Arweave has() degrades to false for the identical failure, never throws');

        // Both IPFS and Arweave self-defend against "wrong store" references
        // — get() returns null, never throws, for a reference that does not
        // even carry their own uri scheme.
        const workingIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });
        const arweaveOnlyRef = new ContentReference({ hash: 'h', uri: 'ar://SomeArweaveTx00000000000000000001', storage: 'ar' });
        check(await workingIpfs.get(arweaveOnlyRef) === null, 'E. IPFS.get() returns null (not ours), never throws, for an ar:// reference');
        const workingArweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl });
        const ipfsOnlyRef = new ContentReference({ hash: 'h', uri: 'ipfs://bafySomeCid', storage: 'ipfs' });
        check(await workingArweave.get(ipfsOnlyRef) === null, 'E. Arweave.get() returns null (not ours), never throws, for an ipfs:// reference');

        // Local: the ONE genuine, narrow asymmetry — it keys by hash alone
        // and never inspects a reference's own storage/uri, so it does not
        // self-defend against "wrong store" the way IPFS/Arweave do.
        const localStorageProvider = new InMemoryStorageProvider();
        const local = new LocalContentStore(localStorageProvider);
        const localRef = local.put('local-only-bytes');
        const foreignLookingReference = new ContentReference({ hash: localRef.hash, uri: 'ipfs://not-actually-ipfs', storage: 'ipfs' });
        check(local.get(foreignLookingReference) === 'local-only-bytes', 'E. Local.get() answers by hash alone, ignoring a reference\'s own storage/uri label — a genuine, narrower contract than IPFS/Arweave\'s own self-defense');

        // ...but SnapshotPlacementStoreRegistry already dispatches BY
        // storage before any store is ever asked, so that narrower
        // contract is never actually reachable through the real pipeline —
        // a caller can only ever hand Local a reference whose own placement
        // was already resolved as `storage: 'local'`.
        const registry = new SnapshotPlacementStoreRegistry().register(local).register(workingIpfs);
        check(registry.get('ipfs') !== local, 'E. the registry itself, not any individual store, is what prevents a Local lookup from ever being asked an IPFS-storage placement in production');
        check(registry.get('local') === local, 'E. ...while genuinely routing a local-storage placement to Local, exactly as intended');

        console.log('✓ E. IPFS and Arweave hold an identical throw/degrade/self-defend contract; Local\'s own contract is narrower (no network, no self-defense) but that narrower contract is never reachable in production because SnapshotPlacementStoreRegistry already dispatches by storage before any store is consulted');
    }

    // ===============================================================
    // Section F — SnapshotPlacementStoreRegistry drop-in proof: all three
    // register and resolve through ONE fresh registry, zero registry code
    // change (the exact CreateSnapshotPlacementOrchestratorUseCase.js/
    // SnapshotPlacementStoreRegistry.js pair used in real production
    // composition today).
    // ===============================================================
    {
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });
        const arweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl });

        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(local).register(ipfs).register(arweave);

        check(registry.storageTypes.length === 3, 'F. all three stores registered with zero registry code change');
        check(new Set(registry.storageTypes).size === 3, 'F. all three storage keys are distinct in the registry');
        check(registry.get('local') === local, 'F. registry.get(\'local\') resolves to the exact Local instance registered');
        check(registry.get('ipfs') === ipfs, 'F. registry.get(\'ipfs\') resolves to the exact IPFS instance registered');
        check(registry.get('ar') === arweave, 'F. registry.get(\'ar\') resolves to the exact Arweave instance registered — the identical opt-in wiring tests/SnapshotDistributionBoundary.test.js point 5g already proved for Arweave alone, reconfirmed here alongside Local/IPFS in the same registry');

        console.log('✓ F. SnapshotPlacementStoreRegistry treats Local/IPFS/Arweave as three genuinely interchangeable plugins — registering all three costs zero registry code, confirming Placement\'s own registry is ALREADY a correct, general Snapshot Content storage-selection contract');
    }

    // ===============================================================
    // Section G — the Distribution composition boundary, structural:
    // exactly one hardcoded ArweaveContentStore construction, no
    // selection parameter, no IpfsContentStore import.
    // ===============================================================
    {
        const compositionSource = await codeOnlySource('application/SnapshotDistributionRuntimeComposition.js');

        check(compositionSource.includes("new ArweaveContentStore(arweaveContentStoreOptions)"), 'G. SnapshotDistributionRuntimeComposition.js constructs a real ArweaveContentStore, unconditionally');
        check(!compositionSource.includes('IpfsContentStore'), 'G. SnapshotDistributionRuntimeComposition.js never imports or references content/IpfsContentStore.js at all');
        check(!compositionSource.includes('LocalContentStore'), 'G. SnapshotDistributionRuntimeComposition.js never imports or references content/LocalContentStore.js at all');
        check(!compositionSource.includes('contentStorage'), 'G. SnapshotDistributionRuntimeComposition.js has no contentStorage/storage-selection parameter of any kind');
        check(!/contentProvider|storageProvider(?!Options)/i.test(compositionSource), 'G. no storage-selection-shaped parameter name appears anywhere in this file');

        // Contrast with the Signed-Claim family's own sibling composition,
        // which ALREADY branches on a selection string for its own
        // Announcement/Discovery role (0.9.428) — proving this codebase
        // already knows how to build exactly this kind of seam, one role
        // over, and simply has not yet built it for Snapshot Content.
        const publicationCompositionSource = await codeOnlySource('application/PublicationDistributionRuntimeComposition.js');
        check(publicationCompositionSource.includes('discoveryProvider'), 'G. by contrast, PublicationDistributionRuntimeComposition.js already exposes a real discoveryProvider selection parameter for its own ANNOUNCEMENT_AND_DISCOVERY construction site');

        console.log('✓ G. the Distribution composition root hardcodes exactly one ContentStore (Arweave), with no selection parameter and no reference to IPFS/Local at all — a structurally narrow, single-call-site gap, not a redesign');
    }

    // ===============================================================
    // Section H — the Distribution COMMAND itself is already storage-
    // agnostic, behaviorally: executeSnapshotDistributionCommand(),
    // completely unmodified, works identically against a real IPFS
    // content store as it does against a real Arweave content store.
    // ===============================================================
    {
        const bytes = JSON.stringify({ world: 'audit-distribution-snapshot' });

        // Arweave path — the one path actually wired in ui/main.js today.
        const arweaveGateway = makeFakeArweaveGateway();
        const arweaveStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: arweaveGateway.fetchImpl });
        const arweavePublisher = makeFakeDiscoveryPublisher();
        const arweaveResult = await executeSnapshotDistributionCommand({ bytes, contentStore: arweaveStore, discoveryPublisher: arweavePublisher });
        check(arweaveResult.contentReference.storage === 'ar', 'H. the Arweave-backed command run genuinely placed onto "ar"');
        check(arweaveResult.announcement.published === true, 'H. the Arweave-backed command run genuinely announced');

        // IPFS path — never wired in ui/main.js's Distribution block today,
        // yet the SAME command, completely unmodified, sequences it
        // identically: put() -> announce(locator, contentHash, storage).
        const ipfsNetwork = new Map();
        const ipfsStore = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) });
        const ipfsPublisher = makeFakeDiscoveryPublisher();
        const ipfsResult = await executeSnapshotDistributionCommand({ bytes, contentStore: ipfsStore, discoveryPublisher: ipfsPublisher });
        check(ipfsResult.contentReference.storage === 'ipfs', 'H. the IPFS-backed command run genuinely placed onto "ipfs" — same command, zero code change');
        check(ipfsResult.announcement.published === true, 'H. the IPFS-backed command run genuinely announced, exactly like the Arweave run');

        check(arweaveResult.contentReference.hash === ipfsResult.contentReference.hash, 'H. both runs, over the identical bytes, produced the identical contentHash regardless of which backend distributed it');
        check(ipfsPublisher.calls[0].contentHash === ipfsResult.contentReference.hash, 'H. the discovery publisher was handed the REAL contentHash the IPFS store itself computed, exactly as the Arweave path already does');
        check(ipfsPublisher.calls[0].locator === ipfsResult.contentReference.uri, 'H. ...and the REAL ipfs:// locator, never a placeholder');

        console.log('✓ H. application/SnapshotDistributionCommand.js already sequences ANY ContentStore correctly, IPFS included, with zero code change — exactly what that file\'s own header already claims ("content/IpfsContentStore.js included"); the entire gap lives in Section G\'s one hardcoded construction call, never in this command');
    }

    // ===============================================================
    // Section I — no role coupling: Content selection never leaks into
    // Announcement/Discovery selection, in either direction.
    // ===============================================================
    {
        for (const file of ['content/ContentStore.js', 'content/LocalContentStore.js', 'content/IpfsContentStore.js', 'content/ArweaveContentStore.js', 'application/SnapshotPlacementStoreRegistry.js']) {
            const code = await codeOnlySource(file);
            check(!/nostr/i.test(code), `I. ${file} never references Nostr in any form`);
            check(!code.includes('DiscoveryPublisher'), `I. ${file} never references any DiscoveryPublisher`);
        }

        check(RoleProviderRole.CONTENT !== RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, 'I. CONTENT and ANNOUNCEMENT_AND_DISCOVERY remain two distinct role names in the closed vocabulary');

        // Live proof, one continuous scenario: place the SAME bytes onto
        // IPFS (Content choice) and separately distribute them onto
        // Arweave-content + a discovery publisher (Announcement/Discovery
        // choice for that SAME publish action) — neither call reads
        // anything the other produced, and each fails/succeeds completely
        // independently of the other, mirroring tests/
        // SnapshotDistributionBoundary.test.js's own SEQUENCE section one
        // layer over (storage choice, not claim-vs-snapshot).
        const bytes = 'role-independence-audit-bytes';

        const ipfsNetwork = new Map();
        const placementIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) });
        const placementRegistry = new SnapshotPlacementStoreRegistry().register(placementIpfs);
        const placedRef = await placementRegistry.get('ipfs').put(bytes);
        check(placedRef.storage === 'ipfs', 'I. Content choice (Placement) genuinely resolved to IPFS');

        const arweaveGateway = makeFakeArweaveGateway();
        const distributionStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: arweaveGateway.fetchImpl });
        const distributionPublisher = makeFakeDiscoveryPublisher();
        const distributed = await executeSnapshotDistributionCommand({ bytes, contentStore: distributionStore, discoveryPublisher: distributionPublisher });
        check(distributed.contentReference.storage === 'ar', 'I. Announcement/Discovery-accompanying Content choice (Distribution) genuinely resolved to Arweave, independently of the Placement call above');

        check(placedRef.hash === distributed.contentReference.hash, 'I. both independent calls, over the identical bytes, still trace back to the identical contentHash — the one fact the two pipelines legitimately share');
        check(placedRef.uri !== distributed.contentReference.uri, 'I. ...while their own locators remain genuinely distinct, one per storage backend actually used');
        check(distributionPublisher.calls.length === 1 && distributionPublisher.calls[0].locator === distributed.contentReference.uri, 'I. the discovery announcement carries Distribution\'s OWN locator only — never the Placement call\'s ipfs:// locator');

        console.log('✓ I. no file in the Snapshot Content family references Nostr/discovery in any form, and a Content storage choice made through Placement is proven, behaviorally, to leave a same-publication Distribution\'s own choice (and its discovery announcement) completely unaffected — Content selection and Announcement/Discovery selection are two independent facts today, exactly as they must remain');
    }

    // ===============================================================
    // Section J — production composition-root topology, structural: two
    // independent "storage choice" surfaces exist in ui/main.js today.
    // ===============================================================
    {
        const mainSource = await codeOnlySource('ui/main.js');

        const placementSiteMatch = mainSource.match(/stores:\s*\[publicationContentStore,\s*new IpfsContentStore\(\)\]/);
        check(Boolean(placementSiteMatch), 'J. ui/main.js\'s real Placement composition site registers exactly [publicationContentStore (local), new IpfsContentStore()] — Local + IPFS, never Arweave');

        const distributionSiteMatch = mainSource.match(/const \{ contentStore: snapshotContentStore, discoveryPublisher: snapshotDiscoveryPublisher \} = composeSnapshotDistributionRuntime\(\{([\s\S]*?)\}\);/);
        check(Boolean(distributionSiteMatch), 'J. ui/main.js\'s real Distribution composition site is found and isolated for inspection');
        const distributionSiteBody = distributionSiteMatch[1];

        check(!distributionSiteBody.includes('snapshotPlacementStoreRegistry'), 'J. the Distribution composition site never reads snapshotPlacementStoreRegistry — it builds its own, independent ArweaveContentStore instance from scratch');
        check(!distributionSiteBody.includes('IpfsContentStore'), 'J. the Distribution composition site never references IpfsContentStore at all');
        check(!distributionSiteBody.includes('publicationContentStore'), 'J. the Distribution composition site never references the SAME publicationContentStore instance Placement already registers under "local"');
        check(distributionSiteBody.includes('arweaveContentStoreOptions'), 'J. sanity: the Distribution composition site is genuinely the Arweave-only call this section is inspecting');

        console.log('✓ J. ui/main.js genuinely constructs TWO separate "Snapshot Content storage" surfaces today — Placement\'s own registry (Local+IPFS) and Distribution\'s own freshly-built, registry-blind ArweaveContentStore — neither reads from, defers to, or is aware of the other; this is the concrete, current-source shape of the "two independently maintained storage choices" risk this milestone\'s own brief named in advance');
    }

    // ===============================================================
    // Section K — verdict.
    // ===============================================================
    {
        console.log('');
        console.log('VERDICT — 0.9.504 Snapshot Content Storage Choice Capability Boundary Audit');
        console.log('');
        console.log('1. Registering ArweaveContentStore into ui/main.js\'s real Placement `stores` list:');
        console.log('   ALREADY_COMPLETE. Section F proves the registry already accepts all three stores');
        console.log('   with zero registry code change; Section D/E prove Arweave holds the identical');
        console.log('   put/get/has contract IPFS already does. The only missing thing is one composition-');
        console.log('   root line constructing a real signer and passing `new ArweaveContentStore({ signer })`');
        console.log('   into the existing `stores` array — no new class, no new interface, no UI redesign.');
        console.log('');
        console.log('2. Making Snapshot Distribution\'s content backend selectable (adding IPFS alongside');
        console.log('   Arweave):');
        console.log('   PROVIDER_GAP, narrowly confined. Section H proves the MECHANISM already exists —');
        console.log('   executeSnapshotDistributionCommand() already accepts any ContentStore, IPFS included,');
        console.log('   with zero code change. Section G proves the entire gap is ONE hardcoded construction');
        console.log('   call inside SnapshotDistributionRuntimeComposition.js — the identical shape');
        console.log('   PublicationDistributionRuntimeComposition.js already solved, one role over, with its');
        console.log('   own `discoveryProvider` selection parameter (0.9.428). No new IPFS-specific class is');
        console.log('   needed; content/IpfsContentStore.js already satisfies the exact contract required.');
        console.log('');
        console.log('3. Unifying Placement\'s storage choice and Distribution\'s storage choice into ONE');
        console.log('   selection (a single Content dropdown driving both):');
        console.log('   NOT ALREADY_COMPLETE, and deliberately NOT decided by this audit. Section J proves');
        console.log('   these are two independently constructed composition sites today, over two genuinely');
        console.log('   different lifecycle shapes: Placement resolves through SnapshotPlacementStoreRegistry');
        console.log('   against a placement catalog; Distribution builds one fresh store/publisher pair per');
        console.log('   call, coupled to a discovery announcement. Collapsing them into one selection requires');
        console.log('   answering, as a real product/architecture decision and NOT as a side effect of adding');
        console.log('   Arweave to one or the other: which registry becomes authoritative, whether Distribution');
        console.log('   should read SnapshotPlacementStoreRegistry instead of constructing its own store, and');
        console.log('   whether a storage choice for one implies anything for the other. This audit\'s own');
        console.log('   Section I already proves today\'s answer to that last question is "no, and it must');
        console.log('   stay no" — any unification design must preserve that independence, never assume it away.');
        console.log('');
        console.log('RECOMMENDATION: two narrow, independent follow-up milestones (matching the shape items 1');
        console.log('and 2 above already name), each auditable the same way SnapshotDistributionBoundary.test.js');
        console.log('already audits Placement/Distribution\'s existing separation — and no attempt at a unified');
        console.log('selection control until a real product requirement, not this audit\'s own convenience,');
        console.log('settles the open questions Section J and this verdict\'s own item 3 name.');
        console.log('');
    }

    console.log(`✅ All Snapshot Content Storage Choice Capability Boundary Audit checks passed (${assertionCount} assertions).`);
}

await run();
