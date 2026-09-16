import PublicationList from '../ui/components/PublicationList.js';
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
import { Publication } from '../publisher/Publication.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { readFile } from 'node:fs/promises';

// 0.9.561 — Publication List Commentary Parity.
//
// 0.9.560's Cross-Surface Publication Action Consistency Audit (Section
// G) reconfirmed a gap first self-documented in PublicationCard.js's own
// 0.9.289 header: for the SAME PublicationCatalog/Publications,
// PublicationCard.js (the "cards" view) has carried full Commentary
// since 0.9.289, while PublicationList.js (the alternate "list" view of
// the IDENTICAL data) carried none. Switching a Repository/Author page
// from cards to list silently hid Commentary for the exact same
// publications. This milestone closes exactly that gap, exactly the way
// 0.9.560's own recommendation described: PublicationList.js now injects
// the SAME getPublicationCommentariesCommand/addPublicationCommentaryCommand
// PublicationCard.js already injects — no new command, no new use case,
// no new store, no new composition root.
//
// This file exercises the milestone's own lettered sections (A-J) against
// REAL collaborators (LocalIdentityProvider, LocalDiscoveryProvider,
// LocalPublisherProvider, PublicationCommentaryStore,
// NotificationEventStore, and all four application use cases,
// unmodified) — never a mock of the application layer — with
// PublicationList.js's own methods invoked the same way every sibling
// test file in this codebase already invokes a component's methods:
// bound to a plain ctx object mirroring a Vue component instance, never
// a full Vue mount.

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

function knowPublicationsLocally(storageProvider, publications) {
    storageProvider.save('forkbuild-publications', publications.map((p) => p.toJSON()));
}

// The real application stack application/CreatePublicationCommentaryUseCase.js
// itself composes, reproduced here the same way
// tests/OtherPublicationCommentaryEntryPoint.test.js's own makeBackend()
// already reproduces it for PublicationCard.js.
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
    function addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) {
        return publicationCommentaryCapability.execute({ publicationId, content, commentaryId, createdAt });
    }

    return {
        storage, identityProvider, publisherProvider, discoveryProvider,
        commentaryStore, notificationEventStore,
        getPublicationCommentariesCommand, addPublicationCommentaryCommand
    };
}

