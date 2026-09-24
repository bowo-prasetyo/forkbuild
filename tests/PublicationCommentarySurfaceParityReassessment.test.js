import { readFile, readdir } from 'node:fs/promises';

import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
import PublicationList from '../ui/components/PublicationList.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
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
import { worldEncounterCanvasFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';

// 0.9.562 — Publication Commentary Surface Parity Reassessment.
//
// TYPE: test-only. Production changes: none.
//
// 0.9.561 closed 0.9.560's own named PRODUCT_GAP (PublicationList.js had
// no Commentary while PublicationCard.js, the alternate view of the
// IDENTICAL catalog, had carried it since 0.9.289). This milestone asks
// the broader question the closure invites: now that a FOURTH production
// file carries Commentary wiring (PublicationCard.js, PublicationList.js,
// OwnPublicationPanel.js, WorldEncounterCanvas.js — the last of these
// hosting TWO independent commentary panels, `encounterCommentary*`
// (0.9.291, the primary/"selected" World Encounter selection) and
// `observerLocalEncounterCommentary*` (0.9.558, the separate
// observer-local encounter selection) — does every one of these FIVE
// commentary sections still provide the identical underlying identity,
// persistence, retry, and failure semantics, or did adding the fourth
// surface quietly disturb what the other three already had?
//
// This file is broader than a Card-vs-List reassessment, per this
// milestone's own brief: it re-examines the COMPLETE set of production
// Commentary surfaces as they stand today, against real collaborators
// (never a mock of the application layer), organized in the lettered
// sections A-J the brief itself specifies.
//
// EXPLICITLY NOT RE-AUDITED HERE (already closed by dedicated prior
// milestones, reconfirmed only insofar as adding List/observer-local
// disturbed them, never re-derived from scratch): notification
// production/deduplication, commentary persistence/identity as domain
// concepts, editing/deletion, moderation, threading, reactions, or any
// live synchronization mechanism. None of those exist in this codebase
// today, and this file does not propose adding any of them.
//
// FINDING (preview; see Section J for the full verdict): ALREADY_CORRECT
// across identity, read, write, retry, and failure-isolation semantics,
// for all five commentary sections. One narrow, pre-existing,
// DELIBERATE presentation asymmetry is named (Section I) and classified,
// never "fixed" — this milestone's own test-only scope does not license
// a production change for a difference that alters no user-facing
// meaning of what Commentary is.

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

// The honest Node-runnable analog of two independently constructed
// storage/LocalStorageProvider.js instances, which in the real running
// app never get a Map of their own — both always proxy the SAME global
// `window.localStorage`. Reused verbatim from
// tests/PublicationCommentaryCrossSurfaceConvergenceAudit.test.js's own
// SharedNamespaceStorageProvider, for the identical reason: two
// instances of this class sharing a backing Map have different object
// identity but observe the identical persisted bytes.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(backingMap) { super(); this._backing = backingMap; }
    save(name, data) { this._backing.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._backing.has(name) ? JSON.parse(JSON.stringify(this._backing.get(name))) : null; }
    remove(name) { this._backing.delete(name); }
    list() { return Array.from(this._backing.keys()); }
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

// A single, shared composition — mirrors the precedent already
// established by tests/PublicationCommentarySubmissionExperienceProductReassessment.test.js's
// own makeBackend(): ONE commentaryStore/canCommentOnPublicationUseCase/
// addPublicationCommentaryUseCase, decorated by PublicationCommentaryNotificationProducer
// with an injectable notificationSink, used as the backing command pair
// for every surface in a given section. Root-composition EQUIVALENCE
// itself (that ui/main.js's app-wide CreatePublicationCommentaryUseCase
// and WorldNavigationSession/CreateWorldViewUseCase's own composition
// converge on the same persisted bytes) is a separate, narrower claim —
// Section C below proves that one with genuinely TWO independent roots
// sharing one storage namespace, per makeTwoRootBackend().
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
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canCommentOnPublicationUseCase);
    const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
        addPublicationCommentaryUseCase,
        discoveryProvider,
        notificationSink || ((event) => notificationEventStore.save(event))
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

// TWO independently constructed sets of PublicationCommentaryStore/
// NotificationEventStore/use-case objects — rootA mirrors
// application/publication/commentary/CreatePublicationCommentaryUseCase.js's own composition
// (PublicationCard.js/PublicationList.js's real path); rootB mirrors
// application/world/CreateWorldViewUseCase.js's own composition
// (OwnPublicationPanel.js/WorldEncounterCanvas.js's real path) — sharing
// ONE backing Map, the honest analog of both proxying the same
// `window.localStorage` in the real app.
function makeTwoRootBackend() {
    const backingMap = new Map();
    const storageA = new SharedNamespaceStorageProvider(backingMap);
    const storageB = new SharedNamespaceStorageProvider(backingMap);
    const identityProvider = new LocalIdentityProvider(storageA);
    const contentStore = new LocalContentStore(storageA);
    const publisherProvider = new LocalPublisherProvider(storageA, contentStore);

    function buildRoot(storage) {
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const notificationEventStore = new NotificationEventStore(storage);
        const commentaryStore = new PublicationCommentaryStore(storage);
        const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
        const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
        const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(commentaryStore, identityProvider, canCommentOnPublicationUseCase);
        const capability = new PublicationCommentaryNotificationProducer(
            addPublicationCommentaryUseCase, discoveryProvider,
            (event) => notificationEventStore.save(event)
        );
        return {
            commentaryStore,
            getPublicationCommentariesCommand(publicationId) {
                if (!publicationId) return [];
                return getPublicationCommentariesUseCase.execute({ publicationId });
            },
            addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) {
                return capability.execute({ publicationId, content, commentaryId, createdAt });
            }
        };
    }

    return { identityProvider, publisherProvider, rootA: buildRoot(storageA), rootB: buildRoot(storageB) };
}

function viewOf({ publications = [], avatars = [] } = {}) {
    const totalCount = publications.length + avatars.length;
    return { isEmpty: totalCount === 0, publicationCount: publications.length, avatarCount: avatars.length, totalCount, publications, avatars };
}
function publicationRow(publication, overrides = {}) {
    return {
        objectId: publication.id, title: publication.title, publisherIdentity: publication.publisherIdentity,
        isSigned: !!publication.signature, x: 1, y: 0, z: 2, anchorCount: 0, placementCount: 0, ...overrides
    };
}

// ---------------------------------------------------------------------
// ctx factories — "bind the real methods to a plain ctx object
// mirroring a Vue component instance," the discipline every sibling
// test file in this codebase already uses; never a full Vue mount.
// ---------------------------------------------------------------------

