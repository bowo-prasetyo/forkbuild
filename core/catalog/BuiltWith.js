// Who built a build together with its author (docs/reviews/
// CreativeDirection-2026-10-11.md, Release C, "Credit co-builders"): each
// friend whose edits the author's Editor accepted while building together
// (application/buildTogether/BuildTogetherSession.js), by name and identity.
// Kept on the build (DocumentMetadata.builtWith) and copied onto its signed
// Publication, so a shared link and the family tree credit them: the
// author's claim, signed by the author, never something a co-builder adds
// to someone else's build. A copy (Edit a Copy, a fork) starts with none:
// the credit stays with the build they built.
//
// Pure: plain records in, plain records out.

export const BUILT_WITH_MAX_COUNT = 12;
const MAX_NAME_LENGTH = 60;
const MAX_ID_LENGTH = 200;

function cleanName(value) {
    if (typeof value !== 'string') return null;
    const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
    return name || null;
}

function cleanId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : null;
}

// `list` as frozen `{ name, identityId }` records: at most
// BUILT_WITH_MAX_COUNT, each with a name or an identity, none twice (by
// identity, or by name for those without one), never the author.
export function normalizeBuiltWith(list, { authorIdentityId = null } = {}) {
    const result = [];
    const seen = new Set();
    for (const entry of Array.isArray(list) ? list : []) {
        if (!entry || typeof entry !== 'object') continue;
        const identityId = cleanId(entry.identityId);
        const name = cleanName(entry.name);
        if (!identityId && !name) continue;
        if (identityId && identityId === authorIdentityId) continue;
        const key = identityId ? `id:${identityId}` : `name:${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(Object.freeze({ name, identityId }));
        if (result.length >= BUILT_WITH_MAX_COUNT) break;
    }
    return Object.freeze(result);
}

// `list` with `builder` credited: a new identity is added at the end; one
// already there takes the newer name when it had none or a different one.
export function withBuilder(list, builder, { authorIdentityId = null } = {}) {
    const current = normalizeBuiltWith(list, { authorIdentityId });
    const identityId = cleanId(builder?.identityId);
    const name = cleanName(builder?.name);
    if (!identityId && !name) return current;
    const index = identityId ? current.findIndex((entry) => entry.identityId === identityId) : -1;
    if (index >= 0) {
        if (!name || current[index].name === name) return current;
        const next = [...current];
        next[index] = { name, identityId };
        return normalizeBuiltWith(next, { authorIdentityId });
    }
    return normalizeBuiltWith([...current, { name, identityId }], { authorIdentityId });
}

// Whether two credit lists say the same.
export function sameBuiltWith(a, b) {
    const left = normalizeBuiltWith(a);
    const right = normalizeBuiltWith(b);
    return left.length === right.length && left.every((entry, i) => entry.name === right[i].name && entry.identityId === right[i].identityId);
}
