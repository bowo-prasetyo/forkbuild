import { createId } from './createId.js';
import { Position } from './Position.js';

// A spatial REFERENCE to another Document, placed inside this World —
// the 0.2.90 answer to "put this already-created structure here," named
// and deliberately postponed by both 0.2.81 (Forkable Structure Library)
// and 0.2.87 (World Building Interaction & Placement UX). See
// docs/Principles.md, "A Structure Placement References Content, It
// Never Copies It."
//
// The critical architectural invariant, mirroring core/WorldPlacement.js
// one rung down — a StructurePlacement does NOT own bricks. It points to
// a Document (by id) via `documentId`, the same way WorldPlacement points
// to a Publication via `publicationId`, never the reverse. This means:
//   - Editing the referenced Document is never "syncing a copy" — there
//     is only ever one authoritative representation of its bricks, and
//     every placement resolves it fresh (application/
//     StructureDocumentResolver.js), never a cached snapshot taken at
//     placement time.
//   - Multiple placements can reference the SAME Document, each with its
//     own position/rotation — a House forked once, placed many times.
//   - Moving or removing a placement never mutates the referenced
//     Document; deleting the referenced Document never mutates a
//     placement that points to it (see application/
//     StructureDocumentResolver.js's own header for what "the reference
//     is now unresolvable" resolves to).
//
// `position`/`rotation` are LOCAL to the containing World, exactly like
// a Brick's own position/rotation (core/Brick.js) — not global shared-
// world coordinates the way WorldPlacement's are. A placed structure's
// bricks are never rewritten into this World's own coordinate space;
// resolving `documentId`'s bricks and composing them with this
// placement's position/rotation happens at RENDER time only
// (renderer/WorldRenderer.js) — see docs/Principles.md, "A Structure
// Placement Transforms Its Content At Render Time, Never At Rest."
// rotation is a single Y-axis degree scalar, the same convention
// core/Brick.js#rotation and core/Building.js already use — never the
// {x,y,z} object WorldPlacement's rotation is, because a structure
// placement rotates as one rigid whole around Y exactly like a brick
// does, not as an independently-oriented published world.
export class StructurePlacement {
    constructor({
        id = createId(),
        documentId,
        position = new Position(),
        rotation = 0
    } = {}) {
        if (!documentId) {
            throw new Error('StructurePlacement requires a documentId');
        }
        this._id = id;
        this._documentId = documentId;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._rotation = rotation;
    }

    get id() { return this._id; }
    get documentId() { return this._documentId; }
    get position() { return this._position; }
    get rotation() { return this._rotation; }

    toJSON() {
        return {
            id: this._id,
            documentId: this._documentId,
            position: this._position.toJSON(),
            rotation: this._rotation
        };
    }

    static fromJSON(json) {
        return new StructurePlacement({
            id: json.id,
            documentId: json.documentId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation
        });
    }
}
