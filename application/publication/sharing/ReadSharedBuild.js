import { ContentReference } from '../../../core/ContentReference.js';
import { DocumentSerializer } from '../../../serializer/DocumentSerializer.js';

// The bricks of a published build kept on this device, for the turning view
// a shared link opens on (ui/views/PublicationLinkView.js), and the whole
// build, for downloading it as a 3D model. Read from
// `contentStore` by the Publication's content hash, and used only when the
// bytes match it, as everywhere else a published build is read. Resolves to
// an array of Bricks (empty for a build of none), or null when the build
// can't be read. Never rejects.
export async function readSharedBuildBricks({ publication, contentStore, documentSerializer = new DocumentSerializer() }) {
    const document = await readSharedBuildDocument({ publication, contentStore, documentSerializer });
    return document ? bricksOfDocument(document) : null;
}

// Every brick of every building in `document`, as the turning view draws them.
export function bricksOfDocument(document) {
    const bricks = [];
    for (const building of document.world.getBuildings()) {
        bricks.push(...building.getBricks());
    }
    return bricks;
}

// The published build itself, as a Document, read and checked the same way;
// null when it can't be read. Never rejects.
export async function readSharedBuildDocument({ publication, contentStore, documentSerializer = new DocumentSerializer() }) {
    try {
        const hash = publication?.contentReference?.hash ?? publication?.contentHash;
        if (!hash || !contentStore) return null;
        const reference = new ContentReference({ hash });
        let bytes = await contentStore.get(reference);
        if (bytes && typeof bytes !== 'string') bytes = new TextDecoder().decode(bytes);
        if (typeof bytes !== 'string' || !reference.verify(bytes)) return null;
        return documentSerializer.deserialize(JSON.parse(bytes));
    } catch {
        return null;
    }
}
