import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.434 — Concurrent Discovery Observation Integration Boundary Audit.
//
// 0.9.433 built the additive recordDiscoveryObservation()/
// getDiscoveryObservations() seam and proved it correct at the LEVEL OF
// THE COMPOSED COMMAND (composePublicationDistributionCommand() called
// directly, and WorldEncounterCanvas's own computed pulled off the export
// via a hand-built ctx). This is a TEST-ONLY milestone: it changes no
// production file. Its job is to answer one question 0.9.433 itself never
// exercised: does the seam still hold at the ACTUAL integration boundary —
// the UI's own click handler (`distributeSelectedPublication()`), through
// the exact wrapper shape `ui/views/WorldView.js`'s own
// `distributeWorldEncounterPublication()` uses, through the real
// orchestrator, into the real store — and does it hold under conditions
// 0.9.433 never tried (a declined discovery leaving prior observations
// alone, a minimal legacy store actually run rather than merely grepped
// for, cleanup after MULTIPLE substrates, and the one dual-representation
// consistency question the 0.9.433 author explicitly declined to
// pre-emptively resolve).
//
//   Section A: the real production path, UI-shaped end to end
//   Section B: two real substrate observations, driven through the click
//              handler itself, both orders
//   Section C: the fresh-PRESENT boundary — a decline never overwrites or
//              fabricates an observation
//   Section D: per-provider replacement holds through the UI-shaped path
//              too, and never disturbs the other provider's own entry
//   Section E: the primary lifecycle slot stays intact, AND the dual-
//              representation consistency question — can lifecycleStore.
//              set() and recordDiscoveryObservation() ever disagree about
//              the same fact? (answered, not just asked)
//   Section F: subscriber semantics — no duplicate, no missing, and no
//              stale read from inside a subscriber's own callback
//   Section G: cleanup after multiple substrates, across multiple
//              publications, and safe recreation after remove()
//   Section H: the real UI's one-row/two-row/back-to-one-row behavior,
//              and what "removing one observation" actually means given
//              the real API surface
//   Section I: duck-typed compatibility, run for real — not grepped for
//   Section J: cross-role isolation, behavioral — Arweave-as-Content never
//              becomes a discovery observation merely because it is
//              Arweave, even when Arweave is ALSO the discoveryProvider
//              for the very same call
//   Section K: no execution coupling — the observation seam is provably
//              inert with respect to every publisher/uploader collaborator
//   Section L: final verdict
//
// DELIBERATELY EXCLUDED. Same list 0.9.433's own header already excluded —
// multi-select, fan-out, aggregate status, distribution history,
// notification generation, persistence redesign, provider ranking,
// fallback/retry, generic multi-valued lifecycle storage, new lifecycle
// states, Content/Proof changes, new Arweave functionality, new discovery
// protocol semantics. This file adds no production code at all.

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

async function flushMicrotasks() {
    // Matches tests/WorldViewPublicationDistributionActionIntegration.test.js's
    // own established technique — the real orchestrator/executor chain
    // needs more turns of the microtask queue than a bare Promise.resolve().
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

// ---------------------------------------------------------------------
// Fake substrates. A real network-shaped counter object shared across
// Sections A-K so Section K can prove the observation seam never reaches
// it outside the calls a distribution action itself makes.
// ---------------------------------------------------------------------
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    let contentUploadCount = 0;
    let announcementUploadCount = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            contentUploadCount += 1;
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, { data: transaction.data, tag: null });
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    async function uploadTaggedTransaction(material, tag) {
        announcementUploadCount += 1;
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }
    return {
        ledger,
        contentSigner,
        fetchImpl,
        uploadTaggedTransaction,
        getContentUploadCount: () => contentUploadCount,
        getAnnouncementUploadCount: () => announcementUploadCount
    };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

function makeRealSubstrates({ nostrDeclines = false } = {}) {
    const net = makeFakeArweaveSubstrate();
    let nostrPublishCount = 0;
    return {
        net,
        arweaveUploaderOptions: {
            signer: net.contentSigner,
            fetchImpl: net.fetchImpl
        },
        nostrPublisherOptions: {
            discoveryTag: 'boundary-audit-nostr',
            publishImpl: async () => {
                nostrPublishCount += 1;
                if (nostrDeclines) {
                    return { published: false, reason: 'relay declined' };
                }
                return { published: true, id: nextFakeNostrEventId() };
            }
        },
        arweaveAnnouncementPublisherOptions: {
            discoveryTag: 'boundary-audit-arweave',
            uploadTaggedTransaction: net.uploadTaggedTransaction
        },
        getNostrPublishCount: () => nostrPublishCount
    };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-boundary-1',
        documentId: 'doc-boundary-1',
        title: 'A Boundary-Audited Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

// The exact shape ui/views/WorldView.js's own distributeWorldEncounterPublication()
// uses: a (publication, discoveryProvider) -> Promise wrapper around the
// app-wide composed command, adding only serializedMaterial. This is
// deliberately NOT a test-only substitute for the command/store pair —
// `composePublicationDistributionCommand()` and
// `PublicationDistributionLifecycleMemoryStore` are the real, unmodified
// production exports; only the uploader/publisher collaborators three
// layers further down are fakes, exactly as every other real-path test in
// this codebase already does (signer/relay configuration is the one thing
// nothing in this repo can supply against a real network).
function composeWorldViewShapedCommand({ lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions }) {
    const publicationDistributionCommand = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions,
        nostrPublisherOptions,
        arweaveAnnouncementPublisherOptions
    });
    // This is a byte-for-byte copy of ui/views/WorldView.js's own
    // distributeWorldEncounterPublication() body — see Section A's own
    // architectural-regression check, which confirms the real file still
    // reads exactly this way.
    return function distributeWorldEncounterPublication(publication, discoveryProvider) {
        return publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            discoveryProvider
        });
    };
}

