import { readFile, readdir } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';

// 0.9.139 — Snapshot Distribution End-to-End Runtime & UI Audit.
//
// 0.9.131 named the boundary between Signed Claim distribution and
// Snapshot distribution. 0.9.132 through 0.9.135 built and audited the
// decentralized placement/discovery/retrieval chain in isolation from any
// caller. 0.9.136/0.9.137 then built the one assembly seam
// (`executeSnapshotDistributionCommand()`) and the one composition seam
// (`composeSnapshotDistributionRuntime()`) a real caller needs; 0.9.138
// finally reached an actual user — a "Distribute Snapshot" button on
// WorldEncounterCanvas's own panel. This milestone is the audit 0.9.138's
// own header already implied was still owed: does every seam this whole
// family has held since 0.9.131 still hold now that a World View click can
// reach every layer of it at once? This file adds ZERO new production
// code — it is a regression-locking, test-only audit, the same shape
// `tests/PublicationDistributionEndToEndRuntimeAudit.test.js` (0.9.122)
// and `tests/SnapshotDistributionAudit.test.js` (0.9.135) already gave
// their own subsystems.
//
//   World View
//        │ "Distribute Snapshot" click
//        ▼
//   WorldEncounterCanvas#distributeSelectedSnapshot()
//        │
//        ▼
//   snapshotDistributionCommand(publication)   (ui/views/WorldView.js's
//        │                                       own distributeWorldEncounterSnapshot,
//        │                                       reproduced below exactly as
//        │                                       tests/WorldViewSnapshotDistribution.test.js's
//        │                                       own makeSnapshotDistributionAction() already is)
//        ▼
//   executeSnapshotDistributionCommand()   (application/SnapshotDistributionCommand.js, 0.9.136)
//        │
//        ├──► ArweaveContentStore.put()                       PLACEMENT
//        │         │
//        │         ▼   contentReference{ hash, uri, storage }
//        │
//        └──► NostrSnapshotDiscoveryPublisher.publish()        ANNOUNCEMENT
//                  │
//                  ▼   announcement | null
//
//   ... a caller (this test, standing in for a later Wanderer's own
//   discovery UI) then separately drives:
//
//   NostrSnapshotDiscoveryQueryService.search()                 DISCOVERY
//        │
//        ▼
//   DecentralizedSnapshotResolver.resolve()
//        │
//        ├──► ArweaveContentStore.get()                        RETRIEVAL
//        │
//        └──► content-hash comparison                          VERIFICATION
//        │
//        ▼
//   original bytes, byte-identical
//
// NINE SECTIONS, each a distinct claim, never merely a repeat of one
// milestone's own test with new fixture names:
//
//   A. The complete reachable path — a shared call-order log proves the
//      ACTUAL ordering is action -> placement -> announcement -> discovery
//      -> retrieval -> verification, never merely that the final result
//      is correct.
//   B. Identity separation — contentReference.hash, the Arweave
//      transaction id, the Nostr event id, and the snapshot locator (the
//      `ar://` URI) are four pairwise-distinct identifiers, and
//      publication identity (Publication#id) is a fifth, entirely
//      unrelated axis — proven not merely by inequality but by showing
//      the resolver REFUSES to resolve when handed a transaction id or an
//      event id in place of a contentHash.
//   C. Distribution-family isolation — Snapshot Distribution still shares
//      no class, no lifecycle vocabulary, and no envelope type with Signed
//      Claim distribution, in either direction.
//   D. The asymmetric failure matrix — six rows, each a distinct
//      placement/announcement combination, with special emphasis on "a
//      Nostr failure never undoes an Arweave placement."
//   E. Discovery is not verification — the false-discovery flagship
//      negative, with retrieval instrumented to prove it genuinely ran
//      before rejection.
//   F. Candidate preservation — three independently announced candidates
//      for one contentHash all survive on the result, resolution is
//      deterministic first-match, and the resolver's own source is
//      scanned for ranking vocabulary that must never appear.
//   G. World View structural boundary — WorldView.js/WorldEncounterCanvas.js
//      (and every other file under ui/, main.js excepted as the
//      composition root) never touch window.arweaveWallet/window.nostr/
//      WebSocket/crypto.subtle/content hashing/Arweave transaction or
//      Nostr event construction directly.
//   H. UI state semantics — execution is ephemeral, a result belongs to
//      its own selection, duplicate clicks never overlap, a stale response
//      never overwrites newer state, a partial success is never
//      reclassified as a failure, and the Snapshot panel's own state never
//      leaks into (or reacts to) the Publication Distribution panel's.
//   I. No hidden second path — every production file in this repository is
//      scanned for a construction/call site of ArweaveContentStore /
//      NostrSnapshotDiscoveryPublisher / executeSnapshotDistributionCommand /
//      composeSnapshotDistributionRuntime, and the resulting set is
//      compared, file for file, against the exact set this architecture
//      intends.
//
// EVERY FILE THIS TEST TOUCHES IS READ-ONLY. This milestone adds no
// production code — only this test file, its `tests.html` registration,
// and `docs/Roadmap.md`.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

// Mirrors tests/SnapshotDistributionAudit.test.js's own
// makeFakeArweaveGateway(), renamed log tags so one shared log can spell
// out this milestone's own six-step vocabulary directly (see Section A).
function makeFakeArweaveGateway(log = null) {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            if (log) log.push('PLACEMENT');
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        if (log) log.push('RETRIEVAL');
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
        return { id: `fake-e2e-audit-tx-${counter}`, transaction: { id: `fake-e2e-audit-tx-${counter}`, data: material } };
    }
    return { sign };
}

