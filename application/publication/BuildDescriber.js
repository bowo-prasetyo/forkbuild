// Describes builds and what a remix changed (core/catalog/BuildDescription.js),
// with the Brick Library's definitions and the Build Library's structures
// loaded the first time they are needed, so a page that never describes a
// build never loads them.
import { buildShape } from '../../core/catalog/BuildSimilarity.js';
import { describeBricks, describeRemixChanges } from '../../core/catalog/BuildDescription.js';
import { remixParentPublication } from '../../core/publication/RemixLineage.js';
import { readSharedBuildBricks } from './sharing/ReadSharedBuild.js';

async function defaultBrickRegistry() {
    const { CreateBrickRegistryUseCase } = await import('../editor/CreateBrickRegistryUseCase.js');
    return new CreateBrickRegistryUseCase().execute();
}

async function defaultReadyMadeStructures() {
    const { CreateStructureRegistryUseCase } = await import('../editor/CreateStructureRegistryUseCase.js');
    return new CreateStructureRegistryUseCase().execute().getAll();
}

export class BuildDescriber {
    constructor({ brickRegistry = defaultBrickRegistry, readyMadeStructures = defaultReadyMadeStructures } = {}) {
        this._loadBrickRegistry = brickRegistry;
        this._loadReadyMadeStructures = readyMadeStructures;
        this._options = null;
    }

    // What `bricks` are (describeBricks()).
    async describe(bricks) {
        return describeBricks(bricks, await this._describeOptions());
    }

    // What `bricks` changed from `parentBricks` (describeRemixChanges()).
    async remixChanges(parentBricks, bricks) {
        return describeRemixChanges(parentBricks, bricks, await this._describeOptions());
    }

    // What the remix `publication`, whose bricks are `bricks`, changed from
    // the version of the build it remixes found among `parentPublications`;
    // null when that build or its bricks can't be read. Never rejects.
    async remixChangesOf(publication, bricks, { parentPublications = [], contentStore = null } = {}) {
        try {
            const parent = remixParentPublication(publication, parentPublications);
            if (!parent || !Array.isArray(bricks)) return null;
            const parentBricks = await readSharedBuildBricks({ publication: parent, contentStore });
            if (!Array.isArray(parentBricks)) return null;
            return await this.remixChanges(parentBricks, bricks);
        } catch {
            return null;
        }
    }

    // Loaded once; a library that can't be loaded names nothing from it.
    _describeOptions() {
        if (!this._options) {
            this._options = Promise.all([
                Promise.resolve().then(() => this._loadBrickRegistry()).catch(() => null),
                Promise.resolve().then(() => this._loadReadyMadeStructures()).catch(() => [])
            ]).then(([registry, structures]) => ({
                definitionOf: (id) => {
                    try {
                        return registry?.get?.(id) || null;
                    } catch {
                        return null;
                    }
                },
                readyMade: (Array.isArray(structures) ? structures : [])
                    .filter((structure) => structure && Array.isArray(structure.bricks))
                    .map((structure) => ({ id: structure.id, shape: buildShape(structure.bricks) }))
            }));
        }
        return this._options;
    }
}
