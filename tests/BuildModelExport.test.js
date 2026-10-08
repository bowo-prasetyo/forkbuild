// A build as a 3D model (core/BuildModelFormats.js,
// renderer/BuildMeshExtraction.js, application/export/BuildModelExport.js):
// its bricks and placed structures where the World View draws them, as
// triangles grouped by color, written as glTF binary, STL and OBJ files that
// say whose build it is.
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import {
    BuildModelFormat, STL_MILLIMETRES_PER_UNIT, countTriangles, describeBuildCredit, writeGlb, writeObj, writeStl
} from '../core/BuildModelFormats.js';
import { extractBuildMeshes } from '../renderer/BuildMeshExtraction.js';
import { buildModelFileName, collectModelBricks, writeBuildModel } from '../application/export/BuildModelExport.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { isUserFacingError } from '../core/UserFacingError.js';
import { assert } from './support/Assert.js';

const registry = new CreateBrickRegistryUseCase().execute();
const metadata = { title: 'Little tower', author: 'alice', license: 'CC BY 4.0', remixedFrom: 'Old Keep' };

function worldOf(bricks) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    return world;
}

const cube = (x, y, z, color = null, rotation = 0) => new Brick({ definitionId: 'core:cube', position: new Position(x, y, z), rotation, color });

// Triangles: a cube is 12, placed where the brick stands, grouped by color.
{
    const meshes = extractBuildMeshes([cube(0, 0.5, 0, 0xff0000), cube(3, 0.5, 0, 0xff0000), cube(0, 1.5, 0, 0x0000ff)], registry);
    assert(meshes.length === 2, `one group per color (${meshes.length})`);
    const red = meshes.find((mesh) => mesh.color === 0xff0000);
    assert(countTriangles([red]) === 24 && countTriangles(meshes) === 36, `12 triangles a cube (${countTriangles(meshes)})`);
    const xs = [];
    for (let i = 0; i < red.positions.length; i += 3) xs.push(red.positions[i]);
    assert(Math.min(...xs) === -0.5 && Math.max(...xs) === 3.5, `each cube where it stands (${Math.min(...xs)}..${Math.max(...xs)})`);
    for (let i = 0; i < red.normals.length; i += 3) {
        const length = Math.hypot(red.normals[i], red.normals[i + 1], red.normals[i + 2]);
        assert(Math.abs(length - 1) < 1e-5, 'normals are unit length');
    }
    const turned = extractBuildMeshes([new Brick({ definitionId: 'core:window_large', position: new Position(0, 1, 0), rotation: 90 })], registry)[0];
    const tx = [];
    const tz = [];
    for (let i = 0; i < turned.positions.length; i += 3) {
        tx.push(turned.positions[i]);
        tz.push(turned.positions[i + 2]);
    }
    assert(Math.abs(Math.max(...tx) - 0.125) < 1e-5 && Math.abs(Math.max(...tz) - 1) < 1e-5, 'a brick turned 90° is turned in the model too');
    const castle = ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle');
    const castleMeshes = extractBuildMeshes(castle.bricks, registry);
    assert(countTriangles(castleMeshes) > castle.bricks.length * 10 && castleMeshes.length >= 2, `the showcase castle, every brick, in its colors (${countTriangles(castleMeshes)} triangles, ${castleMeshes.length} colors)`);
    let unknown = false;
    try {
        extractBuildMeshes([new Brick({ definitionId: 'nowhere:brick', position: new Position(0, 0, 0) })], registry);
    } catch {
        unknown = true;
    }
    assert(unknown, 'an unknown brick fails loudly, as it does when drawn');
    console.log('✓ bricks become triangles where they stand, grouped by color');
}

