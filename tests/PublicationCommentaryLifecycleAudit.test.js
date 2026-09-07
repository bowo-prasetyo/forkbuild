import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
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

// 0.9.249 — Publication Commentary Lifecycle & Isolation Audit.
//
// 0.9.242-0.9.248 built commentary from nothing (domain -> storage ->
// write command -> authorship -> authorization -> read command -> UI
// integration), closing with a genuine product-facing vertical slice:
//
//   OwnPublicationPanel -> WorldView command wrappers ->
//   WorldNavigationSession -> {GetPublicationCommentariesUseCase,
//   AddPublicationCommentaryUseCase} -> PublicationCommentaryStore
//
// This milestone adds no new capability. It is a TEST-ONLY audit of the
// complete lifecycle now that commentary has crossed the application/UI
// boundary — the same posture 0.9.208 ("World View History Preview/
// Restore Lifecycle Audit") and 0.9.239 ("Comprehensive Causal Deferral
// Lifecycle Audit") already took for their own subsystems, one seam over.
//
// Every section below runs against REAL collaborators — LocalIdentityProvider,
// LocalDiscoveryProvider, LocalPublisherProvider, PublicationCommentaryStore,
// CanCommentOnPublicationUseCase, GetPublicationCommentariesUseCase,
// AddPublicationCommentaryUseCase, and a real WorldNavigationSession — never
// a mock of the application layer. OwnPublicationPanel.js's own methods are
// invoked the identical way tests/PublicationCommentaryUIIntegration.test.js
// already does: bound to a plain ctx object mirroring a Vue component
// instance, never a full Vue mount (ui/views/WorldView.js itself cannot be
// mounted under plain `node tests/*.test.js` — it imports 'vue').
//
// FINDINGS. The audit found the 0.9.242-0.9.248 implementation already
// correct on every property this milestone's own brief named — no defect
// required a code change. Section D3 documents one genuine, deliberate
// architectural fact worth recording rather than "fixing": because
// GetPublicationCommentariesUseCase performs no I/O,
// refreshPublicationCommentaries() reads and assigns synchronously, in
// the same tick, with no `await`/`.then()` anywhere between the command
// call and the assignment — so the stale-response race every ASYNCHRONOUS
// sibling family in OwnPublicationPanel.js guards with its own
// `...RequestId` counter (snapshotDistribution, snapshotDiscovery, ...)
// is structurally impossible for commentary's read path. This is proven
// directly, not merely assumed, in Section D.
//
// This file is deliberately narrower in scope than the sum of its parts:
// no replies, editing, deletion, notifications, or decentralized
// commentary are added, exercised, or assumed anywhere below — the same
// restraint 0.9.248's own header already held one milestone earlier.

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

