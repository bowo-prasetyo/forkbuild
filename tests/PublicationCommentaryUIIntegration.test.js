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

// 0.9.248 — Publication Commentary UI Integration.
//
// 0.9.242-0.9.247 built a complete, authoritative application-layer
// read/write pair for Publication commentary but wired it to no UI at
// all. This milestone reaches ui/components/OwnPublicationPanel.js — the
// existing Publication-inspection surface ui/views/WorldView.js already
// mounts (Publication identity, distribution/discovery actions) — with a
// Commentary section, and wires WorldNavigationSession/CreateWorldViewUseCase
// as the one composition path between it and the two use cases.
//
// This file exercises the milestone's own named sections against REAL
// collaborators (LocalIdentityProvider, LocalDiscoveryProvider,
// LocalPublisherProvider, PublicationCommentaryStore, and the two
// application use cases, unmodified) wired through a REAL
// WorldNavigationSession — never a mock of the application layer — with
// only OwnPublicationPanel.js's own methods invoked the same way every
// sibling test file in this codebase already invokes them: bound to a
// plain ctx object mirroring a Vue component instance, never a full Vue
// mount.

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

// The real application stack this milestone wires OwnPublicationPanel.js
// to, mirroring application/CreateWorldViewUseCase.js's own 0.9.248
// composition exactly (same storageProvider, same discoveryProvider,
// same identityProvider feeding all three commentary collaborators).
function makeBackend() {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    const contentStore = new LocalContentStore(storage);
    const publisherProvider = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);

    const commentaryStore = new PublicationCommentaryStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        commentaryStore,
        identityProvider,
        canCommentOnPublicationUseCase
    );

    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider,
        getPublicationCommentariesUseCase,
        addPublicationCommentaryUseCase
    });

    // The IDENTICAL thin wrappers ui/views/WorldView.js's own
    // getPublicationCommentariesCommand()/addPublicationCommentaryCommand()
    // are, reproduced here for the identical reason every sibling test
    // file's own makeXCommand() helper already is.
    const getPublicationCommentariesCommand = (publicationId) => session.getPublicationCommentaries(publicationId);
    const addPublicationCommentaryCommand = ({ publicationId, content }) => session.addPublicationCommentary({ publicationId, content });

    return { storage, identityProvider, publisherProvider, discoveryProvider, commentaryStore, session, getPublicationCommentariesCommand, addPublicationCommentaryCommand };
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
    // ---------------------------------------------------------------
    // Section A — Existing commentary appears, obtained through the
    // real GetPublicationCommentariesUseCase.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section A World', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'first comment';
        ctx.submitPublicationCommentary();

        assert(ctx.publicationCommentaries.length === 1, '1. a persisted commentary is obtained through the real query use case');
        assert(ctx.publicationCommentaries[0].content === 'first comment', '2. the rendered commentary carries the real, persisted content');
        assert(ctx.publicationCommentaryError === null, '3. a successful load reports no error');

        console.log('✓ Section A: existing commentary is loaded through GetPublicationCommentariesUseCase and rendered');
    }

    // ---------------------------------------------------------------
    // Section B — Multiple Publications remain isolated: P1 -> C1, C2;
    // P2 -> C3. Opening P1 must never display C3.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const p1 = publisherProvider.publish(makeDocument('P1', 'alice'), identityProvider);
        const p2 = publisherProvider.publish(makeDocument('P2', 'alice'), identityProvider);

        const ctxP1 = panelCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctxP1.newCommentaryText = 'C1';
        ctxP1.submitPublicationCommentary();
        ctxP1.newCommentaryText = 'C2';
        ctxP1.submitPublicationCommentary();

        const ctxP2 = panelCtx({ publication: p2, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctxP2.newCommentaryText = 'C3';
        ctxP2.submitPublicationCommentary();

        ctxP1.refreshPublicationCommentaries();
        const p1Contents = ctxP1.publicationCommentaries.map((c) => c.content);
        assert(p1Contents.length === 2 && p1Contents.includes('C1') && p1Contents.includes('C2'), '4. P1 shows exactly its own two comments');
        assert(!p1Contents.includes('C3'), '5. P1 never displays P2\'s own commentary');

        ctxP2.refreshPublicationCommentaries();
        const p2Contents = ctxP2.publicationCommentaries.map((c) => c.content);
        assert(p2Contents.length === 1 && p2Contents[0] === 'C3', '6. P2 shows exactly its own one comment, never P1\'s');

        console.log('✓ Section B: commentary stays isolated per-Publication, even read through the same command');
    }

    // ---------------------------------------------------------------
    // Section C — Same Document, different Publications: commentary
    // stays attached to the exact Publication, never the Document.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const document = makeDocument('Same Document', 'alice');
        const p1 = publisherProvider.publish(document, identityProvider);
        const p2 = publisherProvider.publish(document, identityProvider);
        assert(p1.id !== p2.id, '7. publishing the same document twice produces two genuinely different Publication ids');
        assert(p1.documentId === p2.documentId, '7b. both Publications trace back to the exact same underlying Document');

        const ctx = panelCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'attached to p1';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 1, '8. the comment is visible on the Publication it was created against');

        // Switching this panel to P2 (same underlying Document) must
        // never carry P1's commentary along with it. `ctx.publication`
        // is updated BEFORE the watcher fires — mirroring real Vue's own
        // reactivity ordering (a prop is already updated by the time its
        // watcher runs), which this panel's own refreshPublicationCommentaries()
        // relies on when called from inside the watcher itself.
        ctx.publication = p2;
        OwnPublicationPanel.watch.publication.call(ctx, p2, p1);
        assert(ctx.publicationCommentaries.length === 0, '9. P2 — the SAME Document, republished — starts with no commentary of its own');

        // And switching back to P1 shows its own commentary is still
        // exactly where it was, never moved or duplicated.
        ctx.publication = p1;
        OwnPublicationPanel.watch.publication.call(ctx, p1, p2);
        assert(ctx.publicationCommentaries.length === 1 && ctx.publicationCommentaries[0].content === 'attached to p1',
            '10. P1\'s own commentary survives untouched after the panel returns to it');

        console.log('✓ Section C: commentary is attached to the exact Publication, never the underlying Document');
    }

    // ---------------------------------------------------------------
    // Section D — Create through the authoritative command: submission
    // reaches AddPublicationCommentaryUseCase, never storage directly.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section D', 'alice'), identityProvider);

        let receivedInput = null;
        let calls = 0;
        const spyAddCommand = (input) => {
            calls += 1;
            receivedInput = input;
            return { commentary: { commentaryId: 'x', publicationId: input.publicationId, authorIdentityId: 'alice', content: input.content }, isNew: true };
        };

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand: spyAddCommand, viewerIdentityId: 'alice' });
        ctx.newCommentaryText = 'through the use case';
        ctx.submitPublicationCommentary();

        assert(calls === 1, '11. submission calls the injected command exactly once');
        assert(Object.keys(receivedInput).sort().join(',') === 'content,publicationId',
            '12. the command receives ONLY publicationId and content — never authorIdentityId or any other field');
        assert(receivedInput.publicationId === publication.id && receivedInput.content === 'through the use case',
            '13. the exact publicationId/content typed by the person reaches the command unmodified');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbidden = [
            "from '../../core/PublicationCommentary.js'",
            "from '../../storage/PublicationCommentaryStore.js'",
            "from '../../application/GetPublicationCommentariesUseCase.js'",
            "from '../../application/AddPublicationCommentaryUseCase.js'",
            'new PublicationCommentary(', 'PublicationCommentaryStore'
        ];
        for (const term of forbidden) {
            assert(!panelCode.includes(term), `14. OwnPublicationPanel.js never references '${term}' — it only calls the injected commands`);
        }
        assert((panelCode.match(/this\.addPublicationCommentaryCommand\(/g) || []).length === 1,
            '15. addPublicationCommentaryCommand is called from exactly one place');

        console.log('✓ Section D: creation reaches only the injected authoritative command, never storage or the domain class directly');
    }

    // ---------------------------------------------------------------
    // Section E — Authorship: the rendered new commentary carries the
    // AUTHENTICATED identity, never a UI-supplied one.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const aliceId = identityProvider.getSigningIdentity().id;
        const publication = publisherProvider.publish(makeDocument('Section E', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: aliceId });
        // Even if a caller tried to smuggle authorship through the
        // compose text itself, submitPublicationCommentary() only ever
        // reads newCommentaryText as `content` — there is no field this
        // panel could use to name a different author.
        ctx.newCommentaryText = 'authorIdentityId: mallory — this is just text';
        ctx.submitPublicationCommentary();

        assert(ctx.publicationCommentaries.length === 1, '16. the comment was created');
        assert(ctx.publicationCommentaries[0].authorIdentityId === aliceId,
            '17. the persisted author is the REAL authenticated identity, never a string embedded in the compose text');
        assert(ctx.publicationCommentaries[0].authorIdentityId === ctx.viewerIdentityId,
            '18. the rendered author matches the SAME viewerIdentityId this panel itself already read from the session');

        console.log('✓ Section E: authorship always resolves to the authenticated identity, never anything UI-supplied');
    }

    // ---------------------------------------------------------------
    // Section F — Unauthorized/unknown Publication: a failed creation
    // never persists anything.
    // ---------------------------------------------------------------
    {
        const { identityProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend();
        identityProvider.login('alice');
        const fakePublication = { id: 'no-such-publication', documentId: 'doc-nope' };

        const ctx = panelCtx({ publication: fakePublication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'should never land';
        ctx.submitPublicationCommentary();

        assert(ctx.publicationCommentaryError !== null, '19. a rejected creation is surfaced as an error');
        assert(ctx.publicationCommentaries.length === 0, '20. the displayed list stays empty — nothing was created');
        assert(commentaryStore.getForPublication('no-such-publication').length === 0,
            '21. nothing was ever persisted to the store for an unknown Publication');
        assert(ctx.newCommentaryText === 'should never land',
            '22. a rejected attempt never discards what the person typed');

        console.log('✓ Section F: an unauthorized/unknown Publication produces no persisted commentary');
    }

    // ---------------------------------------------------------------
    // Section G — Storage failure: read/write failures are surfaced
    // without corrupting existing UI state.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section G', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'already here';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 1, '23. setup: one real comment exists before the failure');

        // A failing READ never wipes the already-displayed list.
        const failingRead = () => { throw new Error('storage unavailable'); };
        const readCtx = panelCtx({ ...ctx, getPublicationCommentariesCommand: failingRead });
        readCtx.refreshPublicationCommentaries();
        assert(readCtx.publicationCommentaryError !== null, '24. a failed read reports an error');
        assert(readCtx.publicationCommentaries.length === 1 && readCtx.publicationCommentaries[0].content === 'already here',
            '25. a failed read leaves the previously-loaded commentary exactly as it was');

        // A failing WRITE never corrupts the list or clears the draft.
        const failingWrite = () => { throw new Error('write rejected'); };
        const writeCtx = panelCtx({ ...ctx, addPublicationCommentaryCommand: failingWrite });
        writeCtx.newCommentaryText = 'this attempt fails';
        writeCtx.submitPublicationCommentary();
        assert(writeCtx.publicationCommentaryError !== null, '26. a failed write reports an error');
        assert(writeCtx.publicationCommentaries.length === 1 && writeCtx.publicationCommentaries[0].content === 'already here',
            '27. a failed write leaves the previously-loaded commentary untouched — never corrupted or duplicated');
        assert(writeCtx.newCommentaryText === 'this attempt fails', '28. a failed write never discards the compose draft');
        assert(writeCtx.publicationCommentarySubmitting === false, '29. the submitting guard always clears, success or failure');

        console.log('✓ Section G: read and write failures are surfaced without corrupting existing UI state');
    }

    // ---------------------------------------------------------------
    // Section H — Empty state: a Publication with no commentary renders
    // an intentional empty state, never an error.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section H', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.refreshPublicationCommentaries();

        assert(Array.isArray(ctx.publicationCommentaries) && ctx.publicationCommentaries.length === 0,
            '30. a Publication with no commentary yet resolves to an empty array');
        assert(ctx.publicationCommentaryError === null, '31. an empty result is never reported as an error');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes('No commentary yet.'), '32. the template renders a dedicated empty-state message');

        console.log('✓ Section H: an empty Publication renders an intentional empty state, never an error');
    }

    // ---------------------------------------------------------------
    // Section I — Document switch / Publication switch: commentary from
    // P1 must not remain visible after switching to P2.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const p1 = publisherProvider.publish(makeDocument('P1 switch', 'alice'), identityProvider);
        const p2 = publisherProvider.publish(makeDocument('P2 switch', 'alice'), identityProvider);

        const ctx = panelCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'p1 only';
        ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 1, '33. setup: P1 has one comment');

        ctx.publication = p2;
        OwnPublicationPanel.watch.publication.call(ctx, p2, p1);
        assert(ctx.publicationCommentaries.length === 0, '34. switching to P2 never leaves P1\'s commentary on screen');
        assert(ctx.publicationCommentaryError === null, '35. a clean switch to an empty Publication reports no error');
        assert(ctx.newCommentaryText === '' && ctx.publicationCommentarySubmitting === false,
            '36. the compose draft and submit guard are also reset on a Publication switch');

        // Clearing the publication entirely (e.g. the active document
        // became unpublished) must behave identically — no stale P2
        // commentary either.
        ctx.publication = null;
        OwnPublicationPanel.watch.publication.call(ctx, null, p2);
        assert(ctx.publicationCommentaries.length === 0, '37. clearing the publication also clears any displayed commentary');

        console.log('✓ Section I: switching (or clearing) the Publication never leaves a prior Publication\'s commentary on screen');
    }

    // ---------------------------------------------------------------
    // Section J — Re-query on success, never manual append. One source
    // of truth for what exists.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, session } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section J', 'alice'), identityProvider);

        let readCalls = 0;
        const countingRead = (publicationId) => { readCalls += 1; return session.getPublicationCommentaries(publicationId); };
        const addCommand = (input) => session.addPublicationCommentary(input);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand: countingRead, addPublicationCommentaryCommand: addCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.refreshPublicationCommentaries();
        const readsBeforeSubmit = readCalls;

        ctx.newCommentaryText = 're-queried, not appended';
        ctx.submitPublicationCommentary();

        assert(readCalls === readsBeforeSubmit + 1, '38. a successful submission triggers exactly one fresh read — a re-query, not a manual append');
        assert(ctx.publicationCommentaries.length === 1 && ctx.publicationCommentaries[0].content === 're-queried, not appended',
            '39. the re-queried list reflects the just-created comment, from the store itself');

        console.log('✓ Section J: a successful submission re-queries through the read use case rather than manually appending');
    }

    // ---------------------------------------------------------------
    // Section K — Composition/wiring regression: ui/views/WorldView.js
    // and application/CreateWorldViewUseCase.js wire the two use cases
    // through WorldNavigationSession, never a second, parallel path.
    // ---------------------------------------------------------------
    {
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes(':getPublicationCommentariesCommand="getPublicationCommentariesCommand"'),
            '40. WorldView.js wires getPublicationCommentariesCommand onto OwnPublicationPanel');
        assert(viewCode.includes(':addPublicationCommentaryCommand="addPublicationCommentaryCommand"'),
            '41. WorldView.js wires addPublicationCommentaryCommand onto OwnPublicationPanel');
        assert(viewCode.includes(':viewerIdentityId="myIdentityId"'),
            '42. WorldView.js reuses the SAME already-computed myIdentityId — no second identity read for this feature');
        assert(viewCode.includes('session.getPublicationCommentaries(publicationId)'),
            '43. WorldView.js\'s own command forwards to WorldNavigationSession, never a use case directly');
        assert(viewCode.includes('session.addPublicationCommentary({ publicationId, content })'),
            '44. WorldView.js\'s own command forwards to WorldNavigationSession, never a use case directly');

        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        assert(sessionCode.includes('this._getPublicationCommentariesUseCase.execute({ publicationId })'),
            '45. WorldNavigationSession delegates reads to the unmodified use case');
        assert(sessionCode.includes('this._addPublicationCommentaryUseCase.execute({ publicationId, content })'),
            '46. WorldNavigationSession delegates writes to the unmodified use case, forwarding no authorIdentityId');

        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(compositionCode.includes('new PublicationCommentaryStore(storageProvider)'),
            '47. the composition root reuses the SAME storageProvider every other local store already uses');
        assert(compositionCode.includes('new CanCommentOnPublicationUseCase(discoveryProvider)'),
            '48. the composition root reuses the SAME discoveryProvider every other Publication-resolving use case already uses');

        console.log('✓ Section K: the UI reaches the application layer through one composed path — WorldNavigationSession — never a duplicate one');
    }

    console.log('\n✅ All Publication Commentary UI Integration tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
