// Base class every spatial index adapter extends. Answers "Where do
// published worlds exist in shared space?" and "Which worlds are
// near this location?"
//
// The implementation may be an array, an R-tree, PostGIS, or a
// blockchain index. The application layer never knows which.
export class SpatialIndexProvider {
    add(placement) { throw new Error('SpatialIndexProvider.add() must be implemented'); }
    update(placement) { throw new Error('SpatialIndexProvider.update() must be implemented'); }
    remove(placementId) { throw new Error('SpatialIndexProvider.remove() must be implemented'); }
    get(placementId) { throw new Error('SpatialIndexProvider.get() must be implemented'); }
    findByPublicationId(publicationId) { throw new Error('SpatialIndexProvider.findByPublicationId() must be implemented'); }
    discover(center, radius) { throw new Error('SpatialIndexProvider.discover() must be implemented'); }
    list() { throw new Error('SpatialIndexProvider.list() must be implemented'); }
}
