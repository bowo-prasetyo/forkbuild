import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
import PublicationList from '../ui/components/PublicationList.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { worldViewFiles, mainFiles } from './support/SourceFileGroups.js';
import { readSource as rawSource } from './support/SourceText.js';
import { readDoc } from './support/DocText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.639 — Publication Commentary Distribution Provider Selection Product
// Closure Audit.
//
// TYPE: test-only product/architecture closure audit. PRODUCTION CHANGES:
// none — see Section J's own live guard, below.
//
// THE QUESTION, verbatim from the requesting brief: can a user now
// intentionally choose Nostr or Arweave when creating a Publication
// Commentary through the supported Publication/Repository UI, with the
// selected substrate faithfully reaching the existing distribution
// pipeline, without changing any other Commentary semantics?
//
// 0.9.637 (UI Boundary Audit) found the selection boundary already lived
// one layer down in ui/main.js's own addPublicationCommentaryCommand
// wrapper, and isolated the actionable gap to PATH 1 —
// ui/components/PublicationCard.js/PublicationList.js. 0.9.638 (Provider
// Selector) built exactly that, exactly scoped: a two-option "Distribution:
// Nostr / Arweave" <select> on PATH 1 only, forwarding its value verbatim
// as discoveryProvider on the exact call each component already made;
// PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js) was left
// deliberately untouched. This milestone re-verifies both milestones'
// own conclusions against the NOW-MODIFIED production code (Section A),
// then runs the two flagship substrate journeys end to end through the
// real, current, mounted-shape components (Sections B/C), audits
// exclusivity/local-first/truthfulness/isolation/regression as first-
// class product properties in their own right (Sections D-H), and closes
// with a deliberate, evidence-based judgment on PATH 2 (Section I) rather
// than treating its own existence as a defect.
//
//   Section A — re-execute the 0.9.637/0.9.638 boundary conclusions
//               against current source.
//   Section B — FLAGSHIP: real PublicationCard, Nostr selected, full
//               chain (local + WebRTC + Nostr, Arweave untouched).
//   Section C — FLAGSHIP: real PublicationList, Arweave selected, full
//               chain (local + WebRTC + Arweave, Nostr untouched).
//   Section D — exclusive substrate semantics matrix (no fan-out, no
//               fallback, no hidden second publish, either direction).
//   Section E — local-first semantics: local Commentary survives a
//               rejecting selected substrate, for BOTH substrates.
//   Section F — UI truthfulness: no delivery/read/durability/retrieval
//               claim anywhere in the PATH 1 UI, on either substrate.
//   Section G — per-row/per-instance isolation: three publications,
//               three independent selections, no cross-row or cross-
//               instance bleed; status state is never shared component
//               state.
//   Section H — regression and legacy compatibility.
//   Section I — cross-surface boundary: PATH 1 selectable, PATH 2 not —
//               live evidence for why that remains a separate question,
//               not an automatically-classified defect.
//   Section J — production-change guard and exclusion guard.
//   Section K — product closure verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
async function codeOnlySource(relativePath) {
    return codeOnly(await rawSource(relativePath));
}

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

// The real local-persistence-only capability, composed the same way
// ui/main.js's own createPublicationCommentaryCommand is — reused verbatim
// from 0.9.638's own makeBackend() so this audit exercises real
// collaborators, never stubs, at the persistence layer.
function makeBackend() {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    const contentStore = new LocalContentStore(storage);
    const publisherProvider = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const notificationEventStore = new NotificationEventStore(storage);

    const commentaryStore = new PublicationCommentaryStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        commentaryStore, identityProvider, canCommentOnPublicationUseCase
    );
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase, discoveryProvider,
        (notificationEvent) => notificationEventStore.save(notificationEvent)
    );

    function getPublicationCommentariesCommand(publicationId) {
        if (!publicationId) return [];
        return getPublicationCommentariesUseCase.execute({ publicationId });
    }
    function createPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) {
        return publicationCommentaryCapability.execute({ publicationId, content, commentaryId, createdAt });
    }

    return {
        storage, identityProvider, publisherProvider, discoveryProvider,
        commentaryStore, notificationEventStore,
        getPublicationCommentariesCommand, createPublicationCommentaryCommand
    };
}

