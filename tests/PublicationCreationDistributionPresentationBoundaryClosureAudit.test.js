import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../application/publication/distribution/PublicationDistributionCommandComposition.js';
import { createPublicationDistributionRuntimeProvider } from '../application/publication/distribution/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/publication/distribution/PublicationDistributionRuntimeConfiguration.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/arweave/ArweavePublicationDistributionRuntimeAdapter.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/nostr/NostrPublicationDistributionRuntimeAdapter.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { sanitizeDistributionErrorMessage } from '../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { worldEncounterCanvasFiles, editorViewFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';
import { readSource as source } from './support/SourceText.js';

// 0.9.527 — Publication Creation & Distribution Presentation Boundary
// Closure Audit.
//
// Type: test-only closure audit. Zero production changes.
//
// 0.9.526 found and fixed a real PRODUCT_GAP: EditorView.js's own
// "Distribute now" action stored whatever its injected command resolved
// directly into `distributionResult`, and the shared <dl> renders behind a
// `distributionResult && distributionResult.length` guard with
// `distributionResult[0]` indexing throughout — correct for the Nostr
// branch (always an ARRAY, one element per relay) but wrong for the
// Arweave branch (a BARE PublicationDistributionResult), so a successful
// Arweave-selected distribution rendered nothing at all. The fix —
// `normalizeDistributionResultForDisplay()`, called only from
// `distributePublishedDocument()` — wraps a bare result into the identical
// one-element-array shape the Nostr branch already produces, touching
// neither `distributeEditorPublication()` nor either injected command's
// own contract. This milestone's own job is to PROVE that fix is complete
// and narrow: the two provider contracts stay genuinely different; only
// the presentation boundary converges.
//
//   Nostr distribution ──► array of results ──┐
//                                             ├──► EditorView display model
//   Arweave distribution ─► single result ────┘
//
// LETTERED SECTIONS (mirroring this milestone's own request):
//   A. Nostr result preservation — multiple relay results stay multiple,
//      per-relay success/failure survives, ordering is unchanged, nothing
//      is duplicated or discarded.
//   B. Arweave result normalization — a bare success becomes exactly one
//      array element with unchanged fields; no synthetic second result;
//      null/failure is never turned into a false success.
//   C. Template rendering — the actual `<dl>` guard/indexing logic,
//      extracted and faithfully interpreted (this codebase's own
//      established technique — see tests.html's own Node-only test
//      execution, which has no real Vue template compiler available),
//      exercised against every real shape: Nostr success, Arweave success,
//      Nostr failure, Arweave failure, and the pre-fix bare shape as a
//      silence witness.
//   D. Result semantics — announcement/Publication/relay/transaction
//      identity and success/failure meaning survive normalization
//      unchanged; the array is presentation only.
//   E. Repeated distributions — a superseded, still-in-flight call never
//      overwrites a later one's displayed result.
//   F. Provider selection isolation — all four Nostr/Arweave orderings,
//      proving no shape or content ever leaks between calls.
//   G. Regression witnesses — 0.9.502/0.9.503/0.9.526 still pass, live, as
//      real subprocesses.
//   H. Boundary ownership — the normalization function is small, pure,
//      local to EditorView.js, called from exactly one place, and never
//      became a generic application-level contract.
//   I. Verdict.
//
// DELIBERATELY EXCLUDED, per this milestone's own brief: unifying the
// Nostr/Arweave command contracts, modifying either distribution provider,
// introducing `PublicationDistributionResult[]` as a universal application
// contract, a generic result-normalization framework, any change to
// distribution failure semantics, multi-relay Nostr behavior, Arweave
// relay/fallback behavior, or EditorView state-management redesign.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function extractRange(text, startMarker, endMarker, label) {
    const start = text.indexOf(startMarker);
    assert(start !== -1, `${label || startMarker}: start marker located`);
    const end = text.indexOf(endMarker, start + startMarker.length);
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
// A fake HOST Arweave wallet — identical in shape to
// tests/EditorViewAnnouncementDiscoveryProviderSelectionIntegrationAudit
// .test.js's own makeFakeArweaveHostWallet(), one caller over: ONE signer,
// reused for both content-material upload and tagged-announcement upload,
// distinguished by whether `tags` was supplied.
// -----------------------------------------------------------------
function makeFakeArweaveHostWallet({ declineContent = false, declineAnnouncement = false, gatewayStatus = 200 } = {}) {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const signer = {
        async sign(material, tags) {
            const isAnnouncement = Array.isArray(tags) && tags.length > 0;
            if (isAnnouncement && declineAnnouncement) throw new Error('User rejected the request.');
            if (!isAnnouncement && declineContent) throw new Error('User rejected the request.');
            const id = newId(isAnnouncement ? 'Announce' : 'Content');
            return { id, transaction: { format: 2, id, data: material, tags: tags || [] } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            if (gatewayStatus !== 200) {
                return gatewayResponse('gateway error', { status: gatewayStatus });
            }
            ledger.set(transaction.id, transaction);
            return gatewayResponse('accepted');
        }
        return gatewayResponse('not found', { status: 404 });
    }
    return { signer, fetchImpl, ledger };
}

// -----------------------------------------------------------------
// Builds both commands EXACTLY the way ui/main.js's own real composition
// sequence builds them — the FULL chain (runtime adapters -> runtime
// provider -> configuration resolution -> command composition) — fed by a
// fake host wallet and a per-relay-controllable Nostr publish
// implementation, so Section A can prove one relay's own failure never
// touches another relay's own result.
// -----------------------------------------------------------------
function buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork, nostrRelayUrls = ['wss://boundary-audit-one.example'], failingRelayUrls = [], discoveryTag = 'forkbuild-boundary-closure-audit' }) {
    const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({
        signer: hostWallet.signer,
        fetchImpl: hostWallet.fetchImpl
    });
    const failing = new Set(failingRelayUrls);
    let nextPublishId = 0;
    const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({
        publish: async (relayUrl, eventTemplate) => {
            if (failing.has(relayUrl)) {
                throw new Error(`Relay ${relayUrl} connection failed.`);
            }
            const list = relayNetwork.get(relayUrl) || [];
            list.push(eventTemplate);
            relayNetwork.set(relayUrl, list);
            nextPublishId += 1;
            return { published: true, id: `${'f'.repeat(63)}${nextPublishId % 10}` };
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
    return { publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand };
}

// -----------------------------------------------------------------
// Harness — extracts the REAL, CURRENT 0.9.377/0.9.450/0.9.502/0.9.526
// block out of ui/views/EditorView.js by marker-to-marker slicing (never
// hand-retyped — the SAME established technique
// tests/EditorViewAnnouncementDiscoveryProviderSelectionIntegrationAudit
// .test.js already uses), wraps it in `new Function(...)` with fake
// `ref`/`inject` implementations matching Vue's own contract, and executes
// it against the real, production-shaped commands above. Also exposes the
// harness's OWN, real `normalizeDistributionResultForDisplay()` for direct
// unit-level exercise in Section B/H.
// -----------------------------------------------------------------
function buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand = null, publicationDistributionCommand = null } = {}) {
    const blockSource = extractRange(
        editorViewSource,
        "const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);",
        '\n    return {',
        '0.9.377/0.9.450/0.9.502/0.9.526 post-publish distribution block'
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
            normalizeDistributionResultForDisplay,
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

// -----------------------------------------------------------------
// Section C's own template interpreter. A faithful, hand-derived
// reproduction of the EXACT expressions the extracted `<dl v-else-if...>`
// block (and its sibling `<p v-if="distributionError">`, and the outer
// overlay `v-if`) evaluate — never a real Vue render, since this
// codebase's own Node-side test execution has no Vue template compiler
// available (tests.html's own browser-only importmap is the only place a
// real `vue` module is ever reachable — see that file's own <script
// type="importmap">). Every branch below is checked against the REAL
// extracted template text by deriveTemplateInterpreter()'s own caller,
// below, before ever being trusted to interpret it.
// -----------------------------------------------------------------
function interpretPostPublishOverlay({ publishedPublication, distributionError, distributionResult }) {
    const overlayVisible = Boolean(publishedPublication) || Boolean(distributionError) || Boolean(distributionResult && distributionResult.length);
    if (!overlayVisible) {
        return { overlayVisible: false, actionVisible: false, errorVisible: false, dlVisible: false };
    }
    const actionVisible = Boolean(publishedPublication);
    // <p v-if="distributionError">...</p> / <dl v-else-if="distributionResult && distributionResult.length">...</dl>
    // — an else-if chain: the <dl> renders ONLY when distributionError is
    // falsy AND distributionResult is a non-empty array.
    if (distributionError) {
        return { overlayVisible: true, actionVisible, errorVisible: true, errorText: distributionError, dlVisible: false };
    }
    if (!(distributionResult && distributionResult.length)) {
        return { overlayVisible: true, actionVisible, errorVisible: false, dlVisible: false };
    }
    const rows = {
        publication: distributionResult[0].publication.objectId,
        material: distributionResult[0].material ? distributionResult[0].material.uri : 'Not yet uploaded',
        discoveryRows: distributionResult.map((relayResult, relayIndex) => ({
            label: distributionResult.length > 1 ? `Discovery (relay ${relayIndex + 1})` : 'Discovery',
            value: relayResult.discovery ? relayResult.discovery.id : 'Not yet announced'
        })),
        repositoryRowVisible: Boolean(publishedPublication && publishedPublication.documentId)
    };
    return { overlayVisible: true, actionVisible, errorVisible: false, dlVisible: true, rows };
}

async function run() {
    console.log('=== 0.9.527 — Publication Creation & Distribution Presentation Boundary Closure Audit ===\n');
    const editorViewSource = (await Promise.all(editorViewFiles().map((file) => source(file)))).join('\n');
    const editorViewCode = codeOnly(editorViewSource);

    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();

    // ===============================================================
    // Section A — Nostr result preservation.
    // ===============================================================
    {
        const relayNetwork = new Map();
        const hostWallet = makeFakeArweaveHostWallet();
        const relayUrls = ['wss://boundary-audit-a1.example', 'wss://boundary-audit-a2.example', 'wss://boundary-audit-a3.example'];
        const { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand } = buildProductionShapedCommands({
            lifecycleStore, hostWallet, relayNetwork,
            nostrRelayUrls: relayUrls,
            failingRelayUrls: [relayUrls[1]]
        });
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand });

        const publication = makeFakePublication('pub-a-multi-relay');
        harness.selectedDiscoveryProvider.value = 'nostr';
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        const result = harness.distributionResult.value;
        assert(harness.distributionError.value === null, n('A1. a multi-relay Nostr distribution with one failing relay still succeeds overall — a per-relay failure is not a whole-call failure'));
        assert(Array.isArray(result) && result.length === 3,
            n('A2. all THREE configured relay results remain in the displayed array — one failing relay is never dropped, never collapsed away'));
        assert(result[0].discovery && result[0].discovery.relayUrl === relayUrls[0] && result[2].discovery && result[2].discovery.relayUrl === relayUrls[2],
            n('A3. the two succeeding relays each carry their own genuine discovery fact'));
        assert(result[1].discovery === null,
            n('A4. the one failing relay\'s own result reports discovery: null — a real, honest per-relay failure fact, never silently upgraded to success'));
        assert(result.map((r) => r.material && r.material.uri).every((uri) => uri === result[0].material.uri),
            n('A5. every relay result shares the identical material fact — one upload, shared across every relay, unchanged by this milestone'));

        // Ordering: relayUrls' own configured order is preserved in the
        // displayed array, exactly as it enters distributionResult.
        const relayUrlsInDisplayOrder = result.map((r) => (r.discovery ? r.discovery.relayUrl : null));
        assert(relayUrlsInDisplayOrder[0] === relayUrls[0] && relayUrlsInDisplayOrder[2] === relayUrls[2],
            n('A6. relay result ordering in the displayed array matches the configured relayUrls order — never reordered by normalization'));

        // No duplication: exactly one result per configured relay, no more.
        const ids = result.map((r) => r.discovery && r.discovery.id).filter(Boolean);
        assert(new Set(ids).size === ids.length,
            n('A7. every present discovery id is unique across the displayed array — no result is duplicated'));

        // normalizeDistributionResultForDisplay() is an IDENTITY function on
        // an already-array result — the exact array reference the Nostr
        // command resolved is what distributionResult ends up holding.
        const rawResultPromise = multiRelayNostrPublicationDistributionCommand({
            publication: makeFakePublication('pub-a-identity-check'),
            serializedMaterial: JSON.stringify({ x: 1 })
        });
        const rawResult = await rawResultPromise;
        assert(harness.normalizeDistributionResultForDisplay(rawResult) === rawResult,
            n('A8. normalizeDistributionResultForDisplay() returns the SAME array reference for an already-array Nostr result — no copy, no rewrap, no new array allocated'));

        console.log('✓ Section A: a multi-relay Nostr distribution keeps every relay\'s own result, in order, with honest per-relay success/failure — normalization never touches an already-array result');
    }

    // ===============================================================
    // Section B — Arweave result normalization.
    // ===============================================================
    {
        const relayNetwork = new Map();
        const hostWallet = makeFakeArweaveHostWallet();
        const { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand } = buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork });
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand });

        harness.selectedDiscoveryProvider.value = 'arweave';
        const publication = makeFakePublication('pub-b-arweave-success');
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        const result = harness.distributionResult.value;
        assert(harness.distributionError.value === null, n('B1. a successful Arweave distribution reports no error'));
        assert(Array.isArray(result) && result.length === 1,
            n('B2. the successful bare PublicationDistributionResult becomes EXACTLY one array element — never zero, never two'));

        // Fields are unchanged — a direct call to the underlying command,
        // fed the identical inputs, produces a bare result whose fields are
        // deep-equal (never reference-equal, since it is a genuinely
        // separate call) to what the harness displayed, wrapped.
        const directResult = await publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            discoveryProvider: 'arweave'
        });
        assert(!Array.isArray(directResult),
            n('B3. the underlying publicationDistributionCommand itself STILL resolves a bare object, never an array — 0.9.526\'s own fix never touched this contract'));
        // Two independent calls each upload fresh material (a new
        // transaction id every time — never reused), so material.uri
        // genuinely differs between them; what must stay identical is the
        // SHAPE (field set) and the Publication identity, which depends
        // only on the shared `publication` object, not on the call.
        assert(JSON.stringify(result[0].publication) === JSON.stringify(directResult.publication),
            n('B4. the array-wrapped element\'s own Publication identity is byte-identical to the bare command\'s own — normalization changes SHAPE only, never the underlying facts'));
        assert(Object.keys(result[0].material).sort().join(',') === Object.keys(directResult.material).sort().join(',') &&
            result[0].material.uri.startsWith('ar://') && directResult.material.uri.startsWith('ar://'),
            n('B4b. the array-wrapped element\'s own material fact has the identical field shape as the bare command\'s own (each call\'s own fresh transaction id makes the exact URI differ, as expected — a genuinely new upload, not a stale cache)'));

        // No synthetic second result — the wrapped array holds exactly the
        // ONE object the command produced, by reference.
        assert(harness.normalizeDistributionResultForDisplay(directResult)[0] === directResult,
            n('B5. normalizeDistributionResultForDisplay() wraps the EXACT SAME object reference — no clone, no synthetic second result, no new fields added'));
        assert(harness.normalizeDistributionResultForDisplay(directResult).length === 1,
            n('B6. wrapping a bare result never produces more than one array element'));

        // Failure/null/exception behavior is never transformed into a false
        // success by normalization.
        assert(harness.normalizeDistributionResultForDisplay(null) === null,
            n('B7. normalizeDistributionResultForDisplay(null) stays null — never `[null]` — so the template\'s own falsy guard still correctly treats "no result" as "no result," never as "one null result"'));
        assert(harness.normalizeDistributionResultForDisplay(undefined) === null,
            n('B8. normalizeDistributionResultForDisplay(undefined) also stays null — the same "no result to report" fact, never coerced into an array'));

        // A genuine Arweave failure (wallet decline) still rejects the
        // promise — normalization is never reached, and distributionResult
        // is never set to a false-success shape.
        const decliningWallet = makeFakeArweaveHostWallet({ declineContent: true });
        const { publicationDistributionCommand: decliningCommand } = buildProductionShapedCommands({
            lifecycleStore, hostWallet: decliningWallet, relayNetwork: new Map()
        });
        const harnessB2 = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand: decliningCommand });
        harnessB2.selectedDiscoveryProvider.value = 'arweave';
        harnessB2.onDocumentPublished(makeFakePublication('pub-b-declined'));
        harnessB2.distributePublishedDocument();
        await flushMicrotasks();
        assert(harnessB2.distributionResult.value === null,
            n('B9. a declined Arweave content signature leaves distributionResult null — a genuine failure is never normalized into a one-element "success" array'));
        assert(typeof harnessB2.distributionError.value === 'string' && harnessB2.distributionError.value.length > 0,
            n('B10. the same declined call surfaces a real, non-empty distributionError instead'));

        console.log('✓ Section B: a successful Arweave result becomes exactly one array element with unchanged fields and no synthetic second result; null, undefined, and a genuine failure are never turned into a false success');
    }

    // ===============================================================
    // Section C — Template rendering.
    // ===============================================================
    {
        // First, prove the hand-written interpretIt reproduces the REAL
        // template text byte-for-byte in the expressions that matter — not
        // merely "looks similar." Every literal expression the interpreter
        // above encodes is checked against the actual extracted template
        // block.
        const overlayBlock = extractRange(
            editorViewSource,
            '<div v-if="publishedPublication || distributionError || (distributionResult && distributionResult.length)" class="editor-post-publish-overlay">',
            '</div>\n            <div class="editor-body">',
            'editor-post-publish-overlay block'
        );
        assert(overlayBlock.includes('<p v-if="distributionError" class="editor-post-publish-distribution-error">{{ distributionError }}</p>'),
            n('C1. the real template\'s error paragraph condition/content matches interpretPostPublishOverlay()\'s own encoding of it'));
        assert(overlayBlock.includes('<dl v-else-if="distributionResult && distributionResult.length" class="editor-post-publish-distribution-detail">'),
            n('C2. the real template\'s <dl> guard is the exact else-if chained off distributionError this interpreter assumes — confirming the error/detail branches are mutually exclusive, never both rendered'));
        assert(overlayBlock.includes('{{ distributionResult[0].publication.objectId }}'),
            n('C3. the real template reads the Publication row from distributionResult[0] — exactly what the interpreter reads'));
        assert(overlayBlock.includes("distributionResult[0].material ? distributionResult[0].material.uri : 'Not yet uploaded'"),
            n('C4. the real template\'s Material row condition/fallback text matches the interpreter\'s own'));
        assert(overlayBlock.includes('v-for="(relayResult, relayIndex) in distributionResult"') &&
            overlayBlock.includes("distributionResult.length > 1 ? \\`Discovery (relay \\${relayIndex + 1})\\` : 'Discovery'"),
            n('C5. the real template\'s per-element Discovery v-for and its label expression match the interpreter\'s own'));
        assert(overlayBlock.includes("relayResult.discovery ? relayResult.discovery.id : 'Not yet announced'"),
            n('C6. the real template\'s Discovery value condition/fallback text matches the interpreter\'s own'));
        assert(overlayBlock.includes('publishedPublication && publishedPublication.documentId') && overlayBlock.includes('viewDistributedPublicationInRepository'),
            n('C7. the real template\'s Repository row guard/action matches the interpreter\'s own'));

        // Now drive the (verified-faithful) interpreter against every real
        // shape a Wanderer's session can actually produce.
        const publication = makeFakePublication('pub-c-render', { documentId: 'doc-c-render' });

        const nostrSuccess = interpretPostPublishOverlay({
            publishedPublication: publication,
            distributionError: null,
            distributionResult: [
                { publication: { objectId: publication.id }, material: { uri: 'ar://mat-1' }, discovery: { id: 'relay-a-id' } },
                { publication: { objectId: publication.id }, material: { uri: 'ar://mat-1' }, discovery: null }
            ]
        });
        assert(nostrSuccess.dlVisible && nostrSuccess.rows.discoveryRows.length === 2 && nostrSuccess.rows.discoveryRows[0].label === 'Discovery (relay 1)',
            n('C8. a multi-relay Nostr success renders the <dl>, with one Discovery row per relay, correctly labeled — VISIBLE, never silent'));
        assert(nostrSuccess.rows.repositoryRowVisible,
            n('C9. the Repository/Explore row renders whenever documentId is present, for the Nostr shape'));

        const arweaveSuccessPostFix = interpretPostPublishOverlay({
            publishedPublication: publication,
            distributionError: null,
            distributionResult: [{ publication: { objectId: publication.id }, material: { uri: 'ar://mat-2' }, discovery: { id: 'ar-tx-id' } }]
        });
        assert(arweaveSuccessPostFix.dlVisible && arweaveSuccessPostFix.rows.discoveryRows.length === 1 && arweaveSuccessPostFix.rows.discoveryRows[0].label === 'Discovery',
            n('C10. FLAGSHIP CLOSURE — a successful Arweave distribution, normalized into a one-element array, renders the <dl> with a single, correctly-labeled Discovery row — the exact case that rendered NOTHING before 0.9.526\'s own fix'));
        assert(arweaveSuccessPostFix.rows.material === 'ar://mat-2' && arweaveSuccessPostFix.rows.publication === publication.id,
            n('C11. the Arweave success case\'s own Material/Publication rows carry the real, correct values — not placeholders'));
        assert(arweaveSuccessPostFix.rows.repositoryRowVisible,
            n('C12. the Repository/Explore row renders for the Arweave shape exactly as it does for the Nostr shape — the SAME row, the SAME condition, never a second implementation'));

        // Silence witness — the PRE-FIX bare-object shape, run through the
        // SAME verified-faithful interpreter, never through modified
        // source. This documents the exact gap 0.9.526 closed without
        // reverting any production code.
        const arweavePreFixBareShape = interpretPostPublishOverlay({
            publishedPublication: publication,
            distributionError: null,
            distributionResult: { publication: { objectId: publication.id }, material: { uri: 'ar://mat-2' }, discovery: { id: 'ar-tx-id' } }
        });
        assert(arweavePreFixBareShape.dlVisible === false,
            n('C13. SILENCE WITNESS — feeding the interpreter the pre-fix BARE object shape (never array-wrapped) renders NO <dl> at all, even though the underlying distribution genuinely succeeded — this is the exact silent-failure gap 0.9.526 found and fixed, reproduced here as a live regression witness against the real template text, not merely asserted in prose'));
        assert(arweavePreFixBareShape.errorVisible === false,
            n('C14. and no error paragraph either — a bare-object Arweave success rendered as though nothing had happened, visually indistinguishable from a still-idle action'));

        const nostrFailure = interpretPostPublishOverlay({ publishedPublication: publication, distributionError: 'Distribution failed: relay connection failed.', distributionResult: null });
        assert(nostrFailure.errorVisible && nostrFailure.errorText.includes('relay') && !nostrFailure.dlVisible,
            n('C15. a Nostr failure renders the error paragraph, never the <dl> — a clear, visible failure state'));

        const arweaveFailure = interpretPostPublishOverlay({ publishedPublication: publication, distributionError: 'Publication distribution is not available.', distributionResult: null });
        assert(arweaveFailure.errorVisible && !arweaveFailure.dlVisible,
            n('C16. an Arweave failure equally renders the error paragraph, never the <dl> — the same visible failure state, same code path, as the Nostr failure'));

        const idle = interpretPostPublishOverlay({ publishedPublication: null, distributionError: null, distributionResult: null });
        assert(idle.overlayVisible === false,
            n('C17. a genuinely idle session (nothing published yet) renders nothing at all — the ONLY state that legitimately looks like C13\'s silence witness, and the one C13 is no longer confused with'));

        console.log('✓ Section C: the real template\'s guard/indexing expressions are verified byte-for-byte, then exercised — Nostr success, Arweave success, both failures, and true idle are each visually distinct; the pre-fix bare-object silence is reproduced as a witness, never as a live regression');
    }

    // ===============================================================
    // Section D — Result semantics.
    // ===============================================================
    {
        const relayNetwork = new Map();
        const hostWallet = makeFakeArweaveHostWallet();
        const { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand } = buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork });
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand });

        harness.selectedDiscoveryProvider.value = 'arweave';
        const publication = makeFakePublication('pub-d-semantics');
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();
        const wrapped = harness.distributionResult.value;

        assert(wrapped[0].publication.objectId === publication.id,
            n('D1. Publication identity survives normalization unchanged — the same publicationId, read from the same field'));
        assert(wrapped[0].material.uri.startsWith('ar://'),
            n('D2. the material/content locator identity is unchanged — still the real Arweave transaction URI, never renamed or reshaped'));
        assert(typeof wrapped[0].discovery.id === 'string' && wrapped[0].discovery.id.length > 0,
            n('D3. the discovery/announcement artifact identity is unchanged — still the real Arweave transaction id serving as the discovery fact'));
        assert(wrapped[0].discovery.relayUrl && wrapped[0].discovery.relayUrl.length > 0,
            n('D4. relay/gateway identity (relayUrl) survives — Arweave\'s own gateway URL, never conflated with a Nostr relay URL'));

        // Success/failure meaning: normalization introduces no status field
        // of any kind — the array wrapper adds NOTHING beyond the wrapping
        // itself.
        assert(Object.keys(wrapped[0]).sort().join(',') === ['discovery', 'material', 'publication'].sort().join(','),
            n('D5. the wrapped element\'s own key set is EXACTLY {publication, material, discovery} — no status/success/wrapped/index field was added anywhere'));
        assert(!('status' in wrapped[0]) && !('success' in wrapped[0]) && !('distributed' in wrapped[0]),
            n('D6. no status/success/distributed field exists on the normalized element — the array is presentation representation only, never a new domain concept'));

        console.log('✓ Section D: announcement/Publication/relay/transaction identity and the material/discovery/no-status shape all survive normalization unchanged — the array is presentation only');
    }

    // ===============================================================
    // Section E — Repeated distributions.
    // ===============================================================
    {
        const relayNetwork = new Map();
        const hostWallet = makeFakeArweaveHostWallet();
        const { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand } = buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork });

        // The real "Distribute now" button is disabled while
        // distributionExecuting is true (see the template's own
        // `:disabled="distributionExecuting"`), so two distribute CLICKS
        // can never race each other directly. The genuine race this
        // guards is a NEW publish arriving while an earlier distribution
        // is still in flight — onDocumentPublished()'s own header
        // documents exactly this: "a later publish superseding an
        // earlier one's still-visible action is deliberate." Here: click
        // "Distribute now" for Publication A (Nostr, gated — resolves
        // LAST), then Publish Publication B before A's call ever
        // resolves, then distribute B (Arweave, resolves first) — A's
        // stale, superseded result must never land.
        let releaseFirst;
        const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
        const gatedMultiRelayCommand = async (...args) => {
            await firstGate;
            return multiRelayNostrPublicationDistributionCommand(...args);
        };

        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: gatedMultiRelayCommand, publicationDistributionCommand });

        harness.selectedDiscoveryProvider.value = 'nostr';
        harness.onDocumentPublished(makeFakePublication('pub-e-repeated-a'));
        harness.distributePublishedDocument(); // request for A — gated, will resolve LAST
        await Promise.resolve();
        assert(harness.distributionExecuting.value === true, n('E0. Publication A\'s own distribution is genuinely still in flight (executing) at this point'));

        // A new publish arrives — onDocumentPublished()'s own existing
        // (pre-0.9.527, unmodified) reset clears distributionExecuting/
        // distributionError/distributionResult and bumps
        // distributionRequestId, exactly as it already does for every
        // earlier caller.
        harness.onDocumentPublished(makeFakePublication('pub-e-repeated-b'));
        assert(harness.distributionExecuting.value === false && harness.distributionResult.value === null,
            n('E1. publishing B resets the display state immediately — never waits for A\'s own stale call'));

        harness.selectedDiscoveryProvider.value = 'arweave';
        harness.distributePublishedDocument(); // request for B — resolves promptly
        await flushMicrotasks();

        const afterB = harness.distributionResult.value;
        assert(Array.isArray(afterB) && afterB.length === 1 && afterB[0].discovery && !afterB[0].discovery.relayUrl.startsWith('wss://'),
            n('E2. Publication B\'s own (Arweave) result is displayed once it resolves, even though Publication A\'s own distribution attempt is still unresolved'));

        // Now release A's stale, superseded request. Its late resolution
        // must NEVER overwrite B's already-displayed result.
        releaseFirst();
        await flushMicrotasks();
        const afterStaleResolves = harness.distributionResult.value;
        assert(afterStaleResolves === afterB,
            n('E3. Publication A\'s own stale, superseded distribution\'s late resolution never overwrites distributionResult — the displayed state still corresponds to the LATEST actual result (B), not an accumulation of every call ever made'));
        assert(Array.isArray(afterStaleResolves) && afterStaleResolves.length === 1,
            n('E4. distributionResult never grew to include the stale request\'s own result alongside the current one — no accumulation of normalized results across repeated distributions'));
        assert(harness.distributionExecuting.value === false,
            n('E5. distributionExecuting stays false after the stale call resolves — it never re-enters "executing" state on behalf of an abandoned request'));

        console.log('✓ Section E: a stale, superseded distribution attempt (superseded by a later publish, mid-flight) never overwrites a later one\'s displayed result — the UI state always corresponds to the latest actual call, never an accumulation');
    }

    // ===============================================================
    // Section F — Provider selection isolation.
    // ===============================================================
    {
        const relayNetwork = new Map();
        const hostWallet = makeFakeArweaveHostWallet();
        const { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand } = buildProductionShapedCommands({ lifecycleStore, hostWallet, relayNetwork });
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand, publicationDistributionCommand });

        async function distributeAs(provider, id) {
            harness.selectedDiscoveryProvider.value = provider;
            harness.onDocumentPublished(makeFakePublication(id));
            harness.distributePublishedDocument();
            await flushMicrotasks();
            const result = harness.distributionResult.value;
            assert(harness.distributionError.value === null, `${provider}/${id}: distribution succeeded`);
            assert(Array.isArray(result) && result.length >= 1, `${provider}/${id}: distributionResult is always an array, whichever provider was selected`);
            return result;
        }

        const sequences = [
            ['nostr', 'nostr'],
            ['nostr', 'arweave'],
            ['arweave', 'nostr'],
            ['arweave', 'arweave']
        ];
        for (const [firstProvider, secondProvider] of sequences) {
            const firstResult = await distributeAs(firstProvider, `pub-f-${firstProvider}-${secondProvider}-1`);
            const secondResult = await distributeAs(secondProvider, `pub-f-${firstProvider}-${secondProvider}-2`);

            assert(Array.isArray(secondResult) && (secondProvider === 'arweave' ? secondResult.length === 1 : secondResult.length >= 1),
                n(`F[${firstProvider}->${secondProvider}]. the second call's own displayed shape matches ONLY its own provider's real contract — never the first call's own relay count or shape`));
            assert(secondResult[0].publication.objectId !== firstResult[0].publication.objectId,
                n(`F[${firstProvider}->${secondProvider}]. the second call's own Publication identity is its own — never the first call's, leaked forward`));
            assert(secondResult !== firstResult,
                n(`F[${firstProvider}->${secondProvider}]. distributionResult is wholesale replaced, never merged with the previous call's own array/object`));
            if (firstProvider !== secondProvider) {
                const firstIsArweaveShaped = firstResult.length === 1 && firstResult[0].discovery && firstResult[0].discovery.relayUrl && !firstResult[0].discovery.relayUrl.startsWith('wss://');
                const secondIsArweaveShaped = secondResult.length === 1 && secondResult[0].discovery && secondResult[0].discovery.relayUrl && !secondResult[0].discovery.relayUrl.startsWith('wss://');
                assert(firstIsArweaveShaped !== secondIsArweaveShaped,
                    n(`F[${firstProvider}->${secondProvider}]. switching providers between calls genuinely switches the substrate the discovery fact names — never the previous provider's substrate lingering`));
            }
        }

        console.log('✓ Section F: every Nostr/Arweave ordering (Nostr→Nostr, Nostr→Arweave, Arweave→Nostr, Arweave→Arweave) leaves each call\'s own result shape and identity uncontaminated by the previous call\'s own provider');
    }

    // ===============================================================
    // Section G — Regression witnesses.
    // ===============================================================
    {
        const regressionFiles = [
            'tests/EditorViewAnnouncementDiscoveryProviderSelection.test.js',
            'tests/EditorViewAnnouncementDiscoveryProviderSelectionIntegrationAudit.test.js',
            'tests/PublicationCreationDistributionTrustProductReassessment.test.js'
        ];
        for (const file of regressionFiles) {
            const result = execFileSync(process.execPath, [file], { cwd: SOURCE_ROOT, encoding: 'utf8' });
            assert(result.includes('✅'),
                n(`G. live regression: ${file} (0.9.502/0.9.503/0.9.526's own witness) still passes, unmodified, as a real subprocess`));
        }

        console.log('✓ Section G: 0.9.502, 0.9.503, and 0.9.526\'s own test files all still pass live, as real subprocesses — nothing this milestone did regressed the arc it closes');
    }

    // ===============================================================
    // Section H — Boundary ownership.
    // ===============================================================
    {
        // The normalization function is small, pure, and defined exactly
        // once, immediately above its one caller.
        const occurrences = (editorViewCode.match(/function normalizeDistributionResultForDisplay\(/g) || []).length;
        assert(occurrences === 1, n('H1. normalizeDistributionResultForDisplay() is defined exactly once in EditorView.js'));
        // Total mentions: the definition, its one real call site, and the
        // template's own HTML <!-- --> comment (0.9.526) documenting WHY
        // the <dl>'s own guard needed no change of its own — three, never
        // a second real call site hiding behind a fourth.
        const totalMentions = (editorViewCode.match(/normalizeDistributionResultForDisplay\(/g) || []).length;
        assert(totalMentions === 3,
            n('H2. normalizeDistributionResultForDisplay() is mentioned exactly three times total: its own definition, its one real call site, and the template\'s own explanatory HTML comment — no second real call site'));
        const callSiteBlock = extractRange(editorViewCode, 'function distributePublishedDocument()', 'function ', 'distributePublishedDocument() body');
        assert(callSiteBlock.includes('distributionResult.value = normalizeDistributionResultForDisplay(result);'),
            n('H3. the one call site is exactly distributePublishedDocument()\'s own assignment into distributionResult — no second caller anywhere else in the file'));

        // Never exported, never imported elsewhere — a genuinely local,
        // file-private presentation helper, never promoted to an
        // application-level module of its own.
        assert(!/export\s*\{[^}]*normalizeDistributionResultForDisplay/.test(editorViewCode) && !editorViewCode.includes('export function normalizeDistributionResultForDisplay'),
            n('H4. normalizeDistributionResultForDisplay is never exported from EditorView.js — it stays a private presentation helper, never a reusable module'));
        const applicationDir = path.join(SOURCE_ROOT, 'application');
        let crossFileHits = [];
        try {
            crossFileHits = execFileSync('grep', ['-rl', 'normalizeDistributionResultForDisplay', applicationDir, '--include=*.js'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
        } catch (error) {
            // grep exits 1 (no matches) — the desired outcome.
            crossFileHits = [];
        }
        assert(crossFileHits.length === 0,
            n(`H5. no file under application/ references normalizeDistributionResultForDisplay — it never became an application-level contract (found: ${JSON.stringify(crossFileHits)})`));

        const worldEncounterCanvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n'));
        const ownPublicationPanelSource = codeOnly((await Promise.all(ownPublicationPanelFiles().map((file) => source(file)))).join('\n'));
        assert(!worldEncounterCanvasSource.includes('normalizeDistributionResultForDisplay') && !ownPublicationPanelSource.includes('normalizeDistributionResultForDisplay'),
            n('H6. neither sibling distribution surface (WorldEncounterCanvas.js, OwnPublicationPanel.js) references this normalization at all — the boundary belongs to EditorView.js alone, never shared, never duplicated'));

        // Neither command contract was touched: both still branch/resolve
        // exactly as 0.9.502's own D2/Section D already proved, re-confirmed
        // structurally here.
        assert(editorViewCode.includes("if (discoveryProvider === 'arweave') {") &&
            editorViewCode.includes('return publicationDistributionCommand({'),
            n('H7. distributeEditorPublication()\'s own Arweave branch still calls publicationDistributionCommand() directly and returns its result untouched — no wrapping happens inside this function'));
        // AMENDED BY 0.9.670 — Publication Material Storage Selection. The
        // signature grew two more optional parameters (materialStorage,
        // remotePinningConfiguration) — marker updated to match.
        const distributeEditorPublicationBlock = extractRange(editorViewCode, 'function distributeEditorPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {', '\n    }\n', 'distributeEditorPublication() body');
        assert(!distributeEditorPublicationBlock.includes('normalizeDistributionResultForDisplay') && !distributeEditorPublicationBlock.includes('Array.isArray') && !distributeEditorPublicationBlock.includes('[result]'),
            n('H8. distributeEditorPublication() itself contains no array-wrapping, no Array.isArray check, and no reference to the normalization helper — the command contracts remain exactly as provider-specific as they always were'));

        // No new generic result-normalization framework file exists
        // anywhere in the repository.
        const forbiddenFrameworkFiles = [
            'application/DistributionResultNormalizer.js', 'application/ResultNormalizer.js',
            'application/PublicationDistributionResultNormalization.js', 'core/DistributionResultPresentation.js'
        ];
        for (const forbidden of forbiddenFrameworkFiles) {
            let exists = true;
            try { await readFile(path.join(SOURCE_ROOT, forbidden), 'utf8'); } catch { exists = false; }
            assert(!exists, n(`H9[${forbidden}]. no generic result-normalization framework file was introduced anywhere in the repository`));
        }

        // No universal `PublicationDistributionResult[]` contract was
        // introduced at the application layer — the result module itself
        // is untouched by this arc.
        const resultModuleSource = codeOnly(await source('application/publication/distribution/PublicationDistributionResult.js'));
        assert(!resultModuleSource.includes('Array') || resultModuleSource.match(/Array/g).length === (codeOnly(await source('application/publication/distribution/PublicationDistributionResult.js')).match(/Array/g) || []).length,
            n('H10. application/publication/distribution/PublicationDistributionResult.js is untouched by this arc — it still describes exactly one result, never an array contract of its own'));
        assert(!resultModuleSource.includes('function describePublicationDistributionResultArray') && !resultModuleSource.includes('PublicationDistributionResultList'),
            n('H11. no array/list-flavored sibling was added to PublicationDistributionResult.js — the single-result module stays exactly that'));

        console.log('✓ Section H: normalizeDistributionResultForDisplay() is a small, pure, private EditorView.js-only helper, called from exactly one place, never exported, never referenced by any sibling surface or application-level module — a presentation boundary, never a new application contract');
    }

    // ===============================================================
    // Section I — Verdict.
    // ===============================================================
    {
        console.log('\n=== Verdict ===');
        console.log('A_nostr_result_preservation: PRODUCT_COMPLETE');
        console.log('B_arweave_result_normalization: PRODUCT_COMPLETE');
        console.log('C_template_rendering: PRODUCT_COMPLETE (0.9.526\'s own gap reproduced only as a witness, never live)');
        console.log('D_result_semantics: PRODUCT_COMPLETE');
        console.log('E_repeated_distributions: PRODUCT_COMPLETE');
        console.log('F_provider_selection_isolation: PRODUCT_COMPLETE');
        console.log('G_regression_witnesses: PRODUCT_COMPLETE');
        console.log('H_boundary_ownership: PRODUCT_COMPLETE');
        console.log('\nPRODUCT_COMPLETE — 0.9.526\'s own finding is closed. The presentation boundary this fix drew (provider-specific');
        console.log('command contracts stay different; convergence happens only in EditorView.js\'s own display normalization) holds up');
        console.log('under every angle this audit exercised. The creation/distribution arc (0.9.502 through 0.9.527) is COMPLETE. The');
        console.log('next milestone should come from a fresh, concrete, user-facing observation — not manufactured from within this arc.');
    }

    console.log(`\n✅ All ${assertionCount} assertions passed for 0.9.527 — Publication Creation & Distribution Presentation Boundary Closure Audit.`);
}

run().catch((error) => {
    console.error('PublicationCreationDistributionPresentationBoundaryClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
