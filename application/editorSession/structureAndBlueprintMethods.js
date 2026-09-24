import { ToolId } from '../editor-state/ToolId.js';
import { deriveBlueprintFingerprint } from '../../core/BlueprintFingerprint.js';
import { RemoveStructurePlacementCommand } from '../commands/RemoveStructurePlacementCommand.js';

// EditorSession structures, blueprints and documents: forking and composing
// library Structures, the personal library, document and blueprint export and
// import, and placing or removing structure placements.
export const structureAndBlueprintMethods = {
    // Forks a library Structure into a new Document and opens it through the same
    // path as a Load; the library Structure is never touched. Returns false for a
    // falsy structure.
    forkStructure(structure) {
        if (!structure) {
            return false;
        }
        const forkedDocument = this._forkStructureUseCase.execute(structure, this._identityProvider);
        this.openDocument(forkedDocument);
        return true;
    },

    // Copies the Structure's bricks into the open document as one
    // PasteBricksCommand (undo, replay and serialization for free), placed past
    // what the document already contains so compositions never overlap. Returns
    // false if there is nothing to copy or copy into.
    copyStructureIntoDocument(structure) {
        if (!structure || !this._copyStructureIntoDocumentUseCase || !this._documentManager.document || !this._commandHistory) {
            return false;
        }
        const document = this._documentManager.document;
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        const command = this._copyStructureIntoDocumentUseCase.execute(structure, {
            worldId: world.id,
            buildingId: buildings[0].id,
            world,
            registry: this._registry
        });
        if (!command) {
            return false;
        }
        this._commandHistory.execute(command);
        return true;
    },

    // Enters COMPOSE_STRUCTURE mode; the copy only happens when the tool commits.
    // Checks up front that there is a document to compose into.
    beginStructureComposition(structure) {
        if (!structure || !this._documentManager.document) {
            return false;
        }
        if (this._documentManager.document.world.getBuildings().length === 0) {
            return false;
        }
        this._editorContext.setActiveComposition(structure);
        this._editorContext.setActiveTool(ToolId.COMPOSE_STRUCTURE);
        return true;
    },

    // Extracts the selected bricks into a new, unsaved Structure. Observation only:
    // no document change and no undo entry. Returns null with nothing to extract;
    // throws for a non-brick selection or a missing name.
    createStructureFromSelection(metadata = {}) {
        const document = this._documentManager.document;
        if (!this._createStructureFromSelectionUseCase || !document) {
            return null;
        }
        return this._createStructureFromSelectionUseCase.execute(this._editorContext.selection, document, {
            ...metadata,
            registry: this._registry
        });
    },

    // Saving is a separate step from extraction.
    saveStructureToPersonalLibrary(structure) {
        if (!structure || !this._personalStructureLibraryStore) {
            return false;
        }
        this._personalStructureLibraryStore.addStructure(structure);
        return true;
    },

    // Always exports the document open in this session, as the serializer's exact
    // JSON.
    exportDocument() {
        if (!this._exportDocumentUseCase) {
            return null;
        }
        return this._exportDocumentUseCase.execute(this._documentManager.document);
    },

    // `json` is untrusted. A malformed import throws before openDocument(), so the
    // open document and storage are untouched. On success it opens like a fork;
    // nothing is saved until the user saves.
    importDocument(json) {
        if (!this._importDocumentUseCase) {
            return null;
        }
        const importedDocument = this._importDocumentUseCase.execute(json);
        this.openDocument(importedDocument);
        return importedDocument;
    },

    exportBlueprint(structure, attributions = [], lineageClaims = []) {
        if (!this._exportBlueprintUseCase) {
            return null;
        }
        return this._exportBlueprintUseCase.execute(structure, { attributions, lineageClaims });
    },

    // Validates, constructs and saves in one call: an imported blueprint carries
    // its own metadata. Throws BlueprintPackageError on bad input; returns null
    // if nothing is wired.
    importBlueprint(pkg) {
        if (!this._importBlueprintUseCase || !this._personalStructureLibraryStore) {
            return null;
        }
        const structure = this._importBlueprintUseCase.execute(pkg, { registry: this._registry });
        this._personalStructureLibraryStore.addStructure(structure);
        return structure;
    },

    exportBlueprintAttribution(attribution) {
        if (!this._blueprintAttributionExchange) {
            return null;
        }
        return this._blueprintAttributionExchange.exportAttribution(attribution);
    },

    // When `structure` is given, its fingerprint is computed here and checked
    // against the package, never trusted from it. Without one, the cross-check is
    // skipped.
    importBlueprintAttribution(pkg, structure = null) {
        if (!this._blueprintAttributionExchange) {
            return null;
        }
        const expectedFingerprint = structure ? deriveBlueprintFingerprint(structure) : null;
        return this._blueprintAttributionExchange.importAttribution(pkg, { expectedFingerprint });
    },

    exportBlueprintLineageClaim(claim) {
        if (!this._blueprintLineageExchange) {
            return null;
        }
        return this._blueprintLineageExchange.exportClaim(claim);
    },

    // Same rule with two optional local Structures (source and derived).
    importBlueprintLineageClaim(pkg, { sourceStructure = null, derivedStructure = null } = {}) {
        if (!this._blueprintLineageExchange) {
            return null;
        }
        const expectedSourceFingerprint = sourceStructure ? deriveBlueprintFingerprint(sourceStructure) : null;
        const expectedDerivedFingerprint = derivedStructure ? deriveBlueprintFingerprint(derivedStructure) : null;
        return this._blueprintLineageExchange.importClaim(pkg, { expectedSourceFingerprint, expectedDerivedFingerprint });
    },

    // Forks a Structure into a new personal Structure (no Document). Returns null
    // if nothing is wired.
    forkStructureToPersonalLibrary(structure) {
        if (!structure || !this._forkStructureToLibraryUseCase || !this._personalStructureLibraryStore) {
            return null;
        }
        const forked = this._forkStructureToLibraryUseCase.execute(structure);
        this._personalStructureLibraryStore.addStructure(forked);
        return forked;
    },

    // Places `documentId` into the currently open document; it does not open it.
    // Refuses the open document itself.
    placeDocument(documentId, title = null) {
        if (!documentId) {
            return false;
        }
        const document = this._documentManager.document;
        if (document && document.world.id === documentId) {
            return false;
        }
        this._editorContext.setActiveStructure(documentId, title);
        this._editorContext.setActiveTool(ToolId.PLACE_STRUCTURE);
        return true;
    },

    removeStructurePlacement(placementId) {
        const document = this._documentManager.document;
        if (!placementId || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new RemoveStructurePlacementCommand({
            worldId: document.world.id,
            placementId
        }));
        return true;
    }
};
