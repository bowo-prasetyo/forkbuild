// 0.3.0 — Collaborative Spatial Presence.
//
// Deliberately NOT application/spatial-state/SpatialSelectionState.js.
// That class answers "what is THIS replica currently selecting, for
// editing/inspection purposes" — it is a live, mutable-by-replacement
// piece of session state that feeds application/SpatialEditingService.js,
// the transform gizmo, and every mutation command in application/commands/.
// WorldSpatialSelection answers a completely different, much narrower
// question: "what is a REMOTE participant reporting they have selected,"
// for display only. Reusing SpatialSelectionState here would blur that
// line badly — a value shaped like "the current selection" arriving over
// the network is exactly the kind of thing a future refactor could
// accidentally wire into an editing path. See docs/Principles.md, "UI
// Selection Must Never Imply Editing Authority" (0.2.95) — remote
// selection observation must imply even LESS than that: it is never even
// eligible to become an editing target, by construction, because nothing
// in application/SpatialEditingService.js, application/commands/, or the
// transform gizmo pipeline knows this class exists.
//
// A closed, tiny vocabulary, mirroring SpatialSelectionState's own two
// World-View-relevant kinds (0.2.93's `brick`/`placement` split) — never
// the full brick-marquee/ground-click vocabulary the LOCAL selection
// state supports, because a remote participant's selection is only ever
// shown as a single glowing outline, never a multi-item marquee.
//
//   kind        — null | 'brick' | 'placement'
//   documentId  — the World/host document the selection lives in (the
//                 SAME "host document, not the placement's own
//                 referenced document" distinction SpatialSelectionState.placement()
//                 already draws)
//   buildingId  — only meaningful when kind === 'brick'
//   brickId     — only meaningful when kind === 'brick'
//   placementId — only meaningful when kind === 'placement'
export class WorldSpatialSelection {
    constructor({ kind = null, documentId = null, buildingId = null, brickId = null, placementId = null } = {}) {
        this._kind = kind;
        this._documentId = documentId || null;
        this._buildingId = buildingId || null;
        this._brickId = brickId || null;
        this._placementId = placementId || null;
    }

    get kind() { return this._kind; }
    get documentId() { return this._documentId; }
    get buildingId() { return this._buildingId; }
    get brickId() { return this._brickId; }
    get placementId() { return this._placementId; }
    get isEmpty() { return this._kind === null; }

    equals(other) {
        if (!(other instanceof WorldSpatialSelection)) {
            return false;
        }
        return this._kind === other.kind
            && this._documentId === other.documentId
            && this._buildingId === other.buildingId
            && this._brickId === other.brickId
            && this._placementId === other.placementId;
    }

    toJSON() {
        if (this._kind === null) {
            return null;
        }
        if (this._kind === 'brick') {
            return { kind: 'brick', documentId: this._documentId, buildingId: this._buildingId, brickId: this._brickId };
        }
        return { kind: 'placement', documentId: this._documentId, placementId: this._placementId };
    }

    static none() {
        return new WorldSpatialSelection();
    }

    static brick({ documentId, buildingId, brickId }) {
        return new WorldSpatialSelection({ kind: 'brick', documentId, buildingId, brickId });
    }

    static placement({ documentId, placementId }) {
        return new WorldSpatialSelection({ kind: 'placement', documentId, placementId });
    }

    // Accepts whatever isValidWorldSpatialSelectionPayload() below already
    // accepted — never trusts a shape it hasn't validated first.
    static fromJSON(json) {
        if (!json) {
            return WorldSpatialSelection.none();
        }
        if (json.kind === 'brick') {
            return WorldSpatialSelection.brick(json);
        }
        if (json.kind === 'placement') {
            return WorldSpatialSelection.placement(json);
        }
        return WorldSpatialSelection.none();
    }
}

// A wire-shape validator — null (no selection) is always valid; a
// non-null payload must be a well-formed brick or placement reference.
// Used by core/WorldSpatialPresenceAdvertisement.js's own
// isValidWorldSpatialPresenceAdvertisement() so a malformed `selection`
// field can never sneak an otherwise-valid advertisement past ingestion.
export function isValidWorldSpatialSelectionPayload(value) {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value !== 'object') {
        return false;
    }
    if (value.kind === 'brick') {
        return typeof value.documentId === 'string' && value.documentId.length > 0
            && typeof value.buildingId === 'string' && value.buildingId.length > 0
            && typeof value.brickId === 'string' && value.brickId.length > 0;
    }
    if (value.kind === 'placement') {
        return typeof value.documentId === 'string' && value.documentId.length > 0
            && typeof value.placementId === 'string' && value.placementId.length > 0;
    }
    return false;
}
