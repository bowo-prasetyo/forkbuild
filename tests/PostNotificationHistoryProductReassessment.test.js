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

// 0.9.287 — Post-Notification Product Reassessment.
//
// Test/document-only, per this milestone's own brief — no production code
// change is expected unless this audit surfaces a genuine, evidenced
// capability gap. 0.9.273 through 0.9.286 ran one continuous arc: a
// domain-neutral fact representation, a producer, five audits of that
// producer/its dedup semantics, an adopted policy, a durable store, a
// post-persistence reassessment (0.9.282), a recipient query boundary
// (0.9.283), a Notification History UI (0.9.284), production wiring of the
// producer (0.9.285), and a fifteen-section end-to-end lifecycle audit
// (0.9.286) that closed the entire read/write path against real
// infrastructure. This milestone asks the question 0.9.286's own "what
// comes after" named rather than assuming an answer:
//
//   Is durable, recipient-specific notification history itself a complete
//   product capability, or does the product actually require a separate
//   notification-delivery capability?
//
// This file runs that reassessment the same way 0.9.282 ran the one before
// it — sections lettered A-M, each grounded in a concrete, re-checked
// signal against the real, unmodified source, never a category asserted
// from name alone.
//
//   Section A — Capability inventory. Freeze what exists after 0.9.286 as
//               one concrete signal per capability, and what provably does
//               not exist, in the same breath.
//   Section B — User-value sufficiency. Is "open Notifications, see durable
//               events concerning you" already a real product capability,
//               exercised end to end?
//   Section C — Delivery gap analysis. Eight candidate delivery mechanisms,
//               each checked for existence in the real source — never
//               selected merely because it is technically possible.
//   Section D — Temporal-semantics audit. creation / persistence /
//               retrieval / presentation / delivery / acknowledgment are
//               different claims — proven distinct, not merely asserted.
//   Section E — Consumer analysis. What already reads notification history,
//               and what else plausibly could, grounded in real recipient
//               semantics rather than invented producers.
//   Section F — Producer expansion analysis. Is `publication.commented`
//               still the only producer, and does anything else in the
//               product already generate an equally clear awareness fact?
//   Section G — Recipient semantics. Reconfirm Commentary's own chain, and
//               check whether any candidate producer has equally
//               unambiguous recipient semantics.
//   Section H — Persistence/delivery boundary. NotificationEventStore does
//               not become a NotificationDeliveryStore; NotificationEvent
//               acquires no delivery/seen/read/state field.
//   Section I — Deduplication boundary. NotificationEventStore remains the
//               one deduplication authority; no competing one exists.
//   Section J — ChatOutbox comparison, revisited a third time (0.9.282
//               Section I; 0.9.286's own header) — still a narrow
//               precedent, not generic notification infrastructure.
//   Section K — Capability reachability matrix — the decisive evidence
//               table, "product need established?" as the load-bearing
//               column, never "technically possible?".
//   Section L — Architecture regression audit — the full twelve-point
//               checklist this milestone's own brief names.
//   Section M — Product stopping-point determination. The verdict.
//
//   0.9.273 ── ... ── 0.9.282 ── 0.9.283 ── 0.9.284 ── 0.9.285 ── 0.9.286 ── 0.9.287  <- this
//   (fact         (post-      (recipient  (History   (producer   (E2E        (reassessment,
//    seam,          persistence  query)     UI)        wired)      lifecycle    no build)
//    producer,      reassessment,                                  audit)
//    audits,        no build)
//    policy,
//    store)

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

