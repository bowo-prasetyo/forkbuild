// 0.9.525 — Repository Discovery & Material Trust Product Reassessment,
// Section G (Trust-Language Review).
//
// docs/Principles.md, 0.2.95, "Ownership Is A Cryptographic Identity
// Fact, Never A Free-Text Label, When One Is Available" drew this exact
// line for DOCUMENT ownership: `DocumentMetadata.author` is "a plain
// string since 0.1.17 — chosen at login, never verified, never bound to
// a key... two people who both typed the display name 'Alice' would
// otherwise both look like the owner." That milestone's fix
// (`authorIdentityId`) was scoped to authorization, the one place the
// distinction was consequential at the time.
//
// ui/views/AuthorView.js (unmodified in shape since 0.2.31) draws a
// Repository page from the SAME kind of free-text label —
// `publisher/Publication.js#author` — and titles it with nothing more
// than that string: `<h1>{{ author }}</h1>`, followed by "N
// publication(s)" and an "Original Works & Forks" lineage graph. Under
// 0.9.339's own merged (local + decentralized) discovery composition,
// the publications AuthorView groups under one name can now originate
// from genuinely different signing identities — a peer, a Nostr relay,
// an Arweave transaction, or a World Encounter admission, each
// self-declaring whatever `author` string its own publisher chose. Two
// different `publisherIdentity.id` values sharing one typed name is
// exactly 0.2.95's own scenario, now reachable on a page whose entire
// premise is "here is one author's work."
//
// This module is the SAME kind of function 0.8.6's own
// derivePublicationEvidenceConvergence() already is, one concept over:
// detect a structural fact about a caller-supplied list, group it
// deterministically, and NEVER adjudicate which group is the "real"
// one. It never fetches, never resolves, never ranks, and never turns
// "different identity" into "impostor" — a legitimate collaborator, a
// coincidental namesake, and a spoofed name are structurally
// IDENTICAL from this function's own point of view, on purpose (see
// docs/Principles.md, "Known Evidence Is Not Verified Evidence, And
// Verified Evidence Is Not Authority" — this function reports evidence
// of divergence, never a verdict about who is genuine).
//
// Pure and stateless: no import of a discoveryProvider, a
// StorageProvider, or anything network-shaped. Safe to call as often as
// a caller likes.
export function derivePublicationAuthorNameIdentityConvergence({ author = null, publications = [] } = {}) {
    const list = Array.isArray(publications) ? publications : [];

    // Grouped by publisherIdentity.id alone — never by providerId,
    // documentId, or anything else, since the question this function
    // answers is specifically "how many distinct SIGNING IDENTITIES
    // chose to publish under this one typed name," never "how many
    // documents" or "how many providers."
    const groupsById = new Map();
    let unsignedCount = 0;
    for (const publication of list) {
        const identityId = publication && publication.publisherIdentity && publication.publisherIdentity.id
            ? publication.publisherIdentity.id
            : null;
        if (!identityId) {
            // No cryptographic identity to compare at all (a legacy,
            // pre-0.2.16 publication, or a provider with no signing
            // surface) — counted for transparency, but never treated as
            // "the same identity as" or "different from" any other
            // entry: the same NOT_COMPARED restraint
            // ContentBindingRelationship.js already applies one concept
            // over, for the identical reason — absence of evidence is
            // not evidence of agreement OR conflict.
            unsignedCount += 1;
            continue;
        }
        if (!groupsById.has(identityId)) {
            groupsById.set(identityId, []);
        }
        groupsById.get(identityId).push(publication.id);
    }

    const identityGroups = [...groupsById.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([identityId, publicationIds]) => ({ identityId, publicationIds }));

    return {
        author,
        publicationCount: list.length,
        unsignedPublicationCount: unsignedCount,
        identityGroups,
        distinctIdentityCount: identityGroups.length,
        // true the moment more than one DISTINCT, cryptographically
        // signed identity appears under this one typed name — structural
        // and symmetric, exactly like contentBindingConflict. Never set
        // by comparing the display name against anything: a name is
        // never itself evidence of, or against, a shared identity.
        nameIdentityConflict: identityGroups.length > 1
    };
}

// The one sentence this milestone adds to a screen, and the only place
// its wording lives — mirrors application/PublicationEvidenceConvergenceView.js's
// own describeContentBindingSetRelationship() one concept over: says
// only that the name is shared by more than one signing identity, and
// how many, never which one is the "real" author, never "impostor,"
// never "suspicious." `null` whenever there is nothing to say, so a
// caller can use its presence directly as "show the notice" without
// re-checking `nameIdentityConflict` itself.
export function describePublicationAuthorNameIdentityConvergence(convergence) {
    if (!convergence || !convergence.nameIdentityConflict) {
        return null;
    }
    const { author, distinctIdentityCount } = convergence;
    const label = author ? `"${author}"` : 'this name';
    return `${distinctIdentityCount} different signing identities have each published under the name ${label}. `
        + `A display name is self-chosen, not a verified identity — these may or may not be the same publisher.`;
}