// Placed structures come along, turned and moved as the World View draws them.
{
    const tower = worldOf([cube(1, 0.5, 0, 0x00ff00)]);
    const world = worldOf([cube(0, 0.5, 0)]);
    world.addStructurePlacement(new StructurePlacement({ documentId: 'tower', position: new Position(10, 0, 0), rotation: 90 }));
    world.addStructurePlacement(new StructurePlacement({ documentId: 'gone', position: new Position(0, 0, 0) }));
    const { bricks, missingPlacements } = collectModelBricks(world, (id) => (id === 'tower' ? tower : null));
    assert(bricks.length === 2 && missingPlacements === 1, `the build's own brick and the placed one; a placement not on this device is counted (${bricks.length}, ${missingPlacements})`);
    const placed = bricks[1];
    assert(Math.abs(placed.position.x - 10) < 1e-9 && Math.abs(placed.position.z - 1) < 1e-9 && placed.rotation === 90 && placed.color === 0x00ff00,
        `turned about the placement's origin, then moved, keeping its color (${JSON.stringify(placed.position)})`);
    console.log('✓ placed structures come along where the World View draws them');
}

// glTF binary: valid container, one primitive per color, linear colors, credit.
{
    const meshes = extractBuildMeshes([cube(0, 0.5, 0, 0xffffff), cube(0, 1.5, 0, 0x000000)], registry);
    const glb = writeGlb({ meshes, metadata });
    const view = new DataView(glb);
    assert(view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === glb.byteLength, 'a glTF 2.0 binary of the length it says');
    const jsonLength = view.getUint32(12, true);
    assert(view.getUint32(16, true) === 0x4e4f534a && jsonLength % 4 === 0, 'its JSON chunk comes first, aligned');
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
    const binAt = 20 + jsonLength;
    assert(view.getUint32(binAt + 4, true) === 0x004e4942 && view.getUint32(binAt, true) >= json.buffers[0].byteLength, 'then its binary chunk, holding the buffer');
    assert(json.asset.version === '2.0' && json.asset.generator === 'ForkBuild', 'it says what made it');
    assert(json.asset.copyright === 'Little tower by alice · CC BY 4.0 · remixed from Old Keep · made with ForkBuild' && json.asset.extras.license === 'CC BY 4.0',
        `and whose build it is, under which license (${json.asset.copyright})`);
    const primitives = json.meshes[0].primitives;
    assert(primitives.length === 2 && primitives.every((p) => p.mode === 4 && json.accessors[p.attributes.POSITION].count === 36), 'one primitive of triangles per color');
    const position = json.accessors[primitives[0].attributes.POSITION];
    assert(position.min && position.max && position.max[1] <= 2 && position.min[1] >= 0, 'positions carry their bounds, as glTF requires');
    const factors = json.materials.map((m) => m.pbrMetallicRoughness.baseColorFactor);
    assert(JSON.stringify(factors) === JSON.stringify([[1, 1, 1, 1], [0, 0, 0, 1]]), 'materials in the colors of the bricks');
    const empty = writeGlb({ meshes: [] });
    const emptyJson = JSON.parse(new TextDecoder().decode(new Uint8Array(empty, 20, new DataView(empty).getUint32(12, true))));
    assert(emptyJson.scenes[0].nodes.length === 0 && !emptyJson.buffers, 'an empty build is an empty, valid scene');
    console.log('✓ glTF binary: a valid file, a primitive per color, with its credit');
}

// sRGB colors become glTF's linear ones.
{
    const meshes = extractBuildMeshes([cube(0, 0, 0, 0x808080)], registry);
    const glb = writeGlb({ meshes });
    const length = new DataView(glb).getUint32(12, true);
    const factor = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, length))).materials[0].pbrMetallicRoughness.baseColorFactor[0];
    assert(Math.abs(factor - 0.2158605) < 1e-4, `mid grey is 0.216 in linear light (${factor})`);
    console.log('✓ colors are converted to linear light');
}

