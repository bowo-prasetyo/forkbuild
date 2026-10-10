// A build's family (docs/Pillars.md, "Every build has a family tree"): the
// builds it was remixed from, back to the first, and the remixes made from
// it, and from those, as far as this device knows. Built only from what
// Publications state (`parentDocumentId`, which Edit a Copy records) and
// never inferred from two builds looking alike. Like a remix count, it is
// credit and an invitation to remix, never a ranking.
//
// Pure: `lookUp` reads the Publications this device knows of, as
// DiscoveryProvider#findByDocumentId() and #findByParentId() do.

export const REMIX_FAMILY_LIMITS = Object.freeze({
    // Generations followed back toward the original.
    ancestors: 6,
    // Generations of remixes shown below this build.
    depth: 3,
    // Remixes shown in all, so a much-remixed build stays readable.
    remixes: 24
});

// `{ ancestors, build, remixes, more }`:
// - ancestors: oldest first, each `{ documentId, title, author, publication }`;
//   the last is this build's own parent. A parent this device has no
//   Publication for is named from the credit the remix carries, and the
//   line stops there.
// - build: this build, as a member.
// - remixes: `[{ ...member, remixes: [...] }]`, newest first at each level.
// - more: remixes left out by the limits.
export function remixFamily(publication, lookUp, limits = REMIX_FAMILY_LIMITS) {
    const findByDocumentId = typeof lookUp?.findByDocumentId === 'function' ? lookUp.findByDocumentId : () => [];
    const findByParentId = typeof lookUp?.findByParentId === 'function' ? lookUp.findByParentId : () => [];
    const documentId = text(publication?.documentId);
    if (!documentId) return Object.freeze({ ancestors: Object.freeze([]), build: null, remixes: Object.freeze([]), more: 0 });

    const seen = new Set([documentId]);
    const ancestors = [];
    let child = publication;
    while (ancestors.length < limits.ancestors) {
        const parentId = text(child?.parentDocumentId);
        if (!parentId || seen.has(parentId)) break;
        seen.add(parentId);
        const parent = newest(safe(() => findByDocumentId(parentId)).filter((candidate) => candidate?.documentId === parentId));
        if (!parent) {
            const credit = child.license?.attribution;
            const credited = credit && credit.sourceDocumentId === parentId;
            ancestors.unshift(member(parentId, credited ? credit.title : null, credited ? credit.author : null, null));
            break;
        }
        ancestors.unshift(member(parentId, parent.title, parent.author, parent));
        child = parent;
    }

    let budget = limits.remixes;
    let more = 0;
    function remixesOf(parentId, depth) {
        const byDocument = new Map();
        for (const candidate of safe(() => findByParentId(parentId))) {
            const remixId = text(candidate?.documentId);
            if (!remixId || candidate.parentDocumentId !== parentId || seen.has(remixId)) continue;
            const known = byDocument.get(remixId);
            if (!known || time(candidate) > time(known)) byDocument.set(remixId, candidate);
        }
        const remixes = [...byDocument.values()].sort((a, b) => time(b) - time(a));
        const members = [];
        for (const remix of remixes) {
            if (budget <= 0) {
                more += 1;
                continue;
            }
            budget -= 1;
            seen.add(remix.documentId);
            const below = depth < limits.depth ? remixesOf(remix.documentId, depth + 1) : countBelow(remix.documentId);
            members.push(Object.freeze({
                ...member(remix.documentId, remix.title, remix.author, remix),
                remixes: Array.isArray(below) ? below : Object.freeze([])
            }));
        }
        return Object.freeze(members);
    }
    // Past the depth limit, remixes are only counted.
    function countBelow(parentId) {
        const ids = new Set(safe(() => findByParentId(parentId))
            .filter((candidate) => candidate?.parentDocumentId === parentId && text(candidate.documentId) && !seen.has(candidate.documentId))
            .map((candidate) => candidate.documentId));
        more += ids.size;
        return Object.freeze([]);
    }

    const remixes = remixesOf(documentId, 1);
    return Object.freeze({
        ancestors: Object.freeze(ancestors),
        build: member(documentId, publication.title, publication.author, publication),
        remixes,
        more
    });
}

// The family trees worth showing for a set of builds (a week's challenge
// entries): each build's family, when it has one, left out when it already
// appears in the tree of another build of the set, so a chain of remixes is
// shown once, from its earliest member in the set.
export function familyTreesOf(publications, lookUp, limits = REMIX_FAMILY_LIMITS) {
    const list = Array.isArray(publications) ? publications : [];
    const inSet = new Set(list.map((publication) => text(publication?.documentId)).filter(Boolean));
    const families = [];
    const shown = new Set();
    for (const publication of list) {
        const family = remixFamily(publication, lookUp, limits);
        if (!family.build || shown.has(family.build.documentId) || remixFamilySize(family) === 0) continue;
        if (family.ancestors.some((ancestor) => inSet.has(ancestor.documentId))) continue;
        shown.add(family.build.documentId);
        families.push(family);
    }
    return Object.freeze(families);
}

// How many builds a family names besides the build itself.
export function remixFamilySize(family) {
    if (!family || !family.build) return 0;
    const count = (members) => members.reduce((total, entry) => total + 1 + count(entry.remixes || []), 0);
    return family.ancestors.length + count(family.remixes) + family.more;
}

function member(documentId, title, author, publication) {
    return Object.freeze({ documentId, title: text(title), author: text(author), publication: publication || null });
}

function newest(publications) {
    let best = null;
    for (const publication of publications) {
        if (!best || time(publication) > time(best)) best = publication;
    }
    return best;
}

function time(publication) {
    const value = new Date(publication?.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}

function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safe(read) {
    try {
        const result = read();
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
}
