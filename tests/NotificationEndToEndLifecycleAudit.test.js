import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import NotificationHistoryPanel from '../ui/components/NotificationHistoryPanel.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { PublicationCommentaryStore, PublicationCommentaryConflictError } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer, PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/PublicationCommentaryNotificationProducer.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { GetRecipientNotificationEventsUseCase } from '../application/GetRecipientNotificationEventsUseCase.js';
import { NotificationCollisionOutcome, notificationDeduplicationIdentity } from '../core/NotificationDeduplicationPolicy.js';
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

// 0.9.286 — Notification End-to-End Lifecycle Audit.
//
// 0.9.273-0.9.285 built, audited, and finally WIRED the complete
// notification vertical slice:
//
//   Commentary creation
//        │
//        ▼
//   PublicationCommentaryNotificationProducer   (0.9.275)
//        │
//        ▼
//   NotificationEvent                            (0.9.273)
//        │
//        ▼
//   NotificationDeduplicationPolicy               (0.9.280)
//        │
//        ▼
//   NotificationEventStore                        (0.9.281)
//        │
//        ▼
//   GetRecipientNotificationEventsUseCase          (0.9.283)
//        │
//        ▼
//   NotificationHistoryPanel                       (0.9.284)
//
// 0.9.285's own PublicationCommentaryNotificationRuntimeIntegration.test.js
// already proved this chain works, real infrastructure, real composition
// root, twelve sections. This milestone does NOT re-litigate that proof —
// it is deliberately test-only, per its own brief, and adds no production
// code unless this audit discovers an actual defect (it does not). What
// this file adds instead is the set of questions 0.9.285 either only
// grazed or never asked at all: RECONSTRUCTION after a simulated restart
// through the full read stack (not just one store); whether a shared
// publicationId could ever accidentally become a deduplication identity;
// whether CONFLICT — proven unreachable from the real producer as far
// back as 0.9.282 Section G — still behaves correctly when reproduced
// directly against the real, already-populated production store, and
// whether Notification History still reflects the truth afterward;
// explicit pairwise identity-closure checks across all six identifiers
// this arc has ever named; failure isolation across every boundary in the
// chain, not just the two 0.9.285 already exercised; a fresh architecture
// regression sweep for lifecycle vocabulary; and — the one test the
// reviewer's own brief asked for by name — an explicit, permanent proof
// that PERSISTED, DELIVERED, SEEN, and READ are four different claims,
// and this codebase can only honestly make the first one.
//
// THE CENTRAL PROOF THIS FILE EXISTS TO ESTABLISH:
//
//   A Publication Commentary created through the real application path
//   produces exactly one durable notification for the Publication
//   publisher, and that notification can subsequently be retrieved
//   through the real recipient query and Notification History UI.
//
// Section B is that proof, walked hop by hop through the diagram above.
// Every other section either widens it (isolation, dedup, reconstruction,
// multiplicity) or stress-tests its edges (conflict, failure, identity,
// architecture).
//
//   Section A — Composition closure: exactly one active producer path,
//               reachable with no test-only construction.
//   Section B — The flagship end-to-end proof.
//   Section C — Recipient isolation.
//   Section D — Deduplication: the STORE is the authority, not the
//               producer.
//   Section E — Reconstruction: fresh store/query/UI instances recover
//               the identical recipient history.
//   Section F — Multiple Commentaries on one Publication: publicationId
//               never becomes a deduplication identity.
//   Section G — Event-type separation.
//   Section H — Conflict preservation, reproduced against the real
//               production store.
//   Section I — Publication lookup failure: no notification, no
//               rollback, no fabricated recipient.
//   Section J — Notification persistence failure: the established
//               non-atomic boundary, documented, not fixed.
//   Section K — UI lifecycle: create -> open -> load -> refresh -> close
//               -> reopen.
//   Section L — Identity closure: six identifiers, never conflated.
//   Section M — Failure isolation across every boundary in the chain.
//   Section N — Architecture regression: no lifecycle vocabulary.
//   Section O — PERSISTED != DELIVERED != SEEN != READ, made permanent.
//
// See docs/Roadmap.md, 0.9.286, for the full milestone entry, and
// docs/Principles.md for the invariant Section O closes.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
async function grepCount(pattern, dirs, { excludeSuffix = null } = {}) {
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// ---------------------------------------------------------------------
// Fixtures — the same real-infrastructure shape
// tests/PublicationCommentaryNotificationRuntimeIntegration.test.js
// (0.9.285) already established as isomorphic to
// application/CreateWorldViewUseCase.js's own production wiring. Section
// A re-derives that isomorphism claim directly from the composition
// root's own source rather than merely trusting it, but the executable
// fixtures below still reuse the identical shape for every section that
// exercises real behavior — no new fixture invents a different wiring
// pattern than production actually uses.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Fails writes to exactly one named storage key while every other key
// (routed through the SAME underlying instance) keeps succeeding — lets
// Sections J and M fail one specific collaborator's persistence without
// disturbing any other collaborator sharing the identical storageProvider,
// exactly the fidelity production sharing this one provider requires.
const COMMENTARY_STORE_KEY = 'publication-commentary:entries';
const NOTIFICATION_EVENT_STORE_KEY = 'notification-events:entries';
class PartiallyFailingStorageProvider extends StorageProvider {
    constructor(inner, failingKey) { super(); this._inner = inner; this._failingKey = failingKey; }
    save(name, data) {
        if (name === this._failingKey) {
            throw new Error(`simulated storage failure for ${this._failingKey}`);
        }
        return this._inner.save(name, data);
    }
    load(name) { return this._inner.load(name); }
    remove(name) { return this._inner.remove(name); }
    list() { return this._inner.list(); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// Deliberately never authenticated — createLocalIdentity() alone leaves
// getSigningIdentity() throwing, the real "nobody is signed in on this
// device" shape Section M's recipient-query failure needs.
function makeUnauthenticatedIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.createLocalIdentity(label);
    return provider;
}

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

function makeSharedInfrastructure(storageProvider = new InMemoryStorageProvider()) {
    const contentStore = new LocalContentStore(storageProvider);
    const publisherProvider = new LocalPublisherProvider(storageProvider, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
    const commentaryStore = new PublicationCommentaryStore(storageProvider);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const notificationEventStore = new NotificationEventStore(storageProvider);
    return { storageProvider, contentStore, publisherProvider, discoveryProvider, commentaryStore, canCommentOnPublicationUseCase, notificationEventStore };
}

// Builds the exact wiring shape application/CreateWorldViewUseCase.js's
// own execute() builds for one identityProvider: a real
// AddPublicationCommentaryUseCase, decorated by a real
// PublicationCommentaryNotificationProducer whose sink writes into the
// SAME notificationEventStore GetRecipientNotificationEventsUseCase reads
// from, handed — decorated, never raw — to a real WorldNavigationSession.
function buildSessionFor(identityProvider, infra, { producerDiscoveryProvider = infra.discoveryProvider, notificationEventStore = infra.notificationEventStore } = {}) {
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        infra.commentaryStore,
        identityProvider,
        infra.canCommentOnPublicationUseCase
    );
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        producerDiscoveryProvider,
        (event) => notificationEventStore.save(event)
    );
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(infra.commentaryStore);
    const getRecipientNotificationEventsUseCase = new GetRecipientNotificationEventsUseCase(notificationEventStore, identityProvider);

    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider: infra.discoveryProvider,
        getPublicationCommentariesUseCase,
        addPublicationCommentaryUseCase: publicationCommentaryCapability,
        getRecipientNotificationEventsUseCase
    });

    return {
        session,
        addPublicationCommentaryCommand: ({ publicationId, content }) => session.addPublicationCommentary({ publicationId, content }),
        getPublicationCommentariesCommand: (publicationId) => session.getPublicationCommentaries(publicationId),
        getRecipientNotificationEventsCommand: () => session.getRecipientNotificationEvents(),
        publicationCommentaryCapability,
        addPublicationCommentaryUseCase
    };
}

function commentaryPanelCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        viewerIdentityId: null,
        publicationCommentaries: [],
        newCommentaryText: '',
        publicationCommentarySubmitting: false,
        publicationCommentaryError: null,
        refreshPublicationCommentaries: OwnPublicationPanel.methods.refreshPublicationCommentaries,
        submitPublicationCommentary: OwnPublicationPanel.methods.submitPublicationCommentary,
        ...overrides
    };
}

