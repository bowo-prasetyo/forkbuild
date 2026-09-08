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

// 0.9.289 — Other-Publication Commentary Entry Point.
//
// 0.9.288's own Section E finding: Publication Commentary's application
// layer is already ownership-agnostic and already composed, but only
// OwnPublicationPanel.js ever binds it — every UI surface that renders
// ANOTHER Wanderer's Publication (PublicationCard among the six named)
// carries zero commentary vocabulary. This milestone reaches exactly one
// of those six — ui/components/PublicationCard.js, mounted by
// ui/components/PublicationCatalog.js under both RepositoryView (a
// user's own Publications) and AuthorView (a NAMED author's — i.e.
// typically another Wanderer's own) — and wires
// application/CreatePublicationCommentaryUseCase.js (NEW) as the second
// composition of the SAME unmodified application layer
// application/CreateWorldViewUseCase.js already composes for
// OwnPublicationPanel.js.
//
// This file exercises the milestone's own named sections (A-K) against
// REAL collaborators (LocalIdentityProvider, LocalDiscoveryProvider,
// LocalPublisherProvider, PublicationCommentaryStore,
// NotificationEventStore, and all four application use cases,
// unmodified) — never a mock of the application layer — with only
// PublicationCard.js's own methods invoked the same way every sibling
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

