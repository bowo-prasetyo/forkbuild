import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { createArweaveTaggedTransactionUpload } from '../application/ArweaveTaggedTransactionUpload.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { sanitizeDistributionErrorMessage } from '../application/DistributionErrorMessageSanitizer.js';

// 0.9.503 — Editor Announcement/Discovery Provider Selection Integration
// Audit.
//
// Type: test-only production integration audit. Zero production changes.
//
// 0.9.502 gave EditorView.js's own "Distribute now" action the identical
// Nostr/Arweave substrate choice WorldView.js/WorldEncounterCanvas.js
// (0.9.430) and DecentralizedPublicationsView.js (0.9.447) already have,
// and its own test (tests/EditorViewAnnouncementDiscoveryProviderSelection
// .test.js) proved the two branches individually, each against a command
// hand-composed IN THE TEST from composePublicationDistributionCommand()/
// composeMultiRelayNostrPublicationDistributionCommand() directly, and
// separately (tests/EditorViewPostPublishDistributionAction.test.js,
// Section H) proved, STRUCTURALLY, that the real extracted source text of
// distributeEditorPublication() branches the way WorldView.js's own wrapper
// does. Neither file ever drives the REAL, extracted EditorView setup()
// block (never a hand-written reproduction) with commands built the FULL
// way ui/main.js actually builds them — through
// createArweavePublicationDistributionRuntimeAdapter()/
// createNostrPublicationDistributionRuntimeAdapter()/
// createArweaveTaggedTransactionUpload()/createPublicationDistributionRuntimeProvider()/
// resolvePublicationDistributionRuntimeConfiguration() — fed by a fake HOST
// wallet standing in for `window.arweaveWallet`/`window.nostr`, and neither
// ever exercises BOTH providers in the SAME run against the SAME shared
// lifecycle store, the way a real Wanderer distributing one Publication
// twice actually would. This file closes exactly that gap — nothing else.
//
//   ui/main.js's own real composition sequence, fed a fake HOST wallet
//        │
//        ▼
//   { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand }
//        │
//        │  inject()'d into the REAL, extracted EditorView setup() block
//        ▼
//   distributePublishedDocument()   (real, unmodified, extracted)
//        │
//        ├── selectedDiscoveryProvider = 'nostr' (default) ──► multi-relay Nostr command
//        └── selectedDiscoveryProvider = 'arweave'          ──► single-relay command
//                                                                  │
//                                                                  ▼
//                                                        real ArweaveAnnouncementPublisher,
//                                                        real ArweaveTaggedTransactionUpload,
//                                                        real POST <gateway>/tx
//
// LETTERED SECTIONS (mirroring this milestone's own request):
//   A. Production wiring — ui/main.js constructs each command exactly
//      once, provides each under the exact key EditorView.js injects, and
//      builds both from the SAME lifecycleStore instance.
//   B. Default compatibility — an unmounted-until-now Editor still reaches
//      Nostr with no Wanderer action.
//   C. Explicit Nostr — reaches the real multi-relay command alone.
//   D. Explicit Arweave — reaches the real ArweaveAnnouncementPublisher/
//      ArweaveTaggedTransactionUpload, through the FULL production
//      composition chain, fed by a fake host wallet standing in for
//      window.arweaveWallet.
//   E. Exactly-one-provider invariant, proven across every call this
//      file's single shared harness/commands ever make.
//   F. Publication identity/material fidelity — FLAGSHIP: the SAME
//      Publication distributed twice, once per provider.
//   G. Role isolation — content storage, publication identity, Snapshot
//      discovery, attribution/proof, anchoring, Repository navigation.
//   H. Failure semantics — decline, genuine failure, and malformed input,
//      both providers, identical generic vocabulary.
//   I. UI gating — the control renders/hides exactly with the action it
//      configures; its existence never implies either provider works.
//   J. Lifecycle observation — both providers write into the SAME shared
//      lifecycleStore, coexisting under recordDiscoveryObservation()'s own
//      per-provider key, never colliding.
//   K. Asymmetry is intentional — Arweave stays single-relay/single-
//      gateway; EditorView never builds a second, multi-gateway Arweave
//      path "for symmetry" with Nostr's own multi-relay fan-out.
//   L. Scope boundary — this milestone changes no production file.
//
// DELIBERATELY EXCLUDED: Arweave multi-gateway publishing, automatic
// fallback, Nostr+Arweave fan-out, provider ranking, a persistent provider
// preference, World View/Snapshot Discovery changes, new distribution
// abstractions, provider health checks, UI redesign.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function extractRange(text, startMarker, endMarker, label) {
    const start = text.indexOf(startMarker);
    assert(start !== -1, `${label || startMarker}: start marker located`);
    const end = text.indexOf(endMarker, start);
    assert(end !== -1, `${label || startMarker}: end marker located after start`);
    return text.slice(start, end);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

function makeFakePublication(id, overrides = {}) {
    const record = { id, documentId: `doc-${id}`, signature: `sig-${id}`, ...overrides };
    return { ...record, toJSON: () => record };
}

