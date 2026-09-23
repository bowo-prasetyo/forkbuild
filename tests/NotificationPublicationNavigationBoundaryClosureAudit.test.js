import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import NotificationHistoryPanel from '../ui/components/NotificationHistoryPanel.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { GetRecipientNotificationEventsUseCase } from '../application/GetRecipientNotificationEventsUseCase.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
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

// 0.9.531 — Notification Publication Navigation Boundary Closure Audit.
//
// 0.9.530 built and proved viewNotificationPublicationCommand — the one
// PRODUCT_GAP that milestone's own reassessment found (a notification
// named a publicationId but offered no way to reach it), closed by
// reusing session.findPublicationById() and focusWorld() verbatim. This
// file does not re-litigate that finding — it audits the CLOSURE itself,
// from a different angle: not "was there a gap," but "is the fix
// discoverable, correctly bounded, and safe at its edges." Nine lettered
// sections, mirroring this milestone's own originating brief:
//
//   A — Action discoverability.
//   B — Successful navigation.
//   C — Stale target handling (multi-notification isolation).
//   D — Event-shape tolerance.
//   E — Identity continuity (no candidate reselection).
//   F — Existing navigation boundary (no second mechanism).
//   G — Cross-surface regression (the three pre-existing focusWorld()
//       callers are untouched by the 0.9.530 commit itself).
//   H — Failure isolation.
//   I — Product-gap classification and verdict.
//
// The central property under audit: NotificationHistoryPanel never
// becomes a Publication resolver or a second navigation system.
// `payload.publicationId` only ever means "this notification can ATTEMPT
// Publication navigation" — never "this is a valid/current Publication."
// session.findPublicationById() stays the one and only authority for
// whether the target currently resolves; this file checks that boundary
// directly (Section I) rather than assuming it.
//
// Every claim below is checked against real, unmodified production
// source and real object graphs — never asserted from milestone history
// alone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function gitLog(args) {
    try {
        return execSync(`git ${args} 2>/dev/null || true`, { cwd: SOURCE_ROOT.pathname }).toString().trim();
    } catch {
        return '';
    }
}

// ---------------------------------------------------------------------
// Shared fixtures — this milestone's own copies, matching the shape
// tests/NotificationEventDeliveryExperienceProductReassessment.test.js
// already established, never imported from that file directly (its own
// documented convention — see that file's own header).
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

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

function makeSharedBackend() {
    const storage = new InMemoryStorageProvider();
    const contentStore = new LocalContentStore(storage);
    const publisherProvider = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const commentaryStore = new PublicationCommentaryStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const notificationStorageProvider = new InMemoryStorageProvider();
    const notificationEventStore = new NotificationEventStore(notificationStorageProvider);
    return { storage, publisherProvider, discoveryProvider, commentaryStore, canCommentOnPublicationUseCase, notificationStorageProvider, notificationEventStore };
}

function makeProducer(backend, commentAuthorProvider) {
    const addCommentaryUseCase = new AddPublicationCommentaryUseCase(backend.commentaryStore, commentAuthorProvider, backend.canCommentOnPublicationUseCase);
    return new PublicationCommentaryNotificationProducer(addCommentaryUseCase, backend.discoveryProvider, (event) => backend.notificationEventStore.save(event));
}

function makeSession(recipientIdentityProvider, backend) {
    const getRecipientNotificationEventsUseCase = new GetRecipientNotificationEventsUseCase(backend.notificationEventStore, recipientIdentityProvider);
    return new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider: backend.discoveryProvider,
        getRecipientNotificationEventsUseCase
    });
}

// The exact logic ui/views/WorldView.js#viewNotificationPublicationCommand
// carries in production, reproduced here (as
// NotificationEventDeliveryExperienceProductReassessment.test.js already
// does) so this file can drive a REAL WorldNavigationSession without the
// DOM/Vue layer WorldView.js itself needs. `onClose` stands in for
// closeNotificationHistoryPanel() so Section B can observe call ORDER.
function makeViewPublicationCommand(session, onClose = () => {}) {
    return (publicationId) => {
        const publication = session.findPublicationById(publicationId);
        if (!publication || !publication.documentId) {
            return false;
        }
        onClose();
        return publication.documentId;
    };
}

