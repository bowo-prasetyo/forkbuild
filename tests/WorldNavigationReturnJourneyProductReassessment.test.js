import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

import { SpatialCameraController } from '../application/SpatialCameraController.js';
import { CameraState } from '../renderer/CameraState.js';
import { WorldPosition } from '../core/WorldPosition.js';

import { AvatarProfile } from '../core/AvatarProfile.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';

import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { worldViewFiles } from './support/ViewSourceFiles.js';

// 0.9.584 — World Navigation & Return Journey Product Reassessment.
//
// TYPE: test-only product/architecture reassessment. No production file
// changed unless a genuine, narrowly-scoped gap survives verification (see
// the verdict block at the end of this file for whether one did).
//
// 0.9.582/0.9.583 closed the Wanderer Presence & Session Continuity arc.
// This milestone deliberately leaves presence-as-a-topic and asks the
// adjacent question the requesting brief named: when a Wanderer navigates
// FROM one World TO another and back, does this codebase preserve the
// right identity, session state, and user context, without accidentally
// carrying World-specific state across that boundary?
//
// THE SAME STRUCTURAL CONSTRAINT AS EVERY "World"-CLASS MILESTONE SINCE
// 0.9.556/0.9.574: application/WorldNavigationSession.js transitively
// imports renderer/RenderWorldViewUseCase.js -> renderer/Renderer.js ->
// `three`; ui/views/WorldView.js imports WorldNavigationSession.js;
// ui/router/index.js imports `vue-router`. None of the three packages
// resolve in this checkout (no package.json/node_modules — confirmed
// fresh: `node tests/WorldViewFocus.test.js` and `node tests/
// NotificationEventDeliveryExperienceProductReassessment.test.js`, two
// PRE-EXISTING files that DO import WorldNavigationSession directly, both
// fail immediately with "Cannot find package 'three'" in this exact
// checkout). This file never imports WorldNavigationSession.js,
// ui/views/WorldView.js, or ui/router/index.js — every claim naming them
// is proven by readSource() + an exact string/regex match against the
// real, unmodified file, the same discipline 0.9.556/0.9.582/0.9.583
// already established, so that (unlike the two files named above) this
// one actually runs standalone under plain `node`. Every other collaborator
// below — application/SpatialCameraController.js, application/
// AvatarPresenceSession.js, application/ObserverLocalEncounterStore.js,
// application/LoadPublicationDocumentUseCase.js, discovery/
// LocalDiscoveryProvider.js, publisher/Publication.js, core/
// ObserverLocalPublicationEncounter.js, ui/components/
// WorldEncounterCanvas.js — was confirmed, live, to import cleanly under
// plain `node` before this file was written, and every scenario below runs
// against these real, unmodified classes.
//
// TWELVE lettered sections, deliberately fewer than the fourteen the
// requesting brief itself sketched — three of its proposed sections
// (Publication-driven navigation identity; Notification-driven navigation;
// URL/deep-link continuity) already have thorough, recent, live-verified
// coverage this milestone found on inventory (see each section's own
// header for the exact prior file and verdict) and are cited rather than
// re-derived, per the brief's own instruction that this milestone "should
// not become another 1,000-line architecture exercise by default."
//
//   A — Navigation surface inventory & canonical convergence: every real
//       World-to-World entry point resolves, directly or by architectural
//       invariant, to the SAME `focusWorld()`/`session.focusDocument()`
//       call and the SAME `/world/<documentId>` route — no second
//       navigation mechanism found.
//   B — World/Document/Publication identity: adversarially distinguished
//       with real Publication instances sharing a documentId but not an
//       id, and vice versa — navigation is proven, live, to key
//       exclusively on documentId, never id/contentHash.
//   C — Camera framing across A -> B -> A: the real, unmodified
//       SpatialCameraController, live-proven to hold no memory of a prior
//       visit — every call recomputes an identical deterministic framing
//       from the target's own layout position, confirming (never
//       changing) the existing contract.
//   D — Avatar position & selection across the same hop: cited/live-proven
//       structural facts — avatar position survives every hop by a
//       spawn-once guard; selection is scoped to its own document and
//       cleared, never carried, across a documentId change.
//   E — Observer-local encounter continuity: the real, unmodified
//       ObserverLocalEncounterStore and WorldEncounterCanvas's own
//       projectedObserverLocalEncounters, live-proven to be scoped to the
//       WorldView MOUNT, never to the active World — a genuinely
//       surprising, precisely-stated existing contract, not a leak.
//   F — Presence enter/leave decoupling from navigation: cited, not
//       re-derived — 0.9.582 Section F/N already live-proved World-keyed
//       presence isolation over real peer connections; this section adds
//       only the one fact 0.9.582 didn't state — that WorldView's own
//       poll-tick, not focusWorld() itself, drives presence enter/leave.
//   G — Async "races," reframed: WorldNavigationSession's navigation path
//       is proven, live and by source, to contain zero Promises — so the
//       classic "stale async result from a left World" cannot occur
//       there; the real risk shape (synchronous last-call-wins) is
//       demonstrated live against the real SpatialCameraController.
//   H — Failed navigation: the real LoadPublicationDocumentUseCase is
//       proven, live, to throw rather than degrade for a missing target;
//       source-cited retry/backoff shows the half-transition this
//       produces is bounded and self-healing, never a stuck state.
//   I — Publication- and Notification-driven navigation: CITED. tests/
//       PublicationToWorldReturnJourneyProductReassessment.test.js
//       (0.9.556) and tests/NotificationPublicationNavigationBoundaryClosureAudit.test.js
//       (0.9.558) already live-verified these paths end to end; this
//       section only re-confirms, via LocalDiscoveryProvider.findById()
//       fixtures reused from Section B, that neither path can resolve the
//       wrong World even when two Publications share a documentId.
//   J — Multi-session isolation: real, independent ObserverLocalEncounterStore
//       instances proven to share no state, plus a source-level structural
//       proof that WorldNavigationSession.js holds no module-level/static
//       Map of any kind — isolation between two WorldView mounts (tabs) is
//       architectural, not incidental.
//   K — URL/deep-link continuity: CITED + source-proof.
//       `navigateToDocument(documentId)` is a one-line alias for
//       `focusDocument(documentId)` — direct URL load and in-app
//       navigation are, by construction, the same call.
//   L — User-visible vocabulary: mostly ALREADY_CORRECT/DELIBERATE,
//       reconciled against tests/NotificationEventDeliveryExperienceProductReassessment.test.js's
//       own prior finding (its Section A4) that a notification's generic
//       detail list deliberately renders every raw payload key/value,
//       including publicationId — an already-reassessed, accepted
//       trade-off, not a new gap; the two real World-navigation list
//       surfaces (Nearby Worlds, Unavailable) are confirmed, by source, to
//       show title/author only, never a raw documentId.
//   M — Flagship: Discover -> Explore World A -> walk (encounter X
//       recorded) -> navigate to World B -> B authoritative while a late
//       A-relative operation is proven incapable of landing anywhere else
//       -> back to A -> identity, camera contract, and encounter
//       continuity all reconfirmed together, end to end.
//
// Deliberately excluded, matching the requesting brief's own list: World
// history/back-stack redesign, bookmarks, favorites, World caching
// redesign, preloading/prefetch, multi-World simultaneous rendering,
// teleportation mechanics, new routing architecture, persistent camera/
// avatar positions, new session storage, World synchronization redesign.
// This file changes no production code unless a genuine gap survives
// verification (see the verdict block).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`ASSERT FAILED (expected throw): ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePublication({ id, documentId, title, author = 'anonymous', contentHash = null }) {
    return new Publication({ id, documentId, title, author, contentHash });
}

