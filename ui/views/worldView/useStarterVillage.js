import { PLAZA_CENTER } from '../../../core/ChallengePlaza.js';
import { starterVillageLayout } from '../../../core/StarterVillage.js';
import { plazaSquareWorld } from '../../../core/library/PlazaSquare.js';
import { FEATURED_STRUCTURE_IDS, featuredStructures, structureWorld } from '../../../application/home/FeaturedBuilds.js';
import { CreateStructureRegistryUseCase } from '../../../application/editor/CreateStructureRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from '../../../application/editor/CreateBrickRegistryUseCase.js';
import { libraryItemName } from '../../i18n/libraryText.js';

// The village at the challenge plaza (core/StarterVillage.js): the square
// (core/library/PlazaSquare.js) and the six ready-made builds
// (application/home/FeaturedBuilds.js) stand in every World View, wherever it
// opens, drawn and walked into like the plaza's exhibits but never placed,
// signed or stored. A week's entries are shown round them while its plaza
// is visited. The plaza's panel lists them (useChallengePlaza.js).
// Exhibit keys are Document ids; these can't be.
export const VILLAGE_SQUARE_KEY = 'plaza:square';
const READY_MADE_KEY_PREFIX = 'ready-made:';

export function useStarterVillage({ session }) {
    let standing = [];
    // What stands, for the plaza's panel: `{ key, readyMadeId, title, author, middle }`.
    let readyMades = [];

    function standVillage() {
        clearVillage();
        let builds = [];
        try {
            const brickRegistry = new CreateBrickRegistryUseCase().execute();
            const structures = featuredStructures(new CreateStructureRegistryUseCase().execute(), FEATURED_STRUCTURE_IDS);
            const spots = new Map(starterVillageLayout(structures, brickRegistry).map((spot) => [spot.structureId, spot]));
            builds = structures
                .filter((structure) => spots.has(structure.id))
                .map((structure) => ({ structure, world: structureWorld(structure, brickRegistry), spot: spots.get(structure.id) }));
        } catch {
            builds = [];
        }
        session.showPlazaExhibit(VILLAGE_SQUARE_KEY, plazaSquareWorld(), PLAZA_CENTER);
        standing.push(VILLAGE_SQUARE_KEY);
        readyMades = builds.map(({ structure, world, spot }) => {
            const key = READY_MADE_KEY_PREFIX + structure.id;
            session.showPlazaExhibit(key, world, spot.position);
            standing.push(key);
            return Object.freeze({ key, readyMadeId: structure.id, title: libraryItemName(structure), author: null, middle: spot.middle });
        });
    }

    function clearVillage() {
        for (const key of standing) session.hidePlazaExhibit(key);
        standing = [];
        readyMades = [];
    }

    return { standVillage, clearVillage, villageReadyMades: () => readyMades };
}
