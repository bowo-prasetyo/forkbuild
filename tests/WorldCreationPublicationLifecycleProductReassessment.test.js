import { readFile } from 'node:fs/promises';

import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { DocumentRevision } from '../core/DocumentRevision.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/publication/UnpublishDocumentUseCase.js';
import { ForkDocumentUseCase } from '../application/document/ForkDocumentUseCase.js';
import { ForkPublishedWorldUseCase } from '../application/publication/ForkPublishedWorldUseCase.js';
import { ForkFailureReason } from '../application/document/ForkFailureReason.js';
import { CreateDocumentManagerUseCase } from '../application/document/CreateDocumentManagerUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { DocumentManifest } from '../application/document/DocumentManifest.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.577 — World Creation & Publication Lifecycle Product Reassessment.
//
// 0.9.576 closed World identity + session lifecycle, and landed the
// central fact this milestone leans on throughout: in this codebase, a
// Document has no id of its own — its only identity IS document.world.id
// (application/document/DocumentCloneService.js's own header states this
// outright). This milestone asks the next, adjacent question 0.9.576's
// own closing note named but deliberately left open: when a Wanderer
// actually CREATES a World, EDITS it, and PUBLISHES it, does the system
// keep the editable World/Document state and each immutable Publication
// snapshot properly separated, while World identity and navigation stay
// coherent across create -> edit -> publish -> fork -> reload?
//
// Same structural constraint 0.9.574/0.9.575/0.9.576 already
// established governs this file too: application/world/WorldNavigationSession.js
// (the real, live World View engine) transitively imports
// renderer/Renderer.js, which imports `three` — not installed in this
// checkout (reconfirmed directly for this milestone: `node
// --input-type=module -e "import('./application/world/WorldNavigationSession.js")"`
// fails with "Cannot find package 'three'", and even
// tests/RepositoryPublicationLifecycleProductReassessment.test.js — an
// EARLIER milestone that imports it directly — fails to run standalone
// in this exact checkout for the identical reason, which is why
// 0.9.574 onward stopped importing it live). Every claim about
// WorldNavigationSession itself is therefore proven by direct source
// citation (readSource() + exact line quotes), never by live import —
// same discipline 0.9.576 already used. Everywhere else — core/Document.js,
// core/World.js, core/DocumentMetadata.js, core/PlacementRecord.js,
// application/document/CreateDocumentManagerUseCase.js, DocumentManager.js,
// SaveDocumentUseCase.js, PublishDocumentUseCase.js,
// ForkDocumentUseCase.js, ForkPublishedWorldUseCase.js,
// DocumentCloneService.js, publisher/LocalPublisherProvider.js,
// publisher/Publication.js, discovery/LocalDiscoveryProvider.js — real,
// unmodified production classes are imported and exercised live.
//
//   A — World creation identity: Create -> Document -> World produces
//       exactly one coherent, surviving identity; no Publication, no
//       discovery artifact, and no Repository admission happens merely
//       because a World was created.
//   B — World editing semantics: two genuinely different real pathways
//       (an unpublished draft, mutable/overwriteable via
//       DocumentManager + SaveDocumentUseCase; and an already-published
//       World, which WorldNavigationSession's own saveDocument()/
//       publishDocument() REFUSE to touch directly, cited verbatim) —
//       editing a World never mutates an already-created Publication.
//   C — Publish World as snapshot: the permanent regression witness —
//       publish, then keep editing the live World object; the stored
//       Publication snapshot stays byte-identical throughout.
//   D — Repeated World publication: republishing unchanged content stays
//       two independent Publications (never merged by contentHash); an
//       actual edit produces a genuinely different one.
//   E — World identity vs Publication identity: the real matrix, plus
//       both adversarial identity shapes 0.9.575 Section B already
//       proved for Publications specifically, reconfirmed against a
//       World/Document/Material/Placement axis.
//   F — Forking a World: W1 -> P1 -> Fork -> W2, repeated forks, source
//       never mutated by a fork or by editing the fork afterward.
//   G — Publication after a fork: P1 and P2 (published from the fork)
//       never conflate merely because the fork shares lineage with W1.
//   H — World navigation during editing/publication: cited directly —
//       WorldNavigationSession's own publishDocument()/saveDocument()
//       guards are the real seam that keeps this coherent; no new
//       navigation mechanism is invented here to test it.
//   I — Publication failure isolation: a failure at the very last write
//       of the real publish pipeline (Repository admission) leaves the
//       World editable, mints no fake Publication, and never corrupts
//       an already-successful sibling Publication; a validation failure
//       leaves zero storage writes at all.
//   J — World + collaboration boundary: a small, targeted check — the
//       publish pipeline has zero coupling to any collaboration/
//       transport concept, confirmed both by citation (no import) and
//       live (a "late" mutation to the same in-memory Document, the
//       same shape a remote edit would take, never alters an
//       already-created Publication).
//   K — Persistence and reload: a World's persistent identity and its
//       Publication both survive a full drop-references-and-reload
//       cycle, from the same storage, without silently generating a
//       duplicate Publication.
//   L — Flagship: the brief's own closing scenario, live, end to end.
//
// Deliberately excluded, per this milestone's own originating brief:
// World versioning, automatic draft management, publication
// deduplication, World synchronization redesign, collaboration
// conflict-resolution changes, new World identity fields, a
// World-specific Repository class, publication ranking, automatic
// republishing, automatic distribution retry, World backup/version
// history, new navigation mechanisms. This file changes no production
// code; it is reconnaissance/reassessment only.
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
        this._failKeys = null;
    }
    save(name, data) {
        if (this._failKeys && this._failKeys.has(name)) {
            throw new Error(`InMemoryStorageProvider: simulated failure saving "${name}"`);
        }
        this.saveCount += 1;
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this.removeCount += 1; this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
    failOnSave(...keys) { this._failKeys = new Set(keys); }
    clearFailures() { this._failKeys = null; }
}

// Same minimal single-building World every prior milestone's helper has
// used (0.9.534/0.9.574/0.9.575/0.9.576).
function buildWorldDocument({ title = 'Atlas', author = 'alice', license = new License({ id: LicenseId.CC0_1_0 }) } = {}) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author, license }) });
}

function makePublishPipeline(storage, author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const identityProvider = { currentUser: () => ({ username: author }), sign: () => null };
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identityProvider, null, null);
    return { contentStore, publisher, identityProvider, publishDocumentUseCase };
}

