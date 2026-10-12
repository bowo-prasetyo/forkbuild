// Whose a build is, as World View credits it (docs/reviews/CreativeDirection-2026-10-12b.md,
// finding 5): one name wherever it is shown — the hover card's "by …", the
// inspection's Author and the placement's Owner — instead of "Author
// anonymous" two lines above "Owner Ana". The Publication's signed author
// first, then whoever placed the build, then the name in the build itself.
// Null when none is known: the caller says "anonymous" in the reader's
// language.
export function buildCreditName({ publicationAuthor = null, placementOwner = null, documentAuthor = null } = {}) {
    for (const name of [publicationAuthor, placementOwner, documentAuthor]) {
        if (typeof name === 'string' && name.trim() && name.trim() !== 'anonymous') return name.trim();
    }
    return null;
}