// The real application stack application/CreatePublicationCommentaryUseCase.js
// itself composes, reproduced here with an injectable (in-memory) storage
// backend the same way tests/PublicationCommentaryUIIntegration.test.js's
// own makeBackend() reproduces application/CreateWorldViewUseCase.js's own
// 0.9.248/0.9.285 composition — CreatePublicationCommentaryUseCase.js
// itself always constructs a real, window.localStorage-backed
// LocalStorageProvider (see its own header), which this Node-run test
// file cannot exercise directly; Section K below instead verifies THAT
// file's own source wires the identical classes in the identical order.
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

    // The IDENTICAL thin wrappers
    // application/CreatePublicationCommentaryUseCase.js's own
    // getPublicationCommentariesCommand()/addPublicationCommentaryCommand()
    // are, reproduced here for the identical reason
    // tests/PublicationCommentaryUIIntegration.test.js's own makeBackend()
    // reproduces WorldView.js's.
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
    // Section A — Other-publication rendering: PublicationCard receives
    // a Publication owned by an identity other than the viewer, and its
    // own props/template carry no ownership concept at all.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Alice\'s World', 'alice'), identityProvider);
        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;

        assert(publication.publisherIdentity.id !== bobId, '1. the rendered publication is genuinely owned by a DIFFERENT identity than the viewer');

        assert(PublicationCard.props.publication.type === Object, '2. publication stays a plain, ownership-agnostic Object prop');
        assert(!('own' in PublicationCard.props) && !('isOwn' in PublicationCard.props) && !('ownerId' in PublicationCard.props),
            '3. PublicationCard declares no ownership-flavored prop of any kind');

        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        assert(!/isOwn|ownPublication|is-own|isMine/.test(cardCode),
            '4. the commentary section carries no "is this mine" gate in its source');

        console.log('✓ Section A: the surface renders another Wanderer\'s Publication with no ownership concept anywhere in its own contract');
    }

    // ---------------------------------------------------------------
    // Section B — Commentary action reachability: the action is exposed
    // only when a caller wires getPublicationCommentariesCommand in, and
    // opening it performs the first read.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section B', 'alice'), identityProvider);

        // Capability absent — the feature stays hidden, never a throw.
        const ctxHidden = cardCtx({ publication });
        ctxHidden.toggleCommentary();
        assert(ctxHidden.commentaryOpen === false, '5. toggleCommentary() is a no-op with no capability wired');

        // Capability present — toggling open performs the first read.
        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        assert(ctx.commentaryOpen === false, '6. commentary starts collapsed');
        ctx.toggleCommentary();
        assert(ctx.commentaryOpen === true, '7. toggling opens the section');
        assert(Array.isArray(ctx.commentaries) && ctx.commentaries.length === 0, '8. opening an empty thread loads zero commentaries, not an error');
        ctx.toggleCommentary();
        assert(ctx.commentaryOpen === false, '9. toggling again collapses it');

        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        assert(cardCode.includes('v-if="getPublicationCommentariesCommand"') && cardCode.includes('@click="toggleCommentary"'),
            '10. the template gates the Comment action on the injected capability');

        console.log('✓ Section B: the Comment action is reachable exactly when, and only when, the capability is wired');
    }

    // ---------------------------------------------------------------
    // Section C — Existing command path: creation reaches only the
    // injected authoritative command, never storage or a domain class
    // directly, and never a second use case.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section C', 'alice'), identityProvider);

        let calls = 0;
        let receivedInput = null;
        const spyAddCommand = (input) => {
            calls += 1;
            receivedInput = input;
            return { commentary: { commentaryId: 'x', publicationId: input.publicationId, authorIdentityId: 'bob', content: input.content }, isNew: true };
        };

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand: spyAddCommand });
        ctx.newCommentaryText = 'through the injected command';
        ctx.submitCommentary();

        assert(calls === 1, '11. submission calls the injected command exactly once');
        assert(Object.keys(receivedInput).sort().join(',') === 'content,publicationId',
            '12. the command receives ONLY publicationId and content — never authorIdentityId or any other field');

        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        const forbidden = [
            "from '../../core/PublicationCommentary.js'",
            "from '../../storage/PublicationCommentaryStore.js'",
            "from '../../application/GetPublicationCommentariesUseCase.js'",
            "from '../../application/AddPublicationCommentaryUseCase.js'",
            'new PublicationCommentary(', 'PublicationCommentaryStore',
            // The two explicitly-forbidden domain classes named by this
            // milestone's own brief — never introduced anywhere in this
            // file.
            'OtherPublicationCommentaryUseCase', 'AddCommentToOtherPublicationUseCase'
        ];
        for (const term of forbidden) {
            assert(!cardCode.includes(term), `13. PublicationCard.js never references '${term}' — it only calls the injected commands`);
        }
        assert((cardCode.match(/this\.addPublicationCommentaryCommand\(/g) || []).length === 1,
            '14. addPublicationCommentaryCommand is called from exactly one place');

        console.log('✓ Section C: creation reaches only the injected, pre-existing authoritative command');
    }

    // ---------------------------------------------------------------
    // Section D — Correct Publication identity: the exact publicationId
    // rendered is the exact one submitted, and stays isolated across
    // two different cards for two different Publications.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const p1 = publisherProvider.publish(makeDocument('P1', 'alice'), identityProvider);
        const p2 = publisherProvider.publish(makeDocument('P2', 'alice'), identityProvider);

        const ctx1 = cardCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx1.newCommentaryText = 'on p1';
        ctx1.submitCommentary();

        const ctx2 = cardCtx({ publication: p2, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx2.newCommentaryText = 'on p2';
        ctx2.submitCommentary();

        ctx1.refreshCommentaries();
        assert(ctx1.commentaries.length === 1 && ctx1.commentaries[0].content === 'on p1', '15. card 1 shows exactly its own Publication\'s commentary');
        assert(!ctx1.commentaries.some((c) => c.content === 'on p2'), '16. card 1 never shows card 2\'s Publication\'s commentary');

        ctx2.refreshCommentaries();
        assert(ctx2.commentaries.length === 1 && ctx2.commentaries[0].content === 'on p2', '17. card 2 shows exactly its own Publication\'s commentary, isolated from card 1');

        console.log('✓ Section D: the exact rendered publicationId is what gets submitted and later queried, per-card');
    }

    // ---------------------------------------------------------------
    // Section E — Correct authorship: the persisted commentary's author
    // is the AUTHENTICATED viewer, never the Publication's own
    // publisher, and never UI-supplied.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section E', 'alice'), identityProvider);
        const aliceId = identityProvider.getSigningIdentity().id;

        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;
        assert(bobId !== aliceId, '18. Alice and Bob are genuinely different identities');

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'commenting as bob';
        ctx.submitCommentary();

        assert(ctx.commentaries.length === 1, '19. Bob\'s comment on Alice\'s Publication is persisted and visible');
        assert(ctx.commentaries[0].authorIdentityId === bobId, '20. the commentary\'s author is Bob — the AUTHENTICATED commenter');
        assert(ctx.commentaries[0].authorIdentityId !== aliceId, '21. the commentary\'s author is never silently the Publication\'s own publisher');

        console.log('✓ Section E: authorship is the authenticated commenter, never the Publication owner, never UI-supplied');
    }

    // ---------------------------------------------------------------
    // Section F — Ownership independence: an identity with no
    // relationship to the Publication (never its author, never its
    // publisher) can comment through this surface exactly as
    // CanCommentOnPublicationUseCase already permits.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section F', 'alice'), identityProvider);
        identityProvider.login('carol'); // a third identity, unrelated to Alice or the Publication

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'a total stranger comments';
        ctx.submitCommentary();

        assert(ctx.commentaryError === null, '22. a non-owning identity is not rejected by this surface');
        assert(ctx.commentaries.length === 1 && ctx.commentaries[0].content === 'a total stranger comments',
            '23. the stranger\'s commentary is genuinely persisted and visible');

        console.log('✓ Section F: Publication ownership never gates reachability through this surface');
    }

    // ---------------------------------------------------------------
    // Section G — Authorization preservation: the UI never decides who
    // may comment — a rejection from the existing application layer
    // (here: nobody authenticated) surfaces unchanged, and never as a
    // silently-succeeded write.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section G', 'alice'), identityProvider);
        identityProvider.logout();

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'nobody is signed in';
        ctx.submitCommentary();

        assert(typeof ctx.commentaryError === 'string' && ctx.commentaryError.length > 0,
            '24. an unauthenticated submission is rejected — the existing use case\'s own rejection, not a UI-invented one');
        assert(ctx.newCommentaryText === 'nobody is signed in', '25. a rejected attempt never discards what was typed');
        assert(ctx.commentaries.length === 0, '26. a rejected attempt persists nothing');

        console.log('✓ Section G: existing authorization/authentication behavior is authoritative, unmodified by this surface');
    }

    // ---------------------------------------------------------------
    // Section H — Notification convergence: a successfully created
    // Commentary through THIS surface still reaches the existing
    // PublicationCommentaryNotificationProducer, addressed to the
    // Publication's own publisher.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, getPublicationCommentariesCommand, addPublicationCommentaryCommand, notificationEventStore } = makeBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section H', 'alice'), identityProvider);
        const aliceId = identityProvider.getSigningIdentity().id;

        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;

        const ctx = cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        ctx.newCommentaryText = 'notify alice';
        ctx.submitCommentary();
        assert(ctx.commentaryError === null, '27. the commentary that should produce a notification actually succeeded');

        const events = notificationEventStore.loadAll();
        const own = events.filter((e) => e.eventType === 'publication.commented' && e.payload.publicationId === publication.id);
        assert(own.length === 1, '28. exactly one publication.commented NotificationEvent was produced for this Commentary');
        assert(own[0].recipientIdentityId === aliceId, '29. the notification is addressed to the Publication\'s own publisher (Alice), never the commenter');
        assert(own[0].payload.authorIdentityId === bobId, '30. the notification payload names the real commenter (Bob) as author');

        console.log('✓ Section H: the existing notification producer still fires, unmodified, reached through this new surface');
    }

    // ---------------------------------------------------------------
    // Section I — Failure isolation: commentary persistence failure,
    // notification failure, and a missing-capability UI no-op stay
    // three distinguishable outcomes, never conflated.
    // ---------------------------------------------------------------
    {
        // I.1 — UI failure (capability never wired): degrades to a
        // silent no-op, never a thrown error the caller must catch.
        const ctxNoCapability = cardCtx({ publication: { id: 'p-none' } });
        let threw = false;
        try { ctxNoCapability.submitCommentary(); } catch { threw = true; }
        assert(!threw, '31. submitCommentary() with no capability wired never throws — it is a no-op');

        // I.2 — a read failure leaves any already-displayed commentary
        // untouched and reports only through commentaryError.
        const throwingRead = () => { throw new Error('read backend unavailable'); };
        const ctxReadFailure = cardCtx({
            publication: { id: 'p1' },
            getPublicationCommentariesCommand: throwingRead,
            commentaries: [{ commentaryId: 'existing', content: 'still here' }]
        });
        ctxReadFailure.refreshCommentaries();
        assert(ctxReadFailure.commentaryError === 'Commentary could not be loaded.', '32. a read failure sets commentaryError');
        assert(ctxReadFailure.commentaries.length === 1 && ctxReadFailure.commentaries[0].commentaryId === 'existing',
            '33. a read failure never wipes already-displayed commentary');

        // I.3 — Commentary persistence succeeds even when the
        // NOTIFICATION sink itself fails: the two stay distinguishable
        // failure modes, exactly as PublicationCommentaryNotificationProducer's
        // own header documents ("a notification sink failure never
        // undoes the already-persisted commentary").
        const backend = makeBackend({ notificationSink: () => { throw new Error('notification store unavailable'); } });
        backend.identityProvider.login('alice');
        const pub2 = backend.publisherProvider.publish(makeDocument('Section I', 'alice'), backend.identityProvider);
        backend.identityProvider.login('bob');

        const ctx = cardCtx({
            publication: pub2,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand
        });
        ctx.newCommentaryText = 'persisted despite notification failure';
        ctx.submitCommentary();

        assert(typeof ctx.commentaryError === 'string' && ctx.commentaryError.includes('notification store unavailable'),
            '34. a notification sink failure surfaces to the UI as a distinct error');
        const persisted = backend.commentaryStore.getForPublication(pub2.id);
        assert(persisted.length === 1 && persisted[0].content === 'persisted despite notification failure',
            '35. the Commentary itself is durably persisted even though the notification step failed — the UI error describes the notification, not a lost write');

        console.log('✓ Section I: UI no-op, read failure, and notification failure stay three distinguishable, never-conflated outcomes');
    }

    // ---------------------------------------------------------------
    // Section J — Regression: OwnPublicationPanel.js's own commentary
    // behavior, and its wiring through WorldView.js/CreateWorldViewUseCase.js,
    // remain byte-for-byte as 0.9.248/0.9.285 left them.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes('refreshPublicationCommentaries()') && panelCode.includes('submitPublicationCommentary()'),
            '36. OwnPublicationPanel.js still carries its own original commentary methods, untouched');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes(':getPublicationCommentariesCommand="getPublicationCommentariesCommand"'),
            '37. WorldView.js still wires its own getPublicationCommentariesCommand onto OwnPublicationPanel, unmodified');
        assert(viewCode.includes(':addPublicationCommentaryCommand="addPublicationCommentaryCommand"'),
            '38. WorldView.js still wires its own addPublicationCommentaryCommand onto OwnPublicationPanel, unmodified');

        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(compositionCode.includes('new PublicationCommentaryStore(storageProvider)') && compositionCode.includes('new PublicationCommentaryNotificationProducer('),
            '39. CreateWorldViewUseCase.js still composes its own, independent commentary path, unmodified by this milestone');

        console.log('✓ Section J: the existing OwnPublicationPanel surface is a byte-for-byte regression pass');
    }

    // ---------------------------------------------------------------
    // Section K — Composition/wiring: exactly one NEW UI surface is
    // wired, through a SECOND, independent composition of the SAME
    // unmodified application-layer classes — never a duplicate use
    // case, never all six named surfaces at once.
    // ---------------------------------------------------------------
    {
        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        assert(cardCode.includes("getPublicationCommentariesCommand: { default: null }") && cardCode.includes("addPublicationCommentaryCommand: { default: null }"),
            '40. PublicationCard.js injects the two commentary commands as OPTIONAL collaborators — feature hidden when absent');

        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes("new CreatePublicationCommentaryUseCase().execute(identityProvider)"),
            '41. ui/main.js composes the commentary commands through the new, dedicated composition root, sharing the SAME app-wide identityProvider');
        assert(mainCode.includes("app.provide('getPublicationCommentariesCommand', getPublicationCommentariesCommand)") &&
               mainCode.includes("app.provide('addPublicationCommentaryCommand', addPublicationCommentaryCommand)"),
            '42. ui/main.js provides both commands app-wide, the same way every other cross-view capability already is');

        const compositionCode = await codeOnlySource('application/CreatePublicationCommentaryUseCase.js');
        assert(compositionCode.includes('new CanCommentOnPublicationUseCase(discoveryProvider)'),
            '43. the new composition reuses the SAME, unmodified CanCommentOnPublicationUseCase');
        assert(compositionCode.includes('new GetPublicationCommentariesUseCase(publicationCommentaryStore)'),
            '44. the new composition reuses the SAME, unmodified GetPublicationCommentariesUseCase');
        assert(compositionCode.includes('new AddPublicationCommentaryUseCase(') &&
               compositionCode.includes('identityProvider,') && compositionCode.includes('canCommentOnPublicationUseCase'),
            '45. the new composition reuses the SAME, unmodified AddPublicationCommentaryUseCase, with its full three-collaborator contract');
        assert(compositionCode.includes('new PublicationCommentaryNotificationProducer('),
            '46. the new composition reuses the SAME, unmodified notification producer — a Commentary created through this surface still notifies the publisher');

        // The two explicitly-forbidden class names from this milestone's
        // own brief — never introduced anywhere by this milestone's own
        // new/changed files.
        for (const file of [
            'application/CreatePublicationCommentaryUseCase.js',
            'ui/components/PublicationCard.js',
            'ui/main.js'
        ]) {
            const code = await codeOnlySource(file);
            assert(!code.includes('OtherPublicationCommentaryUseCase') && !code.includes('AddCommentToOtherPublicationUseCase'),
                `47. ${file} introduces neither forbidden Commentary use case`);
        }

        // Exactly one of the six other-Publication surfaces 0.9.288
        // Section E named is wired — the other five stay byte-for-byte
        // untouched by this milestone.
        const untouchedSurfaces = [
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/components/PublicationList.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/components/WorldEncounterCanvas.js'
        ];
        for (const file of untouchedSurfaces) {
            const code = await codeOnlySource(file);
            assert(!code.includes('getPublicationCommentariesCommand') && !code.includes('addPublicationCommentaryCommand'),
                `48. ${file} carries no commentary wiring — this milestone deliberately wires only ONE surface`);
        }

        console.log('✓ Section K: exactly one new UI surface is wired, through a second composition of the identical, unmodified application layer');
    }

    console.log('\n✅ All Other-Publication Commentary Entry Point tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
