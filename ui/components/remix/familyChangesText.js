import { remixChangesText } from '../../i18n/buildDescriptionText.js';

// What each remix in `families` (core/publication/RemixFamily.js's) changed
// from the build above it, as text for RemixFamilyTree's `changes`: one Map
// over every family, document id to text. Empty when `describer` (an
// application/publication/BuildDescriber.js) is missing. Never rejects.
export async function familyChangesText(describer, families, { contentStore = null } = {}) {
    const texts = new Map();
    if (!describer) return texts;
    for (const family of families || []) {
        let changes;
        try {
            changes = await describer.familyChanges(family, { contentStore });
        } catch {
            continue;
        }
        for (const [documentId, change] of changes) {
            const text = remixChangesText(change, { lead: false });
            if (text) texts.set(documentId, text);
        }
    }
    return texts;
}
