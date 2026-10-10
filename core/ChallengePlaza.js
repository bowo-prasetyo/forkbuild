// The challenge plaza (docs/user/03-WorldView.md, "The challenge plaza"): a
// square of open ground in the shared World where a week's challenge entries
// stand in rings around an open middle, so that walking past them is the
// gallery. The entries are exhibits, never placements: nothing is signed,
// stored or claimed for anyone, and they are drawn only while someone visits
// the plaza (ui/views/worldView/useChallengePlaza.js).
//
// Everything here is pure, so every device that knows the same entries lays
// them out the same way.

// The plaza's middle. Dry, level ground (within about 1.7 units across 60 of
// radius, with no river or lake), outside the grid that published builds land
// on by default (core/DeterministicGridPlacement.js covers x, z >= 0), and
// well short of the coast. tests/ChallengePlaza.test.js checks the ground stays so.
export const PLAZA_CENTER = Object.freeze({ x: -170, y: 0, z: 300 });

// No tree grows within this distance of the middle
// (core/NaturalFeatureField.js), so the exhibits stand on open ground: room
// for the first two rings of builds of a typical size.
export const PLAZA_CLEARING_RADIUS = 72;

export function isInPlazaClearing(x, z) {
    const dx = x - PLAZA_CENTER.x;
    const dz = z - PLAZA_CENTER.z;
    return dx * dx + dz * dz < PLAZA_CLEARING_RADIUS * PLAZA_CLEARING_RADIUS;
}

// The open square in the middle, where a visitor arrives.
export const PLAZA_OPEN_RADIUS = 14;
// Room left between two exhibits, and between two rings.
export const PLAZA_GAP = 4;
// The most entries that stand at once; the rest are on the challenge page.
export const PLAZA_MAX_EXHIBITS = 24;

// The order entries stand in: the first published first, so a newly found
// entry joins the outer end and the ones already standing keep their places.
// Ties go by Publication id. Returns a new array.
export function plazaEntryOrder(publications) {
    if (!Array.isArray(publications)) return [];
    return publications
        .filter((publication) => publication && typeof publication.id === 'string')
        .slice()
        .sort((a, b) => (time(a) - time(b)) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
}

// The ground a build covers, from its bounds (core/SpatialBounds.js), in the
// build's own coordinates.
export function plazaFootprint(bounds) {
    const min = bounds?.min || {};
    const max = bounds?.max || {};
    const values = [min.x, max.x, min.z, max.z];
    if (!values.every(Number.isFinite)) return Object.freeze({ minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 });
    return Object.freeze({ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z });
}

// Where each exhibit stands: `items` are `{ key, footprint }` in plazaEntryOrder;
// the result is `{ key, position }` for each, `position` being where the
// build's own origin goes so the middle of its footprint lands on its spot.
// Rings fill from the inside out, each as wide as its largest exhibit, the
// exhibits spread evenly round it; a build too large to share a ring stands
// on one of its own.
export function layoutPlazaExhibits(items, { center = PLAZA_CENTER } = {}) {
    if (!Array.isArray(items)) return [];
    const placed = [];
    let inner = PLAZA_OPEN_RADIUS;
    let index = 0;
    while (index < items.length) {
        const ring = [];
        let ringRadius = 0;
        while (index < items.length) {
            const candidate = { key: items[index].key, footprint: normalizeFootprint(items[index].footprint) };
            candidate.radius = footprintRadius(candidate.footprint);
            const widest = Math.max(ringRadius, candidate.radius);
            const radius = inner + widest;
            const needed = [...ring, candidate].reduce((sum, item) => sum + arcOf(item, radius), 0);
            if (ring.length > 0 && needed > 2 * Math.PI) break;
            ring.push(candidate);
            ringRadius = widest;
            index += 1;
        }
        const radius = inner + ringRadius;
        const used = ring.reduce((sum, item) => sum + arcOf(item, radius), 0);
        const spare = Math.max(0, 2 * Math.PI - used) / ring.length;
        // Each ring starts due north of the middle.
        let angle = -Math.PI / 2;
        for (const item of ring) {
            const half = (arcOf(item, radius) + spare) / 2;
            angle += half;
            const spotX = center.x + radius * Math.cos(angle);
            const spotZ = center.z + radius * Math.sin(angle);
            const { minX, maxX, minZ, maxZ } = item.footprint;
            placed.push(Object.freeze({
                key: item.key,
                position: Object.freeze({
                    x: round(spotX - (minX + maxX) / 2),
                    y: center.y,
                    z: round(spotZ - (minZ + maxZ) / 2)
                })
            }));
            angle += half;
        }
        inner = radius + ringRadius + PLAZA_GAP;
    }
    return placed;
}

function normalizeFootprint(footprint) {
    return plazaFootprint({ min: { x: footprint?.minX, z: footprint?.minZ }, max: { x: footprint?.maxX, z: footprint?.maxZ } });
}

// Half the footprint's diagonal: room for the build whichever way it faces.
function footprintRadius({ minX, maxX, minZ, maxZ }) {
    return Math.hypot(maxX - minX, maxZ - minZ) / 2;
}

// The angle an exhibit takes up on a ring of `radius`, with its gap.
function arcOf(item, radius) {
    return (2 * item.radius + PLAZA_GAP) / radius;
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function time(publication) {
    const value = new Date(publication.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}
