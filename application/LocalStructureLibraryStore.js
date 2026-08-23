import { StorageProvider } from '../storage/StorageProvider.js';
import { Structure } from '../core/Structure.js';
import { groupStructuresByCategory } from '../core/groupStructuresByCategory.js';

const STORAGE_KEY_PREFIX = 'personal-structure:';

// 0.4.3 — Personal Blueprint Library.
//
// 0.4.2 closed the recursive loop (Structure --copy/compose--> Document
// --extract--> Structure) but deliberately left the extracted Structure
// with nowhere to live beyond the caller's own local variable. This is
// that "somewhere" — the local, per-device counterpart to
// core/library/VillageLibrary.js's built-in one, backed by StorageProvider
// exactly the way application/LocalWorldExperienceStore.js (0.3.10) is —
// same constructor shape, same key-prefix-and-list() convention, same
// toJSON()/fromJSON() round trip through the domain object itself.
//
// The important boundary this store draws (see docs/Principles.md, "A
// Personal Library Persists What Extraction Only Returns (0.4.3)"):
//
//   - A personal Structure is reusable CONTENT, not World state — it
//     never touches core/World.js, never gets a WorldPlacement, and
//     nothing here is signed, published, or replicated. Purely local
//     application state, per-device, exactly like LocalWorldExperience
//     already established for camera framing (0.3.10) — NOT synchronized
//     across a user's devices yet; see docs/Roadmap.md, 0.4.3's own
//     "Deliberately excluded."
//   - Every entry is an independent, self-contained core/Structure.js
//     VALUE, never a reference to the Document it may have been
//     extracted from. This is already guaranteed one rung down by
//     application/CreateStructureFromSelectionUseCase.js (fresh bricks,
//     fresh ids) — this store simply persists whatever independent
//     Structure it's handed, never reaching back into a Document itself.
//   - Deleting a Structure from this library NEVER affects a Document
//     that already copied or forked its bricks — by the time a
//     Structure's content is inside a Document, it is ordinary bricks,
//     structurally incapable of noticing their source Structure was
//     ever removed. See this class's own removeStructure().
//   - Library membership is never part of a Structure's own identity —
//     nothing here adds a "libraryId" or "personal: true" field to
//     core/Structure.js itself. A Structure that started life here can
//     move to being forked, composed, extracted again, or re-saved
//     without ever knowing which library (built-in, personal, or none)
//     it currently sits in.
export class LocalStructureLibraryStore {
    constructor({ storageProvider }) {
        if (!storageProvider || !(storageProvider instanceof StorageProvider)) {
            throw new Error('LocalStructureLibraryStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    getStructure(id) {
        if (!id || typeof id !== 'string') {
            return null;
        }
        const record = this._storage.load(STORAGE_KEY_PREFIX + id);
        if (!record) {
            return null;
        }
        return Structure.fromJSON(record.structure);
    }

    hasStructure(id) {
        return this.getStructure(id) !== null;
    }

    // Saves an independent Structure VALUE under its own id, overwriting
    // any prior entry with the same id — this is also what
    // updateStructureMetadata() (below) uses to persist a rename. The
    // original savedAt is preserved across an overwrite, so "when was
    // this first added" survives a later metadata edit rather than
    // bumping every rename to the top of listStructures()'s recency
    // order. `savedAt` is an optional explicit override (tests only, in
    // practice — mirrors core/LocalWorldExperience.js's own constructor
    // accepting an explicit lastVisitedAt) for deterministic recency
    // ordering without depending on real elapsed wall-clock time between
    // calls in the same tick; omitted, it defaults to Date.now().
    addStructure(structure, { savedAt } = {}) {
        if (!structure || !(structure instanceof Structure)) {
            throw new Error('addStructure requires a Structure instance');
        }
        const key = STORAGE_KEY_PREFIX + structure.id;
        const existing = this._storage.load(key);
        const resolvedSavedAt = existing && typeof existing.savedAt === 'number'
            ? existing.savedAt
            : (typeof savedAt === 'number' ? savedAt : Date.now());
        this._storage.save(key, { structure: structure.toJSON(), savedAt: resolvedSavedAt });
        return structure;
    }

    // A Structure stays immutable/value-like — 0.4.3 deliberately does
    // NOT add in-place brick editing (see docs/Roadmap.md, "Editing a
    // personal Structure"). Renaming is really "replace the stored value
    // with a new Structure carrying the same id and bricks, different
    // metadata" — built here so callers never hand-roll that
    // reconstruction themselves. Returns null (and changes nothing) if
    // no Structure with that id is stored.
    updateStructureMetadata(id, { name, category, tags, description } = {}) {
        const existing = this.getStructure(id);
        if (!existing) {
            return null;
        }
        const updated = new Structure({
            id: existing.id,
            name: name !== undefined ? name : existing.name,
            category: category !== undefined ? category : existing.category,
            tags: tags !== undefined ? tags : existing.tags,
            description: description !== undefined ? description : existing.description,
            bricks: existing.bricks
        });
        this.addStructure(updated);
        return updated;
    }

    // Removes this library's own record only — see this class's own
    // header on why a Document that already copied/forked this
    // Structure's bricks is structurally unaffected.
    removeStructure(id) {
        if (!id || typeof id !== 'string') {
            return;
        }
        this._storage.remove(STORAGE_KEY_PREFIX + id);
    }

    // Every stored Structure, most-recently-added first — mirrors
    // application/LocalWorldExperienceStore.js#listExperiences()'s own
    // "filter storage.list() by prefix, reload each, sort" shape.
    listStructures() {
        const allKeys = this._storage.list();
        const records = [];
        for (const key of allKeys) {
            if (key.startsWith(STORAGE_KEY_PREFIX)) {
                const record = this._storage.load(key);
                if (record) {
                    records.push(record);
                }
            }
        }
        records.sort((a, b) => b.savedAt - a.savedAt);
        return records.map((record) => Structure.fromJSON(record.structure));
    }

    // Same [{ category, structures }] shape core/StructureRegistry.js#groupByCategory()
    // already returns for the built-in library, via the exact same
    // core/groupStructuresByCategory.js helper — so
    // ui/components/BuildLibraryPanel.js renders "My Structures" through
    // the identical grouping/rendering path, never a second one invented
    // for personal content.
    groupByCategory() {
        return groupStructuresByCategory(this.listStructures());
    }

    // Mirrors core/StructureRegistry.js#search()'s own contract exactly
    // — matches a tag or array of tags against ANY of a structure's own
    // tags. ui/components/BuildLibraryPanel.js's existing name/category/tag
    // text filter already works over any structureGroups-shaped prop
    // without needing this method at all; it's offered here purely for
    // parity with the built-in registry's own API, for a caller that
    // wants a tag-only query over personal content specifically.
    search(tags) {
        const query = Array.isArray(tags) ? tags : [tags];
        return this.listStructures().filter((structure) =>
            query.some((tag) => structure.tags.includes(tag)));
    }
}