// STL: binary, Z up, millimetres, standing on the bed, centred.
{
    const meshes = extractBuildMeshes([cube(5, 0.5, 2), cube(5, 1.5, 2)], registry);
    const stl = writeStl({ meshes, metadata });
    const view = new DataView(stl);
    const header = new TextDecoder().decode(new Uint8Array(stl, 0, 80));
    assert(header.startsWith('ForkBuild model: Little tower by alice') && !header.startsWith('solid'), 'the header names the build, and is never mistaken for ASCII STL');
    const count = view.getUint32(80, true);
    assert(count === 24 && stl.byteLength === 84 + count * 50, `a binary STL of ${count} triangles`);
    const zs = [];
    const xs = [];
    for (let t = 0; t < count; t++) {
        const at = 84 + t * 50;
        const n = [0, 1, 2].map((k) => view.getFloat32(at + k * 4, true));
        assert(Math.abs(Math.hypot(...n) - 1) < 1e-5, 'each facet has a unit normal');
        for (let v = 0; v < 3; v++) {
            xs.push(view.getFloat32(at + 12 + v * 12, true));
            zs.push(view.getFloat32(at + 12 + v * 12 + 8, true));
        }
    }
    assert(Math.min(...zs) === 0 && Math.abs(Math.max(...zs) - 2 * STL_MILLIMETRES_PER_UNIT) < 1e-4, `two cubes stand ${Math.max(...zs)} mm tall on the bed, Z up`);
    assert(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-4, 'centred over the origin');
    let upward = 0;
    for (let t = 0; t < count; t++) if (view.getFloat32(84 + t * 50 + 8, true) > 0.99) upward++;
    assert(upward === 4, `the tops face up (+Z), so the winding survived the turn (${upward} facets)`);
    console.log('✓ STL: Z up, millimetres, on the bed, with its credit');
}

// OBJ: colored vertices, normals, faces, credit as comments.
{
    const meshes = extractBuildMeshes([cube(0, 0.5, 0, 0xff8000), cube(2, 0.5, 0, 0x0080ff)], registry);
    const obj = writeObj({ meshes, metadata: { ...metadata, title: 'Little\ntower' } });
    const lines = obj.split('\n');
    assert(lines[0] === '# ForkBuild model' && lines[1].includes('by alice') && lines.includes('o Little_tower'), 'credit as comments, a newline in a title can\'t break a line');
    const vertices = lines.filter((l) => l.startsWith('v '));
    assert(vertices.length === 72 && lines.filter((l) => l.startsWith('vn ')).length === 72 && lines.filter((l) => l.startsWith('f ')).length === 24, 'every vertex, normal and face');
    assert(vertices[0].split(' ').length === 7 && vertices[0].endsWith(' 1 0.502 0'), `vertices carry their color (${vertices[0]})`);
    const lastFace = lines.filter((l) => l.startsWith('f ')).at(-1);
    assert(lastFace === 'f 70//70 71//71 72//72', `faces index across groups (${lastFace})`);
    console.log('✓ OBJ: colored vertices, normals and faces, with its credit');
}

// The file: named after the build, and none for an empty one.
{
    const meshes = extractBuildMeshes([cube(0, 0.5, 0)], registry);
    const file = writeBuildModel({ format: BuildModelFormat.STL, meshes, metadata: { title: 'Château d’Été!' } });
    assert(file.fileName === 'forkbuild-chateau-d-ete.stl' && file.mimeType === 'model/stl' && file.triangles === 12, `named after the build (${file.fileName})`);
    assert(typeof writeBuildModel({ format: BuildModelFormat.OBJ, meshes, metadata }).data === 'string', 'OBJ is text');
    assert(writeBuildModel({ format: BuildModelFormat.GLB, meshes, metadata }).data instanceof ArrayBuffer, 'glTF binary is bytes');
    assert(buildModelFileName('', 'glb') === 'forkbuild-build.glb', 'an untitled build is "build"');
    let refused = null;
    try {
        writeBuildModel({ format: BuildModelFormat.GLB, meshes: [], metadata });
    } catch (error) {
        refused = error;
    }
    assert(isUserFacingError(refused), 'an empty build is refused, in words');
    assert(describeBuildCredit({}) === 'A ForkBuild build · made with ForkBuild', 'a build with nothing known still says where it is from');
    console.log('✓ the file is named after the build; an empty build makes none');
}
