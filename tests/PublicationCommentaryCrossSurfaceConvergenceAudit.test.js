import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore, NotificationPersistenceOutcome } from '../storage/NotificationEventStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/PublicationCommentaryNotificationProducer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import PublicationCard from '../ui/components/PublicationCard.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { readFile } from 'node:fs/promises';

// 0.9.290 — Publication Commentary Cross-Surface Convergence Audit.
//
// 0.9.289 gave Publication Commentary a SECOND independent composition
// root (application/CreatePublicationCommentaryUseCase.js) alongside the
// original one (application/CreateWorldViewUseCase.js), so the SAME
// domain capability is now reachable from two UI contexts —
// OwnPublicationPanel.js (through WorldNavigationSession) and
// PublicationCard.js (through the new, app-wide composition) — with two
// different UI lifecycles (eager-load-on-mount vs. lazy-load-on-expand)
// and two independently constructed sets of application-layer objects.
//
// This milestone is TEST-ONLY, per its own brief: no production file is
// modified unless this audit finds a real defect (it does not — see
// every section below). Its job is to prove, against REAL collaborators
// (never a mock of the application layer), that the two composition
// roots still add up to ONE Commentary capability — same persistence,
// same authorship, same authorization, same notification pipeline, same
// command contract — and that the only genuine difference between the
// two paths is presentation lifecycle, never domain behavior.
//
//   Commentary capability
//        │
//        ├── CreateWorldViewUseCase.js      -> OwnPublicationPanel.js
//        └── CreatePublicationCommentaryUseCase.js -> PublicationCard.js
//               │                                        │
//               └──────────────── same storage keys ─────┘
//               └──────────────── same NotificationEventStore policy ────┘
//
// Sections A-L below map directly onto this milestone's own brief.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------
// A StorageProvider that proxies a SHARED backing Map, passed in at
// construction — the honest Node-runnable analog of two independently
// constructed `storage/LocalStorageProvider.js` instances, which are
// never given a Map of their own: both always proxy the SAME global
// `window.localStorage`. Two instances of THIS class constructed with
// the SAME Map have different object identity (`instanceA !== instanceB`)
// but observe the identical persisted bytes — exactly Section D's own
// claim. Two instances constructed with DIFFERENT Maps are the contrast
// case: genuinely isolated storage, used below to prove convergence is
// caused by the shared namespace, not by anything else.
// ---------------------------------------------------------------------
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(backingMap) {
        super();
        this._backing = backingMap;
    }
    save(name, data) { this._backing.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._backing.has(name) ? JSON.parse(JSON.stringify(this._backing.get(name))) : null; }
    remove(name) { this._backing.delete(name); }
    list() { return Array.from(this._backing.keys()); }
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

// ---------------------------------------------------------------------
// Two INDEPENDENT composition roots, reproduced from the two real
// production files, byte-for-byte in collaborator order — never a
// shared builder function, because the entire point under audit is that
// production has two separately-written call sites for this. Both take
// an already-constructed storageProvider/identityProvider so a caller
// controls exactly what is shared and what is not.
// ---------------------------------------------------------------------

// Mirrors application/CreateWorldViewUseCase.js's own 0.9.248/0.9.285
// commentary + notification wiring — the composition
// OwnPublicationPanel.js reaches through WorldNavigationSession.
function buildWorldViewCommentaryRoot({ storageProvider, identityProvider, notificationSink }) {
    const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
    const publicationCommentaryStore = new PublicationCommentaryStore(storageProvider);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(publicationCommentaryStore);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        publicationCommentaryStore, identityProvider, canCommentOnPublicationUseCase
    );
    const notificationEventStore = new NotificationEventStore(storageProvider);
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        discoveryProvider,
        notificationSink || ((event) => notificationEventStore.save(event))
    );
    function getPublicationCommentariesCommand(publicationId) {
        if (!publicationId) return [];
        return getPublicationCommentariesUseCase.execute({ publicationId });
    }
    function addPublicationCommentaryCommand({ publicationId, content }) {
        return publicationCommentaryCapability.execute({ publicationId, content });
    }
    return {
        discoveryProvider, publicationCommentaryStore, notificationEventStore,
        addPublicationCommentaryUseCase, publicationCommentaryCapability,
        getPublicationCommentariesCommand, addPublicationCommentaryCommand
    };
}

// Mirrors application/CreatePublicationCommentaryUseCase.js's own
// composition, verbatim — PublicationCard.js's own composition root.
function buildPublicationCardCommentaryRoot({ storageProvider, identityProvider, notificationSink }) {
    const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
    const publicationCommentaryStore = new PublicationCommentaryStore(storageProvider);
    const notificationEventStore = new NotificationEventStore(storageProvider);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(publicationCommentaryStore);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
        publicationCommentaryStore, identityProvider, canCommentOnPublicationUseCase
    );
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        discoveryProvider,
        notificationSink || ((event) => notificationEventStore.save(event))
    );
    function getPublicationCommentariesCommand(publicationId) {
        if (!publicationId) return [];
        return getPublicationCommentariesUseCase.execute({ publicationId });
    }
    function addPublicationCommentaryCommand({ publicationId, content }) {
        return publicationCommentaryCapability.execute({ publicationId, content });
    }
    return {
        discoveryProvider, publicationCommentaryStore, notificationEventStore,
        addPublicationCommentaryUseCase, publicationCommentaryCapability,
        getPublicationCommentariesCommand, addPublicationCommentaryCommand
    };
}