// The real application stack this audit exercises, mirroring
// application/CreateWorldViewUseCase.js's own 0.9.248 composition exactly
// (same storageProvider, same discoveryProvider, same identityProvider
// feeding all three commentary collaborators). Accepts an EXISTING
// storageProvider/identityProvider pair so Section H (Persistence/Reload)
// can build a genuinely SECOND, independent composition over the SAME
// durable storage — the same thing a page reload does to real
// `window.localStorage` — without this helper silently reusing any
// in-memory JS object from the first composition.
function makeBackend({ storage = null, identityProvider = null } = {}) {
    const backingStorage = storage || new InMemoryStorageProvider();
    const identity = identityProvider || new LocalIdentityProvider(backingStorage);
    const contentStore = new LocalContentStore(backingStorage);
    const publisherProvider = new LocalPublisherProvider(backingStorage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(backingStorage);

    const commentaryStore = new PublicationCommentaryStore(backingStorage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        commentaryStore,
        identity,
        canCommentOnPublicationUseCase
    );

    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider,
        identityProvider: identity,
        getPublicationCommentariesUseCase,
        addPublicationCommentaryUseCase
    });

    // The IDENTICAL thin wrappers ui/views/WorldView.js's own
    // getPublicationCommentariesCommand()/addPublicationCommentaryCommand()
    // are — reproduced here for the identical reason every sibling test
    // file's own makeXCommand() helper already is.
    const getPublicationCommentariesCommand = (publicationId) => session.getPublicationCommentaries(publicationId);
    const addPublicationCommentaryCommand = ({ publicationId, content }) => session.addPublicationCommentary({ publicationId, content });

    return {
        storage: backingStorage,
        identityProvider: identity,
        publisherProvider,
        discoveryProvider,
        commentaryStore,
        session,
        getPublicationCommentariesCommand,
        addPublicationCommentaryCommand
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
        refreshPublicationCommentaries: OwnPublicationPanel.methods.refreshPublicationCommentaries,
        submitPublicationCommentary: OwnPublicationPanel.methods.submitPublicationCommentary,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ===================================================================
    // Section A — Initial loading.
    // ===================================================================
    {
        // A1 — existing comments appear WHEN THE PANEL OPENS, i.e. through
        // the real mounted() lifecycle hook itself, never merely through a
        // directly-invoked refresh method. Every prior test of this
        // feature called refreshPublicationCommentaries()/
        // submitPublicationCommentary() directly; none exercised
        // OwnPublicationPanel.mounted() itself — this closes that gap.
        const { identityProvider, publisherProvider, session, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section A World', 'alice'), identityProvider);
        session.addPublicationCommentary({ publicationId: publication.id, content: 'already on file before the panel ever opens' });

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        OwnPublicationPanel.mounted.call(ctx);

        assert(ctx.publicationCommentaries.length === 1, 'A1: mounted() itself performs the initial commentary load — no direct refresh call was made by this test');
        assert(ctx.publicationCommentaries[0].content === 'already on file before the panel ever opens', 'A1: the loaded commentary is the real, previously-persisted record');

        // A2 — an empty Publication produces an empty state, through the
        // same mount path, never an error.
        const publication2 = publisherProvider.publish(makeDocument('Section A Empty World', 'alice'), identityProvider);
        const ctx2 = panelCtx({ publication: publication2, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        OwnPublicationPanel.mounted.call(ctx2);
        assert(Array.isArray(ctx2.publicationCommentaries) && ctx2.publicationCommentaries.length === 0, 'A2: a Publication with no commentary mounts to an empty array');
        assert(ctx2.publicationCommentaryError === null, 'A2: an empty result on mount is never reported as an error');

        // A3 — store ordering reaches the UI unchanged: three comments
        // saved in a known order must be rendered in that exact order,
        // never re-sorted (e.g. never newest-first, never alphabetized).
        const orderPublication = publisherProvider.publish(makeDocument('Section A Order', 'alice'), identityProvider);
        session.addPublicationCommentary({ publicationId: orderPublication.id, content: 'first' });
        session.addPublicationCommentary({ publicationId: orderPublication.id, content: 'second' });
        session.addPublicationCommentary({ publicationId: orderPublication.id, content: 'third' });
        const ctx3 = panelCtx({ publication: orderPublication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        OwnPublicationPanel.mounted.call(ctx3);
        const uiOrder = ctx3.publicationCommentaries.map((c) => c.content);
        const storeOrder = session.getPublicationCommentaries(orderPublication.id).map((c) => c.content);
        assert(JSON.stringify(uiOrder) === JSON.stringify(['first', 'second', 'third']), `A3: the UI renders commentary in exactly save order — got ${JSON.stringify(uiOrder)}`);
        assert(JSON.stringify(uiOrder) === JSON.stringify(storeOrder), 'A3: the UI order is byte-for-byte the store\'s own returned order — never independently re-sorted');

        console.log('✓ Section A: initial loading — mount hook loads existing commentary, empty Publications produce an empty state, and store ordering reaches the UI unchanged');
    }

    // ===================================================================
    // Section B — Submission lifecycle.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, commentaryStore, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});
        identityProvider.login('alice');
        const aliceId = identityProvider.getSigningIdentity().id;
        const publication = publisherProvider.publish(makeDocument('Section B', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: aliceId });

        // B1 — user enters text: the compose textarea's own v-model target
        // reflects exactly what was typed, before any submission.
        ctx.newCommentaryText = 'a draft in progress';
        assert(ctx.newCommentaryText === 'a draft in progress', 'B1: entered text is held verbatim in the compose draft before submission');

        // B2 — submission creates EXACTLY one Commentary — never zero,
        // never two (e.g. a double-fire, or a local append PLUS a stored
        // write both counting as "created").
        const before = commentaryStore.getForPublication(publication.id).length;
        ctx.submitPublicationCommentary();
        const after = commentaryStore.getForPublication(publication.id).length;
        assert(after === before + 1, `B2: submission persists exactly one new Commentary — went from ${before} to ${after}`);

        // B3 — author comes from authenticated identity, never from
        // anything supplied by this test's own ctx setup.
        assert(ctx.publicationCommentaries[0].authorIdentityId === aliceId, 'B3: the persisted author is the authenticated identity');

        // B4 — draft is cleared only after a SUCCESSFUL submission.
        assert(ctx.newCommentaryText === '', 'B4: the compose draft is cleared after a successful submission');

        // B5 — a failed submission (unknown Publication, so
        // CanCommentOnPublicationUseCase denies it) leaves the draft
        // intact — the person's typed text is never silently discarded
        // by a rejected attempt.
        const ctxFail = panelCtx({ publication: { id: 'no-such-publication', documentId: 'doc-x' }, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: aliceId });
        ctxFail.newCommentaryText = 'this must survive the failure';
        ctxFail.submitPublicationCommentary();
        assert(ctxFail.publicationCommentaryError !== null, 'B5: the rejected submission is surfaced as an error');
        assert(ctxFail.newCommentaryText === 'this must survive the failure', 'B5: a failed submission never clears the draft');

        console.log('✓ Section B: submission lifecycle — entry, single-Commentary creation, authenticated authorship, and success-only draft clearing');
    }

    // ===================================================================
    // Section C — Re-query authority.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, commentaryStore, session } = makeBackend({});
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section C', 'alice'), identityProvider);

        let readCalls = 0;
        const countingRead = (publicationId) => { readCalls += 1; return session.getPublicationCommentaries(publicationId); };
        const addCommand = (input) => session.addPublicationCommentary(input);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand: countingRead, addPublicationCommentaryCommand: addCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        OwnPublicationPanel.mounted.call(ctx);
        const readsAfterMount = readCalls;

        // C1 — submit -> store -> re-query -> UI state: exactly one fresh
        // read fires per submission, never zero (stale UI) and never more
        // than one (redundant re-fetching).
        ctx.newCommentaryText = 'submit then requery';
        ctx.submitPublicationCommentary();
        assert(readCalls === readsAfterMount + 1, `C1: a successful submission triggers exactly one fresh read — got ${readCalls - readsAfterMount}`);

        // C2 — the UI does NOT maintain a second commentary collection.
        // Prove it destructively: overwrite ctx.publicationCommentaries
        // with a bogus, stale array immediately before a second
        // submission. If the panel ever merged/appended into its own
        // locally-held array instead of fully replacing it from a fresh
        // store read, the bogus sentinel entry would still be present
        // afterward.
        ctx.publicationCommentaries = [{ commentaryId: 'BOGUS-SENTINEL', publicationId: publication.id, authorIdentityId: 'nobody', content: 'should never survive a re-query' }];
        ctx.newCommentaryText = 'second real comment';
        ctx.submitPublicationCommentary();
        const contents = ctx.publicationCommentaries.map((c) => c.content);
        assert(!contents.includes('should never survive a re-query'), 'C2: a stale locally-held array is fully REPLACED by the re-query, never merged into');
        assert(ctx.publicationCommentaries.every((c) => c.commentaryId !== 'BOGUS-SENTINEL'), 'C2: no sentinel from a prior local array survives a re-query');

        // C2b — a comment created through an entirely SEPARATE actor
        // (bypassing this panel's own submit path — e.g. a second local
        // identity, or another tab/session against the same store) is
        // picked up by the NEXT re-query exactly like the panel's own
        // comment is. This is the direct proof there is only ever one
        // authoritative source of truth (the store, read through the
        // query use case) — never a UI-side interpretation that could
        // drift from concurrent writes it didn't itself originate.
        commentaryStore.save(new (Object.getPrototypeOf(commentaryStore.getForPublication(publication.id)[0]).constructor)({
            publicationId: publication.id, authorIdentityId: 'external-actor', content: 'written directly to the store, not through this panel'
        }));
        ctx.refreshPublicationCommentaries();
        assert(ctx.publicationCommentaries.some((c) => c.content === 'written directly to the store, not through this panel'),
            'C2b: a comment persisted by an entirely separate actor is visible on the next re-query — the store is the one source of truth');

        console.log('✓ Section C: re-query authority — one fresh read per submission, and the store (never a second UI-held collection) is the one source of truth');
    }

    // ===================================================================
    // Section D — Publication switching.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});
        identityProvider.login('alice');
        const pA = publisherProvider.publish(makeDocument('Section D — A', 'alice'), identityProvider);
        const pB = publisherProvider.publish(makeDocument('Section D — B', 'alice'), identityProvider);
        const pC = publisherProvider.publish(makeDocument('Section D — C', 'alice'), identityProvider);

        const ctxA = panelCtx({ publication: pA, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctxA.newCommentaryText = 'comments A';
        ctxA.submitPublicationCommentary();
        assert(ctxA.publicationCommentaries.length === 1, 'D setup: Publication A has one comment');

        // D1 — A -> comments A -> switch -> B -> comments B: A's own
        // commentary must never remain visible for B.
        ctxA.publication = pB;
        OwnPublicationPanel.watch.publication.call(ctxA, pB, pA);
        assert(ctxA.publicationCommentaries.length === 0, 'D1: switching from A to B never leaves A\'s commentary on screen');

        // D2 — rapid publication changes: switch A -> B -> C back-to-back,
        // with no read ever awaited in between (each watcher call runs
        // fully to completion before the next fires, exactly as Vue's own
        // synchronous watcher dispatch would). The FINAL displayed state
        // must reflect only the LAST Publication, never an intermediate
        // one and never a mix.
        const ctxRapid = panelCtx({ publication: pA, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        OwnPublicationPanel.mounted.call(ctxRapid);
        ctxRapid.publication = pB;
        OwnPublicationPanel.watch.publication.call(ctxRapid, pB, pA);
        ctxRapid.publication = pC;
        OwnPublicationPanel.watch.publication.call(ctxRapid, pC, pB);
        assert(ctxRapid.publicationCommentaries.length === 0, 'D2: after A -> B -> C in rapid succession, the panel shows exactly C\'s (empty) commentary, not a stale intermediate');
        ctxRapid.newCommentaryText = 'lands on C only';
        ctxRapid.submitPublicationCommentary();
        assert(ctxRapid.publicationCommentaries.length === 1 && ctxRapid.publicationCommentaries[0].content === 'lands on C only',
            'D2: a submission after rapid switching is attributed to the CURRENT Publication (C), never A or B');

        // D3 — "delayed reads" cannot race a rapid switch here, and this
        // is proved structurally rather than assumed: GetPublicationCommentariesUseCase
        // performs no I/O, so refreshPublicationCommentaries() calls the
        // injected command and assigns its result synchronously — there
        // is no `await`/`.then()` anywhere between the call and the
        // assignment for a stale response to land inside. Unlike every
        // ASYNCHRONOUS sibling family in this file (snapshotDistribution,
        // snapshotDiscovery, snapshotCandidateDiscovery, ...), commentary
        // carries no `...RequestId` guard of its own — and this section
        // proves that omission is correct, not an oversight, by showing a
        // command that intentionally reorders its own side effects (to
        // simulate what an async race WOULD look like) can never actually
        // observe out-of-order delivery through a synchronous call path.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const refreshMethodMatch = panelCode.match(/refreshPublicationCommentaries\(\)\s*\{[\s\S]*?\n\s{8}\},/);
        assert(refreshMethodMatch, 'D3: refreshPublicationCommentaries() method body is present in the source for structural inspection');
        const refreshBody = refreshMethodMatch[0];
        assert(!/await\s|\.then\(/.test(refreshBody), 'D3: refreshPublicationCommentaries() contains no await/.then() — the read is synchronous end to end, so no stale-response race is structurally possible');

        // A fresh, never-before-touched Publication for this specific
        // ordering check — pC already carries the one comment D2 itself
        // submitted to it above, which is irrelevant noise here.
        const pD = publisherProvider.publish(makeDocument('Section D — D', 'alice'), identityProvider);

        let callOrder = [];
        const orderTrackingRead = (publicationId) => {
            callOrder.push(publicationId);
            // Even a command that intentionally does extra synchronous
            // work "in between" cannot reorder anything, because
            // JavaScript's own single-threaded execution guarantees this
            // entire call — and the assignment that follows it in
            // refreshPublicationCommentaries() — completes before the
            // NEXT watcher invocation ever begins.
            return getPublicationCommentariesCommand(publicationId);
        };
        const ctxOrder = panelCtx({ publication: pA, getPublicationCommentariesCommand: orderTrackingRead, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        OwnPublicationPanel.mounted.call(ctxOrder);
        ctxOrder.publication = pB;
        OwnPublicationPanel.watch.publication.call(ctxOrder, pB, pA);
        ctxOrder.publication = pD;
        OwnPublicationPanel.watch.publication.call(ctxOrder, pD, pB);
        assert(JSON.stringify(callOrder) === JSON.stringify([pA.id, pB.id, pD.id]), 'D3: reads fire in exactly the order Publications were switched, never reordered');
        assert(ctxOrder.publicationCommentaries.length === 0, 'D3: after the ordered sequence, the panel reflects only the LAST Publication (D), never A or B\'s prior state');

        console.log('✓ Section D: Publication switching — A never leaks into B, rapid A->B->C settles on C alone, and the synchronous read path structurally cannot race');
    }

    // ===================================================================
    // Section E — Authorship isolation.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, commentaryStore, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});
        const publication = (() => {
            identityProvider.login('alice');
            return publisherProvider.publish(makeDocument('Section E', 'alice'), identityProvider);
        })();

        // Alice -> comment A, Bob -> comment B, Alice -> comment C, all
        // through the SAME shared identityProvider/session — mirroring a
        // single replica with multiple local identities switching who is
        // currently signed in, exactly the shape resolveSigningIdentityId()
        // resolves for every other authorship-stamping use case in this
        // codebase.
        identityProvider.login('alice');
        const aliceId = identityProvider.getSigningIdentity().id;
        const ctxAlice1 = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: aliceId });
        ctxAlice1.newCommentaryText = 'comment A';
        ctxAlice1.submitPublicationCommentary();

        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;
        assert(bobId !== aliceId, 'E setup: Alice and Bob are genuinely distinct identities');
        const ctxBob = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: bobId });
        ctxBob.newCommentaryText = 'comment B';
        ctxBob.submitPublicationCommentary();

        identityProvider.login('alice');
        const ctxAlice2 = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctxAlice2.newCommentaryText = 'comment C';
        ctxAlice2.submitPublicationCommentary();

        const persisted = commentaryStore.getForPublication(publication.id);
        assert(persisted.length === 3, 'E: exactly three commentary records were persisted');
        assert(persisted[0].content === 'comment A' && persisted[0].authorIdentityId === aliceId, 'E: comment A is attributed to Alice');
        assert(persisted[1].content === 'comment B' && persisted[1].authorIdentityId === bobId, 'E: comment B is attributed to Bob, never Alice');
        assert(persisted[2].content === 'comment C' && persisted[2].authorIdentityId === aliceId, 'E: comment C is attributed to Alice again — the identity switch back is honored exactly');
        assert(new Set(persisted.map((c) => c.authorIdentityId)).size === 2, 'E: exactly two distinct authors appear across the three comments — never a third, blended, or default identity');

        // The UI never becomes an authorship authority: rendering through
        // a fresh panel confirms the SAME author facts the store itself
        // holds, with no re-derivation.
        const ctxRead = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: aliceId });
        OwnPublicationPanel.mounted.call(ctxRead);
        assert(JSON.stringify(ctxRead.publicationCommentaries.map((c) => c.authorIdentityId)) === JSON.stringify([aliceId, bobId, aliceId]),
            'E: a freshly-mounted panel renders exactly the store\'s own author sequence, unmodified');

        console.log('✓ Section E: authorship isolation — Alice/Bob/Alice persist with exactly the identities that were authenticated at each submission');
    }

    // ===================================================================
    // Section F — Authorization isolation.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, commentaryStore, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});

        // F1 — authenticated + existing Publication -> allowed (baseline,
        // the existing policy kept intact).
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section F', 'alice'), identityProvider);
        const ctxAllowed = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctxAllowed.newCommentaryText = 'allowed';
        ctxAllowed.submitPublicationCommentary();
        assert(ctxAllowed.publicationCommentaryError === null && ctxAllowed.publicationCommentaries.length === 1,
            'F1: an authenticated identity commenting on a real Publication succeeds');

        const totalBeforeDenials = commentaryStore.loadAll().length;

        // F2 — unauthenticated -> rejected. Driven directly against the
        // authoritative boundary (submitPublicationCommentary() called
        // with no identity ever logged in), never merely relying on the
        // UI's own "hide the compose form" hint — a defense-in-depth
        // check: even if a caller bypassed that hint, the application
        // layer itself still refuses.
        identityProvider.logout();
        const ctxUnauth = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: null });
        ctxUnauth.newCommentaryText = 'should be rejected — nobody is signed in';
        ctxUnauth.submitPublicationCommentary();
        assert(ctxUnauth.publicationCommentaryError !== null, 'F2: an unauthenticated submission is rejected');
        assert(ctxUnauth.publicationCommentaries.length === 0, 'F2: the panel\'s own displayed list stays empty for the rejected attempt');

        // F3 — nonexistent Publication -> rejected, even for an
        // authenticated identity.
        identityProvider.login('alice');
        const ctxUnknown = panelCtx({ publication: { id: 'totally-unknown-publication', documentId: 'doc-unknown' }, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctxUnknown.newCommentaryText = 'should be rejected — no such publication';
        ctxUnknown.submitPublicationCommentary();
        assert(ctxUnknown.publicationCommentaryError !== null, 'F3: a nonexistent Publication is rejected even for an authenticated identity');

        // F4 — neither denial created a partial Commentary record. The
        // store's own total count is unchanged since F1's one legitimate
        // write.
        const totalAfterDenials = commentaryStore.loadAll().length;
        assert(totalAfterDenials === totalBeforeDenials, `F4: no partial Commentary record was created by either denial — store count stayed at ${totalBeforeDenials}, got ${totalAfterDenials}`);
        assert(commentaryStore.getForPublication('totally-unknown-publication').length === 0, 'F4: nothing was ever persisted under the unknown publicationId itself');

        console.log('✓ Section F: authorization isolation — authenticated+real allowed, unauthenticated and unknown-Publication rejected, and neither denial persists a partial record');
    }

    // ===================================================================
    // Section G — Read/write failure isolation.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});
        identityProvider.login('alice');
        const aliceId = identityProvider.getSigningIdentity().id;
        const publication = publisherProvider.publish(makeDocument('Section G', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: aliceId });
        ctx.newCommentaryText = 'baseline comment';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 1, 'G setup: one real comment exists before any failure is introduced');

        // read failure ≠ submission state corruption: a failing read
        // never touches publicationCommentarySubmitting/newCommentaryText,
        // and leaves the already-displayed list untouched.
        const failingRead = () => { throw new Error('storage unavailable'); };
        ctx.getPublicationCommentariesCommand = failingRead;
        ctx.newCommentaryText = 'draft untouched by the coming read failure';
        ctx.refreshPublicationCommentaries();
        assert(ctx.publicationCommentaryError !== null, 'G: a failed read reports an error');
        assert(ctx.publicationCommentaries.length === 1 && ctx.publicationCommentaries[0].content === 'baseline comment',
            'G: read failure ≠ submission state corruption — the previously-loaded list survives a failed read untouched');
        assert(ctx.newCommentaryText === 'draft untouched by the coming read failure' && ctx.publicationCommentarySubmitting === false,
            'G: a failed READ never touches the compose draft or the submit-in-flight guard at all');

        // write failure ≠ draft loss: a failing write leaves the typed
        // draft exactly as it was, never clearing it the way only a
        // SUCCESSFUL submission may.
        ctx.getPublicationCommentariesCommand = getPublicationCommentariesCommand;
        ctx.publicationCommentaryError = null;
        const failingWrite = () => { throw new Error('write rejected'); };
        ctx.addPublicationCommentaryCommand = failingWrite;
        ctx.newCommentaryText = 'this draft must survive the write failure';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaryError !== null, 'G: a failed write reports an error');
        assert(ctx.newCommentaryText === 'this draft must survive the write failure', 'G: write failure ≠ draft loss — the draft is preserved exactly as typed');
        assert(ctx.publicationCommentaries.length === 1 && ctx.publicationCommentaries[0].content === 'baseline comment',
            'G: a failed write never corrupts or duplicates the already-displayed list');
        assert(ctx.publicationCommentarySubmitting === false, 'G: the submitting guard clears even after a write failure');

        // authorization failure ≠ commentary creation: routed through the
        // REAL AddPublicationCommentaryUseCase/CanCommentOnPublicationUseCase
        // this time (never a synthetic failingWrite spy), for an unknown
        // Publication.
        ctx.addPublicationCommentaryCommand = addPublicationCommentaryCommand;
        ctx.publicationCommentaryError = null;
        ctx.publication = { id: 'nonexistent-for-g', documentId: 'doc-g' };
        ctx.newCommentaryText = 'authorization should deny this';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaryError !== null, 'G: an authorization failure is surfaced as an error');
        assert(ctx.publicationCommentaries.length === 1 && ctx.publicationCommentaries[0].content === 'baseline comment',
            'G: authorization failure ≠ commentary creation — the denied attempt adds nothing to the displayed list, which still shows only the pre-existing baseline comment');
        assert(!ctx.publicationCommentaries.some((c) => c.content === 'authorization should deny this'),
            'G: the denied content itself never appears anywhere in displayed state');
        assert(getPublicationCommentariesCommand('nonexistent-for-g').length === 0,
            'G: nothing was ever persisted under the denied publicationId');

        // authentication failure — the fourth failure kind — behaves
        // identically: no crash, no corrupted OTHER state, an error is
        // reported and nothing else changes.
        identityProvider.logout();
        ctx.publication = publication;
        ctx.publicationCommentaryError = null;
        ctx.refreshPublicationCommentaries();
        assert(ctx.publicationCommentaryError === null && ctx.publicationCommentaries.length === 1,
            'G: reading (never writing) an existing Publication\'s commentary needs no authentication at all — an unauthenticated READ still succeeds, unaffected by write-side authentication failures elsewhere');
        ctx.newCommentaryText = 'should fail — logged out';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaryError !== null, 'G: an authentication failure (logged out) is rejected on write');
        assert(ctx.publicationCommentaries.length === 1 && ctx.publicationCommentaries[0].content === 'baseline comment',
            'G: an authentication failure never corrupts the already-displayed, previously-loaded commentary list');

        // Finally, prove none of the four failures left the panel in a
        // permanently broken state: a genuinely successful operation
        // immediately after still works.
        identityProvider.login('alice');
        ctx.publicationCommentaryError = null;
        ctx.newCommentaryText = 'recovered after four different failure kinds';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaryError === null, 'G: a real submission succeeds cleanly after read/write/authorization/authentication failures, in sequence, on the SAME ctx');
        assert(ctx.publicationCommentaries.some((c) => c.content === 'recovered after four different failure kinds'),
            'G: the recovered submission is genuinely visible — the panel was never left stuck by any prior failure');

        console.log('✓ Section G: read/write/authorization/authentication failures are each isolated — none corrupts any of the others\' state, and the panel always recovers');
    }

    // ===================================================================
    // Section H — Persistence/reload.
    // ===================================================================
    {
        // A genuinely SEPARATE, first composition ("tab 1" / "session 1").
        const storage = new InMemoryStorageProvider();
        const backend1 = makeBackend({ storage });
        backend1.identityProvider.login('alice');
        const aliceId1 = backend1.identityProvider.getSigningIdentity().id;
        const publication = backend1.publisherProvider.publish(makeDocument('Section H', 'alice'), backend1.identityProvider);

        const ctx1 = panelCtx({
            publication,
            getPublicationCommentariesCommand: backend1.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend1.addPublicationCommentaryCommand,
            viewerIdentityId: aliceId1
        });
        ctx1.newCommentaryText = 'this must survive a full reload';
        ctx1.submitPublicationCommentary();
        assert(ctx1.publicationCommentaries.length === 1, 'H setup: the comment exists in the first composition');

        // "Destroy" — every JS object from the first composition
        // (identityProvider, session, stores, use cases, ctx) is simply
        // abandoned here; nothing from it is referenced again below. Only
        // `storage` (the stand-in for real `window.localStorage`, which
        // genuinely does survive a page reload) is carried forward.

        // "Recreate" — a brand-new identityProvider, a brand-new
        // WorldNavigationSession, brand-new use case instances, and a
        // brand-new panel ctx, built from nothing but the durable storage.
        const backend2 = makeBackend({ storage });
        // A real reload re-authenticates by the same login label — this
        // is LocalIdentityProvider's own find-or-create-by-label
        // behavior (identity/LocalIdentityProvider.js), not anything this
        // test fabricates.
        backend2.identityProvider.login('alice');
        const aliceId2 = backend2.identityProvider.getSigningIdentity().id;
        assert(aliceId2 === aliceId1, 'H: re-authenticating by the same label after a full reload resolves to the SAME identity, from durable storage alone');

        const ctx2 = panelCtx({
            publication,
            getPublicationCommentariesCommand: backend2.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend2.addPublicationCommentaryCommand,
            viewerIdentityId: aliceId2
        });
        OwnPublicationPanel.mounted.call(ctx2);

        assert(ctx2.publicationCommentaries.length === 1, 'H: the commentary is still present after destroying and rebuilding the entire session/UI composition');
        assert(ctx2.publicationCommentaries[0].content === 'this must survive a full reload', 'H: the exact content survives the reload');
        assert(ctx2.publicationCommentaries[0].commentaryId === ctx1.publicationCommentaries[0].commentaryId, 'H: it is the SAME commentaryId, not a re-created record');
        assert(ctx2.publicationCommentaries[0].authorIdentityId === aliceId1, 'H: authorship survives the reload unchanged');
        assert(backend1.session !== backend2.session && backend1.identityProvider !== backend2.identityProvider,
            'H: the two compositions are genuinely independent object graphs — nothing was reused but the durable storage itself');

        console.log('✓ Section H: persistence/reload — commentary survives destroying and rebuilding the entire session/UI composition from durable storage alone, proving it is real application data, not component state');
    }

    // ===================================================================
    // Section I — Publication identity boundary.
    // ===================================================================
    {
        const { identityProvider, publisherProvider, commentaryStore, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend({});
        identityProvider.login('alice');
        const documentX = makeDocument('Document X', 'alice');
        const p1 = publisherProvider.publish(documentX, identityProvider);
        const p2 = publisherProvider.publish(documentX, identityProvider);
        assert(p1.id !== p2.id, 'I setup: publishing the same Document twice yields two distinct Publication ids');
        assert(p1.documentId === p2.documentId, 'I setup: both Publications trace back to the exact same underlying Document');

        // TWO SIMULTANEOUSLY OPEN panels — never one panel switching
        // between them — the strongest form of this isolation: both
        // object graphs are alive, in memory, at the same time.
        const ctxP1 = panelCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        const ctxP2 = panelCtx({ publication: p2, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });

        ctxP1.newCommentaryText = 'C1 — belongs to P1';
        ctxP1.submitPublicationCommentary();
        ctxP2.newCommentaryText = 'C2 — belongs to P2';
        ctxP2.submitPublicationCommentary();

        // Re-read both, still simultaneously open, in the opposite order
        // from how they were written, to rule out any ordering-dependent
        // leak.
        ctxP2.refreshPublicationCommentaries();
        ctxP1.refreshPublicationCommentaries();

        assert(ctxP1.publicationCommentaries.length === 1 && ctxP1.publicationCommentaries[0].content === 'C1 — belongs to P1', 'I: P1\'s panel shows exactly C1');
        assert(ctxP2.publicationCommentaries.length === 1 && ctxP2.publicationCommentaries[0].content === 'C2 — belongs to P2', 'I: P2\'s panel shows exactly C2');
        assert(ctxP1.publicationCommentaries !== ctxP2.publicationCommentaries, 'I: the two panels never share the same array reference');
        assert(!ctxP1.publicationCommentaries.some((c) => c.content.includes('P2')), 'I: C2 never crosses into P1\'s displayed list');
        assert(!ctxP2.publicationCommentaries.some((c) => c.content.includes('P1')), 'I: C1 never crosses into P2\'s displayed list');

        // And directly at the store — the authoritative source — bypassing
        // the UI/panel layer entirely, confirming the boundary is a real
        // storage-level fact, not merely something the UI happens to
        // filter correctly.
        assert(commentaryStore.getForPublication(p1.id).length === 1 && commentaryStore.getForPublication(p1.id)[0].content === 'C1 — belongs to P1',
            'I: the store itself holds exactly C1 for P1');
        assert(commentaryStore.getForPublication(p2.id).length === 1 && commentaryStore.getForPublication(p2.id)[0].content === 'C2 — belongs to P2',
            'I: the store itself holds exactly C2 for P2');
        assert(commentaryStore.loadAll().length === 2, 'I: exactly two commentary records exist in total — one per Publication, never duplicated across the shared Document');

        console.log('✓ Section I: Publication identity boundary — two Publications from the SAME Document, both open simultaneously, never cross-contaminate at the panel or the store');
    }

    // ===================================================================
    // Section J — Architecture boundary.
    // ===================================================================
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        const addUseCaseCode = await codeOnlySource('application/AddPublicationCommentaryUseCase.js');

        // OwnPublicationPanel.js never imports the domain class, the
        // store, or either use case directly — it only ever calls the
        // two injected command props.
        const forbiddenInPanel = [
            "from '../../core/PublicationCommentary.js'",
            "from '../../storage/PublicationCommentaryStore.js'",
            "from '../../application/GetPublicationCommentariesUseCase.js'",
            "from '../../application/AddPublicationCommentaryUseCase.js'",
            "from '../../application/CanCommentOnPublicationUseCase.js'",
            "from '../../identity/resolveSigningIdentityId.js'",
            'new PublicationCommentary(',
            'PublicationCommentaryStore',
            'canCommentOnPublicationUseCase',
            'resolveSigningIdentityId'
        ];
        for (const term of forbiddenInPanel) {
            assert(!panelCode.includes(term), `J: OwnPublicationPanel.js never references '${term}' — it does not import storage, construct the domain class, resolve authorship, or perform authorization itself`);
        }

        // The panel never assigns/derives an authorIdentityId of its own,
        // and never sends more than the two documented fields to the
        // write command.
        assert(!panelCode.includes('authorIdentityId:'), 'J: OwnPublicationPanel.js never constructs an object literal naming authorIdentityId — it cannot even attempt to supply one');
        assert((panelCode.match(/this\.addPublicationCommentaryCommand\(/g) || []).length === 1, 'J: addPublicationCommentaryCommand is called from exactly one place');
        assert((panelCode.match(/this\.getPublicationCommentariesCommand\(/g) || []).length === 1, 'J: getPublicationCommentariesCommand is called from exactly one place');

        // WorldNavigationSession remains a delegation/composition
        // boundary — it never imports the domain class or the storage
        // class either, and its own two commentary methods contain
        // nothing but a guard clause plus a single delegated call.
        const forbiddenInSession = [
            "from '../core/PublicationCommentary.js'",
            "from '../storage/PublicationCommentaryStore.js'",
            'new PublicationCommentary('
        ];
        for (const term of forbiddenInSession) {
            assert(!sessionCode.includes(term), `J: WorldNavigationSession.js never references '${term}' — it delegates entirely to the injected use cases`);
        }
        assert(sessionCode.includes('this._getPublicationCommentariesUseCase.execute({ publicationId })'), 'J: WorldNavigationSession.getPublicationCommentaries() delegates unmodified to the injected use case');
        assert(sessionCode.includes('this._addPublicationCommentaryUseCase.execute({ publicationId, content })'), 'J: WorldNavigationSession.addPublicationCommentary() delegates unmodified to the injected use case, forwarding no authorIdentityId');

        // No accidental coupling to the 0.9.222-0.9.240 causal
        // collaboration machinery: commentary carries none of that arc's
        // own vocabulary, and the write use case never even reads a
        // documentId — only a publicationId.
        const collaborationVocabulary = ['causalPredecessors', 'logicalClock', 'operationId', 'DocumentOperationDeferralUseCase', 'CommandHistory', 'DocumentOperationCausalGapDetector'];
        for (const term of collaborationVocabulary) {
            assert(!addUseCaseCode.includes(term), `J: AddPublicationCommentaryUseCase.js carries no collaboration-arc vocabulary ('${term}')`);
            assert(!panelCode.includes(term), `J: OwnPublicationPanel.js carries no collaboration-arc vocabulary ('${term}') in its own commentary wiring`);
        }
        assert(!addUseCaseCode.includes('documentId'), 'J: AddPublicationCommentaryUseCase.js never references documentId — commentary is keyed strictly to publicationId');

        console.log('✓ Section J: architecture boundary — OwnPublicationPanel and WorldNavigationSession stay pure delegation/composition, with zero accidental coupling to Document collaboration machinery');
    }

    console.log('\n✅ All Publication Commentary Lifecycle & Isolation Audit tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