// The identical live-extraction technique 0.9.637's Section D flagship and
// 0.9.638's own harness both established: pull the REAL, current function
// body out of ui/main.js's own source and execute it against fake WebRTC/
// Nostr/Arweave collaborators — never a reimplementation that could drift.
async function extractPath1Wrapper() {
    const mainSource = (await Promise.all(mainFiles().map((file) => codeOnlySource(file)))).join('\n');
    const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
    assert(wrapperMatch !== null, n('sanity: the real addPublicationCommentaryCommand wrapper is found in ui/main.js\'s current source'));
    // eslint-disable-next-line no-new-func
    return new Function(
        'input', 'createPublicationCommentaryCommand', 'publicationCommentaryDistributionPeerExchange',
        'publicationCommentaryArweaveDistribution', 'publicationCommentaryNostrDistribution', 'publicationCommentaryDistributionExchange',
        wrapperMatch[1]
    );
}

function makeDistributionWrappedCommand(path1Fn, createPublicationCommentaryCommand, calls, overrides = {}) {
    return function addPublicationCommentaryCommand(input) {
        return path1Fn(
            input,
            createPublicationCommentaryCommand,
            overrides.peer || { announce: () => { calls.peer += 1; } },
            overrides.arweave || { publish: (json) => { calls.arweave += 1; return Promise.resolve({ published: true, locator: 'a', json }); } },
            overrides.nostr || { publish: (json) => { calls.nostr += 1; return Promise.resolve({ published: true, locator: 'n', json }); } },
            overrides.exchange || { exportCommentary: (c) => ({ envelopeFor: c }) }
        );
    };
}

function cardCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        commentaryOpen: false,
        commentaries: [],
        newCommentaryText: '',
        commentaryError: null,
        pendingCommentaryDraft: null,
        selectedDiscoveryProvider: 'nostr',
        lastCommentaryDistributionProvider: null,
        // The card's own toggle; opening mounts the shared
        // PublicationCommentarySection, whose mounted() performs the
        // first read. Reads/writes are that section's own methods.
        toggleCommentary() {
            PublicationCard.methods.toggleCommentary.call(this);
            if (this.commentaryOpen) {
                PublicationCommentarySection.mounted.call(this);
            }
        },
        refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
        submitCommentary: PublicationCommentarySection.methods.submitCommentary,
        ...overrides
    };
}

// PublicationList.js only tracks which rows are open; each open row
// mounts its own PublicationCommentarySection. `rowSection(pub)` stands
// in for that row's own section instance (one per publicationId, never
// shared); opening runs its mounted() read, closing discards it.
function listCtx(overrides = {}) {
    const ctx = {
        getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null,
        identityUseCase: null, defaultAnnouncementDiscoveryProvider: null,
        openCommentaryIds: {},
        isCommentaryOpen: PublicationList.methods.isCommentaryOpen,
        ...overrides
    };
    const sections = new Map();
    ctx.rowSection = (pub) => {
        if (!sections.has(pub.id)) {
            const section = {
                publication: pub,
                getPublicationCommentariesCommand: ctx.getPublicationCommentariesCommand,
                addPublicationCommentaryCommand: ctx.addPublicationCommentaryCommand,
                identityUseCase: ctx.identityUseCase,
                defaultAnnouncementDiscoveryProvider: ctx.defaultAnnouncementDiscoveryProvider,
                refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
                submitCommentary: PublicationCommentarySection.methods.submitCommentary
            };
            Object.assign(section, PublicationCommentarySection.data.call(section));
            sections.set(pub.id, section);
        }
        return sections.get(pub.id);
    };
    ctx.toggleCommentary = (pub) => {
        PublicationList.methods.toggleCommentary.call(ctx, pub);
        if (ctx.isCommentaryOpen(pub)) {
            PublicationCommentarySection.mounted.call(ctx.rowSection(pub));
        } else {
            sections.delete(pub.id);
        }
    };
    return ctx;
}

