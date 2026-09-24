import { readFile } from 'node:fs/promises';

import { ContentStore } from '../content/ContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import {
    SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES,
    availableSnapshotDistributionStorageTypes,
    resolveSnapshotDistributionContentStore
} from '../application/snapshot/SnapshotDistributionContentBackendSelection.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { mainFiles } from './support/SourceFileGroups.js';

// 0.9.506 — Make Snapshot Distribution Content Backend Selectable.
//
// tests/SnapshotContentStorageChoiceCapabilityBoundaryAudit.test.js's own
// 0.9.504 audit (Section G/H/J) proved the exact shape of this gap:
// application/snapshot/SnapshotDistributionCommand.js was already storage-agnostic,
// but ui/main.js's own Distribution composition site always built exactly
// one hardcoded ArweaveContentStore, with no selection parameter of any
// kind, and never once read application/snapshot/placement/SnapshotPlacementStoreRegistry.js
// — the SAME registry Placement's own creation/resolution coordinators
// already share (tests/SnapshotPlacementArweaveStoreRegistrationIntegrationAudit
// .test.js's own Section I). This milestone closes that gap the way both
// audits' own verdicts recommended: reuse the existing registry, add no
// second one, and add no new ContentStore implementation of any kind.
//
// application/snapshot/SnapshotDistributionContentBackendSelection.js (0.9.506, this
// milestone's own only new production file) is the whole seam: a closed,
// two-entry eligible list ('ipfs'/'ar' — never 'local', see that file's own
// header for why) and one resolve() function that looks a caller's chosen
// storage up in whatever SnapshotPlacementStoreRegistry-shaped registry it
// is handed. application/snapshot/SnapshotDistributionCommand.js itself is NOT
// modified — it already accepted any contentStore duck-typed collaborator.
//
// LETTERED SECTIONS:
//   A. Production topology — ui/main.js's real snapshotDistributionCommand
//      now resolves Content from snapshotPlacementStoreRegistry, keyed by
//      an explicit caller storage choice, defaulting to 'ar' for
//      unmodified pre-0.9.506 callers; no second ArweaveContentStore
//      construction site remains for Distribution.
//   B. IPFS selection reaches the real IPFS ContentStore path.
//   C. Arweave selection reaches the real Arweave ContentStore path.
//   D. Exactly one backend per call — no fan-out to the other network.
//   E. Content fidelity — contentHash is identical across backends for
//      identical bytes.
//   F. Locator fidelity — ipfs:// and ar:// locators are never substituted
//      for one another.
//   G. Announcement/Discovery isolation — the SAME discoveryPublisher
//      instance serves every Content selection; changing Content never
//      changes, reconstructs, or reconfigures it.
//   H. Failure isolation — a failing selected backend rejects using
//      SnapshotDistributionCommand's own existing failure semantics, never
//      reaching discoveryPublisher, and never disturbing the other,
//      still-healthy backend on a subsequent call.
//   I. No Local leakage — 'local' can be registered in the SAME registry
//      (Placement's own real production shape) without ever becoming an
//      eligible, offerable, or resolvable Distribution target.
//   J. Eligibility contract — the closed allowlist is frozen and exactly
//      two entries; resolving an eligible-but-unregistered storage fails
//      distinctly from resolving an ineligible one; a malformed registry
//      degrades to an empty available list rather than throwing.
//   K. FLAGSHIP — one Snapshot's bytes distributed twice, once per
//      Content backend, against ONE shared registry and ONE shared
//      discoveryPublisher: identical contentHash, genuinely distinct
//      locators/storage, two independent announcements, Announcement/
//      Discovery never re-selected.
//   L. Backward compatibility — omitting `storage` entirely still resolves
//      to Arweave, the exact pre-0.9.506 behavior every existing caller
//      that has not been updated (ui/views/WorldView.js's own
//      distributeWorldEncounterSnapshot(), and everything downstream of
//      it) still relies on.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - Automatic IPFS <-> Arweave fallback, simultaneous upload, migration
//   between stores, automatic replication, storage ranking, or
//   health-based selection.
// - Any change to Announcement/Discovery, to walking-triggered discovery,
//   or to World View — this file proves those three stay exactly as they
//   were.
// - A second ContentStore implementation, or a second registry.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch (e) { rejected = true; }
    check(rejected, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    check(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function fakeCid(text) {
    return 'bafySEL' + computeContentHash(text);
}

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

function makeFakeArweaveGateway(network) {
    return async function fetchImpl(url, options = {}) {
        if (options.method === 'POST' && url.endsWith('/tx')) {
            const body = JSON.parse(options.body);
            network.set(body.id, body.data !== undefined ? String(body.data) : '');
            return new Response('accepted', { status: 200 });
        }
        const id = url.split('/').pop();
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id), { status: 200 });
    };
}

