// Whether a World View visitor sees someone else's build
// (docs/reviews/CreativeDirection-2026-10-12b.md, finding 1; FunnelEvent
// WORLD_NEIGHBOUR): one of the builds standing in view that is neither one
// this device published nor one open for it to edit. The village's
// ready-made builds are never among them: they are drawn, not loaded.
//
// Pure: the loaded ids, and how to tell a visitor's own.
export function seesNeighbour(loadedDocumentIds, { ownDocumentIds = new Set(), isEditable = () => false } = {}) {
    for (const id of loadedDocumentIds || []) {
        if (typeof id !== 'string' || !id || ownDocumentIds.has(id)) continue;
        let editable = false;
        try {
            editable = Boolean(isEditable(id));
        } catch {
            editable = true;
        }
        if (!editable) return true;
    }
    return false;
}
