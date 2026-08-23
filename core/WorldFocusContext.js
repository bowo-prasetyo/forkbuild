import { distanceXZ } from './WorldSpatialAnchor.js';
import { regionsContaining, describePlace } from './WorldRegionGeography.js';
import { directionLabelBetween, deriveNearbyGeographicPlaces, DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS } from './GeographicPlaceNavigation.js';
import { deriveEditorEntryContext } from './EditorEntryContext.js';

// 0.5.8 — World View Contextual Focus & Information Hierarchy.
//
// World View accumulated a real information architecture across
// 0.3.6-0.5.7 — regions, landmarks, structures, collaborators, and (as
// of 0.5.5/0.5.6) geographic place candidates — but nothing anywhere
// answers ONE question the exact same way regardless of which surface
// (Explore's "Nearby ___" rows, the Locations panel, the World Map, the
// Places directory) a viewer happened to select something from:
//
//   "What am I looking at, right now?"
//
// A WorldFocusContext is that answer: a small, DERIVED, read-only
// reshaping of whatever World content a viewer selected — never a sixth
// stored object alongside WorldRegion/WorldLandmark/StructurePlacement/
// GeographicPlaceView/WorldSpatialContext, and never itself a
// navigation action. See this module's own principle:
//
//   A Focus Context Describes What You Are Looking At; It Does Not
//   Navigate, And It Does Not Create New World Content (0.5.8)
//
// Three related, easily-confused verbs exist in this codebase by the
// time this milestone ships, and this file is careful to only ever be
// the first of them:
//
//   Focus (noun, THIS file) — "show me information about this thing."
//   Go    (verb, pre-existing) — moves the 3D camera. Every
//          `focusLocation()`/`focusCollaborator()`/`focusPlace()`
//          method on application/WorldNavigationSession.js already
//          means this, and — deliberately — NONE of them are renamed
//          by this milestone. ui/components/LocationsPanel.js and
//          ui/components/GeographicPlacePanel.js already have their own
//          "Focus" BUTTON wired to those exact methods, a naming
//          collision this milestone inherits rather than causes. The
//          new ui/components/WorldFocusPanel.js this file feeds
//          deliberately labels its own camera-move button "Go" (the
//          same word Explore's own "Nearby ___" rows already use) so
//          the new UI never says "Focus" to mean two different things
//          in the same screen.
//   Map   (verb, pre-existing) — changes the 2D map viewport
//          (ui/components/WorldMapPanel.js's own "Show on Map").
//
// A WorldFocusContext never calls any of the Go/Map verbs itself — it
// only describes ENOUGH for a host (ui/views/WorldView.js) to offer
// them as buttons. See deriveWorldFocusContext()'s own header for the
// derivation, and application/WorldNavigationSession.js#getFocusContext()
// for the one place raw World state is gathered and handed to it.
export const WorldFocusKind = Object.freeze({
    REGION: 'region',
    LANDMARK: 'landmark',
    STRUCTURE: 'structure',
    COLLABORATOR: 'collaborator',
    GEOGRAPHIC_PLACE: 'geographic_place'
});

export function isValidWorldFocusKind(kind) {
    return Object.values(WorldFocusKind).includes(kind);
}

// The closed vocabulary of actions a WorldFocusPanel may offer, per
// kind — see deriveWorldFocusContext()'s own per-kind table below for
// which kind gets which. Deliberately just LABELS the host already
// knows how to wire (Go -> focusLocation()/focusCollaborator(), Map ->
// the exact same "Show on Map" ui/components/GeographicPlacePanel.js
// already has, Names -> the exact same PlaceNamingPanel every region
// already opens) — this file invents no new verb.
// EDIT_COPY (0.5.9) — "Edit a Copy": forks the Document CONTAINING this
// target (never the target itself, never the whole World — see
// docs/Principles.md, "World View Observes and Navigates; Editor
// Mutates and Builds (0.5.9)") and opens the fork in the Editor. Only
// ever offered for a REGION/LANDMARK/STRUCTURE — never COLLABORATOR (a
// person is not a document) and never GEOGRAPHIC_PLACE (a derived
// grouping of OTHER Worlds' regions has no single document of its own
// to fork; its own regions each offer Edit a Copy individually).
export const WorldFocusAction = Object.freeze({
    GO: 'go',
    MAP: 'map',
    NAMES: 'names',
    EDIT_COPY: 'edit_copy'
});

