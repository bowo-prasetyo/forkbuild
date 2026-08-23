import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Structure } from '../core/Structure.js';
import { createId } from '../core/createId.js';
import { validateBlueprintPackage } from './BlueprintImportValidator.js';

// 0.4.6 — Blueprint Sharing & Exchange. The other direction of
// application/ExportBlueprintUseCase.js:
//
//   Alice's Structure --export--> Blueprint Package --import--> Bob's Structure
//
// Deliberately three steps, always in this order, never fewer:
//
//   1. validate  — application/BlueprintImportValidator.js#validateBlueprintPackage()
//   2. construct — a brand-new, independent core/Structure.js
//   3. (persistence is the CALLER's job — see application/EditorSession.js#importBlueprint())
//
// Never "import -> execute arbitrary command." A blueprint package is
// untrusted, portable DATA — it may have crossed devices, been hand-
// edited, or come from a stranger — so this class only ever reads plain
// fields off it and only ever produces a plain core/Structure.js. See
// docs/Principles.md, "A Blueprint Package Is Portable Data, Never A Live
// Dependency (0.4.6)."
//
// Every id in the result is FRESH — the structure's own id and every
// brick's own id — never trusted from the package, exactly the same
// "an id crossing a boundary always regenerates" rule
// application/ForkStructureUseCase.js and
// application/CreateStructureFromSelectionUseCase.js already apply to
// forking and extraction respectively. This is also what guarantees
// tests/BlueprintExchange.test.js's own "Structure A != Structure B"
// property: importing the SAME package twice (even into the SAME
// library) always produces two independent entries, never a silent
// overwrite of one by the other.
export class ImportBlueprintUseCase {
    // registry: a BrickRegistry, passed straight through to the
    // validator's own "supported brick definitions" check — see
    // application/BlueprintImportValidator.js's own header on why that
    // check needs one.
    execute(pkg, { registry = null } = {}) {
        validateBlueprintPackage(pkg, { registry });

        const source = pkg.structure;
        const bricks = source.bricks.map((brickJson) => new Brick({
            definitionId: brickJson.definitionId,
            position: new Position(brickJson.position.x, brickJson.position.y, brickJson.position.z),
            rotation: brickJson.rotation
            // id omitted deliberately — Brick's constructor default
            // (createId()) mints a fresh identity; see this class's own
            // header on why an imported package's own brick ids are
            // never reused, even though they already passed the
            // validator's duplicate-id check.
        }));

        return new Structure({
            id: createId(),
            name: source.name,
            category: source.category || 'uncategorized',
            tags: source.tags || [],
            description: source.description || '',
            bricks
        });
    }
}