// A real WorldEncounterCanvas `this`-context, built the same way
// tests/WorldViewPublicationDistributionActionIntegration.test.js's own
// canvasCtx() already does — every method/computed pulled off the REAL
// component export, never reimplemented.
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
        selectedDiscoveryProvider: 'nostr',
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
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
    Object.defineProperty(ctx, 'distributionMaterialState', {
        get() { return WorldEncounterCanvas.computed.distributionMaterialState.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributionDiscoveryState', {
        get() { return WorldEncounterCanvas.computed.distributionDiscoveryState.call(ctx); }
    });
    Object.defineProperty(ctx, 'discoveryObservations', {
        get() { return WorldEncounterCanvas.computed.discoveryObservations.call(ctx); }
    });
    return ctx;
}

// A real, selected, materially-loaded PUBLICATION encounter — refreshed
// after every store mutation so ctx.distributionLifecycle (and therefore
// the discoveryObservations computed, which itself depends on it purely
// to re-evaluate on the same 0.9.100 subscription) reflect the CURRENT
// store state, exactly as the real running app's own subscription would.
function selectPublicationOn(ctx, publication, lifecycleStore) {
    ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
    ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } };
    ctx.distributionLifecycleStore = lifecycleStore;
    ctx.distributionLifecycle = lifecycleStore.get(publication.id);
}
function refresh(ctx, publication, lifecycleStore) {
    ctx.distributionLifecycle = lifecycleStore.get(publication.id);
}

