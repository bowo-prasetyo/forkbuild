import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.542 — Publication Commentary Submission Experience Product
// Reassessment.
//
// 0.9.539/0.9.540/0.9.541 asked, in turn: can a Wanderer PERCEIVE which
// Publication is which; does every catalog ACTION target the exact
// Publication clicked; and does Commentary itself preserve identity and
// lifecycle semantics under adversarial identity-collision conditions.
// 0.9.541's own Section D live-exercised the store's commentaryId-keyed
// idempotent retry — but only by calling AddPublicationCommentaryUseCase
// directly with an explicit `commentaryId`, never through the three real
// UI submit paths, none of which ever passed one. This milestone asks the
// narrower, final question: DOES THE UI TELL THE TRUTH ABOUT THE MUTATION
// IT JUST PERFORMED — and does a manual retry after an ambiguous failure
// ever produce a misleading duplicate?
//
// Investigating that question live found a real, previously-unexercised
// gap: OwnPublicationPanel.js/PublicationCard.js/WorldEncounterCanvas.js
// each minted a brand-new random commentaryId on every submit call,
// including a manual retry of an unedited draft after an error. Because
// PublicationCommentaryNotificationProducer.js's own 0.9.275 header
// already documents that a notificationSink failure propagates AFTER the
// commentary is already durably persisted, a Wanderer who saw an error
// and retried the identical text was — before this milestone's own
// production fix — creating a second, visible, genuinely duplicate
// PublicationCommentary record, never recognized as the SAME attempt.
//
// THE FIX (application/WorldNavigationSession.js,
// application/CreatePublicationCommentaryUseCase.js, ui/views/WorldView.js,
// and the three UI components) wires the commentaryId/createdAt
// AddPublicationCommentaryUseCase already accepted (0.9.244, unmodified)
// all the way through: each of the three UI components now tracks
// `pendingCommentaryDraft`/`pendingEncounterCommentaryDraft` — the stable
// id/timestamp for the CURRENT in-progress compose attempt — reusing it
// across consecutive retries of byte-identical content, and minting a
// fresh one the moment the draft's own text changes. No new identity
// mechanism: commentaryId/createdAt are the exact fields
// AddPublicationCommentaryUseCase/PublicationCommentaryStore already
// defined; this milestone only wires callers to actually use them.
//
// PublicationCommentaryNotificationProducer.js itself needed NO change —
// see its own 0.9.542 header for why gating notification construction on
// `isNew` would have been a second, redundant dedup mechanism layered in
// front of NotificationEventStore's own already-tested deduplication-
// identity check (tests/PublicationCommentaryCrossSurfaceConvergenceAudit.test.js
// Section F already proves a retried, logically-identical event resolves
// to EXISTING, not a duplicate, entirely independent of this milestone).
//
// Section A — Submission action inventory (fresh, not assumed).
// Section B — Success semantics: store succeeds -> success presentation,
//             never "request initiated -> shown as posted -> actually
//             failed."
// Section C — Failure semantics: a rejected attempt is distinguishable
//             from a successful one and never corrupts prior state; no
//             new outcome vocabulary is introduced.
// Section D — FLAGSHIP FIX: retry after an ambiguous/failure boundary is
//             idempotent, never a misleading duplicate; editing the draft
//             before retrying still produces a genuinely new comment; no
//             automatic retry exists anywhere in the pipeline.
// Section E — Stale UI state: a Publication/selection change invalidates
//             any pending retry draft; the pipeline's own synchronous
//             execution structurally forecloses the async-race shape the
//             requesting brief described.
// Section F — Cross-surface consistency: identical success/failure/retry
//             semantics on all three real surfaces.
// Section G — Mutation/read boundary: viewing never mutates; submitting
//             is the one write.
// Section H — Flagship adversarial scenario: two Publications, interleaved
//             submissions, a retry on one never touching the other; the
//             identical scenario repeated with byte-identical content
//             across two genuinely different Publications.
//
// Deliberately excluded, per the requesting brief: comment editing or
// deletion, moderation, voting/reactions, threading, ranking, a
// notification-generation change, automatic retry, an offline queue, a
// synchronization protocol, a new mutation framework, a new identity
// mechanism, a new navigation mechanism, and any UI redesign. None of
// these appear below.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePublisher(storage, identityProvider) {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    return { publisher, publishDocumentUseCase: new PublishDocumentUseCase(publisher, identityProvider, null, null) };
}

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