export class WorldFocusContext {
    constructor({
        kind,
        title,
        subtitle = '',
        description = '',
        position,
        distance = null,
        direction = null,
        regionPath = [],
        geographicPlace = null,
        availableActions = [],
        source = null
    } = {}) {
        if (!isValidWorldFocusKind(kind)) {
            throw new Error(`WorldFocusContext: invalid kind "${kind}"`);
        }
        if (!title) {
            throw new Error('WorldFocusContext requires a title');
        }
        if (!position) {
            throw new Error('WorldFocusContext requires a position');
        }
        this._kind = kind;
        this._title = title;
        this._subtitle = subtitle || '';
        this._description = description || '';
        this._position = { x: position.x || 0, y: position.y || 0, z: position.z || 0 };
        this._distance = typeof distance === 'number' && Number.isFinite(distance) ? distance : null;
        this._direction = direction || null;
        this._regionPath = Array.isArray(regionPath) ? [...regionPath] : [];
        this._geographicPlace = geographicPlace || null;
        this._availableActions = Array.isArray(availableActions) ? [...availableActions] : [];
        this._source = source || null;
    }

    get kind() { return this._kind; }
    get title() { return this._title; }
    get subtitle() { return this._subtitle; }
    get description() { return this._description; }
    get position() { return this._position; }
    get distance() { return this._distance; }
    get direction() { return this._direction; }
    get regionPath() { return this._regionPath; }
    get geographicPlace() { return this._geographicPlace; }
    get availableActions() { return this._availableActions; }
    get source() { return this._source; }

    hasAction(action) { return this._availableActions.includes(action); }

    // 0.6.0 — Context-Preserving Fork-to-Edit. The EditorEntryContext
    // (core/EditorEntryContext.js) that "Edit a Copy" would hand to the
    // Editor if invoked RIGHT NOW — derived on demand from this
    // context's own fields, never stored, never computed unless read.
    // null whenever this kind never offers EDIT_COPY in the first
    // place (COLLABORATOR/GEOGRAPHIC_PLACE — see hasAction() above and
    // deriveWorldFocusContext()'s own per-kind action table) or carries
    // no source.documentId to fork. `selectAllBricks` is decided HERE,
    // per kind, exactly like every other per-kind branch in this file —
    // only STRUCTURE's own documentId is content it exclusively owns
    // (see core/EditorEntryContext.js's own header for why REGION/
    // LANDMARK never set this).
    get editCopyContext() {
        if (!this.hasAction(WorldFocusAction.EDIT_COPY) || !this._source || !this._source.documentId) {
            return null;
        }
        return deriveEditorEntryContext(this, { selectAllBricks: this._kind === WorldFocusKind.STRUCTURE });
    }

    // The human-authored breadcrumb for this target's OWN position —
    // "Willow Village · Green Valley" — empty string when no named
    // region actually contains it. Exactly core/WorldSpatialContext.js#
    // placeName's own convention, reused here rather than re-derived a
    // third time, applied to the FOCUSED target's position instead of
    // the viewer's own.
    get placeName() { return describePlace(this._regionPath); }

    // "You are in ___" for real, human-authored geometric containment;
    // "You are near ___" for a geographic place CANDIDATE (a guess,
    // however well-corroborated); a neutral fallback when neither is
    // known. Deliberately the exact same two-tier wording
    // docs/Principles.md, "A Geographic Place Is Navigable; It Does Not
    // Become World Content (0.5.6)" already established for
    // ui/components/WorldWelcomePanel.js's own arrival banner — this
    // getter is that same distinction, made available to WHATEVER is
    // focused, not just the viewer's own arrival position. Neither
    // phrasing is ever upgraded into the other: a target sitting at a
    // geographic place's own representative center still reads "near,"
    // never "in," unless a real WorldRegion actually contains it.
    get arrivalPhrase() {
        if (this._regionPath.length > 0) {
            return `You are in ${this.placeName}`;
        }
        if (this._geographicPlace) {
            return `You are near ${this._geographicPlace.displayName}`;
        }
        return 'Unmarked ground — no named place claims this yet.';
    }