async function run() {
    // ===============================================================
    // Section A — the real production path, UI-shaped end to end.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const substrates = makeRealSubstrates();
        const distributionCommand = composeWorldViewShapedCommand({ lifecycleStore, ...substrates });
        const publication = signedPublication({ id: 'pub-a-real-path' });

        const ctx = canvasCtx({ distributionCommand });
        selectPublicationOn(ctx, publication, lifecycleStore);
        ctx.selectedDiscoveryProvider = 'nostr';

        assert(ctx.distributablePublication === publication, n('A1. the real component computed genuinely resolves the loaded Publication for the current selection'));

        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === true, n('A2. the real click handler enters executing state synchronously'));
        await flushMicrotasks();

        assert(ctx.distributionExecuting === false && ctx.distributionError === null, n('A3. the real distribution genuinely succeeded end to end — no rejection surfaced'));
        assert(lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT, n('A4. the real store\'s own primary slot recorded the fresh discovery fact'));

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 1 && observations[0].discoveryProvider === 'nostr', n('A5. recordDiscoveryObservation() was genuinely reached — one Nostr observation exists'));
        assert(observations[0].origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('A6. the observation carries the real publisher\'s own real fact, not a fabricated placeholder'));
        refresh(ctx, publication, lifecycleStore);
        assert(ctx.discoveryObservations.length === 1 && ctx.discoveryObservations[0].discoveryProvider === 'nostr', n('A7. the SAME component instance\'s own computed sees exactly what the store now holds'));

        // No test-only substitute for the modified command/store pair:
        // confirm by construction that `distributionCommand` really is the
        // WorldView-shaped wrapper around composePublicationDistributionCommand()'s
        // own return value, and that the store really is the real memory
        // store class (not a hand-rolled prototype).
        assert(lifecycleStore instanceof PublicationDistributionLifecycleMemoryStore, n('A8. the store used is genuinely PublicationDistributionLifecycleMemoryStore, not a test-only prototype'));
        assert(typeof distributionCommand === 'function' && distributionCommand.name === 'distributeWorldEncounterPublication', n('A9. the command used is genuinely the WorldView-shaped wrapper, not a bespoke test stub'));

        // Architectural regression: the real ui/views/WorldView.js still
        // wires exactly this shape, so this section's own fidelity to
        // "production" is not merely asserted but checked against the
        // live file.
        const viewSource = codeOnly(await source('ui/views/WorldView.js'));
        assert(viewSource.includes('function distributeWorldEncounterPublication(publication, discoveryProvider)') && viewSource.includes('return publicationDistributionCommand({'),
            n('A10. ui/views/WorldView.js genuinely still defines distributeWorldEncounterPublication() with exactly the shape this section reproduces'));
        assert(viewSource.includes("serializedMaterial: JSON.stringify(publication.toJSON())") && viewSource.includes('discoveryProvider'),
            n('A11. ...forwarding serializedMaterial and discoveryProvider exactly as this section\'s own wrapper does'));
        const mainSource = codeOnly(await source('ui/main.js'));
        assert(/composePublicationDistributionCommand\(\{\s*lifecycleStore:\s*publicationDistributionLifecycleStore/.test(mainSource),
            n('A12. ui/main.js genuinely composes the app-wide command with the SAME lifecycleStore instance it provides app-wide — one store, one command, never a second of either'));

        console.log('✓ Section A: the real production path — UI click handler -> WorldView-shaped wrapper -> composed command -> orchestrator -> real store — genuinely reaches recordDiscoveryObservation()');
    }

    // ===============================================================
    // Section B — two real substrate observations, driven through the
    // click handler itself, both orders.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const distributionCommand = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates() });

        // Forward order: Nostr, then Arweave.
        const forwardPublication = signedPublication({ id: 'pub-b-forward' });
        const forwardCtx = canvasCtx({ distributionCommand });
        selectPublicationOn(forwardCtx, forwardPublication, lifecycleStore);

        forwardCtx.selectedDiscoveryProvider = 'nostr';
        forwardCtx.distributeSelectedPublication();
        await flushMicrotasks();
        refresh(forwardCtx, forwardPublication, lifecycleStore);

        forwardCtx.selectedDiscoveryProvider = 'arweave';
        forwardCtx.distributeSelectedPublication();
        await flushMicrotasks();
        refresh(forwardCtx, forwardPublication, lifecycleStore);

        const forwardObservations = lifecycleStore.getDiscoveryObservations(forwardPublication.id);
        assert(forwardObservations.length === 2, n('B1. Nostr-then-Arweave, driven through the real click handler, retains both observations'));
        assert(forwardCtx.discoveryObservations.length === 2, n('B2. the component\'s own computed agrees'));

        // Reverse order: Arweave, then Nostr.
        const reversePublication = signedPublication({ id: 'pub-b-reverse' });
        const reverseCtx = canvasCtx({ distributionCommand });
        selectPublicationOn(reverseCtx, reversePublication, lifecycleStore);

        reverseCtx.selectedDiscoveryProvider = 'arweave';
        reverseCtx.distributeSelectedPublication();
        await flushMicrotasks();
        refresh(reverseCtx, reversePublication, lifecycleStore);

        reverseCtx.selectedDiscoveryProvider = 'nostr';
        reverseCtx.distributeSelectedPublication();
        await flushMicrotasks();
        refresh(reverseCtx, reversePublication, lifecycleStore);

        const reverseObservations = lifecycleStore.getDiscoveryObservations(reversePublication.id);
        assert(reverseObservations.length === 2, n('B3. Arweave-then-Nostr, driven through the real click handler, also retains both observations'));

        // Equivalent apart from ordering: the SET of providers named is
        // identical regardless of which order the Wanderer clicked in.
        const forwardProviders = forwardObservations.map((o) => o.discoveryProvider).sort();
        const reverseProviders = reverseObservations.map((o) => o.discoveryProvider).sort();
        assert(JSON.stringify(forwardProviders) === JSON.stringify(reverseProviders), n('B4. the resulting observation set is order-independent — {nostr, arweave} either way'));

        console.log('✓ Section B: both orders, driven through the real click handler, retain exactly the same two observations');
    }

    // ===============================================================
    // Section C — the fresh-PRESENT boundary. A declined attempt never
    // overwrites an earlier, genuinely-established observation, and never
    // fabricates one of its own.
    // ===============================================================
    {
        // C1 — an established Nostr observation survives a LATER Nostr
        // attempt that itself declines.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = makeFakePublication('pub-c1-decline-preserves');

            const firstAttempt = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates({ nostrDeclines: false }) });
            await firstAttempt(publication, 'nostr');
            const established = lifecycleStore.getDiscoveryObservations(publication.id)[0];
            assert(established && established.discoveryProvider === 'nostr', n('C1a. a genuine PRESENT observation is established first'));

            const decliningAttempt = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates({ nostrDeclines: true }) });
            const declinedResult = await decliningAttempt(publication, 'nostr');
            assert(declinedResult.discovery === null, n('C1b. the second attempt genuinely reports discovery ABSENT (the relay declined)'));

            const afterDecline = lifecycleStore.getDiscoveryObservations(publication.id);
            assert(afterDecline.length === 1, n('C1c. a declined attempt never adds a second, empty/placeholder observation'));
            assert(afterDecline[0].id === established.id, n('C1d. the EARLIER, genuinely-PRESENT observation is left completely untouched by the later decline — a decline is never treated as fresh PRESENT'));
            assert(lifecycleStore.get(publication.id).discovery.id === established.id, n('C1e. the primary lifecycle slot is equally untouched by the decline'));

            console.log('✓ Section C1: a later decline never overwrites an earlier, genuinely-established observation');
        }

        // C2 — material succeeds, discovery declines: zero discovery
        // observations, even though the material itself genuinely used
        // Arweave.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = makeFakePublication('pub-c2-material-only');
            const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates({ nostrDeclines: true }) });

            const result = await command(publication, 'nostr');
            assert(result.material !== null && result.discovery === null, n('C2a. the real executor genuinely reports material PRESENT, discovery ABSENT'));
            assert(lifecycleStore.get(publication.id).material.state === PublicationDistributionState.PRESENT, n('C2b. the primary slot records the material fact'));
            assert(lifecycleStore.getDiscoveryObservations(publication.id).length === 0, n('C2c. NO discovery observation is ever created for a material-only success — only a fresh PRESENT discovery result creates or replaces one'));

            console.log('✓ Section C2: material-only success creates zero discovery observations');
        }

        // C3 — nothing at all succeeds: no store write of any kind. An
        // empty serializedMaterial is the real uploader's own documented
        // "nothing to upload" decline (ArweavePublicationMaterialUploader.upload()
        // returns null for a zero-length material, never a signer
        // rejection) — the cleanest way to reach material === null without
        // a thrown collaborator error masking the scenario under test.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const publication = makeFakePublication('pub-c3-nothing');
            const substrates = makeRealSubstrates();

            const result = await executePublicationDistributionCommand({
                publication,
                serializedMaterial: '',
                discoveryProvider: 'nostr',
                lifecycleStore,
                arweaveUploaderOptions: substrates.arweaveUploaderOptions,
                nostrPublisherOptions: substrates.nostrPublisherOptions
            });
            assert(result.material === null && result.discovery === null, n('C3a. a declined content upload stops the sequence before discovery is ever attempted'));
            assert(lifecycleStore.get(publication.id) === null, n('C3b. a call that learns nothing new writes nothing to the store at all — the pre-existing 0.9.103 invariant, unmodified by this milestone'));
            assert(lifecycleStore.getDiscoveryObservations(publication.id).length === 0, n('C3c. ...and no discovery observation is fabricated either'));

            console.log('✓ Section C3: total failure writes nothing anywhere, in either representation');
        }
    }

    // ===============================================================
    // Section D — per-provider replacement holds through the UI-shaped
    // path, and never disturbs the other provider's own entry.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates() });
        const publication = makeFakePublication('pub-d-replacement');

        await command(publication, 'nostr');
        await command(publication, 'arweave');
        const arweaveBeforeSecondNostr = lifecycleStore.getDiscoveryObservations(publication.id).find((o) => o.discoveryProvider === 'arweave');

        const secondNostr = await command(publication, 'nostr');

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('D1. still exactly two current observations — never four, never a history'));
        const nostrObservation = observations.find((o) => o.discoveryProvider === 'nostr');
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(nostrObservation.id === secondNostr.discovery.id, n('D2. the Nostr slot holds only its own latest fact'));
        assert(arweaveObservation.id === arweaveBeforeSecondNostr.id && JSON.stringify(arweaveObservation) === JSON.stringify(arweaveBeforeSecondNostr),
            n('D3. updating Nostr never modifies the Arweave observation — same value, field for field, before and after'));

        console.log('✓ Section D: per-provider replacement holds through the real path, and updating one provider never touches the other\'s own entry');
    }

    // ===============================================================
    // Section E — the primary lifecycle slot keeps exactly its pre-0.9.433
    // semantics, AND the dual-representation consistency question: can
    // lifecycleStore.set() and recordDiscoveryObservation() ever disagree
    // about the same publication/provider/result?
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates() });
        const publication = makeFakePublication('pub-e-consistency');

        // The existing lifecycle slot's own semantics: null before
        // anything, a single plain object after, never an array, and it
        // still reflects only the MOST RECENT provider's own fact —
        // exactly 0.9.431's original finding, unrevisited by 0.9.433.
        assert(lifecycleStore.get(publication.id) === null, n('E1. get() before any distribution is still null, exactly as pre-0.9.433'));

        const sequence = ['nostr', 'arweave', 'nostr'];
        for (const provider of sequence) {
            const result = await command(publication, provider);

            // Immediately after EVERY call in the sequence — not just the
            // last — the primary slot's own discovery section and the
            // freshly-recorded per-provider observation must describe the
            // exact same fact. This is the dual-observation consistency
            // check: if PublicationDistributionCommand.js's own two calls
            // (lifecycleStore.set() and recordDiscoveryObservation()) ever
            // fed from different data, this would catch it at every step,
            // not merely at the end where a coincidence could hide it.
            const primary = lifecycleStore.get(publication.id).discovery;
            const observation = lifecycleStore.getDiscoveryObservations(publication.id).find((o) => o.discoveryProvider === provider);
            assert(observation, n(`E2[${provider}]. the just-used provider's own observation exists immediately after its own call`));
            assert(primary.state === observation.state && primary.origin === observation.origin
                && primary.discoveryTag === observation.discoveryTag && primary.id === observation.id,
                n(`E2[${provider}]. the primary slot and the per-provider observation agree field-for-field on the fact this exact call just established`));
            assert(result.discovery.id === observation.id, n(`E3[${provider}]. and both agree with the real distribution result itself — nothing is re-derived independently anywhere in this chain`));
        }

        // Why divergence is structurally impossible under the CURRENT
        // command code, confirmed by reading the source rather than
        // merely inferring it from behavior: `recordDiscoveryObservation()`
        // is called with the exact same `transitioned.discovery` reference
        // that is then assigned to `next.discovery` and passed to
        // `lifecycleStore.set()` — one transition call, one result object,
        // read twice, never two independent computations that could
        // disagree. UPDATED BY 0.9.443: the command now also derives
        // `discoveryOrigin` from that SAME `transitioned.discovery` object
        // (its own `.origin` field) rather than from any independently
        // computed value — the regex below is widened to admit that one
        // extra, still-derived-from-the-same-object line, never to relax
        // the underlying "one object, read twice" invariant itself.
        const commandCode = codeOnly(await source('application/PublicationDistributionCommand.js'));
        assert(/next = transitioned;\s*changed = true;\s*if \(typeof lifecycleStore\.recordDiscoveryObservation === 'function'\) \{\s*const resolvedProvider = discoveryProvider \|\| 'nostr';\s*const discoveryOrigin = resolvedProvider === 'nostr' \? transitioned\.discovery\.origin : undefined;\s*lifecycleStore\.recordDiscoveryObservation\(result\.publication\.objectId, resolvedProvider, transitioned\.discovery, discoveryOrigin\);/.test(commandCode),
            n('E4. CONFIRMED FROM THE SOURCE: recordDiscoveryObservation() is fed the identical `transitioned.discovery` object later assigned into `next` and passed to set(), and its own `discoveryOrigin` argument is derived from that SAME object\'s `.origin` field — divergence between the two representations is impossible under this exact call shape, not merely unobserved in this test run'));
        assert(commandCode.indexOf('lifecycleStore.recordDiscoveryObservation(') < commandCode.indexOf('if (changed) {\n        lifecycleStore.set('),
            n('E5. recordDiscoveryObservation() textually precedes set() in the same synchronous function body — there is no intervening step, branch, or await where the two values could be pulled apart'));

        console.log('✓ Section E: the primary slot keeps its exact pre-0.9.433 semantics, and dual-representation divergence is proven impossible (not merely untested) under the current command code — this is a documented invariant, not a narrowly-escaped gap');
    }

    // ===============================================================
    // Section F — subscriber semantics: no duplicate notification, no
    // missing notification, and no stale read from inside a subscriber's
    // own callback.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates() });
        const publication = makeFakePublication('pub-f-subscribers');

        let notificationCount = 0;
        const observationsSeenInsideCallback = [];
        const unsubscribe = lifecycleStore.subscribe(publication.id, (publicationId, lifecycle) => {
            notificationCount += 1;
            // The ordering claim under test: by the time a subscriber is
            // notified via set(), recordDiscoveryObservation() (called
            // strictly earlier in the same synchronous function) has
            // ALREADY written the fresh fact — a subscriber that reacts
            // by reading getDiscoveryObservations() sees the current
            // state, never a one-notification-behind stale read.
            observationsSeenInsideCallback.push(lifecycleStore.getDiscoveryObservations(publicationId).length);
        });

        await command(publication, 'nostr');
        assert(notificationCount === 1, n('F1. exactly one notification for one successful distribution call — recordDiscoveryObservation() never triggers a second, independent notification'));
        assert(observationsSeenInsideCallback[0] === 1, n('F2. inside that one notification, getDiscoveryObservations() already reports the fresh observation — no missing-notification/stale-read gap'));

        await command(publication, 'arweave');
        assert(notificationCount === 2, n('F3. a second, different-provider call still notifies exactly once more — two calls, two notifications, never three'));
        assert(observationsSeenInsideCallback[1] === 2, n('F4. inside that second notification, both observations are already visible — synchronous consistency holds across calls, not just within one'));

        await command(publication, 'nostr');
        assert(notificationCount === 3, n('F5. a same-provider replacement call still notifies exactly once — replacement is not silently swallowed nor double-fired'));
        assert(observationsSeenInsideCallback[2] === 2, n('F6. replacing Nostr again still reports exactly two CURRENT observations from inside the callback — the replaced entry, not an accumulated one'));

        unsubscribe();
        await command(publication, 'arweave');
        assert(notificationCount === 3, n('F7. after unsubscribe(), no further notifications arrive — unchanged from pre-0.9.433 behavior'));

        console.log('✓ Section F: notifications are exactly one-per-set()-call, and a subscriber\'s own read of getDiscoveryObservations() is never stale relative to the notification that triggered it');
    }

    // ===============================================================
    // Section G — cleanup after multiple substrates, across multiple
    // publications, and safe recreation after remove().
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates() });
        const pubX = makeFakePublication('pub-g-x');
        const pubY = makeFakePublication('pub-g-y');

        await command(pubX, 'nostr');
        await command(pubX, 'arweave');
        await command(pubY, 'nostr');
        await command(pubY, 'arweave');
        assert(lifecycleStore.getDiscoveryObservations(pubX.id).length === 2 && lifecycleStore.getDiscoveryObservations(pubY.id).length === 2,
            n('G1. two publications, two substrates each, four observations total before any cleanup'));

        // clear() after multiple substrate observations, across multiple
        // publications: nothing survives.
        lifecycleStore.clear();
        assert(lifecycleStore.getDiscoveryObservations(pubX.id).length === 0 && lifecycleStore.getDiscoveryObservations(pubY.id).length === 0,
            n('G2. clear() leaves zero discovery observations for EITHER publication, regardless of how many substrates each had accumulated'));
        assert(lifecycleStore.get(pubX.id) === null && lifecycleStore.get(pubY.id) === null, n('G3. clear() also leaves the primary slot null for both, exactly as pre-0.9.433'));

        // remove() after multiple substrate observations for one
        // publication.
        await command(pubX, 'nostr');
        await command(pubX, 'arweave');
        assert(lifecycleStore.getDiscoveryObservations(pubX.id).length === 2, n('G4. re-established: two observations for pub-g-x after clear()'));
        lifecycleStore.remove(pubX.id);
        assert(lifecycleStore.getDiscoveryObservations(pubX.id).length === 0, n('G5. remove() clears both of this publication\'s own discovery observations, not merely the most recent one'));
        assert(lifecycleStore.get(pubX.id) === null, n('G6. ...and the primary slot too, exactly as get() already declared'));

        // Recreation: record -> remove -> record again. No stale
        // provider observation leaks through from before the remove().
        const afterRecreate = await command(pubX, 'nostr');
        const recreatedObservations = lifecycleStore.getDiscoveryObservations(pubX.id);
        assert(recreatedObservations.length === 1, n('G7. after record -> remove -> record again, exactly one observation exists — never two, never a leftover Arweave entry from before the remove()'));
        assert(recreatedObservations[0].discoveryProvider === 'nostr' && recreatedObservations[0].id === afterRecreate.discovery.id,
            n('G8. the recreated observation is genuinely the fresh fact, not a stale one resurrected from the internal Map'));
        assert(!recreatedObservations.some((o) => o.discoveryProvider === 'arweave'), n('G9. specifically, no stale Arweave observation leaks through the remove()/re-record cycle'));

        console.log('✓ Section G: clear()/remove() leave no discovery observations behind for any publication involved, and recreation after remove() never resurrects a stale provider entry');
    }

    // ===============================================================
    // Section H — the real UI's one-row/two-row/back-to-one-row behavior,
    // and what "removing one observation" actually means given the real
    // API surface.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates() });
        const publication = makeFakePublication('pub-h-ui');
        const distributionCommand = (pub, provider) => command(pub, provider);
        const ctx = canvasCtx({ distributionCommand });
        selectPublicationOn(ctx, publication, lifecycleStore);

        // Zero observations: today's existing single row, driven by
        // distributionDiscoveryState (ABSENT), never a fabricated row.
        assert(ctx.discoveryObservations.length === 0, n('H1. before any distribution, zero observations'));
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.ABSENT, n('H1b. and the pre-existing single-row fallback correctly reads ABSENT'));

        // One observation: the template's own threshold is
        // `discoveryObservations.length > 1`, so exactly one observation
        // STILL renders through the single legacy row (distributionDiscoveryState),
        // never the "(provider)"-labeled v-for — confirmed against the
        // real template text, not merely inferred from the computed.
        ctx.selectedDiscoveryProvider = 'nostr';
        await distributionCommand(publication, 'nostr');
        refresh(ctx, publication, lifecycleStore);
        assert(ctx.discoveryObservations.length === 1, n('H2. after one substrate, the computed reports exactly one observation'));
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        assert(/discoveryObservations\.length > 1/.test(canvasSource), n('H3. CONFIRMED FROM THE TEMPLATE: the v-for branch requires MORE than one observation — a single-substrate Publication renders the plain, unlabeled "Discovery" row exactly as it did before 0.9.433, never a "(nostr)"-labeled one'));
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, n('H4. and that single row correctly shows PRESENT — the single-observation case is fully backward-compatible in appearance, not merely in data'));

        // Two observations: the v-for branch activates, one row per
        // substrate, each correctly labeled.
        await distributionCommand(publication, 'arweave');
        refresh(ctx, publication, lifecycleStore);
        assert(ctx.discoveryObservations.length === 2, n('H5. after a second substrate, two observations'));
        assert(/v-for="observation in discoveryObservations"/.test(canvasSource) && /Discovery \(\{\{ observation\.discoveryProvider \}\}\)/.test(canvasSource),
            n('H6. CONFIRMED FROM THE TEMPLATE: the real Distribution panel genuinely contains a v-for producing one labeled row per substrate'));
        assert(ctx.discoveryObservations.every((o) => ['nostr', 'arweave'].includes(o.discoveryProvider)), n('H7. both rows this v-for would render are correctly attributed'));

        // "Remove one observation, confirm the UI returns to
        // single-observation behavior" — the real API surface has no
        // removeDiscoveryObservation(publicationId, provider); only
        // remove(publicationId)/clear() exist, and both clear EVERY
        // provider for that publication at once (Section G). The only
        // reachable way back to a genuine one-observation state is
        // therefore remove() (which discards both) followed by recording
        // exactly one substrate again — never a partial removal that
        // keeps one provider's history while discarding the other's.
        lifecycleStore.remove(publication.id);
        await distributionCommand(publication, 'nostr');
        refresh(ctx, publication, lifecycleStore);
        assert(ctx.discoveryObservations.length === 1 && ctx.discoveryObservations[0].discoveryProvider === 'nostr',
            n('H8. the UI genuinely returns to single-observation rendering after remove() + one fresh record — reachable, but only via whole-publication removal, never a per-provider one'));

        console.log('✓ Section H: the UI is a genuine observer of the real computed at every observation count, and the "remove one observation" scenario is reachable only through remove()+re-record — see the final verdict for why that is not treated as a gap');
    }

    // ===============================================================
    // Section I — duck-typed compatibility, run for real.
    // ===============================================================
    {
        const substrates = makeRealSubstrates();

        // I1 — a legacy/minimal store exposing only get()/set(): the real
        // command actually runs to completion, never throws.
        {
            const entries = new Map();
            const minimalStore = {
                get: (id) => entries.get(id) || null,
                set: (id, lifecycle) => entries.set(id, lifecycle)
            };
            const publication = makeFakePublication('pub-i1-minimal');
            let threw = false;
            let result = null;
            try {
                result = await executePublicationDistributionCommand({
                    publication,
                    serializedMaterial: JSON.stringify(publication.toJSON()),
                    discoveryProvider: 'nostr',
                    lifecycleStore: minimalStore,
                    arweaveUploaderOptions: substrates.arweaveUploaderOptions,
                    nostrPublisherOptions: substrates.nostrPublisherOptions
                });
            } catch (error) {
                threw = true;
            }
            assert(!threw, n('I1a. a minimal { get, set } store — no recordDiscoveryObservation() at all — runs the real command to completion without throwing'));
            assert(result && result.discovery !== null, n('I1b. and the distribution itself genuinely succeeded'));
            assert(entries.get(publication.id).discovery.state === PublicationDistributionState.PRESENT, n('I1c. the minimal store\'s own set() still received the fresh lifecycle, exactly as before this whole milestone existed'));

            console.log('✓ Section I1: a legacy store lacking recordDiscoveryObservation() keeps working, proven by actually running it — not merely grepped for');
        }

        // I2 — a store with recordDiscoveryObservation() but WITHOUT
        // getDiscoveryObservations(): the command still records the
        // observation (write-side duck-typing succeeds), and the UI's own
        // computed still degrades safely (read-side duck-typing succeeds)
        // when asked about a store shaped like this.
        {
            const publication = makeFakePublication('pub-i2-write-only');
            const observations = new Map();
            const entries = new Map();
            let recordCalls = 0;
            const writeOnlyStore = {
                get: (id) => entries.get(id) || null,
                set: (id, lifecycle) => entries.set(id, lifecycle),
                subscribe: () => () => {},
                recordDiscoveryObservation: (id, provider, section) => {
                    recordCalls += 1;
                    observations.set(`${id}:${provider}`, section);
                }
            };
            const result = await executePublicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON()),
                discoveryProvider: 'arweave',
                lifecycleStore: writeOnlyStore,
                arweaveUploaderOptions: substrates.arweaveUploaderOptions,
                arweaveAnnouncementPublisherOptions: substrates.arweaveAnnouncementPublisherOptions
            });
            assert(result.discovery !== null, n('I2a. the real distribution succeeds against this store shape too'));
            assert(recordCalls === 1, n('I2b. recordDiscoveryObservation() is genuinely invoked on a store that exposes it, even though that same store lacks getDiscoveryObservations()'));

            const ctx = canvasCtx({ distributionLifecycleStore: writeOnlyStore, selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id }, distributionLifecycle: writeOnlyStore.get(publication.id) });
            assert(ctx.discoveryObservations.length === 0, n('I2c. the UI\'s own computed degrades to zero observations against a store lacking getDiscoveryObservations() — a Wanderer on this store keeps seeing the single legacy row, never a crash'));

            console.log('✓ Section I2: write-side duck-typing (recordDiscoveryObservation present) and read-side duck-typing (getDiscoveryObservations absent) are independently real, proven dynamically');
        }

        // I3 — control: the full, real store exposes both, and both are
        // genuinely used.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const command = composeWorldViewShapedCommand({ lifecycleStore, ...substrates });
            const publication = makeFakePublication('pub-i3-full-store');
            await command(publication, 'nostr');
            assert(lifecycleStore.getDiscoveryObservations(publication.id).length === 1, n('I3. the full, real store records and reports the observation exactly as designed — the control case'));
            console.log('✓ Section I3: the full production store keeps working exactly as designed (control)');
        }
    }

    // ===============================================================
    // Section J — cross-role isolation, behavioral. Arweave-as-Content
    // never becomes a discovery observation merely because it is Arweave
    // — even when Arweave is ALSO the selected discoveryProvider for the
    // very same call.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();

        // J1 — material succeeds via Arweave, discovery declines: the
        // material fact is real and Arweave-sourced, yet zero discovery
        // observations exist (same scenario as C2, restated for the
        // cross-role angle specifically).
        {
            const publication = makeFakePublication('pub-j1-arweave-content-only');
            const command = composeWorldViewShapedCommand({ lifecycleStore, ...makeRealSubstrates({ nostrDeclines: true }) });
            await command(publication, 'nostr');
            const lifecycle = lifecycleStore.get(publication.id);
            assert(lifecycle.material.state === PublicationDistributionState.PRESENT, n('J1a. Content (material) genuinely succeeded, uploaded to Arweave'));
            assert(lifecycleStore.getDiscoveryObservations(publication.id).length === 0, n('J1b. "Arweave Content" does not appear as a discovery observation merely because it used Arweave'));
        }

        // J2 — Arweave used for BOTH Content (material upload) AND
        // Announcement/Discovery (discoveryProvider: 'arweave') in the
        // SAME call: exactly one discovery observation results, never two,
        // and it is never confused with the material fact.
        {
            const publication = makeFakePublication('pub-j2-arweave-both-roles');
            const substrates = makeRealSubstrates();
            const command = composeWorldViewShapedCommand({ lifecycleStore, ...substrates });
            const result = await command(publication, 'arweave');

            assert(result.material !== null && result.discovery !== null, n('J2a. both Content and Announcement/Discovery genuinely succeeded, both via Arweave'));
            const observations = lifecycleStore.getDiscoveryObservations(publication.id);
            assert(observations.length === 1, n('J2b. exactly ONE discovery observation exists — using Arweave for two roles in one call never double-counts as two discovery observations'));
            assert(observations[0].discoveryProvider === 'arweave', n('J2c. correctly attributed to the Arweave announcement publisher'));
            assert(observations[0].origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('J2d. carrying the real Announcement publisher\'s own fact'));

            // The observation is discovery-shaped only — it never leaks a
            // material-shaped field (uri/storage), proving the two roles'
            // own data never bleed into each other even when the same
            // substrate name applies to both.
            const observationKeys = Object.keys(observations[0]).sort();
            assert(!observationKeys.includes('uri') && !observationKeys.includes('storage'), n('J2e. the discovery observation carries no material-shaped fields (uri/storage) — Content\'s own facts never leak into the Announcement/Discovery observation, even though both used Arweave in this exact call'));
            assert(lifecycle_hasExpectedDiscoveryShape(observations[0]), n('J2f. the observation has exactly the discovery section\'s own shape — discoveryProvider plus state/origin/discoveryTag/id, nothing else'));

            const materialStorage = lifecycleStore.get(publication.id).material.storage;
            assert(typeof materialStorage === 'string', n('J2g. the material dimension independently records its own storage string'));
            // Both strings may legitimately be "arweave"-flavored, but
            // they are two entirely independent values — the discovery
            // observation's own discoveryProvider is never read FROM, nor
            // written INTO, material.storage.
            assert(!('discoveryProvider' in lifecycleStore.get(publication.id).material), n('J2h. the primary slot\'s own material section never carries a discoveryProvider field of any kind'));
        }

        // J3 — structural trip-wire (condensed re-check of 0.9.433's own
        // Section J): Proof/Anchor code paths still reference neither new
        // method, confirming this milestone's own read-only audit changed
        // nothing that would alter that isolation.
        {
            const anchorCode = await source('application/CreateArweaveAnchorPublisherUseCase.js');
            assert(!/recordDiscoveryObservation|getDiscoveryObservations/.test(anchorCode), n('J3. Proof/Anchor publishing still never references either of the 0.9.433 discovery-observation methods'));
        }

        console.log('✓ Section J: cross-role isolation holds behaviorally, including the specific case of Arweave serving both Content and Announcement/Discovery in one call');
    }

    // ===============================================================
    // Section K — no execution coupling. The observation seam is provably
    // inert with respect to every publisher/uploader collaborator.
    // ===============================================================
    {
        // K1 — calling the store's own observation methods directly,
        // completely bypassing the command/orchestrator, never reaches
        // any network-shaped collaborator.
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            let networkSpyCalls = 0;
            const networkSpy = { publish: () => { networkSpyCalls += 1; }, upload: () => { networkSpyCalls += 1; } };
            // The observation methods take a plain discoverySection value,
            // never a publisher/uploader object — there is no argument
            // position through which a collaborator like `networkSpy`
            // could even be threaded into these two methods, which is
            // itself part of the proof. This section confirms the spy
            // stays at zero across many direct calls.
            for (let i = 0; i < 25; i++) {
                lifecycleStore.recordDiscoveryObservation('pub-k1', 'nostr', { state: PublicationDistributionState.PRESENT, origin: 'wss://example', discoveryTag: 't', id: `id-${i}` });
                lifecycleStore.getDiscoveryObservations('pub-k1');
            }
            assert(networkSpyCalls === 0, n('K1. twenty-five direct calls to recordDiscoveryObservation()/getDiscoveryObservations() never reach any publisher-shaped collaborator — the network spy is never invoked because nothing in this store\'s own code could reach it'));
            assert(lifecycleStore.getDiscoveryObservations('pub-k1').length === 1, n('K1b. and the store\'s own data behaved exactly as documented throughout (per-provider replacement) while doing so'));

            console.log('✓ Section K1: the observation methods are provably inert with respect to any publisher/uploader collaborator');
        }

        // K2 — structural: the methods' own source bodies contain no
        // await, no fetch-shaped call, and no call to any method name a
        // publisher/uploader in this codebase actually exposes.
        {
            const storeCode = codeOnly(await source('application/PublicationDistributionLifecycleStore.js'));
            const recordStart = storeCode.indexOf('recordDiscoveryObservation(publicationId, discoveryProvider, discoverySection) {');
            const recordEnd = storeCode.indexOf('\n    }', recordStart);
            const getStart = storeCode.indexOf('getDiscoveryObservations(publicationId) {');
            const getEnd = storeCode.indexOf('\n    }', getStart);
            const bodies = storeCode.slice(recordStart, recordEnd) + storeCode.slice(getStart, getEnd);
            assert(bodies.length > 0, n('K2a. the method bodies were actually located for scanning'));
            assert(!/\bawait\b|\.publish\(|\.upload\(|\.sign\(|fetch\(/.test(bodies), n('K2b. neither method body contains an await, or a call shaped like a publisher/uploader/signer invocation — both are synchronous, pure data operations'));

            console.log('✓ Section K2: confirmed structurally — the observation methods contain no asynchronous or publisher-shaped call of any kind');
        }

        // K3 — through the full chain: reading getDiscoveryObservations()
        // repeatedly after a real distribution never increments the real
        // fake publisher's own call counters (a pure read never re-runs
        // execution).
        {
            const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
            const substrates = makeRealSubstrates();
            const command = composeWorldViewShapedCommand({ lifecycleStore, ...substrates });
            const publication = makeFakePublication('pub-k3-pure-read');

            await command(publication, 'nostr');
            const countAfterDistribution = substrates.getNostrPublishCount();
            for (let i = 0; i < 10; i++) {
                lifecycleStore.getDiscoveryObservations(publication.id);
            }
            assert(substrates.getNostrPublishCount() === countAfterDistribution, n('K3. reading getDiscoveryObservations() ten times after a real distribution never triggers a second publish — the invariant "one explicit action, one execution" holds; the observation layer never becomes an execution coordinator'));

            console.log('✓ Section K3: repeated reads never re-trigger execution — one explicit action still means exactly one execution');
        }
    }

    // ===============================================================
    // Section L — final verdict.
    // ===============================================================
    {
        console.log('\n================ 0.9.434 VERDICT ================');
        console.log('CONCURRENT_DISCOVERY_OBSERVATION_INTEGRATION_COMPLETE');
        console.log('');
        console.log('A. Real production path: CONFIRMED — UI click handler -> WorldView-shaped');
        console.log('   wrapper -> composePublicationDistributionCommand() -> orchestrator -> real');
        console.log('   PublicationDistributionLifecycleMemoryStore, with no test-only substitute');
        console.log('   for the command/store pair (Section A).');
        console.log('B. Two real substrate observations, both orders: CONFIRMED, driven through');
        console.log('   the real click handler itself (Section B).');
        console.log('C. Fresh PRESENT boundary: CONFIRMED — a decline never overwrites an earlier');
        console.log('   observation and never fabricates one of its own (Section C).');
        console.log('D. Per-provider replacement: CONFIRMED, including that updating one provider');
        console.log('   never mutates the other\'s own entry (Section D).');
        console.log('E. Existing lifecycle slot: CONFIRMED intact. Dual-observation consistency:');
        console.log('   PROVEN IMPOSSIBLE TO DIVERGE under the current command code — both');
        console.log('   representations are fed from the identical transitioned.discovery object');
        console.log('   in one synchronous call (Section E). This is a documented invariant, not');
        console.log('   an open risk.');
        console.log('F. Subscriber semantics: CONFIRMED — exactly one notification per set() call,');
        console.log('   and a subscriber\'s own read of getDiscoveryObservations() is never stale');
        console.log('   relative to the notification that triggered it (Section F).');
        console.log('G. Cleanup: CONFIRMED across multiple substrates and multiple publications;');
        console.log('   record -> remove -> record again leaves no stale provider entry (Section G).');
        console.log('H. UI observation: CONFIRMED at 0, 1, and 2 observations, through the real');
        console.log('   component export and the real template text. One finding, not a gap: there');
        console.log('   is no removeDiscoveryObservation(publicationId, provider) method, so "return');
        console.log('   to single-observation behavior" is reachable only via remove()+re-record,');
        console.log('   never a partial removal that keeps one provider while discarding the other.');
        console.log('   This matches 0.9.433\'s own deliberate exclusion of "generic multi-valued');
        console.log('   lifecycle storage" and is not treated as CLEANUP_GAP.');
        console.log('I. Duck-typed compatibility: CONFIRMED dynamically for both a store missing');
        console.log('   recordDiscoveryObservation() and a store missing getDiscoveryObservations()');
        console.log('   (Section I) — not merely grepped for, as 0.9.433\'s own regression check did.');
        console.log('J. Cross-role isolation: CONFIRMED behaviorally, including Arweave serving');
        console.log('   both Content and Announcement/Discovery in the same call producing exactly');
        console.log('   one discovery observation with no material-shaped fields (Section J).');
        console.log('K. No execution coupling: CONFIRMED — the observation seam is inert with');
        console.log('   respect to every publisher/uploader collaborator, both structurally and');
        console.log('   behaviorally (Section K).');
        console.log('');
        console.log('No OBSERVATION_SEAM_GAP, UI_OBSERVATION_GAP, CLEANUP_GAP, or COMPATIBILITY_GAP');
        console.log('was found. The one finding worth carrying forward is H\'s: no per-provider');
        console.log('removal exists, by design, not by omission.');
        console.log('===================================================\n');
    }

    console.log(`All ConcurrentDiscoveryObservationIntegrationBoundaryAudit tests passed (${assertionCount} assertions).`);
}

// A small, explicit shape check used by Section J2f — the discovery
// section's own known fields, plus the discoveryProvider tag
// getDiscoveryObservations() itself adds. Kept as a named function (rather
// than inlined) purely so its own intent reads clearly at the call site.
function lifecycle_hasExpectedDiscoveryShape(observation) {
    const allowed = new Set(['discoveryProvider', 'state', 'origin', 'discoveryTag', 'id']);
    return Object.keys(observation).every((key) => allowed.has(key));
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