let arweaveTxCounter = 0;
function makeFakeArweaveSigner() {
    return {
        sign: async (material) => {
            arweaveTxCounter += 1;
            const id = `SelTxId${String(arweaveTxCounter).padStart(4, '0')}${'x'.repeat(21)}`;
            return { id, transaction: { id, data: material } };
        }
    };
}

function makeFailingSigner() {
    return { sign: async () => { throw new Error('signer declined'); } };
}

function makeFakeDiscoveryPublisher({ discoveryTag = 'forkbuild-snapshot' } = {}) {
    const calls = [];
    return {
        discoveryTag,
        publish: async (envelope) => {
            calls.push(envelope);
            return { published: true, relayUrl: 'wss://relay.selection-audit.example', id: 'f'.repeat(64) };
        },
        calls
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Builds the SAME shape ui/main.js's own real snapshotPlacementStoreRegistry
// carries in production: 'local', 'ipfs' (a real IpfsContentStore), and
// 'ar' (a real ArweaveContentStore) all registered into ONE registry.
function buildProductionShapedRegistry({ arweaveSigner = makeFakeArweaveSigner(), ipfsNetwork = new Map(), arweaveNetwork = new Map() } = {}) {
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(new LocalContentStore(new InMemoryStorageProvider()));
    registry.register(new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(ipfsNetwork) }));
    registry.register(new ArweaveContentStore({ signer: arweaveSigner, fetchImpl: makeFakeArweaveGateway(arweaveNetwork) }));
    return { registry, ipfsNetwork, arweaveNetwork };
}

