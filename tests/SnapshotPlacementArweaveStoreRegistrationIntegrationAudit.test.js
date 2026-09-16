import { readFile } from 'node:fs/promises';

import { ContentStore } from '../content/ContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore, ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { StorageProvider } from '../storage/StorageProvider.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { SnapshotPlacementCreationCoordinator } from '../application/SnapshotPlacementCreationCoordinator.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';

// 0.9.505 — Register Arweave as Snapshot Content Store.
//
// tests/SnapshotContentStorageChoiceCapabilityBoundaryAudit.js's own 0.9.504
// audit found this to be a pure composition-root gap: content/
// ArweaveContentStore.js (0.9.132) already satisfies content/ContentStore.js's
// contract exactly like content/IpfsContentStore.js does, and application/
// SnapshotPlacementStoreRegistry.js already accepts it with zero registry
// code change. This milestone closes exactly that gap — ui/main.js now
// constructs one real ArweaveContentStore and registers it, under its own
// `storage` label ('ar'), into the SAME two registries Snapshot Placement
// already used for Local/IPFS: the CREATION registry
// (`snapshotPlacementStoreRegistry`, backing the placement-creation picker)
// and the RESOLUTION registry (`publicationSnapshotPlacementResolutionStoreRegistry`,
// backing ordinary read-back of an already-cataloged placement) — one
// shared instance, never two independently constructed ones.
//
// This file audits that composition from real, current source — a
// structural sweep of ui/main.js's own text, plus a behavioral round trip
// against real ArweaveContentStore/SnapshotPlacementStoreRegistry classes
// (never a mock of either). It deliberately never imports or executes
// ui/main.js itself — that file is a browser entry point (Vue app, `window`
// reads) with no Node-runnable module boundary, the same restraint every
// other ui/main.js-auditing test in this codebase already holds, achieved
// instead by reading its source text and asserting structurally.
//
// LETTERED SECTIONS:
//   A. Production construction — ui/main.js constructs exactly ONE real
//      ArweaveContentStore.
//   B. Registry registration — a SnapshotPlacementStoreRegistry accepts
//      Local/IPFS/Arweave together, each resolved back by its own identity.
//   C. The existing picker — SnapshotPlacementCreationCoordinator's own
//      availableStorageTypes() is a live registry pass-through, so
//      registering Arweave onto an already-constructed registry/coordinator
//      (exactly how ui/main.js does it — signer/gatewayUrl resolve later
//      than the registry itself) makes it appear with no coordinator
//      change; ui/views/DecentralizedPublicationsView.js's own template
//      still renders one generic button per registered storage, with no
//      Arweave-specific branch.
//   D. Round trip — put() through the registry's own 'ar' entry, then
//      get() back through the SAME entry, verifying contentHash.
//   E. Identity fidelity — contentHash is the store's own bytes hash, the
//      locator is a genuine ar:// transaction reference, and the
//      signer's transaction id never substitutes for contentHash.
//   F. Failure behavior — an unreachable Arweave gateway throws the
//      existing ContentUnavailableError, and never disturbs Local/IPFS
//      resolution through the SAME registry.
//   G. Other providers untouched — content/LocalContentStore.js and
//      content/IpfsContentStore.js remain genuinely ignorant of Arweave.
//   H. Role independence — CONTENT and ANNOUNCEMENT_AND_DISCOVERY stay two
//      distinct roles; the production registration block never references
//      Nostr/discovery, and a live scenario shows a Placement's Content
//      choice leaves a same-publication Distribution's own discovery
//      choice unaffected, in both directions.
//   I. No duplicate construction — the ONE constructed instance is what
//      gets registered into both the creation and resolution registries,
//      never two independently constructed ArweaveContentStore objects.
//   J. Boundary audit — Snapshot Distribution's own composition site in
//      ui/main.js, and application/SnapshotDistributionCommand.js itself,
//      remain untouched by this wiring.

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
    return 'bafyPLACEMENT' + computeContentHash(text);
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
            const id = `PlacementTxId${String(arweaveTxCounter).padStart(4, '0')}${'x'.repeat(20)}`;
            return { id, transaction: { id, data: material } };
        }
    };
}