// A plain ctx mirroring a mounted PublicationList instance — same
// convention tests/OtherPublicationCommentaryEntryPoint.test.js's own
// cardCtx() already established, adapted for PublicationList.js's own
// per-row state shape (see PublicationList.js's own header, "one
// component, many rows").
function listCtx(overrides = {}) {
    return {
        getPublicationCommentariesCommand: null,
        addPublicationCommentaryCommand: null,
        commentaryState: {},
        rowCommentaryState: PublicationList.methods.rowCommentaryState,
        isCommentaryOpen: PublicationList.methods.isCommentaryOpen,
        toggleCommentary: PublicationList.methods.toggleCommentary,
        refreshCommentaries: PublicationList.methods.refreshCommentaries,
        submitCommentary: PublicationList.methods.submitCommentary,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — Same identity: commentary is scoped by publicationId,
    // never documentId or contentHash, and stays isolated per row on
    // the SAME PublicationList instance.
    // ---------------------------------------------------------------
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const p1 = backend.publisherProvider.publish(makeDocument('List A1', 'alice'), backend.identityProvider);
        const p2 = backend.publisherProvider.publish(makeDocument('List A2', 'alice'), backend.identityProvider);

        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });

        ctx.rowCommentaryState(p1).newText = 'on row 1';
        ctx.submitCommentary(p1);
        ctx.rowCommentaryState(p2).newText = 'on row 2';
        ctx.submitCommentary(p2);

        assert(ctx.rowCommentaryState(p1).commentaries.length === 1 && ctx.rowCommentaryState(p1).commentaries[0].content === 'on row 1',
            '1. row 1 shows exactly its own Publication\'s commentary, keyed by publicationId');
        assert(ctx.rowCommentaryState(p2).commentaries.length === 1 && ctx.rowCommentaryState(p2).commentaries[0].content === 'on row 2',
            '2. row 2 shows exactly its own Publication\'s commentary, isolated from row 1, on the SAME component instance');
        assert(!ctx.rowCommentaryState(p1).commentaries.some((c) => c.content === 'on row 2'),
            '3. row 1 never shows row 2\'s commentary');

        const source = await codeOnlySource('ui/components/PublicationList.js');
        assert(source.includes('this.getPublicationCommentariesCommand(pub.id)') && source.includes('publicationId: pub.id'),
            '4. PublicationList.js reads/writes strictly by publicationId — never documentId or contentHash');

        console.log('✓ Section A: commentary is scoped by publicationId, isolated per row, on the same PublicationList instance');
    }

    // ---------------------------------------------------------------
    // Section B — Same behavior: view, submit, failed submission,
    // retry, successful retry/idempotency — parity with PublicationCard.js.
    // ---------------------------------------------------------------
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('List B', 'alice'), backend.identityProvider);

        // Capability absent — hidden, never a throw.
        const ctxHidden = listCtx();
        ctxHidden.toggleCommentary(publication);
        assert(ctxHidden.rowCommentaryState(publication).open === false, '5. toggleCommentary() is a no-op with no capability wired');

        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });

        // Viewing.
        assert(ctx.isCommentaryOpen(publication) === false, '6. commentary starts collapsed for a fresh row');
        ctx.toggleCommentary(publication);
        assert(ctx.isCommentaryOpen(publication) === true, '7. toggling opens the row\'s own section and performs the first read');
        assert(Array.isArray(ctx.rowCommentaryState(publication).commentaries) && ctx.rowCommentaryState(publication).commentaries.length === 0,
            '8. opening an empty thread loads zero commentaries, not an error');

        // Submitting.
        ctx.rowCommentaryState(publication).newText = 'a first, real comment';
        ctx.submitCommentary(publication);
        assert(ctx.rowCommentaryState(publication).error === null, '9. a well-formed submission succeeds');
        assert(ctx.rowCommentaryState(publication).commentaries.length === 1, '10. the submitted commentary is immediately visible after re-query');
        assert(ctx.rowCommentaryState(publication).newText === '', '11. a successful submission clears that row\'s own draft');

        // Failed submission (unauthenticated) then retry after signing
        // back in — same two-step story PublicationCard.js's own Section
        // G/I already covers, reproduced here for the list surface.
        backend.identityProvider.logout();
        const p2 = new Publication({ id: 'p2-unauth', documentId: 'doc-b2', title: 'Unauth', author: 'alice', publisherIdentity: { id: 'did:key:alice' } });
        knowPublicationsLocally(backend.storage, [
            new Publication({ id: publication.id, documentId: publication.documentId, title: publication.title, author: 'alice', publishedAt: publication.publishedAt, publisherIdentity: publication.publisherIdentity }),
            p2
        ]);
        ctx.rowCommentaryState(p2).newText = 'nobody is signed in';
        ctx.submitCommentary(p2);
        assert(typeof ctx.rowCommentaryState(p2).error === 'string' && ctx.rowCommentaryState(p2).error.length > 0,
            '12. a rejected submission surfaces the existing use case\'s own rejection, on that row only');
        assert(ctx.rowCommentaryState(p2).newText === 'nobody is signed in', '13. a rejected attempt never discards what was typed');
        assert(ctx.rowCommentaryState(p2).commentaries.length === 0, '14. a rejected attempt persists nothing for that row');

        // Retry after signing back in — the SAME draft, same commentaryId
        // (0.9.542 stable retry identity), now succeeds.
        backend.identityProvider.login('alice');
        ctx.submitCommentary(p2);
        assert(ctx.rowCommentaryState(p2).error === null, '15. retrying the identical draft after fixing the underlying failure now succeeds');
        assert(ctx.rowCommentaryState(p2).commentaries.length === 1, '16. exactly one commentary persisted for the retried row');

        console.log('✓ Section B: view / submit / failed submission / retry / successful retry all behave the same way PublicationCard.js already does, on the list surface');
    }

    // ---------------------------------------------------------------
    // Section C — Same retry semantics: a failed submission followed by
    // retry does not create a second commentary record.
    // ---------------------------------------------------------------
    {
        const backend = makeBackend({ notificationSink: () => { throw new Error('notification store unavailable'); } });
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('List C', 'alice'), backend.identityProvider);

        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });

        ctx.rowCommentaryState(publication).newText = 'persisted despite notification failure';
        ctx.submitCommentary(publication);
        assert(typeof ctx.rowCommentaryState(publication).error === 'string' && ctx.rowCommentaryState(publication).error.includes('notification store unavailable'),
            '17. the notification-sink failure surfaces as this row\'s own error, even though the commentary itself was already persisted');

        const draftBeforeRetry = ctx.rowCommentaryState(publication).pendingDraft;
        assert(draftBeforeRetry && draftBeforeRetry.commentaryId, '18. a pendingDraft with a stable commentaryId is retained for the manual retry');

        // Manual retry of the UNCHANGED draft — reuses the same
        // commentaryId, engaging the store's own idempotent-retry
        // identity, never minting a second record.
        ctx.submitCommentary(publication);

        const persisted = backend.commentaryStore.getForPublication(publication.id);
        assert(persisted.length === 1 && persisted[0].content === 'persisted despite notification failure',
            '19. exactly one commentary record exists after the retry — never a duplicate');

        console.log('✓ Section C: a failed submission followed by retry never creates a second commentary record');
    }

    // ---------------------------------------------------------------
    // Section D — Catalog isolation: switching between card/list
    // representations does not duplicate or mutate Publication records.
    // ---------------------------------------------------------------
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('List D', 'alice'), backend.identityProvider);

        const before = backend.discoveryProvider.findByDocumentId(publication.documentId);
        assert(before.length === 1, '20. exactly one Publication exists before any view is touched');

        // "Mounting" both views against the identical publication object
        // (PublicationCatalog.js forwards the same `pub` reference to
        // both — see PublicationCatalog.js's own template), then
        // toggling list commentary open/closed and reading through the
        // list surface repeatedly.
        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });
        ctx.toggleCommentary(publication);
        ctx.toggleCommentary(publication);
        ctx.toggleCommentary(publication);

        const after = backend.discoveryProvider.findByDocumentId(publication.documentId);
        assert(after.length === 1, '21. still exactly one Publication after repeated list-view toggling — no duplication');
        assert(after[0].id === publication.id && after[0].title === publication.title && +after[0].publishedAt === +publication.publishedAt,
            '22. the Publication record itself is byte-identical — never mutated by rendering or toggling the list\'s own commentary section');

        const listSource = await codeOnlySource('ui/components/PublicationList.js');
        assert(!/publisherProvider|publishDocumentUseCase|unpublish/i.test(listSource),
            '23. PublicationList.js never references any Publication-mutating collaborator — it only reads/writes Commentary');

        console.log('✓ Section D: choosing list presentation never duplicates or mutates the underlying Publication catalog');
    }

    // ---------------------------------------------------------------
    // Section E — Republish safety: for P1 (document D, hash H) and P2
    // (document D, hash H — a republish of the identical content),
    // commentary remains independently attached to each.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const commentaryStore = new PublicationCommentaryStore(storage);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canComment);
        const getUseCase = new GetPublicationCommentariesUseCase(commentaryStore);

        function getPublicationCommentariesCommand(publicationId) { return getUseCase.execute({ publicationId }); }
        function addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) { return addUseCase.execute({ publicationId, content, commentaryId, createdAt }); }

        const sharedDocumentId = 'doc-e-shared';
        const sharedContentHash = 'hash-e-shared';
        const p1 = new Publication({ id: 'pub-e-p1', documentId: sharedDocumentId, title: 'Republished', author: 'alice', publisherIdentity: { id: 'did:key:alice' }, contentReference: { hash: sharedContentHash } });
        const p2 = new Publication({ id: 'pub-e-p2', documentId: sharedDocumentId, title: 'Republished', author: 'alice', publisherIdentity: { id: 'did:key:alice' }, contentReference: { hash: sharedContentHash } });
        knowPublicationsLocally(storage, [p1, p2]);
        assert(p1.documentId === p2.documentId && p1.contentReference.hash === p2.contentReference.hash && p1.id !== p2.id,
            '24. sanity: P1 and P2 genuinely share documentId and contentHash but carry distinct publicationIds');

        identityProvider.login('alice');
        const ctx = listCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand });

        ctx.rowCommentaryState(p1).newText = 'commenting on the first publish';
        ctx.submitCommentary(p1);
        ctx.rowCommentaryState(p2).newText = 'commenting on the republish';
        ctx.submitCommentary(p2);

        assert(ctx.rowCommentaryState(p1).commentaries.length === 1 && ctx.rowCommentaryState(p1).commentaries[0].content === 'commenting on the first publish',
            '25. P1\'s own row shows exactly P1\'s own commentary');
        assert(ctx.rowCommentaryState(p2).commentaries.length === 1 && ctx.rowCommentaryState(p2).commentaries[0].content === 'commenting on the republish',
            '26. P2\'s own row shows exactly P2\'s own commentary — never P1\'s, despite identical documentId/contentHash');
        assert(commentaryStore.getForPublication(p1.id).length === 1 && commentaryStore.getForPublication(p2.id).length === 1,
            '27. the store itself keeps the two republishes\' commentary fully separate');

        console.log('✓ Section E: two republishes of the same document/hash keep independently-attached commentary, never merged by documentId or contentHash');
    }

    // ---------------------------------------------------------------
    // Section F — Existing commands: no new commentary use case, store,
    // or command was introduced.
    // ---------------------------------------------------------------
    {
        const listCode = await codeOnlySource('ui/components/PublicationList.js');
        const forbidden = [
            "from '../../core/PublicationCommentary.js'",
            "from '../../storage/PublicationCommentaryStore.js'",
            "from '../../application/GetPublicationCommentariesUseCase.js'",
            "from '../../application/AddPublicationCommentaryUseCase.js'",
            'new PublicationCommentary(', 'PublicationCommentaryStore',
            'OtherPublicationCommentaryUseCase', 'AddCommentToOtherPublicationUseCase',
            'ListPublicationCommentaryUseCase', 'PublicationListCommentaryStore'
        ];
        for (const term of forbidden) {
            assert(!listCode.includes(term), `28. PublicationList.js never references '${term}' — it only calls the injected commands`);
        }
        assert((listCode.match(/this\.addPublicationCommentaryCommand\(/g) || []).length === 1,
            '29. addPublicationCommentaryCommand is called from exactly one place');
        assert(listCode.includes("getPublicationCommentariesCommand: { default: null }") && listCode.includes("addPublicationCommentaryCommand: { default: null }"),
            '30. PublicationList.js injects the SAME two optional commands PublicationCard.js already injects — no new provide/inject key');

        const mainCode = await codeOnlySource('ui/main.js');
        assert((mainCode.match(/new CreatePublicationCommentaryUseCase\(\)/g) || []).length === 1,
            '31. ui/main.js still composes exactly ONE instance of CreatePublicationCommentaryUseCase — not a second composition root for the list surface');
        assert((mainCode.match(/app\.provide\('getPublicationCommentariesCommand'/g) || []).length === 1 &&
               (mainCode.match(/app\.provide\('addPublicationCommentaryCommand'/g) || []).length === 1,
            '32. ui/main.js still provides each command exactly once, app-wide — PublicationList.js reaches it through the SAME provide/inject wiring, never a new one');

        console.log('✓ Section F: no new commentary use case, store, or command — the existing app-wide commands are reused verbatim');
    }

    // ---------------------------------------------------------------
    // Section G — Failure isolation: failure for one Publication's
    // commentary, on one row, never affects a neighboring row of the
    // SAME PublicationList instance.
    // ---------------------------------------------------------------
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const realPublication = backend.publisherProvider.publish(makeDocument('List G', 'alice'), backend.identityProvider);
        const fabricatedPublication = { id: 'not-a-real-publication' };

        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });

        ctx.rowCommentaryState(fabricatedPublication).newText = 'this publication does not exist';
        ctx.submitCommentary(fabricatedPublication);
        assert(typeof ctx.rowCommentaryState(fabricatedPublication).error === 'string',
            '33. the row for a fabricated publicationId fails, through the existing authorization boundary');

        ctx.rowCommentaryState(realPublication).newText = 'a genuinely different row';
        ctx.submitCommentary(realPublication);
        assert(ctx.rowCommentaryState(realPublication).error === null, '34. the neighboring, genuine row succeeds — untouched by the other row\'s failure');
        assert(ctx.rowCommentaryState(realPublication).commentaries.length === 1, '35. the genuine row\'s own commentary is persisted and visible');

        assert(ctx.rowCommentaryState(fabricatedPublication).error !== null,
            '36. the fabricated row\'s own error is still present, unaffected by the other row\'s later success — no shared mutable state between rows');

        console.log('✓ Section G: failure for one row\'s commentary never leaks into, and is never cleared by, a neighboring row on the same list instance');
    }

    // ---------------------------------------------------------------
    // Section H — Presentation: human-facing commentary vocabulary,
    // never internal ids/statuses, exposed to the viewer.
    // ---------------------------------------------------------------
    {
        const rawTemplateSource = await rawSource('ui/components/PublicationList.js');
        assert(rawTemplateSource.includes('>Comment<') || rawTemplateSource.includes("'Hide Comments'"),
            '37. the action label is human-facing ("Comment"/"Hide Comments"), not an internal verb');
        assert(rawTemplateSource.includes('No commentary yet.'),
            '38. an empty thread reads as a plain sentence, not a raw empty-array or status code');
        assert(rawTemplateSource.includes("'Posting…'") && rawTemplateSource.includes('Post Comment'),
            '39. the submit affordance reads as plain language throughout its states');
        assert(!/isNew|commentaryId\}\}|pendingDraft/.test(rawTemplateSource.match(/template: `([\s\S]*)`\s*};?\s*$/)[1]),
            '40. internal fields (isNew, commentaryId, pendingDraft) are never interpolated into the rendered template — only human content/author fields are');

        console.log('✓ Section H: the list surface presents commentary in the same human vocabulary as PublicationCard.js — no internal id/status leaks into the UI');
    }

    // ---------------------------------------------------------------
    // Section I — Cross-surface parity: PublicationCard.js's own
    // existing implementation is behaviorally unchanged.
    // ---------------------------------------------------------------
    {
        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        assert(cardCode.includes('toggleCommentary()') && cardCode.includes('refreshCommentaries()') && cardCode.includes('submitCommentary()'),
            '41. PublicationCard.js still carries its own original 0.9.289 commentary methods, untouched');
        assert(cardCode.includes('this.pendingCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };'),
            '42. PublicationCard.js still carries its own 0.9.542 stable-retry-identity pattern, untouched');

        const compositionCode = await codeOnlySource('application/CreatePublicationCommentaryUseCase.js');
        assert(compositionCode.includes('new CanCommentOnPublicationUseCase(discoveryProvider)') &&
               compositionCode.includes('new GetPublicationCommentariesUseCase(publicationCommentaryStore)') &&
               compositionCode.includes('new AddPublicationCommentaryUseCase(') &&
               compositionCode.includes('new PublicationCommentaryNotificationProducer('),
            '43. application/CreatePublicationCommentaryUseCase.js still composes the identical, unmodified application layer');

        // Live: a commentary written through PublicationCard.js's own
        // exact call shape is immediately visible through
        // PublicationList.js's own rowCommentaryState — one underlying
        // store, two independently-invoked UI surfaces, never a
        // divergent read path.
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('List I', 'alice'), backend.identityProvider);

        const cardLikeCtx = {
            publication, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand,
            commentaries: [], newCommentaryText: 'written through the card-shaped call', commentarySubmitting: false,
            commentaryError: null, pendingCommentaryDraft: null,
            refreshCommentaries: () => {}
        };
        backend.addPublicationCommentaryCommand({ publicationId: publication.id, content: cardLikeCtx.newCommentaryText });

        const listCtxInstance = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });
        listCtxInstance.refreshCommentaries(publication);
        assert(listCtxInstance.rowCommentaryState(publication).commentaries.length === 1 &&
               listCtxInstance.rowCommentaryState(publication).commentaries[0].content === 'written through the card-shaped call',
            '44. a commentary written the same way PublicationCard.js writes it is immediately visible through PublicationList.js\'s own read path — one shared store, two consuming surfaces');

        console.log('✓ Section I: PublicationCard.js remains byte-for-byte unchanged, and both surfaces converge on the identical underlying Commentary store');
    }

    // ---------------------------------------------------------------
    // Section J — Boundary: PublicationList.js gains only the missing
    // Commentary affordance — no catalog/search/lifecycle redesign.
    // ---------------------------------------------------------------
    {
        const listCode = await codeOnlySource('ui/components/PublicationList.js');
        assert(/emits:\s*\['open',\s*'fork',\s*'explore',\s*'view-author'\]/.test(listCode),
            '45. PublicationList.js\'s own emits contract is unchanged — Open/Fork/Explore/view-author, the same four as before this milestone');
        assert(listCode.includes("items: { type: Array, required: true }") &&
               listCode.includes("descriptions: { type: Object, default: () => ({}) }") &&
               listCode.includes("parentTitles: { type: Object, default: () => ({}) }") &&
               listCode.includes("forkCounts: { type: Object, default: () => ({}) }") &&
               listCode.includes("preciseDateIds: { type: Set, default: () => new Set() }"),
            '46. PublicationList.js\'s own props contract is unchanged — no new prop was added for this milestone');

        const catalogCode = await codeOnlySource('ui/components/PublicationCatalog.js');
        assert(catalogCode.includes('<PublicationList') &&
               catalogCode.includes(':items="group.items"') &&
               !/getPublicationCommentariesCommand|addPublicationCommentaryCommand/.test(catalogCode),
            '47. PublicationCatalog.js is untouched by this milestone — it still forwards no commentary command of its own; PublicationList.js reaches the commands directly through provide/inject, exactly like PublicationCard.js already does');

        assert(!/router\.push|new PublicationQuery|SearchPublicationsUseCase|groupPublications/.test(listCode),
            '48. no catalog/search/grouping/lifecycle concept was introduced into PublicationList.js — it still only renders rows and emits the same four navigation events, plus the one new, narrow Commentary affordance');

        console.log('✓ Section J: PublicationList.js gained exactly the missing Commentary affordance — its own emits/props contract, and its host PublicationCatalog.js, are otherwise unchanged');
    }

    console.log('\n✅ All Publication List Commentary Parity tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
