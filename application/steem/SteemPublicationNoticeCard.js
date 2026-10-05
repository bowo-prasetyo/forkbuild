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
//   onPictureMissing({ title, reason }) hears why a card that should have had
//                                 a picture has none, so the app can say so
//   chainName                     names the chain in console warnings
export function createSteemPublicationNoticeDescriber({ loadSnapshotText, renderThumbnail = null, uploadImage = null, onPictureMissing = null, chainName = 'Steem', documentSerializer = new DocumentSerializer(), warn = (...args) => console.warn(...args) }) {
    return async function describePublication(claim) {
        const card = { title: stringOrNull(claim?.title), author: stringOrNull(claim?.author), description: null, imageUrl: null };
        const pictureWanted = typeof renderThumbnail === 'function' && typeof uploadImage === 'function';
        const pictureMissing = (reason) => {
            if (!pictureWanted || typeof onPictureMissing !== 'function') return;
            try {
                onPictureMissing({ title: card.title, reason });
            } catch {
                // Hearing about it never stops the notice.
            }
        };
        const contentHash = claim?.contentReference?.hash ?? claim?.contentHash ?? null;
        let document = null;
        try {
            const text = contentHash ? await loadSnapshotText(contentHash) : null;
            if (typeof text === 'string') document = documentSerializer.deserialize(JSON.parse(text));
        } catch (error) {
            warn(`The ${chainName} notice has no description or picture: the build could not be read.`, error?.message ?? error);
        }
        if (!document) {
            pictureMissing('the build could not be read on this device');
            return card;
        }
        card.description = stringOrNull(document.metadata?.description);
        // The build's own tags, which a Blurt post lists after ForkBuild's.
        if (Array.isArray(document.metadata?.tags) && document.metadata.tags.length > 0) card.tags = [...document.metadata.tags];
        if (!pictureWanted) return card;
        try {
            const bytes = await renderThumbnail(document);
            card.imageUrl = await uploadImage(bytes);
        } catch (error) {
            warn(`The ${chainName} notice has no picture:`, error?.message ?? error);
            pictureMissing(String(error?.message ?? error));
        }
        return card;
    };
}

function stringOrNull(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
