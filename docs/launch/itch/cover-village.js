// Draws the village for docs/launch/itch/cover-village.html with the app's own
// showcase renderer, and lets scripts/itch-cover.mjs turn it a step at a time
// (window.cover.turn) to photograph a still and the frames of a looping GIF.
import { ShowcaseTurntableRenderer } from '../../../renderer/ShowcaseTurntableRenderer.js';
import { CreateBrickRegistryUseCase } from '../../../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../../../application/editor/CreateStructureRegistryUseCase.js';
import { composeShowcase, featuredStructures } from '../../../application/home/FeaturedBuilds.js';

// Warm roofs and a striped lighthouse read as a village even at thumbnail size.
const STRUCTURE_IDS = ['collection:house_with_garden', 'village:mill', 'collection:keepers_lighthouse', 'village:garden_cottage'];

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const structureRegistry = new CreateStructureRegistryUseCase().execute();
// The renderer draws into a hidden WebGL canvas, copied into the picture in
// the same task: a WebGL buffer is cleared once shown, and the words laid
// over it would make a screenshot composite it again, blank.
const scene = document.querySelector('#scene');
const picture = document.querySelector('#picture').getContext('2d');
const renderer = new ShowcaseTurntableRenderer(brickRegistry, scene, { reducedMotion: true });
const copy = () => picture.drawImage(scene, 0, 0, picture.canvas.width, picture.canvas.height);
renderer.resize();
renderer.show(composeShowcase(featuredStructures(structureRegistry, STRUCTURE_IDS), brickRegistry));
copy();

window.cover = {
    turn(radians) {
        renderer.turnBy(radians);
        copy();
    },
    ready: true
};