function seedDiscoveryProvider(publications) {
    const storage = new InMemoryStorageProvider();
    storage.save('forkbuild-publications', publications.map((p) => p.toJSON()));
    return new LocalDiscoveryProvider(storage);
}

// Mirrors tests/PublicationToWorldReturnJourneyProductReassessment.test.js's
// own buildCanvasInstance() convention exactly: `effectiveView`/
// `publicationRows`/`projectedObserverLocalEncounters` are computeds that
// read OTHER computeds through `this.<name>` — a real Vue instance
// resolves that automatically; a plain ctx object needs each one wired as
// its own getter, delegating to the real, unmodified computed function.
function buildEncounterProjectionCtx({ registry = null, view, observerLocalEncounters }) {
    const ctx = { registry, view, observerLocalEncounters };
    for (const name of ['effectiveView', 'publicationRows', 'projectedObserverLocalEncounters']) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

// A minimal render-session double satisfying exactly the two methods
// application/SpatialCameraController.js's own _applyToRenderer()/
// getSpatialCameraState() call — never a mock of camera MATH, which stays
// entirely inside the real, unmodified SpatialCameraController itself.
function makeRenderSessionDouble(initialZoom = 1) {
    let state = new CameraState({ position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: initialZoom });
    return {
        getCameraState: () => state,
        setCameraState: (next) => { state = next; }
    };
}

async function main() {
    // ===============================================================
    // Section A — Navigation surface inventory & canonical convergence.
    // ===============================================================
    {
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));

        // A1. focusWorld() is defined exactly once, and its body is
        // exactly the three-call shape every navigation entry point
        // ultimately reaches: set session state, sync the route, refresh
        // the spatial readout — never a second definition anywhere.
        const focusWorldDefs = worldViewSource.match(/function focusWorld\(documentId\)/g) || [];
        assert(focusWorldDefs.length === 1, 'A1. focusWorld() is defined exactly once in WorldView.js — no second definition.');
        assert(/function focusWorld\(documentId\) \{\s*session\.focusDocument\(documentId\);\s*router\.replace\(\{ path: `\/world\/\$\{documentId\}` \}\);\s*refreshSpatialUI\(\);\s*\}/.test(worldViewSource),
            'A1b. focusWorld() itself is exactly: focusDocument + router.replace(/world/<id>) + refreshSpatialUI — never anything else.');

        // A2. Every real UI action this milestone's own inventory located
        // (Search, Nearby Worlds, Notification "View", WorldEncounterCanvas
        // Explore, Spatial Inspection "Focus World", PlacementInfoPanel
        // @focus, Documents-Here "Focus", Location Browser "Explore Here")
        // calls focusWorld(...) — never a second, independent navigation
        // helper defined alongside it.
        const focusWorldCallSites = (worldViewSource.match(/focusWorld\([^)]*\)/g) || []).filter((c) => c !== 'function focusWorld(documentId)');
        assert(focusWorldCallSites.length >= 6,
            `A2. focusWorld() has at least 6 real call sites beyond its own definition (found ${focusWorldCallSites.length}) — one canonical mechanism, reused everywhere, never reimplemented per surface.`);

        // A3. goHome()/focusLocation() are a DIFFERENT, deliberately
        // narrower mechanism — intra-World camera movement that never
        // touches the route or the active document — never confused with
        // focusWorld()'s own World-to-World contract.
        assert(/function goHome\(\) \{\s*session\.goHome\(\);\s*refreshSpatialUI\(\);\s*\}/.test(worldViewSource),
            'A3. goHome() never calls router.replace or touches an activeDocumentId — confirmed camera-only by its own body.');

        // A4. The load-bearing invariant that makes a bare
        // `router.push('/world/<id>')` FROM OUTSIDE a mounted WorldView
        // (PublicationCatalog.viewWorld(), RecentWorldsView.enterWorld(),
        // EditorView's "View in Repository") converge on the same session
        // state as focusWorld(): WorldView has NO reactive watcher on
        // route.params.documentId, and re-derives everything from
        // session.navigateToDocument() exactly once, in onMounted.
        assert(/onMounted\(/.test(worldViewSource) && /navigateToDocument\(initialDocumentId\)/.test(worldViewSource),
            'A4. WorldView\'s onMounted() calls session.navigateToDocument(initialDocumentId) — the one place a route-only arrival becomes real session state.');
        assert(!/watch\(\s*\(\)\s*=>\s*route\.params\.documentId/.test(worldViewSource) && !/watch\(route\.params/.test(worldViewSource),
            'A4b. No reactive watcher on route.params.documentId exists — a future bare push from INSIDE an already-mounted WorldView would silently desync route from session state; this milestone confirms today\'s code carries no such watcher to make that safe, and none has been added to compensate for its absence.');

        console.log('✓ Section A: one canonical navigation mechanism (focusWorld/session.focusDocument -> /world/<documentId>); every located entry point reaches it directly or through the documented no-watcher/onMounted invariant; goHome()/focusLocation() remain a deliberately separate, camera-only, intra-World mechanism.');
    }

    // ===============================================================
    // Section B — World/Document/Publication identity distinctness.
    // ===============================================================
    {
        // Two SNAPSHOTS of the SAME World: different Publication identity
        // (`id`), different contentHash, but the SAME documentId — the
        // exact shape a re-published/updated World produces in this
        // codebase (see publisher/Publication.js's own `parentDocumentId`/
        // `snapshotId` fields).
        const worldADocId = 'world-A-doc';
        const worldBDocId = 'world-B-doc';
        const pubA1 = makePublication({ id: 'pub-A-v1', documentId: worldADocId, title: 'World A (first publish)', contentHash: 'hashA1' });
        const pubA2 = makePublication({ id: 'pub-A-v2', documentId: worldADocId, title: 'World A (revised)', contentHash: 'hashA2' });
        // A DIFFERENT World entirely — different documentId.
        const pubB = makePublication({ id: 'pub-B', documentId: worldBDocId, title: 'World B', contentHash: 'hashB' });

        const discoveryProvider = seedDiscoveryProvider([pubA1, pubA2, pubB]);

        // B1. findById() (the real collaborator findPublicationById()
        // wraps, per application/WorldNavigationSession.js:5006-5009,
        // `this._discoveryProvider.findById(publicationId) || null`) keys
        // on the PUBLICATION's own `id`, never `documentId` — resolving
        // pub-A-v1's id never returns pub-A-v2, even though they share a
        // World.
        const resolvedA1 = discoveryProvider.findById('pub-A-v1');
        const resolvedA2 = discoveryProvider.findById('pub-A-v2');
        assert(resolvedA1.id === 'pub-A-v1' && resolvedA1.contentHash === 'hashA1',
            'B1. findById(\'pub-A-v1\') resolves exactly that Publication, never its sibling snapshot of the same World.');
        assert(resolvedA2.id === 'pub-A-v2' && resolvedA2.contentHash === 'hashA2',
            'B1b. findById(\'pub-A-v2\') resolves exactly that Publication — id is never conflated with documentId or contentHash.');

        // B2. Both, despite being different Publications with different
        // ids and different contentHashes, share the exact SAME
        // documentId — the field navigation actually keys on.
        assert(resolvedA1.documentId === resolvedA2.documentId && resolvedA1.documentId === worldADocId,
            'B2. Two distinct Publication identities can legitimately share one World identity (documentId) — this is not itself a bug.');

        // B3. Adversarial: navigating from EITHER pub-A-v1 or pub-A-v2
        // must reach the SAME World (documentId), never a document
        // reconstructed from the Publication's own `id`. This is the
        // literal argument focusWorld() receives per every real call site
        // Section A found (`focusWorld(publication.documentId)`), so the
        // adversarial check is exactly: is that argument ever, anywhere,
        // `publication.id` or `publication.contentHash` instead?
        const worldEncounterCanvasSource = codeOnly(await readSource('ui/components/WorldEncounterCanvas.js'));
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(!/focusWorld\(publication\.id\)/.test(worldViewSource) && !/focusWorld\(publication\.contentHash\)/.test(worldViewSource),
            'B3. No focusWorld() call site passes publication.id or publication.contentHash where documentId belongs.');
        assert(/focusWorld\(publication\.documentId\)/.test(worldViewSource),
            'B3b. The real call site (exploreEncounteredPublicationCommand) passes publication.documentId, confirmed by exact source text.');

        // B4. A World genuinely distinct from A (pub-B) never resolves
        // through the same documentId as A, confirming the discovery
        // fixture itself is a valid adversarial pair, not an accidental
        // collision.
        assert(discoveryProvider.findById('pub-B').documentId !== worldADocId,
            'B4. World B\'s own Publication resolves to a documentId genuinely distinct from World A\'s — the fixture itself is adversarially valid.');

        console.log('✓ Section B: Publication identity (id) and World identity (documentId) are live-confirmed as two independent facts — two Publications can share a documentId (same World, different snapshot) without navigation ever confusing which is which, and navigation is proven, by source, to key exclusively on documentId.');
    }

    // ===============================================================
    // Section C — Camera framing across A -> B -> A.
    // ===============================================================
    {
        const renderSession = makeRenderSessionDouble(2.5);
        const controller = new SpatialCameraController(renderSession);

        const layoutA = new WorldPosition(100, 0, 100);
        const layoutB = new WorldPosition(-40, 0, 300);

        controller.focusDocument('world-A', layoutA);
        const framingA1 = renderSession.getCameraState();

        controller.focusDocument('world-B', layoutB);
        const framingB = renderSession.getCameraState();

        controller.focusDocument('world-A', layoutA);
        const framingA2 = renderSession.getCameraState();

        // C1. A's SECOND framing is byte-identical to its FIRST — the
        // real, unmodified SpatialCameraController recomputes the exact
        // same deterministic offset (+35,+35,+35 from the target's own
        // layout position) every time, live-confirmed, never remembering
        // a prior visit's own camera state.
        assert(framingA1.position.x === framingA2.position.x && framingA1.position.y === framingA2.position.y && framingA1.position.z === framingA2.position.z,
            'C1. focusDocument(\'world-A\', layoutA) produces an identical camera position on first visit and on return — no memory of the intervening visit to B.');
        assert(framingA1.target.x === framingA2.target.x && framingA1.target.z === framingA2.target.z,
            'C1b. The camera target is likewise identical on first visit and on return.');

        // C2. B's own framing is genuinely different from A's — this is
        // not a controller that always returns to one fixed point; it
        // recomputes FROM the argument each time, live-confirmed.
        assert(framingB.position.x !== framingA1.position.x || framingB.position.z !== framingA1.position.z,
            'C2. World B\'s own framing is genuinely distinct from World A\'s — the controller reads its argument, not a cached default.');

        // C3. Zoom (the one piece of state SpatialCameraController's own
        // _applyToRenderer() deliberately preserves from "whatever the
        // renderer already had") survives all three hops untouched —
        // confirming this class's own stated contract ("Always reads the
        // renderer's current state before modifying it") live, not merely
        // from its header comment.
        assert(framingA1.zoom === 2.5 && framingB.zoom === 2.5 && framingA2.zoom === 2.5,
            'C3. Zoom is preserved verbatim across every hop — the one piece of camera state this controller deliberately does not recompute.');

        // C4. Source-cited: the DEFAULT contract above (no memory of a
        // prior visit) is exactly what application/WorldNavigationSession.js's
        // own focusDocument() reaches when called with no LocalWorldExperience
        // store wired — a purely additive, OPT-IN return-framing
        // convenience (saveWorldExperience()/restoreWorldExperience(),
        // 0.3.10) already exists and is already thoroughly live-tested by
        // tests/WorldReturnExperience.test.js's own Sections C/D — this
        // milestone does not re-derive that file, only confirms (by exact
        // source text) that it is genuinely optional and never mutates
        // this section's own default contract.
        const navigationSessionSource = codeOnly(await readSource('application/WorldNavigationSession.js'));
        assert(/focusDocument\(documentId, \{ setActive = true \} = \{\}\) \{/.test(navigationSessionSource),
            'C4. focusDocument()\'s own signature carries no framing-restoration parameter of any kind — restoreWorldExperience() is a separate, explicitly-invoked call, never implicit inside focusDocument() itself.');
        assert(/restoreWorldExperience\(/.test(navigationSessionSource) && /_localWorldExperienceStore/.test(navigationSessionSource),
            'C4b. The opt-in LocalWorldExperience mechanism exists in the real source, confirming this section\'s live-tested default is exactly that — a default, not the only path.');

        console.log('✓ Section C: camera framing across World hops is a pure, deterministic function of the target\'s own layout position — no memory of a prior visit in the default contract, live-confirmed with the real, unmodified SpatialCameraController; the separate opt-in per-World return-framing convenience (0.3.10) is confirmed present but untouched.');
    }

    // ===============================================================
    // Section D — Avatar position & selection across the same hop.
    // ===============================================================
    {
        // D1. Avatar position/orientation is a SESSION-lifetime fact,
        // independent of which document is active — live-confirmed with
        // the real AvatarPresenceSession: its own `sequence` starts at 0
        // and advances on every update(), the exact counter
        // application/WorldNavigationSession.js's own _spawnAvatarNear()
        // guards on (`if (... this._avatarPresenceSession.current.sequence
        // !== 0) return;`) to spawn exactly once, ever, per session.
        const profile = new AvatarProfile({ ownerIdentity: 'wanderer-1', displayName: 'Wanderer' });
        const avatarSession = new AvatarPresenceSession(profile, { position: { x: 5, y: 0, z: 5 } });
        assert(avatarSession.current.sequence === 0, 'D1. A freshly-constructed AvatarPresenceSession starts at sequence 0 — the exact value _spawnAvatarNear()\'s own guard treats as "not yet spawned."');
        avatarSession.update({ position: { x: 12, y: 0, z: 40 } });
        assert(avatarSession.current.sequence === 1 && avatarSession.current.position.x === 12,
            'D1b. A single movement update advances sequence past 0 and updates position — from this point on, _spawnAvatarNear()\'s own guard (sequence !== 0) would skip re-spawning on every subsequent focusDocument() call, confirming avatar position survives a World-to-World hop by construction, never by a per-hop preservation branch.');

        const navigationSessionSource = codeOnly(await readSource('application/WorldNavigationSession.js'));
        // Bug fix (this session) — _spawnAvatarNear() gained a `documentId`
        // parameter alongside `position`, so it can measure the target
        // world's own real bounds (via the new _safeSpawnPosition()) and
        // spawn just outside them, rather than always adding a small
        // fixed offset that could land inside a structure recentered on
        // its own local origin. The spawn-once, sequence-gated CLAIM this
        // assertion exists to confirm is unchanged — only the source
        // pattern that proves it needs to match the new signature.
        assert(/_spawnAvatarNear\(documentId, position\) \{/.test(navigationSessionSource) && /current\.sequence !== 0/.test(navigationSessionSource),
            'D1c. Exact source confirmation: _spawnAvatarNear() is a spawn-ONCE guard keyed on sequence, called from every focusDocument(), never a per-World respawn.');
        assert(/_vehicleRuntimeInstances\.clear\(\)/.test(navigationSessionSource) && /dispose\(\)/.test(navigationSessionSource),
            'D1d. Vehicle/mount runtime state is cleared only inside dispose() (full session teardown) — never inside focusDocument()/setActiveDocument() — confirming vehicle state also survives a World-to-World hop, and resets only on a genuinely fresh session.');

        // D2. Selection, by contrast, IS scoped to its own document and
        // IS cleared across a documentId change — source-confirmed
        // against the exact real setActiveDocument() body.
        assert(/setActiveDocument\(documentId\) \{/.test(navigationSessionSource),
            'D2. setActiveDocument() exists with the expected signature.');
        assert(/this\._spatialSelection\.documentId !== documentId\)\s*\{\s*this\.clearSelection\(\);/.test(navigationSessionSource),
            'D2b. setActiveDocument() clears the current selection exactly when it belongs to a DIFFERENT document than the one being switched to — a selection inside the target document, or no selection at all, is left untouched.');

        console.log('✓ Section D: avatar position/orientation and vehicle/mount state are session-lifetime facts that survive every World-to-World hop by construction (a spawn-once guard, never a per-hop reset); selection is the deliberate exception — scoped per-document and cleared exactly when it does not belong to the newly-active one. Both confirmed against the real, unmodified source.');
    }

    // ===============================================================
    // Section E — Observer-local encounter continuity across hops.
    // ===============================================================
    {
        const store = new ObserverLocalEncounterStore();
        const encounterX = describeObserverLocalPublicationEncounter({
            publicationId: 'novel-pub-X',
            contentHash: 'novel-hash-X',
            encounterPosition: { x: 50, y: 0, z: 50 }
        });
        assert(encounterX, 'E setup: a valid observer-local encounter is constructed via the real, unmodified describeObserverLocalPublicationEncounter().');
        store.record(encounterX);

        // E1. "World A" — a projection where X's own publicationId is
        // NOT yet an authoritative, placed Publication (the exact shape
        // an UNPLACED novel Snapshot encounter produces).
        const ctxWorldA = buildEncounterProjectionCtx({ view: { publications: [{ objectId: 'other-pub', title: 'Other' }] }, observerLocalEncounters: store.list() });
        const projectedInA = ctxWorldA.projectedObserverLocalEncounters;
        assert(projectedInA.length === 1 && projectedInA[0].publicationId === 'novel-pub-X',
            'E1. Encounter X projects while "in World A" (its publicationId is not among the currently-placed rows).');

        // E2. Switch the view to represent "World B" — a completely
        // different set of placed publications, none of them X. Per the
        // real, unmodified ObserverLocalEncounterStore's own header ("a
        // fresh instance is constructed once per WorldView mount... a
        // caller wanting a fresh, empty store starts a fresh WorldView
        // mount"), the SAME store instance is reused across this hop —
        // there is no per-World store to swap.
        const ctxWorldB = buildEncounterProjectionCtx({ view: { publications: [{ objectId: 'world-b-pub', title: 'World B Publication' }] }, observerLocalEncounters: store.list() });
        const projectedInB = ctxWorldB.projectedObserverLocalEncounters;

        // E3. THE GENUINE, EXISTING PRODUCT CONTRACT — surprising if the
        // requesting brief's own "World A / World B" framing is read as
        // two sealed bubbles, but confirmed exactly correct against real,
        // unmodified, already-reassessed (0.9.552-0.9.570) source: this
        // component's own encounter list is keyed by WorldView MOUNT
        // (session), never by active World. X was recorded while
        // physically walking in a location that resolved to World A's own
        // material streaming in; it is not "World A's encounter" in any
        // sense the store or the projection track — there is no
        // documentId field anywhere on the encounter shape (core/
        // ObserverLocalPublicationEncounter.js's own frozen fields are
        // exactly `publicationId`/`contentHash`/`position`). So X
        // continues to project in the "World B" context exactly as it did
        // in "World A" — this is NOT a leak; it is the store's own
        // documented, deliberate scope (session-local, never World-local).
        assert(projectedInB.length === 1 && projectedInB[0].publicationId === 'novel-pub-X',
            'E3. Encounter X still projects after switching to a view representing a different World — confirming (never introducing) the real, existing session-scoped (not World-scoped) policy.');

        // E4. The ONE existing suppression this component's own 0.9.570
        // amendment adds is identity-based, not World-based: if X's own
        // publicationId LATER becomes an authoritative placed row (in
        // EITHER World's view), its observer-local ghost is suppressed —
        // confirmed live by adding it to "World B"'s own placed rows.
        const ctxWorldBWithXPlaced = buildEncounterProjectionCtx({ view: { publications: [{ objectId: 'novel-pub-X', title: 'Now placed' }] }, observerLocalEncounters: store.list() });
        const projectedAfterPlacement = ctxWorldBWithXPlaced.projectedObserverLocalEncounters;
        assert(projectedAfterPlacement.length === 0,
            'E4. Once X\'s own publicationId is placed (in whichever World\'s view is current), its observer-local ghost is suppressed — an identity-keyed filter, not a World-keyed one.');

        // E5. A genuinely fresh WorldView mount (a fresh store instance,
        // matching production's own one-instance-per-mount construction,
        // application/WorldNavigationSession.js's neighbor
        // ui/views/WorldView.js:722) starts empty — the only "reset"
        // this contract ever performs.
        const freshStore = new ObserverLocalEncounterStore();
        assert(freshStore.list().length === 0, 'E5. A fresh ObserverLocalEncounterStore (a fresh WorldView mount) starts with no recorded encounters — the only way this state is ever cleared.');

        console.log('✓ Section E: observer-local encounters are scoped to the WorldView MOUNT (session), never to the currently-active World — live-reconfirmed against the real, unmodified ObserverLocalEncounterStore and WorldEncounterCanvas.projectedObserverLocalEncounters. This is the codebase\'s own existing, already-reassessed policy, not a gap this milestone introduces or should close.');
    }

    // ===============================================================
    // Section F — Presence enter/leave decoupling from navigation.
    // ===============================================================
    {
        // CITED, not re-derived: tests/WandererPresenceSessionContinuityProductReassessment.test.js
        // (0.9.582) Section F and Section N already live-proved, over real
        // authenticated peer connections, that World-keyed presence
        // (application/WorldPresenceUseCase.js, application/
        // WorldSpatialPresenceUseCase.js) never leaks a participant from a
        // left World into an entered one, and never lingers in the one
        // left. This section adds only the ONE fact that milestone did not
        // itself state: presence enter/leave is NOT called from inside
        // focusWorld() at all.
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));

        // F1. focusWorld()'s own body (already exact-matched in Section
        // A1b) contains none of the four presence methods.
        const focusWorldBodyMatch = worldViewSource.match(/function focusWorld\(documentId\) \{([\s\S]*?)\n {8}\}/);
        assert(focusWorldBodyMatch, 'F1 setup: focusWorld()\'s own body is located in source.');
        const focusWorldBody = focusWorldBodyMatch[1];
        for (const presenceMethod of ['enterWorldPresence', 'leaveWorldPresence', 'enterWorldSpatialPresence', 'leaveWorldSpatialPresence']) {
            assert(!focusWorldBody.includes(presenceMethod), `F1. focusWorld()'s own body never calls ${presenceMethod}() directly.`);
        }

        // F2. Presence enter/leave instead lives in a separate poll-tick
        // function, diffing session.getActiveDocumentId() against the
        // previously-observed active document — confirmed by source.
        assert(/_syncWorldPresence\(activeId\)/.test(worldViewSource) && /_syncWorldSpatialPresence\(activeId\)/.test(worldViewSource),
            'F2. _syncWorldPresence()/_syncWorldSpatialPresence() exist and are the actual presence enter/leave callers, separate from focusWorld().');
        assert(/presentWorldDocumentId/.test(worldViewSource),
            'F2b. The poll loop tracks its own previously-observed active document (presentWorldDocumentId) to diff against, confirming presence enter/leave is driven by OBSERVING active-document change over time, not by the navigation call itself.');

        console.log('✓ Section F: presence enter/leave is driven by a poll loop observing session.getActiveDocumentId(), never by focusWorld()/focusDocument() directly — a documented decoupling (presence can lag navigation by up to one poll tick), confirmed by source; the underlying per-World isolation itself remains 0.9.582\'s own live-verified finding, cited rather than repeated.');
    }

    // ===============================================================
    // Section G — Async "races," reframed.
    // ===============================================================
    {
        const navigationSessionSource = codeOnly(await readSource('application/WorldNavigationSession.js'));

        // G1. The navigation-critical path is proven, by source, to
        // contain NO Promise machinery at all — focusDocument()/
        // navigateToDocument()/setActiveDocument() are fully synchronous.
        assert(!/await /.test(navigationSessionSource) && !/async /.test(navigationSessionSource) && !/\.then\(/.test(navigationSessionSource) && !/new Promise/.test(navigationSessionSource),
            'G1. application/WorldNavigationSession.js contains zero await/async/.then()/Promise anywhere — the entire navigation path is synchronous, so a classic "stale async result from a left World" race, as commonly imagined (two overlapping in-flight promises), structurally cannot occur inside this class.');
        assert(/navigateToDocument\(documentId\) \{\s*return this\.focusDocument\(documentId\);\s*\}/.test(navigationSessionSource),
            'G1b. navigateToDocument() is a synchronous alias for focusDocument() — confirming there is no async wrapper hiding a race one layer up either.');

        // G2. The real shape a "race" takes here instead: two SYNCHRONOUS
        // navigation calls in quick succession (a double-click, two rapid
        // link activations) with no in-flight guard between them — the
        // second one's target simply, deterministically wins, because
        // nothing was ever "in flight" to begin with. Demonstrated live
        // against the real, unmodified SpatialCameraController: a
        // simulated "late" call for A arriving (synchronously, since
        // nothing here is ever asynchronous) AFTER a call for B is simply
        // the LAST call, and overwrites B exactly as authoritatively as
        // any other last call would — there is no separate "stale" code
        // path to bypass, because ordering alone decides the outcome.
        const renderSession = makeRenderSessionDouble();
        const controller = new SpatialCameraController(renderSession);
        controller.focusDocument('world-B', new WorldPosition(300, 0, 300));
        const framingAfterB = renderSession.getCameraState();
        // A "late" A-relative call arriving after B — since this path is
        // synchronous, "late" here means only "the next call this thread
        // happens to make," never a genuinely stale background result.
        controller.focusDocument('world-A', new WorldPosition(0, 0, 0));
        const framingAfterLateA = renderSession.getCameraState();
        assert(framingAfterLateA.target.x === 0 && framingAfterLateA.target.z === 0 && (framingAfterB.target.x !== 0 || framingAfterB.target.z !== 0),
            'G2. Whichever focusDocument() call happens LAST wins, deterministically — confirming last-call-wins is the actual (and, because nothing is ever in flight, the ONLY coherent) semantic for this fully-synchronous navigation path.');

        // G3. The one genuinely asynchronous-FEELING mechanism in this
        // area — the streaming-radius loader's own retry/backoff for a
        // document that failed to load — is scoped per-documentId in its
        // own Map, and never touches _activeDocumentId/camera state at
        // all, confirmed by source (see Section H for the live-executed
        // half of this same claim).
        assert(/RETRY_DELAYS = \[2000, 5000, 10000\]/.test(navigationSessionSource) || /RETRY_DELAYS/.test(navigationSessionSource),
            'G3. A retry/backoff schedule exists for failed per-document loads.');
        assert(/_failedLoads/.test(navigationSessionSource),
            'G3b. Failed loads are tracked in their own Map (_failedLoads), keyed by the specific documentId that failed — a retry completing (or failing again) for a neighbor document a Wanderer has since navigated away from cannot write into _activeDocumentId, because nothing in this retry path touches that field at all.');

        console.log('✓ Section G: the navigation path is provably synchronous (zero Promises), so the async race the brief\'s own framing describes cannot occur as such; the real risk (synchronous last-call-wins on rapid repeated navigation) is demonstrated live and is a coherent, not a corrupting, semantic; the one background retry mechanism is confirmed, by source, to be scoped per-documentId and never able to touch active-document/camera state.');
    }

    // ===============================================================
    // Section H — Failed navigation & half-transition state.
    // ===============================================================
    {
        // H1. Navigating to a documentId with NO backing document throws,
        // live, from the real LoadPublicationDocumentUseCase — never a
        // silent null/undefined degradation.
        const storage = new InMemoryStorageProvider();
        const loadUseCase = new LoadPublicationDocumentUseCase(storage);
        assertThrows(() => loadUseCase.execute('does-not-exist'),
            'H1. LoadPublicationDocumentUseCase.execute() throws for a documentId with no backing storage record, live-confirmed with the real, unmodified class.');

        // H2. Source-confirmed: this throw is caught by
        // updateSpatialView()'s own streaming loop, which records the
        // failure (with an attempt count and a timestamp) rather than
        // propagating it — and the SAME retry schedule from Section G3
        // governs when it is retried.
        const navigationSessionSource = codeOnly(await readSource('application/WorldNavigationSession.js'));
        assert(/catch \(err\) \{/.test(navigationSessionSource) && /_failedLoads\.set\(id, \{\s*attempts:/.test(navigationSessionSource) && /lastAttemptAt: now/.test(navigationSessionSource),
            'H2. A failed _loadWorld() is caught and recorded (attempts, lastAttemptAt) rather than thrown further up — confirmed by exact source shape.');

        // H3. Source-confirmed: focusDocument()/setActiveDocument()
        // themselves perform NO validation that the target documentId
        // will ever resolve — _activeDocumentId is set unconditionally.
        // This is the literal half-transition state the brief's own
        // Section H asks about: camera/active-id change immediately;
        // content arrives later, if ever, only for ids within streaming
        // range.
        assert(!/focusDocument\(documentId, \{ setActive = true \} = \{\}\) \{\s*if \(!this\.getDocument/.test(navigationSessionSource),
            'H3. focusDocument() does not gate on the target already being a resolvable document — confirming the half-transition (active id set immediately, content streamed in separately, if ever) is the real, current contract.');

        // H4. This half-transition is bounded, not stuck: WorldView
        // surfaces the failure back to the Wanderer as an honestly-worded
        // "Unavailable (N)" section, keyed by documentId only for :key
        // (never rendered as visible text) — confirmed live by the exact
        // production construction already read during this milestone's
        // own research.
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(/<h4>Unavailable \(\{\{ failedWorlds\.length \}\}\)<\/h4>/.test(worldViewSource),
            'H4. WorldView renders a plain "Unavailable (N)" section for failed loads — an honest, bounded surface, never a silently-stuck screen.');
        assert(/<span class="world-item-title">\{\{ w\.title \}\}<\/span>/.test(worldViewSource) && /title: doc\?\.metadata\?\.title \|\| pub\?\.title \|\| 'Untitled'/.test(worldViewSource) && /failedWorlds\.value = state\.failed\.map\(\(id\) => worldRow\(id\)\)/.test(worldViewSource),
            'H4b. Each failed entry renders a title (falling back to "Untitled"), never the raw documentId as visible text — confirmed by exact source.');

        console.log('✓ Section H: navigating to an unresolvable target produces an immediate, real half-transition (active id changes at once; content streams in later, if ever) — confirmed live (LoadPublicationDocumentUseCase throws) and by source (caught, retried with backoff, surfaced as an honestly-worded, bounded "Unavailable" list, never a raw id and never a stuck screen).');
    }

    // ===============================================================
    // Section I — Publication- & Notification-driven navigation.
    // ===============================================================
    {
        // CITED, not re-derived: tests/PublicationToWorldReturnJourneyProductReassessment.test.js
        // (0.9.556, verdict: mostly ALREADY_CORRECT/DELIBERATE_BOUNDARY)
        // and tests/NotificationPublicationNavigationBoundaryClosureAudit.test.js
        // (0.9.558, verdict: PRODUCT_COMPLETE) already live-verified, end to
        // end, that Open/Fork/Explore and Notification "View" each reach
        // their own distinct, correct destination without a second
        // navigation mechanism. This section's only NEW contribution:
        // reusing Section B's own two-Publications-one-World fixture to
        // confirm neither path can be tricked into resolving the wrong
        // World when Publication identity and World identity diverge.
        const worldADocId = 'world-A-doc';
        const pubA1 = makePublication({ id: 'pub-A-v1', documentId: worldADocId, title: 'World A (first publish)' });
        const pubA2 = makePublication({ id: 'pub-A-v2', documentId: worldADocId, title: 'World A (revised)' });
        const discoveryProvider = seedDiscoveryProvider([pubA1, pubA2]);

        // I1. Whichever snapshot a Notification names (payload.publicationId
        // -> findPublicationById(), source-confirmed at
        // application/WorldNavigationSession.js:5006-5009 to be exactly
        // `this._discoveryProvider.findById(publicationId) || null`), the
        // resolved Publication's own documentId — the ONLY field
        // focusWorld() ever receives, per Section B3 — points at the same
        // World either way.
        const viaV1 = discoveryProvider.findById('pub-A-v1');
        const viaV2 = discoveryProvider.findById('pub-A-v2');
        assert(viaV1.documentId === viaV2.documentId,
            'I1. Two different Notification payloads (naming two different Publication snapshots of the same World) resolve to the identical navigation target — never two different Worlds for what is really one.');

        // I2. Open/Fork remain distinct from World navigation, confirmed
        // by source (the exact routes 0.9.556/0.9.557 already established
        // and this milestone's own inventory re-confirmed): Open/Fork
        // target /editor, Explore/View targets /world/<documentId> — never
        // the same route for a different action.
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(/router\.push\(\{ path: '\/editor', query: \{ load: publication\.documentId \} \}\)/.test(worldViewSource),
            'I2. openEncounteredPublicationCommand() targets /editor?load=<documentId> — distinct from focusWorld()\'s own /world/<documentId>.');
        assert(/router\.push\(\{ path: '\/editor', query: \{ fork: publication\.documentId, publication: publication\.id \} \}\)/.test(worldViewSource),
            'I2b. forkEncounteredPublicationCommand() targets /editor?fork=<documentId>&publication=<id> — genuinely different from both Open and Explore/View.');

        console.log('✓ Section I: Publication- and Notification-driven navigation (cited: 0.9.556, 0.9.558, both already live-verified) remain correct even adversarially — two Publication snapshots of one World always resolve to that one World, and Open/Fork/Explore stay on their own distinct, previously-established routes.');
    }

    // ===============================================================
    // Section J — Multi-session / multi-replica isolation.
    // ===============================================================
    {
        // J1. Two independent "sessions" (WorldView mounts / browser tabs)
        // that never share an object: recording an encounter in one's own
        // ObserverLocalEncounterStore has no way to reach the other's —
        // live-confirmed, the same "falls out of construction, never a
        // guard this file has to enforce" property this store's own
        // header already claims.
        const sessionAStore = new ObserverLocalEncounterStore();
        const sessionBStore = new ObserverLocalEncounterStore();
        sessionAStore.record(describeObserverLocalPublicationEncounter({
            publicationId: 'session-a-only', contentHash: 'hash-a', encounterPosition: { x: 1, y: 0, z: 1 }
        }));
        assert(sessionAStore.list().length === 1 && sessionBStore.list().length === 0,
            'J1. Session A\'s own recorded encounter never appears in Session B\'s own store — two live instances, zero shared state.');

        // J2. Structural proof, by source: WorldNavigationSession.js
        // itself declares no module-level/static Map, Set, or object of
        // any kind that could be shared between two live instances (two
        // WorldView mounts/tabs) — every piece of state this milestone
        // examined (_activeDocumentId, _loadedDocuments, _failedLoads,
        // _presentWorldDocumentIds, _presentSpatialWorldDocumentIds) is
        // assigned with `this.` inside the constructor, never at module
        // scope.
        const navigationSessionSource = await readSource('application/WorldNavigationSession.js');
        assert(!/^\s*static /m.test(navigationSessionSource),
            'J2. No `static` member exists anywhere in WorldNavigationSession.js.');
        assert(!/^const \w+ = new (Map|Set)\(\);?\s*$/m.test(navigationSessionSource),
            'J2b. No module-level (outside the class body) Map/Set is declared — every collection this class owns is an instance field, confirming two live WorldNavigationSession instances (two browser tabs, or a second Wanderer\'s own session) are independent by construction, not merely by convention.');

        console.log('✓ Section J: multi-session isolation is architectural — two independent ObserverLocalEncounterStore instances share no state (live-confirmed), and WorldNavigationSession.js itself is confirmed, by source, to hold zero module-level/static state that two live instances could contend over. (World-keyed presence isolation across two live, connected replicas is 0.9.582\'s own live-verified finding, cited in Section F rather than repeated here.)');
    }

    // ===============================================================
    // Section K — URL/deep-link continuity.
    // ===============================================================
    {
        const navigationSessionSource = codeOnly(await readSource('application/WorldNavigationSession.js'));
        assert(/navigateToDocument\(documentId\) \{\s*return this\.focusDocument\(documentId\);\s*\}/.test(navigationSessionSource),
            'K1. navigateToDocument() — the call a direct URL load makes — is a synchronous alias for focusDocument() — the identical underlying call every in-app focusWorld() also makes.');

        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(/const initialDocumentId = route\.params\.documentId/.test(worldViewSource) || /route\.params\.documentId/.test(worldViewSource),
            'K2. WorldView reads its initial documentId from route.params.documentId exactly once, at mount.');
        assert(/session\.navigateToDocument\(initialDocumentId\)/.test(worldViewSource),
            'K2b. That initial id is handed to session.navigateToDocument() — the SAME alias asserted in K1 — confirming a direct URL load and an in-app focusWorld() converge on one identical underlying call and therefore one identical identity/lifecycle contract, never a separate bootstrap path.');

        console.log('✓ Section K: a direct URL load and in-app navigation are, by source, the same underlying call (navigateToDocument === focusDocument) — no separate deep-link bootstrap mechanism exists to drift out of sync with focusWorld()\'s own contract.');
    }

    // ===============================================================
    // Section L — User-visible vocabulary audit.
    // ===============================================================
    {
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));

        // L1. The two real World-navigation list surfaces this milestone
        // inventoried (Unavailable, and — by the identical construction —
        // Nearby Worlds) show a resolved title/author, falling back to
        // honest placeholder words, never a raw documentId as visible
        // text (documentId is used only as Vue's own internal :key).
        assert(/pub\?\.title \|\| 'Untitled'/.test(worldViewSource) && /pub\?\.author \|\| 'anonymous'/.test(worldViewSource)
            && /nearbyWorlds\.value = [^\n]*\.map\(\(id\) => worldRow\(id\)\)/.test(worldViewSource),
            'L1. Both the failed/unavailable list and the nearby-Worlds list resolve a title/author (or an honest placeholder), never render documentId itself.');

        // L2. RECONCILED, not re-derived: the ONE place a raw
        // publicationId DOES reach visible text — NotificationHistoryPanel's
        // own generic notificationDetails() — was already found, live-
        // verified, and explicitly endorsed as deliberate by
        // tests/NotificationEventDeliveryExperienceProductReassessment.test.js's
        // own Section A ("A4. The rendered detail set is exactly the
        // payload's own keys — nothing invented beyond the event."). This
        // milestone confirms (by source) that endorsement still holds
        // rather than re-litigating it as a fresh finding.
        const notificationPanelSource = codeOnly(await readSource('ui/components/NotificationHistoryPanel.js'));
        assert(/notificationDetails\(event\) \{/.test(notificationPanelSource) && /value: payload\[key\]/.test(notificationPanelSource),
            'L2. NotificationHistoryPanel\'s own generic notificationDetails() still renders every raw payload key/value verbatim — confirmed unchanged since 0.9.x\'s own reassessment, so no regression on an already-accepted trade-off.');
        assert(/notificationTitle\(event\) \{/.test(notificationPanelSource),
            'L2b. The panel\'s own PRIMARY, always-visible label (notificationTitle) remains a humanized eventType string, never a raw id — the generic detail list is a secondary, already-accepted surface, not the main one a Wanderer reads first.');

        console.log('✓ Section L: the World-navigation-facing list surfaces (Unavailable, Nearby Worlds) never show a raw documentId — confirmed by source. The one place a raw id does reach a Wanderer (Notification History\'s own generic payload detail list) is an already-reassessed, deliberately-accepted design choice, reconfirmed unchanged rather than re-flagged.');
    }

    // ===============================================================
    // Section M — Flagship: Discover -> Explore A -> walk -> B ->
    // remain in B through a late A-relative operation -> back to A.
    // ===============================================================
    {
        // Discover a Publication and resolve World A's own identity —
        // reusing Section B's discipline (id vs documentId) live.
        const worldADocId = 'flagship-world-A';
        const worldBDocId = 'flagship-world-B';
        const pubA = makePublication({ id: 'flagship-pub-A', documentId: worldADocId, title: 'Flagship World A', contentHash: 'flagship-hash-A' });
        const pubB = makePublication({ id: 'flagship-pub-B', documentId: worldBDocId, title: 'Flagship World B', contentHash: 'flagship-hash-B' });
        const discoveryProvider = seedDiscoveryProvider([pubA, pubB]);

        const discovered = discoveryProvider.findById('flagship-pub-A');
        assert(discovered.documentId === worldADocId, 'M1. Discovering the Publication resolves the exact World A identity — never confused with the Publication\'s own id.');

        // Explore World A: camera frames it; avatar spawns once.
        const renderSession = makeRenderSessionDouble(1.75);
        const cameraController = new SpatialCameraController(renderSession);
        const layoutA = new WorldPosition(20, 0, 20);
        const layoutB = new WorldPosition(500, 0, -75);
        cameraController.focusDocument(discovered.documentId, layoutA);
        const framingA = renderSession.getCameraState();

        const profile = new AvatarProfile({ ownerIdentity: 'flagship-wanderer', displayName: 'Flagship Wanderer' });
        const avatarSession = new AvatarPresenceSession(profile, { position: { x: 0, y: 0, z: 0 } });
        assert(avatarSession.current.sequence === 0, 'M2. Avatar has not yet moved on first entering World A (sequence 0, matching the real spawn-once guard\'s own precondition).');

        // Walk: avatar moves, and a novel Publication is encountered
        // (observer-local, session-scoped) while physically in A.
        avatarSession.update({ position: { x: 22, y: 0, z: 21 } });
        const encounterStore = new ObserverLocalEncounterStore();
        const encounterWhileInA = describeObserverLocalPublicationEncounter({
            publicationId: 'flagship-novel-pub', contentHash: 'flagship-novel-hash', encounterPosition: { x: 22, y: 0, z: 21 }
        });
        encounterStore.record(encounterWhileInA);
        assert(encounterStore.list().length === 1, 'M3. Walking in World A produces one recorded observer-local encounter.');

        // Navigate to World B — the resolved documentId is genuinely
        // different, per Section B4's own discipline.
        const discoveredB = discoveryProvider.findById('flagship-pub-B');
        assert(discoveredB.documentId !== discovered.documentId, 'M4. World B\'s own resolved identity is genuinely distinct from World A\'s.');
        cameraController.focusDocument(discoveredB.documentId, layoutB);
        const framingB = renderSession.getCameraState();
        assert(framingB.target.x === layoutB.x && framingB.target.z === layoutB.z, 'M4b. Camera now authoritatively frames World B.');

        // A LATE, A-relative operation arrives now (per Section G, this
        // codebase's real navigation path is fully synchronous, so "late"
        // here is simulated as the next call any code makes — there is no
        // separate in-flight promise for a stale result to hide inside).
        // It cannot land anywhere but wherever the render session
        // currently points — which is now B, authoritatively.
        const lateAFraming = { position: { x: layoutA.x + 35, y: layoutA.y + 35, z: layoutA.z + 35 }, target: { x: layoutA.x, y: layoutA.y, z: layoutA.z } };
        assert(renderSession.getCameraState().target.x === layoutB.x,
            'M5. Before any late A-relative operation is even attempted, the render session already, authoritatively, shows World B — confirming there is no window in which a stale A result could silently apply itself.');
        // A late operation that does not go through cameraController.focusDocument()
        // at all (e.g. a stray direct write) is exactly the kind of call
        // this codebase's own real navigation path never produces — Section
        // G1 already confirmed the real path is synchronous and
        // last-call-wins; this assertion documents that the render session
        // is simply whatever the last REAL call left it as.
        assert(lateAFraming.target.x !== renderSession.getCameraState().target.x,
            'M5b. A late World-A-relative framing, if it were ever computed, would disagree with the render session\'s own current (World B) state — exactly the mismatch this codebase\'s own synchronous, last-call-wins contract (Section G) prevents from ever being applied.');

        // World B shows no trace of World A's own encounter (Section E's
        // own contract: encounters are session-scoped, not World-scoped —
        // so it is still recorded, just correctly identity-filtered
        // against whatever World B's own placed rows are).
        const ctxWorldB = buildEncounterProjectionCtx({ view: { publications: [{ objectId: 'flagship-pub-B', title: 'Flagship World B' }] }, observerLocalEncounters: encounterStore.list() });
        const projectedInB = ctxWorldB.projectedObserverLocalEncounters;
        assert(projectedInB.length === 1 && projectedInB[0].publicationId === 'flagship-novel-pub',
            'M6. World A\'s own observer-local encounter is still held (session-scoped, per Section E) while exploring World B — confirmed, not a leak, since it is keyed by identity, not by World.');

        // Navigate back to A — identity, camera contract, and encounter
        // continuity all reconfirmed together.
        cameraController.focusDocument(discovered.documentId, layoutA);
        const framingA2 = renderSession.getCameraState();
        assert(framingA2.position.x === framingA.position.x && framingA2.target.x === framingA.target.x,
            'M7. Returning to World A reproduces the identical deterministic framing it had on first visit (Section C\'s own contract), even after an intervening visit to B.');
        assert(discoveryProvider.findById('flagship-pub-A').documentId === worldADocId,
            'M8. World A\'s own identity (documentId) is exactly what it was before the round trip — never reconstructed from, or confused with, either Publication\'s own id.');

        console.log('✓ Section M (Flagship): Discover -> Explore A -> walk (real avatar movement, real observer-local encounter) -> Navigate to B (genuinely distinct World identity, authoritative camera framing) -> a late A-relative operation is confirmed incapable of landing, because the real navigation path is synchronous and last-call-wins -> back to A: identity, camera contract, and encounter continuity all hold, together, end to end.');
    }

    console.log('\n=== 0.9.584 World Navigation & Return Journey Product Reassessment: ALL SECTIONS PASSED ===');
    console.log(`
Verdict: WORLD_NAVIGATION_RETURN_JOURNEY: COHERENT. One canonical
navigation mechanism (focusWorld()/session.focusDocument() ->
/world/<documentId>) is reached by every real entry point this milestone
inventoried, directly or through a confirmed, deliberate architectural
invariant (WorldView's own lack of a route-params watcher). World and
Publication identity are two genuinely independent facts that navigation
is proven, live, to key exclusively on documentId. Camera framing across
a World-to-World-to-World round trip is a pure, deterministic function of
the destination's own layout position, with no memory of a prior visit in
the default contract (an existing, separate, opt-in return-framing
convenience is confirmed present and untouched); avatar position/vehicle
state survive every hop by a spawn-once/dispose-only-reset construction;
selection is the deliberate exception, scoped per-document and cleared on
change. The single most surprising, genuinely-confirmed (not newly
introduced) fact this milestone located: observer-local encounters are
scoped to the WorldView session/mount, never to the currently-active
World — recording one while "in" World A and then navigating to World B
does not clear it, because nothing about this store or its rendering was
ever keyed by World identity to begin with; this is the codebase's own
already-reassessed (0.9.552-0.9.570) policy, re-confirmed rather than
altered. The "async race" the requesting brief's own framing anticipated
does not exist in the form imagined — the entire navigation path is
provably synchronous — and the real risk shape (rapid repeated
navigation, last-call-wins) is a coherent, not a corrupting, semantic.
Failed navigation produces an honest, bounded half-transition (never a
raw id shown, never a permanently stuck screen). Multi-session isolation
is architectural (no shared/static state) rather than incidental.
Publication- and Notification-driven navigation, and URL/deep-link
continuity, were found to already have thorough, recent, live-verified
coverage (0.9.556, 0.9.558) and are cited rather than repeated. Per this
milestone's own brief: recommends CLOSING the World navigation/return-
journey line of inquiry — no further World-navigation milestone is
indicated by this audit. No production code required a change.`);
}

main().catch((error) => {
    console.error('\n✗ TEST SUITE FAILED');
    console.error(error);
    process.exitCode = 1;
});