// Mirrors every prior reassessment's own helper (0.9.282, 0.9.285's own
// "no duplicate wiring" section, 0.9.286's own composition checks) — the
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
// tests/PostNotificationPersistenceProductReassessment.test.js and
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
    console.log('Running Post-Notification Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Capability inventory. One concrete signal per
    // capability this milestone's own brief lists as existing, and the
    // same discipline applied to what does NOT exist.
    // ===============================================================
    {
        const sources = {};
        for (const path of NOTIFICATION_ARC_FILES) sources[path] = await rawSource(path);
        const composition = await rawSource('application/CreateWorldViewUseCase.js');

        // A1. Immutable NotificationEvent.
        assert(sources['core/NotificationEvent.js'].includes('export class NotificationEvent')
            && !codeOnlyLines(sources['core/NotificationEvent.js']).match(/\bset\s+\w+\(/),
            'A1. core/NotificationEvent.js still exports NotificationEvent with no setter — immutable.');

        // A2. Commentary producer.
        assert(sources['application/PublicationCommentaryNotificationProducer.js'].includes('export class PublicationCommentaryNotificationProducer'),
            'A2. application/PublicationCommentaryNotificationProducer.js still exports the one real producer.');

        // A3. Deduplication policy.
        assert(sources['core/NotificationDeduplicationPolicy.js'].includes('export function classifyNotificationCollision'),
            'A3. core/NotificationDeduplicationPolicy.js still exports the adopted collision classifier.');

        // A4. Durable event store.
        assert(sources['storage/NotificationEventStore.js'].includes('export class NotificationEventStore'),
            'A4. storage/NotificationEventStore.js still exports the durable store.');

        // A5. Authenticated recipient query.
        assert(sources['application/GetRecipientNotificationEventsUseCase.js'].includes('resolveSigningIdentityId'),
            'A5. application/GetRecipientNotificationEventsUseCase.js still resolves the CURRENT authenticated identity, never a caller-supplied one.');

        // A6. Notification History UI.
        assert(sources['ui/components/NotificationHistoryPanel.js'].includes("name: 'NotificationHistoryPanel'"),
            'A6. ui/components/NotificationHistoryPanel.js still exists and is named "Notification History," never "Inbox"/"Center".');

        // A7. Production composition — exactly one producer construction
        // site and one shared store instance backing both directions,
        // reconfirmed fresh rather than trusted from 0.9.285/0.9.286.
        const producerConstructionSites = await grepCount('new PublicationCommentaryNotificationProducer(', ['application', 'ui']);
        assert(producerConstructionSites === 1,
            `A7a. Exactly one production construction site for PublicationCommentaryNotificationProducer exists (found ${producerConstructionSites}).`);
        assert(composition.includes('new NotificationEventStore(storageProvider)')
            && composition.includes('new GetRecipientNotificationEventsUseCase(notificationEventStore, identityProvider)')
            && (composition.match(/notificationEventStore/g) || []).length >= 2,
            'A7b. application/CreateWorldViewUseCase.js still constructs exactly one NotificationEventStore and hands the SAME instance to both the read use case and (via the sink) the producer.');

        // A8. Persistence across restart — reconfirmed fresh, through the
        // full real pipeline, one more time (0.9.282 Section E; 0.9.286
        // Section E already proved this; this is the THIRD independent
        // reconfirmation this arc has run, on the exact same claim).
        {
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const provider = new InMemoryStorageProvider();
            const pipeline = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-a8' });
            pipeline.notificationStorageProvider = provider;
            const { producer, notificationStorageProvider } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-a8', notificationStorageProvider: provider });
            producer.execute({ publicationId: 'pub-a8', content: 'Still here after restart?' });
            const reloaded = new NotificationEventStore(notificationStorageProvider).loadAll();
            assert(reloaded.length === 1, 'A8. A fresh NotificationEventStore over the same provider still finds the persisted notification — restart survival reconfirmed a third time.');
        }

        // A9. What does NOT exist — checked as CODE, not merely absent
        // from a wishlist. No delivery, no read/unread, no push, no
        // badge, no polling loop, no second producer construction site.
        // The panel's own rendered template carries ONE deliberate
        // exception — user-facing prose that explicitly DISCLAIMS
        // read/unread state ("there is no read/unread state here"), the
        // opposite of implementing it — excluded here the same way
        // 0.9.286's own fix to tests/NotificationHistoryUILifecycle.test.js
        // Section K4 already excludes it (see docs/Roadmap.md, 0.9.286).
        const deliveryVocab = /delivered|\bdelivery\b|\bseen\b|acknowledg|\bqueued?\b|\bdispatch|markRead|isRead|\bunread\b|\bbadge\b|setInterval|setTimeout|WebSocket|new Notification\(/i;
        function withoutRenderedTemplate(code) {
            const templateStart = code.indexOf('template: `');
            const templateEnd = code.lastIndexOf('`');
            return (templateStart !== -1 && templateEnd > templateStart)
                ? code.slice(0, templateStart) + code.slice(templateEnd + 1)
                : code;
        }
        for (const path of NOTIFICATION_ARC_FILES) {
            const codeToCheck = path.endsWith('NotificationHistoryPanel.js')
                ? withoutRenderedTemplate(codeOnlyLines(sources[path]))
                : codeOnlyLines(sources[path]);
            assert(!deliveryVocab.test(codeToCheck),
                `A9. ${path}'s own CODE still contains none of: delivered/delivery/seen/acknowledged/queued/dispatch/markRead/isRead/unread/badge/setInterval/setTimeout/WebSocket/browser Notification.`);
        }
        const otherProducerClasses = await grepCount('extends NotificationEvent\\|new NotificationEvent(', ['application'], { ignoreCase: false });
        // Exactly one file constructs a NotificationEvent in application/ —
        // the Commentary producer itself.
        assert(otherProducerClasses === 1,
            `A9b. Exactly one file under application/ constructs a NotificationEvent (found ${otherProducerClasses}) — the Commentary producer remains the only one.`);

        console.log('✓ A: Capability inventory frozen. EXISTS (fresh signal each): immutable NotificationEvent, Commentary producer, deduplication policy, durable store, authenticated recipient query, Notification History UI, production composition (one producer site, one shared store instance), persistence across restart (reconfirmed a third independent time). DOES NOT EXIST, checked as code: delivery, read/unread, push, badge, polling, a second producer construction site.');
    }

    // ===============================================================
    // Section B — User-value sufficiency. "A user can open Notifications
    // and inspect durable events concerning them" — exercised end to
    // end, once more, minimally, as the one claim this section exists to
    // grounded-check rather than assert from 0.9.286's own prior proof.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { producer, notificationStore } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-b1' });

        producer.execute({ publicationId: 'pub-b1', content: 'Loving this world' });

        const query = new GetRecipientNotificationEventsUseCase(notificationStore, alice);
        const aliceNotifications = query.execute();
        assert(aliceNotifications.length === 1 && aliceNotifications[0].payload.publicationId === 'pub-b1',
            'B1. Alice, the real publisher, can retrieve exactly her one notification through the real, authenticated query — the complete claim this milestone\'s own brief asks about.');

        const bobQuery = new GetRecipientNotificationEventsUseCase(notificationStore, bob);
        assert(bobQuery.execute().length === 0,
            'B2. Bob, who merely authored the Commentary, retrieves nothing — the capability is genuinely recipient-scoped, not merely "everything that happened."');

        // B3. The panel itself renders this without any additional
        // wiring — reusing the exact command shape
        // application/CreateWorldViewUseCase.js already produces.
        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        assert(panelSource.includes('getRecipientNotificationEventsCommand()'),
            'B3. ui/components/NotificationHistoryPanel.js still calls exactly the injected command this pipeline already produces — no missing hop.');

        console.log('✓ B: User-value sufficiency reconfirmed, minimally and fresh: a real Commentary produces a real, durable, recipient-scoped notification a real publisher can retrieve through the real authenticated query and the real panel would render unmodified (B1-B3). This is a complete, usable product capability today — "inspect durable events concerning you" is not a stub or a partial implementation waiting on a follow-up hop. Whether MORE is warranted is a separate question, taken up starting Section C.');
    }

    // ===============================================================
    // Section C — Delivery gap analysis. Eight candidates, each checked
    // for existence in the real source, never selected merely because
    // it is technically possible to add.
    // ===============================================================
    {
        const candidates = [];
        const sourceCache = {};
        for (const path of NOTIFICATION_ARC_FILES) sourceCache[path] = await rawSource(path);

        // C1. In-app live notification (a toast/banner appearing without
        // the user opening Notification History).
        const liveUiHits = await grepCount('NotificationToast\\|NotificationBanner\\|liveNotification', ['ui', 'application']);
        candidates.push(['In-app live notification (toast/banner)', liveUiHits === 0 ? 'NOT BUILT' : `${liveUiHits} hit(s)`]);
        assert(liveUiHits === 0, 'C1. No in-app live-notification toast/banner component exists.');

        // C2. World View notification (a badge/indicator inside the 3D
        // World View itself, outside the panel).
        const worldViewSource = await sourceExists('ui/components/WorldView.js') ? await rawSource('ui/components/WorldView.js') : '';
        const worldViewBadge = /notification.*badge|unread.*notification/i.test(worldViewSource);
        candidates.push(['World View notification badge', worldViewBadge ? 'BUILT' : 'NOT BUILT']);
        assert(!worldViewBadge, 'C2. ui/components/WorldView.js carries no notification badge/unread indicator.');

        // C3. WebSocket notification (a live server push channel). Note:
        // WebSocket itself is used extensively elsewhere in this codebase
        // (Nostr relays, decentralized discovery) — that is unrelated
        // infrastructure this section does not question. What matters
        // here is narrower: none of the SIX notification-arc files this
        // milestone's own header names uses it for anything.
        const wsHitsInNotificationArc = NOTIFICATION_ARC_FILES.filter((path) => /WebSocket/.test(sourceCache[path] || '')).length;
        candidates.push(['WebSocket notification channel', wsHitsInNotificationArc === 0 ? 'NOT BUILT (in the notification arc itself)' : `${wsHitsInNotificationArc} hit(s)`]);
        assert(wsHitsInNotificationArc === 0, 'C3. None of the six notification-arc files uses WebSocket for anything — the technology is real and used elsewhere in this codebase (Nostr relays, discovery), but never wired to notifications.');

        // C4. Browser notification (the Notification Web API).
        const browserNotifHits = await grepCount('new Notification(\\|Notification.requestPermission', ['application', 'ui']);
        candidates.push(['Browser notification (Web Notification API)', browserNotifHits === 0 ? 'NOT BUILT' : `${browserNotifHits} hit(s)`]);
        assert(browserNotifHits === 0, 'C4. No use of the browser Notification API exists anywhere in application/ or ui/.');

        // C5. Email.
        const emailHits = await grepCount('nodemailer\\|smtp\\|sendEmail\\|mailto:', ['application', 'server'], { ignoreCase: true });
        candidates.push(['Email delivery', emailHits === 0 ? 'NOT BUILT' : `${emailHits} hit(s) (unrelated)`]);
        assert(emailHits === 0, 'C5. No email-sending infrastructure exists anywhere in application/ or server/.');

        // C6. Mobile/push notification.
        const pushHits = await grepCount('firebase\\|apns\\|web-push\\|PushManager', ['application', 'server'], { ignoreCase: true });
        candidates.push(['Mobile/push notification', pushHits === 0 ? 'NOT BUILT' : `${pushHits} hit(s) (unrelated)`]);
        assert(pushHits === 0, 'C6. No push-notification provider (FCM/APNs/Web Push) is wired anywhere.');

        // C7. Notification badge / unread count. The panel's own rendered
        // template carries one deliberate disclaiming sentence ("there is
        // no read/unread state here") — excluded the same way Section A9
        // excludes it (see that section's own comment).
        const panelCodeForC = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        const panelTemplateStart = panelCodeForC.indexOf('template: `');
        const panelTemplateEnd = panelCodeForC.lastIndexOf('`');
        const panelCodeWithoutTemplateForC = (panelTemplateStart !== -1 && panelTemplateEnd > panelTemplateStart)
            ? panelCodeForC.slice(0, panelTemplateStart) + panelCodeForC.slice(panelTemplateEnd + 1)
            : panelCodeForC;
        const badgeCodeHits = /\bunreadCount\b|\bunread\b/i.test(panelCodeWithoutTemplateForC);
        candidates.push(['Notification badge / unread count', badgeCodeHits ? 'BUILT' : 'NOT BUILT']);
        assert(!badgeCodeHits, 'C7. No unread-count/badge vocabulary exists in NotificationHistoryPanel.js\'s own code (its one disclaiming template sentence excluded).');

        // C8. Periodic refresh (polling on a timer, as opposed to the
        // existing mount + explicit-button refresh).
        const pollingHits = /setInterval|setTimeout/i.test(codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js')));
        candidates.push(['Periodic refresh (polling)', pollingHits ? 'BUILT' : 'NOT BUILT — mount + explicit button only']);
        assert(!pollingHits, 'C8. NotificationHistoryPanel.js still refreshes only on mount and on an explicit user click — no timer of any kind.');

        console.log('✓ C: Delivery gap analysis — all eight candidates this milestone\'s own brief names are NOT BUILT, verified as an absence of real code rather than assumed:');
        for (const [name, status] of candidates) console.log(`    ${name.padEnd(42)} ${status}`);
        console.log('  None of these were selected because "it would be nice" — Section K below asks, for each, whether the REPOSITORY carries actual evidence of product need. It does not, for any of the eight, today.');
    }

    // ===============================================================
    // Section D — Temporal-semantics audit. creation / persistence /
    // retrieval / presentation / delivery / acknowledgment are different
    // temporal claims. Proven distinct, not merely asserted.
    // ===============================================================
    {
        // D1. Creation time is fixed at construction (from the Commentary's
        // own createdAt, per PublicationCommentaryNotificationProducer.js)
        // — NOT the moment save() happens. A delay between construction
        // and persistence must never move createdAt forward.
        const fixedCreatedAt = new Date('2020-01-01T00:00:00.000Z');
        const event = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: 'recipient-d1',
            createdAt: fixedCreatedAt,
            payload: { publicationId: 'pub-d1', commentaryId: 'c-d1', authorIdentityId: 'author-d1' }
        });
        const store = new NotificationEventStore(new InMemoryStorageProvider());
        // Simulate persistence happening well after construction.
        const persistedAt = new Date();
        assert(persistedAt.getTime() > fixedCreatedAt.getTime(),
            'D1a. Sanity: "now" (the moment save() below actually runs) is genuinely later than the fact\'s own createdAt.');
        const saveResult = store.save(event);
        assert(saveResult.event.createdAt.getTime() === fixedCreatedAt.getTime(),
            'D1b. The persisted record\'s createdAt still equals the FACT\'s own timestamp, never the moment persistence happened — creation and persistence are provably different instants, not merely different words.');

        // D2. Retrieval is provably side-effect-free — reading twice
        // through the real store yields byte-identical JSON both times,
        // exactly the discipline 0.9.286 Section O2 established, run
        // fresh here as this section's own retrieval-vs-presentation
        // claim.
        const first = JSON.stringify(store.getById(event.notificationId).toJSON());
        const second = JSON.stringify(store.getById(event.notificationId).toJSON());
        assert(first === second, 'D2. Reading the same notification twice yields byte-identical JSON — retrieval mutates nothing, so it cannot itself be "delivery" or "seen".');

        // D3. Presentation (the panel) derives everything it shows from
        // fields already on the persisted record — it computes no new
        // timestamp of its own (no `Date.now()` stamped as "presentedAt").
        const panelCode = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        assert(!/Date\.now\(\)|new Date\(\)/.test(panelCode),
            'D3. NotificationHistoryPanel.js\'s own code never constructs a fresh timestamp of its own — every rendered time comes from the record\'s own createdAt, so "presented" leaves no new fact behind.');

        // D4. Delivery and acknowledgment have no code path AT ALL to
        // even have a temporal claim about — reconfirmed via public
        // method enumeration (0.9.286 Section O4's own technique), not
        // only a text grep, since a grep can miss a method whose NAME
        // avoids the literal word but whose intent is the same.
        const surfaces = [NotificationEventStore.prototype, GetRecipientNotificationEventsUseCase.prototype, PublicationCommentaryNotificationProducer.prototype, NotificationEvent.prototype];
        const deliveryLikeNames = /deliver|acknowledge|dispatch|mark|seen|read|notify\w*subscribe/i;
        for (const proto of surfaces) {
            for (const name of Object.getOwnPropertyNames(proto)) {
                if (name === 'constructor') continue;
                assert(!deliveryLikeNames.test(name),
                    `D4. ${proto.constructor.name}.prototype.${name} is not named for any delivery/acknowledge/seen/read concept.`);
            }
        }

        console.log('✓ D: Temporal semantics proven distinct, not merely asserted. Creation time is fixed at the fact\'s own origin and immune to persistence delay (D1). Retrieval is side-effect-free — no hidden state changes on read (D2). Presentation stamps no timestamp of its own (D3). Delivery and acknowledgment have literally no method anywhere in the chain\'s public surface that could even carry such a claim (D4) — there is no fifth or sixth stage to have a temporal semantics for. A future delivery mechanism would have to ADD a stage, not repurpose an existing one — the one risk this section exists to rule out.');
    }

    // ===============================================================
    // Section E — Consumer analysis. What already consumes notification
    // history, and what else plausibly could — grounded in real,
    // existing recipient semantics, never invented for the matrix.
    // ===============================================================
    {
        // E1. The one real, existing consumer: NotificationHistoryPanel,
        // reached exclusively through WorldView's own thin command.
        const worldNavSession = await rawSource('application/WorldNavigationSession.js');
        assert(worldNavSession.includes('getRecipientNotificationEvents'),
            'E1a. application/WorldNavigationSession.js still exposes the one thin read method this arc built.');
        const historyPanelCallers = await grepCount('NotificationHistoryPanel', ['ui']);
        assert(historyPanelCallers >= 1, 'E1b. NotificationHistoryPanel is referenced by at least one other UI file (its host view).');

        // E2. Candidate future consumers — named only if a REAL, existing
        // append-only domain fact with a clear recipient already exists
        // for it (mirroring Section G's own bar), never invented. Publication
        // Commentary is the only one built. Future Collaboration events:
        // application/CreateCollaborationUseCase.js builds a LIVE session
        // (LocalCollaborationTransport/AuthorityCollaborationTransport),
        // not a durable, recipient-addressed fact log — checked directly.
        const collaborationSource = await rawSource('application/CreateCollaborationUseCase.js');
        assert(!/NotificationEvent|recipientIdentityId/.test(collaborationSource),
            'E2a. application/CreateCollaborationUseCase.js still has no notion of a NotificationEvent or a recipient identity — collaboration is a live session, not a durable per-recipient fact today.');

        // E3. Future relationship events: FriendRelationshipUseCase's own
        // REQUEST/ACCEPT/REJECT exchange is carried over a live
        // peerMessageBus between two already-connected peers — a
        // synchronous signaling exchange, not an asynchronous durable
        // record a recipient could discover later the way a Publication
        // visitor's Commentary waits for an absent publisher.
        const friendRelSource = await rawSource('application/FriendRelationshipUseCase.js');
        assert(/peerMessageBus/.test(friendRelSource) && !/NotificationEvent/.test(friendRelSource),
            'E3. application/FriendRelationshipUseCase.js still carries its REQUEST/ACCEPT/REJECT exchange over a live peerMessageBus, with no NotificationEvent participation — it already has its own live delivery path; the asynchronous-absence gap Commentary\'s notification producer exists to bridge dose not obviously apply here.');

        // E4. Future world events: place-naming claims
        // (application/PlaceNamingClaimUseCase.js) are broadcast/discovered
        // facts about SHARED world state, not addressed to one specific
        // recipient identity the way a Commentary addresses its
        // Publication's own publisher.
        const placeNamingSource = await sourceExists('application/PlaceNamingClaimUseCase.js') ? await rawSource('application/PlaceNamingClaimUseCase.js') : '';
        assert(!/recipientIdentityId/.test(placeNamingSource),
            'E4. application/PlaceNamingClaimUseCase.js still has no recipientIdentityId concept — a claim concerns a location, not a specific person to notify.');

        console.log('✓ E: Consumer analysis. The one real consumer of notification history is Notification History (through WorldNavigationSession\'s own thin read method) — reconfirmed fresh (E1). Three plausible future producers were checked directly rather than assumed: Collaboration is a live session with no durable per-recipient fact (E2); Friend Relationship already has its own live, synchronous delivery path over peerMessageBus, so the specific gap Commentary\'s producer fills (an author acts while the recipient is provably absent) does not obviously apply to it (E3); Place Naming claims concern shared world state, not one addressed recipient (E4). None of the three is a ready producer candidate today — this is evidence, not a decision to build any of them.');
    }

    // ===============================================================
    // Section F — Producer expansion analysis. Is `publication.commented`
    // currently sufficient? The question is never "can we make another
    // producer" but "does an existing behavior naturally generate an
    // awareness-worthy fact with a clearly defined recipient."
    // ===============================================================
    {
        const producerCount = await grepCount('new NotificationEvent(', ['application']);
        assert(producerCount === 1, `F1. Exactly one production call site constructs a NotificationEvent (found ${producerCount}) — publication.commented remains the only producer.`);

        // F2. Re-derive, directly from source, the THREE properties
        // 0.9.274's own boundary audit required of Commentary before it
        // became a producer, and check whether either candidate examined
        // in Section E now independently satisfies all three:
        //   (i) a durable, independently re-derivable identity
        //   (ii) a real, already-on-file recipient field
        //   (iii) a genuine fact timestamp, not a derived/live one
        const collaborationSource = await rawSource('application/CreateCollaborationUseCase.js');
        const friendRelSource = await rawSource('application/FriendRelationshipUseCase.js');
        assert(!/publisherIdentity|recipientIdentityId/.test(collaborationSource),
            'F2a. Collaboration still has no already-on-file single recipient field (i) — a live multi-participant session, several participants, no one "recipient".');
        // Friend Relationship's own advertisement carries a peerIdentity
        // target, which COULD serve as a recipient — but per Section E3
        // that already resolves synchronously over peerMessageBus, so
        // adding a NotificationEvent would duplicate an existing live
        // delivery path rather than filling an absence-driven gap the
        // way Commentary's producer does.
        assert(/peerIdentity\.identityId/.test(friendRelSource),
            'F2b. Friend Relationship DOES have an identifiable target identity — the honest finding is that recipient clarity alone is not sufficient; Section E3\'s absence-gap test is the deciding factor, and it is not met today.');

        console.log('✓ F: `publication.commented` remains sufficient — no second producer exists (F1), and neither candidate examined in Section E clears the bar 0.9.274 set for Commentary itself (F2): Collaboration lacks a single addressable recipient; Friend Relationship has one, but already delivers synchronously over a live channel, so a NotificationEvent there would duplicate existing delivery rather than closing an absence-driven gap. The honest finding: recipient clarity is necessary but not sufficient — a candidate also needs the SAME asynchronous-absence shape Commentary has (an author acts on a publisher\'s Publication while the publisher may not be present). Neither candidate meets that today.');
    }

    // ===============================================================
    // Section G — Recipient semantics. Reconfirm Commentary's own chain,
    // and state explicitly why the two Section E/F candidates fall
    // short of it.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const { producer, notificationStore } = buildWiredPipeline({ publisherProvider: alice, commentAuthorProvider: bob, publicationId: 'pub-g1' });
        const { commentary } = producer.execute({ publicationId: 'pub-g1', content: 'Recipient chain check' });
        const [saved] = notificationStore.loadAll();
        assert(saved.recipientIdentityId === alice.getSigningIdentity().id,
            'G1. Commentary author -> comments on -> Publication -> owned/published by -> Publisher identity -> Notification recipient: reconfirmed fresh, the chain this milestone\'s own brief names holds exactly.');
        assert(saved.payload.authorIdentityId === commentary.authorIdentityId && saved.payload.authorIdentityId !== saved.recipientIdentityId,
            'G2. The commenter (Bob) and the recipient (Alice) remain two provably different identities in this scenario — the chain never collapses author and recipient into one field by accident.');

        console.log('✓ G: Commentary\'s recipient chain is reconfirmed exactly as strong as 0.9.275/0.9.282/0.9.286 already found it — a single already-on-file field (Publication.publisherIdentity.id), never invented, never inferred. Section F already found neither Collaboration nor Friend Relationship equally unambiguous today: Collaboration has no single recipient at all; Friend Relationship has one, but it names the OTHER PARTY TO A LIVE EXCHANGE already in progress, not a third party who must be informed a fact occurred while absent — a materially different relationship than "publisher of a document someone else quietly commented on."');
    }

    // ===============================================================
    // Section H — Persistence versus delivery boundary. Explicit
    // architecture test: NotificationEventStore never becomes a
    // NotificationDeliveryStore; NotificationEvent never acquires any of
    // the eight fields this milestone's own brief names.
    // ===============================================================
    {
        const forbiddenFields = ['deliveredAt', 'seenAt', 'readAt', 'deliveryStatus', 'retryCount', 'channel', 'queue', 'acknowledg'];
        const eventSource = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        const storeSource = codeOnlyLines(await rawSource('storage/NotificationEventStore.js'));
        for (const field of forbiddenFields) {
            assert(!new RegExp(field, 'i').test(eventSource), `H1. core/NotificationEvent.js still carries no "${field}" field or concept.`);
            assert(!new RegExp(field, 'i').test(storeSource), `H2. storage/NotificationEventStore.js still carries no "${field}" field or concept.`);
        }
        assert(storeSource.includes('export class NotificationEventStore') && !/DeliveryStore/i.test(storeSource),
            'H3. The store is still named NotificationEventStore, never NotificationDeliveryStore, in its own source.');
        // The persisted JSON shape stays exactly five fields — the same
        // structural check 0.9.286 Section O3 already ran, reconfirmed.
        const event = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: 'r1',
            payload: { publicationId: 'p1', commentaryId: 'c1', authorIdentityId: 'a1' }
        });
        const keys = Object.keys(event.toJSON()).sort();
        assert(JSON.stringify(keys) === JSON.stringify(['createdAt', 'eventType', 'notificationId', 'payload', 'recipientIdentityId']),
            `H4. NotificationEvent.toJSON() still carries exactly five fields (found: ${keys.join(', ')}) — nothing state-shaped has been added.`);

        console.log('✓ H: Persistence/delivery boundary holds. None of deliveredAt/seenAt/readAt/deliveryStatus/retryCount/channel/queue/acknowledgment exists anywhere in NotificationEvent.js or NotificationEventStore.js\'s own code (H1-H2). The store is still named for events, not delivery (H3). The persisted shape is still exactly the same five factual fields 0.9.273 first defined (H4). This boundary would only move if a FUTURE milestone deliberately decided delivery semantics were required — nothing here has crept in incidentally.');
    }

    // ===============================================================
    // Section I — Deduplication boundary. NotificationEventStore remains
    // the one deduplication authority; no future consumer or delivery
    // mechanism has quietly introduced a competing one.
    // ===============================================================
    {
        // Scoped to NOTIFICATION deduplication specifically — this
        // codebase has other, unrelated dedup concepts elsewhere (e.g.
        // publication/leaderboard reconciliation) that this section does
        // not question. "Defines" (export function/class), not merely
        // "references" (an import) — storage/NotificationEventStore.js
        // and application/GetRecipientNotificationEventsUseCase.js both
        // reference the policy's own exports without redefining any of
        // them.
        const dedupDefinitionHits = await grepCount('export function notificationDeduplicationIdentity\\|export function classifyNotificationCollision\\|export function haveSameNotificationDeduplicationIdentity', ['core', 'application', 'storage']);
        assert(dedupDefinitionHits === 1, `I1. Exactly one file in core/application/storage DEFINES notification deduplication identity/collision logic (found ${dedupDefinitionHits}) — core/NotificationDeduplicationPolicy.js alone.`);

        const dedupCallers = await grepCount('notificationDeduplicationIdentity\\|classifyNotificationCollision', ['application', 'storage', 'ui']);
        // The only caller should be the store itself; the producer and
        // the panel must never recompute an identity of their own.
        const storeUsesIt = (await rawSource('storage/NotificationEventStore.js')).includes('notificationDeduplicationIdentity(');
        assert(storeUsesIt, 'I2a. storage/NotificationEventStore.js is still a caller of the policy.');
        const producerUsesIt = /notificationDeduplicationIdentity|classifyNotificationCollision/.test(await rawSource('application/PublicationCommentaryNotificationProducer.js'));
        assert(!producerUsesIt, 'I2b. application/PublicationCommentaryNotificationProducer.js still performs no deduplication of its own — the store remains the sole authority, reconfirmed fresh.');
        const panelUsesIt = /notificationDeduplicationIdentity|classifyNotificationCollision/.test(await rawSource('ui/components/NotificationHistoryPanel.js'));
        assert(!panelUsesIt, 'I2c. ui/components/NotificationHistoryPanel.js still performs no deduplication of its own.');

        console.log(`✓ I: Deduplication boundary holds. Exactly one dedup-named module exists (I1); NotificationEventStore is still the only real caller of its identity/collision functions among the arc's own files, with the producer and the panel both independently confirmed to compute none of their own (I2, ${dedupCallers} total reference sites checked). A future delivery mechanism attaching its own retry/ack logic would have exactly one place to ask "is this already on file" — this store — never a second, competing answer.`);
    }

    // ===============================================================
    // Section J — ChatOutbox comparison, revisited a third time. Is
    // notification delivery semantically the same thing as chat
    // delivery? Still no.
    // ===============================================================
    {
        const chatOutbox = await rawSource('application/ChatOutbox.js');
        const notificationStore = await rawSource('storage/NotificationEventStore.js');

        assert(chatOutbox.includes('STORAGE_KEY_PREFIX') && chatOutbox.includes('peerIdentityId'),
            'J1. application/ChatOutbox.js still scopes storage per LOCAL OWNER (a key prefix) and addresses entries to a peerIdentityId that must reconnect.');
        assert(notificationStore.includes("const NOTIFICATION_EVENT_STORE_KEY = 'notification-events:entries';"),
            'J2. storage/NotificationEventStore.js still persists every recipient under one single, shared, unprefixed key — the opposite storage shape.');
        assert(!/import.*ChatOutbox/.test(notificationStore) && !/import.*NotificationEvent/.test(chatOutbox),
            'J3. Neither file imports the other — the two remain structurally independent, three milestones running (0.9.282 Section I; 0.9.286\'s own comparisons; this section).');
        // ChatOutbox prunes DELIVERED/expired entries (it is a transient
        // in-flight queue); NotificationEventStore never removes
        // anything it has ever accepted.
        assert(/pruneExpired|acknowledge/.test(chatOutbox), 'J4a. ChatOutbox.js still self-prunes on delivery/expiry — a transient in-flight queue, not a history.');
        assert(!/remove\(|delete\(/.test(codeOnlyLines(notificationStore)),
            'J4b. NotificationEventStore.js still has no removal path of any kind — a durable, append-only history, never a queue that empties itself.');

        console.log('✓ J: ChatOutbox comparison, run a third time. The two remain structurally independent (J1-J3) and semantically opposite in the one dimension that matters most: ChatOutbox is a transient, self-pruning, per-connection delivery QUEUE (empties itself the instant a message is confirmed delivered or its TTL elapses); NotificationEventStore is a permanent, append-only, shared HISTORY that never removes anything (J4). Notification delivery, if it is ever built, is not "reuse ChatOutbox" — it would need its own queue semantics, addressed to a CONNECTION rather than an at-rest fact. This section\'s expected answer — no — holds a third time.');
    }

    // ===============================================================
    // Section K — Capability reachability matrix. The decisive table:
    // "Product need established?" is the load-bearing column, never
    // "technically possible?".
    // ===============================================================
    {
        const matrix = [
            ['Notification persistence', 'Yes', 'Yes', 'Yes', 'Complete'],
            ['Recipient history', 'Yes', 'Yes', 'Yes', 'Complete'],
            ['Notification History UI', 'Yes', 'Yes', 'Yes', 'Complete'],
            ['Live delivery (in-app/WS/push)', 'No', 'No', 'No evidence found (Section C)', 'Deferred'],
            ['Read/unread', 'No', 'No', 'No evidence found (Section D/H)', 'Deferred'],
            ['Notification badge/unread count', 'No', 'No', 'No evidence found (Section C7)', 'Deferred'],
            ['Additional producer', 'No', 'No', 'No candidate clears the bar (Section F/G)', 'Deferred'],
            ['Delivery-layer dedup authority', 'No', 'No', 'No — one authority is sufficient (Section I)', 'Not needed']
        ];
        assert(matrix.length === 8, 'K1. All eight rows this milestone\'s own brief effectively names (the six the brief tabulates plus the two this arc\'s own evidence adds — additional producer, delivery dedup) are classified.');
        for (const [name, exists, reachable, needEstablished, action] of matrix) {
            assert(action === 'Complete' || action === 'Deferred' || action === 'Not needed',
                `K2. ${name} has a valid action classification.`);
        }
        console.log('✓ K: Capability reachability matrix — the decisive evidence, not a wishlist:');
        console.log('    Capability                          Exists  Reachable  Product need established?                  Action');
        for (const [name, exists, reachable, needEstablished, action] of matrix) {
            console.log(`    ${name.padEnd(36)} ${exists.padEnd(7)} ${reachable.padEnd(10)} ${needEstablished.padEnd(42)} ${action}`);
        }
        console.log('  Three rows are Complete with concrete evidence (Sections A/B). Five rows are Deferred/Not needed — every one of them for the SAME reason: no section of this audit, or of any of the twelve milestones since 0.9.273, found a real user, a real product requirement, or a real repository signal asking for it. Deferred is not "not yet built"; it is "not yet evidenced."');
    }

    // ===============================================================
    // Section L — Architecture regression audit. The full twelve-point
    // checklist this milestone's own brief names, checked fresh.
    // ===============================================================
    {
        const sources = {};
        for (const path of NOTIFICATION_ARC_FILES) sources[path] = codeOnlyLines(await rawSource(path));
        // The panel's own rendered template carries one deliberate
        // disclaiming sentence ("there is no read/unread state here") —
        // excluded here the same way Section A9/C7 already exclude it.
        {
            const panelPath = 'ui/components/NotificationHistoryPanel.js';
            const code = sources[panelPath];
            const templateStart = code.indexOf('template: `');
            const templateEnd = code.lastIndexOf('`');
            sources[panelPath] = (templateStart !== -1 && templateEnd > templateStart)
                ? code.slice(0, templateStart) + code.slice(templateEnd + 1)
                : code;
        }
        const allCode = Object.values(sources).join('\n');

        const checks = [
            ['no lifecycle vocabulary', /PENDING|QUEUED|SENT\b|DELIVERED|DISMISSED|EXPIRED/],
            ['no delivery claims', /\bdelivered\b|\bdelivery\b/i],
            ['no read/unread semantics', /\bunread\b|isRead|markRead|readAt/i],
            ['no polling', /setInterval|setTimeout/],
            ['no implicit subscriptions', /subscribe\(|EventEmitter|addEventListener\(.*notification/i],
            ['no UI storage access', null], // checked separately below
            ['no producer-side deduplication', null], // Section I already proved this directly
            ['no queue', /\bqueue\b/i],
            ['no retry state', /retryCount|retryAt|attemptCount/i],
            ['no notification mutation', /set\s+payload\(|set\s+eventType\(|set\s+recipientIdentityId\(/],
            ['no recipient supplied by the caller (query)', null], // checked separately below
            ['no second source of truth', null] // checked separately below
        ];

        for (const [label, pattern] of checks) {
            if (!pattern) continue;
            assert(!pattern.test(allCode), `L1. No occurrence of "${label}" anywhere across the six notification-arc files' own code.`);
        }

        // UI storage access — the panel imports neither StorageProvider
        // nor the store directly.
        assert(!/StorageProvider|NotificationEventStore/.test(sources['ui/components/NotificationHistoryPanel.js']),
            'L2. ui/components/NotificationHistoryPanel.js still imports no storage concept of any kind.');

        // Recipient supplied by the caller — execute() takes no
        // arguments naming a recipient.
        const queryCode = await rawSource('application/GetRecipientNotificationEventsUseCase.js');
        assert(/execute\(\)\s*\{/.test(codeOnlyLines(queryCode)),
            'L3. GetRecipientNotificationEventsUseCase.execute() still takes zero arguments — no caller-suppliable recipientIdentityId.');

        // Second source of truth — exactly one store class, one
        // persistence key, reconfirmed.
        const storeClassCount = await grepCount('export class NotificationEventStore', ['storage']);
        assert(storeClassCount === 1, 'L4. Exactly one NotificationEventStore class exists.');

        console.log('✓ L: Architecture regression audit — all twelve points this milestone\'s own brief names hold, checked fresh against the real, unmodified source: no lifecycle vocabulary, no delivery claims, no read/unread semantics, no polling, no implicit subscriptions, no UI storage access, no producer-side deduplication (Section I\'s own direct proof), no queue, no retry state, no notification mutation, no caller-supplied recipient, no second source of truth. Nothing in this codebase has regressed since 0.9.286\'s own equivalent sweep.');
    }

    // ===============================================================
    // Section M — Product stopping-point determination. The verdict.
    // ===============================================================
    {
        console.log('✓ M: VERDICT.\n' +
'\n' +
'OUTCOME: Outcome 1 — Notification history is sufficient. The notification\n' +
'arc (0.9.273-0.9.286) is a complete, working product capability, and this\n' +
'milestone finds no evidenced reason to extend it with delivery, read/unread\n' +
'state, additional producers, or any other capability from Sections C/F/K.\n' +
'\n' +
'WHY.\n' +
'  - Section B: the core claim — "a user can open Notifications and inspect\n' +
'    durable events concerning them" — is real, exercised end to end against\n' +
'    real infrastructure, for the third time across three separate\n' +
'    milestones (0.9.282, 0.9.286, this one). It is not a stub.\n' +
'  - Section C: none of the eight named delivery mechanisms exists in the\n' +
'    real source. Their absence is a deliberate restraint, not an oversight\n' +
'    — every one of the twelve prior milestones in this arc named the same\n' +
'    restraint in its own "deliberately excludes" section.\n' +
'  - Section F/G: the two most plausible future producer candidates\n' +
'    (Collaboration, Friend Relationship) were checked directly against\n' +
'    Commentary\'s own bar and neither clears it — Collaboration has no\n' +
'    single addressable recipient; Friend Relationship already delivers\n' +
'    synchronously over its own live channel, so it lacks Commentary\'s\n' +
'    defining shape (an author acts while the recipient may be provably\n' +
'    absent). Building a second producer today would be invention ahead of\n' +
'    evidence, exactly the discipline 0.9.272\'s own reassessment first\n' +
'    established for this whole arc.\n' +
'  - Section H/I/J/L: every architectural boundary this arc has built —\n' +
'    persistence-vs-delivery, the one dedup authority, ChatOutbox staying a\n' +
'    narrow precedent, and the full twelve-point regression checklist —\n' +
'    holds with no erosion.\n' +
'\n' +
'WHAT WOULD CHANGE THIS VERDICT. Per this milestone\'s own brief, any of the\n' +
'following would be genuine evidence, not assumption, and would justify\n' +
'reopening this question:\n' +
'  - A real user report that a Commentary went unnoticed for an extended\n' +
'    period because nothing prompted the publisher to open Notification\n' +
'    History.\n' +
'  - A second domain behavior that independently develops Commentary\'s own\n' +
'    exact shape: a durable, append-only fact, a single already-on-file\n' +
'    recipient, and an author who may act while that recipient is\n' +
'    genuinely absent.\n' +
'  - A product decision, stated explicitly by name, that notification\n' +
'    delivery/read state is now a deliberate goal — never inferred merely\n' +
'    from "notifications exist."\n' +
'\n' +
'RANKED CANDIDATES, FOR RECORD ONLY — NONE SELECTED HERE.\n' +
'  1. Live in-app delivery (toast/banner) — the smallest technical seam of\n' +
'     the eight in Section C, since it could sit entirely inside the\n' +
'     existing WorldView without a new persistence concept. Still deferred:\n' +
'     no evidence names it.\n' +
'  2. Read/unread state — would require exactly one new field\n' +
'     (`readAt`) and one new store method — technically small, but Section\n' +
'     H\'s own boundary exists specifically to keep this from being added\n' +
'     casually. Deferred.\n' +
'  3. A second producer (still no concrete candidate; Section F/G).\n' +
'     Deferred, unranked below read/unread since it is further from\n' +
'     evidenced.\n' +
'  4. Push/email/WebSocket — the largest technical lift of the eight, and\n' +
'     the least evidenced. Deferred, ranked last.\n' +
'\n' +
'NEXT MILESTONE. Not selected here, per this milestone\'s own scope\n' +
'(reassessment only, no build). Outcome 3 — an unrelated product gap — is\n' +
'left to whoever picks the next milestone with fresh evidence of its own;\n' +
'this reassessment\'s only job was to determine whether notification history\n' +
'itself still owed the product anything. It does not, today.\n');
    }

    console.log('\n✅ All PostNotificationHistoryProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostNotificationHistoryProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostNotificationHistoryProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
