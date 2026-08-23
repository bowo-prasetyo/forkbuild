// Pure repetition math (0.4.9): given a selection's own bounds-center
// origin (the exact pivot application/CopySelectionUseCase.js already
// stores as SpatialClipboardState#origin) and a per-copy offset vector,
// generates the ABSOLUTE anchor positions N successive copies land at.
//
// Copy i (1-indexed; the original selection is never copy 0 — it stays
// exactly where it is, untouched) sits at origin + offset*i — the same
// "successive pastes cascade by an offset" idea
// application/PasteClipboardUseCase.js's own PASTE_OFFSET already
// names, generalized from one step to N.
//
// The +origin term matters: application/PasteClipboardUseCase.js's own
// `position` parameter is the ABSOLUTE anchor the clipboard's (already
// origin-relative) items get re-added to, not an additive delta from
// wherever the source selection happened to sit — passing a bare offset
// as that anchor recenters the copy near the offset itself rather than
// shifting it away from the original by that amount. Anchoring every
// copy at origin + offset*i is what makes repetition correct regardless
// of where in the World the source selection lives.
export const RepetitionMath = Object.freeze({
    generateAnchors(origin, offset, count) {
        const anchors = [];
        for (let i = 1; i <= count; i++) {
            anchors.push({
                x: origin.x + offset.x * i,
                y: origin.y + offset.y * i,
                z: origin.z + offset.z * i
            });
        }
        return anchors;
    }
});
