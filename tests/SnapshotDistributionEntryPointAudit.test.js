import { readFile, readdir } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';

// 0.9.141 — Distribution Entry-Point Convergence Audit.
//
// 0.9.138 gave WorldEncounterCanvas a "Distribute Snapshot" action reachable
// only through a selected World Encounter; 0.9.140 gave OwnPublicationPanel
// a second, independent entry point reachable with zero peers. Both
// milestones' own tests already prove each surface works in isolation
// (tests/SnapshotDistributionEndToEndRuntimeAudit.test.js for the former,
// tests/WorldViewOwnPublicationDistribution.test.js for the latter). Neither
// ever drives both surfaces in ONE scenario. This file adds ZERO new
// production code — the same "regression-locking, test-only audit" shape
// those two files already established — and closes exactly that gap: does
// the architecture genuinely hold TWO ENTRY POINTS, ONE EXECUTION PATH?
//
//                    World View
//                       │
//             ┌─────────┴─────────┐
//             │                   │
//             ▼                   ▼
//      My Publication       World Encounters
//    (OwnPublicationPanel)  (WorldEncounterCanvas)
//             │                   │
//        local snapshot      selected snapshot
//             │                   │
//             └─────────┬─────────┘
//                       ▼
//        distributeWorldEncounterSnapshot()   (ui/views/WorldView.js,
//                       │                        ONE function, bound to
//                       ▼                        both templates)
//        executeSnapshotDistributionCommand()
//                       │
//             ┌─────────┴─────────┐
//             ▼                   ▼
//       ArweaveContentStore  NostrSnapshotDiscoveryPublisher
//
// EIGHT SECTIONS, each a distinct claim from the milestone's own task
// framing:
//
//   A. Two entry points, one command — structural (WorldView.js binds the
//      identical distributeWorldEncounterSnapshot function to both
//      templates) AND behavioral (the SAME function reference, handed to
//      both a simulated OwnPublicationPanel and a simulated
//      WorldEncounterCanvas, genuinely places and announces for both).
//   B. Local entry-point independence — zero peers, zero World Encounters
//      state anywhere in scope.
//   C. Remote entry-point independence — a selected/discovered publication,
//      zero OwnPublicationPanel state anywhere in scope.
//   D. State isolation — the flagship combined sequence, driven in both
//      orders, plus genuine concurrent overlap.
//   E. Identity preservation — local and remote source Publications stay
//      distinguishable; distribution never mutates or merges either.
//   F. Failure isolation — an Arweave/Nostr failure through one entry point
//      never corrupts the other's independent, concurrent call.
//   G. Structural boundary — neither UI surface touches storage, wallet,
//      Nostr, crypto, or transport directly, and neither duplicates the
//      command's own put()-then-publish() sequencing.
//   H. Single execution path — repository-wide inspection confirms exactly
//      one wrapper function, one template binding site, and exactly two
//      (never three) UI components declaring a snapshotDistributionCommand
//      prop at all.
//
// DELIBERATELY NOT DONE HERE — PER THE MILESTONE'S OWN FRAMING. No new
// production code of any kind: SnapshotDistributionCommand.js,
// SnapshotDistributionRuntimeComposition.js, WorldEncounterCanvas.js, and
// OwnPublicationPanel.js are all untouched by this milestone. This file,
// its tests.html registration, and docs/Roadmap.md are the only changes.
// While building this audit, tests/WorldViewOwnPublicationDistribution.test.js
// (0.9.140's own flagship test) was found never registered in tests.html at
// all — the one place any test in this repository actually runs, since none
// of it executes under plain Node — meaning that test has never once run
// since it was written. Fixing that registration is exactly the kind of
// "did the solution create an architectural problem" finding this milestone
// exists to surface, so it is fixed alongside this file.

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

