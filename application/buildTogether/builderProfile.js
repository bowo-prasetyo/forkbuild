import { normalizeBuiltWith } from '../../core/catalog/BuiltWith.js';

// One person's builds, by identity (ui/views/BuilderView.js): the builds
// they published and signed, and the builds others published crediting them
// as having built it together (core/catalog/BuiltWith.js). Only what verifies counts:
// a build is theirs when their identity signed it, and a credit counts when
// the author who signed the build gave it. Newest of each build only.
//
// `publications`: what this device knows of. `signerOf(publication)`: the
// identity whose signature on it verifies, or null
// (application/publication/FollowingFeed.js, createVerifiedPublisherResolver).
export function builderProfile({ identityId, publications, signerOf }) {
    if (!identityId || typeof signerOf !== 'function') return Object.freeze({ name: null, builds: Object.freeze([]), builtWith: Object.freeze([]) });
    const builds = new Map();
    const builtWith = new Map();
    const names = [];
    for (const publication of Array.isArray(publications) ? publications : []) {
        const documentId = publication?.documentId;
        if (typeof documentId !== 'string' || !documentId) continue;
        let signer = null;
        try {
            signer = signerOf(publication);
        } catch {
            signer = null;
        }
        if (!signer) continue;
        if (signer === identityId) {
            keepNewest(builds, publication);
            if (typeof publication.author === 'string' && publication.author.trim()) names.push({ name: publication.author.trim(), at: time(publication) });
            continue;
        }
        const credit = normalizeBuiltWith(publication.builtWith).find((entry) => entry.identityId === identityId);
        if (!credit) continue;
        keepNewest(builtWith, publication);
        if (credit.name) names.push({ name: credit.name, at: time(publication) });
    }
    names.sort((a, b) => b.at - a.at);
    return Object.freeze({
        name: names[0]?.name || null,
        builds: Object.freeze(newestFirst(builds)),
        builtWith: Object.freeze(newestFirst(builtWith))
    });
}

function keepNewest(map, publication) {
    const known = map.get(publication.documentId);
    if (!known || time(publication) > time(known)) map.set(publication.documentId, publication);
}

function newestFirst(map) {
    return [...map.values()].sort((a, b) => time(b) - time(a));
}

function time(publication) {
    const value = new Date(publication?.publishedAt ?? 0).getTime();
    return Number.isFinite(value) ? value : 0;
}