// -----------------------------------------------------------------
// A fake HOST Arweave wallet — the shape a real `window.arweaveWallet`
// would expose, standing in for ui/main.js's own `arweaveHostSigner`.
// ONE signer, reused for BOTH content material upload (signer.sign(material))
// and tagged announcement upload (signer.sign(material, tags)) — exactly
// the SAME single host capability ui/main.js's own 0.9.492 comment
// documents sharing across both roles. Distinguishing the two calls by
// whether `tags` was supplied lets this file count each role's own
// invocations independently, without any cooperation from the collaborator
// classes themselves.
// -----------------------------------------------------------------
function makeFakeArweaveHostWallet({ onContentSign, onAnnouncementSign, declineContent = false, declineAnnouncement = false, gatewayStatus = 200, announcementFetchThrows = false } = {}) {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    let contentSignCalls = 0;
    let announcementSignCalls = 0;
    const signer = {
        async sign(material, tags) {
            const isAnnouncement = Array.isArray(tags) && tags.length > 0;
            if (isAnnouncement) {
                announcementSignCalls += 1;
                if (onAnnouncementSign) onAnnouncementSign(material, tags);
                if (declineAnnouncement) throw new Error('User rejected the request.');
            } else {
                contentSignCalls += 1;
                if (onContentSign) onContentSign(material);
                if (declineContent) throw new Error('User rejected the request.');
            }
            const id = newId(isAnnouncement ? 'Announce' : 'Content');
            return { id, transaction: { format: 2, id, data: material, tags: tags || [] } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            // A genuine network exception (offline, DNS failure, aborted
            // connection) — distinct from a mere non-2xx gateway response,
            // which ArweaveTaggedTransactionUpload.js's own contract
            // degrades to `null` (a "declined," not a "failed," outcome).
            // Only announcement transactions (tagged, non-empty `tags`)
            // are affected — content material upload is untouched, so
            // material fidelity assertions elsewhere stay valid.
            if (announcementFetchThrows && Array.isArray(transaction.tags) && transaction.tags.length > 0) {
                throw new TypeError('fetch failed');
            }
            if (gatewayStatus !== 200) {
                return gatewayResponse('gateway error', { status: gatewayStatus });
            }
            ledger.set(transaction.id, transaction);
            return gatewayResponse('accepted');
        }
        return gatewayResponse('not found', { status: 404 });
    }
    return {
        signer, fetchImpl, ledger,
        get contentSignCalls() { return contentSignCalls; },
        get announcementSignCalls() { return announcementSignCalls; }
    };
}

// -----------------------------------------------------------------
// Builds the pair of commands EXACTLY the way ui/main.js's own real
// composition sequence builds `publicationDistributionCommand`/
// `multiRelayNostrPublicationDistributionCommand` — the FULL chain
// (runtime adapters -> runtime provider -> configuration resolution ->
// command composition), fed by a fake host wallet standing in for
// `window.arweaveWallet`/`window.nostr`, never a shortcut straight to
// composePublicationDistributionCommand() with hand-built options.
// -----------------------------------------------------------------
function buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork, nostrRelayUrls = ['wss://editor-integration-audit.example'], discoveryTag = 'forkbuild-editor-integration-audit', declineRelay = false, relayStatus = 'ok' }) {
    const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({
        signer: hostWallet.signer,
        fetchImpl: hostWallet.fetchImpl
    });
    let nostrPublishCalls = 0;
    const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({
        publish: async (relayUrl, eventTemplate) => {
            nostrPublishCalls += 1;
            if (declineRelay) throw new Error('No compatible Nostr (NIP-07) extension is installed.');
            if (relayStatus !== 'ok') throw new Error('Relay connection failed.');
            const list = relayNetwork.get(relayUrl) || [];
            list.push(eventTemplate);
            relayNetwork.set(relayUrl, list);
            return { published: true, id: `${'e'.repeat(63)}${list.length % 10}` };
        }
    });
    const arweaveAnnouncementUploadTaggedTransaction = createArweaveTaggedTransactionUpload({
        signer: hostWallet.signer,
        fetchImpl: hostWallet.fetchImpl
    });
    const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
        ...arweavePublicationRuntimeCapabilities,
        ...nostrPublicationRuntimeCapabilities,
        uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction,
        discoveryTag
    });
    const { arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions } =
        resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());

    const publicationDistributionCommand = composePublicationDistributionCommand({
        lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions
    });
    const multiRelayNostrPublicationDistributionCommand = composeMultiRelayNostrPublicationDistributionCommand({
        lifecycleStore, arweaveUploaderOptions, nostrRelayUrls, nostrPublisherOptions
    });
    return {
        publicationDistributionCommand,
        multiRelayNostrPublicationDistributionCommand,
        get nostrPublishCalls() { return nostrPublishCalls; }
    };
}

// -----------------------------------------------------------------
// Harness — extracts the REAL, CURRENT 0.9.377/0.9.450/0.9.502 block out
// of ui/views/EditorView.js by marker-to-marker slicing (never hand-
// retyped — the SAME established technique
// tests/EditorViewPostPublishDistributionAction.test.js already uses),
// wraps it in `new Function(...)` with fake `ref`/`inject` implementations
// matching Vue's own contract, and executes it against the real,
// production-shaped commands above.
// -----------------------------------------------------------------
function buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand = null, publicationDistributionCommand = null } = {}) {
    const blockSource = extractRange(
        editorViewSource,
        "const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);",
        '// ------------------------- 0.2.21 document lifecycle ------------',
        '0.9.377/0.9.450/0.9.502 post-publish distribution block'
    );

    function ref(initial) { return { value: initial }; }
    function inject(key, fallback) {
        if (key === 'multiRelayNostrPublicationDistributionCommand') {
            return multiRelayNostrPublicationDistributionCommand === null ? fallback : multiRelayNostrPublicationDistributionCommand;
        }
        if (key === 'publicationDistributionCommand') {
            return publicationDistributionCommand === null ? fallback : publicationDistributionCommand;
        }
        return fallback;
    }

    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'inject', 'ref', 'sanitizeDistributionErrorMessage',
        `${blockSource}\nreturn {
            multiRelayNostrPublicationDistributionCommand,
            publicationDistributionCommand,
            canDistributePublication,
            selectedDiscoveryProvider,
            distributeEditorPublication,
            publishedPublication,
            distributionExecuting,
            distributionError,
            distributionResult,
            onDocumentPublished,
            dismissPublishAction,
            distributePublishedDocument
        };`
    );
    return factory(inject, ref, sanitizeDistributionErrorMessage);
}

