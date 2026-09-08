import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import PublicationCard from '../ui/components/PublicationCard.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { readFile } from 'node:fs/promises';

// 0.9.291 — Publication Commentary on the World Encounter Surface.
//
// 0.9.288's own Section E named SIX UI surfaces holding a full
// `Publication` object at render time yet carrying zero commentary
// vocabulary. 0.9.289 wired the first (PublicationCard.js, via a NEW
// standalone composition, application/CreatePublicationCommentaryUseCase.js).
// This milestone wires the second — ui/components/WorldEncounterCanvas.js,
// the component 0.9.290's own Section K named "a real 0.9.291 candidate" —
// through NEITHER a new composition NOR 0.9.289's app-wide one, but by
// handing it the SAME `getPublicationCommentariesCommand`/
// `addPublicationCommentaryCommand` functions ui/views/WorldView.js
// already builds (0.9.248) and already binds to OwnPublicationPanel — see
// WorldEncounterCanvas.js's own "0.9.291" header for the full reasoning.
//
// This file exercises the milestone's own suggested test scope (A-L)
// against REAL collaborators (LocalIdentityProvider, LocalDiscoveryProvider,
// LocalPublisherProvider, PublicationCommentaryStore, NotificationEventStore,
// and all four application use cases, unmodified) — never a mock of the
// application layer — with WorldEncounterCanvas.js's own lifecycle/
// computed/methods invoked the same "call bound to a plain ctx object"
// discipline every sibling WorldEncounterCanvas test file already
// establishes (see tests/WorldEncounterInspectionUI.test.js,
// tests/WorldViewPublicationDistributionActionIntegration.test.js) —
// never a full Vue mount.
//
// Section A: encounter rendering — the selected World Encounter already
//            carries the Publication (title/publisherIdentity) before any
//            commentary action is ever taken.
// Section B: commentary reachability — the Comment action is exposed only
//            when a caller wires getPublicationCommentariesCommand in, and
//            only for a live PUBLICATION encounter.
// Section C: lazy loading — selecting an encounter alone never reads
//            commentary; only the first toggle does.
// Section D: Publication identity — the exact encountered publicationId
//            (selectedEncounter.objectId) is what flows into both commands.
// Section E: authorship — the persisted commentary's author is the
//            AUTHENTICATED commentator, never the Publication's publisher.
// Section F: ownership independence — no UI ownership gate.
// Section G: authorization — CanCommentOnPublicationUseCase remains
//            authoritative; an unauthenticated attempt is rejected.
// Section H: persistence convergence — commentary created from a World
//            Encounter is retrievable through the SAME backend
//            PublicationCard.js reads through.
// Section I: notification convergence — the existing publication.commented
//            NotificationEvent still fires, addressed to the publisher.
// Section J: cross-surface isolation — commentary for encounter A never
//            leaks into encounter B, including across a fresh selection on
//            the SAME canvas instance.
// Section K: composition convergence — WorldEncounterCanvas.js constructs
//            no new use case, store, or composition root; WorldView.js
//            reuses its own already-existing commands for both surfaces.
// Section L: regression — OwnPublicationPanel.js/PublicationCard.js/
//            CreateWorldViewUseCase.js/CreatePublicationCommentaryUseCase.js
//            and the four still-unwired 0.9.288 surfaces stay untouched.

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

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

// The real application stack ui/views/WorldView.js's own
// getPublicationCommentariesCommand()/addPublicationCommentaryCommand()
// delegate to (via WorldNavigationSession, 0.9.248) — reproduced here with
// an injectable (in-memory) storage backend, the same reason
// tests/OtherPublicationCommentaryEntryPoint.test.js's own makeBackend()
// reproduces application/CreatePublicationCommentaryUseCase.js's own
// composition one file over. Either root wraps the identical, unmodified
// application layer, and this file's own Section K proves WorldEncounterCanvas.js
// constructs neither.
function makeBackend({ notificationSink } = {}) {
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
        commentaryStore,
        identityProvider,
        canCommentOnPublicationUseCase
    );
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        discoveryProvider,
        notificationSink || ((notificationEvent) => notificationEventStore.save(notificationEvent))
    );

    function getPublicationCommentariesCommand(publicationId) {
        if (!publicationId) return [];
        return getPublicationCommentariesUseCase.execute({ publicationId });
    }
    function addPublicationCommentaryCommand({ publicationId, content }) {
        return publicationCommentaryCapability.execute({ publicationId, content });
    }

    return {
        storage, identityProvider, publisherProvider, discoveryProvider,
        commentaryStore, notificationEventStore,
        getPublicationCommentariesCommand, addPublicationCommentaryCommand
    };
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

