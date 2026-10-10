// A plot (docs/Pillars.md, "Your work is yours, and lives in a world"): a
// spot in a World where someone chose Build here, remembered for the build
// they started there, so that publishing the build stands it on that spot.
// Like any placement, it is the builder's own note of where to show their
// build; it claims no land (docs/user/03-WorldView.md, "Why can two builds
// sit in the same spot?").
//
// `{ buildDocumentId, worldDocumentId, worldTitle, position: { x, y, z }, createdAt }`.

const MAX_TITLE_LENGTH = 120;
// Far beyond any World's terrain, and short of where floats lose precision.
const MAX_COORDINATE = 1e7;

export function normalizeBuildPlot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const buildDocumentId = id(raw.buildDocumentId);
    const worldDocumentId = id(raw.worldDocumentId);
    const position = normalizePosition(raw.position);
    if (!buildDocumentId || !worldDocumentId || !position) return null;
    const created = new Date(raw.createdAt);
    return Object.freeze({
        buildDocumentId,
        worldDocumentId,
        worldTitle: typeof raw.worldTitle === 'string' ? raw.worldTitle.trim().slice(0, MAX_TITLE_LENGTH) : '',
        position,
        createdAt: Number.isFinite(created.getTime()) ? created.toISOString() : null
    });
}

// A position from Build here's link (`?plot=<world>&x=&y=&z=`), rounded to
// the centimetre so the link stays short; null when it isn't one.
export function plotPositionFromQuery(query) {
    if (!query) return null;
    return normalizePosition({ x: Number(query.x), y: Number(query.y), z: Number(query.z) });
}

export function plotQuery({ worldDocumentId, worldTitle, position }) {
    const round = (value) => Math.round(value * 100) / 100;
    return {
        plot: worldDocumentId,
        x: String(round(position.x)),
        y: String(round(position.y)),
        z: String(round(position.z)),
        ...(worldTitle ? { title: String(worldTitle).slice(0, MAX_TITLE_LENGTH) } : {})
    };
}

function normalizePosition(position) {
    if (!position || typeof position !== 'object') return null;
    const { x, y, z } = position;
    if (![x, y, z].every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) return null;
    return Object.freeze({ x, y, z });
}

function id(value) {
    return typeof value === 'string' && value.trim() && value.length <= 200 ? value.trim() : null;
}
