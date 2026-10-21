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

    // What each remix in `family` (core/publication/RemixFamily.js's) changed
    // from the member it was remixed from: a Map from document id to
    // describeRemixChanges()'s, for every pair whose bricks this device can
    // read, at most `limit` of them. A member's bricks are read as a shared
    // link reads a build's, unless `readBricks(member)` is given. Never
    // rejects.
    async familyChanges(family, {
        contentStore = null,
        limit = 30,
        readBricks = (member) => readSharedBuildBricks({ publication: member.publication, contentStore })
    } = {}) {
        const changes = new Map();
        if (!family?.build) return changes;
        const pairs = [];
        const line = [...(family.ancestors || []), family.build];
        for (let i = 1; i < line.length; i += 1) pairs.push([line[i], line[i - 1]]);
        const below = (parent, remixes) => {
            for (const remix of remixes || []) {
                pairs.push([remix, parent]);
                below(remix, remix.remixes);
            }
        };
        below(family.build, family.remixes);
        const bricks = new Map();
        const bricksOf = (member) => {
            if (!member?.publication) return Promise.resolve(null);
            if (!bricks.has(member.documentId)) {
                bricks.set(member.documentId, Promise.resolve().then(() => readBricks(member)).catch(() => null));
            }
            return bricks.get(member.documentId);
        };
        for (const [member, parent] of pairs.slice(0, limit)) {
            try {
                const [mine, theirs] = await Promise.all([bricksOf(member), bricksOf(parent)]);
                if (Array.isArray(mine) && Array.isArray(theirs)) changes.set(member.documentId, await this.remixChanges(theirs, mine));
            } catch {
                // That pair says nothing.
            }
        }
        return changes;
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