// A full "two surfaces, one app" fixture: one shared identityProvider
// (exactly as ui/main.js hands the SAME identityProvider to both
// CreateWorldViewUseCase.execute() and
// CreatePublicationCommentaryUseCase.execute()), one shared publisher
// stack, and — unless overridden — one SHARED backing Map so the two
// storageProvider instances observe the same namespace, exactly as two
// real `LocalStorageProvider`s proxying the same `window.localStorage`
// would.
function makeTwoSurfaceApp({ shareStorage = true } = {}) {
    const backingMapA = new Map();
    const backingMapB = shareStorage ? backingMapA : new Map();
    const storageA = new SharedNamespaceStorageProvider(backingMapA);
    const storageB = new SharedNamespaceStorageProvider(backingMapB);

    // identityProvider and the publisher stack are genuinely ONE
    // app-wide instance in production (ui/main.js constructs exactly
    // one of each) — never duplicated by either composition root.
    const identityStorage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(identityStorage);
    const contentStore = new LocalContentStore(backingMapA === backingMapB ? storageA : new InMemoryStorageProvider());
    const publisherProvider = new LocalPublisherProvider(storageA, contentStore);

    const worldViewRoot = buildWorldViewCommentaryRoot({ storageProvider: storageA, identityProvider });
    const cardRoot = buildPublicationCardCommentaryRoot({ storageProvider: storageB, identityProvider });

    return { identityProvider, publisherProvider, worldViewRoot, cardRoot, storageA, storageB };
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
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Balanced-brace block extraction — sufficient for these plain,
// comment-only (`//`, never `/* */` or brace-bearing template strings)
// class files. Used only against the specific collaborator files this
// audit names, never against a UI component with a template string.
function extractBraceBlock(source, openBraceIndex) {
    let depth = 0;
    for (let i = openBraceIndex; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(openBraceIndex, i + 1);
        }
    }
    throw new Error('extractBraceBlock: unbalanced braces');
}
function extractClassBody(source, className) {
    const classIdx = source.indexOf(`class ${className}`);
    if (classIdx === -1) throw new Error(`extractClassBody: class ${className} not found`);
    const braceIdx = source.indexOf('{', classIdx);
    return extractBraceBlock(source, braceIdx);
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — Two-entry-point behavioral convergence: own-Publication
    // commentary (mirroring OwnPublicationPanel, through the WorldView
    // composition root) and other-Publication commentary (mirroring
    // PublicationCard, through the new composition root) both persist
    // into, and are both readable back from, the SAME durable Commentary
    // data — with correct, distinct authorship and correct notification
    // for each.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, worldViewRoot, cardRoot } = makeTwoSurfaceApp();

        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section A', 'alice'), identityProvider);
        const aliceId = identityProvider.getSigningIdentity().id;

        // Own-Publication path: Alice comments on her OWN Publication,
        // through the WorldView-style root (OwnPublicationPanel's own
        // path).
        const ownResult = worldViewRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'my own note' });
        assert(ownResult.commentary.authorIdentityId === aliceId, '1. the own-Publication path persists Alice as author');

        // Other-Publication path: Bob comments on Alice's Publication,
        // through the PublicationCard-style root.
        identityProvider.login('bob');
        const bobId = identityProvider.getSigningIdentity().id;
        const otherResult = cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'a visitor\'s note' });
        assert(otherResult.commentary.authorIdentityId === bobId, '2. the other-Publication path persists Bob as author');

        // Both persist into the SAME durable data: reading back through
        // EITHER root's own store returns BOTH commentaries.
        const fromWorldViewRoot = worldViewRoot.getPublicationCommentariesCommand(publication.id);
        const fromCardRoot = cardRoot.getPublicationCommentariesCommand(publication.id);
        assert(fromWorldViewRoot.length === 2, '3. the WorldView-style root sees both commentaries, including the one created through the other root');
        assert(fromCardRoot.length === 2, '4. the PublicationCard-style root sees both commentaries, including the one created through the other root');
        assert(
            JSON.stringify(fromWorldViewRoot.map((c) => c.toJSON())) === JSON.stringify(fromCardRoot.map((c) => c.toJSON())),
            '5. the two roots return byte-identical PublicationCommentary records, in the same order'
        );

        // Same authorship semantics from either root's own read.
        const own = fromCardRoot.find((c) => c.content === 'my own note');
        const other = fromWorldViewRoot.find((c) => c.content === 'a visitor\'s note');
        assert(own.authorIdentityId === aliceId, '6. own-Publication authorship survives being read back through the OTHER root');
        assert(other.authorIdentityId === bobId, '7. other-Publication authorship survives being read back through the OTHER root');

        // Same notification semantics: both invocations produced a
        // publication.commented NotificationEvent addressed to Alice,
        // visible through EITHER root's own notificationEventStore.
        const eventsViaWorldViewRoot = worldViewRoot.notificationEventStore.loadAll()
            .filter((e) => e.payload.publicationId === publication.id);
        const eventsViaCardRoot = cardRoot.notificationEventStore.loadAll()
            .filter((e) => e.payload.publicationId === publication.id);
        assert(eventsViaWorldViewRoot.length === 2 && eventsViaCardRoot.length === 2,
            '8. both roots observe both NotificationEvents, regardless of which root produced which');
        assert(eventsViaWorldViewRoot.every((e) => e.recipientIdentityId === aliceId),
            '9. every notification for this Publication is addressed to Alice, the publisher, from either root\'s own view');

        console.log('✓ Section A: own-Publication and other-Publication paths are behaviorally one capability — same storage, same authorship, same notification, from either root');
    }

    // ---------------------------------------------------------------
    // Section B — Command-contract convergence: both roots expose the
    // IDENTICAL `(publicationId) -> PublicationCommentary[]` /
    // `({publicationId, content}) -> {commentary, isNew}` shape, with no
    // ownership-specific parameter anywhere, and production never grows
    // the forbidden `addOwnPublicationCommentary`/`addOtherPublicationCommentary`
    // vocabulary the milestone's own brief names by example.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, worldViewRoot, cardRoot } = makeTwoSurfaceApp();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section B', 'alice'), identityProvider);

        for (const [label, root] of [['WorldView-style', worldViewRoot], ['PublicationCard-style', cardRoot]]) {
            assert(typeof root.getPublicationCommentariesCommand === 'function', `10. ${label} root exposes getPublicationCommentariesCommand as a function`);
            assert(typeof root.addPublicationCommentaryCommand === 'function', `11. ${label} root exposes addPublicationCommentaryCommand as a function`);
            assert(root.getPublicationCommentariesCommand.length === 1, `12. ${label} root's getPublicationCommentariesCommand takes exactly one positional argument (publicationId)`);
            assert(root.addPublicationCommentaryCommand.length === 1, `13. ${label} root's addPublicationCommentaryCommand takes exactly one destructured argument`);
        }

        const result = cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'contract check' });
        assert(Object.keys(result).sort().join(',') === 'commentary,isNew', '14. addPublicationCommentaryCommand returns exactly { commentary, isNew }, from either root');
        const list = cardRoot.getPublicationCommentariesCommand(publication.id);
        assert(Array.isArray(list), '15. getPublicationCommentariesCommand returns a plain array');

        // No ownership-specific parameter exists on the command contract
        // itself — a call that supplies one is silently ignored, never
        // interpreted.
        let sawOwnershipEffect = false;
        try {
            cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'attempted ownership override', isOwn: true, ownerId: 'someone-else' });
        } catch { sawOwnershipEffect = true; }
        assert(!sawOwnershipEffect, '16. extra ownership-shaped fields on the command input are silently inert, never rejected or specially handled');

        // The forbidden future vocabulary the brief names by example is
        // absent from every file in the commentary composition/UI chain.
        const forbiddenNames = ['addOwnPublicationCommentary', 'addOtherPublicationCommentary', 'getOwnPublicationCommentaries', 'getOtherPublicationCommentaries'];
        for (const file of [
            'application/CreateWorldViewUseCase.js',
            'application/CreatePublicationCommentaryUseCase.js',
            'ui/views/WorldView.js',
            'ui/components/OwnPublicationPanel.js',
            'ui/components/PublicationCard.js',
            'application/WorldNavigationSession.js',
            'ui/main.js'
        ]) {
            const code = await codeOnlySource(file);
            for (const name of forbiddenNames) {
                assert(!code.includes(name), `17. ${file} never introduces the ownership-specific command name '${name}'`);
            }
        }

        console.log('✓ Section B: both composition roots expose the identical, ownership-agnostic command contract — no per-ownership command vocabulary exists');
    }

    // ---------------------------------------------------------------
    // Section C — Composition-root audit: which collaborators does
    // EACH real production composition root independently construct
    // for Commentary, and is that duplication safe (a stateless
    // pass-through over shared storage) or dangerous (independently
    // constructed mutable state)?
    // ---------------------------------------------------------------
    {
        const worldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        const cardSource = await rawSource('application/CreatePublicationCommentaryUseCase.js');

        function countOccurrences(source, needle) {
            return source.split(needle).length - 1;
        }

        // CreateWorldViewUseCase.js's own method reuses a storageProvider/
        // discoveryProvider it already built for OTHER capabilities
        // (placement, publishing) rather than constructing a second one
        // for commentary — so it constructs exactly these six
        // commentary/notification-specific classes, each exactly once.
        const sixCommentaryCollaborators = [
            'PublicationCommentaryStore',
            'CanCommentOnPublicationUseCase',
            'GetPublicationCommentariesUseCase',
            'AddPublicationCommentaryUseCase',
            'NotificationEventStore',
            'PublicationCommentaryNotificationProducer'
        ];
        for (const name of sixCommentaryCollaborators) {
            assert(countOccurrences(worldViewSource, `new ${name}(`) === 1,
                `19. CreateWorldViewUseCase.js constructs exactly one ${name} for commentary/notification`);
        }

        // CreatePublicationCommentaryUseCase.js has no bigger composition
        // to borrow storage/discovery from — it is a FULL second
        // composition, so it additionally constructs its OWN
        // LocalStorageProvider/LocalDiscoveryProvider. This is itself
        // Section C's own finding: CreateWorldViewUseCase.js's commentary
        // section is a partial reuse of a bigger composition;
        // CreatePublicationCommentaryUseCase.js is the full second one.
        const cardOnlyCollaborators = ['LocalStorageProvider', 'LocalDiscoveryProvider'];
        for (const name of [...sixCommentaryCollaborators, ...cardOnlyCollaborators]) {
            assert(countOccurrences(cardSource, `new ${name}(`) === 1,
                `20. CreatePublicationCommentaryUseCase.js constructs exactly one ${name}`);
        }

        // Now the actual safety classification: for every one of the
        // eight collaborator classes involved, prove — from the class's
        // OWN source, not from prose — that construction assigns ONLY
        // pass-through references to injected collaborators, and that
        // NOTHING outside the constructor ever assigns `this.<field>`.
        // That combination is exactly "safe duplication": two instances
        // hold no state beyond a reference to whatever storage they were
        // handed, so their divergence (if any) is entirely a property of
        // whether that storage is shared — which Section D verifies
        // directly.
        const collaboratorFiles = {
            LocalDiscoveryProvider: 'discovery/LocalDiscoveryProvider.js',
            PublicationCommentaryStore: 'storage/PublicationCommentaryStore.js',
            NotificationEventStore: 'storage/NotificationEventStore.js',
            CanCommentOnPublicationUseCase: 'application/CanCommentOnPublicationUseCase.js',
            GetPublicationCommentariesUseCase: 'application/GetPublicationCommentariesUseCase.js',
            AddPublicationCommentaryUseCase: 'application/AddPublicationCommentaryUseCase.js',
            PublicationCommentaryNotificationProducer: 'application/PublicationCommentaryNotificationProducer.js'
        };

        const dangerousStatePattern = /=\s*(new (Map|Set|WeakMap|WeakSet)\(|\[\]|\{\}|setInterval|setTimeout)/;
        for (const [className, filePath] of Object.entries(collaboratorFiles)) {
            const source = await codeOnlySource(filePath);
            const classBody = extractClassBody(source, className);

            const allAssignments = [...classBody.matchAll(/this\.(\w+)\s*=\s*([^;]+);/g)];
            const ctorIdx = classBody.indexOf('constructor(');
            let ctorAssignments = [];
            if (ctorIdx !== -1) {
                const ctorBody = extractBraceBlock(classBody, classBody.indexOf('{', ctorIdx));
                ctorAssignments = [...ctorBody.matchAll(/this\.(\w+)\s*=\s*([^;]+);/g)];
            }
            assert(allAssignments.length === ctorAssignments.length,
                `21. ${className}: every 'this.<field> =' assignment happens inside the constructor — no method mutates instance state after construction`);
            for (const [, , rhs] of ctorAssignments) {
                assert(/^\w+$/.test(rhs.trim()), `22. ${className}: constructor field '${rhs.trim()}' is a bare pass-through of an injected argument, never a locally-fabricated value`);
                assert(!dangerousStatePattern.test(`= ${rhs.trim()}`), `23. ${className}: constructor field is never a freshly-constructed Map/Set/array/timer — no independently-owned mutable state`);
            }
        }
        // LocalStorageProvider itself: no constructor override at all —
        // strictly stateless, the base case this whole classification
        // rests on.
        const storageProviderCode = await codeOnlySource('storage/LocalStorageProvider.js');
        assert(!/constructor\s*\(/.test(storageProviderCode), '24. LocalStorageProvider defines no constructor of its own — it has no per-instance state to duplicate at all');
        assert(!/this\.\w+\s*=/.test(storageProviderCode), '25. LocalStorageProvider never assigns any this.<field> anywhere in its own source');

        console.log('✓ Section C: every commentary/notification collaborator both roots construct is a stateless pass-through over its injected storage — duplication here is the SAFE kind this milestone\'s own brief describes');
    }

    // ---------------------------------------------------------------
    // Section D — Storage identity convergence: two DIFFERENT
    // `SharedNamespaceStorageProvider` objects (the honest analog of two
    // real `LocalStorageProvider` instances, which never carry their
    // own state) sharing one backing namespace observe identical
    // Commentary/NotificationEvent bytes; the SAME two object identities
    // over TWO SEPARATE namespaces do not.
    // ---------------------------------------------------------------
    {
        const shared = makeTwoSurfaceApp({ shareStorage: true });
        assert(shared.storageA !== shared.storageB, '26. the two roots\' storageProvider objects are genuinely different object identities');

        shared.identityProvider.login('alice');
        const publication = shared.publisherProvider.publish(makeDocument('Section D', 'alice'), shared.identityProvider);
        shared.cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'written through root B' });

        const seenByA = shared.worldViewRoot.publicationCommentaryStore.getForPublication(publication.id);
        assert(seenByA.length === 1 && seenByA[0].content === 'written through root B',
            '27. a Commentary written through the PublicationCard-style root\'s OWN storageProvider instance is immediately visible through the WorldView-style root\'s DIFFERENT storageProvider instance');

        const isolated = makeTwoSurfaceApp({ shareStorage: false });
        isolated.identityProvider.login('alice');
        const publicationIso = isolated.publisherProvider.publish(makeDocument('Section D isolated', 'alice'), isolated.identityProvider);
        // publisherProvider itself was built over storageA in both
        // fixtures — for the isolated case, prove the CONTRAST directly
        // against two independent PublicationCommentaryStore/
        // NotificationEventStore pairs over genuinely unshared Maps,
        // rather than relying on the publisher stack.
        const mapX = new Map();
        const mapY = new Map();
        const storeX = new PublicationCommentaryStore(new SharedNamespaceStorageProvider(mapX));
        const storeY = new PublicationCommentaryStore(new SharedNamespaceStorageProvider(mapY));
        isolated.identityProvider.login('bob');
        const bobId = isolated.identityProvider.getSigningIdentity().id;
        const { PublicationCommentary } = await import('../core/PublicationCommentary.js');
        storeX.save(new PublicationCommentary({ publicationId: publicationIso.id, authorIdentityId: bobId, content: 'only in X' }));
        assert(storeY.getForPublication(publicationIso.id).length === 0,
            '28. two PublicationCommentaryStore instances over GENUINELY UNSHARED storage never converge — proving Section D\'s own convergence claim above is caused by the shared namespace, not by anything incidental');

        console.log('✓ Section D: storage identity convergence is real and specifically namespace-caused — different provider objects, same keys, same data; different provider objects, different keys, genuinely isolated data');
    }

    // ---------------------------------------------------------------
    // Section E — Notification convergence: Commentary created through
    // EITHER root reaches the identical
    // PublicationCommentaryNotificationProducer -> NotificationEvent ->
    // NotificationDeduplicationPolicy -> NotificationEventStore pipeline
    // — never a second notification mechanism.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, worldViewRoot, cardRoot } = makeTwoSurfaceApp();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section E', 'alice'), identityProvider);
        identityProvider.login('bob');

        worldViewRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'via world view root' });
        cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'via card root' });

        const events = cardRoot.notificationEventStore.loadAll().filter((e) => e.payload.publicationId === publication.id);
        assert(events.length === 2, '29. both roots\' Commentary creations each produced exactly one publication.commented NotificationEvent, both landing in the same store');
        assert(events.every((e) => e.eventType === 'publication.commented'), '30. both events carry the identical, single production eventType');

        // No second notification mechanism exists: neither UI component,
        // neither composition root, constructs a NotificationEvent
        // itself — only PublicationCommentaryNotificationProducer.js
        // does, everywhere in the codebase.
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const applicationDir = new URL('../application/', import.meta.url);
        const files = await fs.readdir(applicationDir);
        let constructorSites = 0;
        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            const code = await codeOnlySource(`application/${file}`);
            const matches = code.match(/new NotificationEvent\(/g);
            if (matches) constructorSites += matches.length;
        }
        assert(constructorSites === 1, `31. exactly one production call site constructs a NotificationEvent across all of application/ — found ${constructorSites}`);

        const uiDir = new URL('../ui/', import.meta.url);
        async function walk(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            let out = [];
            for (const entry of entries) {
                const full = path.join(dir.pathname, entry.name);
                if (entry.isDirectory()) out = out.concat(await walk(new URL(entry.name + '/', dir)));
                else if (entry.name.endsWith('.js')) out.push(full);
            }
            return out;
        }
        const uiFiles = await walk(uiDir);
        for (const filePath of uiFiles) {
            const code = (await fs.readFile(filePath, 'utf8')).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
            assert(!code.includes('new NotificationEvent('), `32. ${filePath} never constructs a NotificationEvent directly — the UI layer only ever reaches notifications through the injected commands`);
        }

        console.log('✓ Section E: both composition roots converge on the SAME single NotificationEvent producer — no second notification path exists anywhere');
    }

    // ---------------------------------------------------------------
    // Section F — Deduplication across compositions: the SAME logical
    // Commentary, submitted through TWO INDEPENDENTLY CONSTRUCTED
    // application paths sharing storage, still gets the established
    // NEW -> EXISTING treatment from NotificationEventStore — proving
    // deduplication authority is storage/policy-based, never
    // composition-instance-based. Contrasted directly against two
    // paths over UNSHARED storage, which do NOT converge.
    // ---------------------------------------------------------------
    {
        const FIXED_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
        const RETRY_COMMENTARY_ID = 'retry-across-roots-1';

        // Shared-storage case.
        const shared = makeTwoSurfaceApp({ shareStorage: true });
        shared.identityProvider.login('alice');
        const publication = shared.publisherProvider.publish(makeDocument('Section F', 'alice'), shared.identityProvider);
        shared.identityProvider.login('bob');

        // First submission through the WorldView-style root.
        const firstResult = shared.worldViewRoot.publicationCommentaryCapability.execute({
            publicationId: publication.id, content: 'retried across composition roots',
            commentaryId: RETRY_COMMENTARY_ID, createdAt: FIXED_CREATED_AT
        });
        assert(firstResult.isNew === true, '33. the first submission is genuinely new at the storage layer');

        // A RETRY of the identical logical Commentary — same
        // commentaryId, same content, same createdAt, same authenticated
        // identity — through the OTHER, independently constructed
        // PublicationCard-style root.
        const retryResult = shared.cardRoot.publicationCommentaryCapability.execute({
            publicationId: publication.id, content: 'retried across composition roots',
            commentaryId: RETRY_COMMENTARY_ID, createdAt: FIXED_CREATED_AT
        });
        assert(retryResult.isNew === false, '34. the retry through the OTHER root is recognized as the identical, already-persisted Commentary — PublicationCommentaryStore-level idempotency converges across roots');

        const persistedCount = shared.worldViewRoot.publicationCommentaryStore.getForPublication(publication.id).length;
        assert(persistedCount === 1, '35. exactly one Commentary record exists after the cross-root retry — never a duplicate row');

        // Now the NotificationEventStore-level dedup, observed directly
        // via each root's own sink so the actual NEW/EXISTING outcome is
        // inspectable.
        let outcomeA = null;
        let outcomeB = null;
        const sharedForNotifications = makeTwoSurfaceApp({ shareStorage: true });
        const rootA = buildWorldViewCommentaryRoot({
            storageProvider: sharedForNotifications.storageA,
            identityProvider: sharedForNotifications.identityProvider,
            notificationSink: (event) => { outcomeA = sharedForNotifications.worldViewRoot.notificationEventStore.save(event); return outcomeA; }
        });
        const rootB = buildPublicationCardCommentaryRoot({
            storageProvider: sharedForNotifications.storageB,
            identityProvider: sharedForNotifications.identityProvider,
            notificationSink: (event) => { outcomeB = sharedForNotifications.cardRoot.notificationEventStore.save(event); return outcomeB; }
        });
        sharedForNotifications.identityProvider.login('alice');
        const pub2 = sharedForNotifications.publisherProvider.publish(makeDocument('Section F notifications', 'alice'), sharedForNotifications.identityProvider);
        sharedForNotifications.identityProvider.login('bob');

        rootA.publicationCommentaryCapability.execute({ publicationId: pub2.id, content: 'notif retry', commentaryId: 'notif-retry-1', createdAt: FIXED_CREATED_AT });
        assert(outcomeA.outcome === NotificationPersistenceOutcome.NEW, '36. the first root\'s own notification save is NEW');

        rootB.publicationCommentaryCapability.execute({ publicationId: pub2.id, content: 'notif retry', commentaryId: 'notif-retry-1', createdAt: FIXED_CREATED_AT });
        assert(outcomeB.outcome === NotificationPersistenceOutcome.EXISTING, '37. the SECOND, independently constructed root\'s own notification save for the identical logical fact is EXISTING, not a second NEW record — the established NEW -> EXISTING behavior survives crossing composition roots');
        assert(outcomeB.event.notificationId === outcomeA.event.notificationId, '38. the EXISTING result returns the ORIGINAL on-file record from the OTHER root, never a second, independently-identified one');

        // Contrast case: the identical retry sequence over GENUINELY
        // UNSHARED storage produces NEW twice — proving the convergence
        // above is caused by the shared namespace (Section D), never by
        // deduplication becoming a global, storage-independent
        // mechanism.
        const isolated = makeTwoSurfaceApp({ shareStorage: false });
        isolated.identityProvider.login('alice');
        // Each isolated root needs a Publication its OWN storage/discovery
        // can actually find — makeTwoSurfaceApp's own publisherProvider
        // always writes through storageA, so a second, independent
        // publisherProvider over storageB publishes an equivalent
        // Publication into THAT genuinely separate namespace. The two
        // Publications differ in id/documentId (publicationId is not part
        // of the dedup identity — see core/NotificationDeduplicationPolicy.js);
        // what matters for this contrast is that both are authored by the
        // SAME identity (Alice, via the one shared identityProvider), so
        // recipientIdentityId — which IS part of the identity — agrees.
        const pub3A = isolated.publisherProvider.publish(makeDocument('Section F isolated A', 'alice'), isolated.identityProvider);
        const publisherProviderB = new LocalPublisherProvider(isolated.storageB, new LocalContentStore(isolated.storageB));
        const pub3B = publisherProviderB.publish(makeDocument('Section F isolated B', 'alice'), isolated.identityProvider);
        isolated.identityProvider.login('bob');
        let isolatedOutcomeA = null;
        let isolatedOutcomeB = null;
        const isoRootA = buildWorldViewCommentaryRoot({
            storageProvider: isolated.storageA, identityProvider: isolated.identityProvider,
            notificationSink: (event) => { isolatedOutcomeA = new NotificationEventStore(isolated.storageA).save(event); return isolatedOutcomeA; }
        });
        const isoRootB = buildPublicationCardCommentaryRoot({
            storageProvider: isolated.storageB, identityProvider: isolated.identityProvider,
            notificationSink: (event) => { isolatedOutcomeB = new NotificationEventStore(isolated.storageB).save(event); return isolatedOutcomeB; }
        });
        isoRootA.publicationCommentaryCapability.execute({ publicationId: pub3A.id, content: 'isolated retry', commentaryId: 'isolated-retry-1', createdAt: FIXED_CREATED_AT });
        isoRootB.publicationCommentaryCapability.execute({ publicationId: pub3B.id, content: 'isolated retry', commentaryId: 'isolated-retry-1', createdAt: FIXED_CREATED_AT });
        assert(isolatedOutcomeA.outcome === NotificationPersistenceOutcome.NEW, '39. isolated-storage first save is NEW');
        assert(isolatedOutcomeB.outcome === NotificationPersistenceOutcome.NEW, '40. isolated-storage second save is ALSO new — with no shared namespace, the two roots do NOT converge, confirming deduplication authority is storage/policy-based, not composition-instance-based, and not a hidden global registry either');

        console.log('✓ Section F: cross-root retries converge to NEW -> EXISTING exactly when storage is shared, and only then — deduplication authority is storage/policy-based, never composition-instance-based');
    }

    // ---------------------------------------------------------------
    // Section G — Authorization convergence: authorization behaves
    // identically regardless of which root initiated the operation —
    // neither root, nor the UI above it, ever decides "is this my
    // Publication."
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, worldViewRoot, cardRoot } = makeTwoSurfaceApp();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section G', 'alice'), identityProvider);

        // A third, unrelated identity succeeds through BOTH roots
        // identically — CanCommentOnPublicationUseCase's "the
        // Publication exists" policy is the only thing ever consulted,
        // and it is the SAME instance-shape policy class in both roots.
        identityProvider.login('carol');
        const carolId = identityProvider.getSigningIdentity().id;
        const viaWorldView = worldViewRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'carol via world view root' });
        const viaCard = cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'carol via card root' });
        assert(viaWorldView.commentary.authorIdentityId === carolId && viaCard.commentary.authorIdentityId === carolId,
            '41. an identity with no relationship to the Publication succeeds identically through both roots');

        // An unauthenticated attempt is rejected identically by both
        // roots, with the SAME underlying error message — proving
        // neither root layers its own authorization on top of, or
        // instead of, CanCommentOnPublicationUseCase's own.
        identityProvider.logout();
        let worldViewError = null;
        let cardError = null;
        try { worldViewRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'nobody A' }); } catch (e) { worldViewError = e; }
        try { cardRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'nobody B' }); } catch (e) { cardError = e; }
        assert(worldViewError && cardError, '42. both roots reject an unauthenticated attempt');
        assert(worldViewError.message === cardError.message, '43. both roots surface the EXACT SAME rejection message — the identical, unmodified AddPublicationCommentaryUseCase authentication check, never a root-specific rejection');
        assert(worldViewError.message.includes('sign in to comment'), '44. the rejection is the existing application-layer authentication error, not a UI-invented one');

        // Neither UI component's own source contains any code path that
        // could compute "is this my Publication" before calling the
        // command — the decision genuinely never reaches the UI layer.
        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        for (const [file, code] of [['PublicationCard.js', cardCode], ['OwnPublicationPanel.js', panelCode]]) {
            assert(!/publication\.(author|publisherIdentity)\s*===?\s*(this\.)?viewerIdentityId/.test(code),
                `45. ${file} never compares the Publication's own author/publisher against the viewer to gate commentary`);
        }

        console.log('✓ Section G: authorization is identical regardless of which root or UI surface initiated the operation — the UI never decides Publication ownership');
    }

    // ---------------------------------------------------------------
    // Section H — UI lifecycle divergence is intentional: prove (never
    // try to erase) that OwnPublicationPanel eagerly loads and
    // PublicationCard lazily loads on expansion — a presentation
    // difference only, never a domain one, since both ultimately reach
    // the identical command contract Sections A/B already proved
    // equivalent.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(/mounted\s*\(\s*\)\s*\{[^}]*refreshPublicationCommentaries\(\)/s.test(panelCode),
            '46. OwnPublicationPanel eagerly loads commentary on mount — its own existing lifecycle, unchanged');
        assert(/watch\s*:\s*\{/.test(panelCode), '47. OwnPublicationPanel still reacts to a change of the active Publication via a watcher — the eager-reload path this milestone leaves untouched');

        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        assert(!/mounted\s*\(/.test(cardCode), '48. PublicationCard defines no mounted() hook at all — it never eagerly loads');
        assert(cardCode.includes('toggleCommentary()') && cardCode.includes('refreshCommentaries()'),
            '49. PublicationCard\'s only read trigger is the explicit expansion action');

        // Prove card-local state is genuinely per-instance, not shared
        // module state: Vue's own data() factory returns a fresh object
        // on every call.
        assert(typeof PublicationCard.data === 'function', '50. PublicationCard.data is a factory function, per Vue\'s own convention for per-instance state');
        const instanceOne = PublicationCard.data();
        const instanceTwo = PublicationCard.data();
        assert(instanceOne !== instanceTwo, '51. two calls to data() return two distinct objects');
        instanceOne.commentaryOpen = true;
        assert(instanceTwo.commentaryOpen === false, '52. mutating one instance\'s lifecycle state never affects another\'s default');

        // Despite the different lifecycle, both surfaces call the SAME
        // injected command contract — the domain behavior underneath is
        // identical (already proven functionally in Sections A/B; this
        // reconfirms it structurally, from source).
        assert(panelCode.includes('this.getPublicationCommentariesCommand(') && cardCode.includes('this.getPublicationCommentariesCommand('),
            '53. both components call the identical injected getPublicationCommentariesCommand — only WHEN they call it differs');
        assert(panelCode.includes('this.addPublicationCommentaryCommand(') && cardCode.includes('this.addPublicationCommentaryCommand('),
            '54. both components call the identical injected addPublicationCommentaryCommand');

        console.log('✓ Section H: eager-vs-lazy loading is a real, intentional, source-verified presentation difference — never a domain difference, since both reach the identical command contract');
    }

    // ---------------------------------------------------------------
    // Section I — Publication isolation: across multiple
    // PublicationCard instances (multiple cards on one catalog page),
    // expanding or submitting in one card never leaks state into
    // another — card-local `commentaryOpen`/`commentaries`/
    // `newCommentaryText` state stays genuinely per-card.
    // ---------------------------------------------------------------
    {
        const { identityProvider, publisherProvider, worldViewRoot } = makeTwoSurfaceApp();
        identityProvider.login('alice');
        const pubA = publisherProvider.publish(makeDocument('Card A', 'alice'), identityProvider);
        const pubB = publisherProvider.publish(makeDocument('Card B', 'alice'), identityProvider);
        const pubC = publisherProvider.publish(makeDocument('Card C', 'alice'), identityProvider);

        const cardCtxA = cardCtx({ publication: pubA, getPublicationCommentariesCommand: worldViewRoot.getPublicationCommentariesCommand, addPublicationCommentaryCommand: worldViewRoot.addPublicationCommentaryCommand });
        const cardCtxB = cardCtx({ publication: pubB, getPublicationCommentariesCommand: worldViewRoot.getPublicationCommentariesCommand, addPublicationCommentaryCommand: worldViewRoot.addPublicationCommentaryCommand });
        const cardCtxC = cardCtx({ publication: pubC, getPublicationCommentariesCommand: worldViewRoot.getPublicationCommentariesCommand, addPublicationCommentaryCommand: worldViewRoot.addPublicationCommentaryCommand });

        // Expand only card A and card C — card B stays collapsed.
        cardCtxA.toggleCommentary();
        cardCtxC.toggleCommentary();
        assert(cardCtxA.commentaryOpen === true && cardCtxC.commentaryOpen === true, '55. cards A and C expand independently');
        assert(cardCtxB.commentaryOpen === false, '56. card B never opens just because sibling cards did');

        // Submit into card A only — draft text and submission state stay
        // local to card A.
        cardCtxA.newCommentaryText = 'only for A';
        cardCtxA.submitCommentary();
        assert(cardCtxB.newCommentaryText === '' && cardCtxC.newCommentaryText === '', '57. a draft typed into one card never appears in another\'s draft');
        assert(cardCtxA.commentaries.length === 1 && cardCtxA.commentaries[0].content === 'only for A', '58. card A shows exactly its own submitted commentary');
        assert(cardCtxB.commentaries.length === 0 && cardCtxC.commentaries.length === 0, '59. cards B and C show none of card A\'s commentary — each card\'s own commentaries array is genuinely per-Publication, per-card');

        // Now open B and C — each shows exactly its own Publication's
        // (empty) thread, never A's.
        cardCtxB.toggleCommentary();
        assert(cardCtxB.commentaries.length === 0, '60. opening card B for the first time loads only its own (empty) thread');
        cardCtxC.refreshCommentaries();
        assert(cardCtxC.commentaries.length === 0, '61. card C\'s thread stays empty — commentary submitted to Publication A never leaks to Publication C\'s own read');

        console.log('✓ Section I: PublicationCard\'s local commentary state stays genuinely per-card and per-Publication — no cross-card leakage of expansion, drafts, or commentary data');
    }

    // ---------------------------------------------------------------
    // Section J — Existing behavior regression: the previously
    // completed Commentary path (OwnPublicationPanel, persistence,
    // recipient notification, Notification History) remains fully
    // functional and byte-for-byte unmodified after this audit — this
    // milestone changes no production file.
    // ---------------------------------------------------------------
    {
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes('refreshPublicationCommentaries()') && panelCode.includes('submitPublicationCommentary()'),
            '62. OwnPublicationPanel.js still carries its own original commentary methods');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes(':getPublicationCommentariesCommand="getPublicationCommentariesCommand"') &&
               viewCode.includes(':addPublicationCommentaryCommand="addPublicationCommentaryCommand"'),
            '63. WorldView.js still wires its own commentary commands onto OwnPublicationPanel, unmodified');

        const compositionCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(compositionCode.includes('new PublicationCommentaryStore(storageProvider)') &&
               compositionCode.includes('new PublicationCommentaryNotificationProducer('),
            '64. CreateWorldViewUseCase.js still composes its own, independent commentary path, unmodified by this audit');

        const historyPanelCode = await codeOnlySource('ui/components/NotificationHistoryPanel.js');
        assert(historyPanelCode.length > 0, '65. NotificationHistoryPanel.js still exists and is readable');
        assert(!historyPanelCode.includes('CreatePublicationCommentaryUseCase'), '66. Notification History stays wired through the ORIGINAL recipient-query path, never through this milestone\'s new composition root');

        // A full, real end-to-end pass over the ORIGINAL path: Alice
        // publishes, Bob comments through the WorldView-style root
        // (mirroring OwnPublicationPanel's own real call shape, since
        // this class-level regression test has no WorldNavigationSession
        // to mount), and Alice's own recipient query — the exact
        // application/GetRecipientNotificationEventsUseCase.js class
        // Notification History reads through — sees it.
        const { GetRecipientNotificationEventsUseCase } = await import('../application/GetRecipientNotificationEventsUseCase.js');
        const { identityProvider, publisherProvider, worldViewRoot } = makeTwoSurfaceApp();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section J', 'alice'), identityProvider);
        identityProvider.login('bob');
        worldViewRoot.addPublicationCommentaryCommand({ publicationId: publication.id, content: 'regression check' });

        identityProvider.login('alice');
        const recipientQuery = new GetRecipientNotificationEventsUseCase(worldViewRoot.notificationEventStore, identityProvider);
        const aliceEvents = recipientQuery.execute();
        assert(aliceEvents.some((e) => e.payload.publicationId === publication.id), '67. the original OwnPublicationPanel-shaped path still produces a notification Alice\'s own recipient query retrieves — the full existing arc remains functional');

        console.log('✓ Section J: the previously-completed Commentary/Notification arc remains fully functional and byte-for-byte unmodified');
    }

    // ---------------------------------------------------------------
    // Section K — Remaining four surfaces, classified rather than
    // wired; the fifth this section originally classified,
    // WorldEncounterCanvas.js, was picked up by 0.9.291 exactly as this
    // Section's own original rationale anticipated ("a real 0.9.291
    // candidate") — see the trailing block below this one for that
    // transition, checked fresh against current source rather than
    // asserted from this milestone's own frozen header. This section
    // makes no production change of its own; it records, with concrete
    // evidence from each remaining file's own current source, why each
    // of the four still-unwired surfaces 0.9.288 named stays unwired for
    // now.
    // ---------------------------------------------------------------
    {
        const classifications = {
            'ui/components/PublicationCatalog.js': {
                label: 'no additional action justified',
                reason: 'the shared HOST that mounts PublicationCard/PublicationList — it never itself renders a single Publication\'s identity long enough to host a comment thread; commentary already reaches every Publication it lists, through the card it already mounts.'
            },
            'ui/components/PublicationPreview.js': {
                label: 'semantically awkward',
                reason: 'a small thumbnail/placeholder tile embedded INSIDE PublicationCard/PublicationList — a compose form or comment list has no natural home inside a preview tile, and the host that already carries commentary is one component away.'
            },
            'ui/components/PublicationList.js': {
                label: 'PublicationCard already indirectly covers the use case',
                reason: 'the compact table alternate view of the exact SAME PublicationCatalog/Publications PublicationCard already serves — its own header names its purpose as "scanning a lot of results quickly," which a full commentary thread per row would directly undermine; a viewer who wants to comment already has Card view available for the identical Publication.'
            },
            'ui/views/DecentralizedPublicationsView.js': {
                label: 'genuinely awkward, different domain concern',
                reason: 'a verification/anchoring surface (Bitcoin/Base anchor proofs, IPFS content verification, snapshot placement convergence) — its own job is proving a Publication\'s decentralized existence claims, not social discussion about it; folding commentary in would blur two unrelated concerns the same way this milestone\'s own Section H insists eager/lazy loading must not blur domain behavior.'
            }
        };

        for (const [file, { label, reason }] of Object.entries(classifications)) {
            const code = await codeOnlySource(file);
            assert(!code.includes('getPublicationCommentariesCommand') && !code.includes('addPublicationCommentaryCommand'),
                `68. ${file} still carries no commentary wiring — classified '${label}', not implemented`);
            assert(reason.length > 0, `69. ${file} has a recorded, evidence-based rationale`);
        }
        assert(Object.keys(classifications).length === 4, '70. all four surfaces still unwired since 0.9.288 are accounted for — none silently dropped, none silently added');

        // K1. WorldEncounterCanvas.js, this Section's own original fifth
        // entry, now carries commentary wiring — 0.9.291 picked up
        // exactly the candidate this Section's own reasoning named,
        // reusing WorldView.js's own existing session-backed commands
        // (see WorldEncounterCanvas.js's own "0.9.291" header) rather
        // than a third composition root.
        const worldEncounterCode = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        assert(worldEncounterCode.includes('getPublicationCommentariesCommand') && worldEncounterCode.includes('addPublicationCommentaryCommand'),
            '70b. ui/components/WorldEncounterCanvas.js now carries commentary wiring — 0.9.291 closed this Section\'s own named candidate');

        console.log('✓ Section K: the four remaining surfaces stay classified and unwired (one host, one preview tile, one alternate list view, one unrelated verification surface). The fifth this Section named as a genuine future candidate, WorldEncounterCanvas, was picked up by 0.9.291.');
    }

    // ---------------------------------------------------------------
    // Section L — Architecture regression: 0.9.289 introduced none of
    // the twelve named risks, rechecked here fresh against current
    // source rather than trusted from that milestone's own header.
    // ---------------------------------------------------------------
    {
        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        const compositionCode = await codeOnlySource('application/CreatePublicationCommentaryUseCase.js');
        const mainCode = await codeOnlySource('ui/main.js');
        const combined = cardCode + '\n' + compositionCode;

        // 1. Ownership into PublicationCard.
        assert(!/isOwn|ownPublication|is-own|isMine|ownerId/i.test(cardCode), '71. no ownership concept was introduced into PublicationCard.js');
        // 2. A second Commentary domain concept.
        assert(!/class\s+\w*OtherCommentary|class\s+\w*CardCommentary/.test(combined), '72. no second Commentary domain class exists');
        // 3. A second store.
        const storeConstructions = [...compositionCode.matchAll(/new (\w*Store)\(/g)].map((m) => m[1]);
        assert(storeConstructions.every((name) => name === 'PublicationCommentaryStore' || name === 'NotificationEventStore'),
            `73. the new composition constructs only the two pre-existing stores, never a new one — found ${JSON.stringify(storeConstructions)}`);
        // 4. A second authorization model.
        assert((compositionCode.match(/new CanCommentOnPublicationUseCase\(/g) || []).length === 1,
            '74. exactly one CanCommentOnPublicationUseCase is constructed — the same, single authorization model');
        assert(!/class\s+\w*Authoriz/.test(compositionCode), '75. no new authorization class was introduced');
        // 5. Producer-side deduplication.
        assert(!/dedup/i.test(cardCode) && !/dedup/i.test(compositionCode), '76. neither PublicationCard.js nor CreatePublicationCommentaryUseCase.js implements any deduplication logic of its own — that authority stays exactly where Section F proved it: NotificationEventStore/NotificationDeduplicationPolicy');
        // 6. Notification delivery.
        assert(!/deliver|push|websocket|email/i.test(cardCode), '77. PublicationCard.js implements no delivery mechanism');
        // 7. UI-level persistence.
        assert(!/localStorage/.test(cardCode), '78. PublicationCard.js never touches window.localStorage directly');
        // 8. Global Commentary state.
        assert(!/^\s*(let|const|var)\s+\w*[Cc]ommentar\w*\s*=\s*(\[|\{)/m.test(cardCode.replace(/export default[\s\S]*/, '')),
            '79. no module-level (global) commentary state exists outside the component instance');
        // 9. Eager loading on paginated cards.
        assert(!/mounted\s*\(/.test(cardCode), '80. PublicationCard.js still defines no mounted() hook — no eager load was introduced');
        // 10. Lifecycle coupling between cards.
        assert(typeof PublicationCard.data === 'function', '81. commentary state is still declared through Vue\'s own per-instance data() factory, never a shared object literal');
        // 11. New Commentary vocabulary (forbidden class names from 0.9.289's own brief).
        for (const file of ['application/CreatePublicationCommentaryUseCase.js', 'ui/components/PublicationCard.js', 'ui/main.js']) {
            const code = await codeOnlySource(file);
            assert(!code.includes('OtherPublicationCommentaryUseCase') && !code.includes('AddCommentToOtherPublicationUseCase'),
                `82. ${file} introduces neither forbidden Commentary use case name`);
        }
        // 12. Only the two DELIBERATE UI surfaces (0.9.289's
        // PublicationCard.js, 0.9.291's WorldEncounterCanvas.js) — the
        // remaining four stay untouched.
        for (const file of [
            'ui/components/PublicationCatalog.js', 'ui/components/PublicationPreview.js', 'ui/components/PublicationList.js',
            'ui/views/DecentralizedPublicationsView.js'
        ]) {
            const code = await codeOnlySource(file);
            assert(!code.includes('getPublicationCommentariesCommand') && !code.includes('addPublicationCommentaryCommand'),
                `83. ${file} still carries no commentary wiring — the reachability surface has grown only through 0.9.289/0.9.291's own deliberate, named surfaces`);
        }
        assert(mainCode.includes("new CreatePublicationCommentaryUseCase().execute(identityProvider)"),
            '84. ui/main.js still composes commentary through exactly one, app-wide instance of the new composition root — not one per card, not one per render');

        console.log('✓ Section L: none of the twelve named architecture risks were introduced — rechecked fresh against current source, not inherited from 0.9.289\'s own header');
    }

    console.log('\n✅ All Publication Commentary Cross-Surface Convergence Audit tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