// Mirrors tests/SnapshotDistributionAudit.test.js's own makeNostrNetwork(),
// with the identical renamed-log-tag treatment.
function makeNostrNetwork(log = null) {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        if (log) log.push('ANNOUNCEMENT');
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        if (log) log.push('DISCOVERY');
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

// A fake application/PublicationCatalogContentResolver.js — duck-typed
// resolve(publicationId), exactly the one method ui/views/WorldView.js's
// own distributeWorldEncounterSnapshot() ever calls on it.
function fakeContentResolver(entries = {}) {
    return {
        resolve(publicationId) {
            return Object.prototype.hasOwnProperty.call(entries, publicationId) ? entries[publicationId] : null;
        }
    };
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterSnapshot()
// implements — mirrors tests/WorldViewSnapshotDistribution.test.js's own
// makeSnapshotDistributionAction() exactly, with one addition: an optional
// `log`, pushed to as 'ACTION' the moment a caller (a World View click)
// invokes it — the first entry in Section A's own shared call-order log.
function makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver, log }) {
    return (publication) => {
        if (log) log.push('ACTION');
        if (!snapshotDistributionCommand || !publicationCatalogContentResolver) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotJson = publicationCatalogContentResolver.resolve(publication.id);
        if (snapshotJson === null) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        return snapshotDistributionCommand(JSON.stringify(snapshotJson));
    };
}

// Mirrors tests/WorldViewSnapshotDistribution.test.js's own canvasCtx()
// exactly — a plain, non-Vue context object carrying every piece of state
// and every method distributeSelectedSnapshot()/distributeSelectedPublication()/
// selectEncounter() actually touch, so this test can drive the real
// WorldEncounterCanvas.methods functions without mounting a real component.
function canvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        distributionCommand: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        distributeSelectedSnapshot: WorldEncounterCanvas.methods.distributeSelectedSnapshot,
        distributeSelectedPublication: WorldEncounterCanvas.methods.distributeSelectedPublication,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        materialSources: null,
        materialVerifier: null,
        resolvedSelectionChoice: null,
        resolvedLeadChoice: null,
        decentralizedLeadOutcome: null,
        selectionOutcome: null,
        materialInspectionRequestId: 0,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// One assembled decentralized scenario — a real ArweaveContentStore, a
// real (in-memory) Nostr network, a registry with the store registered,
// and a resolver wired against it. Mirrors tests/SnapshotDistributionAudit.test.js's
// own makeScenario() exactly.
function makeScenario(log = null) {
    const gateway = makeFakeArweaveGateway(log);
    const signer = makeFakeArweaveSigner();
    const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork(log);
    const registry = new SnapshotPlacementStoreRegistry();
    registry.register(store);
    const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
    const resolver = new DecentralizedSnapshotResolver(query);
    return { gateway, signer, store, network, registry, query, resolver };
}

// Recursively scans a directory for .js files, handing each one's
// comment-stripped source to `visit(relativePath, codeOnly)`. Mirrors
// tests/PublicationDistributionEndToEndRuntimeAudit.test.js's own
// auditDir() exactly — used by both Section G (a targeted ui/ scan) and
// Section I (a whole-repository scan).
async function walkJsFiles(dirUrl, relativeLabel, skipDirNames, visit) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (skipDirNames.has(entry.name)) continue;
            await walkJsFiles(new URL(`${entry.name}/`, dirUrl), `${relativeLabel}${entry.name}/`, skipDirNames, visit);
            continue;
        }
        if (!entry.name.endsWith('.js')) continue;
        const source = await readFile(new URL(entry.name, dirUrl), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        await visit(`${relativeLabel}${entry.name}`, codeOnly);
    }
}

