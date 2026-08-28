import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

const ARCHIVE_KEY = 'publication-observation-archive';

// 0.8.75 — Durable Publication Observation Records.
//
// The one file in this milestone allowed to know that "durable" means
// "written to storage/StorageProvider.js." application/
// PublicationObservationArchive.js itself imports nothing from storage/ —
// this adapter is the ONLY bridge between that pure domain model and any
// actual persistence mechanism, mirroring exactly how storage/
// LocalStorageProvider.js already sits below application/
// SaveDocumentUseCase.js for documents, one domain over:
//
//   UI
//    │
//    ▼
//   (an archive coordinator the UI itself owns — see
//    ui/views/DecentralizedPublicationsView.js's own wiring)
//    │
//    ▼
//   PublicationObservationArchive          (pure, storage-agnostic)
//    │  toJSON() / fromJSON()
//    ▼
//   LocalStoragePublicationObservationArchive   (THIS FILE)
//    │  save(name, data) / load(name) / remove(name)
//    ▼
//   storage/StorageProvider.js             (generic, JSON-safe, injected)
//
// AN INJECTED storage/StorageProvider.js, NEVER window.localStorage
// DIRECTLY. Exactly like application/SaveDocumentUseCase.js's own
// constructor, this class accepts a StorageProvider instance — defaulting
// to storage/LocalStorageProvider.js (the real, browser-backed
// implementation) so a caller needs to pass nothing to get real
// persistence, but a test can inject an in-memory fake instead, the
// identical seam tests/DurableDocuments.test.js's own
// `InMemoryStorageProvider` already exercises for documents. This class
// itself never touches `window.localStorage` — only the injected
// provider does, and only storage/LocalStorageProvider.js's own file
// knows that API exists at all.
//
// CORRUPTED STORAGE DEGRADES TO AN EMPTY ARCHIVE, NEVER A THROWN ERROR.
// `load()` wraps the injected provider's own `load()` call — which, for
// storage/LocalStorageProvider.js, includes a raw `JSON.parse()` that
// throws on truly invalid JSON text — in a try/catch, and treats ANY
// thrown error identically to a value that fails application/
// PublicationObservationArchive.js's own `fromJSON()` validation: both
// produce `PublicationObservationArchive.empty()`. A person whose browser
// storage holds hand-edited, truncated, or otherwise corrupted JSON for
// this key gets a page that behaves as though nothing had ever been
// archived — never a crashed Observation Archive section, and never a
// partially reconstructed archive holding only whichever fields happened
// to parse. See docs/Principles.md, "Persistence Restores Historical
// Facts; It Never Resurrects Invented Ones (0.8.75)."
//
// NEVER PERSISTS ANYTHING BUT toJSON()'s OWN OUTPUT. `save()` calls
// `archive.toJSON()` and writes exactly that — this class adds no field
// of its own, and in particular never persists a capability, a
// credential, or any wallet-related state, because none could ever reach
// this class in the first place: `archive` is a application/
// PublicationObservationArchive.js instance, and that class's own header
// already explains why no such field can exist on it. See this
// milestone's flagship test for the concrete assertion.
export class LocalStoragePublicationObservationArchive {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('LocalStoragePublicationObservationArchive requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Loads and validates the persisted archive, or returns
    // `PublicationObservationArchive.empty()` for no persisted archive,
    // corrupted storage, or a payload that fails schema validation. Never
    // throws.
    load() {
        let raw;
        try {
            raw = this._storageProvider.load(ARCHIVE_KEY);
        } catch (error) {
            return PublicationObservationArchive.empty();
        }
        if (raw === null || raw === undefined) return PublicationObservationArchive.empty();
        return PublicationObservationArchive.fromJSON(raw);
    }

    // Persists `archive` via `archive.toJSON()`. `archive` must be a real
    // PublicationObservationArchive instance — this method performs no
    // duck-typing and constructs nothing of its own from a plain object,
    // the identical caller-contract discipline application/
    // IpfsPublicationContentVerificationCoordinator.js's own `verify()`
    // already holds for its own `record` parameter.
    save(archive) {
        if (!(archive instanceof PublicationObservationArchive)) {
            throw new Error('LocalStoragePublicationObservationArchive.save() requires a PublicationObservationArchive');
        }
        this._storageProvider.save(ARCHIVE_KEY, archive.toJSON());
    }

    // The one EXPLICIT, DESTRUCTIVE action this class exposes — never
    // called by `save()`, `load()`, or anything else in this file. See
    // ui/views/DecentralizedPublicationsView.js's own "Clear Archive"
    // wiring for the one place this codebase ever calls it, always from
    // an explicit person's own click.
    clear() {
        this._storageProvider.remove(ARCHIVE_KEY);
    }
}
