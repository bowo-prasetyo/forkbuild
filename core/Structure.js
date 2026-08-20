import { Brick } from './Brick.js';

// A Structure is a reusable, named collection of Bricks — the smallest
// possible answer to "what is a forkable prefab" per the 0.2.81 design
// conversation (docs/Roadmap.md, "Forkable Structure Library"):
//
//   Structure
//   ├── identity (id, namespaced like a BrickDefinition — "village:house")
//   ├── metadata (name, category, tags, description)
//   ├── dimensions/bounds — NOT stored; computeBounds(registry) derives
//   │   them from `bricks` + the registry, the same way
//   │   core/SpatialBounds.js#fromWorld() already derives a World's
//   │   bounds from Buildings + registry rather than caching them
//   └── bricks — an array of Brick instances (core/Brick.js, unmodified),
//       positioned in the Structure's own LOCAL coordinate space
//
// There is deliberately no "House" brick and no StructureBuilder/
// StructureEngine/StructureRuntime subsystem — a Structure is pure data,
// exactly like BrickDefinition (core/BrickDefinition.js) is pure data.
// See docs/Principles.md, "A Brick Is A Primitive, Never A Preassembled
// Structure" — a Structure is the next rung up that same ladder: bricks
// compose into a building, a building's bricks compose into a Structure,
// and nothing here lets a brick skip straight to being one.
//
// A Structure never stores world placement, terrain, or a parent
// document — see docs/Principles.md, "A Structure Is Reusable Content;
// Where It's Placed Is A Separate Question." Forking a Structure into an
// editable, independent Document is application/ForkStructureUseCase.js.
export class Structure {
    constructor({
        id,
        name,
        category = 'uncategorized',
        tags = [],
        description = '',
        bricks = []
    } = {}) {
        this._id = id;
        this._name = name;
        this._category = category;
        this._tags = tags;
        this._description = description;
        this._bricks = bricks.map((brick) => (brick instanceof Brick ? brick : Brick.fromJSON(brick)));
    }

    get id() { return this._id; }
    get name() { return this._name; }
    get category() { return this._category; }
    get tags() { return this._tags; }
    get description() { return this._description; }

    // Bricks are exposed as a fresh array of the SAME Brick instances a
    // library structure was constructed with. Callers that need
    // independence (ForkStructureUseCase, above all) clone each brick
    // themselves — a Structure never hands out a reference callers could
    // use to mutate the library's own definition in place.
    get bricks() {
        return this._bricks.slice();
    }

    toJSON() {
        return {
            id: this._id,
            name: this._name,
            category: this._category,
            tags: this._tags,
            description: this._description,
            bricks: this._bricks.map((brick) => brick.toJSON())
        };
    }

    static fromJSON(json) {
        return new Structure({
            id: json.id,
            name: json.name,
            category: json.category,
            tags: json.tags || [],
            description: json.description || '',
            bricks: (json.bricks || []).map((brickJson) => Brick.fromJSON(brickJson))
        });
    }
}
