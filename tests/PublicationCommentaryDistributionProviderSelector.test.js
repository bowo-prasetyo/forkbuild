import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
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
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { readFile } from 'node:fs/promises';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.638 — Publication Commentary Distribution Provider Selector.
//
// 0.9.637's own Boundary Audit found the selection boundary already
// live one layer down (ui/main.js's own addPublicationCommentaryCommand
// wrapper already branches on `input.discoveryProvider`) and isolated
// the actionable gap to exactly PATH 1 — ui/components/PublicationCard.js
// and ui/components/PublicationList.js, the two components that INJECT
// that app-wide, distribution-wrapped command. This milestone adds the
// SAME two-option "Distribution: Nostr / Arweave" control EditorView.js
// already carries (0.9.502) to those two surfaces only, forwarding the
// selected value verbatim as `discoveryProvider` on the exact call each
// component already makes. PATH 2 (OwnPublicationPanel.js/
// WorldEncounterCanvas.js) is deliberately, explicitly left untouched —
// see Section H, below — a genuine open architectural question 0.9.637
// raised and this milestone does not answer.
//
// This file exercises the milestone's own lettered sections (A-H)
// against REAL collaborators (LocalIdentityProvider, LocalDiscoveryProvider,
// LocalPublisherProvider, PublicationCommentaryStore, NotificationEventStore,
// and all four Commentary application use cases, unmodified) with
// PublicationCard.js's/PublicationList.js's own methods invoked the same
// way every sibling test file in this codebase already invokes a
// component's methods: bound to a plain ctx object mirroring a mounted
// Vue instance, never a full Vue mount. Sections B-E additionally
// extract and execute the REAL, current ui/main.js distribution wrapper
// (the same live-execution technique 0.9.637's own Section D flagship
// established) against fake WebRTC/Nostr/Arweave collaborators, so the
// fan-out/no-fan-out proof is against real production wiring, not a
// reimplementation that could silently drift from it.

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