// The SAME "bind the real methods to a plain ctx object" discipline
// tests/WorldViewPublicationDistributionActionIntegration.test.js's own
// canvasCtx() already establishes — every field a fresh selection's own
// refresh* tail-calls could touch is present and inert (no registry/
// materialSources/distributionLifecycleStore/worldDiscoveryLeadRegistry
// injected), so this file controls `view`/commentary state directly.
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

function cardCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        commentaryOpen: false,
        commentaries: [],
        newCommentaryText: '',
        commentarySubmitting: false,
        commentaryError: null,
        toggleCommentary: PublicationCard.methods.toggleCommentary,
        refreshCommentaries: PublicationCard.methods.refreshCommentaries,
        submitCommentary: PublicationCard.methods.submitCommentary,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — Encounter rendering: the selected World Encounter
    // already carries the Publication's own identity before any
    // commentary action is taken.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section A', 'alice'), identityProvider);

        const view = viewOf({ publications: [publicationRow(publication)] });
        const ctx = canvasCtx({ view });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });

        assert(ctx.selectedEncounterInspection && ctx.selectedEncounterInspection.kind === 'PUBLICATION',
            '1. selecting the encounter yields a PUBLICATION inspection');
        assert(ctx.selectedEncounterInspection.title === publication.title,
            '2. the inspection already carries the Publication\'s own title, before any commentary action');
        assert(ctx.encounterCommentaryPublicationId === publication.id,
            '3. the encounter\'s own publicationId is already resolvable at render time');

        console.log('✓ Section A: the selected World Encounter already renders the Publication\'s own identity');
    }

    // ---------------------------------------------------------------
    // Section B — Commentary reachability: the action is exposed only
    // when a caller wires getPublicationCommentariesCommand in, and only
    // for a live PUBLICATION encounter.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section B', 'alice'), identityProvider);
        const view = viewOf({ publications: [publicationRow(publication)] });

        // Capability absent — stays hidden, never throws.
        const ctxHidden = canvasCtx({ view });
        ctxHidden.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        ctxHidden.toggleEncounterCommentary();
        assert(ctxHidden.encounterCommentaryOpen === false, '4. toggleEncounterCommentary() is a no-op with no capability wired');

        // Capability present, but nothing selected yet — still hidden.
        const ctxNoSelection = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctxNoSelection.toggleEncounterCommentary();
        assert(ctxNoSelection.encounterCommentaryOpen === false, '5. toggleEncounterCommentary() is a no-op with no current selection');

        // Capability present, a real selection — reachable.
        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        assert(ctx.encounterCommentaryOpen === false, '6. commentary starts collapsed');
        ctx.toggleEncounterCommentary();
        assert(ctx.encounterCommentaryOpen === true, '7. toggling opens the section');
        assert(Array.isArray(ctx.encounterCommentaries) && ctx.encounterCommentaries.length === 0, '8. opening an empty thread loads zero commentaries, not an error');
        ctx.toggleEncounterCommentary();
        assert(ctx.encounterCommentaryOpen === false, '9. toggling again collapses it');

        // An AVATAR selection never exposes commentary — Commentary
        // attaches to a Publication, never to an avatar/wanderer.
        const ctxAvatar = canvasCtx({
            view: viewOf({ avatars: [{ objectId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob', x: 0, y: 0, z: 0 }] }),
            getPublicationCommentariesCommand, addPublicationCommentaryCommand
        });
        ctxAvatar.selectEncounter({ kind: 'AVATAR', objectId: 'avatar-1' });
        assert(ctxAvatar.encounterCommentaryPublicationId === null, '10. an AVATAR encounter never resolves a commentary publicationId');
        ctxAvatar.toggleEncounterCommentary();
        assert(ctxAvatar.encounterCommentaryOpen === false, '11. toggleEncounterCommentary() is a no-op for an AVATAR selection');

        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(canvasCode.includes('v-if="encounterCommentaryPublicationId && getPublicationCommentariesCommand"') && canvasCode.includes('@click="toggleEncounterCommentary"'),
            '12. the template gates the Comment action on both the injected capability and a live PUBLICATION selection');

        console.log('✓ Section B: the Comment action is reachable exactly when the capability is wired AND a live PUBLICATION encounter is selected');
    }

    // ---------------------------------------------------------------
    // Section C — Lazy loading: selecting an encounter alone never
    // reads commentary; only the first toggle does.
    // ---------------------------------------------------------------
    {
        let reads = 0;
        const spyRead = (publicationId) => { reads += 1; return []; };
        const publication = { id: 'pub-lazy', title: 'Lazy', publisherIdentity: { username: 'alice' } };
        const view = viewOf({ publications: [publicationRow(publication)] });

        const ctx = canvasCtx({ view, getPublicationCommentariesCommand: spyRead });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        assert(reads === 0, '13. selecting an encounter never triggers a commentary read by itself');

        // Selecting a SECOND, different encounter — still no read, since
        // the panel was never opened for either.
        const publication2 = { id: 'pub-lazy-2', title: 'Lazy 2', publisherIdentity: { username: 'alice' } };
        const view2 = viewOf({ publications: [publicationRow(publication), publicationRow(publication2)] });
        ctx.view = view2;
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication2.id });
        assert(reads === 0, '14. re-selecting a different encounter still never triggers a read on its own');

        ctx.toggleEncounterCommentary();
        assert(reads === 1, '15. only the explicit first toggle performs the first read');
        ctx.refreshEncounterCommentaries();
        assert(reads === 2, '16. an explicit refresh reads again, still only on demand');

        console.log('✓ Section C: commentary is never auto-loaded for a merely-encountered or merely-selected Publication — only an explicit toggle/refresh reads it');
    }

    // ---------------------------------------------------------------
    // Section D — Publication identity: the exact encountered
    // publicationId is what flows into both commands.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section D', 'alice'), identityProvider);
        const view = viewOf({ publications: [publicationRow(publication)] });

        let receivedInput = null;
        const spyAddCommand = (input) => {
            receivedInput = input;
            return { commentary: { commentaryId: 'x', publicationId: input.publicationId, authorIdentityId: 'bob', content: input.content }, isNew: true };
        };

        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand: spyAddCommand });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        ctx.newEncounterCommentaryText = 'through the world encounter';
        ctx.submitEncounterCommentary();

        assert(receivedInput.publicationId === publication.id, '17. the exact encountered publicationId (selectedEncounter.objectId) is what gets submitted');
        assert(Object.keys(receivedInput).sort().join(',') === 'content,publicationId',
            '18. the command receives ONLY publicationId and content — never authorIdentityId or any other field');

        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert((canvasCode.match(/this\.addPublicationCommentaryCommand\(/g) || []).length === 1,
            '19. addPublicationCommentaryCommand is called from exactly one place');

        console.log('✓ Section D: the exact encountered publicationId is what gets submitted and later queried');
    }

    // ---------------------------------------------------------------
    // Section E — Authorship: the persisted commentary's author is the
    // AUTHENTICATED commentator, never the Publication's own publisher.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section E', 'alice'), identityProvider);
        const aliceId = identityProvider.getSigningIdentity().id;

        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;
        assert(bobId !== aliceId, '20. Alice and Bob are genuinely different identities');

        const view = viewOf({ publications: [publicationRow(publication)] });
        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        ctx.newEncounterCommentaryText = 'commenting as bob, from the World';
        ctx.submitEncounterCommentary();

        assert(ctx.encounterCommentaries.length === 1, '21. Bob\'s comment on Alice\'s encountered Publication is persisted and visible');
        assert(ctx.encounterCommentaries[0].authorIdentityId === bobId, '22. the commentary\'s author is Bob — the AUTHENTICATED commentator');
        assert(ctx.encounterCommentaries[0].authorIdentityId !== aliceId, '23. the commentary\'s author is never silently the Publication\'s own publisher');

        console.log('✓ Section E: authorship is the authenticated commentator, never the encountered Publication\'s own publisher');
    }

    // ---------------------------------------------------------------
    // Section F — Ownership independence: no UI ownership gate.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section F', 'alice'), identityProvider);
        identityProvider.login('carol'); // a third identity, unrelated to Alice or the Publication

        const view = viewOf({ publications: [publicationRow(publication)] });
        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        ctx.newEncounterCommentaryText = 'a total stranger, encountered in the World';
        ctx.submitEncounterCommentary();

        assert(ctx.encounterCommentaryError === null, '24. a non-owning identity is not rejected by this surface');
        assert(ctx.encounterCommentaries.length === 1 && ctx.encounterCommentaries[0].content === 'a total stranger, encountered in the World',
            '25. the stranger\'s commentary is genuinely persisted and visible');

        // Note: WorldEncounterCanvas.js already, legitimately, carries
        // `ownerIdentity` (an AVATAR encounter's own owner, since 0.9.0 —
        // nothing to do with Publication ownership) — so this check
        // targets ownership-of-a-Publication vocabulary specifically,
        // never the pre-existing avatar field.
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(!/isOwn|ownPublication|is-own|isMine|ownPublicationId/i.test(canvasCode),
            '26. WorldEncounterCanvas.js carries no Publication-ownership concept of any kind anywhere in its own source');

        console.log('✓ Section F: Publication ownership never gates reachability through this surface');
    }

    // ---------------------------------------------------------------
    // Section G — Authorization: CanCommentOnPublicationUseCase remains
    // authoritative; an unauthenticated attempt is rejected.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section G', 'alice'), identityProvider);
        identityProvider.logout();

        const view = viewOf({ publications: [publicationRow(publication)] });
        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        ctx.newEncounterCommentaryText = 'nobody is signed in';
        ctx.submitEncounterCommentary();

        assert(typeof ctx.encounterCommentaryError === 'string' && ctx.encounterCommentaryError.length > 0,
            '27. an unauthenticated submission is rejected — the existing use case\'s own rejection, not a UI-invented one');
        assert(ctx.newEncounterCommentaryText === 'nobody is signed in', '28. a rejected attempt never discards what was typed');
        assert(ctx.encounterCommentaries.length === 0, '29. a rejected attempt persists nothing');

        console.log('✓ Section G: existing authorization/authentication behavior is authoritative, unmodified by this surface');
    }

    // ---------------------------------------------------------------
    // Section H — Persistence convergence: commentary created from a
    // World Encounter is retrievable through the SAME backend
    // PublicationCard.js reads through.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section H', 'alice'), identityProvider);
        identityProvider.login('bob');

        const view = viewOf({ publications: [publicationRow(publication)] });
        const worldEncounterCtx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        worldEncounterCtx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        worldEncounterCtx.newEncounterCommentaryText = 'seen from the World, readable from the Card';
        worldEncounterCtx.submitEncounterCommentary();
        assert(worldEncounterCtx.encounterCommentaryError === null, '30. the World-Encounter-created commentary succeeded');

        // Read back through PublicationCard's own, entirely separate,
        // ctx/methods — same backend, different UI surface.
        const cardReadCtx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        cardReadCtx.refreshCommentaries();
        assert(cardReadCtx.commentaries.length === 1 && cardReadCtx.commentaries[0].content === 'seen from the World, readable from the Card',
            '31. PublicationCard\'s own read sees the commentary created through WorldEncounterCanvas');

        // And the reverse direction: a comment created through
        // PublicationCard is visible through WorldEncounterCanvas.
        const cardWriteCtx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        cardWriteCtx.newCommentaryText = 'seen from the Card, readable from the World';
        cardWriteCtx.submitCommentary();
        worldEncounterCtx.refreshEncounterCommentaries();
        assert(worldEncounterCtx.encounterCommentaries.some((c) => c.content === 'seen from the Card, readable from the World'),
            '32. WorldEncounterCanvas\'s own read sees a commentary created through PublicationCard — genuine two-way convergence');

        console.log('✓ Section H: commentary created from a World Encounter converges with PublicationCard\'s own read, in both directions');
    }

    // ---------------------------------------------------------------
    // Section I — Notification convergence: the existing
    // publication.commented NotificationEvent still fires, addressed to
    // the publisher.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand, notificationEventStore } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section I', 'alice'), identityProvider);
        const aliceId = identityProvider.getSigningIdentity().id;

        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;

        const view = viewOf({ publications: [publicationRow(publication)] });
        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        ctx.newEncounterCommentaryText = 'notify alice, from the World';
        ctx.submitEncounterCommentary();
        assert(ctx.encounterCommentaryError === null, '33. the commentary that should produce a notification actually succeeded');

        const events = notificationEventStore.loadAll();
        const own = events.filter((e) => e.eventType === 'publication.commented' && e.payload.publicationId === publication.id);
        assert(own.length === 1, '34. exactly one publication.commented NotificationEvent was produced for this Commentary');
        assert(own[0].recipientIdentityId === aliceId, '35. the notification is addressed to the Publication\'s own publisher (Alice), never the commenter');
        assert(own[0].payload.authorIdentityId === bobId, '36. the notification payload names the real commentator (Bob) as author');

        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(!/PublicationCommentaryNotificationProducer|publication\.commented/.test(canvasCode),
            '37. WorldEncounterCanvas.js never references the notification producer or event type itself — that stays entirely behind the injected command');

        console.log('✓ Section I: the existing notification producer still fires, unmodified, reached through this new surface');
    }

    // ---------------------------------------------------------------
    // Section J — Cross-surface isolation: commentary for encounter A
    // never leaks into encounter B, including across a fresh selection
    // on the SAME canvas instance.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const pubA = publisherProvider.publish(makeDocument('Encounter A', 'alice'), identityProvider);
        const pubB = publisherProvider.publish(makeDocument('Encounter B', 'alice'), identityProvider);
        identityProvider.login('bob');

        const view = viewOf({ publications: [publicationRow(pubA), publicationRow(pubB)] });
        const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: pubA.id });
        ctx.toggleEncounterCommentary();
        ctx.newEncounterCommentaryText = 'on encounter A';
        ctx.submitEncounterCommentary();
        assert(ctx.encounterCommentaries.length === 1 && ctx.encounterCommentaries[0].content === 'on encounter A',
            '38. encounter A\'s own commentary is visible while A is selected');

        // A fresh selection resets the open/read/draft state entirely —
        // never carrying A's own list, draft, or open flag into B.
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: pubB.id });
        assert(ctx.encounterCommentaryOpen === false, '39. selecting a new encounter collapses the commentary panel');
        assert(ctx.encounterCommentaries.length === 0, '40. selecting a new encounter clears the previous encounter\'s own commentary list');
        assert(ctx.newEncounterCommentaryText === '', '41. selecting a new encounter clears any unsent draft');

        ctx.toggleEncounterCommentary();
        assert(ctx.encounterCommentaries.length === 0, '42. encounter B genuinely has no commentary of its own yet');
        ctx.newEncounterCommentaryText = 'on encounter B';
        ctx.submitEncounterCommentary();
        assert(ctx.encounterCommentaries.length === 1 && ctx.encounterCommentaries[0].content === 'on encounter B',
            '43. encounter B\'s own commentary is visible, isolated from encounter A\'s');
        assert(!ctx.encounterCommentaries.some((c) => c.content === 'on encounter A'), '44. encounter B never shows encounter A\'s own commentary');

        // Re-selecting A again shows exactly A's own commentary, still
        // isolated — nothing was silently merged or lost.
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: pubA.id });
        ctx.toggleEncounterCommentary();
        assert(ctx.encounterCommentaries.length === 1 && ctx.encounterCommentaries[0].content === 'on encounter A',
            '45. re-selecting encounter A shows exactly its own commentary, unaffected by encounter B\'s');

        console.log('✓ Section J: commentary state never leaks between encounters, even across repeated selections on the same canvas instance');
    }

    // ---------------------------------------------------------------
    // Section K — Composition convergence: WorldEncounterCanvas.js
    // constructs no new use case, store, or composition root; WorldView.js
    // reuses its own already-existing commands for both surfaces.
    // ---------------------------------------------------------------
    {
        const canvasCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(canvasCode.includes('getPublicationCommentariesCommand: {') && canvasCode.includes('type: Function') &&
               canvasCode.includes('addPublicationCommentaryCommand: {'),
            '46. WorldEncounterCanvas.js declares the two commentary commands as OPTIONAL, caller-injected PROPS — never Vue inject, matching this file\'s own established prop-injection convention');

        const forbidden = [
            "from '../../core/PublicationCommentary.js'",
            "from '../../storage/PublicationCommentaryStore.js'",
            "from '../../application/GetPublicationCommentariesUseCase.js'",
            "from '../../application/AddPublicationCommentaryUseCase.js'",
            "from '../../application/CanCommentOnPublicationUseCase.js'",
            "from '../../application/PublicationCommentaryNotificationProducer.js'",
            "from '../../application/CreatePublicationCommentaryUseCase.js'",
            'new PublicationCommentary(', 'new PublicationCommentaryStore(',
            'new GetPublicationCommentariesUseCase(', 'new AddPublicationCommentaryUseCase(',
            'new CanCommentOnPublicationUseCase(', 'new PublicationCommentaryNotificationProducer(',
            'CreatePublicationCommentaryUseCase',
            'OtherPublicationCommentaryUseCase', 'AddCommentToOtherPublicationUseCase'
        ];
        for (const term of forbidden) {
            assert(!canvasCode.includes(term), `47. WorldEncounterCanvas.js never references '${term}' — it only calls the injected commands`);
        }

        // WorldView.js binds the SAME already-existing session-backed
        // commands to BOTH OwnPublicationPanel and WorldEncounterCanvas —
        // never a second construction of either function.
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        const getBindings = (viewCode.match(/:getPublicationCommentariesCommand="getPublicationCommentariesCommand"/g) || []).length;
        const addBindings = (viewCode.match(/:addPublicationCommentaryCommand="addPublicationCommentaryCommand"/g) || []).length;
        assert(getBindings === 2 && addBindings === 2,
            `48. WorldView.js binds getPublicationCommentariesCommand/addPublicationCommentaryCommand to exactly two template targets (found ${getBindings}/${addBindings}) — OwnPublicationPanel and WorldEncounterCanvas, the SAME function instances each time`);
        assert((viewCode.match(/function getPublicationCommentariesCommand\(/g) || []).length === 1 &&
               (viewCode.match(/function addPublicationCommentaryCommand\(/g) || []).length === 1,
            '49. WorldView.js still defines each command exactly ONCE — no second, WorldEncounterCanvas-specific wrapper');

        console.log('✓ Section K: WorldEncounterCanvas.js constructs no new use case, store, or composition root — WorldView.js reuses its own already-existing commands for both surfaces');
    }

    // ---------------------------------------------------------------
    // Section L — Regression: OwnPublicationPanel.js/PublicationCard.js/
    // CreateWorldViewUseCase.js/CreatePublicationCommentaryUseCase.js and
    // the four still-unwired 0.9.288 surfaces stay untouched.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes('refreshPublicationCommentaries()') && panelCode.includes('submitPublicationCommentary()'),
            '50. OwnPublicationPanel.js still carries its own original commentary methods, untouched');

        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        assert(cardCode.includes('toggleCommentary()') && cardCode.includes('refreshCommentaries()') && cardCode.includes('submitCommentary()'),
            '51. PublicationCard.js still carries its own original 0.9.289 commentary methods, untouched');

        const worldViewSessionCompositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(worldViewSessionCompositionCode.includes('new PublicationCommentaryStore(storageProvider)') &&
               worldViewSessionCompositionCode.includes('new PublicationCommentaryNotificationProducer('),
            '52. CreateWorldViewUseCase.js still composes its own, independent commentary path, unmodified by this milestone');

        const appWideCompositionCode = await codeOnlySource('application/CreatePublicationCommentaryUseCase.js');
        assert(appWideCompositionCode.includes('new CanCommentOnPublicationUseCase(discoveryProvider)'),
            '53. application/CreatePublicationCommentaryUseCase.js (0.9.289\'s own app-wide root) stays unmodified by this milestone');

        const stillUnwiredSurfaces = [
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/components/PublicationList.js',
            'ui/views/DecentralizedPublicationsView.js'
        ];
        for (const file of stillUnwiredSurfaces) {
            const code = await codeOnlySource(file);
            assert(!code.includes('getPublicationCommentariesCommand') && !code.includes('addPublicationCommentaryCommand'),
                `54. ${file} carries no commentary wiring — this milestone wires only WorldEncounterCanvas.js, the second of the six 0.9.288 named`);
        }

        console.log('✓ Section L: OwnPublicationPanel/PublicationCard/both composition roots stay byte-for-byte regression passes; the four remaining 0.9.288 surfaces stay untouched');
    }

    console.log('\n✅ All World Encounter Publication Commentary Entry Point tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