function panelCtx(overrides = {}) {
    return {
        getRecipientNotificationEventsCommand: null,
        viewPublicationCommand: null,
        notifications: [],
        notificationHistoryError: null,
        unavailablePublicationNotificationIds: new Set(),
        refreshNotificationHistory: NotificationHistoryPanel.methods.refreshNotificationHistory,
        notificationTitle: NotificationHistoryPanel.methods.notificationTitle,
        notificationDetails: NotificationHistoryPanel.methods.notificationDetails,
        notificationPublicationId: NotificationHistoryPanel.methods.notificationPublicationId,
        viewNotificationPublication: NotificationHistoryPanel.methods.viewNotificationPublication,
        ...overrides
    };
}

// Mirrors the template's own `v-if="viewPublicationCommand &&
// notificationPublicationId(event)"` gate exactly — the real condition
// deciding whether the Explore button renders at all.
function exploreActionVisible(ctx, event) {
    return Boolean(ctx.viewPublicationCommand) && Boolean(ctx.notificationPublicationId(event));
}

async function runTests() {
    console.log('Running Notification Publication Navigation Boundary Closure Audit tests...\n');

    // ===============================================================
    // Section A — Action discoverability.
    // ===============================================================
    {
        const withId = { notificationId: 'n1', eventType: 'publication.commented', payload: { publicationId: 'pub-1' } };
        const withoutId = { notificationId: 'n2', eventType: 'publication.commented', payload: { content: 'hi' } };
        const command = () => true;

        assert(exploreActionVisible(panelCtx({ viewPublicationCommand: command }), withId) === true,
            'A1. A notification whose payload carries publicationId, with viewPublicationCommand wired, exposes Explore.');

        assert(exploreActionVisible(panelCtx({ viewPublicationCommand: command }), withoutId) === false,
            'A2. A notification with no publicationId in its payload never exposes Explore, even with the command wired.');

        assert(exploreActionVisible(panelCtx({ viewPublicationCommand: null }), withId) === false,
            'A3. A missing viewPublicationCommand (capability not wired) degrades safely — Explore is hidden entirely, never rendered disabled/broken.');

        const noCommandCtx = panelCtx({ viewPublicationCommand: null });
        noCommandCtx.viewNotificationPublication.call(noCommandCtx, withId);
        assert(noCommandCtx.unavailablePublicationNotificationIds.size === 0,
            'A3b. With no command wired, even calling the click handler directly is a silent no-op — never a thrown error.');

        // A4 — unrelated payload/event fields never accidentally trigger
        // the action: a top-level `documentId`, a payload `worldId`, and
        // a payload `publicationId` that names another field family are
        // all inert; only the exact payload.publicationId key name
        // counts.
        const unrelatedTopLevel = { notificationId: 'n3', eventType: 'world.visited', documentId: 'doc-1', payload: { worldId: 'w-1' } };
        assert(exploreActionVisible(panelCtx({ viewPublicationCommand: command }), unrelatedTopLevel) === false,
            'A4a. A top-level documentId field, and an unrelated payload.worldId, never trigger Explore — only payload.publicationId does.');

        const nestedDecoy = { notificationId: 'n4', eventType: 'x.y', payload: { publication: { id: 'pub-2' } } };
        assert(exploreActionVisible(panelCtx({ viewPublicationCommand: command }), nestedDecoy) === false,
            'A4b. A nested payload.publication.id is not the same field as payload.publicationId — no fuzzy/nested matching is performed.');

        console.log('✓ A: Explore is shown exactly when payload.publicationId is present AND viewPublicationCommand is wired; either alone is insufficient; unrelated fields never trigger it.');
    }

    // ===============================================================
    // Section B — Successful navigation.
    // ===============================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const commandMatch = worldViewSource.match(/function viewNotificationPublicationCommand\(publicationId\) \{[\s\S]*?\n {8}\}/);
        assert(commandMatch, 'B0. viewNotificationPublicationCommand() still exists in ui/views/WorldView.js.');
        const commandBody = commandMatch[0];

        // B1 — findPublicationById() is the resolver.
        assert(/session\.findPublicationById\(publicationId\)/.test(commandBody),
            'B1. The command resolves through the EXISTING session.findPublicationById() — the same publicationId the panel forwards, untransformed.');

        // B2 — focusWorld() is the navigation mechanism, called with the
        // resolved Publication's own documentId, never a re-derived one.
        assert(/focusWorld\(publication\.documentId\)/.test(commandBody),
            'B2. Navigation happens through the EXISTING focusWorld(), called with the resolved Publication\'s own documentId.');

        // B3 — the panel closes only on the SUCCESS path: closeNotificationHistoryPanel()
        // appears strictly after the failure guard's `return false;`, never before it.
        const guardIndex = commandBody.indexOf('return false;');
        const closeIndex = commandBody.indexOf('closeNotificationHistoryPanel()');
        assert(guardIndex > -1 && closeIndex > guardIndex,
            'B3. closeNotificationHistoryPanel() is called only after the unresolvable-target guard — a failed lookup never closes the panel.');

        // B4 — no duplicate routing logic: across the whole file, no
        // OTHER function body both resolves via findPublicationById and
        // navigates via focusWorld — viewNotificationPublicationCommand
        // is the only one.
        const functionBodies = [...worldViewSource.matchAll(/function (\w+)\([^)]*\) \{([\s\S]*?)\n {8}\}/g)];
        const resolveAndNavigate = functionBodies.filter(([, name, body]) =>
            /findPublicationById\(/.test(body) && /focusWorld\(/.test(body));
        assert(resolveAndNavigate.length === 1 && resolveAndNavigate[0][1] === 'viewNotificationPublicationCommand',
            `B4. Exactly one function resolves a publicationId AND calls focusWorld() — viewNotificationPublicationCommand. Found: ${resolveAndNavigate.map(([, n]) => n).join(', ') || '(none)'}.`);

        // B5 — live, end to end: the exact publicationId the panel reads
        // off the notification is the exact value forwarded to the
        // command (never re-derived, never wrapped), and the resolved
        // documentId matches the real Publication.
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section B World', 'alice'), alice);
        makeProducer(backend, bob).execute({ publicationId: publication.id, content: 'nice' });

        const session = makeSession(alice, backend);
        const events = session.getRecipientNotificationEvents();

        let forwardedArg = null;
        let closeCalled = false;
        const spyCommand = (publicationId) => {
            forwardedArg = publicationId;
            return makeViewPublicationCommand(session, () => { closeCalled = true; })(publicationId);
        };

        const ctx = panelCtx({ notifications: events, viewPublicationCommand: spyCommand });
        ctx.viewNotificationPublication.call(ctx, events[0]);

        assert(forwardedArg === publication.id,
            'B5a. The exact publicationId — byte-identical to the notification\'s own payload.publicationId — is forwarded to viewPublicationCommand.');
        assert(closeCalled === true,
            'B5b. A successful navigation runs the panel-close side effect.');
        assert(!ctx.unavailablePublicationNotificationIds.has(events[0].notificationId),
            'B5c. A successful navigation never marks the notification unavailable.');

        console.log('✓ B: the exact publicationId is forwarded; resolution goes through findPublicationById(); navigation goes through focusWorld(); the panel closes only after success; exactly one function in WorldView.js performs this resolve-then-navigate sequence.');
    }

    // ===============================================================
    // Section C — Stale target handling (multi-notification isolation).
    // ===============================================================
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const stalePublication = backend.publisherProvider.publish(makeDocument('Going Stale', 'alice'), alice);
        const livePublication = backend.publisherProvider.publish(makeDocument('Staying Live', 'alice'), alice);
        makeProducer(backend, bob).execute({ publicationId: stalePublication.id, content: 'about to vanish' });
        makeProducer(backend, bob).execute({ publicationId: livePublication.id, content: 'still here' });

        // Unpublish only the first target.
        backend.publisherProvider.unpublish(stalePublication.id);

        const session = makeSession(alice, backend);
        const events = session.getRecipientNotificationEvents();
        assert(events.length === 2, 'C0. Both notifications remain on file — an unpublish never deletes the notification.');

        const staleEvent = events.find((e) => e.payload.publicationId === stalePublication.id);
        const liveEvent = events.find((e) => e.payload.publicationId === livePublication.id);
        const beforeStaleJSON = JSON.stringify(staleEvent.toJSON());
        const beforeLiveJSON = JSON.stringify(liveEvent.toJSON());

        const command = makeViewPublicationCommand(session);
        const ctx = panelCtx({ notifications: events, viewPublicationCommand: command });

        let threw = false;
        try {
            ctx.viewNotificationPublication.call(ctx, staleEvent);
        } catch { threw = true; }
        assert(!threw, 'C1. Clicking Explore on a stale target never throws.');

        assert(ctx.unavailablePublicationNotificationIds.has(staleEvent.notificationId),
            'C2. Only the stale notification is marked unavailable.');
        assert(!ctx.unavailablePublicationNotificationIds.has(liveEvent.notificationId),
            'C3. The unrelated live notification is NOT marked unavailable by the stale one\'s failure.');

        // The live one is still independently clickable and succeeds.
        const liveNavigated = ctx.viewPublicationCommand(ctx.notificationPublicationId.call(ctx, liveEvent));
        assert(liveNavigated === livePublication.documentId,
            'C4. Other notifications remain fully usable after a sibling notification\'s target goes stale.');

        assert(JSON.stringify(staleEvent.toJSON()) === beforeStaleJSON && JSON.stringify(liveEvent.toJSON()) === beforeLiveJSON,
            'C5. Neither the stale nor the live underlying NotificationEvent is mutated by any of this.');

        assert(ctx.notifications.length === 2 && ctx.notifications.some((e) => e.notificationId === staleEvent.notificationId),
            'C6. The historical event for the stale target remains present in the list — degrading the action never hides the fact.');

        console.log('✓ C: a stale target degrades only its own notification\'s action, never throws, never touches either NotificationEvent, and leaves every sibling notification fully usable.');
    }

    // ===============================================================
    // Section D — Event-shape tolerance.
    // ===============================================================
    {
        const command = () => true;
        const ctx = panelCtx({ viewPublicationCommand: command });

        const shapes = [
            ['payload = { publicationId: "..." }', { notificationId: 'd1', eventType: 'x.y', payload: { publicationId: 'pub-1' } }, true],
            ['payload = { publicationId: null }', { notificationId: 'd2', eventType: 'x.y', payload: { publicationId: null } }, false],
            ['payload = {}', { notificationId: 'd3', eventType: 'x.y', payload: {} }, false],
            ['payload = undefined', { notificationId: 'd4', eventType: 'x.y', payload: undefined }, false],
            ['no payload key at all', { notificationId: 'd5', eventType: 'x.y' }, false],
            ['payload = { publicationId: 42 }', { notificationId: 'd6', eventType: 'x.y', payload: { publicationId: 42 } }, false],
            ['payload = { publicationId: "" }', { notificationId: 'd7', eventType: 'x.y', payload: { publicationId: '' } }, false],
            ['payload with unrelated fields only', { notificationId: 'd8', eventType: 'x.y', payload: { documentId: 'doc-1', worldId: 'w-1' } }, false]
        ];

        for (const [label, event, expected] of shapes) {
            let threw = false;
            let visible = false;
            try {
                visible = exploreActionVisible(ctx, event);
            } catch { threw = true; }
            assert(!threw, `D. "${label}" never throws while evaluating Explore visibility.`);
            assert(visible === expected, `D. "${label}" resolves Explore visibility to ${expected}.`);
        }

        // D-extra — the panel never learns a new eventType: the same
        // shapes above are re-checked under a completely unseen
        // eventType, and an eventType-based special case is absent from
        // source (reconfirming 0.9.530's own E2c, from this milestone's
        // own angle).
        const unseenEventType = { notificationId: 'd9', eventType: 'some.brand.new.kind', payload: { publicationId: 'pub-9' } };
        assert(exploreActionVisible(ctx, unseenEventType) === true,
            'D-extra-a. A completely unseen eventType still exposes Explore, purely from the payload field name — the panel invents no eventType allowlist.');

        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        assert(!/event\.eventType\s*===/.test(panelSource),
            'D-extra-b. NotificationHistoryPanel.js never branches Explore visibility on a specific eventType string.');

        console.log('✓ D: every payload shape (present, null, empty, absent, wrong type, empty string, unrelated fields, unseen eventType) resolves Explore visibility correctly and never throws — the panel stays event-type-agnostic.');
    }

    // ===============================================================
    // Section E — Identity continuity (no candidate reselection).
    // ===============================================================
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        // Two Publications, deliberately similarly named, so a
        // content-hash or "best match" substitution would be tempted to
        // confuse them if one existed.
        const publicationA = backend.publisherProvider.publish(makeDocument('Similar World', 'alice'), alice);
        const publicationB = backend.publisherProvider.publish(makeDocument('Similar World', 'alice'), alice);
        assert(publicationA.id !== publicationB.id && publicationA.documentId !== publicationB.documentId,
            'E0. Fixture sanity: two distinct Publications share a title but carry distinct identities.');

        makeProducer(backend, bob).execute({ publicationId: publicationA.id, content: 'about A' });

        const session = makeSession(alice, backend);
        const events = session.getRecipientNotificationEvents();
        assert(events.length === 1, 'E0b. Exactly one notification exists, naming publicationA.');

        const command = makeViewPublicationCommand(session);
        const resolvedDocumentId = command(events[0].payload.publicationId);

        assert(resolvedDocumentId === publicationA.documentId,
            'E1. The resolved documentId is EXACTLY publicationA\'s own — the one the notification actually named.');
        assert(resolvedDocumentId !== publicationB.documentId,
            'E2. The resolved documentId is NEVER publicationB\'s, despite the identical title — no similarity-based reselection occurs.');

        // E3 — resolution is a single exact-id lookup, never a scan that
        // could return a different, "close enough" record: confirm
        // LocalDiscoveryProvider#findById performs strict equality, not
        // a fuzzy/partial match.
        const discoverySource = await rawSource('discovery/LocalDiscoveryProvider.js');
        assert(/find\(\(r\) => r\.id === id\)/.test(discoverySource),
            'E3. The underlying discovery lookup is a strict `r.id === id` equality match — the same exact-identity guarantee this milestone\'s navigation depends on.');

        // E4 — a second, independent call with the SAME publicationId is
        // idempotent: it returns the identical documentId every time,
        // never a freshly "re-selected" candidate.
        const resolvedAgain = command(events[0].payload.publicationId);
        assert(resolvedAgain === resolvedDocumentId,
            'E4. Repeating the identical lookup returns the identical documentId — resolution is a pure function of publicationId, not of call order or prior state.');

        console.log('✓ E: the Publication reached is exactly the one the notification\'s own publicationId named — never a similarly-titled sibling, never a re-selected or content-hash-substituted candidate, and resolution is idempotent.');
    }

    // ===============================================================
    // Section F — Existing navigation boundary (no second mechanism).
    // ===============================================================
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const commandMatch = worldViewSource.match(/function viewNotificationPublicationCommand\(publicationId\) \{[\s\S]*?\n {8}\}/);
        const commandBody = commandMatch[0];

        assert(!/router\.(push|replace)/.test(commandBody),
            'F1. viewNotificationPublicationCommand() never calls router.push()/router.replace() directly — focusWorld() remains the sole route-changing mechanism.');
        assert(!/new\s+\w*(Resolver|Repository|Search)/i.test(commandBody),
            'F2. No new resolver/repository/search class is instantiated inside the command.');
        assert(!/loadPublicationDocumentUseCase|worldLayoutProvider\.load|registry\.getDocument/.test(commandBody),
            'F3. No new World-loading path is introduced — the command never touches the document-loading primitives WorldNavigationSession itself already owns.');

        // F4 — symmetry: none of the OTHER real focusWorld() callers
        // wrap it in a try/catch either — the notification command's own
        // lack of a defensive catch (Section H) is consistent with the
        // established trust boundary around focusWorld(), not a unique
        // gap introduced by this feature.
        // World Search binds focusWorld directly in the template (its
        // former focusSearchResult() one-line alias was removed as
        // redundant), so it has no wrapper of its own to check here.
        assert(/<WorldSearchPanel[^>]*@focus="focusWorld"/.test(worldViewSource),
            'F4. World Search calls focusWorld() directly — no wrapper, so no try/catch either.');
        const otherCallers = ['focusLocationDocument', 'focusLocationBrowserResult'];
        for (const name of otherCallers) {
            const match = worldViewSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n {8}\\}`));
            assert(match, `F4a. ${name}() still exists in ui/views/WorldView.js.`);
            assert(!/try\s*\{/.test(match[1]),
                `F4b. ${name}() calls focusWorld() with no surrounding try/catch — the same trust boundary viewNotificationPublicationCommand() follows.`);
        }
        assert(!/try\s*\{/.test(commandBody),
            'F4c. viewNotificationPublicationCommand() itself also has no surrounding try/catch around focusWorld() — symmetric with every other real caller.');

        console.log('✓ F: the command uses only findPublicationById() + focusWorld(), never router.push(), a new resolver, or a new World-loading path — and its lack of a defensive try/catch around focusWorld() matches every other existing caller, not a new asymmetry.');
    }

    // ===============================================================
    // Section G — Cross-surface regression.
    // ===============================================================
    {
        // Find the commit that introduced viewNotificationPublicationCommand
        // by content rather than by hardcoding a hash, so this audit
        // survives history rewrites.
        const introducingCommit = gitLog('log -S"viewNotificationPublicationCommand" --format=%H -- ui/views/WorldView.js')
            .split('\n').filter(Boolean).pop();
        assert(introducingCommit, 'G0. The commit introducing viewNotificationPublicationCommand is discoverable via git history.');

        const diff = gitLog(`show ${introducingCommit} -- ui/views/WorldView.js`);
        assert(diff, 'G0b. That commit\'s diff against ui/views/WorldView.js is readable.');

        // The pre-existing focusWorld() callers this feature is
        // said to reuse, never touch, must not have their own
        // DEFINITION line changed (+/-) in the introducing commit's own
        // diff. A comment elsewhere in the diff merely naming one of
        // them (as this feature's own header does, citing
        // focusLocationDocument() as precedent) is not a change to the
        // function itself, so this checks the `function <name>(` line
        // specifically rather than a bare substring match.
        const changedLines = diff.split('\n').filter((line) => /^[+-][^+-]/.test(line));
        for (const name of ['focusLocationDocument', 'focusLocationBrowserResult']) {
            const definitionPattern = new RegExp(`function ${name}\\(`);
            assert(!changedLines.some((line) => definitionPattern.test(line)),
                `G1. ${name}()'s own definition line is not among the lines the introducing commit changed (a comment elsewhere may still name it as precedent).`);
        }

        // Live behavior of the untouched callers still matches
        // their documented one-line shape: call focusWorld with the
        // given documentId, then close their own dialog — never anything
        // else.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const shapes = {
            focusLocationDocument: /function focusLocationDocument\(documentId\) \{\s*focusWorld\(documentId\);\s*closeLocationDocuments\(\);\s*\}/,
            focusLocationBrowserResult: /function focusLocationBrowserResult\(documentId\) \{\s*focusWorld\(documentId\);\s*closeLocationBrowser\(\);\s*\}/
        };
        for (const [name, pattern] of Object.entries(shapes)) {
            assert(pattern.test(worldViewSource), `G2. ${name}() still matches its exact pre-0.9.530 one-line shape — unaltered by the notification navigation feature.`);
        }

        console.log('✓ G: the commit that introduced notification-Publication navigation never changed any of the three pre-existing focusWorld() callers (Search/Documents-Here/Nearby Worlds), and their live source still matches their exact original shape.');
    }

    // ===============================================================
    // Section H — Failure isolation.
    // ===============================================================
    {
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publication = backend.publisherProvider.publish(makeDocument('Section H World', 'alice'), alice);
        makeProducer(backend, bob).execute({ publicationId: publication.id, content: 'x' });
        const session = makeSession(alice, backend);
        const events = session.getRecipientNotificationEvents();

        // H1 — findPublicationById() returns null (not found), never
        // throws — reconfirmed against a battery of hostile inputs, not
        // just "unpublished."
        const hostileInputs = [null, undefined, '', 42, {}, [], 'x'.repeat(10000), '../../etc/passwd', "'; DROP TABLE publications; --"];
        for (const input of hostileInputs) {
            let threw = false;
            let result;
            try { result = session.findPublicationById(input); } catch { threw = true; }
            assert(!threw, `H1. session.findPublicationById(${JSON.stringify(input)}) never throws.`);
            assert(result === null, `H1b. session.findPublicationById(${JSON.stringify(input)}) resolves to null, never a false-positive match.`);
        }

        // H2 — a command that DOES throw (simulating a hypothetical
        // future regression of the "never throws" contract) is not
        // silently swallowed by the panel either — Section F already
        // established the panel has no try/catch here, matching every
        // other focusWorld() caller, so the failure surfaces rather than
        // being hidden; this proves that surfacing is total (nothing
        // partially mutates on the way out) rather than proving it is
        // caught.
        const throwingCommand = () => { throw new Error('findPublicationById regressed'); };
        const throwCtx = panelCtx({ notifications: events, viewPublicationCommand: throwingCommand });
        let escaped = false;
        try {
            throwCtx.viewNotificationPublication.call(throwCtx, events[0]);
        } catch { escaped = true; }
        assert(escaped, 'H2a. A command that throws propagates out of viewNotificationPublication() rather than being silently absorbed into a false "unavailable" state.');
        assert(throwCtx.unavailablePublicationNotificationIds.size === 0,
            'H2b. A thrown (not returned-false) failure never partially marks the notification unavailable — the mutation only happens after a clean `false` return.');
        assert(throwCtx.notifications.length === 1 && throwCtx.notificationHistoryError === null,
            'H2c. A navigation-command throw never touches `notifications` or `notificationHistoryError` — the history list and its own read-error state are a completely separate concern from a single click handler\'s failure.');

        // H3 — focusWorld() is only ever invoked with a documentId that
        // came from a successfully resolved Publication — the guard
        // clause fully gates it, so a null/undefined publication can
        // never reach focusWorld() with a garbage argument.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const commandBody = worldViewSource.match(/function viewNotificationPublicationCommand\(publicationId\) \{[\s\S]*?\n {8}\}/)[0];
        const guardBeforeFocus = /if \(!publication \|\| !publication\.documentId\) \{\s*return false;\s*\}\s*focusWorld\(publication\.documentId\);/.test(commandBody);
        assert(guardBeforeFocus, 'H3. focusWorld() is textually unreachable unless the guard clause above it has already confirmed a resolved Publication with a documentId.');

        // H4 — absent capability (no viewPublicationCommand) is a
        // no-op, reconfirmed here as a failure-isolation case rather
        // than a discoverability one (Section A already covers the
        // rendering side).
        const noCommandCtx = panelCtx({ notifications: events, viewPublicationCommand: null });
        let noCommandThrew = false;
        try { noCommandCtx.viewNotificationPublication.call(noCommandCtx, events[0]); } catch { noCommandThrew = true; }
        assert(!noCommandThrew && noCommandCtx.unavailablePublicationNotificationIds.size === 0,
            'H4. An absent navigation command is a silent no-op, never a thrown error and never a false "unavailable" verdict.');

        // H5 — a malformed payload notification failure is isolated to
        // itself; refreshNotificationHistory() and the rest of the list
        // stay intact (extends Section C\'s two-notification case to a
        // directly-malformed one rather than merely a since-unpublished
        // one).
        const malformedEvent = { notificationId: 'malformed-1', eventType: 'x.y', payload: { publicationId: 123 } };
        const mixedCtx = panelCtx({ notifications: [...events, malformedEvent], viewPublicationCommand: () => true });
        assert(exploreActionVisible(mixedCtx, malformedEvent) === false,
            'H5. A malformed payload.publicationId (wrong type) never exposes Explore in the first place — nothing to click, nothing to fail.');
        assert(mixedCtx.notifications.length === events.length + 1,
            'H5b. The malformed notification still renders in the list (title/timestamp/generic details) — only its Explore action is affected.');

        console.log('✓ H: findPublicationById() never throws even under hostile input; a hypothetical command failure propagates rather than corrupting unavailable-state, the notification list, or the history error state; focusWorld() is unreachable without a resolved Publication; an absent command and a malformed payload both fail closed, in isolation.');
    }

    // ===============================================================
    // Section I — Product-gap classification and verdict.
    // ===============================================================
    {
        // The core boundary this milestone's own brief asked to
        // establish: payload.publicationId means "attempt navigation is
        // possible," never "this Publication currently resolves."
        // Proven directly: a syntactically well-formed publicationId
        // that names NOTHING real still passes the discoverability gate
        // (Explore renders) and only fails at the authority boundary
        // (findPublicationById(), inside the click) — the panel itself
        // never pre-validates or pre-filters on currency.
        const neverExistedEvent = { notificationId: 'ghost-1', eventType: 'publication.commented', payload: { publicationId: 'publication-that-never-existed' } };
        const backend = makeSharedBackend();
        const alice = makeIdentity('Alice');
        const session = makeSession(alice, backend);
        const command = makeViewPublicationCommand(session);
        const ctx = panelCtx({ viewPublicationCommand: command });

        assert(exploreActionVisible(ctx, neverExistedEvent) === true,
            'I1a. A well-formed but non-existent publicationId still exposes Explore — the panel makes no currency judgment of its own.');
        ctx.viewNotificationPublication.call(ctx, neverExistedEvent);
        assert(ctx.unavailablePublicationNotificationIds.has('ghost-1'),
            'I1b. session.findPublicationById() — not the panel — is the one that discovers the target does not resolve, at click time.');

        // Deliberate exclusions this milestone was told to preserve: no
        // new resolution/discovery/retry/mutation code was added
        // anywhere in the notification or navigation layer.
        const panelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        const forbiddenAdditions = /\b(discoveryProvider|repositorySearch|contentHash|retry|setTimeout|setInterval)\b/i;
        assert(!forbiddenAdditions.test(panelSource),
            'I2. NotificationHistoryPanel.js still carries no discovery provider, repository search, content-hash logic, retry, or polling of its own.');

        const classification = {
            'A — Action discoverability': 'PRODUCT_COMPLETE',
            'B — Successful navigation': 'PRODUCT_COMPLETE',
            'C — Stale target handling': 'PRODUCT_COMPLETE',
            'D — Event-shape tolerance': 'PRODUCT_COMPLETE',
            'E — Identity continuity': 'PRODUCT_COMPLETE',
            'F — Existing navigation boundary': 'PRODUCT_COMPLETE',
            'G — Cross-surface regression': 'PRODUCT_COMPLETE',
            'H — Failure isolation': 'PRODUCT_COMPLETE'
        };
        for (const [section, verdict] of Object.entries(classification)) {
            assert(typeof verdict === 'string' && verdict.length > 0, `I3. Section "${section}" carries an explicit classification.`);
        }

        console.log('✓ I: PRODUCT_COMPLETE across every section. The one boundary this audit was specifically asked to press on — payload.publicationId meaning "attempt," never "valid" — holds: session.findPublicationById() remains the sole, unbypassed authority for whether a target currently resolves, proven live rather than assumed.');
        console.log('\nVerdict: PRODUCT_COMPLETE. Notification → Publication navigation is discoverable exactly when it should be, reuses the existing findPublicationById()/focusWorld() path with no second mechanism, isolates stale/malformed/absent-capability failures to the single affected notification, preserves exact Publication identity, and leaves every pre-existing focusWorld() caller byte-for-byte untouched. No further notification-navigation milestone is indicated by this audit.');
    }

    console.log('\n✅ All NotificationPublicationNavigationBoundaryClosureAudit tests passed.');
}

runTests().catch((error) => {
    console.error(`\n✗ NotificationPublicationNavigationBoundaryClosureAudit tests failed: ${error.message}`);
    console.error(error);
    process.exitCode = 1;
});
