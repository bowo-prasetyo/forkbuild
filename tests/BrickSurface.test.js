import * as THREE from 'three';
import { BrickSurface, brickSurfaceOf, SURFACE_ROUGHNESS } from '../core/BrickSurface.js';
import { VILLAGE_PALETTE } from '../core/VillagePalette.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { applyBrickSurface, withBrickBounds } from '../renderer/BrickSurfaceMaterial.js';
import { makeNightGlowing } from '../renderer/NightGlowMaterial.js';
import { ThreeBrickFactory } from '../renderer/ThreeBrickFactory.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { assert } from './support/Assert.js';

// The brick look (core/BrickSurface.js, renderer/BrickSurfaceMaterial.js):
// what each brick is made of, read by type and, for the plain blocks, by
// colour; every brick material drawn with its surface, on top of the night
// glow and the instanced highlight; and bricks of different surfaces drawn
// with different materials. tests/BrickSurfaceBrowser.test.js compiles the
// shaders and looks at the pixels with real WebGL.

const colour = (id) => VILLAGE_PALETTE.find((swatch) => swatch.id === id).color;

// By type.
{
    assert(brickSurfaceOf('core:brick_1x2') === BrickSurface.MASONRY && brickSurfaceOf('core:arch') === BrickSurface.MASONRY, 'bricks and arches are laid in courses');
    assert(brickSurfaceOf('core:wall_1x3') === BrickSurface.PLASTER, 'walls are plastered');
    assert(brickSurfaceOf('core:beam') === BrickSurface.WOOD && brickSurfaceOf('core:door') === BrickSurface.WOOD && brickSurfaceOf('core:table') === BrickSurface.WOOD, 'beams, doors and furniture are wood');
    assert(brickSurfaceOf('core:roof_hip_6x6') === BrickSurface.TILE && brickSurfaceOf('core:slope_45') === BrickSurface.TILE, 'roofs and slopes are tiled');
    assert(brickSurfaceOf('core:window_small') === BrickSurface.GLASS, 'windows are glass');
    assert(brickSurfaceOf('core:bush') === BrickSurface.FOLIAGE && brickSurfaceOf('core:rock') === BrickSurface.STONE, 'a bush is leaves and a rock is stone');
    assert(brickSurfaceOf('core:plate_1x1') === BrickSurface.PLAIN && brickSurfaceOf('community:anything') === BrickSurface.PLAIN, 'anything else is plain');
    for (const definition of CoreLibrary.definitions) {
        const surface = brickSurfaceOf(definition.id, definition.color);
        assert(Object.values(BrickSurface).includes(surface) && SURFACE_ROUGHNESS[surface] !== undefined, `${definition.id} has a surface with a roughness (${surface})`);
    }
    console.log('✓ every brick is made of something: courses, plaster, wood, tiles, glass, leaves, stone or plain');
}

// The plain blocks, by colour.
{
    assert(brickSurfaceOf('core:cube', colour('meadow')) === BrickSurface.FOLIAGE && brickSurfaceOf('core:cube', colour('leaf')) === BrickSurface.FOLIAGE, 'grass-green cubes are grass');
    assert(brickSurfaceOf('core:cube', colour('plaster')) === BrickSurface.PLASTER && brickSurfaceOf('core:cube', colour('cream')) === BrickSurface.PLASTER, 'pale cubes are smooth');
    assert(brickSurfaceOf('core:cube', colour('oak')) === BrickSurface.WOOD && brickSurfaceOf('core:cube', colour('darkTimber')) === BrickSurface.WOOD, 'dark brown cubes are timber');
    assert(brickSurfaceOf('core:cube', colour('stone')) === BrickSurface.MASONRY && brickSurfaceOf('core:cube', colour('brick')) === BrickSurface.MASONRY, 'stone and brick cubes are laid in courses');
    const cube = CoreLibrary.definitions.find((definition) => definition.id === 'core:cube');
    assert(brickSurfaceOf('core:cube', cube.color) === BrickSurface.MASONRY, 'a new cube, in its own mint green, is a laid block, not grass');
    assert(brickSurfaceOf('core:cube') === BrickSurface.MASONRY, 'a cube of no known colour too');
    assert(brickSurfaceOf('core:beam', colour('meadow')) === BrickSurface.WOOD, 'a brick of a set kind keeps its surface whatever its colour');
    console.log('✓ the plain blocks are read by colour: grass, sand and plaster, timber, or courses');
}