// The real local-persistence-only capability CreatePublicationCommentaryUseCase.js
// itself composes — reused here the same way
// tests/PublicationListCommentaryParity.test.js's own makeBackend()
// already reproduces it, so Sections A/F/G exercise real persistence,
// never a stub.
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
    // Local persistence ONLY — no distribution. Sections B-E wrap this
    // with the REAL ui/main.js wrapper (extracted below) to add
    // distribution behavior, exactly mirroring production composition:
    // ui/main.js's own createPublicationCommentaryCommand is this same
    // kind of local-only capability, one layer under its own
    // addPublicationCommentaryCommand wrapper.
    function createPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) {
        return publicationCommentaryCapability.execute({ publicationId, content, commentaryId, createdAt });
    }

    return {
        storage, identityProvider, publisherProvider, discoveryProvider,
        commentaryStore, notificationEventStore,
        getPublicationCommentariesCommand, createPublicationCommentaryCommand
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

// The identical live-extraction technique 0.9.637's own Section D
// flagship established: pull the REAL, current function body out of
// ui/main.js's own source and execute it against fake collaborators,
// rather than reimplementing its logic (which could silently drift
// from production).
async function extractPath1Wrapper() {
    const mainSource = await codeOnlySource('ui/main.js');
    const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
    assert(wrapperMatch !== null, 'sanity: the real addPublicationCommentaryCommand wrapper is found in ui/main.js\'s current source');
    // eslint-disable-next-line no-new-func
    return new Function(
        'input', 'createPublicationCommentaryCommand', 'publicationCommentaryDistributionPeerExchange',
        'publicationCommentaryArweaveDistribution', 'publicationCommentaryNostrDistribution', 'publicationCommentaryDistributionExchange',
        wrapperMatch[1]
    );
}

// Wraps a real, local-only createPublicationCommentaryCommand with the
// REAL, extracted ui/main.js distribution wrapper and fake WebRTC/
// Nostr/Arweave collaborators, counting calls to each — the exact shape
// PublicationCard.js/PublicationList.js actually inject in production.
function makeDistributionWrappedCommand(path1Fn, createPublicationCommentaryCommand, calls) {
    return function addPublicationCommentaryCommand(input) {
        return path1Fn(
            input,
            createPublicationCommentaryCommand,
            { announce: () => { calls.peer += 1; } },
            { publish: (json) => { calls.arweave += 1; return Promise.resolve({ published: true, locator: 'a', json }); } },
            { publish: (json) => { calls.nostr += 1; return Promise.resolve({ published: true, locator: 'n', json }); } },
            { exportCommentary: (c) => ({ envelopeFor: c }) }
        );
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
        commentaryError: null,
        pendingCommentaryDraft: null,
        selectedDiscoveryProvider: 'nostr',
        lastCommentaryDistributionProvider: null,
        // The card's own toggle; opening mounts the shared
        // PublicationCommentarySection, whose mounted() performs the
        // first read. Reads/writes are that section's own methods.
        toggleCommentary() {
            PublicationCard.methods.toggleCommentary.call(this);
            if (this.commentaryOpen) {
                PublicationCommentarySection.mounted.call(this);
            }
        },
        refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
        submitCommentary: PublicationCommentarySection.methods.submitCommentary,
        ...overrides
    };
}

// PublicationList.js only tracks which rows are open; each open row
// mounts its own PublicationCommentarySection. `rowSection(pub)` stands
// in for that row's own section instance (one per publicationId, never
// shared); opening runs its mounted() read, closing discards it.
function listCtx(overrides = {}) {
    const ctx = {
        getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null,
        identityUseCase: null, defaultAnnouncementDiscoveryProvider: null,
        openCommentaryIds: {},
        isCommentaryOpen: PublicationList.methods.isCommentaryOpen,
        ...overrides
    };
    const sections = new Map();
    ctx.rowSection = (pub) => {
        if (!sections.has(pub.id)) {
            const section = {
                publication: pub,
                getPublicationCommentariesCommand: ctx.getPublicationCommentariesCommand,
                addPublicationCommentaryCommand: ctx.addPublicationCommentaryCommand,
                identityUseCase: ctx.identityUseCase,
                defaultAnnouncementDiscoveryProvider: ctx.defaultAnnouncementDiscoveryProvider,
                refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
                submitCommentary: PublicationCommentarySection.methods.submitCommentary
            };
            Object.assign(section, PublicationCommentarySection.data.call(section));
            sections.set(pub.id, section);
        }
        return sections.get(pub.id);
    };
    ctx.toggleCommentary = (pub) => {
        PublicationList.methods.toggleCommentary.call(ctx, pub);
        if (ctx.isCommentaryOpen(pub)) {
            PublicationCommentarySection.mounted.call(ctx.rowSection(pub));
        } else {
            sections.delete(pub.id);
        }
    };
    return ctx;
}

async function runTests() {
    const path1Fn = await extractPath1Wrapper();

    // ===============================================================
    // Section A — default regression: no explicit selection still
    // produces provider = 'nostr' and behaves exactly as before.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('A', 'alice'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);

        const ctx = cardCtx({
            publication,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand
        });
        assert(ctx.selectedDiscoveryProvider === 'nostr', '1. a fresh PublicationCard instance defaults its selector to \'nostr\' — matching PublicationCard.js\'s own data()');

        ctx.newCommentaryText = 'default provider comment';
        ctx.submitCommentary();

        assert(ctx.commentaryError === null, '2. an unmodified compose flow still succeeds with no explicit selection');
        assert(calls.peer === 1, '3. WebRTC announce still fires, unchanged, exactly as before this milestone');
        assert(calls.nostr === 1 && calls.arweave === 0, '4. with no explicit selection, distribution reaches Nostr — the default — never Arweave');
        assert(ctx.lastCommentaryDistributionProvider === 'nostr', '5. the card\'s own status state records \'nostr\' as what was requested');

        console.log('✓ A: default regression — an unselected PublicationCard submission still behaves exactly as it did before this milestone, reaching Nostr and only Nostr');
    }

    // ===============================================================
    // Section B — Nostr selection: local Commentary exists, WebRTC
    // remains available, Nostr distribution invoked, Arweave not.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('B', 'alice'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = cardCtx({
            publication,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand,
            selectedDiscoveryProvider: 'nostr'
        });

        ctx.newCommentaryText = 'explicit nostr comment';
        ctx.submitCommentary();

        assert(backend.commentaryStore.getForPublication(publication.id).length === 1, '6. local Commentary exists after an explicit Nostr selection');
        assert(calls.peer === 1, '7. WebRTC remains independent and always available');
        assert(calls.nostr === 1, '8. Nostr distribution is invoked');
        assert(calls.arweave === 0, '9. Arweave distribution is NOT invoked');

        console.log('✓ B: explicit Nostr selection — local persistence, WebRTC, and Nostr all fire; Arweave never does');
    }

    // ===============================================================
    // Section C — Arweave selection: the inverse of Section B.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('C', 'alice'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = cardCtx({
            publication,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand,
            selectedDiscoveryProvider: 'arweave'
        });

        ctx.newCommentaryText = 'explicit arweave comment';
        ctx.submitCommentary();

        assert(backend.commentaryStore.getForPublication(publication.id).length === 1, '10. local Commentary exists after an explicit Arweave selection');
        assert(calls.peer === 1, '11. WebRTC remains independent and always available');
        assert(calls.arweave === 1, '12. Arweave distribution is invoked');
        assert(calls.nostr === 0, '13. Nostr distribution is NOT invoked');
        assert(ctx.lastCommentaryDistributionProvider === 'arweave', '14. the card\'s own status state records \'arweave\' as what was requested');

        console.log('✓ C: explicit Arweave selection — local persistence, WebRTC, and Arweave all fire; Nostr never does');
    }

    // ===============================================================
    // Section D — no fan-out, reconfirmed on PublicationList.js's own
    // per-row selector (Sections B/C already proved it on
    // PublicationCard.js; this proves the SAME property holds on the
    // second PATH 1 surface, per-row, never cross-row).
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const pubNostrRow = backend.publisherProvider.publish(makeDocument('D-nostr', 'alice'), backend.identityProvider);
        const pubArweaveRow = backend.publisherProvider.publish(makeDocument('D-arweave', 'alice'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const addPublicationCommentaryCommand = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        const ctx = listCtx({
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand
        });

        ctx.rowSection(pubNostrRow).newCommentaryText = 'row selecting nostr';
        ctx.rowSection(pubNostrRow).selectedDiscoveryProvider = 'nostr';
        ctx.rowSection(pubNostrRow).submitCommentary();

        ctx.rowSection(pubArweaveRow).newCommentaryText = 'row selecting arweave';
        ctx.rowSection(pubArweaveRow).selectedDiscoveryProvider = 'arweave';
        ctx.rowSection(pubArweaveRow).submitCommentary();

        assert(calls.nostr === 1 && calls.arweave === 1, '15. across two rows with different selections, each substrate is reached exactly once in total');
        assert(ctx.rowSection(pubNostrRow).lastCommentaryDistributionProvider === 'nostr', '16. the nostr-selecting row\'s own status reflects \'nostr\', never bleeding the other row\'s choice');
        assert(ctx.rowSection(pubArweaveRow).lastCommentaryDistributionProvider === 'arweave', '17. the arweave-selecting row\'s own status reflects \'arweave\', isolated from the first row');
        assert(calls.peer === 2, '18. WebRTC announce fires once per row submission, independent of the substrate choice');

        console.log('✓ D: no fan-out, reconfirmed per-row on PublicationList.js — each row\'s own selection reaches exactly its own chosen substrate, never both, never the other row\'s');
    }

    // ===============================================================
    // Section E — local-first failure isolation: the selected async
    // substrate rejecting never undoes local persistence.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('E', 'alice'), backend.identityProvider);

        // A rejecting Nostr publish() — mirrors "no relay reachable" —
        // wired directly (not through makeDistributionWrappedCommand's
        // own always-resolving fakes) so this section proves the exact
        // failure path.
        const addPublicationCommentaryCommand = function (input) {
            return path1Fn(
                input,
                backend.createPublicationCommentaryCommand,
                { announce: () => { throw new Error('no peers connected'); } },
                { publish: () => Promise.resolve({ published: true }) },
                { publish: () => Promise.reject(new Error('no Nostr relay reachable')) },
                { exportCommentary: (c) => ({ envelopeFor: c }) }
            );
        };
        const ctx = cardCtx({
            publication,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand,
            selectedDiscoveryProvider: 'nostr'
        });

        ctx.newCommentaryText = 'posted despite peer and relay failure';
        ctx.submitCommentary();

        assert(ctx.commentaryError === null, '19. neither the WebRTC announce throw nor the (unawaited) Nostr rejection surfaces as a creation error');
        assert(backend.commentaryStore.getForPublication(publication.id).length === 1, '20. the local Commentary remains available despite both distribution attempts failing');
        assert(ctx.newCommentaryText === '', '21. the compose draft was cleared — the UI treats this as a genuine success, exactly as truthful given local persistence really did succeed');

        // Let the rejected promise settle without an unhandled-rejection
        // failure — the real wrapper's own `.catch(() => {})` (unchanged
        // by this milestone) is what actually prevents that; this just
        // gives the microtask queue a turn before the test file exits.
        await new Promise((resolve) => setTimeout(resolve, 0));

        console.log('✓ E: local-first failure isolation — a rejecting selected substrate (and a throwing WebRTC announce) never undoes or reports against local Commentary creation');
    }

    // ===============================================================
    // Section F — existing UI regression: every pre-0.9.638 call shape
    // (no discoveryProvider field at all, simulating an older caller)
    // still works against the real, current addPublicationCommentaryCommand
    // wrapper.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('F', 'alice'), backend.identityProvider);

        const calls = { peer: 0, nostr: 0, arweave: 0 };
        const rawWrapped = makeDistributionWrappedCommand(path1Fn, backend.createPublicationCommentaryCommand, calls);
        // Simulates a caller that never populates discoveryProvider at
        // all (the shape every real call site sent before this
        // milestone, per 0.9.637's own Section B).
        const legacyShapeCommand = ({ publicationId, content, commentaryId, createdAt }) =>
            rawWrapped({ publicationId, content, commentaryId, createdAt });

        const result = legacyShapeCommand({ publicationId: publication.id, content: 'legacy shape', commentaryId: 'legacy-1', createdAt: new Date() });

        assert(result && result.commentary && result.isNew === true, '22. a legacy-shaped call (no discoveryProvider field) still creates and persists a real Commentary');
        assert(calls.nostr === 1 && calls.arweave === 0, '23. a legacy-shaped call still reaches the Nostr default, unchanged');

        console.log('✓ F: existing UI regression — a caller that never sends discoveryProvider at all still behaves exactly as it did before this milestone');
    }

    // ===============================================================
    // Section G — provider identity: the UI emits the existing
    // application values ('nostr'/'arweave'), never a UI-specific label.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('G', 'alice'), backend.identityProvider);

        let sentDiscoveryProvider = null;
        const spyCommand = (input) => {
            sentDiscoveryProvider = input.discoveryProvider;
            return backend.createPublicationCommentaryCommand(input);
        };
        const ctx = cardCtx({
            publication,
            getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand,
            addPublicationCommentaryCommand: spyCommand,
            selectedDiscoveryProvider: 'arweave'
        });

        ctx.newCommentaryText = 'checking wire value';
        ctx.submitCommentary();

        assert(sentDiscoveryProvider === 'arweave', '24. the exact literal \'arweave\' is sent on the wire — never a presentational value like "Arweave Network"');
        const label = PublicationCommentarySection.computed.lastCommentaryDistributionProviderLabel.call(ctx);
        assert(label === 'Arweave', '25. the card\'s own human-friendly label reads "Arweave" for display purposes only');
        assert(ctx.selectedDiscoveryProvider === 'arweave', '26. the selector\'s own bound value stays the literal application string, never translated for display');

        const cardSource = (await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        assert(/<option value="nostr">Nostr<\/option>/.test(cardSource) && /<option value="arweave">Arweave<\/option>/.test(cardSource),
            '27. PublicationCard.js\'s own <select> is valued exactly "nostr"/"arweave" — the application-layer vocabulary, human-readable labels only in the visible option TEXT');
        const listSource = (await rawSource('ui/components/PublicationList.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        assert(/<option value="nostr">Nostr<\/option>/.test(listSource) && /<option value="arweave">Arweave<\/option>/.test(listSource),
            '28. PublicationList.js\'s own per-row <select> carries the identical value vocabulary');

        console.log('✓ G: provider identity — the wire value is always the existing literal \'nostr\'/\'arweave\' string; human-friendly labels exist only for display');
    }

    // ===============================================================
    // Section H — architecture guard: the UI never instantiates
    // distribution adapters, verifies, deduplicates, fans out, or
    // modifies the async distribution contract; PATH 2 stays untouched.
    // ===============================================================
    {
        const cardSource = (await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const listSource = (await rawSource('ui/components/PublicationList.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const cardCode = (await codeOnlySource('ui/components/PublicationCard.js') + await codeOnlySource('ui/components/PublicationCommentarySection.js'));
        const listCode = (await codeOnlySource('ui/components/PublicationList.js') + await codeOnlySource('ui/components/PublicationCommentarySection.js'));

        assert(!/PublicationCommentaryNostrDistribution|PublicationCommentaryArweaveDistribution|PublicationCommentaryDistributionPeerExchange/.test(cardCode),
            '29. PublicationCard.js never imports or names any distribution class directly in CODE — selection stays entirely inside ui/main.js\'s own existing wrapper (the class names appear only in this file\'s own prose comments, explaining that restraint, never in an import or constructor)');
        assert(!/PublicationCommentaryNostrDistribution|PublicationCommentaryArweaveDistribution|PublicationCommentaryDistributionPeerExchange/.test(listCode),
            '30. PublicationList.js carries the identical restraint');

        assert(!/\.publish\(|\.announce\(/.test(cardCode) && !/\.publish\(|\.announce\(/.test(listCode),
            '31. neither component ever calls .publish()/.announce() itself — those verbs stay inside ui/main.js\'s own wrapper, unreached from either PATH 1 component');

        assert(!/Promise\.all|fallback|retry|dedup/i.test(cardCode) && !/Promise\.all|fallback|retry|dedup/i.test(listCode),
            '32. neither component performs fan-out (Promise.all across substrates), fallback, retry, or deduplication — a single literal value is forwarded, nothing more');

        // Selection stays structurally exclusive at the ONE place that
        // matters — ui/main.js's own wrapper, unmodified by this
        // milestone (reconfirmed, not merely inherited from 0.9.637).
        const mainSource = await codeOnlySource('ui/main.js');
        assert(/const discoveryProvider = \(input && input\.discoveryProvider\) \|\| 'nostr';/.test(mainSource),
            '33. ui/main.js\'s own selection line is unmodified by this milestone');
        assert(/const asynchronousDistribution = discoveryProvider === 'arweave'\s*\?\s*publicationCommentaryArweaveDistribution\s*:\s*publicationCommentaryNostrDistribution;/.test(mainSource),
            '34. ui/main.js\'s own exclusive-selection ternary is unmodified — still structurally incapable of selecting both');

        // No new persisted preference — the selector lives only in
        // ephemeral component data/row state (Sections A-D already
        // proved default reset per fresh ctx); confirmed here that
        // neither file ever touches localStorage/StorageProvider for
        // this field.
        assert(!/selectedDiscoveryProvider.*(?:localStorage|StorageProvider|\.save\()/s.test(cardCode),
            '35. PublicationCard.js never persists selectedDiscoveryProvider anywhere');
        assert(!/provider.*(?:localStorage|StorageProvider)/s.test(listCode) || !/rowCommentaryState.*localStorage/s.test(listCode),
            '36. PublicationList.js never persists a row\'s own provider selection anywhere');

        // PATH 2 — OwnPublicationPanel.js/WorldEncounterCanvas.js —
        // deliberately, explicitly untouched by this milestone. The
        // SAME per-function technique 0.9.637's own Section B used: find
        // each Commentary-creation function's own real
        // addPublicationCommentaryCommand({...}) call and confirm it
        // still carries no discoveryProvider field. This is deliberately
        // NOT a whole-file discoveryProvider absence check for
        // WorldEncounterCanvas.js: that file already, legitimately,
        // pre-dates this milestone with its own PUBLICATION-distribution
        // discoveryProvider vocabulary (0.9.430) — a different feature
        // this milestone does not touch. Scoping to the Commentary call
        // sites is what actually proves Commentary itself stays
        // untouched there.
        {
            const sites = [
                { file: 'ui/components/OwnPublicationPanel.js', fn: 'submitPublicationCommentary' },
                { file: 'ui/components/WorldEncounterCanvas.js', fn: 'submitObserverLocalEncounterCommentary' },
                { file: 'ui/components/WorldEncounterCanvas.js', fn: 'submitEncounterCommentary' }
            ];
            const callPattern = /(?:this\.)?addPublicationCommentaryCommand\(\{[^}]*\}\)/;
            for (const { file, fn } of sites) {
                const source = await codeOnlySource(file);
                const fnStart = source.indexOf(`${fn}(`);
                assert(fnStart !== -1, `sanity: ${file}#${fn}() still exists`);
                const window = source.slice(fnStart, fnStart + 1100);
                const callMatch = window.match(callPattern);
                assert(callMatch !== null, `sanity: ${file}#${fn}() still calls addPublicationCommentaryCommand()`);
                assert(!/discoveryProvider/.test(callMatch[0]),
                    `37. ${file}#${fn}()'s own real, current call — "${callMatch[0]}" — still sends no discoveryProvider field, deliberately left exactly as 0.9.637 found it`);
            }
            console.log('  (PATH 2 call sites reconfirmed untouched: OwnPublicationPanel.js#submitPublicationCommentary, WorldEncounterCanvas.js#submitObserverLocalEncounterCommentary/#submitEncounterCommentary)');
        }

        // No NEW Commentary-facing selector markup was added to either
        // PATH 2 file — a targeted check near each Commentary compose
        // form/textarea, not a whole-file ban (WorldEncounterCanvas.js's
        // own PRE-EXISTING Publication selector, 0.9.430, legitimately
        // keeps its own "Distribution"/<option value="nostr"> markup
        // elsewhere in the same file, for Publication, not Commentary).
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!/<option value="nostr">Nostr<\/option>/.test(panelSource),
            '38. OwnPublicationPanel.js — which carries no Publication-distribution selector at all — gained no Commentary one either');

        // WorldEncounterCanvas.js's own PRE-EXISTING Publication
        // selector (0.9.430) is untouched, still present, still
        // unrelated to Commentary.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        assert(/selectedDiscoveryProvider: 'nostr',/.test(canvasSource),
            '39. WorldEncounterCanvas.js\'s own PRE-EXISTING Publication selector is untouched, still present, still unrelated to Commentary');

        console.log('✓ H: architecture guard — no distribution adapters instantiated, no fan-out/fallback/retry/dedup, no new persisted preference, ui/main.js\'s own selection semantics unmodified, and PATH 2 left explicitly, verifiably untouched');
    }

    console.log('');
    console.log('=== 0.9.638 SUMMARY ===');
    console.log('PATH 1 (PublicationCard.js/PublicationList.js): a real, native, keyboard-accessible "nostr"/"arweave" selector now feeds the existing addPublicationCommentaryCommand contract exactly as 0.9.637\'s own audit prescribed — no new distribution class, no second source of truth, no fan-out.');
    console.log('PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js): deliberately, verifiably unchanged — remains 0.9.637\'s own open architectural question, not silently resolved by this milestone.');

    console.log('\n✅ All Publication Commentary Distribution Provider Selector tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
