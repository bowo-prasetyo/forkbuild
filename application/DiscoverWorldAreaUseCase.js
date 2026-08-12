import { Position } from '../core/Position.js';

// Orchestrates spatial discovery for the World View.
//
// Returns PlacementRecord[] — lightweight spatial metadata — without
// loading any publication content. The caller (WorldNavigationSession
// or a future streaming system) decides which snapshots to actually
// load and render.
//
// The progressive loading method (executeWithDistanceTiers) splits
// placements into "nearby" (load snapshot) and "distant" (metadata
// only), giving the World View the foundation for streaming an
// eventually enormous virtual world without downloading the entire
// universe.
export class DiscoverWorldAreaUseCase {
    constructor(spatialDiscoveryProvider) {
        this._spatialDiscoveryProvider = spatialDiscoveryProvider;
    }

    // Returns all PlacementRecords intersecting the sphere.
    execute(center, radius) {
        return this._spatialDiscoveryProvider.discover(center, radius);
    }

    // Progressive loading: splits placements into nearby (load
    // snapshot) and distant (metadata only).
    //
    // Returns { nearby, distant, all } where:
    //   nearby  — placements within nearbyRadius (load snapshot)
    //   distant — placements within radius but beyond nearbyRadius
    //             (metadata only, render as placeholder or skip)
    //   all     — all placements within radius
    executeWithDistanceTiers(center, radius, nearbyRadius) {
        const all = this._spatialDiscoveryProvider.discover(center, radius);
        const nearby = [];
        const distant = [];
        const nearbyR2 = nearbyRadius * nearbyRadius;

        for (const record of all) {
            const dx = record.position.x - center.x;
            const dy = record.position.y - center.y;
            const dz = record.position.z - center.z;
            const dist2 = dx * dx + dy * dy + dz * dz;

            if (dist2 <= nearbyR2) {
                nearby.push(record);
            } else {
                distant.push(record);
            }
        }

        return { nearby, distant, all };
    }

    // Reverse lookup: find all placements for a specific publication.
    // "This castle has been placed in 7 locations."
    findByPublicationId(publicationId) {
        return this._spatialDiscoveryProvider.findByPublicationId(publicationId);
    }
}
