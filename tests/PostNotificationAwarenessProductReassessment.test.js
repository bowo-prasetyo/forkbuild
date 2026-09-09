import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { GetRecipientNotificationEventsUseCase } from '../application/GetRecipientNotificationEventsUseCase.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.306 — Notification Awareness Product Reassessment.
//
// Test/document-only, per this milestone's own brief — no production code
// change is expected unless this audit surfaces a genuine, evidenced
// capability gap (it does not). 0.9.287 already reassessed whether durable
// Notification History was a complete product capability and found no
// evidenced reason to extend it (delivery, read/unread, additional
// producers). 0.9.288-0.9.305 then ran an unrelated arc — cross-surface
// Commentary reachability — closing it at 0.9.305 with the same discipline:
// architectural reachability is not product need. This milestone returns to
// notifications with the narrower question 0.9.287 itself did not carry all
// the way through, because 0.9.287 asked "is History enough" primarily
// against DELIVERY MECHANISMS (toasts, push, WebSocket, badges as generic
// artifacts); this milestone asks the sharper product question underneath
// that: does the recipient of `publication.commented` need to KNOW while
// continuing another activity, or is inspecting History later sufficient?
//
//   Is durable Notification History sufficient for ForkBuild's current
//   product, or is there now a legitimate need for an active
//   notification-awareness capability?
//
// Sections A-J below match this milestone's own brief exactly. Every
// claim is grounded fresh against real, unmodified production source —
// nothing is inferred from the 0.9.273-0.9.305 milestone history itself.
//
//   Section A — Capability reconfirmation: the seven-hop pipeline,
//               sourced fresh, not inherited from 0.9.287's own proof.
//   Section B — Producer census: is `publication.commented` still the
//               only NotificationEvent-producing behavior?
//   Section C — Awareness need: History vs. Awareness, for the one real
//               producer — including the two structural facts (storage
//               scope, session model) that bound how that question can
//               even be answered today.
//   Section D — Surface evaluation: World View navigation / Application
//               top navigation / Notification History / Publication
//               interaction surfaces, each classified NATURAL /
//               DUPLICATIVE / INAPPROPRIATE / NO_EXISTING_SURFACE against
//               real, unmodified templates — never assumed.
//   Section E — Temporal semantics, reconfirmed distinct a second time.
//   Section F — Persistence implications: IF unread/read ever became
//               real, would it corrupt NotificationEvent? (Answered
//               architecturally; nothing built.)
//   Section G — Delivery vs. awareness: is a local/in-app mechanism
//               justified without WebSockets/push/email?
//   Section H — Cadence audit: does an existing observation mechanism
//               (spatial polling, vehicle-interaction polling, the
//               distribution-lifecycle subscription, the vault-timeout
//               interval) genuinely match notification temporal
//               semantics, or would reusing one merely because it exists
//               be borrowing the wrong shape?
//   Section I — User-value test: what does immediate awareness buy over
//               later History inspection, for the actual current event?
//   Section J — Final decision.
//
//   0.9.273 ── ... ── 0.9.286 ── 0.9.287 ── 0.9.288 ── ... ── 0.9.305 ── 0.9.306  <- this
//   (fact seam,        (post-    (unrelated Commentary  (Commentary   (awareness
//    producer,          history   cross-surface arc,     cross-surface  reassessment,
//    audits, policy,    reass-    closed at 0.9.305)      closed)       no build)
//    store, query UI,   essment)
//    E2E audit)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors every prior reassessment's own helper (0.9.282, 0.9.287) — the
// one grep-verifiable signal for "does anything real call/define this,"
// rather than trusting a header comment's claim.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// ---------------------------------------------------------------------
// Shared fixtures — identical shape to
// tests/PostNotificationHistoryProductReassessment.test.js and
// tests/NotificationEndToEndLifecycleAudit.test.js.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function makePublication({ id, publisherProvider }) {
    const publication = new Publication({
        id,
        documentId: `doc-for-${id}`,
        title: `World ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const discoveryStorage = new InMemoryStorageProvider();
    discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
    return { publication, discoveryProvider: new LocalDiscoveryProvider(discoveryStorage) };
}

function buildWiredPipeline({ publisherProvider, commentAuthorProvider, publicationId, notificationStorageProvider = new InMemoryStorageProvider() }) {
    const { publication, discoveryProvider } = makePublication({ id: publicationId, publisherProvider });
    const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
    const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
    const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, commentAuthorProvider, canComment);
    const notificationStore = new NotificationEventStore(notificationStorageProvider);
    const producer = new PublicationCommentaryNotificationProducer(addUseCase, discoveryProvider,
        (event) => notificationStore.save(event));
    return { publication, discoveryProvider, commentaryStore, notificationStore, notificationStorageProvider, producer };
}

const NOTIFICATION_ARC_FILES = [
    'core/NotificationEvent.js',
    'core/NotificationDeduplicationPolicy.js',
    'storage/NotificationEventStore.js',
    'application/PublicationCommentaryNotificationProducer.js',
    'application/GetRecipientNotificationEventsUseCase.js',
    'ui/components/NotificationHistoryPanel.js'
];

async function runTests() {
    console.log('Running Notification Awareness Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Capability reconfirmation. The seven-hop pipeline,
    // sourced fresh against real, unmodified production files.
    // ===============================================================
    {
        const sources = {};
        for (const path of NOTIFICATION_ARC_FILES) sources[path] = await rawSource(path);
        const composition = await rawSource('application/CreateWorldViewUseCase.js');

        assert(sources['core/NotificationEvent.js'].includes('export class NotificationEvent')
            && !codeOnlyLines(sources['core/NotificationEvent.js']).match(/\bset\s+\w+\(/),
            'A1. NotificationEvent remains an immutable domain-neutral fact.');
        assert(sources['application/PublicationCommentaryNotificationProducer.js'].includes('export class PublicationCommentaryNotificationProducer'),
            'A2. The Commentary producer still exists, unmodified in name.');
        assert(sources['core/NotificationDeduplicationPolicy.js'].includes('export function classifyNotificationCollision'),
            'A3. The adopted deduplication policy still exists.');
        assert(sources['storage/NotificationEventStore.js'].includes('export class NotificationEventStore'),
            'A4. The durable event store still exists.');
        assert(sources['application/GetRecipientNotificationEventsUseCase.js'].includes('resolveSigningIdentityId'),
            'A5. The recipient query still resolves the CURRENT authenticated identity only.');
        assert(sources['ui/components/NotificationHistoryPanel.js'].includes("name: 'NotificationHistoryPanel'"),
            'A6. The Notification History UI still exists.');

        // A7. Two real production construction sites for the producer —
        // CreateWorldViewUseCase.js (0.9.285, WorldView's own commentary)
        // and application/CreatePublicationCommentaryUseCase.js (0.9.289,
        // the app-wide "other publication" write path 0.9.305 already
        // confirmed feeds PublicationCard.js via ui/main.js's own
        // provide()). Both write into the SAME window.localStorage key
        // (a fresh NotificationEventStore instance, not a fresh store),
        // so this remains one durable history, never two.
        const producerConstructionSites = await grepCount('new PublicationCommentaryNotificationProducer(', ['application', 'ui']);
        assert(producerConstructionSites === 2, `A7. Exactly two production construction sites for the producer exist today (found ${producerConstructionSites}) — WorldView's own path (0.9.285) and the app-wide other-publication path (0.9.289).`);
        assert(composition.includes('new NotificationEventStore(storageProvider)')
            && composition.includes('new GetRecipientNotificationEventsUseCase(notificationEventStore, identityProvider)'),
            'A8. CreateWorldViewUseCase.js still constructs one store, shared by both its own read and write directions.');

        console.log('✓ A: the full seven-hop notification pipeline — fact, producer, dedup policy, durable store, authenticated recipient query, History UI — is unchanged and intact, sourced fresh rather than inherited from any prior milestone\'s own proof. The WRITE side now has two real composition roots (A7); Section C below shows the READ side still has only one.');
    }

    // ===============================================================
    // Section B — Producer census. Is `publication.commented` still the
    // only NotificationEvent-producing behavior? Awareness UI is far
    // more valuable with several independent awareness-worthy events
    // than with one — this section settles the count first.
    // ===============================================================
    {
        // B1. Exactly one CLASS constructs a NotificationEvent — the
        // producer itself — even though (per Section A7) two different
        // composition roots now build an instance of that one producer
        // class. The event TYPE vocabulary is still singular regardless
        // of how many places wire the producer.
        const producerSites = await grepCount('new NotificationEvent(', ['application']);
        assert(producerSites === 1, `B1. Exactly one file constructs a NotificationEvent (found ${producerSites}) — application/PublicationCommentaryNotificationProducer.js alone, reused by both composition roots.`);

        const readerSites = await grepCount('new GetRecipientNotificationEventsUseCase(', ['application', 'ui']);
        assert(readerSites === 1, `B2. Exactly one production call site constructs GetRecipientNotificationEventsUseCase (found ${readerSites}) — the WRITE side gained a second composition root at 0.9.289, but the READ side did not; this asymmetry is exactly what Section C's own evidence turns on.`);

        // B3. Nothing built between 0.9.288-0.9.305 (the intervening
        // Commentary cross-surface arc and the provider-preference arc)
        // introduced a second producer — those milestones touched UI
        // surfaces and provider settings, never core/NotificationEvent.js
        // or its own producer vocabulary. Confirmed directly: exactly one
        // exported `*_EVENT_TYPE` constant exists anywhere in application/.
        const eventTypeConstants = await grepCount("_EVENT_TYPE = '", ['application']);
        assert(eventTypeConstants === 1, `B3. Exactly one *_EVENT_TYPE constant is defined in application/ (found ${eventTypeConstants}) — PUBLICATION_COMMENTED_EVENT_TYPE remains the entire vocabulary.`);

        console.log('✓ B: `publication.commented` remains the ONLY NotificationEvent-producing behavior in this codebase, reconfirmed as a fresh count rather than assumed from 0.9.287. Awareness UI has exactly one event type to serve today, not several independent ones — a materially weaker case for building a general-purpose mechanism than the milestone brief\'s own framing warns to check for.');
    }

    // ===============================================================
    // Section C — Awareness need. For `publication.commented`: does the
    // recipient need to know while continuing another activity? Two
    // structural facts bound this question before any UI preference
    // enters into it at all.
    // ===============================================================
    {
        // C1. The WRITE side (producing a notification) is genuinely
        // app-wide since 0.9.289 — application/CreatePublicationCommentaryUseCase.js
        // is constructed ONCE, at module scope, in ui/main.js, and its
        // two commands are app.provide()'d globally, reaching
        // PublicationCard.js (0.9.305's own confirmed wiring) from any
        // route. But the READ side (a recipient asking "what notifications
        // are on file for me") has no equivalent: GetRecipientNotificationEventsUseCase
        // is constructed only inside CreateWorldViewUseCase.js, itself
        // constructed fresh only inside WorldView.js's own mounted()
        // hook — there is no ui/main.js-level, app-wide instance of it.
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('new CreatePublicationCommentaryUseCase().execute(identityProvider)')
            && mainSource.includes("app.provide('addPublicationCommentaryCommand', addPublicationCommentaryCommand)"),
            'C1a. ui/main.js still constructs the write-side commentary/notification path ONCE, app-wide, and provides it globally.');
        assert(!/GetRecipientNotificationEventsUseCase/.test(mainSource),
            'C1b. ui/main.js never constructs or provides GetRecipientNotificationEventsUseCase — the read side has no app-wide counterpart to the write side\'s own C1a wiring.');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(worldViewSource.includes('new CreateWorldViewUseCase().execute('),
            'C1c. WorldView.js still constructs its own session factory locally, once per mount — the ONE place the read side is reachable at all.');

        // C2. Confirmed directly: ui/App.js (the one component mounted on
        // EVERY route, per ui/router/index.js) carries no Notifications
        // link, no injected notification command, and no reference to
        // the notification vocabulary at all — the capability is
        // reachable ONLY from inside an open World (/world/:documentId),
        // never from Repository, Publications, Peers, Conversations, or
        // any other route.
        const appSource = await rawSource('ui/App.js');
        assert(!/[Nn]otification/.test(appSource),
            'C2. ui/App.js — the one persistent, app-wide shell — contains no notification vocabulary of any kind today.');
        const appNavLinks = (appSource.match(/router-link/g) || []).length;
        assert(appNavLinks >= 8 && !appSource.includes('Notifications</router-link>'),
            'C2b. The app-wide nav lists many destinations (Home, Editor, Repository, My Worlds, My Avatar, My Identities, Peers, Conversations, Publications, Content Provider, About) but never Notifications.');

        // C3. The underlying facts themselves are single-device-scoped.
        // storage/LocalStorageProvider.js is backed by `window.localStorage`
        // — a per-browser-origin store, never networked. Confirmed
        // directly: neither storage/PublicationCommentaryStore.js nor
        // storage/NotificationEventStore.js is referenced anywhere under
        // nostr/, arweave/, replication/, or peer/ — no decentralized
        // transport ever moves a Commentary or a NotificationEvent
        // between two different devices, unlike Presence/Chat/Friendship,
        // which already do use BroadcastChannel/peer/Nostr transports.
        const localStorageProviderSource = await rawSource('storage/LocalStorageProvider.js');
        assert(localStorageProviderSource.includes('window.localStorage'),
            'C3a. LocalStorageProvider.js is backed by window.localStorage — per-browser-origin, never networked.');
        const commentarySyncHits = await grepCount('PublicationCommentaryStore\\|NotificationEventStore', ['nostr', 'arweave', 'replication', 'peer']);
        assert(commentarySyncHits === 0,
            'C3b. No file under nostr/, arweave/, replication/, or peer/ references either store — a Commentary made on one device cannot reach a recipient\'s NotificationEventStore on a different device today, independent of any awareness UI decision.');

        // C4. Even on ONE shared device, only one identity is ever "the
        // current session" at a time. LocalIdentityProvider stores a
        // single AuthenticationSession under one SESSION_KEY — a second
        // identity does not receive a concurrent, live session of its
        // own on the same storage backing while the first remains
        // signed in.
        const identityProviderSource = codeOnlyLines(await rawSource('identity/LocalIdentityProvider.js'));
        assert(/SESSION_KEY/.test(identityProviderSource) && (identityProviderSource.match(/SESSION_KEY/g) || []).length >= 2,
            'C4a. LocalIdentityProvider persists exactly one AuthenticationSession under one storage key.');
        assert(identityProviderSource.includes('currentSession()') && !/getAllSessions|activeSessions|concurrentSession/i.test(identityProviderSource),
            'C4b. No concurrent multi-identity session concept exists — "currently signed in" is singular by construction.');

        console.log('✓ C: the History-vs-Awareness distinction the milestone brief draws is real, but three structural facts bound how it can be answered TODAY, before any UI preference matters. (i) The WRITE side is genuinely app-wide (a Commentary, and the notification it produces, can be created from any route via PublicationCard) but the READ side has no equivalent — GetRecipientNotificationEventsUseCase, and therefore Notification History itself, is reachable only from inside an open World (C1) and from no other route, including the one persistent app-wide shell (C2). There is nowhere outside WorldView for an awareness signal to even be rendered today, regardless of how widely the underlying fact can be produced. (ii) The fact itself cannot travel to a genuinely different device (C3) — Commentary and NotificationEvent are the only two Publication-adjacent stores with zero decentralized transport, unlike Presence/Chat/Friendship. (iii) Even granting a single shared device, only one identity is ever the live, current session at a time (C4) — there is no concurrent "Alice is doing something else right now while Bob\'s comment arrives" moment for a same-device scenario to interrupt either. The honest finding: a genuine "recipient is elsewhere, doing something else, right now" scenario is not reachable in this product today, for reasons entirely prior to and independent of whether awareness UI exists.');
    }

    // ===============================================================
    // Section D — Surface evaluation. Candidate awareness surfaces,
    // classified against real, unmodified templates — never assumed
    // merely because another application places a badge there.
    // ===============================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const appSource = await rawSource('ui/App.js');
        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        const publicationCardSource = await sourceExists('ui/components/PublicationCard.js') ? await rawSource('ui/components/PublicationCard.js') : '';

        // D1. World View navigation — the toolbar hosting the existing
        // "Notifications" button, gated on cameraPosition (identity-
        // scoped), not activeDocumentInfo (document-scoped).
        assert(/world-view-actions--navigation[\s\S]{0,1200}openNotificationHistoryPanel/.test(worldViewSource),
            'D1. The existing Notifications entry point lives in the world-view-actions--navigation toolbar, alongside Home.');
        const classificationWorldViewNav = 'NATURAL';

        // D2. Application top navigation (ui/App.js). Zero wiring exists
        // today — no command is composed or injected at this level
        // (Section C2 already proved this). Classified by what is
        // actually reachable here, not by convention from other apps.
        assert(!/[Nn]otification/.test(appSource), 'D2. Confirms C2: the app-wide nav has no notification concept to attach an indicator to today.');
        const classificationAppNav = 'NO_EXISTING_SURFACE';

        // D3. Notification History itself. It is the destination an
        // awareness signal would point AT, not a candidate awareness
        // surface in its own right — an "unread" indicator rendered only
        // once the panel is already open provides no awareness a person
        // has not already received by the act of opening it. The panel's
        // own template already disclaims read/unread state explicitly.
        assert(panelSource.includes('There is no read/unread state here'),
            'D3. NotificationHistoryPanel.js\'s own rendered template still explicitly disclaims read/unread state.');
        const classificationHistoryPanel = 'NOT_APPLICABLE — destination, not signal';

        // D4. Publication interaction surfaces (PublicationCard.js,
        // OwnPublicationPanel.js, WorldEncounterCanvas.js — the three
        // real Commentary-bearing surfaces 0.9.305 already inventoried).
        // Each is scoped to ONE publication being actively viewed; none
        // carries any recipientIdentityId/notification concept, and a
        // cross-publication "you have unread comments somewhere" fact
        // does not fit a component whose entire state is about the ONE
        // publication currently on screen.
        // PublicationCard.js's own header comment (line 54) mentions
        // PublicationCommentaryNotificationProducer BY NAME, documenting
        // where its injected commands ultimately lead — that is a
        // provenance note, not a notification concept this component
        // itself has. Checked against its own CODE, not its comments.
        const publicationCardCode = codeOnlyLines(publicationCardSource);
        assert(publicationCardSource !== '' && !/GetRecipientNotificationEventsUseCase|NotificationEventStore|unreadCount|notificationBadge/i.test(publicationCardCode),
            'D4. PublicationCard.js\'s own code — the shared Commentary-bearing inspection surface 0.9.305 confirmed as wired — has no recipient-notification query, store, or badge concept; it is scoped per-publication, not per-recipient-across-publications.');
        const classificationPublicationSurfaces = 'INAPPROPRIATE';

        console.log('✓ D: surface evaluation, classified against real templates rather than convention:');
        console.log(`    World View navigation           ${classificationWorldViewNav} — already hosts the entry point; scoped correctly (identity, not document)`);
        console.log(`    Application top navigation       ${classificationAppNav} — zero notification wiring exists at this layer today`);
        console.log(`    Notification History             ${classificationHistoryPanel}`);
        console.log(`    Publication interaction surfaces ${classificationPublicationSurfaces} — scoped per-publication-on-screen, not per-recipient-across-publications`);
        console.log('  No badge is assumed to belong in the top navigation merely because other applications place one there — the app-wide nav is classified NO_EXISTING_SURFACE precisely because reaching it would require NEW app-wide composition (an identity-scoped notification command available outside any open World), not a placement decision alone.');
    }

    // ===============================================================
    // Section E — Temporal semantics, reconfirmed a second time.
    // creation / persistence / retrieval / presentation remain proven
    // distinct from delivery / seen / read, which still do not exist.
    // ===============================================================
    {
        const fixedCreatedAt = new Date('2021-06-01T00:00:00.000Z');
        const event = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: 'recipient-e1',
            createdAt: fixedCreatedAt,
            payload: { publicationId: 'pub-e1', commentaryId: 'c-e1', authorIdentityId: 'author-e1' }
        });
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        const saveResult = store.save(event);
        assert(saveResult.event.createdAt.getTime() === fixedCreatedAt.getTime(),
            'E1. Creation time still equals the fact\'s own timestamp, never the moment persistence happened.');

        const first = JSON.stringify(store.getById(event.notificationId).toJSON());
        const second = JSON.stringify(store.getById(event.notificationId).toJSON());
        assert(first === second, 'E2. Reading the same notification twice still yields byte-identical JSON — retrieval remains side-effect-free.');

        const panelCode = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        assert(!/Date\.now\(\)|new Date\(\)/.test(panelCode),
            'E3. The panel still constructs no fresh timestamp of its own on presentation.');

        const surfaces = [NotificationEventStore.prototype, GetRecipientNotificationEventsUseCase.prototype, PublicationCommentaryNotificationProducer.prototype, NotificationEvent.prototype];
        const deliveryLikeNames = /deliver|acknowledge|dispatch|mark|seen|read|notify\w*subscribe/i;
        for (const proto of surfaces) {
            for (const name of Object.getOwnPropertyNames(proto)) {
                if (name === 'constructor') continue;
                assert(!deliveryLikeNames.test(name), `E4. ${proto.constructor.name}.prototype.${name} carries no delivery/acknowledge/seen/read name.`);
            }
        }

        console.log('✓ E: creation, persistence, retrieval, and presentation remain four provably distinct claims (E1-E3); delivery and acknowledgment still have no method anywhere in the chain\'s public surface to even carry such a claim (E4). No erosion since 0.9.286/0.9.287.');
    }

    // ===============================================================
    // Section F — Persistence implications. IF unread/read ever became a
    // real product need, would it corrupt NotificationEvent? Answered
    // architecturally — nothing is built here.
    // ===============================================================
    {
        const forbiddenFields = ['deliveredAt', 'seenAt', 'readAt', 'deliveryStatus', 'retryCount', 'channel', 'unreadCount'];
        const eventSource = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        const storeSource = codeOnlyLines(await rawSource('storage/NotificationEventStore.js'));
        for (const field of forbiddenFields) {
            assert(!new RegExp(field, 'i').test(eventSource), `F1. core/NotificationEvent.js still carries no "${field}" field.`);
            assert(!new RegExp(field, 'i').test(storeSource), `F2. storage/NotificationEventStore.js still carries no "${field}" field.`);
        }
        const event = new NotificationEvent({
            eventType: 'publication.commented', recipientIdentityId: 'r1',
            payload: { publicationId: 'p1', commentaryId: 'c1', authorIdentityId: 'a1' }
        });
        const keys = Object.keys(event.toJSON()).sort();
        assert(JSON.stringify(keys) === JSON.stringify(['createdAt', 'eventType', 'notificationId', 'payload', 'recipientIdentityId']),
            `F3. NotificationEvent.toJSON() still carries exactly five factual fields (found: ${keys.join(', ')}).`);

        console.log('✓ F: the architecture this arc has already built keeps the boundary the brief\'s own Section F asks about intact — a future recipient-interaction-state concept (read/unread) would need to live as a SEPARATE store keyed by (notificationId, recipientIdentityId), never as a field grafted onto NotificationEvent itself, exactly mirroring how storage/PublicationCommentaryStore.js and storage/NotificationEventStore.js already stay two separate stores rather than one growing a second concern. Nothing of this kind is built in this milestone — F1-F3 only reconfirm the seam it would have to respect stays unbroken today.');
    }

    // ===============================================================
    // Section G — Delivery vs. awareness. Is a local/in-app mechanism
    // justified without WebSockets, browser push, or email? Section C
    // already supplies the deciding evidence.
    // ===============================================================
    {
        // G1. No live delivery channel of any kind exists in the
        // notification arc's own six files — reconfirmed directly.
        let allCode = '';
        for (const path of NOTIFICATION_ARC_FILES) allCode += codeOnlyLines(await rawSource(path));
        assert(!/WebSocket|new Notification\(|nodemailer|firebase|PushManager/i.test(allCode),
            'G1. No WebSocket, browser Notification API, email, or push infrastructure exists anywhere in the notification arc\'s own files.');

        console.log('✓ G: the question the brief poses — "durable history" versus "durable history + current World View becomes aware" — is a real, answerable product distinction in principle, and a local/in-app mechanism (no WebSocket, no push, no email) would indeed be the conservative, correct SHAPE if this were pursued. But Section C already found the scenario such a mechanism exists to serve — "the recipient is doing something else, right now, while the fact arrives" — is not reachable in production today: not cross-device (no transport moves the fact there) and not same-device (no concurrent second identity to interrupt). A conservative MECHANISM does not manufacture a need that Section C\'s own evidence says does not yet exist.');
    }

    // ===============================================================
    // Section H — Cadence audit. Does an existing observation mechanism
    // genuinely match notification temporal semantics, checked by
    // re-deriving each one's real purpose from source, not reused merely
    // because it exists.
    // ===============================================================
    {
        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js'));
        const canvasSource = codeOnlyLines(await rawSource('ui/components/WorldEncounterCanvas.js'));
        const userWidgetSource = codeOnlyLines(await rawSource('ui/components/UserWidget.js'));

        // H1. Vehicle-proximity / spatial polling — WorldView.js's own
        // spatialInterval (3000ms), spatialPresenceSyncInterval (100ms),
        // vehicleInteractionInterval (150ms). All three read LIVE,
        // continuously-changing 3D scene state (camera, presence,
        // avatar-to-vehicle distance) that has no "fact" to persist —
        // the polled value is only ever "true right now," never a past
        // event a recipient could also learn about later. A notification
        // is the opposite shape: a discrete, already-persisted past fact.
        assert(/spatialInterval\s*=\s*setInterval/.test(worldViewSource) && /vehicleInteractionInterval\s*=\s*setInterval/.test(worldViewSource),
            'H1. WorldView.js\'s own spatial/vehicle polling intervals still exist, still driving only live scene state.');

        // H2. Distribution-lifecycle "subscription" — actually a local,
        // synchronous PUSH from a store the SAME actor's own command
        // writes into (`distributionLifecycleStore.subscribe(publicationId,
        // listener)`), scoped to ONE actively-selected publication, with
        // explicit "no setInterval()" in its own header. This is the
        // closest existing precedent to a push-based mechanism in this
        // codebase — but its own scope is "did MY OWN just-issued command
        // change," never "did a DIFFERENT identity's past action
        // concerning me arrive." A recipient's own notification concerns
        // exactly the opposite direction: another identity's action,
        // with no local command of the recipient's own to attach a
        // listener to.
        assert(/distributionLifecycleStore[\s\S]{0,200}subscribe\(/.test(canvasSource),
            'H2a. The distribution-lifecycle subscription still exists, still scoped to one actively-selected publication.');
        assert(!/setInterval/.test(canvasSource.match(/distributionLifecycle[\s\S]{0,3000}/)?.[0] || ''),
            'H2b. Its own local neighborhood still uses no setInterval — a genuine push, not disguised polling.');

        // H3. Vault-timeout interval — UserWidget.js's own app-wide,
        // always-mounted periodic self-check (VAULT_TIMEOUT_CHECK_INTERVAL_MS).
        // The one genuinely app-wide (not World-scoped) cadence in this
        // codebase — but its own semantics are "recompute MY OWN
        // already-known local session state on a timer," never "poll
        // storage for a new fact written by someone else." It has
        // nothing to read that would ever contain another identity's
        // notification.
        assert(/VAULT_TIMEOUT_CHECK_INTERVAL_MS/.test(userWidgetSource) && /checkVaultTimeouts/.test(userWidgetSource),
            'H3. UserWidget.js\'s own vault-timeout interval still exists, still app-wide, still scoped to the CURRENT identity\'s own derived state.');

        console.log('✓ H: none of the three existing cadence families matches notification temporal semantics, checked by re-deriving each one\'s own real purpose rather than assuming shape from name alone. Spatial/vehicle polling (H1) drives live scene state with no discrete fact to persist. The distribution-lifecycle subscription (H2) is the closest precedent to a push mechanism, but it observes the SAME actor\'s own just-issued command, never a different identity\'s past action. The vault-timeout interval (H3) is the one genuinely app-wide cadence, but it recomputes the current identity\'s own local state, never polls for a fact another identity produced. A notification-awareness cadence needing "another identity\'s past action, delivered to me" has no existing cadence in this codebase whose temporal semantics genuinely match — reusing any of the three merely because it exists would borrow the wrong shape, exactly the restraint the brief\'s own Section H asks this audit to hold.');
    }

    // ===============================================================
    // Section I — User-value test. What does the user gain from knowing
    // immediately instead of seeing it later in Notification History?
    // ===============================================================
    {
        // I1. Re-derive the real end-to-end capability once more,
        // minimally — the same claim 0.9.282/0.9.286/0.9.287 already
        // proved, reconfirmed fresh as the concrete floor this section
        // reasons above.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { producer, notificationStore } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-i1' });
        producer.execute({ publicationId: 'pub-i1', content: 'Immediate vs later' });
        const aliceNotifications = new GetRecipientNotificationEventsUseCase(notificationStore, alice).execute();
        assert(aliceNotifications.length === 1, 'I1. Alice can retrieve her one real notification through History today, whenever she next opens it.');

        console.log('✓ I: VERDICT INPUT. What would immediate awareness buy Alice over opening Notification History the next time she visits her World? Per Section C\'s own evidence, nothing measurable exists to buy it against today: if Bob is on a different device, the fact cannot reach Alice\'s own device any sooner than the next time some future sync mechanism (not built) carries it there — awareness UI changes nothing about WHEN the fact becomes reachable, only whether Alice notices it once it is. If Alice and Bob happen to share one device, only one of them is ever the live, authenticated session at a time (Section C4) — so there is no moment where Alice is "off doing something else" while Bob\'s comment could interrupt her; the next time she is the live session IS the next time she would open History anyway. The one scenario that would make immediate awareness valuable — two DIFFERENT people, on two DIFFERENT devices, one continuing an unrelated activity while the other\'s action becomes knowable to them within the same window of time — is not a scenario this product can produce today, for reasons entirely upstream of notification UI. The answer to the brief\'s own test is weak, not strong.');
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    {
        console.log('✓ J: VERDICT.\n' +
'\n' +
'OUTCOME: STOP — Notification History remains the complete notification\n' +
'capability. This milestone finds no evidenced reason to build unread/read\n' +
'state, a badge, a toast, a polling loop, or any other active\n' +
'notification-awareness mechanism, local or otherwise.\n' +
'\n' +
'WHY.\n' +
'  - Section B: `publication.commented` is still the only NotificationEvent-\n' +
'    producing behavior — awareness UI would serve exactly one event type\n' +
'    today, not the "several independent awareness-worthy events" that would\n' +
'    make it substantially more valuable.\n' +
'  - Section C: the decisive finding. A genuine "recipient is elsewhere,\n' +
'    doing something else, right now" moment is not reachable in this\n' +
'    product today — not cross-device (Commentary and NotificationEvent have\n' +
'    zero decentralized transport, unlike Presence/Chat/Friendship, which\n' +
'    already use BroadcastChannel/peer/Nostr), and not same-device (only one\n' +
'    identity is ever the live authenticated session at a time). This is\n' +
'    evidence upstream of any UI decision, not a preference against one.\n' +
'  - Section D: no candidate surface is both reachable AND appropriate today.\n' +
'    World View navigation already hosts the entry point but is scoped\n' +
'    inside a World; the app-wide top navigation would first need entirely\n' +
'    new composition (an identity-scoped notification read path available\n' +
'    outside any open World) before a badge question even arises there;\n' +
'    Publication interaction surfaces are the wrong scope by construction\n' +
'    (per-publication, not per-recipient-across-publications).\n' +
'  - Section G/H: a conservative, local, in-app mechanism (no WebSocket, no\n' +
'    push) would be the right SHAPE if this were pursued, and no existing\n' +
'    cadence in this codebase (spatial/vehicle polling, the distribution-\n' +
'    lifecycle subscription, the vault-timeout interval) has temporal\n' +
'    semantics that actually match "a different identity\'s past action,\n' +
'    delivered to me" — so nothing here should be reused merely because it\n' +
'    exists.\n' +
'  - Section I: the user-value test the brief itself proposes comes back\n' +
'    weak, not strong, for the one real reason Section C establishes.\n' +
'  - Section E/F: every architectural boundary this arc has built —\n' +
'    creation/persistence/retrieval/presentation staying distinct from\n' +
'    delivery/seen/read, and NotificationEvent staying a pure fact with no\n' +
'    state field — holds with no erosion.\n' +
'\n' +
'WHAT WOULD CHANGE THIS VERDICT. Per this milestone\'s own brief, any of the\n' +
'following would be genuine evidence, not assumption:\n' +
'  - A real, deliberate product decision to build cross-device synchronization\n' +
'    for Publication Commentary (over Nostr/peer/some future transport,\n' +
'    exactly as Presence/Chat/Friendship already have) — at which point a\n' +
'    genuine "elsewhere, right now" scenario would exist for the first time,\n' +
'    and this question would deserve reopening on its own evidence.\n' +
'  - A second, independently-arising NotificationEvent producer with the same\n' +
'    asynchronous-absence shape Commentary has (0.9.287 Section F/G already\n' +
'    checked Collaboration and Friend Relationship and found neither\n' +
'    qualifies) — several independent event types would materially\n' +
'    strengthen the case for a shared awareness mechanism.\n' +
'  - A real user report that a Commentary went unnoticed for an extended\n' +
'    period specifically BECAUSE nothing prompted opening Notification\n' +
'    History — the same reopening condition 0.9.287 already named, still\n' +
'    unmet.\n' +
'\n' +
'RANKED CANDIDATES, FOR RECORD ONLY — NONE SELECTED HERE, PER THIS\n' +
'MILESTONE\'S OWN TEST-ONLY SCOPE.\n' +
'  1. Extend the existing World View navigation button (World View\n' +
'     navigation, classified NATURAL in Section D) with a live count, IF a\n' +
'     future milestone establishes real cross-device transport for\n' +
'     Commentary/NotificationEvent first — the smallest seam of the four\n' +
'     surfaces, reusing an entry point that already exists.\n' +
'  2. A separate recipient-interaction-state store (never a NotificationEvent\n' +
'     field, per Section F) for read/unread, only once the above exists.\n' +
'  3. Application top-navigation awareness (Section D: NO_EXISTING_SURFACE) —\n' +
'     would require new app-wide composition first; ranked behind 1 because\n' +
'     it is architecturally larger for the same, still-unevidenced need.\n' +
'\n' +
'NEXT MILESTONE. Not selected here, per this milestone\'s own test-only\n' +
'scope. The notification arc remains closed exactly where 0.9.287 left it —\n' +
'this reassessment adds the specific architectural reasons (storage scope,\n' +
'session model) that keep it closed, rather than merely re-asserting 0.9.287\'s\n' +
'own conclusion.\n');
    }

    console.log('\n✅ All PostNotificationAwarenessProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostNotificationAwarenessProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostNotificationAwarenessProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