// The real write/read stack every real UI surface reaches through
// (WorldNavigationSession for OwnPublicationPanel/WorldEncounterCanvas,
// application/CreatePublicationCommentaryUseCase.js for PublicationCard)
// — reproduced here with an injectable notificationSink so an ambiguous
// (persisted-but-reported-as-failed) submission can be exercised live,
// exactly the shape 0.9.275/0.9.541 already established this failure
// mode takes.
function makeBackend({ notificationSink } = {}) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const notificationEventStore = new NotificationEventStore(storage);
    const commentaryStore = new PublicationCommentaryStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canCommentOnPublicationUseCase);
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        discoveryProvider,
        notificationSink || ((event) => notificationEventStore.save(event))
    );

    function getPublicationCommentariesCommand(publicationId) {
        if (!publicationId) return [];
        return getPublicationCommentariesUseCase.execute({ publicationId });
    }
    // The REAL, current (0.9.542) contract: forwards commentaryId/createdAt
    // exactly like WorldView.js's/CreatePublicationCommentaryUseCase.js's
    // own addPublicationCommentaryCommand now does.
    function addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) {
        return publicationCommentaryCapability.execute({ publicationId, content, commentaryId, createdAt });
    }

    const { publisher, publishDocumentUseCase } = makePublisher(storage, identityProvider);
    return {
        storage, identityProvider, discoveryProvider, commentaryStore, notificationEventStore,
        publisher, publishDocumentUseCase,
        getPublicationCommentariesCommand, addPublicationCommentaryCommand
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        viewerIdentityId: null,
        publicationCommentaries: [],
        newCommentaryText: '',
        publicationCommentarySubmitting: false,
        publicationCommentaryError: null,
        pendingCommentaryDraft: null,
        refreshPublicationCommentaries: OwnPublicationPanel.methods.refreshPublicationCommentaries,
        submitPublicationCommentary: OwnPublicationPanel.methods.submitPublicationCommentary,
        ...overrides
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

function canvasCtx(overrides = {}) {
    const ctx = {
        view: overrides.view !== undefined ? overrides.view : WorldEncounterCanvas.props.view.default(),
        registry: null,
        selectedEncounter: null,
        resolvedSelectionChoice: null,
        resolvedLeadChoice: null,
        worldDiscoveryLeadRegistry: null,
        decentralizedLeadOutcome: null,
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotAttributionResult: null,
        snapshotDiscoveryRequestId: 0,
        snapshotContentViewOpen: false,
        contentComparisonViewOpen: false,
        armedForComparisonSelection: false,
        materialInspection: null,
        materialInspectionRequestId: 0,
        materialSources: null,
        materialVerifier: null,
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        viewerIdentityId: null,
        encounterCommentaryOpen: false,
        encounterCommentaries: [],
        newEncounterCommentaryText: '',
        encounterCommentarySubmitting: false,
        encounterCommentaryError: null,
        pendingEncounterCommentaryDraft: null,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        toggleEncounterCommentary: WorldEncounterCanvas.methods.toggleEncounterCommentary,
        refreshEncounterCommentaries: WorldEncounterCanvas.methods.refreshEncounterCommentaries,
        submitEncounterCommentary: WorldEncounterCanvas.methods.submitEncounterCommentary,
        ...overrides
    };
    Object.defineProperty(ctx, 'effectiveView', {
        get() { return WorldEncounterCanvas.computed.effectiveView.call(ctx); }
    });
    Object.defineProperty(ctx, 'selectedEncounterInspection', {
        get() { return WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx); }
    });
    Object.defineProperty(ctx, 'encounterCommentaryPublicationId', {
        get() { return WorldEncounterCanvas.computed.encounterCommentaryPublicationId.call(ctx); }
    });
    return ctx;
}

function viewOf({ publications = [], avatars = [] } = {}) {
    const totalCount = publications.length + avatars.length;
    return { isEmpty: totalCount === 0, publicationCount: publications.length, avatarCount: avatars.length, totalCount, publications, avatars };
}