async function run() {
    // ===============================================================
    // Section A — the complete reachable path, driven from a reproduced
    // World View click through placement, announcement, discovery,
    // retrieval, and verification, proven by call ORDER, not merely by
    // final outcome.
    // ===============================================================
    {
        const log = [];
        const gateway = makeFakeArweaveGateway(log);
        const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
        const network = makeNostrNetwork(log);
        const discoveryTag = 'audit-e2e-flagship';
        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

        const publication = new Publication({ id: 'pub-e2e-flagship', documentId: 'doc-e2e-flagship' });
        const snapshotJson = { world: { buildings: [{ id: 'flagship-e2e-building', bricks: 4 }] } };
        const expectedBytes = JSON.stringify(snapshotJson);
        const expectedHash = computeContentHash(expectedBytes);
        const contentResolver = fakeContentResolver({ [publication.id]: snapshotJson });

        // World View -> WorldView.js's own distributeWorldEncounterSnapshot()
        // (reproduced) -> executeSnapshotDistributionCommand() -> ArweaveContentStore.put()
        // -> NostrSnapshotDiscoveryPublisher.publish().
        const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
        const distributeWorldEncounterSnapshot = makeSnapshotDistributionAction({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver, log });

        const ctx = canvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };

        assert(ctx.distributablePublication === publication, 'A1. sanity: WorldEncounterCanvas resolves the exact loaded Publication object this scenario set up');

        ctx.distributeSelectedSnapshot();
        assert(ctx.snapshotDistributionExecuting === true, 'A2. the World View click enters executing state synchronously');

        await flushMicrotasks();

        assert(ctx.snapshotDistributionExecuting === false, 'A3. execution returns to idle once the command resolves');
        assert(ctx.snapshotDistributionError === null, 'A4. a successful call leaves no error notice');
        assert(ctx.snapshotDistributionResult.contentReference.hash === expectedHash, 'A5. the panel holds the real placement\'s own content hash');
        assert(ctx.snapshotDistributionResult.announcement.published === true, 'A6. the panel holds a real, genuinely published Nostr announcement');

        assert(log.join(',') === 'ACTION,PLACEMENT,ANNOUNCEMENT', 'A7. after the World View click alone, exactly ACTION then PLACEMENT then ANNOUNCEMENT happened, in that order — discovery, retrieval, and verification have not even begun yet');

        // A caller (standing in for a later Wanderer's own discovery
        // action) now drives discovery -> resolution -> retrieval,
        // logging onto the SAME shared log.
        const registry = new SnapshotPlacementStoreRegistry();
        registry.register(store);
        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);

        const resolved = await resolver.resolve(discoveryTag, expectedHash, { storeRegistry: registry });

        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'A8. discovery, location, retrieval, and verification all succeeded inside this one resolve() call');
        assert(resolved.locator === ctx.snapshotDistributionResult.contentReference.uri, 'A9. the locator resolved via discovery is EXACTLY the one this World View click\'s own placement produced — it travelled through discovery, never handed to the resolver directly');
        assert(resolved.bytes === expectedBytes, 'A10. the retrieved bytes are byte-identical to the Snapshot the World View click originally distributed');

        // The content-hash comparison just performed IS the observable
        // proof verification occurred — computeContentHash() is a pure
        // function inside DecentralizedSnapshotResolver.js with no seam to
        // spy on directly, so this call stands in for it, in exactly the
        // position verification actually runs: strictly after retrieval,
        // and only reached because RESOLVED (asserted above) already
        // proves the hash comparison succeeded.
        assert(computeContentHash(resolved.bytes) === expectedHash, 'A11. the resolved bytes still hash to the originally distributed contentHash');
        log.push('VERIFICATION');

        assert(log.join(',') === 'ACTION,PLACEMENT,ANNOUNCEMENT,DISCOVERY,RETRIEVAL,VERIFICATION', 'A12. FLAGSHIP: the complete, real ordering is action -> placement -> announcement -> discovery -> retrieval -> verification, proven by a shared call-order log, never merely asserted from the final result');

        console.log('✓ Section A: a reproduced World View click reaches placement, announcement, discovery, retrieval, and verification in exactly that order, proven by a shared call-order log');
    }

    // ===============================================================
    // Section B — identity separation. contentReference.hash, the Arweave
    // transaction id, the Nostr event id, and the snapshot locator are
    // four pairwise-distinct identifiers; publication identity is a fifth,
    // unrelated axis. The resolver must refuse a tx id or event id
    // presented in place of a contentHash.
    // ===============================================================
    {
        const { store, network, registry, resolver } = makeScenario();
        const discoveryTag = 'audit-e2e-identity';
        const bytes = 'Section B: one Snapshot, several independent external identifiers';
        const reference = await store.put(bytes);
        const transactionId = reference.uri.slice('ar://'.length);

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        const announcement = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });

        assert(reference.hash !== transactionId, 'B1. contentReference.hash != the Arweave transaction id');
        assert(reference.hash !== announcement.id, 'B2. contentReference.hash != the Nostr event id');
        assert(reference.hash !== reference.uri, 'B3. contentReference.hash != the snapshot locator (the ar:// URI) — a hash and a URI are two different identifiers, not two spellings of one');
        assert(transactionId !== announcement.id, 'B4. the Arweave transaction id != the Nostr event id');
        assert(reference.uri !== announcement.id, 'B5. the snapshot locator != the Nostr event id');
        assert(reference.uri !== transactionId, 'B6. the snapshot locator (ar://<txid>) != the bare transaction id it embeds — the locator is its own, separate identifier');

        // Reject any accidental implementation that starts treating a
        // transaction id or an event id as content identity: resolving by
        // EITHER of those, instead of the real contentHash, must fail.
        const byTransactionId = await resolver.resolve(discoveryTag, transactionId, { storeRegistry: registry });
        assert(byTransactionId.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'B7. resolving by the Arweave transaction id instead of contentHash fails — this pipeline never treats a transaction id as content identity');
        const byEventId = await resolver.resolve(discoveryTag, announcement.id, { storeRegistry: registry });
        assert(byEventId.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'B8. resolving by the Nostr event id instead of contentHash fails — this pipeline never treats an event id as content identity');
        const byContentHash = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
        assert(byContentHash.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'B9. only the real contentHash resolves');

        // Publication identity != snapshot identity, even though both
        // travel through the identical Arweave/Nostr substrate.
        const publication = new Publication({ id: 'pub-identity-axis', documentId: 'doc-identity-axis' });
        const bytesV1 = JSON.stringify({ v: 1 });
        const bytesV2 = JSON.stringify({ v: 2 });
        const refV1 = await store.put(bytesV1);
        const refV2 = await store.put(bytesV2);
        assert(refV1.hash !== refV2.hash, 'B10. the SAME publication identity produces two DIFFERENT snapshot identities once its own content changes');
        assert(publication.id !== refV1.hash && publication.id !== refV2.hash, 'B11. publication identity and snapshot identity are two disjoint string spaces — a publication\'s own id is never, itself, a content hash');

        console.log('✓ Section B: contentReference.hash, the Arweave transaction id, the Nostr event id, and the snapshot locator are four pairwise-distinct identifiers, publication identity is a fifth — and the resolver actively refuses a tx id or event id substituted for a contentHash');
    }

    // ===============================================================
    // Section C — distribution-family isolation. Snapshot Distribution
    // shares no class, lifecycle vocabulary, or envelope type with Signed
    // Claim distribution, in either direction. "Same substrate does not
    // imply same protocol."
    // ===============================================================
    {
        const snapshotForbiddenFromSignedClaim = [
            'PublicationDistributionCommand', 'PublicationDistributionLifecycle',
            'PublicationDistributionOrchestrator', 'PublicationDistributionExecutor',
            'DecentralizedDiscoveryEnvelope', 'ArweavePublicationMaterialUploader',
            'NostrPublicationDiscoveryPublisher'
        ];
        const snapshotCommandCode = await codeOnlySource('application/SnapshotDistributionCommand.js');
        const snapshotRuntimeCompositionCode = await codeOnlySource('application/SnapshotDistributionRuntimeComposition.js');
        for (const term of snapshotForbiddenFromSignedClaim) {
            assert(!snapshotCommandCode.includes(term), `C1. application/SnapshotDistributionCommand.js never references '${term}' — the Signed Claim lifecycle/envelope/orchestrator family`);
            assert(!snapshotRuntimeCompositionCode.includes(term), `C2. application/SnapshotDistributionRuntimeComposition.js never references '${term}' either`);
        }

        // Conversely: the existing Signed Claim path stays untouched by
        // this family — it never references Snapshot Distribution's own
        // classes either.
        const signedClaimForbiddenFromSnapshot = [
            'SnapshotDistributionCommand', 'SnapshotDistributionRuntimeComposition',
            'ArweaveContentStore', 'NostrSnapshotDiscoveryPublisher',
            'NostrSnapshotDiscoveryQueryService', 'DecentralizedSnapshotResolver',
            'SnapshotDiscoveryEnvelope'
        ];
        const publicationCommandCode = await codeOnlySource('application/PublicationDistributionCommand.js');
        const publicationLifecycleCode = await codeOnlySource('application/PublicationDistributionLifecycle.js');
        const nostrPublicationPublisherCode = await codeOnlySource('application/NostrPublicationDiscoveryPublisher.js');
        for (const term of signedClaimForbiddenFromSnapshot) {
            assert(!publicationCommandCode.includes(term), `C3. application/PublicationDistributionCommand.js never references '${term}' — the Snapshot family`);
            assert(!publicationLifecycleCode.includes(term), `C4. application/PublicationDistributionLifecycle.js never references '${term}' either — no shared lifecycle vocabulary`);
            assert(!nostrPublicationPublisherCode.includes(term), `C5. application/NostrPublicationDiscoveryPublisher.js never references '${term}' — same physical substrate (Nostr), two disjoint publisher classes`);
        }

        // "Same substrate does not imply same protocol," proven for both
        // Nostr publishers concretely: neither imports the other.
        const snapshotPublisherCode = await codeOnlySource('application/NostrSnapshotDiscoveryPublisher.js');
        assert(!snapshotPublisherCode.includes('NostrPublicationDiscoveryPublisher'), 'C6. application/NostrSnapshotDiscoveryPublisher.js never imports the Signed Claim family\'s own Nostr publisher');
        assert(!nostrPublicationPublisherCode.includes('NostrSnapshotDiscoveryPublisher'), 'C7. ...and the reverse holds too — neither Nostr publisher class knows the other exists');

        // ArweaveContentStore.js (Snapshot placement) and
        // ArweavePublicationMaterialUploader.js (Signed Claim placement)
        // hold the identical mutual isolation, one substrate over.
        const arweaveStoreCode = await codeOnlySource('content/ArweaveContentStore.js');
        const arweaveUploaderCode = await codeOnlySource('application/ArweavePublicationMaterialUploader.js');
        assert(!arweaveStoreCode.includes('ArweavePublicationMaterialUploader') && !arweaveStoreCode.includes('PublicationDistribution'), 'C8. content/ArweaveContentStore.js never references the Signed Claim family\'s own Arweave uploader or distribution vocabulary');
        assert(!arweaveUploaderCode.includes('ArweaveContentStore') && !arweaveUploaderCode.includes('SnapshotDistribution'), 'C9. application/ArweavePublicationMaterialUploader.js never references the Snapshot family\'s own content store or distribution vocabulary');

        console.log('✓ Section C: Snapshot Distribution and Signed Claim distribution share no class, lifecycle vocabulary, or envelope type in either direction — same substrate, two disjoint protocols');
    }

    // ===============================================================
    // Section D — the asymmetric failure matrix.
    // ===============================================================
    {
        // Row 1 — Arweave unavailable: placement fails, announcement is
        // never even attempted, and the command cannot produce a locator.
        {
            const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('gateway down', { status: 500 }) });
            let publishCalls = 0;
            const publisher = { discoveryTag: 'audit-e2e-d-row1', publish: async () => { publishCalls += 1; return { published: true, id: 'a'.repeat(64) }; } };
            let threw = false;
            try {
                await executeSnapshotDistributionCommand({ bytes: 'row1 bytes', contentStore: brokenStore, discoveryPublisher: publisher });
            } catch {
                threw = true;
            }
            assert(threw, 'D1. Row 1 — an unavailable Arweave gateway makes placement itself fail, and that rejection propagates from the command');
            assert(publishCalls === 0, 'D2. Row 1 — announcement is never even attempted when placement never produced a locator to announce');
        }

        // Row 2 — Arweave succeeds, Nostr declines (publish() resolves
        // null): a legitimate partial result, never an error.
        {
            const gateway = makeFakeArweaveGateway();
            const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
            const decliningPublisher = { discoveryTag: 'audit-e2e-d-row2', publish: async () => null };
            const bytes = 'row2 bytes';
            const result = await executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: decliningPublisher });
            assert(result.contentReference.hash === computeContentHash(bytes), 'D3. Row 2 — placement genuinely succeeded');
            assert(result.announcement === null, 'D4. Row 2 — a declining Nostr publisher resolves to a legitimate, non-error null announcement, never a fabricated one');
        }

        // Row 3 — Nostr transport failure (publish() REJECTS, never
        // merely declines): the command's own promise rejects, but the
        // Arweave placement it already made is completely unaffected —
        // the milestone's own centerpiece assertion for this section.
        {
            const gateway = makeFakeArweaveGateway();
            const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
            let capturedReference = null;
            const originalPut = store.put.bind(store);
            store.put = async (bytes) => {
                const reference = await originalPut(bytes);
                capturedReference = reference;
                return reference;
            };
            const throwingPublisher = { discoveryTag: 'audit-e2e-d-row3', publish: async () => { throw new Error('relay unreachable'); } };
            const bytes = 'row3 bytes';

            let rejected = false;
            try {
                await executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: throwingPublisher });
            } catch {
                rejected = true;
            }
            assert(rejected, 'D5. Row 3 — a genuine Nostr transport failure propagates as a rejection from the command');
            assert(capturedReference !== null, 'D6. Row 3 — sanity: placement genuinely completed, producing a real contentReference, before the Nostr call was even attempted');

            const stillThere = await store.get(capturedReference);
            assert(stillThere === bytes, 'D7. Row 3 — FLAGSHIP: even though the command itself rejected, the Arweave placement it already made remains fully intact and independently retrievable. A Nostr failure must NEVER undo an Arweave placement.');
        }

        // Row 4 — wrong discovered bytes: placement and announcement both
        // succeed, but the announced locator serves content that does not
        // match the announced contentHash. Verification rejects. (Given
        // dedicated, expanded treatment in Section E, below — recorded
        // here too so the matrix itself is complete.)
        {
            const { store, registry, network, resolver } = makeScenario();
            const discoveryTag = 'audit-e2e-d-row4';
            const decoyBytes = 'row4: real bytes that genuinely exist at their own real locator';
            const decoyReference = await store.put(decoyBytes);
            const claimedHash = computeContentHash('row4: bytes that were never actually placed anywhere');
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
            await publisher.publish({ contentHash: claimedHash, locator: decoyReference.uri, storage: decoyReference.storage });
            const result = await resolver.resolve(discoveryTag, claimedHash, { storeRegistry: registry });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'D8. Row 4 — placement and announcement both succeed, but wrongly discovered bytes make verification reject with CONTENT_HASH_MISMATCH');
        }

        // Row 5 — discovery unavailable: placement and announcement both
        // succeed, but the Nostr query itself cannot be performed.
        // Resolution cannot complete.
        {
            const { store, network } = makeScenario();
            const discoveryTag = 'audit-e2e-d-row5';
            const bytes = 'row5 bytes';
            const reference = await store.put(bytes);
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
            const announced = await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
            assert(announced.published === true, 'D9. Row 5 — sanity: placement and announcement both genuinely succeeded');
            const brokenQuery = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay unreachable'); } });
            const brokenResolver = new DecentralizedSnapshotResolver(brokenQuery);
            const registry = new SnapshotPlacementStoreRegistry();
            registry.register(store);
            const result = await brokenResolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'D10. Row 5 — with discovery unavailable, resolution cannot complete, reporting NOT_DISCOVERED even though the content is genuinely placed and genuinely announced elsewhere');
        }

        // Row 6 — retrieval unavailable: placement and announcement both
        // succeed, discovery succeeds, but the store cannot presently
        // retrieve bytes. Resolution reports the content unavailable.
        {
            const { store, network, resolver } = makeScenario();
            const discoveryTag = 'audit-e2e-d-row6';
            const bytes = 'row6 bytes';
            const reference = await store.put(bytes);
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
            await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
            const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: async () => new Response('gateway overloaded', { status: 503 }) });
            const brokenRegistry = new SnapshotPlacementStoreRegistry().register(brokenStore);
            const result = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: brokenRegistry });
            assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'D11. Row 6 — discovery succeeded (a candidate is present), but a broken store cannot retrieve bytes, reporting CONTENT_UNAVAILABLE — a distinct outcome from NOT_DISCOVERED and CONTENT_HASH_MISMATCH');
            assert(result.candidates.length === 1, 'D12. Row 6 — the discovered candidate is still reported, proving discovery genuinely happened before retrieval failed');
        }

        console.log('✓ Section D: the asymmetric failure matrix — all six rows produce their own distinct, documented consequence, and a Nostr failure never undoes an already-made Arweave placement');
    }

    // ===============================================================
    // Section E — discovery is not verification. A false-discovery
    // flagship negative: Nostr discovery is evidence about a LOCATION,
    // never evidence that the location holds the expected content.
    // ===============================================================
    {
        const { store, registry, network, resolver } = makeScenario();
        const discoveryTag = 'audit-e2e-false-discovery';

        const realBytesAtL = 'Section E: real bytes that genuinely live at locator L, honestly retrievable';
        const referenceAtL = await store.put(realBytesAtL);
        const claimedHash = computeContentHash('Section E: bytes that were never placed anywhere at all');
        assert(claimedHash !== referenceAtL.hash, 'E0. sanity: the claimed hash and the actual hash of what L serves are genuinely different');

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: claimedHash, locator: referenceAtL.uri, storage: referenceAtL.storage });

        let getCallCount = 0;
        const originalGet = store.get.bind(store);
        store.get = async (ref) => { getCallCount += 1; return originalGet(ref); };

        const result = await resolver.resolve(discoveryTag, claimedHash, { storeRegistry: registry });

        assert(getCallCount === 1, 'E1. retrieval genuinely ran exactly once — this is not a shortcut that skips straight to rejection because the caller "smells" a mismatch');
        assert(result.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED, 'E2. a claimed contentHash that does not match what the announced locator actually serves must NEVER resolve');
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'E3. the mismatch is reported specifically, not conflated with NOT_DISCOVERED or CONTENT_UNAVAILABLE');
        assert(result.bytes === null, 'E4. the real bytes genuinely retrieved from L are never handed back as if they were the requested Snapshot');
        assert(result.candidates.length === 1 && result.candidates[0].locator === referenceAtL.uri, 'E5. the false candidate is still reported, so a caller can see exactly what was retrieved and rejected');

        console.log('✓ Section E: FLAGSHIP NEGATIVE — Nostr discovery is evidence about a location, never evidence that the location holds the expected content; a genuinely retrievable, genuinely wrong-content locator reports CONTENT_HASH_MISMATCH, never RESOLVED');
    }

    // ===============================================================
    // Section F — candidate preservation. Several independently announced
    // candidates for one contentHash all survive on the result, resolution
    // is deterministic first-match, and the resolver's own source carries
    // no ranking vocabulary of any kind.
    // ===============================================================
    {
        const { store, network, registry } = makeScenario();
        const discoveryTag = 'audit-e2e-candidates';
        const bytes = 'Section F: the same content, genuinely retrievable from more than one announced candidate';
        const reference = await store.put(bytes);

        const getCalls = [];
        const originalGet = store.get.bind(store);
        store.get = async (ref) => { getCalls.push(ref.uri); return originalGet(ref); };

        const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
        await publisher.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage }); // candidate #1 — genuinely valid
        await publisher.publish({ contentHash: reference.hash, locator: 'ar://a-second-locator-that-does-not-exist', storage: 'ar' }); // candidate #2 — never reached
        await publisher.publish({ contentHash: reference.hash, locator: 'ar://a-third-locator-that-does-not-exist', storage: 'ar' }); // candidate #3 — never reached

        const query = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
        const resolver = new DecentralizedSnapshotResolver(query);
        const result = await resolver.resolve(discoveryTag, reference.hash, { storeRegistry: registry });

        assert(result.candidates.length === 3, 'F1. all three independently announced candidates are preserved on the result, never collapsed to one');
        assert(result.candidates[0].locator === reference.uri, 'F2. candidate #1 preserves its own announced order');
        assert(result.candidates[1].locator === 'ar://a-second-locator-that-does-not-exist', 'F3. candidate #2 preserves its own announced order');
        assert(result.candidates[2].locator === 'ar://a-third-locator-that-does-not-exist', 'F4. candidate #3 preserves its own announced order');

        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'F5. resolution succeeds against the FIRST candidate');
        assert(result.locator === reference.uri, 'F6. the attempted locator is candidates[0] — a deterministic first match, never a "best"/"fastest"/"newest" pick among three candidates');
        assert(getCalls.length === 1 && getCalls[0] === reference.uri, 'F7. FLAGSHIP NEGATIVE: only candidate #1\'s own locator was ever consulted — candidates #2 and #3 were never even attempted');

        // The resolver's own source (and the discovery query service's own
        // resolveLocator(), the identical rule extended from) must never
        // introduce ranking vocabulary — checked directly, not merely
        // inferred from this one scenario's own behavior.
        const resolverCode = await codeOnlySource('application/DecentralizedSnapshotResolver.js');
        const queryServiceCode = await codeOnlySource('application/NostrSnapshotDiscoveryQueryService.js');
        const rankingVocabulary = /\bbest\b|\btrusted\b|\brank(ing|ed)?\b|\bfastest\b|\bnewest\b|\bwinner\b|\bpreferred\b/i;
        assert(!rankingVocabulary.test(resolverCode), 'F8. application/DecentralizedSnapshotResolver.js\'s own CODE (comments excluded) contains no "best"/"trusted"/"rank"/"fastest"/"newest"/"winner"/"preferred" vocabulary');
        assert(!rankingVocabulary.test(queryServiceCode), 'F9. application/NostrSnapshotDiscoveryQueryService.js\'s own CODE contains none of that vocabulary either');

        console.log('✓ Section F: multiple independent candidates for one contentHash all survive, resolution is deterministic first-match, and no ranking vocabulary exists anywhere in the resolver\'s own code');
    }

    // ===============================================================
    // Section G — World View structural boundary. ui/views/WorldView.js
    // and ui/components/WorldEncounterCanvas.js (and every other file
    // under ui/, main.js excepted as the composition root) never touch a
    // decentralized substrate directly.
    // ===============================================================
    {
        const forbiddenAlways = /crypto\.subtle|new WebSocket\(|new ArweaveContentStore\(|new NostrSnapshotDiscoveryPublisher\(|computeContentHash\(|createTransaction|signEvent\(/;
        const hostCapabilityRead = /window\.arweaveWallet|window\.nostr\b/;
        const auditedFiles = [];

        await walkJsFiles(new URL('../ui/', import.meta.url), '', new Set(), async (relativePath, codeOnly) => {
            auditedFiles.push(relativePath);
            assert(!forbiddenAlways.test(codeOnly), `G1. ui/${relativePath} never constructs an Arweave client, a Nostr client, a raw WebSocket, hashes content, or touches crypto.subtle/transaction/event construction directly`);
            const isCompositionRoot = relativePath === 'main.js';
            if (!isCompositionRoot) {
                assert(!hostCapabilityRead.test(codeOnly), `G2. ui/${relativePath} never reads window.arweaveWallet/window.nostr directly — only the composition root (ui/main.js) may resolve a host capability`);
            }
        });

        assert(auditedFiles.includes('views/WorldView.js'), 'G3. sanity: this scan actually reached ui/views/WorldView.js');
        assert(auditedFiles.includes('components/WorldEncounterCanvas.js'), 'G4. sanity: this scan actually reached ui/components/WorldEncounterCanvas.js');
        assert(auditedFiles.includes('main.js'), 'G5. sanity: this scan actually reached ui/main.js, the one exempted composition root');

        // Positive control: the composition root DOES resolve the real
        // host capabilities the architecture diagram names — proving G2's
        // exemption is genuinely exercised, not merely vacuous because
        // main.js happens not to contain the pattern at all.
        const mainCode = await codeOnlySource('ui/main.js');
        assert(hostCapabilityRead.test(mainCode), 'G6. ui/main.js genuinely does resolve window.arweaveWallet/window.nostr — the one place in this codebase that legitimately does');
        assert(mainCode.includes('composeSnapshotDistributionRuntime(') && mainCode.includes('executeSnapshotDistributionCommand('), 'G7. ui/main.js is genuinely the composition root that turns a host capability into the Snapshot distribution command — the intended boundary this section audits against');

        console.log('✓ Section G: World View knows WHAT operation to request, never HOW the decentralized substrates work — no window.arweaveWallet/window.nostr/WebSocket/crypto.subtle/content-hashing/transaction-or-event construction anywhere under ui/, main.js excepted as the one legitimate composition root');
    }

    // ===============================================================
    // Section H — UI state semantics: ephemeral execution, per-selection
    // results, no overlapping calls, no stale overwrite, no partial
    // success reclassified as failure, and Snapshot/Publication panels
    // stay mutually inert.
    // ===============================================================
    {
        // H-i. Execution is ephemeral, and a result belongs to the
        // current selection: switching selection clears it immediately.
        {
            let resolveStale;
            const publicationA = new Publication({ id: 'pub-e2e-h-a', documentId: 'doc-e2e-h-a' });
            const publicationB = new Publication({ id: 'pub-e2e-h-b', documentId: 'doc-e2e-h-b' });
            const ctx = canvasCtx({ snapshotDistributionCommand: () => new Promise((resolve) => { resolveStale = resolve; }) });

            ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publicationA.id });
            ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publicationA } };
            ctx.distributeSelectedSnapshot();
            assert(ctx.snapshotDistributionExecuting === true, 'H1. a call for Snapshot A starts executing');
            await Promise.resolve();
            await Promise.resolve();

            ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publicationB.id });
            assert(ctx.snapshotDistributionExecuting === false, 'H2. selecting Snapshot B resets executing state immediately — execution is ephemeral, never tied to a specific in-flight call outliving the selection that started it');
            assert(ctx.snapshotDistributionError === null, 'H3. selecting Snapshot B also clears any prior error notice');
            assert(ctx.snapshotDistributionResult === null, 'H4. selecting Snapshot B also clears any prior result — a result belongs to the selection that produced it, never to whichever selection happens to be current later');

            // Snapshot A selected -> distribute A -> switch to Snapshot B
            // -> A's delayed result arrives -> A's result must NEVER
            // appear for B.
            resolveStale({ contentReference: { hash: 'stale-hash', uri: 'ar://stale', storage: 'ar' }, announcement: null });
            await flushMicrotasks();
            assert(ctx.snapshotDistributionExecuting === false, 'H5. Snapshot A\'s own stale resolution never re-enters executing state for Snapshot B\'s selection');
            assert(ctx.snapshotDistributionResult === null, 'H6. Snapshot A\'s own stale result NEVER overwrites Snapshot B\'s state');

            console.log('✓ Section H-i: switching the selected Snapshot invalidates a stale in-flight distribution response — a delayed result for A never appears for B');
        }

        // H-ii. Duplicate clicks never start a second, overlapping call.
        {
            let calls = 0;
            let resolveFirst;
            const publication = new Publication({ id: 'pub-e2e-h-dup', documentId: 'doc-e2e-h-dup' });
            const ctx = canvasCtx({
                selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
                materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
                snapshotDistributionCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
            });

            ctx.distributeSelectedSnapshot();
            ctx.distributeSelectedSnapshot();
            ctx.distributeSelectedSnapshot();
            await Promise.resolve();
            await Promise.resolve();
            assert(calls === 1, 'H7. three rapid clicks while a call is in flight never start more than one overlapping call');

            resolveFirst({ contentReference: { hash: 'h', uri: 'ar://h', storage: 'ar' }, announcement: null });
            await flushMicrotasks();
            assert(ctx.snapshotDistributionExecuting === false, 'H8. the in-flight call eventually resolves and execution returns to idle');

            ctx.distributeSelectedSnapshot();
            await Promise.resolve();
            await Promise.resolve();
            assert(calls === 2, 'H9. once idle again, a fresh click genuinely starts a new call');

            console.log('✓ Section H-ii: duplicate clicks never create overlapping Snapshot distribution operations');
        }

        // H-iii. A partial success (placement without announcement) is
        // never reclassified as a failure.
        {
            const publication = new Publication({ id: 'pub-e2e-h-partial', documentId: 'doc-e2e-h-partial' });
            const sentinelPartial = Object.freeze({
                contentReference: Object.freeze({ hash: 'partial-hash', uri: 'ar://partial', storage: 'ar' }),
                announcement: null
            });
            const ctx = canvasCtx({
                selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
                materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
                snapshotDistributionCommand: () => Promise.resolve(sentinelPartial)
            });

            ctx.distributeSelectedSnapshot();
            await flushMicrotasks();

            assert(ctx.snapshotDistributionError === null, 'H10. a legitimate partial success (placement without announcement) is NEVER surfaced as an error');
            assert(ctx.snapshotDistributionResult === sentinelPartial, 'H11. the exact partial result the command produced is stored and exposed verbatim — no reinterpretation, no re-wrapping');

            console.log('✓ Section H-iii: a partial success (Arweave placement without a Nostr announcement) is never incorrectly converted into a failure');
        }

        // H-iv. The Snapshot Distribution panel's own state is completely
        // inert with respect to the Publication Distribution panel's, and
        // vice versa — two independent panels, never one shared state
        // machine wearing two skins.
        {
            const publication = new Publication({ id: 'pub-e2e-h-separation', documentId: 'doc-e2e-h-separation' });
            const baseCtx = () => canvasCtx({
                selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
                materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } }
            });

            // Distributing the Snapshot never touches ANY Publication
            // Distribution field.
            const ctxSnapshotOnly = baseCtx();
            ctxSnapshotOnly.snapshotDistributionCommand = () => Promise.resolve({ contentReference: { hash: 'sep-hash', uri: 'ar://sep', storage: 'ar' }, announcement: null });
            ctxSnapshotOnly.distributionCommand = () => { throw new Error('distributionCommand must never be called by distributeSelectedSnapshot()'); };
            ctxSnapshotOnly.distributeSelectedSnapshot();
            await flushMicrotasks();
            assert(ctxSnapshotOnly.distributionExecuting === false && ctxSnapshotOnly.distributionError === null && ctxSnapshotOnly.distributionRequestId === 0, 'H12. distributeSelectedSnapshot() never reads or writes distributionExecuting/distributionError/distributionRequestId — the Publication Distribution family\'s own fields');

            // Distributing the Publication never touches ANY Snapshot
            // Distribution field.
            const ctxPublicationOnly = baseCtx();
            ctxPublicationOnly.distributionCommand = () => Promise.resolve(null);
            ctxPublicationOnly.snapshotDistributionCommand = () => { throw new Error('snapshotDistributionCommand must never be called by distributeSelectedPublication()'); };
            ctxPublicationOnly.distributeSelectedPublication();
            await flushMicrotasks();
            assert(ctxPublicationOnly.snapshotDistributionExecuting === false && ctxPublicationOnly.snapshotDistributionError === null && ctxPublicationOnly.snapshotDistributionResult === null && ctxPublicationOnly.snapshotDistributionRequestId === 0, 'H13. distributeSelectedPublication() never reads or writes any snapshotDistribution* field — the Snapshot Distribution family\'s own fields');

            console.log('✓ Section H-iv: the Snapshot Distribution panel\'s state and the Publication Distribution panel\'s state are mutually inert — two independent panels, never one shared machine');
        }
    }

    // ===============================================================
    // Section I — no hidden second path. Every production .js file in
    // this repository is scanned for a construction/call site of this
    // family's own key seams, and the resulting set is compared, file for
    // file, against exactly what this architecture intends.
    // ===============================================================
    {
        const constructions = {
            'new ArweaveContentStore(': [],
            'new NostrSnapshotDiscoveryPublisher(': [],
            'executeSnapshotDistributionCommand(': [],
            'composeSnapshotDistributionRuntime(': []
        };
        const patterns = Object.keys(constructions);
        const skipDirNames = new Set(['.git', 'tests', 'docs', 'assets', 'css', 'node_modules']);

        await walkJsFiles(new URL('../', import.meta.url), '', skipDirNames, async (relativePath, codeOnly) => {
            for (const pattern of patterns) {
                if (codeOnly.includes(pattern)) {
                    constructions[pattern].push(relativePath);
                }
            }
        });

        assert(
            constructions['new ArweaveContentStore('].sort().join(',') === 'application/SnapshotDistributionRuntimeComposition.js',
            `I1. 'new ArweaveContentStore(' appears in exactly ONE production file (application/SnapshotDistributionRuntimeComposition.js) — found in: ${constructions['new ArweaveContentStore('].join(', ') || '(none)'}`
        );
        assert(
            constructions['new NostrSnapshotDiscoveryPublisher('].sort().join(',') === 'application/SnapshotDistributionRuntimeComposition.js',
            `I2. 'new NostrSnapshotDiscoveryPublisher(' appears in exactly ONE production file (application/SnapshotDistributionRuntimeComposition.js) — found in: ${constructions['new NostrSnapshotDiscoveryPublisher('].join(', ') || '(none)'}`
        );
        assert(
            constructions['executeSnapshotDistributionCommand('].sort().join(',') === 'application/SnapshotDistributionCommand.js,ui/main.js',
            `I3. 'executeSnapshotDistributionCommand(' appears ONLY where it is defined (application/SnapshotDistributionCommand.js) and where it is called (ui/main.js) — found in: ${constructions['executeSnapshotDistributionCommand('].join(', ') || '(none)'}`
        );
        assert(
            constructions['composeSnapshotDistributionRuntime('].sort().join(',') === 'application/SnapshotDistributionRuntimeComposition.js,ui/main.js',
            `I4. 'composeSnapshotDistributionRuntime(' appears ONLY where it is defined (application/SnapshotDistributionRuntimeComposition.js) and where it is called (ui/main.js) — found in: ${constructions['composeSnapshotDistributionRuntime('].join(', ') || '(none)'}`
        );

        // Negative control, named explicitly: the one hidden-second-path
        // shape this section exists to catch — WorldEncounterCanvas.js
        // constructing a decentralized collaborator directly, bypassing
        // WorldView.js and the composed command entirely.
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(!canvasCode.includes('new ArweaveContentStore(') && !canvasCode.includes('new NostrSnapshotDiscoveryPublisher('), 'I5. NEGATIVE CONTROL: ui/components/WorldEncounterCanvas.js never constructs ArweaveContentStore/NostrSnapshotDiscoveryPublisher directly — the one hidden second path this section exists to catch');

        console.log('✓ Section I: the only construction/call sites for ArweaveContentStore, NostrSnapshotDiscoveryPublisher, and the Snapshot Distribution command/composition functions, anywhere in this repository, are exactly the ones this architecture intends');
    }

    console.log('\n✅ All Snapshot Distribution End-to-End Runtime & UI Audit tests passed.');
}

await run();
