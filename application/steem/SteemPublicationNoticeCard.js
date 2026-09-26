import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';

// The card on a Signed Claim's Steem notice: the build's title and author
// (from the claim), its description (from the build) and a picture of it,
// uploaded to a Steem image host. Each part is optional and found on its own,
// so a build that can't be read still gets its title, and a picture that
// can't be drawn or uploaded (or whose signing is declined) leaves the rest.
//
//   loadSnapshotText(contentHash) -> the build's JSON text, or null
//   renderThumbnail(document)     -> Promise<Uint8Array> (a PNG)
//   uploadImage(bytes)            -> Promise<string> (its https address)
export function createSteemPublicationNoticeDescriber({ loadSnapshotText, renderThumbnail = null, uploadImage = null, documentSerializer = new DocumentSerializer(), warn = (...args) => console.warn(...args) }) {
    return async function describePublication(claim) {
        const card = { title: stringOrNull(claim?.title), author: stringOrNull(claim?.author), description: null, imageUrl: null };
        const contentHash = claim?.contentReference?.hash ?? claim?.contentHash ?? null;
        let document = null;
        try {
            const text = contentHash ? await loadSnapshotText(contentHash) : null;
            if (typeof text === 'string') document = documentSerializer.deserialize(JSON.parse(text));
        } catch (error) {
            warn('The Steem notice has no description or picture: the build could not be read.', error?.message ?? error);
        }
        if (!document) return card;
        card.description = stringOrNull(document.metadata?.description);
        if (typeof renderThumbnail !== 'function' || typeof uploadImage !== 'function') return card;
        try {
            const bytes = await renderThumbnail(document);
            card.imageUrl = await uploadImage(bytes);
        } catch (error) {
            warn('The Steem notice has no picture:', error?.message ?? error);
        }
        return card;
    };
}

function stringOrNull(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