// A geometry carries its bounds; a material its surface, over what it had.
{
    const geometry = withBrickBounds(new THREE.BoxGeometry(2, 1, 4).translate(0, 0.5, 0));
    const center = geometry.getAttribute('brickCenter');
    const half = geometry.getAttribute('brickHalf');
    assert(center.count === geometry.getAttribute('position').count && Math.abs(center.getY(0) - 0.5) < 1e-6, 'every vertex knows the box\'s centre');
    assert(half.getX(3) === 1 && half.getY(3) === 0.5 && half.getZ(3) === 2, 'and its half size');
    assert(withBrickBounds(geometry) === geometry && geometry.getAttribute('brickHalf') === half, 'giving it again changes nothing');

    const shaderOf = (material) => {
        const shader = {
            uniforms: {},
            vertexShader: '#include <common>\n#include <begin_vertex>',
            fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'
        };
        material.onBeforeCompile(shader);
        return shader;
    };
    const wood = applyBrickSurface(new THREE.MeshStandardMaterial(), BrickSurface.WOOD);
    assert(wood.roughness === SURFACE_ROUGHNESS.wood && wood.defines.BRICK_SURFACE === 3 && 'BRICK_SURFACE_EDGES' in wood.defines, 'wood: its roughness, its grain and edge lines');
    const leaves = applyBrickSurface(new THREE.MeshStandardMaterial(), BrickSurface.FOLIAGE);
    assert(!('BRICK_SURFACE_EDGES' in leaves.defines), 'leaves have no edge lines');
    const woodShader = shaderOf(wood);
    assert(woodShader.fragmentShader.includes('diffuseColor.rgb *= brickSurfaceShade();') && woodShader.vertexShader.includes('vSurfaceHalf = brickHalf;'), 'the shader multiplies the surface into the colour');
    assert(wood.customProgramCacheKey() !== leaves.customProgramCacheKey(), 'each surface compiles its own program');
    assert(applyBrickSurface(wood, BrickSurface.GLASS) === wood && wood.userData.brickSurface === BrickSurface.WOOD, 'a material keeps the first surface it was given');

    // The night glow goes on top, keeping the surface.
    const window = applyBrickSurface(new THREE.MeshStandardMaterial(), BrickSurface.GLASS);
    makeNightGlowing(window, 0xffd54f, { value: 1 });
    const glowing = shaderOf(window);
    assert(glowing.fragmentShader.includes('brickSurfaceShade()') && glowing.fragmentShader.includes('uGlowColor * uNightGlow') && glowing.uniforms.uNightGlow,
        'a lit window keeps its glass and glows at night');
    assert(window.customProgramCacheKey().includes('brick-surface-glass') && window.customProgramCacheKey().includes('night-glow'), 'its program is told apart by both');
    console.log('✓ a brick\'s geometry carries its bounds, and its material its surface, under the night glow');
}

// Standalone and instanced bricks are drawn with their surfaces.
{
    const mesh = new ThreeBrickFactory().createMesh('core:roof_gable', 0xa63a3a);
    assert(mesh.material.userData.brickSurface === BrickSurface.TILE && mesh.geometry.getAttribute('brickHalf'), 'a standalone roof is tiled, with its bounds');
    assert(!new ThreeBrickFactory().createGeometry('core:cube').getAttribute('brickHalf'), 'a geometry for export carries nothing extra');

    const scene = new THREE.Scene();
    const registry = new BrickInstanceRegistry(scene);
    const at = (x, definitionId, color) => ({ definitionId, x, y: 0.5, z: 0, rotationY: 0, color, glow: 0 });
    registry.add('wall', 'doc', 'b', at(0, 'core:wall_1x1', 0xe8dcc0));
    registry.add('beam', 'doc', 'b', at(2, 'core:beam', 0x8b5a2b));
    registry.add('cube', 'doc', 'b', at(4, 'core:cube', colour('stone')));
    const surfaceOfMesh = (mesh) => mesh.material.userData.brickSurface;
    const surfaces = new Set(registry.pickableObjects().map(surfaceOfMesh));
    assert(surfaces.has(BrickSurface.PLASTER) && surfaces.has(BrickSurface.WOOD) && surfaces.has(BrickSurface.MASONRY), `each surface its own material (${[...surfaces]})`);
    const plasterMeshes = registry.pickableObjects().filter((mesh) => surfaceOfMesh(mesh) === BrickSurface.PLASTER);
    registry.add('wall2', 'doc', 'b', at(1, 'core:wall_1x1', 0xe8dcc0));
    assert(registry.pickableObjects().filter((mesh) => surfaceOfMesh(mesh) === BrickSurface.PLASTER).length === plasterMeshes.length, 'bricks of one kind and surface still share one draw');
    assert(registry.pickableObjects().every((mesh) => mesh.geometry.getAttribute('brickHalf')), 'every chunk carries its bricks\' bounds');

    registry.update('cube', at(4, 'core:cube', colour('meadow')));
    const cubeMesh = registry.pickableObjects().find((mesh) => mesh.geometry.getAttribute('position').count === 24 && surfaceOfMesh(mesh) === BrickSurface.FOLIAGE);
    assert(cubeMesh && registry.getColor('cube') === colour('meadow'), 'a cube painted meadow green moves to the grass material');
    assert(!registry.pickableObjects().some((mesh) => surfaceOfMesh(mesh) === BrickSurface.MASONRY), 'and the courses it left are gone');

    const cut = { planes: [new THREE.Plane()], apply(material) { material.clippingPlanes = this.planes; } };
    registry.useCutaway(cut);
    registry.add('roof', 'doc', 'b', at(6, 'core:roof_gable', 0xa63a3a));
    assert(registry.pickableObjects().every((mesh) => mesh.material.clippingPlanes === cut.planes), 'the cutaway reaches every surface, made before or after it');
    console.log('✓ standalone and instanced bricks are drawn with their surfaces, and a recoloured cube changes its own');
}