async function run() {
    // ===============================================================
    // Section A — production topology, structural.
    // ===============================================================
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => codeOnlySource(file)))).join('\n');

        check(mainSource.includes("import { availableSnapshotDistributionStorageTypes, resolveSnapshotDistributionContentStore } from '../../application/snapshot/SnapshotDistributionContentBackendSelection.js';"),
            'A. ui/main.js imports the new 0.9.506 selection module');

        // AMENDED BY 0.9.669 — `discoveryProvider` joined the parameter
        // list as a new, optional fifth argument.
        const commandMatch = mainSource.match(/const snapshotDistributionCommand = \(bytes, storage = 'ar', publicationId, claimedPosition, discoveryProvider\) => executeSnapshotDistributionCommand\(\{([\s\S]*?)\}\);/);
        check(Boolean(commandMatch), 'A. AMENDED BY 0.9.669 — ui/main.js\'s real snapshotDistributionCommand is found, taking an explicit (bytes, storage = \'ar\', publicationId, claimedPosition, discoveryProvider) tuple');
        check(commandMatch[1].includes('resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, storage)'), 'A. it resolves contentStore from the SAME snapshotPlacementStoreRegistry Placement already builds, keyed by the caller\'s own storage choice');
        check(!commandMatch[1].includes('new ArweaveContentStore') && !commandMatch[1].includes('new IpfsContentStore'), 'A. the command call site itself constructs no concrete ContentStore');

        // AMENDED BY 0.9.669 — Per-Click Snapshot Announcement/Discovery
        // Substrate Override. composeSnapshotDistributionRuntime() is now
        // called twice, once per substrate (Nostr/Arweave) — each call
        // still for its discoveryPublisher half only, and neither passes
        // an arweaveContentStoreOptions of its own.
        const nostrRuntimeMatch = mainSource.match(/const \{ discoveryPublisher: nostrSnapshotDiscoveryPublisher \} = composeSnapshotDistributionRuntime\(\{([\s\S]*?)\}\);/);
        const arweaveRuntimeMatch = mainSource.match(/const \{ discoveryPublisher: arweaveSnapshotDiscoveryPublisher \} = composeSnapshotDistributionRuntime\(\{([\s\S]*?)\}\);/);
        check(Boolean(nostrRuntimeMatch) && Boolean(arweaveRuntimeMatch), 'A. AMENDED BY 0.9.669 — composeSnapshotDistributionRuntime() is called once per substrate, each for its discoveryPublisher half only');
        check(!nostrRuntimeMatch[1].includes('arweaveContentStoreOptions') && !arweaveRuntimeMatch[1].includes('arweaveContentStoreOptions'), 'A. neither call passes an arweaveContentStoreOptions of its own — no second ArweaveContentStore is constructed for Distribution');

        check(mainSource.includes("app.provide('snapshotDistributionAvailableStorageTypes', snapshotDistributionAvailableStorageTypes);"), 'A. ui/main.js provides the new eligible-storage-types read for a UI picker to consume');

        console.log('✓ A. production topology: Distribution\'s own composition site resolves Content from the SAME registry Placement already shares, constructs no second ArweaveContentStore, and exposes an eligible-storage-types read for the UI');
    }

    // ===============================================================
    // Section B — IPFS selection reaches the real IPFS ContentStore path.
    // ===============================================================
    {
        const { registry, ipfsNetwork } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();
        const bytes = JSON.stringify({ hello: 'ipfs-selection' });

        const result = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'),
            discoveryPublisher
        });

        check(result.contentReference.storage === 'ipfs', 'B. selecting "ipfs" genuinely resolves to storage "ipfs"');
        check(result.contentReference.uri.startsWith('ipfs://'), 'B. the resulting locator is a real ipfs:// URI');
        const cid = result.contentReference.uri.slice('ipfs://'.length);
        check(ipfsNetwork.has(cid) && ipfsNetwork.get(cid) === bytes, 'B. the bytes genuinely landed in the fake IPFS network — a real put(), not a stub');

        console.log('✓ B. selecting IPFS reaches the real content/IpfsContentStore.js put() path end to end');
    }

    // ===============================================================
    // Section C — Arweave selection reaches the real Arweave ContentStore
    // path.
    // ===============================================================
    {
        const { registry, arweaveNetwork } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();
        const bytes = JSON.stringify({ hello: 'arweave-selection' });

        const result = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'),
            discoveryPublisher
        });

        check(result.contentReference.storage === 'ar', 'C. selecting "ar" genuinely resolves to storage "ar"');
        check(result.contentReference.uri.startsWith('ar://'), 'C. the resulting locator is a real ar:// URI');
        const txId = result.contentReference.uri.slice('ar://'.length);
        check(arweaveNetwork.has(txId), 'C. the bytes genuinely landed in the fake Arweave network — a real put(), not a stub');

        console.log('✓ C. selecting Arweave reaches the real content/ArweaveContentStore.js put() path end to end');
    }

    // ===============================================================
    // Section D — exactly one backend per call, never a fan-out.
    // ===============================================================
    {
        const { registry, ipfsNetwork, arweaveNetwork } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();

        await executeSnapshotDistributionCommand({
            bytes: JSON.stringify({ only: 'ipfs' }),
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'),
            discoveryPublisher
        });
        check(ipfsNetwork.size === 1 && arweaveNetwork.size === 0, 'D. selecting IPFS writes to IPFS only — Arweave\'s own fake network stays empty');

        await executeSnapshotDistributionCommand({
            bytes: JSON.stringify({ only: 'arweave' }),
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'),
            discoveryPublisher
        });
        check(ipfsNetwork.size === 1 && arweaveNetwork.size === 1, 'D. selecting Arweave next writes to Arweave only — IPFS\'s own fake network is untouched by this second call');

        console.log('✓ D. each call reaches exactly the one selected backend — no automatic fan-out to the other');
    }

    // ===============================================================
    // Section E — content fidelity: identical bytes -> identical
    // contentHash, regardless of selected backend.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();
        const bytes = JSON.stringify({ same: 'bytes', across: 'both backends' });

        const viaIpfs = await executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher });
        const viaArweave = await executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher });

        check(viaIpfs.contentReference.hash === viaArweave.contentReference.hash, 'E. contentHash is identical across backends for identical bytes — Content selection never changes Snapshot identity');
        check(viaIpfs.contentReference.hash === computeContentHash(bytes), 'E. that shared hash is genuinely the deterministic hash of the bytes themselves');

        console.log('✓ E. contentHash remains the canonical identity of the Snapshot bytes regardless of which Content backend placed them');
    }

    // ===============================================================
    // Section F — locator fidelity: ipfs:// and ar:// are never
    // substituted for one another.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();
        const bytes = JSON.stringify({ locator: 'fidelity' });

        const viaIpfs = await executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher });
        const viaArweave = await executeSnapshotDistributionCommand({ bytes, contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher });

        check(viaIpfs.contentReference.uri.startsWith('ipfs://') && !viaIpfs.contentReference.uri.startsWith('ar://'), 'F. the IPFS selection\'s own locator is genuinely ipfs://, never ar://');
        check(viaArweave.contentReference.uri.startsWith('ar://') && !viaArweave.contentReference.uri.startsWith('ipfs://'), 'F. the Arweave selection\'s own locator is genuinely ar://, never ipfs://');
        check(viaIpfs.contentReference.uri !== viaArweave.contentReference.uri, 'F. the two locators are genuinely distinct values');

        console.log('✓ F. locators are never substituted between backends — each selection carries its own genuine, distinct locator');
    }

    // ===============================================================
    // Section G — Announcement/Discovery isolation: the SAME
    // discoveryPublisher serves every Content selection, unmodified.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();

        await executeSnapshotDistributionCommand({ bytes: JSON.stringify({ n: 1 }), contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher });
        await executeSnapshotDistributionCommand({ bytes: JSON.stringify({ n: 2 }), contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher });

        check(discoveryPublisher.calls.length === 2, 'G. the SAME discoveryPublisher instance received both announcements — never reconstructed per Content selection');
        check(discoveryPublisher.calls[0].storage === 'ipfs' && discoveryPublisher.calls[1].storage === 'ar', 'G. each announcement carries its own call\'s own storage, unmodified by the other');
        check(discoveryPublisher.discoveryTag === 'forkbuild-snapshot', 'G. discoveryPublisher\'s own discoveryTag is completely unaffected by which Content backend was chosen');

        console.log('✓ G. changing the Content backend never changes, reconstructs, or reconfigures the Announcement/Discovery collaborator — the two roles stay genuinely orthogonal');
    }

    // ===============================================================
    // Section H — failure isolation: a failing selected backend rejects
    // using SnapshotDistributionCommand's own existing semantics, and
    // never disturbs the OTHER, still-healthy backend.
    // ===============================================================
    {
        const { registry, arweaveNetwork } = buildProductionShapedRegistry({ arweaveSigner: makeFailingSigner() });
        const discoveryPublisher = makeFakeDiscoveryPublisher();

        await expectRejects(
            executeSnapshotDistributionCommand({ bytes: JSON.stringify({ will: 'fail' }), contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'), discoveryPublisher }),
            'H. a failing Arweave signer causes the Distribution command to reject, exactly as application/snapshot/SnapshotDistributionCommand.js\'s own contract already requires'
        );
        check(discoveryPublisher.calls.length === 0, 'H. placement failure prevents discovery — the fake publisher never saw a call for the failed attempt');
        check(arweaveNetwork.size === 0, 'H. nothing was actually written to the fake Arweave network on failure');

        const result = await executeSnapshotDistributionCommand({ bytes: JSON.stringify({ will: 'succeed' }), contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'), discoveryPublisher });
        check(result.contentReference.storage === 'ipfs', 'H. the OTHER, still-healthy backend (IPFS) remains completely unaffected by Arweave\'s own failure — a subsequent selection still succeeds');

        console.log('✓ H. a failing selected backend fails using this family\'s own existing, unmodified failure semantics, and never disturbs a differently-selected, still-healthy backend');
    }

    // ===============================================================
    // Section I — no Local leakage: 'local' is a real registry member
    // (exactly as it is in production, for Placement) but is never
    // eligible, offerable, or resolvable as a Distribution target.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        check(registry.has('local'), 'I. sanity — the SAME production-shaped registry genuinely has \'local\' registered, for Placement\'s own use');

        const available = availableSnapshotDistributionStorageTypes(registry);
        check(!available.includes('local'), 'I. \'local\' is never included in the Distribution-available storage list, despite being a real registry member');
        check(available.length === 2 && available.includes('ipfs') && available.includes('ar'), 'I. exactly \'ipfs\' and \'ar\' are offered — the full, closed eligible set, both currently registered');

        expectThrows(() => resolveSnapshotDistributionContentStore(registry, 'local'), 'I. resolving \'local\' explicitly still throws — registry membership never implies Distribution eligibility');

        console.log('✓ I. Local stays a legitimate Placement backend but is never surfaced or resolvable as a Snapshot Distribution target — registry membership does not imply Distribution UI eligibility');
    }

    // ===============================================================
    // Section J — eligibility contract.
    // ===============================================================
    {
        check(Object.isFrozen(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES), 'J. the eligible list is frozen — never mutable at runtime');
        check(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.length === 2
            && SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes('ipfs')
            && SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes('ar'), 'J. the eligible list is exactly [\'ipfs\', \'ar\']');

        const emptyRegistry = new SnapshotPlacementStoreRegistry();
        check(availableSnapshotDistributionStorageTypes(emptyRegistry).length === 0, 'J. an empty registry offers nothing — never a fabricated default');
        expectThrows(() => resolveSnapshotDistributionContentStore(emptyRegistry, 'ipfs'), 'J. resolving an ELIGIBLE but UNREGISTERED storage still throws — eligibility alone is not availability');
        expectThrows(() => resolveSnapshotDistributionContentStore(emptyRegistry, 'not-a-real-storage'), 'J. resolving an INELIGIBLE storage throws too — both are real, distinct failure modes, neither silently ignored');

        check(availableSnapshotDistributionStorageTypes(null).length === 0, 'J. a null registry degrades to an empty list rather than throwing — the same "empty is ordinary" restraint SnapshotPlacementCreationCoordinator.availableStorageTypes() already holds');
        expectThrows(() => resolveSnapshotDistributionContentStore(null, 'ar'), 'J. resolving against a null registry still throws — a caller cannot silently distribute against nothing');

        console.log('✓ J. the eligibility contract is closed, frozen, and distinguishes "not eligible" from "eligible but not currently registered" — never conflating the two, and never fabricating availability from nothing');
    }

    // ===============================================================
    // Section K — FLAGSHIP: one Snapshot, two Content selections, one
    // shared registry, one shared discoveryPublisher.
    // ===============================================================
    {
        const { registry } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();
        const bytes = JSON.stringify({ world: 'flagship-snapshot', v: 1 });

        const viaIpfs = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ipfs'),
            discoveryPublisher
        });
        const viaArweave = await executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, 'ar'),
            discoveryPublisher
        });

        check(viaIpfs.contentReference.hash === viaArweave.contentReference.hash, 'K. same content bytes -> same contentHash, across both Content selections');
        check(viaIpfs.contentReference.uri !== viaArweave.contentReference.uri, 'K. genuinely different, legitimate locators — ipfs:// vs ar://');
        check(viaIpfs.contentReference.storage === 'ipfs' && viaArweave.contentReference.storage === 'ar', 'K. genuinely different storage values, one per selection');
        check(viaIpfs.announcement && viaArweave.announcement, 'K. both selections successfully announced through the SAME, entirely unmodified discoveryPublisher');
        check(discoveryPublisher.calls.length === 2 && discoveryPublisher.calls.every((call) => call.contentHash === viaIpfs.contentReference.hash), 'K. both announcements carry the identical, shared contentHash — proving this is Content placement changing, never Snapshot identity');

        console.log('✓ K. FLAGSHIP — the same Snapshot, distributed through two independently selected Content backends, yields identical content identity, genuinely distinct storage/locators, and an Announcement/Discovery role that never itself changed');
    }

    // ===============================================================
    // Section L — backward compatibility: an omitted storage argument
    // still resolves to Arweave, unchanged from every pre-0.9.506 caller's
    // own real behavior.
    // ===============================================================
    {
        const { registry, arweaveNetwork, ipfsNetwork } = buildProductionShapedRegistry();
        const discoveryPublisher = makeFakeDiscoveryPublisher();
        // Mirrors ui/main.js's own real `(bytes, storage = 'ar') => ...`
        // shape exactly — see Section A's own structural proof.
        const snapshotDistributionCommand = (bytes, storage = 'ar') => executeSnapshotDistributionCommand({
            bytes,
            contentStore: resolveSnapshotDistributionContentStore(registry, storage),
            discoveryPublisher
        });

        const result = await snapshotDistributionCommand(JSON.stringify({ legacy: 'caller' }));
        check(result.contentReference.storage === 'ar', 'L. omitting storage entirely still resolves to Arweave — the exact pre-0.9.506 behavior');
        check(arweaveNetwork.size === 1 && ipfsNetwork.size === 0, 'L. no IPFS write occurred for the legacy, storage-less call');

        console.log('✓ L. every existing caller that has not been updated to pass an explicit storage keeps its exact pre-0.9.506 Arweave-only behavior');
    }

    console.log(`\n✅ All Snapshot Distribution Content Backend Selection Integration Audit checks passed (${assertionCount} assertions).`);
}

await run();