function unreachableFetchImpl() {
    return async () => { throw new Error('network unreachable'); };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    const mainSource = await rawSource('ui/main.js');
    const mainCodeOnly = await codeOnlySource('ui/main.js');

    // ===============================================================
    // Section A — production construction.
    // ===============================================================
    {
        const constructionSites = (mainCodeOnly.match(/new ArweaveContentStore\(/g) || []).length;
        check(constructionSites === 1, 'A. ui/main.js constructs exactly one real ArweaveContentStore — never zero, never a second independent one');
        check(/import \{ ArweaveContentStore \} from '\.\.\/content\/ArweaveContentStore\.js';/.test(mainSource),
            'A. ui/main.js imports the real content/ArweaveContentStore.js, unmodified, rather than a copy or a stand-in');

        console.log('✓ A. ui/main.js constructs exactly one real, imported ArweaveContentStore');
    }

    // ===============================================================
    // Section B — registry registration: Local/IPFS/Arweave together,
    // each resolved back by its own identity.
    // ===============================================================
    {
        const registry = new SnapshotPlacementStoreRegistry();
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) });
        const arweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl });

        registry.register(local);
        registry.register(ipfs);
        registry.register(arweave);

        check(registry.storageTypes.includes('local') && registry.storageTypes.includes('ipfs') && registry.storageTypes.includes('ar'),
            'B. the registry reports all three registered storage types: local, ipfs, ar');
        check(registry.get('local') === local, 'B. registry.get("local") resolves the exact registered LocalContentStore instance');
        check(registry.get('ipfs') === ipfs, 'B. registry.get("ipfs") resolves the exact registered IpfsContentStore instance');
        check(registry.get('ar') === arweave, 'B. registry.get("ar") resolves the exact registered ArweaveContentStore instance');
        check(registry.get('arweave') === null, 'B. sanity: "arweave" itself is not a registered key — content/ArweaveContentStore.js\'s own storage label is "ar", never renamed by this registry');

        console.log('✓ B. SnapshotPlacementStoreRegistry accepts and correctly resolves Local, IPFS, and Arweave together, with zero registry code change');
    }

    // ===============================================================
    // Section C — the existing picker: availableStorageTypes() is a
    // live registry pass-through, and the real UI template renders no
    // Arweave-specific branch.
    // ===============================================================
    {
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) }));
        const fakeCreateUseCase = { execute: async () => ({ outcome: 'unused', placement: null, reason: null }) };
        const coordinator = new SnapshotPlacementCreationCoordinator(fakeCreateUseCase, registry);

        check(coordinator.availableStorageTypes().includes('ipfs') && !coordinator.availableStorageTypes().includes('ar'),
            'C. before Arweave registration, the coordinator (mirroring ui/main.js\'s own coordinator, built before arweaveHostSigner/resolvedArweaveGatewayUrl resolve) reports only the stores registered so far');

        // Mirrors ui/main.js's own real sequencing exactly: the registry is
        // built and handed to the coordinator FIRST; the ArweaveContentStore
        // is registered onto that SAME registry instance LATER, once
        // arweaveHostSigner/resolvedArweaveGatewayUrl are available — never
        // requiring the coordinator itself to change.
        registry.register(new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl }));
        check(coordinator.availableStorageTypes().includes('ar'), 'C. after registering Arweave onto the SAME registry instance, the SAME coordinator now reports "ar" with zero coordinator/registry code change — exactly how ui/main.js wires it');

        const viewSource = await codeOnlySource('ui/views/DecentralizedPublicationsView.js');
        check(/v-for="storage in availableStorageTypes"/.test(viewSource), 'C. ui/views/DecentralizedPublicationsView.js still renders one generic button per entry in availableStorageTypes() — the registry\'s own live contents');

        // Scoped to the Content storage-picker block itself (from its own
        // v-for down through its createPlacement() button) — the SAME file
        // also legitimately mentions "Arweave" elsewhere, in the unrelated
        // Anchor picker (a plain-text anchor-type label, not a storage
        // branch), so a whole-file sweep would false-positive on that.
        const placementBlockMatch = viewSource.match(/v-for="storage in availableStorageTypes"[\s\S]{0,2000}?createPlacement\(entry, storage\)[\s\S]{0,300}/);
        check(Boolean(placementBlockMatch), 'C. the Content storage-picker block itself is found and isolated for inspection');
        check(!/storage === 'ar'|storage === 'arweave'|>\s*Arweave\s*</i.test(placementBlockMatch[0]), 'C. ...and contains no Arweave-specific branch, label override, or special-cased button added to make this work');

        console.log('✓ C. the existing Snapshot Placement picker (availableStorageTypes()) discovers Arweave purely by live registry membership, and the real UI template needed no Arweave-specific change');
    }

    // ===============================================================
    // Section D — round trip through the existing placement mechanism:
    // put -> locator -> get -> verify contentHash.
    // ===============================================================
    {
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(new LocalContentStore(new InMemoryStorageProvider()));
        registry.register(new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(new Map()) }));
        const gateway = makeFakeArweaveGateway();
        registry.register(new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl }));

        const bytes = JSON.stringify({ milestone: '0.9.505', payload: 'round-trip-through-the-registry' });
        const expectedHash = computeContentHash(bytes);

        const placed = await registry.get('ar').put(bytes);
        check(placed.storage === 'ar', 'D. put() through the registry\'s own "ar" entry genuinely placed onto Arweave');
        check(placed.hash === expectedHash, 'D. the returned locator carries the correct contentHash');
        check(placed.uri.startsWith('ar://'), 'D. the returned locator is a genuine ar:// reference');

        const retrieved = await registry.get('ar').get(placed);
        check(retrieved === bytes, 'D. get() through the SAME registry entry retrieves the identical bytes back');
        check(computeContentHash(retrieved) === expectedHash, 'D. the retrieved bytes\' own recomputed hash matches the locator\'s claimed contentHash — a genuine verified round trip');

        console.log('✓ D. put -> locator -> get -> verify contentHash succeeds end to end through the existing SnapshotPlacementStoreRegistry mechanism, Arweave included');
    }

    // ===============================================================
    // Section E — identity fidelity: contentHash is ours, the locator
    // is a genuine transaction reference, and no announcement/transaction
    // identity leaks into the Content result.
    // ===============================================================
    {
        const bytes = 'identity-fidelity-bytes';
        const expectedHash = computeContentHash(bytes);
        const signer = makeFakeArweaveSigner();
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });

        const reference = await store.put(bytes);
        check(reference.hash === expectedHash, 'E. contentHash is computed locally from the bytes — never derived from the Arweave transaction id');
        check(reference.uri === `ar://${[...gateway.network.keys()][0]}`, 'E. the locator is exactly ar://<transaction-id>, the one the fake gateway actually stored');
        check(reference.hash !== [...gateway.network.keys()][0], 'E. the transaction id and the contentHash are never the same value — no announcement/transaction identity substitutes for Content identity');

        console.log('✓ E. contentHash = hash(bytes), locator = genuine Arweave content locator, and no transaction/announcement identity leaks into the Content result');
    }

    // ===============================================================
    // Section F — failure behavior: Arweave unavailable produces the
    // existing storage failure semantics and never disturbs Local/IPFS.
    // ===============================================================
    {
        const registry = new SnapshotPlacementStoreRegistry();
        const local = new LocalContentStore(new InMemoryStorageProvider());
        const ipfsNetwork = new Map();
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) });
        const brokenArweave = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: unreachableFetchImpl() });
        registry.register(local);
        registry.register(ipfs);
        registry.register(brokenArweave);

        await expectRejects(registry.get('ar').put('anything'), 'F. an unreachable Arweave gateway throws on put()', ContentUnavailableError);

        const bytes = 'local-and-ipfs-still-work';
        const localRef = registry.get('local').put(bytes);
        check(localRef.storage === 'local' && registry.get('local').get(localRef) === bytes, 'F. Local placement/retrieval through the SAME registry is completely unaffected by Arweave\'s own failure');
        const ipfsRef = await registry.get('ipfs').put(bytes);
        check(ipfsRef.storage === 'ipfs' && await registry.get('ipfs').get(ipfsRef) === bytes, 'F. IPFS placement/retrieval through the SAME registry is completely unaffected by Arweave\'s own failure');

        check(registry.get('does-not-exist') === null, 'F. sanity: an unregistered storage name still degrades to null, exactly as before this milestone');

        console.log('✓ F. Arweave unavailability produces the existing ContentUnavailableError storage-failure contract and never breaks Local/IPFS selection through the same registry');
    }

    // ===============================================================
    // Section G — other providers untouched: Local/IPFS remain
    // genuinely ignorant of Arweave.
    // ===============================================================
    {
        for (const file of ['content/LocalContentStore.js', 'content/IpfsContentStore.js']) {
            const code = await codeOnlySource(file);
            check(!/arweave/i.test(code), `G. ${file} contains no mention of Arweave, in any casing`);
        }
        const arweaveStoreSource = await codeOnlySource('content/ArweaveContentStore.js');
        check(!arweaveStoreSource.includes('SnapshotPlacementStoreRegistry'), 'G. content/ArweaveContentStore.js itself is not modified to know about the registry it now plugs into — a caller wires it in from outside, unchanged from 0.9.132');

        console.log('✓ G. Local and IPFS remain byte-for-byte unaware of Arweave, and content/ArweaveContentStore.js itself needed no change to be registered');
    }

    // ===============================================================
    // Section H — role independence: registering Arweave as Content
    // never implies anything about Announcement/Discovery.
    // ===============================================================
    {
        check(RoleProviderRole.CONTENT !== RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, 'H. CONTENT and ANNOUNCEMENT_AND_DISCOVERY remain two distinct role names');

        const registrationBlockMatch = mainSource.match(/\/\/ 0\.9\.505 — Register Arweave as Snapshot Content Store\.\n\/\/\n\/\/ tests\/[\s\S]*?publicationSnapshotPlacementResolutionStoreRegistry\.register\(arweaveSnapshotPlacementContentStore\);/);
        check(Boolean(registrationBlockMatch), 'H. the real 0.9.505 registration block is found in ui/main.js for inspection');
        const registrationBlock = registrationBlockMatch[0].split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        check(!/nostr/i.test(registrationBlockMatch[0]), 'H. the registration block itself never references Nostr in any form, including in its own comments');
        check(!registrationBlock.includes('DiscoveryPublisher'), 'H. ...nor any DiscoveryPublisher in its actual code');

        // Live proof, one continuous scenario: place bytes onto Arweave as a
        // Content choice, and separately distribute the SAME bytes with a
        // discovery publisher attached — each remains genuinely independent.
        const bytes = 'role-independence-placement-bytes';
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: makeFakeArweaveGateway().fetchImpl }));
        const placedRef = await registry.get('ar').put(bytes);
        check(placedRef.storage === 'ar', 'H. the Content (Placement) choice genuinely resolved to Arweave');

        const { executeSnapshotDistributionCommand } = await import('../application/SnapshotDistributionCommand.js');
        const distributionGateway = makeFakeArweaveGateway();
        const distributionStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: distributionGateway.fetchImpl });
        const discoveryCalls = [];
        const distributionPublisher = { discoveryTag: 'forkbuild-snapshot-placement-audit', publish: async (envelope) => { discoveryCalls.push(envelope); return { published: true, relayUrl: 'wss://relay.audit.example', id: 'f'.repeat(64) }; } };
        const distributed = await executeSnapshotDistributionCommand({ bytes, contentStore: distributionStore, discoveryPublisher: distributionPublisher });

        check(placedRef.hash === distributed.contentReference.hash, 'H. both independent calls, over the identical bytes, still trace back to the identical contentHash');
        check(placedRef.uri !== distributed.contentReference.uri, 'H. ...while their own locators remain genuinely distinct, one per independent call');
        check(discoveryCalls.length === 1 && discoveryCalls[0].locator === distributed.contentReference.uri, 'H. the discovery announcement carries Distribution\'s OWN locator only — never the Placement call\'s locator');

        console.log('✓ H. registering Arweave for the CONTENT role never implies anything about ANNOUNCEMENT_AND_DISCOVERY — a Placement Content choice and a same-publication Distribution choice remain two independent facts');
    }

    // ===============================================================
    // Section I — no duplicate construction: the one constructed
    // instance is what both registries actually hold.
    // ===============================================================
    {
        check((mainCodeOnly.match(/new ArweaveContentStore\(/g) || []).length === 1, 'I. exactly one ArweaveContentStore is ever constructed in ui/main.js (re-confirmed from Section A)');

        const constNameMatch = mainCodeOnly.match(/const (\w+) = new ArweaveContentStore\(/);
        check(Boolean(constNameMatch), 'I. the single construction site is bound to a named constant, inspectable below');
        const constName = constNameMatch[1];

        const creationRegisterCount = (mainCodeOnly.match(new RegExp(`snapshotPlacementStoreRegistry\\.register\\(${constName}\\)`, 'g')) || []).length;
        const resolutionRegisterCount = (mainCodeOnly.match(new RegExp(`publicationSnapshotPlacementResolutionStoreRegistry\\.register\\(${constName}\\)`, 'g')) || []).length;
        check(creationRegisterCount === 1, 'I. the CREATION registry registers the SAME named instance exactly once');
        check(resolutionRegisterCount === 1, 'I. the RESOLUTION registry registers the SAME named instance exactly once — never a second, independently constructed ArweaveContentStore');

        console.log('✓ I. one ArweaveContentStore instance is constructed and reused across both the creation and resolution placement registries — no duplicate construction');
    }

    // ===============================================================
    // Section J — boundary audit: Snapshot Distribution.
    //
    // UPDATED 0.9.506 — Make Snapshot Distribution Content Backend
    // Selectable. This section's original claim (Distribution stays
    // completely untouched, reading neither registry at all) was true of
    // 0.9.505 and is now deliberately superseded: 0.9.506 is precisely the
    // milestone that gives Distribution a Content backend choice by
    // reusing the CREATION registry this file's own Sections A-I already
    // proved holds exactly one shared ArweaveContentStore instance. What
    // remains true, and is reasserted below, is narrower but still real:
    // `application/SnapshotDistributionCommand.js` itself is still never
    // modified (the command was already storage-agnostic — see tests/
    // SnapshotContentStorageChoiceCapabilityBoundaryAudit.test.js's own
    // Section H), and Distribution still never reads the SEPARATE
    // RESOLUTION registry (`publicationSnapshotPlacementResolutionStoreRegistry`)
    // — only the CREATION one, the same registry `snapshotPlacementCreationCoordinator`
    // above already uses.
    // ===============================================================
    {
        const distributionCommandSource = await codeOnlySource('application/SnapshotDistributionCommand.js');
        check(!distributionCommandSource.includes('SnapshotPlacementStoreRegistry'), 'J. application/SnapshotDistributionCommand.js never references SnapshotPlacementStoreRegistry — still untouched, exactly as this milestone left it');

        const distributionSiteMatch = mainCodeOnly.match(/const snapshotDistributionCommand = \(bytes, storage = 'ar', publicationId, claimedPosition\) => executeSnapshotDistributionCommand\(\{([\s\S]*?)\}\);/);
        check(Boolean(distributionSiteMatch), 'J. ui/main.js\'s real Distribution command call site is found for inspection');
        const distributionSiteBody = distributionSiteMatch[1];
        check(distributionSiteBody.includes('snapshotPlacementStoreRegistry'), 'J. as of 0.9.506, the Distribution command DOES read snapshotPlacementStoreRegistry — the SAME CREATION registry this file\'s own instance-sharing proof (Section I) already covers, reused rather than duplicated');
        check(!distributionSiteBody.includes('new ArweaveContentStore'), 'J. the Distribution command call site still never constructs an ArweaveContentStore directly — resolution goes through application/SnapshotDistributionContentBackendSelection.js instead');
        check(!distributionSiteBody.includes('publicationSnapshotPlacementResolutionStoreRegistry'), 'J. the Distribution command call site still never reads the separate RESOLUTION registry — only the CREATION one');

        console.log('✓ J. application/SnapshotDistributionCommand.js remains completely untouched, and Snapshot Distribution now resolves Content through the SAME shared CREATION registry (and the SAME single ArweaveContentStore instance) this file\'s own Sections A-I already proved — never a second, independent one, and never the separate RESOLUTION registry');
    }

    console.log(`✅ All Snapshot Placement Arweave Store Registration Integration Audit checks passed (${assertionCount} assertions).`);
}

await run();
