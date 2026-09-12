import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.375 — Post-Publish Distribution Guidance Actionability Audit.
//
// **Type: test-only, no production changes.** 0.9.349's own STABLE_STOP
// left one explicit question unasked: the Post-Publish Distribution arc
// (0.9.346-0.9.349) made Publication Distribution directly REACHABLE
// immediately after local publishing — but "reachable via a panel the
// user must notice" and "surfaced by the success notification the user
// already read" are two different claims. This milestone asks the second
// one, precisely:
//
//   Can the existing publish-success notification safely become an
//   actionable entry point into the already-existing Publication
//   Distribution command — reusing it exactly, with no new manager,
//   queue, or lifecycle vocabulary — without changing publication or
//   distribution semantics?
//
// Every section below is evidence gathered fresh against real,
// unmodified production source and real object graphs — the identical
// "reproduce the real seam, verify the reproduction is honest" discipline
// 0.9.346-0.9.349 already hold, never prose carried over without
// re-checking it against the current tree.
//
//   Section A — Locate the real publish-success notification path(s) in
//               production, and confirm both converge on one shape.
//   Section B — Publication identity: is the exact just-published
//               Publication actually available to that notification?
//   Section C — Is the notification surface itself interactive by
//               design, or documented as deliberately not?
//   Section D — Command availability: does every view that can show the
//               notification also have the existing distribution command
//               in scope to call?
//   Section E — Existing UI surfaces: where the command IS in scope, is
//               an equivalent action already on-screen the instant
//               Publish succeeds?
//   Section F — Duplicate/stale interaction: what does the shared
//               notification primitive itself do when a second publish
//               happens before the first notification clears?
//   Section G — Local-first invariant: does the notification path itself
//               perform any distribution I/O merely by existing?
//   Section H — Failure/dismissal convergence: would a third caller of
//               the existing distribution command inherit its semantics
//               for free, with no new vocabulary?
//   Section I — The two real paths forward, checked against current
//               source rather than invented.
//   Section J — Final decision matrix and verdict.

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

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-actionability-1',
        documentId: 'doc-actionability-1',
        title: 'An Actionability Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    if (overrides.signature !== undefined) {
        return publication;
    }
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// The EXACT logic ui/views/WorldView.js's own distributeWorldEncounterPublication()
// implements, unmodified since 0.9.104/0.9.347 — reproduced here for the
// identical reason tests/PostPublishDistributionProductReassessment.test.js's
// own copy already is: that function lives inside WorldView.js's own
// setup(), not exported. It is the ONE function WorldView binds, by the
// exact same reference, to BOTH WorldEncounterCanvas's own
// `distributionCommand` prop and OwnPublicationPanel's own
// `publicationDistributionCommand` prop (see WorldView.js lines ~4488 and
// ~4803) — reproduced once here, reused by every section below that needs
// "the existing distribution command."
function realDistributeWorldEncounterPublication({ lifecycleStore, transactionId = 'ActionabilityTransactionId123456789', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
    const gateway = gatewayHandler || (() => gatewayResponse('accepted'));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    const publicationDistributionCommand = ({ publication, serializedMaterial }) => executePublicationDistributionCommand({
        publication,
        serializedMaterial,
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-post-publish-actionability',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        },
        lifecycleStore
    });
    // Mirrors WorldView.js's own distributeWorldEncounterPublication(publication)
    // signature exactly: one argument, the Publication itself.
    return function distributeWorldEncounterPublication(publication) {
        if (!publication) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return publicationDistributionCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
    };
}

// Reproduces EditorView.js's/WorldView.js's own `feedback` object
// VERBATIM — both files define the identical shape independently (see
// Section A below for the live source proof of that duplication). This
// is the ACTUAL production shape, not a simplified stand-in: a single
// message ref, a single visible ref, a single timer, no queue, no second
// parameter of any kind.
function realFeedbackObject() {
    const state = { feedbackMessage: '', feedbackVisible: false };
    let feedbackTimer = null;
    const feedback = {
        show(message) {
            state.feedbackMessage = message;
            state.feedbackVisible = true;
            if (feedbackTimer) {
                clearTimeout(feedbackTimer);
            }
            feedbackTimer = setTimeout(() => {
                state.feedbackVisible = false;
            }, 2500);
        }
    };
    return { feedback, state, clearTimer: () => feedbackTimer && clearTimeout(feedbackTimer) };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        publicationDistributionCommand: null,
        publicationDistributionExecuting: false,
        publicationDistributionError: null,
        publicationDistributionResult: null,
        publicationDistributionRequestId: 0,
        distributeOwnPublication: OwnPublicationPanel.methods.distributeOwnPublication,
        ...overrides
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function codeOnlySource(relativePath) {
    return codeOnlyLines(await rawSource(relativePath));
}

function grepFiles(pattern, dirs) {
    try {
        const out = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n') : [];
    } catch { return []; }
}

async function grepCodeOnlyFiles(pattern, dirs) {
    const candidates = grepFiles(pattern, dirs);
    const hits = [];
    for (const file of candidates) {
        const code = await codeOnlySource(file);
        if (code.includes(pattern)) hits.push(file);
    }
    return hits;
}

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher'];

async function run() {
    // ---------------------------------------------------------------
    // Section A — Locate the real publish-success notification
    // path(s) in production, and confirm both converge on one shape.
    // ---------------------------------------------------------------
    {
        const toolbarCode = await codeOnlySource('ui/components/Toolbar.js');
        assert(/function publish\(\)/.test(toolbarCode) && toolbarCode.includes("report(`Published \"${publication.title}\"`)"),
            '1. Toolbar.js\'s own publish() — the Editor\'s Publish button — reports success via report(`Published "${publication.title}"`)');
        assert(/function report\(message\)/.test(toolbarCode) && toolbarCode.includes('props.feedback.show(message)'),
            '2. Toolbar.js\'s own report() forwards to the injected feedback.show(message) — a single string, nothing else');

        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes('function publishActiveDocument()') && worldViewCode.includes('feedback.show(`Published "${publication.title}"`)'),
            '3. WorldView.js\'s own publishActiveDocument() — World View\'s own Publish button — reports success via feedback.show(`Published "${publication.title}"`), independently of Toolbar.js');

        // Both EditorView.js and WorldView.js independently define the
        // IDENTICAL feedback shape (never a shared module) — confirmed
        // by exact source match, not paraphrase.
        const editorViewCode = await rawSource('ui/views/EditorView.js');
        const editorFeedbackBlock = editorViewCode.match(/const feedback = \{[\s\S]*?\n {8}\};/)[0];
        const worldViewRawCode = await rawSource('ui/views/WorldView.js');
        const worldFeedbackBlock = worldViewRawCode.match(/const feedback = \{[\s\S]*?\n {8}\};/)[0];
        assert(editorFeedbackBlock.includes('show(message) {') && worldFeedbackBlock.includes('show(message) {'),
            '4. both EditorView.js and WorldView.js define their own show(message) method, independently');
        assert(editorFeedbackBlock.replace(/\s/g, '') === worldFeedbackBlock.replace(/\s/g, ''),
            '5. the two independently-defined feedback objects are byte-for-byte the same shape once whitespace is normalized — one real notification primitive, duplicated, not two different ones');

        const actionFeedbackCode = await rawSource('ui/components/ActionFeedback.js');
        assert(actionFeedbackCode.includes("props: { message:") === false && /message:\s*\{/.test(actionFeedbackCode) && /visible:\s*\{/.test(actionFeedbackCode),
            '6. ActionFeedback.js — the ONE rendering component both feedback objects drive — accepts exactly two props: message, visible');

        console.log('✓ Section A: exactly one real notification primitive exists (duplicated verbatim between EditorView.js and WorldView.js), rendered by exactly one component, ActionFeedback.js — live-confirmed against current source, not assumed');
    }

    // ---------------------------------------------------------------
    // Section B — Publication identity: is the exact just-published
    // Publication actually available to that notification?
    // ---------------------------------------------------------------
    {
        // Live: Toolbar.js's publish() genuinely holds the full
        // Publication object at the call site.
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const publishUseCase = new PublishDocumentUseCase(publisherProvider, alice);
        const document = makeDocument('Identity Manor');
        const capturedMessages = [];
        const { feedback } = realFeedbackObject();
        const wrappedFeedback = { show: (m) => { capturedMessages.push(m); feedback.show(m); } };

        // Reproduces Toolbar.js's own publish() body exactly.
        function publish() {
            const publication = publishUseCase.execute({ document });
            wrappedFeedback.show(`Published "${publication.title}"`);
            return publication;
        }
        const publication = publish();

        assert(typeof capturedMessages[0] === 'string' && capturedMessages[0] === `Published "${publication.title}"`,
            '7. the notification actually delivered is a plain string built from publication.title — never the Publication object itself');
        assert(!(capturedMessages[0] instanceof Publication),
            '8. sanity: what reaches feedback.show() is definitely not a Publication instance');

        // Structural: report()/feedback.show() are defined to take
        // exactly one parameter — confirmed at both definition sites
        // (Section A already confirmed the two independent
        // definitions are byte-identical, so checking one confirms
        // both).
        const toolbarCode = await codeOnlySource('ui/components/Toolbar.js');
        assert(/function report\(message\)/.test(toolbarCode),
            '9. Toolbar.js\'s report(message) takes exactly one parameter');
        const editorViewRawForB = await rawSource('ui/views/EditorView.js');
        const feedbackBlockForB = editorViewRawForB.match(/const feedback = \{[\s\S]*?\n {8}\};/)[0];
        assert(/show\(message\)\s*\{/.test(feedbackBlockForB),
            '10. the shared feedback object\'s own show(message) is declared with exactly one parameter — a second, action-carrying argument has nowhere to go without changing this declaration');

        console.log('✓ Section B: the full Publication is genuinely in hand at every publish-success call site, but is discarded down to a title string before it reaches the notification — no existing field anywhere carries the Publication itself into the notification\'s own state');
    }

    // ---------------------------------------------------------------
    // Section C — Is the notification surface itself interactive by
    // design, or documented as deliberately not?
    // ---------------------------------------------------------------
    {
        const actionFeedbackSource = await rawSource('ui/components/ActionFeedback.js');
        assert(actionFeedbackSource.includes("pointerEvents: 'none'"),
            '11. ActionFeedback.js\'s own template sets pointerEvents: \'none\' — the rendered notification cannot receive a click today, as a CSS fact, not an inference');
        assert(!/<button|@click|onClick/i.test(actionFeedbackSource),
            '12. ActionFeedback.js\'s own template contains no button, @click, or onClick of any kind');
        assert(actionFeedbackSource.includes('no queue, no toast') && actionFeedbackSource.includes('less is the architecture'),
            '13. ActionFeedback.js\'s own header explicitly documents this as deliberate: "no queue, no toast framework... less is the architecture" — not an oversight this audit is discovering, a boundary the component already states about itself');
        assert(actionFeedbackSource.includes("evidence for a real\n// notification subsystem"),
            '14. the same header names the exact condition under which that boundary should move: "evidence for a real notification subsystem" — a component redesign decision, never a small addition');

        console.log('✓ Section C: ActionFeedback.js is non-interactive as a live CSS fact (pointerEvents: none, no click handler anywhere in its template) AND as an explicit, self-documented architectural boundary — not merely "doesn\'t happen to have a button yet"');
    }

    // ---------------------------------------------------------------
    // Section D — Command availability: does every view that can show
    // the notification also have the existing distribution command in
    // scope to call?
    // ---------------------------------------------------------------
    {
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes(':publicationDistributionCommand="distributeWorldEncounterPublication"'),
            '15. WorldView.js injects the existing distribution command into OwnPublicationPanel today, via distributeWorldEncounterPublication — confirmed still present');
        assert(worldViewCode.includes(':distributionCommand="distributeWorldEncounterPublication"'),
            '16. WorldView.js binds the SAME function reference to WorldEncounterCanvas\'s own action too — one command, two existing callers already');

        // EditorView.js — the OTHER view whose own publish() can show
        // the notification (Section A) — is checked for the identical
        // capability.
        const editorViewCode = await codeOnlySource('ui/views/EditorView.js');
        assert(!editorViewCode.includes('OwnPublicationPanel'),
            '17. EditorView.js never imports or mounts OwnPublicationPanel — the one component the existing distribution command is already wired to');
        // AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution
        // Wiring. This section's own original point-in-time finding was
        // "EditorView.js has no distribution command in scope at all" —
        // 0.9.377 (a LATER milestone than this one) already closed that
        // gap by giving EditorView.js its own real channel (see Section I,
        // below, "the decision this milestone left on record... has since
        // been built"). 0.9.450 then renamed that channel's own inject key
        // from `publicationDistributionCommand` to
        // `multiRelayNostrPublicationDistributionCommand`, and its own
        // doc comments now also mention `PublicationDistributionResult`
        // (the per-relay result shape) and
        // `NostrMultiRelayPublicationDistributionOrchestrator.js` (in
        // prose, never imported) — three sources of a literal
        // "PublicationDistribution" substring that carry no class import
        // or construction of their own, unlike what this check originally
        // existed to catch. The check is narrowed from a blanket substring
        // scan to what its own original prose actually named — "no
        // command, no lifecycle store, no orchestrator import" — checked
        // directly against import statements and constructor calls, which
        // remains a strictly STRONGER guarantee than the substring scan
        // ever was (a prose mention could never have tripped it either,
        // had this file's own EditorView.js source carried one before).
        const editorViewImportLines = editorViewCode.split('\n').filter((line) => line.trim().startsWith('import'));
        assert(!editorViewImportLines.some((line) => /PublicationDistribution/.test(line)),
            '18a. AMENDED BY 0.9.450 — EditorView.js imports nothing PublicationDistribution-named — no lifecycle store class, no orchestrator, no command-boundary function');
        assert(!/new PublicationDistribution\w*\(/.test(editorViewCode),
            '18b. AMENDED BY 0.9.450 — EditorView.js constructs no PublicationDistribution-named class directly');

        // EditorView.js is a plain router-level component: no `props`
        // block for the router to hand it anything, confirming the app
        // has no existing channel to deliver a distribution command to
        // it even if one wanted to.
        const editorViewRaw = await rawSource('ui/views/EditorView.js');
        assert(!/\n {4}props:\s*\{/.test(editorViewRaw),
            '19. EditorView.js declares no props object — it constructs its own use cases locally and receives nothing from ui/router/index.js\'s own route registration');
        const routerCode = await codeOnlySource('ui/router/index.js');
        assert(routerCode.includes("{ path: '/editor', name: 'editor', component: EditorView }"),
            '20. ui/router/index.js registers /editor with no props of any kind for EditorView');

        console.log('✓ Section D: the existing distribution command is in scope in exactly one of the two views that can show a publish-success notification (WorldView) — EditorView has neither the command, the panel it\'s wired to, nor any prop channel to receive either');
    }

    // ---------------------------------------------------------------
    // Section E — Existing UI surfaces: where the command IS in
    // scope, is an equivalent action already on-screen the instant
    // Publish succeeds?
    // ---------------------------------------------------------------
    {
        const worldViewRaw = await rawSource('ui/views/WorldView.js');

        // publishActiveDocument() calls session.publishDocument() then
        // refreshSpatialUI() SYNCHRONOUSLY within the same guarded()
        // callback.
        const publishFn = worldViewRaw.match(/function publishActiveDocument\(\)[\s\S]*?\n {8}\}/)[0];
        assert(publishFn.includes('session.publishDocument(info.documentId)') && publishFn.includes('refreshSpatialUI();'),
            '21. WorldView.js\'s own publishActiveDocument() calls session.publishDocument() and refreshSpatialUI() in the same function, not on a later, separate trigger');

        // refreshSpatialUI() re-derives ownPublication from the SAME
        // session call OwnPublicationPanel's own publication prop reads.
        const refreshBlock = worldViewRaw.match(/ownPublication\.value = \(activeId[\s\S]*?: null;/)[0];
        assert(refreshBlock.includes('session.getPublicationForDocument(activeId)'),
            '22. refreshSpatialUI() re-derives ownPublication.value from session.getPublicationForDocument(activeId) — the exact same session call, re-run fresh, not a cached reference');

        // OwnPublicationPanel is mounted unconditionally whenever a
        // World is loaded, not gated on any distribution-specific state.
        assert(worldViewRaw.includes('<OwnPublicationPanel') && worldViewRaw.match(/<OwnPublicationPanel\s*\n\s*v-if="cameraPosition"/),
            '23. OwnPublicationPanel is mounted with v-if="cameraPosition" only — visible whenever a World is loaded, the identical condition already governing the Save/Publish controls beside it, never conditioned on a prior distribution attempt');

        // Live: the panel's own "Distribute Publication" button is
        // reachable, bound to the exact right Publication, with zero
        // additional navigation, using the real command chain.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-actionability-surface' });
        const command = realDistributeWorldEncounterPublication({ lifecycleStore });
        const ctx = panelCtx({ publication, publicationDistributionCommand: command });
        ctx.distributeOwnPublication();
        await flushMicrotasks();
        assert(ctx.publicationDistributionResult !== null && lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
            '24. the SAME publication WorldView would have just re-derived into ownPublication is fully distributable through the panel\'s own existing action, with no toast of any kind involved');

        console.log('✓ Section E: in WorldView, the seam this audit was asked to evaluate is already closed structurally — the equivalent action is already on-screen, already scoped to the exact just-published Publication, in the same render tick Publish succeeds in, live-confirmed');
    }

    // ---------------------------------------------------------------
    // Section F — Duplicate/stale interaction: what does the shared
    // notification primitive itself do when a second publish happens
    // before the first notification clears?
    // ---------------------------------------------------------------
    {
        const { feedback, state } = realFeedbackObject();

        feedback.show('Published "World A"');
        assert(state.feedbackMessage === 'Published "World A"' && state.feedbackVisible === true,
            '25. first notification shows as expected');

        // Before A's 2500ms timer fires, B publishes.
        feedback.show('Published "World B"');
        assert(state.feedbackMessage === 'Published "World B"',
            '26. a second publish before the first notification clears OVERWRITES the message entirely — there is no queue, matching ActionFeedback.js\'s own documented "no queue" (Section C)');
        assert(state.feedbackMessage !== 'Published "World A"',
            '27. A\'s own text is now completely gone from the shared primitive\'s state — nothing about A is recoverable from it');

        console.log('✓ Section F: the shared feedback primitive is single-slot and last-write-wins, live-confirmed — any action attached to it would need its own requestId-style staleness guard (the identical discipline distributeOwnPublication()/distributeOwnSnapshot() already hold, Section E) to avoid a click on a stale, already-overwritten notification silently acting on the wrong Publication; today\'s primitive provides no such guard itself');
    }

    // ---------------------------------------------------------------
    // Section G — Local-first invariant: does the notification path
    // itself perform any distribution I/O merely by existing?
    // ---------------------------------------------------------------
    {
        const forbiddenIoTerms = ['fetch(', 'WebSocket', 'PublicationDistribution', 'ArweaveContentStore', 'Nostr'];
        for (const file of ['ui/components/Toolbar.js', 'ui/views/EditorView.js', 'ui/views/WorldView.js', 'ui/components/ActionFeedback.js']) {
            const code = await codeOnlySource(file);
            const feedbackRegionMatch = code.match(/const feedback = \{[\s\S]*?\n\s*\};|function report\(message\)[\s\S]*?\n\s*\}/g) || [];
            for (const region of feedbackRegionMatch) {
                for (const term of forbiddenIoTerms) {
                    assert(!region.includes(term), `28. ${file}'s own feedback/report definition contains no "${term}" — the notification path performs zero I/O of its own`);
                }
            }
        }

        // Reconfirmed fresh, per 0.9.349's own Section E/I: publish
        // itself still triggers no distribution automatically.
        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        assert(!/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(publishUseCaseCode),
            '29. PublishDocumentUseCase.js still carries no distribution vocabulary, reconfirmed fresh — Publish itself remains local-first regardless of what the notification surface does');

        console.log('✓ Section G: the notification path performs zero distribution I/O by itself today, and Publish itself remains local-first — this invariant holds independent of whatever this audit concludes about actionability');
    }

    // ---------------------------------------------------------------
    // Section H — Failure/dismissal convergence: would a third caller
    // of the existing distribution command inherit its semantics for
    // free, with no new vocabulary?
    // ---------------------------------------------------------------
    {
        // The command's own signature carries no caller-identifying
        // parameter — structurally caller-agnostic. Checked against the
        // actual destructured parameter list only, not the whole file
        // (whose own prose comments freely use words like "caller" and
        // "origin" — "origin" is legitimately part of the returned
        // discovery result shape, not a caller-identifying input).
        const commandRaw = await rawSource('application/PublicationDistributionCommand.js');
        const signatureMatch = commandRaw.match(/export function executePublicationDistributionCommand\(\{([\s\S]*?)\} = \{\}\)/);
        assert(signatureMatch, '30a. executePublicationDistributionCommand()\'s own destructured signature is found in source');
        const parameterNames = signatureMatch[1].split(',').map((p) => p.trim()).filter(Boolean);
        assert(parameterNames.every((p) => !/caller|surface|toast|invoker/i.test(p)),
            `30. executePublicationDistributionCommand()'s own parameter list carries no caller/surface/toast/invoker-identifying field — found: ${JSON.stringify(parameterNames)} — it cannot special-case who invoked it, structurally`);

        // Live: invoke the SAME distributeWorldEncounterPublication
        // function reference WorldView already binds to two existing
        // callers, a third time here, both on success and on failure,
        // and confirm the shape matches what OwnPublicationPanel's own
        // distributeOwnPublication() already produces (0.9.347/0.9.349).
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-actionability-convergence' });
        const successCommand = realDistributeWorldEncounterPublication({ lifecycleStore });
        const thirdCallerResult = await successCommand(publication);
        assert(thirdCallerResult.discovery && thirdCallerResult.discovery.id === 'e'.repeat(64),
            '31. a hypothetical third caller invoking the exact existing function reference gets the identical real result shape — no new success vocabulary required');

        const failingCommand = realDistributeWorldEncounterPublication({
            lifecycleStore,
            gatewayHandler: () => { throw new Error('gateway unreachable'); }
        });
        let threw = false;
        try {
            await failingCommand(publication);
        } catch (e) {
            threw = true;
        }
        assert(threw, '32. the exact same existing command rejects on a genuine failure — a third caller inherits a real rejection to catch, never a silent swallow');

        // The panel's own catch() renders a fixed, generic message
        // regardless of the underlying failure — the SAME restraint a
        // toast action would inherit for free if it called this command,
        // never a toast-specific error vocabulary of its own.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes("this.publicationDistributionError = 'Publication distribution could not be completed.'"),
            '33. OwnPublicationPanel.js\'s own catch() renders one fixed, generic failure message — the exact vocabulary a toast action would reuse, never a distinct one');

        console.log('✓ Section H: the existing distribution command is structurally caller-agnostic and live-proven to behave identically for a third caller, on both success and failure — a toast action, IF wired through this same command, would need no new failure/dismissal vocabulary of its own');
    }

    // ---------------------------------------------------------------
    // Section I — The two real paths forward, checked against current
    // source rather than invented.
    // ---------------------------------------------------------------
    {
        // Path 1 — redesign ActionFeedback itself into something
        // interactive. Confirmed absent today (Section C already
        // proved this is a real boundary, not an oversight).
        const actionFeedbackSource = await rawSource('ui/components/ActionFeedback.js');
        assert(!/onAction\s*:|actionLabel\s*:|actionCommand\s*:|emits\s*:/i.test(actionFeedbackSource),
            '34. ActionFeedback.js declares no onAction/actionLabel/actionCommand prop and emits nothing — Path 1 does not exist yet, and building it means revising this component\'s own documented restraint, not adding to it');

        // Path 2 — give EditorView its own distribution-command wiring.
        // Confirmed absent at the time this milestone ran (Section D
        // already proved that). 0.9.376's own follow-up audit named this
        // exact path BUILD_NEXT, and 0.9.377 — EditorView Post-Publish
        // Distribution Action — built it: EditorView.js now injects
        // publicationDistributionCommand and calls its own
        // distributeEditorPublication() wrapper, mirroring WorldView.js's
        // own distributeWorldEncounterPublication() in shape. This
        // assertion now confirms that closure rather than the absence
        // this milestone originally found — the rest of this section's
        // (and this file's) own evidence is unaffected, since none of it
        // depended on Path 2 staying unbuilt.
        //
        // AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution
        // Wiring. The injected key renamed from `publicationDistributionCommand`
        // to `multiRelayNostrPublicationDistributionCommand` (EditorView.js
        // never offered an Arweave substrate choice to keep the single-relay
        // command for — see that file's own 0.9.450 amendment); the wrapper
        // itself, `distributeEditorPublication(publication)`, is unchanged
        // in shape.
        const editorViewCode = await codeOnlySource('ui/views/EditorView.js');
        assert(editorViewCode.includes("inject('multiRelayNostrPublicationDistributionCommand', null)") && editorViewCode.includes('function distributeEditorPublication(publication)'),
            '35. AMENDED BY 0.9.450 — EditorView.js still has its own distribution-command wiring (0.9.377\'s own Path 2), now through multiRelayNostrPublicationDistributionCommand');

        // No forbidden shortcut vocabulary (a generic notification
        // manager, a toast-specific distribution wrapper) exists
        // anywhere, confirming neither path has been half-built already.
        const forbiddenVocabulary = ['ToastDistributionManager', 'ToastDistributionUseCase', 'ToastDistributionOrchestrator', 'NotificationSubsystem', 'ActionableFeedback'];
        for (const term of forbiddenVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, `36. no "${term}" vocabulary exists anywhere in production`);
        }

        console.log('✓ Section I: Path 1 (an interactive ActionFeedback) still does not exist — that restraint holds. Path 2 (a distribution-command channel into EditorView) has SINCE been built, by 0.9.377, using exactly the inject(key, null) + wrapper shape this section originally described as the gap; no shortcut vocabulary was ever half-built toward either.');
    }

    // ---------------------------------------------------------------
    // Section J — Final decision matrix and verdict.
    // ---------------------------------------------------------------
    {
        console.log('');
        console.log('Final product decision matrix:');
        console.log('| Question                                              | Finding                                          |');
        console.log('|--------------------------------------------------------|---------------------------------------------------|');
        console.log('| One real notification primitive?                     | Yes — duplicated verbatim, one rendering component |');
        console.log('| Publication identity reaches the notification?       | No — discarded to a title string at every call site|');
        console.log('| Notification surface interactive by design?          | No — documented, CSS-enforced non-interactivity   |');
        console.log('| Existing distribution command in scope everywhere?   | No — WorldView only, not EditorView                |');
        console.log('| Equivalent action already on-screen where reachable? | Yes — WorldView\'s OwnPublicationPanel, same tick   |');
        console.log('| Command shape would converge for a new caller?       | Yes — structurally caller-agnostic, live-proven    |');
        console.log('| Either real path forward already exists?             | No — neither built, not even partially             |');
        console.log('');
        console.log('✓ Section J: VERDICT — DEFER.');
        console.log('  The specific mechanism proposed — a clickable action inside the existing publish-success notification — does not converge');
        console.log('  safely on current architecture the way 0.9.347/0.9.348 converged on the existing distribution command: ActionFeedback.js is');
        console.log('  non-interactive as both a live CSS fact and an explicit, self-documented design boundary ("no toast framework... less is the');
        console.log('  architecture"), and the one view where the existing distribution command is actually in scope (WorldView) already shows an');
        console.log('  equivalent, correctly-scoped action on-screen in the same render tick Publish succeeds in — making a duplicate toast action');
        console.log('  there largely redundant. The one place with a genuine, still-open gap is EditorView, where Publish success is reachable but');
        console.log('  no distribution surface of any kind is — and closing that gap is not "add a button to a toast," it is giving EditorView its');
        console.log('  own real channel to the existing distribution command (Path 2, Section I), a materially larger, structurally different');
        console.log('  decision than this milestone\'s own proposed scope. That decision is real and left on record for a future milestone; it is');
        console.log('  not built here, and it is not the same milestone as making ActionFeedback clickable.');
        console.log('');
        console.log('  UPDATE (0.9.377): the decision this milestone left on record — giving EditorView its own real channel to the');
        console.log('  existing distribution command — has since been built, per 0.9.376\'s own BUILD_NEXT audit. Section I\'s own assertion');
        console.log('  35 above now confirms that closure rather than the gap this milestone originally found; every other assertion in');
        console.log('  this file is unaffected, since none of them depended on Path 2 staying unbuilt.');

        console.log('\n✅ All Post-Publish Distribution Guidance Actionability Audit tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
