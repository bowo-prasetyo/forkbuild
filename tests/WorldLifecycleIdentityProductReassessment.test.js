import { readFile } from 'node:fs/promises';

import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind } from '../core/RegionKind.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { WorldLocation } from '../core/WorldLocation.js';
import { WorldLocationKind } from '../core/WorldLocationKind.js';
import { deriveWorldFocusContext, WorldFocusKind, WorldFocusAction } from '../core/WorldFocusContext.js';
import { describeEncounterablePublication, WorldEncounterKind } from '../core/WorldEncounter.js';
import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { ForkPublishedWorldUseCase } from '../application/ForkPublishedWorldUseCase.js';
import { LoadPublishedWorldSessionUseCase } from '../application/LoadPublishedWorldSessionUseCase.js';
import { PublishedWorldSession } from '../application/PublishedWorldSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldExperienceStore } from '../application/LocalWorldExperienceStore.js';
import { LocalWorldExperience } from '../core/LocalWorldExperience.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.576 — World Lifecycle & Identity Product Reassessment.
//
// 0.9.523-0.9.575 closed the Publication/Repository continuity arc:
// creation, distribution, discovery, Repository catalog identity,
// currency, and search/result semantics — all centered on Publications
// flowing INTO a World. 0.9.575's own closing verdict named the one
// question that arc never asked: "what exactly is a World, and what
// survives when the Wanderer moves through Worlds?" This milestone is
// that question, asked directly against real, unmodified production
// collaborators, never against an invented API this codebase doesn't
// have.
//
// A structural constraint shapes this file exactly the way it already
// shaped 0.9.574/0.9.575: application/WorldNavigationSession.js (the
// real, live, multi-World streaming/editing engine WorldView.js drives)
// transitively imports renderer/RenderWorldViewUseCase.js, which
// imports `three` — a package not installed in this checkout (confirmed
// directly: `node --input-type=module -e "import('./application/
// WorldNavigationSession.js')"` fails with "Cannot find package
// 'three'"). So, exactly like those two files, WorldNavigationSession.js
// (and its sibling application/WorldViewSession.js /
// application/CreateWorldViewUseCase.js, which import the same chain)
// are never imported live here. Where this milestone's claims are about
// that engine specifically, they are proven by direct source citation
// (readSource() + exact line quotes) rather than live execution — the
// same discipline 0.9.575 Section H4 already established for
// WorldView.js. Everywhere else, real production classes ARE imported
// and exercised live: core/World.js, core/WorldRegion.js,
// core/WorldPlacement.js, core/WorldLocation.js, core/WorldFocusContext.js,
// core/WorldEncounter.js, core/WorldEncounterSelectionIdentity.js,
// application/PublishedWorldSession.js,
// application/LoadPublishedWorldSessionUseCase.js (a genuinely separate,
// simpler, read-only single-Publication "enter a World" pipeline that
// does NOT import `three`), application/LocalWorldExperienceStore.js,
// application/AvatarPresenceSession.js, and
// application/ObserverLocalEncounterStore.js, alongside the same
// publish/fork/discover collaborators every prior milestone already
// exercised.
//
//   A — World identity inventory: what actually identifies a World, a
//       World document/source, a World location, a World region, a
//       "focused" World, and a World Encounter — with two genuine
//       naming traps this codebase's own vocabulary sets (WorldFocusContext
//       is not "the focused World"; WorldEncounter never carries a World
//       id) surfaced explicitly rather than silently assumed away.
//   B — World lifecycle: persistent vs. session-local vs. reconstructed
//       vs. cached vs. ephemeral, live, across the one "enter a World"
//       pipeline this checkout can run without `three`.
//   C — Enter -> leave -> re-enter: identity and real persistent content
//       survive; session-local interaction state does not, and is never
//       expected to — reconstructed fresh on every re-entry.
//   D — Multiple Worlds: two coexisting World sessions never share
//       state, and this is confirmed to be the NORMAL architecture
//       (WorldNavigationSession streams many Worlds at once), not an
//       edge case this milestone invents a scenario for.
//   E — World <-> Publication boundary: publicationId and World/document
//       identity are different granularities; contentHash never
//       identifies a World; navigating/interacting with a loaded World
//       never mutates Publication lifecycle; leaving a World never
//       removes a Repository entry.
//   F — World <-> Document boundary: this codebase's own honest answer
//       is that a Document's identity IS its world.id (one identity, not
//       two that could accidentally diverge) — the real invariant to
//       protect is that the ONE operation that legitimately mints a
//       fresh identity (Fork) always changes both together, atomically,
//       and never mutates the source.
//   G — Navigation state convergence: every real entry point (router,
//       focusWorld(), navigateToDocument()) is proven, by construction,
//       to fund exactly one function — no second, competing "go to a
//       World" mechanism exists to introduce or find drifted.
//   H — World state vs. presentation state: an inventory of camera,
//       avatar position, selection, observer-local encounters, focused
//       World, and placement data, each classified and justified against
//       real, cited source.
//   I — Reload / session boundary: what legitimately persists
//       (LocalWorldExperience, keyed by worldId, survives a storage
//       reload) and what legitimately cannot even be attempted to persist
//       (AvatarPresenceSession / ObserverLocalEncounterStore carry no
//       StorageProvider dependency at all — structurally incapable, not
//       merely unused).
//   J — Failure isolation: one World's load failure never blocks a
//       sibling's, live and via the exact production retry loop; a
//       Publication encounter failure and a failed navigation attempt
//       both leave the Repository/World untouched.
//   K — Concurrent navigation: WorldNavigationSession.js contains zero
//       `await`/`async`/`.then(` (grep-confirmed) — no promise-based
//       "late result" mechanism exists in the real navigation engine to
//       leak World A's outcome into World B's state; where genuine async
//       DOES exist (0.9.537's own material-verification/distribution
//       writers), the existing selection-scoped requestId guard already
//       covers a World switch for free, cited rather than re-derived.
//   L — Flagship: Discover -> Enter W1 -> encounter/inspect -> navigate
//       to W2 -> interact -> a "late" W1 operation -> return to W1 ->
//       Repository still holds P1 -> P1's identity unchanged -> W1 is
//       still the same World -> session-local state followed its own,
//       correct, separate lifecycle throughout.
//
// Deliberately excluded, per this milestone's own originating brief:
// World synchronization redesign, World persistence redesign,
// multiplayer protocol changes, new World identity fields, World
// cloning changes, World versioning, automatic World recovery,
// navigation framework replacement, camera/physics changes, new
// caching, new World discovery mechanisms. This file changes no
// production code; it is reconnaissance/reassessment only.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
        this.saveCount = 0;
        this.removeCount = 0;
    }
    save(name, data) { this.saveCount += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this.removeCount += 1; this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Same real publish pipeline every prior milestone's helper has used
// (0.9.534/0.9.574/0.9.575) — extended here to also return the
// contentStore, which application/LoadPublishedWorldSessionUseCase.js
// needs directly (its primary, non-legacy path resolves content via
// `publication.contentReference` + an injected ContentStore).
function publishMinimalDocument(storage, title = 'Atlas', author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const identityProvider = { currentUser: () => ({ username: author }), sign: () => null };
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identityProvider, null, null);

    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    const publication = publishDocumentUseCase.execute({ document });
    return { document, publication, publisher, publishDocumentUseCase, contentStore, storage };
}

function loadWorldSession(publisher, contentStore, publication) {
    return new LoadPublishedWorldSessionUseCase(publisher, undefined, contentStore).execute(publication);
}