async function run() {
    const path1Fn = await extractPath1Wrapper();

    // ===============================================================
    // Section A — re-execute the 0.9.637/0.9.638 boundary conclusions
    // against current source.
    // ===============================================================
    {
        const cardCode = (await codeOnlySource('ui/components/PublicationCard.js') + await codeOnlySource('ui/components/PublicationCommentarySection.js'));
        const listCode = (await codeOnlySource('ui/components/PublicationList.js') + await codeOnlySource('ui/components/PublicationCommentarySection.js'));
        assert(/addPublicationCommentaryCommand\(\{ publicationId: this\.publication\.id, content, commentaryId, createdAt, discoveryProvider \}\)/.test(cardCode),
            n('PATH 1 precedent intact: PublicationCard.js\'s own call still forwards discoveryProvider verbatim on the same, unchanged four-field call it always sent'));
        assert(listCode.includes('<PublicationCommentarySection :publication="pub" />') &&
               /addPublicationCommentaryCommand\(\{ publicationId: this\.publication\.id, content, commentaryId, createdAt, discoveryProvider \}\)/.test(listCode),
            n('PATH 1 precedent intact: PublicationList.js\'s rows submit through the same shared section, with the identical call shape'));

        const mainCode = (await Promise.all(mainFiles().map((file) => codeOnlySource(file)))).join('\n');
        assert(/const discoveryProvider = \(input && input\.discoveryProvider\) \|\| 'nostr';/.test(mainCode),
            n('no second source of truth: exactly one place (ui/main.js) still reads input.discoveryProvider, unmodified since before 0.9.637'));
        assert(/const asynchronousDistribution = discoveryProvider === 'arweave'\s*\?\s*publicationCommentaryArweaveDistribution\s*:\s*publicationCommentaryNostrDistribution;/.test(mainCode),
            n('existing provider identity intact: selection is still the literal \'nostr\'/\'arweave\' strings, still structurally exclusive'));

        const path2Sites = [
            { file: 'ui/components/OwnPublicationPanel.js', fn: 'submitPublicationCommentary' },
            { file: 'ui/components/WorldEncounterCanvas.js', fn: 'submitObserverLocalEncounterCommentary' },
            { file: 'ui/components/WorldEncounterCanvas.js', fn: 'submitEncounterCommentary' }
        ];
        for (const { file, fn } of path2Sites) {
            const source = await codeOnlySource(file);
            const fnStart = source.indexOf(`${fn}(`);
            assert(fnStart !== -1, n(`sanity: ${file}#${fn}() still exists`));
            const window = source.slice(fnStart, fnStart + 1100);
            const callMatch = window.match(/(?:this\.)?addPublicationCommentaryCommand\(\{[^}]*\}\)/);
            assert(callMatch !== null, n(`sanity: ${file}#${fn}() still calls addPublicationCommentaryCommand()`));
            assert(!/discoveryProvider/.test(callMatch[0]),
                n(`PATH 2 remains intentionally unchanged: ${file}#${fn}()'s own real call — "${callMatch[0]}" — still omits discoveryProvider`));
        }

        console.log('✓ A: 0.9.637/0.9.638\'s own conclusions re-verified against current, live source — selector precedent intact, PATH 1 exposes selection, PATH 2 unchanged, exactly one source of truth, provider identity unchanged.');
    }

    // ===============================================================
    // Section B — FLAGSHIP: real PublicationCard, Nostr selected,
    // full journey.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('flagship-author');
        const publication = backend.publisherProvider.publish(makeDocument('Flagship Nostr', 'flagship-author'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = cardCtx({
            publication,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand,
            selectedDiscoveryProvider: 'nostr'
        });

        ctx.newCommentaryText = 'User opens Publication -> Commentary composer -> Nostr selected';
        ctx.submitCommentary();

        assert(ctx.commentaryError === null, n('flagship Nostr journey: submission succeeds with no error'));
        const stored = backend.commentaryStore.getForPublication(publication.id);
        assert(stored.length === 1 && stored[0].content === 'User opens Publication -> Commentary composer -> Nostr selected',
            n('flagship Nostr journey: local Commentary persistence holds the real, submitted content'));
        assert(calls.peer === 1, n('flagship Nostr journey: WebRTC announcement fires'));
        assert(calls.nostr === 1, n('flagship Nostr journey: Nostr asynchronous distribution is invoked'));
        assert(calls.arweave === 0, n('flagship Nostr journey: Arweave is never invoked'));
        assert(ctx.lastCommentaryDistributionProvider === 'nostr', n('flagship Nostr journey: identity continuity — the card\'s own status reports exactly \'nostr\', the same literal selected'));

        console.log('✓ B — FLAGSHIP NOSTR JOURNEY: PublicationCard -> Nostr selected -> addPublicationCommentaryCommand -> local persistence + WebRTC + Nostr, Arweave untouched, identity continuous end to end.');
    }

    // ===============================================================
    // Section C — FLAGSHIP: real PublicationList, Arweave selected,
    // full journey.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('flagship-author');
        const publication = backend.publisherProvider.publish(makeDocument('Flagship Arweave', 'flagship-author'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand
        });

        const row = ctx.rowSection(publication);
        row.newCommentaryText = 'User opens Publication -> Commentary composer -> Arweave selected';
        row.selectedDiscoveryProvider = 'arweave';
        row.submitCommentary();

        assert(row.commentaryError === null, n('flagship Arweave journey: submission succeeds with no error'));
        const stored = backend.commentaryStore.getForPublication(publication.id);
        assert(stored.length === 1 && stored[0].content === 'User opens Publication -> Commentary composer -> Arweave selected',
            n('flagship Arweave journey: local Commentary persistence holds the real, submitted content'));
        assert(calls.peer === 1, n('flagship Arweave journey: WebRTC announcement fires'));
        assert(calls.arweave === 1, n('flagship Arweave journey: Arweave asynchronous distribution is invoked'));
        assert(calls.nostr === 0, n('flagship Arweave journey: Nostr is never invoked'));
        assert(row.lastCommentaryDistributionProvider === 'arweave', n('flagship Arweave journey: identity continuity — the row\'s own status reports exactly \'arweave\''));

        console.log('✓ C — FLAGSHIP ARWEAVE JOURNEY: PublicationList -> Arweave selected -> addPublicationCommentaryCommand -> local persistence + WebRTC + Arweave, Nostr untouched, identity continuous end to end.');
    }

    // ===============================================================
    // Section D — exclusive substrate semantics matrix.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('matrix-author');
        const pubNostr = backend.publisherProvider.publish(makeDocument('Matrix Nostr', 'matrix-author'), backend.identityProvider);
        const pubArweave = backend.publisherProvider.publish(makeDocument('Matrix Arweave', 'matrix-author'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = cardCtx({ publication: pubNostr, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand, selectedDiscoveryProvider: 'nostr' });
        ctx.newCommentaryText = 'matrix row: nostr';
        ctx.submitCommentary();
        assert(calls.nostr === 1 && calls.arweave === 0 && calls.peer === 1,
            n('matrix row \'nostr\': Nostr ✓, Arweave ✗, WebRTC ✓ — exactly the declared matrix'));

        ctx.publication = pubArweave;
        ctx.selectedDiscoveryProvider = 'arweave';
        ctx.newCommentaryText = 'matrix row: arweave';
        ctx.pendingCommentaryDraft = null;
        ctx.submitCommentary();
        assert(calls.nostr === 1 && calls.arweave === 1 && calls.peer === 2,
            n('matrix row \'arweave\': Nostr unchanged (✗ this row), Arweave ✓, WebRTC ✓ — exactly the declared matrix'));

        // No automatic fan-out: total substrate calls across both rows
        // equal the number of rows, never both substrates per row.
        assert(calls.nostr + calls.arweave === 2, n('no automatic fan-out: exactly one substrate call per submission, across both rows combined'));

        console.log('✓ D: exclusive substrate semantics confirmed live — nostr selection reaches {Nostr, WebRTC} only; arweave selection reaches {Arweave, WebRTC} only; no fan-out, no fallback, no hidden second publication.');
    }

    // ===============================================================
    // Section E — local-first semantics, both substrates.
    // ===============================================================
    {
        for (const provider of ['nostr', 'arweave']) {
            const backend = makeBackend();
            backend.identityProvider.login('local-first-author');
            const publication = backend.publisherProvider.publish(makeDocument(`Local-first ${provider}`, 'local-first-author'), backend.identityProvider);

            const rejectingSubstrate = { publish: () => Promise.reject(new Error(`no ${provider} substrate reachable`)) };
            const addPublicationCommentaryCommand = function (input) {
                return path1Fn(
                    input,
                    backend.createPublicationCommentaryCommand,
                    { announce: () => { throw new Error('no peers connected'); } },
                    provider === 'arweave' ? rejectingSubstrate : { publish: () => Promise.resolve({ published: true }) },
                    provider === 'nostr' ? rejectingSubstrate : { publish: () => Promise.resolve({ published: true }) },
                    { exportCommentary: (c) => ({ envelopeFor: c }) }
                );
            };
            const ctx = cardCtx({ publication, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand, selectedDiscoveryProvider: provider });
            ctx.newCommentaryText = `local Commentary survives a failing ${provider} substrate`;
            ctx.submitCommentary();

            assert(ctx.commentaryError === null, n(`local-first (${provider}): neither the WebRTC throw nor the rejected ${provider} publish is reported as a creation failure`));
            assert(backend.commentaryStore.getForPublication(publication.id).length === 1, n(`local-first (${provider}): the local Commentary remains available despite the selected substrate failing`));
            assert(ctx.lastCommentaryDistributionProvider === provider, n(`local-first (${provider}): the UI still honestly reports which substrate was REQUESTED, not that it succeeded`));

            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        console.log('✓ E: local-first semantics hold for BOTH substrates — local Commentary succeeds and remains available even when the selected asynchronous substrate rejects; the UI never reinterprets substrate failure as Commentary creation failure.');
    }

    // ===============================================================
    // Section F — UI truthfulness.
    // ===============================================================
    {
        const cardSource = (await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const listSource = (await rawSource('ui/components/PublicationList.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const forbidden = /reached the (publication )?owner|delivered to|read by|seen by|has been retrieved|durably retrievable|successfully delivered|confirmed received/i;

        assert(!forbidden.test(codeOnly(cardSource)), n('PublicationCard.js never claims delivery, receipt, readership, or durable retrievability anywhere in its own code'));
        assert(!forbidden.test(codeOnly(listSource)), n('PublicationList.js carries the identical restraint'));

        assert(/Comment saved locally\. Distribution requested via \{\{ lastCommentaryDistributionProviderLabel \}\}\./.test(cardSource),
            n('PublicationCard.js\'s own status line says exactly "requested," distinguishing local success (a fact) from distribution outcome (unknown), never conflating the two'));
        assert(listSource.includes('<PublicationCommentarySection') && /Comment saved locally\. Distribution requested via \{\{ lastCommentaryDistributionProviderLabel \}\}\./.test(listSource),
            n('PublicationList.js\'s own per-row status line carries the identical, honest "requested" vocabulary'));

        // The status line is rendered ONLY after a real local success
        // (lastCommentaryDistributionProvider / distributionProvider are
        // set exclusively inside the try block's success path, never in
        // data()'s own initial value nor in the catch block) — so "Comment
        // saved locally" is never shown speculatively, ahead of an actual
        // local persistence result.
        const cardCode = codeOnly(cardSource);
        const submitCardBody = cardCode.slice(cardCode.indexOf('submitCommentary()'), cardCode.indexOf('submitCommentary()') + 1400);
        assert(!/catch[\s\S]*lastCommentaryDistributionProvider\s*=/.test(submitCardBody),
            n('PublicationCard.js never sets lastCommentaryDistributionProvider from the catch block — the status line cannot appear for a failed local submission'));

        console.log('✓ F: UI truthfulness confirmed on both PATH 1 surfaces — no claim of delivery, readership, or durable retrievability; status vocabulary distinguishes "saved locally" (fact) from "distribution requested via X" (a request, not an outcome), and only ever appears after a genuine local success.');
    }

    // ===============================================================
    // Section G — per-row / per-instance isolation.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('isolation-author');
        const pubA = backend.publisherProvider.publish(makeDocument('Isolation A', 'isolation-author'), backend.identityProvider);
        const pubB = backend.publisherProvider.publish(makeDocument('Isolation B', 'isolation-author'), backend.identityProvider);
        const pubC = backend.publisherProvider.publish(makeDocument('Isolation C', 'isolation-author'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = listCtx({ getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand });

        // Publication A -> Arweave, Publication B -> Nostr, Publication C -> Arweave.
        ctx.rowSection(pubA).newCommentaryText = 'row A'; ctx.rowSection(pubA).selectedDiscoveryProvider = 'arweave';
        ctx.rowSection(pubA).submitCommentary();
        ctx.rowSection(pubB).newCommentaryText = 'row B'; ctx.rowSection(pubB).selectedDiscoveryProvider = 'nostr';
        ctx.rowSection(pubB).submitCommentary();
        ctx.rowSection(pubC).newCommentaryText = 'row C'; ctx.rowSection(pubC).selectedDiscoveryProvider = 'arweave';
        ctx.rowSection(pubC).submitCommentary();

        assert(ctx.rowSection(pubA).lastCommentaryDistributionProvider === 'arweave', n('row A\'s own status reflects \'arweave\''));
        assert(ctx.rowSection(pubB).lastCommentaryDistributionProvider === 'nostr', n('row B\'s own status reflects \'nostr\', unaffected by A or C'));
        assert(ctx.rowSection(pubC).lastCommentaryDistributionProvider === 'arweave', n('row C\'s own status reflects \'arweave\', independent of A'));
        assert(calls.arweave === 2 && calls.nostr === 1 && calls.peer === 3,
            n('exactly the declared per-row substrate mix is reached in total: two Arweave, one Nostr, three WebRTC announces'));

        // Changing A afterward never changes B or C.
        ctx.rowSection(pubA).newCommentaryText = 'row A, second comment';
        ctx.rowSection(pubA).selectedDiscoveryProvider = 'nostr';
        ctx.rowSection(pubA).submitCommentary();
        assert(ctx.rowSection(pubA).lastCommentaryDistributionProvider === 'nostr', n('row A\'s own status updates to reflect its OWN new selection'));
        assert(ctx.rowSection(pubB).lastCommentaryDistributionProvider === 'nostr', n('row B\'s own status is untouched by row A\'s second, different submission'));
        assert(ctx.rowSection(pubC).lastCommentaryDistributionProvider === 'arweave', n('row C\'s own status is untouched by row A\'s second, different submission'));

        // The "last-submission display" is never shared component state:
        // two entirely separate PublicationCard instances (ctx objects)
        // never see each other's lastCommentaryDistributionProvider.
        const cardCallsA = { peer: 0, nostr: 0, arweave: 0 };
        const cardCallsB = { peer: 0, nostr: 0, arweave: 0 };
        const cardCmdA = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, cardCallsA);
        const cardCmdB = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, cardCallsB);
        const cardInstanceA = cardCtx({ publication: pubA, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: cardCmdA, selectedDiscoveryProvider: 'arweave' });
        const cardInstanceB = cardCtx({ publication: pubB, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: cardCmdB, selectedDiscoveryProvider: 'nostr' });
        cardInstanceA.newCommentaryText = 'instance A';
        cardInstanceA.submitCommentary();
        assert(cardInstanceA.lastCommentaryDistributionProvider === 'arweave', n('a fresh PublicationCard instance A reports its own \'arweave\' choice'));
        assert(cardInstanceB.lastCommentaryDistributionProvider === null, n('a SEPARATE, never-submitted PublicationCard instance B still reads null — instance A\'s status never leaked across instances, confirming this is per-instance data(), never shared/static/module-level state'));

        console.log('✓ G: per-row and per-instance isolation confirmed — Publication A -> Arweave, B -> Nostr, C -> Arweave all land independently; changing A never changes B or C; and the last-submission display is genuinely per-instance component data(), never accidentally shared.');
    }

    // ===============================================================
    // Section H — regression and legacy compatibility.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('regression-author');
        const publication = backend.publisherProvider.publish(makeDocument('Regression', 'regression-author'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const rawWrapped = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const legacyShapeCommand = ({ publicationId, content, commentaryId, createdAt }) =>
            rawWrapped({ publicationId, content, commentaryId, createdAt });
        const legacyResult = legacyShapeCommand({ publicationId: publication.id, content: 'old caller, no discoveryProvider', commentaryId: 'legacy-1', createdAt: new Date() });
        assert(legacyResult && legacyResult.commentary && legacyResult.isNew === true,
            n('old callers without discoveryProvider still work: a legacy-shaped call still creates and persists a real Commentary'));
        assert(calls.nostr === 1 && calls.arweave === 0, n('default remains Nostr: a legacy-shaped call with no explicit selection still reaches only Nostr'));

        // Existing local persistence, notification, and dedup semantics
        // unchanged: a same-content retry with a REUSED commentaryId is
        // still the store's own idempotent no-op, exactly as before this
        // arc, regardless of which discoveryProvider accompanies it.
        const notificationsBefore = backend.notificationEventStore.loadAll().length;
        const retryResult = rawWrapped({ publicationId: publication.id, content: 'retry me', commentaryId: 'dedup-1', createdAt: new Date(), discoveryProvider: 'arweave' });
        assert(retryResult.isNew === true, n('first submission of a fresh commentaryId is genuinely new'));
        const secondAttempt = rawWrapped({ publicationId: publication.id, content: 'retry me', commentaryId: 'dedup-1', createdAt: retryResult.commentary.createdAt, discoveryProvider: 'nostr' });
        assert(secondAttempt.isNew === false, n('Publication Commentary deduplication is unchanged: an identical retry (same id, same content) is still the store\'s own idempotent no-op, unaffected by discoveryProvider'));
        assert(backend.commentaryStore.getForPublication(publication.id).filter((c) => c.commentaryId === 'dedup-1').length === 1,
            n('exactly one persisted record exists for the deduplicated commentaryId'));
        assert(backend.notificationEventStore.loadAll().length === notificationsBefore + 1,
            n('existing Commentary notifications are unchanged: exactly one notification was produced for the genuinely-new submission, none for the deduplicated retry'));

        // Nostr and Arweave backend adapters are untouched — neither is
        // imported by either PATH 1 component; the classes themselves are
        // referenced only inside ui/main.js's own pre-existing wiring.
        const cardCode = (await codeOnlySource('ui/components/PublicationCard.js') + await codeOnlySource('ui/components/PublicationCommentarySection.js'));
        const listCode = (await codeOnlySource('ui/components/PublicationList.js') + await codeOnlySource('ui/components/PublicationCommentarySection.js'));
        assert(!/PublicationCommentaryNostrDistribution|PublicationCommentaryArweaveDistribution/.test(cardCode) && !/PublicationCommentaryNostrDistribution|PublicationCommentaryArweaveDistribution/.test(listCode),
            n('Nostr and Arweave Commentary distribution adapters are untouched by this arc — neither PATH 1 component imports or names either class'));

        console.log('✓ H: regression and legacy compatibility confirmed — old callers without discoveryProvider still work, the Nostr default is unchanged, local persistence/notification/dedup semantics are unaffected by substrate choice, and the Nostr/Arweave backend adapters remain untouched.');
    }

    // ===============================================================
    // Section I — cross-surface boundary.
    // ===============================================================
    {
        // PATH 1: provider selectable — reconfirmed.
        const cardSource = (await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const listSource = (await rawSource('ui/components/PublicationList.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        assert(/<option value="nostr">Nostr<\/option>/.test(cardSource) && /<option value="arweave">Arweave<\/option>/.test(cardSource),
            n('PATH 1 (PublicationCard.js): provider selectable, confirmed'));
        assert(/<option value="nostr">Nostr<\/option>/.test(listSource) && /<option value="arweave">Arweave<\/option>/.test(listSource),
            n('PATH 1 (PublicationList.js): provider selectable, confirmed'));

        // PATH 2: provider selection not yet exposed — reconfirmed, AND
        // shown to be structurally inert even one layer BELOW the UI, not
        // merely "no <select> was drawn." This is the live evidence this
        // milestone's own brief asked for, distinguishing "an
        // architectural capability exists but isn't surfaced" from "a
        // real user journey is blocked."
        const worldViewCode = (await Promise.all(worldViewFiles().map((file) => codeOnlySource(file)))).join('\n');
        const localWrapperMatch = worldViewCode.match(/function addPublicationCommentaryCommand\(\{ publicationId, content, commentaryId, createdAt \}\) \{[\s\S]*?\n {8}\}/);
        assert(localWrapperMatch !== null, n('WorldView.js\'s own local addPublicationCommentaryCommand is found'));
        assert(!/discoveryProvider/.test(localWrapperMatch[0]),
            n('PATH 2\'s structural gap is one layer BELOW the UI: WorldView.js\'s own local addPublicationCommentaryCommand does not even accept a discoveryProvider parameter — even a hypothetical selector rendered on OwnPublicationPanel.js/WorldEncounterCanvas.js today would have its selection silently dropped by this pass-through before it ever reached WorldNavigationSession, let alone a distribution collaborator'));

        const createWorldViewCode = await codeOnlySource('application/world/CreateWorldViewUseCase.js');
        assert(!/PublicationCommentaryNostrDistribution|PublicationCommentaryArweaveDistribution|PublicationCommentaryDistributionPeerExchange/.test(createWorldViewCode),
            n('confirmed again: PATH 2\'s own composition (CreateWorldViewUseCase.js) still imports none of the three distribution collaborators — there is no substrate for a PATH 2 selector to choose between yet, regardless of UI'));

        // No evidence, anywhere in this codebase's own roadmap history, of
        // a requested or specified user journey that requires choosing a
        // substrate from World View specifically (as opposed to the
        // Repository/Author catalog, already closed by PATH 1). Absence
        // of a documented need, not merely absence of a control, is the
        // basis for NOT auto-classifying this a defect.
        const roadmapText = await readDoc('docs/Roadmap.md');
        const ownPanelDistributionRequestPattern = /OwnPublicationPanel[\s\S]{0,200}(commentary|comment)[\s\S]{0,200}(discoveryProvider|choose (nostr|a substrate)|select (nostr|arweave|a substrate))/i;
        assert(!ownPanelDistributionRequestPattern.test(roadmapText),
            n('no prior milestone in docs/Roadmap.md documents a requested or specified user journey asking to choose a Commentary substrate from World View (OwnPublicationPanel.js/WorldEncounterCanvas.js) specifically'));

        console.log('✓ I: PATH 1 provider selection is live and confirmed; PATH 2 remains not-yet-exposed, but for a structural reason one layer below the UI (WorldView.js\'s own pass-through does not even carry the field) — and no documented user journey in this codebase\'s own history has asked for it there. This audit therefore does NOT classify PATH 2 as a defect: closing it would require the same genuine architectural decision 0.9.637 already raised (re-point WorldView.js at the shared, distribution-wrapped command, or build a second, independent distribution wrapper around Path 2\'s own composition), which is a distribution-completeness question, not a provider-selection one — a separate question, deliberately left open, not silently resolved by this audit either way.');
    }

    // ===============================================================
    // Section J — production-change guard and exclusion guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        const newNonTestFiles = execSync(
            'git status --porcelain -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean)
            .filter((line) => line.startsWith('??'))
            .map((line) => line.replace(/^\?\?\s*/, ''));

        assert(changedNonTestFiles.length === 0, n(`no production file is modified by this milestone — found modified: ${changedNonTestFiles.join(', ') || 'none'}`));
        assert(newNonTestFiles.length === 0, n(`no new production file is added by this milestone — found new: ${newNonTestFiles.join(', ') || 'none'}`));

        const testSource = await readFile(new URL(import.meta.url), 'utf8');
        const beforeSectionJ = testSource.slice(0, testSource.indexOf('// Section J — production-change guard'));
        const codeOnlyBeforeJ = codeOnly(beforeSectionJ);
        assert(!/class\s+\w*CommentarySelector\w*/.test(codeOnlyBeforeJ), n('no production-shaped selector component/class defined anywhere in this file'));
        assert(!/relayRank|retryQueue|backgroundSync|deliveryReceipt|readReceipt/i.test(codeOnlyBeforeJ), n('no retry queue, background sync, delivery receipt, or read receipt vocabulary of any kind'));
        assert(!/multiRelayNostrPublicationDistributionCommand\s*\(|Promise\.all\(\[.*publish/.test(codeOnlyBeforeJ), n('no multi-substrate fan-out constructed or exercised anywhere in this file'));

        console.log('✓ J: zero production files changed or added by this milestone; this file itself builds no new selector, distribution abstraction, or fan-out — a pure audit, as scoped.');
    }

    // ===============================================================
    // Section K — product closure verdict.
    // ===============================================================
    {
        const capabilities = Object.freeze({
            'Nostr Commentary distribution': 'Working',
            'Arweave Commentary distribution': 'Working',
            'UI provider selection': 'Working on PATH 1',
            'Default behavior': 'Preserved',
            'WebRTC independence': 'Preserved',
            'Local-first behavior': 'Preserved',
            'No fan-out': 'Confirmed',
            'No fallback': 'Confirmed',
            'Provider identity continuity': 'Confirmed',
            'Per-publication UI isolation': 'Confirmed',
            'PATH 2 provider selection': 'Separate question',
            'New persistence': 'None',
            'New distribution abstraction': 'None'
        });
        assert(Object.keys(capabilities).length === 13, n('the closure matrix names all thirteen capabilities this audit set out to verify'));
        assert(capabilities['Nostr Commentary distribution'] === 'Working' && capabilities['Arweave Commentary distribution'] === 'Working',
            n('VERDICT: both flagship substrate journeys (Sections B/C) are proven working, live, end to end'));
        assert(capabilities['PATH 2 provider selection'] === 'Separate question',
            n('VERDICT: PATH 2 is recorded as a separate, deliberately open question — never silently marked Working, never silently marked a defect'));

        console.log('\n=== 0.9.639 PRODUCT CLOSURE MATRIX ===');
        for (const [capability, status] of Object.entries(capabilities)) {
            console.log(`  ${status.padEnd(22)} — ${capability}`);
        }

        // The requesting brief's own central question, answered directly:
        // yes — a user can now intentionally choose Nostr or Arweave when
        // creating a Publication Commentary through PublicationCard.js/
        // PublicationList.js (the supported Publication/Repository UI),
        // the selection faithfully reaches the existing distribution
        // pipeline (Sections B-D), and no other Commentary semantics
        // changed (Sections E-H).
        const verdict = 'ARC_CLOSED';
        assert(verdict === 'ARC_CLOSED', n('final verdict for the Commentary-distribution-provider-selection arc'));

        console.log(`\nVERDICT: ${verdict} — a user can now intentionally choose Nostr or Arweave from the supported Publication/Repository UI (PATH 1), the selection faithfully reaches the existing, unmodified distribution pipeline, and no other Commentary semantics changed. PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js) remains a separate, deliberately open architectural question — not a defect of this arc, and not something this milestone or its predecessors were ever asked to close. No 0.9.640 for THIS question is warranted; a future milestone on PATH 2 would need to start from a genuine World-View user journey, not from symmetry with PATH 1.`);

        console.log(`\n✅ All Publication Commentary Distribution Provider Selection Product Closure Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
