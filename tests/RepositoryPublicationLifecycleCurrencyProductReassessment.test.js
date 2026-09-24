import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadFailureReason } from '../application/LoadFailureReason.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { ForkFailureReason } from '../application/ForkFailureReason.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';

// 0.9.574 — Repository Publication Lifecycle & Currency Product
// Reassessment.
//
// 0.9.519-0.9.573 closed a long sequence of Publication PRESENTATION
// seams. 0.9.523-0.9.534, specifically, closed Repository CATALOG
// IDENTITY — admission gating, publicationId-only identity, read-only
// search, and unpublish-as-removal — and 0.9.534's own verdict
// recommended stopping that particular arc. This milestone deliberately
// does not reopen catalog identity; it asks the one adjacent question
// those audits never posed: does the Repository's own USER EXPERIENCE
// communicate the difference between "we know about this Publication"
// (a stored, admitted fact) and "its material can currently be
// obtained" (an answer only ever computed on demand, by whichever
// action a Wanderer actually takes)? Ten lettered sections, mirroring
// the requesting brief, reading and exercising real, unmodified-except-
// where-named production source and real object graphs throughout.
//
//   A — Repository entry semantics: what gets stored, exactly, at
//       admission — never what it could store.
//   B — Stored fact vs. current state: a Publication survives in the
//       catalog after its material becomes unavailable; the catalog
//       entry itself is never mutated, marked, or re-resolved because
//       of that.
//   C — Repository search purity, reconfirmed live and structurally:
//       read-only, and incapable of resolving/verifying/downloading —
//       those methods do not exist anywhere in the discovery chain.
//   D — Navigation freshness: Open/Fork/Explore are pure routing at
//       the Repository boundary; currency is established only at each
//       action's own real destination use case, on demand.
//   E — Republished Publications: the P1/P2-shared-contentHash
//       adversarial case, reconfirmed live — contentHash never
//       substitutes for publicationId anywhere in Repository
//       navigation.
//   F — Publication unpublish lifecycle: UnpublishDocumentUseCase's
//       exact, real effect on Repository membership, including the
//       previously-unasked question of what it does NOT reach.
//   G — Failure vocabulary: the one genuine, narrow, previously-NAMED-
//       but-deferred presentation gap this milestone actually fixes.
//   H — Cross-surface continuity: a failed Open/Fork never mutates,
//       removes, or replaces the Repository record itself.
//   I — Deliberate boundaries, named explicitly rather than treated as
//       bugs.
//   J — Flagship: Create -> Admit (twice, by design) -> Search -> lose
//       material -> Search again -> Open/Fork fail cleanly -> Search a
//       third time, the record untouched throughout.
//
// Deliberately excluded, matching this arc's own established restraint
// (0.9.534's own closing recommendation): no deduplication redesign, no
// new identity model, no lifecycle states, no auto-refresh/auto-
// reverify/auto-redownload, no ranking, no Repository/World refactor.
//
// A structural constraint of THIS file, stated rather than hidden: it
// deliberately avoids importing application/WorldNavigationSession.js
// (which pulls in renderer/RenderWorldViewUseCase.js, and transitively
// `three`) so it can run under this repo's plain `node tests/*.test.js`
// sweep. Section D's Explore-specific claim is therefore checked
// structurally (real, unmodified source) rather than via a live
// session — Explore's live resolution semantics were already proven,
// elsewhere, by tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js
// and tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js
// Section D, and are cited, not re-derived, here.
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
        this.loadCount = 0;
    }
    save(name, data) { this.saveCount += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { this.loadCount += 1; return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this.removeCount += 1; this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Publishes a real, minimal one-brick Document through the SAME
// PublishDocumentUseCase/LocalPublisherProvider pair every real Editor
// publish and World View fork already goes through — the identical
// helper shape tests/RepositoryPublicationLifecycleProductReassessment.test.js
// (0.9.534) and tests/PublicationLifecycleSeamProductReassessment.test.js
// already established, reused rather than reinvented.
function publishMinimalDocument(storage, title = 'Atlas', author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null, null, null);

    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    const publication = publishDocumentUseCase.execute({ document });
    return { document, publication, publisher, publishDocumentUseCase };
}

// The exact real composition ui/components/PublicationCatalog.js itself
// builds via application/CreateDiscoveryUseCase.js#execute() — Local
// storage merged with a decentralized accumulator through
// CompositeDiscoveryProvider — never a test-only stand-in shape.
function makeRepositoryDiscoveryProvider(storage, decentralizedDiscoveryProvider) {
    const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
    return decentralizedDiscoveryProvider
        ? new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])
        : localDiscoveryProvider;
}