async function run() {
    console.log('=== 0.9.503 — Editor Announcement/Discovery Provider Selection Integration Audit ===\n');
    const editorViewSource = await source('ui/views/EditorView.js');
    const editorViewCode = codeOnly(editorViewSource);

    // ===============================================================
    // Section A — Production wiring.
    // ===============================================================
    {
        const mainSource = codeOnly(await source('ui/main.js'));

        assert((mainSource.match(/composePublicationDistributionCommand\(\{/g) || []).length === 1,
            n('A1. ui/main.js calls composePublicationDistributionCommand() exactly once — one single-relay command instance, never a second, EditorView-specific one'));
        assert((mainSource.match(/composeMultiRelayNostrPublicationDistributionCommand\(\{/g) || []).length === 1,
            n('A2. ui/main.js calls composeMultiRelayNostrPublicationDistributionCommand() exactly once — one multi-relay command instance'));
        assert(/app\.provide\('publicationDistributionCommand', publicationDistributionCommand\);/.test(mainSource),
            n('A3. the single-relay command is provided under the exact key \'publicationDistributionCommand\' — the exact string EditorView.js injects'));
        assert(/app\.provide\('multiRelayNostrPublicationDistributionCommand', multiRelayNostrPublicationDistributionCommand\);/.test(mainSource),
            n('A4. the multi-relay command is provided under the exact key \'multiRelayNostrPublicationDistributionCommand\' — the exact string EditorView.js injects'));
        assert(editorViewCode.includes("inject('publicationDistributionCommand', null)") && editorViewCode.includes("inject('multiRelayNostrPublicationDistributionCommand', null)"),
            n('A5. EditorView.js injects both keys under the identical names ui/main.js provides — no renaming, no adapter layer of its own'));

        // Both production commands are built from the SAME lifecycleStore
        // instance — the exact invariant Section J below exercises live.
        const bothCompositionCalls = extractRange(mainSource, 'const publicationDistributionCommand = composePublicationDistributionCommand({', 'app.provide(\'multiRelayNostrPublicationDistributionCommand\'', 'both compose calls');
        const lifecycleStoreMentions = (bothCompositionCalls.match(/lifecycleStore: publicationDistributionLifecycleStore,/g) || []).length;
        assert(lifecycleStoreMentions === 2,
            n('A6. both composePublicationDistributionCommand() and composeMultiRelayNostrPublicationDistributionCommand() are fed the SAME publicationDistributionLifecycleStore instance variable — one shared observation channel, never two'));
        assert((mainSource.match(/new PublicationDistributionLifecycleMemoryStore\(\)/g) || []).length === 1,
            n('A7. exactly one PublicationDistributionLifecycleMemoryStore is constructed anywhere in production'));

        // EditorView.js constructs no provider-specific infrastructure of
        // its own — never a signer, uploader, publisher, or runtime
        // adapter/provider of any kind. It ONLY injects the two already-
        // composed, already-production commands.
        const infrastructureConstructors = [
            'new ArweaveAnnouncementPublisher(', 'new NostrPublicationDiscoveryPublisher(',
            'createArweaveTaggedTransactionUpload(', 'createArweavePublicationDistributionRuntimeAdapter(',
            'createNostrPublicationDistributionRuntimeAdapter(', 'createPublicationDistributionRuntimeProvider(',
            'composePublicationDistributionCommand(', 'composeMultiRelayNostrPublicationDistributionCommand('
        ];
        for (const term of infrastructureConstructors) {
            assert(!editorViewCode.includes(term),
                n(`A8[${term}]. EditorView.js never constructs/composes ${term} — it receives finished, production command instances via inject(), exactly like WorldView.js's own identical restraint`));
        }

        console.log('✓ Section A: ui/main.js composes each command exactly once, provides each under the exact key EditorView.js injects, both share one lifecycle store, and EditorView.js constructs no provider-specific infrastructure of its own');
    }

    // ===============================================================
    // Sections B/C/D/E/F/H — driven together through ONE real, extracted
    // EditorView harness and ONE pair of full-production-shaped commands,
    // sharing ONE lifecycle store — exactly the live topology a single
    // Editor session actually has.
    // ===============================================================
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const relayNetwork = new Map();
    const hostWallet = makeFakeArweaveHostWallet();
    const { publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand } =
        buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork });
    const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand });

    // ---------------------------------------------------------------
    // Section B — Default compatibility.
    // ---------------------------------------------------------------
    {
        assert(harness.selectedDiscoveryProvider.value === 'nostr',
            n('B1. the harness\'s own selectedDiscoveryProvider starts at \'nostr\' — an Editor session that never touches the control behaves exactly as every pre-0.9.502 session already did'));

        const publication = makeFakePublication('pub-b-default');
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(harness.distributionError.value === null, n('B2. the default (untouched) selection succeeds with no error'));
        assert(Array.isArray(harness.distributionResult.value) && harness.distributionResult.value.length === 1,
            n('B3. the default selection resolves an ARRAY of one PublicationDistributionResult — the multi-relay Nostr shape, unchanged from every pre-0.9.502 caller'));
        assert(hostWallet.announcementSignCalls === 0,
            n('B4. the Arweave announcement signer was never invoked for the untouched default selection'));

        console.log('✓ Section B: an Editor session that never touches the substrate control reaches Nostr, unchanged from pre-0.9.502 behavior');
    }

    // ---------------------------------------------------------------
    // Section C — Explicit Nostr.
    // ---------------------------------------------------------------
    {
        const announcementCallsBefore = hostWallet.announcementSignCalls;
        harness.selectedDiscoveryProvider.value = 'nostr';
        const publication = makeFakePublication('pub-c-explicit-nostr');
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(harness.distributionError.value === null, n('C1. an explicit Nostr selection succeeds'));
        assert(Array.isArray(harness.distributionResult.value), n('C2. an explicit Nostr selection resolves the multi-relay array shape'));
        assert(hostWallet.announcementSignCalls === announcementCallsBefore,
            n('C3. the Arweave announcement signer received zero additional calls for an explicit Nostr selection'));

        console.log('✓ Section C: an explicit Nostr selection reaches the real multi-relay command alone');
    }

    // ---------------------------------------------------------------
    // Section D — Explicit Arweave, through the FULL production chain.
    //
    // AMENDED BY 0.9.526 — see EditorView.js's own
    // normalizeDistributionResultForDisplay() (0.9.526) header for the
    // full finding. `distributeEditorPublication()` itself is UNCHANGED
    // and still resolves a bare PublicationDistributionResult for
    // 'arweave' — re-confirmed live, with zero side effects added here,
    // by tests/EditorViewAnnouncementDiscoveryProviderSelection.test.js's
    // own D/F sections and tests/NostrMultiRelayPublicationDistributionWiring
    // .test.js's own B7/C6 — 0.9.526 touched nothing about what either
    // provider's own command resolves. What changed is ONLY what
    // `distributePublishedDocument()` stores into `distributionResult`
    // for display: a one-element array wrapping that same bare result,
    // matching the shape the Nostr branch already produced — D2, below,
    // is that fix's own live proof, through this file's own full
    // production chain.
    // ---------------------------------------------------------------
    let sectionDResult;
    {
        const nostrCallsBefore = relayNetwork.get('wss://editor-integration-audit.example')?.length || 0;
        harness.selectedDiscoveryProvider.value = 'arweave';
        const publication = makeFakePublication('pub-d-explicit-arweave');
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(harness.distributionError.value === null, n('D1. an explicit Arweave selection succeeds through the full production chain'));
        sectionDResult = harness.distributionResult.value;
        assert(Array.isArray(sectionDResult) && sectionDResult.length === 1,
            n('D2. FIX — the view\'s OWN distributionResult (what the shared <dl> actually renders from) now normalizes the Arweave command\'s own bare PublicationDistributionResult into a one-element array — the exact shape the template\'s "distributionResult.length" guard and "[0]" indexing already require, closing the "Arweave selection renders nothing" gap 0.9.526 found'));
        assert(sectionDResult[0].material.uri.startsWith('ar://') && hostWallet.ledger.has(sectionDResult[0].material.uri.slice('ar://'.length)),
            n('D3. real content material genuinely reached the fake gateway, signed by the fake host wallet, through ArweavePublicationMaterialUploader — never a shortcut'));
        assert(hostWallet.ledger.has(sectionDResult[0].discovery.id),
            n('D4. real announcement material genuinely reached the fake gateway through the real ArweaveTaggedTransactionUpload (0.9.490/0.9.492), never a hand-rolled stand-in'));
        assert(sectionDResult[0].discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL,
            n('D5. the discovery fact carries Arweave\'s own default gateway, confirming the real ArweaveAnnouncementPublisher — never NostrPublicationDiscoveryPublisher — was reached'));
        const nostrCallsAfter = relayNetwork.get('wss://editor-integration-audit.example')?.length || 0;
        assert(nostrCallsAfter === nostrCallsBefore, n('D6. the Nostr relay received zero additional publishes for an explicit Arweave selection'));

        console.log('✓ Section D: an explicit Arweave selection reaches the real ArweaveAnnouncementPublisher and real ArweaveTaggedTransactionUpload, through the identical production composition chain ui/main.js itself builds, fed by a fake host wallet — full round trip, zero shortcuts — AND (0.9.526) the view\'s own displayed distributionResult now genuinely reflects that success instead of silently rendering nothing');
    }

    // ---------------------------------------------------------------
    // Section E — exactly-one-provider invariant, across every call this
    // shared harness has made so far (B, C, D above).
    // ---------------------------------------------------------------
    {
        // Three distribution calls happened above: default (nostr),
        // explicit nostr, explicit arweave. Exactly one announcement
        // signer invocation (Section D's own Arweave call) and exactly
        // three Nostr relay publishes (B + C; D contributed none) —
        // proven by direct counters, never inferred from success alone.
        assert(hostWallet.announcementSignCalls === 1,
            n('E1. across three distribution calls (nostr-default, nostr-explicit, arweave-explicit) sharing this ONE pair of commands, the Arweave announcement signer was invoked exactly once — no double-invocation, no fan-out'));
        const relayList = relayNetwork.get('wss://editor-integration-audit.example') || [];
        assert(relayList.length === 2,
            n('E2. the configured Nostr relay received exactly two publishes (the default and explicit-Nostr calls) — the Arweave call never touched it'));

        console.log('✓ Section E: exactly one provider\'s discovery layer is ever invoked per selection — no combined attempt, no fan-out, confirmed by direct call counts across a shared command pair');
    }

    // ---------------------------------------------------------------
    // Section F — Publication identity/material fidelity. FLAGSHIP: the
    // SAME Publication distributed twice, once per provider.
    // ---------------------------------------------------------------
    {
        const lifecycleStoreF = new PublicationDistributionLifecycleMemoryStore();
        const relayNetworkF = new Map();
        const hostWalletF = makeFakeArweaveHostWallet();
        const commandsF = buildProductionShapedCommands({ lifecycleStore: lifecycleStoreF, hostWallet: hostWalletF, relayNetwork: relayNetworkF, nostrRelayUrls: ['wss://editor-flagship.example'] });
        const harnessF = buildHarness(editorViewSource, commandsF);

        const publication = makeFakePublication('pub-flagship-same-publication');
        const frozenJSON = JSON.stringify(publication.toJSON());

        // First distribution: Nostr (the default).
        harnessF.onDocumentPublished(publication);
        harnessF.distributePublishedDocument();
        await flushMicrotasks();
        const nostrResult = harnessF.distributionResult.value;
        assert(nostrResult && Array.isArray(nostrResult) && nostrResult.length === 1, n('F1. FLAGSHIP — the Nostr distribution of Publication P succeeds'));
        assert(nostrResult[0].publication.objectId === publication.id, n('F2. FLAGSHIP — the Nostr result carries the SAME publication identity'));
        assert(nostrResult[0].material.storage === 'ar', n('F3. FLAGSHIP — even under a Nostr DISCOVERY selection, material CONTENT is still stored on Arweave — provider selection is a discovery-role choice, never a content-storage choice'));

        // Second distribution: the SAME publication object, now Arweave.
        harnessF.selectedDiscoveryProvider.value = 'arweave';
        harnessF.onDocumentPublished(publication);
        harnessF.distributePublishedDocument();
        await flushMicrotasks();
        // AMENDED BY 0.9.526 — arweaveResult is now the SAME one-element-
        // array shape nostrResult already is (see EditorView.js's own
        // normalizeDistributionResultForDisplay(), 0.9.526); every fact
        // below is read from its [0], exactly like nostrResult's own.
        const arweaveResult = harnessF.distributionResult.value;
        assert(arweaveResult && Array.isArray(arweaveResult) && arweaveResult.length === 1, n('F4. FLAGSHIP — the Arweave distribution of the SAME Publication P succeeds, and (0.9.526) is displayed in the identical one-element-array shape the Nostr distribution already was — no longer silently unrendered'));
        assert(arweaveResult[0].publication.objectId === publication.id, n('F5. FLAGSHIP — the Arweave result carries the IDENTICAL publication identity as the Nostr result — the same Publication, never a reconstructed equivalent'));
        assert(arweaveResult[0].material.storage === 'ar', n('F6. FLAGSHIP — material storage is identically Arweave-backed for the Arweave selection too — the dimension that ACTUALLY changed is discovery, never material'));

        // The publication's own serialized material is byte-identical
        // across both calls — the substrate choice never touched the
        // content being distributed.
        assert(hostWalletF.ledger.get(nostrResult[0].material.uri.slice('ar://'.length)).data === frozenJSON,
            n('F7. FLAGSHIP — the exact bytes uploaded during the Nostr-selected call equal publication.toJSON(), untransformed'));
        assert(hostWalletF.ledger.get(arweaveResult[0].material.uri.slice('ar://'.length)).data === frozenJSON,
            n('F8. FLAGSHIP — the exact bytes uploaded during the Arweave-selected call are IDENTICAL to the Nostr call\'s own bytes — the same publication, same material, twice'));

        // Discovery artifacts genuinely differ — different substrate,
        // different identifiers — never collapsed into one shared id.
        assert(nostrResult[0].discovery.id !== arweaveResult[0].discovery.id,
            n('F9. FLAGSHIP — the two distributions produce DISTINCT discovery artifacts — Nostr\'s own relay-observed event id and Arweave\'s own transaction id never collide'));
        assert(arweaveResult[0].discovery.relayUrl === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL && nostrResult[0].discovery.relayUrl === 'wss://editor-flagship.example',
            n('F10. FLAGSHIP — each discovery artifact correctly names its own distinct substrate (a Nostr relay URL vs. an Arweave gateway URL)'));

        // The lifecycle store's own per-provider observation channel:
        // BOTH providers' discovery facts coexist for the SAME publication
        // identity, never colliding, per PublicationDistributionLifecycleStore
        // .js's own recordDiscoveryObservation() contract.
        if (typeof lifecycleStoreF.getDiscoveryObservations === 'function') {
            const observations = lifecycleStoreF.getDiscoveryObservations(publication.id);
            const byProvider = Object.fromEntries(observations.map((o) => [o.discoveryProvider, o]));
            assert(observations.length === 2 && byProvider.nostr && byProvider.arweave,
                n('F11. FLAGSHIP — the shared lifecycle store observes BOTH the Nostr and Arweave discovery facts for the SAME publication identity, coexisting under their own provider key rather than one overwriting the other'));
            assert(byProvider.nostr.id === nostrResult[0].discovery.id && byProvider.arweave.id === arweaveResult[0].discovery.id,
                n('F12. FLAGSHIP — each observation carries exactly the discovery id its own provider actually produced'));
        }

        // Publication object identity itself is never mutated by either
        // call — the SAME reference, still holding its original fields.
        assert(publication.id === 'pub-flagship-same-publication' && publication.documentId === 'doc-pub-flagship-same-publication',
            n('F13. FLAGSHIP — the Publication object itself is untouched by either distribution call — no field was added, removed, or rewritten by a substrate-specific transformation'));

        console.log('✓ Section F: FLAGSHIP — the SAME Publication, distributed via Nostr and then via Arweave, preserves identical identity and byte-identical material across both calls, while producing two genuinely distinct discovery artifacts that coexist (never collide) in the shared lifecycle store — proof the selector changes WHERE/HOW the announcement is distributed, never WHAT is being distributed');
    }

    // ===============================================================
    // Section G — Role isolation.
    // ===============================================================
    {
        // Snapshot-family isolation (structurally separate role — see
        // application/SnapshotDistributionCommand.js's own header).
        // AMENDED — scoped to distributeEditorPublication()'s own body,
        // not the whole file: a later, independently-scoped milestone
        // gave EditorView.js its own, separate "Distribute Snapshot"
        // action (distributeEditorSnapshot(), mirroring WorldView.js's
        // own distributeWorldEncounterSnapshot()), so the file as a whole
        // now legitimately references the Snapshot family — the real,
        // still-true invariant is that THIS milestone's own Publication
        // distribution selector never does.
        const publicationDistributionFnBody = extractRange(editorViewCode, 'function distributeEditorPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {', '\n        }\n', 'distributeEditorPublication() body');
        assert(!/SnapshotDiscoveryPublisher|SnapshotDistributionCommand|SnapshotDistributionRuntimeComposition|SnapshotCandidateDiscovery/.test(publicationDistributionFnBody),
            n('G1. distributeEditorPublication() references none of the Snapshot-family discovery/distribution classes'));

        // Publication identity / Repository navigation: the existing
        // "Explore" action reads ONLY publishedPublication.value.documentId
        // — never the substrate selection — so it cannot regress into a
        // provider-specific navigation target.
        const navBody = extractRange(editorViewCode, 'function viewDistributedPublicationInRepository() {', '\n        }', 'viewDistributedPublicationInRepository() body');
        assert(!/selectedDiscoveryProvider|discoveryProvider/.test(navBody),
            n('G2. viewDistributedPublicationInRepository() reads no substrate/provider state of any kind — Repository navigation is unaffected by which Announcement/Discovery substrate was used'));
        assert(/router\.push\(\{ path: `\/world\/\$\{publication\.documentId\}` \}\)/.test(navBody),
            n('G3. Repository navigation still targets the exact same route shape, unmodified'));

        // Attribution/proof/lineage/anchoring: EditorView.js's own,
        // pre-existing blueprint attribution/lineage machinery is a
        // completely separate publication family (BLUEPRINT_ATTRIBUTION_KIND/
        // BLUEPRINT_LINEAGE_CLAIM_KIND) from the Publication distribution
        // this milestone's own selector configures — confirmed unmodified
        // by checking the SAME functions this milestone never touches
        // still call the SAME collaborators, unconditioned on
        // selectedDiscoveryProvider.
        for (const fn of ['publishInspectedAttributionToNetwork', 'claimAuthorship', 'claimLineage']) {
            const body = extractRange(editorViewCode, `function ${fn}(`, '\n\t\t}', `${fn}() body`);
            assert(!/selectedDiscoveryProvider/.test(body),
                n(`G4[${fn}]. ${fn}() reads no selectedDiscoveryProvider state — attribution/lineage publishing remains entirely independent of the Announcement/Discovery substrate choice`));
        }

        // Content storage / anchoring / Repository state: no production
        // file outside EditorView.js shows any change (this milestone's
        // own scope boundary, reconfirmed here at the role-isolation
        // level rather than only at the end, in Section L).
        const untouchedFamilies = execSync(
            'git status --porcelain -- content/ArweaveContentStore.js core/Publication.js application/PublicationAnchorVerificationLifecycleView.js application/BlueprintAttributionUseCase.js application/BlueprintLineageUseCase.js ui/views/RepositoryView.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT }
        ).toString().trim();
        assert(untouchedFamilies === '',
            n('G5. none of content storage, publication identity, anchoring lifecycle views, attribution/lineage use cases, or Repository View show any change'));

        console.log('✓ Section G: content storage, publication identity, Snapshot discovery, attribution/proof, anchoring, and Repository navigation all remain entirely independent of the Announcement/Discovery substrate selection');
    }

    // ===============================================================
    // Section H — Failure semantics: decline, genuine failure, malformed
    // input — both providers, identical generic vocabulary.
    // ===============================================================
    {
        // H1 — Nostr's own multi-relay fan-out ALREADY treats any single
        // relay's own failure — a declined signature or a genuine network
        // failure alike — as a per-relay OUTCOME, never a rejection:
        // NostrMultiRelayPublicationDiscoveryPublisher.js's own
        // Promise.allSettled() (see that file's own header) swallows both
        // identically into `{ relayUrl, published: false }`. EditorView
        // neither invents nor suppresses this — it is Nostr's own,
        // pre-existing resilience semantic, confirmed reached unmodified:
        // no error banner, and the returned result correctly reports that
        // relay's own discovery as ABSENT (never PRESENT-with-a-fake-id).
        for (const cause of ['decline', 'networkFailure']) {
            const lifecycleStoreH = new PublicationDistributionLifecycleMemoryStore();
            const relayNetworkH = new Map();
            const hostWalletH = makeFakeArweaveHostWallet();
            const commandsH = buildProductionShapedCommands({
                lifecycleStore: lifecycleStoreH, hostWallet: hostWalletH, relayNetwork: relayNetworkH,
                declineRelay: cause === 'decline',
                relayStatus: cause === 'networkFailure' ? 'down' : 'ok'
            });
            const harnessH = buildHarness(editorViewSource, commandsH);
            harnessH.selectedDiscoveryProvider.value = 'nostr';
            harnessH.onDocumentPublished(makeFakePublication(`pub-h1-nostr-${cause}`));
            harnessH.distributePublishedDocument();
            await flushMicrotasks();

            assert(harnessH.distributionError.value === null,
                n(`H1[nostr/${cause}]. a per-relay ${cause} surfaces NO error banner — Nostr's own established per-relay resilience is preserved unmodified, never reinterpreted by EditorView as a failure`));
            assert(Array.isArray(harnessH.distributionResult.value) && harnessH.distributionResult.value[0].discovery === null,
                n(`H1b[nostr/${cause}]. the resolved result correctly reports that relay's own discovery as ABSENT — a real, honest degraded fact, never a fabricated success`));
        }

        // H2 — Arweave's single-gateway path has NO such per-call
        // resilience layer: a genuine signer/announcement failure —
        // decline or a network exception alike — propagates as a real
        // rejection (ArweaveAnnouncementPublisher.js's own documented
        // contract: "a genuine uploadTaggedTransaction failure ...
        // propagates as a rejection"). EditorView surfaces it through the
        // SAME existing generic distributionError vocabulary WorldView.js's
        // own action already uses — never a bespoke Arweave-specific
        // message, and never silently swallowed the way Nostr's own
        // fan-out swallows an equivalent failure.
        for (const cause of ['decline', 'networkFailure']) {
            const lifecycleStoreH = new PublicationDistributionLifecycleMemoryStore();
            const relayNetworkH = new Map();
            const hostWalletH = makeFakeArweaveHostWallet({
                declineAnnouncement: cause === 'decline',
                announcementFetchThrows: cause === 'networkFailure'
            });
            const commandsH = buildProductionShapedCommands({ lifecycleStore: lifecycleStoreH, hostWallet: hostWalletH, relayNetwork: relayNetworkH });
            const harnessH = buildHarness(editorViewSource, commandsH);
            harnessH.selectedDiscoveryProvider.value = 'arweave';
            harnessH.onDocumentPublished(makeFakePublication(`pub-h2-arweave-${cause}`));
            harnessH.distributePublishedDocument();
            await flushMicrotasks();

            assert(typeof harnessH.distributionError.value === 'string' && harnessH.distributionError.value.length > 0,
                n(`H2[arweave/${cause}]. a genuine Arweave ${cause} surfaces a non-empty error through the SAME existing generic vocabulary — no bespoke Arweave-specific message`));
            assert(harnessH.distributionExecuting.value === false,
                n(`H2b[arweave/${cause}]. execution state returns to idle after the failure`));
        }

        // H3 — malformed input: a Publication whose own toJSON() throws
        // (e.g. corrupted in-memory state) is caught BEFORE either
        // provider's own command is ever called — distributeEditorPublication()
        // computes `JSON.stringify(publication.toJSON())` identically on
        // both branches, so this case is, correctly, entirely
        // provider-agnostic: the SAME synchronous throw, wrapped by the
        // SAME Promise.resolve().then()/.catch() chain, regardless of
        // selectedDiscoveryProvider.
        for (const provider of ['nostr', 'arweave']) {
            const lifecycleStoreH = new PublicationDistributionLifecycleMemoryStore();
            const relayNetworkH = new Map();
            const hostWalletH = makeFakeArweaveHostWallet();
            const commandsH = buildProductionShapedCommands({ lifecycleStore: lifecycleStoreH, hostWallet: hostWalletH, relayNetwork: relayNetworkH });
            const harnessH = buildHarness(editorViewSource, commandsH);
            harnessH.selectedDiscoveryProvider.value = provider;
            const malformed = { id: `pub-h3-malformed-${provider}`, toJSON: () => { throw new Error('corrupted publication state'); } };
            harnessH.onDocumentPublished(malformed);
            harnessH.distributePublishedDocument();
            await flushMicrotasks();

            assert(typeof harnessH.distributionError.value === 'string' && harnessH.distributionError.value.length > 0,
                n(`H3[${provider}]. malformed input (a Publication that cannot serialize) surfaces through the SAME generic error path for both providers — never an unhandled exception`));
        }

        // No Arweave-specific (or Nostr-specific) error vocabulary exists
        // anywhere in EditorView.js's own distribution block — every
        // failure, from either provider, is described by the SAME
        // existing sanitizeDistributionErrorMessage()/generic-fallback
        // machinery WorldView.js's own action already uses.
        const forbidden = ['ARWEAVE_DISTRIBUTION_FAILED', 'ArweaveDistributionFailed', 'ARWEAVE_DECLINED', 'NOSTR_DISTRIBUTION_FAILED', 'NostrDistributionFailed'];
        for (const term of forbidden) {
            assert(!editorViewCode.includes(term), n(`H5[${term}]. EditorView.js introduces no provider-specific failure vocabulary named "${term}"`));
        }

        console.log('✓ Section H: provider decline, genuine provider failure, and malformed input all surface through the SAME existing, generic failure vocabulary for both providers — the Editor invents no Arweave-specific (or Nostr-specific) interpretation');
    }

    // ===============================================================
    // Section I — UI gating.
    // ===============================================================
    {
        // The substrate <select> AND the "Distribute now" button are both
        // gated on the identical canDistributePublication guard — neither
        // renders unconditionally, and dismissal stays ungated (a
        // published-but-undistributable action can still be dismissed).
        const actionBlock = extractRange(editorViewSource, '<div v-if="publishedPublication" class="editor-post-publish-action">', '</div>\n                <p v-if="distributionError"', 'post-publish action block');
        const selectGate = extractRange(actionBlock, 'v-if="canDistributePublication"\n                        class="editor-post-publish-provider-label"', '</select>', 'select gate');
        assert(selectGate.includes('v-model="selectedDiscoveryProvider"'), n('I1. the substrate <select> is gated on canDistributePublication'));
        const buttonGate = extractRange(actionBlock, 'v-if="canDistributePublication"\n                        type="button"\n                        class="action-btn action-btn--primary editor-post-publish-distribute-btn"', '</button>', 'button gate');
        assert(buttonGate.includes('@click="distributePublishedDocument"'), n('I2. the "Distribute now" button carries the identical canDistributePublication gate'));
        const dismissBlock = extractRange(actionBlock, '<button\n                        type="button"\n                        class="action-btn action-btn--secondary editor-post-publish-dismiss-btn"', '</button>', 'dismiss button');
        assert(!/v-if=/.test(dismissBlock), n('I3. the Dismiss button carries no canDistributePublication (or any other) gate — dismissal is always available once the action is showing'));

        // The selector's mere existence never implies either provider is
        // actually usable: with only ONE command wired, selecting the
        // OTHER, unavailable provider degrades gracefully rather than
        // silently no-opping or throwing unhandled.
        const nostrOnlyHarness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve([{ publication: { objectId: 'x' }, material: null, discovery: null }]) });
        assert(nostrOnlyHarness.canDistributePublication === true, n('I4. with only the Nostr command wired, canDistributePublication is still true (rendering the selector) even though Arweave is not actually usable'));
        nostrOnlyHarness.selectedDiscoveryProvider.value = 'arweave';
        nostrOnlyHarness.onDocumentPublished(makeFakePublication('pub-i-unavailable-arweave'));
        nostrOnlyHarness.distributePublishedDocument();
        await flushMicrotasks();
        assert(nostrOnlyHarness.distributionError.value === 'Publication distribution is not available.',
            n('I5. selecting Arweave while only the Nostr command is wired fails gracefully with the existing "not available" message — the selector\'s presence never implied Arweave itself was reachable'));

        console.log('✓ Section I: the substrate control and its action share one gate, Dismiss stays independent of it, and the selector\'s own existence never implies either provider is actually available');
    }

    // ===============================================================
    // Section J — Lifecycle observation.
    // ===============================================================
    {
        // EditorView.js never constructs its own lifecycle store — the
        // observation channel is entirely delegated to whichever command
        // is injected (see Section A6/A7 for the production-level proof
        // that both commands already share one).
        assert(!editorViewCode.includes('new PublicationDistributionLifecycleMemoryStore'),
            n('J1. EditorView.js constructs no lifecycle store of its own — both provider paths observe through whatever store the injected commands already carry'));
        assert(!editorViewCode.includes("inject('publicationDistributionLifecycleStore'"),
            n('J2. EditorView.js does not even read the lifecycle store directly — it never needed to: the commands themselves already write through it, and EditorView\'s own distributionResult is populated straight from each command\'s return value'));

        // Live proof (mirrors Section F's own lifecycleStoreF check): a
        // separate lifecycle-only pass to isolate this assertion from the
        // flagship's other bookkeeping.
        const lifecycleStoreJ = new PublicationDistributionLifecycleMemoryStore();
        const relayNetworkJ = new Map();
        const hostWalletJ = makeFakeArweaveHostWallet();
        const commandsJ = buildProductionShapedCommands({ lifecycleStore: lifecycleStoreJ, hostWallet: hostWalletJ, relayNetwork: relayNetworkJ });
        const harnessJ = buildHarness(editorViewSource, commandsJ);
        const publicationJ = makeFakePublication('pub-j-lifecycle');

        harnessJ.onDocumentPublished(publicationJ);
        harnessJ.distributePublishedDocument();
        await flushMicrotasks();
        assert(lifecycleStoreJ.get(publicationJ.id).discovery.state === PublicationDistributionState.PRESENT,
            n('J3. after a Nostr-selected distribution, the shared store\'s primary slot observes discovery PRESENT'));

        harnessJ.selectedDiscoveryProvider.value = 'arweave';
        harnessJ.onDocumentPublished(publicationJ);
        harnessJ.distributePublishedDocument();
        await flushMicrotasks();
        assert(lifecycleStoreJ.get(publicationJ.id).discovery.state === PublicationDistributionState.PRESENT,
            n('J4. after the SUBSEQUENT Arweave-selected distribution of the SAME publication, the shared store\'s primary slot still observes discovery PRESENT — the second provider\'s own call correctly transitions the SAME lifecycle record, never a disconnected one'));

        console.log('✓ Section J: EditorView.js constructs and reads no lifecycle store of its own; both provider paths correctly observe and transition the ONE shared lifecycle record a publication actually has');
    }

    // ===============================================================
    // Section K — the asymmetry (multi-relay Nostr vs. single-relay/
    // single-gateway Arweave) is intentional, not a defect.
    // ===============================================================
    {
        const worldViewCode = codeOnly(await source('ui/views/WorldView.js'));

        // The entire distribute*Publication(publication, discoveryProvider)
        // function body is byte-for-byte the SAME shape WorldView.js's own
        // already-shipped distributeWorldEncounterPublication() holds
        // (modulo the function's own name) — this is an existing,
        // codebase-wide convention EditorView.js reused, never a shortcut
        // invented for this milestone alone.
        // AMENDED BY 0.9.670 — Publication Material Storage Selection. Both
        // functions' own signatures grew two more parameters
        // (materialStorage, remotePinningConfiguration) — the markers below
        // are updated to match; the byte-for-byte parity this section
        // exists to protect is otherwise unchanged.
        const editorFnBody = extractRange(editorViewCode, 'function distributeEditorPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {', '\n        }\n', 'EditorView distribute function');
        const worldFnBody = extractRange(worldViewCode, 'function distributeWorldEncounterPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {', '\n        }\n', 'WorldView distribute function');
        const normalize = (body) => body
            .replace('distributeEditorPublication', 'DISTRIBUTE_FN')
            .replace('distributeWorldEncounterPublication', 'DISTRIBUTE_FN')
            .replace(/\s+/g, ' ')
            .trim();
        assert(normalize(editorFnBody) === normalize(worldFnBody),
            n('K1. EditorView.js\'s own distributeEditorPublication() body is IDENTICAL (modulo its own name) to WorldView.js\'s own distributeWorldEncounterPublication() — same guard, same branch, same request shape — the asymmetry (multi-relay Nostr, single-relay Arweave) is a codebase-wide convention shared by every caller, never an Editor-specific shortcut'));
        assert(editorFnBody.includes('return publicationDistributionCommand({') && worldFnBody.includes('return publicationDistributionCommand({'),
            n('K2. both EditorView.js and WorldView.js reach the IDENTICAL single-relay publicationDistributionCommand on an explicit Arweave selection'));

        // EditorView.js builds no multi-gateway/multi-endpoint Arweave
        // fan-out of its own — no array of gateways, no Promise.all over
        // several uploaders, no per-gateway loop of any kind.
        const forbiddenMultiGateway = ['gatewayUrls', 'arweaveGateways', 'Promise.all', 'for (const gateway', '.map((gateway'];
        for (const term of forbiddenMultiGateway) {
            assert(!editorViewCode.includes(term),
                n(`K3[${term}]. EditorView.js contains no "${term}" — no automatic Arweave multi-gateway/multi-endpoint publishing was introduced "for symmetry" with Nostr's own multi-relay fan-out`));
        }

        console.log('✓ Section K: the single-relay Arweave / multi-relay Nostr asymmetry is the SAME convention every existing caller (WorldView.js) already holds — EditorView.js reused it verbatim rather than inventing Arweave multi-gateway publishing for symmetry');
    }

    // ===============================================================
    // Section L — scope boundary. ORIGINALLY (0.9.502): this milestone
    // changed no production file, only added its own test — a live
    // `git status --porcelain` check that, like G2's own identical
    // caveat above, could only ever describe THIS milestone's own diff
    // at the moment it was authored. AMENDED — a later, independently-
    // scoped milestone legitimately gives EditorView.js its own,
    // separate "Distribute Snapshot" action (distributeEditorSnapshot(),
    // mirroring WorldView.js's own distributeWorldEncounterSnapshot());
    // G1, above, already carries this section's real, durable invariant
    // precisely — 0.9.502's OWN distributeEditorPublication() still
    // touches no Snapshot-family class, regardless of what else
    // EditorView.js now also contains. The two test files below are that
    // later milestone's own required updates — the Snapshot-family
    // isolation check in each had to move from "the whole file never
    // mentions it" to "distributeEditorPublication() never mentions it",
    // since the whole-file version is no longer true, by design.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/EditorViewAnnouncementDiscoveryProviderSelectionIntegrationAudit.test.js',
            // Snapshot Distribution for EditorView.js (later milestone) —
            // see this section's own AMENDED comment, above.
            'ui/views/EditorView.js',
            'tests/EditorViewAnnouncementDiscoveryProviderSelection.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0,
            n(`L1. every changed/added file is either this milestone's own test file or a later, independently-scoped milestone's own authorized change (found unauthorized: ${JSON.stringify(unauthorized)})`));

        console.log('✓ Section L: every changed file is accounted for — this milestone itself remains test-only; EditorView.js\'s own production change belongs to a later, separate Snapshot Distribution milestone');
    }

    console.log(`\n✅ All EditorViewAnnouncementDiscoveryProviderSelectionIntegrationAudit tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('EditorViewAnnouncementDiscoveryProviderSelectionIntegrationAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
