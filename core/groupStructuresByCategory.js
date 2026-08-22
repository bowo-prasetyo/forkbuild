// Pure grouping helper — first-seen category order, [{ category,
// structures }] — extracted from core/StructureRegistry.js#groupByCategory()
// so a second Structure catalog (application/LocalStructureLibraryStore.js,
// 0.4.3's Personal Blueprint Library) groups its own contents exactly the
// same way the built-in registry always has, rather than a second grouping
// loop written for personal content. Takes a plain array of Structures —
// neither caller here is a registry internally, so this never assumes one.
export function groupStructuresByCategory(structures) {
    const groups = [];
    const indexByCategory = new Map();
    for (const structure of structures) {
        if (!indexByCategory.has(structure.category)) {
            indexByCategory.set(structure.category, groups.length);
            groups.push({ category: structure.category, structures: [] });
        }
        groups[indexByCategory.get(structure.category)].structures.push(structure);
    }
    return groups;
}