    toJSON() {
        return {
            kind: this._kind,
            title: this._title,
            subtitle: this._subtitle,
            description: this._description,
            position: { ...this._position },
            distance: this._distance,
            direction: this._direction,
            regionPath: this._regionPath.map((r) => ({ id: r.id, name: r.name, kind: r.kind, distance: r.distance })),
            placeName: this.placeName,
            geographicPlace: this._geographicPlace ? {
                fingerprintKey: this._geographicPlace.fingerprintKey,
                displayName: this._geographicPlace.displayName,
                distance: this._geographicPlace.distance,
                direction: this._geographicPlace.direction
            } : null,
            arrivalPhrase: this.arrivalPhrase,
            availableActions: [...this._availableActions],
            source: this._source ? { ...this._source } : null,
            editCopyContext: this.editCopyContext ? this.editCopyContext.toJSON() : null
        };
    }
}

function capitalize(word) {
    return word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : '';
}

function formatActivity(activity) {
    if (!activity) return '';
    const activityMap = {
        BUILDING: 'building nearby',
        EDITING: 'editing nearby',
        INSPECTING: 'inspecting nearby',
        WALKING: 'exploring nearby',
        IDLE: 'standing by'
    };
    return activityMap[activity] || activity.toLowerCase();
}

function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// A short summary line for a geographic place candidate — the exact
// same three counts ui/components/GeographicPlacePanel.js#formatSummary()
// already renders, computed here so a WorldFocusContext's own
// `description` reads the same "3 descriptions · 2 Worlds · 7
// contributors" line regardless of which surface opened it.
function formatGeographicPlaceSummary(place) {
    return [
        pluralize(place.descriptionCount || 0, 'description'),
        pluralize(place.worldCount || 0, 'World'),
        pluralize(place.authorCount || 0, 'contributor')
    ].join(' · ');
}