function makeFakeArweaveGateway({ alwaysFail = false, log = null, tag = 'PLACEMENT' } = {}) {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            if (log) log.push(tag);
            if (alwaysFail) return new Response('gateway down', { status: 500 });
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

function makeFakeArweaveSigner(prefix) {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-${prefix}-tx-${counter}`, transaction: { id: `fake-${prefix}-tx-${counter}`, data: material } };
    }
    return { sign };
}

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

// A fake application/PublicationCatalogContentResolver.js — the exact
// duck-typed collaborator ui/views/WorldView.js's own
// distributeWorldEncounterSnapshot() reads Snapshot bytes back through.
function fakeContentResolver(entries = {}) {
    return {
        resolve(publicationId) {
            return Object.prototype.hasOwnProperty.call(entries, publicationId) ? entries[publicationId] : null;
        }
    };
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterSnapshot()
// implements, reproduced verbatim — the ONE function this milestone's own
// Section A proves both UI surfaces are bound to.
function makeDistributeWorldEncounterSnapshot({ snapshotDistributionCommand, publicationCatalogContentResolver }) {
    return (publication) => {
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

// Mirrors tests/WorldViewOwnPublicationDistribution.test.js's own panelCtx().
function ownPanelCtx(overrides = {}) {
    return {
        publication: null,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        distributeOwnSnapshot: OwnPublicationPanel.methods.distributeOwnSnapshot,
        ...overrides
    };
}

// Mirrors tests/SnapshotDistributionEndToEndRuntimeAudit.test.js's own
// canvasCtx(), trimmed to exactly what distributeSelectedSnapshot() and
// distributablePublication touch.
function worldCanvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        snapshotDistributionCommand: null,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        distributeSelectedSnapshot: WorldEncounterCanvas.methods.distributeSelectedSnapshot,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

function selectRemotePublication(ctx, publication) {
    ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
    ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };
}

// One assembled real decentralized scenario shared by several sections
// below — a real ArweaveContentStore, a real (in-memory) Nostr network, and
// the ONE distributeWorldEncounterSnapshot function this whole file exists
// to prove both UI surfaces share.
function makeSharedScenario({ discoveryTag, contentEntries }) {
    const gateway = makeFakeArweaveGateway();
    const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner('shared'), fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork();
    const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
    const snapshotDistributionCommand = (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: publisher });
    const contentResolver = fakeContentResolver(contentEntries);
    const distributeWorldEncounterSnapshot = makeDistributeWorldEncounterSnapshot({ snapshotDistributionCommand, publicationCatalogContentResolver: contentResolver });
    return { store, network, distributeWorldEncounterSnapshot };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

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
    // Section A — two entry points, one command.
    // ===============================================================
    {
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        const ownBinding = /<OwnPublicationPanel[\s\S]{0,300}:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/;
        const canvasBinding = /<WorldEncounterCanvas[\s\S]{0,3000}:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/;
        assert(ownBinding.test(viewCode), 'A1. WorldView.js binds OwnPublicationPanel\'s snapshotDistributionCommand to distributeWorldEncounterSnapshot');
        assert(canvasBinding.test(viewCode), 'A2. WorldView.js binds WorldEncounterCanvas\'s snapshotDistributionCommand to the SAME distributeWorldEncounterSnapshot');
        assert((viewCode.match(/function distributeWorldEncounterSnapshot\(/g) || []).length === 1,
            'A3. distributeWorldEncounterSnapshot is declared exactly once — there is no second, shadow wrapper');

        // Behavioral: the SAME function reference, handed to both a
        // simulated OwnPublicationPanel and a simulated WorldEncounterCanvas,
        // genuinely reaches the real chain for both.
        const publicationLocal = new Publication({ id: 'pub-a-local', documentId: 'doc-a-local' });
        const publicationRemote = new Publication({ id: 'pub-a-remote', documentId: 'doc-a-remote' });
        const snapshotLocal = { world: { buildings: [{ id: 'a-local-building', bricks: 1 }] } };
        const snapshotRemote = { world: { buildings: [{ id: 'a-remote-building', bricks: 2 }] } };
        const { network, distributeWorldEncounterSnapshot } = makeSharedScenario({
            discoveryTag: 'audit-entry-point-a',
            contentEntries: { [publicationLocal.id]: snapshotLocal, [publicationRemote.id]: snapshotRemote }
        });

        const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        selectRemotePublication(canvasCtx, publicationRemote);

        assert(ownCtx.snapshotDistributionCommand === canvasCtx.snapshotDistributionCommand,
            'A4. both simulated surfaces hold the IDENTICAL function reference — not two equivalent copies');

        ownCtx.distributeOwnSnapshot();
        canvasCtx.distributeSelectedSnapshot();
        await flushMicrotasks();

        assert(ownCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify(snapshotLocal)),
            'A5. My Publication\'s own click genuinely placed its own bytes');
        assert(canvasCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify(snapshotRemote)),
            'A6. World Encounters\' own click genuinely placed the selected publication\'s own bytes');
        assert(network.events.length === 2, 'A7. both calls genuinely reached the ONE shared Nostr publisher — two announcements, not zero, not a third path');

        console.log('✓ Section A: WorldView.js binds one wrapper function to both UI surfaces, and that identical reference genuinely distributes for both');
    }

    // ===============================================================
    // Section B — local entry-point independence. Zero peers, zero World
    // Encounters state anywhere in scope.
    // ===============================================================
    {
        const publication = new Publication({ id: 'pub-b-local', documentId: 'doc-b-local' });
        const snapshotJson = { world: { buildings: [{ id: 'b-local-building', bricks: 3 }] } };
        const { distributeWorldEncounterSnapshot } = makeSharedScenario({
            discoveryTag: 'audit-entry-point-b',
            contentEntries: { [publication.id]: snapshotJson }
        });

        // Note what this section's own ctx never even declares: no
        // selectedEncounter, no materialInspection, no registry of any
        // kind — the exact absence the milestone's own Section B asks for.
        const ownCtx = ownPanelCtx({ publication, snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        assert(!('selectedEncounter' in ownCtx) && !('materialInspection' in ownCtx),
            'B1. sanity: this scenario carries no World Encounters vocabulary at all');

        ownCtx.distributeOwnSnapshot();
        await flushMicrotasks();

        assert(ownCtx.snapshotDistributionError === null, 'B2. local distribution succeeds with zero peers in scope');
        assert(ownCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify(snapshotJson)),
            'B3. the real content hash was placed');
        assert(ownCtx.snapshotDistributionResult.announcement.published === true, 'B4. the real announcement was published');

        console.log('✓ Section B: My Publication distributes with zero peers and zero World Encounters state of any kind in scope');
    }

    // ===============================================================
    // Section C — remote entry-point independence. A selected/discovered
    // publication, zero OwnPublicationPanel state anywhere in scope.
    // ===============================================================
    {
        const publication = new Publication({ id: 'pub-c-remote', documentId: 'doc-c-remote' });
        const snapshotJson = { world: { buildings: [{ id: 'c-remote-building', bricks: 5 }] } };
        const { distributeWorldEncounterSnapshot } = makeSharedScenario({
            discoveryTag: 'audit-entry-point-c',
            contentEntries: { [publication.id]: snapshotJson }
        });

        const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        selectRemotePublication(canvasCtx, publication);
        assert(!('publication' in canvasCtx), 'C1. sanity: this scenario carries no OwnPublicationPanel vocabulary at all');

        canvasCtx.distributeSelectedSnapshot();
        await flushMicrotasks();

        assert(canvasCtx.snapshotDistributionError === null, 'C2. remote distribution succeeds for the selected encounter');
        assert(canvasCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify(snapshotJson)),
            'C3. the real content hash was placed for the selected publication');

        console.log('✓ Section C: World Encounters distributes a selected publication with zero OwnPublicationPanel state of any kind in scope');
    }

    // ===============================================================
    // Section D — state isolation. The flagship combined sequence, driven
    // in both orders, plus genuine concurrent overlap.
    // ===============================================================
    {
        // D-i. Local, then remote — the flagship order the milestone's own
        // task framing spells out step by step.
        {
            const publicationLocal = new Publication({ id: 'pub-d1-local', documentId: 'doc-d1-local' });
            const publicationRemote = new Publication({ id: 'pub-d1-remote', documentId: 'doc-d1-remote' });
            const { distributeWorldEncounterSnapshot } = makeSharedScenario({
                discoveryTag: 'audit-entry-point-d1',
                contentEntries: { [publicationLocal.id]: { v: 'd1-local' }, [publicationRemote.id]: { v: 'd1-remote' } }
            });

            const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: distributeWorldEncounterSnapshot });
            const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });

            // 1-6: zero peers, local publication exists, complete local
            // distribution (Arweave placement + Nostr announcement).
            ownCtx.distributeOwnSnapshot();
            await flushMicrotasks();
            assert(ownCtx.snapshotDistributionResult !== null, 'D1. local distribution completed');
            const ownResultAfterLocal = ownCtx.snapshotDistributionResult;

            // 7-10: a remote publication now becomes selectable and is
            // distributed through World Encounters.
            selectRemotePublication(canvasCtx, publicationRemote);
            canvasCtx.distributeSelectedSnapshot();
            await flushMicrotasks();
            assert(canvasCtx.snapshotDistributionResult !== null, 'D2. remote distribution completed');

            // 11: the local panel's own state was not modified by the
            // remote distribution.
            assert(ownCtx.snapshotDistributionResult === ownResultAfterLocal, 'D3. My Publication\'s own result object is untouched by the later World Encounters distribution');
            assert(ownCtx.snapshotDistributionExecuting === false && ownCtx.snapshotDistributionError === null, 'D4. My Publication\'s own executing/error state is untouched by the later World Encounters distribution');

            console.log('✓ Section D-i: local-then-remote — distributing remotely never modifies the local panel\'s already-settled state');
        }

        // D-ii. The reverse order.
        {
            const publicationLocal = new Publication({ id: 'pub-d2-local', documentId: 'doc-d2-local' });
            const publicationRemote = new Publication({ id: 'pub-d2-remote', documentId: 'doc-d2-remote' });
            const { distributeWorldEncounterSnapshot } = makeSharedScenario({
                discoveryTag: 'audit-entry-point-d2',
                contentEntries: { [publicationLocal.id]: { v: 'd2-local' }, [publicationRemote.id]: { v: 'd2-remote' } }
            });

            const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: distributeWorldEncounterSnapshot });
            const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });

            selectRemotePublication(canvasCtx, publicationRemote);
            canvasCtx.distributeSelectedSnapshot();
            await flushMicrotasks();
            assert(canvasCtx.snapshotDistributionResult !== null, 'D5. remote distribution completed first');
            const canvasResultAfterRemote = canvasCtx.snapshotDistributionResult;

            ownCtx.distributeOwnSnapshot();
            await flushMicrotasks();
            assert(ownCtx.snapshotDistributionResult !== null, 'D6. local distribution completed second');

            assert(canvasCtx.snapshotDistributionResult === canvasResultAfterRemote, 'D7. World Encounters\' own result object is untouched by the later local distribution');
            assert(canvasCtx.snapshotDistributionExecuting === false && canvasCtx.snapshotDistributionError === null, 'D8. World Encounters\' own executing/error state is untouched by the later local distribution');

            console.log('✓ Section D-ii: remote-then-local — the two surfaces are genuinely independent regardless of which one goes first');
        }

        // D-iii. Genuine concurrent overlap — both calls in flight at once,
        // resolving out of order, over the SAME shared collaborators.
        {
            const publicationLocal = new Publication({ id: 'pub-d3-local', documentId: 'doc-d3-local' });
            const publicationRemote = new Publication({ id: 'pub-d3-remote', documentId: 'doc-d3-remote' });
            const { distributeWorldEncounterSnapshot } = makeSharedScenario({
                discoveryTag: 'audit-entry-point-d3',
                contentEntries: { [publicationLocal.id]: { v: 'd3-local' }, [publicationRemote.id]: { v: 'd3-remote' } }
            });

            const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: distributeWorldEncounterSnapshot });
            const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });
            selectRemotePublication(canvasCtx, publicationRemote);

            ownCtx.distributeOwnSnapshot();
            canvasCtx.distributeSelectedSnapshot();
            assert(ownCtx.snapshotDistributionExecuting === true && canvasCtx.snapshotDistributionExecuting === true,
                'D9. both surfaces enter executing state simultaneously — neither blocks the other from starting');

            await flushMicrotasks();

            assert(ownCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify({ v: 'd3-local' })),
                'D10. concurrent execution never cross-wires results — My Publication holds its own bytes\' hash');
            assert(canvasCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(JSON.stringify({ v: 'd3-remote' })),
                'D11. concurrent execution never cross-wires results — World Encounters holds its own selected bytes\' hash');
            assert(ownCtx.snapshotDistributionRequestId === 1 && canvasCtx.snapshotDistributionRequestId === 1,
                'D12. each surface\'s own request counter is independent — one surface\'s clicks never advance the other\'s');

            console.log('✓ Section D-iii: two genuinely concurrent, overlapping distributions over the same shared infrastructure never cross-wire either surface\'s own ephemeral state');
        }
    }

    // ===============================================================
    // Section E — identity preservation. Local and remote source
    // Publications stay distinguishable; distribution never mutates or
    // merges either.
    // ===============================================================
    {
        const publicationLocal = new Publication({ id: 'pub-e-local', documentId: 'doc-e-local' });
        const publicationRemote = new Publication({ id: 'pub-e-remote', documentId: 'doc-e-remote' });
        const frozenLocalId = publicationLocal.id;
        const frozenRemoteId = publicationRemote.id;
        const { distributeWorldEncounterSnapshot } = makeSharedScenario({
            discoveryTag: 'audit-entry-point-e',
            contentEntries: { [publicationLocal.id]: { v: 'e-local' }, [publicationRemote.id]: { v: 'e-remote' } }
        });

        const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: distributeWorldEncounterSnapshot });
        selectRemotePublication(canvasCtx, publicationRemote);

        ownCtx.distributeOwnSnapshot();
        canvasCtx.distributeSelectedSnapshot();
        await flushMicrotasks();

        assert(publicationLocal.id === frozenLocalId && publicationRemote.id === frozenRemoteId,
            'E1. neither Publication\'s own id was mutated by distributing it');
        assert(publicationLocal.id !== publicationRemote.id, 'E2. local and remote source Publications remain two distinct identities');
        assert(ownCtx.publication === publicationLocal, 'E3. My Publication\'s own panel still references the exact original local Publication object — distribution never silently replaced it');
        assert(canvasCtx.distributablePublication === publicationRemote, 'E4. World Encounters\' own panel still resolves the exact original remote Publication object');

        // Distribution results are keyed by content, never by publication
        // identity — the same axis 0.9.139's own Section B already proved
        // one layer down, held here across both entry points at once.
        assert(!('publicationId' in ownCtx.snapshotDistributionResult) && !('id' in ownCtx.snapshotDistributionResult),
            'E5. My Publication\'s own distribution result carries no publication-identity field of any kind — only contentReference/announcement');
        assert(!('publicationId' in canvasCtx.snapshotDistributionResult) && !('id' in canvasCtx.snapshotDistributionResult),
            'E6. World Encounters\' own distribution result carries no publication-identity field either');
        assert(ownCtx.snapshotDistributionResult.contentReference.hash !== canvasCtx.snapshotDistributionResult.contentReference.hash,
            'E7. two distinct Publications\' own distinct Snapshot bytes produced two distinct content hashes — content identity, not publication identity, is what distribution actually announces');

        console.log('✓ Section E: local and remote source Publications remain distinguishable throughout, and distribution never mutates, merges, or substitutes either one\'s identity');
    }

    // ===============================================================
    // Section F — failure isolation. An Arweave/Nostr failure through one
    // entry point never corrupts the other's independent, concurrent call.
    // ===============================================================
    {
        // F-i. The local entry point's own Nostr announcement transport
        // fails; the remote entry point, sharing the same Arweave store but
        // a working publisher, still succeeds — and the local entry point's
        // own already-made Arweave placement remains intact regardless.
        {
            const gateway = makeFakeArweaveGateway();
            const store = new ArweaveContentStore({ signer: makeFakeArweaveSigner('f1'), fetchImpl: gateway.fetchImpl });
            const network = makeNostrNetwork();
            const workingPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-entry-point-f1', publishImpl: network.publishImpl });
            const throwingPublisher = { discoveryTag: 'audit-entry-point-f1', publish: async () => { throw new Error('relay unreachable'); } };

            const publicationLocal = new Publication({ id: 'pub-f1-local', documentId: 'doc-f1-local' });
            const publicationRemote = new Publication({ id: 'pub-f1-remote', documentId: 'doc-f1-remote' });
            const localBytes = JSON.stringify({ v: 'f1-local' });
            const remoteBytes = JSON.stringify({ v: 'f1-remote' });
            const contentResolver = fakeContentResolver({ [publicationLocal.id]: { v: 'f1-local' }, [publicationRemote.id]: { v: 'f1-remote' } });

            const failingLocalAction = makeDistributeWorldEncounterSnapshot({
                snapshotDistributionCommand: (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: throwingPublisher }),
                publicationCatalogContentResolver: contentResolver
            });
            const workingRemoteAction = makeDistributeWorldEncounterSnapshot({
                snapshotDistributionCommand: (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: store, discoveryPublisher: workingPublisher }),
                publicationCatalogContentResolver: contentResolver
            });

            const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: failingLocalAction });
            const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: workingRemoteAction });
            selectRemotePublication(canvasCtx, publicationRemote);

            ownCtx.distributeOwnSnapshot();
            canvasCtx.distributeSelectedSnapshot();
            await flushMicrotasks();

            assert(ownCtx.snapshotDistributionError === 'Snapshot distribution could not be completed.', 'F1. the local entry point genuinely reports failure');
            assert(ownCtx.snapshotDistributionResult === null, 'F2. the local entry point produces no fabricated result');
            assert(canvasCtx.snapshotDistributionError === null && canvasCtx.snapshotDistributionResult !== null,
                'F3. the remote entry point\'s own concurrent, independent call succeeds despite the local entry point\'s failure');
            assert(canvasCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(remoteBytes),
                'F4. the remote entry point\'s own result is genuinely its own bytes, unaffected by the local failure');

            // The local placement genuinely happened before the Nostr
            // failure — the SAME "a Nostr failure never undoes an Arweave
            // placement" invariant 0.9.139's own Section D already proved,
            // now also held when a SECOND entry point is concurrently
            // succeeding against the same store. The exact transaction id
            // isn't predictable from outside this test without re-deriving
            // the signer's own counter, so the proof is structural instead:
            // the gateway's own network map holds exactly two placed
            // transactions (local's, despite its Nostr failure, AND
            // remote's fully-succeeded one) — a Nostr failure never rolled
            // the first one back out of the gateway.
            assert(localBytes !== remoteBytes, 'F5. sanity: local and remote placed genuinely different bytes, so two distinct transactions are actually expected');
            assert(gateway.network.size === 2, 'F6. FLAGSHIP — the gateway\'s own network holds BOTH placements (local\'s, despite its Nostr failure, and remote\'s) — a Nostr failure through one entry point never undoes an Arweave placement already made, by that entry point or the other');

            console.log('✓ Section F-i: a Nostr transport failure through the local entry point never corrupts the remote entry point\'s concurrent success, and the local entry point\'s own Arweave placement survives regardless');
        }

        // F-ii. The reverse: the remote entry point's own Arweave placement
        // fails outright; the local entry point, using a working store,
        // still succeeds.
        {
            const brokenStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner('f2-broken'), fetchImpl: async () => new Response('gateway down', { status: 500 }) });
            const workingGateway = makeFakeArweaveGateway();
            const workingStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner('f2-working'), fetchImpl: workingGateway.fetchImpl });
            const network = makeNostrNetwork();
            const publisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag: 'audit-entry-point-f2', publishImpl: network.publishImpl });

            const publicationLocal = new Publication({ id: 'pub-f2-local', documentId: 'doc-f2-local' });
            const publicationRemote = new Publication({ id: 'pub-f2-remote', documentId: 'doc-f2-remote' });
            const localBytes = JSON.stringify({ v: 'f2-local' });
            const contentResolver = fakeContentResolver({ [publicationLocal.id]: { v: 'f2-local' }, [publicationRemote.id]: { v: 'f2-remote' } });

            const workingLocalAction = makeDistributeWorldEncounterSnapshot({
                snapshotDistributionCommand: (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: workingStore, discoveryPublisher: publisher }),
                publicationCatalogContentResolver: contentResolver
            });
            let remotePublishAttempts = 0;
            const brokenPublisherRef = { discoveryTag: 'audit-entry-point-f2', publish: async () => { remotePublishAttempts += 1; return { published: true, id: 'z'.repeat(64) }; } };
            const failingRemoteAction = makeDistributeWorldEncounterSnapshot({
                snapshotDistributionCommand: (bytes) => executeSnapshotDistributionCommand({ bytes, contentStore: brokenStore, discoveryPublisher: brokenPublisherRef }),
                publicationCatalogContentResolver: contentResolver
            });

            const ownCtx = ownPanelCtx({ publication: publicationLocal, snapshotDistributionCommand: workingLocalAction });
            const canvasCtx = worldCanvasCtx({ snapshotDistributionCommand: failingRemoteAction });
            selectRemotePublication(canvasCtx, publicationRemote);

            ownCtx.distributeOwnSnapshot();
            canvasCtx.distributeSelectedSnapshot();
            await flushMicrotasks();

            assert(canvasCtx.snapshotDistributionError === 'Snapshot distribution could not be completed.', 'F7. the remote entry point genuinely reports failure when its own placement fails');
            assert(remotePublishAttempts === 0, 'F8. an Arweave placement failure means the remote entry point never even attempts an announcement');
            assert(ownCtx.snapshotDistributionError === null && ownCtx.snapshotDistributionResult !== null,
                'F9. the local entry point\'s own independent call succeeds despite the remote entry point\'s Arweave failure');
            assert(ownCtx.snapshotDistributionResult.contentReference.hash === computeContentHash(localBytes),
                'F10. the local entry point\'s own result is genuinely its own bytes');

            console.log('✓ Section F-ii: an Arweave placement failure through the remote entry point never corrupts the local entry point\'s concurrent success');
        }
    }

    // ===============================================================
    // Section G — structural boundary. Neither UI surface touches storage,
    // wallet, Nostr, crypto, or transport directly, and neither duplicates
    // the command's own put()-then-publish() sequencing.
    // ===============================================================
    {
        const ownCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');

        const forbidden = [
            'window.arweaveWallet', 'window.nostr', 'new WebSocket(', 'crypto.subtle',
            'new ArweaveContentStore(', 'new NostrSnapshotDiscoveryPublisher(',
            'new IpfsContentStore(', 'new NostrPublicationDiscoveryPublisher(',
            'executeSnapshotDistributionCommand(', 'composeSnapshotDistributionRuntime(',
            'computeContentHash(', 'createTransaction', 'signEvent(',
            'localStorage.', 'indexedDB'
        ];
        for (const term of forbidden) {
            assert(!ownCode.includes(term), `G1. OwnPublicationPanel.js never references '${term}'`);
            assert(!canvasCode.includes(term), `G2. WorldEncounterCanvas.js never references '${term}'`);
        }

        // Neither file duplicates the command's own two-step sequencing —
        // a UI component calling both a store's put() and a publisher's
        // publish() itself would be a hidden second orchestration path.
        const sequencingPatterns = [/\.put\s*\(/, /\.publish\s*\(/];
        for (const pattern of sequencingPatterns) {
            assert(!pattern.test(ownCode), `G3. OwnPublicationPanel.js never calls anything matching ${pattern} — sequencing stays entirely inside executeSnapshotDistributionCommand()`);
            assert(!pattern.test(canvasCode), `G4. WorldEncounterCanvas.js never calls anything matching ${pattern} either`);
        }

        console.log('✓ Section G: neither UI surface touches storage, wallet, Nostr, crypto, or transport directly, and neither duplicates the command\'s own placement/announcement sequencing');
    }

    // ===============================================================
    // Section H — single execution path. Repository-wide inspection
    // confirms exactly one wrapper function, one template binding site, and
    // exactly two (never three) UI components declaring a
    // snapshotDistributionCommand prop at all.
    // ===============================================================
    {
        const constructions = {
            'new ArweaveContentStore(': [],
            'new NostrSnapshotDiscoveryPublisher(': [],
            'executeSnapshotDistributionCommand(': [],
            'composeSnapshotDistributionRuntime(': [],
            'function distributeWorldEncounterSnapshot(': [],
            ':snapshotDistributionCommand=': []
        };
        const patterns = Object.keys(constructions);
        const skipDirNames = new Set(['.git', 'tests', 'docs', 'assets', 'css', 'node_modules']);

        const componentsDeclaringProp = [];
        await walkJsFiles(new URL('../', import.meta.url), '', skipDirNames, async (relativePath, codeOnly) => {
            for (const pattern of patterns) {
                if (codeOnly.includes(pattern)) {
                    constructions[pattern].push(relativePath);
                }
            }
            if (relativePath.startsWith('ui/components/') && /snapshotDistributionCommand:\s*\{/.test(codeOnly)) {
                componentsDeclaringProp.push(relativePath);
            }
        });

        // 0.9.142 — World View Snapshot Discovery Command added a SECOND,
        // independent composition root over the same ArweaveContentStore
        // class: application/DiscoverSnapshotRuntimeComposition.js, the
        // READ-side counterpart of this WRITE-side one, deliberately never
        // importing or reusing this file (see that file's own header, "no
        // coupling to... Snapshot distribution"). The invariant this
        // section protects — no OTHER file, and above all no UI component,
        // ever constructs ArweaveContentStore directly — still holds
        // exactly as before; only the closed, recognized set of
        // composition roots allowed to do so has grown by the one this
        // milestone legitimately added.
        assert(constructions['new ArweaveContentStore('].sort().join(',') === 'application/DiscoverSnapshotRuntimeComposition.js,application/SnapshotDistributionRuntimeComposition.js',
            `H1. 'new ArweaveContentStore(' appears only in the two recognized composition roots (distribution + discovery) — found in: ${constructions['new ArweaveContentStore('].join(', ') || '(none)'}`);
        assert(constructions['new NostrSnapshotDiscoveryPublisher('].sort().join(',') === 'application/SnapshotDistributionRuntimeComposition.js',
            `H2. 'new NostrSnapshotDiscoveryPublisher(' appears in exactly one production file — found in: ${constructions['new NostrSnapshotDiscoveryPublisher('].join(', ') || '(none)'}`);
        assert(constructions['executeSnapshotDistributionCommand('].sort().join(',') === 'application/SnapshotDistributionCommand.js,ui/main.js',
            `H3. 'executeSnapshotDistributionCommand(' appears only where it is defined and where it is composed into the app — found in: ${constructions['executeSnapshotDistributionCommand('].join(', ') || '(none)'}`);
        assert(constructions['composeSnapshotDistributionRuntime('].sort().join(',') === 'application/SnapshotDistributionRuntimeComposition.js,ui/main.js',
            `H4. 'composeSnapshotDistributionRuntime(' appears only where it is defined and where it is called — found in: ${constructions['composeSnapshotDistributionRuntime('].join(', ') || '(none)'}`);
        assert(constructions['function distributeWorldEncounterSnapshot('].sort().join(',') === 'ui/views/WorldView.js',
            `H5. the ONE UI-level wrapper function is declared in exactly ui/views/WorldView.js, never a second time elsewhere — found in: ${constructions['function distributeWorldEncounterSnapshot('].join(', ') || '(none)'}`);
        assert(constructions[':snapshotDistributionCommand='].sort().join(',') === 'ui/views/WorldView.js',
            `H6. the snapshotDistributionCommand prop is bound in a template in exactly one file, ui/views/WorldView.js — found in: ${constructions[':snapshotDistributionCommand='].join(', ') || '(none)'}`);

        assert(componentsDeclaringProp.sort().join(',') === 'ui/components/OwnPublicationPanel.js,ui/components/WorldEncounterCanvas.js',
            `H7. exactly two UI components declare a snapshotDistributionCommand prop — the two entry points this milestone audits, never a third — found in: ${componentsDeclaringProp.join(', ') || '(none)'}`);

        console.log('✓ Section H: exactly one command-composition path, one UI-level wrapper function, one template binding site, and exactly two UI entry points — no hidden third path anywhere in this repository');
    }

    console.log('\n✅ All Distribution Entry-Point Convergence Audit tests passed.');
}

await run();
