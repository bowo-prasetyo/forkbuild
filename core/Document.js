import { World } from './World.js';
import { DocumentMetadata } from './DocumentMetadata.js';

// A Document is the publishable/persistable unit: a World plus the
// metadata that travels with it. Not the World itself — a Document
// CONTAINS a World, the same way a Building doesn't know it belongs to a
// World, but a World knows it owns Buildings. This is what a future
// Serializer will read/write, and what a Publisher eventually transmits.
//
// Deliberately excludes anything session-local: dirty flags, read-only
// state, "loaded from" bookkeeping. That's DocumentState (Editor State —
// application/editor-state/DocumentState.js). See Architecture.md,
// "Domain State vs Editor State."
export class Document {
    constructor({ world = new World(), metadata = new DocumentMetadata() } = {}) {
        this._world = world;
        this._metadata = metadata;
    }

    get world() {
        return this._world;
    }

    get metadata() {
        return this._metadata;
    }

    toJSON() {
        return {
            world: this._world.toJSON(),
            metadata: this._metadata.toJSON()
        };
    }

    // eventBus: optional, passed through to World.fromJSON() so a loaded
    // World can publish domain events the same as a freshly-built one.
    static fromJSON(json, eventBus = null) {
        return new Document({
            world: World.fromJSON(json.world, eventBus),
            metadata: DocumentMetadata.fromJSON(json.metadata)
        });
    }
}
