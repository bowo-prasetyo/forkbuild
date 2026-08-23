import { groupStructuresByCategory } from './groupStructuresByCategory.js';

// Central registry mapping a Structure's id (e.g. "village:house") to
// the Structure itself — the exact same shape as core/BrickRegistry.js,
// one rung up: libraries of Structures register here at startup instead
// of libraries of BrickDefinitions, and nothing else in the engine needs
// to know which library a Structure came from or how many exist.
//
// A community structure library registers alongside the built-in one
// exactly the way docs/BrickLibrary.md already describes for bricks:
// `registry.register(SomeStructureLibrary)`. Nothing here is privileged
// over another library except being registered first — see
// docs/StructureLibrary.md.
export class StructureRegistry {
    constructor() {
        this._structures = new Map();
    }

    register(library) {
        for (const structure of library.structures) {
            this._structures.set(structure.id, structure);
        }
    }

    get(id) {
        return this._structures.get(id) || null;
    }

    has(id) {
        return this._structures.has(id);
    }

    getAll() {
        return Array.from(this._structures.values());
    }

    getByCategory(category) {
        return this.getAll().filter((structure) => structure.category === category);
    }

    // Accepts a single tag or an array of tags; matches a structure if
    // ANY of its tags match ANY of the queried tags — same contract as
    // BrickRegistry#search().
    search(tags) {
        const query = Array.isArray(tags) ? tags : [tags];
        return this.getAll().filter((structure) =>
            query.some((tag) => structure.tags.includes(tag))
        );
    }

    // Ordered [{ category, structures }] — byte-for-byte the grouping
    // shape core/BrickRegistry.js#groupByCategory() already established
    // (first-seen category order). 0.2.81 deliberately deferred this
    // ("six structures in one built-in library don't yet need it" — see
    // docs/Roadmap.md); 0.2.84 (Building Library & Palette UX) is the
    // first caller that needs Bricks and Structures to browse the same
    // way, so this closes that gap the same way `getAll()`,
    // `getByCategory()`, and `search()` always have — additively, with
    // no change to Structure's own stored shape.
    groupByCategory() {
        return groupStructuresByCategory(this.getAll());
    }
}
