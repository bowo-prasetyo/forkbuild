import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Structure } from '../core/Structure.js';
import { createId } from '../core/createId.js';

// 0.6.3 — Blueprint Authoring & Versioning UX.
//
// Two different operations in this codebase are both called "fork,"
// and until now only one of them had a name distinct from the noun it
// forks:
//
//   Document fork:  Library Structure --fork--> new, editable Document
//                    (application/ForkStructureUseCase.js, 0.2.81)
//   Structure fork: Library Structure --fork--> new, independent
//                    personal Structure (this class, 0.6.3)
//
// A document fork exists so a person can start BUILDING from a
// Structure. A structure fork exists so a person can start OWNING one
// without building anything first — "Village Hall" (built-in,
// read-only) becomes "Village Hall" in My Structures (personal,
// renamable, exportable, removable) with zero bricks touched and zero
// Documents involved. Both are content operations, never World/
// placement operations, and both leave the source Structure completely
// untouched — see docs/Principles.md, "Forking A Structure Records
// Provenance, Never A Live Dependency (0.2.81)," which this class
// extends to a second kind of fork rather than replacing.
//
// Pure — no persistence, no UI, mirroring every other single-purpose
// Structure use case here (ForkStructureUseCase, ImportBlueprintUseCase,
// CreateStructureFromSelectionUseCase). Saving the result into
// application/LocalStructureLibraryStore.js is the caller's job —
// application/EditorSession.js#forkStructureToPersonalLibrary() chains
// the two, the same "use case returns a value, EditorSession persists
// it" split 0.4.2/0.4.3 already established for extraction.
//
// Every id is FRESH — the Structure's own id and every brick's own id
// — never the source Structure's own identity, exactly the same "an id
// crossing a boundary always regenerates" rule ForkStructureUseCase and
// ImportBlueprintUseCase both already apply one rung over. This is what
// makes forking the SAME built-in Structure twice produce two
// independent personal entries, never a silent overwrite of one by the
// other, and what guarantees removing/renaming the fork can never touch
// the built-in Structure it came from (or vice versa).
//
// Metadata (name/category/tags/description) is preserved AS-IS — unlike
// importing a package (which has no prior owner to preserve intent
// for), forking a KNOWN, already-named Structure has no reason to
// invent a different name; Rename (0.4.3, unchanged) is exactly how a
// person distinguishes their fork afterward, the same existing action
// every other personal Structure already offers.
export class ForkStructureToLibraryUseCase {
    execute(structure) {
        if (!structure || !(structure instanceof Structure)) {
            throw new Error('ForkStructureToLibraryUseCase: a valid Structure is required');
        }

        const bricks = structure.bricks.map((brick) => new Brick({
            definitionId: brick.definitionId,
            position: new Position(brick.position.x, brick.position.y, brick.position.z),
            rotation: brick.rotation
            // id omitted deliberately — see this class's own header on
            // why every id crossing this boundary regenerates.
        }));

        return new Structure({
            id: createId(),
            name: structure.name,
            category: structure.category,
            tags: structure.tags,
            description: structure.description,
            bricks
        });
    }
}
