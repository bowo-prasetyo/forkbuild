// Computes world-space bounding boxes for selected bricks. Brick geometry
// comes from BrickDefinition dimensions; brick positions are treated as
// the center of the brick, matching the Three.js mesh placement model.
export class SelectionBoundsService {
    constructor(brickRegistry) {
        this._brickRegistry = brickRegistry;
    }

    calculate(selection, document) {
        if (!selection || selection.isEmpty || selection.type === 'ground' || !document) return null;
        const world = document.world;
        let bounds = null;
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (!brick) return null;
            const brickBounds = this.calculateBrickBounds(brick);
            bounds = bounds ? SelectionBoundsService.union(bounds, brickBounds) : brickBounds;
        }
        return bounds;
    }

    calculateBrickBounds(brick) {
        const definition = this._brickRegistry ? this._brickRegistry.get(brick.definitionId) : null;
        const width = definition ? definition.width : 1;
        const height = definition ? definition.height : 1;
        const depth = definition ? definition.depth : 1;
        const half = { x: width / 2, y: height / 2, z: depth / 2 };
        return SelectionBoundsService.fromMinMax(
            { x: brick.position.x - half.x, y: brick.position.y - half.y, z: brick.position.z - half.z },
            { x: brick.position.x + half.x, y: brick.position.y + half.y, z: brick.position.z + half.z }
        );
    }

    static union(a, b) {
        return SelectionBoundsService.fromMinMax(
            { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
            { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) }
        );
    }

    static fromMinMax(min, max) {
        return {
            min,
            max,
            center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
            size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }
        };
    }
}
