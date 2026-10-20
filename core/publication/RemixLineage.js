// Remixes: a published build whose Publication names another build as its
// parent (`parentDocumentId`, which Edit a Copy records). Shown where a build
// is presented, as "Remixed from …" and "Remixed N times"
// (docs/Principles.md, "A Remix Count Credits And Invites Remixing; It Is
// Still Only A Count (2026-10-08)").
//
// Pure: callers pass the Publications this device knows of.

// How many builds are remixes of `documentId`: the distinct documents among
// `publications` that name it as their parent. A remix published twice, or
// known from two places, is one remix; a build never counts as its own.
export function countRemixes(publications, documentId) {
    if (typeof documentId !== 'string' || !documentId || !Array.isArray(publications)) return 0;
    const remixes = new Set();
    for (const publication of publications) {
        const remix = publication?.documentId;
        if (publication?.parentDocumentId === documentId && typeof remix === 'string' && remix && remix !== documentId) {
            remixes.add(remix);
        }
    }
    return remixes.size;
}

// What `publication` was remixed from: null when it isn't a remix, otherwise
// `{ title, author }`, each null when unknown. Read first from the parent's
// own Publication (`parentPublications`, those this device knows of, newest
// used), then from the credit the remix's license carries (written when it
// was forked; the remixer's word, signed with the remix), which is all a
// link-only share brings along.
export function describeRemixSource(publication, parentPublications = []) {
    const parentDocumentId = publication?.parentDocumentId;
    if (typeof parentDocumentId !== 'string' || !parentDocumentId) return null;
    const parent = newest((Array.isArray(parentPublications) ? parentPublications : [])
        .filter((candidate) => candidate?.documentId === parentDocumentId));
    if (parent) {
        return Object.freeze({ title: text(parent.title), author: text(parent.author) });
    }
    const attribution = publication.license?.attribution;
    if (attribution && attribution.sourceDocumentId === parentDocumentId) {
        return Object.freeze({ title: text(attribution.title), author: text(attribution.author) });
    }
    return Object.freeze({ title: null, author: null });
}

function newest(publications) {
    let best = null;
    for (const publication of publications) {
        if (!best || time(publication) > time(best)) best = publication;
    }
    return best;
}

function time(publication) {
    const value = new Date(publication.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}

function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