function publicationRow(publication, overrides = {}) {
    return {
        objectId: publication.id,
        title: publication.title,
        publisherIdentity: publication.publisherIdentity,
        isSigned: !!publication.signature,
        x: 1, y: 0, z: 2,
        anchorCount: 0,
        placementCount: 0,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ===============================================================
    // Section A — Submission action inventory. No new paths.
    // ===============================================================
    let panelSource, cardSource, canvasSource;
    {
        panelSource = await readSource('ui/components/OwnPublicationPanel.js');
        // The card view's submit path now lives in the shared
        // PublicationCommentarySection.js the card mounts.
        cardSource = await readSource('ui/components/PublicationCard.js') + await readSource('ui/components/PublicationCommentarySection.js');
        canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/submitPublicationCommentary\(\)\s*\{/.test(panelSource)
            && /submitCommentary\(\)\s*\{/.test(cardSource)
            && /submitEncounterCommentary\(\)\s*\{/.test(canvasSource),
            '1. FRESH INVENTORY: the three real commentary submit paths — OwnPublicationPanel.submitPublicationCommentary(), PublicationCard\'s submitCommentary() (now in the shared PublicationCommentarySection.js it mounts), WorldEncounterCanvas.submitEncounterCommentary() — still exist, unrenamed, and are the only ones this milestone touches.');
        assert((cardSource.match(/submitCommentary\(\)\s*\{/g) || []).length === 1
            && (panelSource.match(/submitPublicationCommentary\(\)\s*\{/g) || []).length === 1
            && (canvasSource.match(/submitEncounterCommentary\(\)\s*\{/g) || []).length === 1,
            '2. Each submit method is still defined exactly once per file — no second write path was introduced.');
    }
    console.log('✓ Section A: exactly the three pre-existing submit paths — no new one introduced.');

    // ===============================================================
    // Section B — Success semantics: store succeeds -> success
    // presentation, never a false-positive "posted" before persistence.
    // ===============================================================
    {
        const { identityProvider, publisher, publishDocumentUseCase, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend();
        identityProvider.login('alice');
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section B', 'alice') });

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'a real success';
        ctx.submitCommentary();

        assert(commentaryStore.getForPublication(publication.id).length === 1,
            '1. LIVE: the success presentation corresponds to an ACTUAL persisted record — the store, not merely UI state, shows exactly one.');
        assert(ctx.commentaryError === null && ctx.newCommentaryText === '',
            '2. success presentation: error cleared, draft cleared — never "request initiated" language shown before the write is known to have happened (this call is synchronous: it never returns to the caller until the write already has).');
        assert(ctx.commentaries.length === 1 && ctx.commentaries[0].content === 'a real success',
            '3. the re-queried, displayed list reflects the exact persisted record — never a locally-synthesized optimistic entry.');
        assert(ctx.pendingCommentaryDraft === null,
            '4. the retry-tracking draft is cleared on success — nothing is left around to be (mis)reused by a later, unrelated submission.');
    }
    console.log('✓ Section B: a successful submission\'s presentation corresponds exactly to an actual persisted record, on the SAME synchronous call — never "shown as posted" ahead of the write actually landing.');

    // ===============================================================
    // Section C — Failure semantics: distinguishable from success, never
    // corrupts prior state. No new outcome vocabulary is introduced —
    // this section confirms the existing distinctions, it does not add
    // any.
    // ===============================================================
    {
        const { identityProvider, publishDocumentUseCase, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend();
        identityProvider.login('bob');
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section C', 'bob') });

        // C1 — validation failure (blank content): never even reaches the
        // command, never sets an error, never submits.
        const ctxBlank = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctxBlank.newCommentaryText = '   ';
        ctxBlank.submitCommentary();
        assert(ctxBlank.commentaryError === null && !ctxBlank.pendingCommentaryDraft && commentaryStore.getForPublication(publication.id).length === 0,
            '1. C1 VALIDATION: whitespace-only content is refused client-side, before the command is ever called — no error text needed because nothing was attempted.');

        // C2 — a genuine storage failure surfaces distinctly, and never
        // corrupts commentaries already displayed.
        const ctxSeeded = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctxSeeded.newCommentaryText = 'already here';
        ctxSeeded.submitCommentary();
        ctxSeeded.refreshCommentaries();
        assert(ctxSeeded.commentaries.length === 1, 'sanity: one real commentary exists before the failure below.');

        const ctxFail = cardCtx({
            publication,
            getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: () => { throw new Error('storage unavailable'); }
        });
        ctxFail.commentaries = ctxSeeded.commentaries;
        ctxFail.newCommentaryText = 'this one fails';
        ctxFail.submitCommentary();
        assert(ctxFail.commentaryError === 'storage unavailable' && ctxFail.newCommentaryText === 'this one fails',
            '2. C2 STORAGE FAILURE: the failure\'s own message reaches commentaryError, and the unsent draft is preserved — never silently discarded.');
        assert(ctxFail.commentaries.length === 1,
            '3. C2: the already-displayed list is untouched by the failed attempt — a rejected write never corrupts prior state.');

        // C3 — unresolvable Publication / unauthorized identity: a
        // real AddPublicationCommentaryUseCase denial (no signed-in
        // identity) is distinguishable from validation and storage
        // failure by its own message, never silently reclassified.
        identityProvider.logout?.();
        const ctxNoAuth = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctxNoAuth.newCommentaryText = 'nobody is signed in';
        ctxNoAuth.submitCommentary();
        assert(/sign in/i.test(ctxNoAuth.commentaryError || ''),
            '4. C3 AUTH FAILURE: a missing signed-in identity is reported distinctly ("sign in..."), never conflated with a generic storage failure.');
        assert(commentaryStore.getForPublication(publication.id).length === 1,
            '5. C3: the denied attempt persisted nothing — still exactly the one earlier, genuinely successful commentary.');

        // C4 — success is never presented after any of the three
        // failures above; the distinctions are real, not merely three
        // different strings for one underlying state.
        assert(ctxBlank.commentaryError !== ctxFail.commentaryError, '6. blank-content and storage-failure states remain textually distinct — no shared, ambiguous "something went wrong" catch-all.');
    }
    console.log('✓ Section C: validation failure (never even attempted), storage failure (attempted, rejected, message surfaced, prior state intact), and authentication failure (attempted, denied, distinct message) remain three genuinely distinguishable outcomes — no new vocabulary was introduced to achieve this; the existing three already do.');

    // ===============================================================
    // Section D — FLAGSHIP FIX: retry after an ambiguous/failure
    // boundary is idempotent; an edited retry is a genuinely new
    // comment; no automatic retry exists.
    // ===============================================================
    {
        // D1 — the ambiguous case this milestone's own brief names:
        // AddPublicationCommentaryUseCase.execute() already succeeded
        // (the commentary IS on file) but notificationSink throws
        // AFTER that, so the whole call still throws and the UI still
        // reports failure — per PublicationCommentaryNotificationProducer.js's
        // own 0.9.275 header, "a notification sink failure never undoes
        // the already-persisted commentary."
        let sinkShouldFail = true;
        const { identityProvider, publishDocumentUseCase, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend({
            notificationSink: () => { if (sinkShouldFail) { throw new Error('notification relay unavailable'); } }
        });
        identityProvider.login('carol');
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section D', 'carol') });

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'ambiguous first attempt';
        ctx.submitCommentary();
        assert(ctx.commentaryError === 'notification relay unavailable',
            '1. D1: the first attempt is reported as a failure to the Wanderer — the UI has no way yet to know the write actually succeeded.');
        assert(commentaryStore.getForPublication(publication.id).length === 1,
            '2. D1, THE HIDDEN TRUTH: despite the reported failure, the commentary is ALREADY durably persisted — exactly the gap this milestone closes visibility into.');
        assert(ctx.newCommentaryText === 'ambiguous first attempt',
            '3. D1: the draft is preserved after the failure, ready for the Wanderer to retry it unedited.');

        // The Wanderer, unaware the first attempt actually succeeded,
        // clicks Comment again with the SAME, unedited text.
        sinkShouldFail = false;
        ctx.submitCommentary();
        assert(ctx.commentaryError === null,
            '4. D1, THE FIX: the retry now SUCCEEDS (the sink recovers) and is recognized as the store\'s own idempotent no-op — never a second attempt colliding as a conflict.');
        assert(commentaryStore.getForPublication(publication.id).length === 1,
            '5. D1, THE FLAGSHIP ASSERTION: exactly ONE commentary record exists after the retry — never a visible, misleading duplicate. Before this milestone\'s own production fix, this would have been 2 (a fresh random commentaryId on every submit call).');
        assert(ctx.commentaries.some((c) => c.content === 'ambiguous first attempt') && ctx.commentaries.length === 1,
            '6. D1: the re-queried, displayed list shows exactly the one comment — never two entries for what the Wanderer experienced as one action.');

        // D2 — even a retry that ALSO fails a second time (sink still
        // down) stays idempotent — no duplicate is ever created merely
        // by repeated retrying of unedited content.
        sinkShouldFail = true;
        const ctx2 = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx2.newCommentaryText = 'repeatedly ambiguous';
        ctx2.submitCommentary();
        ctx2.submitCommentary();
        ctx2.submitCommentary();
        assert(commentaryStore.getForPublication(publication.id).filter((c) => c.content === 'repeatedly ambiguous').length === 1,
            '7. D2: three consecutive submit attempts with unedited, byte-identical content and a persistently-failing sink still produce exactly ONE persisted record — idempotency holds under repeated manual retry, not just a single one.');

        // D3 — editing the draft before retrying is a genuinely NEW
        // comment, never blocked or silently merged with the earlier
        // failed/ambiguous attempt.
        sinkShouldFail = false;
        const ctx3 = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand: () => { throw new Error('down'); } });
        ctx3.newCommentaryText = 'first draft';
        ctx3.submitCommentary();
        assert(ctx3.commentaryError === 'down', 'sanity: the first attempt genuinely failed and persisted nothing (a real throw, not the ambiguous case).');
        ctx3.addPublicationCommentaryCommand = addPublicationCommentaryCommand;
        ctx3.newCommentaryText = 'edited draft, different comment';
        ctx3.submitCommentary();
        assert(ctx3.commentaryError === null,
            '8. D3: the edited retry succeeds.');
        assert(commentaryStore.getForPublication(publication.id).some((c) => c.content === 'edited draft, different comment')
            && !commentaryStore.getForPublication(publication.id).some((c) => c.content === 'first draft'),
            '9. D3: editing the draft before retrying mints a fresh commentaryId — the persisted record is the EDITED content, never a phantom of the abandoned, never-persisted first draft, and never blocked by it.');

        // D4 — no automatic retry exists anywhere in the pipeline: a
        // failed submit performs no scheduled re-attempt of its own.
        assert(!/setTimeout|setInterval|requestAnimationFrame/.test(codeOnlyLines(cardSource))
            && !/setTimeout|setInterval|requestAnimationFrame/.test(codeOnlyLines(panelSource))
            && !/setTimeout|setInterval|requestAnimationFrame/.test(codeOnlyLines(canvasSource)),
            '10. D4 STRUCTURAL: none of the three UI surfaces schedules ANY deferred call (no setTimeout/setInterval/requestAnimationFrame exists in any of them) — a retry is, and remains, exclusively a Wanderer\'s own explicit second click. This milestone adds idempotent-retry SAFETY, never automatic retry BEHAVIOR.');
    }
    console.log('✓ Section D — FLAGSHIP FIX: a manual retry of an unedited draft after an ambiguous (persisted-but-reported-failed) submission is now genuinely idempotent — one record, not two — and holds under repeated retrying; an EDITED retry still produces a genuinely new, separate comment; and no automatic retry exists anywhere in the pipeline.');

    // ===============================================================
    // Section E — Stale UI state: a context change invalidates any
    // pending retry draft; the pipeline is structurally synchronous, so
    // the async-race shape the requesting brief described cannot occur.
    // ===============================================================
    {
        // E1 — structural: every real call site of addPublicationCommentaryCommand
        // is a plain, unawaited call — no `await`/`.then(` guards it — so
        // by the time submitCommentary()/submitPublicationCommentary()/
        // submitEncounterCommentary() RETURN, the write (success or
        // throw) has already fully happened; there is no interleaving
        // window in which a context switch could land a stale result.
        for (const [name, source] of [['PublicationCard.js', cardSource], ['OwnPublicationPanel.js', panelSource], ['WorldEncounterCanvas.js', canvasSource]]) {
            assert(!/await this\.addPublicationCommentaryCommand|this\.addPublicationCommentaryCommand\([^)]*\)\s*\.then/.test(source),
                `1. ${name}: addPublicationCommentaryCommand is called synchronously — no await, no .then() — so this component's own JS never yields the event loop between "capture which Publication this submission targets" and "the write already happened."`);
        }

        // E2 — LIVE: OwnPublicationPanel's publication watcher clears
        // pendingCommentaryDraft exactly where it already clears every
        // other per-Publication ephemeral field.
        const { identityProvider, publishDocumentUseCase, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({
            notificationSink: () => { throw new Error('down'); }
        });
        identityProvider.login('dana');
        const pubA = publishDocumentUseCase.execute({ document: makeDocument('Stale A', 'dana') });
        const pubB = publishDocumentUseCase.execute({ document: makeDocument('Stale B', 'dana') });

        const ctx = panelCtx({ publication: pubA, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'left pending on A';
        ctx.submitPublicationCommentary();
        assert(ctx.pendingCommentaryDraft !== null, 'sanity: A\'s own failed attempt left a pending retry draft behind.');

        // Simulate the Wanderer navigating to Publication B — the SAME
        // reset OwnPublicationPanel.js's own `watch: { publication(...) }`
        // performs live.
        OwnPublicationPanel.watch.publication.call(ctx, pubB, pubA);
        assert(ctx.pendingCommentaryDraft === null,
            '2. E2 LIVE: switching to Publication B clears A\'s own pending retry draft — B\'s later submission can never accidentally reuse A\'s commentaryId.');

        // E3 — LIVE: the same reset on WorldEncounterCanvas's own
        // selection change.
        const canvasBackend = makeBackend();
        canvasBackend.identityProvider.login('erin');
        const encPub = canvasBackend.publishDocumentUseCase.execute({ document: makeDocument('Stale Encounter', 'erin') });
        const canvasView = viewOf({ publications: [publicationRow(encPub)] });
        const ctxCanvas = canvasCtx({ view: canvasView, getPublicationCommentariesCommand: canvasBackend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: canvasBackend.addPublicationCommentaryCommand });
        ctxCanvas.selectEncounter({ kind: 'PUBLICATION', objectId: encPub.id });
        ctxCanvas.newEncounterCommentaryText = 'left pending on the encounter';
        ctxCanvas.addPublicationCommentaryCommand = () => { throw new Error('down'); };
        ctxCanvas.submitEncounterCommentary();
        assert(ctxCanvas.pendingEncounterCommentaryDraft !== null, 'sanity: the failed encounter attempt left a pending retry draft behind.');
        ctxCanvas.selectEncounter(null);
        assert(ctxCanvas.pendingEncounterCommentaryDraft === null,
            '3. E3 LIVE: a fresh (or cleared) encounter selection clears the prior selection\'s own pending retry draft, mirroring OwnPublicationPanel\'s own E2 reset one surface over.');
    }
    console.log('✓ Section E: the pipeline\'s own synchronous execution structurally forecloses the async-race shape described (no await/.then anywhere on the write call); and, live, both OwnPublicationPanel and WorldEncounterCanvas reset any pending retry draft on exactly the same context-change events that already reset every other per-Publication/per-selection ephemeral field.');

    // ===============================================================
    // Section F — Cross-surface consistency: identical retry semantics
    // on all three real surfaces, without duplicating business logic
    // (every surface delegates to the SAME AddPublicationCommentaryUseCase).
    // ===============================================================
    {
        let sinkShouldFail = true;
        const { identityProvider, publishDocumentUseCase, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend({
            notificationSink: () => { if (sinkShouldFail) throw new Error('down'); }
        });
        identityProvider.login('frank');
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section F', 'frank') });

        const panel = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        panel.newCommentaryText = 'via panel';
        panel.submitPublicationCommentary();
        assert(panel.publicationCommentaryError === 'down', '1. OwnPublicationPanel: first attempt reported as failed, identically to PublicationCard\'s own Section D1.');
        sinkShouldFail = false;
        panel.submitPublicationCommentary();
        assert(panel.publicationCommentaryError === null && commentaryStore.getForPublication(publication.id).filter((c) => c.content === 'via panel').length === 1,
            '2. OwnPublicationPanel: the SAME idempotent-retry fix applies — one record, not two.');

        sinkShouldFail = true;
        const view = viewOf({ publications: [publicationRow(publication)] });
        const canvas = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        canvas.newEncounterCommentaryText = 'via encounter';
        canvas.submitEncounterCommentary();
        assert(canvas.encounterCommentaryError === 'down', '3. WorldEncounterCanvas: first attempt reported as failed, identically to the other two surfaces.');
        sinkShouldFail = false;
        canvas.submitEncounterCommentary();
        assert(canvas.encounterCommentaryError === null && commentaryStore.getForPublication(publication.id).filter((c) => c.content === 'via encounter').length === 1,
            '4. WorldEncounterCanvas: the SAME idempotent-retry fix applies — one record, not two.');

        assert(commentaryStore.getForPublication(publication.id).length === 2,
            '5. Exactly two DISTINCT comments exist (one per surface, each retried once) — proving the fix is not merely "the second submit always no-ops" but genuinely id-scoped per draft.');
    }
    console.log('✓ Section F: OwnPublicationPanel.js and WorldEncounterCanvas.js exhibit the identical retry-idempotency fix PublicationCard.js does — no per-surface duplication of the underlying logic, since all three delegate to the same AddPublicationCommentaryUseCase/PublicationCommentaryStore.');

    // ===============================================================
    // Section G — Mutation/read boundary: viewing never mutates;
    // submitting is the one write.
    // ===============================================================
    {
        const throwIfCalled = () => { throw new Error('should never be called by a read-only action'); };
        const { identityProvider, publishDocumentUseCase, getPublicationCommentariesCommand } = makeBackend();
        identityProvider.login('grace');
        const publication = publishDocumentUseCase.execute({ document: makeDocument('Section G', 'grace') });

        const card = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand: throwIfCalled });
        card.toggleCommentary();
        card.refreshCommentaries();
        assert(card.commentaryError === null, '1. opening the commentary section and refreshing it never calls the write command — merely viewing performed no mutation.');

        const panel = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand: throwIfCalled });
        panel.refreshPublicationCommentaries();
        assert(panel.publicationCommentaryError === null, '2. OwnPublicationPanel\'s own read never calls the write command either.');

        const view = viewOf({ publications: [publicationRow(publication)] });
        const canvas = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand: throwIfCalled });
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        canvas.toggleEncounterCommentary();
        assert(canvas.encounterCommentaryError === null, '3. selecting an encounter and opening its commentary section never calls the write command.');
    }
    console.log('✓ Section G: on all three surfaces, opening/toggling/refreshing commentary never reaches addPublicationCommentaryCommand — the read path is genuinely observational; submitCommentary()/submitPublicationCommentary()/submitEncounterCommentary() remain the ONLY call sites of the one write.');

    // ===============================================================
    // Section H — FLAGSHIP ADVERSARIAL SCENARIO.
    // ===============================================================
    {
        let sinkShouldFail = false;
        const { identityProvider, publishDocumentUseCase, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend({
            notificationSink: () => { if (sinkShouldFail) throw new Error('relay down'); }
        });
        identityProvider.login('helen');
        const pubA = publishDocumentUseCase.execute({ document: makeDocument('Flagship A', 'helen') });
        const pubB = publishDocumentUseCase.execute({ document: makeDocument('Flagship B', 'helen') });

        const ctxA = cardCtx({ publication: pubA, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        const ctxB = cardCtx({ publication: pubB, getPublicationCommentariesCommand, addPublicationCommentaryCommand });

        // Open Commentary A, submit comment A (ambiguous failure),
        // "catalog/selection changes to B" (interleave a real, unrelated
        // submission on B), THEN retry A.
        sinkShouldFail = true;
        ctxA.newCommentaryText = 'comment on A';
        ctxA.submitCommentary();
        assert(ctxA.commentaryError === 'relay down' && commentaryStore.getForPublication(pubA.id).length === 1,
            '1. A\'s ambiguous failure: reported failed, actually persisted — exactly Section D\'s own setup, now interleaved with B.');

        sinkShouldFail = false;
        ctxB.newCommentaryText = 'comment on B, unrelated';
        ctxB.submitCommentary();
        assert(ctxB.commentaryError === null && commentaryStore.getForPublication(pubB.id).length === 1 && commentaryStore.getForPublication(pubA.id).length === 1,
            '2. B\'s own, fully independent submission succeeds and neither reads nor writes anything under A — A\'s own ambiguous state is completely unaffected by B\'s activity in between.');

        ctxA.submitCommentary();
        assert(ctxA.commentaryError === null,
            '3. VERIFY comment -> A: A\'s own retry, submitted after B\'s own unrelated activity, still succeeds as A\'s own idempotent no-op.');
        assert(commentaryStore.getForPublication(pubA.id).length === 1,
            '4. VERIFY success/failure -> A\'s own action: exactly one A-comment exists — B\'s interleaved submission never merged into, duplicated, or otherwise affected A\'s own outcome.');
        assert(commentaryStore.getForPublication(pubB.id).length === 1 && commentaryStore.getForPublication(pubB.id)[0].content === 'comment on B, unrelated',
            '5. VERIFY B unchanged: B still shows exactly its own one, untouched comment.');

        // Repeat with byte-identical content across two genuinely
        // different Publications — never merged into one record, even
        // though the STORE's own dedup key is commentaryId-scoped and
        // these two calls use two DIFFERENT, independently-minted ids
        // (one per surface/draft), never a content-based or
        // contentHash-based key.
        const ctxA2 = cardCtx({ publication: pubA, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        const ctxB2 = cardCtx({ publication: pubB, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctxA2.newCommentaryText = 'identical wording';
        ctxB2.newCommentaryText = 'identical wording';
        ctxA2.submitCommentary();
        ctxB2.submitCommentary();
        assert(commentaryStore.getForPublication(pubA.id).filter((c) => c.content === 'identical wording').length === 1,
            '6. identical-content pair: A gets its own one copy.');
        assert(commentaryStore.getForPublication(pubB.id).filter((c) => c.content === 'identical wording').length === 1,
            '7. identical-content pair: B gets its own, entirely separate one copy — never deduplicated against A\'s merely because the text matches. Commentary identity is commentaryId/publicationId-scoped, never content-scoped.');
        assert(commentaryStore.getForPublication(pubA.id).find((c) => c.content === 'identical wording').commentaryId
            !== commentaryStore.getForPublication(pubB.id).find((c) => c.content === 'identical wording').commentaryId,
            '8. the two "identical wording" records carry two genuinely different commentaryId values — byte-identical CONTENT was never treated as a surrogate identity for anything.');
    }
    console.log('✓ Section H — FLAGSHIP: interleaving an unrelated Publication B\'s own submission between Publication A\'s ambiguous failure and A\'s own retry never contaminates either Publication\'s outcome; and byte-identical content submitted to two different Publications produces two independently-identified records, never a cross-Publication merge.');

    console.log('');
    console.log('VERDICT: SUBMISSION_EXPERIENCE_TRUTHFUL. Success presentation corresponds to an actual persisted record on the same synchronous call (Section B); failure semantics remain three genuinely distinguishable outcomes with no new vocabulary invented (Section C); a manual retry after an ambiguous failure is now genuinely idempotent — the one real production gap this milestone found and closed — without any automatic retry being introduced (Section D); the pipeline\'s synchronous execution forecloses the described stale-UI race structurally, and live context-change resets confirm it defensively (Section E); all three surfaces converge on the identical fix without duplicated logic (Section F); viewing never mutates (Section G); and the flagship interleaved-Publications and identical-content scenarios hold end to end (Section H).');
    console.log('');
    console.log('Per this milestone\'s own brief: if this comes back clean, the Publication Commentary arc should be considered closed — the recommendation from 0.9.541\'s own author stands. This reassessment found one real, narrow gap (retry idempotency was store-level-only, never UI-wired) and closed it with a small, targeted fix; it did not find, and did not invent, a reason to keep auditing this surface further.');
}

run().then(() => {
    console.log('\n✅ All Publication Commentary Submission Experience Product Reassessment tests passed.');
}).catch((error) => {
    console.error('\n❌ Publication Commentary Submission Experience Product Reassessment tests FAILED:', error.message);
    process.exitCode = 1;
    throw error;
});
