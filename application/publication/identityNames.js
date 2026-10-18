import { normalizeBuiltWith } from '../../core/BuiltWith.js';

// A person's name, for "alice and 11 others" and a comment's author, from
// what this device knows, best first:
//   1. this device's own identity: the name it signed in with;
//   2. the name the person publishes builds under, from the newest build
//      whose signature verifies as theirs (application/buildTogether/
//      builderProfile.js reads names the same way), else the name an author
//      credited them by on a build that author signed;
//   3. the name they chose themselves, carried by the record being shown
//      (a heart's `authorName`), unverified.
// Null when none is known; the caller then shows a short form of the id.
//
// One pass over the known Publications makes an index of every signer's
// name, rebuilt only when the Publications change, so naming everyone on a
// page costs one pass, not one per name.
export function createIdentityNames({ publications, signerOf, ownIdentity = () => null } = {}) {
    let indexedFrom = null;
    let index = new Map();

    function currentIndex() {
        const list = safely(() => publications(), []);
        const fingerprint = list.length + ':' + list.map((p) => p && p.id).join(',');
        if (fingerprint !== indexedFrom) {
            index = indexNames(list, signerOf);
            indexedFrom = fingerprint;
        }
        return index;
    }

    // `{ name, source }`, source 'you' | 'published' | 'chosen', or null.
    function nameFor(identityId, chosenName = null) {
        if (!identityId) return null;
        const own = safely(() => ownIdentity(), null);
        if (own && own.id === identityId && own.name) return Object.freeze({ name: own.name, source: 'you' });
        const published = currentIndex().get(identityId);
        if (published) return Object.freeze({ name: published, source: 'published' });
        const chosen = typeof chosenName === 'string' ? chosenName.trim() : '';
        return chosen ? Object.freeze({ name: chosen, source: 'chosen' }) : null;
    }

    return Object.freeze({ nameFor });
}

// identityId -> name: each signer's own newest signed build's author name,
// else the newest credit naming them on a build its author signed.
function indexNames(publications, signerOf) {
    const own = new Map();
    const credited = new Map();
    for (const publication of publications) {
        const signer = safely(() => signerOf(publication), null);
        if (!signer) continue;
        const at = timeOf(publication);
        const author = typeof publication.author === 'string' ? publication.author.trim() : '';
        if (author) keepNewer(own, signer, author, at);
        for (const credit of normalizeBuiltWith(publication.builtWith)) {
            if (credit.identityId && credit.name) keepNewer(credited, credit.identityId, credit.name, at);
        }
    }
    const names = new Map();
    for (const [identityId, entry] of credited) names.set(identityId, entry.name);
    for (const [identityId, entry] of own) names.set(identityId, entry.name);
    return names;
}

function keepNewer(map, identityId, name, at) {
    const known = map.get(identityId);
    if (!known || at > known.at) map.set(identityId, { name, at });
}

function timeOf(publication) {
    const value = publication && publication.publishedAt;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function safely(fn, fallback) {
    try {
        return fn();
    } catch {
        return fallback;
    }
}