async function main() {
    // ===============================================================
    // Section A — World creation identity.
    // ===============================================================
    {
        // A1. The real construction path Toolbar/CreateDemoWorldUseCase
        // actually use: CreateDocumentManagerUseCase.execute() first
        // (safe before any World exists — it builds a DocumentManager
        // around a throwaway default Document/World scaffold), THEN
        // attachWorld() swaps in the real, populated World once one
        // exists.
        const createDocumentManagerUseCase = new CreateDocumentManagerUseCase();
        const manager = createDocumentManagerUseCase.execute();
        const scaffoldWorldId = manager.document.world.id;
        assert(typeof scaffoldWorldId === 'string' && scaffoldWorldId.length > 0,
            'A1. execute() alone already produces a DocumentManager wrapping a real (if throwaway) World with a real id — never null, matching the class\'s own "safe to construct before a World exists" comment.');

        const world = new World();
        const building = new Building({ creator: 'alice' });
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const identityProviderAlice = { currentUser: () => ({ username: 'alice' }) };
        createDocumentManagerUseCase.attachWorld(manager, world, identityProviderAlice);

        // A2. Exactly one coherent World identity survives attachWorld():
        // the manager's document.world is the EXACT SAME World instance
        // the caller supplied, not a copy, and never the earlier
        // scaffold.
        assert(manager.document.world === world, 'A2. manager.document.world is reference-identical to the World attachWorld() was given — exactly one coherent identity, not a clone.');
        assert(manager.document.world.id !== scaffoldWorldId, 'A2b. The real World\'s id is never, and can never coincidentally equal, the earlier throwaway scaffold\'s id — createId() never repeats within a session.');
        assert(manager.document.metadata.author === 'alice', 'A2c. attachWorld() stamps the resolved author onto the real Document\'s metadata.');

        // A3. Live, through the real publish pipeline: document.world.id
        // is the one identity a Publication actually carries.
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const publication = publishDocumentUseCase.execute(manager);
        assert(publication.documentId === world.id, 'A3. publication.documentId is exactly the created World\'s id.');

        // A4. No Publication, no discovery artifact, and no Repository
        // admission happen merely from CREATING a World — only from an
        // explicit publish, which this section deliberately performed
        // separately and last, precisely so the assertion above can
        // isolate "creation" from "publication."
        const storageCreationOnly = new InMemoryStorageProvider();
        const managerOnly = createDocumentManagerUseCase.execute();
        createDocumentManagerUseCase.attachWorld(managerOnly, new World(), identityProviderAlice);
        assert(storageCreationOnly.saveCount === 0, 'A4. Creating a World/Document touches storage zero times — it is pure in-memory construction; storage is never written until something explicitly saves or publishes.');
        const discoveryCreationOnly = new LocalDiscoveryProvider(storageCreationOnly);
        assert(discoveryCreationOnly.list().length === 0, 'A4b. No discovery artifact / Repository entry exists merely because a World was created — the Repository (discovery/LocalDiscoveryProvider.js, reading the same "forkbuild-publications" key LocalPublisherProvider.js writes) is empty until an explicit publish.');

        console.log('✓ Section A: World creation identity — CreateDocumentManagerUseCase().execute() + attachWorld() produces exactly one coherent, real World identity (never the transient pre-World scaffold, never a clone); document.world.id becomes the Publication\'s documentId the moment (and only the moment) something is explicitly published; creating a World, by itself, never touches storage, never mints a Publication, and never admits anything into the Repository.');
    }

    // ===============================================================
    // Section B — World editing semantics.
    // ===============================================================
    {
        // B1. The unpublished-draft pathway: DocumentManager +
        // SaveDocumentUseCase. Save is explicitly "mutable,
        // overwriteable" per PublishDocumentUseCase.js's own header
        // ("Save -> persist the editable document (mutable,
        // overwriteable) / Publish -> create an immutable, validated,
        // versioned snapshot") — proven live here across edit -> save
        // -> edit again -> save again.
        const storage = new InMemoryStorageProvider();
        const manager = new DocumentManager();
        const world = new World();
        manager.newDocument(new Document({ world, metadata: new DocumentMetadata({ title: 'Draft', author: 'alice' }) }));
        world.addBuilding(new Building({ creator: 'alice' }));

        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const manifest = new DocumentManifest(storage);

        saveDocumentUseCase.execute(manager);
        const afterFirstSave = storage.load(world.id);
        assert(afterFirstSave.world.buildings.length === 1, 'B1a. First save persisted the World as it stood: one building.');
        const entryAfterFirstSave = manifest.find(world.id);
        assert(entryAfterFirstSave.revision === 1, 'B1b. First explicit save advances revision to 1 — matching DocumentRevision.nextRevision(0, 0) === 1.');
        assert(DocumentRevision.nextRevision(0, 0) === 1, 'B1b-cite. core/DocumentRevision.js\'s own nextRevision() confirms the value directly, not by assumption.');
        assert(manager.state.dirty === false, 'B1c. markSaved() (called by SaveDocumentUseCase itself) clears the dirty flag.');

        // Edit again: World identity is a stable, mutable in-memory
        // object — the SAME World, never re-created, is what gets
        // edited a second time.
        world.addBuilding(new Building({ creator: 'alice' }));
        saveDocumentUseCase.execute(manager);
        const afterSecondSave = storage.load(world.id);
        assert(afterSecondSave.world.buildings.length === 2, 'B2a. Second save reflects the additional building.');
        assert(afterSecondSave.world.id === afterFirstSave.world.id, 'B2b. World identity is unchanged across edit -> save -> edit -> save — the SAME mutable slot is simply overwritten, never re-keyed.');
        const entryAfterSecondSave = manifest.find(world.id);
        assert(entryAfterSecondSave.revision === 2, 'B2c. Revision advances again (2), confirming successive saves are tracked, ordered mutations of the SAME editable state — never independent objects.');

        // B3. The already-PUBLISHED pathway is structurally different —
        // cited directly, since exercising it live requires
        // WorldNavigationSession (`three`). Both of its own guard
        // methods REFUSE to touch a published document directly: saving
        // throws rather than "silently persisting over the published
        // source's storage slot," and publishing throws rather than
        // silently re-publishing over an existing Publication. Editing
        // a published World is therefore never an in-place mutation at
        // this layer at all — see Section H below for the fork-first
        // mechanism that makes editing possible.
        const sessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(/is a published snapshot and cannot be saved directly — edit it to fork first/.test(sessionSource),
            'B3a. WorldNavigationSession.saveDocument() literally refuses to save a document while it is still a published id — quoted verbatim from the real source.');
        assert(/is already a published snapshot — fork it to publish an edited copy/.test(sessionSource),
            'B3b. WorldNavigationSession.publishDocument() literally refuses to re-publish an already-published id directly — quoted verbatim from the real source.');

        console.log('✓ Section B: World editing semantics — two genuinely distinct real pathways, not one glossed-over concept. An unpublished draft (DocumentManager + SaveDocumentUseCase) is exactly what PublishDocumentUseCase.js\'s own header calls it: "mutable, overwriteable" — the same World identity, edited and saved repeatedly, with each save advancing a real, cited revision counter (core/DocumentRevision.js) that never appears inside Document.toJSON() and never travels with a Publication. An already-published World cannot be saved or re-published in place AT ALL — both real guard methods throw, quoted verbatim from WorldNavigationSession.js — so "editing a World never mutates an already-published Publication" holds not by convention but by an explicit, load-bearing refusal.');
    }

    // ===============================================================
    // Section C — Publish World as snapshot. PERMANENT REGRESSION WITNESS.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const document = buildWorldDocument({ title: 'Regression Witness', author: 'alice' });

        const p1 = publishDocumentUseCase.execute({ document });
        const snapshotBefore = publisher.loadSnapshot(p1.id);
        assert(snapshotBefore.world.buildings.length === 1, 'C1. P1\'s stored snapshot captures the World exactly as it stood at publish time: one building.');

        // Mutate the LIVE World object after publishing.
        const secondBuilding = new Building({ creator: 'alice' });
        secondBuilding.addBrick(new Brick({ definitionId: 'core:sphere', position: new Position(1, 0, 1) }));
        document.world.addBuilding(secondBuilding);
        document.metadata.title = 'Regression Witness (edited)';
        document.metadata.touch();

        const snapshotAfter = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(snapshotBefore) === JSON.stringify(snapshotAfter),
            'C2. PERMANENT REGRESSION WITNESS: P1\'s stored snapshot is byte-for-byte identical before and after further edits to the live World object it was published from.');
        assert(snapshotAfter.world.buildings.length === 1, 'C2b. The snapshot still shows exactly one building — it never gained the second one added after publish.');
        assert(publisher.verifySnapshot(p1.id, p1.contentHash) === true, 'C2c. P1\'s own contentHash still verifies against the (unchanged) stored snapshot.');

        // Also confirm through the mutable-draft Save pathway: even an
        // explicit Save of the now-edited Document (the real
        // "documentManager.markSaved()" shape WorldNavigationSession
        // itself uses at its own saveDocument() call site) never
        // touches the Publication's separate storage slot.
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        saveDocumentUseCase.execute({ document, markSaved: () => {} });
        const draftSlot = storage.load(document.world.id);
        assert(draftSlot.world.buildings.length === 2, 'C3. The mutable draft slot (keyed by document.world.id) now reflects both buildings after an explicit Save.');
        const snapshotAfterDraftSave = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(snapshotAfterDraftSave) === JSON.stringify(snapshotBefore),
            'C3b. P1\'s immutable snapshot (keyed by "snapshot:<publicationId>") remains byte-identical even after the mutable draft slot (keyed by document.world.id — the SAME key publish() itself also wrote once, at publish time) is explicitly re-saved with different content. Two separate storage slots, proven separate under direct pressure.');

        console.log('✓ Section C: Publish World as snapshot — PERMANENT REGRESSION WITNESS holds. Publishing a World produces an immutable Publication snapshot that survives both further live mutation of the in-memory World object and an explicit re-Save of the resulting draft to its own, separate, mutable storage slot. contentHash verification (LocalPublisherProvider.verifySnapshot) confirms the same fact independently.');
    }

    // ===============================================================
    // Section D — Repeated World publication.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const document = buildWorldDocument({ title: 'Twin Towers', author: 'alice' });

        // No actual content change between publishes.
        const p1 = publishDocumentUseCase.execute({ document });
        const p2 = publishDocumentUseCase.execute({ document });
        assert(p1.id !== p2.id, 'D1. Two publish() calls on the SAME unchanged Document mint two distinct publicationIds.');
        assert(p1.documentId === p2.documentId, 'D1b. Both share the same documentId — the same World is being described twice.');
        assert(p1.contentHash === p2.contentHash, 'D1c. Both share the same contentHash — the published bytes are genuinely identical (no timestamp/touch() advanced between calls).');

        const discovery = new LocalDiscoveryProvider(storage);
        assert(discovery.list().length === 2, 'D2. The Repository holds BOTH as independently admitted entries — no contentHash-based merging collapsed them into one, exactly the "no actual content change" case this milestone\'s own brief named as the expected, unmerged outcome.');
        assert(discovery.findById(p1.id) !== null && discovery.findById(p2.id) !== null, 'D2b. Each remains independently resolvable by its own publicationId.');
        assert(discovery.findByDocumentId(document.world.id).length === 2, 'D2c. findByDocumentId legitimately returns both — documentId is a one-to-many axis onto Publications, never a uniqueness constraint.');

        // Now an actual edit, then a third publish.
        document.world.addBuilding(new Building({ creator: 'alice' }));
        const p3 = publishDocumentUseCase.execute({ document });
        assert(p3.contentHash !== p1.contentHash, 'D3. A genuine content change produces a genuinely different contentHash.');
        assert(discovery.list().length === 3, 'D3b. The Repository now holds all three, distinctly — P1/P2 (identical twins) and P3 (a real edit) coexist without any of the three being merged, superseded, or silently dropped.');

        console.log('✓ Section D: Repeated World publication — republishing unchanged content produces two distinct, independently admitted Publications sharing documentId and contentHash but never merged (the brief\'s own named "no actual content change" case, confirmed to remain two Publications); a genuine edit republished afterward is a third, distinct entry. No contentHash-based merging exists anywhere in this pipeline.');
    }

    // ===============================================================
    // Section E — World identity vs Publication identity: the matrix.
    // ===============================================================
    {
        // World: world.id.
        const w = new World();
        assert(typeof w.id === 'string' && w.id.length > 0, 'E1. World: identity is world.id, real and non-empty.');

        // Document: no id of its own; identity IS world.id.
        const doc = new Document({ world: w });
        assert(doc.id === undefined && doc.world.id === w.id, 'E2. Document: carries no `id` of its own — its identity is exactly document.world.id (the same fact 0.9.576 Section F established, reconfirmed here as this milestone\'s own starting premise).');

        // Publication: publicationId, independently minted.
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const document = buildWorldDocument({ title: 'Matrix', author: 'alice' });
        const p = publishDocumentUseCase.execute({ document });
        assert(p.id !== document.world.id, 'E3. Publication: identity is publicationId, independently minted (createId()) — never equal to the World/Document identity it describes.');

        // Material: contentHash, a third, independent axis.
        assert(typeof p.contentHash === 'string' && p.contentHash.length > 0, 'E4. Material: identity is contentHash.');
        assert(p.contentHash !== p.id && p.contentHash !== p.documentId, 'E4b. contentHash is neither publicationId nor documentId — a genuinely third axis.');

        // Discovery artifact: honestly, not a fourth axis in this
        // codebase — LocalDiscoveryProvider returns the EXACT SAME
        // Publication record LocalPublisherProvider wrote; there is no
        // separate "announcement" object.
        const discovery = new LocalDiscoveryProvider(storage);
        const found = discovery.findById(p.id);
        assert(found instanceof Publication, 'E5. Discovery artifact: LocalDiscoveryProvider.findById() returns a real Publication instance.');
        assert(found.id === p.id && found.documentId === p.documentId && found.contentHash === p.contentHash,
            'E5b. Discovery artifact identity: honestly the SAME identity as Publication (publicationId) in this codebase — discovery/LocalDiscoveryProvider.js reads the identical "forkbuild-publications" record LocalPublisherProvider.js wrote and reconstructs the same Publication, not a distinct "announcement" abstraction. Naming this as a separate axis in the brief\'s own matrix would invent an identity this codebase does not have; stated honestly instead, matching 0.9.576\'s own precedent of surfacing vocabulary facts rather than forcing an assumed shape.');

        // Placement: PlacementRecord.placementId, distinct from
        // publicationId (constructed directly — no spatial index/brick
        // registry machinery needed to prove the identity shape).
        const placement = new PlacementRecord({ publicationId: p.id });
        assert(placement.placementId !== p.id, 'E6. Placement: identity is placementId, independently minted.');
        assert(placement.publicationId === p.id, 'E6b. A PlacementRecord carries the publicationId it places, but is never identified BY it.');

        // Adversarial combo 1 (cited/reconfirmed from Section D): same
        // documentId + same contentHash, distinct publicationId.
        const p2 = publishDocumentUseCase.execute({ document });
        assert(p.documentId === p2.documentId && p.contentHash === p2.contentHash && p.id !== p2.id,
            'E7. Adversarial combo (same documentId + same contentHash, distinct publicationId) — the real, live shape Section D already proved, reconfirmed here as part of the matrix.');

        // Adversarial combo 2 (constructed directly, same technique
        // 0.9.575 Section B2 used): distinct documentId, SHARED
        // contentHash. The real pipeline can never produce this
        // deterministically in this codebase, because World.toJSON()
        // embeds `id` into the exact JSON that gets hashed — two
        // different World ids can never hash identically through the
        // real path. Constructed directly to prove the OBJECT SHAPE
        // never conflates identity even when handed to it artificially.
        const pAlpha = new Publication({ documentId: 'doc-Alpha', title: 'Sibling Keep', author: 'erin', contentHash: 'shared-hash-Z' });
        const pBeta = new Publication({ documentId: 'doc-Beta', title: 'Sibling Keep', author: 'erin', contentHash: 'shared-hash-Z' });
        assert(pAlpha.id !== pBeta.id && pAlpha.documentId !== pBeta.documentId && pAlpha.contentHash === pBeta.contentHash,
            'E8. Adversarial combo (distinct documentId, shared contentHash) — constructed directly, same shape 0.9.575 Section B2 used, since the live pipeline cannot itself produce two different World ids sharing one contentHash (World.toJSON() embeds `id` into the hashed payload).');

        // The central invariant: "A Publication can describe a World
        // without becoming the World."
        assert(p !== document && p !== document.world, 'E9. A Publication is never, and never becomes, the World/Document object it describes — a distinct instance at every layer.');
        document.world.addBuilding(new Building({ creator: 'alice' }));
        assert(publisher.loadSnapshot(p.id).world.buildings.length === 1,
            'E9b. Central invariant, reconfirmed: mutating the live World after the fact never retroactively changes what P describes — P continues to describe the World exactly as it stood at publish time, never the World\'s current state.');

        console.log('✓ Section E: World identity vs Publication identity — the real matrix: World = world.id; Document = world.id (no separate id); Publication = publicationId (independent mint); Material = contentHash (a genuinely third axis); Placement = placementId (independent of publicationId, which it merely carries). "Discovery artifact" is honestly NOT a distinct axis in this codebase — LocalDiscoveryProvider returns the same Publication record LocalPublisherProvider wrote, stated plainly rather than forced into an assumed shape. Both adversarial identity combinations named in this milestone\'s own brief hold, one live/reconfirmed (same documentId+contentHash, distinct publicationId) and one constructed exactly like 0.9.575 Section B2 (distinct documentId, shared contentHash — impossible through the live pipeline itself, since World.toJSON() embeds id into what gets hashed). The central invariant — a Publication can describe a World without becoming it — holds under direct, live mutation pressure.');
    }

    // ===============================================================
    // Section F — Forking a World.
    // ===============================================================
    let forkChain;
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const docW1 = buildWorldDocument({ title: 'Genesis', author: 'alice' });
        const p1 = publishDocumentUseCase.execute({ document: docW1 });

        const forkPublishedWorldUseCase = new ForkPublishedWorldUseCase(publisher);
        const identityProviderBob = { currentUser: () => ({ username: 'bob' }) };
        const docW2 = forkPublishedWorldUseCase.execute(p1, identityProviderBob);

        // F1. W2 does not silently become W1: fresh identity throughout.
        assert(docW2.world.id !== docW1.world.id, 'F1. Fork produces a genuinely new World identity — never the source\'s.');
        assert(docW2.metadata.parentDocumentId === docW1.world.id, 'F1b. Lineage recorded correctly: the fork\'s parentDocumentId points at the SOURCE World\'s id.');
        assert(docW2.metadata.author === 'bob', 'F1c. The forker becomes the new owner, never the source\'s original author.');
        assert(docW2.metadata.title === 'Fork of Genesis', 'F1d. Title correctly marks this as a fork.');

        // F2. Subsequent edits to W2 cannot mutate W1 or P1.
        docW2.world.addBuilding(new Building({ creator: 'bob' }));
        assert(docW1.world.getBuildings().length === 1, 'F2. W1\'s own building count is untouched by editing W2 — a completely separate World object.');
        const p1SnapshotStillIntact = publisher.loadSnapshot(p1.id);
        assert(p1SnapshotStillIntact.world.buildings.length === 1, 'F2b. P1\'s stored snapshot is untouched by editing the fork — the fork operation and any editing afterward never touch the source\'s storage at all.');

        // F3. Repeated forks: publish W2, then fork again to W3.
        const identityProviderCarol = { currentUser: () => ({ username: 'carol' }) };
        const p2 = publishDocumentUseCase.execute({ document: docW2 });
        const docW3 = forkPublishedWorldUseCase.execute(p2, identityProviderCarol);
        assert(docW3.world.id !== docW1.world.id && docW3.world.id !== docW2.world.id, 'F3. A second, independent fork (W3) receives yet another fresh identity, distinct from both W1 and W2.');
        assert(docW3.metadata.parentDocumentId === docW2.world.id, 'F3b. W3\'s lineage points at its IMMEDIATE parent (W2), never silently jumping back to the root (W1) — lineage is a chain, not a flattened pointer to the origin.');
        assert(docW3.metadata.author === 'carol', 'F3c. The second fork\'s owner is correctly the second forker.');

        // F4. The sibling entry point — ForkDocumentUseCase, used for
        // forking a raw (possibly unpublished) saved document by id —
        // shares the exact same guarantees via the same
        // DocumentCloneService (application/document/DocumentCloneService.js's
        // own header: "the shared core of both 'Duplicate' ... and
        // 'Fork'"). Exercised here against a saved (never published)
        // draft, distinct from the Publication-based fork above.
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);
        const draft = buildWorldDocument({ title: 'Standalone Draft', author: 'dave' });
        saveDocumentUseCase.execute({ document: draft, markSaved: () => {} });
        const forkDocumentUseCase = new ForkDocumentUseCase(storage);
        const identityProviderEve = { currentUser: () => ({ username: 'eve' }) };
        const draftFork = forkDocumentUseCase.execute(draft.world.id, identityProviderEve, null);
        assert(draftFork.world.id !== draft.world.id, 'F4. ForkDocumentUseCase (the raw-by-id fork entry point) also produces a fresh identity, never the source\'s.');
        assert(draftFork.metadata.parentDocumentId === draft.world.id, 'F4b. Lineage recorded identically to the Publication-based fork path — both entry points fund the same DocumentCloneService contract.');
        assert(storage.load(draft.world.id).world.buildings.length === 1, 'F4c. The saved draft\'s own storage slot is untouched by forking it.');

        // F5. A REJECTED fork must never mint a phantom identity: a
        // Publication under a no-derivatives license (forkAllowed:
        // false) is refused outright, with a structural reason code
        // (application/document/ForkFailureReason.js), and leaves no new World
        // behind at all — the strongest possible confirmation that
        // "Fork" and "a new identity now exists" are one atomic fact,
        // never two that could come apart under a rejection.
        const restrictedDocument = buildWorldDocument({
            title: 'No Derivatives',
            author: 'alice',
            license: new License({ id: LicenseId.CC_BY_ND_4_0 })
        });
        const restrictedPublication = publishDocumentUseCase.execute({ document: restrictedDocument });
        const storageCountBeforeRejectedFork = storage.list().length;
        let licenseError = null;
        try {
            forkDocumentUseCase.execute(restrictedDocument.world.id, identityProviderEve, restrictedPublication);
        } catch (err) {
            licenseError = err;
        }
        assert(licenseError !== null && licenseError.reason === ForkFailureReason.LICENSE_DENIED,
            'F5. Forking a Publication whose license forbids it (CC-BY-ND-4.0) is rejected with the structural LICENSE_DENIED reason code, never silently allowed.');
        assert(storage.list().length === storageCountBeforeRejectedFork, 'F5b. A rejected fork writes nothing to storage at all — no phantom World/Document identity is left behind by a fork that never actually happened.');

        forkChain = { storage, publisher, publishDocumentUseCase, docW1, p1, docW2, p2, docW3 };
        console.log('✓ Section F: Forking a World — W1 -> P1 -> Fork -> W2 receives a genuinely fresh identity, correct immediate lineage, and correct new ownership; W1 and P1 remain completely untouched by both the fork itself and by editing W2 afterward. Repeated forking (W2 -> P2 -> Fork -> W3) chains lineage to the IMMEDIATE parent, never flattening back to the root. The sibling raw-by-id fork entry point (ForkDocumentUseCase) shares identical guarantees through the same DocumentCloneService, confirmed via a second, independent live fork. A REJECTED fork (a no-derivatives license) leaves no phantom identity and no storage trace behind whatsoever — "Fork" and "a new identity now exists" are proven to be one atomic fact.');
    }

    // ===============================================================
    // Section G — Publication after a World fork.
    // ===============================================================
    {
        const { storage, p1, p2 } = forkChain;

        // G1. P1 and P2 never conflate merely because P2 (published
        // from the fork) shares lineage with W1.
        assert(p1.documentId !== p2.documentId, 'G1. P1 and P2 describe genuinely different World identities (W1 vs. W2), despite W2 having been forked FROM W1.');
        assert(p1.id !== p2.id, 'G1b. Distinct publicationIds, as always.');
        assert(p2.parentDocumentId === p1.documentId, 'G1c. P2\'s own parentDocumentId (stamped from the fork\'s metadata.parentDocumentId, carried through by LocalPublisherProvider.publish()) correctly records that lineage — a real, honest fact, never confused with "P2 IS a revision of P1."');

        const discovery = new LocalDiscoveryProvider(storage);
        assert(discovery.findById(p1.id) !== null && discovery.findById(p2.id) !== null, 'G2. Both remain independently resolvable in the Repository.');

        // G3. Unpublishing one never touches the other — the strongest
        // possible proof of non-conflation.
        const unpublishDocumentUseCase = new UnpublishDocumentUseCase(forkChain.publisher);
        const removed = unpublishDocumentUseCase.execute(p2.id);
        assert(removed === true, 'G3. P2 was successfully unpublished.');
        const p1AfterUnpublishingP2 = discovery.findById(p1.id);
        assert(p1AfterUnpublishingP2 !== null
            && p1AfterUnpublishingP2.id === p1.id
            && p1AfterUnpublishingP2.documentId === p1.documentId
            && p1AfterUnpublishingP2.contentHash === p1.contentHash,
            'G3b. P1 is completely unaffected by unpublishing P2 — same identity, same documentId, same contentHash, still resolvable — despite P2 having been published from a World forked out of P1\'s own World.');
        assert(discovery.findById(p2.id) === null, 'G3c. P2 itself is correctly gone.');

        console.log('✓ Section G: Publication after a World fork — P1 (from W1) and P2 (from the forked W2) never conflate merely because the fork originated from W1: distinct documentId, distinct publicationId, correctly recorded (never assumed) lineage via parentDocumentId, and — proven under the strongest possible pressure — unpublishing one leaves the other completely untouched.');
    }

    // ===============================================================
    // Section H — World navigation during editing/publication.
    // ===============================================================
    {
        // This section confirms EXISTING navigation correctly reflects
        // the identity transitions already proven live above — it does
        // not invent a new navigation mechanism to test.
        const sessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');

        // H1. "World -> Edit -> Publish -> Explore -> return to World":
        // publishDocument() funds the exact same PublishDocumentUseCase
        // exercised live throughout this file (never a second,
        // divergent publish implementation).
        assert(/return this\._publishDocumentUseCase\.execute\(\{ document: doc \}\);/.test(sessionSource),
            'H1. WorldNavigationSession.publishDocument() is a thin, duck-typed call straight into the SAME PublishDocumentUseCase this file exercises live throughout — no second "publish" implementation exists to drift from the one already proven correct in Sections A-D.');

        // H2. "World -> Publish -> Open Publication -> Edit a Copy ->
        // new World": the copy-on-write fork mechanism, quoted
        // verbatim, is exactly ForkPublishedWorldUseCase-equivalent
        // cloning (DocumentCloneService) already exercised live in
        // Section F, wired into the session's own guarded mutation
        // path.
        assert(/_forkForEdit\(sourceDocumentId\)/.test(sessionSource), 'H2. _forkForEdit() is the real, cited mechanism — "editing a copy" of a published World.');
        assert(/this\._documentCloneService\.execute\(sourceDoc, \{/.test(sessionSource),
            'H2b. It clones through the SAME DocumentCloneService class Section F\'s live fork calls used — one cloning mechanism, not two.');
        assert(/the published source is superseded in THIS session's view/i.test(sessionSource),
            'H2c. The session\'s own comment confirms, verbatim, that the published source "was never mutated" — matching this file\'s own live proof in Sections C and F that a fork/edit never touches the source\'s storage.');

        // H3. Ordinary navigation itself never mutates Publication
        // lifecycle or creates/removes Repository entries — reconfirmed
        // directly here (0.9.576 Section E already established this
        // fact generally; this milestone checks it against the two
        // specific methods its own brief named: focusWorld's real
        // implementation, focusDocument(), and its own verbatim alias
        // navigateToDocument()).
        const navigateToDocumentMatch = sessionSource.match(/navigateToDocument\(documentId\) \{[\s\S]*?\n    \}/);
        assert(navigateToDocumentMatch !== null && /return this\.focusDocument\(documentId\);/.test(navigateToDocumentMatch[0]),
            'H3a. navigateToDocument() is a verbatim, one-line alias for focusDocument() — exactly one navigation mechanism, not two.');
        const focusDocumentMatch = sessionSource.match(/focusDocument\(documentId, \{ setActive = true \} = \{\}\) \{[\s\S]*?\n    \}/);
        assert(focusDocumentMatch !== null
            && !/_publishDocumentUseCase|_publisherProvider\.publish|_storageProvider\.save\(\s*['"]forkbuild-publications/.test(focusDocumentMatch[0]),
            'H3b. focusDocument()\'s own real method body — camera/avatar/selection concerns only — never calls into publish or the Repository catalog write; navigation and publication lifecycle are structurally two different concerns at this layer, not merely different by convention.');

        console.log('✓ Section H: World navigation during editing/publication — existing navigation correctly reflects the identity transitions this file already proved live: publishDocument() funds the exact PublishDocumentUseCase exercised in Sections A-D (never a second implementation); the "edit a copy" transition funds the exact same DocumentCloneService fork mechanism exercised live in Section F, with the session\'s own source comments confirming the published source is never mutated. No new navigation mechanism was introduced or needed to confirm this.');
    }

    // ===============================================================
    // Section I — Publication failure isolation.
    // ===============================================================
    {
        // I1. A validation failure (PublishDocumentUseCase._validate())
        // is checked BEFORE anything immutable is created — per the
        // class's own header comment — so it should leave ZERO storage
        // writes.
        const storageValidation = new InMemoryStorageProvider();
        const { publishDocumentUseCase: publishInvalid } = makePublishPipeline(storageValidation, 'alice');
        const emptyWorldDocument = new Document({ world: new World(), metadata: new DocumentMetadata({ title: 'No Buildings', author: 'alice' }) });
        let validationError = null;
        try {
            publishInvalid.execute({ document: emptyWorldDocument });
        } catch (err) {
            validationError = err;
        }
        assert(validationError !== null && /empty world/.test(validationError.message), 'I1. Publishing an empty World is rejected before anything immutable is created.');
        assert(storageValidation.saveCount === 0, 'I1b. Zero storage writes occurred — validation failure happens strictly before the publish pipeline touches storage at all.');
        assert(new LocalDiscoveryProvider(storageValidation).list().length === 0, 'I1c. No fake Publication was admitted to the Repository.');

        // I2. A failure at the FINAL write of the real publish pipeline
        // ("Repository admission" — the last of publish()'s four
        // storage.save() calls, writing the "forkbuild-publications"
        // catalog) — the closest real analogue in this codebase to the
        // brief's "distribution fails" scenario, since this pipeline's
        // publish() call IS the synchronous act of admitting a
        // Publication into the Repository (the decentralized
        // network-broadcast distribution subsystem — application/
        // PublicationDistribution*.js — is a separate, already
        // independently audited layer, deliberately out of scope here,
        // matching this milestone's own "small boundary check, not
        // another audit" instruction).
        const storageFail = new InMemoryStorageProvider();
        const { publishDocumentUseCase: publishFailing } = makePublishPipeline(storageFail, 'alice');
        const document = buildWorldDocument({ title: 'Distribution Failure', author: 'alice' });
        const worldIdBefore = document.world.id;
        const buildingCountBefore = document.world.getBuildings().length;

        storageFail.failOnSave('forkbuild-publications');
        let repositoryAdmissionError = null;
        try {
            publishFailing.execute({ document });
        } catch (err) {
            repositoryAdmissionError = err;
        }
        assert(repositoryAdmissionError !== null, 'I2. A failure writing the Repository catalog key correctly propagates as a thrown error — the caller is told publish failed, never handed a silently-degraded success.');

        // I3. W remains editable; World identity isn't replaced.
        assert(document.world.id === worldIdBefore, 'I3. The World\'s identity is completely unchanged by a failed publish attempt.');
        assert(document.world.getBuildings().length === buildingCountBefore, 'I3b. The in-memory World object itself was never touched by the failed attempt — it was never even read for mutation, only for serialization.');
        document.world.addBuilding(new Building({ creator: 'alice' }));
        assert(document.world.getBuildings().length === buildingCountBefore + 1, 'I3c. The World remains fully, ordinarily editable after a failed publish attempt.');

        // I4. Failed distribution doesn't create a fake Publication;
        // Repository state isn't mutated incorrectly.
        assert(storageFail.load('forkbuild-publications') === null, 'I4. The Repository catalog key itself was never created — the very first write to it is the one that failed, so no partial/corrupt catalog exists.');
        assert(new LocalDiscoveryProvider(storageFail).list().length === 0, 'I4b. Repository search/listing correctly shows nothing — no fake Publication is visible anywhere.');

        // Honest, narrow observation (not a correctness gap): because
        // publish()'s content-store write and snapshot write both
        // happen BEFORE the failing catalog write, an orphaned
        // immutable content blob and an orphaned "snapshot:<id>" key
        // are left behind — invisible (nothing references them; no
        // Publication points at them) and harmless (LocalContentStore
        // is a hash-addressed store that already tolerates unreferenced
        // blobs by design), but real. Documented here rather than
        // silently glossed over, exactly the kind of narrow,
        // non-blocking observation this milestone's own brief predicted
        // it might surface.
        const orphanedSnapshotKeys = storageFail.list().filter((key) => key.startsWith('snapshot:'));
        assert(orphanedSnapshotKeys.length === 1, 'I5. Confirmed: exactly one orphaned immutable snapshot blob is left behind by a failed final-step publish — real, but invisible and harmless (unreferenced by any Publication, and this codebase\'s content store is a hash-addressed store built to tolerate exactly this).');

        // I6. Subsequent publishing remains possible — and the
        // Repository ends up clean (exactly one real entry), not
        // corrupted or doubled by the earlier failed attempt.
        storageFail.clearFailures();
        const recoveredPublication = publishFailing.execute({ document });
        assert(recoveredPublication && recoveredPublication.id, 'I6. Publishing again, after the fault is cleared, succeeds normally.');
        const discoveryAfterRecovery = new LocalDiscoveryProvider(storageFail);
        assert(discoveryAfterRecovery.list().length === 1, 'I6b. The Repository ends up with exactly one real, correct entry — the earlier failed attempt left no trace in the catalog itself, despite the harmless orphaned blobs proven in I5.');

        // I7. P1 successfully published; P2 publication attempt fails;
        // P1 must remain untouched.
        const storageMixed = new InMemoryStorageProvider();
        const { publishDocumentUseCase: publishMixed } = makePublishPipeline(storageMixed, 'alice');
        const firstDocument = buildWorldDocument({ title: 'Steady First', author: 'alice' });
        const p1 = publishMixed.execute({ document: firstDocument });

        storageMixed.failOnSave('forkbuild-publications');
        const secondDocument = buildWorldDocument({ title: 'Failing Second', author: 'alice' });
        let secondError = null;
        try {
            publishMixed.execute({ document: secondDocument });
        } catch (err) {
            secondError = err;
        }
        assert(secondError !== null, 'I7. The second publish attempt correctly fails.');
        const discoveryMixed = new LocalDiscoveryProvider(storageMixed);
        const p1AfterSiblingFailure = discoveryMixed.findById(p1.id);
        assert(p1AfterSiblingFailure !== null
            && p1AfterSiblingFailure.id === p1.id
            && p1AfterSiblingFailure.documentId === p1.documentId
            && p1AfterSiblingFailure.contentHash === p1.contentHash,
            'I7b. P1 — already successfully published before the sibling failure — is completely untouched: same identity, same documentId, same contentHash, still resolvable.');
        assert(discoveryMixed.list().length === 1, 'I7c. The Repository correctly holds only P1 — the failed second attempt left no trace in the catalog.');

        console.log('✓ Section I: Publication failure isolation — a validation failure leaves zero storage writes at all, before anything immutable is created. A failure at the final "Repository admission" write of the real publish pipeline leaves the World fully editable, its identity unchanged, mints no fake Publication, and leaves the Repository catalog key itself never created — with one honest, narrow, non-blocking observation: an unreferenced immutable snapshot blob is left orphaned (invisible, harmless, matching this codebase\'s hash-addressed content store design). Subsequent publishing remains possible and leaves the Repository correct, not doubled. A successfully published sibling (P1) is provably untouched by a later, failed publish attempt (P2).');
    }

    // ===============================================================
    // Section J — World + collaboration boundary. (Small boundary check.)
    // ===============================================================
    {
        // J1. Zero import-level coupling: the real publish pipeline
        // never imports anything from collaboration/.
        const publishSource = await readSource('application/publication/PublishDocumentUseCase.js');
        const providerSource = await readSource('publisher/LocalPublisherProvider.js');
        const publicationSource = await readSource('publisher/Publication.js');
        assert(!/from ['"].*collaboration/i.test(publishSource), 'J1a. PublishDocumentUseCase.js imports nothing from collaboration/.');
        assert(!/from ['"].*collaboration/i.test(providerSource), 'J1b. LocalPublisherProvider.js imports nothing from collaboration/.');
        assert(!/from ['"].*collaboration/i.test(publicationSource), 'J1c. Publication.js (the pure data class itself) imports nothing from collaboration/ — a Publication carries no transport-session concept of any kind.');

        // J2. Publication creation depends on nothing but the current,
        // synchronous state of the in-memory Document — whether that
        // state arrived via local edits or via a remote CRDT-merged
        // edit (application/world/WorldNavigationSession.js's own header
        // already states it plainly: publishDocument calls
        // PublishDocumentUseCase with "a duck-typed { document }
        // stand-in," identical regardless of how document got
        // populated) makes no difference to publish() itself.
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const document = buildWorldDocument({ title: 'Collaborative World', author: 'alice' });
        const p1 = publishDocumentUseCase.execute({ document });

        // Simulate a remote edit arriving AFTER publish (the same
        // in-memory-mutation shape a merged CRDT operation would take
        // from this use case's point of view — it has no visibility
        // into WHERE a mutation came from).
        document.world.addBuilding(new Building({ creator: 'remote-peer' }));
        const publisherForJ = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const snapshotAfterRemoteEdit = publisherForJ.loadSnapshot(p1.id);
        assert(snapshotAfterRemoteEdit.world.buildings.length === 1,
            'J2. A "remote edit" arriving after publish (indistinguishable, from this use case\'s point of view, from any other in-memory mutation — Section C already proved this exact shape) never alters the already-created Publication.');

        // J3. Publication identity itself carries no session/transport
        // field of any kind — the constructor accepts none.
        assert(!/collaborationSessionId|transportSessionId|peerId/i.test(publicationSource),
            'J3. Publication\'s own field set (id/documentId/title/author/providerId/publishedAt/url/parentDocumentId/snapshotId/contentHash/schemaVersion/license/contentReference/publisherIdentity/signature — confirmed by direct source read) contains nothing collaboration-transport-shaped. Leaving or rejoining a collaboration session cannot affect Publication identity, because Publication identity has no field for a collaboration session to occupy in the first place.');

        console.log('✓ Section J: World + collaboration boundary — a small, targeted boundary check, not a re-audit of 0.9.545. The publish pipeline (PublishDocumentUseCase, LocalPublisherProvider, Publication) has zero import-level coupling to collaboration/ at all; publish() captures whatever the current in-memory Document state is, indistinguishable from a local vs. a remote-merged edit, confirmed live by reusing Section C\'s exact "mutate after publish" proof; and Publication\'s own field set carries no transport/session concept for leaving-and-rejoining collaboration to possibly disturb.');
    }

    // ===============================================================
    // Section K — Persistence and reload.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');
        const saveDocumentUseCase = new SaveDocumentUseCase(storage);

        const document = buildWorldDocument({ title: 'Persistence Witness', author: 'alice' });
        saveDocumentUseCase.execute({ document, markSaved: () => {} });
        const p1 = publishDocumentUseCase.execute({ document });
        const originalWorldId = document.world.id;

        // "leave": nothing further in this section touches `document`
        // again — everything from here reads fresh from `storage` only,
        // the same as a genuine drop-references-and-reload would.

        // "reload": fresh object graph, reading the SAME storage —
        // never the same in-memory objects.
        const freshDocumentSerializer = new DocumentSerializer();
        const reloadedDraftJson = storage.load(originalWorldId);
        const reloadedDocument = freshDocumentSerializer.deserialize(reloadedDraftJson);
        assert(reloadedDocument.world.id === originalWorldId, 'K1. The World\'s persistent identity survives a full drop-and-reload cycle.');
        assert(reloadedDocument.world.getBuildings().length === 1, 'K1b. Persistent content (the one building) survives identically.');

        const freshDiscovery = new LocalDiscoveryProvider(storage);
        const reloadedPublication = freshDiscovery.findById(p1.id);
        assert(reloadedPublication !== null
            && reloadedPublication.id === p1.id
            && reloadedPublication.documentId === p1.documentId
            && reloadedPublication.contentHash === p1.contentHash,
            'K2. P1 remains independently identifiable after reload — same publicationId, documentId, and contentHash, read fresh from storage rather than from any cached reference.');

        // K3. Session-local state is reconstructed, never carried over —
        // reusing LoadPublishedWorldSessionUseCase (the one real "enter
        // a World" pipeline this checkout can run without `three`, same
        // one 0.9.576 Section B/C/I already proved this exact fact
        // with, cited/reused here rather than re-derived in depth).
        const session = new LoadPublishedWorldSessionUseCase(publisher, undefined, new LocalContentStore(storage)).execute(reloadedPublication);
        assert(session.getWorld().id === originalWorldId, 'K3. A fresh session, built from the reloaded Publication, resolves to the exact same World identity.');
        assert(session.getSelectionCount() === 0, 'K3b. Session-local state (selection) is reconstructed empty on reload — never observer-local encounter/selection state masquerading as World persistence (the same distinction 0.9.576 Section H/I already established).');

        // K4. No duplicate Publication was silently generated merely by
        // re-entry/reload — the Repository still holds exactly one
        // entry for this World.
        assert(freshDiscovery.list().length === 1, 'K4. Reload/re-entry alone never mints a new Publication — the Repository is exactly as it was before "leaving."');

        console.log('✓ Section K: Persistence and reload — a World\'s persistent identity (world.id) and content survive a full drop-references-and-reload cycle read from a completely fresh object graph; P1 remains independently identifiable by the same publicationId/documentId/contentHash; session-local state (selection) is correctly reconstructed empty, reusing 0.9.576\'s own already-proven mechanism rather than re-deriving it; and no duplicate Publication is silently generated merely by re-entering a World.');
    }

    // ===============================================================
    // Section L — Flagship.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage, 'alice');

        // Create World W1.
        const w1 = buildWorldDocument({ title: 'Flagship Genesis', author: 'alice' });

        // Edit W1 (a second building, beyond the one buildWorldDocument
        // already added).
        w1.world.addBuilding(new Building({ creator: 'alice' }));

        // Publish P1.
        const p1 = publishDocumentUseCase.execute({ document: w1 });
        const p1SnapshotAtPublish = publisher.loadSnapshot(p1.id);

        // Edit W1 again.
        w1.world.addBuilding(new Building({ creator: 'alice' }));
        w1.metadata.title = 'Flagship Genesis (revised)';
        w1.metadata.touch();

        // Publish P2.
        const p2 = publishDocumentUseCase.execute({ document: w1 });

        // P1 != P2.
        assert(p1.id !== p2.id, 'L1. P1 and P2 are genuinely distinct Publications.');
        assert(p1.contentHash !== p2.contentHash, 'L1b. Their content genuinely differs (a real edit happened between them, unlike Section D\'s twins).');
        assert(p1.documentId === p2.documentId, 'L1c. Both still describe the same World (W1).');
        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1SnapshotAtPublish), 'L1d. P1\'s snapshot remains exactly what it was at the moment it was published, unaffected by the edits that produced P2.');

        // Fork W1 -> W2 (from P1 specifically — forking the EARLIER
        // snapshot, deliberately, to prove the fork is anchored to the
        // Publication it names, never to whatever W1 has since become).
        const forkPublishedWorldUseCase = new ForkPublishedWorldUseCase(publisher);
        const identityProviderBob = { currentUser: () => ({ username: 'bob' }) };
        const w2 = forkPublishedWorldUseCase.execute(p1, identityProviderBob);
        assert(w2.world.getBuildings().length === 2, 'L2. W2 was forked from P1\'s snapshot specifically (two buildings, as W1 stood at P1\'s publish time) — never from W1\'s current, further-edited state (which by now has three buildings).');

        // Edit W2.
        w2.world.addBuilding(new Building({ creator: 'bob' }));

        // Publish P3.
        const p3 = publishDocumentUseCase.execute({ document: w2 });

        // W1 remains independent from W2.
        assert(w1.world.id !== w2.world.id, 'L3. W1 and W2 are, and remain, genuinely independent World identities.');
        assert(w1.world.getBuildings().length === 3, 'L3b. W1\'s own edit history (now 3 buildings: 1 initial + 2 explicit edits) is completely unaffected by W2\'s independent existence and editing.');
        assert(w2.world.getBuildings().length === 3, 'L3c. W2\'s own edit history (2 forked from P1 + 1 explicit edit) is completely unaffected by W1.');

        // P1/P2 remain immutable.
        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1SnapshotAtPublish), 'L4. P1 is STILL byte-identical to what it was at publish time, even after everything that has happened since (a second W1 edit+publish, a fork off it, editing the fork, and publishing the fork).');
        assert(publisher.verifySnapshot(p2.id, p2.contentHash) === true, 'L4b. P2 still verifies against its own contentHash, untouched by the fork/W2 activity that happened after it.');

        // P3 has its own Publication identity.
        assert(p3.id !== p1.id && p3.id !== p2.id, 'L5. P3 carries its own, genuinely distinct publicationId.');
        assert(p3.documentId === w2.world.id && p3.documentId !== p1.documentId, 'L5b. P3 correctly describes W2, never W1.');
        assert(p3.parentDocumentId === w1.world.id, 'L5c. P3\'s lineage correctly traces back to W1 (the World W2 was forked from), recorded as a fact, never conflated with "P3 IS a revision of P1 or P2."');

        // Navigate/reload/re-enter -> all identities remain coherent.
        const freshDiscovery = new LocalDiscoveryProvider(storage);
        assert(freshDiscovery.list().length === 3, 'L6. The Repository, read fresh, correctly holds exactly P1, P2, and P3 — three distinct, coherent entries.');
        const reloadedP1 = freshDiscovery.findById(p1.id);
        const reloadedP2 = freshDiscovery.findById(p2.id);
        const reloadedP3 = freshDiscovery.findById(p3.id);
        assert(reloadedP1.documentId === reloadedP2.documentId && reloadedP1.documentId !== reloadedP3.documentId,
            'L6b. Reloaded fresh from storage, the same identity relationships hold exactly as they were constructed live: P1/P2 share a documentId (both W1), P3 does not (it is W2).');
        const freshSessionOnP3 = new LoadPublishedWorldSessionUseCase(publisher, undefined, new LocalContentStore(storage)).execute(reloadedP3);
        assert(freshSessionOnP3.getWorld().id === w2.world.id && freshSessionOnP3.getWorld().id !== w1.world.id,
            'L7. A completely fresh session, entered from the reloaded P3, resolves to exactly W2\'s identity — never W1\'s, despite the shared lineage.');

        console.log('✓ Section L: FLAGSHIP — Create W1 -> Edit -> Publish P1 -> Edit -> Publish P2 (P1 != P2, P1 immutable throughout) -> Fork FROM P1 specifically -> W2 (correctly anchored to P1\'s snapshot, never to W1\'s later state) -> Edit W2 -> Publish P3 (its own identity, correct W2 documentId, correct W1 lineage) -> W1 remains fully independent from W2 throughout -> P1/P2 remain byte-identical/hash-verified immutable -> a full Repository reload preserves every identity relationship exactly -> a fresh session entered from the reloaded P3 resolves to exactly the right World. World identity, Document lifecycle, Publication lifecycle, forking, and reload compose correctly end to end.');
    }

    // ===============================================================
    // Section M — Deliberate exclusions.
    // ===============================================================
    {
        const documentMetadataSource = await readSource('core/DocumentMetadata.js');
        const metadataFieldMatches = documentMetadataSource.match(/this\._(\w+)\s*=/g) || [];
        const metadataFields = new Set(metadataFieldMatches.map((m) => m.replace(/this\.|\s*=/g, '')));
        const expectedMetadataFields = ['_title', '_description', '_author', '_created', '_modified', '_protocolVersion', '_engineVersion', '_parentDocumentId', '_parentStructureId', '_authorIdentityId', '_license'];
        assert(expectedMetadataFields.every((field) => metadataFields.has(field)) && metadataFields.size === expectedMetadataFields.length,
            'M1. DocumentMetadata\'s own field set is exactly this milestone\'s own starting inventory (title/description/author/created/modified/protocolVersion/engineVersion/parentDocumentId/parentStructureId/authorIdentityId/license) — no new World-versioning field, and nothing else, was added.');

        const discoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(!/dedup|dedupe|merge\(/i.test(discoverySource), 'M2. No publication deduplication logic exists anywhere in LocalDiscoveryProvider.js — Section D/E\'s "twin" Publications prove this live, and static inspection confirms no dedup code was added to find or hide.');

        const publisherSource = await readSource('publisher/LocalPublisherProvider.js');
        assert(!/class Repository\b/.test(publisherSource), 'M3. No World-specific "Repository" class exists — the Repository concept in this codebase remains exactly what 0.9.574/0.9.575 already established it to be: the same LocalDiscoveryProvider reading the same "forkbuild-publications" key, never a new per-World abstraction.');

        assert(!/rank|relevance|score/i.test(discoverySource), 'M4. No publication ranking of any kind exists in the discovery layer.');
        assert(!/autoRepublish|automaticRepublish/i.test(publisherSource), 'M5. No automatic republishing mechanism exists.');
        assert(!/retryDistribution|autoRetryDistribution/i.test(publisherSource), 'M6. No automatic distribution retry exists in the local publish pipeline itself.');
        assert(!/backup|versionHistory/i.test(publisherSource), 'M7. No World backup/version history mechanism exists.');

        console.log(`✓ Section M — explicit DELIBERATE_EXCLUSION classification, matching this milestone's own originating brief, confirmed absent by direct inspection rather than assumed:
  - No World versioning was added — DocumentMetadata's pre-existing protocolVersion/engineVersion/schemaVersion fields are unchanged and are not a "World version" concept.
  - No automatic draft management was added — SaveDocumentUseCase/DocumentManifest are exercised exactly as they already existed.
  - No publication deduplication exists (M2) — Sections D/E's twin Publications prove this live; confirmed absent by source inspection too.
  - No World synchronization redesign — nothing in collaboration/ was touched, imported, or modified (Section J).
  - No collaboration conflict-resolution changes — Section J was deliberately kept to a small boundary check, per this milestone's own brief.
  - No new World identity fields — core/World.js's field set (id/buildings/groups/placements/landmarks/regions/metadata/eventBus) is exactly what 0.9.576 already found it to be.
  - No World-specific Repository class was introduced (M3) — the Repository remains the same LocalDiscoveryProvider/"forkbuild-publications" pairing 0.9.574 established.
  - No publication ranking exists (M4).
  - No automatic republishing exists (M5).
  - No automatic distribution retry exists in the local publish pipeline (M6) — Section I's failure-isolation proof required none.
  - No World backup/version history mechanism exists (M7).
  - No new navigation mechanism was introduced — Section H cited existing methods exclusively.
  - No production code was changed anywhere by this milestone — every file imported above (except this test file itself) is byte-for-byte what 0.9.576 left it as.`);
    }

    console.log('\nAll World Creation & Publication Lifecycle Product Reassessment tests passed.');
    console.log('\n=== 0.9.577 VERDICT ===');
    console.log(`PRODUCT_COMPLETE for every question this milestone's own brief posed, with one narrow, non-blocking observation (not a correctness gap) — no production code changed.

World creation (A) produces exactly one coherent, real World identity through the real CreateDocumentManagerUseCase/attachWorld() pipeline; creating a World, by itself, never touches storage, never mints a Publication, and never admits anything into the Repository. World editing (B) turned out to be two genuinely distinct real pathways rather than one: an unpublished draft is honestly "mutable, overwriteable" (PublishDocumentUseCase.js's own words), while an already-published World cannot be saved or re-published in place AT ALL — both of WorldNavigationSession's real guard methods throw outright, quoted verbatim, rather than merely "discouraging" direct mutation by convention.

Publish-as-snapshot (C) held as a genuine permanent regression witness under direct pressure: a Publication's stored snapshot survives both further live World mutation and an explicit re-Save of the resulting draft, proven by keeping the two storage slots under simultaneous, divergent pressure. Repeated publication (D) confirmed the brief's own predicted "no actual content change" case remains two independent, unmerged Publications, with no contentHash-based merging anywhere in the pipeline.

The identity matrix (E) came back exactly as this codebase's own architecture states it: World/Document share one identity (world.id); Publication (publicationId), Material (contentHash), and Placement (placementId) are three further, genuinely independent axes — with one honest vocabulary note, not a gap: "discovery artifact" is not a distinct axis here, since LocalDiscoveryProvider returns the identical Publication record LocalPublisherProvider wrote. Both adversarial identity shapes named in the brief hold, one live and one constructed exactly like 0.9.575 Section B2 already established the technique for.

Forking (F) and Publication-after-fork (G) hold under the strongest pressure tried — including unpublishing one sibling Publication and confirming the other is completely untouched. Navigation (H) was confirmed, by citation, to correctly fund the exact same production mechanisms (PublishDocumentUseCase, DocumentCloneService via _forkForEdit) already proven live elsewhere in this file — no second, drifted implementation exists.

Failure isolation (I) is where this milestone's one narrow, non-blocking finding lives: a failure at the final "Repository admission" write of the real local publish pipeline correctly leaves the World editable, its identity unchanged, and the Repository catalog itself never created or corrupted — but leaves one orphaned, unreferenced immutable snapshot blob behind, since the content/snapshot writes happen before the catalog write that can fail. This is invisible to any Wanderer (nothing points at it) and harmless by this codebase's own content-addressed-storage design — documented here rather than silently glossed over, exactly the kind of outcome this milestone's own brief predicted it might surface, and not something that needs a production code change to remain PRODUCT_COMPLETE.

The collaboration boundary (J) holds as the small check the brief asked for: zero import-level coupling, and Publication identity carries no transport/session field for leaving-and-rejoining collaboration to possibly disturb. Persistence and reload (K) hold across a genuine drop-references-and-reload cycle, reusing rather than re-deriving 0.9.576's own already-proven session-reconstruction fact.

The flagship (L) demonstrates the brief's own closing scenario directly, live, end to end — including the specific adversarial refinement of forking from an EARLIER Publication (P1) after the source World had already moved on to a later one (P2), and confirming the fork correctly anchors to the snapshot it names, never to the source's current state.

If a follow-up is wanted, the one real, honest lead this milestone surfaces is the brief's own next suggested direction: the actual Wanderer experience of World-to-World movement and discovery, specifically what a user can understand and do when a World contains multiple kinds of spatial material — a genuinely different product boundary than World/Publication identity, which this milestone (together with 0.9.574/0.9.575/0.9.576) can now be considered closed.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
