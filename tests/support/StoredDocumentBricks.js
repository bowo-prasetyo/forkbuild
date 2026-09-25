import { decodeBrickTable } from '../../core/BrickTable.js';

// Test-support only. The bricks of a stored/published document's
// building, as brick JSON objects, whichever form it holds them in: a
// schema 2 `brickTable` (core/BrickTable.js) or a schema 1 `bricks` array.
export function storedBricks(documentJson, buildingIndex = 0) {
    const building = documentJson.world.buildings[buildingIndex];
    return building.brickTable ? decodeBrickTable(building.brickTable) : building.bricks;
}

// Makes the first brick's position.x non-numeric in a stored document,
// in either form, for tests of how loading refuses a corrupt document.
export function corruptFirstBrickPosition(documentJson, value = 'NOT-A-NUMBER') {
    const building = documentJson.world.buildings[0];
    if (building.brickTable) {
        building.brickTable.values[1] = value;
    } else {
        building.bricks[0].position.x = value;
    }
    return documentJson;
}
