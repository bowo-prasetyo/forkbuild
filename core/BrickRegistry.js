// Central registry mapping a definitionId (e.g. "core:cube") to its
// BrickDefinition. Libraries register themselves here at startup; nothing
// else in the engine — not the renderer, not the UI — needs to know which
// library a brick came from, or how many libraries exist.
export class BrickRegistry {
    constructor() {
        this._definitions = new Map();
    }

    register(library) {
        for (const definition of library.definitions) {
            this._definitions.set(definition.id, definition);
        }
    }

    get(id) {
        return this._definitions.get(id) || null;
    }

    has(id) {
        return this._definitions.has(id);
    }

    getAll() {
        return Array.from(this._definitions.values());
    }

    getByCategory(category) {
        return this.getAll().filter((definition) => definition.category === category);
    }

    // Accepts a single tag or an array of tags; matches a definition if
    // ANY of its tags match ANY of the queried tags.
    search(tags) {
        const query = Array.isArray(tags) ? tags : [tags];
        return this.getAll().filter((definition) =>
            query.some((tag) => definition.tags.includes(tag))
        );
    }

    // Ordered [{ category, definitions }] for palette rendering, grouped
    // in first-seen order — the same shape
    // application/EditorActionRegistry.js#groupByCategory() already
    // established for the Command Palette. 0.2.80 adds this because a
    // flat list of fifteen definitions across eleven categories is
    // meaningfully harder to scan than four; getAll() and getByCategory()
    // stay exactly as they were for every other caller.
    groupByCategory() {
        const groups = [];
        const indexByCategory = new Map();
        for (const definition of this.getAll()) {
            if (!indexByCategory.has(definition.category)) {
                indexByCategory.set(definition.category, groups.length);
                groups.push({ category: definition.category, definitions: [] });
            }
            groups[indexByCategory.get(definition.category)].definitions.push(definition);
        }
        return groups;
    }
}