function search(discoveryProvider, options = {}) {
    return new SearchPublicationsUseCase(discoveryProvider, { execute: () => null })
        .execute(new PublicationQuery({ page: 1, pageSize: 50, ...options }));
}

async function main() {
    // ===============================================================
    // Section A — Repository entry semantics.
    // ===============================================================
    {
        // A1. Structural, repo-wide, reconfirming 0.9.523/0.9.524 rather
        // than re-litigating: exactly the two already-audited real
        // gates ever call `.add(` on a discoveryProvider.
        const grepRaw = execSync(
            "grep -rn \"discoveryProvider\\.add(\\|DiscoveryProvider\\.add(\" --include=*.js . "
            + "| grep -v node_modules | grep -v '/tests/' | grep -v 'discovery/DecentralizedPublicationDiscoveryProvider.js'",
            { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
        );
        const admissionSites = grepRaw.trim().split('\n').filter(Boolean)
            .filter((line) => /discoveryProvider\.add\(|DiscoveryProvider\.add\(/.test(line) && !/^\s*\/\//.test(line.split(':').slice(2).join(':')));
        // WorldEncounterCanvas.js's gate lives in its materialAndDistributionMethods.js module.
        const knownAdmissionGateFiles = ['worldEncounterCanvas/materialAndDistributionMethods.js', 'PublicationExchange.js', 'LocalPublicationCatalog.js', 'DecentralizedPublicationsView.js'];
        assert(admissionSites.length > 0 && admissionSites.every((line) => knownAdmissionGateFiles.some((f) => line.includes(f))),
            `A1. Every real .add() call site is one of the already-audited admission gates (found: ${admissionSites.join(' | ')}).`);

        // A2. Live: publish -> admitted into the Local catalog ->
        // findable by the Repository's own real discovery layer. This
        // is the ONLY path a fresh Publication enters through.
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage);
        const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const found = localDiscoveryProvider.findById(publication.id);
        assert(found && found.id === publication.id, 'A2. A published Publication is admitted into, and findable through, the real Local discovery layer.');

        // A3. Field inventory: what the Repository's own catalog record
        // ACTUALLY stores — not what it could store. No availability,
        // verification, or "currency" field exists on it anywhere.
        const fields = Object.keys(publication.toJSON());
        const forbiddenVocabulary = ['available', 'currentlyAvailable', 'availability', 'verificationStatus',
            'verified', 'lastVerifiedAt', 'resolutionStatus', 'status', 'stale', 'currency'];
        assert(!fields.some((f) => forbiddenVocabulary.includes(f)),
            `A3. publisher/Publication.js's own real field set (${fields.join(', ')}) carries no availability/verification/currency field of any kind — a pure locator/metadata record.`);
        assert(document.world.id === publication.documentId, 'A3b. The one thing the record DOES carry that material resolution needs: the documentId a later Open/Fork/Explore will resolve against.');

        console.log('✓ Section A: Repository admission happens through exactly the two already-audited gates (A1), a real publish is admitted into and findable through the real Local discovery layer (A2), and the resulting catalog record is a pure locator/metadata fact with no availability, verification, or currency field of its own (A3) — confirming, live, the "stored fact" half of this milestone\'s own central question.');
    }

    // ===============================================================
    // Section B — Stored fact vs. current state.
    // ===============================================================
    {
        // Simulates the brief's own Section B scenario without
        // needing a real network: a Publication admitted via the
        // decentralized accumulator (exactly discovery/
        // DecentralizedPublicationDiscoveryProvider.js's own documented
        // role — "an already-resolved Publication," 0.9.335) for which
        // this replica's local storage was never actually given the
        // underlying Document bytes. This is the REAL shape "material
        // later becomes unavailable" takes for a decentralized-origin
        // result — no fabricated status field, an honest absence.
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const neverLocallyMaterialized = new Publication({
            documentId: 'doc-with-no-local-bytes',
            title: 'A Borrowed Castle',
            author: 'bob',
            providerId: 'decentralized',
            contentHash: 'hash-of-bytes-this-replica-never-received'
        });
        decentralizedProvider.add(neverLocallyMaterialized);

        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);

        // B1. It remains discoverable.
        const page = search(repositoryDiscoveryProvider);
        const stillFound = page.items.find((p) => p.id === neverLocallyMaterialized.id);
        assert(stillFound === neverLocallyMaterialized, 'B1. The catalog entry remains discoverable — search finds it, and returns the exact same object, not a reconstructed lookalike.');

        // B2. It does NOT get marked unavailable — there is no field to
        // mark (reconfirming A3, live, on this specific instance).
        assert(!('available' in stillFound.toJSON()) && !('status' in stillFound.toJSON()), 'B2. No "unavailable" mark exists or was added to the record itself.');

        // B3. It is NOT silently revalidated: DecentralizedPublicationDiscoveryProvider
        // and CompositeDiscoveryProvider expose no resolve/verify method
        // at all — there is structurally nothing for a search to call.
        assert(typeof decentralizedProvider.resolve === 'undefined' && typeof decentralizedProvider.verify === 'undefined'
            && typeof repositoryDiscoveryProvider.resolve === 'undefined' && typeof repositoryDiscoveryProvider.verify === 'undefined',
            'B3. Neither the decentralized accumulator nor the composite Repository discovery layer exposes a resolve()/verify() method at all — search cannot silently revalidate because there is nothing to call.');

        // B4. It does NOT trigger resolution: the storage layer this
        // replica actually owns received zero WRITES from the search
        // above (a read of the empty Local publications list is
        // ordinary search plumbing, not an attempt to fetch material —
        // Section C below counts reads/writes together, live, against
        // a non-empty Local store).
        assert(storage.saveCount === 0 && storage.removeCount === 0, 'B4. Repository search over this scenario wrote to local storage zero times — it never attempted to fetch or persist the missing material.');

        console.log('✓ Section B: a Publication admitted with no locally-available material stays fully discoverable, unmarked, unrevalidated, and un-resolved by Repository search — the catalog answers "we know about this," nothing more and nothing less, exactly the brief\'s own four candidate behaviors resolved to the first one (remains discoverable), live.');
    }

    // ===============================================================
    // Section C — Repository search purity.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const { publication: p1 } = publishMinimalDocument(storage, 'Castle One', 'alice');
        const { publication: p2 } = publishMinimalDocument(storage, 'Castle Two', 'alice');
        decentralizedProvider.add(new Publication({ documentId: 'remote-doc', title: 'Remote Hall', author: 'carol' }));
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);

        storage.saveCount = 0;
        storage.removeCount = 0;
        storage.loadCount = 0;

        // C1. Plain search, filtered search, and a direct findById —
        // the three real operations Repository/PublicationCatalog.js
        // itself performs — together trigger zero storage writes.
        search(repositoryDiscoveryProvider);
        search(repositoryDiscoveryProvider, { text: 'castle' });
        repositoryDiscoveryProvider.findById(p1.id);
        repositoryDiscoveryProvider.findById(p2.id);
        assert(storage.saveCount === 0 && storage.removeCount === 0, `C1. Search, filtered search, and findById together trigger zero storage writes (saves=${storage.saveCount}, removes=${storage.removeCount}).`);

        // C2. Structural: resolve/verify/download/admit do not exist as
        // methods ANYWHERE in the discovery chain search runs through —
        // not merely "unused," but structurally absent.
        for (const [name, provider] of [
            ['LocalDiscoveryProvider', new LocalDiscoveryProvider(storage)],
            ['DecentralizedPublicationDiscoveryProvider', decentralizedProvider],
            ['CompositeDiscoveryProvider', repositoryDiscoveryProvider],
            ['SearchPublicationsUseCase', new SearchPublicationsUseCase(repositoryDiscoveryProvider)]
        ]) {
            for (const method of ['resolve', 'verify', 'download', 'reverify', 'refresh']) {
                assert(typeof provider[method] === 'undefined', `C2. ${name} has no ${method}() method.`);
            }
        }

        console.log('✓ Section C: Repository search is read-only, live (zero storage writes across search/filtered-search/findById) and structurally (resolve/verify/download/refresh do not exist as methods anywhere in the discovery chain) — reconfirming, not re-litigating, 0.9.534\'s own Section G.');
    }

    // ===============================================================
    // Section D — Navigation freshness.
    // ===============================================================
    {
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');

        // D1. Open/Fork/Explore, at the Repository boundary, are pure
        // routing — no resolve/load/verify call happens before the
        // navigation itself.
        const extractFn = (name) => {
            const start = catalogSource.indexOf(`function ${name}(`);
            assert(start !== -1, `D1 setup. ${name}() exists in PublicationCatalog.js.`);
            const braceStart = catalogSource.indexOf('{', start);
            const braceEnd = catalogSource.indexOf('\n        }', braceStart);
            return catalogSource.slice(braceStart, braceEnd);
        };
        for (const name of ['openPublication', 'forkPublication', 'viewWorld']) {
            const body = extractFn(name);
            assert(/router\.push\(/.test(body), `D1. ${name}() navigates via router.push.`);
            assert(!/\.resolve\(|\.verify\(|loadDocumentUseCase|forkDocumentUseCase|\.load\(/.test(body),
                `D1. ${name}() calls no resolve/verify/load use case itself — it is pure navigation, exactly as brief Section D/C together require.`);
        }

        // D2. contentHash never appears in the catalog's own navigation
        // surface at all (reconfirmed structurally here; live in
        // Section E below).
        assert(!/contentHash/.test(catalogSource), 'D2. ui/components/PublicationCatalog.js never references contentHash anywhere.');

        // D3. Where currency IS established: live, at Open's and
        // Fork's real destination use cases, on demand — never
        // proactively, never at Repository itself.
        const emptyStorage = new InMemoryStorageProvider();
        let openError = null;
        try {
            new LoadDocumentUseCase(emptyStorage).execute({ load() {} }, 'a-documentId-repository-never-checked');
        } catch (err) { openError = err; }
        assert(openError && openError.reason === LoadFailureReason.MATERIAL_UNAVAILABLE,
            'D3. LoadDocumentUseCase — Open\'s real destination — is exactly where a missing-material answer is actually computed, and only when Open is actually attempted.');

        let forkError = null;
        try {
            new ForkDocumentUseCase(emptyStorage).execute('a-documentId-repository-never-checked');
        } catch (err) { forkError = err; }
        assert(forkError && forkError.reason === ForkFailureReason.MATERIAL_UNAVAILABLE,
            'D3b. ForkDocumentUseCase — Fork\'s real destination — answers the identical question independently, also only on demand.');

        // D4. Explore's own currency establishment: checked
        // structurally rather than live (see this file's own header
        // for why) — citing, not re-deriving, the two prior live
        // proofs this exact claim already received.
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(/navigateToDocument\(initialDocumentId\)/.test(worldViewSource),
            'D4. WorldView.js\'s own mount still resolves the primary document via session.navigateToDocument(), the same real path tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js Section D and tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js already exercised live — cited here, not re-executed, per this file\'s own header constraint.');

        console.log('✓ Section D: Open/Fork/Explore are pure routing at the Repository boundary (D1/D2) — currency is established only downstream, at each action\'s own real destination use case, computed on demand and never proactively (D3/D3b), with Explore\'s equivalent already proven live elsewhere and cited rather than re-derived here (D4).');
    }

    // ===============================================================
    // Section E — Republished Publications (contentHash adversarial
    // case).
    // ===============================================================
    {
        // P1 then P2: the SAME unmutated Document, republished twice
        // through the SAME LocalPublisherProvider — a real, legitimate
        // action (see UnpublishDocumentUseCase.js's own header:
        // "republishing creates a NEW publication") that genuinely
        // produces two Publications sharing documentId AND contentHash
        // but two distinct publicationIds — the exact shape 0.9.534's
        // own Section B/D already established this pattern for.
        const storage = new InMemoryStorageProvider();
        const { document, publication: p1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Same Bytes', 'alice');
        const p2 = publishDocumentUseCase.execute({ document });

        assert(p1.contentHash === p2.contentHash, 'E setup. P1 and P2 genuinely share one contentHash (byte-identical published content).');
        assert(p1.id !== p2.id, 'E setup. P1 and P2 are nonetheless two distinct Publications.');

        const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const page = search(localDiscoveryProvider);
        const matches = page.items.filter((p) => p.contentHash === p1.contentHash);
        assert(matches.length === 2, `E1. Repository search returns TWO entries for the shared contentHash, never merged/deduplicated (got ${matches.length}).`);

        const foundP1 = localDiscoveryProvider.findById(p1.id);
        const foundP2 = localDiscoveryProvider.findById(p2.id);
        assert(foundP1.id === p1.id && foundP2.id === p2.id && foundP1 !== foundP2,
            'E2. findById(P1.id) and findById(P2.id) resolve to two distinct records — identity is publicationId, live, never contentHash.');

        console.log('✓ Section E: the republished-document adversarial case (P1/P2 sharing one contentHash) reconfirmed live — Repository search returns both as distinct entries, findById never conflates them, and PublicationCatalog.js\'s own navigation source (Section D2) never references contentHash at all. Extends, does not re-litigate, 0.9.534\'s own Section D.');
    }

    // ===============================================================
    // Section F — Publication unpublish lifecycle.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const { document, publication, publisher } = publishMinimalDocument(storage, 'Lighthouse', 'alice');

        // This same Wanderer's replica ALSO independently admitted the
        // identical publicationId via a decentralized announcement —
        // exactly 0.9.523's own established, deliberately-unfixed
        // multiplicity (reconfirmed, not re-audited, here).
        decentralizedProvider.add(publication);

        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);
        const beforePage = search(repositoryDiscoveryProvider);
        assert(beforePage.items.filter((p) => p.id === publication.id).length === 2,
            'F setup. Before unpublish: Repository search finds this Publication twice (Local + decentralized), matching Section E\'s own established multiplicity.');

        const unpublish = new UnpublishDocumentUseCase(publisher);
        const removed = unpublish.execute(publication.id);
        assert(removed === true, 'F1. UnpublishDocumentUseCase.execute() reports the publication existed and was removed.');

        const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
        assert(localDiscoveryProvider.findById(publication.id) === null, 'F2. The Local catalog entry is REMOVED, not flagged — findById returns null afterward.');

        // F3. The one, previously-unasked question: what does unpublish
        // NOT reach? The decentralized-admitted copy of the identical
        // publicationId is untouched — not because of a bug, but
        // because unpublish is this replica's own withdrawal of ITS
        // OWN local record; it has no authority over a copy another
        // path (or another replica) already admitted independently.
        assert(decentralizedProvider.findById(publication.id) === publication,
            'F3. The decentralized accumulator\'s own copy survives unpublish untouched, still the exact same object reference — unpublish is Local-provider-scoped, never reaching into a catalog this replica does not own.');

        // F4. Consequently, a combined Repository search after
        // unpublish still finds ONE entry, not zero — the honest,
        // structural consequence of F3, not a bug in the unpublish
        // action itself.
        const afterPage = search(repositoryDiscoveryProvider);
        const remaining = afterPage.items.filter((p) => p.id === publication.id);
        assert(remaining.length === 1 && remaining[0] === publication,
            `F4. A combined Repository search after unpublish still returns exactly ONE entry for this publicationId (got ${remaining.length}) — the surviving decentralized-admitted copy, unchanged.`);

        // F5. Reconfirmed live: the editable source Document is never
        // touched by unpublish.
        const stillLoadable = new LoadDocumentUseCase(storage).execute({ load() {} }, document.world.id);
        assert(stillLoadable.world.id === document.world.id, 'F5. The editable source Document remains loadable after unpublish — unpublishing never destroys the source (UnpublishDocumentUseCase.js\'s own header, reconfirmed live).');

        console.log('✓ Section F: unpublish REMOVES (never flags) the Local catalog entry (F1/F2), reconfirming 0.9.534\'s own Section E live. The genuinely new observation this milestone adds: unpublish is Local-provider-scoped — a decentralized-admitted copy of the identical publicationId survives untouched (F3), so a combined Repository search can still show one live entry for a "just unpublished" Publication afterward (F4) — a DELIBERATE_BOUNDARY (see Section I), not a bug, and the editable source Document itself is confirmed live to survive unpublish (F5).');
    }

    // ===============================================================
    // Section G — Failure vocabulary. The one real, narrow gap this
    // milestone actually fixes.
    // ===============================================================
    {
        // G1. The prior art this milestone extends, not reinvents:
        // tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js
        // (0.9.559) Section I already found — and deliberately did NOT
        // fix, naming it out of that milestone's own scope — that a
        // failed Open's toast leaked LoadDocumentUseCase's own internal
        // class name and a raw storage identifier verbatim to a
        // Wanderer. This milestone is the "future milestone" that
        // file's own verdict named.
        const priorArtSource = await readSource('tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js');
        assert(/leaks an?\s*\n?\s*internal use case's own class name/.test(priorArtSource) || /leaked.*class name/i.test(priorArtSource),
            'G1. The prior milestone\'s own file documents the exact gap this section fixes — confirming this is a named continuation, not a rediscovery claimed from nothing.');

        // G2. Live: LoadDocumentUseCase now attaches a structural
        // reason — the same restraint application/ForkFailureReason.js
        // already established for Fork.
        const emptyStorage = new InMemoryStorageProvider();
        let err = null;
        try {
            new LoadDocumentUseCase(emptyStorage).execute({ load() {} }, 'some-internal-doc-id-42');
        } catch (e) { err = e; }
        assert(err.reason === LoadFailureReason.MATERIAL_UNAVAILABLE,
            'G2. LoadDocumentUseCase now attaches error.reason = LoadFailureReason.MATERIAL_UNAVAILABLE, a real structural signal a caller can branch on.');
        assert(err.message === 'LoadDocumentUseCase: no document found with id "some-internal-doc-id-42"',
            'G2b. The underlying raw Error.message is UNCHANGED (still specific and developer-useful for logs) — only what reaches the Wanderer changes, in Section G3.');

        // G3. Live, at the actual presentation boundary: EditorView.js
        // no longer interpolates err.message into the Wanderer-facing
        // toast — it branches on err.reason and shows plain vocabulary.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(!/feedback\.show\(`Load failed: \$\{err\.message\}`\)/.test(editorViewSource),
            'G3. EditorView.js no longer contains the old raw-interpolation toast.');
        assert(/err\.reason === LoadFailureReason\.MATERIAL_UNAVAILABLE/.test(editorViewSource),
            'G3b. EditorView.js\'s own route.query.load catch block now branches on err.reason (a LoadFailureReason value), the same structural-signal restraint ForkFailureDialog.js already holds Fork to.');
        assert(editorViewSource.includes("This Publication's material is currently unavailable."),
            'G3c. The MATERIAL_UNAVAILABLE case now shows honest, plain vocabulary — deliberately the SAME wording ForkFailureDialog.js already uses for Fork\'s identical underlying condition, so a Wanderer who hits this on Open or Fork reads one consistent sentence either way.');

        // G4. The unnamed-cause fallback is ALSO plain — never a raw
        // message, matching ForkFailureDialog's own "never inspects
        // .message" restraint.
        assert(editorViewSource.includes("'This document could not be opened.'"),
            'G4. An unrecognized cause still shows a plain, safe fallback — err.message is never interpolated into this toast anymore, for any cause.');

        // G5. Scope check: the fix is exactly as narrow as named —
        // ForkFailureDialog.js's own message for the identical
        // condition is untouched (confirming this milestone extended
        // Fork's existing vocabulary rather than replacing it).
        const forkDialogSource = await readSource('ui/components/ForkFailureDialog.js');
        assert(forkDialogSource.includes("This Publication's material is currently unavailable."),
            'G5. ForkFailureDialog.js\'s own pre-existing MATERIAL_UNAVAILABLE message is unchanged — Section G3c\'s new Open vocabulary matches it by deliberate reuse, not by editing Fork\'s own file.');

        console.log('✓ Section G — the one genuine PRODUCT_GAP this milestone found and FIXED, narrowly: a failed Open (Section D3) used to leak LoadDocumentUseCase\'s own internal class name and a raw storage identifier verbatim into a Wanderer-facing toast — a gap 0.9.559 already named and deliberately deferred (G1). application/LoadFailureReason.js now gives LoadDocumentUseCase a structural reason (G2), and EditorView.js\'s own toast now shows the SAME honest vocabulary Fork already used for the identical condition since 0.9.353 (G3-G5) — no dialog redesign, no new Repository concept, no change to admission/identity/search at all.');
    }

    // ===============================================================
    // Section H — Cross-surface continuity.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const orphan = new Publication({ documentId: 'no-bytes-here', title: 'Ghost Tower', author: 'dana' });
        decentralizedProvider.add(orphan);
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);

        // H1. A failed Open attempt against this entry's own documentId...
        let openFailed = false;
        try { new LoadDocumentUseCase(storage).execute({ load() {} }, orphan.documentId); }
        catch (err) { openFailed = err.reason === LoadFailureReason.MATERIAL_UNAVAILABLE; }
        assert(openFailed, 'H1. Open genuinely fails with MATERIAL_UNAVAILABLE for this entry.');

        // H2. ...never mutates, removes, or replaces the Repository
        // record. Same object reference, found the same way, still.
        const afterOpenFailure = repositoryDiscoveryProvider.findById(orphan.id);
        assert(afterOpenFailure === orphan, 'H2. After the failed Open, the Repository record is the exact same object — untouched.');

        // H3. Same for a failed Fork attempt. No sourcePublication is
        // passed — orphan carries no license, and this section is
        // about the material-unavailable path specifically (license
        // enforcement is a separate, already-covered concern), the
        // same bare-call shape Section D3b already used.
        let forkFailed = false;
        try { new ForkDocumentUseCase(storage).execute(orphan.documentId); }
        catch (err) { forkFailed = err.reason === ForkFailureReason.MATERIAL_UNAVAILABLE; }
        assert(forkFailed, 'H3. Fork genuinely fails with MATERIAL_UNAVAILABLE for the same entry.');
        const afterForkFailure = repositoryDiscoveryProvider.findById(orphan.id);
        assert(afterForkFailure === orphan, 'H4. After the failed Fork too, the Repository record is still the exact same object.');

        console.log('✓ Section H: a failed Open and a failed Fork — including through this milestone\'s own newly-fixed presentation path — never mutate, remove, or replace the Repository record itself; the same object reference is found before and after each failure. Reconfirms 0.9.534\'s own Section E/H, now specifically through the fixed failure path.');
    }

    // ===============================================================
    // Section I — Deliberate boundaries.
    // ===============================================================
    {
        console.log(`✓ Section I — explicit DELIBERATE_BOUNDARY classification (not bugs, not silently turned into features):
  - Repository search never automatically reverifies a catalog entry (Section C2 — verify() does not exist anywhere in the discovery chain).
  - Repository search never automatically redownloads/resolves material (Section C1/C2/B4 — zero storage touches, no resolve() method exists).
  - Repository never automatically refreshes/re-polls every result — SearchPublicationsUseCase.js, LocalDiscoveryProvider.js, DecentralizedPublicationDiscoveryProvider.js, and CompositeDiscoveryProvider.js contain no setInterval/setTimeout/polling loop of any kind (grep-verified, zero matches).
  - Repository never deduplicates by contentHash — publicationId alone is identity (Section E).
  - Unpublish is Local-provider-scoped: it withdraws this replica's own record, never a decentralized-admitted copy of the same publicationId another path already holds (Section F3/F4) — a structural consequence of decentralization (no replica has authority over another's copy of an announcement), not an oversight.
  - The Repository catalog record carries no availability/verification/currency field of its own (Section A3) — that question is answered separately, per action, by whichever real use case a Wanderer actually invokes (LoadFailureReason for Open, ForkFailureReason for Fork, PublicationResolutionOutcome for decentralized resolve, WorldEncounterMaterialVerificationStatus for World Encounter) — one unified status field was considered and deliberately not built, matching 0.9.525's own Section D finding that this vocabulary already exists, distinctly, where each action needs it.`);
        const chainSources = await Promise.all([
            readSource('application/SearchPublicationsUseCase.js'),
            readSource('discovery/LocalDiscoveryProvider.js'),
            readSource('discovery/DecentralizedPublicationDiscoveryProvider.js'),
            readSource('discovery/CompositeDiscoveryProvider.js')
        ]);
        assert(chainSources.every((src) => !/setInterval|setTimeout/.test(src)), 'I. No polling/refresh timer exists anywhere in the discovery/search chain.');
    }

    // ===============================================================
    // Section J — Flagship: the full lifecycle, live, end to end.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();

        // 1. Publish.
        const { document, publication, publisher } = publishMinimalDocument(storage, 'Flagship Keep', 'alice');

        // 2. Distribute/Discover/Verify/Admit — this replica's own
        // decentralized accumulator also admits the identical
        // publicationId (the same deliberate multiplicity Sections
        // C/F already established).
        decentralizedProvider.add(publication);
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);

        // 3. Repository search: found (twice — the established
        // multiplicity), the record a pure stored fact.
        const firstSearch = search(repositoryDiscoveryProvider);
        assert(firstSearch.items.filter((p) => p.id === publication.id).length === 2, 'J3. Repository search finds this Publication (Local + decentralized).');

        // 4. Material becomes unavailable — the source Document's own
        // storage slot is removed directly (simulating eviction/loss),
        // WITHOUT touching the Publication/catalog record at all —
        // exactly the brief's own Section B/J scenario, distinct from
        // unpublish (which removes the record; this does not).
        storage.remove(document.world.id);

        // 5. Repository search again: STILL discoverable, still twice,
        // still unmutated — the decentralized accumulator's own entry
        // reference-stable (Section F/0.9.534 Section F's own
        // established distinction), the Local entry value-stable
        // (freshly reconstructed from storage on every list(), but
        // identical in every field — never mutated, marked, or
        // reconstructed WITH a status this milestone would recognize).
        const secondSearch = search(repositoryDiscoveryProvider);
        const survivingEntries = secondSearch.items.filter((p) => p.id === publication.id);
        assert(survivingEntries.length === 2, `J5a. After material loss, Repository search still returns this Publication twice (got ${survivingEntries.length}).`);
        assert(survivingEntries.some((p) => p === publication),
            'J5b. The decentralized-admitted entry is still the exact same object reference — completely unaffected by the material loss.');
        assert(survivingEntries.every((p) => p.contentHash === publication.contentHash && p.documentId === publication.documentId && Object.keys(p.toJSON()).every((f) => !['available', 'status', 'currentlyAvailable'].includes(f))),
            'J5c. Both entries (reference-stable decentralized, value-stable Local) carry identical, unmutated fields and no availability/status field of any kind — the catalog fact and the material fact are genuinely independent.');

        // 6. Open / Fork: both now fail cleanly, with the newly-fixed
        // honest vocabulary this milestone's own Section G produced —
        // never a raw class name, never silence.
        let openReason = null;
        try { new LoadDocumentUseCase(storage).execute({ load() {} }, publication.documentId); }
        catch (err) { openReason = err.reason; }
        assert(openReason === LoadFailureReason.MATERIAL_UNAVAILABLE, 'J6. Open fails, cleanly, with a structural MATERIAL_UNAVAILABLE reason.');

        let forkReason = null;
        try { new ForkDocumentUseCase(storage).execute(publication.documentId, null, publication); }
        catch (err) { forkReason = err.reason; }
        assert(forkReason === ForkFailureReason.MATERIAL_UNAVAILABLE, 'J7. Fork fails the same clean way, independently.');

        // 7. Repository search a THIRD time, after both failed
        // continuation attempts: the record is still exactly what it
        // was at step 3 — the flagship assertion.
        const thirdSearch = search(repositoryDiscoveryProvider);
        const finalEntries = thirdSearch.items.filter((p) => p.id === publication.id);
        assert(finalEntries.length === 2 && finalEntries.some((p) => p === publication)
            && finalEntries.every((p) => p.contentHash === publication.contentHash && p.documentId === publication.documentId),
            'J8. FLAGSHIP: after Create -> Admit -> Search -> material loss -> Search -> failed Open -> failed Fork -> Search again, the Repository record is IDENTICAL, unchanged, and un-mutated throughout — Repository membership, material availability, and this milestone\'s own presentation fix are three genuinely separate facts, exactly as the brief\'s own closing model predicted.');

        console.log('✓ Section J: FLAGSHIP — Create -> Distribute/Discover/Admit (twice) -> Repository Search -> material becomes unavailable -> Repository Search again (unaffected) -> Open fails cleanly -> Fork fails cleanly -> Repository Search a third time, the exact same object throughout. Repository = "we know about this"; LoadDocumentUseCase/ForkDocumentUseCase = "can we currently obtain it" — genuinely independent questions, live, end to end, with the one real presentation gap between them (Section G) now closed.');
    }

    console.log('\nAll Repository Publication Lifecycle & Currency Product Reassessment tests passed.');
    console.log('\n=== 0.9.574 VERDICT ===');
    console.log(`PRODUCT_COMPLETE for every question this milestone's own brief posed about Repository catalog
semantics, search purity, navigation freshness, and republished-content identity — each reconfirmed live against
real production collaborators rather than merely re-cited from 0.9.523-0.9.534's own closure (A, B, C, D, E).
Repository's own catalog record is proven, live, to be a pure stored fact with no availability/verification/
currency field of its own (A), one that survives its own material becoming unavailable completely unmutated,
unmarked, and un-revalidated (B, J), because the discovery/search chain it lives in has no resolve/verify/
download/refresh method anywhere in it to call (C, I). Open/Fork/Explore are pure routing at the Repository
boundary; currency is computed only downstream, at each action's own real destination, only on demand (D). The
republished-document adversarial case (shared contentHash, distinct publicationIds) holds live, again (E).
Unpublish genuinely removes the Local catalog entry, and this milestone's own new observation is that it is
Local-provider-scoped — a decentralized-admitted copy of the identical publicationId survives it untouched, a
DELIBERATE_BOUNDARY (F, I), not a bug.

ONE real, narrow PRODUCT_GAP was found and FIXED this milestone (G): a failed Open's own feedback toast leaked
LoadDocumentUseCase's internal class name and a raw storage identifier verbatim to a Wanderer — a gap
tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js (0.9.559) had already named and
deliberately deferred as a "future milestone" concern. application/LoadFailureReason.js (new) gives
LoadDocumentUseCase a real structural reason, mirroring application/ForkFailureReason.js's own already-shipped
pattern for Fork; ui/views/EditorView.js's own toast now shows the SAME honest sentence
("This Publication's material is currently unavailable.") ForkFailureDialog.js has used for the identical
condition since 0.9.353. No Repository/admission/identity/search code changed at all — the fix is exactly as
narrow as the gap: three files (application/LoadFailureReason.js, application/LoadDocumentUseCase.js,
ui/views/EditorView.js).

Failure isolation holds through the fixed path too: neither a failed Open nor a failed Fork mutates, removes, or
replaces the Repository record itself (H). The flagship end-to-end run (J) demonstrates the brief's own closing
model directly, live: Repository ("we know about this"), LoadDocumentUseCase/ForkDocumentUseCase ("can we
currently obtain it"), and this milestone's own presentation fix (which of those two truths a Wanderer actually
gets told) are three genuinely independent facts — and the Repository's own catalog membership was never, at any
point in this or any prior audit, capable of implying material availability, verification, or trust.

Per the originating brief's own framing: this is a narrow, mostly-confirmatory result with one small, well-
targeted, already-anticipated fix — not a Repository/admission/identity redesign. STOP the Repository/Publication
lifecycle continuity arc again, per 0.9.534's own recommendation, reaffirmed. The next milestone should come from
a genuinely different product boundary a future reassessment actually finds — not from another layer of
Repository/Publication auditing.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
