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
}