function notificationPanelCtx(overrides = {}) {
    return {
        getRecipientNotificationEventsCommand: null,
        notifications: [],
        notificationHistoryError: null,
        refreshNotificationHistory: NotificationHistoryPanel.methods.refreshNotificationHistory,
        notificationTitle: NotificationHistoryPanel.methods.notificationTitle,
        notificationDetails: NotificationHistoryPanel.methods.notificationDetails,
        ...overrides
    };
}

// Mounts a fresh NotificationHistoryPanel ctx exactly the way Vue's own
// mounted() hook would (NotificationHistoryPanel.js's own mounted()
// simply calls refreshNotificationHistory() once) — used wherever a
// section needs to simulate "opening" the panel as a genuinely new
// surface rather than reusing an already-populated ctx.
function openNotificationHistoryPanel(getRecipientNotificationEventsCommand) {
    const ctx = notificationPanelCtx({ getRecipientNotificationEventsCommand });
    ctx.refreshNotificationHistory();
    return ctx;
}

async function runTests() {
    console.log('Running Notification End-to-End Lifecycle Audit tests...\n');

    // ===============================================================
    // Section A — Composition closure. Exactly one active Commentary ->
    // Notification producer path exists in the real production
    // composition root, and no hop in the flagship diagram requires
    // test-only construction to reach.
    // ===============================================================
    {
        const composition = await rawSource('application/CreateWorldViewUseCase.js');
        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');

        // A1. Exactly one production construction site for the producer,
        // anywhere in application/ or ui/ — the composition root, and
        // nowhere else.
        const producerSites = await grepCount('new PublicationCommentaryNotificationProducer(', ['application', 'ui'], { excludeSuffix: 'PublicationCommentaryNotificationProducer\\.js' });
        assert(producerSites === 1, `A1. Exactly one production file constructs PublicationCommentaryNotificationProducer (found ${producerSites}).`);

        // A2. That one site wraps the SAME addPublicationCommentaryUseCase
        // and discoveryProvider the composition root already built — never
        // a second, parallel instance of either — and sinks into the SAME
        // NotificationEventStore instance the read side (
        // GetRecipientNotificationEventsUseCase) already reads from. One
        // store, backing both directions.
        assert(/new PublicationCommentaryNotificationProducer\(\s*addPublicationCommentaryUseCase,\s*discoveryProvider,/.test(compositionCode),
            'A2a. The producer wraps the exact addPublicationCommentaryUseCase/discoveryProvider already built.');
        assert(/\(notificationEvent\)\s*=>\s*notificationEventStore\.save\(notificationEvent\)/.test(compositionCode),
            'A2b. The notificationSink is a plain call to notificationEventStore.save() — no inbox/delivery/center of any kind.');
        const storeConstructions = (compositionCode.match(/new NotificationEventStore\(/g) || []).length;
        assert(storeConstructions === 1, `A2c. Exactly one NotificationEventStore is constructed (found ${storeConstructions}).`);

        // A3. The DECORATED capability, never the raw use case, is what
        // WorldNavigationSession actually receives.
        assert(/addPublicationCommentaryUseCase:\s*publicationCommentaryCapability/.test(compositionCode),
            'A3. WorldNavigationSession is constructed with the decorated capability, not the bare use case.');

        // A4. The read side is reachable through the SAME composition
        // root with no separate wiring path: getRecipientNotificationEventsUseCase
        // is constructed once, from the identical notificationEventStore,
        // and handed to the SAME WorldNavigationSession construction call
        // as addPublicationCommentaryUseCase — one session, both
        // directions, never two independently-composed sessions.
        assert(compositionCode.includes('new GetRecipientNotificationEventsUseCase(notificationEventStore, identityProvider)'),
            'A4a. GetRecipientNotificationEventsUseCase is constructed from the SAME notificationEventStore.');
        assert(/getRecipientNotificationEventsUseCase,[\s\S]{0,400}addPublicationCommentaryUseCase: publicationCommentaryCapability|addPublicationCommentaryUseCase: publicationCommentaryCapability,[\s\S]{0,2000}getRecipientNotificationEventsUseCase/.test(compositionCode),
            'A4b. Both the write-side capability and the read-side use case are handed to the same WorldNavigationSession construction call.');

        // A5. The UI hop is reachable with no test-only wiring either:
        // ui/views/WorldView.js forwards session.getRecipientNotificationEvents()
        // to a real, rendered NotificationHistoryPanel, and forwards
        // session.addPublicationCommentary() to a real, rendered
        // OwnPublicationPanel — both already proven by A1-A4 to be backed
        // by the composed capability, never a mock.
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes('function getRecipientNotificationEventsCommand() {') &&
            worldViewCode.includes('return session.getRecipientNotificationEvents();'),
            'A5a. WorldView.js\'s own getRecipientNotificationEventsCommand forwards to the real session, unmodified.');
        assert(/<NotificationHistoryPanel[\s\S]{0,200}:getRecipientNotificationEventsCommand="getRecipientNotificationEventsCommand"/.test(await rawSource('ui/views/WorldView.js')),
            'A5b. NotificationHistoryPanel is actually rendered in WorldView.js\'s own template, wired to the real command.');
        assert(worldViewCode.includes('function addPublicationCommentaryCommand({ publicationId, content }) {') &&
            worldViewCode.includes('return session.addPublicationCommentary({ publicationId, content });'),
            'A5c. WorldView.js\'s own addPublicationCommentaryCommand forwards to the real session, unmodified.');

        // A6. No stray uncommitted diff on any file this chain depends on
        // — this audit runs against the real, already-merged 0.9.285
        // state, never a locally-patched one.
        const gitDiffStat = execSync(
            'git diff --stat HEAD -- application/AddPublicationCommentaryUseCase.js application/WorldNavigationSession.js core/NotificationEvent.js core/NotificationDeduplicationPolicy.js storage/NotificationEventStore.js application/PublicationCommentaryNotificationProducer.js application/GetRecipientNotificationEventsUseCase.js ui/views/WorldView.js ui/components/NotificationHistoryPanel.js ui/components/OwnPublicationPanel.js application/CreateWorldViewUseCase.js 2>/dev/null || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(gitDiffStat === '', `A6. None of the pre-existing files this chain depends on carry an uncommitted diff. Found: ${gitDiffStat || '(none)'}.`);

        console.log('✓ A: exactly one live PublicationCommentaryNotificationProducer construction site exists, reusing the exact addPublicationCommentaryUseCase/discoveryProvider/notificationEventStore the composition root already built; the decorated capability (never the raw use case) reaches WorldNavigationSession; and the read-side use case and the write-side capability both reach the SAME session from the SAME composition call. Every hop in the flagship diagram is reachable from production wiring alone — no test-only construction is required anywhere in this chain.');
    }

    // ===============================================================
    // Section B — THE FLAGSHIP END-TO-END PROOF. A Commentary created
    // through the real application command produces exactly one durable
    // notification for the Publication publisher, retrievable through the
    // real recipient query and a real Notification History panel.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice'); // publisher
        const bob = makeIdentity('Bob'); // commenter
        const publication = infra.publisherProvider.publish(makeDocument('Flagship World', 'alice'), alice);

        // Hop 1: Commentary creation, through the real command a real
        // OwnPublicationPanel would call.
        const bobSession = buildSessionFor(bob, infra);
        const { commentary, isNew } = bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Flagship commentary' });
        assert(isNew === true, 'B1. Commentary creation reports a genuinely new record.');

        // Hop 1 result: Commentary persisted, durably, independent of this
        // in-memory result object.
        const persistedCommentaries = infra.commentaryStore.loadAll();
        assert(persistedCommentaries.length === 1 && persistedCommentaries[0].commentaryId === commentary.commentaryId,
            'B2. the Commentary is durably persisted, readable back through a fresh loadAll() call.');

        // Hops 2-4: PublicationCommentaryNotificationProducer constructed
        // a NotificationEvent, NotificationDeduplicationPolicy classified
        // it (implicitly, inside NotificationEventStore.save()), and
        // NotificationEventStore persisted it — all inside the single
        // addPublicationCommentaryCommand() call above. Verify the result.
        const storedEvents = infra.notificationEventStore.loadAll();
        assert(storedEvents.length === 1, 'B3. exactly one NotificationEvent is durably persisted.');
        const storedEvent = storedEvents[0];
        assert(storedEvent.eventType === PUBLICATION_COMMENTED_EVENT_TYPE, 'B4. the persisted event carries the correct, policy-defined eventType.');
        assert(storedEvent.recipientIdentityId === alice.getSigningIdentity().id, 'B5. the persisted event\'s recipient is the Publication\'s own publisher, Alice.');
        assert(storedEvent.recipientIdentityId === publication.publisherIdentity.id, 'B5b. and matches the Publication\'s own publisherIdentity.id exactly — no re-derivation, no substitution.');
        assert(storedEvent.payload.commentaryId === commentary.commentaryId, 'B6. the persisted event\'s payload references the exact Commentary that was just created.');
        assert(storedEvent.payload.publicationId === publication.id, 'B7. the persisted event\'s payload references the exact Publication that was commented on.');
        assert(storedEvent.payload.authorIdentityId === bob.getSigningIdentity().id, 'B8. the persisted event\'s payload correctly attributes Bob as the Commentary\'s author.');

        // Hop 5: the recipient query, through the real, authenticated
        // use case — never a raw store read, never a caller-supplied
        // recipient id.
        const aliceSession = buildSessionFor(alice, infra);
        const aliceNotifications = aliceSession.getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 1, 'B9. the publisher\'s own recipient-scoped query sees exactly one notification.');
        assert(aliceNotifications[0].notificationId === storedEvent.notificationId, 'B10. the queried event is the SAME durable record (identical notificationId) — never a re-derived copy.');

        // Hop 6: the UI. A real NotificationHistoryPanel ctx, wired to the
        // real command, actually rendering the flagship notification.
        const historyCtx = openNotificationHistoryPanel(aliceSession.getRecipientNotificationEventsCommand);
        assert(historyCtx.notificationHistoryError === null, 'B11. the panel reports no error on a successful real load.');
        assert(historyCtx.notifications.length === 1 && historyCtx.notifications[0].notificationId === storedEvent.notificationId,
            'B12. Notification History renders exactly the one real notification the real Commentary produced.');
        assert(historyCtx.notificationTitle(historyCtx.notifications[0]) === 'Publication commented',
            'B13. the panel\'s own humanized title reads correctly for the real eventType.');

        console.log('✓ B (FLAGSHIP): a Commentary created through the real application command produced exactly one durably-persisted Commentary and exactly one durably-persisted NotificationEvent — correct eventType, correct publisher recipient, correct Commentary/Publication identity — retrievable through the real, authenticated recipient query and rendered by a real Notification History panel. This is the complete notification vertical slice, proven end to end.');
    }

    // ===============================================================
    // Section C — Recipient isolation. Multiple identities/publications;
    // each recipient sees only their own notification, and the commenter
    // is never a recipient merely by being the author.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice'); // Publisher A
        const carol = makeIdentity('Carol'); // Publisher B
        const bob = makeIdentity('Bob'); // commenter on both
        const alicePub = infra.publisherProvider.publish(makeDocument('Isolation A', 'alice'), alice);
        const carolPub = infra.publisherProvider.publish(makeDocument('Isolation B', 'carol'), carol);

        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: alicePub.id, content: 'Commentary A' });
        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: carolPub.id, content: 'Commentary B' });

        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        const carolNotifications = buildSessionFor(carol, infra).getRecipientNotificationEventsCommand();
        const bobNotifications = buildSessionFor(bob, infra).getRecipientNotificationEventsCommand();

        assert(aliceNotifications.length === 1 && aliceNotifications[0].payload.publicationId === alicePub.id,
            'C1. Publisher A (Alice) sees exactly her own notification.');
        assert(carolNotifications.length === 1 && carolNotifications[0].payload.publicationId === carolPub.id,
            'C2. Publisher B (Carol) sees exactly her own notification.');
        assert(!aliceNotifications.some((event) => event.recipientIdentityId === carol.getSigningIdentity().id),
            'C3a. Alice\'s own query never returns an event addressed to Carol.');
        assert(!carolNotifications.some((event) => event.recipientIdentityId === alice.getSigningIdentity().id),
            'C3b. Carol\'s own query never returns an event addressed to Alice.');
        assert(bobNotifications.length === 0,
            'C4. the commenter (Bob) receives no notification of his own — authoring Commentary never makes you its own recipient, on either Publication.');
        assert(infra.notificationEventStore.loadAll().length === 2, 'C5. two real notifications total, correctly isolated by recipient.');

        console.log('✓ C: recipient isolation holds across two independent Publications and publishers, and the commenter never receives a notification merely by being the author.');
    }

    // ===============================================================
    // Section D — Deduplication. The STORE, not the producer, is proven
    // to be the deduplication authority: repeated Commentary processing
    // for the SAME commentaryId invokes the producer more than once, each
    // invocation constructs a genuinely distinct NotificationEvent object
    // (a new notificationId every time), and yet exactly one durable row
    // survives.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Dedup World', 'alice'), alice);

        const sinkedNotificationIds = [];
        const sinkedOutcomes = [];
        const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(infra.commentaryStore, bob, infra.canCommentOnPublicationUseCase);
        const producer = new PublicationCommentaryNotificationProducer(addPublicationCommentaryUseCase, infra.discoveryProvider, (event) => {
            sinkedNotificationIds.push(event.notificationId);
            sinkedOutcomes.push(infra.notificationEventStore.save(event).outcome);
        });

        const fixedInput = { publicationId: publication.id, commentaryId: 'dedup-fixed-id', content: 'same commentary, over and over', createdAt: new Date('2024-06-01T00:00:00.000Z') };
        producer.execute(fixedInput);
        producer.execute({ ...fixedInput });
        producer.execute({ ...fixedInput });
        producer.execute({ ...fixedInput });

        // D1/D2. Producer invocations > 1; stored notifications = 1.
        assert(sinkedNotificationIds.length === 4, 'D1. the producer\'s own sink was invoked four separate times — producer invocations genuinely exceed one.');
        const distinctNotificationIds = new Set(sinkedNotificationIds);
        assert(distinctNotificationIds.size === 4,
            'D2. each of the four sink invocations carried a GENUINELY DISTINCT NotificationEvent (distinct notificationId) — the producer performs no deduplication of its own; every retry constructs a fresh fact.');
        assert(infra.notificationEventStore.loadAll().length === 1,
            'D3. despite four distinct producer-constructed events, exactly ONE durable notification survives — the store, not the producer, is what collapsed them.');

        // D4. The outcome sequence itself proves WHERE the collapse
        // happened: NEW exactly once, EXISTING for every subsequent call.
        assert(sinkedOutcomes[0] === NotificationPersistenceOutcome.NEW, 'D4a. the first save() call reports NEW.');
        assert(sinkedOutcomes.slice(1).every((outcome) => outcome === NotificationPersistenceOutcome.EXISTING),
            'D4b. every subsequent save() call reports EXISTING — the store recognized the SAME logical notification each time, even though it was handed a physically different object.');

        // D5. The publisher's own recipient-scoped read confirms the
        // durable, deduplicated view — never four rows, never zero.
        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 1, 'D5. the publisher\'s own Notification History shows exactly one notification after four producer invocations.');

        console.log('✓ D: four separate producer invocations for the identical commentaryId each construct a genuinely distinct NotificationEvent object, yet exactly one durable notification survives — NEW once, EXISTING three times. NotificationEventStore, never PublicationCommentaryNotificationProducer, is the deduplication authority.');
    }

    // ===============================================================
    // Section E — Reconstruction. Persist real events through the real
    // pipeline, then build entirely FRESH NotificationEventStore,
    // GetRecipientNotificationEventsUseCase, and NotificationHistoryPanel
    // ctx instances against the same underlying storage — simulating a
    // full application restart across the whole read stack, not merely
    // one store.
    // ===============================================================
    {
        const sharedStorage = new InMemoryStorageProvider();
        const infra = makeSharedInfrastructure(sharedStorage);
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const dave = makeIdentity('Dave');
        const publication = infra.publisherProvider.publish(makeDocument('Reconstruction World', 'alice'), alice);

        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Before restart, from Bob' });
        buildSessionFor(dave, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Before restart, from Dave' });
        const beforeRestart = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        assert(beforeRestart.length === 2, 'E1. two real notifications exist before the simulated restart.');

        // Simulate a full restart: brand-new store, brand-new query use
        // case, brand-new panel ctx — sharing nothing in memory with the
        // objects above except the raw storage bytes. Alice's own signing
        // identity is re-derived as a plain value, not re-authenticated
        // through a second LocalIdentityProvider instance, since what this
        // section reconstructs is the NOTIFICATION read stack specifically
        // — identity vault persistence is a separate, already-covered
        // concern (identity/LocalIdentityProvider.js's own tests).
        const restartedNotificationEventStore = new NotificationEventStore(sharedStorage);
        assert(restartedNotificationEventStore !== infra.notificationEventStore, 'E2. the reconstructed store is a genuinely different object instance.');
        const aliceIdentityId = alice.getSigningIdentity().id;
        const restartedQueryUseCase = new GetRecipientNotificationEventsUseCase(restartedNotificationEventStore, {
            getSigningIdentity: () => ({ id: aliceIdentityId })
        });
        const restartedCommand = () => restartedQueryUseCase.execute();
        const restartedCtx = openNotificationHistoryPanel(restartedCommand);

        assert(restartedCtx.notificationHistoryError === null, 'E3. the reconstructed panel reports no error.');
        assert(restartedCtx.notifications.length === 2, 'E4. the reconstructed read stack recovers the identical count of durable notifications.');
        const beforeIds = new Set(beforeRestart.map((event) => event.notificationId));
        const afterIds = new Set(restartedCtx.notifications.map((event) => event.notificationId));
        assert(beforeIds.size === afterIds.size && [...beforeIds].every((id) => afterIds.has(id)),
            'E5. every notificationId observed before the restart is observed again after it — the SAME logical history, not a coincidentally-equal-sized one.');
        assert(JSON.stringify(restartedCtx.notifications.map((event) => event.toJSON()).sort((a, b) => a.notificationId.localeCompare(b.notificationId)))
            === JSON.stringify(beforeRestart.map((event) => event.toJSON()).sort((a, b) => a.notificationId.localeCompare(b.notificationId))),
            'E6. every field of every reconstructed event (eventType, recipientIdentityId, createdAt, payload) matches the pre-restart record exactly.');

        console.log('✓ E: a fresh NotificationEventStore, a fresh GetRecipientNotificationEventsUseCase, and a fresh NotificationHistoryPanel ctx — sharing no in-memory state with the objects that wrote the data — recover the identical recipient notification history from the same underlying storage. This closes the complete restart path across the full read stack, not merely the store 0.9.281 Section M already covered.');
    }

    // ===============================================================
    // Section F — Multiple Commentaries. Several distinct Commentaries on
    // ONE Publication produce distinct logical notifications; the shared
    // publicationId never accidentally becomes a deduplication identity.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const publication = infra.publisherProvider.publish(makeDocument('Multiplicity World', 'alice'), alice);

        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'First comment' });
        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Second comment, same author' });
        buildSessionFor(carol, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Third comment, different author' });

        const stored = infra.notificationEventStore.loadAll();
        assert(stored.length === 3, 'F1. three distinct Commentaries on one Publication produce three distinct durable notifications.');
        const distinctCommentaryIds = new Set(stored.map((event) => event.payload.commentaryId));
        assert(distinctCommentaryIds.size === 3, 'F2. each notification references a genuinely distinct commentaryId.');
        assert(stored.every((event) => event.payload.publicationId === publication.id),
            'F3. all three share the SAME publicationId — the shared field this section exists to stress.');
        const identities = stored.map((event) => notificationDeduplicationIdentity(event));
        assert(new Set(identities).size === 3,
            'F4. all three deduplication identities are pairwise distinct — a shared publicationId alone never collapses them, because publicationId is not a dimension of the identity (see core/NotificationDeduplicationPolicy.js\'s own DESCRIPTOR: commentaryId + eventType + recipientIdentityId only).');

        // F5. Direct proof that publicationId is not load-bearing for
        // identity: two HAND-CONSTRUCTED events sharing every field
        // EXCEPT commentaryId (identical publicationId, eventType,
        // recipientIdentityId, authorIdentityId) still resolve to two
        // different identities.
        const sharedRecipient = alice.getSigningIdentity().id;
        const eventX = new NotificationEvent({ eventType: PUBLICATION_COMMENTED_EVENT_TYPE, recipientIdentityId: sharedRecipient, payload: { publicationId: publication.id, commentaryId: 'commentary-x', authorIdentityId: 'author-shared' } });
        const eventY = new NotificationEvent({ eventType: PUBLICATION_COMMENTED_EVENT_TYPE, recipientIdentityId: sharedRecipient, payload: { publicationId: publication.id, commentaryId: 'commentary-y', authorIdentityId: 'author-shared' } });
        assert(notificationDeduplicationIdentity(eventX) !== notificationDeduplicationIdentity(eventY),
            'F5. two events differing ONLY in commentaryId, with an otherwise identical publicationId/eventType/recipientIdentityId/authorIdentityId, resolve to different deduplication identities — publicationId alone can never be mistaken for the dedup key.');

        // F6. The publisher's own Notification History shows all three,
        // through the real read path.
        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 3, 'F6. the publisher\'s own real query returns all three distinct notifications for her one Publication.');

        console.log('✓ F: several distinct Commentaries on one Publication produce distinct logical notifications; the shared publicationId is proven, directly, never to function as a deduplication identity on its own.');
    }

    // ===============================================================
    // Section G — Event-type separation. Hand-constructed events (as this
    // section's own brief explicitly permits) confirm different event
    // types remain distinct even when Commentary and recipient are
    // identical.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const recipientId = 'recipient-shared-across-types';
        const sharedPayload = { publicationId: 'pub-shared', commentaryId: 'commentary-shared', authorIdentityId: 'author-shared' };

        const commentedEvent = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: recipientId, payload: sharedPayload });
        // A plausible future eventType, hand-constructed only to exercise
        // the policy — this milestone introduces no such producer, per
        // its own brief.
        const otherEvent = new NotificationEvent({ eventType: 'publication.something-else', recipientIdentityId: recipientId, payload: sharedPayload });

        assert(notificationDeduplicationIdentity(commentedEvent) !== notificationDeduplicationIdentity(otherEvent),
            'G1. identical commentaryId and identical recipientIdentityId, but different eventType, still resolve to different deduplication identities.');

        const firstSave = infra.notificationEventStore.save(commentedEvent);
        const secondSave = infra.notificationEventStore.save(otherEvent);
        assert(firstSave.outcome === NotificationPersistenceOutcome.NEW && secondSave.outcome === NotificationPersistenceOutcome.NEW,
            'G2. the real store persists BOTH as genuinely new, distinct records — neither is treated as a duplicate or a conflict of the other.');
        assert(infra.notificationEventStore.loadAll().length === 2, 'G3. two durable rows exist, one per eventType.');

        console.log('✓ G: eventType is a real dimension of the deduplication identity — two events describing the same Commentary and addressed to the same recipient remain fully distinct notifications when their eventType differs.');
    }

    // ===============================================================
    // Section H — Conflict preservation. Reproduces the 0.9.280/0.9.281
    // CONFLICT case through the REAL, already-populated production store,
    // and proves the invariant 0.9.282 Section G first documented still
    // holds: the real Commentary path structurally cannot reach CONFLICT
    // on its own (PublicationCommentaryStore's own conflict guard refuses
    // the one input shape that would produce one, before a second
    // notification event is ever constructed) — CONFLICT remains real,
    // tested, load-bearing infrastructure, reachable only by handing the
    // real store a hand-constructed, disagreeing event directly.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Conflict World', 'alice'), alice);

        // H1. First, reconfirm the real path CANNOT reach a notification
        // CONFLICT via retry: attempting to resubmit the SAME
        // commentaryId with DIFFERENT content is intercepted one full
        // layer earlier, by PublicationCommentaryStore's own conflict
        // guard, before AddPublicationCommentaryUseCase even returns —
        // so PublicationCommentaryNotificationProducer never runs a
        // second time for this commentaryId, and no second NotificationEvent
        // is ever constructed to disagree with the first.
        const bobSession = buildSessionFor(bob, infra);
        const original = bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Original content', });
        let threwCommentaryConflict = false;
        try {
            bobSession.publicationCommentaryCapability.execute({
                publicationId: publication.id,
                commentaryId: original.commentary.commentaryId,
                content: 'A conflicting rewrite of the same commentary'
            });
        } catch (error) {
            threwCommentaryConflict = error instanceof PublicationCommentaryConflictError;
        }
        assert(threwCommentaryConflict, 'H1. a genuine content conflict on retry is rejected at the Commentary layer itself (PublicationCommentaryConflictError) — the notification producer is never even invoked a second time for it.');
        assert(infra.notificationEventStore.loadAll().length === 1, 'H1b. exactly the one original notification exists — the rejected retry produced no second row and no CONFLICT outcome from this path.');

        // H2. Reproduce CONFLICT directly against the SAME real,
        // already-populated production store: a hand-constructed event
        // sharing the original's deduplication identity (commentaryId +
        // eventType + recipientIdentityId) but disagreeing on a SHARED
        // payload field (authorIdentityId) — exactly 0.9.279's own
        // canonical CONFLICT shape (a different claimed author for one
        // immutable Commentary), the scenario the real producer can never
        // organically construct, reproduced here as the one legitimate
        // way to exercise it: directly against storage.
        const originalEvent = infra.notificationEventStore.loadAll()[0];
        const conflictingEvent = new NotificationEvent({
            eventType: originalEvent.eventType,
            recipientIdentityId: originalEvent.recipientIdentityId,
            payload: {
                ...originalEvent.payload,
                authorIdentityId: 'a-completely-different-claimed-author'
            }
        });
        assert(notificationDeduplicationIdentity(conflictingEvent) === notificationDeduplicationIdentity(originalEvent),
            'H2a. the hand-constructed event shares the original\'s exact deduplication identity.');

        const conflictResult = infra.notificationEventStore.save(conflictingEvent);
        assert(conflictResult.outcome === NotificationPersistenceOutcome.CONFLICT, 'H2b. the real store classifies this as CONFLICT, not EXISTING and not NEW.');

        // H3. The original notification remains completely unchanged.
        const afterConflict = infra.notificationEventStore.getById(originalEvent.notificationId);
        assert(afterConflict !== null && afterConflict.payload.authorIdentityId === originalEvent.payload.authorIdentityId,
            'H3. the original, already-persisted notification is untouched — same authorIdentityId, never overwritten by the conflicting claim.');

        // H4. The conflicting event is never itself persisted under its
        // own notificationId.
        assert(infra.notificationEventStore.getById(conflictingEvent.notificationId) === null,
            'H4. the rejected, conflicting event was never separately persisted.');
        assert(infra.notificationEventStore.loadAll().length === 1,
            'H4b. the durable notification history still contains exactly the one original row — no second row for the conflict, no silent overwrite.');

        // H5. Notification History — the real panel, wired to the real
        // query, over the SAME store the conflict was just attempted
        // against — remains unchanged.
        const historyCtx = openNotificationHistoryPanel(buildSessionFor(alice, infra).getRecipientNotificationEventsCommand);
        assert(historyCtx.notifications.length === 1 && historyCtx.notifications[0].payload.authorIdentityId === originalEvent.payload.authorIdentityId,
            'H5. Notification History still shows exactly the one original notification, with its original, unmodified authorIdentityId — the attempted CONFLICT never reached the publisher\'s own view.');

        console.log('✓ H: the real Commentary application path still cannot organically reach a notification CONFLICT on its own — reconfirming 0.9.282 Section G — but when a disagreeing event is handed directly to the real, already-populated production store, CONFLICT is correctly surfaced, the original notification is left completely unchanged, the conflicting event is never persisted, and Notification History reflects only the original, true record throughout.');
    }

    // ===============================================================
    // Section I — Publication lookup failure. Commentary succeeds;
    // Publication lookup misses; no notification is produced — no
    // rollback of the already-persisted Commentary, and no fabricated
    // recipient.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Lookup Miss World', 'alice'), alice);
        // A discoveryProvider that genuinely has never heard of this
        // Publication — deliberately separate from infra.discoveryProvider,
        // reproducing the exact edge case PublicationCommentaryNotificationProducer.js's
        // own header names ("this file does not assume its own
        // discoveryProvider is necessarily the same instance").
        const blindDiscoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());

        const bobSession = buildSessionFor(bob, infra, { producerDiscoveryProvider: blindDiscoveryProvider });
        const { commentary, isNew } = bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Publication invisible to the producer' });

        assert(isNew === true, 'I1. Commentary creation still succeeds — an authorized, already-persisted Commentary is never failed over a notification that has nowhere to go.');
        assert(infra.commentaryStore.getById(commentary.commentaryId) !== null, 'I2. the Commentary is durably on file.');
        assert(infra.notificationEventStore.loadAll().length === 0, 'I3. no notification is produced when the producer\'s own Publication lookup misses.');

        // I4. Never a fabricated recipient: no partial/placeholder
        // NotificationEvent exists anywhere, and the publisher's own
        // query genuinely sees nothing, honestly.
        const aliceNotifications = buildSessionFor(alice, infra).getRecipientNotificationEventsCommand();
        assert(aliceNotifications.length === 0, 'I4. the would-be publisher\'s own recipient query correctly reports zero notifications — never a fabricated one.');

        console.log('✓ I: a Publication lookup miss leaves Commentary creation completely successful, produces no notification, performs no rollback of the persisted Commentary, and fabricates no recipient anywhere in the chain.');
    }

    // ===============================================================
    // Section J — Notification persistence failure. Commentary persists;
    // notification persistence fails. This is the established, honest,
    // non-atomic boundary — documented here, not "fixed."
    // ===============================================================
    {
        const sharedStorage = new InMemoryStorageProvider();
        const failingStorage = new PartiallyFailingStorageProvider(sharedStorage, NOTIFICATION_EVENT_STORE_KEY);
        const infra = makeSharedInfrastructure(failingStorage);
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Notify Failure World', 'alice'), alice);

        const bobSession = buildSessionFor(bob, infra);
        let threw = false;
        try {
            bobSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Notification sink will fail' });
        } catch (error) {
            threw = true;
            assert(error.message === 'simulated storage failure for notification-events:entries',
                'J1. the storage provider\'s own failure message propagates unmodified.');
        }
        assert(threw, 'J1b. the genuine notification storage failure propagates out of the real, composed capability.');

        // J2. The Commentary, persisted BEFORE the failing sink ran, is
        // durably on file regardless — read it back through a fresh store
        // instance over the same (non-failing, for this key) storage.
        const reloadedCommentaryStore = new PublicationCommentaryStore(sharedStorage);
        const persisted = reloadedCommentaryStore.loadAll();
        assert(persisted.length === 1 && persisted[0].content === 'Notification sink will fail',
            'J2. the Commentary persisted before the notification write failure remains durably on file.');

        // J3. No notification exists anywhere for this Commentary — the
        // failure is never partially masked as a successful write.
        assert(infra.notificationEventStore.loadAll().length === 0, 'J3. no notification record exists for the failed write — not a partial one, not a stale one.');

        // J4. This is documented as an accepted, non-atomic boundary, not
        // silently patched: the composition root itself introduces no
        // transaction/rollback/compensation vocabulary.
        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(!/rollback|transaction|\.undo\(|compensat/i.test(compositionCode),
            'J4. application/CreateWorldViewUseCase.js contains no rollback/transaction/compensation vocabulary.');

        console.log('✓ J: "Commentary persisted + notification persistence failed" remains the honest, documented, non-atomic outcome — the genuine storage failure propagates unmodified, the already-persisted Commentary is untouched, no notification of any kind exists for it, and no transaction/rollback machinery was introduced to hide any of this.');
    }

    // ===============================================================
    // Section K — UI lifecycle. Create Commentary -> open Notifications
    // -> load -> refresh -> close -> reopen. Persistence is proven
    // unaffected by the panel's own mount/unmount cycle.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('UI Lifecycle World', 'alice'), alice);

        // Create.
        const bobSession = buildSessionFor(bob, infra);
        const commentaryCtx = commentaryPanelCtx({
            publication,
            getPublicationCommentariesCommand: bobSession.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: bobSession.addPublicationCommentaryCommand,
            viewerIdentityId: bob.getSigningIdentity().id
        });
        commentaryCtx.newCommentaryText = 'UI lifecycle check';
        commentaryCtx.submitPublicationCommentary();
        assert(commentaryCtx.publicationCommentaries.length === 1 && commentaryCtx.publicationCommentaryError === null,
            'K1. Commentary creation succeeds through the real, unmodified commentary panel flow.');

        const aliceSession = buildSessionFor(alice, infra);

        // Open + load (mounted() -> refreshNotificationHistory()).
        const firstOpen = openNotificationHistoryPanel(aliceSession.getRecipientNotificationEventsCommand);
        assert(firstOpen.notifications.length === 1 && firstOpen.notificationHistoryError === null,
            'K2. opening Notification History for the first time loads exactly the one real notification.');

        // Refresh, explicitly, more than once — an idempotent read that
        // never mutates the underlying store.
        firstOpen.refreshNotificationHistory();
        firstOpen.refreshNotificationHistory();
        assert(firstOpen.notifications.length === 1, 'K3. repeated explicit refreshes continue to show exactly one notification — no duplication from re-reading.');
        assert(infra.notificationEventStore.loadAll().length === 1, 'K3b. the underlying durable store still holds exactly one row after three separate reads.');

        // Close: simulated as simply discarding the ctx — this panel
        // holds no timers, subscriptions, or open handles to release (see
        // Section N's own architecture-regression check for "no
        // polling").

        // Reopen: a genuinely NEW panel ctx/mount, exactly like a real
        // user closing and reopening the dialog, wired to the SAME
        // underlying session/command.
        const secondOpen = openNotificationHistoryPanel(aliceSession.getRecipientNotificationEventsCommand);
        assert(secondOpen !== firstOpen, 'K4a. the reopened panel is a genuinely new ctx instance, not the same object reused.');
        assert(secondOpen.notifications.length === 1 && secondOpen.notificationHistoryError === null,
            'K4b. reopening shows exactly the same one real notification — persistence is unaffected by the panel having been closed and reopened.');
        assert(secondOpen.notifications[0].notificationId === firstOpen.notifications[0].notificationId,
            'K4c. it is the SAME durable notification (identical notificationId), not a freshly re-derived one.');

        // A second real Commentary submitted between the close and the
        // reopen is picked up correctly too — proving the panel's own
        // lifecycle neither caches stale state nor requires a special
        // "first load" path.
        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Second comment, after first reopen' });
        const thirdOpen = openNotificationHistoryPanel(aliceSession.getRecipientNotificationEventsCommand);
        assert(thirdOpen.notifications.length === 2, 'K5. a Commentary created between panel sessions is correctly visible on the next fresh open.');

        console.log('✓ K: create Commentary -> open Notifications -> load -> refresh (repeated) -> close -> reopen, exercised through the real, unmodified panels — durable persistence is completely unaffected by the Notification History panel\'s own mount/unmount lifecycle, and events created between sessions are correctly picked up on the next open.');
    }

    // ===============================================================
    // Section L — Identity closure. Six identifiers this arc has ever
    // named, explicitly distinguished: commentaryId, publicationId,
    // authorIdentityId, publisherIdentityId, recipientIdentityId,
    // notificationId. None are conflated.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice'); // publisher
        const bob = makeIdentity('Bob'); // commenter
        const publication = infra.publisherProvider.publish(makeDocument('Identity World', 'alice'), alice);

        const { commentary } = buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Identity closure check' });
        const event = infra.notificationEventStore.loadAll()[0];

        const identifiers = {
            commentaryId: commentary.commentaryId,
            publicationId: commentary.publicationId,
            authorIdentityId: commentary.authorIdentityId,
            publisherIdentityId: publication.publisherIdentity.id,
            recipientIdentityId: event.recipientIdentityId,
            notificationId: event.notificationId
        };

        // L1. publicationId and commentaryId are structurally independent
        // — publication.id was minted long before commentary.commentaryId
        // ever existed.
        assert(identifiers.publicationId === publication.id, 'L1a. Commentary.publicationId matches the real Publication\'s own id.');
        assert(identifiers.commentaryId !== identifiers.publicationId, 'L1b. commentaryId and publicationId are distinct values.');

        // L2. authorIdentityId (Bob) and publisherIdentityId (Alice) are
        // distinct in this non-self-comment case, and BOTH are distinct
        // from commentaryId/publicationId.
        assert(identifiers.authorIdentityId === bob.getSigningIdentity().id, 'L2a. authorIdentityId correctly names Bob, the actual commenter.');
        assert(identifiers.publisherIdentityId === alice.getSigningIdentity().id, 'L2b. publisherIdentityId correctly names Alice, the actual publisher.');
        assert(identifiers.authorIdentityId !== identifiers.publisherIdentityId, 'L2c. author and publisher are distinct identities for this (non-self) Commentary.');

        // L3. recipientIdentityId is DERIVED FROM publisherIdentityId (by
        // design — the notification is addressed to the publisher) —
        // this is the one deliberate equality this arc has ever adopted,
        // and it is verified explicitly here, not merely assumed.
        assert(identifiers.recipientIdentityId === identifiers.publisherIdentityId,
            'L3. recipientIdentityId equals publisherIdentityId — the ONE deliberate identity equality PublicationCommentaryNotificationProducer.js\'s own header establishes, confirmed directly rather than assumed.');
        // ...and recipientIdentityId is explicitly NOT the author's own id
        // in this case — a notification is never accidentally addressed
        // to whoever triggered it.
        assert(identifiers.recipientIdentityId !== identifiers.authorIdentityId, 'L3b. recipientIdentityId is never accidentally the commenter\'s own id.');

        // L4. notificationId is independently minted — never equal to,
        // derived from, or reused as any of the other five identifiers.
        assert(identifiers.notificationId !== identifiers.commentaryId
            && identifiers.notificationId !== identifiers.publicationId
            && identifiers.notificationId !== identifiers.authorIdentityId
            && identifiers.notificationId !== identifiers.publisherIdentityId
            && identifiers.notificationId !== identifiers.recipientIdentityId,
            'L4. notificationId is a genuinely independent identifier, never equal to any of the other five.');

        // L5. The persisted event's own payload carries commentaryId,
        // publicationId, and authorIdentityId verbatim — never
        // publisherIdentityId or notificationId duplicated INSIDE the
        // payload (those live only as the event's own top-level fields).
        assert(event.payload.commentaryId === identifiers.commentaryId, 'L5a. payload.commentaryId matches.');
        assert(event.payload.publicationId === identifiers.publicationId, 'L5b. payload.publicationId matches.');
        assert(event.payload.authorIdentityId === identifiers.authorIdentityId, 'L5c. payload.authorIdentityId matches.');
        assert(!('publisherIdentityId' in event.payload) && !('notificationId' in event.payload) && !('recipientIdentityId' in event.payload),
            'L5d. publisherIdentityId/recipientIdentityId/notificationId are never duplicated into the payload — each identifier lives in exactly one place.');

        // L6. The SELF-COMMENT case: author and recipient (and publisher)
        // are the SAME identity, deliberately, per PublicationCommentaryNotificationProducer.js's
        // own header — verified here as this section's own explicit
        // "when equality IS expected" control case, distinguishing it
        // from an accidental conflation.
        const selfSession = buildSessionFor(alice, infra);
        selfSession.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Self-comment for identity closure' });
        const selfEvents = infra.notificationEventStore.loadAll().filter((candidate) => candidate.payload.commentaryId !== commentary.commentaryId);
        assert(selfEvents.length === 1, 'L6a. the self-comment produced exactly one additional notification.');
        assert(selfEvents[0].payload.authorIdentityId === selfEvents[0].recipientIdentityId,
            'L6b. for a genuine self-comment, authorIdentityId and recipientIdentityId are legitimately, deliberately equal — the one case where that equality is CORRECT, not a bug.');

        console.log('✓ L: commentaryId, publicationId, authorIdentityId, publisherIdentityId, recipientIdentityId, and notificationId are six independently-tracked values throughout the real pipeline — related by exactly one deliberate design equality (recipientIdentityId === publisherIdentityId), never by accidental conflation, with the self-comment case explicitly distinguished as the one legitimate author-equals-recipient scenario.');
    }

    // ===============================================================
    // Section M — Failure isolation. Failures at each of five distinct
    // boundaries never silently masquerade as a successful notification.
    // ===============================================================
    {
        // M1. Commentary persistence failure — the notification producer
        // must never run at all; nothing downstream is ever touched.
        {
            const sharedStorage = new InMemoryStorageProvider();
            const failingStorage = new PartiallyFailingStorageProvider(sharedStorage, COMMENTARY_STORE_KEY);
            const infra = makeSharedInfrastructure(failingStorage);
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const publication = infra.publisherProvider.publish(makeDocument('M1 World', 'alice'), alice);

            let threw = false;
            try {
                buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Commentary write itself fails' });
            } catch (error) {
                threw = true;
            }
            assert(threw, 'M1a. a genuine Commentary storage failure propagates — never silently swallowed.');
            assert(infra.commentaryStore.loadAll().length === 0, 'M1b. no Commentary exists — the failing write never partially succeeded.');
            assert(infra.notificationEventStore.loadAll().length === 0,
                'M1c. no notification exists either — the producer never even ran, because AddPublicationCommentaryUseCase.execute() never returned successfully.');
        }

        // M2. Publication lookup failure — already fully covered as its
        // own Section I; reconfirmed here, in this section's own summary
        // form, as one of the five isolated boundaries this section
        // claims to check.
        {
            const infra = makeSharedInfrastructure();
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const publication = infra.publisherProvider.publish(makeDocument('M2 World', 'alice'), alice);
            const blindDiscoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
            const { isNew } = buildSessionFor(bob, infra, { producerDiscoveryProvider: blindDiscoveryProvider })
                .addPublicationCommentaryCommand({ publicationId: publication.id, content: 'M2 lookup miss' });
            assert(isNew === true, 'M2a. Commentary creation is isolated from the lookup failure.');
            assert(infra.notificationEventStore.loadAll().length === 0, 'M2b. no notification is fabricated when the lookup misses.');
        }

        // M3. Notification persistence failure — already fully covered
        // as its own Section J; reconfirmed compactly here.
        {
            const sharedStorage = new InMemoryStorageProvider();
            const failingStorage = new PartiallyFailingStorageProvider(sharedStorage, NOTIFICATION_EVENT_STORE_KEY);
            const infra = makeSharedInfrastructure(failingStorage);
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const publication = infra.publisherProvider.publish(makeDocument('M3 World', 'alice'), alice);
            let threw = false;
            try {
                buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'M3 notify fails' });
            } catch (error) { threw = true; }
            assert(threw, 'M3a. the notification write failure propagates.');
            assert(new PublicationCommentaryStore(sharedStorage).loadAll().length === 1, 'M3b. the Commentary itself, persisted first, is unaffected.');
            assert(infra.notificationEventStore.loadAll().length === 0, 'M3c. no notification masquerades as persisted.');
        }

        // M4. Recipient query failure — an unauthenticated identity must
        // FAIL the query cleanly, never silently return an empty list
        // that could be misread as "genuinely no notifications."
        {
            const infra = makeSharedInfrastructure();
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const publication = infra.publisherProvider.publish(makeDocument('M4 World', 'alice'), alice);
            buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'M4 real notification exists' });
            assert(infra.notificationEventStore.loadAll().length === 1, 'M4a. a real notification genuinely exists on file.');

            const nobody = makeUnauthenticatedIdentity('Nobody');
            const nobodyQuery = new GetRecipientNotificationEventsUseCase(infra.notificationEventStore, nobody);
            let threw = false;
            let message = null;
            try {
                nobodyQuery.execute();
            } catch (error) {
                threw = true;
                message = error.message;
            }
            assert(threw, 'M4b. querying with no authenticated identity throws — it is never silently reported as "zero notifications," which would be indistinguishable from a real, empty, authenticated history.');
            assert(message === 'GetRecipientNotificationEventsUseCase: sign in to view your notifications',
                'M4c. the failure is a specific, legible message — never a generic or swallowed error.');
        }

        // M5. UI rendering/loading failure — a thrown query error must
        // render as the panel's own DISTINCT error state, never silently
        // collapse into the "No notifications yet" empty state a genuine,
        // authenticated, empty history would show.
        {
            const infra = makeSharedInfrastructure();
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const publication = infra.publisherProvider.publish(makeDocument('M5 World', 'alice'), alice);
            buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'M5 real notification exists' });

            // A command that always throws — simulating a UI-layer read
            // failure (e.g. the injected use case itself misbehaving)
            // rather than a genuinely empty, successful read.
            const failingCommand = () => { throw new Error('simulated recipient query failure'); };
            const failingCtx = notificationPanelCtx({ getRecipientNotificationEventsCommand: failingCommand });
            failingCtx.refreshNotificationHistory();
            assert(failingCtx.notificationHistoryError === 'simulated recipient query failure',
                'M5a. a thrown read error is captured as the panel\'s own distinct error state.');
            assert(failingCtx.notifications.length === 0 && failingCtx.notificationHistoryError !== null,
                'M5b. the failed-read state is never rendered the same way a real, successful, empty history would be — notificationHistoryError distinguishes them.');

            // Contrast: a genuinely successful, non-empty read renders
            // with no error at all — the two states remain observably
            // different, side by side, from the SAME underlying data.
            const succeedingCtx = openNotificationHistoryPanel(buildSessionFor(alice, infra).getRecipientNotificationEventsCommand);
            assert(succeedingCtx.notificationHistoryError === null && succeedingCtx.notifications.length === 1,
                'M5c. the real, successful read for the SAME notification renders with no error and the actual notification — confirming M5a/M5b is a genuine failure-path distinction, not a fixture artifact.');
        }

        console.log('✓ M: failures at Commentary persistence, Publication lookup, notification persistence, recipient query authentication, and UI-layer rendering each surface distinctly and observably — none of the five ever silently masquerades as a successful notification delivery.');
    }

    // ===============================================================
    // Section N — Architecture regression. The completed chain still
    // carries no lifecycle vocabulary, no read/unread or delivery state,
    // no polling, no producer-side deduplication, no UI access to
    // storage, and no NotificationEvent mutation.
    // ===============================================================
    {
        const chainFiles = [
            'core/NotificationEvent.js',
            'core/NotificationDeduplicationPolicy.js',
            'application/PublicationCommentaryNotificationProducer.js',
            'storage/NotificationEventStore.js',
            'application/GetRecipientNotificationEventsUseCase.js',
            'ui/components/NotificationHistoryPanel.js'
        ];

        // N1. No lifecycle/delivery/read-state vocabulary anywhere in the
        // chain's own code (comments excluded — the files' own headers
        // discuss these terms extensively, by design, to explain why they
        // are absent).
        const forbiddenPattern = /\b(unread|read[_-]?state|delivered|delivery|deliveredAt|seen|acknowledg|ack\b|dismiss|expire[sd]?\b|ttl\b|queue|retry|priorit|preference)\b/i;
        for (const file of chainFiles) {
            let code = await codeOnlySource(file);
            // NotificationHistoryPanel.js's own rendered template carries
            // ONE deliberate exception: user-facing prose that explicitly
            // DISCLAIMS these very states ("not an inbox... there is no
            // read/unread state here") — the opposite of implementing
            // them. That disclaiming template markup is presentation
            // text, not program logic, so it is excluded from this
            // logic-vocabulary sweep the same way comments already are;
            // the component's actual data()/methods()/props (checked
            // above it, still inside `code`) remain fully in scope.
            if (file === 'ui/components/NotificationHistoryPanel.js') {
                const templateStart = code.indexOf('template: `');
                const templateEnd = code.lastIndexOf('`');
                if (templateStart !== -1 && templateEnd > templateStart) {
                    code = code.slice(0, templateStart) + code.slice(templateEnd + 1);
                }
            }
            assert(!forbiddenPattern.test(code), `N1. ${file}'s own CODE (comments and, for the one panel with a deliberate disclaiming sentence, its rendered template prose excluded) contains no lifecycle/delivery/read-state vocabulary. Offending text near: ${(code.match(forbiddenPattern) || [''])[0]}`);
        }

        // N2. No polling: no setInterval/setTimeout-driven refresh loop
        // anywhere in the chain, and specifically not in the panel.
        const panelCode = await codeOnlySource('ui/components/NotificationHistoryPanel.js');
        assert(!/setInterval|setTimeout|requestAnimationFrame|WebSocket|EventSource/.test(panelCode),
            'N2. NotificationHistoryPanel.js contains no polling/subscription/live-channel mechanism — load-once-plus-explicit-refresh only.');

        // N3. No producer-side deduplication: PublicationCommentaryNotificationProducer.js
        // holds no cache, no Set/Map of seen ids, and never calls
        // NotificationEventStore or the deduplication policy itself — it
        // only ever constructs an event and hands it to its injected sink.
        const producerCode = await codeOnlySource('application/PublicationCommentaryNotificationProducer.js');
        assert(!/NotificationEventStore|NotificationDeduplicationPolicy|new Set\(|new Map\(/.test(producerCode),
            'N3. PublicationCommentaryNotificationProducer.js never imports the store or the dedup policy, and holds no seen-id cache of its own — deduplication is entirely the store\'s responsibility.');

        // N4. No UI access to storage: NotificationHistoryPanel.js never
        // imports anything from storage/ or core/ directly — only the
        // thin function prop.
        assert(!/from ['"]\.\.\/\.\.\/storage\/|from ['"]\.\.\/\.\.\/core\//.test(await rawSource('ui/components/NotificationHistoryPanel.js')),
            'N4. NotificationHistoryPanel.js imports nothing from storage/ or core/ — it only ever calls the injected getRecipientNotificationEventsCommand function prop.');

        // N5. No NotificationEvent mutation: the class exposes only
        // getters and toJSON()/fromJSON() — no setter, no with*() method,
        // no mutation method of any kind.
        const eventCode = await codeOnlySource('core/NotificationEvent.js');
        assert(!/\bset\s+\w+\s*\(|\.push\(|\.splice\(|delete\s+this\._/.test(eventCode),
            'N5. NotificationEvent.js defines no setter, no in-place array mutation, and no field deletion — construct-once, read-only.');

        // N6. No new eventType vocabulary was introduced by this
        // milestone itself — PUBLICATION_COMMENTED_EVENT_TYPE remains the
        // one real, wired eventType in production.
        const activeEventTypes = await grepCount("_EVENT_TYPE = '", ['application'], { excludeSuffix: '' });
        assert(activeEventTypes === 1, `N6. exactly one production file defines an *_EVENT_TYPE constant (found ${activeEventTypes}) — no second producer/eventType was added.`);

        console.log('✓ N: the completed notification chain still carries no lifecycle vocabulary (no unread/read, delivered, seen, acknowledged, dismissed, TTL, queue, retry, priority, or preference), no polling or live channel, no producer-side deduplication cache, no UI access to storage, and no NotificationEvent mutation method — the architecture is exactly as small as 0.9.273-0.9.281 each left it.');
    }

    // ===============================================================
    // Section O — PERSISTED != DELIVERED != SEEN != READ. The permanent
    // architectural invariant this milestone's own brief asked to make
    // explicit: after 0.9.285, this system can honestly say "the
    // publisher has a durable notification record." It cannot say "the
    // publisher was notified." This section proves the distinction is
    // real, not merely asserted in prose, and confirms none of the three
    // latter states was introduced merely to make this section pass.
    // ===============================================================
    {
        const infra = makeSharedInfrastructure();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = infra.publisherProvider.publish(makeDocument('Persisted Not Delivered World', 'alice'), alice);

        // O1. PERSISTED holds true even though Alice's own recipient query
        // is NEVER once called — persistence does not require, and is not
        // gated on, the recipient ever asking. This is the concrete proof
        // that "persisted" and "delivered" are different claims: a real
        // delivery mechanism would have to actively push the fact to
        // Alice; this system does nothing of the kind, and the fact is
        // still durably true regardless.
        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: publication.id, content: 'Alice never asks for this' });
        assert(infra.notificationEventStore.loadAll().length === 1,
            'O1. the notification is durably PERSISTED with no recipient query of any kind ever having run — persistence never depends on delivery.');

        // O2. Reading the notification back (the closest thing to
        // "SEEN") never mutates the underlying record — no field flips,
        // no side effect of any kind. Read it twice and compare the exact
        // serialized bytes.
        const aliceSession = buildSessionFor(alice, infra);
        const firstRead = aliceSession.getRecipientNotificationEventsCommand();
        const firstReadJSON = JSON.stringify(firstRead.map((event) => event.toJSON()));
        const secondRead = aliceSession.getRecipientNotificationEventsCommand();
        const secondReadJSON = JSON.stringify(secondRead.map((event) => event.toJSON()));
        assert(firstReadJSON === secondReadJSON,
            'O2. reading the notification twice produces byte-identical results — a read has no side effect, proving there is no hidden SEEN flag anywhere being flipped by the act of querying.');

        // O3. Structural proof that DELIVERED/SEEN/READ states do not
        // exist anywhere reachable: NotificationEvent's own JSON shape,
        // and the store's own persisted record shape, expose exactly the
        // fields 0.9.273's header always promised — nothing else.
        const rawStoredJSON = infra.notificationEventStore.loadAll()[0].toJSON();
        const actualFields = Object.keys(rawStoredJSON).sort();
        assert(JSON.stringify(actualFields) === JSON.stringify(['createdAt', 'eventType', 'notificationId', 'payload', 'recipientIdentityId'].sort()),
            `O3. the durable record carries exactly five fields — notificationId, eventType, recipientIdentityId, createdAt, payload — and nothing named delivered/seen/read/acknowledged/dismissed. Found: ${actualFields.join(', ')}.`);

        // O4. No method on any of the CHAIN'S OWN classes claims to mark,
        // flip, or query a delivered/seen/read state — verified by public
        // surface enumeration, not merely by source grep (N1 already
        // covers the textual case; this is the executable one). Scoped
        // deliberately to the notification classes themselves, never
        // WorldNavigationSession's own full surface — that class carries
        // dozens of unrelated methods from entirely different domains
        // (e.g. `canReadDocument()`, about DOCUMENT access, nothing to do
        // with notification read state) whose names would produce false
        // positives having nothing to do with this invariant.
        const notificationSurfaces = [
            infra.notificationEventStore,
            new GetRecipientNotificationEventsUseCase(infra.notificationEventStore, alice),
            new PublicationCommentaryNotificationProducer(
                new AddPublicationCommentaryUseCase(infra.commentaryStore, alice, infra.canCommentOnPublicationUseCase),
                infra.discoveryProvider,
                () => {}
            )
        ];
        // Splits a camelCase method name into lowercase words and checks
        // for an EXACT word match against the forbidden vocabulary — never
        // a bare substring test, so a legitimate name like
        // `getByDeduplicationIdentity` is never mistaken for one containing
        // the word "read" or "id" out of context.
        const forbiddenWords = new Set(['mark', 'delivered', 'delivery', 'seen', 'read', 'unread', 'acknowledge', 'acknowledged', 'ack', 'dismiss', 'dismissed']);
        function forbiddenWordsIn(methodName) {
            const words = methodName.replace(/^_/, '').split(/(?=[A-Z])/).map((word) => word.toLowerCase());
            return words.filter((word) => forbiddenWords.has(word));
        }
        for (const surface of notificationSurfaces) {
            const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(surface)).filter((name) => name !== 'constructor' && typeof surface[name] === 'function');
            for (const methodName of methodNames) {
                const offendingWords = forbiddenWordsIn(methodName);
                assert(offendingWords.length === 0,
                    `O4. ${surface.constructor.name}#${methodName}() carries no delivery/seen/read/acknowledge/dismiss-shaped word (found: ${offendingWords.join(', ')}).`);
            }
        }
        // The panel is a plain options object (Vue's un-mounted component
        // descriptor), not a class instance — checked the same way over
        // its own `methods` keys.
        for (const methodName of Object.keys(NotificationHistoryPanel.methods)) {
            const offendingWords = forbiddenWordsIn(methodName);
            assert(offendingWords.length === 0,
                `O4b. NotificationHistoryPanel.methods.${methodName}() carries no delivery/seen/read/acknowledge/dismiss-shaped word (found: ${offendingWords.join(', ')}).`);
        }

        // O5. The honest claim this system can make, stated explicitly as
        // an executable assertion rather than only as prose: a
        // notification EXISTS durably (PERSISTED === true) is fully
        // decoupled from whether it was ever retrieved. Prove this by
        // constructing a SECOND recipient scenario where the notification
        // is persisted and the recipient's session is never even
        // constructed at all before the durability check runs.
        const carol = makeIdentity('Carol');
        const carolPub = infra.publisherProvider.publish(makeDocument('Carol Never Opens The App', 'carol'), carol);
        buildSessionFor(bob, infra).addPublicationCommentaryCommand({ publicationId: carolPub.id, content: 'Carol never logs in again' });
        const carolNotification = infra.notificationEventStore.loadAll().find((event) => event.payload.publicationId === carolPub.id);
        assert(carolNotification !== undefined,
            'O5. the notification for Carol is durably PERSISTED even though no session, query, or panel for Carol was ever constructed — proving PERSISTED is a fact about storage alone, never a fact about whether anyone actually received it.');

        console.log('✓ O (INVARIANT): PERSISTED, DELIVERED, SEEN, and READ are proven to be four different claims, and this system can only honestly make the first one. A notification persists with no recipient query ever run (O1); reading it twice is provably side-effect-free (O2); the durable record carries exactly five factual fields and nothing state-shaped (O3); no method anywhere in the chain is even NAMED for a delivery/seen/read/acknowledge concept (O4); and a notification for a recipient whose session was never even constructed is still fully, durably persisted (O5). This distinction is now a permanent architectural invariant, not an incidental omission — see docs/Principles.md.');
    }

    console.log('\n✅ All Notification End-to-End Lifecycle Audit tests passed.');
    console.log('\nVERDICT: The complete notification vertical slice — Commentary creation -> PublicationCommentaryNotificationProducer -> NotificationEvent -> NotificationDeduplicationPolicy -> NotificationEventStore -> GetRecipientNotificationEventsUseCase -> NotificationHistoryPanel — is proven correct end to end through the real application path, with no production defect found. The system can honestly claim durable, recipient-scoped notification PERSISTENCE. It cannot, and does not attempt to, claim DELIVERY.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationEndToEndLifecycleAudit tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationEndToEndLifecycleAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
