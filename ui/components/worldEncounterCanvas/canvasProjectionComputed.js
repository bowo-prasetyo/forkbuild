const WORLD_HALF_SPAN = 50;
const CANVAS_SIZE = 600;

function projectToCanvas(value) {
    return CANVAS_SIZE / 2 + (value / WORLD_HALF_SPAN) * (CANVAS_SIZE / 2);
}

// WorldEncounterCanvas computed properties: the effective World view and
// its rows projected onto the canvas.
// Spread into the component's `computed`, so `this` is the component instance.
export const canvasProjectionComputed = {
    // `registry`, when supplied, wins.
    effectiveView() {
        return this.registry ? this.worldView : this.view;
    },
    publicationRows() {
        return this.effectiveView && Array.isArray(this.effectiveView.publications) ? this.effectiveView.publications : [];
    },
    avatarRows() {
        return this.effectiveView && Array.isArray(this.effectiveView.avatars) ? this.effectiveView.avatars : [];
    },
    projectedPublications() {
        return this.publicationRows.map((row) => ({
            objectId: row.objectId,
            label: row.title,
            x: projectToCanvas(row.x),
            y: projectToCanvas(row.z)
        }));
    },
    projectedAvatars() {
        return this.avatarRows.map((row) => ({
            objectId: row.objectId,
            label: row.displayName,
            x: projectToCanvas(row.x),
            y: projectToCanvas(row.z)
        }));
    },
    // Observer-local rows, projected like `projectedPublications` but kept
    // separate: they carry no title, publisher, signature or placement data
    // (never joined to a WorldPlacement), so merging would fabricate or blank
    // those fields.
    //
    // Rows whose publicationId already has an authoritative `publicationRows`
    // entry (matched on `objectId`) are hidden, so a Publication registered
    // after being discovered doesn't render twice. This only filters the
    // rendered row: the store and any open inspection are untouched, and a
    // row reappears if its authoritative entry leaves (never "once placed,
    // forever hidden").
    projectedObserverLocalEncounters() {
        // `|| []` for test harnesses that call this computed directly via
        // `WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx)`
        // without priming `ctx.publicationRows`.
        const placedPublicationIds = new Set((this.publicationRows || []).map((row) => row.objectId));
        return this.observerLocalEncounters
            .filter((encounter) => !placedPublicationIds.has(encounter.publicationId))
            .map((encounter) => ({
                publicationId: encounter.publicationId,
                contentHash: encounter.contentHash,
                x: projectToCanvas(encounter.position.x),
                y: projectToCanvas(encounter.position.z)
            }));
    },
    projectedWanderer() {
        return {
            x: projectToCanvas(this.wandererPosition.x),
            y: projectToCanvas(this.wandererPosition.z)
        };
    },
    isWorldEmpty() {
        return this.publicationRows.length === 0 && this.avatarRows.length === 0;
    }
};