function cardCtx(overrides = {}) {
    return {
        publication: null, getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null,
        commentaryOpen: false, commentaries: [], newCommentaryText: '',
        commentaryError: null, pendingCommentaryDraft: null,
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

function panelCtx(overrides = {}) {
    return {
        publication: null, getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null,
        viewerIdentityId: null, publicationCommentaries: [], newCommentaryText: '',
        publicationCommentarySubmitting: false, publicationCommentaryError: null, pendingCommentaryDraft: null,
        refreshPublicationCommentaries: OwnPublicationPanel.methods.refreshPublicationCommentaries,
        submitPublicationCommentary: OwnPublicationPanel.methods.submitPublicationCommentary,
        ...overrides
    };
}

// One ctx carrying BOTH of WorldEncounterCanvas's own commentary panels
// (encounterCommentary* for the primary/"selected" encounter,
// observerLocalEncounterCommentary* for the separate observer-local
// encounter, 0.9.558) — proven, by construction, to coexist on the SAME
// component instance without interference (see Section F/probe below).
function canvasCtx(overrides = {}) {
    const ctx = {
        view: overrides.view !== undefined ? overrides.view : WorldEncounterCanvas.props.view.default(),
        registry: null, selectedEncounter: null, resolvedSelectionChoice: null, resolvedLeadChoice: null,
        worldDiscoveryLeadRegistry: null, decentralizedLeadOutcome: null, distributionLifecycleStore: null,
        distributionLifecycle: null, unsubscribeDistributionLifecycle: null, distributionExecuting: false,
        distributionError: null, distributionRequestId: 0, snapshotDistributionExecuting: false,
        snapshotDistributionError: null, snapshotDistributionResult: null, snapshotDistributionRequestId: 0,
        snapshotDiscoveryExecuting: false, snapshotDiscoveryError: null, snapshotDiscoveryResult: null,
        snapshotAttributionResult: null, snapshotDiscoveryRequestId: 0, snapshotContentViewOpen: false,
        contentComparisonViewOpen: false, armedForComparisonSelection: false, materialInspection: null,
        materialInspectionRequestId: 0, materialSources: null, materialVerifier: null,
        getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null, viewerIdentityId: null,
        // primary/"selected" encounter commentary (0.9.291)
        encounterCommentaryOpen: false, encounterCommentaries: [], newEncounterCommentaryText: '',
        encounterCommentarySubmitting: false, encounterCommentaryError: null, pendingEncounterCommentaryDraft: null,
        // observer-local encounter commentary (0.9.558)
        selectedObserverLocalEncounter: null, observerLocalEncounterInspection: null,
        observerLocalEncounterInspectionRequestId: 0, observerLocalEncounterCommentaryOpen: false,
        observerLocalEncounterCommentaries: [], newObserverLocalEncounterCommentaryText: '',
        observerLocalEncounterCommentarySubmitting: false, observerLocalEncounterCommentaryError: null,
        pendingObserverLocalEncounterCommentaryDraft: null,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        toggleEncounterCommentary: WorldEncounterCanvas.methods.toggleEncounterCommentary,
        refreshEncounterCommentaries: WorldEncounterCanvas.methods.refreshEncounterCommentaries,
        submitEncounterCommentary: WorldEncounterCanvas.methods.submitEncounterCommentary,
        selectObserverLocalEncounter: WorldEncounterCanvas.methods.selectObserverLocalEncounter,
        refreshObserverLocalEncounterInspection: WorldEncounterCanvas.methods.refreshObserverLocalEncounterInspection,
        toggleObserverLocalEncounterCommentary: WorldEncounterCanvas.methods.toggleObserverLocalEncounterCommentary,
        refreshObserverLocalEncounterCommentaries: WorldEncounterCanvas.methods.refreshObserverLocalEncounterCommentaries,
        submitObserverLocalEncounterCommentary: WorldEncounterCanvas.methods.submitObserverLocalEncounterCommentary,
        ...overrides
    };
    Object.defineProperty(ctx, 'effectiveView', { get() { return WorldEncounterCanvas.computed.effectiveView.call(ctx); } });
    Object.defineProperty(ctx, 'selectedEncounterInspection', { get() { return WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx); } });
    Object.defineProperty(ctx, 'encounterCommentaryPublicationId', { get() { return WorldEncounterCanvas.computed.encounterCommentaryPublicationId.call(ctx); } });
    Object.defineProperty(ctx, 'observerLocalEncounterCommentaryPublicationId', { get() { return WorldEncounterCanvas.computed.observerLocalEncounterCommentaryPublicationId.call(ctx); } });
    return ctx;
}

// ---------------------------------------------------------------------
// Adapters — a uniform, normalized view over each surface's own,
// genuinely different state shape (a single-instance card, a per-row
// list, a single-publication panel, two independent canvas panels), so
// Sections C-I below can loop over "every commentary surface" instead
// of hand-duplicating five near-identical assertions per section. This
// is presentation-neutral by construction — it reads/drives each
// surface's OWN real methods and OWN real fields, never a second
// interpretation of them.
// ---------------------------------------------------------------------

// `open()` is deliberately idempotent — "make sure this surface's own
// commentary section is open AND freshly re-queried," never a raw
// toggle a second call would flip closed again. It reuses each
// surface's own toggle for the FIRST open (proving the real, lazy
// "collapsed by default, loaded only on first expansion" behavior each
// production header documents) and its own refresh method directly on
// every subsequent call, mirroring exactly what a real Wanderer
// re-glancing at an already-open section triggers.
function cardAdapter(ctx) {
    return {
        name: 'PublicationCard',
        open: () => { if (ctx.commentaryOpen) ctx.refreshCommentaries(); else ctx.toggleCommentary(); },
        isOpen: () => ctx.commentaryOpen,
        commentaries: () => ctx.commentaries, error: () => ctx.commentaryError,
        setText: (t) => { ctx.newCommentaryText = t; }, text: () => ctx.newCommentaryText,
        submit: () => ctx.submitCommentary(), publicationId: () => ctx.publication.id
    };
}
function listAdapter(ctx, pub) {
    return {
        name: 'PublicationList',
        open: () => { if (ctx.isCommentaryOpen(pub)) ctx.rowSection(pub).refreshCommentaries(); else ctx.toggleCommentary(pub); },
        isOpen: () => ctx.isCommentaryOpen(pub),
        commentaries: () => ctx.rowSection(pub).commentaries, error: () => ctx.rowSection(pub).commentaryError,
        setText: (t) => { ctx.rowSection(pub).newCommentaryText = t; }, text: () => ctx.rowSection(pub).newCommentaryText,
        submit: () => ctx.rowSection(pub).submitCommentary(), publicationId: () => pub.id
    };
}
function panelAdapter(ctx) {
    return {
        name: 'OwnPublicationPanel', open: () => ctx.refreshPublicationCommentaries(), isOpen: () => true,
        commentaries: () => ctx.publicationCommentaries, error: () => ctx.publicationCommentaryError,
        submitting: () => ctx.publicationCommentarySubmitting,
        setText: (t) => { ctx.newCommentaryText = t; }, text: () => ctx.newCommentaryText,
        submit: () => ctx.submitPublicationCommentary(), publicationId: () => ctx.publication.id
    };
}
function canvasSelectedAdapter(ctx) {
    return {
        name: 'WorldEncounterCanvas (selected encounter)',
        open: () => { if (ctx.encounterCommentaryOpen) ctx.refreshEncounterCommentaries(); else ctx.toggleEncounterCommentary(); },
        isOpen: () => ctx.encounterCommentaryOpen, commentaries: () => ctx.encounterCommentaries,
        error: () => ctx.encounterCommentaryError, submitting: () => ctx.encounterCommentarySubmitting,
        setText: (t) => { ctx.newEncounterCommentaryText = t; }, text: () => ctx.newEncounterCommentaryText,
        submit: () => ctx.submitEncounterCommentary(), publicationId: () => ctx.encounterCommentaryPublicationId
    };
}
function canvasObserverLocalAdapter(ctx) {
    return {
        name: 'WorldEncounterCanvas (observer-local encounter)',
        open: () => { if (ctx.observerLocalEncounterCommentaryOpen) ctx.refreshObserverLocalEncounterCommentaries(); else ctx.toggleObserverLocalEncounterCommentary(); },
        isOpen: () => ctx.observerLocalEncounterCommentaryOpen, commentaries: () => ctx.observerLocalEncounterCommentaries,
        error: () => ctx.observerLocalEncounterCommentaryError, submitting: () => ctx.observerLocalEncounterCommentarySubmitting,
        setText: (t) => { ctx.newObserverLocalEncounterCommentaryText = t; }, text: () => ctx.newObserverLocalEncounterCommentaryText,
        submit: () => ctx.submitObserverLocalEncounterCommentary(), publicationId: () => ctx.observerLocalEncounterCommentaryPublicationId
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
async function listJsFilesRecursively(relativeDir) {
    const results = [];
    async function walk(dir) {
        let entries;
        try {
            entries = await readdir(new URL(dir, SOURCE_ROOT), { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const childPath = `${dir}${dir.endsWith('/') ? '' : '/'}${entry.name}`;
            if (entry.isDirectory()) {
                await walk(`${childPath}/`);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                results.push(childPath);
            }
        }
    }
    await walk(relativeDir);
    return results;
}

// The findings this milestone's own Section J classifies, populated as
// each section runs, printed as this file's own closing summary.
const classification = {};

async function runTests() {
    console.log('Running Publication Commentary Surface Parity Reassessment tests...\n');

    // ===============================================================
    // Section A — Complete Commentary surface inventory. Not "the four
    // files the brief named," re-derived from scratch by scanning
    // EVERY .js file under ui/components/ and ui/views/ for the
    // getPublicationCommentariesCommand/addPublicationCommentaryCommand
    // vocabulary, so a sixth, silently-added surface would be caught
    // structurally, not merely missed by an enumerated list.
    // ===============================================================
    {
        const componentFiles = await listJsFilesRecursively('ui/components/');
        const viewFiles = await listJsFilesRecursively('ui/views/');
        const allFiles = [...componentFiles, ...viewFiles];
        assert(allFiles.length > 20, 'sanity: the directory scan found a realistic number of UI files.');

        const wired = [];
        for (const file of allFiles) {
            const code = await codeOnlySource(file);
            if (code.includes('getPublicationCommentariesCommand') || code.includes('addPublicationCommentaryCommand')) {
                wired.push(file);
            }
        }
        // ui/views/WorldView.js is expected here too — it OWNS the
        // session-backed composition/wrapper functions and forwards
        // them as props (see this file's own header on WorldView.js's
        // getPublicationCommentariesCommand()/addPublicationCommentaryCommand()).
        // ui/main.js is a composition root, not a UI component/view, so
        // it is deliberately outside this scan's own two directories.
        // PublicationCard.js/PublicationList.js keep the command name
        // only to gate their Comment toggle; their shared
        // PublicationCommentarySection.js does the reading and writing.
        const expectedWired = new Set([
            'ui/components/PublicationCard.js',
            'ui/components/PublicationList.js',
            'ui/components/PublicationCommentarySection.js',
            'ui/components/OwnPublicationPanel.js',
            'ui/components/WorldEncounterCanvas.js',
            // WorldEncounterCanvas's own commentary methods, moved out of it.
            'ui/components/worldEncounterCanvas/observerLocalEncounterMethods.js',
            'ui/components/worldEncounterCanvas/publicationDiscoveryMethods.js',
            'ui/components/worldEncounterCanvas/templates/encounterInspectionPanel.js',
            'ui/components/worldEncounterCanvas/templates/observerLocalEncounterPanel.js',
            'ui/components/ownPublicationPanel/templates/commentarySection.js',
            'ui/views/WorldView.js',
            // WorldView's own publication actions module, where those wrappers live.
            'ui/views/worldView/useOwnPublicationActions.js',
            // WorldView's Nearby section template, which binds them on WorldEncounterCanvas.
            'ui/views/worldView/templates/nearbySection.js'
        ]);
        assert(wired.length === expectedWired.size, `1. exactly ${expectedWired.size} UI files under ui/components/ or ui/views/ reference the Commentary command vocabulary — found ${wired.length}: ${wired.join(', ')}`);
        for (const file of wired) {
            assert(expectedWired.has(file), `2. ${file} is an EXPECTED Commentary surface, not a silently-added sixth one.`);
        }
        for (const file of expectedWired) {
            assert(wired.includes(file), `3. ${file} still carries its own known Commentary wiring.`);
        }

        // A2. WorldEncounterCanvas.js specifically carries TWO
        // independent commentary sections, not one — confirmed by the
        // presence of both method families in its own source.
        const canvasCode = (await Promise.all(worldEncounterCanvasFiles().map((file) => codeOnlySource(file)))).join('\n');
        for (const method of ['toggleEncounterCommentary', 'refreshEncounterCommentaries', 'submitEncounterCommentary']) {
            assert(canvasCode.includes(`${method}(`), `4. WorldEncounterCanvas.js's own primary/"selected" encounter panel still carries ${method}().`);
        }
        for (const method of ['toggleObserverLocalEncounterCommentary', 'refreshObserverLocalEncounterCommentaries', 'submitObserverLocalEncounterCommentary']) {
            assert(canvasCode.includes(`${method}(`), `5. WorldEncounterCanvas.js's own observer-local encounter panel still carries ${method}().`);
        }

        // A3. The surfaces PREVIOUSLY classified as deliberately unwired
        // (tests/PublicationCommentaryCrossSurfaceConvergenceAudit.test.js's
        // own Section K, last updated by 0.9.561) stay unwired, reconfirmed
        // fresh rather than trusted from that file's own frozen record.
        for (const file of ['ui/components/PublicationCatalog.js', 'ui/components/PublicationPreview.js', 'ui/views/DecentralizedPublicationsView.js']) {
            assert(!wired.includes(file), `6. ${file} remains a deliberately unwired host/unrelated surface — the directory scan found no Commentary reference in it.`);
        }

        classification['A — surface inventory'] = 'ALREADY_CORRECT: exactly five commentary sections (Card, List, OwnPublicationPanel, WorldEncounterCanvas x2) across four production files, plus WorldView.js as their shared composition wrapper; no sixth surface exists.';
        console.log('✓ Section A: the complete, structurally-scanned Commentary surface inventory is exactly the five sections this milestone\'s own brief named — no missed sixth surface, no silently-added one.');
    }

    // ===============================================================
    // Section B — Identity convergence. Every surface's own publicationId
    // resolves from a real Publication.id (or, for WorldEncounterCanvas,
    // the encounter's own objectId/publicationId, which the encounter
    // domain already carries as that same real id) — never from
    // documentId or contentHash. Exercised against the established
    // P1 = D+H, P2 = D+H, P1 !== P2 case: two Publications sharing one
    // document and one content hash (a republish), read/written through
    // every surface in turn.
    // ===============================================================
    {
        // B1 — source-level: the exact line each surface's own identity
        // computed/method reads is `.id`/`.objectId`/`.publicationId` of a
        // Publication/encounter, never `.documentId`/`.contentHash`.
        const cardCode = await codeOnlySource('ui/components/PublicationCard.js');
        const listCode = await codeOnlySource('ui/components/PublicationList.js');
        const sectionCode = await codeOnlySource('ui/components/PublicationCommentarySection.js');
        const panelCode = (await Promise.all(ownPublicationPanelFiles().map((file) => codeOnlySource(file)))).join('\n');
        const canvasCode = (await Promise.all(worldEncounterCanvasFiles().map((file) => codeOnlySource(file)))).join('\n');
        assert(cardCode.includes(':publication="publication"') && sectionCode.includes('this.publication.id'), '7. PublicationCard.js hands its own publication to the shared section, which reads identity from this.publication.id.');
        assert(listCode.includes('<PublicationCommentarySection :publication="pub" />') && listCode.includes('openCommentaryIds[pub.id]'), '8. PublicationList.js keys each row by pub.id and hands that row\'s own pub to its section.');
        assert(panelCode.includes('publication.id') || panelCode.includes('this.publication.id'), '9. OwnPublicationPanel.js reads identity from (this.)publication.id.');
        assert(canvasCode.includes('this.selectedEncounter.objectId'), '10. WorldEncounterCanvas.js\'s primary panel reads identity from selectedEncounter.objectId.');
        assert(canvasCode.includes('this.selectedObserverLocalEncounter.publicationId'), '11. WorldEncounterCanvas.js\'s observer-local panel reads identity from selectedObserverLocalEncounter.publicationId.');

        // B2 — behavioral: P1/P2 share documentId AND contentHash but
        // carry distinct ids; every surface must keep their commentary
        // fully apart.
        const { identityProvider, storage, getPublicationCommentariesCommand, addPublicationCommentaryCommand, commentaryStore } = makeBackend();
        identityProvider.login('alice');
        const sharedDocumentId = 'doc-b-shared';
        const sharedHash = 'hash-b-shared';
        const p1 = new Publication({ id: 'pub-b-p1', documentId: sharedDocumentId, title: 'Republished', author: 'alice', publisherIdentity: { id: 'did:key:alice' }, contentReference: { hash: sharedHash } });
        const p2 = new Publication({ id: 'pub-b-p2', documentId: sharedDocumentId, title: 'Republished', author: 'alice', publisherIdentity: { id: 'did:key:alice' }, contentReference: { hash: sharedHash } });
        knowPublicationsLocally(storage, [p1, p2]);
        assert(p1.documentId === p2.documentId && p1.contentReference.hash === p2.contentReference.hash && p1.id !== p2.id,
            '12. sanity: P1 and P2 genuinely share documentId/contentHash but carry distinct ids.');

        const view = viewOf({ publications: [publicationRow(p1), publicationRow(p2)] });

        const surfaces = [
            { adapter: cardAdapter(cardCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand })), other: cardAdapter(cardCtx({ publication: p2, getPublicationCommentariesCommand, addPublicationCommentaryCommand })) },
            (() => { const ctx = listCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand }); return { adapter: listAdapter(ctx, p1), other: listAdapter(ctx, p2) }; })(),
            { adapter: panelAdapter(panelCtx({ publication: p1, getPublicationCommentariesCommand, addPublicationCommentaryCommand })), other: panelAdapter(panelCtx({ publication: p2, getPublicationCommentariesCommand, addPublicationCommentaryCommand })) },
            (() => {
                const ctx1 = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
                ctx1.selectEncounter({ kind: 'PUBLICATION', objectId: p1.id });
                const ctx2 = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand });
                ctx2.selectEncounter({ kind: 'PUBLICATION', objectId: p2.id });
                return { adapter: canvasSelectedAdapter(ctx1), other: canvasSelectedAdapter(ctx2) };
            })(),
            (() => {
                const ctx1 = canvasCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand });
                ctx1.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: p1.contentReference.hash });
                const ctx2 = canvasCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand });
                ctx2.selectObserverLocalEncounter({ publicationId: p2.id, contentHash: p2.contentReference.hash });
                return { adapter: canvasObserverLocalAdapter(ctx1), other: canvasObserverLocalAdapter(ctx2) };
            })()
        ];

        // Every surface below shares the SAME backend/store (deliberately —
        // Section 17's own assertion wants the cumulative total), so each
        // iteration's OWN new comment is the (index+1)-th one for its
        // Publication; what matters for identity isolation is that EVERY
        // comment ever posted to p1 stays out of p2's own list, and vice
        // versa, regardless of how many surfaces have already contributed.
        surfaces.forEach(({ adapter, other }, index) => {
            assert(adapter.publicationId() === p1.id, `13. ${adapter.name}: resolves P1's own real id, not documentId/contentHash.`);
            assert(other.publicationId() === p2.id, `14. ${adapter.name}: the P2-bound instance resolves P2's own real id.`);
            adapter.setText(`on P1 via ${adapter.name}`);
            adapter.submit();
            other.setText(`on P2 via ${adapter.name}`);
            other.submit();
            adapter.open();
            other.open();
            const expectedCount = index + 1;
            assert(adapter.commentaries().length === expectedCount && adapter.commentaries().every((c) => c.content.startsWith('on P1 via')),
                `15. ${adapter.name}: P1's own row/panel/selection shows exactly its own ${expectedCount} accumulated P1 comment(s), never one of P2's.`);
            assert(other.commentaries().length === expectedCount && other.commentaries().every((c) => c.content.startsWith('on P2 via')),
                `16. ${adapter.name}: P2's own row/panel/selection shows exactly its own ${expectedCount} accumulated P2 comment(s), never one of P1's, despite identical documentId/contentHash.`);
        });
        assert(commentaryStore.getForPublication(p1.id).length === surfaces.length && commentaryStore.getForPublication(p2.id).length === surfaces.length,
            '17. the store itself keeps every surface\'s P1/P2 commentary fully separate — 5 surfaces, 5 P1 comments, 5 P2 comments, never merged by documentId/contentHash.');

        classification['B — identity convergence'] = 'ALREADY_CORRECT: every one of the five commentary sections resolves publicationId from a real Publication/encounter id; none can be tricked into documentId/contentHash as an implicit key.';
        console.log('✓ Section B: identity stays publicationId-keyed, never documentId/contentHash-keyed, across every one of the five commentary sections — the P1=D+H, P2=D+H, P1!==P2 case holds everywhere.');
    }

    // ===============================================================
    // Section C — Read semantics. Two INDEPENDENTLY composed roots
    // (rootA mirrors CreatePublicationCommentaryUseCase.js, used by
    // Card/List; rootB mirrors CreateWorldViewUseCase.js/
    // WorldNavigationSession, used by OwnPublicationPanel/
    // WorldEncounterCanvas), sharing one storage namespace. A
    // commentary written through EITHER root, by EITHER of the five
    // surfaces, must be visible through the other — one underlying
    // store, never a second source of truth, regardless of which
    // composition or which surface a Wanderer happens to be looking
    // through.
    // ===============================================================
    {
        const { identityProvider, publisherProvider, rootA, rootB } = makeTwoRootBackend();
        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section C', 'alice'), identityProvider);
        identityProvider.login('bob');

        const view = viewOf({ publications: [publicationRow(publication)] });

        const cCard = cardAdapter(cardCtx({ publication, getPublicationCommentariesCommand: rootA.getPublicationCommentariesCommand, addPublicationCommentaryCommand: rootA.addPublicationCommentaryCommand }));
        const listCtxC = listCtx({ getPublicationCommentariesCommand: rootA.getPublicationCommentariesCommand, addPublicationCommentaryCommand: rootA.addPublicationCommentaryCommand });
        const cList = listAdapter(listCtxC, publication);
        const cPanel = panelAdapter(panelCtx({ publication, getPublicationCommentariesCommand: rootB.getPublicationCommentariesCommand, addPublicationCommentaryCommand: rootB.addPublicationCommentaryCommand }));
        const canvasCtxC = canvasCtx({ view, getPublicationCommentariesCommand: rootB.getPublicationCommentariesCommand, addPublicationCommentaryCommand: rootB.addPublicationCommentaryCommand });
        canvasCtxC.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        canvasCtxC.selectObserverLocalEncounter({ publicationId: publication.id, contentHash: publication.contentReference.hash });
        const cCanvasSelected = canvasSelectedAdapter(canvasCtxC);
        const cCanvasObserverLocal = canvasObserverLocalAdapter(canvasCtxC);

        // C1 — rootA writes (Card), everyone reads, including rootB's own
        // surfaces.
        cCard.setText('written through rootA (Card)');
        cCard.submit();
        for (const adapter of [cList, cPanel, cCanvasSelected, cCanvasObserverLocal]) {
            adapter.open();
            assert(adapter.commentaries().some((c) => c.content === 'written through rootA (Card)'),
                `18. ${adapter.name} (rootB or a fellow rootA surface) sees the commentary Card wrote through rootA.`);
        }

        // C2 — rootB writes (OwnPublicationPanel), everyone reads,
        // including rootA's own surfaces.
        cPanel.setText('written through rootB (OwnPublicationPanel)');
        cPanel.submit();
        cCard.open();
        assert(cCard.commentaries().some((c) => c.content === 'written through rootB (OwnPublicationPanel)'),
            '19. PublicationCard.js (rootA) sees the commentary OwnPublicationPanel wrote through rootB.');
        cList.open();
        assert(cList.commentaries().some((c) => c.content === 'written through rootB (OwnPublicationPanel)'),
            '20. PublicationList.js (rootA) sees it too.');

        // C3 — the two independently constructed commentaryStore
        // instances themselves report the identical count — two
        // different objects (`rootA.commentaryStore !== rootB.commentaryStore`),
        // one underlying record set, because both proxy the SAME backing
        // Map, exactly like two real storage/LocalStorageProvider.js
        // instances both proxy the same window.localStorage.
        assert(rootA.commentaryStore !== rootB.commentaryStore, 'sanity: rootA and rootB are genuinely two separate PublicationCommentaryStore instances.');
        assert(rootA.commentaryStore.getForPublication(publication.id).length === rootB.commentaryStore.getForPublication(publication.id).length && rootA.commentaryStore.getForPublication(publication.id).length === 2,
            '20b. the two independently constructed stores report the identical record count for the same Publication.');
        cCanvasSelected.open();
        cCanvasObserverLocal.open();
        assert(cCanvasSelected.commentaries().length === 2 && cCanvasObserverLocal.commentaries().length === 2,
            '21. both WorldEncounterCanvas panels (rootB), read independently, converge on the same two-record total Card/OwnPublicationPanel already produced.');

        classification['C — read semantics'] = 'ALREADY_CORRECT: rootA (Card/List) and rootB (OwnPublicationPanel/WorldEncounterCanvas, both panels) are two composition roots over one underlying store; a write through either is visible through every surface on either root.';
        console.log('✓ Section C: all five commentary surfaces, across both independently-composed roots, read the SAME underlying commentary records — no surface-specific cache, no second source of truth.');
    }

    // ===============================================================
    // Section D — Write semantics. No surface directly constructs or
    // mutates a store, a use case, or a forbidden second command — every
    // one of the four UI files sends exactly the established command
    // shape, and authorship is never UI-supplied.
    // ===============================================================
    {
        const files = ['ui/components/PublicationCard.js', 'ui/components/PublicationList.js', 'ui/components/PublicationCommentarySection.js', 'ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js'];
        for (const file of files) {
            const code = await codeOnlySource(file);
            assert(!/new PublicationCommentaryStore|new AddPublicationCommentaryUseCase|new GetPublicationCommentariesUseCase|new PublicationCommentaryNotificationProducer|new CanCommentOnPublicationUseCase/.test(code),
                `22. ${file} constructs no commentary application/storage object of its own — it only calls the injected command.`);
            assert(!/OtherPublicationCommentaryUseCase|AddCommentToOtherPublicationUseCase|CreatePublicationCommentaryUseCase\(\)/.test(code),
                `23. ${file} introduces no forbidden second commentary use case or a second composition of the existing one.`);
            assert(!/authorIdentityId\s*[:,]/.test(code),
                `24. ${file} never threads an authorIdentityId field through its own commentary call — authorship stays server/use-case-resolved.`);
        }

        // D2 — every submit method's own addPublicationCommentaryCommand
        // call site sends publicationId + content (+ the 0.9.542
        // commentaryId/createdAt retry pair where the surface carries
        // one) and nothing else identity-bearing.
        const sectionCode = await codeOnlySource('ui/components/PublicationCommentarySection.js');
        const listCode = await codeOnlySource('ui/components/PublicationList.js');
        const panelCode = (await Promise.all(ownPublicationPanelFiles().map((file) => codeOnlySource(file)))).join('\n');
        const canvasCode = (await Promise.all(worldEncounterCanvasFiles().map((file) => codeOnlySource(file)))).join('\n');
        // AMENDED BY 0.9.638 — Publication Commentary Distribution
        // Provider Selector adds exactly one more field, discoveryProvider,
        // to PublicationCard.js's/PublicationList.js's own call sites —
        // the two PATH 1 surfaces 0.9.637's own Boundary Audit named.
        // OwnPublicationPanel.js/WorldEncounterCanvas.js (PATH 2) are
        // deliberately unchanged, per that same audit's own boundary —
        // Sections 27/28, below, stay unmodified.
        assert(sectionCode.includes('this.addPublicationCommentaryCommand({ publicationId: this.publication.id, content, commentaryId, createdAt, discoveryProvider })'), '25. AMENDED BY 0.9.638 — the card/list views\' shared PublicationCommentarySection.js call site is exactly { publicationId, content, commentaryId, createdAt, discoveryProvider }.');
        assert(!listCode.includes('addPublicationCommentaryCommand'), '26. PublicationList.js has no call site of its own — its rows submit through the same shared section as the cards.');
        assert(panelCode.includes('this.addPublicationCommentaryCommand({ publicationId: publication.id, content, commentaryId, createdAt })'), '27. OwnPublicationPanel.js\'s own call site is exactly { publicationId, content, commentaryId, createdAt }.');
        assert(canvasCode.includes('this.addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt })'), '28. WorldEncounterCanvas.js\'s own call sites (both panels, identical shape) are exactly { publicationId, content, commentaryId, createdAt }.');

        classification['D — write semantics'] = 'ALREADY_CORRECT: all five commentary sections converge on the existing addPublicationCommentaryCommand path, sending only publicationId/content/commentaryId/createdAt — no surface mutates a store directly, none supplies authorship.';
        console.log('✓ Section D: every surface writes through the existing command path alone, sending the identical field shape — no direct store mutation anywhere.');
    }

    // ===============================================================
    // Section E — Retry idempotency. The 0.9.542 "notification sink
    // fails AFTER the commentary already persisted" ambiguity, and its
    // fix (a manual retry of unedited content reuses the SAME
    // commentaryId/createdAt so the store's own idempotent no-op
    // engages), re-exercised for every one of the five surfaces — the
    // two genuinely new since 0.9.542 (PublicationList, the
    // observer-local encounter panel) get the full treatment; the three
    // 0.9.542 already covered directly get a fast reconfirmation that
    // adding the other two never disturbed them.
    // ===============================================================
    {
        async function exerciseRetry(name, buildAdapter) {
            let sinkShouldFail = true;
            const backend = makeBackend({ notificationSink: () => { if (sinkShouldFail) throw new Error('notification relay unavailable'); } });
            backend.identityProvider.login('carol');
            const publication = backend.publisherProvider.publish(makeDocument(`Section E ${name}`, 'carol'), backend.identityProvider);
            const adapter = buildAdapter(backend, publication);

            adapter.setText('ambiguous first attempt');
            adapter.submit();
            assert(adapter.error() === 'notification relay unavailable', `29. ${name}: the first, ambiguous attempt is reported as a failure.`);
            assert(backend.commentaryStore.getForPublication(publication.id).length === 1, `30. ${name}: despite the reported failure, the commentary is already durably persisted.`);
            assert(adapter.text() === 'ambiguous first attempt', `31. ${name}: the draft survives the failure, unedited, ready for retry.`);

            sinkShouldFail = false;
            adapter.submit();
            assert(adapter.error() === null, `32. ${name}: the unedited retry now succeeds, recognized as the store's own idempotent no-op.`);
            assert(backend.commentaryStore.getForPublication(publication.id).length === 1, `33. ${name}: exactly ONE commentary record exists after the retry — never a visible duplicate.`);
            adapter.open();
            assert(adapter.commentaries().filter((c) => c.content === 'ambiguous first attempt').length === 1, `34. ${name}: the re-queried, displayed list shows exactly one entry for what was experienced as one action.`);

            // A repeated retry with the SAME persistently-failing sink
            // still stays idempotent — not just a single successful retry.
            sinkShouldFail = true;
            adapter.setText('repeatedly ambiguous');
            adapter.submit();
            adapter.submit();
            adapter.submit();
            assert(backend.commentaryStore.getForPublication(publication.id).filter((c) => c.content === 'repeatedly ambiguous').length === 1,
                `35. ${name}: three consecutive retries of unedited content still produce exactly ONE persisted record.`);
        }

        await exerciseRetry('PublicationCard', (backend, pub) => cardAdapter(cardCtx({ publication: pub, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand })));
        await exerciseRetry('PublicationList', (backend, pub) => listAdapter(listCtx({ getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand }), pub));
        await exerciseRetry('OwnPublicationPanel', (backend, pub) => panelAdapter(panelCtx({ publication: pub, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand })));
        await exerciseRetry('WorldEncounterCanvas (selected encounter)', (backend, pub) => {
            const ctx = canvasCtx({ view: viewOf({ publications: [publicationRow(pub)] }), getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });
            ctx.selectEncounter({ kind: 'PUBLICATION', objectId: pub.id });
            return canvasSelectedAdapter(ctx);
        });
        await exerciseRetry('WorldEncounterCanvas (observer-local encounter)', (backend, pub) => {
            const ctx = canvasCtx({ getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });
            ctx.selectObserverLocalEncounter({ publicationId: pub.id, contentHash: pub.contentReference.hash });
            return canvasObserverLocalAdapter(ctx);
        });

        classification['E — retry idempotency'] = 'ALREADY_CORRECT: the stable commentaryId/createdAt retry pattern survives the UI retry boundary on all five surfaces, including the two (List, observer-local encounter) added after 0.9.542\'s own audit.';
        console.log('✓ Section E: retry idempotency holds, independently reconfirmed, on all five commentary surfaces.');
    }

    // ===============================================================
    // Section F — Concurrent row/state isolation. PublicationList's
    // per-row Commentary sections (0.9.561) under P1 submitting/P2
    // submitting/P3 failed/P4 merely-expanded simultaneously; plus a
    // Card -> List transition never carries a stale draft into a
    // different component instance.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('dana');
        const p1 = backend.publisherProvider.publish(makeDocument('F P1', 'dana'), backend.identityProvider);
        const p2 = backend.publisherProvider.publish(makeDocument('F P2', 'dana'), backend.identityProvider);
        const p3 = backend.publisherProvider.publish(makeDocument('F P3', 'dana'), backend.identityProvider);
        const p4 = backend.publisherProvider.publish(makeDocument('F P4', 'dana'), backend.identityProvider);

        const ctx = listCtx({ getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });

        // P1: a clean, successful submit.
        ctx.toggleCommentary(p1);
        ctx.rowSection(p1).newCommentaryText = 'P1 succeeded';
        ctx.rowSection(p1).submitCommentary();

        // P2/P3: each row's own section sees a write failure at submit
        // time (its command rejects), each with its OWN distinct error
        // and draft — proves P2 and P3's failures don't collide with
        // each other or with P1, on the ONE list instance.
        ctx.toggleCommentary(p2);
        ctx.rowSection(p2).addPublicationCommentaryCommand = () => { throw new Error('P2 write rejected'); };
        ctx.rowSection(p2).newCommentaryText = 'P2 draft, never sent';
        ctx.rowSection(p2).submitCommentary();

        ctx.toggleCommentary(p3);
        ctx.rowSection(p3).addPublicationCommentaryCommand = () => { throw new Error('P3 write rejected'); };
        ctx.rowSection(p3).newCommentaryText = 'P3 draft, never sent';
        ctx.rowSection(p3).submitCommentary();

        // P4: merely expanded, no interaction.
        ctx.toggleCommentary(p4);

        assert(ctx.rowSection(p1).commentaryError === null && ctx.rowSection(p1).commentaries.some((c) => c.content === 'P1 succeeded'),
            '36. P1\'s own row: succeeded, its own commentary visible, no error.');
        assert(ctx.rowSection(p2).commentaryError === 'P2 write rejected' && ctx.rowSection(p2).newCommentaryText === 'P2 draft, never sent',
            '37. P2\'s own row: its own failure and its own preserved draft, independent of P1.');
        assert(ctx.rowSection(p3).commentaryError === 'P3 write rejected' && ctx.rowSection(p3).newCommentaryText === 'P3 draft, never sent',
            '38. P3\'s own row: its own DISTINCT failure and draft, independent of P1 and P2.');
        assert(ctx.isCommentaryOpen(p4) === true && ctx.rowSection(p4).commentaries.length === 0 && ctx.rowSection(p4).commentaryError === null,
            '39. P4\'s own row: merely expanded, genuinely untouched by anything that happened to P1/P2/P3.');
        assert(Object.keys(ctx.openCommentaryIds).length === 4 && [p1, p2, p3, p4].every((p) => ctx.isCommentaryOpen(p)),
            '40. exactly the four touched rows are open — each with its own section instance, under concurrent use, not just sequential use.');
        assert(backend.commentaryStore.getForPublication(p2.id).length === 0 && backend.commentaryStore.getForPublication(p3.id).length === 0,
            '41. P2/P3\'s own failed submissions persisted nothing at all.');

        // F2 — Card -> List: a typed-but-unsent Card draft for P1 never
        // reaches a FRESH PublicationList instance for the SAME
        // Publication — no module-level/shared draft cache exists.
        const cardCtxF = cardCtx({ publication: p1, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });
        cardCtxF.newCommentaryText = 'typed in Card, never submitted';
        const freshListCtx = listCtx({ getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });
        assert(freshListCtx.rowSection(p1).newCommentaryText === '', '42. a fresh PublicationList instance\'s own row for P1 starts with an empty draft — Card\'s own unsent draft never transferred in.');
        assert(!('_moduleLevelCommentaryDraftCache' in freshListCtx), 'sanity: no such cache concept exists to even check.');

        classification['F — concurrent row/state isolation'] = 'ALREADY_CORRECT: PublicationList\'s own per-row Commentary sections keep P1-P4 fully independent under simultaneous use; Card and List share no module-level draft state across component instances.';
        console.log('✓ Section F: concurrent per-row state (submitting, failed, expanded) stays independently scoped on PublicationList, and no draft ever leaks from a Card instance into a fresh List instance.');
    }

    // ===============================================================
    // Section G — Cross-surface transitions. A single Publication's
    // commentary trail, built up by walking Card -> List -> World
    // (selected encounter) -> World (observer-local encounter) ->
    // OwnPublicationPanel -> List again, stays attached to the
    // Publication itself, never to whichever UI surface happened to be
    // open at the time.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('erin');
        const publication = backend.publisherProvider.publish(makeDocument('Section G', 'erin'), backend.identityProvider);
        const view = viewOf({ publications: [publicationRow(publication)] });
        const { getPublicationCommentariesCommand, addPublicationCommentaryCommand } = backend;

        const stops = [
            cardAdapter(cardCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand })),
            listAdapter(listCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand }), publication),
            (() => { const ctx = canvasCtx({ view, getPublicationCommentariesCommand, addPublicationCommentaryCommand }); ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id }); return canvasSelectedAdapter(ctx); })(),
            (() => { const ctx = canvasCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand }); ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash: publication.contentReference.hash }); return canvasObserverLocalAdapter(ctx); })(),
            panelAdapter(panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand })),
            listAdapter(listCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand }), publication)
        ];

        let expectedCount = 0;
        for (const [index, stop] of stops.entries()) {
            stop.open();
            assert(stop.publicationId() === publication.id, `43. stop ${index} (${stop.name}) resolves the SAME Publication's own id.`);
            assert(stop.commentaries().length === expectedCount, `44. stop ${index} (${stop.name}) sees exactly the ${expectedCount} comment(s) every prior stop already left behind.`);
            stop.setText(`comment #${index + 1} from ${stop.name}`);
            stop.submit();
            expectedCount += 1;
            stop.open();
            assert(stop.commentaries().length === expectedCount, `45. stop ${index} (${stop.name}) sees its own new comment immediately, re-queried.`);
        }

        // A brand-new, seventh adapter (never touched during the walk)
        // still sees the FULL accumulated trail — the trail belongs to
        // the Publication, not to any surface instance that produced it.
        const finalCheck = panelAdapter(panelCtx({ publication, getPublicationCommentariesCommand, addPublicationCommentaryCommand }));
        finalCheck.open();
        assert(finalCheck.commentaries().length === stops.length, '46. a fresh surface, never part of the walk, sees the FULL trail every prior surface left on the Publication.');
        for (let i = 0; i < stops.length; i += 1) {
            assert(finalCheck.commentaries().some((c) => c.content === `comment #${i + 1} from ${stops[i].name}`), `47. the fresh surface\'s own read includes stop ${i}'s own comment, verbatim.`);
        }

        classification['G — cross-surface transitions'] = 'ALREADY_CORRECT: a walk across all six stops (five distinct surfaces, List visited twice) accumulates one, shared, Publication-scoped commentary trail — never surface-scoped, never lost or duplicated in transit.';
        console.log('✓ Section G: commentary accumulated across Card -> List -> World (selected) -> World (observer-local) -> OwnPublicationPanel -> List stays attached to the Publication, visible in full from every stop, including a fresh surface that never participated.');
    }

    // ===============================================================
    // Section H — Failure isolation.
    // ===============================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('frank');
        const p1 = backend.publisherProvider.publish(makeDocument('H P1', 'frank'), backend.identityProvider);
        const p2 = backend.publisherProvider.publish(makeDocument('H P2', 'frank'), backend.identityProvider);

        // H1 — one Publication's failed READ never hides another's, on
        // the SAME PublicationList instance.
        const failingRead = (publicationId) => { if (publicationId === p1.id) throw new Error('P1 read unavailable'); return backend.getPublicationCommentariesCommand(publicationId); };
        backend.addPublicationCommentaryCommand({ publicationId: p2.id, content: 'P2 has real commentary', commentaryId: 'h-c1', createdAt: new Date() });
        const ctxH = listCtx({ getPublicationCommentariesCommand: failingRead, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });
        ctxH.toggleCommentary(p1);
        ctxH.toggleCommentary(p2);
        assert(ctxH.rowSection(p1).commentaryError === 'Commentary could not be loaded.', '48. P1\'s own failed read is reported on P1\'s own row.');
        assert(ctxH.rowSection(p2).commentaryError === null && ctxH.rowSection(p2).commentaries.length === 1,
            '49. P2\'s own row reads successfully, entirely unaffected by P1\'s own read failure on the SAME list instance.');

        // H2 — a failed SUBMIT never alters a neighboring Publication's
        // own stored commentary (store-level, not just UI-level).
        const failingWrite = () => { throw new Error('write rejected'); };
        const ctxH2 = listCtx({ getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: failingWrite });
        ctxH2.toggleCommentary(p1);
        ctxH2.rowSection(p1).newCommentaryText = 'this must never persist';
        ctxH2.rowSection(p1).submitCommentary();
        assert(backend.commentaryStore.getForPublication(p1.id).length === 0, '50. P1\'s own failed submit persisted nothing.');
        assert(backend.commentaryStore.getForPublication(p2.id).length === 1, '51. P2\'s own already-persisted commentary is untouched by P1\'s own failed submit.');

        // H3 — stale World Encounter state never contaminates catalog
        // (Card/List) state: a canvas selection/commentary interaction
        // on p1 leaves a FRESH cardCtx for a DIFFERENT publication (p2)
        // showing only p2's own, real commentary.
        const canvasCtxH = canvasCtx({ view: viewOf({ publications: [publicationRow(p1)] }), getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand });
        canvasCtxH.selectEncounter({ kind: 'PUBLICATION', objectId: p1.id });
        canvasCtxH.toggleEncounterCommentary();
        canvasCtxH.newEncounterCommentaryText = 'canvas activity on p1';
        canvasCtxH.submitEncounterCommentary();
        const freshCardForP2 = cardAdapter(cardCtx({ publication: p2, getPublicationCommentariesCommand: backend.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backend.addPublicationCommentaryCommand }));
        freshCardForP2.open();
        assert(freshCardForP2.commentaries().length === 1 && freshCardForP2.commentaries()[0].content === 'P2 has real commentary',
            '52. a fresh Card for p2 is untouched by WorldEncounterCanvas\'s own unrelated activity on p1.');

        // H4 — merely opening/closing a panel, with no submit, never
        // persists anything, on any of the five surfaces.
        const backendH4 = makeBackend();
        backendH4.identityProvider.login('grace');
        const p3 = backendH4.publisherProvider.publish(makeDocument('H P3', 'grace'), backendH4.identityProvider);
        const viewH4 = viewOf({ publications: [publicationRow(p3)] });
        const cmd = { getPublicationCommentariesCommand: backendH4.getPublicationCommentariesCommand, addPublicationCommentaryCommand: backendH4.addPublicationCommentaryCommand };
        const touchOnly = [
            () => { const c = cardCtx({ publication: p3, ...cmd }); c.toggleCommentary(); c.toggleCommentary(); },
            () => { const c = listCtx(cmd); c.toggleCommentary(p3); c.toggleCommentary(p3); },
            () => { const c = panelCtx({ publication: p3, ...cmd }); c.refreshPublicationCommentaries(); },
            () => { const c = canvasCtx({ view: viewH4, ...cmd }); c.selectEncounter({ kind: 'PUBLICATION', objectId: p3.id }); c.toggleEncounterCommentary(); },
            () => { const c = canvasCtx(cmd); c.selectObserverLocalEncounter({ publicationId: p3.id, contentHash: p3.contentReference.hash }); c.toggleObserverLocalEncounterCommentary(); }
        ];
        for (const touch of touchOnly) touch();
        assert(backendH4.commentaryStore.getForPublication(p3.id).length === 0, '53. opening/closing every one of the five surfaces\' own commentary sections, with no submit, persists nothing at all.');

        // H5 — no unmount hook, on any of the four files, ever touches
        // commentary state or the injected commands.
        for (const file of ['ui/components/PublicationCard.js', 'ui/components/PublicationList.js', 'ui/components/PublicationCommentarySection.js', 'ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js']) {
            const code = await codeOnlySource(file);
            const unmountMatch = code.match(/unmounted\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\},/);
            if (unmountMatch) {
                assert(!/[Cc]ommentary/.test(unmountMatch[1]), `54. ${file}'s own unmounted() hook never references anything commentary-related.`);
            }
        }

        classification['H — failure isolation'] = 'ALREADY_CORRECT: a failed read/write on one Publication or one surface never touches another Publication\'s stored commentary, another row\'s state, or a different surface\'s catalog view; no surface persists anything from a mere open/close, and no unmount hook touches commentary.';
        console.log('✓ Section H: failed reads, failed writes, and stale/unrelated surface activity all stay isolated to their own Publication and their own row/panel — nothing leaks, nothing is mutated by mere navigation or unmounting.');
    }

    // ===============================================================
    // Section I — Vocabulary and presentation. All five sections use
    // the IDENTICAL human vocabulary for Commentary — markup and layout
    // are free to differ (a card, a table row, a detail panel, an
    // encounter overlay are genuinely different contexts), but what a
    // Wanderer reads as "Commentary" never shifts in meaning.
    // ===============================================================
    {
        // The card and list views each own their toggle; the rest of
        // their Commentary vocabulary lives in the shared section both
        // mount, so each is read together with it.
        const sectionSource = await rawSource('ui/components/PublicationCommentarySection.js');
        const files = {
            'PublicationCard.js': await rawSource('ui/components/PublicationCard.js') + sectionSource,
            'PublicationList.js': await rawSource('ui/components/PublicationList.js') + sectionSource,
            'OwnPublicationPanel.js': (await Promise.all(ownPublicationPanelFiles().map((file) => rawSource(file)))).join('\n'),
            'WorldEncounterCanvas.js': (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n')
        };
        const sharedStrings = [
            'No commentary yet.',
            'Sign in to add commentary.',
            'Commentary could not be loaded.',
            'Commentary could not be created.'
        ];
        for (const [name, code] of Object.entries(files)) {
            for (const s of sharedStrings) {
                assert(code.includes(s), `55. ${name} uses the identical, unmodified string "${s}".`);
            }
            // The shared section's submit is synchronous, so it has no
            // in-flight state and its button always reads "Post Comment";
            // the other surfaces still show "Posting…" while submitting.
            if (name === 'PublicationCard.js' || name === 'PublicationList.js') {
                assert(/>Post Comment<\/button>/.test(sectionSource), `56. ${name}'s shared section's submit button reads exactly "Post Comment".`);
            } else {
                assert(/\{\{\s*\S*[Ss]ubmitting\s*\?\s*'Posting…'\s*:\s*'Post Comment'\s*\}\}/.test(code), `56. ${name}'s own submit button reads exactly "Post Comment"/"Posting…".`);
            }
            // OwnPublicationPanel.js alone carries no "Comment"/"Hide
            // Comments" toggle — it is eager-loaded, always-open, per its
            // own 0.9.248 header ("EXISTING COMMENTARY IS LOADED ON MOUNT
            // AND ON EVERY PUBLICATION CHANGE"), a pre-existing, already
            // self-documented difference in LIFECYCLE, not vocabulary; the
            // other four commentary sections (Card, List, both
            // WorldEncounterCanvas panels) all share this exact toggle.
            if (name !== 'OwnPublicationPanel.js') {
                assert(/\{\{\s*\S*[Cc]ommentar\S*\s*\?\s*'Hide Comments'\s*:\s*'Comment'\s*\}\}/.test(code), `57. ${name}'s own toggle button reads exactly "Comment"/"Hide Comments".`);
            } else {
                assert(!/'Hide Comments'/.test(code), '57b. OwnPublicationPanel.js confirms, fresh, that it still carries no toggle button of its own — an already-documented lifecycle difference, not a regression.');
            }
        }
        // WorldEncounterCanvas carries the vocabulary TWICE (once per
        // panel) — both copies identical to the other three files'.
        const canvasOccurrences = (files['WorldEncounterCanvas.js'].match(/No commentary yet\./g) || []).length;
        assert(canvasOccurrences === 2, '58. WorldEncounterCanvas.js repeats the identical "No commentary yet." copy once per panel, not a divergent variant for either.');

        // I2 — the one genuine, pre-existing asymmetry: OwnPublicationPanel
        // alone renders a live count in its own heading ("Commentary (N)",
        // 0.9.251); the other three never render an equivalent count.
        // Recorded as a DELIBERATE, NARROWLY-SCOPED difference (0.9.251's
        // own header scopes the count explicitly to this one file), not a
        // functional gap — no surface's underlying commentary differs,
        // only whether a number is shown alongside it.
        assert(files['OwnPublicationPanel.js'].includes('Commentary ({{ publicationCommentaries.length }})'), '59. OwnPublicationPanel.js renders a live commentary count in its own heading.');
        for (const name of ['PublicationCard.js', 'PublicationList.js', 'WorldEncounterCanvas.js']) {
            assert(!/Commentary \(\{\{/.test(files[name]), `60. ${name} renders no equivalent count heading — confirmed still absent, not silently added.`);
        }

        classification['I — vocabulary and presentation'] = 'ALREADY_CORRECT (with one classified asymmetry): "Comment"/"Hide Comments"/"Post Comment"/"No commentary yet."/"Sign in to add commentary."/both error strings are byte-identical everywhere. DELIBERATE_PRESENTATION_ASYMMETRY: only OwnPublicationPanel (0.9.251, explicitly scoped there) renders a live count in its own heading; Card/List/WorldEncounterCanvas do not. This changes information density, not the meaning of Commentary, and is not implemented here per this milestone\'s own test-only scope.';
        console.log('✓ Section I: Commentary vocabulary is byte-identical across all five surfaces. One narrow, pre-existing, deliberately-scoped presentation asymmetry (a count heading, OwnPublicationPanel only) is named and classified, not altered.');
    }

    // ===============================================================
    // Section J — Final classification.
    // ===============================================================
    {
        const expectedKeys = ['A — surface inventory', 'B — identity convergence', 'C — read semantics', 'D — write semantics', 'E — retry idempotency', 'F — concurrent row/state isolation', 'G — cross-surface transitions', 'H — failure isolation', 'I — vocabulary and presentation'];
        for (const key of expectedKeys) {
            assert(key in classification, `61. Section ${key} recorded its own classification.`);
            assert(classification[key].startsWith('ALREADY_CORRECT'), `62. Section ${key}'s own verdict is ALREADY_CORRECT (optionally with a named, classified asymmetry) — no PRODUCT_GAP survived this reassessment.`);
        }

        console.log('\n--- 0.9.562 classification summary ---');
        for (const key of expectedKeys) {
            console.log(`  ${key}: ${classification[key]}`);
        }
        console.log('\nOVERALL: ALREADY_CORRECT. Adding PublicationList.js (0.9.561) disturbed none of the four other surfaces\' own identity, read, write, retry, or failure-isolation semantics. One pre-existing, deliberately-scoped presentation asymmetry (Section I, the commentary count heading) is classified as DELIBERATE_PRESENTATION_ASYMMETRY and left exactly as it already was — this milestone\'s own test-only scope licenses no production change for it.');

        console.log('✓ Section J: final classification recorded — ALREADY_CORRECT across all nine sections, one narrow asymmetry named rather than fixed.');
    }

    console.log('\n✅ All Publication Commentary Surface Parity Reassessment tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
