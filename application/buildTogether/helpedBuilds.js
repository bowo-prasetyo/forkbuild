import { builderProfile } from './builderProfile.js';

// The builds `identityId` helped make (Build with me), newest first: those
// this device noted while building them (HelpedBuildsStore) and those found
// published crediting them (builderProfile, only credits whose author's
// signature verifies). Each is `{ documentId, title, authorName,
// authorIdentityId, publication, at }`, with `publication` the newest one
// this device knows of the build, or null while it isn't published (or not
// found yet).
export function helpedBuilds({ identityId, noted = [], publications = [], signerOf }) {
    if (!identityId) return Object.freeze([]);
    const byDocument = new Map();
    const newestOf = (documentId) => {
        let best = null;
        for (const publication of publications) {
            if (publication?.documentId !== documentId) continue;
            if (!best || time(publication.publishedAt) > time(best.publishedAt)) best = publication;
        }
        return best;
    };
    for (const publication of builderProfile({ identityId, publications, signerOf }).builtWith) {
        byDocument.set(publication.documentId, entry({
            documentId: publication.documentId,
            title: publication.title,
            authorName: publication.author,
            authorIdentityId: publication.publisherIdentity?.id || null,
            publication,
            at: publication.publishedAt
        }));
    }
    for (const helped of Array.isArray(noted) ? noted : []) {
        if (!helped?.documentId) continue;
        const known = byDocument.get(helped.documentId);
        if (known) {
            if (time(helped.at) > time(known.at)) byDocument.set(helped.documentId, entry({ ...known, at: helped.at }));
            continue;
        }
        const publication = newestOf(helped.documentId);
        byDocument.set(helped.documentId, entry({
            documentId: helped.documentId,
            title: publication?.title || helped.title,
            authorName: publication?.author || helped.authorName,
            authorIdentityId: helped.authorIdentityId || publication?.publisherIdentity?.id || null,
            publication,
            at: helped.at
        }));
    }
    return Object.freeze([...byDocument.values()].sort((a, b) => time(b.at) - time(a.at)));
}

function entry({ documentId, title, authorName, authorIdentityId, publication, at }) {
    return Object.freeze({
        documentId,
        title: typeof title === 'string' && title.trim() ? title.trim() : null,
        authorName: typeof authorName === 'string' && authorName.trim() ? authorName.trim() : null,
        authorIdentityId: authorIdentityId || null,
        publication: publication || null,
        at: at instanceof Date ? at.toISOString() : (at || null)
    });
}

function time(value) {
    const ms = new Date(value ?? 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
}
