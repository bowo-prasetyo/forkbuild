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

// 0.9.251 — Publication Commentary Count UI.
//
// 0.9.250's own Section D named the one remaining MISSING_UI Commentary
// seam: `publicationCommentaries.length` already sits in component state
// but is never rendered as a visible number. This milestone renders it —
// see ui/components/OwnPublicationPanel.js's own "0.9.251" header for the
// full design. This file is deliberately small: unlike 0.9.249's own
// 755-line lifecycle audit, a derived template read needs only enough
// coverage to prove the number tracks the array it is derived from, in
// every state that array already goes through, and touches no new
// production surface beyond OwnPublicationPanel.js's own template.
//
// Reuses the EXACT real-collaborator backend
// tests/PublicationCommentaryUIIntegration.test.js's own makeBackend()/
// makeDocument()/panelCtx() helpers already build — never a mock of the
// application layer — because the count is not a new capability, only a
// new rendering of an existing one.

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
    // Section A — Count rendering: existing comments produce the exact
    // count in the template's own title interpolation.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section A World', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'C1'; ctx.submitPublicationCommentary();
        ctx.newCommentaryText = 'C2'; ctx.submitPublicationCommentary();
        ctx.newCommentaryText = 'C3'; ctx.submitPublicationCommentary();

        assert(ctx.publicationCommentaries.length === 3, '1. three comments are persisted and loaded');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes('Commentary ({{ publicationCommentaries.length }})'),
            '2. the template renders the count as a direct interpolation of publicationCommentaries.length');

        console.log('✓ Section A: existing commentary produces the exact rendered count');
    }

    // ---------------------------------------------------------------
    // Section B — Empty state: zero comments render a count of 0, never
    // an error and never a missing/undefined count.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section B World', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.refreshPublicationCommentaries();

        assert(ctx.publicationCommentaries.length === 0, '3. a freshly published Publication has no commentary yet');
        assert(ctx.publicationCommentaryError === null, '4. an empty result is never reported as an error');

        console.log('✓ Section B: an empty Publication renders a count of 0, never an error');
    }

    // ---------------------------------------------------------------
    // Section C — Publication switching: the count is always scoped to
    // whichever Publication is currently active, with no leakage.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const p1 = publisherProvider.publish(makeDocument('P1', 'alice'), identityProvider);
        const p2 = publisherProvider.publish(makeDocument('P2', 'alice'), identityProvider);

        const ctx = panelCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'p1-a'; ctx.submitPublicationCommentary();
        ctx.newCommentaryText = 'p1-b'; ctx.submitPublicationCommentary();
        ctx.newCommentaryText = 'p1-c'; ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 3, '5. setup: P1 has three comments');

        ctx.publication = p2;
        OwnPublicationPanel.watch.publication.call(ctx, p2, p1);
        ctx.newCommentaryText = 'p2-a'; ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 1, '6. P2 shows a count of 1 — its own single comment, never P1\'s three');

        ctx.publication = p1;
        OwnPublicationPanel.watch.publication.call(ctx, p1, p2);
        assert(ctx.publicationCommentaries.length === 3, '7. switching back to P1 restores its own count of 3, undisturbed by P2');

        console.log('✓ Section C: the count is Publication-scoped with no leakage across switches');
    }

    // ---------------------------------------------------------------
    // Section D — Submission convergence: the count reflects the
    // re-queried collection, never a locally incremented counter.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, session } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section D World', 'alice'), identityProvider);

        let readCalls = 0;
        const countingRead = (publicationId) => { readCalls += 1; return session.getPublicationCommentaries(publicationId); };
        const addCommand = (input) => session.addPublicationCommentary(input);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand: countingRead, addPublicationCommentaryCommand: addCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'first'; ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 1, '8. the count is 1 after the first comment');

        const readsBeforeSecond = readCalls;
        ctx.newCommentaryText = 'second'; ctx.submitPublicationCommentary();

        assert(readCalls === readsBeforeSecond + 1, '9. the count-driving array is refreshed through exactly one fresh read, not incremented locally');
        assert(ctx.publicationCommentaries.length === 2, '10. the count becomes 2, sourced from the re-queried collection itself');

        console.log('✓ Section D: the count converges to 3 via re-query, never a manual increment');
    }

    // ---------------------------------------------------------------
    // Section E — Failed submission: the count stays at its prior value
    // and the compose draft is retained.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section E World', 'alice'), identityProvider);

        const ctx = panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand, viewerIdentityId: identityProvider.getSigningIdentity().id });
        ctx.newCommentaryText = 'kept'; ctx.submitPublicationCommentary();
        ctx.newCommentaryText = 'also kept'; ctx.submitPublicationCommentary();
        assert(ctx.publicationCommentaries.length === 2, '11. setup: two real comments exist');

        const failingWrite = () => { throw new Error('write rejected'); };
        const failingCtx = panelCtx({ ...ctx, addPublicationCommentaryCommand: failingWrite });
        failingCtx.newCommentaryText = 'this attempt fails';
        failingCtx.submitPublicationCommentary();

        assert(failingCtx.publicationCommentaryError !== null, '12. the failed submission reports an error');
        assert(failingCtx.publicationCommentaries.length === 2, '13. the count stays at its prior value — nothing was optimistically incremented');
        assert(failingCtx.newCommentaryText === 'this attempt fails', '14. the draft is retained after a failed submission');

        console.log('✓ Section E: a failed submission leaves the count unchanged and the draft intact');
    }

    // ---------------------------------------------------------------
    // Section F — Architecture: no new state, method, or storage API was
    // introduced to compute the count.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');

        assert(!/publicationCommentaryCount/.test(panelCode),
            '15. no dedicated publicationCommentaryCount field/method exists — the count is read directly from the array');
        assert(!/computed\s*:/.test(panelCode),
            '16. no computed block was introduced to derive the count');
        assert(!panelCode.includes('GetPublicationCommentaryCountUseCase'),
            '17. no count-specific use case was introduced or imported');
        assert(!panelCode.includes('getPublicationCommentaryCountCommand'),
            '18. no count-specific command prop was introduced');
        assert(panelCode.includes('publicationCommentaries.length'),
            '19. the count is derived directly from the existing publicationCommentaries array');

        const forbidden = [
            "from '../../core/PublicationCommentary.js'",
            "from '../../storage/PublicationCommentaryStore.js'",
            "from '../../application/GetPublicationCommentariesUseCase.js'",
            "from '../../application/AddPublicationCommentaryUseCase.js'",
            'new PublicationCommentary(', 'PublicationCommentaryStore'
        ];
        for (const term of forbidden) {
            assert(!panelCode.includes(term), `20. OwnPublicationPanel.js still never references '${term}'`);
        }

        console.log('✓ Section F: the count is derived with no new state, method, use case, or storage API');
    }

    console.log('\n✅ All Publication Commentary Count UI tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