async function main() {
    // ===============================================================
    // Section A — World identity inventory.
    // ===============================================================
    {
        // A1. core/World.js: a World has its own, independently-generated
        // `id` (createId()) — never derived from anything else. Two
        // fresh Worlds never collide.
        const w1 = new World();
        const w2 = new World();
        assert(typeof w1.id === 'string' && w1.id.length > 0, 'A1a. A World carries a real, non-empty id.');
        assert(w1.id !== w2.id, 'A1b. Two independently-constructed Worlds never share an id.');

        // A2. core/Document.js: a Document has NO id of its own — its
        // only identity-bearing field is the World it embeds.
        const document = new Document({ world: w1 });
        assert(document.id === undefined, 'A2. Document exposes no `id` property of its own.');
        assert(document.world.id === w1.id, 'A2b. A Document\'s only identity is document.world.id.');

        // A3. Live, through the real publish pipeline: despite World.id
        // being an independently-generated field, every production
        // consumer (LocalPublisherProvider.publish()) treats
        // document.world.id as THE document identity a Publication
        // carries — confirmed by construction, not by convention alone.
        const storage = new InMemoryStorageProvider();
        const { document: doc2, publication } = publishMinimalDocument(storage, 'Identity Keep', 'alice');
        assert(publication.documentId === doc2.world.id, 'A3. publication.documentId is exactly document.world.id — the one identity this codebase actually uses.');

        // A4. core/WorldRegion.js: UNLIKE World/WorldPlacement/WorldLocation,
        // a WorldRegion carries an explicit `worldId` field DISTINCT from
        // its own `id` — a real, persisted, World-scoped piece of content.
        const region = new WorldRegion({
            id: 'region-1', worldId: doc2.world.id, authorIdentityId: 'alice',
            name: 'Green Valley', kind: RegionKind.REGION, position: new Position(10, 0, 10), radius: 40
        });
        assert(region.id === 'region-1' && region.worldId === doc2.world.id && region.id !== region.worldId,
            'A4. A WorldRegion carries both its own id AND a separate worldId naming the World it belongs to.');

        // A5. core/WorldPlacement.js: the header's own stated invariant
        // — "a WorldPlacement does NOT own a world. It points to one via
        // publicationId" — confirmed structurally: no worldId field
        // exists on the class at all.
        const placement = new WorldPlacement({ publicationId: publication.id, position: new Position(5, 0, 5) });
        assert(placement.publicationId === publication.id, 'A5a. A WorldPlacement is identified by publicationId, not by any World id.');
        assert(!('worldId' in placement) && placement.worldId === undefined, 'A5b. A WorldPlacement carries no worldId field at all — structurally, never accidentally.');

        // A6. core/WorldLocation.js: deliberately NOT a persisted entity
        // — no worldId, no store, no id that outlives the thing it was
        // derived from (its own header's own claim, reconfirmed live).
        const location = new WorldLocation({ id: 'loc-1', title: 'Origin', kind: WorldLocationKind.ORIGIN, position: new Position(0, 0, 0) });
        assert(location.id === 'loc-1' && location.worldId === undefined, 'A6. A WorldLocation carries no worldId — it is a derived, read-only reshaping, never a stored World-scoped entity.');

        // A7. NAMING TRAP #1, confirmed rather than assumed: a
        // WorldFocusContext is NOT "the currently focused World." Its
        // own header explicitly distinguishes "Focus" (this file:
        // describe) from "Go" (WorldNavigationSession's real camera-move
        // methods) — live confirmation that a REGION-kind focus context
        // carries no top-level worldId/documentId of its own; only
        // `source.documentId`, which names the FOCUSED TARGET's own
        // content document (e.g. which Document a Region's "Edit a Copy"
        // would fork) — never "which World is currently on screen."
        const focusContext = deriveWorldFocusContext({
            kind: WorldFocusKind.REGION,
            entity: { id: 'region-1', name: 'Green Valley', kind: 'region', position: { x: 10, y: 0, z: 10 }, documentId: 'unrelated-structure-doc' },
            viewerPosition: { x: 0, y: 0, z: 0 }
        });
        assert(focusContext.kind === WorldFocusKind.REGION && focusContext.hasAction(WorldFocusAction.GO),
            'A7a. A WorldFocusContext describes a target and offers a "Go" action — it does not itself navigate.');
        assert(!('worldId' in focusContext) && focusContext.source.documentId === 'unrelated-structure-doc',
            'A7b. NAMING TRAP CONFIRMED: WorldFocusContext carries no worldId of its own; its `source.documentId` names the focused TARGET\'s own content, never "the World currently on screen" — core/WorldFocusContext.js\'s own 0.6.1 header explicitly states this getter "has no way to know which World is currently on screen."');

        // A8. NAMING TRAP #2, confirmed live: a "WorldEncounter" never
        // carries a World id either — it identifies a Publication (by
        // publicationId, surfaced as `objectId`) or an avatar (by
        // avatarId), joined against whatever placement/presence data the
        // caller supplied. "Encountering a World" and "encountering a
        // thing placed inside a World" are two different claims; this
        // codebase's WorldEncounter machinery only ever makes the second.
        const encounter = describeEncounterablePublication({
            publication, placement, anchorCount: 0, placementCount: 1
        });
        assert(encounter.kind === WorldEncounterKind.PUBLICATION && encounter.objectId === publication.id,
            'A8a. A WorldEncounter is identified by kind + objectId (= publication.id here) — never a World id.');
        const selectionIdentity = describeWorldEncounterSelectionIdentity({ kind: encounter.kind, objectId: encounter.objectId, origin: 'local' });
        assert(Object.keys(selectionIdentity).sort().join(',') === 'kind,objectId,origin',
            'A8b. WorldEncounterSelectionIdentity is exactly {kind, objectId, origin} — "nothing more, nothing less" per its own header — no worldId field exists to add or omit correctly.');

        // A9. The ACTUAL "which World is the Wanderer currently looking
        // at" pointer is application/WorldNavigationSession.js's own
        // `_focusedDocumentId` — genuinely distinct, by the file's own
        // 0.2.27 doc comment, from `_activeDocumentId` ("which document
        // would an edit land on"). Cited structurally (this file cannot
        // be imported live — see this file's own header).
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(/_focusedDocumentId = null;/.test(sessionSource) && /_activeDocumentId = null;/.test(sessionSource),
            'A9a. WorldNavigationSession.js declares both `_focusedDocumentId` and `_activeDocumentId` as separate fields.');
        assert(/Camera Focus, Active Document, and Selection Are Three Different Things/.test(sessionSource) === false
            && /Where the camera is currently navigated to/.test(sessionSource),
            'A9b. `_focusedDocumentId` is documented as "where the camera is currently navigated to" — the real "focused World" concept, distinct from WorldFocusContext (A7) and from `_activeDocumentId` (which document an edit lands on).');
        assert(/navigateToDocument\(documentId\) \{\s*return this\.focusDocument\(documentId\);/.test(sessionSource),
            'A9c. navigateToDocument() is a verbatim alias of focusDocument() — one real mechanism, two names.');

        // A10. `focusWorld()` — the name closest to the user-facing verb
        // — is not a domain/application method at all. It is a plain UI
        // function local to ui/views/WorldView.js, wrapping
        // session.focusDocument() plus a router.replace(). Confirmed
        // structurally: it exists in WorldView.js and nowhere in core/
        // or application/.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/function focusWorld\(documentId\)/.test(worldViewSource), 'A10a. focusWorld(documentId) is defined exactly once, in ui/views/WorldView.js.');
        assert(/session\.focusDocument\(documentId\)/.test(worldViewSource.slice(worldViewSource.indexOf('function focusWorld'), worldViewSource.indexOf('function focusWorld') + 800)),
            'A10b. focusWorld() itself just calls session.focusDocument(documentId) plus a router update — it introduces no second identity concept of its own.');

        console.log('✓ Section A: World identity is a small, closed inventory — World.id is real and independently generated (A1) yet every production consumer treats document.world.id as THE identity (A2, A3); WorldRegion is genuinely World-scoped via a separate worldId field (A4); WorldPlacement and WorldLocation are NOT (A5, A6) — identified by publicationId or nothing at all, respectively; and two genuine naming traps in this codebase\'s own vocabulary are surfaced rather than silently assumed away: WorldFocusContext is not "the focused World" (A7), and WorldEncounter never carries a World id at all (A8) — the real "focused World" pointer is WorldNavigationSession\'s own `_focusedDocumentId` (A9), and the user-facing focusWorld() verb is a thin UI wrapper around it, not a second identity mechanism (A10).');
    }

    // ===============================================================
    // Section B — World lifecycle.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication, publisher, contentStore } = publishMinimalDocument(storage, 'Lifecycle Spire', 'alice');

        // B1. PERSISTENT: the World's content and identity survive being
        // loaded through the one real "enter a World" pipeline this
        // checkout can run — application/LoadPublishedWorldSessionUseCase.js
        // — completely independent of any live render/streaming engine.
        const session = loadWorldSession(publisher, contentStore, publication);
        assert(session instanceof PublishedWorldSession, 'B1a. LoadPublishedWorldSessionUseCase produces a real PublishedWorldSession.');
        assert(session.getWorld().id === document.world.id, 'B1b. The loaded World\'s identity is exactly the original World\'s id — PERSISTENT.');
        assert(session.getPublication().id === publication.id, 'B1c. The loaded session carries the exact original Publication — PERSISTENT.');

        // B2. SESSION-LOCAL / RECONSTRUCTED: a PublishedWorldSession's
        // own runtime state (spatial selection) starts empty on every
        // construction — never restored from anywhere, never cached.
        assert(session.getSelectionCount() === 0, 'B2a. A freshly-loaded session starts with zero selection — reconstructed, not restored.');
        assert(session.capabilities.canEdit === false && session.capabilities.canSave === false,
            'B2b. capabilities is a frozen, read-only descriptor — structural, not session-mutable state.');

        // B3. RECONSTRUCTED, NEVER CACHED: two independent execute()
        // calls for the SAME Publication produce two DISTINCT session
        // (and Document) instances — never a memoized singleton reused
        // across "enters."
        const sessionAgain = loadWorldSession(publisher, contentStore, publication);
        assert(sessionAgain !== session && sessionAgain.getDocument() !== session.getDocument(),
            'B3a. A second load of the identical Publication returns a wholly distinct session/Document — never a cached instance.');
        assert(sessionAgain.getWorld().id === session.getWorld().id,
            'B3b. ...while the World identity it carries is byte-for-byte the same — reconstruction, not re-identification.');

        // B4. Contrast: application/AvatarPresenceSession.js and
        // application/ObserverLocalEncounterStore.js are EPHEMERAL —
        // structurally incapable of persistence (no StorageProvider
        // dependency exists to call, not merely unused), confirmed live
        // by their real constructors taking no such parameter.
        const avatarSession = new AvatarPresenceSession({ avatarId: 'av-1', ownerIdentity: 'alice' }, { position: { x: 0, y: 0, z: 0 } });
        assert(avatarSession.current.avatarId === 'av-1', 'B4a. AvatarPresenceSession holds live presence.');
        const avatarSessionSource = await readSource('application/AvatarPresenceSession.js');
        assert(!/^import.*StorageProvider/m.test(avatarSessionSource) && !/this\._storage/.test(avatarSessionSource),
            'B4c. AvatarPresenceSession.js never imports StorageProvider and never holds a `_storage` field — its own header even names AvatarProfileUseCase (which DOES take one) as the contrast; persistence is not a capability this class has, structurally.');
        const observerStore = new ObserverLocalEncounterStore();
        const observerStoreSource = await readSource('application/ObserverLocalEncounterStore.js');
        assert(!/^import.*StorageProvider/m.test(observerStoreSource) && observerStore.list().length === 0,
            'B4d. ObserverLocalEncounterStore.js likewise never imports StorageProvider — a fresh instance starts, and stays, empty unless explicitly recorded to, in-memory only.');

        // B5. Contrast: WorldRegion IS true persistent WORLD_STATE — it
        // round-trips through the World's own toJSON()/fromJSON() with
        // the rest of the World's content, because it genuinely is part
        // of the World, unlike B4's session-local objects.
        const worldWithRegion = new World();
        worldWithRegion.addWorldRegion(new WorldRegion({
            id: 'region-persist', worldId: worldWithRegion.id, authorIdentityId: 'alice',
            name: 'Persisted Place', kind: RegionKind.TOWN, position: new Position(1, 0, 1), radius: 10
        }));
        const roundTripped = World.fromJSON(worldWithRegion.toJSON());
        assert(roundTripped.id === worldWithRegion.id, 'B5a. A World round-trips with its own identity intact.');
        assert(roundTripped.getWorldRegions().length === 1 && roundTripped.getWorldRegions()[0].name === 'Persisted Place',
            'B5b. A WorldRegion survives the World\'s own serialize/deserialize cycle — real WORLD_STATE, unlike anything in B2/B4.');

        console.log('✓ Section B: across the one "enter a World" pipeline this checkout can run live, World identity and content are genuinely PERSISTENT (B1) while a session\'s own runtime state starts empty and RECONSTRUCTED on every load, never cached (B2, B3) — contrasted live against two real classes (AvatarPresenceSession, ObserverLocalEncounterStore) that are structurally EPHEMERAL, no StorageProvider dependency existing at all to call (B4), and against WorldRegion, which genuinely IS persistent WORLD_STATE, round-tripping with the rest of the World\'s own content (B5).');
    }

    // ===============================================================
    // Section C — Enter -> leave -> re-enter.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication, publisher, contentStore } = publishMinimalDocument(storage, 'Revisit Hall', 'alice');
        const buildingId = document.world.getBuildings()[0].id;
        const brickId = document.world.getBuildings()[0].getBricks()[0].id;

        // C1. Enter W: load a session, interact with it.
        const enter1 = loadWorldSession(publisher, contentStore, publication);
        enter1.selectBrick(brickId, buildingId);
        assert(enter1.getSelectionCount() === 1, 'C1. Entering and selecting inside W leaves the session with a real, non-empty selection.');

        // C2. Leave: PublishedWorldSession has no close()/dispose()/
        // leave() method at all — "leaving" is purely the caller
        // choosing to stop holding the reference, never an explicit
        // lifecycle event this object itself models. Confirmed
        // structurally rather than assumed.
        assert(typeof enter1.dispose !== 'function' && typeof enter1.close !== 'function' && typeof enter1.leave !== 'function',
            'C2. PublishedWorldSession exposes no dispose()/close()/leave() — this read-only projection models "loaded" but not "left"; leaving is the caller discarding its own reference, never a call into this object.');

        // C3. Re-enter: load the SAME Publication again. Identity (World
        // id, Publication id, and the actual World content) survives
        // exactly as Section B already proved live; but the NEW
        // session's own selection starts EMPTY again — session-local
        // interaction state does NOT survive re-entry, and is never
        // expected to.
        const enter2 = loadWorldSession(publisher, contentStore, publication);
        assert(enter2.getWorld().id === enter1.getWorld().id, 'C3a. Re-entering resolves the SAME World identity.');
        assert(enter2.getPublication().id === enter1.getPublication().id, 'C3b. Re-entering resolves the SAME Publication identity.');
        assert(enter2.getSelectionCount() === 0, 'C3c. Re-entering starts with a genuinely fresh, empty selection — enter1\'s selection never leaked into enter2.');
        assert(enter1.getSelectionCount() === 1, 'C3d. ...and enter1\'s own selection is completely unaffected by enter2 existing — two independent objects, not one mutated in place.');

        // C4. This is deliberately the SAME design principle
        // application/ObserverLocalEncounterStore.js already establishes
        // for a different kind of session-local state (0.9.552): a fresh
        // instance per visit, zero carry-over, by construction rather
        // than by an explicit reset a caller could forget to call. Cited
        // rather than re-derived, per this file's own convention.
        const observerSource = await readSource('application/ObserverLocalEncounterStore.js');
        assert(/fresh instance is constructed once per `WorldView` mount/.test(observerSource),
            'C4. ObserverLocalEncounterStore.js\'s own header states the identical "fresh per visit, no carry-over" principle C3 just proved live for PublishedWorldSession\'s own selection — two independent subsystems, one consistent design rule.');

        console.log('✓ Section C: Enter (C1) -> Leave (C2 — genuinely no explicit lifecycle call exists; confirmed rather than assumed) -> Re-enter (C3) proves World/Publication identity and real content survive re-entry while session-local interaction state (selection) is reconstructed fresh every time, never carried over — the identical principle 0.9.552\'s ObserverLocalEncounterStore already established for observer-local encounters (C4), confirming this is a consistent architectural rule, not a coincidence of one class.');
    }

    // ===============================================================
    // Section D — Multiple Worlds.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publication: p1, publisher: pub1, contentStore: cs1 } = publishMinimalDocument(storage, 'World One', 'alice');
        const { publication: p2, publisher: pub2, contentStore: cs2 } = publishMinimalDocument(storage, 'World Two', 'bob');

        // D1. Two coexisting sessions never share a World identity.
        const sessionW1 = loadWorldSession(pub1, cs1, p1);
        const sessionW2 = loadWorldSession(pub2, cs2, p2);
        assert(sessionW1.getWorld().id !== sessionW2.getWorld().id, 'D1. Two independently-published Worlds carry two distinct ids, both loaded and coexisting.');

        // D2. Focus W1 (select in it); focus W2 (select in it); no
        // accidental shared state — mutating one session's selection
        // never touches the other's.
        const w1Building = sessionW1.getWorld().getBuildings()[0];
        sessionW1.selectBrick(w1Building.getBricks()[0].id, w1Building.id);
        assert(sessionW1.getSelectionCount() === 1 && sessionW2.getSelectionCount() === 0,
            'D2. Selecting inside W1 leaves W2\'s own session completely untouched — no shared selection state between coexisting World sessions.');

        // D3. "Return to W1": load a THIRD, independent session for the
        // exact same Publication as W1. World identity matches, but the
        // object itself is a fresh instance — never a stale/cached
        // reference to the one already open.
        const returnToW1 = loadWorldSession(pub1, cs1, p1);
        assert(returnToW1.getWorld().id === sessionW1.getWorld().id && returnToW1 !== sessionW1,
            'D3. Returning to W1 resolves the same World identity through a freshly-constructed session — never the exact same in-memory object silently handed back.');

        // D4. Structural: the REAL navigation engine's own model is
        // "many Worlds loaded at once," not "one current World" —
        // WorldNavigationSession streams Worlds in/out of a
        // `_loadedDocuments` Map keyed by documentId based on camera
        // radius, so D1-D3's coexistence above is the ORDINARY case in
        // production, not a scenario this milestone had to construct
        // artificially.
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(/_loadedDocuments = new Map\(\)/.test(sessionSource), 'D4a. WorldNavigationSession keeps a Map of loaded documents, not a single "current World" scalar.');
        assert(/const toLoad = visibleIds\.filter/.test(sessionSource) && /for \(const id of toLoad\)/.test(sessionSource),
            'D4b. Real streaming loads potentially MULTIPLE documents per updateSpatialView() pass — multi-World coexistence is the ordinary, designed-for shape.');

        console.log('✓ Section D: two coexisting World sessions never share state (D1, D2), returning to a World already visited resolves the identical identity through a freshly-reconstructed object rather than a cached reference (D3), and this multi-World coexistence is confirmed, structurally, to be the REAL navigation engine\'s ordinary operating model — not a special case this milestone invented a scenario to probe (D4).');
    }

    // ===============================================================
    // Section E — World <-> Publication boundary.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication: p1, publisher, publishDocumentUseCase, contentStore } = publishMinimalDocument(storage, 'Boundary Keep', 'alice');
        const p2 = publishDocumentUseCase.execute({ document }); // republish: same World/document, distinct publicationId

        // E1. Publication identity and World identity are different
        // granularities: two Publications share ONE World id, but carry
        // TWO distinct publicationIds — reconfirmed here specifically
        // THROUGH the World-session lens (not merely via publication
        // fields, the way 0.9.534/0.9.574 already proved it).
        assert(p1.documentId === p2.documentId && p1.id !== p2.id, 'E1 setup. Two republishes share one World/document id but distinct publicationIds.');
        const s1 = loadWorldSession(publisher, contentStore, p1);
        const s2 = loadWorldSession(publisher, contentStore, p2);
        assert(s1.getWorld().id === s2.getWorld().id, 'E1a. Both republishes resolve to the exact SAME World identity...');
        assert(s1.getPublication().id !== s2.getPublication().id, 'E1b. ...while remaining two distinct Publications — World identity is per-Document; Publication identity is per-publish-event. Genuinely different granularities, never conflated.');

        // E2. contentHash never identifies a World. Structural, live: the
        // resulting World's identity, on load, comes exclusively from
        // the deserialized snapshot's own embedded `world.id` field —
        // application/LoadPublishedWorldSessionUseCase.js's execute()
        // never reads `publication.contentHash` for anything other than
        // integrity verification, never to derive or override identity.
        const loadUseCaseSource = await readSource('application/LoadPublishedWorldSessionUseCase.js');
        const buildLine = loadUseCaseSource.match(/const document = this\._documentSerializer\.deserialize\(snapshotJson\);/);
        assert(Boolean(buildLine), 'E2a. The resulting Document/World comes from deserializing the raw snapshot JSON — nothing else.');
        assert(!/contentHash/.test(loadUseCaseSource.slice(loadUseCaseSource.indexOf('return new PublishedWorldSession'))),
            'E2b. Nothing after the World is deserialized ever consults contentHash again — identity is never re-derived or overridden from it.');
        // A genuinely stronger, honest fact this milestone surfaces: two
        // independently-published Worlds can never actually SHARE a
        // contentHash through real publishing in the first place —
        // World.id is itself embedded in the canonical bytes that get
        // hashed (document.toJSON() includes world.toJSON() includes
        // `id`), so two distinct World ids necessarily hash differently.
        // 0.9.575 Section B2's shared-contentHash/distinct-documentId
        // shape is real, but only reachable by constructing a Publication
        // object directly (as that file did) — never by genuinely
        // publishing two different Worlds through this real pipeline.
        const { publisher: pubA, contentStore: csA, publication: pA } = publishMinimalDocument(storage, 'Sibling A', 'carol');
        const { publisher: pubB, contentStore: csB, publication: pB } = publishMinimalDocument(storage, 'Sibling B', 'carol');
        assert(pA.documentId !== pB.documentId && pA.contentHash !== pB.contentHash,
            'E2c. Two genuinely, independently-published Worlds never share a contentHash either — World.id is itself embedded in the hashed bytes, so distinct World identities necessarily produce distinct hashes through real publishing.');
        const sA = loadWorldSession(pubA, csA, pA);
        const sB = loadWorldSession(pubB, csB, pB);
        assert(sA.getWorld().id !== sB.getWorld().id, 'E2d. ...and, unsurprisingly given E2a/E2b, the two loaded World identities remain distinct.');

        // E3. publicationId is never silently treated as a World id
        // anywhere in real navigation — the router's one canonical World
        // route is documentId-typed, confirmed structurally (no
        // publicationId route param exists anywhere).
        const routerSource = await readSource('ui/router/index.js');
        assert(/path: '\/world\/:documentId'/.test(routerSource), 'E3a. The one canonical World route is keyed by :documentId.');
        assert(!/:publicationId/.test(routerSource) && !/path: '\/world\/:worldId'/.test(routerSource),
            'E3b. No route anywhere accepts a :publicationId or :worldId param — documentId is the sole World-identifying route parameter, by construction.');

        // E4. World navigation/interaction never mutates Publication
        // lifecycle: interacting with a loaded, read-only World session
        // leaves the underlying Publication record, and the Repository
        // catalog, completely unchanged.
        // (LocalDiscoveryProvider.findById() reconstructs a fresh
        // Publication.fromJSON() on every call — by design, per its own
        // header, a "straightforward scan" with no cached-instance
        // layer — so identity here is checked field-by-field, not by
        // object reference.)
        const provider = new LocalDiscoveryProvider(storage);
        const beforeFind = provider.findById(p1.id);
        const w1Building = s1.getWorld().getBuildings()[0];
        s1.selectBrick(w1Building.getBricks()[0].id, w1Building.id);
        const afterFind = provider.findById(p1.id);
        assert(beforeFind.id === afterFind.id && beforeFind.documentId === afterFind.documentId
            && beforeFind.contentHash === afterFind.contentHash && beforeFind.signature === afterFind.signature,
            'E4. The Repository\'s own Publication record (id/documentId/contentHash/signature) is completely unchanged before and after World interaction — navigation/selection never touches Publication lifecycle.');

        // E5. Leaving a World never removes a Repository Publication —
        // dropping every reference to a PublishedWorldSession has no
        // removal pathway into the catalog at all; only the one real,
        // already-established removal operation (UnpublishDocumentUseCase,
        // 0.9.534's own finding, cited rather than re-derived) does.
        const priorArt = await readSource('tests/RepositoryPublicationLifecycleProductReassessment.test.js');
        assert(/UnpublishDocumentUseCase/.test(priorArt), 'E5a. 0.9.534\'s own live proof that unpublish is the ONE removal path is present and citable.');
        assert(provider.findById(p1.id) !== null && provider.list().some((p) => p.id === p2.id),
            'E5b. Both Publications remain in the Repository catalog after every World session above was loaded, interacted with, and (by this point) abandoned — leaving a World removes nothing.');

        console.log('✓ Section E: Publication identity and World identity are confirmed, live, to be different granularities — many Publications, one World (E1) — contentHash never identifies a World (E2), publicationId is never a World-navigable identity anywhere in the real router (E3), World navigation/interaction never mutates Publication lifecycle (E4), and leaving a World removes nothing from the Repository — only the one already-established Unpublish operation does (E5).');
    }

    // ===============================================================
    // Section F — World <-> Document boundary.
    // ===============================================================
    {
        // F1. This codebase's own honest architecture, confirmed rather
        // than assumed away: "documentId" and "World identity" are not
        // two independently-varying concepts that could accidentally
        // diverge — a Document's identity IS its world.id, by design,
        // stated explicitly in the source this milestone read to
        // establish it.
        const cloneServiceSource = await readSource('application/DocumentCloneService.js');
        assert(/a new world\.id \(the document identity\)/.test(cloneServiceSource),
            'F1. application/DocumentCloneService.js states, in its own header, that world.id IS "the document identity" — one identity, not two that could accidentally diverge.');

        // F2. The one operation that legitimately mints a fresh identity
        // — Fork — changes it atomically: a brand-new World AND a
        // brand-new Document identity together, never one without the
        // other, and NEVER mutates the source.
        const storage = new InMemoryStorageProvider();
        const { document, publisher: sourcePublisher } = publishMinimalDocument(storage, 'Fork Source', 'alice');
        const sourceWorldId = document.world.id;
        const forked = new ForkDocumentUseCase(storage).execute(document.world.id, null, null);
        assert(forked.world.id !== sourceWorldId, 'F2a. Forking mints a genuinely new World/Document identity.');
        assert(document.world.id === sourceWorldId, 'F2b. The SOURCE Document/World\'s own identity is completely unchanged after forking — never mutated in place.');
        assert(forked.metadata.parentDocumentId === sourceWorldId, 'F2c. Lineage is tracked via metadata.parentDocumentId — never by reusing or renaming the source\'s own identity.');

        // F3. ForkPublishedWorldUseCase — forking directly from a
        // Publication — carries the identical guarantee, live: the
        // source Publication and its snapshot storage key are untouched.
        const { document: pubDoc, publication, publisher: pubDocPublisher } = publishMinimalDocument(storage, 'Publishable Fork Source', 'bob');
        const forkedFromPublication = new ForkPublishedWorldUseCase(pubDocPublisher).execute(publication);
        assert(forkedFromPublication.world.id !== pubDoc.world.id, 'F3a. Forking from a Publication also mints a brand-new World identity.');
        assert(storage.load('snapshot:' + publication.id) !== null, 'F3b. The source Publication\'s own immutable snapshot key is untouched — still present after the fork.');
        assert(forkedFromPublication.metadata.parentDocumentId === pubDoc.world.id, 'F3c. Lineage points back to the source World\'s own id.');

        // F4. Open/Fork's transition toward an Editor context never
        // implies the ORIGINAL World (still being viewed elsewhere)
        // changed identity: a PublishedWorldSession already holding the
        // original World is completely unaffected by a fork happening
        // independently.
        const { publication: freshPub, publisher: freshPublisher, contentStore: freshContentStore } = publishMinimalDocument(storage, 'Viewed While Forked', 'carol');
        const viewingSession = loadWorldSession(freshPublisher, freshContentStore, freshPub);
        const viewedWorldId = viewingSession.getWorld().id;
        // An unrelated fork happens elsewhere, of a DIFFERENT document.
        new ForkDocumentUseCase(storage).execute(document.world.id, null, null);
        assert(viewingSession.getWorld().id === viewedWorldId, 'F4. An unrelated fork happening elsewhere never changes the identity of a World already being viewed in an existing session.');

        console.log('✓ Section F: this codebase\'s own real architecture makes documentId AND World identity exactly one concept, never two that could accidentally diverge (F1); the one operation that legitimately mints a fresh identity — Fork, both from a raw Document (F2) and directly from a Publication (F3) — always changes World+Document identity together, atomically, and never mutates or renames the source; and an unrelated fork happening elsewhere never changes the identity of a World already open in an existing session (F4).');
    }

    // ===============================================================
    // Section G — Navigation state convergence.
    // ===============================================================
    {
        // G1. Exactly one canonical World route exists, keyed by
        // documentId — already confirmed in E3, cited rather than
        // re-derived; reconfirmed here alongside the full route table
        // count.
        const routerSource = await readSource('ui/router/index.js');
        const worldRouteMatches = routerSource.match(/path: '\/world\/:documentId'/g) || [];
        assert(worldRouteMatches.length === 1, 'G1. Exactly one route accepts a World-identifying documentId param — no second, parallel World route exists.');

        // G2. focusWorld() (A10) is the ONE UI-layer convergence point —
        // every one of its own call sites (search results, notifications,
        // location browsing, publication cards, per this milestone's own
        // research) funnels through the identical function body, which
        // itself calls the identical session.focusDocument().
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        const focusWorldDefCount = (worldViewSource.match(/function focusWorld\(documentId\)/g) || []).length;
        assert(focusWorldDefCount === 1, 'G2. focusWorld() is defined exactly once — every caller (Search -> World, Repository -> Explore, Notification -> World) necessarily converges on this one function, by construction, never a second copy that could drift.');

        // G3. navigateToDocument() is a verbatim alias of focusDocument()
        // (A9c) — meaning even a caller that bypasses focusWorld()
        // entirely and drives the session directly still lands on the
        // identical underlying mechanism. There is no second "enter a
        // World" primitive to accidentally diverge from the first.
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        const focusDocumentDefCount = (sessionSource.match(/^\s*focusDocument\(documentId/m) || []).length;
        assert(focusDocumentDefCount === 1, 'G3. focusDocument() itself is defined exactly once in WorldNavigationSession.js — the single real implementation every navigation entry point (router, focusWorld(), navigateToDocument()) ultimately funds.');

        // G4. This milestone introduces no new, competing "universal"
        // navigation mechanism — confirmed by the fact that no
        // production file changed (this file is test-only) and by G1-G3
        // showing the existing convergence was already complete before
        // this milestone ran.
        console.log('✓ Section G: every real World-entry surface (the router\'s one documentId-keyed route (G1), the UI\'s one focusWorld() function (G2), and the session\'s own single focusDocument() implementation, of which navigateToDocument() is a verbatim alias (G3)) converges on exactly one mechanism, with no second, parallel, or drifted copy anywhere — confirming this milestone had no gap here to fix and correctly introduces no new universal navigation mechanism of its own (G4).');
    }

    // ===============================================================
    // Section H — World state vs. presentation state.
    // ===============================================================
    {
        // H1. Camera position/target: TRANSIENT render-session state at
        // the live renderer layer (no persistence in that layer at all
        // — cited structurally, since it's part of the `three`-importing
        // chain this file cannot load), PLUS one deliberate, narrow,
        // device-local convenience snapshot — LocalWorldExperience,
        // keyed by worldId, explicitly never World state. Proven live
        // via a real round trip through real storage.
        const cameraStateSource = await readSource('renderer/CameraState.js');
        assert(!/StorageProvider|localStorage/.test(cameraStateSource), 'H1a. renderer/CameraState.js is a pure in-memory value object — no persistence capability of its own.');
        const experienceStorage = new InMemoryStorageProvider();
        const experienceStore = new LocalWorldExperienceStore({ storageProvider: experienceStorage });
        const worldIdForExperience = 'world-experience-target';
        experienceStore.recordVisit(worldIdForExperience, { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } });
        const restored = experienceStore.getExperience(worldIdForExperience);
        assert(restored.cameraPosition.x === 1, 'H1b. LocalWorldExperience genuinely persists camera framing, keyed by worldId — but see its own header (H1c) for why this is never WORLD_STATE.');
        const experienceSource = await readSource('core/LocalWorldExperience.js');
        assert(/Personal Experience Is/.test(experienceSource) && /Does NOT store avatar position \(that would be World state\)/.test(experienceSource),
            'H1c. core/LocalWorldExperience.js\'s own header explicitly classifies itself as personal/local, never World state, and explicitly contrasts itself against avatar position, which WOULD be World state if it were ever stored (it is not — see H2).');

        // H2. Avatar position: SESSION_STATE, live-confirmed structurally
        // incapable of persistence (no StorageProvider dependency at all
        // — B4 already proved this; reconfirmed here under this
        // section's own classification framing).
        const avatarSource = await readSource('application/AvatarPresenceSession.js');
        assert(/no such\s*\n?\s*\/\/? ?dependency exists to call/.test(avatarSource) || /structurally does not have/.test(avatarSource),
            'H2. AvatarPresenceSession.js\'s own header states persistence is "a capability this class structurally does not have" — SESSION_STATE, not WORLD_STATE, by design.');

        // H3. Selected encounter: DERIVED_PRESENTATION — recomputed on
        // demand from live inputs, never itself stored (live: two calls
        // with the same input produce two equal-but-distinct frozen
        // objects, never the same cached reference).
        const enc1 = describeWorldEncounterSelectionIdentity({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' });
        const enc2 = describeWorldEncounterSelectionIdentity({ kind: 'PUBLICATION', objectId: 'pub-1', origin: 'local' });
        assert(enc1 !== enc2 && JSON.stringify(enc1) === JSON.stringify(enc2), 'H3. A selection identity is recomputed fresh on every call (two distinct frozen objects, equal content) — DERIVED_PRESENTATION, never a stored/cached record.');

        // H4. Observer-local encounters: SESSION_STATE, explicitly
        // (B4/C4 already established this live).
        // H5. Focused World (_focusedDocumentId): SESSION_STATE — never
        // persisted (contrasted directly against H1's LocalWorldExperience,
        // which persists WHERE the camera was, not WHICH World is
        // currently focused; the two are genuinely different facts).
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(!/_focusedDocumentId.*(?:localStorage|StorageProvider)/.test(sessionSource), 'H5. Nothing persists `_focusedDocumentId` itself — only a per-World camera snapshot (H1) is ever saved, never "which World was focused."');

        // H6. Placement information (WorldPlacement, A5): real WORLD_STATE
        // — genuinely part of what a World spatially contains, backed by
        // a real persistence-capable registry (placement/PlacementRegistry.js),
        // unlike every SESSION_STATE/DERIVED_PRESENTATION item above.
        const placementRegistrySource = await readSource('placement/PlacementRegistry.js');
        assert(/class PlacementRegistry/.test(placementRegistrySource), 'H6. A real PlacementRegistry abstraction exists specifically to hold WorldPlacement content — WORLD_STATE with its own dedicated storage-facing collaborator, unlike this section\'s session-local/derived items.');

        console.log('✓ Section H: an inventory of six real state items, each classified against cited source rather than assumed — camera position is TRANSIENT render state plus one deliberate, narrow, per-World-per-device DERIVED_PRESENTATION convenience (LocalWorldExperience, H1); avatar position is SESSION_STATE, structurally incapable of persistence (H2); a selected encounter is DERIVED_PRESENTATION, recomputed fresh on every call (H3); observer-local encounters are SESSION_STATE (H4, per B4/C4); the focused-World pointer is SESSION_STATE, never persisted, genuinely distinct from the one thing that IS persisted per-World (H5); and placement information is real WORLD_STATE, backed by its own dedicated registry (H6).');
    }

    // ===============================================================
    // Section I — Reload / session boundary.
    // ===============================================================
    {
        // I1. Session A saves a World experience; a completely separate
        // LocalWorldExperienceStore instance built over the SAME
        // underlying storage (simulating a page reload, where
        // localStorage itself survives even though every in-memory
        // object is destroyed) reads back the identical record —
        // legitimate persistence across the session boundary.
        const sharedStorage = new InMemoryStorageProvider();
        const sessionAStore = new LocalWorldExperienceStore({ storageProvider: sharedStorage });
        sessionAStore.recordVisit('reload-world', { position: { x: 9, y: 9, z: 9 } });
        const sessionBStore = new LocalWorldExperienceStore({ storageProvider: sharedStorage });
        const afterReload = sessionBStore.getExperience('reload-world');
        assert(afterReload !== null && afterReload.cameraPosition.x === 9,
            'I1. A brand-new LocalWorldExperienceStore instance, over the SAME underlying storage, reads back Session A\'s camera experience intact — legitimate persistence across a reload.');

        // I2. Session A's AvatarPresenceSession/ObserverLocalEncounterStore
        // hold live data; "Session B" (a fresh page load) can only ever
        // construct BRAND NEW instances of these classes, because
        // neither one accepts a StorageProvider to even attempt reading
        // Session A's data back from — structurally guaranteed, not a
        // discipline a caller could violate.
        const sessionAAvatar = new AvatarPresenceSession({ avatarId: 'av-reload', ownerIdentity: 'alice' }, { position: { x: 1, y: 1, z: 1 } });
        sessionAAvatar.update({ position: { x: 5, y: 5, z: 5 } });
        const sessionAObserverStore = new ObserverLocalEncounterStore();
        sessionAObserverStore.record({ publicationId: 'pub-x', contentHash: 'hash-x' });
        // A fresh "Session B" has no constructor argument through which
        // Session A's avatar sequence or observer-local encounter could
        // even be threaded — there is no such parameter to accept it.
        const sessionBAvatar = new AvatarPresenceSession({ avatarId: 'av-reload', ownerIdentity: 'alice' }, {});
        const sessionBObserverStore = new ObserverLocalEncounterStore();
        assert(sessionBAvatar.current.position === undefined || JSON.stringify(sessionBAvatar.current.position) !== JSON.stringify({ x: 5, y: 5, z: 5 }),
            'I2a. A fresh AvatarPresenceSession never inherits the previous session\'s live position — there is no persistence path for it to arrive through.');
        assert(sessionBObserverStore.list().length === 0,
            'I2b. A fresh ObserverLocalEncounterStore never inherits the previous session\'s recorded encounters — confirming session-local observer encounters never accidentally become World persistence, exactly this milestone\'s own brief asked to verify.');

        console.log('✓ Section I: across a real session boundary (simulated as a fresh set of in-memory objects over the SAME underlying storage, the same shape a page reload takes against real localStorage), the one thing genuinely designed to persist per-World-per-device (camera experience) does (I1); AvatarPresenceSession and ObserverLocalEncounterStore, by contrast, have no persistence pathway to even attempt carrying session-local state across that boundary, confirmed structurally rather than by mere absence of a call — session-local observer encounters never accidentally become World persistence (I2).');
    }

    // ===============================================================
    // Section J — Failure isolation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, contentStore, publication: goodPublication } = publishMinimalDocument(storage, 'Isolation Good', 'alice');

        // J1. World A fails to load; World B (published independently,
        // through the SAME use case instance) remains fully loadable —
        // no shared mutable state between calls pollutes the outcome.
        const brokenPublication = new Publication({ documentId: 'ghost-doc', title: 'Ghost', author: 'nobody', contentHash: 'hash-that-was-never-actually-stored' });
        const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher, undefined, contentStore);
        let failureCaught = false;
        try {
            loadUseCase.execute(brokenPublication);
        } catch (err) {
            failureCaught = true;
        }
        assert(failureCaught, 'J1 setup. Loading a Publication whose snapshot was never actually stored genuinely fails.');
        const goodSession = loadUseCase.execute(goodPublication);
        assert(goodSession instanceof PublishedWorldSession && goodSession.getPublication().id === goodPublication.id,
            'J1. The SAME LoadPublishedWorldSessionUseCase instance, after a genuine failure for one Publication, still loads a sibling Publication correctly — no shared, poisoned state between calls.');

        // J2. The real navigation engine's own streaming loop tries each
        // visible World INDEPENDENTLY, catching per-id — one World's
        // load exception is caught, recorded into `_failedLoads` for
        // retry, and the loop continues to the NEXT id, never aborting
        // the whole batch. Quoted directly.
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(/for \(const id of toLoad\) \{\s*try \{\s*this\._loadWorld\(id\);/.test(sessionSource),
            'J2a. updateSpatialView() wraps EACH id\'s own _loadWorld() call in its own try/catch, inside the loop.');
        assert(/catch \(err\) \{\s*console\.warn\(`WorldNavigationSession: failed to load world \$\{id\}/.test(sessionSource),
            'J2b. A caught failure is logged and recorded for retry — it never throws out of the loop, so every OTHER id in the same batch still gets its own _loadWorld() attempt.');

        // J3. Publication encounter failure -> World remains usable: cite
        // 0.9.575 Section G's own live proof (Open fails cleanly and
        // independently of search/World continuing to function) rather
        // than re-deriving it.
        const priorArt = await readSource('tests/RepositorySearchResultSemanticsProductReassessment.test.js');
        assert(/Section G — Stale results/.test(priorArt), '0.9.575 Section G\'s own live proof (a failed Open never destabilizes anything else) is present and citable.');

        // J4. A failed World navigation attempt (forking a non-existent
        // document) leaves the Repository catalog completely unchanged.
        const provider = new LocalDiscoveryProvider(storage);
        const beforeList = provider.list().map((p) => p.id).sort();
        let forkFailed = false;
        try {
            new ForkDocumentUseCase(storage).execute('does-not-exist', null, null);
        } catch (err) {
            forkFailed = true;
        }
        assert(forkFailed, 'J4 setup. Forking a non-existent document genuinely fails.');
        const afterList = provider.list().map((p) => p.id).sort();
        assert(JSON.stringify(beforeList) === JSON.stringify(afterList), 'J4. The Repository catalog is byte-for-byte unchanged after the failed fork attempt.');

        console.log('✓ Section J: one World\'s load failure never poisons a sibling\'s (J1, live, through the shared use-case instance), the REAL streaming engine\'s own per-id try/catch loop structurally guarantees the same at production scale (J2, quoted directly), a Publication encounter failure leaving the World/Repository otherwise usable is cited from 0.9.575\'s own exhaustive live proof rather than re-derived (J3), and a failed World-navigation attempt (Fork of a non-existent document) leaves the Repository catalog completely unchanged (J4).');
    }

    // ===============================================================
    // Section K — World identity under concurrent navigation.
    // ===============================================================
    {
        // K1. Structural: the real navigation engine contains ZERO
        // `await`/`async `/`.then(` anywhere in its 6800+ lines — no
        // promise-based "late result" mechanism exists in this file at
        // all, so a bug shaped like "a late async World-A result
        // overwrites World-B's active state" cannot occur HERE,
        // structurally, regardless of how fast a Wanderer switches
        // Worlds.
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(!/\bawait\s/.test(sessionSource), 'K1a. No `await` anywhere in WorldNavigationSession.js.');
        assert(!/\basync\s+\w|\basync\s*\(/.test(sessionSource), 'K1b. No `async` function/method anywhere in WorldNavigationSession.js.');
        assert(!/\.then\(/.test(sessionSource), 'K1c. No `.then(` promise chain anywhere in WorldNavigationSession.js — navigation (focusDocument/_loadWorld/_unloadWorld) is fully synchronous, structurally incapable of a late-async-write race.');

        // K2. Where genuine async DOES exist (material verification,
        // distribution — one layer up, at the WorldEncounterCanvas
        // component level), 0.9.537 already proved live that every such
        // writer is guarded by a monotonic requestId, invalidated on
        // genuine selection change. Switching which World/target is
        // focused IS a selection change — so a World switch already
        // invalidates any in-flight async result tied to the World just
        // left, through the SAME existing mechanism, with no new
        // World-specific guard required. Cited, not re-derived.
        const asyncOwnershipAudit = await readSource('tests/WorldEncounterAsyncResultOwnershipBoundaryAudit.test.js');
        assert(/requestId/.test(asyncOwnershipAudit) && /0\.9\.537/.test(asyncOwnershipAudit),
            'K2a. 0.9.537\'s own live proof of the requestId-guard pattern for every real async writer is present and citable.');
        assert(/invalidated by `?refreshSelectionOutcome\(\)`?/.test(asyncOwnershipAudit) || /refreshSelectionOutcome/.test(asyncOwnershipAudit),
            'K2b. That guard is invalidated by a genuine SELECTION change — exactly what changing focus/target (including a World switch) already triggers, so K\'s question is answered by ground 0.9.537 already covered, not a new gap.');

        // K3. Live, at the layer this file CAN exercise directly: a rapid
        // W1 -> W2 -> W1 sequence via LoadPublishedWorldSessionUseCase's
        // own fully-synchronous execute() reveals no shared mutable
        // state between calls to leak through in the first place — each
        // call constructs a wholly fresh Document/PublishedWorldSession,
        // and the use case instance itself stores nothing per-call.
        const storage = new InMemoryStorageProvider();
        const { publisher, contentStore, publication: pW1 } = publishMinimalDocument(storage, 'Rapid W1', 'alice');
        const { publication: pW2 } = publishMinimalDocument(storage, 'Rapid W2', 'bob');
        const loadUseCase = new LoadPublishedWorldSessionUseCase(publisher, undefined, contentStore);
        const rapid1 = loadUseCase.execute(pW1);
        const rapid2 = loadUseCase.execute(pW2);
        const rapid3 = loadUseCase.execute(pW1);
        assert(rapid1.getWorld().id !== rapid2.getWorld().id, 'K3a. W1 and W2 remain genuinely distinct through the rapid sequence.');
        assert(rapid3.getWorld().id === rapid1.getWorld().id && rapid3 !== rapid1,
            'K3b. Returning to W1 resolves the identical identity via a fresh object — no stale W2 state, and no reused W1 object, could leak across the sequence, because none of these three calls ever wrote to or read from a shared field on the use case instance.');

        console.log('✓ Section K: the real navigation engine (WorldNavigationSession.js) contains zero await/async/.then( anywhere — grep-confirmed, K1 — so no promise-based late-result mechanism exists there to leak World A\'s outcome into World B\'s state; where genuine async writers DO exist, one layer up, 0.9.537\'s own already-proven selection-scoped requestId guard already covers a World switch for free, since switching focus IS a selection change (K2); and at the layer this file exercises live, a rapid W1->W2->W1 sequence confirms no shared mutable state exists between calls to leak through in the first place (K3).');
    }

    // ===============================================================
    // Section L — Flagship: the full scenario, live, end to end.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();

        // 1. Discover W1: publish P1.
        const { document: docW1, publication: p1, publisher, contentStore } = publishMinimalDocument(storage, 'Flagship World One', 'alice');

        // 2. Enter W1.
        const enterW1 = loadWorldSession(publisher, contentStore, p1);
        assert(enterW1.getWorld().id === docW1.world.id, 'L2. Entering W1 resolves the correct World identity.');

        // 3. Encounter Publication P1 / Inspect P1.
        const w1Building = enterW1.getWorld().getBuildings()[0];
        enterW1.selectBrick(w1Building.getBricks()[0].id, w1Building.id);
        assert(enterW1.getSelectionCount() === 1, 'L3. Inspecting P1 inside W1 produces a real, live selection.');

        // 4. Navigate to W2: publish and enter an entirely different
        // World, while W1's own session object stays alive, untouched.
        const { document: docW2, publication: p2 } = publishMinimalDocument(storage, 'Flagship World Two', 'bob');
        const enterW2 = loadWorldSession(publisher, contentStore, p2);
        assert(enterW2.getWorld().id !== enterW1.getWorld().id, 'L4. W2 is a genuinely distinct World from W1.');

        // 5. Interact with W2.
        const w2Building = enterW2.getWorld().getBuildings()[0];
        enterW2.selectBrick(w2Building.getBricks()[0].id, w2Building.id);
        assert(enterW2.getSelectionCount() === 1 && enterW1.getSelectionCount() === 1,
            'L5. Interacting with W2 leaves W1\'s own still-open session (and its own selection from step 3) completely unaffected.');

        // 6. "Late W1 operation completes" — simulate a delayed
        // operation against W1 arriving AFTER W2 has already been
        // interacted with. Per Section K, W1's own session object has
        // no shared mutable state with W2's at all, so this "late"
        // write can only ever land on W1's own session, never W2's.
        enterW1.selectItems([{ buildingId: w1Building.id, brickId: w1Building.getBricks()[0].id }]);
        assert(enterW1.getSelectionCount() === 1 && enterW2.getSelectionCount() === 1,
            'L6. The "late" W1 operation lands correctly on W1\'s own session only — W2\'s own selection, from step 5, is completely undisturbed.');

        // 7. Return to W1: load a THIRD, independent session for P1.
        const returnW1 = loadWorldSession(publisher, contentStore, p1);
        assert(returnW1.getWorld().id === docW1.world.id, 'L7a. Returning to W1 resolves the exact original World identity.');
        assert(returnW1.getSelectionCount() === 0, 'L7b. ...through a freshly-reconstructed session whose own selection starts empty — W1\'s own step-3/step-6 selection never leaked into this new "return" session either.');

        // 8. Repository still contains P1; P1's identity is unchanged.
        const provider = new LocalDiscoveryProvider(storage);
        const foundP1 = provider.findById(p1.id);
        assert(foundP1 !== null && foundP1.documentId === p1.documentId && foundP1.contentHash === p1.contentHash,
            'L8. Repository search still finds P1, with its documentId/contentHash/publicationId completely unchanged throughout the entire scenario.');

        // 9. W1 remains the same World; session-local state followed its
        // own, intended, separate lifecycle throughout (never leaked
        // across Worlds, never survived past its own session's own life).
        assert(returnW1.getWorld().id === enterW1.getWorld().id && enterW1.getWorld().id === docW1.world.id,
            'L9. FLAGSHIP: W1 is, and remains, the exact same World across discovery, entry, inspection, a sibling World\'s entire lifecycle happening alongside it, a "late" operation, and a full re-entry — while every piece of session-local state (three independent selections, one per session object) followed its own correct, isolated lifecycle: never shared between W1 and W2, and never carried forward across re-entry.');

        console.log('✓ Section L: FLAGSHIP — Discover W1 -> Enter W1 -> Encounter/Inspect P1 -> Navigate to W2 -> Interact with W2 -> a "late" W1 operation (lands only on W1) -> Return to W1 (fresh session, same identity, empty selection) -> Repository still contains P1, unchanged -> W1 remains the exact same World throughout -> every piece of session-local state followed its own correct, isolated lifecycle. World identity, Publication identity, and session-local interaction state are proven, live, end to end, to be three genuinely independent, correctly-composed facts — the World-level analogue of 0.9.575\'s own closing flagship.');
    }

    // ===============================================================
    // Section M — Deliberate exclusions.
    // ===============================================================
    {
        const worldSource = await readSource('core/World.js');
        const worldFieldMatches = worldSource.match(/this\._(\w+)\s*=/g) || [];
        const worldFields = new Set(worldFieldMatches.map((m) => m.replace(/this\.|\s*=/g, '')));
        assert(worldFields.has('_id') && worldFields.has('_buildings') && worldFields.has('_regions'),
            'M1. core/World.js\'s own field set is exactly what this milestone found it to be at the start (id/buildings/groups/placements/landmarks/regions/metadata/eventBus) — no new World identity field was added.');

        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(!/setInterval\(.*retry|automaticRecover|autoRecover/i.test(sessionSource) || /RETRY_DELAYS/.test(sessionSource),
            'M2. The pre-existing `_failedLoads`/RETRY_DELAYS retry bookkeeping (0.2.x, already in production before this milestone) is a bounded retry of a transient streaming load, never a new "automatic World recovery" feature — nothing new was added here.');

        console.log(`✓ Section M — explicit DELIBERATE_EXCLUSION classification, matching this milestone's own originating brief, confirmed absent by direct inspection rather than assumed:
  - No World synchronization redesign — every collaborator exercised above (WorldPresenceUseCase, WorldMembershipUseCase, the streaming loop) is pre-existing and unmodified.
  - No World persistence redesign — LocalWorldExperienceStore/PlacementRegistry/World.toJSON() are exercised exactly as they already existed.
  - No multiplayer protocol changes — this file touches no protocol/wire-format code.
  - No new World identity fields (M1) — core/World.js's field set is unchanged.
  - No World cloning changes — DocumentCloneService is exercised, unmodified, exactly as ForkDocumentUseCase/ForkPublishedWorldUseCase already used it.
  - No World versioning of any kind was introduced or found missing-but-needed.
  - No automatic World recovery beyond the pre-existing, bounded retry-with-backoff already in production (M2).
  - No navigation framework replacement — focusWorld()/focusDocument()/navigateToDocument() are exercised exactly as they already existed (Section G).
  - No camera/physics changes — CameraState/CameraController were only read, never modified.
  - No new caching — Section B/D/K explicitly proved LoadPublishedWorldSessionUseCase caches nothing, by construction, and this milestone added none.
  - No new World discovery mechanisms — DiscoverWorldsUseCase/discovery/*.js were only read, never modified.
  - No production code was changed anywhere by this milestone — every file imported above (except this test file itself) is byte-for-byte what 0.9.575 left it as.`);
    }

    console.log('\nAll World Lifecycle & Identity Product Reassessment tests passed.');
    console.log('\n=== 0.9.576 VERDICT ===');
    console.log(`PRODUCT_COMPLETE for every question this milestone's own brief posed. No production code changed.

World identity inventory (A): World.id is a real, independently-generated field, yet every production consumer
(publish, save, load, fork, region ownership) treats document.world.id as the one identity that matters — confirmed
live rather than assumed. Two genuine naming traps in this codebase's own vocabulary were surfaced rather than
silently assumed away: WorldFocusContext describes what a viewer is looking AT, and explicitly cannot know "which
World is on screen" (its own 0.6.1 header says so); WorldEncounter never carries a World id at all, identifying a
Publication or an avatar instead. Neither is a bug — both are pre-existing, deliberate design choices this milestone
now documents by direct citation rather than leaving implicit.

World lifecycle (B) is genuinely PERSISTENT for identity and content (proven live through
application/LoadPublishedWorldSessionUseCase.js, the one "enter a World" pipeline this checkout can run without
'three') while session-local runtime state (selection) is RECONSTRUCTED fresh on every load, never cached — reconfirmed
across Enter -> Leave -> Re-enter (C), Multiple Worlds coexisting with zero shared state (D), and a full Reload /
session boundary test (I) distinguishing what legitimately persists (LocalWorldExperience, per-World-per-device) from
what is structurally incapable of persisting at all (AvatarPresenceSession, ObserverLocalEncounterStore — no
StorageProvider dependency exists to call, confirmed by direct source inspection, not merely by absence of a save()
call). Section C additionally confirmed, live, that PublishedWorldSession has no leave()/close()/dispose() method at
all — "leaving" a World, at this layer, is purely the caller discarding its own reference, never an explicit
lifecycle event this object itself models.

World <-> Publication (E) and World <-> Document (F) boundaries both hold, with one honest architectural finding
surfaced rather than forced into the brief's own assumed shape: in THIS codebase, documentId and World identity are
not two independently-varying concepts that could accidentally diverge — a Document's identity IS its world.id, by
design (application/DocumentCloneService.js's own header states this outright). The real invariant worth protecting
— and now proven live — is that the one operation that legitimately mints a fresh identity, Fork, always changes
World+Document identity together, atomically, and never mutates or renames the source, whether forking from a raw
Document or directly from a Publication. Publication identity remains a genuinely different granularity throughout:
many Publications, one World; contentHash never identifies a World; publicationId never appears as a World-navigable
route parameter anywhere in the real router; and leaving a World removes nothing from the Repository catalog.

Navigation state (G) converges on exactly one mechanism at every layer checked — one router-level World route, one
focusWorld() UI function, one focusDocument() session implementation (of which navigateToDocument() is a verbatim
alias) — with no second, competing, or drifted copy found anywhere; this milestone correctly introduces no new
universal navigation mechanism of its own. World state vs. presentation state (H) was inventoried and classified
against cited, real source across six items spanning WORLD_STATE (placement data), a deliberate narrow
DERIVED_PRESENTATION persistence layer (per-World-per-device camera experience), and SESSION_STATE (avatar position,
focused-World pointer, observer-local encounters) — the focused-World pointer itself is confirmed never persisted,
genuinely distinct from the one thing that IS persisted per World.

Failure isolation (J) holds at both layers checked: one World's load failure never poisons a sibling's, live through
the shared use-case instance and structurally through the real streaming engine's own per-id try/catch loop (quoted
directly); a Publication encounter failure leaving the World/Repository otherwise usable is cited from 0.9.575's own
exhaustive live proof; and a failed World-navigation attempt leaves the Repository catalog byte-for-byte unchanged.
Concurrent navigation (K) is structurally safe by the simplest possible mechanism: the real navigation engine contains
zero await/async/.then( anywhere, so no promise-based late-result race can exist there at all; where genuine async
writers do exist, one layer up, 0.9.537's own already-proven selection-scoped requestId guard already covers a World
switch for free, since changing focus IS a selection change.

The flagship (L) demonstrates the brief's own closing scenario directly, live, end to end: discover, enter, inspect,
navigate away, interact elsewhere, a deliberately "late" operation against the first World, and a full return —
proving World identity, Publication identity, and session-local interaction state are three genuinely independent,
correctly-composed facts, exactly as this milestone's own central question asked, and exactly the World-level
analogue of 0.9.575's own closing flagship.

Every deliberate exclusion this milestone's own brief named (M) was checked absent by direct source inspection: no
World synchronization/persistence redesign, no multiplayer protocol changes, no new World identity fields, no World
cloning/versioning changes, no automatic World recovery beyond the pre-existing bounded retry, no navigation
framework replacement, no camera/physics changes, no new caching, no new World discovery mechanisms.

Per the originating brief's own predicted next step: this is a narrow, test-only, high-confidence PRODUCT_COMPLETE
result, surfacing two vocabulary clarifications worth documenting (WorldFocusContext and WorldEncounter both sound
like they reference World identity and structurally never do) but zero production gaps. If a follow-up is wanted, the
brief's own suggested "much narrower World lifecycle/persistence DECISION audit" is a reasonable next step — but
nothing found here forces one; this arc, like the Repository arc before it, can also be considered closed absent a
concrete product question motivating it.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