// The one place a WorldFocusContext is ever built. Pure: no session, no
// store, no World mutation, no camera movement — every input is a plain
// value the caller (application/WorldNavigationSession.js#getFocusContext())
// already has lying around from its own existing collections
// (_collectRegions(), getGeographicPlaceDirectory(), etc.), the exact
// same "gather, then derive" shape core/WorldWelcomeContext.js#
// deriveWorldWelcomeContext() already established.
//
// Parameters:
//   - kind: one of WorldFocusKind
//   - entity: the kind-specific raw row —
//       REGION:           { id, name, kind, description, position, radius,
//                            documentId }
//       LANDMARK:         { id, title, description, position, documentId }
//       STRUCTURE:        { id, title, position, documentId } — documentId
//                          here is the placed structure's OWN content
//                          document, not the containing World's
//       COLLABORATOR:     { identityId, deviceId, displayName, activity, position }
//       GEOGRAPHIC_PLACE: a GeographicPlaceView#toJSON() shape PLUS its
//                          own resolved `position` (the caller attaches
//                          this exactly the way
//                          getNearbyGeographicPlaces() already does, by
//                          resolving through WorldLocationDirectory)
//   - viewerPosition: the viewer's own current position, for
//     distance/direction — optional; both are null without one
//   - regions: every region row this session currently knows about,
//     the SAME shape _collectRegions()/getMapContent() already produce
//     — used only to compute regionPath (geometric containment of the
//     TARGET's own position, never the viewer's)
//   - nearbyPlaceEntries: every geographic place candidate's own
//     {fingerprintKey, displayName, descriptionCount, worldCount,
//     authorCount, position} row — the SAME shape
//     getNearbyGeographicPlaces() already builds internally before
//     calling deriveNearbyGeographicPlaces() — used to find the nearest
//     OTHER geographic place candidate to the target's own position
//
// Returns null for an unknown kind or a missing/positionless entity —
// never throws on bad input, the same graceful-absence posture every
// other derive*() function in this codebase already holds to.
export function deriveWorldFocusContext({
    kind,
    entity,
    viewerPosition = null,
    regions = [],
    nearbyPlaceEntries = []
} = {}) {
    if (!isValidWorldFocusKind(kind) || !entity || !entity.position) {
        return null;
    }
    const position = entity.position;

    const distance = viewerPosition ? distanceXZ(viewerPosition, position) : null;
    const direction = viewerPosition ? directionLabelBetween(viewerPosition, position) : null;

    // Geometric containment of the TARGET's own position — "what named
    // area(s) does THIS sit inside," never the viewer's. A REGION
    // focusing on itself trivially contains itself (distance 0 from its
    // own center); that's not useful breadcrumb information about
    // itself, so it's excluded — regionPath for a region describes what
    // it sits inside, not itself.
    const containing = regionsContaining(position, regions)
        .filter((region) => !(kind === WorldFocusKind.REGION && region.id === entity.id));
    const regionPath = containing.map((region) => {
        const d = distanceXZ(region.position, position);
        return {
            id: region.id,
            name: region.name,
            kind: region.kind,
            distance: d !== null ? Math.round(d * 10) / 10 : null
        };
    });

    // The nearest geographic place CANDIDATE to the target's own
    // position — excluding the target itself when the target IS a
    // geographic place, so "Near: ___" never names itself. Reuses
    // core/GeographicPlaceNavigation.js#deriveNearbyGeographicPlaces()
    // wholesale rather than a second distance/sort implementation.
    const placeCandidates = kind === WorldFocusKind.GEOGRAPHIC_PLACE
        ? nearbyPlaceEntries.filter((entry) => entry.fingerprintKey !== entity.fingerprintKey)
        : nearbyPlaceEntries;
    const geographicPlace = deriveNearbyGeographicPlaces(placeCandidates, position, DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS)[0] || null;

    const roundedDistance = distance !== null ? Math.round(distance * 10) / 10 : null;

    switch (kind) {
        case WorldFocusKind.REGION:
            return new WorldFocusContext({
                kind,
                title: entity.name,
                subtitle: `Region${entity.kind ? ` · ${capitalize(entity.kind)}` : ''}`,
                description: entity.description || '',
                position, distance: roundedDistance, direction, regionPath, geographicPlace,
                availableActions: [WorldFocusAction.GO, WorldFocusAction.MAP, WorldFocusAction.NAMES, WorldFocusAction.EDIT_COPY],
                // _collectRegions() (application/WorldNavigationSession.js)
                // calls this field `worldId`, not `documentId` — same
                // value (a WorldRegion's owning Document/World identity
                // are the same id throughout this codebase), tolerated
                // here rather than renaming a field several other
                // existing callers of _collectRegions() already depend on.
                source: { kind, id: entity.id, documentId: entity.documentId || entity.worldId || null }
            });
        case WorldFocusKind.LANDMARK:
            return new WorldFocusContext({
                kind,
                title: entity.title,
                subtitle: 'Landmark',
                description: entity.description || '',
                position, distance: roundedDistance, direction, regionPath, geographicPlace,
                availableActions: [WorldFocusAction.GO, WorldFocusAction.EDIT_COPY],
                source: { kind, id: entity.id, documentId: entity.documentId || null }
            });
        case WorldFocusKind.STRUCTURE:
            return new WorldFocusContext({
                kind,
                title: entity.title,
                subtitle: 'Structure',
                description: '',
                position, distance: roundedDistance, direction, regionPath, geographicPlace,
                availableActions: [WorldFocusAction.GO, WorldFocusAction.EDIT_COPY],
                // A STRUCTURE's own documentId is the PLACED structure's
                // real content document (StructurePlacement#documentId —
                // the same id ui/views/WorldView.js#openStructureSource()
                // already loads) — never the containing World's document
                // that merely positions it. "Edit a Copy" forks the
                // structure itself, exactly what a viewer is looking at.
                source: { kind, id: entity.id, documentId: entity.documentId || null }
            });
        case WorldFocusKind.COLLABORATOR:
            return new WorldFocusContext({
                kind,
                title: entity.displayName || 'Collaborator',
                subtitle: 'Collaborator',
                description: formatActivity(entity.activity),
                position, distance: roundedDistance, direction, regionPath, geographicPlace,
                availableActions: [WorldFocusAction.GO],
                source: { kind, id: entity.deviceId || entity.identityId || null }
            });
        case WorldFocusKind.GEOGRAPHIC_PLACE:
            return new WorldFocusContext({
                kind,
                title: entity.displayName,
                subtitle: 'Geographic Place',
                description: formatGeographicPlaceSummary(entity),
                position, distance: roundedDistance, direction, regionPath, geographicPlace,
                availableActions: [WorldFocusAction.GO, WorldFocusAction.MAP],
                source: { kind, id: entity.fingerprintKey }
            });
        default:
            return null;
    }
}
