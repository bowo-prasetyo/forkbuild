import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// Forks a library Structure (core/Structure.js) into a new, independent,
// editable Document — the 0.2.81 flagship operation. Deliberately the
// smallest possible version of what application/ForkPublishedWorldUseCase.js
// already does for a whole published World, one rung down:
//
//   Library Structure --fork--> User-owned Document --edit freely-->
//
// Unlike forking a published world, there is no Publication, no
// snapshot, no signature to verify — a built-in library Structure is
// local, static data (core/library/VillageLibrary.js), not published
// content, so this use case goes straight from Structure to Document.
// See docs/Principles.md, "Forking A Structure Records Provenance,
// Never A Live Dependency":
//
//   - The source Structure is NEVER mutated (every Brick placed into
//     the new Building is a FRESH Brick instance — same definitionId,
//     position, rotation, but a newly generated id — never the
//     library's own Brick object).
//   - The fork gets a completely new documentId (world.id), exactly
//     like DocumentCloneService's own identity rule.
//   - The fork's metadata.parentStructureId records which Structure it
//     came from; nothing about the fork depends on the Structure, the
//     registry, or the library still existing afterward.
//   - The fork does NOT create a WorldPlacement — forking is a content
//     operation, placing is a spatial operation, exactly the same
//     separation ForkPublishedWorldUseCase already draws.
//
// Usage:
//   const document = new ForkStructureUseCase().execute(structure, identityProvider);
//   editorSession.openDocument(document);  // same editor, no new UI
export class ForkStructureUseCase {
    execute(structure, identityProvider = null) {
        if (!structure || !structure.id) {
            throw new Error('ForkStructureUseCase: a valid Structure is required');
        }

        const currentUser = identityProvider ? identityProvider.currentUser() : null;

        const building = new Building({ creator: currentUser ? currentUser.username : null });
        for (const brick of structure.bricks) {
            building.addBrick(new Brick({
                definitionId: brick.definitionId,
                position: brick.position.clone(),
                rotation: brick.rotation
                // id omitted deliberately — Brick's constructor default
                // (createId()) mints a fresh identity, exactly the
                // "strip every instance id, let it regenerate" rule
                // DocumentCloneService already established for forks.
            }));
        }

        const world = new World();
        world.addBuilding(building);

        const metadata = new DocumentMetadata({
            title: structure.name,
            description: structure.description,
            author: currentUser ? currentUser.username : null,
            // 0.2.95 — see core/DocumentMetadata.js's own comment.
            authorIdentityId: resolveSigningIdentityId(identityProvider),
            created: new Date(),
            modified: new Date(),
            parentStructureId: structure.id
        });

        return new Document({ world, metadata });
    }
}
